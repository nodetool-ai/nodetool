/**
 * `ui_storyboard_*` — the tools that let the agent direct an open storyboard.
 *
 * A port of web's `builtin/storyboard.ts` with the generation and assembly
 * tools removed (see `storyboardTypes.ts` for why) and zod swapped for plain
 * JSON Schema. Every tool takes an explicit `storyboard_id` and delegates to the
 * handler the mounted StoryboardEditorScreen registered; when that board is not
 * open the getter throws naming the open ids, and the tool layer hands that
 * message to the agent verbatim.
 */

import { getDocumentHandler } from '../agentBridge';
import { MobileToolRegistry } from './registry';
import type {
  StoryboardAgentHandler,
  StoryboardUpdateShotPatch,
} from '../storyboardTypes';
import type { CameraDirection, ShotStatus } from '@nodetool-ai/protocol';

const handlerFor = (storyboardId: string): StoryboardAgentHandler =>
  getDocumentHandler<StoryboardAgentHandler>('storyboard', storyboardId);

const storyboardIdProperty = {
  type: 'string',
  description:
    'Id of the storyboard to act on. Valid ids are listed in the ui_context block of the system prompt; there is no "current board" fallback.',
} as const;

const targetProperty = {
  type: 'string',
  description:
    'Which shot: its id, its 0-based index written as a string, or the literal "selected" for the shot the user has selected on screen.',
} as const;

const cameraProperty = {
  type: 'object',
  description:
    'Structured camera direction. All fields optional: framing ("wide", "close-up"), lens ("35mm"), angle ("low angle"), movement ("slow push in").',
  properties: {
    framing: { type: 'string' },
    lens: { type: 'string' },
    angle: { type: 'string' },
    movement: { type: 'string' },
  },
} as const;

const SHOT_STATUSES: readonly ShotStatus[] = [
  'planned',
  'keyframe_generating',
  'keyframe_ready',
  'approved',
  'clip_generating',
  'rendered',
  'failed',
];

interface StoryboardIdArgs {
  storyboard_id: string;
}

interface TargetArgs extends StoryboardIdArgs {
  target: string;
}

MobileToolRegistry.register<StoryboardIdArgs>({
  name: 'ui_storyboard_get_state',
  description:
    'Read a storyboard: title, brief, style, aspect ratio, whether a screenplay is loaded, the selected shot, and every shot with its index, slug, action, camera, motion, duration, status, and whether it already has a keyframe still or a rendered clip. Call this first — the other tools address shots by the ids and indexes it returns.',
  parameters: {
    type: 'object',
    properties: { storyboard_id: storyboardIdProperty },
    required: ['storyboard_id'],
  },
  async execute({ storyboard_id }) {
    return { ok: true, ...handlerFor(storyboard_id).getSnapshot() };
  },
});

interface AddShotArgs extends StoryboardIdArgs {
  action: string;
  camera?: CameraDirection;
  motion?: string;
  durationSeconds?: number;
  index?: number;
}

MobileToolRegistry.register<AddShotArgs>({
  name: 'ui_storyboard_add_shot',
  description:
    'Add a shot to a storyboard. `action` is the concrete visual — subject and setting, written as an image prompt. Optionally set `camera`, `motion` (what moves in frame), `durationSeconds`, and `index` to insert at a position instead of appending. The new shot starts in the "planned" status; rendering it happens on the desktop app.',
  parameters: {
    type: 'object',
    properties: {
      storyboard_id: storyboardIdProperty,
      action: {
        type: 'string',
        description: 'The concrete visual for this shot, phrased as an image prompt.',
      },
      camera: cameraProperty,
      motion: {
        type: 'string',
        description: 'What moves in the shot, and how the camera moves with it.',
      },
      durationSeconds: {
        type: 'number',
        description: 'Target clip length in seconds.',
      },
      index: {
        type: 'number',
        description: '0-based position to insert at. Appended when omitted.',
      },
    },
    required: ['storyboard_id', 'action'],
  },
  async execute({ storyboard_id, action, camera, motion, durationSeconds, index }) {
    const shot = handlerFor(storyboard_id).addShot({
      action,
      camera,
      motion,
      durationSeconds,
      index,
    });
    return { ok: true, shot };
  },
});

interface UpdateShotArgs extends TargetArgs, StoryboardUpdateShotPatch {}

MobileToolRegistry.register<UpdateShotArgs>({
  name: 'ui_storyboard_update_shot',
  description:
    "Edit one existing shot in place. Set only the fields you want to change — `action`, `camera`, `motion`, `slug` (a short human label), `durationSeconds`, or `status`. Omitted fields keep their current value; there is no way to clear a field.",
  parameters: {
    type: 'object',
    properties: {
      storyboard_id: storyboardIdProperty,
      target: targetProperty,
      action: { type: 'string' },
      camera: cameraProperty,
      motion: { type: 'string' },
      slug: {
        type: 'string',
        description: 'Short human label for the shot, e.g. "Lighthouse at dusk".',
      },
      durationSeconds: { type: 'number' },
      status: {
        type: 'string',
        enum: [...SHOT_STATUSES],
        description:
          'Lifecycle status. Only set this to correct a stale value — the generation pipeline owns it.',
      },
    },
    required: ['storyboard_id', 'target'],
  },
  async execute({
    storyboard_id,
    target,
    action,
    camera,
    motion,
    slug,
    durationSeconds,
    status,
  }) {
    const shot = handlerFor(storyboard_id).updateShot(target, {
      action,
      camera,
      motion,
      slug,
      durationSeconds,
      status,
    });
    return { ok: true, shot };
  },
});

