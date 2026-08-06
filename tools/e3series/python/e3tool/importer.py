"""Загрузка Excel в проект E3.

Порядок операций важен и повторяет проверенную версию:

1. Строки листа «Изделия»: найти или создать изделие, записать атрибуты.
2. Лист «Размещения» (если есть) — посимвольное размещение; иначе координаты
   берутся из основного листа.
3. Лист «Соединения» — провода создаются **после** размещения символов, иначе
   привязываться будет не к чему: логическую связь E3 устанавливает сам по факту
   касания вывода.

Что через COM-интерфейс сделать нельзя (на 23.20): заменить компонент у
существующего изделия, переименовать обозначение, удалить с перекоммутацией.
Для этого нужен ProjectConfigurator, он появился в TLB 26.00 — E3.series 2025.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from typing import Any

from . import columns as cols
from . import e3api
from .excel_io import find_table
from .project import Project
from .task import Context
from .util import Row, Table, fmt


@dataclass
class ImportOptions:
    views: set[str] = field(default_factory=lambda: {"4"})
    write_attributes: bool = True
    create_missing: bool = True
    place_symbols: bool = True
    create_connections: bool = False
    save_project: bool = False
    dry_run: bool = False


@dataclass
class ImportStats:
    created: int = 0
    updated: int = 0
    placed: int = 0
    moved: int = 0
    unverified: int = 0
    bad_coordinates: int = 0
    connections_made: int = 0
    connections_failed: int = 0
    skipped: int = 0
    errors: int = 0
    no_component: int = 0
    components_without_symbol: Counter = field(default_factory=Counter)
    stopped: bool = False


def run_import(
    project: Project, tables: dict[str, Table], options: ImportOptions, context: Context
) -> ImportStats:
    """Применяет книгу к проекту. Возвращает сводку по итогам."""
    log = context.log
    stats = ImportStats()

    log.rule()
    if options.dry_run:
        log.info("Импорт: ТОЛЬКО ПРОВЕРКА, проект не изменяется")
    else:
        log.info("Импорт в проект")
    views = ", ".join(sorted(options.views)) if options.views else "все листы"
    log.info(f"Целевые листы: {{{views}}} ({len(project.allowed_sheet_ids)} шт.)")

    devices_table = find_table(tables, cols.SHEET_DEVICES)
    if devices_table is None:
        # Лист мог называться иначе (в старом шаблоне он «Devices»): берём первый,
        # где есть столбец с обозначением, а служебные листы не трогаем.
        service = {cols.SHEET_PLACEMENTS.lower(), cols.SHEET_CONNECTIONS.lower()}
        for name, table in tables.items():
            if name.strip().lower() in service:
                continue
            if table.has_column(cols.H_POZ):
                devices_table = table
                break
    if devices_table is None:
        log.warn("В файле нет листов с данными.")
        return stats
    log.info(f"Лист изделий: «{devices_table.name}», строк данных: {len(devices_table)}")

    if not devices_table.has_column(cols.H_POZ):
        log.warn(f"В шапке нет столбца «{cols.H_POZ}» — импорт невозможен.")
        return stats

    placements_table = find_table(tables, cols.SHEET_PLACEMENTS)
    if placements_table is not None and not placements_table.has_column(cols.H_POZ):
        log.warn(
            f"На листе «{cols.SHEET_PLACEMENTS}» нет столбца «{cols.H_POZ}» — "
            "размещаю по основному листу."
        )
        placements_table = None
    if options.place_symbols and placements_table is not None:
        log.info(
            f"Лист «{cols.SHEET_PLACEMENTS}»: строк {len(placements_table)} — "
            "размещение пойдёт по нему, посимвольно."
        )

    attribute_headers = cols.attribute_headers_of(devices_table.headers)

    # --- шаг 1: изделия -------------------------------------------------------
    _apply_devices(
        project, devices_table, attribute_headers, options, context, stats, placements_table
    )

    # --- шаг 2: размещения ----------------------------------------------------
    if options.place_symbols and placements_table is not None and not stats.stopped:
        _apply_placements(project, placements_table, options, context, stats)

    # --- шаг 3: провода -------------------------------------------------------
    if options.create_connections and not stats.stopped:
        connections_table = find_table(tables, cols.SHEET_CONNECTIONS)
        if connections_table is None:
            log.info(f"Лист «{cols.SHEET_CONNECTIONS}» в файле не найден — провода не создаются.")
        elif not connections_table.has_column(cols.H_CONN_NR):
            log.warn(f"На листе «{cols.SHEET_CONNECTIONS}» нет нужных столбцов — пропускаю.")
        else:
            _apply_connections(project, connections_table, options, context, stats)

    # --- завершение -----------------------------------------------------------
    changed = stats.created + stats.updated + stats.placed + stats.moved + stats.connections_made
    if options.save_project and not options.dry_run and changed:
        if project.app.save():
            log.info("Проект сохранён.")
        else:
            log.warn("Сохранить проект не удалось.")

    _log_summary(context, options, stats)
    return stats


# ------------------------------------------------------------------------------
#  Шаг 1: изделия и атрибуты
# ------------------------------------------------------------------------------
def _apply_devices(
    project: Project,
    table: Table,
    attribute_headers: list[str],
    options: ImportOptions,
    context: Context,
    stats: ImportStats,
    placements_table: Table | None,
) -> None:
    log = context.log
    total = len(table)
    place_from_main = options.place_symbols and placements_table is None

    for index, row in enumerate(table.rows, start=1):
        if context.stopped():
            stats.stopped = True
            stats.skipped += total - index + 1
            log.info("Импорт прерван пользователем.")
            return
        if index % 20 == 0 or index == total:
            context.progress(index, total, "обработка строк")
            # Пауза между пачками: E3 успевает обработать свою очередь и не
            # выглядит зависшей, пока мы шлём тысячи вызовов.
            project.app.breathe()

        poz = row.text(cols.H_POZ)
        if not poz:
            continue
        component = row.text(cols.H_COMP)
        device_id = project.find_device(poz)

        if device_id <= 0:
            if not options.create_missing:
                stats.skipped += 1
                log.detail(f"[{row.number}] в проекте нет, создание отключено: {poz}")
                continue
            device_id = _create_device(project, poz, component, row, attribute_headers, options, stats, log)
            if device_id > 0 or options.dry_run:
                stats.created += 1
            else:
                stats.errors += 1
                continue
        else:
            if options.write_attributes:
                if _write_attributes(project, device_id, row, attribute_headers, options, log):
                    stats.updated += 1
                else:
                    stats.errors += 1
            if component:
                _warn_component_mismatch(project, device_id, poz, component, log)

        if place_from_main and device_id > 0:
            _place_one(
                project,
                options,
                stats,
                log,
                device_id=device_id,
                poz=poz,
                wanted_symbol_id=row.integer(cols.H_SYM_ID, 0),
                symbol_nr=1,
                sheet_name=row.text(cols.H_SHEET),
                sheet_id=row.integer(cols.H_SHEET_ID, 0),
                x=row.num(cols.H_X),
                y=row.num(cols.H_Y),
                rotation=row.text(cols.H_ROT),
            )


def _create_device(
    project: Project,
    poz: str,
    component: str,
    row: Row,
    attribute_headers: list[str],
    options: ImportOptions,
    stats: ImportStats,
    log: Any,
) -> int:
    if not component:
        stats.no_component += 1
        log.detail(f"  {poz}: не задан ComponentName — изделие не создано.")
        return 0
    if options.dry_run:
        log.detail(f"  проверка: {poz} было бы создано из компонента «{component}»")
        return 0

    device = project.app.device()
    if not e3api.create_device(device, poz, component):
        log.warn(f"  {poz}: создать изделие из «{component}» не удалось.")
        return 0

    values = {cols.H_POZ: poz}
    for header in attribute_headers:
        value = row.text(header)
        if value:
            values[header] = value
    e3api.set_attributes(device, values)

    new_id = e3api.device_id(device)
    if new_id > 0:
        project.remember_new_device(new_id, poz)
    else:
        # GetId недоступен — перечитываем список изделий, иначе размещать нечего.
        project.load_devices()
        new_id = project.find_device(poz)
    log.detail(f"[{row.number}] создано: {poz}")
    return new_id


def _write_attributes(
    project: Project,
    device_id: int,
    row: Row,
    attribute_headers: list[str],
    options: ImportOptions,
    log: Any,
) -> bool:
    if options.dry_run:
        return True
    values = {}
    for header in attribute_headers:
        value = row.text(header)
        if value:
            values[header] = value
    if not values:
        return True
    device = project.app.device()
    if not e3api.set_id(device, device_id):
        return False
    written, failed = e3api.set_attributes(device, values)
    for name in failed:
        log.detail(f"    атрибут «{name}» не записан")
    return written > 0


def _warn_component_mismatch(
    project: Project, device_id: int, poz: str, component: str, log: Any
) -> None:
    device = project.app.device()
    if not e3api.set_id(device, device_id):
        return
    current = e3api.device_component(device)
    if current and current != component:
        log.detail(
            f"  {poz}: компонент в проекте «{current}», в Excel «{component}» — "
            "замена компонента через API не выполняется."
        )


# ------------------------------------------------------------------------------
#  Шаг 2: размещение символов
# ------------------------------------------------------------------------------
def _apply_placements(
    project: Project,
    table: Table,
    options: ImportOptions,
    context: Context,
    stats: ImportStats,
) -> None:
    log = context.log
    total = len(table)
    for index, row in enumerate(table.rows, start=1):
        if context.stopped():
            stats.stopped = True
            log.info("Размещение прервано пользователем.")
            return
        if index % 20 == 0 or index == total:
            context.progress(index, total, "размещение символов")
            project.app.breathe()

        poz = row.text(cols.H_POZ)
        if not poz:
            continue
        device_id = project.find_device(poz)
        if device_id <= 0:
            log.detail(f"[разм. {row.number}] изделие не найдено: {poz}")
            stats.errors += 1
            continue
        _place_one(
            project,
            options,
            stats,
            log,
            device_id=device_id,
            poz=poz,
            wanted_symbol_id=row.integer(cols.H_SYM_ID, 0),
            symbol_nr=row.integer(cols.H_SYM_NR, 1),
            sheet_name=row.text(cols.H_SHEET),
            sheet_id=row.integer(cols.H_SHEET_ID, 0),
            x=row.num(cols.H_X),
            y=row.num(cols.H_Y),
            rotation=row.text(cols.H_ROT),
        )


def _place_one(
    project: Project,
    options: ImportOptions,
    stats: ImportStats,
    log: Any,
    *,
    device_id: int,
    poz: str,
    wanted_symbol_id: int,
    symbol_nr: int,
    sheet_name: str,
    sheet_id: int,
    x: float | None,
    y: float | None,
    rotation: str,
) -> None:
    """Ставит или переносит один символ изделия в заданную точку листа."""
    if x is None or y is None:
        log.detail(f"  {poz}: размещение пропущено — не заданы координаты")
        return

    target_sheet = project.find_allowed_sheet(sheet_name, sheet_id)
    if target_sheet <= 0:
        if not sheet_name and not sheet_id:
            log.warn(f"  {poz}: размещение пропущено — не задан лист.")
        else:
            views = ", ".join(sorted(options.views)) if options.views else "все"
            log.warn(
                f"  {poz}: лист «{sheet_name}» (ID {sheet_id}) не найден среди выбранных "
                f"видов {{{views}}}."
            )
        stats.errors += 1
        return

    device = project.app.device()
    if not e3api.set_id(device, device_id):
        stats.errors += 1
        return
    symbol_ids = e3api.device_symbol_ids(device, 0, project.app.probe)
    if not symbol_ids:
        component = e3api.device_component(device) or "(без компонента)"
        stats.components_without_symbol[component] += 1
        log.detail(f"  {poz}: у изделия нет символов (компонент «{component}»)")
        stats.errors += 1
        return

    symbol_id = 0
    if wanted_symbol_id in symbol_ids:
        symbol_id = wanted_symbol_id
    elif 1 <= symbol_nr <= len(symbol_ids):
        symbol_id = symbol_ids[symbol_nr - 1]
    if symbol_id <= 0:
        log.warn(f"  {poz}: символ №{symbol_nr} не найден (символов у изделия {len(symbol_ids)}).")
        stats.errors += 1
        return

    if options.dry_run:
        log.detail(
            f"  проверка: {poz} символ №{symbol_nr} -> лист «{project.sheet_name_of(target_sheet)}» "
            f"({fmt(x)}, {fmt(y)}), данные корректны"
        )
        return

    symbol = project.app.symbol()
    if not e3api.set_id(symbol, symbol_id):
        stats.errors += 1
        return

    before = e3api.symbol_location(symbol, project.app.probe)
    was_placed = before is not None and before.placed

    state, after = e3api.symbol_move(
        symbol, target_sheet, x, y, rotation, project.app.probe
    )
    if state == e3api.PLACE_FAILED and after is None:
        log.warn(f"  {poz}: разместить не удалось.")
        stats.errors += 1
        return
    if state == e3api.PLACE_FAILED:
        stats.bad_coordinates += 1
        log.warn(
            f"  {poz} символ №{symbol_nr}: после записи прочитано "
            f"({fmt(after.x)}, {fmt(after.y)}) вместо ({fmt(x)}, {fmt(y)})."
        )
        return

    if was_placed:
        stats.moved += 1
        origin = f"({fmt(before.x)}, {fmt(before.y)}) -> " if before else ""
        log.detail(f"  перемещён {poz} символ №{symbol_nr}: {origin}({fmt(x)}, {fmt(y)})")
    else:
        stats.placed += 1
        log.detail(
            f"  размещён {poz} символ №{symbol_nr} на «{project.sheet_name_of(target_sheet)}» "
            f"({fmt(x)}, {fmt(y)})"
        )
    if state == e3api.PLACE_UNVERIFIED:
        # Обычное дело для gate: позиция не перечитывается, но запись прошла.
        stats.unverified += 1


# ------------------------------------------------------------------------------
#  Шаг 3: провода
# ------------------------------------------------------------------------------
def _apply_connections(
    project: Project,
    table: Table,
    options: ImportOptions,
    context: Context,
    stats: ImportStats,
) -> None:
    log = context.log
    groups = _group_points(table)
    total = len(groups)
    connection = project.app.connection()
    if connection is None and not options.dry_run:
        log.warn("Объект соединения создать не удалось — провода пропускаю.")
        return

    for index, (number, points, types, sheet_name, sheet_id) in enumerate(groups, start=1):
        if context.stopped():
            stats.stopped = True
            log.info("Создание соединений прервано пользователем.")
            return
        if index % 10 == 0 or index == total:
            context.progress(index, total, "создание соединений")
            project.app.breathe()

        target_sheet = project.find_allowed_sheet(sheet_name, sheet_id)
        if target_sheet <= 0:
            stats.connections_failed += 1
            if stats.connections_failed <= 5:
                log.warn(f"  соединение {number}: лист «{sheet_name}» не найден")
            continue
        if options.dry_run:
            log.detail(
                f"  проверка: соединение {number} из {len(points)} точек на листе «{sheet_name}»"
            )
            continue

        if e3api.create_connection(connection, target_sheet, points, types, project.app.probe):
            stats.connections_made += 1
            if stats.connections_made == 1:
                log.info(f"Соединения создаются методом: {project.app.probe.connection}")
        else:
            stats.connections_failed += 1
            if stats.connections_failed <= 5:
                log.detail(
                    f"  соединение {number} ({len(points)} точек, лист «{sheet_name}») не создано"
                )


def _group_points(
    table: Table,
) -> list[tuple[str, list[tuple[float, float]], list[int], str, int]]:
    """Собирает точки одного провода в ломаную, сохраняя порядок следования."""
    groups: list[tuple[str, list[tuple[float, float]], list[int], str, int]] = []
    current_number: str | None = None
    points: list[tuple[float, float]] = []
    types: list[int] = []
    sheet_name = ""
    sheet_id = 0

    def flush() -> None:
        if current_number is not None and len(points) >= 2:
            groups.append((current_number, list(points), list(types), sheet_name, sheet_id))

    for row in table.rows:
        number = row.text(cols.H_CONN_NR)
        if not number:
            continue
        if number != current_number:
            flush()
            current_number = number
            points = []
            types = []
            sheet_name = row.text(cols.H_SHEET)
            sheet_id = row.integer(cols.H_SHEET_ID, 0)
        x = row.num(cols.H_X)
        y = row.num(cols.H_Y)
        if x is None or y is None:
            continue
        points.append((x, y))
        types.append(row.integer(cols.H_POINT_TYPE, 0))
    flush()
    return groups


# ------------------------------------------------------------------------------
#  Сводка
# ------------------------------------------------------------------------------
def _log_summary(context: Context, options: ImportOptions, stats: ImportStats) -> None:
    log = context.log
    log.info("-" * 52)
    log.info(f"Создано изделий: {stats.created}")
    log.info(f"Обновлено изделий: {stats.updated}")
    if options.place_symbols:
        log.info(f"Размещено символов: {stats.placed}")
        log.info(f"Перемещено символов: {stats.moved}")
        if stats.unverified:
            log.info(
                f"Из них позиция не перечитывается (gate): {stats.unverified} — это не ошибка."
            )
        if stats.bad_coordinates:
            log.warn(f"Координаты не совпали после записи: {stats.bad_coordinates}")
    if options.create_connections:
        log.info(f"Создано соединений: {stats.connections_made}")
        if stats.connections_failed:
            log.info(f"Соединений не создано: {stats.connections_failed}")
    if stats.skipped:
        log.info(f"Пропущено строк: {stats.skipped}")
    if stats.errors:
        log.info(f"Ошибок: {stats.errors}")
    if stats.no_component:
        log.info(f"Не создано из-за пустого ComponentName: {stats.no_component} строк")
    if stats.components_without_symbol:
        top = stats.components_without_symbol.most_common(8)
        listed = "; ".join(f"«{name}» x {count}" for name, count in top)
        tail = ""
        if len(stats.components_without_symbol) > 8:
            tail = f", и ещё {len(stats.components_without_symbol) - 8} компонентов"
        log.info(f"У компонентов нет схемного символа, размещать нечего: {listed}{tail}")
    log.rule()
