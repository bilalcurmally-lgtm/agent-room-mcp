import { appendFile, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRoomTime, type RoomTime } from "./time.js";

export const MAX_TEXT_LENGTH = 100_000;
export const STALE_TASK_AFTER_HOURS = 24;

export type AgentId = string;
export type TaskStatus = "open" | "claimed" | "blocked" | "done";

export interface PostMessageInput {
  from: AgentId;
  to: AgentId | "all";
  topic: string;
  body: string;
  project?: string;
  source?: string;
  replyTo?: string;
}

export interface RoomMessage extends PostMessageInput {
  id: string;
  time: string;
}

export interface ReadMessagesInput {
  agent: AgentId;
  sinceId?: string;
  includeBroadcasts?: boolean;
  project?: string;
}

export interface CreateTaskInput {
  title: string;
  body: string;
  owner?: AgentId;
  project?: string;
  source?: string;
}

export interface RoomTask {
  id: string;
  title: string;
  body: string;
  status: TaskStatus;
  owner?: AgentId;
  project?: string;
  source?: string;
  createdAt: string;
  updatedAt: string;
  notes: TaskNote[];
}

export interface TaskNote {
  at: string;
  by: AgentId | "system";
  body: string;
}

export interface ClaimTaskInput {
  taskId: string;
  agent: AgentId;
}

export interface RegisterAgentInput {
  agent: AgentId;
  displayName?: string;
  role?: string;
}

export interface RoomAgent {
  id: AgentId;
  displayName?: string;
  role?: string;
  lastReadMessageId?: string;
  registeredAt: string;
  updatedAt: string;
}

export interface UpsertProjectInput {
  id: string;
  name: string;
  folderPath: string;
  repoUrl?: string;
  status?: string;
}

export interface RoomProject extends UpsertProjectInput {
  createdAt: string;
  updatedAt: string;
}

export interface MarkMessagesReadInput {
  agent: AgentId;
  throughId?: string;
  includeBroadcasts?: boolean;
}

export interface CheckInInput {
  agent: AgentId;
  project?: string;
  includeBroadcasts?: boolean;
}

export interface AgentCheckIn {
  agent: RoomAgent;
  roomTime: RoomTime;
  projectRecord?: RoomProject;
  unreadMessages: RoomMessage[];
  assignedTasks: RoomTask[];
  openTasks: RoomTask[];
  staleTasks: StaleTaskWarning[];
  recentDecisions: RoomDecision[];
  status: RoomStatus;
}

export interface ListTasksInput {
  status?: TaskStatus;
  owner?: AgentId;
  project?: string;
}

export interface ListStaleTasksInput {
  project?: string;
  now?: Date;
  olderThanHours?: number;
}

export interface StaleTaskWarning {
  taskId: string;
  title: string;
  status: Exclude<TaskStatus, "done">;
  owner?: AgentId;
  project?: string;
  updatedAt: string;
  ageHours: number;
  message: string;
}

export interface UpdateTaskInput {
  taskId: string;
  status: TaskStatus;
  owner?: AgentId;
  note?: string;
  by?: AgentId;
}

export interface AppendTaskNoteInput {
  taskId: string;
  body: string;
  by?: AgentId;
}

export interface RecordDecisionInput {
  title: string;
  decision: string;
  rationale: string;
  project?: string;
  source?: string;
  links?: string[];
}

export interface RoomDecision extends RecordDecisionInput {
  id: string;
  time: string;
}

export interface RoomStatus {
  roomDir: string;
  messages: number;
  tasks: Record<TaskStatus, number>;
  decisions: number;
  agents: number;
  unread: Record<AgentId, number>;
}

export interface RoomConfig {
  staleTaskHours: number;
}

export interface UpdateConfigInput {
  staleTaskHours?: number;
}

interface RoomState {
  messages: RoomMessage[];
  tasks: RoomTask[];
  decisions: RoomDecision[];
  agents: RoomAgent[];
  projects: RoomProject[];
}

export class AgentRoomStore {
  private writeQueue: Promise<unknown> = Promise.resolve();

  private constructor(public readonly roomDir: string) {}

  static async open(roomDir: string): Promise<AgentRoomStore> {
    const store = new AgentRoomStore(roomDir);
    await store.ensureRoom();
    return store;
  }

