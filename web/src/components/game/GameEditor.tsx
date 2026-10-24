import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMediaQuery } from "@mui/material";
import { useStore } from "zustand";
import { useTheme } from "@mui/material/styles";
import type { GameDocument, GameEntity } from "@nodetool-ai/protocol/game.js";
import { createScriptedGameSession, validateGame, type AnyGameDocumentOp as GameDocumentOp } from "@nodetool-ai/game-runtime";

import { trpc, trpcClient } from "../../trpc/client";
import { useConflictStore } from "../../stores/ConflictStore";
import { absorbServerGameDraft, captureGameDraftBatch, flushGameDraft, isRejectedGameSave, pullGameDraft } from "../../stores/game/draftSave";
import { mergeByUnits } from "../../stores/documentMerge";
import { registerDocumentSync } from "../../stores/documentSync";
import { getGameDraftStore, useGameDraft, type GameEntityTarget } from "../../stores/game/GameDraftStore";
import { useGamePanelLayoutStore } from "../../stores/game/useGamePanelLayoutStore";
import { diffAnyGameDocuments as diffGameDocuments } from "../../stores/game/diffAnyGameDocuments";
import { anyGameMergeAdapter as gameMergeAdapter } from "../../stores/game/anyMerge";
import { useDocumentConflicts } from "../../hooks/useDocumentConflicts";
import { Caption, ConflictBanner, Dialog, EmptyState, FlexColumn, LoadingSpinner, MobileBottomSheet, SPACING, Text, TextInput, type DocumentBarRender } from "../ui_primitives";
import ErrorBanner from "../support/ErrorBanner";
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
import GameAssetBrowser from "./panels/assets/GameAssetBrowser";
import GameEditorShell, { withGameDocumentBar } from "./shell/GameEditorShell";
import type { GameCommandHandler, GameCommandHandlers } from "./shell/gameCommands";
import { useGameAssistantDraft } from "./panels/agent/useGameAssistantDraft";
import GameConsolePanel from "./panels/console/GameConsolePanel";
import { gameValidationConsoleEntries } from "./panels/console/gameConsoleModel";
import { useGameConsoleFeed } from "./panels/console/useGameConsoleFeed";
import GameProfilerPanel from "./panels/profiler/GameProfilerPanel";
import { gamePlaytestPrompt, gameScriptErrorPrompt, gameSelectionPrompt } from "./gameAssistantPrompt";
import { useGameScriptDiagnostics } from "./panels/scripts/useGameScriptDiagnostics";
import type { GameDiagnosticSession } from "./panels/scripts/gameScriptDiagnostics";
import GameViewport from "./viewport2d/GameViewport";
import { pastedEntities } from "./gameClipboard";
import { EMPTY_INPUT, useGamePlaySession } from "./useGamePlaySession";
import { localTransform, selectionRoots, worldTransforms } from "./viewport2d/viewportGeometry";

interface GameEditorProps {
  refId: string;
  active: boolean;
  /** Draws the workspace document bar in place of the editor's title row. */
  documentBar?: DocumentBarRender;
}

async function openGameDiagnosticSession2D(document: GameDocument, signal: AbortSignal): Promise<GameDiagnosticSession> {
  signal.throwIfAborted();
  const session = await createScriptedGameSession(document, 1);
  if (signal.aborted) { session.dispose(); signal.throwIfAborted(); }
  return { step: () => session.step(EMPTY_INPUT), dispose: () => session.dispose() };
}

