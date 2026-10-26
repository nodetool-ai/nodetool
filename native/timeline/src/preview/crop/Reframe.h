#pragma once
#include <QJsonObject>
#include <QJsonValue>
namespace nt::reframe {
bool isCropUsable(const QJsonObject& crop);
bool hasCrop(const QJsonObject& crop);
QJsonObject cropRectPx(const QJsonObject& crop, double width, double height);
double cropMax(const QJsonObject& crop, const QString& edge);
bool mediaTrackCanDriveReframe(const QJsonObject& track);
QJsonObject sampleReframeAt(const QJsonObject& reframe, double sourceMs, const QJsonObject& track = {});
QJsonValue resolveReframeCrop(const QJsonObject& reframe, double sourceMs, const QJsonObject& sourceSize,
                              const QJsonObject& targetSize, const QJsonObject& track = {});
QJsonObject addReframeKeyframe(QJsonObject reframe, const QJsonObject& keyframe);
QJsonObject clearReframe(QJsonObject clip);
bool isReframeStale(const QJsonObject& clip, const QJsonObject& track = {});
QJsonValue renderableReframe(const QJsonObject& clip, const QJsonObject& track = {});
QJsonObject sourcePointToReframeViewport(double x, double y, const QJsonObject& geometry);
QJsonObject reframeViewportPointToSource(double x, double y, const QJsonObject& geometry);
QJsonObject edit(QJsonObject document, const QString& action, const QJsonObject& payload);
QJsonValue evaluate(const QJsonObject& request);
} // namespace nt::reframe
