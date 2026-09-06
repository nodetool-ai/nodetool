/**
 * The `godot` capability module — a game template plus filled asset slots in,
 * a Godot project in the workspace out.
 *
 * What this module owns is the argument surface: slot args in, each asset read
 * back from the store, its stamped fill checked, and the whole manifest checked
 * against the template before anything is written. The join that follows —
 * layout, asset copies, reference check, headless verification — is
 * `joinGodotProject` in `@nodetool-ai/game-nodes`, which
 * `nodetool.game.ExportGodotProject` calls too, so a project exported by a graph
 * and one exported by this capability are written by the same code.
 */

import { getTemplate, listTemplates } from "@nodetool-ai/godot-templates";
import {
  checkFilledManifest,
  filledManifest,
  slotFill,
  SLOT_METADATA_KEY,
  type FilledManifest,
  type FilledSlot
} from "@nodetool-ai/protocol";
import {
  danglingReferences,
  extensionOf,
  isJoinError,
  joinGodotProject,
  under,
  verifyWithGodot
} from "@nodetool-ai/game-nodes";
import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";
import {
  exportGodotProjectSpec,
  listGameTemplatesSpec,
  verifyGodotProjectSpec
} from "./godot.specs.js";
import { userIdOf } from "../tools/mcp-tool-support.js";
import { isRecord, isString } from "../utils/type-guards.js";

export {
  LIST_GAME_TEMPLATES_SCHEMA,
  EXPORT_GODOT_PROJECT_SCHEMA,
  VERIFY_GODOT_PROJECT_SCHEMA
} from "./godot.specs.js";

type ToolError = { error: string };

const isError = (value: unknown): value is ToolError =>
  isRecord(value) && isString((value as ToolError).error);

const NO_WORKSPACE_ERROR =
  "No workspace is configured for this context, and a Godot project is a directory of files.";

// ---------------------------------------------------------------------------
// list_game_templates
// ---------------------------------------------------------------------------

const listGameTemplates: CapabilityExport = {
  spec: listGameTemplatesSpec,
  impl: async () => ({
    templates: listTemplates().map((t) => ({
      id: t.id,
      godot: t.manifest.godot,
      slots: t.manifest.slots,
      hooks: t.manifest.hooks
    }))
  })
};

// ---------------------------------------------------------------------------
// export_godot_project
// ---------------------------------------------------------------------------

interface SlotArg {
  slot_id: string;
  asset_id: string;
}

function slotArgs(raw: unknown): SlotArg[] | ToolError {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: "slots must be a non-empty array of {slot_id, asset_id}." };
  }
  const out: SlotArg[] = [];
  for (const entry of raw) {
    if (
      !isRecord(entry) ||
      !isString(entry["slot_id"]) ||
      !isString(entry["asset_id"])
    ) {
      return { error: "Each slot needs a string slot_id and asset_id." };
    }
    out.push({
      slot_id: entry["slot_id"],
      asset_id: entry["asset_id"].replace(/^asset:\/\//, "")
    });
  }
  return out;
}

/**
 * The filled manifest the slot args describe, read off each asset's stamped
 * fill. An asset without a fill, or with a fill for another slot, reports
 * rather than being guessed at.
 */
async function loadFilledManifest(
  run: CapabilityRun,
  template: string,
  slots: SlotArg[]
): Promise<FilledManifest | ToolError> {
  const userId = userIdOf(run.context);
  const { Asset } = await import("@nodetool-ai/models");
  const filled: FilledSlot[] = [];
  for (const { slot_id, asset_id } of slots) {
    const asset = await Asset.find(userId, asset_id);
    if (!asset) return { error: `Asset ${asset_id} for slot ${slot_id} was not found.` };
    const raw = asset.metadata?.[SLOT_METADATA_KEY];
    const parsed = slotFill.safeParse(raw);
    if (!parsed.success) {
      return {
        error:
          `Asset ${asset_id} carries no slot fill. Run it through the ` +
          `nodetool.game node for its kind first (SpriteSheet, Tileset, ` +
          `SeamlessImage, SoundEffect, MusicLoop).`
      };
    }
    if (parsed.data.slot_id !== slot_id) {
      return {
        error: `Asset ${asset_id} was filled for slot ${parsed.data.slot_id}, not ${slot_id}.`
      };
    }
    const ext = extensionOf(asset.name);
    const type = asset.content_type.startsWith("audio/") ? "audio" : "image";
    if (type === "image" && asset.content_type !== "image/png") {
      return {
        error:
          `Asset ${asset_id} for slot ${slot_id} is ${asset.content_type}; the ` +
          `Godot project names image assets .png. Re-run the image through its ` +
          `nodetool.game node, which stores a PNG.`
      };
    }
    filled.push({
      slot_id,
      asset: {
        type,
        uri: ext ? `asset://${asset_id}.${ext}` : `asset://${asset_id}`,
        asset_id
      },
      fill: parsed.data
    });
  }
  const result = filledManifest.safeParse({
    manifest_version: 1,
    template,
    slots: filled
  });
  if (!result.success) {
    return { error: `Filled manifest is malformed: ${result.error.message}` };
  }
  return result.data;
}

