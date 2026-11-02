@echo off
setlocal
cd /d "%~dp0..\agent"
set "DUMP=%~dp0..\docs\inspector-dump.txt"
set "LAST=%~dp0..\docs\inspect-last-run.txt"

echo.
echo === Alamida UI-Inspector ===
echo Voraussetzung: Alamida ist geoeffnet, Sterbefall-Detail, Tab "Termine".
echo.
dotnet run --project Alamida.Monitoring.Agent -c Release -- --inspect
echo.

if exist "%LAST%" (
    echo --- Ergebnis (Datei, UTF-8) ---
    call "%~dp0type-utf8.bat" "%LAST%"
    echo.
) else (
    echo Hinweis: Keine inspect-last-run.txt - Build/Start pruefen.
    echo.
)

if exist "%DUMP%" (
    for %%F in ("%DUMP%") do echo Dump-Datei: %%~fF
    for %%A in ("%DUMP%") do echo Groesse: %%~zA Bytes
) else (
    echo WARNUNG: Dump wurde nicht erstellt: %DUMP%
)

echo.
pause
