# Release-ZIP von GitHub laden und in Installationsordner entpacken (ohne Git)
param(
    [string] $InstallDir = "",
    [string] $GitHubOwner = "philipppollak855",
    [string] $GitHubRepo = "Alamida-Monitoring",
    [string] $AssetFileName = "AlamidaMonitoringAgent-win-x64.zip",
    [switch] $Apply,
    [switch] $CheckOnly
)

$ErrorActionPreference = "Stop"

function Get-LocalVersion {
    param([string] $Dir)
    $versionFile = Join-Path $Dir "version.txt"
    if (Test-Path $versionFile) {
        return (Get-Content $versionFile -Raw).Trim()
    }
    return "0.0.0"
}

function Get-ReleaseVersion {
    param([string] $TagName)
    if ($TagName -match '^agent-v(.+)$') { return $Matches[1] }
    if ($TagName -match '^v(.+)$') { return $Matches[1] }
    return $TagName
}

function Get-VersionParts {
    param([string] $Version)
    $s = $Version.Trim()
    if ($s -match '^agent-v(.+)$') { $s = $Matches[1] }
    elseif ($s -match '^v(.+)$') { $s = $Matches[1] }
    $head = ($s -split '[+-]')[0]
    $parts = [System.Collections.Generic.List[int]]::new()
    foreach ($seg in $head.Split('.')) {
        if ($seg -notmatch '^\d+$') { return @() }
        [void]$parts.Add([int]$seg)
    }
    return $parts.ToArray()
}

function Test-VersionNewer {
    param([string] $Remote, [string] $Local)
    $r = Get-VersionParts $Remote
    $l = Get-VersionParts $Local
    if ($r.Count -eq 0 -or $l.Count -eq 0) {
        return ($Remote -ne $Local)
    }
    $len = [Math]::Max($r.Count, $l.Count)
    for ($i = 0; $i -lt $len; $i++) {
        $ri = if ($i -lt $r.Count) { $r[$i] } else { 0 }
        $li = if ($i -lt $l.Count) { $l[$i] } else { 0 }
        if ($ri -ne $li) { return $ri -gt $li }
    }
    return $false
}

if (-not $InstallDir) {
    $InstallDir = $PSScriptRoot
}
$InstallDir = $InstallDir.Trim().TrimEnd('\')
if (-not (Test-Path -LiteralPath $InstallDir)) {
    throw "Installationsordner nicht gefunden: $InstallDir"
}
$InstallDir = (Get-Item -LiteralPath $InstallDir).FullName

$headers = @{
    "User-Agent" = "AlamidaMonitoring-Agent"
    Accept         = "application/vnd.github+json"
}

$apiUrl = "https://api.github.com/repos/$GitHubOwner/$GitHubRepo/releases/latest"
try {
    $release = Invoke-RestMethod -Uri $apiUrl -Headers $headers -TimeoutSec 60
} catch {
    if ($CheckOnly) { exit 2 }
    throw "GitHub Release nicht abrufbar: $_"
}

$asset = $release.assets | Where-Object { $_.name -eq $AssetFileName } | Select-Object -First 1
if (-not $asset) {
    if ($CheckOnly) { exit 2 }
    throw "Release-Asset nicht gefunden: $AssetFileName"
}

$remoteVersion = Get-ReleaseVersion $release.tag_name
$localVersion = Get-LocalVersion $InstallDir

if (-not (Test-VersionNewer $remoteVersion $localVersion)) {
    if ($CheckOnly) { exit 1 }
    Write-Host "Agent bereits aktuell (lokal $localVersion, Release $remoteVersion)." -ForegroundColor Green
    exit 0
}

if ($CheckOnly) { exit 0 }

if (-not $Apply) {
    Write-Host "Update verfuegbar: $localVersion -> $remoteVersion ($($release.tag_name))" -ForegroundColor Yellow
    exit 0
}

Write-Host "=== Agent-Update $localVersion -> $remoteVersion ===" -ForegroundColor Cyan

Get-Process -Name "AlamidaMonitoringAgent" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) "alamida-agent-update"
$zipPath = Join-Path $tempRoot $AssetFileName
$extractDir = Join-Path $tempRoot "extract"

if (Test-Path $tempRoot) { Remove-Item $tempRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

Write-Host "Download: $($asset.browser_download_url)" -ForegroundColor Gray
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath -UseBasicParsing

if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force }
Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

$settingsBackup = Join-Path $tempRoot "appsettings.backup.json"
$localSettings = Join-Path $InstallDir "appsettings.json"
if (Test-Path $localSettings) {
    Copy-Item $localSettings $settingsBackup -Force
}

Get-ChildItem $extractDir | ForEach-Object {
    Copy-Item $_.FullName $InstallDir -Recurse -Force
}

try {
    Get-ChildItem $InstallDir -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
        Unblock-File -LiteralPath $_.FullName -ErrorAction SilentlyContinue
    }
} catch { }

if (Test-Path $settingsBackup) {
    Copy-Item $settingsBackup $localSettings -Force
}

$exe = Join-Path $InstallDir "AlamidaMonitoringAgent.exe"
if (-not (Test-Path $exe)) {
    throw "EXE nach Update nicht gefunden: $exe"
}

Start-Process -FilePath $exe -WorkingDirectory $InstallDir
Write-Host "Agent aktualisiert und neu gestartet." -ForegroundColor Green
