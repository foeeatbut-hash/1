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

Что попадает в какой лист книги
-------------------------------
Одно изделие на чертеже размещено не один раз: на ФСА (вид 4) — в схемной части
и ещё раз в подвале, таблице внизу листа, а на схеме соединений (вид 5) — третий
раз. Если сложить это в одну таблицу, изделие будет повторяться, и понять,
какая строка какому месту чертежа соответствует, нельзя. Поэтому:

* «Изделия» — всё, что есть в проекте: по строке на объект, атрибуты и
  координаты **основного** размещения (схемная часть предпочитается подвалу);
* «ФСА (вид 4)» — изделия функциональной схемы с их атрибутами;
* «Схема соединений (вид 5)» — то же для вида 5, и рядом сверка с видом 4:
  сколько размещений здесь, сколько на ФСА, есть ли изделие там вообще;
* «Схема» и «Подвал» — по строке на каждый размещённый символ, разделённые по
  зоне листа; вместе они описывают чертёж полностью;
* «Соединения» — ломаные проводов, «Надписи» — свободные тексты листов;
* «Листы» — по строке на лист: вид, рамка (формат), габарит, граница подвала;
* «Сверка сигналов» — отчёт DI/DO/AI/AO, см. модуль ``signals``.

В каждой строке есть вид листа и формат листа, поэтому при загрузке лист
определяется однозначно даже там, где имена листов совпадают.

Как определяется подвал
-----------------------
Сначала по имени: подвальные символы и компоненты в базе названы «Подвал_…» —
это прямое указание назначения, взятое из рабочего скрипта сверки. Геометрия
(поиск пустой полосы внизу листа) остаётся запасным вариантом для листов, где
таких имён нет.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

from . import columns as cols
from . import e3api
from . import signals as sig
from .excel_io import SheetData
from .project import Project
from .task import Context
from .util import mirror_of, strip_dash


@dataclass
class ExportOptions:
    #: 4 — функциональная схема, 5 — схема соединений. Пустое множество — все листы.
    views: set[str] = field(default_factory=lambda: {"4", "5"})
    with_placements: bool = True
    with_connections: bool = True
    #: Лист «Листы» — виды и форматы. Через него формат листа правится из Excel.
    with_sheets: bool = True
    #: Вкладки «ФСА (вид 4)» и «Схема соединений (вид 5)» — изделия по видам.
    with_view_sheets: bool = True
    #: Лист «Надписи» — свободные тексты на листах.
    with_texts: bool = True
    #: Лист «Сверка сигналов» — отчёт DI/DO/AI/AO вида 4 против вида 5.
    with_signals: bool = True
    #: Делить размещения на «Схему» и «Подвал». Выключено — одна таблица «Размещения».
    split_zones: bool = True
    #: Граница подвала в мм по Y. 0 — определять по чертежу автоматически.
    footer_y: float = 0.0
    only_placed: bool = False
    #: Мягкое опознание символа по атрибутам-тегам. Точное совпадение работает всегда.
    loose_text_match: bool = True


@dataclass
class ExportStats:
    devices: int = 0
    skipped: int = 0
    symbols_seen: int = 0
    placements: int = 0
    schema_rows: int = 0
    footer_rows: int = 0
    sheets_with_footer: int = 0
    sheets_footer_by_name: int = 0
    sheets: int = 0
    placed_devices: int = 0
    matched_by_owner: int = 0
    matched_by_text: int = 0
    symbols_without_device: int = 0
    with_gid: int = 0
    segments: int = 0
    points: int = 0
    texts: int = 0
    texts_of_symbols: int = 0
    view4_devices: int = 0
    view5_devices: int = 0
    view_mismatch: int = 0
    stopped: bool = False


@dataclass
class _Placement:
    """Найденное положение символа.

    Изделие здесь может отсутствовать (``device_id == 0``): на чертеже полно
    символов, которые не принадлежат ни одному объекту проекта — рамки, таблицы,
    графика, соединители. Раньше такие строки выбрасывались, и вместе с ними
    пропадала половина чертежа. Теперь строка живёт своим GID.
    """

    device_id: int
    symbol_id: int
    symbol_nr: int
    symbol_name: str
    sheet_id: int
    sheet_name: str
    view: str
    fmt: str
    x: float
    y: float
    rotation: str
    zone: str = cols.ZONE_SCHEMA
    #: Имя типа символа в базе E3 — по нему опознаётся подвал и вставляется такой же.
    type_name: str = ""
    version: str = ""
    scale: float = 1.0
    gid: str = ""
    #: True, если подвал определён по имени, а не по координате.
    named_footer: bool = False
    zone_source: str = ""


