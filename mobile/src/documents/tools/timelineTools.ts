/**
 * `ui_timeline_*` — the agent's hands on an open timeline sequence.
 *
 * The screen stays a viewer (arranging clips by touch is not viable at phone
 * width), so the agent is the only way to change a sequence here: it reads the
 * state, applies the edit, and the user presses Save. Every write goes through
 * `documentStore.edit()`, so the screen the user is holding repaints
 * immediately, and `ui_timeline_save` is the same code path as the Save button.
 *
 * Two desktop capabilities are deliberately absent, and every description says
 * so: **generation** (`ui_timeline_generate_clip`) needs a running generation
 * job to supervise, and **frame inspection** (`ui_timeline_get_clip_frames`)
 * needs canvas and video decode. Promising either here would produce a failure
 * the user has to interpret.
 *
 * Every tool names its target with `timeline_id` and resolves it through the
 * agent bridge, which throws listing the open ids when the sequence is not
 * mounted.
 */

import type { AnimationRole, SnapAction, SnapBoundaryMode } from '@nodetool-ai/timeline';

import { getDocumentHandler } from '../agentBridge';
import { animationPresetCatalog } from '../timelineEdits';
import { MobileToolRegistry } from './registry';
import type {
  TimelineAddGroupInput,
  TimelineAddMarkerInput,
  TimelineAddMediaClipInput,
  TimelineAddShapeClipInput,
  TimelineAddTextClipInput,
  TimelineAgentHandler,
  TimelineAnimationInput,
  TimelineClipBindingPatch,
  TimelineClipParamsPatch,
  TimelineEffectInput,
  TimelineMaskInput,
  TimelineMatteInput,
  TimelineMovePatch,
  TimelineTimeRemapInput,
  TimelineTrackType,
  TimelineTransitionInput,
  TimelineTrimPatch,
} from '../timelineTypes';

const ANIMATION_ROLES = ['in', 'out', 'emphasis', 'loop'] as const;

/** Mirrors `KNOWN_TRANSITION_TYPE_LIST`; the builder refuses anything else. */
const TRANSITION_TYPE_ENUM = [
  'crossfade',
  'dipToColor',
  'wipe',
  'push',
  'slide',
  'zoom',
] as const;

/** Mirrors `KNOWN_CLIP_EFFECT_TYPE_LIST`. */
const EFFECT_TYPE_ENUM = [
  'color',
  'blur',
  'glow',
  'dropShadow',
  'vignette',
  'sharpen',
  'chromaKey',
  'curves',
  'levels',
  'liftGammaGain',
] as const;

const handlerFor = (timelineId: string): TimelineAgentHandler =>
  getDocumentHandler<TimelineAgentHandler>('timeline', timelineId);

const timelineIdParam = {
  type: 'string',
  description:
    'Id of the target timeline sequence. The ids currently open are listed in the ui_context block of the system prompt.',
} as const;

const targetParam = {
  type: 'string',
  description:
    'Clip id, clip name (case-insensitive), or the literal "selected" for the currently-selected clip.',
} as const;

const DESKTOP_ONLY_NOTE =
  'Generating clip media and rendering or inspecting frames are desktop-only; this surface edits the sequence document, and the user then saves it.';

const SAVE_NOTE =
  'This edits the open document but does not persist it — call ui_timeline_save, or tell the user to press Save.';

const LINK_NOTE =
  'Linked clips (a video clip and the audio extracted from it share a linkId) are kept in sync automatically.';

const numberParam = (description: string) =>
  ({ type: 'number', description }) as const;

const textStyleSchema = {
  type: 'object',
  properties: {
    fontFamily: { type: 'string' },
    fontSizePx: { type: 'number' },
    fontWeight: { type: 'number' },
    color: { type: 'string', description: 'CSS colour, e.g. "#FFFFFF".' },
    align: { type: 'string', enum: ['left', 'center', 'right'] },
    maxWidthFrac: {
      type: 'number',
      description: 'Maximum text width as a fraction of the frame width, 0..1.',
    },
  },
} as const;

const shapeSchema = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['rect', 'ellipse', 'line'] },
    fill: { type: 'string' },
    stroke: { type: 'string' },
    strokeWidthPx: { type: 'number' },
    x: { type: 'number', description: 'Normalized canvas coordinate, 0..1.' },
    y: { type: 'number', description: 'Normalized canvas coordinate, 0..1.' },
    width: { type: 'number', description: 'Normalized width, 0..1.' },
    height: { type: 'number', description: 'Normalized height, 0..1.' },
    x2: { type: 'number', description: 'Line end point, normalized.' },
    y2: { type: 'number', description: 'Line end point, normalized.' },
  },
  required: ['kind'],
} as const;

// ── Reads ───────────────────────────────────────────────────────────────────

MobileToolRegistry.register<{ timeline_id: string }>({
  name: 'ui_timeline_get_state',
  description:
    'Read an open timeline sequence: duration, playhead, selection, whether it has unsaved edits, every track, every clip with its timing, media type, status, link id, and generation binding (prompt/provider/model), and the transcript lines with the clips they own. Call this first — the other timeline tools need the clip ids and names it returns. ' +
    DESKTOP_ONLY_NOTE,
  parameters: {
    type: 'object',
    properties: { timeline_id: timelineIdParam },
    required: ['timeline_id'],
  },
  execute: async ({ timeline_id }) => ({
    ok: true,
    ...handlerFor(timeline_id).getSnapshot(),
  }),
});

