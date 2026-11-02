# Alamida Kalender - Einfacher ZIP-Installer erstellen
# Erstellt eine ZIP-Datei mit Installationsskript

$ErrorActionPreference = "Stop"

Write-Host "=== Alamida Kalender ZIP-Installer erstellen ===" -ForegroundColor Cyan

# 1. Agent builden (self-contained)
Write-Host "`n=== Agent builden (self-contained) ===" -ForegroundColor Cyan
Set-Location ..\agent
dotnet publish Alamida.Calendar.Agent --configuration Release --runtime win-x64 --self-contained true /p:PublishSingleFile=true /p:PublishTrimmed=false

if ($LASTEXITCODE -ne 0) {
    Write-Host "Agent-Build fehlgeschlagen" -ForegroundColor Red
    exit 1
}

# 2. Temporaeres Verzeichnis erstellen
$root = Split-Path $PSScriptRoot -Parent
$tempDir = Join-Path $root "dist\installer-temp"
$outputDir = Join-Path $root "dist\installer"

Write-Host "Erstelle temporaeres Verzeichnis: $tempDir" -ForegroundColor Yellow
if (Test-Path $tempDir) {
    Remove-Item $tempDir -Recurse -Force
}
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

# 3. Dateien kopieren
Write-Host "Kopiere Agent-Dateien..." -ForegroundColor Yellow
$agentPublishDir = Join-Path $root "agent\Alamida.Calendar.Agent\bin\Release\net8.0-windows\win-x64\publish"
Write-Host "Publish-Verzeichnis: $agentPublishDir" -ForegroundColor Yellow

if (-not (Test-Path $agentPublishDir)) {
    Write-Host "FEHLER: Publish-Verzeichnis nicht gefunden: $agentPublishDir" -ForegroundColor Red
    exit 1
}

Write-Host "Gefundene Dateien:" -ForegroundColor Yellow
Get-ChildItem $agentPublishDir | ForEach-Object { Write-Host "  $($_.Name)" }

Copy-Item "$agentPublishDir\*" $tempDir -Recurse -Force

Write-Host "Kopiere Konfigurationsdateien..." -ForegroundColor Yellow
Copy-Item "$root\docs\field-mapping-9.2.1.json" "$tempDir\field-mapping-9.2.1.json" -Force
Copy-Item "$root\agent\Alamida.Calendar.Agent\appsettings.json" $tempDir -Force
Copy-Item "$root\scripts\service-account.json" "$tempDir\service-account.json" -Force

Write-Host "Kopiere Service Account Key..." -ForegroundColor Yellow
$serviceAccountPath = Join-Path $env:APPDATA "AlamidaCalendar\service-account.json"
$localKey = Join-Path $PSScriptRoot "service-account.json"
if (Test-Path $serviceAccountPath) {
    Copy-Item $serviceAccountPath $tempDir -Force
    Write-Host "Service Account Key wird mit ausgeliefert" -ForegroundColor Green
} elseif (Test-Path $localKey) {
    Copy-Item $localKey $tempDir -Force
    Write-Host "Service Account Key wird mit ausgeliefert" -ForegroundColor Green
} else {
    Write-Host "Service Account Key nicht gefunden - muss manuell hinzugefuegt werden" -ForegroundColor Yellow
}

Write-Host "Kopiere Installationsskripte..." -ForegroundColor Yellow
Copy-Item "$root\scripts\INSTALL.bat" $tempDir -Force
Copy-Item "$root\scripts\UNINSTALL.bat" $tempDir -Force
Copy-Item "$root\scripts\GOOGLE-CALENDAR-SETUP.txt" $tempDir -Force

# Entferne potentielle Fake-Verzeichnisse
Remove-Item "$tempDir\%APP_DATA%" -Force -ErrorAction SilentlyContinue
Remove-Item "$tempDir\%INSTALL_DIR%" -Force -ErrorAction SilentlyContinue

# 4. README fuer Installer erstellen
$readme = @"
=== Alamida Kalender Agent - Installation ===

1. INSTALL.bat als Administrator ausfuehren
   (Rechtsklick - "Als Administrator ausfuehren")

2. Nach der Installation:
   - Google Calendar Service Account JSON nach 
     %AppData%\AlamidaCalendar\service-account.json speichern
   - Kalender in Google Calendar freigeben
   
3. Agent starten:
   - Desktop-Verknuepfung doppelklicken
   - Oder: C:\Program Files\AlamidaCalendar\AlamidaCalendarAgent.exe

4. Tray-Icon erscheint unten rechts
   - Rechtsklick: Status, Sync, Inspector

=== Deinstallation ===

UNINSTALL.bat als Administrator ausfuehren
(Rechtsklick - "Als Administrator ausfuehren")

Siehe GOOGLE-CALENDAR-SETUP.txt fuer Google Cloud Setup.
"@

$readme | Out-File -FilePath "$tempDir\README.txt" -Encoding UTF8

# 5. ZIP erstellen
Write-Host "Erstelle ZIP-Datei..." -ForegroundColor Yellow
$zipPath = "$outputDir\AlamidaCalendarAgent-Setup.zip"
Compress-Archive -Path "$tempDir\*" -DestinationPath $zipPath -Force

# 6. Temporaeres Verzeichnis bereinigen
Write-Host "Bereinige temporaeres Verzeichnis..." -ForegroundColor Yellow
Remove-Item $tempDir -Recurse -Force

Write-Host "`nZIP-Installer erfolgreich erstellt!" -ForegroundColor Green
Write-Host "Installationsdatei: $zipPath" -ForegroundColor Yellow
Write-Host "`nZum Installieren:" -ForegroundColor Cyan
Write-Host "1. ZIP entpacken" -ForegroundColor White
Write-Host "2. INSTALL.bat als Administrator ausfuehren" -ForegroundColor White
