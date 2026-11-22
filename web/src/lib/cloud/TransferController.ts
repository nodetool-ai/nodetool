/**
 * The stages of the desktop review sheet for Publish to Cloud and
 * Synchronize (technical design WP2.14). A port of the Qt
 * `TransferController` in native/account/qt/src/TransferController.cpp:
 * the same calls in the same order and the same stages (TC123, TR11).
 *
 * Synchronize receives first. When the receive replaced a document, the
 * captured send is ended and captured again, and work the sheet never
 * showed goes back to the person before anything is sent. A document kept
 * local is refused once with BASE_CHANGED, and the send is repeated with
 * Keep local when the stored hash is the revision the person saw.
 *
 * The sheet subscribes with `subscribe` and reads `snapshot`, which is a new
 * object after every change, so it suits `useSyncExternalStore`.
 */
import {
  cancelReceive,
  cancelSend,
  captureReceive,
  captureSend,
  linkStatus,
  runReceive,
  runSend,
  type TransferAnswer,
  type TransferCall,
  type TransferStatus
} from "./transferCalls";
import {
  failuresFrom,
  receiveCaptureFrom,
  sendCaptureFrom,
  TransferReview,
  unreviewedFileOperations,
  unreviewedOperations,
  waitingReceiveFrom,
  type ReceiveCapture,
  type ReceiveChoice,
  type KeepLocalDecision,
  type ReceiveDecision,
  type ReviewRow,
  type ReviewSection,
  type SendCapture,
  type TransferFailure,
  type TransferFileOperation,
  type TransferOperation
} from "./transferReview";
import type { RunReceiveOutput } from "@nodetool-ai/protocol/api-schemas/cloud-transfer-local.js";
import type { CollectOutput } from "@nodetool-ai/protocol/api-schemas/assets.js";

export type TransferStage =
  | "idle"
  | "capturing"
  | "reviewing"
  | "collectFirst"
  | "collecting"
  | "running"
  | "finished"
  | "failed";

type Failed = Exclude<TransferStatus, "ok">;

/** What the sheet says, as a key and its values, so the sheet translates it. */
export type TransferMessage =
  | { key: "signInToPublish" | "signInToSynchronize" | "noProject" | "linkedElsewhere" }
  | { key: "failure"; status: Failed; reason: string }
  | { key: "serverMessage"; text: string }
  | { key: "receiveExpired" | "receiveChangedWhileOpen" | "receivingChangedAgain" }
  | { key: "chooseAgain" | "cloudChangedChooseAgain"; count: number }
  | { key: "notPreparedAgain"; status: Failed; reason: string }
  | { key: "sendChangedWhileOpen" | "missingFilesUnconfirmed" }
  | { key: "sendRefused"; reasons: string[] }
  | { key: "notCollected"; files: string[] }
  | { key: "collectInterrupted" };

/** A row as the sheet lists it. `index` is its place in the review, which choose and confirm take. */
export interface TransferRowView extends ReviewRow {
  index: number;
  /** The row's name, or its id when it has none. */
  label: string;
  canKeepDeletion: boolean;
  canRestore: boolean;
  canSendWithout: boolean;
  canReceive: boolean;
}

export interface TransferResult {
  received: string[];
  notReceived: string[];
  changedDuringReceive: string[];
  missingFiles: number;
  /** A first publication committed. */
  published: boolean;
  /** A send committed. */
  sent: boolean;
}

export interface TransferSnapshot {
  stage: TransferStage;
  linked: boolean;
  rows: readonly TransferRowView[];
  ready: boolean;
  message: TransferMessage | null;
  /** For collectFirst: the paths of files outside the project folder (CF6). */
  external: readonly string[];
  result: TransferResult | null;
}

export interface TransferControllerOptions {
  call: TransferCall;
  projectId: string;
  projectName?: string;
  /** Whether the project is linked, when the sheet does not read the link. */
  linked?: boolean;
  /** Ask `cloudTransfer.link` before capturing, and publish or synchronize from its answer. */
  readLink?: boolean;
  /** Whether the cloud account is signed in now. */
  signedIn: () => boolean;
  /**
   * The Collect step of decision D22: `assets.collect` on the app's own
   * server, which copies the project's linked files into `Imported/`.
   * Without it the sheet stops at collectFirst.
   */
  collect?: (projectId: string) => Promise<CollectOutput>;
}

const FULL_ID = /^[0-9a-f]{32}$/;

