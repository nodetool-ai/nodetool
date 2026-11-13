#pragma once
#include <cstdint>

namespace nt::realtime::math {
// RT-N6: the native and Wasm targets compile this same source without FMA.
// See control.md for supported ranges and numerical error bounds.
double sine(double radians) noexcept;
double exponential(double value) noexcept;
double power(double base, double exponent) noexcept;
double hyperbolicTangent(double value) noexcept;
double noise(std::uint64_t index, std::uint32_t seed) noexcept;
}
