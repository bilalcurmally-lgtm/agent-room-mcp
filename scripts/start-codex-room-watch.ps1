param(
  [string]$Room = "D:\projects\.agent-room",
  [switch]$Stop
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$watchScript = Join-Path $PSScriptRoot "agent-wake-watch.mjs"
$pidPath = Join-Path $Room ".codex-room-watch.pid"
$genericPidPath = Join-Path $Room ".codex-desktop-room-watch.pid"
$outPath = Join-Path $Room ".codex-room-watch.out.log"
$errPath = Join-Path $Room ".codex-room-watch.err.log"

if (Test-Path $pidPath) {
  $existingPid = [int](Get-Content -LiteralPath $pidPath -Raw)
  $existing = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
  if ($existing) {
    if ($Stop) {
      Stop-Process -Id $existingPid
      Remove-Item -LiteralPath $pidPath -Force
      if (Test-Path $genericPidPath) {
        Remove-Item -LiteralPath $genericPidPath -Force
      }
      Write-Output "Stopped Codex room watch (PID $existingPid)."
      exit 0
    }
    Write-Output "Codex room watch already running (PID $existingPid)."
    exit 0
  }
  Remove-Item -LiteralPath $pidPath -Force
}

if ($Stop) {
  Write-Output "Codex room watch is not running."
  exit 0
}

$node = (Get-Command node -ErrorAction Stop).Source
$codexBin = Join-Path $env:LOCALAPPDATA "OpenAI\Codex\bin"
$codex = Get-ChildItem $codexBin -Recurse -Filter codex.exe -File -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1 -ExpandProperty FullName
if (-not $codex) {
  $codex = (Get-Command codex -ErrorAction Stop).Source
}
$env:AGENT_ROOM_DIR = $Room
$env:CODEX_CLI_PATH = $codex

$process = Start-Process `
  -FilePath $node `
  -ArgumentList @($watchScript, "--agent", "codex-desktop", "--room", $Room) `
  -WorkingDirectory $repoRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $outPath `
  -RedirectStandardError $errPath `
  -PassThru

Set-Content -LiteralPath $pidPath -Value $process.Id -Encoding ascii
Write-Output "Started Codex room watch (PID $($process.Id))."
