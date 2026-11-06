#pragma once

#include "scene/Animation.h"

#include <QJsonArray>
#include <QJsonObject>
#include <algorithm>
#include <mutex>
#include <unordered_map>

namespace nt::motion {
inline QJsonArray resolveBeatAnimations(const QJsonArray& animations, double clipStartMs, const QJsonObject& tempo) {
    QJsonArray resolved;
    const double bpm = tempo.value(u"bpm").toDouble(120);
    const double tempoOffset = tempo.value(u"offsetMs").toDouble(0);
    for (const auto& value : animations) {
        auto animation = value.toObject();
        const auto beatValue = animation.value(u"beat");
        if (beatValue.isObject()) {
            const auto beat = beatValue.toObject();
            const double anchor = (beat.value(u"index").toDouble() - 1) * (60000.0 / std::max(1.0, bpm));
            const double sequenceOffset = beat.value(u"scope").toString() == u"clip" ? 0 : tempoOffset - clipStartMs;
            animation.insert(QStringLiteral("delayMs"), anchor + sequenceOffset + beat.value(u"offsetMs").toDouble(0) +
                             animation.value(u"delayMs").toDouble(0));
            resolved.append(animation);
        } else {
            resolved.append(value);
        }
    }
    return resolved;
}

inline std::shared_ptr<const std::vector<scene::AnimationDef>> resolvedBeatDefinitions(
    const std::shared_ptr<const std::vector<scene::AnimationDef>>& source, const QJsonArray& animations,
    double clipStartMs, const QJsonObject& tempo) {
    if (!source || std::none_of(source->begin(), source->end(), [](const auto& def) { return def.hasBeat; })) {
        return source;
    }
    struct Entry {
        std::weak_ptr<const std::vector<scene::AnimationDef>> source;
        double start, bpm, offset;
        std::shared_ptr<const std::vector<scene::AnimationDef>> resolved;
    };
    static std::mutex mutex;
    static std::unordered_multimap<const void*, Entry> cache;
    const double bpm = tempo.value(u"bpm").toDouble(120);
    const double offset = tempo.value(u"offsetMs").toDouble(0);
    std::lock_guard lock(mutex);
    const auto [first, last] = cache.equal_range(source.get());
    for (auto it = first; it != last; ++it) {
        const auto& entry = it->second;
        if (entry.source.lock() == source && entry.start == clipStartMs && entry.bpm == bpm && entry.offset == offset) {
            return entry.resolved;
        }
    }
    if (cache.size() >= 8192) {
        cache.clear();
    }
    auto resolved = std::make_shared<const std::vector<scene::AnimationDef>>(
        scene::parseAnimations(resolveBeatAnimations(animations, clipStartMs, tempo)));
    cache.emplace(source.get(), Entry{source, clipStartMs, bpm, offset, resolved});
    return resolved;
}
}
