// esbuild plugins that point node code at the guest halves of host
// capabilities. guest/build.mjs puts them ahead of every profile's own
// plugins, so they apply to the default and the parity bundle alike.
//
// gpu and image: the image nodes reach WebGPU and the image codec through
// three modules of @nodetool-ai/image-nodes (lib-shader-utils, gpu-device,
// image-io). Each import of one of them from inside the package resolves to a
// wrapper that re-exports the real module and replaces the functions that
// need a GPU device or a codec with the ones in gpu.mjs and image.mjs. The
// node files and every other export stay as they are. The shader catalog
// (gpu-catalog.mjs) is built in Node here and embedded as the module
// `nodetool:gpu-catalog`.
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGpuCatalog } from "./gpu-catalog.mjs";
import { canvasPlugins } from "./canvas-build.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/** Exports each wrapper takes from the capability module instead of the real one. */
const IMAGE_NODES_OVERRIDES = {
  "lib-shader-utils": { from: join(here, "gpu.mjs"), names: ["runShaderNode", "runRecipeNode"] },
  "gpu-device": {
    from: join(here, "gpu.mjs"),
    names: ["getGpuContext", "readbackTextureRef", "releaseRunTextures", "trackedRunTextureCount"]
  },
  "image-io": {
    from: join(here, "image.mjs"),
    names: [
      "loadSharp",
      "loadImageBytes",
      "decodeRgba",
      "imageDimensions",
      "encodeRgbaToPng",
      "encodePngFromRef",
      "resolveImageRefForTransport"
    ]
  }
};

function imageNodesDir() {
  try {
    return dirname(require.resolve("@nodetool-ai/image-nodes/nodes/image-io"));
  } catch {
    return null;
  }
}

export function capabilityPlugins() {
  const nodesDir = imageNodesDir();
  let catalog = null;
  return [
    ...canvasPlugins(),
    {
      name: "host-capabilities",
      setup(b) {
        b.onResolve({ filter: /^@napi-rs\/canvas$/ }, () => ({ path: join(here, "canvas.mjs") }));
        b.onResolve({ filter: /^\.\.\/lib\/audio-context\.js$/ }, (args) => {
          if (args.importer.includes('/audio-nodes/')) return { path: join(here, 'offline-audio.mjs') };
        });
        if (nodesDir) {
          b.onResolve({ filter: /^\.\/(lib-shader-utils|gpu-device|image-io)\.js$/ }, (args) => {
            if (args.importer && dirname(args.importer) === nodesDir) {
              return { path: join(nodesDir, args.path), namespace: "capability-wrapper" };
            }
            return undefined;
          });
          b.onLoad({ filter: /.*/, namespace: "capability-wrapper" }, (args) => {
            const override = IMAGE_NODES_OVERRIDES[basename(args.path, ".js")];
            return {
              contents: [
                `export * from ${JSON.stringify(args.path)};`,
                `export { ${override.names.join(", ")} } from ${JSON.stringify(override.from)};`
              ].join("\n"),
              loader: "js",
              resolveDir: nodesDir
            };
          });
        }
        b.onResolve({ filter: /^nodetool:gpu-catalog$/ }, () => ({ path: "gpu-catalog", namespace: "gpu-catalog" }));
        b.onLoad({ filter: /.*/, namespace: "gpu-catalog" }, async () => {
          catalog ??= JSON.stringify(await buildGpuCatalog());
          return { contents: `export default ${JSON.stringify(catalog)};`, loader: "js" };
        });
      }
    }
  ];
}
