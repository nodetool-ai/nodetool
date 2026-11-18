/**
 * The saved state of one cloud document in the desktop app (FR11; technical
 * design, "Local data scoping and durable drafts" and "Drafts" in the
 * desktop table; WP1.15). It is the TypeScript form of the native
 * `CloudDocumentSaver` in `native/account/src/cloud_drafts.cpp`, and its
 * tests run the same scenarios (TC120, TR11):
 *
 * 1. An edit changes the in-memory document. The status is Changes waiting
 *    or Sending, never Saved.
 * 2. Within 750 ms the draft is written to the local store. Only then does
 *    the edit count as stored locally.
 * 3. The save goes to the cloud server. On acceptance the draft row is
 *    deleted and the new base stored in one transaction. Only then does the
 *    status read Saved to cloud.
 * 4. When the local write fails, the status reads Not saving at once, the
 *    edits stay in memory, and the write is retried every 2 seconds.
 *
 * persist() and send() each run one call at a time, and neither waits for
 * the other, so a slow cloud server never delays the local write of a newer
 * edit.
 */

export interface CloudBase {
  updatedAt: string;
  contentHash: string;
}

export interface CloudDocumentOptions {
  allowHistory: boolean;
  allowDownload: boolean;
  allowDuplicate: boolean;
}

export interface CloudDocumentKey {
  /** First 16 hex characters of the SHA-256 of the server origin. */
  serverKey: string;
  accountId: string;
  /** `workflow` or `timeline`. */
  kind: string;
  documentId: string;
}

export type AcceptOutcome = "deleted" | "rebased" | "stale" | "no_draft";

export type DraftState = "waiting" | "unsent";

/** One draft row. `draftId` names the write that stored it. */
export interface StoredDraft {
  key: CloudDocumentKey;
  draftId: string;
  /** The server version the draft edits. */
  base: CloudBase;
  draft: string;
  state: DraftState;
  refusal: string;
}

/**
 * The local store of drafts: the cloudLocal procedures of the desktop app's
 * server. A write answers null or false when it did not commit.
 */
export interface DraftStore {
  /** Returns the new draft id. */
  put(key: CloudDocumentKey, base: CloudBase, draft: string): Promise<string | null>;
  /** The server accepted draft `draftId`, which edited `sentBase`, and produced `base`. */
  accept(
    key: CloudDocumentKey,
    draftId: string,
    sentBase: CloudBase,
    base: CloudBase,
    role: string,
    options: CloudDocumentOptions
  ): Promise<AcceptOutcome | null>;
  /** Whether the call committed. A draft that changed since the send stays waiting. */
  markUnsent(key: CloudDocumentKey, draftId: string, reason: string): Promise<boolean>;
}

export type SaveStatus = "ok" | "refused" | "offline" | "signedOut";

export interface SaveResult {
  status: SaveStatus;
  /** ok: the version the save produced, and the access the server reported. */
  base: CloudBase;
  role: string;
  options: CloudDocumentOptions;
  /** refused: the server's code, such as FILE_NOT_READABLE. */
  reason: string;
}

/** Sends one save of a whole document to the cloud server. */
export interface CloudSaver {
  save(key: CloudDocumentKey, editingInstance: string, base: CloudBase, draft: string): Promise<SaveResult>;
}

export type DocumentStatus =
  | "savedToCloud"
  | "sending"
  | "changesWaiting"
  | "offline"
  | "notSaving"
  | "unsent"
  | "signedOut";

export interface DocumentState {
  status: DocumentStatus;
  /** True while the latest edit is not yet in the local store. */
  unstoredEdits: boolean;
  /** The refusal code while `status` is unsent. */
  refusal: string;
  /** Milliseconds since the Unix epoch of the last answer from the server, 0 for none. */
  lastContactMs: number;
  /** Edits the server has not accepted yet, or 1 for a resumed draft. */
  waitingEdits: number;
}

/**
 * A draft is written once the edits pause for DRAFT_IDLE_MS, and at the
 * latest DRAFT_FORCE_MS after the first unstored edit. With a tick at least
 * every 250 ms, every edit reaches the store within DRAFT_MAX_DELAY_MS.
 */
export const DRAFT_IDLE_MS = 200;
export const DRAFT_FORCE_MS = 500;
export const DRAFT_MAX_DELAY_MS = 750;
export const DRAFT_RETRY_MS = 2000;
export const SEND_RETRY_MS = 5000;
/** How often the document's tick runs. */
export const SAVER_TICK_MS = 250;

