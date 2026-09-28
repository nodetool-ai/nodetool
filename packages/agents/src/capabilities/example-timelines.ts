import {
  getExampleTimelineBundle,
  listExampleTimelines,
  type ExampleTimelineBundle
} from "@nodetool-ai/timeline/examples/node";
import type {
  TimelineDocument,
  TimelineClip
} from "@nodetool-ai/protocol/api-schemas/timeline.js";
import type { CapabilityExport, CapabilityModule } from "./types.js";
import {
  getExampleTimelineSpec,
  listExampleTimelinesSpec
} from "./example-timelines.specs.js";

const MAX_CLIP_CHARS = 12000;

function stats(document: TimelineDocument) {
  const clips = document.clips;
  return {
    clips: clips.length,
    tracks: document.tracks.length,
    groups: clips.filter((clip) => clip.mediaType === "group").length,
    custom_animations: clips.reduce(
      (count, clip) =>
        count +
        (clip.animations ?? []).filter(
          (animation) => animation.preset === "custom"
        ).length,
      0
    ),
    effect_types: [
      ...new Set(
        clips.flatMap((clip) =>
          (clip.effects ?? []).map((effect) => effect.type)
        )
      )
    ].sort(),
    camera2d: document.camera2d != null,
    tempo: document.tempo != null,
    repeaters: clips.filter((clip) => clip.repeater != null).length,
    blend_modes: [
      ...new Set(
        clips.flatMap((clip) => (clip.blendMode ? [clip.blendMode] : []))
      )
    ].sort(),
    motion_blur: clips.filter((clip) => clip.motionBlur != null).length,
    masks: clips.filter((clip) => clip.mask != null).length
  };
}

function summary(slug: string, bundle: ExampleTimelineBundle) {
  return {
    slug,
    name: bundle.name,
    description: bundle.description,
    source: "shipped",
    read_only: true,
    duration_ms: bundle.durationMs,
    fps: bundle.fps,
    width: bundle.width,
    height: bundle.height,
    poster_uri: bundle.posterUri,
    video_uri: bundle.videoUri,
    stats: stats(bundle.document)
  };
}

const listExamples: CapabilityExport = {
  spec: listExampleTimelinesSpec,
  impl: async (_run, params) => {
    const query =
      typeof params["query"] === "string" ? params["query"].toLowerCase() : "";
    const examples = listExampleTimelines().flatMap((example) => {
      if (
        query &&
        !`${example.slug} ${example.name} ${example.description}`
          .toLowerCase()
          .includes(query)
      ) {
        return [];
      }
      const bundle = getExampleTimelineBundle({}, example.slug);
      return bundle ? [summary(example.slug, bundle)] : [];
    });
    return { examples, count: examples.length };
  }
};

function sceneClips(
  document: TimelineDocument,
  scene: TimelineClip | undefined,
  durationMs: number
): TimelineClip[] {
  const start = scene?.startMs ?? 0;
  const end = start + (scene?.durationMs ?? durationMs);
  if (!scene) {
    return document.clips.filter(
      (clip) => clip.startMs < end && clip.startMs + clip.durationMs > start
    );
  }
  const children = new Map<string, TimelineClip[]>();
  for (const clip of document.clips) {
    if (!clip.parentId) {
      continue;
    }
    const bucket = children.get(clip.parentId) ?? [];
    bucket.push(clip);
    children.set(clip.parentId, bucket);
  }
  const selected = new Set<string>();
  const queue = [scene];
  for (let index = 0; index < queue.length; index += 1) {
    const clip = queue[index];
    if (!clip || selected.has(clip.id)) {
      continue;
    }
    selected.add(clip.id);
    queue.push(...(children.get(clip.id) ?? []));
  }
  // Parent transforms are part of the selected scene, including nested scenes.
  const byId = new Map(document.clips.map((clip) => [clip.id, clip]));
  let parentId = scene.parentId;
  while (parentId && !selected.has(parentId)) {
    selected.add(parentId);
    parentId = byId.get(parentId)?.parentId;
  }
  return document.clips.filter(
    (clip) =>
      selected.has(clip.id) ||
      (!clip.parentId &&
        clip.mediaType !== "group" &&
        clip.startMs < end &&
        clip.startMs + clip.durationMs > start)
  );
}

const getExample: CapabilityExport = {
  spec: getExampleTimelineSpec,
  impl: async (_run, params) => {
    const slug = params["slug"];
    if (typeof slug !== "string" || !slug) {
      return { error: "slug is required. Use list_example_timelines." };
    }
    const bundle = getExampleTimelineBundle({}, slug);
    if (!bundle) {
      return {
        error: `No shipped example timeline named "${slug}". Use an exact slug from list_example_timelines.`
      };
    }
    const groups = bundle.document.clips
      .filter((clip) => clip.mediaType === "group")
      .sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
    const sceneId = params["scene_id"];
    if (sceneId !== undefined && typeof sceneId !== "string") {
      return { error: "scene_id must be an exact group id." };
    }
    const scene =
      sceneId === undefined
        ? (groups.find((group) => !group.parentId) ?? groups[0])
        : groups.find((group) => group.id === sceneId);
    if (sceneId !== undefined && !scene) {
      return {
        error: `No scene group "${sceneId}" in ${slug}. Omit scene_id to read its scene catalog.`
      };
    }
    const offset = params["clip_offset"] ?? 0;
    const limit = params["clip_limit"] ?? 12;
    if (
      typeof offset !== "number" ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      typeof limit !== "number" ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 40
    ) {
      return {
        error:
          "clip_offset must be a nonnegative integer and clip_limit an integer from 1 to 40."
      };
    }
    const candidates = sceneClips(bundle.document, scene, bundle.durationMs);
    const clips: TimelineClip[] = [];
    const omitted: string[] = [];
    let size = 0;
    let cursor = Math.min(offset, candidates.length);
    for (; cursor < candidates.length && clips.length < limit; cursor += 1) {
      const clip = candidates[cursor];
      if (!clip) {
        continue;
      }
      const chars = JSON.stringify(clip).length;
      if (chars > MAX_CLIP_CHARS) {
        omitted.push(clip.id);
        continue;
      }
      if (size + chars > MAX_CLIP_CHARS) {
        break;
      }
      clips.push(clip);
      size += chars;
    }
    const trackIds = new Set(clips.map((clip) => clip.trackId));
    return {
      ...summary(slug, bundle),
      scenes: groups.map((group) => ({
        id: group.id,
        name: group.name,
        parent_id: group.parentId,
        start_ms: group.startMs,
        end_ms: group.startMs + group.durationMs
      })),
      excerpt: {
        scene_id: scene?.id ?? null,
        start_ms: scene?.startMs ?? 0,
        end_ms: scene ? scene.startMs + scene.durationMs : bundle.durationMs,
        tracks: bundle.document.tracks.filter((track) =>
          trackIds.has(track.id)
        ),
        clips,
        markers: [],
        camera2d: bundle.document.camera2d,
        tempo: bundle.document.tempo,
        total_clips: candidates.length,
        clip_offset: offset,
        next_clip_offset: cursor < candidates.length ? cursor : null,
        truncated: cursor < candidates.length || omitted.length > 0,
        omitted_clip_ids: omitted,
        note: "Times use the original timeline clock. Merge clip pages before rendering a scene. Oversized omitted clips require the installed example for rendering."
      }
    };
  }
};

export const module: CapabilityModule = {
  module: "example-timelines",
  exports: [listExamples, getExample]
};
