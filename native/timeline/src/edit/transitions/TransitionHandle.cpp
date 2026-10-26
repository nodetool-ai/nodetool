#include "TransitionHandle.h"
#include "edit/ClipOps.h"
#include "scene/Animation.h"
#include <QJsonArray>
#include <algorithm>
#include <cmath>
#include <vector>

namespace nt::edit::transitions {
namespace {
constexpr double epsilonMs = 1e-6;
QJsonObject sliceCurve(QJsonObject curve, double from, double to) {
    const auto keys = curve.value("keyframes").toArray();
    if (keys.isEmpty()) { return curve; }
    std::vector<double> times;
    times.reserve(static_cast<size_t>(keys.size()));
    for (const auto& key : keys) {
        const auto ms = key.toObject().value("sourceMs");
        if (!ms.isDouble() || !std::isfinite(ms.toDouble())) { return curve; }
        times.push_back(ms.toDouble());
    }
    const auto sample = [&](double at) {
        if (at <= times.front()) { return keys.first().toObject().value("value").toDouble(); }
        if (at >= times.back()) { return keys.last().toObject().value("value").toDouble(); }
        for (size_t i = 1; i < times.size(); ++i) {
            if (at > times[i]) { continue; }
            const auto previous = keys[static_cast<qsizetype>(i - 1)].toObject();
            const auto current = keys[static_cast<qsizetype>(i)].toObject();
            const auto span = times[i] - times[i - 1];
            const double t = span > 0 ? (at - times[i - 1]) / span : 0;
            const double eased = nt::scene::ease(current.value("easing").toString("linear").toStdString(), t);
            return previous.value("value").toDouble() + (current.value("value").toDouble() - previous.value("value").toDouble()) * eased;
        }
        return keys.last().toObject().value("value").toDouble();
    };
    QJsonArray kept;
    for (qsizetype i = 0; i < keys.size(); ++i) {
        if (times[static_cast<size_t>(i)] >= from - epsilonMs && times[static_cast<size_t>(i)] <= to + epsilonMs) { kept.append(keys[i]); }
    }
    QJsonArray sliced;
    if (kept.isEmpty() || kept.first().toObject().value("sourceMs").toDouble() > from + epsilonMs) {
        sliced.append(QJsonObject{{"t", 0}, {"sourceMs", from}, {"value", sample(from)}});
    }
    for (const auto& key : kept) { sliced.append(key); }
    if (kept.isEmpty() || kept.last().toObject().value("sourceMs").toDouble() < to - epsilonMs) {
        QJsonObject boundary{{"t", 1}, {"sourceMs", to}, {"value", sample(to)}};
        for (size_t i = 0; i < times.size(); ++i) {
            if (times[i] >= to) {
                const auto key = keys[static_cast<qsizetype>(i)].toObject();
                if (key.contains("easing")) { boundary.insert("easing", key.value("easing")); }
                break;
            }
        }
        sliced.append(boundary);
    }
    const double first = sliced.first().toObject().value("sourceMs").toDouble();
    const double span = sliced.last().toObject().value("sourceMs").toDouble() - first;
    for (qsizetype i = 0; i < sliced.size(); ++i) {
        auto key = sliced[i].toObject(); key.insert("t", span > 0 ? (key.value("sourceMs").toDouble() - first) / span : 0); sliced[i] = key;
    }
    curve.insert("keyframes", sliced);
    return curve;
}
std::optional<double> sourceDuration(const QJsonObject& clip) {
    const auto type = clip.value("mediaType").toString();
    if (type != "video" && type != "audio") { return {}; }
    const auto asset = clip.value("currentAssetId");
    if (!asset.isString() || asset.toString().isEmpty()) { return {}; }
    for (const auto& value : clip.value("versions").toArray()) {
        const auto version = value.toObject();
        const auto duration = version.value("durationMs");
        if (version.value("assetId") == asset && duration.isDouble() && std::isfinite(duration.toDouble()) && duration.toDouble() > 0) { return duration.toDouble(); }
    }
    return {};
}
}
std::optional<QJsonObject> extendHandle(const QJsonObject& clip, double missingMs) {
    if (!clip.value("timeRemap").toObject().value("keyframes").toArray().isEmpty()) { return {}; }
    const double rate = sourceRate(clip);
    const double in = clip.value("inPointMs").toDouble(0);
    const double out = clip.value("outPointMs").toDouble(in + clipDurationMs(clip) * rate);
    const double duration = clipDurationMs(clip) + missingMs;
    double nextOut = out + missingMs * rate;
    const auto limit = sourceDuration(clip);
    if (limit && nextOut > *limit && nextOut - *limit <= epsilonMs) { nextOut = *limit; }
    if (duration <= 0 || in < 0 || clipStartMs(clip) < 0 || (limit && nextOut > *limit)) { return {}; }
    auto next = clip;
    next.insert("startMs", clipStartMs(clip)); next.insert("durationMs", duration);
    next.insert("inPointMs", in); next.insert("outPointMs", nextOut);
    if (clip.contains("animations")) {
        auto animations = clip.value("animations").toArray();
        for (qsizetype i = 0; i < animations.size(); ++i) {
            auto animation = animations[i].toObject(); auto custom = animation.value("custom").toObject();
            auto curves = custom.value("curves").toArray();
            if (animation.value("preset").toString() != "custom" || custom.value("timeBase").toString() != "source" || curves.isEmpty()) { continue; }
            for (qsizetype j = 0; j < curves.size(); ++j) { curves[j] = sliceCurve(curves[j].toObject(), in, nextOut); }
            custom.insert("curves", curves); animation.insert("custom", custom); animation.insert("delayMs", 0);
            if (animation.value("role").toString() != "loop") { animation.insert("durationMs", std::max(1.0, duration)); }
            animations[i] = animation;
        }
        next.insert("animations", animations);
    }
    return next;
}
}
