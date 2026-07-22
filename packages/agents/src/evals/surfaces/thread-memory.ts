/**
 * Headless bridge for the thread-memory tool-loop eval.
 *
 * Unlike the editor-surface bridges (which reimplement browser `ui_*` effects),
 * this bridge drives the REAL backend tools — `thread_memory_save/list` and
 * `asset_search` — against an in-memory SQLite DB, plus a stub `generate_image`
 * that persists a real asset the way a generation node would. So the eval
 * exercises the actual DB writes, resource validation, and asset resolution a
 * chat turn would, scoring a model's ability to run the creative loop:
 * generate media → remember it (referencing the asset) → recall it later.
 */

import { z } from "zod";
import {
  Asset,
  ThreadMemory,
  initTestDb,
  type ThreadMemoryResource
} from "@nodetool-ai/models";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  ThreadMemorySaveTool,
  ThreadMemoryListTool
} from "../../tools/thread-memory-tools.js";
import { AssetSearchTool } from "../../tools/asset-library-tools.js";
import type { HeadlessTool } from "../tool-loop-bridge.js";
import type {
  HeadlessSurfaceBridge,
  ToolLoopEvalCase,
  ToolLoopStatePredicate
} from "../tool-loop-eval.js";

const EVAL_USER = "eval-user";
const EVAL_THREAD = "eval-thread";

/** Snapshot the case predicates run against. */
export interface ThreadMemoryBridgeFinalState {
  memories: Array<{
    kind: string;
    content: string;
    resources: ThreadMemoryResource[];
  }>;
  assets: Array<{ id: string; name: string; content_type: string }>;
}

const resourceParam = z.object({
  type: z.string(),
  id: z.string(),
  uri: z.string().optional(),
  label: z.string().optional()
});

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "image"
  );
}

/**
 * Build a fresh headless bridge over a clean in-memory DB. `seed` can pre-load
 * an asset + memory (used by the recall case).
 */
export function createThreadMemoryToolBridge(
  seed?: (ctx: ProcessingContext) => Promise<void>
): HeadlessSurfaceBridge<ThreadMemoryBridgeFinalState> {
  initTestDb();
  const ctx = {
    userId: EVAL_USER,
    threadId: EVAL_THREAD
  } as unknown as ProcessingContext;

  const saveTool = new ThreadMemorySaveTool();
  const listTool = new ThreadMemoryListTool();
  const searchTool = new AssetSearchTool();

  let state: ThreadMemoryBridgeFinalState = { memories: [], assets: [] };

  const refresh = async (): Promise<void> => {
    const rows = await ThreadMemory.listByThread(EVAL_USER, EVAL_THREAD, 200);
    const [assetRows] = await Asset.searchAssetsGlobal(EVAL_USER, "", {
      limit: 200
    });
    state = {
      memories: rows.map((r) => ({
        kind: r.kind,
        content: r.content,
        resources: Array.isArray(r.resources) ? r.resources : []
      })),
      assets: assetRows
        .filter((a) => a.content_type !== "folder")
        .map((a) => ({
          id: a.id,
          name: a.name,
          content_type: a.content_type
        }))
    };
  };

  // Bridges are created synchronously but seeding is async. Every tool awaits
  // this readiness promise first, so the seed (and initial snapshot) always
  // complete before any tool runs — no race with the first tool call.
  const ready: Promise<void> = (async () => {
    if (seed) await seed(ctx);
    await refresh();
  })();

  const tools: HeadlessTool[] = [
    {
      name: "generate_image",
      description:
        "Generate an image from a text prompt and save it as an asset. Returns " +
        "the new asset_id and its asset:// uri.",
      parameters: z.object({
        prompt: z.string().describe("What to generate.")
      }),
      execute: async (args) => {
        await ready;
        const prompt = typeof args.prompt === "string" ? args.prompt : "image";
        const asset = await Asset.create<Asset>({
          user_id: EVAL_USER,
          name: `${slug(prompt)}.png`,
          content_type: "image/png"
        });
        await refresh();
        return {
          success: true,
          asset_id: asset.id,
          uri: `asset://${asset.id}.png`,
          content_type: "image/png"
        };
      }
    },
    {
      name: saveTool.name,
      description: saveTool.description,
      parameters: z.object({
        content: z.string(),
        title: z.string().optional(),
        kind: z
          .enum(["note", "fact", "preference", "decision", "resource"])
          .optional(),
        resources: z.array(resourceParam).optional()
      }),
      execute: async (args) => {
        await ready;
        const result = await saveTool.process(ctx, args);
        await refresh();
        return result;
      }
    },
    {
      name: listTool.name,
      description: listTool.description,
      parameters: z.object({ limit: z.number().optional() }),
      execute: async (args) => {
        await ready;
        const result = await listTool.process(ctx, args);
        await refresh();
        return result;
      }
    },
    {
      name: searchTool.name,
      description: searchTool.description,
      parameters: z.object({
        query: z.string().optional(),
        content_type: z.string().optional(),
        limit: z.number().optional()
      }),
      execute: async (args) => {
        await ready;
        const result = await searchTool.process(ctx, args);
        await refresh();
        return result;
      }
    }
  ];

  return { tools, finalState: () => state };
}

