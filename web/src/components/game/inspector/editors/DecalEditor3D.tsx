import { useState } from "react";
import { useTranslation } from "react-i18next";
import CloseIcon from "@mui/icons-material/Close";
import { GAME_MAX_DECALS_3D, gameDecal3D, type GameDecal3D, type GameDocument3D } from "@nodetool-ai/protocol";
import { gameDocumentOp3D, type GameDocumentOp3D } from "@nodetool-ai/game-runtime";
import { Caption, EditorButton, FlexColumn, InspectorFieldRow, InspectorSection, InspectorSelect, SPACING } from "../../../ui_primitives";
import SchemaFields from "../SchemaFields";
import { gameSchemaFields } from "../schemaForm";

interface DecalEditor3DProps {
  readonly document: GameDocument3D;
  readonly sceneId: string;
  readonly entityId: string;
  readonly onOps: (ops: GameDocumentOp3D[], label?: string) => void;
}

const DECAL_FIELDS = gameDecal3D.omit({ assetId: true, receiverId: true });
const FIELDS = gameSchemaFields(DECAL_FIELDS);

export default function DecalEditor3D({ document, sceneId, entityId, onOps }: DecalEditor3DProps) {
  const { t } = useTranslation();
  const [image, setImage] = useState("");
  const [receiver, setReceiver] = useState("");
  const scene = document.scenes.find(scene => scene.id === sceneId);
  const entity = scene?.entities.find(entity => entity.id === entityId);
  if (!scene || !entity) { return null; }
  const current = entity.decal3d;
  const images = Object.entries(document.assets).filter(([, binding]) => binding.mediaKind === "image")
    .map(([slot]) => ({ value: slot, label: slot }));
  const receivers = scene.entities.filter(candidate => candidate.id !== entityId && !candidate.templateOnly
    && !candidate.animator3d && (candidate.primitive || candidate.model))
    .map(candidate => ({ value: candidate.id, label: candidate.name || candidate.id }));
  const assetId = current?.assetId ?? (images.some(option => option.value === image) ? image : images[0]?.value ?? "");
  const receiverId = current?.receiverId ?? (receivers.some(option => option.value === receiver) ? receiver : receivers[0]?.value ?? "");
  const full = scene.entities.filter(entity => entity.decal3d).length >= GAME_MAX_DECALS_3D;
  const update = (value: GameDecal3D | null): void => {
    onOps([gameDocumentOp3D.parse({ op: "update_entity", scene_id: sceneId, entity_id: entityId, set: { decal3d: value } })],
      value === null ? t("game.decal.actions.remove") : current ? t("game.decal.actions.change") : t("game.decal.actions.add"));
  };
  const fields = current ? { size: current.size, opacity: current.opacity, renderOrder: current.renderOrder } : undefined;
  return <InspectorSection title={t("game.decal.title")} action={current ? { icon: <CloseIcon />, label: t("game.decal.actions.remove"), onClick: () => update(null) } : undefined}>
    <FlexColumn gap={SPACING.sm}>
      <InspectorFieldRow label={t("game.decal.fields.image")}><InspectorSelect grow label={t("game.decal.accessibility.image")} value={assetId} options={images}
        disabled={images.length === 0} onChange={value => {
          if (current) { update({ ...current, assetId: value }); }
          else { setImage(value); }
        }} /></InspectorFieldRow>
      <InspectorFieldRow label={t("game.decal.fields.receiver")}><InspectorSelect grow label={t("game.decal.accessibility.receiver")} value={receiverId} options={receivers}
        disabled={receivers.length === 0} onChange={value => {
          if (current) { update({ ...current, receiverId: value }); }
          else { setReceiver(value); }
        }} /></InspectorFieldRow>
      {current && <SchemaFields schema={FIELDS} value={fields} path="decal3d" onChange={value =>
        update(gameDecal3D.parse({ ...current, ...DECAL_FIELDS.parse(value) }))} />}
      {!current && <>
        {images.length === 0 && <Caption>{t("game.decal.empty.images")}</Caption>}
        {receivers.length === 0 && <Caption>{t("game.decal.empty.receivers")}</Caption>}
        {full && <Caption>{t("game.decal.empty.limit", { count: GAME_MAX_DECALS_3D })}</Caption>}
        <EditorButton disabled={!assetId || !receiverId || full} onClick={() => update(gameDecal3D.parse({ assetId, receiverId,
          size: { x: 1, y: 1, z: 0.25 } }))}>{t("game.decal.actions.addButton")}</EditorButton>
      </>}
    </FlexColumn>
  </InspectorSection>;
}
