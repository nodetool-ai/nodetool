/**
 * Tests for src/settings.ts
 * Settings management: provider detection, model detection, load/save.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, writeFile, rm } from "node:fs/promises";

// ─── Helper: create a fresh isolated settings dir ───────────────────────────

let tmpDir: string;

beforeEach(async () => {
  tmpDir = join(
    tmpdir(),
    `nodetool-settings-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  await mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
  await rm(tmpDir, { recursive: true, force: true });
});

// ─── detectDefaultProvider ────────────────────────────────────────────────────

describe("detectDefaultProvider / DEFAULT_SETTINGS.provider", () => {
  it("returns 'anthropic' when only ANTHROPIC_API_KEY is set", async () => {
    vi.resetModules();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    const { DEFAULT_SETTINGS } = await import("../src/settings.js");
    expect(DEFAULT_SETTINGS.provider).toBe("anthropic");
  });

  it("returns 'openai' when ANTHROPIC is absent and OPENAI_API_KEY is set", async () => {
    vi.resetModules();
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "test-openai");
    vi.stubEnv("GEMINI_API_KEY", "");
    const { DEFAULT_SETTINGS } = await import("../src/settings.js");
    expect(DEFAULT_SETTINGS.provider).toBe("openai");
  });

  it("returns 'gemini' when ANTHROPIC+OPENAI absent and GEMINI_API_KEY is set", async () => {
    vi.resetModules();
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini");
    const { DEFAULT_SETTINGS } = await import("../src/settings.js");
    expect(DEFAULT_SETTINGS.provider).toBe("gemini");
  });

  it("returns 'ollama' as fallback when no cloud API keys are set", async () => {
    vi.resetModules();
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    const { DEFAULT_SETTINGS } = await import("../src/settings.js");
    expect(DEFAULT_SETTINGS.provider).toBe("ollama");
  });
});

// ─── detectDefaultModel ───────────────────────────────────────────────────────

describe("DEFAULT_SETTINGS.model (detectDefaultModel)", () => {
  it("returns the claude model for anthropic", async () => {
    vi.resetModules();
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    const { DEFAULT_SETTINGS } = await import("../src/settings.js");
    expect(DEFAULT_SETTINGS.provider).toBe("anthropic");
    expect(DEFAULT_SETTINGS.model).toBe("claude-sonnet-4-6");
  });

  it("returns gpt-4o model for openai", async () => {
    vi.resetModules();
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("GEMINI_API_KEY", "");
    const { DEFAULT_SETTINGS } = await import("../src/settings.js");
    expect(DEFAULT_SETTINGS.model).toBe("gpt-4o");
  });

  it("returns gemini model for gemini provider", async () => {
    vi.resetModules();
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini");
    const { DEFAULT_SETTINGS } = await import("../src/settings.js");
    expect(DEFAULT_SETTINGS.model).toBe("gemini-2.0-flash");
  });

  it("returns llama3.2 model for ollama (fallback)", async () => {
    vi.resetModules();
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    const { DEFAULT_SETTINGS } = await import("../src/settings.js");
    expect(DEFAULT_SETTINGS.model).toBe("llama3.2");
  });
});

// ─── DEFAULT_SETTINGS shape ────────────────────────────────────────────────────

describe("DEFAULT_SETTINGS structure", () => {
  it("has agentMode defaulting to false", async () => {
    vi.resetModules();
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    const { DEFAULT_SETTINGS } = await import("../src/settings.js");
    expect(DEFAULT_SETTINGS.agentMode).toBe(false);
  });

  it("includes a non-empty enabledTools array by default", async () => {
    vi.resetModules();
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    const { DEFAULT_SETTINGS } = await import("../src/settings.js");
    expect(Array.isArray(DEFAULT_SETTINGS.enabledTools)).toBe(true);
    expect(DEFAULT_SETTINGS.enabledTools.length).toBeGreaterThan(0);
  });

  it("includes well-known tools in the default list", async () => {
    vi.resetModules();
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    const { DEFAULT_SETTINGS } = await import("../src/settings.js");
    expect(DEFAULT_SETTINGS.enabledTools).toContain("read_file");
    expect(DEFAULT_SETTINGS.enabledTools).toContain("write_file");
  });
});

// ─── loadSettings ─────────────────────────────────────────────────────────────

describe("loadSettings", () => {
  it("returns DEFAULT_SETTINGS when the settings file does not exist", async () => {
    vi.resetModules();
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "test-openai");
    vi.stubEnv("GEMINI_API_KEY", "");
    // Point the settings dir at a non-existent path
    vi.stubEnv("HOME", tmpDir);

    // We need to mock the os.homedir to return tmpDir so the settings path changes
    vi.doMock("node:os", () => ({ homedir: () => tmpDir }));
    const { loadSettings, DEFAULT_SETTINGS } =
      await import("../src/settings.js");

    const loaded = await loadSettings();
    expect(loaded.provider).toBe(DEFAULT_SETTINGS.provider);
    expect(loaded.model).toBe(DEFAULT_SETTINGS.model);
    expect(loaded.agentMode).toBe(DEFAULT_SETTINGS.agentMode);
  });

  it("merges persisted settings with defaults", async () => {
    vi.resetModules();
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "test-openai");
    vi.stubEnv("GEMINI_API_KEY", "");

    // Write a fake settings file
    const settingsDir = join(tmpDir, ".nodetool");
    await mkdir(settingsDir, { recursive: true });
    await writeFile(
      join(settingsDir, "chat-settings.json"),
      JSON.stringify({
        provider: "gemini",
        model: "gemini-pro",
        agentMode: true
      })
    );

    vi.doMock("node:os", () => ({ homedir: () => tmpDir }));
    const { loadSettings } = await import("../src/settings.js");

    const loaded = await loadSettings();
    expect(loaded.provider).toBe("gemini");
    expect(loaded.model).toBe("gemini-pro");
    expect(loaded.agentMode).toBe(true);
    // Default keys should still be present
    expect(Array.isArray(loaded.enabledTools)).toBe(true);
  });

  it("returns defaults when the settings file contains malformed JSON", async () => {
    vi.resetModules();
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "test-openai");
    vi.stubEnv("GEMINI_API_KEY", "");

    const settingsDir = join(tmpDir, ".nodetool");
    await mkdir(settingsDir, { recursive: true });
    await writeFile(
      join(settingsDir, "chat-settings.json"),
      "{ not valid json }"
    );

    vi.doMock("node:os", () => ({ homedir: () => tmpDir }));
    const { loadSettings, DEFAULT_SETTINGS } =
      await import("../src/settings.js");

    const loaded = await loadSettings();
    expect(loaded.provider).toBe(DEFAULT_SETTINGS.provider);
  });
});

// ─── saveSettings ─────────────────────────────────────────────────────────────

describe("saveSettings", () => {
  it("persists partial settings without overwriting unrelated keys", async () => {
    vi.resetModules();
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "test-openai");
    vi.stubEnv("GEMINI_API_KEY", "");

    vi.doMock("node:os", () => ({ homedir: () => tmpDir }));
    const { saveSettings, loadSettings } = await import("../src/settings.js");

    // Save a partial update
    await saveSettings({ provider: "anthropic", agentMode: true });
    const loaded = await loadSettings();

    expect(loaded.provider).toBe("anthropic");
    expect(loaded.agentMode).toBe(true);
    // model should still be set (coming from defaults)
    expect(typeof loaded.model).toBe("string");
    expect(loaded.model.length).toBeGreaterThan(0);
  });

  it("silently ignores fs errors during save", async () => {
    vi.resetModules();
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "test-openai");
    vi.stubEnv("GEMINI_API_KEY", "");

    // Point homedir at a file (not a directory) so mkdir fails
    const fakeFile = join(tmpDir, "i-am-a-file");
    await writeFile(fakeFile, "content");
    vi.doMock("node:os", () => ({ homedir: () => fakeFile }));
    const { saveSettings } = await import("../src/settings.js");

    // Should NOT throw
    await expect(saveSettings({ provider: "openai" })).resolves.toBeUndefined();
  });
});
