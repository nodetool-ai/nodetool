#pragma once
#include <QJsonArray>
#include <QJsonObject>

namespace nt::automation {
double automationValueAt(const QJsonArray& points, double timeMs, double fallback = 0);
QJsonArray automationBreakpoints(const QJsonArray& points, double fromMs, const QJsonObject& options = {});
}
