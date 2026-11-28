#include "nodetool/realtime/submit_gate.h"

#include <algorithm>
#include <utility>

namespace nt::realtime {

SubmitGate::SubmitGate(std::size_t capacity) : m_ring(std::max<std::size_t>(capacity, 1)) {}

bool SubmitGate::afterFrame() {
    Unit unit;
    {
        const std::lock_guard lock(m_mutex);
        if (m_hasInFlight || m_read == m_write) { return false; }
        unit = std::move(m_ring[m_read % m_ring.size()]);
        m_ring[m_read % m_ring.size()] = nullptr;
        ++m_read;
        m_hasInFlight = true;
        ++m_batchesSinceFrame;
        ++m_stats.batches;
        m_stats.maxBatchesAheadOfFrame = std::max(m_stats.maxBatchesAheadOfFrame, m_batchesSinceFrame);
    }
    m_space.notify_one();
    // Only the render thread runs frames and units, so the unit runs outside
    // the lock and may queue another unit.
    unit();
    const std::lock_guard lock(m_mutex);
    if (m_hasInFlight) {
        m_inFlight = std::move(unit);
    } else {
        // The device finished the unit before it was stored. A batch thread
        // destroys it on its next call.
        m_spent = std::move(unit);
    }
    return true;
}

bool SubmitGate::submitBatch(Unit unit) {
    Unit spent; // destroyed after the lock is released
    std::unique_lock lock(m_mutex);
    spent = std::move(m_spent);
    m_spent = nullptr;
    m_space.wait(lock, [this] { return m_closed || m_write - m_read < m_ring.size(); });
    if (m_closed) { return false; }
    m_ring[m_write % m_ring.size()] = std::move(unit);
    ++m_write;
    ++m_stats.queued;
    return true;
}

bool SubmitGate::trySubmitBatch(Unit& unit) {
    Unit spent; // destroyed after the lock is released
    const std::lock_guard lock(m_mutex);
    spent = std::move(m_spent);
    m_spent = nullptr;
    if (m_closed || m_write - m_read == m_ring.size()) {
        ++m_stats.refused;
        return false;
    }
    m_ring[m_write % m_ring.size()] = std::move(unit);
    ++m_write;
    ++m_stats.queued;
    return true;
}

void SubmitGate::batchDone() {
    Unit done;
    {
        const std::lock_guard lock(m_mutex);
        if (!m_hasInFlight) { return; }
        done = std::move(m_inFlight);
        m_inFlight = nullptr;
        m_hasInFlight = false;
        ++m_stats.completed;
    }
    // `done` is destroyed here, on the completing thread.
}

void SubmitGate::close() {
    {
        const std::lock_guard lock(m_mutex);
        m_closed = true;
    }
    m_space.notify_all();
}

SubmitGate::Stats SubmitGate::stats() const {
    const std::lock_guard lock(m_mutex);
    return m_stats;
}

bool SubmitGate::batchInFlight() const {
    const std::lock_guard lock(m_mutex);
    return m_hasInFlight;
}

} // namespace nt::realtime
