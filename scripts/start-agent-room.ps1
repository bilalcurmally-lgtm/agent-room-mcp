param(
  [string]$Room = $(if ($env:AGENT_ROOM_DIR) { $env:AGENT_ROOM_DIR } else { Join-Path $env:USERPROFILE ".agent-room" }),
  [int]$Port = 4777,
  [switch]$NoOpen,
  [switch]$SkipBuild,
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

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not (Test-Path "package.json")) {
  throw "Could not find package.json from launcher root: $repoRoot"
}

if (-not $SkipBuild) {
  npm run build
}

$dashboardArgs = @("dist/dashboard.js", "--room", $Room, "--port", [string]$Port)
if ($NoOpen) {
  $dashboardArgs += "--no-open"
}

if ($DryRun) {
  $printableArgs = $dashboardArgs | ForEach-Object { Quote-Arg $_ }
  Write-Output ("node " + ($printableArgs -join " "))
  exit 0
}

node @dashboardArgs
