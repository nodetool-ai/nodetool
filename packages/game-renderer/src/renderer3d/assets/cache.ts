import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { prepareGameModel } from "../preparation.js";
import type { CachedModel } from "../types.js";
import type { CreateGameRenderer3DOptions } from "../index.js";
import { releaseModel } from "./dispose.js";

export class GameModelCache3D {
  private readonly models = new Map<string, Promise<CachedModel>>();
  readonly loadedModels = new Set<CachedModel>();
  modelLoadMs = 0;
  constructor(private readonly options: CreateGameRenderer3DOptions, private readonly controller: AbortController) {}
  async get(id: string): Promise<CachedModel> {
    let pending = this.models.get(id);
    if (!pending) {
      pending = (async () => {
        const started = performance.now();
        const source = await this.options.resolveModel?.(id, this.controller.signal);
        this.controller.signal.throwIfAborted();
        if (!source) { throw new Error(`Model asset ${id} is missing`); }
        const checked = await prepareGameModel(source.bytes, { expectedDigest: source.digest, signal: this.controller.signal });
        if (!checked.ok) { throw new Error(`Model ${id} failed preparation: ${checked.diagnostics.map((entry) => entry.message).join("; ")}`); }
        const manager = new THREE.LoadingManager();
        manager.setURLModifier((url) => {
          if (!url.startsWith("blob:")) { throw new Error("Prepared model attempted an external resource request"); }
          return url;
        });
        const loader = new GLTFLoader(manager);
        loader.register((parser) => ({ name: "NODETOOL_game_node_ids",
          loadNode: async (index) => {
            const node = await parser.loadNode(index);
            node.userData.gameNodeId = `node:${index}`;
            return node;
          } }));
        const gltf = await loader.parseAsync(new Uint8Array(checked.model.bytes).buffer, "");
        const cached = { prepared: checked.model, gltf };
        if (this.controller.signal.aborted) { releaseModel(cached); this.controller.signal.throwIfAborted(); }
        this.loadedModels.add(cached);
        this.modelLoadMs += performance.now() - started;
        return cached;
      })();
      this.models.set(id, pending);
    }
    return pending;
  }
  async invalidate(slot: string): Promise<void> {
    const pending = this.models.get(slot);
    this.models.delete(slot);
    if (pending) {
      const cached = await pending.catch(() => null);
      if (cached) { releaseModel(cached); this.loadedModels.delete(cached); }
    }
  }
  dispose(): void {
    this.loadedModels.forEach(releaseModel);
    this.loadedModels.clear();
    this.models.clear();
  }
}
