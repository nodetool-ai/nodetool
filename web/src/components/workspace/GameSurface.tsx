import { useCallback, useEffect, useRef, useState } from "react";
import type { GameDocument, GameEvent, GameInputFrame, GameRenderFrame } from "@nodetool-ai/protocol/game.js";
import { gameSnapshot } from "@nodetool-ai/protocol/game.js";
import { createScriptedGameSession, validateGame, type GameSession } from "@nodetool-ai/game-runtime";
import { createGameRenderer } from "@nodetool-ai/game-renderer/browser";
import type { GameRenderer } from "@nodetool-ai/game-renderer";

import { trpc, trpcClient } from "../../trpc/client";
import { resolveMediaUri } from "../../utils/resolveMediaUri";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { Box, Caption, EditorButton, EmptyState, FlexColumn, FlexRow, LoadingSpinner, SPACING, Text, TextInput } from "../ui_primitives";
import ReportBugButton from "../support/ReportBugButton";

interface GameSurfaceProps {
  refId: string;
  active: boolean;
}

interface PlayState {
  tick: number;
  score: number;
  won: boolean;
}

const KEY_ACTIONS: Readonly<Record<string, string>> = {
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
  ArrowUp: "up", KeyW: "up",
  ArrowDown: "down", KeyS: "down"
};

const EMPTY_INPUT: GameInputFrame = { pressed: [], justPressed: [] };

function inputFrame(keys: ReadonlySet<string>, newlyPressed: ReadonlySet<string>, document: GameDocument): GameInputFrame {
  const pressed = [...new Set([...keys].map((key) => KEY_ACTIONS[key]).filter((action): action is string => Boolean(action)))];
  const justPressed = [...new Set([...newlyPressed].map((key) => KEY_ACTIONS[key]).filter((action): action is string => Boolean(action)))];
  return {
    pressed: pressed.filter((action) => document.inputActions.includes(action)),
    justPressed: justPressed.filter((action) => document.inputActions.includes(action))
  };
}

function savedKey(id: string): string {
  return `nodetool.game.save.${id}`;
}