const SECTION_ORDER: readonly ReviewSection[] = ["choice", "receive", "send", "deletion", "problem"];

const namesOf = (list: readonly { id: string; name: string }[]): string[] =>
  list.map((item) => (item.name === "" ? item.id : item.name));

const failureOf = (answer: { status: Failed; reason: string }): TransferMessage => ({
  key: "failure",
  status: answer.status,
  reason: answer.reason
});

interface Captured {
  link?: TransferAnswer<{ state: string }>;
  linked: boolean;
  send: TransferAnswer<SendCapture> | { status: "ok"; collectFirst: { external: string[]; message: string } };
  receive: TransferAnswer<ReceiveCapture>;
}

type ReceiveRun = TransferAnswer<RunReceiveOutput>;

interface Applied {
  receive?: ReceiveRun;
  refusalReceive?: ReceiveRun;
  changedAgain: TransferFailure[];
  recaptured?: TransferAnswer<SendCapture> | { status: "ok"; collectFirst: { message: string } };
  unreviewed: TransferOperation[];
  unreviewedFiles: TransferFileOperation[];
  endedSend?: TransferAnswer<unknown>;
  send?: TransferAnswer<{ committed: boolean; missingUnconfirmed: boolean; failures: TransferFailure[] }>;
}

const sendRunOf = async (
  call: TransferCall,
  transferId: string,
  review: TransferReview,
  keep: readonly KeepLocalDecision[]
): Promise<NonNullable<Applied["send"]>> => {
  const run = await runSend(call, transferId, keep, review.confirmedDeletes(), review.confirmedMissingFiles());
  if (run.status !== "ok") {
    return run;
  }
  const data = run.data;
  return {
    status: "ok",
    data: {
      committed: data.status === "committed",
      missingUnconfirmed: data.status === "missing_files_unconfirmed",
      failures: data.status === "refused" ? failuresFrom(data.failures) : []
    }
  };
};

const captureSendOf = async (
  call: TransferCall,
  projectId: string,
  projectName: string
): Promise<NonNullable<Captured["send"]>> => {
  const captured = await captureSend(call, projectId, projectName);
  if (captured.status !== "ok") {
    return captured;
  }
  if (captured.data.status === "collect_first") {
    return { status: "ok", collectFirst: { external: captured.data.external, message: captured.data.message } };
  }
  return { status: "ok", data: sendCaptureFrom(captured.data) };
};

const captureReceiveOf = async (call: TransferCall, projectId: string): Promise<TransferAnswer<ReceiveCapture>> => {
  const captured = await captureReceive(call, projectId);
  return captured.status === "ok" ? { status: "ok", data: receiveCaptureFrom(captured.data) } : captured;
};

/** The review state of one sheet. Owned by the sheet that shows it, for one project. */
export class TransferController {
  private readonly call: TransferCall;
  private readonly projectId: string;
  private readonly projectName: string;
  private readonly readLink: boolean;
  private readonly signedIn: () => boolean;
  private readonly collectFiles: ((projectId: string) => Promise<CollectOutput>) | null;
  private readonly listeners = new Set<() => void>();

  private stage: TransferStage = "idle";
  private linked: boolean;
  private review = new TransferReview(null, null);
  private message: TransferMessage | null = null;
  private external: string[] = [];
  private result: TransferResult | null = null;
  private receivedResult: TransferResult | null = null;
  private transferId = "";
  private setId = "";
  private sendWork = false;
  private received = false;
  private sendCapture: SendCapture | null = null;
  private approved: TransferOperation[] = [];
  private approvedFiles: TransferFileOperation[] = [];
  // A run or capture whose sequence is older than this one was cancelled or
  // replaced, and its answer is dropped.
  private sequence = 0;
  private current: TransferSnapshot;

  constructor(options: TransferControllerOptions) {
    this.call = options.call;
    this.projectId = options.projectId;
    this.projectName = options.projectName ?? "";
    this.linked = options.linked ?? false;
    this.readLink = options.readLink ?? false;
    this.signedIn = options.signedIn;
    this.collectFiles = options.collect ?? null;
    this.current = this.build();
  }

  get snapshot(): TransferSnapshot {
    return this.current;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): TransferSnapshot => this.current;

