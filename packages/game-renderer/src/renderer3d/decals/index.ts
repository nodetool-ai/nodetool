import * as THREE from "three";
import { GAME_MAX_DECALS_3D, type GameDecal3D, type GameRenderFrame3D } from "@nodetool-ai/protocol";
import { GameImageCache3D } from "../assets/image-cache.js";
import type { GameImageSources3D } from "../assets/image-contract.js";
import type { RenderInstance } from "../types.js";
import { GAME_DECAL_LIMITS_3D, GameDecalProjectionError3D, gameDecalAttributeKey3D, gameDecalProjector3D, projectGameDecalGeometry3D, type GameDecalWork3D } from "./geometry.js";

interface Receiver3D {
  readonly meshes: readonly THREE.Mesh[];
  readonly signature: string;
}

interface DecalEntry3D {
  readonly key: string;
  readonly assetId: string;
  readonly group: THREE.Group;
  readonly geometries: readonly THREE.BufferGeometry[];
  readonly material?: THREE.MeshStandardMaterial;
  readonly texture?: THREE.Texture;
}

/** One cache per renderer. Projected meshes remain in world space and never enter the simulation. */
export class GameDecals3D {
  private readonly images: GameImageCache3D;
  private readonly entries = new Map<string, DecalEntry3D>();
  private readonly loadedSlots = new Set<string>();
  private readonly reported = new Set<string>();
  private readonly onAbort = (): void => this.dispose();
  private disposed = false;

  constructor(private readonly scene: THREE.Scene, sources: GameImageSources3D, private readonly signal: AbortSignal,
    private readonly diagnostics: string[], private readonly onDiagnostic?: (message: string) => void) {
    this.images = new GameImageCache3D(sources, signal);
    signal.addEventListener("abort", this.onAbort, { once: true });
    if (signal.aborted) { this.dispose(); }
  }

  get textureBytes(): number { return this.images.textureBytes; }

  get geometryBytes(): number {
    let bytes = 0;
    for (const entry of this.entries.values()) {
      for (const geometry of entry.geometries) {
        for (const attribute of Object.values(geometry.attributes)) {
          bytes += attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.array.byteLength : attribute.array.byteLength;
        }
        bytes += geometry.index?.array.byteLength ?? 0;
      }
    }
    return bytes;
  }

  async sync(frame: GameRenderFrame3D, instances: ReadonlyMap<string, RenderInstance>): Promise<void> {
    this.signal.throwIfAborted();
    if (this.disposed) { throw new Error("Decal renderer is disposed"); }
    const decals = frame.entities.filter((entity) => entity.decal3d);
    const present = new Set(decals.slice(0, GAME_MAX_DECALS_3D).map((entity) => entity.entityId));
    for (const [id, entry] of this.entries) { if (!present.has(id)) { this.release(id, entry); } }
    const usedSlots = new Set(decals.slice(0, GAME_MAX_DECALS_3D).flatMap((entity) => entity.decal3d ? [entity.decal3d.assetId] : []));
    for (const slot of this.loadedSlots) {
      if (!usedSlots.has(slot)) { await this.images.invalidate(slot); this.loadedSlots.delete(slot); }
    }
    if (decals.length === 0) { return; }
    this.scene.updateMatrixWorld(true);
    const receivers = new Map<string, Receiver3D>();
    let cachedVertices = 0;
    for (const entry of this.entries.values()) {
      for (const geometry of entry.geometries) { cachedVertices += geometry.getAttribute("position").count; }
    }
    const work: GameDecalWork3D = { nodes: 0, sourceTriangles: 0, candidateTriangles: 0, outputVertices: cachedVertices };
    for (const [order, entity] of decals.entries()) {
      const settings = entity.decal3d;
      if (!settings) { continue; }
      if (order >= GAME_MAX_DECALS_3D) { this.report("Scene decal count limit exceeded"); break; }
      const existing = this.entries.get(entity.entityId);
      const projectorObject = instances.get(entity.entityId)?.object;
      const receiverObject = instances.get(settings.receiverId)?.object;
      if (!projectorObject || !receiverObject) {
        if (existing) { this.release(entity.entityId, existing); }
        this.report(`Decal ${entity.entityId} receiver or projector is unavailable`);
        continue;
      }
      if (!receiverObject.visible || !projectorObject.visible || (entity.opacity ?? 1) === 0) {
        if (existing) { existing.group.visible = false; }
        continue;
      }
      try {
        let receiver = receivers.get(settings.receiverId);
        if (!receiver) { receiver = this.receiver(receiverObject, work); receivers.set(settings.receiverId, receiver); }
        const key = `${JSON.stringify(settings)}:${projectorObject.matrixWorld.elements.join(",")}:${receiver.signature}`;
        if (existing?.key === key) {
          existing.group.visible = true;
          if (existing.material) { existing.material.opacity = settings.opacity * (entity.opacity ?? 1); }
          for (const child of existing.group.children) { child.renderOrder = settings.renderOrder * GAME_MAX_DECALS_3D + order; }
          continue;
        }
        if (existing) { for (const geometry of existing.geometries) { work.outputVertices -= geometry.getAttribute("position").count; } }
        const next = await this.build(key, settings, projectorObject, receiver, work);
        try { this.signal.throwIfAborted(); }
        catch (error) { this.release(entity.entityId, next); throw error; }
        if (existing) { this.release(entity.entityId, existing); }
        next.group.userData.gameEntityId = entity.entityId;
        for (const object of next.group.children) { object.renderOrder = settings.renderOrder * GAME_MAX_DECALS_3D + order; }
        if (next.material) { next.material.opacity = settings.opacity * (entity.opacity ?? 1); }
        this.entries.set(entity.entityId, next);
        this.scene.add(next.group);
      } catch (error) {
        if (!(error instanceof GameDecalProjectionError3D)) { throw error; }
        if (existing) { this.release(entity.entityId, existing); }
        this.report(`Decal ${entity.entityId}: ${error.message}`);
      }
    }
  }

