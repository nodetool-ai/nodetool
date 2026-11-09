import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildChatAppSystemPrompt,
  chatAppLayout,
  chatAppSnapshot,
  createInstanceState,
  formatChatAppEvent,
  isChatApp,
  parseApplicationDocument,
  parseChatAppEvent,
  pickStepItems,
  previewAppValue,
  settledInvocation,
  type ApplicationDocument
} from "../src/index.js";

const ui = (content: unknown[]) => ({ root: { props: { title: "Demo" } }, content });

const doc = (content: unknown[], extra: Partial<ApplicationDocument> = {}): ApplicationDocument => ({
  schemaVersion: 4,
  ui: ui(content),
  operations: [
    { id: "plan", name: "Plan", workflowId: "wf", inputs: {}, outputs: {}, policy: "replace" }
  ],
  resources: [],
  variables: [
    { id: "step", name: "step", type: { type: "str", optional: false, type_args: [] }, scope: "instance", persist: false },
    { id: "title", name: "title", type: { type: "str", optional: false, type_args: [] }, scope: "instance", persist: false }
  ],
  ...extra
});

const stepper = {
  type: "Stepper",
  props: {
    id: "steps",
    binding: "var:step",
    steps: [
      { value: "start", title: "Start" },
      { value: "review", title: "Review" }
    ]
  }
};
const gated = (id: string, step: string) => ({
  type: "Container",
  props: { id, visibleWhen: { binding: "var:step", op: "eq", value: step }, content: [] }
});

describe("chatAppLayout", () => {
  it("splits the top level into steps by the Stepper's gate", () => {
    const layout = chatAppLayout(doc([
      { type: "Heading", props: { id: "title", text: "Demo" } },
      stepper,
      gated("a", "start"),
      gated("b", "review"),
      gated("c", "review"),
      gated("orphan", "nowhere")
    ]));
    expect(layout?.stepVariableId).toBe("step");
    expect(layout?.steps.map((step) => [step.value, step.items.length])).toEqual([
      ["start", 1],
      ["review", 2]
    ]);
    expect(layout?.header).toHaveLength(1);
    // The gate is removed so the card renders whatever the current step is.
    const first = layout?.steps[0]?.items[0] as { props: Record<string, unknown> };
    expect(first.props.visibleWhen).toBeUndefined();
  });

  it("returns null without a Stepper bound to a variable", () => {
    expect(chatAppLayout(doc([gated("a", "start")]))).toBeNull();
    expect(chatAppLayout(doc([{ type: "Stepper", props: { id: "s", binding: "op:x/in:y", steps: [{ value: "a" }] } }]))).toBeNull();
  });

  it("runs in chat only when the document asks for it", () => {
    expect(isChatApp(doc([stepper, gated("a", "start")]))).toBe(false);
    expect(isChatApp(doc([stepper, gated("a", "start")], { presentation: "chat" }))).toBe(true);
    expect(isChatApp(doc([gated("a", "start")], { presentation: "chat" }))).toBe(false);
  });
});

describe("app events", () => {
  it("round-trips through the user turn's text", () => {
    const text = formatChatAppEvent({
      step: "start",
      control: "Next: Review",
      requests: [{ kind: "run", operationId: "plan" }, { kind: "step", step: "review" }],
      changed: ["Title"]
    });
    expect(text.startsWith("[app event] ")).toBe(true);
    const event = parseChatAppEvent(text);
    expect(event).toEqual({
      step: "start",
      control: "Next: Review",
      requests: [{ kind: "run", operationId: "plan" }, { kind: "step", step: "review" }],
      changed: ["Title"]
    });
  });

  it("round-trips a run that settled after its tool call", () => {
    const settled = { operationId: "plan", status: "failed" as const, error: "Brand color is required", step: "ending" };
    const event = parseChatAppEvent(formatChatAppEvent({ control: "Plan", requests: [], settled }));
    expect(event).toEqual({ control: "Plan", requests: [], settled });
    const unknownStatus = formatChatAppEvent({ control: "Plan", requests: [] }).replace("}", ',"settled":{"operationId":"plan","status":"odd"}}');
    expect(parseChatAppEvent(unknownStatus)?.settled).toBeUndefined();
  });

  it("leaves typed text alone", () => {
    expect(parseChatAppEvent("the logo is invisible")).toBeNull();
    expect(parseChatAppEvent("[app event] not json")).toBeNull();
  });
});

