#pragma once
#include "dsp.h"
#include "plan.h"
#include <span>

namespace nt::realtime {
// Prepare-thread value. Owns immutable, planar PCM already at session rate.
struct AudioBufferSlot {
    std::string id;
    unsigned sampleRate = 0;
    unsigned channels = 0;
    std::vector<float> samples;
};
// Caller supplies a stable, bounded snapshot. A failed read uses valid=false.
// Values follow parameterSlots(), not the potentially sparse IR slot numbers.
struct AudioParamSnapshot { std::span<const float> values; bool valid = false; };
struct AudioEvent { std::uint64_t streamFrame; unsigned node; unsigned type; double value = 0; };
struct AudioQuantumResult {
    bool accepted = false;
    std::uint64_t streamFrame = 0;
    std::size_t consumedEvents = 0;
    std::size_t lateEvents = 0;
    std::size_t nonFiniteSamples = 0;
};
struct AudioPrepareOptions { std::size_t maxBytes = 256 * 1024 * 1024; unsigned maxEvents = 4096; };

// Prepared by the host, then exclusively owned by one audio-render thread.
// Owns all state, planar PCM, slot data, snapshots and event scratch storage.
// No workers or callbacks. Destroy only after the owner thread stops using it.
class AudioExecutor {
    struct Storage;
public:
    explicit AudioExecutor(std::unique_ptr<Storage> storage);
    ~AudioExecutor();
    AudioExecutor(const AudioExecutor&) = delete;
    AudioExecutor& operator=(const AudioExecutor&) = delete;
    struct Prepared;
    static Prepared prepare(const Plan& plan, std::vector<AudioBufferSlot> slots = {}, AudioPrepareOptions options = {});
    AudioQuantumResult process(AudioParamSnapshot snapshot = {}, std::span<const AudioEvent> events = {}) noexcept;
    // Borrowed until the next process/reset or destruction. One planar output
    // per declared sink, detached from compiler-reused working buffers.
    std::span<const float> sink(unsigned index) const noexcept;
    std::span<const unsigned> parameterSlots() const noexcept;
    nt_dsp_meter meter(unsigned node) const noexcept;
    // Owner thread, while stopped. Clears delay memory, so not a quantum call.
    void reset() noexcept;
private:
    std::unique_ptr<Storage> storage_;
};
struct AudioExecutor::Prepared {
    std::unique_ptr<AudioExecutor> executor;
    std::optional<Diagnostic> error;
};
void registerAudioKernels(Registry& registry);
}
