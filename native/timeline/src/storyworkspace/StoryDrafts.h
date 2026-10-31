#pragma once
#include <QJsonObject>
#include <QJsonValue>
#include <QString>

namespace nt::storyworkspace {
struct DraftResult {
    QJsonObject resource;
    QString error;
    [[nodiscard]] bool ok() const { return error.isEmpty(); }
};
// Change only supported authoring fields, keeping the response's CAS revision.
DraftResult patchShot(const QJsonObject& board, const QString& shotId, const QString& field, const QJsonValue& value);
DraftResult patchSpeaker(const QJsonObject& script, const QString& speakerId, const QString& field, const QJsonValue& value);
DraftResult patchEntity(const QJsonObject& asset, const QString& field, const QJsonValue& value);
DraftResult patchDocument(const QJsonObject& resource, const QString& field, const QJsonValue& value);
}
