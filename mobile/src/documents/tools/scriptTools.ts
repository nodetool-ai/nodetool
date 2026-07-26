/**
 * `ui_script_*` — the tools that let the agent write an open script.
 *
 * A port of web's `builtin/script.ts` with the voicing, subtitle, and timeline
 * tools removed (see `scriptTypes.ts` for why) and zod swapped for plain JSON
 * Schema. Every tool takes an explicit `script_id` and delegates to the handler
 * the mounted ScriptEditorScreen registered; when that script is not open the
 * getter throws naming the open ids, and the tool layer hands that message to
 * the agent verbatim.
 */

import { getDocumentHandler } from '../agentBridge';
import { MobileToolRegistry } from './registry';
import type { ScriptAgentHandler } from '../scriptTypes';

const handlerFor = (scriptId: string): ScriptAgentHandler =>
  getDocumentHandler<ScriptAgentHandler>('script', scriptId);

const scriptIdProperty = {
  type: 'string',
  description:
    'Id of the script to act on. Valid ids are listed in the ui_context block of the system prompt; there is no "current script" fallback.',
} as const;

const lineTargetProperty = {
  type: 'string',
  description:
    'Which line: its id, its 0-based index across the whole script written as a string, or the literal "selected" for the line the user has selected on screen.',
} as const;

const speakerTargetProperty = {
  type: 'string',
  description:
    'Which cast member: its speaker id, or its 0-based index in the cast written as a string.',
} as const;

const sectionTargetProperty = {
  type: 'string',
  description:
    'Which section: its section id, or its 0-based index written as a string.',
} as const;

interface ScriptIdArgs {
  script_id: string;
}

/** Every targeted tool: a script id plus one line, speaker, or section address. */
interface TargetArgs extends ScriptIdArgs {
  target: string;
}

MobileToolRegistry.register<ScriptIdArgs>({
  name: 'ui_script_get_state',
  description:
    'Read a script: its title, the cast (each speaker id, name, chip color, and whether a TTS voice is bound), the sections in order with the line ids each holds, and every line in document order with its id, document index, section, speaker, text, direction, pause, voicing status (draft / voiced / stale) and take count. Call this first — every other tool addresses lines, speakers, and sections by the ids and indexes it returns. Note what this surface cannot do: voicing lines with TTS, exporting subtitles, and assembling the script into a timeline are desktop-only, so do not offer them here.',
  parameters: {
    type: 'object',
    properties: { script_id: scriptIdProperty },
    required: ['script_id'],
  },
  async execute({ script_id }) {
    return { ok: true, ...handlerFor(script_id).getSnapshot() };
  },
});

interface AddSpeakerArgs extends ScriptIdArgs {
  name: string;
  color?: string;
}

MobileToolRegistry.register<AddSpeakerArgs>({
  name: 'ui_script_add_speaker',
  description:
    'Add a cast member. `name` is how the speaker is labelled in the script; `color` is an optional hex chip color that tells their lines apart at a glance. Returns the new speaker with the id you then pass to ui_script_add_line or ui_script_set_line_speaker. Binding a TTS voice to a speaker happens on the desktop app.',
  parameters: {
    type: 'object',
    properties: {
      script_id: scriptIdProperty,
      name: {
        type: 'string',
        description: 'Speaker name, e.g. "Narrator" or "Ada".',
      },
      color: {
        type: 'string',
        description: 'Optional chip color as a hex string, e.g. "#6DB3F8".',
      },
    },
    required: ['script_id', 'name'],
  },
  async execute({ script_id, name, color }) {
    const speaker = handlerFor(script_id).addSpeaker(name, color);
    return { ok: true, speaker };
  },
});

interface RenameSpeakerArgs extends ScriptIdArgs {
  target: string;
  name: string;
}

MobileToolRegistry.register<RenameSpeakerArgs>({
  name: 'ui_script_rename_speaker',
  description:
    'Rename a cast member. Their lines keep pointing at the same speaker id, so this changes the label everywhere at once. Returns the updated speaker.',
  parameters: {
    type: 'object',
    properties: {
      script_id: scriptIdProperty,
      target: speakerTargetProperty,
      name: { type: 'string', description: 'The new name.' },
    },
    required: ['script_id', 'target', 'name'],
  },
  async execute({ script_id, target, name }) {
    const speaker = handlerFor(script_id).renameSpeaker(target, name);
    return { ok: true, speaker };
  },
});

MobileToolRegistry.register<TargetArgs>({
  name: 'ui_script_remove_speaker',
  description:
    'Remove a cast member. Their lines stay in the script and become unassigned — nothing is deleted, so reassign them with ui_script_set_line_speaker afterwards. Returns the removed speaker.',
  parameters: {
    type: 'object',
    properties: {
      script_id: scriptIdProperty,
      target: speakerTargetProperty,
    },
    required: ['script_id', 'target'],
  },
  async execute({ script_id, target }) {
    const speaker = handlerFor(script_id).removeSpeaker(target);
    return { ok: true, speaker };
  },
});

