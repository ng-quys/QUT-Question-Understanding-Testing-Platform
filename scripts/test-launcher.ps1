# Regression checks run against the real launcher functions in PowerShell 5.1.
# No service is started or stopped, and the real manifest is never modified.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$qutTokens = $null; $qutErrors = $null
$source = Join-Path $PSScriptRoot 'start-qut.ps1'
$tree = [System.Management.Automation.Language.Parser]::ParseFile($source, [ref]$qutTokens, [ref]$qutErrors)
if ($qutErrors.Count) { throw 'Launcher parse failed.' }
foreach ($definition in $tree.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $false)) {
    . ([ScriptBlock]::Create($definition.Extent.Text))
}
$testDir = Join-Path ([System.IO.Path]::GetTempPath()) ('qut-launcher-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testDir | Out-Null
$pidFile = Join-Path $testDir 'processes.json'
$runDir = $testDir
$powershellExe = Join-Path $PSHOME 'powershell.exe'
$startedNow = [System.Collections.Generic.List[object]]::new()
function Assert($Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Record([string]$Name, [int]$ProcessId) { return [pscustomobject]@{name=$Name;pid=$ProcessId;startedTicks='12345';outLog='test.out';errorLog='test.err'} }
try {
    Write-Tracked @()
    Assert (@(Read-Tracked).Count -eq 0) 'Empty manifest did not round-trip.'
    Write-Tracked @((Record 'ai' 1001))
    $single = @(Read-Tracked)
    Assert ($single.Count -eq 1 -and $single[0].pid -eq 1001) 'Single process did not round-trip.'
    Write-Tracked @($single + @((Record 'backend' 1002)))
    Write-Tracked @(@(Read-Tracked) + @((Record 'frontend' 1003)))
    $all = @(Read-Tracked)
    Assert ($all.Count -eq 3 -and $all[2].pid -eq 1003) 'Three sequential services did not round-trip.'
    Assert ((Get-Content $pidFile -Raw) -notmatch '"value"|"Count"') 'Array wrapper was serialized.'

    '[{"value":[{"name":"ai","pid":1001,"startedTicks":"12345"}],"Count":1},{"name":"backend","pid":1002,"startedTicks":"12345"}]' | Set-Content $pidFile
    $recovered = @(Read-Tracked)
    Assert ($recovered.Count -eq 2 -and $recovered[0].pid -eq 1001) 'Existing decorated manifest was not recovered.'
    Write-Tracked $recovered
    Assert ((Get-Content $pidFile -Raw) -notmatch '"value"|"Count"') 'Recovered manifest was not normalized.'
    Assert (-not (Same-Process ([pscustomobject]@{value=@();Count=0}))) 'Invalid entries must not match a process.'
    Assert (-not (Same-Process ([pscustomobject]@{pid=$PID;startedTicks='incorrect'}))) 'Reused PID with another start time must not match.'

    # Exercise startup bookkeeping without launching native processes.
    function Start-Process { [pscustomobject]@{Id=1003;StartTime=[DateTime]::UtcNow} }
    function Same-Process($Entry) { return $true }
    $entry = Start-ServiceProcess 'frontend' $testDir 'exit 0'
    Assert ($entry.pid -eq 1003 -and @(Read-Tracked).Count -eq 3) 'Startup tracking of the third service failed.'
    Write-Host 'PASS: empty/single/multiple records, legacy recovery, PID identity and startup bookkeeping.'
} finally {
    # Only files created in this test-owned directory are removed.
    foreach ($name in @('processes.json', 'frontend.ps1')) {
        $file = Join-Path $testDir $name
        if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file }
    }
    Remove-Item -LiteralPath $testDir
}