@dataclass
class _Text:
    """Свободная надпись на листе."""

    text_id: int
    sheet_id: int
    sheet_name: str
    view: str
    fmt: str
    x: float
    y: float
    rotation: float
    height: float
    kind: int
    value: str
    gid: str = ""


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
    #: Все найденные размещения, по ID символа — так один символ не попадёт дважды.
    found: dict[int, _Placement] = {}

    device = app.device()
    symbol = app.symbol()
    device_ids = list(project.devices.keys())
    phase_started = time.monotonic()
    log.info(f"Фаза 1 из 3: обход объектов проекта ({len(device_ids)} шт.)")
    without_symbols = 0
    unplaced = 0

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
        if not symbol_ids:
            without_symbols += 1
        for number, symbol_id in enumerate(symbol_ids, start=1):
            owner_of_symbol.setdefault(symbol_id, (device_id, number))
            if not e3api.set_id(symbol, symbol_id):
                continue
            location = e3api.symbol_location(symbol, app.probe)
            if location is None or not location.placed:
                unplaced += 1
                continue
            if not project.sheet_allowed(location.sheet_id):
                continue
            found[symbol_id] = _make_placement(
                project,
                device_id=device_id,
                symbol=symbol,
                symbol_id=symbol_id,
                symbol_nr=number,
                sheet_id=location.sheet_id,
                x=location.x,
                y=location.y,
            )
            stats.symbols_seen += 1

    log.info(
        f"  символов у объектов: {len(owner_of_symbol)}; "
        f"размещено на выбранных листах: {stats.symbols_seen}"
    )
    if without_symbols:
        log.info(f"  объектов без символов вообще: {without_symbols} — размещать нечего")
    if unplaced:
        log.info(f"  символов не поставлено на лист: {unplaced}")
    log.info(f"  фаза 1 заняла {time.monotonic() - phase_started:.1f} с")

    # --- фаза 2: обход листов -------------------------------------------------
    connection_rows: list[dict[str, Any]] = []
    texts: list[_Text] = []
    if not stats.stopped:
        _walk_sheets(
            project, options, context, stats, owner_of_symbol, found, connection_rows, texts
        )

    # --- зоны листа: схема или подвал -----------------------------------------
    placement_of_device = _assign_zones(project, options, context, stats, found)

    # --- фаза 3: чтение изделий -----------------------------------------------
    device_rows = _device_rows(project, options, context, stats, placement_of_device, found)

    sheets: list[SheetData] = [
        SheetData(
            name=cols.SHEET_DEVICES,
            headers=cols.DEVICE_HEADERS,
            rows=device_rows,
            numeric=set(cols.NUMERIC_HEADERS),
        )
    ]

    if options.with_view_sheets:
        sheets.extend(_view_sheets(project, context, stats, device_rows, found))

    if options.with_placements:
        sheets.extend(_placement_sheets(project, options, stats, found))

    if options.with_connections:
        sheets.append(
            SheetData(
                name=cols.SHEET_CONNECTIONS,
                headers=cols.CONNECTION_HEADERS,
                rows=connection_rows,
                numeric=set(cols.NUMERIC_HEADERS),
            )
        )

    if options.with_texts:
        sheets.append(
            SheetData(
                name=cols.SHEET_TEXTS,
                headers=cols.TEXT_HEADERS,
                rows=[_text_row(project, item) for item in texts],
                numeric=set(cols.TEXT_NUMERIC_HEADERS),
            )
        )

    if options.with_sheets:
        rows = _sheet_rows(project)
        stats.sheets = len(rows)
        sheets.append(
            SheetData(
                name=cols.SHEET_SHEETS,
                headers=cols.SHEET_HEADERS,
                rows=rows,
                numeric=set(cols.SHEET_NUMERIC_HEADERS),
            )
        )

    if options.with_signals and not stats.stopped:
        placements = [
            sig.Placement(
                device_id=item.device_id,
                sheet_id=item.sheet_id,
                sheet_name=item.sheet_name,
                view=item.view,
                in_footer=item.zone == cols.ZONE_FOOTER,
            )
            for item in found.values()
            if item.device_id > 0
        ]
        sheets.append(sig.build_report(project, placements, context))

    stats.placed_devices = len(placement_of_device)
    _log_summary(log, stats, options)
    return sheets, stats


