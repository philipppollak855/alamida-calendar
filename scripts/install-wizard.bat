@echo off
title Alamida Monitoring — Installation
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-wizard.ps1"
if errorlevel 1 pause
