import React, { useCallback, useMemo, useState } from "react";
import { Box, IconButton, Tooltip, Divider, Popover, Button } from "@mui/material";
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
  Palette,
  ChevronRight
} from "@mui/icons-material";
import { useNodes } from "../../contexts/NodeContext";
import { useSelectionActions } from "../../hooks/useSelectionActions";
import { useNodeColoring } from "../../hooks/useNodeColoring";
import { useNodeColorPresetsStore } from "../../stores/NodeColorPresetsStore";
import { getShortcutTooltip } from "../../config/shortcuts";

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

const ColorPresetButton: React.FC<{
  color: string;
  name: string;
  onClick: () => void;
  disabled?: boolean;
}> = ({ color, name, onClick, disabled }) => (
  <Tooltip title={name} arrow placement="top">
    <span>
      <IconButton
        size="small"
        aria-label={`Apply ${name} color`}
        onClick={onClick}
        disabled={disabled}
        sx={{
          width: 28,
          height: 28,
          backgroundColor: color,
          border: 1,
          borderColor: "grey.400",
          "&:hover": {
            backgroundColor: color,
            opacity: 0.8
          },
          "&.Mui-disabled": {
            opacity: 0.4
          }
        }}
      />
    </span>
  </Tooltip>
);

const renderButton = (button: ActionButton, index: number): React.ReactNode => (
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
        sx={{
          width: 32,
          height: 32,
          "&:hover": {
            bgcolor: "action.hover"
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
  onClose
}) => {
  const selectedNodes = useNodes((state) => state.getSelectedNodes());
  const selectionActions = useSelectionActions();
  const { applyPresetToSelected, hasSelectedNodes } = useNodeColoring();
  const presets = useNodeColorPresetsStore((state) => state.presets);
  const setDialogOpen = useNodeColorPresetsStore((state) => state.setDialogOpen);

  const [colorAnchorEl, setColorAnchorEl] = useState<null | HTMLElement>(null);

  const canAlign = selectedNodes.length >= 2;
  const canDistribute = selectedNodes.length >= 2;
  const canGroup = selectedNodes.length >= 2;

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape" && onClose) {
        onClose();
      }
    },
    [onClose]
  );

  const handleOpenColorMenu = useCallback(() => {
    setColorAnchorEl(document.body);
  }, []);

  const handleColorClose = useCallback(() => {
    setColorAnchorEl(null);
  }, []);

  const handlePresetClick = useCallback(
    (presetId: string) => {
      applyPresetToSelected(presetId);
      handleColorClose();
    },
    [applyPresetToSelected, handleColorClose]
  );

  const handleManagePresets = useCallback(() => {
    setDialogOpen(true);
    handleColorClose();
  }, [setDialogOpen, handleColorClose]);

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
    [canGroup, selectionActions]
  );

  const colorButtons: ButtonItem[] = useMemo(
    () => [
      {
        icon: <Palette fontSize="small" />,
        label: "Color Presets",
        slug: "colorPresets",
        action: handleOpenColorMenu,
        disabled: !hasSelectedNodes
      }
    ],
    [hasSelectedNodes, handleOpenColorMenu]
  );

  if (!visible) {
    return null;
  }

  const allButtons: ButtonItem[] = [
    ...alignmentButtons,
    { divider: true } as DividerButton,
    ...distributionButtons,
    { divider: true } as DividerButton,
    ...colorButtons,
    { divider: true } as DividerButton,
    ...actionButtons
  ];

  const visiblePresets = presets.slice(0, 8);

  return (
    <>
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

      <Popover
        open={Boolean(colorAnchorEl)}
        anchorEl={colorAnchorEl}
        onClose={handleColorClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "center"
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "center"
        }}
        PaperProps={{
          sx: {
            bgcolor: "background.paper",
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
            p: 1
          }
        }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 200 }}>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            {visiblePresets.map((preset) => (
              <ColorPresetButton
                key={preset.id}
                color={preset.color}
                name={preset.name}
                onClick={() => handlePresetClick(preset.id)}
                disabled={!hasSelectedNodes}
              />
            ))}
          </Box>
          <Divider />
          <Button
            size="small"
            startIcon={<Palette fontSize="small" />}
            endIcon={<ChevronRight fontSize="small" />}
            onClick={handleManagePresets}
            sx={{ justifyContent: "flex-start" }}
          >
            Manage Presets...
          </Button>
        </Box>
      </Popover>
    </>
  );
};

export default SelectionActionToolbar;
