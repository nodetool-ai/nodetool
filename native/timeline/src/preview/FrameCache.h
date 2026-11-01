#pragma once

// The scrub cache (DESIGN.md D19): decoded frames kept after they leave a
// decoder's queue, so a paused scrub back over them shows them without a
// seek. Frames are keyed by media and pts, evicted least recently used first,
// and the budget (256 MB by default) is shared by every source.
// Windows hardware frames are not retained: they pin slots in the decoder's
// fixed D3D11 surface pool. Software frames remain cacheable on Windows.
//
// A cached frame is shown only when the cache can prove it is the D17 pick:
// it starts by the target, and the frame that followed it in presentation
// order in the same decode run is cached and starts after the target. A
// header frame rate proves nothing (review F1): a stream can claim a constant
// rate and still have irregular timestamps.
//
// Memory (review F3): each frame counts its real allocation (padded software
// buffers, the IOSurface allocation of a hardware frame). `bytes()` is what
// the cache holds; `pinnedElsewhereBytes()` is what it evicted while another
// owner (a decoder queue, the screen) still holds it.

#include <cstddef>
#include <list>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

namespace nt {

struct DecodedFrame;

class FrameCache {
public:
    static constexpr size_t kDefaultBudgetBytes = 256u * 1024u * 1024u;

    explicit FrameCache(size_t budgetBytes = kDefaultBudgetBytes);

    // The cache every decoder shares.
    static FrameCache& shared();

    // Adds a frame decoded from `source` at `ptsSec`. `previousPtsSec` is the
    // frame decoded just before it in the same run (negative when none): the
    // cache records this frame as that frame's successor.
    void insert(const std::string& source, double ptsSec, std::shared_ptr<DecodedFrame> frame, size_t bytes,
                double previousPtsSec);

    // The proven D17 pick for `targetSec`, or null.
    std::shared_ptr<DecodedFrame> lookup(const std::string& source, double targetSec);

    size_t bytes() const;
    size_t peakBytes() const;                // the most held after eviction
    size_t peakBeforeEvictionBytes() const;  // the most held at any moment
    size_t pinnedElsewhereBytes() const;     // evicted, still alive elsewhere
    size_t budgetBytes() const { return m_budget; }
    long long hits() const;
    long long misses() const;
    void clear();
    // Drops every frame of `source` (its decoder was replaced).
    void eraseSource(const std::string& source);

private:
    struct Entry {
        std::string source;
        double pts = 0.0;
        std::shared_ptr<DecodedFrame> frame;
        size_t bytes = 0;
        double successorPts = -1.0;  // negative: unknown
    };
    using Lru = std::list<Entry>;
    void evictLocked();

    size_t m_budget;
    mutable std::mutex m_mutex;
    Lru m_lru;  // front: most recently used
    std::map<std::string, std::map<double, Lru::iterator>> m_index;
    size_t m_bytes = 0;
    size_t m_peak = 0;
    size_t m_peakBeforeEviction = 0;
    struct Evicted {
        std::weak_ptr<DecodedFrame> frame;
        size_t bytes = 0;
    };
    mutable std::vector<Evicted> m_evicted;  // pruned as frames die
    long long m_hits = 0;
    long long m_misses = 0;
};

}  // namespace nt
