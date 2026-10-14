/**
 * ChatGPT through the user's own logged-in chatgpt.com tab, driven by the
 * NodeTool Chrome extension. No API key: requests run on the user's ChatGPT
 * subscription.
 *
 * A turn is submitted through the page's own composer, so the site computes
 * its anti-abuse tokens itself. The reply is read back from the conversation
 * API (`/backend-api/conversation/<id>`), which needs only the session's
 * bearer token.
 *
 * Every turn runs in a normal ChatGPT thread, so it shows in the user's
 * history. A chat records the thread as its provider session and the next turn
 * continues it, sending only the new messages. Temporary chats would keep the
 * history clean, but ChatGPT can neither reopen them nor generate images in
 * them.
 *
 * One tab serves every call, so calls run one at a time.
 */
import { createHash } from "node:crypto";
import { createLogger } from "@nodetool-ai/config";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import { fetchExternalMedia } from "../external-media-fetch.js";
import { BaseProvider, type ProviderCapability } from "./base-provider.js";
import { createExtensionTab, pollTab, stageBytesInTab, type ExtensionTab } from "./extension-tab.js";
import { detectImageMime } from "./image-mime.js";
import type {
  ImageModel,
  ImageToImageParams,
  LanguageModel,
  Message,
  MessageContent,
  MessageImageContent,
  ProviderSession,
  ProviderStreamItem,
  TextToImageParams
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.chatgpt");

const HOST = "chatgpt.com";
const BASE_URL = `https://${HOST}`;
/** The model id that leaves the choice to ChatGPT. */
export const CHATGPT_AUTO_MODEL = "auto";
/** The one image model: ChatGPT's own image tool, run by the default chat model. */
export const CHATGPT_IMAGE_MODEL = "chatgpt-image";
const COMPOSER = 'form .ProseMirror[contenteditable="true"]';
const SUBMIT = 'form button[type="submit"]';
const POLL_INTERVAL_MS = 1_500;
const READY_TIMEOUT_MS = 20_000;
const CONVERSATION_ID_TIMEOUT_MS = 30_000;
const CHAT_TIMEOUT_MS = 10 * 60_000;
const IMAGE_TIMEOUT_MS = 10 * 60_000;
/** The send script waits in the page for uploads to finish before it clicks. */
const SEND_TIMEOUT_MS = 85_000;
/** How long after a send click the composer has to empty before the click is repeated. */
const SEND_ACCEPT_TIMEOUT_MS = 3_000;
/** Files set before the page is ready show no preview. Set them again after this wait. */
const ATTACH_TIMEOUT_MS = 5_000;
const ATTACH_ATTEMPTS = 4;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const MAX_POLL_FAILURES = 5;
const MODELS_TTL_MS = 10 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let tab: ExtensionTab | null = null;

/** Replace the tab. Tests use this to avoid a real browser. */
export function setChatGPTTab(next: ExtensionTab | null): void {
  tab = next;
  liveModels = null;
}

function currentTab(): ExtensionTab {
  return (tab ??= createExtensionTab(HOST));
}

/** Calls share one tab, so each waits for the previous one. */
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(run: () => Promise<T>): Promise<T> {
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

/** Models read from the page during an earlier call, so listing never attaches. */
let liveModels: { at: number; models: LanguageModel[] } | null = null;

/** One message on the conversation's current branch, as the page script reports it. */
interface PathNode {
  id: string;
  role: string;
  contentType: string;
  status: string | null;
  endTurn: boolean | null;
  text: string;
  images: string[];
}

interface ConversationState {
  currentNode: string | null;
  path: PathNode[];
}

interface TurnRequest {
  model: string;
  text: string;
  images: Uint8Array[];
  /** Continue this thread instead of starting a new one. */
  conversationId?: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

interface TurnResult {
  conversationId: string;
  text: string;
  images: string[];
}

/** The page fetches the session's bearer token first; every API script starts with this. */
const AUTH = `const __s = await (await fetch("/api/auth/session", { credentials: "include" })).json();
    if (!__s || !__s.accessToken) throw new Error("NT_NOT_SIGNED_IN");
    const __auth = { authorization: "Bearer " + __s.accessToken };`;

function signedOut(error: unknown): boolean {
  return error instanceof Error && error.message.includes("NT_NOT_SIGNED_IN");
}

function signInError(): Error {
  return new Error("ChatGPT is not signed in. Open https://chatgpt.com in Chrome, sign in, and try again");
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
  try {
    return (await currentTab().evaluate(expression, timeoutMs)) as T;
  } catch (error) {
    if (signedOut(error)) throw signInError();
    throw error;
  }
}

/** {@link pollTab} on the ChatGPT tab, with the sign-in check of {@link evaluate}. */
async function poll<T>(expression: string, timeoutMs: number): Promise<T | null> {
  try {
    return await pollTab<T>(currentTab(), expression, timeoutMs);
  } catch (error) {
    if (signedOut(error)) throw signInError();
    throw error;
  }
}

async function waitForComposer(): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await evaluate<boolean>(`/*nt:ready*/ !!document.querySelector(${JSON.stringify(COMPOSER)})`)) return;
    await sleep(250);
  }
  // A signed-out page has no composer, so tell that apart from a layout change.
  await evaluate(`/*nt:session*/ (async () => { ${AUTH} return true; })()`);
  throw new Error("The ChatGPT composer did not appear. The chatgpt.com page layout may have changed");
}

