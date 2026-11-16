[CmdletBinding()]
param(
  # "ci" runs a second, fully isolated instance (database ricaurte_cartagena_e2e_ci, ports 4200/3301, build in
  # apps/web/.next-ci, logs in %TEMP%\ricaurte-e2e-ci) so tests never disturb a demo served by the default instance.
  [ValidateSet("default", "ci")][string]$Instance = "default",
  [string]$CredentialsPath,
  [switch]$SkipBuild,
  # Reseed the isolated database first (default) so every run starts from the same state; -SkipSeed keeps it.
  [switch]$SkipSeed,
  # Start API + web and keep them up for inspection/demo (no tests). Bounded: stops after -ServeMinutes or when
  # the file %TEMP%\ricaurte-e2e\stop appears.
  [switch]$ServeOnly,
  [int]$ServeMinutes = 120,
  # With -ServeOnly: send mail to a local Mailpit (smtp://127.0.0.1:1025, UI :8025) instead of the file sink.
  [switch]$Mailpit,
  [int]$BuildTimeoutSec = 600,
  [int]$ReadyTimeoutSec = 60,
  [int]$PlaywrightTimeoutSec = 600,
  # Run only these spec files (catalog config), e.g. -Spec public-admin-content.spec.ts; skips the auth stage.
  # Used for low-memory batches: same isolated DB/ports, nothing else changes.
  [string[]]$Spec = @()
)

