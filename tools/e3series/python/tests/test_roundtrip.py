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


def sheet_named(sheets: list, name: str):
    return next(sheet for sheet in sheets if sheet.name == name)


def test_export_placements_split_into_schema_and_footer():
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})
    sheets, stats = run_export(project, ExportOptions(views={"4"}), Context(log))

    schema = sheet_named(sheets, cols.SHEET_SCHEMA)
    footer = sheet_named(sheets, cols.SHEET_FOOTER)
    assert stats.placements == len(schema.rows) + len(footer.rows)

    poz_list = {row[cols.H_POZ] for row in schema.rows}
    assert "094-XVM-1201A" in poz_list
    assert "094-XVM-1202A" in poz_list
    # Лист вида 5 отфильтрован.
    assert "094-XV-1206" not in poz_list
    for row in schema.rows:
        assert row[cols.H_SYM_NR] >= 1
        assert row[cols.H_OBJ_TYPE] == "изделие"
        assert row[cols.H_ZONE] == cols.ZONE_SCHEMA
        assert row[cols.H_VIEW] == "4"
        assert row[cols.H_FORMAT] == "A2_ГОСТ"

    # Изделие 101 стоит на листе «1» дважды: в схемной части и в подвале.
    # В каждой вкладке оно должно встретиться ровно один раз.
    footer_poz = [row[cols.H_POZ] for row in footer.rows]
    assert footer_poz.count("094-XVM-1201A") == 1
    assert footer_poz.count("094-FT-1208") == 1
    assert [row[cols.H_ZONE] for row in footer.rows] == [cols.ZONE_FOOTER] * len(footer.rows)
    assert [row[cols.H_POZ] for row in schema.rows].count("094-XVM-1201A") == 1
    assert stats.sheets_with_footer == 1
    # Подвал опознан по имени типа символа, а не по координате.
    assert stats.sheets_footer_by_name == 1
    assert all(row[cols.H_ZONE_SOURCE] == "по имени символа" for row in footer.rows)


def test_export_single_table_when_split_disabled():
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})
    sheets, stats = run_export(
        project, ExportOptions(views={"4"}, split_zones=False), Context(log)
    )
    placements = sheet_named(sheets, cols.SHEET_PLACEMENTS)
    assert len(placements.rows) == stats.placements
    assert not any(sheet.name == cols.SHEET_FOOTER for sheet in sheets)
    # Все строки помечены схемой: делить не просили.
    assert {row[cols.H_ZONE] for row in placements.rows} == {cols.ZONE_SCHEMA}


def test_export_manual_footer_boundary_wins():
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})
    # Граница выше схемной части: в подвал уходит всё.
    sheets, _ = run_export(
        project, ExportOptions(views={"4"}, footer_y=400.0), Context(log)
    )
    assert sheet_named(sheets, cols.SHEET_SCHEMA).rows == []
    assert len(sheet_named(sheets, cols.SHEET_FOOTER).rows) > 0


def test_export_device_row_takes_schema_placement():
    """В лист «Изделия» идёт схемное размещение, а не строка из подвала."""
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})
    sheets, _ = run_export(project, ExportOptions(views={"4"}), Context(log))
    row = rows_by_poz(sheets[0].rows)["094-XVM-1201A"]
    assert (row[cols.H_X], row[cols.H_Y]) == (76.0, 367.0)
    assert row[cols.H_ZONE] == cols.ZONE_SCHEMA
    # И видно, что размещений у изделия больше одного.
    assert row[cols.H_PLACED_COUNT] == 2
    assert row[cols.H_VIEW] == "4"
    assert row[cols.H_FORMAT] == "A2_ГОСТ"


def test_export_sheets_table_describes_views_and_formats():
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4", "5"})
    sheets, stats = run_export(project, ExportOptions(views={"4", "5"}), Context(log))

    table = sheet_named(sheets, cols.SHEET_SHEETS)
    assert stats.sheets == len(table.rows) == 4
    by_id = {row[cols.H_SHEET_ID]: row for row in table.rows}
    assert by_id[11][cols.H_VIEW] == "4"
    assert by_id[11][cols.H_FORMAT] == "A2_ГОСТ"
    assert by_id[11][cols.H_VIEW_NAME] == cols.view_title("4")
    assert by_id[11][cols.H_YMAX] == 420.0
    # Одноимённые листы «1» различаются видом и форматом.
    assert by_id[14][cols.H_SHEET] == by_id[11][cols.H_SHEET] == "1"
    assert by_id[14][cols.H_VIEW] == "5"
    assert by_id[14][cols.H_FORMAT] == "A3_ГОСТ"
    # Видно, чем программа разделила лист. Здесь — именем символа, поэтому
    # граница по Y не нужна и остаётся пустой.
    assert by_id[11][cols.H_ZONE_SOURCE] == "по имени символа"
    assert not by_id[11][cols.H_FOOTER_Y]


def test_export_footer_not_invented_on_schema_only_sheet():
    """Лист без подвала делить нельзя: пустая полоса сама по себе не подвал."""
    model = fake_e3.FakeModel()
    model.add_sheet(21, "10", view="4")
    model.add_device(201, "-A-1", "к", {"Поз. обозначение": "A-1"})
    model.add_symbol(2101, device_id=201, sheet_id=21, x=100.0, y=300.0)
    model.add_device(202, "-A-2", "к", {"Поз. обозначение": "A-2"})
    model.add_symbol(2102, device_id=202, sheet_id=21, x=100.0, y=360.0)

    project, log = make_project(model, {"4"})
    sheets, stats = run_export(project, ExportOptions(views={"4"}), Context(log))
    assert stats.sheets_with_footer == 0
    assert len(sheet_named(sheets, cols.SHEET_SCHEMA).rows) == 2
    assert sheet_named(sheets, cols.SHEET_FOOTER).rows == []


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