/** Read the conversation's current branch, root first, compacted in the page. */
async function readConversation(conversationId: string): Promise<ConversationState> {
  return evaluate<ConversationState>(`/*nt:conversation*/ (async () => {
    ${AUTH}
    const response = await fetch("/backend-api/conversation/" + ${JSON.stringify(conversationId)}, { headers: __auth });
    if (!response.ok) throw new Error("ChatGPT conversation request failed: HTTP " + response.status);
    const data = await response.json();
    const path = [];
    let node = data.mapping && data.mapping[data.current_node];
    while (node) {
      const m = node.message;
      if (m) {
        const parts = (m.content && m.content.parts) || [];
        path.unshift({
          id: node.id,
          role: m.author.role,
          contentType: m.content.content_type,
          status: m.status ?? null,
          endTurn: m.end_turn ?? null,
          text: parts.filter((p) => typeof p === "string").join(""),
          images: parts.filter((p) => p && p.content_type === "image_asset_pointer").map((p) => p.asset_pointer)
        });
      }
      node = data.mapping[node.parent];
    }
    return { currentNode: data.current_node ?? null, path };
  })()`);
}

/**
 * Put images into the composer's file input, the way a file picker would. The
 * page drops files that arrive before it is ready, so set them again until
 * the previews show.
 */
async function attachImages(images: Uint8Array[]): Promise<void> {
  if (images.length === 0) return;
  const files: Array<{ id: string; name: string; type: string }> = [];
  for (const [index, image] of images.entries()) {
    const type = detectImageMime(image);
    const id = await stageBytesInTab(currentTab(), image);
    files.push({ id, name: `image-${index + 1}.${type.split("/")[1] ?? "png"}`, type });
  }
  const pick = `/*nt:attach*/ (() => {
    const files = ${JSON.stringify(files)};
    const inputs = [...document.querySelectorAll('input[type="file"]')];
    const input = inputs.find((i) => i.multiple && (i.accept === "" || i.accept.includes("image/"))) || inputs[0];
    if (!input) throw new Error("The ChatGPT composer has no file input");
    const transfer = new DataTransfer();
    for (const f of files) {
      const binary = atob(window.__ntStage[f.id]);
      transfer.items.add(new File([Uint8Array.from(binary, (c) => c.charCodeAt(0))], f.name, { type: f.type }));
    }
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`;
  let attached = false;
  for (let attempt = 1; !attached && attempt <= ATTACH_ATTEMPTS; attempt++) {
    await evaluate(pick);
    attached = !!(await poll<boolean>(`/*nt:attached*/ document.querySelectorAll("form img").length >= ${files.length}`, ATTACH_TIMEOUT_MS));
  }
  await evaluate(`/*nt:unstage*/ (() => { for (const id of ${JSON.stringify(files.map((f) => f.id))}) delete window.__ntStage[id]; return true; })()`);
  if (!attached) throw new Error("ChatGPT did not take the images: no attachment preview appeared");
}