  private build(): TransferSnapshot {
    const all = this.review.rows;
    const rows: TransferRowView[] = [];
    for (const section of SECTION_ORDER) {
      all.forEach((row, index) => {
        if (row.section === section) {
          rows.push({
            ...row,
            index,
            label: row.name === "" ? row.documentId : row.name,
            canKeepDeletion: row.sendListed,
            canRestore: row.receiveListed,
            canSendWithout: row.assetId !== "",
            canReceive: this.linked || row.cloudHash === ""
          });
        }
      });
    }
    return {
      stage: this.stage,
      linked: this.linked,
      rows,
      ready: this.review.ready(),
      message: this.message,
      external: this.external,
      result: this.result
    };
  }

  private changed(): void {
    this.current = this.build();
    for (const listener of this.listeners) {
      listener();
    }
  }

  private fail(message: TransferMessage): void {
    this.stage = "failed";
    this.message = message;
    this.changed();
  }

  private reviewAgain(message: TransferMessage | null): void {
    this.stage = "reviewing";
    this.message = message;
    this.changed();
  }

  /** Whether the sheet can offer Collect at collectFirst. */
  get canCollect(): boolean {
    return this.collectFiles !== null;
  }

  /**
   * The Collect step of decision D22 (CF6): copies the project's linked
   * files into its folder, then captures again. A file that cannot be
   * copied fails the transfer and is named, so nothing is sent without it.
   */
  async collect(): Promise<void> {
    if (this.stage !== "collectFirst" || this.collectFiles === null) {
      return;
    }
    const sequence = ++this.sequence;
    this.stage = "collecting";
    this.message = null;
    this.changed();
    let collected: CollectOutput;
    try {
      collected = await this.collectFiles(this.projectId);
    } catch {
      if (sequence === this.sequence) {
        this.fail({ key: "failure", status: "localUnavailable", reason: "" });
      }
      return;
    }
    if (sequence !== this.sequence) {
      return;
    }
    const notCollected = [...collected.skipped, ...collected.failed].map((file) => `${file.name}: ${file.reason}`);
    if (notCollected.length > 0) {
      this.fail({ key: "notCollected", files: notCollected });
      return;
    }
    if (collected.interrupted) {
      this.fail({ key: "collectInterrupted" });
      return;
    }
    // Every linked file is in the folder now: read the project again.
    this.stage = "idle";
    await this.start();
  }

  async start(): Promise<void> {
    if (this.stage === "capturing" || this.stage === "running" || this.stage === "collecting") {
      return;
    }
    this.review = new TransferReview(null, null);
    this.transferId = "";
    this.setId = "";
    this.sendWork = false;
    this.received = false;
    this.receivedResult = null;
    this.external = [];
    this.result = null;
    if (!this.signedIn()) {
      this.fail({ key: this.linked ? "signInToSynchronize" : "signInToPublish" });
      return;
    }
    if (!FULL_ID.test(this.projectId)) {
      this.fail({ key: "noProject" });
      return;
    }
    const sequence = ++this.sequence;
    this.stage = "capturing";
    this.message = null;
    this.changed();
    const captured = await this.capture();
    this.finishCapture(sequence, captured);
  }

  private async capture(): Promise<Captured> {
    let linked = this.linked;
    let link: Captured["link"];
    if (this.readLink) {
      link = await linkStatus(this.call, this.projectId);
      if (link.status !== "ok" || link.data.state === "linked_elsewhere") {
        return { link, linked, send: { status: "localUnavailable", reason: "" }, receive: { status: "localUnavailable", reason: "" } };
      }
      linked = link.data.state === "linked";
    }
    const send = await captureSendOf(this.call, this.projectId, this.projectName);
    const receive: Captured["receive"] =
      linked && send.status === "ok" && "data" in send
        ? await captureReceiveOf(this.call, this.projectId)
        : { status: "ok", data: { setId: "", documents: [] } };
    return { link, linked, send, receive };
  }