MobileToolRegistry.register<{ timeline_id: string; target: string }>({
  name: 'ui_timeline_get_clip',
  description:
    'Read one clip of an open timeline sequence — its track, timing, media type, status, prompt/model, and whether a rendered asset is attached. Use it to answer a question about a specific clip after ui_timeline_get_state. ' +
    DESKTOP_ONLY_NOTE,
  parameters: {
    type: 'object',
    properties: { timeline_id: timelineIdParam, target: targetParam },
    required: ['timeline_id', 'target'],
  },
  execute: async ({ timeline_id, target }) => ({
    ok: true,
    clip: handlerFor(timeline_id).getClip(target),
  }),
});

MobileToolRegistry.register<{
  timeline_id: string;
  target?: string | null;
}>({
  name: 'ui_timeline_select_clip',
  description:
    'Select a clip on screen, opening its detail panel for the user. Omit `target` (or pass null) to clear the selection. Selecting only changes what is shown; it changes nothing in the document — but it does set what "selected" resolves to for the other tools.',
  parameters: {
    type: 'object',
    properties: {
      timeline_id: timelineIdParam,
      target: {
        ...targetParam,
        description: `${targetParam.description} Omit or pass null to clear the selection.`,
      },
    },
    required: ['timeline_id'],
  },
  execute: async ({ timeline_id, target }) => ({
    ok: true,
    selected: handlerFor(timeline_id).selectClip(target ?? null),
  }),
});

MobileToolRegistry.register<{ timeline_id: string; timeMs: number }>({
  name: 'ui_timeline_seek',
  description:
    'Move the playhead of an open timeline sequence to an absolute time in milliseconds, clamped to the sequence duration. Use it to point the user at a moment you are describing, or before ui_timeline_split_clip to cut at the playhead.',
  parameters: {
    type: 'object',
    properties: {
      timeline_id: timelineIdParam,
      timeMs: numberParam(
        'Absolute position on the sequence timeline, in milliseconds from the start.'
      ),
    },
    required: ['timeline_id', 'timeMs'],
  },
  execute: async ({ timeline_id, timeMs }) => ({
    ok: true,
    playheadMs: handlerFor(timeline_id).seek(timeMs),
  }),
});

// ── Structure ───────────────────────────────────────────────────────────────

MobileToolRegistry.register<{
  timeline_id: string;
  type: TimelineTrackType;
  name?: string;
}>({
  name: 'ui_timeline_add_track',
  description:
    'Add a track to an open timeline sequence. `type` is one of video, audio, overlay, subtitle. Optionally provide a name. ' +
    SAVE_NOTE,
  parameters: {
    type: 'object',
    properties: {
      timeline_id: timelineIdParam,
      type: {
        type: 'string',
        enum: ['video', 'audio', 'overlay', 'subtitle'],
        description: 'Kind of track to create.',
      },
      name: { type: 'string', description: 'Track name. Defaults to "<type> <n>".' },
    },
    required: ['timeline_id', 'type'],
  },
  execute: async ({ timeline_id, type, name }) => ({
    ok: true,
    track: handlerFor(timeline_id).addTrack(type, name),
  }),
});

MobileToolRegistry.register<
  { timeline_id: string } & TimelineAddTextClipInput
>({
  name: 'ui_timeline_add_text_clip',
  description:
    'Add authored text to an open timeline sequence. It goes on an overlay track, creating one when needed, and lasts 3000ms by default. Text and shapes require a video or overlay track — an audio or subtitle track is rejected. ' +
    SAVE_NOTE,
  parameters: {
    type: 'object',
    properties: {
      timeline_id: timelineIdParam,
      text: { type: 'string', description: 'The text to draw. Must not be empty.' },
      trackId: {
        type: 'string',
        description:
          'Target track id or name. Omit to use (or create) an overlay track.',
      },
      startMs: numberParam(
        'Absolute start on the timeline in ms. Omit to append after the track\'s existing content.'
      ),
      durationMs: numberParam('On-timeline length in ms. Default 3000, minimum 1.'),
      style: textStyleSchema,
    },
    required: ['timeline_id', 'text'],
  },
  execute: async ({ timeline_id, ...input }) => ({
    ok: true,
    clip: handlerFor(timeline_id).addTextClip(input),
  }),
});

MobileToolRegistry.register<
  { timeline_id: string } & TimelineAddShapeClipInput
>({
  name: 'ui_timeline_add_shape_clip',
  description:
    'Add a rectangle, ellipse, or line on an overlay track of an open timeline sequence. Omitted colours use a visible white fill (rect/ellipse) or a visible white stroke (line). Shapes require a video or overlay track. Preview and export rasterization happen on desktop. ' +
    SAVE_NOTE,
  parameters: {
    type: 'object',
    properties: {
      timeline_id: timelineIdParam,
      shape: shapeSchema,
      trackId: {
        type: 'string',
        description:
          'Target track id or name. Omit to use (or create) an overlay track.',
      },
      startMs: numberParam(
        'Absolute start on the timeline in ms. Omit to append after the track\'s existing content.'
      ),
      durationMs: numberParam('On-timeline length in ms. Default 3000, minimum 1.'),
    },
    required: ['timeline_id', 'shape'],
  },
  execute: async ({ timeline_id, ...input }) => ({
    ok: true,
    clip: handlerFor(timeline_id).addShapeClip(input),
  }),
});

// ── Arranging ───────────────────────────────────────────────────────────────

MobileToolRegistry.register<
  { timeline_id: string; target: string } & TimelineMovePatch
