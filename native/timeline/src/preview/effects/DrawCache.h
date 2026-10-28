#pragma once
#include "preview/layers/LayerRegistry.h"
#include <memory>
#include <vector>

namespace nt::effects {
// A frame retains this owner through RetireQueue, including on a failed chain.
class DrawCache {
  public:
    bool initialize(const EffectContext &ctx, const char *vertex, const char *fragment, QRhiSampler::Filter filter);
    QRhiGraphicsPipeline *pipeline(QRhi *rhi, QRhiTextureRenderTarget &output, QRhiShaderResourceBindings *bindings);
    QRhiBuffer *vertices() const { return m_vertices.get(); }
    QRhiSampler *sampler() const { return m_sampler.get(); }

  private:
    struct Pipeline {
        std::unique_ptr<QRhiRenderPassDescriptor> descriptor;
        std::unique_ptr<QRhiGraphicsPipeline> pipeline;
    };
    QShader m_vertex, m_fragment;
    std::unique_ptr<QRhiBuffer> m_vertices;
    std::unique_ptr<QRhiSampler> m_sampler;
    std::unique_ptr<QRhiShaderResourceBindings> m_layout;
    std::vector<Pipeline> m_pipelines;
};
} // namespace nt::effects
