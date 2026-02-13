import React, { memo, useCallback, useMemo } from "react";
import { Box, Divider } from "@mui/material";
import {
  AlignHorizontalLeft,
  AlignHorizontalCenter,
  AlignHorizontalRight,
  AlignVerticalTop,
  AlignVerticalCenter,
  AlignVerticalBottom,
  MoreHoriz,
  MoreVert,
  Delete,
  ContentCopy,
  Layers,
  PowerSettingsNew
} from "@mui/icons-material";
import { useNodes } from "../../contexts/NodeContext";
import { useSelectionActions } from "../../hooks/useSelectionActions";
import { getShortcutTooltip } from "../../config/shortcuts";
import { ToolbarIconButton } from "../ui_primitives";

interface SelectionActionToolbarProps {
  visible: boolean;
  onClose?: () => void;
}

interface ActionButton {
  icon: React.ReactNode;
  label: string;
  slug: string;
  action: () => void;
  disabled?: boolean;
  divider?: false;
}

interface DividerButton {
  divider: true;
}

type ButtonItem = ActionButton | DividerButton;

const isDividerButton = (button: ButtonItem): button is DividerButton => {
  return button.divider === true;
};

const renderButton = (button: ActionButton, index: number, active?: boolean): React.ReactNode => (
  <ToolbarIconButton
    key={`${button.slug}-${index}`}
    icon={button.icon}
    tooltip={getShortcutTooltip(button.slug, "both", "full", true)}
    onClick={button.action}
    disabled={button.disabled}
    variant={active ? "primary" : "default"}
    active={active}
    size="small"
    nodrag={true}
    tooltipPlacement="top"
    sx={{
      width: 32,
      height: 32,
      "&.Mui-disabled": {
        opacity: 0.4
      }
    }}
  />
);

const renderDivider = (index: number): React.ReactNode => (
  <Divider
    key={`divider-${index}`}
    orientation="vertical"
    flexItem
    sx={{ mx: 0.5, my: 0.5 }}
  />
);

const SelectionActionToolbar: React.FC<SelectionActionToolbarProps> = memo(({
  visible,
  onClose,
}) => {
  // Use getSelectedNodeCount to avoid re-renders when nodes are moved (getSelectedNodes returns new array on move)
  const selectedCount = useNodes((state) => state.getSelectedNodeCount());
  const selectionActions = useSelectionActions();

  const canAlign = selectedCount >= 2;
  const canDistribute = selectedCount >= 2;
  const canGroup = selectedCount >= 2;

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape" && onClose) {
        onClose();
      }
    },
    [onClose]
  );

  const alignmentButtons: ButtonItem[] = useMemo(
    () => [
      {
        icon: <AlignHorizontalLeft fontSize="small" />,
        label: "Align Left",
        slug: "alignLeft",
        action: selectionActions.alignLeft,
        disabled: !canAlign
      },
      {
        icon: <AlignHorizontalCenter fontSize="small" />,
        label: "Align Center",
        slug: "alignCenter",
        action: selectionActions.alignCenter,
        disabled: !canAlign
      },
      {
        icon: <AlignHorizontalRight fontSize="small" />,
        label: "Align Right",
        slug: "alignRight",
        action: selectionActions.alignRight,
        disabled: !canAlign
      },
      { divider: true },
      {
        icon: <AlignVerticalTop fontSize="small" />,
        label: "Align Top",
        slug: "alignTop",
        action: selectionActions.alignTop,
        disabled: !canAlign
      },
      {
        icon: <AlignVerticalCenter fontSize="small" />,
        label: "Align Middle",
        slug: "alignMiddle",
        action: selectionActions.alignMiddle,
        disabled: !canAlign
      },
      {
        icon: <AlignVerticalBottom fontSize="small" />,
        label: "Align Bottom",
        slug: "alignBottom",
        action: selectionActions.alignBottom,
        disabled: !canAlign
      }
    ],
    [canAlign, selectionActions]
  );

  const distributionButtons: ButtonItem[] = useMemo(
    () => [
      {
        icon: <MoreHoriz fontSize="small" />,
        label: "Distribute Horizontally",
        slug: "distributeHorizontal",
        action: selectionActions.distributeHorizontal,
        disabled: !canDistribute
      },
      {
        icon: <MoreVert fontSize="small" />,
        label: "Distribute Vertically",
        slug: "distributeVertical",
        action: selectionActions.distributeVertical,
        disabled: !canDistribute
      }
    ],
    [canDistribute, selectionActions]
  );

  const actionButtons: ButtonItem[] = useMemo(
    () => [
      {
        icon: <ContentCopy fontSize="small" />,
        label: "Duplicate",
        slug: "duplicate",
        action: selectionActions.duplicateSelected
      },
      {
        icon: <Layers fontSize="small" />,
        label: "Group",
        slug: "groupSelected",
        action: selectionActions.groupSelected,
        disabled: !canGroup
      },
      {
        icon: <PowerSettingsNew fontSize="small" />,
        label: "Bypass",
        slug: "bypassNode",
        action: selectionActions.bypassSelected
      },
      { divider: true },
      {
        icon: <Delete fontSize="small" />,
        label: "Delete",
        slug: "deleteSelected",
        action: selectionActions.deleteSelected
      }
    ],
    [canGroup, selectionActions]
  );

  // Memoize the combined button array to avoid creating new references on every render
  // This must be declared before the early return to follow React Hooks rules
  const allButtons: ButtonItem[] = useMemo(
    () => [
      ...alignmentButtons,
      { divider: true } as DividerButton,
      ...distributionButtons,
      { divider: true } as DividerButton,
      ...actionButtons
    ],
    [alignmentButtons, distributionButtons, actionButtons]
  );

  if (!visible) {
    return null;
  }

  return (
    <Box
      className="selection-action-toolbar"
      role="region"
      aria-label="Selection Action Toolbar"
      onKeyDown={handleKeyDown}
      sx={{
        position: "absolute",
        bottom: "auto",
        top: 30,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        padding: "6px 10px",
        backgroundColor: 'var(--palette-grey-800)',
        borderRadius: 2,
        boxShadow: 1,
      }}
    >
      {allButtons.map((button, index) => {
        if (isDividerButton(button)) {
          return renderDivider(index);
        }

        const actionButton = button as ActionButton;
        return renderButton(actionButton, index);
      })}
    </Box>
  );
});

SelectionActionToolbar.displayName = 'SelectionActionToolbar';

export default SelectionActionToolbar;
