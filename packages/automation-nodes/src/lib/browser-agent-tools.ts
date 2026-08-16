/**
 * Browser actions exposed as agent tools (`browser_*`), driving a
 * host-process Chrome via CDP. State (cookies, navigation, indexed elements)
 * persists for the lifetime of the host process.
 *
 * Registered in `BUILTIN_AGENT_TOOL_CLASSES`, so a regular `AgentNode` can
 * pick them by name in its `tools` prop. Chrome launches lazily on first use.
 */

import { Tool, persistOutput } from "@nodetool-ai/agents";
import type { ProcessingContext } from "@nodetool-ai/runtime";
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
  browserConsoleView as localConsoleView,
  browserCaptureMedia as localCaptureMedia,
  browserUploadAsset as localUploadAsset
} from "./browser-tools-local.js";
import type {
  BrowserCaptureMediaOutput,
  BrowserCaptureMediaRaw,
  BrowserClickOutput,
  BrowserConsoleExecOutput,
  BrowserConsoleViewOutput,
  BrowserInputTextOutput,
  BrowserMoveMouseOutput,
  BrowserNavigateOutput,
  BrowserPressKeyOutput,
  BrowserRestartOutput,
  BrowserScrollOutput,
  BrowserSelectOptionOutput,
  BrowserUploadAssetOutput,
  BrowserUploadAssetRaw,
  BrowserViewOutput
} from "./browser-schemas.js";

/** What one browser action resolves to, before media is persisted. */
type BrowserActionOutput =
  | BrowserViewOutput
  | BrowserNavigateOutput
  | BrowserRestartOutput
  | BrowserClickOutput
  | BrowserInputTextOutput
  | BrowserMoveMouseOutput
  | BrowserPressKeyOutput
  | BrowserSelectOptionOutput
  | BrowserScrollOutput
  | BrowserConsoleExecOutput
  | BrowserConsoleViewOutput
  | BrowserCaptureMediaRaw
  | BrowserUploadAssetOutput;

/** The persisted screenshot ref that replaces `screenshot_png_b64`. */
type BrowserScreenshotRef = {
  type: "image";
  asset_id?: string;
  asset_uri?: string;
  uri?: string;
  path?: string;
  mime_type: string;
  bytes: number;
};

/** A `browser_view` result with its base64 screenshot swapped for a ref. */
type BrowserViewResult = Omit<BrowserViewOutput, "screenshot_png_b64"> & {
  screenshot: BrowserScreenshotRef | null;
};

/** What a `browser_*` tool hands back to the agent. */
type BrowserToolResult =
  | BrowserActionOutput
  | BrowserViewResult
  | BrowserCaptureMediaOutput
  | { error: string };

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
  /** Action key used to build the tool name (`browser_<key>`). */
  key: string;
  /** Tool description. */
  description: string;
  /** JSON schema for the tool's input. */
  inputSchema: Record<string, unknown>;
  /** Local-process invocation. */
  local: (params: Record<string, unknown>) => Promise<BrowserActionOutput>;
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
  },
  {
    key: "console_view",
    description: "Read recent browser console messages.",
    inputSchema: {
      type: "object",
      properties: { max_lines: { type: "integer" } }
    },
    local: (p) => localConsoleView(p as Parameters<typeof localConsoleView>[0]),
  },
  {
    key: "capture_media",
    description:
      "Capture generated media (image, video, or audio) from the current page into a NodeTool asset. Address it by element index (a <video>/<audio>/<img> from browser_view), by an absolute or blob: URL, or by a resource_url the page already fetched. Returns an asset reference.",
    inputSchema: {
      type: "object",
      properties: {
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
      }
    },
    local: (p) => localCaptureMedia(p as Parameters<typeof localCaptureMedia>[0]),
  },
  {
    key: "upload_asset",
    description:
      "Inject an existing NodeTool asset into a page <input type=\"file\"> (file picker). Address the file input by element index (from browser_view) or viewport coordinates, and name the asset to upload by asset_id or uri. Optionally override the file_name the website sees. Tries a native filesystem injection first and falls back to an in-page DataTransfer injection when the browser runs on a different machine.",
    inputSchema: {
      type: "object",
      properties: {
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
      }
    },
    // params are pre-enriched to BrowserUploadAssetRaw by the tool wrappers,
    // which resolve the asset bytes from the ProcessingContext.
    local: (p) => localUploadAsset(p as BrowserUploadAssetRaw),
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
  result: BrowserViewOutput,
  namePrefix: string
): Promise<BrowserViewResult> {
  const b64 = result.screenshot_png_b64;
  if (b64 == null || b64.length === 0) {
    const { screenshot_png_b64: _drop, ...rest } = result;
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
  const { screenshot_png_b64: _drop, ...rest } = result;
  return { ...rest, screenshot };
}

/**
 * Persist the raw bytes from a `capture_media` result and replace them with an
 * AssetRef. Uses the SAME `persistOutput` path as screenshots: when the context
 * exposes `createAsset` the ref carries `asset_id` + `asset_uri`; otherwise a
 * workspace file `path` is returned. The base64 payload is always dropped so
 * downstream consumers see one shape.
 */
async function persistCaptureMedia(
  ctx: ProcessingContext,
  result: BrowserCaptureMediaRaw,
  namePrefix: string
): Promise<BrowserCaptureMediaRaw | BrowserCaptureMediaOutput> {
  const raw = result;
  if (typeof raw.media_b64 !== "string" || raw.media_b64.length === 0) {
    // An error object (or already-transformed) — pass through unchanged.
    return result;
  }
  const mime = raw.mime_type || "application/octet-stream";
  const bytes = new Uint8Array(Buffer.from(raw.media_b64, "base64"));
  const saved = await persistOutput(ctx, bytes, { namePrefix, mime });
  const kind = mime.startsWith("video/")
    ? ("video" as const)
    : mime.startsWith("audio/")
      ? ("audio" as const)
      : ("image" as const);
  return {
    type: kind,
    asset_id: saved.asset_id,
    asset_uri: saved.asset_uri,
    uri: saved.asset_uri ?? saved.path ?? null,
    path: saved.path,
    mime_type: saved.mime_type,
    bytes: saved.bytes,
    source_url: raw.source_url ?? null
  };
}

/** Minimal extension → MIME map for naming the injected upload File. */
const UPLOAD_EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  pdf: "application/pdf",
  json: "application/json",
  txt: "text/plain",
  csv: "text/csv"
};

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/**
 * Resolve an `upload_asset` tool call into the {@link BrowserUploadAssetRaw}
 * the action consumes: read the asset's bytes from the context (the same
 * asset-read path other nodes use, covering asset ids, `asset://` uris, and
 * storage/http URLs) and derive the file name + MIME the website should see.
 */
