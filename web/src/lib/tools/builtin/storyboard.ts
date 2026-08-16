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
    movement: z.string().optional()
  })
  .describe("Structured camera direction (framing, lens, angle, movement).");

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
    durationSeconds: z.number().optional(),
    entityIds: z.array(z.string()).optional()
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
    "Read the specified storyboard: title, brief, style, aspect ratio, whether a screenplay is loaded, the selected shot, and every shot with its index, slug, action, camera, motion, duration, status, and whether it has a rendered keyframe/clip. Call this first to discover the shot ids/indexes the other tools need.",
  parameters: z.object({ storyboard_id: storyboardIdParam }),
  async execute({ storyboard_id }) {
    const snapshot = getStoryboardAgentHandler(storyboard_id).getSnapshot();
    return { ok: true, ...snapshot };
  }
});

FrontendToolRegistry.register({
  name: "ui_storyboard_set_screenplay",
  description:
    "Load a full screenplay onto the specified storyboard, replacing its shots. `screenplay` is a Screenplay object ({ type:'screenplay', title, shots: Shot[], ... }) — typically the output of the Director node. Shot ids, indexes and statuses are filled in for you; every shot needs an `action`.",
  parameters: z.object({
    storyboard_id: storyboardIdParam,
    screenplay: screenplayParam
  }),
  async execute({ storyboard_id, screenplay }) {
    const play = storyboards.normalizeStoryboardScreenplay(screenplay, {
      generateId: () => crypto.randomUUID()
    });
    const snapshot =
      getStoryboardAgentHandler(storyboard_id).setScreenplay(play);
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
  name: "ui_storyboard_add_shot",
  description:
    "Add a new shot to the specified storyboard. `action` is the concrete visual (required). Optionally set `camera`, `motion`, `durationSeconds`, and an `index` to insert at (appended when omitted). The shot starts in the 'planned' status.",
  parameters: z.object({
    storyboard_id: storyboardIdParam,
    action: z.string().min(1),
    camera: cameraParam.optional(),
    motion: z.string().optional(),
    durationSeconds: z.number().optional(),
    index: z.number().optional()
  }),
  async execute({
    storyboard_id,
    action,
    camera,
    motion,
    durationSeconds,
    index
  }) {
    const shot = getStoryboardAgentHandler(storyboard_id).addShot({
      action,
      camera,
      motion,
      durationSeconds,
      index
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
    "Edit an existing shot's `action`, `camera`, `motion`, or `status`. Omit a field to leave it unchanged.",
  parameters: z.object({
    storyboard_id: storyboardIdParam,
    target: targetParam,
    action: z.string().min(1).optional(),
    camera: cameraParam.optional(),
    motion: z.string().optional(),
    status: shotStatusEnum.optional()
  }),
  async execute({ storyboard_id, target, action, camera, motion, status }) {
    const shot = getStoryboardAgentHandler(storyboard_id).updateShot(target, {
      action,
      camera,
      motion,
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
    "Generate (or regenerate) the cheap keyframe still for a shot from its action + the board style. Kicks off the job and returns the shot; poll ui_storyboard_get_state for the resulting status.",
  parameters: z.object({
    storyboard_id: storyboardIdParam,
    target: targetParam
  }),
  async execute({ storyboard_id, target }) {
    const shot =
      await getStoryboardAgentHandler(storyboard_id).generateKeyframe(target);
    const persisted = await persistBoard(storyboard_id, "The keyframe");
    return {
      ok: true,
      shot,
      ...persisted,
      url: docUrl("storyboard", storyboard_id, { key: "shot", value: shot.id })
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_storyboard_generate_clip",
  description:
    "Render the final clip for a shot, animating its selected keyframe still. The shot must have a still. Kicks off the job and returns the shot; poll ui_storyboard_get_state for the resulting status.",
  parameters: z.object({
    storyboard_id: storyboardIdParam,
    target: targetParam
  }),
  async execute({ storyboard_id, target }) {
    const shot =
      await getStoryboardAgentHandler(storyboard_id).generateClip(target);
    const persisted = await persistBoard(storyboard_id, "The clip");
    return {
      ok: true,
      shot,
      ...persisted,
      url: docUrl("storyboard", storyboard_id, { key: "shot", value: shot.id })
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
    "Assemble the specified storyboard's rendered shots into a persisted timeline sequence and open it in the timeline editor. Shot clips are laid end to end in order; the screenplay's narration and music become draft audio clips ready to generate. Shots without a rendered clip are skipped (returned in skippedShotIds). Each timeline clip stays linked to its shot, so ui_storyboard_revise_shot updates the cut in place.",
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
