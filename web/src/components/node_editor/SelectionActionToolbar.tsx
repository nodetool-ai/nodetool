import React, { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Caption,
  Divider,
  FlexColumn,
  FlexRow,
  FloatingToolbar,
  Popover,
  ToolbarIconButton,
  Z_INDEX
} from "../ui_primitives";
import AlignHorizontalCenter from "@mui/icons-material/AlignHorizontalCenter";
import AlignHorizontalLeft from "@mui/icons-material/AlignHorizontalLeft";
import AlignHorizontalRight from "@mui/icons-material/AlignHorizontalRight";
import AlignVerticalBottom from "@mui/icons-material/AlignVerticalBottom";
import AlignVerticalCenter from "@mui/icons-material/AlignVerticalCenter";
import AlignVerticalTop from "@mui/icons-material/AlignVerticalTop";
import ArrowDropDown from "@mui/icons-material/ArrowDropDown";
import ContentCopy from "@mui/icons-material/ContentCopy";
import Delete from "@mui/icons-material/DeleteOutline";
import Layers from "@mui/icons-material/Layers";
import LinkIcon from "@mui/icons-material/Link";
import PlayArrow from "@mui/icons-material/PlayArrow";
import PowerSettingsNew from "@mui/icons-material/PowerSettingsNew";
import ViewColumn from "@mui/icons-material/ViewColumn";
import ViewStream from "@mui/icons-material/ViewStream";
import { useNodes } from "../../contexts/NodeContext";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useSelectionActions } from "../../hooks/useSelectionActions";
import { useRunSelectedNodes } from "../../hooks/nodes/useRunSelectedNodes";
import { getShortcutTooltip } from "../../config/shortcuts";
import { isString } from "../../utils/typePredicates";

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

const DIVIDER_SX = { mx: 0.5, my: 0.5 } as const;
const CAPTION_SX = { textTransform: "uppercase", letterSpacing: "0.08em" } as const;
const ARRANGE_BUTTON_SX = { ...actionButtonSx, width: "auto", px: 0.5 } as const;

// getShortcutTooltip returns the raw slug when no shortcut is registered for it
// (e.g. runSelected, distributeVertical). Fall back to the human-readable label
// so a tooltip never surfaces an internal slug like "runSelected".
const tooltipFor = (slug: string, label: string): React.ReactNode => {
  const tooltip = getShortcutTooltip(slug, "both", "full", true);
  return isString(tooltip) && tooltip === slug ? label : tooltip;
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
    const { t } = useTranslation();
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
          label: t("selectionToolbar.alignLeft"),
          slug: "alignLeft",
          action: selectionActions.alignLeft
        },
        {
          icon: <AlignHorizontalCenter fontSize="small" />,
          label: t("selectionToolbar.alignCenter"),
          slug: "alignCenter",
          action: selectionActions.alignCenter
        },
        {
          icon: <AlignHorizontalRight fontSize="small" />,
          label: t("selectionToolbar.alignRight"),
          slug: "alignRight",
          action: selectionActions.alignRight
        }
      ],
      [selectionActions, t]
    );

    const verticalAlign = useMemo<ToolbarAction[]>(
      () => [
        {
          icon: <AlignVerticalTop fontSize="small" />,
          label: t("selectionToolbar.alignTop"),
          slug: "alignTop",
          action: selectionActions.alignTop
        },
        {
          icon: <AlignVerticalCenter fontSize="small" />,
          label: t("selectionToolbar.alignMiddle"),
          slug: "alignMiddle",
          action: selectionActions.alignMiddle
        },
        {
          icon: <AlignVerticalBottom fontSize="small" />,
          label: t("selectionToolbar.alignBottom"),
          slug: "alignBottom",
          action: selectionActions.alignBottom
        }
      ],
      [selectionActions, t]
    );

    const distributeActions = useMemo<ToolbarAction[]>(
      () => [
        {
          icon: <ViewColumn fontSize="small" />,
          label: t("selectionToolbar.distributeHorizontally"),
          slug: "distributeHorizontal",
          action: selectionActions.distributeHorizontal
        },
        {
          icon: <ViewStream fontSize="small" />,
          label: t("selectionToolbar.distributeVertically"),
          slug: "distributeVertical",
          action: selectionActions.distributeVertical
        }
      ],
      [selectionActions, t]
    );

    const primaryActions = useMemo<ToolbarAction[]>(
      () => [
        {
          icon: <PlayArrow fontSize="small" />,
          label: t("selectionToolbar.runSelected"),
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
          label: t("selectionToolbar.duplicate"),
          slug: "duplicate",
          action: selectionActions.duplicateSelected
        },
        {
          icon: <Layers fontSize="small" />,
          label: t("selectionToolbar.group"),
          slug: "groupSelected",
          action: selectionActions.groupSelected,
          disabled: !canArrange
        },
        {
          icon: <LinkIcon fontSize="small" />,
          label: t("selectionToolbar.linkLineageOnly"),
          slug: "linkSelected",
          action: selectionActions.linkSelected,
          disabled: selectedCount !== 2
        },
        {
          icon: <PowerSettingsNew fontSize="small" />,
          label: t("selectionToolbar.disable"),
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
        selectionActions,
        t
      ]
    );

    const deleteAction = useMemo<ToolbarAction>(
      () => ({
        icon: <Delete fontSize="small" />,
        label: t("selectionToolbar.delete"),
        slug: "deleteSelected",
        action: selectionActions.deleteSelected
      }),
      [selectionActions, t]
    );

    if (!visible) {
      return null;
    }

    return (
      <FloatingToolbar
        className="selection-action-toolbar"
        role="region"
        aria-label={t("selectionToolbar.ariaLabel")}
        onKeyDown={handleKeyDown}
        sx={{
          position: "absolute",
          bottom: "auto",
          top: 30,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: Z_INDEX.dropdown
        }}
      >
        <ToolbarIconButton
          icon={
            <>
              <AlignHorizontalLeft fontSize="small" />
              <ArrowDropDown fontSize="small" />
            </>
          }
          tooltip={t("selectionToolbar.arrangeTooltip")}
          ariaLabel={t("selectionToolbar.arrange")}
          onClick={openArrange}
          active={arrangeOpen}
          variant={arrangeOpen ? "primary" : "default"}
          disabled={!canArrange}
          size="small"
          nodrag
          tooltipPlacement="top"
          aria-haspopup="true"
          aria-expanded={arrangeOpen}
          sx={ARRANGE_BUTTON_SX}
        />

        <Divider orientation="vertical" flexItem sx={DIVIDER_SX} />

        {primaryActions.map((button) => (
          <ActionButton key={button.slug} button={button} />
        ))}

        <Divider orientation="vertical" flexItem sx={DIVIDER_SX} />

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
              sx={CAPTION_SX}
            >
              {t("selectionToolbar.align")}
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
                sx={DIVIDER_SX}
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
              sx={CAPTION_SX}
            >
              {t("selectionToolbar.distribute")}
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
      </FloatingToolbar>
    );
  }
);

SelectionActionToolbar.displayName = "SelectionActionToolbar";

export default SelectionActionToolbar;
