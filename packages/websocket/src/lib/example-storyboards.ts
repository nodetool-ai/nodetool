/**
 * The shipped example storyboards: curated boards that install into a user's
 * library with their shots already directed and rendered.
 *
 * They work the way example workflows do — a file on disk, not a database row,
 * so listing one needs no user and installing one is a single insert. The
 * bundles live next to the example workflows and the example apps
 * (`packages/base-nodes/nodetool/examples/storyboards/*.storyboard.json`, built
 * by `scripts/build-example-storyboards.mjs`), and each shot's still and clip
 * are `package://` assets served from the package asset root, so no bytes are
 * copied per install.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import nodePath from "node:path";
import { Storyboard, type StoryboardResponse } from "@nodetool-ai/models";
import { packageAssetHttpPath } from "@nodetool-ai/protocol";
import {
  parseStoryboardBundle,
  type ExampleStoryboardSummary,
  type StoryboardBundle
} from "@nodetool-ai/protocol/api-schemas/storyboards.js";
import { ApiErrorCode } from "../error-codes.js";
import { throwApiError } from "../trpc/error-formatter.js";

const BUNDLE_SUFFIX = ".storyboard.json";

export interface ExampleStoryboardOptions {
  examplesDir?: string;
  exampleStoryboardsDir?: string;
}

/**
 * Where the bundles live: an explicit override, else the `storyboards` sibling
 * of the example workflows directory — the layout the monorepo, the packaged
 * backend, and the server image share.
 */
export function resolveExampleStoryboardsDir(
  options: ExampleStoryboardOptions
): string | null {
  if (options.exampleStoryboardsDir) {
    return existsSync(options.exampleStoryboardsDir)
      ? options.exampleStoryboardsDir
      : null;
  }
  if (!options.examplesDir) return null;
  const sibling = nodePath.join(
    nodePath.dirname(options.examplesDir),
    "storyboards"
  );
  return existsSync(sibling) ? sibling : null;
}

function readBundle(dir: string, file: string): StoryboardBundle | null {
  // Callers only pass names that came out of readdirSync, but resolve and
  // check containment anyway so no future caller can read outside the
  // examples directory by passing a path-shaped name.
  const root = nodePath.resolve(dir);
  const target = nodePath.resolve(root, file);
  if (target !== root && !target.startsWith(root + nodePath.sep)) return null;
  try {
    return parseStoryboardBundle(JSON.parse(readFileSync(target, "utf8")));
  } catch {
    return null;
  }
}

const slugOf = (file: string): string => file.slice(0, -BUNDLE_SUFFIX.length);

function bundleFiles(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((file) => file.endsWith(BUNDLE_SUFFIX))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function summarize(slug: string, bundle: StoryboardBundle): ExampleStoryboardSummary {
  const shots = bundle.document.shots;
  return {
    slug,
    name: bundle.name,
    description: bundle.description,
    tags: bundle.tags,
    shotCount: shots.length,
    clipCount: shots.filter((shot) => shot.clip?.uri).length,
    aspectRatio: bundle.document.aspectRatio,
    // The board's own first still is its card image — a shipped example needs
    // no separate thumbnail file the way an example workflow does.
    thumbnailUrl: packageAssetHttpPath(shots[0]?.keyframe?.uri)
  };
}

/** Every shipped example board, sorted by slug. Invalid files are skipped. */
export function listExampleStoryboards(
  options: ExampleStoryboardOptions
): ExampleStoryboardSummary[] {
  const dir = resolveExampleStoryboardsDir(options);
  if (!dir) return [];
  const summaries: ExampleStoryboardSummary[] = [];
  for (const file of bundleFiles(dir)) {
    const bundle = readBundle(dir, file);
    if (!bundle) continue;
    summaries.push(summarize(slugOf(file), bundle));
  }
  return summaries;
}

/** One example's full bundle, or null when the slug names nothing shipped. */
export function getExampleStoryboardBundle(
  options: ExampleStoryboardOptions,
  slug: string
): StoryboardBundle | null {
  const dir = resolveExampleStoryboardsDir(options);
  if (!dir) return null;
  // Match the slug against what is actually shipped instead of building a path
  // out of it: the file name that reaches readBundle comes from the directory
  // listing, so a path-shaped slug can only fail to match.
  const file = bundleFiles(dir).find((entry) => slugOf(entry) === slug);
  if (!file) return null;
  return readBundle(dir, file);
}

/**
 * Install an example board: one row carrying the bundle's document verbatim.
 * The shots keep their `package://` stills and clips, so the installed board
 * plays immediately and the user's asset library stays untouched until they
 * render something of their own.
 */
export async function installExampleStoryboard(
  userId: string,
  options: ExampleStoryboardOptions,
  input: { slug: string; projectId?: string; name?: string }
): Promise<StoryboardResponse> {
  const bundle = getExampleStoryboardBundle(options, input.slug);
  if (!bundle) {
    throwApiError(
      ApiErrorCode.NOT_FOUND,
      `No example storyboard named "${input.slug}"`
    );
  }
  const board = new Storyboard({
    user_id: userId,
    project_id: input.projectId ?? "default",
    name: input.name ?? bundle.name,
    document: JSON.stringify(bundle.document)
  });
  await board.save();
  return board.toResponse();
}
