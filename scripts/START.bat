@echo off
REM Alamida Kalender Agent - Portable (keine Installation erforderlich)
echo ========================================================
echo Alamida Kalender Agent - Portable Start
echo ========================================================
echo.

echo Der Agent wird direkt aus diesem Ordner gestartet.
echo Keine Installation erforderlich.
echo.

REM Pruefen ob EXE existiert
if not exist "AlamidaCalendarAgent.exe" (
    echo FEHLER: AlamidaCalendarAgent.exe nicht gefunden!
    echo.
    echo Stellen Sie sicher, dass Sie dieses Skript aus dem entpackten Installer-Ordner ausfuehren.
    echo.
    echo Inhalte des aktuellen Verzeichnisses:
    dir /b
    pause
    exit /b 1
)

REM AppData-Verzeichnis erstellen
set APP_DATA=%APPDATA%\AlamidaCalendar
if not exist "%APP_DATA%" mkdir "%APP_DATA%"

REM Konfiguration kopieren (falls vorhanden)
if exist "appsettings.json" (
    echo Kopiere Konfiguration...
    copy /Y "appsettings.json" "%APP_DATA%\appsettings.json"
)

if exist "field-mapping.json" (
    copy /Y "field-mapping.json" "%APP_DATA%\field-mapping.json"
)

if exist "field-mapping-9.2.1.json" (
    copy /Y "field-mapping-9.2.1.json" "%APP_DATA%\field-mapping.json"
)

if exist "service-account.json" (
    copy /Y "service-account.json" "%APP_DATA%\service-account.json"
)

REM Autostart erstellen
echo Erstelle Autostart-Verknuepfung...
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\AlamidaCalendarAgent.lnk'); $Shortcut.TargetPath = '%CD%\AlamidaCalendarAgent.exe'; $Shortcut.WorkingDirectory = '%CD%'; $Shortcut.Save()"

REM Desktop-Verknuepfung erstellen
echo Erstelle Desktop-Verknuepfung...
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%USERPROFILE%\Desktop\AlamidaCalendarAgent.lnk'); $Shortcut.TargetPath = '%CD%\AlamidaCalendarAgent.exe'; $Shortcut.WorkingDirectory = '%CD%'; $Shortcut.Save()"

echo.
echo ========================================================
echo Setup abgeschlossen!
echo ========================================================
echo.
echo Agent startet jetzt...
echo Tray-Icon erscheint unten rechts.
echo.
echo Pfad: %CD%\AlamidaCalendarAgent.exe
echo Konfiguration: %APP_DATA%
echo.

REM Agent starten
start "" "AlamidaCalendarAgent.exe"

pause