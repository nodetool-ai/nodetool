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
const TIMELINE_TOOLS = [
  "list_timelines",
  "list_example_timelines",
  "get_example_timeline",
  "validate_timeline",
  "preview_timeline_frame",
  "compare_timeline_frames",
  "set_timeline_document",
  "create_timeline_version",
  "list_compositions",
  "get_composition",
  "save_composition",
  "delete_composition"
].map(toolDef);

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
      case "list_example_timelines":
        return JSON.stringify({ examples: [] });
      case "get_example_timeline":
        return JSON.stringify({ slug: args["slug"] });
      case "create_timeline_version":
        return JSON.stringify({ version: 1 });
      case "validate_timeline":
        return JSON.stringify({ ok: true, target: args });
      case "preview_timeline_frame":
        return JSON.stringify({ frames: [{ time_ms: 0 }], target: args });
      case "compare_timeline_frames":
        return JSON.stringify({ frames: [{ time_ms: 0, difference: 0 }], target: args });
      case "set_timeline_document":
        return JSON.stringify({ ok: true, written: true, target: args });
      case "list_compositions":
      case "get_composition":
      case "save_composition":
      case "delete_composition":
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
  it("routes game document and example methods through their belt capabilities", async () => {
    const names = ["create_native_game", "get_native_game", "edit_native_game", "publish_native_game",
      "install_native_game_asset", "playtest_native_game", "capture_native_game_frame", "generate_game_asset",
      "build_native_game", "list_example_games", "get_example_game", "install_example_game", "autoplay_native_game"];
    const calls: ChatCodeActToolCall[] = [];
    const session = makeSession(names.map(toolDef), async (call) => { calls.push(call); return JSON.stringify({ ok: true }); });
    const observation = await runAction(session, `
      await nodetool.games.create("Level", {project_id: "project"});
      await nodetool.games.get("game", {view: "full"});
      await nodetool.games.setDocument("game", {scenes: []}, {base_updated_at: "before"});
      await nodetool.games.edit("game", [{op: "set_game", pixels_per_unit: 48}]);
      await nodetool.games.publish("game", {base_revision: "revision"});
      await nodetool.games.installAsset("game", "hero", {digest: "sha"}, {candidate_workspace_id: "workspace"});
      await nodetool.games.playtest("game", {inputs: []});
      await nodetool.games.capture("game", {ticks: [0]});
      await nodetool.games.generateAsset("game", "jump", "sfx", "jump", {provider: "provider"});
      await nodetool.games.build("game", {revision: "revision"});
      await nodetool.games.listExamples();
      await nodetool.games.getExample("kindle");
      await nodetool.games.installExample("kindle", {project_id: "project"});
      await nodetool.games.autoplay("game", {target_prefix: "beacon"});
      return "done";
    `);
    expect(observation.ok, JSON.stringify(observation)).toBe(true);
    expect(calls.map((call) => call.name)).toEqual([
      ...names.slice(0, 2), "edit_native_game", "edit_native_game", ...names.slice(3)
    ]);
    expect(calls[0].args).toEqual({ name: "Level", project_id: "project" });
    expect(calls[1].args).toEqual({ game_id: "game", view: "full" });
    expect(calls[2].args).toEqual({ game_id: "game", base_updated_at: "before", ops: [{ op: "set_document", document: { scenes: [] } }] });
    expect(calls[5].args).toEqual({ game_id: "game", slot: "hero", binding: { digest: "sha" }, candidate_workspace_id: "workspace" });
    expect(calls[8].args).toEqual({ game_id: "game", slot: "jump", kind: "sfx", prompt: "jump", provider: "provider" });
    expect(calls[12].args).toEqual({ slug: "kindle", project_id: "project" });
    expect(calls[13].args).toEqual({ game_id: "game", target_prefix: "beacon" });
  });

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

  it("passes showcase validation options for saved and inline timelines", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(TIMELINE_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `await nodetool.timelines.validate("tl1", { tier: "showcase" });
       await nodetool.timelines.validate({ tracks: [] }, {
         tier: "showcase", fps: 30, width: 1920, height: 1080
       });
       return "done";`
    );
    expect(obs.ok).toBe(true);
    expect(calls[0].args).toEqual({ timeline_id: "tl1", tier: "showcase" });
    expect(calls[1].args).toEqual({
      document: { tracks: [] }, tier: "showcase", fps: 30, width: 1920, height: 1080
    });
  });

  it("lists shipped example timelines and reads a bounded scene by slug", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(TIMELINE_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `await nodetool.timelines.examples.list({ query: "kite" });
       await nodetool.timelines.examples.get("kite", {
         scene_id: "scene_intro", clip_offset: 0, clip_limit: 8
       });
       return "done";`
    );
    expect(obs.ok).toBe(true);
    expect(calls.map((call) => call.name)).toEqual([
      "list_example_timelines", "get_example_timeline"
    ]);
    expect(calls[0].args).toEqual({ query: "kite" });
    expect(calls[1].args).toEqual({
      slug: "kite", scene_id: "scene_intro", clip_offset: 0, clip_limit: 8
    });
  });

  it("routes timelines.compositions to the composition capabilities", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(TIMELINE_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `await nodetool.timelines.compositions.list({ source: "shipped" });
       await nodetool.timelines.compositions.get("lower-third");
       await nodetool.timelines.compositions.save("tl1", "Lower third", "Mine", {
         name: { type: "string", default: "Name", path: "/1/textStyle/text" }
       });
       await nodetool.timelines.compositions.remove("comp-1");
       return "done";`
    );
    expect(obs.ok).toBe(true);
    expect(calls.map((c) => c.name)).toEqual([
      "list_compositions",
      "get_composition",
      "save_composition",
      "delete_composition"
    ]);
    expect(calls[0].args).toEqual({ source: "shipped" });
    expect(calls[1].args).toEqual({ composition_id: "lower-third" });
    expect(calls[2].args).toEqual({
      timeline_id: "tl1",
      group_target: "Lower third",
      name: "Mine",
      params: {
        name: { type: "string", default: "Name", path: "/1/textStyle/text" }
      }
    });
    expect(calls[3].args).toEqual({ composition_id: "comp-1" });
  });

  it("routes timeline preview to preview_timeline_frame by target type", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(TIMELINE_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `const saved = await nodetool.timelines.preview("tl1", {
         times_ms: [0, 1500],
         width: 480
       });
       const inline = await nodetool.timelines.preview({ tracks: [] }, {
         count: 2
       });
       return { saved, inline };`
    );
    expect(obs.ok).toBe(true);
    // The method reaches the capability, not a stub: both calls land on
    // preview_timeline_frame, and the options ride along beside the target.
    expect(calls.map((c) => c.name)).toEqual([
      "preview_timeline_frame",
      "preview_timeline_frame"
    ]);
    expect(calls[0].args).toEqual({
      timeline_id: "tl1",
      times_ms: [0, 1500],
      width: 480
    });
    expect(calls[1].args).toEqual({ document: { tracks: [] }, count: 2 });
    const r = obs.result as { saved: { frames: unknown[] } };
    expect(r.saved.frames).toHaveLength(1);
  });

  it("routes timelines.compare to compare_timeline_frames with both sides", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(TIMELINE_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `await nodetool.timelines.compare(
         { timeline_id: "tl1" },
         { timeline_id: "tl1", version: 3 },
         { range: { from_ms: 0, to_ms: 2000, count: 4 } }
       );
       return "done";`
    );
    expect(obs.ok).toBe(true);
    expect(calls.map((c) => c.name)).toEqual(["compare_timeline_frames"]);
    expect(calls[0].args).toEqual({
      a: { timeline_id: "tl1" },
      b: { timeline_id: "tl1", version: 3 },
      range: { from_ms: 0, to_ms: 2000, count: 4 }
    });
  });

  it("routes timelines.setDocument with its options alongside the document", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(TIMELINE_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `await nodetool.timelines.setDocument("tl1", { tracks: [], clips: [] }, {
         expected_updated_at: "2026-01-01T00:00:00.000Z",
         snapshot_name: "before the recut"
       });
       return "done";`
    );
    expect(obs.ok).toBe(true);
    expect(calls.map((c) => c.name)).toEqual(["set_timeline_document"]);
    expect(calls[0].args).toEqual({
      timeline_id: "tl1",
      document: { tracks: [], clips: [] },
      expected_updated_at: "2026-01-01T00:00:00.000Z",
      snapshot_name: "before the recut"
    });
  });

  it("routes timelines.createVersion to create_timeline_version, like snapshot", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(TIMELINE_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `await nodetool.timelines.snapshot("tl1", { name: "one" });
       await nodetool.timelines.createVersion("tl1", { name: "two" });
       return "done";`
    );
    expect(obs.ok).toBe(true);
    expect(calls.map((c) => c.name)).toEqual([
      "create_timeline_version",
      "create_timeline_version"
    ]);
    expect(calls[1].args).toEqual({ timeline_id: "tl1", name: "two" });
  });

  it("names preview_timeline_frame when the belt lacks it", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(
      TIMELINE_TOOLS.filter((t) => t.name !== "preview_timeline_frame"),
      executeTool
    );
    const obs = await runAction(
      session,
      `try { await nodetool.timelines.preview("tl1"); return "called"; }
       catch (e) { return e.message; }`
    );
    expect(obs.ok).toBe(true);
    expect(String(obs.result)).toContain("preview_timeline_frame");
    expect(calls).toEqual([]);
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
      "await run_workflow(",
      "await create_workflow(",
      "await find_model(",
      "await generate_image("
    ]) {
      expect(session.systemPromptSection).not.toContain(wrapped);
    }
    // …unwrapped tools stay documented raw, and the API section is present.
    expect(session.systemPromptSection).toContain("await read_file(");
    expect(session.systemPromptSection).toContain("nodetool.workflows");

    // Wrapped tools remain callable — by import, which is the only form now.
    const obs = await runAction(
      session,
      `import { run_workflow } from "@nodetool-ai/sandbox-nodetool/workflows";
       const r = await run_workflow({ workflow_id: "wf1", params: {} });
       return r.status;`
    );
    expect(obs.ok).toBe(true);
    expect(obs.result).toBe("completed");
  });
});


