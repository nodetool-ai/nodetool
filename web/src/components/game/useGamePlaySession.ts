import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameDocument, GameInputFrame, GameRenderFrame } from "@nodetool-ai/protocol/game.js";
import { gameSnapshot } from "@nodetool-ai/protocol/game.js";
import { createScriptedGameSession, type GameSession } from "@nodetool-ai/game-runtime";
import { createGameRenderer, loadBrowserGameFonts } from "@nodetool-ai/game-renderer/browser";
import { GameAudioPlayer } from "@nodetool-ai/game-renderer/audio";
import type { GameRenderer } from "@nodetool-ai/game-renderer";

import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { resolveMediaUri } from "../../utils/resolveMediaUri";
import { gameInputFrame } from "./gameInputFrame";

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
  const rendererRef = useRef<GameRenderer | null>(null);
  const sessionGenerationRef = useRef(0);
  const keysRef = useRef(new Map<string, string>());
  const newlyPressedRef = useRef(new Set<string>());
  const inputHistoryRef = useRef<GameInputFrame[]>([]);
  const lastTickRef = useRef(0);
  const audioRef = useRef<GameAudioPlayer | null>(null);
  const editorCameraRef = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const editorAspectRef = useRef<number | null>(null);
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
  assetBindingsRef.current = document?.assets ?? null;

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
    await renderer.render(current, interpolation);
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
    setPlayState({ tick: state.tick, score: state.score, won: state.won, sceneId: state.sceneId });
    const rawFrame = session.frame();
    const current = !playDocument
      ? { ...rawFrame, camera: editorCameraRef.current ?? rawFrame.camera,
        width: editorAspectRef.current ? rawFrame.height * editorAspectRef.current : rawFrame.width }
      : rawFrame;
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
    current?.dispose();
  }, []);

  const step = useCallback((input: GameInputFrame = EMPTY_INPUT) => {
    const session = sessionRef.current;
    if (!session) return;
    if (playDocument) inputHistoryRef.current.push({ pressed: [...input.pressed], justPressed: [...input.justPressed] });
    try {
      const result = session.step(input);
      result.events.forEach((event) => audioRef.current?.handle(event));
      const state = session.snapshot();
      lastTickRef.current = state.tick;
      audioRef.current?.sync(state);
      setPlayState({ tick: state.tick, score: state.score, won: state.won, sceneId: state.sceneId });
      setFrame(result.frame);
      void renderFrame(result.frame, 1).catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
        setPlaying(false);
      });
    } catch (cause) {
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
    let renderer: GameRenderer | null = null;
    let loadedFonts: Awaited<ReturnType<typeof loadBrowserGameFonts>> | null = null;
    setBackend("Initializing");
    setError(null);
    setScriptError(null);
    const keys = keysRef.current;
    const newlyPressed = newlyPressedRef.current;
    const audio = new GameAudioPlayer({
      assets: sessionDocument.assets,
      tickRate: sessionDocument.tickRate,
      resolveAsset: async (binding) => binding.assetId.startsWith("builtin:") ? null : resolveMediaUri(`asset://${binding.assetId}`),
      status: setError
    });
    audioRef.current = audio;
    if (playbackActiveRef.current) audio.resume();
    else audio.pause();
    audio.preload();
    setTitle(refId, "game", name ?? "Game");
    const resolveAsset = async (assetId: string): Promise<HTMLImageElement | null> => {
      const binding = assetBindingsRef.current ? assetBindingsRef.current[assetId] : sessionDocument.assets[assetId];
      if (!binding || binding.assetId.startsWith("builtin:")) return null;
      const url = await resolveMediaUri(`asset://${binding.assetId}`);
      if (!url) return null;
      const image = new Image();
      image.src = url;
      try { await image.decode(); return image; }
      catch { return null; }
    };
    void loadBrowserGameFonts(sessionDocument, async (sourceId) => {
      if (sourceId.startsWith("builtin:")) return null;
      return resolveMediaUri(`asset://${sourceId}`);
    }).then((fonts) => {
      if (cancelled) { fonts.dispose(); return null; }
      loadedFonts = fonts;
      if (fonts.diagnostics.length > 0) setError(fonts.diagnostics.join("; "));
      return createScriptedGameSession(sessionDocument, 1);
    }).then(async (createdSession) => {
      if (!createdSession) return;
      if (cancelled || sessionGenerationRef.current !== generation) { createdSession.dispose(); return; }
      sessionRef.current = createdSession;
      lastTickRef.current = createdSession.snapshot().tick;
      audio.sync(createdSession.snapshot());
      const created = await createGameRenderer({ canvas, backend: "auto", assets: resolveAsset });
      if (cancelled) { created.dispose(); return; }
      const effects = sessionDocument.renderEffects ?? [];
      if (effects.some((effect) => effect.required) && !created.capabilities.gpuEffects) {
        created.dispose();
        throw new Error("This game requires a WebGPU effect, but WebGPU is unavailable");
      }
      created.setEffects(effects, sessionDocument.hudEffectOrder);
      if (effects.length > 0 && !created.capabilities.gpuEffects) setError("GPU effects unavailable; playing without them");
      renderer = created;
      rendererRef.current = created;
      setBackend(created.backend === "webgpu" ? "WebGPU" : "Canvas 2D");
      showCurrentFrame();
    }).catch((cause: unknown) => {
      if (cancelled || sessionGenerationRef.current !== generation) return;
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      if (message.includes("Game script")) setScriptError(scriptFailure(message, 0));
      setPlaying(false);
    });
    return () => {
      cancelled = true;
      sessionGenerationRef.current += 1;
      keys.clear();
      newlyPressed.clear();
      disposeSession();
      rendererRef.current = null;
      renderer?.dispose();
      loadedFonts?.dispose();
      audio.dispose();
      if (audioRef.current === audio) audioRef.current = null;
    };
  }, [name, disposeSession, sessionDocument, refId, setTitle, showCurrentFrame]);

  useEffect(() => {
    if (!playDocument || !document) return;
    const renderer = rendererRef.current;
    if (!renderer) return;
    for (const slot of new Set([...Object.keys(playDocument.assets), ...Object.keys(document.assets)])) {
      if (JSON.stringify(playDocument.assets[slot]) !== JSON.stringify(document.assets[slot])) renderer.invalidateAsset(slot);
    }
  }, [document, playDocument]);

  useEffect(() => {
    if (!active || !playing) audioRef.current?.pause();
    else audioRef.current?.resume();
    if (!active || !playing) { keysRef.current.clear(); newlyPressedRef.current.clear(); }
  }, [active, playing]);

  useEffect(() => {
    if (!active || !playing || !sessionDocument) return;
    let request = 0;
    let previous = 0;
    let accumulator = 0;
    const tickDuration = 1000 / sessionDocument.tickRate;
    const animate = (now: number) => {
      if (!previous) previous = now;
      accumulator += Math.min(now - previous, 250);
      previous = now;
      let steps = 0;
      while (accumulator >= tickDuration && steps < 5) {
        step(gameInputFrame(keysRef.current, newlyPressedRef.current, sessionDocument));
        newlyPressedRef.current.clear();
        accumulator -= tickDuration;
        steps += 1;
      }
      if (steps === 5) accumulator = 0;
      request = requestAnimationFrame(animate);
    };
    request = requestAnimationFrame(animate);
    const onVisibility = () => { if (window.document.hidden) setPlaying(false); };
    window.document.addEventListener("visibilitychange", onVisibility);
    return () => { cancelAnimationFrame(request); window.document.removeEventListener("visibilitychange", onVisibility); };
  }, [active, sessionDocument, playing, step]);

  const beginPlay = () => {
    if (!document) return;
    if (!playing && !playDocument) {
      inputHistoryRef.current = [];
      setScriptError(null);
      setPlayDocument(document);
    }
    setPlaying((current) => !current);
    canvasRef.current?.focus();
  };

  const stop = () => {
    setPlaying(false);
    setPlayDocument(null);
    inputHistoryRef.current = [];
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
      inputHistoryRef.current = [];
      setScriptError(null);
      disposeSession();
      sessionRef.current = restored;
      audioRef.current?.reset(restored.snapshot());
      showCurrentFrame();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };

  const replayBeforeError = async () => {
    if (!playDocument || !scriptError || scriptError.tick < 1) return;
    setPlaying(false);
    try {
      const replay = await createScriptedGameSession(playDocument, 1);
      for (const input of inputHistoryRef.current.slice(0, -1)) replay.step(input);
      disposeSession();
      sessionRef.current = replay;
      audioRef.current?.reset(replay.snapshot());
      showCurrentFrame();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };

  const runtimeEntities = (() => {
    if (!playDocument || playing || !sessionRef.current) return null;
    try { return sessionRef.current.inspect().entities; }
    catch { return null; }
  })();

  return { canvasRef, keysRef, newlyPressedRef, playing, playDocument, playState, backend, error, setError,
    scriptError, setScriptError, frame, showCurrentFrame, onViewportAspect, onCamera, resetCamera,
    step, beginPlay, stop, save, load, replayBeforeError, runtimeEntities };
}
