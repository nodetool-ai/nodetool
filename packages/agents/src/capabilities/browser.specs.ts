/**
 * The `browser` module's specs — data only, no implementation.
 *
 * These drive one real Chrome page: either a headless one this process
 * launched, or — through the NodeTool Chrome extension's `/ws/extension`
 * relay — the tab the user is already signed in to. The action loop is the
 * same either way, which is why the transport is not a per-action argument:
 * `browser_status` reports which one is live and `browser_restart` switches it.
 *
 * Split out from `browser.ts` for the reason every `.specs.ts` here is: the
 * registry's eager spec table imports this file, so a belt can be assembled
 * synchronously without pulling Chrome into the entry graph.
 */

import type { CapabilitySpec } from "./types.js";
import type { JsonSchema } from "@nodetool-ai/runtime";

/** Addressing one element: by index from the last view, or by coordinates. */
const ELEMENT_REF_PROPS = {
  index: {
    type: "integer",
    description:
      "Element index from the most recent browser_view call. Required if coordinate_x/y are not provided."
  },
  coordinate_x: { type: "integer" },
  coordinate_y: { type: "integer" }
} as const;

/**
 * The action key behind one capability — `browser_view` runs `view`. The
 * runner in `@nodetool-ai/automation-nodes` dispatches on it, so the mapping
 * is a property of the spec rather than a second table to keep in step.
 */
export function browserActionKey(name: string): string {
  return name.slice("browser_".length);
}

function spec(
  key: string,
  category: CapabilitySpec["category"],
  description: string,
  properties: Record<string, unknown>,
  required?: readonly string[],
  userMessage?: (params: Record<string, unknown>) => string
): CapabilitySpec {
  const inputSchema: JsonSchema = required
    ? { type: "object", properties, required: [...required] }
    : { type: "object", properties };
  const built: CapabilitySpec = {
    name: `browser_${key}`,
    description,
    inputSchema,
    category
  };
  if (userMessage) {
    built.userMessage = userMessage;
  }
  return built;
}

export const browserStatusSpec = spec(
  "status",
  "read",
  "Report the live browser session without opening one: which transport is " +
    "selected (a headless Chrome this server launched, or the user's own " +
    "signed-in Chrome behind the NodeTool extension), whether an extension " +
    "is attached, and where an open session is pointed. Call this before a " +
    "task that needs the user's logged-in session — an unattached extension " +
    "otherwise shows up as a 30-second timeout on the first action.",
  {},
  undefined,
  () => "Checking the browser session"
);

export const browserViewSpec = spec(
  "view",
  "read",
  "Inspect the current browser page: URL, title, viewport size, indexed " +
    "interactive elements, and a screenshot. Every click, type and select " +
    "addresses an element by its index here, and the indexes are rebuilt on " +
    "each view — so view before you act on an index.",
  {
    include_screenshot: {
      type: "boolean",
      description: "Capture a PNG of the viewport (defaults to true)."
    }
  },
  undefined,
  () => "Looking at the browser page"
);

export const browserNavigateSpec = spec(
  "navigate",
  "external",
  "Navigate the browser to a URL.",
  {
    url: { type: "string", description: "Absolute URL to load." },
    wait_until: {
      type: "string",
      enum: ["load", "domcontentloaded", "networkidle"]
    }
  },
  ["url"],
  (params) => {
    const url = String(params["url"] ?? "a page");
    const msg = `Opening ${url}`;
    return msg.length > 80 ? "Opening a page in the browser" : msg;
  }
);

export const browserRestartSpec = spec(
  "restart",
  "execute",
  "Restart the browser session and optionally navigate afterwards. Also the " +
    "one place the transport changes: transport:'extension' drives the " +
    "user's own signed-in Chrome through the NodeTool extension (they must " +
    "have clicked 'Attach to this tab'), transport:'local' drives a headless " +
    "Chrome with no login. Restarting the local transport clears cookies and " +
    "history; restarting the extension transport only re-attaches the " +
    "debugger and leaves the user's browser alone.",
  {
    url: { type: "string" },
    transport: {
      type: "string",
      enum: ["local", "extension"],
      description:
        "Which browser to drive from now on. Omit to keep the current one."
    }
  },
  undefined,
  (params) =>
    params["transport"] === "extension"
      ? "Switching to your signed-in Chrome"
      : "Restarting the browser"
);

export const browserClickSpec = spec(
  "click",
  "external",
  "Click an interactive element by its index from browser_view, or by " +
    "viewport coordinates.",
  { ...ELEMENT_REF_PROPS },
  undefined,
  () => "Clicking in the browser"
);

