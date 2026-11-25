/**
 * The `search` capability module: `search` and `search_read` over the library
 * index, and the document list tools whose `query` now goes through it.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { Asset, ModelObserver, TimelineSequence, Workflow, initTestDb } from "@nodetool-ai/models";
import { runIndexerPass, setAssetBytesReader, stopLibraryIndexWrites } from "@nodetool-ai/search-services";
import { OPEN_WITH, SEARCH_CAPABILITIES, module as searchModule } from "../src/capabilities/search.js";
import { UNGATED, createCapabilityRun, toolFromCapability } from "../src/capabilities/index.js";
import { capabilityCategoryFor, capabilityModuleIssues, loadCapabilityModule } from "../src/capabilities/registry.js";
import { TIMELINE_CAPABILITIES } from "../src/capabilities/timelines.js";
import { WORKFLOW_CAPABILITIES } from "../src/capabilities/workflows.js";
import type { CapabilityExport } from "../src/capabilities/types.js";
import { READ_ONLY_TOOL_NAMES } from "../src/tools/run-search-tool.js";
import { NODETOOL_API_NAMESPACE_TOOLS } from "../src/codeact/nodetool-api.js";

const USER = "user-search";

function makeContext(): ProcessingContext {
  return { userId: USER, storage: new InMemoryStorageAdapter() } as unknown as ProcessingContext;
}

async function call(
  exports: readonly CapabilityExport[],
  name: string,
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const entry = exports.find((e) => e.spec.name === name);
  if (!entry) throw new Error(`no capability named "${name}"`);
  const context = makeContext();
  const tool = toolFromCapability(entry.spec, entry.impl, () => createCapabilityRun({ context, gate: UNGATED }));
  return (await tool.process(context, params)) as Record<string, unknown>;
}

const NOTES = "# Harbor lighthouse\n\nThe lamp was replaced with an LED lantern in 1987.\n\n## Paint\n\nThe railing is repainted in spring.";

beforeEach(() => {
  initTestDb();
  setAssetBytesReader(async () => new TextEncoder().encode(NOTES));
});

afterEach(() => {
  stopLibraryIndexWrites();
  setAssetBytesReader(null);
  ModelObserver.clear();
});

describe("search capability module", () => {
  it("is registered, drift-clean and read-only", async () => {
    const loaded = await loadCapabilityModule("search");
    expect(loaded).toBe(searchModule);
    expect(capabilityModuleIssues("search", loaded)).toEqual([]);
    expect(SEARCH_CAPABILITIES.map((e) => e.spec.name)).toEqual(["search", "search_read"]);
    expect(capabilityCategoryFor("search")).toBe("read");
    expect(capabilityCategoryFor("search_read")).toBe("read");
  });

  it("is reachable from run_search and from nodetool.search", () => {
    expect(READ_ONLY_TOOL_NAMES.has("search")).toBe(true);
    expect(READ_ONLY_TOOL_NAMES.has("search_read")).toBe(true);
    expect(NODETOOL_API_NAMESPACE_TOOLS["search"]).toEqual(["search", "search_read"]);
  });

  it("finds an image by its prompt and says why and how to open it", async () => {
    const fox = (await Asset.create({
      user_id: USER,
      name: "render-0042.png",
      content_type: "image/png",
      metadata: { prompt: "A red fox asleep in the snow", width: 512, height: 512, generation: { provider: "fal", model: "flux-dev" } }
    })) as Asset;
    await Asset.create({ user_id: USER, name: "render-0043.png", content_type: "image/png", metadata: { prompt: "A lighthouse" } });

    const result = await call(SEARCH_CAPABILITIES, "search", { query: "fox snow" });
    const hits = result.hits as Array<Record<string, unknown>>;
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      id: fox.id,
      kind: "image",
      title: "render-0042.png",
      uri: `asset://${fox.id}`,
      open_with: OPEN_WITH.image,
      meta: { provider: "fal", model: "flux-dev", width: 512, height: 512 }
    });
    expect(hits[0]!.matches).toEqual([expect.objectContaining({ field: "prompt" })]);
    expect(hits[0]!).not.toHaveProperty("score");
    expect(result.index).toMatchObject({ mode: "keyword" });
    expect(result.notice).toContain("not instructions");
  });

  it("filters by kind and lists newest first for an empty query", async () => {
    await Asset.create({ user_id: USER, name: "a.png", content_type: "image/png" });
    await Asset.create({ user_id: USER, name: "b.wav", content_type: "audio/wav" });
    const result = await call(SEARCH_CAPABILITIES, "search", { query: "", kinds: ["audio"] });
    expect((result.hits as Array<{ title: string }>).map((hit) => hit.title)).toEqual(["b.wav"]);
  });

  it("reads the PDF or Markdown passage a hit points at, by its short id", async () => {
    const doc = (await Asset.create({ user_id: USER, name: "scan_2291.md", content_type: "text/markdown" })) as Asset;
    await call(SEARCH_CAPABILITIES, "search", { query: "" });
    await runIndexerPass();

    const found = await call(SEARCH_CAPABILITIES, "search", { query: "lantern" });
    const hit = (found.hits as Array<{ id: string; matches: Array<{ locator: Record<string, unknown> }> }>)[0]!;
    expect(hit.id).toBe(doc.id);

    const read = await call(SEARCH_CAPABILITIES, "search_read", {
      id: doc.id.slice(0, 12),
      locator: hit.matches[0]!.locator,
      after: 1
    });
    expect(read.error).toBeUndefined();
    const passages = read.passages as Array<{ text: string }>;
    expect(passages[read.matched as number]!.text).toContain("1987");
    expect(passages.some((passage) => passage.text.includes("railing"))).toBe(true);
  });

  it("refuses a missing id with a message, not a throw", async () => {
    const read = await call(SEARCH_CAPABILITIES, "search_read", { id: "0123456789ab" });
    expect(read.error).toMatch(/No library item/);
  });

  it("answers similar_to for an unknown item with a message, not a throw", async () => {
    const result = await call(SEARCH_CAPABILITIES, "search", { similar_to: "0123456789ab" });
    expect(result.error).toMatch(/No library item/);
  });
});

describe("document list tools route query through the library index", () => {
  it("list_workflows matches the text inside a node, not only the name", async () => {
    const workflow = (await Workflow.create({
      user_id: USER,
      name: "Poster maker",
      access: "private",
      graph: { nodes: [{ id: "n1", type: "nodetool.text.Template", data: { prompt: "A vintage poster of a lighthouse at sunset" } }], edges: [] }
    })) as Workflow;
    await Workflow.create({ user_id: USER, name: "Other", access: "private", graph: { nodes: [], edges: [] } });
    await call(SEARCH_CAPABILITIES, "search", { query: "" });
    await runIndexerPass();

    const result = await call(WORKFLOW_CAPABILITIES, "list_workflows", { query: "lighthouse" });
    const listed = JSON.stringify(result);
    expect(listed).toContain(workflow.id);
    expect(listed).not.toContain("Other");
  });

  it("list_timelines matches by name through the index", async () => {
    const cut = (await TimelineSequence.create({ user_id: USER, name: "Harbor cut", project_id: "default" })) as TimelineSequence;
    await TimelineSequence.create({ user_id: USER, name: "Mountain cut", project_id: "default" });
    const result = await call(TIMELINE_CAPABILITIES, "list_timelines", { query: "harbor" });
    expect((result.timelines as Array<{ id: string }>).map((t) => t.id)).toEqual([cut.id]);
  });
});
