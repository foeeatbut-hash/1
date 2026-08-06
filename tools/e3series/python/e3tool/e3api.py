"""Обёртка над COM-интерфейсом E3.series.

Соглашения о вызовах взяты не из догадок, а из официальной обёртки Zuken
(пакет ``e3series`` на PyPI, модуль ``e3series/com.py``). Оттуда следует три
вещи, которые в HTA-версии приходилось подбирать перебором:

1. Методы с out-параметрами вызываются с пустышками вместо них, а значения
   возвращаются в кортеже результата::

       ret, ids = job.GetSheetIds(0)

2. Массивы идентификаторов E3 отдаёт **1-based**: нулевой элемент служебный.
   Официальная обёртка режет его безусловно (``ids = ids[1:]``).

3. ``Connection.Create`` принимает массивы **тоже 1-based** — обёртка Zuken
   сама подставляет фиктивный нулевой элемент (``x = [0.] + x``). В HTA этот
   вариант пробовался третьим; здесь он используется сразу.

Чтобы out-параметры возвращались, соединение должно быть **типизированным**
(pywin32 берёт сигнатуры из библиотеки типов E3). Поэтому подключение идёт через
``Dispatch(..., resultCLSID="CT.Application")`` либо ``EnsureDispatch``, а после
подключения выполняется проверка: если out-параметры не приходят, программа
сообщает об этом внятно, а не выдаёт нули.
"""

from __future__ import annotations

import platform
import re
import struct
import sys
from dataclasses import dataclass, field
from typing import Any, Callable, Sequence

APPLICATION_CLASS = "CT.Application"
#: E3 регистрирует в Running Object Table по одному монику на процесс.
MONIKER_PATTERN = re.compile(r"!E3Application:(\d+)")


class E3Error(RuntimeError):
    """Ошибка работы с E3.series, пригодная для показа пользователю."""


# ------------------------------------------------------------------------------
#  Диагностика: неудачные вызовы COM видно в журнале, а не только по пустому
#  результату. Каждый метод сообщается один раз, чтобы не залить журнал.
# ------------------------------------------------------------------------------
_diagnostics: Callable[[str], None] | None = None
_reported: set[str] = set()


def set_diagnostics(callback: Callable[[str], None] | None) -> None:
    """Подключает приёмник сообщений о неудачных вызовах COM."""
    global _diagnostics
    _diagnostics = callback
    _reported.clear()


def _note(method: str, exc: BaseException | None = None, comment: str = "") -> None:
    if _diagnostics is None or method in _reported:
        return
    _reported.add(method)
    text = f"COM: {method} не отработал"
    if comment:
        text += f" ({comment})"
    if exc is not None:
        from .log import describe_com_error

        details = describe_com_error(exc)
        text += f": {type(exc).__name__}: {exc}"
        for line in details:
            text += f"; {line}"
    _diagnostics(text)


def environment_report() -> list[str]:
    """Сведения об окружении — первое, что нужно при разборе чужого журнала."""
    bits = struct.calcsize("P") * 8
    lines = [
        f"Python {sys.version.split()[0]} ({bits}-bit), {platform.system()} {platform.release()}"
    ]
    def installed(package: str) -> str:
        from importlib import metadata

        try:
            return metadata.version(package)
        except Exception:
            return ""

    pywin32 = installed("pywin32")
    lines.append(
        f"pywin32: {pywin32}" if pywin32 else "pywin32: НЕ установлен — работа с E3 невозможна"
    )
    openpyxl = installed("openpyxl")
    lines.append(
        f"openpyxl: {openpyxl}"
        if openpyxl
        else "openpyxl: НЕ установлен — файлы Excel читаться не будут"
    )
    wrapper = installed("e3series")
    lines.append(
        f"обёртка Zuken e3series: {wrapper}"
        if wrapper
        else "обёртка Zuken e3series: не установлена (не обязательна)"
    )
    if bits != 64:
        lines.append(
            "ВНИМАНИЕ: Python 32-битный, а E3.series 64-битная — возможны отказы вызовов."
        )
    return lines


