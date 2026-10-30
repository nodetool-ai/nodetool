import { nativeGame3dDocument, nativeFrame3D } from "@nodetool-ai/protocol/native-game";
import { createNativeBrowserSession } from "@nodetool-ai/game-runtime/native-browser";
import { createNativeAssetBroker } from "../../../../../packages/game-renderer/src/native-cpp/assets.ts";
import { createNativeRenderer3D } from "../../../../../packages/game-renderer/src/native-cpp/renderer3d.ts";
import { parseNativePreparedModel } from "../../../../../packages/game-renderer/src/native-cpp/model3d-types.ts";

const sha256 = async (bytes) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
const fetchBytes = async (path, signal) => {
  const response = await fetch(path, { signal });
  if (!response.ok) {
    throw new Error(`Probe fetch failed: ${path} (${response.status})`);
  }
  return new Uint8Array(await response.arrayBuffer());
};

window.probeReady = (async () => {
  const rawFrame = await fetchBytes("/frame.json");
  const rawProbe = await fetchBytes("/shared-probe.json");
  const probe = JSON.parse(new TextDecoder().decode(rawProbe));
  const sourceFrameDigest = await sha256(rawFrame);
  if (sourceFrameDigest !== probe.nativeFrameDigest) {
    throw new Error("Controlled frame digest does not match shared probe");
  }
  const game = nativeGame3dDocument.parse(JSON.parse(new TextDecoder().decode(await fetchBytes("/game.json"))));
  const frame = nativeFrame3D.parse(JSON.parse(new TextDecoder().decode(rawFrame)));
  if (JSON.stringify(game.assets.map(({ id, digest }) => ({ id, digest }))) !== JSON.stringify(probe.nativeAssets)) {
    throw new Error("Controlled asset inventory differs from shared probe");
  }
  const assets = createNativeAssetBroker({ assets: game.assets, fetchBytes: (path, signal) => fetchBytes(`/assets/${path}`, signal) });
  const staged = await Promise.all(game.assets.map(async (asset) => ({ path: asset.path, bytes: await assets.get(asset.id) })));
  const session = await createNativeBrowserSession({ workerUrl: new URL("/worker.js", location.href), moduleUrl: new URL("/native-game.mjs", location.href), wasmUrl: new URL("/native-game.wasm", location.href), assets: staged });
  const operations = [], diagnostics = [], failures = [], models = [];
  let renderer;
  try {
    renderer = await createNativeRenderer3D({ canvas: document.querySelector("canvas"), assets,
      onDiagnostic: (message) => diagnostics.push(message), onError: (error) => failures.push(String(error)),
      prepareModel: async (id) => {
        operations.push({ operation: "prepareModel", id });
        const response = await session.request({ protocolVersion: 1, requestId: `probe-${operations.length}`, sessionId: "probe", operation: "prepareModel", manifest: game.assets, id });
        if (response.status === "error") {
          throw new Error(response.error.message);
        }
        const model = parseNativePreparedModel(response.result);
        models.push({ id, primitives: model.meshes.reduce((count, mesh) => count + mesh.length, 0), imageDescriptors: model.images });
        return model;
      }
    }, game);
    renderer.resize(probe.resolution.width, probe.resolution.height, 1);
    renderer.render(frame);
    renderer.finishFrame();
    if (failures.length) {
      throw new Error(failures.join("\n"));
    }
    const gl = document.querySelector("canvas").getContext("webgl2");
    const debug = gl?.getExtension("WEBGL_debug_renderer_info");
    const anisotropy = gl?.getExtension("EXT_texture_filter_anisotropic");
    const graphics = gl ? { version: gl.getParameter(gl.VERSION), vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR), renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), maximumTextureAnisotropy: anisotropy ? gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 1 } : null;
    window.disposeProbe = () => { renderer.dispose(); assets.dispose(); };
    return { renderer: "native-cpp-browser-production-renderer", mode: "renderer-only-no-simulation", frameOrigin: probe.mode, sourceFrameDigest, sharedProbeDigest: await sha256(rawProbe), tick: frame.tick, resolution: probe.resolution, operations, models, diagnostics, stats: renderer.stats, wasmMetrics: session.metrics(), graphics, userAgent: navigator.userAgent };
  } catch (error) {
    renderer?.dispose();
    assets.dispose();
    throw error;
  } finally {
    await session.close();
  }
})();
