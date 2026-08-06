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
from .columns import H_POZ, ZONE_FOOTER, ZONE_SCHEMA, view_title
from .util import norm_key, parse_num, strip_dash

#: Атрибут листа, по которому проект делится на виды (ФСА, схемы и т. п.).
VIEW_ATTRIBUTE = ".PREFERRED_VIEW"

#: Минимальная ширина пустой полосы между схемой и подвалом, мм.
MIN_FOOTER_GAP = 20.0

#: Граница подвала ищется только в нижней части листа — вот в какой доле высоты.
FOOTER_ZONE_SHARE = 0.45

#: Выше границы должно остаться хотя бы столько миллиметров содержимого,
#: иначе «схемной части» нет и делить лист не на что.
MIN_SCHEMA_HEIGHT = 60.0

#: Граница ставится над подвалом, но не дальше этого расстояния от него: середина
#: очень широкой пустой полосы уехала бы на середину листа.
MAX_BOUNDARY_LIFT = 40.0

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


@dataclass
class SheetInfo:
    """Лист проекта: имя, вид, рамка, габарит и граница подвала.

    Имя листа не уникально: у функциональной схемы и у схемы соединений одного
    узла оно одинаковое, различает их только вид. Поэтому лист адресуется
    парой «имя + вид», а надёжнее всего — своим ID.
    """

    sheet_id: int
    name: str = ""
    view: str = ""
    fmt: str = ""
    xmin: float = 0.0
    ymin: float = 0.0
    xmax: float = 0.0
    ymax: float = 0.0
    symbols: int = 0
    #: Y, ниже которой начинается подвал. 0 — подвала на листе нет.
    footer_y: float = 0.0

    @property
    def height(self) -> float:
        return max(self.ymax - self.ymin, 0.0)

    def zone_of(self, y: float) -> str:
        return ZONE_FOOTER if self.footer_y > 0 and y < self.footer_y else ZONE_SCHEMA


