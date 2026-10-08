import { useState, type ReactElement } from "react";
import { trpc, trpcClient } from "../../trpc/client";
import { getGameDraftStore } from "../../stores/game/GameDraftStore";
import { EmptyState, FlexColumn, LoadingSpinner, SPACING } from "../ui_primitives";
import ReportBugButton from "../support/ReportBugButton";
import GameRevisions from "./panels/revisions/GameRevisions";

interface GameDraftRecoveryProps {
  readonly refId: string;
}

function isMissingDraft(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("data" in error)) { return false; }
  const data = error.data;
  return !!data && typeof data === "object" && "code" in data && data.code === "PRECONDITION_FAILED";
}

export default function GameDraftRecovery({ refId }: GameDraftRecoveryProps): ReactElement {
  const published = trpc.games.get.useQuery({ id: refId });
  const revisions = trpc.games.revisions.useQuery({ id: refId });
  const queries = trpc.useUtils();
  const [restoring, setRestoring] = useState(false);
  const [recoveryState, setRecoveryState] = useState<"ready" | "restored" | "refresh-failed">("ready");
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const error = restoreError ?? published.error?.message ?? revisions.error?.message;

  async function restore(revision: string): Promise<void> {
    if (!published.data || restoring || recoveryState !== "ready") { return; }
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
        setRestoreError("Draft restored, but the editor could not refresh. Reload the game to continue.");
      } else {
        setRestoreError(failure instanceof Error ? failure.message : "Could not restore the selected revision.");
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
          setRestoreError("Could not refresh the draft after the failed restore. Reload the game before trying again.");
        }
      }
    } finally {
      setRestoring(false);
    }
  }

  return <FlexColumn gap={SPACING.sm}>
    <EmptyState variant="error" title="Draft source unavailable"
      description="Choose a published revision to replace the unavailable draft. This cannot recover unpublished edits from the missing source." />
    {published.isPending || revisions.isPending ? <LoadingSpinner text="Loading published revisions" /> :
      <GameRevisions revisions={revisions.data ?? []} busy={restoring || recoveryState !== "ready" || !published.data} onRestore={restore} />}
    {error && <EmptyState variant="error" title={recoveryState === "restored" ? "Draft restored" : "Could not restore draft"} description={error} />}
    <ReportBugButton context={{ source: "panel-crash", summary: "Game draft source is unavailable",
      errorText: error ?? "Game draft source is unavailable", nodeDetail: `Game: ${refId}` }} />
  </FlexColumn>;
}
