#pragma once

// Keyframes for parameters the shared animation model has no channel for: a clip's volume,
// crop and effect parameters. One curve per parameter, in the per-property shape of
// `custom.curves`, normalized over the clip like every hand-set keyframe.
//
// They sit on animations of their own: a switched-off stock preset at zero intensity, marked by
// `params.sideCurves`, with the curves in its `custom` block. The web's schema keeps that through a
// save, its compiler skips it and its validator accepts it. These names cannot share the keyframe
// animation, because one unknown name makes the web skip that whole animation, and an unknown
// preset fails the validator, which stops the web's agents writing the document. The schema refuses
// more than 16 curves on one animation. See docs/web-followups.md.

#include <QJsonArray>
#include <QJsonObject>
#include <QString>

#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace nt::scene {

// `customClipAnimation.curves` in packages/protocol/src/api-schemas/timeline.ts.
inline constexpr qsizetype kMaxCurvesPerAnimation = 16;

bool isSideCurveAnimation(const QJsonObject& animation);
// A property with no channel in the shared model is stored on a side animation.
bool isSideCurveProperty(const QString& property);
// Every curve on the side animations, in document order.
QJsonArray sideCurveList(const QJsonArray& animations);
// `animations` with its side animations holding `curves`. Other animations keep their places, and
// side animations keep their ids in order. No curves means no side animations.
QJsonArray withSideCurves(const QJsonArray& animations, const QJsonArray& curves, double clipDurationMs);

// A video effect's numeric parameter is the curve `effect:<effectId>:<param>`.
QString effectCurveName(const QString& effectId, const QString& param);
struct EffectCurveName {
    QString effectId;
    QString param;
};
// Nothing when the name does not key an effect. An effect id can hold a colon, a parameter cannot.
std::optional<EffectCurveName> parseEffectCurveName(const QString& property);
// `animations` without the curves of effects that are no longer in `effects`.
QJsonArray withoutOrphanEffectCurves(const QJsonArray& animations, const QJsonArray& effects, double clipDurationMs);

// The curves of one clip, parsed once. Shared by the GUI and render threads.
class SideCurves {
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
    // Null when the clip has no side curves.
    static std::shared_ptr<const SideCurves> parse(const QJsonArray& animations);
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
