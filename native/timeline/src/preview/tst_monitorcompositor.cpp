#include "bench/BenchReport.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include "preview/PreviewCompositor.h"
#include "preview/hw/HwWindow.h"
#include "preview/layers/SceneHooks.h"
#include "preview/layers/LayerRegistry.h"
#include <QGuiApplication>
#include <QDir>
#include <QCryptographicHash>
#include <QJsonArray>
#include <QQuickRenderControl>
#include <QQuickRenderTarget>
#include <QQuickWindow>
#include <QScopeGuard>
#include <QtTest>
#include <rhi/qrhi.h>
#include <memory>
#include <qfloat16.h>
#include <cmath>
#include <vector>

namespace {
nt::WorkingFormat testFormat = nt::WorkingFormat::Rgba8;
class SolidSource final : public nt::LayerSource {
public:
    explicit SolidSource(QColor color) : m_color(color) {}
    QSize frameSize() const override { return {640, 360}; }
    nt::LayerFrame frameAt(const nt::FrameContext& ctx, double) override {
        if (!m_texture) {
            m_texture.reset(ctx.rhi->newTexture(QRhiTexture::RGBA8, {640, 360}));
            if (!m_texture->create()) { return {}; }
            QImage image(640, 360, QImage::Format_RGBA8888_Premultiplied);
            image.fill(m_color);
            ctx.updates->uploadTexture(m_texture.get(), image);
        }
        nt::LayerFrame frame;
        frame.format = nt::LayerFrame::Format::Rgba8Premultiplied;
        frame.planes[0] = m_texture.get();
        frame.size = {640, 360};
        return frame;
    }
private:
    QColor m_color;
    std::unique_ptr<QRhiTexture> m_texture;
};

class FloatTiles final : public nt::LayerSource {
    std::unique_ptr<QRhiTexture> m_texture;
public:
    static float value(int x, int y) {
        return float(qfloat16(((y / 32 * 20 + x / 32) % 256 + 0.37f) / 256.f));
    }
    QSize frameSize() const override { return {640, 360}; }
    nt::LayerFrame frameAt(const nt::FrameContext& ctx, double) override {
        if (!m_texture) {
            m_texture.reset(ctx.rhi->newTexture(QRhiTexture::RGBA16F, frameSize()));
            if (!m_texture->create()) { return {}; }
            std::vector<qfloat16> pixels(640 * 360 * 4);
            for (int y = 0; y < 360; ++y) {
                for (int x = 0; x < 640; ++x) {
                    const int i = (y * 640 + x) * 4;
                    for (int c = 0; c < 3; ++c) { pixels[i + c] = qfloat16(value(x, y)); }
                    pixels[i + 3] = qfloat16(1.f);
                }
            }
            ctx.updates->uploadTexture(m_texture.get(), QRhiTextureUploadDescription{{{0, 0,
                QRhiTextureSubresourceUploadDescription(pixels.data(), int(pixels.size() * sizeof(qfloat16)))}}});
        }
        nt::LayerFrame frame;
        frame.format = nt::LayerFrame::rgbaFormat(m_texture.get());
        frame.planes[0] = m_texture.get(); frame.size = frameSize();
        return frame;
    }
};

nt::Timeline picture() {
    QJsonArray clips;
    for (int i = 0; i < 2; ++i) {
        clips.append(QJsonObject{{"id", i == 0 ? "red" : "green"}, {"trackId", "v"},
            {"mediaType", "video"}, {"startMs", 0}, {"durationMs", 10000},
            {"width", 640}, {"height", 360},
            {"transform", QJsonObject{{"position", QJsonObject{{"x", i == 0 ? -160 : 160}, {"y", -90}}},
                {"scale", QJsonObject{{"x", 0.5}, {"y", 0.5}}}}}});
    }
    const auto parsed = nt::parseTimeline(QJsonObject{{"width", 640}, {"height", 360}, {"fps", 30},
        {"durationMs", 10000}, {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "video"}, {"visible", true}}}},
        {"clips", clips}});
    if (!parsed.timeline) { qFatal("invalid monitor fixture"); }
    return *parsed.timeline;
}

