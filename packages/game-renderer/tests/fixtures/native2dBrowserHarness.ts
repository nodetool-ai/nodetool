import {
  nativeGame2dDocument,
  nativeFrame2D,
  type NativeGame2dDocument,
  type NativeFrame2D
} from "@nodetool-ai/protocol/native-game";
import {
  NativeWasmDispatcher,
  type NativeWasmModule
} from "../../../game-runtime/src/native-browser/wasm.js";
import { createNativeAssetBroker } from "../../src/native-cpp/assets.js";
import { createNativeRenderer2D } from "../../src/native-cpp/renderer2d.js";

export async function nativePixels(
  factory: (options: {
    locateFile: (path: string) => string;
  }) => Promise<NativeWasmModule>
): Promise<{
  initial: number[];
  animated: number[];
  restored: number[];
  resized: number[];
  lostRestored: number[];
  order: Record<string, number>;
  cases: Record<string, number[]>;
  documents: Record<string, NativeGame2dDocument>;
  assetBytes: number[];
  alphaBytes: number[];
  ticks: Record<string, number>;
  textureGrowth: number;
  liveTexturesAfterDispose: number;
  completion: {
    defaultCalls: number;
    explicitCalls: number;
    lostError: string;
    disposedError: string;
  };
}> {
  const module = await factory({
    locateFile: () => "http://127.0.0.1/native-game.wasm"
  });
  module.FS.mkdirTree("/assets");
  const image = new OffscreenCanvas(2, 1),
    ctx = image.getContext("2d");
  if (!ctx) {
    throw new Error("2D fixture context");
  }
  ctx.fillStyle = "red";
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = "blue";
  ctx.fillRect(1, 0, 1, 1);
  const bytes = new Uint8Array(
    await (await image.convertToBlob({ type: "image/png" })).arrayBuffer()
  );
  module.FS.writeFile("/assets/atlas.png", bytes);
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (n) => n.toString(16).padStart(2, "0")
  ).join("");
  ctx.clearRect(0, 0, 2, 1);
  ctx.fillStyle = "#00ff00";
  ctx.fillRect(0, 0, 1, 1);
  const alphaBytes = new Uint8Array(
    await (await image.convertToBlob({ type: "image/png" })).arrayBuffer()
  );
  module.FS.writeFile("/assets/alpha.png", alphaBytes);
  const alphaDigest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", alphaBytes)),
    (n) => n.toString(16).padStart(2, "0")
  ).join("");
  const document = nativeGame2dDocument.parse({
    engine: "native-cpp-1",
    schemaVersion: 5,
    dimension: "2d",
    id: "pixels",
    title: "pixels",
    initialSceneId: "scene",
    camera2d: { width: 8, height: 8, zoom: 1 },
    assets: [
      {
        id: "alpha",
        kind: "image",
        path: "alpha.png",
        size: alphaBytes.length,
        digest: alphaDigest
      },
      {
        id: "atlas",
        kind: "image",
        path: "atlas.png",
        size: bytes.length,
        digest
      }
    ],
    scenes: [
      {
        id: "scene",
        entities: [
          {
            id: "z-authored-first",
            transform: { x: 0, y: 0 },
            sprite: { assetId: "atlas", width: 4, height: 4 },
            animator: {
              frames: [
                { x: 0, y: 0, width: 1, height: 1 },
                { x: 1, y: 0, width: 1, height: 1 }
              ],
              ticksPerFrame: 1,
              loop: true
            }
          },
          {
            id: "a-authored-last",
            transform: { x: 2, y: 2 },
            sprite: {
              assetId: "atlas",
              width: 2,
              height: 2,
              frame: { x: 1, y: 0, width: 1, height: 1 }
            }
          }
        ]
      }
    ]
  });
  const dispatcher = new NativeWasmDispatcher(module);
  let requestId = 0;
  const request = (
    operation: string,
    extra: Record<string, unknown> = {}
  ): unknown => {
    const response = dispatcher.dispatch({
      protocolVersion: 1,
      requestId: String(++requestId),
      operation,
      sessionId: "pixels",
      ...extra
    });
    if (
      typeof response !== "object" ||
      response === null ||
      !("status" in response) ||
      response.status !== "ok" ||
      !("result" in response)
    ) {
      throw new Error(JSON.stringify(response));
    }
    return response.result;
  };
  const canvas = window.document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  window.document.body.append(canvas);
  const gpu = canvas.getContext("webgl2", {
    alpha: false,
    premultipliedAlpha: true,
    antialias: false,
    preserveDrawingBuffer: true
  });
  if (!gpu) {
    throw new Error("Native texture lifetime fixture requires WebGL2");
  }
  const liveTextures = new Set<WebGLTexture>();
  const createTexture = gpu.createTexture.bind(gpu),
    deleteTexture = gpu.deleteTexture.bind(gpu);
  let textureAllocations = 0;
  let finishCalls = 0;
  const finish = gpu.finish.bind(gpu);
  gpu.finish = (): void => {
    finishCalls++;
    finish();
  };
  gpu.createTexture = (): WebGLTexture | null => {
    const texture = createTexture();
    if (texture) {
      liveTextures.add(texture);
      textureAllocations++;
    }
    return texture;
  };
  gpu.deleteTexture = (texture: WebGLTexture | null): void => {
    if (texture) {
      liveTextures.delete(texture);
    }
    deleteTexture(texture);
  };
  canvas.addEventListener("webglcontextlost", () => liveTextures.clear());
  const broker = createNativeAssetBroker({
    assets: document.assets,
    fetchBytes: async (path) => (path === "alpha.png" ? alphaBytes : bytes)
  });
  const renderer = await createNativeRenderer2D(
    { canvas, assets: broker },
    document
  );
  const finishFrame = renderer.finishFrame;
  if (!finishFrame) {
    throw new Error("Native 2D completion measurement unavailable");
  }
  const read = (): number[] => {
    const gl = canvas.getContext("webgl2");
    if (!gl) {
      throw new Error("Fixture GPU missing");
    }
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(
      0,
      0,
      canvas.width,
      canvas.height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels
    );
    const error = gl.getError();
    if (error !== gl.NO_ERROR) {
      throw new Error(`Native 2D GPU error: ${error}`);
    }
    return Array.from(pixels);
  };
  const frame = (): NativeFrame2D => nativeFrame2D.parse(request("frame"));
  try {
    request("open", { document, assetRoot: "/assets" });
    request("start");
    const initialFrame = frame();
    renderer.render(initialFrame);
    const texturesBeforeSteadyFrames = textureAllocations;
    for (let i = 0; i < 120; i++) {
      renderer.render(initialFrame);
    }
    const textureGrowth = textureAllocations - texturesBeforeSteadyFrames;
    const defaultCalls = finishCalls;
    finishFrame();
    const explicitCalls = finishCalls - defaultCalls;
    const initial = read(),
      snapshot = request("snapshot");
    request("step");
    renderer.render(frame());
    const animated = read();
    request("restore", { snapshot });
    renderer.render(frame());
    const restored = read();
    renderer.resize(32, 32, 2);
    renderer.render(frame());
    const resized = read();
    const gl = canvas.getContext("webgl2"),
      extension = gl?.getExtension("WEBGL_lose_context");
    if (!extension) {
      throw new Error("Context loss test unavailable");
    }
    const lost = new Promise<void>((resolve) =>
      canvas.addEventListener("webglcontextlost", () => resolve(), {
        once: true
      })
    );
    extension.loseContext();
    await lost;
    let lostError = "";
    try {
      finishFrame();
    } catch (error) {
      lostError = error instanceof Error ? error.message : String(error);
    }
    const restoredEvent = new Promise<void>((resolve) =>
      canvas.addEventListener("webglcontextrestored", () => resolve(), {
        once: true
      })
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    extension.restoreContext();
    await restoredEvent;
    renderer.render(frame());
    const lostRestored = read();
    request("close");
    const cases: Record<string, number[]> = {};
    const documents: Record<string, NativeGame2dDocument> = {};
    const ticks: Record<string, number> = {};
    const red = {
      assetId: "atlas",
      width: 4,
      height: 4,
      frame: { x: 0, y: 0, width: 1, height: 1 }
    };
    const blue = { ...red, frame: { x: 1, y: 0, width: 1, height: 1 } };
    const configurations: Record<string, Record<string, unknown>> = {
      ties: {
        entities: [
          { id: "z", sprite: red },
          { id: "a", sprite: blue }
        ]
      },
      facing: {
        tick: 1,
        entities: [
          {
            id: "sprite",
            body2d: { type: "kinematic", velocity: { x: -1, y: 0 } },
            sprite: {
              assetId: "atlas",
              width: 4,
              height: 2,
              faceMotion: "right"
            }
          }
        ]
      },
      zoom: {
        camera2d: { width: 8, height: 8, zoom: 2 },
        entities: [{ id: "sprite", sprite: { ...red, width: 2, height: 2 } }]
      },
      aspect: {
        camera2d: { width: 8, height: 4, zoom: 1 },
        entities: [
          {
            id: "sprite",
            transform: { x: 0, y: 2 },
            sprite: { ...red, width: 2, height: 2 }
          }
        ]
      },
      flip: {
        entities: [
          {
            id: "sprite",
            sprite: { assetId: "atlas", width: 4, height: 2, flipX: true }
          }
        ]
      },
      rotation: {
        entities: [
          {
            id: "sprite",
            transform: { x: 0, y: 0, rotation: Math.PI / 2 },
            sprite: { assetId: "atlas", width: 4, height: 2 }
          }
        ]
      },
      trim: {
        asset: { trim: { sourceWidth: 4, sourceHeight: 1, x: 2, y: 0 } },
        entities: [
          { id: "sprite", sprite: { assetId: "atlas", width: 8, height: 2 } }
        ]
      },
      pivot: {
        asset: { pivot: { x: 0, y: 0.5 } },
        entities: [
          { id: "sprite", sprite: { assetId: "atlas", width: 4, height: 2 } }
        ]
      },
      alpha: {
        entities: [
          { id: "base", sprite: blue },
          { id: "over", sprite: { ...red, opacity: 0.5 } }
        ]
      },
      tintAlpha: {
        entities: [
          { id: "base", sprite: blue },
          { id: "over", sprite: { ...red, tint: "#80ffffff" } }
        ]
      },
      alphaTexture: {
        asset: { sampling: "linear" },
        entities: [
          { id: "sprite", sprite: { assetId: "alpha", width: 4, height: 2 } }
        ]
      },
      additive: {
        entities: [
          { id: "base", sprite: blue },
          { id: "over", sprite: { ...red, opacity: 0.5, blend: "additive" } }
        ]
      },
      ambient: {
        lighting: { ambient: { color: "#ffffff", intensity: 0.5 }, points: [] },
        entities: [{ id: "sprite", sprite: red }]
      },
      unlit: {
        lighting: { ambient: { color: "#000000", intensity: 0 }, points: [] },
        entities: [{ id: "sprite", sprite: { ...red, unlit: true } }]
      },
      point: {
        lighting: {
          ambient: { color: "#000000", intensity: 0 },
          points: [
            {
              x: 0,
              y: 0,
              color: "#ffffff",
              intensity: 1,
              radius: 4,
              falloff: 1
            }
          ]
        },
        entities: [{ id: "sprite", sprite: red }]
      },
      tile: {
        entities: [
          {
            id: "tiles",
            tilemap: {
              assetId: "atlas",
              tiles: [
                { x: 2, y: 0, width: 2, height: 2, frame: red.frame },
                { x: 100000, y: 0, width: 2, height: 2, frame: blue.frame }
              ]
            }
          }
        ]
      },
      nearest: {
        entities: [
          { id: "sprite", sprite: { assetId: "atlas", width: 4, height: 2 } }
        ]
      },
      linear: {
        asset: { sampling: "linear" },
        entities: [
          { id: "sprite", sprite: { assetId: "atlas", width: 4, height: 2 } }
        ]
      },
      background: {
        backgrounds: [
          { id: "back", assetId: "atlas", width: 2, height: 2, mode: "repeatX" }
        ],
        entities: []
      },
      mirror: {
        backgrounds: [
          { id: "back", assetId: "atlas", width: 2, height: 2, mode: "mirror" }
        ],
        entities: []
      },
      scrolling: {
        tick: 60,
        backgrounds: [
          {
            id: "back",
            assetId: "atlas",
            width: 2,
            height: 2,
            mode: "none",
            scrollRate: { x: 2, y: 0 }
          }
        ],
        entities: []
      },
      parallax: {
        backgrounds: [
          {
            id: "back",
            assetId: "atlas",
            width: 2,
            height: 2,
            mode: "none",
            parallax: { x: 0, y: 0 }
          }
        ],
        entities: [
          {
            id: "camera",
            transform: { x: 2, y: 0 },
            camera2d: { width: 8, height: 8, zoom: 1 }
          }
        ]
      },
      parent: {
        entities: [
          {
            id: "parent",
            transform: {
              x: 1,
              y: 0,
              rotation: Math.PI / 2,
              scaleX: 2,
              scaleY: 1
            }
          },
          {
            id: "child",
            parentId: "parent",
            transform: { x: 1, y: 0 },
            sprite: { ...red, width: 1, height: 1 }
          }
        ]
      }
    };
    for (const [name, config] of Object.entries(configurations)) {
      const assetOverride =
        typeof config.asset === "object" && config.asset !== null
          ? config.asset
          : {};
      const caseDocument = nativeGame2dDocument.parse({
        ...document,
        camera2d: config.camera2d ?? document.camera2d,
        assets: document.assets.map((asset) => ({
          ...asset,
          ...assetOverride
        })),
        backgrounds: config.backgrounds ?? [],
        lighting: config.lighting,
        scenes: [{ id: "scene", entities: config.entities }]
      });
      const caseRenderer = await createNativeRenderer2D(
        { canvas, assets: broker },
        caseDocument
      );
      documents[name] = caseDocument;
      try {
        request("open", { document: caseDocument, assetRoot: "/assets" });
        request("start");
        const tick = typeof config.tick === "number" ? config.tick : 0;
        ticks[name] = tick;
        for (let i = 0; i < tick; i++) {
          request("step");
        }
        caseRenderer.render(frame());
        cases[name] = read();
        request("close");
      } finally {
        caseRenderer.dispose();
      }
    }
    renderer.dispose();
    let disposedError = "";
    try {
      finishFrame();
    } catch (error) {
      disposedError = error instanceof Error ? error.message : String(error);
    }
    return {
      initial,
      animated,
      restored,
      resized,
      lostRestored,
      cases,
      documents,
      assetBytes: Array.from(bytes),
      alphaBytes: Array.from(alphaBytes),
      ticks,
      textureGrowth,
      liveTexturesAfterDispose: liveTextures.size,
      completion: { defaultCalls, explicitCalls, lostError, disposedError },
      order: initialFrame.authoredOrder
    };
  } finally {
    renderer.dispose();
    renderer.dispose();
    broker.dispose();
    dispatcher.close();
    canvas.remove();
  }
}
