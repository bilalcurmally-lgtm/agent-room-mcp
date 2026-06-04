param(
  [string]$Agents = "claude-opus,codex-desktop",
  [string]$Room = "D:\projects\.agent-room",
  [string]$Url = "http://127.0.0.1:4777/api/snapshot?project=all",
  [int]$IntervalMs = 5000,
  [switch]$Once,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$notifyPath = Join-Path $PSScriptRoot "notify-agent-room.ps1"

if (-not (Test-Path $notifyPath)) {
  throw "Could not find notification script: $notifyPath"
}

Set-Location $repoRoot

$notifyCommand = "powershell -NoProfile -ExecutionPolicy Bypass -File `"$notifyPath`""
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
  "--command",
  $notifyCommand
)

if ($Once) {
  $watchArgs += "--once"
}

if ($DryRun) {
  $watchArgs += "--dry-run"
}

node @watchArgs
