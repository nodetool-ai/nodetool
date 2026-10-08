import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMediaQuery } from "@mui/material";
import { useStore } from "zustand";
import { useTheme } from "@mui/material/styles";
import type { GameDocument, GameEntity } from "@nodetool-ai/protocol/game.js";
import { createScriptedGameSession, validateGame, type AnyGameDocumentOp as GameDocumentOp } from "@nodetool-ai/game-runtime";

import { trpc, trpcClient } from "../../trpc/client";
import { useChatDraftStore } from "../../stores/ChatDraftStore";
import { useConflictStore } from "../../stores/ConflictStore";
import { flushGameDraft, pullGameDraft, reloadRejectedGameDraft } from "../../stores/game/draftSave";
import { mergeByUnits } from "../../stores/documentMerge";
import { registerDocumentSync } from "../../stores/documentSync";
import { getGameDraftStore, useGameDraft } from "../../stores/game/GameDraftStore";
import { useGamePanelLayoutStore } from "../../stores/game/useGamePanelLayoutStore";
import { diffAnyGameDocuments as diffGameDocuments } from "../../stores/game/diffAnyGameDocuments";
import { anyGameMergeAdapter as gameMergeAdapter } from "../../stores/game/anyMerge";
import { useDocumentConflicts } from "../../hooks/useDocumentConflicts";
import { Caption, CollapsibleSection, ConflictBanner, Dialog, EmptyState, FlexColumn, FlexRow, FONT_SIZE_SANS, Label, LoadingSpinner, MobileBottomSheet, SPACING, Text, TextInput } from "../ui_primitives";
import ReportBugButton from "../support/ReportBugButton";
import GameAgentPanel from "./panels/agent/GameAgentPanel";
import GameRevisions from "./panels/revisions/GameRevisions";
import GameDraftRecovery, { isMissingDraft } from "./GameDraftRecovery";
import { publishGameDraft } from "./gamePublish";
import GameChanges from "./panels/changes/GameChanges";
import GameAuthoringPreview from "./panels/authoring/GameAuthoringPreview";
import GameInspector from "./panels/inspector/GameInspector";
import GameSceneTree from "./panels/hierarchy/GameSceneTree";
import GameRuntimeInspector from "./panels/inspector/GameRuntimeInspector";
import GameScriptPane from "./panels/scripts/GameScriptPane";
import GameEditorShell from "./shell/GameEditorShell";
import { useGameScriptDiagnostics } from "./panels/scripts/useGameScriptDiagnostics";
import type { GameDiagnosticSession } from "./panels/scripts/gameScriptDiagnostics";
import GameViewport from "./viewport2d/GameViewport";
import { pastedEntities } from "./gameClipboard";
import { pressGameKey } from "./gameInputFrame";
import { EMPTY_INPUT, useGamePlaySession } from "./useGamePlaySession";
import { localTransform, selectionRoots, worldTransforms } from "./viewport2d/viewportGeometry";

interface GameEditorProps {
  refId: string;
  active: boolean;
}

async function openGameDiagnosticSession2D(document: GameDocument, signal: AbortSignal): Promise<GameDiagnosticSession> {
  signal.throwIfAborted();
  const session = await createScriptedGameSession(document, 1);
  if (signal.aborted) { session.dispose(); signal.throwIfAborted(); }
  return { step: () => session.step(EMPTY_INPUT), dispose: () => session.dispose() };
}

