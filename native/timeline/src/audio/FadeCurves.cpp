#include "audio/FadeCurves.h"

#include <algorithm>
#include <cmath>
#include <numbers>

namespace nt::audio {

FadeShape parseFadeShape(const std::string& name) {
    if (name == "sCurve") return FadeShape::SCurve;
    if (name == "plus3dB") return FadeShape::Plus3dB;
    if (name == "minus3dB") return FadeShape::Minus3dB;
    return FadeShape::Linear;
}

double fadeShapeGain(FadeShape shape, double t) {
    const double x = (t <= 0.0 || std::isnan(t)) ? 0.0 : (t >= 1.0 ? 1.0 : t);
    switch (shape) {
        case FadeShape::SCurve:
            return (1.0 - std::cos(x * std::numbers::pi)) / 2.0;
        case FadeShape::Plus3dB:
            return std::sin((x * std::numbers::pi) / 2.0);
        case FadeShape::Minus3dB:
            return (2.0 / std::numbers::pi) * std::asin(x);
        case FadeShape::Linear:
            break;
    }
    return x;
}

ResolvedFades resolveClipFades(double fadeInMs, double fadeOutMs, FadeShape inShape, FadeShape outShape,
                               double durationMs) {
    const double span = std::max(0.0, durationMs);
    const auto cap = [span](double ms) { return std::min(span, std::max(0.0, std::isfinite(ms) ? ms : 0.0)); };
    ResolvedFades r;
    r.fadeInMs = cap(fadeInMs);
    r.fadeOutMs = cap(fadeOutMs);
    if (r.fadeInMs + r.fadeOutMs > span) {
        const double half = span / 2.0;
        r.fadeInMs = std::min(r.fadeInMs, half);
        r.fadeOutMs = std::min(r.fadeOutMs, half);
    }
    r.fadeInShape = inShape;
    r.fadeOutShape = outShape;
    return r;
}

double clipFadeGain(const ResolvedFades& fades, double durationMs, double msIntoClip) {
    if (msIntoClip < 0.0 || msIntoClip > durationMs) return 0.0;
    double gain = 1.0;
    if (fades.fadeInMs > 0.0 && msIntoClip < fades.fadeInMs) {
        gain = std::min(gain, fadeShapeGain(fades.fadeInShape, msIntoClip / fades.fadeInMs));
    }
    const double fadeOutStartMs = durationMs - fades.fadeOutMs;
    if (fades.fadeOutMs > 0.0 && msIntoClip > fadeOutStartMs) {
        gain = std::min(gain, fadeShapeGain(fades.fadeOutShape, (durationMs - msIntoClip) / fades.fadeOutMs));
    }
    return gain;
}

double dbToGain(double db) {
    return db == 0.0 ? 1.0 : std::pow(10.0, db / 20.0);
}

}  // namespace nt::audio
