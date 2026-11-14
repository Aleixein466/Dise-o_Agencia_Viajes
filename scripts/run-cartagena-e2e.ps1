[CmdletBinding()]
param(
  [string]$CredentialsPath = (Join-Path $env:TEMP "ricaurte-cartagena-e2e-credentials.json")
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $CredentialsPath)) {
  throw "E2E credentials were not found at $CredentialsPath. Create them outside the repository first."
}

$credentials = Get-Content -LiteralPath $CredentialsPath -Raw | ConvertFrom-Json
foreach ($name in "databaseUrl", "adminEmail", "adminPassword", "restrictedEmail", "restrictedPassword", "mfaKey") {
  if ([string]::IsNullOrWhiteSpace([string]$credentials.$name)) { throw "E2E credential '$name' is missing." }
}

$env:DATABASE_URL = $credentials.databaseUrl
$env:HOST = "127.0.0.1"
$env:PORT = "4100"
$env:APP_ORIGIN = "http://127.0.0.1:3201"
$env:MFA_ENCRYPTION_KEY = $credentials.mfaKey
$env:MEDIA_STORAGE_DIR = Join-Path $env:TEMP "RicaurteTours\e2e-private-media"
$env:LOG_LEVEL = "warn"
$env:API_INTERNAL_URL = "http://127.0.0.1:4100"
$env:CARTAGENA_E2E_BASE_URL = "http://127.0.0.1:3201"
$env:CARTAGENA_E2E_ADMIN_EMAIL = $credentials.adminEmail
$env:CARTAGENA_E2E_ADMIN_PASSWORD = $credentials.adminPassword
$env:CARTAGENA_E2E_RESTRICTED_EMAIL = $credentials.restrictedEmail
$env:CARTAGENA_E2E_RESTRICTED_PASSWORD = $credentials.restrictedPassword
$env:E2E_ADMIN_EMAIL = $credentials.adminEmail
$env:E2E_ADMIN_PASSWORD = $credentials.adminPassword
$env:E2E_RESTRICTED_EMAIL = $credentials.restrictedEmail
$env:E2E_RESTRICTED_PASSWORD = $credentials.restrictedPassword

$env:NODE_ENV = "production"
corepack pnpm --filter @ricaurte/api build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
corepack pnpm --filter @ricaurte/web build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$env:NODE_ENV = "development"
$apiOut = Join-Path $env:TEMP "ricaurte-cartagena-e2e-api.out.log"
$apiErr = Join-Path $env:TEMP "ricaurte-cartagena-e2e-api.err.log"
$api = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "corepack pnpm --filter @ricaurte/api start" -WorkingDirectory $PSScriptRoot\.. -WindowStyle Hidden -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr -PassThru
$web = $null
try {
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 500
    try {
      $status = (Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:4100/api/v1/auth/session" -MaximumRedirection 0 -ErrorAction Stop).StatusCode
    } catch {
      $status = $_.Exception.Response.StatusCode.value__
    }
    if ($status -eq 401) { break }
  }
  if ($status -ne 401) { throw "E2E API did not become ready." }
  $web = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "set NODE_ENV=production&& corepack pnpm --filter @ricaurte/web exec next start -p 3201" -WorkingDirectory $PSScriptRoot\.. -WindowStyle Hidden -PassThru
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 500
    try {
      $status = (Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:3201/ingresar" -MaximumRedirection 0 -ErrorAction Stop).StatusCode
    } catch {
      $status = $_.Exception.Response.StatusCode.value__
    }
    if ($status -eq 200) { break }
  }
  if ($status -ne 200) { throw "E2E web server did not become ready." }
  corepack pnpm --filter @ricaurte/web exec playwright test -c playwright.catalog.config.ts
  exit $LASTEXITCODE
} finally {
  if ($web) { Stop-Process -Id $web.Id -Force -ErrorAction SilentlyContinue }
  Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue
}
