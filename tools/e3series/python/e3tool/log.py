"""Журнал работы: в интерфейс, в консоль и в файл одновременно."""

from __future__ import annotations

import datetime as _dt
import os
from typing import Callable

LEVEL_INFO = "info"
LEVEL_WARN = "warn"
LEVEL_DETAIL = "detail"

Sink = Callable[[str, str], None]


class Log:
    """Накопитель сообщений.

    sink вызывается для каждой записи (текст, уровень) — интерфейс подписывается
    на него, чтобы показывать строки по мере появления. Всё сказанное остаётся в
    self.lines, поэтому лог можно сохранить в файл в любой момент.
    """

    def __init__(self, sink: Sink | None = None, verbose: bool = False) -> None:
        self.sink = sink
        self.verbose = verbose
        self.lines: list[str] = []

    # --- запись ---------------------------------------------------------------
    def _write(self, message: str, level: str) -> None:
        stamp = _dt.datetime.now().strftime("%H:%M:%S")
        line = f"[{stamp}] {message}"
        self.lines.append(line)
        if self.sink is not None:
            self.sink(line, level)

    def info(self, message: str) -> None:
        self._write(message, LEVEL_INFO)

    def warn(self, message: str) -> None:
        self._write(message, LEVEL_WARN)

    def detail(self, message: str) -> None:
        """Подробность — попадает в лог только при включённом «подробном» режиме."""
        if self.verbose:
            self._write(message, LEVEL_DETAIL)

    def rule(self) -> None:
        self._write("=" * 52, LEVEL_INFO)

    def error(self, message: str, exc: BaseException | None = None) -> None:
        if exc is None:
            self.warn(message)
        else:
            self.warn(f"{message}: {type(exc).__name__} {exc}")

    # --- сохранение -----------------------------------------------------------
    def save(self, directory: str | None = None) -> str:
        """Пишет лог рядом с программой (или в указанную папку) и возвращает путь."""
        if directory is None:
            directory = os.getcwd()
        stamp = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
        path = os.path.join(directory, f"E3_Tool_log_{stamp}.txt")
        with open(path, "w", encoding="utf-8-sig") as handle:
            handle.write("\n".join(self.lines))
        return path

    def clear(self) -> None:
        self.lines.clear()
