import { createHash, createHmac, randomUUID } from "node:crypto";
import { crc32 } from "node:zlib";
import { createLogger } from "@nodetool-ai/config";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import { fetchExternalMedia } from "../external-media-fetch.js";
import { BaseProvider, type ProviderCapability } from "./base-provider.js";
import { createDreaminaMusic, type DreaminaMusic } from "./dreamina-music.js";
import { DREAMINA_IMAGE_MODELS, DREAMINA_VIDEO_MODELS } from "./dreamina-models.js";
import type { EncodedAudioResult, ImageModel, Message, MusicModel, ImageToImageParams, ImageToVideoParams, ProviderStreamItem, ReferenceToVideoInputs, ReferenceToVideoParams, TextToImageParams, TextToMusicParams, TextToVideoParams, VideoModel, NamedReferenceImage } from "./types.js";

const log = createLogger("nodetool.runtime.providers.dreamina");

/** Evaluates JavaScript inside the user's logged-in Dreamina tab. */
export interface DreaminaPageRunner {
  /** Run `expression` (an async-wrapped JS expression) in the tab and return its JSON value. */
  evaluate(expression: string): Promise<unknown>;
}

/** The extension keeps the debugger attached between polls, then detaches when idle. */
const IDLE_CLOSE_MS = 30_000;
const DREAMINA_HOST = "dreamina.capcut.com";

/**
 * Runs scripts in the tab the NodeTool extension is attached to, through the
 * native messaging host's socket. The tab must already be a logged-in Dreamina
 * page, because the requests rely on that origin and its cookies.
 */
function createExtensionRunner(): DreaminaPageRunner {
  type Handle = Awaited<ReturnType<typeof import("@nodetool-ai/browser").createExtensionPage>>;
  let handle: Handle | null = null;
  let opening: Promise<Handle> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let busy = 0;

  const drop = async (): Promise<void> => {
    const current = handle;
    handle = null;
    if (current) await current.close().catch(() => undefined);
  };

  const open = async (): Promise<Handle> => {
    const { createExtensionPage } = await import("@nodetool-ai/browser");
    const next = await createExtensionPage(undefined, { urlMatch: DREAMINA_HOST });
    try {
      const host = await next.page.evaluate<string>("location.hostname");
      if (host !== DREAMINA_HOST) {
        throw new Error(`The attached tab is ${host || "not a web page"}. Open https://${DREAMINA_HOST}, sign in, and attach the NodeTool extension to that tab`);
      }
    } catch (error) {
      await next.close().catch(() => undefined);
      throw error;
    }
    return next;
  };

  return {
    async evaluate(expression: string): Promise<unknown> {
      if (idleTimer) clearTimeout(idleTimer);
      busy += 1;
      try {
        if (!handle) {
          // One attach serves every concurrent caller.
          opening ??= open().finally(() => { opening = null; });
          handle = await opening;
        }
        return await handle.page.evaluate(expression);
      } catch (error) {
        await drop();
        throw error;
      } finally {
        busy -= 1;
        if (busy === 0) {
          idleTimer = setTimeout(() => void drop(), IDLE_CLOSE_MS);
          idleTimer.unref?.();
        }
      }
    }
  };
}

let pageRunner: DreaminaPageRunner | null = null;

/** Replace the page runner. Tests use this to avoid a real browser. */
export function setDreaminaPageRunner(runner: DreaminaPageRunner | null): void {
  pageRunner = runner;
}

function runner(): DreaminaPageRunner {
  return (pageRunner ??= createExtensionRunner());
}

const API_BASE = "https://mweb-api-sg.capcut.com";
const APP_ID = "513641";
const APP_VERSION = "8.4.0";
const DA_VERSION = "3.3.28";
const WEB_VERSION = "7.5.0";
const POLL_INTERVAL_MS = 2500;
const MAX_POLL_FAILURES = 5;
/** How long a submit cut off by a lost tab has to show up in the history. */
const UNCONFIRMED_SUBMIT_GRACE_MS = 30_000;
const GENERATE_PATH = "/mweb/v1/aigc_draft/generate";
const DEFAULT_TIMEOUT_MS = 5 * 60_000;
const VIDEO_TIMEOUT_MS = 10 * 60_000;
const CONFIG_TTL_MS = 5 * 60_000;
const VIDEO_FPS = 24;

/** Dreamina's `image_ratio` enum, in the order the web app numbers it. */
const RATIO_TYPES: Record<string, number> = {
  "1:1": 1,
  "3:4": 2,
  "16:9": 3,
  "4:3": 4,
  "9:16": 5,
  "2:3": 6,
  "3:2": 7,
  "21:9": 8
};

/** `task.status` values returned by `get_history_by_ids`. */
const TASK_DONE = 50;
const TASK_FAILED = 30;

interface RatioSize { ratio_type: number; width: number; height: number }
interface DreaminaModelConfig {
  model_req_key: string;
  model_name: string;
  feats?: string[];
  default_resolution_type?: string;
  resolution_map?: Record<string, { image_ratio_sizes?: RatioSize[] }>;
}
interface VideoOption { key: string; enum_val?: { string_value?: string[] | null; int_value?: number[] | null; default_val_idx?: number | null } }
interface DreaminaVideoModelConfig { model_req_key: string; model_name: string; options?: VideoOption[] }
interface DreaminaResponse<T> { ret: string; errmsg?: string; data?: T }
interface HistoryRecord {
  task?: { status?: number };
  fail_code?: string;
  fail_msg?: string;
  item_list?: Array<{
    image?: { large_images?: Array<{ image_url?: string }> };
    video?: { transcoded_video?: { origin?: { video_url?: string } } };
    audio?: { origin_audio?: { url?: string; audio_url?: string; format?: string; duration_ms?: number } };
    common_attr?: { item_urls?: string[] };
  }>;
}

function region(): string {
  const fromEnv = process.env.DREAMINA_REGION;
  if (fromEnv) return fromEnv.toUpperCase();
  return new Intl.DateTimeFormat().resolvedOptions().locale.split("-")[1]?.toUpperCase() ?? "US";
}

/** The web app signs each call as md5 over the path tail, platform, version and clock. */
function signedHeaders(path: string): Record<string, string> {
  const deviceTime = String(Math.floor(Date.now() / 1000));
  const sign = createHash("md5").update(`9e2c|${path.slice(-7)}|7|${APP_VERSION}|${deviceTime}||11ac`).digest("hex");
  const loc = region();
  return {
    "Content-Type": "application/json",
    sign,
    "device-time": deviceTime,
    tdid: "",
    "sign-ver": "1",
    pf: "7",
    appvr: APP_VERSION,
    loc,
    lan: "en",
    appid: APP_ID
  };
}

