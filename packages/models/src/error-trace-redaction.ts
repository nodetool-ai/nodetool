/**
 * Redaction for error traces — the privacy control of `nodetool_error_traces`.
 *
 * Every trace passes through {@link redactErrorTrace} before it is stored,
 * whether it was captured by this server or received through sync. The rules
 * are deliberately over-eager: a debugging session that sees
 * `[REDACTED:email]` loses little, while a stored API key or a customer's
 * email address in a log that gets pasted into a public issue is a leak.
 *
 * What is removed:
 *   - provider credentials by shape (OpenAI, Anthropic, GitHub, AWS, Google,
 *     Hugging Face, Replicate, Slack, Stripe), JWTs, bearer/basic tokens and
 *     PEM private keys;
 *   - `name=value` pairs and quoted JSON keys whose name says secret
 *     (`password`, `api_key`, `token`, `signature`, …), and signed URL query
 *     parameters;
 *   - credentials embedded in URLs (`https://user:pass@host`);
 *   - the literal values of secrets configured in the process environment;
 *   - email addresses, non-loopback IPv4 addresses and home-directory user
 *     names;
 *   - `data:` URLs and long opaque blobs, which are inputs, not diagnostics.
 *
 * Messages and stacks are then capped, so a provider error that echoes a whole
 * prompt cannot store all of it.
 */

import { createHash } from "node:crypto";
import { redactPrivateKeys } from "@nodetool-ai/config";

export const MAX_ERROR_MESSAGE_LENGTH = 2000;
export const MAX_ERROR_STACK_LENGTH = 8000;
export const MAX_ERROR_STACK_LINES = 40;
export const MAX_ERROR_CONTEXT_STRING_LENGTH = 200;
export const MAX_ERROR_TYPE_LENGTH = 120;

/** Where a trace came from. The vocabulary is closed; anything else is refused. */
export const ERROR_TRACE_SOURCES = [
  "server",
  "trpc",
  "http",
  "job",
  "web",
  "electron",
  "agent",
  "cli"
] as const;
export type ErrorTraceSource = (typeof ERROR_TRACE_SOURCES)[number];

export const ERROR_TRACE_SEVERITIES = ["fatal", "error", "warning"] as const;
export type ErrorTraceSeverity = (typeof ERROR_TRACE_SEVERITIES)[number];

/**
 * The context keys a trace may carry. Each one names an identifier or a
 * structured fact about where the error happened, never content: no prompt,
 * no node input, no output, no request body.
 */
export const ERROR_TRACE_CONTEXT_KEYS = [
  "job_id",
  "trace_id",
  "app_run_id",
  "span_id",
  "workflow_id",
  "node_id",
  "node_type",
  "thread_id",
  "request_id",
  "route",
  "method",
  "http_status",
  "code",
  "component",
  "provider",
  "model",
  "runtime"
] as const;

export type ErrorTraceContextValue = string | number | boolean;
export type ErrorTraceContext = Record<string, ErrorTraceContextValue>;

export function isErrorTraceSource(value: unknown): value is ErrorTraceSource {
  return (
    typeof value === "string" &&
    (ERROR_TRACE_SOURCES as readonly string[]).includes(value)
  );
}

export function isErrorTraceSeverity(
  value: unknown
): value is ErrorTraceSeverity {
  return (
    typeof value === "string" &&
    (ERROR_TRACE_SEVERITIES as readonly string[]).includes(value)
  );
}

// ── Text rules ───────────────────────────────────────────────────────

type Rule = readonly [RegExp, string | ((match: string, ...groups: string[]) => string)];

/** Name fragments that mark the value next to them as a secret. */
const SECRET_NAME =
  "[A-Za-z0-9_.-]{0,40}(?:api[_-]?key|apikey|access[_-]?key|token(?!s\\b)|secret|password|passwd|pwd|signature|credential|authorization|cookie|session[_-]?id|private[_-]?key)[A-Za-z0-9_.-]{0,40}";