# ------------------------------------------------------------------------------
#  Загрузка pywin32 отложена: модуль должен импортироваться и без Windows,
#  иначе тесты логики нельзя прогнать на любой машине.
# ------------------------------------------------------------------------------
def _win32() -> tuple[Any, Any]:
    try:
        import pythoncom  # type: ignore
        import win32com.client  # type: ignore
    except ImportError as exc:  # pragma: no cover - зависит от платформы
        raise E3Error(
            "Не найден пакет pywin32 — установите его: pip install pywin32"
        ) from exc
    return pythoncom, win32com.client


def co_initialize() -> None:
    """Инициализирует COM в текущем потоке. Обязательно для рабочего потока."""
    pythoncom, _ = _win32()
    pythoncom.CoInitialize()


def co_uninitialize() -> None:
    try:
        pythoncom, _ = _win32()
        pythoncom.CoUninitialize()
    except Exception:  # pragma: no cover - при выходе не важно
        pass


@dataclass
class Instance:
    """Запущенный экземпляр E3.series."""

    pid: int
    executable: str = ""
    version: str = ""

    def label(self) -> str:
        parts = [f"PID {self.pid}"]
        if self.version:
            parts.append(self.version)
        return " — ".join(parts)


def list_instances() -> list[Instance]:
    """Перечисляет запущенные E3 через Running Object Table.

    Так можно выбрать, к какому именно окну E3 подключаться, если открыто
    несколько — в HTA-версии этого не было, ``CreateObject`` брал произвольный.
    """
    pythoncom, _ = _win32()
    found: list[Instance] = []
    pythoncom.CoInitialize()
    context = pythoncom.CreateBindCtx()
    table = pythoncom.GetRunningObjectTable()
    for moniker in table.EnumRunning():
        try:
            name = moniker.GetDisplayName(context, None)
        except Exception:
            continue
        match = MONIKER_PATTERN.match(name or "")
        if match:
            found.append(Instance(pid=int(match.group(1))))
    return found


def _dispatch_from_rot(pid: int) -> Any:
    """Типизированный CT.Application выбранного процесса."""
    pythoncom, client = _win32()
    context = pythoncom.CreateBindCtx()
    table = pythoncom.GetRunningObjectTable()
    for moniker in table.EnumRunning():
        try:
            name = moniker.GetDisplayName(context, None)
        except Exception:
            continue
        match = MONIKER_PATTERN.match(name or "")
        if not match or int(match.group(1)) != pid:
            continue
        unknown = table.GetObject(moniker)
        query = unknown.QueryInterface(pythoncom.IID_IDispatch)
        return client.Dispatch(query, resultCLSID=APPLICATION_CLASS)
    raise E3Error(f"В таблице запущенных объектов нет E3 с PID {pid}.")


def _dispatch_default() -> Any:
    """Подключение к E3 без выбора процесса — как CreateObject в HTA."""
    _, client = _win32()
    try:
        return client.gencache.EnsureDispatch(APPLICATION_CLASS)
    except Exception:
        return client.Dispatch(APPLICATION_CLASS)


# ------------------------------------------------------------------------------
#  Разбор результатов COM-вызовов
# ------------------------------------------------------------------------------
def out_values(result: Any) -> tuple:
    """Приводит результат вызова к кортежу (возврат, out-параметры...)."""
    if isinstance(result, tuple):
        return result
    return (result,)


def ids_of(count: Any, array: Any) -> tuple[int, ...]:
    """Массив идентификаторов E3 -> кортеж положительных int.

    E3 возвращает 1-based массив: если элементов больше, чем сказано в count,
    нулевой отбрасывается. Для координат такой фокус не годится (ноль там
    осмысленное значение), поэтому у полилиний своя функция — см. polyline().
    """
    if array is None:
        return ()
    if not isinstance(array, (tuple, list)):
        return ()
    try:
        expected = int(count or 0)
    except (TypeError, ValueError):
        expected = 0
    items = list(array)
    if expected and len(items) > expected:
        items = items[1:]
    result = []
    for item in items:
        try:
            value = int(item)
        except (TypeError, ValueError):
            continue
        if value > 0:
            result.append(value)
    return tuple(result)


