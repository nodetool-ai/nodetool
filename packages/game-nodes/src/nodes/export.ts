/**
 * `nodetool.game.ExportGodotProject` — the last node of a game graph
 * (game-prd § 5.5).
 *
 * One dynamic input per template slot, named by the slot id, each fed from a
 * checker node's `fill` output. The node turns those fills into a filled
 * manifest, hands it to the shared export join, and writes the project into the
 * workspace plus a `<directory>.zip` beside it so the landing's "Download
 * project" is one file.
 *
 * Two rules the checklist depends on:
 *
 *  - A node with **no** slot inputs exports the template with its own
 *    placeholder art (game-prd § 4.1's blank path), and a slot nobody fed keeps
 *    its placeholder (D27). A fill for a slot this template does not have, or a
 *    fill whose own `slot_id` names a different slot, is an error naming both.
 *  - `verified` is true only when Godot actually ran and passed. A skipped
 *    verification reports `verified: false` with `verification.reason` (D28) —
 *    it never reports green from a check that did not happen.
 */

import { BaseNode, isObjectLike, isString, prop } from "@nodetool-ai/node-sdk";
import type { TypeMetadata } from "@nodetool-ai/node-sdk";
import type { ProcessingContext, Workspace } from "@nodetool-ai/runtime";
import { getTemplate, listTemplates } from "@nodetool-ai/godot-templates";
import { tagAsNode } from "@nodetool-ai/nodes-utils";
import {
  filledManifest,
  gameProjectDirectory,
  slotFill,
  type FilledSlot,
  type SlotFill
} from "@nodetool-ai/protocol";
import { zipSync } from "fflate";
import {
  isJoinError,
  joinGodotProject,
  type GodotVerification
} from "../export-join.js";

const TITLE = "Export Godot Project";

/**
 * Template ids offered on the `template` prop, read from the shipped set.
 *
 * Read at decoration time, because a prop's enum is part of the node's
 * metadata. The registry loads this module to boot the server, so a template
 * directory the packaged backend cannot find must leave the enum empty and fail
 * the node's own run — not the load that starts the process.
 */
const TEMPLATE_IDS: readonly string[] = (() => {
  try {
    return listTemplates().map((template) => template.id);
  } catch {
    return [];
  }
})();

/** The ids to name in an error, read now rather than at module load. */
function availableTemplateIds(): string {
  try {
    const ids = listTemplates().map((template) => template.id);
    return ids.length > 0 ? ids.join(", ") : "none are installed";
  } catch (error) {
    return `none could be read (${error instanceof Error ? error.message : String(error)})`;
  }
}

/** The extension the project names a slot's file with, per fill kind. */
const AUDIO_KINDS = new Set(["sfx", "music"]);

type ExportOutputs = {
  output: { directory: string; verified: boolean };
  directory: string;
  files: string[];
  verified: boolean;
  verification: GodotVerification;
  errors: string[];
  archive: string;
};

/** A checker's `fill` output: the protocol fill plus where its asset landed. */
function readSlotInput(
  slotId: string,
  value: unknown
): { fill: SlotFill; assetId: string; uri: string } {
  if (!isObjectLike(value)) {
    throw new Error(
      `${TITLE}: input "${slotId}" is not a slot fill. Connect the checker node's "fill" output.`
    );
  }
  const record = value as Record<string, unknown>;
  const parsed = slotFill.safeParse(record);
  if (!parsed.success) {
    throw new Error(
      `${TITLE}: input "${slotId}" is not a slot fill. Connect the checker node's "fill" output ` +
        `(nodetool.game.SpriteSheet, Tileset, SeamlessImage, SoundEffect or MusicLoop).`
    );
  }
  if (parsed.data.slot_id !== slotId) {
    throw new Error(
      `${TITLE}: input "${slotId}" carries a fill for slot "${parsed.data.slot_id}". ` +
        `Set the checker's slot_id to "${slotId}", or connect it to the "${parsed.data.slot_id}" input.`
    );
  }
  const assetId = isString(record["asset_id"]) ? record["asset_id"] : "";
  if (assetId === "") {
    throw new Error(
      `${TITLE}: slot "${slotId}" has no stored asset, so there are no bytes to copy into the ` +
        `project. Run the graph where assets are stored, or connect a checker whose fill carries asset_id.`
    );
  }
  const uri = isString(record["uri"]) && record["uri"] !== ""
    ? record["uri"]
    : `asset://${assetId}`;
  return { fill: parsed.data, assetId, uri };
}

/** Every file under `dir`, workspace-relative, sorted. */
async function projectFiles(
  workspace: Workspace,
  dir: string
): Promise<string[]> {
  const entries = await workspace.list(dir, { recursive: true });
  return entries
    .filter((entry) => !entry.isDirectory)
    .map((entry) =>
      entry.path.startsWith(`${dir}/`) ? entry.path.slice(dir.length + 1) : entry.path
    )
    .sort();
}

/**
 * Zip the exported project to `<dir>.zip`, entries under the project's own
 * folder name so unpacking gives a directory rather than loose files.
 */
async function writeArchive(
  workspace: Workspace,
  dir: string,
  files: readonly string[]
): Promise<string> {
  const root = dir.split("/").filter((part) => part !== "").pop() ?? "project";
  const entries: Record<string, Uint8Array> = {};
  for (const rel of files) {
    const bytes = await workspace.read(`${dir}/${rel}`);
    if (bytes) entries[`${root}/${rel}`] = bytes;
  }
  const archive = `${dir}.zip`;
  await workspace.write(archive, zipSync(entries), "application/zip");
  return archive;
}