// --- predicates --------------------------------------------------------------

const memoryReferencesAnAsset: ToolLoopStatePredicate<ThreadMemoryBridgeFinalState> =
  {
    name: "a saved memory references a generated asset",
    test: (s) =>
      s.memories.some((m) =>
        m.resources.some(
          (r) =>
            r.type === "asset" &&
            typeof r.id === "string" &&
            s.assets.some((a) => a.id === r.id)
        )
      ),
    detail:
      "Expected at least one thread memory whose resources include an asset " +
      "ref pointing at a generated image."
  };

const atLeastOneMemory: ToolLoopStatePredicate<ThreadMemoryBridgeFinalState> = {
  name: "at least one memory persisted",
  test: (s) => s.memories.length >= 1
};

const THREAD_MEMORY_SYSTEM_PROMPT = `You are a creative assistant with durable, per-conversation memory.

You work on media projects over many turns. Use these tools:
- generate_image({ prompt }) — create an image; returns { asset_id, uri }.
- thread_memory_save({ content, kind?, resources? }) — remember project facts and the media you make. Reference assets by passing resources like [{ "type": "asset", "id": "<asset_id>" }] so you can reuse them later.
- thread_memory_list() — recall everything you saved for this conversation.
- asset_search({ query?, content_type? }) — find assets already created.

Call one tool at a time and use each result before the next call. When the objective is fully satisfied, STOP calling tools and give a one-line summary.`;

export const THREAD_MEMORY_TOOL_LOOP_CASES: ToolLoopEvalCase<ThreadMemoryBridgeFinalState>[] =
  [
    {
      id: "generate-and-remember",
      description:
        "Generate an image, then save a memory that references the generated asset for reuse.",
      objective:
        "Generate an image of a red fox mascot logo, then save it as the approved project logo, referencing the generated image so you can reuse it later.",
      systemPrompt: THREAD_MEMORY_SYSTEM_PROMPT,
      createBridge: () => createThreadMemoryToolBridge(),
      expect: {
        requiredTools: ["generate_image", "thread_memory_save"],
        ordering: [["generate_image", "thread_memory_save"]],
        finalState: [memoryReferencesAnAsset],
        minToolCalls: 2,
        maxToolCalls: 12
      }
    },
    {
      id: "recall-existing",
      description:
        "Recall memories saved earlier in the conversation via thread_memory_list.",
      objective:
        "We've worked on this project before. Look at what you've already saved for this conversation and tell me which image was approved as the logo.",
      systemPrompt: THREAD_MEMORY_SYSTEM_PROMPT,
      createBridge: () =>
        createThreadMemoryToolBridge(async () => {
          const asset = await Asset.create<Asset>({
            user_id: EVAL_USER,
            name: "approved-logo.png",
            content_type: "image/png"
          });
          await ThreadMemory.create<ThreadMemory>({
            user_id: EVAL_USER,
            thread_id: EVAL_THREAD,
            kind: "resource",
            content: "The approved project logo is the red fox mascot.",
            resources: [
              {
                type: "asset",
                id: asset.id,
                uri: `asset://${asset.id}.png`,
                label: "approved-logo.png"
              }
            ]
          });
        }),
      expect: {
        requiredTools: ["thread_memory_list"],
        finalState: [atLeastOneMemory],
        maxToolCalls: 10
      }
    }
  ];
