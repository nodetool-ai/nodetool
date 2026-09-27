import { useState, type DragEvent, type KeyboardEvent } from "react";
import type { GameDocument, GameEntity, GameScene } from "@nodetool-ai/protocol/game.js";
import type { GameDocumentOp, GameValidationIssue } from "@nodetool-ai/game-runtime";

import { Caption, EditorButton, EditorMenu, FlexColumn, FlexRow, MenuItemPrimitive, SearchInput, SPACING, Text } from "../ui_primitives";

interface GameSceneTreeProps {
  document: GameDocument;
  selectedIds: readonly string[];
  issues?: readonly GameValidationIssue[];
  scriptErrorEntityId?: string | null;
  onSelect: (id: string, additive: boolean) => void;
  onOps: (ops: GameDocumentOp[]) => void;
}

type Preset = "sprite" | "wall" | "collectible" | "trigger" | "camera" | "empty";
type DropPosition = "before" | "inside" | "after";
const PRESETS: readonly { kind: Preset; label: string }[] = [
  { kind: "sprite", label: "Sprite" }, { kind: "wall", label: "Static wall" },
  { kind: "collectible", label: "Collectible" }, { kind: "trigger", label: "Trigger" },
  { kind: "camera", label: "Camera" }, { kind: "empty", label: "Empty" }
];

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
      set: { parentId: parentId ?? null, templateOnly } });
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

export default function GameSceneTree({ document, selectedIds, issues = [], scriptErrorEntityId, onSelect, onOps }: GameSceneTreeProps) {
  const [search, setSearch] = useState("");
  const [addSceneId, setAddSceneId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [dragged, setDragged] = useState<{ sceneId: string; entityId: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const needle = search.trim().toLowerCase();
  const imageSlot = Object.entries(document.assets).find(([, binding]) => binding.mediaKind === "image")?.[0];

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
  const moveWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>, scene: GameScene, entity: GameEntity) => {
    if (!event.altKey || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    const siblings = scene.entities.filter((item) => item.parentId === entity.parentId && item.templateOnly === entity.templateOnly);
    const index = siblings.findIndex((item) => item.id === entity.id);
    const target = event.key === "ArrowUp" ? siblings[index - 1] :
      event.key === "ArrowDown" ? siblings[index + 1] :
      event.key === "ArrowRight" ? siblings[index - 1] :
      entity.parentId ? scene.entities.find((item) => item.id === entity.parentId) : undefined;
    if (!target) return;
    event.preventDefault();
    const position: DropPosition = event.key === "ArrowRight" ? "inside" :
      event.key === "ArrowDown" || event.key === "ArrowLeft" ? "after" : "before";
    const ops = moveOps(scene, entity.id, target.id, position);
    if (ops.length > 0) onOps(ops);
  };

  return (
    <FlexColumn gap={SPACING.sm} sx={{ minHeight: 0, overflowY: "auto" }}>
      <Text>Scenes</Text>
      <SearchInput value={search} onChange={setSearch} placeholder="Search entities" ariaLabel="Search entities" size="small" />
      <Caption>Alt+arrow keys move or nest a focused entity</Caption>
      {document.scenes.map((scene, sceneIndex) => (
        <FlexColumn key={scene.id} gap={SPACING.xs}>
          <FlexRow align="center" justify="space-between">
            <Caption>{scene.name}</Caption>
            <EditorButton aria-label={`Add entity to ${scene.name}`} onClick={(event) => {
              setAnchor(event.currentTarget); setAddSceneId(scene.id);
            }}>+</EditorButton>
          </FlexRow>
          {([false, true] as const).map((prefabs) => {
            const rows = visibleRows(scene, prefabs, needle);
            if (prefabs && rows.length === 0 && !dragged) return null;
            return (
              <FlexColumn key={String(prefabs)} gap={SPACING.xs}>
                <Caption onDragOver={(event) => { if (dragged?.sceneId === scene.id) event.preventDefault(); }}
                  onDrop={(event) => { event.preventDefault(); drop(scene, null, "inside", prefabs); }}
                  sx={{ color: "text.secondary" }}>{prefabs ? "Prefabs" : "Entities"}</Caption>
                {rows.map(({ entity, depth }) => {
                  const hasIssue = entity.id === scriptErrorEntityId || issues.some((issue) => issue.path[0] === "scenes" &&
                    issue.path[1] === sceneIndex && issue.path[2] === "entities" && scene.entities[issue.path[3] as number]?.id === entity.id);
                  return (
                    <EditorButton key={entity.id} draggable variant={selectedIds.includes(entity.id) ? "contained" : "text"}
                      aria-label={`${entity.name || entity.id}${hasIssue ? ", has errors" : ""}`}
                      aria-pressed={selectedIds.includes(entity.id)}
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
                      sx={{ ml: depth * SPACING.md, justifyContent: "flex-start", textAlign: "left",
                        outline: dropTarget === entity.id ? "1px solid" : undefined,
                        outlineColor: "primary.main", color: hasIssue ? "error.main" : undefined }}>
                      {entity.name || entity.id}
                    </EditorButton>
                  );
                })}
              </FlexColumn>
            );
          })}
        </FlexColumn>
      ))}
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
