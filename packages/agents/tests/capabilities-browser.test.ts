/**
 * The `browser` capability module: the agent-facing half, not the browser.
 *
 * What Chrome does when told to click is covered where it can be covered
 * honestly — `packages/browser/tests/integration/extension-browser.itest.ts`
 * drives a real headless Chrome with the built extension loaded. What this
 * file covers is everything between an agent's tool call and
 * `@nodetool-ai/browser`: that the module is registered and classified, that
 * each capability reaches the action its name encodes with the arguments it
 * was called with, that a failure comes back as a sentence rather than a
 * throw, and that the two media actions hand back an asset reference instead
 * of the base64 the action layer returns.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";

/** Every action call the module made, in order. */
const calls: { name: string; params: Record<string, unknown> }[] = [];

/** What the next action call resolves to, keyed by action name. */
const results = new Map<string, unknown>();

/** Actions that should throw instead of resolving, keyed by action name. */
const throws = new Map<string, string>();

function action(name: string) {
  return async (params: Record<string, unknown>) => {
    calls.push({ name, params });
    const message = throws.get(name);
    if (message !== undefined) throw new Error(message);
    return results.get(name) ?? { ran: name };
  };
}

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

const { module: browserModule } = await import("../src/capabilities/browser.js");
const { browserActionKey } = await import("../src/capabilities/browser.specs.js");
const { UNGATED, createCapabilityRun } = await import(
  "../src/capabilities/index.js"
);
const { capabilityModuleIssues, capabilityModuleOf, loadCapabilityModule } =
  await import("../src/capabilities/registry.js");
const { BUILTIN_TOOL_NAMES } = await import("../src/tools/builtin-tools.js");
const { permissionCategoryFor } = await import(
  "../src/tools/tool-permissions.js"
);

/**
 * A context with no asset store: `persistOutput` falls back to a workspace
 * path, and `resolveAssetBytes` answers "no such asset" the way a real one
 * does for an id nobody minted.
 */
const context = {
  resolveAssetBytes: async (handle: string) =>
    handle === "known-asset"
      ? { bytes: new Uint8Array([1, 2, 3]), attempts: [] }
      : { bytes: null, attempts: ["asset store empty"] }
} as unknown as ProcessingContext;

const run = createCapabilityRun({ context, gate: UNGATED });

const call = (
  name: string,
  args: Record<string, unknown> = {}
): Promise<Record<string, unknown>> =>
  run.invoke(name, args) as Promise<Record<string, unknown>>;

beforeEach(() => {
  calls.length = 0;
  results.clear();
  throws.clear();
});

describe("module registration", () => {
  it("is the module the registry loads for its name", async () => {
    const loaded = await loadCapabilityModule("browser");
    expect(loaded).toBe(browserModule);
    expect(capabilityModuleIssues("browser", loaded)).toEqual([]);
  });

  it("owns every browser_* wire name, and the belt offers them", () => {
    const names = browserModule.exports.map((entry) => entry.spec.name);
    expect(names).toEqual([
      "browser_status",
      "browser_view",
      "browser_navigate",
      "browser_restart",
      "browser_click",
      "browser_input_text",
      "browser_move_mouse",
      "browser_press_key",
      "browser_select_option",
      "browser_scroll",
      "browser_console_exec",
      "browser_console_view",
      "browser_capture_media",
      "browser_upload_asset"
    ]);
    for (const name of names) {
      expect([name, capabilityModuleOf(name)]).toEqual([name, "browser"]);
      expect(BUILTIN_TOOL_NAMES).toContain(name);
    }
  });

  it("classifies reads as reads and every page action as external", () => {
    const byName = Object.fromEntries(
      browserModule.exports.map((entry) => [entry.spec.name, entry.spec.category])
    );
    // The spec's own category and the gate's classification map are two halves
    // of one answer; a disagreement means the gate prompts differently from
    // what the spec advertises.
    for (const entry of browserModule.exports) {
      expect([entry.spec.name, entry.spec.category]).toEqual([
        entry.spec.name,
        permissionCategoryFor(entry.spec.name)
      ]);
    }
    expect(byName["browser_status"]).toBe("read");
    expect(byName["browser_view"]).toBe("read");
    expect(byName["browser_console_view"]).toBe("read");
    expect(byName["browser_console_exec"]).toBe("execute");
    expect(byName["browser_restart"]).toBe("execute");
    expect(byName["browser_click"]).toBe("external");
    expect(byName["browser_upload_asset"]).toBe("external");
  });
});

