#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "export/OffscreenFrames.h"
#include "preview/hw/HwWindow.h"
#include "preview/SourcePool.h"
#include "preview/compose/TestHandlers.h"
#include "preview/layers/TestStill.h"
#include "preview/layers/SceneHooks.h"
#include <QGuiApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <QTemporaryDir>
#include <QScopeGuard>
#include <QProcess>
#include <QStandardPaths>
#include <QtTest>

class TestBlurPool : public QObject {
    Q_OBJECT
    static bool writeVideo(const QString& path, const QString& color) {
        const auto ffmpeg = QStandardPaths::findExecutable("ffmpeg");
        if (ffmpeg.isEmpty()) return false;
        QProcess process;
        process.start(ffmpeg, {"-v", "error", "-y", "-f", "lavfi", "-i",
            QString("color=%1:s=64x32:r=30:d=1").arg(color), "-c:v", "ffv1", path});
        return process.waitForFinished(30000) && process.exitStatus() == QProcess::NormalExit && process.exitCode() == 0;
    }
private slots:
    void firstFrameHoldsBlackUntilComplete() {
        const auto source = nt::registerLayerSource("shape", [](const nt::ActiveLayer&) {
            QImage image(64, 32, QImage::Format_RGBA8888_Premultiplied); image.fill(Qt::white);
            return std::make_unique<nt::test::PaintSource>(std::move(image));
        });
        const auto cleanup = qScopeGuard([&] { nt::unregisterLayerSource(source); });
        const QJsonObject clip{{"id", "shape"}, {"trackId", "v"}, {"mediaType", "shape"},
            {"startMs", 0}, {"durationMs", 1000}, {"width", 64}, {"height", 32},
            {"shapeStyle", QJsonObject{{"kind", "rect"}}},
            {"motionBlur", QJsonObject{{"samplesPerFrame", 4}, {"shutterAngle", 180}}}};
        const QJsonObject raw{{"id", "first-frame"}, {"fps", 30}, {"width", 64}, {"height", 32},
            {"durationMs", 1000}, {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "video"}, {"visible", true}}}},
            {"clips", QJsonArray{clip}}};
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline.has_value());
        TimelineModel model; model.setTimeline(std::move(*parsed.timeline));
        QQuickRenderControl control;
        QQuickWindow window(&control);
        nt::hw::prepareWindow(&window);
        const QSize size(64, 32); window.resize(size);
        auto compositor = std::make_unique<PreviewCompositor>(window.contentItem());
        compositor->setTimeline(&model); compositor->setSize(size);
        QVERIFY(control.initialize());
        auto* rhi = control.rhi();
        std::unique_ptr<QRhiTexture> texture(rhi->newTexture(QRhiTexture::RGBA8, size, 1,
            QRhiTexture::RenderTarget | QRhiTexture::UsedAsTransferSource));
        std::unique_ptr<QRhiRenderBuffer> depth(rhi->newRenderBuffer(QRhiRenderBuffer::DepthStencil, size));
        QVERIFY(texture->create()); QVERIFY(depth->create());
        QRhiTextureRenderTargetDescription description{QRhiColorAttachment(texture.get())};
        description.setDepthStencilBuffer(depth.get());
        std::unique_ptr<QRhiTextureRenderTarget> target(rhi->newTextureRenderTarget(description));
        std::unique_ptr<QRhiRenderPassDescriptor> pass(target->newCompatibleRenderPassDescriptor());
        target->setRenderPassDescriptor(pass.get()); QVERIFY(target->create());
        window.setRenderTarget(QQuickRenderTarget::fromRhiRenderTarget(target.get()));
        QRhiReadbackResult readback;
        QImage first;
        readback.completed = [&] {
            first = QImage(reinterpret_cast<const uchar*>(readback.data.constData()), readback.pixelSize.width(),
                           readback.pixelSize.height(), QImage::Format_RGBA8888_Premultiplied).copy();
        };
        compositor->update(); QCoreApplication::processEvents(); control.polishItems();
        control.beginFrame(); control.sync(); control.render();
        auto* update = rhi->nextResourceUpdateBatch(); update->readBackTexture({texture.get()}, &readback);
        control.commandBuffer()->resourceUpdate(update); control.endFrame();
        compositor->requestCapture();
        QElapsedTimer timeout; timeout.start();
        while ((!compositor->captureReady() || first.isNull()) && timeout.elapsed() < 15000) {
            compositor->update(); QCoreApplication::processEvents(); control.polishItems();
            control.beginFrame(); control.sync(); control.render(); control.endFrame();
            QCoreApplication::processEvents(); QThread::msleep(1);
        }
        QVERIFY(!first.isNull()); QVERIFY(compositor->captureReady());
        const auto initial = first.pixelColor(32, 16);
        const auto completed = compositor->takeCapture().pixelColor(32, 16);
        QVERIFY2(initial.red() < 10 && initial.green() < 10 && initial.blue() < 10, qPrintable(initial.name()));
        QVERIFY2(completed.red() > 240 && completed.green() > 240 && completed.blue() > 240, qPrintable(completed.name()));
    }
    void requiredSourcesBeyondPrerollCap() {
        QTemporaryDir directory;
        QVERIFY(directory.isValid());
        const auto path = directory.filePath("source.mkv"); QVERIFY(writeVideo(path, "white"));
        nt::Timeline timeline;
        nt::Track track; track.id = "v"; timeline.tracks.push_back(track);
        std::set<std::string> required;
        for (int i = 0; i < 16; ++i) {
            nt::Clip clip; clip.id = std::to_string(i); clip.trackId = "v"; clip.mediaType = nt::MediaType::Video;
            clip.mediaPath = path.toStdString(); clip.startMs = 0; clip.durationMs = 500;
            required.insert(clip.id); timeline.clips.push_back(std::move(clip));
        }
        nt::SourcePool pool;
        pool.update(timeline, 510, required);
        int opened = 0;
        for (const auto& id : required) if (pool.sourceFor(id)) ++opened;
        QCOMPARE(opened, 16);
        pool.update(timeline, 250);
        opened = 0;
        for (const auto& id : required) if (pool.sourceFor(id)) ++opened;
        QCOMPARE(opened, nt::kMaxOpenDecoders);
    }
    void secondSourcePathReplacement() {
        QTemporaryDir directory;
        QVERIFY(directory.isValid());
        QImage white(64, 32, QImage::Format_RGBA8888); white.fill(Qt::white);
        const auto a = directory.filePath("white.mkv"), b = directory.filePath("black.mkv");
        QVERIFY(writeVideo(a, "white")); QVERIFY(writeVideo(b, "black"));
        const auto source = nt::registerLayerSource("shape", [white](const nt::ActiveLayer&) {
            return std::make_unique<nt::test::PaintSource>(white);
        });
        const auto stage = nt::registerEffectStage([] { return std::make_unique<nt::test::SecondSourceStage>(); });
        const auto provider = nt::registerSecondSourceProvider([](const nt::ActiveLayer&, const nt::Clip& clip) {
            return std::vector<nt::SecondSourceRequest>{{"luma", clip.raw.value("secondaryPath").toString().toStdString()}};
        });
        const auto hook = nt::registerLayerDecorator([](nt::ActiveLayer& layer, const nt::Clip&, double) {
            layer.ext.insert("secondSource", true);
        });
        const auto cleanup = qScopeGuard([&] {
            nt::unregisterSceneHook(hook);
            nt::unregisterSecondSourceProvider(provider);
            nt::unregisterEffectStage(stage);
            nt::unregisterLayerSource(source);
        });
        QJsonObject clip{{"id", "same"}, {"trackId", "v"}, {"mediaType", "shape"},
            {"startMs", 0}, {"durationMs", 1000}, {"width", 64}, {"height", 32},
            {"shapeStyle", QJsonObject{{"kind", "rect"}}}, {"secondaryPath", a},
            {"motionBlur", QJsonObject{{"samplesPerFrame", 4}, {"shutterAngle", 180}}}};
        QJsonObject raw{{"id", "second-replacement"}, {"fps", 30}, {"width", 64}, {"height", 32},
            {"durationMs", 1000}, {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "video"}, {"visible", true}}}},
            {"clips", QJsonArray{clip}}};
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline.has_value());
        TimelineModel model; model.setTimeline(std::move(*parsed.timeline));
        nt::exporting::OffscreenFrames frames(model);
        const auto capture = [&] { return frames.capture(0, 30, [] { return false; }).pixelColor(32, 16); };
        const auto first = capture();
        clip.insert("secondaryPath", b); QVERIFY(model.replaceClips(QJsonArray{clip}));
        const auto second = capture();
        clip.insert("secondaryPath", a); QVERIFY(model.replaceClips(QJsonArray{clip}));
        const auto third = capture();
        QVERIFY2(first.red() > 200, qPrintable(first.name()));
        QVERIFY2(second.red() < 40, qPrintable(second.name()));
        QVERIFY2(third.red() > 200, qPrintable(third.name()));
    }
    void sourcePathReplacement() {
        QTemporaryDir directory;
        QVERIFY(directory.isValid());
        const auto a = directory.filePath("a.mkv"), b = directory.filePath("b.mkv");
        QVERIFY(writeVideo(a, "red")); QVERIFY(writeVideo(b, "blue"));
        QJsonObject clip{{"id", "same"}, {"trackId", "v"}, {"mediaType", "video"},
            {"startMs", 0}, {"durationMs", 1000}, {"width", 64}, {"height", 32}, {"mediaPath", a},
            {"motionBlur", QJsonObject{{"samplesPerFrame", 4}, {"shutterAngle", 180}}}};
        QJsonObject raw{{"id", "source-replacement"}, {"fps", 30}, {"width", 64}, {"height", 32},
            {"durationMs", 1000}, {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "video"}, {"visible", true}}}},
            {"clips", QJsonArray{clip}}};
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline.has_value());
        TimelineModel model; model.setTimeline(std::move(*parsed.timeline));
        nt::exporting::OffscreenFrames frames(model);
        const auto capture = [&] { return frames.capture(0, 30, [] { return false; }).pixelColor(32, 16); };
        auto first = capture();
        QVERIFY2(first.red() > 200 && first.blue() < 40, qPrintable(first.name()));
        clip.insert("mediaPath", b);
        QVERIFY(model.replaceClips(QJsonArray{clip}));
        auto second = capture();
        QVERIFY2(second.blue() > 200 && second.red() < 40, qPrintable(second.name()));
        clip.insert("mediaPath", a);
        QVERIFY(model.replaceClips(QJsonArray{clip}));
        auto third = capture();
        QVERIFY2(third.red() > 200 && third.blue() < 40, qPrintable(third.name()));
    }
};
int main(int argc, char** argv) {
    QGuiApplication app(argc, argv);
    nt::hw::selectGraphicsApi(false);
    TestBlurPool test;
    return QTest::qExec(&test, argc, argv);
}
#include "tst_blurpool.moc"
