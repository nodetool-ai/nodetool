import React, { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  AlertBanner,
  EditorButton,
  EmptyState,
  FlexColumn,
  LoadingSpinner,
  SPACING
} from "../ui_primitives";
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

  const [conflict, setConflict] = useState(false);
  // Bumped to remount the editor when the user asks for the latest document.
  const [seed, setSeed] = useState(0);

  const document = useMemo<AppDocument | null>(() => {
    if (!application) return null;
    return (
      parseApplicationDocument(application.document) ??
      createEmptyDocument(application.name)
    );
  }, [application]);

  const operationWorkflowId = document?.operations[0]?.workflowId ?? "";
  const { data: workflow } = useQuery({
    queryKey: ["app-builder-workflow", operationWorkflowId],
    queryFn: async () => await fetchWorkflow(operationWorkflowId),
    enabled: !!operationWorkflowId,
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: false
  });

  const editorWorkflow = useMemo(
    () =>
      workflow ?? placeholderWorkflow(applicationId, application?.name ?? ""),
    [application?.name, applicationId, workflow]
  );

  const handleSave = useCallback(
    async (next: AppDocument) => {
      if (!application) return;
      try {
        await updateApplication.mutateAsync({
          id: application.id,
          // Spread into fresh literals: the router's schema types `ui` as an
          // open record, which an interface does not satisfy directly.
          document: { ...next, ui: { ...next.ui } },
          // Compare-and-swap against the row this editor loaded.
          baseUpdatedAt: application.updatedAt
        });
        setConflict(false);
        addNotification({ type: "success", content: "App saved" });
      } catch (err) {
        if (isConcurrencyConflict(err)) {
          setConflict(true);
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
    setConflict(false);
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
      agentWorkflowId={workflow?.id}
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
              This app changed since it was opened, so the last save was
              rejected. Reload to start from the current version — reloading
              discards what is on this canvas.
            </AlertBanner>
          </FlexColumn>
        ) : undefined
      }
    />
  );
};

export default ApplicationAppBuilder;
