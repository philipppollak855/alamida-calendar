# Alamida Kalender - Setup-Skript
# Ersetzt setup-complete.ps1 von Alamida-Monitoring für Google Calendar

$ErrorActionPreference = "Stop"

Write-Host "=== Alamida Kalender Setup ===" -ForegroundColor Cyan

# 1. AppData Verzeichnis erstellen
$appDataPath = "$env:APPDATA\AlamidaCalendar"
Write-Host "Erstelle Verzeichnis: $appDataPath" -ForegroundColor Yellow
New-Item -ItemType Directory -Path $appDataPath -Force | Out-Null

# 2. Field-Mapping kopieren
$mappingSource = "docs\field-mapping-9.2.2.1.json"
$mappingDest = "$appDataPath\field-mapping.json"
if (Test-Path $mappingSource) {
    Write-Host "Kopiere Field-Mapping nach: $mappingDest" -ForegroundColor Yellow
    Copy-Item $mappingSource $mappingDest -Force
} else {
    Write-Host "WARNUNG: Field-Mapping nicht gefunden: $mappingSource" -ForegroundColor Red
}

# 3. AppSettings kopieren
$appSettingsSource = "agent\Alamida.Calendar.Agent\appsettings.json"
$appSettingsDest = "$appDataPath\appsettings.json"
if (Test-Path $appSettingsSource) {
    Write-Host "Kopiere AppSettings nach: $appSettingsDest" -ForegroundColor Yellow
    Copy-Item $appSettingsSource $appSettingsDest -Force
} else {
    Write-Host "WARNUNG: AppSettings nicht gefunden: $appSettingsSource" -ForegroundColor Red
}

# 4. Google Calendar Setup Hinweis
Write-Host "`n=== Google Calendar Setup ===" -ForegroundColor Cyan
Write-Host "Bitte folgend durchführen:" -ForegroundColor Yellow
Write-Host "1. Google Cloud Console öffnen: https://console.cloud.google.com" -ForegroundColor White
Write-Host "2. Google Calendar API aktivieren" -ForegroundColor White
Write-Host "3. Service Account erstellen und JSON herunterladen" -ForegroundColor White
Write-Host "4. JSON speichern nach: $appDataPath\service-account.json" -ForegroundColor White
Write-Host "5. Kalender für Service Account freigeben" -ForegroundColor White
Write-Host "`nSiehe scripts\GOOGLE-CALENDAR-SETUP.txt für Details" -ForegroundColor Cyan

# 5. Agent builden
Write-Host "`n=== Agent builden ===" -ForegroundColor Cyan
Set-Location agent
dotnet build

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✓ Setup abgeschlossen!" -ForegroundColor Green
    Write-Host "Agent kann jetzt gestartet werden mit: cd agent && dotnet run" -ForegroundColor Yellow
} else {
    Write-Host "`n✗ Build fehlgeschlagen" -ForegroundColor Red
    exit 1
}
