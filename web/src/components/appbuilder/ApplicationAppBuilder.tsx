import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";

import {
  AlertBanner,
  EditorButton,
  EmptyState,
  FlexColumn,
  LoadingSpinner,
  SPACING
} from "../ui_primitives";
import type { OperationBinding } from "@nodetool-ai/app-runtime";
import { Workflow } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  isConcurrencyConflict,
  useApplication,
  useUpdateApplication
} from "../../hooks/useApplications";
import { trpc } from "../../trpc/client";
import {
  createEmptyDocument,
  parseApplicationDocument,
  type AppDocument
} from "./appData";
import AppBuilderShell from "./AppBuilderShell";
import { registerDocumentSync } from "../../stores/documentSync";

export interface ApplicationAppBuilderProps {
  applicationId: string;
}

/**
 * A workflow-shaped stand-in for an app that has no operation bound yet, so a
 * brand-new app still opens on a canvas. It contributes no bindable inputs or
 * outputs.
 */
const placeholderWorkflow = (id: string, name: string): Workflow => ({
  id,
  name,
  description: "",
  graph: { nodes: [], edges: [] },
  access: "private",
  created_at: "",
  updated_at: ""
});

/**
 * The builder targeting an `applications` record: loads through
 * `applications.get`, saves the whole document through `applications.update`.
 *
 * The save carries `baseUpdatedAt`, so the server compare-and-swaps against the
 * row this editor read. A losing write is reported and the canvas is left
 * untouched — the user's edits are still there to re-apply after reloading.
 */
