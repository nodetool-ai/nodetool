/**
 * A headless library for search evals and jobs (docs/plans/library-search.md,
 * D29): a few stored items whose file names say nothing about their content,
 * behind the result shapes of `search` and `search_read`, plus the two writes
 * a search usually leads to: tagging an asset and saving a note.
 *
 * The matching is a plain word test, not the real index. What is under test is
 * whether the agent searches by what the user described and reads the matched
 * passage, not the ranking. The real query has its own retrieval eval in
 * `packages/search-services/tests/retrieval.test.ts`.
 */

import { z } from "zod";
import type { HeadlessSurfaceBridge } from "../tool-loop-eval.js";
import { closedParams, parseBridgeArgs, type HeadlessTool } from "../tool-loop-bridge.js";

export interface LibraryItem {
  id: string;
  kind: string;
  title: string;
  /** Searchable passages. */
  passages: Array<{ field: string; text: string; locator: Record<string, unknown> | null }>;
  open_with: string;
}

export const LIBRARY_ITEMS: readonly LibraryItem[] = [
  {
    id: "a3f1c2d4e5b6a7c8d9e0f1a2b3c4d5e6",
    kind: "image",
    title: "render-0042.png",
    passages: [{ field: "prompt", text: "A red fox curled up asleep in fresh snow at dawn, soft pink light", locator: null }],
    open_with: "view_image"
  },
  {
    id: "b4e2d3c5f6a7b8c9d0e1f2a3b4c5d6e7",
    kind: "image",
    title: "render-0043.png",
    passages: [{ field: "prompt", text: "A lighthouse on a cliff in a storm, waves breaking", locator: null }],
    open_with: "view_image"
  },
  {
    id: "d6a4f5e7b8c9d0e1f2a3b4c5d6e7f8a9",
    kind: "image",
    title: "render-0044.png",
    passages: [{ field: "prompt", text: "A grey fox walking through an autumn forest", locator: null }],
    open_with: "view_image"
  },
  {
    id: "c5f3e4d6a7b8c9d0e1f2a3b4c5d6e7f8",
    kind: "document",
    title: "scan_2291.pdf",
    passages: [
      { field: "body", text: "Harbor lighthouse restoration report. Survey of the tower and the keeper's house.", locator: { page: 1, start: 0, end: 82 } },
      { field: "body", text: "The original Fresnel lamp was replaced with an LED lantern in 1987 after the storm damage.", locator: { page: 4, start: 0, end: 90 } },
      { field: "body", text: "Repainting of the gallery railing is planned for the spring.", locator: { page: 5, start: 0, end: 60 } }
    ],
    open_with: "search_read"
  }
];

export interface LibraryFinalState {
  /** Tags each item carries, by id. */
  tags: Record<string, string[]>;
  /** Notes the agent saved, in order. */
  notes: string[];
  /** Items the agent read passages of. */
  read: string[];
}

function words(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2);
}

function findItem(id: string): LibraryItem | undefined {
  return LIBRARY_ITEMS.find((item) => item.id === id || (id.length === 12 && item.id.startsWith(id)));
}

function tool(
  name: string,
  description: string,
  parameters: z.ZodObject<z.ZodRawShape>,
  impl: (args: Record<string, unknown>) => unknown
): HeadlessTool {
  const closed = closedParams(parameters);
  return {
    name,
    description,
    parameters,
    execute: async (args) => impl(parseBridgeArgs(closed, args) as Record<string, unknown>)
  };
}

/** A fresh library world. */
export function createLibraryToolBridge(): HeadlessSurfaceBridge<LibraryFinalState> {
  const state: LibraryFinalState = { tags: {}, notes: [], read: [] };

  const search = tool(
    "search",
    "Find stored assets and documents by name, generation prompt, tags or the text inside them. Each hit has matches (field, snippet, locator) and open_with, the tool that opens it.",
    z.object({
      query: z.string().optional().describe("Words describing what to find."),
      kinds: z.array(z.string()).optional().describe("Only these kinds, such as image or document."),
      limit: z.number().optional()
    }),
    (args) => {
      const terms = words(typeof args.query === "string" ? args.query : "");
      const kinds = Array.isArray(args.kinds) ? args.kinds : [];
      const hits = LIBRARY_ITEMS.filter((item) => kinds.length === 0 || kinds.includes(item.kind))
        .map((item) => ({
          item,
          matches: item.passages.filter((passage) => {
            const text = `${item.title} ${passage.text}`.toLowerCase();
            return terms.length > 0 && terms.every((term) => text.includes(term));
          })
        }))
        .filter((hit) => terms.length === 0 || hit.matches.length > 0)
        .map(({ item, matches }) => ({
          id: item.id,
          kind: item.kind,
          title: item.title,
          matches: matches.map((match) => ({ field: match.field, snippet: match.text.slice(0, 50), locator: match.locator })),
          tags: state.tags[item.id] ?? [],
          open_with: item.open_with
        }));
      return { hits, next_cursor: null, index: { mode: "keyword", pending: 0, failed: 0 } };
    }
  );

  const read = tool(
    "search_read",
    "Read the passage at a search hit's locator, with its neighbours.",
    z.object({
      id: z.string(),
      locator: z.record(z.string(), z.unknown()).optional(),
      before: z.number().optional(),
      after: z.number().optional()
    }),
    (args) => {
      const item = findItem(String(args.id));
      if (!item) return { error: `No library item ${String(args.id)}.` };
      state.read.push(item.id);
      const locator = (args.locator ?? {}) as Record<string, unknown>;
      const index = Math.max(
        0,
        item.passages.findIndex((passage) =>
          Object.entries(locator).every(([key, value]) => passage.locator?.[key] === value)
        )
      );
      const from = Math.max(0, index - 1);
      return {
        id: item.id,
        title: item.title,
        passages: item.passages.slice(from, index + 2).map((passage) => ({
          locator: passage.locator,
          text: passage.text
        })),
        matched: index - from
      };
    }
  );

  const tag = tool(
    "update_asset",
    "Change an asset's tags. The list replaces the tags it had.",
    z.object({ asset_id: z.string(), tags: z.array(z.string()) }),
    (args) => {
      const item = findItem(String(args.asset_id));
      if (!item) return { error: `No asset ${String(args.asset_id)}.` };
      state.tags[item.id] = (args.tags as string[]).map((t) => t.trim().toLowerCase());
      return { asset_id: item.id, tags: state.tags[item.id] };
    }
  );

  const note = tool(
    "memory_save",
    "Save a note the user can read later.",
    z.object({ title: z.string().optional(), content: z.string() }),
    (args) => {
      state.notes.push(`${typeof args.title === "string" ? `${args.title}\n` : ""}${String(args.content)}`);
      return { saved: true };
    }
  );

  return {
    tools: [search, read, tag, note],
    finalState: () => ({
      tags: { ...state.tags },
      notes: [...state.notes],
      read: [...state.read]
    })
  };
}
