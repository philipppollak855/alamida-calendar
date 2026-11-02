# Alamida Kalender Agent - Ein-Klick-Installation (ohne Administratorrechte)
#
# Aufruf: INSTALLIEREN.bat doppelklicken
#   oder: powershell -ExecutionPolicy Bypass -File install.ps1 [-ServiceAccountPath x.json] [-CalendarId id] [-Silent]
#   oder ohne Download:
#         powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/philipppollak855/alamida-calendar/master/scripts/install.ps1 | iex"
#
# Ablauf:
#   1. Agent-Dateien beschaffen (fertiges Paket "app\", sonst aus dem Quellcode bauen;
#      das .NET 8 SDK wird bei Bedarf automatisch heruntergeladen)
#   2. Nach %LOCALAPPDATA%\Programs\AlamidaCalendar installieren
#   3. Konfiguration in %APPDATA%\AlamidaCalendar anlegen (bestehende Einstellungen bleiben erhalten)
#   4. Service-Account-JSON automatisch finden (oder einmal auswaehlen)
#   5. Autostart, Startmenue-/Desktop-Verknuepfung, Eintrag unter "Apps & Features"
#   6. Agent starten
param(
    [string] $ServiceAccountPath = "",
    [string] $CalendarId = "",
    [switch] $Silent,
    [switch] $NoStart
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$AppName      = 'Alamida Kalender Agent'
$ExeName      = 'AlamidaCalendarAgent.exe'
$ProcessName  = 'AlamidaCalendarAgent'
$GitHubOwner  = 'philipppollak855'
$GitHubRepo   = 'alamida-calendar'
$GitHubBranch = 'master'
$InstallDir   = Join-Path $env:LOCALAPPDATA 'Programs\AlamidaCalendar'
$ConfigDir    = Join-Path $env:APPDATA 'AlamidaCalendar'
$WorkDir      = Join-Path $env:LOCALAPPDATA 'AlamidaCalendar'
$UninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\AlamidaCalendarAgent'
$RunKey       = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function Write-Step([string] $Text) { Write-Host ""; Write-Host "=== $Text ===" -ForegroundColor Cyan }
function Write-Ok([string] $Text) { Write-Host "  OK  $Text" -ForegroundColor Green }
function Write-Info([string] $Text) { Write-Host "      $Text" }
function Write-Warn([string] $Text) { Write-Host "  !!  $Text" -ForegroundColor Yellow }

function Show-Message([string] $Text, [string] $Icon = 'Information') {
    if ($Silent) { return }
    [void][System.Windows.Forms.MessageBox]::Show($Text, $AppName, 'OK', $Icon)
}

# Eigenes Eingabefenster statt InputBox: bleibt im Vordergrund, auch wenn kurz vorher der Browser geoeffnet wurde
function Show-InputDialog([string] $Prompt) {
    $form = New-Object System.Windows.Forms.Form
    $form.Text = $AppName
    $form.FormBorderStyle = 'FixedDialog'
    $form.StartPosition = 'CenterScreen'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.TopMost = $true
    $form.AutoSize = $true
    $form.AutoSizeMode = 'GrowAndShrink'
    $form.Padding = New-Object System.Windows.Forms.Padding 12
    $label = New-Object System.Windows.Forms.Label
    $label.Text = $Prompt
    $label.AutoSize = $true
    $label.MaximumSize = New-Object System.Drawing.Size 520, 0
    $label.Location = New-Object System.Drawing.Point 12, 12
    $form.Controls.Add($label)
    $y = $label.PreferredSize.Height + 24
    $box = New-Object System.Windows.Forms.TextBox
    $box.Location = New-Object System.Drawing.Point 12, $y
    $box.Width = 520
    $form.Controls.Add($box)
    $ok = New-Object System.Windows.Forms.Button
    $ok.Text = 'OK'
    $ok.DialogResult = 'OK'
    $ok.Location = New-Object System.Drawing.Point 352, ($y + 36)
    $form.Controls.Add($ok)
    $cancel = New-Object System.Windows.Forms.Button
    $cancel.Text = 'Abbrechen'
    $cancel.DialogResult = 'Cancel'
    $cancel.Location = New-Object System.Drawing.Point 444, ($y + 36)
    $form.Controls.Add($cancel)
    $form.AcceptButton = $ok
    $form.CancelButton = $cancel
    $form.Add_Shown({ $form.Activate(); $box.Focus() })
    try {
        if ($form.ShowDialog() -eq 'OK') { return $box.Text }
        return ''
    } finally { $form.Dispose() }
}

function Set-JsonProperty($Object, [string] $Name, $Value) {
    if ($Object.PSObject.Properties[$Name]) { $Object.$Name = $Value }
    else { $Object | Add-Member -NotePropertyName $Name -NotePropertyValue $Value }
}

function Get-JsonProperty($Object, [string] $Name) {
    if ($null -ne $Object -and $Object.PSObject.Properties[$Name]) { return $Object.$Name }
    return $null
}

function Test-ServiceAccountFile([string] $Path) {
    if (-not $Path -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    try {
        $j = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
        return ($j.type -eq 'service_account' -and $j.client_email -and $j.private_key)
    } catch { return $false }
}

function Remove-DirectoryWithRetry([string] $Path) {
    for ($i = 0; $i -lt 10; $i++) {
        if (-not (Test-Path -LiteralPath $Path)) { return }
        try { Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop; return }
        catch { Start-Sleep -Milliseconds 500 }
    }
    throw "Ordner konnte nicht geloescht werden (Datei in Verwendung?): $Path"
}

function Stop-Agent {
    $procs = @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue)
    if ($procs.Count -eq 0) { return }
    Write-Info "Beende laufenden Agent..."
    $procs | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

function New-Shortcut([string] $Path, [string] $Target, [string] $WorkingDir, [string] $Description) {
    $dir = Split-Path $Path -Parent
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $shell = New-Object -ComObject WScript.Shell
    $lnk = $shell.CreateShortcut($Path)
    $lnk.TargetPath = $Target
    $lnk.WorkingDirectory = $WorkingDir
    $lnk.Description = $Description
    $lnk.IconLocation = "$Target,0"
    $lnk.Save()
}

# ---------------------------------------------------------------------------
# Quelle bestimmen: fertiges Paket, Repository-Checkout oder Download von GitHub
# ---------------------------------------------------------------------------
function Get-SourceRoot {
    if ($PSScriptRoot) {
        if (Test-Path -LiteralPath (Join-Path $PSScriptRoot "app\$ExeName")) {
            return @{ Kind = 'package'; Root = $PSScriptRoot }
        }
        $repo = Split-Path $PSScriptRoot -Parent
        if (Test-Path -LiteralPath (Join-Path $repo 'agent\Alamida.Calendar.Agent\Alamida.Calendar.Agent.csproj')) {
            return @{ Kind = 'repo'; Root = $repo }
        }
    }

    Write-Info "Lade Quellcode von GitHub ($GitHubOwner/$GitHubRepo)..."
    $dlDir = Join-Path $WorkDir 'download'
    Remove-DirectoryWithRetry $dlDir
    New-Item -ItemType Directory -Path $dlDir -Force | Out-Null
    $zip = Join-Path $dlDir 'source.zip'
    Invoke-WebRequest -UseBasicParsing -Uri "https://codeload.github.com/$GitHubOwner/$GitHubRepo/zip/refs/heads/$GitHubBranch" -OutFile $zip
    Expand-Archive -LiteralPath $zip -DestinationPath $dlDir -Force
    $root = Get-ChildItem -LiteralPath $dlDir -Directory | Select-Object -First 1
    if (-not $root) { throw "Download von GitHub fehlgeschlagen." }
    return @{ Kind = 'repo'; Root = $root.FullName }
}

function Get-DotnetSdk {
    $dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
    if ($dotnet) {
        $sdks = & $dotnet.Source --list-sdks 2>$null
        if ($sdks | Where-Object { $_ -match '^(8|9|10)\.' }) { return $dotnet.Source }
    }
    $localDotnet = Join-Path $WorkDir 'dotnet\dotnet.exe'
    if (Test-Path -LiteralPath $localDotnet) {
        $sdks = & $localDotnet --list-sdks 2>$null
        if ($sdks | Where-Object { $_ -match '^8\.' }) { return $localDotnet }
    }

    Write-Info ".NET 8 SDK nicht gefunden - wird einmalig heruntergeladen (ca. 200 MB, keine Adminrechte noetig)..."
    New-Item -ItemType Directory -Path $WorkDir -Force | Out-Null
    $installer = Join-Path $WorkDir 'dotnet-install.ps1'
    Invoke-WebRequest -UseBasicParsing -Uri 'https://dot.net/v1/dotnet-install.ps1' -OutFile $installer
    & $installer -Channel 8.0 -InstallDir (Join-Path $WorkDir 'dotnet') -NoPath | Out-Host
    if (-not (Test-Path -LiteralPath $localDotnet)) { throw ".NET SDK Installation fehlgeschlagen." }
    return $localDotnet
}

function Build-Agent([string] $RepoRoot) {
    $dotnet = Get-DotnetSdk
    $env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
    $env:DOTNET_NOLOGO = '1'
    $out = Join-Path $WorkDir 'build'
    Remove-DirectoryWithRetry $out
    $proj = Join-Path $RepoRoot 'agent\Alamida.Calendar.Agent\Alamida.Calendar.Agent.csproj'
    Write-Info "Baue Agent (dauert beim ersten Mal 1-3 Minuten)..."
    & $dotnet publish $proj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=false -o $out | Out-Host
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $out $ExeName))) {
        throw "Build fehlgeschlagen (dotnet publish, Exit-Code $LASTEXITCODE)."
    }

    $version = '0.0.0-local'
    if (Get-Command git -ErrorAction SilentlyContinue) {
        try {
            $hash = (& git -C $RepoRoot rev-parse --short HEAD 2>$null)
            if ($LASTEXITCODE -eq 0 -and $hash) { $version = "0.0.0+$($hash.Trim())" }
        } catch { }
    }
    Set-Content -LiteralPath (Join-Path $out 'version.txt') -Value $version -Encoding ASCII -NoNewline
    Copy-Item -LiteralPath (Join-Path $RepoRoot 'docs\field-mapping-9.2.1.json') -Destination (Join-Path $out 'field-mapping-9.2.1.json') -Force
    return $out
}

