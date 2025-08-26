/** @jsxImportSource @emotion/react */
import useContextMenuStore from "../../stores/ContextMenuStore";
import { MoreHoriz } from "@mui/icons-material";
import { memo, useCallback, useMemo } from "react";
import { isEqual } from "lodash";
import { NodeData } from "../../stores/NodeData";
import { useNodes } from "../../contexts/NodeContext";
import { IconForType } from "../../config/data_types";
import { hexToRgba } from "../../utils/ColorUtils";
import { useTheme } from "@mui/material/styles";

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
  iconBaseColor
}: NodeHeaderProps) => {
  const theme = useTheme();
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const updateNode = useNodes((state) => state.updateNode);

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
        (theme as any).vars?.palette?.glass?.blur || "blur(24px)",
      // Remove top inner highlight to avoid double border effect with wrapper outline
      boxShadow: `0 10px 24px -18px ${hexToRgba(tint, 0.6)}`,
      borderRadius: "calc(var(--rounded-node) - 1px) calc(var(--rounded-node) - 1px) 0 0"
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

  return (
    <div
      className={`node-drag-handle node-header ${hasParent ? "has-parent" : ""}`}
      onClick={handleHeaderClick}
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
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px" }}
      >
        {hasIcon && (
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 10,
              display: "grid",
              placeItems: "center",
              background: iconBaseColor ? hexToRgba(iconBaseColor, 0.22) : "rgba(255,255,255,0.08)",
              border: `1px solid ${iconBaseColor ? hexToRgba(iconBaseColor, 0.35) : "rgba(255,255,255,0.12)"}`,
              boxShadow: iconBaseColor
                ? `0 0 24px -8px ${hexToRgba(iconBaseColor, 0.5)}`
                : "none"
            }}
          >
            <IconForType iconName={iconType!} showTooltip={false} svgProps={{ width: 16, height: 16 }} />
          </div>
        )}
        <span
          className="node-title"
          style={{ color: "var(--palette-text-primary)", paddingLeft: hasIcon ? 0 : undefined }}
        >
          {metadataTitle}
        </span>
      </div>
      {showMenu && (
        <div className="menu-button-container" tabIndex={-1}>
          <button className="menu-button" tabIndex={-1} onClick={handleOpenContextMenu}>
            {/* Custom subtle three-dots with wider spacing */}
            <DotsIcon />
          </button>
        </div>
      )}
    </div>
  );
};

export default memo(NodeHeader, isEqual);
