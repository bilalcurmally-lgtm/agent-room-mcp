#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AgentRoomStore, MAX_TEXT_LENGTH } from "./store.js";

const VERSION = "0.1.0";

const MessageInput = {
  from: z.string().min(1),
  to: z.string().min(1),
  topic: z.string().min(1).max(MAX_TEXT_LENGTH),
  body: z.string().min(1).max(MAX_TEXT_LENGTH),
  project: z.string().min(1).max(MAX_TEXT_LENGTH).optional(),
  source: z.string().min(1).max(MAX_TEXT_LENGTH).optional(),
  replyTo: z.string().optional()
};

const ReadMessagesInput = {
  agent: z.string().min(1),
  sinceId: z.string().optional(),
  includeBroadcasts: z.boolean().optional(),
  project: z.string().min(1).max(MAX_TEXT_LENGTH).optional()
};

const CreateTaskInput = {
  title: z.string().min(1).max(MAX_TEXT_LENGTH),
  body: z.string().min(1).max(MAX_TEXT_LENGTH),
  owner: z.string().max(MAX_TEXT_LENGTH).optional(),
  project: z.string().min(1).max(MAX_TEXT_LENGTH).optional(),
  source: z.string().min(1).max(MAX_TEXT_LENGTH).optional()
};

const ClaimTaskInput = {
  taskId: z.string().min(1),
  agent: z.string().min(1).max(MAX_TEXT_LENGTH)
};

const RegisterAgentInput = {
  agent: z.string().min(1).max(MAX_TEXT_LENGTH),
  displayName: z.string().min(1).max(MAX_TEXT_LENGTH).optional(),
  role: z.string().min(1).max(MAX_TEXT_LENGTH).optional()
};

const RegisterProjectInput = {
  id: z.string().min(1).max(MAX_TEXT_LENGTH),
  name: z.string().min(1).max(MAX_TEXT_LENGTH),
  folderPath: z.string().min(1).max(MAX_TEXT_LENGTH),
  repoUrl: z.string().max(MAX_TEXT_LENGTH).optional(),
  status: z.string().max(MAX_TEXT_LENGTH).optional()
};

const MarkMessagesReadInput = {
  agent: z.string().min(1).max(MAX_TEXT_LENGTH),
  throughId: z.string().min(1).optional(),
  includeBroadcasts: z.boolean().optional()
};

const CheckInInput = {
  agent: z.string().min(1).max(MAX_TEXT_LENGTH),
  project: z.string().min(1).max(MAX_TEXT_LENGTH).optional(),
  includeBroadcasts: z.boolean().optional()
};

const ListTasksInput = {
  status: z.enum(["open", "claimed", "blocked", "done"]).optional(),
  owner: z.string().max(MAX_TEXT_LENGTH).optional(),
  project: z.string().min(1).max(MAX_TEXT_LENGTH).optional()
};

const UpdateTaskInput = {
  taskId: z.string().min(1),
  status: z.enum(["open", "claimed", "blocked", "done"]),
  owner: z.string().max(MAX_TEXT_LENGTH).optional(),
  note: z.string().max(MAX_TEXT_LENGTH).optional(),
  by: z.string().max(MAX_TEXT_LENGTH).optional()
};

const AppendTaskNoteInput = {
  taskId: z.string().min(1),
  body: z.string().min(1).max(MAX_TEXT_LENGTH),
  by: z.string().max(MAX_TEXT_LENGTH).optional()
};

const RecordDecisionInput = {
  title: z.string().min(1).max(MAX_TEXT_LENGTH),
  decision: z.string().min(1).max(MAX_TEXT_LENGTH),
  rationale: z.string().min(1).max(MAX_TEXT_LENGTH),
  project: z.string().min(1).max(MAX_TEXT_LENGTH).optional(),
  source: z.string().min(1).max(MAX_TEXT_LENGTH).optional(),
  links: z.array(z.string().max(MAX_TEXT_LENGTH)).optional()
};

