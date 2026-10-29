#pragma once
#include <QJsonObject>
#include <QJsonArray>
namespace nt::aiassist {
struct ShotPlacementResult { QJsonObject document; QJsonArray addedClips; QString clipId; QString error; };
ShotPlacementResult placeStoryboardShot(const QJsonObject& timeline, const QJsonObject& board, const QString& shotId,
                                       double startMs, const QString& trackId = {}, const QString& dropMode = "overlap");
}
