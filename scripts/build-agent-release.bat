@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-agent-release.ps1" %*
