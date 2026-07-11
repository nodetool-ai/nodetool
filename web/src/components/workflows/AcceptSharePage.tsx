/**
 * Landing page for workflow share links (`/share/:token`).
 *
 * Redeems the token, which registers the signed-in user as a collaborator,
 * then forwards to the workflow in the editor. Invalid or revoked links get
 * an error state instead of a redirect.
 */
import { useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertBanner,
  EditorButton,
  FlexColumn,
  LoadingSpinner,
  Text,
  SPACING
} from "../ui_primitives";
import { useAcceptShare } from "../../serverState/useWorkflowSharing";

const AcceptSharePage = () => {
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
      sx={{ width: "100%", height: "100%", p: 4 }}
    >
      {accept.isError ? (
        <>
          <AlertBanner severity="error">
            This share link is invalid or has been revoked. Ask the workflow
            owner for a new one.
          </AlertBanner>
          <EditorButton variant="outlined" onClick={() => navigate("/editor")}>
            Go to editor
          </EditorButton>
        </>
      ) : (
        <>
          <LoadingSpinner />
          <Text size="small">Opening shared workflow…</Text>
        </>
      )}
    </FlexColumn>
  );
};

export default AcceptSharePage;
