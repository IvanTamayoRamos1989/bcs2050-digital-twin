$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

if (-not (Test-Path "$Root\data\spatial_index.sqlite")) {
    Write-Host "[1/2] Construyendo datastore City Science (396,823 edificios)..." -ForegroundColor Cyan
    python "$Root\backend\pipeline\build_city_science_datastore.py"
}

if (-not (Test-Path "$Root\frontend\dist\index.html")) {
    Write-Host "[2/2] Compilando frontend React + deck.gl + Cesium..." -ForegroundColor Cyan
    Push-Location "$Root\frontend"
    npm run build
    Pop-Location
}

Write-Host "Iniciando Gemelo Digital BCS2050 en http://127.0.0.1:8050 ..." -ForegroundColor Green
uvicorn backend.server:app --host 127.0.0.1 --port 8050
