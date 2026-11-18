/**
 * The prompt-cache invariants of a chat thread (PROMPT-DIET.md, I1–I4).
 *
 * llama.cpp and Ollama reuse their KV cache only for an identical token
 * prefix, so these tests compare what the provider is handed byte for byte:
 *
 * - I1: the system message and the provider tool list are the same for every
 *   turn and for every focus type the web client sends.
 * - I2: each request's messages are a prefix of the next request's, across
 *   tool rounds and across user turns.
 * - I3: a turn re-sends a turn-scoped block (what the user is looking at, the
 *   focused tools, memory) only when it changed since the thread last sent it.
 * - I4: after a compaction, I1–I3 hold again.
 *
 * Every turn runs through the real `ChatTurnHandler` and the real
 * `BaseProvider.generateLoop`; only the model's replies are scripted.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { initTestDb, Memory, Message } from "@nodetool-ai/models";
import { BaseProvider } from "@nodetool-ai/runtime";
import { turnContextDelta } from "../src/session/chat-history.js";
import {
  borrowedLoopBudgetMembers,
  makeChatTurnHarness
} from "./chat-turn-test-harness.js";

interface WireMessage {
  role: string;
  content: unknown;
  toolCallId: string | null;
  toolCalls: Array<{ id: string; name: string; args: unknown }> | null;
}

interface WireRequest {
  messages: WireMessage[];
  tools: Array<{ name: string; description: unknown; inputSchema: unknown }>;
}

/** One scripted model reply: a tool call, or the text that ends the turn. */
type Reply =
  | { tool: string; args: Record<string, unknown> }
  | { text: string };

/** The fields a provider adapter serializes, in a fixed key order. */
function wireMessage(m: Record<string, unknown>): WireMessage {
  const calls = Array.isArray(m.toolCalls)
    ? (m.toolCalls as Array<Record<string, unknown>>).map((c) => ({
        id: String(c.id),
        name: String(c.name),
        args: c.args
      }))
    : null;
  return {
    role: String(m.role),
    content: m.content ?? null,
    toolCallId: typeof m.toolCallId === "string" ? m.toolCallId : null,
    toolCalls: calls && calls.length > 0 ? calls : null
  };
}

const bytes = (value: unknown): string => JSON.stringify(value);

/**
 * A model double that records every request and answers from `script`. The
 * script is consumed across turns, so one array describes a whole thread.
 */
function recordingProvider(script: Reply[]) {
  const requests: WireRequest[] = [];
  let next = 0;
  let callSeq = 0;
  const provider = {
    provider: "mock",
    cost: 0,
    setMessageEmitter: () => {},
    async *generateMessagesTraced(opts: {
      messages: Array<Record<string, unknown>>;
      tools?: Array<Record<string, unknown>>;
    }) {
      requests.push({
        // The loop mutates the array it passes, so copy it now.
        messages: JSON.parse(bytes(opts.messages.map(wireMessage))),
        tools: JSON.parse(
          bytes(
            (opts.tools ?? []).map((t) => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema
            }))
          )
        )
      });
      const reply = script[next++] ?? { text: "ok" };
      if ("tool" in reply) {
        yield { id: `call_${++callSeq}`, name: reply.tool, args: reply.args };
        return;
      }
      yield { type: "chunk" as const, content: reply.text, done: true };
    },
    async generateMessageTraced() {
      return { role: "assistant", content: "Earlier: the user drew a fox." };
    },
    hasToolSupport: async () => true,
    getContainerEnv: () => ({}),
    generateLoop: BaseProvider.prototype.generateLoop,
    ...borrowedLoopBudgetMembers
  };
  return { provider, requests };
}

/** Client tools a connected browser registers, for several surfaces. */
const CLIENT_TOOLS: Record<string, Record<string, unknown>> = Object.fromEntries(
  [
    ...["sketch", "timeline", "storyboard", "script", "svg", "audio", "app"].flatMap(
      (type) =>
        Array.from({ length: 6 }, (_, i) => `ui_${type}_op${i}`)
    ),
    "ui_app_run_get_state",
    "ui_app_run_show_step",
    "ui_app_run_set_inputs",
    "ui_app_run_operation",
    "ui_app_run_cancel",
    "ui_get_graph",
    "ui_apply_graph_patch",
    "ui_open_document"
  ].map((name) => [
    name,
    {
      name,
      description: `Run ${name}.`,
      parameters: {
        type: "object",
        properties: { document_id: { type: "string" } }
      }
    }
  ])
);

