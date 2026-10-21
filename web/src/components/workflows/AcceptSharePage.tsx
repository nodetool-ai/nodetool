/**
 * Landing page for workflow share links (`/share/:token`).
 *
 * Redeems the token, which registers the signed-in user as a collaborator,
 * then forwards to the workflow in the editor. Invalid or revoked links get
 * an error state instead of a redirect.
 */
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertBanner,
  EditorButton,
  FlexColumn,
  LoadingSpinner,
  SPACING
} from "../ui_primitives";
import { useAcceptShare } from "../../serverState/useWorkflowSharing";

const AcceptSharePage = () => {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const accept = useAcceptShare();
  const redeemedToken = useRef<string | null>(null);

  useEffect(() => {
    if (!token || redeemedToken.current === token) return;
    redeemedToken.current = token;
    accept
      .mutateAsync(token)
      .then((result) => {
        navigate(`/editor/${result.workflow.id}`, { replace: true });
      })
      .catch(() => {
        // Error state rendered below from the mutation.
      });
  }, [token, accept, navigate]);

  return (
    <FlexColumn
      align="center"
      justify="center"
      gap={SPACING.lg}
      sx={{ width: "100%", height: "100%", p: SPACING.xxxl }}
    >
      {accept.isError ? (
        <>
          <AlertBanner severity="error">
            {t("pass3_36.workflows.acceptShare.invalidLink")}
          </AlertBanner>
          <EditorButton variant="outlined" onClick={() => navigate("/editor")}>
            {t("pass3_36.workflows.acceptShare.goToEditor")}
          </EditorButton>
        </>
      ) : (
        <LoadingSpinner text={t("pass3_36.workflows.acceptShare.openingWorkflow")} />
      )}
    </FlexColumn>
  );
};

export default AcceptSharePage;
