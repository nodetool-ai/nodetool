#pragma once
#include <QJsonArray>
#include <QJsonObject>
#include <QString>

namespace nt::automation {
QString automationTargetKey(const QJsonObject& target);
double automationValueAt(const QJsonArray& points, double timeMs, double fallback = 0);
QJsonObject addAutomationPoint(const QJsonArray& points, const QJsonObject& point);
QJsonArray moveAutomationPoint(QJsonArray points, int index, double timeMs, double value);
QJsonArray removeAutomationPoints(const QJsonArray& points, const QJsonArray& indices);
QJsonArray setAutomationPointEasing(QJsonArray points, int index, const QString& easing);
QJsonArray automationPointsInRange(const QJsonArray& points, double fromMs, double toMs);
QJsonArray automationBreakpoints(const QJsonArray& points, double fromMs, const QJsonObject& options = {});
bool trackAcceptsAutomationTarget(const QJsonObject& track, const QJsonObject& target);
QJsonValue call(const QString& name, const QJsonArray& args);
QJsonObject edit(QJsonObject doc, const QString& name, const QJsonObject& payload);
void registerEdits();
void ensureRegistered();
}
