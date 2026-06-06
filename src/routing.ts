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

export function resolveAgentId(token: string, registeredAgentIds: readonly string[]): string | undefined {
  const normalized = token.toLowerCase();
  if (AGENT_ALIASES[normalized]) {
    const alias = AGENT_ALIASES[normalized];
    if (alias === "all") return "all";
    return registeredAgentIds.some((id) => id.toLowerCase() === alias) ? alias : undefined;
  }
  return registeredAgentIds.find((id) => id.toLowerCase() === normalized);
}

export function resolveMessageRoute(input: {
  body: string;
  to?: string;
  registeredAgentIds: readonly string[];
}): ResolvedRoute {
  const explicitTo = input.to?.trim();
  const tokens = parseMentionTokens(input.body);

  if (!tokens.length) {
    return {
      to: explicitTo || "all",
      parsedMentions: []
    };
  }

  const resolved = tokens
    .map((token) => resolveAgentId(token, input.registeredAgentIds))
    .filter((value): value is string => Boolean(value));

  if (resolved.includes("all")) {
    return { to: "all", parsedMentions: tokens };
  }

  const uniqueAgents = [...new Set(resolved.filter((id) => id !== "all"))];
  if (uniqueAgents.length === 1) {
    return {
      to: uniqueAgents[0],
      parsedMentions: tokens
    };
  }

  if (uniqueAgents.length > 1) {
    return {
      to: explicitTo && explicitTo !== "all" ? explicitTo : "all",
      mentions: uniqueAgents,
      parsedMentions: tokens
    };
  }

  return {
    to: explicitTo || "all",
    parsedMentions: tokens
  };
}

export function messageTargetsAgent(message: RoutableMessage, agent: string): boolean {
  if (message.from === agent) return false;
  if (Array.isArray(message.mentions) && message.mentions.length > 0) {
    return message.mentions.includes(agent);
  }
  if (message.to === "all") return true;
  return message.to === agent;
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