const exportGodotProject: CapabilityExport = {
  spec: exportGodotProjectSpec,
  impl: async (run, params) => {
    const workspace = run.context.workspace ?? null;
    if (!workspace) return { error: NO_WORKSPACE_ERROR };

    const templateId = params["template"];
    const name = params["name"];
    if (!isString(templateId) || !isString(name) || name.trim() === "") {
      return { error: "template and name must be non-empty strings." };
    }
    let template;
    try {
      template = getTemplate(templateId);
    } catch {
      return {
        error: `Unknown template ${templateId}. Templates: ${listTemplates()
          .map((t) => t.id)
          .join(", ")}.`
      };
    }
    const slots = slotArgs(params["slots"]);
    if (isError(slots)) return slots;
    const dir = isString(params["dir"]) && params["dir"].trim() !== ""
      ? params["dir"].replace(/\/+$/, "")
      : `godot/${name.replace(/[^a-z0-9_-]+/gi, "_")}`;
    const verify = params["verify"] !== false;
    const overwrite = params["overwrite"] === true;

    const filled = await loadFilledManifest(run, template.id, slots);
    if (isError(filled)) return filled;
    const problems = checkFilledManifest(template.manifest, filled);
    if (Object.keys(problems).length > 0) {
      return {
        error: "The filled slots do not satisfy the template's manifest.",
        problems
      };
    }

    const outcome = await joinGodotProject({
      manifest: template.manifest,
      templateDir: template.dir,
      godot: template.manifest.godot,
      name,
      dir,
      filled,
      workspace,
      context: run.context,
      verify,
      overwrite
    });
    if (isJoinError(outcome)) return outcome;

    return {
      dir,
      template: template.id,
      mode: outcome.mode,
      hooks: template.manifest.hooks,
      files_written: outcome.written.length + outcome.copied.length,
      files_preserved: outcome.preserved,
      assets_copied: outcome.copied,
      references_rewritten: outcome.rewritten,
      dangling_references: outcome.dangling,
      verification: outcome.verification,
      ok: outcome.ok
    };
  }
};

// ---------------------------------------------------------------------------
// verify_godot_project
// ---------------------------------------------------------------------------

const verifyGodotProject: CapabilityExport = {
  spec: verifyGodotProjectSpec,
  impl: async (run, params) => {
    const workspace = run.context.workspace ?? null;
    if (!workspace) return { error: NO_WORKSPACE_ERROR };
    const dir = params["dir"];
    if (!isString(dir) || dir.trim() === "") {
      return { error: "dir must be a non-empty string." };
    }
    if (!(await workspace.exists(under(dir, "project.godot")))) {
      return { error: `${dir} holds no project.godot.` };
    }
    const dangling = await danglingReferences(workspace, dir);
    const verification = await verifyWithGodot(workspace, dir);
    if (!verification.ran) {
      return { error: verification.reason, dangling_references: dangling };
    }
    return {
      dir,
      dangling_references: dangling,
      verification,
      ok: dangling.length === 0 && verification.ok === true
    };
  }
};

export const GODOT_CAPABILITIES: readonly CapabilityExport[] = [
  listGameTemplates,
  exportGodotProject,
  verifyGodotProject
];

export const module: CapabilityModule = {
  module: "godot",
  exports: GODOT_CAPABILITIES
};

export { listGameTemplates, exportGodotProject, verifyGodotProject };
