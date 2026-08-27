/**
 * Headless bridge for the memory tool-loop eval.
 *
 * Unlike the editor-surface bridges (which reimplement browser `ui_*` effects),
 * this bridge drives the REAL backend tools — `memory_save/list` and
 * `asset_search` — against an in-memory SQLite DB, plus a stub `generate_image`
 * that persists a real asset the way a generation node would. So the eval
 * exercises the actual DB writes, resource validation, and asset resolution a
 * chat turn would, scoring a model's ability to run the creative loop:
 * generate media → remember it (referencing the asset) → recall it later.
 */

import { z } from "zod";
import {
  Asset,
  Memory,
  initTestDb,
  type MemoryResource
} from "@nodetool-ai/models";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { toolForCapabilityName } from "../../capabilities/lazy-tool.js";
import type { HeadlessTool } from "../tool-loop-bridge.js";
import type {
  HeadlessSurfaceBridge,
  ToolLoopEvalCase,
  ToolLoopStatePredicate
} from "../tool-loop-eval.js";
import { isString } from "../../utils/type-guards.js";

const EVAL_USER = "eval-user";
const EVAL_THREAD = "eval-thread";

/** Snapshot the case predicates run against. */
export interface MemoryBridgeFinalState {
  memories: Array<{
    kind: string;
    content: string;
    resources: MemoryResource[];
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
export function createMemoryToolBridge(
  seed?: (ctx: ProcessingContext) => Promise<void>
): HeadlessSurfaceBridge<MemoryBridgeFinalState> {
  initTestDb();
  const partialCtx: Pick<ProcessingContext, "userId" | "threadId"> = {
    userId: EVAL_USER,
    threadId: EVAL_THREAD
  };
  // SAFETY: the memory tools read only the user and thread ids off the
  // context; nothing in this bridge reaches for another member.
  const ctx = partialCtx as ProcessingContext;

  const saveTool = toolForCapabilityName("memory_save");
  const listTool = toolForCapabilityName("memory_list");
  const memorySearchTool = toolForCapabilityName("memory_search");
  const searchTool = toolForCapabilityName("asset_search");

  let state: MemoryBridgeFinalState = { memories: [], assets: [] };

  const refresh = async (): Promise<void> => {
    // User-scoped, like the store: a case that seeds another thread must see
    // its memory in the final state.
    const rows = await Memory.list(EVAL_USER, { limit: 200 });
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
        const prompt = isString(args.prompt) ? args.prompt : "image";
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
      name: memorySearchTool.name,
      description: memorySearchTool.description,
      parameters: z.object({
        query: z.string(),
        thread: z.enum(["all", "current"]).optional(),
        limit: z.number().optional()
      }),
      execute: async (args) => {
        await ready;
        const result = await memorySearchTool.process(ctx, args);
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

const memoryReferencesAnAsset: ToolLoopStatePredicate<MemoryBridgeFinalState> =
  {
    name: "a saved memory references a generated asset",
    test: (s) =>
      s.memories.some((m) =>
        m.resources.some(
          (r) =>
            r.type === "asset" &&
            isString(r.id) &&
            s.assets.some((a) => a.id === r.id)
        )
      ),
    detail:
      "Expected at least one memory whose resources include an asset " +
      "ref pointing at a generated image."
  };

const atLeastOneMemory: ToolLoopStatePredicate<MemoryBridgeFinalState> = {
  name: "at least one memory persisted",
  test: (s) => s.memories.length >= 1
};

/** The seeded palette memory survives the run — recall must not rewrite it. */
const paletteMemoryIntact: ToolLoopStatePredicate<MemoryBridgeFinalState> = {
  name: "the memory saved in the other conversation is still there",
  test: (s) => s.memories.some((m) => /viridian/i.test(m.content)),
  detail:
    "Expected the seeded cross-thread memory to be found and left in place."
};

const MEMORY_SYSTEM_PROMPT = `You are a creative assistant with durable memory that spans every conversation.

You work on media projects over many turns. Use these tools:
- generate_image({ prompt }) — create an image; returns { asset_id, uri }.
- memory_save({ content, kind?, resources? }) — remember project facts and the media you make. Reference assets by passing resources like [{ "type": "asset", "id": "<asset_id>" }] so you can reuse them later.
- memory_list() — recall everything you have saved, in any conversation.
- memory_search({ query }) — find memories whose title or content contain every word of the query, across every conversation.
- asset_search({ query?, content_type? }) — find assets already created.

Call one tool at a time and use each result before the next call. When the objective is fully satisfied, STOP calling tools and give a one-line summary.`;

export const MEMORY_TOOL_LOOP_CASES: ToolLoopEvalCase<MemoryBridgeFinalState>[] =
  [
    {
      id: "generate-and-remember",
      description:
        "Generate an image, then save a memory that references the generated asset for reuse.",
      objective:
        "Generate an image of a red fox mascot logo, then save it as the approved project logo, referencing the generated image so you can reuse it later.",
      systemPrompt: MEMORY_SYSTEM_PROMPT,
      createBridge: () => createMemoryToolBridge(),
      expect: {
        requiredTools: ["generate_image", "memory_save"],
        ordering: [["generate_image", "memory_save"]],
        finalState: [memoryReferencesAnAsset],
        minToolCalls: 2,
        maxToolCalls: 12
      }
    },
    {
      id: "recall-existing",
      description:
        "Recall memories saved earlier in the conversation via memory_list.",
      objective:
        "We've worked on this project before. Look at what you've already saved for this conversation and tell me which image was approved as the logo.",
      systemPrompt: MEMORY_SYSTEM_PROMPT,
      createBridge: () =>
        createMemoryToolBridge(async () => {
          const asset = await Asset.create<Asset>({
            user_id: EVAL_USER,
            name: "approved-logo.png",
            content_type: "image/png"
          });
          await Memory.create<Memory>({
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
        requiredTools: ["memory_list"],
        finalState: [atLeastOneMemory],
        maxToolCalls: 10
      }
    },
    {
      id: "search-across-threads",
      description:
        "Find, by keyword, a memory saved in a different conversation.",
      objective:
        "In some earlier conversation I settled on a brand colour. Search your memory for it and tell me the colour name.",
      systemPrompt: MEMORY_SYSTEM_PROMPT,
      createBridge: () =>
        createMemoryToolBridge(async () => {
          // Deliberately NOT this thread: only a cross-thread read finds it.
          await Memory.create<Memory>({
            user_id: EVAL_USER,
            thread_id: "an-earlier-conversation",
            kind: "decision",
            title: "Brand colour",
            content: "We settled on viridian as the brand colour."
          });
        }),
      expect: {
        requiredTools: ["memory_search"],
        finalState: [paletteMemoryIntact],
        maxToolCalls: 10
      }
    }
  ];