/**
 * Type the text and click send. An attachment's preview appears before its
 * upload finishes, and a click during the upload is ignored while the button
 * still looks enabled. So the provider clicks, checks that the composer
 * emptied, and clicks again until the page takes the message. Every wait polls
 * from here: Chrome throttles the timers of a page hidden for a while to one
 * wake-up a minute, so a wait inside the page could take minutes per step.
 */
async function submit(text: string, attachments: number): Promise<void> {
  await evaluate(`/*nt:send*/ (() => {
    const composer = document.querySelector(${JSON.stringify(COMPOSER)});
    composer.focus();
    document.execCommand("insertText", false, ${JSON.stringify(text)});
    return true;
  })()`);
  const deadline = Date.now() + SEND_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const ready = await poll<boolean>(`/*nt:sendready*/ (() => {
      const button = document.querySelector(${JSON.stringify(SUBMIT)});
      return !!button && !button.disabled && document.querySelectorAll("form img").length >= ${attachments};
    })()`, Math.max(0, deadline - Date.now()));
    if (!ready) break;
    await evaluate(`/*nt:click*/ (() => { document.querySelector(${JSON.stringify(SUBMIT)}).click(); return true; })()`);
    const accepted = await poll<boolean>(`/*nt:accepted*/ (() => {
      const box = document.querySelector(${JSON.stringify(COMPOSER)});
      return !box || box.innerText.trim() === "" || location.pathname.startsWith("/c/");
    })()`, SEND_ACCEPT_TIMEOUT_MS);
    if (accepted) return;
  }
  throw new Error("ChatGPT did not accept the message: the send button stayed disabled or ignored the click");
}

async function waitForConversationId(signal?: AbortSignal): Promise<string> {
  const deadline = Date.now() + CONVERSATION_ID_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(500, signal);
    // A new chat first shows a placeholder id (`local-…`); only a UUID is real.
    const id = (await evaluate<string>(`/*nt:location*/ location.pathname`)).match(/\/c\/([0-9a-f-]{36})/)?.[1];
    if (id && UUID.test(id)) return id;
  }
  throw new Error("ChatGPT did not start a conversation after the message was sent");
}

/** The thread to continue is gone, so the caller starts a new one. Thrown before anything is sent. */
class ThreadUnavailableError extends Error {}

/**
 * Poll until the turn ends: the current node is a new assistant message with
 * `end_turn`. `before` is the current node before the send, whose finished
 * reply must not count.
 */
async function waitForReply(conversationId: string, timeoutMs: number, signal?: AbortSignal, before: string | null = null): Promise<ConversationState> {
  const started = Date.now();
  let failures = 0;
  let last: ConversationState | null = null;
  for (;;) {
    await sleep(POLL_INTERVAL_MS, signal);
    try {
      last = await readConversation(conversationId);
      failures = 0;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("ChatGPT is not signed in")) throw error;
      log.warn("ChatGPT poll failed", { conversationId, failures: failures + 1, error: error instanceof Error ? error.message : String(error) });
      if (++failures > MAX_POLL_FAILURES) throw error;
    }
    const tail = last?.path.at(-1);
    if (tail && tail.role === "assistant" && tail.endTurn === true && last!.currentNode !== before) return last!;
    if (Date.now() - started > timeoutMs) {
      throw new Error(`ChatGPT did not finish within ${timeoutMs / 1000}s (last message: ${tail ? `${tail.role} ${tail.contentType} ${tail.status ?? ""}`.trim() : "none"}). The conversation is ${BASE_URL}/c/${conversationId}`);
    }
  }
}

