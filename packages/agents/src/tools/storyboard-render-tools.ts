/**
 * Storyboard render tools — the fast path from a directed board to rendered
 * media and an assembled cut, with no workflow in between.
 *
 *   list_storyboards            — find a board to work on
 *   get_storyboard              — read its shots, models, and per-shot status
 *   render_storyboard_stills    — keyframe stills, many shots per call
 *   render_storyboard_clips     — animate each selected keyframe into a clip
 *   revise_storyboard_clip      — video-to-video revision of one shot's clip
 *   assemble_storyboard_timeline— lay the rendered clips into a timeline row
 *   edit_storyboard             — shape the shot list in the first place
 *
 * The implementations moved to the `storyboards` capability module
 * (`../capabilities/storyboards.ts`); the classes below are thin wrappers over
 * them so `BUILTIN_TOOL_CLASSES` and every belt that names them keep working.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  CapabilityTool,
  UNGATED,
  createCapabilityRun,
  type CapabilityRun
} from "../capabilities/index.js";
import {
  assembleStoryboardTimeline,
  editStoryboard,
  getStoryboard,
  listStoryboards,
  renderStoryboardClips,
  renderStoryboardStills,
  reviseStoryboardClip
} from "../capabilities/storyboards.js";

/** These capabilities need nothing per-run beyond the calling context. */
const storyboardRun = (context: ProcessingContext): CapabilityRun =>
  createCapabilityRun({ context, gate: UNGATED });

/**
 * @deprecated Ported to the `storyboards` capability module
 * (`../capabilities/storyboards.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class ListStoryboardsTool extends CapabilityTool {
  constructor() {
    super(listStoryboards.spec, listStoryboards.impl, storyboardRun);
  }
}

/**
 * @deprecated Ported to the `storyboards` capability module
 * (`../capabilities/storyboards.ts`).
 */
export class GetStoryboardTool extends CapabilityTool {
  constructor() {
    super(getStoryboard.spec, getStoryboard.impl, storyboardRun);
  }
}

/**
 * @deprecated Ported to the `storyboards` capability module
 * (`../capabilities/storyboards.ts`).
 */
export class RenderStoryboardStillsTool extends CapabilityTool {
  constructor() {
    super(
      renderStoryboardStills.spec,
      renderStoryboardStills.impl,
      storyboardRun
    );
  }
}

/**
 * @deprecated Ported to the `storyboards` capability module
 * (`../capabilities/storyboards.ts`).
 */
export class RenderStoryboardClipsTool extends CapabilityTool {
  constructor() {
    super(renderStoryboardClips.spec, renderStoryboardClips.impl, storyboardRun);
  }
}

/**
 * @deprecated Ported to the `storyboards` capability module
 * (`../capabilities/storyboards.ts`).
 */
export class ReviseStoryboardClipTool extends CapabilityTool {
  constructor() {
    super(reviseStoryboardClip.spec, reviseStoryboardClip.impl, storyboardRun);
  }
}

/**
 * @deprecated Ported to the `storyboards` capability module
 * (`../capabilities/storyboards.ts`).
 */
export class AssembleStoryboardTimelineTool extends CapabilityTool {
  constructor() {
    super(
      assembleStoryboardTimeline.spec,
      assembleStoryboardTimeline.impl,
      storyboardRun
    );
  }
}

/**
 * @deprecated Ported to the `storyboards` capability module
 * (`../capabilities/storyboards.ts`).
 */
export class EditStoryboardTool extends CapabilityTool {
  constructor() {
    super(editStoryboard.spec, editStoryboard.impl, storyboardRun);
  }
}

/** Every tool in this module, for toolbelt assembly and docs. */
export const STORYBOARD_RENDER_TOOL_NAMES = [
  "list_storyboards",
  "get_storyboard",
  "render_storyboard_stills",
  "render_storyboard_clips",
  "revise_storyboard_clip",
  "assemble_storyboard_timeline",
  "edit_storyboard"
] as const;
