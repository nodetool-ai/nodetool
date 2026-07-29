/**
 * scriptAgentBridge
 *
 * Bridge between the agent tooling layer (the `ui_script_*` frontend tools) and
 * the live Script surface, mirroring {@link storyboardAgentBridge}.
 *
 * Every open ScriptSurface registers a {@link ScriptAgentHandler} under its
 * script id and clears it on unmount, so the tools address a script explicitly
 * by id — an open script stays addressable whether or not it has focus.
 *
 * Everything crossing the bridge is a plain serializable value: the agent reads
 * {@link ScriptSnapshot} / {@link ScriptLineNode} objects and never touches
 * Zustand store handles directly. Lines and speakers are addressed by id, and
 * lines also by 0-based document index or the literal `"selected"` keyword.
 */

import type { VoiceBinding } from "../../stores/script/ScriptStore";
import type {
  SubtitleFormat,
  SubtitleGranularity
} from "@nodetool-ai/timeline";

/** A voiced take's line status, derived from the current take vs. the line. */
export type ScriptLineStatus = "draft" | "voiced" | "stale";

/** Serializable view of a single line the agent reads and edits. */
export interface ScriptLineNode {
  id: string;
  /** 0-based position of the line across the whole document (all sections). */
  index: number;
  sectionId: string;
  speakerId: string | null;
  speakerName: string | null;
  text: string;
  direction?: string;
  pauseAfterMs?: number;
  status: ScriptLineStatus;
  /** Number of takes recorded on the line. */
  takeCount: number;
  /** Duration of the current take in ms, or null when the line is unvoiced. */
  currentTakeDurationMs: number | null;
}

/** Serializable view of a cast member. */
export interface ScriptSpeakerNode {
  id: string;
  name: string;
  color?: string;
  voice: VoiceBinding | null;
}

/** Full snapshot of the open script the agent reads to plan its edits. */
export interface ScriptSnapshot {
  scriptId: string;
  title: string;
  cast: ScriptSpeakerNode[];
  lines: ScriptLineNode[];
  /** True once the script has been assembled into a timeline sequence. */
  hasTimeline: boolean;
  timelineId: string | null;
}

/** Fields the agent can supply when adding a line. */
export interface ScriptAddLineInput {
  text: string;
  /** Speaker id to assign; the line inherits that speaker's voice. */
  speakerId?: string;
  direction?: string;
  /** 0-based insertion index across the document; appended when omitted. */
  index?: number;
}

/**
 * Operations the live ScriptSurface exposes to the agent tooling layer. Lines
 * are addressed by id, 0-based document index, or the literal `"selected"`;
 * speakers by id.
 */
export interface ScriptAgentHandler {
  getSnapshot: () => ScriptSnapshot;
  addSpeaker: (name: string, voice?: VoiceBinding) => ScriptSpeakerNode;
  setSpeakerVoice: (
    speakerId: string,
    voice: VoiceBinding
  ) => ScriptSpeakerNode;
  addLine: (input: ScriptAddLineInput) => ScriptLineNode;
  setLineText: (target: string, text: string) => ScriptLineNode;
  setLineSpeaker: (target: string, speakerId: string | null) => ScriptLineNode;
  voiceLine: (target: string) => Promise<ScriptLineNode>;
  voiceAll: () => Promise<{ voiced: number }>;
  /**
   * Assemble the current takes into a persisted timeline sequence (or update the
   * one already linked) and open its tab. Throws when no line has a current
   * take to lay down.
   */
  sendToTimeline: () => Promise<{
    sequenceId: string;
    clipCount: number;
    skippedLineIds: string[];
    reassembled: boolean;
  }>;
  /**
   * Render the script's current takes as SRT or WebVTT subtitles (from the take
   * word timings) and trigger a download. Throws when no line is voiced.
   */
  exportSubtitles: (options?: {
    format?: SubtitleFormat;
    granularity?: SubtitleGranularity;
  }) => { text: string; format: SubtitleFormat; cueCount: number };
}

const handlers = new Map<string, ScriptAgentHandler>();

/**
 * Register (or clear, with null) the handler for one script id. Each open
 * ScriptSurface calls this on mount and clears it on unmount, so the
 * ui_script_* tools can address any open script by id.
 */
export function setScriptAgentHandler(
  scriptId: string,
  next: ScriptAgentHandler | null
): void {
  if (next) {
    handlers.set(scriptId, next);
  } else {
    handlers.delete(scriptId);
  }
}

export function hasScriptAgentHandler(scriptId: string): boolean {
  return handlers.has(scriptId);
}

/** Ids of every script currently open, in registration order. */
export function listOpenScriptIds(): string[] {
  return [...handlers.keys()];
}

export function getScriptAgentHandler(scriptId: string): ScriptAgentHandler {
  const handler = handlers.get(scriptId);
  if (!handler) {
    const open = listOpenScriptIds();
    throw new Error(
      `No script "${scriptId}" is open. ` +
        (open.length > 0
          ? `Open scripts: ${open.join(", ")}.`
          : "No scripts are currently open.")
    );
  }
  return handler;
}
