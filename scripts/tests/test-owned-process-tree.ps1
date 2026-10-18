# Integration test against a disposable local HTTP fixture, never ExamFlow/DB.
$ErrorActionPreference='Stop'
$taskRepo=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
. (Join-Path $taskRepo 'scripts/examflow-launcher.ps1')
$taskDir=Join-Path $taskRepo ('backend/target/launcher-test-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $taskDir 'scripts') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $taskDir 'backend') -Force | Out-Null
Copy-Item (Join-Path $taskRepo 'scripts/examflow-service.ps1') (Join-Path $taskDir 'scripts/examflow-service.ps1')
$taskPython=Join-Path $taskRepo 'ai-service/.venv/Scripts/python.exe'
function New-FixturePort {
    $listener=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,0);$listener.Start()
    $value=$listener.LocalEndpoint.Port;$listener.Stop();return $value
}
$taskOwnedPort=New-FixturePort;$taskReusedPort=New-FixturePort
$taskServer=Join-Path $taskDir 'fixture_server.py'
@'
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200); self.end_headers(); self.wfile.write(b'fixture')
HTTPServer(('127.0.0.1',int(sys.argv[1])), Handler).serve_forever()
'@ | Set-Content -LiteralPath $taskServer -Encoding UTF8
$taskCmd=Join-Path $taskDir 'fixture-maven.cmd'
('@"'+$taskPython+'" "'+$taskServer+'" '+$taskOwnedPort) | Set-Content -LiteralPath $taskCmd
$savedPorts=$env:EXAMFLOW_LAUNCH_PORTS;$savedMaven=$env:EXAMFLOW_LAUNCH_MAVEN
$taskOther=$null;$taskRecord=$null
try {
    $env:EXAMFLOW_LAUNCH_PORTS='{}';$env:EXAMFLOW_LAUNCH_MAVEN=$taskCmd
    $taskOther=Start-Process -FilePath $taskPython -ArgumentList ('"'+$taskServer+'" '+$taskReusedPort) -WindowStyle Hidden -PassThru
    $taskRecord=Start-ExamFlowOwnedService $taskDir 'Backend'
    Save-ExamFlowState $taskDir @($taskRecord)
    $watch=[Diagnostics.Stopwatch]::StartNew()
    while($watch.Elapsed.TotalSeconds -lt 35 -and (-not @(Get-ExamFlowListener $taskOwnedPort).Count -or -not @(Get-ExamFlowListener $taskReusedPort).Count)){Start-Sleep -Milliseconds 300}
    if(-not @(Get-ExamFlowListener $taskOwnedPort).Count){throw 'Owned fixture failed to start. Inspect fixture worker log.'}
    Stop-ExamFlow $taskDir
    Start-Sleep -Seconds 2
    if(@(Get-ExamFlowListener $taskOwnedPort).Count){throw 'Owned descendant survived stop.'}
    if(-not @(Get-ExamFlowListener $taskReusedPort).Count){throw 'Pre-existing fixture was incorrectly stopped.'}
    Write-Output 'PASS: owned wrapper/child tree stopped; unowned fixture remains alive.'
} finally {
    if($taskRecord -and (Test-ExamFlowOwnedProcess $taskRecord $taskDir)){Stop-Process -Id $taskRecord.Pid -ErrorAction SilentlyContinue}
    if($taskOther -and -not $taskOther.HasExited){$taskOther.Kill();$taskOther.WaitForExit()}
    $env:EXAMFLOW_LAUNCH_PORTS=$savedPorts;$env:EXAMFLOW_LAUNCH_MAVEN=$savedMaven
}
