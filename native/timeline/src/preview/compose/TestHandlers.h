#pragma once
#include "preview/compose/ComposeRegistry.h"
#include "preview/RetireQueue.h"
#include <QFile>
#include <array>

namespace nt::test {
// Test GPU work owns every resource until the submitting frame completes.
inline bool renderHook(const EffectContext& ctx, const LayerFrame& first, const LayerFrame& second,
                       QRhiTextureRenderTarget& output, const char* fragment, float border = 0) {
    struct Resources {
        std::unique_ptr<QRhiBuffer> vertices, uniforms;
        std::unique_ptr<QRhiSampler> sampler;
        std::unique_ptr<QRhiShaderResourceBindings> bindings;
        std::unique_ptr<QRhiGraphicsPipeline> pipeline;
    };
    const auto shader = [](const char* name) {
        QFile file(QString::fromLatin1(name));
        if (!file.open(QIODevice::ReadOnly)) { return QShader{}; }
        return QShader::fromSerialized(file.readAll());
    };
    struct Uniforms {
        std::array<float,16> matrix;
        std::array<float,4> flipsBorder;
        std::array<float,4> sizes;
    } u{};
    static_assert(sizeof(Uniforms) == 96);
    auto resources = std::make_shared<Resources>();
    auto* rhi = ctx.rhi;
    resources->vertices.reset(rhi->newBuffer(QRhiBuffer::Immutable, QRhiBuffer::VertexBuffer, 64));
    resources->uniforms.reset(rhi->newBuffer(QRhiBuffer::Dynamic, QRhiBuffer::UniformBuffer, sizeof(u)));
    resources->sampler.reset(rhi->newSampler(QRhiSampler::Nearest, QRhiSampler::Nearest, QRhiSampler::None,
                                            QRhiSampler::ClampToEdge, QRhiSampler::ClampToEdge));
    if (!resources->vertices->create() || !resources->uniforms->create() || !resources->sampler->create()) { return false; }
    resources->bindings.reset(rhi->newShaderResourceBindings());
    resources->bindings->setBindings({
        QRhiShaderResourceBinding::uniformBuffer(0, QRhiShaderResourceBinding::VertexStage | QRhiShaderResourceBinding::FragmentStage, resources->uniforms.get()),
        QRhiShaderResourceBinding::sampledTexture(1, QRhiShaderResourceBinding::FragmentStage, first.planes[0], resources->sampler.get()),
        QRhiShaderResourceBinding::sampledTexture(2, QRhiShaderResourceBinding::FragmentStage, second.planes[0], resources->sampler.get())
    });
    if (!resources->bindings->create()) { return false; }
    resources->pipeline.reset(rhi->newGraphicsPipeline());
    resources->pipeline->setTopology(QRhiGraphicsPipeline::TriangleStrip);
    resources->pipeline->setShaderStages({{QRhiShaderStage::Vertex, shader(":/s4/testhook.vert.qsb")},
                                        {QRhiShaderStage::Fragment, shader(fragment)}});
    QRhiVertexInputLayout layout;
    layout.setBindings({{16}});
    layout.setAttributes({{0,0,QRhiVertexInputAttribute::Float2,0},{0,1,QRhiVertexInputAttribute::Float2,8}});
    resources->pipeline->setVertexInputLayout(layout);
    resources->pipeline->setShaderResourceBindings(resources->bindings.get());
    resources->pipeline->setRenderPassDescriptor(output.renderPassDescriptor());
    if (!resources->pipeline->create()) { return false; }
    const auto matrix = rhi->clipSpaceCorrMatrix();
    std::copy(matrix.constData(), matrix.constData()+16, u.matrix.begin());
    u.flipsBorder = {first.flipV ? 1.f : 0.f, second.flipV ? 1.f : 0.f, border, 0};
    u.sizes = {float(first.size.width()), float(first.size.height()), float(output.pixelSize().width()), float(output.pixelSize().height())};
    constexpr std::array<float,16> quad{-1,-1,0,1, 1,-1,1,1, -1,1,0,0, 1,1,1,0};
    auto* updates = rhi->nextResourceUpdateBatch();
    updates->uploadStaticBuffer(resources->vertices.get(), quad.data());
    updates->updateDynamicBuffer(resources->uniforms.get(), 0, sizeof(u), &u);
    auto* cb = ctx.commands;
    cb->beginPass(&output, Qt::transparent, {1,0}, updates);
    cb->setGraphicsPipeline(resources->pipeline.get());
    cb->setViewport({0,0,float(output.pixelSize().width()),float(output.pixelSize().height())});
    cb->setShaderResources(resources->bindings.get());
    const QRhiCommandBuffer::VertexInput vin(resources->vertices.get(), 0);
    cb->setVertexInput(0, 1, &vin);
    cb->draw(4);
    cb->endPass();
    ctx.retire->retire(std::move(resources), ctx.frameNumber);
    return true;
}
class MultiplyHandler final : public BlendHandler {
public:
    bool render(const EffectContext& ctx, const LayerFrame& backdrop, const LayerFrame& layer,
                QRhiTextureRenderTarget& output, const std::string& mode, const QJsonObject&) override {
        return mode == "multiply" && renderHook(ctx, backdrop, layer, output, ":/s4/multiply.frag.qsb");
    }
};
class BorderStage final : public LayerEffectStage {
public:
    bool applies(const QJsonObject& ext) const override { return ext.value("border").toInt() > 0; }
    QMargins outset(const QJsonObject& ext, QSize) const override {
        const int b = ext.value("reportOutset").toBool() ? ext.value("border").toInt() : 0;
        return {b,b,b,b};
    }
    bool render(const EffectContext& ctx, const LayerFrame& input, QRhiTextureRenderTarget& output, const QJsonObject& ext) override {
        return renderHook(ctx, input, input, output, ":/s4/border.frag.qsb", float(ext.value("border").toInt()));
    }
};
class AlphaMatteStage final : public MatteStage {
public:
    bool render(const EffectContext& ctx, const LayerFrame& layer, const LayerFrame& matte,
                QRhiTextureRenderTarget& output, const LayerMatte&, const QJsonObject&) override {
        return renderHook(ctx, layer, matte, output, ":/s4/alpha.frag.qsb");
    }
};
class SecondSourceStage final : public LayerEffectStage {
public:
    bool applies(const QJsonObject& ext) const override { return ext.value("secondSource").toBool(); }
    bool render(const EffectContext& ctx, const LayerFrame& input, QRhiTextureRenderTarget& output,
                const QJsonObject&) override {
        if (ctx.sources) {
            const auto found = ctx.sources->find("luma");
            if (found != ctx.sources->end()) {
                if (found->second.format != LayerFrame::Format::Rgba8Premultiplied || found->second.size != QSize(64,32)) {
                    return false;
                }
                return renderHook(ctx, input, found->second, output, ":/s4/luma.frag.qsb");
            }
        }
        return renderHook(ctx, input, input, output, ":/s4/alpha.frag.qsb", 1);
    }
};

class SecondSourceMatteStage final : public MatteStage {
public:
    bool render(const EffectContext& ctx, const LayerFrame& layer, const LayerFrame& matte,
                QRhiTextureRenderTarget& output, const LayerMatte&, const QJsonObject&) override {
        if (!ctx.sources || !ctx.sources->contains("luma") || matte.size != layer.size ||
            matte.format != LayerFrame::Format::Rgba8Premultiplied) { return false; }
        return renderHook(ctx, layer, ctx.sources->at("luma"), output, ":/s4/luma.frag.qsb");
    }
};

}