>({
  name: 'ui_timeline_move_clip',
  description:
    'Move a clip to a new absolute start time and/or onto a different track. Omit a field to leave it unchanged. ' +
    LINK_NOTE +
    ' Siblings shift by the same delta and keep their own track, and the delta is clamped so no member of the group is pushed before zero — check the returned clips for where they landed. ' +
    SAVE_NOTE,
  parameters: {
    type: 'object',
    properties: {
      timeline_id: timelineIdParam,
      target: targetParam,
      startMs: numberParam('New absolute start on the timeline in ms, clamped to >= 0.'),
      trackId: {
        type: 'string',
        description:
          'Track id or name to move onto. Rejected when no such track exists.',
      },
    },
    required: ['timeline_id', 'target'],
  },
  execute: async ({ timeline_id, target, startMs, trackId }) => ({
    ok: true,
    clips: handlerFor(timeline_id).moveClip(target, { startMs, trackId }),
  }),
});

MobileToolRegistry.register<
  { timeline_id: string; target: string } & TimelineTrimPatch
>({
  name: 'ui_timeline_trim_clip',
  description:
    "Trim a clip's length or its source in/out points. `durationMs` sets the on-timeline length (minimum 1); `inPointMs`/`outPointMs` set the trimmed source window (ms into the source media). Omit a field to leave it unchanged. " +
    LINK_NOTE +
    ' A length change applies the same delta to every sibling and is all-or-nothing: if it would be invalid for any of them, nothing changes. Source in/out points belong to one clip\'s own media, so they apply to the target only. ' +
    SAVE_NOTE,
  parameters: {
    type: 'object',
    properties: {
      timeline_id: timelineIdParam,
      target: targetParam,
      durationMs: numberParam('New on-timeline length in ms. Minimum 1.'),
      inPointMs: numberParam('Start of the source window, ms into the source media.'),
      outPointMs: numberParam('End of the source window, ms into the source media.'),
    },
    required: ['timeline_id', 'target'],
  },
  execute: async ({ timeline_id, target, durationMs, inPointMs, outPointMs }) => ({
    ok: true,
    clips: handlerFor(timeline_id).trimClip(target, {
      durationMs,
      inPointMs,
      outPointMs,
    }),
  }),
});

MobileToolRegistry.register<{
  timeline_id: string;
  target: string;
  atMs?: number;
}>({
  name: 'ui_timeline_split_clip',
  description:
    'Cut a clip in two at the given time (the razor tool). `atMs` is an absolute time on the timeline and must fall strictly inside the clip; omit it to split at the playhead. Returns the two halves. ' +
    LINK_NOTE +
    ' Every sibling spanning the cut is split at the same point, and each side becomes its own link pair. A clip owned by a transcript line is refused: the transcript can only be re-flowed on desktop. ' +
    SAVE_NOTE,
  parameters: {
    type: 'object',
    properties: {
      timeline_id: timelineIdParam,
      target: targetParam,
      atMs: numberParam(
        'Absolute split time on the timeline in ms. Omit to split at the playhead.'
      ),
    },
    required: ['timeline_id', 'target'],
  },
  execute: async ({ timeline_id, target, atMs }) => ({
    ok: true,
    clips: handlerFor(timeline_id).splitClip(target, atMs),
  }),
});

MobileToolRegistry.register<{ timeline_id: string; target: string }>({
  name: 'ui_timeline_delete_clip',
  description:
    'Remove a clip from an open timeline sequence. A link group left with one member is unlinked. A clip owned by a transcript line is refused: the transcript can only be re-flowed on desktop. ' +
    SAVE_NOTE,
  parameters: {
    type: 'object',
    properties: { timeline_id: timelineIdParam, target: targetParam },
    required: ['timeline_id', 'target'],
  },
  execute: async ({ timeline_id, target }) => ({
    ok: true,
    deleted: handlerFor(timeline_id).deleteClip(target),
  }),
});

MobileToolRegistry.register<{
  timeline_id: string;
  target: string;
  gapMs?: number;
}>({
  name: 'ui_timeline_duplicate_clip',
  description:
    'Duplicate a clip. The copy is placed immediately after the source (add `gapMs` for a gap) and keeps its generation binding, so you can tweak the copy for a variation. The copy is a draft with no asset and no version history — it has not been generated, and generating it is desktop-only. ' +
    LINK_NOTE +
    ' A linked clip duplicates together with its siblings, and the copies form their own link group. ' +
    SAVE_NOTE,
  parameters: {
    type: 'object',
    properties: {
      timeline_id: timelineIdParam,
      target: targetParam,
      gapMs: numberParam('Extra gap in ms between the source and the copy. Default 0.'),
    },
    required: ['timeline_id', 'target'],
  },
  execute: async ({ timeline_id, target, gapMs }) => ({
    ok: true,
    clips: handlerFor(timeline_id).duplicateClip(target, gapMs),
  }),
});

MobileToolRegistry.register<
  { timeline_id: string; target: string } & TimelineClipParamsPatch
