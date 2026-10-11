import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatGPTProvider, composeDelta, composePrompt, setChatGPTTab } from "../../src/providers/chatgpt-provider.js";
import type { ExtensionTab } from "../../src/providers/extension-tab.js";
import type { ProviderStreamItem } from "../../src/providers/types.js";

const CONVERSATION_ID = "6acbd47e-e42c-83eb-a5d0-1400ee225d3d";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

interface PathNode { id: string; role: string; contentType: string; status: string | null; endTurn: boolean | null; text: string; images: string[] }

const node = (role: string, text: string, extra: Partial<PathNode> = {}): PathNode => ({
  id: Math.random().toString(36).slice(2), role, contentType: "text", status: "finished_successfully", endTurn: null, text, images: [], ...extra
});

interface FakePage {
  navigations: string[];
  sent: string[];
  attached: number;
  staged: string[];
  scripts: string[];
}

/**
 * A chatgpt.com tab: the composer is ready, a send moves the URL to the
 * conversation, and each conversation poll returns the next scripted state.
 */
function fakeTab(states: PathNode[][], options: { signedIn?: boolean; models?: Array<{ slug: string; title: string }>; goneThreads?: string[] } = {}): FakePage {
  const page: FakePage = { navigations: [], sent: [], attached: 0, staged: [], scripts: [] };
  let pathname = "/";
  let polls = 0;
  const tab: ExtensionTab = {
    async navigate(url) {
      page.navigations.push(url);
      pathname = new URL(url).pathname;
      // A deleted thread redirects to a new chat.
      if (options.goneThreads?.some((id) => pathname.includes(id))) pathname = "/";
    },
    async evaluate(expression) {
      const op = /\/\*nt:(\w+)\*\//.exec(expression)?.[1] ?? "stage";
      page.scripts.push(op);
      if (options.signedIn === false && op !== "location") {
        if (op === "ready") return false;
        throw new Error("NT_NOT_SIGNED_IN");
      }
      switch (op) {
        case "ready": return true;
        case "send":
          page.sent.push(JSON.parse(/insertText", false, ("(?:[^"\\]|\\.)*")\)/.exec(expression)![1]));
          if (!pathname.startsWith("/c/")) pathname = `/c/${CONVERSATION_ID}`;
          return true;
        case "attach":
          page.attached += JSON.parse(/const files = (\[.*?\]);/s.exec(expression)![1]).length;
          return true;
        case "location": return pathname;
        case "conversation": {
          const path = states[Math.min(polls++, states.length - 1)];
          return { currentNode: path.at(-1)?.id ?? null, path };
        }
        case "download": return Buffer.from(PNG).toString("base64");
        case "models": return options.models ?? [];
        default:
          page.staged.push(expression);
          return true;
      }
    }
  };
  setChatGPTTab(tab);
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
  setChatGPTTab(null);
  vi.useRealTimers();
});

