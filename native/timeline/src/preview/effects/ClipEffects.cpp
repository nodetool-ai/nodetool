#include "preview/effects/ClipEffects.h"
#include "preview/RetireQueue.h"
#include <QFile>
#include <algorithm>
#include <span>

namespace nt::effects {
namespace {
QShader shader(const char *name) {
    QFile file(QString::fromLatin1(name));
    if (!file.open(QIODevice::ReadOnly)) {
        return {};
    }
    return QShader::fromSerialized(file.readAll());
}
struct Uniforms {
    std::array<float, 16> matrix{}, colorMatrix{};
    std::array<float, 4> geometry{}, sourceRect{}, dimensions{}, origin{};
    std::array<float, 16> params{};
};
static_assert(sizeof(Uniforms) == 256);
struct Surface {
    std::unique_ptr<QRhiTexture> texture;
    std::unique_ptr<QRhiRenderPassDescriptor> descriptor;
    std::unique_ptr<QRhiTextureRenderTarget> target;
};
struct Draw {
    std::unique_ptr<QRhiBuffer> uniforms;
    std::unique_ptr<QRhiShaderResourceBindings> bindings;
    std::unique_ptr<QRhiGraphicsPipeline> pipeline;
};
struct Resources {
    std::unique_ptr<QRhiBuffer> vertices;
    std::unique_ptr<QRhiSampler> sampler;
    std::vector<std::unique_ptr<Surface>> surfaces;
    std::vector<std::unique_ptr<Draw>> draws;
    std::vector<std::shared_ptr<void>> luts;
};
LayerFrame frameFor(QRhiTexture *texture, bool flip) {
    LayerFrame frame;
    frame.format = LayerFrame::Format::Rgba8Premultiplied;
    frame.size = texture->pixelSize();
    frame.planes[0] = texture;
    frame.flipV = flip;
    return frame;
}
class Encoder {
    const EffectContext &m_ctx;
    std::shared_ptr<Resources> m_resources = std::make_shared<Resources>();

