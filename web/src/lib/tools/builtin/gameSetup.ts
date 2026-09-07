import { z } from "zod";
import {
  gameGraphPlacement,
  gameProjectDirectory,
  planNodeShape,
  type GameAssetManifest,
  type GameGraphChoices
} from "@nodetool-ai/protocol";
import {
  gameDesign,
  gameSetupStage,
  readGameSetup,
  writeGameSetup,
  type GameDesign,
  type GameSetup
} from "@nodetool-ai/protocol/api-schemas/workflows.js";

import { FrontendToolRegistry } from "../frontendTools";
import type { FrontendToolState } from "../frontendTools";
import { resolveWorkflowId } from "./workflow";
import { docUrl } from "./resourceLinks";

/**
 * The four tools that drive the Game creation flow from an agent
 * (game-prd § 5.7): write the setup answers, design the game, patch one part
 * of the design, build the graph from it.
 *
 * They act on the same `settings.game` field the browser flow reads, so an
 * agent can move an open flow between steps and a creator can take over
 * mid-way. `packages/agents/src/capabilities/workflows.ts` mirrors all four
 * against the stored row for a run with no editor open.
 *
 * Two rules carry the phase:
 *
 * - `ui_game_design` places no node (criterion 3). It writes text.
 * - `ui_game_build` refuses a design whose cast or slot prompts are still
 *   empty (criterion 4), and reports the chains it could not place — a graph
 *   missing its export node validates and writes no project.
 */

const workflowIdParam = z
  .string()
  .optional()
  .describe(
    "Id of the workflow to act on. Defaults to the workflow the editor is on."
  );

/** Read the workflow's game setup, or explain that there is none. */
function requireWorkflow(state: FrontendToolState, workflowId: string) {
  const workflow = state.getWorkflow(workflowId);
  if (!workflow) {
    throw new Error(
      `Workflow ${workflowId} is not open. Open it with ui_open_workflow first.`
    );
  }
  return { workflow, game: readGameSetup(workflow.settings) };
}

/** Write a game patch and persist it, failing the call if the save is refused. */
async function persistGame(
  state: FrontendToolState,
  workflowId: string,
  patch: Partial<GameSetup>
) {
  const { workflow } = requireWorkflow(state, workflowId);
  const settings = writeGameSetup(workflow.settings, patch);
  const live = state.getNodeStore(workflowId)?.getState().getWorkflow();
  const next = { ...(live ?? workflow), settings };
  state.updateWorkflow(next);
  await state.saveWorkflow(next);
  return readGameSetup(settings);
}

/** The design on the workflow, or the reason there is nothing to act on. */
function requireDesign(
  state: FrontendToolState,
  workflowId: string
): { design: GameDesign; game: GameSetup } {
  const { game } = requireWorkflow(state, workflowId);
  if (!game?.design) {
    throw new Error(
      `Workflow ${workflowId} has no game design. Write one with ui_game_design first.`
    );
  }
  return { design: game.design, game };
}

/**
 * What the design is still missing, in the review's own order (criterion 4).
 * Empty means the build may go ahead.
 */
export function missingDesignFields(
  design: GameDesign,
  slotIds: readonly string[]
): string[] {
  const missing: string[] = [];
  for (const member of design.cast) {
    if (member.name.trim().length === 0) {
      missing.push(`cast.${member.slot_id}.name`);
    }
    if (member.descriptor.trim().length === 0) {
      missing.push(`cast.${member.slot_id}.descriptor`);
    }
  }
  for (const slotId of slotIds) {
    const entry = design.slot_prompts.find((row) => row.slot_id === slotId);
    if ((entry?.prompt ?? "").trim().length === 0) {
      missing.push(`slot_prompts.${slotId}`);
    }
  }
  return missing;
}

const designParam = gameDesign.describe(
  "The written design: title, premise, core loop, player verbs, enemies, level, win, lose, one cast entry per spritesheet slot and one prompt per manifest slot."
);

