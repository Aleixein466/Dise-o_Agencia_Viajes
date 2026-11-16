[CmdletBinding()]
param(
  [string]$MailpitContainer = "ricaurte-demo-mailpit",
  # PostgreSQL keeps running by default (other local work may use it); data is never deleted.
  [switch]$StopPostgres,
  [string]$PostgresContainer = "dise-o_agencia_viajes-postgres-1"
)

# Stops the local demo started by scripts\start-demo.ps1. Removes no volumes, databases or images.
$ErrorActionPreference = "Stop"
$docker = Join-Path $env:LOCALAPPDATA "Programs\DockerDesktop\resources\bin\docker.exe"
if (-not (Test-Path -LiteralPath $docker)) { $docker = "docker" }
$logDir = Join-Path $env:TEMP "ricaurte-e2e"
New-Item -ItemType Directory -Force $logDir | Out-Null
# The serve loop in run-cartagena-e2e.ps1 watches for this file and stops API + web (whole process trees).
New-Item -ItemType File -Force (Join-Path $logDir "stop") | Out-Null
$deadline = (Get-Date).AddSeconds(30)
while ((Get-NetTCPConnection -State Listen -LocalPort 4100, 3201 -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 1
}
if (Get-NetTCPConnection -State Listen -LocalPort 4100, 3201 -ErrorAction SilentlyContinue) {
  Write-Warning "Ports 4100/3201 still in use; the demo may not have been started by start-demo.ps1."
} else { Write-Host "[demo] API and web stopped" }
$ErrorActionPreference = "Continue"
& $docker stop $MailpitContainer 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) { Write-Host "[demo] Mailpit stopped (container kept; mail is discarded on restart)" }
if ($StopPostgres) { & $docker stop $PostgresContainer | Out-Null; Write-Host "[demo] PostgreSQL stopped (volume kept)" }
