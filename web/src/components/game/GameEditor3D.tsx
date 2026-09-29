import { useCallback, useEffect, useRef, useState } from "react";
import { gameEntity3D, type GameDocument3D } from "@nodetool-ai/protocol";
import type { AnyGameDocumentOp } from "@nodetool-ai/game-runtime";
import { trpc, trpcClient } from "../../trpc/client";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { getGameDraftStore, useGameDraft } from "../../stores/game/GameDraftStore";
import { anyGameMergeAdapter, acceptServerAnyGameUnit } from "../../stores/game/anyMerge";
import { mergeByUnits } from "../../stores/documentMerge";
import { useConflictStore } from "../../stores/ConflictStore";
import { registerDocumentSync } from "../../stores/documentSync";
import { useDocumentConflicts } from "../../hooks/useDocumentConflicts";
import { Caption, CollapsibleSection, ConflictBanner, Dialog, EditorButton, EditorUiProvider, EmptyState, FlexColumn, FlexRow, InspectorSelect, LoadingSpinner, ResizableDock, SPACING, Text, TextInput } from "../ui_primitives";
import ReportBugButton from "../support/ReportBugButton";
import GameAgentPanel from "./GameAgentPanel";
import GameChanges from "./GameChanges";
import GameAuthoringPreview from "./GameAuthoringPreview";
import GameInspector3D from "./GameInspector3D";
import GameScriptPane from "./GameScriptPane";
import GameToolbar from "./GameToolbar";
import GameViewport3D from "./GameViewport3D";
import { useGamePlaySession3D } from "./useGamePlaySession3D";

interface GameEditor3DProps { readonly refId: string; readonly active: boolean; }
interface GameEditor3DContentProps extends GameEditor3DProps { readonly document: GameDocument3D; readonly name: string; readonly revision: string; readonly projectId: string; }

