#pragma once
#include "audio/automation/AutomationCurves.h"
#include <QJsonArray>
#include <QJsonObject>
#include <QString>

namespace nt::automation {
QString automationTargetKey(const QJsonObject& target);
QJsonObject addAutomationPoint(const QJsonArray& points, const QJsonObject& point);
QJsonArray moveAutomationPoint(QJsonArray points, int index, double timeMs, double value);
QJsonArray removeAutomationPoints(const QJsonArray& points, const QJsonArray& indices);
QJsonArray setAutomationPointEasing(QJsonArray points, int index, const QString& easing);
QJsonArray automationPointsInRange(const QJsonArray& points, double fromMs, double toMs);
bool trackAcceptsAutomationTarget(const QJsonObject& track, const QJsonObject& target);
QJsonValue call(const QString& name, const QJsonArray& args);
QJsonObject edit(QJsonObject doc, const QString& name, const QJsonObject& payload);
void registerEdits();
}
