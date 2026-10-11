import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { gameAssetBinding, gameSnapshot3D, type GameDocument3D, type GameInspection3D, type GameInputFrame3D, type GameRenderFrame3D, type GameSnapshot3D } from "@nodetool-ai/protocol";
import { createGameSession3D, type GameSession3D, type GameSession3DOptions } from "@nodetool-ai/game-runtime";
import { browserGamepads, FixedTickClock, GameInput3D } from "@nodetool-ai/game-renderer";
import { GameAudioPlayer, gameAudioSpatialView3D } from "@nodetool-ai/game-renderer/audio";
import type { GameRenderer3D } from "@nodetool-ai/game-renderer/browser3d";
import { GameReplayHistory } from "./gameReplayHistory";
import type { ScriptFailure } from "./useGamePlaySession";
import { gameSessionOptions3D, readGameAssetBytes3D } from "./viewport3d/gameSessionAssets3D";
import { resolveMediaUri } from "../../utils/resolveMediaUri";

export const EMPTY_INPUT_3D: GameInputFrame3D = { pressed: [], justPressed: [], axes: {}, look: { x: 0, y: 0 } };

interface GamePlaySession3DOptions {
  readonly refId: string;
  readonly document: GameDocument3D;
  readonly active: boolean;
  readonly editorSceneId?: string;
}

export interface GamePlaySession3D {
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
  readonly rendererRef: RefObject<GameRenderer3D | null>;
  readonly inputRef: RefObject<GameInput3D>;
  readonly playing: boolean;
  readonly playDocument: GameDocument3D | null;
  readonly frame: GameRenderFrame3D | null;
  readonly inspection: GameInspection3D | null;
  readonly backend: string;
  readonly error: string | null;
  readonly beginPlay: () => void;
  readonly stop: () => void;
  readonly step: (input?: GameInputFrame3D) => void;
  readonly save: () => void;
  readonly load: () => Promise<void>;
  readonly replayBeforeError: (displayedFailure?: ScriptFailure) => Promise<void>;
}

