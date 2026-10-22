import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/AddOutlined";
import CameraAltOutlinedIcon from "@mui/icons-material/CameraAltOutlined";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CircleOutlinedIcon from "@mui/icons-material/CircleOutlined";
import CropSquareIcon from "@mui/icons-material/CropSquare";
import DirectionsRunIcon from "@mui/icons-material/DirectionsRun";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import type { GameDocument3D, GameEntity3D, GameScene3D } from "@nodetool-ai/protocol";

import {
  Box, BORDER_RADIUS, Caption, CONTROL, EditorMenu, FlexColumn, FlexRow, focusRing, FONT_SIZE_SANS, getSpacingPx, InspectorSelect,
  MenuItemPrimitive, SearchInput, SPACING, Text, ToolbarIconButton, TreeRow, TYPOGRAPHY
} from "../../../ui_primitives";

type AddKind = "box" | "sphere" | "light";

interface GameHierarchy3DProps {
  readonly document: GameDocument3D;
  readonly scene: GameScene3D | undefined;
  readonly selectedIds: readonly string[];
  /** `additive` is true for Shift-, Ctrl- or Cmd-click, which toggles the entity in the selection. */
  readonly onSelect: (id: string, additive: boolean) => void;
  readonly onSelectScene: (id: string) => void;
  readonly onAdd: (kind: AddKind) => void;
  /** Rendered below the tree, pinned to the bottom of the panel. */
  readonly footer?: ReactNode;
}

interface TreeRowData {
  readonly entity: GameEntity3D;
  readonly depth: number;
  readonly hasChildren: boolean;
}

const ICON_SX = { fontSize: FONT_SIZE_SANS.body, flexShrink: 0, color: "text.secondary" } as const;
const ADD_ITEMS: readonly { kind: AddKind; labelKey: string; icon: ReactNode }[] = [
  { kind: "box", labelKey: "box", icon: <CropSquareIcon sx={ICON_SX} /> },
  { kind: "sphere", labelKey: "sphere", icon: <CircleOutlinedIcon sx={ICON_SX} /> },
  { kind: "light", labelKey: "light", icon: <LightModeOutlinedIcon sx={ICON_SX} /> }
];

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

/**
 * Entities in parent-first order, each with its nesting depth. Rows under a collapsed
 * parent are skipped. A non-empty `needle` keeps matches and their ancestors and
 * ignores collapse so every match shows.
 */
function treeRows(entities: readonly GameEntity3D[], collapsed: ReadonlySet<string>, needle: string): TreeRowData[] {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const children = new Map<string | undefined, GameEntity3D[]>();
  for (const entity of entities) {
    const parent = entity.parentId && byId.has(entity.parentId) ? entity.parentId : undefined;
    children.set(parent, [...(children.get(parent) ?? []), entity]);
  }
  const shown = new Set<string>();
  if (needle) {
    for (const entity of entities) {
      if (!(entity.name || "").toLowerCase().includes(needle) && !entity.id.toLowerCase().includes(needle)) { continue; }
      let ancestor: GameEntity3D | undefined = entity;
      while (ancestor && !shown.has(ancestor.id)) {
        shown.add(ancestor.id);
        ancestor = ancestor.parentId ? byId.get(ancestor.parentId) : undefined;
      }
    }
  }
  const rows: TreeRowData[] = [];
  const visited = new Set<string>();
  const walk = (entity: GameEntity3D, depth: number, hidden: boolean): void => {
    if (visited.has(entity.id)) { return; }
    visited.add(entity.id);
    const kids = children.get(entity.id) ?? [];
    const visible = !hidden && (!needle || shown.has(entity.id));
    if (visible) { rows.push({ entity, depth, hasChildren: kids.length > 0 }); }
    const hideKids = hidden || (!needle && collapsed.has(entity.id));
    for (const child of kids) { walk(child, depth + 1, hideKids); }
  };
  for (const entity of children.get(undefined) ?? []) { walk(entity, 0, false); }
  // A parent cycle leaves entities unreachable from the roots; list them flat so none disappear.
  for (const entity of entities) { if (!visited.has(entity.id)) { walk(entity, 0, false); } }
  return rows;
}