>({
  name: 'ui_timeline_set_clip_params',
  description:
    "Change a clip's render/audio params — `name`, `opacity` (0..1), `speedMultiplier` (0.1..8), `volumeDb`, `fadeInMs`, `fadeOutMs`, `blendMode`, `borderRadius`, `hidden`, `muted`, `locked`, a text clip's `textStyle`, a shape clip's `shapeStyle` — or its generation binding: `prompt`, `negativePrompt`, `provider`, `model`, TTS `voice`, `width`/`height`, `strength`, `numInferenceSteps`, `seed`. Omit a field to leave it unchanged. Changing any binding field marks an already-generated clip `stale`, because its asset no longer matches its settings; re-generating it is desktop-only. Binding fields are rejected on imported clips. " +
    SAVE_NOTE,
  parameters: {
    type: 'object',
    properties: {
      timeline_id: timelineIdParam,
      target: targetParam,
      name: { type: 'string' },
      opacity: numberParam('Opacity, 0..1.'),
      speedMultiplier: numberParam('Playback speed, 0.1..8.'),
      volumeDb: numberParam('Audio volume in dB. 0 is unchanged.'),
      fadeInMs: numberParam('Fade-in length in ms.'),
      fadeOutMs: numberParam('Fade-out length in ms.'),
      blendMode: { type: 'string', description: 'GPU blend mode, e.g. "normal".' },
      borderRadius: numberParam('Rounded-corner radius in source pixels.'),
      hidden: { type: 'boolean' },
      muted: { type: 'boolean' },
      locked: { type: 'boolean' },
      textStyle: {
        ...textStyleSchema,
        properties: {
          ...textStyleSchema.properties,
          text: { type: 'string' },
        },
        required: ['text', 'fontSizePx', 'color'],
        description: 'Replacement text style. Text clips only.',
      },
      shapeStyle: {
        ...shapeSchema,
        description: 'Replacement shape geometry. Shape clips only.',
      },
      prompt: { type: 'string' },
      negativePrompt: { type: 'string' },
      provider: { type: 'string' },
      model: { type: 'string' },
      voice: { type: 'string', description: 'TTS voice id for text-to-audio clips.' },
      width: numberParam('Generation width in pixels.'),
      height: numberParam('Generation height in pixels.'),
      strength: numberParam('Image-to-image strength, 0..1.'),
      numInferenceSteps: numberParam('Sampler steps.'),
      seed: numberParam('Generation seed.'),
    },
    required: ['timeline_id', 'target'],
  },
  execute: async ({ timeline_id, target, ...patch }) => ({
    ok: true,
    clip: handlerFor(timeline_id).setClipParams(target, patch),
  }),
});

// ── Media, binding, motion ──────────────────────────────────────────────────

MobileToolRegistry.register<
  { timeline_id: string } & TimelineAddMediaClipInput
>({
  name: 'ui_timeline_add_media_clip',
  description:
    'Place an asset already in the library — a video, image, or audio file — on an open timeline sequence. `asset` is an asset id or an `asset://<id>.<ext>` URI. Without a track the clip lands on a track matching its media kind, creating one when needed; without `startMs` it is appended after that track\'s existing content, so calling this once per asset lays them end to end. Duration comes from the asset when the library knows it. ' +
    SAVE_NOTE,
  parameters: {
    type: 'object',
    properties: {
      timeline_id: timelineIdParam,
      asset: {
        type: 'string',
        description: 'Asset id or `asset://<id>.<ext>` URI, as list_assets reports them.',
      },
      trackId: {
        type: 'string',
        description: 'Target track id or name. Omit to use (or create) a track for the media kind.',
      },
      startMs: numberParam(
        "Absolute start on the timeline in ms. Omit to append after the track's existing content."
      ),
      durationMs: numberParam(
        "On-timeline length in ms. Omit to use the asset's own duration."
      ),
      name: { type: 'string', description: "Clip name. Defaults to the asset's name." },
    },
    required: ['timeline_id', 'asset'],
  },
  execute: async ({ timeline_id, ...input }) => ({
    ok: true,
    clip: await handlerFor(timeline_id).addMediaClip(input),
  }),
});

MobileToolRegistry.register<
  { timeline_id: string; target: string } & TimelineClipBindingPatch
>({
  name: 'ui_timeline_set_clip_binding',
  description:
    "Edit a generated clip's generation binding on its own — `prompt`, `negativePrompt`, `provider`/`model`, TTS `voice`, `width`/`height`, `strength`, `numInferenceSteps`, `seed`. Only applies to generated clips; an imported one is refused. A clip that already has a render is marked `stale`, because its asset no longer matches its settings — re-generating it is desktop-only. `aspectRatio` and `resolution` are not accepted here: they are not in the timeline document schema, so a save would drop them. " +
    SAVE_NOTE,
  parameters: {
    type: 'object',
    properties: {
      timeline_id: timelineIdParam,
      target: targetParam,
      prompt: { type: 'string' },
      negativePrompt: { type: 'string' },
      provider: { type: 'string' },
      model: { type: 'string' },
      voice: { type: 'string', description: 'TTS voice id for text-to-audio clips.' },
      width: numberParam('Generation width in pixels.'),
      height: numberParam('Generation height in pixels.'),
      strength: numberParam('Image-to-image strength, 0..1.'),
      numInferenceSteps: numberParam('Sampler steps.'),
      seed: numberParam('Generation seed.'),
    },
    required: ['timeline_id', 'target'],
  },
  execute: async ({ timeline_id, target, ...patch }) => ({
    ok: true,
    clip: handlerFor(timeline_id).setClipBinding(target, patch),
  }),
});