def _make_placement(
    project: Project,
    *,
    device_id: int,
    symbol: Any,
    symbol_id: int,
    symbol_nr: int,
    sheet_id: int,
    x: float,
    y: float,
) -> _Placement:
    """Собирает размещение, дописывая вид, формат листа и признак подвала.

    Подвал опознаётся по имени: тип символа в базе E3 либо компонент изделия
    названы «Подвал_…». Правило взято из рабочего скрипта сверки — оно точнее
    любой геометрии, потому что описывает назначение символа, а не его место.
    """
    type_name = e3api.symbol_type_name(symbol)
    named_footer = cols.FOOTER_MARKER in type_name.lower() or project.is_footer_component(
        device_id
    )
    return _Placement(
        device_id=device_id,
        symbol_id=symbol_id,
        symbol_nr=symbol_nr,
        symbol_name=e3api.symbol_name(symbol),
        sheet_id=sheet_id,
        sheet_name=project.sheet_name_of(sheet_id),
        view=project.sheet_view_of(sheet_id),
        fmt=project.sheet_format_of(sheet_id),
        x=x,
        y=y,
        rotation=e3api.symbol_rotation(symbol, project.app.probe),
        type_name=type_name,
        version=e3api.symbol_version(symbol),
        scale=e3api.symbol_scale(symbol),
        gid=e3api.object_gid(symbol),
        named_footer=named_footer,
    )


def _walk_sheets(
    project: Project,
    options: ExportOptions,
    context: Context,
    stats: ExportStats,
    owner_of_symbol: dict[int, tuple[int, int]],
    found: dict[int, _Placement],
    connection_rows: list[dict[str, Any]],
    texts: list[_Text],
) -> None:
    app = project.app
    log = context.log
    sheet = app.sheet()
    symbol = app.symbol()
    text_obj = app.text()
    # Отдельный объект изделия: он всё время «прыгает» по владельцам символов,
    # и мешать это с чтением атрибутов нельзя.
    owner_probe = app.device()
    net_segment = app.net_segment() if options.with_connections else None
    #: Сколько символов уже выдано каждому изделию — чтобы «№ символа» не
    #: повторялся у тех, кого нашли обратной связью, а не через GetSymbolIds.
    numbering: dict[int, int] = {}
    for device_id, number in owner_of_symbol.values():
        numbering[device_id] = max(numbering.get(device_id, 0), number)

    sheet_ids = list(project.sheet_names.keys())
    phase_started = time.monotonic()
    skipped_sheets = 0
    log.info(
        f"Фаза 2 из 3: обход листов — {len(project.allowed_sheet_ids)} из {len(sheet_ids)} "
        "попадают в выбранные виды"
    )
    for index, sheet_id in enumerate(sheet_ids, start=1):
        if context.stopped():
            stats.stopped = True
            log.info("Экспорт прерван на обходе листов.")
            break
        context.progress(index, len(sheet_ids), "обход листов")
        if not e3api.set_id(sheet, sheet_id):
            continue
        sheet_name = project.sheet_name_of(sheet_id)
        sheet_symbols = 0
        sheet_matched = 0
        segments_before = stats.segments

        if not project.sheet_allowed(sheet_id):
            # Символы такого листа всё равно были бы отброшены фильтром, а обход
            # чужих листов — самая дорогая часть выгрузки.
            skipped_sheets += 1
            continue

        if options.with_connections and net_segment is not None:
            _collect_connections(
                project, sheet, net_segment, sheet_id, sheet_name, connection_rows, stats
            )

        symbol_ids = e3api.sheet_symbol_ids(sheet)
        if options.with_texts and text_obj is not None:
            _collect_texts(project, sheet, symbol, text_obj, sheet_id, symbol_ids, texts, stats)

        for symbol_id in symbol_ids:
            sheet_symbols += 1
            if not e3api.set_id(symbol, symbol_id):
                continue
            known = owner_of_symbol.get(symbol_id)
            if known is not None:
                device_id, symbol_nr = known
            else:
                symbol_nr = 1
                # Обратная связь «символ -> изделие»: Device.SetId, получив
                # идентификатор символа, делает текущим изделие-владельца.
                # Это точный ответ от E3, поэтому он идёт раньше догадок
                # по надписям.
                device_id = e3api.device_of_symbol(owner_probe, symbol_id)
                if device_id > 0:
                    stats.matched_by_owner += 1
                    symbol_nr = _next_symbol_nr(numbering, device_id)
                else:
                    device_id, matched = project.device_by_symbol_text(
                        symbol, text_obj, options.loose_text_match
                    )
                    if device_id > 0:
                        stats.matched_by_text += 1
                        if stats.matched_by_text <= 10:
                            log.detail(f"  символ {symbol_id} опознан: «{matched}»")

            location = e3api.symbol_location(symbol, app.probe)
            if location is None:
                continue
            actual_sheet = location.sheet_id if location.placed else sheet_id
            if not project.sheet_allowed(actual_sheet):
                continue
            if symbol_id in found:
                continue
            if device_id <= 0:
                # Изделия у символа нет — и это нормально: рамки, таблицы,
                # графика, соединители никому не принадлежат. Раньше такая
                # строка выбрасывалась, и вместе с ней пропадала бо́льшая часть
                # чертежа. Теперь она живёт своим GID.
                stats.symbols_without_device += 1

            found[symbol_id] = _make_placement(
                project,
                device_id=device_id,
                symbol=symbol,
                symbol_id=symbol_id,
                symbol_nr=symbol_nr,
                sheet_id=actual_sheet,
                x=location.x,
                y=location.y,
            )
            stats.symbols_seen += 1
            sheet_matched += 1

        log.detail(
            f"  лист «{sheet_name}» (ID {sheet_id})"
            + f": символов {sheet_symbols}, привязано {sheet_matched}"
            + (f", сегментов проводов {stats.segments - segments_before}" if options.with_connections else "")
        )

    if skipped_sheets:
        log.info(f"  пропущено листов вне выбранных видов: {skipped_sheets}")
    log.info(
        f"  символов собрано на листах: {stats.symbols_seen}; "
        f"владелец получен от E3: {stats.matched_by_owner}; "
        f"опознано по надписи: {stats.matched_by_text}; "
        f"без изделия (рамки, таблицы, графика): {stats.symbols_without_device}"
    )
    if options.with_texts:
        log.info(
            f"  свободных надписей на листах: {stats.texts} "
            f"(надписей символов пропущено: {stats.texts_of_symbols})"
        )
    log.info(f"  фаза 2 заняла {time.monotonic() - phase_started:.1f} с")


