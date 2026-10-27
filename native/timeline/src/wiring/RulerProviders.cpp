#include "wiring/RulerProviders.h"
#include "ui/TimelineFormat.h"
#include <QDebug>
#include <QMap>
#include <cmath>

namespace {
std::vector<nt::wiring::RulerTick> timeTicks(const nt::wiring::RulerRequest& request) {
    std::vector<nt::wiring::RulerTick> result;
    if (!std::isfinite(request.msPerPx) || request.msPerPx <= 0 ||
        !std::isfinite(request.fromMs) || !std::isfinite(request.toMs) || request.toMs < request.fromMs) {
        return result;
    }
    const auto intervals = nt::ui::computeTickIntervals(request.msPerPx);
    const double first = std::floor(request.fromMs / intervals.minorMs) * intervals.minorMs;
    const auto majorRounded = std::llround(intervals.majorMs);
    for (double time = first; time <= request.toMs + intervals.minorMs; time += intervals.minorMs) {
        if (time < request.fromMs || time > request.toMs) { continue; }
        const bool major = std::llround(time) % majorRounded == 0;
        result.push_back({time, major, major ? nt::ui::formatRulerTimecode(time, intervals.majorMs, request.fps) : QString()});
    }
    return result;
}
QMap<QString, nt::wiring::RulerProvider>& providers() {
    static QMap<QString, nt::wiring::RulerProvider> value{{QStringLiteral("time"), timeTicks}};
    return value;
}
}
bool nt::wiring::registerRulerProvider(QString mode, RulerProvider provider) {
    if (mode.isEmpty() || !provider || providers().contains(mode)) {
        qWarning().noquote() << "Refused ruler provider" << mode;
        return false;
    }
    providers().insert(std::move(mode), std::move(provider));
    return true;
}
std::vector<nt::wiring::RulerTick> nt::wiring::rulerTicks(const QString& mode, const RulerRequest& request) {
    const auto provider = providers().constFind(mode);
    return provider == providers().cend() ? std::vector<RulerTick>{} : provider.value()(request);
}
