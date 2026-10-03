import type { ReactNode } from "react";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import CameraAltOutlinedIcon from "@mui/icons-material/CameraAltOutlined";
import CircleOutlinedIcon from "@mui/icons-material/CircleOutlined";
import DirectionsRunIcon from "@mui/icons-material/DirectionsRun";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import CropSquareIcon from "@mui/icons-material/CropSquare";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import type { GameDocument3D, GameEntity3D, GameScene3D } from "@nodetool-ai/protocol";

import { Box, Caption, FlexColumn, FONT_SIZE_SANS, InspectorSelect, SPACING, Text, ToolbarIconButton, TreeRow } from "../ui_primitives";
import GamePanelHeader from "./GamePanelHeader";

interface GameHierarchy3DProps {
  readonly document: GameDocument3D;
  readonly scene: GameScene3D | undefined;
  readonly selectedIds: readonly string[];
  readonly onSelect: (id: string) => void;
  readonly onSelectScene: (id: string) => void;
  readonly onAdd: (kind: "box" | "sphere" | "light") => void;
  /** Rendered below the tree, pinned to the bottom of the panel. */
  readonly footer?: ReactNode;
}

const ICON_SX = { fontSize: FONT_SIZE_SANS.body, flexShrink: 0, color: "text.secondary" } as const;

function entityIcon(entity: GameEntity3D): ReactNode {
  if (entity.camera3d) { return <CameraAltOutlinedIcon sx={ICON_SX} />; }
  if (entity.light3d) { return <LightModeOutlinedIcon sx={{ ...ICON_SX, color: "warning.main" }} />; }
  if (entity.character3d) { return <DirectionsRunIcon sx={{ ...ICON_SX, color: "info.main" }} />; }
  if (entity.model || entity.primitive) { return <ViewInArOutlinedIcon sx={ICON_SX} />; }
  return <CategoryOutlinedIcon sx={ICON_SX} />;
}

function entityKind(entity: GameEntity3D): string | null {
  if (entity.character3d) { return "Character"; }
  if (entity.camera3d) { return "Camera"; }
  return null;
}

/** Entities in parent-first order, each with its nesting depth. */
function treeRows(entities: readonly GameEntity3D[]): { entity: GameEntity3D; depth: number }[] {
  const ids = new Set(entities.map((entity) => entity.id));
  const children = new Map<string | undefined, GameEntity3D[]>();
  for (const entity of entities) {
    const parent = entity.parentId && ids.has(entity.parentId) ? entity.parentId : undefined;
    children.set(parent, [...(children.get(parent) ?? []), entity]);
  }
  const rows: { entity: GameEntity3D; depth: number }[] = [];
  const visited = new Set<string>();
  const walk = (parent: string | undefined, depth: number): void => {
    for (const entity of children.get(parent) ?? []) {
      if (visited.has(entity.id)) { continue; }
      visited.add(entity.id);
      rows.push({ entity, depth });
      walk(entity.id, depth + 1);
    }
  };
  walk(undefined, 0);
  // A parent cycle leaves entities unreachable from the roots; list them flat so none disappear.
  for (const entity of entities) { if (!visited.has(entity.id)) { rows.push({ entity, depth: 0 }); } }
  return rows;
}

/** Scene hierarchy panel for the 3D game editor. */
export default function GameHierarchy3D({ document, scene, selectedIds, onSelect, onSelectScene, onAdd, footer }: GameHierarchy3DProps) {
  const rows = treeRows(scene?.entities ?? []);
  return <FlexColumn sx={{ height: "100%", minHeight: 0 }}>
    <GamePanelHeader title="Hierarchy" icon={<AccountTreeOutlinedIcon sx={ICON_SX} />}>
      <ToolbarIconButton icon={<CropSquareIcon fontSize="small" />} tooltip="Add box" onClick={() => onAdd("box")} />
      <ToolbarIconButton icon={<CircleOutlinedIcon fontSize="small" />} tooltip="Add sphere" onClick={() => onAdd("sphere")} />
      <ToolbarIconButton icon={<LightbulbOutlinedIcon fontSize="small" />} tooltip="Add light" onClick={() => onAdd("light")} />
    </GamePanelHeader>
    <Box sx={{ px: SPACING.md, py: SPACING.sm, borderBottom: 1, borderColor: "divider" }}>
      <InspectorSelect label="Scene" grow value={scene?.id ?? document.entrySceneId}
        options={document.scenes.map((item) => ({ value: item.id, label: item.name }))} onChange={onSelectScene} />
    </Box>
    <FlexColumn role="list" aria-label="Scene entities" sx={{ flex: 1, minHeight: 0, overflowY: "auto", py: SPACING.xs, px: SPACING.xs }}>
      {rows.length === 0 && <Caption sx={{ p: SPACING.md }}>This scene has no entities.</Caption>}
      {rows.map(({ entity, depth }) => {
        const selected = selectedIds.includes(entity.id);
        const kind = entityKind(entity);
        return <Box key={entity.id} role="listitem">
          <TreeRow component="button" type="button" interactive selected={selected} depth={depth} baseIndent={SPACING.md} indentStep={SPACING.lg}
            aria-pressed={selected} onClick={() => onSelect(entity.id)}
            sx={selected ? { bgcolor: "primary.main", color: "primary.contrastText", "&:hover": { bgcolor: "primary.main" },
              "& svg": { color: "inherit" } } : undefined}>
            {entityIcon(entity)}
            <Text size="small" truncate sx={{ flex: 1, minWidth: 0, color: "inherit", opacity: entity.templateOnly ? 0.6 : 1 }}>
              {entity.name || entity.id}
            </Text>
            {kind && <Caption sx={{ color: "inherit", opacity: 0.7 }}>{kind}</Caption>}
          </TreeRow>
        </Box>;
      })}
    </FlexColumn>
    {footer && <Box sx={{ flexShrink: 0, maxHeight: "45%", overflowY: "auto", borderTop: 1, borderColor: "divider", px: SPACING.md }}>{footer}</Box>}
  </FlexColumn>;
}
