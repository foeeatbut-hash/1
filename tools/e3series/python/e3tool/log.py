"""Журнал работы: в интерфейс, в консоль и в файл одновременно.

Главное требование к журналу — по нему должно быть понятно, что случилось, без
запуска отладчика. Поэтому ошибка печатается разобранной: тип, сообщение, файл и
строка, сам текст строки, а для ошибок COM ещё и код HRESULT с описанием от E3.
"""

from __future__ import annotations

import datetime as _dt
import linecache
import os
import traceback
from typing import Callable

LEVEL_INFO = "info"
LEVEL_WARN = "warn"
LEVEL_DETAIL = "detail"

Sink = Callable[[str, str], None]

#: Известные коды COM, которые встречаются при работе с E3.
HRESULT_HINTS: dict[int, str] = {
    0x80020003: "у объекта нет такого метода или свойства (Member not found)",
    0x80020005: "не тот тип аргумента (Type mismatch)",
    0x80020006: "неизвестное имя метода (Unknown name)",
    0x8002000E: "неверное число аргументов",
    0x80004002: "интерфейс не поддерживается (E_NOINTERFACE)",
    0x80004005: "E3 отклонила вызов без пояснения (E_FAIL)",
    0x800401E3: "объект не запущен или не зарегистрирован (MK_E_UNAVAILABLE)",
    0x800706BA: "связь с E3 потеряна — программа была закрыта (RPC server unavailable)",
    0x800706BE: "сбой удалённого вызова (RPC call failed)",
}


def describe_com_error(exc: BaseException) -> list[str]:
    """Разбирает ошибку pywin32 на понятные строки. Пустой список — не COM."""
    if type(exc).__name__ != "com_error":
        return []
    args = list(getattr(exc, "args", ()) or ())
    lines: list[str] = []
    if args:
        code = args[0]
        if isinstance(code, int):
            unsigned = code & 0xFFFFFFFF
            hint = HRESULT_HINTS.get(unsigned, "")
            lines.append(f"код COM: 0x{unsigned:08X}" + (f" — {hint}" if hint else ""))
    if len(args) > 1 and args[1]:
        lines.append(f"сообщение Windows: {args[1]}")
    if len(args) > 2 and isinstance(args[2], (tuple, list)) and args[2]:
        info = list(args[2])
        source = info[1] if len(info) > 1 else ""
        description = info[2] if len(info) > 2 else ""
        if description:
            lines.append(f"пояснение E3: {str(description).strip()}")
        if source:
            lines.append(f"источник: {source}")
    if len(args) > 3 and args[3] is not None:
        lines.append(f"номер плохого аргумента: {args[3]}")
    return lines


def format_exception(exc: BaseException, package: str = "e3tool") -> list[str]:
    """Раскладывает исключение на строки: где именно и что именно сломалось."""
    lines = [f"тип ошибки: {type(exc).__name__}: {exc}"]
    lines.extend(describe_com_error(exc))

    frames = traceback.extract_tb(exc.__traceback__)
    if frames:
        # Показываем кадры своего кода — чужие потроха читать бесполезно.
        own = [frame for frame in frames if package in frame.filename.replace("\\", "/")]
        interesting = own[-4:] if own else frames[-2:]
        lines.append("где:")
        for frame in interesting:
            where = f"  {os.path.basename(frame.filename)}, строка {frame.lineno}, в {frame.name}"
            lines.append(where)
            source = (frame.line or linecache.getline(frame.filename, frame.lineno)).strip()
            if source:
                lines.append(f"      {source}")

    cause = exc.__cause__ or exc.__context__
    if cause is not None and cause is not exc:
        lines.append(f"причина: {type(cause).__name__}: {cause}")
        lines.extend("  " + line for line in describe_com_error(cause))
    return lines


class Log:
    """Накопитель сообщений.

    sink вызывается для каждой записи (текст, уровень) — интерфейс подписывается
    на него, чтобы показывать строки по мере появления. Всё сказанное остаётся в
    self.lines и, если подключён файл, сразу пишется на диск: даже если программа
    упадёт, журнал будет чем прислать.
    """

    def __init__(self, sink: Sink | None = None, verbose: bool = False) -> None:
        self.sink = sink
        self.verbose = verbose
        self.lines: list[str] = []
        self.file_path: str | None = None
        self._handle = None

    # --- файл -----------------------------------------------------------------
    def attach_file(self, directory: str) -> str | None:
        """Начинает писать журнал на диск сразу, а не только по кнопке."""
        try:
            os.makedirs(directory, exist_ok=True)
            stamp = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
            path = os.path.join(directory, f"E3_Tool_log_{stamp}.txt")
            self._handle = open(path, "w", encoding="utf-8-sig", buffering=1)
            self.file_path = path
            return path
        except OSError:
            self._handle = None
            self.file_path = None
            return None

    def close_file(self) -> None:
        if self._handle is not None:
            try:
                self._handle.close()
            except OSError:
                pass
            self._handle = None

    # --- запись ---------------------------------------------------------------
    def _write(self, message: str, level: str) -> None:
        stamp = _dt.datetime.now().strftime("%H:%M:%S")
        marker = {LEVEL_WARN: "!", LEVEL_DETAIL: " ."}.get(level, " ")
        line = f"[{stamp}]{marker} {message}"
        self.lines.append(line)
        if self._handle is not None:
            try:
                self._handle.write(line + "\n")
            except OSError:
                self._handle = None
        if self.sink is not None:
            self.sink(line, level)

    def info(self, message: str) -> None:
        self._write(message, LEVEL_INFO)

    def warn(self, message: str) -> None:
        self._write(message, LEVEL_WARN)

    def detail(self, message: str) -> None:
        """Подробность — попадает в журнал только при включённом подробном режиме."""
        if self.verbose:
            self._write(message, LEVEL_DETAIL)

    def rule(self, title: str = "") -> None:
        if title:
            self._write(f"--- {title} " + "-" * max(4, 48 - len(title)), LEVEL_INFO)
        else:
            self._write("=" * 52, LEVEL_INFO)

    def error(self, message: str, exc: BaseException | None = None) -> None:
        """Ошибка с разбором: тип, код COM, файл и строка. Всегда видна."""
        self._write(message, LEVEL_WARN)
        if exc is None:
            return
        for line in format_exception(exc):
            self._write("    " + line, LEVEL_WARN)
        if self.file_path:
            self._write(f"    полный журнал: {self.file_path}", LEVEL_WARN)

    # --- сохранение -----------------------------------------------------------
    def save(self, directory: str | None = None) -> str:
        """Пишет копию журнала и возвращает путь."""
        if directory is None:
            directory = os.getcwd()
        stamp = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
        path = os.path.join(directory, f"E3_Tool_log_{stamp}.txt")
        with open(path, "w", encoding="utf-8-sig") as handle:
            handle.write("\n".join(self.lines))
        return path

    def clear(self) -> None:
        self.lines.clear()