const LegacyGameEditor = ({ refId, active, documentBar }: GameEditorProps) => {
  const { t } = useTranslation();
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
  const editorSceneId = useGameDraft(refId, (state) => state.selectedSceneId);
  const activeSceneId = document?.scenes.some((scene) => scene.id === editorSceneId)
    ? editorSceneId : document?.entrySceneId ?? null;
  const { canvasRef, inputRef, playing, playDocument, playState, backend, error, setError,
    scriptError: hostScriptError, frame, onViewportAspect, onCamera, resetCamera, step, beginPlay, restart, stop,
    save, load, replayBeforeError, runtimeEntities, scriptLogs, profiler } = useGamePlaySession({ refId, active, document,
      editorSceneId: activeSceneId ?? undefined, name: data?.game.name });
  const viewportSceneId = playDocument ? playState.sceneId || playDocument.entrySceneId : activeSceneId;
  const diagnostics = useGameScriptDiagnostics(document, openGameDiagnosticSession2D);
  const scriptError = diagnostics.error ?? hostScriptError;
  useGameConsoleFeed(refId, { runtimeError: error, scriptError: hostScriptError, diagnosticError: diagnostics.error, tick: playState.tick, scriptLogs });
  const layoutStore = useGamePanelLayoutStore();
  const assistant = useGameAssistantDraft(layoutStore);
  const canUndo = useStore(getGameDraftStore(refId), (state) => state.canUndo);
  const canRedo = useStore(getGameDraftStore(refId), (state) => state.canRedo);
  const assistantOpen = useStore(layoutStore, (state) => !state.layout.hidden.includes("assistant"));
  const sceneTreeOpen = useStore(layoutStore, (state) => !state.layout.hidden.includes("hierarchy") || !state.layout.hidden.includes("revisions"));
  const inspectorOpen = useStore(layoutStore, (state) => !state.layout.hidden.includes("inspector"));
  const [focusMessage, setFocusMessage] = useState<{ threadId: string; messageId: string; requestId: number } | null>(null);
  const focusRequestRef = useRef(0);
  const publishFlight = useRef<Promise<void> | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishMessage, setPublishMessage] = useState("");
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
  const [scriptKey, setScriptKey] = useState<{ sceneId: string; entityId: string; index: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const loadedTokenRef = useRef<string | null>(null);
  const clipboardRef = useRef<{ sceneId: string; entities: GameEntity[] } | null>(null);
  const savingPromiseRef = useRef<Promise<void> | null>(null);
  const playDraftOps = useMemo(() => playDocument && document ? diffGameDocuments(playDocument, document) : [], [playDocument, document]);
  const documentValidation = useMemo(() => document ? validateGame(document) : null, [document]);
  const consoleValidation = useMemo(() => document && documentValidation ? gameValidationConsoleEntries(documentValidation.issues, document) : [],
    [document, documentValidation]);
  const needsPlayRestart = playDraftOps.some((op) => Boolean(playDocument?.authoring) || op.op !== "bind_asset" && op.op !== "unbind_asset");

  const currentScene = (sceneId: string | null) => {
    const current = getGameDraftStore(refId).getState().document;
    return current && current.schemaVersion !== 3 ? current.scenes.find((scene) => scene.id === sceneId) : undefined;
  };

  const selectScene = (sceneId: string) => {
    if (!currentScene(sceneId)) { return; }
    getGameDraftStore(refId).getState().selectMany({ sceneId, entityIds: [] });
  };

  const selectEntity = (target: GameEntityTarget, additive: boolean) => {
    if (!currentScene(target.sceneId)?.entities.some((entity) => entity.id === target.entityId)) { return; }
    getGameDraftStore(refId).getState().select(target, additive);
  };

  useEffect(() => {
    if (!data || loadedTokenRef.current === data.game.draftUpdatedAt) return;
    const store = getGameDraftStore(refId);
    if (store.getState().pendingOps.length > 0) return;
    store.getState().load(data.document, data.game.draftUpdatedAt);
    loadedTokenRef.current = data.game.draftUpdatedAt;
  }, [data, refId]);

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
        const batch = captureGameDraftBatch(refId);
        if (!batch) return;
        state.setSaving(batch.count);
        try {
          const result = "document" in batch
            ? await trpcClient.games.saveDraftDocument.mutate({ id: refId, baseUpdatedAt: state.baseUpdatedAt, document: batch.document })
            : await trpcClient.games.saveDraft.mutate({ id: refId, baseUpdatedAt: state.baseUpdatedAt, ops: batch.ops });
          store.getState().acknowledge(result.document, result.game.draftUpdatedAt, batch.count);
          loadedTokenRef.current = result.game.draftUpdatedAt;
          retries = 0;
        } catch (cause) {
          if (isMissingDraft(cause)) {
            store.getState().failSave(t("game.editor.errors.draftSourceUnavailable"));
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
              if (merged.conflicts.length > 0) throw new Error(t("game.editor.errors.resolveConflictsBeforeSaving"));
              if (++retries <= 3) continue;
            }
          } catch (recoveryError) {
            if (recoveryError instanceof Error && recoveryError.message === t("game.editor.errors.resolveConflictsBeforeSaving")) {
              throw recoveryError;
            }
          }
          if ("ops" in batch && isRejectedGameSave(cause)) {
            store.getState().requireDocumentSave();
            continue;
          }
          const message = cause instanceof Error ? cause.message : String(cause);
          store.getState().failSave(message);
          throw cause;
        }
      }
    };
    await flushGameDraft(savingPromiseRef, save);
  }, [refId, queries.games.getDraft, t]);

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
    assistant.draft(gameScriptErrorPrompt(scriptKey, scriptError));
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

  // A generation runs for minutes while the user keeps editing and autosave keeps saving, so the
  // server binds onto whatever draft is current and the result is merged in, never loaded over.
  const serverAssetEdit = async (edit: () => Promise<unknown>): Promise<void> => {
    await edit();
    await pullGameDraft(savingPromiseRef, async () => {
      absorbServerGameDraft(refId, await trpcClient.games.getDraft.query({ id: refId }));
      loadedTokenRef.current = getGameDraftStore(refId).getState().baseUpdatedAt;
    });
    await queries.games.draftChanges.invalidate({ id: refId });
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
    const scene = currentScene(activeSceneId);
    const entity = scene?.entities.find((entry) => entry.id === id);
    if (!scene || !entity) { return; }
    getGameDraftStore(refId).getState().apply([{ op: "update_entity", entity_id: id, scene_id: scene.id, set: { transform2d: { x, y } } }],
      { label: selectedIds.length > 1 ? t("game.editor.actions.moveSelection") : t("game.editor.actions.moveEntity", { name: entity.name || entity.id }), mergeKey: "move-selection", gestureId });
  };

  const moveEntities = (moves: readonly { id: string; x: number; y: number }[], gestureId?: number): void => {
    const targets = new Map<string, { sceneId: string; name: string }>();
    const scene = currentScene(activeSceneId);
    if (scene) {
      for (const entity of scene.entities) { targets.set(entity.id, { sceneId: scene.id, name: entity.name || entity.id }); }
    }
    const ops: GameDocumentOp[] = [];
    for (const move of moves) {
      const target = targets.get(move.id);
      if (target) { ops.push({ op: "update_entity", entity_id: move.id, scene_id: target.sceneId, set: { transform2d: { x: move.x, y: move.y } } }); }
    }
    if (!ops.length) { return; }
    const first = targets.get(moves[0].id);
    getGameDraftStore(refId).getState().apply(ops, { label: selectedIds.length > 1 ? t("game.editor.actions.moveSelection") : t("game.editor.actions.moveEntity", { name: first?.name ?? moves[0].id }),
      mergeKey: "move-selection", gestureId });
  };

  const transformEntity = (id: string, set: { scaleX?: number; scaleY?: number; rotation?: number }, gestureId?: number): void => {
    const scene = currentScene(activeSceneId);
    const entity = scene?.entities.find((entry) => entry.id === id);
    if (!scene || !entity) { return; }
    const action = set.rotation === undefined ? t("game.editor.actions.scale") : t("game.editor.actions.rotate");
    getGameDraftStore(refId).getState().apply([{ op: "update_entity", entity_id: id, scene_id: scene.id, set: { transform2d: set } }],
      { label: t("game.editor.actions.transformEntity", { action, name: entity.name || entity.id }), mergeKey: "transform-selection", gestureId });
  };

  const transformLight = (sceneId: string, index: number, set: { x?: number; y?: number; radius?: number }, gestureId?: number): void => {
    getGameDraftStore(refId).getState().apply([{ op: "update_light", scene_id: sceneId, index, set }],
      { label: set.radius === undefined ? t("game.editor.actions.moveLight") : t("game.editor.actions.resizeLight"), mergeKey: "transform-light", gestureId });
  };

  const selectedScene = document?.scenes.find((entry) => entry.id === activeSceneId);
  const selectedEntity = selectedScene?.entities.find((entry) => entry.id === selectedIds[0]);
  const editable = Boolean(active && document && !playDocument);
  const editingSelection = editable && Boolean(selectedEntity && selectedScene);

  const frameSelection = (): void => {
    if (!selectedScene) { return; }
    const transforms = worldTransforms(selectedScene);
    const selected = selectedScene.entities.filter(entry => selectedIds.includes(entry.id)).flatMap(entry => {
      const transform = transforms.get(entry.id);
      return transform ? [transform] : [];
    });
    if (selected.length) onCamera({ x: selected.reduce((sum, entry) => sum + entry.x, 0) / selected.length,
      y: selected.reduce((sum, entry) => sum + entry.y, 0) / selected.length, zoom: frame?.camera.zoom ?? 1 });
  };

  const copySelection = (): void => {
    if (!selectedScene) { return; }
    clipboardRef.current = { sceneId: selectedScene.id,
      entities: selectedScene.entities.filter((entry) => selectedIds.includes(entry.id)).map((entry) => structuredClone(entry)) };
  };

  const paste = (): void => {
    const clipboard = clipboardRef.current;
    const scene = document?.scenes.find((entry) => entry.id === activeSceneId);
    if (!scene || !clipboard) { return; }
    const targetIds = clipboard.sceneId === scene.id ? scene.entities.map((entity) => entity.id) : [];
    onOps(pastedEntities(clipboard.entities, targetIds, () => crypto.randomUUID().replaceAll("-", ""))
      .map((entity) => ({ op: "add_entity", scene_id: scene.id, entity })));
  };

  const nudge = (dx: number, dy: number): GameCommandHandler => ({ enabled: editingSelection, run: () => {
    if (!selectedScene) { return; }
    const transforms = worldTransforms(selectedScene);
    onOps(selectionRoots(selectedScene, selectedIds).flatMap(entry => {
      const world = transforms.get(entry.id);
      if (!world) return [];
      const local = localTransform(selectedScene, entry.parentId, { ...world, x: world.x + dx, y: world.y + dy }, transforms);
      return [{ op: "update_entity" as const, entity_id: entry.id, scene_id: selectedScene.id, set: { transform2d: { x: local.x, y: local.y } } }];
    }));
  } });

  const selectedEntities = selectedScene?.entities.filter((entry) => selectedIds.includes(entry.id)) ?? [];
  const editorCommands: GameCommandHandlers = {
    "edit.undo": { run: () => getGameDraftStore(refId).getState().undo(), enabled: editable && canUndo },
    "edit.redo": { run: () => getGameDraftStore(refId).getState().redo(), enabled: editable && canRedo },
    "view.resetCamera": { run: resetCamera, enabled: editable },
    "edit.copy": { run: copySelection, enabled: editable && selectedIds.length > 0 },
    "edit.paste": { run: paste, enabled: editable },
    "view.frameSelection": { run: frameSelection, enabled: editingSelection },
    "edit.duplicate": { enabled: editingSelection, run: () => {
      if (!selectedEntity || !selectedScene) { return; }
      onOps([{ op: "duplicate_entity", entity_id: selectedEntity.id, scene_id: selectedScene.id,
        new_id: crypto.randomUUID().replaceAll("-", ""), offset: { x: 0.25, y: 0.25 } }]);
    } },
    "edit.delete": { enabled: editingSelection, run: () => {
      if (!selectedScene) { return; }
      onOps(selectionRoots(selectedScene, selectedIds).map(entry => ({ op: "remove_entity", entity_id: entry.id, scene_id: selectedScene.id, children: "remove" })));
    } },
    "edit.nudgeLeft": nudge(-0.25, 0), "edit.nudgeRight": nudge(0.25, 0), "edit.nudgeUp": nudge(0, 0.25), "edit.nudgeDown": nudge(0, -0.25),
    "edit.nudgeLeftFar": nudge(-2.5, 0), "edit.nudgeRightFar": nudge(2.5, 0), "edit.nudgeUpFar": nudge(0, 2.5), "edit.nudgeDownFar": nudge(0, -2.5),
    "assistant.playtest": { run: () => assistant.draft(gamePlaytestPrompt()) },
    "assistant.explainSelection": { run: () => assistant.draft(gameSelectionPrompt(selectedEntities)), enabled: selectedEntities.length > 0 },
    "assistant.fixScriptError": { run: askAssistant, enabled: Boolean(scriptError && scriptKey) }
  };

  const onViewportKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>): void => {
    if (!active || !playDocument) return;
    if (inputRef.current.handlesKey(playDocument, event.code, event.key)) {
      inputRef.current.keyDown(event.code, event.key);
      event.preventDefault();
    }
  };

  const activeScript = scriptKey && document?.scenes.find((scene) => scene.id === scriptKey.sceneId)
    ?.entities.find((entity) => entity.id === scriptKey.entityId);
  const scriptBehavior = activeScript?.behaviors[scriptKey?.index ?? -1];
  const validationIssues = documentValidation?.issues ?? [];
  const runtimeEntity = playState.sceneId === activeSceneId ? runtimeEntities?.find((entity) => entity.id === selectedIds[0]) ?? null : null;

  if (loadError?.data?.code === "PRECONDITION_FAILED") { return withGameDocumentBar(documentBar, <GameDraftRecovery key={refId} refId={refId} />); }
  if (isPending || (data && !document)) return withGameDocumentBar(documentBar, <LoadingSpinner text={t("game.editor.loadingGame")} />);
  if (loadError || !data || !document) {
    return withGameDocumentBar(documentBar,
      <EmptyState variant="error" title={t("game.editor.loadError.title")} description={loadError?.message ?? t("game.editor.loadError.description")} />);
  }

  return <GameEditorShell layoutStore={layoutStore} dimension="2d" active={active} documentBar={documentBar}
    exportGame={{ id: refId, name: data.game.name }}
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
        canUndo: canUndo,
        canRedo: canRedo,
        onUndo: () => getGameDraftStore(refId).getState().undo(),
        onRedo: () => getGameDraftStore(refId).getState().redo(),
        onPlay: beginPlay,
        onRestart: restart,
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
      {(error || draftError) && <ErrorBanner sx={{ mx: SPACING.md, my: SPACING.xs }}
        report={{ source: "panel-crash", summary: t("game.editor.errors.editorFailed"), errorText: error ?? draftError ?? "" }}>
        {error ?? draftError}
      </ErrorBanner>}
      {conflicts.items.length > 0 && <ConflictBanner conflicts={conflicts.items} onAccept={conflicts.accept} onDiscard={conflicts.discard} />}
      {needsPlayRestart && <Caption role="status" sx={{ px: SPACING.md, py: SPACING.xs }}>{t("game.editor.draftChanged")}</Caption>}
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
        node: <GameRevisions revisions={revisions ?? []} busy={saving} onRestore={restoreRevision} /> },
      { id: "viewport", keyboardScope: true, node: <>
          <GameViewport canvasRef={canvasRef} frame={frame} document={document}
            sceneId={viewportSceneId ?? document.entrySceneId}
            playing={Boolean(playDocument)} paused={Boolean(playDocument && !playing)} active={active} selectedIds={selectedIds} highlightedIds={highlightedIds}
            onSelect={(id, additive) => { if (viewportSceneId) { selectEntity({ sceneId: viewportSceneId, entityId: id }, additive); } }}
            onSelectMany={(ids, additive) => { if (viewportSceneId && currentScene(viewportSceneId)) { getGameDraftStore(refId).getState().selectMany({ sceneId: viewportSceneId, entityIds: ids }, additive); } }}
            onMove={moveEntity} onMoves={moveEntities} onTransform={transformEntity} onLight={transformLight}
            onGestureStart={beginGesture} onGestureEnd={endGesture}
            onCamera={onCamera}
            onViewportAspect={onViewportAspect}
            onKeyDown={onViewportKeyDown}
            onKeyUp={(event) => inputRef.current.keyUp(event.code)}
            onBlur={() => inputRef.current.release()} />
      </> },
      { id: "scripts", visible: Boolean(scriptKey && activeScript && scriptBehavior?.kind === "script"),
        node: scriptKey && activeScript && scriptBehavior?.kind === "script" ? <>
              <GameScriptPane key={`${scriptKey.sceneId}:${scriptKey.entityId}:${scriptKey.index}`} entityId={activeScript.id} entityName={activeScript.name} behaviorIndex={scriptKey.index}
                behavior={scriptBehavior} onClose={() => { setScriptKey(null); layoutStore.getState().dispatch({ type: "hide", panelId: "scripts" }); }}
                error={scriptError && (!scriptError.entityId || scriptError.entityId === activeScript.id) ? scriptError : null}
                onReplay={playDocument && !diagnostics.error && hostScriptError ? () => void replayBeforeError(hostScriptError) : undefined}
                onAskAssistant={askAssistant}
                onRunTenSeconds={() => void diagnostics.run()} runningTenSeconds={diagnostics.running} runSummary={diagnostics.summary}
                runEntityStats={diagnostics.byEntity}
                onChange={(source) => onOps([{ op: "set_script", entity_id: activeScript.id, scene_id: scriptKey.sceneId, index: scriptKey.index, source }])} />
        </> : null },
      { id: "assets", visible: !isMobile,
        node: <GameAssetBrowser gameId={refId} document={document} runServerEdit={serverAssetEdit} onOps={onOps}
          onSelectEntity={(sceneId, entityId) => selectEntity({ sceneId, entityId }, false)} onAskAssistant={assistant.draft} /> },
      { id: "console", visible: !isMobile,
        node: <GameConsolePanel gameId={refId} document={document} liveEntries={consoleValidation}
          onSelectEntity={(sceneId, entityId) => selectEntity({ sceneId, entityId }, false)} onAskAssistant={assistant.draft} /> },
      { id: "profiler", visible: !isMobile,
        node: <GameProfilerPanel profiler={profiler} document={document}
          source={{ gameId: refId, name: data.game.name, dimension: "2d", tickRate: document.tickRate }} /> },
      { id: "inspector", visible: !isMobile,
        node: <>
          {playDocument && !playing && <GameRuntimeInspector tick={playState.tick} entity={runtimeEntity} />}
          <GameInspector document={document} selectedIds={selectedIds} activeSceneId={activeSceneId ?? document.entrySceneId}
            onSceneChange={selectScene} issues={validationIssues} onOps={onOps}
            onEditScript={(sceneId, entityId, index) => { setScriptKey({ sceneId, entityId, index }); layoutStore.getState().dispatch({ type: "reveal", panelId: "scripts" }); }} />
        </> },
      { id: "assistant", visible: !isMobile,
        node: <>
          <GameAgentPanel gameId={refId} name={data.game.name} selectedEntityIds={selectedIds} behaviorIndex={scriptKey?.index} onThreadId={assistant.onThreadId} focusMessage={focusMessage} />
        </> }
    ]}
    commands={editorCommands}
    mobile={<>
      {isMobile && <>
        {playDocument && !playing && <GameRuntimeInspector tick={playState.tick} entity={runtimeEntity} />}
        <GameSceneTree document={document} selectedIds={selectedIds} activeSceneId={activeSceneId ?? document.entrySceneId}
          issues={validationIssues} scriptErrorEntityId={scriptError?.entityId}
          onSelect={selectEntity} onSelectScene={selectScene} onOps={onOps} />
        <GameInspector document={document} selectedIds={selectedIds} activeSceneId={activeSceneId ?? document.entrySceneId}
          onSceneChange={selectScene} issues={validationIssues} onOps={onOps}
          onEditScript={(sceneId, entityId, index) => { setScriptKey({ sceneId, entityId, index }); layoutStore.getState().dispatch({ type: "reveal", panelId: "scripts" }); }} />
        <MobileBottomSheet open={assistantOpen} onClose={() => layoutStore.getState().dispatch({ type: "hide", panelId: "assistant" })} title={t("game.editor.assistant.title")} ariaLabel={t("game.editor.assistant.panelLabel")}>
          <GameAgentPanel gameId={refId} name={data.game.name} selectedEntityIds={selectedIds} behaviorIndex={scriptKey?.index} onThreadId={assistant.onThreadId} focusMessage={focusMessage} />
        </MobileBottomSheet>
      </>}
    </>}
    dialogs={<>
      <Dialog open={publishOpen} onClose={() => setPublishOpen(false)} title={t("game.editor.publish.title")}
        onConfirm={() => void publish()} confirmText={t("game.editor.publish.confirm")} isLoading={saving} showActions>
        <FlexColumn gap={SPACING.sm}>
          <Text>{t("game.editor.publish.changesSinceRevision")}</Text>
          {changeEntries?.length ? changeEntries.map((entry) => <Caption key={entry.id}>{entry.summary}</Caption>) : <Caption>{t("game.editor.publish.noSavedChanges")}</Caption>}
          <TextInput label={t("game.editor.publish.revisionMessage")} value={publishMessage} onChange={(event) => setPublishMessage(event.target.value)} />
        </FlexColumn>
      </Dialog>
    </>}
  />;
};

const Editor3D = lazy(() => import("./GameEditor3D"));

export default function GameEditor(props: GameEditorProps) {
  const { t } = useTranslation();
  const { data } = trpc.games.getDraft.useQuery({ id: props.refId }, { staleTime: 15_000 });
  return data?.document.schemaVersion === 3
    ? <Suspense fallback={withGameDocumentBar(props.documentBar, <LoadingSpinner text={t("game.editor.loading3dEditor")} />)}><Editor3D {...props} /></Suspense>
    : <LegacyGameEditor {...props} />;
}
