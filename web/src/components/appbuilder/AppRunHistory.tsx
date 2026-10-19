import { useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useRunContent, useRuns } from "../../serverState/useRuns";
import { useRunInspection } from "../../hooks/useRunInspection";
import {
  creationProjectId,
  useWorkspaceTabsStore,
  type WorkspaceTabType
} from "../../stores/WorkspaceTabsStore";
import {
  AlertBanner,
  AudioPlayback,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  ResponsiveImage,
  ScrollArea,
  SPACING,
  Text,
  VideoPlayer,
  EmptyState
} from "../ui_primitives";
import { AskRunAgentButton } from "../runs/AskRunAgentButton";
import ReportBugButton from "../support/ReportBugButton";
import { StoredRunActivity } from "./puck/AgentActivityWidget";

interface AppRunHistoryProps {
  instanceId: string;
  selectedRunId: string | null;
  onSelect: (id: string | null) => void;
}

const mediaValue = z.object({
  type: z.enum(["image", "video", "audio"]),
  asset_id: z.string().optional(),
  uri: z.string().optional()
});
function ReadOnlyValue({ value }: { value: unknown }): React.ReactElement {
  const { t } = useTranslation();
  const media = mediaValue.safeParse(value);
  if (media.success) {
    const locator = media.data.asset_id
      ? `asset://${media.data.asset_id}`
      : media.data.uri;
    if (locator) {
      if (media.data.type === "image") {
        return (
          <ResponsiveImage
            locator={locator}
            alt={t("i18n-cont-appbuilder-10.history.historicalOutput")}
            fit="contain"
          />
        );
      }
      if (media.data.type === "video") {
        return (
          <VideoPlayer
            locator={locator}
            label={t("i18n-cont-appbuilder-10.history.historicalOutput")}
          />
        );
      }
      return <AudioPlayback locator={locator} />;
    }
    return (
      <Caption>{t("i18n-cont-appbuilder-10.history.mediaUnavailable")}</Caption>
    );
  }
  return (
    <Text
      component="pre"
      size="small"
      sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
    >
      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
    </Text>
  );
}

const documentTypes = new Set<WorkspaceTabType>([
  "storyboard",
  "timeline",
  "sketch",
  "script",
  "jsscript",
  "model3d",
  "workflow",
  "application",
  "game"
]);
function documentType(kind: string): WorkspaceTabType | null {
  for (const type of documentTypes) {
    if (type === kind) {
      return type;
    }
  }
  return null;
}

