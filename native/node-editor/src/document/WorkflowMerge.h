#pragma once
#include <QJsonArray>
#include <QJsonObject>
#include <QList>
#include <QString>

namespace nodetool::node_editor {
// One remote value the local draft refused, as web/src/stores/documentMerge.ts
// reports it. kind is "node", "edge" or "document". reason is "edited",
// "deleted", "dangling" or "replaced". external is null for a remote delete.
struct GraphMergeConflict {
    QString kind;
    QString id;
    QString label;
    QString reason;
    QJsonValue external;
    QJsonValue local;
};

struct GraphMergeResult {
    QJsonObject graph;
    QList<GraphMergeConflict> conflicts;
};

// Three-way merge of persisted graphs, matching mergeWorkflowDocuments in
// web/src/stores/workflowMerge.ts. Nodes and edges merge by ID. A node's
// position, its data group and its remaining fields merge separately. Where
// both sides changed a slot the local draft wins, and the remote value is a
// conflict only when an op touched that unit. Empty ops mean a whole-document
// replacement: the local graph is kept with one "replaced" conflict.
// Unknown members survive from whichever side won their slot.
[[nodiscard]] GraphMergeResult mergeWorkflowGraphs(const QJsonObject& base, const QJsonObject& local,
                                                   const QJsonObject& remote, const QJsonArray& ops);

// Merges workflow snapshots. The graph merges as above. Other root members
// merge per key, with the local draft winning a contest. The result carries the
// remote revision (updated_at and etag).
[[nodiscard]] GraphMergeResult mergeWorkflowSnapshots(const QJsonObject& base, const QJsonObject& local,
                                                      const QJsonObject& remote, const QJsonArray& ops);
} // namespace nodetool::node_editor
