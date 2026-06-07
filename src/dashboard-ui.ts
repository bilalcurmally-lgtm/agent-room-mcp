export const dashboardHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Agent Room</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    :root {
      color-scheme: dark;
      --bg: oklch(0.17 0.012 255);
      --surface: oklch(0.21 0.014 255);
      --surface-raised: oklch(0.24 0.016 255);
      --ink: oklch(0.94 0.01 255);
      --muted: oklch(0.72 0.02 255);
      --faint: oklch(0.58 0.02 255);
      --line: oklch(0.32 0.018 255);
      --soft: oklch(0.26 0.014 255);
      --soft-2: oklch(0.23 0.013 255);
      --accent: oklch(0.62 0.11 175);
      --accent-ink: oklch(0.78 0.09 175);
      --accent-soft: oklch(0.28 0.04 175);
      --blue: oklch(0.68 0.14 255);
      --blue-soft: oklch(0.26 0.04 255);
      --warn: oklch(0.75 0.14 75);
      --warn-soft: oklch(0.28 0.05 75);
      --danger: oklch(0.65 0.18 25);
      --danger-soft: oklch(0.26 0.05 25);
      --done: oklch(0.72 0.14 155);
      --partial: oklch(0.74 0.12 85);
      --todo: oklch(0.62 0.02 255);
      --radius: 10px;
      --z-sticky: 10;
      --z-drawer: 40;
      --z-toast: 50;
    }

    * { box-sizing: border-box; }
    html { min-width: 320px; }
    body {
      margin: 0;
      /* Lock the app to the viewport so the feed and side panel scroll inside
         their own regions and the composer/topbar stay pinned, instead of the
         whole page scrolling. */
      height: 100dvh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-family: Inter, system-ui, sans-serif;
      background: var(--bg);
      color: var(--ink);
      line-height: 1.5;
    }
    header.topbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px 14px;
      padding: 10px 16px;
      border-bottom: 1px solid var(--line);
      background: var(--surface);
      position: sticky;
      top: 0;
      z-index: var(--z-sticky);
    }
    .brand {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 120px;
      margin-right: auto;
    }
    .brand strong {
      font-size: 1.125rem;
      line-height: 1.2;
      letter-spacing: -0.02em;
      font-weight: 600;
    }
    .brand span {
      font-size: 0.75rem;
      color: var(--faint);
      font-family: "IBM Plex Mono", monospace;
    }
    .topbar-field {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .topbar-field label {
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--muted);
      white-space: nowrap;
    }
    .topbar-field.project-field { flex: 1 1 180px; max-width: 280px; }
    .topbar-field.search-field { flex: 2 1 220px; max-width: 420px; }
    .topbar-actions {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    label {
      display: grid;
      gap: 4px;
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--muted);
    }
    .app-shell {
      display: grid;
      grid-template-columns: 72px minmax(0, 1fr);
      /* Constrain the single row to the shell height (not the feed's content
         height) so the columns scroll internally and the composer stays pinned. */
      grid-template-rows: minmax(0, 1fr);
      flex: 1;
      min-height: 0;
    }
    body.panel-open-shell .app-shell {
      grid-template-columns: 72px minmax(0, 1fr) minmax(300px, 360px);
    }
    body.panel-collapsed .app-shell {
      grid-template-columns: 72px minmax(0, 1fr);
    }
    .sidebar {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 10px 6px;
      border-right: 1px solid var(--line);
      background: var(--soft-2);
    }
    .sidebar .nav-btn {
      display: grid;
      gap: 2px;
      justify-items: center;
      padding: 8px 4px;
      border: 1px solid transparent;
      border-radius: var(--radius);
      background: transparent;
      color: var(--muted);
      font-size: 0.6875rem;
      font-weight: 500;
      min-height: auto;
      cursor: pointer;
      transition: background 0.18s ease-out, color 0.18s ease-out, border-color 0.18s ease-out;
    }
    .sidebar .nav-btn:hover {
      background: var(--soft);
      color: var(--ink);
      border-color: var(--line);
    }
    .sidebar .nav-btn.active {
      background: var(--accent-soft);
      color: var(--accent-ink);
      border-color: oklch(0.38 0.05 175);
    }
    .sidebar .nav-btn .nav-count {
      font-family: "IBM Plex Mono", monospace;
      font-size: 0.625rem;
      padding: 1px 5px;
      border-radius: 999px;
      background: var(--soft);
      color: var(--faint);
    }
    .sidebar .nav-btn.active .nav-count { background: oklch(0.32 0.04 175); color: var(--accent-ink); }
    .main-column {
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow: hidden;
    }
    aside.panel {
      display: none;
      flex-direction: column;
      border-left: 1px solid var(--line);
      background: var(--surface);
      overflow: hidden;
    }
    body.panel-open-shell:not(.panel-collapsed) aside.panel { display: flex; }
    section.main-feed {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
      background: var(--surface);
      border-right: 1px solid var(--line);
    }
    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--line);
      background: var(--surface-raised);
    }
    .panel-head h2 {
      margin: 0;
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--ink);
    }
    .panel-scroll { overflow: auto; padding: 12px; display: grid; gap: 10px; flex: 1; }
    .panel-section {
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--soft-2);
      overflow: hidden;
    }
    .panel-section[hidden] { display: none !important; }
    .panel-section > summary {
      list-style: none;
      cursor: pointer;
      min-height: 40px;
      padding: 10px 12px;
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--ink);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      user-select: none;
      background: var(--surface-raised);
    }
    .panel-section > summary::-webkit-details-marker { display: none; }
    .panel-section > summary::after {
      content: "▾";
      font-size: 0.75rem;
      color: var(--faint);
    }
    .panel-section:not([open]) > summary::after { content: "▸"; }
    .panel-section[open] > summary { border-bottom: 1px solid var(--line); }
    .panel-body { padding: 12px; display: grid; gap: 12px; }
    .panel-body .stack { gap: 8px; }
    .panel-body h3 {
      margin: 4px 0 0;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--faint);
    }
    details.feed-section {
      display: flex;
      flex-direction: column;
      /* Header only (title + filter chips + workspace banner). #feed is now a
         sibling, not a child, so it gets a real bounded height from .main-feed
         and scrolls reliably — a <details> is an unreliable flex parent. */
      flex: 0 0 auto;
    }
    details.feed-section > summary.section-block {
      list-style: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px 10px;
      border-bottom: 1px solid var(--line);
      background: var(--surface-raised);
      cursor: default;
    }
    details.feed-section > summary.section-block::-webkit-details-marker { display: none; }
    .section-block h2 {
      margin: 0;
      font-size: 1rem;
      line-height: 1.2;
      font-weight: 600;
      letter-spacing: -0.02em;
      color: var(--ink);
      text-wrap: balance;
    }
    .feed-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 8px 16px;
      border-bottom: 1px solid var(--line);
      background: var(--soft-2);
    }
    .header-progress {
      min-height: 32px;
      font-family: "IBM Plex Mono", monospace;
      font-size: 0.6875rem;
      color: var(--accent-ink);
      padding: 6px 10px;
      border: 1px solid oklch(0.38 0.05 175);
      border-radius: 999px;
      background: var(--accent-soft);
      cursor: pointer;
      white-space: nowrap;
    }
    .header-progress:hover { border-color: var(--accent); background: oklch(0.30 0.05 175); }
    .progress-compact { display: grid; gap: 8px; }
    .progress-compact .meta { margin: 0; }
    .feed {
      display: grid;
      gap: 8px;
      padding: 12px 16px;
      overflow-y: scroll;
      scrollbar-gutter: stable;
      flex: 1;
      min-height: 0;
      align-content: start;
    }
    .feed::-webkit-scrollbar { width: 10px; }
    .feed::-webkit-scrollbar-track { background: var(--soft-2); border-radius: 5px; }
    .feed::-webkit-scrollbar-thumb {
      background: var(--line);
      border-radius: 5px;
      border: 2px solid var(--soft-2);
    }
    .feed::-webkit-scrollbar-thumb:hover { background: var(--faint); }
    .feed-project-group {
      display: grid;
      gap: 8px;
      margin-top: 4px;
    }
    .feed-project-group:first-child { margin-top: 0; }
    .feed-project-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 8px 10px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--soft);
      position: sticky;
      top: 0;
      z-index: 1;
    }
    .feed-project-head strong {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--ink);
    }
    .feed-project-head span {
      font-family: "IBM Plex Mono", monospace;
      font-size: 0.6875rem;
      color: var(--faint);
    }
    .feed-project-head button {
      min-height: 28px;
      padding: 4px 10px;
      font-size: 0.75rem;
    }
    .composer-hint {
      font-size: 0.75rem;
      color: var(--faint);
      margin: 0;
    }
    .stack { display: grid; gap: 10px; }
    .message, .task, .decision, .agent, .empty, .progress-panel {
      border: 1px solid var(--line);
      border-radius: var(--radius);
      padding: 12px 14px;
      background: var(--soft-2);
    }
    .message { background: var(--surface); }
    .task, .decision, .agent { background: var(--soft-2); }
    .empty {
      display: grid;
      gap: 2px;
      padding: 14px;
      color: var(--muted);
      background: var(--soft-2);
      border: 1px dashed var(--line);
      font-size: 13px;
    }
    .empty strong { color: var(--ink); font-weight: 600; font-style: normal; }
    .empty span { font-size: 12px; line-height: 1.4; }
    .empty-inline { font-size: 12px; color: var(--muted); padding: 4px 0; }
    .more-inline {
      font-family: "IBM Plex Mono", monospace;
      font-size: 11px;
      color: var(--muted);
      padding: 7px 9px;
      border-radius: var(--radius);
      background: var(--soft-2);
      border: 1px dashed var(--line);
    }
    .badge-count {
      font-size: 0.625rem;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent-ink);
      border: 1px solid oklch(0.38 0.05 175);
      font-family: "IBM Plex Mono", monospace;
    }
    .badge-count.warn { background: var(--warn-soft); color: var(--warn); border-color: oklch(0.45 0.08 75); }
    #side-toggle, #panel-open, #side-toggle-inline, #filter-drawer-open {
      border-color: var(--line);
      background: var(--soft-2);
      color: var(--ink);
      font-size: 0.8125rem;
      padding: 8px 11px;
    }
    #panel-open {
      display: none;
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: var(--z-toast);
    }
    body.panel-collapsed #panel-open { display: inline-block; }
    .meta {
      color: var(--faint);
      font-size: 11px;
      margin-bottom: 7px;
      font-family: "IBM Plex Mono", monospace;
      line-height: 1.5;
    }
    .body {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-size: 0.875rem;
      color: var(--ink);
    }
    .body.is-clamped {
      max-height: 12rem;
      overflow: hidden;
      position: relative;
    }
    .body.is-clamped::after {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 44px;
      background: linear-gradient(180deg, transparent, var(--surface));
      pointer-events: none;
    }
    .inline-toggle {
      justify-self: start;
      min-height: 30px;
      margin-top: 8px;
      padding: 4px 9px;
      border-color: var(--line);
      background: var(--soft-2);
      color: var(--ink);
      font-size: 12px;
    }
    .inline-toggle:hover {
      border-color: rgba(13, 127, 115, 0.45);
      background: var(--accent-soft);
      color: var(--accent-ink);
    }
    .progress-track {
      height: 9px;
      border: 1px solid rgba(13, 127, 115, 0.16);
      border-radius: 999px;
      background: var(--soft);
      overflow: hidden;
      margin: 2px 0 4px;
    }
    .progress-bar { height: 100%; width: 0; background: var(--accent); transition: width 0.28s ease; }
    .progress-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
    .progress-item { display: grid; gap: 4px; padding: 9px 10px; border-radius: var(--radius); background: var(--soft-2); border: 1px solid transparent; }
    .progress-item .header-row { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
    .progress-item .title { font-size: 13px; font-weight: 600; }
    .pill { font-size: 0.6875rem; font-weight: 600; padding: 3px 8px; border-radius: 999px; border: 1px solid var(--line); }
    .pill.done { color: var(--done); border-color: oklch(0.45 0.08 155); background: oklch(0.26 0.04 155); }
    .pill.partial { color: var(--partial); border-color: oklch(0.45 0.07 85); background: oklch(0.28 0.04 85); }
    .pill.todo { color: var(--todo); border-color: var(--line); background: var(--soft); }
    .follow-up { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px; }
    .follow-up span { font-size: 0.6875rem; padding: 4px 8px; border-radius: 999px; background: var(--blue-soft); color: var(--blue); border: 1px solid oklch(0.38 0.06 255); font-family: "IBM Plex Mono", monospace; }
    .stale-warn .message, .stale-warn .task { border-color: oklch(0.55 0.1 75); background: var(--warn-soft); }
    /* U6: per-agent identity. --agent* custom props are set inline per card. */
    .message { border-left: 3px solid var(--agent, var(--line)); }
    .msg-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      margin-bottom: 7px;
    }
    .agent-avatar {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      border-radius: 6px;
      flex: none;
      font-family: "IBM Plex Mono", monospace;
      font-size: 10px;
      font-weight: 700;
      color: var(--agent-ink, var(--ink));
      background: var(--agent-soft, var(--soft));
      border: 1px solid var(--agent-line, var(--line));
    }
    .msg-author {
      font-family: "IBM Plex Mono", monospace;
      font-size: 12px;
      font-weight: 600;
      color: var(--agent-ink, var(--ink));
    }
    .msg-route, .msg-meta-faint {
      font-family: "IBM Plex Mono", monospace;
      font-size: 11px;
      color: var(--faint);
    }
    /* U5: inline protocol-violation tag, where people actually read. */
    .protocol-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-left: auto;
      font-family: "IBM Plex Mono", monospace;
      font-size: 10px;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 999px;
      color: var(--warn);
      background: var(--warn-soft);
      border: 1px solid oklch(0.45 0.08 75);
      cursor: help;
    }
    .composer {
      display: grid;
      gap: 8px;
      padding: 12px 16px 16px;
      border-top: 1px solid var(--line);
      background: var(--surface-raised);
      flex: 0 0 auto;
    }
    #message-form { margin: 0; }
    .composer-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 6px 12px;
    }
    .composer-foot .composer-hint { margin: 0; }
    .composer-identity {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--muted);
      white-space: nowrap;
    }
    .composer-identity input {
      width: auto;
      min-height: 28px;
      max-width: 160px;
      padding: 4px 8px;
      font-size: 12px;
    }
    .composer-advanced {
      display: none;
      gap: 8px;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--surface);
    }
    .composer-advanced.is-open { display: grid; }
    .composer-toggle {
      justify-self: start;
      min-height: 30px;
      padding: 4px 10px;
      font-size: 0.75rem;
      border-color: var(--line);
      background: var(--soft);
      color: var(--muted);
    }
    .composer-toggle:hover { color: var(--ink); border-color: var(--accent); }
    .task-inline-form {
      display: grid;
      gap: 8px;
      margin-top: 10px;
      padding: 10px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--surface);
    }
    .task-inline-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .route-presets, .filter-presets, .template-presets, .task-owner-presets, .task-actions { display: flex; gap: 7px; flex-wrap: wrap; }
    textarea, input, select, button { font: inherit; }
    textarea, input, select {
      width: 100%;
      min-height: 38px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      padding: 8px 10px;
      background: var(--soft-2);
      color: var(--ink);
      font-size: 0.875rem;
      transition: border-color 0.18s ease-out, box-shadow 0.18s ease-out;
    }
    textarea:focus, input:focus, select:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px oklch(0.28 0.04 175);
      background: var(--surface);
    }
    textarea { resize: vertical; min-height: 96px; }
    #message {
      min-height: 132px;
      max-height: 38dvh;
      line-height: 1.5;
    }
    button {
      border: 1px solid var(--accent);
      background: var(--accent);
      color: oklch(0.98 0.01 175);
      border-radius: var(--radius);
      min-height: 38px;
      padding: 8px 12px;
      cursor: pointer;
      font-weight: 600;
      font-size: 0.875rem;
      transition: background 0.18s ease-out, border-color 0.18s ease-out, transform 0.12s ease-out;
    }
    button:active { transform: translateY(1px); }
    button:hover { background: oklch(0.56 0.11 175); border-color: oklch(0.56 0.11 175); }
    .filter-presets button, .route-presets button, .template-presets button, .task-owner-presets button, .task-actions button, #refresh, #side-toggle, #side-toggle-inline, #panel-open, #project-browse, #project-load, #project-delete, .inline-toggle, #filter-drawer-open, .composer-toggle {
      border-color: var(--line);
      background: var(--soft-2);
      color: var(--ink);
    }
    .filter-presets button:hover, .route-presets button:hover, .template-presets button:hover, .task-owner-presets button:hover, .task-actions button:hover, #refresh:hover, #side-toggle:hover, #side-toggle-inline:hover, #panel-open:hover, #project-browse:hover, #project-load:hover, .inline-toggle:hover, #filter-drawer-open:hover, .composer-toggle:hover {
      border-color: var(--accent);
      background: var(--accent-soft);
      color: var(--accent-ink);
    }
    .filter-presets button[data-active="true"] {
      border-color: var(--accent);
      background: var(--accent-soft);
      color: var(--accent-ink);
    }
    .template-presets button, .task-owner-presets button {
      min-height: 32px;
      padding: 5px 9px;
      font-size: 12px;
    }
    .composer-row {
      display: grid;
      gap: 8px;
    }
    #project-delete:hover {
      border-color: rgba(180, 35, 24, 0.36);
      background: var(--danger-soft);
      color: var(--danger);
    }
    .task-actions { margin-top: 12px; align-items: center; }
    .task-actions button { min-height: 32px; font-size: 12px; padding: 5px 9px; }
    .task-status-select { width: auto; min-height: 32px; font-size: 12px; padding: 4px 8px; }
    #refresh { width: 40px; padding: 0; font-size: 17px; }
    #room-clock { font-family: "IBM Plex Mono", monospace; font-size: 11px; color: var(--faint); white-space: nowrap; }
    .workspace-banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 12px 14px;
      border-top: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
      background: var(--soft-2);
      font-size: 13px;
    }
    .workspace-banner.warn { border-color: oklch(0.55 0.1 75); background: var(--warn-soft); color: var(--warn); }
    .workspace-banner.ok { border-color: oklch(0.42 0.06 175); background: var(--accent-soft); color: var(--accent-ink); }
    .workspace-banner strong { font-weight: 700; }
    .workspace-banner button { min-height: 32px; font-size: 12px; padding: 5px 9px; }
    .workspace-actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .attachment-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
    .attachment-list a {
      font-size: 0.75rem;
      padding: 5px 8px;
      border-radius: 999px;
      border: 1px solid oklch(0.38 0.06 255);
      background: var(--blue-soft);
      color: var(--blue);
      text-decoration: none;
      font-family: "IBM Plex Mono", monospace;
    }
    .attachment-list a:hover { border-color: var(--blue); }
    .attachment-pending { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; font-size: 12px; color: var(--muted); }
    .attachment-pending span { padding: 4px 6px; border: 1px solid var(--line); border-radius: 999px; background: var(--soft-2); }
    .attachment-pending button { min-height: 24px; font-size: 11px; padding: 1px 6px; margin-left: 4px; }
    .filter-drawer {
      border: none;
      padding: 0;
      margin: 0;
      max-width: min(400px, 100vw);
      width: 100%;
      height: 100%;
      max-height: 100dvh;
      background: var(--surface);
      color: var(--ink);
    }
    .filter-drawer::backdrop { background: oklch(0.1 0.01 255 / 0.55); }
    .drawer-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      border-bottom: 1px solid var(--line);
    }
    .drawer-head h2 { margin: 0; font-size: 1rem; font-weight: 600; }
    .drawer-body { padding: 16px; display: grid; gap: 14px; }
    @media (min-width: 900px) {
      body.panel-open-shell:not(.panel-collapsed) .app-shell {
        grid-template-columns: 72px minmax(0, 1fr) minmax(320px, 380px);
      }
    }
    @media (max-width: 720px) {
      .topbar-field.search-field { flex-basis: 100%; max-width: none; }
      body.panel-open-shell:not(.panel-collapsed) .app-shell {
        grid-template-columns: 64px minmax(0, 1fr);
      }
      body.panel-open-shell:not(.panel-collapsed) aside.panel {
        position: fixed;
        inset: 53px 0 0 64px;
        z-index: var(--z-drawer);
        display: flex;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    }
  </style>
</head>
<body class="panel-open-shell">
  <header class="topbar">
    <div class="brand">
      <strong>Agent Room</strong>
      <span>Control room</span>
    </div>
    <div class="topbar-field project-field">
      <label for="project">Project</label>
      <select id="project"></select>
    </div>
    <div class="topbar-field search-field">
      <label for="search">Search</label>
      <input id="search" placeholder="Messages, tasks, decisions" />
    </div>
    <div class="topbar-actions">
      <button id="filter-drawer-open" type="button">Filters</button>
      <button id="header-progress" type="button" class="header-progress" title="Jump to roadmap" hidden>0% roadmap</button>
      <button id="side-toggle" type="button" title="Toggle room panel" aria-pressed="true">Hide panel</button>
      <button id="refresh" type="button" title="Refresh">↻</button>
      <span id="room-clock">Room time</span>
    </div>
  </header>
  <div class="app-shell">
    <nav class="sidebar" aria-label="Room sections">
      <button type="button" class="nav-btn active" data-nav="overview" title="Overview">◎<span>Feed</span></button>
      <button type="button" class="nav-btn" data-nav="tasks" title="Tasks">☑<span>Tasks</span><span class="nav-count" id="nav-tasks-count">0</span></button>
      <button type="button" class="nav-btn" data-nav="decisions" title="Decisions">◆<span>Decide</span></button>
      <button type="button" class="nav-btn" data-nav="alerts" title="Alerts">!<span>Alerts</span><span class="nav-count" id="nav-alerts-count" hidden>0</span></button>
      <button type="button" class="nav-btn" data-nav="notifications" title="Notifications">◉<span>Notify</span></button>
      <button type="button" class="nav-btn" data-nav="projects" title="Projects">⌂<span>Projects</span></button>
      <button type="button" class="nav-btn" data-nav="roadmap" title="Roadmap">↗<span>Roadmap</span></button>
    </nav>
    <main class="main-column">
      <section class="main-feed">
        <details class="feed-section" id="feed-section" open>
          <summary class="section-block"><h2>Room Feed</h2><span class="meta" id="feed-summary"></span></summary>
          <div class="feed-chips filter-presets" aria-label="Filter presets">
            <button type="button" data-filter-preset="today">Today</button>
            <button type="button" data-filter-preset="week">Week</button>
            <button type="button" data-filter-preset="mine">Mine</button>
            <button type="button" data-filter-preset="review">Review</button>
            <button type="button" data-filter-preset="clear">Clear</button>
          </div>
          <div id="workspace-banner" class="workspace-banner warn" hidden></div>
        </details>
        <div id="feed" class="feed"></div>
        <form id="message-form" class="composer">
            <textarea id="message" rows="2" placeholder="Tell the room... use @all, @codex, @grok, @claude"></textarea>
            <div class="composer-foot">
              <p class="composer-hint" id="composer-route-hint">Enter to send · Shift+Enter for a new line · @mentions route alerts</p>
              <label class="composer-identity">Posting as <input id="composer-user" placeholder="Your name" title="Your display name on this browser only — saved locally, not shared with agents" /></label>
            </div>
            <button type="button" class="composer-toggle" id="composer-toggle">More options</button>
            <div class="composer-advanced" id="composer-advanced">
              <div class="template-presets" aria-label="Message templates">
                <button type="button" data-message-template="assign">Assign work</button>
                <button type="button" data-message-template="review">Request review</button>
                <button type="button" data-message-template="status">Ask status</button>
                <button type="button" data-message-template="blocked">Report blocker</button>
              </div>
              <div class="composer-row">
                <label>Route to <input id="message-to" value="all" /></label>
                <div class="route-presets" aria-label="Route presets">
                  <button type="button" data-route-preset="all">To all</button>
                  <button type="button" data-route-preset="codex-desktop">To Codex</button>
                  <button type="button" data-route-preset="claude-opus">To Claude</button>
                  <button type="button" data-route-preset="grok">To Grok</button>
                  <button type="button" data-route-preset="antigravity">To Antigravity</button>
                </div>
              </div>
              <select id="message-status">
                <option value="">Status (optional)</option>
                <option value="planning">planning</option>
                <option value="implementing">implementing</option>
                <option value="reviewing">reviewing</option>
                <option value="blocked">blocked</option>
              </select>
              <input id="message-phase" placeholder="Phase (optional), e.g. C1 or review" />
              <textarea id="message-next" rows="2" placeholder="Next step (optional)"></textarea>
              <label>Attach files <input id="message-files" type="file" multiple accept="text/*,image/*,.pdf,.json,.zip" /></label>
            </div>
            <div id="message-attachments-pending" class="attachment-pending" hidden></div>
            <button id="message-submit" type="submit">Tell all agents</button>
          </form>
      </section>
    </main>
    <aside class="panel" id="side-panel">
      <div class="panel-head">
        <h2>Room panel</h2>
        <button id="side-toggle-inline" type="button" title="Hide panel">Hide</button>
      </div>
      <div class="panel-scroll">
        <details class="panel-section" id="section-overview" open>
          <summary>Overview</summary>
          <div class="panel-body">
            <div id="room-status" class="stack"></div>
            <h3>Agents</h3>
            <div id="agents" class="stack"></div>
          </div>
        </details>
        <details class="panel-section" id="section-roadmap" hidden>
          <summary>Roadmap <span id="roadmap-badge" class="badge-count">0%</span></summary>
          <div class="panel-body progress-compact">
            <div id="progress-summary" class="meta">Loading progress...</div>
            <div class="progress-track" aria-label="Roadmap progress">
              <div id="progress-bar" class="progress-bar"></div>
            </div>
            <ul id="progress-items" class="progress-list"></ul>
          </div>
        </details>
        <details class="panel-section" id="section-notifications" hidden>
          <summary>Notifications <span id="notifications-badge" class="badge-count">live</span></summary>
          <div class="panel-body">
            <div id="notifications-status" class="stack"></div>
            <div id="notifications-agents" class="stack"></div>
            <div id="notifications-recent" class="stack"></div>
          </div>
        </details>
        <details class="panel-section" id="section-alerts" hidden>
          <summary>Alerts <span id="alerts-badge" class="badge-count" hidden>0</span></summary>
          <div class="panel-body">
            <h3>Protocol</h3>
            <div id="protocol-warnings" class="stack"></div>
            <h3>Stale tasks</h3>
            <div id="stale-tasks" class="stack stale-warn"></div>
            <h3>Stale messages</h3>
            <div id="stale-messages" class="stack stale-warn"></div>
            <h3>Stale decisions</h3>
            <div id="stale-decisions" class="stack stale-warn"></div>
            <div id="stale-quiet" class="empty-inline" hidden>All context is fresh.</div>
            <form id="stale-threshold-form" class="composer">
              <label>Stale after hours <input id="stale-threshold" type="number" min="1" step="1" /></label>
              <label><input id="enforce-protocol" type="checkbox" /> Reject non-compliant agent MCP messages</label>
              <button type="submit">Save room settings</button>
            </form>
          </div>
        </details>
        <details class="panel-section" id="section-tasks" hidden>
          <summary>Tasks <span id="tasks-badge" class="badge-count">0</span></summary>
          <div class="panel-body">
            <div id="tasks" class="stack"></div>
            <form id="task-form" class="composer">
              <input id="task-title" placeholder="Task title" />
              <textarea id="task-body" rows="2" placeholder="Task details"></textarea>
              <input id="task-owner" placeholder="Owner (optional)" />
              <div class="task-owner-presets" aria-label="Task owner presets">
                <button type="button" data-task-owner="codex-desktop">Codex owns</button>
                <button type="button" data-task-owner="claude-opus">Claude owns</button>
                <button type="button" data-task-owner="user">I own</button>
                <button type="button" data-task-owner="">No owner</button>
              </div>
              <button type="submit">Create task</button>
            </form>
          </div>
        </details>
        <details class="panel-section" id="section-projects" hidden>
          <summary>Projects</summary>
          <div class="panel-body">
            <div id="project-records" class="stack"></div>
            <form id="project-form" class="composer">
              <input id="project-id" placeholder="Project id, e.g. audit-cockpit" />
              <input id="project-name" placeholder="Project name" />
              <input id="project-folder" placeholder="Project folder, e.g. D:\\projects\\audit-cockpit" />
              <input id="project-repo" placeholder="Repo URL (optional)" />
              <input id="project-status" placeholder="Status (optional)" />
              <button id="project-browse" type="button">Browse folder</button>
              <button id="project-load" type="button">Load selected project</button>
              <button type="submit">Add or save project folder</button>
              <button id="project-delete" type="button">Delete project folder</button>
            </form>
          </div>
        </details>
        <details class="panel-section" id="section-decisions" hidden>
          <summary>Decisions</summary>
          <div class="panel-body">
            <div id="decisions" class="stack"></div>
            <form id="decision-form" class="composer">
              <input id="decision-title" placeholder="Decision title" />
              <textarea id="decision-body" rows="2" placeholder="Decision"></textarea>
              <textarea id="decision-rationale" rows="2" placeholder="Rationale"></textarea>
              <button type="submit">Record decision</button>
            </form>
          </div>
        </details>
      </div>
    </aside>
  </div>
  <dialog id="filter-drawer" class="filter-drawer">
    <div class="drawer-head">
      <h2>Filters</h2>
      <button type="button" id="filter-drawer-close">Close</button>
    </div>
    <div class="drawer-body">
      <label>You <input id="current-user" placeholder="user" title="Your room identity for the Mine filter" /></label>
      <label>Agent <input id="filter-agent" placeholder="codex, claude-opus" /></label>
      <label>Since <input id="filter-since" type="date" /></label>
      <label>Until <input id="filter-until" type="date" /></label>
    </div>
  </dialog>
  <button id="panel-open" type="button">Open panel</button>
  <script>
    let selectedProject = "all";
    let searchQuery = "";
    // Keys of bodies the user has expanded ("Show full"). Survives the 5s
    // auto-refresh rebuild so an expanded message/task stays expanded.
    const expandedBodies = new Set();
    // Signature of the last feed render; lets the auto-refresh skip rebuilding
    // (and thus skip resetting scroll) when nothing in the feed changed.
    let lastFeedSignature = null;
    // U5: which feed messages violate the protocol, plus the warning detail for
    // the inline tag's tooltip. Refreshed from each snapshot's protocolWarnings.
    let nonCompliantMessageIds = new Set();
    let protocolWarningById = new Map();
    let filterAgent = "";
    let filterSince = "";
    let filterUntil = "";
    const projectSelect = document.getElementById("project");
    const workspaceBanner = document.getElementById("workspace-banner");
    const searchInput = document.getElementById("search");
    const currentUserInput = document.getElementById("current-user");
    const composerUserInput = document.getElementById("composer-user");
    const filterAgentInput = document.getElementById("filter-agent");
    const filterSinceInput = document.getElementById("filter-since");
    const filterUntilInput = document.getElementById("filter-until");
    const feed = document.getElementById("feed");
    const feedSummary = document.getElementById("feed-summary");
    const feedSection = document.getElementById("feed-section");
    const headerProgress = document.getElementById("header-progress");
    const sectionRoadmap = document.getElementById("section-roadmap");
    const roadmapBadge = document.getElementById("roadmap-badge");
    const progressSummary = document.getElementById("progress-summary");
    const progressBar = document.getElementById("progress-bar");
    const progressItems = document.getElementById("progress-items");
    const roomStatus = document.getElementById("room-status");
    const agents = document.getElementById("agents");
    const protocolWarnings = document.getElementById("protocol-warnings");
    const staleTasks = document.getElementById("stale-tasks");
    const staleMessages = document.getElementById("stale-messages");
    const staleDecisions = document.getElementById("stale-decisions");
    const staleThresholdForm = document.getElementById("stale-threshold-form");
    const staleThreshold = document.getElementById("stale-threshold");
    const enforceProtocol = document.getElementById("enforce-protocol");
    const tasks = document.getElementById("tasks");
    const decisions = document.getElementById("decisions");
    const projectRecords = document.getElementById("project-records");
    const messageForm = document.getElementById("message-form");
    const messageInput = document.getElementById("message");
    const messageStatus = document.getElementById("message-status");
    const messagePhase = document.getElementById("message-phase");
    const messageNext = document.getElementById("message-next");
    const messageTo = document.getElementById("message-to");
    const messageSubmit = document.getElementById("message-submit");
    const messageFiles = document.getElementById("message-files");
    const messageAttachmentsPending = document.getElementById("message-attachments-pending");
    let pendingAttachmentIds = [];
    const projectForm = document.getElementById("project-form");
    const projectId = document.getElementById("project-id");
    const projectName = document.getElementById("project-name");
    const projectFolder = document.getElementById("project-folder");
    const projectRepo = document.getElementById("project-repo");
    const projectStatus = document.getElementById("project-status");
    const projectBrowse = document.getElementById("project-browse");
    const projectLoad = document.getElementById("project-load");
    const projectDelete = document.getElementById("project-delete");
    const taskForm = document.getElementById("task-form");
    const taskTitle = document.getElementById("task-title");
    const taskBody = document.getElementById("task-body");
    const taskOwner = document.getElementById("task-owner");
    const decisionForm = document.getElementById("decision-form");
    const decisionTitle = document.getElementById("decision-title");
    const decisionBody = document.getElementById("decision-body");
    const decisionRationale = document.getElementById("decision-rationale");
    const refreshButton = document.getElementById("refresh");
    const roomClock = document.getElementById("room-clock");
    const sideToggle = document.getElementById("side-toggle");
    const sideToggleInline = document.getElementById("side-toggle-inline");
    const panelOpen = document.getElementById("panel-open");
    const sectionAlerts = document.getElementById("section-alerts");
    const alertsBadge = document.getElementById("alerts-badge");
    const tasksBadge = document.getElementById("tasks-badge");
    const staleQuiet = document.getElementById("stale-quiet");

    const PANEL_KEY = "agent-room-panel-open";
    const POSTER_STORAGE_KEY = "agent-room-dashboard-poster";

    function setPanelOpen(open) {
      document.body.classList.toggle("panel-collapsed", !open);
      document.body.classList.toggle("panel-open-shell", open);
      sideToggle.textContent = open ? "Hide panel" : "Panel";
      sideToggle.setAttribute("aria-pressed", open ? "true" : "false");
      try {
        localStorage.setItem(PANEL_KEY, open ? "1" : "0");
      } catch {}
    }

    function loadPanelPreference() {
      let open = true;
      try {
        open = localStorage.getItem(PANEL_KEY) !== "0";
      } catch {}
      if (window.matchMedia("(max-width: 720px)").matches) open = false;
      setPanelOpen(open);
    }

    const navMap = {
      overview: "section-overview",
      tasks: "section-tasks",
      decisions: "section-decisions",
      alerts: "section-alerts",
      notifications: "section-notifications",
      projects: "section-projects",
      roadmap: "section-roadmap"
    };
    const notificationsStatus = document.getElementById("notifications-status");
    const notificationsAgents = document.getElementById("notifications-agents");
    const notificationsRecent = document.getElementById("notifications-recent");
    const composerRouteHint = document.getElementById("composer-route-hint");

    function setActiveNav(nav) {
      document.querySelectorAll("[data-nav]").forEach((button) => {
        button.classList.toggle("active", button.dataset.nav === nav);
      });
      Object.entries(navMap).forEach(([key, id]) => {
        const section = document.getElementById(id);
        if (!section) return;
        const active = key === nav;
        section.hidden = !active;
        if (active) section.open = true;
      });
      if (!document.body.classList.contains("panel-collapsed")) setPanelOpen(true);
    }

    function closeTaskInlineForms(scope) {
      scope.querySelectorAll(".task-inline-form").forEach((form) => form.remove());
    }

    function appendTaskInlineForm(parent, task, config) {
      closeTaskInlineForms(parent);
      const form = document.createElement("div");
      form.className = "task-inline-form";
      const input = document.createElement("textarea");
      input.rows = 2;
      input.placeholder = config.placeholder;
      input.value = config.value || "";
      const actions = document.createElement("div");
      actions.className = "task-inline-actions";
      const confirm = document.createElement("button");
      confirm.type = "button";
      confirm.textContent = config.confirmLabel;
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => form.remove());
      confirm.addEventListener("click", async () => {
        await config.onSubmit(input.value.trim());
        form.remove();
      });
      actions.append(confirm, cancel);
      form.append(input, actions);
      parent.append(form);
      input.focus();
    }

    function projectForWrite() {
      return lastSnapshot?.writeProject;
    }

    async function saveActiveProject(projectId) {
      await fetch("/api/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activeProject: projectId ?? null })
      });
      if (lastSnapshot?.config) {
        if (projectId) lastSnapshot.config.activeProject = projectId;
        else delete lastSnapshot.config.activeProject;
      }
    }

    function renderWorkspaceBanner(snapshot) {
      const writeProject = snapshot.writeProject;
      const workspace = snapshot.workspace;
      const viewing = snapshot.selectedProject;
      workspaceBanner.replaceChildren();
      workspaceBanner.hidden = false;

      if (workspace?.registered) {
        workspaceBanner.className = "workspace-banner ok";
        const text = document.createElement("div");
        const lead = document.createElement("div");
        const strong = document.createElement("strong");
        strong.textContent = "Working in:";
        lead.append(strong, " " + workspace.name + " (" + workspace.projectId + ")");
        text.append(lead);
        if (workspace.folderPath) {
          const path = document.createElement("div");
          path.className = "meta";
          path.textContent = workspace.folderPath;
          text.append(path);
        }
        const actions = document.createElement("div");
        actions.className = "workspace-actions";
        if (viewing !== workspace.projectId) {
          const viewBtn = document.createElement("button");
          viewBtn.type = "button";
          viewBtn.textContent = "View this project";
          viewBtn.addEventListener("click", () => {
            selectedProject = workspace.projectId;
            projectSelect.value = workspace.projectId;
            loadSnapshot();
          });
          actions.append(viewBtn);
        }
        const clearBtn = document.createElement("button");
        clearBtn.type = "button";
        clearBtn.textContent = "Clear workspace";
        clearBtn.addEventListener("click", async () => {
          await saveActiveProject(null);
          await loadSnapshot();
        });
        actions.append(clearBtn);
        workspaceBanner.append(text, actions);
        return;
      }

      if (writeProject && !workspace?.registered) {
        workspaceBanner.className = "workspace-banner ok";
        const text = document.createElement("div");
        const strong = document.createElement("strong");
        strong.textContent = "Working in:";
        text.append(strong, " " + writeProject + " ");
        const hint = document.createElement("span");
        hint.className = "meta";
        hint.textContent = "(tag only — register a folder in Projects to pin a workspace)";
        text.append(hint);
        workspaceBanner.append(text);
        return;
      }

      workspaceBanner.className = "workspace-banner warn";
      const text = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = "No workspace project.";
      text.append(strong, " Posts, tasks, and decisions from this dashboard will not get a project tag.");
      const actions = document.createElement("div");
      actions.className = "workspace-actions";
      if (viewing !== "all" && viewing !== "unsorted") {
        const setBtn = document.createElement("button");
        setBtn.type = "button";
        setBtn.textContent = "Use \\"" + viewing + "\\" as workspace";
        setBtn.addEventListener("click", async () => {
          await saveActiveProject(viewing);
          await loadSnapshot();
        });
        actions.append(setBtn);
      }
      workspaceBanner.append(text, actions);
    }

    function formatTimestamp(value) {
      if (!value) return "No timestamp";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      return date.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    }

    function formatRelativeTime(value) {
      if (!value) return "unknown age";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "unknown age";
      const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
      if (seconds < 60) return "just now";
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return minutes + "m ago";
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return hours + "h ago";
      const days = Math.floor(hours / 24);
      return days + "d ago";
    }

    function toDateInputValue(date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return year + "-" + month + "-" + day;
    }

    function startOfWeek(date) {
      const start = new Date(date);
      const day = start.getDay();
      const daysSinceMonday = day === 0 ? 6 : day - 1;
      start.setDate(start.getDate() - daysSinceMonday);
      return start;
    }

    function syncFilterInputs() {
      searchInput.value = searchQuery;
      filterAgentInput.value = filterAgent;
      filterSinceInput.value = filterSince;
      filterUntilInput.value = filterUntil;
    }

    function applyFilters(next) {
      searchQuery = next.search ?? searchQuery;
      filterAgent = next.agent ?? filterAgent;
      filterSince = next.since ?? filterSince;
      filterUntil = next.until ?? filterUntil;
      syncFilterInputs();
      loadSnapshot();
    }

    function readStoredPoster() {
      return localStorage.getItem(POSTER_STORAGE_KEY)?.trim() || "";
    }

    function applyPosterFields(name) {
      const trimmed = name.trim();
      if (!trimmed) return;
      currentUserInput.value = trimmed;
      composerUserInput.value = trimmed;
    }

    function savePosterName(value) {
      const trimmed = (value ?? composerUserInput.value).trim();
      if (!trimmed) return;
      // Per-browser only — never write poster identity to shared room config.
      localStorage.setItem(POSTER_STORAGE_KEY, trimmed);
      applyPosterFields(trimmed);
    }

    function currentUserIdentity() {
      return readStoredPoster() || composerUserInput.value.trim() || currentUserInput.value.trim() || "user";
    }

    function applyFilterPreset(preset) {
      const now = new Date();
      if (preset === "today") {
        applyFilters({ since: toDateInputValue(now), until: "" });
        return;
      }
      if (preset === "week") {
        applyFilters({ since: toDateInputValue(startOfWeek(now)), until: "" });
        return;
      }
      if (preset === "mine") {
        applyFilters({ agent: currentUserIdentity(), search: "", since: "", until: "" });
        return;
      }
      if (preset === "review") {
        applyFilters({ search: "review", agent: "", since: "", until: "" });
        return;
      }
      if (preset === "clear") {
        applyFilters({ search: "", agent: "", since: "", until: "" });
      }
    }

    function registeredAgentIds() {
      return (lastSnapshot?.agents || []).map((agent) => agent.id);
    }

    function resolveRoutePreset(route) {
      if (!route || route === "all") return route || "all";
      const ids = registeredAgentIds();
      if (route === "grok") {
        return ids.find((id) => id === "grok-cli") || ids.find((id) => id.startsWith("grok")) || route;
      }
      if (ids.includes(route)) return route;
      const aliases = {
        codex: "codex-desktop",
        claude: "claude-opus",
        cursor: "cursor",
        grok: "grok",
        antigravity: "antigravity"
      };
      const alias = aliases[route];
      if (alias && ids.includes(alias)) return alias;
      return route;
    }

    function applyRoutePreset(route) {
      if (!route) return;
      messageTo.value = resolveRoutePreset(route);
      updateMessageSubmitLabel();
    }

    function routeLabel(route) {
      const trimmed = (route || "all").trim();
      if (trimmed === "all") return "all agents";
      if (trimmed === "codex-desktop") return "Codex";
      if (trimmed === "claude-opus") return "Claude";
      if (trimmed === "grok" || trimmed === "grok-cli" || trimmed.startsWith("grok")) return "Grok";
      if (trimmed === "antigravity") return "Antigravity";
      return trimmed;
    }

    function previewMentionRoute(text) {
      const tokens = (text.match(/@([a-zA-Z][a-zA-Z0-9_-]*)/g) || []).map((token) => token.slice(1).toLowerCase());
      if (!tokens.length) return "";
      if (tokens.includes("all")) return "Routing @all to every registered agent";
      const ids = registeredAgentIds();
      const aliases = {
        codex: "codex-desktop",
        claude: "claude-opus",
        cursor: "cursor",
        grok: "grok",
        antigravity: "antigravity"
      };
      const resolved = [...new Set(tokens.map((token) => {
        if (token === "grok") {
          return ids.find((id) => id === "grok-cli") || ids.find((id) => id.startsWith("grok")) || aliases.grok;
        }
        const alias = aliases[token];
        if (alias && ids.includes(alias)) return alias;
        return ids.find((id) => id.toLowerCase() === token) || alias || token;
      }))];
      if (resolved.length === 1) return "Routing to " + routeLabel(resolved[0]);
      return "Routing to " + resolved.map((id) => routeLabel(id)).join(", ");
    }

    function updateMessageSubmitLabel() {
      const mentionHint = previewMentionRoute(messageInput.value);
      if (mentionHint) {
        messageSubmit.textContent = "Send mention";
        if (composerRouteHint) composerRouteHint.textContent = mentionHint + " · Enter to send";
        return;
      }
      messageSubmit.textContent = "Tell " + routeLabel(messageTo.value);
      if (composerRouteHint) {
        composerRouteHint.textContent = "Enter to send · Shift+Enter for a new line · @mentions route alerts";
      }
    }

    function renderNotifications(status) {
      if (!status || !notificationsStatus) return;
      notificationsStatus.replaceChildren(
        card(
          "agent",
          status.running ? "Room notifier running" : "Room notifier stopped",
          (status.enabled ? "Enabled" : "Disabled") +
            " · every " +
            Math.round(status.intervalMs / 1000) +
            "s · watching " +
            status.agentCount +
            " registered agent" +
            (status.agentCount === 1 ? "" : "s") +
            (status.lastTickAt ? "\\nLast tick " + formatRelativeTime(status.lastTickAt) : "") +
            (status.lastError ? "\\nError: " + status.lastError : "")
        )
      );

      if (notificationsAgents) {
        if (!status.agents?.length) {
          setEmpty(
            notificationsAgents,
            "No registered agents",
            "Agents appear here after register_agent. Only joined agents receive room alerts."
          );
        } else {
          notificationsAgents.replaceChildren(
            ...status.agents.map((agent) =>
              card(
                "task",
                (agent.displayName || agent.agent) +
                  " · " +
                  agent.unread +
                  " unread" +
                  (agent.lastPingAt ? " · pinged " + formatRelativeTime(agent.lastPingAt) : ""),
                (agent.lastError ? "Last error: " + agent.lastError + "\\n" : "") +
                  "Inbox: " +
                  agent.inboxPath
              )
            )
          );
        }
      }

      if (notificationsRecent) {
        const recent = status.recent || [];
        if (!recent.length) {
          setEmpty(notificationsRecent, "No deliveries yet", "New routed messages trigger toast + inbox alerts for each agent.");
        } else {
          notificationsRecent.replaceChildren(
            ...recent
              .slice()
              .reverse()
              .slice(0, 8)
              .map((entry) =>
                card(
                  "decision",
                  formatTimestamp(entry.at) + " · " + entry.agent + " · " + entry.messageIds.join(", "),
                  (entry.error ? "Error: " + entry.error + "\\n" : "") + entry.text
                )
              )
          );
        }
      }
    }

    async function loadNotifications() {
      try {
        const response = await fetch("/api/notifications");
        if (!response.ok) return;
        renderNotifications(await response.json());
      } catch {}
    }

    function setComposerAdvancedOpen(open) {
      const composerToggle = document.getElementById("composer-toggle");
      const composerAdvanced = document.getElementById("composer-advanced");
      composerAdvanced?.classList.toggle("is-open", open);
      if (composerToggle) composerToggle.textContent = open ? "Fewer options" : "More options";
    }

    function applyMessageTemplate(template) {
      const templates = {
        assign: {
          status: "planning",
          next: "Assigned agent should confirm scope, then either implement or name the blocker.",
          body: "Please take this next:\\n\\nContext:\\n- \\n\\nAcceptance:\\n- "
        },
        review: {
          status: "reviewing",
          next: "Reviewer should post findings with file/commit references, or say clean.",
          body: "Please review this work:\\n\\nScope:\\n- \\n\\nEvidence:\\n- "
        },
        status: {
          status: "reviewing",
          next: "Reply with current status, what changed, and the next concrete action.",
          body: "Status check:\\n\\nWhat is done?\\nWhat is blocked?\\nWhat should happen next?"
        },
        blocked: {
          status: "blocked",
          next: "Name the smallest decision or missing input needed to unblock.",
          body: "Blocked on:\\n\\nImpact:\\n\\nNeed:"
        }
      };
      const next = templates[template];
      if (!next) return;
      setComposerAdvancedOpen(true);
      messageStatus.value = next.status;
      if (!messageNext.value.trim()) messageNext.value = next.next;
      if (!messageInput.value.trim()) {
        messageInput.value = next.body;
        messageInput.focus();
        messageInput.setSelectionRange(messageInput.value.length, messageInput.value.length);
      }
    }

    function setEmpty(container, title, hint) {
      container.replaceChildren();
      const item = document.createElement("div");
      item.className = "empty";
      const heading = document.createElement("strong");
      heading.textContent = title;
      const detail = document.createElement("span");
      detail.textContent = hint || "";
      item.append(heading);
      if (hint) item.append(detail);
      container.appendChild(item);
    }

    function card(className, metaText, bodyText) {
      const item = document.createElement("div");
      item.className = className;
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = metaText;
      const body = document.createElement("div");
      body.className = "body";
      body.textContent = bodyText;
      item.append(meta, body);
      return item;
    }

    function appendExpandableBody(parent, text, limit = 1200, expandKey) {
      const body = document.createElement("div");
      body.className = "body";
      body.textContent = text;
      parent.append(body);
      if (text.length <= limit) return body;

      const startExpanded = expandKey != null && expandedBodies.has(expandKey);
      if (!startExpanded) body.classList.add("is-clamped");
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "inline-toggle";
      toggle.textContent = startExpanded ? "Collapse" : "Show full";
      toggle.addEventListener("click", () => {
        const clamped = body.classList.toggle("is-clamped");
        toggle.textContent = clamped ? "Show full" : "Collapse";
        if (expandKey != null) {
          if (clamped) expandedBodies.delete(expandKey);
          else expandedBodies.add(expandKey);
        }
      });
      parent.append(toggle);
      return body;
    }

    function appendMoreNotice(container, hiddenCount, label) {
      if (hiddenCount <= 0) return;
      const more = document.createElement("div");
      more.className = "more-inline";
      more.textContent = "+" + hiddenCount + " more " + label + " in this view";
      container.append(more);
    }

    function replaceWithLimitedCards(container, items, renderCard, limit, label) {
      const visible = items.slice(0, limit);
      container.replaceChildren(...visible.map(renderCard));
      appendMoreNotice(container, items.length - visible.length, label);
    }

    function formatTaskNote(note) {
      let line = "- " + formatTimestamp(note.at) + " · " + formatRelativeTime(note.at) + " · " + note.by + ": " + note.body;
      if (note.branch || note.commit) {
        const links = [];
        if (note.branch) links.push("branch " + note.branch);
        if (note.commit) links.push("commit " + note.commit);
        line += "\\n  " + links.join(" · ");
      }
      return line;
    }

    async function postTaskUpdate(payload) {
      await fetch("/api/tasks/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, by: "user" })
      });
      await loadSnapshot();
    }

    async function postTaskNote(payload) {
      await fetch("/api/tasks/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, by: "user" })
      });
      await loadSnapshot();
    }

    function taskCard(task) {
      const item = document.createElement("div");
      item.className = "task";
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = task.id + " · " + formatTimestamp(task.updatedAt) + " · " + formatRelativeTime(task.updatedAt) + " · " + task.status + (task.owner ? " · " + task.owner : "");
      const actions = document.createElement("div");
      actions.className = "task-actions";

      // U4: change status directly on the card. Replaces the old separate
      // "type the task id into a form" flow.
      const statusSelect = document.createElement("select");
      statusSelect.className = "task-status-select";
      statusSelect.title = "Change status";
      for (const value of ["open", "claimed", "blocked", "done"]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value.charAt(0).toUpperCase() + value.slice(1);
        if (value === task.status) option.selected = true;
        statusSelect.append(option);
      }
      statusSelect.addEventListener("change", async () => {
        await postTaskUpdate({ taskId: task.id, status: statusSelect.value });
      });

      const noteButton = document.createElement("button");
      noteButton.type = "button";
      noteButton.textContent = "Note";
      noteButton.addEventListener("click", () => {
        const form = document.createElement("div");
        form.className = "task-inline-form";
        const bodyInput = document.createElement("textarea");
        bodyInput.rows = 2;
        bodyInput.placeholder = "Task note";
        const branchInput = document.createElement("input");
        branchInput.placeholder = "Branch (optional)";
        const commitInput = document.createElement("input");
        commitInput.placeholder = "Commit (optional)";
        const actionRow = document.createElement("div");
        actionRow.className = "task-inline-actions";
        const confirm = document.createElement("button");
        confirm.type = "button";
        confirm.textContent = "Add note";
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.textContent = "Cancel";
        cancel.addEventListener("click", () => form.remove());
        confirm.addEventListener("click", async () => {
          if (!bodyInput.value.trim()) return;
          await postTaskNote({
            taskId: task.id,
            body: bodyInput.value.trim(),
            branch: branchInput.value.trim() || undefined,
            commit: commitInput.value.trim() || undefined
          });
          form.remove();
        });
        actionRow.append(confirm, cancel);
        form.append(bodyInput, branchInput, commitInput, actionRow);
        closeTaskInlineForms(item);
        item.append(form);
        bodyInput.focus();
      });

      const reassignButton = document.createElement("button");
      reassignButton.type = "button";
      reassignButton.textContent = "Reassign";
      reassignButton.addEventListener("click", () => {
        appendTaskInlineForm(item, task, {
          placeholder: "New owner",
          value: task.owner || "",
          confirmLabel: "Reassign",
          onSubmit: async (owner) => {
            if (!owner) return;
            await postTaskUpdate({ taskId: task.id, status: task.status, owner });
          }
        });
      });

      actions.append(statusSelect, noteButton, reassignButton);
      item.append(meta);
      appendExpandableBody(
        item,
        task.title + (task.body ? "\\n" + task.body : "") + (task.notes?.length ? "\\n\\nNotes:\\n" + task.notes.map(formatTaskNote).join("\\n") : ""),
        900,
        "task:" + task.id
      );
      appendAttachmentLinks(item, task.attachments);
      appendAttachmentLinks(item, collectNoteAttachments(task));
      item.append(actions);
      return item;
    }

    function renderSelect(snapshot) {
      const records = snapshot.projectRecords || [];
      const registeredIds = new Set(records.map((project) => project.id));
      const tagIds = (snapshot.projects || []).filter(
        (id) => id !== "unsorted" && !registeredIds.has(id)
      );
      projectSelect.replaceChildren();

      function addGroup(label, entries) {
        if (!entries.length) return;
        const group = document.createElement("optgroup");
        group.label = label;
        group.append(...entries);
        projectSelect.append(group);
      }

      addGroup(
        "Registered workspaces",
        records.map((project) => {
          const option = document.createElement("option");
          option.value = project.id;
          option.textContent = project.name + " · " + project.id;
          option.selected = project.id === selectedProject;
          return option;
        })
      );
      addGroup(
        "Tags in room history",
        tagIds.map((id) => {
          const option = document.createElement("option");
          option.value = id;
          option.textContent = id;
          option.selected = id === selectedProject;
          return option;
        })
      );
      addGroup("Views", [
        ...["all", "unsorted"].map((id) => {
          const option = document.createElement("option");
          option.value = id;
          option.textContent = id === "all" ? "All projects" : "Unsorted only";
          option.selected = id === selectedProject;
          return option;
        })
      ]);
    }

    function humanizeProgressNote(item) {
      if (!item.roomStatus || item.roomStatus === item.fileStatus) return item.evidence || "";
      const labels = { done: "complete", partial: "in progress", todo: "not started" };
      const doc = labels[item.fileStatus] || item.fileStatus;
      const room = labels[item.roomStatus] || item.roomStatus;
      return (item.evidence || "") + " (docs " + doc + ", room " + room + ")";
    }

    function renderProgress(progress) {
      if (!progress) return;
      const driven = progress.roomDriven ? " · live room data" : "";
      progressSummary.textContent =
        progress.done + " done · " + progress.remaining + " left · " + progress.percent + "%" + driven;
      progressBar.style.width = progress.percent + "%";
      headerProgress.hidden = false;
      headerProgress.textContent = progress.percent + "% · " + progress.remaining + " left";
      roadmapBadge.textContent = progress.percent + "%";
      progressItems.replaceChildren(...(progress.items || []).map((item) => {
        const li = document.createElement("li");
        li.className = "progress-item";
        const row = document.createElement("div");
        row.className = "header-row";
        const title = document.createElement("span");
        title.className = "title";
        title.textContent = item.title;
        const pill = document.createElement("span");
        pill.className = "pill " + (item.status || "todo");
        pill.textContent = item.status || "todo";
        row.append(title, pill);
        const evidence = document.createElement("div");
        evidence.className = "meta";
        evidence.textContent = humanizeProgressNote(item);
        li.append(row, evidence);
        return li;
      }));
    }

    function renderStatus(status, agentList) {
      if (!status) return;
      const unreadTotal = Object.values(status.unread || {}).reduce((total, count) => total + Number(count || 0), 0);
      const registered = agentList?.length ?? status.agents;
      roomStatus.replaceChildren(
        card(
          "agent",
          status.messages + " messages · " + status.decisions + " decisions",
          registered +
            " agents registered\\nTasks: " +
            status.tasks.open +
            " open · " +
            status.tasks.claimed +
            " claimed · " +
            status.tasks.blocked +
            " blocked · " +
            status.tasks.done +
            " done\\nUnread: " +
            unreadTotal
        )
      );
    }

    function selectedProjectRecord() {
      return lastSnapshot?.projectRecords?.find((project) => project.id === selectedProject);
    }

    function formatBytes(size) {
      if (!size) return "";
      if (size < 1024) return size + " B";
      if (size < 1024 * 1024) return Math.round(size / 1024) + " KB";
      return (size / (1024 * 1024)).toFixed(1) + " MB";
    }

    function appendAttachmentLinks(parent, attachments) {
      if (!attachments?.length) return;
      const list = document.createElement("div");
      list.className = "attachment-list";
      list.replaceChildren(...attachments.map((attachment) => {
        const link = document.createElement("a");
        link.href = attachment.kind === "file" ? attachment.url : attachment.url;
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = attachment.name + (attachment.size ? " · " + formatBytes(attachment.size) : "");
        return link;
      }));
      parent.append(list);
    }

    function collectNoteAttachments(task) {
      return (task.notes || []).flatMap((note) => note.attachments || []);
    }

    function renderPendingAttachments() {
      messageAttachmentsPending.replaceChildren();
      if (!pendingAttachmentIds.length) {
        messageAttachmentsPending.hidden = true;
        return;
      }
      messageAttachmentsPending.hidden = false;
      pendingAttachmentIds.forEach((id) => {
        const chip = document.createElement("span");
        chip.textContent = id + " ";
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "×";
        remove.addEventListener("click", () => {
          pendingAttachmentIds = pendingAttachmentIds.filter((entry) => entry !== id);
          renderPendingAttachments();
        });
        chip.append(remove);
        messageAttachmentsPending.append(chip);
      });
    }

    async function fileToBase64(file) {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const text = String(dataUrl);
      const comma = text.indexOf(",");
      return comma >= 0 ? text.slice(comma + 1) : text;
    }

    messageFiles.addEventListener("change", async () => {
      const files = [...(messageFiles.files || [])];
      messageFiles.value = "";
      for (const file of files) {
        const response = await fetch("/api/attachments", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            contentBase64: await fileToBase64(file)
          })
        });
        if (!response.ok) continue;
        const attachment = await response.json();
        pendingAttachmentIds.push(attachment.id);
      }
      renderPendingAttachments();
    });

    function fillProjectForm(project) {
      if (!project) return;
      projectId.value = project.id || "";
      projectName.value = project.name || "";
      projectFolder.value = project.folderPath || "";
      projectRepo.value = project.repoUrl || "";
      projectStatus.value = project.status || "";
    }

    function projectLabel(projectId) {
      if (!projectId) return "Unsorted";
      const record = lastSnapshot?.projectRecords?.find((project) => project.id === projectId);
      return record ? record.name + " · " + projectId : projectId;
    }

    // Deterministic per-agent hue so "who said what" is scannable at a glance.
    function agentHue(id) {
      const key = String(id || "");
      let hue = 0;
      for (let i = 0; i < key.length; i++) hue = (hue * 31 + key.charCodeAt(i)) % 360;
      return hue;
    }

    function agentInitials(id) {
      const key = String(id || "").replace(/[^a-zA-Z0-9]+/g, " ").trim();
      if (!key) return "··";
      const parts = key.split(/\\s+/);
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return key.slice(0, 2).toUpperCase();
    }

    function applyAgentColors(el, id) {
      const hue = agentHue(id);
      el.style.setProperty("--agent", "oklch(0.6 0.12 " + hue + ")");
      el.style.setProperty("--agent-ink", "oklch(0.8 0.1 " + hue + ")");
      el.style.setProperty("--agent-soft", "oklch(0.3 0.05 " + hue + ")");
      el.style.setProperty("--agent-line", "oklch(0.45 0.08 " + hue + ")");
    }

    function renderMessageCard(message, showProject) {
      const item = document.createElement("div");
      item.className = "message";
      applyAgentColors(item, message.from);

      const protocolMeta = [message.phase ? "phase " + message.phase : "", message.status ? "status " + message.status : ""]
        .filter(Boolean)
        .join(" · ");

      const head = document.createElement("div");
      head.className = "msg-head";

      const avatar = document.createElement("span");
      avatar.className = "agent-avatar";
      avatar.textContent = agentInitials(message.from);
      avatar.title = message.from;

      const author = document.createElement("span");
      author.className = "msg-author";
      author.textContent = message.from;

      const route = document.createElement("span");
      route.className = "msg-route";
      route.textContent = "→ " + message.to;

      const faintBits = [
        formatTimestamp(message.time),
        message.relativeTime || formatRelativeTime(message.time),
        showProject ? projectLabel(message.project) : "",
        message.topic,
        protocolMeta
      ].filter(Boolean).join(" · ");
      const faint = document.createElement("span");
      faint.className = "msg-meta-faint";
      faint.textContent = faintBits;

      head.append(avatar, author, route, faint);

      // U5: surface a protocol violation right on the card, not only in Alerts.
      if (nonCompliantMessageIds.has(message.id)) {
        const tag = document.createElement("span");
        tag.className = "protocol-tag";
        tag.textContent = "⚠ protocol";
        const warning = protocolWarningById.get(message.id);
        tag.title = warning ? warning.message : "Missing protocol fields ([STATUS:]/[NEXT:]).";
        head.append(tag);
      }

      const nextSuffix = message.next && !/\\[NEXT:/i.test(message.body) ? "\\n\\nNext: " + message.next : "";
      item.append(head);
      appendExpandableBody(item, message.body + nextSuffix, 1100, "msg:" + message.id);
      appendAttachmentLinks(item, message.attachments);
      const followUpHints = message.followUpHints || [];
      if (followUpHints.length) {
        const hints = document.createElement("div");
        hints.className = "follow-up";
        hints.replaceChildren(...followUpHints.map((hint) => {
          const chip = document.createElement("span");
          chip.title = hint.dueIso || hint.label;
          chip.textContent = hint.label + (hint.dueIso ? " · " + hint.dueIso : "");
          return chip;
        }));
        item.append(hints);
      }
      return item;
    }

    function feedSignature(messages) {
      return selectedProject + "|" + messages
        .map((m) => m.id + ":" + m.time + ":" + (m.body ? m.body.length : 0) + ":" + (m.status || "") + ":" + (m.phase || ""))
        .join(",");
    }

    function renderFeedMessages(messages) {
      // The 5s auto-refresh calls this on every poll. When nothing in the feed
      // changed (the common case), skip the rebuild entirely so scroll position
      // and expanded ("Show full") cards are left untouched.
      const signature = feedSignature(messages);
      if (signature === lastFeedSignature && feed.childElementCount > 0) return;
      // A real change rebuilds the feed; remember scroll so a new message
      // doesn't yank the viewport back to the top (expanded cards re-expand
      // from expandedBodies).
      const previousScroll = feed.scrollTop;
      lastFeedSignature = signature;

      feed.replaceChildren();
      if (!messages.length) {
        setEmpty(feed, "No messages yet", "Post below to reach all agents, or route to Codex or Claude.");
        return;
      }
      const newestFirst = [...messages].sort((a, b) => {
        const timeDelta = new Date(b.time).getTime() - new Date(a.time).getTime();
        // Numeric id tie-break (ids past 999,999 grow wider; a string compare
        // would mis-order them).
        return timeDelta || (Number.parseInt(b.id, 10) || 0) - (Number.parseInt(a.id, 10) || 0);
      });

      if (selectedProject !== "all") {
        feed.append(...newestFirst.map((message) => renderMessageCard(message, false)));
        feed.scrollTop = previousScroll;
        return;
      }

      const groups = new Map();
      for (const message of newestFirst) {
        const key = message.project || "unsorted";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(message);
      }

      for (const key of groups.keys()) {
        const groupMessages = groups.get(key) || [];
        const group = document.createElement("div");
        group.className = "feed-project-group";
        const head = document.createElement("div");
        head.className = "feed-project-head";
        const title = document.createElement("strong");
        title.textContent = projectLabel(key === "unsorted" ? "" : key);
        const count = document.createElement("span");
        count.textContent = groupMessages.length + " message" + (groupMessages.length === 1 ? "" : "s");
        const focusBtn = document.createElement("button");
        focusBtn.type = "button";
        focusBtn.textContent = "View only";
        focusBtn.addEventListener("click", async () => {
          selectedProject = key === "unsorted" ? "unsorted" : key;
          projectSelect.value = selectedProject;
          const record = lastSnapshot?.projectRecords?.find((project) => project.id === selectedProject);
          if (record) await saveActiveProject(record.id);
          await loadSnapshot();
        });
        head.append(title, count, focusBtn);
        group.append(head, ...groupMessages.map((message) => renderMessageCard(message, false)));
        feed.append(group);
      }
      feed.scrollTop = previousScroll;
    }

    let lastSnapshot;

    function renderSnapshot(snapshot) {
      lastSnapshot = snapshot;
      // Index protocol warnings by message id so the feed can tag offending
      // cards inline (must happen before renderFeedMessages below).
      protocolWarningById = new Map((snapshot.protocolWarnings || []).map((warning) => [warning.messageId, warning]));
      nonCompliantMessageIds = new Set(protocolWarningById.keys());
      renderSelect(snapshot);
      renderWorkspaceBanner(snapshot);
      renderProgress(snapshot.progress);
      renderStatus(snapshot.status, snapshot.agents);
      feedSummary.textContent = snapshot.messages.length
        ? snapshot.messages.length + " message" + (snapshot.messages.length === 1 ? "" : "s") + " in view"
        : "No messages in this filter";
      if (snapshot.roomTime) {
        roomClock.textContent = "Room time " + formatTimestamp(snapshot.roomTime.localIso);
        roomClock.title = snapshot.roomTime.timezone + " " + snapshot.roomTime.utcOffset;
      }
      if (snapshot.config?.staleTaskHours) staleThreshold.value = String(snapshot.config.staleTaskHours);
      const storedPoster = readStoredPoster();
      if (storedPoster) {
        applyPosterFields(storedPoster);
      } else if (snapshot.config?.currentUser) {
        applyPosterFields(snapshot.config.currentUser);
      }
      enforceProtocol.checked = Boolean(snapshot.config?.enforceProtocol);

      renderFeedMessages(snapshot.messages);

      agents.replaceChildren(...snapshot.agents.map((agent) =>
        card(
          "agent",
          agent.id,
          (agent.role || agent.displayName || "Registered agent") + " · updated " + formatTimestamp(agent.updatedAt) + " · " + formatRelativeTime(agent.updatedAt)
        )
      ));
      if (!snapshot.agents.length) {
        setEmpty(agents, "No agents checked in", "Agents appear after register_agent and check_in from an MCP client.");
      }

      replaceWithLimitedCards(
        protocolWarnings,
        snapshot.protocolWarnings || [],
        (warning) =>
          card(
            "task",
            warning.messageId + " · " + warning.from + " → " + warning.to + " · " + warning.missing.join(", "),
            warning.message
          ),
        12,
        "protocol warnings"
      );
      if (!snapshot.protocolWarnings?.length) {
        setEmpty(protocolWarnings, "Protocol clear", "Agent messages include status and next steps.");
      }

      function renderStaleStack(container, items, metaFn) {
        const label = container.previousElementSibling;
        if (!items.length) {
          container.replaceChildren();
          container.hidden = true;
          if (label?.tagName === "H3") label.hidden = true;
          return false;
        }
        container.hidden = false;
        if (label?.tagName === "H3") label.hidden = false;
        replaceWithLimitedCards(
          container,
          items,
          (warning) => card("task", metaFn(warning), warning.message),
          8,
          "stale items"
        );
        return true;
      }

      const hasStaleTasks = renderStaleStack(
        staleTasks,
        snapshot.staleTasks || [],
        (warning) =>
          warning.taskId + " · " + warning.status + " · " + warning.ageHours + "h" + (warning.owner ? " · " + warning.owner : "")
      );
      const hasStaleMessages = renderStaleStack(
        staleMessages,
        snapshot.staleMessages || [],
        (warning) => warning.id + " · message · " + warning.ageHours + "h · " + warning.title
      );
      const hasStaleDecisions = renderStaleStack(
        staleDecisions,
        snapshot.staleDecisions || [],
        (warning) => warning.id + " · decision · " + warning.ageHours + "h · " + warning.title
      );
      staleQuiet.hidden = hasStaleTasks || hasStaleMessages || hasStaleDecisions;

      const alertCount =
        (snapshot.protocolWarnings?.length || 0) +
        (snapshot.staleTasks?.length || 0) +
        (snapshot.staleMessages?.length || 0) +
        (snapshot.staleDecisions?.length || 0);
      const navAlertsCount = document.getElementById("nav-alerts-count");
      const navTasksCount = document.getElementById("nav-tasks-count");
      if (alertCount > 0) {
        alertsBadge.hidden = false;
        alertsBadge.textContent = String(alertCount);
        alertsBadge.classList.toggle("warn", alertCount > 0);
        if (navAlertsCount) {
          navAlertsCount.hidden = false;
          navAlertsCount.textContent = String(alertCount);
        }
      } else {
        alertsBadge.hidden = true;
        if (navAlertsCount) navAlertsCount.hidden = true;
      }

      const openTasks = (snapshot.tasks || []).filter((task) => task.status !== "done").length;
      tasksBadge.textContent = String(openTasks);
      if (navTasksCount) navTasksCount.textContent = String(openTasks);

      projectRecords.replaceChildren(...(snapshot.projectRecords || []).map((project) =>
        card("task", project.name + " · " + project.id, project.folderPath + (project.status ? "\\nStatus: " + project.status : ""))
      ));
      if (!snapshot.projectRecords?.length) {
        setEmpty(projectRecords, "No project folders", "Register a path so agents know where to work.");
      }

      tasks.replaceChildren(...snapshot.tasks.map((task) => taskCard(task)));
      if (!snapshot.tasks.length) {
        setEmpty(tasks, "No tasks", "Create one below or claim work from the room feed.");
      }

      decisions.replaceChildren(...snapshot.decisions.map((decision) => {
        const item = card("decision", formatTimestamp(decision.time) + " · " + formatRelativeTime(decision.time) + " · " + decision.title, decision.decision);
        appendAttachmentLinks(item, decision.attachments);
        return item;
      }));
      if (!snapshot.decisions.length) {
        setEmpty(decisions, "No decisions", "Record choices the room should remember.");
      }
    }

    async function loadSnapshot() {
      const params = new URLSearchParams({ project: selectedProject });
      if (searchQuery) params.set("q", searchQuery);
      if (filterAgent) params.set("actor", filterAgent);
      if (filterSince) params.set("since", filterSince);
      if (filterUntil) params.set("until", filterUntil);
      const response = await fetch("/api/snapshot?" + params.toString());
      renderSnapshot(await response.json());
    }

    projectSelect.addEventListener("change", async () => {
      selectedProject = projectSelect.value;
      const record = lastSnapshot?.projectRecords?.find((project) => project.id === selectedProject);
      if (record) await saveActiveProject(record.id);
      await loadSnapshot();
    });

    refreshButton.addEventListener("click", loadSnapshot);

    function togglePanel() {
      setPanelOpen(document.body.classList.contains("panel-collapsed"));
    }

    sideToggle.addEventListener("click", togglePanel);
    sideToggleInline.addEventListener("click", () => setPanelOpen(false));
    panelOpen.addEventListener("click", () => setPanelOpen(true));
    headerProgress.addEventListener("click", () => {
      setActiveNav("roadmap");
      sectionRoadmap.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    loadPanelPreference();
    setActiveNav("overview");

    const filterDrawer = document.getElementById("filter-drawer");
    const filterDrawerOpen = document.getElementById("filter-drawer-open");
    const filterDrawerClose = document.getElementById("filter-drawer-close");
    const composerToggle = document.getElementById("composer-toggle");
    const composerAdvanced = document.getElementById("composer-advanced");

    filterDrawerOpen?.addEventListener("click", () => filterDrawer?.showModal());
    filterDrawerClose?.addEventListener("click", () => filterDrawer?.close());
    filterDrawer?.addEventListener("click", (event) => {
      if (event.target === filterDrawer) filterDrawer.close();
    });

    composerToggle?.addEventListener("click", () => {
      setComposerAdvancedOpen(!composerAdvanced?.classList.contains("is-open"));
    });

    document.querySelectorAll("[data-nav]").forEach((button) => {
      button.addEventListener("click", () => setActiveNav(button.dataset.nav));
    });

    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value.trim();
      loadSnapshot();
    });

    currentUserInput.addEventListener("change", () => {
      savePosterName(currentUserInput.value);
      loadSnapshot();
    });

    composerUserInput.addEventListener("change", () => {
      savePosterName(composerUserInput.value);
    });

    filterAgentInput.addEventListener("input", () => {
      filterAgent = filterAgentInput.value.trim();
      loadSnapshot();
    });

    filterSinceInput.addEventListener("change", () => {
      filterSince = filterSinceInput.value;
      loadSnapshot();
    });

    filterUntilInput.addEventListener("change", () => {
      filterUntil = filterUntilInput.value;
      loadSnapshot();
    });

    document.querySelectorAll("[data-filter-preset]").forEach((button) => {
      button.addEventListener("click", () => {
        applyFilterPreset(button.dataset.filterPreset);
      });
    });

    document.querySelectorAll("[data-route-preset]").forEach((button) => {
      button.addEventListener("click", () => {
        applyRoutePreset(button.dataset.routePreset);
      });
    });

    document.querySelectorAll("[data-message-template]").forEach((button) => {
      button.addEventListener("click", () => {
        applyMessageTemplate(button.dataset.messageTemplate);
      });
    });

    document.querySelectorAll("[data-task-owner]").forEach((button) => {
      button.addEventListener("click", () => {
        taskOwner.value = button.dataset.taskOwner || "";
      });
    });

    messageTo.addEventListener("input", updateMessageSubmitLabel);
    messageInput.addEventListener("input", updateMessageSubmitLabel);

    staleThresholdForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const staleTaskHours = Number(staleThreshold.value);
      if (!Number.isInteger(staleTaskHours) || staleTaskHours <= 0) return;
      await fetch("/api/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ staleTaskHours, enforceProtocol: enforceProtocol.checked })
      });
      await loadSnapshot();
    });

    async function submitMessage() {
      const body = messageInput.value.trim();
      const to = messageTo.value.trim() || "all";
      if (!body) return;
      const from = currentUserIdentity();
      const status = messageStatus.value.trim();
      const phase = messagePhase.value.trim();
      const next = messageNext.value.trim();
      const attachmentIds = pendingAttachmentIds.length ? pendingAttachmentIds.slice() : undefined;

      // Clear the composer immediately so Enter feels instant — the network
      // round-trip below happens after the UI has already reset. Restore the
      // text only if the post actually fails.
      messageInput.value = "";
      messageStatus.value = "";
      messagePhase.value = "";
      messageNext.value = "";
      pendingAttachmentIds = [];
      renderPendingAttachments();

      try {
        const response = await fetch("/api/messages", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            from,
            body,
            to,
            project: projectForWrite(),
            status: status || undefined,
            phase: phase || undefined,
            next: next || undefined,
            attachmentIds
          })
        });
        if (!response.ok) throw new Error("post failed: " + response.status);
      } catch (error) {
        messageInput.value = body;
        return;
      }
      await loadSnapshot();
      // Feed is newest-first, so scrolling to the top reveals the message that
      // was just sent without the user hunting for it.
      feed.scrollTop = 0;
    }

    messageForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await submitMessage();
    });

    messageInput.addEventListener("keydown", (event) => {
      if (event.isComposing || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
      const isEnter = event.key === "Enter" || event.code === "Enter" || event.code === "NumpadEnter";
      if (!isEnter) return;
      event.preventDefault();
      event.stopPropagation();
      void submitMessage();
    });

    projectForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const id = projectId.value.trim();
      const name = projectName.value.trim();
      const folderPath = projectFolder.value.trim();
      const repoUrl = projectRepo.value.trim();
      const status = projectStatus.value.trim();
      if (!id || !name || !folderPath) return;
      await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, name, folderPath, repoUrl: repoUrl || undefined, status: status || undefined })
      });
      selectedProject = id;
      await saveActiveProject(id);
      projectId.value = "";
      projectName.value = "";
      projectFolder.value = "";
      projectRepo.value = "";
      projectStatus.value = "";
      await loadSnapshot();
    });

    projectLoad.addEventListener("click", () => {
      fillProjectForm(selectedProjectRecord());
    });

    projectDelete.addEventListener("click", async () => {
      const id = projectId.value.trim() || selectedProjectRecord()?.id;
      if (!id) return;
      if (!window.confirm("Delete this registered project folder? Room history tagged with this project stays intact.")) return;
      await fetch("/api/projects/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id })
      });
      if (selectedProject === id) selectedProject = "all";
      projectId.value = "";
      projectName.value = "";
      projectFolder.value = "";
      projectRepo.value = "";
      projectStatus.value = "";
      await loadSnapshot();
    });

    projectBrowse.addEventListener("click", async () => {
      if (!window.showDirectoryPicker) return;
      const directory = await window.showDirectoryPicker();
      projectFolder.value = directory.name;
    });

    taskForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const title = taskTitle.value.trim();
      const body = taskBody.value.trim();
      const owner = taskOwner.value.trim();
      if (!title || !body) return;
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, body, owner: owner || undefined, project: projectForWrite() })
      });
      taskTitle.value = "";
      taskBody.value = "";
      taskOwner.value = "";
      await loadSnapshot();
    });

    decisionForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const title = decisionTitle.value.trim();
      const decision = decisionBody.value.trim();
      const rationale = decisionRationale.value.trim();
      if (!title || !decision || !rationale) return;
      await fetch("/api/decisions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, decision, rationale, project: projectForWrite() })
      });
      decisionTitle.value = "";
      decisionBody.value = "";
      decisionRationale.value = "";
      await loadSnapshot();
    });

    loadSnapshot();
    loadNotifications();
    updateMessageSubmitLabel();
    setInterval(loadSnapshot, 5000);
    setInterval(loadNotifications, 5000);
    window.matchMedia("(max-width: 720px)").addEventListener("change", (event) => {
      if (event.matches) setPanelOpen(false);
    });
  </script>
</body>
</html>`;
