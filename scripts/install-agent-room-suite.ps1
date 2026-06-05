param(
  [switch]$Startup,
  [switch]$Remove,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$installer = Join-Path $PSScriptRoot "install-agent-room-shortcut.ps1"
if (-not (Test-Path $installer)) {
  throw "Could not find shortcut installer: $installer"
}

$common = @()
if ($Startup) {
  $common += "-Startup"
}
if ($Remove) {
  $common += "-Remove"
}
if ($DryRun) {
  $common += "-DryRun"
}

& powershell -NoProfile -ExecutionPolicy Bypass -File $installer @common
& powershell -NoProfile -ExecutionPolicy Bypass -File $installer -ShortcutName "Agent Room Watch" -Watch @common
