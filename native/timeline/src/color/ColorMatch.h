// Ported from FilmCraft (https://github.com/storytold/filmcraft) crates/render/src/color_match.rs at 8c171a0. MIT, see licenses/FilmCraft-MIT.txt.
#pragma once
#include "preview/WorkingFormat.h"
#include <QImage>
#include <QJsonArray>
#include <QString>
#include <array>
#include <functional>
namespace nt::color {
struct MatchInput {
    // Current is the probe rendered with probeEffects. Both frames are opaque.
    // RGBA8 retains byte analysis. FP16 callers supply captureWorkingAt images
    // before delivery quantization/dither. Their encoded transfer is unchanged.
    QImage current, reference;
    QJsonArray effects;
    bool protectSkin = true;
    std::function<bool()> cancelled;
    QJsonArray trackEffects; // From convertTrackEffects. The probe is rendered without them.
    nt::WorkingFormat workingFormat = nt::WorkingFormat::Rgba8; // The route being matched, not the delivery format.
};
struct MatchResult {
    bool ok = false, wasCancelled = false;
    QString error;
    std::array<double, 3> lift{0, 0, 0}, gamma{1, 1, 1}, gain{1, 1, 1};
    double saturationScale = 1; // Multiplies inspector:color saturation.
    double before = 0, after = 0;
    double differenceBefore = 0, differenceAfter = 0;
};
MatchResult solveMatch(const MatchInput &);
// Euclidean distance between mean Oklab colours after bar trimming and box resizing.
double meanColorDifference(const QImage &a, const QImage &b);
QImage trimBlackBars(const QImage &);
// Only the colour and vignette passes from planChain, rounded to the route storage.
// FP16 analysis accepts opaque typed working captures and returns straight FP32.
QImage applyGrade(const QImage &, const QJsonArray &effects, const QJsonArray &trackEffects = {},
                  nt::WorkingFormat format = nt::WorkingFormat::Rgba8);
// Replaces the first LGG, preserving unrelated fields and effect order. A new one goes before the
// first curves or vignette, or at the end, where the panel also puts it.
// Scales inspector:color saturation only when abs(saturationScale - 1) > .005, and always
// enables that effect, because the search treats it as enabled.
QJsonArray applyMatchToEffects(const QJsonArray &, const MatchResult &, const QString &newId);
// The list to render the shot with, so the solver sees the picture just before its correction runs:
// the passes it models are off, because it runs them itself in order, and so is everything after
// the correction's place in the chain, and blur, which the renderer always runs after the grade.
// Effects before that place stay on.
QJsonArray probeEffects(const QJsonArray &);
// The type of an enabled effect after the correction's place that changes colors in a way the
// solver cannot run, or an empty string. Match cannot promise a result through one.
QString colorEffectAfterCorrection(const QJsonArray &);
}