/**
 * Whether `error` means the Dreamina tab went away: closed, reloaded or
 * navigated while a command ran. The runner drops its attach on any error, so
 * the next call attaches afresh.
 */
function tabLost(error: unknown): boolean {
  return error instanceof Error && /detached|target[ _]closed|no tab with/i.test(error.message);
}

/**
 * Run `step` and, if the tab is lost, once more on a fresh attach. Only for
 * steps that cost nothing and can repeat: never the generate request.
 */
async function retryOnTabLoss<T>(what: string, step: () => Promise<T>): Promise<T> {
  try {
    return await step();
  } catch (error) {
    if (!tabLost(error)) throw error;
    log.warn("Dreamina tab lost, retrying on a fresh attach", { what, error: (error as Error).message });
    return step();
  }
}

async function callApi<T>(path: string, body: unknown): Promise<T> {
  return path === GENERATE_PATH ? callApiOnce<T>(path, body) : retryOnTabLoss(path, () => callApiOnce<T>(path, body));
}

async function callApiOnce<T>(path: string, body: unknown): Promise<T> {
  const query = new URLSearchParams({ aid: APP_ID, device_platform: "web", region: region(), da_version: DA_VERSION, web_version: WEB_VERSION, aigc_features: "app_lip_sync" });
  const request = { url: `${API_BASE}${path}?${query}`, headers: signedHeaders(path), body: JSON.stringify(body) };
  const expression = `(() => { const a = ${JSON.stringify(request)};
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open("POST", a.url);
      x.withCredentials = true;
      for (const k of Object.keys(a.headers)) x.setRequestHeader(k, a.headers[k]);
      x.onload = () => { try { resolve(JSON.parse(x.responseText)); } catch { reject(new Error("Dreamina returned a non-JSON response (HTTP " + x.status + ")")); } };
      x.onerror = () => reject(new Error("Dreamina request failed"));
      x.send(a.body);
    });
  })()`;
  const started = Date.now();
  const response = (await runner().evaluate(expression)) as DreaminaResponse<T>;
  log.debug("Dreamina API call", { path, ret: response.ret, ms: Date.now() - started });
  // `submit_audit_job` answers with an empty `ret`, which carries no error.
  if (response.ret !== "0" && response.ret !== "") {
    const hint = response.ret === "1015" || response.ret === "1014" ? " (is the Dreamina tab logged in?)" : "";
    throw new Error(`Dreamina ${path} failed: ${response.errmsg ?? "unknown error"} (ret ${response.ret})${hint}`);
  }
  return response.data as T;
}

function aspectRatioFor(params: { aspectRatio?: string | null; width?: number | null; height?: number | null }, fallback = "1:1"): string {
  if (params.aspectRatio && RATIO_TYPES[params.aspectRatio]) return params.aspectRatio;
  if (params.aspectRatio) throw new Error(`Dreamina does not support aspect ratio ${params.aspectRatio}. Use one of ${Object.keys(RATIO_TYPES).join(", ")}`);
  if (params.width && params.height) return nearestRatio(params.width, params.height);
  return fallback;
}

function draftFor(model: string, prompt: string, negativePrompt: string, seed: number, ratioType: number, size: RatioSize, resolution: string): string {
  const id = (): string => randomUUID();
  const component = {
    type: "image_base_component",
    id: id(),
    min_version: "3.0.2",
    aigc_mode: "workbench",
    metadata: { type: "", id: id(), created_platform: 3, created_platform_version: "", created_time_in_ms: String(Date.now()), created_did: "" },
    generate_type: "generate",
    abilities: {
      type: "",
      id: id(),
      generate: {
        type: "",
        id: id(),
        core_param: {
          type: "",
          id: id(),
          model,
          prompt,
          negative_prompt: negativePrompt,
          seed,
          sample_strength: 0.5,
          image_ratio: ratioType,
          large_image_info: { type: "", id: id(), height: size.height, width: size.width, resolution_type: resolution },
          intelligent_ratio: false,
          generate_type: 0
        },
        gen_option: { type: "", id: id(), gen_count: 1, generate_all: false }
      }
    }
  };
  return JSON.stringify({ type: "draft", id: id(), min_version: "3.0.2", min_features: [], is_from_tsn: true, version: DA_VERSION, main_component_id: component.id, component_list: [component] });
}

/** An image stored in Dreamina's media store, ready to reference in a draft. */
interface UploadedImage { uri: string; width: number; height: number }

/**
 * Image-to-image draft: the site's "blend" component with one `byte_edit`
 * ability that carries the source images. The prompt keeps the `##` lead the
 * web editor writes in front of a prompt that has references.
 */
function blendDraftFor(model: string, prompt: string, negativePrompt: string, seed: number, strength: number, ratioType: number, size: RatioSize, resolution: string, sources: UploadedImage[]): string {
  const id = (): string => randomUUID();
  const component = {
    type: "image_base_component",
    id: id(),
    min_version: "3.0.2",
    aigc_mode: "workbench",
    metadata: { type: "", id: id(), created_platform: 3, created_platform_version: "", created_time_in_ms: String(Date.now()), created_did: "" },
    generate_type: "blend",
    abilities: {
      type: "",
      id: id(),
      blend: {
        type: "",
        id: id(),
        min_features: [],
        core_param: {
          type: "",
          id: id(),
          model,
          prompt: `##${prompt}`,
          negative_prompt: negativePrompt,
          seed,
          sample_strength: strength,
          image_ratio: ratioType,
          large_image_info: { type: "", id: id(), height: size.height, width: size.width, resolution_type: resolution },
          intelligent_ratio: false,
          generate_type: 0
        },
        ability_list: [{
          type: "",
          id: id(),
          name: "byte_edit",
          image_uri_list: sources.map((image) => image.uri),
          image_list: sources.map((image) => ({ type: "image", id: id(), source_from: "upload", platform_type: 1, name: "", image_uri: image.uri, width: image.width, height: image.height, format: "", title: "", uri: image.uri })),
          strength: strength
        }],
        prompt_placeholder_info_list: [{ type: "", id: id(), ability_index: 0 }],
        postedit_param: { type: "", id: id(), generate_type: 0 }
      },
      gen_option: { type: "", id: id(), gen_count: 1, generate_all: false }
    }
  };
  return JSON.stringify({ type: "draft", id: id(), min_version: "3.0.2", min_features: [], is_from_tsn: true, version: DA_VERSION, main_component_id: component.id, component_list: [component] });
}

