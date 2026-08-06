@echo off
rem ============================================================================
rem  Запуск инструмента E3.series <-> Excel
rem
rem  Порядок поиска Python:
rem    1) runtime\python.exe  — portable-сборка рядом с программой;
rem    2) py -3               — установленный Python через лончер;
rem    3) python              — Python из PATH.
rem
rem  Аргументы передаются программе: без аргументов открывается окно,
rem  с аргументами работает консольный режим (см. README).
rem ============================================================================
setlocal
cd /d "%~dp0"

set "PORTABLE=%~dp0runtime\python.exe"

if exist "%PORTABLE%" (
    rem pywin32 в portable-сборке ищет свои DLL рядом; подстрахуемся через PATH.
    set "PATH=%~dp0runtime;%~dp0runtime\Lib\site-packages\pywin32_system32;%PATH%"
    "%PORTABLE%" -m e3tool %*
    goto :done
)

where py >nul 2>nul
if %errorlevel%==0 (
    py -3 -m e3tool %*
    goto :done
)

where python >nul 2>nul
if %errorlevel%==0 (
    python -m e3tool %*
    goto :done
)

echo.
echo Python не найден.
echo.
echo Варианты:
echo   1. Установите Python 3.11+ x64 с python.org и выполните:
echo        pip install -r requirements.txt
echo   2. Либо соберите portable-версию: powershell -File make_portable.ps1
echo.
pause

:done
if errorlevel 1 pause
endlocal