def _next_symbol_nr(numbering: dict[int, int], device_id: int) -> int:
    """Следующий свободный номер символа у изделия."""
    numbering[device_id] = numbering.get(device_id, 0) + 1
    return numbering[device_id]


def _collect_texts(
    project: Project,
    sheet: Any,
    symbol: Any,
    text_obj: Any,
    sheet_id: int,
    symbol_ids: tuple[int, ...],
    texts: list[_Text],
    stats: ExportStats,
) -> None:
    """Свободные надписи листа: всё, что не принадлежит его символам.

    Sheet.GetTextIds отдаёт и подписи символов — их переносить нельзя, E3
    формирует их сама из атрибутов. Поэтому из списка листа вычитаются надписи,
    которые вернул Symbol.GetTextIds каждого символа.
    """
    all_ids = e3api.sheet_text_ids(sheet)
    if not all_ids:
        return
    owned: set[int] = set()
    for symbol_id in symbol_ids:
        if e3api.set_id(symbol, symbol_id):
            owned.update(e3api.symbol_text_ids(symbol))

    for text_id in all_ids:
        if text_id in owned:
            stats.texts_of_symbols += 1
            continue
        if not e3api.set_id(text_obj, text_id):
            continue
        value = e3api.text_value(text_obj, text_id)
        if not value:
            continue
        location = e3api.text_location(text_obj)
        target = location.sheet_id if location and location.placed else sheet_id
        texts.append(
            _Text(
                text_id=text_id,
                sheet_id=target,
                sheet_name=project.sheet_name_of(target),
                view=project.sheet_view_of(target),
                fmt=project.sheet_format_of(target),
                x=location.x if location else 0.0,
                y=location.y if location else 0.0,
                rotation=e3api.text_rotation(text_obj),
                height=e3api.text_height(text_obj),
                kind=e3api.text_type(text_obj),
                value=value,
                gid=e3api.object_gid(text_obj),
            )
        )
        stats.texts += 1


