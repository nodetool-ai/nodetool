/**
 * Browser actions exposed as agent tools, in two flavours:
 *
 *   - `browser_*`         — drives a host-process Chrome via CDP. State
 *                           (cookies, navigation, indexed elements) persists
 *                           for the lifetime of the host process.
 *   - `sandbox_browser_*` — proxies the same actions to the per-workflow
 *                           sandbox container's tool server, sharing the
 *                           session that SandboxShell/SandboxFile use.
 *
 * Both flavours are registered in `BUILTIN_AGENT_TOOL_CLASSES`, so a regular
 * `AgentNode` can pick them by name in its `tools` prop. The sandbox version
 * lazily acquires a `ToolClient` from the shared `SessionStore`; the local
 * version lazily launches Chrome on first use.
 */

import { Tool, persistOutput } from "@nodetool-ai/agents";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { ToolClient } from "@nodetool-ai/sandbox";
import { Buffer } from "node:buffer";
import {
  browserView as localView,
  browserNavigate as localNavigate,
  browserRestart as localRestart,
  browserClick as localClick,
  browserInput as localInput,
  browserMoveMouse as localMoveMouse,
  browserPressKey as localPressKey,
  browserSelectOption as localSelectOption,
  browserScroll as localScroll,
  browserConsoleExec as localConsoleExec,
  browserConsoleView as localConsoleView
} from "./browser-tools-local.js";

const ELEMENT_REF_PROPS = {
  index: {
    type: "integer",
    description:
      "Element index from the most recent browser_view call. Required if coordinate_x/y are not provided."
  },
  coordinate_x: { type: "integer" },
  coordinate_y: { type: "integer" }
} as const;

export interface BrowserActionSpec {
  /** Action key shared by local + sandbox tool names. */
  key: string;
  /** Tool description (same for both flavours; sandbox prefix added below). */
  description: string;
  /** JSON schema for the tool's input. */
  inputSchema: Record<string, unknown>;
  /** Local-process invocation. */
  local: (
    params: Record<string, unknown>
  ) => Promise<unknown>;
  /** Sandbox invocation, taking a per-call ToolClient. */
  sandbox: (
    client: ToolClient,
    params: Record<string, unknown>
  ) => Promise<unknown>;
}

export const BROWSER_ACTION_SPECS: readonly BrowserActionSpec[] = [
  {
    key: "view",
    description:
      "Inspect the current browser page: URL, title, viewport size, indexed interactive elements, and an optional screenshot.",
    inputSchema: {
      type: "object",
      properties: {
        include_screenshot: {
          type: "boolean",
          description: "Capture a base64 PNG of the viewport (defaults to true)."
        }
      }
    },
    local: (p) => localView(p as Parameters<typeof localView>[0]),
    sandbox: (c, p) => c.browserView(p as Parameters<ToolClient["browserView"]>[0])
  },
  {
    key: "navigate",
    description: "Navigate the browser to a URL.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Absolute URL to load." },
        wait_until: {
          type: "string",
          enum: ["load", "domcontentloaded", "networkidle"]
        }
      },
      required: ["url"]
    },
    local: (p) => localNavigate(p as Parameters<typeof localNavigate>[0]),
    sandbox: (c, p) =>
      c.browserNavigate(p as Parameters<ToolClient["browserNavigate"]>[0])
  },
  {
    key: "restart",
    description:
      "Restart the browser context (clears cookies and history), optionally navigating to a URL afterwards.",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string" } }
    },
    local: (p) => localRestart(p as Parameters<typeof localRestart>[0]),
    sandbox: (c, p) =>
      c.browserRestart(p as Parameters<ToolClient["browserRestart"]>[0])
  },
  {
    key: "click",
    description:
      "Click an interactive element by its index from browser_view, or by viewport coordinates.",
    inputSchema: {
      type: "object",
      properties: { ...ELEMENT_REF_PROPS }
    },
    local: (p) => localClick(p as Parameters<typeof localClick>[0]),
    sandbox: (c, p) =>
      c.browserClick(p as Parameters<ToolClient["browserClick"]>[0])
  },
  {
    key: "input_text",
    description:
      "Type text into an element identified by index or coordinates. Optionally presses Enter after typing.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string" },
        press_enter: { type: "boolean" },
        ...ELEMENT_REF_PROPS
      },
      required: ["text"]
    },
    local: (p) => localInput(p as Parameters<typeof localInput>[0]),
    sandbox: (c, p) =>
      c.browserInput(p as Parameters<ToolClient["browserInput"]>[0])
  },
  {
    key: "move_mouse",
    description: "Move the mouse pointer to viewport coordinates.",
    inputSchema: {
      type: "object",
      properties: {
        coordinate_x: { type: "integer" },
        coordinate_y: { type: "integer" }
      },
      required: ["coordinate_x", "coordinate_y"]
    },
    local: (p) => localMoveMouse(p as Parameters<typeof localMoveMouse>[0]),
    sandbox: (c, p) =>
      c.browserMoveMouse(p as Parameters<ToolClient["browserMoveMouse"]>[0])
  },
  {
    key: "press_key",
    description:
      "Press a keyboard key (Enter, Tab, Escape, ArrowDown, single character, etc.).",
    inputSchema: {
      type: "object",
      properties: { key: { type: "string" } },
      required: ["key"]
    },
    local: (p) => localPressKey(p as Parameters<typeof localPressKey>[0]),
    sandbox: (c, p) =>
      c.browserPressKey(p as Parameters<ToolClient["browserPressKey"]>[0])
  },
  {
    key: "select_option",
    description:
      "Select an option in a <select> element identified by its index from browser_view.",
    inputSchema: {
      type: "object",
      properties: {
        index: { type: "integer" },
        option: { type: "string" }
      },
      required: ["index", "option"]
    },
    local: (p) =>
      localSelectOption(p as Parameters<typeof localSelectOption>[0]),
    sandbox: (c, p) =>
      c.browserSelectOption(
        p as Parameters<ToolClient["browserSelectOption"]>[0]
      )
  },
  {
    key: "scroll",
    description:
      "Scroll the page to top, bottom, or by a relative pixel amount.",
    inputSchema: {
      type: "object",
      properties: {
        to_top: { type: "boolean" },
        to_bottom: { type: "boolean" },
        pixels: { type: "integer" }
      }
    },
    local: (p) => localScroll(p as Parameters<typeof localScroll>[0]),
    sandbox: (c, p) =>
      c.browserScroll(p as Parameters<ToolClient["browserScroll"]>[0])
  },
  {
    key: "console_exec",
    description:
      "Evaluate a JavaScript expression in the page and return the JSON-stringified result.",
    inputSchema: {
      type: "object",
      properties: { javascript: { type: "string" } },
      required: ["javascript"]
    },
    local: (p) => localConsoleExec(p as Parameters<typeof localConsoleExec>[0]),
    sandbox: (c, p) =>
      c.browserConsoleExec(
        p as Parameters<ToolClient["browserConsoleExec"]>[0]
      )
  },
  {
    key: "console_view",
    description: "Read recent browser console messages.",
    inputSchema: {
      type: "object",
      properties: { max_lines: { type: "integer" } }
    },
    local: (p) => localConsoleView(p as Parameters<typeof localConsoleView>[0]),
    sandbox: (c, p) =>
      c.browserConsoleView(
        p as Parameters<ToolClient["browserConsoleView"]>[0]
      )
  }
];