  private finishCapture(sequence: number, captured: Captured): void {
    if (sequence !== this.sequence) {
      // Cancelled while it captured: end the send it opened.
      if (captured.send.status === "ok" && "data" in captured.send) {
        this.endSend(captured.send.data.transferId);
      }
      return;
    }
    if (captured.link) {
      if (captured.link.status !== "ok") {
        this.fail(failureOf(captured.link));
        return;
      }
      if (captured.link.data.state === "linked_elsewhere") {
        this.fail({ key: "linkedElsewhere" });
        return;
      }
      this.linked = captured.link.data.state === "linked";
    }
    const send = captured.send;
    if (send.status !== "ok") {
      this.fail(failureOf(send));
      return;
    }
    if ("collectFirst" in send) {
      this.stage = "collectFirst";
      this.message = { key: "serverMessage", text: send.collectFirst.message };
      this.external = send.collectFirst.external;
      this.changed();
      return;
    }
    this.transferId = send.data.transferId;
    if (captured.receive.status !== "ok") {
      // The send is open and nothing was shown: end it.
      this.endSend(this.transferId);
      this.transferId = "";
      this.fail(failureOf(captured.receive));
      return;
    }
    this.setId = captured.receive.data.setId;
    this.sendWork = send.data.operations.length > 0 || send.data.fileOperations.length > 0;
    this.review = new TransferReview(send.data, captured.receive.data);
    this.sendCapture = send.data;
    this.approved = send.data.operations;
    this.approvedFiles = send.data.fileOperations;
    this.reviewAgain(null);
  }

  /** Sets the pick of Choice row `index`, or clears it with null. */
  choose(index: number, choice: ReceiveChoice | null): boolean {
    if (index < 0 || this.stage !== "reviewing") {
      return false;
    }
    // An unlinked project has no cloud revision to receive (review F39).
    const row = this.review.rows[index];
    if (choice === "receive" && !this.linked && row !== undefined && row.cloudHash !== "") {
      return false;
    }
    if (!this.review.choose(index, choice)) {
      return false;
    }
    this.changed();
    return true;
  }

  confirmMissingFile(index: number, confirmed: boolean): boolean {
    if (index < 0 || this.stage !== "reviewing" || !this.review.confirmMissingFile(index, confirmed)) {
      return false;
    }
    this.changed();
    return true;
  }

  confirmDeletion(index: number, confirmed: boolean): boolean {
    if (index < 0 || this.stage !== "reviewing" || !this.review.confirmDeletion(index, confirmed)) {
      return false;
    }
    this.changed();
    return true;
  }

  async apply(): Promise<void> {
    if (this.stage !== "reviewing" || !this.review.ready()) {
      return;
    }
    if (!this.signedIn()) {
      this.message = { key: "failure", status: "signedOut", reason: "" };
      this.changed();
      return;
    }
    const sequence = ++this.sequence;
    this.stage = "running";
    this.message = null;
    this.changed();
    const applied = await this.run({
      review: this.review,
      transferId: this.transferId,
      setId: this.received ? "" : this.setId,
      refusals: this.linked ? this.review.refusalsToReceive() : [],
      sendWork: this.sendWork || !this.linked || this.review.confirmedDeletes().length > 0,
      approved: this.approved,
      approvedFiles: this.approvedFiles
    });
    this.finishApply(sequence, applied);
  }

