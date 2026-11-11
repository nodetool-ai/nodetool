// Build-time plugin for the guest's host modules (guest/host/), shared by
// every profile of guest/build.mjs. Which module stands in for a host
// package or a Node builtin is declared in module-contract.mjs.
//
//   - `guest-real:<specifier>` imports the real package module, also a
//     dist file the package does not export (`guest-real:@nodetool-ai/runtime/
//     providers/image-mime.js`). Only guest/host/ uses it, to take pure
//     functions from the packages instead of copying them.
//   - The runtime's own external-media-fetch.js becomes host/media-fetch.mjs,
//     so bundled runtime code fetches through the host's policy.
//   - `loadPackageAssetJson({ pkg, path }, import.meta.url)` calls with a
//     registered JSON asset are replaced by the asset itself, so a module
//     that reads one at load time works without a file system. Only assets
//     of modules in the bundle are inlined.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const hostDir = join(here, "host");

/** Resolves `@scope/pkg/sub` through the package's exports, else as a file in its dist/. */
export function resolveReal(spec) {
  const resolve = (s) => fileURLToPath(import.meta.resolve(s));
  try {
    return resolve(spec);
  } catch {
    const m = /^(@[^/]+\/[^/]+)\/(.+)$/.exec(spec);
    if (!m) throw new Error(`guest-real: cannot resolve ${spec}`);
    return join(dirname(resolve(m[1])), m[2]);
  }
}

const ASSET_CALL =
  /\bloadPackageAssetJson(?:<[^>()]*>)?\(\s*\{\s*pkg:\s*"([^"]+)",\s*path:\s*"([^"]+\.json)"\s*\},\s*import\.meta\.url\s*\)/g;

let registry;
async function registeredAssets() {
  registry ??= (await import("@nodetool-ai/config")).PACKAGE_RUNTIME_ASSETS ?? [];
  return registry;
}

export function hostModulesPlugin() {
  return {
    name: "guest-host-modules",
    setup(b) {
      b.onResolve({ filter: /^guest-real:/ }, (args) => ({ path: resolveReal(args.path.slice("guest-real:".length)) }));
      b.onResolve({ filter: /^\.\/external-media-fetch\.js$/ }, (args) =>
        /[\\/]runtime[\\/]dist[\\/]/.test(args.importer) ? { path: join(hostDir, "media-fetch.mjs") } : undefined
      );
      b.onLoad({ filter: /[\\/]dist[\\/].*\.js$/ }, async (args) => {
        const source = readFileSync(args.path, "utf8");
        if (!source.includes("loadPackageAssetJson(")) return undefined;
        const assets = await registeredAssets();
        let changed = false;
        const contents = source.replace(ASSET_CALL, (call, pkg, path) => {
          if (!assets.some((a) => a.pkg === pkg && a.path === path)) return call;
          const req = createRequire(args.path);
          let file;
          try {
            file = req.resolve(`${pkg}/${path}`);
          } catch {
            try {
              file = join(dirname(req.resolve(pkg)), path);
              readFileSync(file);
            } catch {
              return call;
            }
          }
          changed = true;
          return `(${readFileSync(file, "utf8").trim()})`;
        });
        return changed ? { contents, loader: "js", resolveDir: dirname(args.path) } : undefined;
      });
    }
  };
}
