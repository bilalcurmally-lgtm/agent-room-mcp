import { access, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  DEFAULT_ROADMAP_ITEMS,
  getRoadmapProgress,
  loadRoadmapItems,
  type RoadmapItem,
  type RoadmapProgress,
  type RoadmapStatus
} from "./progress.js";
import type { RoomAgent, RoomConfig, RoomDecision, RoomMessage, RoomProject, RoomTask } from "./store.js";

export interface RoomSnapshotForProgress {
  roomDir: string;
  projects: RoomProject[];
  tasks: RoomTask[];
  decisions: RoomDecision[];
  messages: RoomMessage[];
  agents: RoomAgent[];
  protocolWarningCount: number;
  config: RoomConfig;
}

export interface DerivedRoadmapSlice {
  status: RoadmapStatus;
  evidence: string;
}

export interface EnrichedRoadmapItem extends RoadmapItem {
  fileStatus: RoadmapStatus;
  roomStatus?: RoadmapStatus;
  evidence: string;
  source: "file" | "room" | "merged";
}

export interface EnrichedRoadmapProgress extends RoadmapProgress {
  items: EnrichedRoadmapItem[];
  roomDriven: boolean;
}

export async function hasLauncherMarker(roomDir: string): Promise<boolean> {
  try {
    await access(join(roomDir, ".launcher-suite.json"));
    return true;
  } catch {
    return false;
  }
}

async function hasPingOrWatchMarkers(roomDir: string): Promise<boolean> {
  try {
    const entries = await readdir(roomDir);
    return entries.some((entry) => entry.startsWith(".lastseen-") || entry.startsWith(".watch-lastseen-"));
  } catch {
    return false;
  }
}

export function deriveRoomRoadmapSlices(ctx: RoomSnapshotForProgress): Map<string, DerivedRoadmapSlice> {
  const slices = new Map<string, DerivedRoadmapSlice>();
  const agentCount = ctx.agents.filter((agent) => agent.id !== "user").length;
  const editedTasks = ctx.tasks.filter((task) => task.notes.length > 0 || task.status !== "open");

  slices.set("Project Registry And Folder Picker", {
    status: ctx.projects.length > 0 ? "done" : "todo",
    evidence:
      ctx.projects.length > 0
        ? `${ctx.projects.length} registered project folder(s) in the room`
        : "No registered project folders yet"
  });

  slices.set("Task Editing", {
    status: editedTasks.length > 0 ? "done" : ctx.tasks.length > 0 ? "partial" : "todo",
    evidence:
      editedTasks.length > 0
        ? `${editedTasks.length} task(s) with status changes or notes`
        : ctx.tasks.length > 0
          ? `${ctx.tasks.length} task(s) exist but none are edited yet`
          : "No room tasks yet"
  });

  const searchSignals =
    Boolean(ctx.config.currentUser) && (ctx.messages.length > 0 || ctx.tasks.some((task) => task.notes.length > 0));
  slices.set("Search And History", {
    status: searchSignals ? "done" : ctx.messages.length > 0 ? "partial" : "todo",
    evidence: searchSignals
      ? "Room has messages/tasks and a saved current-user identity for filters"
      : ctx.messages.length > 0
        ? "Messages exist but filter identity/history features are not in use yet"
        : "No searchable room history yet"
  });

  slices.set("App-Specific Setup Guides", {
    status: agentCount >= 2 ? "done" : agentCount === 1 ? "partial" : "todo",
    evidence:
      agentCount >= 2
        ? `${agentCount} agents checked in (${ctx.agents.map((agent) => agent.id).join(", ")})`
        : agentCount === 1
          ? "Only one agent has checked in so far"
          : "No agents registered in the room yet"
  });

  return slices;
}

