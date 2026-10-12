/**
 * The cloud profile closes the escape hatches that reach the server machine
 * past a run's workspace: the sandbox's host filesystem and private network
 * switches, pandoc's `extra_args`, and a local-Chrome `take_screenshot`.
 *
 * Same profile switch as blender-gate.test.ts and browser-gate.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  LOCAL_SCREENSHOT_DISABLED_ERROR,
  PANDOC_EXTRA_ARGS_DISABLED_ERROR,
  isHostAccessEnabled
} from "../src/host-access-gate.js";
import { resolveSandboxLimits } from "../src/js-sandbox.js";
import { convertDocument } from "../src/capabilities/documents.js";
import { takeScreenshot } from "../src/capabilities/web.js";
import { availableBuiltinToolNames } from "../src/tools/builtin-tools.js";
import { UNGATED, createCapabilityRun } from "../src/capabilities/invoke.js";

const KEYS = ["NODETOOL_NODE_PROFILE", "NODETOOL_ENV", "BROWSER_URL"] as const;
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

const HOST_LIMITS = {
  filesystemAccess: "host",
  allowPrivateNetwork: true
} as const;

describe("isHostAccessEnabled", () => {
  it("is on locally and for a self-hosted production install", () => {
    expect(isHostAccessEnabled()).toBe(true);
    process.env["NODETOOL_ENV"] = "production";
    process.env["NODETOOL_NODE_PROFILE"] = "full";
    expect(isHostAccessEnabled()).toBe(true);
  });

  it("is off under the cloud profile and in production", () => {
    process.env["NODETOOL_NODE_PROFILE"] = "cloud";
    expect(isHostAccessEnabled()).toBe(false);
    delete process.env["NODETOOL_NODE_PROFILE"];
    process.env["NODETOOL_ENV"] = "production";
    expect(isHostAccessEnabled()).toBe(false);
  });
});

describe("sandbox limits", () => {
  it("honor a host's opt-in outside the cloud", () => {
    const limits = resolveSandboxLimits(HOST_LIMITS);
    expect(limits.filesystemAccess).toBe("host");
    expect(limits.allowPrivateNetwork).toBe(true);
  });

  it("fall back to the workspace and the SSRF guard under the cloud profile", () => {
    process.env["NODETOOL_NODE_PROFILE"] = "cloud";
    const limits = resolveSandboxLimits(HOST_LIMITS);
    expect(limits.filesystemAccess).toBe("workspace");
    expect(limits.allowPrivateNetwork).toBe(false);
  });
});

describe("capabilities", () => {
  // An empty context has no workspace: reaching past the gate fails there,
  // not with the deployment refusal.
  const run = createCapabilityRun({
    context: {} as unknown as ProcessingContext,
    gate: UNGATED
  });

  it("convert_document refuses extra_args under the cloud profile", async () => {
    process.env["NODETOOL_NODE_PROFILE"] = "cloud";
    await expect(
      convertDocument.impl(run, {
        input_file: "a.md",
        output_file: "a.pdf",
        extra_args: ["--lua-filter=/tmp/x.lua"]
      })
    ).resolves.toEqual({ error: PANDOC_EXTRA_ARGS_DISABLED_ERROR });
  });

  it("convert_document passes extra_args through outside the cloud", async () => {
    const result = (await convertDocument.impl(run, {
      input_file: "a.md",
      output_file: "a.pdf",
      extra_args: ["--toc"]
    })) as { error?: string };
    expect(result.error).not.toBe(PANDOC_EXTRA_ARGS_DISABLED_ERROR);
  });

  it("take_screenshot refuses to launch a local browser under the cloud profile", async () => {
    process.env["NODETOOL_NODE_PROFILE"] = "cloud";
    await expect(
      takeScreenshot.impl(run, { url: "https://example.com" })
    ).resolves.toEqual({
      error: LOCAL_SCREENSHOT_DISABLED_ERROR,
      url: "https://example.com"
    });
  });
});

describe("the belt", () => {
  it("drops take_screenshot under the cloud profile without a browser service", () => {
    expect(availableBuiltinToolNames()).toContain("take_screenshot");
    process.env["NODETOOL_NODE_PROFILE"] = "cloud";
    expect(availableBuiltinToolNames()).not.toContain("take_screenshot");
    process.env["BROWSER_URL"] = "http://browser.internal:3000";
    expect(availableBuiltinToolNames()).toContain("take_screenshot");
  });
});
