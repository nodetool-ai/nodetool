/**
 * Share dialog for private workflow sharing.
 *
 * Owner-only. Mints role-scoped share links ("Can view" / "Can edit"),
 * lists collaborators who redeemed a link, and lets the owner change roles,
 * remove collaborators, or revoke links.
 */
import { memo, useCallback } from "react";
import {
  Dialog,
  FlexColumn,
  FlexRow,
  Text,
  Caption,
  Chip,
  Divider,
  CopyButton,
  DeleteButton,
  EditorButton,
  SelectField,
  LoadingSpinner,
  EmptyState,
  SPACING
} from "../ui_primitives";
import {
  useWorkflowSharing,
  shareUrlForToken,
  type ShareRole
} from "../../serverState/useWorkflowSharing";
import { useNotificationStore } from "../../stores/NotificationStore";

const ROLE_LABELS: Record<ShareRole, string> = {
  viewer: "Can view",
  editor: "Can edit"
};

const ROLE_OPTIONS = [
  { value: "viewer", label: ROLE_LABELS.viewer },
  { value: "editor", label: ROLE_LABELS.editor }
] as const;

interface ShareWorkflowDialogProps {
  open: boolean;
  onClose: () => void;
  workflowId: string;
  workflowName: string;
}

const ShareWorkflowDialog = ({
  open,
  onClose,
  workflowId,
  workflowName
}: ShareWorkflowDialogProps) => {
  const { query, createLink, revokeLink, setRole, removeCollaborator } =
    useWorkflowSharing(open ? workflowId : null);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const activeShares = (query.data?.shares ?? []).filter(
    (share) => share.revoked_at == null
  );
  const collaborators = query.data?.collaborators ?? [];

  const handleCreateLink = useCallback(
    async (role: ShareRole) => {
      const share = await createLink.mutateAsync(role);
      await navigator.clipboard.writeText(shareUrlForToken(share.token));
      addNotification({
        type: "success",
        content: `${ROLE_LABELS[role]} link copied to clipboard`,
        alert: true
      });
    },
    [createLink, addNotification]
  );

  return (
    <Dialog
      className="share-workflow-dialog"
      open={open}
      onClose={onClose}
      title={`Share "${workflowName}"`}
      maxWidth="sm"
      fullWidth
    >
      <FlexColumn gap={SPACING.md} sx={{ pb: 2 }}>
        <Caption>
          Anyone signed in to this server who opens a share link gets the
          link&apos;s role. Revoking a link stops new joins; people who
          already joined stay listed below.
        </Caption>

        <FlexRow gap={SPACING.sm}>
          <EditorButton
            variant="outlined"
            disabled={createLink.isPending}
            onClick={() => void handleCreateLink("viewer")}
          >
            Copy view link
          </EditorButton>
          <EditorButton
            variant="outlined"
            disabled={createLink.isPending}
            onClick={() => void handleCreateLink("editor")}
          >
            Copy edit link
          </EditorButton>
        </FlexRow>

        {query.isLoading && <LoadingSpinner />}

        {activeShares.length > 0 && (
          <FlexColumn gap={SPACING.xs}>
            <Text size="small">Active links</Text>
            {activeShares.map((share) => (
              <FlexRow
                key={share.id}
                gap={SPACING.sm}
                align="center"
                justify="space-between"
              >
                <FlexRow gap={SPACING.sm} align="center">
                  <Chip label={ROLE_LABELS[share.role]} size="small" />
                  <CopyButton
                    value={shareUrlForToken(share.token)}
                    tooltip="Copy share link"
                  />
                </FlexRow>
                <EditorButton
                  density="compact"
                  disabled={revokeLink.isPending}
                  onClick={() => revokeLink.mutate(share.id)}
                >
                  Revoke
                </EditorButton>
              </FlexRow>
            ))}
          </FlexColumn>
        )}

        <Divider />

        <Text size="small">People with access</Text>
        {collaborators.length === 0 && !query.isLoading && (
          <EmptyState
            variant="empty"
            title="No collaborators yet"
            description="Copy a link above and send it to someone."
          />
        )}
        {collaborators.map((collaborator) => (
          <FlexRow
            key={collaborator.user_id}
            gap={SPACING.sm}
            align="center"
            justify="space-between"
          >
            <Text
              size="small"
              sx={{ overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {collaborator.user_id}
            </Text>
            <FlexRow gap={SPACING.sm} align="center">
              <SelectField
                label=""
                size="small"
                value={collaborator.role}
                options={ROLE_OPTIONS}
                disabled={setRole.isPending}
                onChange={(value) =>
                  setRole.mutate({
                    userId: collaborator.user_id,
                    role: value as ShareRole
                  })
                }
              />
              <DeleteButton
                tooltip="Remove access"
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

export default memo(ShareWorkflowDialog);
