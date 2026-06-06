import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { AgentRoomStore } from "./store.js";
import { isDirectRun } from "./server.js";

export interface ClientSetupProfile {
  client: string;
  agent: string;
  displayName: string;
  role: string;
  configHint: string;
}

export const CLIENT_SETUP_PROFILES: ClientSetupProfile[] = [
  {
    client: "Claude Code",
    agent: "claude-opus",
    displayName: "Claude",
    role: "reviewer",
    configHint: "claude mcp add --scope user agent-room -- node .../dist/server.js --room .../.agent-room"
  },
  {
    client: "Codex",
    agent: "codex-desktop",
    displayName: "Codex Desktop",
    role: "implementer",
    configHint: "[mcp_servers.agent_room] in your Codex MCP config TOML"
  },
  {
    client: "Cursor",
    agent: "cursor",
    displayName: "Cursor",
    role: "editor",
    configHint: "mcpServers.agent-room in Cursor MCP JSON settings"
  }
];

export interface ClientVerificationResult {
  client: string;
  agent: string;
  ok: boolean;
  steps: string[];
  error?: string;
}

export interface VerifyMcpClientsOptions {
  roomDir: string;
  serverEntry: string;
  project?: string;
  profiles?: ClientSetupProfile[];
}

function toolResultText(result: unknown): string {
  if (!result || typeof result !== "object" || !("content" in result)) {
    throw new Error("Tool result did not include content");
  }
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) throw new Error("Tool result did not include content array");
  for (const part of content) {
    if (part && typeof part === "object" && "type" in part && part.type === "text" && "text" in part) {
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") return text;
    }
  }
  throw new Error("Tool result did not include JSON text content");
}

function parseToolJson(result: unknown): unknown {
  return JSON.parse(toolResultText(result));
}

async function callToolJson(
  client: Client,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) {
    throw new Error(toolResultText(result));
  }
  return parseToolJson(result);
}

export async function verifyClientSetup(
  options: VerifyMcpClientsOptions,
  profile: ClientSetupProfile
): Promise<ClientVerificationResult> {
  const steps: string[] = [];
  const project = options.project ?? "agent-room-mcp";
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [options.serverEntry, "--room", options.roomDir],
    stderr: "pipe",
    cwd: process.cwd()
  });
  const client = new Client({ name: "agent-room-verify", version: "0.1.0" });

  try {
    await client.connect(transport);
    steps.push("connected via stdio");

    const tools = await client.listTools();
    const toolNames = tools.tools.map((tool) => tool.name);
    for (const required of ["register_agent", "check_in", "post_message", "get_room_status"]) {
      if (!toolNames.includes(required)) {
        throw new Error(`Missing tool: ${required}`);
      }
    }
    steps.push("listed required tools");

    const agent = (await callToolJson(client, "register_agent", {
      agent: profile.agent,
      displayName: profile.displayName,
      role: profile.role
    })) as { id: string };
    if (agent.id !== profile.agent) throw new Error(`register_agent returned ${agent.id}`);
    steps.push("register_agent");

    const checkIn = (await callToolJson(client, "check_in", {
      agent: profile.agent,
      project
    })) as { agent: { id: string }; status: { roomDir: string } };
    if (checkIn.agent.id !== profile.agent) throw new Error("check_in agent mismatch");
    if (checkIn.status.roomDir !== resolve(options.roomDir)) throw new Error("check_in roomDir mismatch");
    steps.push("check_in");

    const topic = `${profile.client} MCP verification`;
    const message = (await callToolJson(client, "post_message", {
      from: profile.agent,
      to: "all",
      topic,
      body: `[STATUS: reviewing] ${profile.client} setup verification. [NEXT: Confirm in dashboard.]`,
      project
    })) as { id: string; from: string; topic: string };

    if (message.from !== profile.agent || message.topic !== topic) {
      throw new Error("post_message payload mismatch");
    }
    steps.push("post_message");

    const store = await AgentRoomStore.open(options.roomDir);
    const messages = await store.readMessages({ agent: profile.agent, project, includeBroadcasts: true });
    if (!messages.some((item) => item.id === message.id)) {
      throw new Error("posted message not visible in room storage");
    }
    steps.push("room storage confirmed");

    return { client: profile.client, agent: profile.agent, ok: true, steps };
  } catch (error) {
    return {
      client: profile.client,
      agent: profile.agent,
      ok: false,
      steps,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    await client.close();
  }
}

export async function verifyAllClientSetups(
  options: VerifyMcpClientsOptions
): Promise<ClientVerificationResult[]> {
  const profiles = options.profiles ?? CLIENT_SETUP_PROFILES;
  const results: ClientVerificationResult[] = [];
  for (const profile of profiles) {
    results.push(await verifyClientSetup(options, profile));
  }
  return results;
}

export function formatVerificationReport(results: ClientVerificationResult[]): string {
  const lines = ["Agent Room MCP client verification", ""];
  for (const result of results) {
    const status = result.ok ? "PASS" : "FAIL";
    lines.push(`${status}  ${result.client} (${result.agent})`);
    lines.push(`       ${result.steps.join(" -> ")}`);
    if (result.error) lines.push(`       error: ${result.error}`);
    lines.push("");
  }
  const failed = results.filter((result) => !result.ok).length;
  lines.push(failed === 0 ? "All client profiles passed." : `${failed} profile(s) failed.`);
  return lines.join("\n");
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const serverEntry = resolve(repoRoot, "dist", "server.js");
  const roomDir = argv.includes("--room")
    ? argv[argv.indexOf("--room") + 1]
    : await mkdtemp(join(tmpdir(), "agent-room-verify-"));
  const keepRoom = argv.includes("--keep-room");

  try {
    const results = await verifyAllClientSetups({ roomDir, serverEntry });
    const report = formatVerificationReport(results);
    console.log(report);
    if (!keepRoom && !argv.includes("--room")) {
      await rm(roomDir, { recursive: true, force: true });
    } else if (!argv.includes("--room")) {
      console.log(`Room kept at: ${roomDir}`);
    }
    return results.every((result) => result.ok) ? 0 : 1;
  } catch (error) {
    console.error(error);
    return 1;
  }
}

if (isDirectRun(import.meta.url, process.argv[1])) {
  main().then((code) => process.exit(code));
}