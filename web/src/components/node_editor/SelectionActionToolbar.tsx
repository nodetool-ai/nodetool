import React, { memo, useCallback, useMemo, useState } from "react";
import {
  BORDER_RADIUS,
  Caption,
  Divider,
  FlexColumn,
  FlexRow,
  Popover,
  ToolbarIconButton,
  Z_INDEX,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import {
  AlignHorizontalCenter,
  AlignHorizontalLeft,
  AlignHorizontalRight,
  AlignVerticalBottom,
  AlignVerticalCenter,
  AlignVerticalTop,
  ArrowDropDown,
  ContentCopy,
  Delete,
  Layers,
  PlayArrow,
  PowerSettingsNew,
  ViewColumn,
  ViewStream
} from "@mui/icons-material";
import { useNodes } from "../../contexts/NodeContext";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useSelectionActions } from "../../hooks/useSelectionActions";
import { useRunSelectedNodes } from "../../hooks/nodes/useRunSelectedNodes";
import { getShortcutTooltip } from "../../config/shortcuts";

interface SelectionActionToolbarProps {
  visible: boolean;
  onClose?: () => void;
}

interface ToolbarAction {
  icon: React.ReactNode;
  label: string;
  slug: string;
  action: () => void;
  disabled?: boolean;
}

const actionButtonSx = {
  width: 32,
  height: 32,
  "&.Mui-disabled": {
    opacity: 0.4
  }
} as const;

// getShortcutTooltip returns the raw slug when no shortcut is registered for it
// (e.g. runSelected, distributeVertical). Fall back to the human-readable label
// so a tooltip never surfaces an internal slug like "runSelected".
const tooltipFor = (slug: string, label: string): React.ReactNode => {
  const tooltip = getShortcutTooltip(slug, "both", "full", true);
  return typeof tooltip === "string" && tooltip === slug ? label : tooltip;
};

const ActionButton: React.FC<{
  button: ToolbarAction;
  active?: boolean;
  placement?: "top" | "bottom";
}> = ({ button, active = false, placement = "top" }) => (
  <ToolbarIconButton
    icon={button.icon}
    tooltip={tooltipFor(button.slug, button.label)}
    ariaLabel={button.label}
    onClick={button.action}
    disabled={button.disabled}
    variant={active ? "primary" : "default"}
    active={active}
    size="small"
    nodrag
    tooltipPlacement={placement}
    sx={actionButtonSx}
  />
);

