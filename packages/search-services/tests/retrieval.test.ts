/**
 * The retrieval eval (docs/plans/library-search.md, D29): a labeled corpus and
 * a fixed query set, ranked by the real query on both dialects. It reports
 * recall at the agent's default limit and fails when a query's relevant item
 * drops out of the top results or the ranked ids change order unexpectedly.
 *
 * Keyword mode only until the semantic layer (A4) adds its own rows to the
 * report. Names say nothing about content, as in a real library of renders.
 */

import { afterAll, afterEach, describe, expect, it } from "vitest";
import { Asset, closeDb, initTestDb, ModelObserver, Workflow } from "@nodetool-ai/models";
import {
  reconcileLibraryIndex,
  runIndexerPass,
  searchLibrary,
  setAssetBytesReader,
  stopLibraryIndexWrites
} from "../src/index.js";
import { initPgliteDb } from "./_helpers/pglite-db.js";

const USER = "user-retrieval";
/** The agent tool's default page size. */
const AGENT_LIMIT = 8;

interface CorpusItem {
  key: string;
  create: () => Promise<{ id: string }>;
}

const files = new Map<string, string>();

function image(key: string, prompt: string, tags: string[] = []): CorpusItem {
  return {
    key,
    create: () =>
      Asset.create({
        user_id: USER,
        name: `${key}.png`,
        content_type: "image/png",
        metadata: { prompt, tags, generation: { provider: "fal", model: "flux-dev" } }
      })
  };
}

function textFile(key: string, name: string, contentType: string, text: string): CorpusItem {
  files.set(name, text);
  return { key, create: () => Asset.create({ user_id: USER, name, content_type: contentType }) };
}

function workflow(key: string, name: string, nodeText: string): CorpusItem {
  return {
    key,
    create: () =>
      Workflow.create({
        user_id: USER,
        name,
        access: "private",
        graph: { nodes: [{ id: `${key}-node`, type: "nodetool.text.Template", data: { prompt: nodeText } }], edges: [] }
      })
  };
}

const CORPUS: CorpusItem[] = [
  image("img-fox", "A red fox asleep in fresh snow at dawn", ["winter"]),
  image("img-grey-fox", "A grey fox walking through an autumn forest"),
  image("img-lighthouse", "A lighthouse on a cliff in a storm, waves breaking"),
  image("img-city", "A neon city street at night in the rain", ["hero"]),
  image("img-cat", "A cat sleeping on a sunny windowsill"),
  image("img-mountain", "Snow-capped mountains above a turquoise lake"),
  textFile("doc-report", "scan_2291.md", "text/markdown",
    "# Harbor lighthouse restoration\n\nSurvey of the tower.\n\n## Lamp\n\nThe Fresnel lamp was replaced with an LED lantern in 1987.\n\n## Budget\n\nThe repainting costs 12,000 euros."),
  textFile("doc-recipe", "notes-17.txt", "text/plain",
    "Sourdough starter: feed twice a day with rye flour and water.\n\nBake at 250 degrees with steam for the first twenty minutes."),
  textFile("doc-minutes", "mtg.md", "text/markdown",
    "# Weekly sync\n\nDecided to move the product launch to March.\n\nAction: Dana drafts the press release."),
  workflow("wf-poster", "Untitled 4", "A vintage travel poster of a lighthouse at sunset"),
  workflow("wf-summary", "Untitled 5", "Summarize the meeting transcript into bullet points")
];

/** Each query and the item a person means by it. */
const QUERIES: Array<{ query: string; relevant: string }> = [
  { query: "fox snow", relevant: "img-fox" },
  { query: "lighthouse storm", relevant: "img-lighthouse" },
  { query: "neon rain", relevant: "img-city" },
  { query: "hero", relevant: "img-city" },
  { query: "sleeping cat", relevant: "img-cat" },
  { query: "lamp replaced", relevant: "doc-report" },
  { query: "1987", relevant: "doc-report" },
  { query: "sourdough", relevant: "doc-recipe" },
  { query: "rye flour", relevant: "doc-recipe" },
  { query: "launch march", relevant: "doc-minutes" },
  { query: "press release", relevant: "doc-minutes" },
  { query: "travel poster", relevant: "wf-poster" },
  { query: "summarize transcript", relevant: "wf-summary" },
  { query: "turquoise lake", relevant: "img-mountain" }
];

const dialects: Array<[string, () => Promise<void>]> = [
  ["sqlite", async () => { initTestDb(); }],
  ["postgres", initPgliteDb]
];

afterEach(async () => {
  stopLibraryIndexWrites();
  setAssetBytesReader(null);
  ModelObserver.clear();
  await closeDb();
});

const report: Record<string, number> = {};
afterAll(() => {
  // The number the default model, chunk size and fusion settings are chosen by.
  console.info(`library retrieval recall@${AGENT_LIMIT}`, report);
});

describe.each(dialects)("retrieval eval on %s", (dialect, init) => {
  it(`ranks the relevant item in the top ${AGENT_LIMIT} for every labeled query`, async () => {
    await init();
    setAssetBytesReader(async (asset) => new TextEncoder().encode(files.get(asset.name) ?? ""));
    const idOf = new Map<string, string>();
    for (const item of CORPUS) idOf.set(item.key, (await item.create()).id);
    stopLibraryIndexWrites();
    await reconcileLibraryIndex();
    await runIndexerPass();

    const keyOf = new Map([...idOf].map(([key, id]) => [id, key]));
    const misses: string[] = [];
    const firsts: Record<string, string | undefined> = {};
    for (const { query, relevant } of QUERIES) {
      const result = await searchLibrary({ userId: USER, query, limit: AGENT_LIMIT });
      const ranked = result.hits.map((hit) => keyOf.get(hit.resourceId));
      firsts[query] = ranked[0];
      if (!ranked.includes(relevant)) misses.push(`${query} → ${ranked.join(", ") || "nothing"}`);
    }
    report[`${dialect}/keyword`] = (QUERIES.length - misses.length) / QUERIES.length;
    expect(misses).toEqual([]);
    // The ranked ids are pinned: the relevant item comes first for each query.
    expect(firsts).toEqual(Object.fromEntries(QUERIES.map(({ query, relevant }) => [query, relevant])));
  });
});