  private receiver(root: THREE.Object3D, work: GameDecalWork3D): Receiver3D {
    const meshes: THREE.Mesh[] = [];
    const keys: string[] = [root.uuid];
    const pending = [root];
    while (pending.length > 0) {
      const object = pending.pop();
      if (!object) { break; }
      work.nodes += 1;
      if (work.nodes > GAME_DECAL_LIMITS_3D.sceneNodes) { throw new GameDecalProjectionError3D("Scene decal receiver node work limit exceeded"); }
      if (!object.visible) { continue; }
      for (let index = object.children.length - 1; index >= 0; index--) {
        const child = object.children[index];
        if (child) { pending.push(child); }
      }
      if (!(object instanceof THREE.Mesh)) { continue; }
      if (object instanceof THREE.SkinnedMesh || object instanceof THREE.InstancedMesh || Object.keys(object.geometry.morphAttributes).length > 0) {
        throw new GameDecalProjectionError3D("Receivers must be rigid meshes without skinning, morph targets or instancing");
      }
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.some((material) => !material.visible || material.transparent || material.alphaTest > 0 || material.opacity < 1)) {
        throw new GameDecalProjectionError3D("Receivers must use visible opaque materials without alpha masking");
      }
      meshes.push(object);
      keys.push(`${object.uuid}:${Array.isArray(object.material) ? `array-${object.material.length}` : "single"}:${object.geometry.uuid}:${gameDecalAttributeKey3D(object.geometry.getAttribute("position"))}:${gameDecalAttributeKey3D(object.geometry.getAttribute("normal"))}:${gameDecalAttributeKey3D(object.geometry.index ?? undefined)}:${JSON.stringify(object.geometry.drawRange)}:${JSON.stringify(object.geometry.groups)}:${object.matrixWorld.elements.join(",")}`);
    }
    return { meshes, signature: keys.join(";") };
  }

  private async build(key: string, settings: GameDecal3D, object: THREE.Object3D, receiver: Receiver3D,
    work: GameDecalWork3D): Promise<DecalEntry3D> {
    const projector = gameDecalProjector3D(object, settings.size);
    const geometries: THREE.BufferGeometry[] = [];
    let texture: THREE.Texture | undefined;
    let material: THREE.MeshStandardMaterial | undefined;
    try {
      for (const mesh of receiver.meshes) {
        const geometry = projectGameDecalGeometry3D(mesh, projector, work);
        if (geometry) { geometries.push(geometry); }
      }
      const group = new THREE.Group();
      group.name = "game-decal";
      if (geometries.length === 0) { return { key, assetId: settings.assetId, group, geometries }; }
      this.loadedSlots.add(settings.assetId);
      texture = (await this.images.get(settings.assetId)).clone();
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      material = new THREE.MeshStandardMaterial({ map: texture, color: "#ffffff", roughness: 1, metalness: 0,
        transparent: true, opacity: settings.opacity, depthTest: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      for (const geometry of geometries) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = false; mesh.receiveShadow = true;
        group.add(mesh);
      }
      const entry = { key, assetId: settings.assetId, group, geometries, texture, material };
      texture = undefined; material = undefined;
      return entry;
    } catch (error) { for (const geometry of geometries) { geometry.dispose(); } throw error; }
    finally { material?.dispose(); texture?.dispose(); }
  }

  private release(id: string, entry: DecalEntry3D): void {
    entry.group.removeFromParent();
    for (const geometry of entry.geometries) { geometry.dispose(); }
    entry.material?.dispose(); entry.texture?.dispose();
    if (this.entries.get(id) === entry) { this.entries.delete(id); }
  }

  private report(message: string): void {
    if (this.reported.has(message) || this.reported.size >= 64) { return; }
    this.reported.add(message); this.diagnostics.push(message); this.onDiagnostic?.(message);
  }

  async invalidate(slot: string): Promise<void> {
    for (const [id, entry] of this.entries) { if (entry.assetId === slot) { this.release(id, entry); } }
    await this.images.invalidate(slot);
    this.loadedSlots.delete(slot);
  }

  async reset(): Promise<void> {
    for (const [id, entry] of this.entries) { this.release(id, entry); }
    await Promise.all([...this.loadedSlots].map((slot) => this.images.invalidate(slot)));
    this.loadedSlots.clear();
  }

  dispose(): void {
    if (this.disposed) { return; }
    this.disposed = true;
    this.signal.removeEventListener("abort", this.onAbort);
    for (const [id, entry] of this.entries) { this.release(id, entry); }
    this.images.dispose(); this.loadedSlots.clear();
  }
}
