import type { RoomMessage } from "./store.js";

export const PROTOCOL_STATUSES = ["planning", "implementing", "reviewing", "blocked"] as const;
export type ProtocolStatus = (typeof PROTOCOL_STATUSES)[number];

export const PROTOCOL_PHASE_PRESETS = ["review", "blocked", "merge", "handoff"] as const;

export interface ProtocolFields {
  status?: string;
  next?: string;
  phase?: string;
}

export interface ProtocolCompliance extends ProtocolFields {
  missing: string[];
  invalid: string[];
}

export interface ProtocolWarning {
  messageId: string;
  from: string;
  to: string;
  topic: string;
  time: string;
  project?: string;
  missing: string[];
  invalid: string[];
  status?: string;
  next?: string;
  phase?: string;
  message: string;
}

export function parseProtocolTag(body: string, tag: "STATUS" | "NEXT" | "PHASE"): string | undefined {
  const match = body.match(new RegExp(`\\[${tag}:\\s*([^\\]\\n]+)\\]`, "i"));
  return match?.[1]?.trim();
}

export function isValidProtocolStatus(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  return (PROTOCOL_STATUSES as readonly string[]).includes(value.trim().toLowerCase());
}

export function normalizeProtocolStatus(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const normalized = value.trim().toLowerCase();
  if ((PROTOCOL_STATUSES as readonly string[]).includes(normalized)) return normalized;
  return value.trim();
}

export function isValidProtocolPhase(phase: string | undefined): boolean {
  if (!phase?.trim()) return true;
  const trimmed = phase.trim();
  if (/^C\d+$/i.test(trimmed)) return true;
  return (PROTOCOL_PHASE_PRESETS as readonly string[]).includes(trimmed.toLowerCase());
}

export function assessProtocolCompliance(input: {
  from: string;
  body: string;
  status?: string;
  next?: string;
  phase?: string;
}): ProtocolCompliance {
  const status = input.status ?? parseProtocolTag(input.body, "STATUS");
  const next = input.next ?? parseProtocolTag(input.body, "NEXT");
  const phase = input.phase ?? parseProtocolTag(input.body, "PHASE");

  if (input.from === "user") {
    return {
      missing: [],
      invalid: [],
      status: status ? normalizeProtocolStatus(status) : undefined,
      next: next?.trim(),
      phase: phase?.trim()
    };
  }

  const missing: string[] = [];
  if (!status) missing.push("[STATUS:]");
  if (!next) missing.push("[NEXT:]");

  const invalid: string[] = [];
  if (status && !isValidProtocolStatus(status)) {
    invalid.push(`[STATUS: ${status}]`);
  }
  if (phase && !isValidProtocolPhase(phase)) {
    invalid.push(`[PHASE: ${phase}]`);
  }

  return {
    missing,
    invalid,
    status: status ? normalizeProtocolStatus(status) : undefined,
    next: next?.trim(),
    phase: phase?.trim()
  };
}

export function enrichMessageBody(body: string, fields: ProtocolFields): string {
  let result = body.trim();
  if (fields.phase && !/\[PHASE:/i.test(result)) {
    result = `[PHASE: ${fields.phase}]\n${result}`;
  }
  if (fields.status && !/\[STATUS:/i.test(result)) {
    result = `[STATUS: ${fields.status}]\n${result}`;
  }
  if (fields.next && !/\[NEXT:/i.test(result)) {
    result = `${result}\n\n[NEXT: ${fields.next}]`;
  }
  return result;
}

export function assertProtocolCompliant(
  input: { from: string; body: string } & ProtocolFields,
  enforceProtocol: boolean
): void {
  if (!enforceProtocol) return;
  const compliance = assessProtocolCompliance(input);
  if (compliance.missing.length === 0 && compliance.invalid.length === 0) return;

  const parts = [
    ...compliance.missing.map((field) => `missing ${field}`),
    ...compliance.invalid.map((field) => `invalid ${field}`)
  ];
  throw new Error(`Protocol enforcement rejected message from ${input.from}: ${parts.join("; ")}.`);
}

export function formatProtocolWarningMessage(
  from: string,
  missing: string[],
  invalid: string[]
): string {
  const parts: string[] = [];
  if (missing.length) parts.push(`Missing ${formatList(missing)}`);
  if (invalid.length) parts.push(`Invalid ${formatList(invalid)}`);
  return `${parts.join(". ")}. Ask ${from} to repost with protocol fields.`;
}

export function protocolWarningsForMessages(messages: RoomMessage[]): ProtocolWarning[] {
  return messages.flatMap((message) => {
    const compliance = assessProtocolCompliance({
      from: message.from,
      body: message.body,
      status: message.status,
      next: message.next,
      phase: message.phase
    });

    if (compliance.missing.length === 0 && compliance.invalid.length === 0) return [];

    return [
      {
        messageId: message.id,
        from: message.from,
        to: message.to,
        topic: message.topic,
        time: message.time,
        project: message.project,
        missing: compliance.missing,
        invalid: compliance.invalid,
        status: compliance.status,
        next: compliance.next,
        phase: compliance.phase,
        message: formatProtocolWarningMessage(message.from, compliance.missing, compliance.invalid)
      }
    ];
  });
}

function formatList(fields: string[]): string {
  if (fields.length <= 1) return fields.join("");
  return `${fields.slice(0, -1).join(", ")} and ${fields[fields.length - 1]}`;
}