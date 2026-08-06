"""Выгрузка проекта в Excel.

Порядок работы повторяет проверенную HTA-версию, потому что он не случайный:

1. Обход объектов проекта. Device.GetSymbolIds — единственная связь
   «изделие -> символ», которая есть в API, поэтому сначала строится обратная
   карта «символ -> изделие».
2. Обход листов. Здесь ловятся символы, не попавшие в карту (для них работает
   опознание по надписи) и собираются провода.
3. Чтение атрибутов изделий и сборка строк.

Координаты берутся из Symbol.GetSchemaLocation. Habr-совет «использовать
GetArea» — как раз та ошибка, из-за которой старый экспорт выдавал одну и ту же
точку для всех символов: GetArea возвращает габарит в локальной системе символа.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from . import columns as cols
from . import e3api
from .excel_io import SheetData
from .project import Project
from .task import Context
from .util import strip_dash


@dataclass
class ExportOptions:
    views: set[str] = field(default_factory=lambda: {"4"})
    with_placements: bool = True
    with_connections: bool = True
    only_placed: bool = False
    #: Мягкое опознание символа по атрибутам-тегам. Точное совпадение работает всегда.
    loose_text_match: bool = True


@dataclass
class ExportStats:
    devices: int = 0
    skipped: int = 0
    symbols_seen: int = 0
    placements: int = 0
    placed_devices: int = 0
    matched_by_text: int = 0
    symbols_without_device: int = 0
    segments: int = 0
    points: int = 0
    stopped: bool = False


@dataclass
class _Placement:
    """Найденное положение символа."""

    device_id: int
    symbol_id: int
    symbol_nr: int
    symbol_name: str
    sheet_id: int
    sheet_name: str
    x: float
    y: float
    rotation: str


def run_export(
    project: Project, options: ExportOptions, context: Context
) -> tuple[list[SheetData], ExportStats]:
    """Собирает данные проекта и возвращает листы книги, готовые к записи."""
    log = context.log
    stats = ExportStats()
    app = project.app

    log.rule()
    views = ", ".join(sorted(options.views)) if options.views else "все листы"
    log.info(f"Экспорт. Виды листов: {{{views}}}, допустимых листов {len(project.allowed_sheet_ids)}")

    # --- фаза 1: обход объектов ------------------------------------------------
    owner_of_symbol: dict[int, tuple[int, int]] = {}
    placement_of_device: dict[int, _Placement] = {}
    placement_rows: dict[int, _Placement] = {}

    device = app.device()
    symbol = app.symbol()
    device_ids = list(project.devices.keys())

    for index, device_id in enumerate(device_ids, start=1):
        if context.stopped():
            stats.stopped = True
            log.info("Экспорт прерван.")
            break
        if index % 25 == 0 or index == len(device_ids):
            context.progress(index, len(device_ids), "поиск размещений по объектам")
        if not e3api.set_id(device, device_id):
            continue
        symbol_ids = e3api.device_symbol_ids(device, 0, app.probe)
        for number, symbol_id in enumerate(symbol_ids, start=1):
            owner_of_symbol.setdefault(symbol_id, (device_id, number))
            if not e3api.set_id(symbol, symbol_id):
                continue
            location = e3api.symbol_location(symbol, app.probe)
            if location is None or not location.placed:
                continue
            if not project.sheet_allowed(location.sheet_id):
                continue
            placement = _Placement(
                device_id=device_id,
                symbol_id=symbol_id,
                symbol_nr=number,
                symbol_name=e3api.symbol_name(symbol),
                sheet_id=location.sheet_id,
                sheet_name=project.sheet_name_of(location.sheet_id),
                x=location.x,
                y=location.y,
                rotation=e3api.symbol_rotation(symbol, app.probe),
            )
            stats.symbols_seen += 1
            placement_of_device[device_id] = placement
            placement_rows[symbol_id] = placement

    log.info(
        f"Обход объектов: символов найдено {len(owner_of_symbol)}, "
        f"из них размещённых на выбранных листах {stats.symbols_seen} "
        f"(у {len(placement_of_device)} объектов)"
    )

    # --- фаза 2: обход листов -------------------------------------------------
    connection_rows: list[dict[str, Any]] = []
    if not stats.stopped:
        _walk_sheets(
            project,
            options,
            context,
            stats,
            owner_of_symbol,
            placement_of_device,
            placement_rows,
            connection_rows,
        )

    # --- фаза 3: чтение изделий -----------------------------------------------
    device_rows = _device_rows(project, options, context, stats, placement_of_device)

    sheets: list[SheetData] = [
        SheetData(
            name=cols.SHEET_DEVICES,
            headers=cols.DEVICE_HEADERS,
            rows=device_rows,
            numeric=set(cols.NUMERIC_HEADERS),
        )
    ]

    if options.with_placements:
        rows = [
            _placement_row(project, placement)
            for placement in sorted(
                placement_rows.values(), key=lambda p: (p.sheet_name, p.device_id, p.symbol_nr)
            )
        ]
        stats.placements = len(rows)
        sheets.append(
            SheetData(
                name=cols.SHEET_PLACEMENTS,
                headers=cols.PLACEMENT_HEADERS,
                rows=rows,
                numeric=set(cols.NUMERIC_HEADERS),
            )
        )

    if options.with_connections:
        sheets.append(
            SheetData(
                name=cols.SHEET_CONNECTIONS,
                headers=cols.CONNECTION_HEADERS,
                rows=connection_rows,
                numeric=set(cols.NUMERIC_HEADERS),
            )
        )

    stats.placed_devices = len(placement_of_device)
    _log_summary(log, stats, options)
    return sheets, stats


def _walk_sheets(
    project: Project,
    options: ExportOptions,
    context: Context,
    stats: ExportStats,
    owner_of_symbol: dict[int, tuple[int, int]],
    placement_of_device: dict[int, _Placement],
    placement_rows: dict[int, _Placement],
    connection_rows: list[dict[str, Any]],
) -> None:
    app = project.app
    log = context.log
    sheet = app.sheet()
    symbol = app.symbol()
    text_obj = app.text()
    net_segment = app.net_segment() if options.with_connections else None

    sheet_ids = list(project.sheet_names.keys())
    for index, sheet_id in enumerate(sheet_ids, start=1):
        if context.stopped():
            stats.stopped = True
            log.info("Экспорт прерван на обходе листов.")
            break
        context.progress(index, len(sheet_ids), "обход листов")
        if not e3api.set_id(sheet, sheet_id):
            continue
        sheet_name = project.sheet_name_of(sheet_id)

        if options.with_connections and project.sheet_allowed(sheet_id) and net_segment is not None:
            _collect_connections(
                project, sheet, net_segment, sheet_id, sheet_name, connection_rows, stats
            )

        for symbol_id in e3api.sheet_symbol_ids(sheet):
            if not e3api.set_id(symbol, symbol_id):
                continue
            known = owner_of_symbol.get(symbol_id)
            if known is not None:
                device_id, symbol_nr = known
            else:
                device_id, matched = project.device_by_symbol_text(
                    symbol, text_obj, options.loose_text_match
                )
                symbol_nr = 1
                if device_id > 0:
                    stats.matched_by_text += 1
                    if stats.matched_by_text <= 10:
                        log.detail(f"  символ {symbol_id} опознан: «{matched}»")

            if device_id <= 0:
                stats.symbols_without_device += 1
                continue

            location = e3api.symbol_location(symbol, app.probe)
            if location is None:
                continue
            actual_sheet = location.sheet_id if location.placed else sheet_id
            if not project.sheet_allowed(actual_sheet):
                continue

            placement = _Placement(
                device_id=device_id,
                symbol_id=symbol_id,
                symbol_nr=symbol_nr,
                symbol_name=e3api.symbol_name(symbol),
                sheet_id=actual_sheet,
                sheet_name=project.sheet_name_of(actual_sheet) or sheet_name,
                x=location.x,
                y=location.y,
                rotation=e3api.symbol_rotation(symbol, app.probe),
            )
            stats.symbols_seen += 1
            placement_of_device[device_id] = placement
            placement_rows.setdefault(symbol_id, placement)


def _collect_connections(
    project: Project,
    sheet: Any,
    net_segment: Any,
    sheet_id: int,
    sheet_name: str,
    rows: list[dict[str, Any]],
    stats: ExportStats,
) -> None:
    """Пишет ломаные проводов листа: одна строка на точку, группировка по номеру."""
    for segment_id in e3api.sheet_net_segment_ids(sheet):
        if not e3api.set_id(net_segment, segment_id):
            continue
        polyline = e3api.net_segment_polyline(net_segment)
        if polyline is None:
            continue
        signal = e3api.net_segment_signal(net_segment)
        stats.segments += 1
        target_sheet = polyline.sheet_id or sheet_id
        for number, (x, y) in enumerate(polyline.points, start=1):
            point_type = polyline.types[number - 1] if number - 1 < len(polyline.types) else 0
            rows.append(
                {
                    cols.H_CONN_NR: stats.segments,
                    cols.H_POINT_NR: number,
                    cols.H_SHEET: project.sheet_name_of(target_sheet) or sheet_name,
                    cols.H_SHEET_ID: target_sheet,
                    cols.H_X: x,
                    cols.H_Y: y,
                    cols.H_POINT_TYPE: point_type,
                    cols.H_SIGNAL: signal,
                    cols.H_SEGMENT_ID: segment_id,
                }
            )
            stats.points += 1


def _device_rows(
    project: Project,
    options: ExportOptions,
    context: Context,
    stats: ExportStats,
    placement_of_device: dict[int, _Placement],
) -> list[dict[str, Any]]:
    """Строки листа «Изделия»: обозначение, компонент, все атрибуты, координаты."""
    app = project.app
    device = app.device()
    rows: list[dict[str, Any]] = []

    ids = e3api.job_ids(app.job, "GetAllDeviceIds") or ()
    total = len(ids)
    for index, device_id in enumerate(ids, start=1):
        if context.stopped():
            stats.stopped = True
            context.log.info("Экспорт прерван, пишу собранное.")
            break
        if index % 40 == 0 or index == total:
            context.progress(index, total, "чтение изделий")

        placement = placement_of_device.get(device_id)
        if options.only_placed and placement is None:
            stats.skipped += 1
            continue
        if not e3api.set_id(device, device_id):
            continue

        poz = e3api.attribute_value(device, cols.H_POZ)
        if not poz:
            poz = strip_dash(e3api.device_name(device))

        row: dict[str, Any] = {cols.H_POZ: poz, cols.H_COMP: e3api.device_component(device)}
        for header in cols.ATTRIBUTE_HEADERS:
            row[header] = e3api.attribute_value(device, header)

        symbol_ids = e3api.device_symbol_ids(device, 0, app.probe)
        row[cols.H_SYM_COUNT] = len(symbol_ids)
        row[cols.H_DEV_ID] = device_id

        if placement is not None:
            row[cols.H_SHEET] = placement.sheet_name
            row[cols.H_X] = placement.x
            row[cols.H_Y] = placement.y
            row[cols.H_ROT] = placement.rotation
            row[cols.H_MIRROR] = ""
            row[cols.H_SYM_ID] = placement.symbol_id
            row[cols.H_SYM_NAME] = placement.symbol_name
            row[cols.H_SHEET_ID] = placement.sheet_id

        rows.append(row)

    stats.devices = len(rows)
    return rows


def _placement_row(project: Project, placement: _Placement) -> dict[str, Any]:
    return {
        cols.H_POZ: project.poz_of(placement.device_id),
        cols.H_SYM_NR: placement.symbol_nr,
        cols.H_SYM_ID: placement.symbol_id,
        cols.H_SYM_NAME: placement.symbol_name,
        cols.H_SHEET: placement.sheet_name,
        cols.H_SHEET_ID: placement.sheet_id,
        cols.H_X: placement.x,
        cols.H_Y: placement.y,
        cols.H_ROT: placement.rotation,
        cols.H_MIRROR: "",
        cols.H_DEV_ID: placement.device_id,
        cols.H_OBJ_TYPE: project.kind_of(placement.device_id),
    }


def _log_summary(log: Any, stats: ExportStats, options: ExportOptions) -> None:
    log.info(f"Записано изделий: {stats.devices}")
    if options.with_placements:
        log.info(f"Размещений: {stats.placements} символов у {stats.placed_devices} объектов")
    if stats.matched_by_text:
        log.info(f"Опознано по надписи на символе: {stats.matched_by_text}")
    if options.with_connections:
        log.info(f"Соединений (сегментов проводов): {stats.segments}, точек ломаных: {stats.points}")
    if stats.symbols_without_device:
        log.info(
            f"Символов на листах без связи с изделием: {stats.symbols_without_device} "
            "(рамки, таблицы, соединители и т. п.)"
        )
    if stats.skipped:
        log.info(f"Пропущено изделий без размещения: {stats.skipped}")
    if stats.placed_devices == 0:
        log.warn("Ни одного размещённого символа на выбранных листах не найдено.")
        log.info("Это нормально, если изделия созданы, но ещё не поставлены на листы.")
