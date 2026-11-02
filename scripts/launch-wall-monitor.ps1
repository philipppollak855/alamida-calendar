# Desktop-Verknuepfung: Agent-Update pruefen, Agent starten, Wandmonitor oeffnen
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
. (Join-Path $PSScriptRoot 'agent-install-common.ps1')
Invoke-AlamidaWallMonitorLaunch -InstallDir $PSScriptRoot
