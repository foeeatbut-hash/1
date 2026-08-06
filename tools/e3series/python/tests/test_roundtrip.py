"""Полный круг «проект -> Excel -> проект» на поддельной E3.

Здесь проверяется то, что раньше можно было увидеть только на живом проекте:
координаты выгружаются, фильтр видов работает, символ опознаётся по надписи,
gate не считается ошибкой, провода воспроизводятся точка в точку.
"""

from __future__ import annotations

import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import fake_e3  # noqa: E402

from e3tool import columns as cols  # noqa: E402
from e3tool import e3api, excel_io  # noqa: E402
from e3tool.export import ExportOptions, run_export  # noqa: E402
from e3tool.importer import ImportOptions, run_import  # noqa: E402
from e3tool.log import Log  # noqa: E402
from e3tool.project import Project  # noqa: E402
from e3tool.task import Context  # noqa: E402


def make_project(model: fake_e3.FakeModel, views: set[str]) -> tuple[Project, Log]:
    log = Log(verbose=False)
    app = e3api.E3App(fake_e3.ApplicationObject(model))
    project = Project(app, log)
    project.reload()
    project.apply_view_filter(views)
    return project, log


def rows_by_poz(rows: list[dict]) -> dict[str, dict]:
    return {row.get(cols.H_POZ, ""): row for row in rows}


# --- выгрузка -----------------------------------------------------------------
def test_export_reads_real_coordinates():
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})
    sheets, stats = run_export(project, ExportOptions(views={"4"}), Context(log))

    devices = rows_by_poz(sheets[0].rows)
    # Координаты именно те, что стоят на листах, а не общий габарит.
    assert devices["094-XVM-1201A"][cols.H_X] == 76.0
    assert devices["094-XVM-1201A"][cols.H_Y] == 367.0
    assert devices["094-XVM-1201A"][cols.H_SHEET] == "1"
    assert devices["094-XVM-1202A"][cols.H_X] == 351.0
    assert devices["094-XVM-1202A"][cols.H_SHEET_ID] == 12


def test_export_marks_unplaced_devices_without_coordinates():
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})
    sheets, _ = run_export(project, ExportOptions(views={"4"}), Context(log))
    devices = rows_by_poz(sheets[0].rows)

    # Изделие есть, символ не поставлен — строка выгружается, координат нет.
    assert cols.H_X not in devices["094-TS-1203"] or devices["094-TS-1203"].get(cols.H_X) is None
    assert devices["094-TS-1203"][cols.H_SYM_COUNT] == 1
    # У изделия нет символов вовсе.
    assert devices["094-TS-1204"][cols.H_SYM_COUNT] == 0
    # Но атрибуты заполнены у всех — «пустых» строк не остаётся.
    assert devices["094-TS-1204"][cols.H_POZ] == "094-TS-1204"
    assert devices["094-TS-1204"][cols.H_COMP] == "датчик без символа"


def test_export_view_filter_excludes_other_views():
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})
    sheets, _ = run_export(project, ExportOptions(views={"4"}), Context(log))
    devices = rows_by_poz(sheets[0].rows)

    # Символ этого изделия стоит на листе с .PREFERRED_VIEW=5.
    assert devices["094-XV-1206"].get(cols.H_X) is None

    project5, log5 = make_project(model, {"5"})
    sheets5, _ = run_export(project5, ExportOptions(views={"5"}), Context(log5))
    devices5 = rows_by_poz(sheets5[0].rows)
    assert devices5["094-XV-1206"][cols.H_X] == 50.0
    # А изделия с листов вида 4 теперь без координат.
    assert devices5["094-XVM-1201A"].get(cols.H_X) is None


def test_export_matches_orphan_symbol_by_text():
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})
    sheets, stats = run_export(project, ExportOptions(views={"4"}), Context(log))
    devices = rows_by_poz(sheets[0].rows)

    # Символ 1005 не принадлежит ни одному изделию по GetSymbolIds —
    # единственная зацепка это надпись на нём.
    assert stats.matched_by_text >= 1
    assert devices["094-PT-1205"][cols.H_X] == 120.0
    assert devices["094-PT-1205"][cols.H_Y] == 200.0


def test_export_placements_sheet():
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})
    sheets, stats = run_export(project, ExportOptions(views={"4"}), Context(log))

    placements = next(sheet for sheet in sheets if sheet.name == cols.SHEET_PLACEMENTS)
    poz_list = {row[cols.H_POZ] for row in placements.rows}
    assert "094-XVM-1201A" in poz_list
    assert "094-XVM-1202A" in poz_list
    # Лист вида 5 отфильтрован.
    assert "094-XV-1206" not in poz_list
    assert stats.placements == len(placements.rows)
    for row in placements.rows:
        assert row[cols.H_SYM_NR] >= 1
        assert row[cols.H_OBJ_TYPE] == "изделие"


