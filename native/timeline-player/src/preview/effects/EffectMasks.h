#pragma once
#include <QImage>
#include <QJsonArray>
#include <vector>

namespace nt::effects {
// Port of packages/timeline/src/effectMasks.ts. Keep the two identical: the
// parity fixtures compare them.
QJsonArray activeEffectMasks(const QJsonArray &masks);
// Combined coverage for an outW x outH window whose pixel (i, j) samples source
// pixel (originX + i + 0.5, originY + j + 0.5). Empty when no mask is active.
std::vector<float> effectMaskCoverage(const QJsonArray &masks, int sourceWidth, int sourceHeight, int outWidth,
                                      int outHeight, int originX = 0, int originY = 0);
// The coverage as RGBA8 with every channel equal to it (valid premultiplied).
QImage effectMaskImage(const std::vector<float> &coverage, int width, int height);
} // namespace nt::effects