/** The manifest an agent hands in, since the browser has no template list. */
const manifestParam = z
  .object({
    version: z.literal(1).default(1),
    template: z.string(),
    godot: z.string(),
    slots: z.array(z.record(z.string(), z.unknown())),
    hooks: z.array(z.string()).default([])
  })
  .describe(
    "The chosen template's asset manifest, as list_game_templates returns it."
  );

FrontendToolRegistry.register({
  name: "ui_game_set_setup",
  description:
    "Write the guided-setup answers on a game workflow: the `brief` (the premise), the `template` the game is built from, the style entity, the image and music models, the sound-effect node type, the project name, and the `stage` the flow sits at. Omit a field to leave it unchanged. The stages run idea → template → review → look → done; a workflow that has finished setup, or was built before the flow existed, reads 'done'. Setting the stage is what moves the open flow to that step.",
  parameters: z.object({
    workflow_id: workflowIdParam,
    brief: z
      .string()
      .optional()
      .describe("The premise — the designer's input."),
    template: z
      .string()
      .optional()
      .describe("Manifest template id, e.g. 'platformer'."),
    style_entity_id: z
      .string()
      .optional()
      .describe("Library entity id of the style every prompt carries."),
    image_model: z
      .string()
      .optional()
      .describe("`provider:id` of the text-to-image model."),
    sfx_node_type: z
      .string()
      .optional()
      .describe(
        "Registry node type of the sound-effect generator. Omit to keep the template's placeholder sounds."
      ),
    music_model: z
      .string()
      .optional()
      .describe(
        "`provider:id` of the music model. Omit to keep the template's placeholder loop."
      ),
    project_name: z
      .string()
      .optional()
      .describe("The Godot project name, and the export directory's slug."),
    stage: gameSetupStage
      .optional()
      .describe("Where the guided flow should resume.")
  }),
  async execute(
    {
      workflow_id,
      brief,
      template,
      style_entity_id,
      image_model,
      sfx_node_type,
      music_model,
      project_name,
      stage
    },
    ctx
  ) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);
    const patch: Partial<GameSetup> = {};
    if (brief !== undefined) patch.brief = brief;
    if (template !== undefined) patch.template = template;
    if (style_entity_id !== undefined) patch.style_entity_id = style_entity_id;
    if (image_model !== undefined) patch.image_model = image_model;
    if (sfx_node_type !== undefined) patch.sfx_node_type = sfx_node_type;
    if (music_model !== undefined) patch.music_model = music_model;
    if (project_name !== undefined) patch.project_name = project_name;
    if (stage !== undefined) patch.stage = stage;
    if (Object.keys(patch).length === 0) {
      throw new Error(
        "Nothing to set — pass brief, template, style_entity_id, image_model, sfx_node_type, music_model, project_name or stage."
      );
    }
    const game = await persistGame(state, workflowId, patch);
    return {
      ok: true,
      workflow_id: workflowId,
      game,
      url: docUrl("workflow", workflowId)
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_game_design",
  description:
    "Store the written design for a game workflow and move the flow to its review step. Places no node, generates no asset and starts no job: the design is text the creator reads before anything is paid for. Every slot in the chosen template's manifest needs a prompt and every spritesheet slot a cast entry — a slot prompt is the SUBJECT ONLY, with no style words, no pixel size and no sheet boilerplate, because the graph adds those from the slot spec and the chosen style.",
  parameters: z.object({
    workflow_id: workflowIdParam,
    template: z
      .string()
      .optional()
      .describe("Template id this design is for. Defaults to the stored one."),
    design: designParam,
    slot_ids: z
      .array(z.string())
      .optional()
      .describe(
        "The manifest's slot ids, so the result can report which ones the design still has no prompt for."
      )
  }),
  async execute({ workflow_id, template, design, slot_ids }, ctx) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);
    const { game } = requireWorkflow(state, workflowId);
    const templateId = template ?? game?.template;
    if (templateId === undefined) {
      throw new Error(
        "No template chosen. Pass `template`, or set one with ui_game_set_setup first."
      );
    }
    const parsed = gameDesign.parse(design);
    const patch: Partial<GameSetup> = {
      design: parsed,
      // The same source key the flow writes, so pressing the template step's
      // button after this continues to the design instead of replacing it.
      design_source: `${templateId}\n${(game?.brief ?? "").trim()}`,
      stage: "review"
    };
    if (template !== undefined) {
      patch.template = template;
    }
    const saved = await persistGame(state, workflowId, patch);
    return {
      ok: true,
      workflow_id: workflowId,
      game: saved,
      missing: missingDesignFields(parsed, slot_ids ?? []),
      nodes_placed: 0
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_game_update_design",
  description:
    "Edit the stored design without rewriting it: change one top-level section (title, premise, core loop, level, win, lose, player verbs), one cast member's name or descriptor, one enemy's name or behaviour, or one slot's prompt. Use it to fill what the designer skipped — the build refuses a design with an empty cast entry or slot prompt.",
  parameters: z.object({
    workflow_id: workflowIdParam,
    title: z.string().optional(),
    premise: z.string().optional(),
    core_loop: z.string().optional(),
    level: z.string().optional(),
    win: z.string().optional(),
    lose: z.string().optional(),
    player_verbs: z.array(z.string()).optional(),
    cast: z
      .array(
        z.object({
          slot_id: z.string(),
          name: z.string().optional(),
          descriptor: z.string().optional()
        })
      )
      .optional()
      .describe("Cast members to patch, keyed by their slot id."),
    enemies: z
      .array(
        z.object({
          slot_id: z.string(),
          name: z.string().optional(),
          behaviour: z.string().optional()
        })
      )
      .optional()
      .describe("Enemies to patch, keyed by their slot id."),
    slot_prompts: z
      .array(z.object({ slot_id: z.string(), prompt: z.string() }))
      .optional()
      .describe("Slot prompts to set or replace, keyed by slot id.")
  }),
  async execute(
    {
      workflow_id,
      title,
      premise,
      core_loop,
      level,
      win,
      lose,
      player_verbs,
      cast,
      enemies,
      slot_prompts
    },
    ctx
  ) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);
    const { design } = requireDesign(state, workflowId);

    const next: GameDesign = { ...design };
    if (title !== undefined) next.title = title;
    if (premise !== undefined) next.premise = premise;
    if (core_loop !== undefined) next.core_loop = core_loop;
    if (level !== undefined) next.level = level;
    if (win !== undefined) next.win = win;
    if (lose !== undefined) next.lose = lose;
    if (player_verbs !== undefined) next.player_verbs = player_verbs;

    if (cast !== undefined) {
      next.cast = design.cast.map((member) => {
        const patch = cast.find((row) => row.slot_id === member.slot_id);
        if (patch === undefined) return member;
        const patched = { ...member };
        if (patch.name !== undefined) patched.name = patch.name;
        if (patch.descriptor !== undefined) patched.descriptor = patch.descriptor;
        return patched;
      });
      // A cast entry for a slot the design has none for is added rather than
      // dropped: a spritesheet slot with no cast member is what criterion 4
      // blocks on, and this is the tool that fixes it.
      for (const row of cast) {
        if (next.cast.some((member) => member.slot_id === row.slot_id)) {
          continue;
        }
        next.cast = [
          ...next.cast,
          {
            slot_id: row.slot_id,
            name: row.name ?? "",
            descriptor: row.descriptor ?? ""
          }
        ];
      }
    }

    if (enemies !== undefined) {
      next.enemies = design.enemies.map((enemy) => {
        const patch = enemies.find((row) => row.slot_id === enemy.slot_id);
        if (patch === undefined) return enemy;
        const patched = { ...enemy };
        if (patch.name !== undefined) patched.name = patch.name;
        if (patch.behaviour !== undefined) patched.behaviour = patch.behaviour;
        return patched;
      });
    }

    if (slot_prompts !== undefined) {
      const patched = new Map(
        next.slot_prompts.map((row) => [row.slot_id, row.prompt])
      );
      for (const row of slot_prompts) {
        patched.set(row.slot_id, row.prompt);
      }
      next.slot_prompts = [...patched].map(([slot_id, prompt]) => ({
        slot_id,
        prompt
      }));
    }

    const parsed = gameDesign.parse(next);
    const game = await persistGame(state, workflowId, { design: parsed });
    return { ok: true, workflow_id: workflowId, game };
  }
});

