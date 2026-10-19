import { useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { trpc, trpcClient } from "../../trpc/client";
import { getGameDraftStore } from "../../stores/game/GameDraftStore";
import { saveBlobAsFile } from "../../utils/downloadResponse";
import { EditorButton, EmptyState, FlexColumn, LoadingSpinner, SPACING, Text } from "../ui_primitives";
import ReportBugButton from "../support/ReportBugButton";
import GameRevisions from "./panels/revisions/GameRevisions";

interface GameDraftRecoveryProps {
  readonly refId: string;
}

export function isMissingDraft(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("data" in error)) { return false; }
  const data = error.data;
  return !!data && typeof data === "object" && "code" in data && data.code === "PRECONDITION_FAILED";
}

export default function GameDraftRecovery({ refId }: GameDraftRecoveryProps): ReactElement {
  const { t } = useTranslation();
  const published = trpc.games.get.useQuery({ id: refId }, { staleTime: 15_000 });
  const revisions = trpc.games.revisions.useQuery({ id: refId }, { staleTime: 15_000 });
  const queries = trpc.useUtils();
  const [restoring, setRestoring] = useState(false);
  const [recoveryState, setRecoveryState] = useState<"ready" | "restored" | "refresh-failed">("ready");
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [localCopy] = useState(() => {
    const state = getGameDraftStore(refId).getState();
    return state.document ? JSON.stringify({ document: state.document, pendingOps: state.pendingOps,
      commandHistory: state.commandHistory, baseUpdatedAt: state.baseUpdatedAt }, null, 2) : null;
  });
  const [exported, setExported] = useState(false);
  const needsExport = localCopy !== null && !exported;
  const error = restoreError ?? published.error?.message ?? revisions.error?.message;

  function exportLocalCopy(): void {
    if (!localCopy) { return; }
    try {
      saveBlobAsFile(new Blob([localCopy], { type: "application/json" }),
        `game-${refId}-local-draft.json`);
      setExported(true);
    } catch {
      setRestoreError(t("screen_game.recovery.exportFailed"));
    }
  }

  async function restore(revision: string): Promise<void> {
    if (!published.data || restoring || recoveryState !== "ready" || needsExport) { return; }
    setRestoring(true);
    setRestoreError(null);
    let committed = false;
    try {
      const result = await trpcClient.games.restoreDraft.mutate({ id: refId,
        baseUpdatedAt: published.data.game.draftUpdatedAt, revision });
      committed = true;
      setRecoveryState("restored");
      getGameDraftStore(refId).getState().load(result.document, result.game.draftUpdatedAt);
      queries.games.getDraft.setData({ id: refId }, result);
      await queries.games.draftChanges.invalidate({ id: refId }, undefined, { throwOnError: true });
    } catch (failure) {
      if (committed) {
        setRestoreError(t("screen_game.recovery.restoredRefreshFailed"));
      } else {
        setRestoreError(failure instanceof Error ? failure.message : t("screen_game.recovery.restoreFailed"));
        try {
          const currentPublished = await trpcClient.games.get.query({ id: refId });
          try {
            const currentDraft = await trpcClient.games.getDraft.query({ id: refId });
            setRecoveryState("restored");
            setRestoreError(null);
            queries.games.getDraft.setData({ id: refId }, currentDraft);
          } catch (readError) {
            if (!isMissingDraft(readError)) { throw readError; }
            queries.games.get.setData({ id: refId }, currentPublished);
          }
        } catch {
          setRecoveryState("refresh-failed");
          setRestoreError(t("screen_game.recovery.refreshAfterFailure"));
        }
      }
    } finally {
      setRestoring(false);
    }
  }

  return <FlexColumn gap={SPACING.sm}>
    <EmptyState variant="error" title={t("screen_game.recovery.sourceUnavailable")}
      description={t("screen_game.recovery.sourceUnavailableDescription")} />
    {localCopy && <>
      <Text>{t("screen_game.recovery.exportBeforeRestore")}</Text>
      <EditorButton onClick={exportLocalCopy}>{t("screen_game.recovery.exportLocalDraft")}</EditorButton>
    </>}
    {published.isPending || revisions.isPending ? <LoadingSpinner text={t("screen_game.recovery.loadingRevisions")} /> :
      <GameRevisions revisions={revisions.data ?? []} busy={restoring || recoveryState !== "ready" || !published.data || needsExport} onRestore={restore} />}
    {error && <EmptyState variant="error" title={recoveryState === "restored" ? t("screen_game.recovery.draftRestored") : t("screen_game.recovery.restoreFailed")} description={error} />}
    <ReportBugButton context={{ source: "panel-crash", summary: t("screen_game.recovery.sourceUnavailable"),
      errorText: error ?? t("screen_game.recovery.sourceUnavailable"), nodeDetail: t("screen_game.player.gameDetail", { id: refId }) }} />
  </FlexColumn>;
}
