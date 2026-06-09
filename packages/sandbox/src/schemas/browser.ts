import { z } from "zod";

/**
 * Browser tool schemas.
 *
 * The browser exposes TWO addressing modes for every action that hits an
 * element:
 *   - index: numeric id from the element index (produced by browser_view),
 *     cheapest and most reliable for known web apps
 *   - coordinate_x/y: viewport coordinates, required for arbitrary GUI-like
 *     interactions (canvas, custom widgets, drag handles)
 *
 * At least one must be provided; index wins if both are set.
 */

const ElementRef = z
  .object({
    index: z.number().int().nonnegative().optional(),
    coordinate_x: z.number().int().optional(),
    coordinate_y: z.number().int().optional()
  })
  .refine(
    (v) =>
      v.index !== undefined ||
      (v.coordinate_x !== undefined && v.coordinate_y !== undefined),
    { message: "provide either index or (coordinate_x, coordinate_y)" }
  );

export const BrowserViewInput = z.object({
  include_screenshot: z.boolean().optional()
});
export type BrowserViewInput = z.infer<typeof BrowserViewInput>;

export const BrowserElement = z.object({
  index: z.number().int().nonnegative(),
  tag: z.string(),
  role: z.string().nullable(),
  text: z.string(),
  attributes: z.record(z.string(), z.string()),
  bbox: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number()
  })
});
export type BrowserElement = z.infer<typeof BrowserElement>;

export const BrowserViewOutput = z.object({
  url: z.string(),
  title: z.string(),
  viewport: z.object({ width: z.number(), height: z.number() }),
  elements: z.array(BrowserElement),
  screenshot_png_b64: z.string().nullable()
});
export type BrowserViewOutput = z.infer<typeof BrowserViewOutput>;

export const BrowserNavigateInput = z.object({
  url: z.string().min(1),
  wait_until: z.enum(["load", "domcontentloaded", "networkidle"]).optional()
});
export type BrowserNavigateInput = z.infer<typeof BrowserNavigateInput>;

export const BrowserNavigateOutput = z.object({
  url: z.string(),
  title: z.string(),
  status: z.number().int().nullable()
});
export type BrowserNavigateOutput = z.infer<typeof BrowserNavigateOutput>;

export const BrowserRestartInput = z.object({
  url: z.string().optional()
});
export type BrowserRestartInput = z.infer<typeof BrowserRestartInput>;

export const BrowserRestartOutput = z.object({
  url: z.string()
});
export type BrowserRestartOutput = z.infer<typeof BrowserRestartOutput>;

export const BrowserClickInput = ElementRef;
export type BrowserClickInput = z.infer<typeof BrowserClickInput>;

export const BrowserClickOutput = z.object({
  clicked: z.literal(true)
});
export type BrowserClickOutput = z.infer<typeof BrowserClickOutput>;

export const BrowserInputTextInput = z
  .object({
    text: z.string(),
    press_enter: z.boolean().optional(),
    index: z.number().int().nonnegative().optional(),
    coordinate_x: z.number().int().optional(),
    coordinate_y: z.number().int().optional()
  })
  .refine(
    (v) =>
      v.index !== undefined ||
      (v.coordinate_x !== undefined && v.coordinate_y !== undefined),
    { message: "provide either index or (coordinate_x, coordinate_y)" }
  );
export type BrowserInputTextInput = z.infer<typeof BrowserInputTextInput>;

export const BrowserInputTextOutput = z.object({
  typed: z.literal(true)
});
export type BrowserInputTextOutput = z.infer<typeof BrowserInputTextOutput>;

export const BrowserMoveMouseInput = z.object({
  coordinate_x: z.number().int(),
  coordinate_y: z.number().int()
});
export type BrowserMoveMouseInput = z.infer<typeof BrowserMoveMouseInput>;

export const BrowserMoveMouseOutput = z.object({
  moved: z.literal(true)
});
export type BrowserMoveMouseOutput = z.infer<typeof BrowserMoveMouseOutput>;

export const BrowserPressKeyInput = z.object({
  key: z.string().min(1)
});
export type BrowserPressKeyInput = z.infer<typeof BrowserPressKeyInput>;