MobileToolRegistry.register<{
  timeline_id: string;
  target: string;
  animations: TimelineAnimationInput[];
  mode?: 'add' | 'replace';
}>({
  name: 'ui_timeline_animate_clip',
  description:
    'Attach motion-design animations to a clip. Roles: `in` (entrance: fade, slide, pop, spin, wipe, blur, colorFade), `out` (exit), `emphasis` (mid-clip: pulse, flash, shake, bounce, squash), `loop` (continuous: kenBurns, float, breathe, rotate, hueShift). Each animation takes `role`, `preset`, optional `durationMs`, `delayMs`, `easing`, and preset `params`. For motion no preset covers, use `preset: "custom"` with `curves` — keyframes you write, `t` running 0..1 over the window — and add `mask` when a curve drives wipeProgress. Baking a `code` body into curves is not available on this surface: use the headless `edit_timeline` tool for that. On text clips, `stagger` runs the animation once per word. `mode` "replace" (default) swaps the clip\'s animations; "add" appends. Call ui_timeline_list_animation_presets first for the exact preset ids and params. ' +
    SAVE_NOTE,
  parameters: {
    type: 'object',
    properties: {
      timeline_id: timelineIdParam,
      target: targetParam,
      mode: {
        type: 'string',
        enum: ['add', 'replace'],
        description: 'Default "replace".',
      },
      animations: {
        type: 'array',
        description: 'At least one animation.',
        items: {
          type: 'object',
          properties: {
            role: { type: 'string', enum: ANIMATION_ROLES },
            preset: {
              type: 'string',
              description: 'Preset id, or "custom" with `curves`.',
            },
            durationMs: { type: 'number' },
            delayMs: { type: 'number' },
            easing: {
              type: 'string',
              description: 'Easing id, cubic-bezier(x1,y1,x2,y2) or spring(stiffness,damping,mass).',
            },
            params: { type: 'object', description: 'Preset-specific knobs.' },
            curves: {
              type: 'array',
              description:
                '`custom` only: [{property, keyframes:[{t, value, easing?}]}], t running 0..1.',
            },
            mask: {
              type: 'object',
              description: '`custom` only: {direction, softness}, required by a wipeProgress curve.',
            },
            stagger: {
              type: 'object',
              properties: {
                unit: { type: 'string', enum: ['word', 'character', 'line'] },
                offsetMs: { type: 'number' },
                from: { type: 'string', enum: ['start', 'end', 'center'] },
              },
              required: ['unit', 'offsetMs'],
              description: 'Per-unit stagger — text clips only.',
            },
          },
          required: ['role', 'preset'],
        },
      },
    },
    required: ['timeline_id', 'target', 'animations'],
  },
  execute: async ({ timeline_id, target, animations, mode }) => ({
    ok: true,
    clip: handlerFor(timeline_id).animateClip(target, animations, mode),
  }),
});

MobileToolRegistry.register<{
  timeline_id: string;
  target: string;
  role?: AnimationRole;
}>({
  name: 'ui_timeline_clear_animations',
  description:
    'Remove motion-design animations from a clip. Pass `role` to clear only that role (in/out/emphasis/loop); omit it to clear all. ' +
    SAVE_NOTE,
  parameters: {
    type: 'object',
    properties: {
      timeline_id: timelineIdParam,
      target: targetParam,
      role: { type: 'string', enum: ANIMATION_ROLES },
    },
    required: ['timeline_id', 'target'],
  },
  execute: async ({ timeline_id, target, role }) => ({
    ok: true,
    clip: handlerFor(timeline_id).clearAnimations(target, role),
  }),
});

MobileToolRegistry.register<Record<string, never>>({
  name: 'ui_timeline_list_animation_presets',
  description:
    "List the motion-design animation presets: id, allowed roles, params (with defaults and ranges), default duration/easing, and a one-line description. Also returns the `custom` preset's contract and every animatable property with its fold, identity and range, for keyframed motion no preset covers. Use this to discover the exact preset names and params for ui_timeline_animate_clip. It reads the catalog, not a sequence, so it needs no timeline_id.",
  parameters: { type: 'object', properties: {} },
  execute: async () => ({ ok: true, ...animationPresetCatalog() }),
});

// ── Groups ──────────────────────────────────────────────────────────────────

MobileToolRegistry.register<{ timeline_id: string } & TimelineAddGroupInput>({
  name: 'ui_timeline_add_group',
  description:
    'Create a group clip: a clip with no media of its own whose transform, opacity and window every clip naming it inherits. Move the group and its children move with it; a child outside the group’s window is not drawn. Children keep their own tracks, so what covers what is unchanged. Pass `children` to parent clips as the group is created, or use ui_timeline_set_parent afterwards. ' +
    SAVE_NOTE,
  parameters: {
    type: 'object',
    properties: {
      timeline_id: timelineIdParam,
      name: { type: 'string', description: 'Label for the group clip.' },
      startMs: numberParam("Where the group's window opens, in ms."),
      durationMs: numberParam(
        'How long the window stays open. A child is clipped to it, so cover the children.'
      ),
      trackId: {
        type: 'string',
        description: 'Track for the group clip, by id or name. Defaults to an overlay track.',
      },
      children: {
        type: 'array',
        items: { type: 'string' },
        description: 'Clips to parent to the new group, by id or name. Each keeps its own track.',
      },
    },
    required: ['timeline_id', 'name', 'startMs', 'durationMs'],
  },
  execute: async ({ timeline_id, ...input }) => ({
    ok: true,
    ...handlerFor(timeline_id).addGroup(input),
  }),
});

MobileToolRegistry.register<{
  timeline_id: string;
  target: string;
  parentId: string | null;
}>({
  name: 'ui_timeline_set_parent',
  description:
    "Parent a clip to a group so it inherits the group's transform, opacity and window, or release it with `parentId: null`. The parent must be a clip created with ui_timeline_add_group; a clip cannot parent itself or any group beneath it. " +
    SAVE_NOTE,
  parameters: {
    type: 'object',
    properties: {
      timeline_id: timelineIdParam,
      target: targetParam,
      parentId: {
        type: 'string',
        description: 'The group clip to inherit from, by id or name. null releases the clip.',
      },
    },
    required: ['timeline_id', 'target', 'parentId'],
  },
  execute: async ({ timeline_id, target, parentId }) => ({
    ok: true,
    clip: handlerFor(timeline_id).setParent(target, parentId ?? null),
  }),
});