# ---------------------------------------------------------------------------
# Service Account / Kalender
# ---------------------------------------------------------------------------
function Find-ServiceAccount([string[]] $SearchDirs) {
    if ($ServiceAccountPath) {
        if (Test-ServiceAccountFile $ServiceAccountPath) { return (Resolve-Path -LiteralPath $ServiceAccountPath).Path }
        throw "Ungueltige Service-Account-Datei: $ServiceAccountPath"
    }

    $existing = Join-Path $ConfigDir 'service-account.json'
    if (Test-ServiceAccountFile $existing) { return $existing }

    foreach ($dir in $SearchDirs) {
        if (-not $dir -or -not (Test-Path -LiteralPath $dir)) { continue }
        $hit = Get-ChildItem -LiteralPath $dir -Filter '*.json' -File -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending |
            Where-Object { Test-ServiceAccountFile $_.FullName } |
            Select-Object -First 1
        if ($hit) { return $hit.FullName }
    }

    if ($Silent) { return $null }

    Show-Message ("Fuer die Verbindung zu Google Kalender wird die Service-Account-Datei (JSON) benoetigt.`n`n" +
        "Bitte im naechsten Fenster die heruntergeladene JSON-Datei auswaehlen.`n" +
        "(Anleitung: scripts\GOOGLE-CALENDAR-SETUP.txt)")
    $ofd = New-Object System.Windows.Forms.OpenFileDialog
    $ofd.Filter = 'Service-Account (*.json)|*.json|Alle Dateien (*.*)|*.*'
    $ofd.Title = 'Google Service-Account JSON auswaehlen'
    $ofd.InitialDirectory = Join-Path $env:USERPROFILE 'Downloads'
    while ($ofd.ShowDialog() -eq 'OK') {
        if (Test-ServiceAccountFile $ofd.FileName) { return $ofd.FileName }
        Show-Message "Die gewaehlte Datei ist kein Google Service-Account-Schluessel. Bitte erneut waehlen." 'Warning'
    }
    return $null
}

