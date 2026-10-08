/**
 * End-to-end runs of every shipped example app with fake providers.
 *
 * Each bundle in `packages/base-nodes/nodetool/examples/apps/` goes through
 * the same headless simulator `nodetool app debug` uses, with the real kernel
 * runner and the real node registry. Every model the bundle names is pointed at
 * the `fake` provider, so a run costs nothing and needs no key, and the
 * interactions a person would make (fill the inputs, press each step's button,
 * approve a plan) are scripted per app. A test passes only when every
 * interaction succeeded, every run completed, and the harness verdict is clean.
 */
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AppDebugReport, InteractionStep } from "@nodetool-ai/execution/app-debug";
import type { Message, ProviderStreamItem, ProviderTool, ToolCall } from "@nodetool-ai/runtime";

const scratch = mkdtempSync(join(tmpdir(), "example-apps-e2e-"));
// Read when the runtime's provider registry and the asset store first load,
// so both are set before anything below imports them.
process.env["NODETOOL_ENABLE_FAKE_PROVIDER"] = "1";
process.env["ASSET_FOLDER"] = join(scratch, "assets");

const APPS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../base-nodes/nodetool/examples/apps"
);

type Json = Record<string, unknown>;

interface Bundle {
  app: {
    operations: Array<{ id: string; workflowId: string; inputs: Record<string, Json> }>;
    variables?: Array<{ id: string; type?: { type?: string }; default?: unknown }>;
    ui?: unknown;
    recipe?: {
      inputs?: Array<{ id: string; label: string; kind: string }>;
      operations: Array<{ intent: string; strategy?: string; model?: Json }>;
    };
  };
  workflows: Array<{ key: string; graph: { nodes: Array<{ id: string; type: string; data?: Json }> } }>;
}

const RECIPE_INPUTS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../base-nodes/nodetool/assets/nodetool-base/recipe-inputs"
);

/**
 * What a person uploads before pressing anything: one stored asset per media
 * kind, copied from the shipped recipe inputs. Recipe apps refuse anything
 * that is not a stored asset, so the refs carry the asset id.
 */
const UPLOADS = {
  image: { id: "e2e0000000000000000000000000image", file: "coffee.jpg", contentType: "image/jpeg" },
  video: { id: "e2e0000000000000000000000000video", file: "presenter.mp4", contentType: "video/mp4" },
  audio: { id: "e2e0000000000000000000000000audio", file: "voice.wav", contentType: "audio/wav" }
} as const;

const MEDIA = Object.fromEntries(
  Object.entries(UPLOADS).map(([kind, upload]) => [
    kind,
    { type: kind, asset_id: upload.id, uri: `asset://${upload.id}` }
  ])
) as Record<keyof typeof UPLOADS, Json>;

const MEDIA_INPUT_NODES: Record<string, unknown> = {
  "nodetool.input.ImageInput": MEDIA.image,
  "nodetool.input.VideoInput": MEDIA.video,
  "nodetool.input.AudioInput": MEDIA.audio,
  "nodetool.input.ImageListInput": [MEDIA.image]
};

const FAKE_MODEL_IDS: Record<string, string> = {
  language_model: "fake-model-v1",
  image_model: "fake-image",
  video_model: "fake-video",
  tts_model: "fake-tts",
  asr_model: "fake-asr",
  music_model: "fake-music"
};

/** Point every model reference in the bundle at the fake provider. */
/**
 * A recipe lays out and finishes its cut with an agent that edits the timeline
 * until it can submit a composition, which a fake model cannot do. The test
 * takes the deterministic path both jobs share, as the Price Drop server test
 * does: Plan still requires a model but lays the cut out with the shared
 * design code, and Build finishes with the deterministic strategy.
 */
const LAYOUT_MODEL = "const layoutModel = inputs.finishModel?.";

