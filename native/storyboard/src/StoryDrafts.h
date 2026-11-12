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
// Write the shot editor's saved fields in one edit. A null value removes the field.
DraftResult applyShotDraft(const QJsonObject& board, const QString& shotId, const QJsonObject& patch);
// Swap a shot with its neighbour in the same scene. direction is -1 (earlier) or 1 (later).
DraftResult nudgeShot(const QJsonObject& board, const QString& shotId, int direction);
// Board edits as the web store makes them. Each re-stamps every shot's index in scene order.
DraftResult insertShot(const QJsonObject& board, const QString& afterShotId, const QString& newShotId);
DraftResult duplicateShot(const QJsonObject& board, const QString& shotId, const QString& newShotId);
DraftResult removeShot(const QJsonObject& board, const QString& shotId);
DraftResult moveShot(const QJsonObject& board, const QString& shotId, const QString& sceneId, int position);
// The board's name, brief, style, or aspect ratio.
DraftResult patchBoard(const QJsonObject& board, const QString& field, const QJsonValue& value);
// Remove one still ("image") or clip ("video") take. A removed current take passes to the take at its place.
DraftResult removeShotVersion(const QJsonObject& board, const QString& shotId, const QString& kind, int index);
}