def _floats_of(count: int, array: Any) -> list[float]:
    """Массив координат -> список float с учётом 1-based возврата E3."""
    if not isinstance(array, (tuple, list)):
        return []
    items = list(array)
    if count and len(items) > count:
        items = items[1:]
    values: list[float] = []
    for item in items[:count] if count else items:
        try:
            values.append(float(item))
        except (TypeError, ValueError):
            values.append(0.0)
    return values


@dataclass
class Location:
    """Положение символа на листе."""

    sheet_id: int
    x: float
    y: float
    grid: str = ""

    @property
    def placed(self) -> bool:
        """True, если E3 подтвердил лист.

        Ноль возвращается и для неразмещённого символа, и для gate — поэтому
        отсутствие листа само по себе не признак ошибки.
        """
        return self.sheet_id > 0


@dataclass
class Polyline:
    """Ломаная провода: точки в порядке следования."""

    sheet_id: int
    points: list[tuple[float, float]]
    types: list[int] = field(default_factory=list)


@dataclass
class Probe:
    """Какие сигнатуры реально приняла эта сборка E3 — для журнала."""

    location: str = ""
    place: str = ""
    rotation: str = ""
    symbol_ids: str = ""
    connection: str = ""

    def report(self) -> list[str]:
        return [
            f"чтение координат символа .. {self.location or 'не определено'}",
            f"размещение (Place) ........ {self.place or 'не определено'}",
            f"поворот (чтение) .......... {self.rotation or 'нет'}",
            f"символы изделия ........... {self.symbol_ids or 'не определено'}",
            f"создание соединений ....... {self.connection or 'не проверялось'}",
        ]


