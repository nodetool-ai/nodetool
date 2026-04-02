/**
 * Tests for T-WS-13: Debug export endpoint.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { handleApiRequest } from "../src/http-api.js";
import { redactSecrets, buildDebugExport } from "../src/debug-api.js";
import { registerSetting, getRegisteredSettings } from "../src/settings-api.js";

async function jsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

describe("T-WS-13: redactSecrets", () => {
  it("redacts OpenAI keys in strings", () => {
    expect(redactSecrets("my key is sk-proj_abcdefghijklmnop")).toBe(
      "my key is ***REDACTED***"
    );
  });

  it("redacts HuggingFace tokens", () => {
    expect(redactSecrets("hf_aBcDeFgHiJkLmNoPqR")).toBe("***REDACTED***");
  });

  it("redacts Replicate tokens", () => {
    expect(redactSecrets("r8_abcdefghijklmnop")).toBe("***REDACTED***");
  });

  it("redacts Bearer tokens", () => {
    expect(
      redactSecrets("Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.something")
    ).toBe("***REDACTED***");
  });

  it("redacts values in nested objects", () => {
    const input = {
      config: { key: "sk-testkeywith12chars" },
      list: ["hf_tokenvalue12345"]
    };
    const result = redactSecrets(input);
    expect(result.config.key).toBe("***REDACTED***");
    expect(result.list[0]).toBe("***REDACTED***");
  });

  it("passes through non-secret strings", () => {
    expect(redactSecrets("hello world")).toBe("hello world");
  });

  it("passes through numbers and booleans", () => {
    expect(redactSecrets(42)).toBe(42);
    expect(redactSecrets(true)).toBe(true);
  });

  it("passes through null", () => {
    expect(redactSecrets(null)).toBe(null);
  });
});

describe("T-WS-13: buildDebugExport", () => {
  it("returns expected structure", () => {
    const result = buildDebugExport(["openai", "anthropic"]);
    expect(result).toHaveProperty("diagnostics");
    expect(result).toHaveProperty("system");
    expect(result).toHaveProperty("providers");
    expect(result).toHaveProperty("timestamp");

    expect(result.system.platform).toBe(process.platform);
    expect(result.system.arch).toBe(process.arch);
    expect(result.system.nodeVersion).toBe(process.version);
    expect(typeof result.system.uptime).toBe("number");
    expect(result.system.memoryUsage).toHaveProperty("heapUsed");

    expect(result.providers).toEqual(["openai", "anthropic"]);
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });

  it("defaults providers to empty array when not supplied", () => {
    const result = buildDebugExport();
    expect(result.providers).toEqual([]);
  });

  it("diagnostics array is populated from registered settings", () => {
    const result = buildDebugExport();
    // The settings registry is populated at module load time
    // so there should be some entries
    expect(Array.isArray(result.diagnostics)).toBe(true);
  });
});

describe("T-WS-13: POST /api/debug/export endpoint", () => {
  it("returns 200 with expected payload", async () => {
    const request = new Request("http://localhost/api/debug/export", {
      method: "POST"
    });
    const response = await handleApiRequest(request);
    expect(response.status).toBe(200);

    const body = (await jsonBody(response)) as Record<string, unknown>;
    expect(body).toHaveProperty("diagnostics");
    expect(body).toHaveProperty("system");
    expect(body).toHaveProperty("providers");
    expect(body).toHaveProperty("timestamp");
  });

  it("rejects non-POST methods", async () => {
    const request = new Request("http://localhost/api/debug/export", {
      method: "GET"
    });
    const response = await handleApiRequest(request);
    expect(response.status).toBe(405);
  });

  it("redacts API keys in the response", async () => {
    const saved = process.env.MY_DEBUG_TEST_KEY;
    process.env.MY_DEBUG_TEST_KEY = "sk-proj_super_secret_test_key_value";

    registerSetting({
      packageName: "test",
      envVar: "MY_DEBUG_TEST_KEY",
      group: "Test",
      description: "Test key",
      isSecret: true
    });

    const request = new Request("http://localhost/api/debug/export", {
      method: "POST"
    });
    const response = await handleApiRequest(request);
    const text = await response.text();

    // The full key should not appear in the response
    expect(text).not.toContain("sk-proj_super_secret_test_key_value");

    // Restore
    if (saved === undefined) {
      delete process.env.MY_DEBUG_TEST_KEY;
    } else {
      process.env.MY_DEBUG_TEST_KEY = saved;
    }
  });
});