class Monitor {
public:
    TimelineModel model;
    PlaybackClock clock;
    QQuickRenderControl control;
    QQuickWindow window{&control};
    std::unique_ptr<QRhiTexture> texture;
    std::unique_ptr<QRhiRenderBuffer> depth;
    std::unique_ptr<QRhiRenderPassDescriptor> pass;
    std::unique_ptr<QRhiTextureRenderTarget> target;
    PreviewCompositor* item = nullptr;
    Monitor() {
        model.setTimeline(picture());
        clock.setDurationMs(10000);
        clock.setNowSource([] { return std::int64_t(0); });
        nt::hw::prepareWindow(&window);
        window.resize(320, 180);
        item = new PreviewCompositor(window.contentItem());
        item->setTimeline(&model);
        item->setWorkingFormat(testFormat);
        item->setClock(&clock);
        item->setSize({320, 180});
        item->setCollectFrameStats(true);
        if (!control.initialize()) { qFatal("no monitor QRhi"); }
        auto* rhi = control.rhi();
        texture.reset(rhi->newTexture(QRhiTexture::RGBA8, {320, 180}, 1,
            QRhiTexture::RenderTarget | QRhiTexture::UsedAsTransferSource));
        depth.reset(rhi->newRenderBuffer(QRhiRenderBuffer::DepthStencil, {320, 180}));
        if (!texture->create() || !depth->create()) { qFatal("monitor allocation failed"); }
        QRhiTextureRenderTargetDescription description{QRhiColorAttachment(texture.get())};
        description.setDepthStencilBuffer(depth.get());
        target.reset(rhi->newTextureRenderTarget(description));
        pass.reset(target->newCompatibleRenderPassDescriptor());
        target->setRenderPassDescriptor(pass.get());
        if (!target->create()) { qFatal("monitor target failed"); }
        window.setRenderTarget(QQuickRenderTarget::fromRhiRenderTarget(target.get()));
    }
    ~Monitor() {
        delete item;
        window.setRenderTarget({});
    }
    QImage capture(bool immediate = false) {
        item->requestCapture(immediate);
        for (int i = 0; i < 32 && !item->captureReady(); ++i) { frame(); }
        return item->takeCapture();
    }
    QImage frame(bool dirty = true) {
        if (dirty) { item->update(); }
        QCoreApplication::processEvents();
        control.polishItems();
        control.beginFrame();
        control.sync();
        control.render();
        QImage image;
        QRhiReadbackResult readback;
        auto* rhi = control.rhi();
        readback.completed = [&] {
            image = QImage(reinterpret_cast<const uchar*>(readback.data.constData()), 320, 180,
                QImage::Format_RGBA8888_Premultiplied).copy();
            if (rhi->isYUpInFramebuffer()) { image = image.flipped(Qt::Vertical); }
        };
        auto* updates = rhi->nextResourceUpdateBatch();
        updates->readBackTexture({texture.get()}, &readback);
        control.commandBuffer()->resourceUpdate(updates);
        control.endFrame();
        rhi->finish();
        return image;
    }
};
}

