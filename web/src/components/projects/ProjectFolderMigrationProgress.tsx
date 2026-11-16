import { useTranslation } from "react-i18next";

import {
  useDismissProjectFolderMigration,
  usePauseProjectFolderMigration,
  useResumeProjectFolderMigration,
  useRetryProjectFolderMigration,
  type ProjectFolderMigrationStatus
} from "../../hooks/useProjectFolderMigration";
import ErrorBanner from "../support/ErrorBanner";
import { revealLabelKey } from "../workspaces/projectFolderPaths";
import {
  AlertBanner,
  EditorButton,
  FlexColumn,
  FlexRow,
  ProgressBar,
  SPACING,
  Surface,
  Text,
  Z_INDEX
} from "../ui_primitives";
import { fileManagerKind } from "../../utils/platform";

/** Failures listed by name. The rest are counted. */
const LISTED_FAILURES = 5;

interface ProjectFolderMigrationProgressProps {
  readonly status: ProjectFolderMigrationStatus;
}

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * The app-level progress of the move into project folders: how many files
 * moved, which project is being worked on, pause and resume, what could not
 * move with a retry, and where the files are once it is done.
 */
const ProjectFolderMigrationProgress = ({
  status
}: ProjectFolderMigrationProgressProps) => {
  const { t } = useTranslation();
  const pause = usePauseProjectFolderMigration();
  const resume = useResumeProjectFolderMigration();
  const retry = useRetryProjectFolderMigration();
  const dismiss = useDismissProjectFolderMigration();

  const { state, progress, location } = status;
  const done = state === "done";
  const paused = state === "paused";
  const percent =
    progress.total > 0 ? (progress.done / progress.total) * 100 : done ? 100 : 0;
  const preparing =
    !done && !paused && (progress.phase === "folders" || progress.phase === "files");
  const title = done
    ? t("projectFolder.migration.doneTitle")
    : paused
      ? t("projectFolder.migration.pausedTitle")
      : t("projectFolder.migration.progressTitle");
  const actionError = pause.error ?? resume.error ?? retry.error ?? dismiss.error;
  const busy = pause.isPending || resume.isPending || retry.isPending || dismiss.isPending;
  const canReveal = done && Boolean(location && window.api?.showItemInFolder);

  return (
    <Surface
      role="region"
      aria-label={t("projectFolder.migration.progressRegion")}
      elevation={3}
      rounded="medium"
      sx={(theme) => ({
        position: "fixed",
        right: theme.spacing(SPACING.xl),
        bottom: theme.spacing(SPACING.xl),
        zIndex: Z_INDEX.toast,
        width: `min(${theme.spacing(45)}, calc(100vw - ${theme.spacing(SPACING.xl * 2)}))`,
        p: SPACING.lg
      })}
    >
      <FlexColumn gap={SPACING.md}>
        <Text size="normal" weight={600}>
          {title}
        </Text>
        <ProgressBar
          value={percent}
          label={t("projectFolder.migration.progressCount", {
            done: progress.done,
            total: progress.total
          })}
          progressVariant={preparing ? "indeterminate" : "determinate"}
        />
        <Text size="small" aria-live="polite">
          {t("projectFolder.migration.progressCount", {
            done: progress.done,
            total: progress.total
          })}
        </Text>
        {!done && progress.phase === "folders" ? (
          <Text size="small" color="secondary">
            {t("projectFolder.migration.phaseFolders")}
          </Text>
        ) : null}
        {!done && progress.phase === "files" ? (
          <Text size="small" color="secondary">
            {t("projectFolder.migration.phaseFiles")}
          </Text>
        ) : null}
        {!done && progress.current_project ? (
          <Text size="small" color="secondary" sx={{ overflowWrap: "anywhere" }}>
            {t("projectFolder.migration.currentProject", {
              project: progress.current_project
            })}
          </Text>
        ) : null}
        {done && location ? (
          <Text size="small" sx={{ overflowWrap: "anywhere" }}>
            {t("projectFolder.migration.donePath", { path: location })}
          </Text>
        ) : null}
        {status.failure_count > 0 ? (
          <AlertBanner
            severity="warning"
            compact
            title={t("projectFolder.migration.failuresTitle", {
              count: status.failure_count
            })}
            action={
              done || state === "running" ? (
                <EditorButton
                  size="small"
                  variant="outlined"
                  onClick={() => retry.mutate()}
                  disabled={busy}
                >
                  {t("projectFolder.migration.retry")}
                </EditorButton>
              ) : undefined
            }
          >
            <FlexColumn component="ul" gap={SPACING.micro} sx={{ m: 0, pl: SPACING.lg }}>
              {status.failures.slice(0, LISTED_FAILURES).map((failure) => (
                <Text
                  key={`${failure.kind}:${failure.id}`}
                  component="li"
                  size="small"
                  sx={{ overflowWrap: "anywhere" }}
                >
                  {t("projectFolder.migration.failureItem", {
                    name: failure.project_name && failure.kind === "asset"
                      ? `${failure.project_name} / ${failure.name}`
                      : failure.name,
                    reason: failure.reason
                  })}
                </Text>
              ))}
            </FlexColumn>
            {status.failure_count > LISTED_FAILURES ? (
              <Text size="small" color="secondary">
                {t("projectFolder.migration.failuresMore", {
                  count: status.failure_count - LISTED_FAILURES
                })}
              </Text>
            ) : null}
          </AlertBanner>
        ) : null}
        {actionError ? (
          <ErrorBanner
            compact
            report={{
              source: "operation-failure",
              summary: "Could not change the project folder migration",
              errorText: errorText(actionError)
            }}
          >
            {t("projectFolder.migration.actionError", { error: errorText(actionError) })}
          </ErrorBanner>
        ) : null}
        <FlexRow gap={SPACING.sm} justify="flex-end" wrap>
          {state === "running" || state === "confirmed" ? (
            <EditorButton
              size="small"
              variant="outlined"
              onClick={() => pause.mutate()}
              disabled={busy}
            >
              {t("projectFolder.migration.pause")}
            </EditorButton>
          ) : null}
          {paused ? (
            <EditorButton
              size="small"
              variant="contained"
              onClick={() => resume.mutate()}
              disabled={busy}
            >
              {t("projectFolder.migration.resume")}
            </EditorButton>
          ) : null}
          {canReveal && location ? (
            <EditorButton
              size="small"
              variant="outlined"
              onClick={() => void window.api?.showItemInFolder?.(location)}
            >
              {t(revealLabelKey(fileManagerKind()))}
            </EditorButton>
          ) : null}
          {done ? (
            <EditorButton
              size="small"
              variant="contained"
              onClick={() => dismiss.mutate()}
              disabled={busy}
            >
              {t("projectFolder.migration.close")}
            </EditorButton>
          ) : null}
        </FlexRow>
      </FlexColumn>
    </Surface>
  );
};

export default ProjectFolderMigrationProgress;
