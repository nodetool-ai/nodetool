// The CloudSaver for each document kind that phase 1 opens as a cloud
// document (WP1.10): workflows and timelines. Each sends one save of the
// whole document through CloudClient, with the editing instance and the
// schema version the server checks (WP1.6, WP1.7).
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

protected:
  // The tRPC procedure, such as `workflows.autosave`.
  virtual const char* procedure() const = 0;
  // The procedure's input, or nullopt when the draft is not valid JSON of
  // the kind's shape.
  virtual std::optional<std::string> input(const CloudDocumentKey& key, const std::string& editingInstance,
                                           const CloudBase& base, const std::string& draft) const = 0;
  // The new revision's `updated_at` in the procedure's answer.
  virtual std::optional<std::string> updatedAt(const std::string& data) const = 0;

private:
  DocumentAccess accessOf(const std::string& documentId) const;

  CloudClient& client_;
  mutable std::mutex mutex_;
  // Guarded by mutex_.
  std::map<std::string, DocumentAccess> access_;
};

// Thread affinity: thread-safe, as TrpcCloudSaver.
class WorkflowCloudSaver final : public TrpcCloudSaver {
public:
  using TrpcCloudSaver::TrpcCloudSaver;

protected:
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
  const char* procedure() const override { return "timeline.update"; }
  std::optional<std::string> input(const CloudDocumentKey& key, const std::string& editingInstance,
                                   const CloudBase& base, const std::string& draft) const override;
  std::optional<std::string> updatedAt(const std::string& data) const override;
};

} // namespace nodetool::account
