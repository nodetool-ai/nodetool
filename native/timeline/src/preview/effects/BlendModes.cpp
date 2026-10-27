#include "preview/effects/BlendModes.h"
#include "preview/RetireQueue.h"
#include <QFile>
#include <algorithm>
#include <span>

namespace nt::effects {
namespace {
QShader shader(const char* name) {
    QFile file(QString::fromLatin1(name));
    if (!file.open(QIODevice::ReadOnly)) { return {}; }
    return QShader::fromSerialized(file.readAll());
}
struct Resources {
    std::unique_ptr<QRhiBuffer> vertices, uniforms;
    std::unique_ptr<QRhiSampler> sampler;
    std::unique_ptr<QRhiShaderResourceBindings> bindings;
    std::unique_ptr<QRhiGraphicsPipeline> pipeline;
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
    auto* rhi = ctx.rhi;
    constexpr std::array<float,16> quad{-1,-1,0,1, 1,-1,1,1, -1,1,0,0, 1,1,1,0};
    const auto vertices = std::as_bytes(std::span{quad});
    resources->vertices.reset(rhi->newBuffer(QRhiBuffer::Immutable,QRhiBuffer::VertexBuffer,static_cast<quint32>(vertices.size())));
    resources->uniforms.reset(rhi->newBuffer(QRhiBuffer::Dynamic,QRhiBuffer::UniformBuffer,sizeof(Uniforms)));
    resources->sampler.reset(rhi->newSampler(QRhiSampler::Nearest,QRhiSampler::Nearest,QRhiSampler::None,
                                           QRhiSampler::ClampToEdge,QRhiSampler::ClampToEdge));
    if (!resources->vertices->create() || !resources->uniforms->create() || !resources->sampler->create()) { return false; }
    resources->bindings.reset(rhi->newShaderResourceBindings());
    resources->bindings->setBindings({
        QRhiShaderResourceBinding::uniformBuffer(0, QRhiShaderResourceBinding::VertexStage | QRhiShaderResourceBinding::FragmentStage, resources->uniforms.get()),
        QRhiShaderResourceBinding::sampledTexture(1, QRhiShaderResourceBinding::FragmentStage, backdrop.planes[0], resources->sampler.get()),
        QRhiShaderResourceBinding::sampledTexture(2, QRhiShaderResourceBinding::FragmentStage, layer.planes[0], resources->sampler.get())
    });
    if (!resources->bindings->create()) { return false; }
    resources->pipeline.reset(rhi->newGraphicsPipeline());
    resources->pipeline->setTopology(QRhiGraphicsPipeline::TriangleStrip);
    resources->pipeline->setShaderStages({{QRhiShaderStage::Vertex,shader(":/effects/blend.vert.qsb")},
                                        {QRhiShaderStage::Fragment,shader(":/effects/blend.frag.qsb")}});
    QRhiVertexInputLayout layout;
    layout.setBindings({{4*sizeof(float)}});
    layout.setAttributes({{0,0,QRhiVertexInputAttribute::Float2,0}, {0,1,QRhiVertexInputAttribute::Float2,2*sizeof(float)}});
    resources->pipeline->setVertexInputLayout(layout);
    resources->pipeline->setShaderResourceBindings(resources->bindings.get());
    resources->pipeline->setRenderPassDescriptor(output.renderPassDescriptor());
    if (!resources->pipeline->create()) { return false; }
    Uniforms u{};
    const auto matrix = rhi->clipSpaceCorrMatrix();
    std::ranges::copy(std::span{matrix.constData(),16},u.matrix.begin());
    u.flipsMode = {backdrop.flipV ? 1.f : 0.f, layer.flipV ? 1.f : 0.f,
                   static_cast<float>(std::distance(blendModes.begin(),found)+1), 0};
    auto* updates = rhi->nextResourceUpdateBatch();
    updates->uploadStaticBuffer(resources->vertices.get(),vertices.data());
    updates->updateDynamicBuffer(resources->uniforms.get(),0,sizeof(u),&u);
    auto* cb = ctx.commands;
    cb->beginPass(&output,Qt::transparent,{1,0},updates);
    cb->setGraphicsPipeline(resources->pipeline.get());
    cb->setViewport({0,0,static_cast<float>(output.pixelSize().width()),static_cast<float>(output.pixelSize().height())});
    cb->setShaderResources(resources->bindings.get());
    const QRhiCommandBuffer::VertexInput vertexInput(resources->vertices.get(),0);
    cb->setVertexInput(0,1,&vertexInput);
    cb->draw(4);
    cb->endPass();
    ctx.retire->retire(std::move(resources),ctx.frameNumber);
    return true;
}
}
