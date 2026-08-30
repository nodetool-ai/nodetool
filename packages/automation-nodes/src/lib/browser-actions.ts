/**
 * The browser action layer behind the `browser_*` agent capabilities.
 *
 * One entry point — {@link browserActionRunner} — dispatches an action key to
 * the local CDP function that performs it, resolves the asset an upload names,
 * and persists the bytes a screenshot or a capture produced so the agent sees
 * an asset reference instead of base64.
 *
 * It is handed to `@nodetool-ai/agents` by {@link registerBrowserActions}
 * rather than imported by it: the capability module lives there and this
 * package depends on it, so the edge only runs one way. See
 * `capabilities/browser-runner.ts`.
 */

import { persistOutput, setBrowserActionRunner } from "@nodetool-ai/agents";
import type {
  BrowserActionRunner,
  BrowserSessionStatus
} from "@nodetool-ai/agents";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Buffer } from "node:buffer";
import {
  browserView,
  browserNavigate,
  browserRestart,
  browserClick,
  browserInput,
  browserMoveMouse,
  browserPressKey,
  browserSelectOption,
  browserScroll,
  browserConsoleExec,
  browserConsoleView,
  browserCaptureMedia,
  browserUploadAsset,
  browserStatus
} from "./browser-tools-local.js";
import type {
  BrowserCaptureMediaOutput,
  BrowserCaptureMediaRaw,
  BrowserUploadAssetRaw,
  BrowserViewOutput
} from "./browser-schemas.js";

/** The persisted screenshot ref that replaces `screenshot_png_b64`. */
interface BrowserScreenshotRef {
  type: "image";
  asset_id?: string;
  asset_uri?: string;
  uri?: string;
  path?: string;
  mime_type: string;
  bytes: number;
}

/** A `browser_view` result with its base64 screenshot swapped for a ref. */
type BrowserViewResult = Omit<BrowserViewOutput, "screenshot_png_b64"> & {
  screenshot: BrowserScreenshotRef | null;
};

/** Every action key the runner dispatches, mapped to what performs it. */
const ACTIONS: Readonly<
  Record<string, (params: Record<string, unknown>) => Promise<unknown>>
> = {
  // SAFETY: each local function validates its own input with the Zod schema
  // the capability's JSON schema was written from, so the cast is the one
  // place the untyped tool-call bag becomes a typed input.
  view: (p) => browserView(p),
  navigate: (p) => browserNavigate(p as Parameters<typeof browserNavigate>[0]),
  restart: (p) => browserRestart(p as Parameters<typeof browserRestart>[0]),
  click: (p) => browserClick(p),
  input_text: (p) => browserInput(p as Parameters<typeof browserInput>[0]),
  move_mouse: (p) =>
    browserMoveMouse(p as Parameters<typeof browserMoveMouse>[0]),
  press_key: (p) => browserPressKey(p as Parameters<typeof browserPressKey>[0]),
  select_option: (p) =>
    browserSelectOption(p as Parameters<typeof browserSelectOption>[0]),
  scroll: (p) => browserScroll(p),
  console_exec: (p) =>
    browserConsoleExec(p as Parameters<typeof browserConsoleExec>[0]),
  console_view: (p) => browserConsoleView(p),
  capture_media: (p) => browserCaptureMedia(p),
  upload_asset: (p) => browserUploadAsset(p as BrowserUploadAssetRaw)
};

/**
 * Replace a `view` result's raw `screenshot_png_b64` with a proper ImageRef.
 * When the context exposes `createAsset` the bytes are persisted as an asset
 * and the ref carries `asset_id` + `asset_uri`; otherwise a workspace file
 * path is returned. The base64 field is dropped either way, so downstream
 * consumers see one shape.
 */
