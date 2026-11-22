// TC123: the review sheet scenarios of the Qt TransferController tests
// (native/account/qt/tests/tst_account_qt.cpp), run against the TypeScript
// controller with the same fake local router: the same calls in the same
// order and the same stages. Ids and hashes are full ids and sha256 strings
// here, since the renderer parses every answer with the router's schemas.
// The Qt cases about which server a transfer may reach have no TypeScript
// counterpart: the main process sends every call to its own local server.
import type { CloudTransferResult } from "../../../window";
import { TransferController, type TransferControllerOptions } from "../TransferController";

const hex = (label: string, length: number): string =>
  Array.from(label, (char) => char.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("")
    .padEnd(length, "0");
const id = (label: string): string => hex(label, 32);
const hash = (label: string): string => hex(label, 64);

const PROJECT = id("project");

/** Answers each procedure from a queue, the last answer again once the queue is down to it. */
class QueueServer {
  private readonly answers = new Map<string, unknown[]>();
  readonly sent: { procedure: string; input: Record<string, unknown> }[] = [];

  answer(procedure: string, data: unknown): void {
    const queue = this.answers.get(procedure) ?? [];
    queue.push(data);
    this.answers.set(procedure, queue);
  }

  call = async (procedure: string, input: Record<string, unknown>): Promise<CloudTransferResult> => {
    this.sent.push({ procedure, input });
    const queue = this.answers.get(procedure);
    if (!queue || queue.length === 0) {
      return { status: "refused", reason: "HTTP_404", data: null };
    }
    const data = queue.length > 1 ? queue.shift() : queue[0];
    return { status: "ok", reason: "", data };
  };

  calls(): string[] {
    return this.sent.map((item) => item.procedure);
  }

  body(procedure: string, index = -1): Record<string, unknown> {
    const bodies = this.sent.filter((item) => item.procedure === procedure).map((item) => item.input);
    return bodies[index < 0 ? bodies.length + index : index] ?? {};
  }

  count(procedure: string): number {
    return this.calls().filter((call) => call === procedure).length;
  }
}

type Operation = Record<string, unknown>;

const replace = (label: string, captured = "a", base = "b"): Operation => ({
  op: "replace_document",
  kind: "workflow",
  document_id: id(label),
  base_hash: hash(base),
  captured_hash: hash(captured)
});

const create = (label: string, captured = "n"): Operation => ({
  op: "create_document",
  kind: "workflow",
  document_id: id(label),
  captured_hash: hash(captured)
});

const named = (label: string, name: string, kind = "workflow") => ({
  kind,
  local_id: id(label),
  cloud_id: id(label),
  name
});

const captured = (
  transfer: string,
  fields: {
    first?: boolean;
    operations?: Operation[];
    documents?: ReturnType<typeof named>[];
    fileOperations?: Operation[];
    missingFiles?: Record<string, unknown>[];
    deleted?: Record<string, unknown>[];
    deletedFiles?: Record<string, unknown>[];
  } = {}
) => ({
  status: "captured",
  transfer_id: id(transfer),
  first_publication: fields.first ?? false,
  operations: fields.operations ?? [],
  documents: fields.documents ?? [],
  file_operations: fields.fileOperations ?? [],
  missing_files: fields.missingFiles ?? [],
  missing_document_files: [],
  skipped: [],
  deleted_locally: fields.deleted ?? [],
  deleted_workspace_files: fields.deletedFiles ?? []
});

const reviewDocument = (
  label: string,
  name: string,
  content: string,
  status: string,
  decision: "receive" | "keep_local" | null,
  extra: { kind?: string; local?: string | null; changedFiles?: number } = {}
) => ({
  kind: extra.kind ?? "workflow",
  cloud_id: id(label),
  local_id: id(label),
  name,
  content_hash: hash(content),
  local_hash: extra.local === undefined ? null : extra.local === null ? null : hash(extra.local),
  status,
  changed_files: extra.changedFiles ?? 0,
  decision,
  files: [],
  missing_files: []
});

const receiveSet = (set: string, documents: ReturnType<typeof reviewDocument>[] = []) => ({
  set_id: id(set),
  documents
});

const finished = (set: string, received: [string, string, string?][] = []) => ({
  status: "finished",
  set_id: id(set),
  result: {
    received: received.map(([label, name, kind]) => ({ kind: kind ?? "workflow", id: id(label), name })),
    changed_during_receive: [],
    not_received: [],
    kept_beside: [],
    missing_files: [],
    file_kept: []
  }
});

const refused = (transfer: string, failures: Record<string, unknown>[]) => ({
  status: "refused",
  transfer_id: id(transfer),
  failures
});

const baseChanged = (label: string, stored: string) => ({
  code: "BASE_CHANGED",
  kind: "workflow",
  document_id: id(label),
  stored_hash: hash(stored),
  message: "changed"
});

const committed = (transfer: string) => ({
  status: "committed",
  transfer_id: id(transfer),
  result: { outcome: "committed", project_id: id("cloud"), documents: [] }
});

const cancelled = { state: "cancelled" };

const controller = (
  server: QueueServer,
  options: Partial<TransferControllerOptions> = {}
): TransferController =>
  new TransferController({ call: server.call, projectId: PROJECT, signedIn: () => true, ...options });

const sections = (transfer: TransferController): string[] => transfer.snapshot.rows.map((row) => row.section);

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe("TransferController (TC123)", () => {
  it("receives, then sends", async () => {
    const server = new QueueServer();
    server.answer(
      "cloudTransfer.send.capture",
      captured("t1", {
        operations: [replace("c1"), replace("c2")],
        documents: [named("c1", "Mine"), named("c2", "Theirs")]
      })
    );
    server.answer(
      "cloudTransfer.send.capture",
      captured("t2", { operations: [replace("c1")], documents: [named("c1", "Mine")] })
    );
    server.answer(
      "cloudTransfer.receive.capture",
      receiveSet("s1", [
        reviewDocument("c1", "Mine", "h1", "both_changed", null),
        reviewDocument("c2", "Theirs", "h2", "both_changed", null),
        reviewDocument("c3", "Cut", "h2", "cloud_changed", "receive", { kind: "timeline" })
      ])
    );
    server.answer("cloudTransfer.receive.run", finished("s1", [["c2", "Theirs"], ["c3", "Cut", "timeline"]]));
    server.answer("cloudTransfer.send.cancel", cancelled);
    server.answer("cloudTransfer.send.run", refused("t2", [baseChanged("c1", "h1")]));
    server.answer("cloudTransfer.send.run", committed("t2"));

    const transfer = controller(server, { linked: true });
    await transfer.start();
    expect(transfer.snapshot.stage).toBe("reviewing");

    // Two choices, one receive, two sends. Nothing runs until both choices are made.
    expect(sections(transfer)).toEqual(["choice", "choice", "receive", "send", "send"]);
    expect(transfer.snapshot.rows[3].label).toBe("Mine");
    expect(transfer.snapshot.ready).toBe(false);
    await transfer.apply();
    expect(transfer.snapshot.stage).toBe("reviewing");
    expect(transfer.choose(2, "receive")).toBe(false);
    expect(transfer.choose(0, "keep_local")).toBe(true);
    expect(transfer.choose(1, "receive")).toBe(true);
    expect(transfer.snapshot.ready).toBe(true);

    await transfer.apply();
    expect(transfer.snapshot.stage).toBe("finished");
    expect(server.calls()).toEqual([
      "cloudTransfer.send.capture",
      "cloudTransfer.receive.capture",
      "cloudTransfer.receive.run",
      "cloudTransfer.send.cancel",
      "cloudTransfer.send.capture",
      "cloudTransfer.send.run",
      "cloudTransfer.send.run"
    ]);
    // The receive names the documents by cloud id.
    expect(server.body("cloudTransfer.receive.run").decisions).toEqual([
      { kind: "workflow", document_id: id("c1"), decision: "keep_local" },
      { kind: "workflow", document_id: id("c2"), decision: "receive" }
    ]);
    expect(server.body("cloudTransfer.send.cancel").transfer_id).toBe(id("t1"));
    const first = server.body("cloudTransfer.send.run", 0);
    expect(first.transfer_id).toBe(id("t2"));
    expect(first).not.toHaveProperty("decisions");
    expect(server.body("cloudTransfer.send.run", 1).decisions).toEqual([
      { kind: "workflow", document_id: id("c1"), choice: "keep_local", cloud_hash: hash("h1") }
    ]);
    expect(transfer.snapshot.result?.received).toEqual(["Theirs", "Cut"]);
    expect(transfer.snapshot.result?.published).toBe(false);
  });

  it("sends nothing the sheet did not show (review F22)", async () => {
    const server = new QueueServer();
    server.answer(
      "cloudTransfer.send.capture",
      captured("t1", { operations: [replace("c1")], documents: [named("c1", "Mine")] })
    );
    server.answer(
      "cloudTransfer.send.capture",
      captured("t2", {
        operations: [replace("c1"), create("n1")],
        documents: [named("c1", "Mine"), named("n1", "New")]
      })
    );
    server.answer(
      "cloudTransfer.receive.capture",
      receiveSet("s1", [reviewDocument("c3", "Cut", "h1", "cloud_changed", "receive", { kind: "timeline" })])
    );
    server.answer("cloudTransfer.receive.run", finished("s1", [["c3", "Cut", "timeline"]]));
    server.answer("cloudTransfer.send.cancel", cancelled);
    server.answer("cloudTransfer.send.run", committed("t2"));

    const transfer = controller(server, { linked: true });
    await transfer.start();
    await transfer.apply();
    expect(transfer.snapshot.stage).toBe("reviewing");
    expect(transfer.snapshot.message).toEqual({ key: "sendChangedWhileOpen" });
    expect(server.calls()).not.toContain("cloudTransfer.send.run");
    expect(transfer.snapshot.rows.map((row) => row.label)).toContain("New");

    // Seen now, the second apply only sends.
    await transfer.apply();
    expect(transfer.snapshot.stage).toBe("finished");
    expect(server.calls().at(-1)).toBe("cloudTransfer.send.run");
    expect(server.body("cloudTransfer.send.run").transfer_id).toBe(id("t2"));
    expect(server.count("cloudTransfer.receive.run")).toBe(1);
  });

  it("reads the link before it captures", async () => {
    const serverFor = (link: Record<string, unknown>): QueueServer => {
      const server = new QueueServer();
      server.answer("cloudTransfer.link", link);
      server.answer(
        "cloudTransfer.send.capture",
        captured("t1", { operations: [replace("c1")], documents: [named("c1", "Flow")] })
      );
      server.answer("cloudTransfer.receive.capture", receiveSet("s1"));
      return server;
    };

    const linked = serverFor({ state: "linked", cloud_project_id: id("c9") });
    const first = controller(linked, { readLink: true });
    await first.start();
    expect(first.snapshot.stage).toBe("reviewing");
    expect(first.snapshot.linked).toBe(true);
    expect(linked.calls()).toEqual(["cloudTransfer.link", "cloudTransfer.send.capture", "cloudTransfer.receive.capture"]);
    expect(linked.body("cloudTransfer.link")).toEqual({ project_id: PROJECT });

    const unlinked = serverFor({ state: "unlinked" });
    const second = controller(unlinked, { readLink: true, linked: true });
    await second.start();
    expect(second.snapshot.stage).toBe("reviewing");
    expect(second.snapshot.linked).toBe(false);
    expect(unlinked.calls()).toEqual(["cloudTransfer.link", "cloudTransfer.send.capture"]);

    const elsewhere = serverFor({ state: "linked_elsewhere" });
    const third = controller(elsewhere, { readLink: true });
    await third.start();
    expect(third.snapshot.stage).toBe("failed");
    expect(third.snapshot.message).toEqual({ key: "linkedElsewhere" });
    expect(elsewhere.calls()).toEqual(["cloudTransfer.link"]);
  });

  it("publishes, asks again after a refusal and cancels", async () => {
    const server = new QueueServer();
    server.answer(
      "cloudTransfer.send.capture",
      captured("t1", { first: true, operations: [create("w1")], documents: [named("w1", "Flow")] })
    );
    server.answer("cloudTransfer.send.run", refused("t1", [baseChanged("w1", "s9")]));
    server.answer("cloudTransfer.send.run", committed("t1"));
    server.answer("cloudTransfer.send.cancel", cancelled);

    let signedIn = true;
    const transfer = controller(server, { projectName: "Film", signedIn: () => signedIn });
    await transfer.start();
    expect(transfer.snapshot.stage).toBe("reviewing");
    expect(transfer.snapshot.rows).toHaveLength(1);
    expect(transfer.snapshot.ready).toBe(true);
    expect(server.body("cloudTransfer.send.capture").project_name).toBe("Film");

    await transfer.apply();
    expect(transfer.snapshot.stage).toBe("reviewing");
    expect(transfer.snapshot.message).toEqual({ key: "cloudChangedChooseAgain", count: 1 });
    expect(transfer.snapshot.rows[0].section).toBe("choice");
    expect(transfer.snapshot.ready).toBe(false);
    expect(transfer.choose(0, "keep_local")).toBe(true);
    await transfer.apply();
    expect(transfer.snapshot.stage).toBe("finished");
    expect(transfer.snapshot.result?.published).toBe(true);
    expect(server.body("cloudTransfer.send.run", 1).decisions).toEqual([
      { kind: "workflow", document_id: id("w1"), choice: "keep_local", cloud_hash: hash("s9") }
    ]);

    // Cancel from the sheet ends the captured send.
    await transfer.start();
    expect(transfer.snapshot.stage).toBe("reviewing");
    transfer.cancel();
    expect(transfer.snapshot.stage).toBe("idle");
    await settle();
    expect(server.count("cloudTransfer.send.cancel")).toBe(1);

    signedIn = false;
    const before = server.sent.length;
    await transfer.start();
    expect(transfer.snapshot.stage).toBe("failed");
    expect(transfer.snapshot.message).toEqual({ key: "signInToPublish" });
    expect(server.sent).toHaveLength(before);
  });

  it("ends the send and the receive when the sheet closes (review F41)", async () => {
    const server = new QueueServer();
    server.answer(
      "cloudTransfer.send.capture",
      captured("t1", { operations: [replace("c1")], documents: [named("c1", "Mine")] })
    );
    server.answer("cloudTransfer.receive.capture", receiveSet("s1"));
    server.answer("cloudTransfer.send.cancel", cancelled);
    server.answer("cloudTransfer.receive.cancel", cancelled);

    const transfer = controller(server, { linked: true });
    await transfer.start();
    expect(transfer.snapshot.stage).toBe("reviewing");
    transfer.cancel();
    await settle();
    expect(server.body("cloudTransfer.receive.cancel").set_id).toBe(id("s1"));
    expect(server.body("cloudTransfer.send.cancel").transfer_id).toBe(id("t1"));
  });

  it("does not capture again a send that cannot end (review F41)", async () => {
    const server = new QueueServer();
    server.answer(
      "cloudTransfer.send.capture",
      captured("t1", { operations: [replace("c1")], documents: [named("c1", "Mine")] })
    );
    server.answer(
      "cloudTransfer.receive.capture",
      receiveSet("s1", [reviewDocument("c2", "Theirs", "h2", "cloud_changed", "receive")])
    );
    server.answer("cloudTransfer.receive.run", finished("s1", [["c2", "Theirs"]]));
    // send.cancel has no answer: the router refuses it.

    const transfer = controller(server, { linked: true });
    await transfer.start();
    await transfer.apply();
    expect(transfer.snapshot.stage).toBe("failed");
    expect(transfer.snapshot.message).toEqual({ key: "notPreparedAgain", status: "refused", reason: "HTTP_404" });
    expect(server.count("cloudTransfer.send.capture")).toBe(1);
    expect(server.count("cloudTransfer.send.run")).toBe(0);
  });

  it("receives the new revision of a refused document (review F39)", async () => {
    const server = new QueueServer();
    server.answer(
      "cloudTransfer.send.capture",
      captured("t1", { operations: [replace("c1", "lh1")], documents: [named("c1", "Mine")] })
    );
    // After the receive, the document equals the cloud: nothing to send.
    server.answer("cloudTransfer.send.capture", captured("t2"));
    server.answer("cloudTransfer.receive.capture", receiveSet("s1"));
    server.answer(
      "cloudTransfer.receive.capture",
      receiveSet("s2", [
        reviewDocument("c1", "Mine", "n1", "both_changed", null, { local: "lh1" }),
        reviewDocument("c9", "Unseen", "n9", "cloud_changed", "receive"),
        // Only a file of this one changed in the cloud (review F51).
        reviewDocument("c8", "Media", "n8", "same", "receive", { local: "n8", changedFiles: 1 })
      ])
    );
    server.answer("cloudTransfer.receive.run", finished("s1"));
    server.answer("cloudTransfer.receive.run", finished("s2", [["c1", "Mine"]]));
    server.answer("cloudTransfer.send.cancel", cancelled);
    server.answer("cloudTransfer.send.run", refused("t1", [baseChanged("c1", "n1")]));

    const transfer = controller(server, { linked: true });
    await transfer.start();
    await transfer.apply();
    expect(transfer.snapshot.stage).toBe("reviewing");
    expect(sections(transfer)).toEqual(["choice"]);
    expect(transfer.choose(0, "receive")).toBe(true);
    await transfer.apply();
    expect(transfer.snapshot.stage).toBe("finished");

    const received = server.body("cloudTransfer.receive.run", 1);
    expect(received.set_id).toBe(id("s2"));
    // The refused document is received. The documents the sheet never showed stay as they are here.
    expect(received.decisions).toEqual([
      { kind: "workflow", document_id: id("c1"), decision: "receive" },
      { kind: "workflow", document_id: id("c9"), decision: "keep_local" },
      { kind: "workflow", document_id: id("c8"), decision: "keep_local" }
    ]);
    // The stale replace went no further than the first refusal.
    expect(server.count("cloudTransfer.send.run")).toBe(1);
    expect(transfer.snapshot.result?.received).toEqual(["Mine"]);
  });

  it.each([
    ["local edited", "n1", "lh2"],
    ["cloud edited", "n2", "lh1"]
  ])("asks again for a refused document when either side changed: %s (review F46)", async (_case, cloud, local) => {
    const server = new QueueServer();
    server.answer(
      "cloudTransfer.send.capture",
      captured("t1", { operations: [replace("c1", "lh1")], documents: [named("c1", "Mine")] })
    );
    server.answer("cloudTransfer.receive.capture", receiveSet("s1"));
    server.answer(
      "cloudTransfer.receive.capture",
      receiveSet("s2", [reviewDocument("c1", "Mine", cloud, "both_changed", null, { local })])
    );
    server.answer("cloudTransfer.receive.run", finished("s1"));
    server.answer("cloudTransfer.receive.cancel", cancelled);
    server.answer("cloudTransfer.send.run", refused("t1", [baseChanged("c1", "n1")]));

    const transfer = controller(server, { linked: true });
    await transfer.start();
    await transfer.apply();
    expect(transfer.choose(0, "receive")).toBe(true);
    await transfer.apply();
    expect(transfer.snapshot.stage).toBe("reviewing");
    // Only the first set was received, and the new one was released.
    expect(server.count("cloudTransfer.receive.run")).toBe(1);
    expect(server.body("cloudTransfer.receive.cancel").set_id).toBe(id("s2"));
    // The row asks again, for the cloud revision as it is now.
    expect(transfer.snapshot.rows[0]).toMatchObject({ section: "choice", choice: null });
    expect(transfer.snapshot.ready).toBe(false);
  });

  it("continues a receive waiting for review with its set (review F50)", async () => {
    const server = new QueueServer();
    server.answer("cloudTransfer.send.capture", captured("t1"));
    server.answer(
      "cloudTransfer.receive.capture",
      receiveSet("s1", [reviewDocument("c1", "Mine", "h1", "both_changed", null, { local: "l-1" })])
    );
    server.answer("cloudTransfer.receive.run", {
      status: "waiting_for_review",
      ...receiveSet("s2", [reviewDocument("c1", "Mine", "h2", "both_changed", null, { local: "l-2" })])
    });
    server.answer("cloudTransfer.receive.run", finished("s2", [["c1", "Mine"]]));
    server.answer("cloudTransfer.send.cancel", cancelled);

    const transfer = controller(server, { linked: true });
    await transfer.start();
    expect(transfer.choose(0, "receive")).toBe(true);
    await transfer.apply();
    expect(transfer.snapshot.stage).toBe("reviewing");
    expect(transfer.snapshot.message).toEqual({ key: "receiveChangedWhileOpen" });
    expect(transfer.snapshot.rows).toHaveLength(1);
    expect(transfer.snapshot.rows[0].choice).toBeNull();
    expect(transfer.choose(0, "receive")).toBe(true);
    await transfer.apply();
    expect(transfer.snapshot.stage).toBe("finished");
    expect(server.body("cloudTransfer.receive.run", 1).set_id).toBe(id("s2"));
  });

  it("sends no deletion once its confirmation is withdrawn (review F43)", async () => {
    const server = new QueueServer();
    server.answer(
      "cloudTransfer.send.capture",
      captured("t1", { deleted: [{ kind: "workflow", local_id: id("w1"), cloud_id: id("cw1"), base_hash: hash("b1") }] })
    );
    server.answer(
      "cloudTransfer.send.run",
      refused("t1", [{ code: "STORAGE_EXCEEDED", kind: "workflow", document_id: id("cw1"), message: "full" }])
    );
    server.answer("cloudTransfer.send.run", committed("t1"));

    const transfer = controller(server);
    await transfer.start();
    expect(transfer.confirmDeletion(0, true)).toBe(true);
    await transfer.apply();
    expect(transfer.snapshot.stage).toBe("reviewing");
    expect(transfer.snapshot.message).toEqual({ key: "sendRefused", reasons: ["full"] });
    expect(transfer.confirmDeletion(0, false)).toBe(true);
    await transfer.apply();
    expect(transfer.snapshot.stage).toBe("finished");
    expect(server.body("cloudTransfer.send.run", 1).confirm_deletes).toEqual([]);
  });

  it("asks again for a deletion the cloud refused (V4, review F40)", async () => {
    const server = new QueueServer();
    server.answer(
      "cloudTransfer.send.capture",
      captured("t1", { deleted: [{ kind: "workflow", local_id: id("w1"), cloud_id: id("cw1"), base_hash: hash("b1") }] })
    );
    server.answer("cloudTransfer.send.run", refused("t1", [baseChanged("cw1", "s2")]));
    server.answer("cloudTransfer.send.run", committed("t1"));

    const transfer = controller(server);
    await transfer.start();
    expect(transfer.snapshot.rows).toHaveLength(1);
    expect(transfer.confirmDeletion(0, true)).toBe(true);
    await transfer.apply();
    expect(transfer.snapshot.stage).toBe("reviewing");
    expect(transfer.snapshot.rows[0]).toMatchObject({ section: "deletion", confirmed: false });
    expect(server.body("cloudTransfer.send.run", 0).confirm_deletes).toEqual([
      { kind: "workflow", cloud_id: id("cw1"), cloud_hash: hash("b1") }
    ]);

    expect(transfer.confirmDeletion(0, true)).toBe(true);
    await transfer.apply();
    expect(transfer.snapshot.stage).toBe("finished");
    expect(server.body("cloudTransfer.send.run", 1).confirm_deletes).toEqual([
      { kind: "workflow", cloud_id: id("cw1"), cloud_hash: hash("s2") }
    ]);
  });

  it("sends a confirmed workspace file deletion as the only work", async () => {
    const server = new QueueServer();
    server.answer(
      "cloudTransfer.send.capture",
      captured("t1", { deletedFiles: [{ path: "notes/plan.md", base_hash: hash("b") }] })
    );
    server.answer("cloudTransfer.receive.capture", receiveSet("s1"));
    server.answer("cloudTransfer.receive.run", finished("s1"));
    server.answer("cloudTransfer.send.run", committed("t1"));

    const transfer = controller(server, { linked: true });
    await transfer.start();
    expect(transfer.snapshot.rows).toHaveLength(1);
    expect(transfer.snapshot.rows[0]).toMatchObject({
      section: "deletion",
      label: "notes/plan.md",
      canKeepDeletion: true
    });
    expect(transfer.confirmDeletion(0, true)).toBe(true);
    await transfer.apply();
    expect(transfer.snapshot.stage).toBe("finished");
    expect(server.calls().at(-1)).toBe("cloudTransfer.send.run");
    const sent = server.body("cloudTransfer.send.run", 0);
    expect(sent.confirm_workspace_deletes).toEqual([{ path: "notes/plan.md", base_hash: hash("b") }]);
    expect(sent.confirm_deletes).toEqual([]);
  });

  it("sends a file-only change (review F33)", async () => {
    const server = new QueueServer();
    server.answer(
      "cloudTransfer.send.capture",
      captured("t1", {
        fileOperations: [
          {
            op: "put_asset_file",
            asset_id: id("a1"),
            path: "media/still.png",
            hash: hash("after"),
            size: 4,
            base_hash: hash("before"),
            name: "still.png",
            content_type: "image/png"
          }
        ]
      })
    );
    server.answer("cloudTransfer.receive.capture", receiveSet("s1"));
    server.answer("cloudTransfer.receive.run", finished("s1"));
    server.answer("cloudTransfer.send.run", committed("t1"));

    const transfer = controller(server, { linked: true });
    await transfer.start();
    expect(transfer.snapshot.rows).toHaveLength(1);
    expect(transfer.snapshot.rows[0]).toMatchObject({ section: "send", label: "media/still.png" });
    await transfer.apply();
    expect(transfer.snapshot.stage).toBe("finished");
    expect(server.calls().at(-1)).toBe("cloudTransfer.send.run");
    expect(transfer.snapshot.result?.sent).toBe(true);
  });

  it("publishes without a missing file only once it is confirmed (X7, review F36)", async () => {
    const missing = {
      asset_id: id("a1"),
      reason: "missing_locally",
      documents: [{ kind: "workflow", document_id: id("w1") }]
    };
    const server = new QueueServer();
    server.answer(
      "cloudTransfer.send.capture",
      captured("t1", {
        first: true,
        operations: [create("w1")],
        documents: [named("w1", "Flow")],
        missingFiles: [missing]
      })
    );
    server.answer("cloudTransfer.send.run", committed("t1"));

    const transfer = controller(server);
    await transfer.start();
    const problem = transfer.snapshot.rows.find((row) => row.canSendWithout);
    expect(problem).toBeDefined();
    expect(transfer.snapshot.ready).toBe(false);
    await transfer.apply();
    expect(transfer.snapshot.stage).toBe("reviewing");
    expect(transfer.confirmMissingFile(problem?.index ?? -1, true)).toBe(true);
    expect(transfer.snapshot.ready).toBe(true);
    await transfer.apply();
    expect(transfer.snapshot.stage).toBe("finished");
    expect(server.body("cloudTransfer.send.run").confirm_missing_files).toEqual([missing]);
  });

  it("asks to collect files outside the project folder first (CF6)", async () => {
    const server = new QueueServer();
    server.answer("cloudTransfer.send.capture", {
      status: "collect_first",
      external: ["/Users/ada/clip.mov"],
      message: "Collect the files first."
    });

    const transfer = controller(server, { linked: true });
    await transfer.start();
    expect(transfer.snapshot.stage).toBe("collectFirst");
    expect(transfer.snapshot.external).toEqual(["/Users/ada/clip.mov"]);
    expect(transfer.snapshot.message).toEqual({ key: "serverMessage", text: "Collect the files first." });
    expect(server.calls()).toEqual(["cloudTransfer.send.capture"]);
  });

  it("collects the linked files, then reads the project again (D22, TC103)", async () => {
    const server = new QueueServer();
    server.answer("cloudTransfer.send.capture", {
      status: "collect_first",
      external: ["a1"],
      message: "Collect the files first."
    });
    server.answer("cloudTransfer.send.capture", captured("t1", { operations: [create("w1")] }));
    const collect = jest.fn().mockResolvedValue({
      copied: [{ id: "a1", name: "clip.mov", workspace_path: "Imported/clip.mov" }],
      skipped: [],
      failed: [],
      interrupted: false
    });

    const transfer = controller(server, { collect });
    expect(transfer.canCollect).toBe(true);
    await transfer.collect();
    expect(collect).not.toHaveBeenCalled();
    await transfer.start();
    expect(transfer.snapshot.stage).toBe("collectFirst");
    await transfer.collect();
    expect(collect).toHaveBeenCalledWith(PROJECT);
    expect(transfer.snapshot.stage).toBe("reviewing");
    expect(transfer.snapshot.external).toEqual([]);
    expect(sections(transfer)).toEqual(["send"]);
    expect(server.calls()).toEqual(["cloudTransfer.send.capture", "cloudTransfer.send.capture"]);
  });

  it("fails and names each linked file that could not be collected", async () => {
    const server = new QueueServer();
    server.answer("cloudTransfer.send.capture", { status: "collect_first", external: ["a1"], message: "Collect." });
    const transfer = controller(server, {
      collect: jest.fn().mockResolvedValue({
        copied: [],
        skipped: [{ id: "a1", name: "clip.mov", reason: "missing" }],
        failed: [{ id: "a2", name: "song.wav", reason: "copy did not verify" }],
        interrupted: false
      })
    });
    await transfer.start();
    await transfer.collect();
    expect(transfer.snapshot.stage).toBe("failed");
    expect(transfer.snapshot.message).toEqual({
      key: "notCollected",
      files: ["clip.mov: missing", "song.wav: copy did not verify"]
    });
    expect(server.calls()).toEqual(["cloudTransfer.send.capture"]);

    const stopped = controller(server, {
      collect: jest.fn().mockResolvedValue({ copied: [], skipped: [], failed: [], interrupted: true })
    });
    await stopped.start();
    await stopped.collect();
    expect(stopped.snapshot.message).toEqual({ key: "collectInterrupted" });

    const unreachable = controller(server, { collect: jest.fn().mockRejectedValue(new Error("down")) });
    await unreachable.start();
    await unreachable.collect();
    expect(unreachable.snapshot.message).toEqual({ key: "failure", status: "localUnavailable", reason: "" });
  });

  it("offers no Collect without the app's own server", async () => {
    const server = new QueueServer();
    server.answer("cloudTransfer.send.capture", { status: "collect_first", external: ["a1"], message: "Collect." });
    const transfer = controller(server);
    expect(transfer.canCollect).toBe(false);
    await transfer.start();
    await transfer.collect();
    expect(transfer.snapshot.stage).toBe("collectFirst");
  });

  it("refuses an answer the router's schema does not accept", async () => {
    const server = new QueueServer();
    server.answer("cloudTransfer.send.capture", { status: "captured", transfer_id: "t1" });

    const transfer = controller(server);
    await transfer.start();
    expect(transfer.snapshot.stage).toBe("failed");
    expect(transfer.snapshot.message).toEqual({ key: "failure", status: "refused", reason: "INVALID_RESPONSE" });
  });

  it("drops a capture the sheet closed during, and ends the send it opened", async () => {
    const server = new QueueServer();
    server.answer("cloudTransfer.send.capture", captured("t1", { operations: [create("w1")] }));
    server.answer("cloudTransfer.send.cancel", cancelled);

    const transfer = controller(server);
    const starting = transfer.start();
    transfer.cancel();
    await starting;
    await settle();
    expect(transfer.snapshot.stage).toBe("idle");
    expect(server.body("cloudTransfer.send.cancel").transfer_id).toBe(id("t1"));
  });
});
