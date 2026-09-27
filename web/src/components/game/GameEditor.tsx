import { useCallback, useEffect, useRef, useState } from "react";
import { useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { GameEntity } from "@nodetool-ai/protocol/game.js";
import { createScriptedGameSession, validateGame, type GameDocumentOp, type GameSession } from "@nodetool-ai/game-runtime";

import { trpc, trpcClient } from "../../trpc/client";
import { useChatDraftStore } from "../../stores/ChatDraftStore";
import { useConflictStore } from "../../stores/ConflictStore";
import { mergeByUnits } from "../../stores/documentMerge";
import { registerDocumentSync } from "../../stores/documentSync";
import { getGameDraftStore, useGameDraft } from "../../stores/game/GameDraftStore";
import { diffGameDocuments } from "../../stores/game/diffGameDocuments";
import { acceptServerGameUnit, gameMergeAdapter } from "../../stores/game/merge";
import { useDocumentConflicts } from "../../hooks/useDocumentConflicts";
import { Caption, ConflictBanner, Dialog, EditorButton, EmptyState, FlexColumn, FlexRow, LoadingSpinner, MobileBottomSheet, ResizableDock, SPACING, Text, TextInput } from "../ui_primitives";
import ReportBugButton from "../support/ReportBugButton";
import GameAgentPanel from "./GameAgentPanel";
import GameChanges from "./GameChanges";
import GameInspector from "./GameInspector";
import GameSceneTree from "./GameSceneTree";
import GameRuntimeInspector from "./GameRuntimeInspector";
import GameScriptPane from "./GameScriptPane";
import GameToolbar from "./GameToolbar";
import GameViewport from "./GameViewport";
import { pressGameKey } from "./gameInputFrame";
import { EMPTY_INPUT, scriptFailure, useGamePlaySession } from "./useGamePlaySession";

interface GameEditorProps {
  refId: string;
  active: boolean;
}

const GameEditor = ({ refId, active }: GameEditorProps) => {
  const { data, isPending, error: loadError } = trpc.games.getDraft.useQuery({ id: refId }, { staleTime: 15_000 });
  const { data: revisions } = trpc.games.revisions.useQuery({ id: refId }, { staleTime: 15_000 });
  const { data: changeEntries } = trpc.games.draftChanges.useQuery({ id: refId }, { staleTime: 5_000 });
  const queries = trpc.useUtils();
  const document = useGameDraft(refId, (state) => state.document);
  const selectedIds = useGameDraft(refId, (state) => state.selectedIds);
  const saveStatus = useGameDraft(refId, (state) => state.saveStatus);
  const draftError = useGameDraft(refId, (state) => state.error);
  const conflicts = useDocumentConflicts("game", refId);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { canvasRef, keysRef, newlyPressedRef, playing, playDocument, playState, backend, error, setError,
    scriptError, setScriptError, frame, onViewportAspect, onCamera, resetCamera, step, beginPlay, stop,
    save, load, replayBeforeError, runtimeEntities } = useGamePlaySession({ refId, active, document, name: data?.game.name });
  const [runSummary, setRunSummary] = useState<string | null>(null);
  const [runEntityStats, setRunEntityStats] = useState<{ entityId: string; durationMs: number; calls: number }[]>([]);
  const [runningTenSeconds, setRunningTenSeconds] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [focusMessage, setFocusMessage] = useState<{ threadId: string; messageId: string; requestId: number } | null>(null);
  const focusRequestRef = useRef(0);
  const [assistantThreadId, setAssistantThreadId] = useState<string | null>(null);
  const pendingAssistantPromptRef = useRef<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishMessage, setPublishMessage] = useState("");
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
  const [scriptKey, setScriptKey] = useState<{ sceneId: string; entityId: string; index: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const loadedTokenRef = useRef<string | null>(null);
  const clipboardRef = useRef<GameEntity[]>([]);
  const savingPromiseRef = useRef<Promise<void> | null>(null);
  const playDraftOps = playDocument && document ? diffGameDocuments(playDocument, document) : [];
  const needsPlayRestart = playDraftOps.some((op) => op.op !== "bind_asset" && op.op !== "unbind_asset");

  useEffect(() => {
    if (!data || loadedTokenRef.current === data.game.draftUpdatedAt) return;
    const store = getGameDraftStore(refId);
    if (store.getState().pendingOps.length > 0) return;
    store.getState().load(data.document, data.game.draftUpdatedAt);
    loadedTokenRef.current = data.game.draftUpdatedAt;
  }, [data, refId]);

  useEffect(() => {
    const prompt = pendingAssistantPromptRef.current;
    if (!assistantThreadId || !prompt) return;
    useChatDraftStore.getState().setDraft(assistantThreadId, prompt);
    pendingAssistantPromptRef.current = null;
  }, [assistantThreadId]);

  useEffect(() => {
    const pull = async () => {
      await savingPromiseRef.current?.catch(() => undefined);
      const server = await trpcClient.games.getDraft.query({ id: refId });
      const store = getGameDraftStore(refId);
      const state = store.getState();
      if (server.game.draftUpdatedAt === state.baseUpdatedAt) return;
      if (!state.document || !state.savedDocument || state.pendingOps.length === 0) {
        state.load(server.document, server.game.draftUpdatedAt);
      } else {
        const merged = mergeByUnits(state.savedDocument, state.document, server.document, gameMergeAdapter,
          { mergeWithoutOps: true });
        state.applyMerged(merged.doc, server.document, server.game.draftUpdatedAt);
        useConflictStore.getState().addConflicts(`game:${refId}`, merged.conflicts, {
          onAccept: (unitId) => {
            const conflict = merged.conflicts.find((entry) => entry.unit.id === unitId);
            if (!conflict) return;
            const current = store.getState().document;
            if (!current) return;
            const accepted = acceptServerGameUnit(current, server.document, conflict.unit.kind, unitId);
            store.getState().applyMerged(accepted, server.document, server.game.draftUpdatedAt);
          },
          onDiscard: () => undefined
        });
      }
      loadedTokenRef.current = server.game.draftUpdatedAt;
    };
    return registerDocumentSync("game", refId, {
      localRevision: () => getGameDraftStore(refId).getState().baseUpdatedAt,
      isDirty: () => getGameDraftStore(refId).getState().pendingOps.length > 0,
      reload: () => { void pull().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause))); },
      merge: () => { void pull().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause))); }
    });
  }, [refId, setError]);

  const flushDraft = useCallback(async (): Promise<void> => {
    if (savingPromiseRef.current) {
      await savingPromiseRef.current;
      if (getGameDraftStore(refId).getState().pendingOps.length > 0) return flushDraft();
      return;
    }
    const save = async () => {
      const store = getGameDraftStore(refId);
      let retries = 0;
      while (store.getState().pendingOps.length > 0) {
        const state = store.getState();
        if (!state.baseUpdatedAt) return;
        const ops = [...state.pendingOps];
        state.setSaving(ops.length);
        try {
          const result = await trpcClient.games.saveDraft.mutate({ id: refId, baseUpdatedAt: state.baseUpdatedAt, ops });
          store.getState().acknowledge(result.document, result.game.draftUpdatedAt, ops.length);
          loadedTokenRef.current = result.game.draftUpdatedAt;
          retries = 0;
        } catch (cause) {
          try {
            const server = await trpcClient.games.getDraft.query({ id: refId });
            const latest = store.getState();
            if (server.game.draftUpdatedAt !== latest.baseUpdatedAt && latest.document && latest.savedDocument) {
              const merged = mergeByUnits(latest.savedDocument, latest.document, server.document, gameMergeAdapter,
                { mergeWithoutOps: true });
              latest.applyMerged(merged.doc, server.document, server.game.draftUpdatedAt);
              loadedTokenRef.current = server.game.draftUpdatedAt;
              useConflictStore.getState().addConflicts(`game:${refId}`, merged.conflicts, {
                onAccept: (unitId) => {
                  const conflict = merged.conflicts.find((entry) => entry.unit.id === unitId);
                  const current = store.getState().document;
                  if (conflict && current) store.getState().applyMerged(
                    acceptServerGameUnit(current, server.document, conflict.unit.kind, unitId),
                    server.document, server.game.draftUpdatedAt);
                },
                onDiscard: () => undefined
              });
              if (merged.conflicts.length > 0) throw new Error("Resolve draft conflicts before saving");
              if (++retries <= 3) continue;
            }
          } catch (recoveryError) {
            if (recoveryError instanceof Error && recoveryError.message === "Resolve draft conflicts before saving") {
              store.getState().failSave(recoveryError.message);
              throw recoveryError;
            }
          }
          const message = cause instanceof Error ? cause.message : String(cause);
          store.getState().failSave(message);
          throw cause;
        }
      }
    };
    savingPromiseRef.current = save();
    try { await savingPromiseRef.current; } finally { savingPromiseRef.current = null; }
  }, [refId]);

  useEffect(() => {
    if (saveStatus !== "unsaved") return;
    const timer = window.setTimeout(() => { void flushDraft().catch(() => undefined); }, 500);
    return () => window.clearTimeout(timer);
  }, [flushDraft, saveStatus, document]);

  const onOps = useCallback((ops: GameDocumentOp[]) => {
    getGameDraftStore(refId).getState().apply(ops);
  }, [refId]);

  const runTenSeconds = async () => {
    if (!document) return;
    setRunningTenSeconds(true);
    setRunEntityStats([]);
    let session: GameSession | null = null;
    let completedTicks = 0;
    try {
      session = await createScriptedGameSession(document, 1);
      let durationMs = 0;
      let calls = 0;
      const byEntity = new Map<string, { durationMs: number; calls: number }>();
      const ticks = Math.round(document.tickRate * 10);
      for (let tick = 0; tick < ticks; tick++) {
        const result = session.step(EMPTY_INPUT);
        completedTicks += 1;
        durationMs += result.scriptStats?.durationMs ?? 0;
        calls += result.scriptStats?.calls ?? 0;
        for (const [entityId, stats] of Object.entries(result.scriptStats?.byEntity ?? {})) {
          const previous = byEntity.get(entityId) ?? { durationMs: 0, calls: 0 };
          byEntity.set(entityId, { durationMs: previous.durationMs + stats.durationMs, calls: previous.calls + stats.calls });
        }
        if (tick % 30 === 29) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      setRunSummary(`${ticks} ticks completed · ${calls} script calls · ${durationMs.toFixed(1)} ms total script time`);
      setRunEntityStats([...byEntity].map(([entityId, stats]) => ({ entityId, ...stats })));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setRunSummary(`First error at tick ${completedTicks + 1}: ${message}`);
      setScriptError(scriptFailure(message, completedTicks + 1));
    } finally {
      session?.dispose();
      setRunningTenSeconds(false);
    }
  };

  const askAssistant = () => {
    if (!scriptError || !scriptKey) return;
    const prompt = `Help fix this game script error. Scene: ${scriptKey.sceneId}. Entity: ${scriptKey.entityId}. Behavior index: ${scriptKey.index}. Tick: ${scriptError.tick}. Error: ${scriptError.message}`;
    if (assistantThreadId) useChatDraftStore.getState().setDraft(assistantThreadId, prompt);
    else pendingAssistantPromptRef.current = prompt;
    setAssistantOpen(true);
  };

  const publish = async () => {
    if (!data || !document) return;
    const validation = validateGame(document);
    if (!validation.valid) {
      setError(validation.errors.join("; "));
      return;
    }
    setSaving(true);
    try {
      await flushDraft();
      await trpcClient.games.publish.mutate({ id: refId, baseRevision: data.game.revision,
        message: publishMessage.trim() || undefined });
      await queries.games.getDraft.invalidate({ id: refId });
      await queries.games.revisions.invalidate({ id: refId });
      await queries.games.draftChanges.invalidate({ id: refId });
      setPublishOpen(false);
      setPublishMessage("");
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const moveEntity = (id: string, x: number, y: number) => {
    const scene = document?.scenes.find((entry) => entry.entities.some((entity) => entity.id === id));
    if (scene) onOps([{ op: "update_entity", entity_id: id, scene_id: scene.id, set: { transform2d: { x, y } } }]);
  };

  const transformEntity = (id: string, set: { scaleX?: number; scaleY?: number; rotation?: number }) => {
    const scene = document?.scenes.find((entry) => entry.entities.some((entity) => entity.id === id));
    if (scene) onOps([{ op: "update_entity", entity_id: id, scene_id: scene.id, set: { transform2d: set } }]);
  };

  const transformLight = (sceneId: string, index: number, set: { x?: number; y?: number; radius?: number }) => {
    onOps([{ op: "update_light", scene_id: sceneId, index, set }]);
  };

  const onViewportKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!active || !document) return;
    if (playDocument) {
      if (pressGameKey(keysRef.current, newlyPressedRef.current, event.code, event.key, playDocument.inputActions)) {
        event.preventDefault();
      }
      return;
    }
    if (event.code === "Home") {
      event.preventDefault();
      resetCamera();
      return;
    }
    const command = event.metaKey || event.ctrlKey;
    if (command && event.code === "KeyZ") {
      event.preventDefault();
      if (event.shiftKey) getGameDraftStore(refId).getState().redo();
      else getGameDraftStore(refId).getState().undo();
      return;
    }
    if (command && event.code === "KeyC") {
      event.preventDefault();
      clipboardRef.current = document.scenes.flatMap((entry) => entry.entities)
        .filter((entry) => selectedIds.includes(entry.id)).map((entry) => structuredClone(entry));
      return;
    }
    if (command && event.code === "KeyV") {
      event.preventDefault();
      const sceneId = document.scenes.find((entry) => entry.entities.some((entity) => selectedIds.includes(entity.id)))?.id ?? document.entrySceneId;
      onOps(clipboardRef.current.map((entity) => ({ op: "add_entity", scene_id: sceneId,
        entity: { ...entity, id: crypto.randomUUID().replaceAll("-", ""),
          transform2d: { ...entity.transform2d, x: entity.transform2d.x + 0.25, y: entity.transform2d.y + 0.25 } } })));
      return;
    }
    const selectedId = selectedIds[0];
    const scene = document.scenes.find((entry) => entry.entities.some((entity) => entity.id === selectedId));
    const entity = scene?.entities.find((entry) => entry.id === selectedId);
    if (!entity || !scene) return;
    if (event.code === "KeyF") {
      event.preventDefault();
      onCamera({ x: entity.transform2d.x, y: entity.transform2d.y, zoom: frame?.camera.zoom ?? 1 });
      return;
    }
    if (command && event.code === "KeyD") {
      event.preventDefault();
      onOps([{ op: "duplicate_entity", entity_id: entity.id, scene_id: scene.id,
        new_id: crypto.randomUUID().replaceAll("-", ""), offset: { x: 0.25, y: 0.25 } }]);
      return;
    }
    const distance = event.shiftKey ? 2.5 : 0.25;
    const direction: Record<string, [number, number]> = {
      ArrowLeft: [-distance, 0], ArrowRight: [distance, 0],
      ArrowUp: [0, distance], ArrowDown: [0, -distance]
    };
    const delta = direction[event.code];
    if (delta) {
      event.preventDefault();
      moveEntity(entity.id, entity.transform2d.x + delta[0], entity.transform2d.y + delta[1]);
    } else if (event.code === "Delete" || event.code === "Backspace") {
      event.preventDefault();
      onOps([{ op: "remove_entity", entity_id: entity.id, scene_id: scene.id, children: "remove" }]);
    }
  };

  const activeScript = scriptKey && document?.scenes.find((scene) => scene.id === scriptKey.sceneId)
    ?.entities.find((entity) => entity.id === scriptKey.entityId);
  const scriptBehavior = activeScript?.behaviors[scriptKey?.index ?? -1];
  const validationIssues = document ? validateGame(document).issues : [];
  const runtimeEntity = runtimeEntities?.find((entity) => entity.id === selectedIds[0]) ?? null;

  if (isPending || (data && !document)) return <LoadingSpinner text="Loading game" />;
  if (loadError || !data || !document) {
    return <EmptyState variant="error" title="Could not load game" description={loadError?.message ?? "The game may have been deleted."} />;
  }

  return (
    <FlexColumn gap={SPACING.sm} sx={{ p: SPACING.md, height: "100%", minHeight: 0 }}>
      <GameToolbar
        name={data.game.name} playing={playing} playSession={Boolean(playDocument)} loading={backend === "Initializing"} saving={saving}
        saveStatus={saveStatus} tick={playState.tick} score={playState.score} won={playState.won} backend={backend}
        assistantOpen={assistantOpen}
        onPlay={beginPlay}
        onStop={stop}
        onStep={() => { if (playDocument) step(); }}
        onSave={save}
        onLoad={() => void load()}
        onPublish={() => setPublishOpen(true)}
        onAssistant={() => setAssistantOpen((current) => !current)}
      />
      {(error || draftError) && <FlexRow gap={SPACING.sm} align="center">
        <Caption color="error" role="alert">{error ?? draftError}</Caption>
        <ReportBugButton context={{ source: "panel-crash", summary: "Game editor failed", errorText: error ?? draftError ?? "" }} />
      </FlexRow>}
      {conflicts.items.length > 0 && <ConflictBanner conflicts={conflicts.items} onAccept={conflicts.accept} onDiscard={conflicts.discard} />}
      {needsPlayRestart && <Caption role="status">The draft changed. Stop and play again to apply it.</Caption>}
      <GameChanges gameId={refId} document={document} onOps={onOps} onHover={setHighlightedIds}
        onFocusMessage={(threadId, messageId) => {
          setFocusMessage({ threadId, messageId, requestId: ++focusRequestRef.current });
          setAssistantOpen(true);
        }} />
      <FlexRow gap={SPACING.sm} sx={{ flex: 1, minHeight: 0 }}>
        {!isMobile && <FlexColumn gap={SPACING.sm} sx={{ width: "20%", minWidth: 0, overflowY: "auto" }}>
          <GameSceneTree document={document} selectedIds={selectedIds} issues={validationIssues} scriptErrorEntityId={scriptError?.entityId}
            onSelect={(id, additive) => getGameDraftStore(refId).getState().select(id, additive)} onOps={onOps} />
          <Text>Revisions</Text>
          {revisions?.slice(0, 10).map((entry) => <FlexRow key={entry.revision} gap={SPACING.xs} align="center">
            <Caption>{entry.message || entry.revision.slice(0, 12)} · {new Date(entry.modifiedAt).toLocaleString()}{entry.current ? " · Current" : ""}</Caption>
            <EditorButton disabled={saving} onClick={async () => {
              const state = getGameDraftStore(refId).getState();
              if (!state.baseUpdatedAt) return;
              setSaving(true);
              try {
                await flushDraft();
                const fresh = getGameDraftStore(refId).getState();
                const result = await trpcClient.games.restoreDraft.mutate({ id: refId, baseUpdatedAt: fresh.baseUpdatedAt ?? "", revision: entry.revision });
                getGameDraftStore(refId).getState().load(result.document, result.game.draftUpdatedAt);
                loadedTokenRef.current = result.game.draftUpdatedAt;
                setError(null);
              } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
              finally { setSaving(false); }
            }}>Restore to draft</EditorButton>
          </FlexRow>)}
        </FlexColumn>}
        <FlexColumn gap={SPACING.sm} sx={{ flex: 1, minHeight: 0, minWidth: 0 }}>
          <GameViewport canvasRef={canvasRef} frame={frame} document={document} playing={Boolean(playDocument)} paused={Boolean(playDocument && !playing)} active={active} selectedIds={selectedIds} highlightedIds={highlightedIds}
            onSelect={(id, additive) => getGameDraftStore(refId).getState().select(id, additive)}
            onSelectMany={(ids, additive) => getGameDraftStore(refId).getState().selectMany(ids, additive)}
            onMove={moveEntity} onTransform={transformEntity} onLight={transformLight}
            onCamera={onCamera}
            onViewportAspect={onViewportAspect}
            onKeyDown={onViewportKeyDown}
            onKeyUp={(event) => keysRef.current.delete(event.code)}
            onBlur={() => { keysRef.current.clear(); newlyPressedRef.current.clear(); }} />
          {scriptKey && activeScript && scriptBehavior?.kind === "script" &&
            <FlexColumn sx={{ height: "35%", minHeight: 0 }}>
              <GameScriptPane key={`${scriptKey.sceneId}:${scriptKey.entityId}:${scriptKey.index}`} entityId={activeScript.id} entityName={activeScript.name} behaviorIndex={scriptKey.index}
                behavior={scriptBehavior} onClose={() => setScriptKey(null)}
                error={scriptError && (!scriptError.entityId || scriptError.entityId === activeScript.id) ? scriptError : null}
                onReplay={playDocument ? () => void replayBeforeError() : undefined}
                onAskAssistant={askAssistant}
                onRunTenSeconds={() => void runTenSeconds()} runningTenSeconds={runningTenSeconds} runSummary={runSummary}
                runEntityStats={runEntityStats}
                onChange={(source) => onOps([{ op: "set_script", entity_id: activeScript.id, scene_id: scriptKey.sceneId, index: scriptKey.index, source }])} />
            </FlexColumn>}
        </FlexColumn>
        {!isMobile && <FlexColumn sx={{ width: "25%", minWidth: 0, overflowY: "auto" }}>
          {playDocument && !playing && <GameRuntimeInspector tick={playState.tick} entity={runtimeEntity} />}
          <GameInspector document={document} selectedIds={selectedIds} issues={validationIssues} onOps={onOps}
            onEditScript={(sceneId, entityId, index) => setScriptKey({ sceneId, entityId, index })} />
        </FlexColumn>}
        {!isMobile && assistantOpen && <ResizableDock storageKey="game_assistant" ariaLabel="Resize game assistant">
          <GameAgentPanel gameId={refId} name={data.game.name} selectedEntityIds={selectedIds} behaviorIndex={scriptKey?.index} onThreadId={setAssistantThreadId} focusMessage={focusMessage} />
        </ResizableDock>}
      </FlexRow>
      {isMobile && <>
        {playDocument && !playing && <GameRuntimeInspector tick={playState.tick} entity={runtimeEntity} />}
        <GameSceneTree document={document} selectedIds={selectedIds} issues={validationIssues} scriptErrorEntityId={scriptError?.entityId}
          onSelect={(id, additive) => getGameDraftStore(refId).getState().select(id, additive)} onOps={onOps} />
        <GameInspector document={document} selectedIds={selectedIds} issues={validationIssues} onOps={onOps}
          onEditScript={(sceneId, entityId, index) => setScriptKey({ sceneId, entityId, index })} />
        <MobileBottomSheet open={assistantOpen} onClose={() => setAssistantOpen(false)} title="Game assistant" ariaLabel="Game assistant panel">
          <GameAgentPanel gameId={refId} name={data.game.name} selectedEntityIds={selectedIds} behaviorIndex={scriptKey?.index} onThreadId={setAssistantThreadId} focusMessage={focusMessage} />
        </MobileBottomSheet>
      </>}
      <Dialog open={publishOpen} onClose={() => setPublishOpen(false)} title="Publish game"
        onConfirm={() => void publish()} confirmText="Publish" isLoading={saving} showActions>
        <FlexColumn gap={SPACING.sm}>
          <Text>Changes since the last revision</Text>
          {changeEntries?.length ? changeEntries.map((entry) => <Caption key={entry.id}>{entry.summary}</Caption>) : <Caption>No saved changes</Caption>}
          <TextInput label="Revision message" value={publishMessage} onChange={(event) => setPublishMessage(event.target.value)} />
        </FlexColumn>
      </Dialog>
    </FlexColumn>
  );
};

export default GameEditor;
