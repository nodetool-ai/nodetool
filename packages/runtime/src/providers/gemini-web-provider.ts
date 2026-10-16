/**
 * Gemini through the user's own logged-in gemini.google.com tab, driven by
 * the NodeTool Chrome extension: chat, image generation and video generation.
 * No API key: requests run on the user's Google account and its Gemini plan.
 *
 * A turn is submitted through the page's own composer, so the site computes
 * its anti-abuse tokens itself. The page streams the turn over a WebChannel
 * of base64 protobuf frames, which this module does not parse. The composer's
 * stop button shows while the turn runs. When it goes away, the provider reads
 * the stored turn with the read call the page itself uses (`hNvQHb`). The tab
 * renders no reply text while it is hidden, so the read is the only reliable
 * place to get the result.
 *
 * The tab stays in the background. Chrome can freeze a background tab, and
 * a frozen Gemini runs a send click only when the tab is shown, which starts
 * a second turn later. The extension tab unfreezes the page before each
 * script. A click that still starts no request is dropped with a reload, and
 * the turn is retried once. Chrome also throttles the timers of a page hidden
 * for a while to one wake-up a minute, so no page script waits on a timer: each
 * one does a single step, and every wait polls from here ({@link pollTab}).
 *
 * A video finishes minutes after its turn ends. The provider polls the chat
 * with the same read until the video appears.
 *
 * Generated media need the user's Google cookies and send no CORS headers for
 * the page, so the browser itself downloads them ({@link ExtensionTab.download}).
 *
 * Image and video turns start a new Gemini chat. A chat records its Gemini
 * chat as the provider session and the next turn continues it, sending only
 * the new messages. Every turn shows in the user's history. No selector
 * depends on interface text, so a localized Gemini works. One tab serves
 * every call, so calls run one at a time.
 */
import { createLogger } from "@nodetool-ai/config";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import { fetchExternalMedia } from "../external-media-fetch.js";
import { BaseProvider, type ProviderCapability } from "./base-provider.js";
import { composeDelta, composePrompt, hashSystemPrompt, replyMessage, replyStreamItems } from "./chatgpt-provider.js";
import { createExtensionTab, pollTab, stageBytesInTab, type ExtensionTab } from "./extension-tab.js";
import { detectImageMime } from "./image-mime.js";
import type {
  ImageModel,
  ImageToImageParams,
  ImageToVideoParams,
  LanguageModel,
  Message,
  MessageImageContent,
  ProviderSession,
  ProviderStreamItem,
  ProviderTool,
  TextToImageParams,
  TextToVideoParams,
  VideoModel
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.gemini-web");

const HOST = "gemini.google.com";
const BASE_URL = `https://${HOST}`;
/** The model id that keeps the mode the user picked last in Gemini. */
export const GEMINI_WEB_AUTO_MODEL = "auto";
/** The image model: Gemini's own image tool, run by the current mode. `gemini-web-image:<mode id>` picks a mode. */
export const GEMINI_WEB_IMAGE_MODEL = "gemini-web-image";
/** The video model: Gemini's video tool (Veo). */
export const GEMINI_WEB_VIDEO_MODEL = "gemini-web-video";
const COMPOSER = "rich-textarea .ql-editor";
const SUBMIT = "gem-icon-button.send-button button";
/** The send button turns into a stop button while a turn runs. */
const STOP = "gem-icon-button.send-button.stop";
const ATTACHMENT = "uploader-file-preview";
const INPUT_AREA = "input-area-v2";
const TOOLS_BUTTON = "gem-icon-button.menu-button button";
const MODE_BUTTON = "[data-test-id=bard-mode-menu-button]";
const OVERLAY = ".cdk-overlay-container";
/** Tools and aspect options are found by their icon, which no locale changes. */
const VIDEO_TOOL_ICON = "movie";
/** The full-size original. Without a size suffix the URL serves a 512 px preview. */
const FULL_SIZE_SUFFIX = "=s0-d-I";
const POLL_INTERVAL_MS = 1_500;
const VIDEO_POLL_INTERVAL_MS = 5_000;
const READY_TIMEOUT_MS = 20_000;
const APP_SETTLE_TIMEOUT_MS = 10_000;
/** The send script waits in the page for uploads to finish before it clicks. */
/** How long the send button may stay disabled while attachments upload. */
const SEND_READY_TIMEOUT_MS = 75_000;
/** How long after the send click the page has to start its request. */
const SEND_START_TIMEOUT_MS = 10_000;
/** How long the chat read may lag behind the end of a turn. */
const TURN_STORED_TIMEOUT_MS = 30_000;
/** How long a background tab may take to render a composer menu button. */
const MENU_TIMEOUT_MS = 10_000;
/** How long an opened menu may take to show its items. */
const MENU_ITEM_TIMEOUT_MS = 3_000;
/** The first open of the mode picker after a page load can take a few seconds. */
const MODE_LIST_TIMEOUT_MS = 6_000;
/** A paste before the uploader is ready shows no preview. Paste again after this wait. */
const PASTE_TIMEOUT_MS = 3_000;
const PASTE_ATTEMPTS = 5;
const CHAT_TIMEOUT_MS = 10 * 60_000;
const IMAGE_TIMEOUT_MS = 10 * 60_000;
const VIDEO_TIMEOUT_MS = 15 * 60_000;
const DOWNLOAD_TIMEOUT_MS = 180_000;
const MAX_POLL_FAILURES = 5;
const MODELS_TTL_MS = 10 * 60_000;

let tab: ExtensionTab | null = null;

/** Replace the tab. Tests use this to avoid a real browser. */
export function setGeminiWebTab(next: ExtensionTab | null): void {
  tab = next;
  liveModes = null;
}

function currentTab(): ExtensionTab {
  return (tab ??= createExtensionTab(HOST));
}

/** Calls share one tab, so each waits for the previous one. */
let activeSignal: AbortSignal | undefined;
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(run: () => Promise<T>): Promise<T> {
  const owned = async (): Promise<T> => {
    try { return await run(); }
    finally { activeSignal = undefined; await tab?.release?.(); }
  };
  const next = queue.then(owned, owned);
  queue = next.catch(() => undefined);
  return next;
}

interface GeminiMode {
  /** The stable `data-mode-id` of the mode picker item. */
  id: string;
  name: string;
}

/**
 * The modes of the Gemini mode picker, listed before any call has read the
 * live picker. An account can offer more, or fewer. Picking a mode the
 * account lacks fails with the list of the modes it has.
 */
const KNOWN_MODES: readonly GeminiMode[] = [
  { id: "8c46e95b1a07cecc", name: "3.5 Flash-Lite" },
  { id: "56fdd199312815e2", name: "3.8 Flash" },
  { id: "e6fa609c3fa255c0", name: "3.1 Pro" },
  { id: "95a4c0abcba24364", name: "4 Argon" }
];

/** Modes read from the page during an earlier call, so listing never attaches. */
let liveModes: { at: number; modes: GeminiMode[] } | null = null;

/** The live modes when a call has read them, else {@link KNOWN_MODES}. */
function listedModes(): readonly GeminiMode[] {
  return liveModes?.modes ?? KNOWN_MODES;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error("Aborted"));
    const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); reject(signal?.reason ?? new Error("Aborted")); };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function evaluate<T>(expression: string, timeoutMs?: number): Promise<T> {
  activeSignal?.throwIfAborted();
  return (await currentTab().evaluate(expression, timeoutMs, activeSignal)) as T;
}

