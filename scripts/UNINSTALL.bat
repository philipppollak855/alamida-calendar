@echo off
REM Alamida Kalender Agent - Deinstallation
echo ========================================================
echo Alamida Kalender Agent Deinstallation
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

echo Deinstallation wird gestartet...
echo.

REM Agent stoppen
echo Stoppe Agent...
taskkill /F /IM AlamidaCalendarAgent.exe >nul 2>&1
timeout /t 2 /nobreak >nul

REM Autostart entfernen
echo Entferne Autostart-Verknuepfung...
if exist "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\AlamidaCalendarAgent.lnk" (
    del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\AlamidaCalendarAgent.lnk"
)

REM Desktop-Verknuepfung entfernen
echo Entferne Desktop-Verknuepfung...
if exist "%USERPROFILE%\Desktop\AlamidaCalendarAgent.lnk" (
    del "%USERPROFILE%\Desktop\AlamidaCalendarAgent.lnk"
)

REM AppData-Verzeichnis entfernen (mit Konfiguration)
echo Entferne AppData-Verzeichnis...
if exist "%APPDATA%\AlamidaCalendar" (
    rd /S /Q "%APPDATA%\AlamidaCalendar"
)

REM Installationsverzeichnis entfernen
echo Entferne Installationsverzeichnis...
if exist "C:\Program Files\AlamidaCalendar" (
    rd /S /Q "C:\Program Files\AlamidaCalendar"
)

echo.
echo ========================================================
echo Deinstallation abgeschlossen!
echo ========================================================
echo.
pause
