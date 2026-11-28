#pragma once
// The live session core (realtime design 7, 10.2, 11.2, 11.4 and 17): a
// prepare thread, an audio render thread with the buffered driver, and the
// playback device. The render thread and its surface are WP14. The param
// table is WP13, and state follow on swap is WP18.
#include "plan.h"
#include "audio/PlaybackDevice.h"
#include <chrono>
#include <cstdint>
#include <memory>
#include <optional>
#include <string>

namespace nt::realtime {

struct LiveConfig {
    audio::PlaybackDevice::Backend backend = audio::PlaybackDevice::Backend::Null;
    unsigned sampleRate = 44100; // 44100 or 48000. Every plan must match.
    unsigned periodFrames = 256;
    unsigned minLeadQuanta = 8;  // The ring lead is two device periods and at least this.
    unsigned maxLeadQuanta = 32; // Underruns raise the lead by one quantum up to this.
    unsigned maxSlots = 8;
    bool requestRealtimeClass = true;
};

// A snapshot of the session counters. The audio render thread and the device
// callback each publish their part through a seqlock.
struct LiveStats {
    // Audio render thread.
    std::uint64_t quanta = 0;
    std::uint64_t streamFrame = 0;
    std::uint64_t planRevision = 0;
    std::uint64_t planSwaps = 0;
    std::uint64_t nonFiniteSamples = 0;
    std::uint64_t controlRejections = 0;
    std::uint64_t deferredTakes = 0;
    bool realtimeRequested = false;
    bool realtimeGranted = false;
    // Device callback.
    std::uint64_t callbackFrames = 0;
    std::uint64_t underruns = 0;
    std::uint64_t missingFrames = 0;
    std::uint64_t flushedFrames = 0;
    std::uint64_t clockGeneration = 0;
    std::int64_t leadFrames = 0;
    // Prepare thread.
    std::uint64_t publishedPlans = 0;
    std::uint64_t rejectedPlans = 0;
    std::uint64_t unconsumedPlans = 0;
    std::uint64_t retiredObjects = 0;
    std::uint64_t deviceChanges = 0;
};

// Test-only observation of the audio render thread. Both functions run on
// that thread, around its steady-state loop.
struct LiveAudioThreadHooks {
    void (*loopEnter)(void* user) = nullptr;
    void (*loopExit)(void* user) = nullptr;
    void* user = nullptr;
};

// Thread affinity: `open`, `update` and the destructor run on the host GUI
// thread. `stats`, `lastRejection` and `waitForRevision` are thread-safe
// (seqlocks, a mutex for the diagnostic). The session owns its threads, the
// device and every plan. The destructor stops the device, then joins the
// audio render thread and the prepare thread in that order, and the prepare
// thread destroys every plan before it exits.
class LiveSession {
    struct Impl;
    struct Key { explicit Key() = default; };

public:
    static std::unique_ptr<LiveSession> open(const LiveConfig& config, std::string* error,
                                             LiveAudioThreadHooks hooks = {});
    LiveSession(Key, std::shared_ptr<Impl> impl);
    ~LiveSession();
    LiveSession(const LiveSession&) = delete;
    LiveSession& operator=(const LiveSession&) = delete;

    // Queues a plan for the prepare thread, which loads, validates and
    // publishes it. A rejected plan leaves the active plan running.
    void update(std::string planJson);
    LiveStats stats() const;
    std::optional<Diagnostic> lastRejection() const;
    // True once the audio render thread runs a plan with this revision.
    bool waitForRevision(std::uint64_t revision, std::chrono::milliseconds timeout) const;
    // Tests only: what the device reports on a reroute.
    void simulateDeviceChangeForTest();

private:
    // Shared with the session's two threads, which hold a weak_ptr and lock
    // it for their whole run (native rule 12). The destructor joins both
    // threads first, so this pointer releases the last reference.
    std::shared_ptr<Impl> m_impl;
};

} // namespace nt::realtime