# --- виды, форматы и одноимённые листы ----------------------------------------
def test_import_uses_view_to_pick_sheet_with_duplicate_name():
    """Листы «1» вида 4 и вида 5 различаются только видом — он и решает."""
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4", "5"})
    placements = _table_from_rows(
        cols.SHEET_SCHEMA,
        cols.PLACEMENT_HEADERS,
        [
            {
                cols.H_POZ: "094-FT-1208",
                cols.H_SYM_NR: 1,
                cols.H_SHEET: "1",
                cols.H_VIEW: "4",
                cols.H_X: 250.0,
                cols.H_Y: 310.0,
            },
            {
                cols.H_POZ: "094-FT-1208",
                cols.H_SYM_NR: 2,
                cols.H_SHEET: "1",
                cols.H_VIEW: "5",
                cols.H_X: 260.0,
                cols.H_Y: 270.0,
            },
        ],
    )
    stats = run_import(
        project,
        {
            cols.SHEET_DEVICES: _table_from_rows(cols.SHEET_DEVICES, cols.DEVICE_HEADERS, []),
            cols.SHEET_SCHEMA: placements,
        },
        ImportOptions(views={"4", "5"}, place_symbols=True, create_missing=False),
        Context(log),
    )
    assert stats.errors == 0
    assert (model.symbols[1009].sheet_id, model.symbols[1009].y) == (11, 310.0)
    assert (model.symbols[1010].sheet_id, model.symbols[1010].y) == (14, 270.0)


def test_import_reads_both_schema_and_footer_tables():
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})
    tables = {
        cols.SHEET_DEVICES: _table_from_rows(cols.SHEET_DEVICES, cols.DEVICE_HEADERS, []),
        cols.SHEET_SCHEMA: _table_from_rows(
            cols.SHEET_SCHEMA,
            cols.PLACEMENT_HEADERS,
            [
                {
                    cols.H_POZ: "094-XVM-1201A",
                    cols.H_SYM_NR: 1,
                    cols.H_SHEET_ID: 11,
                    cols.H_VIEW: "4",
                    cols.H_X: 80.0,
                    cols.H_Y: 360.0,
                }
            ],
        ),
        cols.SHEET_FOOTER: _table_from_rows(
            cols.SHEET_FOOTER,
            cols.PLACEMENT_HEADERS,
            [
                {
                    cols.H_POZ: "094-XVM-1201A",
                    cols.H_SYM_NR: 2,
                    cols.H_SHEET_ID: 11,
                    cols.H_VIEW: "4",
                    cols.H_X: 130.0,
                    cols.H_Y: 30.0,
                }
            ],
        ),
    }
    stats = run_import(
        project,
        tables,
        ImportOptions(views={"4"}, place_symbols=True, create_missing=False),
        Context(log),
    )
    assert stats.moved == 2
    assert (model.symbols[1001].x, model.symbols[1001].y) == (80.0, 360.0)
    assert (model.symbols[1008].x, model.symbols[1008].y) == (130.0, 30.0)


def test_import_applies_sheet_format_from_excel():
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})
    tables = {
        cols.SHEET_DEVICES: _table_from_rows(cols.SHEET_DEVICES, cols.DEVICE_HEADERS, []),
        cols.SHEET_SHEETS: _table_from_rows(
            cols.SHEET_SHEETS,
            cols.SHEET_HEADERS,
            [
                {
                    cols.H_SHEET_ID: 11,
                    cols.H_SHEET: "1",
                    cols.H_VIEW: "4",
                    cols.H_FORMAT: "A3_ГОСТ",
                },
                # Формат не изменился — трогать лист не нужно.
                {
                    cols.H_SHEET_ID: 12,
                    cols.H_SHEET: "2",
                    cols.H_VIEW: "4",
                    cols.H_FORMAT: "A2_ГОСТ",
                },
            ],
        ),
    }
    stats = run_import(project, tables, ImportOptions(views={"4"}), Context(log))
    assert stats.sheets_reformatted == 1
    assert model.sheets[11].fmt == "A3_ГОСТ"
    assert model.formats_applied == [(11, "A3_ГОСТ")]
    # Кэш проекта обновлён — повторный импорт не будет писать то же самое.
    assert project.sheet_format_of(11) == "A3_ГОСТ"


def test_import_reports_unknown_sheet_format():
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})
    tables = {
        cols.SHEET_DEVICES: _table_from_rows(cols.SHEET_DEVICES, cols.DEVICE_HEADERS, []),
        cols.SHEET_SHEETS: _table_from_rows(
            cols.SHEET_SHEETS,
            cols.SHEET_HEADERS,
            [{cols.H_SHEET_ID: 11, cols.H_SHEET: "1", cols.H_FORMAT: "нет_такой_рамки"}],
        ),
    }
    stats = run_import(project, tables, ImportOptions(views={"4"}), Context(log))
    assert stats.sheets_reformatted == 0
    assert stats.errors == 1
    assert model.sheets[11].fmt == "A2_ГОСТ"