async function persistViewScreenshot(
  ctx: ProcessingContext,
  result: BrowserViewOutput
): Promise<BrowserViewResult> {
  const b64 = result.screenshot_png_b64;
  const { screenshot_png_b64: _drop, ...rest } = result;
  if (b64 == null || b64.length === 0) {
    return { ...rest, screenshot: null };
  }
  const bytes = new Uint8Array(Buffer.from(b64, "base64"));
  const saved = await persistOutput(ctx, bytes, {
    namePrefix: "browser-screenshot",
    mime: "image/png"
  });
  return {
    ...rest,
    screenshot: {
      type: "image",
      asset_id: saved.asset_id,
      asset_uri: saved.asset_uri,
      uri: saved.asset_uri ?? saved.path,
      path: saved.path,
      mime_type: saved.mime_type,
      bytes: saved.bytes
    }
  };
}

/**
 * Persist a `capture_media` result's bytes and replace them with an AssetRef,
 * through the same `persistOutput` path screenshots use.
 */
async function persistCaptureMedia(
  ctx: ProcessingContext,
  raw: BrowserCaptureMediaRaw
): Promise<BrowserCaptureMediaRaw | BrowserCaptureMediaOutput> {
  if (typeof raw.media_b64 !== "string" || raw.media_b64.length === 0) {
    // An error object (or already transformed) — pass through unchanged.
    return raw;
  }
  const mime = raw.mime_type || "application/octet-stream";
  const bytes = new Uint8Array(Buffer.from(raw.media_b64, "base64"));
  const saved = await persistOutput(ctx, bytes, {
    namePrefix: "browser-capture",
    mime
  });
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
 * Resolve an `upload_asset` call into the {@link BrowserUploadAssetRaw} the
 * action consumes: read the asset's bytes from the context (the same asset-read
 * path other nodes use, covering asset ids, `asset://` uris, and storage/http
 * URLs) and derive the file name + MIME the website should see.
 */
async function resolveUploadParams(
  ctx: ProcessingContext,
  params: Record<string, unknown>
): Promise<BrowserUploadAssetRaw> {
  const assetId = params["asset_id"];
  const uri = params["uri"];
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
    typeof params["file_name"] === "string" && params["file_name"].length > 0
      ? params["file_name"]
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
  if (typeof params["index"] === "number") raw.index = params["index"];
  if (typeof params["coordinate_x"] === "number")
    raw.coordinate_x = params["coordinate_x"];
  if (typeof params["coordinate_y"] === "number")
    raw.coordinate_y = params["coordinate_y"];
  return raw;
}

/** The runner the `browser` capability module dispatches to. */
export const browserActionRunner: BrowserActionRunner = {
  async run(
    context: ProcessingContext,
    key: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const perform = Object.hasOwn(ACTIONS, key) ? ACTIONS[key] : undefined;
    if (!perform) {
      throw new Error(`Unknown browser action '${key}'`);
    }
    const callParams =
      key === "upload_asset"
        ? await resolveUploadParams(context, params)
        : params;
    // SAFETY: `resolveUploadParams` returns the raw shape the upload action
    // takes; every other action takes the argument bag unchanged.
    const out = await perform(callParams as Record<string, unknown>);
    if (key === "view") {
      // SAFETY: the `view` entry is `browserView`, which resolves to a
      // BrowserViewOutput.
      return persistViewScreenshot(context, out as BrowserViewOutput);
    }
    if (key === "capture_media") {
      // SAFETY: the `capture_media` entry is `browserCaptureMedia`, which
      // resolves to a BrowserCaptureMediaRaw.
      return persistCaptureMedia(context, out as BrowserCaptureMediaRaw);
    }
    return out;
  },

  status(): Promise<BrowserSessionStatus> {
    return browserStatus();
  }
};

/**
 * Serve the `browser_*` capabilities from this process. Called by
 * `@nodetool-ai/base-nodes` at load, which is where every host that has a node
 * registry — the server, the desktop app, the CLI — goes through.
 */
export function registerBrowserActions(): void {
  setBrowserActionRunner(browserActionRunner);
}
