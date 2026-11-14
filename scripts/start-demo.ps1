[CmdletBinding()]
param(
  # Run the full E2E suite first so the demo has sample requests, quotes, reservations, sandbox payments,
  # approved abonos and a savings plan created through the real flows (all fictitious, local only).
  [switch]$Populate,
  [int]$Minutes = 120,
  [switch]$SkipBuild
)

# Local demo of Ricaurte Tours 3.0 on the isolated database ricaurte_cartagena_e2e (never production).
# Requirements: Docker Desktop running and scripts\provision-cartagena-e2e.ps1 executed once.
# Stop early: create %TEMP%\ricaurte-e2e\stop (or Ctrl+C).
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$docker = Join-Path $env:LOCALAPPDATA "Programs\DockerDesktop\resources\bin\docker.exe"
if (-not (Test-Path -LiteralPath $docker)) { $docker = "docker" }

Push-Location $root
try {
  Write-Host "[demo] PostgreSQL + Mailpit (loopback only)"
  & $docker compose up -d postgres
  if ($LASTEXITCODE -ne 0) { throw "docker compose up postgres failed" }
  & $docker compose --profile mail up -d mailpit
  if ($LASTEXITCODE -ne 0) { throw "docker compose up mailpit failed" }

  Write-Host "[demo] migrations + reproducible seed (fictitious users, catalog, tariffs)"
  & (Join-Path $PSScriptRoot "seed-cartagena-e2e.ps1")
  if ($LASTEXITCODE -ne 0) { throw "seed failed" }

  $buildArgs = @{}
  if ($SkipBuild) { $buildArgs.SkipBuild = $true }
  if ($Populate) {
    Write-Host "[demo] populating sample data through the E2E flows"
    & (Join-Path $PSScriptRoot "run-cartagena-e2e.ps1") @buildArgs
    if ($LASTEXITCODE -ne 0) { throw "E2E population failed; see %TEMP%\ricaurte-e2e\playwright.log" }
    $buildArgs.SkipBuild = $true
  }

  Write-Host "[demo] web http://127.0.0.1:3201 | api http://127.0.0.1:4100 | mail http://127.0.0.1:8025"
  Write-Host "[demo] staff credentials: %TEMP%\ricaurte-cartagena-e2e-credentials.json (test-only, MFA required)"
  & (Join-Path $PSScriptRoot "run-cartagena-e2e.ps1") @buildArgs -ServeOnly -ServeMinutes $Minutes -Mailpit
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
