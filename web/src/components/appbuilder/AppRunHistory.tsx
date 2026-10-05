import { useState } from "react";
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
  VideoPlayer
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
            alt="Historical output"
            fit="contain"
          />
        );
      }
      if (media.data.type === "video") {
        return <VideoPlayer locator={locator} />;
      }
      return <AudioPlayback locator={locator} />;
    }
    return <Caption>Media reference unavailable.</Caption>;
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
      <Text weight={600}>Run history</Text>
      {error ? (
        <AlertBanner
          severity="error"
          action={
            <ReportBugButton
              context={{
                source: "operation-failure",
                summary: "Run history could not load",
                errorText: error.message
              }}
            />
          }
        >
          {error.message}
        </AlertBanner>
      ) : null}
      {history.isLoading ? <LoadingSpinner text="Loading history" /> : null}
      <ScrollArea maxHeight={360}>
        <FlexColumn gap={SPACING.sm}>
          {records.map((record) => (
            <FlexRow key={record.id} gap={SPACING.sm}>
              <EditorButton
                aria-pressed={selectedRunId === record.id}
                onClick={() => onSelect(record.id)}
              >
                {record.app?.operation_id ?? "Unknown operation"} ·{" "}
                {record.status} · {record.started_at}
              </EditorButton>
              <Caption>
                {record.origin} ·{" "}
                {record.app?.cost_state === "settled"
                  ? `$${record.app.actual_usd?.toFixed(4)}`
                  : record.app?.cost_state === "unsettled"
                    ? "Cost pending"
                    : "Cost unavailable"}
              </Caption>
              {record.app?.result_reference ? (
                <ResponsiveImage
                  locator={`asset://${record.app.result_reference.asset_id}`}
                  preferThumbnail
                  alt="Run result thumbnail"
                />
              ) : null}
            </FlexRow>
          ))}
        </FlexColumn>
      </ScrollArea>
      {!history.isLoading && !records.length ? (
        <Caption>No runs recorded for this instance.</Caption>
      ) : null}
      <FlexRow gap={SPACING.sm}>
        {pageIndex > 0 ? (
          <EditorButton onClick={() => setPageIndex((index) => index - 1)}>
            Newer runs
          </EditorButton>
        ) : null}
        {history.hasNextPage || history.data?.pages[pageIndex + 1] ? (
          <EditorButton
            disabled={history.isFetchingNextPage}
            onClick={() => void older()}
          >
            Older runs
          </EditorButton>
        ) : null}
      </FlexRow>
      {selectedRunId ? (
        <FlexColumn gap={SPACING.md} role="region" aria-label="Historical run">
          <FlexRow gap={SPACING.sm}>
            <Text weight={600}>Historical result (read-only)</Text>
            <EditorButton onClick={() => onSelect(null)}>
              Close history selection
            </EditorButton>
          </FlexRow>
          {candidate && !run ? (
            <Caption>
              This run does not belong to the selected instance.
            </Caption>
          ) : null}
          {detail.isLoading ? (
            <LoadingSpinner text="Loading historical result" />
          ) : null}
          {run && !detail.error ? (
            <>
              <Caption>
                {run.app?.operation_id ?? "Unknown operation"} · version{" "}
                {run.app?.app_version ?? "draft"} · {run.status}
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
                  View trace
                </EditorButton>
                <AskRunAgentButton
                  runId={run.id}
                  spanId={summary?.first_failed_span_id ?? undefined}
                />
              </FlexRow>
              {summary?.content_state !== "available" ? (
                <Caption>
                  Run content {summary?.content_state ?? "unavailable"}.
                </Caption>
              ) : (
                <>
                  {(["inputs", "outputs"] as const).map((field) => (
                    <FlexColumn key={field} gap={SPACING.sm}>
                      <Text weight={600}>
                        {field === "inputs" ? "Inputs" : "Outputs"}
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
                            ? "Content exceeds the read limit."
                            : "No values recorded."}
                        </Caption>
                      ) : null}
                    </FlexColumn>
                  ))}
                </>
              )}
              {run.app?.content_limited || summary?.truncated ? (
                <Caption>Some recorded content was limited.</Caption>
              ) : null}
              {summary?.incomplete ? (
                <Caption>Recording is incomplete.</Caption>
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
                    Open current {document.kind}
                  </EditorButton>
                ) : (
                  <Caption key={`${document.kind}:${document.id}`}>
                    Document type unavailable: {document.kind}
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
