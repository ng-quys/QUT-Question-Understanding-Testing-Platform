# Test harness: loads only launcher functions; it never executes a real Uvicorn.
param([uri]$BackendBaseUri, [switch]$BusyPort, [switch]$MissingPython)
$ErrorActionPreference='Stop'
$taskTokens=$null; $taskErrors=$null
$taskAst=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'start-ai-credits.ps1'),[ref]$taskTokens,[ref]$taskErrors)
if($taskErrors.Count){throw 'Launcher syntax error'}
foreach($taskFunction in $taskAst.EndBlock.Statements | Where-Object {$_ -is [System.Management.Automation.Language.FunctionDefinitionAst]}) {
    Invoke-Expression $taskFunction.Extent.Text
}
function Get-NetTCPConnection { if($BusyPort){return 'occupied'} }
function Test-Path { return -not $MissingPython }
function Invoke-AiCreditsUvicorn {
    param([string]$Python,[string]$AppDir,[int]$Port)
    Write-Output 'TEST_UVICORN_STARTED'
}
try {
    Start-ExamFlowAiCredits -Port 8002 -BackendBaseUri $BackendBaseUri -AppDir $PSScriptRoot
    exit 0
} catch {
    Write-Output ('START_BLOCKED: '+$_.Exception.Message)
    exit 1
}
