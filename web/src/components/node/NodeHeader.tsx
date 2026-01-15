/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import useContextMenuStore from "../../stores/ContextMenuStore";
import useLogsStore from "../../stores/LogStore";
import { memo, useCallback, useMemo, useState } from "react";
import isEqual from "lodash/isEqual";
import { NodeData } from "../../stores/NodeData";
import { useNodes } from "../../contexts/NodeContext";
import { IconForType } from "../../config/data_types";
import { hexToRgba } from "../../utils/ColorUtils";
import { Badge, IconButton, Tooltip, Box } from "@mui/material";
import ListAltIcon from "@mui/icons-material/ListAlt";
import { NodeLogsDialog } from "./NodeLogs";

export interface NodeHeaderProps {
  id: string;
  metadataTitle: string;
  hasParent?: boolean;
  showMenu?: boolean;
  data: NodeData;
  backgroundColor?: string;
  selected?: boolean;
  iconType?: string;
  iconBaseColor?: string;
  showIcon?: boolean;
  workflowId?: string;
}

export const NodeHeader: React.FC<NodeHeaderProps> = ({
  id,
  metadataTitle,
  hasParent,
  backgroundColor,
  selected,
  iconType,
  iconBaseColor,
  showIcon = true,
  data,
  workflowId
}: NodeHeaderProps) => {
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const updateNode = useNodes((state) => state.updateNode);
  const nodeWorkflowId = useNodes((state) => state.workflow?.id);
  const logs = useLogsStore((state) => state.getLogs(workflowId || nodeWorkflowId || "", id));
  const [logsDialogOpen, setLogsDialogOpen] = useState(false);

  const logCount = logs?.length || 0;

  const headerCss = useMemo(
    () =>
      css({
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "8px",
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
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "4px 4px"
        },
        ".node-icon": {
          width: "28px",
          minWidth: "28px",
          height: "28px",
          borderRadius: "6px",
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
          display: "flex",
          flexDirection: "column",
          gap: 0,
          flexGrow: 1,
          textAlign: "left",
          maxWidth: "250px",
          wordWrap: "break-word",
          lineHeight: "1.2em",
          fontSize: "var(--fontSizeNormal)",
          fontWeight: 600,
          letterSpacing: "0.02em",
          padding: "2px 0",
          color: "var(--palette-text-primary)"
        },
        ".color-indicator": {
          width: "4px",
          height: "24px",
          borderRadius: "2px",
          flexShrink: 0
        }
      }),
    []
  );

  const _handleOpenContextMenu = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
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

  const hasIcon = Boolean(iconType);

  const headerStyle: React.CSSProperties | undefined = useMemo(() => {
    if (backgroundColor === "transparent") {
      return { background: "transparent" } as React.CSSProperties;
    }
    const tint = backgroundColor || "var(--c_node_header_bg)";
    return {
      background: selected
        ? backgroundColor
          ? backgroundColor
          : hexToRgba(tint, 0.5)
        : `linear-gradient(90deg, ${hexToRgba(tint, 0.2)}, ${hexToRgba(
            tint,
            0.15
          )})`
    } as React.CSSProperties;
  }, [backgroundColor, selected]);

  return (
    <div
      className={`node-drag-handle node-header ${
        hasParent ? "has-parent" : ""
      }`}
      css={headerCss}
      onClick={handleHeaderClick}
      onContextMenu={handleHeaderContextMenu}
      style={headerStyle || { backgroundColor }}
      >
      <div className="header-left">
        {data.color && (
          <Box
            className="color-indicator"
            sx={{ backgroundColor: data.color }}
          />
        )}
        {hasIcon && showIcon && (
          <div
            className="node-icon"
            style={{
              background: iconBaseColor
                ? hexToRgba(iconBaseColor, 0.22)
                : "rgba(255,255,255,0.08)"
            }}
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
          style={{
            paddingLeft: hasIcon ? 0 : undefined
          }}
        >
          {metadataTitle}
        </span>
        {data.bypassed && (
          <span className="bypass-badge">Bypassed</span>
        )}
        {logCount > 0 && (
          <Tooltip title={`${logCount} logs`} arrow>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                setLogsDialogOpen(true);
              }}
              sx={{ padding: "4px" }}
            >
              <Badge badgeContent={logCount} color="warning" max={99}>
                <ListAltIcon sx={{ fontSize: "1rem" }} />
              </Badge>
            </IconButton>
          </Tooltip>
        )}
      </div>

      <NodeLogsDialog
        id={id}
        workflowId={workflowId || nodeWorkflowId || ""}
        open={logsDialogOpen}
        onClose={() => setLogsDialogOpen(false)}
      />
    </div>
  );
};

export default memo(NodeHeader, isEqual);
