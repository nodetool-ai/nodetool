#pragma once
// The handoffs between the prepare thread and the realtime threads of a live
// session (realtime design 7, 11.2 and 11.4). Only the prepare thread creates
// or destroys the objects that cross them.
#include <algorithm>
#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <string>
#include <utility>
#include <vector>

namespace nt::realtime::live {

// Base of every object a realtime thread hands back through a retire queue.
// The virtual destructor lets one queue carry plans and slot references.
class Retirable {
public:
    Retirable() = default;
    Retirable(const Retirable&) = delete;
    Retirable& operator=(const Retirable&) = delete;
    virtual ~Retirable() = default;
};

// A single-slot handoff from the prepare thread to one realtime thread.
// Thread-safe through one atomic pointer: the prepare thread publishes, the
// realtime thread takes. The handoff owns the pending object.
template <typename T>
class Handoff {
public:
    Handoff() = default;
    Handoff(const Handoff&) = delete;
    Handoff& operator=(const Handoff&) = delete;
    // Runs after both sides stopped, on the prepare thread or its owner.
    ~Handoff() { std::unique_ptr<T> dropped(m_pending.exchange(nullptr, std::memory_order_acquire)); }

    // Prepare thread. Returns the object the realtime thread never took, for
    // the prepare thread to destroy directly.
    [[nodiscard]] std::unique_ptr<T> publish(std::unique_ptr<T> value) {
        return std::unique_ptr<T>(m_pending.exchange(value.release(), std::memory_order_acq_rel));
    }
    // Realtime thread. Null when nothing is pending. Never allocates.
    std::unique_ptr<T> take() noexcept {
        if (m_pending.load(std::memory_order_relaxed) == nullptr) { return {}; }
        return std::unique_ptr<T>(m_pending.exchange(nullptr, std::memory_order_acq_rel));
    }
    // Realtime thread: true when an object waits to be taken.
    bool hasPending() const noexcept { return m_pending.load(std::memory_order_relaxed) != nullptr; }
    // Prepare thread, after the realtime thread stopped.
    std::unique_ptr<T> reclaim() { return std::unique_ptr<T>(m_pending.exchange(nullptr, std::memory_order_acq_rel)); }

private:
    std::atomic<T*> m_pending{nullptr};
};

// A single-producer, single-consumer queue of retired objects with a fixed
// capacity. The realtime thread pushes, the prepare thread drains and
// destroys. Storage is allocated once in the constructor, so a push moves a
// pointer and never allocates.
class RetireQueue {
public:
    explicit RetireQueue(std::size_t capacity) : m_items(capacity) {}
    ~RetireQueue() = default;
    RetireQueue(const RetireQueue&) = delete;
    RetireQueue& operator=(const RetireQueue&) = delete;
    RetireQueue(RetireQueue&&) = delete;
    RetireQueue& operator=(RetireQueue&&) = delete;

    std::size_t capacity() const noexcept { return m_items.size(); }
    // Realtime thread: true when one more push succeeds.
    bool hasRoom() const noexcept { return room() > 0; }
    // Realtime thread: how many pushes succeed now.
    std::size_t room() const noexcept {
        return m_items.size() -
               static_cast<std::size_t>(m_write.load(std::memory_order_relaxed) - m_read.load(std::memory_order_acquire));
    }

