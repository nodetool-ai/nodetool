/**
 * useScriptPlaythrough — sequential playback of a script's current takes.
 *
 * A plain Audio-element chain (no compositor): play each voiced line's current
 * take in document order, honoring `pauseAfterMs` between lines. Unvoiced lines
 * are skipped. `currentLineId` drives the document-pane highlight.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useScriptStore } from "../../stores/script/ScriptStore";
import { useAssetStore } from "../../stores/AssetStore";
import { getAssetUrl } from "../../utils/assetHelpers";

interface Playthrough {
  playing: boolean;
  currentLineId: string | null;
  play: () => void;
  stop: () => void;
}

export const useScriptPlaythrough = (scriptId: string): Playthrough => {
  const [playing, setPlaying] = useState(false);
  const [currentLineId, setCurrentLineId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cancelledRef = useRef(false);

  const stop = useCallback(() => {
    cancelledRef.current = true;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setPlaying(false);
    setCurrentLineId(null);
  }, []);

  useEffect(() => stop, [stop, scriptId]);

  const play = useCallback(() => {
    if (typeof Audio === "undefined") return;
    const script = useScriptStore.getState().scripts[scriptId];
    if (!script) return;

    cancelledRef.current = false;
    setPlaying(true);

    const lines = script.sections
      .flatMap((s) => s.lines)
      .map((line) => ({
        line,
        take: line.takes.find((t) => t.id === line.currentTakeId)
      }))
      .filter((entry): entry is { line: typeof entry.line; take: NonNullable<typeof entry.take> } =>
        !!entry.take
      );

    const wait = (ms: number): Promise<void> =>
      new Promise((resolve) => setTimeout(resolve, ms));

    const playOne = (url: string): Promise<void> =>
      new Promise((resolve) => {
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        void audio.play().catch(() => resolve());
      });

    const run = async (): Promise<void> => {
      for (const { line, take } of lines) {
        if (cancelledRef.current) break;
        setCurrentLineId(line.id);
        let url: string | null = null;
        try {
          const asset = await useAssetStore.getState().get(take.assetId);
          url = getAssetUrl(asset);
        } catch {
          url = null;
        }
        if (cancelledRef.current) break;
        if (url) await playOne(url);
        if (cancelledRef.current) break;
        if (line.pauseAfterMs && line.pauseAfterMs > 0)
          await wait(line.pauseAfterMs);
      }
      if (!cancelledRef.current) {
        setPlaying(false);
        setCurrentLineId(null);
      }
    };

    void run();
  }, [scriptId]);

  return { playing, currentLineId, play, stop };
};

export default useScriptPlaythrough;
