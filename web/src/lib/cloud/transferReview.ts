/**
 * The review sheet of Publish to Cloud and Synchronize in the desktop app
 * (technical design WP2.14). A port of the native `TransferReview` in
 * native/account/src/cloud_transfer.cpp, so both apps ask the same
 * questions: what is sent and received per document, the documents changed
 * on both sides, deletions in their own section and off by default, and what
 * cannot be sent.
 *
 * `sendCaptureFrom` and `receiveCaptureFrom` read the local router's answers
 * (packages/protocol/src/api-schemas/cloud-transfer-local.ts) into the plain
 * shapes the review works on.
 */
import type {
  CaptureReceiveOutput,
  CaptureSendOutput,
  RunReceiveOutput
} from "@nodetool-ai/protocol/api-schemas/cloud-transfer-local.js";
import type {
  TransferFailure as ProtocolFailure,
  TransferMissingFile
} from "@nodetool-ai/protocol/api-schemas/transfer.js";

export type { TransferMissingFile };

export interface TransferOperation {
  op: string;
  kind: string;
  documentId: string;
  /** The new name of a rename. */
  name: string;
  capturedHash: string;
  baseHash: string;
}

export interface TransferFileOperation {
  op: string;
  assetId: string;
  path: string;
  hash: string;
  baseHash: string;
}

export interface TransferDocument {
  kind: string;
  localId: string;
  cloudId: string;
  name: string;
}

export interface TransferSkipped {
  kind: string;
  id: string;
  name: string;
  detail: string;
}

export interface TransferDeleted {
  kind: string;
  localId: string;
  cloudId: string;
  baseHash: string;
}

/**
 * A workspace file sent earlier and deleted from the project folder since.
 * A confirmed deletion names it with the same base hash, the delete's
 * precondition.
 */
export interface TransferDeletedFile {
  path: string;
  baseHash: string;
}

export interface SendCapture {
  transferId: string;
  firstPublication: boolean;
  operations: TransferOperation[];
  fileOperations: TransferFileOperation[];
  documents: TransferDocument[];
  /** The capture's entries as listed. A confirmation sends them back unchanged (X7, review F36). */
  missingFiles: TransferMissingFile[];
  skipped: TransferSkipped[];
  deletedLocally: TransferDeleted[];
  deletedWorkspaceFiles: TransferDeletedFile[];
  /** Documents sent from their last saved row, since their file is missing (CF3, review F56). */
  missingDocumentFiles: TransferSkipped[];
}

export type ReceiveState =
  | "new"
  | "same"
  | "cloud_changed"
  | "local_changed"
  | "both_changed"
  | "local_deleted";

export type ReceiveChoice = "receive" | "keep_local";

export interface ReceiveDocument {
  kind: string;
  cloudId: string;
  localId: string;
  name: string;
  /** The content hash of the cloud revision the review shows. */
  contentHash: string;
  state: ReceiveState;
  /** The choice taken without the person, or null when the review asks. */
  decision: ReceiveChoice | null;
  missingFiles: number;
  /** The hash of this computer's copy at the capture, empty when it has none (review F46). */
  localHash: string;
  /** Files whose cloud bytes this folder does not hold (reviews F33, F51). */
  changedFiles: number;
}

export interface ReceiveCapture {
  setId: string;
  documents: ReceiveDocument[];
}

export interface TransferFailure {
  code: string;
  kind: string;
  documentId: string;
  /** For BASE_CHANGED: the stored hash a Keep local decision names. */
  storedHash: string;
  message: string;
}

export interface KeepLocalDecision {
  kind: string;
  documentId: string;
  cloudHash: string;
}

export interface ReceiveDecision {
  kind: string;
  documentId: string;
  choice: ReceiveChoice;
}

export interface DeleteConfirmation {
  kind: string;
  cloudId: string;
  cloudHash: string;
}

export interface RefusalReceive {
  kind: string;
  cloudId: string;
  /** The cloud revision the refusal named. A newer one asks again (review F46). */
  cloudHash: string;
}

export type ReviewSection = "send" | "receive" | "choice" | "deletion" | "problem";