const GameSurface = ({ refId, active }: GameSurfaceProps) => {
  const { data, isPending, error: loadError } = trpc.games.get.useQuery({ id: refId }, { staleTime: 15_000 });
  const { data: revisions } = trpc.games.revisions.useQuery({ id: refId }, { staleTime: 15_000 });
  const queries = trpc.useUtils();
  const document = data?.document;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<GameSession | null>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const sessionGenerationRef = useRef(0);
  const keysRef = useRef(new Set<string>());
  const newlyPressedRef = useRef(new Set<string>());
  const audioContextRef = useRef<AudioContext | null>(null);
  const soundsRef = useRef(new Map<string, HTMLAudioElement>());
  const [playing, setPlaying] = useState(false);
  const [playState, setPlayState] = useState<PlayState>({ tick: 0, score: 0, won: false });
  const [backend, setBackend] = useState<string>("Initializing");
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<GameDocument | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assetId, setAssetId] = useState("");
  const [saving, setSaving] = useState(false);
  const setTitle = useWorkspaceTabsStore((state) => state.setTitle);

  useEffect(() => {
    if (document) setDraft(document);
  }, [document]);

  const renderFrame = useCallback(async (frame: GameRenderFrame, interpolation: number) => {
    const renderer = rendererRef.current;
    if (renderer) {
      const width = Math.round(frame.width * frame.pixelsPerUnit);
      const height = Math.round(frame.height * frame.pixelsPerUnit);
      if (renderer.canvas.width !== width || renderer.canvas.height !== height) {
        renderer.resize(width, height);
      }
      await renderer.render(frame, interpolation);
    }
  }, []);

  const showCurrentFrame = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    const state = session.snapshot();
    setPlayState({ tick: state.tick, score: state.score, won: state.won });
    void renderFrame(session.frame(), 1).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause));
      setPlaying(false);
    });
  }, [renderFrame]);

  const unlockAudio = () => {
    if (!audioContextRef.current) audioContextRef.current = new AudioContext();
    void audioContextRef.current.resume();
  };

  const playAudio = useCallback((event: GameEvent) => {
    if (event.kind !== "audio" || !document) return;
    const ref = document.assets[event.assetId]?.assetId;
    const audioContext = audioContextRef.current;
    if (ref?.startsWith("builtin:") && audioContext) {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.frequency.value = 660;
      gain.gain.setValueAtTime(0.08, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.12);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.12);
      return;
    }
    if (!ref) return;
    void resolveMediaUri(`asset://${ref}`).then((url) => {
      if (!url) return;
      let sound = soundsRef.current.get(ref);
      if (!sound) {
        sound = new Audio(url);
        soundsRef.current.set(ref, sound);
      }
      sound.currentTime = 0;
      void sound.play();
    });
  }, [document]);

  const disposeSession = useCallback(() => {
    const current = sessionRef.current;
    sessionRef.current = null;
    current?.dispose();
  }, []);

  const step = useCallback((input: GameInputFrame = EMPTY_INPUT) => {
    const session = sessionRef.current;
    if (!session) return;
    try {
      const result = session.step(input);
      result.events.forEach(playAudio);
      const state = session.snapshot();
      setPlayState({ tick: state.tick, score: state.score, won: state.won });
      void renderFrame(result.frame, 1).catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
        setPlaying(false);
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setPlaying(false);
    }
  }, [playAudio, renderFrame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!document || !canvas) return;
    let cancelled = false;
    const generation = ++sessionGenerationRef.current;
    let renderer: GameRenderer | null = null;
    setBackend("Initializing");
    const keys = keysRef.current;
    const newlyPressed = newlyPressedRef.current;
    const sounds = soundsRef.current;
    setTitle(refId, "game", data?.game.name ?? "Game");
    const resolveAsset = async (assetId: string): Promise<HTMLImageElement | null> => {
      const binding = document.assets[assetId];
      if (!binding) return null;
      if (binding.assetId.startsWith("builtin:")) return null;
      const url = await resolveMediaUri(`asset://${binding.assetId}`);
      if (!url) return null;
      const image = new Image();
      image.src = url;
      try {
        await image.decode();
        return image;
      } catch {
        return null;
      }
    };
    void createScriptedGameSession(document, 1)
      .then(async (createdSession) => {
        if (cancelled || sessionGenerationRef.current !== generation) {
          createdSession.dispose();
          return;
        }
        sessionRef.current = createdSession;
        const created = await createGameRenderer({ canvas, backend: "auto", assets: resolveAsset });
        if (cancelled) {
          created.dispose();
          return;
        }
        const effect = document.renderEffects?.[0];
        if (effect && !created.capabilities.gpuEffects && effect.required) {
          created.dispose();
          throw new Error("This game requires a WebGPU effect, but WebGPU is unavailable");
        }
        if (effect && created.capabilities.gpuEffects) created.setEffect(effect);
        if (effect && !created.capabilities.gpuEffects) setError("GPU effect unavailable; playing without it");
        renderer = created;
        rendererRef.current = created;
        setBackend(created.backend === "webgpu" ? "WebGPU" : "Canvas 2D");
        showCurrentFrame();
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
    return () => {
      cancelled = true;
      sessionGenerationRef.current += 1;
      setPlaying(false);
      keys.clear();
      newlyPressed.clear();
      disposeSession();
      rendererRef.current = null;
      renderer?.dispose();
      for (const sound of sounds.values()) sound.pause();
      sounds.clear();
      void audioContextRef.current?.close();
      audioContextRef.current = null;
    };
  }, [data?.game.name, disposeSession, document, refId, setTitle, showCurrentFrame]);

  useEffect(() => {
    if (!active || !playing) {
      keysRef.current.clear();
      newlyPressedRef.current.clear();
    }
  }, [active, playing]);

  useEffect(() => {
    if (!active || !playing || !document) return;
    let request = 0;
    let previous = 0;
    let accumulator = 0;
    const tickDuration = 1000 / document.tickRate;
    const animate = (now: number) => {
      if (!previous) previous = now;
      accumulator += Math.min(now - previous, 250);
      previous = now;
      let steps = 0;
      while (accumulator >= tickDuration && steps < 5) {
        step(inputFrame(keysRef.current, newlyPressedRef.current, document));
        newlyPressedRef.current.clear();
        accumulator -= tickDuration;
        steps += 1;
      }
      if (steps === 5) accumulator = 0;
      request = requestAnimationFrame(animate);
    };
    request = requestAnimationFrame(animate);
    const onVisibility = () => {
      if (window.document.hidden) setPlaying(false);
    };
    window.document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(request);
      window.document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, document, playing, step]);

  const reset = async () => {
    if (!document) return;
    setPlaying(false);
    keysRef.current.clear();
    newlyPressedRef.current.clear();
    const generation = ++sessionGenerationRef.current;
    try {
      const next = await createScriptedGameSession(document, 1);
      if (sessionGenerationRef.current !== generation) {
        next.dispose();
        return;
      }
      disposeSession();
      sessionRef.current = next;
      showCurrentFrame();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const save = () => {
    const session = sessionRef.current;
    if (!session) return;
    localStorage.setItem(savedKey(refId), JSON.stringify(session.snapshot()));
  };

  const load = async () => {
    if (!document) return;
    const raw = localStorage.getItem(savedKey(refId));
    if (!raw) return;
    try {
      const parsed = gameSnapshot.safeParse(JSON.parse(raw) as unknown);
      if (!parsed.success) {
        setError("Saved game data is invalid");
        return;
      }
      const generation = ++sessionGenerationRef.current;
      const restored = await createScriptedGameSession(document, 1, parsed.data);
      if (sessionGenerationRef.current !== generation) {
        restored.dispose();
        return;
      }
      setPlaying(false);
      disposeSession();
      sessionRef.current = restored;
      showCurrentFrame();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const updatePosition = (axis: "x" | "y", value: string) => {
    const coordinate = Number(value);
    if (!draft || !selectedId || !Number.isFinite(coordinate)) return;
    setDraft({
      ...draft,
      scenes: draft.scenes.map((scene) => ({
        ...scene,
        entities: scene.entities.map((entity) =>
          entity.id === selectedId
            ? { ...entity, transform2d: { ...entity.transform2d, [axis]: coordinate } }
            : entity
        )
      }))
    });
  };

  const publish = async () => {
    if (!draft || !data) return;
    const validation = validateGame(draft);
    if (!validation.valid) {
      setError(validation.errors.join("; "));
      return;
    }
    setSaving(true);
    try {
      await trpcClient.games.publish.mutate({ id: refId, baseRevision: data.game.revision, document: draft });
      await queries.games.get.invalidate({ id: refId });
      await queries.games.revisions.invalidate({ id: refId });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const restoreRevision = async (revision: string) => {
    if (!data) return;
    setSaving(true);
    try {
      await trpcClient.games.restore.mutate({ id: refId, baseRevision: data.game.revision, revision });
      setPlaying(false);
      await queries.games.get.invalidate({ id: refId });
      await queries.games.revisions.invalidate({ id: refId });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const installAsset = async () => {
    if (!data || !selectedId || !assetId.trim()) return;
    const selected = draft?.scenes.flatMap((scene) => scene.entities).find((entity) => entity.id === selectedId);
    const slot = selected?.sprite?.assetId;
    if (!slot) return;
    setSaving(true);
    try {
      await trpcClient.games.installAsset.mutate({ id: refId, baseRevision: data.game.revision, slot, assetId: assetId.trim() });
      await queries.games.get.invalidate({ id: refId });
      setAssetId("");
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  if (isPending) return <LoadingSpinner text="Loading game" />;
  if (loadError || !document) {
    return <EmptyState variant="error" title="Could not load game" description={loadError?.message ?? "The game may have been deleted."} />;
  }

  return (
    <FlexColumn gap={SPACING.md} sx={{ p: SPACING.lg, height: "100%" }}>
      <FlexRow align="center" gap={SPACING.md} wrap>
        <Text size="big">{data.game.name}</Text>
        <EditorButton onClick={() => { unlockAudio(); setPlaying((current) => !current); canvasRef.current?.focus(); }} disabled={backend === "Initializing"}>{playing ? "Pause" : "Play"}</EditorButton>
        <EditorButton onClick={() => { unlockAudio(); step(); }} disabled={playing || backend === "Initializing"}>Step</EditorButton>
        <EditorButton onClick={() => void reset()} disabled={backend === "Initializing"}>Reset</EditorButton>
        <EditorButton onClick={save} disabled={backend === "Initializing"}>Save</EditorButton>
        <EditorButton onClick={() => void load()} disabled={backend === "Initializing"}>Load</EditorButton>
        <Caption>Tick {playState.tick} · Score {playState.score} · {playState.won ? "Won" : "Playing"} · {backend}</Caption>
      </FlexRow>
      {error && (
        <FlexRow gap={SPACING.sm} align="center">
          <Caption color="error" role="alert">{error}</Caption>
          <ReportBugButton context={{ source: "panel-crash", summary: "Game player failed", errorText: error }} />
        </FlexRow>
      )}
      <FlexRow gap={SPACING.md} sx={{ flex: 1, minHeight: 0 }}>
        <Box sx={{ flex: 1, minWidth: 0, overflow: "auto", bgcolor: "background.default" }}>
          <Box component="canvas" ref={canvasRef} width={512} height={288} aria-label="Game viewport" role="group" tabIndex={0}
            onKeyDown={(event) => { if (active && playing && KEY_ACTIONS[event.code]) { event.preventDefault(); if (!keysRef.current.has(event.code)) newlyPressedRef.current.add(event.code); keysRef.current.add(event.code); } }}
            onKeyUp={(event) => keysRef.current.delete(event.code)} onBlur={() => { keysRef.current.clear(); newlyPressedRef.current.clear(); }}
            sx={{ width: "100%", height: "auto", maxHeight: "100%", objectFit: "contain" }} />
        </Box>
        <FlexColumn gap={SPACING.md} sx={{ width: "25%", minWidth: 0, overflow: "auto" }}>
          <Text>Scene tree</Text>
          {draft?.scenes.map((scene) => (
            <FlexColumn key={scene.id} gap={SPACING.xs}>
              <Caption>{scene.name}</Caption>
              {scene.entities.map((entity) => (
                <EditorButton key={entity.id} variant={selectedId === entity.id ? "contained" : "text"} onClick={() => setSelectedId(entity.id)}>
                  {entity.name || entity.id}
                </EditorButton>
              ))}
            </FlexColumn>
          ))}
          {(() => {
            const entity = draft?.scenes.flatMap((scene) => scene.entities).find((entry) => entry.id === selectedId);
            if (!entity) return null;
            return (
              <FlexColumn gap={SPACING.sm}>
                <Text>Inspector</Text>
                <TextInput label="X" type="number" value={entity.transform2d.x} onChange={(event) => updatePosition("x", event.target.value)} />
                <TextInput label="Y" type="number" value={entity.transform2d.y} onChange={(event) => updatePosition("y", event.target.value)} />
                {entity.sprite && (
                  <>
                    <Caption>Sprite slot: {entity.sprite.assetId}</Caption>
                    <TextInput label="Asset ID" value={assetId} onChange={(event) => setAssetId(event.target.value)} />
                    <EditorButton onClick={() => void installAsset()} disabled={saving || !assetId.trim()}>Install asset</EditorButton>
                  </>
                )}
              </FlexColumn>
            );
          })()}
          <EditorButton onClick={() => void publish()} disabled={saving || !draft}>Save scene</EditorButton>
          <Text>Revisions</Text>
          {revisions?.slice(0, 10).map((entry) => (
            <FlexRow key={entry.revision} gap={SPACING.xs} align="center">
              <Caption>{entry.revision.slice(0, 12)}{entry.current ? " · Current" : ""}</Caption>
              {!entry.current && <EditorButton onClick={() => void restoreRevision(entry.revision)} disabled={saving}>Restore</EditorButton>}
            </FlexRow>
          ))}
        </FlexColumn>
      </FlexRow>
      <Caption>Move with arrow keys or WASD.</Caption>
    </FlexColumn>
  );
};

export default GameSurface;
