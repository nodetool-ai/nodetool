import { useState } from "react";
import { useTranslation } from "react-i18next";
import { gameAssetBinding, gameBehavior, gameDocument, gameEntity, gameRenderEffect, gameScene, type GameDocument, type GameEntity, type GameRenderEffect } from "@nodetool-ai/protocol/game.js";
import { gameParticles } from "@nodetool-ai/protocol";
import { validateGame, type GameDocumentOp, type GameValidationIssue } from "@nodetool-ai/game-runtime";

import AddIcon from "@mui/icons-material/Add";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import CloseIcon from "@mui/icons-material/Close";
import CodeIcon from "@mui/icons-material/Code";

import { Caption, Divider, FieldDensityContext, FlexColumn, InspectorFieldRow, InspectorSection, InspectorSelect, SPACING, TabGroup, Text, TextInput } from "../../../ui_primitives";
import SchemaFields from "../../inspector/SchemaFields";
import { GAME_COMPONENT_EDITORS } from "../../inspector/componentEditors";
import InspectorAddMenu from "../../inspector/InspectorAddMenu";
import { AddButton, FieldGroup, RowAction } from "../../inspector/InspectorParts";
import GameOverrideFields from "../../GameOverrideFields";
import ScriptParamsEditor from "../../inspector/editors/ScriptParamsEditor";
import { gameSchemaFields, schemaVariant } from "../../inspector/schemaForm";

import { parentCandidates, reparentTransform } from "../../viewport2d/viewportGeometry";

interface GameInspectorProps {
  document: GameDocument;
  activeSceneId: string;
  selectedIds: readonly string[];
  issues?: readonly GameValidationIssue[];
  onOps: (ops: GameDocumentOp[]) => void;
  onSceneChange: (sceneId: string) => void;
  onEditScript: (sceneId: string, entityId: string, index: number) => void;
}

const ENTITY_SCHEMA = gameSchemaFields(gameEntity);
const SCENE_SCHEMA = gameSchemaFields(gameScene);
const DOCUMENT_SCHEMA = gameSchemaFields(gameDocument);
const BEHAVIOR_SCHEMA = gameSchemaFields(gameBehavior);
const EFFECT_SCHEMA = gameSchemaFields(gameRenderEffect);
const ASSET_SCHEMA = gameSchemaFields(gameAssetBinding);
const COMPONENTS = ["sprite", "tilemap", "camera2d", "body2d", "collider2d", "animator", "visualAnimation", "audioSource", "light2d", "particles"] as const;
const BEHAVIORS = ["movement", "patrol", "collectible", "health", "trigger", "spawn", "sceneTransition", "winWhenCollected", "lifetime", "script"] as const;
const EFFECTS = ["bloom", "lut", "brightnessContrast"] as const;
const DEFAULT_GAME_LIGHT_COLOR = "#ffffff";

type ComponentKind = typeof COMPONENTS[number];

function displayKind(kind: string, t: ReturnType<typeof useTranslation>["t"]): string {
  const translated = t(`i18n-cont-game-06.kinds.${kind}`);
  return translated === `i18n-cont-game-06.kinds.${kind}`
    ? kind.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([a-z])2d\b/i, "$1 2D").replace(/^lut$/, "LUT").replace(/^./, (letter) => letter.toUpperCase())
    : translated;
}

function issueAt(issues: readonly GameValidationIssue[], path: readonly (string | number)[]): string | undefined {
  return issues.find((issue) => issue.path.length === path.length && issue.path.every((part, index) => path[index] === part))?.message;
}

function firstSlot(document: GameDocument, kind: "image" | "audio"): string | undefined {
  return Object.entries(document.assets).find(([, binding]) => binding.mediaKind === kind)?.[0];
}

