/**
 * `nodetool.game.*` — the template end of the Godot pipeline.
 *
 * `LoadGameTemplate` reads a shipped template's manifest and streams its asset
 * slots; `SlotPrompt` turns one slot into a prompt, a canvas and the prop bag
 * the matching checker wants; `ExportGodotProject` takes the checked fills and
 * writes a runnable project plus a zip of it, filling only the slots it was
 * given so the template's own placeholder art stands for the rest. The
 * checkers themselves stay where the bytes are —
 * `nodetool.game.SpriteSheet` / `Tileset` / `SeamlessImage` in image-nodes,
 * `SoundEffect` / `MusicLoop` in audio-nodes.
 *
 * All three are server-tagged: the template list comes through a model
 * interface and the export writes into the run's workspace.
 */

import { BaseNode, isString, prop } from "@nodetool-ai/node-sdk";
import { getTemplate, listTemplates } from "@nodetool-ai/godot-templates";
import {
  gameProjectDirectory,
  gameSlotSpec,
  slotPrompt,
  type Entity,
  type GameAssetManifest,
  type GameSlotSpec,
  type InputMode,
  type OutputCorrelation
} from "@nodetool-ai/protocol";
import {
  resolveEntities,
  type ProcessingContext,
  type Workspace
} from "@nodetool-ai/runtime";
import { tagAsServer } from "@nodetool-ai/nodes-utils";
import { zipSync } from "fflate";

import { resolveFills } from "../fills.js";
import {
  isJoinError,
  joinGodotProject,
  under,
  type GodotVerification
} from "../project.js";

/**
 * Template ids the install ships, for the `template` dropdown.
 *
 * Read once, and never allowed to throw: this runs while the node registry is
 * being built, and the packaged backend does not stage the template directory.
 * An empty list there costs a dropdown; letting the read throw would cost every
 * node in the process.
 */
const TEMPLATE_IDS: string[] = (() => {
  try {
    return listTemplates().map((t) => t.id);
  } catch {
    return [];
  }
})();

const trimmed = (value: unknown): string =>
  isString(value) ? value.trim() : "";

function requireContext(
  node: string,
  context: ProcessingContext | undefined
): ProcessingContext {
  if (!context) {
    throw new Error(`${node} requires a processing context.`);
  }
  return context;
}

/**
 * The template's manifest, from the context when the model interface is wired
 * and from the shipped templates otherwise.
 *
 * Both answer from the same `listTemplates()`; going through the context is
 * what lets a deployment ship its own templates, and the direct read is what
 * lets a hermetic test run the node with no interfaces at all.
 */
async function templateManifest(
  node: string,
  context: ProcessingContext | undefined,
  id: string
): Promise<GameAssetManifest> {
  if (id === "") {
    throw new Error(`${node}: template is required. One of: ${TEMPLATE_IDS.join(", ")}.`);
  }
  if (context?.hasModelInterface?.("listGameTemplates")) {
    const templates = await context.listGameTemplates();
    const found = templates.find((t) => t.id === id);
    if (found) return found.manifest;
    throw new Error(
      `${node}: unknown template ${id}. Templates: ${templates.map((t) => t.id).join(", ")}.`
    );
  }
  try {
    return getTemplate(id).manifest;
  } catch {
    throw new Error(
      `${node}: unknown template ${id}. Templates: ${TEMPLATE_IDS.join(", ")}.`
    );
  }
}

// ── LoadGameTemplate ─────────────────────────────────────────────────────────

type LoadGameTemplateOutputs = {
  manifest: GameAssetManifest;
  slots: GameSlotSpec[];
  slot: GameSlotSpec;
};

export class LoadGameTemplateNode extends BaseNode {
  static readonly nodeType = "nodetool.game.LoadGameTemplate";
  static readonly title = "Load Game Template";
  static readonly description =
    "Read a Godot game template's asset manifest and stream the slots it needs filled.\n    game, godot, template, manifest, slot\n\n    Use cases:\n    - Fan a graph out over every asset slot a template declares\n    - Drive one generator per slot kind from a Switch on the slot\n    - See what a template asks for before generating anything";
  static readonly metadataOutputTypes = {
    manifest: "dict",
    slots: "list[game_slot]",
    slot: "game_slot"
  };
  static readonly inlineFields = ["template"];
  static readonly inputFields: string[] = [];

  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation = {
    slot: { kind: "iteration", source: "__execution__", group: "slots" },
    slots: { kind: "single", source: "__execution__" },
    manifest: { kind: "single", source: "__execution__" }
  } satisfies Record<string, OutputCorrelation>;

  @prop({
    type: "str",
    default: TEMPLATE_IDS[0] ?? "",
    title: "Template",
    description: "Which shipped Godot template to read.",
    values: TEMPLATE_IDS
  })
  declare template: string;

