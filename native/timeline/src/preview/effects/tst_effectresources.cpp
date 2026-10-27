#include "preview/effects/ClipEffects.h"
#include "preview/effects/DrawCache.h"
#include "preview/RetireQueue.h"
#include <QCryptographicHash>
#include <QtTest>
#include <rhi/qrhi_platform.h>
#include <algorithm>

namespace nt::effects {
namespace {
struct Target {
    std::unique_ptr<QRhiTexture> texture;
    std::unique_ptr<QRhiRenderPassDescriptor> descriptor;
    std::unique_ptr<QRhiTextureRenderTarget> target;
    bool create(QRhi *rhi, QSize size, QRhiTexture::Format format = QRhiTexture::RGBA8) {
        texture.reset(rhi->newTexture(format, size, 1, QRhiTexture::RenderTarget));
        if (!texture->create()) { return false; }
        target.reset(rhi->newTextureRenderTarget({QRhiColorAttachment(texture.get())}));
        descriptor.reset(target->newCompatibleRenderPassDescriptor());
        target->setRenderPassDescriptor(descriptor.get());
        return target->create();
    }
};
QString cube(int index) {
    QString text = "LUT_3D_SIZE 2\n";
    for (int b = 0; b < 2; ++b) {
        for (int g = 0; g < 2; ++g) {
            for (int r = 0; r < 2; ++r) {
                text += QString("%1 %2 %3\n").arg(r * (index + 1) / 10.0).arg(g).arg(b);
            }
        }
    }
    return text;
}
QByteArray key(int index) { return QCryptographicHash::hash(cube(index).toUtf8(), QCryptographicHash::Sha256); }
} // namespace
class TestEffectResources : public QObject {
    Q_OBJECT
  private slots:
    void compatiblePipelinesAndRetirement() {
        QRhiNullInitParams init;
        auto rhi = std::unique_ptr<QRhi>(QRhi::create(QRhi::Null, &init));
        QVERIFY(rhi);
        Target a, b, c;
        QVERIFY(a.create(rhi.get(), {32, 16}));
        QVERIFY(b.create(rhi.get(), {64, 32}));
        QVERIFY(c.create(rhi.get(), {32, 16}, QRhiTexture::RGBA16F));
        RetireQueue retire;
        QRhiCommandBuffer *commands = nullptr;
        QCOMPARE(rhi->beginOffscreenFrame(&commands), QRhi::FrameOpSuccess);
        const EffectContext ctx{rhi.get(), commands, 7, &retire};
        auto cache = std::make_shared<DrawCache>();
        QVERIFY(cache->initialize(ctx, ":/effects/clip.vert.qsb", ":/effects/clip.frag.qsb", QRhiSampler::Linear));
        auto *vertices = cache->vertices();
        auto *sampler = cache->sampler();
        // Cached initialization must not reload shaders or replace resources.
        QVERIFY(cache->initialize(ctx, ":/missing.vert", ":/missing.frag", QRhiSampler::Nearest));
        QCOMPARE(cache->vertices(), vertices);
        QCOMPARE(cache->sampler(), sampler);
        auto uniforms = std::unique_ptr<QRhiBuffer>(rhi->newBuffer(QRhiBuffer::Dynamic, QRhiBuffer::UniformBuffer, 256));
        QVERIFY(uniforms->create());
        auto bindings = std::unique_ptr<QRhiShaderResourceBindings>(rhi->newShaderResourceBindings());
        bindings->setBindings({QRhiShaderResourceBinding::uniformBuffer(
                                  0, QRhiShaderResourceBinding::VertexStage | QRhiShaderResourceBinding::FragmentStage,
                                  uniforms.get()),
                              QRhiShaderResourceBinding::sampledTexture(1, QRhiShaderResourceBinding::FragmentStage,
                                                                        a.texture.get(), sampler),
                              QRhiShaderResourceBinding::sampledTexture(2, QRhiShaderResourceBinding::FragmentStage,
                                                                        a.texture.get(), sampler),
                              QRhiShaderResourceBinding::sampledTexture(3, QRhiShaderResourceBinding::FragmentStage,
                                                                        a.texture.get(), sampler)});
        QVERIFY(bindings->create());
        auto *first = cache->pipeline(rhi.get(), *a.target, bindings.get());
        QVERIFY(first);
        QCOMPARE(cache->pipeline(rhi.get(), *b.target, bindings.get()), first);
        auto *different = cache->pipeline(rhi.get(), *c.target, bindings.get());
        QVERIFY(different);
        QCOMPARE(different == first, c.descriptor->isCompatible(a.descriptor.get()));
        QCOMPARE(cache->pipeline(rhi.get(), *a.target, bindings.get()), first);
        QCOMPARE(rhi->endOffscreenFrame(), QRhi::FrameOpSuccess);
        const std::weak_ptr<DrawCache> lifetime = cache;
        retire.retire(std::move(cache), 7);
        retire.collect(8, 2);
        QVERIFY(!lifetime.expired());
        retire.collect(9, 2);
        QVERIFY(lifetime.expired());
    }
    void boundedLutsAndRetirement() {
        QRhiNullInitParams init;
        auto rhi = std::unique_ptr<QRhi>(QRhi::create(QRhi::Null, &init));
        QVERIFY(rhi);
        Target source, output;
        QVERIFY(source.create(rhi.get(), {32, 16}));
        QVERIFY(output.create(rhi.get(), {32, 16}));
        RetireQueue retire;
        QRhiCommandBuffer *commands = nullptr;
        QCOMPARE(rhi->beginOffscreenFrame(&commands), QRhi::FrameOpSuccess);
        const EffectContext ctx{rhi.get(), commands, 1, &retire};
        LayerFrame input;
        input.format = LayerFrame::Format::Rgba8Premultiplied;
        input.size = {32, 16};
        input.planes[0] = source.texture.get();
        auto stage = std::make_unique<ClipEffectStage>();
        const auto draw = [&](int index) {
            const QJsonObject effect{{"type", "lut"}, {"enabled", true}, {"cube", cube(index)}, {"intensity", 1}};
            return stage->render(ctx, input, *output.target, {{"clipEffects", QJsonArray{effect}}});
        };
        for (int i = 0; i < 8; ++i) { QVERIFY(draw(i)); }
        QCOMPARE(stage->m_luts.size(), size_t{8});
        const std::weak_ptr<void> oldest = stage->m_luts.back().second;
        QVERIFY(draw(0));
        QCOMPARE(stage->m_luts.front().first, key(0));
        QVERIFY(oldest.lock() == stage->m_luts.front().second);
        const std::weak_ptr<void> evicted = stage->m_luts.back().second;
        QCOMPARE(stage->m_luts.back().first, key(1));
        QVERIFY(draw(8));
        QCOMPARE(stage->m_luts.size(), size_t{8});
        QVERIFY(std::ranges::none_of(stage->m_luts, [](const auto &entry) { return entry.first == key(1); }));
        QVERIFY(!evicted.expired());
        const auto queued = retire.size();
        const QJsonObject badLut{{"type", "lut"}, {"enabled", true}, {"cube", "invalid"}};
        QTest::ignoreMessage(QtWarningMsg, "Invalid .cube in clip effect");
        QVERIFY(!stage->render(ctx, input, *output.target, {{"clipEffects", QJsonArray{badLut}}}));
        QCOMPARE(retire.size(), queued + 1);
        QCOMPARE(stage->m_luts.size(), size_t{8});
        const std::weak_ptr<DrawCache> cache = stage->m_drawCache;
        QCOMPARE(rhi->endOffscreenFrame(), QRhi::FrameOpSuccess);
        stage.reset();
        retire.collect(2, 2);
        QVERIFY(!cache.expired());
        QVERIFY(!evicted.expired());
        retire.collect(3, 2);
        QVERIFY(cache.expired());
        QVERIFY(evicted.expired());
        QVERIFY(oldest.expired());
    }
};
} // namespace nt::effects
QTEST_GUILESS_MAIN(nt::effects::TestEffectResources)
#include "tst_effectresources.moc"
