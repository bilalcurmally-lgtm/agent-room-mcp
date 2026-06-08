import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startAgentWakeWatch } from "../scripts/agent-wake-watch.mjs";

// Acceptance test for the wake contract (docs/WAKE_CONTRACT.md).
//
// Exercises the real startAgentWakeWatch drain loop against a temp room with a
// fake `wake` launcher (we assert *that* a turn would be spawned and with which
// ids, not the CLI itself). This replaces relying on live probes to prove:
//   1. a single routed post wakes the target exactly once with the new ids,
//   2. the cursor advances so re-draining does not re-wake (no toast/turn spam),
//   3. a fresh watcher (process/session restart) resumes from the persisted
//      cursor and never replays history,
//   4. self-posts and other recipients never wake the agent,
//   5. trust is derived from the batch's senders.

const AGENT = "claude-opus";

type WakeCall = { messageIds: string[]; trusted: boolean; agent: string };

let roomDir: string;
let messagesPath: string;
let cursorPath: string;

const recordingWake = () => {
  const calls: WakeCall[] = [];
  const wake = async ({ messageIds, trusted, agent }: WakeCall) => {
    calls.push({ messageIds, trusted, agent });
    return { code: 0, stdout: "", stderr: "" };
  };
  return { calls, wake };
};

let nextSeq = 0;
const post = async (over: Record<string, unknown> = {}) => {
  nextSeq += 1;
  const message = {
    id: String(nextSeq).padStart(6, "0"),
    from: "Bilal",
    to: "all",
    topic: "t",
    body: "hi",
    ...over
  };
  await writeFile(messagesPath, `${JSON.stringify(message)}\n`, { encoding: "utf8", flag: "a" });
  return message.id;
};

const watch = (wake: (call: WakeCall) => Promise<{ code: number; stdout: string; stderr: string }>) =>
  startAgentWakeWatch({ agent: AGENT, profile: "codex", roomDir, wake, writePid: false });

beforeEach(async () => {
  nextSeq = 0;
  roomDir = await mkdtemp(join(tmpdir(), "wake-accept-"));
  messagesPath = join(roomDir, "messages.jsonl");
  cursorPath = join(roomDir, `.${AGENT}-wake-watch-lastseen`);
  await writeFile(messagesPath, "", "utf8");
});

afterEach(async () => {
  await rm(roomDir, { recursive: true, force: true });
});

describe("wake contract: single post wakes the target once", () => {
  it("spawns one turn carrying the new routed id", async () => {
    const { calls, wake } = recordingWake();
    const handle = await watch(wake);
    const id = await post({ to: AGENT });
    await handle.drain();
    handle.close();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ agent: AGENT, messageIds: [id] });
  });

  it("wakes exactly once per routed post (no duplicate turns)", async () => {
    const { calls, wake } = recordingWake();
    const handle = await watch(wake);
    const a = await post({ to: "all" });
    await handle.drain();
    const b = await post({ to: AGENT });
    await handle.drain();
    handle.close();

    expect(calls).toHaveLength(2);
    expect(calls.flatMap((c) => c.messageIds)).toEqual([a, b]);
  });
});

describe("wake contract: idempotent cursor (no turn spam)", () => {
  it("advances the cursor and does not re-wake on a second drain", async () => {
    const { calls, wake } = recordingWake();
    const handle = await watch(wake);
    await post({ to: AGENT });
    await handle.drain();
    await handle.drain();
    handle.close();

    expect(calls).toHaveLength(1);
    const persisted = (await readFile(cursorPath, "utf8")).trim();
    expect(persisted).toBe("000001");
  });
});

describe("wake contract: survives restart, never replays history", () => {
  it("a fresh watcher resumes from the persisted cursor", async () => {
    const first = recordingWake();
    const h1 = await watch(first.wake);
    await post({ to: AGENT });
    await h1.drain();
    h1.close();
    expect(first.calls).toHaveLength(1);

    // Simulate a process/session restart: brand-new watcher, same room.
    const second = recordingWake();
    const h2 = await watch(second.wake);
    await h2.drain();
    // Old message must not replay.
    expect(second.calls).toHaveLength(0);

    // A genuinely new post after restart still wakes.
    const fresh = await post({ to: AGENT });
    await h2.drain();
    h2.close();
    expect(second.calls).toHaveLength(1);
    expect(second.calls[0].messageIds).toEqual([fresh]);
  });

  it("a first-ever watcher against an existing room does not replay backlog", async () => {
    // Backlog exists before any watcher / cursor.
    await post({ to: AGENT });
    await post({ to: "all" });

    const { calls, wake } = recordingWake();
    const handle = await watch(wake);
    await handle.drain();
    handle.close();

    expect(calls).toHaveLength(0);
    const persisted = (await readFile(cursorPath, "utf8")).trim();
    expect(persisted).toBe("000002");
  });
});

describe("wake contract: routing and self-posts", () => {
  it("never wakes on the agent's own posts or on other recipients", async () => {
    const { calls, wake } = recordingWake();
    const handle = await watch(wake);
    await post({ to: AGENT, from: AGENT }); // own post
    await post({ to: "codex-desktop" }); // other recipient
    await handle.drain();
    handle.close();

    expect(calls).toHaveLength(0);
  });
});

describe("wake contract: trust is derived from the batch", () => {
  it("marks trusted when a trusted sender is in the batch", async () => {
    const { calls, wake } = recordingWake();
    const handle = await watch(wake);
    await post({ to: AGENT, from: "Bilal" });
    await handle.drain();
    handle.close();

    expect(calls[0].trusted).toBe(true);
  });

  it("marks untrusted when only untrusted senders posted", async () => {
    const { calls, wake } = recordingWake();
    const handle = await watch(wake);
    await post({ to: AGENT, from: "wake-probe" });
    await handle.drain();
    handle.close();

    expect(calls[0].trusted).toBe(false);
  });
});