export function useGamePlaySession3D({ refId, document, active, editorSceneId }: GamePlaySession3DOptions): GamePlaySession3D {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previousBindingsRef = useRef<GameDocument3D["assets"] | null>(null);
  const assetBytesRef = useRef(new Map<string, Uint8Array>());
  const rendererControllerRef = useRef(new AbortController());
  const rendererPromiseRef = useRef<Promise<GameRenderer3D> | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const rendererRef = useRef<GameRenderer3D | null>(null);
  const sessionRef = useRef<GameSession3D | null>(null);
  const sessionFailedRef = useRef(false);
  const sessionOptionsRef = useRef<GameSession3DOptions>({});
  const generationRef = useRef(0);
  const inputRef = useRef(new GameInput3D());
  const historyRef = useRef(new GameReplayHistory<GameInputFrame3D, GameSnapshot3D>());
  const audioRef = useRef<GameAudioPlayer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playDocument, setPlayDocument] = useState<GameDocument3D | null>(null);
  const [frame, setFrame] = useState<GameRenderFrame3D | null>(null);
  const [inspection, setInspection] = useState<GameInspection3D | null>(null);
  const [backend, setBackend] = useState("Initializing");
  const [error, setError] = useState<string | null>(null);
  const [renderDocument, setRenderDocument] = useState(document);
  const committedRef = useRef<GameInspection3D | null>(null);
  const lastFrameRef = useRef<GameRenderFrame3D | null>(null);
  const displayQueueRef = useRef<{ renderer: GameRenderer3D; busy: boolean; latest: { frame: GameRenderFrame3D; alpha: number } | null } | null>(null);
  const playingRef = useRef(playing);
  playingRef.current = playing && active;

  useEffect(() => {
    if (playDocument) { return; }
    const timer = window.setTimeout(() => setRenderDocument(document), 100);
    return () => window.clearTimeout(timer);
  }, [document, playDocument]);

  const sessionDocument = playDocument ?? renderDocument;
  const effectiveEditorSceneId = playDocument ? undefined : editorSceneId;
  const source = effectiveEditorSceneId ? { ...sessionDocument, entrySceneId: effectiveEditorSceneId } : sessionDocument;
  const sourceRef = useRef(source);
  sourceRef.current = source;

  const display = useCallback((current: GameRenderFrame3D, alpha: number): void => {
    const renderer = rendererRef.current;
    if (!renderer) { return; }
    audioRef.current?.updateSpatial(gameAudioSpatialView3D(current, alpha));
    if (displayQueueRef.current?.renderer !== renderer) { displayQueueRef.current = { renderer, busy: false, latest: null }; }
    const queue = displayQueueRef.current;
    queue.latest = { frame: current, alpha };
    if (queue.busy) { return; }
    queue.busy = true;
    const drain = async (): Promise<void> => {
      try {
        while (queue.latest && rendererRef.current === renderer) {
          const next = queue.latest;
          queue.latest = null;
          await renderer.render(next.frame, next.alpha);
        }
      } catch (cause) {
        if (rendererRef.current === renderer) {
          setError(cause instanceof Error ? cause.message : String(cause));
          setPlaying(false);
        }
      } finally { queue.busy = false; }
    };
    void drain();
  }, []);

  const step = useCallback((input: GameInputFrame3D = EMPTY_INPUT_3D): void => {
    const session = sessionRef.current;
    if (!session || sessionFailedRef.current) { return; }
    try {
      const previous = historyRef.current.needsCheckpoint() ? session.snapshot() : undefined;
      const result = session.step(input);
      lastFrameRef.current = result.frame;
      historyRef.current.record(input, () => {
        if (!previous) { throw new Error("Replay checkpoint is unavailable"); }
        return previous;
      });
      const state = session.inspect();
      committedRef.current = state;
      audioRef.current?.sync(session.snapshot());
      for (const event of result.events) { audioRef.current?.handle(event); }
      if (!playingRef.current || result.tick % 6 === 0) {
        setInspection(state);
        setFrame(result.frame);
      }
      if (!playingRef.current) { display(result.frame, 1); }
    } catch (cause) {
      sessionFailedRef.current = true;
      setInspection(committedRef.current);
      setFrame(lastFrameRef.current);
      setError(cause instanceof Error ? cause.message : String(cause));
      setPlaying(false);
    }
  }, [display]);

  useEffect(() => {
    rendererControllerRef.current = new AbortController();
    return () => {
      rendererControllerRef.current.abort();
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      rendererRef.current = null;
      void rendererPromiseRef.current?.then((renderer) => renderer.dispose(), () => {});
      rendererPromiseRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) { return; }
    const controller = new AbortController();
    const generation = ++generationRef.current;
    const current = sourceRef.current;
    if (previousBindingsRef.current) {
      for (const slot of new Set([...Object.keys(previousBindingsRef.current), ...Object.keys(current.assets)])) {
        if (JSON.stringify(previousBindingsRef.current[slot]) !== JSON.stringify(current.assets[slot])) {
          rendererRef.current?.invalidateAsset(slot);
        }
      }
    }
    previousBindingsRef.current = current.assets;
    const bindingKeys = new Set(Object.values(current.assets).map((binding) => JSON.stringify(binding)));
    for (const key of assetBytesRef.current.keys()) {
      if (!bindingKeys.has(key)) { assetBytesRef.current.delete(key); }
    }
    let session: GameSession3D | null = null;
    let renderer: GameRenderer3D | null = null;
    const audio = audioRef.current ?? new GameAudioPlayer({
      assets: Object.fromEntries(Object.entries(current.assets).flatMap(([slot, binding]) => binding.mediaKind === "audio" || binding.mediaKind === "font" ? [[slot,
        gameAssetBinding.parse({ ...binding, width: 1, height: 1 })]] : [])),
      tickRate: current.tickRate,
      resolveAsset: async (binding) => resolveMediaUri(binding.assetId.startsWith("package://") ? binding.assetId : `asset://${binding.assetId}`),
      status: setError
    });
    audioRef.current = audio;
    audio.updateAssets(current.assets);
    audio.updateMixer(current.audio?.mixer);
    if (!playingRef.current) { audio.pause(); }
    audio.preload();
    const readAsset = (slot: string, signal: AbortSignal): Promise<Uint8Array | null> =>
      readGameAssetBytes3D(sourceRef.current, slot, signal, assetBytesRef.current);
    const initialize = async (): Promise<void> => {
      if (!rendererRef.current) { setBackend("Initializing"); }
      setError(null);
      const options = gameSessionOptions3D(current, controller.signal, assetBytesRef.current);
      sessionOptionsRef.current = options;
      session = await createGameSession3D(current, 1, undefined, options);
      controller.signal.throwIfAborted();
      sessionRef.current = session;
      sessionFailedRef.current = false;
      committedRef.current = session.inspect();
      setInspection(committedRef.current);
      const initialFrame = session.frame();
      lastFrameRef.current = initialFrame;
      setFrame(initialFrame);
      audio.reset(session.snapshot());
      const { createGameRenderer3D } = await import("@nodetool-ai/game-renderer/browser3d");
      rendererPromiseRef.current ??= createGameRenderer3D({ canvas, signal: rendererControllerRef.current.signal,
        resolveModel: async (slot, signal) => {
          const bytes = await readAsset(slot, signal);
          return bytes ? { bytes, digest: sourceRef.current.assets[slot]?.digest } : null;
        },
        resolveFont: async (slot, signal) => {
          const bytes = await readAsset(slot, signal);
          return bytes ? { bytes, digest: sourceRef.current.assets[slot]?.digest } : null;
        },
        onDiagnostic: setError,
        onContextState: (state) => {
          if (state === "lost") { setPlaying(false); inputRef.current.release(); setBackend("WebGL2 context lost"); }
          else { setBackend("WebGL2"); }
        }
      });
      renderer = await rendererPromiseRef.current;
      controller.signal.throwIfAborted();
      rendererRef.current = renderer;
      const resize = (): void => {
        const bounds = canvas.getBoundingClientRect();
        renderer?.resize(Math.max(1, Math.round(bounds.width)), Math.max(1, Math.round(bounds.height)));
        if (lastFrameRef.current) { display(lastFrameRef.current, 1); }
      };
      if (!resizeObserverRef.current) {
        resizeObserverRef.current = new ResizeObserver(resize);
        resizeObserverRef.current.observe(canvas);
      }
      resize();
      await renderer.render(initialFrame, 1);
      setBackend("WebGL2");
      if (playingRef.current) { audio.resume(); }
    };
    void initialize().catch((cause: unknown) => {
      session?.dispose();
      if (controller.signal.aborted) { return; }
      sessionRef.current = null;
      if (!rendererRef.current) { rendererPromiseRef.current = null; }
      setBackend("Unavailable");
      setError(cause instanceof Error ? cause.message : String(cause));
      setPlaying(false);
    });
    return () => {
      controller.abort();
      if (session && sessionRef.current !== session) { session.dispose(); }
      if (generationRef.current === generation) {
        sessionRef.current?.dispose();
        sessionRef.current = null;
      }
      inputRef.current.release();

    };
  }, [sessionDocument, effectiveEditorSceneId, display]);



  useEffect(() => {
    if (!playing || !active) {
      // Paused input is dropped, not queued for the next tick (F23).
      inputRef.current.setEnabled(false);
      audioRef.current?.pause();
      if (playDocument) {
        setInspection(committedRef.current);
        setFrame(lastFrameRef.current);
        if (lastFrameRef.current) { display(lastFrameRef.current, 1); }
      }
      return;
    }
    inputRef.current.setEnabled(true);
    audioRef.current?.resume();
    const clock = new FixedTickClock(sessionDocument.tickRate);
    let request = 0;
    const animate = (now: number): void => {
      const alpha = clock.advance(now, () => {
        inputRef.current.pollGamepads(browserGamepads());
        step(inputRef.current.sample(sessionDocument));
      });
      const current = sessionRef.current;
      if (current && !sessionFailedRef.current) {
        try { display(current.frame(), alpha); } catch { setPlaying(false); }
      }
      request = requestAnimationFrame(animate);
    };
    request = requestAnimationFrame(animate);
    const release = (): void => { inputRef.current.release(); if (window.document.hidden) { setPlaying(false); } };
    window.document.addEventListener("visibilitychange", release);
    window.addEventListener("blur", release);
    return () => { cancelAnimationFrame(request); window.document.removeEventListener("visibilitychange", release); window.removeEventListener("blur", release); };
  }, [playing, active, playDocument, sessionDocument, step, display]);

  const beginPlay = (): void => {
    if (playDocument && sessionFailedRef.current) { return; }
    if (!playDocument) { historyRef.current.clear(); setPlayDocument(structuredClone(document)); }
    inputRef.current.release();
    setPlaying((value) => !value);
    canvasRef.current?.focus();
  };
  const stop = (): void => { setPlaying(false); setPlayDocument(null); historyRef.current.clear(); setError(null); };
  const save = (): void => {
    const session = sessionRef.current;
    if (!session) { return; }
    try { localStorage.setItem(`nodetool.game.save.${refId}`, JSON.stringify(session.snapshot())); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const load = async (): Promise<void> => {
    try {
      const raw = localStorage.getItem(`nodetool.game.save.${refId}`);
      if (!raw) { return; }
      const snapshot = gameSnapshot3D.parse(JSON.parse(raw));
      const generation = generationRef.current;
      const restored = await createGameSession3D(sessionDocument, 1, snapshot, sessionOptionsRef.current);
      if (generation !== generationRef.current || sessionOptionsRef.current.signal?.aborted) { restored.dispose(); return; }
      historyRef.current.clear(snapshot);
      sessionRef.current?.dispose();
      sessionRef.current = restored;
      sessionFailedRef.current = false;
      committedRef.current = restored.inspect();
      setInspection(committedRef.current);
      lastFrameRef.current = restored.frame();
      setFrame(lastFrameRef.current);
      setPlaying(false);
      setError(null);
      audioRef.current?.reset(restored.snapshot());
      display(restored.frame(), 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const replayBeforeError = async (displayedFailure?: ScriptFailure): Promise<void> => {
    if (displayedFailure && displayedFailure.tick < 1) { return; }
    try {
      const generation = generationRef.current;
      const history = historyRef.current.replay();
      const restored = await createGameSession3D(sessionDocument, 1, history.snapshot, sessionOptionsRef.current);
      if (generation !== generationRef.current || sessionOptionsRef.current.signal?.aborted) { restored.dispose(); return; }
      try { for (const input of history.inputs) { restored.step(input); } }
      catch (cause) { restored.dispose(); throw cause; }
      sessionRef.current?.dispose();
      sessionRef.current = restored;
      sessionFailedRef.current = false;
      committedRef.current = restored.inspect();
      setInspection(committedRef.current);
      lastFrameRef.current = restored.frame();
      setFrame(lastFrameRef.current);
      setPlaying(false);
      setError(null);
      audioRef.current?.reset(restored.snapshot());
      display(restored.frame(), 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  return { canvasRef, rendererRef, inputRef, playing, playDocument, frame, inspection, backend, error,
    beginPlay, stop, step, save, load, replayBeforeError };
}
