/**
 * The `compositions` capability module — reusable timeline templates,
 * headlessly.
 *
 * A composition is a group clip plus its children and the parameters that vary
 * (`@nodetool-ai/timeline`'s `composition.ts`). Two kinds exist and both read
 * the same way: the ones NodeTool ships, JSON files under
 * `packages/base-nodes/nodetool/examples/compositions/`, and the ones a user
 * saved, ordinary JSON assets carrying a marker under
 * `metadata.nodetool_composition` — the entity pattern (D11).
 *
 * Inserting one is not here: it is the `insert_composition` op on
 * `edit_timeline`, so a template lands through the same bridge every other
 * document edit goes through (I11).
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";

import type { TimelineComposition } from "@nodetool-ai/timeline";
import { loadMediaRefBytes } from "@nodetool-ai/runtime";
import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  deleteCompositionSpec,
  getCompositionSpec,
  listCompositionsSpec,
  saveCompositionSpec
} from "./compositions.specs.js";
import { userIdOf } from "../tools/mcp-tool-support.js";
import { isRecord, isString } from "../utils/type-guards.js";

/** The metadata key a saved composition's marker lives under. */
export const COMPOSITION_METADATA_KEY = "nodetool_composition";

/** File suffix of a shipped composition. */
const SHIPPED_SUFFIX = ".composition.json";

/** Assets the library scans for markers. */
const COMPOSITION_ASSET_LIMIT = 1000;

type ToolError = { error: string };

const isError = (value: unknown): value is ToolError =>
  isRecord(value) && isString((value as ToolError).error);

export type CompositionSource = "shipped" | "user";

export interface LoadedComposition {
  composition: TimelineComposition;
  source: CompositionSource;
}

/**
 * Where the shipped compositions live: an explicit override, then the packaged
 * layout (`examples/compositions` next to `server.mjs`), then the checkout.
 *
 * The three roots are the same ones every other shipped-example reader walks;
 * this module resolves them itself rather than taking a loader on the run,
 * because a composition is read with no user and no database.
 */
export function shippedCompositionsDir(): string | null {
  const override = process.env["NODETOOL_EXAMPLE_COMPOSITIONS_DIR"];
  if (override) return existsSync(override) ? override : null;

  const here = nodePath.dirname(fileURLToPath(import.meta.url));
  const candidates: string[] = [];
  // The packaged backend: `examples/` sits next to the bundled server.
  for (let up = 1; up <= 4; up += 1) {
    candidates.push(
      nodePath.join(here, ...Array(up).fill(".."), "examples", "compositions")
    );
  }
  // The checkout: walk up to the repo root and read base-nodes' examples.
  let cursor = here;
  for (let up = 0; up < 8; up += 1) {
    candidates.push(
      nodePath.join(
        cursor,
        "packages",
        "base-nodes",
        "nodetool",
        "examples",
        "compositions"
      )
    );
    cursor = nodePath.dirname(cursor);
  }
  return candidates.find((dir) => existsSync(dir)) ?? null;
}