def test_import_takes_format_from_element_row():
    """Формат листа можно поправить прямо в строке изделия."""
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})
    tables = {
        cols.SHEET_DEVICES: _table_from_rows(
            cols.SHEET_DEVICES,
            cols.DEVICE_HEADERS,
            [
                {
                    cols.H_POZ: "094-XVM-1201A",
                    cols.H_SHEET_ID: 11,
                    cols.H_VIEW: "4",
                    cols.H_FORMAT: "A1_ГОСТ",
                }
            ],
        )
    }
    stats = run_import(
        project, tables, ImportOptions(views={"4"}, place_symbols=False), Context(log)
    )
    assert stats.sheets_reformatted == 1
    assert model.sheets[11].fmt == "A1_ГОСТ"


def test_import_changes_view_only_when_allowed():
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4", "5"})
    tables = {
        cols.SHEET_DEVICES: _table_from_rows(cols.SHEET_DEVICES, cols.DEVICE_HEADERS, []),
        cols.SHEET_SHEETS: _table_from_rows(
            cols.SHEET_SHEETS,
            cols.SHEET_HEADERS,
            [{cols.H_SHEET_ID: 12, cols.H_SHEET: "2", cols.H_VIEW: "5"}],
        ),
    }
    stats = run_import(project, tables, ImportOptions(views={"4", "5"}), Context(log))
    assert stats.sheets_reviewed == 0
    assert model.sheets[12].view == "4"

    model2 = fake_e3.sample_model()
    project2, log2 = make_project(model2, {"4", "5"})
    stats2 = run_import(
        project2, tables, ImportOptions(views={"4", "5"}, apply_sheet_views=True), Context(log2)
    )
    assert stats2.sheets_reviewed == 1
    assert model2.sheets[12].view == "5"
    assert project2.sheet_view_of(12) == "5"


def test_import_creates_missing_sheet_and_places_on_it():
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})
    tables = {
        cols.SHEET_DEVICES: _table_from_rows(cols.SHEET_DEVICES, cols.DEVICE_HEADERS, []),
        cols.SHEET_SHEETS: _table_from_rows(
            cols.SHEET_SHEETS,
            cols.SHEET_HEADERS,
            [{cols.H_SHEET: "99", cols.H_VIEW: "4", cols.H_FORMAT: "A3_ГОСТ"}],
        ),
        cols.SHEET_SCHEMA: _table_from_rows(
            cols.SHEET_SCHEMA,
            cols.PLACEMENT_HEADERS,
            [
                {
                    cols.H_POZ: "094-TS-1203",
                    cols.H_SYM_NR: 1,
                    cols.H_SHEET: "99",
                    cols.H_VIEW: "4",
                    cols.H_X: 40.0,
                    cols.H_Y: 50.0,
                }
            ],
        ),
    }
    stats = run_import(
        project,
        tables,
        ImportOptions(views={"4"}, place_symbols=True, create_sheets=True),
        Context(log),
    )
    assert stats.sheets_created == 1
    created = [sheet for sheet in model.sheets.values() if sheet.name == "99"]
    assert len(created) == 1 and created[0].fmt == "A3_ГОСТ" and created[0].view == "4"
    # Символ встал на только что созданный лист.
    assert model.symbols[1003].sheet_id == created[0].sheet_id
    assert stats.placed == 1


def test_import_without_permission_does_not_create_sheet():
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})
    tables = {
        cols.SHEET_DEVICES: _table_from_rows(cols.SHEET_DEVICES, cols.DEVICE_HEADERS, []),
        cols.SHEET_SHEETS: _table_from_rows(
            cols.SHEET_SHEETS,
            cols.SHEET_HEADERS,
            [{cols.H_SHEET: "99", cols.H_VIEW: "4", cols.H_FORMAT: "A3_ГОСТ"}],
        ),
    }
    stats = run_import(project, tables, ImportOptions(views={"4"}), Context(log))
    assert stats.sheets_created == 0
    assert not any(sheet.name == "99" for sheet in model.sheets.values())


def test_import_mirror_column_is_understood():
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})
    table = _table_from_rows(
        cols.SHEET_DEVICES,
        cols.DEVICE_HEADERS,
        [
            {
                cols.H_POZ: "094-XVM-1201A",
                cols.H_SHEET_ID: 11,
                cols.H_X: 50.0,
                cols.H_Y: 300.0,
                cols.H_ROT: "90",
                cols.H_MIRROR: "MX",
            }
        ],
    )
    run_import(
        project,
        {cols.SHEET_DEVICES: table},
        ImportOptions(views={"4"}, place_symbols=True, create_missing=False),
        Context(log),
    )
    # Поворот и зеркало собираются в одну строку, как их отдаёт GetRotation.
    assert model.symbols[1001].rotation == "MX90"


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


