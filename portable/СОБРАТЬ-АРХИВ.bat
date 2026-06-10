@echo off
rem Склеивает части архива в один файл PDM-System-portable.zip
copy /b "PDM-System-portable.zip.00.part" + "PDM-System-portable.zip.01.part" "PDM-System-portable.zip"
echo.
echo Готово! Распакуйте PDM-System-portable.zip и запустите PDM-System-portable.exe
pause