/** The nearest Dreamina ratio to a pixel size. */
function nearestRatio(width: number, height: number): string {
  const target = width / height;
  let best = "1:1";
  let bestDiff = Infinity;
  for (const key of Object.keys(RATIO_TYPES)) {
    const [w, h] = key.split(":").map(Number);
    const diff = Math.abs(w / h - target);
    if (diff < bestDiff) { best = key; bestDiff = diff; }
  }
  return best;
}

const MAX_REFERENCE_IMAGES = 9;
const MAX_REFERENCE_VIDEOS = 3;
const MAX_REFERENCE_AUDIOS = 3;
/** Chrome accepts at most 1 MiB per host-to-extension message, so the page receives uploads in pieces. */
const UPLOAD_PIECE_CHARS = 400_000;

interface PageFetchRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  /** Text body, or the id of base64 pieces already staged in the page. */
  body?: { text: string } | { staged: string };
}

/** Run one request in the Dreamina tab, so its origin and cookies apply. */
async function pageFetch(request: PageFetchRequest): Promise<{ status: number; text: string }> {
  const expression = `(async () => {
    const a = ${JSON.stringify(request)};
    let body;
    if (a.body && "staged" in a.body) {
      const binary = atob(window.__ntUp[a.body.staged]);
      body = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      delete window.__ntUp[a.body.staged];
    } else if (a.body) {
      body = a.body.text;
    }
    const response = await fetch(a.url, { method: a.method, headers: a.headers, body, credentials: "omit" });
    return { status: response.status, text: await response.text() };
  })()`;
  return (await runner().evaluate(expression)) as { status: number; text: string };
}

/** Stage `bytes` in the page as base64 pieces and return the staging id. */
async function stageBytes(bytes: Uint8Array): Promise<string> {
  const id = randomUUID();
  const base64 = Buffer.from(bytes).toString("base64");
  for (let at = 0; at < base64.length; at += UPLOAD_PIECE_CHARS) {
    const piece = base64.slice(at, at + UPLOAD_PIECE_CHARS);
    await runner().evaluate(`(() => { window.__ntUp ??= {}; window.__ntUp[${JSON.stringify(id)}] = (window.__ntUp[${JSON.stringify(id)}] ?? "") + ${JSON.stringify(piece)}; return true; })()`);
  }
  await runner().evaluate(`(() => { window.__ntUp ??= {}; window.__ntUp[${JSON.stringify(id)}] ??= ""; return true; })()`);
  return id;
}

const sha256Hex = (data: string | Uint8Array): string => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string): Buffer => createHmac("sha256", key).update(data).digest();
const encodeQuery = (value: string): string => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

interface UploadToken {
  access_key_id: string;
  secret_access_key: string;
  session_token: string;
  space_name: string;
  upload_domain: string;
  region?: string;
}

/** AWS Signature V4 headers for an ImageX or VOD call, which signs only the amz headers. */
function imagexHeaders(token: UploadToken, method: "GET" | "POST", query: Record<string, string>, payload: string, service: "imagex" | "vod" = "imagex"): Record<string, string> {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const region = !token.region || token.region.length <= 3 ? "ap-singapore-1" : token.region;
  const headers: Record<string, string> = { "x-amz-date": amzDate, "x-amz-security-token": token.session_token };
  if (method === "POST") headers["x-amz-content-sha256"] = sha256Hex(payload);
  const signedNames = Object.keys(headers).sort();
  const canonicalQuery = Object.keys(query).sort().map((k) => `${encodeQuery(k)}=${encodeQuery(query[k])}`).join("&");
  const canonicalHeaders = signedNames.map((n) => `${n}:${headers[n]}\n`).join("");
  const canonical = [method, "/", canonicalQuery, canonicalHeaders, signedNames.join(";"), sha256Hex(payload)].join("\n");
  const scope = `${day}/${region}/${service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonical)].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${token.secret_access_key}`, day), region), service), "aws4_request");
  const signature = createHmac("sha256", key).update(toSign).digest("hex");
  if (method === "POST") { headers["Content-Type"] = "application/json"; }
  return {
    ...headers,
    Authorization: `AWS4-HMAC-SHA256 Credential=${token.access_key_id}/${scope}, SignedHeaders=${signedNames.join(";")}, Signature=${signature}`
  };
}

interface ApplyResult {
  Result?: { UploadAddress?: { StoreInfos?: Array<{ StoreUri: string; Auth: string }>; UploadHosts?: string[]; SessionKey?: string } };
}
interface CommitResult {
  Result?: { PluginResult?: Array<{ ImageUri: string; ImageWidth: number; ImageHeight: number }> };
}

/** Upload an image through ImageX the way the web app does and return its store URI. */
function uploadImage(bytes: Uint8Array): Promise<UploadedImage> {
  return retryOnTabLoss("image upload", () => uploadImageOnce(bytes));
}

async function uploadImageOnce(bytes: Uint8Array): Promise<UploadedImage> {
  const token = await callApi<UploadToken>("/mweb/v1/get_upload_token", { scene: 2 });
  const account = (await runner().evaluate(`fetch("https://dreamina.capcut.com/passport/web/account/info/?aid=${APP_ID}&account_sdk_source=web&language=en", { credentials: "include" }).then((r) => r.json())`)) as { data?: { user_id_str?: string } };
  const userId = account.data?.user_id_str;
  if (!userId) throw new Error("Dreamina account info has no user id (is the tab logged in?)");

  const applyQuery = { Action: "ApplyImageUpload", Version: "2018-08-01", ServiceId: token.space_name, FileSize: String(bytes.length), s: Math.random().toString(36).slice(2, 13), device_platform: "web" };
  const applyUrl = `https://${token.upload_domain}/?${Object.entries(applyQuery).map(([k, v]) => `${encodeQuery(k)}=${encodeQuery(v)}`).join("&")}`;
  const apply = await pageFetch({ url: applyUrl, method: "GET", headers: imagexHeaders(token, "GET", applyQuery, "") });
  const address = (JSON.parse(apply.text) as ApplyResult).Result?.UploadAddress;
  const store = address?.StoreInfos?.[0];
  const host = address?.UploadHosts?.[0];
  if (apply.status !== 200 || !store || !host || !address?.SessionKey) throw new Error(`Dreamina image upload was refused (ApplyImageUpload HTTP ${apply.status})`);

  const staged = await stageBytes(bytes);
  const upload = await pageFetch({
    url: `https://${host}/upload/v1/${store.StoreUri}`,
    method: "POST",
    headers: {
      Authorization: store.Auth,
      "Content-CRC32": (crc32(bytes) >>> 0).toString(16).padStart(8, "0"),
      "X-Storage-U": userId,
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="undefined"'
    },
    body: { staged }
  });
  if (upload.status !== 200) throw new Error(`Dreamina image upload failed (HTTP ${upload.status})`);

  const commitQuery = { Action: "CommitImageUpload", Version: "2018-08-01", ServiceId: token.space_name };
  const commitBody = JSON.stringify({ SessionKey: address.SessionKey });
  const commit = await pageFetch({
    url: `https://${token.upload_domain}/?${Object.entries(commitQuery).map(([k, v]) => `${encodeQuery(k)}=${encodeQuery(v)}`).join("&")}`,
    method: "POST",
    headers: imagexHeaders(token, "POST", commitQuery, commitBody),
    body: { text: commitBody }
  });
  const result = (JSON.parse(commit.text) as CommitResult).Result?.PluginResult?.[0];
  if (commit.status !== 200 || !result?.ImageUri) throw new Error(`Dreamina image upload could not be committed (HTTP ${commit.status})`);
  await callApi("/mweb/v1/imagex/submit_audit_job", { uri_list: [result.ImageUri] });
  return { uri: result.ImageUri, width: result.ImageWidth, height: result.ImageHeight };
}

