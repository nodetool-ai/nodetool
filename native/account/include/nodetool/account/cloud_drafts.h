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

enum class AcceptOutcome { Deleted, Rebased, NoDraft };

// The local store of drafts: the cloudLocal procedures of the app's bundled
// server. Each call returns nullopt or false when the write did not commit.
//
// Thread affinity: implementations are thread-safe.
class DraftStore {
public:
  virtual ~DraftStore() = default;
  // Returns the row's new revision.
  virtual std::optional<int64_t> put(const CloudDocumentKey& key, const CloudBase& base, const std::string& draft) = 0;
  virtual std::optional<AcceptOutcome> accept(const CloudDocumentKey& key, int64_t revision, const CloudBase& base,
                                              const std::string& role, const CloudDocumentOptions& options) = 0;
  virtual bool markUnsent(const CloudDocumentKey& key, int64_t revision, const std::string& reason) = 0;
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

  std::optional<int64_t> put(const CloudDocumentKey& key, const CloudBase& base, const std::string& draft) override;
  std::optional<AcceptOutcome> accept(const CloudDocumentKey& key, int64_t revision, const CloudBase& base,
                                      const std::string& role, const CloudDocumentOptions& options) override;
  bool markUnsent(const CloudDocumentKey& key, int64_t revision, const std::string& reason) override;

private:
  // POSTs `input` to /trpc/<procedure> and returns the result data, or
  // nullopt when the call did not succeed.
  std::optional<std::string> mutate(const std::string& procedure, const std::string& input);

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
// as the UI thread. tick() runs on one worker thread, because it blocks on
// the local store and the cloud server. `mutex_` guards the edit fields and
// the state; tick() never holds it across a call to the store or the server.
class CloudDocumentSaver {
public:
  CloudDocumentSaver(DraftStore& store, CloudSaver& cloud, CloudDocumentKey key, CloudBase base);

  // The whole in-memory document after an edit.
  void edit(std::string document, int64_t nowMs);

  // Writes the draft when it is due, sends it when it is stored, and
  // retries failed steps. Call at least every 250 ms, such as every 100 ms.
  void tick(int64_t nowMs);

  DocumentState state() const;

private:
  // Sets the status, or Not saving while a local write fails. Call with
  // mutex_ held.
  void publishLocked(DocumentStatus status);

  DraftStore& store_;
  CloudSaver& cloud_;
  const CloudDocumentKey key_;

  mutable std::mutex mutex_;
  // Guarded by mutex_.
  std::optional<std::string> unstored_;
  int64_t firstUnstoredMs_ = 0;
  int64_t lastEditMs_ = 0;
  uint64_t editCount_ = 0;
  bool writeFailing_ = false;
  bool acceptFailing_ = false;
  DocumentState state_;

  // Touched by tick() only.
  CloudBase base_;
  std::optional<int64_t> storedRevision_;
  std::string storedDraft_;
  bool sendPending_ = false;
  int64_t nextWriteMs_ = 0;
  int64_t nextSendMs_ = 0;
};

} // namespace nodetool::account
