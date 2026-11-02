@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0restart-agent.ps1"
if errorlevel 1 pause