interface TurnOptions {
  uiContext?: Record<string, unknown>;
  systemPrompt?: string;
  permissionMode?: "default" | "auto" | "plan";
}

/** A thread: run turns against one handler and one recorded model. */
function thread(threadId: string, script: Reply[] = []) {
  const { provider, requests } = recordingProvider(script);
  const harness = makeChatTurnHarness({
    session: { resolveProvider: async () => provider as never },
    deps: { clientTools: () => CLIENT_TOOLS }
  });
  const turn = async (content: string, opts: TurnOptions = {}) => {
    const before = requests.length;
    await harness.handler.handleChatMessage({
      thread_id: threadId,
      content,
      provider: "mock",
      model: "m",
      permission_mode: opts.permissionMode ?? "auto",
      ...(opts.uiContext ? { ui_context: opts.uiContext } : {}),
      ...(opts.systemPrompt ? { system_prompt: opts.systemPrompt } : {})
    });
    return requests.slice(before);
  };
  return { turn, requests };
}

const textOf = (m: WireMessage): string =>
  typeof m.content === "string"
    ? m.content
    : Array.isArray(m.content)
      ? m.content
          .map((p) =>
            typeof p === "object" && p !== null && "text" in p
              ? String((p as { text: unknown }).text)
              : ""
          )
          .join("\n")
      : "";

const lastUser = (r: WireRequest): WireMessage => {
  const users = r.messages.filter((m) => m.role === "user");
  return users[users.length - 1];
};

/** The first index at which `a` is not a prefix of `b`, or -1. */
function prefixBreak(a: WireMessage[], b: WireMessage[]): number {
  for (let i = 0; i < a.length; i++) {
    if (i >= b.length || bytes(a[i]) !== bytes(b[i])) return i;
  }
  return -1;
}

const sketchFocus = (layer: string) => ({
  source: "sketch_assistant",
  focused: { type: "sketch", id: "sk-1", title: "Fox" },
  open: [{ type: "sketch", id: "sk-1", title: "Fox" }],
  selection: { layer_ids: [layer] }
});

const timelineFocus = {
  source: "timeline_assistant",
  focused: { type: "timeline", id: "tl-1", title: "Cut" },
  open: [{ type: "timeline", id: "tl-1", title: "Cut" }]
};

/** What each surface of the web client sends with a chat message. */
const FOCUS_TYPES: Record<string, TurnOptions> = {
  none: { uiContext: { source: "workspace_chat" } },
  workflow: {
    uiContext: {
      source: "workflow_canvas",
      focused: { type: "workflow", id: "wf-1", title: "Flow" }
    }
  },
  app: {
    uiContext: { source: "app_builder", focused: { type: "app", id: "ap-1" } },
    systemPrompt: "You build the app UI with the app tools."
  },
  app_run: {
    uiContext: { source: "app_run", focused: { type: "app_run", id: "ar-1" } },
    systemPrompt: "You are the Recipe Helper app. Ask for the dish first."
  },
  sketch: { uiContext: sketchFocus("layer-1") },
  timeline: { uiContext: timelineFocus },
  storyboard: {
    uiContext: {
      source: "storyboard_assistant",
      focused: { type: "storyboard", id: "sb-1" }
    }
  },
  script: {
    uiContext: { source: "script_assistant", focused: { type: "script", id: "sc-1" } }
  },
  svg: { uiContext: { source: "svg_assistant", focused: { type: "svg", id: "sv-1" } } },
  audio: {
    uiContext: { source: "audio_assistant", focused: { type: "audio", id: "au-1" } }
  },
  model3d: { uiContext: { source: "model3d_assistant" } },
  jsscript: {
    uiContext: {
      source: "jsscript_assistant",
      focused: { type: "jsscript", id: "js-1" }
    },
    systemPrompt: "Write the script's code in the sandbox language."
  }
};

/** A 1x1 PNG, as a `view_image` source. */
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const TODO = {
  tool: "todo_write",
  args: { todos: [{ id: "1", content: "Sketch the fox", status: "pending" }] }
} as const;

