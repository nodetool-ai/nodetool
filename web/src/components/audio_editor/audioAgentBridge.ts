import { createAgentHandlerRegistry } from "../../lib/tools/agentHandlerRegistry";
/**
 * audioAgentBridge
 *
 * Bridge between the `ui_audio_*` frontend tools and the audio sample editors
 * open in the workspace. Each one registers an {@link AudioAgentHandler} under
 * its asset id and clears it on unmount, so the tools address an audio asset
 * by id whether or not its tab has focus.
 *
 * Every edit is one undo step in the editor's history and stays unsaved until
 * the user saves or the agent calls `ui_audio_save`.
 */

export {
  AUDIO_EDIT_OPS,
  type AudioEditOp
} from "@nodetool-ai/protocol/api-schemas/asset-editor-tool-contracts.js";
import type {
  AudioEditOp,
  AudioToolRange
} from "@nodetool-ai/protocol/api-schemas/asset-editor-tool-contracts.js";

/** A region of the audio, in seconds. */
export type AudioRange = AudioToolRange;

/** What the agent reads from an open audio editor before it edits. */
export interface AudioSnapshot {
  assetId: string;
  name: string;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  /** The draft differs from the saved asset. */
  dirty: boolean;
  /** The region the user has selected on the waveform, if any. */
  selection: AudioRange | null;
  /**
   * Peak level (0–1, across channels) of consecutive windows of
   * `peakWindowSeconds`, so the agent can find silence and loud passages.
   */
  peaks: number[];
  peakWindowSeconds: number;
}

/** Operations an open audio editor exposes to the agent. */
export interface AudioAgentHandler {
  getSnapshot: () => AudioSnapshot;
  /**
   * Apply one toolbar edit. `range` omitted means the whole sample; `gainDb`
   * is required for `gain`.
   */
  edit: (op: AudioEditOp, range?: AudioRange, gainDb?: number) => AudioSnapshot;
  applyEffect: (
    effectId: string,
    params: Record<string, number>,
    range?: AudioRange
  ) => Promise<AudioSnapshot>;
  /** Write the draft back to the asset as WAV. */
  save: () => Promise<AudioSnapshot>;
}

const handlers = createAgentHandlerRegistry<AudioAgentHandler>();

export function setAudioAgentHandler(
  assetId: string,
  next: AudioAgentHandler | null
): void {
  handlers.set(assetId, next);
}

export function hasAudioAgentHandler(assetId: string): boolean {
  return handlers.has(assetId);
}

export function listOpenAudioIds(): string[] {
  return [...handlers.keys()];
}

export function getAudioAgentHandler(assetId: string): AudioAgentHandler {
  const handler = handlers.get(assetId);
  if (!handler) {
    const open = listOpenAudioIds();
    throw new Error(
      `No audio "${assetId}" is open for editing. ` +
        (open.length > 0
          ? `Open audio assets: ${open.join(", ")}. `
          : "No audio assets are open for editing. ") +
        'Call ui_open_document with type "audio" to open it.'
    );
  }
  return handler;
}

export const whenAudioAgentReady = (
  id: string,
  signal: AbortSignal
): Promise<boolean> => handlers.whenReady(id, () => true, signal);
