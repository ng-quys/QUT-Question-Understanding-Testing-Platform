$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts/examflow-launcher.ps1')
try { Stop-ExamFlow -Root $PSScriptRoot }
catch { Write-Error ('ExamFlow stop failed: ' + $_.Exception.Message); exit 1 }