def test_full_roundtrip_with_both_views_restores_every_placement():
    """Точь-в-точь: оба вида, обе зоны листа, одноимённые листы.

    Именно этот случай раньше терялся: изделие, размещённое на ФСА, в подвале
    ФСА и на схеме соединений, в одной таблице выглядело как три одинаковых
    строки, а обратно вставало не туда.
    """
    source = fake_e3.sample_model()
    project, log = make_project(source, {"4", "5"})
    sheets, stats = run_export(project, ExportOptions(views={"4", "5"}), Context(log))
    # Подвал ФСА: два символа с типом «Подвал_…».
    assert stats.footer_rows == 2

    with tempfile.TemporaryDirectory() as folder:
        path = os.path.join(folder, "both_views.xlsx")
        excel_io.write_workbook(path, sheets)

        target = fake_e3.sample_model()
        for symbol in target.symbols.values():
            symbol.sheet_id = 0
        for sheet in target.sheets.values():
            sheet.symbol_ids.clear()
            sheet.segment_ids.clear()
        target.segments.clear()

        target_project, target_log = make_project(target, {"4", "5"})
        import_stats = run_import(
            target_project,
            excel_io.read_tables(path),
            ImportOptions(views={"4", "5"}, place_symbols=True, create_missing=True),
            Context(target_log),
        )

    expected = {
        1001: (11, 76.0, 367.0),   # схемная часть ФСА
        1008: (11, 126.0, 32.0),   # та же позиция в подвале ФСА
        1009: (11, 200.0, 300.0),  # лист «1» вида 4
        1010: (14, 210.0, 260.0),  # лист «1» вида 5 — то же имя, другой вид
        1006: (13, 50.0, 50.0),
        1002: (12, 351.0, 370.0),
        # Символ 1005 его изделие не отдаёт через Device.GetSymbolIds. Раньше
        # он не возвращался вовсе; теперь он адресуется напрямую и встаёт на
        # место, как и всё остальное.
        1005: (12, 120.0, 200.0),
    }
    for symbol_id, (sheet_id, x, y) in expected.items():
        symbol = target.symbols[symbol_id]
        assert (symbol.sheet_id, symbol.x, symbol.y) == (sheet_id, x, y), symbol_id
    assert import_stats.bad_coordinates == 0
    assert import_stats.errors == 0


def test_second_export_of_same_project_is_identical():
    """Повторная выгрузка должна давать тот же файл: порядок строк устойчив."""
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4", "5"})
    first, _ = run_export(project, ExportOptions(views={"4", "5"}), Context(log))
    second, _ = run_export(project, ExportOptions(views={"4", "5"}), Context(log))
    assert [sheet.name for sheet in first] == [sheet.name for sheet in second]
    for left, right in zip(first, second):
        if hasattr(left, "blocks"):
            assert [block.rows for block in left.blocks] == [
                block.rows for block in right.blocks
            ], left.name
        else:
            assert left.rows == right.rows, left.name


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


# --- пакетный режим и освобождение E3 -----------------------------------------
def test_batch_closes_transaction_and_restores_dialogs():
    """Главная причина «E3 занята»: незакрытая транзакция скрипта."""
    model = fake_e3.sample_model()
    app = e3api.E3App(fake_e3.ApplicationObject(model))

    app.begin_batch(writing=True)
    # На время работы модальные диалоги отключены, иначе обе программы встанут.
    assert model.dialogs_enabled is False
    assert model.messages_suppressed is True
    assert model.undo_after_execution is False

    notes = app.end_batch(commit=True)
    assert model.finalized == 1
    # Диалоги обязаны вернуться, иначе E3 останется «немой».
    assert model.dialogs_enabled is True
    assert model.messages_suppressed is False
    assert model.slept_ms  # E3 дали разгрести очередь
    assert any("FinalizeTransaction" in note for note in notes)


def test_read_only_batch_does_not_commit():
    model = fake_e3.sample_model()
    app = e3api.E3App(fake_e3.ApplicationObject(model))
    app.begin_batch(writing=False)
    # Для выгрузки откат трогать не за чем.
    assert model.undo_after_execution is None
    app.end_batch(commit=False)
    assert model.finalized == 0
    assert model.dialogs_enabled is True


def test_worker_releases_e3_after_import():
    from e3tool import worker as wk
    from e3tool.export import ExportOptions
    from e3tool.importer import ImportOptions

    source = fake_e3.sample_model()
    project, log = make_project(source, {"4"})
    sheets, _ = run_export(project, ExportOptions(views={"4"}), Context(log))

    with tempfile.TemporaryDirectory() as folder:
        path = os.path.join(folder, "release.xlsx")
        excel_io.write_workbook(path, sheets)

        target = fake_e3.sample_model()
        for symbol in target.symbols.values():
            symbol.sheet_id = 0

        unit = wk.Worker()
        unit.app = e3api.E3App(fake_e3.ApplicationObject(target), pid=4242)
        unit.project = Project(unit.app, unit.log)
        unit.project.reload()

        changed = unit._dispatch(
            wk.ImportJob(path=path, options=ImportOptions(views={"4"}, place_symbols=True))
        )
        assert changed is True
        unit._finish_batch(changed)

    # Транзакция закрыта, диалоги возвращены, соединение отпущено.
    assert target.finalized == 1
    assert target.dialogs_enabled is True
    assert unit.app is None and unit.project is None
    # PID запомнен — при следующей операции подключимся сами.
    assert unit.last_pid == 4242
    states = [e.payload for e in list(unit.events.queue) if e.kind == wk.EVENT_STATE]
    assert any(state.get("released") for state in states)


def test_worker_keeps_connection_when_auto_release_off():
    from e3tool import worker as wk
    from e3tool.export import ExportOptions

    model = fake_e3.sample_model()
    unit = wk.Worker()
    unit.auto_release = False
    unit.app = e3api.E3App(fake_e3.ApplicationObject(model), pid=7)
    unit.project = Project(unit.app, unit.log)
    unit.project.reload()

    with tempfile.TemporaryDirectory() as folder:
        changed = unit._dispatch(
            wk.ExportJob(path=os.path.join(folder, "a.xlsx"), options=ExportOptions(views={"4"}))
        )
    unit._finish_batch(bool(changed))
    assert unit.app is not None
    # Выгрузка ничего не меняет — коммитить нечего.
    assert model.finalized == 0


