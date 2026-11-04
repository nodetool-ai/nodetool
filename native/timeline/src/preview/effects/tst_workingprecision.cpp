#include "preview/effects/ClipEffects.h"
#include "preview/RetireQueue.h"
#include "preview/effects/BlendModes.h"
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
    void scratchFormatStress() {
        QRhiNullInitParams init;
        auto rhi = std::unique_ptr<QRhi>(QRhi::create(QRhi::Null, &init));
        QVERIFY(rhi);
        motion::ScratchPool pool(64 * 32 * 8 * 3);
        size_t peak = 0;
        for (long long frame = 1; frame <= 600; ++frame) {
            const auto format = frame % 2 ? WorkingFormat::Rgba16F : WorkingFormat::Rgba8;
            const QSize size = frame % 3 ? QSize(64, 32) : QSize(32, 16);
            const auto lease = pool.beginLease(frame);
            auto a = pool.acquire(lease, rhi.get(), size, frame, nullptr, nullptr, nullptr, format);
            QVERIFY(a);
            auto b = pool.acquire(lease, rhi.get(), size, frame, a->texture.get(), nullptr, nullptr, format);
            QVERIFY(b); QVERIFY(a != b);
            QCOMPARE(a->texture->format(), format == WorkingFormat::Rgba16F ? QRhiTexture::RGBA16F : QRhiTexture::RGBA8);
            auto reuse = pool.acquire(lease, rhi.get(), size, frame, b->texture.get(), nullptr, nullptr, format);
            QCOMPARE(reuse, a);
            peak = std::max(peak, pool.bytes());
            pool.endLease(lease);
            QVERIFY(pool.bytes() <= 64 * 32 * 8 * 3);
        }
        qInfo() << "scratch stress peak texture bytes" << peak << "slots" << pool.size();
    }
    void ancillaryFloatStages() {
        QRhiNullInitParams init;
        auto rhi = std::unique_ptr<QRhi>(QRhi::create(QRhi::Null, &init));
        QVERIFY(rhi);
        RetireQueue retire;
        motion::ScratchPool pool;
        const auto lease = pool.beginLease(1);
        const auto acquire = [&] { return pool.acquire(lease, rhi.get(), {64, 32}, 1, nullptr, nullptr, nullptr, WorkingFormat::Rgba16F); };
        auto a = acquire(); QVERIFY(a);
        auto b = pool.acquire(lease, rhi.get(), {64, 32}, 1, a->texture.get(), nullptr, nullptr, WorkingFormat::Rgba16F); QVERIFY(b);
        auto out = pool.acquire(lease, rhi.get(), {64, 32}, 1, a->texture.get(), b->texture.get(), nullptr, WorkingFormat::Rgba16F); QVERIFY(out);
        QRhiCommandBuffer* cb = nullptr;
        QCOMPARE(rhi->beginOffscreenFrame(&cb), QRhi::FrameOpSuccess);
        EffectContext ctx{rhi.get(), cb, 1, &retire, nullptr, WorkingFormat::Rgba16F};
        LayerFrame frame; frame.format = LayerFrame::rgbaFormat(a->texture.get());
        QCOMPARE(frame.format, LayerFrame::Format::Rgba16FPremultiplied);
        frame.planes[0] = a->texture.get(); frame.size = {64, 32};
        auto matte = frame; matte.planes[0] = b->texture.get();
        ShapeMaskStage shape;
        QVERIFY(shape.render(ctx, frame, *out->target, {{"shapeMask", QJsonObject{{"kind", "ellipse"}, {"featherPx", 4}}}}));
        ImageMatteStage masks;
        for (const auto mode : {"alpha", "luma"}) {
            QVERIFY(masks.render(ctx, frame, matte, *out->target, {mode, false, {}, 0.5, 9}, {}));
        }
        BlendModeHandler blends;
        for (const auto mode : blendModes) {
            QVERIFY(blends.render(ctx, frame, matte, *out->target, std::string(mode), {}));
        }
        AdjustmentTreatment treatment;
        SceneAdjustment adjustment;
        adjustment.ext = {{"adjustmentTreatment", true}, {"clipEffects", QJsonArray{QJsonObject{{"type", "blur"}, {"enabled", true}, {"radius", 4}}}}};
        QVERIFY(treatment.render(ctx, frame, *out->target, adjustment));
        QCOMPARE(rhi->endOffscreenFrame(), QRhi::FrameOpSuccess);
        pool.endLease(lease);
        retire.collect(3, 2); QVERIFY(retire.empty());
    }
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
