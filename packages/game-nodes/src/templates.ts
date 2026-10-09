import { gameAssetManifest, type GameAssetManifest, type GameSlotSpec } from "@nodetool-ai/protocol";

export interface NativeGameTemplate {
  readonly id: string;
  readonly name: string;
  readonly manifest: GameAssetManifest;
}

const TOP_DOWN: NativeGameTemplate = {
  id: "topdown",
  name: "Top-down room",
  manifest: gameAssetManifest.parse({
    version: 1,
    template: "topdown",
    engineVersion: "1",
    slots: [
      { id: "player", kind: "spritesheet", cell: [32, 32], animations: { idle: 1, walk: 4 }, prompt: "top-down player character" },
      { id: "wall", kind: "tileset", cell: [32, 32], count: 1, prompt: "top-down stone wall tile" },
      { id: "gem", kind: "spritesheet", cell: [32, 32], animations: { idle: 1 }, prompt: "bright collectible gem" },
      { id: "sfx.collect", kind: "sfx", seconds: 0.4, prompt: "short collection chime" }
    ]
  })
};

export function listNativeTemplates(): readonly NativeGameTemplate[] {
  return [TOP_DOWN];
}

export function getNativeTemplate(id: string): NativeGameTemplate {
  if (id === TOP_DOWN.id) return TOP_DOWN;
  throw new Error(`Unknown native game template ${id}. Available: ${TOP_DOWN.id}`);
}

/** The first template slot with this id, for seeding a document slot's generation request. */
export function gameTemplateSlot(slotId: string): GameSlotSpec | undefined {
  for (const template of listNativeTemplates()) {
    const slot = template.manifest.slots.find((entry) => entry.id === slotId);
    if (slot) return slot;
  }
  return undefined;
}
