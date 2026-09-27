/** @jsxImportSource @emotion/react */
import { memo, useCallback } from "react";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import LightModeIcon from "@mui/icons-material/LightMode";
import CategoryIcon from "@mui/icons-material/Category";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import { FlexColumn, IconButton, Text, ScrollArea, SPACING, TreeRow } from "../ui_primitives";
import type { SceneTreeNode } from "./sceneTree";

const typeIcon = (type: string) => {
  if (type.includes("Light")) {
    return <LightModeIcon sx={{ fontSize: "var(--fontSizeNormal)", opacity: 0.7 }} />;
  }
  if (type.includes("Camera")) {
    return <CameraAltIcon sx={{ fontSize: "var(--fontSizeNormal)", opacity: 0.7 }} />;
  }
  if (type === "Mesh") {
    return <ViewInArIcon sx={{ fontSize: "var(--fontSizeNormal)", opacity: 0.7 }} />;
  }
  return <CategoryIcon sx={{ fontSize: "var(--fontSizeNormal)", opacity: 0.7 }} />;
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
      <TreeRow
        role="button"
        tabIndex={0}
        aria-pressed={node.uuid === selectedUuid}
        aria-label={`${node.name} (${node.type})`}
        selected={node.uuid === selectedUuid}
        interactive
        depth={node.depth}
        onClick={handleSelect}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); handleSelect(); } }}
      >
        {typeIcon(node.type)}
        <Text size="small" title={`${node.name} (${node.type})`} sx={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {node.name}
        </Text>
        <IconButton
          size="small"
          aria-label={node.visible ? "Hide object" : "Show object"}
          onClick={handleToggle}
          sx={{ opacity: 0.6, "&:hover": { opacity: 1 }, "& svg": { fontSize: "var(--fontSizeNormal)" } }}
        >
          {node.visible ? <VisibilityIcon /> : <VisibilityOffIcon />}
        </IconButton>
      </TreeRow>
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
  return (
    <FlexColumn className="scene-outliner" fullHeight sx={{ width: "100%", minHeight: 0 }}>
      <ScrollArea>
        {nodes.length === 0 ? (
          <Text size="small" color="secondary" sx={{ py: SPACING.lg, px: SPACING.md }}>
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
