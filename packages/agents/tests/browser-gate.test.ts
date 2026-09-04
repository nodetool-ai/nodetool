/**
 * The cloud profile drops the `browser_*` capabilities.
 *
 * Two doors have to agree. The belt every host assembles
 * (`availableBuiltinToolNames`) is what a model sees, so dropping a name there
 * is discovery. It is not enforcement: the sandbox mount serves every
 * registered capability module, so a guest importing
 * `@nodetool-ai/sandbox-nodetool/browser` reaches the implementations with no
 * belt in between — which is why each one refuses on its own too.
 *
 * The gate is the switch that prunes the node catalog, and the two already
 * agree: `lib.browser` is absent from `CLOUD_NODE_NAMESPACES`, so the cloud
 * product has neither the Screenshot node nor these capabilities.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";

/** Fail loudly if the gate lets a call through to the action layer. */
const reached: string[] = [];
const action = (name: string) => async () => {
  reached.push(name);
  return { ran: name };
};

vi.mock("@nodetool-ai/browser", () => ({
  browserView: action("browserView"),
  browserNavigate: action("browserNavigate"),
  browserRestart: action("browserRestart"),
  browserClick: action("browserClick"),
  browserInput: action("browserInput"),
  browserMoveMouse: action("browserMoveMouse"),
  browserPressKey: action("browserPressKey"),
  browserSelectOption: action("browserSelectOption"),
  browserScroll: action("browserScroll"),
  browserConsoleExec: action("browserConsoleExec"),
  browserConsoleView: action("browserConsoleView"),
  browserCaptureMedia: action("browserCaptureMedia"),
  browserUploadAsset: action("browserUploadAsset"),
  browserStatus: action("browserStatus")
}));

const { BUILTIN_TOOL_NAMES, availableBuiltinToolNames, getBuiltinTools } =
  await import("../src/tools/builtin-tools.js");
const { BROWSER_DISABLED_ERROR, isBrowserEnabled } = await import(
  "../src/browser-gate.js"
);
const { module: browserModule } = await import("../src/capabilities/browser.js");
const { UNGATED, createCapabilityRun } = await import(
  "../src/capabilities/invoke.js"
);

const KEYS = ["NODETOOL_NODE_PROFILE", "NODETOOL_ENV"] as const;
const saved: Record<string, string | undefined> = {};

/** Every `browser_*` name the module declares. */
const BROWSER_NAMES = browserModule.exports.map((entry) => entry.spec.name);

beforeEach(() => {
  reached.length = 0;
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

describe("isBrowserEnabled", () => {
  it("is on for a local install", () => {
    expect(isBrowserEnabled()).toBe(true);
  });

  it("is off under the cloud profile and in production", () => {
    process.env["NODETOOL_NODE_PROFILE"] = "cloud";
    expect(isBrowserEnabled()).toBe(false);
    delete process.env["NODETOOL_NODE_PROFILE"];
    process.env["NODETOOL_ENV"] = "production";
    expect(isBrowserEnabled()).toBe(false);
  });

  it("is on for a self-hosted production install", () => {
    process.env["NODETOOL_ENV"] = "production";
    process.env["NODETOOL_NODE_PROFILE"] = "full";
    expect(isBrowserEnabled()).toBe(true);
  });
});

describe("the belt", () => {
  it("carries every browser_* name by default", () => {
    const names = availableBuiltinToolNames();
    for (const name of BROWSER_NAMES) expect(names).toContain(name);
    const built = getBuiltinTools().map((tool) => tool.name);
    for (const name of BROWSER_NAMES) expect(built).toContain(name);
  });

  it("drops all of them under the cloud profile, and nothing adjacent", () => {
    process.env["NODETOOL_NODE_PROFILE"] = "cloud";
    const names = availableBuiltinToolNames();
    for (const name of BROWSER_NAMES) expect(names).not.toContain(name);
    const built = getBuiltinTools().map((tool) => tool.name);
    for (const name of BROWSER_NAMES) expect(built).not.toContain(name);

    // `browser` is the web module's fetch-a-page-as-text capability — a
    // different thing that shares a prefix, and it stays.
    expect(names).toContain("browser");
    expect(names).toContain("take_screenshot");

    // The profile drops yt_dlp and render_model3d too
    // (yt-dlp-gate.test.ts, blender-gate.test.ts); nothing else goes.
    const dropped = BUILTIN_TOOL_NAMES.filter((name) => !names.includes(name));
    expect([...dropped].sort()).toEqual(
      [...BROWSER_NAMES, "yt_dlp", "render_model3d"].sort()
    );
  });

  it("keeps them for a self-hosted production install", () => {
    process.env["NODETOOL_ENV"] = "production";
    process.env["NODETOOL_NODE_PROFILE"] = "full";
    const names = availableBuiltinToolNames();
    for (const name of BROWSER_NAMES) expect(names).toContain(name);
  });
});

describe("the capabilities themselves", () => {
  const run = createCapabilityRun({
    context: {} as unknown as ProcessingContext,
    gate: UNGATED
  });

  it("every one refuses under the cloud profile, reaching no browser", async () => {
    process.env["NODETOOL_NODE_PROFILE"] = "cloud";

    for (const entry of browserModule.exports) {
      await expect(entry.impl(run, {})).resolves.toEqual({
        error: BROWSER_DISABLED_ERROR
      });
    }
    // The refusal is before the action layer, not a failure inside it.
    expect(reached).toEqual([]);
  });

  it("says where the surface does belong", () => {
    expect(BROWSER_DISABLED_ERROR).toContain("desktop app");
    expect(BROWSER_DISABLED_ERROR).toContain("self-hosted");
  });

  it("reaches the action layer when the profile allows it", async () => {
    await expect(
      browserModule.exports
        .find((entry) => entry.spec.name === "browser_status")
        ?.impl(run, {})
    ).resolves.toEqual({ ran: "browserStatus" });
    expect(reached).toEqual(["browserStatus"]);
  });
});
