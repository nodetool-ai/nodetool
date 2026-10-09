import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import { useStore } from "zustand";
import { gameEntity3D, type GameDocument3D } from "@nodetool-ai/protocol";
import type { AnyGameDocumentOp } from "@nodetool-ai/game-runtime";
import { trpc, trpcClient } from "../../trpc/client";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { getGameDraftStore, useGameDraft } from "../../stores/game/GameDraftStore";
import { useGamePanelLayoutStore } from "../../stores/game/useGamePanelLayoutStore";
import { anyGameMergeAdapter } from "../../stores/game/anyMerge";
import { captureGameDraftBatch, flushGameDraft, isRejectedGameSave, pullGameDraft } from "../../stores/game/draftSave";
import { mergeByUnits } from "../../stores/documentMerge";
import { useConflictStore } from "../../stores/ConflictStore";
import { registerDocumentSync } from "../../stores/documentSync";
import { useDocumentConflicts } from "../../hooks/useDocumentConflicts";
import { Caption, CollapsibleSection, ConflictBanner, Dialog, EditorButton, EmptyState, FlexColumn, FlexRow, FONT_SIZE_SANS, Label, LoadingSpinner, SPACING, Text, TextInput } from "../ui_primitives";
import ReportBugButton from "../support/ReportBugButton";
import GameAgentPanel from "./panels/agent/GameAgentPanel";
import { publishGameDraft } from "./gamePublish";
import GameChanges from "./panels/changes/GameChanges";
import GameAuthoringPreview from "./panels/authoring/GameAuthoringPreview";
import GameHierarchy3D from "./panels/hierarchy/GameHierarchy3D";
import GameInspector3D from "./panels/inspector/GameInspector3D";
import GamePanelHeader from "./GamePanelHeader";
import GameScriptPane from "./panels/scripts/GameScriptPane";
import GameEditorShell from "./shell/GameEditorShell";
import GameRevisions from "./panels/revisions/GameRevisions";
import GameDraftRecovery, { isMissingDraft } from "./GameDraftRecovery";
import { useGameScriptDiagnostics } from "./panels/scripts/useGameScriptDiagnostics";
import type { GameDiagnosticSession } from "./panels/scripts/gameScriptDiagnostics";
import { openGameDiagnosticSession3D } from "./viewport3d/gameSessionAssets3D";
import { useGameAssistantDraft } from "./panels/agent/useGameAssistantDraft";
import { gamePlaytestPrompt, gameScriptErrorPrompt, gameSelectionPrompt } from "./gameAssistantPrompt";
import GameViewport3D from "./viewport3d/GameViewport3D";
import { scriptFailure } from "./useGamePlaySession";
import { EMPTY_INPUT_3D, useGamePlaySession3D } from "./useGamePlaySession3D";

async function openDiagnosticSession(document: GameDocument3D, signal: AbortSignal): Promise<GameDiagnosticSession> {
  const session = await openGameDiagnosticSession3D(document, signal);
  return { step: () => session.step(EMPTY_INPUT_3D), dispose: () => session.dispose() };
}

interface GameEditor3DProps { readonly refId: string; readonly active: boolean; }
interface GameEditor3DContentProps extends GameEditor3DProps { readonly document: GameDocument3D; readonly name: string; readonly projectId: string; }

