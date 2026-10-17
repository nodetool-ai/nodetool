import { useMemo, type ReactNode } from "react";
import { Euler, Quaternion } from "three";
import { ZodError } from "zod";
import { GameOpError, gameDocumentOp3D, trackGameAuthoringEdits, validateGame3D, type GameDocumentOp3D } from "@nodetool-ai/game-runtime";
import { gameScene3D, gameEntity3D, type GameDocument3D } from "@nodetool-ai/protocol";
import CloseIcon from "@mui/icons-material/Close";
import CodeIcon from "@mui/icons-material/Code";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PublicOutlinedIcon from "@mui/icons-material/PublicOutlined";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import { diffGameDocuments3D } from "../../../../stores/game/diffGameDocuments3D";
import { Box, Caption, CONTROL, FieldDensityContext, FlexColumn, FlexRow, FONT_SIZE_SANS, InspectorFieldRow, InspectorSection, InspectorValueInput, Label, SPACING, Text, TextInput, ToolbarIconButton } from "../../../ui_primitives";
import ReportBugButton from "../../../support/ReportBugButton";
import SchemaFields from "../../inspector/SchemaFields";
import { GAME_COMPONENT_EDITORS } from "../../inspector/componentEditors";
import GameOverrideFields from "../../GameOverrideFields";
import ScriptParamsEditor from "../../inspector/editors/ScriptParamsEditor";
import CollisionMatrixEditor from "../../inspector/editors/CollisionMatrixEditor";
import PhysicsMaterialsEditor from "../../inspector/editors/PhysicsMaterialsEditor";
import EnvironmentPresetEditor from "../../inspector/editors/EnvironmentPresetEditor";
import DecalEditor3D from "../../inspector/editors/DecalEditor3D";
import { AddButton, RowAction } from "../../inspector/InspectorParts";
import { gameSchemaFields } from "../../inspector/schemaForm";

interface GameInspector3DProps {
  readonly document: GameDocument3D;
  readonly sceneId: string;
  readonly entityId?: string;
  readonly onOperationError: (message: string) => void;
  readonly onOps: (ops: GameDocumentOp3D[], label?: string) => void;
  readonly onScript: (index: number) => void;
}

const TRANSFORM_LABELS = { position: "Position", rotation: "Rotation", scale: "Scale" } as const;
const TRANSFORM_UNITS = { position: "Position in meters", rotation: "Rotation in degrees", scale: "Scale factor" } as const;
const ENTITY_FIELDS = gameSchemaFields(gameEntity3D.omit({ id: true, name: true, transform3d: true, behaviors: true, decal3d: true }));
const SCENE_FIELDS = gameSchemaFields(gameScene3D.omit({ id: true, entities: true }));
const ICON_SX = { fontSize: FONT_SIZE_SANS.title, color: "text.secondary", flexShrink: 0 } as const;
const ACTION_SX = { width: CONTROL.height.xs, height: CONTROL.height.xs, p: SPACING.none, flexShrink: 0, "& svg": { fontSize: "1.1em" } } as const;
const HEADER_SX = { py: SPACING.sm, minHeight: CONTROL.height.lg } as const;

