#pragma once
#include <QJsonObject>
#include <optional>

namespace nt::assets {
QString assetMediaType(const QJsonObject& asset);
std::optional<QJsonObject> assetToClip(const QJsonObject& asset, const QString& trackId, double startMs);
}
