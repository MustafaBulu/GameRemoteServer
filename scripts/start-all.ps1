$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot

Write-Host "[GameRemote] Releasing host port 37841 (if occupied by local node server)..."
$localServers = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq "node.exe" -and $_.CommandLine -match "webrtc-server.js"
}
if ($localServers) {
  $localServers | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
}

$publicBaseUrl = if ($env:PUBLIC_BASE_URL) { $env:PUBLIC_BASE_URL.Trim().TrimEnd("/") } else { "" }
if ($publicBaseUrl) {
  $env:PUBLIC_BASE_URL = $publicBaseUrl
  Write-Host "[GameRemote] PUBLIC_BASE_URL from env: $publicBaseUrl"
} else {
  Remove-Item Env:PUBLIC_BASE_URL -ErrorAction SilentlyContinue
  Write-Host "[GameRemote] PUBLIC_BASE_URL not set. QR/link will use LAN IP when available."
}

$turnVars = @($env:TURN_EXTERNAL_IP, $env:TURN_REALM, $env:TURN_USERNAME, $env:TURN_PASSWORD)
$enableTurn = $true
foreach ($v in $turnVars) {
  if ([string]::IsNullOrWhiteSpace($v)) {
    $enableTurn = $false
    break
  }
}

$composeArgs = @("-f", "$root\docker-compose.yml")
if ($enableTurn) {
  $composeArgs += @("--profile", "turn")
  Write-Host "[GameRemote] TURN profile enabled."
} else {
  Write-Host "[GameRemote] TURN profile disabled (missing TURN_* env vars)."
}

Write-Host "[GameRemote] Starting Docker stack..."
docker compose @composeArgs up -d --build
if ($LASTEXITCODE -ne 0) {
  throw "Docker stack failed to start. Ensure Docker Desktop is running and port 37841 is free."
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
Write-Host "PC page: http://localhost:37841/pc.html"
Write-Host "Android page: http://localhost:37841/android.html"
