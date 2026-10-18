# Run manually in a terminal that already has the SAME AI_INTERNAL_KEY as BE.
# Does not modify secrets, stop processes, create jobs or reconcile credits.
param([int]$Port = 8002)
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($env:AI_INTERNAL_KEY) -or $env:AI_INTERNAL_KEY.Length -lt 32) {
    throw 'Configure the same AI_INTERNAL_KEY as BE in this terminal (at least 32 characters). Do not paste it into logs or chat.'
}
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    throw 'Port is already listening. This script will not stop an existing AI worker. Review running jobs before replacing it.'
}
$taskPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) { throw 'AI Service virtual environment is missing.' }
# One process-local registry: no --reload and no additional workers/replicas.
& $taskPython -m uvicorn main:app --app-dir $PSScriptRoot --host 127.0.0.1 --port $Port --workers 1
exit $LASTEXITCODE