# ------------------------------------------------------------------------------
#  Зоны листа и выбор основного размещения
# ------------------------------------------------------------------------------
def _assign_zones(
    project: Project,
    options: ExportOptions,
    context: Context,
    stats: ExportStats,
    found: dict[int, _Placement],
) -> dict[int, _Placement]:
    """Расставляет зоны и выбирает у каждого изделия основное размещение.

    Порядок предпочтений: заданная руками граница, затем имя символа
    («Подвал_…»), затем геометрия. Руками заданная граница главнее всего —
    это прямое указание пользователя. Смешивать имя и геометрию на одном листе
    нельзя: символ подвала, стоящий выше найденной границы, попал бы в схему и
    изделие задвоилось бы именно там, где мы этого избегаем.
    """
    log = context.log
    ys_by_sheet: dict[int, list[float]] = {}
    named_sheets: set[int] = set()
    for placement in found.values():
        ys_by_sheet.setdefault(placement.sheet_id, []).append(placement.y)
        if placement.named_footer:
            named_sheets.add(placement.sheet_id)
    if options.footer_y > 0:
        named_sheets.clear()

    if options.split_zones:
        log.info(
            "Деление на схему и подвал"
            + (f" (граница задана вручную: Y={options.footer_y:g})" if options.footer_y > 0 else " (граница по чертежу)")
        )
        stats.sheets_footer_by_name = len(named_sheets)
        if named_sheets:
            log.info(
                f"  на {len(named_sheets)} листах подвал опознан по имени символа "
                f"(«{cols.FOOTER_MARKER}…») — геометрию там не применяю"
            )
        stats.sheets_with_footer = project.detect_footer_boundaries(
            ys_by_sheet, options.footer_y, named=named_sheets
        )
        for placement in found.values():
            if placement.sheet_id in named_sheets:
                placement.zone = (
                    cols.ZONE_FOOTER if placement.named_footer else cols.ZONE_SCHEMA
                )
            else:
                placement.zone = project.zone_of(placement.sheet_id, placement.y)
            placement.zone_source = project.zone_source_of(placement.sheet_id)
        stats.footer_rows = sum(1 for p in found.values() if p.zone == cols.ZONE_FOOTER)
        stats.schema_rows = len(found) - stats.footer_rows
        log.info(
            f"  подвал выделен на листах: {stats.sheets_with_footer} из {len(ys_by_sheet)}; "
            f"строк схемы {stats.schema_rows}, строк подвала {stats.footer_rows}"
        )
    else:
        for placement in found.values():
            placement.zone = cols.ZONE_SCHEMA
        stats.schema_rows = len(found)

    primary: dict[int, _Placement] = {}
    counts: dict[int, int] = {}
    for placement in found.values():
        if placement.device_id <= 0:
            continue  # символ без изделия живёт только в таблице размещений
        counts[placement.device_id] = counts.get(placement.device_id, 0) + 1
        current = primary.get(placement.device_id)
        if current is None or _primary_key(placement) < _primary_key(current):
            primary[placement.device_id] = placement
    multiple = sum(1 for count in counts.values() if count > 1)
    if multiple:
        log.info(
            f"  изделий, размещённых больше одного раза: {multiple} — в лист «Изделия» "
            "идёт основное размещение (схемная часть важнее подвала), все остальные "
            "видны на листах размещений"
        )
    return primary


def _primary_key(placement: _Placement) -> tuple:
    """Основное размещение: сначала схема, потом меньший вид, лист и номер символа."""
    return (
        0 if placement.zone == cols.ZONE_SCHEMA else 1,
        placement.view,
        placement.sheet_name,
        placement.sheet_id,
        placement.symbol_nr,
        placement.symbol_id,
    )


def _sort_key(project: Project, placement: _Placement) -> tuple:
    """Порядок строк в книге — устойчивый, чтобы повторная выгрузка совпадала."""
    return (
        placement.view,
        placement.sheet_name,
        placement.sheet_id,
        project.poz_of(placement.device_id),
        placement.symbol_nr,
        placement.symbol_id,
    )


