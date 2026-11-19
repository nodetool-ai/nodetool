#pragma once
#include "preview/crop/Reframe.h"

namespace nt::reframe {
double cropMax(const QJsonObject& crop, const QString& edge);
QJsonObject addReframeKeyframe(QJsonObject reframe, const QJsonObject& keyframe);
QJsonObject clearReframe(QJsonObject clip);
QJsonObject sourcePointToReframeViewport(double x, double y, const QJsonObject& geometry);
QJsonObject reframeViewportPointToSource(double x, double y, const QJsonObject& geometry);
QJsonObject edit(QJsonObject document, const QString& action, const QJsonObject& payload);
QJsonValue evaluate(const QJsonObject& request);
}
