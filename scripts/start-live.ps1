# Alamida Monitoring - Live-Betrieb starten
# Aus CMD: scripts\start-live.bat
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent

function Stop-Agent {
    $procs = Get-Process -Name "AlamidaMonitoringAgent" -ErrorAction SilentlyContinue
    if ($procs) {
        $procs | Stop-Process -Force
        Start-Sleep -Seconds 1
        Write-Host "Laufender Agent beendet." -ForegroundColor Yellow
    }
}

Write-Host "=== Alamida Monitoring Live-Start ===" -ForegroundColor Cyan

Stop-Agent

& (Join-Path $PSScriptRoot "setup-complete.ps1")

$exe = Join-Path $Root "agent\Alamida.Monitoring.Agent\bin\Release\net8.0-windows\AlamidaMonitoringAgent.exe"
if (-not (Test-Path $exe)) {
    throw "Agent-EXE fehlt: $exe"
}

# Einmal-Sync ohne dotnet run (sonst DLL-Sperre durch laufenden Agent)
Write-Host "Einmal-Sync (Alamida Detailmaske offen lassen)..." -ForegroundColor Gray
& $exe --sync 2>&1 | Out-Host
$syncExit = $LASTEXITCODE
if ($syncExit -ne 0) {
    Write-Warning "Sync fehlgeschlagen - Agent synct im Hintergrund bei Aenderung."
}

Stop-Agent
Start-Sleep -Milliseconds 500

Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe)
Start-Sleep -Seconds 2
Write-Host "Agent gestartet (Tray-Icon)." -ForegroundColor Green

Write-Host ""
Write-Host "Web:  https://alamida---monitoring.web.app" -ForegroundColor Cyan
Write-Host "Wall: https://alamida---monitoring.web.app/wall" -ForegroundColor Cyan
Write-Host "Agent neu bauen: scripts\restart-agent.bat" -ForegroundColor Gray
Write-Host "Agent beenden: Rechtsklick Tray -> Beenden" -ForegroundColor Gray
