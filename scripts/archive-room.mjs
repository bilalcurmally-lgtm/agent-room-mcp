#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";
import { AgentRoomStore } from "../dist/store.js";

const DEFAULT_ROOM_DIR = join(homedir(), ".agent-room");
const DEFAULT_DAYS = 30;

export function resolveArchiveOptions(args, env = process.env) {
  const days = Number(valueAfter(args, "--days") ?? env.AGENT_ROOM_ARCHIVE_DAYS ?? DEFAULT_DAYS);
  if (!Number.isInteger(days) || days <= 0) throw new Error("--days must be a positive integer");
  return {
    days,
    roomDir: valueAfter(args, "--room") ?? env.AGENT_ROOM_DIR ?? DEFAULT_ROOM_DIR
  };
}

function valueAfter(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  const options = resolveArchiveOptions(process.argv.slice(2));
  const store = await AgentRoomStore.open(options.roomDir);
  const result = await store.archiveMessages({ olderThanDays: options.days });
  console.log(
    JSON.stringify(
      {
        roomDir: options.roomDir,
        olderThanDays: options.days,
        ...result
      },
      null,
      2
    )
  );
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll("\\", "/")}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
