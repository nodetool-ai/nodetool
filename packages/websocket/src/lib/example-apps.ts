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
  type ApplicationResponse
} from "@nodetool-ai/protocol/api-schemas/applications.js";
import { ApiErrorCode } from "../error-codes.js";
import { throwApiError } from "../trpc/error-formatter.js";
import { importApplicationBundle } from "./applications-service.js";

const BUNDLE_SUFFIX = ".app.json";

/** What the list endpoint returns per example — no graphs, no document. */
export interface ExampleAppSummary {
  slug: string;
  name: string;
  description: string;
  /** Names of the workflows installing this app creates. */
  workflows: string[];
  operationCount: number;
}

export interface ExampleAppsOptions {
  examplesDir?: string;
  exampleAppsDir?: string;
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
  const sibling = nodePath.join(
    nodePath.dirname(options.examplesDir),
    "apps"
  );
  return existsSync(sibling) ? sibling : null;
}

function readBundle(dir: string, file: string): ApplicationBundle | null {
  try {
    return parseApplicationBundle(
      JSON.parse(readFileSync(nodePath.join(dir, file), "utf8"))
    );
  } catch {
    return null;
  }
}

const slugOf = (file: string): string => file.slice(0, -BUNDLE_SUFFIX.length);

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
    apps.push({
      slug: slugOf(file),
      name: bundle.name,
      description: bundle.description,
      workflows: bundle.workflows.map((workflow) => workflow.name),
      operationCount: bundle.app.operations.length
    });
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
  // A slug is a file name, so anything path-shaped is refused outright rather
  // than normalized into something that escapes the directory.
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return null;
  const file = `${slug}${BUNDLE_SUFFIX}`;
  if (!existsSync(nodePath.join(dir, file))) return null;
  return readBundle(dir, file);
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
  const bundle = getExampleAppBundle(options, slug);
  if (!bundle) {
    throwApiError(ApiErrorCode.NOT_FOUND, `No example app named "${slug}"`);
  }
  return importApplicationBundle(
    userId,
    importApplicationBundleInput.parse({
      bundle,
      ...(projectId ? { projectId } : {})
    })
  );
}
