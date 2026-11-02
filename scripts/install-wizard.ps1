# Installations-Wizard: ZIP entpacken, Setup, Autostart, Wandmonitor-Verknuepfung
#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

. (Join-Path $PSScriptRoot 'agent-install-common.ps1')
$script:AlamidaCommonScriptRoot = $PSScriptRoot

$script:WizardInstallDir = $script:AlamidaDefaultInstallDir
$script:WizardZipPath = ''
$script:WizardUseLocalZip = $false
$script:WizardServiceAccountPath = ''
$script:WizardStep = 0

function Find-NearbyAgentZip {
    $names = @($script:AlamidaAssetFileName, 'AlamidaCalendarAgent.zip')
    $dirs = @($PSScriptRoot, (Split-Path $PSScriptRoot -Parent), [Environment]::GetFolderPath('Desktop'), (Get-Location).Path)
    foreach ($d in $dirs) {
        if (-not $d -or -not (Test-Path $d)) { continue }
        foreach ($n in $names) {
            $p = Join-Path $d $n
            if (Test-Path -LiteralPath $p) { return (Get-Item -LiteralPath $p).FullName }
        }
    }
    return $null
}

function Show-WizardForm {
    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'Alamida Kalender - Installation'
    $form.Size = New-Object System.Drawing.Size(580, 480)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.Font = New-Object System.Drawing.Font('Segoe UI', 10)

    $lblTitle = New-Object System.Windows.Forms.Label
    $lblTitle.Location = New-Object System.Drawing.Point(24, 20)
    $lblTitle.Size = New-Object System.Drawing.Size(500, 32)
    $lblTitle.Font = New-Object System.Drawing.Font('Segoe UI', 14, [System.Drawing.FontStyle]::Bold)

    $lblBody = New-Object System.Windows.Forms.Label
    $lblBody.Location = New-Object System.Drawing.Point(24, 58)
    $lblBody.Size = New-Object System.Drawing.Size(500, 220)
    $lblBody.AutoSize = $false

    $txtInstallDir = New-Object System.Windows.Forms.TextBox
    $txtInstallDir.Location = New-Object System.Drawing.Point(24, 200)
    $txtInstallDir.Size = New-Object System.Drawing.Size(380, 28)
    $txtInstallDir.Text = $script:AlamidaDefaultInstallDir
    $txtInstallDir.Visible = $false

    $btnBrowseDir = New-Object System.Windows.Forms.Button
    $btnBrowseDir.Location = New-Object System.Drawing.Point(410, 198)
    $btnBrowseDir.Size = New-Object System.Drawing.Size(100, 28)
    $btnBrowseDir.Text = 'Ordner...'
    $btnBrowseDir.Visible = $false

    $rbDownload = New-Object System.Windows.Forms.RadioButton
    $rbDownload.Location = New-Object System.Drawing.Point(24, 120)
    $rbDownload.Size = New-Object System.Drawing.Size(480, 24)
    $rbDownload.Text = 'Neuestes Release von GitHub laden (empfohlen)'
    $rbDownload.Checked = $true
    $rbDownload.Visible = $false

    $rbLocal = New-Object System.Windows.Forms.RadioButton
    $rbLocal.Location = New-Object System.Drawing.Point(24, 148)
    $rbLocal.Size = New-Object System.Drawing.Size(480, 24)
    $rbLocal.Text = 'ZIP-Datei auf diesem PC verwenden'
    $rbLocal.Visible = $false

    $btnBrowseZip = New-Object System.Windows.Forms.Button
    $btnBrowseZip.Location = New-Object System.Drawing.Point(24, 176)
    $btnBrowseZip.Size = New-Object System.Drawing.Size(120, 28)
    $btnBrowseZip.Text = 'ZIP waehlen...'
    $btnBrowseZip.Visible = $false

    $lblZipPath = New-Object System.Windows.Forms.Label
    $lblZipPath.Location = New-Object System.Drawing.Point(150, 180)
    $lblZipPath.Size = New-Object System.Drawing.Size(360, 40)
    $lblZipPath.ForeColor = [System.Drawing.Color]::Gray
    $lblZipPath.Visible = $false

    $pnlGoogleCalendar = New-Object System.Windows.Forms.Panel
    $pnlGoogleCalendar.Location = New-Object System.Drawing.Point(22, 168)
    $pnlGoogleCalendar.Size = New-Object System.Drawing.Size(520, 100)
    $pnlGoogleCalendar.BorderStyle = 'FixedSingle'
    $pnlGoogleCalendar.Visible = $false

    $btnBrowseCred = New-Object System.Windows.Forms.Button
    $btnBrowseCred.Location = New-Object System.Drawing.Point(12, 10)
    $btnBrowseCred.Size = New-Object System.Drawing.Size(220, 32)
    $btnBrowseCred.Text = 'Google Calendar JSON-Datei waehlen...'
    $btnBrowseCred.Font = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold)

    $txtCredPath = New-Object System.Windows.Forms.TextBox
    $txtCredPath.Location = New-Object System.Drawing.Point(12, 50)
    $txtCredPath.Size = New-Object System.Drawing.Size(492, 26)
    $txtCredPath.ReadOnly = $false
    $txtCredPath.BackColor = [System.Drawing.Color]::White
    $txtCredPath.Text = 'Noch keine Datei gewaehlt'

    $pnlGoogleCalendar.Controls.AddRange(@($btnBrowseCred, $txtCredPath))

    $progress = New-Object System.Windows.Forms.ProgressBar
    $progress.Location = New-Object System.Drawing.Point(24, 280)
    $progress.Size = New-Object System.Drawing.Size(486, 24)
    $progress.Style = 'Marquee'
    $progress.MarqueeAnimationSpeed = 30
    $progress.Visible = $false

    $lblStatus = New-Object System.Windows.Forms.Label
    $lblStatus.Location = New-Object System.Drawing.Point(24, 310)
    $lblStatus.Size = New-Object System.Drawing.Size(486, 40)
    $lblStatus.ForeColor = [System.Drawing.Color]::DarkGreen
    $lblStatus.Visible = $false

    $btnBack = New-Object System.Windows.Forms.Button
    $btnBack.Location = New-Object System.Drawing.Point(24, 390)
    $btnBack.Size = New-Object System.Drawing.Size(100, 32)
    $btnBack.Text = 'Zurueck'
    $btnBack.Enabled = $false

    $btnNext = New-Object System.Windows.Forms.Button
    $btnNext.Location = New-Object System.Drawing.Point(410, 390)
    $btnNext.Size = New-Object System.Drawing.Size(100, 32)
    $btnNext.Text = 'Weiter'

    $btnCancel = New-Object System.Windows.Forms.Button
    $btnCancel.Location = New-Object System.Drawing.Point(300, 390)
    $btnCancel.Size = New-Object System.Drawing.Size(100, 32)
    $btnCancel.Text = 'Abbrechen'

    $form.Controls.AddRange(@(
        $lblTitle, $lblBody, $txtInstallDir, $btnBrowseDir,
        $rbDownload, $rbLocal, $btnBrowseZip, $lblZipPath,
        $progress, $lblStatus, $btnBack, $btnNext, $btnCancel,
        $pnlFirebase
    ))

    function Set-ServiceAccountPath {
        param(
            [string] $Path,
            [switch] $Silent
        )
        $Path = $Path.Trim().Trim('"')
        if (-not $Path) {
            $script:WizardServiceAccountPath = ''
            Update-CredPathDisplay
            return $false
        }
        if ($script:WizardServiceAccountPath -and (Test-AlamidaServiceAccountFile $script:WizardServiceAccountPath)) {
            $current = (Get-Item -LiteralPath $script:WizardServiceAccountPath).FullName
            $candidate = $Path
            try { $candidate = (Get-Item -LiteralPath $Path).FullName } catch { }
            if ($current -eq $candidate) {
                Update-CredPathDisplay
                return $true
            }
        }
        $err = Get-AlamidaServiceAccountValidationError $Path
        if ($err) {
            $script:WizardServiceAccountPath = ''
            $txtCredPath.Text = $Path
            $txtCredPath.ForeColor = [System.Drawing.Color]::DarkRed
            if (-not $Silent) {
                [System.Windows.Forms.MessageBox]::Show(
                    "Die Datei wurde nicht akzeptiert:`n`n$err",
                    'Firebase-JSON',
                    'OK',
                    'Warning') | Out-Null
            }
            return $false
        }
        $resolved = Resolve-AlamidaExistingFilePath $Path
        if (-not $resolved) {
            $script:WizardServiceAccountPath = ''
            if (-not $Silent) {
                [System.Windows.Forms.MessageBox]::Show(
                    "Die Datei konnte nicht uebernommen werden:`n$Path",
                    'Firebase-JSON',
                    'OK',
                    'Warning') | Out-Null
            }
            return $false
        }
        try {
            $staged = Stage-AlamidaServiceAccountFromSource -SourcePath $resolved
            $script:WizardServiceAccountPath = $staged
        } catch {
            $script:WizardServiceAccountPath = ''
            if (-not $Silent) {
                [System.Windows.Forms.MessageBox]::Show(
                    "Firebase-JSON konnte nicht gesichert werden:`n`n$($_.Exception.Message)",
                    'Firebase-JSON',
                    'OK',
                    'Warning') | Out-Null
            }
            return $false
        }
        Update-CredPathDisplay
        return $true
    }

    function Test-WizardServiceAccountReady {
        if ($script:WizardServiceAccountPath -and (Test-AlamidaServiceAccountFile $script:WizardServiceAccountPath)) {
            return $true
        }
        if ($txtCredPath.Text) {
            return (Set-ServiceAccountPath $txtCredPath.Text -Silent)
        }
        return $false
    }

    function Update-CredPathDisplay {
        if ($script:WizardServiceAccountPath) {
            $txtCredPath.Text = $script:WizardServiceAccountPath
            $txtCredPath.ForeColor = [System.Drawing.Color]::DarkGreen
        } else {
            $txtCredPath.Text = 'z.B. J:\serviceAccount.json einfuegen oder Button oben'
            $txtCredPath.ForeColor = [System.Drawing.Color]::DarkGray
        }
    }

    $txtCredPath.Add_Leave({
        if ($script:WizardStep -ne 3) { return }
        [void](Set-ServiceAccountPath $txtCredPath.Text -Silent)
    })

    $nearbySa = Find-AlamidaServiceAccountNearby
    if ($nearbySa) {
        [void](Set-ServiceAccountPath $nearbySa -Silent)
    }
    Update-CredPathDisplay

    $nearbyZip = Find-NearbyAgentZip
    if ($nearbyZip) {
        $script:WizardZipPath = $nearbyZip
        $script:WizardUseLocalZip = $true
        $rbLocal.Checked = $true
        $lblZipPath.Text = (Split-Path $nearbyZip -Leaf)
    }

    function Set-StepControls {
        param([int]$Step)
        $script:WizardStep = $Step
        $txtInstallDir.Visible = $Step -eq 1
        $btnBrowseDir.Visible = $Step -eq 1
        $rbDownload.Visible = $Step -eq 2
        $rbLocal.Visible = $Step -eq 2
        $btnBrowseZip.Visible = ($Step -eq 2) -and $rbLocal.Checked
        $lblZipPath.Visible = $Step -eq 2
        $pnlFirebase.Visible = $Step -eq 3
        if ($Step -eq 3) {
            $lblBody.Height = 105
            $pnlFirebase.BringToFront()
            if (-not $script:WizardServiceAccountPath) {
                $auto = Find-AlamidaServiceAccountNearby
                if ($auto) { [void](Set-ServiceAccountPath $auto -Silent) }
            }
            Update-CredPathDisplay
        } else {
            $lblBody.Height = 220
        }
        $progress.Visible = $Step -eq 4
        $lblStatus.Visible = $Step -ge 4
        $btnBack.Enabled = $Step -gt 0 -and $Step -lt 5
        $btnNext.Enabled = $Step -lt 5
        $btnNext.Visible = $Step -lt 5
        $btnCancel.Enabled = $Step -lt 5

        switch ($Step) {
            0 {
                $lblTitle.Text = 'Schritt 1 von 5: Willkommen'
                $lblBody.Text = @"
Richtet auf diesem PC ein:

- Agent (ZIP) nach $script:AlamidaDefaultInstallDir
- Firebase-Zugang (serviceAccount.json)
- Autostart + Desktop "Alamida Wandmonitor"

Wichtig: Legen Sie serviceAccount.json aus der Firebase Console
neben diesen Wizard (USB) oder waehlen Sie die Datei im naechsten Schritt.
"@
            }
            1 {
                $lblTitle.Text = 'Schritt 2 von 5: Installationsordner'
                $lblBody.Text = 'Der Agent wird in diesen Ordner entpackt. Bestehende Installation wird ersetzt.'
            }
            2 {
                $lblTitle.Text = 'Schritt 3 von 5: Agent-Paket'
                $lblBody.Text = 'Waehlen Sie, wie das Installations-ZIP bezogen werden soll.'
                if ($script:WizardZipPath) {
                    $lblZipPath.Text = (Split-Path $script:WizardZipPath -Leaf)
                }
                $btnBrowseZip.Visible = $rbLocal.Checked
            }
            3 {
                $lblTitle.Text = 'Schritt 4 von 5: Firebase-Zugang'
                $lblBody.Text = @"
Pflicht: JSON-Schluessel aus der Firebase Console (Dienstkonto).

Klicken Sie unten im Kasten auf den Button
"Firebase JSON-Datei waehlen".
Dateiname egal (z.B. alamida---monitoring-firebase-adminsdk-....json).
"@
            }
            4 {
                $lblTitle.Text = 'Installation laeuft...'
                $lblBody.Text = ''
                $btnNext.Enabled = $false
                $btnBack.Enabled = $false
                $btnCancel.Enabled = $false
            }
            5 {
                $lblTitle.Text = 'Fertig'
                $progress.Visible = $false
                $btnNext.Text = 'Schliessen'
                $btnNext.Enabled = $true
                $btnCancel.Visible = $false
            }
        }
    }

    $btnBrowseDir.Add_Click({
        $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
        $dlg.Description = 'Installationsordner waehlen'
        $dlg.SelectedPath = $txtInstallDir.Text
        if ($dlg.ShowDialog() -eq 'OK') { $txtInstallDir.Text = $dlg.SelectedPath }
    })

    $btnBrowseZip.Add_Click({
        $ofd = New-Object System.Windows.Forms.OpenFileDialog
        $ofd.Filter = 'ZIP-Dateien (*.zip)|*.zip'
        $ofd.Title = 'Alamida Agent ZIP'
        if ($ofd.ShowDialog() -eq 'OK') {
            $script:WizardZipPath = $ofd.FileName
            $lblZipPath.Text = $ofd.FileName
        }
    })

    $rbLocal.Add_CheckedChanged({ $btnBrowseZip.Visible = $rbLocal.Checked -and $script:WizardStep -eq 2 })

    $btnBrowseCred.Add_Click({
        $ofd = New-Object System.Windows.Forms.OpenFileDialog
        $ofd.Filter = 'Firebase JSON (*.json)|*.json|Alle Dateien (*.*)|*.*'
        $ofd.Title = 'Firebase Dienstkonto-Schluessel (JSON)'
        $ofd.InitialDirectory = $PSScriptRoot
        if ($ofd.ShowDialog() -eq 'OK') {
            [void](Set-ServiceAccountPath $ofd.FileName)
        }
    })

    $btnNext.Add_Click({
        if ($script:WizardStep -eq 5) {
            $form.Close()
            return
        }
        if ($script:WizardStep -eq 1) {
            $script:WizardInstallDir = $txtInstallDir.Text.Trim()
            if (-not $script:WizardInstallDir) {
                [System.Windows.Forms.MessageBox]::Show('Bitte Installationsordner angeben.', 'Hinweis') | Out-Null
                return
            }
        }
        if ($script:WizardStep -eq 2) {
            if ($rbLocal.Checked) {
                if (-not $script:WizardZipPath -or -not (Test-Path $script:WizardZipPath)) {
                    [System.Windows.Forms.MessageBox]::Show('Bitte eine ZIP-Datei waehlen.', 'Hinweis') | Out-Null
                    return
                }
                $script:WizardUseLocalZip = $true
            } else {
                $script:WizardUseLocalZip = $false
            }
        }
        if ($script:WizardStep -eq 3) {
            if (-not (Test-WizardServiceAccountReady)) {
                $auto = Find-AlamidaServiceAccountNearby
                if ($auto) { [void](Set-ServiceAccountPath $auto) }
            }
            if (-not (Test-WizardServiceAccountReady)) {
                [System.Windows.Forms.MessageBox]::Show(
                    @"
Bitte gueltige Firebase-Dienstkonto-JSON waehlen.

Pfad eintragen (z.B. J:\serviceAccount.json) oder Button
"Firebase JSON-Datei waehlen" im Kasten.

In Firebase Console: Projekteinstellungen -> Dienstkonten
-> Neuer privater Schluessel (NICHT Web-App-Konfiguration).
"@,
                    'Firebase erforderlich', 'OK', 'Warning') | Out-Null
                return
            }
        }
        if ($script:WizardStep -eq 3) {
            Set-StepControls 4
            $form.Refresh()
            try {
                Run-WizardInstall
                Set-StepControls 5
                $lblBody.Text = $script:WizardResultText
            } catch {
                [System.Windows.Forms.MessageBox]::Show(
                    "Installation fehlgeschlagen:`n`n$($_.Exception.Message)`n`nHinweis: Firebase-JSON auf diesem PC waehlen; USB-Laufwerk eingesteckt lassen; Agent-ZIP im Installer-Ordner (AlamidaMonitoringAgent-win-x64.zip).",
                    'Fehler', 'OK', 'Error') | Out-Null
                Set-StepControls 3
            }
            return
        }
        Set-StepControls ($script:WizardStep + 1)
    })

    $btnBack.Add_Click({ if ($script:WizardStep -gt 0) { Set-StepControls ($script:WizardStep - 1) } })
    $btnCancel.Add_Click({ $form.Close() })

    function Invoke-WizardInstallStep {
        param(
            [string] $Label,
            [scriptblock] $Action
        )
        try {
            & $Action
        } catch {
            throw "${Label}: $($_.Exception.Message)"
        }
    }

    function Run-WizardInstall {
        $installDir = $script:WizardInstallDir.Trim().TrimEnd('\')
        if ([string]::IsNullOrWhiteSpace($installDir)) {
            $installDir = $script:AlamidaDefaultInstallDir
        }
        $tempZip = Join-Path ([System.IO.Path]::GetTempPath()) $script:AlamidaAssetFileName

        $lblStatus.Text = 'Bitte warten...'
        $form.Refresh()

        if (-not (Test-WizardServiceAccountReady)) {
            throw 'Firebase: Keine gueltige Dienstkonto-JSON (bitte erneut waehlen).'
        }

        if ($script:WizardUseLocalZip) {
            Invoke-WizardInstallStep 'Agent-ZIP entpacken' {
                $lblStatus.Text = 'Entpacke lokales ZIP...'
                $form.Refresh()
                if (-not $script:WizardZipPath -or -not (Test-Path -LiteralPath $script:WizardZipPath)) {
                    throw "ZIP nicht gefunden: $($script:WizardZipPath)"
                }
                Expand-AlamidaAgentZip -ZipPath $script:WizardZipPath -InstallDir $installDir
            }
        } else {
            Invoke-WizardInstallStep 'Agent von GitHub' {
                $lblStatus.Text = 'Lade Release von GitHub...'
                $form.Refresh()
                Save-AlamidaAgentZip -DestinationPath $tempZip -OnProgress {
                    param($m)
                    $lblStatus.Text = $m
                    $form.Refresh()
                }
                $lblStatus.Text = 'Entpacke...'
                $form.Refresh()
                Expand-AlamidaAgentZip -ZipPath $tempZip -InstallDir $installDir
            }
        }

        Invoke-WizardInstallStep 'Agent einrichten' {
            $lblStatus.Text = 'Richte Agent ein (Firebase, Autostart)...'
            $form.Refresh()
            $script:setupResult = Initialize-AlamidaAgentSetup -InstallDir $installDir -ServiceAccountSource $script:WizardServiceAccountPath
        }
        $setup = $script:setupResult

        Invoke-WizardInstallStep 'Desktop-Verknuepfungen' {
            $lblStatus.Text = 'Erstelle Desktop-Verknuepfung...'
            $form.Refresh()
            Register-AlamidaWallDesktopShortcut -InstallDir $installDir
            Register-AlamidaAgentDesktopShortcut -InstallDir $installDir
        }

        Invoke-WizardInstallStep 'Agent starten' {
            $lblStatus.Text = 'Starte Agent...'
            $form.Refresh()
            Start-AlamidaAgentVerified -InstallDir $installDir
        }

        $fbHint = if ($setup.HasFirebase) {
            'Firebase: eingerichtet'
        } else {
            ('Firebase: FEHLER - siehe ' + $setup.CredPath)
        }

        $exePath = Join-Path $installDir 'AlamidaMonitoringAgent.exe'
        $script:WizardResultText = @"
Installation abgeschlossen.

Agent-Programm:
$exePath

Autostart: Windows-Startup + Aufgabenplanung
Desktop: "Alamida Monitoring Agent" und "Alamida Wandmonitor"
$fbHint

Nur der Ordner aus dem ZIP entpacken reicht nicht -
die EXE liegt immer unter C:\AlamidaMonitoring\

Wandmonitor-URL:
$script:AlamidaWallUrl
"@
        $lblStatus.Text = 'Fertig.'
    }

    Set-StepControls 0
    if ($nearbyZip) { $rbLocal.Checked = $true; $lblZipPath.Text = (Split-Path $nearbyZip -Leaf) }

    [void]$form.ShowDialog()
}

Show-WizardForm
