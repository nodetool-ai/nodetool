import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findGeneratedVideo, GeminiWebProvider, parseChatTurn, setGeminiWebTab } from "../../src/providers/gemini-web-provider.js";
import type { ExtensionTab } from "../../src/providers/extension-tab.js";
import type { ProviderStreamItem } from "../../src/providers/types.js";

const CHAT_ID = "c_96c609d97426c188";
const IMAGE_URL = "https://lh3.googleusercontent.com/gg/AJWXcNfQVGVBO_f0Glno";
const VIDEO_URL = "https://contribution.usercontent.google.com/download?c=CgxiYXJkX3N0b3JhZ2U&filename=video.mp4";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const IMAGE_MODEL = { id: "gemini-web-image", provider: "gemini_web" } as never;
const VIDEO_MODEL = { id: "gemini-web-video", provider: "gemini_web" } as never;
const MODES = [{ id: "56fdd199312815e2", name: "3.8 Flash" }, { id: "e6fa609c3fa255c0", name: "3.1 Pro" }];

/** One `wrb.fr` frame line, the way batchexecute sends it. */
function frame(payload: unknown[], rpc: string | null = null): string {
  const line = JSON.stringify([["wrb.fr", rpc, JSON.stringify(payload)]]);
  return `${line.length + 1}\n${line}\n`;
}

/** A candidate in the observed layout: text parts at [1], generated images at [12][7][0]. */
function candidate(text: string, imageUrls: string[]): unknown[] {
  const entry = new Array<unknown>(13).fill(null);
  entry[0] = "rc_eb238634b4188b37";
  entry[1] = [text];
  const media = new Array<unknown>(8).fill(null);
  media[7] = [imageUrls.map((url, index) => [[null, null, null, [null, 1, "image.jpg", url]], [`http://googleusercontent.com/image_generation_content/${index}_751`], null, null, null, null, null, null, `im_${index}`])];
  entry[12] = media;
  return entry;
}

interface TurnOptions {
  images?: string[];
  /** Mark the turn as a started video with a `video_generation` entry. */
  video?: boolean;
  chatId?: string;
  turnId?: string;
}

/** An hNvQHb chat read whose newest turn holds `text`: ids at [0], the candidate at [3][0][0]. */
function turnRead(text: string, options: TurnOptions = {}): string {
  const turn: unknown[] = [[options.chatId ?? CHAT_ID, options.turnId ?? "r_11cae6b8f4a66a05"], null, [["the prompt"]], [[candidate(text, options.images ?? [])]]];
  if (options.video) turn.push([["video_generation", [null, null, "Video Generation", ""], 1]]);
  return `)]}'\n\n${frame([[turn]], "hNvQHb")}`;
}

/** The read of a chat Gemini has not stored yet: an error entry and no payload. */
const UNSTORED_READ = `)]}'\n\n188\n[["wrb.fr","hNvQHb",null,null,null,[5,null,[["type.googleapis.com/assistant.boq.bard.application.BardErrorInfo",[1167]]]],"generic"]]\n`;

/** An hNvQHb chat read of a video turn, with the finished video under [12] when `videoUrl` is set. */
function chatRead(text: string, videoUrl: string | null): string {
  const entry = new Array<unknown>(25).fill(null);
  entry[2] = "video.mp4";
  entry[7] = ["https://lh3.googleusercontent.com/gg/thumbnail", videoUrl, "https://lh3.googleusercontent.com/gg/thumbnail"];
  entry[11] = "video/mp4";
  const cand = candidate(text, []);
  cand[12] = videoUrl ? [[null, ...new Array(59).fill(null), [[[entry]]]]] : null;
  const turn = [[CHAT_ID, "r_11cae6b8f4a66a05"], null, [["the prompt"]], [[cand]]];
  return `)]}'\n\n${frame([[turn]], "hNvQHb")}`;
}

interface FakePage {
  navigations: string[];
  sent: string[];
  attached: number;
  scripts: string[];
  downloads: string[];
  modePicked: string | null;
  /** Every script the provider ran in the page. */
  expressions: string[];
  /** The text typed by the last send script, sent once the page shows the turn. */
  typed?: string;
}

