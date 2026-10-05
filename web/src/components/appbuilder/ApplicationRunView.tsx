/**
 * Runs an app that has its own `applications` record.
 *
 * A released app runs its **release**, not the canvas: the server pins the
 * document and every workflow graph at publish time, and this renders that
 * snapshot. Editing the app afterwards changes what the Design view shows and
 * nothing about what runs here until the next publish. With nothing released
 * the draft runs instead, which is what makes an unpublished app testable.
 */
import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Data } from "@puckeditor/core";

import { Workflow } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import {
  useApplication,
  useReleasedApplicationDocument
} from "../../hooks/useApplications";
import {
  Caption,
  AlertBanner,
  EditorButton,
  EmptyState,
  FlexColumn,
  LoadingSpinner,
  SPACING
} from "../ui_primitives";
import { parseApplicationDocument, type AppDocument } from "./appData";
import type { ServerAppInstance } from "./runtime/appInstanceApi";
import AppRuntimeView from "./AppRuntimeView";
import ReportBugButton from "../support/ReportBugButton";

interface ApplicationRunViewProps {
  applicationId: string;
  instanceId?: string;
  selectedRunId?: string | null;
  onSelectRun?: (id: string | null) => void;
  onInstanceReady?: (instance: ServerAppInstance) => void;
  /** Run the current draft for the owner without changing the released app. */
  previewDraft?: boolean;
  draftDocument?: AppDocument;
}

/** A pinned graph, wrapped as the workflow shape the runtime and runner want. */
const pinnedWorkflow = (
  id: string,
  name: string,
  graph: Workflow["graph"]
): Workflow => ({
  id,
  name,
  description: "",
  graph,
  access: "private",
  created_at: "",
  updated_at: ""
});

const ApplicationRunView: React.FC<ApplicationRunViewProps> = ({
  applicationId,
  instanceId,
  selectedRunId,
  onSelectRun,
  onInstanceReady,
  previewDraft = false,
  draftDocument
}) => {
  const [executionEpoch, setExecutionEpoch] = useState(0);
  const hasPinnedInstance = Boolean(instanceId) && !previewDraft;
  const applicationQuery = useApplication(applicationId);
  const { data: application, isLoading } = applicationQuery;
  const releaseQuery = useReleasedApplicationDocument(applicationId);
  const { data: release, isLoading: releaseLoading } = releaseQuery;
  const fetchWorkflow = useWorkflowManager((s) => s.fetchWorkflow);

  const document = useMemo<AppDocument | null>(() => {
    const source = previewDraft
      ? (draftDocument ?? application?.document)
      : (release?.document ?? application?.document);
    return source ? parseApplicationDocument(source) : null;
  }, [application?.document, draftDocument, previewDraft, release?.document]);

  // Graphs the release froze. A snapshot published before releases pinned
  // anything carries none, and those operations fall back to the live workflow.
  const workflowOverrides = useMemo<Record<string, Workflow>>(() => {
    const overrides: Record<string, Workflow> = {};
    for (const pinned of previewDraft ? [] : (release?.workflows ?? [])) {
      if (!pinned.graph) continue;
      overrides[pinned.workflowId] = pinnedWorkflow(
        pinned.workflowId,
        application?.name ?? pinned.workflowId,
        pinned.graph
      );
    }
    return overrides;
  }, [application?.name, previewDraft, release?.workflows]);

  // The host workflow: the first operation's, pinned when the release pinned it.
  const hostWorkflowId = document?.operations[0]?.workflowId ?? "";
  const pinnedHost = workflowOverrides[hostWorkflowId];
  const hostQuery = useQuery({
    queryKey: ["app-run-workflow", hostWorkflowId],
    queryFn: async () => await fetchWorkflow(hostWorkflowId),
    enabled:
      Boolean(hostWorkflowId) &&
      !hasPinnedInstance &&
      !pinnedHost &&
      (previewDraft || (!releaseLoading && !releaseQuery.isError)),
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: false
  });
  const liveHost = hostQuery.data;
  // An app need not run a workflow at all — widgets over variables and static
  // content are a whole app. With no operation bound, the runtime still wants
  // a workflow shape, so it gets an empty one that contributes no IO.
  const workflow = useMemo<Workflow | undefined>(() => {
    if (hasPinnedInstance) {
      return pinnedWorkflow(applicationId, application?.name ?? "", {
        nodes: [],
        edges: []
      });
    }
    if (pinnedHost ?? liveHost) return pinnedHost ?? liveHost;
    if (hostWorkflowId) return undefined;
    return pinnedWorkflow(applicationId, application?.name ?? "", {
      nodes: [],
      edges: []
    });
  }, [
    applicationId,
    application?.name,
    hasPinnedInstance,
    hostWorkflowId,
    liveHost,
    pinnedHost
  ]);

  if (isLoading || (!previewDraft && releaseLoading)) {
    return <LoadingSpinner size="large" text="Loading app" />;
  }

  const failedQuery = applicationQuery.isError
    ? applicationQuery
    : !previewDraft && releaseQuery.isError
      ? releaseQuery
      : null;
  if (failedQuery) {
    const title = applicationQuery.isError
      ? "Could not load app"
      : "Could not load released app";
    return (
      <AlertBanner
        severity="error"
        action={
          <>
            <EditorButton onClick={() => void failedQuery.refetch()}>
              Retry
            </EditorButton>
            <ReportBugButton
              context={{
                source: "notification",
                summary: title,
                errorText: failedQuery.error?.message
              }}
            />
          </>
        }
      >
        {title}
      </AlertBanner>
    );
  }

  if (!document || (!hasPinnedInstance && document.ui.content.length === 0)) {
    return (
      <EmptyState
        variant="empty"
        title="Nothing to run yet"
        description="Add widgets in the Design view, then run the app here."
      />
    );
  }

  if (
    !hasPinnedInstance &&
    !pinnedHost &&
    hostWorkflowId &&
    hostQuery.isLoading
  ) {
    return <LoadingSpinner size="large" text="Loading workflow" />;
  }

  if (!workflow) {
    return (
      <EmptyState
        variant="error"
        title="Workflow unavailable"
        description={
          <>
            This app runs workflow {hostWorkflowId}, which could not be loaded.
            <ReportBugButton
              context={{
                source: "notification",
                summary: "App workflow unavailable",
                errorText: hostQuery.error?.message
              }}
            />
          </>
        }
        actionText="Retry"
        onAction={() => void hostQuery.refetch()}
      />
    );
  }

  return (
    <FlexColumn gap={0} fullWidth sx={{ height: "100%", minHeight: 0 }}>
      {previewDraft && (
        <Caption color="secondary" sx={{ px: SPACING.lg, py: SPACING.xs }}>
          Previewing current draft. This does not change the released app.
        </Caption>
      )}
      <AppRuntimeView
        key={`${previewDraft ? "preview" : (instanceId ?? "default")}:${executionEpoch}`}
        onAdvanced={() => setExecutionEpoch((epoch) => epoch + 1)}
        onInstanceReady={onInstanceReady}
        selectedRunId={selectedRunId}
        onSelectRun={onSelectRun}
        workflow={workflow}
        instanceId={previewDraft ? undefined : instanceId}
        previewDraft={previewDraft}
        data={document.ui as Data}
        document={document}
        application={{
          id: applicationId,
          version: previewDraft ? undefined : release?.version
        }}
        workflowOverrides={workflowOverrides}
      />
    </FlexColumn>
  );
};

export default ApplicationRunView;
