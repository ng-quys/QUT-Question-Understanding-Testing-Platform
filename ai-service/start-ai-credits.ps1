# The existing BE key must already be configured in this terminal. Never echo it.
param([int]$Port = 8002, [uri]$BackendBaseUri = 'http://127.0.0.1:8080')
$ErrorActionPreference = 'Stop'

function Get-AiCreditsBackendStatus {
    param([uri]$BackendBaseUri)
    Add-Type -AssemblyName System.Net.Http
    $handler = New-Object System.Net.Http.HttpClientHandler
    $handler.UseProxy = $false
    $handler.AllowAutoRedirect = $false
    $client = New-Object System.Net.Http.HttpClient($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(5)
    $request = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Get, [uri]::new($BackendBaseUri, '/api/internal/ai-credits/verify-key'))
    $request.Version = [version]'1.1'
    $response = $null
    try {
        $request.Headers.Add('X-AI-Internal-Key', $env:AI_INTERNAL_KEY)
        $response = $client.SendAsync($request, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
        return [int]$response.StatusCode
    } catch {
        throw 'Backend is not ready or verification timed out (maximum 5 seconds).'
    } finally {
        if ($null -ne $response) { $response.Dispose() }
        $request.Dispose()
        $client.Dispose()
        $handler.Dispose()
    }
}

function Invoke-AiCreditsUvicorn {
    param([string]$Python, [string]$AppDir, [int]$Port)
    & $Python -m uvicorn main:app --app-dir $AppDir --host 127.0.0.1 --port $Port --workers 1
    if ($LASTEXITCODE -ne 0) { throw 'AI Service stopped with an error.' }
}

function Start-ExamFlowAiCredits {
    param([int]$Port, [uri]$BackendBaseUri, [string]$AppDir)
    if ([string]::IsNullOrWhiteSpace($env:AI_INTERNAL_KEY) -or $env:AI_INTERNAL_KEY.Length -lt 32) {
        throw 'Configure the same AI_INTERNAL_KEY as BE in this terminal (at least 32 characters). Do not paste it into logs or chat.'
    }
    # Literal loopback only: never transmit this secret to an external/DNS target.
    if (-not $BackendBaseUri.IsAbsoluteUri -or $BackendBaseUri.Scheme -notin @('http','https') -or
        $BackendBaseUri.Host -notin @('127.0.0.1','[::1]','::1') -or $BackendBaseUri.UserInfo -or
        $BackendBaseUri.Query -or $BackendBaseUri.Fragment -or $BackendBaseUri.AbsolutePath -ne '/') {
        throw 'Backend verification requires an HTTP(S) literal loopback base URL without credentials, path or query.'
    }
    if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
        throw 'Port is already listening. This script will not stop an existing AI worker. Review running jobs before replacing it.'
    }
    $taskPython = Join-Path $AppDir '.venv/Scripts/python.exe'
    if (-not (Test-Path -LiteralPath $taskPython)) { throw 'AI Service virtual environment is missing.' }
    $status = Get-AiCreditsBackendStatus -BackendBaseUri $BackendBaseUri
    switch ($status) {
        204 { }
        401 { throw 'AI_INTERNAL_KEY does not match the Backend key. AI Service was not started.' }
        503 { throw 'Backend has not configured a valid internal key. AI Service was not started.' }
        default { throw "Backend key verification returned HTTP $status; AI Service was not started." }
    }
    Invoke-AiCreditsUvicorn -Python $taskPython -AppDir $AppDir -Port $Port
}

Start-ExamFlowAiCredits -Port $Port -BackendBaseUri $BackendBaseUri -AppDir $PSScriptRoot