function withDeterministicRecipe(bundle: Bundle): Bundle {
  const recipe = bundle.app.recipe;
  if (!recipe) return bundle;
  for (const operation of recipe.operations) {
    if (operation.intent !== "finish_storyboard") continue;
    operation.strategy = "deterministic";
  }
  for (const operation of bundle.app.operations) {
    if (!("in-recipe" in operation.inputs)) continue;
    operation.inputs["in-recipe"] = { from: "constant", value: recipe };
    if ("in-finishStrategy" in operation.inputs) {
      operation.inputs["in-finishStrategy"] = { from: "constant", value: "deterministic" };
    }
  }
  for (const workflow of bundle.workflows) {
    for (const node of workflow.graph.nodes) {
      const code = node.data?.["code"];
      if (typeof code === "string" && code.includes(LAYOUT_MODEL)) {
        node.data!["code"] = code.replace(LAYOUT_MODEL, `delete inputs.finishModel;\n${LAYOUT_MODEL}`);
      }
    }
  }
  return bundle;
}

function withFakeModels<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withFakeModels) as T;
  if (value && typeof value === "object") {
    const out: Json = {};
    for (const [key, entry] of Object.entries(value)) out[key] = withFakeModels(entry);
    const kind = out["type"];
    if (typeof kind === "string" && kind.endsWith("_model") && "provider" in out) {
      out["provider"] = "fake";
      out["id"] = FAKE_MODEL_IDS[kind] ?? "fake";
    }
    return out as T;
  }
  return value;
}

const hasMedia = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.length > 0;
  if (!value || typeof value !== "object") return false;
  const ref = value as Json;
  return Boolean(ref["uri"] || ref["asset_id"] || ref["data"]);
};

/**
 * The values a person fills in before pressing anything: every recipe input,
 * every media variable without a default, and every media input an operation
 * reads from its own widget.
 */
function fillInputs(bundle: Bundle): InteractionStep[] {
  const steps: InteractionStep[] = [];
  const variables = new Map((bundle.app.variables ?? []).map((v) => [v.id, v]));
  const recipeInputs = bundle.app.recipe?.inputs ?? [];
  for (const input of recipeInputs) {
    if (!variables.has(input.id)) continue;
    const value =
      input.kind in MEDIA
        ? MEDIA[input.kind as keyof typeof MEDIA]
        : input.kind === "color"
          ? "#ff5500"
          : `Sample ${input.label.toLowerCase()}`;
    steps.push({ set: { key: `var:${input.id}`, value } });
  }
  for (const variable of variables.values()) {
    if (recipeInputs.some((input) => input.id === variable.id)) continue;
    const kind = variable.type?.type;
    if (kind && kind in FAKE_MODEL_IDS && !variable.default) {
      steps.push({ set: { key: `var:${variable.id}`, value: { type: kind, provider: "fake", id: FAKE_MODEL_IDS[kind] } } });
    }
    if (kind && kind in MEDIA && !hasMedia(variable.default)) {
      steps.push({ set: { key: `var:${variable.id}`, value: MEDIA[kind as keyof typeof MEDIA] } });
    }
  }
  for (const operation of bundle.app.operations) {
    const workflow = bundle.workflows.find((w) => w.key === operation.workflowId);
    for (const node of workflow?.graph.nodes ?? []) {
      const media = MEDIA_INPUT_NODES[node.type];
      if (media === undefined || operation.inputs?.[node.id]) continue;
      if (!hasMedia(node.data?.["value"])) {
        steps.push({ set: { key: `op:${operation.id}/in:${node.id}`, value: media } });
      }
    }
  }
  return steps;
}

