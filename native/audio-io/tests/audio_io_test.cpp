// audio-io checks: the realtime seqlock reader (realtime design 11.4, RT-F36),
// the callback clock driver under a held command lock, and the playback device
// on the null backend.
#include "audio/PcmRing.h"
#include "audio/PlaybackDevice.h"
#include "audio/SanitizerBuild.h"
// Sanitizers own the allocator, and GCC ships no allocator hook header, so
// allocation counting runs in unsanitized builds only.
#ifndef NT_SANITIZED
#include "audio/TestAllocationCounter.h"
#endif
#include "playback/AudioClockFeed.h"

#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <future>
#include <string>
#include <thread>
#include <vector>

namespace {
using namespace std::chrono_literals;
using nt::playback::RealtimeSeqLockReader;
using nt::playback::SeqLock;

int failures = 0;
void check(bool ok, const char* what) {
    if (!ok) {
        std::fprintf(stderr, "FAIL: %s\n", what);
        ++failures;
    }
}

struct Pair {
    std::int64_t a = 0;
    double b = 0.0;
};

// The reader type exposes bounded reads only.
template <typename R>
concept HasBlockingLoad = requires(R& reader) { reader.load(); };
static_assert(!HasBlockingLoad<RealtimeSeqLockReader<Pair>>);
static_assert(HasBlockingLoad<const SeqLock<Pair>>);

void realtimeReaderDoesNotBlock() {
    SeqLock<Pair> lock;
    lock.store({7, 0.5});
    RealtimeSeqLockReader<Pair> reader(lock);
    Pair value;
    check(reader.tryLoad(value) && value.a == 7 && value.b == 0.5, "coherent read");
    check(reader.failedReads() == 0, "no failed read before the hold");

    lock.holdWriteForTest();
    // The read runs on its own thread, so a blocking read fails the deadline
    // instead of hanging the test.
    auto held = std::async(std::launch::async, [&reader] {
        Pair out{-1, -1.0};
        const bool ok = reader.tryLoad(out);
        return std::pair{ok, out};
    });
    check(held.wait_for(5s) == std::future_status::ready, "realtime read returns while the writer holds the lock");
    const auto [ok, out] = held.get();
    check(!ok, "realtime read reports the overlap");
    check(out.a == -1 && out.b == -1.0, "a failed read leaves the destination unchanged");
    check(reader.failedReads() == 1, "a failed read is counted");

    // Positive control: the unbounded load of other threads does wait for the
    // same held writer, so the hold above was in effect.
    std::atomic<bool> loaded{false};
    std::thread blocking([&] {
        (void)lock.load();
        loaded.store(true);
    });
    std::this_thread::sleep_for(50ms);
    check(!loaded.load(), "the unbounded load waits for a held writer");
    lock.releaseWriteForTest();
    blocking.join();
    check(loaded.load(), "the unbounded load completes after the release");

    lock.store({9, 1.5});
    check(reader.tryLoad(value) && value.a == 9 && value.b == 1.5, "reads resume after the release");
    check(reader.failedReads() == 1, "a successful read does not count");
}

void callbackDriverKeepsLastCommand() {
    nt::playback::AudioClockFeed feed;
    nt::playback::CallbackClockDriver driver(feed);
    nt::playback::TransportCommand play;
    play.seq = 1;
    play.playing = true;
    play.seekSeq = 1;
    feed.command.store(play);
    const auto ready = [](std::uint64_t) { return true; };
    auto anchor = driver.beginBlock(0, 128, 48000.0, ready);
    check(anchor.playing && anchor.commandSeq == 1, "the driver starts the play command");

    nt::playback::TransportCommand pause = play;
    pause.seq = 2;
    pause.playing = false;
    feed.command.store(pause);
    feed.command.holdWriteForTest();
    auto block = std::async(std::launch::async, [&] { return driver.beginBlock(1'000'000, 128, 48000.0, ready); });
    check(block.wait_for(5s) == std::future_status::ready, "beginBlock returns while the transport holds the lock");
    anchor = block.get();
    check(anchor.playing && anchor.commandSeq == 1, "a held command lock keeps the last coherent command");
    feed.command.releaseWriteForTest();
    driver.beginBlock(2'000'000, 128, 48000.0, ready);
    anchor = driver.beginBlock(3'000'000, 128, 48000.0, ready);
    check(!anchor.playing && anchor.commandSeq == 2, "the pause applies after the release");
}

void pcmRingRoundTrip() {
    nt::audio::PcmRing ring(100, 1000);
    check(ring.capacity() == 128, "capacity rounds to a power of two");
    std::vector<float> frames(std::size_t{64} * 2);
    for (std::size_t i = 0; i < frames.size(); ++i) frames[i] = static_cast<float>(i);
    check(ring.write(frames.data(), 64) == 64, "the ring accepts frames up to its capacity");
    check(ring.writeEnd() == 1064 && ring.freeFrames() == 64, "the write end and free space advance");
}

struct DeviceProbe {
    std::atomic<std::int64_t> frames{0};
    std::atomic<std::int64_t> callbacks{0};
    std::atomic<std::int64_t> allocations{0};
    std::atomic<int> started{0};
};

// Counting starts in the first callback and stays on for the device thread, so
// the count covers the wrapper's and the null backend's work between callbacks.
void render(void* user, float* out, std::uint32_t frames) {
    auto& probe = *static_cast<DeviceProbe*>(user);
#ifndef NT_SANITIZED
    if (!nt::testing::countAllocations) {
        nt::testing::allocations = 0;
        nt::testing::countAllocations = true;
    }
    probe.allocations.store(static_cast<std::int64_t>(nt::testing::allocations), std::memory_order_relaxed);
#endif
    for (std::uint32_t i = 0; i < frames * 2; ++i) out[i] = 0.0f;
    probe.frames.fetch_add(frames, std::memory_order_relaxed);
    probe.callbacks.fetch_add(1, std::memory_order_release);
}

void notify(void* user, nt::audio::PlaybackDevice::Notification notification) {
    if (notification == nt::audio::PlaybackDevice::Notification::Started) {
        static_cast<DeviceProbe*>(user)->started.fetch_add(1);
    }
}

void nullDevicePlaysAndCloses() {
    using nt::audio::PlaybackDevice;
#ifndef NT_SANITIZED
    check(nt::testing::countsAnAllocation(), "the allocation counter counts (control)");
#endif
    DeviceProbe probe;
    std::string error;
    auto rejected = PlaybackDevice::open({PlaybackDevice::Backend::Null, 48000, 480, 3}, {&render, &notify, &probe}, {}, &error);
    check(!rejected && !error.empty(), "an invalid channel count is rejected");

    error.clear();
    bool selectorCalled = false;
    const PlaybackDevice::Selector select = [&selectorCalled](std::span<const std::string>) {
        selectorCalled = true;
        return std::optional<std::size_t>{};
    };
    auto device = PlaybackDevice::open({PlaybackDevice::Backend::Null, 48000, 480, 2}, {&render, &notify, &probe}, select, &error);
    check(device != nullptr, "the null device opens");
    if (!device) {
        std::fprintf(stderr, "open: %s\n", error.c_str());
        return;
    }
    check(selectorCalled && !device->selectedDevice(), "the selector runs and an empty choice keeps the default device");
    check(device->sampleRate() == 48000.0 && device->channels() == 2, "the device reports its rate and layout");
    check(device->periodFrames() > 0 && device->internalSampleRate() > 0.0,
          "the device reports its internal period and rate");
    check(device->backendName() == "Null", "the null backend is selected");
    const auto latency = device->outputLatency();
    check(std::isfinite(latency.seconds) && latency.seconds >= 0.0 && !latency.coreAudio, "the null device reports its buffer latency");
    check(probe.callbacks.load() == 0, "an opened device does not render before start");

    check(device->start(), "the null device starts");
    const auto deadline = std::chrono::steady_clock::now() + 5s;
    while (probe.frames.load() < 4800 && std::chrono::steady_clock::now() < deadline) std::this_thread::sleep_for(5ms);
    check(probe.frames.load() >= 4800, "the null device renders in real time");
    check(probe.started.load() >= 1, "the started notification arrives");
    device->close();
    const auto after = probe.callbacks.load(std::memory_order_acquire);
    std::this_thread::sleep_for(50ms);
    check(probe.callbacks.load() == after, "no callback runs after close");
    check(probe.allocations.load() == 0, "the device thread allocates nothing between callbacks");
    device->close();  // idempotent
}
}  // namespace

int main() {
    realtimeReaderDoesNotBlock();
    callbackDriverKeepsLastCommand();
    pcmRingRoundTrip();
    nullDevicePlaysAndCloses();
    if (failures) {
        std::fprintf(stderr, "%d check(s) failed\n", failures);
        return 1;
    }
    std::puts("audio-io: all checks passed");
    return 0;
}
