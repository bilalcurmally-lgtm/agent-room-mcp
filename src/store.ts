import { appendFile, mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
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
import { AGENT_ALIASES, messageTargetsAgent } from "./routing.js";
import { buildStaleItemWarnings, type StaleItemWarning } from "./temporal.js";
import { createRoomTime, type RoomTime } from "./time.js";

export type { AttachmentRef, StoredAttachment, UploadAttachmentInput, LinkAttachmentInput } from "./attachments.js";

export const MAX_TEXT_LENGTH = 100_000;
export const STALE_TASK_AFTER_HOURS = 24;
// Cap a check_in inbox so a brand-new agent does not get the entire room history
// dumped into its context on first contact. unreadCount still reports the true total.
export const DEFAULT_INBOX_LIMIT = 50;

// Cap the stale-item nudges returned by check_in. Without this, every message,
// task, and decision older than the threshold floods the response (a busy room
// can surface 50+ ancient "re-check this" notices). We keep the most recently
// gone-stale items, which are the actionable ones; the *Count fields report the
// true totals so nothing is silently hidden.
export const DEFAULT_STALE_LIMIT = 5;
export const DEFAULT_COMPACT_INBOX_LIMIT = 10;
export const DEFAULT_SEARCH_LIMIT = 10;
export const DEFAULT_COMPACT_DECISION_LIMIT = 3;
export const DEFAULT_COMPACT_TEXT_LIMIT = 320;

export type AgentId = string;
export type TaskStatus = "open" | "claimed" | "blocked" | "done";

export interface PostMessageInput {
  from: AgentId;
  to: AgentId | "all";
  mentions?: AgentId[];
  unresolvedMentions?: string[];
  topic: string;
  body: string;
  project?: string;
  source?: string;
  replyTo?: string;
  /** Message kind marker; "ack" = handoff receipt confirmation (P3-01). */
  type?: string;
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
  limit?: number;
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
  evidence?: TaskEvidence;
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
  capabilities?: string[];
}

export type AgentStatusState = "working" | "idle" | "blocked";

export interface AgentStatus {
  state: AgentStatusState;
  detail?: string;
  at: string;
}

export interface RoomAgent {
  id: AgentId;
  displayName?: string;
  role?: string;
  capabilities?: string[];
  status?: AgentStatus;
  /** Bumped on any tool call by this agent; drives live/stale/offline presence. */
  lastSeenAt?: string;
  lastReadMessageId?: string;
  registeredAt: string;
  updatedAt: string;
}

export const PRESENCE_LIVE_MS = 2 * 60 * 1000;
export const PRESENCE_STALE_MS = 30 * 60 * 1000;

export function presenceState(lastSeenAt: string | undefined, nowMs: number): "live" | "stale" | "offline" {
  const seen = lastSeenAt ? Date.parse(lastSeenAt) : Number.NaN;
  if (!Number.isFinite(seen)) return "offline";
  const age = nowMs - seen;
  if (age < PRESENCE_LIVE_MS) return "live";
  if (age < PRESENCE_STALE_MS) return "stale";
  return "offline";
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
  project?: string;
}

export interface CheckInInput {
  agent: AgentId;
  project?: string;
  includeBroadcasts?: boolean;
  limit?: number;
}

export interface CompactCheckInInput extends CheckInInput {
  decisionLimit?: number;
  textLimit?: number;
}

export interface CompactRoomMessage {
  id: string;
  time: string;
  from: AgentId;
  to: AgentId | "all";
  topic: string;
  preview: string;
  bodyLength: number;
  /** Present (true) only when the preview is truncated; fetch the rest with read_message. */
  fullBodyAvailable?: boolean;
  project?: string;
  status?: string;
  next?: string;
  phase?: string;
  replyTo?: string;
}

export interface CompactTask {
  id: string;
  title: string;
  status: TaskStatus;
  updatedAt: string;
  owner?: AgentId;
  project?: string;
}

export interface CompactDecision {
  id: string;
  title: string;
  decision: string;
  time: string;
  project?: string;
}

export interface CompactAgentCheckIn {
  agent: Pick<RoomAgent, "id" | "displayName" | "role" | "capabilities" | "status" | "lastReadMessageId">;
  roomTime: RoomTime;
  projectRecord?: RoomProject;
  unread: {
    count: number;
    returned: number;
    latestId?: string;
    messages: CompactRoomMessage[];
  };
  tasks: {
    assigned: CompactTask[];
    open: CompactTask[];
  };
  alerts: {
    staleTaskCount: number;
    staleMessageCount: number;
    staleDecisionCount: number;
  };
  decisions: CompactDecision[];
  status: Pick<RoomStatus, "roomDir" | "messages" | "tasks" | "decisions" | "agents">;
  contextBudget: {
    mode: "compact";
    guidance: string;
  };
}

export interface AgentCheckIn {
  agent: RoomAgent;
  roomTime: RoomTime;
  projectRecord?: RoomProject;
  unreadMessages: RoomMessage[];
  unreadCount: number;
  assignedTasks: RoomTask[];
  openTasks: RoomTask[];
  staleTasks: StaleTaskWarning[];
  staleMessages: StaleItemWarning[];
  staleDecisions: StaleItemWarning[];
  // True totals before the DEFAULT_STALE_LIMIT cap, so a caller knows how many
  // stale items exist even though only the most recent few are listed.
  staleTaskCount: number;
  staleMessageCount: number;
  staleDecisionCount: number;
  recentDecisions: RoomDecision[];
  status: RoomStatus;
}

export type { StaleItemWarning };

export interface SearchMessagesInput {
  keyword?: string;
  project?: string;
  from?: AgentId;
  to?: AgentId | "all";
  afterId?: string;
  limit?: number;
}

export interface SearchMessagesResult {
  items: CompactRoomMessage[];
  total: number;
  truncated: boolean;
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

/**
 * Machine-checkable proof for completing a task: a reference to a room message,
 * an index into the task's own notes, or an attachment. The store validates the
 * reference exists — an agent literally cannot record a completion that points
 * at nothing.
 */
export interface TaskEvidence {
  messageId?: string;
  noteIndex?: number;
  attachmentId?: string;
}

export interface UpdateTaskInput {
  taskId: string;
  status: TaskStatus;
  owner?: AgentId;
  note?: string;
  branch?: string;
  commit?: string;
  by?: AgentId;
  evidence?: TaskEvidence;
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
  /** Id of an earlier decision this one replaces; must exist (P3-07). */
  supersedes?: string;
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
  /** When true (default), marking a task done requires a validated evidence reference. */
  requireEvidence: boolean;
  /** Mention alias map (token → agent id); defaults to AGENT_ALIASES from routing. */
  agentAliases: Record<string, string>;
  activeProject?: string;
}

export interface UpdateConfigInput {
  staleTaskHours?: number;
  currentUser?: string;
  enforceProtocol?: boolean;
  requireEvidence?: boolean;
  agentAliases?: Record<string, string>;
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

export function resolveRoomProject(
  config: RoomConfig,
  project: string | undefined
): string | undefined {
  if (project === "all") return undefined;
  if (project !== undefined) return project;
  return config.activeProject;
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
      const attachments = await this.resolveAttachmentRefs(input.attachmentIds, input.links);
      const message: RoomMessage = {
        from: input.from,
        to: input.to,
        ...(input.mentions?.length ? { mentions: input.mentions } : {}),
        ...(input.unresolvedMentions?.length ? { unresolvedMentions: input.unresolvedMentions } : {}),
        topic: input.topic,
        body,
        project: input.project,
        source: input.source,
        replyTo: input.replyTo,
        ...(input.type ? { type: input.type } : {}),
        status: compliance.status,
        next: compliance.next,
        phase: compliance.phase,
        id: await this.nextPersistentMessageId(),
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
    return filterVisibleMessages(messages, input, input.limit);
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
        if (input.capabilities !== undefined) existing.capabilities = input.capabilities;
        existing.updatedAt = time;
        existing.lastSeenAt = time;
        await this.writeAgents(agents);
        return existing;
      }

      const agent: RoomAgent = {
        id: input.agent,
        displayName: input.displayName,
        role: input.role,
        ...(input.capabilities !== undefined ? { capabilities: input.capabilities } : {}),
        lastSeenAt: time,
        registeredAt: time,
        updatedAt: time
      };

      agents.push(agent);
      await this.writeAgents(agents);
      return agent;
    });
  }

  async setStatus(input: { agent: AgentId; status: AgentStatusState; detail?: string }): Promise<RoomAgent> {
    validateText("agent", input.agent);
    validateText("detail", input.detail);
    if (!["working", "idle", "blocked"].includes(input.status)) {
      throw new Error(`status must be working, idle, or blocked (got "${input.status}").`);
    }

    return this.withExclusiveWrite(async () => {
      const agents = await this.readAgents();
      let agent = agents.find((candidate) => candidate.id === input.agent);
      const time = now();
      if (!agent) {
        agent = { id: input.agent, registeredAt: time, updatedAt: time };
        agents.push(agent);
      }
      agent.status = { state: input.status, ...(input.detail ? { detail: input.detail } : {}), at: time };
      agent.lastSeenAt = time;
      agent.updatedAt = time;
      await this.writeAgents(agents);
      return agent;
    });
  }

  // Heartbeat: any tool call by an agent bumps lastSeenAt. Unknown agents are a
  // no-op — presence tracking must never make another tool call fail.
  async touchAgent(agentId: AgentId): Promise<void> {
    if (!agentId) return;
    await this.withExclusiveWrite(async () => {
      const agents = await this.readAgents();
      const agent = agents.find((candidate) => candidate.id === agentId);
      if (!agent) return;
      agent.lastSeenAt = now();
      await this.writeAgents(agents);
    });
  }

  async markMessagesRead(input: MarkMessagesReadInput): Promise<RoomAgent> {
    validateText("agent", input.agent);
    validateText("throughId", input.throughId);

    return this.withExclusiveWrite(async () => {
      const agents = await this.readAgents();
      const agent = findAgent(agents, input.agent);
      const messages = await this.readMessages({
        agent: input.agent,
        includeBroadcasts: input.includeBroadcasts,
        project: input.project
      });
      const latestVisibleId = messages.at(-1)?.id;
      agent.lastReadMessageId = input.throughId ?? latestVisibleId ?? agent.lastReadMessageId;
      agent.updatedAt = now();
      agent.lastSeenAt = agent.updatedAt;
      await this.writeAgents(agents);
      return agent;
    });
  }

  // On-demand pull for one full message body after a compact preview.
  async readMessage(id: string): Promise<RoomMessage> {
    validateText("id", id);
    const messages = await this.readJsonl<RoomMessage>("messages.jsonl");
    const found = messages.find((message) => message.id === id);
    if (!found) {
      throw new Error(`No message with id ${id}. Ids are zero-padded strings like "000042".`);
    }
    return found;
  }

  // Plain case-insensitive substring search over topic+body — boring and
  // auditable on purpose. Returns previews; pull full bodies via readMessage.
  async searchMessages(input: SearchMessagesInput): Promise<SearchMessagesResult> {
    validateText("keyword", input.keyword);
    validateText("project", input.project);
    validateText("from", input.from);
    validateText("to", input.to);

    const keyword = input.keyword?.toLowerCase();
    const afterValue = input.afterId ? messageIdValue(input.afterId) : undefined;
    const messages = await this.readJsonl<RoomMessage>("messages.jsonl");
    const matches = messages.filter((message) => {
      if (input.project && !matchesProject(message, input.project)) return false;
      if (input.from && message.from !== input.from) return false;
      if (input.to && message.to !== input.to) return false;
      if (afterValue !== undefined && messageIdValue(message.id) <= afterValue) return false;
      if (keyword && !`${message.topic}\n${message.body}`.toLowerCase().includes(keyword)) return false;
      return true;
    });

    const limit = input.limit ?? DEFAULT_SEARCH_LIMIT;
    const recent = matches.length > limit ? matches.slice(matches.length - limit) : matches;
    return {
      items: recent.map((message) => compactMessage(message, DEFAULT_COMPACT_TEXT_LIMIT)),
      total: matches.length,
      truncated: recent.length < matches.length
    };
  }

  // A handoff is not "received" until the receiving agent acks it with a
  // reference (P3-01). The ack is itself an auditable room message.
  async confirmHandoff(input: { messageId: string; agent: AgentId }): Promise<RoomMessage> {
    validateText("agent", input.agent);
    const original = await this.readMessage(input.messageId);
    if (original.from === input.agent) {
      throw new Error(`Agent "${input.agent}" cannot confirm receipt of its own message ${input.messageId}.`);
    }
    return this.postMessage({
      from: input.agent,
      to: original.from,
      replyTo: original.id,
      type: "ack",
      topic: `ACK: ${original.topic}`,
      body: `${input.agent} confirms receipt of ${original.id} (${original.topic}).`,
      project: original.project,
      source: "confirm_handoff"
    });
  }

  async checkIn(input: CheckInInput): Promise<AgentCheckIn> {
    validateText("agent", input.agent);
    validateText("project", input.project);

    const agents = await this.readAgents();
    const agent = agents.find((candidate) => candidate.id === input.agent)
      ?? (await this.registerAgent({ agent: input.agent }));

    const allUnread = await this.readMessages({
      agent: input.agent,
      sinceId: agent.lastReadMessageId,
      includeBroadcasts: input.includeBroadcasts,
      project: input.project
    });
    const inboxLimit = input.limit ?? DEFAULT_INBOX_LIMIT;
    const unreadMessages =
      inboxLimit >= 0 && allUnread.length > inboxLimit
        ? allUnread.slice(allUnread.length - inboxLimit)
        : allUnread;

    const assignedTasks = await this.listTasks({ owner: input.agent, project: input.project });
    const openTasks = await this.listTasks({ status: "open", project: input.project });
    const config = await this.getConfig();
    const allStaleTasks = await this.listStaleTasks({ project: input.project, olderThanHours: config.staleTaskHours });
    const allStaleMessages = await this.listStaleMessages({
      project: input.project,
      olderThanHours: config.staleTaskHours
    });
    const allStaleDecisions = await this.listStaleDecisions({
      project: input.project,
      olderThanHours: config.staleTaskHours
    });
    const staleTasks = mostRecentStale(allStaleTasks, DEFAULT_STALE_LIMIT);
    const staleMessages = mostRecentStale(allStaleMessages, DEFAULT_STALE_LIMIT);
    const staleDecisions = mostRecentStale(allStaleDecisions, DEFAULT_STALE_LIMIT);
    const decisions = await this.readDecisions();
    const projectRecord = input.project
      ? (await this.readProjects()).find((project) => project.id === input.project)
      : undefined;

    return {
      agent,
      roomTime: createRoomTime(),
      projectRecord,
      unreadMessages,
      unreadCount: allUnread.length,
      assignedTasks,
      openTasks,
      staleTasks,
      staleMessages,
      staleDecisions,
      staleTaskCount: allStaleTasks.length,
      staleMessageCount: allStaleMessages.length,
      staleDecisionCount: allStaleDecisions.length,
      recentDecisions: decisions.filter((decision) => matchesProject(decision, input.project)),
      status: await this.getRoomStatus()
    };
  }

  async checkInCompact(input: CompactCheckInInput): Promise<CompactAgentCheckIn> {
    validateText("agent", input.agent);
    validateText("project", input.project);

    const agents = await this.readAgents();
    const agent = agents.find((candidate) => candidate.id === input.agent)
      ?? (await this.registerAgent({ agent: input.agent }));
    const allUnread = await this.readMessages({
      agent: input.agent,
      sinceId: agent.lastReadMessageId,
      includeBroadcasts: input.includeBroadcasts,
      project: input.project
    });
    const inboxLimit = input.limit ?? DEFAULT_COMPACT_INBOX_LIMIT;
    const textLimit = input.textLimit ?? DEFAULT_COMPACT_TEXT_LIMIT;
    const unreadMessages =
      inboxLimit >= 0 && allUnread.length > inboxLimit
        ? allUnread.slice(allUnread.length - inboxLimit)
        : allUnread;
    const assignedTasks = await this.listTasks({ owner: input.agent, project: input.project });
    const openTasks = await this.listTasks({ status: "open", project: input.project });
    const config = await this.getConfig();
    const [allStaleTasks, allStaleMessages, allStaleDecisions, decisions, status] = await Promise.all([
      this.listStaleTasks({ project: input.project, olderThanHours: config.staleTaskHours }),
      this.listStaleMessages({ project: input.project, olderThanHours: config.staleTaskHours }),
      this.listStaleDecisions({ project: input.project, olderThanHours: config.staleTaskHours }),
      this.readDecisions(),
      this.getRoomStatus()
    ]);
    const projectRecord = input.project
      ? (await this.readProjects()).find((project) => project.id === input.project)
      : undefined;
    const decisionLimit = input.decisionLimit ?? DEFAULT_COMPACT_DECISION_LIMIT;

    return {
      agent: {
        id: agent.id,
        displayName: agent.displayName,
        role: agent.role,
        capabilities: agent.capabilities,
        status: agent.status,
        lastReadMessageId: agent.lastReadMessageId
      },
      roomTime: createRoomTime(),
      projectRecord,
      unread: {
        count: allUnread.length,
        returned: unreadMessages.length,
        latestId: allUnread.at(-1)?.id,
        messages: unreadMessages.map((message) => compactMessage(message, textLimit))
      },
      tasks: {
        assigned: assignedTasks.filter((task) => task.status !== "done").map(compactTask),
        open: openTasks.map(compactTask)
      },
      alerts: {
        staleTaskCount: allStaleTasks.length,
        staleMessageCount: allStaleMessages.length,
        staleDecisionCount: allStaleDecisions.length
      },
      decisions: excludeSuperseded(decisions)
        .filter((decision) => matchesProject(decision, input.project))
        .slice(-decisionLimit)
        .map(compactDecision),
      status: {
        roomDir: status.roomDir,
        messages: status.messages,
        tasks: status.tasks,
        decisions: status.decisions,
        agents: status.agents
      },
      contextBudget: {
        mode: "compact",
        guidance:
          "Wake turns should start here. Use read_messages/check_in only when the compact delta is insufficient."
      }
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

  async listStaleMessages(
    input: ListStaleTasksInput = {},
    preloaded?: RoomMessage[]
  ): Promise<StaleItemWarning[]> {
    const messages = preloaded ?? (await this.listMessages());
    return buildStaleItemWarnings(
      messages,
      (message) => message.time,
      (message) => message.topic,
      "message",
      input.olderThanHours ?? STALE_TASK_AFTER_HOURS,
      { project: input.project, now: input.now }
    );
  }

  async listStaleDecisions(
    input: ListStaleTasksInput = {},
    preloaded?: RoomDecision[]
  ): Promise<StaleItemWarning[]> {
    const decisions = preloaded ?? (await this.readDecisions());
    return buildStaleItemWarnings(
      decisions,
      (decision) => decision.time,
      (decision) => decision.title,
      "decision",
      input.olderThanHours ?? STALE_TASK_AFTER_HOURS,
      { project: input.project, now: input.now }
    );
  }

  async listStaleTasks(
    input: ListStaleTasksInput = {},
    preloaded?: RoomTask[]
  ): Promise<StaleTaskWarning[]> {
    const nowTime = (input.now ?? new Date()).getTime();
    const threshold = input.olderThanHours ?? STALE_TASK_AFTER_HOURS;
    const tasks = preloaded ?? (await this.readTasks());

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
      requireEvidence: config.requireEvidence !== false,
      agentAliases:
        config.agentAliases && typeof config.agentAliases === "object"
          ? config.agentAliases
          : AGENT_ALIASES,
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
    if (input.requireEvidence !== undefined) next.requireEvidence = input.requireEvidence;
    if (input.agentAliases !== undefined) next.agentAliases = input.agentAliases;
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
      if (input.status === "done") {
        const config = await this.getConfig();
        await this.validateTaskEvidence(task, input.evidence, config.requireEvidence);
        if (input.evidence) task.evidence = input.evidence;
      }
      await this.writeTasks(tasks);
      return task;
    });
  }

  // The anti-fabrication rule (P3-01): "done" must point at proof that exists.
  // Throws before anything is written, so a rejected completion changes nothing.
  private async validateTaskEvidence(
    task: RoomTask,
    evidence: TaskEvidence | undefined,
    required: boolean
  ): Promise<void> {
    const hasReference =
      evidence !== undefined &&
      (evidence.messageId !== undefined || evidence.noteIndex !== undefined || evidence.attachmentId !== undefined);

    if (!hasReference) {
      if (!required) return;
      throw new Error(
        "Marking a task done requires evidence: pass evidence with a messageId, noteIndex, or attachmentId that exists in the room. Set requireEvidence: false in the room config to disable."
      );
    }

    if (evidence.messageId !== undefined) {
      const messages = await this.readJsonl<RoomMessage>("messages.jsonl");
      if (!messages.some((message) => message.id === evidence.messageId)) {
        throw new Error(`Evidence messageId "${evidence.messageId}" does not exist in this room.`);
      }
    }
    if (evidence.noteIndex !== undefined) {
      if (!Number.isInteger(evidence.noteIndex) || evidence.noteIndex < 0 || evidence.noteIndex >= task.notes.length) {
        throw new Error(
          `Evidence noteIndex ${evidence.noteIndex} is out of range: task ${task.id} has ${task.notes.length} note(s).`
        );
      }
    }
    if (evidence.attachmentId !== undefined) {
      await this.resolveAttachmentRefs([evidence.attachmentId], undefined);
    }
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
      if (input.supersedes !== undefined && !decisions.some((decision) => decision.id === input.supersedes)) {
        throw new Error(`Cannot supersede "${input.supersedes}": no such decision exists in this room.`);
      }
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
        ...(input.supersedes !== undefined ? { supersedes: input.supersedes } : {}),
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

  // P3-03: "what happened while I was away" as a deterministic markdown rollup —
  // counts, decision titles, task states, unanswered direct mentions. No LLM call,
  // so the digest is auditable and snapshot-testable.
  async generateDigest(input: { project: string; since?: string; now?: Date }): Promise<{ path: string; markdown: string }> {
    validateText("project", input.project);
    validateText("since", input.since);
    const sinceMs = input.since ? Date.parse(input.since) : undefined;
    const inWindow = (time?: string) =>
      sinceMs === undefined || (time !== undefined && Date.parse(time) >= sinceMs);

    const allMessages = await this.readJsonl<RoomMessage>("messages.jsonl");
    const messages = allMessages.filter((m) => matchesProject(m, input.project) && inWindow(m.time));
    const tasks = (await this.readTasks()).filter((t) => matchesProject(t, input.project) && inWindow(t.updatedAt));
    const decisions = (await this.readDecisions()).filter((d) => matchesProject(d, input.project) && inWindow(d.time));

    const agents = [...new Set(messages.map((m) => m.from))].sort();
    const replied = new Set(allMessages.map((m) => m.replyTo).filter(Boolean));
    const openQuestions = messages
      .filter((m) => m.to !== "all" && m.type !== "ack" && !replied.has(m.id))
      .slice(-5);
    const activeDecisions = excludeSuperseded(decisions);
    const taskCounts: Record<TaskStatus, number> = { open: 0, claimed: 0, blocked: 0, done: 0 };
    for (const task of tasks) taskCounts[task.status] += 1;

    const date = (input.now ?? new Date()).toISOString().slice(0, 10);
    const plural = (count: number) => (count === 1 ? "" : "s");
    const lines = [
      `# Digest: ${input.project} — ${date}`,
      "",
      "## Activity",
      `${messages.length} message${plural(messages.length)} from ${agents.length} agent${plural(agents.length)}` +
        `${agents.length ? ` (${agents.join(", ")})` : ""}${input.since ? ` since ${input.since}` : ""}.`,
      "",
      "## Decisions",
      ...(activeDecisions.length
        ? activeDecisions.slice(-10).map((d) => `- ${d.id} — ${d.title}`)
        : ["- none recorded"]),
      ...(decisions.length > activeDecisions.length
        ? [`- (${decisions.length - activeDecisions.length} superseded entr${decisions.length - activeDecisions.length === 1 ? "y" : "ies"} omitted)`]
        : []),
      "",
      "## Tasks",
      `${taskCounts.open} open · ${taskCounts.claimed} claimed · ${taskCounts.blocked} blocked · ${taskCounts.done} done.`,
      ...tasks.slice(-10).map((t) => `- ${t.id} ${t.title} — ${t.status}${t.owner ? ` (${t.owner})` : ""}`),
      "",
      "## Open questions",
      ...(openQuestions.length
        ? openQuestions.map((m) => `- [${m.id}] ${m.from} -> ${m.to}: ${m.topic}`)
        : ["- none"]),
      ""
    ];
    const markdown = lines.join("\n");

    const digestDir = this.path("digests");
    await mkdir(digestDir, { recursive: true });
    const safeProject = input.project.replace(/[^A-Za-z0-9_.-]/g, "-");
    const path = join(digestDir, `${safeProject}-${date}.md`);
    await writeFile(path, markdown, "utf8");
    return { path, markdown };
  }

  async getRoomStatus(preloaded?: {
    messages: RoomMessage[];
    tasks: RoomTask[];
    decisions: RoomDecision[];
    agents: RoomAgent[];
  }): Promise<RoomStatus> {
    const state = preloaded ?? (await this.readState());
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

  // Issues the next message id from message-counter.json instead of re-reading the
  // whole log on every post. Only call while holding the room write lock. Ids keep
  // counting across archive/truncation of messages.jsonl; a missing or invalid
  // counter file is rebuilt from the highest id still in the log.
  private async nextPersistentMessageId(): Promise<string> {
    const counterPath = this.path("message-counter.json");
    let last: number | undefined;
    try {
      const parsed = JSON.parse(await readFile(counterPath, "utf8")) as { lastId?: unknown };
      if (typeof parsed.lastId === "number" && Number.isInteger(parsed.lastId) && parsed.lastId >= 0) {
        last = parsed.lastId;
      }
    } catch {
      // Fall through to rebuilding from the message log.
    }
    if (last === undefined) {
      const messages = await this.readJsonl<RoomMessage>("messages.jsonl");
      last = messages.reduce((max, message) => Math.max(max, messageIdValue(message.id)), 0);
    }
    const next = last + 1;
    await writeFile(counterPath, `${JSON.stringify({ lastId: next })}\n`, "utf8");
    return nextId(next);
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
      .flatMap((line, index) => {
        try {
          return [JSON.parse(line) as T];
        } catch (error) {
          // Quarantine a single corrupt line instead of bricking every read for
          // every agent (check_in, read_messages, dashboard). Log it, skip it,
          // and keep serving the rest of the room. A truncated/fat-fingered
          // append no longer takes the whole room offline.
          console.warn(storageLineSkipWarning(`${fileName} line ${index + 1}`, error));
          return [] as T[];
        }
      });
  }

  private path(fileName: string): string {
    return join(this.roomDir, fileName);
  }
}

const LOCK_TIMEOUT_MS = 5_000;
// A lock whose owning process is dead, or that has no owner info and has sat
// untouched this long, is treated as abandoned and reclaimed. This prevents a
// crashed agent from wedging the room forever.
const LOCK_STALE_MS = 30_000;

interface LockInfo {
  pid: number;
  time: number;
}

async function withFileLock<T>(lockPath: string, operation: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  while (true) {
    try {
      const handle = await open(lockPath, "wx");
      try {
        await handle.writeFile(JSON.stringify({ pid: process.pid, time: Date.now() } satisfies LockInfo));
      } catch {
        // Best-effort owner stamp; an unwritable stamp does not block the operation.
      }
      try {
        return await operation();
      } finally {
        await handle.close();
        await rm(lockPath, { force: true });
      }
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
      if (await reclaimStaleLock(lockPath)) continue;
      if (Date.now() - startedAt > LOCK_TIMEOUT_MS) {
        throw new Error(
          `Room is busy: another process holds ${lockPath}. If no agent is running, delete that file to recover.`
        );
      }
      await delay(25);
    }
  }
}

async function reclaimStaleLock(lockPath: string): Promise<boolean> {
  let raw: string;
  try {
    raw = await readFile(lockPath, "utf8");
  } catch (error) {
    // Lock vanished between our failed create and this read; retry immediately.
    return isNotFound(error);
  }

  let info: LockInfo | null = null;
  try {
    const parsed = JSON.parse(raw) as Partial<LockInfo>;
    if (typeof parsed.pid === "number" && typeof parsed.time === "number") {
      info = { pid: parsed.pid, time: parsed.time };
    }
  } catch {
    info = null;
  }

  if (info && isProcessAlive(info.pid)) return false;
  if (!info && Date.now() - (await lockAgeAnchor(lockPath)) < LOCK_STALE_MS) return false;

  await rm(lockPath, { force: true }).catch(() => undefined);
  return true;
}

async function lockAgeAnchor(lockPath: string): Promise<number> {
  // No parseable owner stamp (legacy or corrupt lock): use the file's own
  // mtime so a genuinely old lock is reclaimed and a fresh one is left alone.
  try {
    return (await stat(lockPath)).mtimeMs;
  } catch {
    return 0;
  }
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but we may not signal it; ESRCH means gone.
    return isNodeError(error, "EPERM");
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
  input: Pick<ReadMessagesInput, "agent" | "sinceId" | "includeBroadcasts" | "project">,
  limit?: number
): RoomMessage[] {
  const includeBroadcasts = input.includeBroadcasts ?? true;

  const visible = messages.filter((message) => {
    if (input.sinceId && messageIdValue(message.id) <= messageIdValue(input.sinceId)) return false;
    if (!matchesProject(message, input.project)) return false;
    // Single source of truth for "who sees this": honors @mentions and
    // excludes the sender's own messages. Mirrors routing.ts so reads and
    // routing can never disagree.
    if (!messageTargetsAgent(message, input.agent)) return false;
    // A pure broadcast (no explicit mention of this agent) is suppressed when
    // the caller opts out of broadcasts; a direct mention still gets through.
    if (!includeBroadcasts && message.to === "all" && !message.mentions?.includes(input.agent)) {
      return false;
    }
    return true;
  });

  if (limit !== undefined && limit >= 0 && visible.length > limit) {
    return visible.slice(visible.length - limit);
  }
  return visible;
}

function matchesProject(item: { project?: string }, project: string | undefined): boolean {
  return !project || item.project === project;
}

function compactMessage(message: RoomMessage, textLimit: number): CompactRoomMessage {
  const preview = truncateText(message.body, textLimit);
  return {
    id: message.id,
    time: message.time,
    from: message.from,
    to: message.to,
    topic: message.topic,
    preview,
    bodyLength: message.body.length,
    ...(preview.length < message.body.length ? { fullBodyAvailable: true } : {}),
    project: message.project,
    status: message.status,
    next: message.next,
    phase: message.phase,
    replyTo: message.replyTo
  };
}

function compactTask(task: RoomTask): CompactTask {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    owner: task.owner,
    project: task.project,
    updatedAt: task.updatedAt
  };
}

// Drop decisions that a later decision replaced (P3-07). Verbose check_in keeps
// the full history; the compact view only surfaces what is still in force.
function excludeSuperseded(decisions: RoomDecision[]): RoomDecision[] {
  const supersededIds = new Set(
    decisions.map((decision) => decision.supersedes).filter((id): id is string => Boolean(id))
  );
  return decisions.filter((decision) => !supersededIds.has(decision.id));
}

function compactDecision(decision: RoomDecision): CompactDecision {
  return {
    id: decision.id,
    title: decision.title,
    decision: truncateText(decision.decision.replace(/\s+/g, " ").trim(), DEFAULT_COMPACT_TEXT_LIMIT),
    time: decision.time,
    project: decision.project
  };
}

function truncateText(text: string, limit: number): string {
  if (limit < 0 || text.length <= limit) return text;
  if (limit <= 3) return surrogateSafeSlice(text, Math.max(0, limit));
  return `${surrogateSafeSlice(text, limit - 3)}...`;
}

// Never cut between the halves of a surrogate pair: a preview ending in a lone
// surrogate is malformed text that renders as U+FFFD and corrupts JSON consumers.
function surrogateSafeSlice(text: string, end: number): string {
  if (end > 0 && end < text.length) {
    const code = text.charCodeAt(end - 1);
    if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  }
  return text.slice(0, end);
}

// Keep only the N most recently gone-stale items. The full set is oldest-first
// and can be huge in a long-lived room; the freshest stale items are the ones
// worth re-checking, so we surface those and drop the ancient noise.
function mostRecentStale<T extends { updatedAt: string }>(items: T[], limit: number): T[] {
  if (items.length <= limit) return items;
  return [...items]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit);
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

function storageLineSkipWarning(location: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `agent-room: skipped unparseable ${location} (quarantined; the rest of the room is still readable). ${detail}`;
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

// Message ids are zero-padded decimal strings ("000001"). Past 999,999 they grow
// to 7+ chars, and a lexicographic compare ("1000000" < "999999") is wrong. Parse
// to an integer and compare numerically so sinceId/ordering stay correct at any
// scale. Backward compatible with existing 6-char ids.
export function messageIdValue(id: string | undefined): number {
  const value = Number.parseInt(id ?? "", 10);
  return Number.isFinite(value) ? value : 0;
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
