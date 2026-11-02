# Agent stoppen, neu bauen, neu starten (nach Code-Aenderungen)
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent

Write-Host "=== Agent neu starten ===" -ForegroundColor Cyan

Get-Process -Name "AlamidaMonitoringAgent" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

Push-Location (Join-Path $Root "agent")
dotnet build -c Release | Out-Host
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Build fehlgeschlagen" }
Pop-Location

$exe = Join-Path $Root "agent\Alamida.Monitoring.Agent\bin\Release\net8.0-windows\AlamidaMonitoringAgent.exe"
Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe)
Write-Host "Agent neu gestartet." -ForegroundColor Green
