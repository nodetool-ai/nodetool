// The Source panel mounted in the real editor and rendered by the GPU. Keys and
// pointer events reach the panel, and the picture read back from its compositor
// is the expected frame. Set NT_SOURCE_SHOT to a directory to keep window grabs.
#include "SourceMonitor.h"
#include "SourceViewerState.h"
#include "preview/PreviewCompositor.h"
#include "wiring/WiringFixture.h"
#include <QImage>
#include <QQmlEngine>
#include <QTemporaryDir>
#include <cmath>

class TestSourcePanel : public WiringFixture {
    Q_OBJECT
    QTemporaryDir preferences;
    SourceViewerState* state = nullptr;
    const QString numbered = QStringLiteral(NT_FIXTURES_DIR "/media/numbered-a-1080p30.mp4");
    QVariantMap video{{"id", "numbered"}, {"name", "numbered-a.mp4"}, {"content_type", "video/mp4"}};
    static int barcode(const QImage& image) {
        if (image.width() < 1280 || image.height() < 40) { return -1; }
        int value = 0;
        for (int bit = 0; bit < 16; ++bit) { if (qGray(image.pixel(bit * 80 + 40, 20)) > 128) { value |= 1 << bit; } }
        return value;
    }
    void shot(const QString& name) {
        const auto directory = qEnvironmentVariable("NT_SOURCE_SHOT");
        if (!directory.isEmpty()) { view->grabWindow().save(directory + '/' + name + ".png"); }
    }
    int settledFrame(PreviewCompositor* compositor) {
        compositor->requestCapture();
        QElapsedTimer timeout; timeout.start();
        while (!compositor->captureReady() && timeout.elapsed() < 10000) {
            compositor->update();
            QTest::qWait(16);
        }
        return barcode(compositor->takeCapture());
    }
private slots:
    void initTestCase() {
        QVERIFY(preferences.isValid());
        qputenv("NODETOOL_TIMELINE_PREFERENCES", preferences.filePath("preferences.ini").toUtf8());
        QCoreApplication::instance()->setProperty("timelineAudioMode", "null");
    }
    void init() {
        open(300);
        view->resize(1600, 1000);
        state = view->engine()->singletonInstance<SourceViewerState*>("NodeTool.Timeline", "SourceViewerState");
        QVERIFY(state);
        auto* dock = qobject_cast<DockLayoutStore*>(view->rootObject()->property("dockStore").value<QObject*>());
        QVERIFY(dock);
        QVERIFY(QMetaObject::invokeMethod(dock, "dispatch", Q_ARG(QVariantMap, (QVariantMap{{"type", "reveal"}, {"panelId", "source"}}))));
        QTRY_VERIFY(item("sourceViewer") && item("sourceViewer")->isVisible());
    }
    void cleanup() {
        state->setAsset({});
        state = nullptr;
        view.reset();
    }
    void emptyStateShows() {
        state->setAsset({});
        QTRY_VERIFY(item("sourceEmptyState")->isVisible());
        QTest::qWait(100);
        shot("source-empty");
    }
    void playsAFixtureAndShowsTheExpectedFrame() {
        state->setAsset(video);
        auto* monitor = state->monitor();
        monitor->openLocal(video, numbered, {}, 2000);
        QTRY_VERIFY_WITH_TIMEOUT(monitor->ready() && !monitor->busy(), 10000);
        QTRY_VERIFY(item("sourceCompositor"));
        auto* compositor = qobject_cast<PreviewCompositor*>(item("sourceCompositor"));
        QVERIFY(compositor);
        QCOMPARE(settledFrame(compositor), 60);
        state->markIn(1000);
        state->markOut(4000);
        click("sourcePatch-v");
        click("sourcePatch-a");
        shot("source-parked");
        click("sourcePatch-v");
        click("sourcePatch-a");

        // Through real keys: focus by pressing in the panel, Space plays and pauses.
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("sourceStage")));
        QVERIFY(item("sourceViewer")->property("sourceFocused").toBool());
        QTest::keyClick(view.get(), Qt::Key_Space);
        QVERIFY(monitor->clock()->playing()); QVERIFY(!clock.playing());
        QTRY_VERIFY_WITH_TIMEOUT(monitor->clock()->time() > 2600, 5000);
        shot("source-playing");
        QTest::keyClick(view.get(), Qt::Key_Space);
        QVERIFY(!monitor->clock()->playing());
        const double time = monitor->clock()->time();
        QVERIFY(time > 2600);
        QCOMPARE(settledFrame(compositor), int(std::floor(time * 30 / 1000 + 1e-6)));

        // A frame step lands on the next frame.
        QTest::keyClick(view.get(), Qt::Key_Right);
        QCOMPARE(settledFrame(compositor), int(std::floor(time * 30 / 1000 + 1e-6)) + 1);

        // The Program monitor keeps its own picture and its clock did not move.
        QCOMPARE(clock.time(), 1500.0);
        QCOMPARE(model.undoStack()->count(), 0);
    }
    void audioOnlyShowsAWaveform() {
        const auto path = QStringLiteral(NT_FIXTURES_DIR "/media/flash-beep-720p30.mov");
        QVariantMap sound{{"id", "sound"}, {"name", "clicks.wav"}, {"content_type", "audio/wav"}};
        state->setAsset(sound);
        state->monitor()->openLocal(sound, path, path);
        QTRY_VERIFY_WITH_TIMEOUT(state->monitor()->ready() && !state->monitor()->busy(), 10000);
        QTRY_VERIFY_WITH_TIMEOUT(item("sourceWaveform")->property("loaded").toBool(), 10000);
        QTRY_VERIFY(item("sourceWaveform")->property("barCount").toInt() > 0);
        QTest::qWait(300);
        shot("source-audio");
    }
    void imageShowsThePicture() {
        QTemporaryDir directory; QVERIFY(directory.isValid());
        const auto path = directory.filePath("still.png");
        QImage picture(320, 180, QImage::Format_RGB32); picture.fill(Qt::darkCyan); QVERIFY(picture.save(path));
        QVariantMap still{{"id", "still"}, {"name", "still.png"}, {"content_type", "image/png"}};
        state->setAsset(still);
        state->monitor()->openLocal(still, path, {});
        QTRY_VERIFY_WITH_TIMEOUT(state->monitor()->ready() && !state->monitor()->busy(), 10000);
        auto* poster = item("sourcePoster"); QVERIFY(poster); QVERIFY(poster->isVisible());
        QTRY_COMPARE(poster->property("status").toInt(), 1);
        QVERIFY(!item("sourceScrub")->isVisible());
        QTest::qWait(100);
        shot("source-image");
    }
};
QTEST_MAIN(TestSourcePanel)
#include "tst_sourcepanel.moc"