def _placement_sheets(
    project: Project,
    options: ExportOptions,
    stats: ExportStats,
    found: dict[int, _Placement],
) -> list[SheetData]:
    """Листы книги с размещениями: «Схема» и «Подвал» либо одна «Размещения»."""
    ordered = sorted(found.values(), key=lambda p: _sort_key(project, p))
    stats.placements = len(ordered)
    stats.with_gid = sum(1 for placement in ordered if placement.gid)
    if not options.split_zones:
        return [
            SheetData(
                name=cols.SHEET_PLACEMENTS,
                headers=cols.PLACEMENT_HEADERS,
                rows=[_placement_row(project, placement) for placement in ordered],
                numeric=set(cols.NUMERIC_HEADERS),
            )
        ]
    return [
        SheetData(
            name=cols.SHEET_SCHEMA,
            headers=cols.PLACEMENT_HEADERS,
            rows=[
                _placement_row(project, placement)
                for placement in ordered
                if placement.zone != cols.ZONE_FOOTER
            ],
            numeric=set(cols.NUMERIC_HEADERS),
        ),
        SheetData(
            name=cols.SHEET_FOOTER,
            headers=cols.PLACEMENT_HEADERS,
            rows=[
                _placement_row(project, placement)
                for placement in ordered
                if placement.zone == cols.ZONE_FOOTER
            ],
            numeric=set(cols.NUMERIC_HEADERS),
        ),
    ]


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
                    cols.H_GID: e3api.object_gid(net_segment),
                    cols.H_CONN_NR: stats.segments,
                    cols.H_POINT_NR: number,
                    cols.H_SHEET: project.sheet_name_of(target_sheet) or sheet_name,
                    cols.H_SHEET_ID: target_sheet,
                    cols.H_VIEW: project.sheet_view_of(target_sheet),
                    cols.H_FORMAT: project.sheet_format_of(target_sheet),
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
    found: dict[int, _Placement],
) -> list[dict[str, Any]]:
    """Строки листа «Изделия»: обозначение, компонент, все атрибуты, координаты."""
    app = project.app
    device = app.device()
    rows: list[dict[str, Any]] = []

    counts: dict[int, int] = {}
    for placement in found.values():
        counts[placement.device_id] = counts.get(placement.device_id, 0) + 1

    ids = e3api.job_ids(app.job, "GetAllDeviceIds") or ()
    total = len(ids)
    phase_started = time.monotonic()
    context.log.info(f"Фаза 3 из 3: чтение атрибутов изделий ({total} шт.)")
    empty_poz = 0
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
            empty_poz += 1
            poz = strip_dash(e3api.device_name(device))

        row: dict[str, Any] = {cols.H_POZ: poz, cols.H_COMP: e3api.device_component(device)}
        for header in cols.ATTRIBUTE_HEADERS:
            row[header] = e3api.attribute_value(device, header)
        # Атрибуты сверки читаются здесь же: второй проход по всем изделиям
        # ради них обошёлся бы в ещё один полный обход проекта.
        for header in cols.SIGNAL_HEADERS:
            row[header] = e3api.attribute_value(device, header)

        symbol_ids = e3api.device_symbol_ids(device, 0, app.probe)
        row[cols.H_SYM_COUNT] = len(symbol_ids)
        row[cols.H_DEV_ID] = device_id
        row[cols.H_GID] = e3api.object_gid(device)
        row[cols.H_PLACED_COUNT] = counts.get(device_id, 0)

        if placement is not None:
            row[cols.H_SHEET] = placement.sheet_name
            row[cols.H_X] = placement.x
            row[cols.H_Y] = placement.y
            row[cols.H_ROT] = placement.rotation
            row[cols.H_MIRROR] = mirror_of(placement.rotation)
            row[cols.H_SYM_ID] = placement.symbol_id
            row[cols.H_SYM_NAME] = placement.symbol_name
            row[cols.H_SHEET_ID] = placement.sheet_id
            row[cols.H_VIEW] = placement.view
            row[cols.H_FORMAT] = placement.fmt
            row[cols.H_ZONE] = placement.zone

        rows.append(row)

    stats.devices = len(rows)
    if empty_poz:
        context.log.info(
            f"  у {empty_poz} изделий атрибут «{cols.H_POZ}» пуст — записано имя изделия"
        )
    context.log.info(f"  фаза 3 заняла {time.monotonic() - phase_started:.1f} с")
    return rows


