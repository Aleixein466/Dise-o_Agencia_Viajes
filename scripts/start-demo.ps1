[CmdletBinding()]
param(
  # Run the full E2E suite first so the demo has sample requests, quotes, reservations, sandbox payments,
  # approved abonos and a savings plan created through the real flows (all fictitious, local only).
  [switch]$Populate,
  [int]$Minutes = 120,
  [switch]$SkipBuild,
  [string]$PostgresContainer = "dise-o_agencia_viajes-postgres-1",
  [string]$MailpitContainer = "ricaurte-demo-mailpit"
)

# Local demo of Ricaurte Tours 3.0 on the isolated database ricaurte_cartagena_e2e (never production).
# Everything listens on 127.0.0.1 only: PostgreSQL :5433, API :4100, web :3201, Mailpit SMTP :1025 / UI :8025.
# Payments use the simulated sandbox_test adapter; mail is captured by Mailpit and never delivered.
# Requirements: Docker Desktop running and scripts\provision-cartagena-e2e.ps1 executed once.
# Stop: scripts\stop-demo.ps1 (or Ctrl+C).
# "Continue": docker writes progress to stderr (fatal under "Stop" in PS 5.1); every step checks $LASTEXITCODE.
$ErrorActionPreference = "Continue"
$docker = Join-Path $env:LOCALAPPDATA "Programs\DockerDesktop\resources\bin\docker.exe"
if (-not (Test-Path -LiteralPath $docker)) { $docker = "docker" }
function Log([string]$Message) { Write-Host ("[{0:HH:mm:ss}] [demo] {1}" -f (Get-Date), $Message) }
function Container-State([string]$Name) {
  # Windows PowerShell 5.1 turns native stderr into a terminating error under "Stop"; a missing container is normal.
  $ErrorActionPreference = "Continue"
  $state = & $docker inspect -f "{{.State.Running}}" $Name 2>$null
  if ($LASTEXITCODE -ne 0) { return "missing" }
  if ($state -eq "true") { return "running" } else { return "stopped" }
}

# PostgreSQL: reuse the existing container as is. Never "compose up" it (that could recreate it with other ports).
switch (Container-State $PostgresContainer) {
  "missing" { throw "Container $PostgresContainer not found. Create it with docker compose (see README) first." }
  "stopped" { Log "starting $PostgresContainer"; & $docker start $PostgresContainer | Out-Null }
  default { Log "$PostgresContainer already running" }
}
$deadline = (Get-Date).AddSeconds(60)
while (-not (Test-NetConnection -ComputerName 127.0.0.1 -Port 5433 -WarningAction SilentlyContinue).TcpTestSucceeded) {
  if ((Get-Date) -gt $deadline) { throw "PostgreSQL not reachable on 127.0.0.1:5433 within 60 s." }
  Start-Sleep -Seconds 2
}

# Mailpit: pinned image, loopback-only ports, captures mail without delivering it.
switch (Container-State $MailpitContainer) {
  "missing" {
    Log "creating $MailpitContainer (axllent/mailpit:v1.33.0, loopback only)"
    & $docker run -d --name $MailpitContainer --security-opt no-new-privileges:true `
      -p 127.0.0.1:1025:1025 -p 127.0.0.1:8025:8025 axllent/mailpit:v1.33.0 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "could not start Mailpit" }
  }
  "stopped" { Log "starting $MailpitContainer"; & $docker start $MailpitContainer | Out-Null }
  default { Log "$MailpitContainer already running" }
}

Log "migrations + reproducible seed (fictitious users and catalog, database ricaurte_cartagena_e2e only)"
& (Join-Path $PSScriptRoot "seed-cartagena-e2e.ps1")
if ($LASTEXITCODE -ne 0) { throw "seed failed" }

$runArgs = @{}
if ($SkipBuild) { $runArgs.SkipBuild = $true }
if ($Populate) {
  Log "populating sample data through the E2E flows (file mail sink, simulated payments)"
  & (Join-Path $PSScriptRoot "run-cartagena-e2e.ps1") @runArgs
  if ($LASTEXITCODE -ne 0) { throw "E2E population failed; see $env:TEMP\ricaurte-e2e\playwright.log" }
  $runArgs.SkipBuild = $true
  # The E2E run enrolled staff MFA with secrets nobody keeps; re-seeding resets only the test users' MFA and
  # sessions (populated requests, reservations and payments stay) so the first demo login enrolls a new authenticator.
  Log "resetting test staff MFA for the demo login"
  & (Join-Path $PSScriptRoot "seed-cartagena-e2e.ps1")
  if ($LASTEXITCODE -ne 0) { throw "re-seed failed" }
}

Log "web http://127.0.0.1:3201 | admin http://127.0.0.1:3201/ingresar | api http://127.0.0.1:4100 | mail http://127.0.0.1:8025"
Log "staff credentials: $env:TEMP\ricaurte-cartagena-e2e-credentials.json (test-only; MFA required)"
& (Join-Path $PSScriptRoot "run-cartagena-e2e.ps1") @runArgs -ServeOnly -ServeMinutes $Minutes -Mailpit
exit $LASTEXITCODE
