"""Тесты логики, не требующие ни E3.series, ни Windows, ни Excel.

Запуск из папки python:  python -m pytest tests -q
Либо без pytest:         python tests/test_logic.py
"""

from __future__ import annotations

import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from e3tool import columns as cols  # noqa: E402
from e3tool import e3api, excel_io  # noqa: E402
from e3tool.util import Row, Table, norm_key, parse_num, safe_str, strip_dash  # noqa: E402


# --- разбор чисел -------------------------------------------------------------
def test_parse_num_rejects_empty():
    # Пустое значение числом не является. Именно на этом старый экспорт
    # молча получал нули: в VBScript IsNumeric(Empty) возвращает True.
    assert parse_num(None) is None
    assert parse_num("") is None
    assert parse_num("   ") is None


def test_parse_num_accepts_both_separators():
    assert parse_num("12.5") == 12.5
    assert parse_num("12,5") == 12.5
    assert parse_num(" 100 ") == 100.0
    assert parse_num(0) == 0.0  # ноль — осмысленная координата


def test_parse_num_rejects_text():
    assert parse_num("нет") is None
    assert parse_num("12мм") is None


def test_safe_str_keeps_integers_clean():
    assert safe_str(100.0) == "100"
    assert safe_str(76.5) == "76.5"
    assert safe_str(None) == ""


def test_strip_dash():
    assert strip_dash("-094-XVM-1201A") == "094-XVM-1201A"
    assert strip_dash("094") == "094"
    assert strip_dash("-") == "-"


# --- сопоставление обозначений -------------------------------------------------
def test_norm_key_ignores_case_spaces_dashes():
    keys = {
        norm_key("094-XVM-1201A"),
        norm_key("094 XVM 1201A"),
        norm_key("094_xvm_1201a"),
        norm_key(" 094-xvm-1201a "),
    }
    assert len(keys) == 1


def test_mirror_is_split_from_rotation_and_composed_back():
    from e3tool.util import compose_rotation, mirror_of

    assert mirror_of("MX90") == "MX"
    assert mirror_of("my0") == "MY"
    assert mirror_of("90") == ""
    assert mirror_of("") == ""
    # Обратная сборка: и «MX90» одной строкой, и «90» + «MX» двумя столбцами.
    assert compose_rotation("MX90", "MX") == "MX90"
    assert compose_rotation("90", "MX") == "MX90"
    assert compose_rotation("90", "") == "90"
    assert compose_rotation("", "MY") == "MY"
    assert compose_rotation("", "") == ""


def test_view_titles_are_explained():
    assert "функциональная" in cols.view_title("4")
    assert "соединен" in cols.view_title("5")
    assert cols.view_title("") == "вид не задан"
    assert cols.view_title("7") == "вид 7"


# --- схема столбцов -----------------------------------------------------------
def test_device_headers_layout():
    # Совместимость с HTA-версией: первые 63 столбца те же, новые дописаны в конец.
    assert cols.DEVICE_HEADERS[0] == cols.H_POZ
    assert cols.DEVICE_HEADERS[1] == cols.H_COMP
    assert len(cols.ATTRIBUTE_HEADERS) == 51
    assert cols.DEVICE_HEADERS[2] == cols.ATTRIBUTE_HEADERS[0]
    assert cols.DEVICE_HEADERS[52] == cols.ATTRIBUTE_HEADERS[-1]
    assert cols.DEVICE_HEADERS[53] == cols.H_SHEET
    assert cols.DEVICE_HEADERS[62] == cols.H_DEV_ID
    assert cols.DEVICE_HEADERS[63:67] == [
        cols.H_VIEW,
        cols.H_FORMAT,
        cols.H_ZONE,
        cols.H_PLACED_COUNT,
    ]
    # Атрибуты сверки сигналов дописаны следующей группой — тоже в конец.
    assert cols.DEVICE_HEADERS[67:-1] == cols.SIGNAL_HEADERS
    assert cols.A_DI in cols.DEVICE_HEADERS
    assert "ID Сигнала 5" in cols.DEVICE_HEADERS
    # Они именно атрибуты: при загрузке должны писаться обратно в изделие.
    assert cols.attribute_headers_of(cols.DEVICE_HEADERS)[-1] == "ID Сигнала 5"
    # GID — служебный, в изделие как атрибут не пишется, но в книге есть везде.
    assert cols.DEVICE_HEADERS[-1] == cols.H_GID
    assert cols.is_service_header(cols.H_GID)
    for headers in (cols.PLACEMENT_HEADERS, cols.TEXT_HEADERS, cols.CONNECTION_HEADERS):
        assert headers[0] == cols.H_GID
    # В каждой таблице должен быть вид листа: без него одноимённые листы
    # (ФСА и схема соединений одного узла) не различить.
    for headers in (cols.DEVICE_HEADERS, cols.PLACEMENT_HEADERS, cols.CONNECTION_HEADERS,
                    cols.SHEET_HEADERS):
        assert cols.H_VIEW in headers
        assert cols.H_FORMAT in headers