describe("ChatGPTProvider", () => {
  it("lists models without touching the tab", async () => {
    setChatGPTTab({ evaluate: () => { throw new Error("listing must not reach the tab"); }, navigate: () => { throw new Error("listing must not reach the tab"); } });
    const provider = new ChatGPTProvider();
    expect((await provider.getAvailableLanguageModels()).map((m) => m.id)).toEqual(["auto"]);
    expect(await provider.getAvailableImageModels()).toMatchObject([{ id: "chatgpt-image", supportedTasks: ["text_to_image", "image_to_image"] }]);
    expect(provider.getCapabilities()).toEqual(expect.arrayContaining(["generate_message", "text_to_image", "image_to_image"]));
  });

  it("sends a chat turn in a new thread and returns the reply", async () => {
    const page = fakeTab([
      [node("user", "Say pong"), node("assistant", "", { contentType: "reasoning_recap", endTurn: false })],
      [node("user", "Say pong"), node("assistant", "", { contentType: "reasoning_recap", endTurn: false }), node("assistant", "pong", { endTurn: true })]
    ], { models: [{ slug: "gpt-6", title: "GPT-6" }] });
    const provider = new ChatGPTProvider();
    const pending = collect(provider.generateMessages({ model: "gpt-6", messages: [{ role: "user", content: "Say pong" }] }));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toEqual([{ type: "chunk", content: "pong", content_type: "text", done: true }]);
    expect(page.navigations).toEqual(["https://chatgpt.com/?model=gpt-6"]);
    expect(page.sent).toEqual(["Say pong"]);
    // The model picker read during the turn now backs the listing.
    expect((await provider.getAvailableLanguageModels()).map((m) => m.id)).toEqual(["auto", "gpt-6"]);
  });

  it("sends the default model without a model parameter", async () => {
    const page = fakeTab([[node("user", "hi"), node("assistant", "hello", { endTurn: true })]]);
    const pending = new ChatGPTProvider().generateMessage({ model: "auto", messages: [{ role: "user", content: "hi" }] });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await pending).toEqual({ role: "assistant", content: "hello" });
    expect(page.navigations).toEqual(["https://chatgpt.com/"]);
  });

  it("records the thread as the provider session", async () => {
    fakeTab([[node("user", "hi"), node("assistant", "hello", { endTurn: true })]]);
    const pending = collect(new ChatGPTProvider().generateMessages({ model: "auto", threadId: "t1", messages: [{ role: "system", content: "Be brief." }, { role: "user", content: "hi" }] }));
    await vi.advanceTimersByTimeAsync(5_000);
    const items = await pending;
    expect(items[0]).toMatchObject({ type: "session", session: { providerId: "chatgpt", model: "auto", token: CONVERSATION_ID, checkpoint: 2 } });
    expect(items[1]).toMatchObject({ type: "chunk", content: "hello", done: true });
  });

  it("continues the thread and sends only the new messages", async () => {
    const old = [node("user", "hi"), node("assistant", "hello", { endTurn: true })];
    const page = fakeTab([
      old, // read before the send
      old, // the old reply has end_turn too, but it is not the new reply
      [...old, node("user", "and you?"), node("assistant", "fine", { endTurn: true })]
    ]);
    const provider = new ChatGPTProvider();
    const messages = [
      { role: "system" as const, content: "Be brief." },
      { role: "user" as const, content: "hi" },
      { role: "assistant" as const, content: "hello" },
      { role: "user" as const, content: "and you?" }
    ];
    const first = collect(provider.generateMessages({ model: "auto", threadId: "t1", messages: messages.slice(0, 2) }));
    await vi.advanceTimersByTimeAsync(5_000);
    const [sessionItem] = await first;
    page.navigations.length = 0;
    page.sent.length = 0;
    const session = (sessionItem as { session: { token: string; checkpoint: number } }).session;

    const second = collect(provider.generateMessages({ model: "auto", threadId: "t1", messages, providerSession: session as never }));
    await vi.advanceTimersByTimeAsync(10_000);
    const items = await second;
    expect(page.navigations).toEqual([`https://chatgpt.com/c/${CONVERSATION_ID}`]);
    expect(page.sent).toEqual(["and you?"]);
    expect(items.at(-1)).toMatchObject({ content: "fine", done: true });
    expect(items[0]).toMatchObject({ type: "session", session: { token: CONVERSATION_ID, checkpoint: 4 } });
  });

  it("continues a thread from its in-process cache when no session is passed", async () => {
    const old = [node("user", "hi"), node("assistant", "hello", { endTurn: true })];
    const page = fakeTab([old, old, [...old, node("user", "again"), node("assistant", "again to you", { endTurn: true })]]);
    const provider = new ChatGPTProvider();
    const first = provider.generateMessage({ model: "auto", threadId: "t2", messages: [{ role: "user", content: "hi" }] });
    await vi.advanceTimersByTimeAsync(5_000);
    await first;
    page.navigations.length = 0;
    const second = provider.generateMessage({ model: "auto", threadId: "t2", messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }, { role: "user", content: "again" }] });
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await second).content).toBe("again to you");
    expect(page.navigations).toEqual([`https://chatgpt.com/c/${CONVERSATION_ID}`]);
  });

  it("starts a new thread with the whole conversation when the old one is gone", async () => {
    const gone = "11111111-2222-3333-4444-555555555555";
    const page = fakeTab([[node("user", "x"), node("assistant", "fresh", { endTurn: true })]], { goneThreads: [gone] });
    const messages = [{ role: "user" as const, content: "hi" }, { role: "assistant" as const, content: "hello" }, { role: "user" as const, content: "and you?" }];
    const pending = new ChatGPTProvider().generateMessage({ model: "auto", messages, providerSession: { providerId: "chatgpt", model: "auto", token: gone, checkpoint: 2 } });
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await pending).content).toBe("fresh");
    expect(page.navigations).toEqual([`https://chatgpt.com/c/${gone}`, "https://chatgpt.com/"]);
    expect(page.sent).toEqual([composePrompt(messages)]);
  });

  it("starts a new thread when the system prompt changed", async () => {
    const page = fakeTab([[node("user", "x"), node("assistant", "ok", { endTurn: true })]]);
    const pending = new ChatGPTProvider().generateMessage({
      model: "auto",
      messages: [{ role: "system", content: "New rules." }, { role: "user", content: "hi" }, { role: "assistant", content: "hello" }, { role: "user", content: "next" }],
      providerSession: { providerId: "chatgpt", model: "auto", token: CONVERSATION_ID, checkpoint: 2, systemHash: "stale" }
    });
    await vi.advanceTimersByTimeAsync(5_000);
    await pending;
    expect(page.navigations).toEqual(["https://chatgpt.com/"]);
  });

  it("attaches the last user message's images", async () => {
    const page = fakeTab([[node("user", "what is this"), node("assistant", "an apple", { endTurn: true })]]);
    const pending = new ChatGPTProvider().generateMessage({
      model: "auto",
      messages: [{ role: "user", content: [{ type: "text", text: "what is this" }, { type: "image_url", image: { data: PNG, mimeType: "image/png" } }] }]
    });
    await vi.advanceTimersByTimeAsync(5_000);
    expect((await pending).content).toBe("an apple");
    expect(page.attached).toBe(1);
    expect(page.staged.join("")).toContain(Buffer.from(PNG).toString("base64"));
  });

  it("generates an image in a regular chat and downloads it in the tab", async () => {
    const pointer = "sediment://file_00000000c4d881f49d1158f180ed57d9";
    const page = fakeTab([
      [node("user", "x"), node("assistant", "", { contentType: "thoughts", status: "in_progress", endTurn: false })],
      [node("user", "x"), node("tool", "", { contentType: "multimodal_text", images: [pointer] }), node("assistant", "", { endTurn: true })]
    ]);
    const pending = new ChatGPTProvider().textToImage({ model: { id: "chatgpt-image", name: "ChatGPT Images", provider: "chatgpt" }, prompt: "a red apple", aspectRatio: "3:2" });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(Array.from(await pending)).toEqual(Array.from(PNG));
    expect(page.navigations).toEqual(["https://chatgpt.com/"]);
    expect(page.sent[0]).toContain("a red apple");
    expect(page.sent[0]).toContain("Aspect ratio: 3:2.");
    expect(page.scripts).toContain("download");
  });

  it("reports a turn that ends without an image", async () => {
    fakeTab([[node("user", "x"), node("assistant", "I can't create that image.", { endTurn: true })]]);
    const pending = new ChatGPTProvider().textToImage({ model: { id: "chatgpt-image", name: "ChatGPT Images", provider: "chatgpt" }, prompt: "x" });
    const settled = expect(pending).rejects.toThrow(/without an image: I can't create that image\..*chatgpt\.com\/c\//);
    await vi.advanceTimersByTimeAsync(5_000);
    await settled;
  });

  it("explains a signed-out tab", async () => {
    fakeTab([], { signedIn: false });
    const pending = new ChatGPTProvider().generateMessage({ model: "auto", messages: [{ role: "user", content: "hi" }] });
    const settled = expect(pending).rejects.toThrow("ChatGPT is not signed in");
    await vi.advanceTimersByTimeAsync(30_000);
    await settled;
  });

  it("runs concurrent calls one after the other on the one tab", async () => {
    const page = fakeTab([[node("user", "x"), node("assistant", "done", { endTurn: true })]]);
    const provider = new ChatGPTProvider();
    const first = provider.generateMessage({ model: "auto", messages: [{ role: "user", content: "one" }] });
    const second = provider.generateMessage({ model: "auto", messages: [{ role: "user", content: "two" }] });
    await vi.advanceTimersByTimeAsync(10_000);
    await Promise.all([first, second]);
    const order = page.scripts.filter((op) => op === "send" || op === "conversation");
    // The second send only starts after the first turn's poll finished.
    expect(order.indexOf("send", 1)).toBeGreaterThan(order.indexOf("conversation"));
    expect(page.sent).toEqual(["one", "two"]);
  });
});

describe("composeDelta", () => {
  it("sends a lone new user message as it is and skips ChatGPT's own reply", () => {
    expect(composeDelta([{ role: "assistant", content: "hello" }, { role: "user", content: "and you?" }])).toBe("and you?");
  });
});

describe("composePrompt", () => {
  it("sends a lone user message as it is", () => {
    expect(composePrompt([{ role: "user", content: "hello" }])).toBe("hello");
  });

  it("turns a system prompt and earlier turns into a transcript", () => {
    const prompt = composePrompt([
      { role: "system", content: "Be brief." },
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello." },
      { role: "user", content: "Name a color." }
    ]);
    expect(prompt).toBe("Instructions:\nBe brief.\n\nConversation so far:\nUser: Hi\n\nAssistant: Hello.\n\nUser: Name a color.\n\nReply to the last User message.");
  });
});