export interface ReviewRow {
  section: ReviewSection;
  kind: string;
  /** The local id, or the cloud id of a document this computer never had. */
  documentId: string;
  /** The cloud id, which receive decisions name. Empty for a document the cloud does not hold yet. */
  cloudId: string;
  name: string;
  /** What the row says about the document, such as `create_document` or `cloud_changed`. */
  detail: string;
  /** For a Choice row: the person's pick, null until made. */
  choice: ReceiveChoice | null;
  /**
   * For a Deletion row: the person confirmed the deletion, which deletes the
   * cloud document. The default restores it from the cloud (PRD V4 and V5).
   * For a missing-file Problem row: the send goes without the file (X7).
   */
  confirmed: boolean;
  /** For a Deletion row: the send half lists it (it can be sent). */
  sendListed: boolean;
  /** For a Deletion row: the receive half lists the cloud version (it can be restored). */
  receiveListed: boolean;
  /** For a Choice row raised by a refused send: the hash Keep local names. */
  cloudHash: string;
  /** For a Send row: the document's file is missing, so its last saved row is sent (CF3). */
  documentFileMissing: boolean;
  /**
   * For a Choice row from the receive half: the cloud revision the person
   * saw. For a Deletion row: the revision a confirmed deletion deletes
   * (review F40).
   */
  seenHash: string;
  /** For a missing-file Problem row: the file. */
  assetId: string;
}

const emptyRow = (section: ReviewSection): ReviewRow => ({
  section,
  kind: "",
  documentId: "",
  cloudId: "",
  name: "",
  detail: "",
  choice: null,
  confirmed: false,
  sendListed: false,
  receiveListed: false,
  cloudHash: "",
  documentFileMissing: false,
  seenHash: "",
  assetId: ""
});

const sameOperation = (a: TransferOperation, b: TransferOperation): boolean =>
  a.op === b.op &&
  a.kind === b.kind &&
  a.documentId === b.documentId &&
  a.name === b.name &&
  a.capturedHash === b.capturedHash &&
  a.baseHash === b.baseHash;

/**
 * The operations of `recaptured` the person did not review in `approved`.
 * A recapture that only leaves out operations, such as those of documents
 * the receive replaced, has none.
 */
export const unreviewedOperations = (
  approved: readonly TransferOperation[],
  recaptured: readonly TransferOperation[]
): TransferOperation[] =>
  recaptured.filter((op) => !approved.some((seen) => sameOperation(seen, op)));

const sameFileOperation = (a: TransferFileOperation, b: TransferFileOperation): boolean =>
  a.op === b.op && a.assetId === b.assetId && a.path === b.path && a.hash === b.hash && a.baseHash === b.baseHash;

/** The file operations of `recaptured` that are not in `approved` (review F33). */
export const unreviewedFileOperations = (
  approved: readonly TransferFileOperation[],
  recaptured: readonly TransferFileOperation[]
): TransferFileOperation[] =>
  recaptured.filter((op) => !approved.some((seen) => sameFileOperation(seen, op)));

type CapturedSend = Extract<CaptureSendOutput, { status: "captured" }>;

export const sendCaptureFrom = (captured: CapturedSend): SendCapture => ({
  transferId: captured.transfer_id,
  firstPublication: captured.first_publication,
  operations: captured.operations.map((op) => ({
    op: op.op,
    kind: op.kind,
    documentId: op.document_id,
    name: "name" in op ? op.name : "",
    capturedHash: "captured_hash" in op ? op.captured_hash : "",
    baseHash: "base_hash" in op ? op.base_hash : ""
  })),
  fileOperations: captured.file_operations.map((op) => ({
    op: op.op,
    assetId: "asset_id" in op ? op.asset_id : "",
    path: op.path,
    hash: "hash" in op ? op.hash : "",
    baseHash: op.base_hash ?? ""
  })),
  documents: captured.documents.map((document) => ({
    kind: document.kind,
    localId: document.local_id,
    cloudId: document.cloud_id,
    name: document.name
  })),
  missingFiles: captured.missing_files,
  skipped: captured.skipped.map((item) => ({
    kind: item.kind,
    id: item.id,
    name: item.name,
    detail: item.detail
  })),
  deletedLocally: captured.deleted_locally.map((item) => ({
    kind: item.kind,
    localId: item.local_id,
    cloudId: item.cloud_id,
    baseHash: item.base_hash
  })),
  deletedWorkspaceFiles: (captured.deleted_workspace_files ?? []).map((item) => ({
    path: item.path,
    baseHash: item.base_hash
  })),
  missingDocumentFiles: captured.missing_document_files.map((item) => ({
    kind: item.kind,
    id: item.id,
    name: item.name,
    detail: "document_file_missing"
  }))
});

type ReviewDocuments = CaptureReceiveOutput["documents"];

