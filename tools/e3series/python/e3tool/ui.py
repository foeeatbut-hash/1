"""Оконный интерфейс на tkinter.

tkinter выбран сознательно: он входит в состав Python, поэтому portable-сборка не
тянет за собой ни Qt, ни установку чего-либо на рабочем компьютере. Вся логика
живёт в модулях export/importer/e3api, а этот файл только рисует окно и передаёт
задания рабочему потоку — поэтому интерфейс можно заменить на Qt, ничего больше
не переписывая.
"""

from __future__ import annotations

import datetime as _dt
import os
import queue
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from . import e3api
from . import worker as wk
from .export import ExportOptions
from .importer import ImportOptions

BG = "#f4f6f9"
CARD_BG = "#ffffff"
ACCENT = "#4f81bd"
TEXT = "#1f2933"
MUTED = "#6b7785"
OK_COLOR = "#1d7a46"
WARN_COLOR = "#b3261e"

LOG_BG = "#1e2430"
LOG_FG = "#d7dee9"
LOG_WARN = "#ff8a80"
LOG_DETAIL = "#8fa3bf"


def desktop_path() -> str:
    candidate = os.path.join(os.path.expanduser("~"), "Desktop")
    if os.path.isdir(candidate):
        return candidate
    candidate = os.path.join(os.path.expanduser("~"), "Рабочий стол")
    if os.path.isdir(candidate):
        return candidate
    return os.path.expanduser("~")


def default_export_name() -> str:
    stamp = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    return os.path.join(desktop_path(), f"E3_Export_{stamp}.xlsx")