function newComponent(kind: ComponentKind, document: GameDocument): GameEntity[ComponentKind] {
  const image = firstSlot(document, "image") ?? "";
  const audio = firstSlot(document, "audio") ?? "";
  switch (kind) {
    case "sprite": return { assetId: image, width: 1, height: 1, layer: 0 };
    case "tilemap": return { assetId: image, tiles: [], layer: 0 };
    case "camera2d": return { zoom: 1, width: 16, height: 9 };
    case "body2d": return { type: "static", velocity: { x: 0, y: 0 } };
    case "collider2d": return { width: 1, height: 1, sensor: false, category: 1, mask: 0xffffffff };
    case "animator": return { frames: [{ x: 0, y: 0, width: 1, height: 1 }], ticksPerFrame: 6, loop: true };
    case "visualAnimation": return { tracks: [] };
    case "audioSource": return { assetId: audio, onEvent: "play", volume: 1 };
    case "light2d": return { color: DEFAULT_GAME_LIGHT_COLOR, intensity: 1, radius: 3, falloff: 1 };
    case "particles": return gameParticles.parse({ emitters: [{ id: "emitter" }] });
  }
}

function newBehavior(kind: string, document: GameDocument): GameEntity["behaviors"][number] | null {
  const action = document.inputActions;
  switch (kind) {
    case "movement": return { kind, speed: 2, left: action[0] ?? "left", right: action[1] ?? "right", up: action[2] ?? "up", down: action[3] ?? "down" };
    case "patrol": return { kind, speed: 1, distance: 2, axis: "x" };
    case "collectible": return { kind, score: 1 };
    case "health": return { kind, maximum: 1 };
    case "trigger": return { kind, event: "trigger" };
    case "spawn": return { kind, prefabId: document.scenes.flatMap((scene) => scene.entities).find((entity) => entity.templateOnly)?.id ?? "", onEvent: "spawn" };
    case "sceneTransition": return { kind, sceneId: document.entrySceneId, onEvent: "transition" };
    case "winWhenCollected": return { kind, count: 1 };
    case "lifetime": return { kind, ticks: 60, fade: true, endScale: 1 };
    case "script": return { kind, source: "/** @type {GameScript} */\n({ state }) => ({ state, commands: [] })", maxCommands: 16, maxTickMs: 8 };
    default: return null;
  }
}

function newEffect(kind: typeof EFFECTS[number], document: GameDocument): GameRenderEffect | null {
  switch (kind) {
    case "bloom": return { kind, threshold: 0.7, softness: 0.1, radius: 8, intensity: 1, required: false };
    case "brightnessContrast": return { kind, brightness: 0, contrast: 1, required: false };
    case "lut": {
      const slot = Object.entries(document.assets).find(([, binding]) => binding.mediaKind === "image" && binding.width === binding.height * binding.height)?.[0];
      if (!slot) return null;
      const size = document.assets[slot].height;
      return { kind, assetId: slot, size, intensity: 1, domainMin: [0, 0, 0], domainMax: [1, 1, 1], required: false };
    }
  }
}


/** Up, down and remove actions for one entry of an ordered list. */
function OrderActions({ index, count, removeLabel, onMove, onRemove }: { index: number; count: number; removeLabel: string; onMove: (to: number) => void; onRemove: () => void }) {
  const { t } = useTranslation();
  return <>
    <RowAction icon={<ArrowUpwardIcon />} label={t("i18n-cont-game-06.common.moveUp")} disabled={index === 0} onClick={() => onMove(index - 1)} />
    <RowAction icon={<ArrowDownwardIcon />} label={t("i18n-cont-game-06.common.moveDown")} disabled={index === count - 1} onClick={() => onMove(index + 1)} />
    <RowAction icon={<CloseIcon />} label={removeLabel} onClick={onRemove} />
  </>;
}

