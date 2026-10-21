# No network, native Ollama process, download, or live model store is used.
$taskRepo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
. (Join-Path $taskRepo 'scripts/setup-models.ps1')

Describe 'AI Generator model setup (mock only)' {
    BeforeEach {
        $script:setupModels = @('qwen2.5:7b','nomic-embed-text:latest')
        $script:setupPulls = @()
        $script:setupOffline = $false
        Mock Get-GeneratorModelConfig { [pscustomobject]@{Url='http://127.0.0.1:11434';Uri=[uri]'http://127.0.0.1:11434';Models=@('qwen2.5:7b','nomic-embed-text')} }
        Mock Find-GeneratorOllama { 'mock-ollama.exe' }
        Mock Get-GeneratorInstalledModels { if ($script:setupOffline) { throw 'offline' }; $script:setupModels }
        Mock Test-GeneratorLocalBusy { $false }
        Mock Start-GeneratorOllama { $script:setupOffline = $false }
        Mock Start-Sleep {}
        Mock Show-GeneratorDiskSpace {}
        Mock Confirm-GeneratorPull { $true }
        Mock Invoke-GeneratorPull {
            param($Executable,$Url,$Model)
            $script:setupPulls += $Model
            $script:setupModels += (ConvertTo-GeneratorModelTag $Model)
            [pscustomobject]@{Success=$true;Reason=''}
        }
    }
    It 'reports missing installation without starting or downloading' {
        Mock Find-GeneratorOllama { $null }
        (Invoke-GeneratorModelSetup -Root $taskRepo -Yes) | Should Be 1
        Assert-MockCalled Start-GeneratorOllama -Times 0 -Exactly -Scope It
        Assert-MockCalled Invoke-GeneratorPull -Times 0 -Exactly -Scope It
    }
    It 'starts a stopped local server only once' {
        $script:setupOffline = $true
        (Invoke-GeneratorModelSetup -Root $taskRepo -Yes) | Should Be 0
        Assert-MockCalled Start-GeneratorOllama -Times 1 -Exactly -Scope It
        Assert-MockCalled Invoke-GeneratorPull -Times 0 -Exactly -Scope It
    }
    It 'does not start a duplicate when a process or listener exists' {
        $script:setupOffline = $true
        Mock Test-GeneratorLocalBusy { $true }
        (Invoke-GeneratorModelSetup -Root $taskRepo -Yes) | Should Be 1
        Assert-MockCalled Start-GeneratorOllama -Times 0 -Exactly -Scope It
    }
    It 'does not start or pull in offline CheckOnly mode even with Yes' {
        $script:setupOffline = $true
        (Invoke-GeneratorModelSetup -Root $taskRepo -CheckOnly -Yes) | Should Be 1
        Assert-MockCalled Start-GeneratorOllama -Times 0 -Exactly -Scope It
        Assert-MockCalled Invoke-GeneratorPull -Times 0 -Exactly -Scope It
    }
    It 'skips both installed models including the default latest alias' {
        (Invoke-GeneratorModelSetup -Root $taskRepo) | Should Be 0
        Assert-MockCalled Invoke-GeneratorPull -Times 0 -Exactly -Scope It
        Assert-MockCalled Confirm-GeneratorPull -Times 0 -Exactly -Scope It
    }
    It 'downloads only missing Qwen after confirmation and skips on rerun' {
        $script:setupModels = @('nomic-embed-text:latest')
        (Invoke-GeneratorModelSetup -Root $taskRepo) | Should Be 0
        (Invoke-GeneratorModelSetup -Root $taskRepo) | Should Be 0
        ($script:setupPulls -join ',') | Should Be 'qwen2.5:7b'
        Assert-MockCalled Confirm-GeneratorPull -Times 1 -Exactly -Scope It
    }
    It 'downloads only missing embedding with Yes without confirmation' {
        $script:setupModels = @('qwen2.5:7b')
        (Invoke-GeneratorModelSetup -Root $taskRepo -Yes) | Should Be 0
        ($script:setupPulls -join ',') | Should Be 'nomic-embed-text'
        Assert-MockCalled Confirm-GeneratorPull -Times 0 -Exactly -Scope It
    }
    It 'CheckOnly reports missing models without confirmation or writes' {
        $script:setupModels = @()
        (Invoke-GeneratorModelSetup -Root $taskRepo -CheckOnly) | Should Be 1
        Assert-MockCalled Confirm-GeneratorPull -Times 0 -Exactly -Scope It
        Assert-MockCalled Invoke-GeneratorPull -Times 0 -Exactly -Scope It
    }
    It 'does not download after the user refuses' {
        $script:setupModels = @()
        Mock Confirm-GeneratorPull { $false }
        (Invoke-GeneratorModelSetup -Root $taskRepo) | Should Be 2
        Assert-MockCalled Invoke-GeneratorPull -Times 0 -Exactly -Scope It
    }
    It 'reports failed downloads and allows a later successful retry' {
        $script:setupModels = @('nomic-embed-text:latest')
        Mock Invoke-GeneratorPull { [pscustomobject]@{Success=$false;Reason='Network/DNS connection failed; rerun setup.'} }
        (Invoke-GeneratorModelSetup -Root $taskRepo -Yes) | Should Be 1
        Mock Invoke-GeneratorPull { param($Executable,$Url,$Model); $script:setupModels += $Model; [pscustomobject]@{Success=$true;Reason=''} }
        (Invoke-GeneratorModelSetup -Root $taskRepo -Yes) | Should Be 0
    }
    It 'verifies models instead of trusting a successful CLI exit alone' {
        $script:setupModels = @()
        Mock Invoke-GeneratorPull { [pscustomobject]@{Success=$true;Reason=''} }
        (Invoke-GeneratorModelSetup -Root $taskRepo -Yes) | Should Be 1
    }
    It 'does not replace an explicitly requested tag with another tag' {
        $script:setupModels = @('qwen2.5:latest','nomic-embed-text:latest')
        (Invoke-GeneratorModelSetup -Root $taskRepo -Yes) | Should Be 0
        ($script:setupPulls -join ',') | Should Be 'qwen2.5:7b'
    }
}

