param(
    [string] $SterbefallId = "260100",
    [int] $MaxWaitSeconds = 20
)

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName Microsoft.VisualBasic

function Find-ByName($root, [string]$name, [string]$controlType = $null) {
    $nameCond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::NameProperty, $name)
    if ($controlType) {
        $typeCond = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
            [System.Windows.Automation.ControlType]::$controlType)
        $cond = New-Object System.Windows.Automation.AndCondition($nameCond, $typeCond)
    }
    else {
        $cond = $nameCond
    }
    return $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
}

function Invoke-Ui($el) {
    if (-not $el) { return $false }
    try {
        $pat = $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
        if ($pat) {
            $pat.Invoke()
            return $true
        }
    }
    catch { }
    return $false
}

function Click-Element($el) {
    if (-not $el) { return $false }
    if (Invoke-Ui $el) { return $true }
    try {
        $rect = $el.Current.BoundingRectangle
        if ($rect.Width -le 0 -or $rect.Height -le 0) { return $false }
        $x = [int]($rect.X + ($rect.Width / 2))
        $y = [int]($rect.Y + ($rect.Height / 2))
        [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($x, $y)
        Start-Sleep -Milliseconds 80
        Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseOps {
    [DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
    public const int LEFTDOWN = 0x02;
    public const int LEFTUP = 0x04;
    public static void LeftClick() { mouse_event(LEFTDOWN, 0, 0, 0, 0); mouse_event(LEFTUP, 0, 0, 0, 0); }
    public static void DoubleClick() { LeftClick(); System.Threading.Thread.Sleep(80); LeftClick(); }
}
"@
        [MouseOps]::DoubleClick()
        return $true
    }
    catch { }
    return $false
}

function Get-SterbefallHeader($root) {
    $textType = [System.Windows.Automation.ControlType]::Text
    $cond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty, $textType)
    foreach ($el in $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)) {
        $name = $el.Current.Name
        if ($name -match '^\d+\s*\|') { return $name.Trim() }
    }
    return $null
}

function Wait-ForSterbefall($root, [string]$id, [int]$seconds) {
    $deadline = (Get-Date).AddSeconds($seconds)
    while ((Get-Date) -lt $deadline) {
        $header = Get-SterbefallHeader $root
        if ($header -and $header.StartsWith($id)) { return $header }
        Start-Sleep -Milliseconds 400
    }
    return Get-SterbefallHeader $root
}

function Read-ElementValue($el) {
    if (-not $el) { return $null }
    try {
        $pat = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
        if ($pat) { return $pat.Current.Value }
    }
    catch { }
    return $el.Current.Value
}

function Open-SterbefallFromList($root, [string]$id) {
    $editType = [System.Windows.Automation.ControlType]::Edit
    $condEdit = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty, $editType)
    foreach ($el in $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condEdit)) {
        $aid = $el.Current.AutomationId
        if ($aid -notmatch 'Nummer_mit_Kostenanschlag') { continue }
        $val = Read-ElementValue $el
        if ([string]::IsNullOrWhiteSpace($val)) { continue }
        $val = $val.Trim()
        if (-not $val.StartsWith($id)) { continue }
        if (Click-Element $el) { return $true }
    }
    return $false
}

$proc = Get-Process -Name "FileMaker*" | Select-Object -First 1
if (-not $proc) { throw "FileMaker nicht gefunden" }
[void]$proc.WaitForInputIdle(3000)
[Microsoft.VisualBasic.Interaction]::AppActivate($proc.Id) | Out-Null
Start-Sleep -Milliseconds 500

$root = [System.Windows.Automation.AutomationElement]::FromHandle($proc.MainWindowHandle)
if (-not $root) { throw "UIA root fehlt" }

$sterbefaelle = Find-ByName $root "Sterbefälle" "Button"
if ($sterbefaelle) {
    Invoke-Ui $sterbefaelle | Out-Null
    Click-Element $sterbefaelle | Out-Null
    Start-Sleep -Seconds 2
}

[Microsoft.VisualBasic.Interaction]::AppActivate($proc.Id) | Out-Null
Start-Sleep -Milliseconds 300

if (-not (Open-SterbefallFromList $root $SterbefallId)) {
    throw "Fall $SterbefallId in Sterbefaelle-Liste nicht gefunden"
}
Start-Sleep -Seconds 3

$termine = Find-ByName $root "Termine" "Button"
if (-not $termine) { throw "Termine-Button nicht gefunden" }
if (-not (Invoke-Ui $termine)) { Click-Element $termine | Out-Null }
Start-Sleep -Seconds 2

$header = Wait-ForSterbefall $root $SterbefallId $MaxWaitSeconds
if ($header -and $header.StartsWith($SterbefallId)) {
    Write-Host "Alamida: Tab Termine, Fall $header geoeffnet."
    exit 0
}

$headerInfo = if ($header) { $header } else { '(leer)' }
Write-Warning "Fall $SterbefallId evtl. nicht aktiv (Header: $headerInfo). Bitte manuell pruefen."
exit 1