  private async run(plan: {
    review: TransferReview;
    transferId: string;
    setId: string;
    refusals: ReturnType<TransferReview["refusalsToReceive"]>;
    sendWork: boolean;
    approved: TransferOperation[];
    approvedFiles: TransferFileOperation[];
  }): Promise<Applied> {
    const { call } = this;
    const { review, refusals, approved } = plan;
    let { transferId, sendWork } = plan;
    const applied: Applied = { changedAgain: [], unreviewed: [], unreviewedFiles: [] };
    let replaced = false;
    if (plan.setId !== "") {
      applied.receive = await runReceive(call, plan.setId, review.receiveDecisions());
      if (applied.receive.status !== "ok" || applied.receive.data.status !== "finished") {
        return applied;
      }
      replaced = applied.receive.data.result.received.length > 0;
    }
    if (refusals.length > 0) {
      // A refused document the person chose to receive has a cloud revision
      // newer than any set the sheet read. Capture a set for it and receive
      // only those documents (review F39).
      const fresh = await captureReceiveOf(call, this.projectId);
      if (fresh.status !== "ok") {
        applied.refusalReceive = fresh;
        return applied;
      }
      const decisions: ReceiveDecision[] = [];
      let wanted = false;
      // Every other document of the set gets an explicit Keep local, also a
      // Same one whose files changed (review F51).
      for (const document of fresh.data.documents) {
        const refusal = refusals.find((item) => item.kind === document.kind && item.cloudId === document.cloudId);
        if (refusal) {
          // The approval covers the cloud revision the refusal named and this
          // computer's copy the sheet was about to send. Either one changed
          // asks again (review F46).
          const reviewedLocal =
            approved.filter((op) => op.kind === document.kind && op.documentId === document.cloudId).pop()
              ?.capturedHash ?? "";
          if (document.contentHash !== refusal.cloudHash || reviewedLocal === "" || document.localHash !== reviewedLocal) {
            applied.changedAgain.push({
              code: "BASE_CHANGED",
              kind: document.kind,
              documentId: document.cloudId,
              storedHash: document.contentHash,
              message: "changed since the review"
            });
          }
        }
        wanted = wanted || refusal !== undefined;
        decisions.push({ kind: document.kind, documentId: document.cloudId, choice: refusal ? "receive" : "keep_local" });
      }
      if (applied.changedAgain.length > 0) {
        await cancelReceive(call, fresh.data.setId);
        return applied;
      }
      if (!wanted) {
        await cancelReceive(call, fresh.data.setId);
      } else {
        applied.refusalReceive = await runReceive(call, fresh.data.setId, decisions);
        if (applied.refusalReceive.status !== "ok" || applied.refusalReceive.data.status !== "finished") {
          return applied;
        }
        replaced = replaced || applied.refusalReceive.data.result.received.length > 0;
      }
    }
    // The captured send may carry a document the receive just replaced:
    // capture it again, so it sends only what is still changed here.
    if (replaced && sendWork) {
      applied.endedSend = await cancelSend(call, transferId);
      if (applied.endedSend.status !== "ok") {
        return applied;
      }
      const again = await captureSendOf(call, this.projectId, this.projectName);
      applied.recaptured = again;
      if (again.status !== "ok" || "collectFirst" in again) {
        return applied;
      }
      transferId = again.data.transferId;
      // The recapture may hold work the sheet never showed. That goes back
      // to the person first.
      applied.unreviewed = unreviewedOperations(approved, again.data.operations);
      applied.unreviewedFiles = unreviewedFileOperations(plan.approvedFiles, again.data.fileOperations);
      if (applied.unreviewed.length > 0 || applied.unreviewedFiles.length > 0) {
        return applied;
      }
      sendWork =
        again.data.operations.length > 0 ||
        again.data.fileOperations.length > 0 ||
        review.confirmedDeletes().length > 0;
    }
    if (sendWork) {
      const keep = review.keepLocalDecisions();
      let run = await sendRunOf(call, transferId, review, keep);
      if (run.status === "ok" && !run.data.committed) {
        // Documents kept local are refused once: their base is older than
        // the cloud revision the person saw.
        const answered = review.answeredRefusals(run.data.failures);
        if (answered.length > 0 && answered.length === run.data.failures.length) {
          run = await sendRunOf(call, transferId, review, [...keep, ...answered]);
        }
      }
      applied.send = run;
    }
    return applied;
  }

