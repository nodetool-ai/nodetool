#include "model/StaticTimelineSource.h"
#include "model/TimelineJson.h"
#include "playback/PlaybackClock.h"
#include "preview/PreviewCompositor.h"
#include "preview/StandardHooks.h"
#include "preview/hw/HwWindow.h"

#include <QGuiApplication>
#include <QImage>
#include <QQuickWindow>
#include <QTemporaryDir>
#include <QTest>

#include <utility>

// UI thread. The window owns the render thread used for the capture.
class TestPlaybackHooksRender : public QObject {
    Q_OBJECT

private slots:
    void reframeFollowsTheAnimatedSubject() {
        const auto hooks = nt::registerStandardHooks();
        QTemporaryDir directory;
        QVERIFY(directory.isValid());
        QImage picture(128, 64, QImage::Format_RGB32);
        for (int y = 0; y < picture.height(); ++y) {
            for (int x = 0; x < picture.width(); ++x) {
                picture.setPixel(x, y, x < 64 ? qRgb(255, 0, 0) : qRgb(0, 255, 0));
            }
        }
        const auto path = directory.filePath(QStringLiteral("subject.png"));
        QVERIFY(picture.save(path));
        auto result = nt::parseTimelineJson(R"({"fps":30,"width":64,"height":64,"durationMs":1000,
          "tracks":[{"id":"v","type":"video","automation":[{"target":{"kind":"clip","property":"opacity"},
            "points":[{"timeMs":0,"value":1},{"timeMs":500,"value":0.5}]}]}],
          "clips":[{"id":"c","trackId":"v","mediaType":"image","startMs":0,"durationMs":1000,
            "status":"generated","currentAssetId":"subject","width":128,"height":64,
            "reframe":{"mode":"center","keyframes":[{"sourceMs":0,"x":0.25,"y":0.5},
                                                   {"sourceMs":500,"x":0.75,"y":0.5}]}}]})");
        QVERIFY(result.timeline);
        result.timeline->clips[0].mediaPath = path.toStdString();
        StaticTimelineSource source;
        source.setTimeline(std::move(*result.timeline));
        PlaybackClock clock;
        clock.setDurationMs(1000);
        QQuickWindow window;
        nt::hw::prepareWindow(&window);
        window.resize(64, 64);
        PreviewCompositor compositor;
        compositor.setParentItem(window.contentItem());
        compositor.setSize(QSizeF(64, 64));
        compositor.setTimeline(&source);
        compositor.setClock(&clock);
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        QVERIFY(window.rendererInterface()->graphicsApi() != QSGRendererInterface::Software);

        const auto captured = [&compositor] {
            compositor.update();
            return compositor.captureReady();
        };
        compositor.requestCapture();
        QTRY_VERIFY_WITH_TIMEOUT(captured(), 10000);
        const QImage first = compositor.takeCapture();
        QVERIFY(!first.isNull());
        const auto red = first.pixelColor(first.width() / 2, first.height() / 2);
        QVERIFY(red.redF() > 0.9 && red.greenF() < 0.1);

        clock.seek(500);
        compositor.requestCapture();
        QTRY_VERIFY_WITH_TIMEOUT(captured(), 10000);
        const QImage second = compositor.takeCapture();
        QVERIFY(!second.isNull());
        const auto green = second.pixelColor(second.width() / 2, second.height() / 2);
        QVERIFY(green.greenF() > 0.4 && green.redF() < 0.1);
        // The half-opacity clip blends with the black capture background.
        QVERIFY(green.greenF() < 0.85);
    }
};

int main(int argc, char** argv) {
    QGuiApplication app(argc, argv);
    nt::hw::selectGraphicsApi(false);
    TestPlaybackHooksRender test;
    return QTest::qExec(&test, argc, argv);
}

#include "tst_playbackhooks_render.moc"
