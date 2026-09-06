/**
 * Manifest + design + choices → the graph that fills every slot and exports the
 * Godot project (game-prd § 5.3).
 *
 * Pure, and built without a model call (D26): every slot is a fixed chain its
 * kind determines, so the cost is countable before the run, a re-run
 * regenerates, and `nodetool debug` runs the same graph headlessly.
 *
 * The output is a {@link WorkflowPlacement} — the same ordered node and edge
 * list the Workflow flow's build replays through `ui_add_node` /
 * `ui_update_node_data` / `ui_connect_nodes`, so one build path serves both
 * flows.
 *
 * Nothing is placed that cannot be named (D23). A node type the registry does
 * not have, a handle the builder cannot find: the slot is reported in `issues`
 * and skipped whole. A half-placed chain would validate and produce nothing,
 * which is worse than a missing one.
 */

import type { GameDesign } from "./api-schemas/workflows.js";
import type { GameAssetManifest, GameSlotSpec } from "./game-assets.js";
import { gameSlotPrompt, type GameStyleChoice } from "./game-flow-prompt.js";
import {
  PLAN_OUTPUT_NODE_TYPE,
  type PlacementEdge,
  type PlacementNode,
  type PlanNodeHandle,
  type PlanNodeLookup,
  type PlanNodeShape,
  type WorkflowPlacement
} from "./workflow-plan.js";

// ── The node types a game graph is made of ──────────────────────────────────

export const GAME_TEXT_TO_IMAGE_NODE_TYPE = "nodetool.image.TextToImage";
export const GAME_RESIZE_NODE_TYPE = "nodetool.image.ResizeImage";
export const GAME_TEXT_TO_MUSIC_NODE_TYPE = "nodetool.audio.TextToMusic";
export const GAME_SPRITESHEET_NODE_TYPE = "nodetool.game.SpriteSheet";
export const GAME_TILESET_NODE_TYPE = "nodetool.game.Tileset";
export const GAME_SEAMLESS_IMAGE_NODE_TYPE = "nodetool.game.SeamlessImage";
export const GAME_SOUND_EFFECT_NODE_TYPE = "nodetool.game.SoundEffect";
export const GAME_MUSIC_LOOP_NODE_TYPE = "nodetool.game.MusicLoop";
export const GAME_EXPORT_NODE_TYPE = "nodetool.game.ExportGodotProject";
export const GAME_PREVIEW_NODE_TYPE = "nodetool.workflows.base_node.Preview";

/** The output node the export result lands on, named for the landing step. */
export const GAME_PROJECT_OUTPUT_NAME = "project";

/** The checker handle the export node reads: the stamped asset, not the bare fill. */
const CHECKER_ASSET_HANDLE = "output";

/** The export node's list input every checker's asset lands on. */
const EXPORT_FILLS_INPUT = "fills";

/**
 * Prompt input names a sound-effect generator may use, best first. FAL's
 * ElevenLabs node calls it `text`; others call it `prompt`.
 */
const SFX_PROMPT_INPUTS = ["prompt", "text"] as const;

/** Duration input names a sound-effect generator may use, best first. */
const SFX_DURATION_INPUTS = ["duration", "duration_seconds", "seconds"] as const;

/** Resolutions `nodetool.image.TextToImage` offers, and the short edge each gives. */
const IMAGE_RESOLUTIONS: readonly (readonly [string, number])[] = [
  ["1K", 1024],
  ["2K", 2048],
  ["4K", 4096]
];

// ── Choices the Look step makes ─────────────────────────────────────────────

export interface GameGraphChoices {
  /** The `image_model` property value, as the model tile row produced it. */
  imageModel: Record<string, unknown>;
  /** A text-to-audio node type, or null to keep the template's placeholders. */
  sfxNodeType: string | null;
  /** The `music_model` property value, or null to keep the placeholder. */
  musicModel: Record<string, unknown> | null;
  style: { name: string; descriptor: string } | null;
  projectName: string;
  /** Workspace-relative export directory, `games/<slug>`. */
  directory: string;
  verify: boolean;
}

// ── Project naming ──────────────────────────────────────────────────────────

/**
 * A directory-safe slug for a project name: lowercase, dashes, nothing a
 * workspace path or a Godot project folder has to quote. An empty or
 * punctuation-only name falls back to `game` rather than to an empty segment,
 * which would export to the `games/` directory itself.
 */
export function gameProjectSlug(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug.length > 0 ? slug : "game";
}

/** Where the export node writes: `games/<slug>`. */
export function gameProjectDirectory(name: string): string {
  return `games/${gameProjectSlug(name)}`;
}

// ── Layout ──────────────────────────────────────────────────────────────────

