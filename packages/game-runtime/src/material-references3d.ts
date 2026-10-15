import type { GameDiagnostic, GameDocument3D, GameEntity3D, GameMaterial3D, GamePrefab3D } from "@nodetool-ai/protocol";

const TEXTURE_FIELDS = ["baseColorTexture", "normalTexture", "ormTexture", "emissiveTexture"] as const;

export function materialReferenceIssues3D(document: GameDocument3D): GameDiagnostic[] {
  const issues: GameDiagnostic[] = [];
  function textures(material: Partial<GameMaterial3D>, path: (string | number)[]): void {
    for (const field of TEXTURE_FIELDS) {
      const texture = material[field];
      if (!texture) { continue; }
      const kind: string | undefined = document.assets[texture.assetId]?.mediaKind;
      if (kind !== "image") {
        issues.push({ code: "missing_material_texture", path: [...path, field, "assetId"],
          message: `Material texture ${texture.assetId} must be an image binding` });
      }
    }
  }
  for (const [id, material] of Object.entries(document.materials ?? {})) { textures(material, ["materials", id]); }

  function entities(values: readonly GameEntity3D[], path: (string | number)[], prefab?: GamePrefab3D): void {
    for (const [index, entity] of values.entries()) {
      for (const component of ["primitive", "model"] as const) {
        const visual = entity[component];
        if (!visual) { continue; }
        const visualPath = [...path, index, component];
        const material = visual.materialId === undefined ? visual.material
          : document.materials && Object.hasOwn(document.materials, visual.materialId) ? document.materials[visual.materialId] : undefined;
        if (visual.materialId !== undefined && !material) {
          issues.push({ code: "missing_material", path: [...visualPath, "materialId"],
            message: `Material ${visual.materialId} does not exist` });
        }
        if (!material) { continue; }
        if (visual.materialId === undefined) { textures(material, [...visualPath, "material"]); }
        if (prefab) {
          for (const field of TEXTURE_FIELDS) {
            const texture = material[field];
            if (texture && !prefab.externalAssets.includes(texture.assetId)) {
              issues.push({ code: "undeclared_external_asset", path: visual.materialId === undefined
                ? [...visualPath, "material", field, "assetId"] : [...visualPath, "materialId"],
                message: `Prefab must declare material texture ${texture.assetId}` });
            }
          }
        }
      }
    }
  }
  for (const [index, scene] of document.scenes.entries()) { entities(scene.entities, ["scenes", index, "entities"]); }
  for (const [id, prefab] of Object.entries(document.prefabs)) { entities(prefab.entities, ["prefabs", id, "entities"], prefab); }
  return issues;
}
