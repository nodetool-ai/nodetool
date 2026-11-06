#include "edit/keys/AudioCrossfade.h"

#include <QHash>

#include <algorithm>
#include <cmath>
#include <exception>
#include <limits>
#include <map>

namespace nt::edit {
namespace {
// Within this many ms two edges touch.
constexpr double TOUCH_MS = 1;

double tailHandleMs(const QJsonObject& clip, std::optional<double> sourceDurationMs) {
    if (isHoldRemap(clip) || !sourceDurationMs) return std::numeric_limits<double>::infinity();
    const double rate = sourceRate(clip);
    const double in = clip.value("inPointMs").toDouble(0);
    const double out = clip.contains("outPointMs") ? clip.value("outPointMs").toDouble() : in + clipDurationMs(clip) * rate;
    return std::max(0.0, (*sourceDurationMs - out) / rate);
}
bool touching(const QJsonObject& a, const QJsonObject& b) {
    return clipId(a) != clipId(b) && clipTrackId(a) == clipTrackId(b) && std::abs(clipEndMs(a) - clipStartMs(b)) <= TOUCH_MS;
}
}  // namespace

ClipList applyAudioCrossfades(const ClipList& clips, const IdSet& clipIds, double durationMs, const AudioCrossfadeOptions& options) {
    if (!(durationMs > 0)) return clips;
    QHash<QString, QJsonObject> next;
    const auto current = [&](const QJsonObject& c) { return next.value(clipId(c), c); };
    const auto fade = [&](const QJsonObject& c, const char* time, const char* shape, double ms) {
        auto faded = current(c);
        faded.insert(time, ms);
        faded.insert(shape, "plus3dB");
        next.insert(clipId(c), faded);
    };
    ClipList audio;
    for (const auto& c : clips) {
        if (c.value("mediaType").toString() == u"audio") audio.push_back(c);
    }
    // Each cut once, even when both of its clips are chosen.
    std::map<QString, std::pair<QJsonObject, QJsonObject>> cuts;
    for (const auto& clip : audio) {
        if (!clipIds.contains(clipId(clip))) continue;
        const double span = std::floor(std::min(durationMs, clipDurationMs(clip) / 2));
        const auto before = std::ranges::find_if(audio, [&](const auto& c) { return touching(c, clip); });
        const auto after = std::ranges::find_if(audio, [&](const auto& c) { return touching(clip, c); });
        if (before != audio.end()) cuts[clipId(*before) + '>' + clipId(clip)] = {*before, clip};
        else if (span > 0) fade(clip, "fadeInMs", "fadeInShape", span);
        if (after != audio.end()) cuts[clipId(clip) + '>' + clipId(*after)] = {clip, *after};
        else if (span > 0) fade(clip, "fadeOutMs", "fadeOutShape", span);
    }
    for (const auto& [key, cut] : cuts) {
        const auto a = current(cut.first);
        const auto b = current(cut.second);
        const double handleMs = !options.canExtend || options.canExtend(a)
            ? tailHandleMs(a, options.sourceDurationMs ? options.sourceDurationMs(a) : std::nullopt) : 0.0;
        const double overlapMs = std::floor(std::min({durationMs, handleMs, clipDurationMs(b) / 2}));
        if (overlapMs > 0) {
            QJsonObject extended;
            try {
                extended = trimClip(a, "end", overlapMs);
            } catch (const std::exception&) {
                continue;  // A remap curve cannot be trimmed.
            }
            extended.insert("fadeOutMs", overlapMs);
            extended.insert("fadeOutShape", "plus3dB");
            next.insert(clipId(a), extended);
            auto incoming = b;
            incoming.insert("fadeInMs", overlapMs);
            incoming.insert("fadeInShape", "plus3dB");
            next.insert(clipId(b), incoming);
            continue;
        }
        const double halfMs = std::floor(std::min({durationMs / 2, clipDurationMs(a) / 2, clipDurationMs(b) / 2}));
        if (halfMs <= 0) continue;
        fade(a, "fadeOutMs", "fadeOutShape", halfMs);
        fade(b, "fadeInMs", "fadeInShape", halfMs);
    }
    if (next.isEmpty()) return clips;
    ClipList out;
    out.reserve(clips.size());
    for (const auto& c : clips) out.push_back(next.value(clipId(c), c));
    return out;
}

}  // namespace nt::edit
