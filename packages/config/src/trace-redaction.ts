import { safeProcessEnv } from "./node-import.js";

/** Mask PEM private keys in one pass, including unfinished blocks. */
export function redactPrivateKeys(text: string): string {
  const parts: string[] = [];
  let cursor = 0;
  let start = -1;
  for (const marker of text.matchAll(/-----(BEGIN|END) [A-Z ]*PRIVATE KEY-----/g)) {
    if (marker[1] === "BEGIN") {
      if (start < 0) { start = marker.index; }
    } else if (start >= 0) {
      parts.push(text.slice(cursor, start), "[REDACTED:private-key]");
      cursor = marker.index + marker[0].length;
      start = -1;
    }
  }
  // A missing closing marker must not expose the remaining key material.
  if (start >= 0) {
    parts.push(text.slice(cursor, start), "[REDACTED:private-key]");
  } else {
    parts.push(text.slice(cursor));
  }
  return parts.join("");
}

/**
 * The values trace redaction masks, longest first: the caller's secrets and
 * every credential-named environment value. Reading `process.env` costs more
 * than the rest of a redaction, so a caller redacting many strings at once
 * collects these once and passes them to {@link redactTraceTextWith}.
 */
export function traceRedactionSecrets(secretValues: ReadonlySet<string> = new Set()): readonly string[] {
  const secrets = new Set(secretValues);
  for (const [key, secret] of Object.entries(safeProcessEnv())) {
    if (secret && secret.length >= 8 && /(?:KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIALS?|DATABASE_URL|_DSN)$/i.test(key)) { secrets.add(secret); }
  }
  return [...secrets].filter((secret) => secret.length > 0).sort((a, b) => b.length - a.length);
}

/** Credential-only fallback used before a database-backed trace sanitizer is installed. */
export function redactTraceText(text: string, secretValues: ReadonlySet<string> = new Set()): string {
  return redactTraceTextWith(text, traceRedactionSecrets(secretValues));
}

/** {@link redactTraceText} against secrets already collected by {@link traceRedactionSecrets}. */
export function redactTraceTextWith(text: string, secrets: readonly string[]): string {
  let value = text;
  for (const secret of secrets) { value = value.split(secret).join("[REDACTED:secret]"); }
  return redactPrivateKeys(value)
    .replace(/\b(?:Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "[REDACTED:authorization]")
    .replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|hf_[A-Za-z0-9]{20,}|r8_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{35}|(?:AKIA|ASIA)[A-Z0-9]{16})\b/g, "[REDACTED:api-key]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[REDACTED:jwt]")
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[REDACTED]@")
    .replace(/(["']?[\w.-]*(?:api[_-]?key|token|secret|password|authorization|cookie|signature)[\w.-]*["']?\s*[:=]\s*)["']?[^\s,;}"']+["']?/gi, "$1[REDACTED:credential]")
    .replace(/data:[^\s"']+/gi, "[REDACTED:media]")
    .replace(/\b[A-Za-z0-9_+/=-]{100,}\b/g, "[REDACTED:blob]");
}
