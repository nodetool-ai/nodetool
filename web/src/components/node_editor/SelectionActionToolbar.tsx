import React, { useCallback, useMemo } from "react";
import { Box, IconButton, Tooltip, Divider } from "@mui/material";
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
  CallSplit,
  BookmarkAdd
} from "@mui/icons-material";
import { useNodes } from "../../contexts/NodeContext";
import { useSelectionActions } from "../../hooks/useSelectionActions";
import { getShortcutTooltip } from "../../config/shortcuts";

interface SelectionActionToolbarProps {
  visible: boolean;
  onClose?: () => void;
  onSaveSnippet?: () => void;
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
  <Tooltip
    key={`${button.slug}-${index}`}
    title={getShortcutTooltip(button.slug, "both", "full", true)}
    arrow
    placement="top"
  >
    <span>
      <IconButton
        size="small"
        aria-label={button.label}
        onClick={button.action}
        disabled={button.disabled}
        color={active ? "primary" : "default"}
        sx={{
          width: 32,
          height: 32,
          "&:hover": {
            bgcolor: active ? "primary.main" : "action.hover"
          },
          "&.Mui-disabled": {
            opacity: 0.4
          }
        }}
      >
        {button.icon}
      </IconButton>
    </span>
  </Tooltip>
);

const renderDivider = (index: number): React.ReactNode => (
  <Divider
    key={`divider-${index}`}
    orientation="vertical"
    flexItem
    sx={{ mx: 0.5, my: 0.5 }}
  />
);

const SelectionActionToolbar: React.FC<SelectionActionToolbarProps> = ({
  visible,
  onClose,
  onSaveSnippet,
}) => {
  const selectedNodes = useNodes((state) => state.getSelectedNodes());
  const selectionActions = useSelectionActions();

  const canAlign = selectedNodes.length >= 2;
  const canDistribute = selectedNodes.length >= 2;
  const canGroup = selectedNodes.length >= 2;
  const canSaveSnippet = selectedNodes.length >= 2 && onSaveSnippet;

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
        icon: <BookmarkAdd fontSize="small" />,
        label: "Save as Snippet",
        slug: "saveSnippet",
        action: () => onSaveSnippet?.(),
        disabled: !canSaveSnippet
      },
      { divider: true },
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
        icon: <CallSplit fontSize="small" />,
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
    [canGroup, canSaveSnippet, onSaveSnippet, selectionActions]
  );

  if (!visible) {
    return null;
  }

  const allButtons: ButtonItem[] = [
    ...alignmentButtons,
    { divider: true } as DividerButton,
    ...distributionButtons,
    { divider: true } as DividerButton,
    ...actionButtons
  ];

  return (
    <Box
      className="selection-action-toolbar"
      role="region"
      aria-label="Selection Action Toolbar"
      onKeyDown={handleKeyDown}
      sx={{
        position: "absolute",
        bottom: "auto",
        top: 80,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        padding: "6px 10px",
        bgcolor: "background.paper",
        borderRadius: 2,
        boxShadow: 3,
        border: 1,
        borderColor: "divider"
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
};

export default SelectionActionToolbar;
