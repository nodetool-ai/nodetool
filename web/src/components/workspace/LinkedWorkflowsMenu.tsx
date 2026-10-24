/**
 * The workflows an app runs, listed on the app surface.
 *
 * Apps and workflows are orthogonal: opening an app never opens a workflow
 * tab. Their graphs are still loaded in the background — the app needs them to
 * resolve bindings — and this menu is the one place they surface. Picking one
 * opens it as a normal workflow tab.
 */
import { memo, useCallback, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import { useLinkedWorkflows, type LinkedWorkflow } from "../../hooks/useApplications";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import {
  Button,
  Caption,
  Chip,
  ContextMenu,
  FlexColumn,
  FlexRow,
  ListItemText,
  MenuItem,
  SPACING
} from "../ui_primitives";

interface LinkedWorkflowsMenuProps {
  applicationId: string;
  /** The app tab has focus — background tabs fetch nothing. */
  active?: boolean;
}

interface LinkedWorkflowsListProps {
  applicationId: string;
  /** The app tab has focus — background tabs fetch nothing. */
  active?: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
}

/**
 * The menu of linked workflows alone, anchored where the host says. The
 * document bar opens it from its ⋮ menu.
 */
export const LinkedWorkflowsList = ({
  applicationId,
  active = true,
  anchorEl,
  onClose
}: LinkedWorkflowsListProps) => {
  const { t } = useTranslation();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const { links } = useLinkedWorkflows(applicationId, active);

  const openWorkflow = useCallback(
    (link: LinkedWorkflow) => {
      openTab({
        type: "workflow",
        ref: link.workflowId,
        mode: "edit",
        title: link.name,
        projectId: link.projectId
      });
      onClose();
    },
    [openTab, onClose]
  );

  return (
    <ContextMenu
      anchorEl={anchorEl}
      open={anchorEl !== null}
      onClose={onClose}
      slotProps={{ list: { "aria-label": t("batch2_0.linkedWorkflowsLabel") } }}
    >
      {links.length === 0 && (
        <MenuItem disabled>
          <ListItemText primary={t("batch2_0.noWorkflowsBound")} />
        </MenuItem>
      )}
      {links.map((link) => {
        const broken = link.error !== null;
        return (
          <MenuItem
            key={link.workflowId}
            disabled={broken}
            onClick={() => openWorkflow(link)}
          >
            <FlexColumn gap={SPACING.micro} sx={{ minWidth: 0 }}>
              <FlexRow align="center" gap={SPACING.xs}>
                <ListItemText
                  primary={broken ? t("batch2_0.workflowUnavailable") : link.name}
                  slotProps={{ primary: { noWrap: true } }}
                />
                {link.isPinned && (
                  <Chip
                    compact
                    color="info"
                    label={
                      link.pinnedVersion === null
                        ? t("batch2_0.pinned")
                        : t("batch2_0.pinnedVersion", { version: link.pinnedVersion })
                    }
                  />
                )}
              </FlexRow>
              <Caption color={broken ? "error" : "secondary"}>
                {broken
                  ? `${link.workflowId} — ${link.error?.message ?? t("batch2_0.couldNotBeLoaded")}`
                  : link.operations.length
                    ? t("batch2_0.usedBy", { names: link.operations.map((operation) => operation.name).join(", ") })
                    : t("batch2_0.boundToNoOperation")}
              </Caption>
            </FlexColumn>
          </MenuItem>
        );
      })}
    </ContextMenu>
  );
};

const LinkedWorkflowsMenu = ({
  applicationId,
  active = true
}: LinkedWorkflowsMenuProps) => {
  const { t } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const { links } = useLinkedWorkflows(applicationId, active);

  const open = useCallback(
    (event: MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget),
    []
  );
  const close = useCallback(() => setAnchorEl(null), []);

  return (
    <>
      <Button
        size="small"
        variant="text"
        onClick={open}
        aria-haspopup="menu"
        aria-expanded={anchorEl !== null}
      >
        {t("batch2_0.linkedWorkflows", { count: links.length })}
      </Button>
      <LinkedWorkflowsList
        applicationId={applicationId}
        active={active}
        anchorEl={anchorEl}
        onClose={close}
      />
    </>
  );
};

export default memo(LinkedWorkflowsMenu);
