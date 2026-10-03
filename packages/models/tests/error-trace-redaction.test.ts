import { describe, expect, it } from "vitest";
import {
  ERROR_TRACE_CONTEXT_KEYS,
  MAX_ERROR_MESSAGE_LENGTH,
  MAX_ERROR_STACK_LINES,
  collectSecretValues,
  describeThrown,
  errorTraceFingerprint,
  redactErrorText,
  redactErrorTrace,
  sanitizeErrorTraceContext
} from "../src/error-trace-redaction.js";

const NO_ENV = { secretValues: [] };

/** Each case: text containing a secret, and the substring that must vanish. */
const SECRET_CASES: Array<[string, string, string]> = [
  ["OpenAI key", "auth failed for sk-proj-abcdefghijklmnopqrstuvwx", "sk-proj-abcdefghijklmnopqrstuvwx"],
  ["Anthropic key", "key sk-ant-api03-AAAABBBBCCCCDDDDEEEE rejected", "sk-ant-api03-AAAABBBBCCCCDDDDEEEE"],
  ["GitHub token", "token ghp_0123456789abcdefghijABCDEFGHIJ used", "ghp_0123456789abcdefghijABCDEFGHIJ"],
  ["GitHub PAT", "github_pat_11ABCDEFG0123456789_abcdefghij", "github_pat_11ABCDEFG0123456789_abcdefghij"],
  ["AWS key", "AKIAIOSFODNN7EXAMPLE was denied", "AKIAIOSFODNN7EXAMPLE"],
  ["Google key", "AIzaSyA-1234567890abcdefghijklmnopqrstu is invalid", "AIzaSyA-1234567890abcdefghijklmnopqrstu"],
  ["HF token", "hf_abcdefghijklmnopqrstuvwxyz0123", "hf_abcdefghijklmnopqrstuvwxyz0123"],
  ["Replicate token", "r8_abcdefghijklmnopqrstuvwxyz0123", "r8_abcdefghijklmnopqrstuvwxyz0123"],
  ["Slack token", "xoxb-1234567890-abcdefghij", "xoxb-1234567890-abcdefghij"],
  ["Stripe key", "sk_live_abcdefghijklmnop1234", "sk_live_abcdefghijklmnop1234"],
  ["JWT", "jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.dozjgNryP4J3jVmNHl0w5N", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.dozjgNryP4J3jVmNHl0w5N"],
  ["Bearer header", "Authorization: Bearer abc123def456ghi789", "abc123def456ghi789"],
  ["password pair", "connect failed password=hunter2hunter2", "hunter2hunter2"],
  ["api_key query", "GET /v1?api_key=s3cr3tvalue&x=1", "s3cr3tvalue"],
  ["JSON secret", '{"client_secret": "very-secret-value"}', "very-secret-value"],
  ["signed URL", "https://bucket.s3.amazonaws.com/a.png?X-Amz-Signature=deadbeefcafe", "deadbeefcafe"],
  ["sig param", "https://cdn.example.com/f?sig=abcd1234efgh", "abcd1234efgh"],
  ["URL credentials", "postgres://admin:pa55word@db.internal:5432/app", "admin:pa55word"],
  ["email", "no account for jane.doe@example.com", "jane.doe@example.com"],
  ["IPv4", "connect ECONNREFUSED 10.1.2.3:443", "10.1.2.3"],
  ["mac home", "at /Users/jane/project/index.js:1:1", "/Users/jane"],
  ["linux home", "open /home/jane/.nodetool/db failed", "/home/jane"],
  ["windows home", "C:\\Users\\Jane\\AppData\\nodetool", "C:\\Users\\Jane"],
  ["data URL", "bad image data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA", "iVBORw0KGgo"],
  ["private key", "-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----", "MIIEow"],
  ["opaque blob", "token-ish " + "a1B2c3D4".repeat(8), "a1B2c3D4".repeat(8)]
];

describe("redactErrorText", () => {
  it.each(SECRET_CASES)("removes %s", (_label, text, secret) => {
    const out = redactErrorText(text, NO_ENV);
    expect(out).not.toContain(secret);
    // Home directories collapse to `~`; everything else gets a marker.
    expect(out).toMatch(/\[REDACTED|~/);
  });

  it("removes configured secret values wherever they appear", () => {
    const out = redactErrorText("provider said: unknown key zq-custom-credential-42", {
      secretValues: ["zq-custom-credential-42"]
    });
    expect(out).toBe("provider said: unknown key [REDACTED:secret]");
  });

  it("keeps diagnostic prose, loopback addresses and resource ids readable", () => {
    const text =
      "Invalid token: expected a string at workflow 0123456789abcdef0123456789abcdef " +
      "(max_tokens=4096) on 127.0.0.1:7777";
    expect(redactErrorText(text, NO_ENV)).toBe(text);
  });
});

describe("collectSecretValues", () => {
  it("reads credential-named variables, longest first, and skips short values", () => {
    const values = collectSecretValues({
      OPENAI_API_KEY: "abcdefgh12",
      GITHUB_TOKEN: "zzzzzzzzzzzzzz",
      SHORT_SECRET: "abc",
      HOME: "/home/someone-long-enough"
    });
    expect(values).toEqual(["zzzzzzzzzzzzzz", "abcdefgh12"]);
  });
});

describe("sanitizeErrorTraceContext", () => {
  it("keeps allowlisted scalar keys and drops everything else", () => {
    const out = sanitizeErrorTraceContext(
      {
        job_id: "job1",
        http_status: 500,
        prompt: "a secret prompt",
        inputs: { text: "user content" },
        route: "/api/x?token=abcdefghij"
      },
      NO_ENV
    );
    expect(out).toEqual({
      job_id: "job1",
      http_status: 500,
      route: "/api/x?token=[REDACTED]"
    });
  });

  it("returns null when nothing survives", () => {
    expect(sanitizeErrorTraceContext({ prompt: "x" }, NO_ENV)).toBeNull();
  });

  it("allowlists identifiers only", () => {
    for (const key of ERROR_TRACE_CONTEXT_KEYS) {
      expect(key).not.toMatch(/prompt|input|output|body|content|text/);
    }
  });
});

describe("redactErrorTrace", () => {
  it("caps the message and the stack", () => {
    const stack = Array.from({ length: 100 }, (_, i) => `    at f${i} (a.js:${i}:1)`).join("\n");
    const out = redactErrorTrace(
      { source: "server", message: "x".repeat(10_000), stack },
      NO_ENV
    );
    expect(out.message.length).toBeLessThan(MAX_ERROR_MESSAGE_LENGTH + 50);
    expect(out.stack?.split("\n")).toHaveLength(MAX_ERROR_STACK_LINES + 1);
  });

  it("drops a secret split by the pre-redaction cap", () => {
    // The data URL collapses to a short marker, so the cut lands inside the
    // key and the fragment would survive the final cap.
    const dataUrl = "data:image/png;base64," + "A".repeat(MAX_ERROR_MESSAGE_LENGTH * 2 - 30);
    const message = `${dataUrl} sk-proj-abcdefghijklmnopqrstuvwx`;
    const out = redactErrorTrace({ source: "server", message }, NO_ENV);
    expect(out.message).not.toContain("sk-pr");
  });

  it("stays fast on inputs shaped to make regexes backtrack", () => {
    const shapes = ["a.", "a://b:c", "ab1-", "token", "a@", "1."];
    for (const shape of shapes) {
      const text = shape.repeat(Math.ceil(50_000 / shape.length));
      const started = performance.now();
      redactErrorTrace({ source: "web", message: text, stack: text }, NO_ENV);
      expect(performance.now() - started).toBeLessThan(500);
    }
  });

  it("groups occurrences that differ only in ids, numbers and line numbers", () => {
    const a = redactErrorTrace(
      {
        source: "job",
        errorType: "Error",
        message: "Node 4f2a9c1b0d failed after 3 retries",
        stack: "    at run (/app/runner.js:10:5)"
      },
      NO_ENV
    );
    const b = redactErrorTrace(
      {
        source: "job",
        errorType: "Error",
        message: "Node 9e8d7c6b5a failed after 5 retries",
        stack: "    at run (/app/runner.js:12:9)"
      },
      NO_ENV
    );
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(
      errorTraceFingerprint("job", "TypeError", a.message, a.stack)
    ).not.toBe(a.fingerprint);
  });
});

describe("describeThrown", () => {
  it("splits an Error into type, message and frames", () => {
    const err = new TypeError("bad thing");
    const out = describeThrown(err);
    expect(out.errorType).toBe("TypeError");
    expect(out.message).toBe("bad thing");
    expect(out.stack?.startsWith("    at ")).toBe(true);
  });

  it("stringifies non-errors", () => {
    expect(describeThrown("plain")).toEqual({
      errorType: null,
      message: "plain",
      stack: null
    });
  });
});

describe("errorTraceFingerprint", () => {
  it("masks quoted values and stays fast on runs of quotes", () => {
    expect(errorTraceFingerprint("web", null, 'bad "a" value', null)).toBe(
      errorTraceFingerprint("web", null, 'bad "b" value', null)
    );
    const started = performance.now();
    errorTraceFingerprint("web", null, '"'.repeat(50_000) + "'".repeat(50_000), null);
    expect(performance.now() - started).toBeLessThan(500);
  });
});
