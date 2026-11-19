#pragma once
#include <algorithm>
#include <cmath>

namespace nt::effects {
// Bound before arithmetic or narrowing: GPU blurs use 256 px, coverage uses its raster extent.
inline double boundedBlurRadius(double value, double limit = 256) {
    return std::isfinite(value) ? std::clamp(value, 0., limit) : 0.;
}
} // namespace nt::effects
