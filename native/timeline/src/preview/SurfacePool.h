#pragma once

// Pooled render targets for the intermediate surfaces of precomposited groups
// (DESIGN.md D35). A frame acquires one target per drawn surface and returns
// them all at its end, so a steady scene allocates nothing after its first
// frame. A target idle for kIdleFrames frames is freed, and so is a free
// target whose size the last frame did not use (a canvas size change).
//
// Memory: the pool holds at most `budgetBytes` of targets (RGBA8, 4 bytes a
// pixel; a 4K surface is about 31.6 MiB). A new target first evicts free
// targets, the least recently used first. When the targets one frame uses
// already exceed the budget, the pool still creates them (the picture stays
// right) and reports the frame as over budget.
//
// Lifetime (review F1): endFrame() runs after the frame's passes are
// recorded and before the frame is submitted, and those commands still use
// the targets the frame acquired. So no target is freed in the frame that
// used it: every eviction takes only targets last used in an earlier frame,
// which the renderer has already submitted (QRhi then defers the native
// release until the GPU is done with it). A frame over the budget is trimmed
// at the end of the next frame, or by the next frame's first acquire.
//
// `Target` is whatever the renderer keeps per surface (a texture, its render
// target, its bindings); the factory creates one of a size. No GPU types
// here, so the policy is tested without a device.

#include <QSize>

#include <algorithm>
#include <cstddef>
#include <functional>
#include <memory>
#include <vector>

namespace nt {

template <typename Target>
class SurfacePool {
public:
    static constexpr long long kIdleFrames = 300;
    static constexpr size_t kDefaultBudgetBytes = size_t(512) * 1024 * 1024;
    using Factory = std::function<std::unique_ptr<Target>(QSize)>;

    explicit SurfacePool(Factory factory, size_t budgetBytes = kDefaultBudgetBytes)
        : m_factory(std::move(factory)), m_budget(budgetBytes) {}

    static size_t bytesFor(QSize size) {
        return static_cast<size_t>(std::max(0, size.width())) * static_cast<size_t>(std::max(0, size.height())) * 4u;
    }
    void setBudgetBytes(size_t budget) { m_budget = budget; }
    size_t budgetBytes() const { return m_budget; }

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
        const size_t need = bytesFor(size);
        evictFreeUntil(need, frame);
        std::unique_ptr<Target> t = m_factory(size);
        if (!t) return nullptr;
        ++m_created;
        m_bytes += need;
        if (m_bytes > m_budget) m_overBudget = true;  // this frame alone needs more
        m_slots.push_back({std::move(t), size, frame, true});
        return m_slots.back().target.get();
    }

    // The frame's passes are recorded (not yet submitted): every target is
    // free again. Frees idle targets, targets of a size this frame did not
    // use, and the least recently used ones over the budget, all only among
    // targets this frame did not use.
    void endFrame(long long frame, QSize frameSize) {
        m_lastFrameOverBudget = m_overBudget;
        m_overBudget = false;
        for (auto it = m_slots.begin(); it != m_slots.end();) {
            it->inUse = false;
            const bool usedThisFrame = it->lastUsed >= frame;
            if (!usedThisFrame && (frame - it->lastUsed > kIdleFrames || it->size != frameSize)) {
                m_bytes -= bytesFor(it->size);
                it = m_slots.erase(it);
                ++m_freed;
            } else {
                ++it;
            }
        }
        evictFreeUntil(0, frame);  // toward the budget, keeping this frame's targets
    }

    // Frees every target (device loss, renderer teardown).
    void clear() {
        m_freed += static_cast<long long>(m_slots.size());
        m_slots.clear();
        m_bytes = 0;
    }

    int size() const { return static_cast<int>(m_slots.size()); }
    long long created() const { return m_created; }
    long long freed() const { return m_freed; }
    size_t bytes() const { return m_bytes; }
    // Whether the last finished frame needed more than the budget by itself.
    bool lastFrameOverBudget() const { return m_lastFrameOverBudget; }

private:
    // Frees free targets last used before `frame`, least recently used
    // first, until `extra` more bytes fit in the budget or none is left.
    void evictFreeUntil(size_t extra, long long frame) {
        while (m_bytes + extra > m_budget) {
            auto victim = m_slots.end();
            for (auto it = m_slots.begin(); it != m_slots.end(); ++it) {
                if (it->inUse || it->lastUsed >= frame) continue;
                if (victim == m_slots.end() || it->lastUsed < victim->lastUsed) victim = it;
            }
            if (victim == m_slots.end()) return;
            m_bytes -= bytesFor(victim->size);
            m_slots.erase(victim);
            ++m_freed;
        }
    }

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
    size_t m_budget;
    size_t m_bytes = 0;
    bool m_overBudget = false;
    bool m_lastFrameOverBudget = false;
};

}  // namespace nt
