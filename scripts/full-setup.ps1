# Alamida Kalender - Vollautomatisches Setup
# Fuehrt den Benutzer durch alle Schritte

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Write-Host "=== Alamida Kalender - Vollautomatisches Setup ===" -ForegroundColor Cyan
Write-Host ""

# Projektverzeichnis
$root = Split-Path $PSScriptRoot -Parent
$appDataPath = "$env:APPDATA\AlamidaCalendar"

# Verzeichnisse erstellen
if (-not (Test-Path $appDataPath)) {
    New-Item -ItemType Directory -Path $appDataPath -Force | Out-Null
    Write-Host "AppData-Verzeichnis erstellt: $appDataPath" -ForegroundColor Green
}

# Schritt 1: Google Cloud Projekt erstellen
Write-Host "`n=== Schritt 1: Google Cloud Projekt ===" -ForegroundColor Cyan
Write-Host "Oeffne Google Cloud Console..." -ForegroundColor Yellow
Start-Process "https://console.cloud.google.com/projectcreate"

Write-Host "1. Erstellen Sie ein neues Projekt" -ForegroundColor White
Write-Host "2. Kopieren Sie die Projekt-ID" -ForegroundColor White
$projectId = Read-Host "Projekt-ID (oder Enter zum Ueberspringen wenn bereits vorhanden)"

if ([string]::IsNullOrWhiteSpace($projectId)) {
    $projectId = Read-Host "Geben Sie die Projekt-ID Ihres bestehenden Projekts ein"
}

# Schritt 2: Calendar API aktivieren
Write-Host "`n=== Schritt 2: Calendar API aktivieren ===" -ForegroundColor Cyan
$apiUrl = "https://console.cloud.google.com/apis/library/calendar-json.googleapis.com?project=$projectId"
Write-Host "Oeffne Calendar API Seite..." -ForegroundColor Yellow
Start-Process $apiUrl

Write-Host "1. Klicken Sie auf 'ENABLE'" -ForegroundColor White
Write-Host "2. Warten Sie bis die API aktiviert ist" -ForegroundColor White
Write-Host "Druecken Sie Enter wenn fertig..." -ForegroundColor Yellow
Read-Host

# Schritt 3: Billing aktivieren
Write-Host "`n=== Schritt 3: Billing aktivieren ===" -ForegroundColor Cyan
$billingUrl = "https://console.cloud.google.com/billing/linkedaccount?project=$projectId"
Write-Host "Oeffne Billing Seite..." -ForegroundColor Yellow
Start-Process $billingUrl

Write-Host "1. Aktivieren Sie Billing fuer das Projekt (erforderlich fuer Calendar API)" -ForegroundColor White
Write-Host "Druecken Sie Enter wenn fertig..." -ForegroundColor Yellow
Read-Host

# Schritt 4: Service Account erstellen
Write-Host "`n=== Schritt 4: Service Account erstellen ===" -ForegroundColor Cyan
$saUrl = "https://console.cloud.google.com/iam-admin/serviceaccounts?project=$projectId"
Write-Host "Oeffne Service Accounts Seite..." -ForegroundColor Yellow
Start-Process $saUrl

Write-Host "1. Klicken Sie auf 'CREATE SERVICE ACCOUNT'" -ForegroundColor White
Write-Host "2. Name: alamida-calendar-agent" -ForegroundColor White
Write-Host "3. Klicken Sie auf 'CREATE AND CONTINUE'" -ForegroundColor White
Write-Host "4. Rolle: 'Editor' oder 'Calendar Editor'" -ForegroundColor White
Write-Host "5. Klicken Sie auf 'DONE'" -ForegroundColor White
Write-Host "Druecken Sie Enter wenn fertig..." -ForegroundColor Yellow
Read-Host

# Schritt 5: Service Account Key erstellen
Write-Host "`n=== Schritt 5: Service Account Key erstellen ===" -ForegroundColor Cyan
Write-Host "Klicken Sie auf den neu erstellten Service Account" -ForegroundColor White
Write-Host "Gehen Sie zu 'KEYS' Tab" -ForegroundColor White
Write-Host "Klicken Sie auf 'ADD KEY' -> 'Create new key'" -ForegroundColor White
Write-Host "Key type: JSON" -ForegroundColor White
Write-Host "Klicken Sie auf 'CREATE'" -ForegroundColor White
Write-Host "Die JSON-Datei wird automatisch heruntergeladen" -ForegroundColor White
Write-Host ""
Write-Host "Druecken Sie Enter wenn die JSON-Datei heruntergeladen wurde..." -ForegroundColor Yellow
Read-Host

# Datei-Dialog zum Auswaehlen der heruntergeladenen JSON-Datei
$ofd = New-Object System.Windows.Forms.OpenFileDialog
$ofd.Filter = "JSON-Dateien (*.json)|*.json|Alle Dateien (*.*)|*.*"
$ofd.Title = "Service Account JSON-Datei auswaehlen (heruntergeladen von Google Cloud)"
$ofd.InitialDirectory = "$env:USERPROFILE\Downloads"

Write-Host "Waehlen Sie die heruntergeladene JSON-Datei aus..." -ForegroundColor Yellow
if ($ofd.ShowDialog() -ne 'OK') {
    Write-Host "Abgebrochen" -ForegroundColor Red
    exit 1
}

