import { appendFile, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  decodeAttachmentContent,
  inlineLinkRef,
  isAllowedMimeType,
  sanitizeAttachmentFileName,
  toAttachmentRef,
  validateLinkUrl,
  type AttachmentRef,
  type LinkAttachmentInput,
  type StoredAttachment,
  type UploadAttachmentInput
} from "./attachments.js";
import { assessProtocolCompliance, enrichMessageBody } from "./protocol.js";
import { buildStaleItemWarnings, type StaleItemWarning } from "./temporal.js";
import { createRoomTime, type RoomTime } from "./time.js";

export type { AttachmentRef, StoredAttachment, UploadAttachmentInput, LinkAttachmentInput } from "./attachments.js";

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
  status?: string;
  next?: string;
  phase?: string;
  attachmentIds?: string[];
  links?: Array<{ name: string; url: string }>;
}

export interface RoomMessage extends Omit<PostMessageInput, "attachmentIds" | "links"> {
  id: string;
  time: string;
  attachments?: AttachmentRef[];
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
  attachmentIds?: string[];
  links?: Array<{ name: string; url: string }>;
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
  attachments?: AttachmentRef[];
}

export interface TaskNote {
  at: string;
  by: AgentId | "system";
  body: string;
  branch?: string;
  commit?: string;
  attachments?: AttachmentRef[];
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

export interface DeleteProjectInput {
  id: string;
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
  staleMessages: StaleItemWarning[];
  staleDecisions: StaleItemWarning[];
  recentDecisions: RoomDecision[];
  status: RoomStatus;
}

export type { StaleItemWarning };

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
  branch?: string;
  commit?: string;
  by?: AgentId;
  attachmentIds?: string[];
  links?: Array<{ name: string; url: string }>;
}

export interface AppendTaskNoteInput {
  taskId: string;
  body: string;
  branch?: string;
  commit?: string;
  by?: AgentId;
  attachmentIds?: string[];
  links?: Array<{ name: string; url: string }>;
}

export interface RecordDecisionInput {
  title: string;
  decision: string;
  rationale: string;
  project?: string;
  source?: string;
  links?: string[];
  attachmentIds?: string[];
  linkAttachments?: Array<{ name: string; url: string }>;
}

export interface RoomDecision
  extends Omit<RecordDecisionInput, "attachmentIds" | "linkAttachments"> {
  id: string;
  time: string;
  attachments?: AttachmentRef[];
}

export interface RoomStatus {
  roomDir: string;
  messages: number;
  tasks: Record<TaskStatus, number>;
  decisions: number;
  agents: number;
  unread: Record<AgentId, number>;
}

export const DEFAULT_CURRENT_USER = "user";

export interface RoomConfig {
  staleTaskHours: number;
  currentUser: string;
  enforceProtocol: boolean;
  activeProject?: string;
}

export interface UpdateConfigInput {
  staleTaskHours?: number;
  currentUser?: string;
  enforceProtocol?: boolean;
  activeProject?: string | null;
}