const LegacyGameEditor = ({ refId, active }: GameEditorProps) => {
  const { data, isPending, error: loadError } = trpc.games.getDraft.useQuery({ id: refId }, { staleTime: 15_000 });
  const { data: revisions } = trpc.games.revisions.useQuery({ id: refId }, { staleTime: 15_000 });
  const { data: changeEntries } = trpc.games.draftChanges.useQuery({ id: refId }, { staleTime: 5_000 });
  const queries = trpc.useUtils();
  const document = useGameDraft(refId, (state) => state.document?.schemaVersion === 3 ? null : state.document);
  const selectedIds = useGameDraft(refId, (state) => state.selectedIds);
  const saveStatus = useGameDraft(refId, (state) => state.saveStatus);
  const draftError = useGameDraft(refId, (state) => state.error);
  const conflicts = useDocumentConflicts("game", refId);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [editorSceneId, setEditorSceneId] = useState<string | null>(null);
  const activeSceneId = document?.scenes.some((scene) => scene.id === editorSceneId)
    ? editorSceneId : document?.entrySceneId ?? null;
  const { canvasRef, keysRef, newlyPressedRef, playing, playDocument, playState, backend, error, setError,
    scriptError: hostScriptError, frame, onViewportAspect, onCamera, resetCamera, step, beginPlay, stop,
    save, load, replayBeforeError, runtimeEntities } = useGamePlaySession({ refId, active, document,
      editorSceneId: activeSceneId ?? undefined, name: data?.game.name });
  const diagnostics = useGameScriptDiagnostics(document, openGameDiagnosticSession2D);
  const scriptError = diagnostics.error ?? hostScriptError;
  const layoutStore = useGamePanelLayoutStore();
  const assistantOpen = useStore(layoutStore, (state) => !state.layout.hidden.includes("assistant"));
  const sceneTreeOpen = useStore(layoutStore, (state) => !state.layout.hidden.includes("hierarchy") || !state.layout.hidden.includes("revisions"));
  const inspectorOpen = useStore(layoutStore, (state) => !state.layout.hidden.includes("inspector"));
  const [focusMessage, setFocusMessage] = useState<{ threadId: string; messageId: string; requestId: number } | null>(null);
  const focusRequestRef = useRef(0);
  const [assistantThreadId, setAssistantThreadId] = useState<string | null>(null);
  const pendingAssistantPromptRef = useRef<string | null>(null);
  const publishFlight = useRef<Promise<void> | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishMessage, setPublishMessage] = useState("");
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
  const [scriptKey, setScriptKey] = useState<{ sceneId: string; entityId: string; index: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const loadedTokenRef = useRef<string | null>(null);
  const clipboardRef = useRef<GameEntity[]>([]);
  const savingPromiseRef = useRef<Promise<void> | null>(null);
  const playDraftOps = useMemo(() => playDocument && document ? diffGameDocuments(playDocument, document) : [], [playDocument, document]);
  const documentValidation = useMemo(() => document ? validateGame(document) : null, [document]);
  const needsPlayRestart = playDraftOps.some((op) => Boolean(playDocument?.authoring) || op.op !== "bind_asset" && op.op !== "unbind_asset");

  const selectScene = (sceneId: string) => {
    setEditorSceneId(sceneId);
    getGameDraftStore(refId).getState().selectMany([]);
  };

  const selectEntity = (id: string, additive: boolean) => {
    const scene = document?.scenes.find((item) => item.entities.some((entity) => entity.id === id));
    if (scene) setEditorSceneId(scene.id);
    getGameDraftStore(refId).getState().select(id, additive);
  };

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
    const pull = (): Promise<void> => pullGameDraft(savingPromiseRef, async () => {
      const server = await trpcClient.games.getDraft.query({ id: refId });
      const store = getGameDraftStore(refId);
      const state = store.getState();
      if (server.game.draftUpdatedAt === state.baseUpdatedAt) return;
      if (!state.document || !state.savedDocument || state.pendingOps.length === 0) {
        state.load(server.document, server.game.draftUpdatedAt);
      } else {
        const merged = mergeByUnits(state.savedDocument, state.document, server.document, gameMergeAdapter(server.document),
          { mergeWithoutOps: true });
        state.applyMerged(merged.doc, server.document, server.game.draftUpdatedAt);
        useConflictStore.getState().addConflicts(`game:${refId}`, merged.conflicts, {
          onAccept: (unitId) => {
            const conflict = merged.conflicts.find((entry) => entry.unit.id === unitId);
            if (!conflict) return;
            store.getState().acceptConflict(server.document, conflict.unit.kind, unitId);
          },
          onDiscard: () => undefined
        });
      }
      loadedTokenRef.current = server.game.draftUpdatedAt;
    });
    return registerDocumentSync("game", refId, {
      localRevision: () => getGameDraftStore(refId).getState().baseUpdatedAt,
      isDirty: () => getGameDraftStore(refId).getState().pendingOps.length > 0,
      reload: () => { void pull().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause))); },
      merge: () => { void pull().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause))); }
    });
  }, [refId, setError]);

  const flushDraft = useCallback(async (): Promise<void> => {
    const save = async () => {
      const store = getGameDraftStore(refId);
      let retries = 0;
      while (store.getState().pendingOps.length > 0) {
        const state = store.getState();
        if (!state.baseUpdatedAt) return;
        const ops = state.captureSaveOps();
        state.setSaving(ops.length);
        try {
          const result = await trpcClient.games.saveDraft.mutate({ id: refId, baseUpdatedAt: state.baseUpdatedAt, ops });
          store.getState().acknowledge(result.document, result.game.draftUpdatedAt, ops.length);
          loadedTokenRef.current = result.game.draftUpdatedAt;
          retries = 0;
        } catch (cause) {
          if (isMissingDraft(cause)) {
            store.getState().failSave("Draft source unavailable. Export your local draft before restoring.");
            await queries.games.getDraft.invalidate({ id: refId });
            throw cause;
          }
          try {
            const server = await trpcClient.games.getDraft.query({ id: refId });
            const latest = store.getState();
            if (server.game.draftUpdatedAt !== latest.baseUpdatedAt && latest.document && latest.savedDocument) {
              const merged = mergeByUnits(latest.savedDocument, latest.document, server.document, gameMergeAdapter(server.document),
                { mergeWithoutOps: true });
              latest.applyMerged(merged.doc, server.document, server.game.draftUpdatedAt);
              loadedTokenRef.current = server.game.draftUpdatedAt;
              useConflictStore.getState().addConflicts(`game:${refId}`, merged.conflicts, {
                onAccept: (unitId) => {
                  const conflict = merged.conflicts.find((entry) => entry.unit.id === unitId);
                  if (conflict) { store.getState().acceptConflict(server.document, conflict.unit.kind, unitId); }
                },
                onDiscard: () => undefined
              });
              if (merged.conflicts.length > 0) throw new Error("Resolve draft conflicts before saving");
              if (++retries <= 3) continue;
            } else {
              reloadRejectedGameDraft(refId, state.baseUpdatedAt, server.document, server.game.draftUpdatedAt, cause);
            }
          } catch (recoveryError) {
            if (recoveryError instanceof Error && recoveryError.message === "Resolve draft conflicts before saving") {
              throw recoveryError;
            }
          }
          const message = cause instanceof Error ? cause.message : String(cause);
          store.getState().failSave(message);
          throw cause;
        }
      }
    };
    await flushGameDraft(savingPromiseRef, save);
  }, [refId, queries.games.getDraft]);

  useEffect(() => {
    if (saveStatus !== "unsaved" || conflicts.items.length > 0) return;
    const timer = window.setTimeout(() => { void flushDraft().catch(() => undefined); }, 500);
    return () => window.clearTimeout(timer);
  }, [flushDraft, saveStatus, document, conflicts.items.length]);

  const onOps = useCallback((ops: GameDocumentOp[]) => {
    getGameDraftStore(refId).getState().apply(ops);
  }, [refId]);

  const askAssistant = () => {
    if (!scriptError || !scriptKey) return;
    const prompt = `Help fix this game script error. Scene: ${scriptKey.sceneId}. Entity: ${scriptKey.entityId}. Behavior index: ${scriptKey.index}. Tick: ${scriptError.tick}. Error: ${scriptError.message}`;
    if (assistantThreadId) useChatDraftStore.getState().setDraft(assistantThreadId, prompt);
    else pendingAssistantPromptRef.current = prompt;
    layoutStore.getState().dispatch({ type: "reveal", panelId: "assistant" });
  };

  const restoreRevision = async (revision: string): Promise<void> => {
    const state = getGameDraftStore(refId).getState();
    if (!state.baseUpdatedAt) { return; }
    setSaving(true);
    try {
      await flushDraft();
      const fresh = getGameDraftStore(refId).getState();
      const result = await trpcClient.games.restoreDraft.mutate({ id: refId, baseUpdatedAt: fresh.baseUpdatedAt ?? "", revision });
      getGameDraftStore(refId).getState().load(result.document, result.game.draftUpdatedAt);
      loadedTokenRef.current = result.game.draftUpdatedAt;
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSaving(false); }
  };

  const publish = async () => {
    if (!data || !document) return;
    setSaving(true);
    try {
      await publishGameDraft({ id: refId, document, flight: publishFlight, message: publishMessage.trim(),
        flush: flushDraft, getDraft: () => getGameDraftStore(refId).getState(),
        fetchRevision: async () => (await trpcClient.games.get.query({ id: refId })).game.revision,
        publish: (request) => trpcClient.games.publish.mutate(request) });
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

  const beginGesture = (): number => getGameDraftStore(refId).getState().beginGesture();
  const endGesture = (id: number): void => getGameDraftStore(refId).getState().endGesture(id);
  const moveEntity = (id: string, x: number, y: number, gestureId?: number): void => {
    const scene = document?.scenes.find((entry) => entry.entities.some((entity) => entity.id === id));
    const entity = scene?.entities.find((entry) => entry.id === id);
    if (!scene || !entity) { return; }
    getGameDraftStore(refId).getState().apply([{ op: "update_entity", entity_id: id, scene_id: scene.id, set: { transform2d: { x, y } } }],
      { label: selectedIds.length > 1 ? "Move Selection" : `Move ${entity.name || entity.id}`, mergeKey: "move-selection", gestureId });
  };

  const moveEntities = (moves: readonly { id: string; x: number; y: number }[], gestureId?: number): void => {
    const targets = new Map<string, { sceneId: string; name: string }>();
    for (const scene of document?.scenes ?? []) {
      for (const entity of scene.entities) {
        if (!targets.has(entity.id)) { targets.set(entity.id, { sceneId: scene.id, name: entity.name || entity.id }); }
      }
    }
    const ops: GameDocumentOp[] = [];
    for (const move of moves) {
      const target = targets.get(move.id);
      if (target) { ops.push({ op: "update_entity", entity_id: move.id, scene_id: target.sceneId, set: { transform2d: { x: move.x, y: move.y } } }); }
    }
    if (!ops.length) { return; }
    const first = targets.get(moves[0].id);
    getGameDraftStore(refId).getState().apply(ops, { label: selectedIds.length > 1 ? "Move Selection" : `Move ${first?.name ?? moves[0].id}`,
      mergeKey: "move-selection", gestureId });
  };

  const transformEntity = (id: string, set: { scaleX?: number; scaleY?: number; rotation?: number }, gestureId?: number): void => {
    const scene = document?.scenes.find((entry) => entry.entities.some((entity) => entity.id === id));
    const entity = scene?.entities.find((entry) => entry.id === id);
    if (!scene || !entity) { return; }
    const action = set.rotation === undefined ? "Scale" : "Rotate";
    getGameDraftStore(refId).getState().apply([{ op: "update_entity", entity_id: id, scene_id: scene.id, set: { transform2d: set } }],
      { label: `${action} ${entity.name || entity.id}`, mergeKey: "transform-selection", gestureId });
  };

  const transformLight = (sceneId: string, index: number, set: { x?: number; y?: number; radius?: number }, gestureId?: number): void => {
    getGameDraftStore(refId).getState().apply([{ op: "update_light", scene_id: sceneId, index, set }],
      { label: set.radius === undefined ? "Move Light" : "Resize Light", mergeKey: "transform-light", gestureId });
  };

  const onEditorKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!active || !document) return;
    if (playDocument) return;
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
      const targetIds = document.scenes.find((entry) => entry.id === sceneId)?.entities.map((entity) => entity.id) ?? [];
      onOps(pastedEntities(clipboardRef.current, targetIds, () => crypto.randomUUID().replaceAll("-", ""))
        .map((entity) => ({ op: "add_entity", scene_id: sceneId, entity })));
      return;
    }
    const selectedId = selectedIds[0];
    const scene = document.scenes.find((entry) => entry.entities.some((entity) => entity.id === selectedId));
    const entity = scene?.entities.find((entry) => entry.id === selectedId);
    if (!entity || !scene) return;
    if (event.code === "KeyF") {
      event.preventDefault();
      const transforms = worldTransforms(scene);
      const selected = scene.entities.filter(entry => selectedIds.includes(entry.id)).flatMap(entry => {
        const transform = transforms.get(entry.id);
        return transform ? [transform] : [];
      });
      if (selected.length) onCamera({ x: selected.reduce((sum, entry) => sum + entry.x, 0) / selected.length,
        y: selected.reduce((sum, entry) => sum + entry.y, 0) / selected.length, zoom: frame?.camera.zoom ?? 1 });
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
      const transforms = worldTransforms(scene);
      onOps(selectionRoots(scene, selectedIds).flatMap(entry => {
        const world = transforms.get(entry.id);
        if (!world) return [];
        const local = localTransform(scene, entry.parentId, { ...world, x: world.x + delta[0], y: world.y + delta[1] }, transforms);
        return [{ op: "update_entity" as const, entity_id: entry.id, scene_id: scene.id, set: { transform2d: { x: local.x, y: local.y } } }];
      }));
    } else if (event.code === "Delete" || event.code === "Backspace") {
      event.preventDefault();
      onOps(selectionRoots(scene, selectedIds).map(entry => ({ op: "remove_entity", entity_id: entry.id, scene_id: scene.id, children: "remove" })));
    }
  };

  const onViewportKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>): void => {
    if (!active || !playDocument) return;
    if (pressGameKey(keysRef.current, newlyPressedRef.current, event.code, event.key, playDocument.inputActions)) {
      event.preventDefault();
    }
  };

  const activeScript = scriptKey && document?.scenes.find((scene) => scene.id === scriptKey.sceneId)
    ?.entities.find((entity) => entity.id === scriptKey.entityId);
  const scriptBehavior = activeScript?.behaviors[scriptKey?.index ?? -1];
  const validationIssues = documentValidation?.issues ?? [];
  const runtimeEntity = runtimeEntities?.find((entity) => entity.id === selectedIds[0]) ?? null;

  if (loadError?.data?.code === "PRECONDITION_FAILED") { return <GameDraftRecovery key={refId} refId={refId} />; }
  if (isPending || (data && !document)) return <LoadingSpinner text="Loading game" />;
  if (loadError || !data || !document) {
    return <EmptyState variant="error" title="Could not load game" description={loadError?.message ?? "The game may have been deleted."} />;
  }

  return <GameEditorShell layoutStore={layoutStore} dimension="2d"
    toolbar={{
        name: data.game.name,
        playing: playing,
        playSession: Boolean(playDocument),
        loading: backend === "Initializing",
        saving: saving,
        saveStatus: saveStatus,
        assistantOpen: assistantOpen,
        sceneTreeOpen: sceneTreeOpen,
        inspectorOpen: inspectorOpen,
        playHref: `/game/${encodeURIComponent(refId)}`,
        onPlay: beginPlay,
        onStop: stop,
        onStep: () => { if (playDocument) step(); },
        onSave: save,
        onLoad: () => void load(),
        onPublish: () => setPublishOpen(true),
        onAssistant: () => layoutStore.getState().togglePanels(["assistant"]),
        onSceneTree: () => layoutStore.getState().togglePanels(["hierarchy", "revisions"]),
        onInspector: () => layoutStore.getState().togglePanels(["inspector"])
    }}
    status={{ tick: playState.tick, score: playState.score, won: playState.won, backend }}
    notices={<>
      {(error || draftError) && <FlexRow gap={SPACING.sm} align="center" sx={{ px: SPACING.md, py: SPACING.xs, borderBottom: 1, borderColor: "divider" }}>
        <Caption color="error" role="alert">{error ?? draftError}</Caption>
        <ReportBugButton context={{ source: "panel-crash", summary: "Game editor failed", errorText: error ?? draftError ?? "" }} />
      </FlexRow>}
      {conflicts.items.length > 0 && <ConflictBanner conflicts={conflicts.items} onAccept={conflicts.accept} onDiscard={conflicts.discard} />}
      {needsPlayRestart && <Caption role="status" sx={{ px: SPACING.md, py: SPACING.xs }}>The draft changed. Stop and play again to apply it.</Caption>}
      <GameAuthoringPreview key={refId} gameId={refId} document={document} flush={flushDraft} onHighlight={setHighlightedIds} />
      <GameChanges gameId={refId} document={document} onOps={onOps} onHover={setHighlightedIds}
        onFocusMessage={(threadId, messageId) => {
          setFocusMessage({ threadId, messageId, requestId: ++focusRequestRef.current });
          layoutStore.getState().dispatch({ type: "reveal", panelId: "assistant" });
        }} />
    </>}
    panels={[
      { id: "hierarchy", visible: !isMobile, keyboardScope: true,
        node: <>
          <GameSceneTree document={document} selectedIds={selectedIds} activeSceneId={activeSceneId ?? document.entrySceneId}
            issues={validationIssues} scriptErrorEntityId={scriptError?.entityId}
            onSelect={selectEntity} onSelectScene={selectScene} onOps={onOps} />
        </> },
      { id: "revisions", visible: !isMobile,
        node: <>
          <CollapsibleSection title={<Label component="span" sx={{ mb: 0 }}>Revisions</Label>} compact defaultOpen={false}
            sx={{ flexShrink: 0, maxHeight: "30%", overflowY: "auto", px: SPACING.md,
              "& > [role='button'] > svg": { fontSize: FONT_SIZE_SANS.body } }}>
          <GameRevisions revisions={revisions ?? []} busy={saving} onRestore={restoreRevision} />
          </CollapsibleSection>
        </> },
      { id: "viewport", keyboardScope: true, node: <>
          <GameViewport canvasRef={canvasRef} frame={frame} document={document}
            sceneId={playDocument ? playState.sceneId || playDocument.entrySceneId : activeSceneId ?? document.entrySceneId}
            playing={Boolean(playDocument)} paused={Boolean(playDocument && !playing)} active={active} selectedIds={selectedIds} highlightedIds={highlightedIds}
            onSelect={selectEntity}
            onSelectMany={(ids, additive) => getGameDraftStore(refId).getState().selectMany(ids, additive)}
            onMove={moveEntity} onMoves={moveEntities} onTransform={transformEntity} onLight={transformLight}
            onGestureStart={beginGesture} onGestureEnd={endGesture}
            onCamera={onCamera}
            onViewportAspect={onViewportAspect}
            onKeyDown={onViewportKeyDown}
            onKeyUp={(event) => keysRef.current.delete(event.code)}
            onBlur={() => { keysRef.current.clear(); newlyPressedRef.current.clear(); }} />
      </> },
      { id: "scripts", visible: Boolean(scriptKey && activeScript && scriptBehavior?.kind === "script"),
        node: scriptKey && activeScript && scriptBehavior?.kind === "script" ? <>
              <GameScriptPane key={`${scriptKey.sceneId}:${scriptKey.entityId}:${scriptKey.index}`} entityId={activeScript.id} entityName={activeScript.name} behaviorIndex={scriptKey.index}
                behavior={scriptBehavior} onClose={() => { setScriptKey(null); layoutStore.getState().dispatch({ type: "hide", panelId: "scripts" }); }}
                error={scriptError && (!scriptError.entityId || scriptError.entityId === activeScript.id) ? scriptError : null}
                onReplay={playDocument && scriptError ? () => void replayBeforeError(scriptError) : undefined}
                onAskAssistant={askAssistant}
                onRunTenSeconds={() => void diagnostics.run()} runningTenSeconds={diagnostics.running} runSummary={diagnostics.summary}
                runEntityStats={diagnostics.byEntity}
                onChange={(source) => onOps([{ op: "set_script", entity_id: activeScript.id, scene_id: scriptKey.sceneId, index: scriptKey.index, source }])} />
        </> : null },
      { id: "inspector", visible: !isMobile,
        node: <>
          {playDocument && !playing && <GameRuntimeInspector tick={playState.tick} entity={runtimeEntity} />}
          <GameInspector document={document} selectedIds={selectedIds} activeSceneId={activeSceneId ?? document.entrySceneId}
            onSceneChange={selectScene} issues={validationIssues} onOps={onOps}
            onEditScript={(sceneId, entityId, index) => { setScriptKey({ sceneId, entityId, index }); layoutStore.getState().dispatch({ type: "reveal", panelId: "scripts" }); }} />
        </> },
      { id: "assistant", visible: !isMobile,
        node: <>
          <GameAgentPanel gameId={refId} name={data.game.name} selectedEntityIds={selectedIds} behaviorIndex={scriptKey?.index} onThreadId={setAssistantThreadId} focusMessage={focusMessage} />
        </> }
    ]}
    onKeyDown={onEditorKeyDown}
    mobile={<>
      {isMobile && <>
        {playDocument && !playing && <GameRuntimeInspector tick={playState.tick} entity={runtimeEntity} />}
        <GameSceneTree document={document} selectedIds={selectedIds} activeSceneId={activeSceneId ?? document.entrySceneId}
          issues={validationIssues} scriptErrorEntityId={scriptError?.entityId}
          onSelect={selectEntity} onSelectScene={selectScene} onOps={onOps} />
        <GameInspector document={document} selectedIds={selectedIds} activeSceneId={activeSceneId ?? document.entrySceneId}
          onSceneChange={selectScene} issues={validationIssues} onOps={onOps}
          onEditScript={(sceneId, entityId, index) => { setScriptKey({ sceneId, entityId, index }); layoutStore.getState().dispatch({ type: "reveal", panelId: "scripts" }); }} />
        <MobileBottomSheet open={assistantOpen} onClose={() => layoutStore.getState().dispatch({ type: "hide", panelId: "assistant" })} title="Game assistant" ariaLabel="Game assistant panel">
          <GameAgentPanel gameId={refId} name={data.game.name} selectedEntityIds={selectedIds} behaviorIndex={scriptKey?.index} onThreadId={setAssistantThreadId} focusMessage={focusMessage} />
        </MobileBottomSheet>
      </>}
    </>}
    dialogs={<>
      <Dialog open={publishOpen} onClose={() => setPublishOpen(false)} title="Publish game"
        onConfirm={() => void publish()} confirmText="Publish" isLoading={saving} showActions>
        <FlexColumn gap={SPACING.sm}>
          <Text>Changes since the last revision</Text>
          {changeEntries?.length ? changeEntries.map((entry) => <Caption key={entry.id}>{entry.summary}</Caption>) : <Caption>No saved changes</Caption>}
          <TextInput label="Revision message" value={publishMessage} onChange={(event) => setPublishMessage(event.target.value)} />
        </FlexColumn>
      </Dialog>
    </>}
  />;
};

const Editor3D = lazy(() => import("./GameEditor3D"));

export default function GameEditor(props: GameEditorProps) {
  const { data } = trpc.games.getDraft.useQuery({ id: props.refId }, { staleTime: 15_000 });
  return data?.document.schemaVersion === 3
    ? <Suspense fallback={<LoadingSpinner text="Loading 3D editor" />}><Editor3D {...props} /></Suspense>
    : <LegacyGameEditor {...props} />;
}