export async function createServer(roomDir: string): Promise<McpServer> {
  const store = await AgentRoomStore.open(roomDir);
  const server = new McpServer({
    name: "agent-room-mcp",
    version: VERSION
  });

  server.registerTool(
    "post_message",
    {
      title: "Post message",
      description: "Post an append-only message to another agent or to all agents.",
      inputSchema: MessageInput
    },
    async (input) => jsonResult(await store.postMessage(input))
  );

  server.registerTool(
    "read_messages",
    {
      title: "Read messages",
      description: "Read messages addressed to an agent, optionally after a message id.",
      inputSchema: ReadMessagesInput
    },
    async (input) => jsonResult(await store.readMessages(input))
  );

  server.registerTool(
    "create_task",
    {
      title: "Create task",
      description: "Create a shared task in the room task board.",
      inputSchema: CreateTaskInput
    },
    async (input) => jsonResult(await store.createTask(input))
  );

  server.registerTool(
    "claim_task",
    {
      title: "Claim task",
      description: "Claim an open task for an agent.",
      inputSchema: ClaimTaskInput
    },
    async (input) => jsonResult(await store.claimTask(input))
  );

  server.registerTool(
    "register_agent",
    {
      title: "Register agent",
      description: "Register or update an agent identity for unread tracking and auditable check-ins.",
      inputSchema: RegisterAgentInput
    },
    async (input) => jsonResult(await store.registerAgent(input))
  );

  server.registerTool(
    "check_in",
    {
      title: "Check in",
      description: "Return an agent's unread messages, assigned tasks, open tasks, recent decisions, and room status.",
      inputSchema: CheckInInput
    },
    async (input) => jsonResult(await store.checkIn(input))
  );

  server.registerTool(
    "mark_messages_read",
    {
      title: "Mark messages read",
      description: "Advance an agent's last-read pointer after it has consumed its inbox.",
      inputSchema: MarkMessagesReadInput
    },
    async (input) => jsonResult(await store.markMessagesRead(input))
  );

  server.registerTool(
    "register_project",
    {
      title: "Register project",
      description: "Register or update a project folder so agents know the real workspace path.",
      inputSchema: RegisterProjectInput
    },
    async (input) => jsonResult(await store.upsertProject(input))
  );

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "List registered project folders and tag-only project ids."
    },
    async () =>
      jsonResult({
        records: await store.listProjectRecords(),
        ids: await store.listProjects()
      })
  );

  server.registerTool(
    "list_tasks",
    {
      title: "List tasks",
      description: "List room tasks, optionally filtered by status, owner, or project.",
      inputSchema: ListTasksInput
    },
    async (input) => jsonResult(await store.listTasks(input))
  );

  server.registerTool(
    "update_task",
    {
      title: "Update task",
      description: "Update a task status, optionally reassign the owner, and optionally append a note.",
      inputSchema: UpdateTaskInput
    },
    async (input) => jsonResult(await store.updateTask(input))
  );

  server.registerTool(
    "append_task_note",
    {
      title: "Append task note",
      description: "Append a timestamped note to a task without changing its status or owner.",
      inputSchema: AppendTaskNoteInput
    },
    async (input) => jsonResult(await store.appendTaskNote(input))
  );

  server.registerTool(
    "record_decision",
    {
      title: "Record decision",
      description: "Append a durable team decision to the room decision log.",
      inputSchema: RecordDecisionInput
    },
    async (input) => jsonResult(await store.recordDecision(input))
  );

  server.registerTool(
    "get_room_status",
    {
      title: "Get room status",
      description: "Return counts for messages, tasks, decisions, and the active room directory."
    },
    async () => jsonResult(await store.getRoomStatus())
  );

  return server;
}

export function resolveRoomDir(args: readonly string[], env: NodeJS.ProcessEnv): string {
  const explicitRoomIndex = args.indexOf("--room");
  if (explicitRoomIndex >= 0) {
    const room = args[explicitRoomIndex + 1];
    if (!room) throw new Error("--room requires a directory path");
    return room;
  }

  return env.AGENT_ROOM_DIR ?? ".agent-room";
}

async function main(): Promise<void> {
  const roomDir = resolveRoomDir(process.argv.slice(2), process.env);
  const server = await createServer(roomDir);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function jsonResult(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

export function isDirectRun(moduleUrl: string, argv1: string | undefined): boolean {
  if (!argv1) return false;
  return resolve(fileURLToPath(moduleUrl)) === resolve(argv1);
}

if (isDirectRun(import.meta.url, process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
