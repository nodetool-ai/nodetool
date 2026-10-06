/**
 * The shipped example apps: curated `ApplicationBundle` files that install into
 * a user's library as a real app plus the workflows it binds.
 *
 * The bundles live next to the example workflows
 * (`packages/base-nodes/nodetool/examples/apps/*.app.json`, built by
 * `scripts/build-example-apps.mjs`) and are read straight off disk — an example
 * is a file, not a database row, so listing one needs no user and installing
 * one is just {@link importApplicationBundle} with that file's contents.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import nodePath from "node:path";
import {
  parseApplicationBundle,
  type ApplicationBundle
} from "@nodetool-ai/app-runtime";
import {
  importApplicationBundleInput,
  type ApplicationResponse,
  type ExampleAppSummary
} from "@nodetool-ai/protocol/api-schemas/applications.js";
import { isModelSelected, type ModelSelection } from "@nodetool-ai/protocol";
import { RECOMMENDED_MODELS } from "@nodetool-ai/runtime";
import { loadConfiguredProviders } from "../configured-providers.js";
import { ApiErrorCode } from "../error-codes.js";
import { deriveExampleAssetsDir } from "../example-workflows.js";
import { throwApiError } from "../trpc/error-formatter.js";
import { importApplicationBundle } from "./applications-service.js";
import { withCacheBuster } from "./example-thumbnail.js";

const BUNDLE_SUFFIX = ".app.json";
const EXAMPLES_THUMBNAILS_PREFIX = "/api/workflows/examples/thumbnails/";

export type { ExampleAppSummary };

export interface ExampleAppsOptions {
  examplesDir?: string;
  examplesAssetsFallbackDir?: string;
  exampleAppsDir?: string;
}

/**
 * The gallery art an app is shown with: `<slug>.jpg` when the app ships its
 * own art, else the JPG of the first workflow it binds, served through the
 * example-workflow thumbnail route. Null when the examples directory is
 * unknown or no such art ships.
 */
function thumbnailFor(
  bundle: ApplicationBundle,
  slug: string,
  options: ExampleAppsOptions
): string | null {
  if (!options.examplesDir) return null;
  const assetsDir = deriveExampleAssetsDir(
    options.examplesDir,
    options.examplesAssetsFallbackDir
  );
  // The app's own art wins over its first bound workflow's art.
  const first = bundle.workflows[0];
  const candidates = [`${slug}.jpg`, ...(first ? [`${first.name}.jpg`] : [])];
  for (const jpgFile of candidates) {
    const jpgPath = nodePath.join(assetsDir, jpgFile);
    if (existsSync(jpgPath)) {
      return withCacheBuster(
        `${EXAMPLES_THUMBNAILS_PREFIX}${encodeURIComponent(jpgFile)}`,
        jpgPath
      );
    }
  }
  return null;
}

/**
 * Where the bundles live: an explicit override, else the `apps` sibling of the
 * example workflows directory — the layout the monorepo and the packaged
 * backend share.
 */
export function resolveExampleAppsDir(
  options: ExampleAppsOptions
): string | null {
  if (options.exampleAppsDir) {
    return existsSync(options.exampleAppsDir) ? options.exampleAppsDir : null;
  }
  if (!options.examplesDir) return null;
  const sibling = nodePath.join(nodePath.dirname(options.examplesDir), "apps");
  return existsSync(sibling) ? sibling : null;
}

function readBundle(dir: string, file: string): ApplicationBundle | null {
  // Callers only pass names that came out of readdirSync, but resolve and
  // check containment anyway so no future caller can read outside the
  // examples directory by passing a path-shaped name.
  const root = nodePath.resolve(dir);
  const target = nodePath.resolve(root, file);
  if (target !== root && !target.startsWith(root + nodePath.sep)) return null;
  try {
    return parseApplicationBundle(JSON.parse(readFileSync(target, "utf8")));
  } catch {
    return null;
  }
}

const slugOf = (file: string): string => file.slice(0, -BUNDLE_SUFFIX.length);

const summarize = (
  bundle: ApplicationBundle,
  slug: string,
  options: ExampleAppsOptions
): ExampleAppSummary => ({
  slug,
  name: bundle.name,
  description: bundle.description,
  workflows: bundle.workflows.map((workflow) => workflow.name),
  operationCount: bundle.app.operations.length,
  thumbnailUrl: thumbnailFor(bundle, slug, options)
});

