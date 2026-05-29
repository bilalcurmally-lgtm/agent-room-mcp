# Local Dashboard Control Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local browser dashboard so the user can watch agent coordination, pick a project, post into the room, create tasks, record decisions, and stop being the courier between agents.

**Architecture:** Keep the existing MCP server and file-backed store as the source of truth. Add a lightweight local HTTP dashboard server that reads/writes through `AgentRoomStore`, serves static HTML/CSS/JS, and exposes a small JSON API for the UI. The dashboard is local-only by default and hides all JSON storage from the user.

**Tech Stack:** Node.js, TypeScript, `node:http`, existing `AgentRoomStore`, plain browser HTML/CSS/JS, Vitest.

---

## File Structure

- Modify `src/store.ts`: add project discovery helpers and optional project filters for decisions/status where needed.
- Modify `src/server.ts`: preserve existing MCP stdio behavior; only touch if shared room resolution helpers are extracted.
- Create `src/dashboard.ts`: local HTTP server, static file serving, JSON API routes, CLI entrypoint for dashboard mode.
- Create `src/dashboard-ui.ts`: inline static HTML/CSS/JS string or exported assets for the dashboard MVP.
- Modify `package.json`: add `agent-room-dashboard` bin or dashboard script.
- Modify `README.md`: document the human-friendly dashboard workflow.
- Modify `docs/PLAN.md`: mark dashboard MVP as the next product slice.
- Add `test/dashboard.test.ts`: route/API tests using temp room directories.

## Task 1: Store Project Discovery

**Files:**
- Modify: `src/store.ts`
- Test: `test/store.test.ts`

- [ ] **Step 1: Write the failing tests**

Add tests that prove the store can discover projects without exposing storage files to the user.

```ts
it("lists projects from messages, tasks, and decisions with unsorted fallback", async () => {
  const store = await makeStore();
  await store.postMessage(message({ from: "user", to: "all", topic: "Global", project: "dashboard-v2" }));
  await store.createTask(taskInput({ title: "API work", project: "agent-room" }));
  await store.recordDecision({
    title: "Use local dashboard",
    decision: "Dashboard runs locally.",
    rationale: "Least setup.",
    project: "dashboard-v2"
  });
  await store.postMessage(message({ from: "opus", to: "codex", topic: "No project" }));

  expect(await store.listProjects()).toEqual(["agent-room", "dashboard-v2", "unsorted"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/store.test.ts`

Expected: FAIL because `store.listProjects` is not defined.

- [ ] **Step 3: Implement minimal store helper**

Add this public method to `AgentRoomStore`:

```ts
async listProjects(): Promise<string[]> {
  const state = await this.readState();
  const projects = new Set<string>();
  let hasUnsorted = false;

  for (const item of [...state.messages, ...state.tasks, ...state.decisions]) {
    if (item.project) projects.add(item.project);
    else hasUnsorted = true;
  }

  const sorted = [...projects].sort((a, b) => a.localeCompare(b));
  return hasUnsorted ? [...sorted, "unsorted"] : sorted;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/store.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store.ts test/store.test.ts
git commit -m "feat: list room projects"
```

## Task 2: Dashboard API Server