  private finishApply(sequence: number, applied: Applied): void {
    if (sequence !== this.sequence) {
      return;
    }
    if (applied.receive) {
      const run = applied.receive;
      if (run.status !== "ok") {
        this.reviewAgain(failureOf(run));
        return;
      }
      if (run.data.status === "waiting_for_review") {
        const waiting = waitingReceiveFrom(run.data);
        if (waiting !== null && waiting.setId !== "") {
          // A document changed here after the review, or the set expired and
          // its replacement shows other revisions. The same receive goes on
          // with the set the router named (review F50).
          this.setId = waiting.setId;
          this.review = new TransferReview(this.sendCapture, waiting);
          this.reviewAgain({ key: "receiveChangedWhileOpen" });
          return;
        }
      }
      if (run.data.status !== "finished") {
        // The revision set expired while the sheet was open.
        this.endSend(this.transferId);
        this.transferId = "";
        this.review = new TransferReview(null, null);
        this.fail({ key: "receiveExpired" });
        return;
      }
      const result = run.data.result;
      this.received = true;
      this.receivedResult = {
        received: namesOf(result.received),
        notReceived: namesOf(result.not_received),
        changedDuringReceive: namesOf(result.changed_during_receive),
        missingFiles: result.missing_files.length,
        published: false,
        sent: false
      };
    }
    if (applied.changedAgain.length > 0) {
      // Ask again, naming the cloud revision as it is now.
      this.review.addRefusal(applied.changedAgain);
      this.reviewAgain({ key: "chooseAgain", count: applied.changedAgain.length });
      return;
    }
    if (applied.refusalReceive) {
      const run = applied.refusalReceive;
      if (run.status !== "ok") {
        this.reviewAgain(failureOf(run));
        return;
      }
      if (run.data.status === "waiting_for_review" && run.data.set_id !== "") {
        // The set captured for the refused documents is not received:
        // release it, so it is not left behind (review F50).
        this.endReceive(run.data.set_id);
      }
      if (run.data.status !== "finished") {
        this.reviewAgain({ key: "receivingChangedAgain" });
        return;
      }
      const base = this.receivedResult ?? {
        received: [],
        notReceived: [],
        changedDuringReceive: [],
        missingFiles: 0,
        published: false,
        sent: false
      };
      this.receivedResult = {
        ...base,
        received: [...base.received, ...namesOf(run.data.result.received)],
        changedDuringReceive: [...base.changedDuringReceive, ...namesOf(run.data.result.changed_during_receive)]
      };
    }
    if (applied.endedSend && applied.endedSend.status !== "ok") {
      // The receive finished, but the send it made stale could not be ended.
      // transferId still names it, so cancel can end it later.
      this.fail({ key: "notPreparedAgain", status: applied.endedSend.status, reason: applied.endedSend.reason });
      return;
    }
    if (applied.recaptured) {
      const again = applied.recaptured;
      if (again.status !== "ok") {
        this.transferId = "";
        this.fail(failureOf(again));
        return;
      }
      if ("collectFirst" in again) {
        // The receive finished. What is left to send goes at the next Synchronize.
        this.transferId = "";
        this.fail({ key: "serverMessage", text: again.collectFirst.message });
        return;
      }
      this.transferId = again.data.transferId;
      this.sendWork = again.data.operations.length > 0 || again.data.fileOperations.length > 0;
      if (applied.unreviewed.length > 0 || applied.unreviewedFiles.length > 0) {
        // The receive is done. The send shows again with what changed here.
        this.review = new TransferReview(again.data, null);
        this.sendCapture = again.data;
        this.approved = again.data.operations;
        this.approvedFiles = again.data.fileOperations;
        this.result = this.receivedResult;
        this.reviewAgain({ key: "sendChangedWhileOpen" });
        return;
      }
    }
    let sent = false;
    if (applied.send) {
      const run = applied.send;
      if (run.status !== "ok") {
        this.reviewAgain(failureOf(run));
        return;
      }
      if (run.data.missingUnconfirmed) {
        // The send lists other missing files than the sheet showed.
        this.reviewAgain({ key: "missingFilesUnconfirmed" });
        return;
      }
      if (!run.data.committed) {
        // Ask again for the documents the cloud changed since the sheet was
        // read. Other refusals stay as a message.
        const answered = this.review.answeredRefusals(run.data.failures);
        const ask: TransferFailure[] = [];
        const others: string[] = [];
        for (const failure of run.data.failures) {
          if (answered.some((item) => item.kind === failure.kind && item.documentId === failure.documentId)) {
            continue;
          }
          if (failure.code === "BASE_CHANGED" && failure.storedHash !== "") {
            ask.push(failure);
          } else {
            others.push(failure.message === "" ? failure.code : failure.message);
          }
        }
        this.review.addRefusal(ask);
        this.reviewAgain(
          others.length > 0 ? { key: "sendRefused", reasons: others } : { key: "cloudChangedChooseAgain", count: ask.length }
        );
        return;
      }
      sent = true;
    }
    this.result = {
      ...(this.receivedResult ?? { received: [], notReceived: [], changedDuringReceive: [], missingFiles: 0 }),
      published: sent && !this.linked,
      sent
    };
    this.transferId = "";
    this.stage = "finished";
    this.message = null;
    this.changed();
  }

  private endSend(transferId: string): void {
    if (transferId !== "" && this.signedIn()) {
      void cancelSend(this.call, transferId);
    }
  }

  private endReceive(setId: string): void {
    if (setId !== "" && this.signedIn()) {
      void cancelReceive(this.call, setId);
    }
  }

  /** Closes the sheet: ends the open send and the receive not yet run. A running apply is not stopped. */
  cancel(): void {
    if (this.stage === "running") {
      return;
    }
    ++this.sequence;
    this.endSend(this.transferId);
    if (!this.received) {
      this.endReceive(this.setId);
    }
    this.transferId = "";
    this.setId = "";
    this.review = new TransferReview(null, null);
    this.stage = "idle";
    this.message = null;
    this.external = [];
    this.changed();
  }
}
