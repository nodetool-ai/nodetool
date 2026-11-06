#pragma once

// GPU resources a replaced frame still owns (DESIGN.md D11): an imported
// texture wraps a decoder surface that QRhi does not own, so it must outlive
// every command buffer that samples it. Each entry records the frame number of
// its last use and is released once QRhi::FramesInFlight later frames have
// begun, which is when the command buffer of its last use has completed.

#include <deque>
#include <memory>

namespace nt {

class RetireQueue {
public:
    // `lastUseFrame` is the renderer's frame number of the last frame that
    // drew with `resource`.
    void retire(std::shared_ptr<void> resource, long long lastUseFrame) {
        if (resource) m_entries.push_back({std::move(resource), lastUseFrame});
    }

    // Called at the start of frame `frameNumber`: releases the entries whose
    // last use is at least `framesInFlight` frames back. Returns how many.
    int collect(long long frameNumber, int framesInFlight) {
        int released = 0;
        while (!m_entries.empty() && m_entries.front().lastUse <= frameNumber - framesInFlight) {
            m_entries.pop_front();
            ++released;
        }
        return released;
    }

    bool empty() const { return m_entries.empty(); }
    size_t size() const { return m_entries.size(); }
    // The renderer's destructor: the device is idle or gone, release all.
    void clear() { m_entries.clear(); }

private:
    struct Entry {
        std::shared_ptr<void> resource;
        long long lastUse;
    };
    std::deque<Entry> m_entries;  // in last-use order
};

}  // namespace nt