export default function AppRunHistory({
  instanceId,
  selectedRunId,
  onSelect
}: AppRunHistoryProps): React.ReactElement {
  const { t, i18n } = useTranslation();
  const history = useRuns({ kind: "app", instance_id: instanceId, limit: 20 });
  const detail = useRunContent(selectedRunId);
  const { openRunInspection } = useRunInspection();
  const openTab = useWorkspaceTabsStore((state) => state.openForegroundTab);
  const [pageIndex, setPageIndex] = useState(0);
  const records = history.data?.pages[pageIndex]?.runs ?? [];
  const older = async (): Promise<void> => {
    if (!history.data?.pages[pageIndex + 1]) {
      await history.fetchNextPage();
    }
    setPageIndex((index) => index + 1);
  };
  const candidate = detail.data?.run;
  const run =
    candidate?.app?.instance_id === instanceId ? candidate : undefined;
  const summary = detail.data?.summary;
  const error = history.error ?? detail.error;
  return (
    <FlexColumn gap={SPACING.md} padding={SPACING.lg}>
      <Text weight={600}>
        {t("i18n-cont-appbuilder-10.history.runHistory")}
      </Text>
      {error ? (
        <AlertBanner
          severity="error"
          action={
            <ReportBugButton
              context={{
                source: "operation-failure",
                summary: t("i18n-cont-appbuilder-10.history.loadFailed"),
                errorText: error.message
              }}
            />
          }
        >
          {error.message}
        </AlertBanner>
      ) : null}
      {history.isLoading ? (
        <LoadingSpinner
          text={t("i18n-cont-appbuilder-10.history.loadingHistory")}
        />
      ) : null}
      <ScrollArea maxHeight={360}>
        <FlexColumn gap={SPACING.sm}>
          {records.map((record) => (
            <FlexRow key={record.id} gap={SPACING.sm}>
              <EditorButton
                aria-pressed={selectedRunId === record.id}
                onClick={() => onSelect(record.id)}
              >
                {record.app?.operation_id ??
                  t("i18n-cont-appbuilder-10.history.unknownOperation")}{" "}
                · {record.status} ·{" "}
                {new Intl.DateTimeFormat(i18n.language, {
                  dateStyle: "medium",
                  timeStyle: "short"
                }).format(new Date(record.started_at))}
              </EditorButton>
              <Caption>
                {record.origin} ·{" "}
                {record.app?.cost_state === "settled"
                  ? new Intl.NumberFormat(i18n.language, {
                      style: "currency",
                      currency: "USD",
                      minimumFractionDigits: 4,
                      maximumFractionDigits: 4
                    }).format(record.app.actual_usd ?? 0)
                  : record.app?.cost_state === "unsettled"
                    ? t("i18n-cont-appbuilder-10.history.costPending")
                    : t("i18n-cont-appbuilder-10.history.costUnavailable")}
              </Caption>
              {record.app?.result_reference ? (
                <ResponsiveImage
                  locator={`asset://${record.app.result_reference.asset_id}`}
                  preferThumbnail
                  alt={t("i18n-cont-appbuilder-10.history.runResultThumbnail")}
                />
              ) : null}
            </FlexRow>
          ))}
        </FlexColumn>
      </ScrollArea>
      {!history.isLoading && !records.length ? (
        <EmptyState
          size="small"
          title={t("i18n-cont-appbuilder-10.history.noRuns")}
        />
      ) : null}
      <FlexRow gap={SPACING.sm}>
        {pageIndex > 0 ? (
          <EditorButton onClick={() => setPageIndex((index) => index - 1)}>
            {t("i18n-cont-appbuilder-10.history.newerRuns")}
          </EditorButton>
        ) : null}
        {history.hasNextPage || history.data?.pages[pageIndex + 1] ? (
          <EditorButton
            disabled={history.isFetchingNextPage}
            onClick={() => void older()}
          >
            {t("i18n-cont-appbuilder-10.history.olderRuns")}
          </EditorButton>
        ) : null}
      </FlexRow>
      {selectedRunId ? (
        <FlexColumn
          gap={SPACING.md}
          role="region"
          aria-label={t("i18n-cont-appbuilder-10.history.historicalRun")}
        >
          <FlexRow gap={SPACING.sm}>
            <Text weight={600}>
              {t("i18n-cont-appbuilder-10.history.historicalResult")}
            </Text>
            <EditorButton onClick={() => onSelect(null)}>
              {t("i18n-cont-appbuilder-10.history.closeSelection")}
            </EditorButton>
          </FlexRow>
          {candidate && !run ? (
            <Caption>
              {t("i18n-cont-appbuilder-10.history.runBelongsElsewhere")}
            </Caption>
          ) : null}
          {detail.isLoading ? (
            <LoadingSpinner
              text={t(
                "i18n-cont-appbuilder-10.history.loadingHistoricalResult"
              )}
            />
          ) : null}
          {run && !detail.error ? (
            <>
              <Caption>
                {run.app?.operation_id ??
                  t("i18n-cont-appbuilder-10.history.unknownOperation")}{" "}
                ·{" "}
                {t("i18n-cont-appbuilder-10.history.version", {
                  version:
                    run.app?.app_version ??
                    t("i18n-cont-appbuilder-10.history.draft")
                })}{" "}
                · {run.status}
              </Caption>
              <FlexRow gap={SPACING.sm}>
                <EditorButton
                  onClick={() =>
                    openRunInspection({
                      runId: run.id,
                      spanId: summary?.first_failed_span_id ?? undefined
                    })
                  }
                >
                  {t("i18n-cont-appbuilder-10.history.viewTrace")}
                </EditorButton>
                <AskRunAgentButton
                  runId={run.id}
                  spanId={summary?.first_failed_span_id ?? undefined}
                />
              </FlexRow>
              {summary?.content_state !== "available" ? (
                <Caption>
                  {t("i18n-cont-appbuilder-10.history.runContentState", {
                    state:
                      summary?.content_state ??
                      t("i18n-cont-appbuilder-10.history.unavailable")
                  })}
                </Caption>
              ) : (
                <>
                  {(["inputs", "outputs"] as const).map((field) => (
                    <FlexColumn key={field} gap={SPACING.sm}>
                      <Text weight={600}>
                        {t(`i18n-cont-appbuilder-10.history.${field}`)}
                      </Text>
                      {Object.entries(run.app?.[field] ?? {}).map(
                        ([name, value]) => (
                          <FlexColumn key={name}>
                            <Caption>{name}</Caption>
                            <ReadOnlyValue value={value} />
                          </FlexColumn>
                        )
                      )}
                      {!Object.keys(run.app?.[field] ?? {}).length ? (
                        <Caption>
                          {run.app?.content_limited
                            ? t("i18n-cont-appbuilder-10.history.contentLimit")
                            : t("i18n-cont-appbuilder-10.history.noValues")}
                        </Caption>
                      ) : null}
                    </FlexColumn>
                  ))}
                </>
              )}
              {run.app?.content_limited || summary?.truncated ? (
                <Caption>
                  {t("i18n-cont-appbuilder-10.history.contentLimited")}
                </Caption>
              ) : null}
              {summary?.incomplete ? (
                <Caption>
                  {t("i18n-cont-appbuilder-10.history.recordingIncomplete")}
                </Caption>
              ) : null}
              {summary?.documents.map((document) => {
                const type = documentType(document.kind);
                return type ? (
                  <EditorButton
                    key={`${document.kind}:${document.id}`}
                    onClick={() =>
                      openTab({
                        type,
                        ref: document.id,
                        mode: "view",
                        projectId: creationProjectId()
                      })
                    }
                  >
                    {t("i18n-cont-appbuilder-10.history.openCurrentDocument", {
                      kind: document.kind
                    })}
                  </EditorButton>
                ) : (
                  <Caption key={`${document.kind}:${document.id}`}>
                    {t(
                      "i18n-cont-appbuilder-10.history.documentTypeUnavailable",
                      { kind: document.kind }
                    )}
                  </Caption>
                );
              })}
              <StoredRunActivity runId={run.id} />
            </>
          ) : null}
        </FlexColumn>
      ) : null}
    </FlexColumn>
  );
}
