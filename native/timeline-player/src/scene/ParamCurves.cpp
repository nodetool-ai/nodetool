#include "scene/ParamCurves.h"

#include "scene/Animation.h"

#include <QSet>

#include <algorithm>
#include <cmath>

namespace nt::scene {

bool isParamCurveProperty(const QString& property) { return !channelFromName(property).has_value(); }

QString effectCurveName(const QString& effectId, const QString& param) {
    return QStringLiteral("effect:%1:%2").arg(effectId, param);
}

std::optional<EffectCurveName> parseEffectCurveName(const QString& property) {
    if (!property.startsWith(u"effect:")) return std::nullopt;
    const auto split = property.lastIndexOf(u':');
    if (split <= 6 || split + 1 >= property.size()) return std::nullopt;
    return EffectCurveName{property.mid(7, split - 7), property.mid(split + 1)};
}

QJsonArray withoutOrphanEffectCurves(const QJsonArray& curves, const QJsonArray& effects) {
    QSet<QString> ids;
    for (const auto& effect : effects) {
        ids.insert(effect.toObject().value(u"id").toString());
    }
    QJsonArray kept;
    for (const auto& curve : curves) {
        const auto name = parseEffectCurveName(curve.toObject().value(u"property").toString());
        if (!name || ids.contains(name->effectId)) {
            kept.append(curve);
        }
    }
    return kept;
}

QJsonArray ParamCurves::keyedEffects(QJsonArray effects, double t) const {
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

std::shared_ptr<const ParamCurves> ParamCurves::parse(const QJsonArray& curves) {
    std::shared_ptr<ParamCurves> result;
    for (const auto& value : curves) {
        const auto curve = value.toObject();
        Curve parsed;
        parsed.property = curve.value(u"property").toString();
        for (const auto& key : curve.value(u"keyframes").toArray()) {
            const auto k = key.toObject();
            const double t = k.value(u"t").toDouble(std::nan(""));
            const double v = k.value(u"value").toDouble(std::nan(""));
            if (std::isfinite(t) && std::isfinite(v)) {
                // A key a trim cut off keeps a `t` outside 0..1 and still shapes the curve at the edge.
                parsed.points.push_back({t, v, k.value(u"easing").toString().toStdString()});
            }
        }
        if (parsed.property.isEmpty() || parsed.points.empty()) {
            continue;
        }
        std::stable_sort(parsed.points.begin(), parsed.points.end(), [](const Point& a, const Point& b) { return a.t < b.t; });
        if (!result) {
            result = std::make_shared<ParamCurves>();
        }
        result->m_curves.push_back(std::move(parsed));
    }
    return result;
}

const ParamCurves::Curve* ParamCurves::find(QStringView property) const {
    const auto found = std::find_if(m_curves.begin(), m_curves.end(), [property](const Curve& c) { return c.property == property; });
    return found == m_curves.end() ? nullptr : &*found;
}

double ParamCurves::valueOf(const Curve& curve, double t) {
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

std::optional<double> ParamCurves::value(QStringView property, double t) const {
    const auto* curve = find(property);
    return curve ? std::optional<double>(valueOf(*curve, t)) : std::nullopt;
}

}  // namespace nt::scene