/** A video stored in Dreamina's VOD store, ready to reference in a draft. */
interface UploadedVideo { vid: string; width: number; height: number; durationMs: number }

interface VodApplyResult {
  Result?: { InnerUploadAddress?: { UploadNodes?: Array<{ Vid?: string; UploadHost?: string; SessionKey?: string; StoreInfos?: Array<{ StoreUri: string; Auth: string }> }> } };
}
interface VodCommitResult {
  Result?: { Results?: Array<{ Vid?: string; VideoMeta?: { Width?: number; Height?: number; Duration?: number } }> };
}

/** Upload a video or audio file through VOD the way the web app does and return its vid and size. VOD files audio as `video`. */
function uploadVideo(bytes: Uint8Array): Promise<UploadedVideo> {
  return retryOnTabLoss("video upload", () => uploadVideoOnce(bytes));
}

async function uploadVideoOnce(bytes: Uint8Array): Promise<UploadedVideo> {
  const token = await callApi<UploadToken>("/mweb/v1/get_upload_token", { scene: 1 });
  const account = (await runner().evaluate(`fetch("https://dreamina.capcut.com/passport/web/account/info/?aid=${APP_ID}&account_sdk_source=web&language=en", { credentials: "include" }).then((r) => r.json())`)) as { data?: { user_id_str?: string } };
  const userId = account.data?.user_id_str;
  if (!userId) throw new Error("Dreamina account info has no user id (is the tab logged in?)");

  const applyQuery = { Action: "ApplyUploadInner", Version: "2020-11-19", SpaceName: token.space_name, FileType: "video", IsInner: "1", FileSize: String(bytes.length), s: Math.random().toString(36).slice(2, 13), device_platform: "web" };
  const url = (query: Record<string, string>): string => `https://${token.upload_domain}/?${Object.entries(query).map(([k, v]) => `${encodeQuery(k)}=${encodeQuery(v)}`).join("&")}`;
  const apply = await pageFetch({ url: url(applyQuery), method: "GET", headers: imagexHeaders(token, "GET", applyQuery, "", "vod") });
  const node = (JSON.parse(apply.text) as VodApplyResult).Result?.InnerUploadAddress?.UploadNodes?.[0];
  const store = node?.StoreInfos?.[0];
  if (apply.status !== 200 || !store || !node?.UploadHost || !node.SessionKey) throw new Error(`Dreamina video upload was refused (ApplyUploadInner HTTP ${apply.status})`);

  const staged = await stageBytes(bytes);
  const upload = await pageFetch({
    url: `https://${node.UploadHost}/upload/v1/${store.StoreUri}`,
    method: "POST",
    headers: {
      Authorization: store.Auth,
      "Content-CRC32": (crc32(bytes) >>> 0).toString(16).padStart(8, "0"),
      "X-Storage-U": userId,
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="undefined"'
    },
    body: { staged }
  });
  if (upload.status !== 200) throw new Error(`Dreamina video upload failed (HTTP ${upload.status})`);

  const commitQuery = { Action: "CommitUploadInner", Version: "2020-11-19", SpaceName: token.space_name };
  const commitBody = JSON.stringify({ SessionKey: node.SessionKey, Functions: [{ name: "GetMeta" }] });
  const commit = await pageFetch({
    url: url(commitQuery),
    method: "POST",
    headers: imagexHeaders(token, "POST", commitQuery, commitBody, "vod"),
    body: { text: commitBody }
  });
  const result = (JSON.parse(commit.text) as VodCommitResult).Result?.Results?.[0];
  if (commit.status !== 200 || !result?.Vid) throw new Error(`Dreamina video upload could not be committed (HTTP ${commit.status})`);
  const meta = result.VideoMeta;
  return { vid: result.Vid, width: meta?.Width ?? 0, height: meta?.Height ?? 0, durationMs: Math.round((meta?.Duration ?? 0) * 1000) };
}

/** Ask Dreamina's review whether it accepts these references for this model. */
async function auditReferences(model: string, images: UploadedImage[], videos: UploadedVideo[] = [], audios: UploadedVideo[] = []): Promise<void> {
  const data = await callApi<{ result_list?: Array<{ audit_decision?: number }> }>("/mweb/v1/execute_generate_audit", {
    scene: 2,
    model_key: model,
    material_list: [
      ...images.map((image) => ({ uri: image.uri, material_type: 1 })),
      ...videos.map((video) => ({ vid: video.vid, material_type: 2 })),
      ...audios.map((audio) => ({ vid: audio.vid, material_type: 3 }))
    ]
  });
  const rejected = (data.result_list ?? []).findIndex((entry) => entry.audit_decision !== 1);
  if (rejected >= 0) {
    const kind = rejected < images.length ? `image ${rejected + 1}` : rejected < images.length + videos.length ? `video ${rejected - images.length + 1}` : `audio ${rejected - images.length - videos.length + 1}`;
    throw new Error(`Dreamina review rejected reference ${kind}`);
  }
}

type MetaPart = { type: ""; id: string; meta_type: "text" | "image" | "video" | "audio"; text: string; material_ref?: { type: ""; id: string; material_idx: number } };

