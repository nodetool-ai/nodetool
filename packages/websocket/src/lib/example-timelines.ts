import { existsSync, readFileSync, readdirSync } from "node:fs";
import nodePath from "node:path";
import { z } from "zod";
import { TimelineSequence } from "@nodetool-ai/models";
import { parsePackageAssetUri } from "@nodetool-ai/protocol";
import {
  timelineDocument,
  type ExampleTimelineSummary
} from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { ApiErrorCode } from "../error-codes.js";
import { throwApiError } from "../trpc/error-formatter.js";

const SUFFIX = ".timeline.json";
const bundleSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  fps: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  durationMs: z.number().int().positive(),
  videoUri: z.string(),
  posterUri: z.string(),
  document: timelineDocument
});

interface ExampleTimelineOptions {
  examplesDir?: string;
}

/** Resolve the shipped timeline directory beside example workflows. */
export function resolveExampleTimelinesDir(options: ExampleTimelineOptions): string | null {
  if (!options.examplesDir) return null;
  const dir = nodePath.join(nodePath.dirname(options.examplesDir), "timelines");
  return existsSync(dir) ? dir : null;
}

function files(dir: string): string[] {
  try {
    return readdirSync(dir).filter((file) => file.endsWith(SUFFIX)).sort();
  } catch {
    return [];
  }
}

function readBundle(dir: string, file: string): z.infer<typeof bundleSchema> | null {
  try {
    return bundleSchema.parse(JSON.parse(readFileSync(nodePath.join(dir, file), "utf8")));
  } catch {
    return null;
  }
}

/** Read one validated, shipped timeline bundle by exact slug. */
export function getExampleTimelineBundle(options: ExampleTimelineOptions, slug: string) {
  const dir = resolveExampleTimelinesDir(options);
  if (!dir) return null;
  const file = files(dir).find((entry) => entry.slice(0, -SUFFIX.length) === slug);
  return file ? readBundle(dir, file) : null;
}

/** List lightweight cards for the Examples page. */
export function listExampleTimelines(options: ExampleTimelineOptions): ExampleTimelineSummary[] {
  const dir = resolveExampleTimelinesDir(options);
  if (!dir) return [];
  return files(dir).flatMap((file) => {
    const bundle = readBundle(dir, file);
    if (!bundle) return [];
    if (!parsePackageAssetUri(bundle.videoUri) || !parsePackageAssetUri(bundle.posterUri)) return [];
    return [{
      slug: file.slice(0, -SUFFIX.length),
      name: bundle.name,
      description: bundle.description,
      durationMs: bundle.durationMs,
      fps: bundle.fps,
      clipCount: bundle.document.clips.length,
      videoUri: bundle.videoUri,
      posterUri: bundle.posterUri
    }];
  });
}

/** Save an editable copy of a shipped timeline for one user. */
export async function installExampleTimeline(
  userId: string,
  options: ExampleTimelineOptions,
  input: { slug: string; projectId?: string; name?: string }
) {
  const bundle = getExampleTimelineBundle(options, input.slug);
  if (!bundle) {
    throwApiError(ApiErrorCode.NOT_FOUND, `No example timeline named "${input.slug}"`);
  }
  const sequence = new TimelineSequence({
    user_id: userId,
    project_id: input.projectId ?? "default",
    name: input.name ?? bundle.name,
    fps: bundle.fps,
    width: bundle.width,
    height: bundle.height,
    duration_ms: bundle.durationMs,
    document: JSON.stringify(bundle.document)
  });
  await sequence.save();
  return sequence.toTimelineSequence();
}
