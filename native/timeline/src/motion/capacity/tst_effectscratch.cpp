#include "motion/capacity/ScratchPool.h"
#include "preview/effects/ClipEffects.h"
#include "preview/effects/DrawCache.h"
#include "preview/RetireQueue.h"
#include <QtTest>
#include <rhi/qrhi_platform.h>

namespace nt::effects {
namespace {
struct Target {
    std::unique_ptr<QRhiTexture> texture;
    std::unique_ptr<QRhiRenderPassDescriptor> descriptor;
    std::unique_ptr<QRhiTextureRenderTarget> target;
    bool create(QRhi* rhi, QSize size) {
        texture.reset(rhi->newTexture(QRhiTexture::RGBA8, size, 1, QRhiTexture::RenderTarget));
        if (!texture->create()) return false;
        target.reset(rhi->newTextureRenderTarget({QRhiColorAttachment(texture.get())}));
        descriptor.reset(target->newCompatibleRenderPassDescriptor());
        target->setRenderPassDescriptor(descriptor.get());
        return target->create();
    }
};
}
class TestEffectResources : public QObject {
    Q_OBJECT
private slots:
    void recordedFailureThenSequentialReuse() {
        QRhiNullInitParams init;
        auto rhi = std::unique_ptr<QRhi>(QRhi::create(QRhi::Null, &init)); QVERIFY(rhi);
        Target source, failureOutput, output; QVERIFY(source.create(rhi.get(), {64, 32}));
        QVERIFY(failureOutput.create(rhi.get(), {64, 32}));
        ClipEffectStage stage;
        const auto color = QJsonObject{{"type", "color"}, {"enabled", true}, {"brightness", 0.1}};
        const auto invalid = QJsonObject{{"type", "lut"}, {"enabled", true}, {"cube", "invalid"}};
        const QJsonObject sizingGlow{{"type", "glow"}, {"enabled", true}, {"radius", 12}, {"intensity", 0.5}};
        const QJsonObject sizingShadow{{"type", "dropShadow"}, {"enabled", true}, {"blur", 8},
            {"offsetX", 4}, {"offsetY", 2}, {"opacity", 0.25}, {"color", "#224466"}};
        const auto margin = stage.outset({{"clipEffects", QJsonArray{color, sizingGlow, sizingShadow}}}, {64, 32});
        const QSize outputSize(64 + margin.left() + margin.right(), 32 + margin.top() + margin.bottom());
        QCOMPARE(outputSize, QSize(192, 160));
        QVERIFY(output.create(rhi.get(), outputSize));
        RetireQueue retire;
        QRhiCommandBuffer* commands = nullptr;
        QCOMPARE(rhi->beginOffscreenFrame(&commands), QRhi::FrameOpSuccess);
        const EffectContext context{rhi.get(), commands, 1, &retire};
        LayerFrame input; input.format = LayerFrame::Format::Rgba8Premultiplied;
        input.size = {64, 32}; input.planes[0] = source.texture.get();
        QTest::ignoreMessage(QtWarningMsg, "Invalid .cube in clip effect");
        QVERIFY(!stage.render(context, input, *failureOutput.target, {{"clipEffects", QJsonArray{color, invalid}}}));
        QVERIFY(!retire.empty());
        size_t afterFirst = 0;
        for (int i = 0; i < 20; ++i) {
            const QJsonObject glow{{"type", "glow"}, {"enabled", true}, {"radius", 12}, {"intensity", 0.5 + i * 0.03}};
            const QJsonObject shadow{{"type", "dropShadow"}, {"enabled", true}, {"blur", 8},
                {"offsetX", 4}, {"offsetY", 2}, {"opacity", 0.25 + i * 0.02}, {"color", "#224466"}};
            QVERIFY(stage.render(context, input, *output.target, {{"clipEffects", QJsonArray{color, glow, shadow}}}));
            if (i == 0) afterFirst = stage.m_drawCache->scratchPool()->size();
            QCOMPARE(stage.m_drawCache->scratchPool()->size(), afterFirst);
        }
        QVERIFY(afterFirst > 0 && afterFirst <= 4);
        QCOMPARE(rhi->endOffscreenFrame(), QRhi::FrameOpSuccess);
        retire.collect(2, 2); QVERIFY(!retire.empty());
        retire.collect(3, 2); QVERIFY(retire.empty());
    }
};
}
QTEST_GUILESS_MAIN(nt::effects::TestEffectResources)
#include "tst_effectscratch.moc"
