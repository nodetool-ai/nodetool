import { z } from "zod";
import { isScreenplay, type ShotStatus } from "@nodetool-ai/protocol";
import { FrontendToolRegistry } from "../frontendTools";
import { getStoryboardAgentHandler } from "../../../components/storyboard/storyboardAgentBridge";

/**
 * Frontend tools that let the agent direct the live Storyboard surface — load a
 * screenplay, add and edit shots, generate stills and clips, approve, and
 * select. Each delegates to the handler the open StoryboardSurface registers on
 * the {@link storyboardAgentBridge}; when no board is open the handler getter
 * throws "No storyboard is open." which the tool layer surfaces to the agent.
 *
 * Shots are addressed by id, 0-based index, or the literal `"selected"`. Call
 * `ui_storyboard_get_state` first to discover the ids the other tools need.
 */

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
    "Read the open storyboard: title, brief, style, aspect ratio, whether a screenplay is loaded, the selected shot, and every shot with its index, slug, action, camera, motion, duration, status, and whether it has a rendered keyframe/clip. Call this first to discover the shot ids/indexes the other tools need.",
  parameters: z.object({}),
  async execute() {
    const snapshot = getStoryboardAgentHandler().getSnapshot();
    return { ok: true, ...snapshot };
  }
});

FrontendToolRegistry.register({
  name: "ui_storyboard_set_screenplay",
  description:
    "Load a full screenplay onto the board, replacing its shots. `screenplay` is a Screenplay object ({ type:'screenplay', id, title, shots: Shot[], ... }) — typically the output of the Director node.",
  parameters: z.object({ screenplay: z.record(z.string(), z.unknown()) }),
  async execute({ screenplay }) {
    if (!isScreenplay(screenplay)) {
      throw new Error(
        "`screenplay` must be a Screenplay object ({ type:'screenplay', shots: [...] })."
      );
    }
    const snapshot = getStoryboardAgentHandler().setScreenplay(screenplay);
    return { ok: true, ...snapshot };
  }
});

FrontendToolRegistry.register({
  name: "ui_storyboard_add_shot",
  description:
    "Add a new shot to the storyboard. `action` is the concrete visual (required). Optionally set `camera`, `motion`, `durationSeconds`, and an `index` to insert at (appended when omitted). The shot starts in the 'planned' status.",
  parameters: z.object({
    action: z.string(),
    camera: cameraParam.optional(),
    motion: z.string().optional(),
    durationSeconds: z.number().optional(),
    index: z.number().optional()
  }),
  async execute({ action, camera, motion, durationSeconds, index }) {
    const shot = getStoryboardAgentHandler().addShot({
      action,
      camera,
      motion,
      durationSeconds,
      index
    });
    return { ok: true, shot };
  }
});

FrontendToolRegistry.register({
  name: "ui_storyboard_update_shot",
  description:
    "Edit an existing shot's `action`, `camera`, `motion`, or `status`. Omit a field to leave it unchanged.",
  parameters: z.object({
    target: targetParam,
    action: z.string().optional(),
    camera: cameraParam.optional(),
    motion: z.string().optional(),
    status: shotStatusEnum.optional()
  }),
  async execute({ target, action, camera, motion, status }) {
    const shot = getStoryboardAgentHandler().updateShot(target, {
      action,
      camera,
      motion,
      status
    });
    return { ok: true, shot };
  }
});

FrontendToolRegistry.register({
  name: "ui_storyboard_generate_keyframe",
  description:
    "Generate (or regenerate) the cheap keyframe still for a shot from its action + the board style. Kicks off the job and returns the shot; poll ui_storyboard_get_state for the resulting status.",
  parameters: z.object({ target: targetParam }),
  async execute({ target }) {
    const shot = await getStoryboardAgentHandler().generateKeyframe(target);
    return { ok: true, shot };
  }
});

FrontendToolRegistry.register({
  name: "ui_storyboard_approve_shot",
  description:
    "Approve a shot's keyframe still, clearing it for the (more expensive) clip render. Only meaningful once the still is ready.",
  parameters: z.object({ target: targetParam }),
  async execute({ target }) {
    const shot = getStoryboardAgentHandler().approveShot(target);
    return { ok: true, shot };
  }
});

FrontendToolRegistry.register({
  name: "ui_storyboard_generate_clip",
  description:
    "Render the final clip for an approved shot, animating its keyframe. Kicks off the job and returns the shot; poll ui_storyboard_get_state for the resulting status.",
  parameters: z.object({ target: targetParam }),
  async execute({ target }) {
    const shot = await getStoryboardAgentHandler().generateClip(target);
    return { ok: true, shot };
  }
});

FrontendToolRegistry.register({
  name: "ui_storyboard_revise_shot",
  description:
    "Regenerate a shot's video clip via video-to-video using a text instruction, e.g. 'make it darker, add rain'. Seeds the shot's existing clip and swaps the revised result in place. The shot must already have a clip (generate one first). Kicks off the job and returns the shot; poll ui_storyboard_get_state for the resulting status.",
  parameters: z.object({
    target: targetParam,
    instruction: z
      .string()
      .describe(
        "The change to make, phrased as a video edit prompt (e.g. 'make it darker, add rain')."
      )
  }),
  async execute({ target, instruction }) {
    const shot = await getStoryboardAgentHandler().reviseShot(
      target,
      instruction
    );
    return { ok: true, shot };
  }
});

FrontendToolRegistry.register({
  name: "ui_storyboard_select_shot",
  description:
    "Select a shot on the storyboard (driving the surface's focus). Pass null to clear the selection.",
  parameters: z.object({ target: targetParam.nullable() }),
  async execute({ target }) {
    const shot = getStoryboardAgentHandler().selectShot(target);
    return { ok: true, selected: shot };
  }
});
