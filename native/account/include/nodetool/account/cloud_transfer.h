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
#include <optional>
#include <string>
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
};

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
  std::vector<TransferDocument> documents;
  std::vector<TransferMissingFile> missingFiles;
  std::vector<TransferSkipped> skipped;
  std::vector<TransferDeleted> deletedLocally;
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
  LocalTransferClient(HttpTransport& transport, std::string localOrigin,
                      std::vector<std::pair<std::string, std::string>> headers, AccountSession& session);

  SendCapture captureSend(const std::string& projectId, const std::string& projectName = {},
                          const std::string& deviceName = {});
  SendRun runSend(const std::string& transferId, const std::vector<KeepLocalDecision>& decisions,
                  const std::vector<std::string>& confirmDeletes);
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

  // Continues every send and receive of this account that a restart
  // interrupted.
  TransferResume resume();

private:
  struct Answer {
    TransferStatus status = TransferStatus::LocalUnavailable;
    std::string reason;
    std::string data;
  };
  // A mutation of the local router. With `withToken`, the session's access
  // token goes in the input, and a cloud refusal of it renews the token once
  // and repeats the call.
  Answer mutate(const std::string& procedure, const std::string& inputJson, bool withToken);
  Answer post(const std::string& procedure, const std::string& body);

  HttpTransport& transport_;
  const std::string origin_;
  const std::vector<std::pair<std::string, std::string>> headers_;
  AccountSession& session_;
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
  // For a Choice row from the receive half: the hash of the cloud revision
  // the person saw.
  std::string seenHash;
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
  // base: each becomes a Choice row that names the stored hash.
  void addRefusal(const std::vector<TransferFailure>& failures);
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

  // True when every Choice row has a pick. Deletions and problems never
  // block.
  bool ready() const;

  std::vector<ReceiveDecision> receiveDecisions() const;
  std::vector<KeepLocalDecision> keepLocalDecisions() const;
  // Local ids of the documents the person confirmed for deletion on the
  // cloud.
  std::vector<std::string> confirmedDeletes() const;

private:
  std::vector<ReviewRow> rows_;
};

std::string receiveStateName(ReceiveState state);

} // namespace nodetool::account
