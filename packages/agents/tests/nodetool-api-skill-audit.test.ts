/**
 * Wrapper and prompt defects the shipped-skills audit found in the guest
 * `nodetool.*` object model: options a wrapper dropped, a namespace calling
 * another namespace's tools, waits longer than the action that runs them,
 * and prompt lines that named methods no host can serve. Code actions run in
 * the real QuickJS sandbox against a recording router.
 */
import { describe, it, expect } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  createChatCodeActSession,
  type ChatCodeActToolCall
} from "../src/codeact/chat-codeact.js";
import {
  buildNodetoolApiPromptSection,
  CODEACT_GUEST_BINARY_TIMEOUT_MAX_S,
  CODEACT_GUEST_WAIT_MAX_MS,
  NODETOOL_API_NAMESPACE_TOOLS
} from "../src/codeact/nodetool-api.js";
import { DEFAULT_CODEACT_ACTION_TIMEOUT_MS } from "../src/codeact/codeact-executor.js";
import { capabilitySpec } from "../src/capabilities/index.js";
import { createMockContext } from "./_helpers/mock-context.js";

const toolDef = (name: string) => ({
  name,
  description: `Tool ${name}.`,
  inputSchema: { type: "object", properties: {} }
});

function session(tools: string[], answer: (call: ChatCodeActToolCall) => unknown = () => ({ ok: true })) {
  const calls: ChatCodeActToolCall[] = [];
  const s = createChatCodeActSession({
    tools: tools.map(toolDef),
    executeTool: async (call) => {
      calls.push(call);
      return JSON.stringify(answer(call));
    },
    context: createMockContext() as unknown as ProcessingContext
  });
  const run = async (code: string) =>
    JSON.parse(await s.executeAction({ code })) as {
      ok: boolean;
      result?: unknown;
      error?: string;
    };
  return { calls, run };
}

describe("wrappers forward the options their tools accept", () => {
  it("games.getExample passes view and entity_id", async () => {
    const { calls, run } = session(["get_example_game"]);
    const obs = await run(
      `return await nodetool.games.getExample("kindle", {view: "entity", entity_id: "player"});`
    );
    expect(obs.ok).toBe(true);
    expect(calls[0]?.args).toEqual({ slug: "kindle", view: "entity", entity_id: "player" });
  });

  it("workflows.start passes node_ids and reuse_results", async () => {
    const { calls, run } = session(["start_background_job"]);
    const obs = await run(
      `return await nodetool.workflows.start("wf1", {a: 1}, {node_ids: ["n2"], reuse_results: true});`
    );
    expect(obs.ok).toBe(true);
    expect(calls[0]?.args).toEqual({
      workflow_id: "wf1",
      params: { a: 1 },
      node_ids: ["n2"],
      reuse_results: true
    });
  });

  it("storyboards.edit passes expected_revision", async () => {
    const { calls, run } = session(["edit_storyboard"]);
    const obs = await run(
      `return await nodetool.storyboards.edit("sb1", [{op: "remove_shot", target: "s1"}], {expected_revision: 4});`
    );
    expect(obs.ok).toBe(true);
    expect(calls[0]?.args).toEqual({
      storyboard_id: "sb1",
      ops: [{ op: "remove_shot", target: "s1" }],
      expected_revision: 4
    });
  });

  it("sketches.validate passes the canvas fields with an inline document", async () => {
    const { calls, run } = session(["validate_sketch"]);
    const obs = await run(
      `return await nodetool.sketches.validate({sketch: {}}, {width: 640, height: 480, background_color: "#000000"});`
    );
    expect(obs.ok).toBe(true);
    expect(calls[0]?.args).toEqual({
      document: { sketch: {} },
      width: 640,
      height: 480,
      background_color: "#000000"
    });
  });

  it("web.screenshot passes full_page, positionally or in an options bag", async () => {
    const { calls, run } = session(["take_screenshot"]);
    const obs = await run(
      `await nodetool.web.screenshot("https://a.test", "a.png", {full_page: true});
       await nodetool.web.screenshot("https://b.test", {full_page: true});
       return await nodetool.web.screenshot("https://c.test");`
    );
    expect(obs.ok).toBe(true);
    expect(calls.map((c) => c.args)).toEqual([
      { url: "https://a.test", output_file: "a.png", full_page: true },
      { url: "https://b.test", output_file: "screenshot.png", full_page: true },
      { url: "https://c.test", output_file: "screenshot.png" }
    ]);
  });

  it("games.browseAssets reaches browse_native_game_assets", async () => {
    expect(NODETOOL_API_NAMESPACE_TOOLS["games"]).toContain("browse_native_game_assets");
    expect(capabilitySpec("browse_native_game_assets")).toBeDefined();
    const { calls, run } = session(["browse_native_game_assets"]);
    const obs = await run(
      `return await nodetool.games.browseAssets("g1", {kind: "image", digest: "abc", slot: "hero"});`
    );
    expect(obs.ok).toBe(true);
    expect(calls[0]).toMatchObject({
      name: "browse_native_game_assets",
      args: { game_id: "g1", kind: "image", digest: "abc", slot: "hero" }
    });
  });
});

