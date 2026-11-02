# Git-Update + Build + Neustart des Alamida-Monitoring-Agents
param(
    [string] $RepoRoot = "",
    [string] $Branch = "main",
    [switch] $Apply,
    [switch] $CheckOnly
)

$ErrorActionPreference = "Stop"

if (-not $RepoRoot) {
    $RepoRoot = Split-Path $PSScriptRoot -Parent
}
$RepoRoot = (Resolve-Path $RepoRoot).Path

function Invoke-Git {
    param([string[]] $GitArgs)
    $out = & git -C $RepoRoot @GitArgs 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw ($out | Out-String).Trim()
    }
    return ($out | Out-String).Trim()
}

function Test-GitAvailable {
    try {
        $null = Get-Command git -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

if (-not (Test-GitAvailable)) {
    if ($CheckOnly) { exit 2 }
    Write-Error "git nicht im PATH."
}

if (-not (Test-Path (Join-Path $RepoRoot ".git"))) {
    if ($CheckOnly) { exit 2 }
    Write-Error "Kein Git-Repository: $RepoRoot"
}

try {
    Invoke-Git @("fetch", "origin", $Branch, "--quiet") | Out-Null
} catch {
    if ($CheckOnly) { exit 2 }
    throw
}

$local = Invoke-Git @("rev-parse", "HEAD")
$remoteRef = "origin/$Branch"
$remote = Invoke-Git @("rev-parse", $remoteRef)

if ($local -eq $remote) {
    if ($CheckOnly) { exit 1 }
    Write-Host "Agent bereits aktuell ($($local.Substring(0, [Math]::Min(7, $local.Length))))." -ForegroundColor Green
    exit 0
}

if ($CheckOnly) { exit 0 }

if (-not $Apply) {
    Write-Host "Update verfuegbar: $local -> $remote" -ForegroundColor Yellow
    Write-Host "Zum Anwenden: update-agent.ps1 -Apply" -ForegroundColor Gray
    exit 0
}

Write-Host "=== Agent-Update ($Branch) ===" -ForegroundColor Cyan
Write-Host "Lokal:  $local" -ForegroundColor Gray
Write-Host "Remote: $remote" -ForegroundColor Gray

Get-Process -Name "AlamidaMonitoringAgent" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

Invoke-Git @("pull", "--ff-only", "origin", $Branch) | Out-Host

Push-Location (Join-Path $RepoRoot "agent")
dotnet build -c Release | Out-Host
if ($LASTEXITCODE -ne 0) {
    Pop-Location
    throw "Build fehlgeschlagen"
}
Pop-Location

$exe = Join-Path $RepoRoot "agent\Alamida.Monitoring.Agent\bin\Release\net8.0-windows\AlamidaMonitoringAgent.exe"
if (-not (Test-Path $exe)) {
    throw "EXE nicht gefunden: $exe"
}

Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe)
Write-Host "Agent aktualisiert und neu gestartet." -ForegroundColor Green
