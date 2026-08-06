"""Кэш проекта: листы, объекты, сопоставление обозначений.

Здесь же живёт привязка символа к изделию по надписи. В COM-интерфейсе E3
обратной связи «символ -> изделие» нет: есть только Device.GetSymbolIds. Для
символов, которые не нашлись ни у одного изделия, остаётся сопоставление по
тексту на символе — на реальном проекте это подняло число изделий с
координатами с 15 до 187.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from . import e3api
from .log import Log
from .columns import H_POZ
from .util import norm_key, parse_num, strip_dash

#: Атрибут листа, по которому проект делится на виды (ФСА, схемы и т. п.).
VIEW_ATTRIBUTE = ".PREFERRED_VIEW"

#: Атрибуты, по которым символ опознаётся, если прямого совпадения нет.
MATCH_ATTRIBUTES = (
    "*TAG изделия короткий",
    "*TAG изделия полный",
)


@dataclass
class DeviceInfo:
    """То, что нужно знать об объекте проекта, не обращаясь к COM повторно."""

    device_id: int
    kind: str = "изделие"
    name: str = ""
    poz: str = ""
    match_values: tuple[str, ...] = field(default_factory=tuple)


class Project:
    """Снимок проекта в памяти плюс операции поиска."""

    def __init__(self, app: e3api.E3App, log: Log) -> None:
        self.app = app
        self.log = log
        self.sheet_names: dict[int, str] = {}
        self.sheet_ids_by_name: dict[str, int] = {}
        self.devices: dict[int, DeviceInfo] = {}
        self.id_by_poz: dict[str, int] = {}
        self.id_by_name: dict[str, int] = {}
        self.id_by_norm: dict[str, int] = {}
        self.allowed_sheet_ids: set[int] = set()
        self.views: set[str] = set()
        #: (нормализованный тег, исходное значение, id) — для мягкого поиска по надписи.
        self.match_index: list[tuple[str, str, int]] = []

    # --- загрузка -------------------------------------------------------------
    def reload(self) -> None:
        self.load_sheets()
        self.load_devices()

    def load_sheets(self) -> None:
        self.sheet_names.clear()
        self.sheet_ids_by_name.clear()

        ids = e3api.job_ids(self.app.job, "GetSheetIds")
        if not ids:
            self.log.warn("Листы получить не удалось.")
            return

        sheet = self.app.sheet()
        duplicates = 0
        for sheet_id in ids:
            if not e3api.set_id(sheet, sheet_id):
                continue
            name = e3api.sheet_name(sheet)
            if not name:
                continue
            self.sheet_names[sheet_id] = name
            if name in self.sheet_ids_by_name:
                duplicates += 1
            else:
                self.sheet_ids_by_name[name] = sheet_id

        self.log.info(
            f"Листов в проекте: {len(self.sheet_names)}, "
            f"уникальных имён: {len(self.sheet_ids_by_name)}"
        )
        if duplicates:
            self.log.info(
                f"Имена листов повторяются ({duplicates} повторов) — при импорте надёжен "
                "только столбец «ID листа», имя разрешается в первый подходящий лист."
            )

    def load_devices(self) -> None:
        """Собирает все объекты проекта: изделия, клеммы, разъёмы, кабели, шины.

        GetAllDeviceIds отдаёт только «обычные» изделия, поэтому остальные классы
        перечисляются отдельными методами Job.
        """
        self.devices.clear()
        self.id_by_poz.clear()
        self.id_by_name.clear()
        self.id_by_norm.clear()
        self.match_index.clear()

        parts: list[str] = []
        for method, kind in e3api.ID_SOURCES:
            ids = e3api.job_ids(self.app.job, method)
            if ids is None:
                continue
            added = 0
            for device_id in ids:
                if device_id not in self.devices:
                    self.devices[device_id] = DeviceInfo(device_id=device_id, kind=kind)
                    added += 1
            parts.append(f"{kind}: {added}")

        self.log.info(
            "Объекты проекта — " + ", ".join(parts) + f"; всего уникальных {len(self.devices)}"
        )
        if not self.devices:
            self.log.warn("Ни одного объекта получить не удалось.")
            return

        device = self.app.device()
        for info in self.devices.values():
            if not e3api.set_id(device, info.device_id):
                continue
            info.name = strip_dash(e3api.device_name(device))
            info.poz = e3api.attribute_value(device, H_POZ)
            matches = []
            for attribute in MATCH_ATTRIBUTES:
                value = e3api.attribute_value(device, attribute)
                if value:
                    matches.append(value)
            info.match_values = tuple(matches)

            if info.name and info.name not in self.id_by_name:
                self.id_by_name[info.name] = info.device_id
            if info.poz and info.poz not in self.id_by_poz:
                self.id_by_poz[info.poz] = info.device_id
            self._add_norm(info.name, info.device_id)
            self._add_norm(info.poz, info.device_id)
            for value in info.match_values:
                key = norm_key(value)
                if len(key) >= 4:
                    self.match_index.append((key, value, info.device_id))

        self.log.info(
            f"Сопоставление: по «{H_POZ}» {len(self.id_by_poz)}, "
            f"по имени {len(self.id_by_name)}"
        )

    def _add_norm(self, value: str, device_id: int) -> None:
        """Нормализованный ключ -> id. Неоднозначные ключи обнуляются."""
        key = norm_key(value)
        if len(key) < 3:
            return
        current = self.id_by_norm.get(key)
        if current is None:
            self.id_by_norm[key] = device_id
        elif current != device_id:
            self.id_by_norm[key] = 0

    # --- фильтр листов по виду ------------------------------------------------
    def apply_view_filter(self, views: set[str]) -> int:
        """Оставляет для работы только листы с нужным .PREFERRED_VIEW.

        Пустой набор видов означает «все листы»: так фильтр можно отключить.
        """
        self.views = set(views)
        self.allowed_sheet_ids.clear()
        if not views:
            self.allowed_sheet_ids.update(self.sheet_names.keys())
            self.log.info(f"Фильтр видов выключен: работаем со всеми листами ({len(self.allowed_sheet_ids)}).")
            return len(self.allowed_sheet_ids)

        sheet = self.app.sheet()
        for sheet_id in self.sheet_names:
            if not e3api.set_id(sheet, sheet_id):
                continue
            value = e3api.attribute_value(sheet, VIEW_ATTRIBUTE)
            if value in views:
                self.allowed_sheet_ids.add(sheet_id)
        self.log.info(
            f"Листов с {VIEW_ATTRIBUTE} из {{{', '.join(sorted(views))}}}: "
            f"{len(self.allowed_sheet_ids)}"
        )
        return len(self.allowed_sheet_ids)

    def sheet_allowed(self, sheet_id: int) -> bool:
        return sheet_id in self.allowed_sheet_ids

    def sheet_name_of(self, sheet_id: int) -> str:
        return self.sheet_names.get(sheet_id, "")

    # --- поиск ----------------------------------------------------------------
    def find_device(self, poz: str) -> int:
        """Ищет объект по обозначению: точное совпадение, затем нормализованное."""
        poz = (poz or "").strip()
        if not poz:
            return 0
        if poz in self.id_by_poz:
            return self.id_by_poz[poz]
        name = strip_dash(poz)
        if name in self.id_by_name:
            return self.id_by_name[name]
        return self.id_by_norm.get(norm_key(poz), 0)

    def find_sheet(self, name: str, sheet_id: int = 0) -> int:
        """Разрешает лист: ID важнее имени, имя разрешается и по числу («2» = «2.0»)."""
        if sheet_id and sheet_id in self.sheet_names:
            return sheet_id
        name = (name or "").strip()
        if not name:
            return 0
        if name in self.sheet_ids_by_name:
            return self.sheet_ids_by_name[name]
        wanted = parse_num(name)
        if wanted is not None:
            for existing, existing_id in self.sheet_ids_by_name.items():
                value = parse_num(existing)
                if value is not None and abs(value - wanted) < 1e-7:
                    return existing_id
        return 0

    def find_allowed_sheet(self, name: str, sheet_id: int = 0) -> int:
        """Как find_sheet, но результат обязан входить в выбранные виды."""
        if sheet_id and self.sheet_allowed(sheet_id):
            return sheet_id
        name = (name or "").strip()
        if name:
            target = name.lower()
            for allowed_id in self.allowed_sheet_ids:
                if self.sheet_names.get(allowed_id, "").lower() == target:
                    return allowed_id
        resolved = self.find_sheet(name, sheet_id)
        if resolved and self.sheet_allowed(resolved):
            return resolved
        return 0

    # --- привязка символа к изделию по надписи --------------------------------
    def device_by_symbol_text(
        self,
        symbol: Any,
        text_obj: Any,
        loose: bool = True,
        max_texts: int = 12,
    ) -> tuple[int, str]:
        """Опознаёт изделие по надписям на символе.

        Сначала точное совпадение нормализованного ключа — оно надёжно. Затем,
        если разрешено, поиск по атрибутам-тегам изделия; этот проход мягче и
        может ошибиться, поэтому его можно отключить.
        """
        if text_obj is None:
            return 0, ""
        text_ids = e3api.symbol_text_ids(symbol)
        if not text_ids:
            return 0, ""

        texts: list[str] = []
        for text_id in text_ids[:max_texts]:
            value = e3api.text_value(text_obj, text_id)
            if value:
                texts.append(value)
        if not texts:
            return 0, ""

        for text in texts:
            key = norm_key(text)
            if len(key) < 3:
                continue
            device_id = self.id_by_norm.get(key, 0)
            if device_id > 0:
                return device_id, text

        if not loose:
            return 0, ""

        for text in texts:
            key = norm_key(text)
            if len(key) < 4:
                continue
            for other, value, device_id in self.match_index:
                if key == other or key in other or other in key:
                    return device_id, f"{text} (атрибут: {value})"
        return 0, ""

    def kind_of(self, device_id: int) -> str:
        info = self.devices.get(device_id)
        return info.kind if info else ""

    def poz_of(self, device_id: int) -> str:
        info = self.devices.get(device_id)
        if info is None:
            return ""
        return info.poz or info.name

    def remember_new_device(self, device_id: int, poz: str) -> None:
        """Добавляет только что созданное изделие в кэш, чтобы не перечитывать всё."""
        if device_id <= 0:
            return
        info = DeviceInfo(device_id=device_id, kind="изделие", name=strip_dash(poz), poz=poz)
        self.devices[device_id] = info
        self.id_by_poz.setdefault(poz, device_id)
        self.id_by_name.setdefault(strip_dash(poz), device_id)
        self._add_norm(poz, device_id)
