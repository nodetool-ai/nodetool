#pragma once
#include <QJsonObject>

namespace nt::assets {
QJsonObject dropAsset(QJsonObject raw, const QJsonObject& payload);
double snapAssetDropMs(const QJsonArray& clips, const QString& trackId, double atMs, double snapMs);
}
