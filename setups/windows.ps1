# Local setup for Windows (PowerShell 5.1+): installs deps, creates .env, migrates and seeds a SQLite file, starts the dev server.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) { throw "Bun is required: https://bun.sh" }

if (-not (Test-Path .env)) {
	$bytes = New-Object byte[] 32
	[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
	$secret = [Convert]::ToBase64String($bytes)
	(Get-Content .env.example) -replace "^BETTER_AUTH_SECRET=.*", "BETTER_AUTH_SECRET=$secret" | Set-Content .env -Encoding utf8
	Write-Host "Created .env - set ADMIN_EMAIL and ADMIN_PASSWORD there if you want other credentials."
}

bun install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
bun run db:migrate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
bun run db:seed
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
bun run dev
