import { readFile } from "node:fs/promises";

export type RoadmapStatus = "done" | "partial" | "todo";

export interface RoadmapItem {
  title: string;
  status: RoadmapStatus;
}

export interface RoadmapProgress {
  done: number;
  total: number;
  remaining: number;
  percent: number;
  items: RoadmapItem[];
}

interface RoadmapFile {
  items: RoadmapItem[];
}

const DEFAULT_ROADMAP_ITEMS: RoadmapItem[] = [
  { title: "Project Registry And Folder Picker", status: "done" },
  { title: "Task Editing", status: "done" },
  { title: "Search And History", status: "partial" },
  { title: "App-Specific Setup Guides", status: "partial" },
  { title: "Ping/Watch Reliability", status: "partial" },
  { title: "Protocol Enforcement", status: "todo" },
  { title: "Easy Launcher", status: "todo" },
  { title: "Temporal Awareness", status: "partial" },
  { title: "Roadmap Progress Honesty", status: "partial" }
];

export async function loadRoadmapItems(path = "docs/ROADMAP.json"): Promise<RoadmapItem[]> {
  const file = JSON.parse(await readFile(path, "utf8")) as RoadmapFile;
  return file.items;
}

export async function getRoadmapProgressFromFile(path = "docs/ROADMAP.json"): Promise<RoadmapProgress> {
  try {
    return getRoadmapProgress(await loadRoadmapItems(path));
  } catch {
    return getRoadmapProgress();
  }
}

export function getRoadmapProgress(items: RoadmapItem[] = DEFAULT_ROADMAP_ITEMS): RoadmapProgress {
  const done = items.filter((item) => item.status === "done").length;
  const total = items.length;

  return {
    done,
    total,
    remaining: total - done,
    percent: Math.round((done / total) * 100),
    items
  };
}