def _placement_row(project: Project, placement: _Placement) -> dict[str, Any]:
    return {
        cols.H_GID: placement.gid,
        cols.H_POZ: project.poz_of(placement.device_id),
        cols.H_SYM_NR: placement.symbol_nr,
        cols.H_SYM_ID: placement.symbol_id,
        cols.H_SYM_NAME: placement.symbol_name,
        cols.H_SYM_DB: placement.type_name,
        cols.H_SYM_VERSION: placement.version,
        cols.H_SHEET: placement.sheet_name,
        cols.H_SHEET_ID: placement.sheet_id,
        cols.H_VIEW: placement.view,
        cols.H_FORMAT: placement.fmt,
        cols.H_ZONE: placement.zone,
        cols.H_X: placement.x,
        cols.H_Y: placement.y,
        cols.H_ROT: placement.rotation,
        cols.H_MIRROR: mirror_of(placement.rotation),
        cols.H_SCALE: placement.scale,
        cols.H_DEV_ID: placement.device_id,
        cols.H_OBJ_TYPE: project.kind_of(placement.device_id) or "без изделия",
        cols.H_ZONE_SOURCE: placement.zone_source,
    }


def _text_row(project: Project, item: _Text) -> dict[str, Any]:
    return {
        cols.H_GID: item.gid,
        cols.H_TEXT_ID: item.text_id,
        cols.H_SHEET: item.sheet_name,
        cols.H_SHEET_ID: item.sheet_id,
        cols.H_VIEW: item.view,
        cols.H_FORMAT: item.fmt,
        cols.H_ZONE: project.zone_of(item.sheet_id, item.y),
        cols.H_X: item.x,
        cols.H_Y: item.y,
        cols.H_ROT: item.rotation or "",
        cols.H_TEXT_HEIGHT: item.height or "",
        cols.H_TEXT_TYPE: item.kind,
        cols.H_TEXT: item.value,
    }


# ------------------------------------------------------------------------------
#  Вкладки по видам листов: ФСА (4) и схема соединений (5)
# ------------------------------------------------------------------------------
def _view_sheets(
    project: Project,
    context: Context,
    stats: ExportStats,
    device_rows: list[dict[str, Any]],
    found: dict[int, _Placement],
) -> list[SheetData]:
    """Строит вкладки «ФСА (вид 4)» и «Схема соединений (вид 5)».

    Строка изделия здесь та же, что на главном листе, — атрибуты не пересчитываются.
    Меняется только состав: на вкладку попадают изделия, размещённые на листах
    этого вида. На вкладке вида 5 рядом идёт сверка с видом 4: сколько размещений
    здесь, сколько там и есть ли изделие на ФСА вообще. Это тот самый «следующий
    шаг», о котором просил пользователь.
    """
    log = context.log
    counts: dict[str, dict[int, int]] = {"4": {}, "5": {}}
    for placement in found.values():
        bucket = counts.get(placement.view)
        if bucket is None or placement.device_id <= 0:
            continue
        bucket[placement.device_id] = bucket.get(placement.device_id, 0) + 1

    rows_by_id = {row.get(cols.H_DEV_ID): row for row in device_rows}
    stats.view4_devices = len(counts["4"])
    stats.view5_devices = len(counts["5"])

    def rows_for(view: str) -> list[dict[str, Any]]:
        result = []
        for device_id in sorted(counts[view], key=lambda key: (project.poz_of(key), key)):
            row = rows_by_id.get(device_id)
            if row is not None:
                result.append(row)
        return result

    view4_rows = rows_for("4")
    view5_source = rows_for("5")

    view5_rows: list[dict[str, Any]] = []
    for row in view5_source:
        device_id = row.get(cols.H_DEV_ID)
        here = counts["5"].get(device_id, 0)
        there = counts["4"].get(device_id, 0)
        if there == 0:
            check = "нет на ФСА"
            stats.view_mismatch += 1
        elif there == here:
            check = "совпадает"
        else:
            check = "число размещений разное"
            stats.view_mismatch += 1
        view5_rows.append(
            {
                **row,
                cols.H_COUNT_HERE: here,
                cols.H_COUNT_OTHER_VIEW: there,
                cols.H_ON_OTHER_VIEW: "да" if there else "нет",
                cols.H_CHECK: check,
            }
        )

    log.info(
        f"Вкладки по видам: ФСА (вид 4) — изделий {len(view4_rows)}, "
        f"схема соединений (вид 5) — изделий {len(view5_rows)}"
    )
    if stats.view_mismatch:
        log.info(
            f"  расхождений между видами: {stats.view_mismatch} — "
            f"см. столбец «{cols.H_CHECK}» на вкладке «{cols.SHEET_VIEW5}»"
        )

    return [
        SheetData(
            name=cols.SHEET_VIEW4,
            headers=cols.VIEW_DEVICE_HEADERS,
            rows=view4_rows,
            numeric=set(cols.NUMERIC_HEADERS),
        ),
        SheetData(
            name=cols.SHEET_VIEW5,
            headers=cols.VIEW5_DEVICE_HEADERS,
            rows=view5_rows,
            numeric=set(cols.NUMERIC_HEADERS),
        ),
    ]


