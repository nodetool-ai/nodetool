/** @jsxImportSource @emotion/react */
import { memo, useMemo } from "react";
import { MiniMap, Node } from "@xyflow/react";
import { useTheme } from "@mui/material/styles";
import { useIsDarkMode } from "../../hooks/useIsDarkMode";
import { useMiniMapStore } from "../../stores/MiniMapStore";

const minimapStyle = {
  position: "absolute" as const,
  bottom: "70px",
  right: "20px",
  zIndex: 10
};

const MiniMapNavigator: React.FC = () => {
  const theme = useTheme();
  const isDarkMode = useIsDarkMode();
  const { visible } = useMiniMapStore();

  const nodeColor = useMemo(() => {
    return (node: Node) => {
      if (node.selected) {
        return theme.vars.palette.primary.main;
      }
      const nodeType = node.type ?? "";
      if (nodeType === "nodetool.workflows.base_node.Group") {
        return isDarkMode ? "#6366f1" : "#818cf8";
      }
      if (nodeType === "nodetool.workflows.base_node.Comment") {
        return isDarkMode ? "#22c55e" : "#22c55e";
      }
      return isDarkMode ? "#94a3b8" : "#64748b";
    };
  }, [theme, isDarkMode]);

  const maskColor = useMemo(() => {
    return isDarkMode
      ? "rgba(0, 0, 0, 0.6)"
      : "rgba(255, 255, 255, 0.6)";
  }, [isDarkMode]);

  const borderColor = useMemo(() => {
    return isDarkMode
      ? "rgba(255, 255, 255, 0.2)"
      : "rgba(0, 0, 0, 0.1)";
  }, [isDarkMode]);

  if (!visible) {
    return null;
  }

  return (
    <div className="minimap-navigator" css={{ minimapStyle }}>
      <MiniMap
        nodeColor={nodeColor}
        maskColor={maskColor}
        nodeStrokeWidth={2}
        nodeStrokeColor={(node: Node) => {
          if (node.selected) {
            return theme.vars.palette.primary.main;
          }
          return isDarkMode ? "#475569" : "#cbd5e1";
        }}
        nodeBorderRadius={8}
        zoomable
        pannable
        style={{
          backgroundColor: isDarkMode
            ? theme.vars.palette.grey[900]
            : theme.vars.palette.grey[100],
          border: `1px solid ${borderColor}`,
          borderRadius: "8px"
        }}
      />
    </div>
  );
};

export default memo(MiniMapNavigator);
