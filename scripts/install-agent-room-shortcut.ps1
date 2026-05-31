param(
  [string]$ShortcutName = "Agent Room",
  [string]$Room = "D:\projects\.agent-room",
  [int]$Port = 4777,
  [switch]$NoOpen,
  [switch]$SkipBuild,
  [switch]$Startup,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Quote-ShortcutArg {
  param([string]$Value)
  return '"' + ($Value -replace '"', '\"') + '"'
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$launcherPath = Join-Path $PSScriptRoot "start-agent-room.ps1"

if (-not (Test-Path $launcherPath)) {
  throw "Could not find launcher script: $launcherPath"
}

$shortcutDir = if ($Startup) {
  [Environment]::GetFolderPath("Startup")
} else {
  [Environment]::GetFolderPath("DesktopDirectory")
}
$shortcutPath = Join-Path $shortcutDir "$ShortcutName.lnk"
$arguments = @(
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  (Quote-ShortcutArg $launcherPath),
  "-Room",
  (Quote-ShortcutArg $Room),
  "-Port",
  [string]$Port
)

if ($NoOpen) {
  $arguments += "-NoOpen"
}

if ($SkipBuild) {
  $arguments += "-SkipBuild"
}

if ($DryRun) {
  Write-Output "Shortcut path: $shortcutPath"
  Write-Output ("Mode: " + $(if ($Startup) { "startup" } else { "desktop" }))
  Write-Output "Target: powershell.exe"
  Write-Output ("Arguments: " + ($arguments -join " "))
  Write-Output "Working directory: $repoRoot"
  exit 0
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = $arguments -join " "
$shortcut.WorkingDirectory = $repoRoot
$shortcut.WindowStyle = 1
$shortcut.Description = "Open the Agent Room dashboard"
$shortcut.Save()

Write-Output "Created shortcut: $shortcutPath"
