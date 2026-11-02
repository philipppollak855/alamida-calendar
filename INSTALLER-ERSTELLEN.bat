@echo off
REM Alamida Kalender - Vollautomatisches Setup und Installer erstellen
echo ========================================================
echo Alamida Kalender - Vollautomatisches Setup
echo ========================================================
echo.

cd scripts

echo Schritt 1: Google Cloud Projekt und Kalender einrichten...
echo.
powershell -ExecutionPolicy Bypass -File full-setup.ps1

if %errorLevel% neq 0 (
    echo Setup fehlgeschlagen!
    pause
    exit /b 1
)

echo.
echo ========================================================
echo Setup abgeschlossen!
echo ========================================================
echo.
echo Installationsdatei: dist\installer\AlamidaCalendarAgent-Setup.zip
echo.
echo Zum Installieren:
echo 1. ZIP entpacken
echo 2. INSTALL.bat als Administrator ausfuehren
echo.
pause
