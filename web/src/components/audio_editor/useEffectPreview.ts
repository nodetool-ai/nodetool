import { useCallback, useEffect, useRef, useState } from "react";

import { sampleToAudioBuffer, type AudioSample } from "./audioSample";

interface EffectPreview {
  /** True from the start of a render until playback ends or stops. */
  active: boolean;
  /** Render with `render`, then play the result. Replaces any running preview. */
  play: (render: () => Promise<AudioSample | null>) => Promise<void>;
  stop: () => void;
}

/**
 * Audition processed audio on the editor's AudioContext. Each `play` call
 * supersedes the previous one, so a slow render that finishes after a newer
 * request (or after `stop`) is discarded instead of played.
 */
export function useEffectPreview(getCtx: () => AudioContext): EffectPreview {
  const [active, setActive] = useState(false);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const requestRef = useRef(0);

  const teardown = useCallback(() => {
    const src = sourceRef.current;
    if (!src) {
      return;
    }
    src.onended = null;
    try {
      src.stop();
    } catch {
      // already stopped
    }
    src.disconnect();
    sourceRef.current = null;
  }, []);

  const stop = useCallback(() => {
    requestRef.current += 1;
    teardown();
    setActive(false);
  }, [teardown]);

  const play = useCallback(
    async (render: () => Promise<AudioSample | null>) => {
      const request = ++requestRef.current;
      teardown();
      setActive(true);
      const processed = await render();
      if (request !== requestRef.current) {
        return;
      }
      if (!processed) {
        setActive(false);
        return;
      }
      const ctx = getCtx();
      void ctx.resume();
      const src = ctx.createBufferSource();
      src.buffer = sampleToAudioBuffer(processed, ctx);
      src.connect(ctx.destination);
      src.onended = () => {
        if (sourceRef.current === src) {
          sourceRef.current = null;
          setActive(false);
        }
      };
      sourceRef.current = src;
      src.start();
    },
    [getCtx, teardown]
  );

  useEffect(
    () => () => {
      requestRef.current += 1;
      teardown();
    },
    [teardown]
  );

  return { active, play, stop };
}