export async function deriveRoomRoadmapSlicesAsync(
  ctx: RoomSnapshotForProgress
): Promise<Map<string, DerivedRoadmapSlice>> {
  const slices = deriveRoomRoadmapSlices(ctx);
  const pingWatch = await hasPingOrWatchMarkers(ctx.roomDir);
  const structuredMessages = ctx.messages.filter(
    (message) => message.from !== "user" && (message.status || /\[STATUS:/i.test(message.body))
  );

  slices.set("Ping/Watch Reliability", {
    status: pingWatch ? "done" : ctx.messages.length > 0 ? "partial" : "todo",
    evidence: pingWatch
      ? "Room has hook or watcher last-seen state on disk"
      : ctx.messages.length > 0
        ? "Messages exist but ping/watch state files are missing"
        : "No ping/watch activity recorded in the room"
  });

  const protocolSignals =
    ctx.config.enforceProtocol ||
    structuredMessages.length > 0 ||
    ctx.protocolWarningCount > 0;
  slices.set("Protocol Enforcement", {
    status: structuredMessages.length > 0 && ctx.protocolWarningCount === 0 ? "done" : protocolSignals ? "partial" : "todo",
    evidence:
      structuredMessages.length > 0 && ctx.protocolWarningCount === 0
        ? `${structuredMessages.length} structured agent message(s), no protocol warnings`
        : ctx.protocolWarningCount > 0
          ? `${ctx.protocolWarningCount} protocol warning(s) still open`
          : ctx.config.enforceProtocol
            ? "Strict protocol mode enabled but few structured messages yet"
            : "No structured agent protocol messages yet"
  });

  const launcher = await hasLauncherMarker(ctx.roomDir);
  slices.set("Easy Launcher", {
    status: launcher ? "done" : "partial",
    evidence: launcher
      ? "Launcher suite marker present in the room directory"
      : "Use npm run install-suite or start-suite to record launcher setup"
  });

  const temporalSignals =
    ctx.config.staleTaskHours > 0 && ctx.messages.length > 0 && ctx.tasks.length > 0;
  slices.set("Temporal Awareness", {
    status: temporalSignals ? "done" : ctx.config.staleTaskHours > 0 ? "partial" : "todo",
    evidence: temporalSignals
      ? `Relative time, follow-up hints, and stale task/message/decision warnings (${ctx.config.staleTaskHours}h threshold)`
      : ctx.config.staleTaskHours > 0
        ? "Stale threshold configured but room history is still sparse"
        : "Room time/stale settings are not fully in use yet"
  });

  slices.set("Roadmap Progress Honesty", {
    status: "done",
    evidence: "Progress bar merges ROADMAP.json with live room evidence"
  });

  return slices;
}

export function enrichRoadmapItems(
  fileItems: RoadmapItem[],
  roomSlices: Map<string, DerivedRoadmapSlice>
): EnrichedRoadmapItem[] {
  return fileItems.map((fileItem) => {
    const room = roomSlices.get(fileItem.title);
    const roomStatus = room?.status;
    const status = roomStatus ?? fileItem.status;
    const source: EnrichedRoadmapItem["source"] =
      !roomStatus ? "file" : roomStatus === fileItem.status ? "merged" : "room";

    return {
      title: fileItem.title,
      status,
      fileStatus: fileItem.status,
      roomStatus,
      evidence: room?.evidence ?? "Manual ROADMAP.json status only",
      source
    };
  });
}

export async function getRoadmapProgressForRoom(
  ctx: RoomSnapshotForProgress,
  roadmapPath = "docs/ROADMAP.json"
): Promise<EnrichedRoadmapProgress> {
  let fileItems: RoadmapItem[];
  try {
    fileItems = await loadRoadmapItems(roadmapPath);
  } catch {
    fileItems = DEFAULT_ROADMAP_ITEMS;
  }

  const roomSlices = await deriveRoomRoadmapSlicesAsync(ctx);
  const items = enrichRoadmapItems(fileItems, roomSlices);
  const summary = getRoadmapProgress(items);

  return {
    ...summary,
    items,
    roomDriven: items.some((item) => item.source === "room" || item.source === "merged")
  };
}