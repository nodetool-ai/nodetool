#pragma once
#include <QJsonObject>

namespace nt::tracks {
QJsonObject addTrack(QJsonObject doc, const QJsonObject& payload);
QJsonObject insertTrack(QJsonObject doc, const QJsonObject& payload);
QJsonObject duplicateTrack(QJsonObject doc, const QJsonObject& payload);
QJsonObject removeTrack(QJsonObject doc, const QJsonObject& payload);
QJsonObject reorderTracks(QJsonObject doc, const QJsonObject& payload);
QJsonObject patchTrack(QJsonObject doc, const QJsonObject& payload, const QString& field);
}