/** A new editing instance id: 128 random bits as 32 lower-case hex characters. */
export function newEditingInstance(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

interface Sent {
  draftId: string;
  sentBase: CloudBase;
  result: SaveResult;
  /** The edit count the sent draft holds. */
  edits: number;
}

export class CloudDocumentSaver {
  readonly editingInstance = newEditingInstance();
  private readonly key: CloudDocumentKey;

  private unstored: string | null = null;
  private firstUnstoredMs = 0;
  private lastEditMs = 0;
  private editCount = 0;
  /** The edit count of the stored draft, and of the newest accepted one. */
  private storedEdits = 0;
  private acceptedEdits = 0;
  private writeFailing = false;
  private recordFailing = false;
  private current: Omit<DocumentState, "waitingEdits"> = {
    status: "savedToCloud",
    unstoredEdits: false,
    refusal: "",
    lastContactMs: 0
  };
  /** The version the next save edits: the last one the server produced. */
  private base: CloudBase;
  /** The latest stored draft, while it is not yet accepted or refused. */
  private storedId: string | null = null;
  private storedDraft = "";
  private sendPending = false;
  /** A save the server answered whose local record has not committed. */
  private unrecorded: Sent | null = null;
  private nextWriteMs = 0;
  private nextSendMs = 0;
  private writing: Promise<boolean> | null = null;
  private sending = false;

  constructor(
    private readonly store: DraftStore,
    private readonly cloud: CloudSaver,
    start: { key: CloudDocumentKey; base: CloudBase } | { resumed: StoredDraft }
  ) {
    if ("resumed" in start) {
      const resumed = start.resumed;
      this.key = resumed.key;
      this.base = resumed.base;
      this.storedId = resumed.draftId;
      this.storedDraft = resumed.draft;
      // The store keeps the draft, not the edits in it. It counts as one.
      this.editCount = 1;
      this.storedEdits = 1;
      if (resumed.state === "waiting") {
        this.sendPending = true;
        this.current.status = "changesWaiting";
      } else {
        this.current.status = "unsent";
        this.current.refusal = resumed.refusal;
      }
    } else {
      this.key = start.key;
      this.base = start.base;
    }
  }

  /** The whole in-memory document after an edit. */
  edit(document: string, nowMs: number): void {
    if (this.unstored === null) {
      this.firstUnstoredMs = nowMs;
    }
    this.unstored = document;
    this.lastEditMs = nowMs;
    this.editCount += 1;
    this.current.unstoredEdits = true;
    if (this.current.status !== "sending") {
      this.publish("changesWaiting");
    }
    this.current.refusal = "";
  }

  /** Step 2: writes the latest edit when it is due, and retries a failed write. */
  async persist(nowMs: number): Promise<void> {
    await this.write(nowMs, false);
  }

  /**
   * Writes the latest edit now, without waiting for the delay or a retry,
   * such as when the document closes. False when an edit is still only in
   * memory.
   */
  async flush(nowMs: number): Promise<boolean> {
    if (this.writing) {
      await this.writing;
    }
    return this.write(nowMs, true);
  }

  /**
   * Step 3: sends the stored draft, records the acceptance or refusal
   * locally, and retries a failed step. A local record that failed is
   * retried alone, never by sending again.
   */
  async send(nowMs: number): Promise<void> {
    if (this.sending || nowMs < this.nextSendMs) {
      return;
    }
    let sent: Sent;
    let draft = "";
    let retryRecord = false;
    if (this.unrecorded) {
      sent = this.unrecorded;
      retryRecord = true;
    } else if (this.sendPending && this.storedId !== null) {
      sent = {
        draftId: this.storedId,
        sentBase: this.base,
        edits: this.storedEdits,
        result: { status: "offline", base: this.base, role: "", options: NO_OPTIONS, reason: "" }
      };
      draft = this.storedDraft;
    } else {
      return;
    }
    this.sending = true;
    try {
      if (retryRecord) {
        // The server already answered this save. Only the local record is
        // retried, so the server never sees the same draft twice.
        if (sent.result.status === "ok") {
          await this.recordAcceptance(sent, nowMs);
        } else {
          await this.recordRefusal(sent, nowMs);
        }
        return;
      }
      sent.result = await this.saveOrOffline(sent.sentBase, draft);
      switch (sent.result.status) {
        case "ok":
          // The server holds the new version whether or not the local record
          // commits, so the next save edits it.
          this.base = sent.result.base;
          this.current.lastContactMs = nowMs;
          await this.recordAcceptance(sent, nowMs);
          return;
        case "refused":
          this.current.lastContactMs = nowMs;
          await this.recordRefusal(sent, nowMs);
          return;
        case "offline":
        case "signedOut":
          this.nextSendMs = nowMs + SEND_RETRY_MS;
          this.publish(sent.result.status);
          return;
      }
    } finally {
      this.sending = false;
    }
  }

  state(): DocumentState {
    return { ...this.current, waitingEdits: this.editCount - this.acceptedEdits };
  }

  /** Sets the status, or Not saving while a local write fails (FR11). */
  private publish(status: DocumentStatus): void {
    this.current.status = this.writeFailing || this.recordFailing ? "notSaving" : status;
  }

  private write(nowMs: number, force: boolean): Promise<boolean> {
    if (this.writing) {
      return Promise.resolve(false);
    }
    const run = this.writeOnce(nowMs, force).finally(() => {
      this.writing = null;
    });
    this.writing = run;
    return run;
  }

  private async writeOnce(nowMs: number, force: boolean): Promise<boolean> {
    if (this.unstored === null) {
      return true;
    }
    const due = nowMs - this.lastEditMs >= DRAFT_IDLE_MS || nowMs - this.firstUnstoredMs >= DRAFT_FORCE_MS;
    if (!force && (!due || nowMs < this.nextWriteMs)) {
      return false;
    }
    const toWrite = this.unstored;
    const base = this.base;
    const editsAtTake = this.editCount;
    let id: string | null;
    try {
      id = await this.store.put(this.key, base, toWrite);
    } catch {
      id = null;
    }
    if (id === null) {
      // Step 4. The edits stay in memory and the write is tried again.
      this.writeFailing = true;
      this.publish("notSaving");
      this.nextWriteMs = nowMs + DRAFT_RETRY_MS;
      return false;
    }
    this.writeFailing = false;
    this.storedId = id;
    this.storedDraft = toWrite;
    this.storedEdits = editsAtTake;
    this.sendPending = true;
    this.nextSendMs = Math.min(this.nextSendMs, nowMs);
    this.nextWriteMs = 0;
    if (this.editCount === editsAtTake) {
      this.unstored = null;
      this.current.unstoredEdits = false;
    } else {
      // Newer edits arrived during the write. They are due as soon as they
      // are idle, and at the latest one full delay from now.
      this.firstUnstoredMs = nowMs;
    }
    this.publish("sending");
    return this.unstored === null;
  }

  private async saveOrOffline(base: CloudBase, draft: string): Promise<SaveResult> {
    try {
      return await this.cloud.save(this.key, this.editingInstance, base, draft);
    } catch {
      return { status: "offline", base, role: "", options: NO_OPTIONS, reason: "" };
    }
  }

  private async recordAcceptance(sent: Sent, nowMs: number): Promise<boolean> {
    const result = sent.result;
    let outcome: AcceptOutcome | null;
    try {
      outcome = await this.store.accept(this.key, sent.draftId, sent.sentBase, result.base, result.role, result.options);
    } catch {
      outcome = null;
    }
    if (outcome === null) {
      this.recordFailing = true;
      this.unrecorded = sent;
      this.publish("notSaving");
      this.nextSendMs = nowMs + DRAFT_RETRY_MS;
      return false;
    }
    this.recordFailing = false;
    this.unrecorded = null;
    this.acceptedEdits = Math.max(this.acceptedEdits, sent.edits);
    const latest = this.storedId === sent.draftId;
    if (latest) {
      this.storedId = null;
      this.sendPending = false;
    }
    this.publish(this.unstored !== null || !latest ? "changesWaiting" : "savedToCloud");
    return true;
  }

  private async recordRefusal(sent: Sent, nowMs: number): Promise<boolean> {
    let marked: boolean;
    try {
      marked = await this.store.markUnsent(this.key, sent.draftId, sent.result.reason);
    } catch {
      marked = false;
    }
    if (!marked) {
      this.recordFailing = true;
      this.unrecorded = sent;
      this.publish("notSaving");
      this.nextSendMs = nowMs + DRAFT_RETRY_MS;
      return false;
    }
    this.recordFailing = false;
    this.unrecorded = null;
    if (this.storedId !== sent.draftId || this.unstored !== null) {
      // Newer edits are waiting and are sent next.
      this.publish("changesWaiting");
      return true;
    }
    this.sendPending = false;
    this.publish("unsent");
    this.current.refusal = sent.result.reason;
    return true;
  }
}

const NO_OPTIONS: CloudDocumentOptions = { allowHistory: false, allowDownload: false, allowDuplicate: false };
