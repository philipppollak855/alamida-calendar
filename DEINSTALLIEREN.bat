@echo off
REM Alamida Kalender Agent - Deinstallation
title Alamida Kalender - Deinstallation
set "PS1=%~dp0uninstall.ps1"
if not exist "%PS1%" set "PS1=%~dp0scripts\uninstall.ps1"
if not exist "%PS1%" set "PS1=%LOCALAPPDATA%\Programs\AlamidaCalendar\uninstall.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Unblock-File -LiteralPath $env:PS1 -ErrorAction SilentlyContinue"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS1%" %*
if errorlevel 1 pause
