#pragma once
#include <QJsonObject>
#include <QJsonValue>
#include "model/TimelineTypes.h"
namespace nt::reframe {
bool isCropUsable(const QJsonObject& crop);
bool hasCrop(const QJsonObject& crop);
QJsonObject cropRectPx(const QJsonObject& crop, double width, double height);
QJsonObject cropAt(const nt::Clip& clip, double timeMs);
bool mediaTrackCanDriveReframe(const QJsonObject& track);
QJsonObject sampleReframeAt(const QJsonObject& reframe, double sourceMs, const QJsonObject& track = {});
QJsonValue resolveReframeCrop(const QJsonObject& reframe, double sourceMs, const QJsonObject& sourceSize,
                              const QJsonObject& targetSize, const QJsonObject& track = {});
bool isReframeStale(const QJsonObject& clip, const QJsonObject& track = {});
QJsonValue renderableReframe(const QJsonObject& clip, const QJsonObject& track = {});
}