export const receiveDocumentsFrom = (documents: ReviewDocuments): ReceiveDocument[] =>
  documents.map((document) => ({
    kind: document.kind,
    cloudId: document.cloud_id,
    localId: document.local_id,
    name: document.name,
    contentHash: document.content_hash,
    state: document.status,
    decision: document.decision,
    missingFiles: document.missing_files.length,
    localHash: document.local_hash ?? "",
    changedFiles: document.changed_files
  }));

export const receiveCaptureFrom = (captured: CaptureReceiveOutput): ReceiveCapture => ({
  setId: captured.set_id,
  documents: receiveDocumentsFrom(captured.documents)
});

/** The review a waiting receive asks for, or null when the router named no documents (review F50). */
export const waitingReceiveFrom = (
  run: Extract<RunReceiveOutput, { status: "waiting_for_review" }>
): ReceiveCapture | null =>
  run.documents === undefined ? null : { setId: run.set_id, documents: receiveDocumentsFrom(run.documents) };

export const failuresFrom = (failures: readonly ProtocolFailure[]): TransferFailure[] =>
  failures.map((failure) => ({
    code: failure.code,
    kind: failure.kind ?? "",
    documentId: failure.document_id ?? "",
    storedHash: failure.stored_hash ?? "",
    message: failure.message
  }));

const EMPTY_SEND: SendCapture = {
  transferId: "",
  firstPublication: false,
  operations: [],
  fileOperations: [],
  documents: [],
  missingFiles: [],
  skipped: [],
  deletedLocally: [],
  deletedWorkspaceFiles: [],
  missingDocumentFiles: []
};

/**
 * The rows of the sheet and the person's choices on them. A plain value
 * owned by the controller that shows it.
 */
export class TransferReview {
  private readonly rowList: ReviewRow[] = [];
  private readonly missingFiles: TransferMissingFile[];

  constructor(send: SendCapture | null, receive: ReceiveCapture | null) {
    const sent = send ?? EMPTY_SEND;
    const rows = this.rowList;
    // One Deletion row per document deleted here, whichever half lists it.
    const deletionRow = (kind: string, localId: string): ReviewRow => {
      const found = rows.find((row) => row.section === "deletion" && row.kind === kind && row.documentId === localId);
      if (found) {
        return found;
      }
      const row = { ...emptyRow("deletion"), kind, documentId: localId, detail: "local_deleted" };
      rows.push(row);
      return row;
    };
    for (const document of receive?.documents ?? []) {
      if (document.state === "same" && document.changedFiles === 0) {
        continue;
      }
      const id = document.localId === "" ? document.cloudId : document.localId;
      if (document.state === "local_deleted") {
        const row = deletionRow(document.kind, id);
        row.cloudId = document.cloudId;
        row.name = document.name;
        row.receiveListed = true;
        // The cloud revision as it is now, which a cloud edit since the last
        // exchange made newer than the base (V4).
        row.seenHash = document.contentHash;
        continue;
      }
      if (document.decision === "keep_local") {
        // Kept local without a question: the send half carries it.
        continue;
      }
      rows.push({
        ...emptyRow(document.decision === null ? "choice" : "receive"),
        kind: document.kind,
        documentId: id,
        cloudId: document.cloudId,
        seenHash: document.contentHash,
        name: document.name,
        // A same document whose files changed in the cloud (review F51).
        detail: document.state === "same" ? "cloud_file_changed" : document.state
      });
    }
    for (const op of sent.operations) {
      const row = { ...emptyRow("send"), kind: op.kind, documentId: op.documentId, detail: op.op };
      // An operation names the cloud id, which is the local id until the
      // document was linked under another one.
      const document = sent.documents.find(
        (item) => item.kind === op.kind && (item.cloudId === op.documentId || item.localId === op.documentId)
      );
      if (document) {
        row.documentId = document.localId;
        row.cloudId = document.cloudId;
        row.name = document.name;
      }
      if (op.name !== "") {
        row.name = op.name;
      }
      rows.push(row);
    }
    // A document whose file is missing is still sent, from its last saved
    // row (CF3, review F56).
    for (const missing of sent.missingDocumentFiles) {
      let listed = false;
      for (const row of rows) {
        if (row.section === "send" && row.kind === missing.kind && row.documentId === missing.id) {
          row.documentFileMissing = true;
          listed = true;
        }
      }
      if (!listed) {
        rows.push({
          ...emptyRow("send"),
          kind: missing.kind,
          documentId: missing.id,
          name: missing.name,
          detail: missing.detail,
          documentFileMissing: true
        });
      }
    }
    // A file sent over its earlier version gets a row, also when no document
    // that uses it changed (review F33). A new asset file goes with its
    // document. A workspace file belongs to no document, so a new one gets a
    // row too, keyed by its path (CF5).
    for (const op of sent.fileOperations) {
      const workspaceFile = op.op === "put_workspace_file";
      if (op.baseHash === "" && !workspaceFile) {
        continue;
      }
      rows.push({
        ...emptyRow("send"),
        kind: "file",
        documentId: workspaceFile ? op.path : op.assetId,
        name: op.path,
        detail: workspaceFile && op.baseHash === "" ? "new_workspace_file" : op.op
      });
    }
    for (const deleted of sent.deletedLocally) {
      const row = deletionRow(deleted.kind, deleted.localId);
      row.cloudId = deleted.cloudId;
      row.sendListed = true;
      if (row.seenHash === "") {
        row.seenHash = deleted.baseHash;
      }
    }
    // A workspace file deleted here stays in the cloud unless the person
    // confirms it, like a document.
    for (const deleted of sent.deletedWorkspaceFiles) {
      const row = deletionRow("file", deleted.path);
      row.name = deleted.path;
      row.sendListed = true;
      row.seenHash = deleted.baseHash;
    }
    for (const skipped of sent.skipped) {
      rows.push({
        ...emptyRow("problem"),
        kind: skipped.kind,
        documentId: skipped.id,
        name: skipped.name,
        detail: skipped.detail
      });
    }
    // A missing file is sent without only once the person confirms it (X7).
    this.missingFiles = sent.missingFiles;
    for (const missing of sent.missingFiles) {
      const detail = `file ${missing.asset_id}: ${missing.reason}`;
      for (const ref of missing.documents) {
        rows.push({ ...emptyRow("problem"), kind: ref.kind, documentId: ref.document_id, detail, assetId: missing.asset_id });
      }
      if (missing.documents.length === 0) {
        rows.push({ ...emptyRow("problem"), detail, assetId: missing.asset_id });
      }
    }
  }