interface FakeOptions {
  signedIn?: boolean;
  /** Every chat read fails with this HTTP status. */
  readStatus?: number;
  /** Send attempts that start no request before one does. */
  unsentClicks?: number;
  /** Reads after a send that find the turn not stored yet. */
  unstoredReads?: number;
  /** Chat reads that show no video yet. */
  pendingReads?: number;
  videoReady?: boolean;
  /** Chats that redirect to a new one. */
  goneChats?: string[];
  /** The chat read of each sent turn, in order. Each turn gets its own turn id. */
  turns?: Array<{ text: string } & TurnOptions>;
  /** Pastes the page drops before its uploader is ready. */
  lostPastes?: number;
}

/**
 * A gemini.google.com tab: the composer is ready and the account is signed
 * in. A sent turn runs for one poll, and a new chat gets its id when it runs.
 */
function fakeTab(options: FakeOptions = {}): FakePage {
  const page: FakePage = { navigations: [], sent: [], attached: 0, scripts: [], downloads: [], modePicked: null, expressions: [] };
  let pathname = "/app";
  let runningPolls = 0;
  /** The current attempt clicked send and the page showed the turn. */
  let turnSent = false;
  let sends = 0;
  let readsSinceSend = 0;
  let videoReads = 0;
  let pastes = 0;
  let previews = 0;
  const turnBody = (index: number): string => {
    const turn = options.turns?.[index] ?? { text: "", images: [IMAGE_URL] };
    return turnRead(turn.text, { ...turn, turnId: turn.turnId ?? `r_${String(index).padStart(16, "0")}` });
  };
  const tab: ExtensionTab = {
    async navigate(url) {
      page.navigations.push(url);
      pathname = new URL(url).pathname;
      if (options.goneChats?.some((id) => pathname.endsWith(id.replace(/^c_/, "")))) pathname = "/app";
    },
    async download(url) {
      page.downloads.push(url);
      return url.includes("contribution") ? MP4 : JPEG;
    },
    async evaluate(expression) {
      const op = /\/\*nt:([\w-]+)\*\//.exec(expression)?.[1] ?? "stage";
      page.scripts.push(op);
      page.expressions.push(expression);
      switch (op) {
        case "ready": return true;
        case "settled": return true;
        case "session": return options.signedIn ?? true;
        case "history": return true;
        case "location": return pathname;
        case "modes": {
          const wanted = JSON.parse(/const wanted = ("[^"]*");/.exec(expression)![1]);
          if (MODES.some((m) => m.id === wanted)) page.modePicked = wanted;
          return MODES;
        }
        case "attach": {
          const count = JSON.parse(/const files = (\[.*?\]);/s.exec(expression)![1]).length;
          if (++pastes > (options.lostPastes ?? 0)) {
            page.attached += count;
            previews = count;
          }
          return true;
        }
        case "attached": return previews > 0;
        case "send":
          sends += 1;
          turnSent = false;
          page.typed = JSON.parse(/insertText", false, ("(?:[^"\\]|\\.)*")\)/.exec(expression)![1]);
          return true;
        case "sent":
          // A click that starts no request never shows a turn, however long the poll waits.
          if (sends <= (options.unsentClicks ?? 0)) return false;
          if (page.sent.length < sends - (options.unsentClicks ?? 0)) {
            page.sent.push(page.typed!);
            turnSent = true;
            runningPolls = 1;
            readsSinceSend = 0;
            if (pathname === "/app") {
              const chatId = options.turns?.[page.sent.length - 1]?.chatId ?? CHAT_ID;
              pathname = `/app/${chatId.replace(/^c_/, "")}`;
            }
          }
          return true;
        case "running":
          return runningPolls-- > 0;
        case "read": {
          if (options.readStatus) throw new Error(`Gemini chat read failed: HTTP ${options.readStatus}`);
          // Before the send, a continued chat shows its earlier turn.
          if (!turnSent) return page.sent.length > 0 ? turnBody(page.sent.length - 1) : UNSTORED_READ;
          readsSinceSend += 1;
          if (readsSinceSend <= (options.unstoredReads ?? 0)) return UNSTORED_READ;
          if (readsSinceSend === (options.unstoredReads ?? 0) + 1) return turnBody(page.sent.length - 1);
          videoReads += 1;
          return videoReads <= (options.pendingReads ?? 0) || options.videoReady === false
            ? chatRead("I'm generating your video.", null)
            : chatRead("Your video is ready!\n\nhttp://googleusercontent.com/generated_video_content/261", VIDEO_URL);
        }
        default:
          return true;
      }
    }
  };
  setGeminiWebTab(tab);
  return page;
}

async function collect(stream: AsyncGenerator<ProviderStreamItem>): Promise<ProviderStreamItem[]> {
  const items: ProviderStreamItem[] = [];
  for await (const item of stream) items.push(item);
  return items;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  setGeminiWebTab(null);
  vi.useRealTimers();
});

