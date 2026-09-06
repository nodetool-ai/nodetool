/**
 * useVoiceSamples
 *
 * The voices step lets a creator hear a candidate voice read their speaker's
 * first line (PRD § 9.3). Each sample is a real TTS call, so it is made once,
 * when the tile is asked to play, and kept for the rest of the session: a grid
 * of a dozen voices over four speakers would otherwise bill a dozen calls on
 * every render, and re-renders are free while speech is not.
 *
 * The cache is module-level rather than component state because the flow's
 * steps mount and unmount as the creator moves between them, and a sample paid
 * for on the way in must still be there on the way back. Entries are keyed by
 * the exact call — provider, model, voice, speed, and the words as they are
 * sent — so changing the line makes a new sample and re-picking the same tile
 * does not.
 *
 * The words are normalized once, by `sampleText`, and both the write and the
 * read go through it. They did not: the call keyed the trimmed, truncated text
 * while the lookup keyed the raw line, so a line longer than the cap or padded
 * with whitespace paid for a sample it could never find again (F13).
 */

import { useCallback, useMemo, useSyncExternalStore } from "react";

import { rpcRequest } from "../../lib/websocket/rpcRequest";
import { isString } from "../../utils/typePredicates";

/** The provider/model/voice a sample is spoken by. */
export interface SampleVoice {
  provider: string;
  model: string;
  voice: string;
}

export interface VoiceSample {
  /** The generated audio, as a stored locator. Absent until the call lands. */
  assetId?: string;
  pending: boolean;
  error?: string;
}

const NOT_REQUESTED: VoiceSample = { pending: false };

const samples = new Map<string, VoiceSample>();
const listeners = new Set<() => void>();
/** Bumped on every change; the snapshot React compares, since the map is one object. */
let revision = 0;

const announce = (): void => {
  revision += 1;
  for (const listener of listeners) {
    listener();
  }
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** How many characters of the line a sample speaks. */
export const SAMPLE_CHARS = 220;

/**
 * The words a sample actually says — the one form both the cache and the call
 * use. Trimmed again after the cut, so the function is idempotent: slicing a
 * long line lands mid-space as often as not, and normalizing an already
 * normalized line has to give the same string back or the write and the read
 * key different entries (F13).
 */
export const sampleText = (text: string): string =>
  text.trim().slice(0, SAMPLE_CHARS).trim();

/** One entry per distinct call, so the same tile and line never bills twice. */
export const sampleKey = (
  voice: SampleVoice,
  text: string,
  speed?: number
): string =>
  `${voice.provider}|${voice.model}|${voice.voice}|${speed ?? 1}|${sampleText(text)}`;

const firstAssetId = (result: Record<string, unknown>): string | undefined => {
  const ids = Array.isArray(result["asset_ids"]) ? result["asset_ids"] : [];
  return ids.find((id): id is string => isString(id) && id !== "");
};

export interface VoiceSamplesResult {
  /** The sample for one tile: `pending` while its call is in flight. */
  sampleFor: (voice: SampleVoice, text: string) => VoiceSample;
  /**
   * Ask for a tile's sample. A call already made — or already in flight — is
   * reused, so a creator clicking twice pays once.
   */
  play: (voice: SampleVoice, text: string) => void;
  /** The words the samples say, for what the step tells the creator they cost. */
  spokenText: (text: string) => string;
}

export function useVoiceSamples(speed?: number): VoiceSamplesResult {
  const version = useSyncExternalStore(
    subscribe,
    () => revision,
    () => revision
  );

  // A new identity per revision is what re-renders a memoized tile once its
  // sample lands; the lookup itself reads the live cache.
  const sampleFor = useMemo(
    () =>
      (voice: SampleVoice, text: string): VoiceSample =>
        samples.get(sampleKey(voice, text, speed)) ?? NOT_REQUESTED,
    [speed, version]
  );

  const play = useCallback(
    (voice: SampleVoice, text: string): void => {
      const spoken = sampleText(text);
      if (spoken === "" || voice.model === "" || voice.voice === "") {
        return;
      }
      const key = sampleKey(voice, text, speed);
      const held = samples.get(key);
      if (held && (held.pending || held.assetId !== undefined)) {
        return;
      }
      samples.set(key, { pending: true });
      announce();
      void rpcRequest("generate_media", {
        mode: "audio",
        provider: voice.provider,
        model: voice.model,
        voice: voice.voice,
        speed,
        prompt: spoken
      })
        .then((result) => {
          const assetId = firstAssetId(result);
          samples.set(
            key,
            assetId === undefined
              ? { pending: false, error: "That voice returned no audio." }
              : { pending: false, assetId }
          );
        })
        .catch((cause: unknown) => {
          samples.set(key, {
            pending: false,
            error: cause instanceof Error ? cause.message : String(cause)
          });
        })
        .finally(announce);
    },
    [speed]
  );

  return { sampleFor, play, spokenText: sampleText };
}

/** Drop every cached sample. Test-only; the cache lives as long as the tab. */
export const resetVoiceSamples = (): void => {
  samples.clear();
  announce();
};

export default useVoiceSamples;
