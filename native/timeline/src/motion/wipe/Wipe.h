#pragma once
#include "scene/Animation.h"
#include <QMargins>
#include <QSize>
#include <algorithm>
#include <array>
#include <optional>

namespace nt::motion {
struct WipeUniforms {
    std::array<float, 4> mask{};
    std::array<float, 4> coordinates{1, 1, 0, 0};
};
inline WipeUniforms wipeUniforms(const std::optional<scene::WipeMask>& wipe, QSize source, QMargins outset = {}) {
    WipeUniforms result;
    if (!wipe || source.isEmpty()) { return result; }
    const auto& mask = *wipe;
    result.mask = {mask.direction == "right" ? 2.f : mask.direction == "up" ? 3.f : mask.direction == "down" ? 4.f : 1.f,
                   float(std::clamp(mask.progress, 0., 1.)), float(std::clamp(mask.softness, 0., 1.)), 0};
    result.coordinates = {float(source.width() + outset.left() + outset.right()) / source.width(),
                          float(source.height() + outset.top() + outset.bottom()) / source.height(),
                          -float(outset.left()) / source.width(), -float(outset.top()) / source.height()};
    return result;
}
} // namespace nt::motion
