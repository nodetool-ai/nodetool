#include "Keyframes.h"
#include "scene/Animation.h"
#include "scene/SideCurves.h"

#include <QHash>
#include <QRegularExpression>
#include <QSet>
#include <QUuid>
#include <algorithm>
#include <array>
#include <cmath>
#include <functional>
#include <limits>
#include <vector>

namespace nt::keyframes {
namespace {
constexpr double epsilon = 1e-4;
const QStringList allProperties{"opacity",       "scale",           "offsetX",    "offsetY",  "rotation",
                                "cameraAzimuth", "cameraElevation", "cameraZoom", "cameraFov"};
QJsonObject merged(QJsonObject base, const QJsonObject& patch) {
    for (auto i = patch.begin(); i != patch.end(); ++i) {
        base.insert(i.key(), i.value());
    }
    return base;
}
QStringList strings(const QJsonValue& value) {
    QStringList result;
    for (const auto& item : value.toArray()) {
        result.append(item.toString());
    }
    return result;
}
QJsonArray array(const QStringList& list) { return QJsonArray::fromStringList(list); }
bool isAnimation(const QJsonObject& a) {
    return a["preset"] == "custom" && a["role"] == "emphasis" && a["delayMs"].toDouble() == 0 &&
           a["params"].toObject()["keyframed"] == true;
}
int animationIndex(const QJsonObject& clip) {
    const auto animations = clip["animations"].toArray();
    for (qsizetype i = 0; i < animations.size(); ++i) {
        if (isAnimation(animations[i].toObject())) {
            return static_cast<int>(i);
        }
    }
    return -1;
}
QJsonObject animation(const QJsonObject& clip) {
    const int index = animationIndex(clip);
    return index < 0 ? QJsonObject{} : clip["animations"].toArray()[index].toObject();
}
// Every curve of the clip, on the keyframe animation and on the side animations.
QJsonArray curves(const QJsonObject& clip) {
    auto all = animation(clip)["custom"].toObject()["curves"].toArray();
    for (const auto& curve : nt::scene::sideCurveList(clip["animations"].toArray())) {
        all.append(curve);
    }
    return all;
}
QJsonArray keys(const QJsonObject& clip, const QString& property) {
    for (const auto& value : curves(clip)) {
        const auto curve = value.toObject();
        if (curve["property"] == property) {
            return curve["keyframes"].toArray();
        }
    }
    return {};
}
QJsonArray sorted(QJsonArray values) {
    std::vector<QJsonObject> items;
    items.reserve(static_cast<size_t>(values.size()));
    for (const auto& value : values) {
        items.push_back(value.toObject());
    }
    std::stable_sort(items.begin(), items.end(),
                     [](const auto& a, const auto& b) { return a["t"].toDouble() < b["t"].toDouble(); });
    QJsonArray result;
    for (const auto& item : items) {
        result.append(item);
    }
    return result;
}
double toT(const QJsonObject& clip, double ms) {
    const double duration = clip["durationMs"].toDouble();
    return duration <= 0 ? 0 : std::clamp(ms / duration, 0.0, 1.0);
}
bool multiply(const QString& p) {
    return QStringList{"scale", "scaleX", "scaleY", "opacity", "saturation", "contrast", "cameraZoom"}.contains(p);
}
bool replace(const QString& p) {
    return QStringList{"positionX", "positionY", "anchorX",      "anchorY",
                       "trimStart", "trimEnd",   "wipeProgress", "perspective"}
        .contains(p);
}
double identity(const QString& p) { return multiply(p) ? 1 : 0; }
double compose(const QString& p, double base, double value) {
    return multiply(p) ? base * value : replace(p) ? value : base + value;
}
QJsonValue inverse(const QString& p, double base, double composed) {
    if (multiply(p)) {
        return base == 0 ? QJsonValue(QJsonValue::Null) : QJsonValue(composed / base);
    }
    return replace(p) ? composed : composed - base;
}
bool has(const QJsonObject& clip, const QString& p, double ms) {
    const double t = toT(clip, ms);
    for (const auto& value : keys(clip, p)) {
        if (std::abs(value.toObject()["t"].toDouble() - t) < epsilon) {
            return true;
        }
    }
    return false;
}
double curveValue(const QJsonArray& kfs, double t) {
    if (t <= kfs.first().toObject()["t"].toDouble()) {
        return kfs.first().toObject()["value"].toDouble();
    }
    const auto last = kfs.last().toObject();
    if (t >= last["t"].toDouble()) {
        return last["value"].toDouble();
    }
    for (qsizetype i = 1; i < kfs.size(); ++i) {
        const auto b = kfs[i].toObject();
        if (t > b["t"].toDouble()) {
            continue;
        }
        const auto a = kfs[i - 1].toObject();
        const double span = b["t"].toDouble() - a["t"].toDouble();
        const double f =
            span > 0 ? nt::scene::ease(b["easing"].toString("linear").toStdString(), (t - a["t"].toDouble()) / span)
                     : 1;
        return a["value"].toDouble() + (b["value"].toDouble() - a["value"].toDouble()) * f;
    }
    return last["value"].toDouble();
}
// An easing on the keyframe animation overrides its segments. Side curves are not on it.
QJsonValue easingOverride(const QJsonObject& clip, const QString& p) {
    return nt::scene::isSideCurveProperty(p) ? QJsonValue(QJsonValue::Undefined) : animation(clip).value("easing");
}
double valueAt(const QJsonObject& clip, const QString& p, double ms) {
    auto kfs = sorted(keys(clip, p));
    if (kfs.isEmpty()) {
        return identity(p);
    }
    if (const auto override = easingOverride(clip, p); !override.isUndefined()) {
        for (qsizetype i = 0; i < kfs.size(); ++i) {
            auto kf = kfs[i].toObject();
            kf.insert("easing", override);
            kfs[i] = kf;
        }
    }
    return curveValue(kfs, toT(clip, ms));
}
QJsonArray withCurves(const QJsonObject& clip, const QJsonArray& updated) {
    auto animations = clip["animations"].toArray();
    const int index = animationIndex(clip);
    QJsonArray live;
    QJsonArray side;
    for (const auto& curve : updated) {
        if (curve.toObject()["keyframes"].toArray().isEmpty()) {
            continue;
        }
        (nt::scene::isSideCurveProperty(curve.toObject()["property"].toString()) ? side : live).append(curve);
    }
    const double duration = clip["durationMs"].toDouble();
    if (live.isEmpty()) {
        if (index >= 0) {
            animations.removeAt(index);
        }
        return nt::scene::withSideCurves(animations, side, duration);
    }
    auto next = animation(clip);
    if (!next.contains("id")) {
        next.insert("id", QUuid::createUuid().toString(QUuid::Id128));
    }
    next = merged(next, {{"role", "emphasis"},
                         {"preset", "custom"},
                         {"durationMs", clip["durationMs"]},
                         {"delayMs", 0},
                         {"enabled", true},
                         {"params", QJsonObject{{"keyframed", true}}},
                         {"custom", merged(next["custom"].toObject(), {{"curves", live}})}});
    if (index >= 0) {
        animations[index] = next;
    } else {
        animations.append(next);
    }
    return nt::scene::withSideCurves(animations, side, duration);
}
QJsonArray set(const QJsonObject& clip, const QString& p, double ms, double value) {
    QJsonArray others;
    QJsonArray existing;
    bool found = false;
    for (const auto& item : curves(clip)) {
        const auto c = item.toObject();
        if (c["property"] != p) {
            others.append(c);
        } else if (!found) {
            existing = c["keyframes"].toArray();
            found = true;
        }
    }
    const double t = toT(clip, ms);
    QJsonObject replacement{{"t", t}, {"value", value}};
    QJsonArray kept;
    bool replaced = false;
    for (const auto& item : existing) {
        const auto k = item.toObject();
        if (!replaced && std::abs(k["t"].toDouble() - t) < epsilon) {
            if (k.contains("easing")) {
                replacement.insert("easing", k["easing"]);
            }
            replaced = true;
        } else {
            kept.append(k);
        }
    }
    kept.append(replacement);
    others.append(QJsonObject{{"property", p}, {"keyframes", sorted(kept)}});
    return withCurves(clip, others);
}
QJsonArray setMany(QJsonObject clip, const QJsonArray& entries, double ms) {
    for (const auto& entry : entries) {
        const auto e = entry.toObject();
        clip.insert("animations", set(clip, e["property"].toString(), ms, e["value"].toDouble()));
    }
    return clip["animations"].toArray();
}
QJsonArray update(const QJsonObject& clip, const QStringList& ps, const QString& action, double ms, double toMs = 0,
                  const QString& easing = {}) {
    const double t = toT(clip, ms);
    const double target = toT(clip, toMs);
    QJsonArray result;
    for (const auto& value : curves(clip)) {
        auto curve = value.toObject();
        if (!ps.contains(curve["property"].toString())) {
            result.append(curve);
            continue;
        }
        if (action == "clear") {
            continue;
        }
        QJsonArray kept;
        const auto kfs = curve["keyframes"].toArray();
        int moving = -1;
        for (qsizetype i = 0; i < kfs.size(); ++i) {
            if (std::abs(kfs[i].toObject()["t"].toDouble() - t) < epsilon) {
                moving = static_cast<int>(i);
                break;
            }
        }
        for (qsizetype i = 0; i < kfs.size(); ++i) {
            auto k = kfs[i].toObject();
            const bool hit = std::abs(k["t"].toDouble() - t) < epsilon;
            if (action == "remove" && hit) {
                continue;
            }
            if (action == "move" && moving >= 0 && (i == moving || std::abs(k["t"].toDouble() - target) < epsilon)) {
                continue;
            }
            if (action == "easing" && hit) {
                k.insert("easing", easing);
            }
            kept.append(k);
        }
        if (action == "move" && moving >= 0) {
            auto moved = kfs[moving].toObject();
            moved.insert("t", target);
            kept.append(moved);
            kept = sorted(kept);
        }
        curve.insert("keyframes", kept);
        result.append(curve);
    }
    return withCurves(clip, result);
}
// Stores curves whose keys now carry every easing themselves: an easing on the keyframe
// animation is written onto its keys, and leaves the animation.
QJsonArray withEasedCurves(const QJsonObject& clip, const QJsonArray& result) {
    QJsonArray own;
    QJsonArray side;
    for (const auto& curve : result) {
        (nt::scene::isSideCurveProperty(curve.toObject()["property"].toString()) ? side : own).append(curve);
    }
    auto animations = clip["animations"].toArray();
    if (const int index = animationIndex(clip); index >= 0) {
        auto a = animation(clip);
        a.remove("easing");
        a.insert("custom", merged(a["custom"].toObject(), {{"curves", own}}));
        animations[index] = a;
    }
    return nt::scene::withSideCurves(animations, side, clip["durationMs"].toDouble());
}
QJsonArray setEasing(const QJsonObject& clip, const QStringList& ps, double ms, const QString& easing) {
    const auto all = curves(clip);
    if (all.isEmpty() && !animation(clip)["custom"].isObject()) {
        return clip["animations"].toArray();
    }
    QJsonArray result;
    for (const auto& value : all) {
        auto c = value.toObject();
        const auto override = easingOverride(clip, c["property"].toString());
        QJsonArray kfs;
        for (const auto& item : c["keyframes"].toArray()) {
            auto k = item.toObject();
            if (ps.contains(c["property"].toString()) && std::abs(k["t"].toDouble() - toT(clip, ms)) < epsilon) {
                k.insert("easing", easing);
            } else if (!override.isUndefined()) {
                k.insert("easing", override);
            }
            kfs.append(k);
        }
        c.insert("keyframes", kfs);
        result.append(c);
    }
    return withEasedCurves(clip, result);
}
QJsonObject cameraStyle(const QJsonObject& clip) {
    if (clip["model3dStyle"].isObject()) {
        return clip["model3dStyle"].toObject();
    }
    return {{"camera",
             QJsonObject{{"mode", "orbit"}, {"azimuthDeg", 45}, {"elevationDeg", 25}, {"fovDeg", 35}, {"zoom", 1}}},
            {"animation", QJsonObject{{"loop", true}, {"speed", 1}}},
            {"lighting", "studio"},
            {"lightIntensity", 1},
            {"background", QJsonObject{{"transparent", true}}}};
}
struct Input {
    QString property;
    QString group;
    QString member;
    double defaultValue = 0;
    double min = -std::numeric_limits<double>::infinity();
    double max = std::numeric_limits<double>::infinity();
};
std::vector<Input> inputs(const QString& row) {
    if (row == "position") {
        return {{"offsetX", "position", "x"}, {"offsetY", "position", "y"}};
    }
    if (row == "scale") {
        return {{"scale", "scale", "x", 1, 0.01}, {"scale", "scale", "y", 1, 0.01}};
    }
    if (row == "rotation") {
        return {{"rotation", {}, "rotation"}};
    }
    if (row == "anchor") {
        return {{"anchorX", "anchor", "x", 0.5, 0, 1}, {"anchorY", "anchor", "y", 0.5, 0, 1}};
    }
    if (row == "rotationX" || row == "rotationY") {
        return {{row, {}, row}};
    }
    if (row == "perspective") {
        return {{"perspective", {}, "perspective", 1000, 1}};
    }
    if (row == "depth") {
        return {{"depthPx", {}, "depthPx"}};
    }
    if (row == "opacity") {
        return {{"opacity", {}, "opacity", 1, 0, 1}};
    }
    if (row == "volume") {
        return {{"volumeDb", {}, "volumeDb", 0, -60, 12}};
    }
    if (row == "cameraOrbit") {
        return {{"cameraAzimuth", "camera", "azimuthDeg", 45}, {"cameraElevation", "camera", "elevationDeg", 25}};
    }
    if (row == "cameraFov") {
        return {{"cameraFov", "camera", "fovDeg", 35, 1, 170}};
    }
    if (row == "cameraZoom") {
        return {{"cameraZoom", "camera", "zoom", 1, 0.05}};
    }
    return {};
}
double base(const QJsonObject& clip, const Input& i) {
    if (i.property == "opacity" || i.property == "volumeDb") {
        return clip[i.member].toDouble(i.defaultValue);
    }
    const auto from = i.group == "camera" ? cameraStyle(clip)["camera"].toObject()
                      : i.group.isEmpty() ? transform(clip)
                                          : transform(clip)[i.group].toObject();
    return from[i.member].toDouble(i.defaultValue);
}
QJsonObject basePatch(const QJsonObject& clip, const Input& i, double value) {
    if (i.property == "opacity" || i.property == "volumeDb") {
        return {{i.member, value}};
    }
    if (i.group == "camera") {
        auto style = cameraStyle(clip);
        style.insert("camera", merged(style["camera"].toObject(), {{i.member, value}}));
        // model3dStyleWithPatch always materializes the animation object.
        style.insert("animation", style["animation"].toObject());
        return {{"model3dStyle", style}};
    }
    auto t = transform(clip);
    if (i.group.isEmpty()) {
        t.insert(i.member, value);
    } else {
        t.insert(i.group, merged(t[i.group].toObject(), {{i.member, value}}));
    }
    return {{"transform", t}};
}
// What a property's new key holds, so that adding it changes nothing on screen. A property
// that replaces its base has to start from that base rather than from the identity.
double keyValue(const QJsonObject& clip, const QString& row, const QString& p, double ms) {
    if (!keys(clip, p).isEmpty() || !replace(p)) {
        return valueAt(clip, p, ms);
    }
    for (const auto& input : inputs(row)) {
        if (input.property == p) {
            return base(clip, input);
        }
    }
    return identity(p);
}
bool rowKeyed(const QJsonObject& clip, const QString& row) {
    for (const auto& p : properties(row)) {
        if (!keys(clip, p).isEmpty()) {
            return true;
        }
    }
    return false;
}
bool rowHas(const QJsonObject& clip, const QString& row, double ms) {
    for (const auto& p : properties(row)) {
        if (has(clip, p, ms)) {
            return true;
        }
    }
    return false;
}
QJsonValue stopwatch(const QJsonObject& clip, const QString& row, const QJsonValue& at) {
    if (at.isNull() || at.isUndefined()) {
        return QJsonValue::Null;
    }
    const auto ps = properties(row);
    if (!rowKeyed(clip, row)) {
        QJsonArray entries;
        for (const auto& p : ps) {
            entries.append(QJsonObject{{"property", p}, {"value", keyValue(clip, row, p, at.toDouble())}});
        }
        return QJsonObject{{"animations", setMany(clip, entries, at.toDouble())}};
    }
    auto working = clip;
    QJsonObject patch;
    const auto specs = inputs(row);
    for (size_t i = 0; i < specs.size(); ++i) {
        const auto next = basePatch(working, specs[i], inputValue(clip, row, static_cast<int>(i), at.toDouble()));
        working = merged(working, next);
        patch = merged(patch, next);
    }
    patch.insert("animations", update(working, ps, "clear", 0));
    return patch;
}
QJsonValue toggle(const QJsonObject& clip, const QString& row, const QJsonValue& at) {
    if (at.isNull() || at.isUndefined()) {
        return QJsonValue::Null;
    }
    const double ms = at.toDouble();
    const auto ps = properties(row);
    if (!rowHas(clip, row, ms)) {
        QJsonArray entries;
        for (const auto& p : ps) {
            entries.append(QJsonObject{{"property", p}, {"value", keyValue(clip, row, p, ms)}});
        }
        return QJsonObject{{"animations", setMany(clip, entries, ms)}};
    }
    bool remaining = false;
    for (const auto& t : times(clip, ps)) {
        if (std::abs(t.toDouble() - ms) > 0.5) {
            remaining = true;
        }
    }
    return remaining ? QJsonValue(QJsonObject{{"animations", update(clip, ps, "remove", ms)}})
                     : stopwatch(clip, row, at);
}
QJsonValue commit(const QJsonObject& clip, const QString& row, int index, double value, const QJsonValue& at) {
    const auto specs = inputs(row);
    if (!std::isfinite(value) || index < 0 || static_cast<size_t>(index) >= specs.size()) {
        return QJsonValue::Null;
    }
    const auto& input = specs[static_cast<size_t>(index)];
    const double composed = std::clamp(value, input.min, input.max);
    if (!rowKeyed(clip, row)) {
        return basePatch(clip, input, composed);
    }
    if (at.isNull() || at.isUndefined()) {
        return QJsonValue::Null;
    }
    auto working = clip;
    QJsonObject patch;
    auto kf = inverse(input.property, base(clip, input), composed);
    if (kf.isNull()) {
        const auto ts = times(clip, {input.property});
        patch = basePatch(working, input, 1);
        working = merged(working, patch);
        for (const auto& t : ts) {
            working.insert("animations", set(working, input.property, t.toDouble(), 0));
        }
        kf = composed;
    }
    QJsonArray entries;
    for (const auto& p : properties(row)) {
        entries.append(QJsonObject{
            {"property", p}, {"value", p == input.property ? kf.toDouble() : keyValue(working, row, p, at.toDouble())}});
    }
    patch.insert("animations", setMany(working, entries, at.toDouble()));
    return patch;
}
QJsonObject gizmo(const QJsonObject& clip, const QJsonObject& next, const QJsonValue& at) {
    if (at.isNull()) {
        return {{"transform", next}};
    }
    const auto b = transform(clip);
    auto t = next;
    QJsonArray entries;
    const double ms = at.toDouble();
    const auto push = [&](const QString& p, double value) {
        entries.append(QJsonObject{{"property", p}, {"value", value}});
    };
    if (!keys(clip, "offsetX").isEmpty() || !keys(clip, "offsetY").isEmpty()) {
        push("offsetX", valueAt(clip, "offsetX", ms) + next["position"].toObject()["x"].toDouble() -
                            b["position"].toObject()["x"].toDouble());
        push("offsetY", valueAt(clip, "offsetY", ms) + next["position"].toObject()["y"].toDouble() -
                            b["position"].toObject()["y"].toDouble());
        t.insert("position", b["position"]);
    }
    if (!keys(clip, "scale").isEmpty()) {
        const auto s = b["scale"].toObject();
        const double x = s["x"].toDouble(), y = s["y"].toDouble();
        push("scale", valueAt(clip, "scale", ms) * (x != 0   ? next["scale"].toObject()["x"].toDouble() / x
                                                    : y != 0 ? next["scale"].toObject()["y"].toDouble() / y
                                                             : 1));
        t.insert("scale", b["scale"]);
    }
    if (!keys(clip, "rotation").isEmpty()) {
        push("rotation", valueAt(clip, "rotation", ms) + next["rotation"].toDouble() - b["rotation"].toDouble());
        t.insert("rotation", b["rotation"]);
    }
    if (!keys(clip, "anchorX").isEmpty() || !keys(clip, "anchorY").isEmpty()) {
        const auto from = b["anchor"].toObject();
        const auto to = next["anchor"].toObject();
        push("anchorX", keyValue(clip, "anchor", "anchorX", ms) + to["x"].toDouble() - from["x"].toDouble());
        push("anchorY", keyValue(clip, "anchor", "anchorY", ms) + to["y"].toDouble() - from["y"].toDouble());
        t.insert("anchor", b["anchor"]);
    }
    return entries.isEmpty() ? QJsonObject{{"transform", next}}
                             : QJsonObject{{"transform", t}, {"animations", setMany(clip, entries, ms)}};
}
// A set of keyframes named by row and clip time, per curve property, with the lookups a
// large selection needs: one sort, then a binary search per stored keyframe.
struct KeyRequest {
    double t = 0;
    double ms = 0;
};
using KeySet = QHash<QString, std::vector<KeyRequest>>;
std::optional<KeySet> keySet(const QJsonObject& clip, const QJsonValue& value) {
    const auto list = value.toArray();
    if (list.isEmpty()) {
        return std::nullopt;
    }
    KeySet result;
    for (const auto& item : list) {
        const auto key = item.toObject();
        const auto ps = properties(key["row"].toString());
        if (ps.isEmpty() || !key["atMs"].isDouble()) {
            return std::nullopt;
        }
        const double ms = key["atMs"].toDouble();
        for (const auto& p : ps) {
            result[p].push_back({toT(clip, ms), ms});
        }
    }
    for (auto& requests : result) {
        std::sort(requests.begin(), requests.end(), [](const auto& a, const auto& b) { return a.t < b.t; });
    }
    return result;
}
const KeyRequest* findRequest(const std::vector<KeyRequest>& requests, double t) {
    const auto hit = std::lower_bound(requests.begin(), requests.end(), t - epsilon,
                                      [](const KeyRequest& a, double b) { return a.t <= b; });
    return hit != requests.end() && std::abs(hit->t - t) < epsilon ? &*hit : nullptr;
}
bool nearSorted(const std::vector<double>& sortedTimes, double t) {
    const auto hit = std::upper_bound(sortedTimes.begin(), sortedTimes.end(), t - epsilon);
    return hit != sortedTimes.end() && std::abs(*hit - t) < epsilon;
}
// Moves a selection by one delta, clamped so that every key stays on the clip. Ported
// from FilmCraft crates/engine/src/keyframe_move.rs (licenses/FilmCraft-MIT.txt): all the
// originals leave before any key lands, so keys can move into each other's old positions.
// A key that lands on an unselected one replaces it, as the single move does.
QJsonValue moveMany(const QJsonObject& clip, const QJsonObject& payload) {
    const auto selection = keySet(clip, payload["keys"]);
    const double duration = clip["durationMs"].toDouble();
    if (!selection || duration <= 0) {
        return QJsonValue::Null;
    }
    double low = -std::numeric_limits<double>::infinity();
    double high = std::numeric_limits<double>::infinity();
    for (const auto& requests : *selection) {
        for (const auto& request : requests) {
            low = std::max(low, -request.ms);
            high = std::min(high, duration - request.ms);
        }
    }
    if (low > high) {
        return QJsonValue::Null;
    }
    const double delta = std::clamp(payload["deltaMs"].toDouble(), low, high);
    if (delta == 0) {
        return QJsonValue::Null;
    }
    QJsonArray result;
    for (const auto& value : curves(clip)) {
        auto curve = value.toObject();
        const auto requests = selection->constFind(curve["property"].toString());
        if (requests == selection->constEnd()) {
            result.append(curve);
            continue;
        }
        const auto kfs = curve["keyframes"].toArray();
        std::vector<QJsonObject> moved;
        std::vector<double> targets;
        QSet<const KeyRequest*> used;
        std::vector<bool> leaving(static_cast<size_t>(kfs.size()), false);
        for (qsizetype i = 0; i < kfs.size(); ++i) {
            auto k = kfs[i].toObject();
            const auto* request = findRequest(*requests, k["t"].toDouble());
            if (!request || used.contains(request)) {
                continue;
            }
            used.insert(request);
            leaving[static_cast<size_t>(i)] = true;
            const double target = toT(clip, request->ms + delta);
            k.insert("t", target);
            moved.push_back(k);
            targets.push_back(target);
        }
        std::sort(targets.begin(), targets.end());
        QJsonArray kept;
        for (qsizetype i = 0; i < kfs.size(); ++i) {
            const auto k = kfs[i].toObject();
            if (!leaving[static_cast<size_t>(i)] && !nearSorted(targets, k["t"].toDouble())) {
                kept.append(k);
            }
        }
        for (const auto& k : moved) {
            kept.append(k);
        }
        curve.insert("keyframes", moved.empty() ? kept : sorted(kept));
        result.append(curve);
    }
    return QJsonObject{{"animations", withCurves(clip, result)}};
}
QJsonValue easingMany(const QJsonObject& clip, const QJsonObject& payload) {
    const auto selection = keySet(clip, payload["keys"]);
    const auto all = curves(clip);
    if (!selection || (all.isEmpty() && !animation(clip)["custom"].isObject()) || !payload["easing"].isString()) {
        return QJsonValue::Null;
    }
    const auto easing = payload["easing"].toString();
    QJsonArray result;
    for (const auto& value : all) {
        auto c = value.toObject();
        const auto requests = selection->constFind(c["property"].toString());
        const auto override = easingOverride(clip, c["property"].toString());
        QJsonArray kfs;
        for (const auto& item : c["keyframes"].toArray()) {
            auto k = item.toObject();
            if (requests != selection->constEnd() && findRequest(*requests, k["t"].toDouble())) {
                k.insert("easing", easing);
            } else if (!override.isUndefined()) {
                k.insert("easing", override);
            }
            kfs.append(k);
        }
        c.insert("keyframes", kfs);
        result.append(c);
    }
    return QJsonObject{{"animations", withEasedCurves(clip, result)}};
}
// Deletes per row, as toggling each key off would: a row left with no key stops animating
// at the value of its last key.
QJsonValue deleteMany(const QJsonObject& clip, const QJsonObject& payload) {
    const auto list = payload["keys"].toArray();
    const auto selection = keySet(clip, payload["keys"]);
    if (!selection) {
        return QJsonValue::Null;
    }
    QHash<QString, std::vector<double>> rows;
    for (const auto& item : list) {
        const auto key = item.toObject();
        rows[key["row"].toString()].push_back(key["atMs"].toDouble());
    }
    auto working = clip;
    QJsonObject patch;
    for (auto row = rows.begin(); row != rows.end(); ++row) {
        const auto ps = properties(row.key());
        auto& removing = row.value();
        std::sort(removing.begin(), removing.end());
        bool remaining = false;
        for (const auto& t : times(working, ps)) {
            const auto hit = std::lower_bound(removing.begin(), removing.end(), t.toDouble() - 0.5);
            remaining = remaining || hit == removing.end() || std::abs(*hit - t.toDouble()) > 0.5;
        }
        QJsonObject step;
        if (remaining) {
            QJsonArray result;
            for (const auto& value : curves(working)) {
                auto curve = value.toObject();
                const auto property = curve["property"].toString();
                if (ps.contains(property)) {
                    const auto& requests = selection->find(property).value();
                    QJsonArray kept;
                    for (const auto& k : curve["keyframes"].toArray()) {
                        if (!findRequest(requests, k.toObject()["t"].toDouble())) {
                            kept.append(k);
                        }
                    }
                    curve.insert("keyframes", kept);
                }
                result.append(curve);
            }
            step = {{"animations", withCurves(working, result)}};
        } else {
            const auto stopped = stopwatch(working, row.key(), removing.back());
            if (!stopped.isObject()) {
                return QJsonValue::Null;
            }
            step = stopped.toObject();
        }
        working = merged(working, step);
        patch = merged(patch, step);
    }
    return patch;
}
// The enable switch of a fixed effect. A switched-off group moves its values aside and
// leaves the document at the identity, so every renderer draws the bypass with no change of
// its own. The group's fields stay in `bypassedFixedEffects` until it is switched back on.
struct FixedGroup {
    QStringList fields;
    QStringList curveProperties;
};
std::optional<FixedGroup> fixedGroup(const QString& group) {
    if (group == "motion") {
        return FixedGroup{{"transform"},
                          {"offsetX", "offsetY", "scale", "rotation", "anchorX", "anchorY", "rotationX", "rotationY",
                           "perspective", "depthPx"}};
    }
    if (group == "opacity") {
        return FixedGroup{{"opacity"}, {"opacity"}};
    }
    // Volume's keys stay on their side animation while it is off, and the mixer skips them. The
    // web's schema would strip `curves` from the Volume stash on a save.
    if (group == "volume") {
        return FixedGroup{{"volumeDb"}, {}};
    }
    return std::nullopt;
}
bool rowSwitchedOff(const QJsonObject& clip, const QString& row) {
    const auto stash = clip["bypassedFixedEffects"].toObject();
    for (const auto* group : {"motion", "opacity", "volume"}) {
        if (!stash.contains(group)) {
            continue;
        }
        const auto spec = fixedGroup(group);
        for (const auto& property : properties(row)) {
            if (spec->curveProperties.contains(property) || (property == "volumeDb" && QLatin1StringView(group) == "volume")) {
                return true;
            }
        }
    }
    return false;
}
QJsonObject restoredGroup(QJsonObject clip, const QJsonObject& stash) {
    for (auto i = stash.begin(); i != stash.end(); ++i) {
        if (i.key() != "curves") {
            clip.insert(i.key(), i.value());
        }
    }
    const auto saved = stash["curves"].toArray();
    if (!saved.isEmpty()) {
        // The stored keys win over any curve a document grew for the same property meanwhile.
        QSet<QString> restoring;
        for (const auto& curve : saved) {
            restoring.insert(curve.toObject()["property"].toString());
        }
        QJsonArray all;
        for (const auto& curve : curves(clip)) {
            if (!restoring.contains(curve.toObject()["property"].toString())) {
                all.append(curve);
            }
        }
        for (const auto& curve : saved) {
            all.append(curve);
        }
        clip.insert("animations", withCurves(clip, all));
    }
    return clip;
}
std::optional<QJsonObject> bypass(QJsonObject clip, const QJsonObject& payload) {
    const auto group = payload["group"].toString();
    const auto spec = fixedGroup(group);
    if (!spec || !payload["enabled"].isBool()) {
        return std::nullopt;
    }
    auto stash = clip["bypassedFixedEffects"].toObject();
    const bool off = stash.contains(group);
    if (payload["enabled"].toBool()) {
        if (!off) {
            return std::nullopt;
        }
        clip = restoredGroup(clip, stash[group].toObject());
        stash.remove(group);
    } else {
        if (off) {
            return std::nullopt;
        }
        QJsonObject saved;
        for (const auto& field : spec->fields) {
            if (clip.contains(field)) {
                saved.insert(field, clip[field]);
                clip.remove(field);
            }
        }
        // An animation-wide easing stays on the animation, so each saved key takes it along.
        QJsonArray savedCurves;
        for (const auto& value : curves(clip)) {
            auto curve = value.toObject();
            if (!spec->curveProperties.contains(curve["property"].toString())) {
                continue;
            }
            const auto override = easingOverride(clip, curve["property"].toString());
            if (!override.isUndefined()) {
                QJsonArray kfs;
                for (const auto& k : curve["keyframes"].toArray()) {
                    auto next = k.toObject();
                    next.insert("easing", override);
                    kfs.append(next);
                }
                curve.insert("keyframes", kfs);
            }
            savedCurves.append(curve);
        }
        if (!savedCurves.isEmpty()) {
            saved.insert("curves", savedCurves);
            clip.insert("animations", update(clip, spec->curveProperties, "clear", 0));
        }
        stash.insert(group, saved);
    }
    if (stash.isEmpty()) {
        clip.remove("bypassedFixedEffects");
    } else {
        clip.insert("bypassedFixedEffects", stash);
    }
    return clip;
}
// One input's composed curve in display units. It parses the keys once, so a graph costs one
// pass per sample instead of one sort per sample, and folds them as curveValue does.
class SampledCurve {
  public:
    SampledCurve(const QJsonObject& clip, const Input& input, double scale)
        : m_property(input.property), m_base(base(clip, input)), m_scale(scale) {
        const auto kfs = sorted(keys(clip, input.property));
        const QJsonValue override = easingOverride(clip, input.property);
        m_points.reserve(static_cast<size_t>(kfs.size()));
        for (const auto& value : kfs) {
            const auto k = value.toObject();
            const auto easing = override.isUndefined() ? k["easing"].toString("linear") : override.toString();
            m_points.push_back({k["t"].toDouble(), k["value"].toDouble(), easing.toStdString()});
        }
    }
    double at(double t) const {
        return (m_points.empty() ? m_base : compose(m_property, m_base, keyed(t))) * m_scale;
    }

