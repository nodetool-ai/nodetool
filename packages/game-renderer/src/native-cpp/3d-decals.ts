import {
  BufferGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SkinnedMesh,
  SRGBColorSpace,
  Texture,
  type Scene
} from "three";
import type {
  NativeFrame3D,
  NativeGame3dDocument
} from "@nodetool-ai/protocol/native-game";
import type { NativeAssetBroker } from "./contracts.js";
import {
  GAME_DECAL_LIMITS_3D,
  GameDecalProjectionError3D,
  gameDecalAttributeKey3D,
  gameDecalProjector3D,
  projectGameDecalGeometry3D,
  type GameDecalWork3D
} from "../renderer3d/decals/geometry.js";

interface Entry {
  readonly key: string;
  readonly group: Group;
  readonly geometries: readonly BufferGeometry[];
  material?: MeshStandardMaterial;
  readonly failed: boolean;
}
interface Receiver {
  readonly meshes: readonly Mesh[];
  readonly signature: string;
}
export const NATIVE_DECAL_RECEIVER_TRIANGLE_LIMIT = 200000;
function receiverTriangleCount(meshes: readonly Mesh[]): number {
  let count = 0;
  for (const mesh of meshes) {
    const geometry = mesh.geometry,
      total = geometry.index?.count ?? geometry.getAttribute("position").count;
    const first = Math.max(0, geometry.drawRange.start),
      last = Math.min(total, first + geometry.drawRange.count);
    let ranges = [{ start: first, end: last }];
    if (Array.isArray(mesh.material)) {
      const materials = mesh.material;
      ranges = geometry.groups
        .filter(
          (group) =>
            group.materialIndex !== undefined &&
            materials[group.materialIndex]?.visible === true
        )
        .map((group) => ({
          start: Math.max(first, group.start),
          end: Math.min(last, group.start + group.count)
        }))
        .filter((range) => range.end > range.start)
        .sort((a, b) => a.start - b.start);
    }
    let covered = -1;
    for (const range of ranges) {
      const start = Math.max(range.start, covered);
      count += Math.floor(Math.max(0, range.end - start) / 3);
      covered = Math.max(covered, range.end);
      if (count > NATIVE_DECAL_RECEIVER_TRIANGLE_LIMIT) {
        return count;
      }
    }
  }
  return count;
}
export interface NativeDecals3D {
  sync(frame: NativeFrame3D, roots: ReadonlyMap<string, Object3D>): void;
  contextRestored(): void;
  dispose(): void;
  readonly diagnostics: readonly string[];
  readonly projectionBuilds: number;
  readonly aggregateChecks: number;
}