def test_worker_clears_undo_only_when_asked():
    from e3tool import worker as wk
    from e3tool.export import ExportOptions
    from e3tool.importer import ImportOptions

    source = fake_e3.sample_model()
    project, log = make_project(source, {"4"})
    sheets, _ = run_export(project, ExportOptions(views={"4"}), Context(log))

    with tempfile.TemporaryDirectory() as folder:
        path = os.path.join(folder, "undo.xlsx")
        excel_io.write_workbook(path, sheets)

        for clear_undo, expected in ((False, 0), (True, 1)):
            target = fake_e3.sample_model()
            for symbol in target.symbols.values():
                symbol.sheet_id = 0
            unit = wk.Worker()
            unit.app = e3api.E3App(fake_e3.ApplicationObject(target))
            unit.project = Project(unit.app, unit.log)
            unit.project.reload()
            unit._dispatch(
                wk.ImportJob(
                    path=path,
                    options=ImportOptions(views={"4"}, place_symbols=True),
                    clear_undo=clear_undo,
                )
            )
            assert target.undo_removed == expected


def test_worker_release_job_frees_e3_on_demand():
    from e3tool import worker as wk

    model = fake_e3.sample_model()
    unit = wk.Worker()
    unit.app = e3api.E3App(fake_e3.ApplicationObject(model), pid=11)
    unit.project = Project(unit.app, unit.log)
    unit._dispatch(wk.ReleaseJob())
    assert unit.app is None
    assert model.dialogs_enabled is True


# --- вкладки по видам ---------------------------------------------------------
def test_export_view_tabs_split_devices_by_preferred_view():
    """Вторая и третья вкладки — изделия вида 4 и вида 5, каждое по разу."""
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4", "5"})
    sheets, stats = run_export(project, ExportOptions(views={"4", "5"}), Context(log))

    view4 = sheet_named(sheets, cols.SHEET_VIEW4)
    view5 = sheet_named(sheets, cols.SHEET_VIEW5)

    poz4 = [row[cols.H_POZ] for row in view4.rows]
    poz5 = [row[cols.H_POZ] for row in view5.rows]
    # Изделие 101 стоит на ФСА дважды (схема и подвал) — в таблице оно один раз.
    assert poz4.count("094-XVM-1201A") == 1
    assert "094-XVM-1201A" not in poz5
    # Изделие 108 есть на обоих видах — по строке на каждой вкладке.
    assert "094-FT-1208" in poz4 and "094-FT-1208" in poz5
    # Изделие только вида 5 на вкладку ФСА не попадает.
    assert "094-XV-1206" in poz5 and "094-XV-1206" not in poz4
    assert stats.view4_devices == len(poz4)
    assert stats.view5_devices == len(poz5)


def test_view5_tab_compares_itself_with_view4():
    """Третья вкладка обрабатывается следующим шагом: сверка с видом 4."""
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4", "5"})
    sheets, _ = run_export(project, ExportOptions(views={"4", "5"}), Context(log))

    rows = rows_by_poz(sheet_named(sheets, cols.SHEET_VIEW5).rows)

    # 108: два размещения на ФСА (схема и подвал) против одного здесь.
    flow = rows["094-FT-1208"]
    assert flow[cols.H_ON_OTHER_VIEW] == "да"
    assert flow[cols.H_COUNT_OTHER_VIEW] == 2
    assert flow[cols.H_COUNT_HERE] == 1
    assert flow[cols.H_CHECK] == "число размещений разное"

    # 106 живёт только на схеме соединений — на ФСА его нет вовсе.
    only5 = rows["094-XV-1206"]
    assert only5[cols.H_ON_OTHER_VIEW] == "нет"
    assert only5[cols.H_CHECK] == "нет на ФСА"


def test_view_tabs_carry_signal_attributes():
    """Атрибуты сверки должны быть в книге, иначе сигналы теряются."""
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})
    sheets, _ = run_export(project, ExportOptions(views={"4"}), Context(log))
    row = rows_by_poz(sheets[0].rows)["094-XVM-1201A"]
    assert row[cols.A_DI] == "2"
    assert row[cols.A_DO] == "1"
    assert row[cols.A_FULL_TAG] == "094-XVM-1201A"
    assert row["ID Сигнала 1"] == "S-001"


def test_report_tabs_are_not_applied_back_but_edits_are_reported():
    """Правка на вкладке-отчёте не применяется — и об этом сказано в журнале."""
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})
    log.verbose = True

    devices = _table_from_rows(
        cols.SHEET_DEVICES,
        cols.DEVICE_HEADERS,
        [{cols.H_POZ: "094-XVM-1201A", "*Описание краткое": "исходное"}],
    )
    report = _table_from_rows(
        cols.SHEET_VIEW4,
        cols.VIEW_DEVICE_HEADERS,
        [{cols.H_POZ: "094-XVM-1201A", "*Описание краткое": "правка на отчёте"}],
    )
    run_import(
        project,
        {cols.SHEET_DEVICES: devices, cols.SHEET_VIEW4: report},
        ImportOptions(views={"4"}, place_symbols=False, create_missing=False),
        Context(log),
    )
    # В проект попало значение с главного листа, а не с отчёта.
    assert model.devices[101].attributes["*Описание краткое"] == "исходное"
    warnings = [line for line in log.lines if "отчёт" in line]
    assert warnings, log.lines
    assert any("Описание краткое" in line for line in log.lines)


