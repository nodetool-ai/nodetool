import { z } from "zod";
import { FrontendToolRegistry } from "../frontendTools";
import { getScriptAgentHandler } from "../../../components/script/scriptAgentBridge";

/**
 * Frontend tools that let the agent write and voice the live Script surface —
 * read its cast and lines, add cast members and lines, edit line text and
 * speaker, voice lines into takes, and assemble the takes into a timeline. Each
 * delegates to the handler the open ScriptSurface registers on the
 * {@link scriptAgentBridge}; when no script is open the handler getter throws
 * "No script is open." which the tool layer surfaces to the agent.
 *
 * Lines are addressed by id or 0-based document index; speakers by id. Call
 * `ui_script_get_state` first to discover the ids the other tools need.
 */

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
    "Read the open script: title, whether it has been assembled into a timeline, the cast (each speaker's id, name, and voice binding), and every line in document order with its id, index, section, speaker, text, direction, voicing status (draft/voiced/stale), take count, and current-take duration. Call this first to discover the line/speaker ids the other tools need.",
  parameters: z.object({}),
  async execute() {
    const snapshot = getScriptAgentHandler().getSnapshot();
    return { ok: true, ...snapshot };
  }
});

FrontendToolRegistry.register({
  name: "ui_script_add_speaker",
  description:
    "Add a cast member (speaker). `name` is required; optionally bind a `voice` (provider/model/voice) the speaker is voiced with. Lines assigned to this speaker inherit its voice. Returns the created speaker with its id.",
  parameters: z.object({
    name: z.string(),
    voice: voiceParam.optional()
  }),
  async execute({ name, voice }) {
    const speaker = getScriptAgentHandler().addSpeaker(name, voice);
    return { ok: true, speaker };
  }
});

FrontendToolRegistry.register({
  name: "ui_script_set_speaker_voice",
  description:
    "Set (or replace) the TTS voice bound to a cast member, given its `speakerId` and a `voice` (provider/model/voice). Lines that use this speaker's voice become stale until re-voiced.",
  parameters: z.object({
    speakerId: z.string(),
    voice: voiceParam
  }),
  async execute({ speakerId, voice }) {
    const speaker = getScriptAgentHandler().setSpeakerVoice(speakerId, voice);
    return { ok: true, speaker };
  }
});

FrontendToolRegistry.register({
  name: "ui_script_add_line",
  description:
    "Add a line to the script. `text` is the spoken content (required). Optionally assign a `speakerId` (the line inherits that speaker's voice), a `direction` (a free-form performance note like 'whispering, tired'), and an `index` to insert at (0-based across the document; appended when omitted). The line starts unvoiced.",
  parameters: z.object({
    text: z.string(),
    speakerId: z.string().optional(),
    direction: z.string().optional(),
    index: z.number().optional()
  }),
  async execute({ text, speakerId, direction, index }) {
    const line = getScriptAgentHandler().addLine({
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
  parameters: z.object({ target: lineTargetParam, text: z.string() }),
  async execute({ target, text }) {
    const line = getScriptAgentHandler().setLineText(target, text);
    return { ok: true, line };
  }
});

FrontendToolRegistry.register({
  name: "ui_script_set_speaker",
  description:
    "Assign (or clear, with null) the speaker of a line. The line then inherits that speaker's voice. Pass null to unassign the speaker.",
  parameters: z.object({
    target: lineTargetParam,
    speakerId: z.string().nullable()
  }),
  async execute({ target, speakerId }) {
    const line = getScriptAgentHandler().setLineSpeaker(target, speakerId);
    return { ok: true, line };
  }
});

FrontendToolRegistry.register({
  name: "ui_script_voice_line",
  description:
    "Voice a single line into a new take (TTS with the line's effective voice), setting it as the current take. The line must have text and an effective voice (its own override or its speaker's). Returns the updated line; the take's word timings arrive best-effort.",
  parameters: z.object({ target: lineTargetParam }),
  async execute({ target }) {
    const line = await getScriptAgentHandler().voiceLine(target);
    return { ok: true, line };
  }
});

FrontendToolRegistry.register({
  name: "ui_script_voice_all",
  description:
    "Voice every draft or stale line in the script (bounded concurrency), respecting each line's effective voice. Lines already up to date, or with no text or no voice, are skipped. Returns the number of lines voiced.",
  parameters: z.object({}),
  async execute() {
    const result = await getScriptAgentHandler().voiceAll();
    return { ok: true, ...result };
  }
});

FrontendToolRegistry.register({
  name: "ui_script_export_subtitles",
  description:
    "Export the script's current takes as SRT or WebVTT subtitles, straight from the take word timings — one cue per line (default) or per word, laid out end to end with the authored pauses. Unvoiced lines are skipped; voice at least one line first. Returns the subtitle file text and cue count.",
  parameters: z.object({
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
  async execute({ format, granularity }) {
    const result = getScriptAgentHandler().exportSubtitles({
      format,
      granularity
    });
    return { ok: true, ...result };
  }
});

FrontendToolRegistry.register({
  name: "ui_script_send_to_timeline",
  description:
    "Assemble the script's current takes into a persisted timeline sequence and open it in the timeline editor — one voiceover clip per voiced line, laid end to end with the authored pauses. Lines without a current take are skipped (returned in skippedLineIds). If the script is already linked to a timeline, its voiceover track is rewritten in place (reassembled). Voice at least one line first.",
  parameters: z.object({}),
  async execute() {
    const result = await getScriptAgentHandler().sendToTimeline();
    return { ok: true, ...result };
  }
});