  public:
    explicit Encoder(const EffectContext &ctx) : m_ctx(ctx) {}
    // Even a failed chain can already have recorded passes. Retire that prefix too.
    ~Encoder() { m_ctx.retire->retire(std::move(m_resources), m_ctx.frameNumber); }
    bool initialize() {
        constexpr std::array<float, 16> quad{-1, -1, 0, 1, 1, -1, 1, 1, -1, 1, 0, 0, 1, 1, 1, 0};
        const auto bytes = std::as_bytes(std::span{quad});
        auto *rhi = m_ctx.rhi;
        m_resources->vertices.reset(
            rhi->newBuffer(QRhiBuffer::Immutable, QRhiBuffer::VertexBuffer, quint32(bytes.size())));
        m_resources->sampler.reset(rhi->newSampler(QRhiSampler::Linear, QRhiSampler::Linear, QRhiSampler::None,
                                                   QRhiSampler::ClampToEdge, QRhiSampler::ClampToEdge));
        if (!m_resources->vertices->create() || !m_resources->sampler->create()) {
            return false;
        }
        auto *updates = rhi->nextResourceUpdateBatch();
        updates->uploadStaticBuffer(m_resources->vertices.get(), bytes.data());
        m_ctx.commands->resourceUpdate(updates);
        return true;
    }
    QRhiTextureRenderTarget *surface(QSize size) {
        auto surface = std::make_unique<Surface>();
        auto *rhi = m_ctx.rhi;
        surface->texture.reset(rhi->newTexture(QRhiTexture::RGBA8, size, 1, QRhiTexture::RenderTarget));
        if (!surface->texture->create()) {
            return nullptr;
        }
        surface->target.reset(rhi->newTextureRenderTarget({QRhiColorAttachment(surface->texture.get())}));
        surface->descriptor.reset(surface->target->newCompatibleRenderPassDescriptor());
        surface->target->setRenderPassDescriptor(surface->descriptor.get());
        if (!surface->target->create()) {
            return nullptr;
        }
        auto *result = surface->target.get();
        m_resources->surfaces.push_back(std::move(surface));
        return result;
    }
    LayerFrame result(QRhiTextureRenderTarget *target) const {
        return frameFor(target->description().colorAttachmentAt(0)->texture(), m_ctx.rhi->isYUpInFramebuffer());
    }
    void retain(const std::shared_ptr<void> &lut) { m_resources->luts.push_back(lut); }
    bool draw(const LayerFrame &input, QRhiTextureRenderTarget &output, const Pass &pass, QSize logical,
              QPoint logicalOrigin, QRhiTexture *other = nullptr, const QRect *copy = nullptr, QPoint readOrigin = {}) {
        auto draw = std::make_unique<Draw>();
        auto *rhi = m_ctx.rhi;
        draw->uniforms.reset(rhi->newBuffer(QRhiBuffer::Dynamic, QRhiBuffer::UniformBuffer, sizeof(Uniforms)));
        if (!draw->uniforms->create()) {
            return false;
        }
        const auto plane = [&](int index) { return input.planes[index] ? input.planes[index] : input.planes[0]; };
        draw->bindings.reset(rhi->newShaderResourceBindings());
        draw->bindings->setBindings(
            {QRhiShaderResourceBinding::uniformBuffer(
                 0, QRhiShaderResourceBinding::VertexStage | QRhiShaderResourceBinding::FragmentStage,
                 draw->uniforms.get()),
             QRhiShaderResourceBinding::sampledTexture(1, QRhiShaderResourceBinding::FragmentStage, plane(0),
                                                       m_resources->sampler.get()),
             QRhiShaderResourceBinding::sampledTexture(2, QRhiShaderResourceBinding::FragmentStage,
                                                       other ? other : plane(1), m_resources->sampler.get()),
             QRhiShaderResourceBinding::sampledTexture(3, QRhiShaderResourceBinding::FragmentStage, plane(2),
                                                       m_resources->sampler.get())});
        if (!draw->bindings->create()) {
            return false;
        }
        draw->pipeline.reset(rhi->newGraphicsPipeline());
        draw->pipeline->setTopology(QRhiGraphicsPipeline::TriangleStrip);
        draw->pipeline->setShaderStages({{QRhiShaderStage::Vertex, shader(":/effects/clip.vert.qsb")},
                                         {QRhiShaderStage::Fragment, shader(":/effects/clip.frag.qsb")}});
        QRhiVertexInputLayout layout;
        layout.setBindings({{4 * sizeof(float)}});
        layout.setAttributes(
            {{0, 0, QRhiVertexInputAttribute::Float2, 0}, {0, 1, QRhiVertexInputAttribute::Float2, 2 * sizeof(float)}});
        draw->pipeline->setVertexInputLayout(layout);
        draw->pipeline->setShaderResourceBindings(draw->bindings.get());
        draw->pipeline->setRenderPassDescriptor(output.renderPassDescriptor());
        if (!draw->pipeline->create()) {
            return false;
        }
        Uniforms u;
        const auto matrix = rhi->clipSpaceCorrMatrix();
        std::ranges::copy(std::span{matrix.constData(), 16}, u.matrix.begin());
        u.colorMatrix = input.colorMatrix;
        const int format = input.format == LayerFrame::Format::I420   ? 1
                           : input.format == LayerFrame::Format::Nv12 ? 2
                                                                      : 0;
        u.geometry = {input.flipV ? 1.f : 0.f, float(format), float(pass.op), 0};
        u.dimensions = {float(input.size.width()), float(input.size.height()), float(logical.width()),
                        float(logical.height())};
        u.origin = {float(logicalOrigin.x()), float(logicalOrigin.y()), 0, 0};
        if (copy) {
            u.sourceRect = {float(copy->x()), float(copy->y()), float(copy->width()), float(copy->height())};
            u.origin = {float(readOrigin.x()), float(readOrigin.y()), float(output.pixelSize().width()),
                        float(output.pixelSize().height())};
        }
        u.params = pass.params;
        auto *updates = rhi->nextResourceUpdateBatch();
        updates->updateDynamicBuffer(draw->uniforms.get(), 0, sizeof(u), &u);
        auto *cb = m_ctx.commands;
        cb->beginPass(&output, Qt::transparent, {1, 0}, updates);
        cb->setGraphicsPipeline(draw->pipeline.get());
        cb->setViewport({0, 0, float(output.pixelSize().width()), float(output.pixelSize().height())});
        cb->setShaderResources(draw->bindings.get());
        const QRhiCommandBuffer::VertexInput vertices(m_resources->vertices.get(), 0);
        cb->setVertexInput(0, 1, &vertices);
        cb->draw(4);
        cb->endPass();
        m_resources->draws.push_back(std::move(draw));
        return true;
    }
};
} // namespace
struct ClipEffectStage::Lut {
    Cube cube;
    std::unique_ptr<QRhiTexture> texture;
};
bool ClipEffectStage::applies(const QJsonObject &ext) const {
    return !planChain(ext.value("clipEffects").toArray()).empty();
}
QMargins ClipEffectStage::outset(const QJsonObject &ext, QSize) const {
    return chainOutset(ext.value("clipEffects").toArray());
}
bool ClipEffectStage::render(const EffectContext &ctx, const LayerFrame &input, QRhiTextureRenderTarget &output,
                             const QJsonObject &ext) {
    if (!ctx.rhi || !ctx.commands || !ctx.retire || !input.planes[0] || input.size.isEmpty()) {
        return false;
    }
    const auto effects = ext.value("clipEffects").toArray();
    const auto chain = planChain(effects);
    const auto crop = cropPixels(ext, input.size);
    const auto margins = outset(ext, input.size);
    const QSize workingSize = crop.size() + QSize(margins.left() + margins.right(), margins.top() + margins.bottom());
    const QPoint pad{margins.left(), margins.top()};
    Encoder encoder(ctx);
    if (!encoder.initialize()) {
        return false;
    }
    auto *extracted = encoder.surface(workingSize);
    if (!extracted) {
        return false;
    }
    const QRect destination{pad, crop.size()};
    if (!encoder.draw(input, *extracted, {}, crop.size(), pad, nullptr, &destination, crop.topLeft())) {
        return false;
    }
    auto current = encoder.result(extracted);
    std::optional<LayerFrame> recipeSource;
    const auto step = [&](const Pass &pass, QRhiTexture *other = nullptr) {
        auto *target = encoder.surface(workingSize);
        if (!target || !encoder.draw(current, *target, pass, crop.size(), pad, other)) {
            return false;
        }
        current = encoder.result(target);
        return true;
    };
    for (auto pass : chain) {
        if (pass.op == Op::ChromaKey) {
            Pass bridge;
            bridge.op = Op::ToStraight;
            if (!step(bridge)) {
                return false;
            }
        }
        if (pass.op == Op::Threshold || pass.op == Op::AlphaMask) {
            recipeSource = current;
        }
        QRhiTexture *other = nullptr;
        if (pass.op == Op::Lut) {
            auto found = m_luts.find(pass.cube);
            if (found == m_luts.end()) {
                auto parsed = parseCube(pass.cube);
                if (!parsed) {
                    qWarning("Invalid .cube in clip effect");
                    return false;
                }
                auto lut = std::make_shared<Lut>();
                lut->cube = std::move(*parsed);
                const int size = lut->cube.size, width = size * size;
                lut->texture.reset(ctx.rhi->newTexture(QRhiTexture::RGBA16F, {width, size}));
                if (!lut->texture->create()) {
                    return false;
                }
                std::vector<std::uint16_t> pixels(size_t(width * size * 4));
                for (int b = 0; b < size; ++b) {
                    for (int g = 0; g < size; ++g) {
                        for (int r = 0; r < size; ++r) {
                            const int source = ((b * size + g) * size + r) * 3, target = (g * width + b * size + r) * 4;
                            for (int c = 0; c < 3; ++c) {
                                pixels[target + c] = cubeHalfBits(lut->cube.rgb[source + c]);
                            }
                            pixels[target + 3] = cubeHalfBits(1.f);
                        }
                    }
                }
                const auto bytes = std::as_bytes(std::span{pixels});
                QRhiTextureSubresourceUploadDescription upload(
                    QByteArray(reinterpret_cast<const char *>(bytes.data()), qsizetype(bytes.size())));
                auto *updates = ctx.rhi->nextResourceUpdateBatch();
                updates->uploadTexture(lut->texture.get(), {{0, 0, upload}});
                ctx.commands->resourceUpdate(updates);
                found = m_luts.emplace(pass.cube, std::move(lut)).first;
            }
            const auto &lut = found->second;
            pass.params[1] = float(lut->cube.size);
            std::copy(lut->cube.minimum.begin(), lut->cube.minimum.end(), pass.params.begin() + 4);
            std::copy(lut->cube.maximum.begin(), lut->cube.maximum.end(), pass.params.begin() + 8);
            other = lut->texture.get();
            encoder.retain(lut);
        } else if (pass.op == Op::Add || pass.op == Op::Shadow) {
            if (!recipeSource) {
                return false;
            }
            other = current.planes[0];
            current = *recipeSource;
            recipeSource.reset();
        }
        if (!step(pass, other)) {
            return false;
        }
    }
    if (!ext.value("effectGroupSurface").toBool()) {
        // Web clip chains return straight RGBA8. S4 consumes premultiplied.
        // Preserve both quantized boundary conversions instead of folding them.
        Pass bridge;
        bridge.op = Op::ToStraight;
        if (!step(bridge)) {
            return false;
        }
        bridge.op = Op::ToPremul;
        if (!step(bridge)) {
            return false;
        }
    }
    const QRect back{crop.topLeft(), workingSize};
    return encoder.draw(current, output, {}, crop.size(), pad, nullptr, &back);
}
} // namespace nt::effects
