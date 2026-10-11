/**
 * Metro config.
 *
 * `mobile/` is not a root workspace — it has its own dependency tree — so the
 * shared packages it uses at runtime are wired in by hand.
 * `@nodetool-ai/app-runtime` and `@nodetool-ai/protocol` are TypeScript that
 * Metro compiles from source, so no `build:packages` is needed before
 * `expo start` and the app never runs a stale published copy. `protocol`
 * imports `zod`, which mobile declares itself: an EAS build has no root
 * `node_modules`, so `nodeModulesPaths` points the package sources at mobile's.
 * (`@nodetool-ai/timeline` is imported for types only, which Babel erases, so
 * it needs a `tsconfig.json` path and nothing here.)
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
const protocolRoot = path.resolve(repoRoot, "packages/protocol");
const protocolSrc = path.join(protocolRoot, "src");

/** Package entry points compiled from source, and the src roots they live in. */
const SOURCE_PACKAGES = [
  { name: "@nodetool-ai/app-runtime", src: appRuntimeSrc },
  { name: "@nodetool-ai/protocol", src: protocolSrc },
];

/**
 * Single modules compiled from source, mapped straight to their file.
 *
 * `protocol`'s entry point re-exports `toolSchemas`, which pulls in `zod`. The
 * modules named here are dependency-free, so code that needs only a string
 * helper imports them by the same deep specifier and does not load the
 * package root.
 */
const SOURCE_MODULES = {
  "@nodetool-ai/protocol/triggers": path.join(protocolSrc, "triggers.ts"),
  "@nodetool-ai/protocol/blend-modes": path.join(protocolSrc, "blend-modes.ts"),
  "@nodetool-ai/protocol/resource-uri": path.join(protocolSrc, "resource-uri.ts"),
};

/** Source roots whose own modules import each other by ESM `.js` specifiers. */
const SOURCE_ROOTS = [
  ...SOURCE_PACKAGES.map((pkg) => pkg.src),
  protocolSrc,
];

const config = getDefaultConfig(projectRoot);

config.projectRoot = projectRoot;
config.resolver.nodeModulesPaths = [path.join(projectRoot, "node_modules")];
config.watchFolders = [
  projectRoot,
  appRuntimeRoot,
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
    SOURCE_ROOTS.some((root) => context.originModulePath.startsWith(root))
  ) {
    return context.resolveRequest(context, moduleName.slice(0, -3), platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