def test_service_headers_are_not_attributes():
    assert cols.is_service_header(cols.H_X)
    assert cols.is_service_header("ID листа")
    assert cols.is_service_header("")
    # Поз. обозначение — полноценный атрибут E3, служебным быть не должно.
    assert not cols.is_service_header(cols.H_POZ)
    assert not cols.is_service_header("*TAG установки")


def test_attribute_headers_of_ignores_unknown_service_columns():
    headers = [cols.H_POZ, "*Контур", cols.H_X, cols.H_Y, "Своё поле"]
    assert cols.attribute_headers_of(headers) == [cols.H_POZ, "*Контур", "Своё поле"]


# --- строки таблицы -----------------------------------------------------------
def test_row_lookup_is_case_insensitive():
    row = Row({"поз. обозначение": "TS-1", "x": "12,5"}, 2)
    assert row.text("Поз. обозначение") == "TS-1"
    assert row.num("X") == 12.5
    assert row.num("Y") is None
    assert row.integer("Y", 7) == 7


def test_table_column_lookup():
    table = Table("Изделия", ["Поз. обозначение", "X"], [])
    assert table.has_column("поз. обозначение")
    assert not table.has_column("Y")


# --- разбор массивов E3 -------------------------------------------------------
def test_ids_of_drops_service_element():
    # E3 отдаёт 1-based массив: нулевой элемент служебный.
    assert e3api.ids_of(3, (0, 11, 12, 13)) == (11, 12, 13)
    # Уже 0-based — ничего не режем.
    assert e3api.ids_of(3, (11, 12, 13)) == (11, 12, 13)
    assert e3api.ids_of(0, ()) == ()
    assert e3api.ids_of(2, None) == ()


def test_out_values_wraps_scalar():
    assert e3api.out_values((1, 2)) == (1, 2)
    assert e3api.out_values(5) == (5,)


def test_location_placed_flag():
    assert e3api.Location(12, 10.0, 20.0).placed
    # Ноль — это неразмещённый символ либо gate, а не подтверждение ошибки.
    assert not e3api.Location(0, 10.0, 20.0).placed


# --- Excel: круговой обход ----------------------------------------------------
def test_workbook_roundtrip_keeps_numbers_numeric():
    rows = [
        {
            cols.H_POZ: "094-XVM-1201A",
            cols.H_COMP: "клапан",
            cols.H_SHEET: "2",
            cols.H_X: 76.0,
            cols.H_Y: 367.5,
            cols.H_ROT: "90",
            cols.H_SHEET_ID: 12,
            cols.H_DEV_ID: 345,
        }
    ]
    sheets = [
        excel_io.SheetData(
            name=cols.SHEET_DEVICES,
            headers=cols.DEVICE_HEADERS,
            rows=rows,
            numeric=set(cols.NUMERIC_HEADERS),
        )
    ]
    with tempfile.TemporaryDirectory() as folder:
        path = os.path.join(folder, "test.xlsx")
        excel_io.write_workbook(path, sheets)
        tables = excel_io.read_tables(path)

        table = excel_io.find_table(tables, cols.SHEET_DEVICES)
        assert table is not None
        assert len(table) == 1
        row = table.rows[0]
        assert row.text(cols.H_POZ) == "094-XVM-1201A"
        # Координаты обязаны остаться числами, а не превратиться в текст.
        assert row.num(cols.H_X) == 76.0
        assert row.num(cols.H_Y) == 367.5
        assert row.integer(cols.H_SHEET_ID) == 12


def test_reading_old_file_with_fewer_columns():
    # Файл, выгруженный старой версией (без столбцов 54..63), должен читаться.
    old_headers = [cols.H_POZ, cols.H_COMP, "*Контур"]
    sheets = [
        excel_io.SheetData(
            name=cols.SHEET_DEVICES,
            headers=old_headers,
            rows=[{cols.H_POZ: "TS-1", cols.H_COMP: "датчик", "*Контур": "K1"}],
        )
    ]
    with tempfile.TemporaryDirectory() as folder:
        path = os.path.join(folder, "old.xlsx")
        excel_io.write_workbook(path, sheets)
        table = excel_io.find_table(excel_io.read_tables(path), cols.SHEET_DEVICES)
        assert table is not None
        assert table.rows[0].text(cols.H_COMP) == "датчик"
        assert table.rows[0].num(cols.H_X) is None
        assert cols.attribute_headers_of(table.headers) == [cols.H_POZ, "*Контур"]


