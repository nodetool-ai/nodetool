/**
 * Load image / video model lists from node-package manifests.
 *
 * Each provider's node package ships a manifest JSON describing every node
 * (endpoint, class name, output type, etc.).  This module extracts and
 * deduplicates the image and video entries so providers don't need to
 * maintain hardcoded model lists.
 */

import { createRequire } from "node:module";
import { createLogger } from "@nodetool-ai/config";
import type { ImageModel, VideoModel } from "./types.js";

const log = createLogger("nodetool.runtime.providers.manifest-models");

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

function inferVideoTasks(name: string): string[] {
  const tl = name.toLowerCase();
  const tasks: string[] = [];
  if (tl.includes("text-to-video") || tl.includes("text to video") || tl.includes("texttovideo")) {
    tasks.push("text_to_video");
  }
  if (tl.includes("image-to-video") || tl.includes("image to video") || tl.includes("imagetovideo")) {
    tasks.push("image_to_video");
  }
  return tasks.length > 0 ? tasks : ["text_to_video"];
}

// ---------------------------------------------------------------------------
// Manifest cache
// ---------------------------------------------------------------------------

const _cache = new Map<string, ManifestNode[]>();

function loadManifest(packageName: string, exportPath: string): ManifestNode[] {
  const key = `${packageName}/${exportPath}`;
  if (_cache.has(key)) return _cache.get(key)!;

  try {
    const req = createRequire(import.meta.url);
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
    const tasks = inferVideoTasks(name);

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
    if (n.outputType !== "image") continue;
    const id = nodeId(n);
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.set(id, { id, name: nodeName(n), provider });
  }

  return [...seen.values()];
}