// ── Compositing ─────────────────────────────────────────────────────────────

MobileToolRegistry.register<{
  timeline_id: string;
  target: string;
  transition: TimelineTransitionInput | null;
}>({
  name: 'ui_timeline_set_transition',
  description:
    'Set the transition a clip opens with, or clear it with `transition: null`. A transition is between two clips: it plays over the head of `target` against whatever sits beneath it on the same track, so overlap the two clips by at least `durationMs` for both to be seen. Types: crossfade, dipToColor, wipe, push, slide, zoom. Rendering is desktop-only; this writes the document. ' +
    SAVE_NOTE,
  parameters: {
    type: 'object',
    properties: {
      timeline_id: timelineIdParam,
      target: targetParam,
      transition: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: TRANSITION_TYPE_ENUM },
          durationMs: numberParam(
            "Length of the cut from the clip's start. 0 or less is a hard cut."
          ),
          easing: { type: 'string' },
          color: { type: 'string', description: 'dipToColor only, e.g. #000000.' },
          direction: {
            type: 'string',
            enum: ['left', 'right', 'up', 'down'],
            description: 'wipe, push and slide only.',
          },
          softness: numberParam('wipe only: feathered edge width, 0..1.'),
        },
        required: ['type', 'durationMs'],
        description: 'The transition, or null to clear it.',
      },
    },
    required: ['timeline_id', 'target', 'transition'],
  },
  execute: async ({ timeline_id, target, transition }) => ({
    ok: true,
    clip: handlerFor(timeline_id).setTransition(target, transition ?? null),
  }),
});

MobileToolRegistry.register<{
  timeline_id: string;
  target: string;
  mask: TimelineMaskInput | null;
}>({
  name: 'ui_timeline_set_mask',
  description:
    "Mask a clip to a rectangle, an ellipse or an SVG path, or clear it with `mask: null`. Coordinates are 0..1 in the clip's own space, so the mask turns and scales with the clip. `featherPx` softens the edge; `invert` keeps what the shape excludes instead. " +
    SAVE_NOTE,
  parameters: {
    type: 'object',
    properties: {
      timeline_id: timelineIdParam,
      target: targetParam,
      mask: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['rect', 'ellipse', 'path'] },
          x: numberParam("Left edge, 0..1 of the layer's width. Default 0."),
          y: numberParam("Top edge, 0..1 of the layer's height. Default 0."),
          width: numberParam('Width, 0..1. Default 1.'),
          height: numberParam('Height, 0..1. Default 1.'),
          d: {
            type: 'string',
            description: 'kind "path" only: SVG path data in the same 0..1 space.',
          },
          featherPx: numberParam("Soft edge width in the layer's own pixels."),
          invert: { type: 'boolean' },
        },
        required: ['kind'],
        description: 'The mask, or null to clear it.',
      },
    },
    required: ['timeline_id', 'target', 'mask'],
  },
  execute: async ({ timeline_id, target, mask }) => ({
    ok: true,
    clip: handlerFor(timeline_id).setMask(target, mask ?? null),
  }),
});

MobileToolRegistry.register<{
  timeline_id: string;
  target: string;
  matte: TimelineMatteInput | null;
}>({
  name: 'ui_timeline_set_matte',
  description:
    "Drive a clip's transparency from another clip — a track matte — or clear it with `matte: null`. The source clip stops drawing itself: its alpha (`mode: \"alpha\"`) or its brightness (`mode: \"luma\"`) becomes the target's transparency, so a white shape over black shows the target only where the shape is. " +
    SAVE_NOTE,
  parameters: {
    type: 'object',
    properties: {
      timeline_id: timelineIdParam,
      target: targetParam,
      matte: {
        type: 'object',
        properties: {
          source: {
            type: 'string',
            description: 'The clip whose pixels drive the alpha, by id or name.',
          },
          mode: {
            type: 'string',
            enum: ['alpha', 'luma'],
            description: "alpha reads the source's transparency; luma its brightness.",
          },
          invert: { type: 'boolean' },
        },
        required: ['source', 'mode'],
        description: 'The matte, or null to clear it.',
      },
    },
    required: ['timeline_id', 'target', 'matte'],
  },
  execute: async ({ timeline_id, target, matte }) => ({
    ok: true,
    clip: handlerFor(timeline_id).setMatte(target, matte ?? null),
  }),
});

MobileToolRegistry.register<{
  timeline_id: string;
  target: string;
  effects: TimelineEffectInput[];
}>({
  name: 'ui_timeline_set_effects',
  description:
    "Replace a clip's effect chain, or clear it with `effects: []`. The list runs in order on the clip's own pixels, before it is placed on the frame. Types: color (brightness/contrast/saturation/hue/temperature/tint/shadows/highlights), blur, glow, dropShadow, vignette, sharpen, chromaKey, curves (control points, 0..1 on both axes), levels (in/out black and white plus gamma), liftGammaGain (a three-way grade, one number per channel). This replaces the whole chain — send every effect the clip should keep. " +
    SAVE_NOTE,
  parameters: {
    type: 'object',
    properties: {
      timeline_id: timelineIdParam,
      target: targetParam,
      effects: {
        type: 'array',
        description: 'The chain, in order. An empty list clears it.',
        items: {
          type: 'object',
          properties: { type: { type: 'string', enum: EFFECT_TYPE_ENUM } },
          required: ['type'],
        },
      },
    },
    required: ['timeline_id', 'target', 'effects'],
  },
  execute: async ({ timeline_id, target, effects }) => ({
    ok: true,
    clip: handlerFor(timeline_id).setEffects(target, effects),
  }),
});

