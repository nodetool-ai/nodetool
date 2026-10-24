/**
 * Share dialog for any document: workflows, storyboards, scripts, timelines,
 * sketches, apps and JS scripts.
 *
 * Owner-only. Mints role-scoped share links ("Can view" / "Can edit"),
 * lists collaborators who redeemed a link, and lets the owner change roles,
 * remove collaborators, or revoke links. Workflows also offer a public link,
 * which shows the workflow to anyone, without an account, and lets them copy
 * it into their own workflows.
 */
import { memo } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  FlexColumn,
  FlexRow,
  Caption,
  SectionHeader,
  Chip,
  Divider,
  CopyButton,
  DeleteButton,
  EditorButton,
  SelectField,
  LoadingSpinner,
  EmptyState,
  SPACING,
  TruncatedText
} from "../ui_primitives";
import {
  useWorkflowSharing,
  shareUrlForToken,
  type CollaboratorRole,
  type ShareRole
} from "../../serverState/useWorkflowSharing";
import {
  documentShareUrlForToken,
  useDocumentSharing,
  type SharedDocumentType
} from "../../serverState/useDocumentSharing";
import { useNotificationStore } from "../../stores/NotificationStore";

export interface ShareTarget {
  type: "workflow" | SharedDocumentType;
  id: string;
  name: string;
}

interface ShareDocumentDialogProps {
  open: boolean;
  onClose: () => void;
  target: ShareTarget;
}

