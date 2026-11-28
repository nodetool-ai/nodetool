#pragma once
// Params, the audio-applied state and events of a live session (realtime
// design 8 D7g, 10.3, 11.1 and 11.2). The host and the runner worker write
// params and events. The audio render thread reads params once per quantum
// and records the synced changes it applied. The render thread applies a
// synced change when the sound for it is audible.
#include "audio.h"
#include "live.h"
#include "playback/AudioClockFeed.h"
#include <array>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <mutex>
#include <span>
#include <vector>

namespace nt::realtime {

// The compiler's sync policy for a param (section 11.1).
enum class SyncPolicy : std::uint8_t {
    immediate, // read by the render plan only, applies in the next frame
    audio,     // read by the audio plan only, applies at the next quantum start
    synced,    // read by both, the picture follows the sound
};

// One param value. Revision 0 means no writer has written the slot.
struct ParamValue {
    std::uint64_t revision = 0;
    std::array<double, 4> lanes{};
    std::uint32_t width = 1;
};

// The session's fixed param table: one single-writer seqlock per slot.
// Thread-safe: writers (host, runner worker, prepare thread) are serialized by
// a mutex that no realtime thread takes. Realtime readers use bounded reads.
class ParamTable {
public:
    explicit ParamTable(std::size_t slots);
    ~ParamTable() = default;
    ParamTable(const ParamTable&) = delete;
    ParamTable& operator=(const ParamTable&) = delete;
    ParamTable(ParamTable&&) = delete;
    ParamTable& operator=(ParamTable&&) = delete;

    std::size_t size() const noexcept { return m_size; }
    // Writers. Returns the new revision, or 0 when the slot is out of range or
    // the value has 0 or more than 4 lanes. Revisions increase across slots.
    std::uint64_t write(std::size_t slot, std::span<const double> lanes);
    // Writers. As write, but returns 0 and keeps the revision when the slot
    // already holds this value.
    std::uint64_t writeIfChanged(std::size_t slot, std::span<const double> lanes);
    // Any thread. One bounded read. False leaves `out` unchanged.
    bool tryLoad(std::size_t slot, ParamValue& out) const noexcept;

private:
    std::uint64_t store(std::size_t slot, std::span<const double> lanes, bool onlyIfChanged);

    std::size_t m_size;
    std::unique_ptr<playback::SeqLock<ParamValue>[]> m_slots;
    std::mutex m_writers;             // guards m_revision, m_values and every store
    std::uint64_t m_revision = 0;     // writers
    std::vector<ParamValue> m_values; // writers: the last stored value of each slot
};

// What the audio thread applied for one synced param.
struct AppliedParam {
    std::uint64_t revision = 0;
    std::array<double, 4> lanes{};
    std::uint32_t width = 1;
    std::uint64_t streamFrame = 0;
    std::uint64_t clockGeneration = 0;
};
// A plan revision the audio thread took, and the quantum that took it.
struct AppliedPlan {
    std::uint64_t planRevision = 0;
    std::uint64_t streamFrame = 0;
    std::uint64_t clockGeneration = 0;
};
// The newest plan revisions the audio thread took, newest first. Section
// 11.2 keeps the state of each recent revision readable, so the render
// thread can still match a staged plan after the audio thread took a newer
// one within the ring lead.
struct AppliedPlans {
    std::array<AppliedPlan, 4> recent{};
};

// The audio-applied seqlock table (D7g, F46). The audio render thread is the
// single writer of every entry. The render thread reads with bounded reads.
// The device-running flag is an atomic that the session sets.
class AudioAppliedTable {
public:
    explicit AudioAppliedTable(std::size_t slots);
    ~AudioAppliedTable() = default;
    AudioAppliedTable(const AudioAppliedTable&) = delete;
    AudioAppliedTable& operator=(const AudioAppliedTable&) = delete;
    AudioAppliedTable(AudioAppliedTable&&) = delete;
    AudioAppliedTable& operator=(AudioAppliedTable&&) = delete;