export function resolveWriteProject(
  config: RoomConfig,
  viewProject: string
): string | undefined {
  if (config.activeProject) return config.activeProject;
  if (viewProject === "all" || viewProject === "unsorted") return undefined;
  return viewProject;
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
    validateText("status", input.status);
    validateText("next", input.next);
    validateText("phase", input.phase);

    const body = enrichMessageBody(input.body, {
      status: input.status,
      next: input.next,
      phase: input.phase
    });
    const compliance = assessProtocolCompliance({
      from: input.from,
      body,
      status: input.status,
      next: input.next,
      phase: input.phase
    });

    return this.withExclusiveWrite(async () => {
      const messages = await this.readJsonl<RoomMessage>("messages.jsonl");
      const attachments = await this.resolveAttachmentRefs(input.attachmentIds, input.links);
      const message: RoomMessage = {
        from: input.from,
        to: input.to,
        topic: input.topic,
        body,
        project: input.project,
        source: input.source,
        replyTo: input.replyTo,
        status: compliance.status,
        next: compliance.next,
        phase: compliance.phase,
        id: nextId(messages.length + 1),
        time: now(),
        ...(attachments?.length ? { attachments } : {})
      };

      await appendFile(this.path("messages.jsonl"), `${JSON.stringify(message)}\n`, "utf8");
      return message;
    });
  }

  async uploadAttachment(input: UploadAttachmentInput): Promise<AttachmentRef> {
    validateText("fileName", input.fileName);
    validateText("mimeType", input.mimeType);
    validateText("uploadedBy", input.uploadedBy);
    const mimeType = input.mimeType.trim().toLowerCase();
    if (!isAllowedMimeType(mimeType)) {
      throw new Error(`mimeType not allowed: ${input.mimeType}`);
    }
    const safeName = sanitizeAttachmentFileName(input.fileName);
    const content = decodeAttachmentContent(input.contentBase64);

    return this.withExclusiveWrite(async () => {
      const records = await this.readAttachments();
      const id = nextAttachmentId(records.length + 1);
      const fileName = `${id}-${safeName}`;
      await mkdir(this.attachmentsDir(), { recursive: true });
      await writeFile(join(this.attachmentsDir(), fileName), content);
      const stored: StoredAttachment = {
        id,
        name: safeName,
        mimeType,
        size: content.length,
        fileName,
        uploadedBy: input.uploadedBy,
        uploadedAt: now(),
        kind: "file"
      };
      records.push(stored);
      await this.writeAttachments(records);
      return toAttachmentRef(stored);
    });
  }

  async linkAttachment(input: LinkAttachmentInput): Promise<AttachmentRef> {
    validateText("name", input.name);
    validateText("uploadedBy", input.uploadedBy);
    const url = validateLinkUrl(input.url);
    const name = input.name.trim() || url;

    return this.withExclusiveWrite(async () => {
      const records = await this.readAttachments();
      const id = nextAttachmentId(records.length + 1);
      const stored: StoredAttachment = {
        id,
        name,
        mimeType: "text/uri-list",
        size: 0,
        uploadedBy: input.uploadedBy,
        uploadedAt: now(),
        kind: "link",
        url
      };
      records.push(stored);
      await this.writeAttachments(records);
      return toAttachmentRef(stored);
    });
  }

  async getAttachment(id: string): Promise<StoredAttachment | undefined> {
    const records = await this.readAttachments();
    return records.find((record) => record.id === id);
  }

  async readAttachmentFile(id: string): Promise<{ stored: StoredAttachment; content: Buffer }> {
    const stored = await this.getAttachment(id);
    if (!stored || stored.kind !== "file" || !stored.fileName) {
      throw new Error(`Attachment not found: ${id}`);
    }
    const content = await readFile(join(this.attachmentsDir(), stored.fileName));
    return { stored, content };
  }

  async listAttachments(): Promise<AttachmentRef[]> {
    const records = await this.readAttachments();
    return records.map(toAttachmentRef);
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
    const staleMessages = await this.listStaleMessages({
      project: input.project,
      olderThanHours: config.staleTaskHours
    });
    const staleDecisions = await this.listStaleDecisions({
      project: input.project,
      olderThanHours: config.staleTaskHours
    });
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
      staleMessages,
      staleDecisions,
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
      const attachments = await this.resolveAttachmentRefs(input.attachmentIds, input.links);
      const time = now();
      const task: RoomTask = {
        title: input.title,
        body: input.body,
        owner: input.owner,
        project: input.project,
        source: input.source,
        id: `task-${nextId(tasks.length + 1)}`,
        status: input.owner ? "claimed" : "open",
        createdAt: time,
        updatedAt: time,
        notes: [],
        ...(attachments?.length ? { attachments } : {})
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

  async listStaleMessages(input: ListStaleTasksInput = {}): Promise<StaleItemWarning[]> {
    const messages = await this.listMessages();
    return buildStaleItemWarnings(
      messages,
      (message) => message.time,
      (message) => message.topic,
      "message",
      input.olderThanHours ?? STALE_TASK_AFTER_HOURS,
      { project: input.project, now: input.now }
    );
  }

  async listStaleDecisions(input: ListStaleTasksInput = {}): Promise<StaleItemWarning[]> {
    const decisions = await this.readDecisions();
    return buildStaleItemWarnings(
      decisions,
      (decision) => decision.time,
      (decision) => decision.title,
      "decision",
      input.olderThanHours ?? STALE_TASK_AFTER_HOURS,
      { project: input.project, now: input.now }
    );
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
    const currentUser =
      typeof config.currentUser === "string" && config.currentUser.trim()
        ? config.currentUser.trim()
        : DEFAULT_CURRENT_USER;
    const activeProject =
      typeof config.activeProject === "string" && config.activeProject.trim()
        ? config.activeProject.trim()
        : undefined;

    return {
      staleTaskHours: config.staleTaskHours ?? STALE_TASK_AFTER_HOURS,
      currentUser,
      enforceProtocol: config.enforceProtocol === true,
      activeProject
    };
  }

  async updateConfig(input: UpdateConfigInput): Promise<RoomConfig> {
    const current = await this.getConfig();
    const next: RoomConfig = { ...current };
    if (input.staleTaskHours !== undefined) next.staleTaskHours = input.staleTaskHours;
    if (input.currentUser !== undefined) {
      validateText("currentUser", input.currentUser);
      const trimmed = input.currentUser.trim();
      next.currentUser = trimmed || DEFAULT_CURRENT_USER;
    }
    if (input.enforceProtocol !== undefined) next.enforceProtocol = input.enforceProtocol;
    if (input.activeProject !== undefined) {
      if (input.activeProject === null || input.activeProject.trim() === "") {
        delete next.activeProject;
      } else {
        validateText("activeProject", input.activeProject);
        next.activeProject = input.activeProject.trim();
      }
    }
    validatePositiveInteger("staleTaskHours", next.staleTaskHours);
    validateText("currentUser", next.currentUser);
    validateText("activeProject", next.activeProject);

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

  async deleteProject(input: DeleteProjectInput): Promise<RoomProject> {
    validateText("id", input.id);

    return this.withExclusiveWrite(async () => {
      const projects = await this.readProjects();
      const index = projects.findIndex((project) => project.id === input.id);
      if (index < 0) throw new Error(`Project not found: ${input.id}`);
      const [project] = projects.splice(index, 1);
      await this.writeProjects(projects);
      return project;
    });
  }

  async updateTask(input: UpdateTaskInput): Promise<RoomTask> {
    validateText("owner", input.owner);
    validateText("note", input.note);
    validateText("branch", input.branch);
    validateText("commit", input.commit);
    validateText("by", input.by);

    return this.withExclusiveWrite(async () => {
      const tasks = await this.readTasks();
      const task = findTask(tasks, input.taskId);
      task.status = input.status;
      if (input.owner !== undefined) task.owner = input.owner;
      task.updatedAt = now();
      if (input.note) {
        const attachments = await this.resolveAttachmentRefs(input.attachmentIds, input.links);
        task.notes.push(
          buildTaskNote({
            at: task.updatedAt,
            by: input.by ?? "system",
            body: input.note,
            branch: input.branch,
            commit: input.commit,
            attachments
          })
        );
      }
      await this.writeTasks(tasks);
      return task;
    });
  }

  async appendTaskNote(input: AppendTaskNoteInput): Promise<RoomTask> {
    validateText("body", input.body);
    validateText("branch", input.branch);
    validateText("commit", input.commit);
    validateText("by", input.by);

    return this.withExclusiveWrite(async () => {
      const tasks = await this.readTasks();
      const task = findTask(tasks, input.taskId);
      const attachments = await this.resolveAttachmentRefs(input.attachmentIds, input.links);
      task.updatedAt = now();
      task.notes.push(
        buildTaskNote({
          at: task.updatedAt,
          by: input.by ?? "system",
          body: input.body,
          branch: input.branch,
          commit: input.commit,
          attachments
        })
      );
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
      const linkRows = [
        ...(input.linkAttachments ?? []),
        ...(input.links?.flatMap((url) => {
          try {
            return [{ name: url, url: validateLinkUrl(url) }];
          } catch {
            return [];
          }
        }) ?? [])
      ];
      const attachments = await this.resolveAttachmentRefs(input.attachmentIds, linkRows);
      const decision: RoomDecision = {
        title: input.title,
        decision: input.decision,
        rationale: input.rationale,
        project: input.project,
        source: input.source,
        links: input.links,
        id: `decision-${nextId(decisions.length + 1)}`,
        time: now(),
        ...(attachments?.length ? { attachments } : {})
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

  private attachmentsDir(): string {
    return join(this.roomDir, "attachments");
  }

  private async readAttachments(): Promise<StoredAttachment[]> {
    return this.readJson<StoredAttachment[]>("attachments.json", []);
  }

  private async writeAttachments(records: StoredAttachment[]): Promise<void> {
    await this.writeJsonAtomic("attachments.json", records);
  }

  private async resolveAttachmentRefs(
    attachmentIds?: string[],
    links?: Array<{ name: string; url: string }>
  ): Promise<AttachmentRef[] | undefined> {
    const ids = attachmentIds?.map((id) => id.trim()).filter(Boolean) ?? [];
    const linkRows = links?.filter((link) => link.url.trim()) ?? [];
    if (!ids.length && !linkRows.length) return undefined;

    const records = await this.readAttachments();
    const byId = new Map(records.map((record) => [record.id, record]));
    const resolved: AttachmentRef[] = [];

    for (const id of ids) {
      const stored = byId.get(id);
      if (!stored) throw new Error(`Attachment not found: ${id}`);
      resolved.push(toAttachmentRef(stored));
    }

    for (const link of linkRows) {
      validateText("attachment name", link.name);
      resolved.push(inlineLinkRef(link.name, link.url));
    }

    return resolved;
  }

  private async ensureRoom(): Promise<void> {
    await mkdir(this.roomDir, { recursive: true });
    await mkdir(this.attachmentsDir(), { recursive: true });
    await ensureFile(this.path("messages.jsonl"), "");
    await ensureFile(this.path("tasks.json"), "[]\n");
    await ensureFile(this.path("decisions.json"), "[]\n");
    await ensureFile(this.path("decisions.md"), "# Agent Room Decisions\n\n");
    await ensureFile(this.path("agents.json"), "[]\n");
    await ensureFile(this.path("projects.json"), "[]\n");
    await ensureFile(this.path("config.json"), "{}\n");
    await ensureFile(this.path("attachments.json"), "[]\n");
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

function buildTaskNote(input: {
  at: string;
  by: AgentId | "system";
  body: string;
  branch?: string;
  commit?: string;
  attachments?: AttachmentRef[];
}): TaskNote {
  const note: TaskNote = {
    at: input.at,
    by: input.by,
    body: input.body
  };
  if (input.branch) note.branch = input.branch;
  if (input.commit) note.commit = input.commit;
  if (input.attachments?.length) note.attachments = input.attachments;
  return note;
}

function nextAttachmentId(index: number): string {
  return `att-${nextId(index)}`;
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
  const attachments = decision.attachments?.length
    ? `\nAttachments:\n${decision.attachments.map((item) => `- ${item.name}: ${item.url}`).join("\n")}\n`
    : "";

  return `## ${decision.id} - ${decision.title}

Time: ${decision.time}

Decision:
${decision.decision}

Rationale:
${decision.rationale}
${links}${attachments}
`;
}
