import { z } from "zod";
import { FrontendToolRegistry } from "../frontendTools";
import { getScriptAgentHandler } from "../../../components/script/scriptAgentBridge";

/**
 * Frontend tools that let the agent write and voice the live Script surface —
 * read its cast and lines, add cast members and lines, edit line text and
 * speaker, voice lines into takes, and assemble the takes into a timeline. Every
 * tool takes an explicit `script_id` and delegates to the handler that script's
 * open ScriptSurface registers on the {@link scriptAgentBridge}; when that
 * script is not open the handler getter throws, naming the requested id and
 * listing the open ones, which the tool layer surfaces to the agent.
 *
 * Lines are addressed by id or 0-based document index; speakers by id. Call
 * `ui_script_get_state` first to discover the ids the other tools need.
 */

const scriptIdParam = z
  .string()
  .describe(
    "Id of the script to act on. The open script ids are listed in the ui_context system prompt block."
  );

const lineTargetParam = z
  .string()
  .describe(
    "Line id or its 0-based index across the whole script (as a string)."
  );

const voiceParam = z
  .object({
    provider: z
      .string()
      .describe("TTS provider id, e.g. 'elevenlabs', 'openai'."),
    model: z.string().describe("TTS model id for the provider."),
    voice: z.string().describe("Voice id/name within the provider/model."),
    settings: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Provider-specific synthesis knobs (stability, speed, …).")
  })
  .describe("A provider/model/voice selection the cast member speaks with.");

FrontendToolRegistry.register({
  name: "ui_script_get_state",
  description:
    "Read the specified script: title, whether it has been assembled into a timeline, the cast (each speaker's id, name, and voice binding), and every line in document order with its id, index, section, speaker, text, direction, voicing status (draft/voiced/stale), take count, and current-take duration. Call this first to discover the line/speaker ids the other tools need.",
  parameters: z.object({ script_id: scriptIdParam }),
  async execute({ script_id }) {
    const snapshot = getScriptAgentHandler(script_id).getSnapshot();
    return { ok: true, ...snapshot };
  }
});

FrontendToolRegistry.register({
  name: "ui_script_add_speaker",
  description:
    "Add a cast member (speaker). `name` is required; optionally bind a `voice` (provider/model/voice) the speaker is voiced with. Lines assigned to this speaker inherit its voice. Returns the created speaker with its id.",
  parameters: z.object({
    script_id: scriptIdParam,
    name: z.string(),
    voice: voiceParam.optional()
  }),
  async execute({ script_id, name, voice }) {
    const speaker = getScriptAgentHandler(script_id).addSpeaker(name, voice);
    return { ok: true, speaker };
  }
});

FrontendToolRegistry.register({
  name: "ui_script_set_speaker_voice",
  description:
    "Set (or replace) the TTS voice bound to a cast member, given its `speakerId` and a `voice` (provider/model/voice). Lines that use this speaker's voice become stale until re-voiced.",
  parameters: z.object({
    script_id: scriptIdParam,
    speakerId: z.string(),
    voice: voiceParam
  }),
  async execute({ script_id, speakerId, voice }) {
    const speaker = getScriptAgentHandler(script_id).setSpeakerVoice(
      speakerId,
      voice
    );
    return { ok: true, speaker };
  }
});

FrontendToolRegistry.register({
  name: "ui_script_add_line",
  description:
    "Add a line to the specified script. `text` is the spoken content (required). Optionally assign a `speakerId` (the line inherits that speaker's voice), a `direction` (a free-form performance note like 'whispering, tired'), and an `index` to insert at (0-based across the document; appended when omitted). The line starts unvoiced.",
  parameters: z.object({
    script_id: scriptIdParam,
    text: z.string(),
    speakerId: z.string().optional(),
    direction: z.string().optional(),
    index: z.number().optional()
  }),
  async execute({ script_id, text, speakerId, direction, index }) {
    const line = getScriptAgentHandler(script_id).addLine({
      text,
      speakerId,
      direction,
      index
    });
    return { ok: true, line };
  }
});

FrontendToolRegistry.register({
  name: "ui_script_set_line_text",
  description:
    "Replace a line's spoken text. If the line was voiced, this makes its current take stale (re-voice it with ui_script_voice_line).",
  parameters: z.object({
    script_id: scriptIdParam,
    target: lineTargetParam,
    text: z.string()
  }),
  async execute({ script_id, target, text }) {
    const line = getScriptAgentHandler(script_id).setLineText(target, text);
    return { ok: true, line };
  }
});

FrontendToolRegistry.register({
  name: "ui_script_set_speaker",
  description:
    "Assign (or clear, with null) the speaker of a line. The line then inherits that speaker's voice. Pass null to unassign the speaker.",
  parameters: z.object({
    script_id: scriptIdParam,
    target: lineTargetParam,
    speakerId: z.string().nullable()
  }),
  async execute({ script_id, target, speakerId }) {
    const line = getScriptAgentHandler(script_id).setLineSpeaker(
      target,
      speakerId
    );
    return { ok: true, line };
  }
});

FrontendToolRegistry.register({
  name: "ui_script_voice_line",
  description:
    "Voice a single line into a new take (TTS with the line's effective voice), setting it as the current take. The line must have text and an effective voice (its own override or its speaker's). Returns the updated line; the take's word timings arrive best-effort.",
  parameters: z.object({ script_id: scriptIdParam, target: lineTargetParam }),
  async execute({ script_id, target }) {
    const line = await getScriptAgentHandler(script_id).voiceLine(target);
    return { ok: true, line };
  }
});

FrontendToolRegistry.register({
  name: "ui_script_voice_all",
  description:
    "Voice every draft or stale line in the specified script (bounded concurrency), respecting each line's effective voice. Lines already up to date, or with no text or no voice, are skipped. Returns the number of lines voiced.",
  parameters: z.object({ script_id: scriptIdParam }),
  async execute({ script_id }) {
    const result = await getScriptAgentHandler(script_id).voiceAll();
    return { ok: true, ...result };
  }
});

FrontendToolRegistry.register({
  name: "ui_script_export_subtitles",
  description:
    "Export the specified script's current takes as SRT or WebVTT subtitles, straight from the take word timings — one cue per line (default) or per word, laid out end to end with the authored pauses. Unvoiced lines are skipped; voice at least one line first. Returns the subtitle file text and cue count.",
  parameters: z.object({
    script_id: scriptIdParam,
    format: z
      .enum(["srt", "vtt"])
      .optional()
      .describe("Subtitle format: SubRip (srt, default) or WebVTT (vtt)."),
    granularity: z
      .enum(["line", "word"])
      .optional()
      .describe(
        "One cue per line (default) or per word (using take word timings)."
      )
  }),
  async execute({ script_id, format, granularity }) {
    const result = getScriptAgentHandler(script_id).exportSubtitles({
      format,
      granularity
    });
    return { ok: true, ...result };
  }
});

FrontendToolRegistry.register({
  name: "ui_script_send_to_timeline",
  description:
    "Assemble the specified script's current takes into a persisted timeline sequence and open it in the timeline editor — one voiceover clip per voiced line, laid end to end with the authored pauses. Lines without a current take are skipped (returned in skippedLineIds). If the script is already linked to a timeline, its voiceover track is rewritten in place (reassembled). Voice at least one line first.",
  parameters: z.object({ script_id: scriptIdParam }),
  async execute({ script_id }) {
    const result = await getScriptAgentHandler(script_id).sendToTimeline();
    return { ok: true, ...result };
  }
});
