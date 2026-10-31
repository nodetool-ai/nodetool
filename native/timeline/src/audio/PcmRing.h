#pragma once

// A single-producer, single-consumer ring of stereo float frames, indexed by
// absolute source frame. The audio decode worker appends frames in order; the
// device callback reads any frame in [readFloor, writeEnd) and then releases
// the frames below the one it needs next. No locks, no allocation after
// construction.

#include <algorithm>
#include <atomic>
#include <cstdint>
#include <vector>

namespace nt::audio {

class PcmRing {
public:
    // `capacityFrames` is rounded up to a power of two. `firstFrame` is the
    // source frame of the first frame the producer writes.
    PcmRing(std::int64_t capacityFrames, std::int64_t firstFrame) {
        std::int64_t cap = 1;
        while (cap < capacityFrames) cap <<= 1;
        m_capacity = cap;
        m_mask = cap - 1;
        m_data.assign(static_cast<std::size_t>(cap) * 2, 0.0f);
        m_first = firstFrame;
        m_readFloor.store(firstFrame, std::memory_order_relaxed);
        m_writeEnd.store(firstFrame, std::memory_order_relaxed);
    }

    std::int64_t capacity() const { return m_capacity; }
    std::int64_t firstFrame() const { return m_first; }

    // ---- producer ----
    std::int64_t writeEnd() const { return m_writeEnd.load(std::memory_order_relaxed); }
    std::int64_t freeFrames() const {
        return m_capacity - (m_writeEnd.load(std::memory_order_relaxed) - m_readFloor.load(std::memory_order_acquire));
    }
    // Appends up to `frames` interleaved stereo frames; returns the count written.
    std::int64_t write(const float* stereo, std::int64_t frames) {
        const std::int64_t n = std::min(frames, freeFrames());
        std::int64_t w = m_writeEnd.load(std::memory_order_relaxed);
        for (std::int64_t i = 0; i < n; ++i, ++w) {
            const std::size_t at = static_cast<std::size_t>(w & m_mask) * 2;
            m_data[at] = stereo[2 * i];
            m_data[at + 1] = stereo[2 * i + 1];
        }
        m_writeEnd.store(w, std::memory_order_release);
        return n;
    }
    // The source has no frames at or after `endFrame`: reads there are
    // silence, not an underrun.
    void markEnd(std::int64_t endFrame) { m_end.store(endFrame, std::memory_order_release); }

    // ---- consumer ----
    std::int64_t readableEnd() const { return m_writeEnd.load(std::memory_order_acquire); }
    std::int64_t readFloor() const { return m_readFloor.load(std::memory_order_relaxed); }
    std::int64_t endFrame() const { return m_end.load(std::memory_order_acquire); }
    // Frame `f` must be in [readFloor(), readableEnd()).
    void get(std::int64_t f, float& l, float& r) const {
        const std::size_t at = static_cast<std::size_t>(f & m_mask) * 2;
        l = m_data[at];
        r = m_data[at + 1];
    }
    // Frees the frames below `frame` for the producer.
    void release(std::int64_t frame) {
        const std::int64_t floor = std::min(frame, m_writeEnd.load(std::memory_order_acquire));
        if (floor > m_readFloor.load(std::memory_order_relaxed)) m_readFloor.store(floor, std::memory_order_release);
    }

private:
    std::vector<float> m_data;
    std::int64_t m_capacity = 0;
    std::int64_t m_mask = 0;
    std::int64_t m_first = 0;
    std::atomic<std::int64_t> m_readFloor{0};
    std::atomic<std::int64_t> m_writeEnd{0};
    std::atomic<std::int64_t> m_end{INT64_MAX};
};

}  // namespace nt::audio
