#include "bench/BenchReport.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include "preview/PreviewCompositor.h"
#include "preview/hw/HwWindow.h"
#include "preview/layers/LayerRegistry.h"
#include <QGuiApplication>
#include <QJsonArray>
#include <QQuickRenderControl>
#include <QQuickRenderTarget>
#include <QQuickWindow>
#include <QtTest>
#include <rhi/qrhi.h>
#include <memory>

namespace {
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
    void initTestCase() {
        if (qEnvironmentVariable("QT_QUICK_BACKEND") == u"software") {
            QSKIP("monitor compositor needs the platform QRhi, not the software scene graph");
        }
        m_source = nt::registerLayerSource("video", [](const nt::ActiveLayer& layer) {
            return std::make_unique<SolidSource>(layer.clipId == "red" ? Qt::red : Qt::green);
        });
    }
    void cleanupTestCase() { nt::unregisterLayerSource(m_source); }
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
        monitor.clock.pause();
        QCOMPARE(monitor.frame(false), full);
        monitor.frame();
        QCOMPARE(monitor.item->lastCanvasSize(), QSize(640, 360));
        for (const int invalid : {0, 3, 16, -1}) {
            monitor.item->setPlaybackResolution(invalid);
            QCOMPARE(monitor.item->playbackResolution(), 2);
        }
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
        monitor.item->setPausedResolution(4);
        const auto groupReduced = monitor.frame(false);
        for (const QPoint p : {QPoint(80, 45), QPoint(240, 45), QPoint(80, 135)}) {
            QCOMPARE(groupReduced.pixelColor(p), groupFull.pixelColor(p));
        }
        for (int i = 0; i < 4; ++i) { monitor.frame(); }
        const auto created = monitor.item->frameStats().back().surfaceTargetsCreated;
        QVERIFY(created > 0);
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