# ------------------------------------------------------------------------------
#  Приложение и проект
# ------------------------------------------------------------------------------
class E3App:
    """Подключение к E3.series и фабрики объектов проекта."""

    def __init__(self, raw_app: Any, pid: int = 0) -> None:
        self.raw = raw_app
        self.pid = pid
        self.probe = Probe()
        self._dialogs_were: bool | None = None
        self.job = raw_app.CreateJobObject()
        if self.job is None:
            raise E3Error("E3 не отдал объект проекта (CreateJobObject).")

    # --- сведения о программе -------------------------------------------------
    def project_name(self) -> str:
        try:
            return str(self.job.GetName() or "")
        except Exception:
            return ""

    def full_version(self) -> str:
        version = ""
        build = ""
        try:
            version = str(self.raw.GetVersion() or "").strip()
        except Exception:
            pass
        try:
            build = str(self.raw.GetBuild() or "").strip()
        except Exception:
            pass
        if version and build and build not in version:
            return f"{version} ({build})"
        return version or build

    # --- фабрики --------------------------------------------------------------
    def sheet(self) -> Any:
        return self.job.CreateSheetObject()

    def device(self) -> Any:
        return self.job.CreateDeviceObject()

    def symbol(self) -> Any:
        return self.job.CreateSymbolObject()

    def text(self) -> Any:
        try:
            return self.job.CreateTextObject()
        except Exception:
            return None

    def net_segment(self) -> Any:
        try:
            return self.job.CreateNetSegmentObject()
        except Exception:
            return None

    def connection(self) -> Any:
        try:
            return self.job.CreateConnectionObject()
        except Exception:
            return None

    def save(self) -> bool:
        try:
            self.job.Save()
            return True
        except Exception:
            return False

    # --- пакетный режим -------------------------------------------------------
    def begin_batch(self, writing: bool) -> list[str]:
        """Готовит E3 к пакетной работе и возвращает строки для журнала.

        Модальные диалоги на время работы отключаются: если E3 покажет окно,
        пока мы шлём вызовы, обе программы встанут — она ждёт ответа, мы ждём её.
        """
        notes: list[str] = []
        self._dialogs_were = None
        try:
            self._dialogs_were = bool(self.raw.GetEnableInteractiveDialogs())
        except Exception:
            self._dialogs_were = None
        try:
            self.raw.SetEnableInteractiveDialogs(False)
            notes.append("диалоги E3 на время работы отключены")
        except Exception:
            pass
        try:
            self.raw.SuppressMessages(True, 0)
        except Exception:
            pass  # TLB 23.01, на более старых сборках метода нет
        if writing:
            try:
                # Явно говорим E3 не откатывать сделанное по завершении скрипта.
                self.job.UndoAfterExecution(False)
                notes.append("откат по завершении скрипта выключен")
            except Exception:
                pass
        return notes

    def end_batch(self, commit: bool) -> list[str]:
        """Закрывает транзакцию и возвращает E3 в обычное состояние.

        Пока FinalizeTransaction не вызвана, изменения скрипта остаются в
        открытой транзакции: проект занят, работать в E3 нельзя. Это и есть
        главная причина, по которой программа «залипает» после загрузки.
        """
        notes: list[str] = []
        if commit:
            try:
                result = self.job.FinalizeTransaction()
                notes.append(
                    "транзакция закрыта (FinalizeTransaction)"
                    if int(result or 0) == 0
                    else f"FinalizeTransaction вернула {result}"
                )
            except Exception as error:
                notes.append(f"FinalizeTransaction не выполнена: {error}")
        try:
            self.raw.SuppressMessages(False, 0)
        except Exception:
            pass
        try:
            self.raw.SetEnableInteractiveDialogs(
                True if self._dialogs_were is None else self._dialogs_were
            )
            notes.append("диалоги E3 возвращены")
        except Exception:
            notes.append("ВНИМАНИЕ: не удалось вернуть диалоги E3")
        try:
            # Пауза отдаёт управление E3, чтобы она разобрала свою очередь.
            self.raw.Sleep(0)
        except Exception:
            pass
        return notes

    def breathe(self, msec: int = 1) -> None:
        """Отдаёт E3 паузу посреди длинной работы, чтобы окно не выглядело мёртвым."""
        try:
            self.raw.Sleep(int(msec))
        except Exception:
            pass

    def remove_undo_information(self) -> bool:
        """Очищает историю отмены проекта — снимает тормоза после большой загрузки."""
        try:
            return int(self.job.RemoveUndoInformation() or 0) == 0
        except Exception:
            return False

    def release(self) -> None:
        """Отпускает объекты COM, чтобы E3 не считала себя занятой скриптом."""
        self.job = None
        self.raw = None

    # --- самопроверка ---------------------------------------------------------
    def check_out_parameters(self) -> bool:
        """Проверяет, что out-параметры действительно приходят из COM.

        Если соединение получилось нетипизированным, ``GetSheetIds`` вернёт одно
        число вместо кортежа — тогда любые перечисления будут пустыми, и об этом
        надо сказать сразу.
        """
        try:
            result = self.job.GetSheetIds(0)
        except Exception:
            return False
        return isinstance(result, tuple) and len(result) >= 2


def connect(pid: int | None = None) -> E3App:
    """Подключается к E3.series: к выбранному процессу или к любому запущенному."""
    if pid:
        raw = _dispatch_from_rot(pid)
        return E3App(raw, pid)

    instances = []
    try:
        instances = list_instances()
    except E3Error:
        raise
    except Exception:
        instances = []

    if len(instances) == 1:
        raw = _dispatch_from_rot(instances[0].pid)
        return E3App(raw, instances[0].pid)

    raw = _dispatch_default()
    if raw is None:
        raise E3Error("E3.series не отвечает. Программа запущена и проект открыт?")
    return E3App(raw, instances[0].pid if instances else 0)


# ------------------------------------------------------------------------------
#  Перечисления проекта
# ------------------------------------------------------------------------------
#: Методы Job, каждый из которых отдаёт свой класс объектов. GetAllDeviceIds не
#: включает клеммы, разъёмы, кабели и шины — их приходится собирать отдельно.
ID_SOURCES: tuple[tuple[str, str], ...] = (
    ("GetAllDeviceIds", "изделие"),
    ("GetTerminalIds", "клемма"),
    ("GetConnectorIds", "разъём"),
    ("GetBlockIds", "блок"),
    ("GetCableIds", "кабель"),
    ("GetBusbarIds", "шина"),
)