describe("the agent's view", () => {
  it("names the steps, operations and the app run id in the prompt", () => {
    const document = doc([
      stepper,
      { type: "Container", props: { id: "a", visibleWhen: { binding: "var:step", op: "eq", value: "start" }, content: [
        { type: "Heading", props: { id: "h", text: "What you will make", subtitle: "A short ad" } },
        { type: "Button", props: { id: "b", label: "Next: Review" } }
      ] } }
    ]);
    const prompt = buildChatAppSystemPrompt(document, chatAppLayout(document)!, { appRunId: "run-1", title: "Demo" });
    expect(prompt).toContain("app_run_id: `run-1`");
    expect(prompt).toContain('1. `start` "Start" — What you will make · A short ad · [button: Next: Review]');
    expect(prompt).toContain('- `plan` "Plan"');
  });

  it("lists the values each step holds and where a missing one lives", () => {
    const document = doc(
      [
        stepper,
        { type: "Container", props: { id: "a", visibleWhen: { binding: "var:step", op: "eq", value: "review" }, content: [
          { type: "TextInput", props: { id: "t", label: "Title", binding: "var:title" } },
          { type: "Button", props: { id: "b", label: "Go", binding: "var:title" } }
        ] } }
      ],
      { recipe: { inputs: [{ id: "title", label: "Title", kind: "text", required: true }] } as unknown as ApplicationDocument["recipe"] }
    );
    const layout = chatAppLayout(document)!;
    expect(layout.steps[1]?.fields).toEqual([{ binding: "var:title", label: "Title" }]);
    expect(buildChatAppSystemPrompt(document, layout, { appRunId: "r", title: "Demo" })).toContain("   Values: title (Title)");
    expect(chatAppSnapshot(document, layout, createInstanceState()).missing_required).toEqual(["title (Title) on step review"]);
  });

  it("reports the step, values and operation status", () => {
    const document = doc([stepper, gated("a", "start")]);
    const state = createInstanceState();
    state.variables.step = "review";
    state.variables.title = "x".repeat(300);
    state.activeInvocation.plan = "job-1";
    state.invocations["job-1"] = { id: "job-1", operationId: "plan", status: "failed", error: "provider down", startedAt: 1 };
    const snapshot = chatAppSnapshot(document, chatAppLayout(document)!, state);
    expect(snapshot.step).toBe("review");
    expect((snapshot.variables.title as string).length).toBe(240);
    expect(snapshot.variables.step).toBeUndefined();
    expect(snapshot.operations).toEqual([{ id: "plan", name: "Plan", status: "failed", error: "provider down" }]);
  });

  it("shows an image by its asset id, not by a resolved display path", () => {
    expect(previewAppValue({ type: "image", uri: "file:///tmp/assets/5f2c.png", asset_id: "abc123" })).toEqual({ type: "image", uri: "asset://abc123" });
    expect(previewAppValue({ type: "image", uri: "https://example.com/p.png" })).toEqual({ type: "image", uri: "https://example.com/p.png" });
  });

  it("finds the settled invocation of a new run through its alias", () => {
    const state = createInstanceState();
    state.activeInvocation.plan = "reservation";
    state.invocationAliases.reservation = "job-2";
    state.invocations["job-2"] = { id: "job-2", operationId: "plan", status: "running", startedAt: 2 };
    expect(settledInvocation(state, "plan", "job-1")).toBeNull();
    state.invocations["job-2"].status = "completed";
    expect(settledInvocation(state, "plan", "job-1")).toEqual({ id: "job-2", status: "completed" });
    expect(settledInvocation(state, "plan", "reservation")).toBeNull();
  });
});

