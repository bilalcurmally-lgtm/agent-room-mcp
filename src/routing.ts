export const AGENT_ALIASES: Record<string, string> = {
  all: "all",
  everyone: "all",
  room: "all",
  codex: "codex-desktop",
  claude: "claude-opus",
  cursor: "cursor",
  grok: "grok",
  antigravity: "antigravity"
};

const MENTION_PATTERN = /@([a-zA-Z][a-zA-Z0-9_-]*)/g;

export interface ResolvedRoute {
  to: string;
  mentions?: string[];
  parsedMentions: string[];
  /** Mention tokens that matched no registered agent; kept for audit/dashboard flagging. */
  unresolvedMentions?: string[];
}

export class UnresolvedMentionsError extends Error {
  readonly unresolvedMentions: string[];

  constructor(unresolved: string[], registeredAgentIds: readonly string[]) {
    const tags = unresolved.map((token) => `@${token}`).join(", ");
    const registered = registeredAgentIds.length ? [...registeredAgentIds].sort().join(", ") : "none";
    super(`unknown agent(s): ${tags} — registered: ${registered}`);
    this.name = "UnresolvedMentionsError";
    this.unresolvedMentions = unresolved;
  }
}

export interface RoutableMessage {
  from: string;
  to: string;
  mentions?: string[];
}

export function parseMentionTokens(text: string): string[] {
  const tokens: string[] = [];
  for (const match of text.matchAll(MENTION_PATTERN)) {
    const token = match[1]?.toLowerCase();
    if (token && !tokens.includes(token)) tokens.push(token);
  }
  return tokens;
}

function registeredAgentMatch(registeredAgentIds: readonly string[], target: string): string | undefined {
  return registeredAgentIds.find((id) => id.toLowerCase() === target.toLowerCase());
}

/** Prefer grok-cli when @grok / "To Grok" is used but only grok-cli has joined. */
function resolveGrokAgentId(registeredAgentIds: readonly string[]): string | undefined {
  return registeredAgentMatch(registeredAgentIds, "grok") ?? registeredAgentMatch(registeredAgentIds, "grok-cli");
}

export function resolveAgentId(token: string, registeredAgentIds: readonly string[]): string | undefined {
  const normalized = token.toLowerCase();
  const alias = AGENT_ALIASES[normalized];
  if (alias === "all") return "all";
  if (alias) {
    const exact = registeredAgentMatch(registeredAgentIds, alias);
    if (exact) return exact;
  }
  // Alias-target miss must not block an agent registered under the literal token.
  const direct = registeredAgentMatch(registeredAgentIds, normalized);
  if (direct) return direct;
  if (normalized === "grok") return resolveGrokAgentId(registeredAgentIds);
  return undefined;
}

export function normalizeRouteTarget(to: string, registeredAgentIds: readonly string[]): string {
  const trimmed = to.trim();
  if (!trimmed || trimmed === "all") return trimmed || "all";
  return resolveAgentId(trimmed, registeredAgentIds) ?? trimmed;
}

export function resolveMessageRoute(input: {
  body: string;
  to?: string;
  registeredAgentIds: readonly string[];
}): ResolvedRoute {
  const explicitTo = input.to?.trim();
  const normalizedExplicit = normalizeRouteTarget(explicitTo || "all", input.registeredAgentIds);
  const tokens = parseMentionTokens(input.body);

  if (!tokens.length) {
    return {
      to: normalizedExplicit,
      parsedMentions: []
    };
  }

  const resolvedByToken = tokens.map((token) => resolveAgentId(token, input.registeredAgentIds));
  const resolved = resolvedByToken.filter((value): value is string => Boolean(value));
  const unresolvedMentions = tokens.filter((_, index) => !resolvedByToken[index]);
  const withUnresolved = unresolvedMentions.length ? { unresolvedMentions } : {};
  const uniqueAgents = [...new Set(resolved.filter((id) => id !== "all"))];

  // An explicit recipient always wins (P0-04): body mentions add notified agents
  // but never reroute the message — quoting someone must not change the recipient.
  if (explicitTo && normalizedExplicit !== "all") {
    return {
      to: normalizedExplicit,
      ...(uniqueAgents.length ? { mentions: uniqueAgents } : {}),
      parsedMentions: tokens,
      ...withUnresolved
    };
  }

  if (resolved.includes("all")) {
    return { to: "all", parsedMentions: tokens, ...withUnresolved };
  }

  if (uniqueAgents.length === 1) {
    return {
      to: uniqueAgents[0],
      parsedMentions: tokens,
      ...withUnresolved
    };
  }

  if (uniqueAgents.length > 1) {
    return {
      to: "all",
      mentions: uniqueAgents,
      parsedMentions: tokens,
      ...withUnresolved
    };
  }

  // Every mention token failed to resolve and there is no explicit recipient.
  // Broadcasting here is the P0-01 bug: a targeted ping must never silently
  // widen into a room-wide one.
  throw new UnresolvedMentionsError(unresolvedMentions, input.registeredAgentIds);
}

export function messageTargetsAgent(message: RoutableMessage, agent: string): boolean {
  if (message.from === agent) return false;
  // The explicit recipient is always targeted; mentions are additive (P0-04),
  // and on a broadcast they narrow delivery to the named agents only.
  if (message.to === agent) return true;
  if (Array.isArray(message.mentions) && message.mentions.length > 0) {
    return message.mentions.includes(agent);
  }
  return message.to === "all";
}

export function formatRouteLabel(route: string, mentions?: string[]): string {
  if (mentions?.length) {
    return mentions.join(", ");
  }
  const trimmed = (route || "all").trim();
  if (trimmed === "all") return "all agents";
  if (trimmed === "codex-desktop") return "Codex";
  if (trimmed === "claude-opus") return "Claude";
  return trimmed;
}

export function formatRoomPingText(
  messages: Array<{ id: string; from: string; to: string; topic?: string; body: string; project?: string }>,
  options: { total?: number } = {}
): string {
  if (!messages.length) return "";
  const lines = [`ROOM: ${messages.length} new message${messages.length === 1 ? "" : "s"}`];
  for (const message of messages) {
    const project = message.project ? ` (${message.project})` : "";
    const summary = [message.topic, trimOneLine(message.body)].filter(Boolean).join(" - ");
    lines.push(`[${message.id}] ${message.from} -> ${message.to}${project}: ${summary}`);
  }
  const overflow = Math.max(0, (options.total ?? messages.length) - messages.length);
  if (overflow > 0) lines.push(`+${overflow} more, run check_in`);
  return lines.join("\n");
}

function trimOneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 160);
}