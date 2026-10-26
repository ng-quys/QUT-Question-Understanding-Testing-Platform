# Windows PowerShell 5.1 compatible. Secrets are never printed or copied into runners.
[CmdletBinding()]
param([switch]$CheckOnly, [switch]$Stop, [switch]$WebOnly, [switch]$NoBrowser)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runDir = Join-Path $projectRoot '.qut-run'
$pidFile = Join-Path $runDir 'processes.json'
$powershellExe = Join-Path $PSHOME 'powershell.exe'
$startedNow = [System.Collections.Generic.List[object]]::new()

function Info([string]$Message) { Write-Host ('[QUT] ' + $Message) -ForegroundColor Cyan }
function Literal([string]$Value) { return "'" + $Value.Replace("'", "''") + "'" }
function Find-Tool([string]$Name) {
    $tool = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($tool) { return $tool.Source }
    return $null
}
function Test-DockerReady([string]$DockerPath, [int]$TimeoutSeconds = 15) {
    $probe = [System.Diagnostics.Process]::new()
    try {
        $probe.StartInfo.FileName = $DockerPath
        $probe.StartInfo.Arguments = 'info'
        $probe.StartInfo.UseShellExecute = $false
        $probe.StartInfo.CreateNoWindow = $true
        $probe.StartInfo.RedirectStandardOutput = $true
        $probe.StartInfo.RedirectStandardError = $true
        if (-not $probe.Start()) { return $false }
        # Drain both pipes asynchronously; never print Docker configuration.
        $discardOutput = $probe.StandardOutput.ReadToEndAsync()
        $discardError = $probe.StandardError.ReadToEndAsync()
        if (-not $probe.WaitForExit($TimeoutSeconds * 1000)) {
            # Only terminate this read-only probe, never Docker Desktop/containers.
            try { $probe.Kill(); $null = $probe.WaitForExit(1000) } catch { }
            return $false
        }
        return ($probe.ExitCode -eq 0)
    } catch { return $false }
    finally { $probe.Dispose() }
}
function Read-Properties([string]$Path) {
    $values = @{}
    foreach ($line in [System.IO.File]::ReadAllLines($Path)) {
        if ($line -match '^\s*([^#!\s][^=]*?)\s*=\s*(.*)$') { $values[$matches[1].Trim()] = $matches[2].Trim() }
    }
    return $values
}
function Resolve-Setting([string]$Value) {
    if ($Value -match '^\$\{([A-Za-z_][A-Za-z0-9_]*)(?::(.*))?\}$') {
        $environmentValue = [Environment]::GetEnvironmentVariable($matches[1])
        if ($null -ne $environmentValue) { return $environmentValue }
        return $matches[2]
    }
    return $Value
}
function Read-Http([string]$Url) {
    try { return Invoke-RestMethod -Uri $Url -TimeoutSec 3 -UseBasicParsing }
    catch { return $null }
}
function Port-InUse([int]$Port) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try { $connection = $client.BeginConnect('127.0.0.1', $Port, $null, $null); if (-not $connection.AsyncWaitHandle.WaitOne(500)) { return $false }; $client.EndConnect($connection); return $true }
    catch { return $false }
    finally { $client.Dispose() }
}
function Service-Ready([string]$Name, [string]$Url) {
    $response = Read-Http $Url
    if ($null -eq $response) { return $false }
    switch ($Name) {
        'backend' { return ($response.PSObject.Properties.Name -contains 'application' -and $response.application -eq 'ExamFlow AI Backend' -and $response.status -eq 'UP') }
        'ai' { return ($response.PSObject.Properties.Name -contains 'serviceVersion' -and $response.serviceVersion -like 'qut-local-*') }
        'frontend' { return ($response -is [string] -and $response -match 'data-qut-app="portal"') }
        'frontend-admin' { return ($response -is [string] -and $response -match 'data-qut-app="admin"') }
    }
    return $false
}
function Expand-Tracked($Value) {
    if ($null -eq $Value) { return }
    if ($Value -is [System.Array]) {
        foreach ($item in $Value) { Expand-Tracked $item }
        return
    }
    $properties = @($Value.PSObject.Properties.Name)
    # Recover manifests written by Windows PowerShell 5.1's decorated-array
    # serialization: { "value": [...], "Count": 1 }.
    if ($properties -contains 'value' -and $properties -notcontains 'pid') {
        Expand-Tracked $Value.value
        return
    }
    if ($properties -notcontains 'pid' -or $properties -notcontains 'startedTicks' -or $properties -notcontains 'name') {
        throw 'Invalid process manifest entry. No unverified process will be stopped.'
    }
    return $Value
}
function Read-Tracked {
    if (-not (Test-Path -LiteralPath $pidFile)) { return @() }
    try {
        $parsed = ConvertFrom-Json -InputObject (Get-Content -LiteralPath $pidFile -Raw)
        Expand-Tracked $parsed
    }
    catch { throw 'Cannot read .qut-run/processes.json. Do not stop processes by an unverified PID.' }
}
function Write-Tracked([object[]]$Processes) {
    # Serialize records individually so array wrapper properties cannot leak
    # into the manifest on Windows PowerShell 5.1.
    $records = @(foreach ($entry in $Processes) {
        foreach ($item in @(Expand-Tracked $entry)) {
            $clean = [ordered]@{ name = [string]$item.name; pid = [int]$item.pid; startedTicks = [string]$item.startedTicks }
            if ($item.PSObject.Properties.Name -contains 'outLog') { $clean['outLog'] = [string]$item.outLog }
            if ($item.PSObject.Properties.Name -contains 'errorLog') { $clean['errorLog'] = [string]$item.errorLog }
            ConvertTo-Json -InputObject $clean -Depth 3 -Compress
        }
    })
    ('[' + ($records -join ',') + ']') | Set-Content -LiteralPath $pidFile -Encoding UTF8
}
function Same-Process($Entry) {
    if ($null -eq $Entry) { return $false }
    $properties = @($Entry.PSObject.Properties.Name)
    if ($properties -notcontains 'pid' -or $properties -notcontains 'startedTicks') { return $false }
    try {
        $candidate = Get-Process -Id ([int]$Entry.pid) -ErrorAction SilentlyContinue
        if (-not $candidate) { return $false }
        return ($candidate.ProcessName -eq 'powershell' -and $candidate.StartTime.ToUniversalTime().Ticks.ToString() -eq [string]$Entry.startedTicks)
    }
    catch { return $false }
}
function Stop-Owned([object[]]$Entries) {
    foreach ($entry in $Entries) {
        if (Same-Process $entry) {
            Info ('Stopping launcher-owned ' + $entry.name)
            # Only the verified wrapper PID and its child tree are stopped.
            & taskkill.exe /PID ([string]$entry.pid) /T /F | Out-Null
        }
    }
}
function Start-ServiceProcess([string]$Name, [string]$Directory, [string]$Command, [string[]]$EnvironmentLines = @()) {
    $runner = Join-Path $runDir ($Name + '.ps1')
    @('$ErrorActionPreference = ''Stop''', ('Set-Location -LiteralPath ' + (Literal $Directory))) + $EnvironmentLines + @($Command, 'exit $LASTEXITCODE') | Set-Content -LiteralPath $runner -Encoding UTF8
    $outLog = Join-Path $runDir ($Name + '.out.log')
    $errorLog = Join-Path $runDir ($Name + '.err.log')
    $child = Start-Process -FilePath $powershellExe -ArgumentList @('-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $runner + '"')) -WorkingDirectory $Directory -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errorLog -PassThru
    $entry = [pscustomobject]@{ name = $Name; pid = $child.Id; startedTicks = $child.StartTime.ToUniversalTime().Ticks.ToString(); outLog = $outLog; errorLog = $errorLog }
    $startedNow.Add($entry)
    $previous = @(Read-Tracked | Where-Object { Same-Process $_ })
    Write-Tracked @($previous + @($entry))
    return $entry
}
function Wait-Service([string]$Name, [string]$Url, [int]$Seconds, $Entry = $null) {
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    Info ('Waiting for ' + $Name + '...')
    while ([DateTime]::UtcNow -lt $deadline) {
        if (Service-Ready $Name $Url) { Info ($Name + ' is ready.'); return }
        if ($null -ne $Entry -and -not (Same-Process $Entry)) { throw ($Name + ' exited. See .qut-run/' + $Name + '.out.log and .err.log.') }
        Start-Sleep -Seconds 1
    }
    throw ($Name + ' did not become ready. See .qut-run logs; check ports, database and configuration.')
}
function Find-AiPython {
    $candidates = @((Join-Path $projectRoot 'anticheating/.venv/Scripts/python.exe'), (Join-Path $projectRoot 'anticheating/.venv-launcher/Scripts/python.exe'))
    $local = [Environment]::GetFolderPath('LocalApplicationData')
    $candidates += Join-Path $local 'Programs/Python/Python311/python.exe'
    $default = Find-Tool 'python.exe'
    if ($default) { $candidates += $default }
    $py = Find-Tool 'py.exe'
    if ($py) {
        foreach ($version in @('-3.11', '-3.10')) {
            try { $path = & $py $version -c 'import sys; print(sys.executable)' 2>$null } catch { continue }
            if ($LASTEXITCODE -eq 0 -and $path) { $candidates += [string]($path | Select-Object -Last 1) }
        }
    }
    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if (-not $candidate -or -not (Test-Path -LiteralPath $candidate)) { continue }
        try { & $candidate -c 'import sys; sys.exit(0 if sys.version_info[:2] in [(3,10),(3,11)] else 1)' 2>$null } catch { continue }
        if ($LASTEXITCODE -eq 0) { return $candidate }
    }
    return $null
}