describe("parseChatTurn", () => {
  it("reads the ids, the text and the generated image of the newest turn", () => {
    expect(parseChatTurn(turnRead("Here you go.\n\nhttp://googleusercontent.com/image_generation_content/0_751\n\n", { images: [IMAGE_URL] }))).toEqual({
      conversationId: CHAT_ID,
      turnId: "r_11cae6b8f4a66a05",
      text: "Here you go.",
      images: [IMAGE_URL],
      videoPending: false
    });
  });

  it("returns no images for a text-only reply", () => {
    expect(parseChatTurn(turnRead("I can't create that image."))).toMatchObject({ text: "I can't create that image.", images: [] });
  });

  it("marks a turn that started the video tool", () => {
    expect(parseChatTurn(turnRead("I'm generating your video.", { video: true }))).toMatchObject({ videoPending: true, images: [] });
  });

  it("marks a turn whose text holds a video placeholder", () => {
    expect(parseChatTurn(turnRead("Here it is.\n\nhttp://googleusercontent.com/generated_video_content/261"))).toMatchObject({ videoPending: true, text: "Here it is." });
  });

  it("returns no turn for a chat Gemini has not stored yet", () => {
    expect(parseChatTurn(UNSTORED_READ)).toEqual({ conversationId: null, turnId: null, text: "", images: [], videoPending: false });
  });
});

describe("findGeneratedVideo", () => {
  it("returns the file URL of a finished video, not its thumbnails", () => {
    expect(findGeneratedVideo(chatRead("Your video is ready!\n\nhttp://googleusercontent.com/generated_video_content/261", VIDEO_URL))).toEqual({
      url: VIDEO_URL,
      text: "Your video is ready!"
    });
  });

  it("returns no URL while the video renders", () => {
    expect(findGeneratedVideo(chatRead("I'm generating your video.", null))).toEqual({ url: null, text: "I'm generating your video." });
  });
});

