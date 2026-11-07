#include "preview/effects/ClipEffects.h"
#include "preview/RetireQueue.h"
#include "preview/effects/BlendModes.h"
#include "preview/effects/DrawCache.h"
#include "motion/capacity/ScratchPool.h"
#include <QGuiApplication>
#include <QFile>
#include <QJsonDocument>
#include <set>
#include <cmath>
#include <QtGui/qtguiglobal.h>
#if !defined(Q_OS_WIN) && !defined(Q_OS_MACOS)
#include <QVulkanInstance>
#include <QOffscreenSurface>
#endif
#include <QtTest>
#include <qfloat16.h>
#include <rhi/qrhi_platform.h>
#include <cstring>

namespace nt::effects {
namespace {
// The renderer's backend on each platform, so the numbers qualify Metal and D3D too.
struct PlatformRhi {
#if defined(Q_OS_WIN)
    bool create() {
        QRhiD3D11InitParams init;
        const auto flags = qEnvironmentVariableIntValue("QSG_RHI_PREFER_SOFTWARE_RENDERER")
            ? QRhi::Flags(QRhi::PreferSoftwareRenderer) : QRhi::Flags{};
        rhi.reset(QRhi::create(QRhi::D3D11, &init, flags));
        return rhi != nullptr;
    }
#elif defined(Q_OS_MACOS)
    bool create() {
        QRhiMetalInitParams init;
        rhi.reset(QRhi::create(QRhi::Metal, &init));
        return rhi != nullptr;
    }
#else
    QVulkanInstance instance;
    std::unique_ptr<QOffscreenSurface> surface;
    bool create() {
        if (qEnvironmentVariable("QSG_RHI_BACKEND") == u"opengl") {
            surface.reset(QRhiGles2InitParams::newFallbackSurface());
            QRhiGles2InitParams init;
            init.fallbackSurface = surface.get();
            rhi.reset(QRhi::create(QRhi::OpenGLES2, &init));
            return rhi != nullptr;
        }
        instance.setApiVersion(QVersionNumber(1, 1));
        instance.setExtensions(QRhiVulkanInitParams::preferredInstanceExtensions());
        if (!instance.create()) { return false; }
        QRhiVulkanInitParams init;
        init.inst = &instance;
        rhi.reset(QRhi::create(QRhi::Vulkan, &init));
        return rhi != nullptr;
    }
#endif
    std::unique_ptr<QRhi> rhi;
};
}
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
    void sharedInverseLevels() {
        QFile file(QString::fromUtf8(NT_PRECISION_VECTORS));
        QVERIFY(file.open(QIODevice::ReadOnly));
        QJsonParseError error;
        const auto vectors = QJsonDocument::fromJson(file.readAll(), &error).object();
        QCOMPARE(error.error, QJsonParseError::NoError);
        const auto inputs = vectors.value("inputCodes").toArray();
        const auto reference = vectors.value("referenceCodes").toArray();
        const auto gammas = vectors.value("gammas").toArray();
        QCOMPARE(inputs.size(), 256);
        QCOMPARE(reference.size(), inputs.size());
        QCOMPARE(gammas.size(), 2);
        QByteArray pixels(inputs.size() * 4, char(vectors.value("alphaCode").toInt()));
        QJsonArray effects;
        for (const auto gamma : gammas) {
            effects.append(QJsonObject{{"type", "levels"}, {"enabled", true}, {"gamma", gamma}});
        }
        for (qsizetype x = 0; x < inputs.size(); ++x) {
            for (int c = 0; c < 3; ++c) { pixels[x * 4 + c] = char(inputs[x].toInt()); }
        }
        PlatformRhi platform;
        QVERIFY(platform.create());
        auto& rhi = platform.rhi;
        qInfo() << "precision backend" << rhi->backendName() << rhi->driverInfo().deviceName;
        for (const auto format : {WorkingFormat::Rgba8, WorkingFormat::Rgba16F}) {
            RetireQueue retire;
            ClipEffectStage stage;
            const QSize size(inputs.size(), 1);
            auto output = std::unique_ptr<QRhiTexture>(rhi->newTexture(
                format == WorkingFormat::Rgba16F ? QRhiTexture::RGBA16F : QRhiTexture::RGBA8,
                size, 1, QRhiTexture::RenderTarget | QRhiTexture::UsedAsTransferSource));
            QVERIFY(output->create());
            auto target = std::unique_ptr<QRhiTextureRenderTarget>(rhi->newTextureRenderTarget({output.get()}));
            auto descriptor = std::unique_ptr<QRhiRenderPassDescriptor>(target->newCompatibleRenderPassDescriptor());
            target->setRenderPassDescriptor(descriptor.get());
            QVERIFY(target->create());
            auto input = std::unique_ptr<QRhiTexture>(rhi->newTexture(QRhiTexture::RGBA8, size, 1));
            QVERIFY(input->create());
            QRhiCommandBuffer* cb = nullptr;
            QCOMPARE(rhi->beginOffscreenFrame(&cb), QRhi::FrameOpSuccess);
            auto* upload = rhi->nextResourceUpdateBatch();
            upload->uploadTexture(input.get(), QRhiTextureUploadDescription{{{0, 0,
                QRhiTextureSubresourceUploadDescription(pixels.constData(), pixels.size())}}});
            cb->resourceUpdate(upload);
            LayerFrame frame;
            frame.format = LayerFrame::Format::Rgba8Premultiplied;
            frame.transfer = "iec61966-2-1";
            frame.size = size; frame.planes[0] = input.get();
            EffectContext ctx{rhi.get(), cb, 1, &retire, nullptr, format};
            QVERIFY(stage.render(ctx, frame, *target, {{"clipEffects", effects}}));
            QRhiReadbackResult result;
            bool completed = false;
            result.completed = [&] { completed = true; };
            auto* read = rhi->nextResourceUpdateBatch();
            read->readBackTexture({output.get()}, &result);
            cb->resourceUpdate(read);
            QCOMPARE(rhi->endOffscreenFrame(), QRhi::FrameOpSuccess);
            rhi->finish();
            QVERIFY(completed);
            QCOMPARE(result.data.size(), pixels.size() * (format == WorkingFormat::Rgba16F ? 2 : 1));
            std::set<int> distinct;
            int maximumCodeError = 0, previous = -1;
            float maximumWorkingError = 0;
            for (int x = 0; x < inputs.size(); ++x) {
                for (int c = 0; c < 4; ++c) {
                    const int i = x * 4 + c;
                    float actual;
                    if (format == WorkingFormat::Rgba16F) {
                        qfloat16 value;
                        std::memcpy(&value, result.data.constData() + i * 2, 2);
                        actual = float(value);
                    } else { actual = static_cast<unsigned char>(result.data[i]) / 255.f; }
                    QVERIFY(std::isfinite(actual));
                    if (c == 3) { QCOMPARE(actual, 1.f); continue; }
                    const int code = int(std::floor(std::clamp(actual, 0.f, 1.f) * 255.f + 0.5f));
                    maximumCodeError = std::max(maximumCodeError, std::abs(code - reference[x].toInt()));
                    maximumWorkingError = std::max(maximumWorkingError, std::abs(actual * 255.f - reference[x].toInt()));
                    if (c == 0) {
                        distinct.insert(code);
                        QVERIFY(code >= previous);
                        previous = code;
                    }
                }
            }
            qInfo() << "shared inverse Levels" << int(format) << "distinct" << distinct.size()
                    << "maximum code error" << maximumCodeError << "working error in codes" << maximumWorkingError;
            if (format == WorkingFormat::Rgba16F) {
                const auto bounds = vectors.value("fp16Requirements").toObject();
                QCOMPARE(distinct.size(), size_t(bounds.value("distinct").toInt()));
                QVERIFY(maximumCodeError <= bounds.value("maximumCodeError").toInt());
            } else {
                QVERIFY(distinct.size() < size_t(inputs.size()));
                QVERIFY(maximumCodeError > 0);
            }
            retire.clear();
        }
    }
    void floatFiltering() {
        PlatformRhi platform;
        QVERIFY(platform.create());
        auto& rhi = platform.rhi;
        qInfo() << "filter backend" << rhi->backendName() << rhi->driverInfo().deviceName;
        QVERIFY(rhi->isTextureFormatSupported(QRhiTexture::RGBA16F));
        auto input = std::unique_ptr<QRhiTexture>(rhi->newTexture(QRhiTexture::RGBA16F, {2, 2}, 1));
        auto output = std::unique_ptr<QRhiTexture>(rhi->newTexture(QRhiTexture::RGBA16F, {1, 1}, 1,
            QRhiTexture::RenderTarget | QRhiTexture::UsedAsTransferSource));
        QVERIFY(input->create());
        QVERIFY(output->create());
        auto target = std::unique_ptr<QRhiTextureRenderTarget>(rhi->newTextureRenderTarget({output.get()}));
        auto pass = std::unique_ptr<QRhiRenderPassDescriptor>(target->newCompatibleRenderPassDescriptor());
        target->setRenderPassDescriptor(pass.get());
        QVERIFY(target->create());
        RetireQueue retire;
        DrawCache cache;
        struct FilterUniforms {
            std::array<float, 16> matrix{}, colorMatrix{};
            std::array<float, 4> geometry{0, 4, 0, 0}, sourceRect{0, 0, 2, 2},
                dimensions{2, 2, 2, 2}, origin{0, 0, 2, 2};
            std::array<float, 16> params{};
        } uniforms;
        static_assert(sizeof(FilterUniforms) == 256);
        std::copy_n(rhi->clipSpaceCorrMatrix().constData(), 16, uniforms.matrix.begin());
        auto buffer = std::unique_ptr<QRhiBuffer>(rhi->newBuffer(QRhiBuffer::Dynamic,
            QRhiBuffer::UniformBuffer, sizeof(uniforms)));
        QVERIFY(buffer->create());
        auto bindings = std::unique_ptr<QRhiShaderResourceBindings>(rhi->newShaderResourceBindings());
        for (const float alpha : {1.f, 0.001f}) {
            std::array<qfloat16, 16> pixels;
            float expected = 0;
            for (int i = 0; i < 4; ++i) {
                const auto value = qfloat16((i + 1) * 0.2f * alpha);
                expected += float(value) / 4;
                for (int c = 0; c < 3; ++c) { pixels[i * 4 + c] = value; }
                pixels[i * 4 + 3] = qfloat16(alpha);
            }
            QRhiCommandBuffer* cb = nullptr;
            QCOMPARE(rhi->beginOffscreenFrame(&cb), QRhi::FrameOpSuccess);
            auto* upload = rhi->nextResourceUpdateBatch();
            upload->uploadTexture(input.get(), QRhiTextureUploadDescription{{{0, 0,
                QRhiTextureSubresourceUploadDescription(pixels.data(), int(sizeof(pixels)))}}});
            cb->resourceUpdate(upload);
            EffectContext ctx{rhi.get(), cb, 1, &retire, nullptr, WorkingFormat::Rgba16F};
            // Isolate linear sampling with the production copy shader and draw cache.
            QVERIFY(cache.initialize(ctx, ":/effects/clip.vert.qsb", ":/effects/clip.frag.qsb", QRhiSampler::Linear));
            bindings->setBindings({
                QRhiShaderResourceBinding::uniformBuffer(0, QRhiShaderResourceBinding::VertexStage |
                    QRhiShaderResourceBinding::FragmentStage, buffer.get()),
                QRhiShaderResourceBinding::sampledTexture(1, QRhiShaderResourceBinding::FragmentStage, input.get(), cache.sampler()),
                QRhiShaderResourceBinding::sampledTexture(2, QRhiShaderResourceBinding::FragmentStage, input.get(), cache.sampler()),
                QRhiShaderResourceBinding::sampledTexture(3, QRhiShaderResourceBinding::FragmentStage, input.get(), cache.sampler())});
            QVERIFY(bindings->create());
            auto* pipeline = cache.pipeline(rhi.get(), *target, bindings.get());
            QVERIFY(pipeline);
            auto* update = rhi->nextResourceUpdateBatch();
            update->updateDynamicBuffer(buffer.get(), 0, sizeof(uniforms), &uniforms);
            cb->beginPass(target.get(), Qt::transparent, {1, 0}, update);
            cb->setGraphicsPipeline(pipeline);
            cb->setViewport({0, 0, 1, 1});
            cb->setShaderResources(bindings.get());
            const QRhiCommandBuffer::VertexInput vertices(cache.vertices(), 0);
            cb->setVertexInput(0, 1, &vertices);
            cb->draw(3);
            cb->endPass();
            QRhiReadbackResult readback;
            bool completed = false;
            readback.completed = [&] { completed = true; };
            auto* read = rhi->nextResourceUpdateBatch();
            read->readBackTexture({output.get()}, &readback);
            cb->resourceUpdate(read);
            QCOMPARE(rhi->endOffscreenFrame(), QRhi::FrameOpSuccess);
            rhi->finish();
            QVERIFY(completed);
            QCOMPARE(readback.data.size(), 8);
            std::array<qfloat16, 4> actual;
            std::memcpy(actual.data(), readback.data.constData(), 8);
            for (int c = 0; c < 4; ++c) {
                const float reference = c == 3 ? float(qfloat16(alpha)) : expected;
                QVERIFY(std::abs(float(actual[c]) - reference) < alpha * 0.002f);
            }
            retire.clear();
        }
    }
    void inverseLevelsAndAlpha() {
        PlatformRhi platform;
        QVERIFY(platform.create());
        auto& rhi = platform.rhi;
        qInfo() << "precision backend" << rhi->backendName() << rhi->driverInfo().deviceName;
        qInfo() << rhi->driverInfo().deviceName;
        // Complementary low-alpha compression vectors. Shared gamma vectors run separately.
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
                    // Four half-float steps at this alpha (2^-11 below 1). Backends round differently:
                    // lavapipe measured two steps at alpha 1 and Metal three. RGBA8 misses this by ten times.
                    QVERIFY2(maxError < std::max(0.000002f, alpha * 4.f / 2048.f), "inverse Levels must preserve low alpha and RGB");
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