type ToolCtor = new () => Tool;

/**
 * Replace the raw `screenshot_png_b64` string field of a `view` result with
 * a proper `screenshot` ImageRef. When the context exposes `createAsset`
 * the bytes are persisted as an asset and the ref carries `asset_id` +
 * `asset_uri`; otherwise a workspace file path is returned. The original
 * base64 field is dropped so downstream consumers always see one shape.
 */
async function persistViewScreenshot(
  ctx: ProcessingContext,
  result: unknown,
  namePrefix: string
): Promise<unknown> {
  if (!result || typeof result !== "object") return result;
  const view = result as Record<string, unknown>;
  const b64 = view.screenshot_png_b64;
  if (typeof b64 !== "string" || b64.length === 0) {
    const { screenshot_png_b64: _drop, ...rest } = view;
    return { ...rest, screenshot: null };
  }
  const bytes = new Uint8Array(Buffer.from(b64, "base64"));
  const saved = await persistOutput(ctx, bytes, {
    namePrefix,
    mime: "image/png"
  });
  const screenshot = {
    type: "image" as const,
    asset_id: saved.asset_id,
    asset_uri: saved.asset_uri,
    uri: saved.asset_uri ?? saved.path,
    path: saved.path,
    mime_type: saved.mime_type,
    bytes: saved.bytes
  };
  const { screenshot_png_b64: _drop, ...rest } = view;
  return { ...rest, screenshot };
}

function makeLocalToolClass(spec: BrowserActionSpec): ToolCtor {
  return class extends Tool {
    readonly name = `browser_${spec.key}`;
    readonly description = spec.description;
    readonly inputSchema = spec.inputSchema;

    async process(
      ctx: ProcessingContext,
      params: Record<string, unknown>
    ): Promise<unknown> {
      try {
        const out = await spec.local(params ?? {});
        if (spec.key === "view") {
          return await persistViewScreenshot(ctx, out, "browser-screenshot");
        }
        return out;
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    }
  };
}

function makeSandboxToolClass(
  spec: BrowserActionSpec,
  acquireClient: (ctx: ProcessingContext) => Promise<ToolClient>
): ToolCtor {
  return class extends Tool {
    readonly name = `sandbox_browser_${spec.key}`;
    readonly description = `${spec.description} Runs inside the per-workflow sandbox container.`;
    readonly inputSchema = spec.inputSchema;

    async process(
      ctx: ProcessingContext,
      params: Record<string, unknown>
    ): Promise<unknown> {
      try {
        const client = await acquireClient(ctx);
        const out = await spec.sandbox(client, params ?? {});
        if (spec.key === "view") {
          return await persistViewScreenshot(
            ctx,
            out,
            "sandbox-browser-screenshot"
          );
        }
        return out;
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    }
  };
}

/**
 * Build the 22 browser tool classes (11 local + 11 sandbox).
 * The sandbox classes need a function that knows how to acquire a ToolClient
 * for a given ProcessingContext; that lives in nodes/sandbox.ts to avoid a
 * cross-package dependency loop.
 */
export function buildBrowserAgentToolClasses(
  acquireSandboxClient: (ctx: ProcessingContext) => Promise<ToolClient>
): ToolCtor[] {
  const out: ToolCtor[] = [];
  for (const spec of BROWSER_ACTION_SPECS) {
    out.push(makeLocalToolClass(spec));
    out.push(makeSandboxToolClass(spec, acquireSandboxClient));
  }
  return out;
}
