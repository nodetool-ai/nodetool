#include "scene/SideCurves.h"

#include "scene/Animation.h"

#include <QSet>
#include <QUuid>

#include <algorithm>
#include <cmath>

namespace nt::scene {

bool isSideCurveAnimation(const QJsonObject& animation) {
    return animation.value(u"params").toObject().value(u"sideCurves").toBool();
}

bool isSideCurveProperty(const QString& property) { return !channelFromName(property).has_value(); }

QJsonArray sideCurveList(const QJsonArray& animations) {
    QJsonArray result;
    for (const auto& value : animations) {
        const auto animation = value.toObject();
        if (!isSideCurveAnimation(animation)) {
            continue;
        }
        for (const auto& curve : animation.value(u"custom").toObject().value(u"curves").toArray()) {
            result.append(curve);
        }
    }
    return result;
}

QJsonArray withSideCurves(const QJsonArray& animations, const QJsonArray& curves, double clipDurationMs) {
    QJsonArray kept;
    QStringList ids;
    for (const auto& value : animations) {
        const auto animation = value.toObject();
        if (isSideCurveAnimation(animation)) {
            ids.append(animation.value(u"id").toString());
        } else {
            kept.append(value);
        }
    }
    for (qsizetype first = 0, index = 0; first < curves.size(); first += kMaxCurvesPerAnimation, ++index) {
        QJsonArray chunk;
        for (qsizetype i = first; i < std::min(first + kMaxCurvesPerAnimation, curves.size()); ++i) {
            chunk.append(curves[i]);
        }
        // A loop gives both halves of a split on the web a copy of the curves. At zero intensity
        // this preset moves nothing, even if someone switches it on there.
        kept.append(QJsonObject{{"id", index < ids.size() && !ids[index].isEmpty() ? ids[index] : QUuid::createUuid().toString(QUuid::Id128)},
                                {"role", "loop"},
                                {"preset", "breathe"},
                                {"durationMs", clipDurationMs > 0 ? clipDurationMs : 1.0},
                                {"delayMs", 0},
                                {"enabled", false},
                                {"params", QJsonObject{{"intensity", 0}, {"sideCurves", true}}},
                                {"custom", QJsonObject{{"curves", chunk}}}});
    }
    return kept;
}

QString effectCurveName(const QString& effectId, const QString& param) {
    return QStringLiteral("effect:%1:%2").arg(effectId, param);
}

std::optional<EffectCurveName> parseEffectCurveName(const QString& property) {
    if (!property.startsWith(u"effect:")) return std::nullopt;
    const auto split = property.lastIndexOf(u':');
    if (split <= 6 || split + 1 >= property.size()) return std::nullopt;
    return EffectCurveName{property.mid(7, split - 7), property.mid(split + 1)};
}

QJsonArray withoutOrphanEffectCurves(const QJsonArray& animations, const QJsonArray& effects, double clipDurationMs) {
    QSet<QString> ids;
    for (const auto& effect : effects) {
        ids.insert(effect.toObject().value(u"id").toString());
    }
    QJsonArray kept;
    bool dropped = false;
    for (const auto& curve : sideCurveList(animations)) {
        const auto name = parseEffectCurveName(curve.toObject().value(u"property").toString());
        if (name && !ids.contains(name->effectId)) {
            dropped = true;
        } else {
            kept.append(curve);
        }
    }
    return dropped ? withSideCurves(animations, kept, clipDurationMs) : animations;
}

QJsonArray SideCurves::keyedEffects(QJsonArray effects, double t) const {
    for (const auto& curve : m_curves) {
        const auto name = parseEffectCurveName(curve.property);
        if (!name) {
            continue;
        }
        for (qsizetype i = 0; i < effects.size(); ++i) {
            auto effect = effects[i].toObject();
            if (effect.value(u"id").toString() == name->effectId) {
                effect.insert(name->param, valueOf(curve, t));
                effects[i] = effect;
                break;
            }
        }
    }
    return effects;
}

std::shared_ptr<const SideCurves> SideCurves::parse(const QJsonArray& animations) {
    std::shared_ptr<SideCurves> result;
    for (const auto& value : sideCurveList(animations)) {
        const auto curve = value.toObject();
        Curve parsed;
        parsed.property = curve.value(u"property").toString();
        for (const auto& key : curve.value(u"keyframes").toArray()) {
            const auto k = key.toObject();
            const double t = k.value(u"t").toDouble(std::nan(""));
            const double v = k.value(u"value").toDouble(std::nan(""));
            if (std::isfinite(t) && std::isfinite(v)) {
                parsed.points.push_back({std::clamp(t, 0.0, 1.0), v, k.value(u"easing").toString().toStdString()});
            }
        }
        if (parsed.property.isEmpty() || parsed.points.empty()) {
            continue;
        }
        std::stable_sort(parsed.points.begin(), parsed.points.end(), [](const Point& a, const Point& b) { return a.t < b.t; });
        if (!result) {
            result = std::make_shared<SideCurves>();
        }
        result->m_curves.push_back(std::move(parsed));
    }
    return result;
}

const SideCurves::Curve* SideCurves::find(QStringView property) const {
    const auto found = std::find_if(m_curves.begin(), m_curves.end(), [property](const Curve& c) { return c.property == property; });
    return found == m_curves.end() ? nullptr : &*found;
}

double SideCurves::valueOf(const Curve& curve, double t) {
    const auto& points = curve.points;
    if (t <= points.front().t) {
        return points.front().value;
    }
    if (t >= points.back().t) {
        return points.back().value;
    }
    const auto end = std::lower_bound(points.begin(), points.end(), t, [](const Point& p, double at) { return p.t < at; });
    const auto start = std::prev(end);
    const double span = end->t - start->t;
    const double f = span > 0 ? ease(end->easing.empty() ? std::string("linear") : end->easing, (t - start->t) / span) : 1;
    return start->value + (end->value - start->value) * f;
}

std::optional<double> SideCurves::value(QStringView property, double t) const {
    const auto* curve = find(property);
    return curve ? std::optional<double>(valueOf(*curve, t)) : std::nullopt;
}

}  // namespace nt::scene