def test_template_has_all_sheets():
    with tempfile.TemporaryDirectory() as folder:
        path = os.path.join(folder, "template.xlsx")
        excel_io.write_template(path)
        tables = excel_io.read_tables(path)
        assert excel_io.find_table(tables, cols.SHEET_DEVICES) is not None
        # Пустые листы читаются как «нет строк», но лист в книге есть.
        from openpyxl import load_workbook

        names = [ws.title for ws in load_workbook(path, read_only=True).worksheets]
        for expected in (
            cols.SHEET_VIEW4,
            cols.SHEET_VIEW5,
            cols.SHEET_SCHEMA,
            cols.SHEET_FOOTER,
            cols.SHEET_CONNECTIONS,
            cols.SHEET_TEXTS,
            cols.SHEET_SHEETS,
        ):
            assert expected in names, expected
        assert cols.SHEET_SHEETS in names

        # В шаблоне заполнен вид листа — иначе непонятно, куда попадёт изделие.
        schema = excel_io.find_table(tables, cols.SHEET_SCHEMA)
        assert schema is not None and schema.rows[0].text(cols.H_VIEW) == "4"
        footer = excel_io.find_table(tables, cols.SHEET_FOOTER)
        assert footer is not None and footer.rows[0].text(cols.H_ZONE) == cols.ZONE_FOOTER
        sheets_table = excel_io.find_table(tables, cols.SHEET_SHEETS)
        assert sheets_table is not None
        assert sheets_table.rows[0].text(cols.H_FORMAT) == "A2_ГОСТ"


# --- группировка проводов -----------------------------------------------------
def test_connection_grouping_preserves_polyline_order():
    from e3tool.importer import _group_points

    rows = [
        Row(
            {
                "№ соединения": "1",
                "№ точки": str(index),
                "имя листа": "2",
                "id листа": "12",
                "вид листа": "5",
                "x": str(x),
                "y": str(y),
                "тип точки": "0",
            },
            index + 1,
        )
        for index, (x, y) in enumerate([(10, 10), (10, 50), (80, 50)], start=1)
    ]
    rows.append(
        Row({"№ соединения": "2", "имя листа": "2", "id листа": "12", "x": "5", "y": "5"}, 5)
    )
    groups = _group_points(Table("Соединения", cols.CONNECTION_HEADERS, rows))
    # Второй провод из одной точки — не ломаная, в результат не попадает.
    assert len(groups) == 1
    number, points, types, sheet_name, sheet_id, view = groups[0]
    assert number == "1"
    assert points == [(10.0, 10.0), (10.0, 50.0), (80.0, 50.0)]
    assert sheet_id == 12
    # Вид листа берётся из первой точки провода — по нему выбирается лист.
    assert view == "5"
    assert sheet_name == "2"
    assert types == [0, 0, 0]


def test_connection_creation_uses_one_based_arrays():
    """Connection.Create принимает 1-based массивы — как в обёртке Zuken."""

    calls: list[tuple] = []

    class FakeConnection:
        def Create(self, *args):
            calls.append(args)
            return 777

    ok = e3api.create_connection(
        FakeConnection(), 12, [(10.0, 10.0), (10.0, 50.0)], [0, 0]
    )
    assert ok
    sheet_id, count, xs, ys, types = calls[0]
    assert sheet_id == 12
    assert count == 2
    # Нулевой элемент служебный, точки начинаются с индекса 1.
    assert xs == [0.0, 10.0, 10.0]
    assert ys == [0.0, 10.0, 50.0]
    assert types == [0, 0, 0]


def test_connection_creation_falls_back_to_zero_based():
    class PickyConnection:
        def __init__(self):
            self.attempts = 0

        def Create(self, sheet_id, count, xs, ys, *rest):
            self.attempts += 1
            # Сборка, которая принимает только 0-based массивы без типов.
            if rest or len(xs) != count:
                return 0
            return 42

    connection = PickyConnection()
    probe = e3api.Probe()
    assert e3api.create_connection(connection, 12, [(1.0, 2.0), (3.0, 4.0)], [0, 0], probe)
    assert probe.connection == "Create(0-based)"


# --- поворот и подтверждение записи -------------------------------------------
def test_symbol_move_reports_gate_as_unverified():
    """Позиция gate не перечитывается — это не ошибка записи."""

    class GateSymbol:
        def Place(self, *args):
            return 1

        def GetSchemaLocation(self, *args):
            # Лист 0 — признак gate либо неразмещённого символа.
            return (0, 0.0, 0.0, "", "", "")

    state, location = e3api.symbol_move(GateSymbol(), 12, 100.0, 200.0)
    assert state == e3api.PLACE_UNVERIFIED