/** A value that satisfies a JSON schema, for fake tool-call arguments. */
function sampleFor(schema: unknown, depth = 0): unknown {
  if (!schema || typeof schema !== "object" || depth > 6) return "sample";
  const s = schema as Json;
  if ("const" in s) return s["const"];
  if (Array.isArray(s["enum"]) && s["enum"].length > 0) return s["enum"][0];
  if (s["default"] !== undefined) return s["default"];
  for (const key of ["anyOf", "oneOf", "allOf"]) {
    const options = s[key];
    if (Array.isArray(options) && options.length > 0) {
      const usable = options.find((o) => (o as Json)?.["type"] !== "null") ?? options[0];
      return sampleFor(usable, depth + 1);
    }
  }
  const type = Array.isArray(s["type"]) ? s["type"].find((t) => t !== "null") : s["type"];
  switch (type) {
    case "object": {
      const out: Json = {};
      const props = (s["properties"] ?? {}) as Json;
      for (const [key, sub] of Object.entries(props)) out[key] = sampleFor(sub, depth + 1);
      return out;
    }
    case "array": {
      const count = Math.max(1, Number(s["minItems"] ?? 1));
      return Array.from({ length: count }, () => sampleFor(s["items"], depth + 1));
    }
    case "integer":
    case "number":
      return typeof s["minimum"] === "number" ? s["minimum"] : 1;
    case "boolean":
      return true;
    case "string":
      if (s["format"] === "uri" || s["format"] === "url") return "https://example.com";
      return "sample";
    default:
      return "sample";
  }
}

const isToolResult = (message: Message): boolean => message.role === "tool";

const textOf = (message: Message): string =>
  typeof message.content === "string"
    ? message.content
    : (message.content ?? [])
        .map((part) => ("text" in part && typeof part.text === "string" ? part.text : ""))
        .join("");

/**
 * The text answer: a fenced object matching the schema when the prompt
 * carries one in `<JSON_SCHEMA>` tags (what Structured Output Generator
 * sends), else the provider's fixed reply.
 */
function textAnswer(messages: Message[], fallback: string): string {
  for (const message of messages) {
    const match = /<JSON_SCHEMA>\s*([\s\S]*?)\s*<\/JSON_SCHEMA>/.exec(textOf(message));
    if (!match) continue;
    try {
      return "```json\n" + JSON.stringify(sampleFor(JSON.parse(match[1]))) + "\n```";
    } catch {
      // Not a parseable schema: answer like any other prompt.
    }
  }
  return fallback;
}

let report: (slug: string, interact: InteractionStep[]) => Promise<AppDebugReport>;