  async postMessage(input: PostMessageInput): Promise<RoomMessage> {
    validateText("topic", input.topic);
    validateText("body", input.body);
    validateText("project", input.project);
    validateText("source", input.source);

    return this.withExclusiveWrite(async () => {
      const messages = await this.readJsonl<RoomMessage>("messages.jsonl");
      const message: RoomMessage = {
        ...input,
        id: nextId(messages.length + 1),
        time: now()
      };

      await appendFile(this.path("messages.jsonl"), `${JSON.stringify(message)}\n`, "utf8");
      return message;
    });
  }

  async readMessages(input: ReadMessagesInput): Promise<RoomMessage[]> {
    const messages = await this.readJsonl<RoomMessage>("messages.jsonl");
    return filterVisibleMessages(messages, input);
  }

  async listMessages(): Promise<RoomMessage[]> {
    return this.readJsonl<RoomMessage>("messages.jsonl");
  }

  async registerAgent(input: RegisterAgentInput): Promise<RoomAgent> {
    validateText("agent", input.agent);
    validateText("displayName", input.displayName);
    validateText("role", input.role);

    return this.withExclusiveWrite(async () => {
      const agents = await this.readAgents();
      const existing = agents.find((agent) => agent.id === input.agent);
      const time = now();

      if (existing) {
        existing.displayName = input.displayName ?? existing.displayName;
        existing.role = input.role ?? existing.role;
        existing.updatedAt = time;
        await this.writeAgents(agents);
        return existing;
      }

      const agent: RoomAgent = {
        id: input.agent,
        displayName: input.displayName,
        role: input.role,
        registeredAt: time,
        updatedAt: time
      };

      agents.push(agent);
      await this.writeAgents(agents);
      return agent;
    });
  }

  async markMessagesRead(input: MarkMessagesReadInput): Promise<RoomAgent> {
    validateText("agent", input.agent);
    validateText("throughId", input.throughId);

    return this.withExclusiveWrite(async () => {
      const agents = await this.readAgents();
      const agent = findAgent(agents, input.agent);
      const messages = await this.readMessages({ agent: input.agent, includeBroadcasts: input.includeBroadcasts });
      const latestVisibleId = messages.at(-1)?.id;
      agent.lastReadMessageId = input.throughId ?? latestVisibleId ?? agent.lastReadMessageId;
      agent.updatedAt = now();
      await this.writeAgents(agents);
      return agent;
    });
  }

  async checkIn(input: CheckInInput): Promise<AgentCheckIn> {
    validateText("agent", input.agent);
    validateText("project", input.project);

    const agents = await this.readAgents();
    const agent = agents.find((candidate) => candidate.id === input.agent)
      ?? (await this.registerAgent({ agent: input.agent }));

    const unreadMessages = await this.readMessages({
      agent: input.agent,
      sinceId: agent.lastReadMessageId,
      includeBroadcasts: input.includeBroadcasts,
      project: input.project
    });

    const assignedTasks = await this.listTasks({ owner: input.agent, project: input.project });
    const openTasks = await this.listTasks({ status: "open", project: input.project });
    const config = await this.getConfig();
    const staleTasks = await this.listStaleTasks({ project: input.project, olderThanHours: config.staleTaskHours });
    const decisions = await this.readDecisions();
    const projectRecord = input.project
      ? (await this.readProjects()).find((project) => project.id === input.project)
      : undefined;

    return {
      agent,
      roomTime: createRoomTime(),
      projectRecord,
      unreadMessages,
      assignedTasks,
      openTasks,
      staleTasks,
      recentDecisions: decisions.filter((decision) => matchesProject(decision, input.project)),
      status: await this.getRoomStatus()
    };
  }

  async createTask(input: CreateTaskInput): Promise<RoomTask> {
    validateText("title", input.title);
    validateText("body", input.body);
    validateText("owner", input.owner);
    validateText("project", input.project);
    validateText("source", input.source);

    return this.withExclusiveWrite(async () => {
      const tasks = await this.readTasks();
      const time = now();
      const task: RoomTask = {
        ...input,
        id: `task-${nextId(tasks.length + 1)}`,
        status: input.owner ? "claimed" : "open",
        createdAt: time,
        updatedAt: time,
        notes: []
      };

      tasks.push(task);
      await this.writeTasks(tasks);
      return task;
    });
  }

