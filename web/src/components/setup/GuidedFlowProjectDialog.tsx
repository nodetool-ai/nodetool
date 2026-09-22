/**
 * "Where should this flow live?" — the destination picker every guided flow
 * starts through.
 *
 * One dialog, two hosts: the `+ New` menu (which used to file into the open
 * project) and the New Project surface (which used to make a project row).
 * Picking a row confirms at once — the choice is the whole question, so there
 * is no second button to press. Cancel only closes.
 */

import { memo, useEffect, useState } from "react";

import {
  BORDER_RADIUS,
  Box,
  Caption,
  Dialog,
  EditorButton,
  FlexColumn,
  SPACING,
  Text
} from "../ui_primitives";

export interface GuidedFlowProjectDialogProps {
  open: boolean;
  /** The flow's title, e.g. "Storyboard" — what the title names. */
  flowTitle: string;
  /** The project "current project" files into, as the dialog names it. */
  currentProjectName: string;
  /** A pick is in flight — both rows go quiet until it lands. */
  busy?: boolean;
  /** Offer a one-click new-project start before showing organization choices. */
  quickStart?: boolean;
  onPick: (destination: "current" | "new") => void;
  onClose: () => void;
}

const DestinationRow = ({
  label,
  secondary,
  ariaLabel,
  disabled,
  onPick
}: {
  label: string;
  secondary: string;
  ariaLabel: string;
  disabled: boolean;
  onPick: () => void;
}) => (
  <Box
    component="button"
    type="button"
    aria-label={ariaLabel}
    disabled={disabled}
    onClick={onPick}
    sx={{
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      gap: 0,
      width: "100%",
      px: SPACING.md,
      py: SPACING.sm,
      cursor: "pointer",
      border: "1px solid",
      borderColor: "divider",
      bgcolor: "transparent",
      borderRadius: BORDER_RADIUS.md,
      color: "text.primary",
      textAlign: "left",
      "&:hover": { bgcolor: "action.hover", borderColor: "primary.main" },
      "&:disabled": { opacity: 0.6, cursor: "default" }
    }}
  >
    <Text size="normal">{label}</Text>
    <Caption color="secondary">{secondary}</Caption>
  </Box>
);

const GuidedFlowProjectDialogInternal = ({
  open,
  flowTitle,
  currentProjectName,
  busy = false,
  quickStart = false,
  onPick,
  onClose
}: GuidedFlowProjectDialogProps) => {
  const [showDestinations, setShowDestinations] = useState(!quickStart);

  useEffect(() => {
    if (open) {
      setShowDestinations(!quickStart);
    }
  }, [open, quickStart]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={showDestinations ? `Start ${flowTitle} in…` : `Start ${flowTitle}`}
      minWidth="min(360px, calc(100vw - 32px))"
    >
      {showDestinations ? (
        <FlexColumn gap={SPACING.sm} sx={{ pt: SPACING.sm }}>
          <DestinationRow
            label="Current project"
            secondary={currentProjectName}
            ariaLabel={`Start in current project, ${currentProjectName}`}
            disabled={busy}
            onPick={() => onPick("current")}
          />
          <DestinationRow
            label="New project"
            secondary={`Create a project for this ${flowTitle.toLowerCase()}`}
            ariaLabel="Start in a new project"
            disabled={busy}
            onPick={() => onPick("new")}
          />
        </FlexColumn>
      ) : (
        <FlexColumn gap={SPACING.md} sx={{ pt: SPACING.sm }}>
          <Caption color="secondary">
            We&apos;ll put this in a new project so you can start creating now.
            You can choose a different destination if you need one.
          </Caption>
          <EditorButton
            variant="contained"
            onClick={() => onPick("new")}
            disabled={busy}
          >
            Start in a new project
          </EditorButton>
          <EditorButton
            variant="text"
            onClick={() => setShowDestinations(true)}
            disabled={busy}
          >
            Choose a destination
          </EditorButton>
        </FlexColumn>
      )}
    </Dialog>
  );
};

export const GuidedFlowProjectDialog = memo(GuidedFlowProjectDialogInternal);
GuidedFlowProjectDialog.displayName = "GuidedFlowProjectDialog";

export default GuidedFlowProjectDialog;
