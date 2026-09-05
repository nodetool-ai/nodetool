import { z } from "zod";
import type { ShotStatus } from "@nodetool-ai/protocol";
import { storyboards } from "@nodetool-ai/protocol/api-schemas";
import { FrontendToolRegistry } from "../frontendTools";
import { getStoryboardAgentHandler } from "../../../components/storyboard/storyboardAgentBridge";
import { flushStoryboardSave } from "../../../hooks/storyboard/storyboardSaveRegistry";
import { docUrl } from "./resourceLinks";

/**
 * Frontend tools that let the agent direct the live Storyboard surface — load a
 * screenplay, add and edit shots, generate stills and clips, and select. Every
 * tool takes an explicit `storyboard_id` and delegates to the handler that
 * board's open StoryboardSurface registers on the {@link storyboardAgentBridge};
 * when that board is not open the handler getter throws, naming the requested id
 * and listing the open ones, which the tool layer surfaces to the agent.
 *
 * Shots are addressed by id, 0-based index, or the literal `"selected"`. Call
 * `ui_storyboard_get_state` first to discover the ids the other tools need.
 *
 * Every tool that writes normalizes its input through
 * `normalizeStoryboardScreenplay` (`@nodetool-ai/protocol/api-schemas`) and then
 * flushes the board's pending save, so a write the persistence layer would
 * refuse fails the tool call instead of reporting success.
 */

const storyboardIdParam = z
  .string()
  .describe(
    "Id of the storyboard to act on. The open storyboard ids are listed in the ui_context system prompt block."
  );

const targetParam = z
  .string()
  .describe(
    'Shot id, 0-based shot index (as a string), or the literal "selected" for the currently-selected shot.'
  );

const cameraParam = z
  .object({
    framing: z.string().optional(),
    lens: z.string().optional(),
    angle: z.string().optional(),
    movement: z.string().optional(),
    equipment: z
      .string()
      .optional()
      .describe(
        "What the camera is on: handheld, tripod, steadicam, gimbal, dolly, slider, crane, drone. The rig, not the direction of the move."
      )
  })
  .describe(
    "Structured camera direction (framing, lens, angle, movement, equipment)."
  );

const sceneIdParam = z
  .string()
  .describe(
    "Scene id, as listed under `scenes` by ui_storyboard_get_state."
  );

const versionKindParam = z
  .enum(["keyframe", "clip"])
  .describe(
    'Which media list to address: "keyframe" for the shot\'s stills, "clip" for its takes.'
  );

const versionIndexParam = z
  .number()
  .int()
  .min(0)
  .describe(
    "0-based position in that list, oldest first. Counts come from ui_storyboard_get_state."
  );

const staleOnlyParam = z
  .boolean()
  .optional()
  .describe(
    "Render only the selected shots whose current version is stale — rendered from a style, model, aspect ratio or prompt the shot no longer has. Omitted or false renders every selected shot."
  );

/**
 * One shot as the agent supplies it. Only `action` is required — the tool layer
 * fills in `type`, `id`, `index` and `status`. Extra keys travel: the Director
 * agent's shot shape evolves.
 */
const screenplayShotParam = z
  .object({
    action: z
      .string()
      .describe("The concrete visual to render: subject plus setting."),
    slug: z.string().optional().describe("Short human label for the shot."),
    camera: cameraParam.optional(),
    motion: z.string().optional(),
    dialogue: z.string().optional(),
    narration: z.string().optional(),
    notes: z.string().optional(),
    durationSeconds: z.number().optional(),
    sceneId: z
      .string()
      .optional()
      .describe("Id of the scene this shot belongs to, from `scenes`."),
    entityIds: z.array(z.string()).optional()
  })
  .passthrough();

/** One scene. Its position is derived from its shots, never stored. */
const screenplaySceneParam = z
  .object({
    slugline: z
      .string()
      .describe('e.g. "INT. SOPHIA\'S FLAT - HALLWAY - EARLY MORNING".'),
    id: z.string().optional().describe("Generated when omitted."),
    lighting: z
      .string()
      .optional()
      .describe("Lighting for every shot in the scene; enters still prompts.")
  })
  .passthrough();

