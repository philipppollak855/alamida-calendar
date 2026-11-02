@echo off
REM Alamida Kalender Agent - Ein-Klick-Installation (keine Adminrechte noetig)
title Alamida Kalender - Installation
set "ALAMIDA_DIR=%~dp0"
set "PS1=%~dp0install.ps1"
if not exist "%PS1%" set "PS1=%~dp0scripts\install.ps1"
REM Aus dem Internet geladene Dateien freigeben, sonst blockiert eine RemoteSigned-Richtlinie die Skripte
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath $env:ALAMIDA_DIR -Recurse -File -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS1%" %*
if errorlevel 1 (
    echo.
    echo Installation fehlgeschlagen.
    echo Steht oben "nicht digital signiert", erzwingt eine Gruppenrichtlinie signierte Skripte.
    echo Bitte "Get-ExecutionPolicy -List" in PowerShell ausfuehren und die Ausgabe an die IT bzw. den Entwickler schicken.
    pause
)
