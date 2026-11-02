@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-agent-install.ps1" %*