describe("dispatch", () => {
  it("reaches the action each name encodes", async () => {
    for (const entry of browserModule.exports) {
      if (entry.spec.name === "browser_upload_asset") continue;
      await call(entry.spec.name);
    }

    // browser_view → view → browserView, and so on for every one of them.
    expect(calls.map((c) => c.name)).toEqual(
      browserModule.exports
        .map((entry) => entry.spec.name)
        .filter((name) => name !== "browser_upload_asset")
        .map((name) =>
          name === "browser_status"
            ? "browserStatus"
            : name === "browser_input_text"
              ? "browserInput"
              : `browser${browserActionKey(name)
                  .split("_")
                  .map((part) => part[0]?.toUpperCase() + part.slice(1))
                  .join("")}`
        )
    );
  });

  it("passes the arguments through unchanged", async () => {
    await call("browser_input_text", { index: 3, text: "hi", press_enter: true });

    expect(calls).toEqual([
      {
        name: "browserInput",
        params: { index: 3, text: "hi", press_enter: true }
      }
    ]);
  });

  it("reports a failing action as a sentence, not a throw", async () => {
    throws.set("browserClick", "Debugger is not attached to any tab.");

    await expect(call("browser_click", { index: 1 })).resolves.toEqual({
      error: "Debugger is not attached to any tab."
    });
  });

  it("answers browser_status from the action layer", async () => {
    results.set("browserStatus", {
      transport: "extension",
      session_open: true,
      extension_connected: true,
      url: "https://example.test/",
      title: "Example",
      hint: null
    });

    await expect(call("browser_status")).resolves.toMatchObject({
      transport: "extension",
      extension_connected: true,
      url: "https://example.test/"
    });
  });
});

describe("media crosses the boundary as a reference, not as base64", () => {
  it("persists a view's screenshot and drops the base64 field", async () => {
    results.set("browserView", {
      url: "https://example.test/",
      title: "Example",
      viewport: { width: 1280, height: 900 },
      elements: [],
      // A 1x1 PNG.
      screenshot_png_b64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    });

    const result = await call("browser_view", {});

    expect(result["screenshot_png_b64"]).toBeUndefined();
    expect(result["screenshot"]).toMatchObject({
      type: "image",
      mime_type: "image/png"
    });
    expect(result["title"]).toBe("Example");
  });

  it("reports a view with no screenshot as null rather than omitting it", async () => {
    results.set("browserView", {
      url: "https://example.test/",
      title: "Example",
      viewport: { width: 1280, height: 900 },
      elements: [],
      screenshot_png_b64: null
    });

    const result = await call("browser_view", { include_screenshot: false });

    expect(result["screenshot"]).toBeNull();
    expect(result["screenshot_png_b64"]).toBeUndefined();
  });

  it("persists captured media under the kind its MIME names", async () => {
    results.set("browserCaptureMedia", {
      media_b64: Buffer.from("not really a video").toString("base64"),
      mime_type: "video/mp4",
      source_url: "https://example.test/clip.mp4",
      via: "response_body"
    });

    const result = await call("browser_capture_media", { index: 2 });

    expect(result).toMatchObject({
      type: "video",
      mime_type: "video/mp4",
      source_url: "https://example.test/clip.mp4"
    });
    expect(result["media_b64"]).toBeUndefined();
  });

  it("passes a capture error through instead of persisting it", async () => {
    results.set("browserCaptureMedia", { error: "no media element at index 9" });

    await expect(call("browser_capture_media", { index: 9 })).resolves.toEqual({
      error: "no media element at index 9"
    });
  });
});

describe("upload resolves the asset before the page sees it", () => {
  it("hands the action bytes, a file name and a MIME type", async () => {
    await call("browser_upload_asset", {
      index: 4,
      asset_id: "known-asset",
      file_name: "shot.png"
    });

    expect(calls).toEqual([
      {
        name: "browserUploadAsset",
        params: {
          file_b64: Buffer.from([1, 2, 3]).toString("base64"),
          file_name: "shot.png",
          mime_type: "image/png",
          index: 4
        }
      }
    ]);
  });

  it("refuses a call that names no asset", async () => {
    const result = await call("browser_upload_asset", { index: 1 });

    expect(String(result["error"])).toContain("requires asset_id or uri");
    expect(calls).toEqual([]);
  });

  it("says why an asset could not be read, with what was tried", async () => {
    const result = await call("browser_upload_asset", {
      index: 1,
      asset_id: "missing"
    });

    expect(String(result["error"])).toContain("Unable to resolve asset");
    expect(String(result["error"])).toContain("asset store empty");
    expect(calls).toEqual([]);
  });
});
