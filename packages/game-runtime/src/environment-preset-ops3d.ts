import { gameEntity3D, gameEntityTags, getGameEnvironmentPreset3D, type GameEntity3D, type GameEnvironmentPresetId3D, type GameScene3D } from "@nodetool-ai/protocol";

const PRESET_SUN_TAG = "environment-preset-sun";
const SUN_FIELDS = new Set(["id", "name", "transform3d", "light3d", "tags", "props", "behaviors", "templateOnly"]);

function isPresetSun(entity: GameEntity3D, parents: ReadonlySet<string>): boolean {
  return entity.light3d?.kind === "directional" && !entity.templateOnly && entity.behaviors.length === 0 &&
    !parents.has(entity.id) && Object.keys(entity).every((key) => SUN_FIELDS.has(key)) &&
    (entity.tags?.includes(PRESET_SUN_TAG) === true || gameEntityTags.safeParse([...entity.tags ?? [], PRESET_SUN_TAG]).success);
}

/** Apply presentation settings and retain a dedicated render-only sun across preset changes. */
export function applyEnvironmentPreset3D(scene: GameScene3D, id: GameEnvironmentPresetId3D): GameScene3D {
  const preset = getGameEnvironmentPreset3D(id);
  const parents = new Set(scene.entities.flatMap((entity) => entity.parentId === undefined ? [] : [entity.parentId]));
  const linkedId = scene.environment.sky?.kind === "procedural" ? scene.environment.sky.sunEntityId : undefined;
  const eligible = scene.entities.filter((entity) => isPresetSun(entity, parents));
  const existing = eligible.find((entity) => entity.tags?.includes(PRESET_SUN_TAG)) ??
    eligible.find((entity) => entity.id === linkedId) ?? (eligible.length === 1 ? eligible[0] : undefined);
  let sun: GameEntity3D;
  if (existing) {
    sun = { ...existing, light3d: preset.sun.light, transform3d: { ...existing.transform3d, rotation: preset.sun.rotation },
      tags: existing.tags?.includes(PRESET_SUN_TAG) ? existing.tags : [...existing.tags ?? [], PRESET_SUN_TAG] };
  } else {
    const occupied = new Set(scene.entities.map((entity) => entity.id));
    let suffix = 0;
    let sunId = "environment-sun";
    while (occupied.has(sunId)) { suffix += 1; sunId = `environment-sun-${suffix}`; }
    sun = gameEntity3D.parse({ id: sunId, name: "Environment preset sun", transform3d: { rotation: preset.sun.rotation },
      light3d: preset.sun.light, tags: [PRESET_SUN_TAG] });
  }
  if (sun.light3d?.kind === "directional" && scene.entities.some((entity) => entity.id !== sun.id &&
    entity.light3d?.kind === "directional" && entity.light3d.castShadow)) {
    sun.light3d = { ...sun.light3d, castShadow: false };
  }
  if (preset.environment.sky?.kind === "procedural") { preset.environment.sky.sunEntityId = sun.id; }
  return { ...scene, environment: preset.environment,
    entities: existing ? scene.entities.map((entity) => entity === existing ? sun : entity) : [...scene.entities, sun] };
}
