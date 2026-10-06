import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { redactTraceText } from "../src/trace-redaction.js";

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
