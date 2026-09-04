/**
 * The cloud profile drops `render_model3d`.
 *
 * Same two doors as `yt_dlp` (yt-dlp-gate.test.ts) and the `browser_*`
 * family (browser-gate.test.ts): the belt every host assembles
 * (`availableBuiltinToolNames`), so a model never sees the tool, and the
 * capability itself, so a host that resolves it by name still refuses.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  availableBuiltinToolNames,
  getBuiltinTools
} from "../src/tools/builtin-tools.js";
import {
  BLENDER_DISABLED_ERROR,
  isBlenderEnabled
} from "../src/blender-gate.js";
import { renderModel3d } from "../src/capabilities/model3d.js";
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

describe("isBlenderEnabled", () => {
  it("is on for a local install", () => {
    expect(isBlenderEnabled()).toBe(true);
  });

  it("is off under the cloud profile and in production", () => {
    process.env["NODETOOL_NODE_PROFILE"] = "cloud";
    expect(isBlenderEnabled()).toBe(false);
    delete process.env["NODETOOL_NODE_PROFILE"];
    process.env["NODETOOL_ENV"] = "production";
    expect(isBlenderEnabled()).toBe(false);
  });

  it("is on for a self-hosted production install", () => {
    process.env["NODETOOL_ENV"] = "production";
    process.env["NODETOOL_NODE_PROFILE"] = "full";
    expect(isBlenderEnabled()).toBe(true);
  });
});

describe("the belt", () => {
  it("carries render_model3d by default", () => {
    expect(availableBuiltinToolNames()).toContain("render_model3d");
    expect(getBuiltinTools().map((tool) => tool.name)).toContain(
      "render_model3d"
    );
  });

  it("drops render_model3d under the cloud profile", () => {
    process.env["NODETOOL_NODE_PROFILE"] = "cloud";
    const names = availableBuiltinToolNames();
    expect(names).not.toContain("render_model3d");
    expect(getBuiltinTools().map((tool) => tool.name)).not.toContain(
      "render_model3d"
    );
  });

  it("keeps render_model3d for a self-hosted production install", () => {
    process.env["NODETOOL_ENV"] = "production";
    process.env["NODETOOL_NODE_PROFILE"] = "full";
    expect(availableBuiltinToolNames()).toContain("render_model3d");
  });
});

describe("the capability", () => {
  const run = createCapabilityRun({
    context: {} as unknown as ProcessingContext,
    gate: UNGATED
  });

  it("refuses under the cloud profile, before touching Blender or the asset store", async () => {
    process.env["NODETOOL_NODE_PROFILE"] = "cloud";
    // An empty context has no user and no asset store: reaching past the
    // gate would fail there, not with the deployment refusal.
    await expect(renderModel3d.impl(run, {})).resolves.toEqual({
      error: BLENDER_DISABLED_ERROR
    });
  });

  it("says where the surface does belong", () => {
    expect(BLENDER_DISABLED_ERROR).toContain("desktop app");
    expect(BLENDER_DISABLED_ERROR).toContain("self-hosted");
  });
});
