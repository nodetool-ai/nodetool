/**
 * Keeps the unsent edits of one open cloud document in the local drafts store
 * until the editor's own save lands them (FR11), for an editor whose store
 * holds one document per id and saves against the revision it loaded.
 *
 * The timeline and workflow hooks do the same for their stores. This driver
 * serves the kinds of D26 that open in the cloud window later: each kind
 * describes its editor as a `DraftableEditor`.
 *
 * A document that opens with a waiting draft from an earlier session takes the
 * draft up again as unsaved edits, so the editor's save sends it on the latest
 * revision. A draft the server refused (unsent) is left as it is, and the
 * mirror stays off for that document.
 *
 * Thread affinity: the renderer's event loop. One driver per open document.
 */
import { CloudDraftMirror, type EditorSnapshot, type MirrorStatus } from "./CloudDraftMirror";
import type { CloudDocumentKey, StoredDraft } from "./CloudDocumentSaver";
import type { LocalDraftStore } from "./localDraftStore";

/** What the driver reads of an editor. */
export interface DraftableEditor {
  /** The drafts store's kind, the same as the document's tab type. */
  readonly kind: string;
  readonly documentId: string;
  /** The revision the editor's next save edits. Null until the document loaded. */
  revision(): string | null;
  /** True while the editor holds edits the server has not accepted. */
  dirty(): boolean;
  /** A value whose identity changes with every edit. */
  content(): unknown;
  /** The whole document, as the draft stores it. */
  document(): string;
  /** Puts a stored draft into the editor as unsaved edits. False when it is not this kind's document. */
  resume(draft: StoredDraft): boolean;
}

/** What the driver reads of the drafts store. */
export type DraftStoreForDriver = Pick<LocalDraftStore, "load" | "put" | "accept" | "markUnsent">;

export class CloudWindowDraftDriver {
  private mirror: CloudDraftMirror | null = null;
  private opening = false;
  /** Set when the stored draft is unsent: the driver then never writes. */
  private off = false;
  private generation = 0;
  private lastContent: unknown;

  constructor(
    private readonly editor: DraftableEditor,
    private readonly store: DraftStoreForDriver,
    private readonly owner: { serverKey: string; accountId: string }
  ) {
    this.lastContent = editor.content();
  }

  /** Call on every change of the editor and on a timer of at most 250 ms. */
  async tick(nowMs: number): Promise<void> {
    this.notice();
    if (this.off || this.editor.revision() === null) {
      return;
    }
    if (this.mirror) {
      await this.mirror.update(this.snapshot(), nowMs);
    } else if (!this.opening) {
      this.opening = true;
      await this.open();
    }
  }

  /** What the mirror holds of the editor's edits. Null while no mirror runs: before the load, or for an unsent draft. */
  status(): MirrorStatus | null {
    return this.mirror ? this.mirror.status(this.snapshot()) : null;
  }

  /** Writes the editor's latest edits to the drafts store now, such as when the window closes. */
  async flush(): Promise<void> {
    this.notice();
    if (this.mirror) {
      await this.mirror.flush(this.snapshot());
    }
  }

  /** Counts an edit made since the last look. */
  private notice(): void {
    const content = this.editor.content();
    if (content !== this.lastContent) {
      this.generation += 1;
      this.lastContent = content;
    }
  }

  private key(): CloudDocumentKey {
    return { ...this.owner, kind: this.editor.kind, documentId: this.editor.documentId };
  }

  private snapshot(): EditorSnapshot {
    return {
      dirty: this.editor.dirty(),
      revision: this.editor.revision() ?? "",
      generation: this.generation,
      document: () => this.editor.document()
    };
  }

  private async open(): Promise<void> {
    const key = this.key();
    const loaded = await this.store.load(key);
    this.opening = false;
    if (!loaded) {
      // The store did not answer. The next tick asks again.
      return;
    }
    const stored = loaded.draft;
    if (stored && stored.state === "unsent") {
      this.off = true;
      return;
    }
    const resumed = stored && this.editor.resume(stored) ? stored : null;
    this.mirror = new CloudDraftMirror(this.store, key, resumed ? { draftId: resumed.draftId, base: resumed.base } : null);
  }
}