export const BrowserPressKeyOutput = z.object({
  pressed: z.literal(true)
});
export type BrowserPressKeyOutput = z.infer<typeof BrowserPressKeyOutput>;

export const BrowserSelectOptionInput = z.object({
  index: z.number().int().nonnegative(),
  option: z.string()
});
export type BrowserSelectOptionInput = z.infer<typeof BrowserSelectOptionInput>;

export const BrowserSelectOptionOutput = z.object({
  selected: z.array(z.string())
});
export type BrowserSelectOptionOutput = z.infer<
  typeof BrowserSelectOptionOutput
>;

export const BrowserScrollInput = z.object({
  to_top: z.boolean().optional(),
  to_bottom: z.boolean().optional(),
  pixels: z.number().int().optional()
});
export type BrowserScrollInput = z.infer<typeof BrowserScrollInput>;

export const BrowserScrollOutput = z.object({
  scroll_y: z.number()
});
export type BrowserScrollOutput = z.infer<typeof BrowserScrollOutput>;

export const BrowserConsoleExecInput = z.object({
  javascript: z.string().min(1)
});
export type BrowserConsoleExecInput = z.infer<typeof BrowserConsoleExecInput>;

export const BrowserConsoleExecOutput = z.object({
  result_json: z.string()
});
export type BrowserConsoleExecOutput = z.infer<typeof BrowserConsoleExecOutput>;

export const BrowserConsoleViewInput = z.object({
  max_lines: z.number().int().positive().optional()
});
export type BrowserConsoleViewInput = z.infer<typeof BrowserConsoleViewInput>;

export const BrowserConsoleMessage = z.object({
  type: z.string(),
  text: z.string(),
  timestamp: z.number()
});
export type BrowserConsoleMessage = z.infer<typeof BrowserConsoleMessage>;

export const BrowserConsoleViewOutput = z.object({
  messages: z.array(BrowserConsoleMessage)
});
export type BrowserConsoleViewOutput = z.infer<typeof BrowserConsoleViewOutput>;

/**
 * Capture generated media (image/video/audio) from the current page into bytes.
 *
 * Three addressing modes, in priority order:
 *   - index: an element from the most recent browser_view (a <video>/<audio>/
 *     <img> whose currentSrc/src points at the media)
 *   - resource_url: a network resource URL the page already fetched; the host
 *     attempts Network.getResponseBody for a tracked requestId first
 *   - url: an arbitrary absolute (or blob:) URL to fetch from inside the page
 *
 * At least one of index / url / resource_url must be provided. `media_type`
 * is an optional hint ("image" | "video" | "audio") that biases element
 * resolution and the inferred MIME when the source doesn't declare one.
 */
export const BrowserCaptureMediaInput = z
  .object({
    index: z.number().int().nonnegative().optional(),
    url: z.string().optional(),
    resource_url: z.string().optional(),
    media_type: z.enum(["image", "video", "audio"]).optional()
  })
  .refine(
    (v) =>
      v.index !== undefined ||
      (v.url !== undefined && v.url.length > 0) ||
      (v.resource_url !== undefined && v.resource_url.length > 0),
    { message: "provide one of index, url, or resource_url" }
  );
export type BrowserCaptureMediaInput = z.infer<typeof BrowserCaptureMediaInput>;

/**
 * Raw capture result from the action (local or sandbox). Carries the bytes as
 * base64 plus the resolved MIME and source URL. The host-side tool wrapper
 * persists these bytes via the same `persistOutput` path screenshots use and
 * replaces this shape with a {@link BrowserCaptureMediaOutput} AssetRef.
 */
export const BrowserCaptureMediaRaw = z.object({
  /** Base64-encoded media bytes. */
  media_b64: z.string(),
  /** Resolved MIME type of the captured bytes. */
  mime_type: z.string(),
  /** The URL the bytes were read from (`blob:`/`http(s):`/element currentSrc). */
  source_url: z.string().nullable(),
  /** Which rung of the capture ladder produced the bytes. */
  via: z.enum(["response_body", "in_page_fetch", "downloads"])
});
export type BrowserCaptureMediaRaw = z.infer<typeof BrowserCaptureMediaRaw>;

