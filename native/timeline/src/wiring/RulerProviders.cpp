#include "wiring/RulerProviders.h"
#include "ui/TimelineFormat.h"
#include "ui/Timecode.h"
#include <QDebug>
#include <QMap>
#include <algorithm>
#include <cmath>
#include <limits>

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
std::vector<nt::wiring::RulerTick> timecodeTicks(const nt::wiring::RulerRequest& request) {
    std::vector<nt::wiring::RulerTick> result;
    if (!std::isfinite(request.msPerPx) || request.msPerPx <= 0 || !std::isfinite(request.fromMs) ||
        !std::isfinite(request.toMs) || request.toMs < request.fromMs || !std::isfinite(request.fps) || request.fps <= 0) {
        return result;
    }
    const long long base = nt::ui::timecodeBase(request.fps);
    std::vector<long long> intervals{1, 2, 5, 10};
    for (const long long seconds : {1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600}) {
        intervals.push_back(base * seconds);
    }
    std::ranges::sort(intervals);
    long long major = intervals.back();
    for (const auto candidate : intervals) {
        if (nt::ui::msAtFrame(candidate, request.fps) / request.msPerPx >= 90) {
            major = candidate;
            break;
        }
    }
    long long minor = 1;
    if (major % 5 == 0) {
        minor = major / 5;
    } else {
        for (long long divisor = 2; divisor <= major / divisor; ++divisor) {
            if (major % divisor == 0) {
                minor = major / divisor;
                break;
            }
        }
    }
    const bool dropFrame = request.document.value("dropFrame").toBool();
    long long frame = nt::ui::frameAtMs(request.fromMs, request.fps) / minor * minor;
    for (int i = 0; i < 10000; ++i) {
        const double time = nt::ui::msAtFrame(frame, request.fps);
        if (time > request.toMs) { break; }
        if (time >= request.fromMs) {
            const bool isMajor = frame % major == 0;
            result.push_back({time, isMajor, isMajor ? nt::ui::formatTimecodeFrame(frame, request.fps, dropFrame) : QString()});
        }
        if (frame > std::numeric_limits<long long>::max() - minor) { break; }
        frame += minor;
    }
    return result;
}
QMap<QString, nt::wiring::RulerProvider>& providers() {
    static QMap<QString, nt::wiring::RulerProvider> value{{QStringLiteral("time"), timeTicks},
        {QStringLiteral("timecode"), timecodeTicks}};
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
