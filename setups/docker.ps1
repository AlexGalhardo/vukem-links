# Builds and starts the local Docker stack on http://localhost:3000 (admin@example.com / admin-local-123).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
docker compose up --build @args
