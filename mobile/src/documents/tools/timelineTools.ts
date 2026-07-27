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

import { getDocumentHandler } from '../agentBridge';
import { MobileToolRegistry } from './registry';
import type {
  TimelineAddMarkerInput,
  TimelineAddShapeClipInput,
  TimelineAddTextClipInput,
  TimelineAgentHandler,
  TimelineClipParamsPatch,
  TimelineMovePatch,
  TimelineTrackType,
  TimelineTrimPatch,
} from '../timelineTypes';

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
