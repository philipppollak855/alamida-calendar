# Lokaler Agent: Release bauen, Field-Mapping + Binaries an alle Watcher-Pfade
param(
    [switch] $SkipBuild,
    [string] $PublishDir = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot "agent-install-common.ps1")

$mappingSrc = Join-Path $Root "docs\field-mapping-9.2.1.json"
if (-not (Test-Path $mappingSrc)) {
    throw "Field-Mapping fehlt: $mappingSrc"
}

if (-not $SkipBuild) {
    & (Join-Path $PSScriptRoot "build-agent-release.ps1")
}

if (-not $PublishDir) {
    $PublishDir = Join-Path $Root "dist\agent-release\publish"
}
$PublishDir = [System.IO.Path]::GetFullPath($PublishDir)
if (-not (Test-Path (Join-Path $PublishDir "AlamidaMonitoringAgent.exe"))) {
    $fallback = Join-Path $Root "agent\dist\agent-release-new\publish"
    if (Test-Path (Join-Path $fallback "AlamidaMonitoringAgent.exe")) {
        $PublishDir = $fallback
        Write-Host "Publish-Fallback: $PublishDir" -ForegroundColor Yellow
    } else {
        throw "Release-Publish fehlt: $PublishDir. Zuerst build-agent-release.ps1 ausfuehren."
    }
}

$appData = Get-AlamidaAppDataDir
$syncCache = Join-Path $appData "sterbefall-sync-cache.json"
if (Test-Path $syncCache) {
    Remove-Item $syncCache -Force
    Write-Host "Sync-Cache geleert (Voll-Sync beim naechsten Lauf)." -ForegroundColor Yellow
}
$mappingTargets = @(
    (Join-Path $appData "field-mapping-9.2.1.json"),
    (Join-Path $PublishDir "field-mapping-9.2.1.json")
)

$devBin = Join-Path $Root "agent\Alamida.Monitoring.Agent\bin\Release\net8.0-windows\win-x64"
if (Test-Path $devBin) {
    $mappingTargets += (Join-Path $devBin "field-mapping-9.2.1.json")
}

foreach ($dst in $mappingTargets) {
    $dir = Split-Path $dst -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    Copy-Item $mappingSrc $dst -Force
    Write-Host "Mapping: $dst" -ForegroundColor Gray
}

$installDir = Resolve-AlamidaInstallDir
if ($installDir) {
    Write-Host "=== Install-Ordner: $installDir ===" -ForegroundColor Cyan
    Get-Process -Name "AlamidaMonitoringAgent" -ErrorAction SilentlyContinue | ForEach-Object {
        try { Stop-Process -Id $_.Id -Force -ErrorAction Stop } catch {
            Write-Warning "Agent (PID $($_.Id)) nicht beendet - ggf. Task-Manager (als Admin)."
        }
    }
    Start-Sleep -Milliseconds 800

    Get-ChildItem $PublishDir -Force | ForEach-Object {
        Copy-Item $_.FullName $installDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    Copy-Item $mappingSrc (Join-Path $installDir "field-mapping-9.2.1.json") -Force
    Unblock-AlamidaPath $installDir
    Initialize-AlamidaAgentSetup -InstallDir $installDir | Out-Null

    $exe = Join-Path $installDir "AlamidaMonitoringAgent.exe"
    if (Test-Path $exe) {
        Start-Process -FilePath $exe -WorkingDirectory $installDir
        Write-Host "Agent gestartet: $installDir" -ForegroundColor Green
    }
} else {
    Write-Host "Kein Install-Ordner (C:\AlamidaMonitoring) - nur Mapping + Publish aktualisiert." -ForegroundColor Yellow
    $devExe = Join-Path $devBin "AlamidaMonitoringAgent.exe"
    if (Test-Path $devExe) {
        Get-Process -Name "AlamidaMonitoringAgent" -ErrorAction SilentlyContinue | ForEach-Object {
            try { Stop-Process -Id $_.Id -Force -ErrorAction Stop } catch { }
        }
        Start-Sleep -Milliseconds 500
        Get-ChildItem $PublishDir -Force | ForEach-Object {
            Copy-Item $_.FullName $devBin -Recurse -Force -ErrorAction SilentlyContinue
        }
        Start-Process -FilePath $devExe -WorkingDirectory $devBin
        Write-Host "Dev-Agent gestartet: $devBin" -ForegroundColor Green
    }
}

Write-Host "Publish: $PublishDir" -ForegroundColor Green
Write-Host "Watcher nutzt field-mapping aus Install-Ordner oder %AppData%\AlamidaMonitoring" -ForegroundColor Green
