/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import useContextMenuStore from "../../stores/ContextMenuStore";
import useLogsStore, { nodeLogKey } from "../../stores/LogStore";
import { shallow } from "zustand/shallow";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import isEqual from "fast-deep-equal";
import { NodeData } from "../../stores/NodeData";
import { useNodes } from "../../contexts/NodeContext";
import { IconForType } from "../../config/data_types";
import { hexToRgba } from "../../utils/ColorUtils";
import { Badge } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ListAltIcon from "@mui/icons-material/ListAlt";
import { Visibility, InputOutlined, OpenInNew } from "@mui/icons-material";
import { NodeLogsDialog } from "./NodeLogs";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { FlexRow, Tooltip, ToolbarIconButton } from "../ui_primitives";

export interface NodeHeaderProps {
  id: string;
  metadataTitle: string;
  title?: string;
  hasParent?: boolean;
  showMenu?: boolean;
  data: NodeData;
  backgroundColor?: string;
  selected?: boolean;
  iconType?: string;
  iconBaseColor?: string;
  showIcon?: boolean;
  workflowId?: string;
  hideLogs?: boolean;
  // Toggle buttons for result/inputs view
  showResultButton?: boolean;
  showInputsButton?: boolean;
  onShowResults?: () => void;
  onShowInputs?: () => void;
  externalLink?: string;
  externalLinkTitle?: string;
  isTitleEditable?: boolean;
  showCodeBadge?: boolean;
  codeBadgeTooltip?: string;
}

// Stable empty array reference — prevents creating a new array instance each
// render when a node has no logs, keeping Zustand's reference-equality check
// from triggering unnecessary re-renders.
const EMPTY_NODE_LOGS: ReturnType<typeof useLogsStore.getState>["logsByNode"][string] =
  [];

// Constant sx styles for header toggle buttons — defined outside the component
// so the same object reference is reused across renders.
const toggleIconButtonStyles = {
  padding: "4px",
  backgroundColor: "rgba(255, 255, 255, 0.05)",
  color: "var(--palette-text-primary)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderRadius: "var(--rounded-circle)",
  "&:hover": {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderColor: "var(--palette-primary-main)"
  }
};

