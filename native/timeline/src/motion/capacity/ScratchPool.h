#pragma once

#include "preview/SurfacePool.h"
#include <QSize>
#include <rhi/qrhi.h>
#include <algorithm>
#include <cstdint>
#include <memory>
#include <vector>

namespace nt::motion {
class ScratchPool {
public:
    struct Surface {
        std::unique_ptr<QRhiTexture> texture;
        std::unique_ptr<QRhiRenderPassDescriptor> descriptor;
        std::unique_ptr<QRhiTextureRenderTarget> target;
    };
    using Lease = std::uint64_t;

    explicit ScratchPool(size_t budget = SurfacePool<int>::kDefaultBudgetBytes) : m_budget(budget) {}
    Lease beginLease(long long frame) {
        evictFreeUntil(0, frame);
        return ++m_nextLease;
    }

    std::shared_ptr<Surface> acquire(Lease lease, QRhi* rhi, QSize size, long long frame,
                                     QRhiTexture* source = nullptr, QRhiTexture* other = nullptr,
                                     QRhiTexture* saved = nullptr) {
        if (!rhi || size.isEmpty() || lease == 0) return {};
        if (m_rhi && m_rhi != rhi) {
            if (std::any_of(m_slots.begin(), m_slots.end(), [](const Slot& slot) { return slot.lease != 0; })) return {};
            m_slots.clear();
            m_bytes = 0;
        }
        m_rhi = rhi;
        for (auto& slot : m_slots) {
            auto* texture = slot.surface->texture.get();
            if ((slot.lease == 0 || slot.lease == lease) && texture->pixelSize() == size &&
                texture != source && texture != other && texture != saved) {
                slot.lease = lease;
                slot.lastUsed = frame;
                return slot.surface;
            }
        }
        const auto bytes = SurfacePool<int>::bytesFor(size);
        evictFreeUntil(bytes, frame);
        auto surface = std::make_shared<Surface>();
        surface->texture.reset(rhi->newTexture(QRhiTexture::RGBA8, size, 1, QRhiTexture::RenderTarget));
        if (!surface->texture->create()) return {};
        surface->target.reset(rhi->newTextureRenderTarget({QRhiColorAttachment(surface->texture.get())}));
        surface->descriptor.reset(surface->target->newCompatibleRenderPassDescriptor());
        surface->target->setRenderPassDescriptor(surface->descriptor.get());
        if (!surface->target->create()) return {};
        m_slots.push_back({surface, lease, frame});
        m_bytes += bytes;
        return surface;
    }

    void endLease(Lease lease) {
        for (auto& slot : m_slots) if (slot.lease == lease) slot.lease = 0;
    }

    size_t size() const { return m_slots.size(); }
    size_t bytes() const { return m_bytes; }

private:
    struct Slot { std::shared_ptr<Surface> surface; Lease lease; long long lastUsed; };
    void evictFreeUntil(size_t extra, long long frame) {
        while (m_bytes + extra > m_budget) {
            auto victim = m_slots.end();
            for (auto it = m_slots.begin(); it != m_slots.end(); ++it) {
                if (it->lease != 0 || it->lastUsed >= frame) continue;
                if (victim == m_slots.end() || it->lastUsed < victim->lastUsed) victim = it;
            }
            if (victim == m_slots.end()) return;
            m_bytes -= SurfacePool<int>::bytesFor(victim->surface->texture->pixelSize());
            m_slots.erase(victim);
        }
    }
    QRhi* m_rhi = nullptr;
    Lease m_nextLease = 0;
    size_t m_budget;
    size_t m_bytes = 0;
    std::vector<Slot> m_slots;
};
}  // namespace nt::motion