def test_export_connections_sheet_keeps_polyline():
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})
    sheets, stats = run_export(project, ExportOptions(views={"4"}), Context(log))

    connections = next(sheet for sheet in sheets if sheet.name == cols.SHEET_CONNECTIONS)
    # Два сегмента на листах вида 4, третий на виде 5 — отфильтрован.
    assert stats.segments == 2
    assert stats.points == 5
    first = [row for row in connections.rows if row[cols.H_CONN_NR] == 1]
    assert [(row[cols.H_X], row[cols.H_Y]) for row in first] == [
        (10.0, 10.0),
        (10.0, 50.0),
        (80.0, 50.0),
    ]
    assert first[0][cols.H_SIGNAL] == "СИГ-1"
    assert [row[cols.H_POINT_NR] for row in first] == [1, 2, 3]


def test_export_only_placed_option():
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})
    sheets, stats = run_export(
        project, ExportOptions(views={"4"}, only_placed=True), Context(log)
    )
    poz_list = {row[cols.H_POZ] for row in sheets[0].rows}
    assert "094-XVM-1201A" in poz_list
    assert "094-TS-1204" not in poz_list
    assert stats.skipped > 0


# --- загрузка -----------------------------------------------------------------
def test_import_moves_existing_symbol():
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})

    table = _table_from_rows(
        cols.SHEET_DEVICES,
        cols.DEVICE_HEADERS,
        [
            {
                cols.H_POZ: "094-XVM-1201A",
                cols.H_SHEET: "2",
                cols.H_SHEET_ID: 12,
                cols.H_X: 200.0,
                cols.H_Y: 300.0,
                cols.H_ROT: "90",
            }
        ],
    )
    stats = run_import(
        project,
        {cols.SHEET_DEVICES: table},
        ImportOptions(views={"4"}, place_symbols=True, create_missing=False),
        Context(log),
    )
    assert stats.moved == 1
    assert stats.bad_coordinates == 0
    symbol = model.symbols[1001]
    assert (symbol.sheet_id, symbol.x, symbol.y) == (12, 200.0, 300.0)
    assert symbol.rotation == "90"


def test_import_places_unplaced_symbol():
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})
    table = _table_from_rows(
        cols.SHEET_DEVICES,
        cols.DEVICE_HEADERS,
        [{cols.H_POZ: "094-TS-1203", cols.H_SHEET_ID: 11, cols.H_X: 10.0, cols.H_Y: 20.0}],
    )
    stats = run_import(
        project,
        {cols.SHEET_DEVICES: table},
        ImportOptions(views={"4"}, place_symbols=True, create_missing=False),
        Context(log),
    )
    assert stats.placed == 1
    assert model.symbols[1003].sheet_id == 11


def test_import_gate_is_not_an_error():
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})
    table = _table_from_rows(
        cols.SHEET_DEVICES,
        cols.DEVICE_HEADERS,
        [{cols.H_POZ: "094-GATE-1207", cols.H_SHEET_ID: 11, cols.H_X: 30.0, cols.H_Y: 40.0}],
    )
    stats = run_import(
        project,
        {cols.SHEET_DEVICES: table},
        ImportOptions(views={"4"}, place_symbols=True, create_missing=False),
        Context(log),
    )
    # Позиция gate не перечитывается, но это не «координаты не совпали».
    assert stats.bad_coordinates == 0
    assert stats.placed + stats.moved == 1
    assert stats.unverified == 1


def test_import_reports_component_without_symbol():
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})
    table = _table_from_rows(
        cols.SHEET_DEVICES,
        cols.DEVICE_HEADERS,
        [{cols.H_POZ: "094-TS-1204", cols.H_SHEET_ID: 11, cols.H_X: 10.0, cols.H_Y: 10.0}],
    )
    stats = run_import(
        project,
        {cols.SHEET_DEVICES: table},
        ImportOptions(views={"4"}, place_symbols=True, create_missing=False),
        Context(log),
    )
    assert stats.components_without_symbol["датчик без символа"] == 1


def test_import_creates_device_and_writes_attributes():
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})
    table = _table_from_rows(
        cols.SHEET_DEVICES,
        cols.DEVICE_HEADERS,
        [
            {
                cols.H_POZ: "НОВОЕ-01",
                cols.H_COMP: "внешние_сигналы_DI",
                "*TAG установки": "ВЕНТ-01",
                "*Описание полное": "Создано импортом",
                cols.H_SHEET_ID: 11,
                cols.H_X: 100.0,
                cols.H_Y: 150.0,
            }
        ],
    )
    stats = run_import(
        project,
        {cols.SHEET_DEVICES: table},
        ImportOptions(views={"4"}, place_symbols=True, create_missing=True),
        Context(log),
    )
    assert stats.created == 1
    created = [d for d in model.devices.values() if d.name == "НОВОЕ-01"]
    assert len(created) == 1
    assert created[0].attributes["*TAG установки"] == "ВЕНТ-01"
    assert created[0].component == "внешние_сигналы_DI"
    # Символ нового изделия сразу встал на лист.
    assert stats.placed == 1


