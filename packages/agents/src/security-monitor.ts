/**
 * Autonomous security monitor — an opt-in LLM judge that vets a single pending
 * write/execute/external tool call before it runs, from inside the existing
 * permission gate ({@link file://./tools/tool-permissions.ts}).
 *
 * The monitor reuses the gate's read/write/execute/external classification:
 * read-class tools are never consulted (enforced by the gate). For every other
 * class the monitor is handed { action name, category, args, recent transcript }
 * and returns a strict verdict: { block, reason, severity, tier }. The judge
 * enforces a two-tier model — HARD blocks (never cleared by user intent) and
 * SOFT blocks (clearable by precise, explicit user intent in the transcript).
 * The clearing logic lives entirely in the judge prompt; this class trusts the
 * returned `block` flag.
 *
 * Fail-OPEN: when the judge errors or returns unparseable output, the verdict
 * defaults to ALLOW (block:false) and a warning is logged. This honors the
 * prompt's "actions are allowed by default" stance and avoids bricking an
 * autonomous run when the judge model hiccups. This is a deliberate security
 * tradeoff; a fail-closed mode for HARD-suspect actions would be a future
 * follow-up, not a silent default.
 *
 * This module performs a single non-streaming provider call per review via
 * `provider.generateMessageTraced`. It is fully opt-in and constructed only
 * when an agent enables it — when no monitor is wired into the gate, the gate
 * behaves byte-for-byte as before.
 */

import { createLogger } from "@nodetool-ai/config";
import type {
  BaseProvider,
  Message,
  MessageContent
} from "@nodetool-ai/runtime";
import { extractJSON } from "./utils/json-parser.js";
import type { PermissionCategory } from "./tools/tool-permissions.js";
import {
  SECURITY_MONITOR_SYSTEM_PROMPT,
  buildSecurityMonitorUserPrompt
} from "./prompts/security-monitor-prompt.js";

const log = createLogger("nodetool.agents.security-monitor");

/** How severe the judged concern is. */
export type SecuritySeverity = "low" | "medium" | "high" | "critical";

/**
 * Block tier. `hard` = a security boundary; never cleared by user intent.
 * `soft` = destructive/irreversible but clearable by precise user intent.
 * `none` = allowed.
 */
export type SecurityTier = "hard" | "soft" | "none";

/** The single pending action handed to the judge. */
export interface PendingAction {
  /** Tool name about to run. */
  name: string;
  /** Permission category of the tool. */
  category: PermissionCategory;
  /** Tool arguments (with the reserved `_message` field already stripped). */
  args: Record<string, unknown>;
  /** Recent transcript text, used to evaluate user-intent clearing of SOFT blocks. */
  transcript?: string;
}

/** The judge's structured verdict for one pending action. */
export interface SecurityVerdict {
  block: boolean;
  reason: string;
  severity: SecuritySeverity;
  tier: SecurityTier;
}

export interface SecurityMonitorOptions {
  provider: BaseProvider;
  model: string;
  /** Max characters of transcript forwarded to the judge. Default 8000. */
  maxTranscriptChars?: number;
  /** Max characters of serialized args forwarded to the judge. Default 4000. */
  maxArgChars?: number;
  /** Optional thread/conversation id passed to the provider call. */
  threadId?: string;
}

const DEFAULT_MAX_TRANSCRIPT_CHARS = 8_000;
const DEFAULT_MAX_ARG_CHARS = 4_000;
const JUDGE_MAX_TOKENS = 300;
const TRUNCATION_MARKER = "…[truncated]";

const SEVERITIES: ReadonlySet<string> = new Set<SecuritySeverity>([
  "low",
  "medium",
  "high",
  "critical"
]);
const TIERS: ReadonlySet<string> = new Set<SecurityTier>([
  "hard",
  "soft",
  "none"
]);

/** The fail-open verdict used whenever the judge can't produce a usable answer. */
const ALLOW_VERDICT: SecurityVerdict = {
  block: false,
  reason: "",
  severity: "low",
  tier: "none"
};

/** Truncate a string to `max` chars, appending a visible marker when cut. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + TRUNCATION_MARKER;
}

/** Extract a plain string from a message's content (string | parts | other). */
function extractText(content: Message["content"]): string {
  if (content === null || content === undefined) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const part of content as MessageContent[]) {
      if (
        typeof part === "object" &&
        part !== null &&
        "text" in part &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        parts.push((part as { text: string }).text);
      }
    }
    return parts.join("");
  }
  return "";
}

/** Coerce an unknown into a {@link SecuritySeverity}, defaulting to "low". */
function coerceSeverity(value: unknown): SecuritySeverity {
  if (typeof value === "string" && SEVERITIES.has(value)) {
    return value as SecuritySeverity;
  }
  return "low";
}

/** Coerce an unknown into a {@link SecurityTier}, defaulting to "none". */
function coerceTier(value: unknown): SecurityTier {
  if (typeof value === "string" && TIERS.has(value)) {
    return value as SecurityTier;
  }
  return "none";
}

/** Interpret a loose boolean-ish value ("yes"/"true"/true) as a block flag. */
function coerceBlock(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    return lowered === "true" || lowered === "yes" || lowered === "1";
  }
  return false;
}

function tagBody(text: string, tag: string): string | null {
  const match = text.match(
    new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i")
  );
  return match ? match[1].trim() : null;
}

/**
 * Parse a verdict from the judge's raw message text. Strategy order:
 *   1. The strict JSON object (direct or via {@link extractJSON} fence/brace
 *      recovery).
 *   2. The alternate `<block>…</block><reason>…</reason>` tag form.
 * Returns null when neither yields a usable verdict, letting the caller apply
 * the fail-open default.
 */
