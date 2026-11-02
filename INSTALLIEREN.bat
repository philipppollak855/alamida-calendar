@echo off
REM Alamida Kalender Agent - Ein-Klick-Installation (keine Adminrechte noetig)
title Alamida Kalender - Installation
set "PS1=%~dp0install.ps1"
if not exist "%PS1%" set "PS1=%~dp0scripts\install.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS1%" %*
if errorlevel 1 pause
