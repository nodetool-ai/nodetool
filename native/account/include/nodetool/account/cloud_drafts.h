// The saved state of one cloud document (FR11, the technical design's
// "Local data scoping and durable drafts"):
//
// 1. An edit changes the in-memory document. The status is Changes waiting
//    or Sending, never Saved.
// 2. Within 750 ms the draft is written to the local store. Only then does
//    the edit count as stored locally.
// 3. The save goes to the cloud server. On acceptance the draft row is
//    deleted and the new base stored in one transaction. Only then does the
//    status read Saved to cloud.
// 4. When the local write fails, the status reads Not saving at once, the
//    edits stay in memory, and the write is retried every 2 seconds.
//
// Steps 2 and 3 run on two worker threads, so a slow cloud server never
// delays the local write of a newer edit.
#pragma once

#include "nodetool/account/cloud_client.h"
#include "nodetool/account/http_transport.h"

#include <cstdint>
#include <mutex>
#include <optional>
#include <string>
#include <utility>
#include <vector>

namespace nodetool::account {

struct CloudBase {
  std::string updatedAt;
  std::string contentHash;
};

struct CloudDocumentOptions {
  bool allowHistory = false;
  bool allowDownload = false;
  bool allowDuplicate = false;
};

struct CloudDocumentKey {
  // First 16 hex characters of the SHA-256 of the server origin.
  std::string serverKey;
  std::string accountId;
  // `workflow`, `timeline`, …
  std::string kind;
  std::string documentId;
};

enum class AcceptOutcome { Deleted, Rebased, Stale, NoDraft };

enum class DraftState { Waiting, Unsent };

// One draft row. `draftId` names the write that stored it. No other write
// ever gets the same id, so an acknowledgement names exactly one draft.
struct StoredDraft {
  CloudDocumentKey key;
  std::string draftId;
  // The server version the draft edits.
  CloudBase base;
  std::string draft;
  DraftState state = DraftState::Waiting;
  std::string refusal;
};

// The result of a read: `ok` is false when the store did not answer.
struct DraftLoad {
  bool ok = false;
  std::optional<StoredDraft> draft;
};

struct DraftList {
  bool ok = false;
  std::vector<StoredDraft> drafts;
};

// The local store of drafts: the cloudLocal procedures of the app's bundled
// server. Each write returns nullopt or false when it did not commit.
//
// Thread affinity: implementations are thread-safe.
class DraftStore {
public:
  virtual ~DraftStore() = default;
  // Returns the new draft id.
  virtual std::optional<std::string> put(const CloudDocumentKey& key, const CloudBase& base,
                                         const std::string& draft) = 0;
  // The server accepted draft `draftId`, which edited `sentBase`, and
  // produced `base`.
  virtual std::optional<AcceptOutcome> accept(const CloudDocumentKey& key, const std::string& draftId,
                                              const CloudBase& sentBase, const CloudBase& base,
                                              const std::string& role, const CloudDocumentOptions& options) = 0;
  // Returns whether the call committed. A draft that changed since the send
  // is left waiting, which also counts as committed.
  virtual bool markUnsent(const CloudDocumentKey& key, const std::string& draftId, const std::string& reason) = 0;
  // The draft of one document, to resume after a restart.
  virtual DraftLoad load(const CloudDocumentKey& key) = 0;
  // Every draft of one account, oldest first.
  virtual DraftList list(const std::string& serverKey, const std::string& accountId) = 0;
};

// DraftStore over the cloudLocal tRPC procedures of the local server.
//
// Thread affinity: thread-safe. It holds no mutable state.
class LocalServerDraftStore final : public DraftStore {
public:
  // `localOrigin` is the bundled server, such as http://127.0.0.1:7777.
  // `headers` are added to every call, such as the local server's own
  // authorization.
  LocalServerDraftStore(HttpTransport& transport, std::string localOrigin,
                        std::vector<std::pair<std::string, std::string>> headers = {});

  std::optional<std::string> put(const CloudDocumentKey& key, const CloudBase& base,
                                 const std::string& draft) override;
  std::optional<AcceptOutcome> accept(const CloudDocumentKey& key, const std::string& draftId,
                                      const CloudBase& sentBase, const CloudBase& base, const std::string& role,
                                      const CloudDocumentOptions& options) override;
  bool markUnsent(const CloudDocumentKey& key, const std::string& draftId, const std::string& reason) override;
  DraftLoad load(const CloudDocumentKey& key) override;
  DraftList list(const std::string& serverKey, const std::string& accountId) override;

private:
  // POSTs `input` to /trpc/<procedure> and returns the result data, or
  // nullopt when the call did not succeed.
  std::optional<std::string> mutate(const std::string& procedure, const std::string& input);
  // GETs /trpc/<procedure>?input=<input> and returns the result data.
  std::optional<std::string> query(const std::string& procedure, const std::string& input);
  std::optional<std::string> call(HttpRequest request);

