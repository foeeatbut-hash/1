"""Оконный интерфейс на tkinter.

tkinter выбран сознательно: он входит в состав Python, поэтому portable-сборка не
тянет за собой ни Qt, ни установку чего-либо на рабочем компьютере. Вся логика
живёт в модулях export/importer/e3api, а этот файл только рисует окно и передаёт
задания рабочему потоку — поэтому интерфейс можно заменить на Qt, ничего больше
не переписывая.

Как устроено окно
-----------------
Раньше настройки шли одной длинной колонкой, и журнал оказывался прижат к низу:
на ноутбучном экране в нём было видно две строки. Теперь окно разделено
подвижной перегородкой (``ttk.PanedWindow``): сверху — вкладки настроек, снизу —
журнал. Перегородку можно тащить, журнал раскрывается на весь экран одной
кнопкой, и любое расположение переживает изменение размера окна.

Сверху — меню и панель с главными действиями, снизу — строка состояния с
прогрессом. Всё, что делает программа, доступно и из меню, и с панели: искать
галочку по вкладкам, когда нужно просто нажать «Выгрузить», не приходится.
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
from .util import parse_num

# --- палитра -------------------------------------------------------------------
BG = "#eef1f6"
CARD_BG = "#ffffff"
ACCENT = "#2f5d9e"
ACCENT_DARK = "#24487a"
TEXT = "#1f2933"
MUTED = "#6b7785"
OK_COLOR = "#1d7a46"
WARN_COLOR = "#b3261e"
LINE = "#d3dae5"

LOG_BG = "#1e2430"
LOG_FG = "#d7dee9"
LOG_WARN = "#ff8a80"
LOG_DETAIL = "#8fa3bf"

FONT = "Segoe UI"
FONT_BOLD = "Segoe UI Semibold"


def desktop_path() -> str:
    candidate = os.path.join(os.path.expanduser("~"), "Desktop")
    if os.path.isdir(candidate):
        return candidate
    candidate = os.path.join(os.path.expanduser("~"), "Рабочий стол")
    if os.path.isdir(candidate):
        return candidate
    return os.path.expanduser("~")


def log_directory() -> str:
    """Папка logs рядом с программой; если писать некуда — рабочий стол."""
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    candidate = os.path.join(here, "logs")
    try:
        os.makedirs(candidate, exist_ok=True)
        return candidate
    except OSError:
        return desktop_path()


def default_export_name() -> str:
    stamp = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    return os.path.join(desktop_path(), f"E3_Export_{stamp}.xlsx")


class App(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("E3.series ↔ Excel")
        self.geometry("1120x820")
        self.minsize(900, 620)
        self.configure(bg=BG)

        self.worker = wk.Worker(verbose=True, log_directory=log_directory())
        self.worker.start()

        self.busy = False
        self.connected = False
        self.instances: list = []
        self._log_maximised = False
        self._saved_sash = 0

        self._build_variables()
        self._build_styles()
        self._build_menu()
        self._build_widgets()
        self.after(80, self._poll)
        self.protocol("WM_DELETE_WINDOW", self._on_close)
        self.refresh_instances()

    # --- состояние ------------------------------------------------------------
    def _build_variables(self) -> None:
        """Все переключатели окна в одном месте — так видно набор целиком."""
        self.instance_var = tk.StringVar()
        self.file_var = tk.StringVar()
        self.auto_release = tk.BooleanVar(value=True)
        self.verbose_var = tk.BooleanVar(value=True)

        self.view4 = tk.BooleanVar(value=True)
        self.view5 = tk.BooleanVar(value=True)
        self.all_sheets = tk.BooleanVar(value=False)

        self.exp_views = tk.BooleanVar(value=True)
        self.exp_placements = tk.BooleanVar(value=True)
        self.exp_split = tk.BooleanVar(value=True)
        self.exp_connections = tk.BooleanVar(value=True)
        self.exp_texts = tk.BooleanVar(value=True)
        self.exp_sheets = tk.BooleanVar(value=True)
        self.exp_signals = tk.BooleanVar(value=True)
        self.exp_only_placed = tk.BooleanVar(value=False)
        self.exp_loose = tk.BooleanVar(value=True)
        self.exp_footer_y = tk.StringVar(value="0")

        self.imp_attrs = tk.BooleanVar(value=True)
        self.imp_create = tk.BooleanVar(value=True)
        self.imp_place = tk.BooleanVar(value=True)
        self.imp_conn = tk.BooleanVar(value=False)
        self.imp_texts = tk.BooleanVar(value=True)
        self.imp_new_texts = tk.BooleanVar(value=False)
        self.imp_formats = tk.BooleanVar(value=True)
        self.imp_views = tk.BooleanVar(value=False)
        self.imp_new_sheets = tk.BooleanVar(value=False)
        self.imp_save = tk.BooleanVar(value=False)
        self.imp_dry = tk.BooleanVar(value=False)
        self.imp_clear_undo = tk.BooleanVar(value=False)

    # --- оформление -----------------------------------------------------------
    def _build_styles(self) -> None:
        style = ttk.Style(self)
        try:
            style.theme_use("clam")
        except tk.TclError:  # pragma: no cover - зависит от системы
            pass
        style.configure(".", background=BG, foreground=TEXT, font=(FONT, 10))
        style.configure("TFrame", background=BG)
        style.configure("TLabel", background=BG)
        style.configure("Card.TFrame", background=CARD_BG)
        style.configure("Card.TLabel", background=CARD_BG)
        style.configure("Card.TCheckbutton", background=CARD_BG)
        style.configure("Card.TRadiobutton", background=CARD_BG)
        style.configure(
            "Card.TLabelframe", background=CARD_BG, borderwidth=1, relief="solid", bordercolor=LINE
        )
        style.configure(
            "Card.TLabelframe.Label", background=CARD_BG, foreground=ACCENT, font=(FONT_BOLD, 10)
        )
        style.configure("Muted.TLabel", background=CARD_BG, foreground=MUTED)
        style.configure("Ok.TLabel", background=CARD_BG, foreground=OK_COLOR, font=(FONT_BOLD, 10))
        style.configure("Warn.TLabel", background=CARD_BG, foreground=WARN_COLOR, font=(FONT_BOLD, 10))
        style.configure("Head.TLabel", background=CARD_BG, foreground=TEXT, font=(FONT_BOLD, 11))

        style.configure("Accent.TButton", font=(FONT_BOLD, 10), padding=(14, 7))
        style.map(
            "Accent.TButton",
            background=[("!disabled", ACCENT), ("disabled", "#b9c4d4")],
            foreground=[("!disabled", "#ffffff"), ("disabled", "#eef1f6")],
        )
        style.configure("Tool.TButton", font=(FONT, 10), padding=(10, 6))
        style.configure("TNotebook", background=BG, borderwidth=0)
        style.configure("TNotebook.Tab", font=(FONT, 10), padding=(16, 8))
        style.map("TNotebook.Tab", background=[("selected", CARD_BG)])
        style.configure("Status.TFrame", background="#e2e7ef")
        style.configure("Status.TLabel", background="#e2e7ef", foreground=MUTED)

    # --- меню -----------------------------------------------------------------
    def _build_menu(self) -> None:
        menubar = tk.Menu(self)

        file_menu = tk.Menu(menubar, tearoff=0)
        file_menu.add_command(label="Выбрать книгу…\tCtrl+O", command=self.pick_file)
        file_menu.add_command(label="Создать шаблон…", command=self.make_template)
        file_menu.add_separator()
        file_menu.add_command(label="Открыть папку книги", command=self.open_file_folder)
        file_menu.add_separator()
        file_menu.add_command(label="Выход", command=self._on_close)
        menubar.add_cascade(label="Файл", menu=file_menu)

        e3_menu = tk.Menu(menubar, tearoff=0)
        e3_menu.add_command(label="Найти экземпляры", command=self.refresh_instances)
        e3_menu.add_command(label="Подключиться\tF5", command=self.do_connect)
        e3_menu.add_command(label="Перечитать проект", command=self.do_refresh)
        e3_menu.add_command(label="Отпустить E3", command=self.do_release)
        e3_menu.add_separator()
        e3_menu.add_checkbutton(
            label="Отпускать E3 после операции",
            variable=self.auto_release,
            command=self._apply_auto_release,
        )
        menubar.add_cascade(label="E3.series", menu=e3_menu)

        run_menu = tk.Menu(menubar, tearoff=0)
        run_menu.add_command(label="Выгрузить в Excel\tF9", command=self.do_export)
        run_menu.add_command(label="Загрузить в E3\tF10", command=self.do_import)
        run_menu.add_separator()
        run_menu.add_command(label="Проверить книгу (ничего не менять)", command=self.do_check)
        run_menu.add_separator()
        run_menu.add_command(label="Остановить\tEsc", command=self.do_stop)
        menubar.add_cascade(label="Действия", menu=run_menu)

        log_menu = tk.Menu(menubar, tearoff=0)
        log_menu.add_checkbutton(
            label="Подробный журнал", variable=self.verbose_var, command=self._apply_verbose
        )
        log_menu.add_separator()
        log_menu.add_command(label="Копировать весь журнал", command=self.copy_log)
        log_menu.add_command(label="Сохранить как TXT…", command=self.save_log_as)
        log_menu.add_command(label="Открыть папку журналов", command=self.open_log_folder)
        log_menu.add_command(label="Очистить", command=self.clear_log)
        log_menu.add_separator()
        log_menu.add_command(label="Развернуть журнал\tF11", command=self.toggle_log)
        menubar.add_cascade(label="Журнал", menu=log_menu)

        help_menu = tk.Menu(menubar, tearoff=0)
        help_menu.add_command(label="Что попадает в какую вкладку", command=self.show_layout_help)
        help_menu.add_command(label="Проверка окружения", command=self.show_environment)
        help_menu.add_command(label="О программе", command=self.show_about)
        menubar.add_cascade(label="Справка", menu=help_menu)

        self.configure(menu=menubar)
        self.bind("<F5>", lambda _event: self.do_connect())
        self.bind("<F9>", lambda _event: self.do_export())
        self.bind("<F10>", lambda _event: self.do_import())
        self.bind("<F11>", lambda _event: self.toggle_log())
        self.bind("<Escape>", lambda _event: self.do_stop())
        self.bind("<Control-o>", lambda _event: self.pick_file())

    # --- разметка -------------------------------------------------------------
    def _build_widgets(self) -> None:
        self._build_header()
        self._build_toolbar()
        # Строка состояния занимает место до перегородки: растягивающийся
        # PanedWindow, упакованный раньше, забрал бы всю высоту и вытеснил её
        # за край окна.
        self._build_status()

        self.split = ttk.PanedWindow(self, orient="vertical")
        self.split.pack(fill="both", expand=True, padx=12, pady=(8, 8))

        top = ttk.Frame(self.split)
        self.notebook = ttk.Notebook(top)
        self.notebook.pack(fill="both", expand=True)
        self._build_tab_connection()
        self._build_tab_export()
        self._build_tab_import()
        self.split.add(top, weight=3)

        bottom = ttk.Frame(self.split)
        self._build_log(bottom)
        self.split.add(bottom, weight=2)
        self.after(150, self._place_sash)

    def _place_sash(self) -> None:
        """Ставит перегородку так, чтобы журнал занимал заметную часть окна."""
        try:
            height = self.split.winfo_height()
            if height > 200 and not self._log_maximised:
                self.split.sashpos(0, int(height * 0.58))
        except tk.TclError:  # pragma: no cover - окно ещё не отрисовано
            pass

    def _build_header(self) -> None:
        header = tk.Frame(self, bg=ACCENT, height=56)
        header.pack(fill="x")
        header.pack_propagate(False)
        tk.Label(
            header,
            text="E3.series ↔ Excel",
            bg=ACCENT,
            fg="#ffffff",
            font=(FONT_BOLD, 15),
        ).pack(side="left", padx=(18, 12))
        tk.Label(
            header,
            text="выгрузка и загрузка изделий, координат, проводов и надписей",
            bg=ACCENT,
            fg="#c9d8ef",
            font=(FONT, 10),
        ).pack(side="left", pady=(6, 0))
        self.header_state = tk.Label(
            header, text="нет связи с E3", bg=ACCENT, fg="#ffd7d4", font=(FONT_BOLD, 10)
        )
        self.header_state.pack(side="right", padx=18)

    def _build_toolbar(self) -> None:
        bar = tk.Frame(self, bg=CARD_BG, highlightbackground=LINE, highlightthickness=1)
        bar.pack(fill="x", padx=12, pady=(10, 0))
        inner = ttk.Frame(bar, style="Card.TFrame", padding=(10, 8))
        inner.pack(fill="x")

        # «Стоп» пакуется первым, хотя стоит справа: pack раздаёт место в
        # порядке упаковки, и на узком окне обрезается тот, кто позже. Кнопка
        # остановки обрезаться не должна никогда.
        self.btn_stop = ttk.Button(
            inner, text="Стоп", style="Tool.TButton", state="disabled", command=self.do_stop
        )
        self.btn_stop.pack(side="right")

        self.btn_connect = ttk.Button(
            inner, text="Подключиться", style="Accent.TButton", command=self.do_connect
        )
        self.btn_connect.pack(side="left")
        ttk.Button(inner, text="Отпустить E3", style="Tool.TButton", command=self.do_release).pack(
            side="left", padx=(8, 0)
        )
        ttk.Separator(inner, orient="vertical").pack(side="left", fill="y", padx=12)

        self.btn_export = ttk.Button(
            inner,
            text="Выгрузить в Excel",
            style="Accent.TButton",
            state="disabled",
            command=self.do_export,
        )
        self.btn_export.pack(side="left")
        self.btn_import = ttk.Button(
            inner,
            text="Загрузить в E3",
            style="Accent.TButton",
            state="disabled",
            command=self.do_import,
        )
        self.btn_import.pack(side="left", padx=(8, 0))
        self.btn_check = ttk.Button(
            inner,
            text="Проверить книгу",
            style="Tool.TButton",
            state="disabled",
            command=self.do_check,
        )
        self.btn_check.pack(side="left", padx=(8, 0))

        ttk.Separator(inner, orient="vertical").pack(side="left", fill="y", padx=12)
        ttk.Button(inner, text="Шаблон…", style="Tool.TButton", command=self.make_template).pack(
            side="left"
        )

    # --- вкладка «Подключение и листы» ----------------------------------------
    def _build_tab_connection(self) -> None:
        page = self._page("Подключение и листы")

        card = self._card(page, "Экземпляр E3.series")
        row = ttk.Frame(card, style="Card.TFrame")
        row.pack(fill="x")
        ttk.Label(row, text="Экземпляр:", style="Card.TLabel").pack(side="left")
        self.instance_box = ttk.Combobox(
            row, textvariable=self.instance_var, state="readonly", width=32
        )
        self.instance_box.pack(side="left", padx=(8, 8))
        ttk.Button(row, text="Найти", width=9, command=self.refresh_instances).pack(side="left")
        self.status_label = ttk.Label(row, text="нет связи", style="Warn.TLabel")
        self.status_label.pack(side="left", padx=(14, 0))

        self.project_label = ttk.Label(card, text="", style="Muted.TLabel")
        self.project_label.pack(fill="x", pady=(10, 0))
        ttk.Checkbutton(
            card,
            text="отпускать E3 после операции — в программе сразу можно работать",
            variable=self.auto_release,
            style="Card.TCheckbutton",
            command=self._apply_auto_release,
        ).pack(anchor="w", pady=(8, 0))

        card = self._card(page, "Листы, с которыми работаем")
        row = ttk.Frame(card, style="Card.TFrame")
        row.pack(fill="x")
        for text, var in (
            (".PREFERRED_VIEW = 4 — функциональная схема (ФСА)", self.view4),
            (".PREFERRED_VIEW = 5 — схема соединений", self.view5),
            ("все листы, без фильтра", self.all_sheets),
        ):
            ttk.Checkbutton(
                row, text=text, variable=var, style="Card.TCheckbutton", command=self.do_refresh
            ).pack(side="left", padx=(0, 20))

        self.views_label = ttk.Label(card, text="", style="Muted.TLabel")
        self.views_label.pack(fill="x", pady=(10, 0))
        self._hint(
            card,
            "Вид листа пишется в каждую строку Excel, поэтому лист определяется однозначно даже "
            "там, где имена листов совпадают: у ФСА и схемы соединений одного узла имя одно.",
        )

        card = self._card(page, "Книга Excel")
        row = ttk.Frame(card, style="Card.TFrame")
        row.pack(fill="x")
        ttk.Entry(row, textvariable=self.file_var).pack(side="left", fill="x", expand=True)
        ttk.Button(row, text="Выбрать…", width=12, command=self.pick_file).pack(
            side="left", padx=(8, 0)
        )
        ttk.Button(row, text="Шаблон", width=10, command=self.make_template).pack(
            side="left", padx=(8, 0)
        )
        self._hint(card, "Microsoft Excel не требуется: файлы читаются и пишутся напрямую.")

    # --- вкладка «Выгрузка» ---------------------------------------------------
    def _build_tab_export(self) -> None:
        page = self._page("Выгрузка в Excel")

        card = self._card(page, "Какие вкладки собирать")
        columns = ttk.Frame(card, style="Card.TFrame")
        columns.pack(fill="x")
        left = ttk.Frame(columns, style="Card.TFrame")
        left.pack(side="left", fill="both", expand=True)
        right = ttk.Frame(columns, style="Card.TFrame")
        right.pack(side="left", fill="both", expand=True)

        for parent, items in (
            (
                left,
                (
                    ("«ФСА (вид 4)» и «Схема соединений (вид 5)»", self.exp_views),
                    ("размещения символов (координаты)", self.exp_placements),
                    ("делить их на «Схему» и «Подвал»", self.exp_split),
                    ("«Соединения» — провода", self.exp_connections),
                ),
            ),
            (
                right,
                (
                    ("«Надписи» — свободные тексты листов", self.exp_texts),
                    ("«Листы» — виды, рамки, габариты", self.exp_sheets),
                    ("«Сверка сигналов» — DI/DO/AI/AO", self.exp_signals),
                    ("только размещённые изделия", self.exp_only_placed),
                ),
            ),
        ):
            for text, var in items:
                ttk.Checkbutton(
                    parent, text=text, variable=var, style="Card.TCheckbutton"
                ).pack(anchor="w", pady=1)

        card = self._card(page, "Как делить лист на схему и подвал")
        self._hint(
            card,
            "Обычно ничего задавать не нужно: подвал опознаётся по имени символа в базе "
            "(«Подвал_…»). Там, где таких имён нет, программа ищет пустую полосу внизу листа. "
            "Значение ниже — ручная граница, она главнее обоих правил.",
        )
        row = ttk.Frame(card, style="Card.TFrame")
        row.pack(fill="x", pady=(8, 0))
        ttk.Label(row, text="граница подвала, Y мм:", style="Card.TLabel").pack(side="left")
        ttk.Entry(row, textvariable=self.exp_footer_y, width=8).pack(side="left", padx=(8, 8))
        ttk.Label(row, text="0 — определить самому", style="Muted.TLabel").pack(side="left")
        ttk.Checkbutton(
            card,
            text="опознавать символы по надписям, если изделие их не отдаёт",
            variable=self.exp_loose,
            style="Card.TCheckbutton",
        ).pack(anchor="w", pady=(10, 0))

    # --- вкладка «Загрузка» ---------------------------------------------------
    def _build_tab_import(self) -> None:
        page = self._page("Загрузка в E3")

        card = self._card(page, "Что применять к проекту")
        columns = ttk.Frame(card, style="Card.TFrame")
        columns.pack(fill="x")
        left = ttk.Frame(columns, style="Card.TFrame")
        left.pack(side="left", fill="both", expand=True)
        right = ttk.Frame(columns, style="Card.TFrame")
        right.pack(side="left", fill="both", expand=True)

        for parent, items in (
            (
                left,
                (
                    ("записывать атрибуты изделий", self.imp_attrs),
                    ("создавать отсутствующие изделия", self.imp_create),
                    ("размещать и перемещать символы", self.imp_place),
                    ("переносить надписи (текст и координаты)", self.imp_texts),
                ),
            ),
            (
                right,
                (
                    ("применять формат листа из Excel", self.imp_formats),
                    ("создавать соединения (провода)", self.imp_conn),
                    ("создавать отсутствующие надписи", self.imp_new_texts),
                    ("создавать отсутствующие листы", self.imp_new_sheets),
                ),
            ),
        ):
            for text, var in items:
                ttk.Checkbutton(
                    parent, text=text, variable=var, style="Card.TCheckbutton"
                ).pack(anchor="w", pady=1)

        card = self._card(page, "Осторожные действия")
        for text, var, note in (
            (
                "менять вид листа (.PREFERRED_VIEW) из Excel",
                self.imp_views,
                "переопределяет назначение всего листа",
            ),
            ("сохранить проект после загрузки", self.imp_save, ""),
            (
                "только проверка, ничего не менять",
                self.imp_dry,
                "прогон вхолостую: видно, что и куда встало бы",
            ),
            (
                "очистить историю отмены E3 после загрузки",
                self.imp_clear_undo,
                "убирает тормоза, но отменить загрузку средствами E3 будет нельзя",
            ),
        ):
            line = ttk.Frame(card, style="Card.TFrame")
            line.pack(fill="x", anchor="w")
            ttk.Checkbutton(line, text=text, variable=var, style="Card.TCheckbutton").pack(
                side="left"
            )
            if note:
                ttk.Label(line, text=f"— {note}", style="Muted.TLabel").pack(side="left", padx=(6, 0))

        self._hint(
            card,
            "Вкладки «ФСА (вид 4)» и «Схема соединений (вид 5)» — отчёты, в проект они не "
            "применяются. Правьте изделия на листе «Изделия»: если правка окажется только на "
            "вкладке вида, программа скажет об этом в журнале и назовёт строки.",
        )

    # --- журнал ---------------------------------------------------------------
    def _build_log(self, parent: tk.Widget) -> None:
        wrapper = tk.Frame(parent, bg=CARD_BG, highlightbackground=LINE, highlightthickness=1)
        wrapper.pack(fill="both", expand=True)

        top = ttk.Frame(wrapper, style="Card.TFrame", padding=(10, 6))
        top.pack(fill="x")
        ttk.Label(top, text="Журнал", style="Head.TLabel").pack(side="left")
        self.copy_hint = ttk.Label(top, text="", style="Ok.TLabel")
        self.copy_hint.pack(side="left", padx=(14, 0))

        self.btn_log_size = ttk.Button(
            top, text="Развернуть  ⌃", style="Tool.TButton", command=self.toggle_log
        )
        self.btn_log_size.pack(side="right")
        for text, command in (
            ("Копировать", self.copy_log),
            ("Сохранить…", self.save_log_as),
            ("Очистить", self.clear_log),
        ):
            ttk.Button(top, text=text, style="Tool.TButton", command=command).pack(
                side="right", padx=(0, 8)
            )
        ttk.Checkbutton(
            top,
            text="подробно",
            variable=self.verbose_var,
            style="Card.TCheckbutton",
            command=self._apply_verbose,
        ).pack(side="right", padx=(0, 12))

        holder = ttk.Frame(wrapper, style="Card.TFrame")
        holder.pack(fill="both", expand=True, padx=1, pady=(0, 1))

        self.log_text = tk.Text(
            holder,
            # Небольшая запрошенная высота: на узком окне журнал должен уметь
            # ужаться, а не выталкивать строку состояния за край.
            height=5,
            bg=LOG_BG,
            fg=LOG_FG,
            insertbackground=LOG_FG,
            selectbackground="#3d5a80",
            selectforeground="#ffffff",
            relief="flat",
            font=("Consolas", 9),
            wrap="none",
            undo=False,
        )
        vertical = ttk.Scrollbar(holder, orient="vertical", command=self.log_text.yview)
        horizontal = ttk.Scrollbar(holder, orient="horizontal", command=self.log_text.xview)
        self.log_text.configure(yscrollcommand=vertical.set, xscrollcommand=horizontal.set)
        # Горизонтальная полоса нужна: длинные строки о листах и атрибутах
        # переносом превращались в кашу, по которой ничего не найти.
        horizontal.pack(side="bottom", fill="x")
        vertical.pack(side="right", fill="y")
        self.log_text.pack(side="left", fill="both", expand=True)

        self.log_text.tag_configure("warn", foreground=LOG_WARN)
        self.log_text.tag_configure("detail", foreground=LOG_DETAIL)

        # Поле остаётся редактируемым для tkinter — иначе не работают выделение
        # и Ctrl+C, — но правки блокируются: печатать в журнал незачем.
        self.log_text.bind("<Key>", self._log_key)
        self.log_text.bind("<Control-a>", self._select_all_log)
        self.log_text.bind("<Control-A>", self._select_all_log)
        self.log_text.bind("<Button-3>", self._log_menu)

        self.log_popup = tk.Menu(self, tearoff=0)
        self.log_popup.add_command(label="Копировать выделенное", command=self.copy_selection)
        self.log_popup.add_command(label="Копировать весь журнал", command=self.copy_log)
        self.log_popup.add_separator()
        self.log_popup.add_command(label="Выделить всё", command=lambda: self._select_all_log(None))
        self.log_popup.add_command(label="Сохранить как TXT…", command=self.save_log_as)

    def _build_status(self) -> None:
        bar = ttk.Frame(self, style="Status.TFrame", padding=(12, 6))
        bar.pack(fill="x", side="bottom")
        self.progress = ttk.Progressbar(bar, maximum=100, length=260)
        self.progress.pack(side="left")
        self.progress_label = ttk.Label(bar, text="готов к работе", style="Status.TLabel")
        self.progress_label.pack(side="left", padx=(12, 0))
        # В строке состояния только имя файла: полный путь на узком окне
        # наезжал на текст прогресса. Целиком он есть в «Справка → О программе».
        path = self.worker.log.file_path
        self.log_path_label = ttk.Label(
            bar,
            text=f"журнал: {os.path.basename(path)}" if path else "журнал не пишется",
            style="Status.TLabel",
        )
        self.log_path_label.pack(side="right")

    # --- мелкие помощники разметки --------------------------------------------
    def _page(self, title: str) -> ttk.Frame:
        """Вкладка настроек с прокруткой.

        Прокрутка здесь не украшение: окно можно ужать, а карточек на вкладке
        несколько, и без неё нижняя просто обрезалась бы краем перегородки —
        именно так пропадали кнопки «Выбрать…» и «Шаблон».
        """
        container = ttk.Frame(self.notebook)
        self.notebook.add(container, text=title)

        canvas = tk.Canvas(container, bg=BG, highlightthickness=0, borderwidth=0)
        bar = ttk.Scrollbar(container, orient="vertical", command=canvas.yview)
        canvas.configure(yscrollcommand=bar.set)
        canvas.pack(side="left", fill="both", expand=True)

        inner = ttk.Frame(canvas, padding=(14, 14))
        window = canvas.create_window((0, 0), window=inner, anchor="nw")

        def on_inner(_event: tk.Event) -> None:
            canvas.configure(scrollregion=canvas.bbox("all"))
            needed = inner.winfo_reqheight() > canvas.winfo_height()
            if needed and not bar.winfo_ismapped():
                bar.pack(side="right", fill="y")
            elif not needed and bar.winfo_ismapped():
                bar.pack_forget()

        def on_canvas(event: tk.Event) -> None:
            canvas.itemconfigure(window, width=event.width)
            on_inner(event)

        def on_wheel(event: tk.Event) -> None:
            if inner.winfo_reqheight() <= canvas.winfo_height():
                return
            step = -1 if getattr(event, "delta", 0) > 0 or event.num == 4 else 1
            canvas.yview_scroll(step, "units")

        inner.bind("<Configure>", on_inner)
        canvas.bind("<Configure>", on_canvas)
        # Колесо мыши работает, только пока указатель над вкладкой: иначе оно
        # отбирало бы прокрутку у журнала.
        canvas.bind("<Enter>", lambda _e: self._bind_wheel(on_wheel))
        canvas.bind("<Leave>", lambda _e: self._unbind_wheel())
        return inner

    def _bind_wheel(self, handler) -> None:
        for sequence in ("<MouseWheel>", "<Button-4>", "<Button-5>"):
            self.bind_all(sequence, handler)

    def _unbind_wheel(self) -> None:
        for sequence in ("<MouseWheel>", "<Button-4>", "<Button-5>"):
            self.unbind_all(sequence)

    def _card(self, parent: tk.Widget, title: str) -> ttk.Labelframe:
        frame = ttk.Labelframe(parent, text=title, style="Card.TLabelframe", padding=12)
        frame.pack(fill="x", pady=(0, 12))
        return frame

    def _hint(self, parent: tk.Widget, text: str) -> ttk.Label:
        label = ttk.Label(
            parent, text=text, style="Muted.TLabel", wraplength=940, justify="left"
        )
        label.pack(fill="x", pady=(8, 0))
        return label

    def toggle_log(self) -> None:
        """Разворачивает журнал на всё окно и обратно."""
        try:
            height = self.split.winfo_height()
            if not self._log_maximised:
                self._saved_sash = self.split.sashpos(0)
                self.split.sashpos(0, 60)
                self.btn_log_size.configure(text="Свернуть  ⌄")
            else:
                self.split.sashpos(0, self._saved_sash or int(height * 0.55))
                self.btn_log_size.configure(text="Развернуть  ⌃")
        except tk.TclError:  # pragma: no cover - до первой отрисовки
            return
        self._log_maximised = not self._log_maximised

    # --- работа с текстом журнала ---------------------------------------------
    def _log_key(self, event: tk.Event) -> str | None:
        """Пропускает перемещение и копирование, блокирует правку."""
        ctrl = bool(event.state & 0x0004)
        if ctrl and event.keysym.lower() in ("c", "a", "insert", "home", "end"):
            return None
        if event.keysym in (
            "Left", "Right", "Up", "Down", "Prior", "Next", "Home", "End", "Shift_L", "Shift_R",
            "Control_L", "Control_R",
        ):
            return None
        return "break"

    def _select_all_log(self, event: tk.Event | None) -> str:
        self.log_text.tag_add("sel", "1.0", "end-1c")
        self.log_text.focus_set()
        return "break"

    def _log_menu(self, event: tk.Event) -> None:
        try:
            self.log_popup.tk_popup(event.x_root, event.y_root)
        finally:
            self.log_popup.grab_release()

    def _flash(self, message: str) -> None:
        """Короткое подтверждение рядом с кнопками — без модального окна."""
        self.copy_hint.configure(text=message)
        self.after(2500, lambda: self.copy_hint.configure(text=""))

    def copy_log(self) -> None:
        text = "\n".join(self.worker.log.lines)
        self.clipboard_clear()
        self.clipboard_append(text)
        self.update()  # чтобы буфер пережил закрытие окна
        self._flash(f"скопировано строк: {len(self.worker.log.lines)}")

    def copy_selection(self) -> None:
        try:
            text = self.log_text.get("sel.first", "sel.last")
        except tk.TclError:
            self.copy_log()
            return
        self.clipboard_clear()
        self.clipboard_append(text)
        self.update()
        self._flash("выделенное скопировано")

    def save_log_as(self) -> None:
        path = filedialog.asksaveasfilename(
            title="Сохранить журнал",
            initialdir=desktop_path(),
            initialfile=f"E3_Tool_log_{_dt.datetime.now():%Y%m%d_%H%M%S}.txt",
            defaultextension=".txt",
            filetypes=[("Текстовый файл", "*.txt"), ("Все файлы", "*.*")],
        )
        if not path:
            return
        try:
            with open(path, "w", encoding="utf-8-sig") as handle:
                handle.write("\n".join(self.worker.log.lines))
        except OSError as error:
            messagebox.showerror("Журнал", f"Сохранить не удалось:\n{error}")
            return
        self._flash("журнал сохранён")

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
            for button in (self.btn_export, self.btn_import, self.btn_check):
                button.configure(state=state)
        if not busy:
            self.progress.configure(value=0)
            self.progress_label.configure(text="готов к работе")

    def export_options(self) -> ExportOptions:
        return ExportOptions(
            views=self.selected_views(),
            with_placements=self.exp_placements.get(),
            with_connections=self.exp_connections.get(),
            with_sheets=self.exp_sheets.get(),
            with_view_sheets=self.exp_views.get(),
            with_texts=self.exp_texts.get(),
            with_signals=self.exp_signals.get(),
            split_zones=self.exp_split.get(),
            footer_y=parse_num(self.exp_footer_y.get()) or 0.0,
            only_placed=self.exp_only_placed.get(),
            loose_text_match=self.exp_loose.get(),
        )

    def import_options(self, dry_run: bool) -> ImportOptions:
        return ImportOptions(
            views=self.selected_views(),
            write_attributes=self.imp_attrs.get(),
            create_missing=self.imp_create.get(),
            place_symbols=self.imp_place.get(),
            create_connections=self.imp_conn.get(),
            apply_sheet_formats=self.imp_formats.get(),
            apply_sheet_views=self.imp_views.get(),
            create_sheets=self.imp_new_sheets.get(),
            move_texts=self.imp_texts.get(),
            create_texts=self.imp_new_texts.get(),
            save_project=self.imp_save.get(),
            dry_run=dry_run,
        )

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
        if self.busy:
            return
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

    def open_file_folder(self) -> None:
        path = self.file_var.get().strip()
        folder = os.path.dirname(path) if path else desktop_path()
        self._open_folder(folder)

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
        if self.busy or not self.connected:
            return
        path = filedialog.asksaveasfilename(
            title="Куда сохранить выгрузку",
            initialdir=desktop_path(),
            initialfile=os.path.basename(default_export_name()),
            defaultextension=".xlsx",
            filetypes=[("Книга Excel", "*.xlsx")],
        )
        if not path:
            return
        self.worker.submit(wk.ExportJob(path=path, options=self.export_options()))

    def do_import(self) -> None:
        self._submit_import(dry_run=self.imp_dry.get())

    def do_check(self) -> None:
        """Прогон вхолостую: тот же импорт, но проект не меняется."""
        self._submit_import(dry_run=True)

    def _submit_import(self, dry_run: bool) -> None:
        if self.busy or not self.connected:
            return
        path = self.file_var.get().strip()
        if not path:
            messagebox.showwarning("Загрузка", "Сначала выберите книгу Excel.")
            return
        if not os.path.isfile(path):
            messagebox.showwarning("Загрузка", f"Файл не найден:\n{path}")
            return
        self.worker.submit(
            wk.ImportJob(
                path=path,
                options=self.import_options(dry_run),
                clear_undo=self.imp_clear_undo.get(),
            )
        )

    def _apply_auto_release(self) -> None:
        self.worker.auto_release = self.auto_release.get()

    def do_release(self) -> None:
        """Отпустить E3 прямо сейчас, не дожидаясь конца операции."""
        self.worker.submit(wk.ReleaseJob())

    def do_stop(self) -> None:
        if not self.busy:
            return
        self.worker.request_stop()
        self.progress_label.configure(text="останавливаюсь…")

    def _open_folder(self, folder: str) -> None:
        try:
            os.startfile(folder)  # type: ignore[attr-defined]
        except Exception:
            messagebox.showinfo("Папка", folder)

    def open_log_folder(self) -> None:
        """Открывает папку с журналами — чтобы файл можно было сразу отправить."""
        folder = os.path.dirname(self.worker.log.file_path or "") or log_directory()
        self._open_folder(folder)

    def clear_log(self) -> None:
        self.worker.log.clear()
        self.log_text.delete("1.0", "end")

    # --- справка --------------------------------------------------------------
    def show_layout_help(self) -> None:
        messagebox.showinfo(
            "Что попадает в какую вкладку",
            "Изделия — всё, что есть в проекте: по строке на объект.\n"
            "ФСА (вид 4) — изделия функциональной схемы с атрибутами.\n"
            "Схема соединений (вид 5) — то же для вида 5 плюс сверка с ФСА.\n"
            "Схема и Подвал — размещения символов по зонам чертежа.\n"
            "Соединения — ломаные проводов.\n"
            "Надписи — свободные тексты листов.\n"
            "Листы — виды, рамки и габариты листов.\n"
            "Сверка сигналов — DI/DO/AI/AO вида 4 против вида 5.\n\n"
            "Обратно в проект применяются «Изделия», «Схема», «Подвал», "
            "«Соединения», «Надписи» и «Листы». Вкладки видов и сверка — отчёты.",
        )

    def show_environment(self) -> None:
        messagebox.showinfo("Проверка окружения", "\n".join(e3api.environment_report()))

    def show_about(self) -> None:
        from . import __version__

        messagebox.showinfo(
            "О программе",
            f"E3.series ↔ Excel, версия {__version__}\n\n"
            "Выгрузка проекта в книгу Excel и загрузка правок обратно: изделия и их "
            "атрибуты, координаты символов, провода, надписи, виды и форматы листов.\n\n"
            f"Журнал: {self.worker.log.file_path or 'не пишется'}",
        )

    # --- события рабочего потока ----------------------------------------------
    def _append_log(self, line: str, level: str) -> None:
        tag = level if level in ("warn", "detail") else ""
        at_bottom = self.log_text.yview()[1] > 0.999
        self.log_text.insert("end", line + "\n", tag)
        # Не дёргаем прокрутку, если пользователь отлистал вверх и что-то читает.
        if at_bottom:
            self.log_text.see("end")

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
            self.header_state.configure(text="подключено", fg="#c9f2d8")
            for button in (self.btn_export, self.btn_import, self.btn_check):
                button.configure(state="normal")
            parts = []
            if state.get("project"):
                parts.append(f"проект: {state['project']}")
            if state.get("version"):
                parts.append(state["version"])
            parts.append(f"листов {state.get('sheets', 0)}")
            parts.append(f"объектов {state.get('devices', 0)}")
            self.project_label.configure(text="   •   ".join(parts))
        elif state.get("released"):
            self.connected = False
            self.status_label.configure(text="E3 отпущена", style="Muted.TLabel")
            self.header_state.configure(text="E3 отпущена", fg="#e6ecf7")
            # Кнопки остаются доступными: следующая операция подключится сама.
        if "allowed" in state:
            views = self.selected_views()
            suffix = "все листы" if not views else "виды " + ", ".join(sorted(views))
            self.views_label.configure(text=f"листов для работы: {state['allowed']} ({suffix})")

    def _apply_done(self, name: str, result: dict) -> None:
        if not result.get("ok"):
            path = self.worker.log.file_path
            messagebox.showerror(
                "Ошибка",
                f"Задание «{name}» не выполнено.\n\n{result.get('error', '')}\n\n"
                "Подробности — в журнале внизу окна"
                + (f" и в файле:\n{path}" if path else "."),
            )
            return
        # Имена заданий заданы в worker.py по-русски — сравниваем с ними же.
        if name == wk.ExportJob.name:
            messagebox.showinfo(
                "Выгрузка",
                "Выгрузка завершена."
                + ("\n\nПрервано пользователем." if result.get("stopped") else "")
                + f"\n\nИзделий: {result.get('devices', 0)}"
                + f"\nРазмещений: {result.get('placements', 0)}"
                + f"   (схема {result.get('schema', 0)}, подвал {result.get('footer', 0)})"
                + f"\nСоединений: {result.get('segments', 0)}"
                + f"\nЛистов описано: {result.get('sheets', 0)}"
                + f"\n\n{result.get('path', '')}",
            )
            self.file_var.set(result.get("path", ""))
        elif name == wk.ImportJob.name:
            title = "Проверка" if result.get("dry_run") else "Загрузка"
            messagebox.showinfo(
                title,
                (
                    "Проверка завершена, проект не изменялся."
                    if result.get("dry_run")
                    else "Загрузка завершена."
                )
                + f"\n\nСоздано: {result.get('created', 0)}"
                + f"\nОбновлено: {result.get('updated', 0)}"
                + f"\nРазмещено: {result.get('placed', 0)}"
                + f"\nПеремещено: {result.get('moved', 0)}"
                + f"\nСоединений: {result.get('connections', 0)}"
                + (f"\nНадписей: {result['texts']}" if result.get("texts") else "")
                + (f"\nЛистов затронуто: {result['sheets']}" if result.get("sheets") else "")
                + (
                    f"\nКоординаты не совпали: {result['bad']}"
                    if result.get("bad")
                    else ""
                )
                + (f"\nОшибок: {result['errors']}" if result.get("errors") else ""),
            )
        elif name == wk.TemplateJob.name:
            messagebox.showinfo("Шаблон", f"Шаблон создан:\n{result.get('path', '')}")

    def _on_close(self) -> None:
        self.worker.shutdown()
        self.destroy()


def main() -> int:
    app = App()
    app.mainloop()
    return 0