interface AddSectionArgs extends ScriptIdArgs {
  title?: string;
  index?: number;
}

MobileToolRegistry.register<AddSectionArgs>({
  name: 'ui_script_add_section',
  description:
    'Add a section — the chapter or beat that groups lines, e.g. "Cold open" or "Act 2". Pass `index` to insert at a 0-based position instead of appending. The section starts empty; add lines to it with ui_script_add_line and its returned id. Returns the new section.',
  parameters: {
    type: 'object',
    properties: {
      script_id: scriptIdProperty,
      title: {
        type: 'string',
        description: 'Section title. Left untitled when omitted.',
      },
      index: {
        type: 'number',
        description: '0-based position to insert at. Appended when omitted.',
      },
    },
    required: ['script_id'],
  },
  async execute({ script_id, title, index }) {
    const section = handlerFor(script_id).addSection(title, index);
    return { ok: true, section };
  },
});

interface SetSectionTitleArgs extends ScriptIdArgs {
  target: string;
  title: string;
}

MobileToolRegistry.register<SetSectionTitleArgs>({
  name: 'ui_script_set_section_title',
  description:
    "Replace a section's title. Its lines are untouched. Returns the updated section.",
  parameters: {
    type: 'object',
    properties: {
      script_id: scriptIdProperty,
      target: sectionTargetProperty,
      title: { type: 'string', description: 'The new title.' },
    },
    required: ['script_id', 'target', 'title'],
  },
  async execute({ script_id, target, title }) {
    const section = handlerFor(script_id).setSectionTitle(target, title);
    return { ok: true, section };
  },
});

MobileToolRegistry.register<TargetArgs>({
  name: 'ui_script_remove_section',
  description:
    'Delete a section **and every line inside it**, including any recorded takes on those lines. Move lines out first if you mean to keep them. Line indexes shift, so re-read with ui_script_get_state before addressing lines by index again. Returns the removed section with the line ids it held.',
  parameters: {
    type: 'object',
    properties: {
      script_id: scriptIdProperty,
      target: sectionTargetProperty,
    },
    required: ['script_id', 'target'],
  },
  async execute({ script_id, target }) {
    const section = handlerFor(script_id).removeSection(target);
    return { ok: true, section };
  },
});

interface AddLineArgs extends ScriptIdArgs {
  text: string;
  speakerId?: string;
  direction?: string;
  sectionId?: string;
  index?: number;
}

MobileToolRegistry.register<AddLineArgs>({
  name: 'ui_script_add_line',
  description:
    'Add a spoken line. `text` is what is said, written to be read aloud. Optionally set `speakerId` (from the cast — pass one that exists, an unknown id is rejected), `direction` (a free-form performance note like "whispering, tired"), `sectionId` to choose the section (the last section otherwise; one is created if the script has none), and `index` to insert at a 0-based position within that section instead of appending. The line starts as a draft; voicing it happens on the desktop app.',
  parameters: {
    type: 'object',
    properties: {
      script_id: scriptIdProperty,
      text: { type: 'string', description: 'The spoken text of the line.' },
      speakerId: {
        type: 'string',
        description: 'Id of the cast member who says it, from ui_script_get_state.',
      },
      direction: {
        type: 'string',
        description: 'Performance note, e.g. "whispering, tired".',
      },
      sectionId: {
        type: 'string',
        description: 'Section to add into. The last section when omitted.',
      },
      index: {
        type: 'number',
        description:
          '0-based position within the section. Appended when omitted.',
      },
    },
    required: ['script_id', 'text'],
  },
  async execute({ script_id, text, speakerId, direction, sectionId, index }) {
    const line = handlerFor(script_id).addLine({
      text,
      speakerId,
      direction,
      sectionId,
      index,
    });
    return { ok: true, line };
  },
});

interface SetLineTextArgs extends TargetArgs {
  text: string;
}

MobileToolRegistry.register<SetLineTextArgs>({
  name: 'ui_script_set_line_text',
  description:
    "Replace a line's spoken text. Any takes already recorded on the line are kept, but a voiced line becomes stale because its audio no longer matches the words — re-voicing it is a desktop job. Returns the updated line with its new status.",
  parameters: {
    type: 'object',
    properties: {
      script_id: scriptIdProperty,
      target: lineTargetProperty,
      text: { type: 'string', description: 'The new spoken text.' },
    },
    required: ['script_id', 'target', 'text'],
  },
  async execute({ script_id, target, text }) {
    const line = handlerFor(script_id).setLineText(target, text);
    return { ok: true, line };
  },
});

