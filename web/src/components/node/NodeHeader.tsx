/** @jsxImportSource @emotion/react */
import useContextMenuStore from "../../stores/ContextMenuStore";
import { memo, useCallback, useMemo, useState } from "react";
import { isEqual } from "lodash";
import { NodeData } from "../../stores/NodeData";
import { useNodes } from "../../contexts/NodeContext";
import { IconForType } from "../../config/data_types";
import { hexToRgba } from "../../utils/ColorUtils";
import { useTheme } from "@mui/material/styles";
import {
  Menu,
  MenuItem,
  Tooltip,
  ListItemIcon,
  ListItemText,
  Divider
} from "@mui/material";

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
}

export const NodeHeader: React.FC<NodeHeaderProps> = ({
  id,
  metadataTitle,
  hasParent,
  data,
  backgroundColor,
  showMenu = true,
  selected,
  iconType,
  iconBaseColor,
  showIcon = true
}: NodeHeaderProps) => {
  const theme = useTheme();
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const updateNode = useNodes((state) => state.updateNode);
  const updateNodeData = useNodes((state) => state.updateNodeData);
  const [syncMenuAnchor, setSyncMenuAnchor] = useState<null | HTMLElement>(
    null
  );

  const handleOpenContextMenu = useCallback(
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

  const glassyStyle: React.CSSProperties | undefined = useMemo(() => {
    // Keep group header look from CSS when within a group
    if (hasParent) return undefined;
    const tint = backgroundColor || "var(--c_node_header_bg)";
    return {
      background: `linear-gradient(90deg, ${hexToRgba(tint, 0.18)}, ${hexToRgba(
        tint,
        0.08
      )})`,
      border: 0,
      borderBottom: `1px solid ${hexToRgba("#FFFFFF", 0.08)}`,
      backdropFilter: (theme as any).vars?.palette?.glass?.blur || "blur(24px)",
      WebkitBackdropFilter:
        (theme as any).vars?.palette?.glass?.blur || "blur(12px)",
      // Remove top inner highlight to avoid double border effect with wrapper outline
      // boxShadow: `0 10px 24px -18px ${hexToRgba(tint, 0.6)}`,
      borderRadius:
        "calc(var(--rounded-node) - 1px) calc(var(--rounded-node) - 1px) 0 0"
    } as React.CSSProperties;
  }, [backgroundColor, hasParent, theme]);

  const DotsIcon = ({
    dot = 2.2,
    gap = 6.5
  }: {
    dot?: number;
    gap?: number;
  }) => {
    const r = dot / 2;
    // Three circles, farther apart than default MoreHoriz
    const cx1 = r;
    const cx2 = r + dot + gap;
    const cx3 = r + (dot + gap) * 2;
    const width = dot * 3 + gap * 2;
    const height = dot;
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden
        focusable={false}
        style={{ display: "block" }}
      >
        <circle cx={cx1} cy={r} r={r} fill="currentColor" />
        <circle cx={cx2} cy={r} r={r} fill="currentColor" />
        <circle cx={cx3} cy={r} r={r} fill="currentColor" />
      </svg>
    );
  };

  const SyncModeIcon = ({ mode }: { mode: string }) => {
    // Minimalistic dot motif: 1 dot for on_any, 2 overlapping dots for zip_all
    if (mode === "zip_all") {
      const size = 12;
      const r = 2.2;
      return (
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-label="zip_all"
          role="img"
          style={{ display: "block" }}
        >
          <circle cx={size / 2 - 1.5} cy={size / 2} r={r} fill="currentColor" />
          <circle cx={size / 2 + 1.5} cy={size / 2} r={r} fill="currentColor" />
        </svg>
      );
    }
    // Default: on_any → single dot
    const size = 12;
    const r = 2.2;
    return (
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-label="on_any"
        role="img"
        style={{ display: "block" }}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="currentColor" />
      </svg>
    );
  };

  const openSyncMenu = useCallback((e: React.MouseEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    setSyncMenuAnchor(e.currentTarget);
  }, []);

  const closeSyncMenu = useCallback(() => setSyncMenuAnchor(null), []);

  const handleSelectMode = useCallback(
    (mode: "on_any" | "zip_all") => {
      updateNodeData(id, { sync_mode: mode });
      closeSyncMenu();
    },
    [id, updateNodeData, closeSyncMenu]
  );

  return (
    <div
      className={`node-drag-handle node-header ${
        hasParent ? "has-parent" : ""
      }`}
      onClick={handleHeaderClick}
      onContextMenu={handleHeaderContextMenu}
      style={{
        ...(glassyStyle || { backgroundColor }),
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 4px"
      }}
    >
      <div
        className="header-left"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 4px"
        }}
      >
        {hasIcon && showIcon && (
          <div
            className="node-icon"
            style={{
              width: 28,
              height: 28,
              borderRadius: 10,
              display: "grid",
              placeItems: "center",
              background: iconBaseColor
                ? hexToRgba(iconBaseColor, 0.22)
                : "rgba(255,255,255,0.08)",
              border: `1px solid ${
                iconBaseColor
                  ? hexToRgba(iconBaseColor, 0.35)
                  : "rgba(255,255,255,0.12)"
              }`,
              boxShadow: iconBaseColor
                ? `0 0 24px -8px ${hexToRgba(iconBaseColor, 0.5)}`
                : "none"
            }}
          >
            <IconForType
              iconName={iconType!}
              showTooltip={false}
              svgProps={{ width: 16, height: 16 }}
            />
          </div>
        )}
        <span
          className="node-title"
          style={{
            color: "var(--palette-text-primary)",
            paddingLeft: hasIcon ? 0 : undefined
          }}
        >
          {metadataTitle}
        </span>
      </div>
      {showMenu && (
        <div className="menu-button-container" tabIndex={-1}>
          <Tooltip
            title={`Sync mode: ${
              data?.sync_mode || "on_any"
            }. Click to change.`}
            placement="bottom"
            arrow
          >
            <span
              className="sync-mode-button"
              style={{
                display: "inline-grid",
                placeItems: "center",
                width: 22,
                height: 22,
                borderRadius: 8,
                color: "var(--palette-text-secondary)",
                background: hexToRgba("#000", 0.12),
                border: `1px solid ${hexToRgba("#fff", 0.08)}`,
                cursor: "pointer"
              }}
              aria-label={`Sync mode: ${data?.sync_mode || "on_any"}`}
              onClick={openSyncMenu}
            >
              <SyncModeIcon mode={data?.sync_mode || "on_any"} />
            </span>
          </Tooltip>
          <Menu
            anchorEl={syncMenuAnchor}
            open={Boolean(syncMenuAnchor)}
            onClose={closeSyncMenu}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            transformOrigin={{ vertical: "top", horizontal: "left" }}
          >
            <MenuItem disabled divider>
              <ListItemText
                primary="Select sync mode"
                secondary="How inputs are coordinated"
              />
            </MenuItem>
            <MenuItem
              selected={(data?.sync_mode || "on_any") === "on_any"}
              onClick={() => handleSelectMode("on_any")}
            >
              <ListItemIcon>
                <SyncModeIcon mode="on_any" />
              </ListItemIcon>
              <ListItemText
                primary="on_any"
                secondary="Run when any input arrives"
              />
            </MenuItem>
            <MenuItem
              selected={(data?.sync_mode || "on_any") === "zip_all"}
              onClick={() => handleSelectMode("zip_all")}
            >
              <ListItemIcon>
                <SyncModeIcon mode="zip_all" />
              </ListItemIcon>
              <ListItemText
                primary="zip_all"
                secondary="Wait for all inputs; process items together"
              />
            </MenuItem>
          </Menu>
        </div>
      )}
    </div>
  );
};

export default memo(NodeHeader, isEqual);
