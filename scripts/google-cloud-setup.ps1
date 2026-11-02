# Alamida Kalender - Volle automatische Google Cloud Einrichtung
# Dieses Skript richtet das Google Cloud Projekt und den Kalender automatisch ein

$ErrorActionPreference = "Stop"

Write-Host "=== Alamida Kalender - Automatische Google Cloud Einrichtung ===" -ForegroundColor Cyan
Write-Host ""

# Pruefen ob gcloud installiert ist
$gcloudInstalled = Get-Command gcloud -ErrorAction SilentlyContinue

if (-not $gcloudInstalled) {
    Write-Host "Google Cloud CLI (gcloud) nicht installiert." -ForegroundColor Yellow
    Write-Host "Installiere Google Cloud CLI..." -ForegroundColor Yellow
    
    # Download gcloud installer
    $installerUrl = "https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe"
    $installerPath = "$env:TEMP\GoogleCloudSDKInstaller.exe"
    
    Write-Host "Lade Google Cloud SDK herunter..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath
    
    Write-Host "Installiere Google Cloud SDK..." -ForegroundColor Cyan
    Start-Process $installerPath -Wait
    
    # PATH aktualisieren
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    
    Write-Host "Google Cloud SDK installiert." -ForegroundColor Green
}

# Google Cloud Authentifizierung
Write-Host "`n=== Google Cloud Authentifizierung ===" -ForegroundColor Cyan
Write-Host "Sie werden zu Google Cloud weitergeleitet fuer die Authentifizierung..." -ForegroundColor Yellow

gcloud auth login

if ($LASTEXITCODE -ne 0) {
    Write-Host "Authentifizierung fehlgeschlagen" -ForegroundColor Red
    exit 1
}

# Projekt erstellen oder auswaehlen
Write-Host "`n=== Google Cloud Projekt ===" -ForegroundColor Cyan
$projectName = "alamida-calendar-$(Get-Random -Minimum 1000 -Maximum 9999)"
Write-Host "Projektname: $projectName" -ForegroundColor Yellow

$projectId = "alamida-calendar-$(Get-Random -Minimum 10000 -Maximum 99999)"

Write-Host "Erstelle Projekt: $projectId" -ForegroundColor Cyan
gcloud projects create $projectId --name=$projectName

if ($LASTEXITCODE -ne 0) {
    Write-Host "Projekt konnte nicht erstellt werden. Bitte waehlen Sie ein bestehendes Projekt." -ForegroundColor Yellow
    $projects = gcloud projects list --format="value(projectId)"
    $projectsArray = $projects -split "`n"
    
    Write-Host "Verfuegbare Projekte:" -ForegroundColor Cyan
    for ($i = 0; $i -lt $projectsArray.Count; $i++) {
        Write-Host "$($i+1). $($projectsArray[$i])"
    }
    
    $selection = Read-Host "Waehlen Sie ein Projekt (Nummer)"
    $projectId = $projectsArray[$selection - 1]
}

# Projekt als Standard setzen
gcloud config set project $projectId

# Billing aktivieren (erforderlich fuer Calendar API)
Write-Host "`n=== Billing Setup ===" -ForegroundColor Cyan
Write-Host "Billing muss fuer Calendar API aktiviert sein." -ForegroundColor Yellow
Write-Host "Oeffne Billing Seite in Browser..." -ForegroundColor Cyan

Start-Process "https://console.cloud.google.com/billing/linkedaccount?project=$projectId"

Write-Host "Bitte aktivieren Sie Billing für das Projekt und druecken Sie Enter..." -ForegroundColor Yellow
Read-Host

# Calendar API aktivieren
Write-Host "`n=== Calendar API aktivieren ===" -ForegroundColor Cyan
gcloud services enable calendar-json.googleapis.com --project=$projectId

if ($LASTEXITCODE -eq 0) {
    Write-Host "Calendar API erfolgreich aktiviert" -ForegroundColor Green
} else {
    Write-Host "Calendar API konnte nicht aktiviert werden" -ForegroundColor Red
    exit 1
}

# Service Account erstellen
Write-Host "`n=== Service Account erstellen ===" -ForegroundColor Cyan
$serviceAccountName = "alamida-calendar-agent"
$serviceAccountEmail = "$serviceAccountName@$projectId.iam.gserviceaccount.com"

gcloud iam service-accounts create $serviceAccountName `
    --display-name="Alamida Calendar Agent" `
    --description="Service Account for Alamida Calendar Sync"

Write-Host "Service Account erstellt: $serviceAccountEmail" -ForegroundColor Green

# Service Account Key erstellen
Write-Host "`n=== Service Account Key erstellen ===" -ForegroundColor Cyan
$appDataPath = "$env:APPDATA\AlamidaCalendar"
if (-not (Test-Path $appDataPath)) {
    New-Item -ItemType Directory -Path $appDataPath -Force | Out-Null
}