const screenplayParam = z
  .object({
    type: z
      .literal("screenplay")
      .describe("Discriminator — always the literal 'screenplay'."),
    shots: z
      .array(screenplayShotParam)
      .describe("The shots, in order. Each needs an `action`."),
    id: z.string().optional().describe("Generated when omitted."),
    title: z.string().optional(),
    logline: z.string().optional(),
    brief: z.string().optional().describe("What the piece is for."),
    style: z
      .string()
      .optional()
      .describe("The look applied to every shot (alias of styleBible)."),
    styleBible: z.string().optional(),
    aspectRatio: z.string().optional(),
    genre: z
      .string()
      .optional()
      .describe("The genre this screenplay was directed in."),
    scenes: z
      .array(screenplaySceneParam)
      .optional()
      .describe(
        "The scenes, in order. Every shot's `sceneId` must name one of these; shots in a scene must be contiguous."
      ),
    narration: z.string().optional(),
    musicPrompt: z.string().optional(),
    entityIds: z.array(z.string()).optional()
  })
  .passthrough();

/**
 * Flush the board's pending save and report what persisted. A write that cannot
 * reach the server is a failed tool call, not a success with a warning.
 */
async function persistBoard(
  storyboardId: string,
  what: string
): Promise<{ saved: true; updatedAt: string } | { saved: null }> {
  const result = await flushStoryboardSave(storyboardId);
  if (!result.ok) {
    throw new Error(
      `${what} was applied to the open storyboard but did not persist: ${result.error}`
    );
  }
  // A null revision means this host runs no server sync — do not claim a save.
  return result.updatedAt === null
    ? { saved: null }
    : { saved: true, updatedAt: result.updatedAt };
}

const shotStatusEnum = z.enum([
  "planned",
  "keyframe_generating",
  "keyframe_ready",
  "approved",
  "clip_generating",
  "rendered",
  "failed"
]) satisfies z.ZodType<ShotStatus>;

FrontendToolRegistry.register({
  name: "ui_storyboard_get_state",
  description:
    "Read the specified storyboard: title, brief, style, genre, setup stage, aspect ratio, the entity ids cast on the board, the scenes with the shots under each, whether a screenplay is loaded, the selected shot, and every shot with its index, slug, action, camera, motion, duration, scene, dialogue, status, how many stills and takes it holds, and whether its selected still or clip is stale. Call this first to discover the shot and scene ids the other tools need.",
  parameters: z.object({ storyboard_id: storyboardIdParam }),
  async execute({ storyboard_id }) {
    const snapshot = getStoryboardAgentHandler(storyboard_id).getSnapshot();
    return { ok: true, ...snapshot };
  }
});