def job_ids(job: Any, method: str) -> tuple[int, ...] | None:
    """Вызывает перечисление Job. None — метод не поддержан этой сборкой."""
    call = getattr(job, method, None)
    if call is None:
        _note(f"Job.{method}", comment="метода нет в этой сборке")
        return None
    last: BaseException | None = None
    for args in ((0,), (0, 0)):
        try:
            result = out_values(call(*args))
        except Exception as error:
            last = error
            continue
        if len(result) >= 2:
            return ids_of(result[0], result[1])
        _note(f"Job.{method}", comment="out-параметр не вернулся, результат " + repr(result)[:60])
        return None
    _note(f"Job.{method}", last)
    return None


def sheet_symbol_ids(sheet: Any) -> tuple[int, ...]:
    try:
        result = out_values(sheet.GetSymbolIds(0))
    except Exception as error:
        _note("Sheet.GetSymbolIds", error)
        return ()
    if len(result) < 2:
        return ()
    return ids_of(result[0], result[1])


def sheet_net_segment_ids(sheet: Any) -> tuple[int, ...]:
    call = getattr(sheet, "GetNetSegmentIds", None)
    if call is None:
        _note("Sheet.GetNetSegmentIds", comment="метода нет — провода выгрузить нельзя")
        return ()
    try:
        result = out_values(call(0))
    except Exception as error:
        _note("Sheet.GetNetSegmentIds", error)
        return ()
    if len(result) < 2:
        return ()
    return ids_of(result[0], result[1])


def device_symbol_ids(device: Any, get_mode: int = 0, probe: Probe | None = None) -> tuple[int, ...]:
    """Символы изделия. get_mode 0 — все, как в официальной обёртке."""
    try:
        result = out_values(device.GetSymbolIds(0, get_mode))
    except Exception as error:
        try:
            result = out_values(device.GetSymbolIds(0))
        except Exception:
            _note("Device.GetSymbolIds", error)
            return ()
        if probe is not None and not probe.symbol_ids:
            probe.symbol_ids = "GetSymbolIds(ids)"
    else:
        if probe is not None and not probe.symbol_ids:
            probe.symbol_ids = f"GetSymbolIds(ids, {get_mode})"
    if len(result) < 2:
        return ()
    return ids_of(result[0], result[1])


def symbol_text_ids(symbol: Any) -> tuple[int, ...]:
    call = getattr(symbol, "GetTextIds", None)
    if call is None:
        return ()
    for args in ((0, 0, ""), (0, 0), (0,)):
        try:
            result = out_values(call(*args))
        except Exception:
            continue
        if len(result) >= 2:
            return ids_of(result[0], result[1])
    return ()


# ------------------------------------------------------------------------------
#  Символы: чтение и запись положения
# ------------------------------------------------------------------------------
def symbol_location(symbol: Any, probe: Probe | None = None) -> Location | None:
    """Положение символа.

    Официальная обёртка вызывает GetSchemaLocation с пятью пустышками
    (x, y, grid, column, row) и получает лист в возвращаемом значении. Более
    короткие варианты оставлены как запасные для старых сборок.
    """
    for count, label in ((5, "GetSchemaLocation(x,y,grid,col,row)"),
                         (3, "GetSchemaLocation(x,y,grid)"),
                         (2, "GetSchemaLocation(x,y)")):
        try:
            result = out_values(symbol.GetSchemaLocation(*([0] * count)))
        except Exception:
            continue
        if len(result) < 3:
            continue
        x_raw, y_raw = result[1], result[2]
        if x_raw is None or y_raw is None:
            continue
        try:
            x = float(x_raw)
            y = float(y_raw)
        except (TypeError, ValueError):
            continue
        try:
            sheet_id = int(result[0] or 0)
        except (TypeError, ValueError):
            sheet_id = 0
        grid = str(result[3]) if len(result) > 3 and result[3] is not None else ""
        if probe is not None and not probe.location:
            probe.location = label
        return Location(sheet_id=sheet_id, x=x, y=y, grid=grid)
    _note("Symbol.GetSchemaLocation", comment="ни один вариант вызова не дал координат")
    return None


