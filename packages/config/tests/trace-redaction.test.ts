import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { redactTraceText, redactTraceTextWith, traceRedactionSecrets } from "../src/trace-redaction.js";

describe("redactTraceText", () => {
  it.each(["", "RSA ", "EC ", "ENCRYPTED "])("masks a %sprivate key and preserves surrounding text", (label) => {
    const key = `-----BEGIN ${label}PRIVATE KEY-----\nprivate bytes\n-----END ${label}PRIVATE KEY-----`;
    expect(redactTraceText(`before ${key} after ${key}`)).toBe("before [REDACTED:private-key] after [REDACTED:private-key]");
  });

  it("masks an unterminated key, including repeated opening markers", () => {
    expect(redactTraceText("before -----BEGIN PRIVATE KEY-----private bytes-----BEGIN RSA PRIVATE KEY-----more bytes"))
      .toBe("before [REDACTED:private-key]");
  });

  it("masks nested and mismatched markers through the first closing marker", () => {
    expect(redactTraceText("before -----BEGIN RSA PRIVATE KEY-----a-----BEGIN EC PRIVATE KEY-----b-----END PRIVATE KEY----- after"))
      .toBe("before [REDACTED:private-key] after");
  });

  it("keeps ordinary diagnostics and unmatched closing markers", () => {
    const text = "Input is missing -----END PRIVATE KEY-----";
    expect(redactTraceText(text)).toBe(text);
  });

  it("finishes redacting a large stream of unterminated keys", () => {
    const module = new URL("../src/trace-redaction.ts", import.meta.url).href;
    const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e",
      `import { redactTraceText } from ${JSON.stringify(module)};
      process.stdout.write(redactTraceText("-----BEGIN PRIVATE KEY-----".repeat(100_000)));`
    ], { encoding: "utf8", timeout: 5000 });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("[REDACTED:private-key]");
  }, 10_000);
});

describe("traceRedactionSecrets", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it("collects credential-named environment values and the caller's secrets, longest first", () => {
    vi.stubEnv("SERVICE_API_KEY", "env-key-value");
    vi.stubEnv("SERVICE_LABEL", "not-a-credential");
    const secrets = traceRedactionSecrets(new Set(["caller-secret-longer-value", ""]));
    expect(secrets).toContain("env-key-value");
    expect(secrets).not.toContain("not-a-credential");
    expect(secrets).not.toContain("");
    expect(secrets.indexOf("caller-secret-longer-value")).toBeLessThan(secrets.indexOf("env-key-value"));
  });

  it("redacts with collected secrets exactly as redactTraceText does", () => {
    vi.stubEnv("SERVICE_TOKEN", "env-token-value");
    const text = "env-token-value and caller-secret with Bearer abcdefghijkl";
    const callerSecrets = new Set(["caller-secret"]);
    expect(redactTraceTextWith(text, traceRedactionSecrets(callerSecrets))).toBe(redactTraceText(text, callerSecrets));
    expect(redactTraceText(text, callerSecrets)).toBe("[REDACTED:secret] and [REDACTED:secret] with [REDACTED:authorization]");
  });
});
