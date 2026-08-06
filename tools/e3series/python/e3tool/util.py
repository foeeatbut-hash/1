"""Мелкие утилиты: разбор чисел, нормализация строк, строки таблицы.

Здесь собрано то, что в HTA-версии было размазано по функциям IsNum / ParseNum /
NormKey / CellStr. Ни одна из этих функций не трогает E3 и Excel, поэтому они
покрыты тестами и правятся без запуска программы.
"""

from __future__ import annotations

from typing import Any, Iterable, Iterator


def safe_str(value: Any) -> str:
    """Строковое представление ячейки. None и служебные типы дают пустую строку."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, float):
        # Excel отдаёт целые числа как float: 100.0 -> "100"
        if value.is_integer():
            return str(int(value))
        return repr(value)
    if isinstance(value, (list, tuple, dict)):
        return ""
    return str(value)


def parse_num(value: Any) -> float | None:
    """Число из ячейки или None.

    В отличие от VBScript-овского IsNumeric, пустое значение числом не считается —
    именно на этом старый экспорт молча получал нули. Разделитель дробной части
    принимается любой: 12.5 и 12,5 равнозначны.
    """
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(" ", "").replace(" ", "")
    if not text:
        return None
    text = text.replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def parse_int(value: Any, default: int = 0) -> int:
    num = parse_num(value)
    if num is None:
        return default
    return int(round(num))


def norm_key(value: Any) -> str:
    """Ключ для сопоставления надписи на символе с обозначением изделия.

    Регистр, пробелы, дефисы и подчёркивания игнорируются: «094-XVM-1201A»,
    «094 XVM 1201A» и «094_xvm_1201a» дают один ключ.
    """
    text = safe_str(value).lower()
    for ch in ("\r", "\n", "\t"):
        text = text.replace(ch, " ")
    for ch in (" ", "-", "_", " "):
        text = text.replace(ch, "")
    return text


def strip_dash(value: Any) -> str:
    """Убирает ведущий дефис из имени изделия, как это делает E3 при показе."""
    text = safe_str(value)
    if len(text) > 1 and text[0] == "-":
        return text[1:]
    return text


def fmt(value: Any) -> str:
    """Координата для лога: три знака после запятой, точка как разделитель."""
    num = parse_num(value)
    if num is None:
        return "-"
    return f"{round(num, 3):g}"


def header_key(header: Any) -> str:
    """Ключ заголовка столбца: регистр и краевые пробелы не важны."""
    return safe_str(header).strip().lower()


class Row:
    """Строка таблицы Excel с доступом по имени столбца.

    Столбцы ищутся по заголовку, а не по номеру, поэтому файл со старым набором
    столбцов (56 вместо 63) читается без правок, а лишние столбцы не мешают.
    """

    __slots__ = ("_data", "number")

    def __init__(self, data: dict[str, Any], number: int = 0) -> None:
        self._data = data
        self.number = number

    def has(self, header: str) -> bool:
        return header_key(header) in self._data

    def raw(self, header: str) -> Any:
        return self._data.get(header_key(header))

    def text(self, header: str) -> str:
        return safe_str(self.raw(header)).strip()

    def num(self, header: str) -> float | None:
        return parse_num(self.raw(header))

    def integer(self, header: str, default: int = 0) -> int:
        return parse_int(self.raw(header), default)

    def keys(self) -> Iterable[str]:
        return self._data.keys()

    def items(self) -> Iterator[tuple[str, Any]]:
        return iter(self._data.items())

    def __repr__(self) -> str:  # для отладки в консоли
        return f"Row(#{self.number}, {len(self._data)} столбцов)"


class Table:
    """Лист Excel: исходные заголовки в порядке следования плюс строки."""

    def __init__(self, name: str, headers: list[str], rows: list[Row]) -> None:
        self.name = name
        self.headers = headers
        self.rows = rows

    def column(self, header: str) -> str | None:
        """Возвращает исходное написание заголовка, если такой столбец есть."""
        key = header_key(header)
        for original in self.headers:
            if header_key(original) == key:
                return original
        return None

    def has_column(self, header: str) -> bool:
        return self.column(header) is not None

    def __len__(self) -> int:
        return len(self.rows)
