import type { AnyGameDocument } from "@nodetool-ai/protocol";
import type { AnyGameDocumentOp } from "@nodetool-ai/game-runtime";

import { Caption, CollapsibleSection, EditorButton, FlexColumn, FlexRow, SPACING } from "../ui_primitives";

interface GameOverrideFieldsProps {
  document: AnyGameDocument;
  sceneId: string;
  entityId: string;
  onOps: (ops: Extract<AnyGameDocumentOp, { op: "reset_override" | "detach_entity" }>[]) => void;
}

export default function GameOverrideFields({ document, sceneId, entityId, onOps }: GameOverrideFieldsProps) {
  const authoring = document.authoring;
  if (!authoring) { return null; }
  const detached = authoring.detached.some((target) => target.sceneId === sceneId && target.entityId === entityId);
  const overrides = authoring.overrides.filter((target) => target.sceneId === sceneId && target.entityId === entityId);
  const baseline = authoring.baseline.scenes;
  const generatedScene = Array.isArray(baseline) ? baseline.find((scene) => scene && typeof scene === "object" && !Array.isArray(scene) && scene.id === sceneId) : null;
  const generatedEntity = generatedScene && typeof generatedScene === "object" && !Array.isArray(generatedScene) && Array.isArray(generatedScene.entities)
    ? generatedScene.entities.find((entity) => entity && typeof entity === "object" && !Array.isArray(entity) && entity.id === entityId) : null;
  const generated = Boolean(generatedEntity);
  const instance = authoring.instances.find((target) => target.sceneId === sceneId && target.entityId === entityId);
  const prefab = instance ? authoring.prefabs[instance.prefabId] : null;
  if (!generated && !detached) { return <Caption>Hand authored entity</Caption>; }
  return <CollapsibleSection title="Construction values" compact>
    <FlexColumn gap={SPACING.xs}>
      <Caption>{detached ? "Detached from construction" : "Generated entity. Fields without overrides follow construction."}</Caption>
      {instance && <Caption>Prefab: {instance.prefabId}</Caption>}
      {generatedEntity && typeof generatedEntity === "object" && !Array.isArray(generatedEntity) &&
        Object.entries(generatedEntity).filter(([key]) => key !== "id").map(([key, value]) => {
          const overridden = overrides.some((override) => override.path[0] === key);
          const inherited = prefab && typeof prefab === "object" && !Array.isArray(prefab) && key in prefab && JSON.stringify(prefab[key]) === JSON.stringify(value);
          return <Caption key={key}>{key}: {overridden ? "Overridden" : inherited ? "Inherited" : "Generated"}</Caption>;
        })}
      {overrides.map((override) => <FlexRow key={JSON.stringify(override.path)} gap={SPACING.sm} align="center">
        <Caption>{override.path.join(".")}: Overridden {override.remove ? "(removed)" : JSON.stringify(override.value)}</Caption>
        <EditorButton onClick={() => onOps([{ op: "reset_override", scene_id: sceneId, entity_id: entityId, path: override.path }])}>
          Reset {override.path.join(".")}
        </EditorButton>
      </FlexRow>)}
      {!detached && <FlexRow gap={SPACING.sm}>
        <EditorButton disabled={overrides.length === 0} onClick={() => onOps([{ op: "reset_override", scene_id: sceneId, entity_id: entityId }])}>Reset all overrides</EditorButton>
        <EditorButton onClick={() => onOps([{ op: "detach_entity", scene_id: sceneId, entity_id: entityId }])}>Detach entity</EditorButton>
      </FlexRow>}
    </FlexColumn>
  </CollapsibleSection>;
}
