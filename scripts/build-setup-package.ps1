# Erstellt dist\AlamidaCalendar-Setup.zip: fertiges Installationspaket fuer PCs ohne .NET SDK.
# Empfaenger: ZIP entpacken -> INSTALLIEREN.bat doppelklicken.
#
#   powershell -ExecutionPolicy Bypass -File scripts\build-setup-package.ps1 [-Version 1.0.0] [-ServiceAccountPath pfad\service-account.json]
#
# -ServiceAccountPath legt den Schluessel mit ins Paket (nur fuer interne Verteilung, ZIP nicht veroeffentlichen!).
param(
    [string] $Version = "",
    [string] $ServiceAccountPath = "",
    [string] $OutputDir = ""
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
if (-not $OutputDir) { $OutputDir = Join-Path $Root 'dist' }
$staging = Join-Path $OutputDir 'setup-package'
$appDir = Join-Path $staging 'app'
$zipPath = Join-Path $OutputDir 'AlamidaCalendar-Setup.zip'

if (-not $Version) {
    $Version = '0.0.0-local'
    try {
        $hash = (git -C $Root rev-parse --short HEAD 2>$null)
        if ($LASTEXITCODE -eq 0 -and $hash) { $Version = "0.0.0+$($hash.Trim())" }
    } catch { }
}

if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $appDir -Force | Out-Null

Write-Host "=== Agent bauen (v$Version) ===" -ForegroundColor Cyan
$proj = Join-Path $Root (Join-Path 'agent' (Join-Path 'Alamida.Calendar.Agent' 'Alamida.Calendar.Agent.csproj'))
dotnet publish $proj -c Release -r win-x64 --self-contained true `
    -p:PublishSingleFile=false -p:EnableWindowsTargeting=true "-p:AgentVersion=$(($Version -split '\+')[0])" `
    -o $appDir | Out-Host
if ($LASTEXITCODE -ne 0) { throw "dotnet publish fehlgeschlagen" }

Set-Content -Path (Join-Path $appDir 'version.txt') -Value $Version -Encoding ASCII -NoNewline
Copy-Item (Join-Path $Root (Join-Path 'docs' 'field-mapping-9.2.1.json')) (Join-Path $appDir 'field-mapping-9.2.1.json') -Force

$utf8Bom = New-Object System.Text.UTF8Encoding $true
foreach ($s in @('install.ps1', 'uninstall.ps1', 'apply-agent-release.ps1')) {
    $text = Get-Content -Path (Join-Path $PSScriptRoot $s) -Raw -Encoding UTF8
    [System.IO.File]::WriteAllText((Join-Path $staging $s), $text, $utf8Bom)
}
Copy-Item (Join-Path $Root 'INSTALLIEREN.bat') $staging -Force
Copy-Item (Join-Path $Root 'DEINSTALLIEREN.bat') $staging -Force
Copy-Item (Join-Path $PSScriptRoot 'GOOGLE-CALENDAR-SETUP.txt') $staging -Force

if ($ServiceAccountPath) {
    Copy-Item $ServiceAccountPath (Join-Path $staging 'service-account.json') -Force
    Write-Host "Service-Account wird mitgeliefert - Paket nur intern weitergeben!" -ForegroundColor Yellow
}

$readme = @(
    "Alamida Kalender Agent - Installation",
    "",
    "1. Diesen Ordner entpacken (nicht direkt aus dem ZIP starten).",
    "2. INSTALLIEREN.bat doppelklicken. Keine Administratorrechte noetig.",
    "",
    "Die Google Service-Account-Datei (JSON) wird automatisch gefunden, wenn sie",
    "neben INSTALLIEREN.bat, im Download-Ordner oder auf dem Desktop liegt.",
    "Sonst fragt der Installer einmal danach (siehe GOOGLE-CALENDAR-SETUP.txt).",
    "",
    "Deinstallation: DEINSTALLIEREN.bat oder Windows 'Apps & Features'.",
    "",
    "Version: $Version"
) -join "`r`n"
[System.IO.File]::WriteAllText((Join-Path $staging 'LIESMICH.txt'), $readme, $utf8Bom)

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
# ZIP selbst schreiben: Compress-Archive (PowerShell 5.1) legt Eintraege mit Backslash an,
# die andere Entpacker nicht als Ordner erkennen.
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$stagingFull = (Resolve-Path -LiteralPath $staging).Path.TrimEnd([IO.Path]::DirectorySeparatorChar)
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    Get-ChildItem -LiteralPath $stagingFull -Recurse -File | ForEach-Object {
        $entryName = $_.FullName.Substring($stagingFull.Length + 1).Replace([IO.Path]::DirectorySeparatorChar, '/')
        [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $entryName, [System.IO.Compression.CompressionLevel]::Optimal)
    }
} finally {
    $zip.Dispose()
}
Remove-Item $staging -Recurse -Force

Write-Host ""
Write-Host "Paket erstellt: $zipPath" -ForegroundColor Green