/** Run one turn, in a new thread or a continued one, and return the reply. The caller holds the tab. */
async function runTurnHoldingTab(request: TurnRequest): Promise<TurnResult> {
  const query = new URLSearchParams();
  if (request.model && request.model !== CHATGPT_AUTO_MODEL && request.model !== CHATGPT_IMAGE_MODEL) query.set("model", request.model);
  const search = query.toString() ? `?${query}` : "";
  let before: string | null = null;
  if (request.conversationId) {
    await currentTab().navigate(`${BASE_URL}/c/${request.conversationId}${search}`);
    await waitForComposer();
    // A deleted or foreign thread redirects to a new chat.
    const pathname = await evaluate<string>(`/*nt:location*/ location.pathname`);
    if (!pathname.includes(request.conversationId)) throw new ThreadUnavailableError(`ChatGPT thread ${request.conversationId} is no longer available`);
    try {
      before = (await readConversation(request.conversationId)).currentNode;
    } catch (error) {
      throw new ThreadUnavailableError(error instanceof Error ? error.message : String(error));
    }
  } else {
    await currentTab().navigate(`${BASE_URL}/${search}`);
    await waitForComposer();
  }
  await attachImages(request.images);
  await submit(request.text, request.images.length);
  const conversationId = request.conversationId ?? (await waitForConversationId(request.signal));
  log.info("ChatGPT turn submitted", { conversationId, model: request.model, continued: Boolean(request.conversationId), images: request.images.length });
  const state = await waitForReply(conversationId, request.timeoutMs, request.signal, before);
  await refreshModels();
  return collectReply(conversationId, state);
}

/** The reply is everything after the last user message on the branch. */
function collectReply(conversationId: string, state: ConversationState): TurnResult {
  let lastUser = -1;
  state.path.forEach((node, index) => { if (node.role === "user") lastUser = index; });
  const reply = state.path.slice(lastUser + 1);
  const tail = reply.at(-1);
  const text = tail && tail.contentType === "text" ? tail.text : "";
  const images = [...new Set(reply.filter((node) => node.role === "tool").flatMap((node) => node.images))];
  return { conversationId, text, images };
}

