# Alamida Kalender Agent - Deinstallation (Gegenstueck zu install.ps1)
param(
    [switch] $Silent,
    [switch] $RemoveConfig
)

$ErrorActionPreference = 'Stop'
$AppName      = 'Alamida Kalender Agent'
$InstallDir   = Join-Path $env:LOCALAPPDATA 'Programs\AlamidaCalendar'
$ConfigDir    = Join-Path $env:APPDATA 'AlamidaCalendar'
$WorkDir      = Join-Path $env:LOCALAPPDATA 'AlamidaCalendar'
$UninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\AlamidaCalendarAgent'
$RunKey       = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'

Add-Type -AssemblyName System.Windows.Forms

# Skript liegt im Installationsordner -> Kopie aus %TEMP% starten, damit der Ordner geloescht werden kann
if ($PSCommandPath -and $PSCommandPath.StartsWith($InstallDir, [StringComparison]::OrdinalIgnoreCase)) {
    $tmp = Join-Path $env:TEMP 'AlamidaCalendar-uninstall.ps1'
    Copy-Item -LiteralPath $PSCommandPath -Destination $tmp -Force
    $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$tmp`"")
    if ($Silent) { $argList += '-Silent' }
    if ($RemoveConfig) { $argList += '-RemoveConfig' }
    Start-Process powershell.exe -ArgumentList $argList -WindowStyle Hidden
    exit 0
}

if (-not $Silent) {
    $answer = [System.Windows.Forms.MessageBox]::Show("$AppName wirklich deinstallieren?", $AppName, 'YesNo', 'Question')
    if ($answer -ne 'Yes') { exit 0 }
    if (-not $RemoveConfig) {
        $answer = [System.Windows.Forms.MessageBox]::Show(
            "Auch die Konfiguration loeschen (Service-Account, Kalender-ID, Logs)?`n`n$ConfigDir`n`n'Nein' behaelt sie fuer eine spaetere Neuinstallation.",
            $AppName, 'YesNo', 'Question')
        $RemoveConfig = ($answer -eq 'Yes')
    }
}

Get-Process -Name 'AlamidaCalendarAgent' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
# Noch laufende Prozesse des heruntergeladenen .NET SDK (z.B. MSBuild-Knoten) sperren sonst den Arbeitsordner
foreach ($proc in @(Get-Process -ErrorAction SilentlyContinue)) {
    try {
        $exe = $proc.Path
        if ($exe -and $exe.StartsWith($WorkDir + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        }
    } catch { }
}
Start-Sleep -Seconds 1

Remove-ItemProperty -Path $RunKey -Name 'AlamidaCalendarAgent' -ErrorAction SilentlyContinue
Remove-Item -Path $UninstallKey -Recurse -Force -ErrorAction SilentlyContinue
$shortcuts = @(
    (Join-Path ([Environment]::GetFolderPath('Programs')) 'Alamida Kalender'),
    (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Alamida Kalender Agent.lnk'),
    (Join-Path ([Environment]::GetFolderPath('Desktop')) 'AlamidaCalendarAgent.lnk'),
    (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\AlamidaCalendarAgent.lnk')
)
foreach ($s in $shortcuts) { Remove-Item -LiteralPath $s -Recurse -Force -ErrorAction SilentlyContinue }

Remove-Item -LiteralPath $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
# Arbeitsordner des Installers (Build, Download, ggf. heruntergeladenes .NET SDK)
Remove-Item -LiteralPath $WorkDir -Recurse -Force -ErrorAction SilentlyContinue
if ($RemoveConfig) { Remove-Item -LiteralPath $ConfigDir -Recurse -Force -ErrorAction SilentlyContinue }

if (-not $Silent) {
    [void][System.Windows.Forms.MessageBox]::Show("$AppName wurde deinstalliert.", $AppName, 'OK', 'Information')
}
