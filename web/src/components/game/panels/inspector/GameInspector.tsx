import { useState, type ComponentProps } from "react";
import { gameAssetBinding, gameBehavior, gameDocument, gameEntity, gameRenderEffect, gameScene, type GameDocument, type GameEntity, type GameRenderEffect } from "@nodetool-ai/protocol/game.js";
import { validateGame, type GameDocumentOp, type GameValidationIssue } from "@nodetool-ai/game-runtime";

import { Caption, CollapsibleSection, Divider, EditorButton, FlexColumn, FlexRow, InspectorFieldRow, InspectorSelect, Label, SPACING, TabGroup, Text, TextInput, TYPOGRAPHY } from "../../../ui_primitives";
import SchemaFields from "../../inspector/SchemaFields";
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
const COMPONENTS = ["sprite", "tilemap", "camera2d", "body2d", "collider2d", "animator", "visualAnimation", "audioSource", "light2d"] as const;
const BEHAVIORS = ["movement", "patrol", "collectible", "health", "trigger", "spawn", "sceneTransition", "winWhenCollected", "lifetime", "script"] as const;
const EFFECTS = ["bloom", "lut", "brightnessContrast"] as const;
const DEFAULT_GAME_LIGHT_COLOR = "#ffffff";

type ComponentKind = typeof COMPONENTS[number];

function displayKind(kind: string): string {
  return kind.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/2d\b/i, "2D")
    .replace(/^./, (letter) => letter.toUpperCase());
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

function InspectorSection({ children, ...props }: ComponentProps<typeof CollapsibleSection>) {
  return <CollapsibleSection {...props} sx={{ pt: SPACING.md, borderTop: 1, borderColor: "divider" }}>
    <FlexColumn gap={SPACING.xs} sx={{ minWidth: 0, pt: SPACING.xs, pl: SPACING.xxxl, "& > button": { alignSelf: "flex-start" } }}>{children}</FlexColumn>
  </CollapsibleSection>;
}

