/**
 * Runs an app that has its own `applications` record.
 *
 * A released app runs its **release**, not the canvas: the server pins the
 * document and every workflow graph at publish time, and this renders that
 * snapshot. Editing the app afterwards changes what the Design view shows and
 * nothing about what runs here until the next publish. With nothing released
 * the draft runs instead, which is what makes an unpublished app testable.
 */
import React, { useMemo } from "react";
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
  EmptyState,
  FlexColumn,
  LoadingSpinner,
  SPACING
} from "../ui_primitives";
import { parseApplicationDocument, type AppDocument } from "./appData";
import AppRuntimeView from "./AppRuntimeView";

export interface ApplicationRunViewProps {
  applicationId: string;
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
  applicationId
}) => {
  const { data: application, isLoading } = useApplication(applicationId);
  const { data: release, isLoading: releaseLoading } =
    useReleasedApplicationDocument(applicationId);
  const fetchWorkflow = useWorkflowManager((s) => s.fetchWorkflow);

  const document = useMemo<AppDocument | null>(() => {
    const source = release?.document ?? application?.document;
    return source ? parseApplicationDocument(source) : null;
  }, [application?.document, release?.document]);

  // Graphs the release froze. A snapshot published before releases pinned
  // anything carries none, and those operations fall back to the live workflow.
  const workflowOverrides = useMemo<Record<string, Workflow>>(() => {
    const overrides: Record<string, Workflow> = {};
    for (const pinned of release?.workflows ?? []) {
      if (!pinned.graph) continue;
      overrides[pinned.workflowId] = pinnedWorkflow(
        pinned.workflowId,
        application?.name ?? pinned.workflowId,
        pinned.graph
      );
    }
    return overrides;
  }, [application?.name, release?.workflows]);

  // The host workflow: the first operation's, pinned when the release pinned it.
  const hostWorkflowId = document?.operations[0]?.workflowId ?? "";
  const pinnedHost = workflowOverrides[hostWorkflowId];
  const { data: liveHost } = useQuery({
    queryKey: ["app-run-workflow", hostWorkflowId],
    queryFn: async () => await fetchWorkflow(hostWorkflowId),
    enabled: Boolean(hostWorkflowId) && !pinnedHost,
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: false
  });
  // An app need not run a workflow at all — widgets over variables and static
  // content are a whole app. With no operation bound, the runtime still wants
  // a workflow shape, so it gets an empty one that contributes no IO.
  const workflow = useMemo<Workflow | undefined>(() => {
    if (pinnedHost ?? liveHost) return pinnedHost ?? liveHost;
    if (hostWorkflowId) return undefined;
    return pinnedWorkflow(applicationId, application?.name ?? "", {
      nodes: [],
      edges: []
    });
  }, [applicationId, application?.name, hostWorkflowId, liveHost, pinnedHost]);

  if (isLoading || releaseLoading) {
    return <LoadingSpinner size="large" text="Loading app" />;
  }

  if (!document || document.ui.content.length === 0) {
    return (
      <EmptyState
        variant="empty"
        title="Nothing to run yet"
        description="Add widgets in the Design view, then run the app here."
      />
    );
  }

  if (!workflow) {
    return (
      <EmptyState
        variant="error"
        title="Workflow unavailable"
        description={`This app runs workflow ${hostWorkflowId}, which could not be loaded.`}
      />
    );
  }

  return (
    <FlexColumn gap={0} fullWidth sx={{ height: "100%", minHeight: 0 }}>
      <Caption color="secondary" sx={{ px: SPACING.lg, py: SPACING.xs }}>
        {release
          ? `Running released version ${release.version}`
          : "Running the draft — this app has no released version"}
      </Caption>
      <AppRuntimeView
        workflow={workflow}
        data={document.ui as Data}
        document={document}
        application={{ id: applicationId, version: release?.version }}
        workflowOverrides={workflowOverrides}
      />
    </FlexColumn>
  );
};

export default ApplicationRunView;
