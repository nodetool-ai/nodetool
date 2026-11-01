#include "edit/ClipOps.h"
#include "scene/Animation.h"

#include <QJsonArray>
#include <QUuid>

#include <algorithm>
#include <cmath>
#include <limits>
#include <map>

namespace nt::edit {

namespace {

constexpr double SOURCE_BOUND_TOLERANCE_MS = 0.000001;

std::function<QString()>& idGenerator() {
    static std::function<QString()> generator;
    return generator;
}

bool present(const QJsonObject& c, const char* key) {
    const QJsonValue v = c.value(QLatin1String(key));
    return !v.isUndefined() && !v.isNull();
}

double numberOr(const QJsonObject& c, const char* key, double fallback) {
    const QJsonValue v = c.value(QLatin1String(key));
    return v.isDouble() ? v.toDouble() : fallback;
}

bool hasTimeRemap(const QJsonObject& c) {
    return c.value(u"timeRemap").toObject().value(u"keyframes").toArray().size() > 0;
}

void assertNotTimeRemapped(const QJsonObject& c, const char* op) {
    if (!hasTimeRemap(c)) return;
    throw OpError(std::string(op) +
                  " cannot edit a clip that carries a time remap — the curve is normalized over the clip's "
                  "window, so changing the window would retime every frame. Bake the remap into the media first "
                  "(`bake_time_remap`), or clear `timeRemap` to edit at the clip's rate.");
}

// animation/sourceCurves.ts, keyframes.ts
bool isSourceAnchoredAnimation(const QJsonObject& a) {
    const QJsonObject custom = a.value(u"custom").toObject();
    return a.value(u"preset").toString() == u"custom" && custom.value(u"timeBase").toString() == u"source" &&
           custom.value(u"curves").toArray().size() > 0;
}

bool isKeyframeAnimation(const QJsonObject& a) {
    return a.value(u"preset").toString() == u"custom" && a.value(u"role").toString() == u"emphasis" &&
           numberOr(a, "delayMs", 0.0) == 0.0 && a.value(u"params").toObject().value(u"keyframed").toBool(false);
}

constexpr double EPSILON_MS = 1e-6;
constexpr double T_EPSILON = 1e-4;

double valueAtSourceMs(const std::vector<QJsonObject>& keyframes, const std::vector<double>& times, double atMs) {
    if (atMs <= times.front()) {
        return keyframes.front().value(u"value").toDouble();
    }
    const size_t lastIndex = keyframes.size() - 1;
    if (atMs >= times[lastIndex]) {
        return keyframes[lastIndex].value(u"value").toDouble();
    }
    for (size_t i = 1; i <= lastIndex; ++i) {
        if (atMs > times[i]) {
            continue;
        }
        const double span = times[i] - times[i - 1];
        const double segT = span > 0 ? (atMs - times[i - 1]) / span : 0;
        const double eased =
            nt::scene::ease(keyframes[i].value(u"easing").toString(QStringLiteral("linear")).toStdString(), segT);
        const double previous = keyframes[i - 1].value(u"value").toDouble();
        return previous + (keyframes[i].value(u"value").toDouble() - previous) * eased;
    }
    return keyframes[lastIndex].value(u"value").toDouble();
}

QJsonValue easingCrossing(const std::vector<QJsonObject>& keyframes, const std::vector<double>& times, double atMs) {
    for (size_t i = 0; i < keyframes.size(); ++i) {
        if (times[i] >= atMs) {
            return keyframes[i].value(u"easing");
        }
    }
    return QJsonValue::Undefined;
}

QJsonArray withNormalizedT(const std::vector<QJsonObject>& keyframes) {
    const double firstMs = keyframes.front().value(u"sourceMs").toDouble();
    const double span = keyframes.back().value(u"sourceMs").toDouble() - firstMs;
    QJsonArray normalized;
    for (auto keyframe : keyframes) {
        keyframe.insert(QStringLiteral("t"), span > 0 ? (keyframe.value(u"sourceMs").toDouble() - firstMs) / span : 0);
        normalized.append(keyframe);
    }
    return normalized;
}

QJsonObject sliceCurve(const QJsonObject& curve, double fromMs, double toMs) {
    const QJsonArray rawKeyframes = curve.value(u"keyframes").toArray();
    if (rawKeyframes.isEmpty()) {
        return curve;
    }
    std::vector<QJsonObject> keyframes;
    std::vector<double> times;
    keyframes.reserve(rawKeyframes.size());
    times.reserve(rawKeyframes.size());
    for (const QJsonValue& value : rawKeyframes) {
        const QJsonObject keyframe = value.toObject();
        const QJsonValue ms = keyframe.value(u"sourceMs");
        if (!ms.isDouble() || !std::isfinite(ms.toDouble())) {
            return curve;
        }
        keyframes.push_back(keyframe);
        times.push_back(ms.toDouble());
    }

    std::vector<QJsonObject> kept;
    for (size_t i = 0; i < keyframes.size(); ++i) {
        if (times[i] >= fromMs - EPSILON_MS && times[i] <= toMs + EPSILON_MS) {
            QJsonObject keyframe = keyframes[i];
            keyframe.insert(QStringLiteral("sourceMs"), times[i]);
            kept.push_back(keyframe);
        }
    }

    std::vector<QJsonObject> sliced;
    if (kept.empty() || kept.front().value(u"sourceMs").toDouble() > fromMs + EPSILON_MS) {
        sliced.push_back({{QStringLiteral("t"), 0},
                          {QStringLiteral("value"), valueAtSourceMs(keyframes, times, fromMs)},
                          {QStringLiteral("sourceMs"), fromMs}});
    }
    sliced.insert(sliced.end(), kept.begin(), kept.end());
    if (kept.empty() || kept.back().value(u"sourceMs").toDouble() < toMs - EPSILON_MS) {
        QJsonObject boundary{{QStringLiteral("t"), 1},
                             {QStringLiteral("value"), valueAtSourceMs(keyframes, times, toMs)},
                             {QStringLiteral("sourceMs"), toMs}};
        const QJsonValue easing = easingCrossing(keyframes, times, toMs);
        if (!easing.isUndefined()) {
            boundary.insert(QStringLiteral("easing"), easing);
        }
        sliced.push_back(boundary);
    }

    QJsonObject next = curve;
    next.insert(QStringLiteral("keyframes"), withNormalizedT(sliced));
    return next;
}

QJsonObject sliceSourceAnimation(const QJsonObject& animation, double fromMs, double toMs, double clipDurationMs) {
    if (!present(animation, "custom")) {
        return animation;
    }
    QJsonObject custom = animation.value(u"custom").toObject();
    QJsonArray curves;
    for (const QJsonValue& curve : custom.value(u"curves").toArray()) {
        curves.append(sliceCurve(curve.toObject(), fromMs, toMs));
    }
    custom.insert(QStringLiteral("curves"), curves);
    QJsonObject next = animation;
    next.insert(QStringLiteral("delayMs"), 0);
    next.insert(QStringLiteral("custom"), custom);
    if (animation.value(u"role").toString() != u"loop") {
        next.insert(QStringLiteral("durationMs"), std::max(1.0, clipDurationMs));
    }
    return next;
}

QJsonArray resliceSourceAnimations(const QJsonArray& animations, double fromMs, double toMs, double clipDurationMs) {
    if (std::none_of(animations.begin(), animations.end(), [](const QJsonValue& animation) {
            return isSourceAnchoredAnimation(animation.toObject());
        })) {
        return animations;
    }
    QJsonArray next;
    for (const QJsonValue& value : animations) {
        const QJsonObject animation = value.toObject();
        next.append(isSourceAnchoredAnimation(animation)
                        ? sliceSourceAnimation(animation, fromMs, toMs, clipDurationMs)
                        : animation);
    }
    return next;
}

double curveValueAtT(const std::vector<QJsonObject>& keyframes, double t) {
    if (t <= keyframes.front().value(u"t").toDouble()) {
        return keyframes.front().value(u"value").toDouble();
    }
    const QJsonObject& last = keyframes.back();
    if (t >= last.value(u"t").toDouble()) {
        return last.value(u"value").toDouble();
    }
    for (size_t i = 1; i < keyframes.size(); ++i) {
        if (t > keyframes[i].value(u"t").toDouble()) {
            continue;
        }
        const QJsonObject& a = keyframes[i - 1];
        const QJsonObject& b = keyframes[i];
        const double span = b.value(u"t").toDouble() - a.value(u"t").toDouble();
        const double f =
            span > 0 ? nt::scene::ease(b.value(u"easing").toString(QStringLiteral("linear")).toStdString(),
                                      (t - a.value(u"t").toDouble()) / span)
                     : 1;
        const double aValue = a.value(u"value").toDouble();
        return aValue + (b.value(u"value").toDouble() - aValue) * f;
    }
    return last.value(u"value").toDouble();
}

QJsonObject sliceKeyframeAnimation(const QJsonObject& animation, double fromT, double toT, double durationMs) {
    const double span = toT - fromT;
    QJsonObject next = animation;
    next.insert(QStringLiteral("durationMs"), durationMs);
    if (!present(animation, "custom") || span <= 0) {
        return next;
    }
    QJsonObject custom = animation.value(u"custom").toObject();
    QJsonArray curves;
    for (const QJsonValue& value : custom.value(u"curves").toArray()) {
        QJsonObject curve = value.toObject();
        const QJsonArray keyframes = curve.value(u"keyframes").toArray();
        if (keyframes.isEmpty()) {
            curves.append(curve);
            continue;
        }
        std::vector<QJsonObject> sorted;
        sorted.reserve(keyframes.size());
        for (const QJsonValue& keyframe : keyframes) {
            sorted.push_back(keyframe.toObject());
        }
        std::stable_sort(sorted.begin(), sorted.end(), [](const QJsonObject& a, const QJsonObject& b) {
            return a.value(u"t").toDouble() < b.value(u"t").toDouble();
        });
        std::vector<QJsonObject> sliced{
            {{QStringLiteral("t"), fromT}, {QStringLiteral("value"), curveValueAtT(sorted, fromT)}}};
        for (const auto& keyframe : sorted) {
            const double t = keyframe.value(u"t").toDouble();
            if (t > fromT + T_EPSILON && t < toT - T_EPSILON) {
                sliced.push_back(keyframe);
            }
        }
        const auto tailSource = std::find_if(sorted.begin(), sorted.end(), [toT](const QJsonObject& keyframe) {
            return keyframe.value(u"t").toDouble() >= toT - T_EPSILON;
        });
        QJsonObject tail{{QStringLiteral("t"), toT}, {QStringLiteral("value"), curveValueAtT(sorted, toT)}};
        if (tailSource != sorted.end() && !tailSource->value(u"easing").isUndefined()) {
            tail.insert(QStringLiteral("easing"), tailSource->value(u"easing"));
        }
        sliced.push_back(tail);
        QJsonArray normalized;
        for (auto keyframe : sliced) {
            keyframe.insert(QStringLiteral("t"),
                            std::max(0.0, std::min(1.0, (keyframe.value(u"t").toDouble() - fromT) / span)));
            normalized.append(keyframe);
        }
        curve.insert(QStringLiteral("keyframes"), normalized);
        curves.append(curve);
    }
    custom.insert(QStringLiteral("curves"), curves);
    next.insert(QStringLiteral("custom"), custom);
    return next;
}

// The mediaTypes with no source clock (trimClip.ts NO_SOURCE_CLOCK).
bool noSourceClock(const QJsonObject& c) {
    const QString t = c.value(u"mediaType").toString();
    return t == u"image" || t == u"text" || t == u"shape" || t == u"adjustment" || t == u"group";
}

int indexOfId(const ClipList& clips, const QString& id) {
    for (size_t i = 0; i < clips.size(); ++i) {
        if (clipId(clips[i]) == id) return static_cast<int>(i);
    }
    return -1;
}

IdSet linkGroupIds(const ClipList& clips, const QJsonObject& clip, bool followLinks) {
    IdSet ids{clipId(clip)};
    const QString link = clipLinkId(clip);
    if (followLinks && !link.isEmpty()) {
        for (const auto& c : clips) {
            if (clipLinkId(c) == link) ids.insert(clipId(c));
        }
    }
    return ids;
}

bool isPinned(const QJsonObject& c, const IdSet& excludeIds, const RippleOptions& options) {
    return excludeIds.count(clipId(c)) || options.lockedTrackIds.count(clipTrackId(c)) ||
           options.lockedClipIds.count(clipId(c));
}

QJsonObject withStart(QJsonObject c, double startMs) {
    c.insert(QStringLiteral("startMs"), startMs);
    return c;
}

// The rebased right-half delay of a loop (splitClip.ts rebaseLoopDelayMs).
double rebaseLoopDelayMs(const QJsonObject& anim, double splitMs) {
    const double delayMs = numberOr(anim, "delayMs", 0.0);
    // The only `fullClip` preset (animation/presets.ts).
    if (anim.value(u"preset").toString() == u"kenBurns") return std::max(0.0, delayMs);
    return delayMs - splitMs;
}

struct SplitAnimationSource {
    double inPointMs;
    double cutPointMs;
    double outPointMs;
    double leftDurationMs;
    double rightDurationMs;
};

std::pair<QJsonArray, QJsonArray> splitAnimations(const QJsonArray& animations, double splitMs,
                                                 const SplitAnimationSource& source) {
    QJsonArray left;
    QJsonArray right;
    for (const QJsonValue& v : animations) {
        QJsonObject anim = v.toObject();
        const QString role = anim.value(u"role").toString();
        if (isSourceAnchoredAnimation(anim)) {
            left.append(sliceSourceAnimation(anim, source.inPointMs, source.cutPointMs, source.leftDurationMs));
            QJsonObject r = sliceSourceAnimation(anim, source.cutPointMs, source.outPointMs, source.rightDurationMs);
            r.insert(QStringLiteral("id"), newId());
            right.append(r);
        } else if (isKeyframeAnimation(anim)) {
            const double totalMs = source.leftDurationMs + source.rightDurationMs;
            const double cutT = totalMs > 0 ? splitMs / totalMs : 0;
            left.append(sliceKeyframeAnimation(anim, 0, cutT, source.leftDurationMs));
            QJsonObject r = sliceKeyframeAnimation(anim, cutT, 1, source.rightDurationMs);
            r.insert(QStringLiteral("id"), newId());
            right.append(r);
        } else if (role == u"in") {
            left.append(anim);
        } else if (role == u"out") {
            anim.insert(QStringLiteral("id"), newId());
            right.append(anim);
        } else if (role == u"emphasis") {
            const double delayMs = std::max(0.0, numberOr(anim, "delayMs", 0.0));
            if (delayMs < splitMs) {
                left.append(anim);
            } else {
                anim.insert(QStringLiteral("id"), newId());
                anim.insert(QStringLiteral("delayMs"), delayMs - splitMs);
                right.append(anim);
            }
        } else {
            left.append(anim);
            QJsonObject r = anim;
            r.insert(QStringLiteral("id"), newId());
            r.insert(QStringLiteral("delayMs"), rebaseLoopDelayMs(anim, splitMs));
            right.append(r);
        }
    }
    return {left, right};
}

std::pair<QJsonArray, QJsonArray> splitCaptionWords(const QJsonArray& words, double splitMs, double rightDurationMs) {
    QJsonArray left;
    QJsonArray right;
    for (const QJsonValue& v : words) {
        QJsonObject word = v.toObject();
        const double startMs = word.value(u"startMs").toDouble();
        const double endMs = word.value(u"endMs").toDouble();
        if (startMs < splitMs) {
            word.insert(QStringLiteral("endMs"), std::min(endMs, splitMs));
            left.append(word);
        } else {
            word.insert(QStringLiteral("startMs"), std::max(0.0, startMs - splitMs));
            word.insert(QStringLiteral("endMs"), std::min(endMs - splitMs, rightDurationMs));
            right.append(word);
        }
    }
    return {left, right};
}

struct Range {
    double startMs;
    double endMs;
};

std::vector<Range> mergeRanges(std::vector<Range> ranges) {
    std::stable_sort(ranges.begin(), ranges.end(), [](const Range& a, const Range& b) { return a.startMs < b.startMs; });
    std::vector<Range> out;
    for (const Range& r : ranges) {
        if (!out.empty() && r.startMs <= out.back().endMs) {
            out.back().endMs = std::max(out.back().endMs, r.endMs);
        } else {
            out.push_back(r);
        }
    }
    return out;
}

// dropResolve.ts movedWithDependants
IdSet movedWithDependants(const ClipList& clips, const IdSet& movedIds) {
    IdSet out = movedIds;
    IdSet linkIds;
    IdSet expanded;
    bool grew = true;
    while (grew) {
        grew = false;
        for (const auto& c : clips) {
            const QString id = clipId(c);
            if (!out.count(id) || expanded.count(id)) continue;
            expanded.insert(id);
            if (!clipLinkId(c).isEmpty()) linkIds.insert(clipLinkId(c));
            if (isGroupClip(c)) {
                for (const QString& d : groupDescendantIds(clips, id)) out.insert(d);
                grew = true;
            }
        }
        for (const auto& c : clips) {
            const QString link = clipLinkId(c);
            if (!link.isEmpty() && linkIds.count(link) && !out.count(clipId(c))) {
                out.insert(clipId(c));
                grew = true;
            }
        }
    }
    return out;
}

// dropResolve.ts clearWindow
std::vector<QJsonObject> clearWindow(const QJsonObject& c, double startMs, double endMs) {
    const double cStart = clipStartMs(c);
    const double cEnd = clipEndMs(c);
    if (cEnd <= startMs || cStart >= endMs) return {c};
    if (cStart >= startMs && cEnd <= endMs) return {};
    if (cStart < startMs && cEnd > endMs) {
        const auto [head, rest] = splitClip(c, startMs);
        const auto tail = splitClip(rest, endMs).second;
        return {head, tail};
    }
    if (cStart < startMs) return {trimClip(c, QStringLiteral("end"), startMs - cEnd)};
    return {trimClip(c, QStringLiteral("start"), -(endMs - cStart))};
}

}  // namespace

QString newId() {
    if (idGenerator()) return idGenerator()();
    return QUuid::createUuid().toString(QUuid::Id128);
}

void setIdGenerator(std::function<QString()> generator) {
    idGenerator() = std::move(generator);
}

QString clipId(const QJsonObject& c) {
    return c.value(u"id").toString();
}
QString clipTrackId(const QJsonObject& c) {
    return c.value(u"trackId").toString();
}
double clipStartMs(const QJsonObject& c) {
    return c.value(u"startMs").toDouble();
}
double clipDurationMs(const QJsonObject& c) {
    return c.value(u"durationMs").toDouble();
}
double clipEndMs(const QJsonObject& c) {
    return clipStartMs(c) + clipDurationMs(c);
}
QString clipLinkId(const QJsonObject& c) {
    const QJsonValue v = c.value(u"linkId");
    return v.isString() ? v.toString() : QString();
}
bool isGroupClip(const QJsonObject& c) {
    return c.value(u"mediaType").toString() == u"group";
}
double sourceRate(const QJsonObject& c) {
    if (c.value(u"speedBaked").toBool(false)) return 1.0;
    return std::max(0.0001, numberOr(c, "speedMultiplier", 1.0));
}

QJsonObject retimeCaption(const QJsonObject& caption, double offsetMs, double scale) {
    if (offsetMs == 0.0 && scale == 1.0) return caption;
    QJsonObject out = caption;
    QJsonArray words;
    for (const QJsonValue& v : caption.value(u"words").toArray()) {
        QJsonObject w = v.toObject();
        w.insert(QStringLiteral("startMs"), w.value(u"startMs").toDouble() * scale + offsetMs);
        w.insert(QStringLiteral("endMs"), w.value(u"endMs").toDouble() * scale + offsetMs);
        words.append(w);
    }
    out.insert(QStringLiteral("words"), words);
    return out;
}

QJsonObject trimClip(const QJsonObject& clip, const QString& edge, double deltaMs, std::optional<double> maxDurationMs) {
    assertNotTimeRemapped(clip, "trimClip");

    const double rate = sourceRate(clip);
    const double inPointMs = numberOr(clip, "inPointMs", 0.0);
    const double outPointMs = numberOr(clip, "outPointMs", inPointMs + clipDurationMs(clip) * rate);
    const bool start = edge == u"start";

    const double sourceDeltaMs = deltaMs * rate;
    const double nextStartMs = start ? clipStartMs(clip) - deltaMs : clipStartMs(clip);
    const double nextDurationMs = clipDurationMs(clip) + deltaMs;
    const double rawInPointMs = start ? inPointMs - sourceDeltaMs : inPointMs;
    const double headOverhangMs = rawInPointMs < 0 && noSourceClock(clip) ? -rawInPointMs : 0.0;
    const double nextInPointMs = rawInPointMs + headOverhangMs;
    const double calculatedOutPointMs = (start ? outPointMs : outPointMs + sourceDeltaMs) + headOverhangMs;
    const double nextOutPointMs = maxDurationMs && calculatedOutPointMs > *maxDurationMs &&
                                          calculatedOutPointMs - *maxDurationMs <= SOURCE_BOUND_TOLERANCE_MS
                                      ? *maxDurationMs
                                      : calculatedOutPointMs;

    if (nextDurationMs <= 0) throw OpError("trimClip would result in a non-positive duration");
    if (nextInPointMs < 0) throw OpError("trimClip cannot extend before source start");
    if (nextStartMs < 0) throw OpError("trimClip cannot start before zero on the timeline");
    if (maxDurationMs && sourceDeltaMs > 0 && nextOutPointMs > *maxDurationMs) {
        throw OpError("trimClip cannot extend beyond source out-point");
    }

    QJsonObject next = clip;
    next.insert(QStringLiteral("startMs"), nextStartMs);
    next.insert(QStringLiteral("durationMs"), nextDurationMs);
    next.insert(QStringLiteral("inPointMs"), nextInPointMs);
    next.insert(QStringLiteral("outPointMs"), nextOutPointMs);
    if (present(clip, "caption") && start) {
        next.insert(QStringLiteral("caption"),
                    retimeCaption(clip.value(u"caption").toObject(), clipStartMs(clip) - nextStartMs));
    }
    if (present(clip, "animations")) {
        next.insert(QStringLiteral("animations"),
                    resliceSourceAnimations(clip.value(u"animations").toArray(), nextInPointMs, nextOutPointMs,
                                            nextDurationMs));
    }
    return next;
}

std::pair<QJsonObject, QJsonObject> splitClip(const QJsonObject& clip, double atMs) {
    if (isGroupClip(clip)) {
        throw OpError("splitClip cannot split a group — split the clips inside it instead");
    }
    assertNotTimeRemapped(clip, "splitClip");

    const double startMs = clipStartMs(clip);
    const double endMs = clipEndMs(clip);
    if (atMs <= startMs || atMs >= endMs) {
        throw OpError("splitClip requires startMs < atMs < startMs + durationMs");
    }
    const double leftDurationMs = atMs - startMs;
    const double rightDurationMs = endMs - atMs;
    const double rate = sourceRate(clip);
    const double inPointMs = numberOr(clip, "inPointMs", 0.0);
    const double outPointMs = numberOr(clip, "outPointMs", inPointMs + clipDurationMs(clip) * rate);
    const double cutPointMs = inPointMs + leftDurationMs * rate;

    std::optional<std::pair<QJsonArray, QJsonArray>> captions;
    if (present(clip, "caption")) {
        captions = splitCaptionWords(clip.value(u"caption").toObject().value(u"words").toArray(), leftDurationMs,
                                     rightDurationMs);
    }
    std::optional<std::pair<QJsonArray, QJsonArray>> animations;
    if (present(clip, "animations")) {
        animations = splitAnimations(clip.value(u"animations").toArray(), leftDurationMs,
                                     {inPointMs, cutPointMs, outPointMs, leftDurationMs, rightDurationMs});
    }

    QJsonObject left = clip;
    left.insert(QStringLiteral("id"), newId());
    left.insert(QStringLiteral("durationMs"), leftDurationMs);
    left.insert(QStringLiteral("inPointMs"), inPointMs);
    left.insert(QStringLiteral("outPointMs"), cutPointMs);
    left.remove(QStringLiteral("fadeOutMs"));
    left.remove(QStringLiteral("fadeOutShape"));
    if (captions) {
        QJsonObject caption = clip.value(u"caption").toObject();
        caption.insert(QStringLiteral("words"), captions->first);
        left.insert(QStringLiteral("caption"), caption);
    }
    if (animations) left.insert(QStringLiteral("animations"), animations->first);

    QJsonObject right = clip;
    right.insert(QStringLiteral("id"), newId());
    right.insert(QStringLiteral("startMs"), atMs);
    right.insert(QStringLiteral("durationMs"), rightDurationMs);
    right.insert(QStringLiteral("inPointMs"), cutPointMs);
    right.insert(QStringLiteral("outPointMs"), outPointMs);
    right.remove(QStringLiteral("fadeInMs"));
    right.remove(QStringLiteral("fadeInShape"));
    right.remove(QStringLiteral("transitionIn"));
    if (captions) {
        QJsonObject caption = clip.value(u"caption").toObject();
        caption.insert(QStringLiteral("words"), captions->second);
        right.insert(QStringLiteral("caption"), caption);
    }
    if (animations) right.insert(QStringLiteral("animations"), animations->second);
    return {left, right};
}

std::optional<ClipList> planShift(const ClipList& clips, double fromMs, double deltaMs, const IdSet& excludeIds,
                                  const RippleOptions& options) {
    if (deltaMs == 0) return clips;
    IdSet moving;
    IdSet movingLinks;
    for (const auto& c : clips) {
        if (isPinned(c, excludeIds, options) || clipStartMs(c) < fromMs) continue;
        moving.insert(clipId(c));
        if (!clipLinkId(c).isEmpty()) movingLinks.insert(clipLinkId(c));
    }
    for (const auto& c : clips) {
        const QString link = clipLinkId(c);
        if (link.isEmpty() || !movingLinks.count(link) || excludeIds.count(clipId(c))) continue;
        if (isPinned(c, excludeIds, options)) return std::nullopt;
        moving.insert(clipId(c));
    }
    if (deltaMs < 0) {
        const double landingMs = fromMs + deltaMs;
        std::set<QString> frozenTracks;
        for (const auto& c : clips) {
            if (!moving.count(clipId(c)) && clipStartMs(c) < fromMs && clipEndMs(c) > landingMs) {
                frozenTracks.insert(clipTrackId(c));
            }
        }
        for (const auto& c : clips) {
            if (!moving.count(clipId(c)) || !frozenTracks.count(clipTrackId(c))) continue;
            if (!clipLinkId(c).isEmpty() && movingLinks.count(clipLinkId(c))) return std::nullopt;
            moving.erase(clipId(c));
        }
    }
    ClipList out;
    out.reserve(clips.size());
    for (const auto& c : clips) {
        if (!moving.count(clipId(c))) {
            out.push_back(c);
            continue;
        }
        const double startMs = clipStartMs(c) + deltaMs;
        if (startMs < 0 && !clipLinkId(c).isEmpty()) return std::nullopt;
        out.push_back(withStart(c, std::max(0.0, startMs)));
    }
    return out;
}

ClipList shiftClipsFrom(const ClipList& clips, double fromMs, double deltaMs, const IdSet& excludeIds,
                        const RippleOptions& options) {
    if (auto planned = planShift(clips, fromMs, deltaMs, excludeIds, options)) return *planned;
    ClipList out;
    for (const auto& c : clips) {
        if (isPinned(c, excludeIds, options) || clipStartMs(c) < fromMs) {
            out.push_back(c);
        } else {
            out.push_back(withStart(c, std::max(0.0, clipStartMs(c) + deltaMs)));
        }
    }
    return out;
}

ClipList rippleTrim(const ClipList& clips, const QString& id, const QString& edge, double deltaMs,
                    const RippleOptions& options, std::optional<double> maxSourceDurationMs) {
    const int index = indexOfId(clips, id);
    if (index < 0) throw OpError(("rippleTrim: clip " + id + " not found").toStdString());
    const QJsonObject clip = clips[static_cast<size_t>(index)];
    const IdSet group = linkGroupIds(clips, clip, options.followLinks);
    const double oldEndMs = clipEndMs(clip);

    std::map<QString, QJsonObject> trimmed;
    for (const auto& c : clips) {
        if (!group.count(clipId(c))) continue;
        QJsonObject next = trimClip(c, edge, deltaMs, clipId(c) == id ? maxSourceDurationMs : std::nullopt);
        if (edge == u"start") next.insert(QStringLiteral("startMs"), clipStartMs(c));
        trimmed[clipId(c)] = next;
    }
    const double applied = clipDurationMs(trimmed[id]) - clipDurationMs(clip);
    ClipList withTrim;
    for (const auto& c : clips) {
        auto it = trimmed.find(clipId(c));
        withTrim.push_back(it != trimmed.end() ? it->second : c);
    }
    auto out = planShift(withTrim, oldEndMs, applied, group, options);
    if (!out) throw OpError("rippleTrim: the ripple would separate linked clips");
    return *out;
}

int findRollNeighbour(const ClipList& clips, const QJsonObject& clip, const QString& edge) {
    const bool end = edge == u"end";
    const double cutMs = end ? clipEndMs(clip) : clipStartMs(clip);
    for (size_t i = 0; i < clips.size(); ++i) {
        const auto& c = clips[i];
        if (clipId(c) != clipId(clip) && clipTrackId(c) == clipTrackId(clip) &&
            std::abs((end ? clipStartMs(c) : clipEndMs(c)) - cutMs) <= 1) {
            return static_cast<int>(i);
        }
    }
    return -1;
}

ClipList rollEdit(const ClipList& clips, const QString& id, const QString& edge, double deltaMs, bool followLinks) {
    const int index = indexOfId(clips, id);
    if (index < 0) throw OpError(("rollEdit: clip " + id + " not found").toStdString());
    const QJsonObject clip = clips[static_cast<size_t>(index)];
    const int n = findRollNeighbour(clips, clip, edge);
    if (n < 0) throw OpError("rollEdit: no clip on the other side of the cut");
    const QJsonObject neighbour = clips[static_cast<size_t>(n)];
    const QJsonObject& left = edge == u"end" ? clip : neighbour;
    const QJsonObject& right = edge == u"end" ? neighbour : clip;
    const IdSet leftIds = linkGroupIds(clips, left, followLinks);
    const IdSet rightIds = linkGroupIds(clips, right, followLinks);
    std::map<QString, QJsonObject> next;
    for (const auto& c : clips) {
        if (leftIds.count(clipId(c))) {
            next[clipId(c)] = trimClip(c, QStringLiteral("end"), deltaMs);
        } else if (rightIds.count(clipId(c))) {
            next[clipId(c)] = trimClip(c, QStringLiteral("start"), -deltaMs);
        }
    }
    ClipList out;
    for (const auto& c : clips) {
        auto it = next.find(clipId(c));
        out.push_back(it != next.end() ? it->second : c);
    }
    return out;
}

ClipList rippleDelete(const ClipList& clips, const IdSet& ids, const RippleOptions& options) {
    std::vector<Range> ranges;
    ClipList next;
    for (const auto& c : clips) {
        if (ids.count(clipId(c))) {
            ranges.push_back({clipStartMs(c), clipEndMs(c)});
        } else {
            next.push_back(c);
        }
    }
    if (ranges.empty()) return clips;
    std::vector<Range> spans = mergeRanges(ranges);
    std::reverse(spans.begin(), spans.end());
    const ClipList remaining = next;
    for (const Range& span : spans) {
        auto shifted = planShift(next, span.endMs, span.startMs - span.endMs, {}, options);
        if (!shifted) return remaining;
        next = *shifted;
    }
    return next;
}

std::optional<Gap> findGap(const ClipList& clips, const QString& trackId, double atMs) {
    double prevEnd = 0;
    double nextStart = std::numeric_limits<double>::infinity();
    for (const auto& c : clips) {
        if (clipTrackId(c) != trackId) continue;
        const double end = clipEndMs(c);
        if (clipStartMs(c) <= atMs && end > atMs) return std::nullopt;
        if (end <= atMs) {
            prevEnd = std::max(prevEnd, end);
        } else {
            nextStart = std::min(nextStart, clipStartMs(c));
        }
    }
    if (std::isinf(nextStart) || nextStart <= prevEnd) return std::nullopt;
    return Gap{prevEnd, nextStart};
}

ClipList closeGap(const ClipList& clips, const QString& trackId, double atMs, const RippleOptions& options) {
    const auto gap = findGap(clips, trackId, atMs);
    if (!gap) return clips;
    auto shifted = planShift(clips, gap->endMs, gap->startMs - gap->endMs, {}, options);
    return shifted ? *shifted : clips;
}

IdSet groupDescendantIds(const ClipList& clips, const QString& groupId) {
    std::map<QString, std::vector<QString>> childrenByParent;
    for (const auto& c : clips) {
        const QString parent = c.value(u"parentId").toString();
        if (parent.isEmpty()) continue;
        childrenByParent[parent].push_back(clipId(c));
    }
    IdSet found;
    std::vector<QString> queue{groupId};
    while (!queue.empty()) {
        const QString id = queue.back();
        queue.pop_back();
        auto it = childrenByParent.find(id);
        if (it == childrenByParent.end()) continue;
        for (const QString& child : it->second) {
            if (found.count(child)) continue;
            found.insert(child);
            queue.push_back(child);
        }
    }
    return found;
}

ClipList resolveOverwrite(const ClipList& clips, const IdSet& movedIds, const RippleOptions& options) {
    const IdSet movingIds = movedWithDependants(clips, movedIds);
    ClipList movers;
    for (const auto& c : clips) {
        if (movingIds.count(clipId(c))) movers.push_back(c);
    }
    if (movers.empty()) return clips;
    const auto editable = [&](const QJsonObject& c) {
        return !movingIds.count(clipId(c)) && !isGroupClip(c) && !options.lockedTrackIds.count(clipTrackId(c)) &&
               !options.lockedClipIds.count(clipId(c));
    };

    ClipList next = clips;
    for (const auto& m : movers) {
        const double mStart = clipStartMs(m);
        const double mEnd = clipEndMs(m);
        ClipList victims;
        for (const auto& c : next) {
            if (clipTrackId(c) == clipTrackId(m) && editable(c) && clipEndMs(c) > mStart && clipStartMs(c) < mEnd) {
                victims.push_back(c);
            }
        }
        if (victims.empty()) continue;

        // Each victim with its linked partners, cut as one unit (in order).
        std::vector<std::pair<QString, ClipList>> units;
        for (const auto& v : victims) {
            const QString link = clipLinkId(v);
            const QString key = link.isEmpty() ? QStringLiteral("clip:") + clipId(v) : link;
            if (std::any_of(units.begin(), units.end(), [&](const auto& u) { return u.first == key; })) continue;
            ClipList unit;
            if (link.isEmpty()) {
                unit.push_back(v);
            } else {
                for (const auto& c : next) {
                    if (clipLinkId(c) == link && editable(c)) unit.push_back(c);
                }
            }
            units.emplace_back(key, unit);
        }

        std::map<QString, std::vector<QJsonObject>> replaced;
        for (const auto& [key, unit] : units) {
            std::vector<std::vector<QJsonObject>> pieces;
            try {
                for (const auto& c : unit) pieces.push_back(clearWindow(c, mStart, mEnd));
            } catch (const OpError&) {
                continue;
            }
            const QString link = clipLinkId(unit.front());
            const bool cut = std::any_of(pieces.begin(), pieces.end(), [](const auto& p) { return p.size() == 2; });
            if (!link.isEmpty() && cut) {
                const QString headLinkId = newId();
                const QString tailLinkId = newId();
                for (auto& p : pieces) {
                    for (auto& piece : p) {
                        piece.insert(QStringLiteral("linkId"), clipEndMs(piece) <= mStart ? headLinkId : tailLinkId);
                    }
                }
            }
            for (size_t i = 0; i < unit.size(); ++i) replaced[clipId(unit[i])] = pieces[i];
        }
        ClipList flat;
        for (const auto& c : next) {
            auto it = replaced.find(clipId(c));
            if (it == replaced.end()) {
                flat.push_back(c);
            } else {
                for (const auto& piece : it->second) flat.push_back(piece);
            }
        }
        next = flat;
    }
    return next;
}

ClipList resolveInsert(const ClipList& clips, const IdSet& movedIds, const RippleOptions& options) {
    const IdSet movingIds = movedWithDependants(clips, movedIds);
    ClipList movers;
    for (const auto& c : clips) {
        if (movingIds.count(clipId(c))) movers.push_back(c);
    }
    if (movers.empty()) return clips;
    double insertMs = std::numeric_limits<double>::infinity();
    double maxEnd = -std::numeric_limits<double>::infinity();
    std::set<QString> moverTracks;
    for (const auto& m : movers) {
        insertMs = std::min(insertMs, clipStartMs(m));
        maxEnd = std::max(maxEnd, clipEndMs(m));
        moverTracks.insert(clipTrackId(m));
    }
    const double spanMs = maxEnd - insertMs;
    const auto straddles = [&](const QJsonObject& c) {
        return !movingIds.count(clipId(c)) && clipStartMs(c) < insertMs && clipEndMs(c) > insertMs;
    };
    const auto locked = [&](const QJsonObject& c) {
        return options.lockedTrackIds.count(clipTrackId(c)) || options.lockedClipIds.count(clipId(c));
    };

    IdSet cutLinkIds;
    IdSet toCut;
    for (const auto& c : clips) {
        if (moverTracks.count(clipTrackId(c)) && straddles(c)) {
            toCut.insert(clipId(c));
            if (!clipLinkId(c).isEmpty()) cutLinkIds.insert(clipLinkId(c));
        }
    }
    for (const auto& c : clips) {
        if (!clipLinkId(c).isEmpty() && cutLinkIds.count(clipLinkId(c)) && straddles(c)) toCut.insert(clipId(c));
    }

    std::vector<std::pair<QString, ClipList>> units;
    for (const auto& c : clips) {
        if (!toCut.count(clipId(c))) continue;
        const QString key = clipLinkId(c).isEmpty() ? QStringLiteral("clip:") + clipId(c) : clipLinkId(c);
        auto it = std::find_if(units.begin(), units.end(), [&](const auto& u) { return u.first == key; });
        if (it != units.end()) {
            it->second.push_back(c);
        } else {
            units.emplace_back(key, ClipList{c});
        }
    }
    std::map<QString, std::pair<QJsonObject, QJsonObject>> halves;
    for (const auto& [key, unit] : units) {
        if (std::any_of(unit.begin(), unit.end(), locked)) continue;
        std::vector<std::pair<QJsonObject, QJsonObject>> split;
        try {
            for (const auto& c : unit) split.push_back(splitClip(c, insertMs));
        } catch (const OpError&) {
            continue;
        }
        if (!clipLinkId(unit.front()).isEmpty()) {
            const QString leftLinkId = newId();
            const QString rightLinkId = newId();
            for (auto& [l, r] : split) {
                l.insert(QStringLiteral("linkId"), leftLinkId);
                r.insert(QStringLiteral("linkId"), rightLinkId);
            }
        }
        for (size_t i = 0; i < unit.size(); ++i) halves[clipId(unit[i])] = split[i];
    }
    ClipList cut;
    for (const auto& c : clips) {
        auto it = halves.find(clipId(c));
        if (it == halves.end()) {
            cut.push_back(c);
        } else {
            cut.push_back(it->second.first);
            cut.push_back(it->second.second);
        }
    }
    auto shifted = planShift(cut, insertMs, spanMs, movingIds, options);
    return shifted ? *shifted : clips;
}

ClipList resolveDrop(const ClipList& clips, const IdSet& movedIds, const QString& mode, const RippleOptions& options) {
    if (mode == u"overwrite") return resolveOverwrite(clips, movedIds, options);
    if (mode == u"insert") return resolveInsert(clips, movedIds, options);
    return clips;
}

ClipList rateStretchClips(const ClipList& clips, const IdSet& memberIds, const QString& primaryId, const QString& edge,
                          double durationMs) {
    const QJsonObject* primary = nullptr;
    for (const auto& c : clips) {
        if (clipId(c) == primaryId) primary = &c;
    }
    ClipList members;
    for (const auto& c : clips) {
        if (memberIds.count(clipId(c))) members.push_back(c);
    }
    if (!primary || !memberIds.count(primaryId) || !std::isfinite(durationMs) || durationMs <= 0 ||
        std::any_of(members.begin(), members.end(), [](const QJsonObject& m) { return isGroupClip(m) || hasTimeRemap(m); })) {
        return clips;
    }
    const bool end = edge == u"end";
    double maxRatio = std::numeric_limits<double>::infinity();
    for (const auto& m : members) {
        const double mEnd = clipEndMs(m);
        double roomMs = end ? std::numeric_limits<double>::infinity() : mEnd;
        for (const auto& c : clips) {
            if (clipTrackId(c) != clipTrackId(m) || memberIds.count(clipId(c))) continue;
            if (end && clipStartMs(c) >= mEnd) {
                roomMs = std::min(roomMs, clipStartMs(c) - clipStartMs(m));
            } else if (!end && clipEndMs(c) <= clipStartMs(m)) {
                roomMs = std::min(roomMs, mEnd - clipEndMs(c));
            }
        }
        maxRatio = std::min(maxRatio, std::max(1.0, roomMs / clipDurationMs(m)));
    }
    const double speed = numberOr(*primary, "speedMultiplier", 1.0);
    const double minRatio = speed / RATE_STRETCH_MAX_SPEED;
    const double ratioCap = std::min(maxRatio, speed / RATE_STRETCH_MIN_SPEED);
    const double ratio = std::min(ratioCap, std::max(minRatio, durationMs / clipDurationMs(*primary)));
    if (std::abs(ratio - 1) < 1e-9) return clips;
    std::map<QString, QJsonObject> next;
    for (const auto& m : members) {
        const double speedMultiplier = numberOr(m, "speedMultiplier", 1.0) / ratio;
        QJsonObject probe = m;
        probe.insert(QStringLiteral("speedMultiplier"), speedMultiplier);
        const double newRate = sourceRate(probe);
        const double nextDurationMs = std::max(1.0, clipDurationMs(m) * ratio);
        QJsonObject retimed = m;
        retimed.insert(QStringLiteral("speedMultiplier"), speedMultiplier);
        retimed.insert(QStringLiteral("durationMs"), nextDurationMs);
        retimed.insert(QStringLiteral("startMs"), end ? clipStartMs(m) : clipEndMs(m) - nextDurationMs);
        if (present(m, "caption")) {
            retimed.insert(QStringLiteral("caption"),
                           retimeCaption(m.value(u"caption").toObject(), 0, sourceRate(m) / newRate));
        }
        next[clipId(m)] = retimed;
    }
    ClipList out;
    for (const auto& c : clips) {
        auto it = next.find(clipId(c));
        out.push_back(it != next.end() ? it->second : c);
    }
    return out;
}

namespace {

constexpr double TOUCH_MS = 1;
constexpr double MIN_NEIGHBOUR_MS = 1;

struct SlidePlan {
    std::optional<QJsonObject> before;
    std::optional<QJsonObject> after;
    double minDeltaMs = -std::numeric_limits<double>::infinity();
    double maxDeltaMs = std::numeric_limits<double>::infinity();
};

double outPointOf(const QJsonObject& c) {
    const double in = numberOr(c, "inPointMs", 0.0);
    return numberOr(c, "outPointMs", in + clipDurationMs(c) * sourceRate(c));
}

SlidePlan planMember(const ClipList& clips, const QJsonObject& member, const SourceDurationFor& sourceDurationMsFor) {
    ClipList others;
    for (const auto& c : clips) {
        if (clipTrackId(c) == clipTrackId(member) && clipId(c) != clipId(member) && !isGroupClip(c)) others.push_back(c);
    }
    SlidePlan p;
    for (const auto& c : others) {
        if (!p.before && std::abs(clipEndMs(c) - clipStartMs(member)) <= TOUCH_MS) p.before = c;
    }
    for (const auto& c : others) {
        if (!p.after && std::abs(clipStartMs(c) - clipEndMs(member)) <= TOUCH_MS) p.after = c;
    }
    if (p.before) {
        p.minDeltaMs = std::max(p.minDeltaMs, MIN_NEIGHBOUR_MS - clipDurationMs(*p.before));
        const auto sourceMs = sourceDurationMsFor ? sourceDurationMsFor(*p.before) : std::nullopt;
        if (sourceMs) {
            p.maxDeltaMs = std::min(p.maxDeltaMs, (*sourceMs - outPointOf(*p.before)) / sourceRate(*p.before));
        }
    } else {
        double gapStartMs = 0;
        for (const auto& c : others) {
            if (clipEndMs(c) <= clipStartMs(member) + TOUCH_MS) gapStartMs = std::max(gapStartMs, clipEndMs(c));
        }
        p.minDeltaMs = std::max(p.minDeltaMs, gapStartMs - clipStartMs(member));
    }
    if (p.after) {
        p.maxDeltaMs = std::min(p.maxDeltaMs, clipDurationMs(*p.after) - MIN_NEIGHBOUR_MS);
        p.minDeltaMs = std::max(p.minDeltaMs, -(numberOr(*p.after, "inPointMs", 0.0) / sourceRate(*p.after)));
    } else {
        double gapEndMs = std::numeric_limits<double>::infinity();
        for (const auto& c : others) {
            if (clipStartMs(c) >= clipEndMs(member) - TOUCH_MS) gapEndMs = std::min(gapEndMs, clipStartMs(c));
        }
        p.maxDeltaMs = std::min(p.maxDeltaMs, gapEndMs - clipEndMs(member));
    }
    return p;
}

}  // namespace

double slideDeltaLimit(const ClipList& clips, const IdSet& memberIds, double deltaMs,
                       const SourceDurationFor& sourceDurationMsFor) {
    ClipList members;
    for (const auto& c : clips) {
        if (memberIds.count(clipId(c))) members.push_back(c);
    }
    if (members.empty()) return 0;
    std::vector<SlidePlan> plans;
    for (const auto& m : members) plans.push_back(planMember(clips, m, sourceDurationMsFor));
    for (const auto& m : members) {
        if (isGroupClip(m) || hasTimeRemap(m)) return 0;
    }
    for (const auto& p : plans) {
        if ((p.before && hasTimeRemap(*p.before)) || (p.after && hasTimeRemap(*p.after))) return 0;
    }
    double minDeltaMs = -std::numeric_limits<double>::infinity();
    double maxDeltaMs = std::numeric_limits<double>::infinity();
    for (const auto& p : plans) {
        minDeltaMs = std::max(minDeltaMs, p.minDeltaMs);
        maxDeltaMs = std::min(maxDeltaMs, p.maxDeltaMs);
    }
    if (minDeltaMs > maxDeltaMs) return 0;
    return std::min(maxDeltaMs, std::max(minDeltaMs, deltaMs));
}

ClipList slideClips(const ClipList& clips, const IdSet& memberIds, double deltaMs,
                    const SourceDurationFor& sourceDurationMsFor) {
    const double delta = slideDeltaLimit(clips, memberIds, deltaMs, sourceDurationMsFor);
    if (delta == 0) return clips;
    std::map<QString, QJsonObject> next;
    for (const auto& member : clips) {
        if (!memberIds.count(clipId(member))) continue;
        const SlidePlan p = planMember(clips, member, sourceDurationMsFor);
        next[clipId(member)] = withStart(member, clipStartMs(member) + delta);
        if (p.before) next[clipId(*p.before)] = trimClip(*p.before, QStringLiteral("end"), delta);
        if (p.after) next[clipId(*p.after)] = trimClip(*p.after, QStringLiteral("start"), -delta);
    }
    ClipList out;
    for (const auto& c : clips) {
        auto it = next.find(clipId(c));
        out.push_back(it != next.end() ? it->second : c);
    }
    return out;
}

QJsonObject slipSourceWindow(const QJsonObject& clip, double sourceDeltaMs, std::optional<double> sourceDurationMs) {
    const double inPointMs = numberOr(clip, "inPointMs", 0.0);
    const double sourceSpanMs = numberOr(clip, "outPointMs", inPointMs + clipDurationMs(clip) * sourceRate(clip)) - inPointMs;
    const double maxInPointMs =
        sourceDurationMs ? std::max(0.0, *sourceDurationMs - sourceSpanMs) : std::numeric_limits<double>::infinity();
    const double nextInPointMs = std::min(maxInPointMs, std::max(0.0, inPointMs + sourceDeltaMs));
    QJsonObject patch{{QStringLiteral("inPointMs"), nextInPointMs}};
    if (clip.value(u"outPointMs").isDouble()) patch.insert(QStringLiteral("outPointMs"), nextInPointMs + sourceSpanMs);
    return patch;
}

QStringList trackSelectIds(const ClipList& clips, double atMs, const QString& direction, const QString& trackId) {
    QStringList out;
    for (const auto& c : clips) {
        const bool side = direction == u"forward" ? clipEndMs(c) > atMs : clipStartMs(c) < atMs;
        if (side && (trackId.isEmpty() || clipTrackId(c) == trackId)) out.append(clipId(c));
    }
    return out;
}

double snap(double timeMs, const std::vector<double>& candidates, double thresholdPx, double msPerPx) {
    const double thresholdMs = thresholdPx * msPerPx;
    double closest = timeMs;
    double closestDistance = std::numeric_limits<double>::infinity();
    for (const double candidate : candidates) {
        const double distance = std::abs(candidate - timeMs);
        if (distance > thresholdMs) continue;
        if (distance < closestDistance) {
            closest = candidate;
            closestDistance = distance;
            continue;
        }
        if (distance == closestDistance && candidate < closest) closest = candidate;
    }
    return closest;
}

SnapResolution resolveSnap(double timeMs, const std::vector<double>& candidates, double thresholdPx, double msPerPx) {
    const double thresholdMs = thresholdPx * msPerPx;
    double closest = timeMs;
    double closestDistance = std::numeric_limits<double>::infinity();
    bool snapped = false;
    for (const double candidate : candidates) {
        const double distance = std::abs(candidate - timeMs);
        if (distance > thresholdMs) continue;
        if (distance < closestDistance) {
            closest = candidate;
            closestDistance = distance;
            snapped = true;
            continue;
        }
        if (distance == closestDistance && candidate < closest) closest = candidate;
    }
    const double distanceMs = std::abs(closest - timeMs);
    return {closest, snapped, distanceMs, msPerPx > 0 ? distanceMs / msPerPx : 0.0};
}

std::vector<double> buildSnapPoints(const SnapPointSource& source) {
    std::set<double> set;
    if (source.playheadMs) set.insert(*source.playheadMs);
    if (source.tickIntervalMs > 0) {
        for (long long i = 0;; ++i) {
            const double t = static_cast<double>(i) * source.tickIntervalMs;
            if (t > source.maxTimeMs) break;
            set.insert(t);
        }
    }
    for (const double m : source.markers) set.insert(m);
    if (source.clips) {
        for (const auto& c : *source.clips) {
            if (source.excludeClipIds.count(clipId(c))) continue;
            set.insert(clipStartMs(c));
            set.insert(clipEndMs(c));
        }
    }
    return {set.begin(), set.end()};
}

}  // namespace nt::edit