Describe 'AI Generator configuration resolution' {
    BeforeEach {
        $script:modelEnv = @{}
        foreach ($name in @('OLLAMA_URL','OLLAMA_MODEL','OLLAMA_EMBED_MODEL')) {
            $script:modelEnv[$name] = [Environment]::GetEnvironmentVariable($name,'Process')
            [Environment]::SetEnvironmentVariable($name,$null,'Process')
        }
        $script:fixture = Join-Path $TestDrive 'repo'
        New-Item -ItemType Directory -Path (Join-Path $fixture 'ai-service') -Force | Out-Null
        Copy-Item (Join-Path $taskRepo 'ai-service/main.py') (Join-Path $fixture 'ai-service/main.py')
    }
    AfterEach {
        foreach ($name in $script:modelEnv.Keys) { [Environment]::SetEnvironmentVariable($name,$script:modelEnv[$name],'Process') }
    }
    It 'reads actual model defaults from main.py' {
        $config = Get-GeneratorModelConfig $fixture
        ($config.Models -join ',') | Should Be 'qwen2.5:7b,nomic-embed-text'
        $config.Url | Should Be 'http://127.0.0.1:11434'
    }
    It 'uses selected dotenv values then environment overrides, ignoring secrets' {
        @('AI_INTERNAL_KEY=do-not-output-this','OLLAMA_MODEL="custom:7b" # comment','OLLAMA_EMBED_MODEL=custom-embed','OLLAMA_URL=http://localhost:12345') | Set-Content (Join-Path $fixture 'ai-service/.env')
        $env:OLLAMA_EMBED_MODEL = 'override-embed'
        $config = Get-GeneratorModelConfig $fixture
        ($config.Models -join ',') | Should Be 'custom:7b,override-embed'
        $config.Uri.Port | Should Be 12345
    }
    It 'rejects credential URLs without printing their value' {
        $env:OLLAMA_URL = 'http://user:secret@localhost:11434'
        { Get-GeneratorModelConfig $fixture } | Should Throw 'without credentials'
    }
    It 'fails safely if Python defaults change beyond the supported parser' {
        'MODEL = unknown()' | Set-Content (Join-Path $fixture 'ai-service/main.py')
        { Get-GeneratorModelConfig $fixture } | Should Throw 'Cannot read'
    }
}

Describe 'Pull error reporting with a fake CLI' {
    BeforeEach {
        $script:savedOllamaHost = $env:OLLAMA_HOST
        $env:OLLAMA_HOST = 'http://original-host:11434'
        $script:fakeCli = Join-Path $TestDrive 'fake-ollama.cmd'
    }
    AfterEach { $env:OLLAMA_HOST = $script:savedOllamaHost }
    It 'classifies network errors without leaking raw CLI output and restores host' {
        @('@echo off','echo network timeout https://fake-user:fake-secret@proxy.invalid 1>&2','exit /b 1') | Set-Content $script:fakeCli
        $result = Invoke-GeneratorPull $script:fakeCli 'http://127.0.0.1:11434' 'fixture-model:tag'
        $result.Success | Should Be $false
        $result.Reason | Should Match 'Network/DNS/proxy/TLS'
        $result.Reason | Should Not Match 'fake-secret'
        $env:OLLAMA_HOST | Should Be 'http://original-host:11434'
    }
    It 'classifies disk errors without changing any model store' {
        @('@echo off','echo no space left on device 1>&2','exit /b 1') | Set-Content $script:fakeCli
        $result = Invoke-GeneratorPull $script:fakeCli 'http://127.0.0.1:11434' 'fixture-model:tag'
        $result.Success | Should Be $false
        $result.Reason | Should Match 'disk space'
    }
}
