# AI Generator only. Compatible with Windows PowerShell 5.1 and PowerShell 7.
param([switch]$CheckOnly, [switch]$Yes)

function Get-GeneratorModelConfig {
    param([string]$Root)
    $source = Get-Content -LiteralPath (Join-Path $Root 'ai-service/main.py') -Raw
    # Match the actual Python defaults, not a second hardcoded model list.
    $values = @{}
    foreach ($name in @('OLLAMA_URL','OLLAMA_MODEL','OLLAMA_EMBED_MODEL')) {
        $pattern = "os\.getenv\('$name',\s*'([^']+)'\)"
        $found = [regex]::Match($source, $pattern)
        if (-not $found.Success) { throw "Cannot read $name default from ai-service/main.py. Review configuration before setup." }
        $values[$name] = $found.Groups[1].Value
    }
    # python-dotenv searches the service directory first, then its parents.
    $dotenv = Join-Path $Root 'ai-service/.env'
    if (-not (Test-Path -LiteralPath $dotenv)) { $dotenv = Join-Path $Root '.env' }
    if (Test-Path -LiteralPath $dotenv) {
        foreach ($line in Get-Content -LiteralPath $dotenv) {
            if ($line -match '^\s*(?:export\s+)?(OLLAMA_URL|OLLAMA_MODEL|OLLAMA_EMBED_MODEL)\s*=\s*(.*?)\s*$') {
                $name = $Matches[1]; $value = $Matches[2]
                if ($null -ne [Environment]::GetEnvironmentVariable($name, 'Process')) { continue }
                if ($value -match '^([''"])(.*?)\1\s*(?:#.*)?$') { $value = $Matches[2] }
                else { $value = ($value -replace '\s+#.*$', '').Trim() }
                # No execution or expansion of .env expressions; fail rather than guess.
                if ($value -match '\$|[\r\n]') { throw "Unsupported expression in $name. Use a literal value or process environment override." }
                $values[$name] = $value
            }
        }
    }
    foreach ($name in @('OLLAMA_URL','OLLAMA_MODEL','OLLAMA_EMBED_MODEL')) {
        $override = [Environment]::GetEnvironmentVariable($name, 'Process')
        if ($null -ne $override) { $values[$name] = $override }
    }
    $uri = $null
    if (-not [uri]::TryCreate($values.OLLAMA_URL, [UriKind]::Absolute, [ref]$uri) -or
        $uri.Scheme -notin @('http','https') -or $uri.UserInfo -or $uri.Query -or $uri.Fragment -or $uri.AbsolutePath -ne '/') {
        throw 'OLLAMA_URL must be an HTTP(S) base URL without credentials, path, query or fragment.'
    }
    $models = @($values.OLLAMA_MODEL, $values.OLLAMA_EMBED_MODEL)
    foreach ($model in $models) {
        if ($model -notmatch '^[A-Za-z0-9][A-Za-z0-9._/:-]*$' -or $model -match ':cloud$') {
            throw 'Invalid local Ollama model configuration. Only literal local model names/tags are supported.'
        }
    }
    return [pscustomobject]@{ Url=$uri.GetLeftPart([UriPartial]::Authority); Uri=$uri; Models=@($models | Select-Object -Unique) }
}

function Find-GeneratorOllama {
    $command = Get-Command ollama.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { return $command.Source }
    if ($env:LOCALAPPDATA) {
        $candidate = Join-Path $env:LOCALAPPDATA 'Programs/Ollama/ollama.exe'
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }
    return $null
}

function Get-GeneratorInstalledModels {
    param([string]$Url)
    $response = Invoke-RestMethod -Uri "$Url/api/tags" -Method Get -TimeoutSec 5 -MaximumRedirection 0 -ErrorAction Stop
    if (-not $response.PSObject.Properties['models']) { throw 'Invalid Ollama tags response.' }
    foreach ($model in $response.models) { if ($model.name) { [string]$model.name } }
}