  get rows(): readonly ReviewRow[] {
    return this.rowList;
  }

  /**
   * The cloud refused the send because these documents changed since their
   * base: each becomes a Choice row naming the stored hash, one row per kind
   * and cloud id. A refused deletion asks for the confirmation again, of the
   * stored revision.
   */
  addRefusal(failures: readonly TransferFailure[]): void {
    const rows = this.rowList;
    for (const failure of failures) {
      if (failure.code !== "BASE_CHANGED" || failure.storedHash === "") {
        continue;
      }
      let found = false;
      // A second row that names the refused document is dropped (review F39).
      const duplicates: number[] = [];
      rows.forEach((row, index) => {
        // A deletion refused for a newer cloud revision asks again, for that
        // revision (V4, review F40).
        if (row.section === "deletion" && row.kind === failure.kind && row.cloudId === failure.documentId) {
          row.seenHash = failure.storedHash;
          row.confirmed = false;
          row.detail = "cloud_changed";
          found = true;
          return;
        }
        // A refusal names the cloud id, as the manifest does.
        const same = row.cloudId === "" ? row.documentId === failure.documentId : row.cloudId === failure.documentId;
        if (row.kind === failure.kind && same && (row.section === "send" || row.section === "choice")) {
          if (found) {
            duplicates.push(index);
            return;
          }
          row.section = "choice";
          row.detail = "both_changed";
          row.cloudHash = failure.storedHash;
          row.choice = null;
          found = true;
        }
      });
      for (const index of duplicates.reverse()) {
        rows.splice(index, 1);
      }
      if (!found) {
        rows.push({
          ...emptyRow("choice"),
          kind: failure.kind,
          documentId: failure.documentId,
          cloudId: failure.documentId,
          detail: "both_changed",
          cloudHash: failure.storedHash
        });
      }
    }
  }

  /**
   * The refused documents the person chose to receive. Their new revision is
   * not in the receive set the sheet was read with, so the controller
   * receives it before the send (review F39).
   */
  refusalsToReceive(): RefusalReceive[] {
    return this.rowList
      .filter((row) => row.section === "choice" && row.cloudHash !== "" && row.choice === "receive")
      .map((row) => ({
        kind: row.kind,
        cloudId: row.cloudId === "" ? row.documentId : row.cloudId,
        cloudHash: row.cloudHash
      }));
  }

