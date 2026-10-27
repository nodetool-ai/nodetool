#include "preview/effects/BlendModes.h"
#include "preview/RetireQueue.h"
#include "preview/effects/DrawCache.h"
#include <QScopeGuard>
#include <algorithm>
#include <span>

namespace nt::effects {
namespace {
struct Resources {
    std::shared_ptr<DrawCache> cache;
    std::unique_ptr<QRhiBuffer> uniforms;
    std::unique_ptr<QRhiShaderResourceBindings> bindings;
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
        backdrop.format != LayerFrame::Format::Rgba8Premultiplied || layer.format != backdrop.format ||
        !backdrop.planes[0] || !layer.planes[0] || backdrop.size != output.pixelSize() || layer.size != backdrop.size) {
        return false;
    }
    auto resources = std::make_shared<Resources>();
    const auto retirement = qScopeGuard([&] { ctx.retire->retire(std::move(resources), ctx.frameNumber); });
    auto* rhi = ctx.rhi;
    if (!m_drawCache) { m_drawCache = std::make_shared<DrawCache>(); }
    resources->cache = m_drawCache;
    if (!m_drawCache->initialize(ctx, ":/effects/blend.vert.qsb", ":/effects/blend.frag.qsb", QRhiSampler::Nearest)) { return false; }
    resources->uniforms.reset(rhi->newBuffer(QRhiBuffer::Dynamic, QRhiBuffer::UniformBuffer, sizeof(Uniforms)));
    if (!resources->uniforms->create()) { return false; }
    resources->bindings.reset(rhi->newShaderResourceBindings());
    resources->bindings->setBindings({
        QRhiShaderResourceBinding::uniformBuffer(0, QRhiShaderResourceBinding::VertexStage | QRhiShaderResourceBinding::FragmentStage, resources->uniforms.get()),
        QRhiShaderResourceBinding::sampledTexture(1, QRhiShaderResourceBinding::FragmentStage, backdrop.planes[0], m_drawCache->sampler()),
        QRhiShaderResourceBinding::sampledTexture(2, QRhiShaderResourceBinding::FragmentStage, layer.planes[0], m_drawCache->sampler())
    });
    if (!resources->bindings->create()) { return false; }
    auto *pipeline = m_drawCache->pipeline(rhi, output, resources->bindings.get());
    if (!pipeline) { return false; }
    Uniforms u{};
    const auto matrix = rhi->clipSpaceCorrMatrix();
    std::ranges::copy(std::span{matrix.constData(),16},u.matrix.begin());
    u.flipsMode = {backdrop.flipV ? 1.f : 0.f, layer.flipV ? 1.f : 0.f,
                   static_cast<float>(std::distance(blendModes.begin(),found)+1), 0};
    auto* updates = rhi->nextResourceUpdateBatch();
    updates->updateDynamicBuffer(resources->uniforms.get(),0,sizeof(u),&u);
    auto* cb = ctx.commands;
    cb->beginPass(&output,Qt::transparent,{1,0},updates);
    cb->setGraphicsPipeline(pipeline);
    cb->setViewport({0,0,static_cast<float>(output.pixelSize().width()),static_cast<float>(output.pixelSize().height())});
    cb->setShaderResources(resources->bindings.get());
    const QRhiCommandBuffer::VertexInput vertexInput(m_drawCache->vertices(),0);
    cb->setVertexInput(0,1,&vertexInput);
    cb->draw(3);
    cb->endPass();
    return true;
}
}