  async claimTask(input: ClaimTaskInput): Promise<RoomTask> {
    validateText("agent", input.agent);

    return this.withExclusiveWrite(async () => {
      const tasks = await this.readTasks();
      const task = findTask(tasks, input.taskId);
      task.owner = input.agent;
      task.status = "claimed";
      task.updatedAt = now();
      await this.writeTasks(tasks);
      return task;
    });
  }

  async listTasks(input: ListTasksInput = {}): Promise<RoomTask[]> {
    const tasks = await this.readTasks();
    return tasks.filter((task) => {
      if (input.status && task.status !== input.status) return false;
      if (input.owner && task.owner !== input.owner) return false;
      if (input.project && task.project !== input.project) return false;
      return true;
    });
  }

  async listStaleTasks(input: ListStaleTasksInput = {}): Promise<StaleTaskWarning[]> {
    const nowTime = (input.now ?? new Date()).getTime();
    const threshold = input.olderThanHours ?? STALE_TASK_AFTER_HOURS;
    const tasks = await this.readTasks();

    return tasks.flatMap((task) => {
      if (task.status === "done") return [];
      if (!matchesProject(task, input.project)) return [];
      const updatedAt = new Date(task.updatedAt).getTime();
      if (Number.isNaN(updatedAt)) return [];
      const ageHours = Math.floor((nowTime - updatedAt) / 3_600_000);
      if (ageHours < threshold) return [];

      return [
        {
          taskId: task.id,
          title: task.title,
          status: task.status,
          owner: task.owner,
          project: task.project,
          updatedAt: task.updatedAt,
          ageHours,
          message: `Re-check ${task.id}; this ${task.status} task has not changed in ${ageHours} hours.`
        }
      ];
    });
  }

  async getConfig(): Promise<RoomConfig> {
    const config = await this.readConfig();
    return {
      staleTaskHours: config.staleTaskHours ?? STALE_TASK_AFTER_HOURS
    };
  }

  async updateConfig(input: UpdateConfigInput): Promise<RoomConfig> {
    const current = await this.getConfig();
    const next: RoomConfig = {
      ...current,
      ...input
    };
    validatePositiveInteger("staleTaskHours", next.staleTaskHours);

    return this.withExclusiveWrite(async () => {
      await this.writeConfig(next);
      return next;
    });
  }

  async listProjects(): Promise<string[]> {
    const state = await this.readState();
    const projects = new Set<string>();
    let hasUnsorted = false;

    for (const project of state.projects) {
      projects.add(project.id);
    }

    for (const item of [...state.messages, ...state.tasks, ...state.decisions]) {
      if (item.project) projects.add(item.project);
      else hasUnsorted = true;
    }

    const sorted = [...projects].sort((a, b) => a.localeCompare(b));
    return hasUnsorted ? [...sorted, "unsorted"] : sorted;
  }

  async listDecisions(): Promise<RoomDecision[]> {
    return this.readDecisions();
  }

  async listAgents(): Promise<RoomAgent[]> {
    return this.readAgents();
  }

  async listProjectRecords(): Promise<RoomProject[]> {
    return this.readProjects();
  }

  async upsertProject(input: UpsertProjectInput): Promise<RoomProject> {
    validateText("id", input.id);
    validateText("name", input.name);
    validateText("folderPath", input.folderPath);
    validateText("repoUrl", input.repoUrl);
    validateText("status", input.status);

    return this.withExclusiveWrite(async () => {
      const projects = await this.readProjects();
      const existing = projects.find((project) => project.id === input.id);
      const time = now();

      if (existing) {
        existing.name = input.name;
        existing.folderPath = input.folderPath;
        existing.repoUrl = input.repoUrl;
        existing.status = input.status;
        existing.updatedAt = time;
        await this.writeProjects(projects);
        return existing;
      }

      const project: RoomProject = {
        ...input,
        createdAt: time,
        updatedAt: time
      };
      projects.push(project);
      projects.sort((a, b) => a.name.localeCompare(b.name));
      await this.writeProjects(projects);
      return project;
    });
  }