class Project:
    """Снимок проекта в памяти плюс операции поиска."""

    def __init__(self, app: e3api.E3App, log: Log) -> None:
        self.app = app
        self.log = log
        self.sheets: dict[int, SheetInfo] = {}
        self.sheet_names: dict[int, str] = {}
        self.sheet_ids_by_name: dict[str, int] = {}
        #: (имя в нижнем регистре, вид) -> ID листа. Главный способ адресации.
        self.sheet_ids_by_name_view: dict[tuple[str, str], int] = {}
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
        """Читает листы целиком: имя, вид, рамку, габарит, число символов.

        Всё это читается один раз и складывается в кэш: дальше ни экспорт, ни
        импорт к COM за свойствами листа не обращаются.
        """
        self.sheets.clear()
        self.sheet_names.clear()
        self.sheet_ids_by_name.clear()
        self.sheet_ids_by_name_view.clear()

        ids = e3api.job_ids(self.app.job, "GetSheetIds")
        if not ids:
            self.log.warn("Листы получить не удалось.")
            return

        sheet = self.app.sheet()
        duplicates = 0
        formats: dict[str, int] = {}
        for sheet_id in ids:
            if not e3api.set_id(sheet, sheet_id):
                continue
            name = e3api.sheet_name(sheet)
            if not name:
                continue
            info = SheetInfo(sheet_id=sheet_id, name=name)
            info.view = e3api.attribute_value(sheet, VIEW_ATTRIBUTE)
            info.fmt = e3api.sheet_format(sheet)
            area = e3api.sheet_area(sheet)
            if area is not None:
                info.xmin, info.ymin, info.xmax, info.ymax = area
            info.symbols = len(e3api.sheet_symbol_ids(sheet))

            self.sheets[sheet_id] = info
            self.sheet_names[sheet_id] = name
            formats[info.fmt or "(без рамки)"] = formats.get(info.fmt or "(без рамки)", 0) + 1
            if name in self.sheet_ids_by_name:
                duplicates += 1
            else:
                self.sheet_ids_by_name[name] = sheet_id
            self.sheet_ids_by_name_view.setdefault((name.lower(), info.view), sheet_id)

        self.log.info(
            f"Листов в проекте: {len(self.sheet_names)}, "
            f"уникальных имён: {len(self.sheet_ids_by_name)}, "
            f"уникальных пар «имя + вид»: {len(self.sheet_ids_by_name_view)}"
        )
        if duplicates:
            self.log.info(
                f"Имена листов повторяются ({duplicates} повторов) — это нормально: "
                "у ФСА и схемы соединений одного узла имя одно, различает их "
                f"{VIEW_ATTRIBUTE}. Лист определяется парой «имя + вид», а точнее всего — по ID."
            )
        spread = ", ".join(f"«{name}»: {count}" for name, count in sorted(formats.items()))
        self.log.info(f"Форматы (рамки) листов — {spread}")

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
            f"по имени {len(self.id_by_name)}, "
            f"нормализованных ключей {len(self.id_by_norm)}"
        )
        if not self.id_by_poz and self.devices:
            self.log.warn(
                f"Атрибут «{H_POZ}» не заполнен ни у одного объекта — обозначения "
                "берутся из имени изделия. Для выгрузки и обратной загрузки это "
                "работает, но столбец в Excel будет заполнен именами."
            )
        no_name = sum(1 for info in self.devices.values() if not info.name and not info.poz)
        if no_name:
            self.log.warn(f"Объектов без имени и обозначения: {no_name} — их не опознать.")

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

        seen_values: dict[str, int] = {}
        for sheet_id in sorted(self.sheets):
            info = self.sheets[sheet_id]
            key = info.view if info.view else "(пусто)"
            seen_values[key] = seen_values.get(key, 0) + 1
            allowed = info.view in views
            if allowed:
                self.allowed_sheet_ids.add(sheet_id)
            self.log.detail(
                f"  лист «{info.name}» (ID {sheet_id}): {VIEW_ATTRIBUTE}={key}, "
                f"рамка «{info.fmt or '-'}» — {'берём' if allowed else 'пропускаем'}"
            )
        self.log.info(
            f"Листов с {VIEW_ATTRIBUTE} из {{{', '.join(sorted(views))}}}: "
            f"{len(self.allowed_sheet_ids)} из {len(self.sheet_names)}"
        )
        # Раскладка по видам сразу показывает, что выбирать, если ничего не нашлось.
        spread = ", ".join(
            f"{value} — {view_title(value)}: {count}" for value, count in sorted(seen_values.items())
        )
        self.log.info(f"Виды листов в проекте — {spread}")
        return len(self.allowed_sheet_ids)

    def sheet_allowed(self, sheet_id: int) -> bool:
        return sheet_id in self.allowed_sheet_ids

    def sheet_name_of(self, sheet_id: int) -> str:
        return self.sheet_names.get(sheet_id, "")

    def sheet_info(self, sheet_id: int) -> SheetInfo | None:
        return self.sheets.get(sheet_id)

    def sheet_view_of(self, sheet_id: int) -> str:
        info = self.sheets.get(sheet_id)
        return info.view if info else ""

    def sheet_format_of(self, sheet_id: int) -> str:
        info = self.sheets.get(sheet_id)
        return info.fmt if info else ""

    def zone_of(self, sheet_id: int, y: float) -> str:
        info = self.sheets.get(sheet_id)
        return info.zone_of(y) if info else ZONE_SCHEMA

    # --- граница подвала ------------------------------------------------------
    def detect_footer_boundaries(
        self, ys_by_sheet: dict[int, list[float]], manual_y: float = 0.0
    ) -> int:
        """Находит на каждом листе границу между схемой и подвалом.

        Подвал ФСА — таблица в нижней части чертежа, где те же изделия
        перечислены построчно. Между ней и схемой всегда остаётся широкая
        пустая полоса, и именно она ищется: берётся самый большой разрыв в
        значениях Y размещённых символов. Разрыв принимается, только если он
        лежит в нижней части листа и выше него есть настоящая схемная часть —
        иначе лист считается однозонным.

        Если задана ручная граница (manual_y > 0), она применяется как есть.
        """
        found = 0
        for sheet_id in sorted(ys_by_sheet):
            info = self.sheets.get(sheet_id)
            if info is None:
                continue
            values = sorted({round(float(y), 3) for y in ys_by_sheet[sheet_id]})
            if manual_y > 0:
                info.footer_y = manual_y
                below = sum(1 for y in values if y < manual_y)
                found += 1
                self.log.detail(
                    f"  лист «{info.name}» (ID {sheet_id}): граница подвала задана вручную "
                    f"Y={manual_y:g}, ниже неё символов {below} из {len(values)}"
                )
                continue
            boundary, reason = self._auto_footer(info, values)
            info.footer_y = boundary
            if boundary:
                found += 1
                below = sum(1 for y in values if y < boundary)
                self.log.detail(
                    f"  лист «{info.name}» (ID {sheet_id}): подвал ниже Y={boundary:g} "
                    f"({reason}), в подвале символов {below} из {len(values)}"
                )
            else:
                self.log.detail(
                    f"  лист «{info.name}» (ID {sheet_id}): подвал не выделен — {reason}"
                )
        return found

    def _auto_footer(self, info: SheetInfo, values: list[float]) -> tuple[float, str]:
        if len(values) < 2:
            return 0.0, "размещений меньше двух"
        bottom = info.ymin if info.height > 0 else values[0]
        height = info.height if info.height > 0 else values[-1] - values[0]
        if height <= 0:
            return 0.0, "габарит листа неизвестен"

        # Ищем снизу вверх: подвал — самая нижняя полоса содержимого, и отделяет
        # его первый же широкий пустой промежуток. Брать самый широкий промежуток
        # на листе нельзя — он часто оказывается выше и уводит границу в схему.
        limit = bottom + FOOTER_ZONE_SHARE * height
        for index in range(len(values) - 1):
            low, high = values[index], values[index + 1]
            if low >= limit:
                break  # выше нижней части листа границу не ищем
            gap = high - low
            if gap < MIN_FOOTER_GAP:
                continue
            boundary = low + min(gap / 2.0, MAX_BOUNDARY_LIFT)
            if values[-1] - boundary < MIN_SCHEMA_HEIGHT:
                # Над полосой почти ничего нет: это не «схема плюс подвал»,
                # а один пояс содержимого. Выше промежутки только хуже.
                return 0.0, (
                    f"выше полосы (Y={boundary:g}) остаётся меньше {MIN_SCHEMA_HEIGHT:g} мм "
                    "содержимого — весь лист считаю схемой"
                )
            return boundary, (
                f"пустая полоса {gap:g} мм между Y={low:g} и Y={high:g}"
            )
        return 0.0, f"нет пустой полосы шире {MIN_FOOTER_GAP:g} мм в нижней части листа"

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

    def find_sheet(self, name: str, sheet_id: int = 0, view: str = "") -> int:
        """Разрешает лист: ID, затем «имя + вид», затем имя, затем имя как число.

        Порядок не случайный. ID однозначен всегда. Вид отделяет ФСА от схемы
        соединений, у которых имя одно и то же. Имя без вида — последняя
        попытка: если имён-двойников нет, она безопасна.
        """
        if sheet_id and sheet_id in self.sheet_names:
            return sheet_id
        name = (name or "").strip()
        if not name:
            return 0
        view = (view or "").strip()
        if view:
            found = self.sheet_ids_by_name_view.get((name.lower(), view))
            if found:
                return found
        if name in self.sheet_ids_by_name:
            return self.sheet_ids_by_name[name]
        target = name.lower()
        for existing_id, info in sorted(self.sheets.items()):
            if info.name.lower() == target and (not view or info.view == view):
                return existing_id
        wanted = parse_num(name)
        if wanted is not None:
            for existing, existing_id in self.sheet_ids_by_name.items():
                value = parse_num(existing)
                if value is not None and abs(value - wanted) < 1e-7:
                    if not view or self.sheet_view_of(existing_id) == view:
                        return existing_id
        return 0

    def find_allowed_sheet(self, name: str, sheet_id: int = 0, view: str = "") -> int:
        """Как find_sheet, но результат обязан входить в выбранные виды."""
        if sheet_id and self.sheet_allowed(sheet_id):
            return sheet_id
        name = (name or "").strip()
        view = (view or "").strip()
        target = name.lower()
        if name and view:
            # Точное попадание «имя + вид» среди разрешённых листов.
            for allowed_id in sorted(self.allowed_sheet_ids):
                info = self.sheets.get(allowed_id)
                if info is not None and info.name.lower() == target and info.view == view:
                    return allowed_id
        if name:
            for allowed_id in sorted(self.allowed_sheet_ids):
                if self.sheet_names.get(allowed_id, "").lower() == target:
                    return allowed_id
        resolved = self.find_sheet(name, sheet_id, view)
        if resolved and self.sheet_allowed(resolved):
            return resolved
        return 0

    def remember_new_sheet(self, sheet_id: int, name: str, view: str, fmt: str) -> SheetInfo:
        """Добавляет только что созданный лист в кэш, не перечитывая проект."""
        info = SheetInfo(sheet_id=sheet_id, name=name, view=view, fmt=fmt)
        self.sheets[sheet_id] = info
        self.sheet_names[sheet_id] = name
        self.sheet_ids_by_name.setdefault(name, sheet_id)
        self.sheet_ids_by_name_view.setdefault((name.lower(), view), sheet_id)
        if not self.views or view in self.views:
            self.allowed_sheet_ids.add(sheet_id)
        return info

    def update_sheet_view(self, sheet_id: int, view: str) -> None:
        info = self.sheets.get(sheet_id)
        if info is None:
            return
        info.view = view
        self.sheet_ids_by_name_view.setdefault((info.name.lower(), view), sheet_id)
        if not self.views or view in self.views:
            self.allowed_sheet_ids.add(sheet_id)
        else:
            self.allowed_sheet_ids.discard(sheet_id)

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
