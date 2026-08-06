"""Загрузка Excel в проект E3.

Порядок операций важен и повторяет проверенную версию:

1. Лист «Листы»: рамки (форматы) и, если разрешено, виды листов. Делается
   первым — от формата зависит, куда влезут символы, а от вида зависит, какой
   лист вообще считается своим.
2. Строки листа «Изделия»: найти или создать изделие, записать атрибуты.
3. Листы «Схема» и «Подвал» (или старая общая «Размещения») — посимвольное
   размещение; если их нет, координаты берутся с основного листа.
4. Лист «Соединения» — провода создаются **после** размещения символов, иначе
   привязываться будет не к чему: логическую связь E3 устанавливает сам по факту
   касания вывода.

Лист определяется парой «имя + вид» либо своим ID: у ФСА и схемы соединений
одного узла имя листа одинаковое, и без вида изделие ушло бы не туда.

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
from .project import VIEW_ATTRIBUTE, Project
from .task import Context
from .util import Row, Table, compose_rotation, fmt


@dataclass
class ImportOptions:
    views: set[str] = field(default_factory=lambda: {"4", "5"})
    write_attributes: bool = True
    create_missing: bool = True
    place_symbols: bool = True
    create_connections: bool = False
    #: Применять рамку (формат) листа из Excel — столбец «Формат листа».
    apply_sheet_formats: bool = True
    #: Менять .PREFERRED_VIEW листа по Excel. По умолчанию нет: смена вида
    #: переопределяет назначение всего листа.
    apply_sheet_views: bool = False
    #: Создавать листы, которых в проекте нет (по таблице «Листы»).
    create_sheets: bool = False
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
    sheets_created: int = 0
    sheets_reformatted: int = 0
    sheets_reviewed: int = 0
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
        for name, table in tables.items():
            if name.strip().lower() in cols.SERVICE_SHEET_NAMES:
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

    placement_tables = _placement_tables(tables, devices_table)
    if options.place_symbols:
        if placement_tables:
            listed = ", ".join(f"«{table.name}» ({len(table)})" for table in placement_tables)
            log.info(f"Таблицы размещений: {listed} — размещаю посимвольно по ним.")
        else:
            log.info(
                "Отдельных таблиц размещения в файле нет — координаты беру "
                f"с листа «{devices_table.name}»."
            )

    attribute_headers = cols.attribute_headers_of(devices_table.headers)

    # --- шаг 0: листы (рамки и виды) ------------------------------------------
    _apply_sheets(project, tables, devices_table, placement_tables, options, context, stats)

    # --- шаг 1: изделия -------------------------------------------------------
    _apply_devices(
        project, devices_table, attribute_headers, options, context, stats, bool(placement_tables)
    )

    # --- шаг 2: размещения ----------------------------------------------------
    if options.place_symbols and not stats.stopped:
        for table in placement_tables:
            if stats.stopped:
                break
            _apply_placements(project, table, options, context, stats)

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
    changed = (
        stats.created
        + stats.updated
        + stats.placed
        + stats.moved
        + stats.connections_made
        + stats.sheets_created
        + stats.sheets_reformatted
        + stats.sheets_reviewed
    )
    if options.save_project and not options.dry_run and changed:
        if project.app.save():
            log.info("Проект сохранён.")
        else:
            log.warn("Сохранить проект не удалось.")

    _log_summary(context, options, stats)
    return stats


# ------------------------------------------------------------------------------
#  Выбор таблиц книги
# ------------------------------------------------------------------------------
def _placement_tables(tables: dict[str, Table], devices_table: Table) -> list[Table]:
    """Все таблицы книги, которые описывают размещение символов.

    Сначала — известные по имени: «Схема», «Подвал» и старая общая «Размещения».
    Затем любые другие листы с номером символа и координатами: так работает файл,
    где пользователь развёл размещения по своим вкладкам.
    """
    result: list[Table] = []
    taken: set[int] = {id(devices_table)}

    def suitable(table: Table) -> bool:
        return (
            table.has_column(cols.H_POZ)
            and table.has_column(cols.H_X)
            and table.has_column(cols.H_Y)
        )

    for name in cols.PLACEMENT_SHEET_ORDER:
        table = find_table(tables, name)
        if table is not None and id(table) not in taken and suitable(table):
            result.append(table)
            taken.add(id(table))

    skip = {cols.SHEET_CONNECTIONS.lower(), cols.SHEET_SHEETS.lower(), cols.SHEET_DEVICES.lower()}
    for name, table in tables.items():
        if id(table) in taken or name.strip().lower() in skip:
            continue
        if table.has_column(cols.H_SYM_NR) and suitable(table):
            result.append(table)
            taken.add(id(table))
    return result


# ------------------------------------------------------------------------------
#  Шаг 0: листы — рамки (форматы) и виды
# ------------------------------------------------------------------------------
def _apply_sheets(
    project: Project,
    tables: dict[str, Table],
    devices_table: Table,
    placement_tables: list[Table],
    options: ImportOptions,
    context: Context,
    stats: ImportStats,
) -> None:
    """Применяет к листам проекта то, что написано о них в книге.

    Формат листа — это имя символа рамки (Sheet.SetFormat). Менять его из Excel
    безопасно: содержимое листа остаётся на месте, меняется только рамка.
    Вид (.PREFERRED_VIEW) переопределяет назначение всего листа, поэтому он
    применяется только по отдельному разрешению.
    """
    log = context.log
    if not options.apply_sheet_formats and not options.apply_sheet_views and not options.create_sheets:
        return

    sheet = project.app.sheet()
    handled: set[int] = set()
    table = find_table(tables, cols.SHEET_SHEETS)

    if table is not None:
        log.info(f"Лист «{table.name}»: строк {len(table)} — рамки и виды листов")
        for row in table.rows:
            name = row.text(cols.H_SHEET)
            sheet_id = row.integer(cols.H_SHEET_ID, 0)
            view = row.text(cols.H_VIEW)
            wanted_format = row.text(cols.H_FORMAT)
            target = project.find_sheet(name, sheet_id, view)

            if target <= 0:
                _create_sheet(project, sheet, name, view, wanted_format, options, stats, log, row)
                continue
            if wanted_format:
                # Формат решён здесь — строки элементов по этому листу не спорят.
                handled.add(target)
            _apply_one_sheet(
                project, sheet, target, view, wanted_format, options, stats, log, source=table.name
            )

    # Формат мог быть исправлен прямо в строке элемента — это тоже учитываем.
    if options.apply_sheet_formats:
        for source in [devices_table, *placement_tables, find_table(tables, cols.SHEET_CONNECTIONS)]:
            if source is None or not source.has_column(cols.H_FORMAT):
                continue
            for sheet_id, wanted_format in _formats_from_rows(project, source, log).items():
                if sheet_id in handled:
                    continue
                handled.add(sheet_id)
                _apply_one_sheet(
                    project, sheet, sheet_id, "", wanted_format, options, stats, log,
                    source=source.name,
                )


def _formats_from_rows(project: Project, table: Table, log: Any) -> dict[int, str]:
    """Собирает «лист -> формат» из строк таблицы, ругаясь на противоречия."""
    result: dict[int, str] = {}
    conflicts: set[int] = set()
    for row in table.rows:
        wanted = row.text(cols.H_FORMAT)
        if not wanted:
            continue
        sheet_id = project.find_sheet(
            row.text(cols.H_SHEET), row.integer(cols.H_SHEET_ID, 0), row.text(cols.H_VIEW)
        )
        if sheet_id <= 0:
            continue
        current = result.get(sheet_id)
        if current is None:
            result[sheet_id] = wanted
        elif current != wanted and sheet_id not in conflicts:
            conflicts.add(sheet_id)
            log.warn(
                f"  лист «{project.sheet_name_of(sheet_id)}»: в таблице «{table.name}» указаны "
                f"разные форматы («{current}» и «{wanted}») — беру первый."
            )
    return result


def _apply_one_sheet(
    project: Project,
    sheet: Any,
    sheet_id: int,
    view: str,
    wanted_format: str,
    options: ImportOptions,
    stats: ImportStats,
    log: Any,
    source: str,
) -> None:
    info = project.sheet_info(sheet_id)
    if info is None:
        return

    if options.apply_sheet_formats and wanted_format and wanted_format != info.fmt:
        if options.dry_run:
            log.detail(
                f"  проверка: лист «{info.name}» — рамка «{info.fmt or '-'}» -> «{wanted_format}»"
            )
        elif not e3api.set_id(sheet, sheet_id):
            stats.errors += 1
        elif e3api.set_sheet_format(sheet, wanted_format):
            info.fmt = wanted_format
            stats.sheets_reformatted += 1
            log.info(
                f"  лист «{info.name}» (ID {sheet_id}): формат «{wanted_format}» "
                f"применён (из «{source}»)"
            )
        else:
            stats.errors += 1
            log.warn(
                f"  лист «{info.name}»: формат «{wanted_format}» применить не удалось — "
                "проверьте, что рамка с таким именем есть в библиотеке."
            )

    if options.apply_sheet_views and view and view != info.view:
        if options.dry_run:
            log.detail(f"  проверка: лист «{info.name}» — вид {info.view or '-'} -> {view}")
            return
        if not e3api.set_id(sheet, sheet_id):
            stats.errors += 1
            return
        if e3api.set_attribute(sheet, VIEW_ATTRIBUTE, view):
            log.info(
                f"  лист «{info.name}» (ID {sheet_id}): {VIEW_ATTRIBUTE} "
                f"{info.view or '-'} -> {view}"
            )
            project.update_sheet_view(sheet_id, view)
            stats.sheets_reviewed += 1
        else:
            stats.errors += 1
            log.warn(f"  лист «{info.name}»: вид {view} записать не удалось.")


def _create_sheet(
    project: Project,
    sheet: Any,
    name: str,
    view: str,
    wanted_format: str,
    options: ImportOptions,
    stats: ImportStats,
    log: Any,
    row: Row,
) -> None:
    if not options.create_sheets:
        log.warn(
            f"  [{row.number}] листа «{name}» (вид {view or '-'}) в проекте нет, "
            "создание листов отключено."
        )
        return
    if not name or not wanted_format:
        log.warn(
            f"  [{row.number}] лист не создан: нужны и имя, и формат "
            f"(имя «{name}», формат «{wanted_format}»)."
        )
        return
    if options.dry_run:
        log.detail(f"  проверка: был бы создан лист «{name}» с рамкой «{wanted_format}»")
        return
    new_id = e3api.create_sheet(sheet, name, wanted_format)
    if new_id <= 0:
        stats.errors += 1
        log.warn(f"  лист «{name}» создать не удалось (рамка «{wanted_format}»).")
        return
    if view:
        e3api.set_id(sheet, new_id)
        e3api.set_attribute(sheet, VIEW_ATTRIBUTE, view)
    project.remember_new_sheet(new_id, name, view, wanted_format)
    stats.sheets_created += 1
    log.info(f"  создан лист «{name}» (ID {new_id}, вид {view or '-'}, рамка «{wanted_format}»)")


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
    has_placement_tables: bool,
) -> None:
    log = context.log
    total = len(table)
    place_from_main = options.place_symbols and not has_placement_tables

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
                view=row.text(cols.H_VIEW),
                x=row.num(cols.H_X),
                y=row.num(cols.H_Y),
                rotation=compose_rotation(row.text(cols.H_ROT), row.text(cols.H_MIRROR)),
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
    log.info(f"Размещение по таблице «{table.name}»: строк {total}")
    for index, row in enumerate(table.rows, start=1):
        if context.stopped():
            stats.stopped = True
            log.info("Размещение прервано пользователем.")
            return
        if index % 20 == 0 or index == total:
            context.progress(index, total, f"размещение символов ({table.name})")
            project.app.breathe()

        poz = row.text(cols.H_POZ)
        if not poz:
            continue
        device_id = project.find_device(poz)
        if device_id <= 0:
            log.detail(f"[{table.name} {row.number}] изделие не найдено: {poz}")
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
            view=row.text(cols.H_VIEW),
            x=row.num(cols.H_X),
            y=row.num(cols.H_Y),
            rotation=compose_rotation(row.text(cols.H_ROT), row.text(cols.H_MIRROR)),
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
    view: str,
    x: float | None,
    y: float | None,
    rotation: str,
) -> None:
    """Ставит или переносит один символ изделия в заданную точку листа."""
    if x is None or y is None:
        log.detail(f"  {poz}: размещение пропущено — не заданы координаты")
        return

    target_sheet = project.find_allowed_sheet(sheet_name, sheet_id, view)
    if target_sheet <= 0:
        if not sheet_name and not sheet_id:
            log.warn(f"  {poz}: размещение пропущено — не задан лист.")
        else:
            views = ", ".join(sorted(options.views)) if options.views else "все"
            log.warn(
                f"  {poz}: лист «{sheet_name}» (ID {sheet_id}, вид {view or '-'}) не найден "
                f"среди выбранных видов {{{views}}}."
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

    for index, (number, points, types, sheet_name, sheet_id, view) in enumerate(groups, start=1):
        if context.stopped():
            stats.stopped = True
            log.info("Создание соединений прервано пользователем.")
            return
        if index % 10 == 0 or index == total:
            context.progress(index, total, "создание соединений")
            project.app.breathe()

        target_sheet = project.find_allowed_sheet(sheet_name, sheet_id, view)
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
) -> list[tuple[str, list[tuple[float, float]], list[int], str, int, str]]:
    """Собирает точки одного провода в ломаную, сохраняя порядок следования."""
    groups: list[tuple[str, list[tuple[float, float]], list[int], str, int, str]] = []
    current_number: str | None = None
    points: list[tuple[float, float]] = []
    types: list[int] = []
    sheet_name = ""
    sheet_id = 0
    view = ""

    def flush() -> None:
        if current_number is not None and len(points) >= 2:
            groups.append((current_number, list(points), list(types), sheet_name, sheet_id, view))

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
            view = row.text(cols.H_VIEW)
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
    if stats.sheets_created or stats.sheets_reformatted or stats.sheets_reviewed:
        log.info(
            f"Листы: создано {stats.sheets_created}, "
            f"сменили формат {stats.sheets_reformatted}, "
            f"сменили вид {stats.sheets_reviewed}"
        )
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