describe("chat prompt cache invariants", () => {
  beforeEach(() => {
    initTestDb();
    delete process.env.NODETOOL_CHAT_COMPACTION_TOKENS;
    delete process.env.NODETOOL_CHAT_COMPACTION_KEEP_TURNS;
  });

  it("I1: sends the same system message and tool list for every focus type", async () => {
    const seen: Record<string, WireRequest> = {};
    for (const [type, opts] of Object.entries(FOCUS_TYPES)) {
      // Covered by the exception below.
      if (type === "timeline") continue;
      const [first] = await thread(`t-i1-${type}`).turn("Hello", opts);
      seen[type] = first;
    }
    const base = seen.none;
    const differing = Object.entries(seen)
      .filter(
        ([, r]) =>
          bytes(r.messages[0]) !== bytes(base.messages[0]) ||
          bytes(r.tools) !== bytes(base.tools)
      )
      .map(([type, r]) => ({
        type,
        system: bytes(r.messages[0]) === bytes(base.messages[0]) ? "same" : "differs",
        tools:
          bytes(r.tools) === bytes(base.tools)
            ? "same"
            : r.tools.map((t) => t.name).join(",")
      }));
    expect(differing).toEqual([]);
    expect(base.messages[0].role).toBe("system");
    expect(base.tools.map((t) => t.name)).toContain("execute_code");
  });

  it("I1: keeps the system message and tool list across turns of one thread", async () => {
    // Workspace chat, where the focus follows whatever the user opens: every
    // focus type in turn, in one thread, with the registered client tools
    // fixed as a browser registers them. The permission mode alternates
    // between Default and Auto, whose rules are turn context too.
    const t = thread("t-i1-turns");
    const results: WireRequest[] = [];
    const types = [...Object.keys(FOCUS_TYPES).filter((type) => type !== "none"), "none"];
    for (const [i, type] of types.entries()) {
      const { focused, open, selection } = (FOCUS_TYPES[type].uiContext ?? {}) as Record<
        string,
        unknown
      >;
      const [first] = await t.turn(`Now the ${type}`, {
        uiContext: { source: "workspace_chat", focused, open, selection },
        systemPrompt: FOCUS_TYPES[type].systemPrompt,
        permissionMode: i % 2 === 0 ? "default" : "auto"
      });
      results.push(first);
    }
    expect(results).toHaveLength(12);
    const [first, ...later] = results;
    const differing = later
      .map((r, i) => ({
        type: types[i + 1],
        system: bytes(r.messages[0]) === bytes(first.messages[0]),
        tools: bytes(r.tools) === bytes(first.tools)
      }))
      .filter((r) => !r.system || !r.tools);
    expect(differing).toEqual([]);
  });

  it("I1: a permission mode switch changes a turn block, not the prefix", async () => {
    const t = thread("t-i1-mode");
    const [defaulted] = await t.turn("Hello", { permissionMode: "default" });
    const [auto] = await t.turn("Go ahead", { permissionMode: "auto" });
    const [again] = await t.turn("More", { permissionMode: "auto" });
    expect(bytes(auto.messages[0])).toBe(bytes(defaulted.messages[0]));
    expect(bytes(auto.tools)).toBe(bytes(defaulted.tools));
    expect(textOf(defaulted.messages[0])).not.toContain("Permission mode");
    expect(textOf(lastUser(defaulted))).toContain("# Permission mode: DEFAULT");
    expect(textOf(lastUser(auto))).toContain("# Permission mode: AUTO");
    expect(textOf(lastUser(again))).toBe("More");
    expect(prefixBreak(defaulted.messages, auto.messages)).toBe(-1);
  });

  it("I1 exception: the timeline assistant's restricted belt has its own prefix", async () => {
    // `timeline_assistant` limits the server tools (surfaceServerTools) so the
    // native editor's server can ship without the media libraries. The tools
    // it cannot call are not listed, so its system message and tool list
    // differ from every other surface. The source is fixed for a thread, so
    // the prefix is still stable across that thread's turns.
    const t = thread("t-i1-timeline");
    const [first] = await t.turn("Hello", FOCUS_TYPES.timeline);
    const [second] = await t.turn("Again", FOCUS_TYPES.timeline);
    const [plain] = await thread("t-i1-plain").turn("Hello", FOCUS_TYPES.none);
    expect(bytes(second.messages[0])).toBe(bytes(first.messages[0]));
    expect(bytes(second.tools)).toBe(bytes(first.tools));
    expect(bytes(first.tools)).not.toBe(bytes(plain.tools));
  });

  it("I1: keeps the chat app's step tool direct on every turn, the rest as imports", async () => {
    const [plain] = await thread("t-app-plain").turn("Hello", FOCUS_TYPES.none);
    const [app] = await thread("t-app-run").turn("Hello", FOCUS_TYPES.app_run);
    const names = plain.tools.map((t) => t.name);
    expect(names).toContain("ui_app_run_show_step");
    expect(names).not.toContain("ui_app_run_get_state");
    const tail = textOf(lastUser(app));
    expect(tail).toContain("ui_app_run_get_state");
    expect(tail).toContain("Recipe Helper");
  });

  it("I1 exception: plan mode swaps create_plan for execute_plan", async () => {
    // Plan mode is a mode of the thread, not a focus. Its rules ride in the
    // turn context like every mode's, but `create_plan` is the turn's
    // deliverable, so it is offered directly in place of `execute_plan`.
    // Entering or leaving plan mode costs one prefix rebuild.
    const [auto] = await thread("t-plan-a").turn("Hello");
    const [plan] = await thread("t-plan-p").turn("Hello", { permissionMode: "plan" });
    const names = (r: WireRequest) => r.tools.map((t) => t.name);
    expect(names(auto)).toContain("execute_plan");
    expect(names(auto)).not.toContain("create_plan");
    expect(names(plan)).toContain("create_plan");
    expect(names(plan)).not.toContain("execute_plan");
  });

  it("I2: each request is a prefix of the next across tool rounds and user turns", async () => {
    const t = thread("t-i2", [
      TODO,
      { text: "Planned." },
      TODO,
      { text: "Updated." },
      { text: "Done." }
    ]);
    // Workspace chat: the source stays, the focus and selection move.
    const workspace = (focus: Record<string, unknown>): TurnOptions => ({
      uiContext: { ...focus, source: "workspace_chat" }
    });
    await t.turn("Draw a fox", workspace(sketchFocus("layer-1")));
    await Memory.create<Memory>({
      user_id: "1",
      thread_id: "t-i2",
      kind: "fact",
      title: "",
      content: "The fox is orange."
    });
    await t.turn("Make it bigger", workspace(sketchFocus("layer-2")));
    await t.turn("Now the cut", workspace(timelineFocus));

    expect(t.requests.length).toBe(5);
    const breaks = t.requests.slice(1).map((r, i) => ({
      request: i + 1,
      at: prefixBreak(t.requests[i].messages, r.messages)
    }));
    expect(breaks.filter((b) => b.at >= 0)).toEqual([]);
  });

  it("I2: replays a view_image round as the request that carried the pixels", async () => {
    const t = thread("t-i2-image", [
      { tool: "view_image", args: { image_id: PIXEL } },
      { text: "A red dot." },
      { text: "Still red." }
    ]);
    const [, looked] = await t.turn("What is in this image?");
    // The round after the call carries the pixels in a user message.
    const imageIndex = looked.messages.findIndex(
      (m, i) => m.role === "user" && i > 0 && looked.messages[i - 1].role === "tool"
    );
    expect(imageIndex).toBeGreaterThan(0);
    expect(bytes(looked.messages[imageIndex].content)).toContain("image_url");

    const [next] = await t.turn("And now?");
    expect(prefixBreak(looked.messages, next.messages)).toBe(-1);

    // The client is not sent the image message, and the stored row keeps
    // uris, never bytes.
    const [rows] = await Message.paginate("t-i2-image", { limit: 20 });
    const toolRow = rows.find((m) => m.role === "tool");
    const stored = (toolRow?.output_files ?? []) as Array<{
      type: string;
      image?: { uri?: string };
    }>;
    const images = stored.filter((block) => block.type === "image_url");
    expect(images).toHaveLength(1);
    expect(images[0].image?.uri).toMatch(/^\/api\/storage\//);
    expect(rows.filter((m) => m.role === "user")).toHaveLength(2);
  });

  it("I2: the first user message shows only what the user typed", async () => {
    const t = thread("t-i2-ui");
    await t.turn("Draw a fox", FOCUS_TYPES.sketch);
    const [row] = (await Message.paginate("t-i2-ui", { limit: 10 }))[0].filter(
      (m) => m.role === "user"
    );
    expect(row.content).toBe("Draw a fox");
  });

  // The stub tools are not in the usage table, so the turn block names them
  // without a purpose: their names mark the focused-tools block.
  it("I3: re-sends a turn block only when it changed", async () => {
    const t = thread("t-i3");
    const [first] = await t.turn("Draw a fox", FOCUS_TYPES.sketch);
    const [same] = await t.turn("Bigger", FOCUS_TYPES.sketch);
    await Memory.create<Memory>({
      user_id: "1",
      thread_id: "t-i3",
      kind: "decision",
      title: "",
      content: "The user approved a teal palette."
    });
    const [moved] = await t.turn("Now the cut", FOCUS_TYPES.timeline);
    const [stayed] = await t.turn("Trim it", FOCUS_TYPES.timeline);

    expect(textOf(lastUser(first))).toContain("## What the user is looking at");
    expect(textOf(lastUser(first))).toContain("ui_sketch_op3");

    // Nothing changed: the turn carries only what the user typed.
    expect(textOf(lastUser(same))).toBe("Bigger");

    // Focus and memory changed: both are sent, the old blocks stay behind.
    const movedTail = textOf(lastUser(moved));
    expect(movedTail).toContain('timeline sequence "Cut" (id: tl-1)');
    expect(movedTail).toContain("ui_timeline_op3");
    expect(movedTail).toContain("teal palette");
    expect(movedTail).not.toContain("ui_sketch_op3");

    // R5: the earlier focus block stays in history, once, and is not resent.
    expect(textOf(lastUser(stayed))).toBe("Trim it");
    const all = stayed.messages.map(textOf).join("\n");
    expect(all.split("ui_sketch_op3").length - 1).toBe(1);
    expect(all.split("ui_timeline_op3").length - 1).toBe(1);
    expect(all.split("teal palette").length - 1).toBe(1);
  });

  it("I3: a selection change re-sends what the user is looking at, not the guidance", async () => {
    const t = thread("t-i3-selection");
    const [first] = await t.turn("Draw a fox", { uiContext: sketchFocus("layer-1") });
    const [moved] = await t.turn("Bigger", { uiContext: sketchFocus("layer-2") });
    expect(textOf(lastUser(first))).toContain("## Working with the open documents");
    const tail = textOf(lastUser(moved));
    expect(tail).toContain("layer: layer-2");
    expect(tail).not.toContain("## Working with the open documents");
    expect(tail).not.toContain("validate_sketch");
  });

  it("I3: says so once when the focused document closes", () => {
    const ui = (text: string) => [
      { key: "ui", text, cleared: "No document is open." }
    ];
    const sent = new Map([["ui", "Sketch Fox is open."]]);
    expect(turnContextDelta(ui(""), sent)).toEqual([
      { key: "ui", text: "No document is open." }
    ]);
    expect(
      turnContextDelta(ui(""), new Map([["ui", "No document is open."]]))
    ).toEqual([]);
    // A thread that never had a document open says nothing about it.
    expect(turnContextDelta(ui(""), new Map())).toEqual([]);
  });

  it("I4: after a compaction the invariants hold again", async () => {
    const t = thread("t-i4");
    const [first] = await t.turn("Draw a fox", FOCUS_TYPES.sketch);
    await t.turn("Bigger", FOCUS_TYPES.sketch);

    process.env.NODETOOL_CHAT_COMPACTION_TOKENS = "1";
    process.env.NODETOOL_CHAT_COMPACTION_KEEP_TURNS = "1";
    let compacted: WireRequest;
    try {
      [compacted] = await t.turn("Smaller", FOCUS_TYPES.sketch);
    } finally {
      delete process.env.NODETOOL_CHAT_COMPACTION_TOKENS;
      delete process.env.NODETOOL_CHAT_COMPACTION_KEEP_TURNS;
    }
    const [after] = await t.turn("Done?", FOCUS_TYPES.sketch);

    // I1 across the cut.
    expect(bytes(compacted.messages[0])).toBe(bytes(first.messages[0]));
    expect(bytes(compacted.tools)).toBe(bytes(first.tools));
    expect(textOf(compacted.messages[1])).toContain("[Conversation so far]");
    // The cut dropped the earlier blocks, so this turn carries them again.
    expect(textOf(lastUser(compacted))).toContain("ui_sketch_op3");
    // I2 and I3 from the compacted view on.
    expect(prefixBreak(compacted.messages, after.messages)).toBe(-1);
    expect(textOf(lastUser(after))).toBe("Done?");
  });
});
