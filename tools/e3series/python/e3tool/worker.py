"""Рабочий поток, который единолично владеет соединением с E3.

COM требует, чтобы объекты использовались в том же потоке, где созданы. Поэтому
подключение, экспорт и импорт выполняет один выделенный поток: интерфейс только
складывает задания в очередь и читает события. Заодно исчезает главная беда
HTA-версии — там долгие циклы приходилось руками нарезать через setTimeout, чтобы
окно не подвисало.
"""

from __future__ import annotations

import os
import queue
import threading
import traceback
from dataclasses import dataclass, field
from typing import Any

from . import e3api, excel_io
from .export import ExportOptions, run_export
from .importer import ImportOptions, run_import
from .log import Log
from .project import Project
from .task import Context

# --- события для интерфейса ----------------------------------------------------
EVENT_LOG = "log"
EVENT_PROGRESS = "progress"
EVENT_BUSY = "busy"
EVENT_DONE = "done"
EVENT_STATE = "state"


@dataclass
class Event:
    kind: str
    payload: Any = None


# --- задания -------------------------------------------------------------------
@dataclass
class ConnectJob:
    pid: int = 0
    views: set[str] = field(default_factory=set)
    name: str = "connect"


@dataclass
class RefreshJob:
    views: set[str] = field(default_factory=set)
    name: str = "refresh"


@dataclass
class ExportJob:
    path: str
    options: ExportOptions
    name: str = "export"


@dataclass
class ImportJob:
    path: str
    options: ImportOptions
    name: str = "import"


@dataclass
class TemplateJob:
    path: str
    name: str = "template"