/** Resolve an image pointer (`sediment://file_…` or `file-service://file-…`) and fetch it in the tab. */
async function downloadImage(conversationId: string, pointer: string): Promise<Uint8Array> {
  const fileId = pointer.replace(/^[a-z-]+:\/\//, "");
  const base64 = await evaluate<string>(`/*nt:download*/ (async () => {
    ${AUTH}
    const meta = await fetch("/backend-api/files/download/" + ${JSON.stringify(fileId)} + "?conversation_id=" + ${JSON.stringify(conversationId)} + "&inline=false", { headers: __auth });
    if (!meta.ok) throw new Error("ChatGPT file lookup failed: HTTP " + meta.status);
    const info = await meta.json();
    if (!info.download_url) throw new Error("ChatGPT returned no download URL for the image");
    const response = await fetch(info.download_url, { credentials: "include" });
    if (!response.ok) throw new Error("ChatGPT image download failed: HTTP " + response.status);
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  })()`, DOWNLOAD_TIMEOUT_MS);
  return new Uint8Array(Buffer.from(base64, "base64"));
}

/** Read the account's model picker while the tab is attached anyway. */
async function refreshModels(): Promise<void> {
  if (liveModels && Date.now() - liveModels.at < MODELS_TTL_MS) return;
  try {
    const listed = await evaluate<Array<{ slug: string; title: string }>>(`/*nt:models*/ (async () => {
      ${AUTH}
      const response = await fetch("/backend-api/models", { headers: __auth });
      if (!response.ok) return [];
      const data = await response.json();
      return (data.models || []).map((m) => ({ slug: m.slug, title: m.title }));
    })()`);
    liveModels = {
      at: Date.now(),
      models: listed.filter((m) => typeof m.slug === "string" && m.slug).map((m) => ({ id: m.slug, name: `${m.title || m.slug} (${m.slug})`, provider: PROVIDER_IDS.CHATGPT }))
    };
  } catch (error) {
    log.debug("ChatGPT model list unavailable", { error: error instanceof Error ? error.message : String(error) });
  }
}

function textOf(content: Message["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((part): part is Extract<MessageContent, { type: "text" }> => part.type === "text").map((part) => part.text).join("\n");
}

function imagesOf(content: Message["content"]): MessageImageContent[] {
  return Array.isArray(content) ? content.filter((part): part is MessageImageContent => part.type === "image_url") : [];
}

/**
 * Flatten a conversation into one composer message. A single user message goes
 * as it is. Otherwise the system prompt and the earlier turns become a
 * transcript that ends with the last user message.
 */
export function composePrompt(messages: Message[]): string {
  const system = messages.filter((m) => m.role === "system").map((m) => textOf(m.content)).filter(Boolean).join("\n\n");
  const turns = messages.filter((m) => m.role !== "system");
  if (!system && turns.length === 1 && turns[0].role === "user") return textOf(turns[0].content);
  const label = (m: Message): string => (m.role === "user" ? "User" : m.role === "assistant" ? "Assistant" : "Tool result");
  const transcript = turns.map((m) => `${label(m)}: ${textOf(m.content)}`.trimEnd()).join("\n\n");
  return [
    system ? `Instructions:\n${system}` : "",
    turns.length > 1 ? `Conversation so far:\n${transcript}\n\nReply to the last User message.` : textOf(turns[0]?.content ?? "")
  ].filter(Boolean).join("\n\n");
}

/** The new messages of a continued thread: ChatGPT already holds its own replies and the system prompt. */
export function composeDelta(delta: Message[]): string {
  const turns = delta.filter((m) => m.role !== "assistant" && m.role !== "system");
  if (turns.length === 1) return textOf(turns[0].content);
  return turns.map((m) => `${m.role === "tool" ? "Tool result" : "User"}: ${textOf(m.content)}`.trimEnd()).join("\n\n");
}

function hashSystemPrompt(messages: Message[]): string {
  const system = messages.filter((m) => m.role === "system").map((m) => textOf(m.content)).join("\n\n");
  return createHash("sha256").update(system).digest("hex").slice(0, 16);
}

function aspectHint(aspectRatio?: string | null, width?: number | null, height?: number | null): string {
  if (aspectRatio) return `Aspect ratio: ${aspectRatio}.`;
  if (width && height) return `Size: about ${width}x${height} pixels.`;
  return "";
}

export class ChatGPTProvider extends BaseProvider {
  static override requiredSecrets(): string[] {
    return [];
  }

  constructor(_secrets: Record<string, unknown> = {}) {
    super(PROVIDER_IDS.CHATGPT);
  }

  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return ["text_to_image", "image_to_image"];
  }

  /**
   * Listing never attaches to the tab: it returns `auto` plus the account's
   * models read during an earlier call. Any ChatGPT model slug also works as
   * a model id.
   */
  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const auto: LanguageModel = { id: CHATGPT_AUTO_MODEL, name: "ChatGPT (default model)", provider: PROVIDER_IDS.CHATGPT };
    return [auto, ...(liveModels?.models ?? [])];
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return [{
      id: CHATGPT_IMAGE_MODEL,
      name: "ChatGPT Images",
      provider: PROVIDER_IDS.CHATGPT,
      supportedTasks: ["text_to_image", "image_to_image"],
      aspectRatios: ["1:1", "3:2", "2:3"]
    }];
  }

  /** Threads by conversation thread id, for callers that do not persist the session themselves. */
  private readonly sessions = new Map<string, ProviderSession>();

  override async generateMessage(args: Parameters<BaseProvider["generateMessage"]>[0]): Promise<Message> {
    const { result } = await this.chatTurn(args);
    return { role: "assistant", content: result.text };
  }

  override async *generateMessages(args: Parameters<BaseProvider["generateMessages"]>[0]): AsyncGenerator<ProviderStreamItem> {
    const { result, session } = await this.chatTurn(args);
    if (args.threadId) yield { type: "session", session };
    yield { type: "chunk", content: result.text, content_type: "text", done: true };
  }

  /**
   * Continue the thread the prior session names, or start a new one. A thread
   * continues when the model and system prompt still match and there are new
   * messages; then only those are sent. A thread that is gone falls back to a
   * new one with the whole conversation.
   */
  private async chatTurn(args: {
    messages: Message[];
    model: string;
    tools?: unknown[];
    threadId?: string | null;
    providerSession?: ProviderSession | null;
    loadFullHistory?: () => Promise<Message[]>;
    signal?: AbortSignal;
  }): Promise<{ result: TurnResult; session: ProviderSession }> {
    if (args.tools && args.tools.length > 0) {
      log.warn("ChatGPT in the browser cannot call tools; sending the conversation without them", { tools: args.tools.length });
    }
    const systemHash = hashSystemPrompt(args.messages);
    const threadId = args.threadId ?? null;
    const prior = args.providerSession ?? (threadId ? this.sessions.get(threadId) ?? null : null);
    const canResume =
      prior != null &&
      prior.providerId === this.provider &&
      prior.model === args.model &&
      (prior.systemHash == null || prior.systemHash === systemHash) &&
      args.messages.length > prior.checkpoint;

    let result: TurnResult | null = null;
    if (canResume && prior) {
      const delta = args.messages.slice(prior.checkpoint);
      const request = await this.turnRequest(args.model, composeDelta(delta), delta, args.signal);
      try {
        result = await serialized(() => runTurnHoldingTab({ ...request, conversationId: prior.token }));
      } catch (error) {
        if (!(error instanceof ThreadUnavailableError)) throw error;
        log.warn("ChatGPT thread cannot continue; starting a new one", { conversationId: prior.token, error: error.message });
      }
    }
    if (!result) {
      // The caller may have sent only the delta; a new thread needs the whole conversation.
      const messages = canResume && args.loadFullHistory ? await args.loadFullHistory() : args.messages;
      const request = await this.turnRequest(args.model, composePrompt(messages), messages, args.signal);
      result = await serialized(() => runTurnHoldingTab(request));
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
    return { result, session };
  }

  /** A chat turn's request: the text plus the images of the last user message among `messages`. */
  private async turnRequest(model: string, text: string, messages: Message[], signal?: AbortSignal): Promise<TurnRequest> {
    const last = [...messages].reverse().find((m) => m.role === "user");
    const images = last ? await Promise.all(imagesOf(last.content).map((part) => this.imageBytes(part, signal))) : [];
    const dropped = messages.filter((m) => m !== last).reduce((n, m) => n + imagesOf(m.content).length, 0);
    if (dropped > 0) log.warn("ChatGPT gets images from the last user message only; dropping earlier ones", { dropped });
    return { model, text, images, timeoutMs: CHAT_TIMEOUT_MS, signal };
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    return this.generateImage(params.prompt, [], params);
  }

  override async imageToImage(images: Uint8Array[], params: ImageToImageParams): Promise<Uint8Array> {
    if (images.length === 0) throw new Error("imageToImage needs at least one source image");
    return this.generateImage(params.prompt, images, { ...params, width: params.targetWidth, height: params.targetHeight });
  }

  private async generateImage(
    prompt: string,
    images: Uint8Array[],
    params: { aspectRatio?: string | null; width?: number | null; height?: number | null; negativePrompt?: string | null; signal?: AbortSignal }
  ): Promise<Uint8Array> {
    const text = [
      images.length > 0
        ? "Create one image with the image generation tool, based on the attached image(s). Do not ask questions."
        : "Create one image with the image generation tool. Do not ask questions.",
      prompt,
      aspectHint(params.aspectRatio, params.width, params.height),
      params.negativePrompt ? `Avoid: ${params.negativePrompt}.` : ""
    ].filter(Boolean).join("\n\n");
    // The download runs in the same turn on the tab, so no other call can
    // navigate the tab away in between.
    return serialized(async () => {
      const result = await runTurnHoldingTab({ model: CHATGPT_IMAGE_MODEL, text, images, timeoutMs: IMAGE_TIMEOUT_MS, signal: params.signal });
      const pointer = result.images.at(-1);
      if (!pointer) {
        const said = result.text.trim();
        throw new Error(`ChatGPT finished without an image${said ? `: ${said.slice(0, 300)}` : ""}. The conversation is ${BASE_URL}/c/${result.conversationId}`);
      }
      return downloadImage(result.conversationId, pointer);
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