describe("namespaces call only their own tools", () => {
  it("nodetool.scripts has no finish or previewDesign, which were storyboard tools", async () => {
    const { calls, run } = session(["list_scripts", "finish_storyboard", "preview_storyboard_design"]);
    const obs = await run(
      `return [typeof nodetool.scripts.finish, typeof nodetool.scripts.previewDesign,
               typeof nodetool.storyboards.finish, typeof nodetool.storyboards.previewDesign];`
    );
    expect(obs.ok).toBe(true);
    // A missing member answers with a callable namespace stub, never the
    // storyboard wrapper; calling it must not reach a storyboard tool.
    await run(`try { await nodetool.scripts.finish({storyboardId: "x"}); } catch (e) {} return 1;`);
    expect(calls.map((c) => c.name)).not.toContain("finish_storyboard");
  });

  it("the nodetool.audio hint names a method that exists", async () => {
    const { run } = session(["generate_speech"]);
    const obs = await run(`return await nodetool.audio.foo();`);
    expect(obs.ok).toBe(false);
    expect(obs.error).toContain("nodetool.media.speak");
    expect(obs.error).not.toContain("generateSpeech");
    const exists = await run(`return typeof nodetool.media.speak;`);
    expect(exists.result).toBe("function");
  });
});

describe("waits fit inside one code action", () => {
  it("the guest caps sit below the action wall clock", () => {
    expect(CODEACT_GUEST_WAIT_MAX_MS).toBeLessThan(DEFAULT_CODEACT_ACTION_TIMEOUT_MS);
    expect(CODEACT_GUEST_BINARY_TIMEOUT_MAX_S * 1000).toBeLessThan(DEFAULT_CODEACT_ACTION_TIMEOUT_MS);
  });

  it("jobs.wait clamps timeoutMs, so its own timeout error is what the caller sees", async () => {
    const { run } = session(["get_job"], () => ({ status: "running" }));
    // Advance the guest clock past any deadline after the first read, so the
    // loop reports its timeout without sleeping.
    const obs = await run(
      `let t = 0; Date.now = () => { const v = t; t = 1e12; return v; };
       return await nodetool.jobs.wait("job1", {timeoutMs: 900000});`
    );
    expect(obs.ok).toBe(false);
    expect(obs.error).toContain(`did not finish within ${CODEACT_GUEST_WAIT_MAX_MS}ms`);
    expect(obs.error).toContain("last status: running");
  });

  it("jobs.wait defaults below the action budget", async () => {
    const { run } = session(["get_job"], () => ({ status: "running" }));
    const obs = await run(
      `let t = 0; Date.now = () => { const v = t; t = 1e12; return v; };
       return await nodetool.jobs.wait("job1");`
    );
    expect(obs.error).toContain(`within ${CODEACT_GUEST_WAIT_MAX_MS}ms`);
  });

  it("generations.wait and agents.wait clamp the requested timeout", async () => {
    const { calls, run } = session(["await_generation", "wait_subtasks"]);
    const obs = await run(
      `await nodetool.generations.wait("gen1", {timeout_seconds: 900});
       await nodetool.generations.wait("gen2", {timeout_seconds: 30});
       return await nodetool.agents.wait({ids: ["s1"], timeoutMs: 900000});`
    );
    expect(obs.ok).toBe(true);
    expect(calls.map((c) => c.args)).toEqual([
      { generation_id: "gen1", timeout_seconds: CODEACT_GUEST_WAIT_MAX_MS / 1000 },
      { generation_id: "gen2", timeout_seconds: 30 },
      { ids: ["s1"], timeout_ms: CODEACT_GUEST_WAIT_MAX_MS }
    ]);
  });

  it("ffmpeg and downloadVideo clamp timeout_seconds", async () => {
    const { calls, run } = session(["ffmpeg", "yt_dlp"]);
    const obs = await run(
      `await nodetool.media.ffmpeg(["-i", "a.mp4", "b.mp4"], {timeout_seconds: 600});
       return await nodetool.media.downloadVideo("https://v.test", "v.mp4", {timeout_seconds: 900});`
    );
    expect(obs.ok).toBe(true);
    expect(calls[0]?.args).toMatchObject({ timeout_seconds: CODEACT_GUEST_BINARY_TIMEOUT_MAX_S });
    expect(calls[1]?.args).toMatchObject({ timeout_seconds: CODEACT_GUEST_BINARY_TIMEOUT_MAX_S });
  });
});