/**
 * AssetRef-shaped capture output returned to the agent. Mirrors the `screenshot`
 * ref produced by browser_view: a persisted asset with `asset_id`/`asset_uri`
 * (when the context exposes `createAsset`) or a workspace file `path`.
 */
export const BrowserCaptureMediaOutput = z.object({
  type: z.enum(["image", "video", "audio"]),
  asset_id: z.string().optional(),
  asset_uri: z.string().optional(),
  uri: z.string().nullable(),
  path: z.string().optional(),
  mime_type: z.string(),
  bytes: z.number(),
  source_url: z.string().nullable()
});
export type BrowserCaptureMediaOutput = z.infer<
  typeof BrowserCaptureMediaOutput
>;

/**
 * Inject an existing NodeTool asset into a page `<input type="file">`.
 *
 * The agent addresses the file input the same way every other element action
 * does (index from the most recent browser_view, or viewport coordinates) and
 * names the asset to inject by `asset_id` or `uri`. `file_name` overrides the
 * name the website sees; otherwise it is derived from the asset.
 *
 * The agent-facing shape carries only the asset handle — the host-side tool
 * wrapper resolves the bytes (via the same asset-read path other nodes use) and
 * forwards a {@link BrowserUploadAssetRaw} to the action. At least one of
 * asset_id / uri, and at least one of index / (coordinate_x, coordinate_y),
 * must be provided.
 */
export const BrowserUploadAssetInput = z
  .object({
    index: z.number().int().nonnegative().optional(),
    coordinate_x: z.number().int().optional(),
    coordinate_y: z.number().int().optional(),
    asset_id: z.string().optional(),
    uri: z.string().optional(),
    file_name: z.string().optional()
  })
  .refine(
    (v) =>
      (v.asset_id !== undefined && v.asset_id.length > 0) ||
      (v.uri !== undefined && v.uri.length > 0),
    { message: "provide either asset_id or uri" }
  )
  .refine(
    (v) =>
      v.index !== undefined ||
      (v.coordinate_x !== undefined && v.coordinate_y !== undefined),
    { message: "provide either index or (coordinate_x, coordinate_y)" }
  );
export type BrowserUploadAssetInput = z.infer<typeof BrowserUploadAssetInput>;

/**
 * The wire input the upload_asset action actually consumes: the file input's
 * {@link ElementRef} plus the asset bytes resolved host-side (base64), the file
 * name the website should see, and the MIME type. The host tool wrapper builds
 * this from a {@link BrowserUploadAssetInput} after reading the asset; the
 * sandbox container cannot read assets itself, so the bytes ride the wire.
 */
export const BrowserUploadAssetRaw = z
  .object({
    index: z.number().int().nonnegative().optional(),
    coordinate_x: z.number().int().optional(),
    coordinate_y: z.number().int().optional(),
    /** Base64-encoded file bytes. */
    file_b64: z.string(),
    /** File name the website sees on the injected File. */
    file_name: z.string().min(1),
    /** MIME type stamped on the injected File. */
    mime_type: z.string().min(1)
  })
  .refine(
    (v) =>
      v.index !== undefined ||
      (v.coordinate_x !== undefined && v.coordinate_y !== undefined),
    { message: "provide either index or (coordinate_x, coordinate_y)" }
  );
export type BrowserUploadAssetRaw = z.infer<typeof BrowserUploadAssetRaw>;

/**
 * Result of injecting an asset into a file input. `via` records which path
 * succeeded: `native` is `DOM.setFileInputFiles` against a real filesystem path
 * Chrome can reach (host/container Chrome); `data_transfer` is the in-page
 * DataTransfer/`File` fallback used when no path is reachable (e.g. the
 * extension driving the user's own machine from the server).
 */
export const BrowserUploadAssetOutput = z.object({
  uploaded: z.literal(true),
  file_name: z.string(),
  bytes: z.number(),
  via: z.enum(["native", "data_transfer"])
});
export type BrowserUploadAssetOutput = z.infer<
  typeof BrowserUploadAssetOutput
>;
