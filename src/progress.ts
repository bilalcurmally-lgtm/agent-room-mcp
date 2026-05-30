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

const ROADMAP_ITEMS: RoadmapItem[] = [
  { title: "Project Registry And Folder Picker", status: "done" },
  { title: "Task Editing", status: "done" },
  { title: "Search And History", status: "partial" },
  { title: "App-Specific Setup Guides", status: "partial" },
  { title: "Ping/Watch Reliability", status: "partial" },
  { title: "Protocol Enforcement", status: "todo" },
  { title: "Easy Launcher", status: "todo" },
  { title: "Temporal Awareness", status: "partial" }
];

export function getRoadmapProgress(): RoadmapProgress {
  const done = ROADMAP_ITEMS.filter((item) => item.status === "done").length;
  const total = ROADMAP_ITEMS.length;

  return {
    done,
    total,
    remaining: total - done,
    percent: Math.round((done / total) * 100),
    items: ROADMAP_ITEMS
  };
}
