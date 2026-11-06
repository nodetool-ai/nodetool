#pragma once

#include <QJsonObject>
#include <QStringList>
#include <functional>
#include <vector>

namespace nt::wiring {
struct SnapRequest {
    QJsonObject document;
    double fromMs = 0;
    double toMs = 0;
    double msPerPx = 10;
    QString gridDivision;
    QString rulerMode = QStringLiteral("time");
    QStringList excludedClipIds;
};
using SnapProvider = std::function<std::vector<double>(const SnapRequest&)>;
bool registerSnapProvider(QString id, SnapProvider provider);
std::vector<double> extraSnapCandidates(const SnapRequest& request);
}
