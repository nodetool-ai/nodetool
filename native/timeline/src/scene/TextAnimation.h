#pragma once
// The animated text style of a clip, for the flex layout: a port of the text
// parts of `resolveAnimatedStyleTracks` (the `text.fontSizePx`,
// `text.letterSpacingPx` and `text.lineHeight` style tracks) and of
// `resolveAnimatedTextContent` (the ticker and decode text animators) in
// packages/timeline/src/animation/styleTracks.ts. The web lays a flex tree out
// again each frame with these (`layoutClipsAt` in sceneModel.ts).
#include "scene/Animation.h"
#include "scene/TextBlock.h"

#include <QJsonArray>
#include <QJsonObject>
#include <QString>

#include <vector>

namespace nt::scene {

// The text style at `localMs` (clip-local, after stepped time): `base` with
// the style tracks and text animators of `animations` (the clip's raw
// `animations`) applied, each through its compiled window.
TextStyle animatedTextStyle(const TextStyle& base, const QJsonArray& animations,
                            const std::vector<CompiledAnimation>& compiled, double localMs);

// The ticker animator's text at an eased progress.
QString tickerText(const QJsonObject& animator, double eased);

// JavaScript's `Number.prototype.toFixed`, for 0..100 digits.
QString jsToFixed(double value, int digits);

// `integer.replace(/\B(?=(\d{3})+(?!\d))/g, separator)`.
QString groupThousands(const QString& integer, const QString& separator);

}  // namespace nt::scene
