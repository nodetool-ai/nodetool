/**
 * `nodetool` object model tests — code actions run in the real QuickJS
 * sandbox against a fake chat tool router. No network, no model.
 */
import { describe, it, expect } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  createChatCodeActSession,
  type ChatCodeActToolCall
} from "../src/codeact/chat-codeact.js";
import {
  buildNodetoolApiPromptSection,
  hasNodetoolApiTools
} from "../src/codeact/nodetool-api.js";
import { createMockContext } from "./_helpers/mock-context.js";

const objectSchema = (props: Record<string, unknown>) => ({
  type: "object",
  properties: props
});

const toolDef = (name: string) => ({
  name,
  description: `Tool ${name}.`,
  inputSchema: objectSchema({})
});

const WORKFLOW_TOOLS = [
  "list_workflows",
  "get_workflow",
  "create_workflow",
  "run_workflow",
  "validate_workflow"
].map(toolDef);

const MODEL_TOOLS = ["find_model", "list_models"].map(toolDef);
const MEDIA_TOOLS = [
  "generate_image",
  "generate_speech",
  "transcribe_audio",
  "ffmpeg",
  "yt_dlp"
].map(toolDef);
const TIMELINE_TOOLS = ["list_timelines", "validate_timeline"].map(toolDef);

/** In-memory router: records calls, plays a tiny workflow store. */
function createFakeRouter() {
  const calls: ChatCodeActToolCall[] = [];
  let wfSeq = 0;
  const executeTool = async (call: ChatCodeActToolCall): Promise<unknown> => {
    calls.push(call);
    const args = call.args;
    switch (call.name) {
      case "list_workflows":
        return JSON.stringify({ workflows: [{ id: "wf1", name: "First" }] });
      case "get_workflow":
        return JSON.stringify({
          id: args["workflow_id"],
          name: "Stored",
          graph: {
            nodes: [
              {
                id: "src",
                type: "nodetool.input.StringInput",
                data: { properties: { name: "prompt" } }
              },
              {
                id: "dst",
                type: "nodetool.output.StringOutput",
                data: { properties: { name: "out" } }
              }
            ],
            edges: [
              {
                id: "e1",
                source: "src",
                sourceHandle: "output",
                target: "dst",
                targetHandle: "value"
              }
            ]
          }
        });
      case "create_workflow":
        wfSeq++;
        return JSON.stringify({
          id: `wf_new_${wfSeq}`,
          name: args["name"],
          tags: args["tags"]
        });
      case "run_workflow":
        return JSON.stringify({
          status: "completed",
          workflow_id: args["workflow_id"],
          params: args["params"]
        });
      case "validate_workflow":
        return JSON.stringify({ status: "ok", issues: [] });
      case "find_model":
        return JSON.stringify({
          capability: args["capability"],
          total: 1,
          results: [
            {
              provider: "fal_ai",
              model_id: "fal-ai/flux/schnell",
              name: "FLUX schnell",
              recommended: true
            }
          ]
        });
      case "list_provider_models":
        return JSON.stringify({
          provider: args["provider"],
          total: 1,
          results: [{ provider: args["provider"], id: "fal-ai/flux/schnell" }]
        });
      case "list_models":
        return JSON.stringify({
          total: 3,
          results: [
            { provider: "openai", id: "gpt-image-2", type: "image" },
            { provider: "openai", id: "gpt-5.4-mini", type: "language" },
            { provider: "fal_ai", id: "fal-ai/flux/schnell", type: "image" }
          ]
        });
      case "generate_image":
        return JSON.stringify({
          type: "image",
          provider: args["provider"],
          model: args["model"],
          asset_uri: "asset://img1.png"
        });
      case "generate_speech":
        return JSON.stringify({ type: "audio", asset_uri: "asset://a1.mp3" });
      case "ffmpeg":
        return JSON.stringify({ success: true, args: args["args"] });
      case "yt_dlp":
        return JSON.stringify({
          success: true,
          url: args["url"],
          output_file: args["output_file"]
        });
      case "list_timelines":
        return JSON.stringify({ timelines: [] });
      case "validate_timeline":
        return JSON.stringify({ ok: true, target: args });
      default:
        return JSON.stringify({ error: `Unknown tool ${call.name}` });
    }
  };
  return { executeTool, calls };
}