  private:
    struct Point {
        double t;
        double value;
        std::string easing;
    };
    double keyed(double t) const {
        if (t <= m_points.front().t) {
            return m_points.front().value;
        }
        if (t >= m_points.back().t) {
            return m_points.back().value;
        }
        const auto b = std::lower_bound(m_points.begin(), m_points.end(), t,
                                        [](const Point& point, double value) { return point.t < value; });
        const auto a = std::prev(b);
        const double span = b->t - a->t;
        const double f = span > 0 ? nt::scene::ease(b->easing, (t - a->t) / span) : 1;
        return a->value + (b->value - a->value) * f;
    }
    QString m_property;
    double m_base;
    double m_scale;
    std::vector<Point> m_points;
};
std::vector<double> displayScales(const QString& row) {
    std::vector<double> result;
    for (const auto& value : rowSpecs()) {
        const auto spec = value.toObject();
        if (spec["id"] == row) {
            for (const auto& input : spec["inputs"].toArray()) {
                result.push_back(input.toObject()["displayScale"].toDouble(1));
            }
        }
    }
    return result;
}
} // namespace
QJsonObject transform(const QJsonObject& clip) {
    if (clip["transform"].isObject()) {
        return clip["transform"].toObject();
    }
    return {{"position", QJsonObject{{"x", 0}, {"y", 0}}},
            {"scale", QJsonObject{{"x", 1}, {"y", 1}}},
            {"rotation", 0},
            {"anchor", QJsonObject{{"x", 0.5}, {"y", 0.5}}}};
}
QJsonObject withBypassRestored(const QJsonObject& clip) {
    if (!clip.contains("bypassedFixedEffects")) {
        return clip;
    }
    auto shown = clip;
    const auto stash = clip["bypassedFixedEffects"].toObject();
    for (auto i = stash.begin(); i != stash.end(); ++i) {
        shown = restoredGroup(shown, i.value().toObject());
    }
    shown.remove("bypassedFixedEffects");
    return shown;
}
QJsonObject rowGraphSamples(const QJsonObject& clip, const QString& row, double fromMs, double toMs, int samples) {
    const int count = std::max(1, samples);
    const auto specs = inputs(row);
    const auto scales = displayScales(row);
    const double span = std::max(toMs - fromMs, 1e-6);
    QJsonArray curvesOut;
    std::vector<std::vector<double>> plotted;
    for (size_t input = 0; input < specs.size(); ++input) {
        const SampledCurve curve(clip, specs[input], input < scales.size() ? scales[input] : 1);
        QJsonArray values;
        std::vector<double> plot;
        plot.reserve(static_cast<size_t>(count) + 1);
        for (int i = 0; i <= count; ++i) {
            const double value = curve.at(toT(clip, fromMs + span * i / count));
            plot.push_back(value);
            values.append(value);
        }
        curvesOut.append(QJsonObject{{"values", values}});
        plotted.push_back(std::move(plot));
    }
    QJsonArray velocity;
    double vmax = 0;
    const double seconds = span / count / 1000;
    for (size_t i = 0; i < static_cast<size_t>(count) && !plotted.empty(); ++i) {
        double value = 0;
        if (plotted.size() == 1) {
            value = (plotted[0][i + 1] - plotted[0][i]) / seconds;
        } else {
            for (const auto& plot : plotted) {
                const double d = (plot[i + 1] - plot[i]) / seconds;
                value += d * d;
            }
            value = std::sqrt(value);
        }
        velocity.append(value);
        vmax = std::max(vmax, std::abs(value));
    }
    return {{"curves", curvesOut}, {"velocity", velocity}, {"vmax", vmax}};
}
QJsonObject rowGraphKeys(const QJsonObject& clip, const QString& row) {
    const auto specs = inputs(row);
    const auto scales = displayScales(row);
    // The vertical range reads the whole clip, so scrolling does not rescale the graph.
    constexpr int fitSamples = 256;
    double lo = std::numeric_limits<double>::max();
    double hi = std::numeric_limits<double>::lowest();
    std::vector<SampledCurve> sampled;
    sampled.reserve(specs.size());
    for (size_t input = 0; input < specs.size(); ++input) {
        sampled.emplace_back(clip, specs[input], input < scales.size() ? scales[input] : 1);
        for (int i = 0; i <= fitSamples; ++i) {
            const double value = sampled[input].at(static_cast<double>(i) / fitSamples);
            lo = std::min(lo, value);
            hi = std::max(hi, value);
        }
    }
    QJsonArray keyed;
    const auto ps = properties(row);
    double previous = 0;
    bool first = true;
    for (const auto& time : times(clip, ps)) {
        const double ms = time.toDouble();
        QJsonArray values;
        for (const auto& curve : sampled) {
            values.append(curve.at(toT(clip, ms)));
        }
        QString easing = "linear";
        for (const auto& property : ps) {
            const auto found = helper("keyframeEasingAt", {clip, property, ms});
            if (found.isString()) {
                easing = found.toString();
                break;
            }
        }
        QJsonValue handles = QJsonValue::Null;
        if (!first) {
            const auto shape = bezierHandles(easing);
            if (!shape.isEmpty()) {
                handles = shape;
            }
        }
        keyed.append(QJsonObject{{"ms", ms}, {"values", values}, {"easing", easing}, {"handles", handles},
                                 {"previousMs", first ? QJsonValue(QJsonValue::Null) : QJsonValue(previous)}});
        previous = ms;
        first = false;
    }
    if (lo > hi) {
        lo = 0;
        hi = 0;
    }
    if (hi - lo < 1e-6) {
        lo -= 1;
        hi += 1;
    }
    const double pad = (hi - lo) * 0.12;
    return {{"lo", lo - pad}, {"hi", hi + pad}, {"keys", keyed}};
}
QJsonObject rowGraph(const QJsonObject& clip, const QString& row, double fromMs, double toMs, int samples) {
    return merged(rowGraphSamples(clip, row, fromMs, toMs, samples), rowGraphKeys(clip, row));
}
QJsonObject bezierHandles(const QString& easing) {
    const auto text = easing.trimmed();
    const auto form = [](double x1, double y1, double x2, double y2, bool exact = true) {
        return QJsonObject{{"x1", x1}, {"y1", y1}, {"x2", x2}, {"y2", y2}, {"exact", exact}};
    };
    if (text == "hold") {
        return {};
    }
    // y = t, t^3 and 1 - (1 - t)^3 are exact cubics with x = t.
    if (text == "easeIn") {
        return form(1.0 / 3, 0, 2.0 / 3, 0);
    }
    if (text == "easeOut") {
        return form(1.0 / 3, 1, 2.0 / 3, 1);
    }
    if (text == "easeInOut") {
        return form(0.65, 0, 0.35, 1, false);
    }
    static const QRegularExpression bezier(QStringLiteral(R"(^cubic-bezier\(([^,]+),([^,]+),([^,]+),([^,)]+)\)$)"));
    if (const auto match = bezier.match(text); match.hasMatch()) {
        std::array<double, 4> values{};
        bool valid = true;
        for (size_t i = 0; i < values.size(); ++i) {
            bool ok = false;
            values[i] = match.captured(static_cast<int>(i) + 1).trimmed().toDouble(&ok);
            valid = valid && ok;
        }
        if (valid) {
            return form(std::clamp(values[0], 0.0, 1.0), values[1], std::clamp(values[2], 0.0, 1.0), values[3]);
        }
    }
    return form(1.0 / 3, 1.0 / 3, 2.0 / 3, 2.0 / 3, text == "linear" || text.isEmpty());
}
QString bezierEasing(double x1, double y1, double x2, double y2) {
    const auto number = [](double value) { return QString::number(std::round(value * 10000) / 10000, 'g', 6); };
    return QStringLiteral("cubic-bezier(%1,%2,%3,%4)")
        .arg(number(std::clamp(x1, 0.0, 1.0)), number(y1), number(std::clamp(x2, 0.0, 1.0)), number(y2));
}
QStringList properties(const QString& row) {
    QStringList result;
    for (const auto& i : inputs(row)) {
        if (!result.contains(i.property)) {
            result.append(i.property);
        }
    }
    return result;
}
QJsonArray times(const QJsonObject& clip, const QStringList& ps) {
    QSet<double> found;
    for (const auto& item : curves(clip)) {
        const auto c = item.toObject();
        if (!ps.isEmpty() && !ps.contains(c["property"].toString())) {
            continue;
        }
        for (const auto& k : c["keyframes"].toArray()) {
            found.insert(std::floor(k.toObject()["t"].toDouble() * clip["durationMs"].toDouble() + 0.5));
        }
    }
    auto values = found.values();
    std::sort(values.begin(), values.end());
    QJsonArray result;
    for (double v : values) {
        result.append(v);
    }
    return result;
}
double inputValue(const QJsonObject& clip, const QString& row, int index, double atMs) {
    const auto specs = inputs(row);
    if (index < 0 || static_cast<size_t>(index) >= specs.size()) {
        return 0;
    }
    const auto& i = specs[static_cast<size_t>(index)];
    const double b = base(clip, i);
    return keys(clip, i.property).isEmpty() ? b : compose(i.property, b, valueAt(clip, i.property, atMs));
}
QJsonValue helper(const QString& name, const QJsonArray& a) {
    const auto c = a[0].toObject();
    const auto p = a[1].toString();
    const double ms = a[2].toDouble();
    if (name == "keyframeIdentity") {
        return identity(a[0].toString());
    }
    if (name == "isKeyframeAnimation") {
        return isAnimation(c);
    }
    if (name == "findKeyframeAnimation") {
        return animationIndex(c) < 0 ? QJsonValue(QJsonValue::Null) : QJsonValue(animation(c));
    }
    if (name == "keyframePropertiesFor") {
        auto ps = allProperties;
        if (c["mediaType"] != "model3d") {
            ps = ps.mid(0, 5);
        }
        return array(ps);
    }
    if (name == "composeKeyframeValue") {
        return compose(a[0].toString(), a[1].toDouble(), ms);
    }
    if (name == "keyframeValueForComposed") {
        return inverse(a[0].toString(), a[1].toDouble(), ms);
    }
    if (name == "keyframeTimesMs") {
        if (a.size() > 1 && a[1].isArray() && a[1].toArray().isEmpty()) {
            return QJsonArray{};
        }
        return times(c, strings(a[1]));
    }
    if (name == "keyframeValueAt") {
        return valueAt(c, p, ms);
    }
    if (name == "hasKeyframeAt") {
        return has(c, p, ms);
    }
    if (name == "isPropertyKeyframed") {
        return !keys(c, p).isEmpty();
    }
    if (name == "setKeyframe") {
        return set(c, p, ms, a[3].toDouble());
    }
    if (name == "setKeyframes") {
        return setMany(c, a[1].toArray(), ms);
    }
    if (name == "removeKeyframe") {
        return update(c, {p}, "remove", ms);
    }
    if (name == "removeKeyframes") {
        return update(c, strings(a[1]), "remove", ms);
    }
    if (name == "clearKeyframes") {
        return update(c, strings(a[1]), "clear", 0);
    }
    if (name == "moveKeyframes") {
        return update(c, strings(a[1]), "move", ms, a[3].toDouble());
    }
    if (name == "setKeyframeEasing") {
        return setEasing(c, strings(a[1]), ms, a[3].toString());
    }
    if (name == "adjacentKeyframeMs") {
        const auto ts = times(c, strings(a[1]));
        if (a[3].toInt() == 1) {
            for (const auto& t : ts) {
                if (t.toDouble() > ms + 0.5) {
                    return t;
                }
            }
        } else {
            for (auto i = ts.size(); i > 0; --i) {
                if (ts[i - 1].toDouble() < ms - 0.5) {
                    return ts[i - 1];
                }
            }
        }
        return QJsonValue::Null;
    }
    if (name == "moveKeyframeSet") {
        return moveMany(c, a[1].toObject()).toObject()["animations"];
    }
    if (name == "easeKeyframeSet") {
        return easingMany(c, a[1].toObject()).toObject()["animations"];
    }
    if (name == "rowGraphValues") {
        return rowGraph(c, p, ms, a[3].toDouble(), a[4].toInt())["curves"];
    }
    if (name == "keyframeEasingAt") {
        const auto override = easingOverride(c, p);
        for (const auto& k : keys(c, p)) {
            const auto kf = k.toObject();
            if (std::abs(kf["t"].toDouble() - toT(c, ms)) < epsilon) {
                return override.isUndefined() ? QJsonValue(kf["easing"].toString("linear")) : override;
            }
        }
        return QJsonValue::Null;
    }
    if (name == "curveValueAtT") {
        return curveValue(a[0].toArray(), a[1].toDouble());
    }
    if (name == "keyframeRowFor") {
        for (const auto& value : rowSpecs()) {
            const auto row = value.toObject();
            if (properties(row["id"].toString()).contains(a[0].toString())) {
                return row["id"];
            }
        }
        return QJsonValue::Null;
    }
    if (name == "rowProperties") {
        return array(properties(a[0].toString()));
    }
    if (name == "isRowKeyframed") {
        return rowKeyed(c, p);
    }
    if (name == "rowHasKeyframeAt") {
        return rowHas(c, p, ms);
    }
    if (name == "rowKeyframeTimesMs") {
        return times(c, properties(p));
    }
    if (name == "inputValueAt") {
        return inputValue(c, p, a[2].toInt(), a[3].toDouble());
    }
    if (name == "toggleRowStopwatch") {
        return stopwatch(c, p, a[2]);
    }
    if (name == "toggleRowKeyframeAt") {
        return toggle(c, p, a[2]);
    }
    if (name == "commitInputValue") {
        return commit(c, p, a[2].toInt(), a[3].toDouble(std::numeric_limits<double>::quiet_NaN()), a[4]);
    }
    if (name == "gizmoTransformPatch") {
        return gizmo(c, a[1].toObject(), a[2]);
    }
    return QJsonValue::Null;
}
QJsonObject edit(QJsonObject document, const QJsonObject& payload) {
    auto clips = document["clips"].toArray();
    for (qsizetype i = 0; i < clips.size(); ++i) {
        const auto c = clips[i].toObject();
        if (c["id"] != payload["clipId"] || c["locked"].toBool()) {
            continue;
        }
        for (const auto& track : document["tracks"].toArray()) {
            if (track.toObject()["id"] == c["trackId"] && track.toObject()["locked"].toBool()) {
                return document;
            }
        }
        const auto action = payload["action"].toString();
        const auto row = payload["row"].toString();
        const auto at = payload.contains("atMs") ? payload["atMs"] : QJsonValue(QJsonValue::Null);
        // A switched-off group shows its rows disabled, and Alt+K and the assistant respect that.
        if (rowSwitchedOff(c, row)) {
            return document;
        }
        QJsonValue patch;
        if (action == "input") {
            patch = commit(c, row, payload["input"].toInt(),
                           payload["value"].toDouble(std::numeric_limits<double>::quiet_NaN()), at);
        } else if (action == "stopwatch") {
            patch = stopwatch(c, row, at);
        } else if (action == "toggle") {
            patch = toggle(c, row, at);
        } else if (action == "delete") {
            patch = rowHas(c, row, at.toDouble()) ? toggle(c, row, at) : QJsonValue(QJsonValue::Null);
        } else if (action == "move" || action == "easing") {
            auto ps = properties(row);
            if (row.isEmpty()) {
                for (const auto& v : curves(c)) {
                    ps.append(v.toObject()["property"].toString());
                }
            }
            patch = QJsonObject{
                {"animations", action == "move"
                                   ? update(c, ps, "move", payload["fromMs"].toDouble(), payload["toMs"].toDouble())
                                   : setEasing(c, ps, at.toDouble(), payload["easing"].toString())}};
        } else if (action == "field") {
            const auto field = payload["field"].toString();
            const double value = payload["value"].toDouble(std::numeric_limits<double>::quiet_NaN());
            if (!std::isfinite(value)) {
                return document;
            }
            auto t = transform(c);
            if (field == "anchorX" || field == "anchorY") {
                t.insert("anchor", merged(t["anchor"].toObject(),
                                          {{field == "anchorX" ? "x" : "y", std::clamp(value, 0.0, 1.0)}}));
            } else if (QStringList{"rotationX", "rotationY", "depthPx", "perspective"}.contains(field)) {
                if (field == "perspective" && value <= 0) {
                    return document;
                }
                t.insert(field, value);
            } else {
                return document;
            }
            patch = QJsonObject{{"transform", t}};
        } else if (action == "animations") {
            patch = QJsonObject{{"animations", payload["animations"]}};
        } else if (action == "moveMany") {
            patch = moveMany(c, payload);
        } else if (action == "easingMany") {
            patch = easingMany(c, payload);
        } else if (action == "deleteMany") {
            patch = deleteMany(c, payload);
        } else if (action == "bypass") {
            if (const auto next = bypass(c, payload)) {
                clips[i] = *next;
                document.insert("clips", clips);
            }
            return document;
        }
        if (patch.isObject()) {
            clips[i] = merged(c, patch.toObject());
            document.insert("clips", clips);
        }
        return document;
    }
    return document;
}
QJsonArray rowSpecs() {
    return {
        QJsonObject{
            {"id", "position"},
            {"label", "Position"},
            {"inputs", QJsonArray{QJsonObject{{"label", "Position X"}, {"unit", "px"}, {"decimals", 0}, {"step", 1}},
                                  QJsonObject{{"label", "Position Y"}, {"unit", "px"}, {"decimals", 0}, {"step", 1}}}}},
        QJsonObject{
            {"id", "scale"},
            {"label", "Scale"},
            {"inputs",
             QJsonArray{
                 QJsonObject{{"label", "Scale X"}, {"unit", "×"}, {"decimals", 2}, {"step", 0.01}, {"min", 0.01}},
                 QJsonObject{{"label", "Scale Y"}, {"unit", "×"}, {"decimals", 2}, {"step", 0.01}, {"min", 0.01}}}}},
        QJsonObject{{"id", "rotation"},
                    {"label", "Rotation"},
                    {"inputs", QJsonArray{QJsonObject{{"label", "Rotation in degrees"},
                                                      {"unit", "°"},
                                                      {"decimals", 1},
                                                      {"step", 0.5},
                                                      {"displayScale", 180 / std::acos(-1.0)}}}}},
        QJsonObject{
            {"id", "anchor"},
            {"label", "Anchor"},
            {"inputs", QJsonArray{
                           QJsonObject{{"label", "Anchor X"}, {"unit", ""}, {"decimals", 2}, {"step", 0.01}, {"min", 0}, {"max", 1}},
                           QJsonObject{{"label", "Anchor Y"}, {"unit", ""}, {"decimals", 2}, {"step", 0.01}, {"min", 0}, {"max", 1}}}}},
        QJsonObject{{"id", "rotationX"},
                    {"label", "Rotation X"},
                    {"inputs", QJsonArray{QJsonObject{
                                   {"label", "Rotation X in degrees"}, {"unit", "°"}, {"decimals", 1}, {"step", 0.5}}}}},
        QJsonObject{{"id", "rotationY"},
                    {"label", "Rotation Y"},
                    {"inputs", QJsonArray{QJsonObject{
                                   {"label", "Rotation Y in degrees"}, {"unit", "°"}, {"decimals", 1}, {"step", 0.5}}}}},
        QJsonObject{{"id", "perspective"},
                    {"label", "Perspective"},
                    {"inputs", QJsonArray{QJsonObject{
                                   {"label", "Perspective"}, {"unit", "px"}, {"decimals", 0}, {"step", 1}, {"min", 1}}}}},
        QJsonObject{{"id", "depth"},
                    {"label", "Depth"},
                    {"inputs", QJsonArray{QJsonObject{{"label", "Depth"}, {"unit", "px"}, {"decimals", 0}, {"step", 1}}}}},
        QJsonObject{{"id", "opacity"},
                    {"label", "Opacity"},
                    {"inputs", QJsonArray{QJsonObject{{"label", "Opacity"},
                                                      {"unit", "%"},
                                                      {"decimals", 0},
                                                      {"step", 1},
                                                      {"displayScale", 100},
                                                      {"min", 0},
                                                      {"max", 100}}}}},
        QJsonObject{{"id", "volume"},
                    {"label", "Level"},
                    {"inputs", QJsonArray{QJsonObject{{"label", "Volume level"},
                                                      {"unit", "dB"},
                                                      {"decimals", 1},
                                                      {"step", 0.5},
                                                      {"min", -60},
                                                      {"max", 12}}}}},
        QJsonObject{
            {"id", "cameraOrbit"},
            {"label", "Orbit"},
            {"inputs",
             QJsonArray{QJsonObject{{"label", "Camera azimuth"}, {"unit", "°"}, {"decimals", 1}, {"step", 1}},
                        QJsonObject{{"label", "Camera elevation"}, {"unit", "°"}, {"decimals", 1}, {"step", 1}}}}},
        QJsonObject{{"id", "cameraFov"},
                    {"label", "Field of view"},
                    {"inputs", QJsonArray{QJsonObject{{"label", "Camera field of view"},
                                                      {"unit", "°"},
                                                      {"decimals", 1},
                                                      {"step", 1},
                                                      {"min", 1},
                                                      {"max", 170}}}}},
        QJsonObject{
            {"id", "cameraZoom"},
            {"label", "Zoom"},
            {"inputs", QJsonArray{QJsonObject{
                           {"label", "Camera zoom"}, {"unit", "×"}, {"decimals", 2}, {"step", 0.01}, {"min", 0.05}}}}}};
}
} // namespace nt::keyframes
