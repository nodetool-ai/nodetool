import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { gameAuthoring, type AnyGameDocument } from "@nodetool-ai/protocol";
import { applyAnyGameOps, type GameAuthoringConflict } from "@nodetool-ai/game-runtime";

import { trpc, trpcClient, type RouterOutputs } from "../../../../trpc/client";
import { getGameDraftStore, useGameDraft } from "../../../../stores/game/GameDraftStore";
import { rebaseGameAuthoringEdits } from "../../../../stores/game/authoringMerge";
import { Caption, CollapsibleSection, Dialog, EditorButton, FlexColumn, FlexRow, SPACING, TextInput } from "../../../ui_primitives";
import SchemaFields from "../../inspector/SchemaFields";
import type { FieldSchema } from "../../inspector/schemaForm";

function constructionInputs(text: string): ReturnType<typeof gameAuthoring.shape.program.shape.inputs.parse> | null {
  try { return gameAuthoring.shape.program.shape.inputs.parse(JSON.parse(text)); }
  catch { return null; }
}

interface GameAuthoringPreviewProps {
  gameId: string;
  document: AnyGameDocument;
  flush: () => Promise<void>;
  onHighlight: (ids: string[]) => void;
}

export default function GameAuthoringPreview({ gameId, document, flush, onHighlight }: GameAuthoringPreviewProps) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<RouterOutputs["games"]["previewAuthoring"] | null>(null);
  const [source, setSource] = useState(document.authoring?.program.source ?? "");
  const [inputs, setInputs] = useState(JSON.stringify(document.authoring?.program.inputs ?? {}, null, 2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRebase, setPendingRebase] = useState<{ local: AnyGameDocument; server: AnyGameDocument; updatedAt: string; conflicts: readonly GameAuthoringConflict[] } | null>(null);
  const baseUpdatedAt = useGameDraft(gameId, (state) => state.baseUpdatedAt);
  const saveStatus = useGameDraft(gameId, (state) => state.saveStatus);
  const queries = trpc.useUtils();
  const storedSource = document.authoring?.program.source ?? "";
  const storedInputs = JSON.stringify(document.authoring?.program.inputs ?? {}, null, 2);
  useEffect(() => { setSource(storedSource); setInputs(storedInputs); setPreview(null); }, [storedSource, storedInputs]);
  if (!document.authoring) { return null; }
  const inputValues = constructionInputs(inputs);
  const stale = preview && (preview.candidate.base_updated_at !== baseUpdatedAt || saveStatus !== "saved");
  const buildPreview = async (): Promise<void> => {
    setBusy(true);
    setPreview(null);
    try {
      const program = gameAuthoring.shape.program.parse({ source, inputs: JSON.parse(inputs), seed: document.authoring?.program.seed ?? 0 });
      await flush();
      setPreview(await trpcClient.games.previewAuthoring.mutate({ id: gameId, program }));
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  const apply = async (): Promise<void> => {
    if (!preview || stale || preview.conflicts.length > 0) { return; }
    setBusy(true);
    try {
      const store = getGameDraftStore(gameId);
      const before = store.getState().document;
      const result = await trpcClient.games.applyAuthoring.mutate({ id: gameId, candidate: preview.candidate });
      const current = store.getState().document;
      if (before && current && current !== before) {
        const rebased = rebaseGameAuthoringEdits(current, result.document);
        if (rebased.conflicts.length > 0) {
          store.getState().load(result.document, result.game.draftUpdatedAt);
          setPendingRebase({ local: current, server: result.document, updatedAt: result.game.draftUpdatedAt, conflicts: rebased.conflicts });
          setPreview(null);
          return;
        }
        store.getState().applyMerged(rebased.document, result.document, result.game.draftUpdatedAt);
      } else store.getState().load(result.document, result.game.draftUpdatedAt);
      setPreview(null);
      onHighlight([]);
      await Promise.all([queries.games.getDraft.invalidate({ id: gameId }), queries.games.draftChanges.invalidate({ id: gameId })]);
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  const keepDetached = (conflict: GameAuthoringConflict): void => {
    if (!pendingRebase) { return; }
    try {
      const local = applyAnyGameOps(pendingRebase.local, [{ op: "detach_entity", scene_id: conflict.sceneId, entity_id: conflict.entityId }]);
      const rebased = rebaseGameAuthoringEdits(local, pendingRebase.server);
      if (rebased.conflicts.length > 0) { setPendingRebase({ ...pendingRebase, local, conflicts: rebased.conflicts }); }
      else {
        getGameDraftStore(gameId).getState().applyMerged(rebased.document, pendingRebase.server, pendingRebase.updatedAt);
        setPendingRebase(null); setError(null);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  return <CollapsibleSection title={t("i18n-next2.gameAuthoringPreview.retainedConstruction")} compact defaultOpen={false}>
    <Dialog open={Boolean(pendingRebase)} title={t("i18n-next2.gameAuthoringPreview.resolveEditsTitle")} showCloseButton={false}>
      <FlexColumn gap={SPACING.sm}>
        <Caption>{t("i18n-next2.gameAuthoringPreview.rebuildAppliedHint")}</Caption>
        {pendingRebase?.conflicts.map((conflict) => <FlexColumn gap={SPACING.xs} key={`${conflict.sceneId}:${conflict.entityId}:${conflict.code}`}>
          <Caption>{conflict.sceneId}/{conflict.entityId}: {conflict.message}</Caption>
          {!conflict.entityId.startsWith("@") && <EditorButton onClick={() => keepDetached(conflict)}>{t("i18n-next2.gameAuthoringPreview.keepDetached", { entity: conflict.entityId })}</EditorButton>}
        </FlexColumn>)}
        {error && <Caption role="alert" color="error">{error}</Caption>}
        <EditorButton onClick={() => { setPendingRebase(null); setError(null); }}>{t("i18n-next2.gameAuthoringPreview.discardRebuildEdits")}</EditorButton>
      </FlexColumn>
    </Dialog>
    <FlexColumn gap={SPACING.sm}>
      {document.authoring.suppressions.map((target) => <FlexRow key={`${target.sceneId}:${target.entityId}`} gap={SPACING.sm} align="center">
        <Caption>{target.sceneId}/{target.entityId}: {t("i18n-next2.gameAuthoringPreview.suppressed")}</Caption>
        <EditorButton disabled={busy} onClick={() => getGameDraftStore(gameId).getState().apply([
          { op: "reset_override", scene_id: target.sceneId, entity_id: target.entityId }
        ])}>{t("i18n-next2.gameAuthoringPreview.restoreEntity", { entity: target.entityId })}</EditorButton>
      </FlexRow>)}
      <TextInput label={t("i18n-next2.gameAuthoringPreview.constructionSource")} multiline rows={6} value={source} disabled={busy}
        onChange={(event) => { setSource(event.target.value); setPreview(null); }} />
      <TextInput label={t("i18n-next2.gameAuthoringPreview.constructionInputs")} multiline rows={3} value={inputs} disabled={busy}
        onChange={(event) => { setInputs(event.target.value); setPreview(null); }} />
      {inputValues && Object.entries(document.authoring.parameters).map(([name, parameter]) => {
        const schema: FieldSchema = parameter.type === "number" ? { type: "number", minimum: parameter.min, maximum: parameter.max }
          : parameter.type === "enum" ? { type: "string", enum: parameter.values }
          : parameter.type === "vector2" || parameter.type === "vector3"
            ? { type: "array", items: { type: "number" }, minItems: parameter.default.length, maxItems: parameter.default.length }
            : { type: parameter.type };
        return <SchemaFields key={name} schema={schema} path={name} value={inputValues[name] ?? parameter.default}
          onChange={(value) => {
            const next = gameAuthoring.shape.program.shape.inputs.parse({ ...inputValues, [name]: value });
            setInputs(JSON.stringify(next, null, 2)); setPreview(null);
          }} />;
      })}
      <EditorButton disabled={busy} onClick={() => void buildPreview()}>{t("i18n-next2.gameAuthoringPreview.previewRebuild")}</EditorButton>
      {error && <Caption color="error" role="alert">{error}</Caption>}
      {preview && <>
        <Caption>{t("i18n-next2.gameAuthoringPreview.changedEntities", { entities: preview.affected_entities.join(", ") || t("i18n-next2.gameAuthoringPreview.none") })}</Caption>
        <Caption>{t("i18n-next2.gameAuthoringPreview.changedDependencies", { dependencies: preview.changed_dependencies.join(", ") || t("i18n-next2.gameAuthoringPreview.none") })}</Caption>
        <Caption>{preview.restart_required ? t("i18n-next2.gameAuthoringPreview.restartRequired") : t("i18n-next2.gameAuthoringPreview.playDefinitionUnchanged")}</Caption>
        {preview.conflicts.map((conflict) => <Caption color="error" key={`${conflict.sceneId}:${conflict.entityId}:${conflict.code}`}>
          {conflict.sceneId}/{conflict.entityId}: {conflict.message}
        </Caption>)}
        {stale && <Caption role="status">{t("i18n-next2.gameAuthoringPreview.draftChanged")}</Caption>}
        <FlexRow gap={SPACING.sm}>
          <EditorButton onClick={() => onHighlight(preview.affected_entities)}>{t("i18n-next2.gameAuthoringPreview.highlightChanges")}</EditorButton>
          <EditorButton disabled={busy || Boolean(stale) || preview.conflicts.length > 0} onClick={() => void apply()}>{t("i18n-next2.gameAuthoringPreview.applyRebuild")}</EditorButton>
          <EditorButton disabled={busy} onClick={() => { setPreview(null); onHighlight([]); }}>{t("i18n-next2.gameAuthoringPreview.discardPreview")}</EditorButton>
        </FlexRow>
      </>}
    </FlexColumn>
  </CollapsibleSection>;
}
