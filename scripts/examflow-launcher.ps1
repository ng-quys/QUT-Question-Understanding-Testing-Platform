# Shared lifecycle functions. Dot-sourcing this file never starts/stops services.
function Get-ExamFlowRuntimeDir {
    param([string]$Root)
    # Already ignored by the repository's .env.* rule; survives Maven clean.
    Join-Path $Root '.env.examflow.runtime'
}
function Enter-ExamFlowLock {
    param([string]$Root)
    $hash=[Security.Cryptography.SHA256]::Create()
    try {$id=([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($Root.ToLowerInvariant())))).Replace('-','')}
    finally {$hash.Dispose()}
    $mutex=New-Object Threading.Mutex($false,('Local\ExamFlowLauncher_'+$id))
    try {$held=$mutex.WaitOne(0)} catch [Threading.AbandonedMutexException] {$held=$true}
    if(-not $held){$mutex.Dispose();throw 'Another ExamFlow launcher/stop operation is in progress.'}
    return $mutex
}
function Read-ExamFlowState {
    param([string]$Root)
    $path=Join-Path (Get-ExamFlowRuntimeDir $Root) 'state.json'
    if(Test-Path -LiteralPath $path){
        $items=Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
        # Windows PowerShell 5 does not enumerate a JSON array in the pipeline.
        foreach($record in $items){
            if($record.Pid -is [array] -or $record.Name -isnot [string] -or $record.Root -isnot [string] -or [int]$record.Pid -le 0){throw 'Invalid launcher process metadata; no process was targeted.'}
            Write-Output $record
        }
    }
}
function Save-ExamFlowState {
    param([string]$Root,[array]$Records)
    $dir=Get-ExamFlowRuntimeDir $Root
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    $path=Join-Path $dir 'state.json';$temp=$path+'.tmp-'+$PID
    # Metadata only. No environment variables, headers, credentials or JWTs.
    [IO.File]::WriteAllText($temp,(ConvertTo-Json -InputObject @($Records) -Depth 4))
    Move-Item -LiteralPath $temp -Destination $path -Force
}
function Test-ExamFlowOwnedProcess {
    param($Record,[string]$Root)
    if($Record.Pid -is [array] -or $Record.Root -ne $Root -or $Record.Name -notin @('Ollama','Backend','AIGenerator','AntiCheating','Frontend')){return $false}
    $process=Get-Process -Id $Record.Pid -ErrorAction SilentlyContinue
    if(-not $process){return $false}
    if([string]$process.StartTime.ToUniversalTime().ToFileTimeUtc() -ne [string]$Record.Started){return $false}
    $meta=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$Record.Pid)
    $worker=Join-Path $Root 'scripts/examflow-service.ps1'
    return $meta.CommandLine.IndexOf($worker,[StringComparison]::OrdinalIgnoreCase) -ge 0 -and
        $meta.CommandLine.Contains('"'+$Record.Name+'"') -and $Record.Root -eq $Root
}
function Get-ExamFlowListener {
    param([int]$Port)
    @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique)
}
function Invoke-ExamFlowHttp {
    param([string]$Url,[string]$HeaderName='',[string]$HeaderValue='')
    Add-Type -AssemblyName System.Net.Http
    $handler=New-Object Net.Http.HttpClientHandler;$handler.UseProxy=$false;$handler.AllowAutoRedirect=$false
    $client=New-Object Net.Http.HttpClient($handler);$client.Timeout=[TimeSpan]::FromSeconds(3)
    $request=New-Object Net.Http.HttpRequestMessage([Net.Http.HttpMethod]::Get,$Url)
    $request.Version=[version]'1.1';$response=$null
    try {
        if($HeaderName){$request.Headers.Add($HeaderName,$HeaderValue)}
        $response=$client.SendAsync($request).GetAwaiter().GetResult()
        $text=$response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        return @{Status=[int]$response.StatusCode;Text=$text}
    } catch {return @{Status=0;Text=''}}
    finally {if($response){$response.Dispose()};$request.Dispose();$client.Dispose();$handler.Dispose()}
}
function Get-ExamFlowSetting {
    param([string]$Path,[string]$Name)
    foreach($line in Get-Content -LiteralPath $Path){
        if($line.StartsWith($Name+'=')){return $line.Substring($Name.Length+1).Trim()}
    }
    return ''
}
function Get-ExamFlowMaven {
    param([string]$Root,[string]$Configured='')
    if($Configured){
        if(-not [IO.Path]::IsPathRooted($Configured)){$Configured=Join-Path $Root $Configured}
        if(-not(Test-Path -LiteralPath $Configured)){throw 'Configured Maven executable is missing.'}
        return (Resolve-Path -LiteralPath $Configured).Path
    }
    $url=Get-ExamFlowSetting (Join-Path $Root 'backend/.mvn/wrapper/maven-wrapper.properties') 'distributionUrl'
    $version=[regex]::Match($url,'apache-maven-([\d.]+)-bin').Groups[1].Value
    if($version){
        $sha=[Security.Cryptography.SHA256]::Create()
        try {$digest=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($url)))).Replace('-','').ToLowerInvariant()}
        finally {$sha.Dispose()}
        $cached=Join-Path $env:USERPROFILE ('.m2/wrapper/dists/apache-maven-'+$version+'/'+$digest+'/bin/mvn.cmd')
        if(Test-Path -LiteralPath $cached){return $cached}
    }
    $mvn=Get-Command mvn.cmd -ErrorAction SilentlyContinue
    if($mvn){return $mvn.Source}
    throw 'Maven is not available. Configure MavenPath or prepare the existing Maven Wrapper distribution first; no installer was run.'
}
function Get-ExamFlowPlan {
    param([string]$Root,$Config)
    $properties=Join-Path $Root 'backend/src/main/resources/application.properties'
    $bePort=[int](Get-ExamFlowSetting $properties 'server.port')
    $aiUri=[uri](Get-ExamFlowSetting $properties 'ai.rag.url')
    $antiUri=[uri](Get-ExamFlowSetting $properties 'app.anticheat.url')
    $ollamaUri=[uri](Get-ExamFlowSetting $properties 'ai.ollama.url')
    $ports=@{Ollama=$ollamaUri.Port;Backend=$bePort;AIGenerator=$aiUri.Port;AntiCheating=$antiUri.Port;Frontend=5173}
    if($Config.Ports){foreach($p in $Config.Ports.PSObject.Properties){if(-not $ports.ContainsKey($p.Name)){throw 'Unknown service port configuration.'};$ports[$p.Name]=[int]$p.Value}}
    foreach($p in $ports.Values){if($p -lt 1 -or $p -gt 65535){throw 'Invalid service port.'}}
    if(@($ports.Values | Select-Object -Unique).Count -ne 5){throw 'Service ports must be distinct.'}
    $model=Get-ExamFlowSetting $properties 'ai.ollama.model'
    if($env:OLLAMA_MODEL){$model=$env:OLLAMA_MODEL}
    $embed='nomic-embed-text'
    if($env:OLLAMA_EMBED_MODEL){$embed=$env:OLLAMA_EMBED_MODEL}
    # Respect the AI service's existing non-secret model settings when no env override exists.
    $aiEnv=Join-Path $Root 'ai-service/.env'
    if(Test-Path -LiteralPath $aiEnv){
        if(-not $env:OLLAMA_MODEL){$v=Get-ExamFlowSetting $aiEnv 'OLLAMA_MODEL';if($v){$model=$v.Trim('"',"'")}}
        if(-not $env:OLLAMA_EMBED_MODEL){$v=Get-ExamFlowSetting $aiEnv 'OLLAMA_EMBED_MODEL';if($v){$embed=$v.Trim('"',"'")}}
    }
    return @{Ports=$ports;Model=$model;Embed=$embed}
}
function Test-ExamFlowReady {
    param([string]$Name,[hashtable]$Plan,[string]$Root)
    $port=$Plan.Ports[$Name];$base='http://127.0.0.1:'+$port
    try {
        switch($Name){
            'Ollama' {
                $r=Invoke-ExamFlowHttp ($base+'/api/tags');if($r.Status -ne 200){return $false}
                $names=@(($r.Text | ConvertFrom-Json).models | ForEach-Object {$_.name})
                foreach($model in @($Plan.Model,$Plan.Embed)){if($model -notin $names -and ($model+':latest') -notin $names){return $false}}
                return $true
            }
            'Backend' {
                $r=Invoke-ExamFlowHttp ($base+'/api/health');if($r.Status -ne 200){return $false}
                if(($r.Text | ConvertFrom-Json).application -ne 'ExamFlow AI Backend'){return $false}
                # Reuse the mandatory handshake implementation, not a health-based key check.
                return (Get-AiCreditsBackendStatus -BackendBaseUri ([uri]$base)) -eq 204
            }
            'AIGenerator' {
                $r=Invoke-ExamFlowHttp ($base+'/health');if($r.Status -ne 200){return $false}
                $data=$r.Text | ConvertFrom-Json
                if($data.model -ne $Plan.Model -or ([uri]$data.ollama_url).Port -ne $Plan.Ports.Ollama){return $false}
                $r=Invoke-ExamFlowHttp ($base+'/credits/jobs/00000000-0000-0000-0000-000000000000') 'X-AI-Internal-Key' $env:AI_INTERNAL_KEY
                return $r.Status -eq 404 -and ($r.Text | ConvertFrom-Json).detail -eq 'Unknown execution token; backend reconciliation required'
            }
            'AntiCheating' {
                $r=Invoke-ExamFlowHttp ($base+'/health');if($r.Status -ne 200){return $false}
                $data=$r.Text | ConvertFrom-Json
                $owners=Get-ExamFlowListener $port
                if($owners.Count -ne 1){return $false}
                $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$owners[0])
                return $data.ok -eq $true -and $null -ne $data.running -and $process.CommandLine -match 'run_service\.py'
            }
            'Frontend' {
                $r=Invoke-ExamFlowHttp $base
                if($r.Status -ne 200 -or $r.Text -notmatch '/@vite/client'){return $false}
                $owners=Get-ExamFlowListener $port;if($owners.Count -ne 1){return $false}
                $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$owners[0])
                return $process.CommandLine.Replace('/','\').IndexOf((Join-Path $Root 'frontend'),[StringComparison]::OrdinalIgnoreCase) -ge 0
            }
        }
    } catch {return $false}
    return $false
}
function Start-ExamFlowOwnedService {
    param([string]$Root,[string]$Name)
    $dir=Get-ExamFlowRuntimeDir $Root;$logs=Join-Path $dir 'logs'
    New-Item -ItemType Directory -Path $logs -Force | Out-Null
    $worker=Join-Path $Root 'scripts/examflow-service.ps1'
    $stamp=Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $arguments='-NoProfile -NonInteractive -File "'+$worker+'" -Root "'+$Root+'" -Service "'+$Name+'"'
    # Secrets are inherited in environment, never passed on command line or written to state.
    $shell=(Get-Command powershell.exe -ErrorAction Stop).Source
    $process=Start-Process -FilePath $shell -ArgumentList $arguments -WindowStyle Hidden -PassThru -WorkingDirectory $Root -RedirectStandardOutput (Join-Path $logs ($Name+'-'+$stamp+'.stdout.log')) -RedirectStandardError (Join-Path $logs ($Name+'-'+$stamp+'.stderr.log'))
    return [pscustomobject]@{Name=$Name;Pid=$process.Id;Started=[string]$process.StartTime.ToUniversalTime().ToFileTimeUtc();Root=$Root}
}
function Wait-ExamFlowService {
    param([string]$Root,[string]$Name,[hashtable]$Plan,$Record,[int]$TimeoutSeconds)
    $watch=[Diagnostics.Stopwatch]::StartNew()
    while($watch.Elapsed.TotalSeconds -lt $TimeoutSeconds){
        if(-not(Test-ExamFlowOwnedProcess $Record $Root)){throw ($Name+' launcher process exited. See its separate logs.')}
        if(Test-ExamFlowReady $Name $Plan $Root){return}
        Start-Sleep -Seconds 1
    }
    throw ($Name+' readiness timed out. See logs; processes were not automatically killed.')
}
function Start-ExamFlow {
    param([string]$Root,[string]$ConfigPath,[int]$TimeoutSeconds=180)
    $Root=[IO.Path]::GetFullPath($Root);$mutex=Enter-ExamFlowLock $Root;$saved=@{}
    try {
        if(-not $ConfigPath){$ConfigPath=Join-Path $Root '.env.examflow.local.json'}
        elseif(-not [IO.Path]::IsPathRooted($ConfigPath)){$ConfigPath=Join-Path $Root $ConfigPath}
        $config=[pscustomobject]@{}
        if(Test-Path -LiteralPath $ConfigPath){
            try {$config=Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json} catch {throw 'Local launcher config is invalid JSON (contents suppressed).'}
        }
        $allowed=@('AI_INTERNAL_KEY','ANTICHEAT_INTERNAL_SECRET','QUESTION_BANK_DB_PASSWORD','SPRING_DATASOURCE_PASSWORD','EXAMFLOW_QUESTIONBANK_DSN','OLLAMA_MODEL','OLLAMA_EMBED_MODEL')
        function Set-LaunchEnv([string]$Name,[string]$Value){
            if(-not $saved.ContainsKey($Name)){$saved[$Name]=[Environment]::GetEnvironmentVariable($Name,'Process')}
            [Environment]::SetEnvironmentVariable($Name,$Value,'Process')
        }
        if($config.Environment){foreach($v in $config.Environment.PSObject.Properties){
            if($v.Name -notin $allowed){throw 'Unsupported environment field in local config. JWT/token fields are not accepted.'}
            if($v.Value){Set-LaunchEnv $v.Name ([string]$v.Value)}
        }}
        if([string]::IsNullOrWhiteSpace($env:AI_INTERNAL_KEY) -or $env:AI_INTERNAL_KEY.Length -lt 32){throw 'AI_INTERNAL_KEY is required (at least 32 characters).'}
        if([string]::IsNullOrWhiteSpace($env:ANTICHEAT_INTERNAL_SECRET) -or $env:ANTICHEAT_INTERNAL_SECRET -eq 'change-me'){throw 'ANTICHEAT_INTERNAL_SECRET is required; the default is not accepted.'}
        if([string]::IsNullOrWhiteSpace($env:QUESTION_BANK_DB_PASSWORD)){throw 'QUESTION_BANK_DB_PASSWORD is required for the existing BE datasource.'}
        if($env:SPRING_JPA_HIBERNATE_DDL_AUTO -and $env:SPRING_JPA_HIBERNATE_DDL_AUTO -ne 'validate'){throw 'Only existing ddl-auto=validate is supported; no schema-changing startup mode is allowed.'}
        $plan=Get-ExamFlowPlan $Root $config
        $maven=Get-ExamFlowMaven $Root $config.MavenPath
        foreach($file in @('ai-service/.venv/Scripts/python.exe','anticheating/.venv/Scripts/python.exe','anticheating/app/run_service.py','frontend/node_modules/vite/bin/vite.js')){
            if(-not(Test-Path -LiteralPath (Join-Path $Root $file))){throw ('Missing prerequisite: '+$file+'. Install dependencies separately.')}
        }
        $ollama=Get-Command ollama.exe -ErrorAction SilentlyContinue
        if(-not $ollama){throw 'Ollama executable is not installed/on PATH.'}
        $npm=Get-Command npm.cmd -ErrorAction SilentlyContinue;if(-not $npm){throw 'npm.cmd is missing.'}
        # Import ONLY functions from the existing key launcher; never execute its launch statement here.
        $tokens=$null;$errors=$null
        $ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $Root 'ai-service/start-ai-credits.ps1'),[ref]$tokens,[ref]$errors)
        if($errors.Count){throw 'AI Credits launcher syntax error.'}
        foreach($f in $ast.EndBlock.Statements | Where-Object {$_ -is [Management.Automation.Language.FunctionDefinitionAst]}){Invoke-Expression $f.Extent.Text}
        $p=$plan.Ports
        Set-LaunchEnv 'EXAMFLOW_LAUNCH_PORTS' (ConvertTo-Json -InputObject $p -Compress)
        Set-LaunchEnv 'EXAMFLOW_LAUNCH_MAVEN' $maven
        Set-LaunchEnv 'EXAMFLOW_LAUNCH_OLLAMA' $ollama.Source
        Set-LaunchEnv 'EXAMFLOW_LAUNCH_NPM' $npm.Source
        Set-LaunchEnv 'OLLAMA_HOST' ('127.0.0.1:'+$p.Ollama)
        Set-LaunchEnv 'OLLAMA_URL' ('http://127.0.0.1:'+$p.Ollama)
        Set-LaunchEnv 'OLLAMA_MODEL' $plan.Model
        Set-LaunchEnv 'OLLAMA_EMBED_MODEL' $plan.Embed
        Set-LaunchEnv 'SERVER_PORT' ([string]$p.Backend)
        Set-LaunchEnv 'AI_RAG_URL' ('http://127.0.0.1:'+$p.AIGenerator)
        Set-LaunchEnv 'AI_OLLAMA_URL' ('http://127.0.0.1:'+$p.Ollama)
        Set-LaunchEnv 'AI_OLLAMA_MODEL' $plan.Model
        Set-LaunchEnv 'APP_ANTICHEAT_URL' ('http://127.0.0.1:'+$p.AntiCheating)
        Set-LaunchEnv 'APP_ANTICHEAT_SECRET' $env:ANTICHEAT_INTERNAL_SECRET
        Set-LaunchEnv 'ANTICHEAT_SERVICE_HOST' '127.0.0.1'
        Set-LaunchEnv 'ANTICHEAT_SERVICE_PORT' ([string]$p.AntiCheating)
        Set-LaunchEnv 'ANTICHEAT_BACKEND_CALLBACK_URL' ('http://127.0.0.1:'+$p.Backend+'/api/internal/anticheating/events')
        Set-LaunchEnv 'VITE_API_URL' ('http://127.0.0.1:'+$p.Backend+'/api')
        $records=@(Read-ExamFlowState $Root)
        foreach($name in @('Ollama','Backend','AIGenerator','AntiCheating','Frontend')){
            Write-Host ('CHECK '+$name+' port '+$p[$name])
            $owned=@($records | Where-Object {$_.Name -eq $name -and (Test-ExamFlowOwnedProcess $_ $Root)})
            $listeners=@(Get-ExamFlowListener $p[$name])
            if($listeners.Count){
                if(-not(Test-ExamFlowReady $name $plan $Root)){throw ($name+' port is occupied but service identity/readiness/key could not be verified. No takeover performed.')}
                Write-Host ('REUSE '+$name);continue
            }
            if($owned.Count){Wait-ExamFlowService $Root $name $plan $owned[0] $TimeoutSeconds;Write-Host ('READY '+$name);continue}
            $record=Start-ExamFlowOwnedService $Root $name
            $records=@($records | Where-Object {$_.Name -ne $name})+@($record)
            Save-ExamFlowState $Root $records
            Wait-ExamFlowService $Root $name $plan $record $TimeoutSeconds
            Write-Host ('READY '+$name)
        }
        Write-Host ('ExamFlow ready. Lecturer/student/Admin share http://127.0.0.1:'+$p.Frontend)
        Write-Host ('Separate service logs: '+(Join-Path (Get-ExamFlowRuntimeDir $Root) 'logs'))
    } finally {
        foreach($name in $saved.Keys){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}
        $mutex.ReleaseMutex();$mutex.Dispose()
    }
}
function Stop-ExamFlow {
    param([string]$Root)
    $Root=[IO.Path]::GetFullPath($Root);$mutex=Enter-ExamFlowLock $Root
    try {
        $records=@(Read-ExamFlowState $Root);$remaining=@()
        [array]::Reverse($records)
        foreach($record in $records){
            try {
                if(Test-ExamFlowOwnedProcess $record $Root){
                    # Worker owns a Windows kill-on-close Job Object; only its descendants stop.
                    Stop-Process -Id $record.Pid -ErrorAction Stop
                    Write-Host ('STOPPED '+$record.Name)
                } else {Write-Host ('SKIP '+$record.Name+' (not a live verified launcher process)')}
            } catch {$remaining+=@($record);Write-Warning ('Could not stop '+$record.Name+' safely; no other process was targeted.')}
        }
        Save-ExamFlowState $Root $remaining
        if($remaining.Count){throw 'Some owned services could not be stopped; metadata retained for inspection.'}
        Write-Host 'Launcher-owned services stopped. Pre-existing services were not targeted.'
    } finally {$mutex.ReleaseMutex();$mutex.Dispose()}
}