function GameEditor3DContent({ refId, active, document, name, revision, projectId }: GameEditor3DContentProps) {
  const selectedIds = useGameDraft(refId, (state) => state.selectedIds);
  const saveStatus = useGameDraft(refId, (state) => state.saveStatus);
  const draftError = useGameDraft(refId, (state) => state.error);
  const [sceneId, setSceneId] = useState(document.entrySceneId);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [treeOpen, setTreeOpen] = useState(true);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishMessage, setPublishMessage] = useState("");
  const [scriptIndex, setScriptIndex] = useState<number | null>(null);
  const [assetId, setAssetId] = useState("");
  const [assetSlot, setAssetSlot] = useState("model");
  const [operationError, setOperationError] = useState<string | null>(null);
  const [focusMessage, setFocusMessage] = useState<{ threadId: string; messageId: string; requestId: number } | null>(null);
  const activeSceneId = document.scenes.some((scene) => scene.id === sceneId) ? sceneId : document.entrySceneId;
  const scene = document.scenes.find((entry) => entry.id === activeSceneId);
  const selected = scene?.entities.find((entity) => entity.id === selectedIds[0]);
  const host = useGamePlaySession3D({ refId, document, active, editorSceneId: activeSceneId });
  const conflicts = useDocumentConflicts("game", refId);
  const queries = trpc.useUtils();
  const savingRef = useRef<Promise<void> | null>(null);
  const onOps = useCallback((ops: AnyGameDocumentOp[]): void => { getGameDraftStore(refId).getState().apply(ops); }, [refId]);
  const select = useCallback((id: string): void => { getGameDraftStore(refId).getState().select(id); }, [refId]);

  const pull = useCallback(async (): Promise<void> => {
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
        const latest = store.getState().document;
        if (conflict && latest) { store.getState().applyMerged(acceptServerAnyGameUnit(latest, server.document, conflict.unit.kind, unitId), server.document, server.game.draftUpdatedAt); }
      }, onDiscard: () => undefined
    });
  }, [refId]);

  const flush = useCallback(async (): Promise<void> => {
    if (savingRef.current) { await savingRef.current; }
    const save = async (): Promise<void> => {
      const store = getGameDraftStore(refId);
      while (store.getState().pendingOps.length > 0) {
        const state = store.getState();
        if (!state.baseUpdatedAt) { return; }
        const ops = [...state.pendingOps];
        state.setSaving(ops.length);
        try {
          const result = await trpcClient.games.saveDraft.mutate({ id: refId, baseUpdatedAt: state.baseUpdatedAt, ops });
          store.getState().acknowledge(result.document, result.game.draftUpdatedAt, ops.length);
        } catch (cause) {
          await pull();
          const message = cause instanceof Error ? cause.message : String(cause);
          store.getState().failSave(message);
          throw cause;
        }
      }
    };
    savingRef.current = save();
    try { await savingRef.current; } finally { savingRef.current = null; }
  }, [refId, pull]);

  useEffect(() => registerDocumentSync("game", refId, {
    localRevision: () => getGameDraftStore(refId).getState().baseUpdatedAt,
    isDirty: () => getGameDraftStore(refId).getState().pendingOps.length > 0,
    reload: () => { void pull().catch((cause: unknown) => setOperationError(cause instanceof Error ? cause.message : String(cause))); },
    merge: () => { void pull().catch((cause: unknown) => setOperationError(cause instanceof Error ? cause.message : String(cause))); }
  }), [refId, pull]);

  useEffect(() => {
    if (saveStatus !== "unsaved") { return; }
    const timer = window.setTimeout(() => { void flush().catch((cause: unknown) => setOperationError(cause instanceof Error ? cause.message : String(cause))); }, 500);
    return () => window.clearTimeout(timer);
  }, [saveStatus, document, flush]);

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
    try {
      await flush();
      await trpcClient.games.publish.mutate({ id: refId, baseRevision: revision, message: publishMessage });
      await queries.games.getDraft.invalidate({ id: refId });
      setPublishOpen(false);
      setPublishMessage("");
    } catch (cause) { setOperationError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const installModel = async (): Promise<void> => {
    try {
      await flush();
      const state = getGameDraftStore(refId).getState();
      if (!state.baseUpdatedAt) { throw new Error("The draft is not ready for model installation"); }
      await trpcClient.games.installAsset.mutate({ id: refId, assetId, slot: assetSlot, baseUpdatedAt: state.baseUpdatedAt });
      await pull();
      setOperationError(null);
    } catch (cause) { setOperationError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const behavior = scriptIndex === null ? undefined : selected?.behaviors[scriptIndex];
  const restart = host.playDocument && JSON.stringify(host.playDocument) !== JSON.stringify(document);
  return <EditorUiProvider scope="inspector"><FlexColumn gap={SPACING.sm} sx={{ height: "100%", minHeight: 0, p: SPACING.md }}>
    <GameToolbar name={name} playing={host.playing} playSession={Boolean(host.playDocument)} loading={host.backend === "Initializing"}
      saving={saveStatus === "saving"} saveStatus={saveStatus} tick={host.inspection?.tick ?? 0} score={host.inspection?.score ?? 0}
      won={host.inspection?.won ?? false} backend={host.backend} assistantOpen={assistantOpen} sceneTreeOpen={treeOpen} inspectorOpen={inspectorOpen}
      playHref={`/game/${encodeURIComponent(refId)}`} onPlay={host.beginPlay} onStop={host.stop} onStep={() => host.step()}
      onSave={host.save} onLoad={() => void host.load()} onPublish={() => setPublishOpen(true)} onAssistant={() => setAssistantOpen((value) => !value)}
      onSceneTree={() => setTreeOpen((value) => !value)} onInspector={() => setInspectorOpen((value) => !value)} />
    <FlexRow gap={SPACING.xs}>
      <EditorButton disabled={getGameDraftStore(refId).temporal.getState().pastStates.length === 0} onClick={() => getGameDraftStore(refId).getState().undo()}>Undo</EditorButton>
      <EditorButton disabled={getGameDraftStore(refId).temporal.getState().futureStates.length === 0} onClick={() => getGameDraftStore(refId).getState().redo()}>Redo</EditorButton>
    </FlexRow>
    {(host.error || draftError || operationError) && <FlexRow gap={SPACING.xs}><Caption color="error" role="alert">{host.error ?? draftError ?? operationError}</Caption>
      {host.error && <EditorButton onClick={() => void host.replayBeforeError()}>Replay before error</EditorButton>}
      <ReportBugButton context={{ source: "panel-crash", summary: "3D game editor failed", errorText: host.error ?? draftError ?? operationError ?? "",
        nodeDetail: `Game: ${refId}\nScene: ${activeSceneId}\nEntity: ${selected?.id ?? "none"}\nTick: ${host.inspection?.tick ?? 0}` }} /></FlexRow>}
    {restart && <Caption role="status">The draft changed. Stop and play again to apply it.</Caption>}
    <GameAuthoringPreview key={refId} gameId={refId} document={document} flush={flush} onHighlight={(ids) => getGameDraftStore(refId).getState().selectMany(ids)} />
    {conflicts.items.length > 0 && <ConflictBanner conflicts={conflicts.items} onAccept={conflicts.accept} onDiscard={conflicts.discard} />}
    <GameChanges gameId={refId} document={document} onOps={onOps} onHover={() => undefined}
      onFocusMessage={(threadId, messageId) => { setAssistantOpen(true); setFocusMessage({ threadId, messageId, requestId: Date.now() }); }} />
    <FlexRow gap={SPACING.sm} sx={{ flex: 1, minHeight: 0 }} onKeyDown={(event) => {
      if ((event.ctrlKey || event.metaKey) && event.code === "KeyZ") {
        event.preventDefault();
        if (event.shiftKey) { getGameDraftStore(refId).getState().redo(); } else { getGameDraftStore(refId).getState().undo(); }
      }
    }}>
      {treeOpen && <ResizableDock storageKey="sceneTree3d" storagePrefix="nodetool.gameEditor." side="left" defaultWidth={260} minWidth={220} maxWidth={480} ariaLabel="Resize 3D scene tree">
        <FlexColumn gap={SPACING.sm} sx={{ height: "100%", overflowY: "auto" }}>
          <InspectorSelect label="Scene" value={activeSceneId} options={document.scenes.map((item) => ({ value: item.id, label: item.name }))}
            onChange={(value) => { setSceneId(value); getGameDraftStore(refId).getState().selectMany([]); }} />
          <FlexRow gap={SPACING.xs} wrap><EditorButton onClick={() => add("box")}>Add box</EditorButton><EditorButton onClick={() => add("sphere")}>Add sphere</EditorButton><EditorButton onClick={() => add("light")}>Add light</EditorButton></FlexRow>
          {scene?.entities.map((entity) => <EditorButton key={entity.id} aria-pressed={selectedIds.includes(entity.id)} onClick={() => select(entity.id)}>
            {entity.parentId ? "↳ " : ""}{entity.name || entity.id}{entity.character3d ? " · Character" : entity.camera3d ? " · Camera" : ""}
          </EditorButton>)}
          <CollapsibleSection title="Model assets" compact defaultOpen={false}>
            <TextInput label="Owned model asset ID" value={assetId} onChange={(event) => setAssetId(event.target.value)} />
            <TextInput label="Model slot" value={assetSlot} onChange={(event) => setAssetSlot(event.target.value)} />
            <EditorButton disabled={!assetId || !assetSlot} onClick={() => void installModel()}>Prepare and install model</EditorButton>
            {Object.entries(document.assets).map(([slot, binding]) => <FlexRow key={slot} gap={SPACING.xs} align="center">
              <Caption>{slot} · {binding.mediaKind}</Caption>
              {binding.mediaKind === "model" && <EditorButton onClick={() => useWorkspaceTabsStore.getState().openTab({
                type: "model3d", ref: binding.sourceAssetId ?? binding.assetId, mode: "edit", title: slot, projectId
              })}>Edit model</EditorButton>}
            </FlexRow>)}
            <Caption>After saving model changes, prepare and install them again.</Caption>
          </CollapsibleSection>
        </FlexColumn>
      </ResizableDock>}
      <GameViewport3D document={document} host={host} selectedId={selected?.id} sceneId={activeSceneId} onSelect={select} onOps={onOps} />
      {inspectorOpen && <ResizableDock storageKey="inspector3d" storagePrefix="nodetool.gameEditor." side="right" defaultWidth={320} minWidth={240} maxWidth={480} ariaLabel="Resize 3D inspector">
        <GameInspector3D document={document} sceneId={activeSceneId} entityId={selected?.id} onOps={onOps} onScript={setScriptIndex} />
        {host.playDocument && !host.playing && <CollapsibleSection title="Runtime state" compact><Caption>{JSON.stringify(host.inspection?.entities.find((entity) => entity.id === selected?.id))}</Caption></CollapsibleSection>}
      </ResizableDock>}
      {assistantOpen && <ResizableDock storageKey="assistant3d" storagePrefix="nodetool.gameEditor." side="right" defaultWidth={360} minWidth={280} maxWidth={640} ariaLabel="Resize game assistant">
        <GameAgentPanel gameId={refId} name={name} selectedEntityIds={selectedIds} behaviorIndex={scriptIndex ?? undefined} focusMessage={focusMessage} />
      </ResizableDock>}
    </FlexRow>
    {selected && behavior?.kind === "script" && scriptIndex !== null && <FlexColumn sx={{ height: "40%", minHeight: 0 }}>
      <GameScriptPane dimension="3d" entityId={selected.id} entityName={selected.name} behaviorIndex={scriptIndex} behavior={behavior}
        onChange={(source) => onOps([{ op: "set_script", scene_id: activeSceneId, entity_id: selected.id, index: scriptIndex, source }])} onClose={() => setScriptIndex(null)} />
    </FlexColumn>}
    <Dialog open={publishOpen} onClose={() => setPublishOpen(false)} title="Publish 3D game">
      <FlexColumn gap={SPACING.sm}><Text>Create an immutable revision from the current draft.</Text>
        <TextInput label="Revision message" value={publishMessage} onChange={(event) => setPublishMessage(event.target.value)} />
        <EditorButton onClick={() => void publish()}>Publish</EditorButton></FlexColumn>
    </Dialog>
  </FlexColumn></EditorUiProvider>;
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
  if (isPending || (data && !document)) { return <LoadingSpinner text="Loading 3D game" />; }
  if (error || !data || !document) {
    const message = error?.message ?? "Game source is unavailable.";
    return <FlexColumn gap={SPACING.sm} align="center">
      <EmptyState variant="error" title="Could not load game" description={message} />
      <ReportBugButton context={{ source: "panel-crash", summary: "3D game could not load", errorText: message, nodeDetail: `Game: ${refId}` }} />
    </FlexColumn>;
  }
  return <GameEditor3DContent refId={refId} active={active} document={document} name={data.game.name} revision={data.game.revision} projectId={data.game.projectId} />;
}