MobileToolRegistry.register<{
  timeline_id: string;
  target: string;
  timeRemap: TimelineTimeRemapInput | null;
}>({
  name: 'ui_timeline_set_time_remap',
  description:
    "Retime a clip: `keyframes` say where in the source each instant of the clip sits. `t` is 0..1 over the clip's own window and must ascend, starting at 0 and ending at 1; `sourceMs` may descend, which is reverse playback. Clear it with `timeRemap: null` to play at the clip's own rate. A remapped clip cannot be split or trimmed until it is baked, which is desktop-only. " +
    SAVE_NOTE,
  parameters: {
    type: 'object',
    properties: {
      timeline_id: timelineIdParam,
      target: targetParam,
      timeRemap: {
        type: 'object',
        properties: {
          keyframes: {
            type: 'array',
            description: 'At least two, ascending in `t`, starting at 0 and ending at 1.',
            items: {
              type: 'object',
              properties: {
                t: numberParam("Position in the clip's window, 0..1."),
                sourceMs: numberParam(
                  'Milliseconds into the source media shown at this position.'
                ),
                easing: {
                  type: 'string',
                  description: 'Easing for the segment ending here. Default linear.',
                },
              },
              required: ['t', 'sourceMs'],
            },
          },
        },
        required: ['keyframes'],
        description: 'The curve, or null to clear it.',
      },
    },
    required: ['timeline_id', 'target', 'timeRemap'],
  },
  execute: async ({ timeline_id, target, timeRemap }) => ({
    ok: true,
    clip: handlerFor(timeline_id).setTimeRemap(target, timeRemap ?? null),
  }),
});

// ── Beats ───────────────────────────────────────────────────────────────────

const BEAT_GRID_PROPERTIES = {
  onsets_ms: {
    type: 'array',
    items: { type: 'number' },
    description:
      'Absolute beat times in ms. Exactly one of this and `bpm`. detect_audio_events reports onsets in SECONDS, so multiply by 1000.',
  },
  bpm: { type: 'number', description: 'Tempo.' },
  offset_ms: { type: 'number', description: 'Where beat one sits, in ms. Default 0.' },
} as const;

MobileToolRegistry.register<{
  timeline_id: string;
  onsets_ms?: number[];
  bpm?: number;
  offset_ms?: number;
  count?: number;
  label?: string;
}>({
  name: 'ui_timeline_set_markers_from_beats',
  description:
    'Lay a marker on every beat of a grid, so the cut has something to work against. The grid is either `onsets_ms` or `bpm` with `count` and an optional `offset_ms`. Markers already on the sequence are kept, and a beat that already carries one is skipped, so re-running the same grid changes nothing. ' +
    SAVE_NOTE,
  parameters: {
    type: 'object',
    properties: {
      timeline_id: timelineIdParam,
      ...BEAT_GRID_PROPERTIES,
      count: { type: 'number', description: 'Beats to lay down, with `bpm`.' },
      label: {
        type: 'string',
        description: 'Label stem; each marker is numbered from 1. Default "Beat".',
      },
    },
    required: ['timeline_id'],
  },
  execute: async ({ timeline_id, onsets_ms, bpm, offset_ms, count, label }) => ({
    ok: true,
    ...handlerFor(timeline_id).setMarkersFromBeats({
      onsetsMs: onsets_ms,
      bpm,
      offsetMs: offset_ms,
      count,
      label,
    }),
  }),
});

MobileToolRegistry.register<{
  timeline_id: string;
  targets?: string[] | 'all';
  onsets_ms?: number[];
  bpm?: number;
  offset_ms?: number;
  tolerance_ms?: number;
  mode?: SnapBoundaryMode;
  action?: SnapAction;
}>({
  name: 'ui_timeline_snap_to_beats',
  description:
    'Put clip boundaries on a beat grid. The grid is either `onsets_ms` or `bpm` with an optional `offset_ms`. `mode` picks the boundary, `action` picks how it gets there: `move` slides the whole clip and keeps its length, `trim` holds the opposite boundary and changes the length. A boundary further than `tolerance_ms` from every beat is left where it is and reported with the reason, so read the per-clip result rather than assuming everything moved. ' +
    SAVE_NOTE,
  parameters: {
    type: 'object',
    properties: {
      timeline_id: timelineIdParam,
      targets: {
        type: 'array',
        items: { type: 'string' },
        description: 'Clip ids or names. Omit for every clip on the sequence.',
      },
      ...BEAT_GRID_PROPERTIES,
      tolerance_ms: {
        type: 'number',
        description: 'How far a boundary may travel to reach a beat. Default 60ms.',
      },
      mode: {
        type: 'string',
        enum: ['start', 'end', 'both'],
        description: 'Which boundary lands on a beat. Default "start".',
      },
      action: {
        type: 'string',
        enum: ['move', 'trim'],
        description: '"move" slides the clip, "trim" changes its length. Default "move".',
      },
    },
    required: ['timeline_id'],
  },
  execute: async ({
    timeline_id,
    targets,
    onsets_ms,
    bpm,
    offset_ms,
    tolerance_ms,
    mode,
    action,
  }) => ({
    ok: true,
    ...handlerFor(timeline_id).snapToBeats({
      targets,
      onsetsMs: onsets_ms,
      bpm,
      offsetMs: offset_ms,
      toleranceMs: tolerance_ms,
      mode,
      action,
    }),
  }),
});

// ── Markers ─────────────────────────────────────────────────────────────────

