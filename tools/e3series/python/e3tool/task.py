"""Контекст выполнения задачи: журнал, прогресс, кнопка «Стоп».

Экспорт и импорт ничего не знают ни про интерфейс, ни про консоль — они получают
Context. В интерфейсе он отправляет события в очередь, в консоли пишет в stdout,
в тестах может быть пустышкой.
"""

from __future__ import annotations

from typing import Callable

from .log import Log

ProgressSink = Callable[[int, int, str], None]


class Context:
    def __init__(
        self,
        log: Log,
        progress: ProgressSink | None = None,
        stop_check: Callable[[], bool] | None = None,
    ) -> None:
        self.log = log
        self._progress = progress
        self._stop_check = stop_check

    def progress(self, current: int, total: int, text: str = "") -> None:
        if self._progress is not None:
            self._progress(current, max(total, 1), text)

    def stopped(self) -> bool:
        """True, если пользователь нажал «Стоп»."""
        return bool(self._stop_check and self._stop_check())
