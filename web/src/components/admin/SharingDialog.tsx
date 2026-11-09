/**
 * What one person shares and what others share with them, for an admin:
 * their share links, the people they gave access, the documents they can
 * open, and their public workflows. Each can be taken back from here.
 */
import React, { memo } from "react";
import { useTranslation } from "react-i18next";

import {
  useAdminSharingAction,
  useAdminUserSharing,
  type AdminShareGrant,
  type AdminSharedDocument
} from "../../serverState/useAdminUsers";
import {
  AlertBanner,
  Caption,
  Dialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  LoadingSpinner,
  SectionHeader,
  TruncatedText
} from "../ui_primitives";

export interface SharingDialogProps {
  /** The person to review, or null when closed. */
  userId: string | null;
  title: string;
  onClose: () => void;
}

const personName = (person: AdminShareGrant["person"]): string =>
  person.display_name ?? person.email ?? person.user_id;

const errorText = (error: unknown): string | null =>
  error instanceof Error ? error.message : null;

const SharingDialog: React.FC<SharingDialogProps> = ({ userId, title, onClose }) => {
  const { t } = useTranslation();
  const sharing = useAdminUserSharing(userId);
  const action = useAdminSharingAction();
  const busy = action.isPending;

  const documentLine = (document: AdminSharedDocument) => (
    <FlexColumn gap={GAP.none} sx={{ flex: 1, minWidth: 0 }}>
      <TruncatedText>{document.name ?? t("admin.sharing.untitled")}</TruncatedText>
      <Caption>{t(`admin.sharing.types.${document.type}`)}</Caption>
    </FlexColumn>
  );

  const roleText = (role: string) => t(`admin.sharing.roles.${role}`);

  const section = (
    heading: string,
    empty: string,
    rows: React.ReactNode[]
  ) => (
    <FlexColumn gap={GAP.tight}>
      <SectionHeader size="small" title={heading} />
      {rows.length > 0 ? rows : <Caption>{empty}</Caption>}
    </FlexColumn>
  );

  let body: React.ReactNode;
  if (sharing.isLoading) {
    body = <LoadingSpinner />;
  } else if (sharing.isError || !sharing.data) {
    body = (
      <AlertBanner severity="error" compact>
        {errorText(sharing.error) ?? t("admin.sharing.loadFailed")}
      </AlertBanner>
    );
  } else {
    const data = sharing.data;
    body = (
      <FlexColumn gap={GAP.normal}>
        {section(
          t("admin.sharing.links"),
          t("admin.sharing.noLinks"),
          data.links.map((link) => (
            <FlexRow key={link.share_id} gap={GAP.normal} align="center">
              {documentLine(link.document)}
              <Caption>{roleText(link.role)}</Caption>
              <EditorButton
                variant="text"
                color="error"
                disabled={busy}
                onClick={() =>
                  action.mutate({
                    kind: "revokeLink",
                    type: link.document.type,
                    shareId: link.share_id
                  })
                }
              >
                {t("admin.sharing.revoke")}
              </EditorButton>
            </FlexRow>
          ))
        )}
        {section(
          t("admin.sharing.granted"),
          t("admin.sharing.noGranted"),
          data.granted.map((grant) => (
            <FlexRow
              key={`${grant.document.type}:${grant.document.id}:${grant.person.user_id}`}
              gap={GAP.normal}
              align="center"
            >
              {documentLine(grant.document)}
              <FlexColumn gap={GAP.none} sx={{ minWidth: 0 }}>
                <TruncatedText>{personName(grant.person)}</TruncatedText>
                <Caption>{roleText(grant.role)}</Caption>
              </FlexColumn>
              <EditorButton
                variant="text"
                color="error"
                disabled={busy}
                onClick={() =>
                  action.mutate({
                    kind: "removeGrant",
                    type: grant.document.type,
                    documentId: grant.document.id,
                    userId: grant.person.user_id
                  })
                }
              >
                {t("admin.sharing.removeAccess")}
              </EditorButton>
            </FlexRow>
          ))
        )}
        {section(
          t("admin.sharing.received"),
          t("admin.sharing.noReceived"),
          data.received.map((grant) => (
            <FlexRow
              key={`${grant.document.type}:${grant.document.id}`}
              gap={GAP.normal}
              align="center"
            >
              {documentLine(grant.document)}
              <Caption>{roleText(grant.role)}</Caption>
              <EditorButton
                variant="text"
                color="error"
                disabled={busy}
                onClick={() =>
                  action.mutate({
                    kind: "removeGrant",
                    type: grant.document.type,
                    documentId: grant.document.id,
                    userId: grant.person.user_id
                  })
                }
              >
                {t("admin.sharing.removeAccess")}
              </EditorButton>
            </FlexRow>
          ))
        )}
        {section(
          t("admin.sharing.public"),
          t("admin.sharing.noPublic"),
          data.public_workflows.map((workflow) => (
            <FlexRow key={workflow.id} gap={GAP.normal} align="center">
              {documentLine(workflow)}
              <EditorButton
                variant="text"
                color="error"
                disabled={busy}
                onClick={() =>
                  action.mutate({ kind: "makePrivate", workflowId: workflow.id })
                }
              >
                {t("admin.sharing.makePrivate")}
              </EditorButton>
            </FlexRow>
          ))
        )}
        {action.isError ? (
          <AlertBanner severity="error" compact>
            {errorText(action.error) ?? t("admin.sharing.actionFailed")}
          </AlertBanner>
        ) : null}
      </FlexColumn>
    );
  }

  return (
    <Dialog
      open={userId !== null}
      onClose={onClose}
      title={title}
      maxWidth="sm"
      fullWidth
    >
      {body}
    </Dialog>
  );
};

export default memo(SharingDialog);