def symbol_rotation(symbol: Any, probe: Probe | None = None) -> str:
    """Поворот символа строкой: «0», «90», «MX90». Зеркало закодировано здесь же."""
    call = getattr(symbol, "GetRotation", None)
    if call is None:
        return ""
    try:
        value = call()
    except Exception:
        return ""
    if probe is not None and not probe.rotation:
        probe.rotation = "GetRotation"
    return "" if value is None else str(value).strip()


def symbol_place(
    symbol: Any,
    sheet_id: int,
    x: float,
    y: float,
    rotation: str = "",
    probe: Probe | None = None,
) -> bool:
    """Ставит символ на лист или переносит уже поставленный.

    Отдельного метода записи координат в API нет: Place и создаёт, и перемещает.
    Именно на этом ломался старый экспорт — координаты читались из габарита
    GetArea, а он отдаёт локальную систему символа.
    """
    attempts: list[tuple[str, tuple]] = []
    rot = (rotation or "").strip()
    if rot:
        attempts.append((
            "Place(sheet,x,y,rot,scale,keeptext)",
            (sheet_id, float(x), float(y), rot, 0, False),
        ))
        attempts.append(("Place(sheet,x,y,rot)", (sheet_id, float(x), float(y), rot)))
    attempts.append((
        "Place(sheet,x,y,'',scale,keeptext)",
        (sheet_id, float(x), float(y), "", 0, False),
    ))
    attempts.append(("Place(sheet,x,y)", (sheet_id, float(x), float(y))))

    last: BaseException | None = None
    for label, args in attempts:
        try:
            symbol.Place(*args)
        except Exception as error:
            last = error
            continue
        if probe is not None:
            probe.place = label
        return True
    _note("Symbol.Place", last)
    return False


#: Допуск сравнения координат при обратном чтении, мм.
EPSILON = 0.05

PLACE_FAILED = 0
PLACE_UNVERIFIED = 1
PLACE_CONFIRMED = 2


def symbol_move(
    symbol: Any,
    sheet_id: int,
    x: float,
    y: float,
    rotation: str = "",
    probe: Probe | None = None,
) -> tuple[int, Location | None]:
    """Записывает положение и пытается его перечитать.

    Возвращает PLACE_CONFIRMED — записано и подтверждено, PLACE_UNVERIFIED —
    записано, но перечитать нельзя (gate), PLACE_FAILED — не удалось.
    """
    if not symbol_place(symbol, sheet_id, x, y, rotation, probe):
        return PLACE_FAILED, None
    location = symbol_location(symbol, probe)
    if location is None or not location.placed:
        # Ноль вместо листа — это gate, а не ошибка: 89 ложных тревог в
        # HTA-версии были именно отсюда.
        return PLACE_UNVERIFIED, location
    if abs(location.x - float(x)) < EPSILON and abs(location.y - float(y)) < EPSILON:
        return PLACE_CONFIRMED, location
    return PLACE_FAILED, location


# ------------------------------------------------------------------------------
#  Провода
# ------------------------------------------------------------------------------
def net_segment_polyline(segment: Any) -> Polyline | None:
    """Ломаная сегмента цепи: лист, точки, типы точек."""
    call = getattr(segment, "GetLineSegments", None)
    if call is None:
        _note("NetSegment.GetLineSegments", comment="метода нет в этой сборке")
        return None
    try:
        result = out_values(call(0, 0, 0, 0))
    except Exception as error:
        _note("NetSegment.GetLineSegments", error)
        return None
    if len(result) < 4:
        return None
    try:
        count = int(result[0] or 0)
    except (TypeError, ValueError):
        return None
    if count < 2:
        return None
    try:
        sheet_id = int(result[1] or 0)
    except (TypeError, ValueError):
        sheet_id = 0
    xs = _floats_of(count, result[2])
    ys = _floats_of(count, result[3])
    types: list[int] = []
    if len(result) > 4 and isinstance(result[4], (tuple, list)):
        raw_types = list(result[4])
        if count and len(raw_types) > count:
            raw_types = raw_types[1:]
        for item in raw_types[:count]:
            try:
                types.append(int(item))
            except (TypeError, ValueError):
                types.append(0)
    if len(xs) < 2 or len(ys) < 2:
        return None
    points = list(zip(xs, ys))
    return Polyline(sheet_id=sheet_id, points=points, types=types)


