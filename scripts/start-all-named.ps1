$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot

if (-not $env:TUNNEL_TOKEN -or [string]::IsNullOrWhiteSpace($env:TUNNEL_TOKEN)) {
  throw "TUNNEL_TOKEN is required for named tunnel."
}
if (-not $env:PUBLIC_BASE_URL -or [string]::IsNullOrWhiteSpace($env:PUBLIC_BASE_URL)) {
  throw "PUBLIC_BASE_URL is required (your stable tunnel hostname URL)."
}
$env:PUBLIC_BASE_URL = $env:PUBLIC_BASE_URL.Trim().TrimEnd("/")

Write-Host "[GameRemote] Releasing host port 37841 (if occupied by local node server)..."
$localServers = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq "node.exe" -and $_.CommandLine -match "webrtc-server.js"
}
if ($localServers) {
  $localServers | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
}

Write-Host "[GameRemote] Starting Docker stack with named tunnel..."
$turnVars = @($env:TURN_EXTERNAL_IP, $env:TURN_REALM, $env:TURN_USERNAME, $env:TURN_PASSWORD)
$enableTurn = $true
foreach ($v in $turnVars) {
  if ([string]::IsNullOrWhiteSpace($v)) {
    $enableTurn = $false
    break
  }
}

$composeArgs = @("-f", "$root\docker-compose.yml", "--profile", "named_tunnel")
if ($enableTurn) {
  $composeArgs += @("--profile", "turn")
  Write-Host "[GameRemote] TURN profile enabled."
} else {
  Write-Host "[GameRemote] TURN profile disabled (missing TURN_* env vars)."
}
docker compose @composeArgs up -d --build
if ($LASTEXITCODE -ne 0) {
  throw "Docker stack failed to start."
}

Write-Host "[GameRemote] Ensuring PC input agent is running..."
$agent = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq "node.exe" -and $_.CommandLine -match "scripts/pc-input-agent.js"
}
if (-not $agent) {
  Start-Process -FilePath cmd.exe -ArgumentList "/c npm run pc:agent" -WorkingDirectory $root -WindowStyle Hidden | Out-Null
  Start-Sleep -Seconds 1
}

Write-Host "[GameRemote] Done."
Write-Host "PUBLIC_BASE_URL: $env:PUBLIC_BASE_URL"
Write-Host "PC page (local): http://localhost:37841/pc.html"
