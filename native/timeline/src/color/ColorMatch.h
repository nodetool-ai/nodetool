// Ported from FilmCraft (https://github.com/storytold/filmcraft) crates/render/src/color_match.rs at 8c171a0. MIT, see licenses/FilmCraft-MIT.txt.
#pragma once
#include <QImage>
#include <QJsonArray>
#include <QString>
#include <array>
#include <functional>
namespace nt::color {
struct MatchInput {
    // Current is the probe rendered with probeEffects. Both frames are opaque.
    QImage current, reference;
    QJsonArray effects;
    bool protectSkin = true;
    std::function<bool()> cancelled;
    QJsonArray trackEffects; // From convertTrackEffects. The probe is rendered without them.
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
// Only the colour and vignette passes from planChain, with RGBA8 intermediates.
QImage applyGrade(const QImage &, const QJsonArray &effects, const QJsonArray &trackEffects = {});
// Replaces the first LGG, preserving unrelated fields and effect order. A new one goes before the
// first curves or vignette, or at the end, where the panel also puts it.
// Scales inspector:color saturation only when abs(saturationScale - 1) > .005, and always
// enables that effect, because the search treats it as enabled.
QJsonArray applyMatchToEffects(const QJsonArray &, const MatchResult &, const QString &newId);
// The list to render the shot with, so the solver sees the picture just before its correction runs:
// the passes it models are off, because it runs them itself in order, and so is everything after
// the correction's place in the chain. Effects before that place stay on.
QJsonArray probeEffects(const QJsonArray &);
}
