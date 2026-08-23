/**
 * The persistence a local (no-server) run gets: assets and timeline sequences,
 * against the same database `setupDb()` opens.
 *
 * Installed process-wide by each command that runs a graph, so every context
 * built downstream answers the same way. Wiring it per-entrance is what let
 * `nodetool debug` and `nodetool workflows run` disagree: a workflow that
 * saved an image ran under one and threw "ProcessingContext model interface
 * 'createAsset' is not configured" under the other.
 *
 * `createAsset` is the server's own implementation, imported rather than
 * rewritten — the local copy this replaced wrote no thumbnail and left
 * `parent_id` null, so a CLI-generated asset was invisible in every
 * folder-scoped listing in the UI.
 */

import { TimelineSequence } from "@nodetool-ai/models";
import type { ProcessingContextModelInterfaces } from "@nodetool-ai/runtime";
import { setDefaultModelInterfaces } from "@nodetool-ai/runtime";

type TimelineDocument = Parameters<
  typeof TimelineSequence.fromTimelineSequence
>[1];

export async function localModelInterfaces(): Promise<ProcessingContextModelInterfaces> {
  // The `/assets` subpath, not the package root: the root entry pulls in the
  // WebSocket runner and the HTTP server, which a local run does not need.
  const { createAssetModelInterface, updateAssetBytesModelInterface } =
    await import("@nodetool-ai/websocket/assets");
  return {
    createAsset: createAssetModelInterface,
    updateAssetBytes: updateAssetBytesModelInterface,
    // Timeline nodes persist their sequence rather than passing it down the
    // graph, so `AddClips` and everything after it needs these to run at all.
    getTimelineSequence: async ({ userId, id }) => {
      const seq = await TimelineSequence.findById(id);
      if (!seq || seq.user_id !== userId) return null;
      return seq.toTimelineSequence();
    },
    createTimelineSequence: async ({ userId, sequence }) => {
      const seq = TimelineSequence.fromTimelineSequence(
        userId,
        sequence as TimelineDocument
      );
      await seq.save();
      return seq.toTimelineSequence();
    },
    updateTimelineSequence: async ({ userId, id, sequence }) => {
      const existing = await TimelineSequence.findById(id);
      if (!existing || existing.user_id !== userId) return null;
      const next = TimelineSequence.fromTimelineSequence(
        userId,
        sequence as TimelineDocument
      );
      next.id = id;
      await next.save();
      return next.toTimelineSequence();
    }
  };
}

let installed: Promise<void> | null = null;

/** Install them as this process's default, once. */
export function installLocalModelInterfaces(): Promise<void> {
  if (!installed) {
    installed = localModelInterfaces().then((interfaces) => {
      setDefaultModelInterfaces(interfaces);
    });
  }
  return installed;
}
