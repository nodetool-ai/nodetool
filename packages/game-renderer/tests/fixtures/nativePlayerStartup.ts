import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gameDocument3D } from "@nodetool-ai/protocol";
import { nativeGame3dDocument, type NativeGame3dDocument } from "@nodetool-ai/protocol/native-game";

export function nativePlayerStartupDocument(): NativeGame3dDocument {
  return nativeGame3dDocument.parse({
    schemaVersion: 4,
    engine: "native-cpp-1",
    dimension: "3d",
    id: "native-player-startup",
    title: "Native environment startup",
    initialSceneId: "scene",
    camera: { position: [0, 1.5, 5], target: [0, 0, 0], fov: 50 },
    presentation: { aspectRatio: 4 / 3, hudWidth: 320, hudHeight: 240 },
    ui: { nodes: [{ kind: "text", id: "ready", text: "NATIVE 3D READY", size: 24, color: "#ffffff", offset: { x: 12, y: 12 } }] },
    scenes: [{
      id: "scene",
      environment: {
        background: "#14283c",
        ambient: { color: "#ffffff", intensity: 1 },
        sky: { kind: "color" },
        shadows: { enabled: false, mapSize: 512, extent: 10 },
        postProcessing: { enabled: true, toneMapping: "agx", antialias: "smaa", exposure: 1 }
      },
      entities: [{ id: "box", visual: { kind: "primitive", shape: "box", material: { color: "#ee6633", roughness: 0.8 } } }]
    }]
  });
}

export async function nativePlayerStartupExportFixture(): Promise<{
  readonly document: NativeGame3dDocument;
  readonly files: ReadonlyMap<string, Uint8Array>;
}> {
  const sample = new URL("../../../game-runtime/samples/blacksite/", import.meta.url);
  const original = gameDocument3D.parse(JSON.parse(await readFile(new URL("game.json", sample), "utf8")));
  const font = original.assets["font-display"];
  if (!font) { throw new Error("Startup fixture font is missing"); }
  const bytes = await readFile(new URL(`assets/${font.assetId}.ttf`, sample));
  const document = nativePlayerStartupDocument();
  if (!document.ui) { throw new Error("Startup fixture UI is missing"); }
  return {
    document: nativeGame3dDocument.parse({ ...document,
      assets: [{ id: "font-display", kind: "font", path: "font-display.ttf", size: bytes.length,
        digest: createHash("sha256").update(bytes).digest("hex"), dependencies: [] }],
      ui: { ...document.ui, nodes: document.ui.nodes.map(node => ({ ...node, fontId: "font-display" })) }
    }),
    files: new Map([["font-display.ttf", bytes]])
  };
}
