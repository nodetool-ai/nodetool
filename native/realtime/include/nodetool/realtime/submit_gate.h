#pragma once
// The submit gate of realtime design 9.2, rules 1 and 2 (F44). During a live
// session every queue write and command buffer submission on the shared GPU
// device goes through it. The render thread submits its frame first. After
// the present, the gate submits at most one batch unit, and the next unit
// waits until the device reports the one before as done. At most one batch
// submission is therefore ahead of a frame.
#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <mutex>
#include <vector>

namespace nt::realtime {

// Thread-safe. `submitFrame` and `afterFrame` run on the render thread.
// `submitBatch` and `trySubmitBatch` run on batch threads (the runner's GPU
// host). `batchDone` runs where the device's submitted-work-done callback
// runs, which section 9.2 rule 5 puts on the prepare thread.
//
// `m_mutex` guards the queue, the in-flight unit and the counters. A batch
// unit is a callable that performs the unit's queue writes and its submit. A
// batch thread constructs it, so its allocation happens there. The render
// thread moves it out of a preallocated ring, runs it, and keeps it as the
// in-flight unit. `batchDone` destroys it off the render thread. A unit that
// the device finished before the render thread stored it is destroyed by the
// next batch thread call. The render thread neither allocates nor frees for a
// batch unit.
class SubmitGate {
public:
    using Unit = std::function<void()>;

    struct Stats {
        std::uint64_t frames = 0;
        std::uint64_t batches = 0;
        std::uint64_t completed = 0;
        std::uint64_t queued = 0;
        std::uint64_t refused = 0;  // trySubmitBatch on a full queue
        std::uint64_t maxBatchesAheadOfFrame = 0; // batch submissions between two frames
    };

    explicit SubmitGate(std::size_t capacity);
    ~SubmitGate() = default;
    SubmitGate(const SubmitGate&) = delete;
    SubmitGate& operator=(const SubmitGate&) = delete;
    SubmitGate(SubmitGate&&) = delete;
    SubmitGate& operator=(SubmitGate&&) = delete;

    // Render thread: runs the frame's uniform write and submit under the
    // gate, before any batch unit queued since the last frame.
    template <typename Submit>
    void submitFrame(Submit&& submit) {
        const std::lock_guard lock(m_mutex);
        submit();
        ++m_stats.frames;
        m_batchesSinceFrame = 0;
    }
    // Render thread, after the present or after an idle wait: submits the
    // oldest queued unit when no unit is in flight. Returns true when it
    // submitted one.
    bool afterFrame();

    // Batch threads. Queues a unit and waits while the queue is full. False
    // after close().
    bool submitBatch(Unit unit);
    // Batch threads. False when the queue is full or closed. The unit is left
    // unchanged then.
    bool trySubmitBatch(Unit& unit);

    // The device reported the in-flight unit as done. Destroys it.
    void batchDone();
    // Wakes waiting batch threads and refuses new units. Queued units stay
    // until the owner destroys the gate after the render thread stopped.
    void close();

    Stats stats() const;
    bool batchInFlight() const;

private:
    mutable std::mutex m_mutex;
    std::condition_variable m_space; // batch threads wait for room
    std::vector<Unit> m_ring;
    std::uint64_t m_read = 0;
    std::uint64_t m_write = 0;
    Unit m_inFlight;
    Unit m_spent; // a unit the device finished before the render thread stored it
    bool m_hasInFlight = false;
    bool m_closed = false;
    std::uint64_t m_batchesSinceFrame = 0;
    Stats m_stats;
};

} // namespace nt::realtime
