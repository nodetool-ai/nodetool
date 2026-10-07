import type { ReactNode } from "react";
import { Euler, Quaternion } from "three";
import { ZodError } from "zod";
import { GameOpError, gameDocumentOp3D, trackGameAuthoringEdits, validateGame3D, type GameDocumentOp3D } from "@nodetool-ai/game-runtime";
import { gameScene3D, gameEntity3D, type GameDocument3D } from "@nodetool-ai/protocol";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PublicOutlinedIcon from "@mui/icons-material/PublicOutlined";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import { diffGameDocuments3D } from "../../../../stores/game/diffGameDocuments3D";
import { Box, Caption, CollapsibleSection, CONTROL, EditorButton, FlexColumn, FlexRow, FONT_SIZE_SANS, InspectorFieldRow, InspectorValueInput, SPACING, Text, ToolbarIconButton } from "../../../ui_primitives";
import ReportBugButton from "../../../support/ReportBugButton";
import SchemaFields from "../../inspector/SchemaFields";
import { COMPONENT_SECTION_SX } from "../../inspector/componentSection";
import GameOverrideFields from "../../GameOverrideFields";
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
const ENTITY_FIELDS = gameSchemaFields(gameEntity3D.omit({ id: true, transform3d: true, behaviors: true }));

export default function GameInspector3D({ document, sceneId, entityId, onOps, onOperationError, onScript }: GameInspector3DProps) {
  const scene = document.scenes.find((item) => item.id === sceneId);
  const entity = scene?.entities.find((item) => item.id === entityId);
  const validation = validateGame3D(document);
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
    return <FlexColumn sx={{ minHeight: 0 }}>
      <FlexRow gap={SPACING.sm} align="center" sx={{ px: SPACING.md, py: SPACING.sm }}>
        <PublicOutlinedIcon sx={{ fontSize: FONT_SIZE_SANS.title, color: "text.secondary" }} />
        <FlexColumn sx={{ flex: 1, minWidth: 0 }}>
          <Text weight={500} truncate>{scene?.name ?? "Scene"}</Text>
          <Caption>Scene settings. Select an entity to edit it.</Caption>
        </FlexColumn>
      </FlexRow>
      {scene && <SchemaFields componentSections schema={gameSchemaFields(gameScene3D.omit({ id: true, entities: true }))}
        value={settings} assets={document.assets} onChange={(value) => {
          const updated = gameScene3D.parse({ ...gameScene3D.omit({ id: true, entities: true }).parse(value), id: scene.id, entities: scene.entities });
          applyDocument({ ...document, scenes: document.scenes.map((item) => item.id === sceneId ? updated : item) }, "Change Scene Settings");
        }} />}
      {validation.diagnostics.map((issue, index) => <Caption key={`${issue.code}:${index}`} color="error" sx={{ px: SPACING.md }}>{issue.path.join(".")}: {issue.message}</Caption>)}
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
    <InspectorFieldRow label={<Box component="span" title={TRANSFORM_UNITS[kind]}>{TRANSFORM_LABELS[kind]}</Box>}>
      {(["x", "y", "z"] as const).map((axis) => <FlexRow key={axis} sx={{ flex: 1, minWidth: 0 }}>
        <InspectorValueInput ariaLabel={`${kind} ${axis}`} grow minWidth={CONTROL.height.xl} value={String(Math.round(values[axis] * 1000) / 1000)}
          onCommit={(value) => {
            const numeric = Number(value);
            if (!Number.isFinite(numeric) || (kind === "scale" && numeric <= 0)) { return; }
            if (kind === "rotation") {
              const updated = { ...rotation, [axis]: numeric };
              const quaternion = new Quaternion().setFromEuler(new Euler(updated.x * Math.PI / 180, updated.y * Math.PI / 180, updated.z * Math.PI / 180, "YXZ"));
              apply({ transform3d: { rotation: [quaternion.x, quaternion.y, quaternion.z, quaternion.w] } }, `Rotate ${entity.name || entity.id}`);
            } else { apply({ transform3d: { [kind]: { ...values, [axis]: numeric } } }, `${kind === "position" ? "Move" : "Scale"} ${entity.name || entity.id}`); }
          }} />
      </FlexRow>)}
    </InspectorFieldRow>;
  const { id: _id, transform3d: _transform, behaviors: _behaviors, ...components } = entity;
  return <FlexColumn sx={{ minHeight: 0 }}>
    <FlexRow gap={SPACING.sm} align="center" sx={{ px: SPACING.md, py: SPACING.sm }}>
      <ViewInArOutlinedIcon sx={{ fontSize: FONT_SIZE_SANS.title, color: "text.secondary" }} />
      <FlexColumn sx={{ flex: 1, minWidth: 0 }}>
        <Text weight={500} truncate>{entity.name || entity.id}</Text>
        <Caption sx={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={entity.id}>{entity.id}</Caption>
      </FlexColumn>
      <ToolbarIconButton icon={<DeleteOutlineIcon fontSize="small" />} tooltip="Delete entity" variant="error"
        onClick={() => onOps([{ op: "remove_entity", scene_id: sceneId, entity_id: entity.id }])} />
    </FlexRow>
    <Box sx={{ px: SPACING.md, pb: SPACING.xs }}>
      <GameOverrideFields document={document} sceneId={sceneId} entityId={entity.id} onOps={onOps} />
    </Box>
    <CollapsibleSection title="Transform" compact sx={COMPONENT_SECTION_SX}>
      <FlexColumn gap={SPACING.xs} sx={{ px: SPACING.md, py: SPACING.sm }}>
        {transformField("position", position)}
        {transformField("rotation", rotation)}
        {transformField("scale", scale)}
      </FlexColumn>
    </CollapsibleSection>
    <SchemaFields schema={ENTITY_FIELDS} value={components} path="entity" assets={document.assets} componentSections
      collisionLayers={document.collisionLayers} onChange={(value) => {
        const updated = gameEntity3D.parse({ ...gameEntity3D.omit({ id: true, transform3d: true, behaviors: true }).parse(value),
          id: entity.id, transform3d: entity.transform3d, behaviors: entity.behaviors });
        applyDocument({ ...document, scenes: document.scenes.map((item) => item.id === sceneId ?
          { ...item, entities: item.entities.map((candidate) => candidate.id === entity.id ? updated : candidate) } : item) },
        updated.light3d && entity.light3d?.intensity !== updated.light3d.intensity ? "Change Light Intensity" : "Change Entity Components");
      }} />
    <CollapsibleSection title="Behaviors" compact sx={COMPONENT_SECTION_SX}>
      <FlexColumn gap={SPACING.sm} sx={{ px: SPACING.md, py: SPACING.sm }}>
        {entity.behaviors.length === 0 && <Caption>No behaviors yet.</Caption>}
        {entity.behaviors.map((behavior, index) => <FlexColumn key={`${behavior.kind}:${index}`} gap={SPACING.xs}>
          <FlexRow gap={SPACING.xs} align="center"><Caption sx={{ flex: 1 }}>{behavior.kind}</Caption>
            {behavior.kind === "script" && <EditorButton onClick={() => onScript(index)}>Edit script</EditorButton>}
            <EditorButton onClick={() => onOps([{ op: "remove_behavior", scene_id: sceneId, entity_id: entity.id, index }])}>Remove</EditorButton>
          </FlexRow>
          {behavior.kind !== "script" && <SchemaFields schema={gameSchemaFields(gameEntity3D.shape.behaviors.unwrap().element)} value={behavior}
            onChange={(value) => onOps([gameDocumentOp3D.parse({ op: "update_behavior", scene_id: sceneId, entity_id: entity.id, index, behavior: value })])} />}
        </FlexColumn>)}
        <EditorButton variant="outlined" startIcon={<AddIcon fontSize="small" />} onClick={() => onOps([{ op: "add_behavior", scene_id: sceneId, entity_id: entity.id,
          behavior: { kind: "script", source: '(input) => ({ state: input.state, commands: [] })' } }])}>Add script</EditorButton>
      </FlexColumn>
    </CollapsibleSection>
  </FlexColumn>;
}
