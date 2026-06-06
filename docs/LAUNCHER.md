# Agent Room Launchers

Last updated: 2026-06-05

## Quick start

```powershell
cd D:\projects\agent-room-mcp
npm run start-suite
```

Starts the dashboard and the room watcher (minimized background window), and writes
`.launcher-suite.json` into the room directory for roadmap tracking.

## Commands

| Command | What it does |
| --- | --- |
| `npm run start-room` | Dashboard only |
| `npm run start-suite` | Dashboard + watcher + launcher marker |
| `npm run start-watch` | Watcher with Windows toasts |
| `npm run install-shortcut` | Desktop shortcut for dashboard |
| `npm run install-suite` | Dashboard + watcher desktop shortcuts |

## Options

`scripts/start-agent-room.ps1`:

- `-Room` — room directory (default `D:\projects\.agent-room`)
- `-Port` — dashboard port (default `4777`)
- `-NoOpen` — print URL only, do not open browser
- `-SkipBuild` — skip `npm run build`
- `-DryRun` — print the node command

`scripts/start-agent-room-suite.ps1` adds:

- `-NoWatch` — dashboard only, still writes launcher marker

## Tray app

A system tray app is not part of the MVP. The suite launcher covers the common case:
one command for dashboard + notifications. Shortcuts remain for daily pinning to the desktop.