FrontendToolRegistry.register({
  name: "ui_storyboard_set_screenplay",
  description:
    "Load a full screenplay onto the specified storyboard. Use ui_storyboard_update_shot for edits to existing shot prompts. When revising a screenplay, retain existing shot ids from ui_storyboard_get_state: their rendered media and status are preserved. Removing a shot with rendered media is refused. `screenplay` is a Screenplay object ({ type:'screenplay', title, shots: Shot[], ... }) — typically the output of the Director node. Missing ids, indexes and statuses are filled in for new shots; every shot needs an `action`. A top-level `entityIds` casts those entities on the board (use ui_storyboard_set_entities to change only the cast); a shot's own `entityIds` overrides the board cast for that shot.",
  parameters: z.object({
    storyboard_id: storyboardIdParam,
    screenplay: screenplayParam
  }),
  async execute({ storyboard_id, screenplay }) {
    const play = storyboards.normalizeStoryboardScreenplay(screenplay, {
      generateId: () => crypto.randomUUID()
    });
    const handler = getStoryboardAgentHandler(storyboard_id);
    const shotIds = new Set(play.shots.map((shot) => shot.id));
    const dropped = handler.getSnapshot().shots.filter(
      (shot) => (shot.hasKeyframe || shot.hasClip) && !shotIds.has(shot.id)
    );
    if (dropped.length > 0) {
      throw new Error(
        `This screenplay would remove rendered shots: ${dropped.map((shot) => shot.id).join(", ")}. ` +
        "Use ui_storyboard_update_shot for prompt edits, or retain their existing ids from ui_storyboard_get_state."
      );
    }
    const snapshot = handler.setScreenplay(play);
    const persisted = await persistBoard(storyboard_id, "The screenplay");
    return {
      ok: true,
      ...snapshot,
      ...persisted,
      url: docUrl("storyboard", storyboard_id)
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_storyboard_set_entities",
  description:
    "Cast library entities (characters, locations, styles, props) on the specified storyboard, replacing the current selection. Their descriptors and reference images season every shot's still and clip prompt — a style or location applies to every shot, a character or prop applies to the shots whose text names it. Pass an empty array to clear the cast. Discover ids with ui_entity_list.",
  parameters: z.object({
    storyboard_id: storyboardIdParam,
    entity_ids: z
      .array(z.string())
      .describe(
        "Entity (asset) ids to cast on the board, replacing the current selection."
      )
  }),
  async execute({ storyboard_id, entity_ids }) {
    const snapshot =
      getStoryboardAgentHandler(storyboard_id).setEntityIds(entity_ids);
    const persisted = await persistBoard(storyboard_id, "The entity cast");
    return {
      ok: true,
      ...snapshot,
      ...persisted,
      url: docUrl("storyboard", storyboard_id)
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_storyboard_add_shot",
  description:
    "Add a new shot to the specified storyboard. `action` is the concrete visual (required). `slug` is the shot's short title, e.g. 'Lighthouse at dusk' — give every shot one. Optionally set `camera`, `motion`, `durationSeconds`, and where it lands: `afterShotId` inserts it directly after that shot in that shot's scene (the scene-safe way), `index` puts it at a board position. The shot starts in the 'planned' status.",
  parameters: z.object({
    storyboard_id: storyboardIdParam,
    action: z.string().min(1),
    slug: z.string().optional(),
    camera: cameraParam.optional(),
    motion: z.string().optional(),
    durationSeconds: z.number().optional(),
    index: z.number().optional(),
    afterShotId: targetParam
      .optional()
      .describe(
        "Insert directly after this shot, in its scene. Wins over `index`, which cannot say which scene a position belongs to."
      )
  }),
  async execute({
    storyboard_id,
    action,
    slug,
    camera,
    motion,
    durationSeconds,
    index,
    afterShotId
  }) {
    const shot = getStoryboardAgentHandler(storyboard_id).addShot({
      action,
      slug,
      camera,
      motion,
      durationSeconds,
      index,
      afterShotId
    });
    const persisted = await persistBoard(storyboard_id, "The shot");
    return {
      ok: true,
      shot,
      ...persisted,
      url: docUrl("storyboard", storyboard_id, { key: "shot", value: shot.id })
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_storyboard_update_shot",
  description:
    "Edit an existing shot's `slug` (its short title), `action`, `camera` (including its `equipment` rig), `motion`, `dialogue`, `notes`, `durationSeconds` (which pins the shot to that length), `durationSource`, or `status`. Omit a field to leave it unchanged. A shot's scene is not a field here — move it with ui_storyboard_move_shot.",
  parameters: z.object({
    storyboard_id: storyboardIdParam,
    target: targetParam,
    action: z.string().min(1).optional(),
    slug: z.string().optional(),
    camera: cameraParam.optional(),
    motion: z.string().optional(),
    dialogue: z
      .string()
      .optional()
      .describe(
        "Spoken line delivered in-shot. On a board linked to a script the words belong to the script — edit them there and re-project."
      ),
    notes: z
      .string()
      .optional()
      .describe("Direction for the crew. Never enters a render prompt."),
    durationSeconds: z.number().positive().optional(),
    durationSource: z
      .enum(["audio", "manual"])
      .optional()
      .describe(
        'Where the length comes from: "audio" times the shot from the takes of the script lines it covers, "manual" pins durationSeconds.'
      ),
    status: shotStatusEnum.optional()
  }),
  async execute({
    storyboard_id,
    target,
    action,
    slug,
    camera,
    motion,
    dialogue,
    notes,
    durationSeconds,
    durationSource,
    status
  }) {
    const shot = getStoryboardAgentHandler(storyboard_id).updateShot(target, {
      action,
      slug,
      camera,
      motion,
      dialogue,
      notes,
      durationSeconds,
      durationSource,
      status
    });
    const persisted = await persistBoard(storyboard_id, "The shot edit");
    return {
      ok: true,
      shot,
      ...persisted,
      url: docUrl("storyboard", storyboard_id, { key: "shot", value: shot.id })
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_storyboard_generate_keyframe",
  description:
    'Generate (or regenerate) the cheap keyframe still for a shot from its action + the board style. `target` takes one shot, or the literal "all" for every shot on the board. With `staleOnly` only the shots whose selected still is out of date are rendered. Kicks the jobs off and returns the shots it enqueued plus the ids it skipped; poll ui_storyboard_get_state for the resulting statuses.',
  parameters: z.object({
    storyboard_id: storyboardIdParam,
    target: targetParam.describe(
      'Shot id, 0-based shot index (as a string), "selected", or "all" for every shot.'
    ),
    staleOnly: staleOnlyParam
  }),
  async execute({ storyboard_id, target, staleOnly }) {
    const result = await getStoryboardAgentHandler(
      storyboard_id
    ).generateKeyframe(target, { staleOnly });
    const persisted = await persistBoard(storyboard_id, "The keyframe");
    return {
      ok: true,
      ...result,
      shot: result.shots[0] ?? null,
      ...persisted,
      url: docUrl("storyboard", storyboard_id)
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_storyboard_generate_clip",
  description:
    'Render the final clip for a shot, animating its selected keyframe still. The shot must have a still. `target` takes one shot, or the literal "all" for every shot on the board. With `staleOnly` only the shots whose selected clip is out of date are rendered. This is the expensive step. Kicks the jobs off and returns the shots it enqueued plus the ids it skipped; poll ui_storyboard_get_state for the resulting statuses.',
  parameters: z.object({
    storyboard_id: storyboardIdParam,
    target: targetParam.describe(
      'Shot id, 0-based shot index (as a string), "selected", or "all" for every shot.'
    ),
    staleOnly: staleOnlyParam
  }),
  async execute({ storyboard_id, target, staleOnly }) {
    const result = await getStoryboardAgentHandler(storyboard_id).generateClip(
      target,
      { staleOnly }
    );
    const persisted = await persistBoard(storyboard_id, "The clip");
    return {
      ok: true,
      ...result,
      shot: result.shots[0] ?? null,
      ...persisted,
      url: docUrl("storyboard", storyboard_id)
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_storyboard_revise_shot",
  description:
    "Regenerate a shot's video clip via video-to-video using a text instruction, e.g. 'make it darker, add rain'. Seeds the shot's existing clip and swaps the revised result in place. The shot must already have a clip (generate one first). Kicks off the job and returns the shot; poll ui_storyboard_get_state for the resulting status.",
  parameters: z.object({
    storyboard_id: storyboardIdParam,
    target: targetParam,
    instruction: z
      .string()
      .describe(
        "The change to make, phrased as a video edit prompt (e.g. 'make it darker, add rain')."
      )
  }),
  async execute({ storyboard_id, target, instruction }) {
    const shot = await getStoryboardAgentHandler(storyboard_id).reviseShot(
      target,
      instruction
    );
    const persisted = await persistBoard(storyboard_id, "The revised clip");
    return {
      ok: true,
      shot,
      ...persisted,
      url: docUrl("storyboard", storyboard_id, { key: "shot", value: shot.id })
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_storyboard_assemble_timeline",
  description:
    "Assemble the specified storyboard's rendered shots into a persisted timeline sequence and open it in the timeline editor. Shot clips are laid end to end in order; the screenplay's narration and music become draft audio clips ready to generate. When the board links a script, the words are cut in with the picture instead: each shot runs as long as the takes it covers, every voiced line becomes a voiceover clip inside its shot, and the draft narration clip is dropped (lines that got no clip are returned in skippedLineIds). Shots without a rendered clip are skipped (returned in skippedShotIds). If the board is already linked to a sequence, that sequence is rewritten in place (reassembled), keeping tracks the editor added. Each timeline clip stays linked to its shot, so ui_storyboard_revise_shot updates the cut in place.",
  parameters: z.object({ storyboard_id: storyboardIdParam }),
  async execute({ storyboard_id }) {
    const result =
      await getStoryboardAgentHandler(storyboard_id).assembleTimeline();
    return { ok: true, ...result, url: docUrl("timeline", result.sequenceId) };
  }
});

FrontendToolRegistry.register({
  name: "ui_storyboard_extract_script",
  description:
    "Project the specified storyboard's dialogue and narration into a new script resource and link the two: the board's screenplay records the script, and each shot records the lines it covers. One line per shot dialogue and one per shot narration, in shot order; a shot's character entity becomes the line's speaker. Fails when the board already links a script — use ui_storyboard_relink_script to re-project instead. Opens the script's tab.",
  parameters: z.object({ storyboard_id: storyboardIdParam }),
  async execute({ storyboard_id }) {
    const link = await getStoryboardAgentHandler(storyboard_id).extractScript();
    const persisted = await persistBoard(storyboard_id, "The script link");
    return {
      ok: true,
      ...link,
      ...persisted,
      url: docUrl("script", link.scriptId)
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_storyboard_relink_script",
  description:
    "Re-project the specified storyboard's words onto the script it already links: line texts are re-read from the shots and every shot's snapshot is refreshed, so drift clears. Recorded takes, voices, and performance directions survive on every line whose shot still exists. Fails when the board links no script — use ui_storyboard_extract_script first.",
  parameters: z.object({ storyboard_id: storyboardIdParam }),
  async execute({ storyboard_id }) {
    const handler = getStoryboardAgentHandler(storyboard_id);
    if (!handler.getSnapshot().scriptId) {
      throw new Error(
        `Storyboard ${storyboard_id} links no script. Call ui_storyboard_extract_script to create one.`
      );
    }
    const link = await handler.extractScript({ relink: true });
    const persisted = await persistBoard(storyboard_id, "The re-projection");
    return {
      ok: true,
      ...link,
      ...persisted,
      url: docUrl("script", link.scriptId)
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_storyboard_reproject_shots",
  description:
    "Re-read the linked script's words onto the specified storyboard: each shot's dialogue, narration, and snapshot come from the script lines it covers, so a line edited in the script reaches the board. Every drifted shot unless `targets` names shots. The opposite direction from ui_storyboard_relink_script, which re-reads the script from the board. Rendered stills and clips are untouched — regenerate them explicitly. Fails when the board links no script.",
  parameters: z.object({
    storyboard_id: storyboardIdParam,
    targets: z
      .array(targetParam)
      .optional()
      .describe(
        "Shots to re-project. Omit to re-project every shot whose linked lines have drifted from its snapshot."
      )
  }),
  async execute({ storyboard_id, targets }) {
    const result =
      await getStoryboardAgentHandler(storyboard_id).reprojectShots(targets);
    const persisted = await persistBoard(storyboard_id, "The re-projection");
    return {
      ok: true,
      ...result,
      ...persisted,
      url: docUrl("storyboard", storyboard_id)
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_storyboard_set_duration_source",
  description:
    'Choose where the named shots get their length. "audio" times each shot from the takes of the script lines it covers, so the clip is long enough to hold its voiceover (a shot with an unvoiced line keeps its own duration until the line is voiced). "manual" pins the shot to its own durationSeconds and audio never touches it. Only meaningful on a board linked to a script.',
  parameters: z.object({
    storyboard_id: storyboardIdParam,
    targets: z
      .union([targetParam, z.array(targetParam).min(1)])
      .describe("One shot, or a list of them."),
    source: z.enum(["audio", "manual"])
  }),
  async execute({ storyboard_id, targets, source }) {
    const handler = getStoryboardAgentHandler(storyboard_id);
    const list = Array.isArray(targets) ? targets : [targets];
    const shots = list.map((target) =>
      handler.updateShot(target, { durationSource: source })
    );
    const persisted = await persistBoard(storyboard_id, "The duration source");
    return { ok: true, source, shots, ...persisted };
  }
});

FrontendToolRegistry.register({
  name: "ui_storyboard_select_shot",
  description:
    "Select a shot on the specified storyboard (driving the surface's focus). Pass null to clear the selection.",
  parameters: z.object({
    storyboard_id: storyboardIdParam,
    target: targetParam.nullable()
  }),
  async execute({ storyboard_id, target }) {
    const shot = getStoryboardAgentHandler(storyboard_id).selectShot(target);
    return { ok: true, selected: shot };
  }
});

// ── Guided setup ────────────────────────────────────────────────────────────

FrontendToolRegistry.register({
  name: "ui_storyboard_set_setup",
  description:
    "Write the guided-setup answers on the specified storyboard: the `brief` (what the piece is), the `genre` the Director works in, and the `stage` the flow sits at. Omit a field to leave it unchanged. The stages run idea → genre → review → look → done; a board that has finished setup, or was built before the flow existed, reads 'done'. Setting the stage is what moves the open flow to that step.",
  parameters: z.object({
    storyboard_id: storyboardIdParam,
    brief: z
      .string()
      .optional()
      .describe("What the piece is for — the Director's input."),
    genre: z
      .string()
      .optional()
      .describe("Genre, e.g. 'noir thriller'. Seasons the Director run."),
    stage: storyboards.storyboardSetupStage
      .optional()
      .describe(
        "Where the guided flow should resume: idea, genre, review, look, or done."
      )
  }),
  async execute({ storyboard_id, brief, genre, stage }) {
    const snapshot = getStoryboardAgentHandler(storyboard_id).setSetup({
      brief,
      genre,
      stage
    });
    const persisted = await persistBoard(storyboard_id, "The setup");
    return {
      ok: true,
      ...snapshot,
      ...persisted,
      url: docUrl("storyboard", storyboard_id)
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_storyboard_direct",
  description:
    "Run the Director over the specified storyboard's brief, genre and style, and load the screenplay it writes. Pass `redirect: true` to re-run over a screenplay that is already there: shots the revision keeps hold their ids, their rendered stills and clips, and their status, so a re-direct is a rewrite and not a reset. Without `redirect` a board that already has a screenplay is refused. Write the brief with ui_storyboard_set_setup first — directing without one fails.",
  parameters: z.object({
    storyboard_id: storyboardIdParam,
    redirect: z
      .boolean()
      .describe(
        "True to re-run over the existing screenplay, keeping the ids and media of retained shots. Required to overwrite one."
      ),
    shotCount: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("How many shots to ask for. Defaults to 6.")
  }),
  async execute({ storyboard_id, redirect, shotCount }) {
    const snapshot = await getStoryboardAgentHandler(storyboard_id).direct({
      redirect,
      shotCount
    });
    const persisted = await persistBoard(storyboard_id, "The screenplay");
    return {
      ok: true,
      ...snapshot,
      ...persisted,
      url: docUrl("storyboard", storyboard_id)
    };
  }
});

// ── Ordering ────────────────────────────────────────────────────────────────

FrontendToolRegistry.register({
  name: "ui_storyboard_move_shot",
  description:
    "Move a shot into a scene at a position within it. `sceneId` names the target scene (null moves it into the board's implicit header, the group unscened shots render under); `position` is 0-based inside that scene and clamps to its length. Every shot is renumbered afterwards, so a scene's shots always stay contiguous. This is how a shot changes scene — ui_storyboard_update_shot does not take one.",
  parameters: z.object({
    storyboard_id: storyboardIdParam,
    target: targetParam,
    sceneId: sceneIdParam
      .nullable()
      .describe(
        "Scene to move into, or null for the implicit header holding unscened shots."
      ),
    position: z
      .number()
      .int()
      .min(0)
      .describe("0-based position within that scene; clamped to its length.")
  }),
  async execute({ storyboard_id, target, sceneId, position }) {
    const shot = getStoryboardAgentHandler(storyboard_id).moveShot(
      target,
      sceneId,
      position
    );
    const persisted = await persistBoard(storyboard_id, "The move");
    return {
      ok: true,
      shot,
      ...persisted,
      url: docUrl("storyboard", storyboard_id, { key: "shot", value: shot.id })
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_storyboard_duplicate_shot",
  description:
    "Copy a shot in directly after itself, in the same scene. The copy keeps the direction and every still and take, and becomes the selected shot. It covers no script line, so the script link is dropped and its length reads as manual — an alternate take of the same beat, free to diverge.",
  parameters: z.object({
    storyboard_id: storyboardIdParam,
    target: targetParam
  }),
  async execute({ storyboard_id, target }) {
    const shot = getStoryboardAgentHandler(storyboard_id).duplicateShot(target);
    const persisted = await persistBoard(storyboard_id, "The duplicate");
    return {
      ok: true,
      shot,
      ...persisted,
      url: docUrl("storyboard", storyboard_id, { key: "shot", value: shot.id })
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_storyboard_remove_shot",
  description:
    "Delete a shot from the specified storyboard, including any still or clip it holds. The remaining shots are renumbered. This cannot be undone from the agent side — read ui_storyboard_get_state and confirm the id before calling.",
  parameters: z.object({
    storyboard_id: storyboardIdParam,
    target: targetParam
  }),
  requireUserConsent: true,
  async execute({ storyboard_id, target }) {
    const removed = getStoryboardAgentHandler(storyboard_id).removeShot(target);
    const persisted = await persistBoard(storyboard_id, "The deletion");
    return {
      ok: true,
      ...removed,
      ...persisted,
      url: docUrl("storyboard", storyboard_id)
    };
  }
});

// ── Scenes ──────────────────────────────────────────────────────────────────

FrontendToolRegistry.register({
  name: "ui_storyboard_update_scene",
  description:
    "Edit a scene's `slugline` (its heading, e.g. 'INT. SOPHIA'S FLAT - HALLWAY - EARLY MORNING') and `lighting`. The lighting is pasted into the still prompt of every shot in the scene, so it is the one place to set the light for a run of shots. Omit a field to leave it unchanged.",
  parameters: z.object({
    storyboard_id: storyboardIdParam,
    sceneId: sceneIdParam,
    slugline: z.string().optional(),
    lighting: z
      .string()
      .optional()
      .describe("Lighting for every shot in the scene; enters still prompts.")
  }),
  async execute({ storyboard_id, sceneId, slugline, lighting }) {
    const scene = getStoryboardAgentHandler(storyboard_id).updateScene(
      sceneId,
      { slugline, lighting }
    );
    const persisted = await persistBoard(storyboard_id, "The scene edit");
    return {
      ok: true,
      scene,
      ...persisted,
      url: docUrl("storyboard", storyboard_id)
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_storyboard_create_scene",
  description:
    "Add a scene after `afterSceneId` (or at the end of the board), holding one blank shot which becomes the selection. A scene needs that shot: a scene's position is the position of its first shot, so an empty one has no place on the board. Write its heading with ui_storyboard_update_scene and its shot with ui_storyboard_update_shot.",
  parameters: z.object({
    storyboard_id: storyboardIdParam,
    afterSceneId: sceneIdParam
      .nullable()
      .optional()
      .describe("Insert after this scene. Appended when omitted or null.")
  }),
  async execute({ storyboard_id, afterSceneId }) {
    const scene = getStoryboardAgentHandler(storyboard_id).createScene(
      afterSceneId ?? null
    );
    const persisted = await persistBoard(storyboard_id, "The scene");
    return {
      ok: true,
      scene,
      ...persisted,
      url: docUrl("storyboard", storyboard_id)
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_storyboard_merge_scene",
  description:
    "Fold a scene's shots into the scene before it and drop the emptied scene. The shots keep their order, their direction and their media — only their scene changes. Refused on the first scene, which has nothing before it.",
  parameters: z.object({
    storyboard_id: storyboardIdParam,
    sceneId: sceneIdParam
  }),
  async execute({ storyboard_id, sceneId }) {
    const merged = getStoryboardAgentHandler(storyboard_id).mergeScene(sceneId);
    const persisted = await persistBoard(storyboard_id, "The merge");
    return {
      ok: true,
      ...merged,
      ...persisted,
      url: docUrl("storyboard", storyboard_id)
    };
  }
});

// ── Style ───────────────────────────────────────────────────────────────────

FrontendToolRegistry.register({
  name: "ui_storyboard_set_style",
  description:
    "Set the look every shot renders in. Pass `entityId` to apply a style entity from the library as a preset: it replaces whatever style entity the board carried, its descriptor becomes the board style, and per-shot exclusions of a style are dropped — a style is board-wide. Pass `descriptor` instead to set the style text on its own, with no entity behind it. Discover style entity ids with ui_entity_list. This renders nothing: stills and clips made under the old style read as stale, and you re-render them with staleOnly.",
  parameters: z.object({
    storyboard_id: storyboardIdParam,
    entityId: z
      .string()
      .optional()
      .describe(
        "Id of a library entity of kind 'style'. Applies it as the board's preset."
      ),
    descriptor: z
      .string()
      .optional()
      .describe(
        "Raw style text, when no library entity carries the look. Ignored when entityId is given."
      )
  }),
  async execute({ storyboard_id, entityId, descriptor }) {
    const snapshot = getStoryboardAgentHandler(storyboard_id).setStyle({
      entityId,
      descriptor
    });
    const persisted = await persistBoard(storyboard_id, "The style");
    return {
      ok: true,
      ...snapshot,
      ...persisted,
      url: docUrl("storyboard", storyboard_id)
    };
  }
});

// ── Versions ────────────────────────────────────────────────────────────────

FrontendToolRegistry.register({
  name: "ui_storyboard_select_version",
  description:
    "Choose which of a shot's preserved stills or takes is the selected one — the still the board shows and a clip animates, or the take assembly exports. Versions are 0-based, oldest first; the counts are in ui_storyboard_get_state. Nothing is deleted and nothing re-renders.",
  parameters: z.object({
    storyboard_id: storyboardIdParam,
    target: targetParam,
    kind: versionKindParam,
    version: versionIndexParam
  }),
  async execute({ storyboard_id, target, kind, version }) {
    const shot = getStoryboardAgentHandler(storyboard_id).selectVersion(
      target,
      kind,
      version
    );
    const persisted = await persistBoard(storyboard_id, "The version");
    return {
      ok: true,
      shot,
      ...persisted,
      url: docUrl("storyboard", storyboard_id, { key: "shot", value: shot.id })
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_storyboard_delete_version",
  description:
    "Remove one of a shot's preserved stills or takes. When the removed version was the selected one, the next version at the same position becomes selected (or the last, at the end); removing the last one clears the selection and steps the shot's status back. The generated asset stays in the asset library.",
  parameters: z.object({
    storyboard_id: storyboardIdParam,
    target: targetParam,
    kind: versionKindParam,
    version: versionIndexParam
  }),
  requireUserConsent: true,
  async execute({ storyboard_id, target, kind, version }) {
    const shot = getStoryboardAgentHandler(storyboard_id).deleteVersion(
      target,
      kind,
      version
    );
    const persisted = await persistBoard(storyboard_id, "The version deletion");
    return {
      ok: true,
      shot,
      ...persisted,
      url: docUrl("storyboard", storyboard_id, { key: "shot", value: shot.id })
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_storyboard_add_keyframe_version",
  description:
    "Add a stored asset to a shot as a new still and select it — an upload, a horizontal flip, or an image-editor pass. Existing stills are kept: this never overwrites a version. `flipOf` records which version the image was derived from. A still added this way carries no render record, so it never reads stale.",
  parameters: z.object({
    storyboard_id: storyboardIdParam,
    target: targetParam,
    assetId: z
      .string()
      .min(1)
      .describe("Id of the stored image asset to attach (not a URL)."),
    flipOf: z
      .string()
      .optional()
      .describe(
        "Asset id of the still this one was derived from, when it is a flip or an edit of it."
      )
  }),
  async execute({ storyboard_id, target, assetId, flipOf }) {
    const shot = getStoryboardAgentHandler(storyboard_id).addKeyframeVersion(
      target,
      assetId,
      flipOf
    );
    const persisted = await persistBoard(storyboard_id, "The still");
    return {
      ok: true,
      shot,
      ...persisted,
      url: docUrl("storyboard", storyboard_id, { key: "shot", value: shot.id })
    };
  }
});
