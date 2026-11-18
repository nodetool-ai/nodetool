// Publish and Synchronize of a linked project from a native app (technical
// design WP2.7 and WP2.8). The local server bundled with the app runs the
// transfer (its `cloudTransfer.*` router). This client names the cloud
// server and account, hands the access token for the calls that reach the
// cloud, and reads the answers into plain structs. TransferReview turns the
// captures into the rows of the review sheet and collects the person's
// choices.
#pragma once

#include "nodetool/account/account_session.h"
#include "nodetool/account/http_transport.h"

#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace nodetool::account {

enum class TransferStatus {
  Ok,
  // The session is signed out, or the cloud refused the access token after
  // one renewal.
  SignedOut,
  // The cloud server did not answer, or answered that it is busy. Nothing
  // changed, and the call can be repeated.
  Offline,
  // The local server did not answer.
  LocalUnavailable,
  // The local server or the cloud refused the call. `reason` names the API
  // code.
  Refused,
};

// One operation of a captured send, as the transfer manifest lists it.
struct TransferOperation {
  // `create_document`, `replace_document`, `rename_document`, `keep_both`,
  // `delete_document` or another operation the server names.
  std::string op;
  // `workflow` or `timeline`.
  std::string kind;
  std::string documentId;
  // The new name of a rename.
  std::string name;
  // The hash of the captured payload, and the cloud revision it replaces,
  // where the operation has them.
  std::string capturedHash;
  std::string baseHash;
};

// The operations of `recaptured` that the person did not review in
// `approved`: another operation, document, name, payload or base. A
// recapture that only leaves out operations, such as those of documents
// the receive replaced, has none.
std::vector<TransferOperation> unreviewedOperations(const std::vector<TransferOperation>& approved,
                                                    const std::vector<TransferOperation>& recaptured);

// A file the send puts, also for a document it leaves unchanged (review
// F33).
struct TransferFileOperation {
  // `put_asset_file` or another file operation the server names.
  std::string op;
  std::string assetId;
  std::string path;
  std::string hash;
  std::string baseHash;
};

// The file operations of `recaptured` that are not in `approved`.
std::vector<TransferFileOperation> unreviewedFileOperations(const std::vector<TransferFileOperation>& approved,
                                                            const std::vector<TransferFileOperation>& recaptured);

// A document the send captured, so the sheet can name an operation's
// document.
struct TransferDocument {
  std::string kind;
  std::string localId;
  std::string cloudId;
  std::string name;
};

// A required file that cannot be sent (X7).
struct TransferMissingFile {
  std::string assetId;
  // `missing_locally`, `too_large` or `over_allowance`.
  std::string reason;
  // The documents that refer to the file, as `kind` and id.
  std::vector<std::pair<std::string, std::string>> documents;
  // The entry as the capture listed it. A confirmation sends it back
  // unchanged, since a send commits only when the confirmed list is the
  // captured one (X7, review F36).
  std::string raw;
};

// A document whose file is invalid, sent from its last valid row (CF3).
struct TransferSkipped {
  std::string kind;
  std::string id;
  std::string name;
  std::string detail;
};

// A linked document deleted on this computer since the last transfer.
struct TransferDeleted {
  std::string kind;
  std::string localId;
  std::string cloudId;
  // The cloud hash of the last exchange.
  std::string baseHash;
};

// A deletion the person confirmed, bound to the cloud revision the sheet
// showed. That hash is the delete's precondition (V4, review F40).
struct DeleteConfirmation {
  std::string kind;
  std::string cloudId;
  std::string cloudHash;
};

struct SendCapture {
  TransferStatus status = TransferStatus::LocalUnavailable;
  std::string reason;
  // Set when the capture did not start because assets have a file outside
  // the project folder (CF6). `external` lists their paths.
  bool collectFirst = false;
  std::vector<std::string> external;
  std::string message;

