param(
  [string]$Title = "Agent Room",
  [int]$Seconds = 8,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$notifyPath = Join-Path $PSScriptRoot "notify-agent-room.ps1"

if (-not (Test-Path $notifyPath)) {
  throw "Could not find notification script: $notifyPath"
}

$agent = if ($env:AGENT_ROOM_AGENT) { $env:AGENT_ROOM_AGENT } else { "agent" }
$message = if ($env:AGENT_ROOM_PING) { $env:AGENT_ROOM_PING } else { "No room message provided." }
$roomDir = $env:AGENT_ROOM_DIR

$notifyArgs = @("-Title", $Title, "-Seconds", $Seconds)
if ($DryRun) {
  $notifyArgs += "-DryRun"
}
& powershell -NoProfile -ExecutionPolicy Bypass -File $notifyPath @notifyArgs

if ($roomDir -and $agent) {
  $inboxPath = Join-Path $roomDir ".wake-inbox-$agent.txt"
  if ($DryRun) {
    Write-Output "Inbox: $inboxPath"
  } else {
    Set-Content -Path $inboxPath -Value $message -Encoding utf8
  }
}