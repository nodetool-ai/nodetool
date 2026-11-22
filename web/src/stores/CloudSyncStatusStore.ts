/**
 * The synchronization status of each document open in the desktop app's
 * cloud window (PRD, "Two statuses"). The drafts hooks report it after each
 * tick, and the document bar shows it in place of the editor's own save
 * readout.
 *
 * The key is the drafts kind and the document id, `<kind>:<id>`, which is
 * also the tab's type and ref.
 */
import { create } from "zustand";

import type { MirrorStatus } from "../lib/cloud/CloudDraftMirror";

export type CloudSyncStatus = "savedToCloud" | "changesWaiting" | "offline" | "notSaving";

/** The status a document shows, from what the drafts mirror holds and whether the computer is online. */
export function cloudSyncStatus(mirror: MirrorStatus, online: boolean): CloudSyncStatus {
  if (mirror === "notSaving") {
    return "notSaving";
  }
  if (mirror === "clean") {
    return "savedToCloud";
  }
  return online ? "changesWaiting" : "offline";
}

export const cloudSyncStatusKey = (kind: string, documentId: string): string => `${kind}:${documentId}`;

interface CloudSyncStatusState {
  statuses: Record<string, CloudSyncStatus>;
  /** Sets a document's status, or removes it with null when the document closes or its drafts stop. */
  report: (key: string, status: CloudSyncStatus | null) => void;
}

export const useCloudSyncStatusStore = create<CloudSyncStatusState>((set) => ({
  statuses: {},
  report: (key, status) =>
    set((state) => {
      if ((state.statuses[key] ?? null) === status) {
        return state;
      }
      const statuses = { ...state.statuses };
      if (status === null) {
        delete statuses[key];
      } else {
        statuses[key] = status;
      }
      return { statuses };
    })
}));

/** Reports a document's status from its mirror and the browser's online flag. */
export function reportCloudSyncStatus(key: string, mirror: MirrorStatus | null): void {
  const online = typeof navigator === "undefined" || navigator.onLine;
  useCloudSyncStatusStore.getState().report(key, mirror === null ? null : cloudSyncStatus(mirror, online));
}
