[CmdletBinding()]
param(
  [ValidateSet("default", "ci")][string]$Instance = "default",
  [string]$CredentialsPath
)

$ErrorActionPreference = "Stop"
$dbName = if ($Instance -eq "ci") { "ricaurte_cartagena_e2e_ci" } else { "ricaurte_cartagena_e2e" }
if (-not $CredentialsPath) {
  $suffix = if ($Instance -eq "ci") { "-ci" } else { "" }
  $CredentialsPath = Join-Path $env:TEMP "ricaurte-cartagena-e2e$suffix-credentials.json"
}
if (-not (Test-Path -LiteralPath $CredentialsPath)) {
  throw "E2E credentials were not found at $CredentialsPath."
}
$credentials = Get-Content -LiteralPath $CredentialsPath -Raw | ConvertFrom-Json
$target = [Uri]$credentials.databaseUrl
if ($target.AbsolutePath.TrimStart('/') -ne $dbName -or $target.Host -notin @("127.0.0.1", "localhost")) {
  throw "Refusing to migrate/seed: databaseUrl must point to the local $dbName database."
}
Write-Host "[seed] target database: $($target.Host):$($target.Port)/$dbName"
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