const ShareDocumentDialog = ({
  open,
  onClose,
  target
}: ShareDocumentDialogProps) => {
  const { t } = useTranslation();
  const isWorkflow = target.type === "workflow";
  const roleLabels: Record<ShareRole, string> = {
    viewer: t("pass3_37.shareWorkflow.roleViewer"),
    editor: t("pass3_37.shareWorkflow.roleEditor"),
    public: t("pass3_37.shareWorkflow.rolePublic")
  };
  const roleOptions = [
    { value: "viewer", label: roleLabels.viewer },
    { value: "editor", label: roleLabels.editor }
  ] as const;

  // Both hooks run; the one for the other kind stays disabled.
  const workflowSharing = useWorkflowSharing(
    open && isWorkflow ? target.id : null
  );
  const documentSharing = useDocumentSharing(
    open && target.type !== "workflow"
      ? { type: target.type, id: target.id }
      : null
  );
  const { query, revokeLink, setRole, removeCollaborator } = isWorkflow
    ? workflowSharing
    : documentSharing;
  const createLinkPending = isWorkflow
    ? workflowSharing.createLink.isPending
    : documentSharing.createLink.isPending;
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const activeShares = (query.data?.shares ?? []).filter(
    (share) => share.revoked_at == null
  );
  const collaborators = query.data?.collaborators ?? [];

  const urlFor = (token: string, role: ShareRole): string =>
    isWorkflow ? shareUrlForToken(token, role) : documentShareUrlForToken(token);

  const mintLink = (role: ShareRole) => {
    if (isWorkflow) {
      return workflowSharing.createLink.mutateAsync(role);
    }
    if (role === "public") {
      throw new Error("Only workflows have public links");
    }
    return documentSharing.createLink.mutateAsync(role);
  };

  const handleCreateLink = async (role: ShareRole) => {
    let share;
    try {
      share = await mintLink(role);
    } catch {
      addNotification({
        type: "error",
        content: t("pass3_37.shareWorkflow.createLinkFailed"),
        alert: true
      });
      return;
    }
    // Clipboard access can be denied (permissions, insecure context); the
    // link exists either way and stays copyable from the list below.
    try {
      await navigator.clipboard.writeText(urlFor(share.token, share.role));
      addNotification({
        type: "success",
        content: t("pass3_37.shareWorkflow.linkCopied", {
          role: roleLabels[role]
        }),
        alert: true
      });
    } catch {
      addNotification({
        type: "info",
        content: t("pass3_37.shareWorkflow.linkCreatedCopyFromList"),
        alert: true
      });
    }
  };

  return (
    <Dialog
      className="share-workflow-dialog"
      open={open}
      onClose={onClose}
      title={t("pass3_37.shareWorkflow.title", { name: target.name })}
      maxWidth="sm"
      fullWidth
    >
      <FlexColumn gap={SPACING.md}>
        <Caption>
          {isWorkflow
            ? t("pass3_37.shareWorkflow.description")
            : t("shareDocument.description")}
        </Caption>

        <FlexRow gap={SPACING.sm}>
          <EditorButton
            variant="outlined"
            disabled={createLinkPending}
            onClick={() => void handleCreateLink("viewer")}
          >
            {t("pass3_37.shareWorkflow.copyViewLink")}
          </EditorButton>
          <EditorButton
            variant="outlined"
            disabled={createLinkPending}
            onClick={() => void handleCreateLink("editor")}
          >
            {t("pass3_37.shareWorkflow.copyEditLink")}
          </EditorButton>
          {isWorkflow && (
            <EditorButton
              variant="outlined"
              disabled={createLinkPending}
              onClick={() => void handleCreateLink("public")}
            >
              {t("pass3_37.shareWorkflow.copyPublicLink")}
            </EditorButton>
          )}
        </FlexRow>

        {query.isLoading && (
          <LoadingSpinner text={t("pass3_37.shareWorkflow.loading")} />
        )}

        {activeShares.length > 0 && (
          <FlexColumn gap={SPACING.xs}>
            <SectionHeader
              size="small"
              title={t("pass3_37.shareWorkflow.activeLinks")}
            />
            {activeShares.map((share) => (
              <FlexRow
                key={share.id}
                gap={SPACING.sm}
                align="center"
                justify="space-between"
              >
                <FlexRow gap={SPACING.sm} align="center">
                  <Chip label={roleLabels[share.role]} size="small" />
                  <CopyButton
                    value={urlFor(share.token, share.role)}
                    tooltip={t("pass3_37.shareWorkflow.copyShareLink")}
                  />
                </FlexRow>
                <EditorButton
                  density="compact"
                  disabled={revokeLink.isPending}
                  onClick={() => revokeLink.mutate(share.id)}
                >
                  {t("pass3_37.shareWorkflow.revoke")}
                </EditorButton>
              </FlexRow>
            ))}
          </FlexColumn>
        )}

        <Divider />

        <SectionHeader
          size="small"
          title={t("pass3_37.shareWorkflow.peopleWithAccess")}
        />
        {collaborators.length === 0 && !query.isLoading && (
          <EmptyState
            variant="empty"
            title={t("pass3_37.shareWorkflow.noCollaborators")}
            description={t("pass3_37.shareWorkflow.noCollaboratorsDescription")}
          />
        )}
        {collaborators.map((collaborator) => (
          <FlexRow
            key={collaborator.user_id}
            gap={SPACING.sm}
            align="center"
            justify="space-between"
          >
            <TruncatedText>{collaborator.user_id}</TruncatedText>
            <FlexRow gap={SPACING.sm} align="center">
              <SelectField
                label={t("pass3_37.shareWorkflow.roleFor", {
                  userId: collaborator.user_id
                })}
                hideLabel
                size="small"
                value={collaborator.role}
                options={roleOptions}
                disabled={setRole.isPending}
                onChange={(value) =>
                  setRole.mutate({
                    userId: collaborator.user_id,
                    role: value as CollaboratorRole
                  })
                }
              />
              <DeleteButton
                tooltip={t("pass3_37.shareWorkflow.removeAccess")}
                disabled={removeCollaborator.isPending}
                onClick={() => removeCollaborator.mutate(collaborator.user_id)}
              />
            </FlexRow>
          </FlexRow>
        ))}
      </FlexColumn>
    </Dialog>
  );
};

export default memo(ShareDocumentDialog);
