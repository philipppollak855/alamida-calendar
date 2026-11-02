# Portable Agent-Release (ZIP, self-contained, kein Git auf Ziel-PCs)
param(
    [string] $Version = "",
    [string] $OutputDir = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$AgentProj = Join-Path $Root "agent\Alamida.Calendar.Agent\Alamida.Calendar.Agent.csproj"

function Write-InstallerPs1Utf8Bom {
    param([string] $SourcePath, [string] $DestPath)
    $text = Get-Content -Path $SourcePath -Raw -Encoding UTF8
    $utf8Bom = New-Object System.Text.UTF8Encoding $true
    [System.IO.File]::WriteAllText($DestPath, $text, $utf8Bom)
}

if (-not $Version) {
    try {
        $hash = (git -C $Root rev-parse --short HEAD 2>$null).Trim()
        if ($hash) { $Version = "0.0.0+$hash" }
    } catch { }
    if (-not $Version) {
        $Version = "0.0.0-local"
    }
}

if (-not $OutputDir) {
    $OutputDir = Join-Path $Root "dist\agent-release"
}
if (-not [System.IO.Path]::IsPathRooted($OutputDir)) {
    $OutputDir = Join-Path $Root $OutputDir
}
$OutputDir = [System.IO.Path]::GetFullPath($OutputDir)

$publishDir = Join-Path $OutputDir "publish"
$zipName = "AlamidaCalendarAgent-win-x64.zip"
$zipPath = Join-Path $OutputDir $zipName

Get-Process -Name "AlamidaCalendarAgent" -ErrorAction SilentlyContinue | ForEach-Object {
    $proc = $_
    try {
        Stop-Process -Id $proc.Id -Force -ErrorAction Stop
    } catch {
        Write-Warning "AlamidaCalendarAgent (PID $($proc.Id)) konnte nicht beendet werden."
    }
}
Start-Sleep -Milliseconds 500

if (Test-Path $OutputDir) {
    try {
        Remove-Item $OutputDir -Recurse -Force -ErrorAction Stop
    } catch {
        Write-Warning "Ausgabeordner gesperrt - publish wird ueberschrieben: $OutputDir"
        if (Test-Path $publishDir) {
            Get-ChildItem $publishDir -Force -ErrorAction SilentlyContinue | ForEach-Object {
                Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    }
}
New-Item -ItemType Directory -Force -Path $publishDir | Out-Null

Write-Host "=== Agent Release v$Version ===" -ForegroundColor Cyan

Push-Location (Join-Path $Root "agent")
dotnet publish $AgentProj `
    -c Release `
    -r win-x64 `
    --self-contained true `
    -p:PublishSingleFile=false `
    -p:AgentVersion=$Version `
    -o $publishDir | Out-Host
if ($LASTEXITCODE -ne 0) {
    Pop-Location
    throw "dotnet publish fehlgeschlagen"
}
Pop-Location

$versionLine = ($Version -split '\+')[0]
Set-Content -Path (Join-Path $publishDir "version.txt") -Value $versionLine -Encoding ASCII -NoNewline

$appsettingsRelease = Join-Path $publishDir "appsettings.json"
if (Test-Path $appsettingsRelease) {
    $json = Get-Content $appsettingsRelease -Raw | ConvertFrom-Json
    if (-not $json.AutoUpdate) { $json | Add-Member -NotePropertyName AutoUpdate -NotePropertyValue (@{}) }
    $json.AutoUpdate.Enabled = $true
    $json.AutoUpdate.CheckOnStartup = $false
    $json.AutoUpdate.Mode = "release"
    $json.AutoUpdate.GitHubOwner = "philipppollak855"
    $json.AutoUpdate.GitHubRepo = "Alamida-Monitoring"
    $json.AutoUpdate.AssetFileName = $zipName
    $json | ConvertTo-Json -Depth 6 | Set-Content $appsettingsRelease -Encoding UTF8
}

Copy-Item (Join-Path $Root "docs\field-mapping-9.2.1.json") (Join-Path $publishDir "field-mapping-9.2.1.json") -Force
$scriptFiles = @(
    "apply-agent-release.ps1",
    "agent-install-common.ps1",
    "launch-wall-monitor.ps1"
)
foreach ($sf in $scriptFiles) {
    Write-InstallerPs1Utf8Bom (Join-Path $Root "scripts\$sf") (Join-Path $publishDir $sf)
}

$installerDir = Join-Path $OutputDir "installer"
New-Item -ItemType Directory -Force -Path $installerDir | Out-Null
$installerFiles = @(
    "install-wizard.ps1",
    "install-wizard.bat",
    "agent-install-common.ps1",
    "launch-wall-monitor.ps1",
    "apply-agent-release.ps1",
    "FIREBASE-SETUP.txt"
)
foreach ($inf in $installerFiles) {
    $src = Join-Path $Root "scripts\$inf"
    $dst = Join-Path $installerDir $inf
    if ($inf.EndsWith('.ps1')) {
        Write-InstallerPs1Utf8Bom $src $dst
    } else {
        Copy-Item $src $dst -Force
    }
}
Copy-Item (Join-Path $Root "scripts\START-HIER.bat") (Join-Path $installerDir "START-HIER.bat") -Force
Copy-Item (Join-Path $Root "scripts\START-HIER.txt") (Join-Path $installerDir "START-HIER.txt") -Force

$readmeInstaller = @(
    "Alamida Monitoring - Installation (Windows)",
    "",
    "*** START-HIER.bat doppelklicken ***",
    "",
    "Dieses Paket enthaelt KEINE fertige EXE im Ordner!",
    "Der Wizard installiert nach C:\AlamidaMonitoring\",
    "",
    "- START-HIER.bat oder install-wizard.bat",
    "- Agent-ZIP: AlamidaMonitoringAgent-win-x64.zip (liegt in diesem Ordner)",
    "- serviceAccount.json waehlen (FIREBASE-SETUP.txt)",
    "",
    "Version: $versionLine"
) -join [Environment]::NewLine
Set-Content -Path (Join-Path $installerDir "README.txt") -Value $readmeInstaller -Encoding UTF8

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $publishDir "*") -DestinationPath $zipPath -Force

# Agent-ZIP mit in den Installer legen (Offline-Installation ohne erneuten Download)
Copy-Item $zipPath (Join-Path $installerDir $zipName) -Force

$installerZip = Join-Path $OutputDir "AlamidaMonitoring-Installer.zip"
if (Test-Path $installerZip) { Remove-Item $installerZip -Force }
Compress-Archive -Path (Join-Path $installerDir "*") -DestinationPath $installerZip -Force

Write-Host "Version:  $versionLine" -ForegroundColor Green
Write-Host "Ordner:   $publishDir" -ForegroundColor Green
Write-Host "ZIP:      $zipPath" -ForegroundColor Green
Write-Host "Wizard:   $(Join-Path $installerDir 'install-wizard.bat')" -ForegroundColor Green
Write-Host "Bundle:   $installerZip" -ForegroundColor Green
# Release tag on GitHub: agent-v{run} via .github/workflows/agent-release.yml