function ConvertTo-GeneratorModelTag {
    param([string]$Name)
    if ($Name.Split('/')[-1].Contains(':')) { return $Name }
    return "${Name}:latest"
}

function Test-GeneratorLocalBusy {
    param([int]$Port)
    # Be conservative if an Ollama process exists but is not answering yet.
    if (Get-Process -Name 'ollama','ollama app' -ErrorAction SilentlyContinue) { return $true }
    $listener = [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
    return @($listener | Where-Object { $_.Port -eq $Port }).Count -gt 0
}

function Start-GeneratorOllama {
    param([string]$Executable, [string]$Url)
    $saved = $env:OLLAMA_HOST
    try {
        $env:OLLAMA_HOST = $Url
        Start-Process -FilePath $Executable -ArgumentList 'serve' -WindowStyle Hidden -ErrorAction Stop | Out-Null
    } finally { $env:OLLAMA_HOST = $saved }
}

function Show-GeneratorDiskSpace {
    param([uri]$Uri)
    if (-not $Uri.IsLoopback) { Write-Warning 'Remote server: cannot determine free disk space.'; return }
    try {
        $modelPath = $env:OLLAMA_MODELS
        if (-not $modelPath) { $modelPath = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.ollama/models' }
        $drive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot([IO.Path]::GetFullPath($modelPath)))
        Write-Host ('Local model-store volume: {0:N1} GiB free (estimate; an existing server may use another store).' -f ($drive.AvailableFreeSpace / 1GB))
        if ($drive.AvailableFreeSpace -lt 1GB) { Write-Warning 'Less than 1 GiB free: model download is likely to fail. Free disk space first.' }
    } catch { Write-Warning 'Cannot determine model-store free space.' }
    Write-Warning 'Exact missing-model download size is unavailable from /api/tags. Ensure enough disk space for the configured models; no size/version is assumed.'
}

function Confirm-GeneratorPull {
    return (Read-Host 'Download these missing models? [y/N]') -match '^(?i:y|yes)$'
}

function Invoke-GeneratorPull {
    param([string]$Executable, [string]$Url, [string]$Model)
    $saved = $env:OLLAMA_HOST
    $savedPreference = $ErrorActionPreference
    try {
        $env:OLLAMA_HOST = $Url
        # Capture CLI output to avoid printing proxy credentials or arbitrary server errors.
        # Windows PowerShell exposes native stderr as ErrorRecord objects.
        $ErrorActionPreference = 'Continue'
        $output = & $Executable pull $Model 2>&1
        $code = $LASTEXITCODE
        if ($code -eq 0) { return [pscustomobject]@{ Success=$true; Reason='' } }
        $details = ($output | Out-String)
        $reason = 'Ollama pull failed. Check Ollama server logs locally; rerun setup after resolving the error.'
        if ($details -match '(?i)no space|disk full|not enough space|insufficient.*space') { $reason = 'Not enough disk space in the Ollama model store.' }
        elseif ($details -match '(?i)timeout|timed out|network|connection|dns|no such host|TLS|certificate|EOF') { $reason = 'Network/DNS/proxy/TLS connection failed or download was interrupted. Check connectivity and rerun setup.' }
        elseif ($details -match '(?i)not found|manifest.*exist') { $reason = 'Configured model/tag was not found in the registry. Verify configuration; no alternative version was selected.' }
        return [pscustomobject]@{ Success=$false; Reason=$reason }
    } finally { $env:OLLAMA_HOST = $saved; $ErrorActionPreference = $savedPreference }
}

function Invoke-GeneratorModelSetup {
    param([string]$Root, [switch]$CheckOnly, [switch]$Yes)
    $config = Get-GeneratorModelConfig $Root
    Write-Host "AI Generator Ollama: $($config.Url)"
    Write-Host ('Required models: ' + ($config.Models -join ', '))
    $executable = Find-GeneratorOllama
    if (-not $executable) {
        Write-Host 'FAIL: Ollama CLI is not installed or not discoverable. Install from https://ollama.com/download/windows, reopen PowerShell, then rerun this script.'
        return 1
    }
    try { $installed = @(Get-GeneratorInstalledModels $config.Url) }
    catch {
        if ($CheckOnly) { Write-Host 'FAIL: Ollama server is unavailable. CheckOnly does not start services or download models.'; return 1 }
        if (-not $config.Uri.IsLoopback -or $config.Uri.Scheme -ne 'http') { Write-Host 'FAIL: Start the configured remote/HTTPS Ollama server manually.'; return 1 }
        if (Test-GeneratorLocalBusy $config.Uri.Port) { Write-Host 'FAIL: An Ollama process or port listener already exists but the API is not ready. No duplicate server was started; check its status and rerun.'; return 1 }
        Write-Host 'Ollama is not running; starting ollama serve in the background...'
        Start-GeneratorOllama $executable $config.Url
        $ready = $false
        for ($attempt = 0; $attempt -lt 15; $attempt++) {
            Start-Sleep -Seconds 1
            try { $installed = @(Get-GeneratorInstalledModels $config.Url); $ready = $true; break } catch { }
        }
        if (-not $ready) { Write-Host 'FAIL: Ollama did not become ready. Check its logs and rerun; no additional instance will be forced.'; return 1 }
    }
    $tags = @($installed | ForEach-Object { ConvertTo-GeneratorModelTag $_ })
    $missing = @()
    foreach ($model in $config.Models) {
        if ($tags -ccontains (ConvertTo-GeneratorModelTag $model)) { Write-Host "PRESENT: $model (skipped)" }
        else { Write-Host "MISSING: $model"; $missing += $model }
    }
    if (-not $missing.Count) { Write-Host 'SUCCESS: all AI Generator models are installed.'; return 0 }
    if ($CheckOnly) { Write-Host 'CHECK: missing models; nothing downloaded.'; return 1 }
    Show-GeneratorDiskSpace $config.Uri
    if (-not $Yes -and -not (Confirm-GeneratorPull)) { Write-Host 'CANCELLED: no models downloaded.'; return 2 }
    $failed = $false
    foreach ($model in $missing) {
        # Another client may have finished downloading while the user was confirming.
        $current = @(Get-GeneratorInstalledModels $config.Url | ForEach-Object { ConvertTo-GeneratorModelTag $_ })
        if ($current -ccontains (ConvertTo-GeneratorModelTag $model)) { Write-Host "PRESENT: $model (skipped)"; continue }
        Write-Host "DOWNLOADING: $model (may take several minutes; wait for completion)"
        $result = Invoke-GeneratorPull $executable $config.Url $model
        if (-not $result.Success) { Write-Host "FAIL: $model - $($result.Reason)"; $failed = $true }
    }
    $final = @(Get-GeneratorInstalledModels $config.Url | ForEach-Object { ConvertTo-GeneratorModelTag $_ })
    foreach ($model in $config.Models) {
        if ($final -ccontains (ConvertTo-GeneratorModelTag $model)) { Write-Host "VERIFIED: $model" }
        else { Write-Host "FAIL: still missing $model. Rerun setup to retry missing models only."; $failed = $true }
    }
    if ($failed) { return 1 }
    Write-Host 'SUCCESS: all AI Generator models verified.'
    return 0
}

if ($MyInvocation.InvocationName -ne '.') {
    $ErrorActionPreference = 'Stop'
    try { exit (Invoke-GeneratorModelSetup -Root (Split-Path $PSScriptRoot -Parent) -CheckOnly:$CheckOnly -Yes:$Yes) }
    catch { Write-Host 'FAIL: model setup could not complete. Check configuration, Ollama connectivity and disk space, then rerun. No raw configuration/secret was logged.'; exit 1 }
}
