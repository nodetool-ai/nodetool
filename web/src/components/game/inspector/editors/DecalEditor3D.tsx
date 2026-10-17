import { useState } from "react";
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
      value === null ? "Remove decal" : current ? "Change decal" : "Add decal");
  };
  const fields = current ? { size: current.size, opacity: current.opacity, renderOrder: current.renderOrder } : undefined;
  return <InspectorSection title="Decal" action={current ? { icon: <CloseIcon />, label: "Remove decal", onClick: () => update(null) } : undefined}>
    <FlexColumn gap={SPACING.sm}>
      <InspectorFieldRow label="Image"><InspectorSelect grow label="Decal image" value={assetId} options={images}
        disabled={images.length === 0} onChange={value => {
          if (current) { update({ ...current, assetId: value }); }
          else { setImage(value); }
        }} /></InspectorFieldRow>
      <InspectorFieldRow label="Receiver"><InspectorSelect grow label="Decal receiver" value={receiverId} options={receivers}
        disabled={receivers.length === 0} onChange={value => {
          if (current) { update({ ...current, receiverId: value }); }
          else { setReceiver(value); }
        }} /></InspectorFieldRow>
      {current && <SchemaFields schema={FIELDS} value={fields} path="decal3d" onChange={value =>
        update(gameDecal3D.parse({ ...current, ...DECAL_FIELDS.parse(value) }))} />}
      {!current && <>
        {images.length === 0 && <Caption>Install an image asset to add a decal.</Caption>}
        {receivers.length === 0 && <Caption>Add a primitive or rigid model receiver in this scene.</Caption>}
        {full && <Caption>This scene already has {GAME_MAX_DECALS_3D} decals.</Caption>}
        <EditorButton disabled={!assetId || !receiverId || full} onClick={() => update(gameDecal3D.parse({ assetId, receiverId,
          size: { x: 1, y: 1, z: 0.25 } }))}>Add decal</EditorButton>
      </>}
    </FlexColumn>
  </InspectorSection>;
}
