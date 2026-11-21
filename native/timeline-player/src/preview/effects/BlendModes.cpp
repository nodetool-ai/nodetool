#include "preview/effects/BlendModes.h"
#include "preview/RetireQueue.h"
#include "preview/effects/DrawCache.h"
#include <QScopeGuard>
#include <algorithm>
#include <span>

namespace nt::effects {
namespace {
struct Resources {
    // Retains DrawCache (pooled buffers, bindings, pipeline, vertices, sampler)
    // until RetireQueue collects this frame.
    std::shared_ptr<DrawCache> cache;
};
struct Uniforms {
    std::array<float,16> matrix;
    std::array<float,4> flipsMode;
};
static_assert(sizeof(Uniforms) == 80);
}

bool BlendModeHandler::render(const EffectContext& ctx, const LayerFrame& backdrop, const LayerFrame& layer,
                              QRhiTextureRenderTarget& output, const std::string& mode, const QJsonObject&) {
    const auto found = std::ranges::find(blendModes,mode);
    if (found == blendModes.end() || !ctx.rhi || !ctx.commands || !ctx.retire ||
        (backdrop.format != LayerFrame::Format::Rgba8Premultiplied && backdrop.format != LayerFrame::Format::Rgba16FPremultiplied) || layer.format != backdrop.format ||
        !backdrop.planes[0] || !layer.planes[0] || backdrop.size != output.pixelSize() || layer.size != backdrop.size) {
        return false;
    }
    auto resources = std::make_shared<Resources>();
    const auto retirement = qScopeGuard([&] { ctx.retire->retire(std::move(resources), ctx.frameNumber); });
    auto* rhi = ctx.rhi;
    if (!m_drawCache) { m_drawCache = std::make_shared<DrawCache>(); }
    resources->cache = m_drawCache;
    if (!m_drawCache->initialize(ctx, ":/effects/blend.vert.qsb", ":/effects/blend.frag.qsb", QRhiSampler::Nearest)) { return false; }
    const std::array<QRhiTexture*, 2> textures{backdrop.planes[0], layer.planes[0]};
    const auto slot = m_drawCache->acquireDraw(rhi, ctx.frameNumber, sizeof(Uniforms), textures);
    if (!slot.uniforms || !slot.bindings) { return false; }
    auto *pipeline = m_drawCache->pipeline(rhi, output, slot.bindings);
    if (!pipeline) { return false; }
    Uniforms u{};
    const auto matrix = rhi->clipSpaceCorrMatrix();
    std::ranges::copy(std::span{matrix.constData(),16},u.matrix.begin());
    u.flipsMode = {backdrop.flipV ? 1.f : 0.f, layer.flipV ? 1.f : 0.f,
                   static_cast<float>(std::distance(blendModes.begin(),found)+1), ctx.workingFormat == WorkingFormat::Rgba16F ? 1.f : 0.f};
    auto* updates = rhi->nextResourceUpdateBatch();
    updates->updateDynamicBuffer(slot.uniforms,0,sizeof(u),&u);
    auto* cb = ctx.commands;
    cb->beginPass(&output,Qt::transparent,{1,0},updates);
    cb->setGraphicsPipeline(pipeline);
    cb->setViewport({0,0,static_cast<float>(output.pixelSize().width()),static_cast<float>(output.pixelSize().height())});
    cb->setShaderResources(slot.bindings);
    const QRhiCommandBuffer::VertexInput vertexInput(m_drawCache->vertices(),0);
    cb->setVertexInput(0,1,&vertexInput);
    cb->draw(3);
    cb->endPass();
    return true;
}
}
