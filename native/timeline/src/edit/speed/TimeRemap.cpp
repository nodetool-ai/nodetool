#include "TimeRemap.h"
#include "preview/layers/SceneHooks.h"
#include "scene/Animation.h"
#include <QJsonArray>
#include <algorithm>

namespace nt::speed {
namespace {
// The parser references this object file, so static-library linking retains
// the mapper in every consumer of TimelineJson, including export and tests.
const bool registered = [] { registerTimeRemapMapper(); return true; }();
}
void registerTimeRemapMapper() {
    static const auto token = registerSourceTimeMapper([](const Clip& clip, double timeMs) -> std::optional<double> {
        if (const auto source = clipRemapSourceMs(clip, timeMs)) { return std::max(0.0, *source); }
        return std::nullopt;
    });
    (void)token;
}
std::optional<ClipTimeRemap> parseTimeRemap(const QJsonValue& value) {
    if (!value.isObject()) { return std::nullopt; }
    ClipTimeRemap remap;
    const auto frames = value.toObject().value("keyframes").toArray();
    remap.keyframes.reserve(frames.size());
    for (const auto& value : frames) {
        const auto frame = value.toObject();
        remap.keyframes.push_back({frame.value("t").toDouble(), frame.value("sourceMs").toDouble(),
            frame.value("easing").toString().toStdString()});
    }
    return remap;
}
std::optional<double> evaluateTimeRemapMs(std::span<const TimeRemapKeyframe> frames, double t) {
    if (frames.empty()) { return std::nullopt; }
    if (t <= frames.front().t) { return frames.front().sourceMs; }
    if (t >= frames.back().t) { return frames.back().sourceMs; }
    for (std::size_t i = 1; i < frames.size(); ++i) {
        const auto& b = frames[i];
        if (t > b.t) { continue; }
        const auto& a = frames[i - 1];
        const double span = b.t - a.t;
        const double progress = span > 0 ? (t - a.t) / span : 0;
        return a.sourceMs + (b.sourceMs - a.sourceMs) * scene::ease(b.easing, progress);
    }
    return frames.back().sourceMs;
}
std::optional<double> clipRemapSourceMs(const Clip& clip, double timeMs) {
    if (!clip.timeRemap) { return std::nullopt; }
    return evaluateTimeRemapMs(clip.timeRemap->keyframes,
        clip.durationMs > 0 ? (timeMs - clip.startMs) / clip.durationMs : 0);
}
std::vector<TimeRemapAudioSegment> timeRemapAudioSegments(const Clip& clip) {
    if (!clip.timeRemap || clip.timeRemap->keyframes.empty() || clip.durationMs <= 0) {
        const double rate = clip.speedBaked ? 1 : std::max(0.0001, clip.speedMultiplier);
        return {{clip.startMs, clip.endMs(), clip.inPointMs, clip.inPointMs + clip.durationMs * rate, rate, rate <= 0}};
    }
    const auto& frames = clip.timeRemap->keyframes;
    std::vector<TimeRemapAudioSegment> segments;
    segments.reserve(2 + (frames.size() - 1) * 8);
    const auto push = [&](double t0, double t1) {
        if (t1 <= t0) { return; }
        const double start = clip.startMs + t0 * clip.durationMs;
        const double end = clip.startMs + t1 * clip.durationMs;
        const double sourceStart = evaluateTimeRemapMs(frames, t0).value_or(0);
        const double sourceEnd = evaluateTimeRemapMs(frames, t1).value_or(0);
        const double rate = (sourceEnd - sourceStart) / (end - start);
        segments.push_back({start, end, sourceStart, sourceEnd, rate, rate <= 0});
    };
    push(0, std::clamp(frames.front().t, 0.0, 1.0));
    for (std::size_t i = 1; i < frames.size(); ++i) {
        const double a = std::clamp(frames[i - 1].t, 0.0, 1.0);
        const double b = std::clamp(frames[i].t, 0.0, 1.0);
        if (b <= a) { continue; }
        const auto& easing = frames[i].easing;
        const int pieces = !easing.empty() && easing != "linear" ? 8 : 1;
        for (int j = 0; j < pieces; ++j) {
            push(a + (b - a) * j / pieces, a + (b - a) * (j + 1) / pieces);
        }
    }
    push(std::clamp(frames.back().t, 0.0, 1.0), 1);
    return segments;
}
} // namespace nt::speed
