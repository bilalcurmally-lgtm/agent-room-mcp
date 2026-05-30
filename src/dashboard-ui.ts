export const dashboardHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Agent Room</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f6f1;
      --panel: #ffffff;
      --ink: #202124;
      --muted: #62645f;
      --line: #d9d9cf;
      --soft: #eeeeE7;
      --blue: #1d4ed8;
      --blue-dark: #173ea8;
    }

    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--ink); }
    header { display: flex; gap: 12px; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--line); background: var(--panel); position: sticky; top: 0; z-index: 2; }
    header strong { font-size: 18px; }
    label { display: grid; gap: 4px; font-size: 13px; color: var(--muted); }
    main { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 16px; padding: 16px; }
    section, aside { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 14px; }
    h2 { margin: 0 0 12px; font-size: 16px; }
    h3 { margin: 18px 0 10px; font-size: 14px; color: var(--muted); }
    .feed, .stack { display: grid; gap: 10px; }
    .message, .task, .decision, .agent, .empty { border: 1px solid var(--soft); border-radius: 6px; padding: 10px; background: #fff; }
    .meta { color: var(--muted); font-size: 12px; margin-bottom: 4px; }
    .body { white-space: pre-wrap; overflow-wrap: anywhere; }
    .composer { display: grid; gap: 8px; margin-top: 12px; }
    textarea, input, select, button { font: inherit; }
    textarea, input, select { width: 100%; border: 1px solid #c8c8c0; border-radius: 6px; padding: 8px; background: #fff; color: var(--ink); }
    textarea { resize: vertical; }
    button { border: 1px solid var(--blue); background: var(--blue); color: white; border-radius: 6px; padding: 8px 10px; cursor: pointer; }
    button:hover { background: var(--blue-dark); }
    #refresh { width: 40px; height: 40px; padding: 0; }
    .grid-form { display: grid; gap: 8px; }
    @media (max-width: 860px) {
      header { align-items: stretch; flex-wrap: wrap; }
      main { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <strong>Agent Room</strong>
    <label>Project <select id="project"></select></label>
    <label>Search room <input id="search" placeholder="Messages, tasks, decisions" /></label>
    <button id="refresh" type="button" title="Refresh">↻</button>
    <span id="room-clock" class="meta">Your local time</span>
  </header>
  <main>
    <section>
      <h2>Room Feed</h2>
      <div id="feed" class="feed"></div>
      <form id="message-form" class="composer">
        <label>Route to <input id="message-to" value="all" /></label>
        <textarea id="message" rows="3" placeholder="Tell the room... [STATUS: planning | implementing | reviewing | blocked] [NEXT: what should happen next]"></textarea>
        <button type="submit">Tell all agents</button>
      </form>
    </section>
    <aside>
      <h2>Agents</h2>
      <div id="agents" class="stack"></div>
      <h3>Tasks</h3>
      <div id="tasks" class="stack"></div>
      <h3>Projects</h3>
      <div id="project-records" class="stack"></div>
      <form id="project-form" class="composer">
        <input id="project-id" placeholder="Project id, e.g. audit-cockpit" />
        <input id="project-name" placeholder="Project name" />
        <input id="project-folder" placeholder="Project folder, e.g. D:\\projects\\audit-cockpit" />
        <input id="project-repo" placeholder="Repo URL (optional)" />
        <button type="submit">Add project folder</button>
      </form>
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
        <button type="submit">Update task</button>
      </form>
      <h3>Decisions</h3>
      <div id="decisions" class="stack"></div>
      <form id="decision-form" class="composer">
        <input id="decision-title" placeholder="Decision title" />
        <textarea id="decision-body" rows="2" placeholder="Decision"></textarea>
        <textarea id="decision-rationale" rows="2" placeholder="Rationale"></textarea>
        <button type="submit">Record decision</button>
      </form>
    </aside>
  </main>
  <script>
    let selectedProject = "all";
    let searchQuery = "";
    const projectSelect = document.getElementById("project");
    const searchInput = document.getElementById("search");
    const feed = document.getElementById("feed");
    const agents = document.getElementById("agents");
    const tasks = document.getElementById("tasks");
    const decisions = document.getElementById("decisions");
    const projectRecords = document.getElementById("project-records");
    const messageForm = document.getElementById("message-form");
    const messageInput = document.getElementById("message");
    const messageTo = document.getElementById("message-to");
    const projectForm = document.getElementById("project-form");
    const projectId = document.getElementById("project-id");
    const projectName = document.getElementById("project-name");
    const projectFolder = document.getElementById("project-folder");
    const projectRepo = document.getElementById("project-repo");
    const taskForm = document.getElementById("task-form");
    const taskTitle = document.getElementById("task-title");
    const taskBody = document.getElementById("task-body");
    const taskOwner = document.getElementById("task-owner");
    const taskUpdateForm = document.getElementById("task-update-form");
    const taskUpdateId = document.getElementById("task-update-id");
    const taskUpdateStatus = document.getElementById("task-update-status");
    const taskUpdateOwner = document.getElementById("task-update-owner");
    const taskUpdateNote = document.getElementById("task-update-note");
    const decisionForm = document.getElementById("decision-form");
    const decisionTitle = document.getElementById("decision-title");
    const decisionBody = document.getElementById("decision-body");
    const decisionRationale = document.getElementById("decision-rationale");
    const refreshButton = document.getElementById("refresh");
    const roomClock = document.getElementById("room-clock");

    function projectForWrite() {
      return selectedProject === "all" || selectedProject === "unsorted" ? undefined : selectedProject;
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

    function setEmpty(container, text) {
      container.replaceChildren();
      const item = document.createElement("div");
      item.className = "empty";
      item.textContent = text;
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

    function renderSelect(projects) {
      const options = [
        ["all", "All Projects"],
        ["unsorted", "Unsorted"],
        ...projects.filter((project) => project !== "unsorted").map((project) => [project, project])
      ];
      projectSelect.replaceChildren(...options.map(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        option.selected = value === selectedProject;
        return option;
      }));
    }

    function renderSnapshot(snapshot) {
      renderSelect(snapshot.projects || []);
      if (snapshot.roomTime) {
        roomClock.textContent = "Room time " + formatTimestamp(snapshot.roomTime.localIso);
        roomClock.title = snapshot.roomTime.timezone + " " + snapshot.roomTime.utcOffset;
      }

      feed.replaceChildren(...snapshot.messages.map((message) =>
        card(
          "message",
          formatTimestamp(message.time) + " · " + formatRelativeTime(message.time) + " · " + message.from + " → " + message.to + " · " + message.topic,
          message.body
        )
      ));
      if (!snapshot.messages.length) setEmpty(feed, "No messages yet.");

      agents.replaceChildren(...snapshot.agents.map((agent) =>
        card(
          "agent",
          agent.id,
          (agent.role || agent.displayName || "Registered agent") + " · updated " + formatTimestamp(agent.updatedAt) + " · " + formatRelativeTime(agent.updatedAt)
        )
      ));
      if (!snapshot.agents.length) setEmpty(agents, "No agents checked in yet.");

      projectRecords.replaceChildren(...(snapshot.projectRecords || []).map((project) =>
        card("task", project.name + " · " + project.id, project.folderPath)
      ));
      if (!snapshot.projectRecords?.length) setEmpty(projectRecords, "No project folders yet.");

      tasks.replaceChildren(...snapshot.tasks.map((task) =>
        card(
          "task",
          task.id + " · " + formatTimestamp(task.updatedAt) + " · " + formatRelativeTime(task.updatedAt) + " · " + task.status + (task.owner ? " · " + task.owner : ""),
          task.title + (task.notes?.length ? "\\n\\nNotes:\\n" + task.notes.map((note) =>
            "- " + formatTimestamp(note.at) + " · " + formatRelativeTime(note.at) + " · " + note.by + ": " + note.body
          ).join("\\n") : "")
        )
      ));
      if (!snapshot.tasks.length) setEmpty(tasks, "No tasks yet.");

      decisions.replaceChildren(...snapshot.decisions.map((decision) =>
        card("decision", formatTimestamp(decision.time) + " · " + formatRelativeTime(decision.time) + " · " + decision.title, decision.decision)
      ));
      if (!snapshot.decisions.length) setEmpty(decisions, "No decisions yet.");
    }

    async function loadSnapshot() {
      const params = new URLSearchParams({ project: selectedProject });
      if (searchQuery) params.set("q", searchQuery);
      const response = await fetch("/api/snapshot?" + params.toString());
      renderSnapshot(await response.json());
    }

    projectSelect.addEventListener("change", () => {
      selectedProject = projectSelect.value;
      loadSnapshot();
    });

    refreshButton.addEventListener("click", loadSnapshot);

    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value.trim();
      loadSnapshot();
    });

    messageForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const body = messageInput.value.trim();
      const to = messageTo.value.trim() || "all";
      if (!body) return;
      await fetch("/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body, to, project: projectForWrite() })
      });
      messageInput.value = "";
      await loadSnapshot();
    });

    projectForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const id = projectId.value.trim();
      const name = projectName.value.trim();
      const folderPath = projectFolder.value.trim();
      const repoUrl = projectRepo.value.trim();
      if (!id || !name || !folderPath) return;
      await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, name, folderPath, repoUrl: repoUrl || undefined, status: "active" })
      });
      selectedProject = id;
      projectId.value = "";
      projectName.value = "";
      projectFolder.value = "";
      projectRepo.value = "";
      await loadSnapshot();
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
      if (!taskId) return;
      await fetch("/api/tasks/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taskId, status, owner: owner || undefined, note: note || undefined, by: "user" })
      });
      taskUpdateId.value = "";
      taskUpdateOwner.value = "";
      taskUpdateNote.value = "";
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
    setInterval(loadSnapshot, 5000);
  </script>
</body>
</html>`;