/** {@link pollTab} on the Gemini tab. */
function poll<T>(expression: string, timeoutMs: number): Promise<T | null> {
  return pollTab<T>(currentTab(), expression, timeoutMs, activeSignal);
}

/** The page path of a chat drops the `c_` prefix of its id. */
function chatPath(conversationId: string): string {
  return `/app/${conversationId.replace(/^c_/, "")}`;
}

/** A link to the chat for error messages. */
function chatLink(conversationId: string | null): string {
  return conversationId ? ` The chat is ${BASE_URL}${chatPath(conversationId)}` : "";
}

/** Wait for the composer, then check that a Google account is signed in. */
async function waitForComposer(): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let ready = false;
  while (!ready && Date.now() < deadline) {
    ready = await evaluate<boolean>(`/*nt:ready*/ !!document.querySelector(${JSON.stringify(COMPOSER)})`);
    if (!ready) await sleep(250, activeSignal);
  }
  // `oPEP7c` holds the signed-in account. A signed-out page has a composer but no account.
  const signedIn = await evaluate<boolean>(`/*nt:session*/ !!(window.WIZ_global_data && WIZ_global_data.oPEP7c)`);
  if (!signedIn) throw new Error("Gemini is not signed in. Open https://gemini.google.com in Chrome, sign in, and try again");
  if (!ready) throw new Error("The Gemini composer did not appear. The gemini.google.com page layout may have changed");
  // A background tab renders the rest of the composer seconds later, and a
  // click before that starts no request. The mode picker is the last part.
  const settled = Date.now() + APP_SETTLE_TIMEOUT_MS;
  while (Date.now() < settled && !(await evaluate<boolean>(`/*nt:settled*/ !!document.querySelector(${JSON.stringify(MODE_BUTTON)})`))) {
    await sleep(250, activeSignal);
  }
}

/** Wait until the open chat shows its earlier turns. */
async function waitForHistory(): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await evaluate<boolean>(`/*nt:history*/ document.querySelectorAll("user-query").length > 0`)) return;
    await sleep(250, activeSignal);
  }
  throw new ChatUnavailableError("The Gemini chat did not load its earlier turns");
}

/** Open a new chat with no tool selected. */
async function openNewChat(): Promise<void> {
  await currentTab().navigate(`${BASE_URL}/app`, activeSignal);
  await waitForComposer();
  // A selected tool shows as a chip with a close icon.
  await evaluate(`/*nt:clear-tools*/ (async () => {
    const chips = [...document.querySelectorAll(${JSON.stringify(`${INPUT_AREA} button`)})]
      .filter((b) => b.querySelector('mat-icon[fonticon="close"]') && !b.closest(${JSON.stringify(ATTACHMENT)}));
    for (const chip of chips) chip.click();
    return chips.length;
  })()`);
}