MobileToolRegistry.register<TargetArgs>({
  name: 'ui_storyboard_remove_shot',
  description:
    'Delete one shot from a storyboard. The remaining shots are renumbered so indexes stay contiguous, which means indexes you read earlier are stale after this call — re-read with ui_storyboard_get_state before addressing shots by index again. Returns the removed shot.',
  parameters: {
    type: 'object',
    properties: {
      storyboard_id: storyboardIdProperty,
      target: targetProperty,
    },
    required: ['storyboard_id', 'target'],
  },
  async execute({ storyboard_id, target }) {
    const shot = handlerFor(storyboard_id).removeShot(target);
    return { ok: true, shot };
  },
});

interface ReorderShotArgs extends TargetArgs {
  to_index: number;
}

MobileToolRegistry.register<ReorderShotArgs>({
  name: 'ui_storyboard_reorder_shot',
  description:
    'Move one shot to a different position in the running order. `to_index` is the 0-based position it should end up at, counted after the shot is lifted out. Every shot is renumbered, so re-read the board before using indexes again. Returns the moved shot.',
  parameters: {
    type: 'object',
    properties: {
      storyboard_id: storyboardIdProperty,
      target: targetProperty,
      to_index: {
        type: 'number',
        description: '0-based destination position. Clamped to the board length.',
      },
    },
    required: ['storyboard_id', 'target', 'to_index'],
  },
  async execute({ storyboard_id, target, to_index }) {
    const shot = handlerFor(storyboard_id).reorderShot(target, to_index);
    return { ok: true, shot };
  },
});

interface SetBriefArgs extends StoryboardIdArgs {
  brief: string;
}

MobileToolRegistry.register<SetBriefArgs>({
  name: 'ui_storyboard_set_brief',
  description:
    "Replace the board's brief — the one-paragraph description of what the piece is about. Returns the updated board snapshot.",
  parameters: {
    type: 'object',
    properties: {
      storyboard_id: storyboardIdProperty,
      brief: { type: 'string', description: 'The new brief. Replaces the old one.' },
    },
    required: ['storyboard_id', 'brief'],
  },
  async execute({ storyboard_id, brief }) {
    return { ok: true, ...handlerFor(storyboard_id).setBrief(brief) };
  },
});

interface SetStyleArgs extends StoryboardIdArgs {
  style: string;
}

MobileToolRegistry.register<SetStyleArgs>({
  name: 'ui_storyboard_set_style',
  description:
    "Replace the board's style — palette, light, lens, and texture, appended to every shot prompt to hold the look consistent. Returns the updated board snapshot.",
  parameters: {
    type: 'object',
    properties: {
      storyboard_id: storyboardIdProperty,
      style: {
        type: 'string',
        description:
          'The look applied to every shot, e.g. "grainy 16mm, muted teal palette, low sun".',
      },
    },
    required: ['storyboard_id', 'style'],
  },
  async execute({ storyboard_id, style }) {
    return { ok: true, ...handlerFor(storyboard_id).setStyle(style) };
  },
});

interface SetAspectRatioArgs extends StoryboardIdArgs {
  aspect_ratio: string;
}

MobileToolRegistry.register<SetAspectRatioArgs>({
  name: 'ui_storyboard_set_aspect_ratio',
  description:
    'Set the frame shape every shot is generated at, as a ratio string like "16:9", "9:16", or "1:1". Returns the updated board snapshot.',
  parameters: {
    type: 'object',
    properties: {
      storyboard_id: storyboardIdProperty,
      aspect_ratio: {
        type: 'string',
        description: 'Ratio string, e.g. "16:9" for landscape or "9:16" for vertical.',
      },
    },
    required: ['storyboard_id', 'aspect_ratio'],
  },
  async execute({ storyboard_id, aspect_ratio }) {
    return { ok: true, ...handlerFor(storyboard_id).setAspectRatio(aspect_ratio) };
  },
});

interface SelectShotArgs extends StoryboardIdArgs {
  target: string | null;
}

MobileToolRegistry.register<SelectShotArgs>({
  name: 'ui_storyboard_select_shot',
  description:
    'Select a shot on screen, scrolling the user to it. Pass null to clear the selection. The selected shot is what "selected" resolves to in the other tools, so use this to show the user the shot you are about to discuss.',
  parameters: {
    type: 'object',
    properties: {
      storyboard_id: storyboardIdProperty,
      target: {
        ...targetProperty,
        description: `${targetProperty.description} Pass null to clear the selection.`,
      },
    },
    required: ['storyboard_id', 'target'],
  },
  async execute({ storyboard_id, target }) {
    const selected = handlerFor(storyboard_id).selectShot(target);
    return { ok: true, selected };
  },
});

MobileToolRegistry.register<StoryboardIdArgs>({
  name: 'ui_storyboard_save',
  description:
    'Persist the board to the server. Edits from the other tools are local until this runs, so call it once after a batch of changes. Fails when someone else has saved the board since it was opened — the user then has to reload it.',
  parameters: {
    type: 'object',
    properties: { storyboard_id: storyboardIdProperty },
    required: ['storyboard_id'],
  },
  async execute({ storyboard_id }) {
    return await handlerFor(storyboard_id).save();
  },
});
