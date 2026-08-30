/**
 * The `browser` capability module — driving one real Chrome page.
 *
 * These are the `browser_*` actions that used to exist only as `AgentNode`
 * tool classes, reachable from a workflow graph and nowhere else. As
 * capabilities they reach every surface the registry serves: the chat agent,
 * MCP, CodeAct, a Code node, a JS script.
 *
 * The page they drive is either a headless Chrome this process launched or —
 * over the NodeTool Chrome extension's `/ws/extension` relay — the tab the
 * user is already signed in to, cookies, 2FA and all. Nothing here knows
 * which: the action loop in `@nodetool-ai/browser` is transport-agnostic, so
 * the only two capabilities that mention transports at all are
 * `browser_status`, which reports the one in force, and `browser_restart`,
 * which changes it.
 *
 * What this file owns is the half the action package deliberately does not:
 * the `ProcessingContext`. A screenshot comes back from `@nodetool-ai/browser`
 * as base64 and leaves here as an asset reference; an upload arrives as an
 * asset id and reaches the page as bytes. Keeping that split is what lets the
 * `lib.browser.Screenshot` node share the same action loop without depending
 * on the agent layer.
 */

import { Buffer } from "node:buffer";
import {
  browserCaptureMedia,
  browserClick,
  browserConsoleExec,
  browserConsoleView,
  browserInput,
  browserMoveMouse,
  browserNavigate,
  browserPressKey,
  browserRestart,
  browserScroll,
  browserSelectOption,
  browserStatus,
  browserUploadAsset,
  browserView,
  type BrowserCaptureMediaOutput,
  type BrowserCaptureMediaRaw,
  type BrowserUploadAssetRaw,
  type BrowserViewOutput
} from "@nodetool-ai/browser";
import type { ProcessingContext } from "@nodetool-ai/runtime";

import { persistOutput } from "../tools/asset-persist.js";
import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun,
  CapabilitySpec
} from "./types.js";
import {
  browserActionKey,
  browserCaptureMediaSpec,
  browserClickSpec,
  browserConsoleExecSpec,
  browserConsoleViewSpec,
  browserInputTextSpec,
  browserMoveMouseSpec,
  browserNavigateSpec,
  browserPressKeySpec,
  browserRestartSpec,
  browserScrollSpec,
  browserSelectOptionSpec,
  browserSpecs,
  browserStatusSpec,
  browserUploadAssetSpec,
  browserViewSpec
} from "./browser.specs.js";

/** Every action key, mapped to what performs it. */
const ACTIONS: Readonly<
  Record<string, (params: Record<string, unknown>) => Promise<unknown>>
> = {
  // SAFETY: each action validates its own input with the Zod schema the
  // capability's JSON schema was written from, so this is the one place the
  // untyped tool-call bag becomes a typed input.
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

/**
 * Replace a `view` result's raw `screenshot_png_b64` with a proper ImageRef.
 * When the context exposes `createAsset` the bytes are persisted as an asset
 * and the ref carries `asset_id` + `asset_uri`; otherwise a workspace file
 * path is returned. The base64 field is dropped either way, so downstream
 * consumers see one shape.
 */
async function persistViewScreenshot(
  context: ProcessingContext,
  result: BrowserViewOutput
): Promise<BrowserViewResult> {
  const b64 = result.screenshot_png_b64;
  const { screenshot_png_b64: _drop, ...rest } = result;
  if (b64 == null || b64.length === 0) {
    return { ...rest, screenshot: null };
  }
  const saved = await persistOutput(
    context,
    new Uint8Array(Buffer.from(b64, "base64")),
    { namePrefix: "browser-screenshot", mime: "image/png" }
  );
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
  context: ProcessingContext,
  raw: BrowserCaptureMediaRaw
): Promise<BrowserCaptureMediaRaw | BrowserCaptureMediaOutput> {
  if (typeof raw.media_b64 !== "string" || raw.media_b64.length === 0) {
    // An error object (or already transformed) — pass through unchanged.
    return raw;
  }
  const mime = raw.mime_type || "application/octet-stream";
  const saved = await persistOutput(
    context,
    new Uint8Array(Buffer.from(raw.media_b64, "base64")),
    { namePrefix: "browser-capture", mime }
  );
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
 * path other tools use, covering asset ids, `asset://` uris, and storage/http
 * URLs) and derive the file name + MIME the website should see.
 */
async function resolveUploadParams(
  context: ProcessingContext,
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

  const { bytes, attempts } = await context.resolveAssetBytes(handle);
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

/**
 * One capability per action: run it, then give the agent back media it can
 * refer to rather than base64 it would have to carry.
 *
 * Errors come back as `{error}` rather than a throw because a browser action
 * fails for reasons the model can act on — nobody attached a tab, the element
 * index is stale, the page navigated away — and an agent that reads the
 * sentence can retry differently.
 */
function action(spec: CapabilitySpec): CapabilityExport {
  const key = browserActionKey(spec.name);
  const perform = ACTIONS[key];
  if (perform === undefined) {
    throw new Error(`no browser action implements "${spec.name}"`);
  }
  return {
    spec,
    impl: async (run: CapabilityRun, args: Record<string, unknown>) => {
      const { context } = run;
      try {
        const params =
          key === "upload_asset"
            ? await resolveUploadParams(context, args)
            : args;
        // SAFETY: `resolveUploadParams` returns the raw shape the upload action
        // takes; every other action takes the argument bag unchanged.
        const out = await perform(params as Record<string, unknown>);
        if (key === "view") {
          // SAFETY: the `view` entry is `browserView`.
          return await persistViewScreenshot(context, out as BrowserViewOutput);
        }
        if (key === "capture_media") {
          // SAFETY: the `capture_media` entry is `browserCaptureMedia`.
          return await persistCaptureMedia(
            context,
            out as BrowserCaptureMediaRaw
          );
        }
        return out;
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    }
  };
}

const browserStatusCapability: CapabilityExport = {
  spec: browserStatusSpec,
  impl: async () => {
    try {
      return await browserStatus();
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }
};

export const module: CapabilityModule = {
  module: "browser",
  exports: [
    browserStatusCapability,
    action(browserViewSpec),
    action(browserNavigateSpec),
    action(browserRestartSpec),
    action(browserClickSpec),
    action(browserInputTextSpec),
    action(browserMoveMouseSpec),
    action(browserPressKeySpec),
    action(browserSelectOptionSpec),
    action(browserScrollSpec),
    action(browserConsoleExecSpec),
    action(browserConsoleViewSpec),
    action(browserCaptureMediaSpec),
    action(browserUploadAssetSpec)
  ]
};

export { browserSpecs };