function GameEditor3DContent({ refId, active, document, name, projectId }: GameEditor3DContentProps) {
  const selectedIds = useGameDraft(refId, (state) => state.selectedIds);
  const saveStatus = useGameDraft(refId, (state) => state.saveStatus);
  const draftError = useGameDraft(refId, (state) => state.error);
  const canUndo = useStore(getGameDraftStore(refId), (state) => state.canUndo);
  const canRedo = useStore(getGameDraftStore(refId), (state) => state.canRedo);
  const [sceneId, setSceneId] = useState(document.entrySceneId);
  const layoutStore = useGamePanelLayoutStore();
  const assistant = useGameAssistantDraft(layoutStore);
  const assistantOpen = useStore(layoutStore, (state) => !state.layout.hidden.includes("assistant"));
  const inspectorOpen = useStore(layoutStore, (state) => !state.layout.hidden.includes("inspector"));
  const treeOpen = useStore(layoutStore, (state) => !state.layout.hidden.includes("hierarchy") || !state.layout.hidden.includes("revisions"));
  const publishFlight = useRef<Promise<void> | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishMessage, setPublishMessage] = useState("");
  const [scriptKey, setScriptKey] = useState<{ sceneId: string; entityId: string; index: number } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [assetId, setAssetId] = useState("");
  const [assetSlot, setAssetSlot] = useState("model");
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [focusMessage, setFocusMessage] = useState<{ threadId: string; messageId: string; requestId: number } | null>(null);
  const activeSceneId = document.scenes.some((scene) => scene.id === sceneId) ? sceneId : document.entrySceneId;
  const scene = document.scenes.find((entry) => entry.id === activeSceneId);
  const selected = scene?.entities.find((entity) => entity.id === selectedIds[0]);
  const host = useGamePlaySession3D({ refId, document, active, editorSceneId: activeSceneId });
  const diagnostics = useGameScriptDiagnostics(document, openDiagnosticSession);
  const hostScriptError = host.error?.includes("Game script") ? scriptFailure(host.error, (host.inspection?.tick ?? 0) + 1) : null;
  const scriptError = diagnostics.error ?? hostScriptError;
  const conflicts = useDocumentConflicts("game", refId);
  const queries = trpc.useUtils();
  const { data: revisions } = trpc.games.revisions.useQuery({ id: refId }, { staleTime: 15_000 });
  const { data: changeEntries } = trpc.games.draftChanges.useQuery({ id: refId });
  const savingRef = useRef<Promise<void> | null>(null);
  const onOps = useCallback((ops: AnyGameDocumentOp[], label?: string): void => {
    getGameDraftStore(refId).getState().apply(ops, label === undefined ? undefined : { label });
  }, [refId]);
  const onViewportOps = useCallback((ops: AnyGameDocumentOp[], gestureId?: number): void => {
    const set = ops.find((op) => op.op === "update_entity")?.set;
    const transform = set && "transform3d" in set ? set.transform3d : undefined;
    const rotated = transform?.rotation?.some((value, index) => value !== selected?.transform3d.rotation[index]);
    const scaled = transform?.scale && (transform.scale.x !== selected?.transform3d.scale.x
      || transform.scale.y !== selected?.transform3d.scale.y || transform.scale.z !== selected?.transform3d.scale.z);
    const action = rotated ? "Rotate" : scaled ? "Scale" : "Move";
    getGameDraftStore(refId).getState().apply(ops,
      { label: `${action} ${selected?.name || selected?.id || "Entity"}`, mergeKey: "transform-selection", gestureId });
  }, [refId, selected?.id, selected?.name, selected?.transform3d]);
  const beginGesture = (): number => getGameDraftStore(refId).getState().beginGesture();
  const endGesture = (id: number): void => getGameDraftStore(refId).getState().endGesture(id);
  const select = useCallback((id: string): void => { getGameDraftStore(refId).getState().select(id); }, [refId]);

  const pullFromServer = useCallback(async (): Promise<void> => {
    const server = await trpcClient.games.getDraft.query({ id: refId });
    const store = getGameDraftStore(refId);
    const current = store.getState();
    if (server.game.draftUpdatedAt === current.baseUpdatedAt) { return; }
    if (!current.document || !current.savedDocument || current.pendingOps.length === 0) {
      current.load(server.document, server.game.draftUpdatedAt);
      return;
    }
    const merged = mergeByUnits(current.savedDocument, current.document, server.document, anyGameMergeAdapter(current.document), { mergeWithoutOps: true });
    current.applyMerged(merged.doc, server.document, server.game.draftUpdatedAt);
    useConflictStore.getState().addConflicts(`game:${refId}`, merged.conflicts, {
      onAccept: (unitId) => {
        const conflict = merged.conflicts.find((entry) => entry.unit.id === unitId);
        if (conflict) { store.getState().acceptConflict(server.document, conflict.unit.kind, unitId); }
      }, onDiscard: () => undefined
    });
  }, [refId]);

  const pull = useCallback(async (): Promise<void> => {
    await pullGameDraft(savingRef, pullFromServer);
    setOperationError(null);
  }, [pullFromServer]);

  const flush = useCallback(async (): Promise<void> => {
    const save = async (): Promise<void> => {
      const store = getGameDraftStore(refId);
      let retries = 0;
      while (store.getState().pendingOps.length > 0) {
        const state = store.getState();
        if (!state.baseUpdatedAt) { return; }
        const batch = captureGameDraftBatch(refId);
        if (!batch) { return; }
        state.setSaving(batch.count);
        try {
          const result = "document" in batch
            ? await trpcClient.games.saveDraftDocument.mutate({ id: refId, baseUpdatedAt: state.baseUpdatedAt, document: batch.document })
            : await trpcClient.games.saveDraft.mutate({ id: refId, baseUpdatedAt: state.baseUpdatedAt, ops: batch.ops });
          store.getState().acknowledge(result.document, result.game.draftUpdatedAt, batch.count);
          retries = 0;
        } catch (cause) {
          if (isMissingDraft(cause)) {
            store.getState().failSave("Draft source unavailable. Export your local draft before restoring.");
            await queries.games.getDraft.invalidate({ id: refId });
            throw cause;
          }
          try {
            const server = await trpcClient.games.getDraft.query({ id: refId });
            if (server.game.draftUpdatedAt !== state.baseUpdatedAt) {
              await pullFromServer();
              if (++retries <= 3 && (useConflictStore.getState().byKey[`game:${refId}`]?.conflicts.length ?? 0) === 0) { continue; }
            }
          } catch (recoveryError) {
            store.getState().failSave(recoveryError instanceof Error ? recoveryError.message : String(recoveryError));
            throw recoveryError;
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
    await flushGameDraft(savingRef, save);
    setOperationError(null);
  }, [refId, pullFromServer, queries.games.getDraft]);

  useEffect(() => registerDocumentSync("game", refId, {
    localRevision: () => getGameDraftStore(refId).getState().baseUpdatedAt,
    isDirty: () => getGameDraftStore(refId).getState().pendingOps.length > 0,
    reload: () => { void pull().catch((cause: unknown) => setOperationError(cause instanceof Error ? cause.message : String(cause))); },
    merge: () => { void pull().catch((cause: unknown) => setOperationError(cause instanceof Error ? cause.message : String(cause))); }
  }), [refId, pull]);

  useEffect(() => {
    if (saveStatus !== "unsaved" || conflicts.items.length > 0) { return; }
    const timer = window.setTimeout(() => { void flush().catch((cause: unknown) => setOperationError(cause instanceof Error ? cause.message : String(cause))); }, 500);
    return () => window.clearTimeout(timer);
  }, [saveStatus, document, flush, conflicts.items.length]);

  const add = (kind: "box" | "sphere" | "light"): void => {
    const id = crypto.randomUUID().replaceAll("-", "");
    const entity = gameEntity3D.parse({ id, name: kind, transform3d: {},
      ...(kind === "light" ? { light3d: { kind: "point", color: scene?.environment.ambient.color, intensity: 10, range: 10 } } :
        { primitive: { kind, dimensions: { x: 1, y: 1, z: 1 } }, body3d: { type: "static" },
          collider3d: kind === "box" ? { kind: "box", halfExtents: { x: 0.5, y: 0.5, z: 0.5 } } : { kind: "sphere", radius: 0.5 } }) });
    onOps([{ op: "add_entity", scene_id: activeSceneId, entity }]);
    select(id);
  };
  const publish = async (): Promise<void> => {
    setPublishing(true);
    try {
      await publishGameDraft({ id: refId, document, flight: publishFlight, message: publishMessage.trim(),
        flush, getDraft: () => getGameDraftStore(refId).getState(),
        fetchRevision: async () => (await trpcClient.games.get.query({ id: refId })).game.revision,
        publish: (request) => trpcClient.games.publish.mutate(request) });
      await queries.games.getDraft.invalidate({ id: refId });
      await queries.games.draftChanges.invalidate({ id: refId });
      await queries.games.revisions.invalidate({ id: refId });
      setPublishOpen(false);
      setPublishMessage("");
      setOperationError(null);
    } catch (cause) { setOperationError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setPublishing(false); }
  };
  const installModel = async (): Promise<void> => {
    try {
      await flush();
      await flushGameDraft(savingRef, async () => {
        const state = getGameDraftStore(refId).getState();
        if (!state.baseUpdatedAt) { throw new Error("The draft is not ready for model installation"); }
        await trpcClient.games.installAsset.mutate({ id: refId, assetId, slot: assetSlot, baseUpdatedAt: state.baseUpdatedAt });
        await pullFromServer();
      });
      setOperationError(null);
    } catch (cause) { setOperationError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const activeScript = scriptKey && document.scenes.find((entry) => entry.id === scriptKey.sceneId)
    ?.entities.find((entity) => entity.id === scriptKey.entityId);
  const behavior = activeScript?.behaviors[scriptKey?.index ?? -1];
  const askAssistant = (): void => {
    if (!scriptError || !scriptKey) { return; }
    assistant.draft(gameScriptErrorPrompt(scriptKey, scriptError));
  };
  const selectedEntities = scene?.entities.filter((entity) => selectedIds.includes(entity.id)) ?? [];
  const restoreRevision = async (revision: string): Promise<void> => {
    setRestoring(true);
    try {
      await flush();
      await flushGameDraft(savingRef, async () => {
        const state = getGameDraftStore(refId).getState();
        if (!state.baseUpdatedAt) { throw new Error("The draft is not ready for restoration"); }
        const result = await trpcClient.games.restoreDraft.mutate({ id: refId, baseUpdatedAt: state.baseUpdatedAt, revision });
        getGameDraftStore(refId).getState().load(result.document, result.game.draftUpdatedAt);
      });
      await queries.games.getDraft.invalidate({ id: refId });
      await queries.games.draftChanges.invalidate({ id: refId });
      setOperationError(null);
    } catch (cause) { setOperationError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setRestoring(false); }
  };
  const restart = useMemo(() => host.playDocument && JSON.stringify(host.playDocument) !== JSON.stringify(document),
    [host.playDocument, document]);
  const notice = host.error || draftError || operationError || restart;
  return <GameEditorShell layoutStore={layoutStore} dimension="3d"
    toolbar={{ name: name,
        playing: host.playing,
        playSession: Boolean(host.playDocument),
        loading: host.backend === "Initializing",
        saving: publishing || saveStatus === "saving",
        saveStatus: saveStatus,
        assistantOpen: assistantOpen,
        sceneTreeOpen: treeOpen,
        inspectorOpen: inspectorOpen,
        playHref: `/game/${encodeURIComponent(refId)}`,
        canUndo: canUndo,
        canRedo: canRedo,
        onUndo: () => getGameDraftStore(refId).getState().undo(),
        onRedo: () => getGameDraftStore(refId).getState().redo(),
        onPlay: host.beginPlay,
        onStop: host.stop,
        onStep: () => host.step(),
        onSave: host.save,
        onLoad: () => void host.load(),
        onPublish: () => setPublishOpen(true),
        onAssistant: () => layoutStore.getState().togglePanels(["assistant"]),
        onSceneTree: () => layoutStore.getState().togglePanels(["hierarchy", "revisions"]),
        onInspector: () => layoutStore.getState().togglePanels(["inspector"]) }}
    status={{ tick: host.inspection?.tick ?? 0,
        score: host.inspection?.score ?? 0,
        won: host.inspection?.won ?? false,
        backend: host.backend,
        hint: selected ? `Selected: ${selected.name || selected.id}` : `${scene?.entities.length ?? 0} entities in ${scene?.name ?? "scene"}` }}
    notices={<>
    {notice && <FlexColumn gap={SPACING.xs} sx={{ px: SPACING.md, py: SPACING.xs, borderBottom: 1, borderColor: "divider", bgcolor: "background.paper" }}>
      {(host.error || draftError || operationError) && <FlexRow gap={SPACING.xs} align="center"><Caption color="error" role="alert" sx={{ flex: 1, minWidth: 0 }}>{host.error ?? draftError ?? operationError}</Caption>
        {host.error && <EditorButton onClick={() => void host.replayBeforeError()}>Replay before error</EditorButton>}
        <ReportBugButton context={{ source: "panel-crash", summary: "3D game editor failed", errorText: host.error ?? draftError ?? operationError ?? "",
          nodeDetail: `Game: ${refId}\nScene: ${activeSceneId}\nEntity: ${selected?.id ?? "none"}\nTick: ${host.inspection?.tick ?? 0}` }} /></FlexRow>}
      {restart && <Caption role="status">The draft changed. Stop and play again to apply it.</Caption>}
    </FlexColumn>}
    <GameAuthoringPreview key={refId} gameId={refId} document={document} flush={flush} onHighlight={setHighlightedIds} />
    {conflicts.items.length > 0 && <ConflictBanner conflicts={conflicts.items} onAccept={conflicts.accept} onDiscard={conflicts.discard} />}
    <GameChanges gameId={refId} document={document} onOps={onOps} onHover={setHighlightedIds}
      onFocusMessage={(threadId, messageId) => { layoutStore.getState().dispatch({ type: "reveal", panelId: "assistant" }); setFocusMessage({ threadId, messageId, requestId: Date.now() }); }} />
    </>}
    panels={[
      { id: "hierarchy", keyboardScope: true,
        node: <>
<GameHierarchy3D document={document} scene={scene} selectedIds={selectedIds} onSelect={select} onAdd={add}
          onSelectScene={(value) => { setSceneId(value); getGameDraftStore(refId).getState().selectMany([]); }}
          footer={<CollapsibleSection title={<Label component="span" sx={{ mb: 0 }}>Model assets</Label>} compact defaultOpen={false}>
            <FlexColumn gap={SPACING.sm} sx={{ pb: SPACING.md }}>
              <TextInput label="Owned model asset ID" compact value={assetId} onChange={(event) => setAssetId(event.target.value)} />
              <TextInput label="Model slot" compact value={assetSlot} onChange={(event) => setAssetSlot(event.target.value)} />
              <EditorButton variant="outlined" disabled={!assetId || !assetSlot} onClick={() => void installModel()}>Prepare and install model</EditorButton>
              {Object.entries(document.assets).map(([slot, binding]) => <FlexRow key={slot} gap={SPACING.xs} align="center">
                <Caption sx={{ flex: 1, minWidth: 0 }}>{slot} · {binding.mediaKind}</Caption>
                {binding.mediaKind === "model" && <EditorButton onClick={() => useWorkspaceTabsStore.getState().openTab({
                  type: "model3d", ref: binding.sourceAssetId ?? binding.assetId, mode: "edit", title: slot, projectId
                })}>Edit model</EditorButton>}
              </FlexRow>)}
              <Caption>After saving model changes, prepare and install them again.</Caption>
            </FlexColumn>
          </CollapsibleSection>} />        </> },
      { id: "revisions",
        node: <CollapsibleSection title={<Label component="span" sx={{ mb: 0 }}>Revisions</Label>} compact defaultOpen={false}
          sx={{ flexShrink: 0, maxHeight: "30%", overflowY: "auto", px: SPACING.md }}>
          <GameRevisions revisions={revisions ?? []} busy={restoring || saveStatus === "saving"} onRestore={restoreRevision} />
        </CollapsibleSection> },
      { id: "viewport", keyboardScope: true, node: <>
        <GameViewport3D document={document} host={host} selectedId={selected?.id} highlightedIds={highlightedIds} sceneId={activeSceneId} onSelect={select} onOps={onViewportOps} onGestureStart={beginGesture} onGestureEnd={endGesture} />
      </> },
      { id: "scripts", visible: Boolean(scriptKey && activeScript && behavior?.kind === "script"),
        node: scriptKey && activeScript && behavior?.kind === "script" ? <GameScriptPane
          key={`${scriptKey.sceneId}:${scriptKey.entityId}:${scriptKey.index}`} dimension="3d" entityId={activeScript.id}
          entityName={activeScript.name} behaviorIndex={scriptKey.index} behavior={behavior}
          error={scriptError && (!scriptError.entityId || scriptError.entityId === activeScript.id) ? scriptError : null}
          onReplay={host.playDocument && !diagnostics.error && hostScriptError ? () => void host.replayBeforeError(hostScriptError) : undefined}
          onAskAssistant={askAssistant} onRunTenSeconds={() => void diagnostics.run()}
          runningTenSeconds={diagnostics.running} runSummary={diagnostics.summary} runEntityStats={diagnostics.byEntity}
          onChange={(source) => onOps([{ op: "set_script", scene_id: scriptKey.sceneId, entity_id: activeScript.id, index: scriptKey.index, source }])}
          onClose={() => { setScriptKey(null); layoutStore.getState().dispatch({ type: "hide", panelId: "scripts" }); }} /> : null },
      { id: "inspector",
        node: <>
        <GamePanelHeader title="Inspector" icon={<TuneOutlinedIcon sx={{ fontSize: FONT_SIZE_SANS.body }} />} />
        <FlexColumn sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <GameInspector3D document={document} sceneId={activeSceneId} entityId={selected?.id} onOps={onOps} onOperationError={(message) => getGameDraftStore(refId).getState().reportOperationError(message)} onScript={(index) => { if (selected) { setScriptKey({ sceneId: activeSceneId, entityId: selected.id, index }); layoutStore.getState().dispatch({ type: "reveal", panelId: "scripts" }); } }} />
          {host.playDocument && !host.playing && <CollapsibleSection title="Runtime state" compact sx={{ px: SPACING.md }}><Caption>{JSON.stringify(host.inspection?.entities.find((entity) => entity.id === selected?.id))}</Caption></CollapsibleSection>}
        </FlexColumn>
      </> },
      { id: "assistant",
        node: <>
        <GameAgentPanel gameId={refId} name={name} selectedEntityIds={selectedIds} behaviorIndex={scriptKey?.index} onThreadId={assistant.onThreadId} focusMessage={focusMessage} />
      </> }
    ]}
    commands={{
      "edit.undo": { run: () => getGameDraftStore(refId).getState().undo(), enabled: canUndo },
      "edit.redo": { run: () => getGameDraftStore(refId).getState().redo(), enabled: canRedo },
      "assistant.playtest": { run: () => assistant.draft(gamePlaytestPrompt()) },
      "assistant.explainSelection": { run: () => assistant.draft(gameSelectionPrompt(selectedEntities)), enabled: selectedEntities.length > 0 },
      "assistant.fixScriptError": { run: askAssistant, enabled: Boolean(scriptError && scriptKey) }
    }}
    dialogs={<>
    <Dialog open={publishOpen} onClose={() => setPublishOpen(false)} title="Publish 3D game"
      onConfirm={() => void publish()} confirmText="Publish" isLoading={publishing} showActions>
      <FlexColumn gap={SPACING.sm}><Text>Create an immutable revision from the current draft.</Text>
        <TextInput label="Revision message" value={publishMessage} onChange={(event) => setPublishMessage(event.target.value)} />
        <Text>Changes since the last revision</Text>
        {changeEntries?.length ? changeEntries.map((entry) => <Caption key={entry.id}>{entry.summary}</Caption>) : <Caption>No saved changes</Caption>}
      </FlexColumn>
    </Dialog>
    </>}
  />;

}

export default function GameEditor3D({ refId, active }: GameEditor3DProps) {
  const { data, isPending, error } = trpc.games.getDraft.useQuery({ id: refId }, { staleTime: 15_000 });
  const document = useGameDraft(refId, (state) => state.document?.schemaVersion === 3 ? state.document : null);
  useEffect(() => {
    if (!data || data.document.schemaVersion !== 3) { return; }
    const store = getGameDraftStore(refId);
    const state = store.getState();
    if (state.pendingOps.length === 0 && state.baseUpdatedAt !== data.game.draftUpdatedAt) { state.load(data.document, data.game.draftUpdatedAt); }
  }, [data, refId]);
  if (error?.data?.code === "PRECONDITION_FAILED") { return <GameDraftRecovery key={refId} refId={refId} />; }
  if (isPending || (data && !document)) { return <LoadingSpinner text="Loading 3D game" />; }
  if (error || !data || !document) {
    const message = error?.message ?? "Game source is unavailable.";
    return <FlexColumn gap={SPACING.sm} align="center">
      <EmptyState variant="error" title="Could not load game" description={message} />
      <ReportBugButton context={{ source: "panel-crash", summary: "3D game could not load", errorText: message, nodeDetail: `Game: ${refId}` }} />
    </FlexColumn>;
  }
  return <GameEditor3DContent refId={refId} active={active} document={document} name={data.game.name} projectId={data.game.projectId} />;
}