describe("timeline save error details", () => {
  it("keeps every validation error in the thrown sandbox error", async () => {
    const errors = Array.from({ length: 25 }, (_, i) => ({
      code: "schema_invalid", message: "clips." + i + ".effects.0.id: expected string"
    }));
    const session = createChatCodeActSession({
      tools: TIMELINE_TOOLS,
      executeTool: async () => ({ error: "The document has 25 errors", written: false, validation: { ok: false, errors, warnings: [] } })
    });
    const result = JSON.parse(await session.executeAction({
      code: 'await nodetool.timelines.setDocument("tl1", { tracks: [], clips: [] });'
    }));
    expect(result.ok).toBe(false);
    for (const error of errors) {
      expect(result.error).toContain(error.message);
    }
  });
});

describe("packs.docs return contract", () => {
  it("returns the documentation string for string methods", async () => {
    const session = createChatCodeActSession({
      tools: [toolDef("get_sandbox_package_docs")],
      executeTool: async () => ({ specifier: "@acme/pack", trusted: true, documentation: "<guide>hello</guide>" })
    });
    const result = JSON.parse(await session.executeAction({
      code: 'return (await nodetool.packs.docs("@acme/pack")).includes("<guide>");'
    }));
    expect(result).toMatchObject({ ok: true, result: true });
  });
});
