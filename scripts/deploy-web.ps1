param(
    [ValidateSet("firebase", "netlify")]
    [string]$Target = "firebase"
)

$Root = Split-Path $PSScriptRoot -Parent
Push-Location (Join-Path $Root "web")
npm run build
Pop-Location

if ($Target -eq "firebase") {
    Remove-Item (Join-Path $Root "firebase\public") -Recurse -Force -ErrorAction SilentlyContinue
    Copy-Item (Join-Path $Root "web\dist") (Join-Path $Root "firebase\public") -Recurse -Force
    Push-Location (Join-Path $Root "firebase")
    firebase deploy --only hosting,firestore --project alamida---monitoring
    Pop-Location
    Write-Host "Live: https://alamida---monitoring.web.app" -ForegroundColor Green
} else {
    Push-Location (Join-Path $Root "web")
    netlify deploy --prod --dir=dist
    Pop-Location
}
