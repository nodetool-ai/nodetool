import { safeProcessEnv } from "./node-import.js";

/** Credential-only fallback used before a database-backed trace sanitizer is installed. */
export function redactTraceText(text: string, secretValues: ReadonlySet<string> = new Set()): string {
  let value = text;
  const secrets = new Set(secretValues);
  for (const [key, secret] of Object.entries(safeProcessEnv())) {
    if (secret && secret.length >= 8 && /(?:KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIALS?|DATABASE_URL|_DSN)$/i.test(key)) { secrets.add(secret); }
  }
  for (const secret of [...secrets].sort((a, b) => b.length - a.length)) {
    if (secret.length > 0) { value = value.split(secret).join("[REDACTED:secret]"); }
  }
  return value
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED:private-key]")
    .replace(/\b(?:Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "[REDACTED:authorization]")
    .replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|hf_[A-Za-z0-9]{20,}|r8_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{35}|(?:AKIA|ASIA)[A-Z0-9]{16})\b/g, "[REDACTED:api-key]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[REDACTED:jwt]")
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[REDACTED]@")
    .replace(/(["']?[\w.-]*(?:api[_-]?key|token|secret|password|authorization|cookie|signature)[\w.-]*["']?\s*[:=]\s*)["']?[^\s,;}"']+["']?/gi, "$1[REDACTED:credential]")
    .replace(/data:[^\s"']+/gi, "[REDACTED:media]")
    .replace(/\b[A-Za-z0-9_+/=-]{100,}\b/g, "[REDACTED:blob]");
}
