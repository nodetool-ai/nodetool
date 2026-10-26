#pragma once
#include "preview/layers/LayerRegistry.h"
#include "preview/RetireQueue.h"
#include <QFile>
#include <QMatrix4x4>

namespace nt::test {
class InvertStage final : public LayerEffectStage {
    struct Resources {
        std::unique_ptr<QRhiBuffer> vertices, uniforms;
        std::unique_ptr<QRhiSampler> sampler;
        std::unique_ptr<QRhiShaderResourceBindings> bindings;
        std::unique_ptr<QRhiGraphicsPipeline> pipeline;
    };
    static QShader shader(const char* name) {
        QFile file(QString::fromLatin1(name));
        if (!file.open(QIODevice::ReadOnly)) { return {}; }
        return QShader::fromSerialized(file.readAll());
    }
public:
    bool applies(const QJsonObject& ext) const override { return ext.value("invert").toBool(); }
    bool render(const EffectContext& ctx, const LayerFrame& input,
                QRhiTextureRenderTarget& output, const QJsonObject& ext) override {
        if (!ext.value("invert").toBool() || input.format != LayerFrame::Format::Rgba8Premultiplied) { return false; }
        auto resources = std::make_shared<Resources>();
        auto* rhi = ctx.rhi;
        resources->vertices.reset(rhi->newBuffer(QRhiBuffer::Immutable, QRhiBuffer::VertexBuffer, 64));
        resources->uniforms.reset(rhi->newBuffer(QRhiBuffer::Dynamic, QRhiBuffer::UniformBuffer, 80));
        resources->sampler.reset(rhi->newSampler(QRhiSampler::Nearest, QRhiSampler::Nearest, QRhiSampler::None,
                                               QRhiSampler::ClampToEdge, QRhiSampler::ClampToEdge));
        if (!resources->vertices->create() || !resources->uniforms->create() || !resources->sampler->create()) { return false; }
        resources->bindings.reset(rhi->newShaderResourceBindings());
        resources->bindings->setBindings({
            QRhiShaderResourceBinding::uniformBuffer(0, QRhiShaderResourceBinding::VertexStage | QRhiShaderResourceBinding::FragmentStage, resources->uniforms.get()),
            QRhiShaderResourceBinding::sampledTexture(1, QRhiShaderResourceBinding::FragmentStage, input.planes[0], resources->sampler.get())
        });
        if (!resources->bindings->create()) { return false; }
        resources->pipeline.reset(rhi->newGraphicsPipeline());
        resources->pipeline->setTopology(QRhiGraphicsPipeline::TriangleStrip);
        resources->pipeline->setShaderStages({{QRhiShaderStage::Vertex, shader(":/s2/invert.vert.qsb")},
                                               {QRhiShaderStage::Fragment, shader(":/s2/invert.frag.qsb")}});
        QRhiVertexInputLayout layout;
        layout.setBindings({{16}});
        layout.setAttributes({{0, 0, QRhiVertexInputAttribute::Float2, 0}, {0, 1, QRhiVertexInputAttribute::Float2, 8}});
        resources->pipeline->setVertexInputLayout(layout);
        resources->pipeline->setShaderResourceBindings(resources->bindings.get());
        resources->pipeline->setRenderPassDescriptor(output.renderPassDescriptor());
        if (!resources->pipeline->create()) { return false; }
        constexpr float quad[]{-1,-1,0,1, 1,-1,1,1, -1,1,0,0, 1,1,1,0};
        struct Uniforms { float matrix[16]; float flip; float pad[3]{}; } uniforms{};
        const auto matrix = rhi->clipSpaceCorrMatrix();
        std::copy(matrix.constData(), matrix.constData() + 16, uniforms.matrix);
        uniforms.flip = input.flipV ? 1 : 0;
        auto* updates = rhi->nextResourceUpdateBatch();
        updates->uploadStaticBuffer(resources->vertices.get(), quad);
        updates->updateDynamicBuffer(resources->uniforms.get(), 0, sizeof(uniforms), &uniforms);
        auto* cb = ctx.commands;
        cb->beginPass(&output, Qt::transparent, {1,0}, updates);
        cb->setGraphicsPipeline(resources->pipeline.get());
        cb->setViewport({0,0,float(output.pixelSize().width()),float(output.pixelSize().height())});
        cb->setShaderResources(resources->bindings.get());
        const QRhiCommandBuffer::VertexInput vertex(resources->vertices.get(), 0);
        cb->setVertexInput(0, 1, &vertex);
        cb->draw(4);
        cb->endPass();
        ctx.retire->retire(std::move(resources), ctx.frameNumber);
        return true;
    }
};
}