/** Turn on the tool whose menu item shows `icon`. */
async function enableTool(icon: string): Promise<void> {
  const tools = await poll<boolean>(`/*nt:tool-menu*/ !!document.querySelector(${JSON.stringify(TOOLS_BUTTON)})`, MENU_TIMEOUT_MS);
  if (!tools) throw new Error("The Gemini composer has no tools menu");
  await evaluate(`/*nt:tool-open*/ (() => { document.querySelector(${JSON.stringify(TOOLS_BUTTON)}).click(); return true; })()`);
  const item = await poll<"on" | "off">(`/*nt:tool-item*/ (() => {
    const item = [...document.querySelectorAll(${JSON.stringify(`${OVERLAY} [role=menuitemcheckbox]`)})].find((b) => b.querySelector(${JSON.stringify(`mat-icon[fonticon="${icon}"]`)}));
    return item ? (item.getAttribute("aria-checked") === "true" ? "on" : "off") : null;
  })()`, MENU_ITEM_TIMEOUT_MS);
  if (!item) throw new Error(`The Gemini tools menu has no ${icon} tool. The account may not offer it`);
  if (item === "off") {
    await evaluate(`/*nt:tool-pick*/ (() => {
      const item = [...document.querySelectorAll(${JSON.stringify(`${OVERLAY} [role=menuitemcheckbox]`)})].find((b) => b.querySelector(${JSON.stringify(`mat-icon[fonticon="${icon}"]`)}));
      if (item) item.click();
      return true;
    })()`);
  }
  const chip = await poll<boolean>(`/*nt:tool-chip*/ [...document.querySelectorAll(${JSON.stringify(`${INPUT_AREA} button`)})].some((b) => b.querySelector(${JSON.stringify(`mat-icon[fonticon="${icon}"]`)}))`, MENU_ITEM_TIMEOUT_MS);
  if (!chip) throw new Error(`The Gemini ${icon} tool did not turn on`);
}

/** Pick a video aspect ratio in the composer's aspect menu. */
async function selectVideoAspect(aspectRatio: "16:9" | "9:16"): Promise<void> {
  const icon = aspectRatio === "9:16" ? "crop_9_16" : "crop_16_9";
  const state = await evaluate<"selected" | "opened">(`/*nt:aspect*/ (() => {
    const button = [...document.querySelectorAll(${JSON.stringify(`${INPUT_AREA} button`)})].find((b) => b.querySelector('mat-icon[fonticon^="crop_"]'));
    if (!button) throw new Error("The Gemini video composer has no aspect ratio menu");
    if (button.querySelector(${JSON.stringify(`mat-icon[fonticon="${icon}"]`)})) return "selected";
    button.click();
    return "opened";
  })()`);
  if (state === "selected") return;
  const picked = await poll<boolean>(`/*nt:aspect-pick*/ (() => {
    const option = [...document.querySelectorAll(${JSON.stringify(`${OVERLAY} [role=menuitemradio]`)})].find((b) => b.querySelector(${JSON.stringify(`mat-icon[fonticon="${icon}"]`)}));
    if (!option) return false;
    option.click();
    return true;
  })()`, MENU_ITEM_TIMEOUT_MS);
  if (!picked) throw new Error(`The Gemini aspect ratio menu has no ${aspectRatio} option`);
}

/**
 * Open the mode picker, record its modes, and pick `modeId` unless it is
 * {@link GEMINI_WEB_AUTO_MODEL}. Modes carry a stable `data-mode-id`.
 */
async function selectMode(modeId: string): Promise<void> {
  // A background tab renders the mode picker seconds after the composer.
  const toggle = await poll<boolean>(`/*nt:mode-menu*/ !!document.querySelector(${JSON.stringify(MODE_BUTTON)})`, MENU_TIMEOUT_MS);
  let modes: Array<{ id: string; name: string }> = [];
  if (toggle) {
    await evaluate(`/*nt:mode-open*/ (() => {
      const toggle = document.querySelector(${JSON.stringify(MODE_BUTTON)});
      if (toggle.getAttribute("aria-expanded") !== "true") toggle.click();
      return true;
    })()`);
    // The first open after a page load can take a few seconds.
    modes = (await poll<Array<{ id: string; name: string }>>(`/*nt:modes*/ (() => {
      const items = [...document.querySelectorAll("[data-mode-id]")];
      if (items.length === 0) return null;
      const modes = items.map((item) => ({ id: item.getAttribute("data-mode-id"), name: item.innerText.split("\\n")[0].trim() }));
      const wanted = ${JSON.stringify(modeId)};
      const pick = items.find((item) => item.getAttribute("data-mode-id") === wanted);
      const toggle = document.querySelector(${JSON.stringify(MODE_BUTTON)});
      if (pick) pick.click();
      else if (toggle && toggle.getAttribute("aria-expanded") === "true") toggle.click();
      return modes;
    })()`, MODE_LIST_TIMEOUT_MS)) ?? [];
    await sleep(300);
  }
  if (modes.length > 0) {
    liveModes = { at: Date.now(), modes: modes.filter((m) => m.id).map((m) => ({ id: m.id, name: m.name || m.id })) };
  }
  if (modeId !== GEMINI_WEB_AUTO_MODEL && !modes.some((m) => m.id === modeId)) {
    throw new Error(`Gemini has no mode ${modeId}. Its modes are: ${modes.map((m) => `${m.id} (${m.name})`).join(", ") || "none found"}`);
  }
}

