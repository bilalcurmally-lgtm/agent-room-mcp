import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { AgentRoomStore } from "../src/store.js";

describe("room attachments", () => {
  it("uploads a file and attaches it to a message", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-attachments-"));
    const store = await AgentRoomStore.open(roomDir);
    const content = Buffer.from("hello attachment", "utf8");
    const uploaded = await store.uploadAttachment({
      fileName: "note.txt",
      mimeType: "text/plain",
      contentBase64: content.toString("base64"),
      uploadedBy: "user"
    });

    expect(uploaded.id).toMatch(/^att-/);
    expect(uploaded.url).toBe(`/api/attachments/${uploaded.id}`);

    const message = await store.postMessage({
      from: "user",
      to: "all",
      topic: "With file",
      body: "See attachment",
      attachmentIds: [uploaded.id]
    });

    expect(message.attachments).toMatchObject([
      { id: uploaded.id, name: "note.txt", kind: "file", mimeType: "text/plain" }
    ]);

    const { stored, content: readBack } = await store.readAttachmentFile(uploaded.id);
    expect(stored.fileName).toContain(uploaded.id);
    expect(readBack.toString("utf8")).toBe("hello attachment");

    const index = JSON.parse(await readFile(join(roomDir, "attachments.json"), "utf8"));
    expect(index).toHaveLength(1);
  });

  it("records inline https links on messages", async () => {
    const store = await AgentRoomStore.open(await mkdtemp(join(tmpdir(), "agent-room-attachments-")));
    const message = await store.postMessage({
      from: "user",
      to: "all",
      topic: "Link",
      body: "Doc link",
      links: [{ name: "Design doc", url: "https://example.com/design" }]
    });

    expect(message.attachments?.[0]).toMatchObject({
      kind: "link",
      name: "Design doc",
      url: "https://example.com/design"
    });
  });

  it("resolves attachments on tasks, task notes, and decisions", async () => {
    const store = await AgentRoomStore.open(await mkdtemp(join(tmpdir(), "agent-room-attachments-")));
    const uploaded = await store.uploadAttachment({
      fileName: "evidence.txt",
      mimeType: "text/plain",
      contentBase64: Buffer.from("evidence", "utf8").toString("base64")
    });

    const task = await store.createTask({
      title: "Review evidence",
      body: "Attachment should resolve.",
      attachmentIds: [uploaded.id]
    });
    expect(task).not.toHaveProperty("attachmentIds");
    expect(task.attachments).toMatchObject([{ id: uploaded.id, name: "evidence.txt", kind: "file" }]);

    const noted = await store.appendTaskNote({
      taskId: task.id,
      body: "Added link.",
      links: [{ name: "Spec", url: "https://example.com/spec" }]
    });
    expect(noted.notes[0].attachments).toMatchObject([{ kind: "link", name: "Spec" }]);

    const decision = await store.recordDecision({
      title: "Evidence stays attached",
      decision: "Keep attachment refs.",
      rationale: "Agents need durable proof.",
      attachmentIds: [uploaded.id],
      linkAttachments: [{ name: "Review", url: "https://example.com/review" }]
    });
    expect(decision.attachments).toMatchObject([
      { id: uploaded.id, kind: "file" },
      { kind: "link", name: "Review" }
    ]);
  });
});
