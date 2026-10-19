param(
    [string]$ServerUrl = 'http://localhost:8081',
    [string]$Realm = 'online-exam-system',
    [string]$AdminRealm = 'master',
    [string]$AdminUsername = 'admin'
)
$ErrorActionPreference = 'Stop'
# Enter secrets locally; never place the password or access token in a command argument/file/log.
$credential = Get-Credential -UserName $AdminUsername -Message 'Keycloak administrator (local only)'
$token = $null
try {
    $body = @{
        client_id = 'admin-cli'; grant_type = 'password'
        username = $credential.UserName
        password = $credential.GetNetworkCredential().Password
    }
    $token = Invoke-RestMethod -Method Post -Uri "$ServerUrl/realms/$AdminRealm/protocol/openid-connect/token" -Body $body -ContentType 'application/x-www-form-urlencoded'
    $body.password = $null
    $headers = @{Authorization = "Bearer $($token.access_token)"}
    $realmUrl = "$ServerUrl/admin/realms/$Realm"
    $settings = @{registrationAllowed=$false; registrationEmailAsUsername=$false; loginWithEmailAllowed=$false; editUsernameAllowed=$false}
    Invoke-RestMethod -Method Put -Uri $realmUrl -Headers $headers -ContentType 'application/json' -Body ($settings | ConvertTo-Json) | Out-Null
    $providers = Invoke-RestMethod -Uri "$realmUrl/identity-provider/instances" -Headers $headers
    foreach ($provider in $providers) {
        $provider.enabled = $false
        $alias = [Uri]::EscapeDataString($provider.alias)
        Invoke-RestMethod -Method Put -Uri "$realmUrl/identity-provider/instances/$alias" -Headers $headers -ContentType 'application/json' -Body ($provider | ConvertTo-Json -Depth 20) | Out-Null
    }
    $check = Invoke-RestMethod -Uri $realmUrl -Headers $headers
    if ($check.registrationAllowed -or $check.loginWithEmailAllowed -or $check.editUsernameAllowed) {throw 'Keycloak policy verification failed'}
    Write-Host 'OK: administrator-provisioned accounts; username login; self-registration and identity-provider sign-in disabled.'
} catch {
    throw 'Could not finish Keycloak policy update. Check server availability, administrator permissions and realm name. No secret values were displayed.'
} finally {
    if ($body) {$body.password=$null}
    if ($headers) {$headers.Clear()}
    $token=$null; $credential=$null
}