MobileToolRegistry.register<{ timeline_id: string } & TimelineAddMarkerInput>({
  name: 'ui_timeline_add_marker',
  description:
    'Drop a marker at an absolute time on an open timeline sequence, to flag a moment for the user. ' +
    SAVE_NOTE,
  parameters: {
    type: 'object',
    properties: {
      timeline_id: timelineIdParam,
      timeMs: numberParam('Absolute position on the timeline in ms. Must be >= 0.'),
      label: { type: 'string', description: 'Short label shown on the ruler.' },
      color: { type: 'string', description: 'CSS colour for the marker dot.' },
      note: { type: 'string', description: 'Longer note attached to the marker.' },
    },
    required: ['timeline_id', 'timeMs'],
  },
  execute: async ({ timeline_id, ...input }) => ({
    ok: true,
    marker: handlerFor(timeline_id).addMarker(input),
  }),
});

MobileToolRegistry.register<{ timeline_id: string; target: string }>({
  name: 'ui_timeline_delete_marker',
  description: 'Remove a marker by id or by its label (case-insensitive). ' + SAVE_NOTE,
  parameters: {
    type: 'object',
    properties: {
      timeline_id: timelineIdParam,
      target: {
        type: 'string',
        description: 'Marker id or label (case-insensitive).',
      },
    },
    required: ['timeline_id', 'target'],
  },
  execute: async ({ timeline_id, target }) => ({
    ok: true,
    deleted: handlerFor(timeline_id).deleteMarker(target),
  }),
});

// ── Document ────────────────────────────────────────────────────────────────

MobileToolRegistry.register<{ timeline_id: string; name: string }>({
  name: 'ui_timeline_rename',
  description: 'Rename an open timeline sequence. ' + SAVE_NOTE,
  parameters: {
    type: 'object',
    properties: {
      timeline_id: timelineIdParam,
      name: { type: 'string', description: 'New sequence name.' },
    },
    required: ['timeline_id', 'name'],
  },
  execute: async ({ timeline_id, name }) => ({
    ok: true,
    ...handlerFor(timeline_id).rename(name),
  }),
});

MobileToolRegistry.register<{ timeline_id: string }>({
  name: 'ui_timeline_save',
  description:
    'Persist the open timeline sequence — the same action as the user pressing Save. Call it once after a batch of edits. Fails if someone else saved the sequence in the meantime; tell the user to reload from the banner on screen.',
  parameters: {
    type: 'object',
    properties: { timeline_id: timelineIdParam },
    required: ['timeline_id'],
  },
  execute: async ({ timeline_id }) => handlerFor(timeline_id).save(),
});

// ── Batch ───────────────────────────────────────────────────────────────────

/** Tools `ui_timeline_edit` refuses to nest, so a batch cannot batch itself. */
const BATCH_TOOL_NAME = 'ui_timeline_edit';

interface TimelineEditOp {
  tool: string;
  input?: Record<string, unknown>;
}

interface TimelineEditOpResult {
  index: number;
  tool: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

MobileToolRegistry.register<{
  timeline_id: string;
  ops: TimelineEditOp[];
}>({
  name: BATCH_TOOL_NAME,
  description:
    'Apply several timeline edits in one call. Each op names a `ui_timeline_*` tool (with or without the prefix) and its `input`; `timeline_id` is filled in from this call, so an op need not repeat it. Ops run in order and a failure does not stop the ones after it — the reply reports `applied`, `failed`, and a per-op result carrying either the tool\'s answer or its error, so a partial batch says exactly which half landed. Use it for a planned sequence of edits; use the single tools when the next edit depends on what the last one returned. ' +
    SAVE_NOTE,
  parameters: {
    type: 'object',
    properties: {
      timeline_id: timelineIdParam,
      ops: {
        type: 'array',
        description: 'The edits, in order. At least one.',
        items: {
          type: 'object',
          properties: {
            tool: {
              type: 'string',
              description:
                'A ui_timeline_* tool name, e.g. "ui_timeline_add_text_clip" or "add_text_clip".',
            },
            input: {
              type: 'object',
              description: "The tool's arguments, minus timeline_id.",
            },
          },
          required: ['tool'],
        },
      },
    },
    required: ['timeline_id', 'ops'],
  },
  execute: async ({ timeline_id, ops }, ctx) => {
    if (!Array.isArray(ops) || ops.length === 0) {
      throw new Error('Pass at least one op.');
    }
    const results: TimelineEditOpResult[] = [];
    for (const [index, op] of ops.entries()) {
      const name = op.tool.startsWith('ui_timeline_')
        ? op.tool
        : `ui_timeline_${op.tool}`;
      try {
        if (name === BATCH_TOOL_NAME) {
          throw new Error(
            `${BATCH_TOOL_NAME} cannot nest — list the edits themselves in ops.`
          );
        }
        if (!MobileToolRegistry.has(name)) {
          throw new Error(
            `Unknown tool "${op.tool}". Ops name a ui_timeline_* tool.`
          );
        }
        const result = await MobileToolRegistry.call(
          name,
          { timeline_id, ...(op.input ?? {}) },
          `${BATCH_TOOL_NAME}:${index}`
        );
        results.push({ index, tool: name, ok: true, result });
      } catch (error) {
        // A failed op is reported and the batch continues: stopping would hide
        // every edit after it behind one bad target.
        results.push({
          index,
          tool: name,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      if (ctx.abortSignal.aborted) {
        break;
      }
    }
    return {
      ok: true,
      applied: results.filter((entry) => entry.ok).length,
      failed: results.filter((entry) => !entry.ok).length,
      results,
    };
  },
});