/** Scene hierarchy panel for the 3D game editor. */
export default function GameHierarchy3D({ document, scene, selectedIds, onSelect, onSelectScene, onAdd, footer }: GameHierarchy3DProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null);
  const needle = search.trim().toLowerCase();
  const entities = scene?.entities;
  const rows = useMemo(() => treeRows(entities ?? [], collapsed, needle), [entities, collapsed, needle]);
  const toggle = (id: string) => setCollapsed((current) => {
    const next = new Set(current);
    if (next.has(id)) { next.delete(id); } else { next.add(id); }
    return next;
  });

  return <FlexColumn sx={{ height: "100%", minHeight: 0 }}>
    <FlexRow role="toolbar" aria-label={t("screen_game.hierarchy.toolbar")} align="center" gap={SPACING.xs} sx={{
      flexShrink: 0, minHeight: CONTROL.height.md, boxSizing: "border-box", paddingInline: getSpacingPx(SPACING.sm),
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    }}>
      <ToolbarIconButton icon={<AddIcon fontSize="small" />} tooltip={t("screen_game.hierarchy.addEntity")} aria-haspopup="menu"
        aria-expanded={Boolean(addAnchor)} onClick={(event) => setAddAnchor(event.currentTarget)} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <SearchInput value={search} onChange={setSearch} placeholder={t("screen_game.hierarchy.searchPlaceholder")} ariaLabel={t("screen_game.hierarchy.searchEntities")} size="small" fullWidth
          sx={{ "&& .MuiInputBase-input": TYPOGRAPHY.sans.label, "& .search-icon, & .clear-button svg": { fontSize: FONT_SIZE_SANS.body } }} />
      </Box>
    </FlexRow>
    <EditorMenu anchorEl={addAnchor} open={Boolean(addAnchor)} onClose={() => setAddAnchor(null)}
      slotProps={{ list: { "aria-label": t("screen_game.hierarchy.addEntity") } }}>
      {ADD_ITEMS.map(({ kind, labelKey, icon }) => <MenuItemPrimitive key={kind} label={t(`screen_game.hierarchy.primitives.${labelKey}`)} icon={icon}
        onClick={() => { setAddAnchor(null); onAdd(kind); }} />)}
    </EditorMenu>
    <Box sx={{ flexShrink: 0, px: SPACING.sm, py: SPACING.xs, borderBottom: 1, borderColor: "divider" }}>
      <InspectorSelect label={t("screen_game.hierarchy.scene")} grow value={scene?.id ?? document.entrySceneId}
        options={document.scenes.map((item) => ({ value: item.id, label: item.name }))} onChange={onSelectScene} />
    </Box>
    <FlexColumn role="list" aria-label={t("screen_game.hierarchy.sceneEntities")} sx={{ flex: 1, minHeight: 0, overflowY: "auto", py: SPACING.xs, px: SPACING.xs }}>
      {rows.length === 0 && <Caption sx={{ px: SPACING.sm, py: SPACING.xs }}>
        {needle ? t("screen_game.hierarchy.noEntitiesMatch") : t("screen_game.hierarchy.noEntities")}
      </Caption>}
      {rows.map(({ entity, depth, hasChildren }) => {
        const selected = selectedIds.includes(entity.id);
        const kind = entityKind(entity);
        const expanded = needle !== "" || !collapsed.has(entity.id);
        const name = entity.name || entity.id;
        return <TreeRow key={entity.id} role="listitem" interactive selected={selected} depth={depth}
          baseIndent={SPACING.none} indentStep={SPACING.xl} onClick={(event) => onSelect(entity.id, event.shiftKey || event.ctrlKey || event.metaKey)}
          sx={{ pr: SPACING.sm, minHeight: CONTROL.height.xs, gap: SPACING.micro,
            "&:focus-within": { bgcolor: selected ? "action.selected" : "action.hover" } }}>
          {hasChildren
            ? <FlexRow component="button" aria-label={t(expanded ? "screen_game.hierarchy.collapse" : "screen_game.hierarchy.expand", { name })}
              aria-expanded={expanded} aria-disabled={needle !== ""} align="center" justify="center"
              onClick={(event) => { event.stopPropagation(); if (needle === "") { toggle(entity.id); } }}
              sx={{ flexShrink: 0,
                width: getSpacingPx(SPACING.xl), height: getSpacingPx(SPACING.xl), p: SPACING.none, border: 0,
                bgcolor: "transparent", color: "text.secondary", cursor: "pointer", borderRadius: BORDER_RADIUS.sm,
                "&:hover": { color: "text.primary" }, "&[aria-disabled='true']": { cursor: "default" },
                "&:focus-visible": focusRing(theme) }}>
              {expanded ? <ExpandMoreIcon sx={{ fontSize: FONT_SIZE_SANS.body }} aria-hidden="true" />
                : <ChevronRightIcon sx={{ fontSize: FONT_SIZE_SANS.body }} aria-hidden="true" />}
            </FlexRow>
            : <Box aria-hidden="true" sx={{ width: getSpacingPx(SPACING.xl), flexShrink: 0 }} />}
          <FlexRow component="button" aria-pressed={selected} aria-label={name} align="center" gap={SPACING.xs}
            sx={{ flex: 1, minWidth: 0, p: SPACING.none,
              border: 0, bgcolor: "transparent", color: "inherit", font: "inherit", textAlign: "left", cursor: "inherit",
              "&:focus-visible": { outline: "none" } }}>
            {entityIcon(entity)}
            <Text size="small" weight={400} truncate sx={{ flex: 1, minWidth: 0, color: "inherit", opacity: entity.templateOnly ? 0.6 : 1 }}>
              {name}
            </Text>
            {kind && <Caption sx={{ flexShrink: 0, color: "text.secondary" }}>{t(`screen_game.hierarchy.entityKinds.${kind.toLowerCase()}`)}</Caption>}
          </FlexRow>
        </TreeRow>;
      })}
    </FlexColumn>
    {footer && <Box sx={{ flexShrink: 0, maxHeight: "45%", overflowY: "auto", borderTop: 1, borderColor: "divider", px: SPACING.sm }}>{footer}</Box>}
  </FlexColumn>;
}
