#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { assertProtocolCompliant } from "./protocol.js";
import { resolveMessageRoute } from "./routing.js";
import { AgentRoomStore, MAX_TEXT_LENGTH, resolveRoomProject } from "./store.js";

const VERSION = "0.1.0";

const AttachmentLinkInput = z.object({
  name: z.string().min(1).max(MAX_TEXT_LENGTH),
  url: z.string().min(1).max(MAX_TEXT_LENGTH)
});

const MessageInput = {
  from: z.string().min(1),
  to: z.string().min(1),
  topic: z.string().min(1).max(MAX_TEXT_LENGTH),
  body: z.string().min(1).max(MAX_TEXT_LENGTH),
  project: z.string().min(1).max(MAX_TEXT_LENGTH).optional(),
  source: z.string().min(1).max(MAX_TEXT_LENGTH).optional(),
  replyTo: z.string().optional(),
  status: z.string().max(MAX_TEXT_LENGTH).optional(),
  next: z.string().max(MAX_TEXT_LENGTH).optional(),
  phase: z.string().max(MAX_TEXT_LENGTH).optional(),
  attachmentIds: z.array(z.string().min(1)).optional(),
  links: z.array(AttachmentLinkInput).optional()
};

const ActiveProjectInput = {
  project: z.string().min(1).max(MAX_TEXT_LENGTH).nullable().optional()
};

const UploadAttachmentInput = {
  fileName: z.string().min(1).max(MAX_TEXT_LENGTH),
  mimeType: z.string().min(1).max(MAX_TEXT_LENGTH),
  contentBase64: z.string().min(1),
  uploadedBy: z.string().max(MAX_TEXT_LENGTH).optional()
};

const LinkAttachmentInput = {
  name: z.string().min(1).max(MAX_TEXT_LENGTH),
  url: z.string().min(1).max(MAX_TEXT_LENGTH),
  uploadedBy: z.string().max(MAX_TEXT_LENGTH).optional()
};

const ReadMessagesInput = {
  agent: z.string().min(1),
  sinceId: z.string().optional(),
  includeBroadcasts: z.boolean().optional(),
  project: z.string().min(1).max(MAX_TEXT_LENGTH).optional(),
  limit: z.number().int().positive().optional()
};

const DEFAULT_LIST_LIMIT = 20;

// List endpoints return the most recent N matches in an envelope so agents can
// see there is more without pulling the whole log into context (P1-03).
export function paginate<T>(items: T[], limit: number): { items: T[]; total: number; truncated: boolean } {
  const selected = items.slice(Math.max(0, items.length - limit));
  return { items: selected, total: items.length, truncated: selected.length < items.length };
}

