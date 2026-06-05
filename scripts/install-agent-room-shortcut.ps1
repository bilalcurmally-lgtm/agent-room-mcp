param(
  [string]$ShortcutName = "Agent Room",
  [string]$Room = "D:\projects\.agent-room",
  [int]$Port = 4777,
  [switch]$NoOpen,
  [switch]$SkipBuild,
  [switch]$Watch,
  [string]$Agents = "claude-opus,codex-desktop",
  [int]$IntervalMs = 5000,
  [switch]$Startup,
  [switch]$Remove,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Quote-ShortcutArg {
  param([string]$Value)
  return '"' + ($Value -replace '"', '\"') + '"'
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$launcherName = if ($Watch) { "start-room-watch.ps1" } else { "start-agent-room.ps1" }
$launcherPath = Join-Path $PSScriptRoot $launcherName

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
  (Quote-ShortcutArg $launcherPath)
)

if ($Watch) {
  $arguments += @(
    "-Agents",
    (Quote-ShortcutArg $Agents),
    "-Room",
    (Quote-ShortcutArg $Room),
    "-IntervalMs",
    [string]$IntervalMs
  )
} else {
  $arguments += @(
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
}

if ($DryRun) {
  Write-Output "Shortcut path: $shortcutPath"
  Write-Output ("Mode: " + $(if ($Startup) { "startup" } else { "desktop" }))
  Write-Output ("Target mode: " + $(if ($Watch) { "watcher" } else { "dashboard" }))
  if ($Remove) {
    Write-Output "Action: remove shortcut"
    exit 0
  }
  Write-Output "Target: powershell.exe"
  Write-Output ("Arguments: " + ($arguments -join " "))
  Write-Output "Working directory: $repoRoot"
  exit 0
}

if ($Remove) {
  if (Test-Path $shortcutPath) {
    Remove-Item -LiteralPath $shortcutPath
    Write-Output "Removed shortcut: $shortcutPath"
  } else {
    Write-Output "Shortcut not found: $shortcutPath"
  }
  exit 0
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = $arguments -join " "
$shortcut.WorkingDirectory = $repoRoot
$shortcut.WindowStyle = 1
$shortcut.Description = if ($Watch) { "Start Agent Room watcher notifications" } else { "Open the Agent Room dashboard" }
$shortcut.Save()

Write-Output "Created shortcut: $shortcutPath"
