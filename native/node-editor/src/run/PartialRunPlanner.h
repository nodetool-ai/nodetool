#pragma once
#include <QHash>
#include <QJsonArray>
#include <QJsonObject>
#include <QList>
#include <QSet>
#include <QStringList>
namespace nodetool::node_editor {
struct ExecutionGeneration {
  QString id;
  QString jobId;
  qint64 createdAt = 0;
  QJsonObject outputs;
  QString inputSignature;
};
using ExecutionGenerations = QHash<QString, QList<ExecutionGeneration>>;
struct PartialRunPlan {
  bool ok = false;
  QString error;
  QJsonObject snapshot;
  QStringList executed;
  QStringList reused;
  QStringList blocked;
  QStringList stale;
  QHash<QString, QString> signatures;
};
// Port of web nodeHash/runResolve/runSubgraph. Inputs are persisted graph JSON.
// Cached execution values must come from complete authoritative generation events,
// never a bounded or rendered preview. Explicit runnable targets always execute.
// Group targets expand recursively. Frames/comments do not execute, while saved
// parent IDs and presentation fields on runnable nodes remain unchanged.
class PartialRunPlanner final {
public:
  PartialRunPlanner(QJsonObject snapshot, QJsonArray metadata,
                    ExecutionGenerations generations, qint64 now);
  [[nodiscard]] PartialRunPlan plan(const QStringList &targets);
  [[nodiscard]] QString inputSignature(const QString &nodeId);
  // Completion stamps prefer generations produced by the same job, mirroring
  // computeStampSignature. The graph remains the dispatch-time full graph.
  void preferJob(const QString &jobId);
  // An edit preview (web buildDownstreamRunGraph) reuses the current generation
  // of every computed upstream, whatever its cache TTL, so changing a node
  // reruns only that node and its downstream nodes.
  void setPreview(bool preview) { preview_ = preview; decisions_.clear(); }
private:
  enum class Kind { Constant, Generative, Computed };
  enum class Decision { Reuse, Replay, Run, Block };
  Kind kind(const QString &id) const;
  Decision decide(const QString &id);
  QString identity(const QString &id);
  const ExecutionGeneration *generation(const QString &id, bool matching = false);
  QJsonValue output(const ExecutionGeneration &generation, const QString &handle) const;
  QString title(const QString &id) const;
  QJsonObject snapshot_;
  QHash<QString, QJsonObject> nodes_, metadata_;
  QHash<QString, QList<QJsonObject>> inbound_, signatureInbound_;
  QHash<QString, QStringList> children_;
  ExecutionGenerations generations_;
  qint64 now_;
  QString preferredJob_;
  bool preview_ = false;
  QString error_;
  QHash<QString, QString> signatures_;
  QSet<QString> hashing_, deciding_, forced_;
  QHash<QString, Decision> decisions_;
};
// Session-owned authoritative execution history. Values are dropped on eviction,
// never truncated into a cache entry. Namespaces are isolated by workflow ID.
class ExecutionGenerationStore final {
public:
  void clear();
  void replacePersisted(const QString &workflowId, const ExecutionGenerations &generations);
  void submitted(const QString &jobId, const QJsonObject &fullSnapshot,
                 const QJsonArray &metadata, const QStringList &executed);
  void ingest(const QString &jobId, const QJsonObject &event, qint64 now);
  [[nodiscard]] ExecutionGenerations generations(const QString &workflowId) const;
private:
  struct Submission { QJsonObject snapshot; QJsonArray metadata; QSet<QString> executed; QHash<QString, int> indices; QHash<QString, qint64> activeAt; };
  QHash<QString, Submission> submissions_;
  QHash<QString, ExecutionGenerations> workflows_, persisted_;
  struct CacheKey { QString workflow; QString node; QString generation; };
  QList<CacheKey> order_;
  qsizetype bytes_ = 0;
};
}
