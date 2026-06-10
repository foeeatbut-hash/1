# Portable-сборка PDM System (Windows x64)

Готовый portable .exe (Electron 41.7.2), разбитый на части из-за лимита GitHub на размер файла (100 МБ).

## Как скачать и собрать

1. Скачайте все файлы из этой папки:
   - `PDM-System-portable.zip.00.part`
   - `PDM-System-portable.zip.01.part`
   - `СОБРАТЬ-АРХИВ.bat`
2. Положите их в одну папку и запустите `СОБРАТЬ-АРХИВ.bat` — он склеит части в `PDM-System-portable.zip`.
3. Распакуйте архив и запустите `PDM-System-portable.exe`. Установка не требуется.

При первом запуске приложение создаст папку `%APPDATA%\pdm-app` с локальной базой `database.sqlite`.
Учетная запись по умолчанию: логин `RaupovKhKh`, пароль `1122`.
