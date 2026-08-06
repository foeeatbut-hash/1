"""Рабочий поток, который единолично владеет соединением с E3.

COM требует, чтобы объекты использовались в том же потоке, где созданы. Поэтому
подключение, экспорт и импорт выполняет один выделенный поток: интерфейс только
складывает задания в очередь и читает события. Заодно исчезает главная беда
HTA-версии — там долгие циклы приходилось руками нарезать через setTimeout, чтобы
окно не подвисало.

Класс намеренно **не наследуется** от threading.Thread, а держит поток внутри.
Наследование однажды уже вышло боком: у Thread есть служебные `_stop` и (начиная
с Python 3.14) `_context`, и одноимённые атрибуты подкласса их перекрывают. Так
экспорт падал с «'_contextvars.Context' object is not callable». При композиции
столкнуться именами невозможно.
"""

from __future__ import annotations

import os
import queue
import threading
import time
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
    name: str = "подключение"


@dataclass
class RefreshJob:
    views: set[str] = field(default_factory=set)
    name: str = "обновление списка листов"


@dataclass
class ExportJob:
    path: str
    options: ExportOptions
    name: str = "выгрузка"


@dataclass
class ImportJob:
    path: str
    options: ImportOptions
    name: str = "загрузка"


@dataclass
class TemplateJob:
    path: str
    name: str = "создание шаблона"


