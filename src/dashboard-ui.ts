export const dashboardHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Agent Room</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    :root {
      color-scheme: light;
      --bg: #f4f5f2;
      --panel: #ffffff;
      --ink: #141816;
      --muted: #5c6460;
      --line: #d5dbd6;
      --soft: #ecefe9;
      --accent: #0f766e;
      --accent-dark: #0b5c56;
      --warn: #b45309;
      --warn-soft: #fff7ed;
      --done: #166534;
      --partial: #a16207;
      --todo: #64748b;
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "IBM Plex Sans", system-ui, sans-serif;
      background: var(--bg);
      color: var(--ink);
      line-height: 1.45;
    }
    header {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 14px 18px;
      align-items: end;
      padding: 16px 20px;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
      position: sticky;
      top: 0;
      z-index: 2;
    }
    .brand { display: grid; gap: 2px; align-self: center; }
    .brand strong { font-size: 20px; letter-spacing: -0.02em; }
    .brand span { font-size: 12px; color: var(--muted); font-family: "IBM Plex Mono", monospace; }
    .toolbar { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
    .toolbar-actions { display: flex; gap: 8px; align-items: end; justify-content: flex-end; flex-wrap: wrap; }
    label { display: grid; gap: 4px; font-size: 12px; font-weight: 500; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
    main.layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(300px, 380px);
      gap: 18px;
      padding: 18px;
      max-width: 1440px;
      margin: 0 auto;
      align-items: start;
    }
    body.panel-collapsed main.layout { grid-template-columns: minmax(0, 1fr); }
    section, aside.panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 10px;
      box-shadow: 0 1px 0 rgba(20, 24, 22, 0.04);
    }
    section { padding: 16px; }
    aside.panel {
      padding: 0;
      position: sticky;
      top: 88px;
      max-height: calc(100dvh - 104px);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    body.panel-collapsed aside.panel { display: none; }
    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--soft);
      background: #fafbf9;
    }
    .panel-head h2 { margin: 0; font-size: 13px; }
    .panel-scroll { overflow: auto; padding: 8px 10px 12px; display: grid; gap: 6px; }
    .panel-section {
      border: 1px solid var(--soft);
      border-radius: 8px;
      background: #fff;
      overflow: hidden;
    }
    .panel-section > summary {
      list-style: none;
      cursor: pointer;
      padding: 10px 12px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      user-select: none;
    }
    .panel-section > summary::-webkit-details-marker { display: none; }
    .panel-section > summary::after { content: "+"; font-family: "IBM Plex Mono", monospace; color: var(--accent); }
    .panel-section[open] > summary::after { content: "−"; }
    .panel-section[open] > summary { color: var(--ink); border-bottom: 1px solid var(--soft); }
    .panel-body { padding: 10px 12px 12px; display: grid; gap: 10px; }
    .panel-body .stack { gap: 8px; }
    .section-block h2 { margin: 0; font-size: 15px; font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase; color: var(--muted); }
    .main-feed { display: grid; gap: 14px; }
    details.feed-section > summary.section-block {
      margin-bottom: 12px;
      list-style: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    details.feed-section > summary.section-block::-webkit-details-marker { display: none; }
    .header-progress {
      font-family: "IBM Plex Mono", monospace;
      font-size: 11px;
      color: var(--muted);
      padding: 4px 8px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--soft);
      cursor: pointer;
      white-space: nowrap;
    }
    .header-progress:hover { border-color: var(--accent); color: var(--accent-dark); }
    .progress-compact { display: grid; gap: 6px; }
    .progress-compact .meta { margin: 0; }
    h3 { margin: 0 0 8px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
    .feed, .stack { display: grid; gap: 10px; }
    .message, .task, .decision, .agent, .empty, .progress-panel {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: #fff;
    }
    .empty {
      display: grid;
      gap: 2px;
      padding: 10px 12px;
      color: var(--muted);
      background: var(--soft);
      border: 1px dashed var(--line);
      border-radius: 8px;
      font-size: 13px;
    }
    .empty strong { color: var(--ink); font-weight: 500; font-style: normal; }
    .empty span { font-size: 12px; line-height: 1.35; }
    .empty-inline { font-size: 12px; color: var(--muted); padding: 4px 0; }
    .badge-count {
      font-size: 10px;
      font-weight: 600;
      padding: 1px 7px;
      border-radius: 999px;
      background: #ecfdf5;
      color: var(--accent-dark);
      border: 1px solid #99f6e4;
      font-family: "IBM Plex Mono", monospace;
    }
    .badge-count.warn { background: var(--warn-soft); color: var(--warn); border-color: #fed7aa; }
    #side-toggle, #panel-open {
      border-color: var(--line);
      background: #fff;
      color: var(--ink);
      font-size: 12px;
      padding: 7px 10px;
    }
    #panel-open { display: none; position: fixed; right: 16px; bottom: 16px; z-index: 3; box-shadow: 0 4px 16px rgba(20, 24, 22, 0.12); }
    body.panel-collapsed #panel-open { display: inline-block; }
    .meta { color: var(--muted); font-size: 12px; margin-bottom: 6px; font-family: "IBM Plex Mono", monospace; }
    .body { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 14px; }
    .progress-track { height: 8px; border-radius: 999px; background: var(--soft); overflow: hidden; margin: 10px 0 14px; }
    .progress-bar { height: 100%; width: 0; background: linear-gradient(90deg, var(--accent), #14b8a6); transition: width 0.35s ease; }
    .progress-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
    .progress-item { display: grid; gap: 4px; padding: 8px 10px; border-radius: 6px; background: var(--soft); }
    .progress-item .header-row { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
    .progress-item .title { font-size: 13px; font-weight: 500; }
    .pill { font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); }
    .pill.done { color: var(--done); border-color: #86efac; background: #f0fdf4; }
    .pill.partial { color: var(--partial); border-color: #fcd34d; background: #fffbeb; }
    .pill.todo { color: var(--todo); border-color: #cbd5e1; background: #f8fafc; }
    .follow-up { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
    .follow-up span { font-size: 11px; padding: 3px 8px; border-radius: 999px; background: #ecfdf5; color: var(--accent-dark); border: 1px solid #99f6e4; font-family: "IBM Plex Mono", monospace; }
    .stale-warn .message, .stale-warn .task { border-color: #fed7aa; background: var(--warn-soft); }
    .composer { display: grid; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--soft); }
    .filter-presets, .route-presets { display: flex; gap: 6px; flex-wrap: wrap; }
    textarea, input, select, button { font: inherit; }
    textarea, input, select {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 9px 10px;
      background: #fff;
      color: var(--ink);
    }
    textarea:focus, input:focus, select:focus { outline: 2px solid #99f6e4; outline-offset: 1px; border-color: var(--accent); }
    textarea { resize: vertical; min-height: 72px; }
    button {
      border: 1px solid var(--accent);
      background: var(--accent);
      color: #fff;
      border-radius: 8px;
      padding: 9px 12px;
      cursor: pointer;
      font-weight: 500;
      transition: transform 0.12s ease, background 0.12s ease;
    }
    button:active { transform: scale(0.98); }
    button:hover { background: var(--accent-dark); }
    .filter-presets button, .route-presets button, .task-actions button, #refresh, #side-toggle, #side-toggle-inline, #panel-open {
      border-color: var(--line);
      background: #fff;
      color: var(--ink);
    }
    .filter-presets button:hover, .route-presets button:hover, .task-actions button:hover, #refresh:hover, #side-toggle:hover, #side-toggle-inline:hover, #panel-open:hover {
      border-color: var(--accent);
      background: #ecfdf5;
      color: var(--accent-dark);
    }
    .task-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
    .task-actions button { font-size: 12px; padding: 5px 9px; }
    #refresh { width: 42px; height: 42px; padding: 0; font-size: 18px; }
    #room-clock { font-family: "IBM Plex Mono", monospace; font-size: 12px; color: var(--muted); white-space: nowrap; }
    .workspace-banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: var(--soft);
      font-size: 13px;
    }
    .workspace-banner.warn { border-color: #fed7aa; background: var(--warn-soft); color: #7c2d12; }
    .workspace-banner.ok { border-color: #99f6e4; background: #ecfdf5; color: var(--accent-dark); }
    .workspace-banner strong { font-weight: 600; }
    .workspace-banner button { font-size: 12px; padding: 5px 9px; }
    .workspace-actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .attachment-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .attachment-list a {
      font-size: 12px;
      padding: 4px 8px;
      border-radius: 6px;
      border: 1px solid var(--line);
      background: var(--soft);
      color: var(--accent-dark);
      text-decoration: none;
    }
    .attachment-pending { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; font-size: 12px; color: var(--muted); }
    .attachment-pending button { font-size: 11px; padding: 2px 6px; }
    @media (max-width: 960px) {
      header { grid-template-columns: 1fr; }
      .toolbar-actions { justify-content: flex-start; }
      main.layout { grid-template-columns: 1fr; }
      aside.panel { position: static; max-height: none; }
      body.panel-collapsed aside.panel { display: flex; }
      body.panel-collapsed #panel-open { display: none; }
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <strong>Agent Room</strong>
      <span>Control room</span>
    </div>
    <div class="toolbar">
      <label>View <select id="project"></select></label>
      <label>Search <input id="search" placeholder="Messages, tasks, decisions" /></label>
      <label>You <input id="current-user" placeholder="user" title="Your room identity for the Mine filter" /></label>
      <label>Agent <input id="filter-agent" placeholder="codex, claude-opus" /></label>
      <label>Since <input id="filter-since" type="date" /></label>
      <label>Until <input id="filter-until" type="date" /></label>
    </div>
    <div class="toolbar-actions">
      <div class="filter-presets" aria-label="Filter presets">
        <button type="button" data-filter-preset="today">Today</button>
        <button type="button" data-filter-preset="week">Week</button>
        <button type="button" data-filter-preset="mine">Mine</button>
        <button type="button" data-filter-preset="review">Review</button>
        <button type="button" data-filter-preset="clear">Clear</button>
      </div>
      <button id="header-progress" type="button" class="header-progress" title="Jump to roadmap" hidden>0% roadmap</button>
      <button id="side-toggle" type="button" title="Toggle room panel">Panel</button>
      <button id="refresh" type="button" title="Refresh">↻</button>
      <span id="room-clock">Room time</span>
    </div>
  </header>
  <main class="layout">
    <section class="main-feed">
      <details class="feed-section" id="feed-section" open>
        <summary class="section-block"><h2>Room Feed</h2><span class="meta" id="feed-summary"></span></summary>
        <div id="feed" class="feed"></div>
        <div id="workspace-banner" class="workspace-banner warn" hidden></div>
        <form id="message-form" class="composer">
        <label>Route to <input id="message-to" value="all" /></label>
        <div class="route-presets" aria-label="Route presets">
          <button type="button" data-route-preset="all">To all</button>
          <button type="button" data-route-preset="codex-desktop">To Codex</button>
          <button type="button" data-route-preset="claude-opus">To Claude</button>
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
        <textarea id="message" rows="3" placeholder="Tell the room... or use the structured fields above"></textarea>
        <label>Attach files <input id="message-files" type="file" multiple accept="text/*,image/*,.pdf,.json,.zip" /></label>
        <div id="message-attachments-pending" class="attachment-pending" hidden></div>
        <button type="submit">Tell all agents</button>
        </form>
      </details>
    </section>
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
        <details class="panel-section" id="section-roadmap">
          <summary>Roadmap <span id="roadmap-badge" class="badge-count">0%</span></summary>
          <div class="panel-body progress-compact">
            <div id="progress-summary" class="meta">Loading progress...</div>
            <div class="progress-track" aria-label="Roadmap progress">
              <div id="progress-bar" class="progress-bar"></div>
            </div>
            <ul id="progress-items" class="progress-list"></ul>
          </div>
        </details>
        <details class="panel-section" id="section-alerts">
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
        <details class="panel-section" id="section-tasks">
          <summary>Tasks <span id="tasks-badge" class="badge-count">0</span></summary>
          <div class="panel-body">
            <div id="tasks" class="stack"></div>
            <form id="task-form" class="composer">
              <input id="task-title" placeholder="Task title" />
              <textarea id="task-body" rows="2" placeholder="Task details"></textarea>
              <input id="task-owner" placeholder="Owner (optional)" />
              <button type="submit">Create task</button>
            </form>
            <form id="task-update-form" class="composer">
              <input id="task-update-id" placeholder="Task id, e.g. task-000001" />
              <select id="task-update-status">
                <option value="open">Open</option>
                <option value="claimed">Claimed</option>
                <option value="blocked">Blocked</option>
                <option value="done">Done</option>
              </select>
              <input id="task-update-owner" placeholder="Owner (optional)" />
              <textarea id="task-update-note" rows="2" placeholder="Task note (optional)"></textarea>
              <input id="task-update-branch" placeholder="Branch (optional)" />
              <input id="task-update-commit" placeholder="Commit (optional)" />
              <button type="submit">Update task</button>
            </form>
          </div>
        </details>
        <details class="panel-section" id="section-projects">
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
        <details class="panel-section" id="section-decisions">
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
  </main>
  <button id="panel-open" type="button">Open panel</button>
  <script>
    let selectedProject = "all";
    let searchQuery = "";
    let filterAgent = "";
    let filterSince = "";
    let filterUntil = "";
    const projectSelect = document.getElementById("project");
    const workspaceBanner = document.getElementById("workspace-banner");
    const searchInput = document.getElementById("search");
    const currentUserInput = document.getElementById("current-user");
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
    const taskUpdateForm = document.getElementById("task-update-form");
    const taskUpdateId = document.getElementById("task-update-id");
    const taskUpdateStatus = document.getElementById("task-update-status");
    const taskUpdateOwner = document.getElementById("task-update-owner");
    const taskUpdateNote = document.getElementById("task-update-note");
    const taskUpdateBranch = document.getElementById("task-update-branch");
    const taskUpdateCommit = document.getElementById("task-update-commit");
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

    function setPanelOpen(open) {
      document.body.classList.toggle("panel-collapsed", !open);
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
      if (window.matchMedia("(max-width: 960px)").matches) open = true;
      setPanelOpen(open);
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
        setBtn.textContent = "Use \"" + viewing + "\" as workspace";
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

    function currentUserIdentity() {
      return currentUserInput.value.trim() || lastSnapshot?.config?.currentUser || "user";
    }

    async function saveCurrentUser() {
      const currentUser = currentUserInput.value.trim();
      if (!currentUser) return;
      await fetch("/api/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentUser })
      });
      if (lastSnapshot?.config) lastSnapshot.config.currentUser = currentUser;
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
        applyFilters({ actor: currentUserIdentity(), search: "", since: "", until: "" });
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

    function applyRoutePreset(route) {
      if (!route) return;
      messageTo.value = route;
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

    function fillTaskUpdateForm(task) {
      taskUpdateId.value = task.id;
      taskUpdateStatus.value = task.status;
      taskUpdateOwner.value = task.owner || "";
      taskUpdateNote.value = "";
      taskUpdateBranch.value = "";
      taskUpdateCommit.value = "";
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
      const body = document.createElement("div");
      body.className = "body";
      body.textContent = task.title + (task.body ? "\\n" + task.body : "") + (task.notes?.length ? "\\n\\nNotes:\\n" + task.notes.map(formatTaskNote).join("\\n") : "");
      const actions = document.createElement("div");
      actions.className = "task-actions";

      const doneButton = document.createElement("button");
      doneButton.type = "button";
      doneButton.textContent = "Done";
      doneButton.addEventListener("click", async () => {
        const note = window.prompt("Optional done note");
        if (note === null) return;
        await postTaskUpdate({ taskId: task.id, status: "done", note: note.trim() || undefined });
      });

      const blockedButton = document.createElement("button");
      blockedButton.type = "button";
      blockedButton.textContent = "Blocked";
      blockedButton.addEventListener("click", async () => {
        const note = window.prompt("Why is this blocked?");
        if (note === null) return;
        await postTaskUpdate({
          taskId: task.id,
          status: "blocked",
          note: note.trim() || "Blocked from dashboard."
        });
      });

      const noteButton = document.createElement("button");
      noteButton.type = "button";
      noteButton.textContent = "Note";
      noteButton.addEventListener("click", async () => {
        const bodyText = window.prompt("Task note");
        if (!bodyText?.trim()) return;
        const branch = window.prompt("Branch (optional)")?.trim();
        const commit = window.prompt("Commit (optional)")?.trim();
        await postTaskNote({
          taskId: task.id,
          body: bodyText.trim(),
          branch: branch || undefined,
          commit: commit || undefined
        });
      });

      const reassignButton = document.createElement("button");
      reassignButton.type = "button";
      reassignButton.textContent = "Reassign";
      reassignButton.addEventListener("click", async () => {
        const owner = window.prompt("New owner", task.owner || "");
        if (!owner?.trim()) return;
        await postTaskUpdate({ taskId: task.id, status: task.status, owner: owner.trim() });
      });

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.textContent = "Edit";
      editButton.addEventListener("click", () => fillTaskUpdateForm(task));

      actions.append(doneButton, blockedButton, noteButton, reassignButton, editButton);
      item.append(meta, body);
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

    let lastSnapshot;

    function renderSnapshot(snapshot) {
      lastSnapshot = snapshot;
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
      if (snapshot.config?.currentUser) currentUserInput.value = snapshot.config.currentUser;
      enforceProtocol.checked = Boolean(snapshot.config?.enforceProtocol);

      feed.replaceChildren(...snapshot.messages.map((message) => {
        const item = document.createElement("div");
        item.className = "message";
        const protocolMeta = [message.phase ? "phase " + message.phase : "", message.status ? "status " + message.status : ""]
          .filter(Boolean)
          .join(" · ");
        const meta = document.createElement("div");
        meta.className = "meta";
        meta.textContent =
          formatTimestamp(message.time) +
          " · " +
          (message.relativeTime || formatRelativeTime(message.time)) +
          " · " +
          message.from +
          " → " +
          message.to +
          " · " +
          message.topic +
          (protocolMeta ? " · " + protocolMeta : "");
        const body = document.createElement("div");
        body.className = "body";
        body.textContent = message.body + (message.next ? "\\n\\nNext: " + message.next : "");
        item.append(meta, body);
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
      }));
      if (!snapshot.messages.length) {
        setEmpty(feed, "No messages yet", "Post below to reach all agents, or route to Codex or Claude.");
      }

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

      protocolWarnings.replaceChildren(...(snapshot.protocolWarnings || []).map((warning) =>
        card(
          "task",
          warning.messageId + " · " + warning.from + " → " + warning.to + " · " + warning.missing.join(", "),
          warning.message
        )
      ));
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
        container.replaceChildren(...items.map((warning) => card("task", metaFn(warning), warning.message)));
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
      if (alertCount > 0) {
        alertsBadge.hidden = false;
        alertsBadge.textContent = String(alertCount);
        alertsBadge.classList.toggle("warn", alertCount > 0);
        sectionAlerts.open = true;
      } else {
        alertsBadge.hidden = true;
      }

      const openTasks = (snapshot.tasks || []).filter((task) => task.status !== "done").length;
      tasksBadge.textContent = String(openTasks);
      if (openTasks > 0) document.getElementById("section-tasks").open = true;

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
      setPanelOpen(true);
      sectionRoadmap.open = true;
      sectionRoadmap.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    loadPanelPreference();

    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value.trim();
      loadSnapshot();
    });

    currentUserInput.addEventListener("change", async () => {
      await saveCurrentUser();
      await loadSnapshot();
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

    messageForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const body = messageInput.value.trim();
      const to = messageTo.value.trim() || "all";
      if (!body) return;
      const status = messageStatus.value.trim();
      const phase = messagePhase.value.trim();
      const next = messageNext.value.trim();
      await fetch("/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body,
          to,
          project: projectForWrite(),
          status: status || undefined,
          phase: phase || undefined,
          next: next || undefined,
          attachmentIds: pendingAttachmentIds.length ? pendingAttachmentIds : undefined
        })
      });
      messageInput.value = "";
      messageStatus.value = "";
      messagePhase.value = "";
      messageNext.value = "";
      pendingAttachmentIds = [];
      renderPendingAttachments();
      await loadSnapshot();
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

    taskUpdateForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const taskId = taskUpdateId.value.trim();
      const status = taskUpdateStatus.value;
      const owner = taskUpdateOwner.value.trim();
      const note = taskUpdateNote.value.trim();
      const branch = taskUpdateBranch.value.trim();
      const commit = taskUpdateCommit.value.trim();
      if (!taskId) return;
      await postTaskUpdate({
        taskId,
        status,
        owner: owner || undefined,
        note: note || undefined,
        branch: branch || undefined,
        commit: commit || undefined
      });
      taskUpdateId.value = "";
      taskUpdateOwner.value = "";
      taskUpdateNote.value = "";
      taskUpdateBranch.value = "";
      taskUpdateCommit.value = "";
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
    setInterval(loadSnapshot, 5000);
    window.matchMedia("(max-width: 960px)").addEventListener("change", (event) => {
      if (event.matches) setPanelOpen(true);
    });
  </script>
</body>
</html>`;
