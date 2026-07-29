import { memo, useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { trpcClient } from "../../trpc/client";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import {
  EmptyState,
  FlexColumn,
  LoadingSpinner,
  SPACING
} from "../ui_primitives";

/**
 * Resolves the app that binds a workflow, by scanning the user's apps for an
 * operation pointing at it. There is no index by workflow id — apps and
 * workflows are orthogonal — so this walks the list. It only runs for legacy
 * `/miniapp/:workflowId` links, which are rare and short-lived.
 */
const findApplicationForWorkflow = async (
  workflowId: string
): Promise<{ id: string; name: string } | null> => {
  const list = await trpcClient.applications.list.query({});
  for (const item of list) {
    const app = await trpcClient.applications.get.query({ id: item.id });
    if (app.document.operations.some((op) => op.workflowId === workflowId)) {
      return { id: app.id, name: app.name };
    }
  }
  return null;
};

/**
 * Landing point for old `/miniapp/:workflowId` links. An app is its own
 * resource now, so a workflow id no longer names one: when an app binds the
 * workflow we open that app's workspace tab, otherwise the link is dead.
 */
const LegacyAppRedirect = () => {
  const { workflowId } = useParams<{ workflowId?: string }>();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);

  const { data, isLoading } = useQuery({
    queryKey: ["application-for-workflow", workflowId],
    queryFn: () => findApplicationForWorkflow(workflowId ?? ""),
    enabled: !!workflowId,
    retry: false
  });

  useEffect(() => {
    if (data) {
      openTab({
        type: "application",
        ref: data.id,
        mode: "edit",
        title: data.name || "Untitled app"
      });
    }
  }, [data, openTab]);

  if (!workflowId) return <Navigate to="/workspace" replace />;

  if (isLoading) {
    return (
      <FlexColumn align="center" justify="center" sx={{ height: "100vh" }}>
        <LoadingSpinner size="large" text="Looking for this app" />
      </FlexColumn>
    );
  }

  if (!data) {
    return (
      <FlexColumn
        align="center"
        justify="center"
        gap={SPACING.md}
        sx={{ height: "100vh", px: SPACING.lg }}
      >
        <EmptyState
          variant="error"
          title="App not found"
          description="No app is built on this workflow. Open the Apps panel to create one."
        />
      </FlexColumn>
    );
  }

  return <Navigate to="/workspace" replace />;
};

export default memo(LegacyAppRedirect);