const ApplicationAppBuilder: React.FC<ApplicationAppBuilderProps> = ({
  applicationId
}) => {
  const { data: application, isLoading, isError, error } =
    useApplication(applicationId);
  const updateApplication = useUpdateApplication();
  const addNotification = useNotificationStore((s) => s.addNotification);
  const utils = trpc.useUtils();
  const fetchWorkflow = useWorkflowManager((s) => s.fetchWorkflow);

  // Why the "changed elsewhere" banner is up: a save the server rejected, or
  // a write that landed on the row while this canvas was open (agent doc-ops,
  // CLI, another tab). Both mean the same thing to the user — reload or lose
  // the other side — but they read differently.
  const [conflict, setConflict] = useState<"save-rejected" | "external" | null>(
    null
  );
  // Bumped to remount the editor when the user asks for the latest document.
  const [seed, setSeed] = useState(0);
  // The canvas's live operations, reported by the shell. Null until it mounts.
  const [liveOperations, setLiveOperations] = useState<ReadonlyArray<
    OperationBinding
  > | null>(null);

  // The row revision this canvas is based on. Kept in a ref because the
  // `resource_change` for our own save can beat the mutation's cache write,
  // and comparing against a stale `application.updatedAt` would raise the
  // banner on the user's own save.
  const revisionRef = useRef<string | null>(null);
  useEffect(() => {
    if (application?.updatedAt) revisionRef.current = application.updatedAt;
  }, [application?.updatedAt]);

  // This editor saves on command, so its canvas may hold edits nobody has
  // seen — it never takes the server copy on its own. An outside write raises
  // the banner, and the user decides.
  useEffect(
    () =>
      registerDocumentSync("application", applicationId, {
        localRevision: () => revisionRef.current,
        isDirty: () => true,
        reload: () => {},
        onExternalChange: () => setConflict("external")
      }),
    [applicationId]
  );

  const document = useMemo<AppDocument | null>(() => {
    if (!application) return null;
    return (
      parseApplicationDocument(application.document) ??
      createEmptyDocument(application.name)
    );
  }, [application]);

  // The operations the canvas holds, which lead the saved row: the agent binds
  // a workflow to an operation long before anything saves. Deriving the loads
  // from `document` alone left that workflow unfetched, so the binding targets
  // for the operation being authored came back `ioAvailable: false` and the
  // agent had to guess its binding tokens.
  const operations = liveOperations ?? document?.operations ?? [];

  const operationWorkflowId = operations[0]?.workflowId ?? "";

  // Every workflow the app's operations run, not just the first: a binding
  // authored on the second operation is offered that workflow's own surface.
  // Keyed on the ids themselves so a re-render that changed no operation does
  // not hand `useQueries` a new array.
  const workflowIdKey = [
    ...new Set(operations.map((operation) => operation.workflowId).filter(Boolean))
  ]
    .sort()
    .join("|");
  const workflowIds = useMemo(
    () => (workflowIdKey ? workflowIdKey.split("|") : []),
    [workflowIdKey]
  );

  const workflowQueries = useQueries({
    queries: workflowIds.map((id) => ({
      queryKey: ["app-builder-workflow", id],
      queryFn: async () => await fetchWorkflow(id),
      staleTime: 0,
      refetchOnWindowFocus: false,
      retry: false
    }))
  });

  const fetched: Record<string, Workflow> = {};
  workflowIds.forEach((id, index) => {
    const data = workflowQueries[index]?.data;
    if (data) fetched[id] = data;
  });
  const fetchedRef = useRef(fetched);
  fetchedRef.current = fetched;
  // Which graphs have arrived, and when each last changed. The graphs are read
  // from the ref, so the map keeps its identity across renders that changed
  // nothing -- but keying on ids alone would pin the first copy of a graph
  // forever, and a refetched workflow would go on serving the binding pickers
  // a surface it no longer has.
  const fetchedKey = workflowIds
    .map((id, index) => `${id}:${workflowQueries[index]?.dataUpdatedAt ?? 0}`)
    .join("|");
  const operationWorkflows = useMemo(
    () => fetchedRef.current,
    [fetchedKey]
  );

  const workflow = operationWorkflows[operationWorkflowId];

  const editorWorkflow = useMemo(
    () =>
      workflow ?? placeholderWorkflow(applicationId, application?.name ?? ""),
    [application?.name, applicationId, workflow]
  );

  const handleSave = useCallback(
    async (next: AppDocument) => {
      if (!application) return;
      try {
        const saved = await updateApplication.mutateAsync({
          id: application.id,
          // Spread into fresh literals: the router's schema types `ui` as an
          // open record, which an interface does not satisfy directly.
          document: { ...next, ui: { ...next.ui } },
          // Compare-and-swap against the row this editor loaded.
          baseUpdatedAt: application.updatedAt
        });
        setConflict(null);
        revisionRef.current = saved.updatedAt;
        addNotification({ type: "success", content: "App saved" });
      } catch (err) {
        if (isConcurrencyConflict(err)) {
          setConflict("save-rejected");
          addNotification({
            type: "error",
            alert: true,
            content: `"${application.name}" changed elsewhere — your edits were not saved.`
          });
          return;
        }
        addNotification({
          type: "error",
          alert: true,
          content: err instanceof Error ? err.message : "Failed to save app"
        });
      }
    },
    [addNotification, application, updateApplication]
  );

  const handleReload = useCallback(async () => {
    await utils.applications.get.invalidate({ id: applicationId });
    setConflict(null);
    // The shell remounts and reseeds from the reloaded row, so its old
    // operations must not outlive it.
    setLiveOperations(null);
    setSeed((value) => value + 1);
  }, [applicationId, utils]);

  if (isLoading) {
    return <LoadingSpinner size="large" text="Loading app" />;
  }

  if (isError || !application || !document) {
    return (
      <EmptyState
        variant="error"
        title="Could not load app"
        description={error?.message ?? "The app may have been deleted."}
      />
    );
  }

  return (
    <AppBuilderShell
      key={`${applicationId}:${seed}`}
      applicationId={applicationId}
      document={document}
      workflow={editorWorkflow}
      operationWorkflows={operationWorkflows}
      agentWorkflowId={workflow?.id}
      onOperationsChange={setLiveOperations}
      onSave={(next) => void handleSave(next)}
      banner={
        conflict ? (
          <FlexColumn sx={{ px: SPACING.lg, py: SPACING.md }}>
            <AlertBanner
              severity="warning"
              title="Saved elsewhere"
              action={
                <EditorButton
                  size="small"
                  variant="text"
                  onClick={() => void handleReload()}
                >
                  Reload
                </EditorButton>
              }
            >
              {conflict === "save-rejected"
                ? "This app changed since it was opened, so the last save was rejected."
                : "This app changed outside this editor."}{" "}
              Reload to start from the current version — reloading discards what
              is on this canvas.
            </AlertBanner>
          </FlexColumn>
        ) : undefined
      }
    />
  );
};

export default ApplicationAppBuilder;