const SelectionActionToolbar: React.FC<SelectionActionToolbarProps> = memo(
  ({ visible, onClose }) => {
    // getSelectedNodeCount avoids re-renders on node move (getSelectedNodes
    // returns a fresh array each time a node is dragged).
    const selectedCount = useNodes((state) => state.getSelectedNodeCount());
    const selectionActions = useSelectionActions();
    const { runSelectedNodes, isWorkflowRunning } = useRunSelectedNodes();
    // Instant-update mode runs continuously; keep "Run Selected" enabled (you
    // can re-trigger) instead of strobing disabled on every keystroke-run.
    const instantUpdate = useSettingsStore(
      (state) => state.settings.instantUpdate
    );

    const [arrangeAnchor, setArrangeAnchor] = useState<HTMLElement | null>(
      null
    );
    const arrangeOpen = Boolean(arrangeAnchor);

    const canArrange = selectedCount >= 2;

    const openArrange = useCallback((event: React.MouseEvent<HTMLElement>) => {
      setArrangeAnchor(event.currentTarget);
    }, []);
    const closeArrange = useCallback(() => setArrangeAnchor(null), []);

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent) => {
        if (event.key !== "Escape") {
          return;
        }
        if (arrangeOpen) {
          closeArrange();
        } else {
          onClose?.();
        }
      },
      [arrangeOpen, closeArrange, onClose]
    );

    const horizontalAlign = useMemo<ToolbarAction[]>(
      () => [
        {
          icon: <AlignHorizontalLeft fontSize="small" />,
          label: "Align Left",
          slug: "alignLeft",
          action: selectionActions.alignLeft
        },
        {
          icon: <AlignHorizontalCenter fontSize="small" />,
          label: "Align Center",
          slug: "alignCenter",
          action: selectionActions.alignCenter
        },
        {
          icon: <AlignHorizontalRight fontSize="small" />,
          label: "Align Right",
          slug: "alignRight",
          action: selectionActions.alignRight
        }
      ],
      [selectionActions]
    );

    const verticalAlign = useMemo<ToolbarAction[]>(
      () => [
        {
          icon: <AlignVerticalTop fontSize="small" />,
          label: "Align Top",
          slug: "alignTop",
          action: selectionActions.alignTop
        },
        {
          icon: <AlignVerticalCenter fontSize="small" />,
          label: "Align Middle",
          slug: "alignMiddle",
          action: selectionActions.alignMiddle
        },
        {
          icon: <AlignVerticalBottom fontSize="small" />,
          label: "Align Bottom",
          slug: "alignBottom",
          action: selectionActions.alignBottom
        }
      ],
      [selectionActions]
    );

    const distributeActions = useMemo<ToolbarAction[]>(
      () => [
        {
          icon: <ViewColumn fontSize="small" />,
          label: "Distribute Horizontally",
          slug: "distributeHorizontal",
          action: selectionActions.distributeHorizontal
        },
        {
          icon: <ViewStream fontSize="small" />,
          label: "Distribute Vertically",
          slug: "distributeVertical",
          action: selectionActions.distributeVertical
        }
      ],
      [selectionActions]
    );

    const primaryActions = useMemo<ToolbarAction[]>(
      () => [
        {
          icon: <PlayArrow fontSize="small" />,
          label: "Run Selected",
          slug: "runSelected",
          // onClick forwards a MouseEvent; runSelectedNodes treats its first arg
          // as a run count (Math.floor(event) -> NaN -> no-op), so call it bare.
          action: () => {
            void runSelectedNodes();
          },
          disabled: selectedCount === 0 || (isWorkflowRunning && !instantUpdate)
        },
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
          disabled: !canArrange
        },
        {
          icon: <PowerSettingsNew fontSize="small" />,
          label: "Bypass",
          slug: "bypassNode",
          action: selectionActions.bypassSelected
        }
      ],
      [
        canArrange,
        instantUpdate,
        isWorkflowRunning,
        runSelectedNodes,
        selectedCount,
        selectionActions
      ]
    );

    const deleteAction = useMemo<ToolbarAction>(
      () => ({
        icon: <Delete fontSize="small" />,
        label: "Delete",
        slug: "deleteSelected",
        action: selectionActions.deleteSelected
      }),
      [selectionActions]
    );

    if (!visible) {
      return null;
    }

    return (
      <FlexRow
        className="selection-action-toolbar"
        role="region"
        aria-label="Selection Action Toolbar"
        onKeyDown={handleKeyDown}
        gap={0.5}
        align="center"
        sx={{
          position: "absolute",
          bottom: "auto",
          top: 30,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: Z_INDEX.dropdown,
          padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.md)}`,
          backgroundColor: "var(--palette-grey-800)",
          borderRadius: BORDER_RADIUS.md,
          boxShadow: 1
        }}
      >
        <ToolbarIconButton
          icon={
            <>
              <AlignHorizontalLeft fontSize="small" />
              <ArrowDropDown fontSize="small" />
            </>
          }
          tooltip="Arrange — align & distribute"
          ariaLabel="Arrange"
          onClick={openArrange}
          active={arrangeOpen}
          variant={arrangeOpen ? "primary" : "default"}
          disabled={!canArrange}
          size="small"
          nodrag
          tooltipPlacement="top"
          aria-haspopup="true"
          aria-expanded={arrangeOpen}
          sx={{ ...actionButtonSx, width: "auto", px: 0.5 }}
        />

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />

        {primaryActions.map((button) => (
          <ActionButton key={button.slug} button={button} />
        ))}

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />

        <ActionButton button={deleteAction} />

        <Popover
          open={arrangeOpen}
          anchorEl={arrangeAnchor}
          onClose={closeArrange}
          placement="bottom-center"
          paperSx={{ mt: 0.5 }}
        >
          <FlexColumn gap={1} padding={1.5}>
            <Caption
              size="smaller"
              color="muted"
              sx={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
            >
              Align
            </Caption>
            <FlexRow gap={0.5} align="center">
              {horizontalAlign.map((button) => (
                <ActionButton
                  key={button.slug}
                  button={button}
                  placement="bottom"
                />
              ))}
              <Divider
                orientation="vertical"
                flexItem
                sx={{ mx: 0.5, my: 0.5 }}
              />
              {verticalAlign.map((button) => (
                <ActionButton
                  key={button.slug}
                  button={button}
                  placement="bottom"
                />
              ))}
            </FlexRow>

            <Caption
              size="smaller"
              color="muted"
              sx={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
            >
              Distribute
            </Caption>
            <FlexRow gap={0.5} align="center">
              {distributeActions.map((button) => (
                <ActionButton
                  key={button.slug}
                  button={button}
                  placement="bottom"
                />
              ))}
            </FlexRow>
          </FlexColumn>
        </Popover>
      </FlexRow>
    );
  }
);

SelectionActionToolbar.displayName = "SelectionActionToolbar";

export default SelectionActionToolbar;