/**
 * Split a prompt on `[Image N]`, `[Video N]` and `[Audio N]` markers into the
 * segments the site's editor produces: every image, video and audio leads,
 * then the prompt follows with each marker as an inline mention of its
 * material. A material's index counts images first, then videos, then audios.
 */
function referenceMeta(prompt: string, imageCount: number, videoCount = 0, audioCount = 0): MetaPart[] {
  const counts = { image: imageCount, video: videoCount, audio: audioCount };
  const offsets = { image: 0, video: imageCount, audio: imageCount + videoCount };
  const media = (kind: "image" | "video" | "audio", index: number): MetaPart => ({ type: "", id: randomUUID(), meta_type: kind, text: "", material_ref: { type: "", id: randomUUID(), material_idx: offsets[kind] + index } });
  const text = (value: string): MetaPart => ({ type: "", id: randomUUID(), meta_type: "text", text: value });
  // Captured from the web app: the materials always lead, in order, even when
  // the prompt mentions them again inline.
  const parts: MetaPart[] = [
    ...Array.from({ length: imageCount }, (_, i) => media("image", i)),
    ...Array.from({ length: videoCount }, (_, i) => media("video", i)),
    ...Array.from({ length: audioCount }, (_, i) => media("audio", i))
  ];
  let last = 0;
  for (const match of prompt.matchAll(/\[(Image|Video|Audio) (\d+)\]/g)) {
    const kind = match[1].toLowerCase() as "image" | "video" | "audio";
    const index = Number(match[2]) - 1;
    if (index < 0 || index >= counts[kind]) throw new Error(`The prompt refers to [${match[1]} ${match[2]}] but only ${counts[kind]} reference ${kind}(s) were given`);
    if (match.index > last) parts.push(text(prompt.slice(last, match.index)));
    parts.push(media(kind, index));
    last = match.index + match[0].length;
  }
  if (last < prompt.length) parts.push(text(prompt.slice(last)));
  return parts;
}

/** The still frames that bound a clip: the first, and optionally the last. */
interface FrameImages { first: UploadedImage; last?: UploadedImage }

function videoDraftFor(model: string, prompt: string, seed: number, ratio: string, resolution: string, durationMs: number, submitId: string, references: UploadedImage[] = [], frames?: FrameImages, videos: UploadedVideo[] = [], audios: UploadedVideo[] = []): string {
  const id = (): string => randomUUID();
  // Seedance 2.5's 480p preview model renders in Dreamina's draft mode. The web
  // app marks the input as a draft on the current schema version, and the API
  // answers "invalid parameter" (ret 1000) without it.
  const draftMode = model.endsWith("_draft");
  const frameImage = (image: UploadedImage) => ({ type: "image", source_from: "upload", platform_type: 1, name: "", image_uri: image.uri, aigc_image: {}, width: image.width, height: image.height, format: "", uri: image.uri });
  const videoInput: Record<string, unknown> = {
    type: "",
    id: id(),
    min_version: draftMode ? DA_VERSION : references.length + videos.length + audios.length > 0 ? "3.3.9" : "3.0.5",
    prompt: references.length + videos.length + audios.length > 0 ? "" : prompt,
    ...(draftMode && { is_draft_mode: true }),
    video_mode: 2,
    fps: VIDEO_FPS,
    duration_ms: durationMs,
    resolution,
    idip_meta_list: [],
  };
  if (frames) {
    videoInput.first_frame_image = frameImage(frames.first);
    if (frames.last) {
      videoInput.end_frame_image = frameImage(frames.last);
      videoInput.ending_control = "1.0";
    }
  }
  if (references.length + videos.length + audios.length > 0) {
    videoInput.unified_edit_input = {
      material_list: [...references.map((image) => ({
        type: "",
        id: id(),
        material_type: "image",
        image_info: { type: "image", source_from: "upload", platform_type: 1, name: "", image_uri: image.uri, aigc_image: {}, width: image.width, height: image.height, format: "", title: "", uri: image.uri }
      })), ...videos.map((video) => ({
        type: "",
        id: id(),
        material_type: "video",
        video_info: { type: "video", source_from: "upload", name: "", vid: video.vid, fps: 0, width: video.width, height: video.height, duration: video.durationMs }
      })), ...audios.map((audio) => ({
        type: "",
        id: id(),
        material_type: "audio",
        audio_info: { type: "audio", source_from: "upload", vid: audio.vid, duration: audio.durationMs, name: "" }
      }))],
      meta_list: referenceMeta(prompt, references.length, videos.length, audios.length)
    };
  }
  const component = {
    type: "video_base_component",
    id: id(),
    min_version: "1.0.0",
    aigc_mode: "workbench",
    metadata: { type: "", id: id(), created_platform: 3, created_platform_version: "", created_time_in_ms: String(Date.now()), created_did: "" },
    generate_type: "gen_video",
    abilities: {
      type: "",
      id: id(),
      gen_video: {
        type: "",
        id: id(),
        text_to_video_params: {
          type: "",
          id: id(),
          video_gen_inputs: [videoInput],
          video_aspect_ratio: ratio,
          seed,
          model_req_key: model,
          priority: 0
        },
        video_task_extra: JSON.stringify({ isDefaultSeed: 1, originSubmitId: submitId, isRegenerate: false, enterFrom: "click", position: "page_bottom_box", promptType: "original_prompt", ...(frames ? { functionMode: "first_last_frames", generatorFeature: "firstLastFrames" } : { functionMode: "omni_reference", generatorFeature: "omniReference" }), batchNumber: 1, hasRejectedAudit: 0 })
      }
    },
    process_type: 1
  };
  // Captured from the web app: reference input declares the unified-edit
  // feature on the 3.3.9 schema, and every Seedance 2.5 model the 2.5 result
  // action.
  const unifiedEdit = references.length + videos.length + audios.length > 0;
  const minFeatures = [
    ...(unifiedEdit ? ["AIGC_Video_UnifiedEdit"] : []),
    ...(model.includes("seedance_45") ? ["AIGC_Video_Seedance25ResultAction"] : [])
  ];
  const minVersion = draftMode ? DA_VERSION : unifiedEdit ? "3.3.9" : "3.0.5";
  return JSON.stringify({ type: "draft", id: id(), min_version: minVersion, min_features: minFeatures, is_from_tsn: true, version: DA_VERSION, main_component_id: component.id, component_list: [component] });
}

