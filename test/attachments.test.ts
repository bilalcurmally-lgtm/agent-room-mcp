import { describe, expect, it } from "vitest";
import {
  decodeAttachmentContent,
  inlineLinkRef,
  isAllowedMimeType,
  sanitizeAttachmentFileName,
  validateLinkUrl
} from "../src/attachments.js";

describe("attachments policy", () => {
  it("allows common text and image mime types", () => {
    expect(isAllowedMimeType("text/plain")).toBe(true);
    expect(isAllowedMimeType("image/png")).toBe(true);
    expect(isAllowedMimeType("application/pdf")).toBe(true);
    expect(isAllowedMimeType("application/x-msdownload")).toBe(false);
  });

  it("sanitizes unsafe file names", () => {
    expect(sanitizeAttachmentFileName("report:final.pdf")).toBe("report_final.pdf");
  });

  it("rejects oversize binary payloads", () => {
    const huge = Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64");
    expect(() => decodeAttachmentContent(huge)).toThrow(/byte limit/);
  });

  it("rejects malformed base64 payloads", () => {
    expect(() => decodeAttachmentContent("not valid base64")).toThrow(/valid base64/);
  });

  it("accepts http(s) links only", () => {
    expect(validateLinkUrl("https://example.com/doc")).toBe("https://example.com/doc");
    expect(() => validateLinkUrl("file:///tmp/x")).toThrow(/http/);
  });

  it("builds stable inline link refs", () => {
    const ref = inlineLinkRef("Spec", "https://example.com/spec");
    expect(ref).toMatchObject({ kind: "link", name: "Spec", url: "https://example.com/spec" });
  });
});
