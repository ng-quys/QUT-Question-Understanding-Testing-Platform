param([string]$ConfigPath = '', [int]$StartupTimeoutSeconds = 180)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts/examflow-launcher.ps1')
try { Start-ExamFlow -Root $PSScriptRoot -ConfigPath $ConfigPath -TimeoutSeconds $StartupTimeoutSeconds }
catch { Write-Error ('ExamFlow startup failed: ' + $_.Exception.Message); exit 1 }
