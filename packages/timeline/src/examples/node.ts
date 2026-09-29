import { existsSync, readFileSync, readdirSync } from "node:fs";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { parsePackageAssetUri } from "@nodetool-ai/protocol";
import {
  exampleTimelineBundle,
  type ExampleTimelineBundle,
  type ExampleTimelineSummary
} from "@nodetool-ai/protocol/api-schemas/timeline.js";

const SUFFIX = ".timeline.json";
const SOURCE_SUFFIX = ".source.js";
const IMPORT_LINE = /^import\s+(?:[^;]+?)\s+from\s+["']([^"']+)["'];?\s*$/gm;

export interface ExampleTimelineSource {
  readonly slug: string;
  /** The builder script's text, as shipped next to its compiled bundle. */
  readonly source: string;
  /** Every module specifier the script imports, static-import order. */
  readonly imports: readonly string[];
}

export interface ExampleTimelineOptions {
  readonly examplesDir?: string;
}

export type { ExampleTimelineBundle };

/** Shared checkout and packaged resolution for shipped timeline references. */
export function resolveExampleTimelinesDir(
  options: ExampleTimelineOptions = {}
): string | null {
  if (options.examplesDir) {
    const dir = nodePath.join(
      nodePath.dirname(options.examplesDir),
      "timelines"
    );
    return existsSync(dir) ? dir : null;
  }
  const override = process.env["NODETOOL_EXAMPLE_TIMELINES_DIR"];
  if (override) {
    return existsSync(override) ? override : null;
  }
  let cursor = nodePath.dirname(fileURLToPath(import.meta.url));
  for (let up = 0; up < 8; up += 1) {
    for (const relative of [
      "examples/timelines",
      "packages/base-nodes/nodetool/examples/timelines"
    ]) {
      const dir = nodePath.join(cursor, relative);
      if (existsSync(dir)) {
        return dir;
      }
    }
    cursor = nodePath.dirname(cursor);
  }
  return null;
}

function files(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((file) => file.endsWith(SUFFIX))
      .sort();
  } catch {
    return [];
  }
}

function readBundle(dir: string, file: string): ExampleTimelineBundle | null {
  try {
    const value: unknown = JSON.parse(
      readFileSync(nodePath.join(dir, file), "utf8")
    );
    const parsed = exampleTimelineBundle.safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Exact filenames only, so slugs cannot address paths or prefixes. */
export function getExampleTimelineBundle(
  options: ExampleTimelineOptions,
  slug: string
): ExampleTimelineBundle | null {
  const dir = resolveExampleTimelinesDir(options);
  if (!dir) {
    return null;
  }
  const file = files(dir).find(
    (entry) => entry.slice(0, -SUFFIX.length) === slug
  );
  return file ? readBundle(dir, file) : null;
}

/**
 * The builder script that produced a shipped example, read from beside its
 * compiled bundle so it ships in the packaged app and the Docker image the
 * same way the bundle itself does (`build.mjs` writes both). Exact filenames
 * only, same as {@link getExampleTimelineBundle}.
 */
export function getExampleTimelineSource(
  options: ExampleTimelineOptions,
  slug: string
): ExampleTimelineSource | null {
  const dir = resolveExampleTimelinesDir(options);
  if (!dir) {
    return null;
  }
  const file = nodePath.join(dir, `${slug}${SOURCE_SUFFIX}`);
  if (!existsSync(file)) {
    return null;
  }
  let source: string;
  try {
    source = readFileSync(file, "utf8");
  } catch {
    return null;
  }
  const imports: string[] = [];
  for (const match of source.matchAll(IMPORT_LINE)) {
    const specifier = match[1];
    if (specifier) {
      imports.push(specifier);
    }
  }
  return { slug, source, imports };
}

export function listExampleTimelines(
  options: ExampleTimelineOptions = {}
): ExampleTimelineSummary[] {
  const dir = resolveExampleTimelinesDir(options);
  if (!dir) {
    return [];
  }
  return files(dir).flatMap((file) => {
    const bundle = readBundle(dir, file);
    if (
      !bundle ||
      !parsePackageAssetUri(bundle.videoUri) ||
      !parsePackageAssetUri(bundle.posterUri)
    ) {
      return [];
    }
    return [
      {
        slug: file.slice(0, -SUFFIX.length),
        name: bundle.name,
        description: bundle.description,
        durationMs: bundle.durationMs,
        fps: bundle.fps,
        clipCount: bundle.document.clips.length,
        videoUri: bundle.videoUri,
        posterUri: bundle.posterUri
      }
    ];
  });
}