interface SetLineSpeakerArgs extends TargetArgs {
  speakerId: string | null;
}

MobileToolRegistry.register<SetLineSpeakerArgs>({
  name: 'ui_script_set_line_speaker',
  description:
    'Assign a line to a cast member, or pass null for `speakerId` to leave it unassigned. The id must be one from the cast in ui_script_get_state. Returns the updated line.',
  parameters: {
    type: 'object',
    properties: {
      script_id: scriptIdProperty,
      target: lineTargetProperty,
      speakerId: {
        type: ['string', 'null'],
        description:
          'Id of an existing cast member, or null to clear the assignment.',
      },
    },
    required: ['script_id', 'target', 'speakerId'],
  },
  async execute({ script_id, target, speakerId }) {
    const line = handlerFor(script_id).setLineSpeaker(target, speakerId);
    return { ok: true, line };
  },
});

interface PatchLineArgs extends TargetArgs {
  direction?: string;
  pauseAfterMs?: number;
}

MobileToolRegistry.register<PatchLineArgs>({
  name: 'ui_script_patch_line',
  description:
    "Edit a line's delivery without touching its words: `direction` is the performance note, `pauseAfterMs` the authored silence that follows the line in milliseconds. Omitted fields keep their current value. Use ui_script_set_line_text for the words themselves. Returns the updated line.",
  parameters: {
    type: 'object',
    properties: {
      script_id: scriptIdProperty,
      target: lineTargetProperty,
      direction: {
        type: 'string',
        description: 'Performance note, e.g. "flat, matter-of-fact".',
      },
      pauseAfterMs: {
        type: 'number',
        description: 'Silence after this line, in milliseconds.',
      },
    },
    required: ['script_id', 'target'],
  },
  async execute({ script_id, target, direction, pauseAfterMs }) {
    const line = handlerFor(script_id).patchLine(target, {
      direction,
      pauseAfterMs,
    });
    return { ok: true, line };
  },
});

MobileToolRegistry.register<TargetArgs>({
  name: 'ui_script_remove_line',
  description:
    'Delete one line, along with any takes recorded on it. The remaining lines are renumbered, so indexes you read earlier are stale after this call — re-read with ui_script_get_state before addressing lines by index again. Returns the removed line.',
  parameters: {
    type: 'object',
    properties: {
      script_id: scriptIdProperty,
      target: lineTargetProperty,
    },
    required: ['script_id', 'target'],
  },
  async execute({ script_id, target }) {
    const line = handlerFor(script_id).removeLine(target);
    return { ok: true, line };
  },
});

interface MoveLineArgs extends TargetArgs {
  to_index: number;
}

MobileToolRegistry.register<MoveLineArgs>({
  name: 'ui_script_move_line',
  description:
    'Move a line to a different position in the script. `to_index` is the 0-based document position it should end up at, counted after the line is lifted out, and it can land the line in another section. Its takes travel with it. Every line is renumbered, so re-read the script before using indexes again. Returns the moved line.',
  parameters: {
    type: 'object',
    properties: {
      script_id: scriptIdProperty,
      target: lineTargetProperty,
      to_index: {
        type: 'number',
        description:
          '0-based destination position across the whole script. Clamped to the line count.',
      },
    },
    required: ['script_id', 'target', 'to_index'],
  },
  async execute({ script_id, target, to_index }) {
    const line = handlerFor(script_id).moveLine(target, to_index);
    return { ok: true, line };
  },
});

interface SelectLineArgs extends ScriptIdArgs {
  target: string | null;
}

MobileToolRegistry.register<SelectLineArgs>({
  name: 'ui_script_select_line',
  description:
    'Select a line on screen, so the user is looking at the line you are about to discuss. Pass null to clear the selection. The selected line is what "selected" resolves to in the other tools.',
  parameters: {
    type: 'object',
    properties: {
      script_id: scriptIdProperty,
      target: {
        type: ['string', 'null'],
        description: `${lineTargetProperty.description} Pass null to clear the selection.`,
      },
    },
    required: ['script_id', 'target'],
  },
  async execute({ script_id, target }) {
    const selected = handlerFor(script_id).selectLine(target);
    return { ok: true, selected };
  },
});

MobileToolRegistry.register<ScriptIdArgs>({
  name: 'ui_script_save',
  description:
    'Persist the script to the server. Edits from the other tools are local until this runs, so call it once after a batch of changes. Fails when someone else has saved the script since it was opened — the user then has to reload it.',
  parameters: {
    type: 'object',
    properties: { script_id: scriptIdProperty },
    required: ['script_id'],
  },
  async execute({ script_id }) {
    return await handlerFor(script_id).save();
  },
});
