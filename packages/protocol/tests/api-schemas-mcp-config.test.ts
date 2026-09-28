import { describe, it, expect } from "vitest";
import {
  mcpTarget,
  targetStatus,
  statusOutput,
  installInput,
  installResult,
  installOutput,
  uninstallInput,
  uninstallResult,
  uninstallOutput
} from "../src/api-schemas/mcp-config.js";

describe("mcp-config.mcpTarget", () => {
  it("accepts the three known targets", () => {
    for (const t of ["claude", "codex", "opencode"]) {
      expect(mcpTarget.safeParse(t).success).toBe(true);
    }
  });

  it("rejects an unknown target", () => {
    expect(mcpTarget.safeParse("cursor").success).toBe(false);
  });
});

describe("mcp-config.targetStatus", () => {
  it("parses with nullable url/command/configPath", () => {
    expect(
      targetStatus.safeParse({
        target: "claude",
        label: "Claude Code",
        installed: false,
        url: null,
        command: null,
        configPath: null
      }).success
    ).toBe(true);
  });

  it("parses a stdio entry by its command", () => {
    expect(
      targetStatus.safeParse({
        target: "claude",
        label: "Claude Code",
        installed: true,
        url: null,
        command: "nodetool mcp serve",
        configPath: "/home/user/.claude.json"
      }).success
    ).toBe(true);
  });

  it("rejects an invalid target enum", () => {
    expect(
      targetStatus.safeParse({
        target: "nope",
        label: "x",
        installed: true,
        url: null,
        command: null,
        configPath: null
      }).success
    ).toBe(false);
  });
});

describe("mcp-config.statusOutput", () => {
  it("parses targets, defaultUrl, and defaultLaunch", () => {
    expect(
      statusOutput.safeParse({
        targets: [],
        defaultUrl: "http://x",
        defaultLaunch: "nodetool mcp serve"
      }).success
    ).toBe(true);
  });
});

describe("mcp-config.installInput", () => {
  it("accepts an empty object (all targets)", () => {
    expect(installInput.safeParse({}).success).toBe(true);
  });

  it("accepts a subset of targets and url", () => {
    expect(
      installInput.safeParse({ targets: ["claude"], url: "http://x" }).success
    ).toBe(true);
  });

  it("rejects an invalid target in the array", () => {
    expect(installInput.safeParse({ targets: ["bad"] }).success).toBe(false);
  });
});

describe("mcp-config.installResult (discriminated union)", () => {
  it("parses the success=true variant with configPath", () => {
    expect(
      installResult.safeParse({
        target: "codex",
        label: "Codex",
        success: true,
        configPath: "/cfg"
      }).success
    ).toBe(true);
  });

  it("parses the success=false variant with error", () => {
    expect(
      installResult.safeParse({
        target: "codex",
        label: "Codex",
        success: false,
        error: "boom"
      }).success
    ).toBe(true);
  });

  it("rejects success=true missing configPath", () => {
    expect(
      installResult.safeParse({
        target: "codex",
        label: "Codex",
        success: true
      }).success
    ).toBe(false);
  });

  it("rejects success=false with configPath instead of error", () => {
    expect(
      installResult.safeParse({
        target: "codex",
        label: "Codex",
        success: false,
        configPath: "/cfg"
      }).success
    ).toBe(false);
  });
});

describe("mcp-config.installOutput", () => {
  it("parses results and the written launch", () => {
    expect(
      installOutput.safeParse({ results: [], launch: "nodetool mcp serve" })
        .success
    ).toBe(true);
  });
});

describe("mcp-config.uninstallInput", () => {
  it("accepts empty and target subset", () => {
    expect(uninstallInput.safeParse({}).success).toBe(true);
    expect(
      uninstallInput.safeParse({ targets: ["opencode"] }).success
    ).toBe(true);
  });
});

describe("mcp-config.uninstallResult", () => {
  it("parses with optional error omitted", () => {
    expect(
      uninstallResult.safeParse({
        target: "claude",
        label: "Claude",
        removed: true
      }).success
    ).toBe(true);
  });

  it("rejects a non-boolean removed", () => {
    expect(
      uninstallResult.safeParse({
        target: "claude",
        label: "Claude",
        removed: "yes"
      }).success
    ).toBe(false);
  });
});

describe("mcp-config.uninstallOutput", () => {
  it("parses a results array", () => {
    expect(uninstallOutput.safeParse({ results: [] }).success).toBe(true);
  });
});
