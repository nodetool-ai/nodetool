import type { AnyGameDocument } from "@nodetool-ai/protocol";
import type { AnyGameDocumentOp } from "@nodetool-ai/game-runtime";

import RestartAltIcon from "@mui/icons-material/RestartAlt";
import { useTranslation } from "react-i18next";

import { Caption, EditorButton, FlexColumn, FlexRow, InspectorSection, SPACING } from "../ui_primitives";
import { RowAction } from "./inspector/InspectorParts";

interface GameOverrideFieldsProps {
  document: AnyGameDocument;
  sceneId: string;
  entityId: string;
  onOps: (ops: Extract<AnyGameDocumentOp, { op: "reset_override" | "detach_entity" }>[]) => void;
}

export default function GameOverrideFields({ document, sceneId, entityId, onOps }: GameOverrideFieldsProps) {
  const { t } = useTranslation();
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
  if (!generated && !detached) { return <Caption sx={{ py: SPACING.xs }}>{t("screen_game.overrides.handAuthored")}</Caption>; }
  return <InspectorSection title={t("screen_game.overrides.title")} defaultOpen={false}>
    <Caption>{detached ? t("screen_game.overrides.detached") : t("screen_game.overrides.description")}</Caption>
    {instance && <Caption>{t("screen_game.overrides.prefab", { id: instance.prefabId })}</Caption>}
    {generatedEntity && typeof generatedEntity === "object" && !Array.isArray(generatedEntity) && <FlexColumn gap={SPACING.micro}>
      {Object.entries(generatedEntity).filter(([key]) => key !== "id").map(([key, value]) => {
        const overridden = overrides.some((override) => override.path[0] === key);
        const inherited = prefab && typeof prefab === "object" && !Array.isArray(prefab) && key in prefab && JSON.stringify(prefab[key]) === JSON.stringify(value);
        return <Caption key={key} color={overridden ? "primary" : undefined}>{key}: {overridden ? t("screen_game.overrides.overridden") : inherited ? t("screen_game.overrides.inherited") : t("screen_game.overrides.generated")}</Caption>;
      })}
    </FlexColumn>}
    {overrides.map((override) => <FlexRow key={JSON.stringify(override.path)} gap={SPACING.xs} align="center" sx={{ width: "100%", minWidth: 0 }}>
      <Caption sx={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{t("screen_game.overrides.pathOverridden", { path: override.path.join(".") })} {override.remove ? t("screen_game.overrides.removed") : JSON.stringify(override.value)}</Caption>
      <RowAction icon={<RestartAltIcon />} label={t("screen_game.overrides.resetPath", { path: override.path.join(".") })}
        onClick={() => onOps([{ op: "reset_override", scene_id: sceneId, entity_id: entityId, path: override.path }])} />
    </FlexRow>)}
    {!detached && <FlexRow gap={SPACING.xs}>
      <EditorButton variant="text" disabled={overrides.length === 0} onClick={() => onOps([{ op: "reset_override", scene_id: sceneId, entity_id: entityId }])}>{t("screen_game.overrides.resetAll")}</EditorButton>
      <EditorButton variant="text" onClick={() => onOps([{ op: "detach_entity", scene_id: sceneId, entity_id: entityId }])}>{t("screen_game.overrides.detachEntity")}</EditorButton>
    </FlexRow>}
  </InspectorSection>;
}