/**
 * Scan `text` for the first balanced `{…}` object that actually parses AND
 * contains a `block` or `tier` key. `extractJSON` returns the FIRST balanced
 * object, which — for a verbose judge that prepends prose containing another
 * object (e.g. echoing the tool args it was shown) — is not the verdict. Using
 * that wrong object made a real BLOCK decision fall through to the fail-open
 * ALLOW default.
 */
function findVerdictObject(text: string): Record<string, unknown> | null {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let j = i; j < text.length; j++) {
      const ch = text[j];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const candidate = text.slice(i, j + 1);
          try {
            const obj = JSON.parse(candidate);
            if (
              obj &&
              typeof obj === "object" &&
              !Array.isArray(obj) &&
              ("block" in obj || "tier" in obj)
            ) {
              return obj as Record<string, unknown>;
            }
          } catch {
            // not valid JSON — keep scanning from the next "{"
          }
          break; // move outer loop past this object
        }
      }
    }
  }
  return null;
}

export function parseVerdict(text: string): SecurityVerdict | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Strategy 1: the verdict JSON object (the first balanced object that carries
  // block/tier), falling back to extractJSON's fence/brace recovery.
  const scanned = findVerdictObject(trimmed);
  const parsed = scanned ?? extractJSON(trimmed);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    if ("block" in obj || "tier" in obj) {
      const tier = coerceTier(obj["tier"]);
      // Fail safe: block when `block` is truthy OR the tier is non-"none". A
      // non-boolean `block` (e.g. {block:1,tier:"hard"}) coerces to false, which
      // combined with a hard/soft tier would otherwise fail open — the tier
      // rescues it. A `{tier:"hard"}` with no block field blocks the same way.
      const block = coerceBlock(obj["block"]) || tier !== "none";
      return {
        block,
        tier,
        severity: coerceSeverity(obj["severity"]),
        reason: typeof obj["reason"] === "string" ? obj["reason"] : ""
      };
    }
  }

  // Strategy 2: tag form, e.g. <block>yes</block><reason>…</reason>.
  const blockTag = tagBody(trimmed, "block");
  const tierTag = tagBody(trimmed, "tier");
  if (blockTag !== null || tierTag !== null) {
    const tier = coerceTier(tierTag);
    return {
      block: blockTag !== null ? coerceBlock(blockTag) : tier !== "none",
      tier,
      severity: coerceSeverity(tagBody(trimmed, "severity")),
      reason: tagBody(trimmed, "reason") ?? ""
    };
  }

  return null;
}

/**
 * The LLM judge. One {@link review} call per actionable tool invocation.
 */
export class SecurityMonitor {
  private readonly provider: BaseProvider;
  private readonly model: string;
  private readonly maxTranscriptChars: number;
  private readonly maxArgChars: number;
  private readonly threadId?: string;

  constructor(opts: SecurityMonitorOptions) {
    this.provider = opts.provider;
    this.model = opts.model;
    this.maxTranscriptChars =
      opts.maxTranscriptChars ?? DEFAULT_MAX_TRANSCRIPT_CHARS;
    this.maxArgChars = opts.maxArgChars ?? DEFAULT_MAX_ARG_CHARS;
    this.threadId = opts.threadId;
  }

  /**
   * Judge a single pending action. Returns a {@link SecurityVerdict}. On any
   * provider error or unparseable output, returns the fail-open ALLOW verdict
   * and logs a warning (see module header for the rationale).
   */
  async review(action: PendingAction): Promise<SecurityVerdict> {
    let argsJson: string;
    try {
      argsJson = JSON.stringify(action.args ?? {}, null, 2);
    } catch {
      argsJson = String(action.args);
    }
    const userMsg = buildSecurityMonitorUserPrompt({
      name: action.name,
      category: action.category,
      argsJson: truncate(argsJson, this.maxArgChars),
      transcript: truncate(action.transcript ?? "", this.maxTranscriptChars)
    });

    const messages: Message[] = [
      { role: "system", content: SECURITY_MONITOR_SYSTEM_PROMPT },
      { role: "user", content: userMsg }
    ];

    let reply: Message;
    try {
      reply = await this.provider.generateMessageTraced({
        messages,
        model: this.model,
        maxTokens: JUDGE_MAX_TOKENS,
        temperature: 0,
        threadId: this.threadId
      });
    } catch (err) {
      log.warn("Security monitor judge call failed; allowing by default", {
        tool: action.name,
        category: action.category,
        error: err instanceof Error ? err.message : String(err)
      });
      return { ...ALLOW_VERDICT };
    }

    const verdict = parseVerdict(extractText(reply.content));
    if (!verdict) {
      log.warn(
        "Security monitor verdict unparseable; allowing by default",
        { tool: action.name, category: action.category }
      );
      return { ...ALLOW_VERDICT };
    }

    if (verdict.block) {
      log.info("Security monitor blocked a pending action", {
        tool: action.name,
        category: action.category,
        tier: verdict.tier,
        severity: verdict.severity
      });
    }
    return verdict;
  }
}

/**
 * Bridge a {@link SecurityMonitor} into the permission gate. Returns a plain
 * consult callback (the gate stays free of any provider/LLM dependency) that
 * forwards a pending action to {@link SecurityMonitor.review}.
 */
export function createSecurityMonitorConsult(
  monitor: SecurityMonitor
): (action: PendingAction) => Promise<SecurityVerdict> {
  return (action: PendingAction) => monitor.review(action);
}