  std::string transferId;
  bool firstPublication = false;
  std::vector<TransferOperation> operations;
  // Files the send puts. A send with only file operations still has work.
  std::vector<TransferFileOperation> fileOperations;
  std::vector<TransferDocument> documents;
  std::vector<TransferMissingFile> missingFiles;
  std::vector<TransferSkipped> skipped;
  std::vector<TransferDeleted> deletedLocally;
  // Documents whose file is missing from the project folder. Each is sent
  // from its last saved row (CF3, review F56).
  std::vector<TransferSkipped> missingDocumentFiles;
};

// A Keep local choice for a document whose cloud version changed since its
// base. `cloudHash` is the stored hash the review showed.
struct KeepLocalDecision {
  std::string kind;
  std::string documentId;
  std::string cloudHash;
};

struct TransferFailure {
  // `BASE_CHANGED`, `MISSING_FILE` or another refusal code.
  std::string code;
  std::string kind;
  std::string documentId;
  // For BASE_CHANGED: the stored hash a Keep local decision names.
  std::string storedHash;
  std::string message;
};

struct SendRun {
  TransferStatus status = TransferStatus::LocalUnavailable;
  std::string reason;
  // True when the attempt committed. False with `failures` when the cloud
  // refused it and the review must ask again.
  bool committed = false;
  // True when the send lists missing files the person did not confirm as
  // listed. Nothing was sent (review F36).
  bool missingUnconfirmed = false;
  std::string cloudProjectId;
  std::vector<TransferFailure> failures;
};

enum class ReceiveState {
  New,
  Same,
  CloudChanged,
  LocalChanged,
  BothChanged,
  LocalDeleted,
};

enum class ReceiveChoice { Receive, KeepLocal };

struct ReceiveDocument {
  std::string kind;
  std::string cloudId;
  std::string localId;
  std::string name;
  // The content hash of the cloud revision the review shows.
  std::string contentHash;
  ReceiveState state = ReceiveState::Same;
  // The choice taken without the person, or empty when the review asks.
  std::optional<ReceiveChoice> decision;
  std::size_t missingFiles = 0;
  // The hash of this computer's copy at the capture, empty when it has none.
  std::string localHash;
  // Files whose cloud bytes this folder does not hold. A Same document with
  // changed files still receives them (reviews F33, F51).
  std::size_t changedFiles = 0;
};

struct ReceiveCapture {
  TransferStatus status = TransferStatus::LocalUnavailable;
  std::string reason;
  std::string setId;
  std::vector<ReceiveDocument> documents;
};

struct ReceiveDecision {
  std::string kind;
  std::string documentId;
  ReceiveChoice choice = ReceiveChoice::Receive;
};

struct ReceiveRun {
  TransferStatus status = TransferStatus::LocalUnavailable;
  std::string reason;
  // `finished`, `expired` or `waiting_for_review`.
  std::string outcome;
  std::vector<std::string> received;
  std::vector<std::string> changedDuringReceive;
  std::vector<std::string> notReceived;
  std::size_t missingFiles = 0;
  // For `waiting_for_review`: the set to review, which may replace the one
  // run, and its documents when the router sent them (review F50).
  std::string setId;
  bool reviewProvided = false;
  std::vector<ReceiveDocument> documents;
};

struct TransferResume {
  TransferStatus status = TransferStatus::LocalUnavailable;
  std::string reason;
  std::size_t sends = 0;
  std::size_t receives = 0;
};

// Thread affinity: thread-safe as long as the transport is. It holds no
// mutable state. Every call blocks on the transport, so the apps call it on
// a worker thread.
//
// Ownership: borrows the transport and the session, which must outlive it.
class LocalTransferClient {
public:
  // `localOrigin` is the app's bundled server on this computer
  // (isLoopbackHttpOrigin). Any other origin refuses every call with
  // NOT_LOCAL_SERVER before a credential is read, so the access token never
  // reaches another server. `cancel`, when set, stops every request of this
  // client once it turns true, so its owner can end a long run (review F42).
  LocalTransferClient(HttpTransport& transport, std::string localOrigin,
                      std::vector<std::pair<std::string, std::string>> headers, AccountSession& session,
                      std::shared_ptr<const RequestCancel> cancel = nullptr);