  /**
   * The refusals the person answered already: a BASE_CHANGED refusal of a
   * document they chose Keep local for, whose stored hash is the revision
   * they saw. Any other refusal is left for addRefusal.
   */
  answeredRefusals(failures: readonly TransferFailure[]): KeepLocalDecision[] {
    const out: KeepLocalDecision[] = [];
    for (const failure of failures) {
      if (failure.code !== "BASE_CHANGED" || failure.storedHash === "") {
        continue;
      }
      const answered = this.rowList.some(
        (row) =>
          row.section === "choice" &&
          row.kind === failure.kind &&
          row.cloudId === failure.documentId &&
          row.cloudHash === "" &&
          row.choice === "keep_local" &&
          row.seenHash === failure.storedHash
      );
      if (answered) {
        out.push({ kind: failure.kind, documentId: failure.documentId, cloudHash: failure.storedHash });
      }
    }
    return out;
  }

  /** Sets the choice of Choice row `index`. Returns false for another row. */
  choose(index: number, choice: ReceiveChoice | null): boolean {
    const row = this.rowList[index];
    if (row === undefined || row.section !== "choice") {
      return false;
    }
    row.choice = choice;
    return true;
  }

  /** Confirms or withdraws the deletion of Deletion row `index`. Returns false for another row. */
  confirmDeletion(index: number, confirmed: boolean): boolean {
    const row = this.rowList[index];
    if (row === undefined || row.section !== "deletion") {
      return false;
    }
    row.confirmed = confirmed;
    return true;
  }

  /**
   * Confirms that the send goes without the missing file of Problem row
   * `index`, for every document that needs it. Returns false for another row.
   */
  confirmMissingFile(index: number, confirmed: boolean): boolean {
    const target = this.rowList[index];
    if (target === undefined || target.section !== "problem" || target.assetId === "") {
      return false;
    }
    for (const row of this.rowList) {
      if (row.section === "problem" && row.assetId === target.assetId) {
        row.confirmed = confirmed;
      }
    }
    return true;
  }

  private unconfirmedMissingFile(): boolean {
    return this.rowList.some((row) => row.section === "problem" && row.assetId !== "" && !row.confirmed);
  }

  /** Every Choice row has a pick and every missing file is confirmed (X7). Deletions never block. */
  ready(): boolean {
    return !this.unconfirmedMissingFile() && !this.rowList.some((row) => row.section === "choice" && row.choice === null);
  }

  receiveDecisions(): ReceiveDecision[] {
    const out: ReceiveDecision[] = [];
    for (const row of this.rowList) {
      // The receive names each document by its cloud id.
      if (row.section === "choice" && row.cloudHash === "" && row.choice !== null) {
        out.push({ kind: row.kind, documentId: row.cloudId, choice: row.choice });
      } else if (row.section === "deletion" && row.receiveListed) {
        // Restore from the cloud unless the person kept the deletion.
        out.push({ kind: row.kind, documentId: row.cloudId, choice: row.confirmed ? "keep_local" : "receive" });
      }
    }
    return out;
  }

  keepLocalDecisions(): KeepLocalDecision[] {
    return this.rowList
      .filter((row) => row.section === "choice" && row.cloudHash !== "" && row.choice === "keep_local")
      .map((row) => ({
        kind: row.kind,
        documentId: row.cloudId === "" ? row.documentId : row.cloudId,
        cloudHash: row.cloudHash
      }));
  }

  /** The deletions the person confirmed, each with the cloud revision the sheet showed. */
  confirmedDeletes(): DeleteConfirmation[] {
    return this.rowList
      .filter((row) => row.section === "deletion" && row.kind !== "file" && row.sendListed && row.confirmed)
      .map((row) => ({ kind: row.kind, cloudId: row.cloudId, cloudHash: row.seenHash }));
  }

  /** The workspace file deletions the person confirmed. */
  confirmedFileDeletes(): TransferDeletedFile[] {
    return this.rowList
      .filter((row) => row.section === "deletion" && row.kind === "file" && row.sendListed && row.confirmed)
      .map((row) => ({ path: row.documentId, baseHash: row.seenHash }));
  }

  /** The capture's missing files once each one is confirmed, or empty. */
  confirmedMissingFiles(): TransferMissingFile[] {
    return this.unconfirmedMissingFile() ? [] : this.missingFiles;
  }
}
