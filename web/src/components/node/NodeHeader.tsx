/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import useContextMenuStore from "../../stores/ContextMenuStore";
import useLogsStore, { nodeLogKey } from "../../stores/LogStore";
import { shallow } from "zustand/shallow";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import isEqual from "fast-deep-equal";
import { NodeData } from "../../stores/NodeData";
import { getCollapseTogglePatches } from "../../stores/collapseNodeLayout";
import { useNodes } from "../../contexts/NodeContext";
import { IconForType } from "../../config/IconForType";
import ListAltIcon from "@mui/icons-material/ListAlt";
import { OpenInNew } from "@mui/icons-material";
import { NodeLogsDialog } from "./NodeLogs";
import { BORDER_RADIUS, FlexRow, Tooltip, ToolbarIconButton, MOTION, SPACING, getSpacingPx } from "../ui_primitives";

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

const ICON_BACKGROUND_STYLE = { background: "transparent" };

export const NodeHeader: React.FC<NodeHeaderProps> = ({
  id,
  metadataTitle,
  title,
  hasParent,
  backgroundColor,
  iconType,
  showIcon = true,
  data,
  workflowId,
  hideLogs = false,
  externalLink,
  externalLinkTitle,
  isTitleEditable = false,
  showCodeBadge = false,
  codeBadgeTooltip = "Code node"
}: NodeHeaderProps) => {
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  // Combine multiple useNodes subscriptions into a single selector with shallow equality
  // to reduce unnecessary re-renders when other parts of the node state change
  const { updateNode, updateNodeData, findNode, workflowId: nodeWorkflowId } =
    useNodes(
      (state) => ({
        updateNode: state.updateNode,
        updateNodeData: state.updateNodeData,
        findNode: state.findNode,
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
        minHeight: "24px",
        backgroundColor: "transparent",
        color: "var(--palette-text-secondary)",
        margin: 0,
        padding: 0,
        borderRadius:
          "calc(var(--rounded-node) - 1px) calc(var(--rounded-node) - 1px) 0 0",
        borderBottom: "none",
        transition: `background-color ${MOTION.normal}, opacity ${MOTION.fast}`,
        ".header-left": {
          padding: 0,
          flex: 1,
          minWidth: 0
        },
        ".header-right": {
          display: "flex",
          alignItems: "center",
          gap: getSpacingPx(SPACING.xs),
          padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.micro)}`,
          flexShrink: 0
        },
        ".node-icon": {
          width: "20px",
          minWidth: "20px",
          height: "20px",
          borderRadius: BORDER_RADIUS.sm,
          display: "grid",
          placeItems: "center",
          marginRight: getSpacingPx(SPACING.xs),
          flexShrink: 0,
          opacity: 0.65,
          // Hit target must be this div (not nested SVG), otherwise React Flow / d3-drag may not
          // treat the gesture as starting on `.node-drag-handle` in some browsers.
          "& *": {
            pointerEvents: "none"
          },
          "& svg": {
            transform: "scale(0.8)"
          }
        },
        ".node-title": {
          display: "inline-flex",
          flexDirection: "row",
          alignItems: "center",
          gap: getSpacingPx(SPACING.sm),
          flexGrow: 1,
          minWidth: 0,
          textAlign: "left",
          wordWrap: "break-word",
          lineHeight: "1.2em",
          fontSize: "var(--fontSizeSmall)",
          fontWeight: 400,
          letterSpacing: "0.01em",
          padding: `${getSpacingPx(SPACING.micro)} 0`,
          color: "var(--palette-text-secondary)"
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
          borderRadius: BORDER_RADIUS.pill,
          fontSize: "var(--fontSizeSmaller)",
          fontWeight: 600,
          letterSpacing: "0.02em",
          color: "var(--palette-text-primary)",
          backgroundColor: "var(--palette-c_overlay_strong)",
          border: "1px solid var(--palette-c_overlay_strong)",
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

  const toggleCollapsed = useCallback(() => {
    const node = findNode(id);
    if (!node) {
      return;
    }
    const next = !node.data.collapsed;
    const { data: dataPatch, node: nodePatch } = getCollapseTogglePatches(
      node,
      next
    );
    updateNodeData(id, dataPatch);
    updateNode(id, nodePatch);
  }, [findNode, id, updateNode, updateNodeData]);

  const handleIconDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.stopPropagation();
      event.preventDefault();
      toggleCollapsed();
    },
    [toggleCollapsed]
  );

  const handleOpenLogsDialog = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setLogsDialogOpen(true);
  }, []);

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
      if (isTitleEditable) {
        event.stopPropagation();
        setIsEditingTitle(true);
        return;
      }
      event.stopPropagation();
      event.preventDefault();
      toggleCollapsed();
    },
    [isTitleEditable, toggleCollapsed]
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

  // Neutral header — category color intentionally dropped to keep chrome quiet.
  const headerStyle: React.CSSProperties | undefined = useMemo(() => {
    if (backgroundColor === "transparent") {
      return { background: "transparent" } as React.CSSProperties;
    }
    return {
      background: "transparent",
      borderBottom: "none"
    } as React.CSSProperties;
  }, [backgroundColor]);

  const iconBackgroundStyle = ICON_BACKGROUND_STYLE;

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
            className="node-icon node-drag-handle"
            style={iconBackgroundStyle}
            onDoubleClick={handleIconDoubleClick}
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
              aria-label="Node title"
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
              padding: getSpacingPx(SPACING.micro),
              marginLeft: getSpacingPx(SPACING.micro),
              color: "text.disabled",
              "&:hover": {
                color: "primary.light",
                backgroundColor: "var(--palette-c_overlay)"
              }
            }}
          >
            <OpenInNew sx={{ fontSize: "var(--fontSizeNormal)" }} />
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
            sx={{ padding: getSpacingPx(SPACING.xs) }}
          >
            <ListAltIcon sx={{ fontSize: "var(--fontSizeNormal)" }} />
          </ToolbarIconButton>
        )}
      </FlexRow>

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