  async process(
    context?: ProcessingContext
  ): Promise<LoadGameTemplateOutputs> {
    const manifest = await this._manifest(context);
    return {
      manifest,
      slots: manifest.slots,
      slot: manifest.slots[0]
    };
  }

  async *genProcess(
    context?: ProcessingContext
  ): AsyncGenerator<Partial<LoadGameTemplateOutputs>> {
    const manifest = await this._manifest(context);
    for (const slot of manifest.slots) {
      yield { slot };
    }
    yield { manifest, slots: manifest.slots };
  }

  private _manifest(
    context: ProcessingContext | undefined
  ): Promise<GameAssetManifest> {
    return templateManifest(
      LoadGameTemplateNode.title,
      context,
      trimmed(this.template)
    );
  }
}

// ── SlotPrompt ───────────────────────────────────────────────────────────────

type SlotPromptOutputs = {
  prompt: string;
  width: number;
  height: number;
  kind: string;
  checker: Record<string, unknown>;
  seconds: number;
};

export class SlotPromptNode extends BaseNode {
  static readonly nodeType = "nodetool.game.SlotPrompt";
  static readonly title = "Slot Prompt";
  static readonly description =
    "Turn one game asset slot into a generation job: the prompt seasoned with the style and cast, the canvas to render it at, and the prop bag its checker wants.\n    game, godot, slot, prompt, entity, style\n\n    Use cases:\n    - Re-skin a whole asset pack by swapping one style entity\n    - Size a sprite sheet or tileset from the template instead of by hand\n    - Feed a checker its cell size and slot id with no copied numbers";
  static readonly metadataOutputTypes = {
    prompt: "str",
    width: "int",
    height: "int",
    kind: "str",
    checker: "dict",
    seconds: "float"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields = ["slot", "style", "cast"];

  @prop({
    type: "game_slot",
    default: null,
    title: "Slot",
    description: "The manifest slot to generate, from LoadGameTemplate."
  })
  declare slot: unknown;

  @prop({
    type: "entity",
    default: null,
    title: "Style",
    description:
      "The style entity every slot is seasoned with. Swapping it re-skins the whole pack."
  })
  declare style: Entity | null;

  @prop({
    type: "list[entity]",
    default: [],
    title: "Cast",
    description:
      "Characters and props this slot shows. Every entity given is injected, so wire only the ones the slot is for."
  })
  declare cast: Entity[];

  async process(context?: ProcessingContext): Promise<SlotPromptOutputs> {
    const name = SlotPromptNode.title;
    const parsed = gameSlotSpec.safeParse(this.slot);
    if (!parsed.success) {
      throw new Error(
        `${name}: slot is not a game slot spec. ${parsed.error.issues
          .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
          .join("; ")}`
      );
    }
    const slot = parsed.data;
    const [style] = await resolveEntities(
      this.style ? [this.style] : [],
      context
    );
    const cast = await resolveEntities(
      Array.isArray(this.cast) ? this.cast : [],
      context
    );
    const result = slotPrompt(slot, style ?? null, cast);
    return {
      prompt: result.prompt,
      width: result.width,
      height: result.height,
      kind: slot.kind,
      checker: result.checker,
      seconds: slot.kind === "sfx" || slot.kind === "music" ? slot.seconds : 0
    };
  }
}

// ── ExportGodotProject ───────────────────────────────────────────────────────

/**
 * What the export writes and what Godot made of it.
 *
 * `output` is the one handle a single `nodetool.output.Output` takes, so a
 * graph does not need five wires to report a project. Everything on it is also
 * a handle of its own, for a graph that wants one.
 */
type ExportGodotProjectOutputs = {
  output: { directory: string; verified: boolean; archive: string };
  directory: string;
  files: string[];
  verified: boolean;
  verification: GodotVerification;
  errors: string[];
  archive: string;
};

/** Every file under `dir`, project-relative, sorted. */
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
 * Zip the exported project to `<dir>.zip`, every entry under the project's own
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
    const bytes = await workspace.read(under(dir, rel));
    if (bytes) entries[`${root}/${rel}`] = bytes;
  }
  const archive = `${dir}.zip`;
  await workspace.write(archive, zipSync(entries), "application/zip");
  return archive;
}

export class ExportGodotProjectNode extends BaseNode {
  static readonly nodeType = "nodetool.game.ExportGodotProject";
  static readonly title = "Export Godot Project";
  static readonly description =
    "Write a runnable Godot 4 project into the workspace from a template and its filled asset slots, zip it, then verify it under headless Godot when one is installed.\n    game, godot, export, project, slot\n\n    Use cases:\n    - Turn a pack of checked game assets into a project you can open\n    - Export a template with its placeholder art, to fill in by hand later\n    - Prove the exported project imports and its smoke scene runs";
  static readonly metadataOutputTypes = {
    output: "dict",
    directory: "str",
    files: "list[str]",
    verified: "bool",
    verification: "dict",
    errors: "list[str]",
    archive: "str"
  };
  static readonly inlineFields = ["template", "name", "verify"];
  static readonly inputFields = ["fills", "name", "directory"];