class Worker(threading.Thread):
    def __init__(self, verbose: bool = False) -> None:
        super().__init__(daemon=True)
        self.events: queue.Queue[Event] = queue.Queue()
        self._jobs: queue.Queue[Any] = queue.Queue()
        self._stop = threading.Event()
        self._quit = threading.Event()
        self.log = Log(sink=self._sink, verbose=verbose)
        self.app: e3api.E3App | None = None
        self.project: Project | None = None

    # --- интерфейс снаружи ----------------------------------------------------
    def submit(self, job: Any) -> None:
        self._jobs.put(job)

    def request_stop(self) -> None:
        self._stop.set()

    def shutdown(self) -> None:
        self._quit.set()

    @property
    def verbose(self) -> bool:
        return self.log.verbose

    @verbose.setter
    def verbose(self, value: bool) -> None:
        self.log.verbose = value

    # --- события --------------------------------------------------------------
    def _sink(self, line: str, level: str) -> None:
        self.events.put(Event(EVENT_LOG, (line, level)))

    def _progress(self, current: int, total: int, text: str) -> None:
        self.events.put(Event(EVENT_PROGRESS, (current, total, text)))

    def _context(self) -> Context:
        return Context(self.log, self._progress, self._stop.is_set)

    # --- главный цикл ---------------------------------------------------------
    def run(self) -> None:  # pragma: no cover - требует Windows и E3
        try:
            e3api.co_initialize()
        except e3api.E3Error as error:
            self.log.warn(str(error))
            return
        try:
            while not self._quit.is_set():
                try:
                    job = self._jobs.get(timeout=0.2)
                except queue.Empty:
                    continue
                self._stop.clear()
                self.events.put(Event(EVENT_BUSY, True))
                try:
                    self._dispatch(job)
                except Exception as error:  # ошибка задания не должна убивать поток
                    self.log.warn(f"Сбой при выполнении «{job.name}»: {error}")
                    for line in traceback.format_exc().splitlines()[-4:]:
                        self.log.detail("    " + line)
                    self.events.put(Event(EVENT_DONE, (job.name, {"ok": False})))
                finally:
                    self.events.put(Event(EVENT_BUSY, False))
        finally:
            e3api.co_uninitialize()

    def _dispatch(self, job: Any) -> None:
        if isinstance(job, ConnectJob):
            self._do_connect(job)
        elif isinstance(job, RefreshJob):
            self._do_refresh(job)
        elif isinstance(job, ExportJob):
            self._do_export(job)
        elif isinstance(job, ImportJob):
            self._do_import(job)
        elif isinstance(job, TemplateJob):
            self._do_template(job)

    # --- задания --------------------------------------------------------------
    def _do_connect(self, job: ConnectJob) -> None:
        self.log.info("Подключение к E3.series...")
        self.app = e3api.connect(job.pid or None)
        version = self.app.full_version()
        if version:
            self.log.info(f"E3.series: {version}")
        if not self.app.check_out_parameters():
            self.log.warn(
                "Соединение получилось нетипизированным: E3 не возвращает out-параметры. "
                "Перечисления будут пустыми. Проверьте, что библиотека типов E3 "
                "зарегистрирована, и запустите Python той же разрядности (x64)."
            )
        project_name = self.app.project_name()
        if project_name:
            self.log.info(f"Проект: {project_name}")

        self.project = Project(self.app, self.log)
        self.project.reload()
        self.project.apply_view_filter(job.views)
        self.events.put(
            Event(
                EVENT_STATE,
                {
                    "connected": True,
                    "project": project_name,
                    "version": version,
                    "sheets": len(self.project.sheet_names),
                    "devices": len(self.project.devices),
                    "allowed": len(self.project.allowed_sheet_ids),
                },
            )
        )
        self.events.put(Event(EVENT_DONE, (job.name, {"ok": True})))

    def _do_refresh(self, job: RefreshJob) -> None:
        if self.project is None:
            self.log.warn("Сначала подключитесь к E3.series.")
            return
        self.project.reload()
        count = self.project.apply_view_filter(job.views)
        self.events.put(
            Event(
                EVENT_STATE,
                {
                    "connected": True,
                    "sheets": len(self.project.sheet_names),
                    "devices": len(self.project.devices),
                    "allowed": count,
                },
            )
        )
        self.events.put(Event(EVENT_DONE, (job.name, {"ok": True})))

    def _do_export(self, job: ExportJob) -> None:
        if self.project is None:
            self.log.warn("Сначала подключитесь к E3.series.")
            return
        self.project.apply_view_filter(job.options.views)
        sheets, stats = run_export(self.project, job.options, self._context())
        path = excel_io.write_workbook(job.path, sheets)
        self.log.info(f"Файл: {path}")
        for line in self.app.probe.report() if self.app else []:
            self.log.detail("  " + line)
        self.events.put(
            Event(
                EVENT_DONE,
                (
                    job.name,
                    {
                        "ok": True,
                        "path": path,
                        "devices": stats.devices,
                        "placements": stats.placements,
                        "segments": stats.segments,
                        "stopped": stats.stopped,
                    },
                ),
            )
        )

    def _do_import(self, job: ImportJob) -> None:
        if self.project is None:
            self.log.warn("Сначала подключитесь к E3.series.")
            return
        if not os.path.isfile(job.path):
            self.log.warn(f"Файл не найден: {job.path}")
            return
        self.project.apply_view_filter(job.options.views)
        self.log.info(f"Файл: {job.path}")
        tables = excel_io.read_tables(job.path)
        stats = run_import(self.project, tables, job.options, self._context())
        if not job.options.dry_run:
            self.project.reload()
            self.project.apply_view_filter(job.options.views)
        self.events.put(
            Event(
                EVENT_DONE,
                (
                    job.name,
                    {
                        "ok": True,
                        "created": stats.created,
                        "updated": stats.updated,
                        "placed": stats.placed,
                        "moved": stats.moved,
                        "connections": stats.connections_made,
                        "bad": stats.bad_coordinates,
                        "errors": stats.errors,
                        "dry_run": job.options.dry_run,
                    },
                ),
            )
        )

    def _do_template(self, job: TemplateJob) -> None:
        path = excel_io.write_template(job.path)
        self.log.info(f"Шаблон создан: {path}")
        self.events.put(Event(EVENT_DONE, (job.name, {"ok": True, "path": path})))