const COLUMN_WIDTH = 300;
const ROW_HEIGHT = 200;
const position = (column: number, row: number) => ({
  x: 80 + column * COLUMN_WIDTH,
  y: 80 + row * ROW_HEIGHT
});

const COLUMN_GENERATE = 0;
const COLUMN_RESIZE = 1;
const COLUMN_CHECK = 2;
const COLUMN_PREVIEW = 3;
const COLUMN_EXPORT = 4;
const COLUMN_OUTPUT = 5;

// ── Handle resolution ───────────────────────────────────────────────────────

const inputNamed = (shape: PlanNodeShape, name: string): PlanNodeHandle | null =>
  shape.inputs.find((handle) => handle.name === name) ?? null;

const firstInputOfType = (
  shape: PlanNodeShape,
  type: string
): PlanNodeHandle | null =>
  shape.inputs.find((handle) => handle.type === type) ?? null;

const outputNamed = (shape: PlanNodeShape, name: string): PlanNodeHandle | null =>
  shape.outputs.find((handle) => handle.name === name) ?? null;

const firstOutputOfType = (
  shape: PlanNodeShape,
  type: string
): PlanNodeHandle | null =>
  shape.outputs.find((handle) => handle.type === type) ?? null;

/** Smallest resolution whose short edge covers the slot, so the resize scales down. */
function resolutionFor(width: number, height: number): string {
  const shortEdge = Math.min(width, height);
  for (const [name, edge] of IMAGE_RESOLUTIONS) {
    if (edge >= shortEdge) {
      return name;
    }
  }
  return IMAGE_RESOLUTIONS[IMAGE_RESOLUTIONS.length - 1][0];
}

/**
 * The inline entities a generation carries: the style, plus this slot's cast
 * member as a character. Both are inline `{type: "entity"}` values, which
 * `TextToImage` accepts without a library row.
 */
function entitiesFor(
  choices: GameGraphChoices,
  design: GameDesign,
  slot: GameSlotSpec
): Record<string, unknown>[] {
  const entities: Record<string, unknown>[] = [];
  if (choices.style) {
    entities.push({
      type: "entity",
      kind: "style",
      name: choices.style.name,
      descriptor: choices.style.descriptor
    });
  }
  const member = design.cast.find((entry) => entry.slot_id === slot.id);
  if (member) {
    entities.push({
      type: "entity",
      kind: "character",
      name: member.name,
      descriptor: member.descriptor
    });
  }
  return entities;
}

/** The checker node type one slot kind is measured by. */
function checkerTypeFor(slot: GameSlotSpec): string {
  switch (slot.kind) {
    case "spritesheet":
      return GAME_SPRITESHEET_NODE_TYPE;
    case "tileset":
      return GAME_TILESET_NODE_TYPE;
    case "image":
      return GAME_SEAMLESS_IMAGE_NODE_TYPE;
    case "sfx":
      return GAME_SOUND_EFFECT_NODE_TYPE;
    case "music":
      return GAME_MUSIC_LOOP_NODE_TYPE;
  }
}

/** The properties a checker is configured with, straight off the slot spec. */
function checkerPropertiesFor(slot: GameSlotSpec): Record<string, unknown> {
  switch (slot.kind) {
    case "spritesheet":
      return {
        slot_id: slot.id,
        cell_width: slot.cell[0],
        cell_height: slot.cell[1],
        animations: slot.animations,
        fps: slot.fps
      };
    case "tileset":
      return {
        slot_id: slot.id,
        cell_width: slot.cell[0],
        cell_height: slot.cell[1],
        count: slot.count
      };
    case "image":
      return {
        slot_id: slot.id,
        check_x: slot.seamless_x,
        check_y: slot.seamless_y
      };
    case "sfx":
      return { slot_id: slot.id, seconds: slot.seconds };
    case "music":
      return { slot_id: slot.id, seconds: slot.seconds };
  }
}

// ── The builder ─────────────────────────────────────────────────────────────

/**
 * Build the slot-filling graph for one template.
 *
 * One row per slot, left to right: generate, resize to the slot's exact
 * pixels, check and stamp, preview. Every checker's stamped `output` feeds the
 * one export node's `fills` list, and the export node's `output` lands on an
 * `Output` named `project`.
 *
 * Audio slots are skipped without an issue when the creator kept the
 * placeholders (D27) — an omitted slot is a choice, not a failure.
 */
