#include "nodetool/realtime/math.h"
#include <bit>
#include <cmath>
#include <limits>

namespace nt::realtime::math {
namespace {
constexpr double pi = 3.1415926535897932384626433832795;
constexpr double ln2 = 0.693147180559945309417232121458;
constexpr double nan = std::numeric_limits<double>::quiet_NaN();
double logarithm(double value) noexcept {
    if (!(value > 0) || !std::isfinite(value)) { return nan; }
    int correction = 0;
    if (value < 0x1p-1022) { value *= 0x1p52; correction = -52; }
    const auto bits = std::bit_cast<std::uint64_t>(value);
    const int exponent = static_cast<int>((bits >> 52) & 2047) - 1023 + correction;
    const double mantissa = std::bit_cast<double>((bits & 0x000fffffffffffffULL) | 0x3ff0000000000000ULL);
    const double z = (mantissa - 1) / (mantissa + 1);
    const double square = z * z;
    double term = z;
    double sum = term;
    for (int divisor = 3; divisor <= 41; divisor += 2) {
        term *= square;
        sum += term / divisor;
    }
    return exponent * ln2 + 2 * sum;
}
}

double sine(double radians) noexcept {
    // Bounded reduction keeps integer conversions defined on native and Wasm.
    if (!std::isfinite(radians) || radians < -0x1p30 || radians > 0x1p30) { return nan; }
    const auto turns = static_cast<std::int64_t>(radians / (2 * pi));
    double x = radians - static_cast<double>(turns) * (2 * pi);
    if (x > pi) { x -= 2 * pi; }
    if (x < -pi) { x += 2 * pi; }
    if (x > pi / 2) { x = pi - x; }
    if (x < -pi / 2) { x = -pi - x; }
    double term = x;
    double result = term;
    for (int n = 1; n <= 9; ++n) {
        term *= -x * x / ((2 * n) * (2 * n + 1));
        result += term;
    }
    return result;
}

double exponential(double value) noexcept {
    if (std::isnan(value)) { return nan; }
    // Explicitly clear very small results, independently of host FTZ settings.
    if (value < -700) { return 0; }
    if (value > 700) { return std::numeric_limits<double>::infinity(); }
    const int exponent = static_cast<int>(value / ln2);
    const double remainder = value - exponent * ln2;
    double sum = 1;
    double term = 1;
    for (int n = 1; n <= 18; ++n) { term *= remainder / n; sum += term; }
    const auto scale = std::bit_cast<double>(static_cast<std::uint64_t>(exponent + 1023) << 52);
    return sum * scale;
}

double power(double base, double exponent) noexcept {
    if (!std::isfinite(base) || !std::isfinite(exponent)) { return nan; }
    if (exponent == 0) { return 1; }
    if (base == 0) { return exponent > 0 ? 0 : std::numeric_limits<double>::infinity(); }
    double sign = 1;
    if (base < 0) {
        if (exponent < -0x1p53 || exponent > 0x1p53) { return nan; }
        const auto integer = static_cast<std::int64_t>(exponent);
        if (static_cast<double>(integer) != exponent) { return nan; }
        if (integer % 2 != 0) { sign = -1; }
        base = -base;
    }
    return sign * exponential(exponent * logarithm(base));
}

double hyperbolicTangent(double value) noexcept {
    if (std::isnan(value)) { return nan; }
    if (value > 20) { return 1; }
    if (value < -20) { return -1; }
    const double magnitude = value < 0 ? -value : value;
    // Avoid cancellation near zero.
    if (magnitude < 1e-5) { return value * (1 - value * value / 3); }
    const double e = exponential(2 * magnitude);
    const double result = (e - 1) / (e + 1);
    return value < 0 ? -result : result;
}

double noise(std::uint64_t index, std::uint32_t seed) noexcept {
    // Unsigned wraparound is defined. Seed includes the stable graph identity.
    std::uint64_t x = index ^ (static_cast<std::uint64_t>(seed) << 32);
    x += 0x9e3779b97f4a7c15ULL;
    x = (x ^ (x >> 30)) * 0xbf58476d1ce4e5b9ULL;
    x = (x ^ (x >> 27)) * 0x94d049bb133111ebULL;
    x ^= x >> 31;
    return static_cast<double>(x >> 11) * 0x1p-52 - 1;
}
}
