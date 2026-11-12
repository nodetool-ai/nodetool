// Helpers that keep a kernel's rounding equal to the TypeScript loop it
// replaced, so a node's output does not change when it moves here.
#pragma once

#include <cmath>
#include <cstddef>
#include <cstdint>

#include "nodetool/kernels.h"

namespace nt::kernels {

// ECMAScript Math.round: the nearest integer, halves toward +infinity.
// std::round rounds halves away from zero, which differs for -0.5, -1.5, ...
inline double jsRound(double x) {
  const double floor = std::floor(x);
  return x - floor >= 0.5 ? floor + 1 : floor;
}

// A value stored into a Float32Array.
inline float f32(double x) { return static_cast<float>(x); }

// A rounded value stored into a Uint8Array whose producer keeps it in
// 0..255. Clamped, so an out-of-range value cannot wrap.
inline uint8_t u8(double rounded) {
  return static_cast<uint8_t>(rounded < 0 ? 0 : rounded > 255 ? 255 : rounded);
}

inline constexpr double kPi = 3.141592653589793;

// The highest sample rate an audio kernel accepts. It bounds every delay
// line that scales with the rate.
inline constexpr double kMaxSampleRate = NT_MAX_SAMPLE_RATE;

// A finite, positive sample rate up to kMaxSampleRate.
inline bool validSampleRate(double rate) { return rate > 0 && rate <= kMaxSampleRate; }

// ECMAScript `x >>> 0`: NaN and infinities give 0, other values wrap modulo
// 2^32. A double outside uint32 range cannot be cast without UB.
inline uint32_t toUint32(double x) {
  if (!std::isfinite(x)) return 0;
  double m = std::fmod(std::trunc(x), 4294967296.0);
  if (m < 0) m += 4294967296.0;
  return static_cast<uint32_t>(m);
}

// A frame count or index from a double: NaN and negatives give 0, and
// values past `limit` give `limit`, so the cast is always defined.
inline uint64_t saturatingFrames(double x, uint64_t limit = uint64_t{1} << 53) {
  if (!(x > 0)) return 0;
  if (x >= static_cast<double>(limit)) return limit;
  return static_cast<uint64_t>(x);
}

// One channel of interleaved audio: element i is data[i * stride].
struct Strided {
  const float* data;
  size_t stride;
  float operator[](size_t i) const { return data[i * stride]; }
};

}  // namespace nt::kernels
