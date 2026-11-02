# Demo-Daten in Firestore (Test ohne Alamida)
$ErrorActionPreference = "Stop"
$config = Get-Content "$env:USERPROFILE\.config\configstore\firebase-tools.json" | ConvertFrom-Json
$token = $config.tokens.access_token
$project = "alamida---monitoring"
$base = "https://firestore.googleapis.com/v1/projects/$project/databases/(default)/documents"

function Set-Doc($collection, $id, $fields) {
    $uri = "$base/${collection}/${id}"
    $body = @{ fields = $fields } | ConvertTo-Json -Depth 10
    $h = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
    Invoke-RestMethod -Uri $uri -Method Patch -Headers $h -Body $body | Out-Null
}

function F([string]$s) { @{ stringValue = $s } }
function T([string]$iso) { @{ timestampValue = $iso } }

$now = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

Set-Doc "sterbefaelle" "DEMO-001" @{
    sterbefallId = F "DEMO-001"
    verstorbenerName = F "Max Mustermann"
    kuehlraumId = F "3"
    status = F "im_kuehlraum"
    kuehlraumQuelle = F "alamida_detail"
    workstationId = F $env:COMPUTERNAME
    updatedAt = T $now
}

Set-Doc "ueberfuehrungen" "DEMO-001" @{
    sterbefallId = F "DEMO-001"
    vonOrt = F "Krankenhaus Wien"
    nachOrt = F "Kuehlraum"
    abholungAm = F (Get-Date -Format "dd.MM.yyyy")
    kuehlraumId = F "3"
    aktuellerStandort = F "3"
    workstationId = F $env:COMPUTERNAME
    updatedAt = T $now
}

Write-Host "Demo-Daten DEMO-001 in Firestore geschrieben." -ForegroundColor Green
