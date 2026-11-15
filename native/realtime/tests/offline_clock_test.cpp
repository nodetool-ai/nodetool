#include "nodetool/realtime/offline_clock.h"
#include <iostream>
#include <limits>
#include <stdexcept>

namespace {
void require(bool condition, const char* message) {
    if (!condition) { throw std::runtime_error(message); }
}
}
int main() {
    using nt::realtime::OfflineClock;
    try {
        const auto clock = OfflineClock::prepare("1", "30000/1001", 48000);
        require(clock.has_value(), "fractional frame rate accepted");
        require(clock->frameCount() == 30 && clock->sampleCount() == 48000, "exact export lengths");
        require(clock->frame(0)->completedQuanta == 0 && clock->frame(0)->seconds == 0, "frame zero");
        require(clock->frame(1)->completedQuanta == 12, "quanta before fractional frame");
        require(clock->quantumCount() == 375 && clock->exportedSamples(374) == 128, "whole final quantum");
        require(!clock->frame(30) && clock->exportedSamples(375) == 0, "past-end access");
        require(!clock->frame(std::numeric_limits<std::uint64_t>::max()) &&
            clock->exportedSamples(std::numeric_limits<std::uint64_t>::max()) == 0, "overflow indices");
        const auto partial = OfflineClock::prepare("0.01", "240", 44100);
        require(partial && partial->frameCount() == 3 && partial->sampleCount() == 441 &&
            partial->quantumCount() == 4 && partial->exportedSamples(3) == 57, "partial quantum trimmed");
        const auto tiny = OfflineClock::prepare("0.000001", "1/1000000", 48000);
        require(tiny && tiny->frameCount() == 1 && tiny->sampleCount() == 0, "subsample export");
        const auto boundary = OfflineClock::prepare("1", "375/2", 48000);
        require(boundary && boundary->frame(1)->completedQuanta == 2, "quantum ending exactly at frame");
        const auto longClock = OfflineClock::prepare("600000000/1000000", "240000000/1000000", 48000);
        require(longClock && longClock->frameCount() == 144000 && longClock->sampleCount() == 28800000,
            "maximum export");
        for (std::uint64_t frame = 0; frame < longClock->frameCount(); ++frame) {
            require(longClock->frame(frame)->completedQuanta == frame * 25 / 16, "long clock has no drift");
        }
        const auto largeFractions = OfflineClock::prepare("599999999/1000000", "239999999/1000000", 48000);
        require(largeFractions && largeFractions->frameCount() == 144000 &&
            largeFractions->sampleCount() == 28799999 &&
            largeFractions->frame(143999)->completedQuanta == 224998,
            "unreduced cross-products remain bounded");
        const auto decimal = OfflineClock::prepare("0.5", "29.97", 48000);
        const auto rational = OfflineClock::prepare("1/2", "2997/100", 48000);
        require(decimal && rational && decimal->frameCount() == rational->frameCount(), "equivalent spellings");
        for (std::uint64_t frame = 0; frame < decimal->frameCount(); ++frame) {
            require(decimal->frame(frame)->seconds == rational->frame(frame)->seconds &&
                decimal->frame(frame)->completedQuanta == rational->frame(frame)->completedQuanta,
                "equivalent schedule");
        }
        for (const auto invalid : {"", "0", "-1", "+1", "nan", "inf", "1e2", " 1", "1 ",
            "1/0", "1/2/3", "1.0/2", "1.", ".5", "1.0000001", "1/1000001",
            "18446744073709551616", "18446744073709551615.0"}) {
            require(!OfflineClock::prepare(invalid, "60", 48000), "invalid duration rejected");
            require(!OfflineClock::prepare("1", invalid, 48000), "invalid fps rejected");
        }
        require(!OfflineClock::prepare("600.000001", "60", 48000), "duration limit");
        require(!OfflineClock::prepare("1", "240.000001", 48000), "fps limit");
        require(!OfflineClock::prepare("1", "60", 96000), "sample rate limit");
        std::cout << "offline clock checks passed\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
