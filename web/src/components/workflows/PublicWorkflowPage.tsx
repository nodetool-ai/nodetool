/**
 * Read-only view of a workflow behind a public share link (`/view/:token`).
 *
 * Opens without an account: the workflow arrives from the one auth-exempt
 * REST read, and the graph renders with the editor's own node components,
 * inert. "Duplicate to my workflows" copies it into the viewer's account and
 * opens the copy; a viewer who is not signed in is sent to sign in first.
 */
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  EditorButton,
  EmptyState,
  FlexColumn,
  LoadingSpinner,
  PageHeader,
  SPACING
} from "../ui_primitives";
import WorkflowGraphPreview from "../version/WorkflowGraphPreview";
import useAuth from "../../stores/useAuth";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  useDuplicateSharedWorkflow,
  usePublicSharedWorkflow
} from "../../serverState/useWorkflowSharing";
import { rememberPostLoginReturn } from "../../utils/postLoginReturn";

/** `graphNodeToReactFlowNode` stamps this onto each node; nothing reads it back. */
const PREVIEW_WORKFLOW_ID = "public-share-preview";

const PublicWorkflowPage = () => {
  const { t } = useTranslation();
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
      // Sign-in returns to the start page; bring the user back here.
      rememberPostLoginReturn(`/view/${token}`);
      navigate("/login");
      return;
    }
    try {
      const copy = await duplicate.mutateAsync(token);
      addNotification({
        type: "success",
        content: t("pass3_36.workflows.publicWorkflow.addedToWorkflows", {
          name: copy.name
        }),
        alert: true
      });
      navigate(`/editor/${copy.id}`);
    } catch {
      addNotification({
        type: "error",
        content: t("pass3_36.workflows.publicWorkflow.copyError"),
        alert: true
      });
    }
  }, [token, signedIn, duplicate, addNotification, navigate, t]);

  if (isLoading) {
    return (
      <FlexColumn align="center" justify="center" sx={{ height: "100vh" }}>
        <LoadingSpinner text={t("pass3_36.workflows.publicWorkflow.loading")} />
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
          title={t("pass3_36.workflows.publicWorkflow.unavailableTitle")}
          description={t("pass3_36.workflows.publicWorkflow.unavailableDescription")}
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
      <PageHeader
        variant="plain"
        title={workflow.name}
        subtitle={workflow.description || undefined}
        truncateTitle
        sx={{ justifyContent: "space-between", gap: SPACING.md }}
        actions={
          <EditorButton
            variant="contained"
            disabled={authState === "loading"}
            loading={duplicate.isPending}
            onClick={() => void handleDuplicate()}
          >
            {signedIn
              ? t("pass3_36.workflows.publicWorkflow.duplicateToMyWorkflows")
              : t("pass3_36.workflows.publicWorkflow.signInToDuplicate")}
          </EditorButton>
        }
      />
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