  @prop({
    type: "str",
    default: TEMPLATE_IDS[0] ?? "",
    title: "Template",
    description: "The template the fills were generated for.",
    values: TEMPLATE_IDS
  })
  declare template: string;

  @prop({
    type: "str",
    default: "",
    title: "Name",
    description: "Project name, written into project.godot."
  })
  declare name: string;

  @prop({
    type: "list[union[image,audio]]",
    default: [],
    title: "Fills",
    description:
      "One entry per slot to fill: the output handle of the nodetool.game checker that accepted it. A slot nobody feeds keeps the template's placeholder, and an empty list exports the template as it ships. The fill handle alone has no asset and is refused."
  })
  declare fills: unknown[];

  @prop({
    type: "str",
    default: "",
    title: "Directory",
    description:
      "Workspace directory to write into. Blank derives games/<slug> from the project name."
  })
  declare directory: string;

  @prop({
    type: "bool",
    default: true,
    title: "Verify",
    description:
      "Import the project, syntax-check its scripts and run its smoke scene. Skipped when the workspace is not local or no Godot binary is installed."
  })
  declare verify: boolean;

  async process(
    context?: ProcessingContext
  ): Promise<ExportGodotProjectOutputs> {
    const node = ExportGodotProjectNode.title;
    const ctx = requireContext(node, context);
    const workspace: Workspace | null = ctx.workspace ?? null;
    if (!workspace) {
      throw new Error(
        `${node}: this run has no workspace, and a Godot project is a directory of files.`
      );
    }
    const name = trimmed(this.name);
    if (name === "") {
      throw new Error(`${node}: name is required; it becomes the project's name.`);
    }
    const templateId = trimmed(this.template);
    const manifest = await templateManifest(node, ctx, templateId);
    // The layout needs the template's own scenes and scripts, not just its
    // manifest, so the directory has to be on disk whatever listed the manifest.
    let template;
    try {
      template = getTemplate(manifest.template);
    } catch {
      throw new Error(
        `${node}: the ${manifest.template} template's project directory is not installed, ` +
          `so there is nothing to lay the generated assets over.`
      );
    }

    const fills = Array.isArray(this.fills) ? this.fills : [];
    let resolved;
    try {
      resolved = resolveFills(template.id, fills);
    } catch (error) {
      throw new Error(
        `${node}: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const directory =
      trimmed(this.directory).replace(/\/+$/, "") || gameProjectDirectory(name);

    // Only the filled slots reach the writer: a slot nobody fed keeps the
    // template's own placeholder (D27), and no fills at all is the blank
    // template with its placeholder art (game-prd § 4.1). The
    // `export_godot_project` capability, which does want every slot, checks the
    // whole manifest itself before it calls the same join.
    const outcome = await joinGodotProject({
      manifest,
      templateDir: template.dir,
      godot: manifest.godot,
      name,
      dir: directory,
      filled: resolved.manifest,
      workspace,
      context: ctx,
      refs: resolved.refs,
      verify: this.verify !== false,
      overwrite: false
    });
    if (isJoinError(outcome)) {
      const detail = Array.isArray(outcome.problems)
        ? ` ${outcome.problems.join("; ")}`
        : outcome.problems
          ? ` ${Object.entries(outcome.problems)
              .map(([slot, list]) => `${slot}: ${list.join(", ")}`)
              .join("; ")}`
          : "";
      throw new Error(`${node}: ${outcome.error}${detail}`);
    }

    const files = await projectFiles(workspace, directory);
    const archive = await writeArchive(workspace, directory, files);

    const dangling = outcome.dangling.map((ref) => `dangling reference: ${ref}`);
    const skipped = outcome.verification.ran
      ? []
      : [`godot verification skipped: ${outcome.verification.reason}`];

    // `verified` is only true when Godot actually ran and objected to nothing.
    // A skipped verification reports its reason and stays false: an export
    // nobody checked is not a checked export (D28).
    const verified =
      outcome.verification.ran &&
      outcome.verification.errors.length === 0 &&
      dangling.length === 0;

    return {
      output: { directory, verified, archive },
      directory,
      files,
      verified,
      verification: outcome.verification,
      errors: [...dangling, ...outcome.verification.errors, ...skipped],
      archive
    };
  }
}

export const GAME_TEMPLATE_NODES = tagAsServer([
  LoadGameTemplateNode,
  SlotPromptNode,
  ExportGodotProjectNode
]);
