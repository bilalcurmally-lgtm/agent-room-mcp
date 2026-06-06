import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RoomAgent, RoomMessage } from "./store.js";
import { formatRoomPingText, messageTargetsAgent } from "./routing.js";

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

export interface NotificationDelivery {
  at: string;
  agent: string;
  messageIds: string[];
  total: number;
  text: string;
  error?: string;
}

export interface AgentNotificationStatus {
  agent: string;
  displayName?: string;
  unread: number;
  lastPingAt?: string;
  lastPingMessageId?: string;
  lastError?: string;
  inboxPath: string;
}

export interface RoomNotificationStatus {
  enabled: boolean;
  running: boolean;
  intervalMs: number;
  lastTickAt?: string;
  lastError?: string;
  agentCount: number;
  agents: AgentNotificationStatus[];
  recent: NotificationDelivery[];
}

export interface RoomNotifierOptions {
  roomDir: string;
  intervalMs?: number;
  limit?: number;
  wakeCommand?: string;
  listAgents: () => Promise<RoomAgent[]>;
  listMessages: () => Promise<RoomMessage[]>;
}

export function defaultWakeCommand(repoRoot = REPO_ROOT): string {
  const wakeScript = join(repoRoot, "scripts", "wake-agent.ps1").replaceAll("\\", "/");
  return `powershell -NoProfile -ExecutionPolicy Bypass -File "${wakeScript}"`;
}

export function selectUnreadMessages(
  messages: RoomMessage[],
  options: { agent: string; lastSeen: string; limit: number }
): RoomMessage[] {
  const lastSeen = options.lastSeen ?? "";
  return messages
    .filter((message) => message.id > lastSeen)
    .filter((message) => messageTargetsAgent(message, options.agent))
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, options.limit);
}

export function selectAgentNotifications(
  messages: RoomMessage[],
  agents: string[],
  lastSeenByAgent: Record<string, string>,
  limit: number
) {
  return agents
    .map((agent) => {
      const allUnread = selectUnreadMessages(messages, {
        agent,
        lastSeen: lastSeenByAgent[agent] ?? "",
        limit: Number.MAX_SAFE_INTEGER
      });
      const selected = allUnread.slice(0, limit);
      return {
        agent,
        messages: selected,
        total: allUnread.length,
        highestId: selected.at(-1)?.id
      };
    })
    .filter((notification) => notification.messages.length > 0);
}

function watchStatePath(roomDir: string, agent: string): string {
  return join(roomDir, `.watch-lastseen-${agent}`);
}

function deliveryLogPath(roomDir: string): string {
  return join(roomDir, "notifications.jsonl");
}

export class RoomNotifier {
  private readonly roomDir: string;
  private readonly intervalMs: number;
  private readonly limit: number;
  private readonly wakeCommand: string;
  private readonly listAgents: () => Promise<RoomAgent[]>;
  private readonly listMessages: () => Promise<RoomMessage[]>;
  private timer?: NodeJS.Timeout;
  private enabled = true;
  private running = false;
  private lastTickAt?: string;
  private lastError?: string;
  private recent: NotificationDelivery[] = [];
  private agentStatus = new Map<string, AgentNotificationStatus>();

  constructor(options: RoomNotifierOptions) {
    this.roomDir = options.roomDir;
    this.intervalMs = options.intervalMs ?? 5000;
    this.limit = options.limit ?? 10;
    this.wakeCommand = options.wakeCommand ?? defaultWakeCommand();
    this.listAgents = options.listAgents;
    this.listMessages = options.listMessages;
  }

  start(): void {
    if (this.timer) return;
    this.running = true;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  getStatus(): RoomNotificationStatus {
    return {
      enabled: this.enabled,
      running: this.running,
      intervalMs: this.intervalMs,
      lastTickAt: this.lastTickAt,
      lastError: this.lastError,
      agentCount: this.agentStatus.size,
      agents: [...this.agentStatus.values()].sort((a, b) => a.agent.localeCompare(b.agent)),
      recent: this.recent.slice(-20)
    };
  }

  async tick(): Promise<void> {
    if (!this.enabled) return;
    this.lastTickAt = new Date().toISOString();
    try {
      const [agents, messages] = await Promise.all([this.listAgents(), this.listMessages()]);
      const agentIds = agents.map((agent) => agent.id);
      const lastSeen = await readAllLastSeen(this.roomDir, agentIds);
      const notifications = selectAgentNotifications(messages, agentIds, lastSeen, this.limit);

      for (const agent of agents) {
        const inboxPath = join(this.roomDir, `.wake-inbox-${agent.id}.txt`);
        const unread = selectUnreadMessages(messages, {
          agent: agent.id,
          lastSeen: lastSeen[agent.id] ?? "",
          limit: Number.MAX_SAFE_INTEGER
        }).length;
        const existing = this.agentStatus.get(agent.id);
        this.agentStatus.set(agent.id, {
          agent: agent.id,
          displayName: agent.displayName,
          unread,
          lastPingAt: existing?.lastPingAt,
          lastPingMessageId: existing?.lastPingMessageId,
          lastError: existing?.lastError,
          inboxPath
        });
      }

      for (const notification of notifications) {
        const text = [`AGENT ${notification.agent}`, formatRoomPingText(notification.messages, { total: notification.total })].join(
          "\n"
        );
        const delivery: NotificationDelivery = {
          at: new Date().toISOString(),
          agent: notification.agent,
          messageIds: notification.messages.map((message) => message.id),
          total: notification.total,
          text
        };
        try {
          await runWakeCommand(this.wakeCommand, notification.agent, text, this.roomDir);
          if (notification.highestId) {
            await writeLastSeen(this.roomDir, notification.agent, notification.highestId);
          }
          const status = this.agentStatus.get(notification.agent);
          if (status) {
            status.lastPingAt = delivery.at;
            status.lastPingMessageId = notification.highestId;
            status.lastError = undefined;
            status.unread = Math.max(0, notification.total - notification.messages.length);
          }
        } catch (error) {
          delivery.error = error instanceof Error ? error.message : String(error);
          const status = this.agentStatus.get(notification.agent);
          if (status) status.lastError = delivery.error;
        }
        this.recent.push(delivery);
        if (this.recent.length > 50) this.recent.shift();
        await appendDelivery(this.roomDir, delivery);
      }

      this.lastError = undefined;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    }
  }
}

async function readAllLastSeen(roomDir: string, agents: string[]): Promise<Record<string, string>> {
  const pairs = await Promise.all(
    agents.map(async (agent) => [agent, await readLastSeen(watchStatePath(roomDir, agent))] as const)
  );
  return Object.fromEntries(pairs);
}

async function readLastSeen(path: string): Promise<string> {
  try {
    return (await readFile(path, "utf8")).trim();
  } catch {
    return "";
  }
}

async function writeLastSeen(roomDir: string, agent: string, id: string): Promise<void> {
  const path = watchStatePath(roomDir, agent);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${id}\n`, "utf8");
}

async function appendDelivery(roomDir: string, delivery: NotificationDelivery): Promise<void> {
  const path = deliveryLogPath(roomDir);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(delivery)}\n`, "utf8");
}

async function runWakeCommand(command: string, agent: string, text: string, roomDir: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      stdio: "ignore",
      windowsHide: true,
      env: {
        ...process.env,
        AGENT_ROOM_AGENT: agent,
        AGENT_ROOM_PING: text,
        AGENT_ROOM_DIR: roomDir
      }
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Notify command exited ${code}`));
    });
  });
}