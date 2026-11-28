// WP14 headless checks: the visual clock against a simulated audio clock with
// drift and jitter, and the submit gate's bound of one batch unit ahead of a
// frame, deterministic and under threads.
#include "nodetool/realtime/submit_gate.h"
#include "nodetool/realtime/visual_clock.h"
#include "audio/SanitizerBuild.h"
#ifndef NT_SANITIZED
#include "audio/TestAllocationCounter.h"
#endif

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

namespace {
using namespace nt::realtime;

void require(bool condition, const std::string& message) {
    if (!condition) { throw std::runtime_error(message); }
}

// A deterministic uniform value in [-1, 1).
class Noise {
public:
    explicit Noise(std::uint64_t seed) : m_state(seed) {}
    double next() {
        m_state = m_state * 6364136223846793005ull + 1442695040888963407ull;
        return static_cast<double>(m_state >> 11) / static_cast<double>(1ull << 52) - 1.0;
    }

private:
    std::uint64_t m_state;
};

// The simulated session: a 59.94 Hz display reported as 60 Hz, acquire times
// with 0.3 ms jitter, and an audio device whose clock runs 100 ppm fast. The
// position the host predicts for a presentation time jitters by 1.5 ms, as
// interpolation between device callbacks does (F22).
struct Simulation {
    static constexpr double kPeriod = 1.0 / 59.94;
    static constexpr double kMode = 1.0 / 60;
    static constexpr double kDrift = 100e-6;
    static constexpr double kAcquireJitter = 0.0003;
    static constexpr double kAudioJitter = 0.0015;
    Noise acquireNoise{1};
    Noise audioNoise{2};
    double audioOffset = 0; // a device change moves the audio position