export default function GameInspector({ document, activeSceneId, selectedIds, issues = [], onOps, onSceneChange, onEditScript }: GameInspectorProps) {
  const { t, i18n } = useTranslation();
  const formatCount = (count: number): string => new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language).format(count);
  const [tab, setTab] = useState<"selection" | "game">("selection");
  const [localEffectIssues, setLocalEffectIssues] = useState<readonly GameValidationIssue[]>([]);
  const [newSlot, setNewSlot] = useState("");
  const selectedId = selectedIds[0];
  const scene = document.scenes.find((entry) => entry.id === activeSceneId);
  const sceneIndex = document.scenes.findIndex((entry) => entry.id === scene?.id);
  const entity = scene?.entities.find((entry) => entry.id === selectedId);
  const entityIndex = scene?.entities.findIndex((entry) => entry.id === selectedId) ?? -1;
  const target = entity && scene ? { entity_id: entity.id, scene_id: scene.id } : null;
  const entityPath = ["scenes", sceneIndex, "entities", entityIndex] as const;
  const scenePath = ["scenes", sceneIndex] as const;
  const update = (set: Extract<GameDocumentOp, { op: "update_entity" }>["set"]) => {
    if (target) onOps([{ op: "update_entity", ...target, set }]);
  };
  const effects = document.renderEffects ?? [];
  const visibleIssues = [...issues, ...localEffectIssues];
  const setEffects = (next: GameRenderEffect[], order = document.hudEffectOrder) => {
    const effectIssues = validateGame({ ...document, renderEffects: next, hudEffectOrder: order }).issues
      .filter((issue) => issue.path[0] === "renderEffects");
    setLocalEffectIssues(effectIssues);
    if (effectIssues.length === 0) onOps([{ op: "set_effects", effects: next, hud_effect_order: order }]);
  };
  const lutReady = Object.values(document.assets).some((binding) => binding.mediaKind === "image" && binding.width === binding.height * binding.height);
  const slotName = newSlot.trim();
  const addBinding = (): void => {
    const binding = Object.values(document.assets)[0];
    if (binding && slotName && !document.assets[slotName]) {
      onOps([{ op: "bind_asset", slot: slotName, binding: { ...binding } }]);
      setNewSlot("");
    }
  };

  const inspectedName = tab === "game" ? t("i18n-cont-game-06.inspector.gameSettings") : entity?.name || entity?.id || scene?.name || t("i18n-cont-game-06.inspector.scene");
  const inspectedId = tab === "game" ? undefined : entity?.id ?? scene?.id;

  return <FlexColumn sx={{ minHeight: 0, height: "100%" }}>
    <FlexColumn gap={SPACING.micro} sx={{ px: SPACING.lg, py: SPACING.sm }}>
      <Text weight={500} truncate>{inspectedName}</Text>
      {inspectedId && <Caption title={inspectedId} sx={{ overflowWrap: "anywhere" }}>{t("i18n-cont-game-06.inspector.id", { id: inspectedId })}</Caption>}
    </FlexColumn>
    <TabGroup aria-label={t("i18n-cont-game-06.inspector.title")} size="small" fullWidth value={tab} onChange={(value) => setTab(value === "game" ? "game" : "selection")}
      tabs={[{ value: "selection", label: entity ? t("i18n-cont-game-06.inspector.entity") : t("i18n-cont-game-06.inspector.scene") }, { value: "game", label: t("i18n-cont-game-06.inspector.game") }]} />
    <Divider />
    <FlexColumn gap={SPACING.xs} sx={{ minHeight: 0, overflowY: "auto", px: SPACING.lg, py: SPACING.sm }}>
    {tab === "game" ? <>
      <SchemaFields schema={DOCUMENT_SCHEMA.properties?.pixelsPerUnit ?? { type: "number" }} value={document.pixelsPerUnit} path="pixelsPerUnit"
        issuePath={["pixelsPerUnit"]} issues={issues} onChange={(value) => onOps([{ op: "set_game", pixels_per_unit: Number(value) }])} />
      <InspectorFieldRow label={t("i18n-cont-game-06.inspector.entryScene")}><InspectorSelect grow label={t("i18n-cont-game-06.inspector.entryScene")} value={document.entrySceneId} options={document.scenes.map((item) => ({ value: item.id, label: item.name }))}
        onChange={(value) => onOps([{ op: "set_game", entry_scene_id: value }])} /></InspectorFieldRow>
      {issueAt(issues, ["entrySceneId"]) && <Caption color="error">{issueAt(issues, ["entrySceneId"])}</Caption>}
      <InspectorSection title={t("i18n-cont-game-06.inspector.inputActions")}>
        <SchemaFields schema={DOCUMENT_SCHEMA.properties?.inputActions ?? { type: "array", items: { type: "string" } }} value={document.inputActions}
          path="inputActions" issuePath={["inputActions"]} issues={issues}
          onChange={(value) => onOps([{ op: "set_game", input_actions: value as string[] }])} />
      </InspectorSection>
      <InspectorSection title={t("i18n-cont-game-06.inspector.collisionLayerNames")}>
        <SchemaFields schema={DOCUMENT_SCHEMA.properties?.collisionLayers ?? { type: "array", items: { type: "string" } }} value={document.collisionLayers ?? []}
          path="collisionLayers" issuePath={["collisionLayers"]} issues={issues}
          onChange={(value) => onOps([{ op: "set_game", collision_layers: value as string[] }])} />
      </InspectorSection>
      <InspectorSection title={t("i18n-cont-game-06.inspector.effects")}>
        {effects.map((effect, index) => <FieldGroup key={`${effect.kind}:${index}`} title={`${index + 1}. ${displayKind(effect.kind, t)}`} actions={<OrderActions index={index} count={effects.length} removeLabel={t("i18n-cont-game-06.inspector.removeEffect")}
          onMove={(to) => { const next = [...effects]; [next[to], next[index]] = [next[index], next[to]]; setEffects(next); }}
          onRemove={() => setEffects(effects.filter((_, position) => position !== index))} />}>
          <SchemaFields schema={schemaVariant(EFFECT_SCHEMA, effect)} value={effect} path={`renderEffects.${index}`}
            issuePath={["renderEffects", index]} issues={visibleIssues} assets={document.assets}
            onChange={(value) => setEffects(effects.map((entry, position) => position === index ? value as GameRenderEffect : entry))} />
        </FieldGroup>)}
        <InspectorFieldRow label={t("i18n-cont-game-06.inspector.hudEffectOrder")}><InspectorSelect grow label={t("i18n-cont-game-06.inspector.hudEffectOrder")} value={document.hudEffectOrder ?? "beforeEffects"}
          options={[{ value: "beforeEffects", label: t("i18n-cont-game-06.inspector.beforeEffects") }, { value: "afterEffects", label: t("i18n-cont-game-06.inspector.afterEffects") }]}
          onChange={(value) => setEffects(effects, value as GameDocument["hudEffectOrder"])} /></InspectorFieldRow>
        <InspectorAddMenu label={t("i18n-cont-game-06.inspector.addEffect")} disabled={effects.length >= 8}
          options={EFFECTS.map((kind) => ({ value: kind, label: displayKind(kind, t), disabled: kind === "lut" && !lutReady }))}
          onSelect={(kind) => { const effect = newEffect(kind as typeof EFFECTS[number], document); if (effect) setEffects([...effects, effect]); }} />
      </InspectorSection>
      <InspectorSection title={t("i18n-cont-game-06.inspector.assetBindings")}>
        {Object.entries(document.assets).map(([slot, binding]) => <FieldGroup key={slot} title={slot}
          actions={<RowAction icon={<CloseIcon />} label={t("i18n-cont-game-06.inspector.unbindAsset", { slot })} onClick={() => onOps([{ op: "unbind_asset", slot }])} />}>
          <SchemaFields schema={ASSET_SCHEMA} value={binding} path={`assets.${slot}`} issuePath={["assets", slot]} issues={issues}
            onChange={(value) => {
              const next = value as typeof binding;
              const adjusted = { ...next };
              if (adjusted.mediaKind === "font") adjusted.fontFormat = adjusted.fontFormat ?? "ttf";
              else delete adjusted.fontFormat;
              onOps([{ op: "bind_asset", slot, binding: adjusted }]);
            }} />
        </FieldGroup>)}
        <InspectorFieldRow label={t("i18n-cont-game-06.inspector.newAssetSlot")}>
          <FieldDensityContext.Provider value="compact">
            <TextInput label={t("i18n-cont-game-06.inspector.newAssetSlot")} hideLabel compact value={newSlot} sx={{ flex: 1, minWidth: 0 }} onChange={(event) => setNewSlot(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") addBinding(); }} />
          </FieldDensityContext.Provider>
          <RowAction icon={<AddIcon />} label={t("i18n-cont-game-06.inspector.addBinding")} disabled={!slotName || Boolean(document.assets[slotName]) || Object.keys(document.assets).length === 0} onClick={addBinding} />
        </InspectorFieldRow>
      </InspectorSection>
    </> : entity && target && scene ? <>
      <GameOverrideFields document={document} sceneId={scene.id} entityId={entity.id} onOps={onOps} />
      <SchemaFields schema={ENTITY_SCHEMA.properties?.name ?? { type: "string" }} value={entity.name} path={t("i18n-cont-game-06.common.name")}
        issuePath={[...entityPath, "name"]} issues={issues} onChange={(value) => update({ name: String(value) })} />
      <InspectorFieldRow label={t("i18n-cont-game-06.inspector.parent")}><InspectorSelect grow label={t("i18n-cont-game-06.inspector.parent")} value={entity.parentId ?? ""}
        options={[{ value: "", label: t("i18n-cont-game-06.common.none") }, ...parentCandidates(scene, entity.id).map((entry) => ({ value: entry.id, label: entry.name || entry.id }))]}
        onChange={(value) => update({ parentId: value || null, transform2d: reparentTransform(scene, entity.id, value || undefined) })} /></InspectorFieldRow>
      {issueAt(issues, [...entityPath, "parentId"]) && <Caption color="error">{issueAt(issues, [...entityPath, "parentId"])}</Caption>}
      <SchemaFields schema={ENTITY_SCHEMA.properties?.templateOnly ?? { type: "boolean" }} value={entity.templateOnly} path={t("i18n-cont-game-06.inspector.prefabOnly")}
        issuePath={[...entityPath, "templateOnly"]} issues={issues} onChange={(value) => update({ templateOnly: Boolean(value) })} />
      <InspectorSection title={t("i18n-cont-game-06.inspector.transform")}>
        <SchemaFields schema={ENTITY_SCHEMA.properties?.transform2d ?? { type: "object" }} value={entity.transform2d} path="transform2d"
          issuePath={[...entityPath, "transform2d"]} issues={issues} onChange={(value) => update({ transform2d: value as GameEntity["transform2d"] })} />
      </InspectorSection>
      {COMPONENTS.map((component) => entity[component] && <InspectorSection key={component} title={displayKind(component, t)}
        action={{ icon: <CloseIcon />, label: t("i18n-cont-game-06.inspector.removeItem", { item: displayKind(component, t) }), onClick: () => update({ [component]: null } as Extract<GameDocumentOp, { op: "update_entity" }>["set"]) }}>
        <SchemaFields schema={ENTITY_SCHEMA.properties?.[component] ?? { type: "object" }} value={entity[component]} path={component}
          componentName={component} componentEditors={GAME_COMPONENT_EDITORS} dimension="2d"
          issuePath={[...entityPath, component]} issues={issues} assets={document.assets} collisionLayers={document.collisionLayers}
          onChange={(value) => update({ [component]: value } as Extract<GameDocumentOp, { op: "update_entity" }>["set"])} />
      </InspectorSection>)}
      <FlexColumn sx={{ pt: SPACING.xs, pb: SPACING.sm, borderTop: 1, borderColor: "divider" }}>
        <InspectorAddMenu label={t("i18n-cont-game-06.inspector.addComponent")} options={COMPONENTS.filter((component) => !entity[component]).map((component) => ({ value: component, label: displayKind(component, t),
          disabled: (component === "particles" && document.schemaVersion < 2) || ((component === "sprite" || component === "tilemap") && !firstSlot(document, "image")) || (component === "audioSource" && !firstSlot(document, "audio")) }))}
          onSelect={(component) => update({ [component]: newComponent(component as ComponentKind, document) } as Extract<GameDocumentOp, { op: "update_entity" }>["set"])} />
      </FlexColumn>
      <InspectorSection title={t("i18n-cont-game-06.inspector.behaviors")}>
        {entity.behaviors.length === 0 && <Caption>{t("i18n-cont-game-06.inspector.noBehaviors")}</Caption>}
        {entity.behaviors.map((behavior, index) => <FieldGroup key={`${behavior.kind}:${index}`} title={`${index + 1}. ${displayKind(behavior.kind, t)}`}
          actions={<>
            {behavior.kind === "script" && <RowAction icon={<CodeIcon />} label={t("i18n-cont-game-06.inspector.editScript")} onClick={() => onEditScript(scene.id, entity.id, index)} />}
            <OrderActions index={index} count={entity.behaviors.length} removeLabel={t("i18n-cont-game-06.inspector.removeBehavior")}
              onMove={(to) => onOps([{ op: "move_behavior", ...target, index, to_index: to }])} onRemove={() => onOps([{ op: "remove_behavior", ...target, index }])} />
          </>}>
          {behavior.kind === "script" ? <>
            <InspectorFieldRow label={t("i18n-cont-game-06.inspector.source")}><Caption>{t("i18n-cont-game-06.inspector.bytes", {
              count: new TextEncoder().encode(behavior.source).length, formattedCount: formatCount(new TextEncoder().encode(behavior.source).length)
            })}</Caption></InspectorFieldRow>
            <SchemaFields schema={BEHAVIOR_SCHEMA.oneOf?.find((variant) => variant.properties?.kind?.const === "script")?.properties?.maxCommands ?? { type: "integer" }}
              value={behavior.maxCommands} path="maxCommands" issuePath={[...entityPath, "behaviors", index, "maxCommands"]} issues={issues}
              onChange={(value) => onOps([{ op: "update_behavior", ...target, index, behavior: { maxCommands: value } }])} />
            <SchemaFields schema={BEHAVIOR_SCHEMA.oneOf?.find((variant) => variant.properties?.kind?.const === "script")?.properties?.maxTickMs ?? { type: "integer" }}
              value={behavior.maxTickMs} path="maxTickMs" issuePath={[...entityPath, "behaviors", index, "maxTickMs"]} issues={issues}
              onChange={(value) => onOps([{ op: "update_behavior", ...target, index, behavior: { maxTickMs: value } }])} />
            {behavior.params && <ScriptParamsEditor params={behavior.params} values={behavior.values} assets={document.assets} entities={scene.entities}
              issuePath={[...entityPath, "behaviors", index]} issues={issues} onValues={(values) => onOps([{ op: "set_script_params", ...target, index, values }])} />}
          </> : <SchemaFields schema={schemaVariant(BEHAVIOR_SCHEMA, behavior)} value={behavior} path={`behaviors.${index}`}
            issuePath={[...entityPath, "behaviors", index]} issues={issues} assets={document.assets}
            onChange={(value) => onOps([{ op: "update_behavior", ...target, index, behavior: value as Record<string, unknown> }])} />}
        </FieldGroup>)}
        <InspectorAddMenu label={t("i18n-cont-game-06.inspector.addBehavior")} options={BEHAVIORS.map((kind) => ({ value: kind, label: displayKind(kind, t),
          disabled: kind === "spawn" && !document.scenes.some((entry) => entry.entities.some((item) => item.templateOnly)) }))}
          onSelect={(kind) => { const behavior = newBehavior(kind, document); if (behavior) onOps([{ op: "add_behavior", ...target, behavior }]); }} />
      </InspectorSection>
    </> : scene ? <>
      <InspectorFieldRow label={t("i18n-cont-game-06.inspector.scene")}><InspectorSelect grow label={t("i18n-cont-game-06.inspector.scene")} value={scene.id} options={document.scenes.map((entry) => ({ value: entry.id, label: entry.name }))} onChange={onSceneChange} /></InspectorFieldRow>
      <SchemaFields schema={SCENE_SCHEMA.properties?.name ?? { type: "string" }} value={scene.name} path={t("i18n-cont-game-06.common.name")}
        issuePath={[...scenePath, "name"]} issues={issues}
        onChange={(value) => onOps([{ op: "update_scene", scene_id: scene.id, set: { name: String(value) } }])} />
      <InspectorSection title={t("i18n-cont-game-06.inspector.music")} action={scene.music ? { icon: <CloseIcon />, label: t("i18n-cont-game-06.inspector.removeMusic"),
        onClick: () => onOps([{ op: "update_scene", scene_id: scene.id, set: { music: null } }]) } : undefined}>
        {scene.music ? <SchemaFields schema={SCENE_SCHEMA.properties?.music ?? { type: "object" }} value={scene.music} path="music" issuePath={[...scenePath, "music"]}
          issues={issues} assets={document.assets} onChange={(value) => onOps([{ op: "update_scene", scene_id: scene.id, set: { music: value as typeof scene.music } }])} />
          : <AddButton disabled={!firstSlot(document, "audio") || document.schemaVersion < 2} onClick={() => {
            const assetId = firstSlot(document, "audio");
            if (assetId) onOps([{ op: "update_scene", scene_id: scene.id, set: { music: { assetId, volume: 1, fadeInTicks: 0, fadeOutTicks: 0 } } }]);
          }}>{t("i18n-cont-game-06.inspector.addMusic")}</AddButton>}
      </InspectorSection>
      <InspectorSection title={t("i18n-cont-game-06.inspector.lighting")} action={scene.lighting ? { icon: <CloseIcon />, label: t("i18n-cont-game-06.inspector.removeLighting"),
        onClick: () => onOps([{ op: "set_lighting", scene_id: scene.id, lighting: null }]) } : undefined}>
        {scene.lighting ? <>
          <SchemaFields schema={SCENE_SCHEMA.properties?.lighting?.properties?.ambient ?? { type: "object" }} value={scene.lighting.ambient} path="lighting.ambient"
            issuePath={[...scenePath, "lighting", "ambient"]} issues={issues} onChange={(value) => onOps([{ op: "set_lighting", scene_id: scene.id,
              lighting: { required: scene.lighting?.required, points: scene.lighting?.points ?? [], ambient: value as typeof scene.lighting.ambient } }])} />
          {scene.lighting.points.map((light, index) => <FieldGroup key={index} title={t("i18n-cont-game-06.inspector.lightNumber", { number: formatCount(index + 1) })}
            actions={<RowAction icon={<CloseIcon />} label={t("i18n-cont-game-06.inspector.removeLight")} onClick={() => onOps([{ op: "remove_light", scene_id: scene.id, index }])} />}>
            <SchemaFields schema={SCENE_SCHEMA.properties?.lighting?.properties?.points?.items ?? { type: "object" }} value={light} path={`lighting.points.${index}`}
              issuePath={[...scenePath, "lighting", "points", index]} issues={issues}
              onChange={(value) => onOps([{ op: "update_light", scene_id: scene.id, index, set: value as typeof light }])} />
          </FieldGroup>)}
          <AddButton disabled={scene.lighting.points.length >= 32} onClick={() => onOps([{ op: "add_light", scene_id: scene.id,
            light: { x: 0, y: 0, color: DEFAULT_GAME_LIGHT_COLOR, intensity: 1, radius: 4, falloff: 1 } }])}>{t("i18n-cont-game-06.inspector.addLight")}</AddButton>
        </> : <AddButton disabled={document.schemaVersion < 2} onClick={() => onOps([{ op: "set_lighting", scene_id: scene.id,
          lighting: { ambient: { color: DEFAULT_GAME_LIGHT_COLOR, intensity: 1 }, points: [] } }])}>{t("i18n-cont-game-06.inspector.addLighting")}</AddButton>}
      </InspectorSection>
      <InspectorSection title={t("i18n-cont-game-06.inspector.backgrounds")}>
        {(scene.backgrounds ?? []).map((background, index) => <FieldGroup key={background.id} title={background.id}
          actions={<OrderActions index={index} count={scene.backgrounds?.length ?? 0} removeLabel={t("i18n-cont-game-06.inspector.removeBackground")}
            onMove={(to) => onOps([{ op: "move_background", scene_id: scene.id, id: background.id, to_index: to }])}
            onRemove={() => onOps([{ op: "remove_background", scene_id: scene.id, id: background.id }])} />}>
          <SchemaFields schema={SCENE_SCHEMA.properties?.backgrounds?.items ?? { type: "object" }} value={background} path={`backgrounds.${index}`}
            issuePath={[...scenePath, "backgrounds", index]} issues={issues} assets={document.assets}
            onChange={(value) => onOps([{ op: "update_background", scene_id: scene.id, id: background.id, set: value as typeof background }])} />
        </FieldGroup>)}
        <AddButton disabled={!firstSlot(document, "image") || document.schemaVersion < 2 || (scene.backgrounds?.length ?? 0) >= 32} onClick={() => {
          const assetId = firstSlot(document, "image");
          if (!assetId) return;
          const id = `background-${Math.max(1, ...((scene.backgrounds ?? []).map((background) => Number(background.id.match(/^background-(\d+)$/)?.[1] ?? 0)))) + 1}`;
          onOps([{ op: "add_background", scene_id: scene.id, background: { id, assetId, width: 16, height: 9, layer: -100, origin: { x: 0, y: 0 },
            parallax: { x: 1, y: 1 }, scrollRate: { x: 0, y: 0 }, mode: "repeat" } }]);
        }}>{t("i18n-cont-game-06.inspector.addBackground")}</AddButton>
      </InspectorSection>
    </> : null}
    </FlexColumn>
  </FlexColumn>;
}