  HttpTransport& transport_;
  const std::string origin_;
  const std::vector<std::pair<std::string, std::string>> headers_;
};

enum class SaveStatus { Ok, Refused, Offline, SignedOut };

struct SaveResult {
  SaveStatus status = SaveStatus::Offline;
  // Ok: the version the save produced, and the access the server reported.
  CloudBase base;
  std::string role;
  CloudDocumentOptions options;
  // Refused: the server's code, such as FILE_NOT_READABLE.
  std::string reason;
};

// Sends one save of a whole document to the cloud server.
//
// Thread affinity: implementations are thread-safe.
class CloudSaver {
public:
  virtual ~CloudSaver() = default;
  virtual SaveResult save(const CloudDocumentKey& key, const CloudBase& base, const std::string& draft) = 0;
};

enum class DocumentStatus {
  SavedToCloud,
  Sending,
  ChangesWaiting,
  Offline,
  NotSaving,
  // The server refused the last save. The edits are kept as unsent.
  Unsent,
  SignedOut,
};

struct DocumentState {
  DocumentStatus status = DocumentStatus::SavedToCloud;
  // True while the latest edit is not yet in the local store.
  bool unstoredEdits = false;
  // The refusal code while `status` is Unsent.
  std::string refusal;
  // Milliseconds since the Unix epoch of the last answer from the cloud
  // server, 0 for none.
  int64_t lastContactMs = 0;
};

// A draft is written once the edits pause for kDraftIdleMs, and at the
// latest kDraftForceMs after the first unstored edit. With a tick at least
// every 250 ms, every edit reaches the store within kDraftMaxDelayMs.
inline constexpr int64_t kDraftIdleMs = 200;
inline constexpr int64_t kDraftForceMs = 500;
inline constexpr int64_t kDraftMaxDelayMs = 750;
inline constexpr int64_t kDraftRetryMs = 2000;
inline constexpr int64_t kSendRetryMs = 5000;

// Drives the saved-state rule for one open cloud document.
//
// Thread affinity: edit() and state() may be called from any thread, such
// as the UI thread. persist() runs on one worker thread and send() on
// another, because each blocks on the local store or the cloud server.
// `mutex_` guards every field below it; neither worker holds it across a
// call to the store or the server.
class CloudDocumentSaver {
public:
  CloudDocumentSaver(DraftStore& store, CloudSaver& cloud, CloudDocumentKey key, CloudBase base);
  // Resumes a draft the store kept, such as after a restart: a waiting
  // draft is sent again on the base it edits, and an unsent one shows its
  // refusal.
  CloudDocumentSaver(DraftStore& store, CloudSaver& cloud, StoredDraft resumed);

  // The whole in-memory document after an edit.
  void edit(std::string document, int64_t nowMs);

  // Step 2: writes the latest edit to the local store when it is due, and
  // retries a failed write. Call at least every 250 ms.
  void persist(int64_t nowMs);

  // Step 3: sends the stored draft, records the acceptance or refusal
  // locally, and retries a failed step. A local record that failed is
  // retried alone, never by sending again. Call at least every 250 ms.
  void send(int64_t nowMs);

  DocumentState state() const;

private:
  struct Sent {
    std::string draftId;
    CloudBase sentBase;
    SaveResult result;
  };

  // Sets the status, or Not saving while a local write fails. Call with
  // mutex_ held.
  void publishLocked(DocumentStatus status);
  // Records an acceptance. Returns false when the store did not commit.
  bool recordAcceptance(const Sent& sent, int64_t nowMs);
  // Records a refusal. Returns false when the store did not commit.
  bool recordRefusal(const Sent& sent, int64_t nowMs);

  DraftStore& store_;
  CloudSaver& cloud_;
  const CloudDocumentKey key_;

  mutable std::mutex mutex_;
  std::optional<std::string> unstored_;
  int64_t firstUnstoredMs_ = 0;
  int64_t lastEditMs_ = 0;
  uint64_t editCount_ = 0;
  bool writeFailing_ = false;
  bool recordFailing_ = false;
  DocumentState state_;
  // The version the next save edits: the last one the server produced.
  CloudBase base_;
  // The latest stored draft, while it is not yet accepted or refused.
  std::optional<std::string> storedId_;
  std::string storedDraft_;
  bool sendPending_ = false;
  // A save the server answered whose local record has not committed.
  std::optional<Sent> unrecorded_;
  int64_t nextWriteMs_ = 0;
  int64_t nextSendMs_ = 0;
};

} // namespace nodetool::account