class Worker:
    """Очередь заданий плюс поток, который их выполняет."""

    def __init__(self, verbose: bool = False, log_directory: str | None = None) -> None:
        self.events: queue.Queue[Event] = queue.Queue()
        self.jobs: queue.Queue[Any] = queue.Queue()
        self.stop_event = threading.Event()
        self.quit_event = threading.Event()
        self.log = Log(sink=self._sink, verbose=verbose)
        self.app: e3api.E3App | None = None
        self.project: Project | None = None
        self.thread = threading.Thread(target=self._loop, name="e3-worker", daemon=True)

        if log_directory:
            path = self.log.attach_file(log_directory)
            if path:
                self.log.info(f"Журнал пишется в файл: {path}")
        e3api.set_diagnostics(self.log.info)

    # --- управление -----------------------------------------------------------
    def start(self) -> None:
        self.thread.start()

    def submit(self, job: Any) -> None:
        self.jobs.put(job)

    def request_stop(self) -> None:
        self.stop_event.set()

    def shutdown(self) -> None:
        self.quit_event.set()
        self.log.close_file()

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

    def new_context(self) -> Context:
        """Контекст выполнения задачи: журнал, прогресс, проверка «Стоп»."""
        return Context(self.log, self._progress, self.stop_event.is_set)

    # --- главный цикл ---------------------------------------------------------
    def _loop(self) -> None:  # pragma: no cover - требует Windows и E3
        try:
            e3api.co_initialize()
        except e3api.E3Error as error:
            self.log.error("COM в рабочем потоке не запустился", error)
            return
        try:
            while not self.quit_event.is_set():
                try:
                    job = self.jobs.get(timeout=0.2)
                except queue.Empty:
                    continue
                self.stop_event.clear()
                self.events.put(Event(EVENT_BUSY, True))
                started = time.monotonic()
                self.log.rule(str(getattr(job, "name", "задание")))
                try:
                    self._dispatch(job)
                except Exception as error:
                    # Ошибка задания не должна убивать поток: разбираем её
                    # подробно и продолжаем принимать задания.
                    self.log.error(f"Сбой при выполнении «{job.name}»", error)
                    self._hint_for(error)
                    self.events.put(Event(EVENT_DONE, (job.name, {"ok": False, "error": str(error)})))
                finally:
                    spent = time.monotonic() - started
                    self.log.info(f"Задание «{job.name}» заняло {spent:.1f} с")
                    self.events.put(Event(EVENT_BUSY, False))
        finally:
            e3api.co_uninitialize()

    def _hint_for(self, error: BaseException) -> None:
        """Подсказка по частым причинам — чтобы не гадать по трассе."""
        text = f"{type(error).__name__}: {error}".lower()
        if "rpc" in text or "800706ba" in text:
            self.log.warn(
                "Похоже, E3.series закрылась или перестала отвечать. "
                "Откройте проект заново и нажмите «Подключиться»."
            )
        elif "not callable" in text or "attribute" in text:
            self.log.warn(
                "Похоже на ошибку в самой программе, а не в E3. "
                "Пришлите журнал целиком — по нему видно файл и строку."
            )
        elif "permission" in text or "используется другим" in text or "being used" in text:
            self.log.warn("Файл занят другой программой. Закройте его в Excel и повторите.")

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
        else:
            self.log.warn(f"Неизвестное задание: {job!r}")

    def _require_project(self) -> Project:
        if self.project is None:
            raise e3api.E3Error("Нет связи с E3.series — сначала нажмите «Подключиться».")
        return self.project

    # --- задания --------------------------------------------------------------
    def _do_connect(self, job: ConnectJob) -> None:
        for line in e3api.environment_report():
            self.log.info(line)

        self.log.info(
            "Подключение к E3.series"
            + (f" (PID {job.pid})" if job.pid else " (первый доступный экземпляр)")
        )
        self.app = e3api.connect(job.pid or None)
        version = self.app.full_version()
        if version:
            self.log.info(f"E3.series: {version}")

        if not self.app.check_out_parameters():
            self.log.warn(
                "E3 не возвращает out-параметры: соединение получилось нетипизированным."
            )
            self.log.warn(
                "Все перечисления будут пустыми. Проверьте разрядность Python (нужна x64) "
                "и запустите один раз от имени администратора, чтобы pywin32 собрал кэш типов."
            )
        else:
            self.log.detail("Проверка out-параметров пройдена: перечисления работают.")

        project_name = self.app.project_name()
        if project_name:
            self.log.info(f"Проект: {project_name}")
        else:
            self.log.warn("Имя проекта пустое — возможно, в E3 не открыт ни один проект.")

        self.project = Project(self.app, self.log)
        self.project.reload()
        allowed = self.project.apply_view_filter(job.views)
        if allowed == 0:
            self.log.warn(
                "Ни один лист не подошёл под выбранные виды. Проверьте атрибут "
                ".PREFERRED_VIEW у листов или включите «все листы»."
            )

        self.events.put(
            Event(
                EVENT_STATE,
                {
                    "connected": True,
                    "project": project_name,
                    "version": version,
                    "sheets": len(self.project.sheet_names),
                    "devices": len(self.project.devices),
                    "allowed": allowed,
                },
            )
        )
        self.events.put(Event(EVENT_DONE, (job.name, {"ok": True})))

    def _do_refresh(self, job: RefreshJob) -> None:
        project = self._require_project()
        project.reload()
        count = project.apply_view_filter(job.views)
        self.events.put(
            Event(
                EVENT_STATE,
                {
                    "connected": True,
                    "sheets": len(project.sheet_names),
                    "devices": len(project.devices),
                    "allowed": count,
                },
            )
        )
        self.events.put(Event(EVENT_DONE, (job.name, {"ok": True})))

    def _do_export(self, job: ExportJob) -> None:
        project = self._require_project()
        project.apply_view_filter(job.options.views)

        sheets, stats = run_export(project, job.options, self.new_context())

        self.log.info(f"Пишу книгу: {job.path}")
        for sheet in sheets:
            self.log.detail(f"  лист «{sheet.name}»: строк {len(sheet.rows)}, столбцов {len(sheet.headers)}")
        path = excel_io.write_workbook(job.path, sheets)
        size = os.path.getsize(path) / 1024
        self.log.info(f"Файл сохранён: {path} ({size:.0f} КБ)")

        if self.app is not None:
            self.log.info("Сигнатуры, которые приняла эта сборка E3:")
            for line in self.app.probe.report():
                self.log.info("  " + line)

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
        project = self._require_project()
        if not os.path.isfile(job.path):
            raise FileNotFoundError(f"Файл не найден: {job.path}")
        project.apply_view_filter(job.options.views)

        self.log.info(f"Читаю книгу: {job.path}")
        tables = excel_io.read_tables(job.path)
        if not tables:
            self.log.warn("В книге нет ни одного листа с данными.")
        for name, table in tables.items():
            self.log.info(f"  лист «{name}»: строк {len(table)}, столбцов {len(table.headers)}")

        stats = run_import(project, tables, job.options, self.new_context())

        if not job.options.dry_run:
            self.log.detail("Перечитываю проект после изменений.")
            project.reload()
            project.apply_view_filter(job.options.views)

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