  SendCapture captureSend(const std::string& projectId, const std::string& projectName = {},
                          const std::string& deviceName = {});
  // `confirmMissing` is the capture's list of missing files once the person
  // confirmed each one, or empty.
  SendRun runSend(const std::string& transferId, const std::vector<KeepLocalDecision>& decisions,
                  const std::vector<DeleteConfirmation>& confirmDeletes,
                  const std::vector<TransferMissingFile>& confirmMissing = {});
  // Ends a send before it commits. `committed` is true when it had already
  // committed.
  struct Cancel {
    TransferStatus status = TransferStatus::LocalUnavailable;
    std::string reason;
    bool committed = false;
  };
  Cancel cancelSend(const std::string& transferId);

  ReceiveCapture captureReceive(const std::string& projectId);
  ReceiveRun runReceive(const std::string& setId, const std::vector<ReceiveDecision>& decisions);
  // Ends a receive before it applies: releases the cloud set and deletes
  // the local receive row (review F41). `applied` is true when it had
  // already applied.
  struct ReceiveCancel {
    TransferStatus status = TransferStatus::LocalUnavailable;
    std::string reason;
    bool applied = false;
  };
  ReceiveCancel cancelReceive(const std::string& setId);

  // Whether the project is linked to a cloud project of this server and
  // account, so the app offers Synchronize, or not, so it offers Publish to
  // Cloud. Reads the bundled server only and sends no token.
  enum class Link { Unlinked, Linked, LinkedElsewhere };
  struct LinkStatus {
    TransferStatus status = TransferStatus::LocalUnavailable;
    std::string reason;
    Link link = Link::Unlinked;
    std::string cloudProjectId;
  };
  LinkStatus linkStatus(const std::string& projectId);

  // Continues every send and receive of this account that a restart
  // interrupted.
  TransferResume resume();

  // One call of the local router for an app that reads the answer itself,
  // such as the desktop app's account helper. `inputJson` is the
  // procedure's input as a JSON object. The client sets `origin`,
  // `account_id` and, for the procedures that carry it, `access_token`,
  // replacing any value the input names. A procedure the router does not
  // have is refused with UNKNOWN_PROCEDURE before a credential is read.
  struct Answer {
    TransferStatus status = TransferStatus::LocalUnavailable;
    std::string reason;
    // The procedure's result as JSON, when `status` is Ok.
    std::string data;
  };
  Answer call(const std::string& procedure, const std::string& inputJson);

  // Whether a procedure of the router carries the access token. Empty for a
  // procedure the router does not have.
  static std::optional<bool> carriesToken(std::string_view procedure);

private:
  // A mutation of the local router. With `withToken`, the session's access
  // token goes in the input, and a cloud refusal of it renews the token once
  // and repeats the call.
  Answer mutate(const std::string& procedure, const std::string& inputJson, bool withToken);
  Answer post(const std::string& procedure, const std::string& body);

  HttpTransport& transport_;
  const std::string origin_;
  const std::vector<std::pair<std::string, std::string>> headers_;
  AccountSession& session_;
  const std::shared_ptr<const RequestCancel> cancel_;
};

enum class ReviewSection {
  // Sent to the cloud without a question.
  Send,
  // Received from the cloud without a question.
  Receive,
  // Changed on both sides: the person picks Receive or Keep local.
  Choice,
  // Deleted on this computer. Off until the person confirms each one.
  Deletion,
  // Cannot be sent as it is, with the reason.
  Problem,
};