    // Realtime thread. False when the queue is full: the caller keeps the
    // object and counts the overflow. Section 11.4 shows this cannot happen
    // while the prepare thread drains before each publish.
    bool push(std::unique_ptr<Retirable>& item) noexcept {
        const auto write = m_write.load(std::memory_order_relaxed);
        if (write - m_read.load(std::memory_order_acquire) == m_items.size()) { return false; }
        m_items[write % m_items.size()] = std::move(item);
        m_write.store(write + 1, std::memory_order_release);
        return true;
    }
    // Prepare thread. Destroys every retired object and returns the count.
    std::size_t drain() {
        auto read = m_read.load(std::memory_order_relaxed);
        const auto end = m_write.load(std::memory_order_acquire);
        const auto count = static_cast<std::size_t>(end - read);
        for (; read != end; ++read) {
            std::unique_ptr<Retirable> item = std::move(m_items[read % m_items.size()]);
            item.reset();
        }
        m_read.store(read, std::memory_order_release);
        return count;
    }

private:
    std::vector<std::unique_ptr<Retirable>> m_items;
    std::atomic<std::uint64_t> m_write{0};
    std::atomic<std::uint64_t> m_read{0};
};

// An immutable slot value: planar float32 PCM or texture bytes prepared on the
// prepare thread. Never changed after publication.
struct SlotValue {
    std::string id;
    std::uint64_t version = 0;
    std::vector<float> samples;
};

// One domain's reference to a slot value. Each domain that reads a value gets
// its own reference, so the value has a reference count of two when both
// domains read it (section 11.4). Shared ownership is required because the
// two realtime threads release their references independently. Every
// reference is dropped on the prepare thread: from a retire queue, from an
// unconsumed handoff, or when a stopped domain is reclaimed.
class SlotRef final : public Retirable {
public:
    explicit SlotRef(std::shared_ptr<const SlotValue> value) : m_value(std::move(value)) {}
    const SlotValue& value() const noexcept { return *m_value; }
    long useCount() const noexcept { return m_value.use_count(); }

private:
    std::shared_ptr<const SlotValue> m_value;
};

// The render thread's input to a staged plan swap (section 11.2) for one
// frame, computed from the audio-applied plan state. It lists the newest plan
// revisions the audio thread took, each with whether its stream frame is
// audible in this frame (or its clock generation is no longer current).
struct StagedSwapClock {
    struct Applied {
        std::uint64_t revision = 0; // 0 marks an empty entry
        bool audible = false;
    };
    std::array<Applied, 4> recent{};
    bool swapNow = false; // no audio device runs

    const Applied* find(std::uint64_t revision) const noexcept {
        for (const auto& entry : recent) {
            if (entry.revision != 0 && entry.revision == revision) { return &entry; }
        }
        return nullptr;
    }
    std::uint64_t newest() const noexcept {
        std::uint64_t result = 0;
        for (const auto& entry : recent) { result = std::max(result, entry.revision); }
        return result;
    }
};

// The realtime side of one domain: a plan handoff, one handoff for each slot
// and the retire queue of capacity `maxSlots + 3`. Section 11.4 counts
// `maxSlots + 2`: between two drains the realtime thread takes at most one
// object per handoff, plus the one the prepare thread published after the
// first drain. One more is needed for a take that ran before the first
// drain and whose retire push lands after it, when the realtime thread is
// preempted between the two steps. The stress test reaches it.
//
// A staged domain (the render domain, section 11.2) also holds up to two
// taken plans that wait for their sound. Each can be retired without a take
// in the same tick, so its queue has two more entries.
//
// `Plan` must derive from Retirable. A staged domain's `Plan` also has a
// `revision` and a `synced` flag, set for a revision that changes both
// plans. The prepare thread publishes and drains. The domain's realtime
// thread takes, holds the active objects and retires the replaced ones.
template <typename Plan>
class Domain {
public:
    explicit Domain(std::size_t maxSlots, bool staged = false)
        : m_slots(maxSlots), m_active(maxSlots), m_retire(maxSlots + 3 + (staged ? kStage : 0)) {}

    // ---- prepare thread ----
    std::size_t drain() {
        const auto count = m_retire.drain();
        m_retired += count;
        return count;
    }
    std::uint64_t retiredTotal() const noexcept { return m_retired; }
    // Drains first, as section 11.4 requires before each publish. Returns
    // true when it replaced a plan the realtime thread never took.
    bool publishPlan(std::unique_ptr<Plan> plan) {
        drain();
        return m_plan.publish(std::move(plan)) != nullptr;
    }
    bool publishSlot(std::size_t index, std::shared_ptr<const SlotValue> value) {
        drain();
        return m_slots.at(index).publish(std::make_unique<SlotRef>(std::move(value))) != nullptr;
    }
    // After the realtime thread stopped: destroys the pending and active
    // objects and the retired ones. The stopped thread no longer reads them.
    void reclaim() {
        drain();
        m_plan.reclaim().reset();
        m_activePlan.reset();
        for (auto& staged : m_stage) { staged.reset(); }
        m_staged = 0;
        for (auto& slot : m_slots) { slot.reclaim().reset(); }
        for (auto& slot : m_active) { slot.reset(); }
    }
    std::size_t maxSlots() const noexcept { return m_slots.size(); }
    std::size_t retireCapacity() const noexcept { return m_retire.capacity(); }

