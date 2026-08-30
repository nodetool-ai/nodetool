/**
 * The `browser` capability module: the seam, not the browser.
 *
 * What Chrome does when told to click is covered where it can be covered
 * honestly — `packages/automation-nodes/tests/integration/extension-browser.itest.ts`
 * drives a real headless Chrome with the built extension loaded. This file
 * covers everything between an agent's tool call and that: that the module is
 * registered and classified, that every action reaches the runner with the key
 * and arguments it was called with, that a failure comes back as a sentence
 * rather than a throw, and — the one an agent depends on most — that a process
 * with no action layer says so instead of hanging.
 */

import { afterEach, describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { module as browserModule } from "../src/capabilities/browser.js";
import { browserActionKey } from "../src/capabilities/browser.specs.js";
import {
  getBrowserActionRunner,
  setBrowserActionRunner,
  type BrowserActionRunner,
  type BrowserSessionStatus
} from "../src/capabilities/browser-runner.js";
import { UNGATED, createCapabilityRun } from "../src/capabilities/index.js";
import {
  capabilityModuleIssues,
  capabilityModuleOf,
  loadCapabilityModule
} from "../src/capabilities/registry.js";
import { BUILTIN_TOOL_NAMES } from "../src/tools/builtin-tools.js";
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";

const context = {} as ProcessingContext;
const run = createCapabilityRun({ context, gate: UNGATED });

const call = (
  name: string,
  args: Record<string, unknown> = {}
): Promise<Record<string, unknown>> =>
  run.invoke(name, args) as Promise<Record<string, unknown>>;

const IDLE_STATUS: BrowserSessionStatus = {
  transport: "local",
  session_open: false,
  extension_connected: null,
  url: null,
  title: null,
  hint: null
};

/** A runner that records what it was asked to do and answers with the ask. */
function recordingRunner(): {
  runner: BrowserActionRunner;
  calls: { key: string; params: Record<string, unknown> }[];
} {
  const calls: { key: string; params: Record<string, unknown> }[] = [];
  return {
    calls,
    runner: {
      run: async (_ctx, key, params) => {
        calls.push({ key, params });
        return { ran: key };
      },
      status: async () => IDLE_STATUS
    }
  };
}

afterEach(() => {
  setBrowserActionRunner(null);
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
    // The spec's own category and the gate's classification map are two
    // halves of one answer; a disagreement means the gate prompts differently
    // from what the spec advertises.
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
  it("hands the runner the action key its name encodes", async () => {
    const { runner, calls } = recordingRunner();
    setBrowserActionRunner(runner);

    for (const entry of browserModule.exports) {
      if (entry.spec.name === "browser_status") continue;
      await call(entry.spec.name, { probe: entry.spec.name });
    }

    expect(calls.map((c) => c.key)).toEqual(
      browserModule.exports
        .map((entry) => entry.spec.name)
        .filter((name) => name !== "browser_status")
        .map(browserActionKey)
    );
  });

  it("passes the arguments through unchanged", async () => {
    const { runner, calls } = recordingRunner();
    setBrowserActionRunner(runner);

    await call("browser_input_text", { index: 3, text: "hi", press_enter: true });

    expect(calls).toEqual([
      { key: "input_text", params: { index: 3, text: "hi", press_enter: true } }
    ]);
  });

  it("reports a failing action as a sentence, not a throw", async () => {
    setBrowserActionRunner({
      run: async () => {
        throw new Error("Debugger is not attached to any tab.");
      },
      status: async () => IDLE_STATUS
    });

    await expect(call("browser_click", { index: 1 })).resolves.toEqual({
      error: "Debugger is not attached to any tab."
    });
  });

  it("answers browser_status from the runner", async () => {
    setBrowserActionRunner({
      run: async () => ({}),
      status: async () => ({
        transport: "extension",
        session_open: true,
        extension_connected: true,
        url: "https://example.test/",
        title: "Example",
        hint: null
      })
    });

    await expect(call("browser_status")).resolves.toMatchObject({
      transport: "extension",
      extension_connected: true,
      url: "https://example.test/"
    });
  });
});

describe("no action layer in this process", () => {
  it("starts with no runner registered", () => {
    expect(getBrowserActionRunner()).toBeNull();
  });

  it("names the missing package instead of hanging or throwing", async () => {
    for (const entry of browserModule.exports) {
      const result = await call(entry.spec.name);
      expect(String(result["error"])).toContain(
        "@nodetool-ai/automation-nodes"
      );
    }
  });
});