    std::size_t size() const noexcept { return m_size; }
    // Audio render thread.
    void storeParam(std::size_t slot, const AppliedParam& value) noexcept { m_params[slot].store(value); }
    void storePlan(const AppliedPlan& value) noexcept;
    // Render thread. False leaves `out` unchanged.
    bool tryLoadParam(std::size_t slot, AppliedParam& out) const noexcept { return m_params[slot].tryLoad(out, kAttempts); }
    bool tryLoadPlans(AppliedPlans& out) const noexcept { return m_plans.tryLoad(out, kAttempts); }
    // The session sets it when the device starts and stops.
    void setDeviceRunning(bool running) noexcept { m_running.store(running, std::memory_order_release); }
    bool deviceRunning() const noexcept { return m_running.load(std::memory_order_acquire); }

private:
    static constexpr int kAttempts = 64;
    std::size_t m_size;
    std::unique_ptr<playback::SeqLock<AppliedParam>[]> m_params;
    playback::SeqLock<AppliedPlans> m_plans;
    AppliedPlans m_history; // audio render thread
    std::atomic<bool> m_running{false};
};

// The render thread's view of the clock for one frame: the stream frame that
// is audible at the frame's presentation time, the clock generation that
// position belongs to, and whether an audio device runs.
struct RenderClockView {
    std::uint64_t audibleFrame = 0;
    std::uint64_t clockGeneration = 0;
    bool audioRunning = false;
};

// D7g: a synced change is due in the first frame whose audible time reaches
// its stream frame for the same clock generation, or at once when the
// generation changed or no audio device runs.
constexpr bool syncedDue(std::uint64_t streamFrame, std::uint64_t clockGeneration, const RenderClockView& now) noexcept {
    return !now.audioRunning || clockGeneration != now.clockGeneration || now.audibleFrame >= streamFrame;
}

// The input to Domain::takePendingStaged for one frame (D7g). An entry whose
// clock generation is not the frame's counts as audible.
live::StagedSwapClock stagedSwapClock(const AppliedPlans& applied, const RenderClockView& now) noexcept;

// One param a plan reads, with its policy.
struct ParamRead {
    std::uint32_t slot = 0;
    SyncPolicy policy = SyncPolicy::audio;
};

// The audio thread's param snapshot (section 10.3). Audio render thread only.
// Borrows the tables, which must outlive it. Storage is allocated once in the
// constructor, so a quantum never allocates.
class AudioParamReader {
public:
    AudioParamReader(const ParamTable& table, AudioAppliedTable& applied);

    // Reads each listed slot once at the start of the quantum at
    // `streamFrame`. A failed read keeps the value of the quantum before and
    // is counted. Each synced slot whose revision changed is recorded in the
    // applied table. Slots must be in range.
    void beginQuantum(std::span<const ParamRead> reads, std::uint64_t streamFrame, std::uint64_t clockGeneration) noexcept;
    const ParamValue& value(std::size_t slot) const noexcept { return m_values[slot]; }
    std::uint64_t failedReads() const noexcept { return m_failed; }
    std::uint64_t syncedApplied() const noexcept { return m_applied; }

private:
    const ParamTable& m_table;
    AudioAppliedTable& m_appliedTable;
    std::vector<ParamValue> m_values;
    std::uint64_t m_failed = 0;
    std::uint64_t m_applied = 0;
};

// The render side of the param table for one render plan (section 11.1).
// Render thread only. Immediate slots take the newest table value each frame.
// Synced slots take the audio-applied value once it is due.
class RenderParamApplier {
public:
    RenderParamApplier(const ParamTable& table, const AudioAppliedTable& applied);

    // Reads every listed slot for one frame. Returns the count of values that
    // changed. `audio` slots are ignored, since no render plan reads them.
    std::size_t beginFrame(std::span<const ParamRead> reads, const RenderClockView& now) noexcept;
    const ParamValue& value(std::size_t slot) const noexcept { return m_values[slot]; }
    std::uint64_t failedReads() const noexcept { return m_failed; }

private:
    const ParamTable& m_table;
    const AudioAppliedTable& m_applied;
    std::vector<ParamValue> m_values;
    std::uint64_t m_failed = 0;
};

// Events from the host or the runner worker to the audio render thread
// (sections 10.3 and 11.2). Thread-safe: senders are serialized by a mutex
// that the audio thread never takes. The audio thread moves events into a
// pending list sorted by stream frame and hands the due prefix to the audio
// executor. A send to a full queue drops the newest event and counts it.
class EventQueue {
public:
    explicit EventQueue(std::size_t capacity);
    ~EventQueue() = default;
    EventQueue(const EventQueue&) = delete;
    EventQueue& operator=(const EventQueue&) = delete;
    EventQueue(EventQueue&&) = delete;
    EventQueue& operator=(EventQueue&&) = delete;

    // Senders. False when the event was dropped.
    bool send(const AudioEvent& event);
    std::uint64_t dropped() const noexcept { return m_dropped.load(std::memory_order_relaxed); }

    // Audio render thread: moves sent events into the pending list and
    // returns it, sorted by stream frame. Events that do not fit the pending
    // list are dropped and counted.
    std::span<const AudioEvent> pending() noexcept;
    // Audio render thread: removes the first `count` pending events, which
    // the executor consumed or rejected.
    void consume(std::size_t count) noexcept;

private:
    std::vector<AudioEvent> m_ring;
    std::atomic<std::uint64_t> m_write{0};
    std::atomic<std::uint64_t> m_read{0};
    std::mutex m_senders; // guards the producer side of m_ring and m_write
    std::atomic<std::uint64_t> m_dropped{0};
    std::vector<AudioEvent> m_pending; // audio render thread, capacity fixed
    std::size_t m_pendingCount = 0;    // audio render thread
};

} // namespace nt::realtime