/** Submit a generation and poll until it finishes, then return the finished record. */
async function submitAndAwait(body: Record<string, unknown>, submitId: string, timeoutMs: number, signal?: AbortSignal): Promise<HistoryRecord> {
  // A lost tab leaves the submit's outcome unknown: Dreamina may already run
  // (and bill) the job. Sending it again could pay twice, so the job is looked
  // up by its submit id instead, and only a job that never appears fails.
  let unconfirmed: Error | null = null;
  try {
    await callApi(GENERATE_PATH, body);
  } catch (error) {
    if (!tabLost(error)) throw error;
    unconfirmed = error as Error;
    log.warn("Dreamina tab lost during submit, looking the job up by id", { submitId, error: unconfirmed.message });
  }
  const started = Date.now();
  const deadline = started + timeoutMs;
  log.info("Dreamina generation submitted", { submitId, timeoutMs, confirmed: !unconfirmed });
  let pollFailures = 0;
  let lastStatus: number | undefined;
  for (;;) {
    await sleep(POLL_INTERVAL_MS, signal);
    let history: Record<string, HistoryRecord>;
    try {
      history = await callApi<Record<string, HistoryRecord>>("/mweb/v1/get_history_by_ids", { submit_ids: [submitId] });
    } catch (error) {
      // Reading the history is idempotent, and Dreamina answers it with a
      // transient error while a fresh task registers. The submit is never retried.
      log.warn("Dreamina poll failed", { submitId, pollFailures: pollFailures + 1, error: error instanceof Error ? error.message : String(error) });
      if (++pollFailures > MAX_POLL_FAILURES) throw error;
      continue;
    }
    pollFailures = 0;
    const record = history[submitId];
    if (record) {
      unconfirmed = null;
    } else if (unconfirmed && Date.now() - started > UNCONFIRMED_SUBMIT_GRACE_MS) {
      throw new Error(`Dreamina generation ${submitId} did not reach Dreamina before the tab was lost (${unconfirmed.message}). Keep the Dreamina tab open and try again`);
    }
    const status = record?.task?.status;
    if (status !== lastStatus) {
      log.info("Dreamina task status", { submitId, status, hasRecord: record !== undefined, elapsedMs: Date.now() - started });
      lastStatus = status;
    }
    if (status === TASK_DONE) return record;
    if (status === TASK_FAILED) {
      throw new Error(`Dreamina generation failed: ${record?.fail_msg || "unknown reason"} (fail_code ${record?.fail_code ?? "unknown"})`);
    }
    if (Date.now() > deadline) {
      log.warn("Dreamina generation timed out", { submitId, lastStatus, record: JSON.stringify(record ?? null).slice(0, 2000) });
      throw new Error(`Dreamina generation ${submitId} timed out after ${timeoutMs / 1000}s (last task status ${lastStatus ?? "none"})`);
    }
  }
}

