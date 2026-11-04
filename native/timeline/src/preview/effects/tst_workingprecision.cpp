#include "preview/effects/ClipEffects.h"
#include "preview/RetireQueue.h"
#include "motion/capacity/ScratchPool.h"
#include <QGuiApplication>
#include <QVulkanInstance>
#include <QtTest>
#include <qfloat16.h>
#include <rhi/qrhi_platform.h>
#include <cstring>

namespace nt::effects {
class TestWorkingPrecision : public QObject {
    Q_OBJECT
private slots:
    void inverseLevelsAndAlpha() {
        QVulkanInstance instance;
        instance.setApiVersion(QVersionNumber(1, 1));
        instance.setExtensions(QRhiVulkanInitParams::preferredInstanceExtensions());
        QVERIFY(instance.create());
        QRhiVulkanInitParams init; init.inst = &instance;
        auto rhi = std::unique_ptr<QRhi>(QRhi::create(QRhi::Vulkan, &init));
        QVERIFY(rhi);
        qInfo() << rhi->driverInfo().deviceName;
        // Native vectors pending comparison with film/color-s0's shared set.
        const std::array<float, 4> alphas{1.f, 0.5f, 0.001f, 0.f};
        for (const auto format : {WorkingFormat::Rgba8, WorkingFormat::Rgba16F}) {
            RetireQueue retire;
            ClipEffectStage stage;
            auto readTexture = std::unique_ptr<QRhiTexture>(rhi->newTexture(
                format == WorkingFormat::Rgba16F ? QRhiTexture::RGBA16F : QRhiTexture::RGBA8,
                {16, 1}, 1, QRhiTexture::RenderTarget | QRhiTexture::UsedAsTransferSource));
            QVERIFY(readTexture->create());
            auto target = std::unique_ptr<QRhiTextureRenderTarget>(rhi->newTextureRenderTarget({readTexture.get()}));
            auto descriptor = std::unique_ptr<QRhiRenderPassDescriptor>(target->newCompatibleRenderPassDescriptor());
            target->setRenderPassDescriptor(descriptor.get());
            QVERIFY(target->create());
            motion::ScratchPool intermediatePool;
            auto lease = intermediatePool.beginLease(1);
            auto intermediate = intermediatePool.acquire(lease, rhi.get(), {16, 1}, 1, nullptr, nullptr, nullptr, format);
            QVERIFY(intermediate);
            auto transparent = std::unique_ptr<QRhiTexture>(rhi->newTexture(readTexture->format(), {16, 1}, 1));
            QVERIFY(transparent->create());
            BlendModeHandler compositor;
            for (const float alpha : alphas) {
                std::array<qfloat16, 64> pixels{};
                for (int x = 0; x < 16; ++x) {
                    const float value = float(x + 1) / 17;
                    for (int c = 0; c < 3; ++c) { pixels[x * 4 + c] = qfloat16(value * alpha); }
                    pixels[x * 4 + 3] = qfloat16(alpha);
                }
                auto input = std::unique_ptr<QRhiTexture>(rhi->newTexture(QRhiTexture::RGBA16F, {16, 1}, 1));
                QVERIFY(input->create());
                QRhiCommandBuffer* cb = nullptr;
                QCOMPARE(rhi->beginOffscreenFrame(&cb), QRhi::FrameOpSuccess);
                auto* upload = rhi->nextResourceUpdateBatch();
                QRhiTextureSubresourceUploadDescription data(pixels.data(), int(sizeof(pixels)));
                upload->uploadTexture(input.get(), QRhiTextureUploadDescription{{{0, 0, data}}});
                const QByteArray zero(format == WorkingFormat::Rgba16F ? 128 : 64, '\0');
                upload->uploadTexture(transparent.get(), QRhiTextureUploadDescription{{{0, 0,
                    QRhiTextureSubresourceUploadDescription(zero.constData(), zero.size())}}});
                cb->resourceUpdate(upload);
                LayerFrame frame; frame.format = LayerFrame::Format::Rgba16FPremultiplied;
                frame.planes[0] = input.get(); frame.size = {16, 1};
                EffectContext ctx{rhi.get(), cb, 1, &retire, nullptr, format};
                QJsonArray effects{
                    QJsonObject{{"type", "levels"}, {"enabled", true}, {"outWhite", 0.1}},
                    QJsonObject{{"type", "levels"}, {"enabled", true}, {"inWhite", 0.1}}};
                QVERIFY(stage.render(ctx, frame, *intermediate->target, {{"clipEffects", effects}}));
                LayerFrame processed;
                processed.format = LayerFrame::rgbaFormat(intermediate->texture.get());
                processed.planes[0] = intermediate->texture.get(); processed.size = {16, 1};
                processed.flipV = rhi->isYUpInFramebuffer();
                auto background = processed;
                background.planes[0] = transparent.get(); background.flipV = false;
                QVERIFY(compositor.render(ctx, background, processed, *target, "screen", {}));
                QRhiReadbackResult result;
                bool completed = false;
                result.completed = [&] { completed = true; };
                auto* read = rhi->nextResourceUpdateBatch();
                read->readBackTexture({readTexture.get()}, &result);
                cb->resourceUpdate(read);
                QCOMPARE(rhi->endOffscreenFrame(), QRhi::FrameOpSuccess);
                rhi->finish();
                QVERIFY(completed);
                QCOMPARE(result.data.size(), format == WorkingFormat::Rgba16F ? 128 : 64);
                float maxError = 0;
                for (int i = 0; i < 64; ++i) {
                    float actual;
                    if (format == WorkingFormat::Rgba16F) {
                        qfloat16 value;
                        std::memcpy(&value, result.data.constData() + i * 2, 2);
                        actual = float(value);
                    } else { actual = static_cast<unsigned char>(result.data[i]) / 255.f; }
                    maxError = std::max(maxError, std::abs(actual - float(pixels[i])));
                }
                qInfo() << "format" << int(format) << "alpha" << alpha << "max error" << maxError;
                if (format == WorkingFormat::Rgba16F) {
                    QVERIFY2(maxError < std::max(0.000002f, alpha * 0.001f), "inverse Levels must preserve low alpha and RGB");
                } else if (alpha == 1.f) {
                    QVERIFY2(maxError > 0.005f, "byte control must expose intermediate quantization");
                }
                retire.clear();
            }
            intermediatePool.endLease(lease);
        }
    }
};
}
QTEST_MAIN(nt::effects::TestWorkingPrecision)
#include "tst_workingprecision.moc"