function Resolve-CalendarId([string] $Current, [string] $ServiceAccountEmail) {
    if ($CalendarId) { return $CalendarId }
    if ($Current -and $Current -ne 'primary') { return $Current }
    if ($Silent) {
        if ($Current) { return $Current }
        return 'primary'
    }

    if ($ServiceAccountEmail) {
        try { Set-Clipboard -Value $ServiceAccountEmail } catch { }
        Start-Process 'https://calendar.google.com/calendar/r/settings'
    }
    $prompt = "Letzter Schritt: Google Kalender freigeben.`n`n" +
        "1. In Google Kalender (wurde geoeffnet) links den Kalender waehlen > 'Fuer bestimmte Personen freigeben'.`n" +
        "2. Diese Adresse hinzufuegen (bereits in der Zwischenablage, mit Strg+V einfuegen):`n   $ServiceAccountEmail`n" +
        "   Berechtigung: 'Aenderungen an Terminen vornehmen'.`n" +
        "3. Unter 'Kalender integrieren' die Kalender-ID kopieren und hier einfuegen`n   (z.B. ihr.name@gmail.com):"
    $id = Show-InputDialog $prompt
    if ([string]::IsNullOrWhiteSpace($id)) { return 'primary' }
    return $id.Trim()
}

# ---------------------------------------------------------------------------
# Installation
# ---------------------------------------------------------------------------
New-Item -ItemType Directory -Path $ConfigDir -Force | Out-Null
New-Item -ItemType Directory -Path $WorkDir -Force | Out-Null
$logPath = Join-Path $ConfigDir 'install.log'
try { Start-Transcript -Path $logPath -Force | Out-Null } catch { }

