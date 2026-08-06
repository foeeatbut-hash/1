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
    symbol_ids: list[int] = field(default_factory=list)
    segment_ids: list[int] = field(default_factory=list)


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


@dataclass
class FakeDevice:
    device_id: int
    name: str
    component: str = ""
    attributes: dict[str, str] = field(default_factory=dict)
    symbol_ids: list[int] = field(default_factory=list)


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
        self.texts: dict[int, str] = {}
        self.terminal_ids: list[int] = []
        self.cable_ids: list[int] = []
        self.created_connections: list[tuple[int, list[tuple[float, float]]]] = []
        self.saved = False
        self._next_id = 9000

    # --- построение сцены -----------------------------------------------------
    def add_sheet(self, sheet_id: int, name: str, view: str = "4") -> FakeSheet:
        sheet = FakeSheet(sheet_id, name, view)
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
    ) -> FakeSymbol:
        symbol = FakeSymbol(symbol_id, f"S{symbol_id}", sheet_id, x, y, "0", list(texts or []), gate)
        self.symbols[symbol_id] = symbol
        for index, text in enumerate(symbol.texts, start=1):
            self.texts[symbol_id * 100 + index] = text
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

    def GetSymbolIds(self, dummy: Any) -> tuple:
        sheet = self._sheet()
        count, ids = one_based(sheet.symbol_ids if sheet else [])
        return count, ids

    def GetNetSegmentIds(self, dummy: Any) -> tuple:
        sheet = self._sheet()
        count, ids = one_based(sheet.segment_ids if sheet else [])
        return count, ids


class DeviceObject(_Item):
    def _device(self) -> FakeDevice | None:
        return self.model.devices.get(self.id)

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

    def GetTextIds(self, dummy: Any, txttyp: int = 0, search: str = "") -> tuple:
        symbol = self._symbol()
        if symbol is None:
            return 0, (0,)
        ids = [symbol.symbol_id * 100 + index for index in range(1, len(symbol.texts) + 1)]
        return one_based(ids)


class TextObject(_Item):
    def GetText(self) -> str:
        return self.model.texts.get(self.id, "")

    def GetType(self) -> int:
        return 1


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


def sample_model() -> FakeModel:
    """Небольшая сцена: два листа разных видов, изделия, gate, провод."""
    model = FakeModel()
    model.add_sheet(11, "1", view="4")
    model.add_sheet(12, "2", view="4")
    model.add_sheet(13, "3", view="5")

    model.add_device(101, "-094-XVM-1201A", "клапан", {"Поз. обозначение": "094-XVM-1201A"})
    model.add_symbol(1001, device_id=101, sheet_id=11, x=76.0, y=367.0)

    model.add_device(102, "-094-XVM-1202A", "клапан", {"Поз. обозначение": "094-XVM-1202A"})
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

    model.add_segment(2001, 11, [(10.0, 10.0), (10.0, 50.0), (80.0, 50.0)], signal="СИГ-1")
    model.add_segment(2002, 12, [(20.0, 20.0), (60.0, 20.0)], signal="СИГ-2")
    model.add_segment(2003, 13, [(5.0, 5.0), (9.0, 5.0)], signal="СИГ-3")
    return model
