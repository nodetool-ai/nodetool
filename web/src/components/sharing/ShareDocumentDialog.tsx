/**
 * Share dialog for any document: workflows, storyboards, scripts, timelines,
 * sketches, apps and JS scripts.
 *
 * Owner-only. Mints role-scoped share links ("Can view" / "Can edit"),
 * invites people by name on an SSO server, lists each person once with their
 * effective role, options and the grants that give them, and lets the owner
 * change roles, remove people, disable links, and turn the history,
 * download and duplicate options on or off for a view link or an
 * invitation. Workflows also offer a public link,
 * which shows the workflow to anyone, without an account, and lets them copy
 * it into their own workflows.
 */
import { memo } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertBanner,
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
import { canSearchPeople } from "../../serverState/usePeopleSearch";
import { useNotificationStore } from "../../stores/NotificationStore";
import InvitePeople, { personLabel } from "./InvitePeople";
import ShareOptionSwitches, {
  NO_SHARE_OPTIONS,
  SHARE_OPTION_KEYS,
  SHARE_OPTION_LABEL_KEYS
} from "./ShareOptionSwitches";
import type { ShareOptionsPatch } from "../../serverState/useWorkflowSharing";
import type { workflows } from "@nodetool-ai/protocol/api-schemas";

type AccessGrant = workflows.AccessGrantItem;

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
  const {
    query,
    revokeLink,
    setRole,
    removeCollaborator,
    invite,
    setLinkOptions,
    setInvitationOptions,
    dismissNotice
  } = isWorkflow ? workflowSharing : documentSharing;
  const createLinkPending = isWorkflow
    ? workflowSharing.createLink.isPending
    : documentSharing.createLink.isPending;
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const activeShares = (query.data?.shares ?? []).filter(
    (share) => share.disabled_at == null && share.revoked_at == null
  );
  // Links disabled for new people that still owe the owner a notice.
  const noticeShares = (query.data?.shares ?? []).filter(
    (share) => share.owner_notice === "history_off"
  );
  // Each person once (P6). Older servers send only the grant rows.
  const people =
    query.data?.people ??
    (query.data?.collaborators ?? []).map((collaborator) => ({
      user_id: collaborator.user_id,
      display_name: collaborator.display_name,
      email: collaborator.email,
      access: null
    }));
  const roleOf = (userId: string): CollaboratorRole =>
    (query.data?.collaborators ?? []).some(
      (c) => c.user_id === userId && c.role === "editor"
    )
      ? "editor"
      : "viewer";
  const optionsPending =
    setLinkOptions.isPending || setInvitationOptions.isPending;

  const sourceLabel = (grant: AccessGrant): string => {
    const label =
      grant.source === "invitation"
        ? t("shareDocument.people.sourceInvitation")
        : grant.role === "editor"
          ? t("shareDocument.people.sourceEditLink")
          : t("shareDocument.people.sourceViewLink");
    return grant.link_disabled
      ? t("shareDocument.people.sourceDisabled", { source: label })
      : label;
  };

  const handleOptions = async (
    change: () => Promise<unknown>,
    patch: ShareOptionsPatch
  ) => {
    try {
      await change();
    } catch {
      addNotification({
        type: "error",
        content: t("shareDocument.options.failed"),
        alert: true
      });
      return;
    }
    // P5: turning an option off does not take back what people already have.
    if (Object.values(patch).some((value) => value === false)) {
      addNotification({
        type: "info",
        content: t("shareDocument.options.turnedOff"),
        alert: true
      });
    }
  };

  const changeLinkOptions = (shareId: string, patch: ShareOptionsPatch) =>
    handleOptions(
      () => setLinkOptions.mutateAsync({ shareId, options: patch }),
      patch
    );

  const changeInvitationOptions = (userId: string, patch: ShareOptionsPatch) =>
    handleOptions(
      () => setInvitationOptions.mutateAsync({ userId, options: patch }),
      patch
    );

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

  const handleInvite = async (userId: string, role: CollaboratorRole) => {
    try {
      await invite.mutateAsync({ userId, role });
    } catch (error) {
      addNotification({
        type: "error",
        content:
          error instanceof Error && error.message
            ? error.message
            : t("shareDocument.invite.failed"),
        alert: true
      });
      throw error;
    }
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

        {noticeShares.map((share) => (
          <AlertBanner
            key={`notice-${share.id}`}
            severity="info"
            compact
            action={
              <FlexRow gap={SPACING.xs}>
                {share.disabled_at == null && share.revoked_at == null && (
                  <EditorButton
                    density="compact"
                    disabled={optionsPending || dismissNotice.isPending}
                    onClick={() =>
                      void changeLinkOptions(share.id, {
                        allow_history: true
                      }).then(() => dismissNotice.mutate(share.id))
                    }
                  >
                    {t("shareDocument.options.turnOnHistory")}
                  </EditorButton>
                )}
                <EditorButton
                  density="compact"
                  disabled={dismissNotice.isPending}
                  onClick={() => dismissNotice.mutate(share.id)}
                >
                  {t("shareDocument.options.dismiss")}
                </EditorButton>
              </FlexRow>
            }
          >
            {t("shareDocument.options.historyOffNotice")}
          </AlertBanner>
        ))}

        {activeShares.length > 0 && (
          <FlexColumn gap={SPACING.xs}>
            <SectionHeader
              size="small"
              title={t("pass3_37.shareWorkflow.activeLinks")}
            />
            {activeShares.map((share) => (
              <FlexColumn key={share.id} gap={SPACING.xs}>
              <FlexRow
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
              {share.role === "viewer" && (
                <ShareOptionSwitches
                  idPrefix={`share-${share.id}`}
                  options={share.options ?? NO_SHARE_OPTIONS}
                  disabled={optionsPending}
                  onChange={(patch) => void changeLinkOptions(share.id, patch)}
                />
              )}
              </FlexColumn>
            ))}
          </FlexColumn>
        )}

        <Divider />

        <SectionHeader
          size="small"
          title={t("pass3_37.shareWorkflow.peopleWithAccess")}
        />
        {canSearchPeople() && (
          <InvitePeople inviting={invite.isPending} onInvite={handleInvite} />
        )}
        {people.length === 0 && !query.isLoading && (
          <EmptyState
            variant="empty"
            title={t("pass3_37.shareWorkflow.noCollaborators")}
            description={t("pass3_37.shareWorkflow.noCollaboratorsDescription")}
          />
        )}
        {people.map((person) => {
          const access = person.access;
          const role: CollaboratorRole =
            access === null
              ? roleOf(person.user_id)
              : access.role === "editor"
                ? "editor"
                : "viewer";
          const invitation = access?.grants.find(
            (grant) => grant.source === "invitation"
          );
          const sources = access
            ? new Intl.ListFormat(undefined, { type: "conjunction" }).format(
                access.grants.map(sourceLabel)
              )
            : null;
          return (
            <FlexColumn key={person.user_id} gap={SPACING.xs}>
              <FlexRow gap={SPACING.sm} align="center" justify="space-between">
                <FlexColumn gap={SPACING.none} sx={{ minWidth: 0 }}>
                  <TruncatedText>{personLabel(person)}</TruncatedText>
                  {person.display_name && person.email ? (
                    <Caption>{person.email}</Caption>
                  ) : null}
                  {sources ? (
                    <Caption>
                      {t("shareDocument.people.from", { sources })}
                    </Caption>
                  ) : null}
                </FlexColumn>
                <FlexRow gap={SPACING.sm} align="center">
                  <SelectField
                    label={t("pass3_37.shareWorkflow.roleFor", {
                      userId: personLabel(person)
                    })}
                    hideLabel
                    size="small"
                    value={role}
                    options={roleOptions}
                    disabled={setRole.isPending}
                    onChange={(value) =>
                      setRole.mutate({
                        userId: person.user_id,
                        role: value as CollaboratorRole
                      })
                    }
                  />
                  <DeleteButton
                    tooltip={t("pass3_37.shareWorkflow.removeAccess")}
                    disabled={removeCollaborator.isPending}
                    onClick={() => removeCollaborator.mutate(person.user_id)}
                  />
                </FlexRow>
              </FlexRow>
              {access && role === "viewer" && (
                <FlexRow gap={SPACING.xs} wrap>
                  {SHARE_OPTION_KEYS.filter((key) => access.options[key]).map(
                    (key) => (
                      <Chip
                        key={key}
                        size="small"
                        label={t(SHARE_OPTION_LABEL_KEYS[key])}
                      />
                    )
                  )}
                </FlexRow>
              )}
              {invitation && invitation.role === "viewer" && role === "viewer" && (
                <ShareOptionSwitches
                  idPrefix={`invitation-${person.user_id}`}
                  options={invitation.options}
                  disabled={optionsPending}
                  onChange={(patch) =>
                    void changeInvitationOptions(person.user_id, patch)
                  }
                />
              )}
            </FlexColumn>
          );
        })}
      </FlexColumn>
    </Dialog>
  );
};

export default memo(ShareDocumentDialog);