beforeAll(async () => {
  const [
    { Asset, Project, initTestDb },
    { FakeProvider },
    { runAppDebug },
    { runOnServer },
    { installLocalModelInterfaces }
  ] = await Promise.all([
    import("@nodetool-ai/models"),
    import("@nodetool-ai/runtime"),
    import("../src/app-debug/harness.js"),
    import("../src/debug/server-runner.js"),
    import("../src/local-model-interfaces.js")
  ]);
  // What the CLI entry installs before any command runs a graph.
  await installLocalModelInterfaces();

  /**
   * The registry's fake provider emits one burst of tool calls per instance,
   * and a run shares one instance across its nodes, so only the first
   * tool-calling node gets an answer. This one answers each conversation:
   * it calls every offered tool once, with arguments built from the tool's
   * schema, until the conversation carries a tool result, then replies in text.
   */
  class ConversationFakeProvider extends FakeProvider {
    private calls(messages: Message[], tools: ProviderTool[] | undefined): ToolCall[] | null {
      if (!tools || tools.length === 0 || messages.some(isToolResult)) return null;
      return tools.map((tool, index) => ({
        id: `fake-call-${index}-${Math.random().toString(36).slice(2, 10)}`,
        name: tool.name,
        args: sampleFor(tool.inputSchema ?? { type: "object" }) as Json
      }));
    }

    override async generateMessage(
      args: Parameters<InstanceType<typeof FakeProvider>["generateMessage"]>[0]
    ): Promise<Message> {
      this.callCount++;
      const calls = this.calls(args.messages, args.tools);
      if (calls) return { role: "assistant", content: [], toolCalls: calls };
      const text = textAnswer(args.messages, this.textResponse);
      return { role: "assistant", content: [{ type: "text", text }] };
    }

    override async *generateMessages(
      args: Parameters<InstanceType<typeof FakeProvider>["generateMessages"]>[0]
    ): AsyncGenerator<ProviderStreamItem> {
      this.callCount++;
      const calls = this.calls(args.messages, args.tools);
      if (calls) {
        yield* calls;
        return;
      }
      const text = textAnswer(args.messages, this.textResponse);
      yield { type: "chunk", content: text, done: true, content_type: "text" };
    }
  }

  // `openai.audio.Transcribe` calls the OpenAI API directly rather than
  // through a provider, so its fake is the endpoint itself: a transcript with
  // word timestamps, the shape whisper-1 returns.
  process.env["OPENAI_API_KEY"] ??= "e2e-fake-key";
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "https://api.openai.com/v1/audio/transcriptions") {
      const words = ["Fresh", "coffee", "every", "morning"].map((word, i) => ({
        word,
        start: i * 0.1,
        end: i * 0.1 + 0.1
      }));
      return new Response(
        JSON.stringify({
          text: words.map((w) => w.word).join(" "),
          segments: [{ start: 0, end: 0.4, text: words.map((w) => w.word).join(" ") }],
          words
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    // An ad app's example website, which its Suggest agent reads.
    if (EXAMPLE_SITES.has(url)) {
      return new Response(EXAMPLE_PAGE, { status: 200, headers: { "content-type": "text/html" } });
    }
    return realFetch(input, init);
  };

  initTestDb();
  const project = await Project.ensurePersonal("1");
  for (const upload of Object.values(UPLOADS)) {
    const source = join(RECIPE_INPUTS, upload.file);
    const extension = upload.file.slice(upload.file.lastIndexOf("."));
    mkdirSync(join(scratch, "assets", "1"), { recursive: true });
    copyFileSync(source, join(scratch, "assets", "1", `${upload.id}${extension}`));
    await new Asset({
      id: upload.id,
      user_id: "1",
      project_id: project.id,
      name: upload.file,
      content_type: upload.contentType,
      size: statSync(source).size
    }).save();
  }
  report = async (slug, interact) => {
    const source = JSON.parse(readFileSync(join(APPS_DIR, `${slug}.app.json`), "utf8")) as Bundle;
    const bundle = withDeterministicRecipe(withFakeModels(source));
    const file = join(scratch, `${slug}.app.json`);
    writeFileSync(file, JSON.stringify(bundle));
    const provider = new ConversationFakeProvider();
    return runAppDebug(
      file,
      { interact: [...fillInputs(bundle), ...interact], outDir: join(scratch, "out", slug), timeoutMs: 120_000 },
      {
        loadFromDb: async () => null,
        runOnServer: async (input) => {
          input.context?.registerProvider("fake", provider);
          return runOnServer(input);
        }
      }
    );
  };
}, 120_000);

afterAll(() => {
  // E2E_KEEP=1 keeps each app's debug bundle (report, raw messages) to read.
  if (process.env["E2E_KEEP"]) console.log(`kept ${scratch}`);
  else rmSync(scratch, { recursive: true, force: true });
});

/** Every problem the report records, one line each, so a failure names its cause. */
function problems(result: AppDebugReport, unreached: string[] = []): string[] {
  const lines: string[] = [];
  for (const interaction of result.interactions) {
    if (interaction.error) lines.push(`${interaction.step}: ${interaction.error}`);
  }
  // The verdict repeats each failed interaction and node error; keep the rest.
  for (const issue of result.verdict.issues) {
    if (/^(Interaction "|Run ended |Node )/.test(issue)) continue;
    if (unreached.some((widget) => issue.includes(`"${widget}"`))) continue;
    lines.push(issue);
  }
  return lines;
}

interface Scenario {
  /** What a person does after filling the inputs, in order. */
  steps: (bundle: Bundle) => InteractionStep[];
  /**
   * Widgets the happy path never shows or runs, such as a Retry button that
   * appears only while a run is in flight or after it failed. The verdict
   * reports each one; the scenario names them so nothing else is excused.
   */
  unreached?: string[];
}

/** The website each ad app offers as an example, which the test serves itself. */
const EXAMPLE_SITES = new Set<string>();
const EXAMPLE_PAGE =
  "<html><head><title>Example shop</title></head>" +
  "<body><h1>Trail runner</h1><p>Now 30% off the whole range until Sunday.</p></body></html>";

/** The value a click handler of `widgetId` writes to `var:<variableId>`. */
function clickValue(bundle: Bundle, widgetId: string, variableId: string): unknown {
  const ui = JSON.stringify(bundle.app.ui);
  const at = ui.indexOf(`"id":"${widgetId}"`);
  if (at < 0) return undefined;
  const match = new RegExp(`"var:${variableId}","value":("(?:[^"\\\\]|\\\\.)*")`).exec(ui.slice(at));
  return match ? JSON.parse(match[1]) : undefined;
}

/**
 * A storyboard ad: fill it from the example website, take the first option,
 * step through the pages, then plan and build the cut. The fake agent's
 * options name no real images, so the uploads stay in place.
 */
const adRecipe = (bundle: Bundle): InteractionStep[] => {
  const site = clickValue(bundle, "source-example", "sourceUrl");
  if (typeof site === "string") EXAMPLE_SITES.add(site);
  const next = [...JSON.stringify(bundle.app.ui).matchAll(/"id":"([a-z0-9-]+-next)"/g)].map((m) => m[1]);
  return [
    { change: "fillPath", value: "web" },
    { click: "source-example" },
    { click: "suggest" },
    { change: "fillChoice", value: "1" },
    ...next.map((id) => ({ click: id })),
    { click: "plan" },
    { click: "finish" }
  ];
};

const runEach = (bundle: Bundle): InteractionStep[] =>
  bundle.app.operations.map((operation) => ({ run: operation.id }));

/** Interactions per app. An app not listed runs each operation in order. */
const SCENARIOS: Record<string, Scenario> = {
  "dubbing-desk": {
    steps: () => [
      { click: "btn-transcribe" },
      { click: "next-clip" },
      { click: "btn-translate" },
      { click: "next-translate" },
      { click: "btn-voice-subtitles" },
      { click: "next-voice" },
      { click: "btn-spokesperson" }
    ]
  },
  "product-price-drop": {
    steps: () => [{ click: "plan" }, { click: "finish" }],
    unreached: ["request-changes"]
  },
  "directed-campaign-kit": {
    steps: () => [
      { click: "autofill-run" },
      { click: "render-hero-run" },
      { click: "accept-hero-run" },
      { set: { key: "var:revisionChange", value: "Warmer light, smaller logo" } },
      { click: "revise-hero-run" },
      { click: "accept-revision-run" }
    ],
    unreached: [
      "Retry campaign analysis",
      "Retry hero",
      "Retry original formats",
      "Retry Revision 1",
      "Retry Revision 1 formats",
      // Reopening needs the record file a finished campaign downloads.
      "Retry reopening",
      "restore-progress",
      "restore-error"
    ]
  }
};

const AD_RECIPE: Scenario = { steps: adRecipe, unreached: ["request-changes"] };

const slugs = readdirSync(APPS_DIR)
  .filter((file) => file.endsWith(".app.json"))
  .map((file) => file.replace(/\.app\.json$/, ""))
  .filter((slug) => !process.env["E2E_APP"] || new RegExp(process.env["E2E_APP"]).test(slug))
  .sort();

describe("example apps run end to end with fake providers", () => {
  it("found the shipped apps", () => {
    expect(slugs.length).toBeGreaterThan(0);
  });

  it.each(slugs)("%s", async (slug) => {
    const bundle = JSON.parse(readFileSync(join(APPS_DIR, `${slug}.app.json`), "utf8")) as Bundle;
    const scenario =
      SCENARIOS[slug] ?? (slug.startsWith("ad-") && bundle.app.recipe ? AD_RECIPE : undefined);
    const result = await report(slug, (scenario?.steps ?? runEach)(bundle));
    expect(problems(result, scenario?.unreached)).toEqual([]);
    expect(result.runs.length).toBeGreaterThan(0);
    expect(result.runs.every((run) => run.status === "completed")).toBe(true);
  }, 300_000);
});