/** Prepares only verified standalone images and projects committed native transforms. */
export async function createNativeDecals3D(
  scene: Scene,
  assets: NativeAssetBroker,
  decoder: { decode(bytes: Uint8Array): Promise<ImageBitmap> },
  document?: NativeGame3dDocument,
  onDiagnostic?: (message: string) => void
): Promise<NativeDecals3D> {
  const textures = new Map<string, Texture>();
  try {
    for (const entry of assets.entries) {
      if (entry.kind !== "image") {
        continue;
      }
      const texture = new Texture(
        await decoder.decode(await assets.get(entry.id))
      );
      texture.colorSpace = SRGBColorSpace;
      // ImageBitmaps ignore Texture.flipY. The legacy image decoder flips PNGs.
      texture.flipY = false;
      texture.offset.y = 1;
      texture.repeat.y = -1;
      texture.updateMatrix();
      texture.matrixAutoUpdate = false;
      texture.needsUpdate = true;
      textures.set(entry.id, texture);
    }
  } catch (error) {
    for (const texture of textures.values()) {
      texture.dispose();
    }
    throw error;
  }
  const childrenByScene = new Map<string, Map<string, string[]>>();
  for (const source of document?.scenes ?? []) {
    const children = new Map<string, string[]>();
    for (const entity of source.entities) {
      if (!entity.parentId) {
        continue;
      }
      const siblings = children.get(entity.parentId) ?? [];
      siblings.push(entity.id);
      children.set(entity.parentId, siblings);
    }
    childrenByScene.set(source.id, children);
  }
  const entries = new Map<string, Entry>(),
    diagnostics: string[] = [],
    reported = new Set<string>();
  const projectors = new Map<string, Object3D>();
  const eligibility = new Map<
    string,
    { signature: string; eligible: boolean }
  >();
  let projectionBuilds = 0,
    aggregateChecks = 0,
    disposed = false;
  const report = (message: string): void => {
    if (reported.size >= 64 || reported.has(message)) {
      return;
    }
    reported.add(message);
    diagnostics.push(message);
    onDiagnostic?.(message);
  };
  const release = (id: string): void => {
    const entry = entries.get(id);
    if (!entry) {
      return;
    }
    scene.remove(entry.group);
    for (const geometry of entry.geometries) {
      geometry.dispose();
    }
    entry.material?.dispose();
    entries.delete(id);
  };
  const receiver = (
    roots: readonly Object3D[],
    work: GameDecalWork3D
  ): Receiver => {
    const meshes: Mesh[] = [],
      keys: string[] = [],
      pending = [...roots],
      visited = new Set<Object3D>();
    while (pending.length) {
      const object = pending.pop();
      if (!object || visited.has(object)) {
        continue;
      }
      visited.add(object);
      if (++work.nodes > GAME_DECAL_LIMITS_3D.sceneNodes) {
        throw new GameDecalProjectionError3D(
          "Scene decal receiver node work limit exceeded"
        );
      }
      if (!object.visible) {
        continue;
      }
      keys.push(`${object.uuid}:${object.matrixWorld.elements.join(",")}`);
      for (let index = object.children.length - 1; index >= 0; index--) {
        const child = object.children[index];
        if (child) {
          pending.push(child);
        }
      }
      if (!(object instanceof Mesh)) {
        continue;
      }
      if (
        object instanceof SkinnedMesh ||
        object instanceof InstancedMesh ||
        Object.keys(object.geometry.morphAttributes).length
      ) {
        throw new GameDecalProjectionError3D(
          "Receivers must be rigid meshes without skinning, morph targets or instancing"
        );
      }
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      if (
        materials.some(
          (material) =>
            !material.visible ||
            material.transparent ||
            material.alphaTest > 0 ||
            material.opacity < 1
        )
      ) {
        throw new GameDecalProjectionError3D(
          "Receivers must use visible opaque materials without alpha masking"
        );
      }
      meshes.push(object);
      keys.push(
        `${object.geometry.uuid}:${gameDecalAttributeKey3D(object.geometry.getAttribute("position"))}:${gameDecalAttributeKey3D(object.geometry.getAttribute("normal"))}:${gameDecalAttributeKey3D(object.geometry.index ?? undefined)}:${object.geometry.drawRange.start},${object.geometry.drawRange.count}:${object.geometry.groups.map((group: { start: number; count: number; materialIndex?: number }) => `${group.start},${group.count},${group.materialIndex}`).join("/")}`
      );
    }
    return { meshes, signature: keys.join(";") };
  };
  return {
    get diagnostics() {
      return diagnostics;
    },
    get projectionBuilds() {
      return projectionBuilds;
    },
    get aggregateChecks() {
      return aggregateChecks;
    },
    sync(frame, roots): void {
      if (disposed) {
        throw new Error("Native decal renderer disposed");
      }
      const definitions = new Map(
        frame.entities.map((entity) => [entity.id, entity])
      );
      const decals = frame.entities
        .filter((entity) => entity.decal3d)
        .sort(
          (a, b) =>
            (frame.authoredOrder[a.id] ?? 0) - (frame.authoredOrder[b.id] ?? 0)
        );
      const present = new Set(decals.slice(0, 32).map((entity) => entity.id));
      for (const id of entries.keys()) {
        if (!present.has(id)) {
          release(id);
        }
      }
      for (const id of projectors.keys()) {
        if (!present.has(id)) {
          projectors.delete(id);
        }
      }
      if (decals.length > 32) {
        report("Scene decal count limit exceeded");
      }
      const children =
        childrenByScene.get(frame.sceneId) ?? new Map<string, string[]>();
      const receiverCache = new Map<string, Receiver>();
      const receiverIds = new Set(
        decals
          .slice(0, 32)
          .flatMap((entity) =>
            entity.decal3d ? [entity.decal3d.receiverId] : []
          )
      );
      for (const id of eligibility.keys()) {
        if (!receiverIds.has(id)) {
          eligibility.delete(id);
        }
      }
      const work: GameDecalWork3D = {
        nodes: 0,
        sourceTriangles: 0,
        candidateTriangles: 0,
        outputVertices: 0
      };
      for (const entry of entries.values()) {
        for (const geometry of entry.geometries) {
          work.outputVertices += geometry.getAttribute("position").count;
        }
      }
      for (const [order, entity] of decals.slice(0, 32).entries()) {
        const settings = entity.decal3d;
        if (!settings) {
          continue;
        }
        const before = { ...work };
        let key = "";
        try {
          const texture = textures.get(settings.assetId);
          if (!texture) {
            throw new GameDecalProjectionError3D(
              `Decal image not prepared: ${settings.assetId}`
            );
          }
          let source = receiverCache.get(settings.receiverId);
          if (!source) {
            const sourceRoots: Object3D[] = [],
              pending = [settings.receiverId],
              visited = new Set<string>();
            while (pending.length) {
              const id = pending.pop();
              if (!id || visited.has(id)) {
                continue;
              }
              visited.add(id);
              if (visited.size > GAME_DECAL_LIMITS_3D.sceneNodes) {
                throw new GameDecalProjectionError3D(
                  "Scene decal receiver entity node limit exceeded"
                );
              }
              if (!definitions.has(id)) {
                continue;
              }
              const root = roots.get(id);
              if (root) {
                sourceRoots.push(root);
              }
              pending.push(...(children.get(id) ?? []));
            }
            if (!sourceRoots.length) {
              throw new GameDecalProjectionError3D(
                `Receiver unavailable: ${settings.receiverId}`
              );
            }
            source = receiver(sourceRoots, work);
            receiverCache.set(settings.receiverId, source);
          }
          let object = projectors.get(entity.id);
          if (!object) {
            object = new Object3D();
            projectors.set(entity.id, object);
          }
          object.position.fromArray(entity.transform.position);
          object.quaternion.fromArray(entity.transform.rotation);
          object.scale.fromArray(entity.transform.scale);
          object.updateMatrixWorld(true);
          key = `${settings.receiverId}:${settings.size.x},${settings.size.y},${settings.size.z}:${object.matrixWorld.elements.join(",")}:${source.signature}`;
          let entry = entries.get(entity.id);
          if (entry?.key !== key) {
            let checked = eligibility.get(settings.receiverId);
            if (!checked || checked.signature !== source.signature) {
              aggregateChecks++;
              checked = {
                signature: source.signature,
                eligible:
                  receiverTriangleCount(source.meshes) <=
                  NATIVE_DECAL_RECEIVER_TRIANGLE_LIMIT
              };
              eligibility.set(settings.receiverId, checked);
            }
            if (!checked.eligible) {
              throw new GameDecalProjectionError3D(
                "Native decal aggregate receiver triangle cap exceeded (200000)"
              );
            }
            const projection = gameDecalProjector3D(object, settings.size),
              geometries: BufferGeometry[] = [];
            if (entry) {
              for (const geometry of entry.geometries) {
                work.outputVertices -= geometry.getAttribute("position").count;
              }
            }
            projectionBuilds++;
            try {
              for (const mesh of source.meshes) {
                const geometry = projectGameDecalGeometry3D(
                  mesh,
                  projection,
                  work
                );
                if (geometry) {
                  geometries.push(geometry);
                }
              }
              const group = new Group();
              group.name = "native-decal";
              const material = geometries.length
                ? new MeshStandardMaterial({
                    map: texture,
                    color: "#ffffff",
                    roughness: 1,
                    metalness: 0,
                    transparent: true,
                    opacity: settings.opacity,
                    depthTest: true,
                    depthWrite: false,
                    polygonOffset: true,
                    polygonOffsetFactor: -2,
                    polygonOffsetUnits: -2
                  })
                : undefined;
              if (material) {
                for (const geometry of geometries) {
                  const mesh = new Mesh(geometry, material);
                  mesh.castShadow = false;
                  mesh.receiveShadow = true;
                  group.add(mesh);
                }
              }
              release(entity.id);
              entry = {
                key,
                group,
                geometries,
                failed: false
              };
              if (material) {
                entry.material = material;
              }
              entries.set(entity.id, entry);
              scene.add(group);
            } catch (error) {
              for (const geometry of geometries) {
                geometry.dispose();
              }
              throw error;
            }
          }
          if (entry.failed) {
            continue;
          }
          if (entry.material) {
            entry.material.opacity = settings.opacity;
            entry.material.map = texture;
          }
          for (const mesh of entry.group.children) {
            mesh.renderOrder = -(32 * 32) + settings.renderOrder * 32 + order;
          }
        } catch (error) {
          if (!(error instanceof GameDecalProjectionError3D)) {
            throw error;
          }
          release(entity.id);
          if (
            key &&
            before.sourceTriangles === 0 &&
            before.candidateTriangles === 0 &&
            before.outputVertices === 0
          ) {
            entries.set(entity.id, {
              key,
              group: new Group(),
              geometries: [],
              failed: true
            });
          }
          report(`Decal ${entity.id}: ${error.message}`);
        }
      }
    },
    contextRestored(): void {
      for (const texture of textures.values()) {
        texture.needsUpdate = true;
      }
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const id of entries.keys()) {
        release(id);
      }
      for (const texture of textures.values()) {
        texture.dispose();
      }
      textures.clear();
      projectors.clear();
      eligibility.clear();
    }
  };
}
