/**
 * Load image / video model lists from node-package manifests.
 *
 * Each provider's node package ships a manifest JSON describing every node
 * (endpoint, class name, output type, etc.).  This module extracts and
 * deduplicates the image and video entries so providers don't need to
 * maintain hardcoded model lists.
 */

import { createLogger, importNodeBuiltin } from "@nodetool-ai/config";
import type { ImageModel, VideoModel } from "./types.js";

const log = createLogger("nodetool.runtime.providers.manifest-models");

const _nodeModule = await importNodeBuiltin<typeof import("node:module")>(
  "node:module"
);

// ---------------------------------------------------------------------------
// Manifest entry shapes — union of Kie / FAL / Replicate conventions
// ---------------------------------------------------------------------------

interface ManifestNode {
  /** Kie uses modelId */
  modelId?: string;
  /** FAL / Replicate use endpointId */
  endpointId?: string;
  /** Kie uses title as the human-readable name */
  title?: string;
  /** FAL / Replicate use className as the human-readable name */
  className?: string;
  /** "image" | "video" | "audio" | ... */
  outputType?: string;
}

function nodeId(n: ManifestNode): string {
  return n.modelId ?? n.endpointId ?? "";
}

function nodeName(n: ManifestNode): string {
  // className often looks like "FluxSchnellRedux" — split on caps
  const raw = n.title ?? n.className ?? nodeId(n);
  // If it's PascalCase with no spaces, add spaces before capitals
  if (raw && !raw.includes(" ") && /[a-z][A-Z]/.test(raw)) {
    return raw.replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  }
  return raw;
}

/** Match a list of keyword fragments against id + name (both lowercased). */
function matchesAny(haystack: string, ...needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

function inferVideoTasks(name: string, id: string): string[] {
  const hay = `${id} ${name}`.toLowerCase();
  const tasks: string[] = [];
  // Specialized video transforms — kept out of the text/image generation lists.
  if (matchesAny(hay, "lipsync", "lip-sync", "lip sync")) {
    return ["lip_sync"];
  }
  if (matchesAny(hay, "video-to-video", "video to video", "videotovideo", "v2v")) {
    return ["video_to_video"];
  }
  if (matchesAny(hay, "text-to-video", "text to video", "texttovideo")) {
    tasks.push("text_to_video");
  }
  if (matchesAny(hay, "image-to-video", "image to video", "imagetovideo")) {
    tasks.push("image_to_video");
  }
  // Ambiguous generator — tag both so generation filtering stays strict.
  return tasks.length > 0 ? tasks : ["text_to_video", "image_to_video"];
}

/**
 * Infer the task(s) an image model serves from its id/name.
 *
 * Specialized transforms (upscale, background removal, relighting,
 * vectorization) are distinctive and mutually exclusive, so they get a single
 * specific task and stay out of the generation pickers. Everything else is a
 * general generator: t2i vs i2i can't be told apart from FAL/Replicate naming
 * (e.g. `virtual-tryon`, `multiple-angles`, `canny` are image-conditioned but
 * don't say so), so generators are tagged with BOTH generation tasks. Tagging
 * every entry means generation filtering is strict for these providers — no
 * reliance on the untagged-passes-everything fallback.
 */
function inferImageTasks(name: string, id: string): string[] {
  const hay = `${id} ${name}`.toLowerCase();
  if (matchesAny(hay, "upscal", "super-resolution", "super resolution", "superres", "esrgan", "seedvr", "clarity")) {
    return ["upscale"];
  }
  if (matchesAny(hay, "background/remove", "remove-background", "remove background", "removebackground", "rembg", "bg-remove", "/remove-bg", "background-removal", "bria/background")) {
    return ["remove_background"];
  }
  if (matchesAny(hay, "relight", "relighting", "re-light")) {
    return ["relight"];
  }
  if (matchesAny(hay, "vectorize", "vectorization", "/vectorize", "to-svg", "image-to-svg")) {
    return ["vectorize"];
  }
  return ["text_to_image", "image_to_image"];
}

// ---------------------------------------------------------------------------
// Manifest cache
// ---------------------------------------------------------------------------

const _cache = new Map<string, ManifestNode[]>();

function loadManifest(packageName: string, exportPath: string): ManifestNode[] {
  const key = `${packageName}/${exportPath}`;
  if (_cache.has(key)) return _cache.get(key)!;

  if (!_nodeModule) {
    _cache.set(key, []);
    return [];
  }
  try {
    const req = _nodeModule.createRequire(import.meta.url);
    const data = req(`${packageName}/${exportPath}`) as ManifestNode[];
    _cache.set(key, data);
    return data;
  } catch (err) {
    log.warn(`Could not load ${key}: ${err}`);
    _cache.set(key, []);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function loadVideoModels(
  packageName: string,
  exportPath: string,
  provider: string
): VideoModel[] {
  const manifest = loadManifest(packageName, exportPath);
  const seen = new Map<string, VideoModel>();

  for (const n of manifest) {
    if (n.outputType !== "video") continue;
    const id = nodeId(n);
    if (!id) continue;
    const name = nodeName(n);
    const tasks = inferVideoTasks(name, id);

    const existing = seen.get(id);
    if (existing) {
      const merged = new Set([...(existing.supportedTasks ?? []), ...tasks]);
      existing.supportedTasks = [...merged];
    } else {
      seen.set(id, { id, name, provider, supportedTasks: tasks });
    }
  }

  return [...seen.values()];
}

export function loadImageModels(
  packageName: string,
  exportPath: string,
  provider: string
): ImageModel[] {
  const manifest = loadManifest(packageName, exportPath);
  const seen = new Map<string, ImageModel>();

  for (const n of manifest) {
    const id = nodeId(n);
    if (!id || seen.has(id)) continue;
    const name = nodeName(n);
    const tasks = inferImageTasks(name, id);
    // Image-typed entries always qualify. `dict`-typed entries (FAL endpoints
    // whose response schema is an object, e.g. clarity-upscaler) are salvaged
    // only when they're recognizable image transforms, so the picker can offer
    // them under upscale/remove-background/relight/vectorize.
    const qualifies =
      n.outputType === "image" ||
      (n.outputType === "dict" && tasks.length > 0);
    if (!qualifies) continue;
    seen.set(id, { id, name, provider, supportedTasks: tasks });
  }

  return [...seen.values()];
}
