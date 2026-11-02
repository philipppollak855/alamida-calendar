# Einmal-Setup nach Entpacken (ohne Wizard) - Autostart + Wandmonitor-Verknuepfung
param(
    [string] $InstallDir = "",
    [string] $ServiceAccountPath = ""
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'agent-install-common.ps1')

if (-not $InstallDir) {
    $InstallDir = Read-Host "Installationsordner (Pfad zur AlamidaMonitoringAgent.exe)"
}

$resolved = Resolve-AlamidaInstallDir -Hint $InstallDir
if (-not $resolved) {
    throw "AlamidaMonitoringAgent.exe nicht gefunden unter: $InstallDir"
}

$setup = Initialize-AlamidaAgentSetup -InstallDir $resolved -ServiceAccountSource $ServiceAccountPath
Register-AlamidaWallDesktopShortcut -InstallDir $resolved
Start-AlamidaAgentVerified -InstallDir $resolved

Write-Host "Autostart und Desktop-Verknuepfung erstellt." -ForegroundColor Green
Write-Host "Ordner: $resolved" -ForegroundColor Cyan
if (-not $setup.HasFirebase) {
    Write-Warning "Firebase: serviceAccount.json nach $($setup.CredPath) legen"
}
