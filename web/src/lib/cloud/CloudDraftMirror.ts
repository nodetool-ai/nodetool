/**
 * Keeps a cloud document's unsent edits on this computer while the editor's
 * own save sends them (FR11; technical design, "Drafts" in the desktop
 * table).
 *
 * The editors of the cloud window already save against the revision they
 * edit and merge outside changes. What they lack is the local half of the
 * saved-state rule: an edit must reach the local store within 750 ms, and
 * leave it only after the server accepted it. The mirror does that half
 * with the timing of `CloudDocumentSaver`:
 *
 * 1. While the editor holds edits the server has not taken, the whole
 *    document is written to the local store once the edits pause for
 *    DRAFT_IDLE_MS, and at the latest DRAFT_FORCE_MS after the first
 *    unstored edit. A failed write is retried every DRAFT_RETRY_MS.
 * 2. Once the editor's save has landed and nothing is left unsaved, the
 *    stored draft is accepted against the new revision, which deletes it.
 *
 * Thread affinity: the renderer's event loop. One mirror per open cloud
 * document; the caller drives it with `update` on every change and on a
 * timer, and stops calling it when the document closes.
 */
import {
  DRAFT_FORCE_MS,
  DRAFT_IDLE_MS,
  DRAFT_RETRY_MS,
  type CloudBase,
  type CloudDocumentKey,
  type CloudDocumentOptions,
  type DraftStore
} from "./CloudDocumentSaver";
import { contentHash } from "./cloudSavers";

/** What the editor holds now. */
export interface EditorSnapshot {
  /** True while the editor holds edits the server has not accepted. */
  dirty: boolean;
  /** The revision the editor's next save edits: the last one the server produced. */
  revision: string;
  /** Counts the editor's edits. A change means a new document to store. */
  generation: number;
  /** The whole document, as the draft stores it. */
  document: () => string;
}

export type MirrorStatus = "clean" | "storing" | "stored" | "notSaving";

const NO_ACCESS: CloudDocumentOptions = { allowHistory: false, allowDownload: false, allowDuplicate: false };

export class CloudDraftMirror {
  private storedId: string | null = null;
  private storedBase: CloudBase | null = null;
  private storedGeneration = -1;
  private seenGeneration = -1;
  private firstUnstoredMs = 0;
  private lastChangeMs = 0;
  private nextWriteMs = 0;
  private failing = false;
  private busy: Promise<void> | null = null;

  constructor(
    private readonly store: DraftStore,
    private readonly key: CloudDocumentKey,
    /** A stored draft the editor took up again: it is accepted once the editor's save lands. */
    resumed: { draftId: string; base: CloudBase } | null = null,
    private readonly access: { role: string; options: CloudDocumentOptions } = { role: "editor", options: NO_ACCESS }
  ) {
    if (resumed) {
      this.storedId = resumed.draftId;
      this.storedBase = resumed.base;
    }
  }

  /** Whether the editor's latest edits are only in memory, stored, or failing to store. */
  status(snapshot: EditorSnapshot): MirrorStatus {
    if (this.failing) {
      return "notSaving";
    }
    if (!snapshot.dirty && this.storedId === null) {
      return "clean";
    }
    return snapshot.dirty && this.storedGeneration !== snapshot.generation ? "storing" : "stored";
  }

  /** Called on every change of the editor and on a timer of at most 250 ms. */
  async update(snapshot: EditorSnapshot, nowMs: number): Promise<void> {
    if (snapshot.dirty && snapshot.generation !== this.seenGeneration) {
      if (this.storedGeneration === this.seenGeneration || this.seenGeneration < 0) {
        this.firstUnstoredMs = nowMs;
      }
      this.seenGeneration = snapshot.generation;
      this.lastChangeMs = nowMs;
    }
    if (this.busy) {
      return;
    }
    this.busy = this.step(snapshot, nowMs).finally(() => {
      this.busy = null;
    });
    await this.busy;
  }

  /** Writes the latest edit now, such as when the document closes. False when it stays only in memory. */
  async flush(snapshot: EditorSnapshot): Promise<boolean> {
    if (this.busy) {
      await this.busy;
    }
    if (!snapshot.dirty || this.storedGeneration === snapshot.generation) {
      return true;
    }
    return this.write(snapshot);
  }

  private async step(snapshot: EditorSnapshot, nowMs: number): Promise<void> {
    if (snapshot.dirty) {
      if (this.storedGeneration === snapshot.generation || nowMs < this.nextWriteMs) {
        return;
      }
      const idle = nowMs - this.lastChangeMs >= DRAFT_IDLE_MS;
      const forced = nowMs - this.firstUnstoredMs >= DRAFT_FORCE_MS;
      if (idle || forced || this.failing) {
        if (!(await this.write(snapshot))) {
          this.nextWriteMs = nowMs + DRAFT_RETRY_MS;
        }
      }
      return;
    }
    if (this.storedId !== null && this.storedBase && snapshot.revision !== this.storedBase.updatedAt) {
      await this.accept(snapshot);
    }
  }

  private async write(snapshot: EditorSnapshot): Promise<boolean> {
    const generation = snapshot.generation;
    const base: CloudBase = this.storedBase && this.storedBase.updatedAt === snapshot.revision
      ? this.storedBase
      : { updatedAt: snapshot.revision, contentHash: "" };
    const draftId = await this.store.put(this.key, base, snapshot.document());
    if (draftId === null) {
      this.failing = true;
      return false;
    }
    this.failing = false;
    this.storedId = draftId;
    this.storedBase = base;
    this.storedGeneration = generation;
    return true;
  }

  private async accept(snapshot: EditorSnapshot): Promise<void> {
    if (this.storedId === null || !this.storedBase) {
      return;
    }
    const base: CloudBase = { updatedAt: snapshot.revision, contentHash: await contentHash(snapshot.document()) };
    const outcome = await this.store.accept(
      this.key,
      this.storedId,
      this.storedBase,
      base,
      this.access.role,
      this.access.options
    );
    if (outcome === null) {
      // The store did not answer. The draft stays, and the next update tries again.
      return;
    }
    // "deleted": the draft is gone. "rebased", "stale" or "no_draft": a newer
    // write or another instance owns the row now, and this one has nothing left.
    this.storedId = null;
    this.storedBase = null;
    this.storedGeneration = -1;
  }
}
