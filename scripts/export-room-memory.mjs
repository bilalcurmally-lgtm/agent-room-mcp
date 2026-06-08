#!/usr/bin/env node
// Export a compact Agent Room project memory as Obsidian-compatible Markdown.
//
// Obsidian is just a folder of Markdown files. This script intentionally avoids
// plugin/API coupling: point --vault at an Obsidian vault, or use the default
// <room>/obsidian/<project>, then open that folder in Obsidian.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOM_DIR = process.env.AGENT_ROOM_DIR ?? "D:\\projects\\.agent-room";
const DEFAULT_PROJECT = process.env.AGENT_ROOM_PROJECT ?? "agent-room-mcp";
const DEFAULT_MESSAGE_LIMIT = 20;

if (isDirectRun()) {
  const options = parseArgs(process.argv.slice(2));
  const roomDir = options.room ?? DEFAULT_ROOM_DIR;
  const project = options.project ?? DEFAULT_PROJECT;
  const vaultDir = options.vault
    ? resolve(options.vault)
    : join(roomDir, "obsidian", sanitizePathSegment(project));
  const messageLimit = Number(options.limit ?? DEFAULT_MESSAGE_LIMIT);

  await exportRoomMemory({ roomDir, project, vaultDir, messageLimit });
  console.log(`Exported Agent Room memory to ${vaultDir}`);
}

export async function exportRoomMemory({ roomDir, project, vaultDir, messageLimit = DEFAULT_MESSAGE_LIMIT }) {
  await mkdir(vaultDir, { recursive: true });
  const [messages, tasks, decisions, agents, projects] = await Promise.all([
    readJsonl(join(roomDir, "messages.jsonl")),
    readJson(join(roomDir, "tasks.json"), []),
    readJson(join(roomDir, "decisions.json"), []),
    readJson(join(roomDir, "agents.json"), []),
    readJson(join(roomDir, "projects.json"), [])
  ]);
  const projectMessages = messages.filter((message) => matchesProject(message, project));
  const projectTasks = tasks.filter((task) => matchesProject(task, project));
  const projectDecisions = decisions.filter((decision) => matchesProject(decision, project));
  const projectRecord = projects.find((record) => record.id === project);
  const activeTasks = projectTasks.filter((task) => task.status !== "done");
  const latestMessages = projectMessages.slice(-messageLimit);

  await Promise.all([
    writeFile(join(vaultDir, "Current State.md"), currentStateMarkdown({
      project,
      projectRecord,
      messages: projectMessages,
      latestMessages,
      activeTasks,
      decisions: projectDecisions,
      agents
    }), "utf8"),
    writeFile(join(vaultDir, "Backlog.md"), backlogMarkdown({ project, tasks: projectTasks }), "utf8"),
    writeFile(join(vaultDir, "Decisions.md"), decisionsMarkdown({ project, decisions: projectDecisions }), "utf8"),
    writeFile(join(vaultDir, "Wake Contract.md"), wakeContractMemoryMarkdown({ project }), "utf8")
  ]);
}

function currentStateMarkdown({ project, projectRecord, messages, latestMessages, activeTasks, decisions, agents }) {
  return [
    `# Current State - ${project}`,
    "",
    `Updated: ${new Date().toISOString()}`,
    projectRecord?.folderPath ? `Workspace: \`${projectRecord.folderPath}\`` : "",
    "",
    "## Snapshot",
    "",
    `- Messages: ${messages.length}`,
    `- Active tasks: ${activeTasks.length}`,
    `- Decisions: ${decisions.length}`,
    `- Registered agents: ${agents.length}`,
    "",
    "## Active Tasks",
    "",
    activeTasks.length
      ? activeTasks.map((task) => `- ${task.id} [${task.status}] ${task.title}${task.owner ? ` (@${task.owner})` : ""}`).join("\n")
      : "- None",
    "",
    "## Latest Messages",
    "",
    latestMessages.length
      ? latestMessages.map((message) => `- ${message.id} ${message.time} ${message.from} -> ${message.to}: ${message.topic}`).join("\n")
      : "- None",
    "",
    "## Context Budget Rule",
    "",
    "- Wake turns should start with `check_in_compact`.",
    "- Open full room history or this vault only when the compact delta is insufficient.",
    "- Keep this file short enough to paste into a fresh agent session."
  ].filter((line) => line !== "").join("\n") + "\n";
}

function backlogMarkdown({ project, tasks }) {
  const groups = ["open", "claimed", "blocked", "done"];
  const lines = [`# Backlog - ${project}`, "", `Updated: ${new Date().toISOString()}`, ""];
  for (const status of groups) {
    const items = tasks.filter((task) => task.status === status);
    lines.push(`## ${titleCase(status)}`, "");
    lines.push(items.length
      ? items.map((task) => `- ${task.id}${task.owner ? ` @${task.owner}` : ""}: ${task.title}`).join("\n")
      : "- None");
    lines.push("");
  }
  return lines.join("\n");
}

function decisionsMarkdown({ project, decisions }) {
  return [
    `# Decisions - ${project}`,
    "",
    `Updated: ${new Date().toISOString()}`,
    "",
    decisions.length
      ? decisions.map((decision) => [
        `## ${decision.id} - ${decision.title}`,
        "",
        `Time: ${decision.time}`,
        "",
        decision.decision,
        "",
        `Rationale: ${decision.rationale}`
      ].join("\n")).join("\n\n")
      : "No decisions recorded."
  ].join("\n") + "\n";
}

function wakeContractMemoryMarkdown({ project }) {
  return [
    `# Wake Contract - ${project}`,
    "",
    "This vault file is the human-readable memory copy. The implementation spec lives in `docs/WAKE_CONTRACT.md`.",
    "",
    "## Token Budget",
    "",
    "- Wake event: tiny trigger with message ids only.",
    "- First agent read: `check_in_compact`.",
    "- Full `check_in`, full message bodies, and long docs: explicit escalation only.",
    "- No OS notification spam; watcher resumes the CLI directly.",
    "",
    "## Acceptance",
    "",
    "- One routed post wakes the target agent once.",
    "- The agent checks in and replies or acts without a manual nudge.",
    "- Cursor persistence prevents replay after restart.",
    "- Loop breaker/human gate is required before broad autonomous agent chains."
  ].join("\n") + "\n";
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function readJsonl(path) {
  try {
    const content = await readFile(path, "utf8");
    return content.split(/\r?\n/).filter(Boolean).flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

function matchesProject(item, project) {
  return !project || item.project === project;
}

function sanitizePathSegment(value) {
  return String(value).replace(/[<>:"/\\|?*]+/g, "-").trim() || "room";
}

function titleCase(value) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function parseArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--room") out.room = args[++i];
    else if (arg === "--project") out.project = args[++i];
    else if (arg === "--vault") out.vault = args[++i];
    else if (arg === "--limit") out.limit = args[++i];
  }
  return out;
}

function isDirectRun() {
  return process.argv[1]?.replaceAll("\\", "/") === fileURLToPath(import.meta.url).replaceAll("\\", "/");
}
