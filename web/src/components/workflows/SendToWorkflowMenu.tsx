/**
 * "Send to workflow": the menu that drops media from a storyboard, script,
 * timeline, or the asset library onto a workflow canvas as constant nodes.
 * It offers a new workflow and every workflow tab open in the current project.
 *
 * The menu reads the workflow manager and router only while it is open, so a
 * surface can carry the button without either provider in scope until use.
 * The Studio shell has no workflows, so the button renders nothing there.
 */

import React, { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import AddIcon from "@mui/icons-material/AddOutlined";

import {
  ContextMenu,
  ListSubheader,
  MenuItemPrimitive,
  ToolbarIconButton
} from "../ui_primitives";
import { useSendMediaToWorkflow } from "../../hooks/useSendMediaToWorkflow";
import { useInStudio } from "../../studio/StudioContext";
import type { WorkflowMediaItem } from "../../hooks/handlers/useGenerationToCanvas";

interface SendToWorkflowMenuProps {
  items: readonly WorkflowMediaItem[];
  /** Anchor for a dropdown. Use `position` for a right-click menu instead. */
  anchorEl?: HTMLElement | null;
  position?: { x: number; y: number } | null;
  onClose: () => void;
}

export const SendToWorkflowMenu: React.FC<SendToWorkflowMenuProps> = memo(
  ({ items, anchorEl, position, onClose }) => {
    const { t } = useTranslation();
    const { targets, send } = useSendMediaToWorkflow();

    const choose = useCallback(
      (workflowId: string | null) => {
        onClose();
        void send(items, workflowId);
      },
      [items, onClose, send]
    );

    return (
      <ContextMenu
        open
        anchorEl={anchorEl}
        position={position}
        onClose={onClose}
        slotProps={{ list: { "aria-label": t("pass3_36.workflows.sendToWorkflow.ariaLabel") } }}
      >
        <ListSubheader>
          {t("pass3_36.workflows.sendToWorkflow.sendItemsTo", { count: items.length })}
        </ListSubheader>
        <MenuItemPrimitive
          label={t("pass3_36.workflows.sendToWorkflow.newWorkflow")}
          icon={<AddIcon fontSize="small" />}
          dividerAfter={targets.length > 0}
          onClick={() => choose(null)}
        />
        {targets.map((target) => (
          <MenuItemPrimitive
            key={target.workflowId}
            label={target.title || t("pass3_36.workflows.sendToWorkflow.untitledWorkflow")}
            icon={<AccountTreeOutlinedIcon fontSize="small" />}
            onClick={() => choose(target.workflowId)}
          />
        ))}
      </ContextMenu>
    );
  }
);
SendToWorkflowMenu.displayName = "SendToWorkflowMenu";

interface SendToWorkflowButtonProps {
  items: readonly WorkflowMediaItem[];
  /** Tooltip, e.g. "Send this still to a workflow". */
  tooltip?: string;
  iconSx?: React.ComponentProps<typeof AccountTreeOutlinedIcon>["sx"];
}

/** A toolbar button that opens {@link SendToWorkflowMenu} below itself. */
export const SendToWorkflowButton: React.FC<SendToWorkflowButtonProps> = memo(
  ({ items, tooltip, iconSx }) => {
    const { t } = useTranslation();
    const inStudio = useInStudio();
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const open = useCallback(
      (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
      },
      []
    );
    const close = useCallback(() => setAnchorEl(null), []);

    if (inStudio) {
      return null;
    }

    return (
      <>
        <ToolbarIconButton
          icon={<AccountTreeOutlinedIcon fontSize="small" sx={iconSx} />}
          tooltip={tooltip ?? t("pass3_36.workflows.sendToWorkflow.tooltip")}
          ariaLabel={t("pass3_36.workflows.sendToWorkflow.ariaLabel")}
          aria-haspopup="menu"
          aria-expanded={anchorEl !== null}
          disabled={items.length === 0}
          onClick={open}
        />
        {anchorEl && (
          <SendToWorkflowMenu items={items} anchorEl={anchorEl} onClose={close} />
        )}
      </>
    );
  }
);
SendToWorkflowButton.displayName = "SendToWorkflowButton";
