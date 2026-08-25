/**
 * Metro config.
 *
 * `mobile/` is not a root workspace — it has its own dependency tree — so the
 * shared packages it uses at runtime are wired in by hand.
 * `@nodetool-ai/app-runtime` and `@nodetool-ai/timeline` are dependency-free
 * TypeScript, so Metro compiles them from source and no `build:packages` is
 * needed before `expo start`. (`@nodetool-ai/timeline` names
 * `@nodetool-ai/gpu` as a dependency, but only for a type-only `BlendMode`
 * import that Babel erases, so no GPU stack reaches the bundle.)
 *
 * Three things have to be set for that to work:
 *
 * 1. `watchFolders` — so the dev server crawls and watches the package.
 * 2. `expo.experiments.onDemandFilesystem: false` in `app.json` — with the
 *    on-demand filesystem on, `expo export` truncates `watchFolders` to the
 *    project root and reads the rest lazily, refusing anything outside the
 *    server root. Expo derives that root from the workspace root, and `mobile/`
 *    is not a workspace member, so it lands on `mobile/` itself and the export
 *    cannot see the package — even though `expo start`, which keeps
 *    `watchFolders`, can.
 * 3. `resolveRequest` — the package's source uses ESM `.js` specifiers for its
 *    own modules, which Metro does not map back to `.ts`.
 *
 * `tsconfig.json` (paths) and `jest.config.js` (moduleNameMapper) point at the
 * same source; all three must agree.
 */
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..");
const appRuntimeRoot = path.resolve(repoRoot, "packages/app-runtime");
const appRuntimeSrc = path.join(appRuntimeRoot, "src");
const timelineRoot = path.resolve(repoRoot, "packages/timeline");
const timelineSrc = path.join(timelineRoot, "src");
const gpuRoot = path.resolve(repoRoot, "packages/gpu");
const gpuSrc = path.join(gpuRoot, "src");
const protocolRoot = path.resolve(repoRoot, "packages/protocol");
const protocolSrc = path.join(protocolRoot, "src");

/** Package entry points compiled from source, and the src roots they live in. */
const SOURCE_PACKAGES = [
  { name: "@nodetool-ai/app-runtime", src: appRuntimeSrc },
  { name: "@nodetool-ai/timeline", src: timelineSrc },
  { name: "@nodetool-ai/gpu", src: gpuSrc },
];

/**
 * Single modules compiled from source, mapped straight to their file.
 *
 * `protocol`'s entry point re-exports `toolSchemas`, which pulls in `zod` — a
 * dependency mobile does not have and does not want in the bundle for one
 * string helper. The modules named here are dependency-free, so they are wired
 * individually rather than through the package root. Import them in `mobile/`
 * by the same deep specifier.
 */
const SOURCE_MODULES = {
  "@nodetool-ai/protocol/triggers": path.join(protocolSrc, "triggers.ts"),
  "@nodetool-ai/protocol/blend-modes": path.join(protocolSrc, "blend-modes.ts"),
};

const config = getDefaultConfig(projectRoot);

config.projectRoot = projectRoot;
config.watchFolders = [
  projectRoot,
  appRuntimeRoot,
  timelineRoot,
  gpuRoot,
  protocolRoot,
];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const modulePath = SOURCE_MODULES[moduleName];
  if (modulePath) {
    return { type: "sourceFile", filePath: modulePath };
  }
  const entry = SOURCE_PACKAGES.find((pkg) => pkg.name === moduleName);
  if (entry) {
    return { type: "sourceFile", filePath: path.join(entry.src, "index.ts") };
  }
  if (
    moduleName.startsWith(".") &&
    moduleName.endsWith(".js") &&
    SOURCE_PACKAGES.some((pkg) =>
      context.originModulePath.startsWith(pkg.src)
    )
  ) {
    return context.resolveRequest(context, moduleName.slice(0, -3), platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