function readShippedFile(dir: string, file: string): TimelineComposition | null {
  // The names only ever come from readdirSync, but resolve and check
  // containment anyway so no future caller can read outside the directory.
  const root = nodePath.resolve(dir);
  const target = nodePath.resolve(root, file);
  if (target !== root && !target.startsWith(root + nodePath.sep)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(target, "utf8"));
    return isComposition(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Whether a parsed value carries the shape a composition must have. */
export function isComposition(value: unknown): value is TimelineComposition {
  if (!isRecord(value)) return false;
  return (
    isString(value["id"]) &&
    isString(value["name"]) &&
    isRecord(value["group"]) &&
    Array.isArray(value["children"]) &&
    isRecord(value["params"])
  );
}

/** Every composition NodeTool ships, sorted by id. */
export function loadShippedCompositions(): TimelineComposition[] {
  const dir = shippedCompositionsDir();
  if (!dir) return [];
  let files: string[];
  try {
    files = readdirSync(dir).filter((file) => file.endsWith(SHIPPED_SUFFIX));
  } catch {
    return [];
  }
  const out: TimelineComposition[] = [];
  for (const file of files.sort((a, b) => a.localeCompare(b))) {
    const composition = readShippedFile(dir, file);
    if (composition) out.push(composition);
  }
  return out;
}

/** Every composition this user saved, newest asset first. */
export async function loadUserCompositions(
  run: CapabilityRun
): Promise<TimelineComposition[] | ToolError> {
  const userId = userIdOf(run.context);
  if (!userId) return { error: "No user is bound to this session." };
  const { Asset } = await import("@nodetool-ai/models");
  const [assets] = await Asset.paginate(userId, {
    contentType: "application",
    limit: COMPOSITION_ASSET_LIMIT
  });
  const marked = assets.filter((asset) =>
    isRecord(asset.metadata?.[COMPOSITION_METADATA_KEY])
  );
  const out: TimelineComposition[] = [];
  for (const asset of marked) {
    const composition = await readCompositionAsset(run, asset.id);
    if (composition) out.push({ ...composition, id: asset.id });
  }
  return out;
}

async function readCompositionAsset(
  run: CapabilityRun,
  assetId: string
): Promise<TimelineComposition | null> {
  try {
    const bytes = await loadMediaRefBytes(
      { uri: `asset://${assetId}`, asset_id: assetId },
      run.context
    );
    if (!bytes || bytes.length === 0) return null;
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return isComposition(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * One composition by id: a shipped slug wins, then the user's assets. The
 * shipped set is checked first because its ids are slugs and an asset id is a
 * uuid — they cannot collide, and a shipped read needs no database.
 */
export async function loadComposition(
  run: CapabilityRun,
  compositionId: string
): Promise<LoadedComposition | null> {
  const shipped = loadShippedCompositions().find(
    (comp) => comp.id === compositionId
  );
  if (shipped) return { composition: shipped, source: "shipped" };

  const userId = userIdOf(run.context);
  if (!userId) return null;
  const { Asset } = await import("@nodetool-ai/models");
  const asset = await Asset.find(userId, compositionId);
  if (!asset || !isRecord(asset.metadata?.[COMPOSITION_METADATA_KEY])) {
    return null;
  }
  const composition = await readCompositionAsset(run, asset.id);
  if (!composition) return null;
  return {
    composition: { ...composition, id: asset.id },
    source: "user"
  };
}

/** The summary shape `list_compositions` returns, one row per template. */
const compositionRow = (
  composition: TimelineComposition,
  source: CompositionSource
) => ({
  id: composition.id,
  name: composition.name,
  description: composition.description ?? "",
  source,
  duration_ms: composition.group.durationMs,
  child_count: composition.children.length,
  params: Object.entries(composition.params ?? {}).map(([name, param]) => ({
    name,
    type: param.type,
    default: param.default
  }))
});

const listCompositions: CapabilityExport = {
  spec: listCompositionsSpec,
  impl: async (run, params) => {
    const wanted = isString(params["source"]) ? params["source"] : "";
    const rows: ReturnType<typeof compositionRow>[] = [];
    if (wanted !== "user") {
      for (const composition of loadShippedCompositions()) {
        rows.push(compositionRow(composition, "shipped"));
      }
    }
    if (wanted !== "shipped") {
      const mine = await loadUserCompositions(run);
      if (isError(mine)) {
        // A session with no user still lists the shipped half rather than
        // failing: those need no database at all.
        if (wanted === "user") return mine;
      } else {
        for (const composition of mine) {
          rows.push(compositionRow(composition, "user"));
        }
      }
    }

    const query = isString(params["query"])
      ? params["query"].trim().toLowerCase()
      : "";
    const matched = query
      ? rows.filter(
          (row) =>
            row.name.toLowerCase().includes(query) ||
            row.description.toLowerCase().includes(query)
        )
      : rows;

    const requested = Number(params["limit"] ?? DEFAULT_LIMIT);
    const limit = Number.isFinite(requested)
      ? Math.min(Math.max(Math.trunc(requested), 1), MAX_LIMIT)
      : DEFAULT_LIMIT;
    return {
      compositions: matched.slice(0, limit),
      count: Math.min(matched.length, limit),
      total: matched.length
    };
  }
};

const getComposition: CapabilityExport = {
  spec: getCompositionSpec,
  impl: async (run, params) => {
    const compositionId = params["composition_id"];
    if (!isString(compositionId) || compositionId.trim() === "") {
      return {
        error:
          "composition_id is required (use list_compositions to find one)."
      };
    }
    const loaded = await loadComposition(run, compositionId.trim());
    if (!loaded) {
      const known = loadShippedCompositions().map((comp) => comp.id);
      return {
        error: `Composition ${compositionId} was not found. Shipped ones: ${known.join(", ")}.`
      };
    }
    return { composition: loaded.composition, source: loaded.source };
  }
};

const saveComposition: CapabilityExport = {
  spec: saveCompositionSpec,
  impl: async (run, params) => {
    const timelineId = params["timeline_id"];
    const groupTarget = params["group_target"];
    const name = params["name"];
    if (!isString(timelineId) || timelineId.trim() === "") {
      return { error: "timeline_id is required." };
    }
    if (!isString(groupTarget) || groupTarget.trim() === "") {
      return { error: "group_target is required (a group clip id or name)." };
    }
    if (!isString(name) || name.trim() === "") {
      return { error: "name is required and must be a non-empty string." };
    }
    const rawParams = params["params"];
    if (!isRecord(rawParams)) {
      return {
        error:
          'params is required: {"<name>": {type, default, path}} naming what varies.'
      };
    }

    const userId = userIdOf(run.context);
    if (!userId) return { error: "No user is bound to this session." };

    const { TimelineSequence } = await import("@nodetool-ai/models");
    const seq = await TimelineSequence.findById(timelineId.trim());
    // A sequence owned by someone else reads as missing.
    if (!seq || seq.user_id !== userId) {
      return { error: `Timeline ${timelineId} was not found.` };
    }
    const stored: unknown = isString(seq.document)
      ? JSON.parse(seq.document)
      : seq.document;
    if (!isRecord(stored) || !Array.isArray(stored["clips"])) {
      return { error: `Timeline ${seq.id} has no readable document.` };
    }
    const clips = stored["clips"] as { id: string; name: string }[];
    const wanted = groupTarget.trim();
    const match =
      clips.find((clip) => clip.id === wanted) ??
      clips.find(
        (clip) => (clip.name ?? "").toLowerCase() === wanted.toLowerCase()
      );
    if (!match) {
      const groups = clips.filter(
        (clip) => (clip as { mediaType?: string }).mediaType === "group"
      );
      return {
        error:
          `No clip matching "${wanted}" is on timeline ${seq.id}. ` +
          (groups.length > 0
            ? `Groups: ${groups.map((g) => `${g.id} ("${g.name}")`).join(", ")}.`
            : "It has no groups — make one with the add_group op first.")
      };
    }

    const { extractComposition } = await import("@nodetool-ai/timeline");
    let composition: TimelineComposition;
    const extractOptions: { name: string; description?: string } = {
      name: name.trim()
    };
    if (isString(params["description"])) {
      extractOptions.description = params["description"];
    }
    try {
      composition = extractComposition(
        // SAFETY: the clips came out of the stored document, which the
        // timeline schema wrote; extractComposition reads only ids, times,
        // mediaType and parentId, and refuses anything else by message.
        { clips: stored["clips"] as never },
        match.id,
        // SAFETY: the parameter bag is the caller's, and extractComposition
        // checks every declared type and pointer before it returns.
        rawParams as never,
        extractOptions
      );
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }

    const fileName = `${name.trim().replace(/[^\w.-]+/g, "-")}.composition.json`;
    let created: unknown;
    try {
      created = await run.context.createAsset({
        name: fileName,
        contentType: "application/json",
        content: new TextEncoder().encode(
          `${JSON.stringify(composition, null, 2)}\n`
        )
      });
    } catch (error) {
      return {
        error: `Could not save the composition asset: ${error instanceof Error ? error.message : String(error)}`
      };
    }
    const assetId =
      isRecord(created) && isString(created["id"]) ? created["id"] : null;
    if (!assetId) {
      return { error: "The composition asset was created without an id." };
    }

    const { Asset } = await import("@nodetool-ai/models");
    const asset = await Asset.find(userId, assetId);
    if (!asset) {
      return { error: `Composition asset ${assetId} was not readable.` };
    }
    const marker: { name: string; description?: string; param_names: string[] } = {
      name: composition.name,
      param_names: Object.keys(composition.params ?? {})
    };
    if (composition.description !== undefined) {
      marker.description = composition.description;
    }
    asset.metadata = {
      ...(asset.metadata ?? {}),
      [COMPOSITION_METADATA_KEY]: marker
    };
    await asset.save();

    return {
      composition_id: assetId,
      asset_id: assetId,
      source: "user",
      composition: { ...composition, id: assetId }
    };
  }
};

const deleteComposition: CapabilityExport = {
  spec: deleteCompositionSpec,
  impl: async (run, params) => {
    const compositionId = params["composition_id"];
    if (!isString(compositionId) || compositionId.trim() === "") {
      return {
        error:
          "composition_id is required (use list_compositions to find one)."
      };
    }
    const id = compositionId.trim();
    if (loadShippedCompositions().some((comp) => comp.id === id)) {
      return {
        error: `"${id}" is a composition NodeTool ships, so it cannot be deleted. Save your own and delete that instead.`
      };
    }
    const userId = userIdOf(run.context);
    if (!userId) return { error: "No user is bound to this session." };

    const { Asset } = await import("@nodetool-ai/models");
    const asset = await Asset.find(userId, id);
    if (!asset || !isRecord(asset.metadata?.[COMPOSITION_METADATA_KEY])) {
      return { error: `Composition ${id} was not found.` };
    }
    await asset.delete();
    return { ok: true, composition_id: id };
  }
};

/** Every composition capability, in declaration order. */
export const COMPOSITION_CAPABILITIES: readonly CapabilityExport[] = [
  listCompositions,
  getComposition,
  saveComposition,
  deleteComposition
];

export const module: CapabilityModule = {
  module: "compositions",
  exports: COMPOSITION_CAPABILITIES
};

export { listCompositions, getComposition, saveComposition, deleteComposition };
