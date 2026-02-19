$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot

Write-Host "[GameRemote] Stopping Docker stack..."
docker compose -f "$root\docker-compose.yml" down | Out-Null

Write-Host "[GameRemote] Stopping PC input agent..."
$agents = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq "node.exe" -and $_.CommandLine -match "scripts/pc-input-agent.js"
}
if ($agents) {
  $agents | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
}

Write-Host "[GameRemote] Stopped."