$keyPath = "$appDataPath\service-account.json"

gcloud iam service-accounts keys create $keyPath `
    --iam-account=$serviceAccountEmail `
    --key-file-type=json

if (Test-Path $keyPath) {
    Write-Host "Service Account Key erstellt: $keyPath" -ForegroundColor Green
} else {
    Write-Host "Key konnte nicht erstellt werden" -ForegroundColor Red
    exit 1
}

# Calendar API Berechtigungen
Write-Host "`n=== Calendar API Berechtigungen zuweisen ===" -ForegroundColor Cyan
gcloud projects add-iam-policy-binding $projectId `
    --member="serviceAccount:$serviceAccountEmail" `
    --role="roles/editor"

Write-Host "Berechtigungen zugewiesen" -ForegroundColor Green

# Kalender ID abrufen oder erstellen
Write-Host "`n=== Kalender ID abrufen ===" -ForegroundColor Cyan
Write-Host "Die Kalender ID ist normalerweise 'primary' fuer Ihren Hauptkalender." -ForegroundColor Yellow
Write-Host "Falls Sie einen anderen Kalender verwenden wollen, geben Sie die ID ein." -ForegroundColor Yellow
$calendarId = Read-Host "Kalender ID (oder Enter fuer 'primary')"

if ([string]::IsNullOrWhiteSpace($calendarId)) {
    $calendarId = "primary"
}

# Kalender freigeben (muss manuell in Google Calendar geschehen)
Write-Host "`n=== Kalender freigeben ===" -ForegroundColor Cyan
Write-Host "Der Kalender muss fuer das Service Account freigegeben werden." -ForegroundColor Yellow
Write-Host "Service Account Email: $serviceAccountEmail" -ForegroundColor Yellow
Write-Host ""
Write-Host "Oeffne Google Calendar..." -ForegroundColor Cyan
Start-Process "https://calendar.google.com"

Write-Host "Bitte:" -ForegroundColor Yellow
Write-Host "1. Kalender-Einstellungen oeffnen" -ForegroundColor White
Write-Host "2. 'Mit Personen teilen' waehlen" -ForegroundColor White
Write-Host "3. '$serviceAccountEmail' hinzufuegen" -ForegroundColor White
Write-Host "4. Berechtigung: 'Verwalten' waehlen" -ForegroundColor White
Write-Host ""
Write-Host "Druecken Sie Enter wenn fertig..." -ForegroundColor Yellow
Read-Host

# AppSettings aktualisieren
Write-Host "`n=== AppSettings aktualisieren ===" -ForegroundColor Cyan
$root = Split-Path $PSScriptRoot -Parent
$appSettingsPath = "$root\agent\Alamida.Calendar.Agent\appsettings.json"

if (Test-Path $appSettingsPath) {
    $appSettings = Get-Content $appSettingsPath -Raw | ConvertFrom-Json
    $appSettings.CalendarId = $calendarId
    $appSettings.ServiceAccountPath = "%AppData%\AlamidaCalendar\service-account.json"
    
    $appSettings | ConvertTo-Json -Depth 10 | Out-File $appSettingsPath -Encoding UTF8
    Write-Host "AppSettings aktualisiert" -ForegroundColor Green
}

# Agent konfigurieren
Write-Host "`n=== Agent konfigurieren ===" -ForegroundColor Cyan
$configDest = "$appDataPath\appsettings.json"
Copy-Item $appSettingsPath $configDest -Force

# Field-Mapping kopieren
$mappingSource = "$root\docs\field-mapping-9.2.1.json"
$mappingDest = "$appDataPath\field-mapping.json"
if (Test-Path $mappingSource) {
    Copy-Item $mappingSource $mappingDest -Force
    Write-Host "Field-Mapping kopiert" -ForegroundColor Green
}

# Zusammenfassung
Write-Host "`n=== Einrichtung abgeschlossen! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Projekt ID: $projectId" -ForegroundColor Cyan
Write-Host "Service Account: $serviceAccountEmail" -ForegroundColor Cyan
Write-Host "Kalender ID: $calendarId" -ForegroundColor Cyan
Write-Host "Service Account Key: $keyPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "Naechste Schritte:" -ForegroundColor Yellow
Write-Host "1. Agent builden: cd agent && dotnet build" -ForegroundColor White
Write-Host "2. Agent installieren: scripts\install-calendar-agent.ps1" -ForegroundColor White
Write-Host "3. Agent starten" -ForegroundColor White
Write-Host ""
Write-Host "Der Agent wird Termine automatisch mit Google Calendar synchronisieren!" -ForegroundColor Green
