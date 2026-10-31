import type { NativeVisual3DFixture } from "./nativeVisual3DData.js";
import { createNativeAssetBroker } from "../../src/native-cpp/assets.js";
import {
  nativeFrame3D,
  nativeGame3dDocument,
  type NativeFrame3D
} from "@nodetool-ai/protocol/native-game";
import { createNativeRenderer3D } from "../../src/native-cpp/renderer3d.js";

function pixels(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  const context = copy.getContext("2d");
  if (!context) {
    throw new Error("Missing fixture readback context");
  }
  context.drawImage(canvas, 0, 0);
  return context.getImageData(0, 0, copy.width, copy.height).data;
}
function difference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let changed = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (
      Math.max(
        Math.abs(a[i] - b[i]),
        Math.abs(a[i + 1] - b[i + 1]),
        Math.abs(a[i + 2] - b[i + 2])
      ) > 8
    ) {
      changed++;
    }
  }
  return changed / (a.length / 4);
}

/** Feature patches use native frames and admitted model data, without a legacy session. */
export async function runNativeVisual3D(
  fixture: NativeVisual3DFixture
): Promise<unknown> {
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  canvas.addEventListener("webglcontextcreationerror", (event) =>
    console.error(String(Reflect.get(event, "statusMessage")))
  );
  const doc = nativeGame3dDocument.parse(fixture.document),
    prepared = new Map(Object.entries(fixture.models));
  const assets = createNativeAssetBroker({
    assets: doc.assets,
    fetchBytes: async (path) => {
      const id = doc.assets.find((entry) => entry.path === path)?.id;
      if (!id || !fixture.bytes[id]) {
        throw new Error("Unknown closed fixture asset");
      }
      return new Uint8Array(fixture.bytes[id]);
    }
  });
  await Promise.all(doc.assets.map((entry) => assets.get(entry.id)));
  const owner = await createNativeRenderer3D(
    {
      canvas,
      assets,
      prepareModel: async (id) => {
        const model = prepared.get(id);
        if (!model) {
          throw new Error("Unknown fixture model");
        }
        return model;
      }
    },
    doc
  );
  owner.resize(256, 192);
  const frame = (id: string): NativeFrame3D => {
    const scene = doc.scenes.find((value) => value.id === id);
    if (!scene) {
      throw new Error("Unknown fixture scene");
    }
    return nativeFrame3D.parse({
      dimension: "3d",
      tick: 0,
      generation: 0,
      sceneId: id,
      events: [],
      presentationEvents: [],
      hostRequests: [],
      queryResults: [],
      music: [],
      score: 0,
      health: 100,
      logs: [],
      hud: [],
      lighting: {},
      backgrounds: [],
      camera: doc.camera,
      entities: scene.entities,
      environment: scene.environment
    });
  };
  const images = new Map<string, Uint8ClampedArray>(),
    pngs: Record<string, string> = {};
  try {
    for (const scene of doc.scenes) {
      const committed = frame(scene.id);
      owner.render(committed);
      owner.render(committed);
      owner.finishFrame();
      images.set(scene.id, pixels(canvas));
      pngs[scene.id] = canvas.toDataURL();
    }
    const required = (id: string): Uint8ClampedArray => {
      const value = images.get(id);
      if (!value) {
        throw new Error("Missing fixture image");
      }
      return value;
    };
    const differences = {
      normal: difference(required("base"), required("normal")),
      emissive: difference(required("base"), required("emissive")),
      metal: difference(required("base"), required("metal")),
      fog: difference(required("base"), required("fog")),
      sky: difference(required("metal"), required("sky")),
      shadow: difference(required("base"), required("shadow")),
      cascade: difference(required("base"), required("cascade")),
      post: difference(required("emissive"), required("post")),
      blend: difference(required("base"), required("blend"))
    };
    const stable = frame("sky");
    owner.render(stable);
    owner.render(stable);
    const before = { ...owner.stats };
    for (let count = 0; count < 120; count++) {
      owner.render({ ...stable, tick: count + 1 });
    }
    const after = { ...owner.stats };
    const sample = {
      entityId: "emitter",
      emitterId: "fog",
      position: [0, 1.2, 1],
      velocity: [0.1, 0.5, 0],
      color: [1, 0.2, 0.05],
      opacity: 0.8,
      size: 0.8,
      rotation: 0,
      age: 0.5,
      lifetime: 2,
      life: 0.25,
      render: { kind: "billboard" },
      blend: "normal",
      unlit: true,
      softness: 0.4
    };
    const particleFrame = nativeFrame3D.parse({
      ...frame("base"),
      particles: [
        sample,
        {
          ...sample,
          emitterId: "streak",
          position: [0.7, 1.2, 1],
          render: { kind: "stretched", length: 2, speedScale: 0.2 }
        },
        {
          ...sample,
          emitterId: "mesh",
          position: [-0.7, 1.2, 1],
          render: { kind: "mesh", shape: "tetrahedron", align: "world" },
          softness: 0
        }
      ]
    });
    owner.render(particleFrame);
    owner.render(particleFrame);
    owner.finishFrame();
    const particleImage = pixels(canvas);
    pngs.particles = canvas.toDataURL();
    const particleBefore = { ...owner.stats };
    for (let count = 0; count < 120; count++) {
      owner.render({ ...particleFrame, tick: count + 1 });
    }
    const particleAfter = { ...owner.stats };
    owner.finishFrame();
    const repeated = difference(particleImage, pixels(canvas));
    const gl = canvas.getContext("webgl2");
    if (!gl) {
      throw new Error("Missing WebGL fixture context");
    }
    return {
      fixture,
      overlapDepthDifference: difference(
        required("model-depth"),
        required("primitive-depth")
      ),
      differences,
      before,
      after,
      particleBefore,
      particleAfter,
      repeated,
      particlesDifference: difference(required("base"), particleImage),
      glError: gl.getError(),
      pngs
    };
  } finally {
    owner.dispose();
  }
}
