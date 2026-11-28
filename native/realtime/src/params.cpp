#include "nodetool/realtime/params.h"

#include <algorithm>

namespace nt::realtime {

ParamTable::ParamTable(std::size_t slots)
    : m_size(slots), m_slots(std::make_unique<playback::SeqLock<ParamValue>[]>(slots)), m_values(slots) {}

std::uint64_t ParamTable::write(std::size_t slot, std::span<const double> lanes) { return store(slot, lanes, false); }

std::uint64_t ParamTable::writeIfChanged(std::size_t slot, std::span<const double> lanes) { return store(slot, lanes, true); }

std::uint64_t ParamTable::store(std::size_t slot, std::span<const double> lanes, bool onlyIfChanged) {
    if (slot >= m_size || lanes.empty() || lanes.size() > 4) { return 0; }
    ParamValue value;
    value.width = static_cast<std::uint32_t>(lanes.size());
    std::copy(lanes.begin(), lanes.end(), value.lanes.begin());
    const std::lock_guard lock(m_writers);
    auto& last = m_values[slot];
    if (onlyIfChanged && last.revision != 0 && last.width == value.width && last.lanes == value.lanes) { return 0; }
    value.revision = ++m_revision;
    last = value;
    m_slots[slot].store(value);
    return value.revision;
}

bool ParamTable::tryLoad(std::size_t slot, ParamValue& out) const noexcept {
    return slot < m_size && m_slots[slot].tryLoad(out, 64);
}

AudioAppliedTable::AudioAppliedTable(std::size_t slots)
    : m_size(slots), m_params(std::make_unique<playback::SeqLock<AppliedParam>[]>(slots)) {}

void AudioAppliedTable::storePlan(const AppliedPlan& value) noexcept {
    std::move_backward(m_history.recent.begin(), m_history.recent.end() - 1, m_history.recent.end());
    m_history.recent[0] = value;
    m_plans.store(m_history);
}

live::StagedSwapClock stagedSwapClock(const AppliedPlans& applied, const RenderClockView& now) noexcept {
    live::StagedSwapClock clock;
    clock.swapNow = !now.audioRunning;
    for (std::size_t i = 0; i < applied.recent.size(); ++i) {
        const auto& entry = applied.recent[i];
        clock.recent[i] = {entry.planRevision, syncedDue(entry.streamFrame, entry.clockGeneration, now)};
    }
    return clock;
}

AudioParamReader::AudioParamReader(const ParamTable& table, AudioAppliedTable& applied)
    : m_table(table), m_appliedTable(applied), m_values(table.size()) {}

void AudioParamReader::beginQuantum(std::span<const ParamRead> reads, std::uint64_t streamFrame,
                                    std::uint64_t clockGeneration) noexcept {
    for (const auto& read : reads) {
        ParamValue next;
        if (!m_table.tryLoad(read.slot, next)) {
            ++m_failed;
            continue;
        }
        auto& current = m_values[read.slot];
        if (next.revision == current.revision) { continue; }
        current = next;
        if (read.policy == SyncPolicy::synced) {
            m_appliedTable.storeParam(read.slot, {next.revision, next.lanes, next.width, streamFrame, clockGeneration});
            ++m_applied;
        }
    }
}

RenderParamApplier::RenderParamApplier(const ParamTable& table, const AudioAppliedTable& applied)
    : m_table(table), m_applied(applied), m_values(table.size()) {}

std::size_t RenderParamApplier::beginFrame(std::span<const ParamRead> reads, const RenderClockView& now) noexcept {
    std::size_t changed = 0;
    for (const auto& read : reads) {
        auto& current = m_values[read.slot];
        if (read.policy == SyncPolicy::immediate) {
            ParamValue next;
            if (!m_table.tryLoad(read.slot, next)) {
                ++m_failed;
            } else if (next.revision != current.revision) {
                current = next;
                ++changed;
            }
        } else if (read.policy == SyncPolicy::synced) {
            AppliedParam applied;
            if (!m_applied.tryLoadParam(read.slot, applied)) {
                ++m_failed;
            } else if (applied.revision > current.revision && syncedDue(applied.streamFrame, applied.clockGeneration, now)) {
                current = {applied.revision, applied.lanes, applied.width};
                ++changed;
            }
        }
    }
    return changed;
}

EventQueue::EventQueue(std::size_t capacity) : m_ring(capacity), m_pending(capacity) {}

bool EventQueue::send(const AudioEvent& event) {
    const std::lock_guard lock(m_senders);
    const auto write = m_write.load(std::memory_order_relaxed);
    if (m_ring.empty() || write - m_read.load(std::memory_order_acquire) == m_ring.size()) {
        m_dropped.fetch_add(1, std::memory_order_relaxed);
        return false;
    }
    m_ring[write % m_ring.size()] = event;
    m_write.store(write + 1, std::memory_order_release);
    return true;
}

std::span<const AudioEvent> EventQueue::pending() noexcept {
    auto read = m_read.load(std::memory_order_relaxed);
    const auto end = m_write.load(std::memory_order_acquire);
    for (; read != end; ++read) {
        const auto& event = m_ring[read % m_ring.size()];
        if (m_pendingCount == m_pending.size()) {
            m_dropped.fetch_add(1, std::memory_order_relaxed);
            continue;
        }
        // Insertion keeps the list sorted and stable for equal stream frames.
        auto at = m_pendingCount;
        while (at > 0 && m_pending[at - 1].streamFrame > event.streamFrame) {
            m_pending[at] = m_pending[at - 1];
            --at;
        }
        m_pending[at] = event;
        ++m_pendingCount;
    }
    m_read.store(read, std::memory_order_release);
    return {m_pending.data(), m_pendingCount};
}

void EventQueue::consume(std::size_t count) noexcept {
    count = std::min(count, m_pendingCount);
    std::move(m_pending.begin() + static_cast<std::ptrdiff_t>(count),
              m_pending.begin() + static_cast<std::ptrdiff_t>(m_pendingCount), m_pending.begin());
    m_pendingCount -= count;
}

} // namespace nt::realtime
