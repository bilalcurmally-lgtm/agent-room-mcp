param(
  [string]$Agent = "codex-desktop",
  [string]$Room = "D:\projects\.agent-room",
  [string]$StartScript = "",
  [string]$PidPath = "",
  [int]$IntervalSeconds = 15,
  [switch]$Once
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

if (-not $StartScript) {
  if ($Agent -eq "codex-desktop") {
    $StartScript = Join-Path $PSScriptRoot "start-codex-room-watch.ps1"
  } else {
    throw "Pass -StartScript for agent '$Agent'."
  }
}

if (-not (Test-Path $StartScript)) {
  throw "Could not find watcher start script: $StartScript"
}

if (-not $PidPath) {
  $safeAgent = $Agent -replace '[^A-Za-z0-9_.-]', '-'
  if ($Agent -eq "codex-desktop") {
    $PidPath = Join-Path $Room ".codex-room-watch.pid"
  } else {
    $PidPath = Join-Path $Room ".$safeAgent-room-watch.pid"
  }
}

if ($IntervalSeconds -lt 5) {
  throw "-IntervalSeconds must be at least 5."
}

$logPath = Join-Path $Room ".$Agent-watch-supervisor.log"
New-Item -ItemType Directory -Force -Path $Room | Out-Null

function Write-SupervisorLog {
  param([string]$Message)
  $line = "$(Get-Date -Format o) $Message"
  Add-Content -LiteralPath $logPath -Value $line -Encoding utf8
}

function Test-WatcherRunning {
  if (-not (Test-Path $PidPath)) {
    return $false
  }

  try {
    $rawPid = (Get-Content -LiteralPath $PidPath -Raw).Trim()
    if (-not $rawPid) {
      return $false
    }
    $process = Get-Process -Id ([int]$rawPid) -ErrorAction SilentlyContinue
    return $null -ne $process
  } catch {
    return $false
  }
}

function Start-Watcher {
  Write-SupervisorLog "starting agent=$Agent script=$StartScript room=$Room"
  $output = & powershell -NoProfile -ExecutionPolicy Bypass -File $StartScript -Room $Room 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-SupervisorLog "start failed exit=$LASTEXITCODE output=$($output -join ' ')"
    throw "Watcher start failed for $Agent with exit $LASTEXITCODE."
  }
  if ($output) {
    Write-SupervisorLog "start output=$($output -join ' ')"
  }
}

do {
  if (-not (Test-WatcherRunning)) {
    Start-Watcher
  }

  if ($Once) {
    break
  }

  Start-Sleep -Seconds $IntervalSeconds
} while ($true)