  async updateTask(input: UpdateTaskInput): Promise<RoomTask> {
    validateText("owner", input.owner);
    validateText("note", input.note);
    validateText("by", input.by);

    return this.withExclusiveWrite(async () => {
      const tasks = await this.readTasks();
      const task = findTask(tasks, input.taskId);
      task.status = input.status;
      if (input.owner !== undefined) task.owner = input.owner;
      task.updatedAt = now();
      if (input.note) {
        task.notes.push({
          at: task.updatedAt,
          by: input.by ?? "system",
          body: input.note
        });
      }
      await this.writeTasks(tasks);
      return task;
    });
  }

  async appendTaskNote(input: AppendTaskNoteInput): Promise<RoomTask> {
    validateText("body", input.body);
    validateText("by", input.by);

    return this.withExclusiveWrite(async () => {
      const tasks = await this.readTasks();
      const task = findTask(tasks, input.taskId);
      task.updatedAt = now();
      task.notes.push({
        at: task.updatedAt,
        by: input.by ?? "system",
        body: input.body
      });
      await this.writeTasks(tasks);
      return task;
    });
  }

  async recordDecision(input: RecordDecisionInput): Promise<RoomDecision> {
    validateText("title", input.title);
    validateText("decision", input.decision);
    validateText("rationale", input.rationale);
    validateText("project", input.project);
    validateText("source", input.source);
    input.links?.forEach((link, index) => validateText(`links[${index}]`, link));

    return this.withExclusiveWrite(async () => {
      const decisions = await this.readDecisions();
      const decision: RoomDecision = {
        ...input,
        id: `decision-${nextId(decisions.length + 1)}`,
        time: now()
      };

      decisions.push(decision);
      await this.writeJsonAtomic("decisions.json", decisions);
      await appendFile(this.path("decisions.md"), formatDecision(decision), "utf8");
      return decision;
    });
  }

  async getRoomStatus(): Promise<RoomStatus> {
    const state = await this.readState();
    return {
      roomDir: this.roomDir,
      messages: state.messages.length,
      tasks: {
        open: state.tasks.filter((task) => task.status === "open").length,
        claimed: state.tasks.filter((task) => task.status === "claimed").length,
        blocked: state.tasks.filter((task) => task.status === "blocked").length,
        done: state.tasks.filter((task) => task.status === "done").length
      },
      decisions: state.decisions.length,
      agents: state.agents.length,
      unread: Object.fromEntries(
        state.agents.map((agent) => [
          agent.id,
          filterVisibleMessages(state.messages, {
            agent: agent.id,
            sinceId: agent.lastReadMessageId,
            includeBroadcasts: true
          }).length
        ])
      )
    };
  }

  private async ensureRoom(): Promise<void> {
    await mkdir(this.roomDir, { recursive: true });
    await ensureFile(this.path("messages.jsonl"), "");
    await ensureFile(this.path("tasks.json"), "[]\n");
    await ensureFile(this.path("decisions.json"), "[]\n");
    await ensureFile(this.path("decisions.md"), "# Agent Room Decisions\n\n");
    await ensureFile(this.path("agents.json"), "[]\n");
    await ensureFile(this.path("projects.json"), "[]\n");
    await ensureFile(this.path("config.json"), "{}\n");
  }

  private async readState(): Promise<RoomState> {
    return {
      messages: await this.readJsonl<RoomMessage>("messages.jsonl"),
      tasks: await this.readTasks(),
      decisions: await this.readDecisions(),
      agents: await this.readAgents(),
      projects: await this.readProjects()
    };
  }

  private async readTasks(): Promise<RoomTask[]> {
    return this.readJson<RoomTask[]>("tasks.json", []);
  }

  private async writeTasks(tasks: RoomTask[]): Promise<void> {
    await this.writeJsonAtomic("tasks.json", tasks);
  }

  private async readDecisions(): Promise<RoomDecision[]> {
    return this.readJson<RoomDecision[]>("decisions.json", []);
  }

  private async readAgents(): Promise<RoomAgent[]> {
    return this.readJson<RoomAgent[]>("agents.json", []);
  }

  private async writeAgents(agents: RoomAgent[]): Promise<void> {
    await this.writeJsonAtomic("agents.json", agents);
  }

  private async readProjects(): Promise<RoomProject[]> {
    return this.readJson<RoomProject[]>("projects.json", []);
  }

  private async writeProjects(projects: RoomProject[]): Promise<void> {
    await this.writeJsonAtomic("projects.json", projects);
  }

