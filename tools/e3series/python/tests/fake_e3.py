"""Поддельная E3.series для тестов.

Повторяет соглашения настоящего COM-интерфейса, включая те, на которых
HTA-версия спотыкалась:

* массивы идентификаторов отдаются 1-based — нулевой элемент служебный;
* GetSchemaLocation возвращает лист в возвращаемом значении, а координаты —
  в out-параметрах, и отдаёт 0 для неразмещённого символа и для gate;
* Place и создаёт, и перемещает символ;
* Connection.Create ждёт 1-based массивы.

Благодаря этому экспорт и импорт целиком проверяются на любой машине.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


def one_based(ids: list[int] | tuple[int, ...]) -> tuple[int, tuple]:
    """Возвращает (количество, массив с фиктивным нулевым элементом)."""
    return len(ids), tuple([0] + list(ids))


@dataclass
class FakeSheet:
    sheet_id: int
    name: str
    view: str = "4"
    #: Имя символа рамки — то, что E3 отдаёт через Sheet.GetFormat.
    fmt: str = "A2_ГОСТ"
    area: tuple[float, float, float, float] = (0.0, 0.0, 594.0, 420.0)
    symbol_ids: list[int] = field(default_factory=list)
    segment_ids: list[int] = field(default_factory=list)
    text_ids: list[int] = field(default_factory=list)


@dataclass
class FakeSymbol:
    symbol_id: int
    name: str = "символ"
    sheet_id: int = 0
    x: float = 0.0
    y: float = 0.0
    rotation: str = "0"
    texts: list[str] = field(default_factory=list)
    #: gate не отдаёт положение обратно, хотя запись проходит
    gate: bool = False
    #: Имя типа символа в базе. «Подвал_…» означает символ подвала.
    type_name: str = "Обычный"
    version: str = "1"
    scale: float = 1.0


@dataclass
class FakeDevice:
    device_id: int
    name: str
    component: str = ""
    attributes: dict[str, str] = field(default_factory=dict)
    symbol_ids: list[int] = field(default_factory=list)


@dataclass
class FakeText:
    """Надпись: и подпись символа, и свободный текст листа.

    Настоящая E3 не различает их в Sheet.GetTextIds — оба вида приходят одним
    списком. Различие видно только по Symbol.GetTextIds, и программа обязана
    вычитать подписи символов сама.
    """

    text_id: int
    value: str
    sheet_id: int = 0
    x: float = 0.0
    y: float = 0.0
    rotation: float = 0.0
    height: float = 3.5
    kind: int = 1
    #: Символ-владелец. 0 — свободная надпись листа.
    owner: int = 0


@dataclass
class FakeSegment:
    segment_id: int
    sheet_id: int
    points: list[tuple[float, float]]
    types: list[int] = field(default_factory=list)
    signal: str = ""


class FakeModel:
    """Состояние «проекта»: листы, изделия, символы, провода."""

    def __init__(self) -> None:
        self.sheets: dict[int, FakeSheet] = {}
        self.devices: dict[int, FakeDevice] = {}
        self.symbols: dict[int, FakeSymbol] = {}
        self.segments: dict[int, FakeSegment] = {}
        self.texts: dict[int, FakeText] = {}
        self.terminal_ids: list[int] = []
        self.cable_ids: list[int] = []
        self.created_connections: list[tuple[int, list[tuple[float, float]]]] = []
        self.saved = False
        #: следы пакетного режима — по ним проверяем, что E3 отпущена корректно
        self.dialogs_enabled = True
        self.messages_suppressed = False
        self.finalized = 0
        self.undo_after_execution: bool | None = None
        self.undo_removed = 0
        self.slept_ms: list[int] = []
        #: Рамки, которые «есть в библиотеке»: SetFormat с другим именем откажет.
        self.known_formats: set[str] = {"A2_ГОСТ", "A3_ГОСТ", "A1_ГОСТ"}
        #: Символы, которые «есть в базе» — Symbol.Load отдаёт только их.
        self.known_symbols: set[str] = {"Обычный", "Подвал_DI_DO", "Подвал_AI", "Рамка"}
        #: GID -> (тип объекта, идентификатор). Так же устроен и реестр E3.
        self.gids: dict[str, tuple[str, int]] = {}
        self.formats_applied: list[tuple[int, str]] = []
        self._next_id = 9000

    # --- построение сцены -----------------------------------------------------
    def add_sheet(
        self,
        sheet_id: int,
        name: str,
        view: str = "4",
        fmt: str = "A2_ГОСТ",
        area: tuple[float, float, float, float] = (0.0, 0.0, 594.0, 420.0),
    ) -> FakeSheet:
        sheet = FakeSheet(sheet_id, name, view, fmt, area)
        self.sheets[sheet_id] = sheet
        return sheet

    def add_device(
        self,
        device_id: int,
        name: str,
        component: str = "компонент",
        attributes: dict[str, str] | None = None,
    ) -> FakeDevice:
        device = FakeDevice(device_id, name, component, dict(attributes or {}))
        self.devices[device_id] = device
        return device

    def add_symbol(
        self,
        symbol_id: int,
        device_id: int | None = None,
        sheet_id: int = 0,
        x: float = 0.0,
        y: float = 0.0,
        texts: list[str] | None = None,
        gate: bool = False,
        type_name: str = "Обычный",
    ) -> FakeSymbol:
        symbol = FakeSymbol(
            symbol_id, f"S{symbol_id}", sheet_id, x, y, "0", list(texts or []), gate, type_name
        )
        self.symbols[symbol_id] = symbol
        for index, text in enumerate(symbol.texts, start=1):
            text_id = symbol_id * 100 + index
            self.texts[text_id] = FakeText(
                text_id, text, sheet_id=sheet_id, x=x, y=y, owner=symbol_id
            )
            if sheet_id:
                self.sheets[sheet_id].text_ids.append(text_id)
        if device_id is not None:
            self.devices[device_id].symbol_ids.append(symbol_id)
        if sheet_id:
            self.sheets[sheet_id].symbol_ids.append(symbol_id)
        return symbol

    def add_segment(
        self,
        segment_id: int,
        sheet_id: int,
        points: list[tuple[float, float]],
        signal: str = "",
    ) -> FakeSegment:
        segment = FakeSegment(segment_id, sheet_id, points, [0] * len(points), signal)
        self.segments[segment_id] = segment
        self.sheets[sheet_id].segment_ids.append(segment_id)
        return segment

    def add_text(
        self,
        text_id: int,
        sheet_id: int,
        value: str,
        x: float = 0.0,
        y: float = 0.0,
        rotation: float = 0.0,
    ) -> FakeText:
        """Свободная надпись листа — та, что программа обязана переносить."""
        text = FakeText(text_id, value, sheet_id=sheet_id, x=x, y=y, rotation=rotation)
        self.texts[text_id] = text
        self.sheets[sheet_id].text_ids.append(text_id)
        return text

    # --- GID ------------------------------------------------------------------
    #  Настоящая E3 выдаёт объекту постоянный глобальный идентификатор сама
    #  (TLB 23.00). Здесь он выдаётся так же — по типу и номеру, — а SetGID,
    #  как и в E3, не присваивает, а ищет объект и делает его текущим.
    #: Где какие объекты живут — чтобы SetGID проверял, что объект существует.
    _GID_SCOPES = {
        "sym": "symbols",
        "dev": "devices",
        "txt": "texts",
        "net": "segments",
        "sht": "sheets",
    }

    def gid_of(self, kind: str, item_id: int) -> str:
        gid = f"{{{kind}-{item_id:08d}}}"
        self.gids[gid] = (kind, item_id)
        return gid

    def by_gid(self, kind: str, gid: str) -> int:
        """Находит объект по GID.

        GID разбирается, а не ищется в реестре прочитанных: в настоящей E3 он
        свойство самого объекта и работает независимо от того, читал ли его
        кто-нибудь раньше. Реестр здесь только для наглядности.
        """
        text = (gid or "").strip()
        if not (text.startswith("{") and text.endswith("}") and "-" in text):
            return 0
        prefix, _, number = text[1:-1].partition("-")
        if prefix != kind or not number.isdigit():
            return 0
        item_id = int(number)
        return item_id if item_id in getattr(self, self._GID_SCOPES[kind], {}) else 0

    def next_id(self) -> int:
        self._next_id += 1
        return self._next_id


# ------------------------------------------------------------------------------
#  COM-подобные объекты
# ------------------------------------------------------------------------------
class _Item:
    def __init__(self, model: FakeModel) -> None:
        self.model = model
        self.id = 0

    def SetId(self, item_id: int) -> int:
        self.id = int(item_id)
        return self.id

    def GetId(self) -> int:
        return self.id


class SheetObject(_Item):
    def _sheet(self) -> FakeSheet | None:
        return self.model.sheets.get(self.id)

    def GetName(self) -> str:
        sheet = self._sheet()
        return sheet.name if sheet else ""

    def GetAttributeValue(self, name: str) -> str:
        sheet = self._sheet()
        if sheet is None:
            return ""
        if name == ".PREFERRED_VIEW":
            return sheet.view
        return ""

    def SetAttributeValue(self, name: str, value: str) -> int:
        sheet = self._sheet()
        if sheet is None:
            raise RuntimeError("нет такого листа")
        if name == ".PREFERRED_VIEW":
            sheet.view = value
            return 1
        return 0

    def GetSymbolIds(self, dummy: Any) -> tuple:
        sheet = self._sheet()
        count, ids = one_based(sheet.symbol_ids if sheet else [])
        return count, ids

    def GetNetSegmentIds(self, dummy: Any) -> tuple:
        sheet = self._sheet()
        count, ids = one_based(sheet.segment_ids if sheet else [])
        return count, ids

    def GetTextIds(self, dummy: Any, txttyp: int = 0, search: str = "") -> tuple:
        # Как настоящая E3: подписи символов и свободные надписи одним списком.
        sheet = self._sheet()
        return one_based(sheet.text_ids if sheet else [])

    def GetFormat(self) -> str:
        sheet = self._sheet()
        return sheet.fmt if sheet else "<Empty>"

    def SetFormat(self, name: str, rotation: str = "") -> int:
        sheet = self._sheet()
        if sheet is None:
            return 0
        if name not in self.model.known_formats:
            return 0  # настоящая E3 тоже откажет, если рамки нет в библиотеке
        sheet.fmt = name
        self.model.formats_applied.append((sheet.sheet_id, name))
        return 1

    def GetDrawingArea(self, *dummies: Any) -> tuple:
        sheet = self._sheet()
        if sheet is None:
            return (0, 0.0, 0.0, 0.0, 0.0)
        return (1, *sheet.area)

    def Create(self, modi: int, name: str, symbol: str, position: int, before: int) -> int:
        if symbol not in self.model.known_formats:
            return 0
        new_id = self.model.next_id()
        self.model.add_sheet(new_id, name, view="", fmt=symbol)
        self.id = new_id
        return new_id


class DeviceObject(_Item):
    def _device(self) -> FakeDevice | None:
        return self.model.devices.get(self.id)

    def SetId(self, item_id: int) -> int:
        """Как в настоящей E3: по идентификатору символа находит владельца.

        Пространство идентификаторов у объектов общее, поэтому Device.SetId,
        получив символ, делает текущим изделие, которому символ принадлежит.
        На этом построен рабочий скрипт сверки сигналов у пользователя.
        """
        item_id = int(item_id)
        if item_id in self.model.devices:
            self.id = item_id
            return self.id
        for device in self.model.devices.values():
            if item_id in device.symbol_ids:
                self.id = device.device_id
                return self.id
        self.id = item_id
        return 0

    def GetGID(self) -> str:
        device = self._device()
        return self.model.gid_of("dev", device.device_id) if device else "<Empty>"

    def SetGID(self, gid: str) -> str:
        found = self.model.by_gid("dev", gid)
        if not found:
            return "<Empty>"
        self.id = found
        return gid

    def GetName(self) -> str:
        device = self._device()
        return device.name if device else ""

    def GetComponentName(self) -> str:
        device = self._device()
        return device.component if device else ""

    def GetAttributeValue(self, name: str) -> str:
        device = self._device()
        if device is None:
            return ""
        return device.attributes.get(name, "")

    def SetAttributeValue(self, name: str, value: str) -> int:
        device = self._device()
        if device is None:
            raise RuntimeError("нет такого изделия")
        device.attributes[name] = value
        return 1

    def GetSymbolIds(self, dummy: Any, get_mode: int = 0) -> tuple:
        device = self._device()
        count, ids = one_based(device.symbol_ids if device else [])
        return count, ids

    def Create(self, name: str, assignment: str, location: str, comp: str, vers: str, after: int) -> int:
        if not comp:
            raise RuntimeError("компонент не задан")
        new_id = self.model.next_id()
        device = self.model.add_device(new_id, name, comp)
        # У созданного изделия сразу есть схемный символ — как в реальной библиотеке.
        symbol_id = self.model.next_id()
        self.model.add_symbol(symbol_id, new_id)
        device.attributes["Поз. обозначение"] = name
        self.id = new_id
        return new_id


class SymbolObject(_Item):
    def _symbol(self) -> FakeSymbol | None:
        return self.model.symbols.get(self.id)

    def GetName(self) -> str:
        symbol = self._symbol()
        return symbol.name if symbol else ""

    def GetRotation(self) -> str:
        symbol = self._symbol()
        return symbol.rotation if symbol else ""

    def GetSchemaLocation(self, *dummies: Any) -> tuple:
        """Возвращает (лист, x, y, сетка, колонка, строка)."""
        symbol = self._symbol()
        if symbol is None:
            return (0, None, None, "", "", "")
        if symbol.gate or not symbol.sheet_id:
            # Ноль вместо листа: неразмещённый символ либо gate.
            return (0, symbol.x, symbol.y, "", "", "")
        return (symbol.sheet_id, symbol.x, symbol.y, "/1.A1", "A", "1")

    def Place(self, sheet_id: int, x: float, y: float, *rest: Any) -> int:
        symbol = self._symbol()
        if symbol is None:
            raise RuntimeError("нет такого символа")
        if sheet_id not in self.model.sheets:
            raise RuntimeError("нет такого листа")
        if symbol.sheet_id and symbol.symbol_id in self.model.sheets[symbol.sheet_id].symbol_ids:
            self.model.sheets[symbol.sheet_id].symbol_ids.remove(symbol.symbol_id)
        symbol.sheet_id = sheet_id
        symbol.x = float(x)
        symbol.y = float(y)
        if rest and isinstance(rest[0], str) and rest[0]:
            symbol.rotation = rest[0]
        self.model.sheets[sheet_id].symbol_ids.append(symbol.symbol_id)
        return 1

    def GetSymbolType(self) -> int:
        symbol = self._symbol()
        if symbol is None:
            return -1
        return 14  # SymbolType.Normal

    def GetSymbolTypeName(self) -> str:
        symbol = self._symbol()
        return symbol.type_name if symbol else "<Empty>"

    def GetVersion(self) -> str:
        symbol = self._symbol()
        return symbol.version if symbol else "<Empty>"

    def GetScaling(self) -> float:
        symbol = self._symbol()
        return symbol.scale if symbol else 1.0

    def SetScaling(self, scale: float) -> float:
        symbol = self._symbol()
        if symbol is None:
            raise RuntimeError("нет такого символа")
        symbol.scale = float(scale)
        return symbol.scale

    def Load(self, name: str, version: str = "") -> int:
        """Берёт символ из базы. Настоящая E3 тоже отдаёт неразмещённый символ."""
        if name not in self.model.known_symbols:
            return 0
        new_id = self.model.next_id()
        self.model.add_symbol(new_id, type_name=name)
        self.model.symbols[new_id].version = version
        self.id = new_id
        return new_id

    def GetGID(self) -> str:
        symbol = self._symbol()
        return self.model.gid_of("sym", symbol.symbol_id) if symbol else "<Empty>"

    def SetGID(self, gid: str) -> str:
        found = self.model.by_gid("sym", gid)
        if not found:
            return "<Empty>"
        self.id = found
        return gid

    def GetTextIds(self, dummy: Any, txttyp: int = 0, search: str = "") -> tuple:
        symbol = self._symbol()
        if symbol is None:
            return 0, (0,)
        ids = [symbol.symbol_id * 100 + index for index in range(1, len(symbol.texts) + 1)]
        return one_based(ids)


class TextObject(_Item):
    def _text(self) -> FakeText | None:
        return self.model.texts.get(self.id)

    def GetText(self) -> str:
        text = self._text()
        return text.value if text else ""

    def SetText(self, newtext: str) -> int:
        text = self._text()
        if text is None:
            raise RuntimeError("нет такой надписи")
        text.value = newtext
        return 1

    def GetType(self) -> int:
        text = self._text()
        return text.kind if text else 0

    def GetHeight(self) -> float:
        text = self._text()
        return text.height if text else 0.0

    def GetRotation(self) -> float:
        text = self._text()
        return text.rotation if text else 0.0

    def GetSchemaLocation(self, *dummies: Any) -> tuple:
        text = self._text()
        if text is None or not text.sheet_id:
            return (0, 0.0, 0.0, "", "", "")
        return (text.sheet_id, text.x, text.y, "/1.A1", "A", "1")

    def SetSchemaLocation(self, x: float, y: float) -> int:
        text = self._text()
        if text is None:
            raise RuntimeError("нет такой надписи")
        text.x = float(x)
        text.y = float(y)
        return 1

    def GetGID(self) -> str:
        text = self._text()
        return self.model.gid_of("txt", text.text_id) if text else "<Empty>"

    def SetGID(self, gid: str) -> str:
        found = self.model.by_gid("txt", gid)
        if not found:
            return "<Empty>"
        self.id = found
        return gid


class GraphObject(_Item):
    def CreateText(self, sheet_id: int, value: str, x: float, y: float) -> int:
        if sheet_id not in self.model.sheets:
            return 0
        return self.model.add_text(self.model.next_id(), sheet_id, value, x, y).text_id

    def CreateRotatedText(
        self, sheet_id: int, value: str, x: float, y: float, rotation: float
    ) -> int:
        if sheet_id not in self.model.sheets:
            return 0
        text = self.model.add_text(self.model.next_id(), sheet_id, value, x, y, rotation)
        return text.text_id


class NetSegmentObject(_Item):
    def _segment(self) -> FakeSegment | None:
        return self.model.segments.get(self.id)

    def GetLineSegments(self, *dummies: Any) -> tuple:
        segment = self._segment()
        if segment is None:
            return (0, 0, (0.0,), (0.0,), (0,))
        xs = tuple([0.0] + [point[0] for point in segment.points])
        ys = tuple([0.0] + [point[1] for point in segment.points])
        types = tuple([0] + list(segment.types))
        return (len(segment.points), segment.sheet_id, xs, ys, types)

    def GetSignalName(self) -> str:
        segment = self._segment()
        return segment.signal if segment else ""

    def GetGID(self) -> str:
        segment = self._segment()
        return self.model.gid_of("net", segment.segment_id) if segment else "<Empty>"


class ConnectionObject(_Item):
    def Create(self, sheet_id: int, count: int, xs: Any, ys: Any, types: Any = None) -> int:
        if sheet_id not in self.model.sheets:
            return 0
        # Настоящая E3 ждёт 1-based массивы: элементов на один больше, чем точек.
        if len(xs) != count + 1 or len(ys) != count + 1:
            return 0
        points = list(zip(list(xs)[1:], list(ys)[1:]))
        self.model.created_connections.append((sheet_id, points))
        return self.model.next_id()


class JobObject:
    def __init__(self, model: FakeModel) -> None:
        self.model = model

    def GetName(self) -> str:
        return "ТестовыйПроект"

    def Save(self) -> int:
        self.model.saved = True
        return 1

    def FinalizeTransaction(self) -> int:
        self.model.finalized += 1
        return 0

    def UndoAfterExecution(self, newval: bool = True) -> int:
        self.model.undo_after_execution = bool(newval)
        return 0

    def RemoveUndoInformation(self) -> int:
        self.model.undo_removed += 1
        return 0

    def GetSheetIds(self, dummy: Any) -> tuple:
        return one_based(sorted(self.model.sheets.keys()))

    def GetAllDeviceIds(self, dummy: Any) -> tuple:
        ids = [
            device_id
            for device_id in sorted(self.model.devices.keys())
            if device_id not in self.model.terminal_ids and device_id not in self.model.cable_ids
        ]
        return one_based(ids)

    def GetTerminalIds(self, dummy: Any) -> tuple:
        return one_based(self.model.terminal_ids)

    def GetCableIds(self, dummy: Any) -> tuple:
        return one_based(self.model.cable_ids)

    def GetConnectorIds(self, dummy: Any) -> tuple:
        return one_based([])

    def GetBlockIds(self, dummy: Any) -> tuple:
        return one_based([])

    def GetBusbarIds(self, dummy: Any, flags: int = 0) -> tuple:
        return one_based([])

    def CreateSheetObject(self) -> SheetObject:
        return SheetObject(self.model)

    def CreateDeviceObject(self) -> DeviceObject:
        return DeviceObject(self.model)

    def CreateSymbolObject(self) -> SymbolObject:
        return SymbolObject(self.model)

    def CreateTextObject(self) -> TextObject:
        return TextObject(self.model)

    def CreateGraphObject(self) -> GraphObject:
        return GraphObject(self.model)

    def CreateNetSegmentObject(self) -> NetSegmentObject:
        return NetSegmentObject(self.model)

    def CreateConnectionObject(self) -> ConnectionObject:
        return ConnectionObject(self.model)


class ApplicationObject:
    def __init__(self, model: FakeModel) -> None:
        self.model = model

    def CreateJobObject(self) -> JobObject:
        return JobObject(self.model)

    def GetVersion(self) -> str:
        return "2022 SP2"

    def GetBuild(self) -> str:
        return "23.20.0.0"

    def GetEnableInteractiveDialogs(self) -> int:
        return 1 if self.model.dialogs_enabled else 0

    def SetEnableInteractiveDialogs(self, value: bool) -> int:
        previous = self.model.dialogs_enabled
        self.model.dialogs_enabled = bool(value)
        return 1 if previous else 0

    def SuppressMessages(self, suppress: bool, flags: int = 0) -> int:
        self.model.messages_suppressed = bool(suppress)
        return 1

    def Sleep(self, msec: int) -> int:
        self.model.slept_ms.append(int(msec))
        return 1


def sample_model() -> FakeModel:
    """Сцена по мотивам настоящего чертежа.

    Листы: «1» и «2» — ФСА (вид 4), «3» и снова «1» — схемы соединений (вид 5).
    Одноимённые листы «1» разных видов — не выдумка: так сделан проект
    пользователя, и по одному имени такой лист не определить.

    На листе «1» есть обе зоны: схемная часть (Y около 300–370) и подвал —
    таблица внизу чертежа (Y около 30), где то же изделие стоит второй раз.
    """
    model = FakeModel()
    model.add_sheet(11, "1", view="4", fmt="A2_ГОСТ")
    model.add_sheet(12, "2", view="4", fmt="A2_ГОСТ")
    model.add_sheet(13, "3", view="5", fmt="A3_ГОСТ")
    model.add_sheet(14, "1", view="5", fmt="A3_ГОСТ")

    model.add_device(
        101,
        "-094-XVM-1201A",
        "клапан",
        {
            "Поз. обозначение": "094-XVM-1201A",
            "dip_F_tag": "094-XVM-1201A",
            "dip_Fnumber": "1201A",
            "dip_type": "valve",
            "!Dev_OpisaniePR_DI": "2",
            "!Dev_OpisaniePR_DO": "1",
            "ID Сигнала 1": "S-001",
        },
    )
    model.add_symbol(1001, device_id=101, sheet_id=11, x=76.0, y=367.0)

    model.add_device(
        102,
        "-094-XVM-1202A",
        "клапан",
        {
            "Поз. обозначение": "094-XVM-1202A",
            "dip_F_tag": "094-XVM-1202A",
            "dip_type": "valve",
            "!Dev_OpisaniePR_AI": "1",
        },
    )
    model.add_symbol(1002, device_id=102, sheet_id=12, x=351.0, y=370.0)

    # Изделие есть, символ создан, но на лист не поставлен.
    model.add_device(103, "-094-TS-1203", "датчик", {"Поз. обозначение": "094-TS-1203"})
    model.add_symbol(1003, device_id=103)

    # Изделие без символов вообще — размещать нечего.
    model.add_device(104, "-094-TS-1204", "датчик без символа", {"Поз. обозначение": "094-TS-1204"})

    # Символ на листе, который ни одно изделие не отдаёт через GetSymbolIds:
    # опознаётся только по надписи.
    model.add_device(105, "-094-PT-1205", "датчик", {"Поз. обозначение": "094-PT-1205"})
    orphan = model.add_symbol(1005, sheet_id=12, x=120.0, y=200.0, texts=["094-PT-1205"])
    assert orphan.symbol_id == 1005

    # Символ на листе вида 5 — при фильтре {4} в выгрузку попадать не должен.
    model.add_device(106, "-094-XV-1206", "клапан", {"Поз. обозначение": "094-XV-1206"})
    model.add_symbol(1006, device_id=106, sheet_id=13, x=50.0, y=50.0)

    # gate: запись проходит, обратное чтение листа не даёт.
    model.add_device(107, "-094-GATE-1207", "врезка", {"Поз. обозначение": "094-GATE-1207"})
    model.add_symbol(1007, device_id=107, gate=True)

    # Подвал ФСА: то же изделие 101 второй раз, строкой в таблице внизу листа.
    # Имя типа символа начинается на «Подвал_» — именно так подвал и опознаётся.
    model.add_symbol(
        1008, device_id=101, sheet_id=11, x=126.0, y=32.0, type_name="Подвал_DI_DO"
    )

    # Изделие, размещённое на двух одноимённых листах «1» разных видов: на ФСА
    # и на схеме соединений. По имени листа их не различить — только по виду.
    model.add_device(
        108,
        "-094-FT-1208",
        "расходомер",
        {
            "Поз. обозначение": "094-FT-1208",
            "dip_F_tag": "094-FT-1208",
            "dip_type": "flow",
            "!Dev_OpisaniePR_AI": "1",
        },
    )
    model.add_symbol(1009, device_id=108, sheet_id=11, x=200.0, y=300.0)
    model.add_symbol(1010, device_id=108, sheet_id=14, x=210.0, y=260.0)
    # Подвальная строка того же изделия на ФСА — она и идёт в зачёт сверки.
    model.add_symbol(
        1011, device_id=108, sheet_id=11, x=126.0, y=40.0, type_name="Подвал_AI"
    )

    # Кабель: в сверке не участвует (dip_type = cable), но на листах стоит.
    model.add_device(
        109,
        "-W-1209",
        "кабель",
        {"Поз. обозначение": "W-1209", "dip_type": "cable", "!Dev_OpisaniePR_DI": "9"},
    )
    model.add_symbol(1012, device_id=109, sheet_id=14, x=300.0, y=290.0)

    # Свободные надписи листа: их программа обязана переносить.
    model.add_text(3001, 11, "ПРИМЕЧАНИЕ: уставки уточняются", x=40.0, y=120.0)
    model.add_text(3002, 13, "Схема соединений шкафа", x=30.0, y=390.0)

    model.add_segment(2001, 11, [(10.0, 10.0), (10.0, 50.0), (80.0, 50.0)], signal="СИГ-1")
    model.add_segment(2002, 12, [(20.0, 20.0), (60.0, 20.0)], signal="СИГ-2")
    model.add_segment(2003, 13, [(5.0, 5.0), (9.0, 5.0)], signal="СИГ-3")
    return model
