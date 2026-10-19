$taskRepo=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
. (Join-Path $taskRepo 'scripts/examflow-launcher.ps1')

Describe 'ExamFlow orchestration without real services or DB' {
    BeforeEach {
        $script:taskSavedEnv=@{}
        foreach($name in @('AI_INTERNAL_KEY','ANTICHEAT_INTERNAL_SECRET','QUESTION_BANK_DB_PASSWORD','SPRING_JPA_HIBERNATE_DDL_AUTO')){
            $script:taskSavedEnv[$name]=[Environment]::GetEnvironmentVariable($name,'Process')
        }
        $env:AI_INTERNAL_KEY='fixture-only-key-with-at-least-32-characters'
        $env:ANTICHEAT_INTERNAL_SECRET='fixture-only-anticheat-secret'
        $env:QUESTION_BANK_DB_PASSWORD='fixture-only-db-password'
        $env:SPRING_JPA_HIBERNATE_DDL_AUTO='validate'
        $script:taskRoot=Join-Path $TestDrive ([guid]::NewGuid().ToString('N'))
        foreach($dir in @('backend/src/main/resources','backend/.mvn/wrapper','ai-service/.venv/Scripts','anticheating/.venv/Scripts','anticheating/app','frontend/node_modules/vite/bin')){
            New-Item -ItemType Directory -Path (Join-Path $taskRoot $dir) -Force | Out-Null
        }
        @('server.port=8080','ai.rag.url=http://127.0.0.1:8002','app.anticheat.url=http://127.0.0.1:8000','ai.ollama.url=http://localhost:11434','ai.ollama.model=qwen2.5:7b','spring.security.oauth2.resourceserver.jwt.issuer-uri=http://localhost:8081/realms/fixture') |
            Set-Content (Join-Path $taskRoot 'backend/src/main/resources/application.properties')
        foreach($file in @('ai-service/.venv/Scripts/python.exe','anticheating/.venv/Scripts/python.exe','anticheating/app/run_service.py','frontend/node_modules/vite/bin/vite.js')){New-Item -ItemType File -Path (Join-Path $taskRoot $file) | Out-Null}
        Copy-Item (Join-Path $taskRepo 'ai-service/start-ai-credits.ps1') (Join-Path $taskRoot 'ai-service/start-ai-credits.ps1')
        $script:taskOrder=New-Object 'Collections.Generic.List[string]'
        Mock Get-ExamFlowMaven {return 'fixture-maven.cmd'}
        Mock Get-Command {return [pscustomobject]@{Source='fixture.exe'}} -ParameterFilter {$Name -in @('ollama.exe','npm.cmd')}
        Mock Invoke-ExamFlowHttp {return @{Status=200;Text='{}'}}
        Mock Get-ExamFlowListener {return @()}
        Mock Get-ExamFlowListener {return @()} -ParameterFilter {$Port -eq 8080}
        Mock Test-ExamFlowReady {return $true}
        Mock Test-ExamFlowReady {return $true} -ParameterFilter {$Name -eq 'Backend'}
        Mock Test-ExamFlowOwnedProcess {return $true}
        Mock Start-ExamFlowOwnedService {
            param($Root,$Name)
            $taskOrder.Add($Name)
            return [pscustomobject]@{Name=$Name;Pid=99999;Started='fixture';Root=$Root}
        }
        Mock Wait-ExamFlowService {}
        Mock Wait-ExamFlowService {} -ParameterFilter {$Name -eq 'Backend'}
    }
    AfterEach {
        foreach($name in $taskSavedEnv.Keys){[Environment]::SetEnvironmentVariable($name,$taskSavedEnv[$name],'Process')}
    }
    It 'first launch follows dependency order and records no secrets' {
        Start-ExamFlow $taskRoot '' 10
        ($taskOrder -join ',') | Should Be 'Ollama,Backend,AIGenerator,AntiCheating,Frontend'
        $state=Get-Content (Join-Path (Get-ExamFlowRuntimeDir $taskRoot) 'state.json') -Raw
        $state.Contains($env:AI_INTERNAL_KEY) | Should Be $false
        $state.Contains($env:QUESTION_BANK_DB_PASSWORD) | Should Be $false
        @(Read-ExamFlowState $taskRoot).Count | Should Be 5
    }
    It 'second launch reuses healthy listeners without duplicate workers' {
        Start-ExamFlow $taskRoot '' 10
        Mock Get-ExamFlowListener {return @(12345)}
        Mock Get-ExamFlowListener {return @(12345)} -ParameterFilter {$Port -eq 8080}
        Start-ExamFlow $taskRoot '' 10
        $taskOrder.Count | Should Be 5
    }
    It 'missing internal key fails before starting anything' {
        $env:AI_INTERNAL_KEY=''
        {Start-ExamFlow $taskRoot '' 10} | Should Throw 'AI_INTERNAL_KEY is required'
        $taskOrder.Count | Should Be 0
    }
    It 'unknown occupied backend port is never taken over' {
        Mock Get-ExamFlowListener {return @(12345)} -ParameterFilter {$Port -eq 8080}
        Mock Test-ExamFlowReady {return $false} -ParameterFilter {$Name -eq 'Backend'}
        {Start-ExamFlow $taskRoot '' 10} | Should Throw 'port is occupied'
        ($taskOrder -join ',') | Should Be 'Ollama'
    }
    It 'readiness failure prevents dependent services from starting' {
        Mock Wait-ExamFlowService {throw 'fixture readiness failure'} -ParameterFilter {$Name -eq 'Backend'}
        {Start-ExamFlow $taskRoot '' 10} | Should Throw 'fixture readiness failure'
        ($taskOrder -join ',') | Should Be 'Ollama,Backend'
    }
    It 'rejects schema-changing startup settings' {
        $env:SPRING_JPA_HIBERNATE_DDL_AUTO='update'
        {Start-ExamFlow $taskRoot '' 10} | Should Throw 'schema-changing'
        $taskOrder.Count | Should Be 0
    }
    It 'restores caller environment after launching' {
        $before=[Environment]::GetEnvironmentVariable('APP_ANTICHEAT_SECRET','Process')
        Start-ExamFlow $taskRoot '' 10
        [Environment]::GetEnvironmentVariable('APP_ANTICHEAT_SECRET','Process') | Should Be $before
    }
    It 'stop only targets verified records and skips reused/unowned PIDs' {
        Save-ExamFlowState $taskRoot @([pscustomobject]@{Name='Backend';Pid=111;Started='one';Root=$taskRoot},[pscustomobject]@{Name='Ollama';Pid=222;Started='two';Root=$taskRoot})
        Mock Test-ExamFlowOwnedProcess {param($Record,$Root) return $Record.Pid -eq 111}
        Mock Stop-Process {}
        Stop-ExamFlow $taskRoot
        Assert-MockCalled Stop-Process -Times 1 -Exactly -ParameterFilter {$Id -eq 111}
        Assert-MockCalled Stop-Process -Times 0 -Exactly -ParameterFilter {$Id -eq 222}
        @(Read-ExamFlowState $taskRoot).Count | Should Be 0
    }
    It 'rejects array PIDs instead of treating multiple processes as one record' {
        Save-ExamFlowState $taskRoot @([pscustomobject]@{Name='Backend';Pid=@(111,222);Started='one';Root=$taskRoot})
        Mock Stop-Process {}
        {Stop-ExamFlow $taskRoot} | Should Throw 'Invalid launcher process metadata'
        Assert-MockCalled Stop-Process -Times 0 -Exactly -Scope It
    }
    It 'accepts local secret config without storing it in process metadata' {
        $fixture='fixture-local-config-key-at-least-32-characters'
        @{Environment=@{AI_INTERNAL_KEY=$fixture}} | ConvertTo-Json -Depth 3 | Set-Content (Join-Path $taskRoot '.env.examflow.local.json')
        $before=$env:AI_INTERNAL_KEY
        Start-ExamFlow $taskRoot '' 10
        $state=Get-Content (Join-Path (Get-ExamFlowRuntimeDir $taskRoot) 'state.json') -Raw
        $state.Contains($fixture) | Should Be $false
        $env:AI_INTERNAL_KEY | Should Be $before
    }
    It 'rejects JWT/token fields instead of using them as launcher secrets' {
        @{Environment=@{ADMIN_ACCESS_TOKEN='fixture-not-a-real-token'}} | ConvertTo-Json -Depth 3 | Set-Content (Join-Path $taskRoot '.env.examflow.local.json')
        {Start-ExamFlow $taskRoot '' 10} | Should Throw 'JWT/token fields are not accepted'
        $taskOrder.Count | Should Be 0
    }
}

Describe 'Owned process identity guards' {
    It 'does not accept a reused PID with a different creation time' {
        Mock Get-Process {return [pscustomobject]@{StartTime=[datetime]'2026-01-01'}}
        Test-ExamFlowOwnedProcess ([pscustomobject]@{Pid=123;Started='0';Name='Backend';Root='fixture'}) 'fixture' | Should Be $false
    }
}