    double acquire(std::uint64_t vsync) { return 1.0 + static_cast<double>(vsync) * kPeriod + kAcquireJitter * acquireNoise.next(); }
    double audio(double seconds) const { return (seconds - 1.0) * (1 + kDrift) + audioOffset; }
    double predicted(double seconds) { return audio(seconds) + kAudioJitter * audioNoise.next(); }
};

// Ten minutes of frames. After the period estimate settles, the visual clock
// stays within 1 ms of the true audio position at each presentation, never
// steps, and moves by an even amount each frame while the raw prediction
// jitters. Missed refreshes keep the speed, a device change steps or
// re-anchors, an idle skip re-anchors without counting misses, and a
// non-finite observation leaves the clock unchanged.
void visualClockFollowsDriftingAudio() {
    Simulation sim;
    VisualClock clock(Simulation::kMode);
    constexpr std::uint64_t frames = std::uint64_t{10} * 60 * 60; // 10 min at 60 Hz
    constexpr std::uint64_t settled = 600;
    std::uint64_t vsync = 0;
    double previous = 0;
    double previousRaw = 0;
    double maxError = 0;
    double maxStepDeviation = 0;
    double maxRawStepDeviation = 0;
    for (std::uint64_t frame = 0; frame < frames; ++frame) {
        const double acquire = sim.acquire(vsync);
        const double presentation = clock.presentationTime(acquire);
        const double raw = sim.predicted(presentation);
        const auto tick = clock.tick({acquire, raw});
        require(!tick.rejected, "a finite observation was rejected");
        require(frame == 0 ? tick.anchored : tick.periods == 1, "a consecutive frame did not advance one period");
        if (frame >= settled) {
            maxError = std::max(maxError, std::abs(tick.seconds - sim.audio(presentation)));
            const double expected = Simulation::kPeriod * (1 + Simulation::kDrift);
            maxStepDeviation = std::max(maxStepDeviation, std::abs(tick.seconds - previous - expected));
            maxRawStepDeviation = std::max(maxRawStepDeviation, std::abs(raw - previousRaw - expected));
        }
        previous = tick.seconds;
        previousRaw = raw;
        ++vsync;
    }
    require(std::abs(clock.period() - Simulation::kPeriod) < Simulation::kPeriod * 5e-4,
            "the measured period did not converge: " + std::to_string(clock.period()));
    require(maxError < 0.001, "the visual clock left the audio position by " + std::to_string(maxError * 1000) + " ms");
    require(clock.corrections() == 0 && clock.missedRefreshes() == 0, "a steady run stepped or missed");
    require(maxStepDeviation < maxRawStepDeviation / 10,
            "the visual clock is not smoother than the prediction: " + std::to_string(maxStepDeviation * 1000) + " ms vs " +
                std::to_string(maxRawStepDeviation * 1000) + " ms");

    // A frame that misses two refreshes advances three periods at full speed.
    vsync += 2;
    double acquire = sim.acquire(vsync++);
    auto tick = clock.tick({acquire, sim.predicted(clock.presentationTime(acquire))});
    require(tick.periods == 3 && !tick.corrected && clock.missedRefreshes() == 2, "missed refreshes were not counted");
    require(std::abs(tick.seconds - sim.audio(clock.presentationTime(acquire))) < 0.002, "a miss lost the audio position");

    // A device change without a re-anchor: the error exceeds half a period
    // and is removed in one counted step.
    sim.audioOffset = 0.25;
    acquire = sim.acquire(vsync++);
    tick = clock.tick({acquire, sim.predicted(clock.presentationTime(acquire))});
    require(tick.corrected && clock.corrections() == 1, "a large error was not stepped");
    // A device change with a re-anchor sets the clock to the prediction.
    sim.audioOffset = -0.5;
    clock.reanchor();
    acquire = sim.acquire(vsync++);
    const double anchor = sim.predicted(clock.presentationTime(acquire));
    tick = clock.tick({acquire, anchor});
    require(tick.anchored && tick.seconds == anchor && clock.corrections() == 1, "a re-anchor did not anchor");

    // Idle for two seconds, then the first active frame anchors and counts no misses.
    clock.idle();
    vsync += 120;
    acquire = sim.acquire(vsync++);
    tick = clock.tick({acquire, sim.predicted(clock.presentationTime(acquire))});
    require(tick.anchored && tick.periods == 0 && clock.missedRefreshes() == 2, "an idle skip did not re-anchor");

    const double held = clock.seconds();
    const auto nan = std::numeric_limits<double>::quiet_NaN();
    require(clock.tick({nan, 1}).rejected && clock.tick({acquire + 1, nan}).rejected && clock.tick({acquire, 1}).rejected,
            "an invalid observation was accepted");
    require(clock.seconds() == held, "a rejected observation changed the clock");

    VisualClock offset(1.0 / 60, {0.05, 0.004});
    require(std::abs(offset.presentationTime(2) - (2 + 1.0 / 60 + 0.004)) < 1e-12, "presentation time ignores the offset");
    RefreshEstimator invalid(0);
    require(invalid.period() == 1.0 / 60, "an invalid mode period was used");
}

// Deterministic: frames and batch units interleave so that never more than
// one batch submission sits between two frames, and a unit is not submitted
// before the device reported the one before as done.
void gateKeepsOneBatchAhead() {
    SubmitGate gate(8);
    std::vector<char> log;
    for (int i = 0; i < 6; ++i) {
        require(gate.submitBatch([&log] { log.push_back('B'); }), "a unit was refused");
    }
    for (int frame = 0; frame < 20; ++frame) {
        gate.submitFrame([&log] { log.push_back('F'); });
        gate.afterFrame();
        if (frame % 3 == 2) { gate.batchDone(); } // the device is slower than one frame
    }
    std::string sequence(log.begin(), log.end());
    require(sequence.find("BB") == std::string::npos, "two batch units were submitted between frames: " + sequence);
    std::string expected;
    for (int i = 0; i < 6; ++i) { expected += "FBFF"; }
    expected += "FF";
    require(sequence == expected,
            "a unit was submitted before the one before it was done: " + sequence);
    const auto stats = gate.stats();
    require(stats.maxBatchesAheadOfFrame == 1 && stats.batches == 6 && stats.frames == 20, "unexpected gate stats");

    SubmitGate small(1);
    SubmitGate::Unit first = [] {};
    SubmitGate::Unit second = [] {};
    require(small.trySubmitBatch(first) && !small.trySubmitBatch(second) && second, "a full gate took a unit or consumed it");
    small.close();
    require(!small.submitBatch([] {}), "a closed gate took a unit");
}

// Threads: four batch threads queue 2,000 units, the render thread submits
// frames and units, and a completion thread reports each unit as done. No two
// units are ever in flight, no frame has more than one unit before it, and the
// render thread allocates nothing for a unit (counted in unsanitized builds).
void gateUnderThreads() {
    SubmitGate gate(16);
    constexpr int producers = 4;
    constexpr int perProducer = 500;
    std::atomic<int> running{0};
    std::atomic<int> ran{0};
    std::atomic<bool> overlap{false};
    std::atomic<bool> stop{false};
    std::atomic<std::size_t> renderAllocations{0};
    std::atomic<bool> counterWorks{false};
    std::thread render([&] {
#ifndef NT_SANITIZED
        counterWorks = nt::testing::countsAnAllocation();
        nt::testing::allocations = 0;
#endif
        while (!stop.load()) {
            gate.submitFrame([] {});
#ifndef NT_SANITIZED
            nt::testing::countAllocations = true;
#endif
            gate.afterFrame();
#ifndef NT_SANITIZED
            nt::testing::countAllocations = false;
#endif
            std::this_thread::yield();
        }
#ifndef NT_SANITIZED
        renderAllocations = nt::testing::allocations;
#endif
    });
    std::thread completer([&] {
        while (!stop.load()) {
            if (gate.batchInFlight() && running.load() == 0) { gate.batchDone(); }
            std::this_thread::yield();
        }
    });
    std::vector<std::thread> batch;
    for (int p = 0; p < producers; ++p) {
        batch.emplace_back([&] {
            for (int i = 0; i < perProducer; ++i) {
                std::vector<int> payload(64, i); // the unit's allocation happens here
                gate.submitBatch([&, payload = std::move(payload)] {
                    if (running.fetch_add(1) != 0 || gate.stats().batches != static_cast<std::uint64_t>(ran.load()) + 1) {
                        overlap = true;
                    }
                    ran.fetch_add(payload.empty() ? 0 : 1);
                    running.fetch_sub(1);
                });
            }
        });
    }
    for (auto& thread : batch) { thread.join(); }
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(30);
    while (ran.load() < producers * perProducer && std::chrono::steady_clock::now() < deadline) { std::this_thread::yield(); }
    stop = true;
    render.join();
    completer.join();
    gate.batchDone();
    const auto stats = gate.stats();
    require(ran.load() == producers * perProducer, "not every unit ran: " + std::to_string(ran.load()));
    require(!overlap.load(), "a unit ran while another was in flight");
    require(stats.maxBatchesAheadOfFrame == 1, "a frame had more than one unit before it");
#ifndef NT_SANITIZED
    // Sanitized builds own the allocator, so the count runs in unsanitized builds only.
    require(counterWorks.load(), "the allocation counter does not count on the render thread");
#endif
    require(renderAllocations.load() == 0, "the render thread allocated for a unit: " + std::to_string(renderAllocations.load()));
}

} // namespace

int main() {
    try {
        visualClockFollowsDriftingAudio();
        gateKeepsOneBatchAhead();
        gateUnderThreads();
    } catch (const std::exception& error) {
        std::cerr << "FAIL: " << error.what() << '\n';
        return 1;
    }
    std::cout << "realtime render loop tests passed\n";
    return 0;
}