async function resolveUploadParams(
  ctx: ProcessingContext,
  params: Record<string, unknown>
): Promise<BrowserUploadAssetRaw> {
  const assetId = params.asset_id;
  const uri = params.uri;
  const handle =
    typeof assetId === "string" && assetId.length > 0
      ? assetId
      : typeof uri === "string" && uri.length > 0
        ? uri
        : null;
  if (!handle) {
    throw new Error("upload_asset requires asset_id or uri");
  }

  const { bytes, attempts } = await ctx.resolveAssetBytes(handle);
  if (!bytes) {
    const details = attempts.length > 0 ? ` Attempts: ${attempts.join("; ")}` : "";
    throw new Error(`Unable to resolve asset '${handle}' to bytes.${details}`);
  }

  const explicitName =
    typeof params.file_name === "string" && params.file_name.length > 0
      ? params.file_name
      : null;
  // Derive a name from the handle's last path segment when none was supplied.
  const fromHandle = handle.split(/[/?#]/).filter(Boolean).pop() ?? "";
  const fileName = explicitName ?? (extOf(fromHandle) ? fromHandle : "upload.bin");
  const mimeType =
    UPLOAD_EXT_TO_MIME[extOf(fileName)] ?? "application/octet-stream";

  const raw: BrowserUploadAssetRaw = {
    file_b64: Buffer.from(bytes).toString("base64"),
    file_name: fileName,
    mime_type: mimeType
  };
  if (typeof params.index === "number") raw.index = params.index;
  if (typeof params.coordinate_x === "number")
    raw.coordinate_x = params.coordinate_x;
  if (typeof params.coordinate_y === "number")
    raw.coordinate_y = params.coordinate_y;
  return raw;
}

function makeLocalToolClass(spec: BrowserActionSpec): ToolCtor {
  return class extends Tool {
    readonly name = `browser_${spec.key}`;
    readonly description = spec.description;
    protected readonly jsonSchema = spec.inputSchema;

    async process(
      ctx: ProcessingContext,
      params: Record<string, unknown>
    ): Promise<BrowserToolResult> {
      try {
        const callParams =
          spec.key === "upload_asset"
            ? await resolveUploadParams(ctx, params ?? {})
            : (params ?? {});
        const out = await spec.local(callParams);
        if (spec.key === "view") {
          // SAFETY: the `view` spec's `local` is `browserView`, which resolves
          // to a BrowserViewOutput.
          return await persistViewScreenshot(
            ctx,
            out as BrowserViewOutput,
            "browser-screenshot"
          );
        }
        if (spec.key === "capture_media") {
          // SAFETY: the `capture_media` spec's `local` is `browserCaptureMedia`,
          // which resolves to a BrowserCaptureMediaRaw.
          return await persistCaptureMedia(
            ctx,
            out as BrowserCaptureMediaRaw,
            "browser-capture"
          );
        }
        return out;
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    }
  };
}

/** Build the 13 `browser_*` tool classes. */
export function buildBrowserAgentToolClasses(): ToolCtor[] {
  return BROWSER_ACTION_SPECS.map((spec) => makeLocalToolClass(spec));
}