def test_import_skips_row_without_component():
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})
    table = _table_from_rows(
        cols.SHEET_DEVICES, cols.DEVICE_HEADERS, [{cols.H_POZ: "НЕТ-КОМПОНЕНТА"}]
    )
    stats = run_import(
        project,
        {cols.SHEET_DEVICES: table},
        ImportOptions(views={"4"}, create_missing=True),
        Context(log),
    )
    assert stats.no_component == 1
    assert stats.created == 0


def test_import_rejects_sheet_outside_selected_views():
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})
    table = _table_from_rows(
        cols.SHEET_DEVICES,
        cols.DEVICE_HEADERS,
        [{cols.H_POZ: "094-XVM-1201A", cols.H_SHEET_ID: 13, cols.H_X: 1.0, cols.H_Y: 2.0}],
    )
    stats = run_import(
        project,
        {cols.SHEET_DEVICES: table},
        ImportOptions(views={"4"}, place_symbols=True, create_missing=False),
        Context(log),
    )
    # Лист 13 имеет вид 5 — размещать туда при фильтре {4} нельзя.
    assert stats.errors == 1
    assert stats.moved == 0
    assert model.symbols[1001].sheet_id == 11


def test_import_dry_run_changes_nothing():
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})
    before = (model.symbols[1001].sheet_id, model.symbols[1001].x)
    table = _table_from_rows(
        cols.SHEET_DEVICES,
        cols.DEVICE_HEADERS,
        [
            {cols.H_POZ: "094-XVM-1201A", cols.H_SHEET_ID: 12, cols.H_X: 9.0, cols.H_Y: 9.0},
            {cols.H_POZ: "НОВОЕ-02", cols.H_COMP: "внешние_сигналы_DI"},
        ],
    )
    stats = run_import(
        project,
        {cols.SHEET_DEVICES: table},
        ImportOptions(views={"4"}, place_symbols=True, create_missing=True, dry_run=True),
        Context(log),
    )
    assert (model.symbols[1001].sheet_id, model.symbols[1001].x) == before
    assert not any(device.name == "НОВОЕ-02" for device in model.devices.values())
    assert stats.moved == 0


def test_import_creates_connections_after_placement():
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})
    connections = _table_from_rows(
        cols.SHEET_CONNECTIONS,
        cols.CONNECTION_HEADERS,
        [
            {cols.H_CONN_NR: 1, cols.H_POINT_NR: 1, cols.H_SHEET_ID: 11, cols.H_X: 10.0, cols.H_Y: 10.0},
            {cols.H_CONN_NR: 1, cols.H_POINT_NR: 2, cols.H_SHEET_ID: 11, cols.H_X: 10.0, cols.H_Y: 50.0},
            {cols.H_CONN_NR: 1, cols.H_POINT_NR: 3, cols.H_SHEET_ID: 11, cols.H_X: 80.0, cols.H_Y: 50.0},
            {cols.H_CONN_NR: 2, cols.H_POINT_NR: 1, cols.H_SHEET_ID: 13, cols.H_X: 1.0, cols.H_Y: 1.0},
            {cols.H_CONN_NR: 2, cols.H_POINT_NR: 2, cols.H_SHEET_ID: 13, cols.H_X: 5.0, cols.H_Y: 1.0},
        ],
    )
    devices = _table_from_rows(cols.SHEET_DEVICES, cols.DEVICE_HEADERS, [])
    stats = run_import(
        project,
        {cols.SHEET_DEVICES: devices, cols.SHEET_CONNECTIONS: connections},
        ImportOptions(views={"4"}, place_symbols=False, create_connections=True),
        Context(log),
    )
    assert stats.connections_made == 1
    # Провод на листе вида 5 при фильтре {4} не создаётся.
    assert stats.connections_failed == 1
    sheet_id, points = model.created_connections[0]
    assert sheet_id == 11
    # Ломаная воспроизведена точка в точку, а не заменена прямой.
    assert points == [(10.0, 10.0), (10.0, 50.0), (80.0, 50.0)]