try {
    Set-Location -LiteralPath $projectRoot
    if ($Stop) {
        Stop-Owned @(Read-Tracked)
        if (Test-Path -LiteralPath $pidFile) { Write-Tracked @() }
        Info 'Stopped launcher-owned processes. Pre-existing services are unchanged.'
        exit 0
    }
    Write-Host '=== QUT / ExamFlow - local launcher ===' -ForegroundColor White
    $configPath = Join-Path $projectRoot 'backend/src/main/resources/application.properties'
    $settings = Read-Properties $configPath
    foreach ($key in @('spring.datasource.url', 'spring.datasource.username', 'spring.datasource.password')) {
        if (-not $settings.ContainsKey($key) -or [string]::IsNullOrWhiteSpace((Resolve-Setting $settings[$key])) -or $settings[$key] -match 'YOUR_|change-me') {
            throw ('Missing configuration: ' + $key + '. Set it locally in application.properties or its referenced environment variable; never send credentials in chat.')
        }
    }
    $backendPort = if ($env:SERVER_PORT) { [int]$env:SERVER_PORT } elseif ($settings.ContainsKey('server.port')) { [int](Resolve-Setting $settings['server.port']) } else { 8080 }
    $backendUrl = 'http://127.0.0.1:' + $backendPort
    $frontendUrl = 'http://localhost:5173'
    $adminUrl = 'http://localhost:5174'
    $npm = Find-Tool 'npm.cmd'
    $java = Find-Tool 'java.exe'
    $maven = Find-Tool 'mvn.cmd'
    if (-not $maven) { $maven = Join-Path $projectRoot 'backend/mvnw.cmd' }
    if (-not $npm) { throw 'Install Node.js (22.12+ or 20.19+), then run CHAY_QUT.bat again.' }
    if (-not $java) { throw 'Install JDK 17+ and configure JAVA_HOME, then run again.' }
    $node = Find-Tool 'node.exe'
    & $node -e 'const [a,b]=process.versions.node.split(String.fromCharCode(46)).map(Number); process.exit((a===20&&b>=19)||(a===22&&b>=12)||a>22?0:1)'
    if ($LASTEXITCODE -ne 0) { throw 'Node.js must be 20.19+ or 22.12+ for this Vite version.' }
    $aiReady = $false
    $aiPython = $null
    if (-not $WebOnly) {
        $aiReady = Service-Ready 'ai' 'http://127.0.0.1:8000/health'
        if (-not $aiReady) {
            $aiPython = Find-AiPython
            if (-not $aiPython) { throw 'AI requires Python 3.11 (or 3.10). Existing .venv may point to another computer. Install Python 3.11 from python.org, then run this file again. Do not remove your models or photos. To run only the website: CHAY_QUT.bat -WebOnly' }
        }
    }
    Info 'Tool and configuration checks passed. No secret values are displayed.'
    if ($CheckOnly) {
        foreach ($service in @(@('backend',($backendUrl + '/api/health')), @('frontend',$frontendUrl), @('frontend-admin',$adminUrl))) { Info ($service[0] + ': ' + (Service-Ready $service[0] $service[1])) }
        if (-not $WebOnly) { Info ('AI HTTP service: ' + $aiReady) }
        Info 'CheckOnly finished. No services or installers were started.'
        exit 0
    }
    New-Item -ItemType Directory -Path $runDir -Force | Out-Null
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules/vite')) -or -not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules/@qut/shared'))) {
        Info 'Installing frontend workspace packages (first run only)...'
        Push-Location $projectRoot
        try { & $npm ci; if ($LASTEXITCODE -ne 0) { throw 'npm ci failed. Check network access and the root package-lock.json.' } } finally { Pop-Location }
    }
    if (-not $WebOnly -and -not $aiReady) {
        # Preserve a copied/broken .venv; create a separate local environment instead.
        if ($aiPython -notlike '*\.venv\Scripts\python.exe' -and $aiPython -notlike '*\.venv-launcher\Scripts\python.exe') {
            $venv = Join-Path $projectRoot 'anticheating/.venv-launcher'
            Info 'Creating local Python environment in anticheating/.venv-launcher...'
            & $aiPython -m venv $venv
            if ($LASTEXITCODE -ne 0) { throw 'Cannot create the Python environment.' }
            $aiPython = Join-Path $venv 'Scripts/python.exe'
        }
        $probe = "import importlib.util,sys; names=['cv2','mediapipe','onnxruntime','sounddevice','webrtcvad','insightface','ultralytics','sklearn','joblib','pkg_resources']; sys.exit(any(importlib.util.find_spec(n) is None for n in names))"
        & $aiPython -c $probe
        if ($LASTEXITCODE -ne 0) {
            Info 'Installing AI packages (first run; this can take several minutes)...'
            & $aiPython -m pip install -r (Join-Path $projectRoot 'anticheating/requirements.txt')
            if ($LASTEXITCODE -ne 0) { throw 'AI package installation failed. InsightFace may need Microsoft C++ Build Tools. Read the pip error above.' }
        }
        & $aiPython (Join-Path $projectRoot 'anticheating/check_models.py')
        if ($LASTEXITCODE -ne 0) { throw 'Required models are missing. Add the model files listed above; the launcher never downloads or replaces model weights.' }
        & $aiPython (Join-Path $projectRoot 'anticheating/configure_local.py')
        if ($LASTEXITCODE -ne 0) { throw 'Cannot synchronize the local AI/backend configuration.' }
        Push-Location (Join-Path $projectRoot 'anticheating')
        try { & $aiPython -m src.head_direction_model; if ($LASTEXITCODE -ne 0) { throw 'M4 model cannot be loaded. Check Python dependencies and the supplied model.' } } finally { Pop-Location }
    }
    if (-not $WebOnly -and -not $aiReady) {
        if (Port-InUse 8000) { throw 'Port 8000 is occupied by another service. No process was stopped.' }
        $aiEnv = @('$env:ANTICHEAT_INTERNAL_SECRET = $null', '$env:APP_ANTICHEAT_SECRET = $null', '$env:ANTICHEAT_PROFILE_DIR = $null', '$env:ANTICHEAT_SERVICE_HOST = $null', '$env:ANTICHEAT_SERVICE_PORT = $null', '$env:ANTICHEAT_BACKEND_CALLBACK_URL = $null')
        $ai = Start-ServiceProcess 'ai' (Join-Path $projectRoot 'anticheating') ('& ' + (Literal $aiPython) + ' -u app/run_service.py') $aiEnv
        Wait-Service 'ai' 'http://127.0.0.1:8000/health' 30 $ai
    }
    if (-not (Service-Ready 'backend' ($backendUrl + '/api/health'))) {
        if (Port-InUse $backendPort) { throw ('Port ' + $backendPort + ' is occupied by another application. No process was stopped.') }
        # Use a normalized project path for Windows AF_UNIX sockets. Short-name TEMP paths
        # can make Java HttpClient fail with "Unable to establish loopback connection".
        $backendJvm = '-Djdk.net.unixdomain.tmpdir="' + $runDir + '"'
        $backend = Start-ServiceProcess 'backend' (Join-Path $projectRoot 'backend') ('& ' + (Literal $maven) + ' ' + (Literal ('-Dspring-boot.run.jvmArguments=' + $backendJvm)) + ' spring-boot:run')
        Wait-Service 'backend' ($backendUrl + '/api/health') 240 $backend
    } else { Info 'Reusing existing backend. Restart it manually after changing Java/configuration.' }
    if (-not (Service-Ready 'frontend' $frontendUrl)) {
        if (Port-InUse 5173) { throw 'Port 5173 is occupied by another application. No process was stopped.' }
        $frontend = Start-ServiceProcess 'frontend' (Join-Path $projectRoot 'frontend') ('& ' + (Literal $npm) + ' run dev -- --host 127.0.0.1 --port 5173 --strictPort') @(('$env:VITE_API_URL = ' + (Literal ($backendUrl + '/api'))), ('$env:VITE_ADMIN_URL = ' + (Literal $adminUrl)))
        Wait-Service 'frontend' $frontendUrl 45 $frontend
    } else { Info 'Reusing existing frontend.' }
    if (-not (Service-Ready 'frontend-admin' $adminUrl)) {
        if (Port-InUse 5174) { throw 'Port 5174 is occupied by another application. No process was stopped.' }
        $admin = Start-ServiceProcess 'frontend-admin' (Join-Path $projectRoot 'frontend-admin') ('& ' + (Literal $npm) + ' run dev -- --host 127.0.0.1 --port 5174 --strictPort') @(('$env:VITE_API_URL = ' + (Literal ($backendUrl + '/api'))), ('$env:VITE_PORTAL_URL = ' + (Literal $frontendUrl)))
        Wait-Service 'frontend-admin' $adminUrl 45 $admin
    } else { Info 'Reusing existing admin frontend.' }
    Write-Host ''
    Info ('Website: ' + $frontendUrl)
    Info ('Admin:   ' + $adminUrl)
    Info 'Logs: .qut-run/*.out.log and *.err.log'
    Info 'Use DUNG_QUT.bat to stop only services started by this launcher.'
    if ($WebOnly) { Write-Warning 'WebOnly mode: Python AI was not started. Exams requiring AI need the AI service.' }
    if (-not $NoBrowser) { Start-Process $frontendUrl -WindowStyle Hidden }
    exit 0
} catch {
    Write-Host ('[ERROR] ' + $_.Exception.Message) -ForegroundColor Red
    if ($startedNow.Count -gt 0) { Stop-Owned @($startedNow.ToArray()) }
    Write-Host 'No Supabase password is required in chat. Keep credentials in local server configuration.'
    exit 1
}