export default function GameInspector({ document, activeSceneId, selectedIds, issues = [], onOps, onSceneChange, onEditScript }: GameInspectorProps) {
  const [tab, setTab] = useState<"selection" | "game">("selection");
  const [componentToAdd, setComponentToAdd] = useState("");
  const [behaviorToAdd, setBehaviorToAdd] = useState("");
  const [effectToAdd, setEffectToAdd] = useState("");
  const [localEffectIssues, setLocalEffectIssues] = useState<readonly GameValidationIssue[]>([]);
  const [newSlot, setNewSlot] = useState("");
  const selectedId = selectedIds[0];
  const selectedScene = document.scenes.find((entry) => entry.entities.some((entity) => entity.id === selectedId));
  const scene = selectedScene ?? document.scenes.find((entry) => entry.id === activeSceneId) ?? document.scenes[0];
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

  const inspectedName = tab === "game" ? "Game settings" : entity?.name || entity?.id || scene?.name || "Scene";
  const inspectedId = tab === "game" ? undefined : entity?.id ?? scene?.id;

  return <FlexColumn sx={{ minHeight: 0, height: "100%" }}>
    <FlexColumn gap={SPACING.xs} sx={{ px: SPACING.lg, pt: SPACING.lg, pb: SPACING.md }}>
      <Caption sx={{ textTransform: "uppercase", letterSpacing: "0.12em" }}>Inspector</Caption>
      <Text sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inspectedName}</Text>
      {inspectedId && <Caption sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={inspectedId}>ID: {inspectedId}</Caption>}
    </FlexColumn>
    <TabGroup aria-label="Inspector" size="small" fullWidth value={tab} onChange={(value) => setTab(value === "game" ? "game" : "selection")}
      tabs={[{ value: "selection", label: entity ? "Entity" : "Scene" }, { value: "game", label: "Game" }]} />
    <Divider />
    <FlexColumn gap={SPACING.xs} sx={{ minHeight: 0, overflowY: "auto", px: SPACING.lg, py: SPACING.md,
      "& > button": { alignSelf: "flex-start" },
      "& > .MuiBox-root:has(> [role='button'][aria-expanded])": { mt: SPACING.md },
      "& [role='button'][aria-expanded] > div": { ...TYPOGRAPHY.sans.label, color: "text.secondary",
        textTransform: "uppercase", letterSpacing: "0.08em" } }}>
    {tab === "game" ? <>
      <SchemaFields schema={DOCUMENT_SCHEMA.properties?.pixelsPerUnit ?? { type: "number" }} value={document.pixelsPerUnit} path="pixelsPerUnit"
        issuePath={["pixelsPerUnit"]} issues={issues} onChange={(value) => onOps([{ op: "set_game", pixels_per_unit: Number(value) }])} />
      <InspectorFieldRow label="Entry scene"><InspectorSelect grow label="Entry scene" value={document.entrySceneId} options={document.scenes.map((item) => ({ value: item.id, label: item.name }))}
        onChange={(value) => onOps([{ op: "set_game", entry_scene_id: value }])} /></InspectorFieldRow>
      {issueAt(issues, ["entrySceneId"]) && <Caption color="error">{issueAt(issues, ["entrySceneId"])}</Caption>}
      <InspectorSection title="Input actions" compact>
        <SchemaFields schema={DOCUMENT_SCHEMA.properties?.inputActions ?? { type: "array", items: { type: "string" } }} value={document.inputActions}
          path="inputActions" issuePath={["inputActions"]} issues={issues}
          onChange={(value) => onOps([{ op: "set_game", input_actions: value as string[] }])} />
      </InspectorSection>
      <InspectorSection title="Collision layer names" compact>
        <SchemaFields schema={DOCUMENT_SCHEMA.properties?.collisionLayers ?? { type: "array", items: { type: "string" } }} value={document.collisionLayers ?? []}
          path="collisionLayers" issuePath={["collisionLayers"]} issues={issues}
          onChange={(value) => onOps([{ op: "set_game", collision_layers: value as string[] }])} />
      </InspectorSection>
      <InspectorSection title="Effects" compact>
        {effects.map((effect, index) => <FlexColumn key={`${effect.kind}:${index}`} gap={SPACING.xs}>
          <Label component="span" sx={{ mb: 0 }}>{index + 1}. {displayKind(effect.kind)}</Label>
          <SchemaFields schema={schemaVariant(EFFECT_SCHEMA, effect)} value={effect} path={`renderEffects.${index}`}
            issuePath={["renderEffects", index]} issues={visibleIssues} assets={document.assets}
            onChange={(value) => setEffects(effects.map((entry, position) => position === index ? value as GameRenderEffect : entry))} />
          <FlexRow gap={SPACING.xs}>
            <EditorButton disabled={index === 0} onClick={() => { const next = [...effects]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setEffects(next); }}>Move up</EditorButton>
            <EditorButton disabled={index === effects.length - 1} onClick={() => { const next = [...effects]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; setEffects(next); }}>Move down</EditorButton>
            <EditorButton onClick={() => setEffects(effects.filter((_, position) => position !== index))}>Remove effect</EditorButton>
          </FlexRow>
        </FlexColumn>)}
        <InspectorFieldRow label="Add effect"><InspectorSelect grow label="Add effect" value={effectToAdd} options={[{ value: "", label: "Choose effect" }, ...EFFECTS.map((kind) => ({ value: kind, label: displayKind(kind) }))]}
          onChange={setEffectToAdd} /></InspectorFieldRow>
        <EditorButton disabled={!effectToAdd || effects.length >= 8 || effectToAdd === "lut" && !Object.values(document.assets).some((binding) => binding.mediaKind === "image" && binding.width === binding.height * binding.height)}
          onClick={() => { const effect = newEffect(effectToAdd as typeof EFFECTS[number], document); if (effect) setEffects([...effects, effect]); setEffectToAdd(""); }}>Add effect</EditorButton>
        <InspectorFieldRow label="HUD effect order"><InspectorSelect grow label="HUD effect order" value={document.hudEffectOrder ?? "beforeEffects"}
          options={[{ value: "beforeEffects", label: "Before effects" }, { value: "afterEffects", label: "After effects" }]}
          onChange={(value) => setEffects(effects, value as GameDocument["hudEffectOrder"])} /></InspectorFieldRow>
      </InspectorSection>
      <InspectorSection title="Asset bindings" compact>
        {Object.entries(document.assets).map(([slot, binding]) => <InspectorSection key={slot} title={slot} compact>
          <SchemaFields schema={ASSET_SCHEMA} value={binding} path={`assets.${slot}`} issuePath={["assets", slot]} issues={issues}
            onChange={(value) => {
              const next = value as typeof binding;
              const adjusted = { ...next };
              if (adjusted.mediaKind === "font") adjusted.fontFormat = adjusted.fontFormat ?? "ttf";
              else delete adjusted.fontFormat;
              onOps([{ op: "bind_asset", slot, binding: adjusted }]);
            }} />
          <EditorButton onClick={() => onOps([{ op: "unbind_asset", slot }])}>Unbind {slot}</EditorButton>
        </InspectorSection>)}
        <InspectorFieldRow label="New asset slot"><TextInput label="New asset slot" hideLabel compact value={newSlot} onChange={(event) => setNewSlot(event.target.value)} /></InspectorFieldRow>
        <EditorButton disabled={!newSlot.trim() || Boolean(document.assets[newSlot.trim()]) || Object.keys(document.assets).length === 0} onClick={() => {
          const binding = Object.values(document.assets)[0];
          if (binding) {
            onOps([{ op: "bind_asset", slot: newSlot.trim(), binding: { ...binding } }]);
            setNewSlot("");
          }
        }}>Add binding</EditorButton>
      </InspectorSection>
    </> : entity && target ? <>
      <GameOverrideFields document={document} sceneId={scene.id} entityId={entity.id} onOps={onOps} />
      <SchemaFields schema={ENTITY_SCHEMA.properties?.name ?? { type: "string" }} value={entity.name} path="Name"
        issuePath={[...entityPath, "name"]} issues={issues} onChange={(value) => update({ name: String(value) })} />
      <InspectorFieldRow label="Parent"><InspectorSelect grow label="Parent" value={entity.parentId ?? ""}
        options={[{ value: "", label: "None" }, ...parentCandidates(scene, entity.id).map((entry) => ({ value: entry.id, label: entry.name || entry.id }))]}
        onChange={(value) => update({ parentId: value || null, transform2d: reparentTransform(scene, entity.id, value || undefined) })} /></InspectorFieldRow>
      {issueAt(issues, [...entityPath, "parentId"]) && <Caption color="error">{issueAt(issues, [...entityPath, "parentId"])}</Caption>}
      <SchemaFields schema={ENTITY_SCHEMA.properties?.templateOnly ?? { type: "boolean" }} value={entity.templateOnly} path="Prefab only"
        issuePath={[...entityPath, "templateOnly"]} issues={issues} onChange={(value) => update({ templateOnly: Boolean(value) })} />
      <InspectorSection title="Transform" compact>
        <SchemaFields schema={ENTITY_SCHEMA.properties?.transform2d ?? { type: "object" }} value={entity.transform2d} path="transform2d"
          issuePath={[...entityPath, "transform2d"]} issues={issues} onChange={(value) => update({ transform2d: value as GameEntity["transform2d"] })} />
      </InspectorSection>
      {COMPONENTS.map((component) => entity[component] && <InspectorSection key={component} title={displayKind(component)} compact>
        <SchemaFields schema={ENTITY_SCHEMA.properties?.[component] ?? { type: "object" }} value={entity[component]} path={component}
          issuePath={[...entityPath, component]} issues={issues} assets={document.assets} collisionLayers={document.collisionLayers}
          onChange={(value) => update({ [component]: value } as Extract<GameDocumentOp, { op: "update_entity" }>["set"])} />
        <EditorButton onClick={() => update({ [component]: null } as Extract<GameDocumentOp, { op: "update_entity" }>["set"])}>Remove component</EditorButton>
      </InspectorSection>)}
      <InspectorFieldRow label="Add component"><InspectorSelect grow label="Add component" value={componentToAdd} options={[{ value: "", label: "Choose component" },
        ...COMPONENTS.filter((component) => !entity[component]).map((component) => ({ value: component, label: displayKind(component) }))]}
        onChange={setComponentToAdd} /></InspectorFieldRow>
      <EditorButton disabled={!componentToAdd || ((componentToAdd === "sprite" || componentToAdd === "tilemap") && !firstSlot(document, "image")) || componentToAdd === "audioSource" && !firstSlot(document, "audio")}
        onClick={() => { update({ [componentToAdd]: newComponent(componentToAdd as ComponentKind, document) } as Extract<GameDocumentOp, { op: "update_entity" }>["set"]); setComponentToAdd(""); }}>Add component</EditorButton>
      <Divider />
      <Label component="span" sx={{ mb: 0, textTransform: "uppercase", letterSpacing: "0.12em" }}>Behaviors</Label>
      {entity.behaviors.map((behavior, index) => <InspectorSection key={`${behavior.kind}:${index}`} title={`${index + 1}. ${displayKind(behavior.kind)}`} compact>
        {behavior.kind === "script" ? <>
          <Caption>Script source: {new TextEncoder().encode(behavior.source).length} bytes</Caption>
          <EditorButton onClick={() => onEditScript(scene.id, entity.id, index)}>Edit script</EditorButton>
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
        <FlexRow gap={SPACING.xs}>
          <EditorButton disabled={index === 0} onClick={() => onOps([{ op: "move_behavior", ...target, index, to_index: index - 1 }])}>Move up</EditorButton>
          <EditorButton disabled={index === entity.behaviors.length - 1} onClick={() => onOps([{ op: "move_behavior", ...target, index, to_index: index + 1 }])}>Move down</EditorButton>
          <EditorButton onClick={() => onOps([{ op: "remove_behavior", ...target, index }])}>Remove behavior</EditorButton>
        </FlexRow>
      </InspectorSection>)}
      <InspectorFieldRow label="Add behavior"><InspectorSelect grow label="Add behavior" value={behaviorToAdd} options={[{ value: "", label: "Choose behavior" }, ...BEHAVIORS.map((kind) => ({ value: kind, label: displayKind(kind) }))]}
        onChange={setBehaviorToAdd} /></InspectorFieldRow>
      <EditorButton disabled={!behaviorToAdd || behaviorToAdd === "spawn" && !document.scenes.some((entry) => entry.entities.some((item) => item.templateOnly))}
        onClick={() => { const behavior = newBehavior(behaviorToAdd, document); if (behavior) onOps([{ op: "add_behavior", ...target, behavior }]); setBehaviorToAdd(""); }}>Add behavior</EditorButton>
    </> : scene ? <>
      <InspectorFieldRow label="Scene"><InspectorSelect grow label="Scene" value={scene.id} options={document.scenes.map((entry) => ({ value: entry.id, label: entry.name }))} onChange={onSceneChange} /></InspectorFieldRow>
      <SchemaFields schema={SCENE_SCHEMA.properties?.name ?? { type: "string" }} value={scene.name} path="Name"
        issuePath={[...scenePath, "name"]} issues={issues}
        onChange={(value) => onOps([{ op: "update_scene", scene_id: scene.id, set: { name: String(value) } }])} />
      <InspectorSection title="Music" compact>
        {scene.music ? <>
          <SchemaFields schema={SCENE_SCHEMA.properties?.music ?? { type: "object" }} value={scene.music} path="music" issuePath={[...scenePath, "music"]}
            issues={issues} assets={document.assets} onChange={(value) => onOps([{ op: "update_scene", scene_id: scene.id, set: { music: value as typeof scene.music } }])} />
          <EditorButton onClick={() => onOps([{ op: "update_scene", scene_id: scene.id, set: { music: null } }])}>Remove music</EditorButton>
        </> : <EditorButton disabled={!firstSlot(document, "audio") || document.schemaVersion < 2} onClick={() => {
          const assetId = firstSlot(document, "audio");
          if (assetId) onOps([{ op: "update_scene", scene_id: scene.id, set: { music: { assetId, volume: 1, fadeInTicks: 0, fadeOutTicks: 0 } } }]);
        }}>Add music</EditorButton>}
      </InspectorSection>
      <InspectorSection title="Lighting" compact>
        {scene.lighting ? <>
          <SchemaFields schema={SCENE_SCHEMA.properties?.lighting?.properties?.ambient ?? { type: "object" }} value={scene.lighting.ambient} path="lighting.ambient"
            issuePath={[...scenePath, "lighting", "ambient"]} issues={issues} onChange={(value) => onOps([{ op: "set_lighting", scene_id: scene.id,
              lighting: { required: scene.lighting?.required, points: scene.lighting?.points ?? [], ambient: value as typeof scene.lighting.ambient } }])} />
          {scene.lighting.points.map((light, index) => <InspectorSection key={index} title={`Light ${index + 1}`} compact>
            <SchemaFields schema={SCENE_SCHEMA.properties?.lighting?.properties?.points?.items ?? { type: "object" }} value={light} path={`lighting.points.${index}`}
              issuePath={[...scenePath, "lighting", "points", index]} issues={issues}
              onChange={(value) => onOps([{ op: "update_light", scene_id: scene.id, index, set: value as typeof light }])} />
            <EditorButton onClick={() => onOps([{ op: "remove_light", scene_id: scene.id, index }])}>Remove light</EditorButton>
          </InspectorSection>)}
          <EditorButton disabled={scene.lighting.points.length >= 32} onClick={() => onOps([{ op: "add_light", scene_id: scene.id,
            light: { x: 0, y: 0, color: DEFAULT_GAME_LIGHT_COLOR, intensity: 1, radius: 4, falloff: 1 } }])}>Add light</EditorButton>
          <EditorButton onClick={() => onOps([{ op: "set_lighting", scene_id: scene.id, lighting: null }])}>Remove lighting</EditorButton>
        </> : <EditorButton disabled={document.schemaVersion < 2} onClick={() => onOps([{ op: "set_lighting", scene_id: scene.id,
          lighting: { ambient: { color: DEFAULT_GAME_LIGHT_COLOR, intensity: 1 }, points: [] } }])}>Add lighting</EditorButton>}
      </InspectorSection>
      <InspectorSection title="Backgrounds" compact>
        {(scene.backgrounds ?? []).map((background, index) => <InspectorSection key={background.id} title={background.id} compact>
          <SchemaFields schema={SCENE_SCHEMA.properties?.backgrounds?.items ?? { type: "object" }} value={background} path={`backgrounds.${index}`}
            issuePath={[...scenePath, "backgrounds", index]} issues={issues} assets={document.assets}
            onChange={(value) => onOps([{ op: "update_background", scene_id: scene.id, id: background.id, set: value as typeof background }])} />
          <FlexRow gap={SPACING.xs}>
            <EditorButton disabled={index === 0} onClick={() => onOps([{ op: "move_background", scene_id: scene.id, id: background.id, to_index: index - 1 }])}>Move up</EditorButton>
            <EditorButton disabled={index === (scene.backgrounds?.length ?? 0) - 1} onClick={() => onOps([{ op: "move_background", scene_id: scene.id, id: background.id, to_index: index + 1 }])}>Move down</EditorButton>
            <EditorButton onClick={() => onOps([{ op: "remove_background", scene_id: scene.id, id: background.id }])}>Remove background</EditorButton>
          </FlexRow>
        </InspectorSection>)}
        <EditorButton disabled={!firstSlot(document, "image") || document.schemaVersion < 2 || (scene.backgrounds?.length ?? 0) >= 32} onClick={() => {
          const assetId = firstSlot(document, "image");
          if (!assetId) return;
          const id = `background-${Math.max(1, ...((scene.backgrounds ?? []).map((background) => Number(background.id.match(/^background-(\d+)$/)?.[1] ?? 0)))) + 1}`;
          onOps([{ op: "add_background", scene_id: scene.id, background: { id, assetId, width: 16, height: 9, layer: -100, origin: { x: 0, y: 0 },
            parallax: { x: 1, y: 1 }, scrollRate: { x: 0, y: 0 }, mode: "repeat" } }]);
        }}>Add background</EditorButton>
      </InspectorSection>
    </> : null}
    </FlexColumn>
  </FlexColumn>;
}
