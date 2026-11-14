[CmdletBinding()]
param(
  [string]$ContainerName = "dise-o_agencia_viajes-postgres-1",
  [string]$DatabaseName = "ricaurte_cartagena_e2e",
  [string]$RoleName = "rt_e2e_runner",
  [string]$CredentialsPath = (Join-Path $env:TEMP "ricaurte-cartagena-e2e-credentials.json")
)

$ErrorActionPreference = "Stop"
$docker = Join-Path $env:LOCALAPPDATA "Programs\DockerDesktop\resources\bin\docker.exe"
if (-not (Test-Path -LiteralPath $docker)) { throw "Docker Desktop CLI was not found at $docker." }
& $docker version | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Docker Desktop is not running." }

$inspect = & $docker inspect $ContainerName | ConvertFrom-Json
$postgresUser = ($inspect[0].Config.Env | Where-Object { $_ -like "POSTGRES_USER=*" } | ForEach-Object {
  $_.Substring("POSTGRES_USER=".Length)
})
if ([string]::IsNullOrWhiteSpace($postgresUser)) { throw "POSTGRES_USER is absent from $ContainerName." }

$alphabet = (48..57) + (65..90) + (97..122)
function New-TemporarySecret([int]$Length) {
  -join ($alphabet | Get-Random -Count $Length | ForEach-Object { [char]$_ })
}
$databasePassword = New-TemporarySecret 40
$adminPassword = New-TemporarySecret 32
$restrictedPassword = New-TemporarySecret 32

$roleExists = & $docker exec $ContainerName psql -U $postgresUser -d postgres -Atqc "SELECT 1 FROM pg_roles WHERE rolname='$RoleName'"
$databaseExists = & $docker exec $ContainerName psql -U $postgresUser -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname='$DatabaseName'"
if ($roleExists) {
  & $docker exec $ContainerName psql -v ON_ERROR_STOP=1 -U $postgresUser -d postgres -c "ALTER ROLE $RoleName PASSWORD '$databasePassword'" | Out-Null
} else {
  & $docker exec $ContainerName psql -v ON_ERROR_STOP=1 -U $postgresUser -d postgres -c "CREATE ROLE $RoleName LOGIN PASSWORD '$databasePassword'" | Out-Null
}
if (-not $databaseExists) {
  & $docker exec $ContainerName psql -v ON_ERROR_STOP=1 -U $postgresUser -d postgres -c "CREATE DATABASE $DatabaseName OWNER $RoleName" | Out-Null
}

$credentials = @{
  databaseUrl = "postgresql://${RoleName}:${databasePassword}@127.0.0.1:5433/${DatabaseName}"
  adminEmail = "admin.cartagena-e2e@ricaurte.test"
  adminPassword = $adminPassword
  restrictedEmail = "finance.cartagena-e2e@ricaurte.test"
  restrictedPassword = $restrictedPassword
  mfaKey = [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
} | ConvertTo-Json -Compress
[IO.File]::WriteAllText($CredentialsPath, $credentials, [Text.UTF8Encoding]::new($false))
Write-Output "E2E database is ready. Ephemeral credentials were written outside the repository: $CredentialsPath"