def net_segment_signal(segment: Any) -> str:
    call = getattr(segment, "GetSignalName", None)
    if call is None:
        return ""
    try:
        value = call()
    except Exception:
        return ""
    return "" if value is None else str(value).strip()


def create_connection(
    connection: Any,
    sheet_id: int,
    points: Sequence[tuple[float, float]],
    types: Sequence[int] | None = None,
    probe: Probe | None = None,
) -> bool:
    """Рисует провод по точкам ломаной.

    Массивы передаются 1-based — с фиктивным нулевым элементом, как это делает
    официальная обёртка Zuken. Логическую связь E3 устанавливает сам по факту
    касания вывода, поэтому соединения надо создавать после размещения символов.
    """
    if connection is None or len(points) < 2:
        return False
    xs = [0.0] + [float(p[0]) for p in points]
    ys = [0.0] + [float(p[1]) for p in points]
    count = len(points)

    attempts: list[tuple[str, tuple]] = []
    if types and len(types) >= count:
        padded = [0] + [int(t) for t in types[:count]]
        attempts.append(("Create(1-based, с типами точек)", (sheet_id, count, xs, ys, padded)))
    attempts.append(("Create(1-based)", (sheet_id, count, xs, ys)))
    # Запасной вариант для сборок, которые ждут 0-based массивы.
    attempts.append((
        "Create(0-based)",
        (sheet_id, count, xs[1:], ys[1:]),
    ))

    last: BaseException | None = None
    for label, args in attempts:
        try:
            result = connection.Create(*args)
        except Exception as error:
            last = error
            continue
        try:
            ok = int(result or 0) > 0
        except (TypeError, ValueError):
            ok = False
        if ok:
            if probe is not None:
                probe.connection = label
            return True

    call = getattr(connection, "CreateConnectionBetweenPoints", None)
    if call is not None:
        try:
            result = call(
                sheet_id,
                float(points[0][0]),
                float(points[0][1]),
                float(points[-1][0]),
                float(points[-1][1]),
                0,
            )
            if int(result or 0) > 0:
                if probe is not None:
                    probe.connection = "CreateConnectionBetweenPoints"
                return True
        except Exception as error:
            last = error
    _note("Connection.Create", last)
    return False


# ------------------------------------------------------------------------------
#  Атрибуты
# ------------------------------------------------------------------------------
def attribute_value(obj: Any, name: str) -> str:
    try:
        value = obj.GetAttributeValue(name)
    except Exception:
        return ""
    return "" if value is None else str(value).strip()


def set_attributes(obj: Any, values: dict[str, str]) -> tuple[int, list[str]]:
    """Пишет атрибуты по одному. Возвращает (сколько записано, что не вышло)."""
    written = 0
    failed: list[str] = []
    for name, value in values.items():
        try:
            obj.SetAttributeValue(name, value)
            written += 1
        except Exception:
            failed.append(name)
    return written, failed


def device_name(device: Any) -> str:
    try:
        value = device.GetName()
    except Exception:
        return ""
    return "" if value is None else str(value).strip()


def device_component(device: Any) -> str:
    try:
        value = device.GetComponentName()
    except Exception:
        return ""
    return "" if value is None else str(value).strip()


def symbol_name(symbol: Any) -> str:
    try:
        value = symbol.GetName()
    except Exception:
        return ""
    return "" if value is None else str(value).strip()


def text_value(text_obj: Any, text_id: int) -> str:
    try:
        text_obj.SetId(text_id)
        value = text_obj.GetText()
    except Exception:
        return ""
    return "" if value is None else str(value).strip()