const CREDENTIAL_RULES: readonly Rule[] = [
  // Credentials in a URL's userinfo.
  [/\b([a-z][a-z0-9+.-]{0,30}:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[REDACTED]@"],
  [
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
    "[REDACTED:jwt]"
  ],
  [/\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [REDACTED]"],
  // Provider credentials by shape.
  [/\bsk-[A-Za-z0-9_-]{16,}/g, "[REDACTED:api-key]"],
  [/\bsk_(?:live|test)_[A-Za-z0-9]{16,}/g, "[REDACTED:api-key]"],
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g, "[REDACTED:api-key]"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, "[REDACTED:api-key]"],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, "[REDACTED:api-key]"],
  [/\bAIza[0-9A-Za-z_-]{35}/g, "[REDACTED:api-key]"],
  [/\bhf_[A-Za-z0-9]{20,}/g, "[REDACTED:api-key]"],
  [/\br8_[A-Za-z0-9]{20,}/g, "[REDACTED:api-key]"],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, "[REDACTED:api-key]"],
  // A quoted key may be followed by `:` (JSON); an unquoted one needs `=`, so
  // prose such as "invalid token: expected a string" survives.
  [
    new RegExp(`(["'])(${SECRET_NAME})\\1(\\s*:\\s*)("[^"]*"|'[^']*'|[^\\s,}]+)`, "gi"),
    "$1$2$1$3\"[REDACTED]\""
  ],
  [new RegExp(`\\b(${SECRET_NAME})(\\s*=\\s*)[^\\s&"',;}]+`, "gi"), "$1$2[REDACTED]"],
  // Signed-URL and OAuth query parameters with short names.
  [/([?&](?:sig|key|code|state|auth|x-amz-credential)=)[^&#\s"']+/gi, "$1[REDACTED]"]
];

/** Personal data and bulky inputs: removed from diagnostics, kept in working state. */
const PERSONAL_RULES: readonly Rule[] = [
  [/\bdata:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, "[REDACTED:data-url]"],
  // Bounded parts: unbounded ones backtrack quadratically on "a.a.a…".
  [
    /\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}\b/g,
    "[REDACTED:email]"
  ],
  // Home directories name the person who owns the machine.
  [/\/Users\/[^/\s:'"]+/g, "~"],
  [/\/home\/[^/\s:'"]+/g, "~"],
  [/\b[A-Za-z]:\\Users\\[^\\\s:'"]+/gi, "~"],
  [
    /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    (match) =>
      match.startsWith("127.") || match === "0.0.0.0"
        ? match
        : "[REDACTED:ip]"
  ],
  // Long opaque runs: base64 payloads, signed tokens of unknown shape. A
  // resource id is 32 hex characters and stays readable.
  [/\b[A-Za-z0-9_-]{48,}\b/g, "[REDACTED:blob]"]
];

const RULES: readonly Rule[] = [...CREDENTIAL_RULES, ...PERSONAL_RULES];

/** Environment names whose values are credentials. */
const SECRET_ENV_NAME =
  /(?:KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIALS?|DATABASE_URL|_DSN)$/i;
const MIN_SECRET_VALUE_LENGTH = 8;

/**
 * The values of credentials configured in `env`, longest first so a value
 * that contains another is replaced whole.
 */
export function collectSecretValues(
  env: Record<string, string | undefined> = process.env
): string[] {
  const values = new Set<string>();
  for (const [name, value] of Object.entries(env)) {
    if (!value || !SECRET_ENV_NAME.test(name)) continue;
    const trimmed = value.trim();
    if (trimmed.length >= MIN_SECRET_VALUE_LENGTH) values.add(trimmed);
  }
  return [...values].sort((a, b) => b.length - a.length);
}

export interface RedactionOptions {
  /** Literal values to remove wherever they appear. Defaults to the env's secrets. */
  secretValues?: readonly string[];
}

/** Scrub one piece of free text. Never throws. */
export function redactErrorText(
  text: string,
  options: RedactionOptions = {}
): string {
  return applyRules(text, RULES, options);
}

function applyRules(
  text: string,
  rules: readonly Rule[],
  options: RedactionOptions
): string {
  let out = text;
  for (const secret of options.secretValues ?? collectSecretValues()) {
    if (out.includes(secret)) out = out.split(secret).join("[REDACTED:secret]");
  }
  out = redactPrivateKeys(out);
  for (const [pattern, replacement] of rules) {
    // `replace` with a string or a function; the cast only picks the overload.
    out = out.replace(pattern, replacement as string);
  }
  return out;
}

/**
 * Remove only credentials: configured secret values, private keys and the
 * credential shapes. Use it for a user's own working state, where a file
 * path, an email address or a long id is data the user entered.
 */
export function redactCredentialText(
  text: string,
  options: RedactionOptions = {}
): string {
  return applyRules(text, CREDENTIAL_RULES, options);
}

/**
 * Bound the text redaction has to scan. The cut can split a secret, leaving a
 * fragment too short for its pattern, so the partial token at the cut goes
 * too. The final cap after redaction is far shorter than this one.
 */
function precap(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\S*$/, "");
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}… [truncated ${text.length - max} chars]`;
}

function capStack(stack: string): string {
  const lines = stack.split("\n");
  const kept =
    lines.length > MAX_ERROR_STACK_LINES
      ? [
          ...lines.slice(0, MAX_ERROR_STACK_LINES),
          `    … ${lines.length - MAX_ERROR_STACK_LINES} more frames`
        ]
      : lines;
  return truncate(kept.join("\n"), MAX_ERROR_STACK_LENGTH);
}

/**
 * Keep the allowlisted scalar context keys, redacting and capping strings.
 * Returns `null` when nothing survives.
 */
export function sanitizeErrorTraceContext(
  context: Record<string, unknown> | null | undefined,
  options: RedactionOptions = {}
): ErrorTraceContext | null {
  if (!context || typeof context !== "object") return null;
  const kept: ErrorTraceContext = {};
  for (const key of ERROR_TRACE_CONTEXT_KEYS) {
    const value = context[key];
    if (typeof value === "boolean") {
      kept[key] = value;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      kept[key] = value;
    } else if (typeof value === "string" && value.length > 0) {
      kept[key] = truncate(
        redactErrorText(value, options),
        MAX_ERROR_CONTEXT_STRING_LENGTH
      );
    }
  }
  return Object.keys(kept).length > 0 ? kept : null;
}

export interface ErrorTraceInput {
  source: ErrorTraceSource;
  severity?: ErrorTraceSeverity;
  errorType?: string | null;
  message: string;
  stack?: string | null;
  context?: Record<string, unknown> | null;
  appVersion?: string | null;
  platform?: string | null;
}

export interface RedactedErrorTrace {
  fingerprint: string;
  source: ErrorTraceSource;
  severity: ErrorTraceSeverity;
  error_type: string | null;
  message: string;
  stack: string | null;
  context: ErrorTraceContext | null;
  app_version: string | null;
  platform: string | null;
}

function shortField(value: string | null | undefined, max: number): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return truncate(value, max);
}

/**
 * Group key for "the same error": source, type, the message with its
 * variable parts (numbers, ids, quoted values) masked, and the top frames
 * without line and column numbers, so a rebuild does not split a group.
 */
export function errorTraceFingerprint(
  source: string,
  errorType: string | null,
  message: string,
  stack: string | null
): string {
  const normalizedMessage = message
    .replace(/"[^"\n]*"|'[^'\n]*'|`[^`\n]*`/g, "<v>")
    .replace(/\b[0-9a-f]{8,}\b/gi, "<id>")
    .replace(/\d+/g, "<n>");
  const frames = (stack ?? "")
    .split("\n")
    .filter((line) => /^\s*at\s/.test(line))
    .slice(0, 3)
    .map((line) => line.trim().replace(/:\d+(?::\d+)?\)?$/, ""));
  return createHash("sha256")
    .update([source, errorType ?? "", normalizedMessage, ...frames].join("\n"))
    .digest("hex")
    .slice(0, 16);
}

/** Redact, cap and fingerprint a trace. The only way a trace reaches the table. */
export function redactErrorTrace(
  input: ErrorTraceInput,
  options: RedactionOptions = {}
): RedactedErrorTrace {
  const resolved: RedactionOptions = {
    secretValues: options.secretValues ?? collectSecretValues()
  };
  const errorType = shortField(
    input.errorType ? redactErrorText(input.errorType, resolved) : null,
    MAX_ERROR_TYPE_LENGTH
  );
  const message = truncate(
    redactErrorText(
      precap(input.message || "(no message)", MAX_ERROR_MESSAGE_LENGTH * 2),
      resolved
    ),
    MAX_ERROR_MESSAGE_LENGTH
  );
  const stack = input.stack
    ? capStack(
        redactErrorText(precap(input.stack, MAX_ERROR_STACK_LENGTH * 2), resolved)
      )
    : null;
  return {
    fingerprint: errorTraceFingerprint(input.source, errorType, message, stack),
    source: input.source,
    severity: input.severity ?? "error",
    error_type: errorType,
    message,
    stack,
    context: sanitizeErrorTraceContext(input.context, resolved),
    app_version: shortField(input.appVersion, 64),
    platform: shortField(input.platform, 64)
  };
}

/** Split an unknown thrown value into the fields a trace stores. */
export function describeThrown(error: unknown): {
  errorType: string | null;
  message: string;
  stack: string | null;
} {
  if (error instanceof Error) {
    const stack = error.stack ?? null;
    // V8 stacks repeat "Type: message" as their first line; keep frames only.
    const frames = stack
      ? stack
          .split("\n")
          .filter((line) => /^\s*at\s/.test(line))
          .join("\n")
      : null;
    return {
      errorType: error.name || error.constructor?.name || "Error",
      message: error.message,
      stack: frames || null
    };
  }
  return { errorType: null, message: String(error), stack: null };
}
