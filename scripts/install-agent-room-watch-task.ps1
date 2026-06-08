param(
  [string]$Agent = "codex-desktop",
  [string]$Room = "D:\projects\.agent-room",
  [string]$TaskName = "",
  [string]$StartScript = "",
  [string]$PidPath = "",
  [int]$IntervalSeconds = 15,
  [switch]$RunNow,
  [switch]$Remove,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Quote-TaskArg {
  param([string]$Value)
  return '"' + ($Value -replace '"', '\"') + '"'
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$supervisor = Join-Path $PSScriptRoot "agent-room-watch-supervisor.ps1"

if (-not (Test-Path $supervisor)) {
  throw "Could not find supervisor script: $supervisor"
}

if (-not $TaskName) {
  $safeAgent = $Agent -replace '[^A-Za-z0-9_.-]', '-'
  $TaskName = "Agent Room Watch - $safeAgent"
}

# Auto-map the per-agent start script when one is not passed explicitly. Every
# agent that ships a durable auto-wake watcher needs an entry here, or the task
# installs against the supervisor default and the agent silently never wakes
# (this is exactly how the claude-opus task ended up half-wired and Disabled).
if (-not $StartScript) {
  switch ($Agent) {
    "codex-desktop" { $StartScript = Join-Path $PSScriptRoot "start-codex-room-watch.ps1" }
    "claude-opus"   { $StartScript = Join-Path $PSScriptRoot "start-claude-room-watch.ps1" }
  }
}

$markerPath = Join-Path $Room ".$Agent-watch-task.json"

$arguments = @(
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  (Quote-TaskArg $supervisor),
  "-Agent",
  (Quote-TaskArg $Agent),
  "-Room",
  (Quote-TaskArg $Room),
  "-IntervalSeconds",
  [string]$IntervalSeconds
)

if ($StartScript) {
  $arguments += @("-StartScript", (Quote-TaskArg $StartScript))
}

if ($PidPath) {
  $arguments += @("-PidPath", (Quote-TaskArg $PidPath))
}

if ($DryRun) {
  Write-Output "Task name: $TaskName"
  Write-Output ("Action: " + $(if ($Remove) { "remove" } else { "install" }))
  Write-Output "Execute: powershell.exe"
  Write-Output ("Arguments: " + ($arguments -join " "))
  Write-Output "Working directory: $repoRoot"
  if ($RunNow) {
    Write-Output "Run now: true"
  }
  exit 0
}

if ($Remove) {
  $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Output "Removed scheduled task: $TaskName"
  } else {
    Write-Output "Scheduled task not found: $TaskName"
  }
  if (Test-Path $markerPath) {
    Remove-Item -LiteralPath $markerPath -Force
    Write-Output "Removed task marker: $markerPath"
  }
  exit 0
}

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument ($arguments -join " ") `
  -WorkingDirectory $repoRoot
# Scope the logon trigger + principal to the CURRENT user so a non-elevated account
# can register the task. A bare `-AtLogOn` trigger applies to all users and requires
# admin (fails with "Access is denied"); pinning to $env:USERNAME with an interactive,
# limited-runlevel principal registers cleanly without elevation.
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal = New-ScheduledTaskPrincipal `
  -UserId $env:USERNAME `
  -LogonType Interactive `
  -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Days 3650) `
  -MultipleInstances IgnoreNew `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -StartWhenAvailable

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Description "Keeps the Agent Room watcher alive for $Agent without desktop notifications." `
  -Force | Out-Null

New-Item -ItemType Directory -Force -Path $Room | Out-Null
@{
  installedAt = (Get-Date).ToUniversalTime().ToString("o")
  agent = $Agent
  taskName = $TaskName
  supervisor = $supervisor
  startScript = $StartScript
  pidPath = $PidPath
  intervalSeconds = $IntervalSeconds
  version = 1
} | ConvertTo-Json | Set-Content -LiteralPath $markerPath -Encoding utf8

if ($RunNow) {
  Start-ScheduledTask -TaskName $TaskName
}

Write-Output "Installed scheduled task: $TaskName"
Write-Output "Wrote task marker: $markerPath"