$credPath = $ofd.FileName
Write-Host "Service Account JSON: $credPath" -ForegroundColor Green

# JSON-Datei nach AppData kopieren
$credDest = "$appDataPath\service-account.json"
Copy-Item $credPath $credDest -Force
Write-Host "Service Account JSON kopiert nach: $credDest" -ForegroundColor Green

# Service Account Email aus JSON extrahieren
$json = Get-Content $credPath -Raw | ConvertFrom-Json
$serviceAccountEmail = $json.client_email
Write-Host "Service Account Email: $serviceAccountEmail" -ForegroundColor Green

# Schritt 6: Kalender freigeben
Write-Host "`n=== Schritt 6: Kalender freigeben ===" -ForegroundColor Cyan
Write-Host "Oeffne Google Calendar..." -ForegroundColor Yellow
Start-Process "https://calendar.google.com"

Write-Host "1. Klicken Sie auf das Zahnrad-Symbol (Einstellungen)" -ForegroundColor White
Write-Host "2. Waehlen Sie 'Mit Personen teilen'" -ForegroundColor White
Write-Host "3. Fügen Sie '$serviceAccountEmail' hinzu" -ForegroundColor White
Write-Host "4. Berechtigung: 'Verwalten' (Make changes to events)" -ForegroundColor White
Write-Host "5. Klicken Sie auf 'Senden'" -ForegroundColor White
Write-Host "Druecken Sie Enter wenn fertig..." -ForegroundColor Yellow
Read-Host

# Kalender ID abfragen
Write-Host "`n=== Kalender ID ===" -ForegroundColor Cyan
Write-Host "Fuer Ihren Hauptkalender verwenden Sie 'primary'" -ForegroundColor White
$calendarId = Read-Host "Kalender ID (oder Enter fuer 'primary')"

if ([string]::IsNullOrWhiteSpace($calendarId)) {
    $calendarId = "primary"
}

# Schritt 7: AppSettings aktualisieren
Write-Host "`n=== Schritt 7: Konfiguration aktualisieren ===" -ForegroundColor Cyan
$appSettingsPath = "$root\agent\Alamida.Calendar.Agent\appsettings.json"

if (Test-Path $appSettingsPath) {
    $appSettings = Get-Content $appSettingsPath -Raw | ConvertFrom-Json
    $appSettings.CalendarId = $calendarId
    $appSettings.ServiceAccountPath = "%AppData%\AlamidaCalendar\service-account.json"
    
    $appSettings | ConvertTo-Json -Depth 10 | Out-File $appSettingsPath -Encoding UTF8
    Write-Host "AppSettings aktualisiert" -ForegroundColor Green
}

# Konfiguration nach AppData kopieren
$configDest = "$appDataPath\appsettings.json"
Copy-Item $appSettingsPath $configDest -Force
Write-Host "Konfiguration kopiert nach: $configDest" -ForegroundColor Green

# Field-Mapping kopieren
$mappingSource = "$root\docs\field-mapping-9.2.1.json"
$mappingDest = "$appDataPath\field-mapping.json"
if (Test-Path $mappingSource) {
    Copy-Item $mappingSource $mappingDest -Force
    Write-Host "Field-Mapping kopiert nach: $mappingDest" -ForegroundColor Green
}

# Schritt 8: Agent builden
Write-Host "`n=== Schritt 8: Agent builden ===" -ForegroundColor Cyan
Set-Location "$root\agent"
dotnet build --configuration Release

if ($LASTEXITCODE -ne 0) {
    Write-Host "Agent-Build fehlgeschlagen" -ForegroundColor Red
    exit 1
}

Write-Host "Agent erfolgreich gebuildet" -ForegroundColor Green

# Schritt 9: Installer erstellen
Write-Host "`n=== Schritt 9: Installer erstellen ===" -ForegroundColor Cyan
Set-Location "$root\scripts"
.\build-simple-installer.ps1

Write-Host "Installer erstellt" -ForegroundColor Green

# Zusammenfassung
Write-Host "`n=== SETUP ABGESCHLOSSEN! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Projekt ID: $projectId" -ForegroundColor Cyan
Write-Host "Service Account: $serviceAccountEmail" -ForegroundColor Cyan
Write-Host "Kalender ID: $calendarId" -ForegroundColor Cyan
Write-Host "Service Account Key: $credDest" -ForegroundColor Cyan
Write-Host ""
Write-Host "Naechste Schritte:" -ForegroundColor Yellow
Write-Host "1. Installer in dist/installer/AlamidaCalendarAgent-Setup.zip" -ForegroundColor White
Write-Host "2. ZIP entpacken" -ForegroundColor White
Write-Host "3. INSTALL.bat als Administrator ausfuehren" -ForegroundColor White
Write-Host "4. Agent starten" -ForegroundColor White
Write-Host ""
Write-Host "Der Agent wird Termine automatisch mit Google Calendar synchronisieren!" -ForegroundColor Green
Write-Host ""
Write-Host "Zum Testen koennen Sie den Agent auch direkt starten:" -ForegroundColor Yellow
Write-Host "cd agent\Alamida.Calendar.Agent\bin\Release\net8.0-windows" -ForegroundColor White
Write-Host ".\AlamidaCalendarAgent.exe" -ForegroundColor White
