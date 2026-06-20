/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import LightModeIcon from "@mui/icons-material/LightMode";
import CategoryIcon from "@mui/icons-material/Category";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import { FlexColumn, FlexRow, Text, ScrollArea, BORDER_RADIUS } from "../ui_primitives";
import type { SceneTreeNode } from "./sceneTree";

const styles = (theme: Theme) =>
  css({
    "&": {
      width: "100%",
      height: "100%",
      minHeight: 0
    },
    ".outliner-row": {
      display: "flex",
      alignItems: "center",
      gap: "4px",
      padding: "2px 8px",
      cursor: "pointer",
      borderRadius: BORDER_RADIUS.sm,
      userSelect: "none",
      color: theme.vars.palette.text.secondary,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    ".outliner-row.selected": {
      backgroundColor: theme.vars.palette.action.selected,
      color: theme.vars.palette.text.primary
    },
    ".outliner-row .row-label": {
      flex: 1,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".outliner-row .type-icon": {
      fontSize: "var(--fontSizeNormal)",
      opacity: 0.7
    },
    ".outliner-row .visibility-toggle": {
      display: "flex",
      alignItems: "center",
      opacity: 0.6,
      "&:hover": { opacity: 1 }
    },
    ".visibility-toggle svg": { fontSize: "var(--fontSizeNormal)" },
    ".empty": {
      padding: "12px 8px"
    }
  });

const typeIcon = (type: string) => {
  if (type.includes("Light")) {
    return <LightModeIcon className="type-icon" />;
  }
  if (type.includes("Camera")) {
    return <CameraAltIcon className="type-icon" />;
  }
  if (type === "Mesh") {
    return <ViewInArIcon className="type-icon" />;
  }
  return <CategoryIcon className="type-icon" />;
};

interface OutlinerRowProps {
  node: SceneTreeNode;
  selectedUuid: string | null;
  onSelect: (uuid: string) => void;
  onToggleVisible: (uuid: string) => void;
}

const OutlinerRow = memo(({
  node,
  selectedUuid,
  onSelect,
  onToggleVisible
}: OutlinerRowProps) => {
  const handleSelect = useCallback(() => onSelect(node.uuid), [node.uuid, onSelect]);
  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleVisible(node.uuid);
    },
    [node.uuid, onToggleVisible]
  );

  return (
    <>
      <div
        className={`outliner-row ${node.uuid === selectedUuid ? "selected" : ""}`}
        role="button"
        tabIndex={0}
        style={{ paddingLeft: `${8 + node.depth * 14}px` }}
        onClick={handleSelect}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { handleSelect(); } }}
      >
        {typeIcon(node.type)}
        <Text size="small" className="row-label" title={`${node.name} (${node.type})`}>
          {node.name}
        </Text>
        <span
          className="visibility-toggle"
          role="button"
          tabIndex={0}
          aria-label={node.visible ? "Hide object" : "Show object"}
          onClick={handleToggle}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onToggleVisible(node.uuid); } }}
        >
          {node.visible ? <VisibilityIcon /> : <VisibilityOffIcon />}
        </span>
      </div>
      {node.children.map((child) => (
        <OutlinerRow
          key={child.uuid}
          node={child}
          selectedUuid={selectedUuid}
          onSelect={onSelect}
          onToggleVisible={onToggleVisible}
        />
      ))}
    </>
  );
});

interface SceneOutlinerProps {
  nodes: SceneTreeNode[];
  selectedUuid: string | null;
  onSelect: (uuid: string) => void;
  onToggleVisible: (uuid: string) => void;
}

const SceneOutliner = ({
  nodes,
  selectedUuid,
  onSelect,
  onToggleVisible
}: SceneOutlinerProps) => {
  const theme = useTheme();
  return (
    <FlexColumn css={styles(theme)} className="scene-outliner" fullHeight>
      <ScrollArea>
        {nodes.length === 0 ? (
          <Text size="small" color="secondary" className="empty">
            Scene is empty
          </Text>
        ) : (
          nodes.map((node) => (
            <OutlinerRow
              key={node.uuid}
              node={node}
              selectedUuid={selectedUuid}
              onSelect={onSelect}
              onToggleVisible={onToggleVisible}
            />
          ))
        )}
      </ScrollArea>
    </FlexColumn>
  );
};

export default memo(SceneOutliner);
