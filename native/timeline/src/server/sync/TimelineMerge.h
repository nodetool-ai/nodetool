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
// A merge field absent from merged is removed from the raw document.
QJsonObject applyMergeDocument(const QJsonObject& serverRaw, const QJsonObject& merged);

} // namespace nt::server::sync
