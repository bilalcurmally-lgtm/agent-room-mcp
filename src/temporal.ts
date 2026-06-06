import type { RoomTime } from "./time.js";

export interface FollowUpHint {
  phrase: string;
  label: string;
  dueIso?: string;
}

export interface StaleItemWarning {
  kind: "message" | "decision";
  id: string;
  title: string;
  project?: string;
  updatedAt: string;
  ageHours: number;
  message: string;
}

export function ageHoursFrom(iso: string, now = new Date()): number | null {
  const updatedAt = new Date(iso).getTime();
  if (Number.isNaN(updatedAt)) return null;
  return Math.floor(Math.max(0, now.getTime() - updatedAt) / 3_600_000);
}

export function formatRelativeTime(iso: string, now = new Date()): string {
  const updatedAt = new Date(iso).getTime();
  if (Number.isNaN(updatedAt)) return "unknown age";
  const seconds = Math.max(0, Math.floor((now.getTime() - updatedAt) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

const FOLLOW_UP_RULES: Array<{
  pattern: RegExp;
  label: (roomTime: RoomTime) => string;
  dueIso?: (roomTime: RoomTime) => string;
}> = [
  {
    pattern: /\blater today\b/i,
    label: () => "later today",
    dueIso: (roomTime) => endOfLocalDayIso(roomTime)
  },
  {
    pattern: /\btonight\b/i,
    label: () => "tonight",
    dueIso: (roomTime) => endOfLocalDayIso(roomTime)
  },
  {
    pattern: /\btomorrow\b/i,
    label: () => "tomorrow",
    dueIso: (roomTime) => addLocalDaysIso(roomTime, 1, 9)
  },
  {
    pattern: /\bnext week\b/i,
    label: () => "next week",
    dueIso: (roomTime) => addLocalDaysIso(roomTime, 7, 9)
  }
];

export function parseFollowUpHints(text: string, roomTime: RoomTime): FollowUpHint[] {
  const hints: FollowUpHint[] = [];
  const seen = new Set<string>();

  for (const rule of FOLLOW_UP_RULES) {
    const match = text.match(rule.pattern);
    if (!match || seen.has(match[0].toLowerCase())) continue;
    seen.add(match[0].toLowerCase());
    hints.push({
      phrase: match[0],
      label: rule.label(roomTime),
      dueIso: rule.dueIso?.(roomTime)
    });
  }

  return hints;
}

function endOfLocalDayIso(roomTime: RoomTime): string {
  return `${roomTime.date}T23:59:59${roomTime.utcOffset}`;
}

function addLocalDaysIso(roomTime: RoomTime, days: number, hour: number): string {
  const base = new Date(`${roomTime.date}T12:00:00${roomTime.utcOffset}`);
  if (Number.isNaN(base.getTime())) return endOfLocalDayIso(roomTime);
  base.setDate(base.getDate() + days);
  const year = base.getFullYear();
  const month = String(base.getMonth() + 1).padStart(2, "0");
  const day = String(base.getDate()).padStart(2, "0");
  const h = String(hour).padStart(2, "0");
  return `${year}-${month}-${day}T${h}:00:00${roomTime.utcOffset}`;
}

export function buildStaleItemWarnings<T extends { id: string; project?: string }>(
  items: T[],
  getUpdatedAt: (item: T) => string,
  getTitle: (item: T) => string,
  kind: StaleItemWarning["kind"],
  olderThanHours: number,
  options: { project?: string; now?: Date } = {}
): StaleItemWarning[] {
  const nowTime = (options.now ?? new Date()).getTime();

  return items.flatMap((item) => {
    if (options.project !== undefined && item.project !== options.project) return [];
    const updatedAt = new Date(getUpdatedAt(item)).getTime();
    if (Number.isNaN(updatedAt)) return [];
    const ageHours = Math.floor((nowTime - updatedAt) / 3_600_000);
    if (ageHours < olderThanHours) return [];

    const title = getTitle(item);
    return [
      {
        kind,
        id: item.id,
        title,
        project: item.project,
        updatedAt: getUpdatedAt(item),
        ageHours,
        message: `Re-check ${item.id}; this ${kind} has not changed in ${ageHours} hours.`
      }
    ];
  });
}