def create_device(device: Any, name: str, component: str) -> bool:
    """Создаёт изделие из компонента библиотеки."""
    try:
        device.Create(name, "", "", component, "", 0)
        return True
    except Exception:
        return False


def device_id(device: Any) -> int:
    try:
        return int(device.GetId() or 0)
    except Exception:
        return 0


def set_id(obj: Any, item_id: int) -> bool:
    try:
        obj.SetId(int(item_id))
        return True
    except Exception:
        return False


def sheet_name(sheet: Any) -> str:
    try:
        value = sheet.GetName()
    except Exception:
        return ""
    return "" if value is None else str(value).strip()


# ------------------------------------------------------------------------------
#  Листы: формат, габариты, создание
# ------------------------------------------------------------------------------
def sheet_format(sheet: Any) -> str:
    """Имя символа рамки листа — то, что в E3 называется форматом листа.

    Sheet.GetFormat доступна с TLB 8.50, то есть во всех рабочих сборках.
    Пустой ответ и «<Empty>» означают одно и то же: формат не определён.
    """
    call = getattr(sheet, "GetFormat", None)
    if call is None:
        _note("Sheet.GetFormat", comment="метода нет — формат листа не выгружается")
        return ""
    try:
        value = call()
    except Exception as error:
        _note("Sheet.GetFormat", error)
        return ""
    text = "" if value is None else str(value).strip()
    return "" if text.lower() in ("<empty>", "(empty)") else text


def set_sheet_format(sheet: Any, name: str, rotation: str = "") -> bool:
    """Меняет рамку листа. Именно этим формат листа правится из Excel."""
    call = getattr(sheet, "SetFormat", None)
    if call is None:
        _note("Sheet.SetFormat", comment="метода нет — формат листа не изменить")
        return False
    last: BaseException | None = None
    for args in ((name, rotation), (name,)):
        try:
            result = call(*args)
        except Exception as error:
            last = error
            continue
        return int(result or 0) != 0
    _note("Sheet.SetFormat", last)
    return False


def sheet_area(sheet: Any) -> tuple[float, float, float, float] | None:
    """Габарит листа (xmin, ymin, xmax, ymax) в мм.

    Сначала область чертежа, затем рабочая область: на разных типах листов
    доступна то одна, то другая.
    """
    for method in ("GetDrawingArea", "GetWorkingArea"):
        call = getattr(sheet, method, None)
        if call is None:
            continue
        try:
            result = out_values(call(0, 0, 0, 0))
        except Exception:
            continue
        if len(result) < 5:
            continue
        try:
            values = [float(result[index]) for index in range(1, 5)]
        except (TypeError, ValueError):
            continue
        if values[2] - values[0] <= 0 or values[3] - values[1] <= 0:
            continue
        return (values[0], values[1], values[2], values[3])
    _note("Sheet.GetDrawingArea", comment="габарит листа получить не удалось")
    return None


def create_sheet(sheet: Any, name: str, sheet_format_name: str) -> int:
    """Создаёт лист с заданной рамкой. Возвращает ID нового листа или 0.

    Sheet.Create(modi, name, symbol, position, before): modi 0 — верхний
    уровень проекта, position 0 + before 0 — в конец.
    """
    call = getattr(sheet, "Create", None)
    if call is None:
        _note("Sheet.Create", comment="метода нет — листы не создать")
        return 0
    try:
        return int(call(0, name, sheet_format_name, 0, 0) or 0)
    except Exception as error:
        _note("Sheet.Create", error)
        return 0


def set_attribute(obj: Any, name: str, value: str) -> bool:
    try:
        obj.SetAttributeValue(name, value)
        return True
    except Exception as error:
        _note("SetAttributeValue", error, comment=f"атрибут «{name}»")
        return False


def symbol_type(symbol: Any) -> int:
    """Тип символа (Symbol.GetSymbolType, TLB 20.00). -1 — не определён.

    Нужен, чтобы отличить рамку листа и таблицы от обычных схемных символов.
    """
    call = getattr(symbol, "GetSymbolType", None)
    if call is None:
        return -1
    try:
        return int(call())
    except Exception:
        return -1