export default function GameInspector3D({ document, sceneId, entityId, onOps, onOperationError, onScript }: GameInspector3DProps) {
  const scene = document.scenes.find((item) => item.id === sceneId);
  const entity = scene?.entities.find((item) => item.id === entityId);
  const validation = useMemo(() => validateGame3D(document), [document]);
  const physicsMaterialNames = useMemo(() => Object.keys(document.physicsMaterials ?? {}), [document.physicsMaterials]);
  const applyDocument = (next: GameDocument3D, label: string): void => {
    let ops: GameDocumentOp3D[];
    try {
      const authored = trackGameAuthoringEdits(document, next);
      if (authored.schemaVersion !== 3) { throw new Error("A 3D inspector cannot change game dimension"); }
      ops = diffGameDocuments3D(document, authored);
    } catch (error) {
      if (!(error instanceof GameOpError) && !(error instanceof ZodError)) { throw error; }
      onOperationError(error.message);
      return;
    }
    onOps(ops, label);
  };
  const apply = (set: unknown, label?: string): void => {
    if (!entity) { return; }
    onOps([gameDocumentOp3D.parse({ op: "update_entity", scene_id: sceneId, entity_id: entity.id, set })], label);
  };
  if (!entity) {
    const { id: _sceneId, entities: _entities, ...settings } = scene ?? {};
    return <FlexColumn sx={{ minHeight: 0, px: SPACING.lg }}>
      <FlexRow gap={SPACING.sm} align="center" sx={HEADER_SX}>
        <PublicOutlinedIcon sx={ICON_SX} />
        <FlexColumn sx={{ flex: 1, minWidth: 0 }}>
          <Text weight={500} truncate>{scene?.name ?? "Scene"}</Text>
          <Caption>Scene settings. Select an entity to edit it.</Caption>
        </FlexColumn>
      </FlexRow>
      {scene && <InspectorSection title="Environment preset"><EnvironmentPresetEditor sceneId={scene.id} onOps={onOps} /></InspectorSection>}
      {scene && <SchemaFields componentSections addLabel="Add setting" schema={SCENE_FIELDS}
        componentEditors={GAME_COMPONENT_EDITORS} dimension="3d"
        value={settings} assets={document.assets} onChange={(value) => {
          const updated = gameScene3D.parse({ ...gameScene3D.omit({ id: true, entities: true }).parse(value), id: scene.id, entities: scene.entities });
          applyDocument({ ...document, scenes: document.scenes.map((item) => item.id === sceneId ? updated : item) }, "Change Scene Settings");
        }} />}
      <InspectorSection title="Collision layers">
        <CollisionMatrixEditor document={document} onDocument={applyDocument} />
      </InspectorSection>
      <InspectorSection title="Physics materials">
        <PhysicsMaterialsEditor document={document} onDocument={applyDocument} />
      </InspectorSection>
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
  const replaceEntity = (updated: GameDocument3D["scenes"][number]["entities"][number], label: string): void => {
    applyDocument({ ...document, scenes: document.scenes.map((item) => item.id === sceneId ?
      { ...item, entities: item.entities.map((candidate) => candidate.id === entity.id ? updated : candidate) } : item) }, label);
  };
  const transformField = (kind: "position" | "scale" | "rotation", values: { x: number; y: number; z: number }): ReactNode =>
    <InspectorFieldRow label={<Box component="span" title={TRANSFORM_UNITS[kind]}>{TRANSFORM_LABELS[kind]}</Box>}>
      {(["x", "y", "z"] as const).map((axis) => <InspectorValueInput key={axis} ariaLabel={`${kind} ${axis}`} grow minWidth={CONTROL.height.xl}
        value={String(Math.round(values[axis] * 1000) / 1000)}
        onCommit={(value) => {
          const numeric = Number(value);
          if (!Number.isFinite(numeric) || (kind === "scale" && numeric <= 0)) { return; }
          if (kind === "rotation") {
            const updated = { ...rotation, [axis]: numeric };
            const quaternion = new Quaternion().setFromEuler(new Euler(updated.x * Math.PI / 180, updated.y * Math.PI / 180, updated.z * Math.PI / 180, "YXZ"));
            apply({ transform3d: { rotation: [quaternion.x, quaternion.y, quaternion.z, quaternion.w] } }, `Rotate ${entity.name || entity.id}`);
          } else { apply({ transform3d: { [kind]: { ...values, [axis]: numeric } } }, `${kind === "position" ? "Move" : "Scale"} ${entity.name || entity.id}`); }
        }} />)}
    </InspectorFieldRow>;
  const { id: _id, name: _name, transform3d: _transform, behaviors: _behaviors, ...components } = entity;
  return <FlexColumn sx={{ minHeight: 0, px: SPACING.lg }}>
    <FlexRow gap={SPACING.sm} align="center" sx={HEADER_SX}>
      <ViewInArOutlinedIcon sx={ICON_SX} />
      <FieldDensityContext.Provider value="compact">
        <TextInput label="Name" hideLabel compact value={entity.name} placeholder={entity.id} title={`ID: ${entity.id}`} sx={{ flex: 1, minWidth: 0 }}
          onChange={(event) => replaceEntity({ ...entity, name: event.target.value }, "Rename Entity")} />
      </FieldDensityContext.Provider>
      <ToolbarIconButton icon={<DeleteOutlineIcon fontSize="small" />} tooltip="Delete entity" variant="error" sx={ACTION_SX}
        onClick={() => onOps([{ op: "remove_entity", scene_id: sceneId, entity_id: entity.id }])} />
    </FlexRow>
    <GameOverrideFields document={document} sceneId={sceneId} entityId={entity.id} onOps={onOps} />
    <DecalEditor3D key={entity.id} document={document} sceneId={sceneId} entityId={entity.id} onOps={onOps} />
    <SchemaFields schema={ENTITY_FIELDS} value={components} path="entity" assets={document.assets} componentSections
      componentEditors={GAME_COMPONENT_EDITORS} dimension="3d"
      collisionLayers={document.collisionLayers} physicsMaterials={physicsMaterialNames} beforeSections={<InspectorSection title="Transform">
        {transformField("position", position)}
        {transformField("rotation", rotation)}
        {transformField("scale", scale)}
      </InspectorSection>} onChange={(value) => {
        const updated = gameEntity3D.parse({ ...gameEntity3D.omit({ id: true, name: true, transform3d: true, behaviors: true }).parse(value),
          id: entity.id, name: entity.name, transform3d: entity.transform3d, behaviors: entity.behaviors });
        replaceEntity(updated, updated.light3d && entity.light3d?.intensity !== updated.light3d.intensity ? "Change Light Intensity" : "Change Entity Components");
      }} />
    <InspectorSection title="Behaviors">
      {entity.behaviors.length === 0 && <Caption>No behaviors yet.</Caption>}
      {entity.behaviors.map((behavior, index) => <FlexColumn key={`${behavior.kind}:${index}`} gap={SPACING.xs} sx={{ width: "100%", minWidth: 0 }}>
        <FlexRow gap={SPACING.xs} align="center" sx={{ minHeight: CONTROL.height.sm }}>
          <Label component="span" sx={{ mb: 0, flex: 1, minWidth: 0, color: "text.primary" }}>{index + 1}. {behavior.kind}</Label>
          {behavior.kind === "script" && <RowAction icon={<CodeIcon />} label="Edit script" onClick={() => onScript(index)} />}
          <RowAction icon={<CloseIcon />} label="Remove behavior" onClick={() => onOps([{ op: "remove_behavior", scene_id: sceneId, entity_id: entity.id, index }])} />
        </FlexRow>
        {behavior.kind === "script" && behavior.params && <ScriptParamsEditor params={behavior.params} values={behavior.values} assets={document.assets}
          entities={scene?.entities ?? []} issues={validation.issues}
          issuePath={["scenes", document.scenes.findIndex((item) => item.id === sceneId), "entities", scene?.entities.indexOf(entity) ?? -1, "behaviors", index]} onValues={(values) => onOps([{ op: "set_script_params", scene_id: sceneId, entity_id: entity.id, index, values }])} />}
        {behavior.kind !== "script" && <SchemaFields schema={gameSchemaFields(gameEntity3D.shape.behaviors.unwrap().element)} value={behavior}
          onChange={(value) => onOps([gameDocumentOp3D.parse({ op: "update_behavior", scene_id: sceneId, entity_id: entity.id, index, behavior: value })])} />}
      </FlexColumn>)}
      <AddButton onClick={() => onOps([{ op: "add_behavior", scene_id: sceneId, entity_id: entity.id,
        behavior: { kind: "script", source: '(input) => ({ state: input.state, commands: [] })' } }])}>Add script</AddButton>
    </InspectorSection>
  </FlexColumn>;
}
