/**
 * Metro config.
 *
 * `mobile/` is not a root workspace — it has its own dependency tree — so the
 * one shared package it uses at runtime is wired in by hand.
 * `@nodetool-ai/app-runtime` is dependency-free TypeScript, so Metro compiles it
 * from source and no `build:packages` is needed before `expo start`.
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

const config = getDefaultConfig(projectRoot);

config.projectRoot = projectRoot;
config.watchFolders = [projectRoot, appRuntimeRoot];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@nodetool-ai/app-runtime") {
    return {
      type: "sourceFile",
      filePath: path.join(appRuntimeSrc, "index.ts"),
    };
  }
  if (
    moduleName.startsWith(".") &&
    moduleName.endsWith(".js") &&
    context.originModulePath.startsWith(appRuntimeSrc)
  ) {
    return context.resolveRequest(context, moduleName.slice(0, -3), platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