function makeSession(
  tools: Array<{ name: string; description: string; inputSchema: unknown }>,
  executeTool: (call: ChatCodeActToolCall) => Promise<unknown>
) {
  return createChatCodeActSession({
    tools,
    executeTool,
    context: createMockContext() as unknown as ProcessingContext
  });
}

async function runAction(
  session: ReturnType<typeof createChatCodeActSession>,
  code: string
) {
  const observation = await session.executeAction({ code });
  return JSON.parse(observation) as {
    ok: boolean;
    result?: unknown;
    error?: string;
    logs?: string[];
    toolCalls: number;
  };
}

describe("nodetool object model", () => {
  it("reports capabilities from the belt", async () => {
    const { executeTool } = createFakeRouter();
    const session = makeSession([...WORKFLOW_TOOLS, ...MODEL_TOOLS], executeTool);
    const obs = await runAction(session, `return nodetool.capabilities();`);
    expect(obs.ok).toBe(true);
    const caps = obs.result as Record<string, string[]>;
    expect(Object.keys(caps).sort()).toEqual(["models", "workflows"]);
    expect(caps["workflows"]).toContain("run_workflow");
  });

  it("picks one model and feeds it to media generation", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(
      [...MODEL_TOOLS, ...MEDIA_TOOLS],
      executeTool
    );
    const obs = await runAction(
      session,
      `const model = await nodetool.models.pick("text_to_image");
       const img = await nodetool.media.generateImage("a fox", model, {
         width: 512
       });
       return { model, uri: img.asset_uri };`
    );
    expect(obs.ok).toBe(true);
    expect((obs.result as { model: { provider: string } }).model.provider).toBe(
      "fal_ai"
    );
    expect(calls[0]).toMatchObject({
      name: "find_model",
      args: { capability: "text_to_image", limit: 1 }
    });
    expect(calls[1]).toMatchObject({
      name: "generate_image",
      args: {
        provider: "fal_ai",
        model: "fal-ai/flux/schnell",
        prompt: "a fox",
        width: 512
      }
    });
  });

  it("routes ffmpeg and downloadVideo to the host binaries", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(MEDIA_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `const ff = await nodetool.media.ffmpeg(["-i", "in.mp4", "out.mp4"], {
         timeout_seconds: 30
       });
       const dl = await nodetool.media.downloadVideo(
         "https://example.com/v",
         "clip.mp4"
       );
       return { ff: ff.success, out: dl.output_file };`
    );
    expect(obs.ok).toBe(true);
    expect(calls[0]).toMatchObject({
      name: "ffmpeg",
      args: {
        args: ["-i", "in.mp4", "out.mp4"],
        timeout_seconds: 30
      }
    });
    expect(calls[1]).toMatchObject({
      name: "yt_dlp",
      args: {
        url: "https://example.com/v",
        output_file: "clip.mp4"
      }
    });
  });

  it("normalizes model references: strings split on the first slash, objects pass through", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(MEDIA_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `await nodetool.media.generateImage("x", "fal_ai/fal-ai/flux/schnell");
       await nodetool.media.speak("hi", { provider: "openai", model: "tts-1" });
       try {
         await nodetool.media.generateImage("x");
         return "no throw";
       } catch (e) { return e.message; }`
    );
    expect(obs.ok).toBe(true);
    expect(calls[0].args).toMatchObject({
      provider: "fal_ai",
      model: "fal-ai/flux/schnell"
    });
    expect(calls[1]).toMatchObject({
      name: "generate_speech",
      args: { provider: "openai", model: "tts-1", text: "hi" }
    });
    expect(String(obs.result)).toContain("nodetool.models.pick");
  });

  it("routes forProvider through list_provider_models", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(
      [...MODEL_TOOLS, toolDef("list_provider_models")],
      executeTool
    );
    const obs = await runAction(
      session,
      `await nodetool.models.forProvider("fal_ai", { limit: 5 });
       return true;`
    );
    expect(obs.ok).toBe(true);
    expect(calls[0]).toMatchObject({
      name: "list_provider_models",
      args: { provider: "fal_ai", limit: 5 }
    });
  });

  it("wraps workflow CRUD and run with clean call shapes", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(WORKFLOW_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `const run = await nodetool.workflows.run("wf1", { prompt: "hi" });
       return run;`
    );
    expect(obs.ok).toBe(true);
    expect(calls[0]).toMatchObject({
      name: "run_workflow",
      args: { workflow_id: "wf1", params: { prompt: "hi" } }
    });
  });

  it("throws a named error when the backing tool is missing", async () => {
    const { executeTool } = createFakeRouter();
    const session = makeSession(WORKFLOW_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `try {
         await nodetool.models.find("text_to_image");
         return "no throw";
       } catch (e) { return e.message; }`
    );
    expect(obs.ok).toBe(true);
    expect(String(obs.result)).toContain('"find_model"');
    expect(String(obs.result)).toContain("not in this toolbelt");
  });

  it("batches with bounded concurrency and settles failures as entries", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(WORKFLOW_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `const items = [1, 2, 3, 4];
       const results = await nodetool.batch(items, async (n) => {
         if (n === 3) throw new Error("item " + n + " failed");
         await nodetool.workflows.run("wf1", { n });
         return n * 10;
       }, { concurrency: 2 });
       return results;`
    );
    expect(obs.ok).toBe(true);
    const results = obs.result as Array<{
      ok: boolean;
      index: number;
      value?: number;
      error?: string;
    }>;
    expect(results).toHaveLength(4);
    expect(results.filter((r) => r.ok).map((r) => r.value)).toEqual([
      10, 20, 40
    ]);
    expect(results.find((r) => !r.ok)?.error).toContain("item 3 failed");
    expect(calls.filter((c) => c.name === "run_workflow")).toHaveLength(3);
  });

  it("stops pulling new items on stopOnError", async () => {
    const { executeTool } = createFakeRouter();
    const session = makeSession(WORKFLOW_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `const seen = [];
       const results = await nodetool.batch([1, 2, 3, 4, 5], async (n) => {
         seen.push(n);
         if (n === 1) throw new Error("boom");
         return n;
       }, { concurrency: 1, stopOnError: true });
       return { results, seen };`
    );
    expect(obs.ok).toBe(true);
    const r = obs.result as { results: Array<{ ok: boolean }>; seen: number[] };
    expect(r.seen).toEqual([1]);
    expect(r.results).toHaveLength(1);
    expect(r.results[0].ok).toBe(false);
  });

  it("routes timeline validation by target type", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(TIMELINE_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `await nodetool.timelines.validate("tl1");
       await nodetool.timelines.validate({ tracks: [] });
       return "done";`
    );
    expect(obs.ok).toBe(true);
    expect(calls[0].args).toEqual({ timeline_id: "tl1" });
    expect(calls[1].args).toEqual({ document: { tracks: [] } });
  });

  it("workflows.open explains itself when the ui_* tools are absent", async () => {
    const { executeTool } = createFakeRouter();
    const session = makeSession(WORKFLOW_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `try { nodetool.workflows.open(); return "opened"; }
       catch (e) { return e.message; }`
    );
    expect(obs.ok).toBe(true);
    expect(String(obs.result)).toContain("sandbox DSL package");
  });

  it("gates the prompt section and prelude on the belt", () => {
    expect(hasNodetoolApiTools(["run_workflow"])).toBe(true);
    expect(hasNodetoolApiTools(["read_file"])).toBe(false);

    const section = buildNodetoolApiPromptSection([
      "run_workflow",
      "create_workflow",
      "validate_workflow",
      "find_model",
      "generate_image"
    ]);
    expect(section).toContain("nodetool.models");
    expect(section).toContain("nodetool.media");
    expect(section).toContain("nodetool.models.pick(\"text_to_image\")");
    expect(section).toContain("nodetool.batch(");
    expect(section).not.toContain("nodetool.timelines");
    expect(section).not.toContain("nodetool.providers");
    // Graph authoring is a package, so the section names it only when the
    // caller says this session mounts it.
    expect(section).not.toContain("@nodetool-ai/sandbox-dsl");

    const withDsl = buildNodetoolApiPromptSection(
      ["run_workflow", "create_workflow", "validate_workflow"],
      { graphDsl: true }
    );
    expect(withDsl).toContain("@nodetool-ai/sandbox-dsl");
    expect(withDsl).toContain("workflow(");

    expect(buildNodetoolApiPromptSection(["read_file"])).toBe("");

    const { executeTool } = createFakeRouter();
    const session = makeSession(WORKFLOW_TOOLS, executeTool);
    expect(session.systemPromptSection).toContain("nodetool");
  });

  it("runs a single node and delegates to sub-agents", async () => {
    const calls: ChatCodeActToolCall[] = [];
    const executeTool = async (call: ChatCodeActToolCall): Promise<unknown> => {
      calls.push(call);
      if (call.name === "run_node") {
        return JSON.stringify({ output: "node ran" });
      }
      if (call.name === "run_subtask") {
        return JSON.stringify({ result: `done: ${call.args["description"]}` });
      }
      return JSON.stringify({ error: `Unknown tool ${call.name}` });
    };
    const session = makeSession(
      ["run_node", "run_subtask"].map((name) => ({
        name,
        description: `Tool ${name}.`,
        inputSchema: objectSchema({})
      })),
      executeTool
    );
    const obs = await runAction(
      session,
      `const node = await nodetool.nodes.run("nodetool.text.Concat", { a: "x" });
       const one = await nodetool.agents.run(
         "Summarize the release notes and reply as JSON with {summary}."
       );
       const many = await nodetool.batch(
         ["First topic", "Topic two"],
         (p) => nodetool.agents.run(p),
         { concurrency: 2 }
       );
       return { node, one, ok: many.filter((r) => r.ok).length };`
    );
    expect(obs.ok).toBe(true);
    expect(calls[0]).toMatchObject({
      name: "run_node",
      args: { node_type: "nodetool.text.Concat", inputs: { a: "x" } }
    });
    // Description auto-derived from the prompt's first words.
    expect(calls[1]).toMatchObject({ name: "run_subtask" });
    expect(calls[1].args["description"]).toBe(
      "Summarize the release notes and reply"
    );
    expect(calls[1].args["prompt"]).toContain("reply as JSON");
    const batchDescriptions = calls
      .slice(2)
      .map((c) => c.args["description"]);
    expect(batchDescriptions).toContain("First topic");
    expect(batchDescriptions).toContain("Topic two");
    expect((obs.result as { ok: number }).ok).toBe(2);
  });

  it("documents wrapped tools only through the object model — never twice", async () => {
    const { executeTool } = createFakeRouter();
    const plainTool = {
      name: "read_file",
      description: "Read a workspace file.",
      inputSchema: objectSchema({ path: { type: "string" } })
    };
    const session = makeSession(
      [plainTool, ...WORKFLOW_TOOLS, ...MODEL_TOOLS, ...MEDIA_TOOLS],
      executeTool
    );
    // Wrapped tools are out of the catalog (resident and deferred alike)…
    for (const wrapped of [
      "tools.run_workflow(",
      "tools.create_workflow(",
      "tools.find_model(",
      "tools.generate_image("
    ]) {
      expect(session.systemPromptSection).not.toContain(wrapped);
    }
    // …unwrapped tools stay documented raw, and the API section is present.
    expect(session.systemPromptSection).toContain("tools.read_file(");
    expect(session.systemPromptSection).toContain("nodetool.workflows");

    // Wrapped tools remain callable through the bridge.
    const obs = await runAction(
      session,
      `const r = await tools.run_workflow({ workflow_id: "wf1", params: {} });
       return r.status;`
    );
    expect(obs.ok).toBe(true);
    expect(obs.result).toBe("completed");
  });
});
