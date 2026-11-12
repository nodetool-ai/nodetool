#include "nodetool/realtime/offline_clock.h"
#include <charconv>
#include <numeric>

namespace nt::realtime {
namespace {
struct Fraction { std::uint64_t numerator; std::uint64_t denominator; };
std::optional<std::uint64_t> integer(std::string_view text) noexcept {
    if (text.empty()) { return std::nullopt; }
    std::uint64_t value = 0;
    const auto result = std::from_chars(text.data(), text.data() + text.size(), value);
    if (result.ec != std::errc{} || result.ptr != text.data() + text.size()) { return std::nullopt; }
    return value;
}
std::optional<Fraction> fraction(std::string_view text, std::uint64_t maximum) noexcept {
    // Bounds apply before reduction, keeping every subsequent product within uint64.
    if (text.empty() || text.size() > 32) { return std::nullopt; }
    Fraction value{0, 1};
    const auto slash = text.find('/');
    const auto dot = text.find('.');
    if (slash != std::string_view::npos) {
        auto numerator = integer(text.substr(0, slash));
        auto denominator = integer(text.substr(slash + 1));
        if (!numerator || !denominator) { return std::nullopt; }
        value = {*numerator, *denominator};
    } else if (dot != std::string_view::npos) {
        auto whole = integer(text.substr(0, dot));
        const auto digits = text.substr(dot + 1);
        auto decimal = integer(digits);
        if (!whole || !decimal || digits.size() > 6 || *whole > maximum) { return std::nullopt; }
        for (std::size_t i = 0; i < digits.size(); ++i) { value.denominator *= 10; }
        value.numerator = *whole * value.denominator + *decimal;
    } else {
        auto numerator = integer(text);
        if (!numerator) { return std::nullopt; }
        value.numerator = *numerator;
    }
    if (value.denominator == 0 || value.denominator > 1000000 || value.numerator == 0 ||
        value.numerator > maximum * value.denominator) { return std::nullopt; }
    const auto divisor = std::gcd(value.numerator, value.denominator);
    return Fraction{value.numerator / divisor, value.denominator / divisor};
}
}
std::optional<OfflineClock> OfflineClock::prepare(std::string_view duration,
    std::string_view fps, unsigned sampleRate) noexcept {
    if (sampleRate != 44100 && sampleRate != 48000) { return std::nullopt; }
    const auto seconds = fraction(duration, 600);
    const auto rate = fraction(fps, 240);
    if (!seconds || !rate) { return std::nullopt; }
    OfflineClock clock;
    clock.sampleRate_ = sampleRate;
    clock.fpsNumerator_ = rate->numerator;
    clock.fpsDenominator_ = rate->denominator;
    const auto numerator = seconds->numerator * rate->numerator;
    const auto denominator = seconds->denominator * rate->denominator;
    clock.frames_ = numerator / denominator + (numerator % denominator != 0 ? 1 : 0);
    clock.samples_ = seconds->numerator * sampleRate / seconds->denominator;
    return clock;
}
std::optional<OfflineClock::Frame> OfflineClock::frame(std::uint64_t index) const noexcept {
    if (index >= frames_) { return std::nullopt; }
    const auto numerator = index * fpsDenominator_;
    return Frame{static_cast<double>(numerator) / static_cast<double>(fpsNumerator_),
        numerator * sampleRate_ / (fpsNumerator_ * 128)};
}
unsigned OfflineClock::exportedSamples(std::uint64_t quantum) const noexcept {
    if (quantum >= quantumCount()) { return 0; }
    const auto remaining = samples_ - quantum * 128;
    return static_cast<unsigned>(remaining < 128 ? remaining : 128);
}
}
