import type { ReactNode } from "react";
import { Euler, Quaternion } from "three";
import { gameDocumentOp3D, validateGame3D, type GameDocumentOp3D } from "@nodetool-ai/game-runtime";
import { gameScene3D, gameEntity3D, type GameDocument3D } from "@nodetool-ai/protocol";
import { Caption, CollapsibleSection, EditorButton, FlexColumn, FlexRow, InspectorFieldRow, InspectorValueInput, SPACING, Text } from "../ui_primitives";
import ReportBugButton from "../support/ReportBugButton";
import SchemaFields from "./inspector/SchemaFields";
import { gameSchemaFields } from "./inspector/schemaForm";

interface GameInspector3DProps {
  readonly document: GameDocument3D;
  readonly sceneId: string;
  readonly entityId?: string;
  readonly onOps: (ops: GameDocumentOp3D[]) => void;
  readonly onScript: (index: number) => void;
}

const ENTITY_FIELDS = gameSchemaFields(gameEntity3D.omit({ id: true, transform3d: true, behaviors: true }));

export default function GameInspector3D({ document, sceneId, entityId, onOps, onScript }: GameInspector3DProps) {
  const scene = document.scenes.find((item) => item.id === sceneId);
  const entity = scene?.entities.find((item) => item.id === entityId);
  const validation = validateGame3D(document);
  const apply = (set: unknown): void => {
    if (!entity) { return; }
    onOps([gameDocumentOp3D.parse({ op: "update_entity", scene_id: sceneId, entity_id: entity.id, set })]);
  };
  if (!entity) {
    const { id: _sceneId, entities: _entities, ...settings } = scene ?? {};
    return <FlexColumn gap={SPACING.sm}>
      <Text>Scene</Text>
      {scene && <SchemaFields schema={gameSchemaFields(gameScene3D.omit({ id: true, entities: true }))}
        value={settings} assets={document.assets} onChange={(value) => {
          const updated = gameScene3D.parse({ ...gameScene3D.omit({ id: true, entities: true }).parse(value), id: scene.id, entities: scene.entities });
          onOps([{ op: "set_document", document: { ...document, scenes: document.scenes.map((item) => item.id === sceneId ? updated : item) } }]);
        }} />}
      {validation.diagnostics.map((issue, index) => <Caption key={`${issue.code}:${index}`} color="error">{issue.path.join(".")}: {issue.message}</Caption>)}
      {validation.diagnostics.length > 0 && <ReportBugButton context={{ source: "panel-crash", summary: "3D game validation failed",
        errorText: validation.diagnostics.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n"),
        nodeDetail: `Game: ${document.id}\nScene: ${sceneId}` }} />}
    </FlexColumn>;
  }
  const position = entity.transform3d.position;
  const scale = entity.transform3d.scale;
  const angles = new Euler().setFromQuaternion(new Quaternion().fromArray(entity.transform3d.rotation), "YXZ");
  const rotation = { x: angles.x * 180 / Math.PI, y: angles.y * 180 / Math.PI, z: angles.z * 180 / Math.PI };
  const transformField = (kind: "position" | "scale" | "rotation", values: { x: number; y: number; z: number }): ReactNode =>
    <InspectorFieldRow label={kind === "rotation" ? "Rotation (degrees)" : kind === "position" ? "Position (meters)" : "Scale"}>
      {(["x", "y", "z"] as const).map((axis) => <InspectorValueInput key={axis} ariaLabel={`${kind} ${axis}`} grow value={String(values[axis])}
        onCommit={(value) => {
          const numeric = Number(value);
          if (!Number.isFinite(numeric) || (kind === "scale" && numeric <= 0)) { return; }
          if (kind === "rotation") {
            const updated = { ...rotation, [axis]: numeric };
            const quaternion = new Quaternion().setFromEuler(new Euler(updated.x * Math.PI / 180, updated.y * Math.PI / 180, updated.z * Math.PI / 180, "YXZ"));
            apply({ transform3d: { rotation: [quaternion.x, quaternion.y, quaternion.z, quaternion.w] } });
          } else { apply({ transform3d: { [kind]: { ...values, [axis]: numeric } } }); }
        }} />)}
    </InspectorFieldRow>;
  const { id: _id, transform3d: _transform, behaviors: _behaviors, ...components } = entity;
  return <FlexColumn gap={SPACING.sm} sx={{ overflowY: "auto", minHeight: 0 }}>
    <Text>{entity.name || entity.id}</Text>
    {transformField("position", position)}
    {transformField("rotation", rotation)}
    {transformField("scale", scale)}
    <SchemaFields schema={ENTITY_FIELDS} value={components} path="entity" assets={document.assets}
      collisionLayers={document.collisionLayers} onChange={(value) => {
        const updated = gameEntity3D.parse({ ...gameEntity3D.omit({ id: true, transform3d: true, behaviors: true }).parse(value),
          id: entity.id, transform3d: entity.transform3d, behaviors: entity.behaviors });
        onOps([{ op: "set_document", document: { ...document, scenes: document.scenes.map((item) => item.id === sceneId ?
          { ...item, entities: item.entities.map((candidate) => candidate.id === entity.id ? updated : candidate) } : item) } }]);
      }} />
    <CollapsibleSection title="Behaviors" compact>
      {entity.behaviors.map((behavior, index) => <FlexColumn key={`${behavior.kind}:${index}`} gap={SPACING.xs}>
        <FlexRow gap={SPACING.xs} align="center"><Caption>{behavior.kind}</Caption>
          {behavior.kind === "script" && <EditorButton onClick={() => onScript(index)}>Edit script</EditorButton>}
          <EditorButton onClick={() => onOps([{ op: "remove_behavior", scene_id: sceneId, entity_id: entity.id, index }])}>Remove</EditorButton>
        </FlexRow>
        {behavior.kind !== "script" && <SchemaFields schema={gameSchemaFields(gameEntity3D.shape.behaviors.unwrap().element)} value={behavior}
          onChange={(value) => onOps([gameDocumentOp3D.parse({ op: "update_behavior", scene_id: sceneId, entity_id: entity.id, index, behavior: value })])} />}
      </FlexColumn>)}
      <EditorButton onClick={() => onOps([{ op: "add_behavior", scene_id: sceneId, entity_id: entity.id,
        behavior: { kind: "script", source: '(input) => ({ state: input.state, commands: [] })' } }])}>Add script</EditorButton>
    </CollapsibleSection>
    <EditorButton onClick={() => onOps([{ op: "remove_entity", scene_id: sceneId, entity_id: entity.id }])}>Delete entity</EditorButton>
  </FlexColumn>;
}
