/**
 * `slotPrompt().checker` is only useful if every key in it is a prop the
 * matching `nodetool.game.*` node actually declares. This reads the node
 * metadata rather than a copy of it, so renaming a checker prop without
 * updating `slotCheckerProps` fails here.
 */
import { describe, expect, it } from "vitest";

import { getNodeMetadata, type NodeClass } from "@nodetool-ai/node-sdk";
import {
  MusicLoopNode,
  SoundEffectNode
} from "@nodetool-ai/audio-nodes";
import {
  SeamlessImageNode,
  SpriteSheetNode,
  TilesetNode
} from "@nodetool-ai/image-nodes";
import {
  gameAssetManifest,
  slotPrompt,
  type GameSlotKind,
  type GameSlotSpec
} from "@nodetool-ai/protocol";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const manifest = gameAssetManifest.parse(
  JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL(
          "../../protocol/fixtures/game-assets/platformer.manifest.json",
          import.meta.url
        )
      ),
      "utf8"
    )
  )
);

const CHECKER: Record<GameSlotKind, NodeClass> = {
  spritesheet: SpriteSheetNode as unknown as NodeClass,
  tileset: TilesetNode as unknown as NodeClass,
  image: SeamlessImageNode as unknown as NodeClass,
  sfx: SoundEffectNode as unknown as NodeClass,
  music: MusicLoopNode as unknown as NodeClass
};

const propNames = (node: NodeClass): Set<string> =>
  new Set(getNodeMetadata(node).properties.map((p) => p.name));

const slotOfKind = (kind: GameSlotKind): GameSlotSpec => {
  const spec = manifest.slots.find((s) => s.kind === kind);
  if (!spec) throw new Error(`fixture has no ${kind} slot`);
  return spec;
};

describe("the checker prop bag", () => {
  it("covers every slot kind the manifest schema has", () => {
    expect(Object.keys(CHECKER).sort()).toEqual(
      ["image", "music", "sfx", "spritesheet", "tileset"].sort()
    );
  });

  for (const kind of Object.keys(CHECKER) as GameSlotKind[]) {
    it(`names only props ${CHECKER[kind].nodeType} declares (${kind})`, () => {
      const { checker } = slotPrompt(slotOfKind(kind), null, []);
      const declared = propNames(CHECKER[kind]);
      expect(Object.keys(checker).length).toBeGreaterThan(0);
      for (const key of Object.keys(checker)) {
        expect(declared, `${CHECKER[kind].nodeType}.${key}`).toContain(key);
      }
    });

    it(`gives ${CHECKER[kind].nodeType} its slot_id and a game_slot input`, () => {
      const { checker } = slotPrompt(slotOfKind(kind), null, []);
      expect(checker.slot_id).toBe(slotOfKind(kind).id);
      expect(propNames(CHECKER[kind])).toContain("slot");
    });
  }
});
