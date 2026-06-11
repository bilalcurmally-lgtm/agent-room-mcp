param(
  [string]$Room = $(if ($env:AGENT_ROOM_DIR) { $env:AGENT_ROOM_DIR } else { Join-Path $env:USERPROFILE ".agent-room" }),
  [int]$Port = 4777,
  [switch]$NoOpen,
  [switch]$SkipBuild,
  [switch]$WithWatch,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Quote-Arg {
  param([string]$Value)
  if ($Value -match "\s") {
    return '"' + ($Value -replace '"', '\"') + '"'
  }
  return $Value
}

function Write-RoomLauncherMarker {
  param(
    [string]$TargetRoom,
    [bool]$Dashboard,
    [bool]$Watch
  )

  New-Item -ItemType Directory -Force -Path $TargetRoom | Out-Null
  $markerPath = Join-Path $TargetRoom ".launcher-suite.json"
  @{
    installedAt = (Get-Date).ToUniversalTime().ToString("o")
    dashboard = $Dashboard
    watch = $Watch
    version = 1
  } | ConvertTo-Json | Set-Content -Path $markerPath -Encoding utf8
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not (Test-Path "package.json")) {
  throw "Could not find package.json from launcher root: $repoRoot"
}

if (-not $SkipBuild) {
  npm run build
}

$dashboardScript = Join-Path $PSScriptRoot "start-agent-room.ps1"
$watchScript = Join-Path $PSScriptRoot "start-room-watch.ps1"

if ($DryRun) {
  Write-Output "Dashboard: powershell -File $dashboardScript -Room $Room -Port $Port$(if ($NoOpen) { ' -NoOpen' }) -SkipBuild"
  if ($WithWatch) {
    Write-Output "Watcher: powershell -File $watchScript -Room $Room -Once (background loop via Start-Process)"
  }
  exit 0
}

if ($WithWatch) {
  Start-Process powershell -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $watchScript,
    "-Room",
    $Room
  ) -WorkingDirectory $repoRoot -WindowStyle Minimized | Out-Null
}

Write-RoomLauncherMarker -TargetRoom $Room -Dashboard $true -Watch $WithWatch

$dashboardArgs = @("-Room", $Room, "-Port", [string]$Port, "-SkipBuild")
if ($NoOpen) {
  $dashboardArgs += "-NoOpen"
}
& powershell -NoProfile -ExecutionPolicy Bypass -File $dashboardScript @dashboardArgs