class MonitorCompositorTest : public QObject {
    Q_OBJECT
    nt::LayerSourceToken m_source = 0;
private slots:
    void initTestCase_data() {
        QTest::addColumn<bool>("fp16");
        QTest::newRow("rgba8") << false;
        QTest::newRow("fp16") << true;
    }
    void init() {
        QFETCH_GLOBAL(bool, fp16);
        testFormat = fp16 ? nt::WorkingFormat::Rgba16F : nt::WorkingFormat::Rgba8;
    }
    void defaultPresentationBaseline() {
        Monitor monitor;
        for (const int denominator : {1, 2, 4, 8}) {
            monitor.item->setPausedResolution(denominator);
            const auto frame = monitor.frame();
            QCOMPARE(monitor.frame(), frame);
            const auto bytes = QByteArrayView(reinterpret_cast<const char*>(frame.constBits()), frame.sizeInBytes());
            qInfo() << "presentation" << int(testFormat) << denominator << bytes.size()
                    << QCryptographicHash::hash(bytes, QCryptographicHash::Sha256).toHex();
            const auto directory = qEnvironmentVariable("NT_PRESENTATION_BASELINE");
            if (!directory.isEmpty() && testFormat == nt::WorkingFormat::Rgba8) {
                QVERIFY(QDir().mkpath(directory));
                QVERIFY(frame.save(directory + QStringLiteral("/frame-%1.png").arg(denominator)));
            }
        }
    }
    void initTestCase() {
        if (qEnvironmentVariable("QT_QUICK_BACKEND") == u"software") {
            QSKIP("monitor compositor needs the platform QRhi, not the software scene graph");
        }
        m_source = nt::registerLayerSource("video", [](const nt::ActiveLayer& layer) {
            return std::make_unique<SolidSource>(layer.clipId == "red" ? Qt::red : Qt::green);
        });
    }
    void cleanupTestCase() { nt::unregisterLayerSource(m_source); }
    void presentationQuantization() {
        const auto source = nt::registerLayerSource("video", [](const nt::ActiveLayer&) {
            return std::make_unique<FloatTiles>();
        });
        const auto guard = qScopeGuard([&] { nt::unregisterLayerSource(source); });
        Monitor monitor;
        auto clips = monitor.model.clipsJson();
        auto clip = clips[0].toObject(); clip.remove("transform");
        QVERIFY(monitor.model.replaceClips(QJsonArray{clip}));
        const auto image = monitor.frame();
        for (int i = 0; i < 4; ++i) { QCOMPARE(monitor.frame(), image); }
        // Each 32x32 source patch becomes 16x16 presentation pixels. Measure a
        // complete interior Bayer tile, excluding the resampled patch boundary.
        double maxError = 0, maxBias = 0;
        for (int ty = 0; ty < 11; ++ty) {
            for (int tx = 0; tx < 20; ++tx) {
                const double expected = FloatTiles::value(tx * 32, ty * 32) * 255.0;
                double sum = 0;
                for (int y = 0; y < 8; ++y) {
                    for (int x = 0; x < 8; ++x) {
                        const auto color = image.pixelColor(tx * 16 + 4 + x, ty * 16 + 4 + y);
                        QCOMPARE(color.alpha(), 255);
                        QCOMPARE(color.red(), color.green()); QCOMPARE(color.red(), color.blue());
                        const double error = color.red() - expected;
                        sum += error; maxError = std::max(maxError, std::abs(error));
                    }
                }
                maxBias = std::max(maxBias, std::abs(sum / 64));
            }
        }
        qInfo() << "presentation max code error/tile bias" << maxError << maxBias;
        QVERIFY(maxError <= 1.0);
        if (testFormat == nt::WorkingFormat::Rgba16F) { QVERIFY(maxBias < 0.1); }
        const auto working = monitor.capture();
        QCOMPARE(working.size(), QSize(640, 360));
        QCOMPARE(working.format(), testFormat == nt::WorkingFormat::Rgba16F
            ? QImage::Format_RGBA16FPx4_Premultiplied : QImage::Format_RGBA8888_Premultiplied);
        // Working capture has no spatial noise within a constant patch.
        for (int y = 0; y < 16; ++y) {
            for (int x = 0; x < 16; ++x) {
                const int bytes = working.depth() / 8;
                QCOMPARE(QByteArrayView(reinterpret_cast<const char*>(working.constScanLine(y)) + x * bytes, bytes),
                         QByteArrayView(reinterpret_cast<const char*>(working.constBits()), bytes));
            }
        }
        monitor.item->setAlphaDisplay(true);
        const auto alpha = monitor.frame();
        QCOMPARE(alpha.pixelColor(20, 20), QColor(Qt::white));
        QCOMPARE(monitor.capture(), working);
    }
    void resolution() {
        Monitor monitor;
        const auto full = monitor.frame();
        for (const int denominator : {2, 4, 8}) {
            QVERIFY(monitor.item->setProperty("pausedResolution", denominator));
            const auto reduced = monitor.frame(false);
            monitor.frame();
            QCOMPARE(monitor.item->lastCanvasSize(), QSize(640 / denominator, 360 / denominator));
            QCOMPARE(monitor.item->frameStats().back().canvasWidth, 640 / denominator);
            QCOMPARE(monitor.item->frameStats().back().canvasHeight, 360 / denominator);
            for (const QPoint p : {QPoint(80, 45), QPoint(240, 45), QPoint(80, 135)}) {
                QCOMPARE(reduced.pixelColor(p), full.pixelColor(p));
            }
        }
        for (const int invalid : {0, 3, 16, -1}) {
            monitor.item->setProperty("pausedResolution", invalid);
            QCOMPARE(monitor.item->property("pausedResolution").toInt(), 8);
        }
        QVERIFY(monitor.item->setProperty("pausedResolution", 1));
        QVERIFY(monitor.item->setProperty("playbackResolution", 2));
        monitor.clock.play();
        QCOMPARE(monitor.frame(false), full);
        monitor.frame();
        QCOMPARE(monitor.item->lastCanvasSize(), QSize(320, 180));
        for (const int denominator : {1, 2, 4, 8}) {
            monitor.item->setPlaybackResolution(denominator);
            monitor.frame(); monitor.frame();
            QCOMPARE(monitor.item->lastCanvasSize(), QSize(640 / denominator, 360 / denominator));
        }
        monitor.item->setPlaybackResolution(2);
        monitor.clock.pause();
        QCOMPARE(monitor.frame(false), full);
        monitor.frame();
        QCOMPARE(monitor.item->lastCanvasSize(), QSize(640, 360));
        for (const int invalid : {0, 3, 16, -1}) {
            monitor.item->setPlaybackResolution(invalid);
            QCOMPARE(monitor.item->playbackResolution(), 2);
        }
    }
    void groupEffectsKeepTheFullCanvas() {
        class Stage final : public nt::LayerEffectStage {
        public:
            bool applies(const QJsonObject& ext) const override { return ext.contains("monitorTestStage"); }
            bool render(const nt::EffectContext& context, const nt::LayerFrame&, QRhiTextureRenderTarget& output,
                        const QJsonObject&) override {
                context.commands->beginPass(&output, Qt::transparent, {1.0f, 0});
                context.commands->endPass();
                return true;
            }
        };
        const auto stage = nt::registerEffectStage([] { return std::make_unique<Stage>(); });
        const auto decorator = nt::registerContextGroupDecorator(
            [](nt::PrecompositeLayer& layer, const nt::Clip&, const nt::SceneDecorationContext&) {
                layer.ext.insert("monitorTestStage", true);
            });
        const auto cleanup = qScopeGuard([&] {
            nt::unregisterEffectStage(stage);
            nt::unregisterSceneHook(decorator);
        });
        const auto grouped = nt::parseTimeline(QJsonObject{{"width", 640}, {"height", 360}, {"fps", 30}, {"durationMs", 10000},
            {"tracks", QJsonArray{QJsonObject{{"id", "g0"}, {"type", "video"}, {"visible", true}},
                                  QJsonObject{{"id", "v"}, {"type", "video"}, {"visible", true}}}},
            {"clips", QJsonArray{QJsonObject{{"id", "g"}, {"trackId", "g0"}, {"mediaType", "group"}, {"startMs", 0}, {"durationMs", 10000},
                                             {"transitionIn", QJsonObject{{"type", "crossfade"}, {"durationMs", 100}}}},
                                 QJsonObject{{"id", "red"}, {"trackId", "v"}, {"parentId", "g"}, {"mediaType", "video"}, {"startMs", 0},
                                             {"durationMs", 10000}, {"width", 640}, {"height", 360}},
                                 QJsonObject{{"id", "green"}, {"trackId", "v"}, {"parentId", "g"}, {"mediaType", "video"}, {"startMs", 0},
                                             {"durationMs", 10000}, {"width", 640}, {"height", 360}}}}});
        QVERIFY(grouped.timeline);
        Monitor monitor;
        QVERIFY(monitor.item->setProperty("pausedResolution", 8));
        monitor.frame();
        monitor.frame();
        QCOMPARE(monitor.item->lastCanvasSize(), QSize(80, 45));
        monitor.model.setTimeline(*grouped.timeline);
        for (int i = 0; i < 4; ++i) { monitor.frame(); }
        QVERIFY2(monitor.item->frameStats().back().surfaces > 0, "The fixture must make a group surface");
        QCOMPARE(monitor.item->lastCanvasSize(), QSize(640, 360));
        monitor.model.setTimeline(picture());
        for (int i = 0; i < 4; ++i) { monitor.frame(); }
        QCOMPARE(monitor.item->lastCanvasSize(), QSize(80, 45));
    }
    // The group starts inside the shutter of the shown frame, so only later samples have the stage.
    void canvasDecisionHoldsAcrossAShutter() {
        class Stage final : public nt::LayerEffectStage {
        public:
            bool applies(const QJsonObject& ext) const override { return ext.contains("monitorTestStage"); }
            bool render(const nt::EffectContext& context, const nt::LayerFrame&, QRhiTextureRenderTarget& output,
                        const QJsonObject&) override {
                context.commands->beginPass(&output, Qt::transparent, {1.0f, 0});
                context.commands->endPass();
                return true;
            }
        };
        const auto stage = nt::registerEffectStage([] { return std::make_unique<Stage>(); });
        const auto decorator = nt::registerContextGroupDecorator(
            [](nt::PrecompositeLayer& layer, const nt::Clip&, const nt::SceneDecorationContext&) {
                layer.ext.insert("monitorTestStage", true);
            });
        const auto cleanup = qScopeGuard([&] {
            nt::unregisterEffectStage(stage);
            nt::unregisterSceneHook(decorator);
        });
        const QJsonObject blur{{"samplesPerFrame", 4}, {"shutterAngle", 180}};
        const auto parsed = nt::parseTimeline(QJsonObject{{"width", 640}, {"height", 360}, {"fps", 30}, {"durationMs", 10000},
            {"tracks", QJsonArray{QJsonObject{{"id", "b"}, {"type", "video"}, {"visible", true}},
                                  QJsonObject{{"id", "g0"}, {"type", "video"}, {"visible", true}},
                                  QJsonObject{{"id", "v"}, {"type", "video"}, {"visible", true}}}},
            {"clips", QJsonArray{QJsonObject{{"id", "red"}, {"trackId", "b"}, {"mediaType", "video"}, {"startMs", 0}, {"durationMs", 10000},
                                             {"width", 640}, {"height", 360}, {"motionBlur", blur}},
                                 QJsonObject{{"id", "g"}, {"trackId", "g0"}, {"mediaType", "group"}, {"startMs", 1000}, {"durationMs", 5000},
                                             {"motionBlur", blur}, {"transitionIn", QJsonObject{{"type", "crossfade"}, {"durationMs", 100}}}},
                                 QJsonObject{{"id", "green"}, {"trackId", "v"}, {"parentId", "g"}, {"mediaType", "video"}, {"startMs", 1000},
                                             {"durationMs", 5000}, {"width", 640}, {"height", 360}, {"motionBlur", blur}}}}});
        QVERIFY(parsed.timeline);
        Monitor monitor;
        monitor.model.setTimeline(*parsed.timeline);
        QVERIFY(monitor.item->setProperty("pausedResolution", 2));
        monitor.clock.seek(990);
        for (int i = 0; i < 16; ++i) { monitor.frame(); }
        const auto settled = monitor.frame();
        for (int i = 0; i < 8; ++i) {
            QCOMPARE(monitor.frame(), settled);
            QCOMPARE(monitor.item->lastCanvasSize(), QSize(640, 360));
        }
        // A later frame with no stage goes back to the reduced canvas.
        monitor.clock.seek(100);
        for (int i = 0; i < 16; ++i) { monitor.frame(); }
        QCOMPARE(monitor.item->lastCanvasSize(), QSize(320, 180));
    }
    void captureIsolation() {
        Monitor defaults;
        const auto reference = defaults.capture();
        QCOMPARE(reference.size(), QSize(640, 360));
        Monitor monitor;
        QVERIFY(monitor.item->setProperty("pausedResolution", 4));
        for (int options = 0; options < 4; ++options) {
            monitor.item->setAlphaDisplay(options & 1);
            monitor.item->setTransparencyGrid(options & 2);
            monitor.item->setCanvasRegion({0.5, 0, 0.5, 0.5});
            for (const bool immediate : {false, true}) {
                const auto captured = monitor.capture(immediate);
                QCOMPARE(captured, reference);
                QCOMPARE(QByteArrayView(reinterpret_cast<const char*>(captured.constBits()), captured.sizeInBytes()),
                         QByteArrayView(reinterpret_cast<const char*>(reference.constBits()), reference.sizeInBytes()));
                monitor.frame();
                monitor.frame();
                QCOMPARE(monitor.item->lastCanvasSize(), QSize(160, 90));
            }
        }
    }
    void alpha() {
        Monitor monitor;
        const auto before = monitor.frame();
        QVERIFY(monitor.item->setProperty("alphaDisplay", true));
        const auto alpha = monitor.frame(false);
        QCOMPARE(alpha.pixelColor(80, 45), QColor(Qt::white));
        QCOMPARE(alpha.pixelColor(240, 45), QColor(Qt::white));
        QCOMPARE(alpha.pixelColor(80, 135), QColor(Qt::black));
        QVERIFY(monitor.item->setProperty("alphaDisplay", false));
        QCOMPARE(monitor.frame(false), before);
    }
    void grid() {
        Monitor monitor;
        const auto before = monitor.frame();
        QVERIFY(monitor.item->setProperty("transparencyGrid", true));
        const auto grid = monitor.frame(false);
        QCOMPARE(grid.pixelColor(80, 45), before.pixelColor(80, 45));
        QCOMPARE(grid.pixelColor(240, 45), before.pixelColor(240, 45));
        // Picture origin is (0,0). Bottom half is empty, including this row.
        for (int x = 0; x < 32; ++x) {
            QCOMPARE(grid.pixelColor(x, 128), QColor((x / 8) % 2 == 0 ? 255 : 204,
                (x / 8) % 2 == 0 ? 255 : 204, (x / 8) % 2 == 0 ? 255 : 204));
        }
        QVERIFY(monitor.item->setProperty("canvasRegion", QRectF(0.125, 0.5, 0.5, 0.5)));
        const auto panned = monitor.frame(false);
        // Picture origin is (-80,-180), so row 4 starts on a grey cell.
        for (int x = 0; x < 32; ++x) {
            const int c = (x / 8) % 2 == 0 ? 204 : 255;
            QCOMPARE(panned.pixelColor(x, 4), QColor(c, c, c));
        }
        for (int y = 0; y < 32; ++y) {
            const int c = (y < 4 || (y >= 12 && y < 20) || y >= 28) ? 255 : 204;
            QCOMPARE(panned.pixelColor(4, y), QColor(c, c, c));
        }
        QVERIFY(monitor.item->setProperty("alphaDisplay", true));
        QCOMPARE(monitor.frame(false).pixelColor(4, 4), QColor(Qt::black));
        monitor.item->setAlphaDisplay(false);
        monitor.item->setTransparencyGrid(false);
        monitor.item->setCanvasRegion({0, 0, 1, 1});
        QCOMPARE(monitor.frame(false), before);
    }
    void defaultsAndReuse() {
        Monitor monitor;
        const auto before = monitor.frame();
        monitor.frame();
        QVERIFY(!monitor.item->m_monitorPipelineCreated);
        QCOMPARE(before.pixelColor(80, 135), QColor(0, 0, 0, 255));
        // A precomposed group makes the surface counter nonzero.
        auto clips = monitor.model.clipsJson();
        for (int i = 0; i < clips.size(); ++i) {
            auto clip = clips[i].toObject();
            clip.insert("parentId", "group");
            clips[i] = clip;
        }
        clips.append(QJsonObject{{"id", "group"}, {"trackId", "v"}, {"mediaType", "group"},
            {"startMs", 0}, {"durationMs", 10000}, {"opacity", 0.8},
            {"transitionIn", QJsonObject{{"type", "crossfade"}, {"durationMs", 1}}}});
        monitor.clock.seek(500);
        QVERIFY(monitor.model.replaceClips(clips));
        const auto groupFull = monitor.frame();
        for (const int denominator : {1, 2, 4, 8}) {
            monitor.item->setPausedResolution(denominator);
            monitor.frame(); monitor.frame();
            const auto& stat = monitor.item->frameStats().back();
            QVERIFY(stat.surfaceTargets > 0);
            QCOMPARE(stat.surfaceBytes, static_cast<long long>(stat.surfaceTargets) *
                (640 / denominator) * (360 / denominator) * (testFormat == nt::WorkingFormat::Rgba16F ? 8 : 4));
            qInfo() << "scratch allocation" << int(testFormat) << denominator << stat.surfaceBytes;
        }
        monitor.item->setPausedResolution(4);
        const auto groupReduced = monitor.frame(false);
        for (const QPoint p : {QPoint(80, 45), QPoint(240, 45), QPoint(80, 135)}) {
            QCOMPARE(groupReduced.pixelColor(p), groupFull.pixelColor(p));
        }
        for (int i = 0; i < 4; ++i) { monitor.frame(); }
        const auto created = monitor.item->frameStats().back().surfaceTargetsCreated;
        QVERIFY(created > 0);
        const auto bytes = monitor.item->frameStats().back().surfaceBytes;
        const auto targets = monitor.item->frameStats().back().surfaceTargets;
        QCOMPARE(bytes, static_cast<long long>(targets) * 160 * 90 * (testFormat == nt::WorkingFormat::Rgba16F ? 8 : 4));
        qInfo() << "actual pooled scratch targets/bytes" << targets << bytes;
        for (int i = 0; i < 60; ++i) {
            monitor.frame();
            QCOMPARE(monitor.item->lastCanvasSize(), QSize(160, 90));
            QCOMPARE(monitor.item->frameStats().back().surfaceTargetsCreated, created);
            QVERIFY(!monitor.item->m_monitorPipelineCreated);
        }
    }
    void alphaThroughMotionBlur() {
        Monitor monitor;
        auto clips = monitor.model.clipsJson();
        for (int i = 0; i < clips.size(); ++i) {
            auto clip = clips[i].toObject();
            clip.insert("motionBlur", QJsonObject{{"samplesPerFrame", 4}, {"shutterAngle", 180}});
            clips[i] = clip;
        }
        QVERIFY(monitor.model.replaceClips(clips));
        for (int i = 0; i < 6; ++i) { monitor.frame(); }
        const auto before = monitor.frame();
        monitor.item->setAlphaDisplay(true);
        for (int i = 0; i < 6; ++i) { monitor.frame(); }
        const auto alpha = monitor.frame();
        QCOMPARE(alpha.pixelColor(80, 45), QColor(Qt::white));
        QCOMPARE(alpha.pixelColor(80, 135), QColor(Qt::black));
        monitor.item->setAlphaDisplay(false);
        for (int i = 0; i < 6; ++i) { monitor.frame(); }
        QCOMPARE(monitor.frame(), before);
    }
    // What --screenshot --monitor-state relies on after its capture restores the view options.
    void viewOptionsSettleAfterACapture() {
        Monitor monitor;
        auto clips = monitor.model.clipsJson();
        for (int i = 0; i < clips.size(); ++i) {
            auto clip = clips[i].toObject();
            clip.insert("motionBlur", QJsonObject{{"samplesPerFrame", 4}, {"shutterAngle", 180}});
            clips[i] = clip;
        }
        QVERIFY(monitor.model.replaceClips(clips));
        monitor.item->setAlphaDisplay(true);
        QVERIFY(!monitor.capture().isNull());
        monitor.frame();
        const auto restarted = monitor.frame();
        QVERIFY2(!monitor.item->frameSettled(), "The restored view restarts the accumulation");
        QCOMPARE(restarted.pixelColor(80, 45), QColor(Qt::black));
        for (int i = 0; i < 32 && !monitor.item->frameSettled(); ++i) { monitor.frame(); }
        QVERIFY(monitor.item->frameSettled());
        QCOMPARE(monitor.frame().pixelColor(80, 45), QColor(Qt::white));
    }
    void benchCanvasMeasurement() {
        nt::bench::BenchData data;
        QCOMPARE(nt::bench::buildReport(data, std::nullopt).json.value("canvasPixels").toInteger(-1), 0);
        data.canvasPixels = 160 * 90;
        QCOMPARE(nt::bench::buildReport(data, std::nullopt).json.value("canvasPixels").toInteger(), 14400);
    }
    void region() {
        Monitor monitor;
        const auto before = monitor.frame();
        QCOMPARE(before.pixelColor(80, 45), QColor(Qt::red));
        QCOMPARE(before.pixelColor(240, 45), QColor(Qt::green));
        QCOMPARE(before.pixelColor(80, 135), QColor(Qt::black));
        QVERIFY(monitor.item->setProperty("canvasRegion", QRectF(0.5, 0, 0.5, 0.5)));
        const auto zoomed = monitor.frame(false);
        for (const QPoint p : {QPoint(20, 20), QPoint(300, 20), QPoint(20, 160), QPoint(300, 160)}) {
            QCOMPARE(zoomed.pixelColor(p), QColor(Qt::green));
        }
        QVERIFY(monitor.item->setProperty("canvasRegion", QRectF(0, 0, 1, 1)));
        QCOMPARE(monitor.frame(false), before);
    }
};
QTEST_MAIN(MonitorCompositorTest)
#include "tst_monitorcompositor.moc"
