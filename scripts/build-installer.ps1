# Alamida Kalender - Installer erstellen
# Benoetigt Inno Setup (istcc.exe)

$ErrorActionPreference = "Stop"

Write-Host "=== Alamida Kalender Installer erstellen ===" -ForegroundColor Cyan

# 1. Pruefen ob Inno Setup installiert ist
$innoPaths = @(
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles}\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 5\ISCC.exe",
    "${env:ProgramFiles}\Inno Setup 5\ISCC.exe"
)

$innoPath = $null
foreach ($path in $innoPaths) {
    if (Test-Path $path) {
        $innoPath = $path
        break
    }
}

if (-not $innoPath) {
    Write-Host "Inno Setup nicht gefunden!" -ForegroundColor Red
    Write-Host "Bitte installieren Sie Inno Setup: https://jrsoftware.org/isdl.php" -ForegroundColor Yellow
    exit 1
}

Write-Host "Inno Setup gefunden: $innoPath" -ForegroundColor Green

# 2. Zuerst Agent builden
Write-Host "`n=== Agent builden ===" -ForegroundColor Cyan
Set-Location ..\agent
dotnet build --configuration Release

if ($LASTEXITCODE -ne 0) {
    Write-Host "Agent-Build fehlgeschlagen" -ForegroundColor Red
    exit 1
}

# 3. Installer erstellen
Write-Host "`n=== Installer erstellen ===" -ForegroundColor Cyan
Set-Location ..\scripts
$issFile = "AlamidaCalendarInstaller.iss"
$outputDir = "..\dist\installer"

if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

Write-Host "Kompiliere $issFile..." -ForegroundColor Yellow
& $innoPath $issFile

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nInstaller erfolgreich erstellt!" -ForegroundColor Green
    Write-Host "Installationsdatei: $outputDir\AlamidaCalendarAgent-Setup.exe" -ForegroundColor Yellow
} else {
    Write-Host "`nInstaller-Erstellung fehlgeschlagen" -ForegroundColor Red
    exit 1
}