/**
 * Paste images into the composer, the way a clipboard paste would. The page
 * drops a paste that arrives before its uploader is ready, and the mode
 * button can appear before that. So paste again until the previews show.
 */
async function attachImages(images: Uint8Array[]): Promise<void> {
  if (images.length === 0) return;
  const files: Array<{ id: string; name: string; type: string }> = [];
  for (const [index, image] of images.entries()) {
    const type = detectImageMime(image);
    const id = await stageBytesInTab(currentTab(), image, activeSignal);
    files.push({ id, name: `image-${index + 1}.${type.split("/")[1] ?? "png"}`, type });
  }
  const paste = `/*nt:attach*/ (() => {
    const files = ${JSON.stringify(files)};
    const composer = document.querySelector(${JSON.stringify(COMPOSER)});
    const transfer = new DataTransfer();
    for (const f of files) {
      const binary = atob(window.__ntStage[f.id]);
      transfer.items.add(new File([Uint8Array.from(binary, (c) => c.charCodeAt(0))], f.name, { type: f.type }));
    }
    composer.focus();
    composer.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
    return true;
  })()`;
  let attached = false;
  for (let attempt = 1; !attached && attempt <= PASTE_ATTEMPTS; attempt++) {
    await evaluate(paste);
    attached = !!(await poll<boolean>(`/*nt:attached*/ document.querySelectorAll(${JSON.stringify(ATTACHMENT)}).length >= ${files.length}`, PASTE_TIMEOUT_MS));
  }
  await evaluate(`/*nt:unstage*/ (() => { for (const id of ${JSON.stringify(files.map((f) => f.id))}) delete window.__ntStage[id]; return true; })()`);
  if (!attached) throw new Error("Gemini did not take the pasted images: no attachment preview appeared");
}

/** The send click started no request. The caller reloads the page and sends again. */
class NotSentError extends Error {}

/**
 * Type the text and click send once. The click waits for the attachment
 * previews and an enabled button. Then the page must show the new turn: a
 * new user query or the stop button.
 */
async function submit(text: string, attachments: number): Promise<void> {
  await evaluate(`/*nt:send*/ (() => {
    window.__ntGemini = { queries: document.querySelectorAll("user-query").length };
    const composer = document.querySelector(${JSON.stringify(COMPOSER)});
    composer.focus();
    document.execCommand("insertText", false, ${JSON.stringify(text)});
    return true;
  })()`);
  // The send button slides in after the first character. A click during
  // that animation starts no request.
  await sleep(500, activeSignal);
  const ready = await poll<boolean>(`/*nt:send-ready*/ (() => {
    const button = document.querySelector(${JSON.stringify(SUBMIT)});
    const previews = document.querySelectorAll(${JSON.stringify(ATTACHMENT)});
    const uploading = [...previews].some((p) => p.querySelector("mat-progress-spinner, [role=progressbar]"));
    return !!button && !button.disabled && button.getAttribute("aria-disabled") !== "true" && previews.length >= ${attachments} && !uploading;
  })()`, SEND_READY_TIMEOUT_MS);
  if (!ready) throw new Error("Gemini did not accept the message: the send button stayed disabled or the upload did not finish");
  await evaluate(`/*nt:click*/ (() => { document.querySelector(${JSON.stringify(SUBMIT)}).click(); return true; })()`);
  const started = await poll<boolean>(`/*nt:sent*/ !!window.__ntGemini && (document.querySelectorAll("user-query").length > window.__ntGemini.queries || !!document.querySelector(${JSON.stringify(STOP)}))`, SEND_START_TIMEOUT_MS);
  if (!started) throw new NotSentError("Gemini did not start a request after the send click");
}

/** The chat id in the page path, or null on a new chat that has none yet. */
async function currentChatId(): Promise<string | null> {
  const pathname = await evaluate<string>(`/*nt:location*/ location.pathname`);
  const id = /^\/app\/([0-9a-f]+)$/.exec(pathname)?.[1];
  return id ? `c_${id}` : null;
}

/**
 * Wait until the turn after `priorTurnId` ends, then read it from the chat.
 * The stop button shows while the turn runs. The read finds the turn only
 * once Gemini has stored it, a moment after the button goes away.
 */
async function waitForReply(priorTurnId: string | null, timeoutMs: number, signal?: AbortSignal): Promise<GeminiWebReply> {
  const started = Date.now();
  let endedAt: number | null = null;
  let failures = 0;
  for (;;) {
    await sleep(POLL_INTERVAL_MS, signal);
    try {
      const running = await evaluate<boolean>(`/*nt:running*/ !!document.querySelector(${JSON.stringify(STOP)})`);
      const conversationId = running ? null : await currentChatId();
      if (conversationId) {
        const reply = parseChatTurn(await readChat(conversationId));
        if (reply.turnId && reply.turnId !== priorTurnId) return reply;
      }
      failures = 0;
      if (running) endedAt = null;
      else endedAt ??= Date.now();
    } catch (error) {
      log.warn("Gemini poll failed", { failures: failures + 1, error: error instanceof Error ? error.message : String(error) });
      if (++failures > MAX_POLL_FAILURES) throw error;
    }
    if (endedAt !== null && Date.now() - endedAt > TURN_STORED_TIMEOUT_MS) {
      const conversationId = await currentChatId().catch(() => null);
      throw new Error(`Gemini ended the turn, but its chat shows no reply.${chatLink(conversationId)}`);
    }
    if (Date.now() - started > timeoutMs) throw new Error(`Gemini did not finish within ${timeoutMs / 1000}s`);
  }
}