# --- надписи ------------------------------------------------------------------
def test_export_collects_free_texts_and_skips_symbol_labels():
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4", "5"})
    sheets, stats = run_export(project, ExportOptions(views={"4", "5"}), Context(log))

    table = sheet_named(sheets, cols.SHEET_TEXTS)
    values = {row[cols.H_TEXT] for row in table.rows}
    assert "ПРИМЕЧАНИЕ: уставки уточняются" in values
    assert "Схема соединений шкафа" in values
    # Надпись символа 1005 («094-PT-1205») принадлежит символу — её не берём.
    assert "094-PT-1205" not in values
    assert stats.texts_of_symbols >= 1

    row = next(r for r in table.rows if r[cols.H_TEXT].startswith("ПРИМЕЧАНИЕ"))
    assert (row[cols.H_SHEET_ID], row[cols.H_X], row[cols.H_Y]) == (11, 40.0, 120.0)
    assert row[cols.H_VIEW] == "4"


def test_import_moves_and_retypes_text():
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})
    table = _table_from_rows(
        cols.SHEET_TEXTS,
        cols.TEXT_HEADERS,
        [
            {
                cols.H_TEXT_ID: 3001,
                cols.H_SHEET: "1",
                cols.H_SHEET_ID: 11,
                cols.H_VIEW: "4",
                cols.H_X: 55,
                cols.H_Y: 130,
                cols.H_TEXT: "ПРИМЕЧАНИЕ: уставки согласованы",
            }
        ],
    )
    stats = run_import(
        project, {cols.SHEET_TEXTS: table},
        ImportOptions(views={"4"}, place_symbols=False, create_missing=False),
        Context(log),
    )
    text = model.texts[3001]
    assert (text.x, text.y) == (55.0, 130.0)
    assert text.value == "ПРИМЕЧАНИЕ: уставки согласованы"
    assert stats.texts_moved == 1
    assert stats.texts_retyped == 1


def test_import_does_not_touch_text_that_lives_on_another_sheet():
    """Чужой проект: тот же ID — совсем другой текст. Молча переписать нельзя."""
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4", "5"})
    table = _table_from_rows(
        cols.SHEET_TEXTS,
        cols.TEXT_HEADERS,
        [
            {
                cols.H_TEXT_ID: 3002,   # на самом деле лежит на листе 13
                cols.H_SHEET_ID: 11,
                cols.H_VIEW: "4",
                cols.H_X: 10,
                cols.H_Y: 10,
                cols.H_TEXT: "не должно примениться",
            }
        ],
    )
    stats = run_import(
        project, {cols.SHEET_TEXTS: table},
        ImportOptions(views={"4", "5"}, place_symbols=False, create_missing=False),
        Context(log),
    )
    assert model.texts[3002].value == "Схема соединений шкафа"
    assert stats.texts_moved == 0
    assert stats.texts_skipped == 1


def test_import_creates_text_only_with_permission():
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})
    row = {
        cols.H_SHEET: "1",
        cols.H_SHEET_ID: 11,
        cols.H_VIEW: "4",
        cols.H_X: 70,
        cols.H_Y: 200,
        cols.H_TEXT: "новая надпись",
    }
    table = _table_from_rows(cols.SHEET_TEXTS, cols.TEXT_HEADERS, [row])
    before = len(model.texts)

    stats = run_import(
        project, {cols.SHEET_TEXTS: table},
        ImportOptions(views={"4"}, place_symbols=False, create_missing=False),
        Context(log),
    )
    assert len(model.texts) == before and stats.texts_created == 0

    stats = run_import(
        project, {cols.SHEET_TEXTS: table},
        ImportOptions(views={"4"}, place_symbols=False, create_missing=False, create_texts=True),
        Context(log),
    )
    assert stats.texts_created == 1
    created = [text for text in model.texts.values() if text.value == "новая надпись"]
    assert len(created) == 1
    assert (created[0].sheet_id, created[0].x, created[0].y) == (11, 70.0, 200.0)


# --- сверка сигналов ----------------------------------------------------------
def test_signal_report_counts_footer_on_view4_and_all_on_view5():
    """Правило из скрипта: вид 4 считается по подвалу, вид 5 — целиком."""
    from e3tool import signals as sig

    model = fake_e3.sample_model()
    project, log = make_project(model, {"4", "5"})
    sheets, _ = run_export(project, ExportOptions(views={"4", "5"}), Context(log))
    report = sheet_named(sheets, cols.SHEET_SIGNALS)

    titles = [block.title for block in report.blocks]
    assert any("PREFERRED_VIEW = 4" in title for title in titles)
    assert any("PREFERRED_VIEW = 5" in title for title in titles)
    assert any(title.startswith("СВОДНАЯ") for title in titles)

    summary = next(block for block in report.blocks if block.title.startswith("СВОДНАЯ"))
    by_kind = {row[0]: row for row in summary.rows}
    # Вид 4: в подвале изделия 101 (DI 2, DO 1) и 108 (AI 1).
    assert by_kind["DI"][1] == 2
    assert by_kind["DO"][1] == 1
    # Вид 5: изделия 106 (нет счётчиков), 108 (AI 1); кабель исключён по dip_type.
    assert by_kind["DI"][2] == 0
    assert by_kind["DI"][4] == sig.MISMATCH
    assert by_kind["AI"][4] == sig.OK


