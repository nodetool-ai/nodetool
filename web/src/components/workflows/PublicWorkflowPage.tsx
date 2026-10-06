/**
 * Read-only view of a workflow behind a public share link (`/view/:token`).
 *
 * Opens without an account: the workflow arrives from the one auth-exempt
 * REST read, and the graph renders with the editor's own node components,
 * inert. "Duplicate to my workflows" copies it into the viewer's account and
 * opens the copy; a viewer who is not signed in is sent to sign in first.
 */
import { useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Caption,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  Text,
  SPACING
} from "../ui_primitives";
import WorkflowGraphPreview from "../version/WorkflowGraphPreview";
import useAuth from "../../stores/useAuth";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  useDuplicateSharedWorkflow,
  usePublicSharedWorkflow
} from "../../serverState/useWorkflowSharing";

/** `graphNodeToReactFlowNode` stamps this onto each node; nothing reads it back. */
const PREVIEW_WORKFLOW_ID = "public-share-preview";

const PublicWorkflowPage = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const authState = useAuth((auth) => auth.state);
  const { data: workflow, isLoading, isError } = usePublicSharedWorkflow(token);
  const duplicate = useDuplicateSharedWorkflow();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const signedIn = authState === "logged_in";

  const handleDuplicate = useCallback(async () => {
    if (!token) {
      return;
    }
    if (!signedIn) {
      navigate("/login");
      return;
    }
    try {
      const copy = await duplicate.mutateAsync(token);
      addNotification({
        type: "success",
        content: `Added "${copy.name}" to your workflows`,
        alert: true
      });
      navigate(`/editor/${copy.id}`);
    } catch {
      addNotification({
        type: "error",
        content: "Could not copy this workflow",
        alert: true
      });
    }
  }, [token, signedIn, duplicate, addNotification, navigate]);

  if (isLoading) {
    return (
      <FlexColumn align="center" justify="center" sx={{ height: "100vh" }}>
        <LoadingSpinner />
      </FlexColumn>
    );
  }

  if (isError || !workflow) {
    return (
      <FlexColumn
        align="center"
        justify="center"
        gap={SPACING.md}
        sx={{ height: "100vh", px: SPACING.lg }}
      >
        <EmptyState
          variant="error"
          title="This workflow is not available"
          description="The link may have been revoked. Ask the person who shared it for a new one."
        />
      </FlexColumn>
    );
  }

  return (
    <FlexColumn
      className="public-workflow-page"
      gap={SPACING.md}
      sx={{ height: "100vh", p: SPACING.lg, boxSizing: "border-box" }}
    >
      <FlexRow gap={SPACING.md} align="center" justify="space-between">
        <FlexColumn gap={SPACING.xs} sx={{ minWidth: 0 }}>
          <Text size="big" truncate>
            {workflow.name}
          </Text>
          {workflow.description && (
            <Caption>{workflow.description}</Caption>
          )}
        </FlexColumn>
        <EditorButton
          variant="contained"
          disabled={duplicate.isPending || authState === "loading"}
          onClick={() => void handleDuplicate()}
        >
          {signedIn ? "Duplicate to my workflows" : "Sign in to duplicate"}
        </EditorButton>
      </FlexRow>
      <FlexColumn sx={{ flex: 1, minHeight: 0 }}>
        <WorkflowGraphPreview
          graph={workflow.graph}
          workflowId={PREVIEW_WORKFLOW_ID}
          height="100%"
        />
      </FlexColumn>
    </FlexColumn>
  );
};

export default PublicWorkflowPage;