async function download(url: string, signal?: AbortSignal): Promise<Uint8Array> {
  const response = await fetchExternalMedia(url, signal ? { signal } : undefined);
  if (!response.ok) throw new Error(`Dreamina download failed: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

function videoEnum(model: DreaminaVideoModelConfig, key: string): { values: Array<string | number>; defaultIndex: number } {
  const option = model.options?.find((o) => o.key === key)?.enum_val;
  const values = (option?.string_value ?? option?.int_value ?? []) as Array<string | number>;
  return { values, defaultIndex: option?.default_val_idx ?? 0 };
}

/** Seedance 2.x models list reference input as `unified_edit`, as an option or an input type. */
function takesReferences(model: DreaminaVideoModelConfig): boolean {
  return Boolean(model.options?.some((o) => o.key === "unified_edit")) || videoEnum(model, "input_media_type").values.includes("unified_edit");
}

/** Images and prompt for one omni-reference render. */
interface OmniInputs {
  prompt: string;
  references: Uint8Array[];
}

/**
 * Turn a start frame, an end frame and named references into omni-reference
 * input: every image becomes a reference, and the prompt opens with one
 * mention per image (`[Image 2] is Mara.`), which the draft turns into inline
 * image mentions. The caller's own references keep their numbers, so markers
 * already in the prompt still point at them. Named references past the
 * model's limit drop.
 */
function omniInputs(prompt: string, inputs: { references: readonly Uint8Array[]; first?: Uint8Array; last?: Uint8Array; named?: readonly NamedReferenceImage[] }): OmniInputs {
  const references = [...inputs.references];
  const mentions: string[] = [];
  const mention = (image: Uint8Array, says: (marker: string) => string): void => {
    references.push(image);
    mentions.push(says(`[Image ${references.length}]`));
  };
  if (inputs.first) mention(inputs.first, (m) => `${m} is the first frame.`);
  if (inputs.last) mention(inputs.last, (m) => `${m} is the last frame.`);
  for (const named of inputs.named ?? []) {
    if (references.length >= MAX_REFERENCE_IMAGES) {
      log.warn("Dreamina reference limit reached, dropping a named reference", { name: named.name, limit: MAX_REFERENCE_IMAGES });
      continue;
    }
    mention(named.image, (m) => (named.name ? `${m} is ${named.name}.` : `${m} is a reference.`));
  }
  return { prompt: [mentions.join(" "), prompt].filter((part) => part.trim().length > 0).join("\n\n"), references };
}

function videoInputTypes(model: DreaminaVideoModelConfig): string[] {
  return videoEnum(model, "input_media_type").values.map(String);
}

/** Models that list `first_frame` among their input types take a start image. */
function takesFirstFrame(model: DreaminaVideoModelConfig): boolean {
  return videoInputTypes(model).includes("first_frame");
}

function videoDurations(model: DreaminaVideoModelConfig): number[] {
  return videoEnum(model, "frames").values.map((frames) => Number(frames) / VIDEO_FPS);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("Dreamina generation aborted"));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("Dreamina generation aborted")); }, { once: true });
  });
}

/**
 * Dreamina (CapCut) image generation through the user's own logged-in Chrome.
 * Calls the same web API the site uses, from inside the attached Dreamina tab,
 * so the account's cookies and credits apply. Local installs only.
 */
export class DreaminaProvider extends BaseProvider {
  private configCache: { at: number; models: DreaminaModelConfig[] } | null = null;
  private videoConfigCache: { at: number; models: DreaminaVideoModelConfig[] } | null = null;
  private readonly music: DreaminaMusic = createDreaminaMusic({ callApi, submitAndAwait, download, appId: Number(APP_ID), daVersion: DA_VERSION });

  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return ["text_to_image", "image_to_image", "text_to_video", "image_to_video", "reference_to_video", "text_to_music"];
  }

  static override requiredSecrets(): string[] { return []; }
  constructor(_secrets: Record<string, unknown> = {}) { super(PROVIDER_IDS.DREAMINA); }

  async generateMessage(_args: Parameters<BaseProvider["generateMessage"]>[0]): Promise<Message> { throw new Error("dreamina does not support chat generation"); }
  // eslint-disable-next-line require-yield
  async *generateMessages(_args: Parameters<BaseProvider["generateMessages"]>[0]): AsyncGenerator<ProviderStreamItem> { throw new Error("dreamina does not support chat generation"); }

  private async imageConfigs(): Promise<DreaminaModelConfig[]> {
    if (this.configCache && Date.now() - this.configCache.at < CONFIG_TTL_MS) return this.configCache.models;
    const data = await callApi<{ model_list?: DreaminaModelConfig[] }>("/mweb/v1/get_common_config", {});
    const models = (data.model_list ?? []).filter((m) => m.feats?.includes("t2i"));
    this.configCache = { at: Date.now(), models };
    return models;
  }

  /** Served from the captured catalog, so listing never waits on the browser tab. */
  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return [...DREAMINA_IMAGE_MODELS];
  }

  private async imageConfig(modelId: string): Promise<DreaminaModelConfig> {
    const config = (await this.imageConfigs()).find((m) => m.model_req_key === modelId);
    if (!config) throw new Error(`Unknown Dreamina image model: ${modelId}`);
    return config;
  }

  /** Pick the resolution, ratio and pixel size a model offers for a request. */
  private imageSize(config: DreaminaModelConfig, requestedResolution: string | null | undefined, ratio: string): { resolution: string; ratioType: number; size: RatioSize } {
    const resolutions = Object.keys(config.resolution_map ?? {});
    const requested = requestedResolution?.toLowerCase();
    const resolution = requested && resolutions.includes(requested)
      ? requested
      : config.default_resolution_type || (resolutions.includes("2k") ? "2k" : resolutions[0]);
    if (!resolution) throw new Error(`Dreamina model ${config.model_name} lists no resolutions`);
    const ratioType = RATIO_TYPES[ratio];
    const size = config.resolution_map?.[resolution]?.image_ratio_sizes?.find((s) => s.ratio_type === ratioType);
    if (!size) throw new Error(`Dreamina model ${config.model_name} does not offer ${ratio} at ${resolution}`);
    return { resolution, ratioType, size };
  }

  private async submitImage(config: DreaminaModelConfig, draft: (submitId: string) => string, signal?: AbortSignal | null): Promise<Uint8Array> {
    const submitId = randomUUID();
    const record = await submitAndAwait({
      extend: { root_model: config.model_req_key },
      submit_id: submitId,
      metrics_extra: JSON.stringify({ promptSource: "custom", generateCount: 1, enterFrom: "click", position: "page_bottom_box", isBoxSelect: false, isCutout: false, hasRejectedAudit: 0, generateId: submitId, isRegenerate: false }),
      draft_content: draft(submitId),
      http_common_info: { aid: Number(APP_ID) }
    }, submitId, DEFAULT_TIMEOUT_MS, signal ?? undefined);
    const url = record.item_list?.[0]?.image?.large_images?.[0]?.image_url;
    if (!url) throw new Error("Dreamina finished without an image (the prompt may have been rejected by review)");
    log.debug("Dreamina image generation completed", { model: config.model_req_key, submitId });
    return download(url, signal ?? undefined);
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    const config = await this.imageConfig(params.model.id);
    const { resolution, ratioType, size } = this.imageSize(config, params.resolution, aspectRatioFor(params));
    const seed = params.seed ?? Math.floor(Math.random() * 4_000_000_000);
    return this.submitImage(config, () => draftFor(config.model_req_key, params.prompt, params.negativePrompt ?? "", seed, ratioType, size, resolution), params.signal);
  }

  /**
   * Image-to-image through the site's "blend" mode: the source images guide a
   * new image that follows the prompt. `strength` is Dreamina's reference
   * strength (0 to 1, default 0.5). Without a ratio the output follows the
   * first source image. Only models that list `byte_edit` take sources.
   */
  override async imageToImage(images: Uint8Array[], params: ImageToImageParams): Promise<Uint8Array> {
    if (images.length === 0) throw new Error("imageToImage needs at least one source image");
    if (images.length > MAX_REFERENCE_IMAGES) throw new Error(`Dreamina takes at most ${MAX_REFERENCE_IMAGES} source images, not ${images.length}`);
    const config = await this.imageConfig(params.model.id);
    if (!config.feats?.includes("byte_edit")) throw new Error(`Dreamina model ${config.model_name} does not take source images`);
    const sources: UploadedImage[] = [];
    for (const image of images) sources.push(await uploadImage(image));
    await auditReferences(config.model_req_key, sources);
    const ratio = aspectRatioFor({ aspectRatio: params.aspectRatio, width: params.targetWidth, height: params.targetHeight }, nearestRatio(sources[0].width, sources[0].height));
    const { resolution, ratioType, size } = this.imageSize(config, params.resolution, ratio);
    const seed = params.seed ?? Math.floor(Math.random() * 4_000_000_000);
    const strength = Math.min(1, Math.max(0, params.strength ?? 0.5));
    return this.submitImage(config, () => blendDraftFor(config.model_req_key, params.prompt, params.negativePrompt ?? "", seed, strength, ratioType, size, resolution, sources), params.signal);
  }

  private async videoConfigs(): Promise<DreaminaVideoModelConfig[]> {
    if (this.videoConfigCache && Date.now() - this.videoConfigCache.at < CONFIG_TTL_MS) return this.videoConfigCache.models;
    const data = await callApi<{ model_list?: DreaminaVideoModelConfig[] }>("/mweb/v1/video_generate/get_common_config", {});
    const models = data.model_list ?? [];
    this.videoConfigCache = { at: Date.now(), models };
    return models;
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return [...DREAMINA_VIDEO_MODELS];
  }

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    return this.generateVideo(params, { references: [], named: params.references ?? [] });
  }

  /**
   * Image-to-video. Models that take references (Seedance 2.x) always render
   * in "omni reference" mode: the image, `endImage` and `references` all go in
   * as references, and the prompt names each one, starting with
   * `[Image 1] is the first frame.` Older models use "first and last frames"
   * mode, where `endImage` needs `end_frame` and references are ignored.
   */
  override async imageToVideo(image: Uint8Array, params: ImageToVideoParams): Promise<Uint8Array> {
    return this.generateVideo({ ...params, prompt: params.prompt ?? "" }, { references: [], first: image, last: params.endImage ?? undefined, named: params.references ?? [] });
  }

  /**
   * Reference-to-video through Dreamina's "omni reference" mode: the images
   * condition the clip, and `[Image N]`, `[Video N]` and `[Audio N]` markers in
   * the prompt place them in the text. Without markers the images and videos lead and the
   * prompt follows. A reference video supplies motion or camera work and a
   * reference audio supplies the sound. Audio needs at least one image or video
   * beside it. Only the Seedance 2.x models take references.
   */
  override async referenceToVideo(inputs: ReferenceToVideoInputs, params: ReferenceToVideoParams): Promise<Uint8Array> {
    const audios = inputs.audios ?? [];
    if (inputs.images.length + inputs.videos.length === 0) throw new Error(audios.length > 0 ? "A reference audio needs at least one reference image or video beside it" : "referenceToVideo needs at least one reference image or video");
    if (audios.length > MAX_REFERENCE_AUDIOS) throw new Error(`Dreamina takes at most ${MAX_REFERENCE_AUDIOS} reference audios, not ${audios.length}`);
    if (inputs.images.length > MAX_REFERENCE_IMAGES) throw new Error(`Dreamina takes at most ${MAX_REFERENCE_IMAGES} reference images, not ${inputs.images.length}`);
    if (inputs.videos.length > MAX_REFERENCE_VIDEOS) throw new Error(`Dreamina takes at most ${MAX_REFERENCE_VIDEOS} reference videos, not ${inputs.videos.length}`);
    return this.generateVideo(params, { references: inputs.images, videos: inputs.videos, audios, named: params.references ?? undefined });
  }

  override async getAvailableMusicModels(): Promise<MusicModel[]> {
    return this.music.models();
  }

  /** Instrumental tracks need no model key. Vocal models appear only where the account lists them. */
  override async textToMusic(params: TextToMusicParams): Promise<EncodedAudioResult> {
    return this.music.generate(params);
  }

  private async generateVideo(params: TextToVideoParams, requested: { references: readonly Uint8Array[]; videos?: readonly Uint8Array[]; audios?: readonly Uint8Array[]; first?: Uint8Array; last?: Uint8Array; named?: readonly NamedReferenceImage[] }): Promise<Uint8Array> {
    const config = (await this.videoConfigs()).find((m) => m.model_req_key === params.model.id);
    if (!config) throw new Error(`Unknown Dreamina video model: ${params.model.id}`);
    // Models that take references always render in omni-reference mode, so a
    // start frame sits beside the entity images instead of excluding them.
    const omni = takesReferences(config) && Boolean(requested.first || requested.named?.length)
      ? omniInputs(params.prompt, requested)
      : null;
    if (!omni && requested.named?.length) {
      log.debug("Dreamina model takes no references, ignoring them", { model: config.model_req_key, count: requested.named.length });
    }
    const inputs = omni ? { ...requested, references: omni.references, first: undefined, last: undefined } : requested;
    const prompt = omni?.prompt ?? params.prompt;

    const resolutions = videoEnum(config, "resolution");
    const resolution = params.resolution
      ? resolutions.values.map(String).find((r) => r.toLowerCase() === params.resolution!.toLowerCase())
      : String(resolutions.values[resolutions.defaultIndex] ?? resolutions.values[0] ?? "");
    if (!resolution) throw new Error(`Dreamina model ${config.model_name} does not offer ${params.resolution}. Use one of ${resolutions.values.join(", ")}`);

    const ratios = videoEnum(config, "video_aspect_ratio");
    const ratio = params.aspectRatio ?? String(ratios.values[ratios.defaultIndex] ?? "16:9");
    if (!ratios.values.includes(ratio)) throw new Error(`Dreamina model ${config.model_name} does not offer ${ratio}. Use one of ${ratios.values.join(", ")}`);

    const frames = videoEnum(config, "frames");
    const durations = videoDurations(config);
    const seconds = params.durationSeconds ?? Number(frames.values[frames.defaultIndex]) / VIDEO_FPS;
    if (!durations.includes(seconds)) throw new Error(`Dreamina model ${config.model_name} offers ${durations.join(", ")} second clips, not ${seconds}`);

    const videoInputs = inputs.videos ?? [];
    const audioInputs = inputs.audios ?? [];
    if (inputs.references.length + videoInputs.length + audioInputs.length > 0 && !takesReferences(config)) {
      throw new Error(`Dreamina model ${config.model_name} does not take reference ${inputs.references.length > 0 ? "images" : videoInputs.length > 0 ? "videos" : "audio"}. Use a Seedance 2.x model`);
    }
    if (inputs.first && !takesFirstFrame(config)) throw new Error(`Dreamina model ${config.model_name} does not take a first frame image`);
    if (inputs.last && !videoInputTypes(config).includes("end_frame")) throw new Error(`Dreamina model ${config.model_name} does not take a last frame image`);
    const references: UploadedImage[] = [];
    for (const image of inputs.references) references.push(await uploadImage(image));
    const videos: UploadedVideo[] = [];
    for (const video of videoInputs) videos.push(await uploadVideo(video));
    const audios: UploadedVideo[] = [];
    for (const audio of audioInputs) audios.push(await uploadVideo(audio));
    let bounds: FrameImages | undefined;
    if (inputs.first) {
      bounds = { first: await uploadImage(inputs.first) };
      if (inputs.last) bounds.last = await uploadImage(inputs.last);
    }
    const audited = [...references, ...(bounds ? [bounds.first, ...(bounds.last ? [bounds.last] : [])] : [])];
    if (audited.length + videos.length + audios.length > 0) await auditReferences(config.model_req_key, audited, videos, audios);

    const submitId = randomUUID();
    const seed = params.seed ?? Math.floor(Math.random() * 4_000_000_000);
    const record = await submitAndAwait({
      extend: { root_model: config.model_req_key },
      submit_id: submitId,
      metrics_extra: JSON.stringify({ isDefaultSeed: 1, originSubmitId: submitId, isRegenerate: false }),
      draft_content: videoDraftFor(config.model_req_key, prompt, seed, ratio, resolution, seconds * 1000, submitId, references, bounds, videos, audios),
      http_common_info: { aid: Number(APP_ID) }
    }, submitId, (params.timeoutSeconds ?? VIDEO_TIMEOUT_MS / 1000) * 1000, params.signal);
    const url = record.item_list?.[0]?.video?.transcoded_video?.origin?.video_url;
    if (!url) throw new Error("Dreamina finished without a video");
    log.debug("Dreamina video generation completed", { model: config.model_req_key, submitId });
    return download(url, params.signal);
  }
}