class App(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("E3.series ↔ Excel")
        self.geometry("1000x860")
        self.minsize(860, 700)
        self.configure(bg=BG)

        self.worker = wk.Worker()
        self.worker.start()

        self.busy = False
        self.connected = False
        self.instances: list = []

        self._build_styles()
        self._build_widgets()
        self.after(80, self._poll)
        self.protocol("WM_DELETE_WINDOW", self._on_close)
        self.refresh_instances()

    # --- оформление -----------------------------------------------------------
    def _build_styles(self) -> None:
        style = ttk.Style(self)
        try:
            style.theme_use("clam")
        except tk.TclError:  # pragma: no cover - зависит от системы
            pass
        style.configure(".", background=BG, foreground=TEXT, font=("Segoe UI", 10))
        style.configure("Card.TLabelframe", background=CARD_BG, borderwidth=1, relief="solid")
        style.configure(
            "Card.TLabelframe.Label",
            background=CARD_BG,
            foreground=ACCENT,
            font=("Segoe UI Semibold", 10),
        )
        style.configure("Card.TFrame", background=CARD_BG)
        style.configure("Card.TLabel", background=CARD_BG)
        style.configure("Muted.TLabel", background=CARD_BG, foreground=MUTED)
        style.configure("Ok.TLabel", background=CARD_BG, foreground=OK_COLOR)
        style.configure("Warn.TLabel", background=CARD_BG, foreground=WARN_COLOR)
        style.configure("Card.TCheckbutton", background=CARD_BG)
        style.configure("Accent.TButton", font=("Segoe UI Semibold", 10))
        style.configure("TNotebook", background=BG)

    def _card(self, parent: tk.Widget, title: str) -> ttk.Labelframe:
        frame = ttk.Labelframe(parent, text=title, style="Card.TLabelframe", padding=12)
        frame.pack(fill="x", padx=14, pady=(0, 10))
        return frame

    # --- разметка -------------------------------------------------------------
    def _build_widgets(self) -> None:
        header = tk.Frame(self, bg=ACCENT, height=52)
        header.pack(fill="x")
        tk.Label(
            header,
            text="E3.series ↔ Excel — выгрузка и загрузка изделий, координат и проводов",
            bg=ACCENT,
            fg="white",
            font=("Segoe UI Semibold", 12),
        ).pack(side="left", padx=16, pady=13)

        body = tk.Frame(self, bg=BG)
        body.pack(fill="both", expand=True, pady=(12, 0))

        self._build_connect(body)
        self._build_views(body)
        self._build_file(body)
        self._build_actions(body)
        self._build_progress(body)
        self._build_log(body)

    def _build_connect(self, parent: tk.Widget) -> None:
        card = self._card(parent, "1. Подключение к E3.series")
        row = ttk.Frame(card, style="Card.TFrame")
        row.pack(fill="x")

        ttk.Label(row, text="Экземпляр:", style="Card.TLabel").pack(side="left")
        self.instance_var = tk.StringVar()
        self.instance_box = ttk.Combobox(
            row, textvariable=self.instance_var, state="readonly", width=34
        )
        self.instance_box.pack(side="left", padx=(8, 8))
        ttk.Button(row, text="Найти", width=9, command=self.refresh_instances).pack(side="left")
        self.btn_connect = ttk.Button(
            row, text="Подключиться", style="Accent.TButton", command=self.do_connect
        )
        self.btn_connect.pack(side="left", padx=8)

        self.status_label = ttk.Label(row, text="нет связи", style="Warn.TLabel")
        self.status_label.pack(side="left", padx=(12, 0))

        self.project_label = ttk.Label(card, text="", style="Muted.TLabel")
        self.project_label.pack(fill="x", pady=(8, 0))

    def _build_views(self, parent: tk.Widget) -> None:
        card = self._card(parent, "2. Листы, с которыми работаем")
        row = ttk.Frame(card, style="Card.TFrame")
        row.pack(fill="x")

        self.view4 = tk.BooleanVar(value=True)
        self.view5 = tk.BooleanVar(value=False)
        self.all_sheets = tk.BooleanVar(value=False)
        for text, var in (
            (".PREFERRED_VIEW = 4", self.view4),
            (".PREFERRED_VIEW = 5", self.view5),
            ("все листы (без фильтра)", self.all_sheets),
        ):
            ttk.Checkbutton(
                row, text=text, variable=var, style="Card.TCheckbutton", command=self.do_refresh
            ).pack(side="left", padx=(0, 18))

        self.views_label = ttk.Label(card, text="", style="Muted.TLabel")
        self.views_label.pack(fill="x", pady=(8, 0))
        ttk.Label(
            card,
            text="Программа читает и пишет только листы выбранных видов. "
            "При импорте изделия попадают на «свои» листы по этому же признаку.",
            style="Muted.TLabel",
            wraplength=900,
            justify="left",
        ).pack(fill="x")

    def _build_file(self, parent: tk.Widget) -> None:
        card = self._card(parent, "3. Файл Excel")
        row = ttk.Frame(card, style="Card.TFrame")
        row.pack(fill="x")

        self.file_var = tk.StringVar()
        ttk.Entry(row, textvariable=self.file_var).pack(side="left", fill="x", expand=True)
        ttk.Button(row, text="Выбрать…", width=12, command=self.pick_file).pack(side="left", padx=(8, 0))
        ttk.Button(row, text="Шаблон", width=10, command=self.make_template).pack(side="left", padx=(8, 0))
        ttk.Label(
            card,
            text="Microsoft Excel не требуется: файлы читаются и пишутся напрямую.",
            style="Muted.TLabel",
        ).pack(fill="x", pady=(8, 0))

    def _build_actions(self, parent: tk.Widget) -> None:
        wrapper = tk.Frame(parent, bg=BG)
        wrapper.pack(fill="x")

        export_card = ttk.Labelframe(
            wrapper, text="4. Выгрузка из E3 в Excel", style="Card.TLabelframe", padding=12
        )
        export_card.pack(side="left", fill="both", expand=True, padx=(14, 7), pady=(0, 10))

        self.exp_placements = tk.BooleanVar(value=True)
        self.exp_connections = tk.BooleanVar(value=True)
        self.exp_only_placed = tk.BooleanVar(value=False)
        self.exp_loose = tk.BooleanVar(value=True)
        for text, var in (
            ("лист «Размещения» (посимвольно)", self.exp_placements),
            ("лист «Соединения» (провода)", self.exp_connections),
            ("только размещённые изделия", self.exp_only_placed),
            ("опознавать символы по надписям", self.exp_loose),
        ):
            ttk.Checkbutton(export_card, text=text, variable=var, style="Card.TCheckbutton").pack(
                anchor="w"
            )
        self.btn_export = ttk.Button(
            export_card,
            text="Выгрузить в Excel",
            style="Accent.TButton",
            state="disabled",
            command=self.do_export,
        )
        self.btn_export.pack(anchor="w", pady=(10, 0))

        import_card = ttk.Labelframe(
            wrapper, text="5. Загрузка из Excel в E3", style="Card.TLabelframe", padding=12
        )
        import_card.pack(side="left", fill="both", expand=True, padx=(7, 14), pady=(0, 10))

        self.imp_attrs = tk.BooleanVar(value=True)
        self.imp_create = tk.BooleanVar(value=True)
        self.imp_place = tk.BooleanVar(value=True)
        self.imp_conn = tk.BooleanVar(value=False)
        self.imp_save = tk.BooleanVar(value=False)
        self.imp_dry = tk.BooleanVar(value=False)
        for text, var in (
            ("записывать атрибуты", self.imp_attrs),
            ("создавать отсутствующие изделия", self.imp_create),
            ("размещать и перемещать символы", self.imp_place),
            ("создавать соединения (провода)", self.imp_conn),
            ("сохранить проект после импорта", self.imp_save),
            ("только проверка, ничего не менять", self.imp_dry),
        ):
            ttk.Checkbutton(import_card, text=text, variable=var, style="Card.TCheckbutton").pack(
                anchor="w"
            )
        self.btn_import = ttk.Button(
            import_card,
            text="Загрузить в E3",
            style="Accent.TButton",
            state="disabled",
            command=self.do_import,
        )
        self.btn_import.pack(anchor="w", pady=(10, 0))

    def _build_progress(self, parent: tk.Widget) -> None:
        card = self._card(parent, "6. Ход работы")
        self.progress = ttk.Progressbar(card, maximum=100)
        self.progress.pack(fill="x")
        row = ttk.Frame(card, style="Card.TFrame")
        row.pack(fill="x", pady=(8, 0))
        self.progress_label = ttk.Label(row, text="готов к работе", style="Muted.TLabel")
        self.progress_label.pack(side="left")
        self.btn_stop = ttk.Button(row, text="Стоп", width=10, state="disabled", command=self.do_stop)
        self.btn_stop.pack(side="right")

    def _build_log(self, parent: tk.Widget) -> None:
        card = self._card(parent, "7. Журнал")
        self.log_text = tk.Text(
            card,
            height=14,
            bg=LOG_BG,
            fg=LOG_FG,
            insertbackground=LOG_FG,
            relief="flat",
            font=("Consolas", 9),
            wrap="word",
        )
        self.log_text.pack(fill="both", expand=True, side="top")
        self.log_text.tag_configure("warn", foreground=LOG_WARN)
        self.log_text.tag_configure("detail", foreground=LOG_DETAIL)
        self.log_text.configure(state="disabled")

        row = ttk.Frame(card, style="Card.TFrame")
        row.pack(fill="x", pady=(8, 0))
        self.verbose_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(
            row,
            text="подробный журнал",
            variable=self.verbose_var,
            style="Card.TCheckbutton",
            command=self._apply_verbose,
        ).pack(side="left")
        ttk.Button(row, text="Сохранить журнал", command=self.save_log).pack(side="right")
        ttk.Button(row, text="Очистить", command=self.clear_log).pack(side="right", padx=(0, 8))

    # --- состояние ------------------------------------------------------------
    def selected_views(self) -> set[str]:
        if self.all_sheets.get():
            return set()
        views = set()
        if self.view4.get():
            views.add("4")
        if self.view5.get():
            views.add("5")
        return views

    def _apply_verbose(self) -> None:
        self.worker.verbose = self.verbose_var.get()

    def _set_busy(self, busy: bool) -> None:
        self.busy = busy
        state = "disabled" if busy else "normal"
        self.btn_connect.configure(state=state)
        self.btn_stop.configure(state="normal" if busy else "disabled")
        if self.connected:
            self.btn_export.configure(state=state)
            self.btn_import.configure(state=state)
        if not busy:
            self.progress.configure(value=0)
            self.progress_label.configure(text="готов к работе")

    # --- действия -------------------------------------------------------------
    def refresh_instances(self) -> None:
        try:
            self.instances = e3api.list_instances()
        except Exception as error:
            self.instances = []
            self._append_log(f"Список экземпляров E3 получить не удалось: {error}", "warn")
        labels = [item.label() for item in self.instances]
        if not labels:
            labels = ["первый доступный"]
        self.instance_box.configure(values=labels)
        self.instance_var.set(labels[0])

    def do_connect(self) -> None:
        pid = 0
        index = self.instance_box.current()
        if 0 <= index < len(self.instances):
            pid = self.instances[index].pid
        self.worker.submit(wk.ConnectJob(pid=pid, views=self.selected_views()))

    def do_refresh(self) -> None:
        if self.connected and not self.busy:
            self.worker.submit(wk.RefreshJob(views=self.selected_views()))

    def pick_file(self) -> None:
        path = filedialog.askopenfilename(
            title="Файл Excel",
            initialdir=desktop_path(),
            filetypes=[("Книга Excel", "*.xlsx"), ("Все файлы", "*.*")],
        )
        if path:
            self.file_var.set(path)

    def make_template(self) -> None:
        path = filedialog.asksaveasfilename(
            title="Куда сохранить шаблон",
            initialdir=desktop_path(),
            initialfile="template.xlsx",
            defaultextension=".xlsx",
            filetypes=[("Книга Excel", "*.xlsx")],
        )
        if path:
            self.worker.submit(wk.TemplateJob(path=path))
            self.file_var.set(path)

    def do_export(self) -> None:
        path = filedialog.asksaveasfilename(
            title="Куда сохранить выгрузку",
            initialdir=desktop_path(),
            initialfile=os.path.basename(default_export_name()),
            defaultextension=".xlsx",
            filetypes=[("Книга Excel", "*.xlsx")],
        )
        if not path:
            return
        options = ExportOptions(
            views=self.selected_views(),
            with_placements=self.exp_placements.get(),
            with_connections=self.exp_connections.get(),
            only_placed=self.exp_only_placed.get(),
            loose_text_match=self.exp_loose.get(),
        )
        self.worker.submit(wk.ExportJob(path=path, options=options))

    def do_import(self) -> None:
        path = self.file_var.get().strip()
        if not path:
            messagebox.showwarning("Импорт", "Выберите файл Excel.")
            return
        if not os.path.isfile(path):
            messagebox.showwarning("Импорт", f"Файл не найден:\n{path}")
            return
        options = ImportOptions(
            views=self.selected_views(),
            write_attributes=self.imp_attrs.get(),
            create_missing=self.imp_create.get(),
            place_symbols=self.imp_place.get(),
            create_connections=self.imp_conn.get(),
            save_project=self.imp_save.get(),
            dry_run=self.imp_dry.get(),
        )
        self.worker.submit(wk.ImportJob(path=path, options=options))

    def do_stop(self) -> None:
        self.worker.request_stop()
        self.progress_label.configure(text="останавливаюсь…")

    def save_log(self) -> None:
        path = self.worker.log.save(desktop_path())
        messagebox.showinfo("Журнал", f"Журнал сохранён:\n{path}")

    def clear_log(self) -> None:
        self.worker.log.clear()
        self.log_text.configure(state="normal")
        self.log_text.delete("1.0", "end")
        self.log_text.configure(state="disabled")

    # --- события рабочего потока ----------------------------------------------
    def _append_log(self, line: str, level: str) -> None:
        self.log_text.configure(state="normal")
        tag = level if level in ("warn", "detail") else ""
        self.log_text.insert("end", line + "\n", tag)
        self.log_text.see("end")
        self.log_text.configure(state="disabled")

    def _poll(self) -> None:
        try:
            while True:
                event = self.worker.events.get_nowait()
                self._handle(event)
        except queue.Empty:
            pass
        self.after(80, self._poll)

    def _handle(self, event: wk.Event) -> None:
        if event.kind == wk.EVENT_LOG:
            line, level = event.payload
            self._append_log(line, level)
        elif event.kind == wk.EVENT_PROGRESS:
            current, total, text = event.payload
            self.progress.configure(maximum=max(total, 1), value=current)
            self.progress_label.configure(text=f"{text} — {current} из {total}")
        elif event.kind == wk.EVENT_BUSY:
            self._set_busy(bool(event.payload))
        elif event.kind == wk.EVENT_STATE:
            self._apply_state(event.payload)
        elif event.kind == wk.EVENT_DONE:
            self._apply_done(*event.payload)

    def _apply_state(self, state: dict) -> None:
        if state.get("connected"):
            self.connected = True
            self.status_label.configure(text="подключено", style="Ok.TLabel")
            self.btn_export.configure(state="normal")
            self.btn_import.configure(state="normal")
            parts = []
            if state.get("project"):
                parts.append(f"проект: {state['project']}")
            if state.get("version"):
                parts.append(state["version"])
            parts.append(f"листов {state.get('sheets', 0)}")
            parts.append(f"объектов {state.get('devices', 0)}")
            self.project_label.configure(text="   •   ".join(parts))
        if "allowed" in state:
            views = self.selected_views()
            suffix = "все листы" if not views else "виды " + ", ".join(sorted(views))
            self.views_label.configure(text=f"листов для работы: {state['allowed']} ({suffix})")

    def _apply_done(self, name: str, result: dict) -> None:
        if not result.get("ok"):
            return
        if name == "export":
            messagebox.showinfo(
                "Выгрузка",
                "Выгрузка завершена."
                + ("\n\nПрервано пользователем." if result.get("stopped") else "")
                + f"\n\nИзделий: {result.get('devices', 0)}"
                + f"\nРазмещений: {result.get('placements', 0)}"
                + f"\nСоединений: {result.get('segments', 0)}"
                + f"\n\n{result.get('path', '')}",
            )
            self.file_var.set(result.get("path", ""))
        elif name == "import":
            title = "Проверка" if result.get("dry_run") else "Импорт"
            messagebox.showinfo(
                title,
                (
                    "Проверка завершена, проект не изменялся."
                    if result.get("dry_run")
                    else "Импорт завершён."
                )
                + f"\n\nСоздано: {result.get('created', 0)}"
                + f"\nОбновлено: {result.get('updated', 0)}"
                + f"\nРазмещено: {result.get('placed', 0)}"
                + f"\nПеремещено: {result.get('moved', 0)}"
                + f"\nСоединений: {result.get('connections', 0)}"
                + (
                    f"\nКоординаты не совпали: {result['bad']}"
                    if result.get("bad")
                    else ""
                )
                + (f"\nОшибок: {result['errors']}" if result.get("errors") else ""),
            )
        elif name == "template":
            messagebox.showinfo("Шаблон", f"Шаблон создан:\n{result.get('path', '')}")

    def _on_close(self) -> None:
        self.worker.shutdown()
        self.destroy()


def main() -> int:
    app = App()
    app.mainloop()
    return 0
