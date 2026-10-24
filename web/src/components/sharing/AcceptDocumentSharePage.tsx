/**
 * Landing page for document share links (`/share/document/:token`).
 *
 * Redeems the token, which registers the signed-in user as a collaborator,
 * then opens the document as a workspace tab: read-only for a viewer, in edit
 * mode for an editor. Invalid or revoked links get an error state instead.
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
import { useAcceptDocumentShare } from "../../serverState/useDocumentSharing";
import { openSharedDocument } from "../../lib/openSharedDocument";

const AcceptDocumentSharePage = () => {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const accept = useAcceptDocumentShare();
  const redeemedToken = useRef<string | null>(null);

  useEffect(() => {
    if (!token || redeemedToken.current === token) return;
    redeemedToken.current = token;
    accept
      .mutateAsync(token)
      .then((document) => {
        openSharedDocument(document);
        navigate("/workspace", { replace: true });
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
            {t("shareDocument.accept.invalidLink")}
          </AlertBanner>
          <EditorButton variant="outlined" onClick={() => navigate("/workspace")}>
            {t("shareDocument.accept.goToWorkspace")}
          </EditorButton>
        </>
      ) : (
        <LoadingSpinner text={t("shareDocument.accept.opening")} />
      )}
    </FlexColumn>
  );
};

export default AcceptDocumentSharePage;