describe("collections methods no production host serves", () => {
  it("throws a message that names the methods that work", async () => {
    const { calls, run } = session(["list_collections", "query_collection"]);
    for (const code of [
      `nodetool.collections.index("t", "s")`,
      `nodetool.collections.indexBatch([])`,
      `nodetool.collections.search("t")`,
      `nodetool.collections.hybridSearch("t")`
    ]) {
      const obs = await run(`return await ${code};`);
      expect(obs.ok).toBe(false);
      expect(obs.error).toContain("only list() and query(collection, text) work here");
    }
    expect(calls).toEqual([]);
  });

  it("documents them only when the belt carries a vector tool", () => {
    const production = buildNodetoolApiPromptSection(["list_collections", "query_collection"]);
    expect(production).toContain("nodetool.collections");
    expect(production).not.toContain("indexBatch");
    const bound = buildNodetoolApiPromptSection(["query_collection", "vector_batch_index"]);
    expect(bound).toContain("indexBatch");
  });
});

describe("prompt lines", () => {
  it("documents nodetool.secrets with its skill whenever a namespace is active", () => {
    const section = buildNodetoolApiPromptSection(["list_workflows", "load_skill"]);
    expect(section).toMatch(/nodetool\.secrets[^\n]*\n[\s\S]*?Skill: `api-settings`/);
    expect(buildNodetoolApiPromptSection(["load_skill"])).toBe("");
  });

  it("lists storyboards.finish and previewDesign, and no script finish", () => {
    const section = buildNodetoolApiPromptSection(["list_storyboards", "list_scripts"]);
    expect(section).toContain("previewDesign({storyboardId, expectedStoryboardRevision})");
    expect(section).toContain("finish({storyboardId");
    const scriptsLine = section.split("\n").find((l) => l.includes("`nodetool.scripts`"));
    expect(scriptsLine).toBeDefined();
    expect(section).toContain("`get(id)`, `edit(id, ops)`, `voice(id)`, `assembleTimeline(id)`.");
  });
});
