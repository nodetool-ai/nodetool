#include "wiring/SnapProviders.h"
#include <QDebug>
#include <QMap>
#include <cmath>

namespace {
QMap<QString, nt::wiring::SnapProvider>& providers() {
    static QMap<QString, nt::wiring::SnapProvider> value;
    return value;
}
}
bool nt::wiring::registerSnapProvider(QString id, SnapProvider provider) {
    if (id.isEmpty() || !provider || providers().contains(id)) {
        qWarning().noquote() << "Refused snap provider" << id;
        return false;
    }
    providers().insert(std::move(id), std::move(provider));
    return true;
}
std::vector<double> nt::wiring::extraSnapCandidates(const SnapRequest& request) {
    std::vector<double> result;
    for (const auto& provider : providers()) {
        for (const auto time : provider(request)) {
            if (std::isfinite(time) && time >= 0) { result.push_back(time); }
        }
    }
    return result;
}
