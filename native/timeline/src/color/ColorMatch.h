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
// Only per-pixel colour passes from planChain, with RGBA8 intermediates.
QImage applyGrade(const QImage &, const QJsonArray &effects);
// Replaces the first LGG, preserving unrelated fields and effect order.
// Scales inspector:color saturation only when abs(saturationScale - 1) > .005, and always
// enables that effect, because the search treats it as enabled.
QJsonArray applyMatchToEffects(const QJsonArray &, const MatchResult &, const QString &newId);
QJsonArray probeEffects(const QJsonArray &);
}