export function gameGraphPlacement(
  manifest: GameAssetManifest,
  design: GameDesign,
  choices: GameGraphChoices,
  lookup: PlanNodeLookup
): WorkflowPlacement {
  const nodes: PlacementNode[] = [];
  const edges: PlacementEdge[] = [];
  const issues: string[] = [];

  const style: GameStyleChoice | null = choices.style
    ? { descriptor: choices.style.descriptor }
    : null;
  const subjects = new Map(
    design.slot_prompts.map((entry) => [entry.slot_id, entry.prompt])
  );

  const shapeOf = (nodeType: string, label: string): PlanNodeShape | null => {
    const shape = lookup(nodeType);
    if (!shape) {
      issues.push(
        `${label} needs "${nodeType}", which the registry does not have, so nothing was placed for it.`
      );
      return null;
    }
    return shape;
  };

  /** Slot id → the checker node whose stamped asset the export node reads. */
  const checkerFills: { slotId: string; nodeId: string; handle: string }[] = [];

  manifest.slots.forEach((slot, row) => {
    const label = `slot "${slot.id}"`;
    const subject = subjects.get(slot.id) ?? slot.prompt ?? slot.id;
    const built = gameSlotPrompt(slot, subject, style, design.cast);

    // The generator, and the resize step the image kinds need.
    const audio = slot.kind === "sfx" || slot.kind === "music";
    const generatorType = audio
      ? slot.kind === "sfx"
        ? choices.sfxNodeType
        : GAME_TEXT_TO_MUSIC_NODE_TYPE
      : GAME_TEXT_TO_IMAGE_NODE_TYPE;

    // Keeping the template's placeholder audio is a choice (D27), not an issue.
    if (slot.kind === "sfx" && choices.sfxNodeType === null) {
      return;
    }
    if (slot.kind === "music" && choices.musicModel === null) {
      return;
    }
    if (generatorType === null) {
      return;
    }

    const generatorShape = shapeOf(generatorType, label);
    if (!generatorShape) {
      return;
    }
    const checkerType = checkerTypeFor(slot);
    const checkerShape = shapeOf(checkerType, label);
    if (!checkerShape) {
      return;
    }

    // Everything this chain needs is resolved before a node is pushed, so a
    // slot the builder cannot finish leaves no half-placed chain behind.
    const chainNodes: PlacementNode[] = [];
    const chainEdges: PlacementEdge[] = [];
    const generatorId = `gen_${row + 1}`;
    const checkerId = `check_${row + 1}`;

    if (audio) {
      const generatorOut = firstOutputOfType(generatorShape, "audio");
      if (!generatorOut) {
        issues.push(
          `${label} needs an audio output on "${generatorType}", which has none, so nothing was placed for it.`
        );
        return;
      }
      const properties: Record<string, unknown> = {};
      if (slot.kind === "music") {
        properties["model"] = choices.musicModel;
      }
      const promptInput =
        SFX_PROMPT_INPUTS.map((name) => inputNamed(generatorShape, name)).find(
          (handle) => handle !== null
        ) ?? null;
      if (!promptInput) {
        issues.push(
          `${label} needs a prompt input on "${generatorType}", which has none, so nothing was placed for it.`
        );
        return;
      }
      properties[promptInput.name] = built.prompt;
      const durationInput =
        SFX_DURATION_INPUTS.map((name) => inputNamed(generatorShape, name)).find(
          (handle) => handle !== null
        ) ?? null;
      if (durationInput) {
        // FAL's ElevenLabs node types its duration as a string; others take a
        // number. Match the handle rather than the manifest, or the graph
        // fails validation on a property nobody looked at.
        properties[durationInput.name] =
          durationInput.type === "str" ? String(slot.seconds) : slot.seconds;
      }

      const checkerIn = firstInputOfType(checkerShape, "audio");
      if (!checkerIn) {
        issues.push(
          `${label} needs an audio input on "${checkerType}", which has none, so nothing was placed for it.`
        );
        return;
      }
      chainNodes.push({
        id: generatorId,
        type: generatorType,
        position: position(COLUMN_GENERATE, row),
        properties,
        setupStepId: slot.id
      });
      chainEdges.push({
        source: generatorId,
        sourceHandle: generatorOut.name,
        target: checkerId,
        targetHandle: checkerIn.name
      });
    } else {
      const generatorOut = firstOutputOfType(generatorShape, "image");
      if (!generatorOut) {
        issues.push(
          `${label} needs an image output on "${generatorType}", which has none, so nothing was placed for it.`
        );
        return;
      }
      const resizeShape = shapeOf(GAME_RESIZE_NODE_TYPE, label);
      if (!resizeShape) {
        return;
      }
      const resizeIn = firstInputOfType(resizeShape, "image");
      const resizeOut = firstOutputOfType(resizeShape, "image");
      const checkerIn = firstInputOfType(checkerShape, "image");
      if (!resizeIn || !resizeOut || !checkerIn) {
        issues.push(
          `${label} could not be wired: the resize or checker node has no image handle, so nothing was placed for it.`
        );
        return;
      }
      const { width, height } = built;
      if (width === undefined || height === undefined) {
        issues.push(
          `${label} has no pixel size, so there is nothing to resize to and nothing was placed for it.`
        );
        return;
      }
      const resizeId = `resize_${row + 1}`;
      chainNodes.push(
        {
          id: generatorId,
          type: generatorType,
          position: position(COLUMN_GENERATE, row),
          properties: {
            model: choices.imageModel,
            prompt: built.prompt,
            aspect_ratio: built.aspectRatio,
            resolution: resolutionFor(width, height),
            entities: entitiesFor(choices, design, slot)
          },
          setupStepId: slot.id
        },
        {
          id: resizeId,
          type: GAME_RESIZE_NODE_TYPE,
          position: position(COLUMN_RESIZE, row),
          properties: { mode: "dimensions", width, height },
          setupStepId: slot.id
        }
      );
      chainEdges.push(
        {
          source: generatorId,
          sourceHandle: generatorOut.name,
          target: resizeId,
          targetHandle: resizeIn.name
        },
        {
          source: resizeId,
          sourceHandle: resizeOut.name,
          target: checkerId,
          targetHandle: checkerIn.name
        }
      );
    }

    const assetOut = outputNamed(checkerShape, CHECKER_ASSET_HANDLE);
    if (!assetOut) {
      issues.push(
        `${label} needs an "${CHECKER_ASSET_HANDLE}" output on "${checkerType}", which has none, so nothing was placed for it.`
      );
      return;
    }

    chainNodes.push({
      id: checkerId,
      type: checkerType,
      position: position(COLUMN_CHECK, row),
      properties: checkerPropertiesFor(slot),
      setupStepId: slot.id
    });

    // The preview is what puts the asset on the canvas. It is the one part of
    // a chain that may be missing without the chain being wrong.
    const previewShape = lookup(GAME_PREVIEW_NODE_TYPE);
    if (previewShape) {
      const previewIn = previewShape.inputs[0];
      if (previewIn) {
        const previewId = `preview_${row + 1}`;
        chainNodes.push({
          id: previewId,
          type: GAME_PREVIEW_NODE_TYPE,
          position: position(COLUMN_PREVIEW, row),
          properties: { name: slot.id },
          setupStepId: slot.id
        });
        chainEdges.push({
          source: checkerId,
          sourceHandle: assetOut.name,
          target: previewId,
          targetHandle: previewIn.name
        });
      }
    }

    nodes.push(...chainNodes);
    edges.push(...chainEdges);
    checkerFills.push({
      slotId: slot.id,
      nodeId: checkerId,
      handle: assetOut.name
    });
  });

  // The export node, fed by every placed checker at once.
  const exportShape = lookup(GAME_EXPORT_NODE_TYPE);
  if (!exportShape) {
    issues.push(
      `the export node "${GAME_EXPORT_NODE_TYPE}" is not in the registry, so the graph fills slots but writes no project.`
    );
    return { nodes, edges, issues };
  }

  const fillsInput = inputNamed(exportShape, EXPORT_FILLS_INPUT);
  if (!fillsInput) {
    issues.push(
      `the export node has no "${EXPORT_FILLS_INPUT}" input, so the checked assets have nowhere to land.`
    );
    return { nodes, edges, issues };
  }
  const exportId = "export";
  nodes.push({
    id: exportId,
    type: GAME_EXPORT_NODE_TYPE,
    position: position(COLUMN_EXPORT, 0),
    properties: {
      template: manifest.template,
      name: choices.projectName,
      directory: choices.directory,
      verify: choices.verify
    }
  });
  // Many edges into one list input: the kernel folds them into the `fills`
  // list in arrival order, so one handle takes every slot.
  for (const fill of checkerFills) {
    edges.push({
      source: fill.nodeId,
      sourceHandle: fill.handle,
      target: exportId,
      targetHandle: fillsInput.name
    });
  }

  const exportOut =
    outputNamed(exportShape, "output") ?? exportShape.outputs[0] ?? null;
  if (!exportOut) {
    issues.push(
      `the export node produces no output, so the run reports nothing back.`
    );
    return { nodes, edges, issues };
  }
  const outputShape = lookup(PLAN_OUTPUT_NODE_TYPE);
  if (!outputShape) {
    issues.push(
      `"${PLAN_OUTPUT_NODE_TYPE}" is not in the registry, so the export result is not returned.`
    );
    return { nodes, edges, issues };
  }
  const outputId = "output_project";
  nodes.push({
    id: outputId,
    type: PLAN_OUTPUT_NODE_TYPE,
    position: position(COLUMN_OUTPUT, 0),
    properties: { name: GAME_PROJECT_OUTPUT_NAME }
  });
  edges.push({
    source: exportId,
    sourceHandle: exportOut.name,
    target: outputId,
    targetHandle: outputShape.inputs[0]?.name ?? "value"
  });

  return { nodes, edges, issues };
}
