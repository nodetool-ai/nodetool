#pragma once

#include <QJsonObject>
#include <QString>
#include <functional>
#include <vector>

namespace nt::wiring {
struct RulerRequest {
    double msPerPx = 10;
    double fromMs = 0;
    double toMs = 0;
    double fps = 0;
    QString gridDivision;
    QJsonObject document;
};
struct RulerTick {
    double timeMs = 0;
    bool major = false;
    QString label;
};
using RulerProvider = std::function<std::vector<RulerTick>(const RulerRequest&)>;
bool registerRulerProvider(QString mode, RulerProvider provider);
std::vector<RulerTick> rulerTicks(const QString& mode, const RulerRequest& request);
}
