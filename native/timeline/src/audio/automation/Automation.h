#pragma once
#include "audio/automation/AutomationCurves.h"
#include <QJsonArray>
#include <QJsonObject>
#include <QString>

namespace nt::automation {
inline constexpr double MaxAutomationTimeMs = 1e12;
inline constexpr qsizetype MaxAutomationPointsPerLane = 10000;
inline constexpr qsizetype MaxAutomationLanesPerTrack = 256;
// Control/UI-thread pure document operations. Returned JSON owns its storage.
QString automationModeOf(const QJsonObject& track);
bool automationModePlays(const QString& mode);
QJsonArray thinAutomationSamples(const QJsonArray& samples, double tolerance);
QJsonArray writeAutomationPass(const QJsonArray& points, const QJsonObject& pass, double baseValue, double returnMs, double tolerance);
QString automationParamColorRole(int targetIndex, const QJsonObject& target);
QString automationTargetKey(const QJsonObject& target);
QJsonObject addAutomationPoint(const QJsonArray& points, const QJsonObject& point);
QJsonArray moveAutomationPoint(QJsonArray points, int index, double timeMs, double value);
QJsonArray removeAutomationPoints(const QJsonArray& points, const QJsonArray& indices);
QJsonArray setAutomationPointEasing(QJsonArray points, int index, const QString& easing);
QJsonArray automationPointsInRange(const QJsonArray& points, double fromMs, double toMs);
bool trackAcceptsAutomationTarget(const QJsonObject& track, const QJsonObject& target);
QJsonValue call(const QString& name, const QJsonArray& args);
QJsonObject edit(QJsonObject doc, const QString& name, const QJsonObject& payload);
QJsonObject trackEffectDefaults(const QString& type);
QJsonArray instrumentAutomationSpecs(const QJsonObject& instrument);
QJsonArray automationTargetRange(const QJsonObject& track, const QJsonObject& target);
void registerEdits();
}
