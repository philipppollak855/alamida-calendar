@echo off
setlocal
cd /d "%~dp0..\agent"
set "LAST=%~dp0..\docs\once-last-run.txt"

echo.
echo === Alamida Snapshot (--once) ===
echo Alamida: Sterbefall-Detail, Tab "Termine" muss offen sein.
echo.
dotnet run --project Alamida.Monitoring.Agent -c Release -- --once
echo.

if exist "%LAST%" (
    echo --- Ergebnis (Datei, UTF-8) ---
    call "%~dp0type-utf8.bat" "%LAST%"
    echo.
) else (
    echo Hinweis: Keine once-last-run.txt - Build/Start pruefen.
    echo.
)

pause
