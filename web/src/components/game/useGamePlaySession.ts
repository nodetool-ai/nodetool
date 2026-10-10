import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameDocument, GameInputFrame, GameRenderFrame, GameSnapshot } from "@nodetool-ai/protocol/game.js";
import { gameSnapshot } from "@nodetool-ai/protocol/game.js";
import { createScriptedGameSession, type GameSession } from "@nodetool-ai/game-runtime";
import { createGameRenderer, loadBrowserGameFonts } from "@nodetool-ai/game-renderer/browser";
import { GameAudioPlayer, gameAudioSpatialView2D } from "@nodetool-ai/game-renderer/audio";
import { browserGamepads, FixedTickClock, GameInput, GameParticles2D, type GameRenderer } from "@nodetool-ai/game-renderer";

import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { resolveMediaUri } from "../../utils/resolveMediaUri";
import { GameReplayHistory } from "./gameReplayHistory";

interface PlayState { tick: number; score: number; won: boolean; sceneId: string }
export interface ScriptFailure { message: string; tick: number; entityId: string | null }

export function scriptFailure(message: string, tick: number): ScriptFailure {
  const sourceKey = message.match(/Game script (\[[^\]]+\])/);
  let entityId: string | null = null;
  if (sourceKey) {
    try {
      const parts: unknown = JSON.parse(sourceKey[1]);
      if (Array.isArray(parts) && typeof parts[1] === "string") entityId = parts[1];
    } catch { /* The original error remains visible. */ }
  }
  return { message, tick, entityId };
}

export const EMPTY_INPUT: GameInputFrame = { pressed: [], justPressed: [] };

interface UseGamePlaySessionOptions {
  refId: string;
  active: boolean;
  document: GameDocument | null;
  editorSceneId?: string;
  name?: string;
}