**Files:**
- Create: `src/dashboard.ts`
- Test: `test/dashboard.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing API tests**

Create `test/dashboard.test.ts`:

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AgentRoomStore } from "../src/store.js";
import { startDashboardServer } from "../src/dashboard.js";

const servers: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(servers.map((server) => server.close()));
  servers.length = 0;
});

describe("dashboard server", () => {
  it("returns a project-scoped snapshot", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-dashboard-"));
    const store = await AgentRoomStore.open(roomDir);
    await store.registerAgent({ agent: "codex", role: "implementer" });
    await store.postMessage({ from: "user", to: "all", topic: "Build", body: "Build dashboard", project: "dashboard-v2" });
    await store.createTask({ title: "Build UI", body: "Make it usable", project: "dashboard-v2" });

    const server = await startDashboardServer({ roomDir, port: 0, openBrowser: false });
    servers.push(server);

    const response = await fetch(`${server.url}/api/snapshot?project=dashboard-v2`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      selectedProject: "dashboard-v2",
      messages: [{ topic: "Build" }],
      tasks: [{ title: "Build UI" }],
      agents: [{ id: "codex" }]
    });
  });

  it("lets the user post a message without touching JSON files", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-dashboard-"));
    const server = await startDashboardServer({ roomDir, port: 0, openBrowser: false });
    servers.push(server);

    const response = await fetch(`${server.url}/api/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "Codex implement, Opus review.", project: "dashboard-v2" })
    });

    expect(response.status).toBe(201);
    const snapshot = await fetch(`${server.url}/api/snapshot?project=dashboard-v2`).then((res) => res.json());
    expect(snapshot.messages).toMatchObject([{ from: "user", to: "all", body: "Codex implement, Opus review." }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- test/dashboard.test.ts`

Expected: FAIL because `src/dashboard.ts` does not exist.

- [ ] **Step 3: Implement `src/dashboard.ts`**

Create a minimal HTTP server with these exported types and function:

```ts
export interface DashboardOptions {
  roomDir: string;
  port?: number;
  host?: string;
  openBrowser?: boolean;
}

export interface DashboardServer {
  url: string;
  close(): Promise<void>;
}

export async function startDashboardServer(options: DashboardOptions): Promise<DashboardServer> {
  // Use node:http.
  // Create AgentRoomStore.open(options.roomDir).
  // Serve GET / with dashboardHtml.
  // Serve GET /api/snapshot?project=...
  // Serve POST /api/messages.
  // Serve POST /api/tasks.
  // Serve POST /api/decisions.
  // Bind to host default "127.0.0.1" and port default 0.
}
```

Route behavior:

- `GET /api/snapshot?project=all`: return all messages/tasks/decisions.
- `GET /api/snapshot?project=unsorted`: return only records with no project.
- `GET /api/snapshot?project=<name>`: return records matching that project.
- `POST /api/messages`: create `postMessage({ from: "user", to: "all", topic: "User note", body, project })`.
- `POST /api/tasks`: create `createTask({ title, body, owner, project })`.
- `POST /api/decisions`: create `recordDecision({ title, decision, rationale, project, source: "dashboard" })`.
- Invalid JSON returns HTTP 400 with `{ "error": "Invalid JSON body" }`.
- Unknown routes return HTTP 404.

- [ ] **Step 4: Run tests**

Run: `npm test -- test/dashboard.test.ts`

Expected: PASS.

- [ ] **Step 5: Add package script/bin**

Modify `package.json`:

```json
{
  "bin": {
    "agent-room-mcp": "./dist/server.js",
    "agent-room-dashboard": "./dist/dashboard.js"
  },
  "scripts": {
    "dashboard": "tsx src/dashboard.ts"
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/dashboard.ts test/dashboard.test.ts package.json
git commit -m "feat: add local dashboard server"
```

## Task 3: Human-Friendly Dashboard UI

**Files:**
- Create: `src/dashboard-ui.ts`
- Modify: `src/dashboard.ts`
- Test: `test/dashboard.test.ts`

- [ ] **Step 1: Write failing HTML smoke test**

Add this test:

```ts
it("serves a human-friendly control room page", async () => {
  const roomDir = await mkdtemp(join(tmpdir(), "agent-room-dashboard-"));
  const server = await startDashboardServer({ roomDir, port: 0, openBrowser: false });
  servers.push(server);

  const html = await fetch(server.url).then((res) => res.text());

  expect(html).toContain("Agent Room");
  expect(html).toContain("Tell the room");
  expect(html).toContain("Project");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/dashboard.test.ts`

Expected: FAIL until the dashboard serves the final HTML.

- [ ] **Step 3: Create `src/dashboard-ui.ts`**

Export `dashboardHtml` containing one responsive page:

```ts
export const dashboardHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Agent Room</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #f7f7f4; color: #202124; }
    header { display: flex; gap: 12px; align-items: center; padding: 14px 18px; border-bottom: 1px solid #d8d8d0; background: #ffffff; }
    main { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 16px; padding: 16px; }
    section, aside { background: #fff; border: 1px solid #d8d8d0; border-radius: 8px; padding: 14px; }
    .feed { display: grid; gap: 10px; }
    .message, .task, .decision, .agent { border: 1px solid #ecece4; border-radius: 6px; padding: 10px; }
    .composer { display: grid; gap: 8px; margin-top: 12px; }
    textarea, input, select, button { font: inherit; }
    textarea, input, select { width: 100%; box-sizing: border-box; border: 1px solid #c8c8c0; border-radius: 6px; padding: 8px; }
    button { border: 1px solid #1d4ed8; background: #1d4ed8; color: white; border-radius: 6px; padding: 8px 10px; cursor: pointer; }
    @media (max-width: 820px) { main { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <strong>Agent Room</strong>
    <label>Project <select id="project"></select></label>
    <button id="refresh">Refresh</button>
  </header>
  <main>
    <section>
      <h2>Room Feed</h2>
      <div id="feed" class="feed"></div>
      <form id="message-form" class="composer">
        <textarea id="message" rows="3" placeholder="Tell the room..."></textarea>
        <button type="submit">Tell all agents</button>
      </form>
    </section>
    <aside>
      <h2>Agents</h2>
      <div id="agents"></div>
      <h2>Tasks</h2>
      <div id="tasks"></div>
      <h2>Decisions</h2>
      <div id="decisions"></div>
    </aside>
  </main>
  <script>
    // Fetch /api/snapshot, render projects/feed/tasks/decisions/agents.
    // Submit message form to /api/messages.
    // Poll snapshot every 5 seconds.
  </script>
</body>
</html>`;
```

Implement the script fully in the actual file:

- Keep `selectedProject` in memory.
- Populate project dropdown with `All Projects`, `Unsorted`, plus project names from API.
- Render empty states in plain language: “No messages yet.”
- Escape text with `textContent`, not `innerHTML`.
- Poll every 5 seconds.

- [ ] **Step 4: Wire HTML into server**

In `src/dashboard.ts`, import `dashboardHtml` and serve it for `GET /`.

- [ ] **Step 5: Run tests**

Run: `npm test -- test/dashboard.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/dashboard-ui.ts src/dashboard.ts test/dashboard.test.ts
git commit -m "feat: add dashboard control room UI"
```

## Task 4: Dashboard Actions for Tasks and Decisions

**Files:**
- Modify: `src/dashboard-ui.ts`
- Modify: `test/dashboard.test.ts`

- [ ] **Step 1: Add failing API tests for task and decision creation**

Add tests that POST to `/api/tasks` and `/api/decisions`, then confirm the snapshot includes the new records.

```ts
it("lets the user create tasks and decisions from the dashboard API", async () => {
  const roomDir = await mkdtemp(join(tmpdir(), "agent-room-dashboard-"));
  const server = await startDashboardServer({ roomDir, port: 0, openBrowser: false });
  servers.push(server);

  await fetch(`${server.url}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Implement sidebar", body: "Codex owns implementation.", owner: "codex", project: "dashboard-v2" })
  });

  await fetch(`${server.url}/api/decisions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Human is lead", decision: "User decisions override agent debate.", rationale: "Prevents drift.", project: "dashboard-v2" })
  });

  const snapshot = await fetch(`${server.url}/api/snapshot?project=dashboard-v2`).then((res) => res.json());
  expect(snapshot.tasks).toMatchObject([{ title: "Implement sidebar", owner: "codex" }]);
  expect(snapshot.decisions).toMatchObject([{ title: "Human is lead" }]);
});
```

- [ ] **Step 2: Run test to verify it fails if routes are incomplete**

Run: `npm test -- test/dashboard.test.ts`

Expected: FAIL until routes exist.

- [ ] **Step 3: Implement/verify routes**

Ensure `POST /api/tasks` and `POST /api/decisions` validate required fields and return HTTP 201.

- [ ] **Step 4: Add UI forms**

Add compact forms in `src/dashboard-ui.ts`:

- Task form: title, body, owner optional, submit button “Create task”.
- Decision form: title, decision, rationale, submit button “Record decision”.
- Both forms use the currently selected project unless `All Projects` is selected, in which case they post without `project`.

- [ ] **Step 5: Run tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/dashboard-ui.ts src/dashboard.ts test/dashboard.test.ts
git commit -m "feat: add dashboard task and decision actions"
```

## Task 5: CLI Polish and Browser Launch

**Files:**
- Modify: `src/dashboard.ts`
- Modify: `README.md`
- Test: `test/dashboard.test.ts`

- [ ] **Step 1: Add CLI argument tests**

Test a pure helper, not a spawned process:

```ts
import { resolveDashboardOptions } from "../src/dashboard.js";

it("resolves dashboard CLI options", () => {
  expect(resolveDashboardOptions(["--room", "D:\\\\projects\\\\.agent-room", "--port", "4777"], {})).toMatchObject({
    roomDir: "D:\\\\projects\\\\.agent-room",
    port: 4777
  });

  expect(resolveDashboardOptions([], { AGENT_ROOM_DIR: "env-room" })).toMatchObject({
    roomDir: "env-room"
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/dashboard.test.ts`

Expected: FAIL until helper exists.

- [ ] **Step 3: Implement CLI helper and main**

Add:

```ts
export function resolveDashboardOptions(args: readonly string[], env: NodeJS.ProcessEnv): DashboardOptions {
  // --room wins, then AGENT_ROOM_DIR, then ".agent-room"
  // --port parses as number; default is 4777 for CLI
  // --no-open disables browser launch
}
```

When run directly:

- Start dashboard.
- Print `Agent Room dashboard: http://127.0.0.1:4777`.
- Open the browser unless `--no-open` is passed.
- Use Windows `cmd /c start "" "<url>"`, macOS `open`, Linux `xdg-open`.

- [ ] **Step 4: Run tests and build**

Run:

```bash
npm test
npm run build
```

Expected: PASS.

- [ ] **Step 5: Update README**

Document:

```powershell
npm run build
node dist/dashboard.js --room D:\projects\.agent-room
```

And:

```powershell
agent-room-dashboard --room D:\projects\.agent-room
```

- [ ] **Step 6: Commit**

```bash
git add src/dashboard.ts README.md test/dashboard.test.ts package.json
git commit -m "feat: add dashboard CLI"
```

## Task 6: Final Verification and GitHub Handoff

**Files:**
- Modify: `docs/PLAN.md`
- No new tests unless prior verification reveals a gap.

- [ ] **Step 1: Update product plan**

In `docs/PLAN.md`, mark the local dashboard MVP as active/implemented and describe the intended user workflow:

- User opens dashboard.
- User selects project.
- User posts instructions.
- Agents check in via MCP using the same project.
- User can watch, interrupt, create tasks, and record decisions.

- [ ] **Step 2: Full verification**

Run:

```bash
npm test
npm run build
```

Expected:

- All tests pass.
- TypeScript build succeeds.

- [ ] **Step 3: Manual smoke test**

Run:

```bash
node dist/dashboard.js --room D:\projects\.agent-room --no-open
```

Open the printed local URL and confirm:

- Page loads.
- Project dropdown appears.
- “Tell the room” post creates a feed item.
- Task and decision forms create visible records.

- [ ] **Step 4: Commit final docs**

```bash
git add docs/PLAN.md README.md
git commit -m "docs: document dashboard control room workflow"
```

- [ ] **Step 5: Push**

If the repo has no baseline commits yet, first add all project files and create the initial commit:

```bash
git add .
git commit -m "feat: add agent room mcp"
git branch -M main
git push -u origin main
```

If commits already exist, push the current branch:

```bash
git push
```

## Execution Recommendation

This is doable in one focused implementation session for the MVP if we keep it plain HTML/CSS/JS and avoid React/Vite. It should be done in multiple commits, not one giant commit.

Do **not** build authentication yet. For this local-first version, “sign in” means agents register through MCP and the human uses the local dashboard. Real login only matters later if the dashboard leaves localhost or supports multiple humans.

## Self-Review

- Spec coverage: The plan covers project selection, human monitoring, user posting, task creation, decision recording, agent presence/read status, and hiding JSON from the user.
- Placeholder scan: No task uses TBD/TODO/fill-in language for required behavior. The UI script section names exact required behavior but should be fully written during implementation because embedding a long browser script in the plan would add noise without changing decisions.
- Type consistency: `AgentRoomStore`, `startDashboardServer`, `DashboardOptions`, `DashboardServer`, `resolveDashboardOptions`, and route names are consistent across tasks.