def test_signal_report_excludes_cables_and_terminals():
    """dip_type = cable/xt/jb в сверке не участвуют, хотя стоят на листах."""
    from e3tool import signals as sig

    model = fake_e3.sample_model()
    project, log = make_project(model, {"4", "5"})
    sheets, _ = run_export(project, ExportOptions(views={"4", "5"}), Context(log))
    report = sheet_named(sheets, cols.SHEET_SIGNALS)

    everything = [
        str(cell)
        for block in report.blocks
        for row in block.rows
        for cell in row
    ]
    assert "W-1209" not in everything
    # DI кабеля (9 штук) не попал ни в один итог.
    summary = next(block for block in report.blocks if block.title.startswith("СВОДНАЯ"))
    assert all(row[1] < 9 and row[2] < 9 for row in summary.rows)
    assert sig.MISSING  # константа используется в отчёте


def test_signal_report_finds_device_present_on_one_view_only():
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4", "5"})
    sheets, _ = run_export(project, ExportOptions(views={"4", "5"}), Context(log))
    report = sheet_named(sheets, cols.SHEET_SIGNALS)

    block = next(block for block in report.blocks if block.title.startswith("СИГНАЛЫ"))
    statuses = {row[2]: row[-1] for row in block.rows}
    assert statuses["-094-XVM-1201A"] == "только вид 4"
    assert statuses["-094-FT-1208"] == "в обоих видах"


def test_signal_counts_ignore_junk_values():
    from e3tool.signals import _as_int

    assert _as_int("3") == 3
    assert _as_int("2,0") == 2
    assert _as_int("") == 0
    assert _as_int("нет") == 0


# --- опознание по GID ---------------------------------------------------------
def test_symbol_without_any_attributes_survives_the_round_trip():
    """Главный случай: символ без изделия, без имени и без атрибутов.

    Раньше он не попадал в книгу вовсе — экспорт выбрасывал всё, что не
    привязалось к изделию. Теперь он живёт своим GID и возвращается на место.
    """
    model = fake_e3.FakeModel()
    model.add_sheet(11, "1", view="4")
    # Ничей символ: ни одно изделие не отдаёт его через GetSymbolIds.
    model.add_symbol(1500, sheet_id=11, x=123.0, y=45.0, type_name="Рамка")

    project, log = make_project(model, {"4"})
    sheets, stats = run_export(project, ExportOptions(views={"4"}), Context(log))
    rows = sheet_named(sheets, cols.SHEET_SCHEMA).rows
    assert len(rows) == 1
    row = rows[0]
    assert row[cols.H_GID]
    assert row[cols.H_POZ] == ""          # обозначения нет и не будет
    assert row[cols.H_DEV_ID] == 0
    assert row[cols.H_OBJ_TYPE] == "без изделия"
    assert row[cols.H_SYM_DB] == "Рамка"
    assert (row[cols.H_X], row[cols.H_Y]) == (123.0, 45.0)
    assert stats.symbols_without_device == 1

    # И обратно: символ уехал, книга ставит его назад.
    model.symbols[1500].sheet_id = 0
    model.sheets[11].symbol_ids.clear()
    target, target_log = make_project(model, {"4"})
    stats = run_import(
        target,
        {cols.SHEET_SCHEMA: _table_from_rows(cols.SHEET_SCHEMA, cols.PLACEMENT_HEADERS, [row])},
        ImportOptions(views={"4"}, place_symbols=True),
        Context(target_log),
    )
    assert (model.symbols[1500].sheet_id, model.symbols[1500].x) == (11, 123.0)
    assert stats.found_by_gid == 1
    assert stats.errors == 0


def test_placement_row_without_poz_is_not_dropped():
    """Строка с координатами обязана сработать без «Поз. обозначения»."""
    model = fake_e3.sample_model()
    model.symbols[1001].sheet_id = 0
    model.sheets[11].symbol_ids.remove(1001)
    project, log = make_project(model, {"4"})

    row = {
        cols.H_SYM_ID: 1001,     # ни GID, ни обозначения — только номер символа
        cols.H_SHEET: "1",
        cols.H_SHEET_ID: 11,
        cols.H_VIEW: "4",
        cols.H_X: 76,
        cols.H_Y: 367,
    }
    stats = run_import(
        project,
        {cols.SHEET_SCHEMA: _table_from_rows(cols.SHEET_SCHEMA, cols.PLACEMENT_HEADERS, [row])},
        ImportOptions(views={"4"}, place_symbols=True),
        Context(log),
    )
    assert (model.symbols[1001].sheet_id, model.symbols[1001].x) == (11, 76.0)
    assert stats.found_by_id == 1
    assert stats.errors == 0


def test_gid_wins_over_wrong_symbol_id():
    """GID главнее номера: устаревший «ID символа» не должен уводить не туда."""
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})
    row = {
        cols.H_GID: "{sym-00001001}",
        cols.H_SYM_ID: 1002,     # чужой символ, да ещё и на другом листе
        cols.H_SHEET: "1",
        cols.H_SHEET_ID: 11,
        cols.H_VIEW: "4",
        cols.H_X: 90,
        cols.H_Y: 300,
    }
    run_import(
        project,
        {cols.SHEET_SCHEMA: _table_from_rows(cols.SHEET_SCHEMA, cols.PLACEMENT_HEADERS, [row])},
        ImportOptions(views={"4"}, place_symbols=True),
        Context(log),
    )
    assert (model.symbols[1001].x, model.symbols[1001].y) == (90.0, 300.0)
    assert (model.symbols[1002].x, model.symbols[1002].y) == (351.0, 370.0)  # не тронут


