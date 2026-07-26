/**
 * `ui_timeline_*` — the agent's read access to an open timeline sequence.
 *
 * Web's timeline tools cut, arrange, generate, and render. Mobile's do none of
 * that: the phone surface is a viewer, so only the four read/navigate tools are
 * registered. The descriptions say so explicitly — an agent that knows editing
 * is unavailable answers questions about the sequence instead of attempting an
 * edit and reporting a failure to the user.
 *
 * Every tool names its target with `timeline_id` and resolves it through the
 * agent bridge, which throws listing the open ids when the sequence is not
 * mounted.
 */

import { getDocumentHandler } from '../agentBridge';
import { MobileToolRegistry } from './registry';
import type { TimelineAgentHandler } from '../timelineTypes';

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

const READ_ONLY_NOTE =
  'The mobile timeline is read-only: clips cannot be added, edited, trimmed, moved, generated, or deleted here. Tell the user to open the sequence on desktop for edits.';

MobileToolRegistry.register<{ timeline_id: string }>({
  name: 'ui_timeline_get_state',
  description:
    'Read an open timeline sequence: duration, playhead, selection, every track, and every clip with its timing, media type, status, and generation binding (prompt/provider/model). Call this first — the other timeline tools need the clip ids and names it returns. ' +
    READ_ONLY_NOTE,
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
    READ_ONLY_NOTE,
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
    'Select a clip on screen, opening its detail panel for the user. Omit `target` (or pass null) to clear the selection. Selecting only changes what is shown; it changes nothing in the document. ' +
    READ_ONLY_NOTE,
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
    'Move the playhead of an open timeline sequence to an absolute time in milliseconds, clamped to the sequence duration. Use it to point the user at a moment you are describing. ' +
    READ_ONLY_NOTE,
  parameters: {
    type: 'object',
    properties: {
      timeline_id: timelineIdParam,
      timeMs: {
        type: 'number',
        description:
          'Absolute position on the sequence timeline, in milliseconds from the start.',
      },
    },
    required: ['timeline_id', 'timeMs'],
  },
  execute: async ({ timeline_id, timeMs }) => ({
    ok: true,
    playheadMs: handlerFor(timeline_id).seek(timeMs),
  }),
});
