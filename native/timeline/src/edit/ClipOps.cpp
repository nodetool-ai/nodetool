#include "edit/ClipOps.h"
#include "edit/EditActions.h"
#include "edit/groups/GroupOps.h"
#include "edit/speed/SpeedOperations.h"
#include "scene/Animation.h"
#include "midi/RegionParams.h"
#include "midi/PatternExpand.h"
#include "edit/targeting/RangeSplit.h"
#include "scene/ParamCurves.h"
#include "music/MusicPlan.h"
#include "music/MusicDocument.h"

#include <QJsonArray>
#include <QHash>
#include <QMap>
#include <QUuid>

#include <algorithm>
#include <cmath>
#include <limits>
#include <map>
#include <vector>

namespace nt::edit {

namespace {

constexpr double SOURCE_BOUND_TOLERANCE_MS = 0.000001;

std::function<QString()>& idGenerator() {
    // native-rules #14: static mutable id generator
    static std::function<QString()> generator;
    return generator;
}

bool finiteNumber(const QJsonValue& value) {
    return value.isDouble() && std::isfinite(value.toDouble());
}

void validateStyleRange(const QJsonObject& style, const QString& key, double minimum,
                        double maximum = std::numeric_limits<double>::infinity(), bool positive = false) {
    if (!style.contains(key)) { return; }
    const auto value = style.value(key);
    if (!finiteNumber(value) || value.toDouble() < minimum || value.toDouble() > maximum ||
        (positive && value.toDouble() == minimum)) {
        throw OpError(("Invalid style range: " + key).toStdString());
    }
}

void validateFontFamily(const QJsonValue& value) {
    if (value.isUndefined()) { return; }
    if (!value.isString()) { throw OpError("Font family must be text"); }
    auto family = value.toString().section(',', 0, 0).trimmed();
    if (family.startsWith('"') || family.startsWith('\'')) { family.remove(0, 1); }
    if (family.endsWith('"') || family.endsWith('\'')) { family.chop(1); }
    if (QStringList{"sans-serif", "serif", "monospace", "cursive", "fantasy", "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace", "ui-rounded", "math", "emoji", "fangsong", "-apple-system", "blinkmacsystemfont"}.contains(family.trimmed().toLower())) {
        throw OpError("Name a typeface instead of a generic font family");
    }
}

void validateStyleFields(const QJsonObject& style, const QStringList& numbers, const QStringList& words) {
    for (auto field = style.begin(); field != style.end(); ++field) {
        if (numbers.contains(field.key()) && !finiteNumber(field.value())) { throw OpError("Style field must be numeric"); }
        if (words.contains(field.key()) && !field.value().isString()) { throw OpError("Style field must be text"); }
    }
}

void validateStyleDecoration(const QJsonValue& value, const QStringList& requiredNumbers) {
    if (value.isUndefined()) { return; }
    if (!value.isObject()) { throw OpError("Style decoration must be an object"); }
    const auto decoration = value.toObject();
    if (!decoration.value("color").isString()) { throw OpError("Style decoration requires a color"); }
    for (const auto& field : requiredNumbers) {
        if (!finiteNumber(decoration.value(field))) { throw OpError("Style decoration requires numeric dimensions"); }
        if (field != u"offsetX" && field != u"offsetY") { validateStyleRange(decoration, field, 0); }
    }
    validateStyleRange(decoration, "radiusPx", 0);
}

void validateStyleFill(const QJsonValue& value) {
    if (value.isUndefined()) { return; }
    if (!value.isObject()) { throw OpError("Style fill must be an object"); }
    const auto fill = value.toObject();
    const auto type = fill.value("type").toString();
    if (type == u"solid") {
        if (!fill.value("color").isString()) { throw OpError("Solid fill requires a color"); }
        return;
    }
    if ((type != u"linear" && type != u"radial") || !fill.value("stops").isArray() ||
        (type == u"linear" && !finiteNumber(fill.value("angle"))) || fill.value("stops").toArray().size() < 2) { throw OpError("Invalid gradient fill"); }
    for (const auto& value : fill.value("stops").toArray()) {
        const auto stop = value.toObject();
        if (!finiteNumber(stop.value("offset")) || stop.value("offset").toDouble() < 0 || stop.value("offset").toDouble() > 1 || !stop.value("color").isString()) { throw OpError("Invalid gradient stop"); }
    }
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
    if (!hasTimeRemap(c) || isHoldRemap(c)) return;
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

// keyframes.ts retimeKeyframeCurves: curves normalized over a clip `fromMs` long, renormalized
// over the clip a trim made of it, `headMs` added before the old start. Every key keeps its
// instant; a key the trim cut off keeps a `t` outside 0..1, so trimming back out restores it.
QJsonArray retimeKeyframeCurves(const QJsonArray& curves, double fromMs, double toMs, double headMs) {
    if (fromMs <= 0 || toMs <= 0 || (fromMs == toMs && headMs == 0)) return curves;
    QJsonArray next;
    for (const QJsonValue& value : curves) {
        QJsonObject curve = value.toObject();
        QJsonArray keyframes;
        for (const QJsonValue& keyValue : curve.value(u"keyframes").toArray()) {
            QJsonObject keyframe = keyValue.toObject();
            keyframe.insert(QStringLiteral("t"), (keyframe.value(u"t").toDouble() * fromMs + headMs) / toMs);
            keyframes.append(keyframe);
        }
        curve.insert(QStringLiteral("keyframes"), keyframes);
        next.append(curve);
    }
    return next;
}

// keyframes.ts retimeKeyframeAnimations: the hand-keyframe animation after a trim.
QJsonArray retimeKeyframeAnimations(const QJsonArray& animations, double fromMs, double toMs, double headMs) {
    QJsonArray next;
    for (const QJsonValue& value : animations) {
        QJsonObject animation = value.toObject();
        if (isKeyframeAnimation(animation) && animation.value(u"custom").isObject()) {
            QJsonObject custom = animation.value(u"custom").toObject();
            custom.insert(QStringLiteral("curves"),
                          retimeKeyframeCurves(custom.value(u"curves").toArray(), fromMs, toMs, headMs));
            animation.insert(QStringLiteral("custom"), custom);
            animation.insert(QStringLiteral("durationMs"), toMs);
        }
        next.append(animation);
    }
    return next;
}

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

// Curves restricted to fromT..toT and renormalized over that span, for one half of a split.
QJsonArray sliceCurves(const QJsonArray& list, double fromT, double toT, double tEpsilon) {
    const double span = toT - fromT;
    QJsonArray curves;
    for (const QJsonValue& value : list) {
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
            if (t > fromT + tEpsilon && t < toT - tEpsilon) {
                sliced.push_back(keyframe);
            }
        }
        const auto tailSource = std::find_if(sorted.begin(), sorted.end(), [toT, tEpsilon](const QJsonObject& keyframe) {
            return keyframe.value(u"t").toDouble() >= toT - tEpsilon;
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
    return curves;
}

QJsonObject sliceKeyframeAnimation(const QJsonObject& animation, double fromT, double toT, double durationMs) {
    QJsonObject next = animation;
    next.insert(QStringLiteral("durationMs"), durationMs);
    if (!present(animation, "custom") || toT - fromT <= 0) {
        return next;
    }
    QJsonObject custom = animation.value(u"custom").toObject();
    // Keys less than half a millisecond from a cut sit on it. durationMs is
    // this half's length, so the source clip is durationMs / span long.
    custom.insert(QStringLiteral("curves"), sliceCurves(custom.value(u"curves").toArray(), fromT, toT,
        durationMs > 0 ? 0.5 * (toT - fromT) / durationMs : 1e-4));
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
    double leftOutMs;
    double rightInMs;
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
            left.append(sliceSourceAnimation(anim, source.inPointMs, source.leftOutMs, source.leftDurationMs));
            QJsonObject r = sliceSourceAnimation(anim, source.rightInMs, source.outPointMs, source.rightDurationMs);
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
std::vector<QJsonObject> clearWindow(const QJsonObject& source, double startMs, double endMs, double bpm, double gridOffsetMs) {
    const double cStart = clipStartMs(source);
    const double cEnd = clipEndMs(source);
    if (cEnd <= startMs || cStart >= endMs) return {source};
    const auto c = source.value("mediaType").toString() == u"midi" && !source.contains("pattern")
        ? nt::midi::bakeRegionQuantize(source, bpm, gridOffsetMs) : source;
    if (cStart >= startMs && cEnd <= endMs) return {};
    if (cStart < startMs && cEnd > endMs) {
        const auto [head, rest] = splitClip(c, startMs, bpm, QStringLiteral("shorten"), gridOffsetMs);
        const auto tail = splitClip(rest, endMs, bpm, QStringLiteral("shorten"), gridOffsetMs).second;
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

bool isHoldRemap(const QJsonObject& clip) {
    const auto frames = clip.value("timeRemap").toObject().value("keyframes").toArray();
    if (frames.isEmpty()) { return false; }
    const auto first = frames.first().toObject().value("sourceMs");
    if (!first.isDouble()) { return false; }
    const double source = first.toDouble();
    return std::all_of(frames.begin(), frames.end(), [source](const auto& value) {
        const auto ms = value.toObject().value("sourceMs");
        return ms.isDouble() && std::abs(ms.toDouble() - source) <= 1e-6;
    });
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

QJsonArray sourceAnimationsForWindow(const QJsonArray& animations, double fromMs, double toMs, double clipDurationMs) {
    return resliceSourceAnimations(animations, fromMs, toMs, clipDurationMs);
}

QJsonObject trimClip(const QJsonObject& clip, const QString& edge, double deltaMs, std::optional<double> maxDurationMs) {
    assertNotTimeRemapped(clip, "trimClip");

    const double rate = sourceRate(clip);
    const double inPointMs = numberOr(clip, "inPointMs", 0.0);
    const double outPointMs = numberOr(clip, "outPointMs", inPointMs + clipDurationMs(clip) * rate);
    const bool start = edge == u"start";

    const bool hold = isHoldRemap(clip);
    const double loop = clip.value("loopLengthMs").toDouble();
    const bool loopTail = !start && loop > 0 && loop < clipDurationMs(clip);
    const double sourceDeltaMs = hold || loopTail ? 0 : deltaMs * rate;
    if (hold || loopTail) { maxDurationMs.reset(); }
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
    if (!hold && nextInPointMs < 0) throw OpError("trimClip cannot extend before source start");
    if (nextStartMs < 0) throw OpError("trimClip cannot start before zero on the timeline");
    if (maxDurationMs && sourceDeltaMs > 0 && nextOutPointMs > *maxDurationMs) {
        throw OpError("trimClip cannot extend beyond source out-point");
    }

    QJsonObject next = clip;
    next.insert(QStringLiteral("startMs"), nextStartMs);
    next.insert(QStringLiteral("durationMs"), nextDurationMs);
    if (!hold) {
        next.insert(QStringLiteral("inPointMs"), nextInPointMs);
        next.insert(QStringLiteral("outPointMs"), nextOutPointMs);
    }
    if (loopTail && nextDurationMs <= loop) {
        next.remove(QStringLiteral("loopLengthMs"));
        next.insert("outPointMs", inPointMs + nextDurationMs * rate);
    }
    if (present(clip, "caption") && start) {
        next.insert(QStringLiteral("caption"),
                    retimeCaption(clip.value(u"caption").toObject(), clipStartMs(clip) - nextStartMs));
    }
    // Hand-set keys and paramCurves keep their instants (keyframes.ts retimeKeyframeAnimations).
    const double headMs = start ? deltaMs : 0;
    if (present(clip, "animations")) {
        next.insert(QStringLiteral("animations"),
                    retimeKeyframeAnimations(resliceSourceAnimations(clip.value(u"animations").toArray(),
                                                                     nextInPointMs, nextOutPointMs, nextDurationMs),
                                             clipDurationMs(clip), nextDurationMs, headMs));
    }
    if (present(clip, "paramCurves")) {
        next.insert(QStringLiteral("paramCurves"), retimeKeyframeCurves(clip.value(u"paramCurves").toArray(),
                                                                        clipDurationMs(clip), nextDurationMs, headMs));
    }
    return next;
}

namespace {
std::optional<double> midiCurveValue(const QJsonArray& points, double tick, bool step = false) {
    std::optional<QJsonObject> previous;
    for (const auto& value : points) {
        const auto point = value.toObject();
        const double at = point.value("tick").toDouble();
        if (at <= tick) {
            previous = point;
            continue;
        }
        if (!previous) { return std::nullopt; }
        const double v = previous->value("value").toDouble();
        if (step) { return v; }
        const double from = previous->value("tick").toDouble();
        return v + (point.value("value").toDouble() - v) * (tick - from) / (at - from);
    }
    return previous ? std::optional<double>(previous->value("value").toDouble()) : std::nullopt;
}
QJsonObject midiExpressionBefore(const QJsonObject& expression, double length) {
    QJsonObject result;
    for (const auto* key : {"pitch", "volume", "pan", "brightness"}) {
        const auto points = expression.value(QLatin1String(key)).toArray();
        QJsonArray kept;
        for (const auto& point : points) {
            if (point.toObject().value("tick").toDouble() <= length) { kept.append(point); }
        }
        if (!kept.isEmpty() && kept.size() < points.size() &&
            kept.last().toObject().value("tick").toDouble() < length) {
            if (const auto value = midiCurveValue(points, length)) {
                kept.append(QJsonObject{{"tick", length}, {"value", *value}});
            }
        }
        if (!kept.isEmpty()) { result.insert(QLatin1String(key), kept); }
    }
    return result;
}
QJsonObject midiExpressionAfter(const QJsonObject& expression, double offset) {
    QJsonObject result;
    for (const auto* key : {"pitch", "volume", "pan", "brightness"}) {
        const auto points = expression.value(QLatin1String(key)).toArray();
        if (points.isEmpty()) { continue; }
        QJsonArray kept;
        for (const auto& value : points) {
            auto point = value.toObject();
            const double tick = point.value("tick").toDouble();
            if (tick >= offset) {
                point.insert("tick", tick - offset);
                kept.append(point);
            }
        }
        if (kept.isEmpty() || kept.first().toObject().value("tick").toDouble() > 0) {
            if (const auto value = midiCurveValue(points, offset)) {
                kept.prepend(QJsonObject{{"tick", 0}, {"value", *value}});
            }
        }
        result.insert(QLatin1String(key), kept);
    }
    return result;
}
std::pair<QJsonArray, QJsonArray> midiSplitControllers(const QJsonArray& lanes, double from, double cut, double end) {
    QJsonArray left;
    QJsonArray right;
    for (const auto& value : lanes) {
        const auto lane = value.toObject();
        const auto points = lane.value("points").toArray();
        const bool step = lane.value("interpolation").toString() == u"step";
        QJsonArray visible;
        bool beforeWindow = false;
        bool afterWindow = false;
        for (const auto& p : points) {
            const double tick = p.toObject().value("tick").toDouble();
            beforeWindow = beforeWindow || tick < from;
            afterWindow = afterWindow || tick >= end;
            if (tick >= from && tick < end) { visible.append(p); }
        }
        const auto pointAt = [&](double tick, double at) {
            return QJsonObject{{"id", newId()}, {"tick", tick}, {"value", std::floor(at + 0.5)}};
        };
        if (beforeWindow && (visible.isEmpty() || visible.first().toObject().value("tick").toDouble() > from)) {
            if (const auto v = midiCurveValue(points, from, step)) { visible.prepend(pointAt(from, *v)); }
        }
        if (!step && afterWindow && !visible.isEmpty() && visible.last().toObject().value("tick").toDouble() < end - 1) {
            if (const auto v = midiCurveValue(points, end - 1)) { visible.append(pointAt(end - 1, *v)); }
        }
        QJsonArray before;
        QJsonArray after;
        for (const auto& p : visible) {
            auto point = p.toObject();
            const double tick = point.value("tick").toDouble();
            if (tick < cut) { before.append(point); }
            else {
                point.insert("id", newId());
                point.insert("tick", tick - cut);
                after.append(point);
            }
        }
        if (!step && !before.isEmpty() && !after.isEmpty() && before.last().toObject().value("tick").toDouble() < cut - 1) {
            if (const auto v = midiCurveValue(points, cut - 1)) { before.append(pointAt(cut - 1, *v)); }
        }
        if (!before.isEmpty()) {
            auto copy = lane;
            copy.insert("points", before);
            left.append(copy);
            if (after.isEmpty() || after.first().toObject().value("tick").toDouble() > 0) {
                if (const auto v = midiCurveValue(points, cut, step)) { after.prepend(pointAt(0, *v)); }
            }
        }
        if (!after.isEmpty()) {
            auto copy = lane;
            copy.insert("id", newId());
            copy.insert("points", after);
            right.append(copy);
        }
    }
    return {left, right};
}
} // namespace

std::pair<QJsonObject, QJsonObject> splitClip(const QJsonObject& source, double atMs, double bpm,
                                               const QString& crossing, double gridOffsetMs) {
    const auto clip = source.value("mediaType").toString() == u"midi" && !source.contains("pattern")
        ? nt::midi::bakeRegionQuantize(source, bpm, gridOffsetMs) : source;
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
        // Both halves of a hold show the same source window, so each keeps the whole curve.
        animations = splitAnimations(clip.value(u"animations").toArray(), leftDurationMs,
                                     {inPointMs, isHoldRemap(clip) ? outPointMs : cutPointMs,
                                      isHoldRemap(clip) ? inPointMs : cutPointMs, outPointMs, leftDurationMs, rightDurationMs});
    }

    QJsonObject left = clip;
    left.insert(QStringLiteral("id"), newId());
    left.insert(QStringLiteral("durationMs"), leftDurationMs);
    if (!isHoldRemap(clip)) {
        left.insert(QStringLiteral("inPointMs"), inPointMs);
        left.insert(QStringLiteral("outPointMs"), cutPointMs);
    }
    left.remove(QStringLiteral("fadeOutMs"));
    left.remove(QStringLiteral("fadeOutShape"));
    if (captions) {
        QJsonObject caption = clip.value(u"caption").toObject();
        caption.insert(QStringLiteral("words"), captions->first);
        left.insert(QStringLiteral("caption"), caption);
    }
    if (animations) left.insert(QStringLiteral("animations"), animations->first);
    // `sliceParamCurves` in splitClip.ts keeps the same half millisecond: a key near the cut stays.
    const QJsonArray paramCurves = clip.value(u"paramCurves").toArray();
    const double cutT = leftDurationMs / clipDurationMs(clip);
    const double paramTolerance = 0.5 / clipDurationMs(clip);
    if (!paramCurves.isEmpty()) left.insert(QStringLiteral("paramCurves"), sliceCurves(paramCurves, 0, cutT, paramTolerance));

    QJsonObject right = clip;
    right.insert(QStringLiteral("id"), newId());
    right.insert(QStringLiteral("startMs"), atMs);
    right.insert(QStringLiteral("durationMs"), rightDurationMs);
    if (!isHoldRemap(clip)) {
        right.insert(QStringLiteral("inPointMs"), cutPointMs);
        right.insert(QStringLiteral("outPointMs"), outPointMs);
    }
    right.remove(QStringLiteral("fadeInMs"));
    right.remove(QStringLiteral("fadeInShape"));
    right.remove(QStringLiteral("transitionIn"));
    if (captions) {
        QJsonObject caption = clip.value(u"caption").toObject();
        caption.insert(QStringLiteral("words"), captions->second);
        right.insert(QStringLiteral("caption"), caption);
    }
    if (animations) right.insert(QStringLiteral("animations"), animations->second);
    if (!paramCurves.isEmpty()) right.insert(QStringLiteral("paramCurves"), sliceCurves(paramCurves, cutT, 1, paramTolerance));
    if (clip.value("mediaType").toString() == u"midi" && clip.value("pattern").isObject()) {
        const double phase = clip.value("patternPhaseTicks").toDouble() + std::floor(inPointMs * bpm * 960 / 60000 + 0.5);
        for (auto* half : {&left, &right}) {
            half->remove(QStringLiteral("notes"));
            half->remove(QStringLiteral("controllers"));
            half->insert("inPointMs", 0);
            if (clip.contains("outPointMs")) { half->insert("outPointMs", clipDurationMs(*half)); }
            else { half->remove(QStringLiteral("outPointMs")); }
        }
        if (phase > 0) { left.insert("patternPhaseTicks", phase); }
        else { left.remove(QStringLiteral("patternPhaseTicks")); }
        right.insert("patternPhaseTicks", phase + std::floor(leftDurationMs * bpm * 960 / 60000 + 0.5));
    } else if (clip.value("mediaType").toString() == u"midi") {
        const double ticksPerMs = 960.0 * bpm / 60000.0;
        const double windowStart = std::floor(inPointMs * ticksPerMs + 0.5);
        const double windowEnd = std::floor((inPointMs + clipDurationMs(clip)) * ticksPerMs + 0.5);
        const double cut = std::floor((inPointMs + leftDurationMs) * ticksPerMs + 0.5);
        QJsonArray before;
        QJsonArray after;
        for (const auto& value : clip.value("notes").toArray()) {
            auto note = value.toObject();
            const double tick = note.value("startTick").toDouble();
            if (tick < windowStart || tick >= windowEnd) {
                continue;
            }
            if (tick >= cut) {
                note.insert("id", newId());
                note.insert("startTick", tick - cut);
                after.append(note);
            } else {
                const double length = std::min(note.value("durationTick").toDouble(), cut - tick);
                const double end = tick + note.value("durationTick").toDouble();
                if (end > cut && crossing == u"split") {
                    auto tail = note;
                    tail.insert("id", newId());
                    tail.insert("startTick", 0);
                    tail.insert("durationTick", end - cut);
                    if (note.contains("expression")) {
                        const auto expression = midiExpressionAfter(note.value("expression").toObject(), cut - tick);
                        if (expression.isEmpty()) { tail.remove(QStringLiteral("expression")); }
                        else { tail.insert("expression", expression); }
                    }
                    after.prepend(tail);
                }
                if (length < note.value("durationTick").toDouble() && note.contains("expression")) {
                    const auto expression = midiExpressionBefore(note.value("expression").toObject(), length);
                    if (expression.isEmpty()) { note.remove(QStringLiteral("expression")); }
                    else { note.insert("expression", expression); }
                }
                note.insert("durationTick", length);
                before.append(note);
            }
        }
        if (clip.contains("notes")) {
            left.insert("notes", before);
            right.insert("notes", after);
        }
        if (clip.contains("controllers")) {
            const auto [leftLanes, rightLanes] = midiSplitControllers(clip.value("controllers").toArray(), windowStart, cut, windowEnd);
            left.insert("controllers", leftLanes);
            right.insert("controllers", rightLanes);
        }
        right.insert("inPointMs", 0);
        if (clip.contains("outPointMs")) {
            right.insert("outPointMs", rightDurationMs);
        } else {
            right.remove(QStringLiteral("outPointMs"));
        }
    }
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
                for (const auto& c : unit) pieces.push_back(clearWindow(c, mStart, mEnd, options.bpm, options.gridOffsetMs));
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
            for (const auto& c : unit) split.push_back(splitClip(c, insertMs, options.bpm, QStringLiteral("shorten"), options.gridOffsetMs));
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
        // Rounding can leave a start-edge stretch to 0 a hair below it.
        retimed.insert(QStringLiteral("startMs"), end ? clipStartMs(m) : std::max(0.0, clipEndMs(m) - nextDurationMs));
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

// The neighbours of one member: clips on its track that are not themselves
// members, so a run of selected clips slides as one unit.
SlidePlan planMember(const ClipList& clips, const QJsonObject& member, const IdSet& memberIds) {
    ClipList others;
    for (const auto& c : clips) {
        if (clipTrackId(c) == clipTrackId(member) && !memberIds.count(clipId(c)) && !isGroupClip(c)) others.push_back(c);
    }
    SlidePlan p;
    for (const auto& c : others) {
        if (!p.before && std::abs(clipEndMs(c) - clipStartMs(member)) <= TOUCH_MS) p.before = c;
    }
    for (const auto& c : others) {
        if (!p.after && std::abs(clipStartMs(c) - clipEndMs(member)) <= TOUCH_MS) p.after = c;
    }
    if (!p.before) {
        double gapStartMs = 0;
        for (const auto& c : others) {
            if (clipEndMs(c) <= clipStartMs(member) + TOUCH_MS) gapStartMs = std::max(gapStartMs, clipEndMs(c));
        }
        p.minDeltaMs = gapStartMs - clipStartMs(member);
    }
    if (!p.after) {
        double gapEndMs = std::numeric_limits<double>::infinity();
        for (const auto& c : others) {
            if (clipStartMs(c) >= clipEndMs(member) - TOUCH_MS) gapEndMs = std::min(gapEndMs, clipStartMs(c));
        }
        p.maxDeltaMs = gapEndMs - clipEndMs(member);
    }
    return p;
}

// A neighbour trims its tail when a member follows it and its head when a
// member precedes it. One between two members does both.
struct NeighbourEdit {
    QJsonObject clip;
    bool head = false;
    bool tail = false;
};

std::vector<NeighbourEdit> neighbourEdits(const std::vector<SlidePlan>& plans) {
    std::vector<NeighbourEdit> edits;
    auto edit = [&edits](const QJsonObject& clip) -> NeighbourEdit& {
        for (auto& e : edits) {
            if (clipId(e.clip) == clipId(clip)) return e;
        }
        edits.push_back({clip, false, false});
        return edits.back();
    };
    for (const auto& p : plans) {
        if (p.before) edit(*p.before).tail = true;
        if (p.after) edit(*p.after).head = true;
    }
    return edits;
}

QJsonObject trimNeighbour(const NeighbourEdit& edit, double delta) {
    if (!edit.head) return trimClip(edit.clip, QStringLiteral("end"), delta);
    if (!edit.tail) return trimClip(edit.clip, QStringLiteral("start"), -delta);
    // Grow first so a shared neighbour can move farther than its own length.
    // Slice animations once from the original curve, never an intermediate window.
    QJsonObject withoutAnimations = edit.clip;
    withoutAnimations.remove(QStringLiteral("animations"));
    const QJsonObject grown =
        trimClip(withoutAnimations, delta > 0 ? QStringLiteral("end") : QStringLiteral("start"), std::abs(delta));
    QJsonObject trimmed = trimClip(grown, delta > 0 ? QStringLiteral("start") : QStringLiteral("end"), -std::abs(delta));
    if (edit.clip.contains(u"animations")) {
        trimmed.insert(QStringLiteral("animations"),
                       resliceSourceAnimations(edit.clip.value(u"animations").toArray(),
                                               numberOr(trimmed, "inPointMs", 0.0), outPointOf(trimmed),
                                               clipDurationMs(trimmed)));
    }
    return trimmed;
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
    for (const auto& m : members) plans.push_back(planMember(clips, m, memberIds));
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
    for (const auto& [clip, head, tail] : neighbourEdits(plans)) {
        const double rate = sourceRate(clip);
        if (head) {
            minDeltaMs = std::max({minDeltaMs, -numberOr(clip, "inPointMs", 0.0) / rate, -clipStartMs(clip)});
            if (!tail) maxDeltaMs = std::min(maxDeltaMs, clipDurationMs(clip) - MIN_NEIGHBOUR_MS);
        }
        if (tail) {
            if (!head) minDeltaMs = std::max(minDeltaMs, MIN_NEIGHBOUR_MS - clipDurationMs(clip));
            const auto sourceMs = sourceDurationMsFor ? sourceDurationMsFor(clip) : std::nullopt;
            if (sourceMs) maxDeltaMs = std::min(maxDeltaMs, (*sourceMs - outPointOf(clip)) / rate);
        }
    }
    if (minDeltaMs > maxDeltaMs) return 0;
    return std::min(maxDeltaMs, std::max(minDeltaMs, deltaMs));
}

ClipList slideClips(const ClipList& clips, const IdSet& memberIds, double deltaMs,
                    const SourceDurationFor& sourceDurationMsFor) {
    const double delta = slideDeltaLimit(clips, memberIds, deltaMs, sourceDurationMsFor);
    if (delta == 0) return clips;
    std::map<QString, QJsonObject> next;
    std::vector<SlidePlan> plans;
    for (const auto& member : clips) {
        if (!memberIds.count(clipId(member))) continue;
        plans.push_back(planMember(clips, member, memberIds));
        next[clipId(member)] = withStart(member, clipStartMs(member) + delta);
    }
    for (const auto& edit : neighbourEdits(plans)) next[clipId(edit.clip)] = trimNeighbour(edit, delta);
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

namespace {
constexpr double SECTION_EPS = 1e-6;
double sectionBpm(const QJsonObject& raw) { return raw.value("tempo").toObject().value("bpm").toDouble(120); }
double sectionBeatMs(const QJsonObject& raw) {
    const auto signature = raw.value("tempo").toObject().value("timeSignature").toObject();
    return 60000.0 / sectionBpm(raw) * 4 / signature.value("beatUnit").toDouble(4);
}
double sectionBarMs(const QJsonObject& raw, double bar) {
    if (!std::isfinite(bar) || bar < 1 || std::floor(bar) != bar) { throw OpError("Bar must be a whole number from 1"); }
    const auto tempo = raw.value("tempo").toObject();
    return tempo.value("offsetMs").toDouble() + (bar - 1) * sectionBeatMs(raw) *
        tempo.value("timeSignature").toObject().value("beatsPerBar").toDouble(4);
}
double sectionTime(const QJsonObject& raw, const QJsonObject& p, const QString& barKey, const QString& msKey) {
    if (p.contains(barKey) && p.contains(msKey)) { throw OpError("Send bar or millisecond positions, not both"); }
    double value;
    if (p.contains(barKey)) {
        value = sectionBarMs(raw, p.value(barKey).toDouble(-1));
        if (barKey == u"atBar") {
            const double beat = p.value("beat").toDouble(1);
            if (!std::isfinite(beat) || beat < 1) { throw OpError("beat must be 1 or more"); }
            value += (beat - 1) * sectionBeatMs(raw);
        }
    } else {
        if (barKey == u"atBar" && p.contains("beat")) { throw OpError("beat needs atBar"); }
        if (!p.value(msKey).isDouble()) { throw OpError("Send a bar or millisecond position"); }
        value = p.value(msKey).toDouble();
    }
    if (!std::isfinite(value) || value < 0) { throw OpError("Time must be finite and non-negative"); }
    return value;
}
QString musicResourceId(const QJsonArray& values, const QString& ref, const QString& kind) {
    for (const auto& value : values) {
        if (value.toObject().value("id").toString() == ref) { return ref; }
    }
    const auto hex = [](const QString& value) {
        return std::all_of(value.begin(), value.end(), [](QChar c) { return (c >= u'0' && c <= u'9') || (c >= u'a' && c <= u'f'); });
    };
    QString found;
    for (const auto& value : values) {
        const auto object = value.toObject();
        const auto id = object.value("id").toString();
        const bool prefix = ref.size() == 12 && hex(ref) && id.size() == 32 && hex(id) && id.startsWith(ref);
        if (prefix || (!ref.isEmpty() && object.value("name").toString().compare(ref, Qt::CaseInsensitive) == 0)) {
            if (!found.isEmpty()) { throw OpError(("Ambiguous " + kind + ": " + ref).toStdString()); }
            found = id;
        }
    }
    if (found.isEmpty()) { throw OpError(("No " + kind + ": " + ref).toStdString()); }
    return found;
}
std::optional<IdSet> sectionTracks(const QJsonObject& raw, const QJsonObject& p) {
    if (!p.contains("trackIds")) { return std::nullopt; }
    if (!p.value("trackIds").isArray()) { throw OpError("trackIds must be an array"); }
    IdSet result;
    for (const auto& ref : p.value("trackIds").toArray()) {
        result.insert(musicResourceId(raw.value("tracks").toArray(), ref.toString(), "track"));
    }
    return result;
}
bool sectionOnTrack(const QJsonObject& clip, const std::optional<IdSet>& tracks) {
    return !tracks || tracks->contains(clipTrackId(clip));
}
bool sectionLocked(const QJsonObject& raw, const QJsonObject& clip) {
    if (clip.value("locked").toBool()) { return true; }
    for (const auto& value : raw.value("tracks").toArray()) {
        const auto track = value.toObject();
        if (track.value("id") == clip.value("trackId")) { return track.value("locked").toBool(); }
    }
    return false;
}
// Per-repeat state mirrors computeRowSegmentStates in stepPatternExpand.ts.
// Local values belong to the calling edit/plan thread.
std::vector<QJsonObject> loopPatternStates(const QJsonObject& clip, double bpm) {
    const double ticksPerMs = bpm * 960 / 60000;
    const auto total = static_cast<std::int64_t>(std::floor(clipDurationMs(clip) * ticksPerMs + 0.5));
    const auto period = std::max<std::int64_t>(1, static_cast<std::int64_t>(std::floor(clip.value("loopLengthMs").toDouble() * ticksPerMs + 0.5)));
    const auto count = static_cast<size_t>((total + period - 1) / period);
    std::vector<QJsonObject> states(count);
    const auto pattern = nt::midi::normalizePattern(clip.value("pattern").toObject());
    const auto initial = clip.value("patternRowCycles").toObject();
    const auto phase = std::max(0.0, std::floor(clip.value("patternPhaseTicks").toDouble() + 0.5)) +
        std::max(0.0, std::floor(clip.value("inPointMs").toDouble() * ticksPerMs + 0.5));
    for (const auto& value : pattern.value("rows").toArray()) {
        const auto row = value.toObject(); const auto id = row.value("id").toString();
        const auto playback = row.value("playback").toString(); const auto steps = row.value("steps").toArray();
        bool dependent = initial.contains(id) || playback == u"shuffle" || playback == u"random" || playback == u"wander";
        bool hasLast = false;
        std::vector<int> active;
        for (int i = 0; i < steps.size(); ++i) {
            const auto step = steps[i].toObject(); const auto condition = step.value("condition").toObject().value("type").toString();
            hasLast |= condition == u"last";
            dependent |= step.value("chance").toDouble(100) < 100 || (!condition.isEmpty() && condition != u"always");
            if (i >= row.value("loopStart").toInt() && i < row.value("loopEnd").toInt(steps.size()) && !step.value("skip").toBool()) { active.push_back(i); }
        }
        if (!dependent) { continue; }
        const auto seed = static_cast<std::uint32_t>(pattern.value("seed").toDouble());
        auto cycle = static_cast<std::int64_t>(initial.value(id).toObject().value("cycleOffset").toDouble());
        std::optional<int> wander;
        if (initial.value(id).toObject().contains("wanderPos")) { wander = initial.value(id).toObject().value("wanderPos").toInt(); }
        std::vector<QJsonObject> starts(count);
        std::vector<std::int64_t> localLast(count, -1);
        std::int64_t last = -1;
        for (size_t k = 0; k < count; ++k) {
            starts[k].insert("cycleOffset", static_cast<double>(cycle));
            if (playback == u"wander" && wander && !active.empty()) { starts[k].insert("wanderPos", *wander); }
            const auto limit = std::min(period, total - static_cast<std::int64_t>(k) * period) + (k == 0 ? phase : 0);
            std::int64_t cursor = 0;
            for (int safety = 0; !active.empty() && cursor < limit && safety < 16384; ++safety) {
                const auto order = nt::midi::playOrder(static_cast<int>(active.size()), playback.toStdString(), seed, cycle, id.toStdString(), wander);
                if (order.empty()) { break; }
                wander = order.back(); last = cycle; localLast[k] = cycle;
                std::int64_t length = 0;
                for (const auto position : order) {
                    const auto step = steps[active[static_cast<size_t>(position)]].toObject();
                    length += nt::midi::stepRateTicks(step.value("stepRate").toString(row.value("stepRate").toString()).toStdString()).value_or(240);
                }
                if (length <= 0) { break; }
                cursor += length; ++cycle;
            }
        }
        if (initial.value(id).toObject().contains("lastCycle")) { last = static_cast<std::int64_t>(initial.value(id).toObject().value("lastCycle").toDouble()); }
        for (size_t k = 0; k < count; ++k) {
            const bool needsLast = hasLast && last >= 0 && last != localLast[k];
            if (starts[k].value("cycleOffset").toDouble() > 0 || needsLast || starts[k].contains("wanderPos")) {
                if (needsLast) { starts[k].insert("lastCycle", static_cast<double>(last)); }
                states[k].insert(id, starts[k]);
            }
        }
    }
    return states;
}
QJsonArray unrollMusicClip(const QJsonObject& source, double bpm, double gridOffsetMs = 0) {
    const auto clip = source.value("mediaType").toString() == u"midi" && !source.contains("pattern")
        ? nt::midi::bakeRegionQuantize(source, bpm, gridOffsetMs) : source;
    const double period = clip.value("loopLengthMs").toDouble();
    if (period <= 0 || period >= clipDurationMs(clip) || !std::isfinite(period)) { return {clip}; }
    const bool pattern = clip.value("mediaType").toString() == u"midi" && clip.value("pattern").isObject();
    const auto rowStates = pattern ? loopPatternStates(clip, bpm) : std::vector<QJsonObject>{};
    QJsonArray copies;
    for (int k = 0; k * period < clipDurationMs(clip) - SECTION_EPS; ++k) {
        const double offset = k * period;
        auto copy = clip;
        copy.remove(QStringLiteral("loopLengthMs"));
        const double duration = std::min(period, clipDurationMs(clip) - offset);
        // Cutting a longer temporary window uses the same MIDI expression/controller boundary rules.
        copy.insert("durationMs", duration + 1);
        if (pattern) {
            copy.insert("durationMs", duration); copy.insert("inPointMs", 0);
            const double phase = clip.value("patternPhaseTicks").toDouble() + std::max(0.0, std::floor(clip.value("inPointMs").toDouble() * bpm * 960 / 60000 + 0.5));
            if (k == 0 && phase > 0) { copy.insert("patternPhaseTicks", phase); } else { copy.remove("patternPhaseTicks"); }
            if (static_cast<size_t>(k) < rowStates.size() && !rowStates[static_cast<size_t>(k)].isEmpty()) {
                copy.insert("patternRowCycles", rowStates[static_cast<size_t>(k)]);
            } else { copy.remove("patternRowCycles"); }
            if (copy.contains("outPointMs")) { copy.insert("outPointMs", duration); }
            copy.remove("notes"); copy.remove("controllers");
        } else { copy = splitClip(copy, clipStartMs(clip) + duration, bpm, QStringLiteral("shorten"), gridOffsetMs).first; }
        const double total = clipDurationMs(clip);
        if (clip.contains("paramCurves")) {
            copy.insert("paramCurves", sliceCurves(clip.value("paramCurves").toArray(),
                offset / total, (offset + duration) / total, 0.5 / total));
        }
        if (clip.contains("animations")) {
            QJsonArray animations;
            for (const auto& value : clip.value("animations").toArray()) {
                auto animation = value.toObject();
                const auto role = animation.value("role").toString();
                if (isSourceAnchoredAnimation(animation)) {
                    const double from = numberOr(clip, "inPointMs", 0.0);
                    animation = sliceSourceAnimation(animation, from, from + duration * sourceRate(clip), duration);
                } else if (isKeyframeAnimation(animation)) {
                    animation = sliceKeyframeAnimation(animation, offset / total, (offset + duration) / total, duration);
                } else if (role == u"in") {
                    if (offset > 0) { continue; }
                } else if (role == u"out") {
                    if (offset + duration < total - SECTION_EPS) { continue; }
                } else if (role == u"emphasis") {
                    const double delay = std::max(0.0, numberOr(animation, "delayMs", 0.0));
                    if (delay < offset - SECTION_EPS ||
                        (offset + duration < total - SECTION_EPS && delay >= offset + duration)) { continue; }
                    animation.insert("delayMs", delay - offset);
                } else {
                    animation.insert("delayMs", rebaseLoopDelayMs(animation, offset));
                }
                if (offset > 0) { animation.insert("id", newId()); }
                animations.append(animation);
            }
            copy.insert("animations", animations);
        }
        copy.insert("id", offset == 0 ? clipId(clip) : newId());
        copy.insert("startMs", clipStartMs(clip) + offset);
        if (offset > 0) {
            copy.insert("locked", false);
            for (const auto* key : {"linkId", "fadeInMs", "fadeInShape", "transitionIn"}) { copy.remove(QLatin1String(key)); }
        }
        if (offset + duration >= clipDurationMs(clip) - SECTION_EPS) {
            for (const auto* key : {"fadeOutMs", "fadeOutShape"}) {
                if (clip.contains(QLatin1String(key))) { copy.insert(QLatin1String(key), clip.value(QLatin1String(key))); }
            }
        }
        copies.append(copy);
    }
    return copies;
}
QJsonArray pruneSectionLinks(QJsonArray clips, const IdSet& touched) {
    if (touched.empty()) { return clips; }
    QHash<QString, int> counts;
    for (const auto& value : clips) { const auto link = clipLinkId(value.toObject()); if (!link.isEmpty()) { ++counts[link]; } }
    for (qsizetype i = 0; i < clips.size(); ++i) {
        auto clip = clips[i].toObject();
        if (touched.contains(clipLinkId(clip)) && counts.value(clipLinkId(clip)) < 2) { clip.remove(QStringLiteral("linkId")); clips[i] = clip; }
    }
    return clips;
}
QJsonArray sectionCut(const QJsonArray& clips, double at, const std::optional<IdSet>& tracks, double bpm, QJsonArray& media, const QString& crossing = QStringLiteral("shorten"), double gridOffsetMs = 0) {
    QJsonArray result;
    QHash<QString, QString> rightLinks;
    IdSet touchedLinks;
    for (const auto& value : clips) {
        const auto original = value.toObject();
        const bool crosses = sectionOnTrack(original, tracks) && !isGroupClip(original) && clipStartMs(original) < at - SECTION_EPS && clipEndMs(original) > at + SECTION_EPS;
        const auto pieces = crosses ? unrollMusicClip(original, bpm, gridOffsetMs) : QJsonArray{original};
        for (const auto& piece : pieces) {
            const auto clip = piece.toObject();
            if (crosses && clipStartMs(clip) < at - SECTION_EPS && clipEndMs(clip) > at + SECTION_EPS) {
                auto [left, right] = splitClip(clip, at, bpm, crossing, gridOffsetMs);
                const auto link = clipLinkId(clip);
                if (!link.isEmpty()) {
                    if (!rightLinks.contains(link)) { rightLinks.insert(link, newId()); }
                    right.insert("linkId", rightLinks.value(link));
                    touchedLinks.insert(link);
                    touchedLinks.insert(rightLinks.value(link));
                }
                nt::targeting::splitOwnedMediaTracks(media, clipId(clip), left, right);
                result.append(left);
                result.append(right);
            } else { result.append(clip); }
        }
    }
    return pruneSectionLinks(result, touchedLinks);
}
QJsonArray sectionSortedPoints(const QJsonArray& points) {
    std::vector<QJsonObject> sorted;
    for (const auto& point : points) { sorted.push_back(point.toObject()); }
    std::stable_sort(sorted.begin(), sorted.end(), [](const auto& a, const auto& b) {
        return a.value("timeMs").toDouble() < b.value("timeMs").toDouble();
    });
    QJsonArray out;
    for (const auto& point : sorted) { out.append(point); }
    return out;
}
double sectionLaneValue(const QJsonArray& points, double at) {
    if (points.isEmpty()) { return 0; }
    auto previous = points.first().toObject();
    for (const auto& value : points) {
        const auto point = value.toObject();
        const double time = point.value("timeMs").toDouble();
        if (time <= at) { previous = point; continue; }
        const double from = previous.value("timeMs").toDouble();
        if (at <= from) { return previous.value("value").toDouble(); }
        const double t = (at - from) / (time - from);
        return previous.value("value").toDouble() + (point.value("value").toDouble() - previous.value("value").toDouble()) *
            nt::scene::ease(point.value("easing").toString("linear").toStdString(), t);
    }
    return previous.value("value").toDouble();
}
QJsonArray sectionLanePiece(const QJsonArray& points, double from, double to) {
    QJsonArray out{QJsonObject{{"timeMs", from}, {"value", sectionLaneValue(points, from)}}};
    if (points.isEmpty()) { return out; }
    const auto first = points.first().toObject();
    const double firstTime = first.value("timeMs").toDouble();
    if (firstTime > from + SECTION_EPS && firstTime <= to + SECTION_EPS) {
        out.append(QJsonObject{{"timeMs", firstTime}, {"value", first.value("value")}});
    }
    for (qsizetype i = 0; i + 1 < points.size(); ++i) {
        const auto a = points[i].toObject();
        const auto b = points[i + 1].toObject();
        const double start = a.value("timeMs").toDouble();
        const double span = b.value("timeMs").toDouble() - start;
        if (span <= SECTION_EPS) { continue; }
        const double lo = std::max(start, from);
        const double hi = std::min(start + span, to);
        if (hi <= lo + SECTION_EPS) { continue; }
        const double u0 = (lo - start) / span;
        const double u1 = (hi - start) / span;
        const auto easing = b.value("easing").toString("linear");
        const bool whole = u0 <= SECTION_EPS && u1 >= 1 - SECTION_EPS;
        const bool keep = whole || easing == u"linear" || easing == u"hold" ||
            (easing == u"easeIn" && u0 <= SECTION_EPS) || (easing == u"easeOut" && u1 >= 1 - SECTION_EPS);
        const auto at = [&](double u) {
            return u >= 1 - SECTION_EPS ? b.value("value").toDouble() : a.value("value").toDouble() +
                (b.value("value").toDouble() - a.value("value").toDouble()) * nt::scene::ease(easing.toStdString(), u);
        };
        if (!keep) {
            for (int k = 1; k < 16; ++k) {
                const double u = u0 + (u1 - u0) * k / 16;
                out.append(QJsonObject{{"timeMs", start + u * span}, {"value", at(u)}});
            }
        }
        QJsonObject end{{"timeMs", hi}, {"value", at(u1)}};
        if (keep && easing != u"linear" && (easing != u"hold" || u1 >= 1 - SECTION_EPS)) { end.insert("easing", easing); }
        out.append(end);
    }
    if (out.last().toObject().value("timeMs").toDouble() < to - SECTION_EPS) {
        out.append(QJsonObject{{"timeMs", to}, {"value", sectionLaneValue(points, to)}});
    }
    return out;
}
QJsonArray sectionShiftPoints(const QJsonArray& points, double by) {
    QJsonArray result;
    for (const auto& value : points) {
        auto point = value.toObject();
        point.insert("timeMs", std::max(0.0, point.value("timeMs").toDouble() + by));
        result.append(point);
    }
    return result;
}
QJsonArray sectionLaneInsert(const QJsonArray& source, double at, double length) {
    const auto points = sectionSortedPoints(source);
    bool before = false;
    bool after = false;
    QJsonArray shifted;
    for (const auto& value : points) {
        auto point = value.toObject();
        const double time = point.value("timeMs").toDouble();
        before = before || time < at - SECTION_EPS;
        after = after || time >= at - SECTION_EPS;
        if (time >= at - SECTION_EPS) { point.insert("timeMs", time + length); }
        shifted.append(point);
    }
    if (!before || !after) { return shifted; }
    auto result = sectionLanePiece(points, points.first().toObject().value("timeMs").toDouble(), at);
    const auto tail = sectionShiftPoints(sectionLanePiece(points, at, std::max(at, points.last().toObject().value("timeMs").toDouble())), length);
    for (const auto& point : tail) { result.append(point); }
    return result;
}
QJsonObject sectionInsert(QJsonObject raw, double at, double length, const std::optional<IdSet>& tracks) {
    auto clips = raw.value("clips").toArray();
    for (const auto& value : clips) {
        const auto clip = value.toObject();
        if (sectionOnTrack(clip, tracks) && sectionLocked(raw, clip) && clipStartMs(clip) < at - SECTION_EPS && clipEndMs(clip) > at + SECTION_EPS) {
            throw OpError(("The insertion cuts locked clip: " + clip.value("name").toString() + " (" + clipId(clip) + ")").toStdString());
        }
    }
    auto media = raw.value("mediaTracks").toArray();
    clips = sectionCut(clips, at, tracks, sectionBpm(raw), media, QStringLiteral("shorten"), raw.value("tempo").toObject().value("offsetMs").toDouble());
    if (raw.contains("mediaTracks")) { raw.insert("mediaTracks", media); }
    for (qsizetype i = 0; i < clips.size(); ++i) {
        auto clip = clips[i].toObject();
        if (!sectionOnTrack(clip, tracks)) { continue; }
        if (clipStartMs(clip) >= at - SECTION_EPS) { clip.insert("startMs", clipStartMs(clip) + length); }
        else if (isGroupClip(clip) && clipEndMs(clip) > at + SECTION_EPS) { clip.insert("durationMs", clipDurationMs(clip) + length); }
        clips[i] = clip;
    }
    raw.insert("clips", clips);
    if (!tracks) {
        auto markers = raw.value("markers").toArray();
        for (qsizetype i = 0; i < markers.size(); ++i) {
            auto marker = markers[i].toObject();
            const double time = marker.value("timeMs").toDouble();
            if (time >= at - SECTION_EPS) { marker.insert("timeMs", time + length); }
            else if (marker.value("durationMs").toDouble() > 0 && time + marker.value("durationMs").toDouble() > at + SECTION_EPS) {
                marker.insert("durationMs", marker.value("durationMs").toDouble() + length);
            }
            markers[i] = marker;
        }
        if (raw.contains("markers")) { raw.insert("markers", markers); }
    }
    const double ticksPerMs = sectionBpm(raw) * 960 / 60000;
    const double atTick = std::floor((at - raw.value("tempo").toObject().value("offsetMs").toDouble()) * ticksPerMs + 0.5);
    const double lenTick = std::max(1.0, std::floor(length * ticksPerMs + 0.5));
    auto trackList = raw.value("tracks").toArray();
    for (qsizetype i = 0; i < trackList.size(); ++i) {
        auto track = trackList[i].toObject();
        if (tracks && !tracks->contains(track.value("id").toString())) { continue; }
        QJsonArray chords;
        for (const auto& value : track.value("chords").toArray()) {
            auto chord = value.toObject();
            const double start = chord.value("startTick").toDouble();
            const double end = start + chord.value("durationTick").toDouble();
            if (start >= atTick) { chord.insert("startTick", start + lenTick); }
            else if (end > atTick) {
                auto right = chord;
                chord.insert("durationTick", atTick - start);
                chords.append(chord);
                right.insert("id", newId());
                right.insert("startTick", atTick + lenTick);
                right.insert("durationTick", end - atTick);
                chords.append(right);
                continue;
            }
            chords.append(chord);
        }
        if (track.contains("chords")) { track.insert("chords", chords); }
        auto automation = track.value("automation").toArray();
        for (qsizetype j = 0; j < automation.size(); ++j) {
            auto lane = automation[j].toObject();
            lane.insert("points", sectionLaneInsert(lane.value("points").toArray(), at, length));
            automation[j] = lane;
        }
        if (track.contains("automation")) { track.insert("automation", automation); }
        trackList[i] = track;
    }
    raw.insert("tracks", trackList);
    return raw;
}
QJsonArray sectionLaneDelete(const QJsonArray& source, double from, double to) {
    const auto points = sectionSortedPoints(source);
    if (points.isEmpty()) { return points; }
    bool before = false;
    bool after = false;
    QJsonArray kept;
    for (const auto& value : points) {
        auto point = value.toObject();
        const double time = point.value("timeMs").toDouble();
        before = before || time < to - SECTION_EPS;
        after = after || time >= from - SECTION_EPS;
        if (time < from - SECTION_EPS) { kept.append(point); }
        else if (time >= to - SECTION_EPS) {
            point.insert("timeMs", std::max(0.0, time - (to - from)));
            kept.append(point);
        }
    }
    if (!before || !after) { return kept; }
    const double first = points.first().toObject().value("timeMs").toDouble();
    const double last = points.last().toObject().value("timeMs").toDouble();
    const double vFrom = sectionLaneValue(points, from);
    const double vTo = sectionLaneValue(points, to);
    auto left = from > first + SECTION_EPS ? sectionLanePiece(points, first, from) :
        QJsonArray{QJsonObject{{"timeMs", from}, {"value", vFrom}}};
    const bool same = std::abs(vFrom - vTo) <= 1e-9;
    if (to <= last + SECTION_EPS) {
        const auto right = sectionShiftPoints(sectionLanePiece(points, to, last), from - to);
        for (qsizetype i = same ? 1 : 0; i < right.size(); ++i) { left.append(right[i]); }
    } else if (!same) { left.append(QJsonObject{{"timeMs", from}, {"value", vTo}}); }
    return left;
}
QJsonObject sectionDelete(QJsonObject raw, double from, double to, const std::optional<IdSet>& tracks) {
    const double length = to - from;
    auto clips = raw.value("clips").toArray();
    QStringList locked;
    for (const auto& value : clips) {
        const auto clip = value.toObject();
        if (sectionOnTrack(clip, tracks) && sectionLocked(raw, clip) && clipStartMs(clip) < to - SECTION_EPS && clipEndMs(clip) > from + SECTION_EPS) {
            locked.append(clip.value("name").toString() + " (" + clipId(clip) + ")");
        }
    }
    if (!locked.isEmpty()) { throw OpError(("The range cuts or removes locked clips: " + locked.join(", ")).toStdString()); }
    const double ticksPerMs = sectionBpm(raw) * 960 / 60000;
    const double oldOrigin = raw.value("tempo").toObject().value("offsetMs").toDouble();
    const double fromTick = std::floor((from - oldOrigin) * ticksPerMs + 0.5);
    const double lenTick = std::max(1.0, std::floor(length * ticksPerMs + 0.5));
    const double toTick = fromTick + lenTick;
    for (const auto& value : raw.value("tracks").toArray()) {
        const auto track = value.toObject();
        if (tracks && !tracks->contains(track.value("id").toString())) { continue; }
        bool affected = false;
        for (const auto& item : track.value("chords").toArray()) {
            const auto chord = item.toObject();
            const double start = chord.value("startTick").toDouble();
            const double end = start + chord.value("durationTick").toDouble();
            affected |= start < toTick && end > fromTick;
            if (tracks && oldOrigin > from + SECTION_EPS && end > fromTick) {
                const double nextStart = start >= toTick ? start - lenTick : std::min(start, fromTick);
                const bool keeps = start >= toTick || (end > toTick ? end - lenTick : fromTick) > nextStart;
                if (keeps && nextStart < 0) { throw OpError("The range starts before beat one and would move chords before it"); }
            }
        }
        for (const auto& item : track.value("automation").toArray()) {
            bool before = false;
            bool after = false;
            for (const auto& point : item.toObject().value("points").toArray()) {
                const double at = point.toObject().value("timeMs").toDouble();
                affected |= at >= from - SECTION_EPS && at < to - SECTION_EPS;
                before |= at < from - SECTION_EPS;
                after |= at >= to - SECTION_EPS;
            }
            affected |= before && after;
        }
        if (affected && track.value("locked").toBool()) { throw OpError(("The range holds chords or automation on locked tracks: " + track.value("name").toString()).toStdString()); }
    }
    double originShiftTicks = 0;
    if (!tracks && oldOrigin > from + SECTION_EPS) {
        const double origin = oldOrigin >= to - SECTION_EPS ? oldOrigin - length : from;
        originShiftTicks = std::floor((oldOrigin - origin) * ticksPerMs + 0.5);
        auto tempo = raw.value("tempo").toObject();
        tempo.insert("offsetMs", origin);
        raw.insert("tempo", tempo);
    }
    auto media = raw.value("mediaTracks").toArray();
    clips = sectionCut(clips, from, tracks, sectionBpm(raw), media, QStringLiteral("shorten"), oldOrigin);
    clips = sectionCut(clips, to, tracks, sectionBpm(raw), media, QStringLiteral("shorten"), oldOrigin);
    QJsonArray kept;
    for (const auto& value : clips) {
        auto clip = value.toObject();
        if (sectionOnTrack(clip, tracks) && clipEndMs(clip) > from + SECTION_EPS) {
            const double start = clipStartMs(clip);
            const double end = clipEndMs(clip);
            if (start >= to - SECTION_EPS) { clip.insert("startMs", std::max(0.0, start - length)); }
            else if (isGroupClip(clip)) {
                const double nextStart = std::min(start, from);
                const double nextEnd = end > to ? end - length : from;
                if (nextEnd <= nextStart + SECTION_EPS) { continue; }
                clip.insert("startMs", nextStart);
                clip.insert("durationMs", nextEnd - nextStart);
            } else { continue; }
        }
        kept.append(clip);
    }
    IdSet remaining;
    for (const auto& value : kept) { remaining.insert(clipId(value.toObject())); }
    IdSet removedMedia;
    QJsonArray keptMedia;
    for (const auto& value : media) {
        const auto track = value.toObject();
        if (remaining.contains(track.value("clipId").toString())) { keptMedia.append(track); }
        else { removedMedia.insert(track.value("id").toString()); }
    }
    for (qsizetype i = 0; i < kept.size(); ++i) {
        auto clip = kept[i].toObject();
        if (removedMedia.contains(clip.value("trackBinding").toObject().value("trackId").toString())) { clip.remove(QStringLiteral("trackBinding")); kept[i] = clip; }
    }
    if (raw.contains("mediaTracks")) { raw.insert("mediaTracks", keptMedia); }
    IdSet removedLinks;
    for (const auto& value : clips) {
        const auto clip = value.toObject();
        if (!remaining.contains(clipId(clip)) && !clipLinkId(clip).isEmpty()) { removedLinks.insert(clipLinkId(clip)); }
    }
    raw.insert("clips", pruneSectionLinks(kept, removedLinks));
    if (!tracks && raw.contains("markers")) {
        QJsonArray markers;
        for (const auto& value : raw.value("markers").toArray()) {
            auto marker = value.toObject();
            const double start = marker.value("timeMs").toDouble();
            const double duration = marker.value("durationMs").toDouble();
            const double end = start + duration;
            if (start >= to - SECTION_EPS) { marker.insert("timeMs", std::max(0.0, start - length)); }
            else if (duration > 0 && end > from + SECTION_EPS) {
                const double nextStart = std::min(start, from);
                const double nextEnd = end > to ? end - length : from;
                if (nextEnd <= nextStart + SECTION_EPS) { continue; }
                marker.insert("timeMs", nextStart);
                marker.insert("durationMs", nextEnd - nextStart);
            } else if (duration == 0 && start >= from - SECTION_EPS) { continue; }
            markers.append(marker);
        }
        raw.insert("markers", markers);
    }
    auto trackList = raw.value("tracks").toArray();
    for (qsizetype i = 0; i < trackList.size(); ++i) {
        auto track = trackList[i].toObject();
        if (tracks && !tracks->contains(track.value("id").toString())) { continue; }
        QJsonArray chords;
        for (const auto& value : track.value("chords").toArray()) {
            auto chord = value.toObject();
            const double start = chord.value("startTick").toDouble();
            const double end = start + chord.value("durationTick").toDouble();
            if (end > fromTick) {
                if (start >= toTick) { chord.insert("startTick", std::max(0.0, start - lenTick + originShiftTicks)); }
                else {
                    const double nextStart = std::min(start, fromTick);
                    const double nextEnd = end > toTick ? end - lenTick : fromTick;
                    if (nextEnd <= nextStart) { continue; }
                    chord.insert("startTick", std::max(0.0, nextStart + originShiftTicks));
                    chord.insert("durationTick", nextEnd - nextStart);
                }
            }
            chords.append(chord);
        }
        if (track.contains("chords")) { track.insert("chords", chords); }
        auto automation = track.value("automation").toArray();
        for (qsizetype j = 0; j < automation.size(); ++j) {
            auto lane = automation[j].toObject();
            lane.insert("points", sectionLaneDelete(lane.value("points").toArray(), from, to));
            automation[j] = lane;
        }
        if (track.contains("automation")) { track.insert("automation", automation); }
        trackList[i] = track;
    }
    raw.insert("tracks", trackList);
    return raw;
}
QJsonObject sectionRead(const QJsonObject& raw, double from, double to, const std::optional<IdSet>& tracks) {
    QJsonArray clips;
    QJsonArray media;
    for (const auto& value : raw.value("clips").toArray()) {
        const auto original = value.toObject();
        if (!sectionOnTrack(original, tracks) || clipStartMs(original) >= to - SECTION_EPS || clipEndMs(original) <= from + SECTION_EPS) { continue; }
        const auto pieces = unrollMusicClip(original, sectionBpm(raw), raw.value("tempo").toObject().value("offsetMs").toDouble());
        for (const auto& piece : pieces) {
            auto clip = piece.toObject();
            if (clipStartMs(clip) >= to - SECTION_EPS || clipEndMs(clip) <= from + SECTION_EPS) { continue; }
            if (isGroupClip(clip)) {
                const double start = std::max(clipStartMs(clip), from);
                const double end = std::min(clipEndMs(clip), to);
                clip.insert("startMs", start);
                clip.insert("durationMs", end - start);
            } else {
                if (clipStartMs(clip) < from - SECTION_EPS) { clip = splitClip(clip, from, sectionBpm(raw), QStringLiteral("shorten"), raw.value("tempo").toObject().value("offsetMs").toDouble()).second; }
                if (clipEndMs(clip) > to + SECTION_EPS) { clip = splitClip(clip, to, sectionBpm(raw), QStringLiteral("shorten"), raw.value("tempo").toObject().value("offsetMs").toDouble()).first; }
            }
            const auto reframeId = clip.value("reframe").toObject().value("trackId").toString();
            for (const auto& resource : raw.value("mediaTracks").toArray()) {
                const auto track = resource.toObject();
                if (track.value("clipId").toString() != clipId(original)) { continue; }
                const auto sliced = nt::targeting::sliceMediaTrack(track, clip);
                media.append(sliced);
                if (track.value("id").toString() == reframeId) {
                    auto reframe = clip.value("reframe").toObject();
                    reframe.insert("trackId", sliced.value("id"));
                    clip.insert("reframe", reframe);
                }
            }
            clip.insert("startMs", clipStartMs(clip) - from);
            clip.insert("locked", false);
            clips.append(clip);
        }
    }
    QJsonArray markers;
    if (!tracks) {
        for (const auto& value : raw.value("markers").toArray()) {
            auto marker = value.toObject();
            const double start = marker.value("timeMs").toDouble();
            const double duration = marker.value("durationMs").toDouble();
            if (duration > 0) {
                const double lo = std::max(start, from);
                const double hi = std::min(start + duration, to);
                if (hi <= lo + SECTION_EPS) { continue; }
                marker.insert("timeMs", lo - from);
                marker.insert("durationMs", hi - lo);
            } else {
                if (start < from - SECTION_EPS || start >= to - SECTION_EPS) { continue; }
                marker.insert("timeMs", start - from);
            }
            markers.append(marker);
        }
    }
    QJsonArray chords;
    QJsonArray automation;
    const double ticksPerMs = sectionBpm(raw) * 960 / 60000;
    const double fromTick = std::floor((from - raw.value("tempo").toObject().value("offsetMs").toDouble()) * ticksPerMs + 0.5);
    const double toTick = fromTick + std::max(1.0, std::floor((to - from) * ticksPerMs + 0.5));
    for (const auto& value : raw.value("tracks").toArray()) {
        const auto track = value.toObject();
        const auto id = track.value("id").toString();
        if (tracks && !tracks->contains(id)) { continue; }
        QJsonArray kept;
        for (const auto& item : track.value("chords").toArray()) {
            auto chord = item.toObject();
            const double lo = std::max(chord.value("startTick").toDouble(), fromTick);
            const double hi = std::min(chord.value("startTick").toDouble() + chord.value("durationTick").toDouble(), toTick);
            if (hi > lo) {
                chord.insert("startTick", lo - fromTick);
                chord.insert("durationTick", hi - lo);
                kept.append(chord);
            }
        }
        if (!kept.isEmpty()) { chords.append(QJsonObject{{"trackId", id}, {"chords", kept}}); }
        for (const auto& item : track.value("automation").toArray()) {
            const auto lane = item.toObject();
            const auto points = sectionSortedPoints(lane.value("points").toArray());
            if (points.isEmpty() || points.first().toObject().value("timeMs").toDouble() >= to - SECTION_EPS) { continue; }
            QJsonObject entry{{"trackId", id}, {"laneId", lane.value("id")}, {"target", lane.value("target")},
                {"points", sectionShiftPoints(sectionLanePiece(points, from, to), -from)}};
            if (lane.value("enabled") == QJsonValue(false)) { entry.insert("enabled", false); }
            automation.append(entry);
        }
    }
    return {{"lengthMs", to - from}, {"clips", clips}, {"mediaTracks", media}, {"markers", markers}, {"chords", chords}, {"automation", automation}};
}
QJsonArray sectionLanePaste(const QJsonArray& source, double at, double length, const QJsonArray& window) {
    if (window.isEmpty()) { return source; }
    const auto points = sectionSortedPoints(source);
    QJsonArray left;
    QJsonArray right;
    if (!points.isEmpty()) {
        const double first = points.first().toObject().value("timeMs").toDouble();
        const double last = points.last().toObject().value("timeMs").toDouble();
        left = first < at - SECTION_EPS ? sectionLanePiece(points, first, at) :
            QJsonArray{QJsonObject{{"timeMs", at}, {"value", sectionLaneValue(points, at)}}};
        right = last >= at + length - SECTION_EPS ? sectionLanePiece(points, at + length, last) :
            QJsonArray{QJsonObject{{"timeMs", at + length}, {"value", sectionLaneValue(points, at + length)}}};
    }
    const auto middle = sectionShiftPoints(sectionSortedPoints(window), at);
    const bool sameLeft = !left.isEmpty() && std::abs(left.last().toObject().value("value").toDouble() - middle.first().toObject().value("value").toDouble()) <= 1e-9;
    for (qsizetype i = sameLeft ? 1 : 0; i < middle.size(); ++i) { left.append(middle[i]); }
    const bool sameRight = !right.isEmpty() && std::abs(right.first().toObject().value("value").toDouble() - middle.last().toObject().value("value").toDouble()) <= 1e-9;
    for (qsizetype i = sameRight ? 1 : 0; i < right.size(); ++i) { left.append(right[i]); }
    return left;
}
void sectionAssertReceivingWritable(const QJsonObject& raw, const QJsonObject& content) {
    IdSet receiving;
    for (const auto* key : {"clips", "chords", "automation"}) {
        for (const auto& value : content.value(QLatin1String(key)).toArray()) { receiving.insert(value.toObject().value("trackId").toString()); }
    }
    for (const auto& value : raw.value("tracks").toArray()) {
        const auto track = value.toObject();
        if (receiving.contains(track.value("id").toString()) && track.value("locked").toBool()) {
            throw OpError(("The copy would write into locked track: " + track.value("name").toString() + " (" + track.value("id").toString() + ")").toStdString());
        }
    }
}
QJsonObject sectionPlace(QJsonObject raw, const QJsonObject& content, double at) {
    IdSet existing;
    for (const auto& value : raw.value("tracks").toArray()) { existing.insert(value.toObject().value("id").toString()); }
    sectionAssertReceivingWritable(raw, content);
    auto clips = raw.value("clips").toArray();
    QHash<QString, QString> ids;
    QHash<QString, QString> links;
    QHash<QString, int> linkCounts;
    for (const auto& value : content.value("clips").toArray()) {
        const auto clip = value.toObject();
        if (existing.contains(clipTrackId(clip)) && !clipLinkId(clip).isEmpty()) { ++linkCounts[clipLinkId(clip)]; }
    }
    for (const auto& value : content.value("clips").toArray()) { ids.insert(value.toObject().value("id").toString(), newId()); }
    QHash<QString, QString> mediaIds;
    auto media = raw.value("mediaTracks").toArray();
    for (const auto& value : content.value("mediaTracks").toArray()) {
        auto track = value.toObject();
        const auto owner = track.value("clipId").toString();
        if (!ids.contains(owner)) { continue; }
        const auto id = newId();
        mediaIds.insert(track.value("id").toString(), id);
        track.insert("id", id);
        track.insert("clipId", ids.value(owner));
        media.append(track);
    }
    if (!media.isEmpty() || raw.contains("mediaTracks")) { raw.insert("mediaTracks", media); }
    for (const auto& value : content.value("clips").toArray()) {
        auto clip = value.toObject();
        if (!existing.contains(clipTrackId(clip))) { continue; }
        clip.insert("id", ids.value(clipId(clip)));
        clip.insert("startMs", at + clipStartMs(clip));
        clip.insert("locked", false);
        if (clip.contains("parentId")) {
            if (ids.contains(clip.value("parentId").toString())) { clip.insert("parentId", ids.value(clip.value("parentId").toString())); }
            else { clip.remove(QStringLiteral("parentId")); }
        }
        const auto link = clipLinkId(clip);
        if (!link.isEmpty() && linkCounts.value(link) >= 2) {
            if (!links.contains(link)) { links.insert(link, newId()); }
            clip.insert("linkId", links.value(link));
        } else { clip.remove(QStringLiteral("linkId")); }
        for (const auto* key : {"reframe", "trackBinding"}) {
            auto binding = clip.value(QLatin1String(key)).toObject();
            const auto id = binding.value("trackId").toString();
            if (mediaIds.contains(id)) { binding.insert("trackId", mediaIds.value(id)); clip.insert(QLatin1String(key), binding); }
        }
        auto notes = clip.value("notes").toArray();
        for (qsizetype i = 0; i < notes.size(); ++i) { auto note = notes[i].toObject(); note.insert("id", newId()); notes[i] = note; }
        if (clip.contains("notes")) { clip.insert("notes", notes); }
        clips.append(clip);
    }
    raw.insert("clips", clips);
    auto markers = raw.value("markers").toArray();
    for (const auto& value : content.value("markers").toArray()) {
        auto marker = value.toObject();
        marker.insert("id", newId());
        marker.insert("timeMs", at + marker.value("timeMs").toDouble());
        markers.append(marker);
    }
    if (!markers.isEmpty() || raw.contains("markers")) { raw.insert("markers", markers); }
    auto tracks = raw.value("tracks").toArray();
    const double atTick = std::floor((at - raw.value("tempo").toObject().value("offsetMs").toDouble()) * sectionBpm(raw) * 960 / 60000 + 0.5);
    for (qsizetype i = 0; i < tracks.size(); ++i) {
        auto track = tracks[i].toObject();
        const auto id = track.value("id");
        auto chords = track.value("chords").toArray();
        for (const auto& value : content.value("chords").toArray()) {
            const auto entry = value.toObject();
            if (entry.value("trackId") != id) { continue; }
            for (const auto& item : entry.value("chords").toArray()) {
                auto chord = item.toObject();
                chord.insert("id", newId());
                chord.insert("startTick", atTick + chord.value("startTick").toDouble());
                chords.append(chord);
            }
        }
        if (!chords.isEmpty() || track.contains("chords")) { track.insert("chords", chords); }
        auto lanes = track.value("automation").toArray();
        for (const auto& value : content.value("automation").toArray()) {
            const auto entry = value.toObject();
            if (entry.value("trackId") != id) { continue; }
            qsizetype index = -1;
            for (qsizetype j = 0; j < lanes.size(); ++j) {
                const auto lane = lanes[j].toObject();
                if (lane.value("id") == entry.value("laneId") || lane.value("target") == entry.value("target")) { index = j; break; }
            }
            QJsonObject lane = index < 0 ? QJsonObject{{"id", newId()}, {"target", entry.value("target")}} : lanes[index].toObject();
            if (index < 0 && entry.value("enabled") == QJsonValue(false)) { lane.insert("enabled", false); }
            lane.insert("points", sectionLanePaste(lane.value("points").toArray(), at, content.value("lengthMs").toDouble(), entry.value("points").toArray()));
            if (index < 0) { lanes.append(lane); } else { lanes[index] = lane; }
        }
        if (!lanes.isEmpty() || track.contains("automation")) { track.insert("automation", lanes); }
        tracks[i] = track;
    }
    raw.insert("tracks", tracks);
    return raw;
}
std::pair<double, double> sectionRange(const QJsonObject& raw, const QJsonObject& p) {
    const bool bars = p.contains("fromBar") || p.contains("toBar");
    const bool ms = p.contains("fromMs") || p.contains("toMs");
    if (bars && ms) { throw OpError("Send fromBar and toBar, or fromMs and toMs, not both"); }
    const double from = sectionTime(raw, p, "fromBar", "fromMs");
    const double to = sectionTime(raw, p, "toBar", "toMs");
    if (to <= from + SECTION_EPS) { throw OpError("The range must end after it starts"); }
    return {from, to};
}
} // namespace

namespace {
QJsonObject encloseSectionGroups(const QJsonObject& before, QJsonObject after) {
    QHash<QString, QJsonObject> originals;
    QHash<QString, bool> eligible;
    for (const auto& value : before.value("clips").toArray()) {
        const auto clip = value.toObject();
        originals.insert(clipId(clip), clip);
        if (isGroupClip(clip)) { eligible.insert(clipId(clip), true); }
    }
    for (const auto& value : before.value("clips").toArray()) {
        const auto child = value.toObject();
        const auto parentId = child.value("parentId").toString();
        if (!eligible.contains(parentId)) { continue; }
        const auto parent = originals.value(parentId);
        if (clipStartMs(child) < clipStartMs(parent) - SECTION_EPS || clipEndMs(child) > clipEndMs(parent) + SECTION_EPS) { eligible[parentId] = false; }
    }
    auto clips = after.value("clips").toArray();
    QHash<QString, qsizetype> indices;
    QHash<QString, int> pending;
    for (qsizetype i = 0; i < clips.size(); ++i) { indices.insert(clipId(clips[i].toObject()), i); }
    for (const auto& value : clips) {
        const auto parent = value.toObject().value("parentId").toString();
        if (indices.contains(parent)) { ++pending[parent]; }
    }
    std::vector<qsizetype> queue;
    for (qsizetype i = 0; i < clips.size(); ++i) { if (pending.value(clipId(clips[i].toObject())) == 0) { queue.push_back(i); } }
    for (size_t q = 0; q < queue.size(); ++q) {
        const auto child = clips[queue[q]].toObject();
        const auto parentId = child.value("parentId").toString();
        if (!indices.contains(parentId)) { continue; }
        const auto i = indices.value(parentId);
        auto parent = clips[i].toObject();
        if (eligible.value(parentId)) {
            const double start = std::min(clipStartMs(parent), clipStartMs(child));
            const double end = std::max(clipEndMs(parent), clipEndMs(child));
            parent.insert("startMs", start);
            parent.insert("durationMs", end - start);
            clips[i] = parent;
        }
        if (--pending[parentId] == 0) { queue.push_back(i); }
    }
    after.insert("clips", clips);
    return after;
}
}
QJsonObject expandMusicLoops(QJsonObject raw) {
    QJsonArray clips;
    for (const auto& value : raw.value("clips").toArray()) {
        for (const auto& copy : unrollMusicClip(value.toObject(), sectionBpm(raw), raw.value("tempo").toObject().value("offsetMs").toDouble())) { clips.append(copy); }
    }
    raw.insert("clips", clips);
    return raw;
}
double resolveMusicTime(const QJsonObject& raw, const QJsonObject& payload, const QString& msKey) {
    return sectionTime(raw, payload, "atBar", msKey);
}
QJsonObject readSectionContent(const QJsonObject& raw, const QJsonObject& payload) {
    const auto [from, to] = sectionRange(raw, payload);
    return sectionRead(raw, from, to, sectionTracks(raw, payload));
}
QJsonObject applyMusicClipEdit(QJsonObject raw, const QString& operation, const QJsonObject& p) {
    if (operation == u"set_tempo") {
        auto tempo = raw.value("tempo").isObject() ? raw.value("tempo").toObject() : QJsonObject{
            {"bpm", 120}, {"offsetMs", 0}, {"timeSignature", QJsonObject{{"beatsPerBar", 4}, {"beatUnit", 4}}}};
        const auto previous = tempo;
        auto signature = tempo.value("timeSignature").toObject();
        bool hasTempo = false;
        for (const auto* key : {"bpm", "offset_ms", "beats_per_bar", "beat_unit"}) {
            if (!p.contains(QLatin1String(key))) { continue; }
            const auto value = p.value(QLatin1String(key)); const double n = value.toDouble(-1);
            const bool integer = QLatin1String(key) == u"beats_per_bar" || QLatin1String(key) == u"beat_unit";
            if (!value.isDouble() || !std::isfinite(n) || (QLatin1String(key) == u"offset_ms" ? n < 0 : n <= 0) || (integer && std::floor(n) != n)) { throw OpError("Invalid tempo parameter"); }
            if (QLatin1String(key) == u"bpm") { tempo.insert("bpm", value); }
            else if (QLatin1String(key) == u"offset_ms") { tempo.insert("offsetMs", value); }
            else { signature.insert(QLatin1String(key) == u"beats_per_bar" ? "beatsPerBar" : "beatUnit", value); }
            hasTempo = true;
        }
        tempo.insert("timeSignature", signature);
        if (p.contains("key")) {
            const auto value = p.value("key");
            if (value.isNull()) { tempo.remove("key"); }
            else {
                const auto key = value.toObject(); const auto tonic = key.value("tonic").toString().toStdString(); const auto mode = key.value("mode").toString();
                if (!value.isObject() || std::ranges::find(nt::music::kMusicKeyTonics, tonic) == nt::music::kMusicKeyTonics.end() || (mode != u"major" && mode != u"minor")) { throw OpError("Invalid project key"); }
                tempo.insert("key", key);
            }
            hasTempo = true;
        }
        if (!hasTempo && !p.contains("auto_crossfade_ms")) { throw OpError("Send a tempo field or auto_crossfade_ms"); }
        if (const auto reason = nt::music::tempoChangeRefusal(raw, tempo); !reason.isEmpty()) { throw OpError(reason.toStdString()); }
        if (p.contains("auto_crossfade_ms")) {
            raw = applyMusicClipEdit(std::move(raw), QStringLiteral("music.setAutoCrossfade"), {{"autoCrossfadeMs", p.value("auto_crossfade_ms")}});
        }
        if (hasTempo) {
            const double scale = previous.value("bpm").toDouble(120) / tempo.value("bpm").toDouble(120);
            const double origin = previous.value("offsetMs").toDouble(); const double nextOrigin = tempo.value("offsetMs").toDouble();
            if (scale != 1 || origin != nextOrigin) {
                IdSet midiTracks;
                for (const auto& value : raw.value("tracks").toArray()) { const auto track = value.toObject(); if (track.value("type").toString() == u"midi") { midiTracks.insert(track.value("id").toString()); } }
                auto clips = raw.value("clips").toArray();
                for (qsizetype i = 0; i < clips.size(); ++i) {
                    auto clip = clips[i].toObject();
                    if (clip.value("mediaType").toString() != u"midi" && !midiTracks.contains(clipTrackId(clip))) { continue; }
                    clip.insert("startMs", nextOrigin + (clipStartMs(clip) - origin) * scale);
                    clip.insert("durationMs", clipDurationMs(clip) * scale);
                    for (const auto* key : {"loopLengthMs", "inPointMs", "outPointMs"}) { if (clip.contains(QLatin1String(key))) { clip.insert(QLatin1String(key), clip.value(QLatin1String(key)).toDouble() * scale); } }
                    if (clipStartMs(clip) < 0) {
                        const double overhang = -clipStartMs(clip); clip.insert("startMs", 0);
                        clip.insert("durationMs", std::max(1.0, clipDurationMs(clip) - overhang));
                        clip.insert("inPointMs", clip.value("inPointMs").toDouble() + overhang);
                    }
                    clips[i] = clip;
                }
                raw.insert("clips", clips);
            }
            raw.insert("tempo", tempo);
        }
        return raw;
    }
    if (operation == u"music.setAutoCrossfade") {
        const auto value = p.value("autoCrossfadeMs");
        if (!raw.value("music").isObject()) { throw OpError("Automatic crossfade requires a music project"); }
        if (!value.isDouble() || !std::isfinite(value.toDouble()) || value.toDouble() < 0 || value.toDouble() > 1000) {
            throw OpError("autoCrossfadeMs must be from 0 to 1000");
        }
        auto music = raw.value("music").toObject(); music.insert("autoCrossfadeMs", value); raw.insert("music", music);
        return raw;
    }
    if (operation == u"set_clip_params") {
        const auto sourceLimit = p.value("maxSourceDurationMs");
        if (!sourceLimit.isUndefined() && (!finiteNumber(sourceLimit) || sourceLimit.toDouble() <= 0)) {
            throw OpError("maxSourceDurationMs must be finite and positive");
        }
        auto clips = raw.value("clips").toArray();
        const auto target = musicResourceId(clips, p.value("clipId").toString(p.value("target").toString()), "clip");
        auto patch = p.contains("patch") ? p.value("patch").toObject() : p;
        patch.remove("linked");
        patch.remove("maxSourceDurationMs");
        for (qsizetype i = 0; i < clips.size(); ++i) {
            auto c = clips[i].toObject();
            if (clipId(c) != target) { continue; }
            auto lockProbe = c;
            auto statePatch = patch;
            statePatch.remove("clipId");
            statePatch.remove("target");
            if (statePatch.size() == 1 && statePatch.value("locked") == QJsonValue(false)) {
                lockProbe.insert("locked", false);
            }
            if (sectionLocked(raw, lockProbe)) { throw OpError("Unlock the clip first"); }
            for (auto it = patch.begin(); it != patch.end(); ++it) {
                const auto key = it.key(); const auto value = it.value();
                if (key == u"clipId" || key == u"target") { continue; }
                if (key == u"name" || key == u"labelColor") {
                    if (!value.isString() && !(key == u"labelColor" && value.isNull())) { throw OpError("Name and label color must be text"); }
                    if (key == u"labelColor" && value.isString() && (value.toString().isEmpty() || value.toString().size() > 64)) {
                        throw OpError("Label color must contain 1 to 64 characters");
                    }
                } else if (key == u"transpose" || key == u"velocityOffset" || key == u"quantize") {
                    if (c.value("mediaType").toString() != u"midi") { throw OpError("Region parameters require a MIDI clip"); }
                    if (!value.isNull()) {
                        if (key == u"quantize") {
                            const auto q = value.toObject();
                            const QStringList grids{"1/4", "1/8", "1/16", "1/32", "1/8T", "1/16T"};
                            if (!value.isObject() || q.size() != 2 || !grids.contains(q.value("grid").toString()) ||
                                !q.value("strength").isDouble() || !std::isfinite(q.value("strength").toDouble()) ||
                                q.value("strength").toDouble() < 0 || q.value("strength").toDouble() > 100) { throw OpError("Invalid region quantize"); }
                        } else {
                            const double n = value.toDouble(); const int limit = key == u"transpose" ? 48 : 127;
                            if (!value.isDouble() || !std::isfinite(n) || std::floor(n) != n || std::abs(n) > limit) { throw OpError("Invalid MIDI region parameter"); }
                        }
                    }
                } else if (key == u"startMs" || key == u"durationMs" || key == u"inPointMs" || key == u"outPointMs") {
                    if (!value.isDouble() || !std::isfinite(value.toDouble()) || value.toDouble() < 0 ||
                        (key == u"durationMs" && value.toDouble() == 0)) { throw OpError("Invalid clip timing"); }
                    continue;
                } else if (key == u"trackId") {
                    if (!value.isString()) { throw OpError("trackId must be a track id"); }
                    continue;
                } else if (key == u"shapeStyle") {
                    if (!value.isObject() || !value.toObject().value("kind").isString()) { throw OpError("shapeStyle requires a kind"); }
                    auto style = value.toObject();
                    validateStyleFields(style, {"strokeWidthPx", "x", "y", "width", "height", "x2", "y2", "sides", "innerRadius", "cornerRadius", "trimStart", "trimEnd"},
                        {"kind", "stroke", "d", "lineCap", "lineJoin"});
                    if (!QStringList{"rect", "ellipse", "line", "polygon", "star", "path"}.contains(style.value("kind").toString())) { throw OpError("Invalid shape kind"); }
                    if (style.contains("lineCap") && !QStringList{"butt", "round", "square"}.contains(style.value("lineCap").toString())) { throw OpError("Invalid shape line cap"); }
                    if (style.contains("lineJoin") && !QStringList{"miter", "round", "bevel"}.contains(style.value("lineJoin").toString())) { throw OpError("Invalid shape line join"); }
                    for (const auto* field : {"strokeWidthPx", "cornerRadius", "width", "height"}) { validateStyleRange(style, QLatin1String(field), 0); }
                    for (const auto* field : {"innerRadius", "trimStart", "trimEnd"}) { validateStyleRange(style, QLatin1String(field), 0, 1); }
                    validateStyleRange(style, "sides", 3, static_cast<double>(std::numeric_limits<int>::max()) / 2);
                    if (style.contains("sides") && std::floor(style.value("sides").toDouble()) != style.value("sides").toDouble()) { throw OpError("Shape sides must be an integer"); }
                    if (style.contains("fill") && !style.value("fill").isString()) { validateStyleFill(style.value("fill")); }
                    validateStyleFill(style.value("fillStyle"));
                    if (style.contains("dash")) {
                        if (!style.value("dash").isArray()) { throw OpError("Shape dash must be an array"); }
                        for (const auto& dash : style.value("dash").toArray()) { if (!finiteNumber(dash) || dash.toDouble() < 0) { throw OpError("Shape dash must contain numbers"); } }
                    }
                    if (style.value("kind").toString() == u"line") {
                        if (!style.contains("stroke")) { style.insert("stroke", "#FFFFFF"); }
                        if (!style.contains("strokeWidthPx")) { style.insert("strokeWidthPx", 8); }
                    } else if (!style.contains("fill") && !style.contains("fillStyle") && !style.contains("stroke")) {
                        style.insert("fill", "#FFFFFF");
                    } else if (style.contains("stroke") && !style.contains("strokeWidthPx")) { style.insert("strokeWidthPx", 8); }
                    c.insert("shapeStyle", style);
                    continue;
                } else if (key == u"captionStyle") {
                    if (!value.isObject() || !c.value("caption").isObject()) { throw OpError("Clip carries no caption to style"); }
                    auto style = c.value("caption").toObject().value("style").toObject();
                    const auto update = value.toObject();
                    for (auto field = update.begin(); field != update.end(); ++field) { style.insert(field.key(), field.value()); }
                    validateFontFamily(update.value("fontFamily"));
                    validateStyleRange(update, "fontSizeFrac", 0, 1, true);
                    validateStyleRange(update, "bottomMarginFrac", 0, 1);
                    validateStyleFields(update, {"fontSizeFrac", "bottomMarginFrac"}, {"fontFamily", "color", "activeColor"});
                    validateStyleDecoration(update.value("outline"), {"widthPx"});
                    validateStyleDecoration(update.value("background"), {"paddingPx"});
                    auto caption = c.value("caption").toObject();
                    caption.insert("style", style);
                    c.insert("caption", caption);
                    continue;
                } else if (key == u"fontSizePx") {
                    if (!finiteNumber(value) || value.toDouble() <= 0) { throw OpError("fontSizePx must be positive and finite"); }
                    continue;
                } else if (key == u"textStyle") {
                    if (!value.isObject()) { throw OpError("textStyle must be an object"); }
                    continue;
                } else if (key == u"blendMode") {
                    if (!value.isNull() && (!value.isString() || !QStringList{"normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "add"}.contains(value.toString()))) { throw OpError("Invalid blendMode"); }
                } else if (key == u"borderRadius") {
                    if (!finiteNumber(value) || value.toDouble() < 0) { throw OpError("borderRadius must be nonnegative and finite"); }
                } else if (key == u"crop") {
                    if (!value.isNull()) {
                        if (!value.isObject()) { throw OpError("crop must be an object or null"); }
                        const auto crop = value.toObject();
                        for (const auto* edge : {"left", "right", "top", "bottom"}) {
                            const auto n = crop.value(QLatin1String(edge));
                            if (!finiteNumber(n) || n.toDouble() < 0 || n.toDouble() > 1) { throw OpError("Crop insets must be numbers from 0 to 1"); }
                        }
                        if (crop.value("left").toDouble() + crop.value("right").toDouble() >= 1 - 1e-4 ||
                            crop.value("top").toDouble() + crop.value("bottom").toDouble() >= 1 - 1e-4) { throw OpError("Crop keeps no picture"); }
                    }
                } else if (key == u"transform") {
                    if (!value.isObject()) { throw OpError("transform must be an object"); }
                    auto transform = c.value("transform").toObject();
                    const auto change = value.toObject();
                    for (auto field = change.begin(); field != change.end(); ++field) {
                        if (field.key() == u"position" || field.key() == u"scale" || field.key() == u"anchor") { continue; }
                        if (!QStringList{"rotation", "rotationX", "rotationY", "perspective"}.contains(field.key()) || (!finiteNumber(field.value()) || (field.key() == u"perspective" && field.value().toDouble() <= 0))) { throw OpError("Invalid transform field"); }
                        transform.insert(field.key(), field.value());
                    }
                    for (const auto* field : {"position", "scale", "anchor"}) {
                        const auto name = QLatin1String(field);
                        const double fallback = name == u"scale" ? 1 : name == u"anchor" ? 0.5 : 0;
                        auto point = transform.value(name).toObject();
                        const auto update = change.value(name);
                        if (!update.isUndefined() && !update.isObject()) { throw OpError("Transform coordinates must be objects"); }
                        for (const auto* axis : {"x", "y"}) {
                            const auto key = QLatin1String(axis);
                            const auto n = update.toObject().value(key);
                            if (!n.isUndefined() && !finiteNumber(n)) { throw OpError("Transform coordinates must be numbers"); }
                            point.insert(key, n.isUndefined() ? point.value(key).toDouble(fallback) : n.toDouble());
                        }
                        transform.insert(name, point);
                    }
                    if (!transform.contains("rotation")) { transform.insert("rotation", 0); }
                    c.insert(key, transform);
                    continue;
                } else if (key == u"audioEffects") {
                    if (!value.isArray()) { throw OpError("audioEffects must be an array"); }
                    const QMap<QString, QStringList> fields{
                        {"gain", {"gainDb"}},
                        {"eq3", {"lowFreq", "lowGainDb", "midFreq", "midQ", "midGainDb", "highFreq", "highGainDb"}},
                        {"filter", {"frequency", "q"}},
                        {"compressor", {"thresholdDb", "ratio", "attackMs", "releaseMs", "kneeDb"}},
                        {"echo", {"delayMs", "feedback", "mix"}}, {"reverb", {"decaySec", "mix"}},
                        {"distortion", {"driveDb", "outputDb"}}};
                    const QMap<QString, std::pair<double, double>> bounds{
                        {"delayMs", {1, 5000}}, {"feedback", {0, 0.95}}, {"mix", {0, 1}},
                        {"decaySec", {0.05, 20}}, {"driveDb", {0, 60}}, {"outputDb", {-60, 24}}};
                    IdSet ids;
                    for (const auto& entry : value.toArray()) {
                        const auto effect = entry.toObject();
                        const auto type = effect.value("type").toString();
                        if (!entry.isObject() || !fields.contains(type) || !effect.value("id").isString() ||
                            !effect.value("enabled").isBool() || !ids.insert(effect.value("id").toString()).second) {
                            throw OpError("Invalid clip audio effect");
                        }
                        auto allowed = fields.value(type);
                        for (const auto& field : allowed) {
                            const auto number = effect.value(field);
                            if (!number.isDouble() || !std::isfinite(number.toDouble()) ||
                                (bounds.contains(field) && (number.toDouble() < bounds.value(field).first || number.toDouble() > bounds.value(field).second))) {
                                throw OpError(("Invalid audio effect field: " + field).toStdString());
                            }
                        }
                        if (type == u"filter") {
                            if (!QStringList{"lowpass", "highpass", "bandpass"}.contains(effect.value("mode").toString())) { throw OpError("Invalid filter mode"); }
                            allowed.append("mode");
                        }
                        allowed.append({"id", "type", "enabled"});
                        for (auto field = effect.begin(); field != effect.end(); ++field) {
                            if (!allowed.contains(field.key())) { throw OpError(("Unsupported audio effect field: " + field.key()).toStdString()); }
                        }
                    }
                } else if (key == u"speedMultiplier") {
                    if (!value.isDouble() || !std::isfinite(value.toDouble()) || value.toDouble() <= 0) { throw OpError("Speed must be positive"); }
                    const auto link = p.value("linked").toBool(true) ? clipLinkId(c) : QString();
                    for (const auto& memberValue : clips) {
                        const auto member = memberValue.toObject();
                        if (clipId(member) != target && (link.isEmpty() || clipLinkId(member) != link)) { continue; }
                        if (sectionLocked(raw, member) || isGroupClip(member) ||
                            !member.value("timeRemap").toObject().value("keyframes").toArray().isEmpty()) {
                            throw OpError("Speed requires unlocked clips without a group or time remap");
                        }
                    }
                    continue;
                } else if (key == u"volumeDb" || key == u"fadeInMs" || key == u"fadeOutMs" || key == u"opacity") {
                    if (!value.isDouble() || !std::isfinite(value.toDouble()) || (key == u"opacity" && (value.toDouble() < 0 || value.toDouble() > 1))) { throw OpError("Invalid clip number"); }
                } else if (key == u"muted" || key == u"hidden" || key == u"locked") {
                    if (!value.isBool()) { throw OpError("Clip state must be boolean"); }
                    if (key == u"locked") { continue; }
                } else if (key == u"fadeInShape" || key == u"fadeOutShape") {
                    if (!QStringList{"linear", "sCurve", "plus3dB", "minus3dB"}.contains(value.toString())) { throw OpError("Invalid fade shape"); }
                } else { throw OpError(("Unsupported clip parameter: " + key).toStdString()); }
                if (value.isNull() || ((key == u"transpose" || key == u"velocityOffset") && value.toDouble() == 0)) { c.remove(key); } else { c.insert(key, value); }
            }
            if (patch.contains("textStyle") || patch.contains("fontSizePx")) {
                auto style = c.value("textStyle").toObject();
                auto update = patch.value("textStyle").toObject();
                if (patch.contains("fontSizePx") && update.isEmpty() && style.isEmpty()) { throw OpError("Clip carries no text to size"); }
                for (auto field = update.begin(); field != update.end(); ++field) {
                    if (field.value().isNull() && !QStringList{"text", "fontSizePx", "color"}.contains(field.key())) { style.remove(field.key()); }
                    else { style.insert(field.key(), field.value()); }
                }
                for (auto field = update.begin(); field != update.end();) {
                    if (field.value().isNull() && !QStringList{"text", "fontSizePx", "color"}.contains(field.key())) { field = update.erase(field); }
                    else { ++field; }
                }
                if (patch.contains("fontSizePx")) {
                    style.insert("fontSizePx", patch.value("fontSizePx"));
                    update.insert("fontSizePx", patch.value("fontSizePx"));
                }
                if (!style.contains("color")) { style.insert("color", "#FFFFFF"); }
                if (!style.value("text").isString() || !style.value("fontSizePx").isDouble() || !style.value("color").isString()) { throw OpError("Text style requires text, fontSizePx and color"); }
                const QStringList numbers{"fontSizePx", "fontWeight", "maxWidthFrac", "letterSpacingPx", "lineHeight"};
                const QStringList words{"text", "path", "fontFamily", "color", "fontStyle", "verticalAlign"};
                for (auto field = update.begin(); field != update.end(); ++field) {
                    if (numbers.contains(field.key()) && !finiteNumber(field.value())) { throw OpError("Text style field must be numeric"); }
                    if (words.contains(field.key()) && !field.value().isString()) { throw OpError("Text style field must be text"); }
                    if (field.key() == u"strikethrough" && !field.value().isBool()) { throw OpError("strikethrough must be boolean"); }
                    if (field.key() == u"align" && !QStringList{"left", "center", "right"}.contains(field.value().toString())) { throw OpError("Invalid text alignment"); }
                    if (QStringList{"stroke", "shadow", "background", "fill"}.contains(field.key()) && !field.value().isObject()) { throw OpError("Text decoration must be an object"); }
                }
                validateStyleDecoration(update.value("stroke"), {"widthPx"});
                validateStyleDecoration(update.value("shadow"), {"blurPx", "offsetX", "offsetY"});
                validateStyleDecoration(update.value("background"), {"paddingPx"});
                validateStyleFill(update.value("fill"));
                validateFontFamily(update.value("fontFamily"));
                for (const auto* field : {"fontSizePx", "fontWeight", "lineHeight"}) { validateStyleRange(update, QLatin1String(field), 0, std::numeric_limits<double>::infinity(), true); }
                validateStyleRange(update, "maxWidthFrac", 0, 1, true);
                if (update.contains("fontStyle") && !QStringList{"normal", "italic"}.contains(update.value("fontStyle").toString())) { throw OpError("Invalid font style"); }
                if (update.contains("verticalAlign") && !QStringList{"top", "middle", "bottom"}.contains(update.value("verticalAlign").toString())) { throw OpError("Invalid vertical alignment"); }
                c.insert("textStyle", style);
            }
            clips[i] = c;
            raw.insert("clips", clips);
            if (patch.contains("durationMs") || patch.contains("inPointMs") || patch.contains("outPointMs")) {
                const bool sourceEdit = patch.contains("inPointMs") || patch.contains("outPointMs");
                const auto link = p.value("linked").toBool(true) ? clipLinkId(c) : QString();
                const double deltaDuration = patch.contains("durationMs") ? patch.value("durationMs").toDouble() - clipDurationMs(c) : 0;
                const double ticksPerMs = sectionBpm(raw) * 960 / 60000;
                const auto effectiveIn = [ticksPerMs](const QJsonObject& member) {
                    return member.value("inPointMs").toDouble() +
                        (member.value("pattern").isObject() ? member.value("patternPhaseTicks").toDouble() / ticksPerMs : 0);
                };
                const double sourceShiftMs = patch.contains("inPointMs")
                    ? (patch.value("inPointMs").toDouble() - effectiveIn(c)) / sourceRate(c) : 0;
                ClipList members;
                for (const auto& value : clips) { members.push_back(value.toObject()); }
                auto changed = clips;
                if (isGroupClip(c)) {
                    if (sourceEdit) { throw OpError("Groups carry no source media"); }
                    const auto unit = moveUnitIds(members, {target}, p.value("linked").toBool(true));
                    for (const auto& member : members) {
                        if (unit.count(clipId(member)) && sectionLocked(raw, member)) { throw OpError("Group trim requires unlocked clips and tracks"); }
                    }
                    auto trimmed = members;
                    // Trim linked roots by the same delta, and keep each group's descendants inside it.
                    for (size_t j = 0; j < members.size(); ++j) {
                        const auto& member = members[j];
                        if (clipId(member) != target && (link.isEmpty() || clipLinkId(member) != link)) { continue; }
                        if (trimmed[j] != member) { continue; }
                        if (isGroupClip(member)) { trimmed = groups::trimGroup(trimmed, clipId(member), "end", deltaDuration); }
                        else { trimmed[j] = trimClip(member, "end", deltaDuration); }
                    }
                    if (p.value("linked").toBool(true)) {
                        QHash<QString, std::vector<size_t>> byLink;
                        std::vector<size_t> pending;
                        IdSet propagated;
                        for (size_t j = 0; j < members.size(); ++j) {
                            if (!clipLinkId(members[j]).isEmpty()) { byLink[clipLinkId(members[j])].push_back(j); }
                            if (trimmed[j] != members[j]) { pending.push_back(j); }
                        }
                        // A child trimmed by the group carries its linked media with it too.
                        for (size_t cursor = 0; cursor < pending.size(); ++cursor) {
                            const auto index = pending[cursor];
                            const auto memberLink = clipLinkId(members[index]);
                            if (memberLink.isEmpty() || !propagated.insert(memberLink).second) { continue; }
                            const double headDelta = clipStartMs(members[index]) - clipStartMs(trimmed[index]);
                            const double tailDelta = clipEndMs(trimmed[index]) - clipEndMs(members[index]);
                            for (const auto peer : byLink.value(memberLink)) {
                                if (trimmed[peer] != members[peer]) { continue; }
                                if (isGroupClip(members[peer])) {
                                    const auto before = trimmed;
                                    if (headDelta != 0) { trimmed = groups::trimGroup(trimmed, clipId(members[peer]), "start", headDelta); }
                                    if (tailDelta != 0) { trimmed = groups::trimGroup(trimmed, clipId(members[peer]), "end", tailDelta); }
                                    for (size_t k = 0; k < trimmed.size(); ++k) {
                                        if (trimmed[k] != before[k]) { pending.push_back(k); }
                                    }
                                } else {
                                    if (headDelta != 0) { trimmed[peer] = trimClip(trimmed[peer], "start", headDelta); }
                                    if (tailDelta != 0) { trimmed[peer] = trimClip(trimmed[peer], "end", tailDelta); }
                                    pending.push_back(peer);
                                }
                            }
                        }
                    }
                    changed = {};
                    for (const auto& member : trimmed) {
                        if (unit.count(clipId(member)) && !sourceLimit.isUndefined() &&
                            outPointOf(member) > sourceLimit.toDouble() + SOURCE_BOUND_TOLERANCE_MS) {
                            throw OpError("Group trim exceeds source duration");
                        }
                        changed.append(member);
                    }
                } else {
                    for (qsizetype j = 0; j < changed.size(); ++j) {
                        auto member = changed[j].toObject();
                        const bool primary = clipId(member) == target;
                        if (!primary && (link.isEmpty() || clipLinkId(member) != link ||
                            (!patch.contains("inPointMs") && !patch.contains("durationMs")))) { continue; }
                        if (sectionLocked(raw, member) || isGroupClip(member)) { throw OpError("Source edits require unlocked media clips"); }
                        if (sourceEdit) { assertNotTimeRemapped(member, "set_clip_params"); }
                        const auto originalAnimations = member.value("animations");
                        const double oldIn = effectiveIn(member);
                        double nextIn = !patch.contains("inPointMs") ? member.value("inPointMs").toDouble() :
                            primary ? patch.value("inPointMs").toDouble() : oldIn + sourceShiftMs * sourceRate(member);
                        if (!std::isfinite(nextIn) || nextIn < -SOURCE_BOUND_TOLERANCE_MS) { throw OpError("Linked slip extends before source start"); }
                        nextIn = std::max(0.0, nextIn);
                        if (sourceEdit && patch.contains("inPointMs")) {
                            member.insert("inPointMs", nextIn);
                            const double loop = member.value("loopLengthMs").toDouble();
                            const double window = loop > 0 && loop < clipDurationMs(member) ? loop : clipDurationMs(member);
                            member.insert("outPointMs", nextIn + window * sourceRate(member));
                            if (member.value("caption").isObject()) { member.insert("caption", retimeCaption(member.value("caption").toObject(), -(nextIn - oldIn) / sourceRate(member))); }
                        }
                        if (patch.contains("durationMs")) { member = trimClip(member, "end", deltaDuration); }
                        if (primary && patch.contains("outPointMs")) { member.insert("outPointMs", patch.value("outPointMs")); }
                        if (member.value("outPointMs").isDouble() && member.value("outPointMs").toDouble() <= nextIn) { throw OpError("outPointMs must exceed inPointMs"); }
                        if (!sourceLimit.isUndefined() && outPointOf(member) > sourceLimit.toDouble() + SOURCE_BOUND_TOLERANCE_MS) { throw OpError("outPointMs exceeds source duration"); }
                        if (member.value("pattern").isObject() && patch.contains("inPointMs")) {
                            const double phase = std::floor(nextIn * ticksPerMs + 0.5);
                            if (phase > 0) { member.insert("patternPhaseTicks", phase); } else { member.remove("patternPhaseTicks"); }
                            member.insert("outPointMs", member.value("outPointMs").toDouble() - nextIn);
                            member.insert("inPointMs", 0);
                        }
                        if (sourceEdit && present(member, "animations")) {
                            auto animations = member.value("animations").toArray();
                            const auto originals = originalAnimations.toArray();
                            for (qsizetype k = 0; k < animations.size() && k < originals.size(); ++k) {
                                if (isSourceAnchoredAnimation(originals[k].toObject())) {
                                    animations[k] = sliceSourceAnimation(originals[k].toObject(),
                                        member.value("inPointMs").toDouble(), outPointOf(member), clipDurationMs(member));
                                }
                            }
                            member.insert("animations", animations);
                        }
                        changed[j] = member;
                    }
                }
                raw.insert("clips", changed);
            }
            if (patch.contains("durationMs") || patch.contains("inPointMs") || patch.contains("outPointMs")) {
                QHash<QString, QJsonObject> originalById;
                for (const auto& value : clips) { originalById.insert(clipId(value.toObject()), value.toObject()); }
                QHash<QString, QJsonObject> changedById;
                for (const auto& value : raw.value("clips").toArray()) {
                    const auto member = value.toObject();
                    if (originalById.value(clipId(member)) != member) { changedById.insert(clipId(member), member); }
                }
                auto media = raw.value("mediaTracks").toArray();
                for (qsizetype j = 0; j < media.size(); ++j) {
                    const auto track = media[j].toObject();
                    const auto member = changedById.constFind(track.value("clipId").toString());
                    if (member == changedById.cend()) { continue; }
                    auto sliced = nt::targeting::sliceMediaTrack(track, *member);
                    sliced.insert("id", track.value("id"));
                    media[j] = sliced;
                }
                if (raw.contains("mediaTracks")) { raw.insert("mediaTracks", media); }
            }
            if (patch.contains("startMs") || patch.contains("trackId")) {
                QJsonObject move{{"clipId", target}, {"linked", p.value("linked").toBool(true)}};
                for (const auto* key : {"startMs", "trackId"}) {
                    if (patch.contains(QLatin1String(key))) { move.insert(QLatin1String(key), patch.value(QLatin1String(key))); }
                }
                raw = applyMusicClipEdit(std::move(raw), QStringLiteral("move_clip"), move);
            }
            if (patch.contains("speedMultiplier")) {
                raw = nt::speed::setClipSpeed(std::move(raw), {{"clipId", target},
                    {"speedMultiplier", patch.value("speedMultiplier")}, {"linked", p.value("linked").toBool(true)}});
            }
            if (patch.contains("locked")) {
                auto changed = raw.value("clips").toArray();
                for (qsizetype j = 0; j < changed.size(); ++j) {
                    auto member = changed[j].toObject();
                    if (clipId(member) == target) { member.insert("locked", patch.value("locked")); changed[j] = member; break; }
                }
                raw.insert("clips", changed);
            }
            return raw;
        }
    }
    if (operation == u"join_clips") {
        const auto clips = raw.value("clips").toArray();
        const auto refs = p.value("clips").toArray(p.value("selectedClipIds").toArray());
        IdSet available;
        for (const auto& value : clips) { available.insert(clipId(value.toObject())); }
        IdSet ids;
        for (const auto& ref : refs) {
            const auto id = ref.toString();
            ids.insert(available.contains(id) ? id : musicResourceId(clips, id, "clip"));
        }
        if (ids.size() < 2) { throw OpError("join_clips needs at least two clips"); }
        std::vector<QJsonObject> parts;
        for (const auto& value : clips) {
            const auto c = value.toObject();
            if (!ids.contains(clipId(c))) { continue; }
            if (sectionLocked(raw, c)) { throw OpError(("Unlock clip " + c.value("name").toString()).toStdString()); }
            for (const auto& part : unrollMusicClip(c, sectionBpm(raw), raw.value("tempo").toObject().value("offsetMs").toDouble())) { parts.push_back(part.toObject()); }
        }
        std::stable_sort(parts.begin(), parts.end(), [](const auto& a, const auto& b) { return clipStartMs(a) < clipStartMs(b); });
        auto head = parts.front();
        const auto type = head.value("mediaType").toString();
        if (type != u"midi" && type != u"audio") { throw OpError("Only MIDI or audio clips join"); }
        double end = clipEndMs(head);
        for (const auto& c : parts) {
            if (clipTrackId(c) != clipTrackId(head) || c.value("mediaType") != head.value("mediaType")) {
                throw OpError("Join clips of one kind on one track");
            }
            end = std::max(end, clipEndMs(c));
        }
        const double ticksPerMs = sectionBpm(raw) * 960 / 60000;
        const auto phase = [ticksPerMs](const QJsonObject& c) {
            return c.value("patternPhaseTicks").toDouble() + std::max(0.0, std::floor(c.value("inPointMs").toDouble() * ticksPerMs + 0.5));
        };
        const auto pattern = head.value("pattern").isObject() ? nt::midi::normalizePattern(head.value("pattern").toObject()) : QJsonObject{};
        bool invariant = true;
        for (const auto& value : pattern.value("rows").toArray()) {
            const auto row = value.toObject(); const auto playback = row.value("playback").toString();
            if (playback == u"shuffle" || playback == u"random" || playback == u"wander") { invariant = false; }
            for (const auto& value : row.value("steps").toArray()) {
                const auto step = value.toObject();
                if (step.value("chance").toDouble(100) != 100 ||
                    (step.value("condition").isObject() && step.value("condition").toObject().value("type").toString() != u"always")) { invariant = false; }
            }
        }
        bool keepPattern = type == u"midi" && head.value("pattern").isObject();
        for (size_t i = 0; keepPattern && i < parts.size(); ++i) {
            const auto& c = parts[i];
            keepPattern = c.value("pattern").isObject() && nt::midi::normalizePattern(c.value("pattern").toObject()) == pattern &&
                c.value("transpose").toDouble() == head.value("transpose").toDouble() &&
                c.value("velocityOffset").toDouble() == head.value("velocityOffset").toDouble() &&
                c.value("quantize").toObject() == head.value("quantize").toObject();
            if (i == 0 || !keepPattern) { continue; }
            const auto& prev = parts[i - 1];
            if (std::abs(clipStartMs(c) - clipEndMs(prev)) > 1 || !prev.value("patternRowCycles").toObject().isEmpty() || !c.value("patternRowCycles").toObject().isEmpty()) {
                keepPattern = false; break;
            }
            const double expected = phase(prev) + std::floor(clipDurationMs(prev) * ticksPerMs + 0.5);
            if (std::abs(phase(c) - expected) <= 2) { continue; }
            if (phase(c) != 0 || !invariant) { keepPattern = false; break; }
            for (const auto& value : pattern.value("rows").toArray()) {
                std::int64_t cycle = 0;
                for (const auto& entry : nt::midi::rowSchedule(value.toObject(), static_cast<std::uint32_t>(pattern.value("seed").toDouble()), 0)) { cycle += entry.lengthTicks; }
                if (cycle > 0 && static_cast<std::int64_t>(expected) % cycle != 0) { keepPattern = false; break; }
            }
        }
        if (keepPattern) {
            if (phase(head) > 0) { head.insert("patternPhaseTicks", phase(head)); } else { head.remove("patternPhaseTicks"); }
            head.remove("notes"); head.remove("controllers");
            head.insert("inPointMs", 0);
            if (head.contains("outPointMs")) { head.insert("outPointMs", end - clipStartMs(head)); }
        } else if (type == u"audio") {
            for (size_t k = 1; k < parts.size(); ++k) {
                const auto& a = parts[k - 1]; const auto& b = parts[k];
                if (a.value("sourceType").toString() != u"imported" || b.value("sourceType").toString() != u"imported" ||
                    a.value("currentAssetId").toString().isEmpty() || a.value("currentAssetId") != b.value("currentAssetId") ||
                    std::abs(sourceRate(a) - sourceRate(b)) > 1e-9 || a.value("volumeDb") != b.value("volumeDb") ||
                    std::abs(clipStartMs(b) - clipEndMs(a)) > 1 ||
                    std::abs(b.value("inPointMs").toDouble() - a.value("inPointMs").toDouble() - clipDurationMs(a) * sourceRate(a)) > 1) {
                    throw OpError("Cannot join audio: needs bounce");
                }
            }
            const auto last = parts.back();
            for (const auto* key : {"fadeOutMs", "fadeOutShape"}) {
                if (last.contains(QLatin1String(key))) { head.insert(QLatin1String(key), last.value(QLatin1String(key))); }
                else { head.remove(QLatin1String(key)); }
            }
            if (head.contains("outPointMs") && last.contains("outPointMs")) { head.insert("outPointMs", last.value("outPointMs")); }
        } else {
            QJsonArray patternClips;
            for (const auto& c : parts) { if (c.value("pattern").isObject()) { patternClips.append(c); } }
            if (!patternClips.isEmpty()) {
                auto tracks = raw.value("tracks").toArray();
                for (qsizetype i = 0; i < tracks.size(); ++i) {
                    auto track = tracks[i].toObject();
                    if (track.value("id") == head.value("trackId")) {
                        const auto lanes = nt::midi::deriveTrackAutomationFromPatterns(track, patternClips, raw);
                        if (!lanes.isEmpty() || track.contains("automation")) { track.insert("automation", lanes); }
                        tracks[i] = track;
                    }
                }
                if (raw.contains("tracks")) { raw.insert("tracks", tracks); }
                for (auto& c : parts) {
                    if (!c.value("pattern").isObject()) { continue; }
                    const auto expanded = nt::midi::expandPatternClip(c, raw);
                    if (expanded.contains("error")) { throw OpError(expanded.value("error").toString().toStdString()); }
                    c.insert("notes", expanded.value("notes").toArray());
                    const auto controllers = expanded.value("controllers").toArray();
                    if (controllers.isEmpty()) { c.remove("controllers"); } else { c.insert("controllers", controllers); }
                    c.insert("inPointMs", 0);
                    for (const auto* key : {"pattern", "patternPhaseTicks", "patternRowCycles", "loopLengthMs"}) { c.remove(QLatin1String(key)); }
                }
                head = parts.front();
            }
            const double bpm = sectionBpm(raw);
            const double gridOffset = raw.value("tempo").toObject().value("offsetMs").toDouble();
            for (auto& part : parts) { part = nt::midi::bakeRegionQuantize(part, bpm, gridOffset); }
            const bool sameParams = std::all_of(parts.begin(), parts.end(), [&parts](const auto& c) {
                return c.value("transpose").toDouble() == parts.front().value("transpose").toDouble() &&
                    c.value("velocityOffset").toDouble() == parts.front().value("velocityOffset").toDouble();
            });
            if (!sameParams) {
                for (auto& part : parts) { part = nt::midi::applyRegionParams(part, bpm, gridOffset); }
                head.remove("transpose"); head.remove("velocityOffset");
            }
            head.remove("quantize");
            QJsonArray notes;
            QMap<QString, QJsonObject> lanes;
            QStringList laneOrder;
            const bool hadControllers = std::any_of(parts.begin(), parts.end(), [](const auto& c) { return c.contains("controllers"); });
            IdSet seenNotes, seenPoints;
            const double ticksPerMs = sectionBpm(raw) * 960 / 60000;
            for (auto c : parts) {
                const double from = std::floor(c.value("inPointMs").toDouble() * ticksPerMs + 0.5);
                const double to = from + std::floor(clipDurationMs(c) * ticksPerMs + 0.5);
                const double shift = std::floor((clipStartMs(c) - clipStartMs(head)) * ticksPerMs + 0.5) - from;
                for (const auto& value : c.value("notes").toArray()) {
                    auto n = value.toObject(); const double tick = n.value("startTick").toDouble();
                    if (tick < from || tick >= to) { continue; }
                    const double length = std::min(n.value("durationTick").toDouble(), to - tick);
                    if (length < 1) { continue; }
                    if (length < n.value("durationTick").toDouble() && n.contains("expression")) {
                        const auto expression = midiExpressionBefore(n.value("expression").toObject(), length);
                        if (expression.isEmpty()) { n.remove("expression"); } else { n.insert("expression", expression); }
                    }
                    n.insert("durationTick", length); n.insert("startTick", tick + shift);
                    if (seenNotes.contains(n.value("id").toString())) { n.insert("id", newId()); }
                    seenNotes.insert(n.value("id").toString()); notes.append(n);
                }
                const auto visible = midiSplitControllers(c.value("controllers").toArray(), from, to, to).first;
                for (const auto& value : visible) {
                    auto lane = value.toObject();
                    const QString key = lane.value("kind").toString() + ":" + QString::number(lane.value("cc").toInt(-1)) + ":" +
                        QString::number(lane.value("pitch").toInt(-1)) + ":" + QString::number(lane.value("channel").toInt());
                    if (!lanes.contains(key)) { laneOrder.append(key); }
                    auto merged = lanes.value(key, lane); auto points = lanes.contains(key) ? merged.value("points").toArray() : QJsonArray{};
                    for (const auto& pv : lane.value("points").toArray()) {
                        auto point = pv.toObject(); point.insert("tick", point.value("tick").toDouble() + shift);
                        if (seenPoints.contains(point.value("id").toString())) { point.insert("id", newId()); }
                        seenPoints.insert(point.value("id").toString()); points.append(point);
                    }
                    merged.insert("points", points); lanes.insert(key, merged);
                }
            }
            const auto sortEvents = [](QJsonArray values, const char* field) {
                std::vector<QJsonObject> sorted;
                for (const auto& v : values) { sorted.push_back(v.toObject()); }
                std::stable_sort(sorted.begin(), sorted.end(), [field](const auto& a, const auto& b) { const auto x = a.value(QLatin1String(field)).toDouble(), y = b.value(QLatin1String(field)).toDouble();
                    if (x != y) { return x < y; }
                    if (QLatin1String(field) != u"startTick") { return false; }
                    if (a.value("pitch") != b.value("pitch")) { return a.value("pitch").toInt() < b.value("pitch").toInt(); }
                    return a.value("id").toString() < b.value("id").toString(); });
                QJsonArray result; for (const auto& v : sorted) { result.append(v); } return result;
            };
            const bool hadNotes = std::any_of(parts.begin(), parts.end(), [](const auto& c) { return c.contains("notes"); });
            if (hadNotes) { head.insert("notes", sortEvents(notes, "startTick")); } else { head.remove("notes"); }
            QJsonArray controllers;
            for (const auto& key : laneOrder) {
                auto lane = lanes.value(key);
                lane.insert("points", sortEvents(lane.value("points").toArray(), "tick")); controllers.append(lane);
            }
            if (hadControllers) { head.insert("controllers", controllers); }
            head.insert("inPointMs", 0);
            if (head.contains("outPointMs")) { head.insert("outPointMs", end - clipStartMs(head)); }
        }
        head.insert("durationMs", end - clipStartMs(head));
        QJsonArray result;
        IdSet touchedLinks;
        for (const auto& value : clips) {
            const auto c = value.toObject();
            if (clipId(c) == clipId(head)) { result.append(head); }
            else if (!ids.contains(clipId(c))) { result.append(c); }
            else if (!clipLinkId(c).isEmpty()) { touchedLinks.insert(clipLinkId(c)); }
        }
        raw.insert("clips", pruneSectionLinks(result, touchedLinks));
        QJsonArray media;
        for (const auto& v : raw.value("mediaTracks").toArray()) {
            const auto id = v.toObject().value("clipId").toString();
            if (!ids.contains(id) || id == clipId(head)) { media.append(v); }
        }
        if (raw.contains("mediaTracks")) { raw.insert("mediaTracks", media); }
        return raw;
    }
    if (operation != u"loop_clip" && operation != u"duplicate_clip" && operation != u"move_clip" && operation != u"split_clip" && operation != u"trim_clip") { return raw; }
    auto clips = raw.value("clips").toArray();
    const auto target = musicResourceId(clips, p.value("clipId").toString(p.value("clip").toString(p.value("target").toString())), "clip");
    qsizetype index = -1;
    for (qsizetype i = 0; i < clips.size(); ++i) {
        if (clips[i].toObject().value("id").toString() == target) { index = i; break; }
    }
    if (index < 0) { throw OpError(("No clip: " + target).toStdString()); }
    auto clip = clips[index].toObject();
    if (operation == u"duplicate_clip") {
        if (p.contains("count") && !p.value("count").isDouble()) { throw OpError("count must be a whole number from 1 to 64"); }
        const double count = p.value("count").toDouble(1);
        if (!std::isfinite(count) || std::floor(count) != count || count < 1 || count > 64) { throw OpError("count must be a whole number from 1 to 64"); }
        const double step = clipDurationMs(clip) + p.value("gapMs").toDouble();
        const double first = p.contains("atBar") || p.contains("atMs") ? sectionTime(raw, p, "atBar", "atMs") : clipStartMs(clip) + step;
        if (!std::isfinite(step) || first < 0 || first + (count - 1) * step < 0) { throw OpError("The repeat would start before zero"); }
        QJsonArray sources{clip};
        if (isGroupClip(clip)) {
            QHash<QString, QJsonArray> children;
            for (const auto& value : clips) { const auto child = value.toObject(); children[child.value("parentId").toString()].append(child); }
            for (qsizetype i = 0; i < sources.size(); ++i) {
                for (const auto& child : children.value(sources[i].toObject().value("id").toString())) { sources.append(child); }
            }
        }
        QJsonArray relative;
        for (const auto& value : sources) {
            auto source = value.toObject();
            const double offset = clipStartMs(source) - clipStartMs(clip);
            if (std::min(first, first + (count - 1) * step) + offset < 0) { throw OpError("A repeated child would start before zero"); }
            source.insert("startMs", offset);
            relative.append(source);
        }
        const QJsonObject content{{"lengthMs", clipDurationMs(clip)}, {"clips", relative}};
        for (int n = 0; n < static_cast<int>(count); ++n) { raw = sectionPlace(std::move(raw), content, first + n * step); }
        return raw;
    }
    if (sectionLocked(raw, clip)) { throw OpError(("Clip is locked: " + clip.value("name").toString()).toStdString()); }
    if (operation == u"move_clip") {
        ClipList values;
        values.reserve(static_cast<size_t>(clips.size()));
        for (const auto& value : clips) { values.push_back(value.toObject()); }
        const auto moving = moveUnitIds(values, {target}, p.value("linked").toBool(true));
        double earliest = clipStartMs(clip);
        for (const auto& value : clips) {
            const auto member = value.toObject();
            if (!moving.count(clipId(member))) { continue; }
            if (sectionLocked(raw, member)) { throw OpError(("Clip is locked: " + member.value("name").toString()).toStdString()); }
            earliest = std::min(earliest, clipStartMs(member));
        }
        const double delta = p.contains("atBar") || p.contains("startMs") ?
            std::max(-earliest, sectionTime(raw, p, "atBar", "startMs") - clipStartMs(clip)) : 0;
        QString destination;
        if (p.contains("trackId")) {
            destination = musicResourceId(raw.value("tracks").toArray(), p.value("trackId").toString(), "track");
            for (const auto& value : raw.value("tracks").toArray()) {
                const auto track = value.toObject();
                if (track.value("id").toString() == destination &&
                    (track.value("locked").toBool() || !clipFitsTrack(clip.value("mediaType").toString(), track.value("type").toString()))) {
                    throw OpError("The destination track is locked or cannot hold this clip type");
                }
            }
        }
        for (qsizetype i = 0; i < clips.size(); ++i) {
            auto member = clips[i].toObject();
            if (!moving.count(clipId(member))) { continue; }
            member.insert("startMs", clipStartMs(member) + delta);
            if (clipId(member) == target && !destination.isEmpty()) { member.insert("trackId", destination); }
            clips[i] = member;
        }
        raw.insert("clips", clips);
        return raw;
    }
    if (operation == u"split_clip") {
        const double at = sectionTime(raw, p, "atBar", "atMs");
        if (at <= clipStartMs(clip) || at >= clipEndMs(clip)) { throw OpError("Split point must be inside the clip"); }
        auto media = raw.value("mediaTracks").toArray();
        const auto pieces = sectionCut(QJsonArray{clip}, at, std::nullopt, sectionBpm(raw), media, p.value("crossing").toString(QStringLiteral("shorten")), raw.value("tempo").toObject().value("offsetMs").toDouble());
        QJsonArray next;
        for (qsizetype i = 0; i < clips.size(); ++i) {
            if (i == index) { for (const auto& piece : pieces) { next.append(piece); } }
            else { next.append(clips[i]); }
        }
        raw.insert("clips", next);
        if (raw.contains("mediaTracks")) { raw.insert("mediaTracks", media); }
        return raw;
    }
    if (operation == u"trim_clip") {
        const bool head = p.contains("startMs") && !p.contains("atBar") && !p.contains("endMs");
        if (p.contains("atBar") && p.contains("startMs")) { throw OpError("Send bar or millisecond positions, not both"); }
        if (p.contains("durationMs") && (head || p.contains("atBar") || p.contains("endMs"))) { throw OpError("Send durationMs or an edge position, not both"); }
        const double at = head ? p.value("startMs").toDouble(-1) : p.contains("durationMs") ? clipStartMs(clip) + p.value("durationMs").toDouble() : sectionTime(raw, p, "atBar", "endMs");
        const QString link = p.value("linked").toBool(true) ? clipLinkId(clip) : QString();
        const double delta = head ? clipStartMs(clip) - at : at - clipEndMs(clip);
        const auto limit = p.value("maxSourceDurationMs");
        QJsonArray next;
        for (const auto& value : clips) {
            const auto member = value.toObject();
            if (clipId(member) != target && (link.isEmpty() || clipLinkId(member) != link)) { next.append(member); continue; }
            if (sectionLocked(raw, member)) { throw OpError(("Clip is locked: " + member.value("name").toString()).toStdString()); }
            auto pieces = head ? unrollMusicClip(member, sectionBpm(raw), raw.value("tempo").toObject().value("offsetMs").toDouble()) : QJsonArray{member};
            pieces[0] = trimClip(pieces[0].toObject(), head ? "start" : "end", delta,
                clipId(member) == target && limit.isDouble() ? std::optional<double>(limit.toDouble()) : std::nullopt);
            for (const auto& piece : pieces) { next.append(piece); }
        }
        raw.insert("clips", next);
        return raw;
    }
    const auto type = clip.value("mediaType").toString();
    if (type != u"audio" && type != u"midi") { throw OpError("Only a MIDI or audio clip loops"); }
    const int ends = int(p.contains("times")) + int(p.contains("untilMs")) + int(p.contains("untilBar"));
    if (ends > 1) { throw OpError("Send one of times, untilMs or untilBar"); }
    const auto assertSource = [&](double out) {
        if (clip.value("sourceType").toString() == u"imported" && p.value("maxSourceDurationMs").isDouble() && out > p.value("maxSourceDurationMs").toDouble() + SECTION_EPS) {
            throw OpError("The loop would read past the source end");
        }
    };
    const double in = clip.value("inPointMs").toDouble();
    if (p.value("loopLengthMs").isNull()) {
        if (ends > 0) { throw OpError("loopLengthMs: null removes a loop and takes no endpoint"); }
        clip.remove(QStringLiteral("loopLengthMs"));
        if (type == u"audio") {
            const double out = in + clipDurationMs(clip) * sourceRate(clip);
            assertSource(out);
            clip.insert("outPointMs", out);
        }
    } else {
        if (present(clip, "timeRemap")) { throw OpError("Clear the time remap before looping a clip"); }
        const double window = p.contains("loopLengthMs") ? p.value("loopLengthMs").toDouble(-1) :
            clip.value("loopLengthMs").toDouble(clipDurationMs(clip));
        if (!std::isfinite(window) || window <= 0) { throw OpError("The loop window must be longer than 0 ms"); }
        double duration = clipDurationMs(clip);
        if (p.contains("times")) {
            const double times = p.value("times").toDouble();
            if (!std::isfinite(times) || times <= 0) { throw OpError("times must be positive"); }
            duration = window * times;
        } else if (p.contains("untilMs")) { duration = p.value("untilMs").toDouble() - clipStartMs(clip); }
        else if (p.contains("untilBar")) { duration = sectionBarMs(raw, p.value("untilBar").toDouble(-1)) - clipStartMs(clip); }
        else if (!p.contains("loopLengthMs")) { throw OpError("Send times, untilMs, untilBar or loopLengthMs"); }
        if (!std::isfinite(duration) || duration <= 0) { throw OpError("The loop end must lie after the clip start"); }
        clip.insert("durationMs", duration);
        if (duration > window + SECTION_EPS) { clip.insert("loopLengthMs", window); }
        else { clip.remove(QStringLiteral("loopLengthMs")); }
        if (type == u"audio") {
            const double out = in + std::min(window, duration) * sourceRate(clip);
            assertSource(out);
            clip.insert("outPointMs", out);
        }
    }
    clips[index] = clip;
    raw.insert("clips", clips);
    return raw;
}

QJsonObject applySectionEdit(QJsonObject raw, const QString& operation, const QJsonObject& p) {
    const auto before = raw;
    if (operation == u"paste_range") {
        const double at = sectionTime(raw, p, "atBar", "atMs");
        auto content = p.value("content").toObject();
        for (const auto* key : {"clips", "chords", "automation"}) {
            auto items = content.value(QLatin1String(key)).toArray();
            for (qsizetype i = 0; i < items.size(); ++i) {
                auto item = items[i].toObject();
                const auto id = item.value("trackId").toString();
                if (id.size() == 12 && std::all_of(id.begin(), id.end(), [](QChar c) {
                    return (c >= u'0' && c <= u'9') || (c >= u'a' && c <= u'f');
                })) {
                    item.insert("trackId", musicResourceId(raw.value("tracks").toArray(), id, "track"));
                    items[i] = item;
                }
            }
            if (content.contains(QLatin1String(key))) { content.insert(QLatin1String(key), items); }
        }
        const double length = content.value("lengthMs").toDouble();
        if (!std::isfinite(length) || length <= 0) { throw OpError("The section must be longer than 0 ms"); }
        sectionAssertReceivingWritable(raw, content);
        const auto mode = p.value("mode").toString("insert");
        if (mode == u"insert") { raw = sectionInsert(std::move(raw), at, length, std::nullopt); }
        else if (mode == u"overwrite") {
            IdSet receiving;
            for (const auto* key : {"clips", "chords", "automation"}) {
                for (const auto& value : content.value(QLatin1String(key)).toArray()) { receiving.insert(value.toObject().value("trackId").toString()); }
            }
            raw = sectionInsert(sectionDelete(std::move(raw), at, at + length, receiving), at, length, receiving);
        } else { throw OpError("Paste mode must be insert or overwrite"); }
        return encloseSectionGroups(before, sectionPlace(std::move(raw), content, at));
    }
    if (operation == u"duplicate_range") {
        const auto [from, to] = sectionRange(raw, p);
        const auto tracks = sectionTracks(raw, p);
        const auto content = sectionRead(raw, from, to, tracks);
        return encloseSectionGroups(before, sectionPlace(sectionInsert(std::move(raw), to, to - from, tracks), content, to));
    }
    if (operation == u"delete_time") {
        const auto [from, to] = sectionRange(raw, p);
        const auto tracks = sectionTracks(raw, p);
        return encloseSectionGroups(before, sectionDelete(std::move(raw), from, to, tracks));
    }
    if (operation == u"insert_time") {
        const double at = sectionTime(raw, p, "atBar", "atMs");
        if (p.contains("bars") == p.contains("ms")) { throw OpError("Send bars or ms for the length"); }
        const double length = p.contains("ms") ? p.value("ms").toDouble() :
            p.value("bars").toDouble() * (sectionBarMs(raw, 2) - sectionBarMs(raw, 1));
        if (!std::isfinite(length) || length <= 0) { throw OpError("Inserted time must be longer than 0 ms"); }
        const auto tracks = sectionTracks(raw, p);
        return encloseSectionGroups(before, sectionInsert(std::move(raw), at, length, tracks));
    }
    return raw;
}

}  // namespace nt::edit
