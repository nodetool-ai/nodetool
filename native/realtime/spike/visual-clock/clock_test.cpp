#include "clock.h"
#include <iostream>
#include <limits>
#include <stdexcept>

namespace {
void near(double actual, double expected, double tolerance = 1e-10) {
    if (!std::isfinite(actual) || std::abs(actual - expected) > tolerance) {
        throw std::runtime_error("Visual clock mismatch");
    }
}
void require(bool condition) {
    if (!condition) { throw std::runtime_error("Visual clock invariant failed"); }
}
template <typename F> void rejects(F action) {
    try { action(); } catch (const std::invalid_argument&) { return; }
    throw std::runtime_error("Invalid observation accepted");
}
}

int main() {
    try {
        constexpr double period = 1.0 / 60;
        nt::spike::VisualClock clock(0.05); // Experimental gain, not a measured design budget.
        near(clock.tick(10, period, 1), 10);
        near(clock.tick(10 + period + 0.002, period, 1), 10 + period + 0.0001);
        near(clock.tick(10 + 4 * period + 0.0001, period, 3), 10 + 4 * period + 0.0001);
        require(clock.corrections() == 0);
        near(clock.tick(12, period, 1), 12);
        require(clock.corrections() == 1);
        near(clock.tick(9, period, 1), 9);
        require(clock.corrections() == 2);
        near(clock.tick(2, period, 1, true), 2); // Seek/device-change/idle resume.
        require(clock.corrections() == 2);

        // Drift and alternating callback jitter over a long consecutive run.
        nt::spike::VisualClock drift(0.05);
        double target = 0, previous = drift.tick(target, period, 1);
        for (std::uint64_t frame = 1; frame <= 100000; ++frame) {
            target += period * 1.0001;
            const double now = drift.tick(target + (frame % 2 ? 0.001 : -0.001), period, 1);
            require(now > previous);
            near(now, target, 0.0002);
            previous = now;
        }
        require(drift.corrections() == 0);
        // A new measured display period is used on the next frame.
        near(drift.tick(previous + 1.0 / 120, 1.0 / 120, 1), previous + 1.0 / 120);

        // Exactly half a period uses gradual correction, not a hard step.
        nt::spike::VisualClock boundary(0.25);
        boundary.tick(0, 1, 1);
        near(boundary.tick(1.5, 1, 1), 1.125);
        require(boundary.corrections() == 0);
        const auto nan = std::numeric_limits<double>::quiet_NaN();
        rejects([&] { clock.tick(nan, period, 1); });
        rejects([&] { clock.tick(1, 0, 1); });
        rejects([&] { clock.tick(1, period, 0); });
        rejects([&] { nt::spike::VisualClock invalid(nan); });
        rejects([&] { nt::spike::VisualClock invalid(1); });
        near(clock.tick(2 + period, period, 1), 2 + period); // Rejected input did not mutate state.
        std::cout << "Visual clock checks passed\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
