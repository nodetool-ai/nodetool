// Ported from the TransferReview cases of native/account/tests/transfer.cpp,
// so the desktop sheet and the native sheets ask the same questions.
import type { CaptureReceiveOutput, CaptureSendOutput } from "@nodetool-ai/protocol/api-schemas/cloud-transfer-local.js";
import {
  hasRequiredWork,
  receiveCaptureFrom,
  sendCaptureFrom,
  TransferReview,
  unreviewedFileOperations,
  unreviewedOperations,
  type ReceiveCapture,
  type ReceiveDocument,
  type ReviewSection,
  type SendCapture,
  type TransferMissingFile,
  type TransferOperation
} from "../transferReview";

const send = (overrides: Partial<SendCapture>): SendCapture => ({
  transferId: "",
  firstPublication: false,
  operations: [],
  fileOperations: [],
  documents: [],
  missingFiles: [],
  skipped: [],
  deletedLocally: [],
  deletedWorkspaceFiles: [],
  missingDocumentFiles: [],
  ...overrides
});

const op = (opName: string, kind: string, documentId: string, name = "", capturedHash = "", baseHash = ""): TransferOperation => ({
  op: opName,
  kind,
  documentId,
  name,
  capturedHash,
  baseHash
});

const doc = (
  kind: string,
  cloudId: string,
  localId: string,
  name: string,
  contentHash: string,
  state: ReceiveDocument["state"],
  decision: ReceiveDocument["decision"]
): ReceiveDocument => ({ kind, cloudId, localId, name, contentHash, state, decision, missingFiles: 0, localHash: "", changedFiles: 0 });

const receive = (documents: ReceiveDocument[]): ReceiveCapture => ({ setId: "", documents });

const failure = (code: string, kind: string, documentId: string, storedHash: string) => ({
  code,
  kind,
  documentId,
  storedHash,
  message: "changed"
});

const countOf = (review: TransferReview, section: ReviewSection): number =>
  review.rows.filter((row) => row.section === section).length;

const indexOf = (review: TransferReview, section: ReviewSection): number => {
  const index = review.rows.findIndex((row) => row.section === section);
  return index === -1 ? review.rows.length : index;
};

const missing = (assetId: string, reason: TransferMissingFile["reason"], documents: [string, string][]): TransferMissingFile => ({
  asset_id: assetId,
  reason,
  documents: documents.map(([kind, document_id]) => ({ kind: kind as "workflow" | "timeline", document_id }))
});