export function useGamePlaySession({ refId, active, document, editorSceneId, name }: UseGamePlaySessionOptions) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<GameSession | null>(null);
  const particlesRef = useRef<GameParticles2D | null>(null);
  const sessionFailedRef = useRef(false);
  const rendererRef = useRef<GameRenderer | null>(null);
  const sessionGenerationRef = useRef(0);
  const inputRef = useRef(new GameInput());
  const inputHistoryRef = useRef(new GameReplayHistory<GameInputFrame, GameSnapshot>());
  const lastTickRef = useRef(0);
  const lastPresentationRef = useRef<{ state: PlayState; frame: GameRenderFrame } | null>(null);
  const audioRef = useRef<GameAudioPlayer | null>(null);
  const editorCameraRef = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const editorAspectRef = useRef<number | null>(null);
  const loadedFontsRef = useRef<Awaited<ReturnType<typeof loadBrowserGameFonts>> | null>(null);
  const fontsKeyRef = useRef<string | null>(null);
  const rendererPromiseRef = useRef<Promise<GameRenderer> | null>(null);
  const assetBindingsRef = useRef<GameDocument["assets"] | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playDocument, setPlayDocument] = useState<GameDocument | null>(null);
  const [renderDocument, setRenderDocument] = useState<GameDocument | null>(null);
  const [playState, setPlayState] = useState<PlayState>({ tick: 0, score: 0, won: false, sceneId: "" });
  const [backend, setBackend] = useState("Initializing");
  const [error, setError] = useState<string | null>(null);
  const [scriptError, setScriptError] = useState<ScriptFailure | null>(null);
  const [frame, setFrame] = useState<GameRenderFrame | null>(null);
  const setTitle = useWorkspaceTabsStore((state) => state.setTitle);
  const editorDocument = useMemo(() => renderDocument && editorSceneId &&
    renderDocument.scenes.some((scene) => scene.id === editorSceneId)
    ? { ...renderDocument, entrySceneId: editorSceneId }
    : renderDocument, [renderDocument, editorSceneId]);
  const sessionDocument = playDocument ?? editorDocument;
  const playbackActiveRef = useRef(false);
  playbackActiveRef.current = active && playing;
  assetBindingsRef.current = playDocument?.authoring ? playDocument.assets : document?.assets ?? null;

  useEffect(() => {
    if (!document || playDocument) return;
    const timer = window.setTimeout(() => setRenderDocument(document), 100);
    return () => window.clearTimeout(timer);
  }, [document, playDocument]);

  useEffect(() => {
    editorCameraRef.current = null;
  }, [editorSceneId]);

  const renderFrame = useCallback(async (current: GameRenderFrame, interpolation: number) => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const width = Math.round(current.width * current.pixelsPerUnit);
    const height = Math.round(current.height * current.pixelsPerUnit);
    if (renderer.canvas.width !== width || renderer.canvas.height !== height) renderer.resize(width, height);
    audioRef.current?.updateSpatial(gameAudioSpatialView2D(current, interpolation));
    await renderer.render(current, interpolation, particlesRef.current ?? undefined);
    if (renderer.capabilities.fallbackReason) {
      setBackend("Canvas 2D");
      setError("GPU effects omitted after WebGPU failure");
    }
  }, []);

  const showCurrentFrame = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    const state = session.snapshot();
    lastTickRef.current = state.tick;
    const presentationState = { tick: state.tick, score: state.score, won: state.won, sceneId: state.sceneId };
    setPlayState(presentationState);
    const rawFrame = session.frame();
    const current = !playDocument
      ? { ...rawFrame, camera: editorCameraRef.current ?? rawFrame.camera,
        width: editorAspectRef.current ? rawFrame.height * editorAspectRef.current : rawFrame.width }
      : rawFrame;
    lastPresentationRef.current = { state: presentationState, frame: current };
    setFrame(current);
    void renderFrame(current, 1).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause));
      setPlaying(false);
    });
  }, [renderFrame, playDocument]);

  const onViewportAspect = useCallback((aspect: number) => {
    if (editorAspectRef.current && Math.abs(editorAspectRef.current - aspect) < 0.01) return;
    editorAspectRef.current = aspect;
    showCurrentFrame();
  }, [showCurrentFrame]);

  const onCamera = useCallback((camera: { x: number; y: number; zoom: number }) => {
    editorCameraRef.current = camera;
    showCurrentFrame();
  }, [showCurrentFrame]);

  const resetCamera = useCallback(() => {
    editorCameraRef.current = null;
    showCurrentFrame();
  }, [showCurrentFrame]);

  const disposeSession = useCallback(() => {
    const current = sessionRef.current;
    sessionRef.current = null;
    particlesRef.current = null;
    current?.dispose();
  }, []);

  const step = useCallback((input: GameInputFrame = EMPTY_INPUT) => {
    const session = sessionRef.current;
    if (!session || sessionFailedRef.current) return;
    if (playDocument) inputHistoryRef.current.record(input, () => session.snapshot());
    try {
      const result = session.step(input);
      particlesRef.current?.tick(result.frame, session.takePresentationEvents());
      result.events.forEach((event) => audioRef.current?.handle(event));
      const state = session.snapshot();
      lastTickRef.current = state.tick;
      audioRef.current?.sync(state);
      const presentationState = { tick: state.tick, score: state.score, won: state.won, sceneId: state.sceneId };
      lastPresentationRef.current = { state: presentationState, frame: result.frame };
      if (!playbackActiveRef.current || state.tick % 6 === 0) {
        setPlayState(presentationState);
        setFrame(result.frame);
      }
      void renderFrame(result.frame, 1).catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
        setPlaying(false);
      });
    } catch (cause) {
      sessionFailedRef.current = true;
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      if (message.includes("Game script")) setScriptError(scriptFailure(message, lastTickRef.current + 1));
      setPlaying(false);
    }
  }, [renderFrame, playDocument]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!sessionDocument || !canvas) return;
    let cancelled = false;
    const generation = ++sessionGenerationRef.current;

    if (!rendererRef.current) setBackend("Initializing");
    setError(null);
    setScriptError(null);
    const input = inputRef.current;
    const audio = audioRef.current ?? new GameAudioPlayer({
      assets: sessionDocument.assets,
      tickRate: sessionDocument.tickRate,
      resolveAsset: async (binding) => binding.assetId.startsWith("builtin:") ? null : resolveMediaUri(binding.assetId.startsWith("package://") ? binding.assetId : `asset://${binding.assetId}`),
      status: setError
    });
    audioRef.current = audio;
    audio.updateAssets(sessionDocument.assets);
    audio.updateMixer(sessionDocument.audio?.mixer);
    if (playbackActiveRef.current) audio.resume();
    else audio.pause();
    audio.preload();
    setTitle(refId, "game", name ?? "Game");
    const resolveAsset = async (assetId: string): Promise<HTMLImageElement | null> => {
      const binding = assetBindingsRef.current ? assetBindingsRef.current[assetId] : sessionDocument.assets[assetId];
      if (!binding || binding.assetId.startsWith("builtin:")) return null;
      const url = await resolveMediaUri(binding.assetId.startsWith("package://") ? binding.assetId : `asset://${binding.assetId}`);
      if (!url) return null;
      const image = new Image();
      image.src = url;
      try { await image.decode(); return image; }
      catch { return null; }
    };
    const fontKey = JSON.stringify(Object.entries(sessionDocument.assets).filter(([, binding]) => binding.mediaKind === "font"));
    const prepareFonts = async (): Promise<void> => {
      if (fontsKeyRef.current === fontKey) return;
      const fonts = await loadBrowserGameFonts(sessionDocument, async (sourceId) => {
        if (sourceId.startsWith("builtin:")) return null;
        return resolveMediaUri(sourceId.startsWith("package://") ? sourceId : `asset://${sourceId}`);
      });
      if (cancelled) { fonts.dispose(); return; }
      loadedFontsRef.current?.dispose();
      loadedFontsRef.current = fonts;
      fontsKeyRef.current = fontKey;
      if (fonts.diagnostics.length > 0) setError(fonts.diagnostics.join("; "));
    };
    void prepareFonts().then(() => cancelled ? null : createScriptedGameSession(sessionDocument, 1)).then(async (createdSession) => {
      if (!createdSession) return;
      if (cancelled || sessionGenerationRef.current !== generation) { createdSession.dispose(); return; }
      sessionRef.current = createdSession;
      particlesRef.current = new GameParticles2D(sessionDocument.tickRate);
      sessionFailedRef.current = false;
      lastTickRef.current = createdSession.snapshot().tick;
      audio.reset(createdSession.snapshot());
      if (!rendererPromiseRef.current) rendererPromiseRef.current = createGameRenderer({ canvas, backend: "auto", assets: resolveAsset });
      const created = await rendererPromiseRef.current;
      if (cancelled) { return; }
      rendererRef.current = created;
      const effects = sessionDocument.renderEffects ?? [];
      if (effects.some((effect) => effect.required) && !created.capabilities.gpuEffects) {
        throw new Error("This game requires a WebGPU effect, but WebGPU is unavailable");
      }
      created.setEffects(effects, sessionDocument.hudEffectOrder);
      if (effects.length > 0 && !created.capabilities.gpuEffects) setError("GPU effects unavailable; playing without them");
      rendererRef.current = created;
      setBackend(created.backend === "webgpu" ? "WebGPU" : "Canvas 2D");
      showCurrentFrame();
    }).catch((cause: unknown) => {
      if (cancelled || sessionGenerationRef.current !== generation) return;
      if (!rendererRef.current) rendererPromiseRef.current = null;
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      if (message.includes("Game script")) setScriptError(scriptFailure(message, 0));
      setPlaying(false);
    });
    return () => {
      cancelled = true;
      sessionGenerationRef.current += 1;
      input.release();
      disposeSession();

    };
  }, [name, disposeSession, sessionDocument, refId, setTitle, showCurrentFrame]);

  useEffect(() => () => {
    rendererRef.current = null;
    void rendererPromiseRef.current?.then((renderer) => renderer.dispose(), () => {});
    rendererPromiseRef.current = null;
    loadedFontsRef.current?.dispose();
    loadedFontsRef.current = null;
    fontsKeyRef.current = null;
    audioRef.current?.dispose();
    audioRef.current = null;
  }, []);

  useEffect(() => {
    if (!document || playDocument?.authoring) return;
    audioRef.current?.updateAssets(assetBindingsRef.current ?? {});
    const renderer = rendererRef.current;
    if (!renderer) return;
    for (const slot of new Set([...Object.keys(renderDocument?.assets ?? {}), ...Object.keys(document.assets)])) {
      if (JSON.stringify(renderDocument?.assets[slot]) !== JSON.stringify(document.assets[slot])) renderer.invalidateAsset(slot);
    }
  }, [document, playDocument, renderDocument]);

  useEffect(() => {
    if (!active || !playing) audioRef.current?.pause();
    else audioRef.current?.resume();
    // Paused input is dropped, not queued for the next tick (F23).
    inputRef.current.setEnabled(active && playing);
    if (!active || !playing) {
      const presentation = lastPresentationRef.current;
      if (playDocument && presentation) {
        setPlayState(presentation.state);
        setFrame(presentation.frame);
      }
    }
  }, [active, playing, playDocument]);

  useEffect(() => {
    if (!active || !playing || !sessionDocument) return;
    let request = 0;
    const clock = new FixedTickClock(sessionDocument.tickRate);
    const animate = (now: number) => {
      clock.advance(now, () => {
        inputRef.current.pollGamepads(browserGamepads());
        step(inputRef.current.sample2D(sessionDocument));
      });
      request = requestAnimationFrame(animate);
    };
    request = requestAnimationFrame(animate);
    const onVisibility = () => { if (window.document.hidden) setPlaying(false); };
    window.document.addEventListener("visibilitychange", onVisibility);
    return () => { cancelAnimationFrame(request); window.document.removeEventListener("visibilitychange", onVisibility); };
  }, [active, sessionDocument, playing, step]);

  const beginPlay = () => {
    if (playDocument && sessionFailedRef.current) { return; }
    inputRef.current.release();
    if (!document) return;
    if (!playing && !playDocument) {
      inputHistoryRef.current.clear();
      setScriptError(null);
      setPlayDocument(document);
    }
    setPlaying((current) => !current);
    canvasRef.current?.focus();
  };

  const stop = () => {
    setPlaying(false);
    setPlayDocument(null);
    inputHistoryRef.current.clear();
    setScriptError(null);
  };

  const save = () => {
    const session = sessionRef.current;
    if (session) localStorage.setItem(`nodetool.game.save.${refId}`, JSON.stringify(session.snapshot()));
  };

  const load = async () => {
    if (!sessionDocument) return;
    const raw = localStorage.getItem(`nodetool.game.save.${refId}`);
    if (!raw) return;
    try {
      const parsed = gameSnapshot.safeParse(JSON.parse(raw) as unknown);
      if (!parsed.success) { setError("Saved game data is invalid"); return; }
      const generation = ++sessionGenerationRef.current;
      const restored = await createScriptedGameSession(sessionDocument, 1, parsed.data);
      if (sessionGenerationRef.current !== generation) { restored.dispose(); return; }
      setPlaying(false);
      inputHistoryRef.current.clear(parsed.data);
      setScriptError(null);
      disposeSession();
      sessionRef.current = restored;
      particlesRef.current = new GameParticles2D(sessionDocument.tickRate);
      sessionFailedRef.current = false;
      audioRef.current?.reset(restored.snapshot());
      showCurrentFrame();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };

  const replayBeforeError = async (displayedFailure: ScriptFailure | null = scriptError): Promise<void> => {
    if (!playDocument || !displayedFailure || displayedFailure.tick < 1) return;
    setPlaying(false);
    try {
      const generation = ++sessionGenerationRef.current;
      const history = inputHistoryRef.current.replay();
      const replay = await createScriptedGameSession(playDocument, 1, history.snapshot);
      if (sessionGenerationRef.current !== generation) { replay.dispose(); return; }
      try { for (const input of history.inputs.slice(0, -1)) { replay.step(input); } }
      catch (cause) { replay.dispose(); throw cause; }
      disposeSession();
      sessionRef.current = replay;
      particlesRef.current = new GameParticles2D(playDocument.tickRate);
      sessionFailedRef.current = false;
      audioRef.current?.reset(replay.snapshot());
      showCurrentFrame();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };

  const runtimeEntities = (() => {
    if (!playDocument || playing || !sessionRef.current) return null;
    try { return sessionRef.current.inspect().entities; }
    catch { return null; }
  })();

  return { canvasRef, inputRef, playing, playDocument, playState, backend, error, setError,
    scriptError, setScriptError, frame, showCurrentFrame, onViewportAspect, onCamera, resetCamera,
    step, beginPlay, stop, save, load, replayBeforeError, runtimeEntities };
}