export const browserInputTextSpec = spec(
  "input_text",
  "external",
  "Type text into an element identified by index or coordinates. Optionally " +
    "presses Enter after typing.",
  {
    text: { type: "string" },
    press_enter: { type: "boolean" },
    ...ELEMENT_REF_PROPS
  },
  ["text"],
  () => "Typing in the browser"
);

export const browserMoveMouseSpec = spec(
  "move_mouse",
  "external",
  "Move the mouse pointer to viewport coordinates.",
  {
    coordinate_x: { type: "integer" },
    coordinate_y: { type: "integer" }
  },
  ["coordinate_x", "coordinate_y"],
  () => "Moving the mouse"
);

export const browserPressKeySpec = spec(
  "press_key",
  "external",
  "Press a keyboard key (Enter, Tab, Escape, ArrowDown, single character, etc.).",
  { key: { type: "string" } },
  ["key"],
  (params) => `Pressing ${String(params["key"] ?? "a key")}`
);

export const browserSelectOptionSpec = spec(
  "select_option",
  "external",
  "Select an option in a <select> element identified by its index from " +
    "browser_view.",
  {
    index: { type: "integer" },
    option: { type: "string" }
  },
  ["index", "option"],
  () => "Choosing an option"
);

export const browserScrollSpec = spec(
  "scroll",
  "external",
  "Scroll the page to top, bottom, or by a relative pixel amount.",
  {
    to_top: { type: "boolean" },
    to_bottom: { type: "boolean" },
    pixels: { type: "integer" }
  },
  undefined,
  () => "Scrolling the page"
);

export const browserConsoleExecSpec = spec(
  "console_exec",
  "execute",
  "Evaluate a JavaScript expression in the page and return the " +
    "JSON-stringified result.",
  { javascript: { type: "string" } },
  ["javascript"],
  () => "Running JavaScript in the page"
);

export const browserConsoleViewSpec = spec(
  "console_view",
  "read",
  "Read recent browser console messages.",
  { max_lines: { type: "integer" } },
  undefined,
  () => "Reading the browser console"
);

export const browserCaptureMediaSpec = spec(
  "capture_media",
  "external",
  "Capture generated media (image, video, or audio) from the current page " +
    "into a NodeTool asset. Address it by element index (a <video>/<audio>/" +
    "<img> from browser_view), by an absolute or blob: URL, or by a " +
    "resource_url the page already fetched. Returns an asset reference.",
  {
    index: {
      type: "integer",
      description:
        "Element index from the most recent browser_view (a media element)."
    },
    url: {
      type: "string",
      description: "Absolute or blob: URL of the media to capture."
    },
    resource_url: {
      type: "string",
      description:
        "URL of a media resource the page already loaded; captured from the network response when available."
    },
    media_type: {
      type: "string",
      enum: ["image", "video", "audio"],
      description:
        "Optional hint biasing element resolution and the inferred MIME type."
    }
  },
  undefined,
  () => "Capturing media from the page"
);

export const browserUploadAssetSpec = spec(
  "upload_asset",
  "external",
  'Inject an existing NodeTool asset into a page <input type="file"> (file ' +
    "picker). Address the file input by element index (from browser_view) or " +
    "viewport coordinates, and name the asset by asset_id or uri. Optionally " +
    "override the file_name the website sees. Tries a native filesystem " +
    "injection first and falls back to an in-page DataTransfer injection " +
    "when the browser runs on a different machine.",
  {
    ...ELEMENT_REF_PROPS,
    asset_id: {
      type: "string",
      description: "Id of the NodeTool asset to upload."
    },
    uri: {
      type: "string",
      description:
        "asset:// uri (or storage/http URL) of the asset to upload, as an alternative to asset_id."
    },
    file_name: {
      type: "string",
      description:
        "Optional file name the website sees; defaults to the asset's name."
    }
  },
  undefined,
  () => "Uploading a file to the page"
);

/** Every spec this module declares, in declaration order. */
export const browserSpecs: readonly CapabilitySpec[] = [
  browserStatusSpec,
  browserViewSpec,
  browserNavigateSpec,
  browserRestartSpec,
  browserClickSpec,
  browserInputTextSpec,
  browserMoveMouseSpec,
  browserPressKeySpec,
  browserSelectOptionSpec,
  browserScrollSpec,
  browserConsoleExecSpec,
  browserConsoleViewSpec,
  browserCaptureMediaSpec,
  browserUploadAssetSpec
];