/**
 * Prepare the page with `setup`, paste the images, send the text, and read
 * the reply. When the click starts no request, `setup` runs again, which
 * reloads the page and drops the pending click, and the send is retried once.
 */
async function sendAndRead(setup: () => Promise<void>, text: string, images: Uint8Array[], timeoutMs: number, signal?: AbortSignal): Promise<GeminiWebReply> {
  activeSignal = signal;
  let priorTurnId: string | null;
  for (let attempt = 1; ; attempt++) {
    activeSignal?.throwIfAborted();
    await setup();
    activeSignal?.throwIfAborted();
    // A continued chat already has turns. The reply is the next one.
    const conversationId = await currentChatId();
    priorTurnId = conversationId ? parseChatTurn(await readChat(conversationId)).turnId : null;
    await attachImages(images);
    try {
      activeSignal?.throwIfAborted();
      await submit(text, images.length);
      break;
    } catch (error) {
      if (!(error instanceof NotSentError)) throw error;
      if (attempt > 1) throw new Error("Gemini did not send the message from the background tab. Show the Gemini tab once and try again");
      log.warn("Gemini did not send the message; reloading the page and retrying once");
    }
  }
  log.info("Gemini turn submitted", { images: images.length });
  return waitForReply(priorTurnId, timeoutMs, signal);
}

/** Read a chat the way the page does, with the `hNvQHb` call. Returns the raw response body. */
async function readChat(conversationId: string): Promise<string> {
  return evaluate<string>(`/*nt:read*/ (async () => {
    const w = window.WIZ_global_data;
    const params = new URLSearchParams({
      rpcids: "hNvQHb",
      "source-path": location.pathname,
      bl: w.cfb2h,
      "f.sid": w.FdrFJe,
      hl: document.documentElement.lang || "en",
      _reqid: String(100000 + Math.floor(Math.random() * 900000)),
      rt: "c"
    });
    const request = JSON.stringify([[["hNvQHb", JSON.stringify([${JSON.stringify(conversationId)}, 10, null, 1, [1], [4], null, 1]), null, "generic"]]]);
    const response = await fetch("/_/BardChatUi/data/batchexecute?" + params, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8", "x-same-domain": "1" },
      body: new URLSearchParams({ "f.req": request, at: w.SNlM0e }).toString()
    });
    if (!response.ok) throw new Error("Gemini chat read failed: HTTP " + response.status);
    return await response.text();
  })()`);
}

/** The newest turn of a chat, read from its `hNvQHb` response. */
export interface GeminiWebReply {
  /** The chat id (`c_…`), or null when the read found no turn. */
  conversationId: string | null;
  /** The turn's response id (`r_…`), or null when the read found no turn. */
  turnId: string | null;
  /** The reply text without the media placeholders. */
  text: string;
  /** Generated image URLs, preview size. */
  images: string[];
  /** Gemini started its video tool, so a video follows in the chat later. */
  videoPending: boolean;
}

/** Each `wrb.fr` entry's payload in a batchexecute body, one JSON frame per line. */
function payloads(body: string): unknown[][] {
  const found: unknown[][] = [];
  for (const line of body.split("\n")) {
    if (!line.startsWith("[")) continue;
    let frame: unknown;
    try {
      frame = JSON.parse(line);
    } catch {
      // A partial or non-JSON line carries nothing to read.
      continue;
    }
    if (!Array.isArray(frame)) continue;
    for (const entry of frame) {
      if (!Array.isArray(entry) || entry[0] !== "wrb.fr" || typeof entry[2] !== "string") continue;
      const payload = JSON.parse(entry[2]) as unknown;
      if (Array.isArray(payload)) found.push(payload);
    }
  }
  return found;
}

function contains(value: unknown, match: (text: string) => boolean): boolean {
  if (typeof value === "string") return match(value);
  if (Array.isArray(value)) return value.some((item) => contains(item, match));
  if (value && typeof value === "object") return Object.values(value).some((item) => contains(item, match));
  return false;
}

const VIDEO_PLACEHOLDER = /https?:\/\/googleusercontent\.com\/generated_video_content\//;

/** A candidate's reply text, without the placeholders Gemini puts where media go. */
function candidateText(candidate: unknown[]): string {
  const parts = Array.isArray(candidate[1]) ? candidate[1] : [];
  return parts
    .filter((part): part is string => typeof part === "string")
    .join("")
    .replace(/https?:\/\/googleusercontent\.com\/(image_generation_content|generated_video_content)\/\S+/g, "")
    .trim();
}

/**
 * The newest turn in an `hNvQHb` chat read and its first candidate. The
 * payload lists the turns at `[0]`, newest first. A turn holds its ids at
 * `[0]` and its candidates at `[3][0]`. A read of a chat that Gemini has not
 * stored yet carries an error entry and no payload.
 */
function newestTurn(body: string): { turn: unknown[]; candidate: unknown[] | null } | null {
  const payload = payloads(body)[0];
  const turn = Array.isArray(payload?.[0]) ? (payload[0] as unknown[])[0] : null;
  if (!Array.isArray(turn)) return null;
  const candidates = Array.isArray(turn[3]) ? turn[3][0] : null;
  const candidate = Array.isArray(candidates) && Array.isArray(candidates[0]) ? (candidates[0] as unknown[]) : null;
  return { turn, candidate };
}

