import { memo, useState } from "react";
import { GAME_MAX_PHYSICS_MATERIALS_3D, gamePhysicsMaterial3D, type GameDocument3D, type GameEntity3D, type GamePhysicsMaterial3D } from "@nodetool-ai/protocol";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

import { Caption, FlexColumn, InspectorFieldRow, InspectorValueInput, SPACING } from "../../../ui_primitives";
import { AddButton, FieldGroup, RowAction } from "../InspectorParts";
import SchemaFields from "../SchemaFields";
import { gameSchemaFields } from "../schemaForm";

const MATERIAL_FIELDS = gameSchemaFields(gamePhysicsMaterial3D);

function renameColliders(entities: readonly GameEntity3D[], from: string, to: string): GameEntity3D[] {
  return entities.map((entity) => entity.collider3d?.physicsMaterial === from ? { ...entity, collider3d: { ...entity.collider3d, physicsMaterial: to } } : entity);
}

/** Renames a material, keeping its position in the record, and every collider reference in scenes and prefabs. */
export function renamePhysicsMaterial3D(document: GameDocument3D, from: string, to: string): GameDocument3D {
  return {
    ...document,
    physicsMaterials: Object.fromEntries(Object.entries(document.physicsMaterials ?? {}).map(([name, material]) => [name === from ? to : name, material])),
    scenes: document.scenes.map((scene) => ({ ...scene, entities: renameColliders(scene.entities, from, to) })),
    prefabs: Object.fromEntries(Object.entries(document.prefabs).map(([id, prefab]) => [id, { ...prefab, entities: renameColliders(prefab.entities, from, to) }]))
  };
}

/**
 * Removes a material. Colliders are not changed, so while a collider still names the
 * material, applying the edit fails validation with unknown_physics_material and the
 * inspector reports the error instead of removing the material.
 */
export function removePhysicsMaterial3D(document: GameDocument3D, name: string): GameDocument3D {
  const { [name]: _removed, ...rest } = document.physicsMaterials ?? {};
  const next: GameDocument3D = { ...document, physicsMaterials: rest };
  if (Object.keys(rest).length === 0) { delete next.physicsMaterials; }
  return next;
}

interface PhysicsMaterialsEditorProps {
  readonly document: GameDocument3D;
  readonly onDocument: (next: GameDocument3D, label: string) => void;
}

function PhysicsMaterialsEditor({ document, onDocument }: PhysicsMaterialsEditorProps) {
  const materials = document.physicsMaterials ?? {};
  const names = Object.keys(materials);
  const [renameError, setRenameError] = useState<string | null>(null);
  const rename = (material: string, raw: string): void => {
    const name = raw.trim();
    if (!name || name === material) { setRenameError(null); return; }
    if (names.includes(name)) { setRenameError(`Material ${name} already exists. Choose another name.`); return; }
    setRenameError(null);
    onDocument(renamePhysicsMaterial3D(document, material, name), "Rename Physics Material");
  };
  const addMaterial = (): void => {
    let index = names.length + 1;
    while (names.includes(`material${index}`)) { index += 1; }
    onDocument({ ...document, physicsMaterials: { ...materials, [`material${index}`]: gamePhysicsMaterial3D.parse({}) } }, "Add Physics Material");
  };
  const change = (name: string, value: unknown): void => {
    const parsed = gamePhysicsMaterial3D.safeParse(value);
    if (parsed.success) { onDocument({ ...document, physicsMaterials: { ...materials, [name]: parsed.data } }, "Change Physics Material"); }
  };
  return <FlexColumn gap={SPACING.xs} sx={{ width: "100%", minWidth: 0 }}>
    <Caption>Colliders pick a material by name and take its friction, restitution and combine rules. When two colliders use different rules, the later of average, min, multiply and max wins.</Caption>
    {Object.entries(materials).map(([name, material]: [string, GamePhysicsMaterial3D], index) => <FieldGroup key={`${index}:${name}`} title={name}
      actions={<RowAction icon={<DeleteOutlineIcon />} label={`Remove material ${name}`}
        onClick={() => onDocument(removePhysicsMaterial3D(document, name), "Remove Physics Material")} />}>
      <InspectorFieldRow label="Name"><InspectorValueInput grow ariaLabel={`Material ${name} name`} value={name} onCommit={(raw) => rename(name, raw)} /></InspectorFieldRow>
      <SchemaFields schema={MATERIAL_FIELDS} value={material} path={`physicsMaterials.${name}`} onChange={(value) => change(name, value)} />
    </FieldGroup>)}
    {renameError && <Caption color="error" role="alert">{renameError}</Caption>}
    <AddButton disabled={names.length >= GAME_MAX_PHYSICS_MATERIALS_3D} onClick={addMaterial}>Add material</AddButton>
  </FlexColumn>;
}

export default memo(PhysicsMaterialsEditor);