def test_unknown_gid_falls_back_to_poz():
    """Книга из другого проекта: GID чужой, опознание идёт дальше по цепочке."""
    model = fake_e3.sample_model()
    model.symbols[1001].sheet_id = 0
    model.sheets[11].symbol_ids.remove(1001)
    project, log = make_project(model, {"4"})
    row = {
        cols.H_GID: "{sym-00099999}",   # такого объекта в проекте нет
        cols.H_POZ: "094-XVM-1201A",
        cols.H_SYM_NR: 1,
        cols.H_SHEET: "1",
        cols.H_SHEET_ID: 11,
        cols.H_VIEW: "4",
        cols.H_X: 76,
        cols.H_Y: 367,
    }
    stats = run_import(
        project,
        {cols.SHEET_SCHEMA: _table_from_rows(cols.SHEET_SCHEMA, cols.PLACEMENT_HEADERS, [row])},
        ImportOptions(views={"4"}, place_symbols=True),
        Context(log),
    )
    assert model.symbols[1001].sheet_id == 11
    assert stats.found_by_gid == 0 and stats.found_by_poz == 1


def test_missing_symbol_is_inserted_from_library_only_with_permission():
    """Шаблон: своего объекта нет, символ берётся из базы E3 по имени."""
    model = fake_e3.FakeModel()
    model.add_sheet(11, "1", view="4")
    project, log = make_project(model, {"4"})
    row = {
        cols.H_GID: "{sym-00077777}",
        cols.H_SYM_DB: "Подвал_AI",
        cols.H_SYM_VERSION: "1",
        cols.H_SHEET: "1",
        cols.H_SHEET_ID: 11,
        cols.H_VIEW: "4",
        cols.H_X: 50,
        cols.H_Y: 60,
        cols.H_SCALE: 2,
    }
    table = {cols.SHEET_SCHEMA: _table_from_rows(cols.SHEET_SCHEMA, cols.PLACEMENT_HEADERS, [row])}

    stats = run_import(project, table, ImportOptions(views={"4"}, place_symbols=True), Context(log))
    assert stats.symbols_created == 0 and stats.symbols_missing == 1
    assert not model.sheets[11].symbol_ids

    project, log = make_project(model, {"4"})
    stats = run_import(
        project, table,
        ImportOptions(views={"4"}, place_symbols=True, create_symbols=True),
        Context(log),
    )
    assert stats.symbols_created == 1
    placed = [model.symbols[i] for i in model.sheets[11].symbol_ids]
    assert len(placed) == 1
    assert (placed[0].type_name, placed[0].x, placed[0].y) == ("Подвал_AI", 50.0, 60.0)
    assert placed[0].scale == 2.0        # масштаб тоже переносится


def test_symbol_not_in_library_is_reported_not_silently_lost():
    model = fake_e3.FakeModel()
    model.add_sheet(11, "1", view="4")
    project, log = make_project(model, {"4"})
    log.verbose = True
    row = {
        cols.H_SYM_DB: "Такого_символа_нет",
        cols.H_SHEET_ID: 11,
        cols.H_VIEW: "4",
        cols.H_X: 10,
        cols.H_Y: 10,
    }
    stats = run_import(
        project,
        {cols.SHEET_SCHEMA: _table_from_rows(cols.SHEET_SCHEMA, cols.PLACEMENT_HEADERS, [row])},
        ImportOptions(views={"4"}, place_symbols=True, create_symbols=True),
        Context(log),
    )
    assert stats.errors == 1
    assert any("не найден в базе" in line for line in log.lines), log.lines


def test_owner_comes_from_e3_not_from_guessing_by_text():
    """Device.SetId(символ) даёт владельца точно — догадки по надписи не нужны."""
    model = fake_e3.sample_model()
    project, log = make_project(model, {"4"})
    sheets, stats = run_export(project, ExportOptions(views={"4"}), Context(log))
    # Символ 1005 принадлежит изделию 105, но GetSymbolIds его не отдаёт.
    model.devices[105].symbol_ids.append(1005)
    project2, log2 = make_project(model, {"4"})
    sheets2, stats2 = run_export(project2, ExportOptions(views={"4"}), Context(log2))
    rows = {row[cols.H_SYM_ID]: row for row in sheet_named(sheets2, cols.SHEET_SCHEMA).rows}
    assert rows[1005][cols.H_POZ] == "094-PT-1205"
    assert rows[1005][cols.H_DEV_ID] == 105


def test_device_row_without_poz_is_found_by_gid():
    """Изделие с пустым «Поз. обозначение» тоже должно обновляться."""
    model = fake_e3.sample_model()
    model.devices[101].attributes.pop("Поз. обозначение")
    project, log = make_project(model, {"4"})
    table = _table_from_rows(
        cols.SHEET_DEVICES,
        cols.DEVICE_HEADERS,
        [{cols.H_GID: "{dev-00000101}", "*Описание краткое": "записано по GID"}],
    )
    stats = run_import(
        project, {cols.SHEET_DEVICES: table},
        ImportOptions(views={"4"}, place_symbols=False, create_missing=False),
        Context(log),
    )
    assert model.devices[101].attributes["*Описание краткое"] == "записано по GID"
    assert stats.updated == 1 and stats.devices_by_gid == 1


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
