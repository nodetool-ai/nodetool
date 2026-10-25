#pragma once

// Pooled render targets for the intermediate surfaces of precomposited groups
// (DESIGN.md D35). A frame acquires one target per drawn surface and returns
// them all at its end, so a steady scene allocates nothing after its first
// frame. A target idle for kIdleFrames frames is freed, and so is a free
// target whose size the last frame did not use (a canvas size change).
//
// `Target` is whatever the renderer keeps per surface (a texture, its render
// target, its bindings); the factory creates one of a size. No GPU types
// here, so the policy is tested without a device.

#include <QSize>

#include <functional>
#include <memory>
#include <vector>

namespace nt {

template <typename Target>
class SurfacePool {
public:
    static constexpr long long kIdleFrames = 300;
    using Factory = std::function<std::unique_ptr<Target>(QSize)>;

    explicit SurfacePool(Factory factory) : m_factory(std::move(factory)) {}

    // A target of `size` for this frame: a free one of that size, else a new
    // one. Null when the factory fails.
    Target* acquire(QSize size, long long frame) {
        for (Slot& s : m_slots) {
            if (!s.inUse && s.size == size) {
                s.inUse = true;
                s.lastUsed = frame;
                return s.target.get();
            }
        }
        std::unique_ptr<Target> t = m_factory(size);
        if (!t) return nullptr;
        ++m_created;
        m_slots.push_back({std::move(t), size, frame, true});
        return m_slots.back().target.get();
    }

    // The frame is done: every target is free again. Frees idle targets and
    // free targets of a size this frame did not use.
    void endFrame(long long frame, QSize frameSize) {
        for (auto it = m_slots.begin(); it != m_slots.end();) {
            it->inUse = false;
            if (frame - it->lastUsed > kIdleFrames || it->size != frameSize) {
                it = m_slots.erase(it);
                ++m_freed;
            } else {
                ++it;
            }
        }
    }

    // Frees every target (device loss, renderer teardown).
    void clear() {
        m_freed += static_cast<long long>(m_slots.size());
        m_slots.clear();
    }

    int size() const { return static_cast<int>(m_slots.size()); }
    long long created() const { return m_created; }
    long long freed() const { return m_freed; }

private:
    struct Slot {
        std::unique_ptr<Target> target;
        QSize size;
        long long lastUsed = 0;
        bool inUse = false;
    };
    Factory m_factory;
    std::vector<Slot> m_slots;
    long long m_created = 0;
    long long m_freed = 0;
};

}  // namespace nt
