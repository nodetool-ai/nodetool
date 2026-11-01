#include "preview/effects/DrawCache.h"
#include "motion/capacity/ScratchPool.h"
#include <QFile>
#include <array>
#include <span>

namespace nt::effects {
namespace {
QShader shader(const char *name) {
    QFile file(QString::fromLatin1(name));
    return file.open(QIODevice::ReadOnly) ? QShader::fromSerialized(file.readAll()) : QShader{};
}
} // namespace
std::shared_ptr<nt::motion::ScratchPool> DrawCache::scratchPool() {
    if (!m_scratch) m_scratch = std::make_shared<nt::motion::ScratchPool>();
    return m_scratch;
}
bool DrawCache::initialize(const EffectContext &ctx, const char *vertex, const char *fragment,
                           QRhiSampler::Filter filter) {
    if (m_vertices) {
        return true;
    }
    m_vertex = shader(vertex);
    m_fragment = shader(fragment);
    if (!m_vertex.isValid() || !m_fragment.isValid()) {
        return false;
    }
    // Match the exporter's fullscreen triangle, including UV interpolation
    // at the integer boundaries used by glitch rows and noise cells.
    constexpr std::array<float, 12> triangle{-1, -1, 0, 1, 3, -1, 2, 1, -1, 3, 0, -1};
    const auto bytes = std::as_bytes(std::span{triangle});
    auto vertices = std::unique_ptr<QRhiBuffer>(
        ctx.rhi->newBuffer(QRhiBuffer::Immutable, QRhiBuffer::VertexBuffer, quint32(bytes.size())));
    auto sampler = std::unique_ptr<QRhiSampler>(ctx.rhi->newSampler(
        filter, filter, QRhiSampler::None, QRhiSampler::ClampToEdge, QRhiSampler::ClampToEdge));
    if (!vertices->create() || !sampler->create()) {
        return false;
    }
    auto *updates = ctx.rhi->nextResourceUpdateBatch();
    updates->uploadStaticBuffer(vertices.get(), bytes.data());
    ctx.commands->resourceUpdate(updates);
    m_vertices = std::move(vertices);
    m_sampler = std::move(sampler);
    return true;
}
QRhiGraphicsPipeline *DrawCache::pipeline(QRhi *rhi, QRhiTextureRenderTarget &output,
                                         QRhiShaderResourceBindings *bindings) {
    for (const auto &entry : m_pipelines) {
        if (entry.descriptor->isCompatible(output.renderPassDescriptor())) {
            return entry.pipeline.get();
        }
    }
    if (!m_layout) {
        // Pipelines need a stable layout, not a frame's textures or uniforms.
        std::vector<QRhiShaderResourceBinding> layout{QRhiShaderResourceBinding::uniformBuffer(
            0, QRhiShaderResourceBinding::VertexStage | QRhiShaderResourceBinding::FragmentStage, nullptr)};
        for (int i = 1; i < bindings->bindingCount(); ++i) {
            layout.push_back(QRhiShaderResourceBinding::sampledTexture(
                i, QRhiShaderResourceBinding::FragmentStage, nullptr, nullptr));
        }
        auto resourceLayout = std::unique_ptr<QRhiShaderResourceBindings>(rhi->newShaderResourceBindings());
        resourceLayout->setBindings(layout.begin(), layout.end());
        if (!resourceLayout->create()) { return nullptr; }
        m_layout = std::move(resourceLayout);
    }
    Pipeline entry;
    entry.descriptor.reset(output.renderPassDescriptor()->newCompatibleRenderPassDescriptor());
    entry.pipeline.reset(rhi->newGraphicsPipeline());
    entry.pipeline->setTopology(QRhiGraphicsPipeline::Triangles);
    entry.pipeline->setShaderStages({{QRhiShaderStage::Vertex, m_vertex}, {QRhiShaderStage::Fragment, m_fragment}});
    QRhiVertexInputLayout layout;
    layout.setBindings({{4 * sizeof(float)}});
    layout.setAttributes(
        {{0, 0, QRhiVertexInputAttribute::Float2, 0}, {0, 1, QRhiVertexInputAttribute::Float2, 2 * sizeof(float)}});
    entry.pipeline->setVertexInputLayout(layout);
    entry.pipeline->setShaderResourceBindings(m_layout.get());
    entry.pipeline->setRenderPassDescriptor(entry.descriptor.get());
    entry.pipeline->setSampleCount(output.sampleCount());
    if (!entry.pipeline->create()) {
        return nullptr;
    }
    auto *result = entry.pipeline.get();
    m_pipelines.push_back(std::move(entry));
    return result;
}
} // namespace nt::effects
