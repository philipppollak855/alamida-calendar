# Alamida Kalender - Self-Extracting Installer erstellen
# Verwendet IExpress (Windows-integriert)

$ErrorActionPreference = "Stop"

Write-Host "=== Alamida Kalender Self-Installer erstellen ===" -ForegroundColor Cyan

# 1. Agent builden
Write-Host "`n=== Agent builden ===" -ForegroundColor Cyan
Set-Location ..\agent
dotnet build --configuration Release

if ($LASTEXITCODE -ne 0) {
    Write-Host "Agent-Build fehlgeschlagen" -ForegroundColor Red
    exit 1
}

# 2. Temporaeres Verzeichnis fuer Installer erstellen
$root = Split-Path $PSScriptRoot -Parent
$tempDir = Join-Path $root "dist\installer-temp"
$installDir = Join-Path $tempDir "install"
$outputDir = Join-Path $root "dist\installer"

Write-Host "Erstelle temporaires Verzeichnis: $tempDir" -ForegroundColor Yellow
if (Test-Path $tempDir) {
    Remove-Item $tempDir -Recurse -Force
}
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
New-Item -ItemType Directory -Path $installDir -Force | Out-Null
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

# 3. Dateien kopieren
Write-Host "Kopiere Agent-Dateien..." -ForegroundColor Yellow
$agentReleaseDir = Join-Path $root "agent\Alamida.Calendar.Agent\bin\Release\net8.0-windows"
Copy-Item "$agentReleaseDir\*" $installDir -Recurse -Force

Write-Host "Kopiere Konfigurationsdateien..." -ForegroundColor Yellow
Copy-Item "$root\docs\field-mapping-9.2.1.json" $installDir -Force
Copy-Item "$root\agent\Alamida.Calendar.Agent\appsettings.json" $installDir -Force

# 4. Installationsskript erstellen
$installScript = @"
# Alamida Kalender Agent - Installation
$ErrorActionPreference = "Stop"

Write-Host "=== Alamida Kalender Agent Installation ===" -ForegroundColor Cyan

# Installationsverzeichnis
$installDir = "C:\Program Files\AlamidaCalendar"
Write-Host "Installationsverzeichnis: $installDir" -ForegroundColor Yellow

# Verzeichnis erstellen
New-Item -ItemType Directory -Path $installDir -Force | Out-Null

# Dateien kopieren
Write-Host "Kopiere Dateien..." -ForegroundColor Yellow
Copy-Item "$PSScriptRoot\*" $installDir -Recurse -Force

# AppData-Verzeichnis erstellen
$appDataPath = "$env:APPDATA\AlamidaCalendar"
Write-Host "Erstelle AppData-Verzeichnis: $appDataPath" -ForegroundColor Yellow
New-Item -ItemType Directory -Path $appDataPath -Force | Out-Null

# Konfiguration kopieren
Write-Host "Kopiere Konfiguration..." -ForegroundColor Yellow
Copy-Item "$installDir\appsettings.json" "$appDataPath\appsettings.json" -Force
Copy-Item "$installDir\field-mapping-9.2.1.json" "$appDataPath\field-mapping.json" -Force

# Autostart erstellen
$startupPath = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
$shortcutPath = "$startupPath\AlamidaCalendarAgent.lnk"
$exePath = "$installDir\AlamidaCalendarAgent.exe"

Write-Host "Erstelle Autostart-Verknuepfung..." -ForegroundColor Yellow
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = $exePath
$Shortcut.WorkingDirectory = $installDir
$Shortcut.Save()

# Desktop-Verknuepfung erstellen
$desktopPath = "$env:USERPROFILE\Desktop\AlamidaCalendarAgent.lnk"
$Shortcut = $WshShell.CreateShortcut($desktopPath)
$Shortcut.TargetPath = $exePath
$Shortcut.WorkingDirectory = $installDir
$Shortcut.Save()

Write-Host "`n=== Installation abgeschlossen ===" -ForegroundColor Green
Write-Host "Agent wird gestartet..." -ForegroundColor Yellow
Start-Process $exePath

Write-Host "`nVergessen Sie nicht:" -ForegroundColor Yellow
Write-Host "1. Google Calendar Service Account JSON nach $appDataPath\service-account.json speichern" -ForegroundColor Cyan
Write-Host "2. Kalender in Google Calendar freigeben" -ForegroundColor Cyan
Write-Host "Siehe setup\GOOGLE-CALENDAR-SETUP.txt fuer Details" -ForegroundColor Cyan

Start-Sleep -Seconds 5
"@

$installScript | Out-File -FilePath "$tempDir\install.ps1" -Encoding UTF8

# 5. IExpress-Konfiguration erstellen
$sedFile = @"
[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=1
HideExtractAnimation=1
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=
DisplayLicense=
FinishMessage=
TargetName=AlamidaCalendarAgent-Setup.exe
FriendlyName=Alamida Kalender Agent Setup
AppLaunched=cmd /c install.ps1
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
SourceFiles=SourceFiles
[Strings]
[SourceFiles]
SourceFiles0=$installDir\
[SourceFiles0]
%FILE0%
"@

# Dateien zum SED hinzufuegen
$files = Get-ChildItem $installDir -Recurse
$fileIndex = 0
foreach ($file in $files) {
    $sedFile += "`"$($file.Name)`"=`"$($file.FullName)`"`n"
    $fileIndex++
}

$sedFile | Out-File -FilePath "$tempDir\setup.sed" -Encoding ASCII

# 6. Mit IExpress erstellen
Write-Host "Erstelle Self-Extracting Installer..." -ForegroundColor Yellow
try {
    $iexpress = Join-Path $env:SystemRoot "System32\iexpress.exe"
    & $iexpress /Q "$tempDir\setup.sed"
    
    if (Test-Path "$tempDir\AlamidaCalendarAgent-Setup.exe") {
        Move-Item "$tempDir\AlamidaCalendarAgent-Setup.exe" "$outputDir\" -Force
        Write-Host "`nInstaller erfolgreich erstellt!" -ForegroundColor Green
        Write-Host "Installationsdatei: $outputDir\AlamidaCalendarAgent-Setup.exe" -ForegroundColor Yellow
    } else {
        Write-Host "Installer-Erstellung fehlgeschlagen" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "Fehler bei IExpress: $_" -ForegroundColor Red
    Write-Host "Erstelle stattdessen ZIP-Datei..." -ForegroundColor Yellow
    
    # Fallback: ZIP erstellen
    $zipPath = "$outputDir\AlamidaCalendarAgent-Setup.zip"
    Compress-Archive -Path "$installDir\*" -DestinationPath $zipPath -Force
    Write-Host "ZIP erstellt: $zipPath" -ForegroundColor Yellow
    Write-Host "Bitte entpacken und install.ps1 ausfuehren" -ForegroundColor Yellow
}

# 7. Temporaeres Verzeichnis bereinigen
Write-Host "Bereinige temporaeres Verzeichnis..." -ForegroundColor Yellow
Remove-Item $tempDir -Recurse -Force

Write-Host "`nFertig!" -ForegroundColor Green
