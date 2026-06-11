param(
  [string]$Room = $(if ($env:AGENT_ROOM_DIR) { $env:AGENT_ROOM_DIR } else { Join-Path $env:USERPROFILE ".agent-room" }),
  [switch]$Stop
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$watchScript = Join-Path $PSScriptRoot "agent-wake-watch.mjs"
$pidPath = Join-Path $Room ".claude-opus-room-watch.pid"
$outPath = Join-Path $Room ".claude-opus-room-watch.out.log"
$errPath = Join-Path $Room ".claude-opus-room-watch.err.log"

if (Test-Path $pidPath) {
  $existingPid = [int](Get-Content -LiteralPath $pidPath -Raw)
  $existing = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
  if ($existing) {
    if ($Stop) {
      Stop-Process -Id $existingPid
      Remove-Item -LiteralPath $pidPath -Force
      Write-Output "Stopped Claude room watch (PID $existingPid)."
      exit 0
    }
    Write-Output "Claude room watch already running (PID $existingPid)."
    exit 0
  }
  Remove-Item -LiteralPath $pidPath -Force
}

if ($Stop) {
  Write-Output "Claude room watch is not running."
  exit 0
}

$node = (Get-Command node -ErrorAction Stop).Source
$claude = (Get-Command claude -ErrorAction Stop).Source
$env:AGENT_ROOM_DIR = $Room
$env:CLAUDE_CLI_PATH = $claude

$process = Start-Process `
  -FilePath $node `
  -ArgumentList @($watchScript, "--agent", "claude-opus", "--room", $Room) `
  -WorkingDirectory $repoRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $outPath `
  -RedirectStandardError $errPath `
  -PassThru

Set-Content -LiteralPath $pidPath -Value $process.Id -Encoding ascii
Write-Output "Started Claude room watch (PID $($process.Id))."