describe("TransferReview", () => {
  it("lists each document once", () => {
    const review = new TransferReview(
      send({
        operations: [op("replace_document", "workflow", "w1"), op("rename_document", "timeline", "t1", "New name")],
        deletedLocally: [{ kind: "workflow", localId: "gone", cloudId: "cloud-gone", baseHash: "base-5" }],
        skipped: [{ kind: "workflow", id: "bad", name: "Broken", detail: "invalid JSON" }],
        missingFiles: [missing("a1", "too_large", [["timeline", "t1"]])]
      }),
      receive([
        doc("timeline", "c2", "t2", "Same", "h2", "same", "receive"),
        doc("timeline", "c3", "t3", "Theirs", "h3", "cloud_changed", "receive"),
        doc("workflow", "c4", "w4", "Both", "h4", "both_changed", null),
        doc("workflow", "cloud-gone", "gone", "Deleted here", "h5", "local_deleted", null)
      ])
    );
    expect(countOf(review, "send")).toBe(2);
    expect(countOf(review, "receive")).toBe(1);
    expect(countOf(review, "choice")).toBe(1);
    // The deletion both halves list is one row.
    expect(countOf(review, "deletion")).toBe(1);
    expect(countOf(review, "problem")).toBe(2);

    // A both-changed document blocks until the person picks.
    expect(review.ready()).toBe(false);
    const choice = indexOf(review, "choice");
    expect(review.confirmDeletion(choice, true)).toBe(false);
    expect(review.choose(choice, "keep_local")).toBe(true);
    // The missing file blocks too, until the person confirms it (X7, review F36).
    expect(review.ready()).toBe(false);
    expect(review.confirmMissingFile(indexOf(review, "problem") + 1, true)).toBe(true);
    expect(review.ready()).toBe(true);

    // Deletions are off by default: the cloud version comes back (PRD V4 and V5).
    expect(review.confirmedDeletes()).toEqual([]);
    // The receive names each document by its cloud id.
    expect(review.receiveDecisions()).toEqual(
      expect.arrayContaining([
        { kind: "workflow", documentId: "cloud-gone", choice: "receive" },
        { kind: "workflow", documentId: "c4", choice: "keep_local" }
      ])
    );
    expect(review.receiveDecisions()).toHaveLength(2);

    const deletion = indexOf(review, "deletion");
    expect(review.choose(deletion, "receive")).toBe(false);
    expect(review.confirmDeletion(deletion, true)).toBe(true);
    // The confirmation names the revision the sheet showed (V4, review F40).
    expect(review.confirmedDeletes()).toEqual([{ kind: "workflow", cloudId: "cloud-gone", cloudHash: "h5" }]);
    expect(review.receiveDecisions()).toContainEqual({ kind: "workflow", documentId: "cloud-gone", choice: "keep_local" });
    // A problem row takes no choice.
    expect(review.choose(indexOf(review, "problem"), "receive")).toBe(false);
  });

  it("asks again for a refused send", () => {
    const review = new TransferReview(send({ operations: [op("replace_document", "workflow", "w1")] }), null);
    expect(review.ready()).toBe(true);
    review.addRefusal([
      failure("BASE_CHANGED", "workflow", "w1", "stored-1"),
      failure("MISSING_FILE", "workflow", "w1", ""),
      failure("BASE_CHANGED", "timeline", "t9", "stored-9")
    ]);
    expect(countOf(review, "send")).toBe(0);
    expect(countOf(review, "choice")).toBe(2);
    expect(review.ready()).toBe(false);
    review.rows.forEach((row, index) => review.choose(index, row.documentId === "w1" ? "keep_local" : "receive"));
    expect(review.ready()).toBe(true);
    expect(review.keepLocalDecisions()).toEqual([{ kind: "workflow", documentId: "w1", cloudHash: "stored-1" }]);
    // A refused send's choice is the send half's, never a receive decision.
    expect(review.receiveDecisions()).toEqual([]);
  });

  it("names the document of a send row and matches a refusal by cloud id", () => {
    const review = new TransferReview(
      send({
        operations: [op("replace_document", "workflow", "c1"), op("rename_document", "timeline", "t2", "New")],
        documents: [
          { kind: "workflow", localId: "l1", cloudId: "c1", name: "Flow" },
          { kind: "timeline", localId: "t2", cloudId: "t2", name: "Old" }
        ]
      }),
      null
    );
    expect(review.rows).toHaveLength(2);
    expect(review.rows[0]).toMatchObject({ name: "Flow", documentId: "l1", cloudId: "c1" });
    expect(review.rows[1].name).toBe("New");
    review.addRefusal([failure("BASE_CHANGED", "workflow", "c1", "stored-1")]);
    expect(countOf(review, "choice")).toBe(1);
    expect(countOf(review, "send")).toBe(1);
    review.choose(indexOf(review, "choice"), "keep_local");
    expect(review.keepLocalDecisions()).toEqual([{ kind: "workflow", documentId: "c1", cloudHash: "stored-1" }]);
  });

  it("does not ask twice for a document kept at the revision the person saw", () => {
    const review = new TransferReview(
      null,
      receive([
        doc("workflow", "c1", "w1", "Mine", "seen-1", "both_changed", null),
        doc("workflow", "c2", "w2", "Also mine", "seen-2", "both_changed", null),
        doc("workflow", "c3", "w3", "Theirs", "seen-3", "both_changed", null)
      ])
    );
    review.rows.forEach((row, index) => review.choose(index, row.cloudId === "c3" ? "receive" : "keep_local"));
    const answered = review.answeredRefusals([
      failure("BASE_CHANGED", "workflow", "c1", "seen-1"),
      failure("BASE_CHANGED", "workflow", "c2", "newer-2"),
      failure("BASE_CHANGED", "workflow", "c3", "seen-3"),
      failure("MISSING_FILE", "workflow", "c1", "")
    ]);
    expect(answered).toEqual([{ kind: "workflow", documentId: "c1", cloudHash: "seen-1" }]);
  });

  it("leaves out of a recapture only what was reviewed", () => {
    const approved = [
      op("replace_document", "workflow", "c1", "", "h1", "b1"),
      op("replace_document", "workflow", "c2", "", "h2", "b2")
    ];
    // Leaving out the received document is fine.
    expect(unreviewedOperations(approved, [approved[0]])).toEqual([]);
    // A document created here, an edit since the sheet, and a moved base are not.
    const unreviewed = unreviewedOperations(approved, [
      op("replace_document", "workflow", "c1", "", "h1", "b1"),
      op("create_document", "workflow", "n1", "", "h9", ""),
      op("replace_document", "workflow", "c2", "", "h3", "b2"),
      op("replace_document", "workflow", "c2", "", "h2", "b4")
    ]);
    expect(unreviewed).toHaveLength(3);
    expect(unreviewed[0].documentId).toBe("n1");
  });

  it("shows a file put over its earlier version as send work (review F33)", () => {
    const fileOperations = [
      { op: "put_asset_file", assetId: "a1", path: "media/still.png", hash: "h2", baseHash: "h1" },
      { op: "put_asset_file", assetId: "a2", path: "media/new.png", hash: "h3", baseHash: "" }
    ];
    const review = new TransferReview(send({ fileOperations }), null);
    expect(countOf(review, "send")).toBe(1);
    expect(review.rows[0]).toMatchObject({ documentId: "a1", detail: "put_asset_file" });
    expect(unreviewedFileOperations(fileOperations, [fileOperations[0]])).toEqual([]);
    expect(
      unreviewedFileOperations(fileOperations, [{ ...fileOperations[0], hash: "h4" }])
    ).toHaveLength(1);
  });

  it("shows new and changed workspace files as send rows keyed by path (CF5)", () => {
    const fileOperations = [
      { op: "put_workspace_file", assetId: "", path: "notes/plan.md", hash: "h2", baseHash: "h1" },
      { op: "put_workspace_file", assetId: "", path: "data/new.csv", hash: "h3", baseHash: "" }
    ];
    const review = new TransferReview(send({ fileOperations }), null);
    expect(countOf(review, "send")).toBe(2);
    expect(review.rows[0]).toMatchObject({ documentId: "notes/plan.md", detail: "put_workspace_file" });
    expect(review.rows[1]).toMatchObject({ documentId: "data/new.csv", detail: "new_workspace_file" });
    // Optional and off by default (SR7): only an included file is listed for the send.
    expect(review.includedFiles()).toEqual([]);
    expect(review.includeFile(1, true)).toBe(true);
    expect(review.includedFiles()).toEqual([{ path: "data/new.csv", hash: "h3" }]);
    expect(hasRequiredWork(send({ fileOperations }))).toBe(false);
    expect(hasRequiredWork(send({ fileOperations: [...fileOperations, { op: "put_asset_file", assetId: "a1", path: "m.png", hash: "h", baseHash: "b" }] }))).toBe(true);
  });

  it("offers the cloud's changed workspace files as Receive rows, off by default (RW7)", () => {
    const captured: CaptureReceiveOutput = {
      set_id: "s1",
      documents: [],
      workspace_files: [
        { path: "notes.txt", hash: "h1", size: 5, local_hash: null, status: "new", included: false },
        { path: "same.txt", hash: "h2", size: 5, local_hash: "h2", status: "same", included: true },
        { path: "both.txt", hash: "h3", size: 5, local_hash: "h9", status: "both_changed", included: false }
      ],
      cloud_deleted_workspace_files: ["old.txt"]
    };
    const sendFile = { op: "put_workspace_file", assetId: "", path: "mine.txt", hash: "h4", baseHash: "" };
    const review = new TransferReview(send({ fileOperations: [sendFile] }), receiveCaptureFrom(captured));
    const receiveRows = review.rows.filter((row) => row.section === "receive");
    expect(receiveRows.map((row) => [row.documentId, row.detail, row.optional, row.confirmed])).toEqual([
      ["notes.txt", "workspace_new", true, false],
      ["both.txt", "workspace_both_changed", true, false],
      ["old.txt", "workspace_cloud_deleted", false, false]
    ]);
    expect(review.includedReceiveFiles()).toEqual([]);
    const both = review.rows.findIndex((row) => row.documentId === "both.txt");
    const mine = review.rows.findIndex((row) => row.documentId === "mine.txt");
    expect(review.includeFile(both, true)).toBe(true);
    expect(review.includeFile(mine, true)).toBe(true);
    // A ticked Receive row goes to the receive only, a ticked Send row to the send only.
    expect(review.includedReceiveFiles()).toEqual([{ path: "both.txt", hash: "h3" }]);
    expect(review.includedFiles()).toEqual([{ path: "mine.txt", hash: "h4" }]);
    expect(review.includeFile(review.rows.findIndex((row) => row.documentId === "old.txt"), true)).toBe(false);
  });

  it("lists a deleted workspace file as a deletion that only a confirmation sends", () => {
    const review = new TransferReview(
      send({ deletedWorkspaceFiles: [{ path: "notes/plan.md", baseHash: "h1" }] }),
      null
    );
    expect(countOf(review, "deletion")).toBe(1);
    expect(review.confirmedFileDeletes()).toEqual([]);
    expect(review.confirmDeletion(0, true)).toBe(true);
    expect(review.confirmedFileDeletes()).toEqual([{ path: "notes/plan.md", baseHash: "h1" }]);
    expect(review.confirmedDeletes()).toEqual([]);
  });

  it("flags a document sent from its last saved row (CF3, review F56)", () => {
    const captured: CaptureSendOutput = {
      status: "captured",
      transfer_id: "fedcba9876543210fedcba9876543210",
      first_publication: false,
      operations: [
        {
          op: "replace_document",
          kind: "workflow",
          document_id: "0123456789abcdef0123456789abcdef",
          base_hash: "b".repeat(64),
          captured_hash: "c".repeat(64)
        }
      ],
      documents: [
        { kind: "workflow", local_id: "0123456789abcdef0123456789abcdef", cloud_id: "0123456789abcdef0123456789abcdef", name: "Flow" }
      ],
      file_operations: [],
      missing_files: [],
      missing_document_files: [
        { kind: "workflow", id: "0123456789abcdef0123456789abcdef", name: "Flow" },
        { kind: "timeline", id: "t1", name: "Cut" }
      ],
      skipped: [],
      deleted_locally: []
    };
    const capture = sendCaptureFrom(captured);
    expect(capture.missingDocumentFiles).toHaveLength(2);
    const review = new TransferReview(capture, null);
    expect(review.rows.filter((row) => row.section === "send" && row.documentFileMissing)).toHaveLength(2);
    expect(countOf(review, "send")).toBe(2);
    expect(review.ready()).toBe(true);
  });

  it("shows a cloud file change of a same document (review F51)", () => {
    const base = { kind: "workflow" as const, status: "same" as const, decision: "receive" as const, files: [], missing_files: [] };
    const captured: CaptureReceiveOutput = {
      set_id: "s1",
      documents: [
        { ...base, cloud_id: "c1", local_id: "w1", name: "Flow", content_hash: "h", local_hash: "h", changed_files: 2 },
        { ...base, cloud_id: "c2", local_id: "w2", name: "Still", content_hash: "g", local_hash: "g", changed_files: 0 }
      ]
    };
    const capture = receiveCaptureFrom(captured);
    expect(capture.documents[0].changedFiles).toBe(2);
    const review = new TransferReview(null, capture);
    expect(countOf(review, "receive")).toBe(1);
    expect(review.rows[indexOf(review, "receive")]).toMatchObject({ detail: "cloud_file_changed", cloudId: "c1" });
  });

  it("needs one confirmation per missing file, for every document that uses it", () => {
    const listed = { ...missing("a1", "missing_locally", [["workflow", "w1"], ["workflow", "w2"]]), hash: "f".repeat(64), size: 12 };
    const review = new TransferReview(send({ missingFiles: [listed] }), null);
    expect(countOf(review, "problem")).toBe(2);
    expect(review.ready()).toBe(false);
    expect(review.confirmedMissingFiles()).toEqual([]);
    expect(review.confirmMissingFile(indexOf(review, "problem"), true)).toBe(true);
    expect(review.ready()).toBe(true);
    // The confirmation is the capture's entry as listed.
    expect(review.confirmedMissingFiles()).toEqual([listed]);
    expect(review.confirmMissingFile(review.rows.length, true)).toBe(false);
  });

  it("asks again for a deletion the cloud refused (V4, review F40)", () => {
    const review = new TransferReview(
      send({ deletedLocally: [{ kind: "workflow", localId: "gone", cloudId: "cloud-gone", baseHash: "base-1" }] }),
      null
    );
    const deletion = indexOf(review, "deletion");
    expect(review.confirmDeletion(deletion, true)).toBe(true);
    expect(review.confirmedDeletes()).toEqual([{ kind: "workflow", cloudId: "cloud-gone", cloudHash: "base-1" }]);

    review.addRefusal([failure("BASE_CHANGED", "workflow", "cloud-gone", "stored-2")]);
    expect(countOf(review, "deletion")).toBe(1);
    expect(countOf(review, "choice")).toBe(0);
    expect(review.confirmedDeletes()).toEqual([]);
    expect(review.rows[deletion].detail).toBe("cloud_changed");
    expect(review.confirmDeletion(deletion, true)).toBe(true);
    expect(review.confirmedDeletes()).toEqual([{ kind: "workflow", cloudId: "cloud-gone", cloudHash: "stored-2" }]);
  });

  it("keeps one row for a refused document and receives its new revision (review F39)", () => {
    const review = new TransferReview(
      send({
        operations: [op("replace_document", "workflow", "c1")],
        documents: [{ kind: "workflow", localId: "w1", cloudId: "c1", name: "Flow" }]
      }),
      receive([doc("workflow", "c1", "w1", "Flow", "h1", "both_changed", null)])
    );
    // The sheet holds a Send row and a Choice row that both name c1.
    review.addRefusal([failure("BASE_CHANGED", "workflow", "c1", "s1")]);
    review.addRefusal([failure("BASE_CHANGED", "workflow", "c1", "s2")]);
    expect(review.rows.filter((row) => row.kind === "workflow" && row.cloudId === "c1")).toHaveLength(1);
    const choice = indexOf(review, "choice");
    expect(review.rows[choice].cloudHash).toBe("s2");
    expect(review.choose(choice, "receive")).toBe(true);
    expect(review.receiveDecisions()).toEqual([]);
    expect(review.keepLocalDecisions()).toEqual([]);
    expect(review.refusalsToReceive()).toEqual([{ kind: "workflow", cloudId: "c1", cloudHash: "s2" }]);
  });
});
