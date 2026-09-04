/**
 * The cloud profile drops `yt_dlp`.
 *
 * Two surfaces have to agree: the belt every host assembles
 * (`availableBuiltinToolNames`), so a model never sees the tool, and the
 * capability itself, so a host that resolves it by name still refuses.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BUILTIN_TOOL_NAMES,
  availableBuiltinToolNames,
  getBuiltinTools
} from "../src/tools/builtin-tools.js";
import { isYtDlpEnabled } from "../src/yt-dlp-gate.js";
import { ytDlp } from "../src/capabilities/media.js";
import { toolFromCapability } from "../src/capabilities/adapters.js";
import { UNGATED, createCapabilityRun } from "../src/capabilities/invoke.js";
import type { ProcessingContext } from "@nodetool-ai/runtime";

const KEYS = ["NODETOOL_NODE_PROFILE", "NODETOOL_ENV"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("isYtDlpEnabled", () => {
  it("is on for a local install", () => {
    expect(isYtDlpEnabled()).toBe(true);
  });

  it("is off under the cloud profile and in production", () => {
    process.env["NODETOOL_NODE_PROFILE"] = "cloud";
    expect(isYtDlpEnabled()).toBe(false);
    delete process.env["NODETOOL_NODE_PROFILE"];
    process.env["NODETOOL_ENV"] = "production";
    expect(isYtDlpEnabled()).toBe(false);
  });

  it("is on for a self-hosted production install", () => {
    process.env["NODETOOL_ENV"] = "production";
    process.env["NODETOOL_NODE_PROFILE"] = "full";
    expect(isYtDlpEnabled()).toBe(true);
  });
});

describe("the belt", () => {
  it("carries yt_dlp by default", () => {
    expect(availableBuiltinToolNames()).toContain("yt_dlp");
    expect(getBuiltinTools().map((tool) => tool.name)).toContain("yt_dlp");
  });

  it("drops yt_dlp under the cloud profile, keeping the rest of its neighbours", () => {
    process.env["NODETOOL_NODE_PROFILE"] = "cloud";
    const names = availableBuiltinToolNames();
    expect(names).not.toContain("yt_dlp");
    expect(names).toContain("ffmpeg");
    expect(getBuiltinTools().map((tool) => tool.name)).not.toContain("yt_dlp");
    // The profile drops the `browser_*` capabilities too (browser-gate.test.ts)
    // and `render_model3d` (blender-gate.test.ts), so what leaves the belt
    // is this one plus those — and nothing else.
    const dropped = BUILTIN_TOOL_NAMES.filter((name) => !names.includes(name));
    expect(dropped.filter((name) => !name.startsWith("browser_"))).toEqual([
      "yt_dlp",
      "render_model3d"
    ]);
  });
});

describe("the capability", () => {
  it("refuses when the profile is cloud, before touching the workspace", async () => {
    process.env["NODETOOL_NODE_PROFILE"] = "cloud";
    const tool = toolFromCapability(ytDlp.spec, ytDlp.impl, (context) =>
      createCapabilityRun({ context, gate: UNGATED })
    );
    const result = await tool.process(
      { workspaceDir: "/tmp" } as unknown as ProcessingContext,
      { url: "https://example.com/clip" }
    );
    expect(result).toEqual({
      error: "yt_dlp is not available on this deployment"
    });
  });
});
