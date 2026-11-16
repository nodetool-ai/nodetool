// The CloudSaver for each document kind that phase 1 opens as a cloud
// document (WP1.10): workflows and timelines. Each sends one save of the
// whole document through CloudClient, with the editing instance and the
// schema version the server checks (WP1.6, WP1.7).
//
// Before its first save a saver reads `GET /api/sync/capabilities` and
// writes only when the server takes this client's protocol and the kind's
// schema version as whole-document saves. A server without the route lacks
// the save guarantees (revision retention, the editing-instance rule), so
// its documents are never written.
//
// A save goes only to the account and server its draft belongs to, and
// always names the revision it edits. When another save got there first
// (ALREADY_EXISTS), the saver reads the latest revision and sends the draft
// again on it: the draft wins, and the server keeps the revision it replaces
// as a version.
//
// The draft is the document as JSON text:
//
// | Kind     | Draft                                  | Procedure            |
// |----------|----------------------------------------|----------------------|
// | workflow | the graph, `{"nodes": [], "edges": []}` | `workflows.autosave` |
// | timeline | the timeline document                  | `timeline.update`    |
#pragma once

#include "nodetool/account/cloud_client.h"
#include "nodetool/account/cloud_drafts.h"

#include <map>
#include <mutex>
#include <optional>
#include <string>

namespace nodetool::account {

// The document schema version this client writes, per kind. A document the
// server stored in a higher version opens read-only, and a save of it is
// refused with SCHEMA_DOWNGRADE.
inline constexpr int kWorkflowSchemaVersion = 1;
inline constexpr int kTimelineSchemaVersion = 1;

// A conflict is retried this many times before the save counts as offline
// and is tried again later.
inline constexpr int kConflictRetries = 3;

// A document as `open()` read it.
struct OpenedDocument {
  // Ok, Offline, SignedOut, or Refused with `reason`.
  SaveStatus status = SaveStatus::Offline;
  std::string reason;
  // The revision a save of this document edits.
  CloudBase base;
  // The read procedure's answer, the document JSON.
  std::string data;
  // The schema version the document is stored in.
  int schemaVersion = 1;
  // False when the document is stored in a schema this client cannot write,
  // or the server does not take this client's saves. `reason` says why.
  bool writable = false;
};

struct DocumentAccess {
  std::string role = "editor";
  CloudDocumentOptions options;
};

// What the save of one kind sends and reads back. Thread affinity: thread-
// safe. The access table is guarded by `mutex_`; the rest is immutable.
class TrpcCloudSaver : public CloudSaver {
public:
  explicit TrpcCloudSaver(CloudClient& client);

  SaveResult save(const CloudDocumentKey& key, const std::string& editingInstance, const CloudBase& base,
                  const std::string& draft) final;

  // The role and options of a document, as the app learned them when it
  // opened it. A save reports them to the local store, because the save's
  // answer does not carry them. A document with none recorded reads as
  // editor without options.
  void setAccess(const std::string& documentId, DocumentAccess access);

  // Reads a document to open it, and records whether this client may write
  // it. A save of a document opened read-only is refused without sending.
  OpenedDocument open(const CloudDocumentKey& key);

protected:
  // The tRPC procedure, such as `workflows.autosave`.
  virtual const char* procedure() const = 0;
  // The procedure's input, or nullopt when the draft is not valid JSON of
  // the kind's shape.
  virtual std::optional<std::string> input(const CloudDocumentKey& key, const std::string& editingInstance,
                                           const CloudBase& base, const std::string& draft) const = 0;
  // The new revision's `updated_at` in the procedure's answer.
  virtual std::optional<std::string> updatedAt(const std::string& data) const = 0;
  // The read procedure, such as `workflows.get`.
  virtual const char* readProcedure() const = 0;
  // The stored schema version in the read procedure's answer.
  virtual int schemaVersionOf(const std::string& data) const = 0;
  // `workflow` or `timeline`: the kind's key in the capabilities.
  virtual const char* kind() const = 0;
  // The schema version this client writes for the kind.
  virtual int schemaVersion() const = 0;

private:
  struct Outcome {
    SaveResult result;
    std::string data;
  };

  DocumentAccess accessOf(const std::string& documentId) const;
  // Whether `key` names the client's own server and account.
  bool boundTo(const CloudDocumentKey& key) const;
  // Sends `request` and sorts the answer: a 401 the refresh could not cure
  // is signed out, and a timeout, a rate limit or a server failure is
  // offline. Both are retried later. Any other error status is a refusal.
  Outcome call(HttpRequest request);
  // Whether the server takes this client's saves of the kind. A Refused
  // result names why it does not.
  SaveResult checkWritable();
  // Reads the stored revision.
  OpenedDocument read(const CloudDocumentKey& key);

  CloudClient& client_;
  mutable std::mutex mutex_;
  // Guarded by mutex_.
  std::map<std::string, DocumentAccess> access_;
  // Guarded by mutex_. Documents opened read-only, with the reason.
  std::map<std::string, std::string> readOnly_;
  // Guarded by mutex_. Set once the capabilities allowed writing.
  bool writable_ = false;
};

// Thread affinity: thread-safe, as TrpcCloudSaver.
class WorkflowCloudSaver final : public TrpcCloudSaver {
public:
  using TrpcCloudSaver::TrpcCloudSaver;

protected:
  const char* readProcedure() const override { return "workflows.get"; }
  int schemaVersionOf(const std::string& data) const override;
  const char* kind() const override { return "workflow"; }
  int schemaVersion() const override { return kWorkflowSchemaVersion; }
  const char* procedure() const override { return "workflows.autosave"; }
  std::optional<std::string> input(const CloudDocumentKey& key, const std::string& editingInstance,
                                   const CloudBase& base, const std::string& draft) const override;
  std::optional<std::string> updatedAt(const std::string& data) const override;
};

// Thread affinity: thread-safe, as TrpcCloudSaver.
class TimelineCloudSaver final : public TrpcCloudSaver {
public:
  using TrpcCloudSaver::TrpcCloudSaver;

protected:
  const char* readProcedure() const override { return "timeline.get"; }
  int schemaVersionOf(const std::string& data) const override;
  const char* kind() const override { return "timeline"; }
  int schemaVersion() const override { return kTimelineSchemaVersion; }
  const char* procedure() const override { return "timeline.update"; }
  std::optional<std::string> input(const CloudDocumentKey& key, const std::string& editingInstance,
                                   const CloudBase& base, const std::string& draft) const override;
  std::optional<std::string> updatedAt(const std::string& data) const override;
};

} // namespace nodetool::account