  private async readConfig(): Promise<Partial<RoomConfig>> {
    return this.readJson<Partial<RoomConfig>>("config.json", {});
  }

  private async writeConfig(config: RoomConfig): Promise<void> {
    await this.writeJsonAtomic("config.json", config);
  }

  private async readJson<T>(fileName: string, fallback: T): Promise<T> {
    try {
      const raw = await readFile(this.path(fileName), "utf8");
      return JSON.parse(raw) as T;
    } catch (error) {
      if (isNotFound(error)) return fallback;
      throw storageParseError(fileName, error);
    }
  }

  private async writeJsonAtomic(fileName: string, value: unknown): Promise<void> {
    const target = this.path(fileName);
    const temp = this.path(`${fileName}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
    try {
      await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
      await rename(temp, target);
    } catch (error) {
      await rm(temp, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  private async withExclusiveWrite<T>(operation: () => Promise<T>): Promise<T> {
    const queued = this.writeQueue.then(() => withFileLock(this.path("room.lock"), operation));
    this.writeQueue = queued.catch(() => undefined);
    return queued;
  }

  private async readJsonl<T>(fileName: string): Promise<T[]> {
    let raw: string;
    try {
      raw = await readFile(this.path(fileName), "utf8");
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }

    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line, index) => {
        try {
          return JSON.parse(line) as T;
        } catch (error) {
          throw storageParseError(`${fileName} line ${index + 1}`, error);
        }
      });
  }

  private path(fileName: string): string {
    return join(this.roomDir, fileName);
  }
}

async function withFileLock<T>(lockPath: string, operation: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  while (true) {
    try {
      const handle = await open(lockPath, "wx");
      try {
        return await operation();
      } finally {
        await handle.close();
        await rm(lockPath, { force: true });
      }
    } catch (error) {
      if (!isAlreadyExists(error) || Date.now() - startedAt > 5_000) throw error;
      await delay(25);
    }
  }
}

function validateText(field: string, value: string | undefined): void {
  if (value && value.length > MAX_TEXT_LENGTH) {
    throw new Error(`${field} must be at most ${MAX_TEXT_LENGTH} characters`);
  }
}

function validatePositiveInteger(field: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
}

function filterVisibleMessages(
  messages: RoomMessage[],
  input: Pick<ReadMessagesInput, "agent" | "sinceId" | "includeBroadcasts" | "project">
): RoomMessage[] {
  const includeBroadcasts = input.includeBroadcasts ?? true;

  return messages.filter((message) => {
    if (input.sinceId && message.id <= input.sinceId) return false;
    if (!matchesProject(message, input.project)) return false;
    if (message.to === input.agent) return true;
    return includeBroadcasts && message.to === "all";
  });
}

function matchesProject(item: { project?: string }, project: string | undefined): boolean {
  return !project || item.project === project;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function storageParseError(fileName: string, error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(
    `Failed to parse ${fileName}. The file was left unchanged; fix or restore it before writing again. ${detail}`
  );
}

function isNotFound(error: unknown): boolean {
  return isNodeError(error, "ENOENT");
}

function isAlreadyExists(error: unknown): boolean {
  return isNodeError(error, "EEXIST");
}

function isNodeError(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

async function ensureFile(path: string, contents: string): Promise<void> {
  try {
    await readFile(path, "utf8");
  } catch (error) {
    if (isNotFound(error)) {
      await writeFile(path, contents, "utf8");
      return;
    }
    throw error;
  }
}

function findTask(tasks: RoomTask[], taskId: string): RoomTask {
  const task = tasks.find((candidate) => candidate.id === taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  return task;
}

function findAgent(agents: RoomAgent[], agentId: AgentId): RoomAgent {
  const agent = agents.find((candidate) => candidate.id === agentId);
  if (!agent) throw new Error(`Agent not registered: ${agentId}`);
  return agent;
}

function nextId(index: number): string {
  return String(index).padStart(6, "0");
}

function now(): string {
  return new Date().toISOString();
}

function formatDecision(decision: RoomDecision): string {
  const links = decision.links?.length
    ? `\nLinks:\n${decision.links.map((link) => `- ${link}`).join("\n")}\n`
    : "";

  return `## ${decision.id} - ${decision.title}

Time: ${decision.time}

Decision:
${decision.decision}

Rationale:
${decision.rationale}
${links}
`;
}
