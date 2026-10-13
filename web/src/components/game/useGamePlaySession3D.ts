import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { z } from "zod";
import { gameDocument3D, gameAssetBinding, gameSnapshot3D, type GameDocument3D, type GameInspection3D, type GameInputFrame3D, type GameRenderFrame3D, type GameSnapshot3D } from "@nodetool-ai/protocol";
import { createGameSession3D, gameScriptLogsOf, type GamePlayerSaves, type GameSession3D, type GameSession3DOptions } from "@nodetool-ai/game-runtime";
import { attachGameUiPointer, browserGameUiMeasure, browserGamepads, FixedTickClock, gameAudioVoiceCount, GameInput3D, GameUiController, gameUiViewport3D } from "@nodetool-ai/game-renderer";
import { GameAudioPlayer, gameAudioSpatialView3D } from "@nodetool-ai/game-renderer/audio";
import type { GameRenderer3D } from "@nodetool-ai/game-renderer/browser3d";
import { useGameDraft } from "../../stores/game/GameDraftStore";
import { useGameScriptReload } from "./useGameScriptReload";
import { createEditorGameSaves } from "./gameEditorSaves";
import { GameReplayHistory } from "./gameReplayHistory";
import { createGameScriptLogChannel, type GameScriptLogChannel } from "./gameScriptLogChannel";
import { createGameProfiler, type GameProfiler } from "./panels/profiler/gameProfiler";
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
  readonly restart: () => void;
  readonly stop: () => void;
  readonly step: (input?: GameInputFrame3D) => void;
  readonly save: () => void;
  readonly load: () => Promise<void>;
  readonly replayBeforeError: (displayedFailure?: ScriptFailure) => Promise<void>;
  /** Each step's script log lines, for the console. */
  readonly scriptLogs?: GameScriptLogChannel;
  /** Per-tick timings and renderer, physics and audio counts, for the profiler panel. */
  readonly profiler?: GameProfiler;
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
  const effectiveDocumentRef = useRef<GameDocument3D | null>(null);
  const [readyGeneration, setReadyGeneration] = useState(0);
  const [restoring, setRestoring] = useState(false);
  const [effectivePlayDocument, setEffectivePlayDocument] = useState<GameDocument3D | null>(null);
  const behaviorStructureVersions = useGameDraft(refId, (state) => state.behaviorStructureVersions);
  const playBehaviorVersionsRef = useRef(behaviorStructureVersions);
  const savesRef = useRef<GamePlayerSaves | null>(null);
  const sessionFailedRef = useRef(false);
  const sessionOptionsRef = useRef<GameSession3DOptions>({});
  const generationRef = useRef(0);
  const inputRef = useRef(new GameInput3D());
  const historyRef = useRef(new GameReplayHistory<GameInputFrame3D, GameSnapshot3D>());
  const audioRef = useRef<GameAudioPlayer | null>(null);
  const [scriptLogs] = useState(createGameScriptLogChannel);
  const [profiler] = useState(() => createGameProfiler());
  const hudRef = useRef<GameUiController | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playDocument, setPlayDocument] = useState<GameDocument3D | null>(null);
  const blockedEntities = useMemo(() => new Set(Object.keys(behaviorStructureVersions).filter((key) =>
    behaviorStructureVersions[key] !== playBehaviorVersionsRef.current[key])), [behaviorStructureVersions, playDocument]);
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
          const hud = hudRef.current;
          hud?.update(next.frame.ui, gameUiViewport3D(next.frame));
          const stats = await renderer.render(hud ? hud.annotate(next.frame) : next.frame, next.alpha);
          profiler.recordRender(stats);
        }
      } catch (cause) {
        if (rendererRef.current === renderer) {
          setError(cause instanceof Error ? cause.message : String(cause));
          setPlaying(false);
        }
      } finally { queue.busy = false; }
    };
    void drain();
  }, [profiler]);

  const step = useCallback((input: GameInputFrame3D = EMPTY_INPUT_3D): void => {
    const session = sessionRef.current;
    if (!session || sessionFailedRef.current) { return; }
    try {
      const previous = historyRef.current.needsCheckpoint() ? session.snapshot() : undefined;
      // Finished save loads ride on the frame, so the recorded history replays them without storage.
      const saves = savesRef.current;
      const frame = saves ? saves.withLoaded(input) : input;
      const result = session.step(frame);
      saves?.handle(result.saveRequests, () => session.snapshot());
      if (result.scriptLogs) { scriptLogs.publish(result.scriptLogs); }
      lastFrameRef.current = result.frame;
      historyRef.current.record(frame, () => {
        if (!previous) { throw new Error("Replay checkpoint is unavailable"); }
        return previous;
      });
      const state = session.inspect();
      committedRef.current = state;
      audioRef.current?.sync(session.snapshot());
      for (const event of result.events) { audioRef.current?.handle(event); }
      if (profiler.recording()) {
        profiler.recordStep({ tick: result.tick, timings: result.timings, scriptStats: result.scriptStats, physics: result.physics,
          voices: audioRef.current ? gameAudioVoiceCount(audioRef.current.mixerState()) : undefined });
      }
      if (!playingRef.current || result.tick % 6 === 0) {
        setInspection(state);
        setFrame(result.frame);
      }
      if (!playingRef.current) { display(result.frame, 1); }
    } catch (cause) {
      sessionFailedRef.current = true;
      // Lines logged before the failure reach the console ahead of the error line.
      const logs = gameScriptLogsOf(cause);
      if (logs) { scriptLogs.publish(logs); }
      setInspection(committedRef.current);
      setFrame(lastFrameRef.current);
      setError(cause instanceof Error ? cause.message : String(cause));
      setPlaying(false);
    }
  }, [display, scriptLogs, profiler]);

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
    generationRef.current += 1;
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
      scenes: current.scenes,
      tickRate: current.tickRate,
      resolveAsset: async (binding) => resolveMediaUri(binding.assetId.startsWith("package://") ? binding.assetId : `asset://${binding.assetId}`),
      status: setError
    });
    audioRef.current = audio;
    audio.updateScenes(current.scenes);
    audio.updateAssets(current.assets);
    audio.updateMixer(current.audio?.mixer);
    if (!playingRef.current) { audio.pause(); }
    audio.preload();
    const readAsset = (slot: string, signal: AbortSignal): Promise<Uint8Array | null> =>
      readGameAssetBytes3D(sourceRef.current, slot, signal, assetBytesRef.current);
    const initialize = async (): Promise<void> => {
      if (!rendererRef.current) { setBackend("Initializing"); }
      setError(null);
      // Steps report timings and physics counts only while the profiler records. Neither enters snapshots or replay.
      const options: GameSession3DOptions = { ...gameSessionOptions3D(current, controller.signal, assetBytesRef.current), recordTimings: profiler.recording };
      sessionOptionsRef.current = options;
      session = await createGameSession3D(current, 1, undefined, options);
      controller.signal.throwIfAborted();
      sessionRef.current = session;
      effectiveDocumentRef.current = current;
      setReadyGeneration((value) => value + 1);
      setEffectivePlayDocument(current);
      savesRef.current = createEditorGameSaves(current.id, setError);
      sessionFailedRef.current = false;
      committedRef.current = session.inspect();
      setInspection(committedRef.current);
      const initialFrame = session.frame();
      lastFrameRef.current = initialFrame;
      setFrame(initialFrame);
      audio.reset(session.snapshot());
      const { createGameRenderer3D, createGameEditorPasses3D } = await import("@nodetool-ai/game-renderer/browser3d");
      rendererPromiseRef.current ??= createGameRenderer3D({ canvas, signal: rendererControllerRef.current.signal,
        editorPasses: createGameEditorPasses3D,
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
      generationRef.current += 1;
      sessionRef.current?.dispose();
      sessionRef.current = null;
      inputRef.current.release();

    };
  }, [sessionDocument, effectiveEditorSceneId, display, profiler]);



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
    // HUD buttons press their input actions through the same input while the game plays. A locked pointer has
    // no position, so HUD hits wait until the mouse is released.
    const canvas = canvasRef.current;
    const hud = new GameUiController(inputRef.current, browserGameUiMeasure(sessionDocument.id));
    hudRef.current = hud;
    const detachHud = canvas ? attachGameUiPointer(canvas, hud, () => gameUiViewport3D(sessionDocument),
      () => window.document.pointerLockElement !== canvas) : undefined;
    const clock = new FixedTickClock(sessionDocument.tickRate);
    let request = 0;
    const animate = (now: number): void => {
      const alpha = clock.advance(now, () => {
        inputRef.current.pollGamepads(hud.pollGamepads(browserGamepads()));
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
    return () => {
      cancelAnimationFrame(request);
      window.document.removeEventListener("visibilitychange", release);
      window.removeEventListener("blur", release);
      detachHud?.();
      hud.release();
      if (hudRef.current === hud) { hudRef.current = null; }
    };
  }, [playing, active, playDocument, sessionDocument, step, display]);

  const cancelReload = useGameScriptReload({ draft: document, playDocument: restoring ? null : playDocument, sessionRef, effectiveDocumentRef, readyGeneration, scriptLogs, blockedEntities, lastCommittedTick: committedRef.current?.tick ?? 0,
    checkpoint: (session) => { historyRef.current.clear(session.snapshot()); setEffectivePlayDocument(effectiveDocumentRef.current); } });

  const restart = (): void => {
    cancelReload();
    setRestoring(false);
    historyRef.current.clear();
    profiler.clearLive();
    setError(null);
    setEffectivePlayDocument(null);
    playBehaviorVersionsRef.current = behaviorStructureVersions;
    setPlayDocument(structuredClone(document));
    setPlaying(true);
    inputRef.current.release();
    canvasRef.current?.focus();
  };

  const beginPlay = (): void => {
    if (playDocument && sessionFailedRef.current) { return; }
    if (!playDocument) { historyRef.current.clear(); profiler.clearLive(); setEffectivePlayDocument(null);
    playBehaviorVersionsRef.current = behaviorStructureVersions;
    setPlayDocument(structuredClone(document)); }
    inputRef.current.release();
    setPlaying((value) => !value);
    canvasRef.current?.focus();
  };
  const stop = (): void => { cancelReload(); setRestoring(false); setPlaying(false); setPlayDocument(null); historyRef.current.clear(); setError(null); };
  const save = (): void => {
    const session = sessionRef.current;
    if (!session) { return; }
    try { localStorage.setItem(`nodetool.game.save.${refId}`, JSON.stringify({ document: effectiveDocumentRef.current ?? sessionDocument, snapshot: session.snapshot() })); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const load = async (): Promise<void> => {
    let restoreGeneration: number | null = null;
    try {
      const raw = localStorage.getItem(`nodetool.game.save.${refId}`);
      if (!raw) { return; }
      const stored = z.object({ document: gameDocument3D, snapshot: gameSnapshot3D }).safeParse(JSON.parse(raw));
      const snapshot = stored.success ? stored.data.snapshot : gameSnapshot3D.parse(JSON.parse(raw));
      const generation = ++generationRef.current;
      restoreGeneration = generation;
      cancelReload();
      setRestoring(true);
      const previousDocument = effectiveDocumentRef.current;
      const effectiveDocument = stored.success ? stored.data.document : previousDocument ?? sessionDocument;
      if (effectiveDocument.id !== sessionDocument.id) { throw new Error("Saved game belongs to a different document"); }
      const restored = await createGameSession3D(effectiveDocument, 1, snapshot, sessionOptionsRef.current);
      if (generation !== generationRef.current || effectiveDocumentRef.current !== previousDocument || sessionOptionsRef.current.signal?.aborted) { restored.dispose(); if (generationRef.current === generation) { setRestoring(false); } return; }
      historyRef.current.clear(snapshot);
      sessionRef.current?.dispose();
      sessionRef.current = restored;
      effectiveDocumentRef.current = effectiveDocument;
      setEffectivePlayDocument(effectiveDocument);
      setRestoring(false);
      setReadyGeneration((value) => value + 1);
      savesRef.current?.clear();
      sessionFailedRef.current = false;
      committedRef.current = restored.inspect();
      setInspection(committedRef.current);
      lastFrameRef.current = restored.frame();
      setFrame(lastFrameRef.current);
      setPlaying(false);
      setError(null);
      audioRef.current?.reset(restored.snapshot());
      display(restored.frame(), 1);
    } catch (cause) {
      if (restoreGeneration !== null && generationRef.current !== restoreGeneration) { return; }
      if (restoreGeneration !== null) { setRestoring(false); }
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  const replayBeforeError = async (displayedFailure?: ScriptFailure): Promise<void> => {
    let restoreGeneration: number | null = null;
    if (displayedFailure && displayedFailure.tick < 1) { return; }
    try {
      const generation = ++generationRef.current;
      restoreGeneration = generation;
      cancelReload();
      setRestoring(true);
      const effectiveDocument = effectiveDocumentRef.current ?? sessionDocument;
      const history = historyRef.current.replay();
      const restored = await createGameSession3D(effectiveDocument, 1, history.snapshot, sessionOptionsRef.current);
      if (generation !== generationRef.current || effectiveDocumentRef.current !== effectiveDocument || sessionOptionsRef.current.signal?.aborted) { restored.dispose(); if (generationRef.current === generation) { setRestoring(false); } return; }
      try { for (const input of history.inputs) { restored.step(input); } }
      catch (cause) { restored.dispose(); throw cause; }
      sessionRef.current?.dispose();
      sessionRef.current = restored;
      effectiveDocumentRef.current = effectiveDocument;
      setEffectivePlayDocument(effectiveDocument);
      setRestoring(false);
      setReadyGeneration((value) => value + 1);
      savesRef.current?.clear();
      sessionFailedRef.current = false;
      committedRef.current = restored.inspect();
      setInspection(committedRef.current);
      lastFrameRef.current = restored.frame();
      setFrame(lastFrameRef.current);
      setPlaying(false);
      setError(null);
      audioRef.current?.reset(restored.snapshot());
      display(restored.frame(), 1);
    } catch (cause) {
      if (restoreGeneration !== null && generationRef.current !== restoreGeneration) { return; }
      if (restoreGeneration !== null) { setRestoring(false); }
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  return { canvasRef, rendererRef, inputRef, playing, playDocument: playDocument ? effectivePlayDocument ?? playDocument : null, frame, inspection, backend, error,
    beginPlay, restart, stop, step, save, load, replayBeforeError, scriptLogs, profiler };
}
