<#
.SYNOPSIS
    Собирает portable-версию инструмента: папку, которую можно скопировать на
    флешку и запустить на компьютере без установленного Python.

.DESCRIPTION
    Скрипт разворачивает embeddable-сборку Python в подпапку runtime\, ставит в
    неё openpyxl и pywin32 и включает поиск пакетов в site-packages. После этого
    программа запускается через run.bat, ничего не устанавливая в систему.

    Если на рабочем компьютере нет интернета, заранее скачайте на домашнем:
        python-3.12.8-embed-amd64.zip      (python.org / Downloads / Windows)
        get-pip.py                         (https://bootstrap.pypa.io/get-pip.py)
        колёса пакетов:  pip download -r requirements.txt -d wheels --platform win_amd64 `
                             --python-version 312 --only-binary :all:
    и передайте их через -PythonZip, -GetPip и -WheelDir.

.PARAMETER PythonZip
    Путь к уже скачанному архиву embeddable Python. Если не задан — скачивается.

.PARAMETER GetPip
    Путь к get-pip.py. Если не задан — скачивается.

.PARAMETER WheelDir
    Папка с заранее скачанными .whl. Если задана, установка идёт без интернета.

.PARAMETER PythonVersion
    Версия Python для скачивания. По умолчанию 3.12.8.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File make_portable.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File make_portable.ps1 `
        -PythonZip D:\python-3.12.8-embed-amd64.zip -GetPip D:\get-pip.py -WheelDir D:\wheels
#>

[CmdletBinding()]
param(
    [string]$PythonZip = "",
    [string]$GetPip = "",
    [string]$WheelDir = "",
    [string]$PythonVersion = "3.12.8"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtime = Join-Path $root "runtime"
$work = Join-Path $root ".build"

function Say($text) { Write-Host "==> $text" -ForegroundColor Cyan }

# --- 1. embeddable Python -----------------------------------------------------
if (Test-Path $runtime) {
    Say "Папка runtime уже существует — удаляю."
    Remove-Item $runtime -Recurse -Force
}
New-Item -ItemType Directory -Path $runtime | Out-Null
New-Item -ItemType Directory -Path $work -Force | Out-Null

if (-not $PythonZip) {
    $PythonZip = Join-Path $work "python-embed.zip"
    $url = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"
    Say "Скачиваю Python $PythonVersion (x64, embeddable)"
    Invoke-WebRequest -Uri $url -OutFile $PythonZip
}

Say "Распаковываю Python в runtime\"
Expand-Archive -Path $PythonZip -DestinationPath $runtime -Force

# Embeddable-сборка по умолчанию не смотрит в site-packages: включаем.
$pth = Get-ChildItem -Path $runtime -Filter "python*._pth" | Select-Object -First 1
if ($pth) {
    Say "Включаю site-packages в $($pth.Name)"
    $lines = Get-Content $pth.FullName | Where-Object { $_ -ne "#import site" }
    if ($lines -notcontains "Lib\site-packages") { $lines += "Lib\site-packages" }
    if ($lines -notcontains "import site") { $lines += "import site" }
    Set-Content -Path $pth.FullName -Value $lines -Encoding ASCII
}

# --- 2. pip -------------------------------------------------------------------
$python = Join-Path $runtime "python.exe"
if (-not $GetPip) {
    $GetPip = Join-Path $work "get-pip.py"
    Say "Скачиваю get-pip.py"
    Invoke-WebRequest -Uri "https://bootstrap.pypa.io/get-pip.py" -OutFile $GetPip
}
Say "Ставлю pip в runtime"
& $python $GetPip --no-warn-script-location

# --- 3. зависимости -----------------------------------------------------------
$requirements = Join-Path $root "requirements.txt"
if ($WheelDir) {
    Say "Ставлю зависимости из $WheelDir (без интернета)"
    & $python -m pip install --no-index --find-links $WheelDir -r $requirements
} else {
    Say "Ставлю зависимости из интернета"
    & $python -m pip install -r $requirements
}

# --- 4. DLL pywin32 -----------------------------------------------------------
# В embeddable-сборке pythoncom и pywintypes не находятся автоматически:
# кладём их рядом с python.exe.
$system32 = Join-Path $runtime "Lib\site-packages\pywin32_system32"
if (Test-Path $system32) {
    Say "Копирую DLL pywin32 рядом с python.exe"
    Copy-Item (Join-Path $system32 "*.dll") $runtime -Force
} else {
    Write-Warning "Папка pywin32_system32 не найдена — проверьте установку pywin32."
}

# --- 5. проверка --------------------------------------------------------------
Say "Проверяю сборку"
& $python -c "import openpyxl, sys; print('openpyxl', openpyxl.__version__, 'python', sys.version.split()[0])"
& $python -c "import pythoncom, win32com.client; print('pywin32 ок')"
& $python -m e3tool --help | Select-Object -First 3

Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Say "Готово. Запуск — run.bat. Папку можно копировать целиком."
Write-Host "    Не забудьте, что E3.series должна быть запущена на том же компьютере." -ForegroundColor DarkGray