const CreateTaskInput = {
  title: z.string().min(1).max(MAX_TEXT_LENGTH),
  body: z.string().min(1).max(MAX_TEXT_LENGTH),
  owner: z.string().max(MAX_TEXT_LENGTH).optional(),
  project: z.string().min(1).max(MAX_TEXT_LENGTH).optional(),
  source: z.string().min(1).max(MAX_TEXT_LENGTH).optional(),
  attachmentIds: z.array(z.string().min(1)).optional(),
  links: z.array(AttachmentLinkInput).optional()
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

const DeleteProjectInput = {
  id: z.string().min(1).max(MAX_TEXT_LENGTH)
};

const MarkMessagesReadInput = {
  agent: z.string().min(1).max(MAX_TEXT_LENGTH),
  throughId: z.string().min(1).optional(),
  includeBroadcasts: z.boolean().optional(),
  project: z.string().min(1).max(MAX_TEXT_LENGTH).optional()
};

const CheckInInput = {
  agent: z.string().min(1).max(MAX_TEXT_LENGTH),
  project: z.string().min(1).max(MAX_TEXT_LENGTH).optional(),
  includeBroadcasts: z.boolean().optional(),
  limit: z.number().int().positive().optional()
};

const CompactCheckInInput = {
  ...CheckInInput,
  decisionLimit: z.number().int().nonnegative().optional(),
  textLimit: z.number().int().nonnegative().optional()
};

const ListTasksInput = {
  status: z.enum(["open", "claimed", "blocked", "done"]).optional(),
  owner: z.string().max(MAX_TEXT_LENGTH).optional(),
  project: z.string().min(1).max(MAX_TEXT_LENGTH).optional(),
  limit: z.number().int().positive().optional()
};

const UpdateTaskInput = {
  taskId: z.string().min(1),
  status: z.enum(["open", "claimed", "blocked", "done"]),
  owner: z.string().max(MAX_TEXT_LENGTH).optional(),
  note: z.string().max(MAX_TEXT_LENGTH).optional(),
  branch: z.string().max(MAX_TEXT_LENGTH).optional(),
  commit: z.string().max(MAX_TEXT_LENGTH).optional(),
  by: z.string().max(MAX_TEXT_LENGTH).optional(),
  attachmentIds: z.array(z.string().min(1)).optional(),
  links: z.array(AttachmentLinkInput).optional()
};

const AppendTaskNoteInput = {
  taskId: z.string().min(1),
  body: z.string().min(1).max(MAX_TEXT_LENGTH),
  branch: z.string().max(MAX_TEXT_LENGTH).optional(),
  commit: z.string().max(MAX_TEXT_LENGTH).optional(),
  by: z.string().max(MAX_TEXT_LENGTH).optional(),
  attachmentIds: z.array(z.string().min(1)).optional(),
  links: z.array(AttachmentLinkInput).optional()
};

const RecordDecisionInput = {
  title: z.string().min(1).max(MAX_TEXT_LENGTH),
  decision: z.string().min(1).max(MAX_TEXT_LENGTH),
  rationale: z.string().min(1).max(MAX_TEXT_LENGTH),
  project: z.string().min(1).max(MAX_TEXT_LENGTH).optional(),
  source: z.string().min(1).max(MAX_TEXT_LENGTH).optional(),
  links: z.array(z.string().max(MAX_TEXT_LENGTH)).optional(),
  attachmentIds: z.array(z.string().min(1)).optional(),
  linkAttachments: z.array(AttachmentLinkInput).optional()
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
    async (input) => {
      const config = await store.getConfig();
      assertProtocolCompliant(input, config.enforceProtocol);
      const project = resolveRoomProject(config, input.project);
      const agents = await store.listAgents();
      const route = resolveMessageRoute({
        body: input.body,
        to: input.to,
        registeredAgentIds: agents.map((agent) => agent.id)
      });
      return jsonResult(
        await store.postMessage({
          ...input,
          project,
          to: route.to,
          mentions: route.mentions,
          unresolvedMentions: route.unresolvedMentions
        })
      );
    }
  );

  server.registerTool(
    "upload_attachment",
    {
      title: "Upload attachment",
      description:
        "Store a file in the room attachments directory (max 5 MB). Returns an attachment id for post_message attachmentIds.",
      inputSchema: UploadAttachmentInput
    },
    async (input) => jsonResult(await store.uploadAttachment(input))
  );

  server.registerTool(
    "link_attachment",
    {
      title: "Link attachment",
      description: "Register an external http(s) link in the room attachment index.",
      inputSchema: LinkAttachmentInput
    },
    async (input) => jsonResult(await store.linkAttachment(input))
  );

  server.registerTool(
    "list_attachments",
    {
      title: "List attachments",
      description: "List file and link attachments stored in the room."
    },
    async () => jsonResult(await store.listAttachments())
  );

  server.registerTool(
    "read_messages",
    {
      title: "Read messages",
      description:
        "Read messages addressed to an agent, optionally after a message id. Returns {items, total, truncated} with the most recent matches (default 20); pass limit to widen or narrow.",
      inputSchema: ReadMessagesInput
    },
    async (input) => {
      const config = await store.getConfig();
      const messages = await store.readMessages({
        ...input,
        project: resolveRoomProject(config, input.project),
        limit: undefined
      });
      return jsonResult(paginate(messages, input.limit ?? DEFAULT_LIST_LIMIT));
    }
  );

  server.registerTool(
    "create_task",
    {
      title: "Create task",
      description: "Create a shared task in the room task board.",
      inputSchema: CreateTaskInput
    },
    async (input) => {
      const config = await store.getConfig();
      return jsonResult(await store.createTask({ ...input, project: resolveRoomProject(config, input.project) }));
    }
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
      description:
        "Return an agent's room state as compact summaries: unread message previews (fetch full bodies with read_message), task headers, alert counts, recent decision one-liners, and room status. Pass verbose: true for full message bodies and unsliced lists.",
      inputSchema: { ...CheckInInput, verbose: z.boolean().optional() }
    },
    async (input) => {
      const config = await store.getConfig();
      const scoped = { ...input, project: resolveRoomProject(config, input.project) };
      return jsonResult(input.verbose ? await store.checkIn(scoped) : await store.checkInCompact(scoped));
    }
  );

  server.registerTool(
    "search_messages",
    {
      title: "Search messages",
      description:
        "Case-insensitive substring search over message topics and bodies, filterable by project, from, to, and afterId. Returns {items, total, truncated} previews (default 10, most recent first) — pull full bodies with read_message.",
      inputSchema: {
        keyword: z.string().min(1).max(MAX_TEXT_LENGTH).optional(),
        project: z.string().min(1).max(MAX_TEXT_LENGTH).optional(),
        from: z.string().min(1).max(MAX_TEXT_LENGTH).optional(),
        to: z.string().min(1).max(MAX_TEXT_LENGTH).optional(),
        afterId: z.string().min(1).optional(),
        limit: z.number().int().positive().optional()
      }
    },
    async (input) => {
      const config = await store.getConfig();
      return jsonResult(await store.searchMessages({ ...input, project: resolveRoomProject(config, input.project) }));
    }
  );

  server.registerTool(
    "read_message",
    {
      title: "Read one message",
      description: "Return one full message (body, attachments, thread refs) by id, for pulls after a compact preview.",
      inputSchema: { id: z.string().min(1) }
    },
    async (input) => jsonResult(await store.readMessage(input.id))
  );

  server.registerTool(
    "check_in_compact",
    {
      title: "Compact check in",
      description:
        "Token-cheap wake check-in. Returns compact unread message previews, active task headers, alert counts, and recent decision headers. Use full check_in only when this delta is insufficient.",
      inputSchema: CompactCheckInInput
    },
    async (input) => {
      const config = await store.getConfig();
      return jsonResult(await store.checkInCompact({ ...input, project: resolveRoomProject(config, input.project) }));
    }
  );

  server.registerTool(
    "mark_messages_read",
    {
      title: "Mark messages read",
      description: "Advance an agent's last-read pointer after it has consumed its inbox.",
      inputSchema: MarkMessagesReadInput
    },
    async (input) => {
      const config = await store.getConfig();
      return jsonResult(
        await store.markMessagesRead({
          ...input,
          project: resolveRoomProject(config, input.project)
        })
      );
    }
  );

  server.registerTool(
    "set_active_project",
    {
      title: "Set active project",
      description:
        "Set the room's default project for MCP agent reads and writes. Pass project null, empty, or omit it to clear. Pass project \"all\" on individual tool calls to bypass this default.",
      inputSchema: ActiveProjectInput
    },
    async (input) =>
      jsonResult(
        await store.updateConfig({
          activeProject: input.project === "all" ? null : input.project ?? null
        })
      )
  );

  server.registerTool(
    "get_room_config",
    {
      title: "Get room config",
      description: "Return room settings including activeProject so agents know the default project scope."
    },
    async () => jsonResult(await store.getConfig())
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
    "delete_project",
    {
      title: "Delete project",
      description: "Remove a registered project folder without deleting tagged room history.",
      inputSchema: DeleteProjectInput
    },
    async (input) => jsonResult(await store.deleteProject(input))
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
      description:
        "List room tasks, optionally filtered by status, owner, or project. Returns {items, total, truncated} with the most recent matches (default 20).",
      inputSchema: ListTasksInput
    },
    async (input) => {
      const config = await store.getConfig();
      const tasks = await store.listTasks({ ...input, project: resolveRoomProject(config, input.project) });
      return jsonResult(paginate(tasks, input.limit ?? DEFAULT_LIST_LIMIT));
    }
  );

  server.registerTool(
    "update_task",
    {
      title: "Update task",
      description:
        "Update a task status, optionally reassign the owner, and optionally append a note with branch or commit links.",
      inputSchema: UpdateTaskInput
    },
    async (input) => jsonResult(await store.updateTask(input))
  );

  server.registerTool(
    "append_task_note",
    {
      title: "Append task note",
      description:
        "Append a timestamped note to a task without changing its status or owner. Optional branch and commit fields keep links structured.",
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
    async (input) => {
      const config = await store.getConfig();
      return jsonResult(await store.recordDecision({ ...input, project: resolveRoomProject(config, input.project) }));
    }
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

// Compact on purpose: tool responses are consumed by models, and indentation
// whitespace is pure token cost (it was ~20-30% of every response).
export function jsonResult(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value)
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