try {
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "  $AppName - Installation" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan

    Write-Step "1/5 Agent-Dateien vorbereiten"
    $source = Get-SourceRoot
    if ($source.Kind -eq 'package') {
        $appSource = Join-Path $source.Root 'app'
        Write-Ok "Fertiges Installationspaket gefunden"
    } else {
        Write-Info "Quellcode: $($source.Root)"
        $appSource = Build-Agent $source.Root
        Write-Ok "Agent gebaut"
    }

    Write-Step "2/5 Installieren nach $InstallDir"
    Stop-Agent
    Remove-DirectoryWithRetry $InstallDir
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    Copy-Item -Path (Join-Path $appSource '*') -Destination $InstallDir -Recurse -Force
    foreach ($s in @('uninstall.ps1', 'apply-agent-release.ps1')) {
        $candidates = @()
        if ($PSScriptRoot) { $candidates += (Join-Path $PSScriptRoot $s) }
        $candidates += (Join-Path $source.Root "scripts\$s")
        $found = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
        if ($found) { Copy-Item -LiteralPath $found -Destination (Join-Path $InstallDir $s) -Force }
    }
    Get-ChildItem -LiteralPath $InstallDir -Recurse -File | Unblock-File -ErrorAction SilentlyContinue
    $exePath = Join-Path $InstallDir $ExeName
    if (-not (Test-Path -LiteralPath $exePath)) { throw "$ExeName fehlt nach dem Kopieren." }
    Write-Ok "Dateien kopiert"

    Write-Step "3/5 Konfiguration ($ConfigDir)"
    $mappingSrc = Join-Path $InstallDir 'field-mapping-9.2.1.json'
    if (Test-Path -LiteralPath $mappingSrc) {
        Copy-Item -LiteralPath $mappingSrc -Destination (Join-Path $ConfigDir 'field-mapping.json') -Force
        Write-Ok "Field-Mapping aktualisiert"
    }

    $searchDirs = @()
    if ($PSScriptRoot) { $searchDirs += $PSScriptRoot; $searchDirs += (Split-Path $PSScriptRoot -Parent) }
    $searchDirs += $source.Root
    $searchDirs += (Join-Path $env:USERPROFILE 'Downloads')
    $searchDirs += [Environment]::GetFolderPath('Desktop')
    $saSource = Find-ServiceAccount ($searchDirs | Select-Object -Unique)
    $saDest = Join-Path $ConfigDir 'service-account.json'
    $saEmail = $null
    if ($saSource) {
        if ((Resolve-Path -LiteralPath $saSource).Path -ne $saDest) { Copy-Item -LiteralPath $saSource -Destination $saDest -Force }
        $saEmail = (Get-Content -LiteralPath $saDest -Raw -Encoding UTF8 | ConvertFrom-Json).client_email
        Write-Ok "Service-Account: $saEmail"
        Write-Info "(Quelle: $saSource)"
    } else {
        Write-Warn "Keine Service-Account-Datei - der Agent kann erst nach dem Hinterlegen synchronisieren."
        Write-Warn "Datei spaeter nach $saDest kopieren oder INSTALLIEREN.bat erneut starten."
    }

    $settingsPath = Join-Path $ConfigDir 'appsettings.json'
    $settings = $null
    if (Test-Path -LiteralPath $settingsPath) {
        try { $settings = Get-Content -LiteralPath $settingsPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { $settings = $null }
    }
    if (-not $settings) { $settings = New-Object PSObject }
    Set-JsonProperty $settings 'ServiceAccountPath' '%AppData%\AlamidaCalendar\service-account.json'
    Set-JsonProperty $settings 'FieldMappingPath' '%AppData%\AlamidaCalendar\field-mapping.json'
    $ws = Get-JsonProperty $settings 'WorkstationId'
    if (-not $ws -or $ws -eq 'PC-ALAMIDA') { Set-JsonProperty $settings 'WorkstationId' $env:COMPUTERNAME }
    if (-not (Get-JsonProperty $settings 'PollIntervalMs')) { Set-JsonProperty $settings 'PollIntervalMs' 5000 }
    $au = Get-JsonProperty $settings 'AutoUpdate'
    if (-not $au) { $au = New-Object PSObject; Set-JsonProperty $settings 'AutoUpdate' $au }
    Set-JsonProperty $au 'Mode' 'release'
    Set-JsonProperty $au 'GitHubOwner' $GitHubOwner
    Set-JsonProperty $au 'GitHubRepo' $GitHubRepo
    Set-JsonProperty $au 'AssetFileName' 'AlamidaCalendarAgent-win-x64.zip'
    Set-JsonProperty $au 'Branch' $GitHubBranch
    if ($null -eq (Get-JsonProperty $au 'Enabled')) { Set-JsonProperty $au 'Enabled' $true }
    if ($null -eq (Get-JsonProperty $au 'CheckOnStartup')) { Set-JsonProperty $au 'CheckOnStartup' $true }

    $calId = Resolve-CalendarId (Get-JsonProperty $settings 'CalendarId') $saEmail
    Set-JsonProperty $settings 'CalendarId' $calId
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($settingsPath, ($settings | ConvertTo-Json -Depth 10), $utf8NoBom)
    Write-Ok "Kalender-ID: $calId"
    if ($calId -eq 'primary') {
        Write-Warn "'primary' ist der eigene Kalender des Service-Accounts (fuer niemanden sichtbar)."
        Write-Warn "Kalender-ID spaeter in $settingsPath eintragen."
    }

    Write-Step "4/5 Verknuepfungen und Autostart"
    $legacyStartup = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\AlamidaCalendarAgent.lnk'
    if (Test-Path -LiteralPath $legacyStartup) { Remove-Item -LiteralPath $legacyStartup -Force -ErrorAction SilentlyContinue }
    $legacyDesktop = Join-Path ([Environment]::GetFolderPath('Desktop')) 'AlamidaCalendarAgent.lnk'
    if (Test-Path -LiteralPath $legacyDesktop) { Remove-Item -LiteralPath $legacyDesktop -Force -ErrorAction SilentlyContinue }

    New-Item -Path $RunKey -Force -ErrorAction SilentlyContinue | Out-Null
    Set-ItemProperty -Path $RunKey -Name 'AlamidaCalendarAgent' -Value "`"$exePath`""
    $startMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Alamida Kalender'
    New-Shortcut (Join-Path $startMenu 'Alamida Kalender Agent.lnk') $exePath $InstallDir 'Alamida Kalender Agent starten'
    New-Shortcut (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Alamida Kalender Agent.lnk') $exePath $InstallDir 'Alamida Kalender Agent starten'

    $uninstallScript = Join-Path $InstallDir 'uninstall.ps1'
    $version = '0.0.0'
    $versionFile = Join-Path $InstallDir 'version.txt'
    if (Test-Path -LiteralPath $versionFile) { $version = (Get-Content -LiteralPath $versionFile -Raw).Trim() }
    New-Item -Path $UninstallKey -Force | Out-Null
    Set-ItemProperty -Path $UninstallKey -Name 'DisplayName' -Value $AppName
    Set-ItemProperty -Path $UninstallKey -Name 'DisplayVersion' -Value $version
    Set-ItemProperty -Path $UninstallKey -Name 'Publisher' -Value 'Alamida Kalender'
    Set-ItemProperty -Path $UninstallKey -Name 'DisplayIcon' -Value $exePath
    Set-ItemProperty -Path $UninstallKey -Name 'InstallLocation' -Value $InstallDir
    Set-ItemProperty -Path $UninstallKey -Name 'UninstallString' -Value "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$uninstallScript`""
    Set-ItemProperty -Path $UninstallKey -Name 'NoModify' -Value 1 -Type DWord
    Set-ItemProperty -Path $UninstallKey -Name 'NoRepair' -Value 1 -Type DWord
    Write-Ok "Autostart, Startmenue, Desktop und 'Apps & Features' eingerichtet"

    if (Test-Path -LiteralPath 'C:\Program Files\AlamidaCalendar') {
        Write-Warn "Alte Installation unter C:\Program Files\AlamidaCalendar gefunden (wird nicht mehr verwendet, kann geloescht werden)."
    }

    Write-Step "5/5 Agent starten"
    if ($NoStart) {
        Write-Info "Uebersprungen (-NoStart)."
    } elseif (-not $saSource) {
        Write-Warn "Nicht gestartet - zuerst Service-Account-Datei hinterlegen."
    } else {
        Start-Process -FilePath $exePath -WorkingDirectory $InstallDir
        Write-Ok "Agent laeuft (Tray-Symbol unten rechts)"
    }

    Write-Host ""
    Write-Host "Installation abgeschlossen." -ForegroundColor Green
    $summary = "Installation abgeschlossen.`n`nProgramm: $InstallDir`nKonfiguration: $ConfigDir`nKalender-ID: $calId"
    if (-not $saSource) { $summary += "`n`nACHTUNG: Service-Account-Datei fehlt noch. Bitte INSTALLIEREN.bat erneut starten, sobald die JSON-Datei vorliegt." }
    elseif ($calId -eq 'primary') { $summary += "`n`nHinweis: Keine Kalender-ID angegeben - Termine landen im unsichtbaren Kalender des Service-Accounts. INSTALLIEREN.bat erneut starten, um die ID einzutragen." }
    else { $summary += "`n`nDer Agent startet ab jetzt automatisch mit Windows." }
    Show-Message $summary
    $exitCode = 0
}
catch {
    Write-Host ""
    Write-Host "FEHLER: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Protokoll: $logPath" -ForegroundColor Yellow
    Show-Message "Installation fehlgeschlagen:`n`n$($_.Exception.Message)`n`nProtokoll: $logPath" 'Error'
    $exitCode = 1
}
finally {
    try { Stop-Transcript | Out-Null } catch { }
}
if ($PSCommandPath) { exit $exitCode }