struct ReviewRow {
  ReviewSection section = ReviewSection::Send;
  std::string kind;
  // The local id, or the cloud id of a document this computer never had.
  std::string documentId;
  // The cloud id, which receive decisions name. Empty for a document the
  // cloud does not hold yet.
  std::string cloudId;
  std::string name;
  // What the row says about the document, such as `create_document` or
  // `cloud_changed`.
  std::string detail;
  // For a Choice row: the person's pick, empty until made.
  std::optional<ReceiveChoice> choice;
  // For a Deletion row: true once the person confirms Keep local deletion,
  // which deletes the cloud document. The default restores the document from
  // the cloud (PRD V4 and V5).
  bool confirmed = false;
  // For a Deletion row: whether the send half lists the deletion (it can be
  // sent) and whether the receive half lists the cloud version (it can be
  // restored).
  bool sendListed = false;
  bool receiveListed = false;
  // For a Choice row raised by a refused send: the hash Keep local names.
  std::string cloudHash;
  // For a Send row: the document's file is missing from the project folder,
  // so its last saved row is sent (CF3, review F56).
  bool documentFileMissing = false;
  // For a Choice row from the receive half: the hash of the cloud revision
  // the person saw. For a Deletion row: the cloud revision a confirmed
  // deletion deletes, the newest one the sheet showed (review F40).
  std::string seenHash;
  // For a Problem row of a missing file: the file. `confirmed` is the
  // person's confirmation that the send goes without it (X7).
  std::string assetId;
};

// The review sheet of Publish and Synchronize (PRD "Link a local project"
// and "Synchronize a linked project"): what will be sent and received per
// document, the documents changed on both sides, deletions in their own
// section and off by default, and what cannot be sent.
//
// Thread affinity: none. It is a value, used on one thread at a time.
class TransferReview {
public:
  TransferReview() = default;
  TransferReview(const SendCapture& send, const ReceiveCapture& receive);

  // The cloud refused the send because these documents changed since their
  // base: each becomes a Choice row that names the stored hash, one row per
  // kind and cloud id. A refused deletion asks for the confirmation again,
  // of the stored revision.
  void addRefusal(const std::vector<TransferFailure>& failures);
  // The refused documents the person chose to receive. Their new cloud
  // revision is not in the receive set the sheet was read with, so the
  // controller captures and receives it before the send (review F39).
  struct RefusalReceive {
    std::string kind;
    std::string cloudId;
    // The cloud revision the refusal named, which the person chose to
    // receive. A newer one asks again (review F46).
    std::string cloudHash;
  };
  std::vector<RefusalReceive> refusalsToReceive() const;
  // The refusals the person answered already: a BASE_CHANGED refusal of a
  // document they chose Keep local for, whose stored hash is the cloud
  // revision they saw. Any other refusal is left for addRefusal.
  std::vector<KeepLocalDecision> answeredRefusals(const std::vector<TransferFailure>& failures) const;

  const std::vector<ReviewRow>& rows() const { return rows_; }
  // Sets the choice of Choice row `index`. Returns false for another row.
  bool choose(std::size_t index, std::optional<ReceiveChoice> choice);
  // Confirms or withdraws the deletion of Deletion row `index`. Returns
  // false for another row.
  bool confirmDeletion(std::size_t index, bool confirmed);
  // Confirms that the send goes without the missing file of Problem row
  // `index`, for every document that needs it. Returns false for another
  // row.
  bool confirmMissingFile(std::size_t index, bool confirmed);

  // True when every Choice row has a pick and every missing file is
  // confirmed (X7). Deletions and other problems never block.
  bool ready() const;

  std::vector<ReceiveDecision> receiveDecisions() const;
  std::vector<KeepLocalDecision> keepLocalDecisions() const;
  // The deletions the person confirmed, each with the cloud revision the
  // sheet showed.
  std::vector<DeleteConfirmation> confirmedDeletes() const;
  // The capture's missing files once each one is confirmed, or empty.
  std::vector<TransferMissingFile> confirmedMissingFiles() const;

private:
  std::vector<ReviewRow> rows_;
  std::vector<TransferMissingFile> missingFiles_;
};

std::string receiveStateName(ReceiveState state);

} // namespace nodetool::account
