/** What the bundled libav build can do, asked of node-av directly. */

import { Filter } from "node-av";

import { findEncoder, throwIfAborted } from "./av.js";

/**
 * Whether the bundled libav has encoder `name` (`libx264`, `prores_ks`, ...).
 * Replaces scanning `ffmpeg -encoders`.
 */
export async function hasEncoder(name: string, signal?: AbortSignal): Promise<boolean> {
  throwIfAborted(signal);
  return findEncoder(name) !== null;
}

/** Whether the bundled libav has filter `name` (`xfade`, `drawtext`, ...). */
export async function hasFilter(name: string, signal?: AbortSignal): Promise<boolean> {
  throwIfAborted(signal);
  return Filter.getByName(name) !== null;
}
