#pragma once
#include "preview/layers/LayerRegistry.h"
#include <array>
#include <cstdint>
#include <memory>
#include <span>
#include <vector>

namespace nt::motion { class ScratchPool; }
namespace nt::effects {
// Render thread only. A frame retains this owner through RetireQueue,
// including on a failed chain, so pooled buffers, bindings, pipelines, and
// scratch surfaces stay alive until every in-flight command buffer finishes.
class DrawCache {
  public:
    struct DrawSlot {
        QRhiBuffer *uniforms = nullptr;
        QRhiShaderResourceBindings *bindings = nullptr;
    };

    bool initialize(const EffectContext &ctx, const char *vertex, const char *fragment, QRhiSampler::Filter filter);
    QRhiGraphicsPipeline *pipeline(QRhi *rhi, QRhiTextureRenderTarget &output, QRhiShaderResourceBindings *bindings);
    // Acquires a pooled dynamic uniform buffer and SRB for one pass in
    // `frameNumber`. Reuses an exact texture-binding match from a prior frame
    // without recreating the SRB, and only rebinds an idle slot once
    // `FramesInFlight` frames have completed.
    DrawSlot acquireDraw(QRhi *rhi, long long frameNumber, quint32 uniformBytes,
                         std::span<QRhiTexture *const> textures);
    QRhiBuffer *vertices() const { return m_vertices.get(); }
    QRhiSampler *sampler() const { return m_sampler.get(); }
    std::shared_ptr<nt::motion::ScratchPool> scratchPool();

    size_t drawPoolSize() const { return m_drawPool.size(); }
    long long drawBufferCreates() const { return m_drawBufferCreates; }
    long long drawBindingCreates() const { return m_drawBindingCreates; }

  private:
    struct Pipeline {
        std::unique_ptr<QRhiRenderPassDescriptor> descriptor;
        std::unique_ptr<QRhiGraphicsPipeline> pipeline;
    };
    struct PooledDraw {
        std::unique_ptr<QRhiBuffer> uniforms;
        std::unique_ptr<QRhiShaderResourceBindings> bindings;
        quint32 uniformBytes = 0;
        int textureCount = 0;
        std::array<QRhiTexture *, 3> bound{};
        std::array<quint64, 3> boundIds{};
        long long lastUsedFrame = -1;
    };
    QShader m_vertex, m_fragment;
    std::unique_ptr<QRhiBuffer> m_vertices;
    std::unique_ptr<QRhiSampler> m_sampler;
    std::unique_ptr<QRhiShaderResourceBindings> m_layout;
    std::vector<Pipeline> m_pipelines;
    QRhi *m_drawRhi = nullptr;
    std::vector<PooledDraw> m_drawPool;
    long long m_lastDrawFrame = -1;
    size_t m_scanCursor = 0;
    long long m_drawBufferCreates = 0;
    long long m_drawBindingCreates = 0;
    // Shared with active Encoders so scratch surfaces stay alive through RetireQueue
    // even if a stage resets while a command buffer is still in flight.
    std::shared_ptr<nt::motion::ScratchPool> m_scratch;
};
} // namespace nt::effects
