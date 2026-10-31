#include "preview/effects/ClipEffects.h"
#include "preview/effects/Masks.h"
#include "preview/RetireQueue.h"
#include "preview/effects/DrawCache.h"
#include "motion/capacity/ScratchPool.h"
#include <QCryptographicHash>
#include <algorithm>
#include <cstring>
#include <span>

namespace nt::effects {
namespace {
struct Uniforms {
    std::array<float, 16> matrix{}, colorMatrix{};
    std::array<float, 4> geometry{}, sourceRect{}, dimensions{}, origin{};
    std::array<float, 16> params{};
};
static_assert(sizeof(Uniforms) == 256);
struct Draw {
    std::unique_ptr<QRhiBuffer> uniforms;
    std::unique_ptr<QRhiShaderResourceBindings> bindings;
};
struct Resources {
    std::shared_ptr<DrawCache> cache;
    std::vector<std::shared_ptr<void>> luts;
    std::vector<std::shared_ptr<nt::motion::ScratchPool::Surface>> surfaces;
    std::vector<std::unique_ptr<Draw>> draws;
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
    std::shared_ptr<nt::motion::ScratchPool> m_scratch;
    nt::motion::ScratchPool::Lease m_lease;

  public:
    Encoder(const EffectContext &ctx, std::shared_ptr<DrawCache> cache) : m_ctx(ctx) {
        m_resources->cache = std::move(cache);
        m_scratch = m_resources->cache->scratchPool();
        m_lease = m_scratch->beginLease(m_ctx.frameNumber);
    }
    // Even a failed chain can already have recorded passes. Retire that prefix too.
    ~Encoder() {
        m_scratch->endLease(m_lease);
        m_ctx.retire->retire(std::move(m_resources), m_ctx.frameNumber);
    }
    QRhiTextureRenderTarget *surface(QSize size, QRhiTexture *source = nullptr, QRhiTexture *other = nullptr,
                                     QRhiTexture *saved = nullptr) {
        auto surface = m_scratch->acquire(m_lease, m_ctx.rhi, size, m_ctx.frameNumber, source, other, saved);
        if (!surface) return nullptr;
        auto* result = surface->target.get();
        m_resources->surfaces.push_back(std::move(surface));
        return result;
    }
    LayerFrame result(QRhiTextureRenderTarget *target) const {
        return frameFor(target->description().colorAttachmentAt(0)->texture(), m_ctx.rhi->isYUpInFramebuffer());
    }
    void retain(const std::shared_ptr<void> &lut) { m_resources->luts.push_back(lut); }
    bool draw(const LayerFrame &input, QRhiTextureRenderTarget &output, const Pass &pass, QSize logical,
              QPoint logicalOrigin, QRhiTexture *other = nullptr, const QRect *copy = nullptr, QPoint readOrigin = {}, QRhiTexture *third = nullptr, bool boundedCrop = false) {
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
                                                       m_resources->cache->sampler()),
             QRhiShaderResourceBinding::sampledTexture(2, QRhiShaderResourceBinding::FragmentStage,
                                                       other ? other : plane(1), m_resources->cache->sampler()),
             QRhiShaderResourceBinding::sampledTexture(3, QRhiShaderResourceBinding::FragmentStage, third ? third : plane(2),
                                                       m_resources->cache->sampler())});
        if (!draw->bindings->create()) {
            return false;
        }
        auto *pipeline = m_resources->cache->pipeline(rhi, output, draw->bindings.get());
        if (!pipeline) {
            return false;
        }
        Uniforms u;
        const auto matrix = rhi->clipSpaceCorrMatrix();
        std::ranges::copy(std::span{matrix.constData(), 16}, u.matrix.begin());
        u.colorMatrix = input.colorMatrix;
        const int format = input.format == LayerFrame::Format::I420   ? 1
                           : input.format == LayerFrame::Format::Nv12 ? 2
                                                                      : 0;
        u.geometry = {input.flipV ? 1.f : 0.f, float(format), float(pass.op), boundedCrop ? 1.f : 0.f};
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
        cb->setGraphicsPipeline(pipeline);
        cb->setViewport({0, 0, float(output.pixelSize().width()), float(output.pixelSize().height())});
        cb->setShaderResources(draw->bindings.get());
        const QRhiCommandBuffer::VertexInput vertices(m_resources->cache->vertices(), 0);
        cb->setVertexInput(0, 1, &vertices);
        cb->draw(3);
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
    return !planChain(ext.value("clipEffects").toArray(), ext.value("trackEffects").toArray()).empty();
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
    const auto chain = planChain(effects, ext.value("trackEffects").toArray());
    const auto crop = cropPixels(ext, input.size);
    const bool boundedCrop = ext.value("effectSourceCropped").toBool() || crop != QRect(QPoint{}, input.size);
    const auto margins = outset(ext, input.size);
    const QSize workingSize = crop.size() + QSize(margins.left() + margins.right(), margins.top() + margins.bottom());
    const QPoint pad{margins.left(), margins.top()};
    if (!m_drawCache) {
        m_drawCache = std::make_shared<DrawCache>();
    }
    Encoder encoder(ctx, m_drawCache);
    if (!m_drawCache->initialize(ctx, ":/effects/clip.vert.qsb", ":/effects/clip.frag.qsb", QRhiSampler::Linear)) {
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
        auto *target = encoder.surface(workingSize, current.planes[0], other,
                                       recipeSource ? recipeSource->planes[0] : nullptr);
        if (!target || !encoder.draw(current, *target, pass, crop.size(), pad, other, nullptr, {}, nullptr, boundedCrop)) {
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
            const auto key = QCryptographicHash::hash(pass.cube.toUtf8(), QCryptographicHash::Sha256);
            auto found = std::ranges::find(m_luts, key, &decltype(m_luts)::value_type::first);
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
                QByteArray data(qsizetype(bytes.size()), Qt::Uninitialized);
                std::memcpy(data.data(), bytes.data(), bytes.size());
                QRhiTextureSubresourceUploadDescription upload(data);
                auto *updates = ctx.rhi->nextResourceUpdateBatch();
                updates->uploadTexture(lut->texture.get(), {{0, 0, upload}});
                ctx.commands->resourceUpdate(updates);
                constexpr size_t capacity = 8;
                if (m_luts.size() == capacity) {
                    ctx.retire->retire(std::move(m_luts.back().second), ctx.frameNumber);
                    m_luts.pop_back();
                }
                m_luts.emplace_front(key, std::move(lut));
                found = m_luts.begin();
            }
            m_luts.splice(m_luts.begin(), m_luts, found);
            const auto &lut = m_luts.front().second;
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
namespace {
bool initializeMaskCache(const EffectContext &ctx, std::shared_ptr<DrawCache> &cache) {
    if (!cache) {
        cache = std::make_shared<DrawCache>();
    }
    return cache->initialize(ctx, ":/effects/clip.vert.qsb", ":/effects/clip.frag.qsb", QRhiSampler::Linear);
}
bool alphaBridge(Encoder &encoder, LayerFrame &current, QSize size, Op op, QRhiTexture *keep = nullptr) {
    auto *target = encoder.surface(size, current.planes[0], keep);
    Pass pass;
    pass.op = op;
    if (!target || !encoder.draw(current, *target, pass, size, {})) {
        return false;
    }
    current = encoder.result(target);
    return true;
}
} // namespace
bool GeneratedMatteSourceStage::applies(const QJsonObject &ext) const {
    return ext.value("generatedMatteSource").toBool();
}
bool GeneratedMatteSourceStage::render(const EffectContext &ctx, const LayerFrame &, QRhiTextureRenderTarget &output,
                                       const QJsonObject &) {
    if (!ctx.sources || !ctx.sources->contains("j-generated-matte") || !initializeMaskCache(ctx, m_cache)) {
        return false;
    }
    Encoder encoder(ctx, m_cache);
    const auto &source = ctx.sources->at("j-generated-matte");
    const QRect destination(QPoint{}, output.pixelSize());
    // Generated videos have the picture's dimensions and source clock.
    return encoder.draw(source, output, {}, source.size, {}, nullptr, &destination);
}
bool ShapeMaskStage::applies(const QJsonObject &ext) const {
    return ext.value("shapeMask").isObject() && !ext.value("effectGroupSurface").toBool();
}
bool ShapeMaskStage::render(const EffectContext &ctx, const LayerFrame &input, QRhiTextureRenderTarget &output,
                            const QJsonObject &ext) {
    if (!initializeMaskCache(ctx, m_cache)) {
        return false;
    }
    Encoder encoder(ctx, m_cache);
    const auto margin = chainOutset(ext.value("clipEffects").toArray());
    const auto original = input.size - QSize(margin.left() + margin.right(), margin.top() + margin.bottom());
    const auto crop = cropPixels(ext, original);
    const auto image = m_rasterizer.rasterize(ext.value("shapeMask").toObject(), original);
    if (image.isNull()) {
        const QRect destination(QPoint{}, input.size);
        return encoder.draw(input, output, {}, input.size, {}, nullptr, &destination);
    }
    auto hit = std::ranges::find(m_textures, image.cacheKey(), &decltype(m_textures)::value_type::first);
    if (hit == m_textures.end()) {
        auto texture = std::shared_ptr<QRhiTexture>(ctx.rhi->newTexture(QRhiTexture::RGBA8, image.size()));
        if (!texture->create()) {
            return false;
        }
        auto *updates = ctx.rhi->nextResourceUpdateBatch();
        updates->uploadTexture(texture.get(), image);
        ctx.commands->resourceUpdate(updates);
        if (m_textures.size() == 32) {
            ctx.retire->retire(std::move(m_textures.front().second), ctx.frameNumber);
            m_textures.pop_front();
        }
        m_textures.emplace_back(image.cacheKey(), std::move(texture));
        hit = std::prev(m_textures.end());
    }
    encoder.retain(hit->second);
    const QSize work = crop.size() + QSize(margin.left() + margin.right(), margin.top() + margin.bottom());
    const QRect window(crop.topLeft(), work);
    auto *extracted = encoder.surface(work);
    const QRect destination(QPoint{}, work);
    if (!extracted || !encoder.draw(input, *extracted, {}, work, {}, nullptr, &destination, crop.topLeft())) {
        return false;
    }
    auto current = encoder.result(extracted);
    auto *masked = encoder.surface(work, current.planes[0]);
    Pass pass;
    pass.op = Op::MaskApply;
    pass.params[4] = static_cast<float>(work.width()) / crop.width();
    pass.params[5] = static_cast<float>(work.height()) / crop.height();
    pass.params[6] = -static_cast<float>(margin.left()) / crop.width();
    pass.params[7] = -static_cast<float>(margin.top()) / crop.height();
    if (!masked || !encoder.draw(current, *masked, pass, work, {}, hit->second.get())) {
        return false;
    }
    current = encoder.result(masked);
    if (!alphaBridge(encoder, current, work, Op::ToStraight) || !alphaBridge(encoder, current, work, Op::ToPremul)) {
        return false;
    }
    return encoder.draw(current, output, {}, work, {}, nullptr, &window);
}
bool ImageMatteStage::render(const EffectContext &ctx, const LayerFrame &layer, const LayerFrame &matte,
                             QRhiTextureRenderTarget &output, const LayerMatte &info, const QJsonObject &) {
    if (!initializeMaskCache(ctx, m_cache) || !layer.planes[0] || !matte.planes[0] || layer.size != matte.size) {
        return false;
    }
    Encoder encoder(ctx, m_cache);
    auto current = matte;
    // composeToTexture resolves its accumulation to straight, then deriveMask
    // bridges back. Luma adds a second premultiply to weight by coverage.
    if (!alphaBridge(encoder, current, matte.size, Op::ToStraight) ||
        !alphaBridge(encoder, current, matte.size, Op::ToPremul)) {
        return false;
    }
    if (info.mode == "luma" && !alphaBridge(encoder, current, matte.size, Op::ToPremul)) {
        return false;
    }
    Pass derived;
    derived.op = Op::MaskDerive;
    derived.params = {info.mode == "luma" ? 1.f : 0.f, info.invert ? 1.f : 0.f};
    auto *coverage = encoder.surface(matte.size, current.planes[0]);
    if (!coverage || !encoder.draw(current, *coverage, derived, matte.size, {})) {
        return false;
    }
    current = encoder.result(coverage);
    const auto feather = info.featherPx.value_or(0);
    if (feather > 0) {
        const auto chain = planChain(QJsonArray{QJsonObject{{"type", "blur"}, {"enabled", true}, {"radius", feather}}});
        for (const auto &pass : chain) {
            auto *target = encoder.surface(matte.size, current.planes[0]);
            if (!target || !encoder.draw(current, *target, pass, matte.size, {})) {
                return false;
            }
            current = encoder.result(target);
        }
    }
    const auto mask = current;
    current = layer;
    if (!alphaBridge(encoder, current, layer.size, Op::ToStraight, mask.planes[0]) ||
        !alphaBridge(encoder, current, layer.size, Op::ToPremul, mask.planes[0])) {
        return false;
    }
    auto *masked = encoder.surface(layer.size, current.planes[0], mask.planes[0]);
    Pass apply;
    apply.op = Op::MaskApply;
    apply.params[0] = mask.flipV ? 1.f : 0.f;
    if (!masked || !encoder.draw(current, *masked, apply, layer.size, {}, mask.planes[0])) {
        return false;
    }
    current = encoder.result(masked);
    if (!alphaBridge(encoder, current, layer.size, Op::ToStraight, mask.planes[0]) ||
        !alphaBridge(encoder, current, layer.size, Op::ToPremul, mask.planes[0])) {
        return false;
    }
    Pass strength;
    strength.op = Op::ScaleOpacity;
    strength.params[0] = float(std::clamp(info.strength.value_or(1.), 0., 1.));
    return encoder.draw(current, output, strength, layer.size, {});
}
bool AdjustmentTreatment::applies(const QJsonObject &ext) const {
    return ext.value("adjustmentTreatment").toBool();
}
bool AdjustmentTreatment::render(const EffectContext &ctx, const LayerFrame &input, QRhiTextureRenderTarget &output,
                                  const SceneAdjustment &adjustment) {
    if (!ctx.rhi || !ctx.commands || !ctx.retire || !input.planes[0] || input.size.isEmpty() ||
        input.format != LayerFrame::Format::Rgba8Premultiplied || output.pixelSize() != input.size ||
        !initializeMaskCache(ctx, m_cache)) {
        return false;
    }
    Encoder encoder(ctx, m_cache);
    auto ext = adjustment.ext;
    // The accumulation already uses the chain's premultiplied convention.
    ext.insert("effectGroupSurface", true);
    ext.remove("effectSourceRect");
    ext.remove("trackEffects");
    const auto margin = m_chain.outset(ext, input.size);
    auto *treatedTarget = encoder.surface(input.size + QSize(margin.left() + margin.right(), margin.top() + margin.bottom()));
    if (!treatedTarget || !m_chain.render(ctx, input, *treatedTarget, ext)) { return false; }
    auto treated = encoder.result(treatedTarget);
    if (!margin.isNull()) {
        auto *cropped = encoder.surface(input.size, treated.planes[0]);
        const QRect destination(QPoint{}, input.size);
        if (!cropped || !encoder.draw(treated, *cropped, {}, input.size, {}, nullptr, &destination,
                                     {margin.left(), margin.top()})) {
            return false;
        }
        treated = encoder.result(cropped);
    }
    std::shared_ptr<QRhiTexture> coverage;
    const auto mask = ext.value("shapeMask").toObject();
    if (!mask.isEmpty()) {
        const auto image = m_rasterizer.rasterize(mask, input.size);
        if (!image.isNull()) {
            coverage.reset(ctx.rhi->newTexture(QRhiTexture::RGBA8, image.size()));
            if (!coverage->create()) { return false; }
            auto *updates = ctx.rhi->nextResourceUpdateBatch();
            updates->uploadTexture(coverage.get(), image);
            ctx.commands->resourceUpdate(updates);
            encoder.retain(coverage);
        }
    }
    Pass mix;
    mix.op = Op::MixTreatment;
    mix.params[0] = float(adjustment.opacity);
    mix.params[1] = coverage ? 1.f : 0.f;
    if (adjustment.wipe) {
        const auto &wipe = *adjustment.wipe;
        mix.params[2] = wipe.direction == "right" ? 2 : wipe.direction == "up" ? 3 : wipe.direction == "down" ? 4 : 1;
        mix.params[3] = float(wipe.progress);
        mix.params[4] = float(wipe.softness);
    }
    mix.params[5] = treated.flipV ? 1.f : 0.f;
    return encoder.draw(input, output, mix, input.size, {}, treated.planes[0], nullptr, {}, coverage.get());
}
} // namespace nt::effects
