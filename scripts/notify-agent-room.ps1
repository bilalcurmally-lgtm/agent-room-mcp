param(
  [string]$Title = "Agent Room",
  [int]$Seconds = 8,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$agent = if ($env:AGENT_ROOM_AGENT) { $env:AGENT_ROOM_AGENT } else { "agent" }
$message = if ($env:AGENT_ROOM_PING) { $env:AGENT_ROOM_PING } else { "No room message provided." }
$body = ($message -replace "\s+", " ").Trim()
if ($body.Length -gt 240) {
  $body = $body.Substring(0, 237) + "..."
}

if ($DryRun) {
  Write-Output "Title: $Title"
  Write-Output "Agent: $agent"
  Write-Output "Body: $body"
  exit 0
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = [System.Drawing.SystemIcons]::Information
$notify.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
$notify.BalloonTipTitle = "$Title - $agent"
$notify.BalloonTipText = $body
$notify.Visible = $true
$notify.ShowBalloonTip([Math]::Max(1, $Seconds) * 1000)

Start-Sleep -Seconds ([Math]::Max(1, $Seconds))
$notify.Dispose()
