#include "preview/FrameCache.h"
#include "preview/FfmpegSource.h"

#include "preview/FrameRing.h"

#include <algorithm>
#include <cmath>

namespace nt {

FrameCache::FrameCache(size_t budgetBytes) : m_budget(budgetBytes) {}

FrameCache& FrameCache::shared() {
    static FrameCache cache;
    return cache;
}

void FrameCache::insert(const std::string& source, double ptsSec, std::shared_ptr<DecodedFrame> frame,
                        size_t bytes, double previousPtsSec) {
#ifdef _WIN32
    // D3D11 frames own slots in FFmpeg's fixed decoder surface pool. Keeping
    // them beyond playback exhausts that pool before the byte budget is hit.
    if (frame->hardware) {
        return;
    }
#endif
    std::lock_guard lock(m_mutex);
    auto& bySource = m_index[source];
    if (previousPtsSec >= 0.0) {
        const auto prev = bySource.find(previousPtsSec);
        if (prev != bySource.end()) prev->second->successorPts = ptsSec;
    }
    const auto existing = bySource.find(ptsSec);
    if (existing != bySource.end()) {
        m_lru.splice(m_lru.begin(), m_lru, existing->second);  // already cached: refresh
        return;
    }
    m_lru.push_front(Entry{source, ptsSec, std::move(frame), bytes, -1.0});
    // A frame cached earlier that comes next in time is this frame's successor
    // only when a decode run linked them; a seek may have skipped frames.
    bySource[ptsSec] = m_lru.begin();
    if (m_evicted.size() > 256) {
        std::erase_if(m_evicted, [](const Evicted& e) { return e.frame.expired(); });
    }
    m_bytes += bytes;
    m_peakBeforeEviction = std::max(m_peakBeforeEviction, m_bytes);
    evictLocked();
    m_peak = std::max(m_peak, m_bytes);  // after eviction: what the cache holds
}

void FrameCache::evictLocked() {
    while (m_bytes > m_budget && !m_lru.empty()) {
        const Entry& victim = m_lru.back();
        auto& bySource = m_index[victim.source];
        // A frame whose successor link points at the victim loses it.
        for (auto& [pts, it] : bySource) {
            if (it->successorPts == victim.pts) it->successorPts = -1.0;
        }
        bySource.erase(victim.pts);
        m_bytes -= victim.bytes;
        if (victim.frame.use_count() > 1) m_evicted.push_back({victim.frame, victim.bytes});
        m_lru.pop_back();
    }
}

std::shared_ptr<DecodedFrame> FrameCache::lookup(const std::string& source, double targetSec) {
    std::lock_guard lock(m_mutex);
    const auto bySource = m_index.find(source);
    if (bySource == m_index.end() || bySource->second.empty()) {
        ++m_misses;
        return nullptr;
    }
    // The newest cached frame that starts by the target.
    auto it = bySource->second.upper_bound(targetSec + kTimestampEpsilonSec);
    if (it == bySource->second.begin()) {
        ++m_misses;
        return nullptr;
    }
    --it;
    const Entry& e = *it->second;
    if (e.successorPts < 0.0 || frameStartsBy(e.successorPts, targetSec)) {
        ++m_misses;
        return nullptr;
    }
    ++m_hits;
    m_lru.splice(m_lru.begin(), m_lru, it->second);
    return e.frame;
}

size_t FrameCache::bytes() const {
    std::lock_guard lock(m_mutex);
    return m_bytes;
}

size_t FrameCache::peakBytes() const {
    std::lock_guard lock(m_mutex);
    return m_peak;
}

size_t FrameCache::peakBeforeEvictionBytes() const {
    std::lock_guard lock(m_mutex);
    return m_peakBeforeEviction;
}

size_t FrameCache::pinnedElsewhereBytes() const {
    std::lock_guard lock(m_mutex);
    size_t pinned = 0;
    std::erase_if(m_evicted, [](const Evicted& e) { return e.frame.expired(); });
    for (const Evicted& e : m_evicted) pinned += e.bytes;
    return pinned;
}

long long FrameCache::hits() const {
    std::lock_guard lock(m_mutex);
    return m_hits;
}

long long FrameCache::misses() const {
    std::lock_guard lock(m_mutex);
    return m_misses;
}

void FrameCache::eraseSource(const std::string& source) {
    std::lock_guard lock(m_mutex);
    const auto bySource = m_index.find(source);
    if (bySource == m_index.end()) return;
    for (auto& [pts, it] : bySource->second) {
        m_bytes -= it->bytes;
        if (it->frame.use_count() > 1) m_evicted.push_back({it->frame, it->bytes});
        m_lru.erase(it);
    }
    m_index.erase(bySource);
}

void FrameCache::clear() {
    std::lock_guard lock(m_mutex);
    m_lru.clear();
    m_index.clear();
    m_bytes = 0;
    m_hits = 0;
    m_misses = 0;
    m_peak = 0;
    m_peakBeforeEviction = 0;
    m_evicted.clear();
}

}  // namespace nt