export const NodeHeader: React.FC<NodeHeaderProps> = ({
  id,
  metadataTitle,
  title,
  hasParent,
  backgroundColor,
  selected,
  iconType,
  iconBaseColor,
  showIcon = true,
  data,
  workflowId,
  hideLogs = false,
  showResultButton = false,
  showInputsButton = false,
  onShowResults,
  onShowInputs,
  externalLink,
  externalLinkTitle,
  isTitleEditable = false,
  showCodeBadge = false,
  codeBadgeTooltip = "Code node"
}: NodeHeaderProps) => {
  const theme = useTheme();
  const isLightMode = theme.palette.mode === "light";
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  // Combine multiple useNodes subscriptions into a single selector with shallow equality
  // to reduce unnecessary re-renders when other parts of the node state change
  const { updateNode, updateNodeData, workflowId: nodeWorkflowId } = useNodes(
    (state) => ({
      updateNode: state.updateNode,
      updateNodeData: state.updateNodeData,
      workflowId: state.workflow?.id
    }),
    shallow
  );
  const targetWorkflowId = workflowId || nodeWorkflowId || "";
  // O(1) lookup via pre-keyed map — avoids filtering the full logs array on
  // every store update (which previously ran for every NodeHeader in the graph).
  const logs = useLogsStore(
    (state) => state.logsByNode[nodeLogKey(targetWorkflowId, id)] ?? EMPTY_NODE_LOGS
  );
  const [logsDialogOpen, setLogsDialogOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title ?? metadataTitle);

  const logCount = logs?.length || 0;

  useEffect(() => {
    if (!isEditingTitle) {
      setDraftTitle(title ?? metadataTitle);
    }
  }, [isEditingTitle, metadataTitle, title]);

  const headerCss = useMemo(
    () =>
      css({
        width: "100%",
        minHeight: "44px",
        backgroundColor: "transparent",
        color: "var(--palette-grey-0)",
        margin: 0,
        padding: "0 4px",
        borderRadius:
          "calc(var(--rounded-node) - 1px) calc(var(--rounded-node) - 1px) 0 0",
        borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
        transition: "background-color 0.2s ease-in-out, opacity 0.15s",
        ".header-left": {
          padding: "4px 4px",
          flex: 1,
          minWidth: 0
        },
        ".header-right": {
          display: "flex",
          alignItems: "center",
          gap: "4px",
          padding: "4px 4px",
          flexShrink: 0
        },
        ".node-icon": {
          width: "28px",
          minWidth: "28px",
          height: "28px",
          borderRadius: "var(--rounded-md)",
          display: "grid",
          placeItems: "center",
          boxShadow: "0 0 3px rgba(0, 0, 0, 0.1)",
          marginRight: "4px",
          flexShrink: 0,
          "& svg": {
            transform: "scale(0.9)"
          }
        },
        ".node-title": {
          display: "inline-flex",
          flexDirection: "row",
          alignItems: "center",
          gap: "6px",
          flexGrow: 1,
          minWidth: 0,
          textAlign: "left",
          wordWrap: "break-word",
          lineHeight: "1.2em",
          fontSize: "var(--fontSizeNormal)",
          fontWeight: 500,
          letterSpacing: "0.02em",
          padding: "2px 0",
          color: "var(--palette-text-primary)"
        },
        ".node-title-text": {
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        },
        ".code-badge": {
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "16px",
          height: "16px",
          borderRadius: "999px",
          fontSize: "0.6rem",
          fontWeight: 700,
          letterSpacing: "0.02em",
          color: "var(--palette-text-primary)",
          backgroundColor: "rgba(255, 255, 255, 0.12)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          flexShrink: 0
        },
        ".node-title-input": {
          width: "100%",
          background: "transparent",
          border: "none",
          outline: "none",
          color: "inherit",
          font: "inherit",
          padding: 0,
          margin: 0
        }
      }),
    []
  );

  const handleHeaderContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      openContextMenu(
        "node-context-menu",
        id,
        event.clientX,
        event.clientY,
        "node-header"
      );
    },
    [id, openContextMenu]
  );

  const handleHeaderClick = useCallback(() => {
    updateNode(id, { selected: true });
  }, [id, updateNode]);

  const handleOpenLogsDialog = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setLogsDialogOpen(true);
  }, []);

  const handleShowResultsClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onShowResults?.();
  }, [onShowResults]);

  const handleShowInputsClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onShowInputs?.();
  }, [onShowInputs]);

  const handleCloseLogsDialog = useCallback(() => {
    setLogsDialogOpen(false);
  }, []);

  const commitTitleEdit = useCallback(() => {
    const trimmedTitle = draftTitle.trim();
    updateNodeData(id, {
      title: trimmedTitle || undefined
    });
    setIsEditingTitle(false);
  }, [draftTitle, id, updateNodeData]);

  const handleTitleDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLSpanElement>) => {
      if (!isTitleEditable) {
        return;
      }
      event.stopPropagation();
      setIsEditingTitle(true);
    },
    [isTitleEditable]
  );

  const handleTitleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitTitleEdit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        setDraftTitle(title ?? metadataTitle);
        setIsEditingTitle(false);
      }
    },
    [commitTitleEdit, metadataTitle, title]
  );

  const hasIcon = Boolean(iconType);
  const resolvedTitle = title ?? metadataTitle;

  const headerStyle: React.CSSProperties | undefined = useMemo(() => {
    if (backgroundColor === "transparent") {
      return { background: "transparent" } as React.CSSProperties;
    }
    const hasCategoryColor = Boolean(backgroundColor);
    if (isLightMode) {
      if (!hasCategoryColor) {
        return {
          background: "var(--palette-grey-800)",
          borderBottom: "1px solid var(--palette-divider)"
        } as React.CSSProperties;
      }
      const flat = selected ? 0.32 : 0.2;
      return {
        background: hexToRgba(backgroundColor!, flat),
        borderBottom: `1px solid ${hexToRgba(backgroundColor!, 0.28)}`
      } as React.CSSProperties;
    }
    const tint = backgroundColor || "var(--c_node_header_bg)";
    const baseOpacity = selected ? 0.55 : 0.35;
    const endOpacity = selected ? 0.22 : 0.12;
    return {
      background: `linear-gradient(135deg, ${hexToRgba(tint, baseOpacity)}, ${hexToRgba(
        tint,
        endOpacity
      )})`
    } as React.CSSProperties;
  }, [backgroundColor, selected, isLightMode]);

  // Memoize icon background style to prevent recreation on every render
  const iconBackgroundStyle = useMemo(() => ({
    background: iconBaseColor
      ? hexToRgba(iconBaseColor, isLightMode ? 0.14 : 0.22)
      : isLightMode
        ? "rgba(26,23,21,0.05)"
        : "rgba(255,255,255,0.08)"
  }), [iconBaseColor, isLightMode]);

  // Memoize title padding style to prevent recreation on every render
  const titlePaddingStyle = useMemo(() => ({
    paddingLeft: hasIcon ? 0 : undefined
  }), [hasIcon]);

  return (
    <FlexRow
      className={`node-drag-handle node-header ${hasParent ? "has-parent" : ""
        }`}
      css={headerCss}
      gap={1}
      justify="space-between"
      align="center"
      onClick={handleHeaderClick}
      onContextMenu={handleHeaderContextMenu}
      style={headerStyle || { backgroundColor }}
    >
      <FlexRow className="header-left" gap={1} align="center">
        {hasIcon && showIcon && (
          <div
            className="node-icon"
            style={iconBackgroundStyle}
          >
            <IconForType
              iconName={iconType!}
              showTooltip={false}
              iconSize="small"
            />
          </div>
        )}
        <span
          className="node-title"
          style={titlePaddingStyle}
          onDoubleClick={handleTitleDoubleClick}
        >
          {showCodeBadge && (
            <Tooltip title={codeBadgeTooltip} placement="top" delay={400}>
              <span className="code-badge">C</span>
            </Tooltip>
          )}
          {isEditingTitle ? (
            <input
              className="node-title-input nodrag nopan"
              autoFocus
              value={draftTitle}
              onBlur={commitTitleEdit}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => setDraftTitle(event.target.value)}
              onKeyDown={handleTitleKeyDown}
            />
          ) : (
            <span className="node-title-text">{resolvedTitle}</span>
          )}
        </span>
        {externalLink && (
          <ToolbarIconButton
            title={externalLinkTitle || "Open link"}
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              window.open(externalLink, "_blank", "noopener,noreferrer");
            }}
            sx={{
              padding: "2px",
              marginLeft: "2px",
              color: "rgba(255, 255, 255, 0.4)",
              "&:hover": {
                color: "primary.light",
                backgroundColor: "rgba(255, 255, 255, 0.05)"
              }
            }}
          >
            <OpenInNew sx={{ fontSize: "0.85rem" }} />
          </ToolbarIconButton>
        )}
        {data.bypassed && (
          <span className="bypass-badge">Bypassed</span>
        )}
        {logCount > 0 && !hideLogs && (
          <ToolbarIconButton
            title={`${logCount} logs`}
            size="small"
            onClick={handleOpenLogsDialog}
            sx={{ padding: "4px" }}
          >
            <Badge badgeContent={logCount} color="warning" max={99}>
              <ListAltIcon sx={{ fontSize: "1rem" }} />
            </Badge>
          </ToolbarIconButton>
        )}
      </FlexRow>

      {/* Right side toggle buttons */}
      {(showResultButton || showInputsButton) && (
        <div className="header-right">
          {/* Show Result button */}
          {showResultButton && onShowResults && (
            <ToolbarIconButton
              title="Show Result"
              delay={TOOLTIP_ENTER_DELAY}
              size="small"
              onClick={handleShowResultsClick}
              sx={toggleIconButtonStyles}
            >
              <Visibility sx={{ fontSize: 16 }} />
            </ToolbarIconButton>
          )}
          {/* Show Inputs button */}
          {showInputsButton && onShowInputs && (
            <ToolbarIconButton
              title="Show Inputs"
              delay={TOOLTIP_ENTER_DELAY}
              size="small"
              onClick={handleShowInputsClick}
              sx={toggleIconButtonStyles}
            >
              <InputOutlined sx={{ fontSize: 16 }} />
            </ToolbarIconButton>
          )}
        </div>
      )}

      <NodeLogsDialog
        id={id}
        workflowId={workflowId || nodeWorkflowId || ""}
        open={logsDialogOpen}
        onClose={handleCloseLogsDialog}
      />
    </FlexRow>
  );
};

export default memo(NodeHeader, isEqual);
