#pragma once

// Keyframes for parameters the shared animation model has no channel for: a clip's volume,
// crop, corner radius, perspective, depth and effect parameters. They live in the clip's optional
// `paramCurves` field, one curve per parameter, in the per-property shape of `custom.curves` and
// normalized over the clip like every hand-set keyframe. A name this build does not read is kept
// and ignored. Names with a channel stay on the keyframe animation, where web draws them.

#include <QJsonArray>
#include <QJsonObject>
#include <QString>

#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace nt::scene {

// `paramCurves` and each curve's keys in packages/protocol/src/api-schemas/timeline.ts.
inline constexpr qsizetype kMaxParamCurves = 256;
inline constexpr qsizetype kMaxParamCurveKeys = 4096;

// A property with no channel in the shared model is stored in `paramCurves`.
bool isParamCurveProperty(const QString& property);

// A video effect's numeric parameter is the curve `effect:<effectId>:<param>`.
QString effectCurveName(const QString& effectId, const QString& param);
struct EffectCurveName {
    QString effectId;
    QString param;
};
// Nothing when the name does not key an effect. An effect id can hold a colon, a parameter cannot.
std::optional<EffectCurveName> parseEffectCurveName(const QString& property);
// `curves` without those of effects that are no longer in `effects`.
QJsonArray withoutOrphanEffectCurves(const QJsonArray& curves, const QJsonArray& effects);

// The curves of one clip, parsed once. Shared by the GUI and render threads.
class ParamCurves {
public:
    struct Point {
        double t = 0;
        double value = 0;
        std::string easing;
    };
    struct Curve {
        QString property;
        std::vector<Point> points;  // sorted by t, never empty
    };
    // Null when the clip has no usable curves.
    static std::shared_ptr<const ParamCurves> parse(const QJsonArray& curves);
    const std::vector<Curve>& curves() const { return m_curves; }
    const Curve* find(QStringView property) const;
    // The curve at `t` in 0..1 over the clip, or nothing when the property has no keys.
    std::optional<double> value(QStringView property, double t) const;
    // The same for a curve already found.
    static double valueOf(const Curve& curve, double t);
    // `effects` with each keyed parameter at its value at `t`.
    QJsonArray keyedEffects(QJsonArray effects, double t) const;

private:
    std::vector<Curve> m_curves;
};

}  // namespace nt::scene
