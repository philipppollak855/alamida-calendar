@echo off
rem UTF-8-Datei in der CMD korrekt anzeigen (nicht "K├╝hlr")
chcp 65001 >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content -LiteralPath '%~1' -Encoding utf8"
exit /b %ERRORLEVEL%
