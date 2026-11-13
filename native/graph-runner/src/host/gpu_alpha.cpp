// The straight-alpha conversions of upload and readback (gpu_device.h).
#include "host/gpu_device.h"

#include <algorithm>
#include <cmath>

namespace gr::host {
namespace gpu {

// An opaque pixel stays as it is in both directions, so it skips the math.
void premultiply(uint8_t* p, size_t pixels) {
  for (size_t i = 0; i < pixels * 4; i += 4) {
    if (p[i + 3] == 255) continue;
    const double a = p[i + 3] / 255.0;
    p[i] = uint8_t(std::round(p[i] * a));
    p[i + 1] = uint8_t(std::round(p[i + 1] * a));
    p[i + 2] = uint8_t(std::round(p[i + 2] * a));
  }
}

void unpremultiply(uint8_t* p, size_t pixels) {
  for (size_t i = 0; i < pixels * 4; i += 4) {
    const uint8_t a = p[i + 3];
    if (a == 0 || a == 255) continue;
    const double inv = 255.0 / a;
    p[i] = uint8_t(std::min(255.0, std::round(p[i] * inv)));
    p[i + 1] = uint8_t(std::min(255.0, std::round(p[i + 1] * inv)));
    p[i + 2] = uint8_t(std::min(255.0, std::round(p[i + 2] * inv)));
  }
}

}  // namespace gpu

}  // namespace gr::host