export class ExportGodotProjectNode extends BaseNode {
  static readonly nodeType = "nodetool.game.ExportGodotProject";
  static readonly title = TITLE;
  static readonly description =
    "Exports a Godot 4 project into the workspace: copies the chosen template, writes a resource for every filled slot, copies the assets, checks that every res:// reference resolves, zips the result, and verifies it under headless Godot when a binary is present.\n    game, godot, export, project, slot\n\n    Use cases:\n    - Turn a graph of checked game assets into a project that opens in Godot\n    - Export a template with its placeholder art, to fill in by hand later\n    - Prove a generated project imports and its scripts parse before handing it over";
  static readonly metadataOutputTypes = {
    output: "dict",
    directory: "str",
    files: "list[str]",
    verified: "bool",
    verification: "dict",
    errors: "list[str]",
    archive: "str"
  };
  static readonly supportsDynamicInputs = true;
  /** One dynamic input per slot, each a checker's `fill` dict. */
  static readonly allowedDynamicSlotTypes: TypeMetadata[] = [
    { type: "dict", type_args: [] }
  ];
  static readonly inlineFields = ["verify", "overwrite"];
  static readonly inputFields: string[] = [];

  @prop({
    type: "str",
    default: TEMPLATE_IDS[0] ?? "platformer",
    title: "Template",
    description: "The game template to export.",
    values: [...TEMPLATE_IDS]
  })
  declare template: string;

  @prop({
    type: "str",
    default: "",
    title: "Name",
    description: "The project's config/name in Godot."
  })
  declare name: string;

  @prop({
    type: "str",
    default: "",
    title: "Directory",
    description:
      "Workspace-relative export directory. Blank derives games/<slug> from the name."
  })
  declare directory: string;

  @prop({
    type: "bool",
    default: true,
    title: "Verify",
    description:
      "Import the project, parse its scripts and run its smoke scene under headless Godot. Needs a local workspace and a Godot binary; otherwise the reason is reported and verified stays false."
  })
  declare verify: boolean;

  @prop({
    type: "bool",
    default: false,
    title: "Overwrite",
    description:
      "Replace every template file in the directory. Off keeps scripts and scenes edited after an earlier export and refreshes only the assets."
  })
  declare overwrite: boolean;

  async process(context?: ProcessingContext): Promise<ExportOutputs> {
    const workspace = context?.workspace ?? null;
    if (!workspace) {
      throw new Error(
        `${TITLE}: no workspace is configured for this run, and a Godot project is a directory of files.`
      );
    }

    const name = (this.name ?? "").trim();
    if (name === "") {
      throw new Error(`${TITLE}: name is required — it is the project's config/name.`);
    }
    let template;
    try {
      template = getTemplate(this.template);
    } catch {
      throw new Error(
        `${TITLE}: unknown template "${this.template}". Templates: ${availableTemplateIds()}.`
      );
    }

    const specs = new Map(template.manifest.slots.map((slot) => [slot.id, slot]));
    const slots: FilledSlot[] = [];
    for (const [slotId, value] of this.dynamicProps) {
      if (!specs.has(slotId)) {
        throw new Error(
          `${TITLE}: template ${template.id} has no slot "${slotId}". Its slots are: ${[
            ...specs.keys()
          ].join(", ")}.`
        );
      }
      const { fill, assetId, uri } = readSlotInput(slotId, value);
      slots.push({
        slot_id: slotId,
        asset: {
          type: AUDIO_KINDS.has(fill.kind) ? "audio" : "image",
          uri,
          asset_id: assetId
        },
        fill
      });
    }

    const filled = filledManifest.parse({
      manifest_version: 1,
      template: template.id,
      slots
    });

    const dir =
      isString(this.directory) && this.directory.trim() !== ""
        ? this.directory.trim().replace(/\/+$/, "")
        : gameProjectDirectory(name);

    const outcome = await joinGodotProject({
      manifest: template.manifest,
      templateDir: template.dir,
      godot: template.manifest.godot,
      name,
      dir,
      filled,
      workspace,
      context,
      verify: this.verify !== false,
      overwrite: this.overwrite === true
    });
    if (isJoinError(outcome)) {
      const detail = Array.isArray(outcome.problems)
        ? ` ${outcome.problems.join("; ")}`
        : outcome.problems
          ? ` ${Object.entries(outcome.problems)
              .map(([slot, list]) => `${slot}: ${list.join(", ")}`)
              .join("; ")}`
          : "";
      throw new Error(`${TITLE}: ${outcome.error}${detail}`);
    }

    const files = await projectFiles(workspace, dir);
    const archive = await writeArchive(workspace, dir, files);

    // `verified` follows the run, never the intent: a verification that did not
    // run is false with a reason (D28).
    const verified =
      outcome.verification.ran && outcome.verification.ok === true;
    const errors = [
      ...outcome.dangling.map(
        (reference) => `Unresolved reference: ${reference}`
      ),
      ...(outcome.verification.ran && outcome.verification.ok !== true
        ? ["Godot verification failed — see the verification output."]
        : [])
    ];

    return {
      output: { directory: dir, verified },
      directory: dir,
      files,
      verified,
      verification: outcome.verification,
      errors,
      archive
    };
  }
}

/**
 * Node tier only, not the wider server set: this node reads the template off
 * the filesystem and spawns a Godot binary, and the Workers and edge tiers have
 * neither.
 */
export const GAME_EXPORT_NODES = tagAsNode([ExportGodotProjectNode]);