def _sheet_rows(project: Project) -> list[dict[str, Any]]:
    """Лист «Листы»: по строке на каждый лист, с которым работаем."""
    rows: list[dict[str, Any]] = []
    for sheet_id in sorted(project.allowed_sheet_ids):
        info = project.sheet_info(sheet_id)
        if info is None:
            continue
        rows.append(
            {
                cols.H_SHEET_ID: info.sheet_id,
                cols.H_SHEET: info.name,
                cols.H_VIEW: info.view,
                cols.H_VIEW_NAME: cols.view_title(info.view),
                cols.H_FORMAT: info.fmt,
                cols.H_SHEET_SYMBOLS: info.symbols,
                cols.H_XMIN: info.xmin,
                cols.H_YMIN: info.ymin,
                cols.H_XMAX: info.xmax,
                cols.H_YMAX: info.ymax,
                cols.H_FOOTER_Y: info.footer_y or "",
                cols.H_ZONE_SOURCE: info.zone_source,
            }
        )
    return rows


def _log_summary(log: Any, stats: ExportStats, options: ExportOptions) -> None:
    log.info(f"Записано изделий: {stats.devices}")
    without = max(stats.devices - stats.placed_devices, 0)
    log.info(
        f"Из них с координатами: {min(stats.placed_devices, stats.devices)}, "
        f"без координат: {without}"
    )
    if options.with_view_sheets:
        log.info(
            f"Вкладка «{cols.SHEET_VIEW4}»: изделий {stats.view4_devices}; "
            f"вкладка «{cols.SHEET_VIEW5}»: изделий {stats.view5_devices}"
        )
    if options.with_placements:
        log.info(f"Размещений всего: {stats.placements} символов у {stats.placed_devices} объектов")
        if options.split_zones:
            log.info(
                f"  лист «{cols.SHEET_SCHEMA}»: {stats.schema_rows}, "
                f"лист «{cols.SHEET_FOOTER}»: {stats.footer_rows}"
            )
            log.info(
                f"  из них по имени символа определено листов: {stats.sheets_footer_by_name}, "
                f"по геометрии: {max(stats.sheets_with_footer - stats.sheets_footer_by_name, 0)}"
            )
        if stats.with_gid == stats.placements and stats.placements:
            log.info(
                "  у каждого размещения есть GID — при загрузке символ найдётся точно, "
                "даже если у него не заполнен ни один атрибут"
            )
        elif stats.placements:
            log.warn(
                f"  GID получен только у {stats.with_gid} из {stats.placements} размещений. "
                "GID есть с E3.series 23.00; на более старой сборке опознание пойдёт "
                "по числовому ID и обозначению, то есть менее точно."
            )
    if stats.matched_by_text:
        log.info(f"Опознано по надписи на символе: {stats.matched_by_text}")
    if options.with_connections:
        log.info(f"Соединений (сегментов проводов): {stats.segments}, точек ломаных: {stats.points}")
    if options.with_texts:
        log.info(f"Надписей на листах: {stats.texts}")
    if options.with_sheets:
        log.info(f"Листов описано в таблице «{cols.SHEET_SHEETS}»: {stats.sheets}")
    if stats.symbols_without_device:
        log.info(
            f"Символов без изделия: {stats.symbols_without_device} "
            "(рамки, таблицы, соединители, графика). Они выгружены наравне с "
            "остальными и вернутся на место по GID."
        )
    if stats.skipped:
        log.info(f"Пропущено изделий без размещения: {stats.skipped}")
    if stats.placed_devices == 0:
        log.warn("Ни одного размещённого символа на выбранных листах не найдено.")
        log.info("Это нормально, если изделия созданы, но ещё не поставлены на листы.")
