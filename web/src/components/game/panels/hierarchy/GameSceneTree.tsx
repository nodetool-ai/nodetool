import { useState, type DragEvent, type KeyboardEvent } from "react";
import AddIcon from "@mui/icons-material/Add";
import CameraAltOutlinedIcon from "@mui/icons-material/CameraAltOutlined";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import type { GameDocument, GameEntity, GameScene } from "@nodetool-ai/protocol/game.js";
import type { GameDocumentOp, GameValidationIssue } from "@nodetool-ai/game-runtime";

import { Box, CONTROL, Divider, EditorButton, EditorMenu, FlexColumn, FlexRow, FONT_SIZE_SANS, Label, MenuItemPrimitive, SearchInput, SPACING, Text, Tooltip, TreeRow, TYPOGRAPHY } from "../../../ui_primitives";

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
const PRESETS: readonly { kind: Preset; label: string }[] = [
  { kind: "sprite", label: "Sprite" }, { kind: "wall", label: "Static wall" },
  { kind: "collectible", label: "Collectible" }, { kind: "trigger", label: "Trigger" },
  { kind: "camera", label: "Camera" }, { kind: "empty", label: "Empty" }
];
const TREE_ICON_SX = { fontSize: FONT_SIZE_SANS.body } as const;

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

function visibleRows(scene: GameScene, templateOnly: boolean, needle: string): { entity: GameEntity; depth: number }[] {
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
  const rows: { entity: GameEntity; depth: number }[] = [];
  const visited = new Set<string>();
  const append = (entity: GameEntity, depth: number) => {
    if (visited.has(entity.id)) return;
    visited.add(entity.id);
    if (!needle || shown.has(entity.id)) rows.push({ entity, depth });
    for (const child of children.get(entity.id) ?? []) append(child, depth + 1);
  };
  for (const entity of children.get(undefined) ?? []) append(entity, 0);
  for (const entity of entities) if (!visited.has(entity.id)) append(entity, 0);
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
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [dragged, setDragged] = useState<{ sceneId: string; entityId: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [collapsedScenes, setCollapsedScenes] = useState<Set<string>>(() => new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [searchCollapsedScenes, setSearchCollapsedScenes] = useState<Set<string>>(() => new Set());
  const [searchCollapsedGroups, setSearchCollapsedGroups] = useState<Set<string>>(() => new Set());
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

  return (
    <FlexColumn gap={SPACING.sm} sx={{ flex: 1, minHeight: 0 }}>
      <FlexRow align="center" justify="space-between" sx={{ px: SPACING.md, pt: SPACING.md }}>
        <Text size="small">Scene tree</Text>
        <Tooltip title="Alt+arrow keys move or nest a focused entity"><HelpOutlineIcon sx={{ ...TREE_ICON_SX, color: "text.secondary" }} /></Tooltip>
      </FlexRow>
      <Box sx={{ px: SPACING.md }}><SearchInput value={search} onChange={(value) => {
        setSearch(value);
        setSearchCollapsedScenes(new Set());
        setSearchCollapsedGroups(new Set());
      }} placeholder="Search entities" ariaLabel="Search entities" size="small"
        sx={{ "&& .MuiInputBase-input": TYPOGRAPHY.sans.label, "& .search-icon, & .clear-button svg": TREE_ICON_SX }} /></Box>
      <Divider />
      <FlexColumn gap={SPACING.sm} sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
      {document.scenes.map((scene, sceneIndex) => {
        const sceneExpanded = !((needle ? searchCollapsedScenes : collapsedScenes).has(scene.id));
        return (
        <FlexColumn key={scene.id} gap={SPACING.micro} sx={{ px: SPACING.xs }}>
          <FlexRow align="center" justify="space-between" sx={{ px: SPACING.md, py: SPACING.micro }}>
            <EditorButton variant="text" aria-label={`${sceneExpanded ? "Collapse" : "Expand"} ${scene.name}`}
              aria-expanded={sceneExpanded}
              onClick={() => toggleCollapsed(scene.id, needle ? setSearchCollapsedScenes : setCollapsedScenes)}
              sx={{ width: CONTROL.height.xs, minWidth: 0, px: SPACING.none, flexShrink: 0, color: "text.secondary" }}>
              {sceneExpanded ? <ExpandMoreIcon sx={TREE_ICON_SX} aria-hidden="true" /> : <ChevronRightIcon sx={TREE_ICON_SX} aria-hidden="true" />}
            </EditorButton>
            <EditorButton variant="text" aria-label={`Scene ${scene.name}`} aria-pressed={activeSceneId === scene.id}
              onClick={() => onSelectScene(scene.id)}
              sx={{ flex: 1, minWidth: 0, justifyContent: "flex-start", gap: SPACING.xs,
                bgcolor: activeSceneId === scene.id ? "action.selected" : "transparent",
                color: activeSceneId === scene.id ? "text.primary" : "text.secondary" }}>
              <FolderOpenOutlinedIcon sx={TREE_ICON_SX} />
              <Text component="span" size="small" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{scene.name}</Text>
            </EditorButton>
            <EditorButton aria-label={`Add entity to ${scene.name}`} title={`Add entity to ${scene.name}`} onClick={(event) => {
              setAnchor(event.currentTarget); setAddSceneId(scene.id);
            }}><AddIcon sx={TREE_ICON_SX} /></EditorButton>
          </FlexRow>
          {sceneExpanded && <FlexColumn gap={SPACING.micro}>
          {([false, true] as const).map((prefabs) => {
            const rows = visibleRows(scene, prefabs, needle);
            if (prefabs && rows.length === 0 && !dragged) return null;
            const groupKey = `${scene.id}:${prefabs ? "prefabs" : "entities"}`;
            const groupExpanded = !((needle ? searchCollapsedGroups : collapsedGroups).has(groupKey));
            const groupName = prefabs ? "Prefabs" : "Entities";
            return (
              <FlexColumn key={String(prefabs)} gap={SPACING.micro}>
                <FlexRow onDragOver={(event) => { if (dragged?.sceneId === scene.id) event.preventDefault(); }}
                  onDrop={(event) => { event.preventDefault(); drop(scene, null, "inside", prefabs); }}
                  sx={{ pl: SPACING.xxxl, pr: SPACING.md, py: SPACING.xs }}>
                  <EditorButton variant="text" aria-label={`${groupName} in ${scene.name}`} aria-expanded={groupExpanded}
                    onClick={() => toggleCollapsed(groupKey, needle ? setSearchCollapsedGroups : setCollapsedGroups)}
                    sx={{ width: "100%", color: "text.secondary", justifyContent: "flex-start", gap: SPACING.xs,
                      textTransform: "uppercase", letterSpacing: "0.12em" }}>
                    {groupExpanded ? <ExpandMoreIcon sx={TREE_ICON_SX} aria-hidden="true" /> : <ChevronRightIcon sx={TREE_ICON_SX} aria-hidden="true" />}
                    <Label component="span" sx={{ mb: 0 }}>{groupName}</Label>
                  </EditorButton>
                </FlexRow>
                {groupExpanded && <FlexColumn gap={SPACING.micro}>
                {rows.map(({ entity, depth }) => {
                  const hasIssue = entity.id === scriptErrorEntityId || issues.some((issue) => issue.path[0] === "scenes" &&
                    issue.path[1] === sceneIndex && issue.path[2] === "entities" && scene.entities[issue.path[3] as number]?.id === entity.id);
                  const selected = selectedIds.includes(entity.id);
                  return (
                    <TreeRow key={entity.id} component="button" type="button" draggable interactive selected={selected}
                      depth={depth} baseIndent={SPACING.xxxl * 2} indentStep={SPACING.xl}
                      aria-label={`${entity.name || entity.id}${hasIssue ? ", has errors" : ""}`}
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
                      sx={{ color: hasIssue ? "error.main" : undefined,
                        outline: dropTarget === entity.id ? "1px solid" : undefined,
                        outlineColor: "primary.main" }}>
                      <Box component="span" sx={{ display: "inline-flex", opacity: 0.7, flexShrink: 0 }}>{entityIcon(entity)}</Box>
                      <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{entity.name || entity.id}</Box>
                      {hasIssue && <ErrorOutlineIcon sx={TREE_ICON_SX} aria-hidden="true" />}
                    </TreeRow>
                  );
                })}
                </FlexColumn>}
              </FlexColumn>
            );
          })}
          </FlexColumn>}
        </FlexColumn>
      ); })}
      </FlexColumn>
      <EditorMenu anchorEl={anchor} open={Boolean(addSceneId)} onClose={() => setAddSceneId(null)}
        slotProps={{ list: { "aria-label": "Add game entity" } }}>
        {PRESETS.map(({ kind, label }) => (
          <MenuItemPrimitive key={kind} label={label} onClick={() => add(kind)}
            disabled={kind === "sprite" && !imageSlot}
            secondary={kind === "sprite" && !imageSlot ? "Install an image first" : undefined} />
        ))}
      </EditorMenu>
    </FlexColumn>
  );
}
