import { memo, type ReactNode } from "react";
import type { GameDocument3D, GameEntity3D } from "@nodetool-ai/protocol";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

import { Box, Caption, Checkbox, EditorButton, FlexColumn, FlexRow, InspectorValueInput, ScrollArea, SPACING, ToolbarIconButton, TruncatedText } from "../../../ui_primitives";

/** The most named collision layers a 3D document declares, one per filter bit. */
export const MAX_COLLISION_LAYERS_3D = 16;

type CollisionPair = [string, string];

function samePair(pair: readonly [string, string], a: string, b: string): boolean {
  return pair[0] === a && pair[1] === b || pair[0] === b && pair[1] === a;
}

/** Returns the matrix with the pair removed when the layers collide, or listed when they do not. */
export function setCollisionPair(matrix: readonly (readonly [string, string])[], a: string, b: string, collide: boolean): CollisionPair[] {
  const rest = matrix.filter((pair) => !samePair(pair, a, b)).map(([left, right]): CollisionPair => [left, right]);
  return collide ? rest : [...rest, [a, b]];
}

function renameColliders(entities: readonly GameEntity3D[], from: string, to: string): GameEntity3D[] {
  return entities.map((entity) => entity.collider3d?.layer === from ? { ...entity, collider3d: { ...entity.collider3d, layer: to } } : entity);
}

/** Renames a layer in the layer list, the matrix, and every collider in scenes and prefabs. */
export function renameCollisionLayer3D(document: GameDocument3D, from: string, to: string): GameDocument3D {
  const next: GameDocument3D = {
    ...document,
    collisionLayers: (document.collisionLayers ?? []).map((name) => name === from ? to : name),
    scenes: document.scenes.map((scene) => ({ ...scene, entities: renameColliders(scene.entities, from, to) })),
    prefabs: Object.fromEntries(Object.entries(document.prefabs).map(([id, prefab]) => [id, { ...prefab, entities: renameColliders(prefab.entities, from, to) }]))
  };
  if (document.collisionMatrix) { next.collisionMatrix = document.collisionMatrix.map(([a, b]): CollisionPair => [a === from ? to : a, b === from ? to : b]); }
  return next;
}

/** Removes a layer and its matrix pairs. Colliders still on it are left for validation to report. */
export function removeCollisionLayer3D(document: GameDocument3D, name: string): GameDocument3D {
  const next: GameDocument3D = { ...document, collisionLayers: (document.collisionLayers ?? []).filter((layer) => layer !== name) };
  if (document.collisionMatrix) { next.collisionMatrix = document.collisionMatrix.filter(([a, b]) => a !== name && b !== name); }
  return next;
}

interface CollisionMatrixEditorProps {
  readonly document: GameDocument3D;
  readonly onDocument: (next: GameDocument3D, label: string) => void;
}

function CollisionMatrixEditor({ document, onDocument }: CollisionMatrixEditorProps) {
  const layers = document.collisionLayers ?? [];
  const matrix = document.collisionMatrix ?? [];
  const collides = (a: string, b: string): boolean => !matrix.some((pair) => samePair(pair, a, b));
  const addLayer = (): void => {
    let index = layers.length + 1;
    while (layers.includes(`layer${index}`)) { index += 1; }
    onDocument({ ...document, collisionLayers: [...layers, `layer${index}`] }, "Add Collision Layer");
  };
  const cells: ReactNode[] = [<Box key="corner" />];
  layers.forEach((layer, column) => cells.push(<Caption key={`head:${layer}`} title={layer} sx={{ textAlign: "center" }}>{column + 1}</Caption>));
  layers.forEach((row, rowIndex) => {
    cells.push(<TruncatedText key={`row:${row}`} variant="caption" showTooltip>{`${rowIndex + 1} ${row}`}</TruncatedText>);
    layers.forEach((column, columnIndex) => cells.push(columnIndex > rowIndex ? <Box key={`${row}:${column}`} /> :
      <Checkbox key={`${row}:${column}`} compact size="small" checked={collides(row, column)}
        inputProps={{ "aria-label": `${row} collides with ${column}` }}
        onChange={(_event, checked) => onDocument({ ...document, collisionMatrix: setCollisionPair(matrix, row, column, checked) },
          checked ? "Enable Layer Collision" : "Disable Layer Collision")} />));
  });
  return <FlexColumn gap={SPACING.sm} sx={{ px: SPACING.md, py: SPACING.sm, minWidth: 0 }}>
    <Caption>Colliders pick a layer by name. Checked pairs collide. Category and mask bits come from this table.</Caption>
    {layers.map((layer, index) => <FlexRow key={`${index}:${layer}`} gap={SPACING.xs} align="center">
      <Caption>{index + 1}</Caption>
      <InspectorValueInput grow ariaLabel={`Layer ${index + 1} name`} value={layer} onCommit={(raw) => {
        const name = raw.trim();
        if (name && name !== layer && !layers.includes(name)) { onDocument(renameCollisionLayer3D(document, layer, name), "Rename Collision Layer"); }
      }} />
      <ToolbarIconButton icon={<DeleteOutlineIcon fontSize="small" />} tooltip={`Remove layer ${layer}`}
        onClick={() => onDocument(removeCollisionLayer3D(document, layer), "Remove Collision Layer")} />
    </FlexRow>)}
    <EditorButton variant="outlined" startIcon={<AddIcon fontSize="small" />} disabled={layers.length >= MAX_COLLISION_LAYERS_3D} onClick={addLayer}>Add layer</EditorButton>
    {layers.length > 0 && <ScrollArea direction="horizontal" thin>
      <Box role="group" aria-label="Collision matrix" sx={{ display: "grid", gridTemplateColumns: `minmax(0, max-content) repeat(${layers.length}, max-content)`,
        alignItems: "center", columnGap: SPACING.micro }}>{cells}</Box>
    </ScrollArea>}
  </FlexColumn>;
}

export default memo(CollisionMatrixEditor);
