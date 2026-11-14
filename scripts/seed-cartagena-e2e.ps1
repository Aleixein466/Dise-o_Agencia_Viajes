[CmdletBinding()]
param(
  [string]$CredentialsPath = (Join-Path $env:TEMP "ricaurte-cartagena-e2e-credentials.json")
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $CredentialsPath)) {
  throw "E2E credentials were not found at $CredentialsPath."
}
$credentials = Get-Content -LiteralPath $CredentialsPath -Raw | ConvertFrom-Json
$env:DATABASE_URL = $credentials.databaseUrl
$env:BOOTSTRAP_ADMIN_EMAIL = $credentials.adminEmail
$env:BOOTSTRAP_ADMIN_PASSWORD = $credentials.adminPassword
$env:BOOTSTRAP_ADMIN_NAME = "Operador Temporal"
$env:E2E_ADMIN_EMAIL = $credentials.adminEmail
$env:E2E_ADMIN_PASSWORD = $credentials.adminPassword
$env:E2E_RESTRICTED_EMAIL = $credentials.restrictedEmail
$env:E2E_RESTRICTED_PASSWORD = $credentials.restrictedPassword

corepack pnpm --filter @ricaurte/db migrate:deploy
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
corepack pnpm --filter @ricaurte/api auth:bootstrap
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
corepack pnpm --filter @ricaurte/api e2e:seed-cartagena
exit $LASTEXITCODE