/** Every shipped example app, sorted by slug. Invalid files are skipped. */
export function listExampleApps(
  options: ExampleAppsOptions
): ExampleAppSummary[] {
  const dir = resolveExampleAppsDir(options);
  if (!dir) return [];
  let files: string[];
  try {
    files = readdirSync(dir)
      .filter((file) => file.endsWith(BUNDLE_SUFFIX))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
  const apps: ExampleAppSummary[] = [];
  for (const file of files) {
    const bundle = readBundle(dir, file);
    if (!bundle) continue;
    apps.push(summarize(bundle, slugOf(file), options));
  }
  return apps;
}

/** One example's full bundle, or null when the slug names nothing shipped. */
export function getExampleAppBundle(
  options: ExampleAppsOptions,
  slug: string
): ApplicationBundle | null {
  const dir = resolveExampleAppsDir(options);
  if (!dir) return null;
  // Match the slug against what is actually shipped instead of building a path
  // out of it: the file name that reaches readBundle comes from the directory
  // listing, so a path-shaped slug can only fail to match.
  let file: string | undefined;
  try {
    file = readdirSync(dir).find(
      (entry) => entry.endsWith(BUNDLE_SUFFIX) && slugOf(entry) === slug
    );
  } catch {
    return null;
  }
  if (!file) return null;
  return readBundle(dir, file);
}

/**
 * One example's summary, or null when the slug names nothing shipped — what a
 * recipe naming an app resolves through, so a recipe cannot advertise an app
 * this install does not have.
 */
export function getExampleAppSummary(
  options: ExampleAppsOptions,
  slug: string
): ExampleAppSummary | null {
  const bundle = getExampleAppBundle(options, slug);
  return bundle ? summarize(bundle, slug, options) : null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Shipped examples leave language models unselected, and a few name a model
 * of one provider. Pick the model a user can actually run: every language
 * model that is unselected, or whose provider is not configured, becomes the
 * first recommended model whose provider is. Models of configured providers,
 * and every model when nothing recommended is configured, stay as shipped.
 * Works on any JSON value that carries model references: a graph or a bundle.
 */
export function localizeLanguageModels<T>(
  value: T,
  configuredProviderIds: ReadonlySet<string>
): T {
  const fallback = RECOMMENDED_MODELS.find(
    (model) =>
      model.type === "language_model" &&
      model.provider !== undefined &&
      configuredProviderIds.has(model.provider)
  );
  if (!fallback) return value;
  const replacement = {
    type: "language_model",
    provider: fallback.provider,
    id: fallback.id,
    name: fallback.name,
    path: null,
    supported_tasks: []
  };
  const swap = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(swap);
    if (!isRecord(node)) return node;
    if (
      node.type === "language_model" &&
      (!isModelSelected(node as ModelSelection) ||
        !configuredProviderIds.has(String(node.provider)))
    ) {
      return { ...replacement };
    }
    return Object.fromEntries(
      Object.entries(node).map(([key, inner]) => [key, swap(inner)])
    );
  };
  return swap(value) as T;
}

/**
 * Install an example app: create the app and the workflows it binds, through
 * the same import path a user's own bundle file takes. Workflows carrying a
 * `sourceId` are created once per user, so installing two examples that share a
 * template — Photo Studio and Concept Studio both bind Image Enhance — leaves
 * one workflow row that both apps point at.
 */
export async function installExampleApp(
  userId: string,
  options: ExampleAppsOptions,
  slug: string,
  projectId?: string
): Promise<ApplicationResponse> {
  const shipped = getExampleAppBundle(options, slug);
  if (!shipped) {
    throwApiError(ApiErrorCode.NOT_FOUND, `No example app named "${slug}"`);
  }
  const configured = new Set(Object.keys(await loadConfiguredProviders(userId)));
  const bundle = localizeLanguageModels(shipped, configured);
  type ImportInputFields = { bundle: typeof bundle; projectId?: string };
  const importInput: ImportInputFields = { bundle };
  if (projectId) {
    importInput.projectId = projectId;
  }
  return importApplicationBundle(
    userId,
    importApplicationBundleInput.parse(importInput)
  );
}
