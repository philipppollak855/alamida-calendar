@echo off
title Alamida Monitoring — START HIER
echo.
echo ============================================
echo   Alamida Monitoring — Installation
echo ============================================
echo.
echo Dieses ZIP enthaelt nur den Installer, KEINE EXE.
echo Der Agent wird nach C:\AlamidaMonitoring installiert,
echo wenn Sie den Wizard starten.
echo.
pause
start "" "%~dp0install-wizard.bat"
