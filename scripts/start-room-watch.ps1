param(
  [string]$Agents = "auto",
  [string]$Room = $(if ($env:AGENT_ROOM_DIR) { $env:AGENT_ROOM_DIR } else { Join-Path $env:USERPROFILE ".agent-room" }),
  [string]$Url = "http://127.0.0.1:4777/api/snapshot?project=all",
  [int]$IntervalMs = 5000,
  [switch]$Once,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$wakePath = Join-Path $PSScriptRoot "wake-agent.ps1"

if (-not (Test-Path $wakePath)) {
  throw "Could not find wake script: $wakePath"
}

Set-Location $repoRoot

$watchArgs = @(
  "scripts/room-watch.mjs",
  "--agents",
  $Agents,
  "--room",
  $Room,
  "--url",
  $Url,
  "--interval-ms",
  [string]$IntervalMs,
  "--wake"
)

if ($Once) {
  $watchArgs += "--once"
}

if ($DryRun) {
  $watchArgs += "--dry-run"
}

node @watchArgs
