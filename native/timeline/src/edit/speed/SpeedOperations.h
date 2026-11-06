#pragma once
#include <QJsonObject>

namespace nt::speed {
QJsonObject setClipSpeed(QJsonObject raw, const QJsonObject& payload);
QJsonObject setClipsSpeed(QJsonObject raw, const QJsonObject& payload);
QJsonObject retimeClipSpeed(QJsonObject raw, const QJsonObject& payload);
QJsonObject setClipTimeRemap(QJsonObject raw, const QJsonObject& payload);
} // namespace nt::speed
