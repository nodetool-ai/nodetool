import {
  AmbientLight,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
  Uint32BufferAttribute
} from "three";
import {
  nativeFrame3D,
  nativeGameEnvironment3D,
  nativeGame3dDocument
} from "@nodetool-ai/protocol/native-game";
import { createNativeAssetBroker } from "../../src/native-cpp/assets.js";
import { NativeImageDecoder } from "../../src/native-cpp/image2d-verified.js";
import { createNativeDecals3D } from "../../src/native-cpp/3d-decals.js";
import { createNativePost3D } from "../../src/native-cpp/3d-post.js";
import { resolveNativeBuiltin } from "../../src/native-cpp/3d-builtins.js";

export async function nativeDecalPixels(enhanced = false): Promise<{
  top: number[];
  bottom: number[];
  outside: number[];
  steadyBuilds: number;
  afterDespawn: number;
  liveGeometries: number;
  diagnostics: string[];
  afterBadFrame: number;
  png: string;
  assetBytes: number[];
  aggregate: {
    unsplit: boolean;
    split: boolean;
    checks: number;
    boundsUntouched: boolean;
  };
}> {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  document.body.append(canvas);
  const renderer = new WebGLRenderer({
    canvas,
    alpha: false,
    antialias: false,
    preserveDrawingBuffer: true
  });
  renderer.setSize(64, 64, false);
  const scene = new Scene(),
    camera = new PerspectiveCamera(43.60281897270362, 1, 0.1, 10);
  camera.position.z = 5;
  camera.lookAt(0, 0, 0);
  const environment = nativeGameEnvironment3D.parse({
    background: "#000000",
    ambient: { color: "#ffffff", intensity: Math.PI },
    shadows: { enabled: false, mapSize: 1024, extent: 30 },
    postProcessing: {
      enabled: true,
      exposure: 1,
      toneMapping: "agx",
      antialias: "smaa"
    }
  });
  const post = await createNativePost3D(
    renderer,
    enhanced ? new Map([["scene", environment]]) : new Map(),
    resolveNativeBuiltin
  );
  scene.add(new AmbientLight("white", Math.PI));
  const receiver = new Group(),
    plane = new Mesh(
      new PlaneGeometry(4, 4),
      new MeshStandardMaterial({ color: "#101010", metalness: 0, roughness: 1 })
    );
  receiver.add(plane);
  scene.add(receiver);
  scene.updateMatrixWorld(true);
  const image = new OffscreenCanvas(1, 2),
    context = image.getContext("2d");
  if (!context) {
    throw new Error("Decal fixture image context unavailable");
  }
  context.fillStyle = "red";
  context.fillRect(0, 0, 1, 1);
  context.fillStyle = "blue";
  context.fillRect(0, 1, 1, 1);
  const bytes = new Uint8Array(
      await (await image.convertToBlob({ type: "image/png" })).arrayBuffer()
    ),
    digest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (v) => v.toString(16).padStart(2, "0")
    ).join("");
  const entry = {
    id: "mark",
    kind: "image" as const,
    path: "mark.png",
    digest,
    size: bytes.length,
    dependencies: []
  };
  const broker = createNativeAssetBroker({
      assets: [entry],
      fetchBytes: async () => bytes
    }),
    decoder = new NativeImageDecoder();
  const doc = nativeGame3dDocument.parse({
    schemaVersion: 4,
    dimension: "3d",
    engine: "native-cpp-1",
    id: "decals",
    title: "decals",
    initialSceneId: "scene",
    assets: [entry],
    scenes: [
      {
        id: "scene",
        entities: [
          { id: "receiver" },
          {
            id: "model",
            parentId: "receiver",
            visual: { kind: "model", assetId: "model" }
          }
        ]
      }
    ]
  });
  const diagnostics: string[] = [],
    decals = await createNativeDecals3D(
      scene,
      broker,
      decoder,
      doc,
      (message) => diagnostics.push(message)
    );
  const frame = nativeFrame3D.parse({
    dimension: "3d",
    tick: 0,
    generation: 0,
    sceneId: "scene",
    entities: [
      { id: "receiver" },
      { id: "model", visual: { kind: "model", assetId: "model" } },
      {
        id: "projector",
        decal3d: {
          assetId: "mark",
          receiverId: "receiver",
          size: { x: 1, y: 1, z: 1 },
          opacity: 1,
          renderOrder: 0
        }
      }
    ],
    authoredOrder: { projector: 0 },
    events: [],
    presentationEvents: [],
    hostRequests: [],
    queryResults: [],
    music: [],
    logs: [],
    hud: [],
    score: 0,
    health: 100,
    camera: {},
    lighting: {},
    backgrounds: []
  });
  const roots = new Map([["model", receiver]]),
    gl = renderer.getContext();
  const pixel = (x: number, y: number): number[] => {
    const bytes = new Uint8Array(4);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    if (gl.getError() !== gl.NO_ERROR) {
      throw new Error("Native decal GPU error");
    }
    return Array.from(bytes);
  };
  try {
    decals.sync(frame, roots);
    post.render(scene, camera, "scene");
    const top = pixel(32, 39),
      bottom = pixel(32, 24),
      outside = pixel(48, 32),
      builds = decals.projectionBuilds;
    const png = canvas.toDataURL("image/png");
    for (let i = 0; i < 120; i++) {
      decals.sync(frame, roots);
      post.render(scene, camera, "scene");
    }
    const steadyBuilds = decals.projectionBuilds - builds;
    const hugePositions = new Float32BufferAttribute(
        [-2, -2, 0, 2, -2, 0, 2, 2, 0, 100, 100, 0, 101, 100, 0, 100, 101, 0],
        3
      ),
      hugeNormals = new Float32BufferAttribute(
        [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
        3
      ),
      hugeIndices = new Uint32Array(200001 * 3);
    hugeIndices.set([0, 1, 2]);
    for (let i = 3; i < hugeIndices.length; i += 3) {
      hugeIndices.set([3, 4, 5], i);
    }
    const hugeGeometry = new BufferGeometry();
    hugeGeometry.setAttribute("position", hugePositions);
    hugeGeometry.setAttribute("normal", hugeNormals);
    hugeGeometry.setIndex(new Uint32BufferAttribute(hugeIndices, 1));
    const huge = new Mesh(hugeGeometry, plane.material);
    huge.updateMatrixWorld(true);
    const beforeAggregate = decals.aggregateChecks;
    decals.sync(frame, new Map([["model", huge]]));
    const unsplit = scene.children.every(
      (child) => child.name !== "native-decal"
    );
    const checksAfterReject = decals.aggregateChecks;
    for (let i = 0; i < 120; i++) {
      decals.sync(frame, new Map([["model", huge]]));
    }
    if (decals.aggregateChecks !== checksAfterReject) {
      throw new Error("Native aggregate receiver validation was not cached");
    }
    const partitioned = new Group(),
      smallGeometry = new BufferGeometry(),
      farGeometry = new BufferGeometry();
    smallGeometry.setAttribute(
      "position",
      new Float32BufferAttribute([-2, -2, 0, 2, -2, 0, 2, 2, 0], 3)
    );
    smallGeometry.setAttribute(
      "normal",
      new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3)
    );
    farGeometry.setAttribute(
      "position",
      new Float32BufferAttribute([100, 100, 0, 101, 100, 0, 100, 101, 0], 3)
    );
    farGeometry.setAttribute(
      "normal",
      new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3)
    );
    const farIndices = new Uint32Array(200000 * 3);
    for (let i = 0; i < farIndices.length; i += 3) {
      farIndices.set([0, 1, 2], i);
    }
    farGeometry.setIndex(new Uint32BufferAttribute(farIndices, 1));
    partitioned.add(
      new Mesh(smallGeometry, plane.material),
      new Mesh(farGeometry, plane.material)
    );
    partitioned.updateMatrixWorld(true);
    decals.sync(frame, new Map([["model", partitioned]]));
    const split = scene.children.every(
      (child) => child.name !== "native-decal"
    );
    const aggregate = {
      unsplit,
      split,
      checks: decals.aggregateChecks - beforeAggregate,
      boundsUntouched:
        hugeGeometry.boundingBox === null &&
        smallGeometry.boundingBox === null &&
        farGeometry.boundingBox === null
    };
    hugeGeometry.dispose();
    smallGeometry.dispose();
    farGeometry.dispose();
    const bad = nativeFrame3D.parse({
      ...frame,
      entities: [
        ...frame.entities.filter((entity) => entity.id !== "projector"),
        {
          ...frame.entities.find((entity) => entity.id === "projector"),
          decal3d: {
            assetId: "mark",
            receiverId: "missing",
            size: { x: 1, y: 1, z: 1 },
            opacity: 1,
            renderOrder: 0
          }
        }
      ]
    });
    decals.sync(bad, roots);
    post.render(scene, camera, "scene");
    const afterBadFrame = scene.children.filter(
      (child) => child.name === "native-decal"
    ).length;
    const removed = nativeFrame3D.parse({
      ...frame,
      entities: frame.entities.filter((entity) => entity.id !== "projector")
    });
    decals.sync(removed, roots);
    post.render(scene, camera, "scene");
    const afterDespawn = scene.children.filter(
      (child) => child.name === "native-decal"
    ).length;
    decals.dispose();
    post.render(scene, camera, "scene");
    const liveGeometries = renderer.info.memory.geometries;
    return {
      top,
      bottom,
      outside,
      steadyBuilds,
      afterDespawn,
      liveGeometries,
      diagnostics,
      afterBadFrame,
      png,
      assetBytes: Array.from(bytes),
      aggregate
    };
  } finally {
    decals.dispose();
    plane.geometry.dispose();
    plane.material.dispose();
    decoder.dispose();
    broker.dispose();
    renderer.dispose();
    post.dispose();
    canvas.remove();
  }
}
