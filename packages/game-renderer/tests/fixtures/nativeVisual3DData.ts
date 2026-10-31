import { createHash } from "node:crypto";
import { createCanvas } from "@napi-rs/canvas";
import { Color, Euler, Quaternion } from "three";
import {
  nativeGame3dDocument,
  type NativeGame3dDocument
} from "@nodetool-ai/protocol/native-game";
import type { NativePreparedModel } from "../../src/native-cpp/model3d-types.js";
import { encodeNativeVisualFixture } from "./nativeVisual3DGLB.js";
export interface NativeVisual3DFixture {
  readonly document: NativeGame3dDocument;
  readonly models: Record<string, NativePreparedModel>;
  readonly bytes: Record<string, number[]>;
}
async function png(normal: boolean): Promise<number[]> {
  const canvas = createCanvas(4, 4),
    context = canvas.getContext("2d");
  context.fillStyle = normal ? "rgb(128,128,255)" : "#d78b32";
  context.fillRect(0, 0, 4, 4);
  context.fillStyle = normal ? "rgb(240,128,180)" : "#174b9f";
  context.fillRect(2, 0, 2, 4);
  return Array.from(canvas.toBuffer("image/png"));
}
export async function createNativeVisual3DData(): Promise<NativeVisual3DFixture> {
  const image = await png(false),
    normal = await png(true),
    identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const base: NativePreparedModel = {
    meshes: [
      [
        {
          vertices: [
            [-1.2, 0, 0],
            [1.2, 0, 0],
            [1.2, 2.4, 0],
            [-1.2, 2.4, 0]
          ].map((position, index) => ({
            position,
            normal: [0, 0, 1],
            uv: [
              [0, 0],
              [4, 0],
              [4, 4],
              [0, 4]
            ][index],
            joints: [0, 0, 0, 0],
            weights: [0, 0, 0, 0]
          })),
          indices: [0, 1, 2, 0, 2, 3],
          material: 0
        }
      ]
    ],
    materials: [
      {
        color: [0.65, 0.65, 0.65, 1],
        metallic: 0,
        roughness: 0.8,
        image: 0,
        doubleSided: true
      }
    ],
    images: [
      {
        mimeType: "image/png",
        source: {
          assetId: "base-image",
          offset: 0,
          length: image.length,
          digest: createHash("sha256")
            .update(new Uint8Array(image))
            .digest("hex")
        }
      },
      {
        mimeType: "image/png",
        source: {
          assetId: "normal-image",
          offset: 0,
          length: normal.length,
          digest: createHash("sha256")
            .update(new Uint8Array(normal))
            .digest("hex")
        }
      }
    ],
    nodes: [{ local: identity, children: [], mesh: 0, skin: -1 }],
    roots: [0],
    skins: [],
    animations: []
  };
  const prepared = new Map<string, NativePreparedModel>();
  for (const id of ["surface", "normal", "emissive", "metal", "blend"]) {
    const source = base.materials[0];
    prepared.set(id, {
      ...base,
      materials: [
        {
          ...source,
          ...(id === "normal" ? { normalImage: 1, normalScale: 0.4 } : {}),
          ...(id === "emissive" ? { emissive: [0.5, 0.2, 0.05] } : {}),
          ...(id === "metal" ? { metallic: 1, roughness: 0.08 } : {}),
          ...(id === "blend"
            ? { image: -1, color: [1, 0.1, 0.05, 0.3], alphaMode: "BLEND" }
            : {})
        }
      ]
    });
  }
  const panelColor = new Color("#ff591f");
  prepared.set("overlap-panel", {
    ...base,
    materials: [
      {
        ...base.materials[0],
        image: -1,
        color: [panelColor.r, panelColor.g, panelColor.b, 0.3],
        alphaMode: "BLEND"
      }
    ]
  });
  const triangleColor = new Color("#144cff");
  prepared.set("overlap-triangle", {
    ...base,
    meshes: [
      [
        {
          vertices: [
            [-0.8, 1, -1],
            [0.8, 1, 1],
            [0, 2.2, 1]
          ].map((position) => ({
            position,
            normal: [0, 0, 1],
            uv: [0, 0],
            joints: [0, 0, 0, 0],
            weights: [0, 0, 0, 0]
          })),
          indices: [0, 1, 2],
          material: 0
        }
      ]
    ],
    materials: [
      {
        ...base.materials[0],
        image: -1,
        color: [triangleColor.r, triangleColor.g, triangleColor.b, 0.8],
        alphaMode: "BLEND"
      }
    ]
  });
  const lightRotation = new Quaternion()
    .setFromEuler(new Euler(-Math.PI / 4, -0.3, 0))
    .toArray();
  const entities = (asset = "surface") => [
    { id: "surface", visual: { kind: "model", assetId: asset } },
    {
      id: "floor",
      transform: { position: [0, -0.1, 0] },
      visual: {
        kind: "primitive",
        shape: "box",
        // Keep the front edge away from the camera plane. The exact-plane case is
        // retained separately in native-eye-plane-original and its depth probe.
        size: [12, 0.2, 9.8],
        color: [1, 1, 1, 1],
        material: { color: "#7b8791", roughness: 0.75 }
      }
    },
    {
      id: "sun",
      transform: { position: [0, 4, 4], rotation: lightRotation },
      light3d: {
        kind: "directional",
        color: "#d8e6ff",
        intensity: 2,
        castShadow: true,
        shadowNormalBias: 0.01
      }
    },
    {
      id: "lamp",
      transform: { position: [2, 2, 3] },
      light3d: {
        kind: "point",
        color: "#ffb36c",
        intensity: 30,
        range: 10,
        decay: 2
      }
    }
  ];
  const environment = {
    background: "#101820",
    ambient: { color: "#9ba8b6", intensity: 0.3 },
    shadows: { enabled: false, mapSize: 512, extent: 10 },
    sky: { kind: "color" },
    postProcessing: {
      enabled: true,
      exposure: 1,
      toneMapping: "agx",
      antialias: "smaa"
    }
  };
  const scenes = [
    { id: "base", entities: entities(), environment },
    { id: "normal", entities: entities("normal"), environment },
    { id: "emissive", entities: entities("emissive"), environment },
    { id: "metal", entities: entities("metal"), environment },
    {
      id: "fog",
      entities: entities(),
      environment: {
        ...environment,
        fog: {
          kind: "height",
          color: "#c5b8a4",
          density: 0.3,
          baseHeight: 0,
          heightFalloff: 0.3,
          maxOpacity: 0.8
        }
      }
    },
    {
      id: "sky",
      entities: entities("metal"),
      environment: {
        ...environment,
        sky: {
          kind: "procedural",
          sunEntityId: "sun",
          turbidity: 6,
          rayleigh: 3,
          groundColor: "#0d0f12",
          intensity: 0.35
        }
      }
    },
    {
      id: "shadow",
      entities: entities(),
      environment: {
        ...environment,
        shadows: { enabled: true, mapSize: 512, extent: 10 }
      }
    },
    {
      id: "cascade",
      entities: entities(),
      environment: {
        ...environment,
        shadows: {
          enabled: true,
          mapSize: 512,
          extent: 10,
          cascades: { count: 3, split: 0.6, maxDistance: 20 }
        }
      }
    },
    {
      id: "post",
      entities: entities("emissive"),
      environment: {
        ...environment,
        postProcessing: {
          ...environment.postProcessing,
          bloom: { threshold: 0.1, intensity: 0.8, radius: 0.2, softness: 0.2 },
          vignette: { intensity: 0.8, radius: 0.2, softness: 0.5 }
        }
      }
    },
    {
      id: "blend",
      entities: [
        ...entities("blend"),
        {
          id: "behind",
          transform: { position: [0, 1.2, -0.5] },
          visual: {
            kind: "primitive",
            shape: "box",
            size: [3, 3, 0.1],
            color: [0, 0, 1, 1],
            material: { color: "#143cff", roughness: 0.8 }
          }
        }
      ],
      environment
    }
  ];
  const overlapBase = entities().filter((entity) => entity.id !== "surface");
  const overlapTriangle = {
    id: "overlap",
    transform: { position: [0, 0, 0.3] },
    visual: { kind: "model", assetId: "overlap-triangle" }
  };
  scenes.push({
    id: "model-depth",
    environment,
    entities: [
      ...overlapBase,
      { id: "panel", visual: { kind: "model", assetId: "overlap-panel" } },
      overlapTriangle
    ]
  });
  scenes.push({
    id: "primitive-depth",
    environment,
    entities: [
      ...overlapBase,
      {
        id: "panel",
        transform: { position: [0, 1.2, -0.0005] },
        visual: {
          kind: "primitive",
          shape: "box",
          size: [2.4, 2.4, 0.001],
          color: [1, 1, 1, 0.3],
          material: {
            color: "#ff591f",
            metalness: 0,
            roughness: 0.8,
            opacity: 0.3,
            alphaMode: "blend"
          }
        }
      },
      overlapTriangle
    ]
  });
  const doc = nativeGame3dDocument.parse({
    schemaVersion: 4,
    engine: "native-cpp-1",
    dimension: "3d",
    id: "visual-fixture",
    title: "Native visual feature patches",
    initialSceneId: "base",
    scenes,
    assets: [...prepared.keys()].map((id) => ({
      id,
      kind: "model",
      path: `${id}.glb`,
      digest: "0".repeat(64),
      size: 0,
      dependencies: []
    })),
    camera: {
      position: [0, 1.2, 5],
      target: [0, 1.2, 0],
      fov: 50,
      near: 0.03,
      far: 160
    }
  });
  const files = new Map([
      ["base-image", new Uint8Array(image)],
      ["normal-image", new Uint8Array(normal)]
    ]),
    bytes: Record<string, number[]> = {},
    models: Record<string, NativePreparedModel> = {};
  for (const [id, model] of prepared) {
    const encoded = encodeNativeVisualFixture(model, id, files);
    bytes[id] = Array.from(encoded.bytes);
    models[id] = { ...model, images: encoded.images };
  }
  doc.assets = doc.assets.map((entry) => {
    const data = new Uint8Array(bytes[entry.id]);
    return {
      ...entry,
      size: data.length,
      digest: createHash("sha256").update(data).digest("hex")
    };
  });
  return { document: doc, models, bytes };
}
