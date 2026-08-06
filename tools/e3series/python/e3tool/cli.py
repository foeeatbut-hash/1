"""Консольный режим — для проверки без окна и для запуска по расписанию.

Примеры::

    python -m e3tool export --views 4 --out C:\\work\\out.xlsx
    python -m e3tool import --file C:\\work\\out.xlsx --place --connections --dry-run
    python -m e3tool instances
    python -m e3tool template --out C:\\work\\template.xlsx
"""

from __future__ import annotations

import argparse
import sys

from . import e3api, excel_io
from .export import ExportOptions, run_export
from .importer import ImportOptions, run_import
from .log import Log
from .project import Project
from .task import Context


def _views(value: str | None) -> set[str]:
    if value is None:
        return {"4", "5"}
    value = value.strip().lower()
    if value in ("", "all", "все"):
        return set()
    return {part.strip() for part in value.split(",") if part.strip()}


def _console_log(verbose: bool) -> Log:
    def sink(line: str, level: str) -> None:
        print(line, file=sys.stderr if level == "warn" else sys.stdout, flush=True)

    return Log(sink=sink, verbose=verbose)


def _progress(current: int, total: int, text: str) -> None:
    print(f"\r{text}: {current}/{total}   ", end="", file=sys.stderr, flush=True)


def _connect(log: Log, pid: int, views: set[str]) -> Project:
    e3api.set_diagnostics(log.info)
    for line in e3api.environment_report():
        log.info(line)
    e3api.co_initialize()
    app = e3api.connect(pid or None)
    version = app.full_version()
    if version:
        log.info(f"E3.series: {version}")
    if not app.check_out_parameters():
        log.warn(
            "E3 не возвращает out-параметры: перечисления будут пустыми. "
            "Нужен Python x64 и зарегистрированная библиотека типов E3."
        )
    project = Project(app, log)
    project.reload()
    project.apply_view_filter(views)
    return project


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="e3tool", description="E3.series <-> Excel")
    parser.add_argument("--pid", type=int, default=0, help="PID нужного экземпляра E3")
    parser.add_argument(
        "--views",
        default="4,5",
        help="значения .PREFERRED_VIEW через запятую (4 — ФСА, 5 — схема соединений), all — все листы",
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="подробный журнал")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("instances", help="показать запущенные экземпляры E3")

    p_export = sub.add_parser("export", help="выгрузить проект в Excel")
    p_export.add_argument("--out", required=True, help="путь к .xlsx")
    p_export.add_argument("--no-placements", action="store_true")
    p_export.add_argument("--no-connections", action="store_true")
    p_export.add_argument("--no-sheets", action="store_true", help="без листа «Листы»")
    p_export.add_argument(
        "--no-split", action="store_true", help="одна таблица «Размещения» вместо «Схемы» и «Подвала»"
    )
    p_export.add_argument(
        "--footer-y", type=float, default=0.0, help="граница подвала по Y, мм (0 — определить сам)"
    )
    p_export.add_argument("--only-placed", action="store_true")
    p_export.add_argument("--strict-match", action="store_true", help="без мягкого опознания по атрибутам")

    p_import = sub.add_parser("import", help="загрузить Excel в проект")
    p_import.add_argument("--file", required=True)
    p_import.add_argument("--no-attributes", action="store_true")
    p_import.add_argument("--no-create", action="store_true")
    p_import.add_argument("--place", action="store_true", help="размещать и перемещать символы")
    p_import.add_argument("--connections", action="store_true", help="создавать провода")
    p_import.add_argument("--no-formats", action="store_true", help="не менять формат листов")
    p_import.add_argument("--apply-views", action="store_true", help="менять .PREFERRED_VIEW листов")
    p_import.add_argument("--create-sheets", action="store_true", help="создавать отсутствующие листы")
    p_import.add_argument("--save", action="store_true", help="сохранить проект")
    p_import.add_argument("--dry-run", action="store_true", help="только проверка")

    p_template = sub.add_parser("template", help="создать пустой шаблон")
    p_template.add_argument("--out", required=True)

    args = parser.parse_args(argv)
    log = _console_log(args.verbose)

    if args.command == "instances":
        try:
            instances = e3api.list_instances()
        except e3api.E3Error as error:
            print(error, file=sys.stderr)
            return 2
        if not instances:
            print("Запущенных экземпляров E3.series не найдено.")
            return 1
        for item in instances:
            print(item.label())
        return 0

    if args.command == "template":
        path = excel_io.write_template(args.out)
        print(f"Шаблон создан: {path}")
        return 0

    views = _views(args.views)
    context = Context(log, _progress, lambda: False)

    try:
        project = _connect(log, args.pid, views)
    except e3api.E3Error as error:
        print(error, file=sys.stderr)
        return 2

    if args.command == "export":
        options = ExportOptions(
            views=views,
            with_placements=not args.no_placements,
            with_connections=not args.no_connections,
            with_sheets=not args.no_sheets,
            split_zones=not args.no_split,
            footer_y=args.footer_y,
            only_placed=args.only_placed,
            loose_text_match=not args.strict_match,
        )
        sheets, stats = run_export(project, options, context)
        path = excel_io.write_workbook(args.out, sheets)
        print(
            f"\nГотово: {path} (изделий {stats.devices}, размещений {stats.placements}: "
            f"схема {stats.schema_rows}, подвал {stats.footer_rows})"
        )
        return 0

    if args.command == "import":
        options = ImportOptions(
            views=views,
            write_attributes=not args.no_attributes,
            create_missing=not args.no_create,
            place_symbols=args.place,
            create_connections=args.connections,
            apply_sheet_formats=not args.no_formats,
            apply_sheet_views=args.apply_views,
            create_sheets=args.create_sheets,
            save_project=args.save,
            dry_run=args.dry_run,
        )
        tables = excel_io.read_tables(args.file)
        stats = run_import(project, tables, options, context)
        print(
            f"\nГотово: создано {stats.created}, обновлено {stats.updated}, "
            f"размещено {stats.placed}, перемещено {stats.moved}, "
            f"соединений {stats.connections_made}, листов затронуто "
            f"{stats.sheets_created + stats.sheets_reformatted}, ошибок {stats.errors}"
        )
        return 0

    return 0