describe("GeminiWebProvider", () => {
  it("does not navigate or submit a pre-cancelled request", async () => {
    const page = fakeTab();
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    await expect(new GeminiWebProvider().generateMessage({ model: "auto", messages: [{ role: "user", content: "hi" }], signal: controller.signal })).rejects.toThrow("cancelled");
    expect(page.navigations).toEqual([]);
    expect(page.sent).toEqual([]);
  });

  it("lists models without touching the tab", async () => {
    const untouched = () => { throw new Error("listing must not reach the tab"); };
    setGeminiWebTab({ evaluate: untouched, navigate: untouched, download: untouched });
    const provider = new GeminiWebProvider();
    // Before any call has read the picker, the known modes are listed.
    expect((await provider.getAvailableLanguageModels()).map((m) => m.id)).toEqual(["auto", "8c46e95b1a07cecc", "56fdd199312815e2", "e6fa609c3fa255c0", "95a4c0abcba24364"]);
    expect(await provider.getAvailableImageModels()).toMatchObject([
      { id: "gemini-web-image", supportedTasks: ["text_to_image", "image_to_image"] },
      { id: "gemini-web-image:8c46e95b1a07cecc", name: "Gemini Images (3.5 Flash-Lite)" },
      { id: "gemini-web-image:56fdd199312815e2", name: "Gemini Images (3.8 Flash)" },
      { id: "gemini-web-image:e6fa609c3fa255c0", name: "Gemini Images (3.1 Pro)" },
      { id: "gemini-web-image:95a4c0abcba24364", name: "Gemini Images (4 Argon)" }
    ]);
    expect(await provider.getAvailableVideoModels()).toMatchObject([{ id: "gemini-web-video", aspectRatios: ["16:9", "9:16"] }]);
    expect(provider.getCapabilities()).toEqual(expect.arrayContaining(["generate_message", "text_to_image", "image_to_image", "text_to_video", "image_to_video"]));
  });

  it("generates an image in a new chat and downloads it at full size", async () => {
    const page = fakeTab();
    const pending = new GeminiWebProvider().textToImage({ model: IMAGE_MODEL, prompt: "A lighthouse at sunrise", aspectRatio: "1:1" });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toEqual(JPEG);
    expect(page.navigations).toEqual(["https://gemini.google.com/app"]);
    expect(page.sent).toHaveLength(1);
    expect(page.sent[0]).toContain("A lighthouse at sunrise");
    expect(page.sent[0]).toContain("Aspect ratio: 1:1.");
    expect(page.downloads).toEqual([`${IMAGE_URL}=s0-d-I`]);
  });

  it("generates an image in the mode the image model names", async () => {
    const page = fakeTab();
    const pending = new GeminiWebProvider().textToImage({ model: { id: "gemini-web-image:e6fa609c3fa255c0", provider: "gemini_web" } as never, prompt: "x" });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toEqual(JPEG);
    expect(page.modePicked).toBe("e6fa609c3fa255c0");
    expect(page.scripts.indexOf("modes")).toBeLessThan(page.scripts.indexOf("send"));
  });

  it("keeps the current mode for the plain image model", async () => {
    const page = fakeTab();
    const pending = new GeminiWebProvider().textToImage({ model: IMAGE_MODEL, prompt: "x" });
    await vi.advanceTimersByTimeAsync(10_000);
    await pending;
    expect(page.scripts).not.toContain("modes");
  });

  it("pastes the source images for an edit", async () => {
    const page = fakeTab();
    const pending = new GeminiWebProvider().imageToImage([PNG, PNG], { model: IMAGE_MODEL, prompt: "Make it night" });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toEqual(JPEG);
    expect(page.attached).toBe(2);
    expect(page.sent[0]).toContain("Make it night");
  });

  it("pastes again when the page drops the first paste", async () => {
    const page = fakeTab({ lostPastes: 2 });
    const pending = new GeminiWebProvider().imageToImage([PNG], { model: IMAGE_MODEL, prompt: "Make it night" });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await pending).toEqual(JPEG);
    expect(page.scripts.filter((op) => op === "attach")).toHaveLength(3);
    expect(page.attached).toBe(1);
  });

  it("fails when no paste shows a preview", async () => {
    fakeTab({ lostPastes: 99 });
    const pending = new GeminiWebProvider().imageToImage([PNG], { model: IMAGE_MODEL, prompt: "Make it night" });
    const outcome = expect(pending).rejects.toThrow(/no attachment preview/);
    await vi.advanceTimersByTimeAsync(30_000);
    await outcome;
  });

  it("reloads and sends once more when a click starts no request", async () => {
    const page = fakeTab({ unsentClicks: 1 });
    const pending = new GeminiWebProvider().textToImage({ model: IMAGE_MODEL, prompt: "x" });
    // The unsent click is detected after a 10 s poll for the request.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await pending).toEqual(JPEG);
    // The reload drops the pending click, so only the retried send counts.
    expect(page.navigations).toEqual(["https://gemini.google.com/app", "https://gemini.google.com/app"]);
    expect(page.sent).toHaveLength(1);
  });

  it("waits from Node and never on a timer inside the page", async () => {
    // Chrome throttles a hidden page's chained timers to one wake-up a minute.
    const page = fakeTab({ turns: [{ text: "I'm generating your video.", video: true }] });
    const pending = new GeminiWebProvider().textToVideo({ model: VIDEO_MODEL, prompt: "x", aspectRatio: "9:16" });
    await vi.advanceTimersByTimeAsync(60_000);
    await pending;
    expect(page.expressions.length).toBeGreaterThan(0);
    expect(page.expressions.filter((e) => e.includes("setTimeout"))).toEqual([]);
  });

  it("gives up after a second send that starts no request", async () => {
    fakeTab({ unsentClicks: 2 });
    const pending = new GeminiWebProvider().textToImage({ model: IMAGE_MODEL, prompt: "x" });
    const settled = expect(pending).rejects.toThrow("Gemini did not send the message from the background tab");
    await vi.advanceTimersByTimeAsync(30_000);
    await settled;
  });

  it("reports Gemini's reply and the chat link when no image comes back", async () => {
    fakeTab({ turns: [{ text: "I can't create images of that." }] });
    const pending = new GeminiWebProvider().textToImage({ model: IMAGE_MODEL, prompt: "x" });
    const settled = expect(pending).rejects.toThrow("Gemini finished without an image: I can't create images of that.. The chat is https://gemini.google.com/app/96c609d97426c188");
    await vi.advanceTimersByTimeAsync(10_000);
    await settled;
  });

  it("refuses a signed-out tab before it sends", async () => {
    const page = fakeTab({ signedIn: false });
    const pending = new GeminiWebProvider().textToImage({ model: IMAGE_MODEL, prompt: "x" });
    const settled = expect(pending).rejects.toThrow("Gemini is not signed in");
    await vi.advanceTimersByTimeAsync(10_000);
    await settled;
    expect(page.sent).toEqual([]);
  });

  it("fails when the chat read keeps failing", async () => {
    fakeTab({ readStatus: 429 });
    const pending = new GeminiWebProvider().textToImage({ model: IMAGE_MODEL, prompt: "x" });
    const settled = expect(pending).rejects.toThrow("Gemini chat read failed: HTTP 429");
    await vi.advanceTimersByTimeAsync(20_000);
    await settled;
  });

  it("reads the reply once Gemini has stored the turn", async () => {
    const page = fakeTab({ unstoredReads: 2, turns: [{ text: "Bananas are berries." }] });
    const pending = new GeminiWebProvider().generateMessage({ model: "auto", messages: [{ role: "user", content: "Tell me about bananas." }] });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toEqual({ role: "assistant", content: "Bananas are berries." });
    expect(page.scripts.filter((op) => op === "read")).toHaveLength(3);
  });

  it("returns the tool calls of a reply when the turn offers tools", async () => {
    fakeTab({ turns: [{ text: '<tool_call>{"name": "get_weather", "arguments": {"city": "Paris"}}</tool_call>' }] });
    const pending = new GeminiWebProvider().generateMessage({
      model: "auto",
      messages: [{ role: "user", content: "Weather in Paris?" }],
      tools: [{ name: "get_weather", inputSchema: { type: "object" } }]
    });
    await vi.advanceTimersByTimeAsync(10_000);
    const message = await pending;
    expect(message.content).toBe("");
    expect(message.toolCalls).toMatchObject([{ name: "get_weather", args: { city: "Paris" } }]);
  });

  it("fails with the chat link when the turn ends but the chat shows no reply", async () => {
    fakeTab({ unstoredReads: 999 });
    const pending = new GeminiWebProvider().generateMessage({ model: "auto", messages: [{ role: "user", content: "hi" }] });
    const settled = expect(pending).rejects.toThrow("Gemini ended the turn, but its chat shows no reply. The chat is https://gemini.google.com/app/96c609d97426c188");
    await vi.advanceTimersByTimeAsync(40_000);
    await settled;
  });

  it("generates a video with the video tool and waits for it in the chat", async () => {
    const page = fakeTab({ turns: [{ text: "I'm generating your video.", video: true }], pendingReads: 2 });
    const pending = new GeminiWebProvider().textToVideo({ model: VIDEO_MODEL, prompt: "A paper boat in the rain", aspectRatio: "9:16" });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await pending).toEqual(MP4);
    expect(page.scripts).toEqual(expect.arrayContaining(["tool-open", "tool-chip", "aspect"]));
    expect(page.scripts.indexOf("aspect")).toBeLessThan(page.scripts.indexOf("send"));
    expect(page.scripts.filter((op) => op === "read")).toHaveLength(4);
    expect(page.downloads).toEqual([VIDEO_URL]);
  });

  it("pastes the start image for an image-to-video", async () => {
    const page = fakeTab({ turns: [{ text: "I'm generating your video.", video: true }] });
    const pending = new GeminiWebProvider().imageToVideo(PNG, { model: VIDEO_MODEL, prompt: "Snow falls" });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await pending).toEqual(MP4);
    expect(page.attached).toBe(1);
    expect(page.sent[0]).toContain("Snow falls");
  });

  it("fails when Gemini answers without starting a video", async () => {
    fakeTab({ turns: [{ text: "You reached your video limit for today." }] });
    const pending = new GeminiWebProvider().textToVideo({ model: VIDEO_MODEL, prompt: "x" });
    const settled = expect(pending).rejects.toThrow("Gemini did not start a video: You reached your video limit for today.");
    await vi.advanceTimersByTimeAsync(10_000);
    await settled;
  });

  it("times out a video that never appears", async () => {
    fakeTab({ turns: [{ text: "I'm generating your video.", video: true }], videoReady: false });
    const pending = new GeminiWebProvider().textToVideo({ model: VIDEO_MODEL, prompt: "x", timeoutSeconds: 60 });
    const settled = expect(pending).rejects.toThrow("Gemini did not finish the video within 60s (last reply: I'm generating your video.)");
    await vi.advanceTimersByTimeAsync(90_000);
    await settled;
  });

  it("chats in a new Gemini chat, then continues it with only the new message", async () => {
    const page = fakeTab({ turns: [{ text: "Noted: 42." }, { text: "42" }] });
    const provider = new GeminiWebProvider();
    const first = [{ role: "user" as const, content: "Remember 42." }];
    const turn1 = collect(provider.generateMessages({ model: "auto", messages: first, threadId: "t1" }));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await turn1).toEqual([
      { type: "session", session: expect.objectContaining({ providerId: "gemini_web", token: CHAT_ID, checkpoint: 1 }) },
      { type: "chunk", content: "Noted: 42.", content_type: "text", done: true }
    ]);
    // The mode picker read during the turn now backs the listing.
    expect((await provider.getAvailableLanguageModels()).map((m) => m.id)).toEqual(["auto", ...MODES.map((m) => m.id)]);
    expect((await provider.getAvailableImageModels()).map((m) => m.id)).toEqual(["gemini-web-image", ...MODES.map((m) => `gemini-web-image:${m.id}`)]);

    const second = [...first, { role: "assistant" as const, content: "Noted: 42." }, { role: "user" as const, content: "Which number?" }];
    const turn2 = collect(provider.generateMessages({ model: "auto", messages: second, threadId: "t1" }));
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await turn2).at(-1)).toEqual({ type: "chunk", content: "42", content_type: "text", done: true });
    expect(page.navigations).toEqual(["https://gemini.google.com/app", "https://gemini.google.com/app/96c609d97426c188"]);
    expect(page.sent).toEqual(["Remember 42.", "Which number?"]);
  });

  it("picks the requested mode before it sends", async () => {
    const page = fakeTab({ turns: [{ text: "hi" }] });
    const pending = new GeminiWebProvider().generateMessage({ model: "e6fa609c3fa255c0", messages: [{ role: "user", content: "hi" }] });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toEqual({ role: "assistant", content: "hi" });
    expect(page.modePicked).toBe("e6fa609c3fa255c0");
  });

  it("rejects a mode the picker does not offer", async () => {
    const page = fakeTab();
    const pending = new GeminiWebProvider().generateMessage({ model: "nope", messages: [{ role: "user", content: "hi" }] });
    const settled = expect(pending).rejects.toThrow("Gemini has no mode nope");
    await vi.advanceTimersByTimeAsync(10_000);
    await settled;
    expect(page.sent).toEqual([]);
  });

  it("loads full history when changed system instructions reject a delta", async () => {
    const page = fakeTab();
    const history = [{ role: "user" as const, content: "Remember 42" }, { role: "assistant" as const, content: "Noted" }, { role: "user" as const, content: "Which number?" }];
    const load = vi.fn().mockResolvedValue(history);
    const pending = new GeminiWebProvider().generateMessage({ model: "auto", messages: [{ role: "system", content: "New rules" }, { role: "user", content: "Which number?" }], providerSession: { providerId: "gemini_web", model: "auto", token: CHAT_ID, checkpoint: 1, systemHash: "stale" }, loadFullHistory: load });
    await vi.advanceTimersByTimeAsync(5_000);
    await pending;
    expect(load).toHaveBeenCalledOnce();
    expect(page.sent[0]).toContain("Remember 42");
  });

  it("starts a new chat with the whole conversation when the old one is gone", async () => {
    const page = fakeTab({ goneChats: [CHAT_ID], turns: [{ text: "42", chatId: "c_1111111111111111" }] });
    const provider = new GeminiWebProvider();
    const messages = [
      { role: "user" as const, content: "Remember 42." },
      { role: "assistant" as const, content: "Noted." },
      { role: "user" as const, content: "Which number?" }
    ];
    const prior = { providerId: "gemini_web", model: "auto", token: CHAT_ID, checkpoint: 1, systemHash: null };
    const pending = collect(provider.generateMessages({ model: "auto", messages, threadId: "t1", providerSession: prior }));
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await pending)[0]).toEqual({ type: "session", session: expect.objectContaining({ token: "c_1111111111111111", checkpoint: 3 }) });
    expect(page.sent).toHaveLength(1);
    expect(page.sent[0]).toContain("Conversation so far:");
  });
});
