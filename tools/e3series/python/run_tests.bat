@echo off
rem Прогон тестов логики. E3.series и Excel не нужны — проверяется разбор
rem данных, схема столбцов, экспорт и импорт на поддельной E3.
setlocal
cd /d "%~dp0"

set "PY=python"
if exist "%~dp0runtime\python.exe" set "PY=%~dp0runtime\python.exe"

"%PY%" tests\test_logic.py
"%PY%" tests\test_roundtrip.py

pause
endlocal
