#include "preview/effects/DrawCache.h"
#include "motion/capacity/ScratchPool.h"
#include <QFile>
#include <algorithm>
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
DrawCache::DrawSlot DrawCache::acquireDraw(QRhi *rhi, long long frameNumber, quint32 uniformBytes,
                                           std::span<QRhiTexture *const> textures) {
    if (!rhi || !m_sampler || uniformBytes == 0 || textures.empty() || textures.size() > 3) {
        return {};
    }
    if (m_drawRhi && m_drawRhi != rhi) {
        m_drawPool.clear();
        m_scanCursor = 0;
        m_lastDrawFrame = -1;
    }
    m_drawRhi = rhi;
    if (frameNumber != m_lastDrawFrame) {
        m_lastDrawFrame = frameNumber;
        m_scanCursor = 0;
    }
    const int count = static_cast<int>(textures.size());
    std::array<QRhiTexture *, 3> wantPtrs{};
    std::array<quint64, 3> wantIds{};
    for (int i = 0; i < count; ++i) {
        if (!textures[static_cast<size_t>(i)]) return {};
        wantPtrs[static_cast<size_t>(i)] = textures[static_cast<size_t>(i)];
        wantIds[static_cast<size_t>(i)] = textures[static_cast<size_t>(i)]->globalResourceId();
    }
    const auto bindSlot = [&](PooledDraw &slot) -> bool {
        std::vector<QRhiShaderResourceBinding> list;
        list.reserve(static_cast<size_t>(count) + 1);
        list.push_back(QRhiShaderResourceBinding::uniformBuffer(
            0, QRhiShaderResourceBinding::VertexStage | QRhiShaderResourceBinding::FragmentStage,
            slot.uniforms.get()));
        for (int i = 0; i < count; ++i) {
            list.push_back(QRhiShaderResourceBinding::sampledTexture(
                i + 1, QRhiShaderResourceBinding::FragmentStage, wantPtrs[static_cast<size_t>(i)],
                m_sampler.get()));
        }
        slot.bindings->setBindings(list.begin(), list.end());
        if (!slot.bindings->create()) {
            slot.bound = {};
            slot.boundIds = {};
            return false;
        }
        slot.bound = wantPtrs;
        slot.boundIds = wantIds;
        ++m_drawBindingCreates;
        return true;
    };

    // Tier 1: exact match from an earlier frame — zero allocations and zero SRB rebuilds.
    // Start at `m_scanCursor` so steady-state frames that issue passes in the same
    // order match in O(1).
    const size_t poolSize = m_drawPool.size();
    if (poolSize > 0) {
        const size_t start = m_scanCursor % poolSize;
        for (size_t offset = 0; offset < poolSize; ++offset) {
            const size_t idx = (start + offset) % poolSize;
            auto &slot = m_drawPool[idx];
            if (slot.lastUsedFrame < frameNumber && slot.uniformBytes == uniformBytes && slot.textureCount == count &&
                slot.bound == wantPtrs && slot.boundIds == wantIds) {
                slot.lastUsedFrame = frameNumber;
                m_scanCursor = (idx + 1) % poolSize;
                return {slot.uniforms.get(), slot.bindings.get()};
            }
        }
    }

    // Tier 2: rebind the oldest idle slot whose GPU command buffers have completed.
    const int framesInFlight = std::max(1, rhi->resourceLimit(QRhi::FramesInFlight));
    PooledDraw *oldestIdle = nullptr;
    for (auto &slot : m_drawPool) {
        if (frameNumber - slot.lastUsedFrame > framesInFlight && slot.uniformBytes == uniformBytes &&
            slot.textureCount == count) {
            if (!oldestIdle || slot.lastUsedFrame < oldestIdle->lastUsedFrame) {
                oldestIdle = &slot;
            }
        }
    }
    if (oldestIdle) {
        if (!bindSlot(*oldestIdle)) return {};
        oldestIdle->lastUsedFrame = frameNumber;
        return {oldestIdle->uniforms.get(), oldestIdle->bindings.get()};
    }

    // Prune completed idle slots before growing past a steady-state cap.
    constexpr size_t kMaxDrawPool = 256;
    if (m_drawPool.size() >= kMaxDrawPool) {
        std::erase_if(m_drawPool, [&](const PooledDraw &slot) {
            return frameNumber - slot.lastUsedFrame > framesInFlight;
        });
        m_scanCursor = 0;
    }

    // Tier 3: allocate a new pooled dynamic uniform buffer + SRB.
    PooledDraw created;
    created.uniformBytes = uniformBytes;
    created.textureCount = count;
    created.uniforms.reset(rhi->newBuffer(QRhiBuffer::Dynamic, QRhiBuffer::UniformBuffer, uniformBytes));
    if (!created.uniforms->create()) {
        return {};
    }
    ++m_drawBufferCreates;
    created.bindings.reset(rhi->newShaderResourceBindings());
    if (!bindSlot(created)) {
        return {};
    }
    created.lastUsedFrame = frameNumber;
    DrawSlot out{created.uniforms.get(), created.bindings.get()};
    m_drawPool.push_back(std::move(created));
    return out;
}
} // namespace nt::effects
