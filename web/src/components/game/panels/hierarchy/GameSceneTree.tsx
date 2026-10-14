import { useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import CameraAltOutlinedIcon from "@mui/icons-material/CameraAltOutlined";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CropSquareIcon from "@mui/icons-material/CropSquare";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import SensorsOutlinedIcon from "@mui/icons-material/SensorsOutlined";
import StarOutlineIcon from "@mui/icons-material/StarOutline";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import type { GameDocument, GameEntity, GameScene } from "@nodetool-ai/protocol/game.js";
import type { GameDocumentOp, GameValidationIssue } from "@nodetool-ai/game-runtime";

import {
  BORDER_RADIUS, Box, Caption, CONTROL, EditorMenu, FlexColumn, FlexRow, focusRing, FONT_SIZE_SANS, getSpacingPx, MenuItemPrimitive,
  SearchInput, SPACING, ToolbarIconButton, Tooltip, TreeRow, TYPOGRAPHY
} from "../../../ui_primitives";

import { reparentTransform } from "../../viewport2d/viewportGeometry";

interface GameSceneTreeProps {
  document: GameDocument;
  activeSceneId: string;
  selectedIds: readonly string[];
  issues?: readonly GameValidationIssue[];
  scriptErrorEntityId?: string | null;
  onSelect: (id: string, additive: boolean) => void;
  onSelectScene: (id: string) => void;
  onOps: (ops: GameDocumentOp[]) => void;
}

type Preset = "sprite" | "wall" | "collectible" | "trigger" | "camera" | "empty";
type DropPosition = "before" | "inside" | "after";
const TREE_ICON_SX = { fontSize: FONT_SIZE_SANS.body } as const;
const MENU_ICON_SX = { ...TREE_ICON_SX, color: "text.secondary" } as const;
const PRESETS: readonly { kind: Preset; label: string; icon: ReactNode }[] = [
  { kind: "sprite", label: "Sprite", icon: <ImageOutlinedIcon sx={MENU_ICON_SX} /> },
  { kind: "wall", label: "Static wall", icon: <CropSquareIcon sx={MENU_ICON_SX} /> },
  { kind: "collectible", label: "Collectible", icon: <StarOutlineIcon sx={MENU_ICON_SX} /> },
  { kind: "trigger", label: "Trigger", icon: <SensorsOutlinedIcon sx={MENU_ICON_SX} /> },
  { kind: "camera", label: "Camera", icon: <CameraAltOutlinedIcon sx={MENU_ICON_SX} /> },
  { kind: "empty", label: "Empty", icon: <ViewInArOutlinedIcon sx={MENU_ICON_SX} /> }
];
/** Width of the expand chevron column; one indent step, so children line up under their parent's icon. */
const CHEVRON_SLOT = getSpacingPx(SPACING.xl);
const ROW_SX = { minHeight: CONTROL.height.xs, pr: SPACING.sm, py: SPACING.none, gap: SPACING.micro } as const;
const ROW_BUTTON_SX = {
  flex: 1, minWidth: 0, p: SPACING.none, border: 0, bgcolor: "transparent", cursor: "pointer", textAlign: "left",
  ...TYPOGRAPHY.sans.label, "&:focus-visible": { outline: "none" }
} as const;
const TRUNCATE_SX = { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

function presetEntity(kind: Preset, id: string, imageSlot?: string): Extract<GameDocumentOp, { op: "add_entity" }>["entity"] {
  const entity: Extract<GameDocumentOp, { op: "add_entity" }>["entity"] = {
    id, name: PRESETS.find((preset) => preset.kind === kind)?.label ?? kind
  };
  if (imageSlot && (kind === "sprite" || kind === "wall" || kind === "collectible")) {
    entity.sprite = { assetId: imageSlot, width: 1, height: 1, layer: 0 };
  }
  if (kind === "wall") {
    entity.body2d = { type: "static", velocity: { x: 0, y: 0 } };
    entity.collider2d = { width: 1, height: 1, sensor: false, category: 1, mask: 0xffffffff };
  }
  if (kind === "collectible" || kind === "trigger") {
    entity.collider2d = { width: 1, height: 1, sensor: true, category: 1, mask: 0xffffffff };
    entity.behaviors = kind === "collectible" ? [{ kind, score: 1 }] : [{ kind, event: "trigger" }];
  }
  if (kind === "camera") entity.camera2d = { width: 16, height: 9, zoom: 1 };
  return entity;
}

interface VisibleRow {
  entity: GameEntity;
  depth: number;
  hasChildren: boolean;
}

/**
 * Rows of one group in parent-first order. Children of a collapsed entity are skipped.
 * A non-empty `needle` keeps matches and their ancestors and ignores entity collapse.
 */
function visibleRows(scene: GameScene, templateOnly: boolean, needle: string, collapsed: ReadonlySet<string>): VisibleRow[] {
  const entities = scene.entities.filter((entity) => entity.templateOnly === templateOnly);
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const children = new Map<string | undefined, GameEntity[]>();
  for (const entity of entities) {
    const parent = entity.parentId && byId.has(entity.parentId) ? entity.parentId : undefined;
    const siblings = children.get(parent) ?? [];
    siblings.push(entity);
    children.set(parent, siblings);
  }
  const shown = new Set<string>();
  if (needle) for (const entity of entities) {
    if (!entity.name.toLowerCase().includes(needle) && !entity.id.toLowerCase().includes(needle)) continue;
    let ancestor: GameEntity | undefined = entity;
    const path = new Set<string>();
    while (ancestor && !path.has(ancestor.id)) {
      shown.add(ancestor.id);
      path.add(ancestor.id);
      ancestor = ancestor.parentId ? byId.get(ancestor.parentId) : undefined;
    }
  }
  const rows: VisibleRow[] = [];
  const visited = new Set<string>();
  const append = (entity: GameEntity, depth: number, hidden: boolean) => {
    if (visited.has(entity.id)) return;
    visited.add(entity.id);
    const kids = children.get(entity.id) ?? [];
    if (!hidden && (!needle || shown.has(entity.id))) rows.push({ entity, depth, hasChildren: kids.length > 0 });
    const hideKids = hidden || (!needle && collapsed.has(entity.id));
    for (const child of kids) append(child, depth + 1, hideKids);
  };
  for (const entity of children.get(undefined) ?? []) append(entity, 0, false);
  for (const entity of entities) if (!visited.has(entity.id)) append(entity, 0, false);
  return rows;
}

function isDescendant(scene: GameScene, sourceId: string, parentId: string): boolean {
  const byId = new Map(scene.entities.map((entity) => [entity.id, entity]));
  const seen = new Set<string>();
  let id: string | undefined = parentId;
  while (id && !seen.has(id)) {
    if (id === sourceId) return true;
    seen.add(id);
    id = byId.get(id)?.parentId;
  }
  return false;
}

function moveOps(scene: GameScene, entityId: string, targetId: string | null, position: DropPosition, prefabs = false): GameDocumentOp[] {
  const source = scene.entities.find((entity) => entity.id === entityId);
  const target = targetId ? scene.entities.find((entity) => entity.id === targetId) : undefined;
  if (!source || (targetId && !target) || source.id === target?.id) return [];
  const parentId = position === "inside" ? target?.id : target?.parentId;
  if (parentId && isDescendant(scene, source.id, parentId)) return [];
  const templateOnly = target ? target.templateOnly : prefabs;
  const remaining = scene.entities.filter((entity) => entity.id !== source.id);
  const targetIndex = target ? remaining.findIndex((entity) => entity.id === target.id) : -1;
  const toIndex = targetIndex < 0 ? remaining.length : position === "after" ? targetIndex + 1 : targetIndex;
  const ops: GameDocumentOp[] = [];
  if (source.parentId !== parentId || source.templateOnly !== templateOnly) {
    ops.push({ op: "update_entity", scene_id: scene.id, entity_id: entityId,
      set: { parentId: parentId ?? null, templateOnly, transform2d: reparentTransform(scene, entityId, parentId) } });
  }
  if (source.templateOnly !== templateOnly) for (const entity of scene.entities) {
    if (entity.id !== source.id && entity.templateOnly !== templateOnly && isDescendant(scene, source.id, entity.id)) {
      ops.push({ op: "update_entity", scene_id: scene.id, entity_id: entity.id, set: { templateOnly } });
    }
  }
  if (scene.entities.indexOf(source) !== toIndex) {
    ops.push({ op: "move_entity", scene_id: scene.id, entity_id: entityId, to_index: toIndex });
  }
  return ops;
}

function dropPosition(event: DragEvent<HTMLElement>): DropPosition {
  const bounds = event.currentTarget.getBoundingClientRect();
  const fraction = (event.clientY - bounds.top) / bounds.height;
  return fraction < 0.3 ? "before" : fraction > 0.7 ? "after" : "inside";
}

function entityIcon(entity: GameEntity) {
  if (entity.camera2d) return <CameraAltOutlinedIcon sx={TREE_ICON_SX} />;
  if (entity.light2d) return <LightModeOutlinedIcon sx={TREE_ICON_SX} />;
  if (entity.sprite || entity.tilemap) return <ImageOutlinedIcon sx={TREE_ICON_SX} />;
  return <ViewInArOutlinedIcon sx={TREE_ICON_SX} />;
}

export default function GameSceneTree({ document, activeSceneId, selectedIds, issues = [], scriptErrorEntityId, onSelect, onSelectScene, onOps }: GameSceneTreeProps) {
  const [search, setSearch] = useState("");
  const [addSceneId, setAddSceneId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [dragged, setDragged] = useState<{ sceneId: string; entityId: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [collapsedScenes, setCollapsedScenes] = useState<Set<string>>(() => new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [searchCollapsedScenes, setSearchCollapsedScenes] = useState<Set<string>>(() => new Set());
  const [searchCollapsedGroups, setSearchCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [collapsedEntities, setCollapsedEntities] = useState<Set<string>>(() => new Set());
  const theme = useTheme();
  const activeScene = document.scenes.find((scene) => scene.id === activeSceneId) ?? document.scenes[0];
  const needle = search.trim().toLowerCase();
  const imageSlot = Object.entries(document.assets).find(([, binding]) => binding.mediaKind === "image")?.[0];

  const toggleCollapsed = (key: string, setter: typeof setCollapsedScenes) => {
    setter((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const add = (kind: Preset) => {
    if (!addSceneId) return;
    const id = crypto.randomUUID().replaceAll("-", "");
    onOps([{ op: "add_entity", scene_id: addSceneId, entity: presetEntity(kind, id, imageSlot) }]);
    onSelect(id, false);
    setAddSceneId(null);
  };
  const drop = (scene: GameScene, targetId: string | null, position: DropPosition, prefabs = false) => {
    if (dragged?.sceneId === scene.id) {
      const ops = moveOps(scene, dragged.entityId, targetId, position, prefabs);
      if (ops.length > 0) onOps(ops);
    }
    setDragged(null);
    setDropTarget(null);
  };
  const moveWithKeyboard = (event: KeyboardEvent<HTMLElement>, scene: GameScene, entity: GameEntity) => {
    if (!event.altKey || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const siblings = scene.entities.filter((item) => item.parentId === entity.parentId && item.templateOnly === entity.templateOnly);
    const index = siblings.findIndex((item) => item.id === entity.id);
    const target = event.key === "ArrowUp" ? siblings[index - 1] :
      event.key === "ArrowDown" ? siblings[index + 1] :
      event.key === "ArrowRight" ? siblings[index - 1] :
      entity.parentId ? scene.entities.find((item) => item.id === entity.parentId) : undefined;
    if (!target) return;
    const position: DropPosition = event.key === "ArrowRight" ? "inside" :
      event.key === "ArrowDown" || event.key === "ArrowLeft" ? "after" : "before";
    const ops = moveOps(scene, entity.id, target.id, position);
    if (ops.length > 0) onOps(ops);
  };

  const chevron = (expanded: boolean) => expanded
    ? <ExpandMoreIcon sx={TREE_ICON_SX} aria-hidden="true" />
    : <ChevronRightIcon sx={TREE_ICON_SX} aria-hidden="true" />;
  const toggleButton = (label: string, expanded: boolean, onToggle: () => void, disabled = false) => (
    <FlexRow component="button" align="center" justify="center" aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`}
      aria-expanded={expanded} aria-disabled={disabled} onClick={(event) => { event.stopPropagation(); if (!disabled) onToggle(); }}
      sx={{ ...ROW_BUTTON_SX, width: CHEVRON_SLOT, height: CHEVRON_SLOT, flex: "0 0 auto", justifyContent: "center",
        color: "text.secondary", borderRadius: BORDER_RADIUS.sm, "&:hover": { color: "text.primary" },
        "&[aria-disabled='true']": { cursor: "default" }, "&:focus-visible": focusRing(theme) }}>
      {chevron(expanded)}
    </FlexRow>
  );

  return (
    <FlexColumn sx={{ flex: 1, minHeight: 0, height: "100%" }}>
      <FlexRow role="toolbar" aria-label="Hierarchy toolbar" align="center" gap={SPACING.xs} sx={{
        flexShrink: 0, minHeight: CONTROL.height.md, boxSizing: "border-box", paddingInline: getSpacingPx(SPACING.sm),
        borderBottom: `1px solid ${theme.vars.palette.divider}`
      }}>
        <ToolbarIconButton icon={<AddIcon fontSize="small" />} tooltip={`Add entity to ${activeScene?.name ?? "scene"}`}
          aria-haspopup="menu" aria-expanded={Boolean(addSceneId)} disabled={!activeScene}
          onClick={(event) => { if (!activeScene) return; setAnchor(event.currentTarget); setAddSceneId(activeScene.id); }} />
        <Box sx={{ flex: 1, minWidth: 0 }}><SearchInput value={search} onChange={(value) => {
          setSearch(value);
          setSearchCollapsedScenes(new Set());
          setSearchCollapsedGroups(new Set());
        }} placeholder="Search" ariaLabel="Search entities" size="small" fullWidth
          sx={{ "&& .MuiInputBase-input": TYPOGRAPHY.sans.label, "& .search-icon, & .clear-button svg": TREE_ICON_SX }} /></Box>
        <Tooltip title="Drag to reorder or nest. Alt+arrow keys move or nest the focused entity.">
          <HelpOutlineIcon tabIndex={0} aria-label="Hierarchy keyboard help" sx={{ ...TREE_ICON_SX, flexShrink: 0, color: "text.secondary",
            "&:focus-visible": focusRing(theme, 2), borderRadius: BORDER_RADIUS.circle }} />
        </Tooltip>
      </FlexRow>
      <FlexColumn sx={{ flex: 1, minHeight: 0, overflowY: "auto", py: SPACING.xs, px: SPACING.xs }}>
      {document.scenes.map((scene, sceneIndex) => {
        const sceneExpanded = !((needle ? searchCollapsedScenes : collapsedScenes).has(scene.id));
        const isActive = activeSceneId === scene.id;
        return (
        <FlexColumn key={scene.id}>
          <TreeRow depth={0} baseIndent={SPACING.none} sx={ROW_SX}>
            {toggleButton(scene.name, sceneExpanded, () => toggleCollapsed(scene.id, needle ? setSearchCollapsedScenes : setCollapsedScenes))}
            <FlexRow component="button" align="center" gap={SPACING.xs} aria-label={`Scene ${scene.name}`} aria-pressed={isActive}
              onClick={() => onSelectScene(scene.id)}
              sx={{ ...ROW_BUTTON_SX, color: isActive ? "text.primary" : "text.secondary", fontWeight: isActive ? 600 : 500,
                "&:hover": { color: "text.primary" } }}>
              <FolderOpenOutlinedIcon sx={{ ...TREE_ICON_SX, color: isActive ? "primary.main" : "text.secondary" }} />
              <Box component="span" sx={TRUNCATE_SX}>{scene.name}</Box>
            </FlexRow>
          </TreeRow>
          {sceneExpanded && ([false, true] as const).map((prefabs) => {
            const rows = visibleRows(scene, prefabs, needle, collapsedEntities);
            if (prefabs && rows.length === 0 && !dragged) return null;
            const groupKey = `${scene.id}:${prefabs ? "prefabs" : "entities"}`;
            const groupExpanded = !((needle ? searchCollapsedGroups : collapsedGroups).has(groupKey));
            const groupName = prefabs ? "Prefabs" : "Entities";
            return (
              <FlexColumn key={String(prefabs)}>
                <TreeRow depth={1} baseIndent={SPACING.none} indentStep={SPACING.xl}
                  onDragOver={(event) => { if (dragged?.sceneId === scene.id) event.preventDefault(); }}
                  onDrop={(event) => { event.preventDefault(); drop(scene, null, "inside", prefabs); }}
                  sx={{ ...ROW_SX, mt: prefabs ? SPACING.xs : SPACING.none }}>
                  <FlexRow component="button" align="center" gap={SPACING.xs} aria-label={`${groupName} in ${scene.name}`}
                    aria-expanded={groupExpanded}
                    onClick={() => toggleCollapsed(groupKey, needle ? setSearchCollapsedGroups : setCollapsedGroups)}
                    sx={{ ...ROW_BUTTON_SX, color: "text.secondary", "&:hover": { color: "text.primary" } }}>
                    {chevron(groupExpanded)}
                    <Caption component="span" sx={{ color: "inherit", textTransform: "uppercase", letterSpacing: "0.08em" }}>{groupName}</Caption>
                  </FlexRow>
                </TreeRow>
                {groupExpanded && rows.map(({ entity, depth, hasChildren }) => {
                  const hasIssue = entity.id === scriptErrorEntityId || issues.some((issue) => issue.path[0] === "scenes" &&
                    issue.path[1] === sceneIndex && issue.path[2] === "entities" && scene.entities[issue.path[3] as number]?.id === entity.id);
                  const selected = selectedIds.includes(entity.id);
                  const name = entity.name || entity.id;
                  const expanded = needle !== "" || !collapsedEntities.has(entity.id);
                  return (
                    <TreeRow key={entity.id} interactive selected={selected} depth={depth + 2} baseIndent={SPACING.none}
                      indentStep={SPACING.xl}
                      sx={{ ...ROW_SX, color: hasIssue ? "error.main" : undefined,
                        outline: dropTarget === entity.id ? "1px solid" : undefined, outlineColor: "primary.main",
                        "&:has(button:focus-visible)": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 } }}>
                      {hasChildren
                        ? toggleButton(name, expanded, () => toggleCollapsed(entity.id, setCollapsedEntities), needle !== "")
                        : <Box aria-hidden="true" sx={{ width: CHEVRON_SLOT, flexShrink: 0 }} />}
                      <FlexRow component="button" draggable align="center" gap={SPACING.xs}
                        aria-label={`${name}${hasIssue ? ", has errors" : ""}`}
                        aria-pressed={selected}
                        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight"
                        onClick={(event) => onSelect(entity.id, event.shiftKey || event.metaKey || event.ctrlKey)}
                        onKeyDown={(event) => moveWithKeyboard(event, scene, entity)}
                        onDragStart={(event) => {
                          event.dataTransfer.setData("text/plain", entity.id);
                          event.dataTransfer.effectAllowed = "move";
                          setDragged({ sceneId: scene.id, entityId: entity.id });
                        }}
                        onDragEnd={() => { setDragged(null); setDropTarget(null); }}
                        onDragOver={(event) => { if (dragged?.sceneId !== scene.id) return; event.preventDefault(); setDropTarget(entity.id); }}
                        onDragLeave={() => setDropTarget((current) => current === entity.id ? null : current)}
                        onDrop={(event) => { event.preventDefault(); drop(scene, entity.id, dropPosition(event)); }}
                        sx={{ ...ROW_BUTTON_SX, alignSelf: "stretch", color: "inherit", opacity: prefabs ? 0.8 : 1 }}>
                        <FlexRow component="span" align="center" sx={{ flexShrink: 0, color: hasIssue ? "inherit" : "text.secondary" }}>{entityIcon(entity)}</FlexRow>
                        <Box component="span" sx={TRUNCATE_SX}>{name}</Box>
                        {hasIssue && <ErrorOutlineIcon sx={{ ...TREE_ICON_SX, flexShrink: 0 }} aria-hidden="true" />}
                      </FlexRow>
                    </TreeRow>
                  );
                })}
              </FlexColumn>
            );
          })}
        </FlexColumn>
      ); })}
      </FlexColumn>
      <EditorMenu anchorEl={anchor} open={Boolean(addSceneId)} onClose={() => setAddSceneId(null)}
        slotProps={{ list: { "aria-label": "Add game entity" } }}>
        {PRESETS.map(({ kind, label, icon }) => (
          <MenuItemPrimitive key={kind} label={label} icon={icon} onClick={() => add(kind)}
            disabled={kind === "sprite" && !imageSlot}
            secondary={kind === "sprite" && !imageSlot ? "Install an image first" : undefined} />
        ))}
      </EditorMenu>
    </FlexColumn>
  );
}