def test_symbol_move_confirms_matching_coordinates():
    class GoodSymbol:
        def Place(self, sheet_id, x, y, *rest):
            self.x, self.y = x, y
            return 1

        def GetSchemaLocation(self, *args):
            return (12, self.x, self.y, "/2.A2", "A", "2")

    state, location = e3api.symbol_move(GoodSymbol(), 12, 100.0, 200.0)
    assert state == e3api.PLACE_CONFIRMED
    assert location is not None and location.x == 100.0


def test_symbol_move_detects_real_mismatch():
    class DriftingSymbol:
        def Place(self, *args):
            return 1

        def GetSchemaLocation(self, *args):
            return (12, 2.0, 0.0, "", "", "")

    state, location = e3api.symbol_move(DriftingSymbol(), 12, 100.0, 200.0)
    assert state == e3api.PLACE_FAILED
    assert location is not None and location.x == 2.0


def test_polyline_drops_service_element():
    class FakeSegment:
        def GetLineSegments(self, *args):
            # 1-based: нулевые элементы служебные.
            return (3, 12, (0.0, 10.0, 10.0, 80.0), (0.0, 10.0, 50.0, 50.0), (0, 1, 0, 2))

    polyline = e3api.net_segment_polyline(FakeSegment())
    assert polyline is not None
    assert polyline.sheet_id == 12
    assert polyline.points == [(10.0, 10.0), (10.0, 50.0), (80.0, 50.0)]
    assert polyline.types == [1, 0, 2]


# --- разбор ошибок в журнале --------------------------------------------------
def test_log_reports_where_error_happened():
    from e3tool.log import Log, format_exception

    def boom():
        raise TypeError("'_contextvars.Context' object is not callable")

    try:
        boom()
    except TypeError as error:
        lines = format_exception(error, package="tests")
        text = "\n".join(lines)
        assert "TypeError" in text
        assert "не callable" in text or "not callable" in text
        # В отчёте обязаны быть файл, строка и сам исходный текст строки.
        assert "test_logic.py" in text
        assert "boom()" in text

    collected: list[tuple[str, str]] = []
    log = Log(sink=lambda line, level: collected.append((line, level)))
    try:
        boom()
    except TypeError as error:
        log.error("Сбой при выполнении «выгрузка»", error)
    # Ошибка и её разбор видны всегда, без подробного режима.
    assert all(level == "warn" for _, level in collected)
    assert len(collected) >= 3


def test_com_error_is_decoded():
    from e3tool.log import describe_com_error

    class com_error(Exception):
        pass

    error = com_error(
        -2147352573,
        "Member not found.",
        (0, "E3.series", "Метод недоступен в этой версии", None, 0, -2147352573),
        None,
    )
    lines = describe_com_error(error)
    text = " | ".join(lines)
    assert "0x80020003" in text
    assert "нет такого метода" in text
    assert "Метод недоступен в этой версии" in text


def test_worker_does_not_collide_with_thread_internals():
    """Регрессия: Worker не наследует Thread, поэтому имена не пересекаются.

    Раньше Worker был подклассом Thread, и его `_stop`/`_context` перекрывали
    служебные атрибуты Thread. Экспорт падал с
    «'_contextvars.Context' object is not callable».
    """
    import threading

    from e3tool.task import Context
    from e3tool.worker import Worker

    worker = Worker()
    assert not isinstance(worker, threading.Thread)
    assert isinstance(worker.thread, threading.Thread)

    # Ни одно имя Worker не должно совпадать с внутренними именами Thread.
    thread_names = set(dir(threading.Thread)) | set(vars(threading.Thread()))
    reserved = {name for name in thread_names if name.startswith("_") and not name.startswith("__")}
    clashes = {name for name in vars(worker) if name in reserved}
    assert not clashes, f"столкновение имён с Thread: {clashes}"

    context = worker.new_context()
    assert isinstance(context, Context)
    assert context.stopped() is False
    worker.request_stop()
    assert context.stopped() is True


def _run_all() -> int:
    failures = 0
    for name, function in sorted(globals().items()):
        if name.startswith("test_") and callable(function):
            try:
                function()
            except AssertionError as error:
                failures += 1
                print(f"ПРОВАЛ {name}: {error}")
            except Exception as error:  # noqa: BLE001
                failures += 1
                print(f"ОШИБКА {name}: {type(error).__name__} {error}")
            else:
                print(f"ок     {name}")
    print(f"\nвсего провалов: {failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(_run_all())