# --- полный круг через файл ---------------------------------------------------
def test_full_roundtrip_through_xlsx():
    source = fake_e3.sample_model()
    project, log = make_project(source, {"4"})
    sheets, _ = run_export(project, ExportOptions(views={"4"}), Context(log))

    with tempfile.TemporaryDirectory() as folder:
        path = os.path.join(folder, "roundtrip.xlsx")
        excel_io.write_workbook(path, sheets)

        # Новый «проект»: те же изделия, но ни один символ не размещён.
        target = fake_e3.sample_model()
        for symbol in target.symbols.values():
            symbol.sheet_id = 0
        for sheet in target.sheets.values():
            sheet.symbol_ids.clear()
            sheet.segment_ids.clear()
        target.segments.clear()

        target_project, target_log = make_project(target, {"4"})
        tables = excel_io.read_tables(path)
        stats = run_import(
            target_project,
            tables,
            ImportOptions(
                views={"4"}, place_symbols=True, create_missing=True, create_connections=True
            ),
            Context(target_log),
        )

    # Координаты вернулись на свои места.
    assert target.symbols[1001].sheet_id == 11
    assert (target.symbols[1001].x, target.symbols[1001].y) == (76.0, 367.0)
    assert (target.symbols[1002].x, target.symbols[1002].y) == (351.0, 370.0)
    assert (target.symbols[1005].x, target.symbols[1005].y) == (120.0, 200.0)
    assert stats.bad_coordinates == 0
    # Оба провода листов вида 4 воспроизведены.
    assert stats.connections_made == 2
    assert target.created_connections[0][1] == [(10.0, 10.0), (10.0, 50.0), (80.0, 50.0)]


# --- задания рабочего потока --------------------------------------------------
def test_worker_export_job_runs_end_to_end():
    """Тот самый путь, который падал: Worker -> run_export -> запись книги.

    Задание выполняется в текущем потоке, минуя COM: нам важна не многопоточность,
    а то, что _do_export отрабатывает целиком и складывает события.
    """
    from e3tool import worker as wk
    from e3tool.export import ExportOptions

    model = fake_e3.sample_model()
    unit = wk.Worker()
    unit.app = e3api.E3App(fake_e3.ApplicationObject(model))
    unit.project = Project(unit.app, unit.log)
    unit.project.reload()

    with tempfile.TemporaryDirectory() as folder:
        path = os.path.join(folder, "worker.xlsx")
        unit._dispatch(wk.ExportJob(path=path, options=ExportOptions(views={"4"})))
        assert os.path.isfile(path)
        tables = excel_io.read_tables(path)
        assert excel_io.find_table(tables, cols.SHEET_DEVICES) is not None

    kinds = [event.kind for event in list(unit.events.queue)]
    assert wk.EVENT_DONE in kinds
    done = [event for event in list(unit.events.queue) if event.kind == wk.EVENT_DONE][-1]
    name, result = done.payload
    assert result["ok"] is True
    assert result["devices"] > 0


def test_worker_import_job_runs_end_to_end():
    from e3tool import worker as wk
    from e3tool.export import ExportOptions
    from e3tool.importer import ImportOptions

    source = fake_e3.sample_model()
    project, log = make_project(source, {"4"})
    sheets, _ = run_export(project, ExportOptions(views={"4"}), Context(log))

    with tempfile.TemporaryDirectory() as folder:
        path = os.path.join(folder, "worker.xlsx")
        excel_io.write_workbook(path, sheets)

        target = fake_e3.sample_model()
        for symbol in target.symbols.values():
            symbol.sheet_id = 0
        unit = wk.Worker()
        unit.app = e3api.E3App(fake_e3.ApplicationObject(target))
        unit.project = Project(unit.app, unit.log)
        unit.project.reload()
        unit._dispatch(
            wk.ImportJob(path=path, options=ImportOptions(views={"4"}, place_symbols=True))
        )

    done = [event for event in list(unit.events.queue) if event.kind == wk.EVENT_DONE][-1]
    name, result = done.payload
    assert result["ok"] is True
    assert result["placed"] + result["moved"] > 0


def test_worker_reports_missing_project_clearly():
    from e3tool import worker as wk
    from e3tool.export import ExportOptions

    unit = wk.Worker()
    try:
        unit._dispatch(wk.ExportJob(path="нет.xlsx", options=ExportOptions()))
    except e3api.E3Error as error:
        assert "Подключиться" in str(error)
    else:
        raise AssertionError("ожидалась понятная ошибка о том, что нет связи с E3")


def _table_from_rows(name: str, headers: list[str], rows: list[dict]):
    """Собирает Table так, как её отдал бы excel_io после чтения файла."""
    from e3tool.util import Row, Table, header_key

    prepared = []
    for index, row in enumerate(rows, start=2):
        data = {header_key(key): value for key, value in row.items()}
        prepared.append(Row(data, index))
    return Table(name, headers, prepared)


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
                import traceback

                failures += 1
                print(f"ОШИБКА {name}: {type(error).__name__} {error}")
                traceback.print_exc()
            else:
                print(f"ок     {name}")
    print(f"\nвсего провалов: {failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(_run_all())