FrontendToolRegistry.register({
  name: "ui_game_build",
  description:
    "Build the game's graph from its stored design: one generate → resize → check chain per asset slot, every checker feeding a dynamic input named by its slot id on one nodetool.game.ExportGodotProject node, and that node's output on an Output named 'project'. Refused while any cast entry or slot prompt is still empty. The result lists chains it could not place — a graph missing its export node validates and writes no project, so check `issues` before you call it done. Run the workflow afterwards to fill the slots and export.",
  parameters: z.object({
    workflow_id: workflowIdParam,
    manifest: manifestParam,
    image_model: z
      .record(z.string(), z.unknown())
      .describe(
        "The image model each generate node runs on, as ui_search_models returns it."
      ),
    sfx_node_type: z
      .string()
      .nullable()
      .optional()
      .describe(
        "Sound-effect node type, or null to keep the template's placeholder sounds."
      ),
    music_model: z
      .record(z.string(), z.unknown())
      .nullable()
      .optional()
      .describe("Music model, or null to keep the template's placeholder loop."),
    style: z
      .object({ name: z.string(), descriptor: z.string() })
      .nullable()
      .optional()
      .describe(
        "The style every prompt carries verbatim, so the whole game reads as one game."
      ),
    project_name: z
      .string()
      .optional()
      .describe("Defaults to the stored project name, then the design's title.")
  }),
  async execute(
    {
      workflow_id,
      manifest,
      image_model,
      sfx_node_type,
      music_model,
      style,
      project_name
    },
    ctx
  ) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);
    const { design, game } = requireDesign(state, workflowId);
    const assetManifest = manifest as unknown as GameAssetManifest;

    const missing = missingDesignFields(
      design,
      assetManifest.slots.map((slot) => slot.id)
    );
    if (missing.length > 0) {
      throw new Error(
        "Every cast entry needs a name and a descriptor, and every slot a prompt, before the graph is built. " +
          `Missing: ${missing.join(", ")}. Fill them with ui_game_update_design.`
      );
    }

    const name =
      project_name ?? game.project_name ?? design.title ?? assetManifest.template;
    const choices: GameGraphChoices = {
      imageModel: image_model,
      sfxNodeType: sfx_node_type ?? null,
      musicModel: music_model ?? null,
      style: style ?? null,
      projectName: name,
      directory: gameProjectDirectory(name),
      verify: true
    };

    const metadata = state.nodeMetadata;
    const placement = gameGraphPlacement(
      assetManifest,
      design,
      choices,
      (nodeType) => {
        const meta = metadata[nodeType];
        return meta ? planNodeShape(meta) : null;
      }
    );

    let seq = 0;
    const call = (name_: string, args: Record<string, unknown>) =>
      FrontendToolRegistry.call(name_, args, `game-build-${++seq}`, {
        getState: () => state
      });

    for (const node of placement.nodes) {
      await call("ui_add_node", {
        workflow_id: workflowId,
        id: node.id,
        type: node.type,
        position: node.position,
        properties: node.properties
      });
      if (node.setupStepId !== undefined) {
        await call("ui_update_node_data", {
          workflow_id: workflowId,
          node_id: node.id,
          data: { setupStepId: node.setupStepId }
        });
      }
    }
    for (const edge of placement.edges) {
      await call("ui_connect_nodes", {
        workflow_id: workflowId,
        source_node_id: edge.source,
        source_handle: edge.sourceHandle,
        target_node_id: edge.target,
        target_handle: edge.targetHandle
      });
    }

    const saved = await persistGame(state, workflowId, {
      stage: "done",
      project_name: name
    });
    return {
      ok: true,
      workflow_id: workflowId,
      game: saved,
      nodes_placed: placement.nodes.length,
      edges_placed: placement.edges.length,
      issues: placement.issues,
      directory: choices.directory,
      url: docUrl("workflow", workflowId)
    };
  }
});