/**
 * Parse the newest turn of an `hNvQHb` chat read. Generated images sit under
 * the candidate's `[12]` as `lh3.googleusercontent.com/gg/` URLs. A started
 * video shows as a video placeholder in the text or a `video_generation` entry.
 */
export function parseChatTurn(body: string): GeminiWebReply {
  const found = newestTurn(body);
  if (!found) return { conversationId: null, turnId: null, text: "", images: [], videoPending: false };
  const ids = Array.isArray(found.turn[0]) ? found.turn[0] : [];
  const conversationId = typeof ids[0] === "string" ? ids[0] : null;
  const turnId = typeof ids[1] === "string" ? ids[1] : null;
  const candidate = found.candidate;
  const videoPending =
    contains(found.turn, (text) => text === "video_generation") ||
    (candidate !== null && contains(candidate[1], (text) => VIDEO_PLACEHOLDER.test(text)));
  if (!candidate) return { conversationId, turnId, text: "", images: [], videoPending };
  const images = new Set<string>();
  const walk = (value: unknown): void => {
    if (typeof value === "string") {
      if (/^https:\/\/lh3\.googleusercontent\.com\/gg(-dl)?\//.test(value)) images.add(value);
    } else if (Array.isArray(value)) {
      value.forEach(walk);
    }
  };
  walk(candidate[12]);
  return { conversationId, turnId, text: candidateText(candidate), images: [...images], videoPending };
}

/**
 * Find the generated video in the newest turn of an `hNvQHb` chat read. A
 * finished video is an array that holds `"video/mp4"` and, at `[7]`, its
 * URLs: thumbnails on lh3 and the file itself on
 * `contribution.usercontent.google.com`.
 */
export function findGeneratedVideo(body: string): { url: string | null; text: string } {
  const found = newestTurn(body);
  if (!found) return { url: null, text: "" };
  const text = found.candidate ? candidateText(found.candidate) : "";
  let entry: unknown[] | null = null;
  const walk = (value: unknown): void => {
    if (entry || !Array.isArray(value)) return;
    if (value.includes("video/mp4")) entry = value;
    else value.forEach(walk);
  };
  walk(found.turn);
  const urls = entry && Array.isArray(entry[7]) ? (entry[7] as unknown[]).filter((u): u is string => typeof u === "string") : [];
  const url = urls.find((u) => u.startsWith("https://contribution.usercontent.google.com/download")) ?? null;
  return { url, text };
}

function aspectHint(aspectRatio?: string | null, width?: number | null, height?: number | null): string {
  if (aspectRatio) return `Aspect ratio: ${aspectRatio}.`;
  if (width && height) return `Size: about ${width}x${height} pixels.`;
  return "";
}

function imagesOf(content: Message["content"]): MessageImageContent[] {
  return Array.isArray(content) ? content.filter((part): part is MessageImageContent => part.type === "image_url") : [];
}

/** The chat to continue is gone, so the caller starts a new one. Thrown before anything is sent. */
class ChatUnavailableError extends Error {}

interface ChatTurn {
  model: string;
  text: string;
  images: Uint8Array[];
  /** Continue this chat (`c_…`) instead of starting a new one. */
  conversationId?: string;
  signal?: AbortSignal;
}

/** Run one chat turn, in a new chat or a continued one. The caller holds the tab. */
async function runChatTurnHoldingTab(turn: ChatTurn): Promise<{ conversationId: string; text: string }> {
  const setup = async (): Promise<void> => {
    if (turn.conversationId) {
      const path = chatPath(turn.conversationId);
      await currentTab().navigate(`${BASE_URL}${path}`, activeSignal);
      await waitForComposer();
      // A deleted or foreign chat redirects to a new one.
      const pathname = await evaluate<string>(`/*nt:location*/ location.pathname`);
      if (pathname !== path) throw new ChatUnavailableError(`Gemini chat ${turn.conversationId} is no longer available`);
      // The history loads after the composer. A send before it starts a new chat.
      await waitForHistory();
    } else {
      await openNewChat();
    }
    if (turn.model !== GEMINI_WEB_AUTO_MODEL || !liveModes || Date.now() - liveModes.at > MODELS_TTL_MS) {
      await selectMode(turn.model);
    }
  };
  const reply = await sendAndRead(setup, turn.text, turn.images, CHAT_TIMEOUT_MS, turn.signal);
  const conversationId = reply.conversationId ?? turn.conversationId;
  if (!conversationId) throw new Error("Gemini replied without a chat id");
  return { conversationId, text: reply.text };
}

export class GeminiWebProvider extends BaseProvider {
  static override requiredSecrets(): string[] {
    return [];
  }

  constructor(_secrets: Record<string, unknown> = {}) {
    super(PROVIDER_IDS.GEMINI_WEB);
  }

  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return ["text_to_image", "image_to_image", "text_to_video", "image_to_video"];
  }

  /**
   * Listing never attaches to the tab: it returns `auto` plus the modes read
   * during an earlier call, or the known public modes before any call. A mode
   * id from the Gemini mode picker also works as a model id.
   */
  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const auto: LanguageModel = { id: GEMINI_WEB_AUTO_MODEL, name: "Gemini (current mode)", provider: PROVIDER_IDS.GEMINI_WEB };
    return [auto, ...listedModes().map((m) => ({ id: m.id, name: `Gemini ${m.name}`, provider: PROVIDER_IDS.GEMINI_WEB }))];
  }

  /** One image model for the current mode, and one for each listed mode. */
  override async getAvailableImageModels(): Promise<ImageModel[]> {
    const image = (id: string, name: string): ImageModel => ({
      id,
      name,
      provider: PROVIDER_IDS.GEMINI_WEB,
      supportedTasks: ["text_to_image", "image_to_image"],
      aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"]
    });
    return [
      image(GEMINI_WEB_IMAGE_MODEL, "Gemini Images (web)"),
      ...listedModes().map((m) => image(`${GEMINI_WEB_IMAGE_MODEL}:${m.id}`, `Gemini Images (${m.name})`))
    ];
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return [{
      id: GEMINI_WEB_VIDEO_MODEL,
      name: "Gemini Video (web)",
      provider: PROVIDER_IDS.GEMINI_WEB,
      supportedTasks: ["text_to_video", "image_to_video"],
      aspectRatios: ["16:9", "9:16"]
    }];
  }

  /** Chats by conversation thread id, for callers that do not persist the session themselves. */
  private readonly sessions = new Map<string, ProviderSession>();

  /** Chat models write tool calls as text. See text-tool-calls.ts. */
  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  override async generateMessage(args: Parameters<BaseProvider["generateMessage"]>[0]): Promise<Message> {
    const { text } = await this.chatTurn(args);
    return replyMessage(text, args.tools ?? []);
  }

  override async *generateMessages(args: Parameters<BaseProvider["generateMessages"]>[0]): AsyncGenerator<ProviderStreamItem> {
    const { text, session } = await this.chatTurn(args);
    if (args.threadId) yield { type: "session", session };
    yield* replyStreamItems(replyMessage(text, args.tools ?? []));
  }

  /**
   * Continue the chat the prior session names, or start a new one. A chat
   * continues when the model and system prompt still match and there are new
   * messages. Then only those are sent. A chat that is gone falls back to a
   * new one with the whole conversation.
   */
  private async chatTurn(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    threadId?: string | null;
    providerSession?: ProviderSession | null;
    loadFullHistory?: () => Promise<Message[]>;
    signal?: AbortSignal;
  }): Promise<{ text: string; session: ProviderSession }> {
    const tools = args.tools ?? [];
    const systemHash = hashSystemPrompt(args.messages, tools);
    const threadId = args.threadId ?? null;
    const prior = args.providerSession ?? (threadId ? this.sessions.get(threadId) ?? null : null);
    const canResume =
      prior != null &&
      prior.providerId === this.provider &&
      prior.model === args.model &&
      (prior.systemHash == null || prior.systemHash === systemHash) &&
      args.messages.length > prior.checkpoint;

    let result: { conversationId: string; text: string } | null = null;
    if (canResume && prior) {
      const delta = args.messages.slice(prior.checkpoint);
      const images = await this.lastUserImages(delta, args.signal);
      try {
        result = await serialized(() => runChatTurnHoldingTab({ model: args.model, text: composeDelta(delta), images, conversationId: prior.token, signal: args.signal }));
      } catch (error) {
        if (!(error instanceof ChatUnavailableError)) throw error;
        log.warn("Gemini chat cannot continue; starting a new one", { conversationId: prior.token, error: error.message });
      }
    }
    if (!result) {
      // The caller may have sent only the delta; a new chat needs the whole conversation.
      const messages = args.loadFullHistory ? await args.loadFullHistory() : args.messages;
      const images = await this.lastUserImages(messages, args.signal);
      result = await serialized(() => runChatTurnHoldingTab({ model: args.model, text: composePrompt(messages, tools), images, signal: args.signal }));
    }
    const session: ProviderSession = {
      providerId: this.provider,
      model: args.model,
      token: result.conversationId,
      checkpoint: args.messages.length,
      systemHash
    };
    // Cache only when the caller does not thread the session itself; its copy is authoritative.
    if (threadId && args.providerSession == null) this.sessions.set(threadId, session);
    return { text: result.text, session };
  }

  /** The images of the last user message among `messages`. Gemini gets no earlier ones. */
  private async lastUserImages(messages: Message[], signal?: AbortSignal): Promise<Uint8Array[]> {
    const last = [...messages].reverse().find((m) => m.role === "user");
    const dropped = messages.filter((m) => m !== last).reduce((n, m) => n + imagesOf(m.content).length, 0);
    if (dropped > 0) log.warn("Gemini gets images from the last user message only; dropping earlier ones", { dropped });
    return last ? Promise.all(imagesOf(last.content).map((part) => this.imageBytes(part, signal))) : [];
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    return this.generateImage(params.prompt, [], params);
  }

  override async imageToImage(images: Uint8Array[], params: ImageToImageParams): Promise<Uint8Array> {
    if (images.length === 0) throw new Error("imageToImage needs at least one source image");
    return this.generateImage(params.prompt, images, { ...params, width: params.targetWidth, height: params.targetHeight });
  }

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    return this.generateVideo(params.prompt, null, params);
  }

  override async imageToVideo(image: Uint8Array, params: ImageToVideoParams): Promise<Uint8Array> {
    return this.generateVideo(params.prompt ?? "", image, params);
  }

  private async generateImage(
    prompt: string,
    images: Uint8Array[],
    params: { model?: { id: string }; aspectRatio?: string | null; width?: number | null; height?: number | null; negativePrompt?: string | null; signal?: AbortSignal }
  ): Promise<Uint8Array> {
    // `gemini-web-image:<mode id>` runs the image tool in that mode.
    const modeId = params.model?.id.startsWith(`${GEMINI_WEB_IMAGE_MODEL}:`) ? params.model.id.slice(GEMINI_WEB_IMAGE_MODEL.length + 1) : null;
    const setup = async (): Promise<void> => {
      await openNewChat();
      if (modeId) await selectMode(modeId);
    };
    const text = [
      images.length > 0
        ? "Edit the attached image(s) as described and reply with one image. Do not ask questions."
        : "Generate one image. Do not ask questions.",
      prompt,
      aspectHint(params.aspectRatio, params.width, params.height),
      params.negativePrompt ? `Avoid: ${params.negativePrompt}.` : ""
    ].filter(Boolean).join("\n\n");
    // The download runs in the same turn on the tab, so no other call can
    // navigate the tab away in between.
    return serialized(async () => {
      const reply = await sendAndRead(setup, text, images, IMAGE_TIMEOUT_MS, params.signal);
      const url = reply.images.at(-1);
      if (!url) {
        throw new Error(`Gemini finished without an image${reply.text ? `: ${reply.text.slice(0, 300)}` : ""}.${chatLink(reply.conversationId)}`);
      }
      return currentTab().download(`${url}${FULL_SIZE_SUFFIX}`, DOWNLOAD_TIMEOUT_MS);
    });
  }

  private async generateVideo(
    prompt: string,
    image: Uint8Array | null,
    params: { aspectRatio?: string | null; negativePrompt?: string | null; timeoutSeconds?: number | null; signal?: AbortSignal }
  ): Promise<Uint8Array> {
    const text = [
      image ? "Animate the attached image into a video." : "",
      prompt,
      params.negativePrompt ? `Avoid: ${params.negativePrompt}.` : ""
    ].filter(Boolean).join("\n\n");
    if (!text) throw new Error("A Gemini video needs a prompt or a start image");
    const timeoutMs = params.timeoutSeconds ? params.timeoutSeconds * 1000 : VIDEO_TIMEOUT_MS;
    return serialized(async () => {
      const setup = async (): Promise<void> => {
        await openNewChat();
        await enableTool(VIDEO_TOOL_ICON);
        await selectVideoAspect(params.aspectRatio === "9:16" ? "9:16" : "16:9");
      };
      const reply = await sendAndRead(setup, text, image ? [image] : [], CHAT_TIMEOUT_MS, params.signal);
      if (!reply.conversationId) throw new Error("Gemini replied without a chat id");
      if (!reply.videoPending) {
        throw new Error(`Gemini did not start a video${reply.text ? `: ${reply.text.slice(0, 300)}` : ""}.${chatLink(reply.conversationId)}`);
      }
      const started = Date.now();
      let failures = 0;
      let lastText = reply.text;
      for (;;) {
        await sleep(VIDEO_POLL_INTERVAL_MS, params.signal);
        try {
          const found = findGeneratedVideo(await readChat(reply.conversationId));
          failures = 0;
          lastText = found.text || lastText;
          if (found.url) {
            log.info("Gemini video ready", { conversationId: reply.conversationId, seconds: Math.round((Date.now() - started) / 1000) });
            return currentTab().download(found.url, DOWNLOAD_TIMEOUT_MS);
          }
        } catch (error) {
          log.warn("Gemini video poll failed", { failures: failures + 1, error: error instanceof Error ? error.message : String(error) });
          if (++failures > MAX_POLL_FAILURES) throw error;
        }
        if (Date.now() - started > timeoutMs) {
          throw new Error(`Gemini did not finish the video within ${timeoutMs / 1000}s${lastText ? ` (last reply: ${lastText.slice(0, 200)})` : ""}.${chatLink(reply.conversationId)}`);
        }
      }
    });
  }

  /** Bytes of one image part: inline data, a data URI, an asset URI or a URL. */
  private async imageBytes(part: MessageImageContent, signal?: AbortSignal): Promise<Uint8Array> {
    const { data, uri } = part.image;
    if (data instanceof Uint8Array && data.length > 0) return data;
    const fromDataUri = (value: string): Uint8Array => new Uint8Array(Buffer.from(value.slice(value.indexOf(",") + 1), "base64"));
    if (typeof data === "string" && data.length > 0) return data.startsWith("data:") ? fromDataUri(data) : new Uint8Array(Buffer.from(data, "base64"));
    if (!uri) throw new Error("Image part has neither data nor a URI");
    const resolved = uri.startsWith("data:") ? uri : await this.resolveUri(uri);
    if (resolved.startsWith("data:")) return fromDataUri(resolved);
    const response = await fetchExternalMedia(resolved, signal ? { signal } : undefined);
    if (!response.ok) throw new Error(`Image download failed: HTTP ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }
}