    // ---- realtime thread ----
    // Takes the pending plan and slot values at a tick boundary. Returns true
    // when the plan changed. A take needs room in the retire queue for the
    // object it replaces. Section 11.4 shows the room is always there while the
    // prepare thread drains before each publish. Without room the pending
    // object stays in its handoff for a later tick, and the miss is counted.
    bool takePending() noexcept {
        bool swapped = false;
        if (m_plan.hasPending()) {
            if (m_activePlan && !m_retire.hasRoom()) {
                ++m_deferred;
            } else if (auto next = m_plan.take()) {
                retire(std::move(m_activePlan));
                m_activePlan = std::move(next);
                swapped = true;
            }
        }
        takeSlots();
        return swapped;
    }
    // Staged domains only. Takes the pending plan into the stage, then swaps
    // by the dual-plan rule of section 11.2:
    //  - a plan that is not synced swaps at this tick;
    //  - a synced plan swaps when the audio thread took its revision and that
    //    revision's stream frame is audible;
    //  - the newest staged plan swaps at once when no audio device runs, or
    //    when the audio thread already took a newer revision and the record
    //    of this one is gone.
    // A full stage keeps its oldest plan, which still waits for its sound,
    // and replaces the newer one. Slot values swap as in takePending.
    // Returns true when the active plan changed.
    bool takePendingStaged(const StagedSwapClock& clock) noexcept {
        if (m_plan.hasPending()) {
            if (m_staged == kStage && !m_retire.hasRoom()) {
                ++m_deferred;
            } else if (auto next = m_plan.take()) {
                if (m_staged == kStage) {
                    retire(std::move(m_stage[kStage - 1]));
                    --m_staged;
                }
                m_stage[m_staged++] = std::move(next);
            }
        }
        bool swapped = false;
        while (m_staged > 0) {
            const auto& front = *m_stage[0];
            const auto* applied = clock.find(front.revision);
            if (!front.synced || (applied && applied->audible)) {
                if (m_activePlan && !m_retire.hasRoom()) {
                    ++m_deferred;
                    break;
                }
                activate(1);
                swapped = true;
                continue;
            }
            if (clock.swapNow || (!applied && clock.newest() > front.revision)) {
                if (m_retire.room() < m_staged - 1 + (m_activePlan ? 1 : 0)) {
                    ++m_deferred;
                    break;
                }
                activate(m_staged);
                swapped = true;
            }
            break;
        }
        takeSlots();
        return swapped;
    }
    std::size_t stagedPlans() const noexcept { return m_staged; }
    Plan* plan() noexcept { return m_activePlan.get(); }
    const SlotRef* slot(std::size_t index) const noexcept { return m_active[index].get(); }
    // Takes skipped for lack of retire room. Zero when section 11.4 holds.
    std::uint64_t deferredTakes() const noexcept { return m_deferred; }

private:
    static constexpr std::size_t kStage = 2;

    void takeSlots() noexcept {
        for (std::size_t i = 0; i < m_slots.size(); ++i) {
            if (!m_slots[i].hasPending()) { continue; }
            if (m_active[i] && !m_retire.hasRoom()) {
                ++m_deferred;
            } else if (auto next = m_slots[i].take()) {
                retire(std::move(m_active[i]));
                m_active[i] = std::move(next);
            }
        }
    }
    // Activates the staged plan at `count - 1`, retires the active plan and
    // the staged plans before it, and shifts the rest forward. Room was
    // checked by the caller.
    void activate(std::size_t count) noexcept {
        retire(std::move(m_activePlan));
        for (std::size_t i = 0; i + 1 < count; ++i) { retire(std::move(m_stage[i])); }
        m_activePlan = std::move(m_stage[count - 1]);
        for (std::size_t i = count; i < m_staged; ++i) { m_stage[i - count] = std::move(m_stage[i]); }
        m_staged -= count;
    }

    // Room was checked before the take, so the push succeeds.
    template <typename T>
    void retire(std::unique_ptr<T> old) noexcept {
        if (!old) { return; }
        std::unique_ptr<Retirable> item = std::move(old);
        m_retire.push(item);
    }

    Handoff<Plan> m_plan;
    std::vector<Handoff<SlotRef>> m_slots;
    std::unique_ptr<Plan> m_activePlan;             // realtime thread
    std::array<std::unique_ptr<Plan>, kStage> m_stage; // realtime thread, staged domains
    std::size_t m_staged = 0;                       // realtime thread
    std::vector<std::unique_ptr<SlotRef>> m_active; // realtime thread
    RetireQueue m_retire;
    std::uint64_t m_retired = 0;                    // prepare thread
    std::uint64_t m_deferred = 0;                   // realtime thread
};

} // namespace nt::realtime::live