describe("Calm breathing-shape loop", () => {
  it("is a chat app whose agent builds the cut", () => {
    const path = fileURLToPath(new URL("../../base-nodes/nodetool/examples/apps/ad-calm-breathing-shape-loop.app.json", import.meta.url));
    const bundle = JSON.parse(readFileSync(path, "utf8")) as { app: unknown };
    const document = parseApplicationDocument(bundle.app);
    expect(document?.presentation).toBe("chat");
    const layout = chatAppLayout(document!);
    expect(layout?.steps.map((step) => step.value)).toEqual(["start", "shape", "ending", "result"]);
    expect(layout?.steps.every((step) => step.items.length > 0)).toBe(true);
  });
});

describe("chat model and agent tasks", () => {
  const withModel = {
    type: "Container",
    props: {
      id: "a",
      visibleWhen: { binding: "var:step", op: "eq", value: "start" },
      content: [
        { type: "ModelSelect", props: { id: "llm", binding: "var:llm", modelKind: "language_model" } },
        { type: "Text", props: { id: "llm-help", text: "Pick one." } },
        { type: "ModelSelect", props: { id: "img", binding: "var:img", modelKind: "image_model" } },
        { type: "TextInput", props: { id: "title", binding: "var:title", label: "Title" } }
      ]
    }
  };

  it("hides language-model pickers and their help, and keeps other models", () => {
    const layout = chatAppLayout(doc([stepper, withModel]));
    const content = (layout?.steps[0]?.items[0] as { props: { content: { props: { id: string } }[] } }).props.content;
    expect(content.map((item) => item.props.id)).toEqual(["img", "title"]);
  });

  it("tells the agent the model follows the chat and lists its own tasks", () => {
    const document = doc([stepper, withModel], {
      operations: [
        {
          id: "suggest", name: "Suggest", workflowId: "wf", inputs: {}, policy: "replace",
          outputs: { out: { to: "variable", variableId: "title" } },
          agentTask: "Read the site and write a title."
        }
      ]
    });
    const layout = chatAppLayout(document);
    if (!layout) throw new Error("no layout");
    const prompt = buildChatAppSystemPrompt(document, layout, { appRunId: "run", title: "Demo" });
    expect(prompt).toContain("language-model values (llm) follow the model of this chat");
    expect(prompt).toContain("`suggest` \"Suggest\" (your task, see below)");
    expect(prompt).toContain("Writes: title\nRead the site and write a title.");
  });

  it("keeps agentTask when it parses a document", () => {
    const parsed = parseApplicationDocument({
      ...doc([stepper]),
      operations: [{ id: "s", name: "S", workflowId: "wf", inputs: {}, outputs: {}, policy: "replace", agentTask: "Do it." }]
    });
    expect(parsed?.operations[0]?.agentTask).toBe("Do it.");
  });
});

describe("pickStepItems", () => {
  const items = [
    { type: "Heading", props: { id: "h" } },
    { type: "Container", props: { id: "box", content: [
      { type: "Text", props: { id: "t" } },
      { type: "ChoiceCards", props: { id: "pick" } }
    ] } }
  ];

  it("keeps the named widgets and the containers that hold them", () => {
    const picked = pickStepItems(items, ["pick"]) as { props: { id: string; content?: { props: { id: string } }[] } }[];
    expect(picked.map((item) => item.props.id)).toEqual(["box"]);
    expect(picked[0]?.props.content?.map((item) => item.props.id)).toEqual(["pick"]);
  });

  it("shows the whole step when no id matches", () => {
    expect(pickStepItems(items, ["nope"])).toBe(items);
  });
});
