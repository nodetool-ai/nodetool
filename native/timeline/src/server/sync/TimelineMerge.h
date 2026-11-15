#pragma once

#include <QJsonArray>
#include <QJsonObject>
#include <QList>
#include <QString>

#include <optional>

namespace nt::server::sync {

struct MergeConflict {
    QString kind;
    QString id;
    QString label;
    QString reason;
    QJsonValue external;
    QJsonValue draft;
    bool hasDraft = false;
};

struct MergeResult {
    QJsonObject doc;
    QJsonObject nextBase;
    QList<MergeConflict> conflicts;
};

// Project a raw sequence onto the web merge fields. Missing values stay absent,
// except camera2d/setup (null) and the fetched sequence's collection defaults.
QJsonObject mergeDocumentOf(const QJsonObject& rawSequence);
QJsonObject mergeDocumentOfSequence(const QJsonObject& serverSequence, const QJsonObject& base);

// Inputs are projected merge documents. With no ops, refuse the entire server
// copy unless mergeWithoutOps is true. Invalid camera2d writes throw
// std::invalid_argument, as the web schema parse rejects invalid values.
MergeResult mergeTimelineDocuments(const QJsonObject& base, const QJsonObject& draft,
                                   const QJsonObject& server,
                                   const std::optional<QJsonArray>& ops = std::nullopt,
                                   bool mergeWithoutOps = false);

// Preserve sequence-row and unknown fields, replacing every merge field.
// Absent fields are removed. Null setup is omitted, as in the web payload.
QJsonObject applyMergeDocument(const QJsonObject& serverRaw, const QJsonObject& merged);

// Rebase an undo checkpoint (a raw sequence) with the external delta from
// before (the draft) to after (the adopted document), as
// web/src/stores/documentMerge.ts rebaseDocumentSnapshots does: changed units
// are replaced, removed units dropped, adopted units inserted next to the same
// neighbours, and changed top-level values overwritten. A refused conflict has
// no delta, so it never leaks into undo or redo.
QJsonObject rebaseHistoryDocument(const QJsonObject& snapshot, const QJsonObject& before, const QJsonObject& after);

} // namespace nt::server::sync
