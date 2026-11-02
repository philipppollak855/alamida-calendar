# Alamida Kalender Agent - Einfaches Installationsskript
# Ersetzt den komplexen install-wizard.ps1 für Google Calendar

$ErrorActionPreference = "Stop"

Write-Host "=== Alamida Kalender Agent Installation ===" -ForegroundColor Cyan

# 1. Installationsverzeichnis
$installDir = "C:\Program Files\AlamidaCalendar"
Write-Host "Installationsverzeichnis: $installDir" -ForegroundColor Yellow

# 2. ZIP-Datei suchen
$zipPath = ""
$zipOptions = @(
    "AlamidaCalendarAgent-win-x64.zip",
    "AlamidaCalendarAgent.zip"
)

foreach ($zip in $zipOptions) {
    $testPath = Join-Path $PSScriptRoot $zip
    if (Test-Path $testPath) {
        $zipPath = $testPath
        break
    }
}

if (-not $zipPath) {
    Write-Host "ZIP-Datei nicht gefunden im aktuellen Ordner." -ForegroundColor Red
    Write-Host "Bitte fuehren Sie zuerst build-agent-release.ps1 aus." -ForegroundColor Yellow
    exit 1
}

Write-Host "ZIP-Datei gefunden: $zipPath" -ForegroundColor Green

# 3. Google Calendar JSON-Datei
Write-Host "`n=== Google Calendar Setup ===" -ForegroundColor Cyan
Write-Host "Bitte Google Calendar Service Account JSON-Datei waehlen..." -ForegroundColor Yellow

Add-Type -AssemblyName System.Windows.Forms
$ofd = New-Object System.Windows.Forms.OpenFileDialog
$ofd.Filter = "JSON-Dateien (*.json)|*.json|Alle Dateien (*.*)|*.*"
$ofd.Title = "Google Calendar Service Account JSON auswaehlen"
$ofd.InitialDirectory = [Environment]::GetFolderPath('Desktop')

if ($ofd.ShowDialog() -ne 'OK') {
    Write-Host "Abgebrochen." -ForegroundColor Red
    exit 1
}

$credPath = $ofd.FileName
Write-Host "Service Account JSON: $credPath" -ForegroundColor Green

# 4. AppData-Verzeichnis erstellen
$appDataPath = "$env:APPDATA\AlamidaCalendar"
Write-Host "Erstelle AppData-Verzeichnis: $appDataPath" -ForegroundColor Yellow
New-Item -ItemType Directory -Path $appDataPath -Force | Out-Null

# 5. Service Account JSON kopieren
$credDest = "$appDataPath\service-account.json"
Write-Host "Kopiere Service Account JSON nach: $credDest" -ForegroundColor Yellow
Copy-Item $credPath $credDest -Force

# 6. Installationsverzeichnis erstellen
Write-Host "Erstelle Installationsverzeichnis: $installDir" -ForegroundColor Yellow
New-Item -ItemType Directory -Path $installDir -Force | Out-Null

# 7. ZIP entpacken
Write-Host "Entpacke ZIP nach: $installDir" -ForegroundColor Yellow
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $installDir)

# 8. Autostart erstellen
$startupPath = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
$shortcutPath = "$startupPath\AlamidaCalendarAgent.lnk"
$exePath = "$installDir\AlamidaCalendarAgent.exe"

Write-Host "Erstelle Autostart-Verknuepfung..." -ForegroundColor Yellow
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = $exePath
$Shortcut.WorkingDirectory = $installDir
$Shortcut.Save()

# 9. Agent starten
Write-Host "`n=== Installation abgeschlossen ===" -ForegroundColor Green
Write-Host "Agent wird gestartet..." -ForegroundColor Yellow
Start-Process $exePath

Write-Host "`n✓ Alamida Kalender Agent erfolgreich installiert!" -ForegroundColor Green
Write-Host "Agent läuft im Hintergrund (Tray-Icon)." -ForegroundColor Yellow
Write-Host "Für Google Calendar Setup siehe: scripts\GOOGLE-CALENDAR-SETUP.txt" -ForegroundColor Cyan
