"""Сверка сигналов DI/DO/AI/AO между видом 4 и видом 5.

Это перенос рабочего VBScript-скрипта пользователя внутрь программы, чтобы
отчёт получался прямо при выгрузке проекта, одной вкладкой той же книги, и без
второго обхода E3 — размещения уже собраны экспортом.

Правила взяты из скрипта дословно, потому что они не случайны:

* **вид 4 — только подвал.** На функциональной схеме изделие нарисовано дважды:
  в схемной части и строкой в подвале. Считать оба раза нельзя, поэтому в зачёт
  идёт только подвал — он и есть перечень сигналов листа;
* **вид 5 — все символы.** На схеме соединений подвала нет, изделие стоит один
  раз;
* **исключения по ``dip_type``**: cable, xt, jb. Кабели, клеммники и коробки
  сигналов не несут, но стоят на обоих видах и портили бы итог;
* **изделие считается один раз на лист**, но суммируется по листам: одно и то же
  изделие, встреченное на двух листах, даёт двойной вклад — так было в скрипте,
  и по этому признаку в отчёте видно продублированное изделие.

Сверка идёт двумя независимыми способами, и это тоже из скрипта: по TAG
(``dip_F_tag``) и по внутреннему ID изделия. Первый ловит переименования и
опечатки, второй — случаи, когда один и тот же объект проекта попал не на тот
вид.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from . import columns as cols
from . import e3api
from .excel_io import Block, ReportSheet
from .project import Project
from .task import Context

#: Столбцы блока «сводка по листам».
SHEET_BLOCK_HEADERS = ["№", "Имя листа", "Изделий", "DI", "DO", "AI", "AO", "ВСЕГО"]

OK = "OK"
MISMATCH = "РАСХОЖДЕНИЕ"
MISSING = "ОТСУТСТВУЕТ"


@dataclass
class Placement:
    """Размещение символа в терминах сверки — всё, что ей нужно от экспорта."""

    device_id: int
    sheet_id: int
    sheet_name: str
    view: str
    in_footer: bool


@dataclass
class DeviceData:
    """Прочитанные из E3 сведения об изделии, нужные сверке."""

    device_id: int
    name: str = ""
    di: int = 0
    do: int = 0
    ai: int = 0
    ao: int = 0
    pos_des: str = ""
    full_tag: str = ""
    short_tag: str = ""
    short_desc: str = ""
    device_type: str = ""
    signal_ids: tuple[str, ...] = field(default_factory=tuple)

    @property
    def counts(self) -> tuple[int, int, int, int]:
        return (self.di, self.do, self.ai, self.ao)

    def tag(self) -> str:
        """Ключ группировки: полный TAG, затем позиционное обозначение, затем имя."""
        return self.full_tag or self.pos_des or self.short_tag or self.name

    def excluded(self) -> bool:
        return self.device_type.strip().lower() in cols.EXCLUDED_DEVICE_TYPES


@dataclass
class _Totals:
    """Накопитель сигналов одной группы (лист, TAG или ID)."""

    di: int = 0
    do: int = 0
    ai: int = 0
    ao: int = 0
    devices: set[int] = field(default_factory=set)
    sheets: list[str] = field(default_factory=list)

    def add(self, data: DeviceData, sheet_name: str) -> None:
        self.di += data.di
        self.do += data.do
        self.ai += data.ai
        self.ao += data.ao
        self.devices.add(data.device_id)
        if sheet_name and sheet_name not in self.sheets:
            self.sheets.append(sheet_name)

    @property
    def counts(self) -> tuple[int, int, int, int]:
        return (self.di, self.do, self.ai, self.ao)

    @property
    def total(self) -> int:
        return self.di + self.do + self.ai + self.ao

    def sheet_list(self) -> str:
        return ", ".join(self.sheets) if self.sheets else MISSING


# ------------------------------------------------------------------------------
#  Чтение данных
# ------------------------------------------------------------------------------
def read_devices(project: Project, device_ids: set[int]) -> dict[int, DeviceData]:
    """Читает атрибуты сверки у перечисленных изделий — один проход по COM."""
    device = project.app.device()
    result: dict[int, DeviceData] = {}
    for device_id in sorted(device_ids):
        if not e3api.set_id(device, device_id):
            continue
        data = DeviceData(device_id=device_id, name=e3api.device_name(device))
        data.di = _as_int(e3api.attribute_value(device, cols.A_DI))
        data.do = _as_int(e3api.attribute_value(device, cols.A_DO))
        data.ai = _as_int(e3api.attribute_value(device, cols.A_AI))
        data.ao = _as_int(e3api.attribute_value(device, cols.A_AO))
        data.pos_des = e3api.attribute_value(device, cols.A_POS_DES)
        data.full_tag = e3api.attribute_value(device, cols.A_FULL_TAG)
        data.short_tag = e3api.attribute_value(device, cols.A_SHORT_TAG)
        data.short_desc = e3api.attribute_value(device, cols.A_SHORT_DESC)
        data.device_type = e3api.attribute_value(device, cols.A_DEVICE_TYPE)
        data.signal_ids = tuple(
            e3api.attribute_value(device, name) for name in cols.SIGNAL_ID_ATTRIBUTES
        )
        result[device_id] = data
    return result


def _as_int(value: str) -> int:
    """Число сигналов. Пустое и нечисловое — ноль, как в исходном скрипте."""
    text = (value or "").strip().replace(",", ".")
    if not text:
        return 0
    try:
        return int(float(text))
    except ValueError:
        return 0


# ------------------------------------------------------------------------------
#  Сбор
# ------------------------------------------------------------------------------
def counted_placements(placements: list[Placement], view: str) -> list[Placement]:
    """Какие размещения идут в зачёт для этого вида.

    Вид 4 — только подвал: на ФСА изделие нарисовано и в схеме, и в подвале, а
    перечнем сигналов является именно подвал. Вид 5 — всё, там дублей нет.
    """
    if view == "4":
        return [item for item in placements if item.view == "4" and item.in_footer]
    return [item for item in placements if item.view == view]


def _group(
    placements: list[Placement],
    devices: dict[int, DeviceData],
    key_of: Any,
) -> dict[Any, _Totals]:
    """Складывает сигналы по ключу, считая изделие один раз на лист."""
    result: dict[Any, _Totals] = {}
    seen_on_sheet: set[tuple[int, int]] = set()
    for item in placements:
        data = devices.get(item.device_id)
        if data is None or data.excluded():
            continue
        mark = (item.sheet_id, item.device_id)
        if mark in seen_on_sheet:
            continue
        seen_on_sheet.add(mark)
        key = key_of(data)
        if key in (None, ""):
            continue
        result.setdefault(key, _Totals()).add(data, item.sheet_name)
    return result


def _by_sheet(
    placements: list[Placement], devices: dict[int, DeviceData]
) -> dict[tuple[int, str], _Totals]:
    result: dict[tuple[int, str], _Totals] = {}
    seen: set[tuple[int, int]] = set()
    for item in placements:
        data = devices.get(item.device_id)
        if data is None or data.excluded():
            continue
        mark = (item.sheet_id, item.device_id)
        if mark in seen:
            continue
        seen.add(mark)
        result.setdefault((item.sheet_id, item.sheet_name), _Totals()).add(data, item.sheet_name)
    return result


# ------------------------------------------------------------------------------
#  Отчёт
# ------------------------------------------------------------------------------
def build_report(
    project: Project, placements: list[Placement], context: Context
) -> ReportSheet:
    """Собирает вкладку «Сверка сигналов» целиком."""
    log = context.log
    log.rule()
    log.info("Сверка сигналов: вид 4 (подвал) против вида 5 (все символы)")

    device_ids = {item.device_id for item in placements}
    devices = read_devices(project, device_ids)

    used4 = counted_placements(placements, "4")
    used5 = counted_placements(placements, "5")
    log.info(
        f"  размещений в зачёт: вид 4 — {len(used4)} (из {sum(1 for p in placements if p.view == '4')}), "
        f"вид 5 — {len(used5)}"
    )
    excluded = sorted(
        {devices[i].device_type for i in device_ids if i in devices and devices[i].excluded()}
    )
    if excluded:
        log.info(f"  исключены объекты с {cols.A_DEVICE_TYPE}: {', '.join(excluded)}")

    sheets4 = _by_sheet(used4, devices)
    sheets5 = _by_sheet(used5, devices)
    tags4 = _group(used4, devices, lambda data: data.tag())
    tags5 = _group(used5, devices, lambda data: data.tag())
    ids4 = _group(used4, devices, lambda data: data.device_id)
    ids5 = _group(used5, devices, lambda data: data.device_id)

    blocks: list[Block] = [
        _sheet_block("ЛИСТЫ С .PREFERRED_VIEW = 4 — функциональная схема (только подвал)", sheets4),
        _sheet_block("ЛИСТЫ С .PREFERRED_VIEW = 5 — схема соединений (все символы)", sheets5),
        _summary_block(sheets4, sheets5),
    ]

    tag_rows, tag_bad = _tag_rows(tags4, tags5, devices)
    blocks.append(
        Block(
            title=f"РАСХОЖДЕНИЯ ПО TAG ({cols.A_FULL_TAG}): {tag_bad}",
            headers=[
                "№", "TAG полный", "Поз. обозн (4)", "Поз. обозн (5)",
                "DI (4)", "DI (5)", "Разн.DI",
                "DO (4)", "DO (5)", "Разн.DO",
                "AI (4)", "AI (5)", "Разн.AI",
                "AO (4)", "AO (5)", "Разн.AO",
                "Листы вида 4", "Листы вида 5", "Описание краткое",
            ],
            rows=tag_rows,
            empty_note="Расхождений по TAG нет.",
        )
    )

    id_rows, id_bad = _id_rows(ids4, ids5, devices)
    blocks.append(
        Block(
            title=f"РАСХОЖДЕНИЯ ПО ВНУТРЕННЕМУ ID ИЗДЕЛИЯ: {id_bad}",
            headers=[
                "№", "Внутренний ID", "Имя изделия", "Поз. обозн", "Полный TAG",
                "DI (4)", "DI (5)", "DO (4)", "DO (5)",
                "AI (4)", "AI (5)", "AO (4)", "AO (5)",
                "Листы вида 4", "Листы вида 5",
            ],
            rows=id_rows,
            empty_note="Расхождений по внутреннему ID нет.",
        )
    )

    blocks.append(_signal_block(ids4, ids5, devices))

    log.info(
        f"  уникальных изделий: вид 4 — {len(ids4)}, вид 5 — {len(ids5)}; "
        f"расхождений по TAG {tag_bad}, по ID {id_bad}"
    )
    return ReportSheet(name=cols.SHEET_SIGNALS, blocks=blocks)


def _sheet_block(title: str, by_sheet: dict[tuple[int, str], _Totals]) -> Block:
    rows: list[list[Any]] = []
    grand = _Totals()
    for number, (key, totals) in enumerate(
        sorted(by_sheet.items(), key=lambda pair: (pair[0][1], pair[0][0])), start=1
    ):
        rows.append(
            [number, key[1], len(totals.devices), *totals.counts, totals.total]
        )
        grand.di += totals.di
        grand.do += totals.do
        grand.ai += totals.ai
        grand.ao += totals.ao
        grand.devices.update(totals.devices)
    rows.append(["", "ИТОГО:", len(grand.devices), *grand.counts, grand.total])
    return Block(
        title=title,
        headers=SHEET_BLOCK_HEADERS,
        rows=rows,
        total_rows=1,
        empty_note="Листов этого вида в выборке нет.",
    )


def _summary_block(
    sheets4: dict[tuple[int, str], _Totals], sheets5: dict[tuple[int, str], _Totals]
) -> Block:
    def totals(source: dict[tuple[int, str], _Totals]) -> tuple[int, int, int, int]:
        di = sum(item.di for item in source.values())
        do = sum(item.do for item in source.values())
        ai = sum(item.ai for item in source.values())
        ao = sum(item.ao for item in source.values())
        return di, do, ai, ao

    values4 = totals(sheets4)
    values5 = totals(sheets5)
    rows: list[list[Any]] = []
    for index, (name, _attribute) in enumerate(cols.SIGNAL_KINDS):
        difference = values4[index] - values5[index]
        rows.append(
            [name, values4[index], values5[index], difference, OK if difference == 0 else MISMATCH]
        )
    difference = sum(values4) - sum(values5)
    rows.append(
        ["ВСЕГО", sum(values4), sum(values5), difference, OK if difference == 0 else MISMATCH]
    )
    return Block(
        title="СВОДНАЯ ТАБЛИЦА СРАВНЕНИЯ",
        headers=["Тип", "Вид 4", "Вид 5", "Разница", "Статус"],
        rows=rows,
        status_column=4,
        total_rows=1,
    )


def _tag_rows(
    tags4: dict[Any, _Totals], tags5: dict[Any, _Totals], devices: dict[int, DeviceData]
) -> tuple[list[list[Any]], int]:
    rows: list[list[Any]] = []
    for tag in sorted(set(tags4) | set(tags5), key=str):
        left = tags4.get(tag)
        right = tags5.get(tag)
        counts4 = left.counts if left else (0, 0, 0, 0)
        counts5 = right.counts if right else (0, 0, 0, 0)
        if left is not None and right is not None and counts4 == counts5:
            continue
        sample = _sample_device(left, right, devices)
        cells: list[Any] = [
            len(rows) + 1,
            tag,
            sample.pos_des if left else "",
            sample.pos_des if right else "",
        ]
        for index in range(4):
            cells += [counts4[index], counts5[index], counts4[index] - counts5[index]]
        cells += [
            left.sheet_list() if left else MISSING,
            right.sheet_list() if right else MISSING,
            sample.short_desc,
        ]
        rows.append(cells)
    return rows, len(rows)


def _id_rows(
    ids4: dict[Any, _Totals], ids5: dict[Any, _Totals], devices: dict[int, DeviceData]
) -> tuple[list[list[Any]], int]:
    rows: list[list[Any]] = []
    for device_id in sorted(set(ids4) | set(ids5)):
        left = ids4.get(device_id)
        right = ids5.get(device_id)
        counts4 = left.counts if left else (0, 0, 0, 0)
        counts5 = right.counts if right else (0, 0, 0, 0)
        if left is not None and right is not None and counts4 == counts5:
            continue
        data = devices.get(device_id, DeviceData(device_id=device_id))
        rows.append(
            [
                len(rows) + 1,
                device_id,
                data.name,
                data.pos_des,
                data.full_tag,
                counts4[0], counts5[0],
                counts4[1], counts5[1],
                counts4[2], counts5[2],
                counts4[3], counts5[3],
                left.sheet_list() if left else MISSING,
                right.sheet_list() if right else MISSING,
            ]
        )
    return rows, len(rows)


def _signal_block(
    ids4: dict[Any, _Totals], ids5: dict[Any, _Totals], devices: dict[int, DeviceData]
) -> Block:
    rows: list[list[Any]] = []
    for number, device_id in enumerate(sorted(set(ids4) | set(ids5)), start=1):
        data = devices.get(device_id, DeviceData(device_id=device_id))
        left = ids4.get(device_id)
        right = ids5.get(device_id)
        if left is not None and right is not None:
            status = "в обоих видах"
        elif left is not None:
            status = "только вид 4"
        else:
            status = "только вид 5"
        signal_ids = list(data.signal_ids) + [""] * (len(cols.SIGNAL_ID_ATTRIBUTES) - len(data.signal_ids))
        rows.append(
            [
                number,
                device_id,
                data.name,
                data.pos_des,
                data.full_tag,
                *signal_ids[: len(cols.SIGNAL_ID_ATTRIBUTES)],
                left.sheet_list() if left else MISSING,
                right.sheet_list() if right else MISSING,
                status,
            ]
        )
    return Block(
        title=f"СИГНАЛЫ ИЗДЕЛИЙ ПО ВНУТРЕННЕМУ ID: {len(rows)}",
        headers=[
            "№", "Внутренний ID", "Имя изделия", "Поз. обозначение", "Полный TAG",
            *cols.SIGNAL_ID_ATTRIBUTES,
            "Листы вида 4", "Листы вида 5", "Статус",
        ],
        rows=rows,
        status_column=5 + len(cols.SIGNAL_ID_ATTRIBUTES) + 2,
        ok_values={"в обоих видах"},
        empty_note="Ни одного изделия с сигналами в выборке нет.",
    )


def _sample_device(
    left: _Totals | None, right: _Totals | None, devices: dict[int, DeviceData]
) -> DeviceData:
    """Любое изделие группы — из него берутся описание и позиционное обозначение."""
    for source in (left, right):
        if source is None:
            continue
        for device_id in sorted(source.devices):
            data = devices.get(device_id)
            if data is not None:
                return data
    return DeviceData(device_id=0)
