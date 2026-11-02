@echo off
REM Alamida Kalender Agent - Installation mit manueller Pfadauswahl
echo ========================================================
echo Alamida Kalender Agent Installation
echo ========================================================
echo.

REM Pruefen ob Admin-Rechte vorhanden
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Bitte starten Sie dieses Skript als Administrator!
    echo Rechtsklick - "Als Administrator ausfuehren"
    pause
    exit /b 1
)

echo Installation wird gestartet...
echo.

REM AppData-Verzeichnis
set APP_DATA=%APPDATA%\AlamidaCalendar
if not exist "%APP_DATA%" mkdir "%APP_DATA%"

REM Installationsverzeichnis auswaehlen
echo.
echo Wählen Sie das Installationsverzeichnis aus...
echo.
powershell -Command "Add-Type -AssemblyName System.Windows.Forms; $folder = New-Object System.Windows.Forms.FolderBrowserDialog; $folder.Description = 'Wählen Sie das Installationsverzeichnis für Alamida Kalender Agent'; $folder.SelectedPath = [Environment]::GetFolderPath('ProgramFiles'); if ($folder.ShowDialog() -eq 'OK') { $folder.SelectedPath }"

if errorlevel 1 (
    echo Abgebrochen.
    pause
    exit /b 1
)

REM Pfad aus PowerShell-Output extrahieren
for /f "delims=" %%I in ('powershell -Command "Add-Type -AssemblyName System.Windows.Forms; $folder = New-Object System.Windows.Forms.FolderBrowserDialog; $folder.Description = 'Wählen Sie das Installationsverzeichnis für Alamida Kalender Agent'; $folder.SelectedPath = [Environment]::GetFolderPath('ProgramFiles'); if ($folder.ShowDialog() -eq 'OK') { $folder.SelectedPath }"') do set INSTALL_DIR=%%I

echo Installationsverzeichnis: %INSTALL_DIR%
echo AppData-Verzeichnis: %APP_DATA%
echo.

REM Verzeichnisse erstellen
echo Erstelle Verzeichnisse...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

REM Alle Dateien kopieren (manuell um Probleme mit robocopy zu vermeiden)
echo Kopiere Dateien nach %INSTALL_DIR%...
copy /Y "%~dp0AlamidaCalendarAgent.exe" "%INSTALL_DIR%\" >nul
copy /Y "%~dp0AlamidaCalendarAgent.pdb" "%INSTALL_DIR%\" >nul
copy /Y "%~dp0appsettings.json" "%INSTALL_DIR%\" >nul
copy /Y "%~dp0field-mapping-9.2.1.json" "%INSTALL_DIR%\" >nul
copy /Y "%~dp0service-account.json" "%INSTALL_DIR%\" >nul
copy /Y "%~dp0GOOGLE-CALENDAR-SETUP.txt" "%INSTALL_DIR%\" >nul
copy /Y "%~dp0README.txt" "%INSTALL_DIR%\" >nul
copy /Y "%~dp0UNINSTALL.bat" "%INSTALL_DIR%\" >nul
if exist "%~dp0*.dll" copy /Y "%~dp0*.dll" "%INSTALL_DIR%\" >nul

REM AppData-Konfiguration kopieren (immer, damit AppData-Konfiguration aktualisiert wird)
echo Kopiere Konfiguration nach AppData...
if exist "%INSTALL_DIR%\appsettings.json" (
    copy /Y "%INSTALL_DIR%\appsettings.json" "%APP_DATA%\appsettings.json"
    echo appsettings.json kopiert
)

if exist "%INSTALL_DIR%\field-mapping-9.2.1.json" (
    copy /Y "%INSTALL_DIR%\field-mapping-9.2.1.json" "%APP_DATA%\field-mapping-9.2.1.json"
    echo field-mapping-9.2.1.json kopiert
)

if exist "%INSTALL_DIR%\service-account.json" (
    copy /Y "%INSTALL_DIR%\service-account.json" "%APP_DATA%\service-account.json"
    echo service-account.json kopiert
)

REM Auch als field-mapping.json kopieren fuer Kompatibilitaet
if exist "%INSTALL_DIR%\field-mapping-9.2.1.json" (
    copy /Y "%INSTALL_DIR%\field-mapping-9.2.1.json" "%APP_DATA%\field-mapping.json"
    echo field-mapping.json (Kopie) erstellt
)

REM Pruefen ob EXE im Installationsverzeichnis existiert
if not exist "%INSTALL_DIR%\AlamidaCalendarAgent.exe" (
    echo FEHLER: AlamidaCalendarAgent.exe wurde nicht nach %INSTALL_DIR% kopiert
    echo.
    echo Bitte versuchen Sie es erneut oder wählen Sie einen anderen Pfad.
    pause
    exit /b 1
)

REM Autostart erstellen
echo Erstelle Autostart-Verknuepfung...
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\AlamidaCalendarAgent.lnk'); $Shortcut.TargetPath = '%INSTALL_DIR%\AlamidaCalendarAgent.exe'; $Shortcut.WorkingDirectory = '%INSTALL_DIR%'; $Shortcut.Save()" 2>nul

if errorlevel 1 (
    echo Autostart-Verknuepfung konnte nicht erstellt werden (möglicherweise wegen Leerzeichen im Pfad)
    echo Sie können den Agent manuell zum Autostart hinzufuegen.
)

REM Desktop-Verknuepfung erstellen
echo Erstelle Desktop-Verknuepfung...
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%USERPROFILE%\Desktop\AlamidaCalendarAgent.lnk'); $Shortcut.TargetPath = '%INSTALL_DIR%\AlamidaCalendarAgent.exe'; $Shortcut.WorkingDirectory = '%INSTALL_DIR%'; $Shortcut.Save()" 2>nul

if errorlevel 1 (
    echo Desktop-Verknuepfung konnte nicht erstellt werden (möglicherweise wegen Leerzeichen im Pfad)
    echo Erstellen Sie die Verknuepfung manuell auf dem Desktop: %INSTALL_DIR%\AlamidaCalendarAgent.exe
    echo Rechtsklick auf Desktop - Neu - Verknuepfung - Pfad eingeben
)

echo.
echo ========================================================
echo Installation abgeschlossen!
echo ========================================================
echo.
echo Installierte Dateien in: %INSTALL_DIR%
echo.
echo Konfiguration in: %APP_DATA%
echo.
echo Falls service-account.json nicht vorhanden:
echo 1. Kopieren Sie die Service Account JSON-Datei nach %APP_DATA%\service-account.json
echo 2. Kalender in Google Calendar freigeben
echo.
echo Zum Starten:
echo - Desktop-Verknuepfung doppelklicken
echo - Oder: %INSTALL_DIR%\AlamidaCalendarAgent.exe
echo.
pause
