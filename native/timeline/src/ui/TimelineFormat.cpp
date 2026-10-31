#include "ui/TimelineFormat.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <cstring>

namespace nt::ui {

namespace {

QString pad2(long long n) {
    return n < 10 ? QStringLiteral("0%1").arg(n) : QString::number(n);
}

// JavaScript Math.round: halves round toward +infinity.
double jsRound(double x) {
    return std::floor(x + 0.5);
}

}  // namespace

QString jsToFixed(double value, int digits) {
    // toFixed rounds the exact decimal value of the double, and a true tie
    // goes to the larger value. printf rounds the exact value too, but sends a
    // tie to the even digit, so ties are found first. 30 decimals show any
    // non-zero digit after the tie for the magnitudes here (ulp > 1e-17).
    char exact[64];
    std::snprintf(exact, sizeof exact, "%.30f", std::abs(value));
    const char* dot = std::strchr(exact, '.');
    bool tie = dot && dot[1 + digits] == '5';
    for (const char* p = dot ? dot + 2 + digits : exact; tie && *p; ++p) {
        tie = *p == '0';
    }
    if (tie) {
        const double scale = std::pow(10.0, digits);
        const double up = std::copysign(std::ceil(std::abs(value) * scale) / scale, value);
        return QString::number(up, 'f', digits);
    }
    return QString::number(value, 'f', digits);
}

TickIntervals computeTickIntervals(double msPerPx) {
    const double minGapMs = MIN_LABEL_GAP_PX * msPerPx;
    static constexpr std::array<double, 13> candidates{100,    200,    500,    1'000,   2'000,   5'000,  10'000,
                                                       15'000, 30'000, 60'000, 120'000, 300'000, 600'000};
    double majorMs = candidates.back();
    for (const double c : candidates) {
        if (c >= minGapMs) {
            majorMs = c;
            break;
        }
    }
    return {majorMs, majorMs / 5.0};
}

QString formatRulerTimecode(double ms, double majorMs, double fps) {
    const double totalSec = ms / 1000.0;
    const double min = std::floor(totalSec / 60.0);
    const double sec = totalSec - min * 60.0;
    const QString minText = QString::number(static_cast<long long>(min));
    if (majorMs >= 1000.0) {
        return minText + QStringLiteral(":") + (sec < 10.0 ? QStringLiteral("0") : QString()) + jsToFixed(sec, 0);
    }
    if (fps > 0.0) {
        const long long fpsInt = std::max(1LL, static_cast<long long>(jsRound(fps)));
        const long long totalFrames = static_cast<long long>(jsRound((ms / 1000.0) * fps));
        const long long frame = totalFrames % fpsInt;
        const long long totalTcSec = totalFrames / fpsInt;
        return QString::number(totalTcSec / 60) + QStringLiteral(":") + pad2(totalTcSec % 60) + QStringLiteral(":") +
               pad2(frame);
    }
    const int decimals = majorMs >= 500.0 ? 1 : 2;
    return minText + QStringLiteral(":") + (sec < 10.0 ? QStringLiteral("0") : QString()) + jsToFixed(sec, decimals);
}

QString formatPlayheadTimecode(double ms, double fps) {
    const double actualFps = std::max(1.0, fps);
    const long long safeFps = std::max(1LL, static_cast<long long>(jsRound(fps)));
    const long long totalFrames = std::max(0LL, static_cast<long long>(jsRound((ms / 1000.0) * actualFps)));
    const long long ff = totalFrames % safeFps;
    const long long totalSec = totalFrames / safeFps;
    const long long ss = totalSec % 60;
    const long long mm = (totalSec / 60) % 60;
    const long long hh = totalSec / 3600;
    return pad2(hh) + QStringLiteral(":") + pad2(mm) + QStringLiteral(":") + pad2(ss) + QStringLiteral(":") + pad2(ff);
}

QString formatClipDuration(double durationMs) {
    if (durationMs < 60'000.0) {
        const double sec = durationMs / 1000.0;
        return sec < 10.0 ? jsToFixed(sec, 1) + QStringLiteral("s")
                          : QString::number(static_cast<long long>(jsRound(sec))) + QStringLiteral("s");
    }
    const long long totalSec = static_cast<long long>(jsRound(durationMs / 1000.0));
    return QString::number(totalSec / 60) + QStringLiteral(":") + pad2(totalSec % 60);
}

double pillShiftPx(double lineLeftPx, double pillWidthPx, double viewportWidthPx) {
    if (pillWidthPx <= 0.0 || viewportWidthPx <= 0.0) return 0.0;
    if (lineLeftPx < 0.0 || lineLeftPx > viewportWidthPx) return 0.0;
    const double half = pillWidthPx / 2.0;
    if (lineLeftPx < half) return half - lineLeftPx;
    if (lineLeftPx > viewportWidthPx - half) return viewportWidthPx - half - lineLeftPx;
    return 0.0;
}

}  // namespace nt::ui
