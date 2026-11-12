#include "core.h"
#include "playback/AudioClockFeed.h"
#include <cstring>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <thread>

void require(bool condition, const char* message) {
    if (!condition) { throw std::runtime_error(message); }
}

int main() {
    using namespace nt::spike;
    try {
        for (const double rate : {44100.0, 48000.0}) {
            AudioKernel original(rate), swapped(rate);
            Block expected{}, actual{};
            for (std::uint64_t revision = 0; revision < 10000; ++revision) {
                original.render(Plan{}, Param{}, expected);
                swapped.render(Plan{revision, 0, 1.0f}, Param{}, actual);
                require(std::memcmp(expected.data(), actual.data(), sizeof(Block)) == 0,
                    "An unchanged subgraph must preserve every output byte across swaps");
            }
            require(swapped.framesStepped() == 10000 * quantum, "A swap must not double-step state");
            const float predicted = 2.0f * actual[254] - actual[252];
            swapped.render(Plan{10001, 1, 0.3f}, Param{}, actual);
            require(std::abs(actual[0] - predicted) < 1e-7f, "Changed subgraph must preserve sink slope");
        }
        nt::playback::SeqLock<Param> params;
        Param previous{7, 0.4f};
        params.holdWriteForTest();
        require(!params.tryLoad(previous, 64), "A stalled writer must not block the audio thread");
        require(previous.revision == 7 && previous.gain == 0.4f, "Failed read must retain prior params");
        params.releaseWriteForTest();

        // Shared ownership keeps the arena alive for both joined test threads.
        auto mailbox = std::make_shared<PlanMailbox>();
        std::atomic<bool> finished{false};
        bool consistent = true;
        std::weak_ptr<PlanMailbox> weak = mailbox;
        std::jthread producer([weak, &finished](std::stop_token) {
            const auto owned = weak.lock();
            if (!owned) { return; }
            for (std::uint64_t revision = 1; revision <= 100000; ++revision) {
                while (!owned->publish(Plan{revision, revision, static_cast<float>(revision)})) {
                    std::this_thread::yield();
                }
            }
            finished.store(true, std::memory_order_release);
        });
        std::uint64_t last = 0;
        while (!finished.load(std::memory_order_acquire) || last < 100000) {
            if (!mailbox->take()) { std::this_thread::yield(); continue; }
            const auto& plan = mailbox->current();
            consistent = consistent && plan.revision > last &&
                plan.subgraphHash == plan.revision && plan.gain == static_cast<float>(plan.revision);
            last = plan.revision;
        }
        producer.join();
        require(consistent, "Plan publication must preserve coherent, increasing revisions");
        std::cout << "Audio state, ramp, bounded snapshot and mailbox checks passed\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