# Each stage logs to %TEMP%\ricaurte-e2e\<stage>.log, streams its output live, and is killed (whole process tree)
# when it exceeds its timeout, so a hang shows which stage failed instead of waiting silently.
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$ci = $Instance -eq "ci"
$suffix = if ($ci) { "-ci" } else { "" }
$dbName = if ($ci) { "ricaurte_cartagena_e2e_ci" } else { "ricaurte_cartagena_e2e" }
$apiPort = if ($ci) { 4200 } else { 4100 }
$webPort = if ($ci) { 3301 } else { 3201 }
if (-not $CredentialsPath) { $CredentialsPath = Join-Path $env:TEMP "ricaurte-cartagena-e2e$suffix-credentials.json" }
$logDir = Join-Path $env:TEMP "ricaurte-e2e$suffix"
$env:E2E_STATE_DIR = $logDir
if ($ci) { $env:NEXT_DIST_DIR = ".next-ci" } else { Remove-Item Env:NEXT_DIST_DIR -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Force $logDir | Out-Null
function Log([string]$Stage, [string]$Message) { Write-Host ("[{0:HH:mm:ss}] [{1}] {2}" -f (Get-Date), $Stage, $Message) }

function Start-Logged([string]$Stage, [string]$CommandLine) {
  $log = Join-Path $logDir "$Stage.log"
  Set-Content -LiteralPath $log -Value "" -Encoding utf8
  $p = Start-Process -FilePath "cmd.exe" -ArgumentList "/d", "/c", "$CommandLine > `"$log`" 2>&1" -WorkingDirectory $root -WindowStyle Hidden -PassThru
  return @{ Process = $p; Log = $log; Read = 0 }
}
function Show-NewOutput($Job, [string]$Stage) {
  $lines = @(Get-Content -LiteralPath $Job.Log -ErrorAction SilentlyContinue)
  for ($i = $Job.Read; $i -lt $lines.Count; $i++) { if ($lines[$i].Trim()) { Write-Host "  $Stage | $($lines[$i])" } }
  $Job.Read = $lines.Count
}
function Stop-Tree($Job) {
  if (-not $Job -or $Job.Process.HasExited) { return }
  # taskkill writes to stderr when a child already exited; under ErrorActionPreference=Stop, Windows PowerShell 5.1
  # turns that into a terminating error and the cleanup would stop half-way, orphaning the servers.
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try { & taskkill.exe /PID $Job.Process.Id /T /F 2>&1 | Out-Null } catch { }
  finally { $ErrorActionPreference = $previous }
}
function Invoke-Stage([string]$Stage, [string]$CommandLine, [int]$TimeoutSec) {
  Log $Stage "start (timeout ${TimeoutSec}s): $CommandLine"
  $job = Start-Logged $Stage $CommandLine
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while (-not $job.Process.WaitForExit(3000)) {
    Show-NewOutput $job $Stage
    if ((Get-Date) -gt $deadline) {
      Stop-Tree $job
      throw "Stage '$Stage' exceeded ${TimeoutSec}s and was stopped. Full log: $($job.Log)"
    }
  }
  Show-NewOutput $job $Stage
  $code = $job.Process.ExitCode
  if ($code -ne 0) { throw "Stage '$Stage' failed with exit code $code. Full log: $($job.Log)" }
  Log $Stage "ok"
}
function Wait-Ready([string]$Stage, $Job, [string]$Url, [int]$Expected, [int]$TimeoutSec) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    if ($Job.Process.HasExited) { Show-NewOutput $Job $Stage; throw "Stage '$Stage' exited early (code $($Job.Process.ExitCode)). Log: $($Job.Log)" }
    try { $status = (Invoke-WebRequest -UseBasicParsing $Url -MaximumRedirection 0 -TimeoutSec 5 -ErrorAction Stop).StatusCode }
    catch { $status = $_.Exception.Response.StatusCode.value__ }
    if ($status -eq $Expected) { Log $Stage "ready ($Url -> $status)"; return }
    Start-Sleep -Milliseconds 1000
  }
  Show-NewOutput $Job $Stage
  throw "Stage '$Stage' not ready within ${TimeoutSec}s ($Url). Log: $($Job.Log)"
}

Log "preflight" "credentials, ports, PostgreSQL"
if (-not (Test-Path -LiteralPath $CredentialsPath)) { throw "E2E credentials were not found at $CredentialsPath." }
$credentials = Get-Content -LiteralPath $CredentialsPath -Raw | ConvertFrom-Json
foreach ($name in "databaseUrl", "adminEmail", "adminPassword", "restrictedEmail", "restrictedPassword", "mfaKey") {
  if ([string]::IsNullOrWhiteSpace([string]$credentials.$name)) { throw "E2E credential '$name' is missing." }
}
$target = [Uri]$credentials.databaseUrl
if ($target.AbsolutePath.TrimStart('/') -ne $dbName -or $target.Host -notin @("127.0.0.1", "localhost")) {
  throw "Refusing to run: databaseUrl must point to the local $dbName database."
}
# Never kill unknown services: abort if the test ports are already taken.
$busy = Get-NetTCPConnection -State Listen -LocalPort $apiPort, $webPort -ErrorAction SilentlyContinue
if ($busy) { throw "Ports in use: $(($busy | ForEach-Object { "$($_.LocalPort)/pid $($_.OwningProcess)" }) -join ', '). Stop them first." }
$pg = Test-NetConnection -ComputerName 127.0.0.1 -Port 5433 -WarningAction SilentlyContinue
if (-not $pg.TcpTestSucceeded) { throw "PostgreSQL is not reachable on 127.0.0.1:5433." }
Log "preflight" "ok (db $dbName, logs in $logDir)"

$env:DATABASE_URL = $credentials.databaseUrl
$env:HOST = "127.0.0.1"
$env:PORT = "$apiPort"
$env:APP_ORIGIN = "http://127.0.0.1:$webPort"
$env:WEB_ORIGIN = "http://127.0.0.1:$webPort"
# Public intake is opened only for this isolated E2E run; it stays "false" by default until legal approval.
$env:PUBLIC_QUOTE_REQUESTS_ENABLED = "true"
$env:PQRS_INTAKE_ENABLED = "true"
$env:PQRS_HOLIDAYS = "colombia"
# Simulated payment provider (no money moves); refused by the API in production.
$env:PAYMENT_ADAPTER = "sandbox_test"
# Test-only mail sink (customer login codes); refused by the API in production.
$env:MAIL_ADAPTER = "file"
$env:MAIL_SINK_DIR = Join-Path $logDir "mail"
$env:E2E_MAIL_SINK_DIR = $env:MAIL_SINK_DIR
# Outbox dispatcher in-process so notification E2E checks are deterministic (file sink only).
$env:NOTIFICATIONS_DISPATCH_INTERVAL_MS = "1000"
if ($ServeOnly -and $Mailpit) {
  # Loopback Mailpit only captures mail; the API refuses non-loopback SMTP without MAIL_REAL_DELIVERY_APPROVED.
  $env:MAIL_ADAPTER = "smtp"
  $env:SMTP_URL = "smtp://127.0.0.1:1025"
  $env:MAIL_FROM = "Ricaurte Tours (demo) <demo@ricaurte.test>"
}
if (Test-Path -LiteralPath $env:MAIL_SINK_DIR) { Get-ChildItem -LiteralPath $env:MAIL_SINK_DIR -Filter *.json | Remove-Item -Force }
$env:MFA_ENCRYPTION_KEY = $credentials.mfaKey
$env:MEDIA_STORAGE_DIR = Join-Path $env:TEMP "RicaurteTours\e2e-private-media"
$env:LOG_LEVEL = "warn"
$env:API_INTERNAL_URL = "http://127.0.0.1:$apiPort"
$env:CARTAGENA_E2E_BASE_URL = "http://127.0.0.1:$webPort"
$env:CARTAGENA_E2E_ADMIN_EMAIL = $credentials.adminEmail
$env:CARTAGENA_E2E_ADMIN_PASSWORD = $credentials.adminPassword
$env:CARTAGENA_E2E_RESTRICTED_EMAIL = $credentials.restrictedEmail
$env:CARTAGENA_E2E_RESTRICTED_PASSWORD = $credentials.restrictedPassword
# Second FINANCE user created by the seeder (same test-only password) for four-eyes approval.
$env:CARTAGENA_E2E_FINANCE2_EMAIL = "finance2.cartagena-e2e@ricaurte.test"
$env:E2E_ADMIN_EMAIL = $credentials.adminEmail
$env:E2E_ADMIN_PASSWORD = $credentials.adminPassword
$env:E2E_RESTRICTED_EMAIL = $credentials.restrictedEmail
$env:E2E_RESTRICTED_PASSWORD = $credentials.restrictedPassword
$env:CI = "1"

# Same test-only password as the FINANCE users; the seeder resets this dedicated ADMIN (no MFA) every run.
$env:AUTH_E2E_RUN = "1"
$env:AUTH_E2E_BASE_URL = "http://127.0.0.1:$webPort"
$env:AUTH_E2E_EMAIL = "auth.cartagena-e2e@ricaurte.test"
$env:AUTH_E2E_PASSWORD = $credentials.restrictedPassword

if (-not $SkipSeed -and -not $ServeOnly) {
  $seedScript = Join-Path $PSScriptRoot "seed-cartagena-e2e.ps1"
  Invoke-Stage "seed" "powershell -NoProfile -ExecutionPolicy Bypass -File `"$seedScript`" -Instance $Instance -CredentialsPath `"$CredentialsPath`"" 300
} else { Log "seed" "skipped" }

if (-not $SkipBuild) {
  $env:NODE_ENV = "production"
  Invoke-Stage "build-api" "corepack pnpm --filter @ricaurte/api build" $BuildTimeoutSec
  Invoke-Stage "build-web" "corepack pnpm --filter @ricaurte/web build" $BuildTimeoutSec
} else { Log "build" "skipped (-SkipBuild)" }

$api = $null; $web = $null; $exitCode = 1
try {
  $env:NODE_ENV = "development"
  Log "api" "starting on :$apiPort"
  $api = Start-Logged "api" "corepack pnpm --filter @ricaurte/api start"
  Wait-Ready "api" $api "http://127.0.0.1:$apiPort/api/v1/auth/session" 401 $ReadyTimeoutSec
  Log "web" "starting on :$webPort"
  $web = Start-Logged "web" "set NODE_ENV=production&& corepack pnpm --filter @ricaurte/web exec next start -H 127.0.0.1 -p $webPort"
  Wait-Ready "web" $web "http://127.0.0.1:$webPort/ingresar" 200 $ReadyTimeoutSec
  if ($ServeOnly) {
    $stopFile = Join-Path $logDir "stop"
    Remove-Item -LiteralPath $stopFile -ErrorAction SilentlyContinue
    $until = (Get-Date).AddMinutes($ServeMinutes)
    Log "serve" "web http://127.0.0.1:$webPort - api http://127.0.0.1:$apiPort - until $($until.ToString('HH:mm')) or until '$stopFile' exists"
    while ((Get-Date) -lt $until -and -not (Test-Path -LiteralPath $stopFile)) {
      if ($api.Process.HasExited -or $web.Process.HasExited) { throw "a server exited while serving" }
      Start-Sleep -Seconds 2
    }
  } else {
    # list reporter only (the HTML reporter is not needed here) plus a Playwright-side global timeout below ours.
    $pwGlobalMs = ($PlaywrightTimeoutSec - 30) * 1000
    $Spec = @($Spec | ForEach-Object { $_ -split "," } | Where-Object { $_ })
    $specArgs = $Spec -join " "
    Invoke-Stage "playwright" "corepack pnpm --filter @ricaurte/web exec playwright test -c playwright.catalog.config.ts --reporter=list --global-timeout=$pwGlobalMs $specArgs" $PlaywrightTimeoutSec
    if ($Spec.Count -eq 0) {
      Invoke-Stage "playwright-auth" "corepack pnpm --filter @ricaurte/web exec playwright test -c playwright.auth.config.ts --reporter=list --global-timeout=120000" 180
    } else { Log "playwright-auth" "skipped (-Spec batch)" }
  }
  $exitCode = 0
} catch {
  Log "error" $_.Exception.Message
  foreach ($j in @(@{ n = "api"; j = $api }, @{ n = "web"; j = $web })) {
    if ($j.j) { Log $j.n "last log lines:"; Get-Content -LiteralPath $j.j.Log -Tail 15 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  $($j.n) | $_" } }
  }
} finally {
  Stop-Tree $web
  Stop-Tree $api
  Start-Sleep -Seconds 1
  $left = Get-NetTCPConnection -State Listen -LocalPort $apiPort, $webPort -ErrorAction SilentlyContinue
  if ($left) { Log "cleanup" "WARNING ports still open: $(($left | ForEach-Object { $_.LocalPort }) -join ', ')" } else { Log "cleanup" "servers stopped, ports $apiPort/$webPort free" }
}
Log "done" ("exit code {0}" -f $exitCode)
exit $exitCode
