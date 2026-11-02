#include "app/MenuRegistry.h"
#include "colorpanel/ScopesController.h"
#include "DockLayoutStore.h"
#include "edit/ClipGestureController.h"
#include "export/FrameCapture.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include "reference/ReferenceController.h"
#include "server/ServerSource.h"
#include "TestHttpServer.h"
#include "ui/MonitorViewState.h"
#include <QDir>
#include <QFile>
#include <QGuiApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <QProcess>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWindow>
#include <QSignalSpy>
#include <QTemporaryDir>
#include <QtQuickTest/quicktest.h>
#include <QtTest>
#include <cmath>
#include <functional>
#include <memory>

namespace {
QQuickItem* find(QQuickItem* root, const QString& name) {
    if (!root) return nullptr;
    if (root->objectName() == name) return root;
    for (auto* child : root->childItems()) {
        if (auto* found = find(child, name)) return found;
    }
    return nullptr;
}
QJsonObject clipJson(const QString& id, double start, double duration, const QString& path, const QJsonArray& versions = {}) {
    return {{"id", id}, {"name", id}, {"trackId", "v"}, {"mediaType", "image"}, {"sourceType", "imported"},
        {"status", "generated"}, {"locked", false}, {"versions", versions}, {"startMs", start}, {"durationMs", duration},
        {"width", 320}, {"height", 180}, {"mediaPath", path}};
}
QJsonObject documentOf(const QJsonArray& clips, const QJsonArray& markers = {}) {
    return {{"id", "reference"}, {"projectId", "p"}, {"name", "Reference"}, {"width", 320}, {"height", 180}, {"fps", 30}, {"durationMs", 3000},
        {"markers", markers}, {"createdAt", "2026-01-01T00:00:00Z"}, {"updatedAt", "2026-01-01T00:00:00Z"},
        {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "video"}, {"name", "Video"}, {"index", 0}, {"visible", true}, {"locked", false}}}},
        {"clips", clips}};
}
QJsonObject successfulTake(const QString& id, const QString& asset, const QString& label = {}) {
    return {{"id", id}, {"assetId", asset}, {"status", "success"}, {"label", label}, {"paramOverridesSnapshot", QJsonObject{}}};
}
QString flatPng(const QString& path, const QColor& color) {
    QImage image(320, 180, QImage::Format_RGB888);
    image.fill(color);
    return image.save(path) ? path : QString();
}
// A horizontal ramp, so a scaled or shifted frame does not pass as the same picture.
QString rampPng(const QString& path, int red, int green, int blue) {
    QImage image(320, 180, QImage::Format_RGB888);
    for (int y = 0; y < image.height(); ++y) {
        auto* row = image.scanLine(y);
        for (int x = 0; x < image.width(); ++x) {
            const double t = double(x) / (image.width() - 1);
            row[x * 3] = uchar(red * t);
            row[x * 3 + 1] = uchar(green * t);
            row[x * 3 + 2] = uchar(blue * t);
        }
    }
    return image.save(path) ? path : QString();
}
QColor centre(const QImage& image) { return image.pixelColor(image.width() / 2, image.height() / 2); }
bool near(const QColor& a, const QColor& b, int tolerance = 6) {
    return std::abs(a.red() - b.red()) <= tolerance && std::abs(a.green() - b.green()) <= tolerance && std::abs(a.blue() - b.blue()) <= tolerance;
}
double psnr(const QImage& first, const QImage& second) {
    const auto a = first.convertToFormat(QImage::Format_RGBA8888);
    const auto b = second.convertToFormat(QImage::Format_RGBA8888);
    if (a.size() != b.size() || a.isNull()) return -1;
    double sum = 0;
    for (int y = 0; y < a.height(); ++y) {
        const auto* p = a.constScanLine(y);
        const auto* q = b.constScanLine(y);
        for (int x = 0; x < a.width() * 4; ++x) {
            if (x % 4 == 3) continue;
            const double d = double(p[x]) - double(q[x]);
            sum += d * d;
        }
    }
    const double mse = sum / (a.width() * a.height() * 3);
    return mse == 0 ? 100 : 10 * std::log10(255.0 * 255.0 / mse);
}
struct Editor {
    TimelineModel model;
    PlaybackClock clock;
    QQmlEngine engine;
    QQuickWindow window;
    std::unique_ptr<QObject> object;
    QString error;
    // The layout persists between editors, and each test starts with the panel behind its tab.
    ~Editor() { if (object) store()->resetWorkspace(); }
    explicit Editor(const QJsonObject& document) {
        auto parsed = nt::parseTimeline(document);
        if (!parsed.timeline) { error = "Invalid test document"; return; }
        model.setTimeline(std::move(*parsed.timeline));
        clock.setFps(30);
        QQmlComponent component(&engine, QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/TimelineEditor.qml"));
        object.reset(component.createWithInitialProperties({{"timeline", QVariant::fromValue(&model)},
            {"clock", QVariant::fromValue(&clock)}, {"width", 1500}, {"height", 950}}));
        error = component.errorString();
        if (!object) return;
        capture()->setExecutable(QStringLiteral(NT_TIMELINE_BINARY));
        window.resize(1500, 950);
        qobject_cast<QQuickItem*>(object.get())->setParentItem(window.contentItem());
        window.show();
        if (!QTest::qWaitForWindowExposed(&window)) { error = "The window did not expose"; object.reset(); return; }
        settle();
    }
    FrameCapture* capture() const { return object->property("frameCapture").value<FrameCapture*>(); }
    ReferenceController* reference() const { return object->property("referenceMonitor").value<ReferenceController*>(); }
    DockLayoutStore* store() const { return object->findChild<DockLayoutStore*>("dockLayoutStore"); }
    ClipGestureController* gestures() const { return object->findChild<ClipGestureController*>("clipGestures"); }
    MonitorViewState* monitor() const { return object->findChild<MonitorViewState*>("monitorViewState"); }
    void settle() {
        QCoreApplication::processEvents();
        QQuickTest::qWaitForPolish(&window);
        QCoreApplication::processEvents();
    }
    QQuickItem* item(const QString& name) {
        settle();
        return find(window.contentItem(), name);
    }
    bool openPanel() {
        store()->dispatch({{"type", "reveal"}, {"panelId", "reference"}});
        settle();
        return QTest::qWaitFor([&] {
            auto* panel = item("referencePanel");
            return panel && panel->isVisible() && panel->width() > 0;
        }, 5000);
    }
    bool settled() { return QTest::qWaitFor([&] { return !reference()->busy() && capture()->pending() == 0; }, 60000); }
    bool waitFor(const QString& name) {
        return QTest::qWaitFor([&] {
            auto* target = item(name);
            return target && target->isVisible() && target->width() > 0;
        }, 5000);
    }
    // For looking at the result: NT_REFERENCE_SHOTS names a folder.
    void shot(const QString& name) {
        const auto directory = qEnvironmentVariable("NT_REFERENCE_SHOTS");
        if (directory.isEmpty()) return;
        settle();
        QTest::qWait(100);
        window.grabWindow().save(directory + "/" + name + ".png");
    }
    void click(QQuickItem* target) {
        const QPointF point = target->mapToScene(QPointF(target->width() / 2, target->height() / 2));
        QTest::mouseClick(&window, Qt::LeftButton, Qt::NoModifier, point.toPoint());
        settle();
    }
};
}

class ReferenceTest : public QObject {
    Q_OBJECT
    QTemporaryDir m_dir;
    int m_serial = 0;
    QString m_red, m_blue, m_green;
    QJsonObject twoShots() const {
        return documentOf({clipJson("a", 0, 1000, m_red), clipJson("b", 1000, 1000, m_blue)},
            QJsonArray{QJsonObject{{"id", "m1"}, {"timeMs", 1500}, {"label", "Hero"}}});
    }
    QImage still(const QJsonObject& raw, int frame) {
        const QString base = m_dir.filePath(QString::number(++m_serial));
        QFile file(base + ".json");
        if (!file.open(QIODevice::WriteOnly)) return {};
        file.write(QJsonDocument(raw).toJson());
        file.close();
        QProcess process;
        auto env = QProcessEnvironment::systemEnvironment();
        env.remove("QT_QUICK_BACKEND");
        process.setProcessEnvironment(env);
        process.start(QStringLiteral(NT_TIMELINE_BINARY), {file.fileName(), "--stills", base, "--still-frames", QString::number(frame), "--decode", "sw"});
        if (!process.waitForFinished(60000) || process.exitStatus() != QProcess::NormalExit || process.exitCode() != 0) {
            qWarning().noquote() << process.readAllStandardError();
            return {};
        }
        return QImage(base + QStringLiteral("/frame_%1.png").arg(frame, 6, 10, QLatin1Char('0')));
    }
private slots:
    void initTestCase() {
        QVERIFY(m_dir.isValid());
        m_red = flatPng(m_dir.filePath("red.png"), QColor(200, 40, 40));
        m_blue = flatPng(m_dir.filePath("blue.png"), QColor(40, 60, 200));
        m_green = flatPng(m_dir.filePath("green.png"), QColor(40, 190, 70));
        QVERIFY(!m_red.isEmpty() && !m_blue.isEmpty() && !m_green.isEmpty());
    }
    void aHiddenPanelTakesNoFrame() {
        Editor e(twoShots());
        QVERIFY2(e.object, qPrintable(e.error));
        e.clock.seek(500);
        QTest::qWait(200);
        QVERIFY(!e.item("referencePanel")->isVisible());
        QVERIFY(!e.reference()->shownInPanel());
        QVERIFY(!e.reference()->hasReference());
        QCOMPARE(e.reference()->capturesForTest(), 0);
        QCOMPARE(e.capture()->processId(), qint64(0));
    }
    void parkedFrameMatchesStills() {
        // One clip per frame, so a capture a frame off shows another picture.
        const double frame = 1000.0 / 30;
        const auto document = documentOf({
            clipJson("before", 0, 45 * frame, rampPng(m_dir.filePath("ramp-r.png"), 255, 40, 40)),
            clipJson("exact", 45 * frame, frame, rampPng(m_dir.filePath("ramp-g.png"), 40, 255, 40)),
            clipJson("after", 46 * frame, 44 * frame, rampPng(m_dir.filePath("ramp-b.png"), 40, 40, 255))});
        Editor e(document);
        QVERIFY2(e.object, qPrintable(e.error));
        auto* r = e.reference();
        r->parkAt(1500);
        QVERIFY(e.settled());
        QVERIFY2(r->hasImage(), qPrintable(r->error()));
        const auto reference = still(document, 45);
        QVERIFY(!reference.isNull());
        const double db = psnr(r->image(), reference);
        qInfo() << "parked frame against --stills:" << db << "dB";
        QVERIFY2(db > 50, qPrintable(QString::number(db)));
        QCOMPARE(r->imageTimeMs(), 1500.0);
        // It would fail against a neighbour: the check can tell frames apart.
        QVERIFY(psnr(r->image(), still(document, 46)) < 30);
        QVERIFY(psnr(r->image(), still(document, 44)) < 30);
        // Stepping shows the neighbours' stills.
        r->stepFrames(1);
        QVERIFY(e.settled());
        QVERIFY(psnr(r->image(), still(document, 46)) > 50);
    }
    void parkedFrameIgnoresThePlayhead() {
        Editor e(twoShots());
        QVERIFY2(e.object, qPrintable(e.error));
        e.capture()->setIdleInterval(50);
        QVERIFY(e.openPanel());
        auto* r = e.reference();
        e.clock.seek(100);
        r->matchPlayhead();
        QVERIFY(e.settled());
        QVERIFY(r->hasImage());
        const auto key = r->image().cacheKey();
        const int captures = r->capturesForTest();
        QTRY_VERIFY(e.capture()->processId() == 0);
        QSignalSpy state(r, &ReferenceController::stateChanged);
        QSignalSpy image(r, &ReferenceController::imageChanged);
        for (int ms = 0; ms < 2000; ms += 100) {
            e.clock.seek(ms);
            e.settle();
        }
        e.clock.play();
        QTest::qWait(300);
        e.clock.pause();
        QCOMPARE(r->capturesForTest(), captures);
        QCOMPARE(r->image().cacheKey(), key);
        QCOMPARE(state.count(), 0);
        QCOMPARE(image.count(), 0);
        QVERIFY(!r->stale());
        // At rest: the helper is gone and playback did not start it again.
        QCOMPARE(e.capture()->processId(), qint64(0));
        QCOMPARE(e.capture()->pending(), 0);
    }
    void editMarksAParkedFrameStaleUntilRefresh() {
        Editor e(twoShots());
        QVERIFY2(e.object, qPrintable(e.error));
        auto* r = e.reference();
        r->parkAt(500);
        QVERIFY(e.settled());
        QVERIFY(near(centre(r->image()), QColor(200, 40, 40)));
        const auto key = r->image().cacheKey();
        const int captures = r->capturesForTest();
        const int undo = e.model.undoStack()->index();

        auto clips = e.model.clipsJson();
        auto first = clips[0].toObject();
        first.insert("mediaPath", m_green);
        first.insert("startMs", 2000);
        clips.replace(0, first);
        e.model.commitEdit("Move", e.model.clipsJson(), clips);
        QVERIFY(r->stale());
        QCOMPARE(r->image().cacheKey(), key);
        QCOMPARE(r->capturesForTest(), captures);
        QCOMPARE(e.model.undoStack()->index(), undo + 1);

        r->refresh();
        QVERIFY(e.settled());
        QVERIFY(!r->stale());
        QVERIFY(r->image().cacheKey() != key);
        QCOMPARE(e.model.undoStack()->index(), undo + 1);
    }
    void gangedFollowsThePlayheadAndTheDocument() {
        Editor e(twoShots());
        QVERIFY2(e.object, qPrintable(e.error));
        QVERIFY(e.openPanel());
        auto* r = e.reference();
        QVERIFY(e.settled());
        r->setGanged(true);
        e.clock.seek(1500);
        QTRY_COMPARE_WITH_TIMEOUT(r->imageTimeMs(), 1500.0, 60000);
        QVERIFY(near(centre(r->image()), QColor(40, 60, 200)));

        auto clips = e.model.clipsJson();
        auto second = clips[1].toObject();
        second.insert("durationMs", 900);
        clips.replace(1, second);
        const auto key = r->image().cacheKey();
        e.model.commitEdit("Trim", e.model.clipsJson(), clips);
        QTRY_VERIFY_WITH_TIMEOUT(r->image().cacheKey() != key, 60000);
        QVERIFY(!r->stale());

        // Playing, it asks for one frame at a time, far below the frame rate.
        const int before = r->capturesForTest();
        e.clock.seek(0);
        e.clock.setDurationMs(2000);
        e.clock.play();
        QElapsedTimer played;
        played.start();
        int largest = 0;
        while (played.elapsed() < 1200) {
            QTest::qWait(10);
            e.clock.tick();
            largest = std::max(largest, e.capture()->pending());
        }
        e.clock.pause();
        const int taken = r->capturesForTest() - before;
        qInfo() << "ganged playback:" << taken << "captures in" << played.elapsed() << "ms, largest queue" << largest;
        QVERIFY(taken >= 1);
        QVERIFY2(taken <= 8, qPrintable(QString::number(taken)));
        QVERIFY(largest <= 1);

        // Turning the gang off parks on the frame it shows.
        QVERIFY(e.settled());
        const double parked = r->timeMs();
        r->setGanged(false);
        const int captures = r->capturesForTest();
        e.clock.seek(100);
        QTest::qWait(100);
        QCOMPARE(r->timeMs(), parked);
        QCOMPARE(r->capturesForTest(), captures);
    }
    // What a ganged reference costs at a delivery size, reported rather than held to a number
    // because the machine running this test is not idle. It holds the GUI thread to a loose limit.
    void gangedCostAtFullHd() {
        auto document = documentOf({clipJson("a", 0, 3000, m_red)});
        document.insert("width", 1920);
        document.insert("height", 1080);
        Editor e(document);
        QVERIFY2(e.object, qPrintable(e.error));
        QVERIFY(e.openPanel());
        auto* r = e.reference();
        QVERIFY(e.settled());
        r->setGanged(true);
        QTRY_VERIFY_WITH_TIMEOUT(r->hasImage(), 60000);
        QVERIFY(e.settled());
        const int before = r->capturesForTest();
        e.clock.seek(0);
        e.clock.play();
        QElapsedTimer played;
        played.start();
        qint64 last = 0, largest = 0;
        while (played.elapsed() < 2000) {
            QTest::qWait(5);
            e.clock.tick();
            const auto now = played.elapsed();
            largest = std::max(largest, now - last);
            last = now;
        }
        e.clock.pause();
        const int taken = r->capturesForTest() - before;
        qInfo() << "ganged at 1920x1080:" << taken << "captures in" << played.elapsed() << "ms, largest GUI gap" << largest << "ms";
        QVERIFY(taken >= 1);
        QVERIFY2(largest < 500, qPrintable(QString::number(largest)));
    }
    void stepsAndClampsToFrames() {
        Editor e(twoShots());
        QVERIFY2(e.object, qPrintable(e.error));
        auto* r = e.reference();
        r->parkAt(1016);
        QCOMPARE(r->timeMs(), 30 * 1000.0 / 30);
        r->stepFrames(1);
        QCOMPARE(r->timeMs(), 31 * 1000.0 / 30);
        r->stepFrames(-40);
        QCOMPARE(r->timeMs(), 0.0);
        r->parkAt(1e9);
        // The document's 3000 ms is longer than its clips, so its last frame is 89.
        QCOMPARE(r->timeMs(), 89 * 1000.0 / 30);
        r->stepFrames(1);
        QCOMPARE(r->timeMs(), 89 * 1000.0 / 30);
        r->parkAt(-5);
        QCOMPARE(r->timeMs(), 0.0);
        r->parkAt(std::nan(""));
        QCOMPARE(r->timeMs(), 0.0);
        QVERIFY(e.settled());
    }
    void setsFromClipFramesMarkersAndMenus() {
        Editor e(twoShots());
        QVERIFY2(e.object, qPrintable(e.error));
        auto* r = e.reference();
        auto* g = e.gestures();
        QVERIFY(g);
        const QVariantMap clip{{"clipId", "b"}};
        QVERIFY(g->runAction("referenceClipFirstFrame", clip));
        QCOMPARE(r->timeMs(), 1000.0);
        QCOMPARE(r->description(), QStringLiteral("First frame of b"));
        QVERIFY(g->runAction("referenceClipLastFrame", clip));
        QCOMPARE(r->timeMs(), 59 * 1000.0 / 30);
        QCOMPARE(r->description(), QStringLiteral("Last frame of b"));
        QVERIFY(e.settled());
        QVERIFY(near(centre(r->image()), QColor(40, 60, 200)));

        r->stepFrames(-1);
        QCOMPARE(r->description(), QString());
        QVERIFY(g->runAction("referenceMarker", {{"markerId", "m1"}, {"timeMs", 1500.0}}));
        QCOMPARE(r->timeMs(), 1500.0);
        QCOMPARE(r->description(), QStringLiteral("Marker: Hero"));
        e.clock.seek(100);
        QVERIFY(g->runAction("setReferenceFrame"));
        QCOMPARE(r->timeMs(), 3 * 1000.0 / 30);
        QVERIFY(!g->runAction("referenceClipFirstFrame", {{"clipId", "gone"}}));
        QVERIFY(e.settled());

        // A menu brings the panel forward.
        auto* panel = e.item("referencePanel");
        QTRY_VERIFY(panel && panel->isVisible());
        MenuRegistry registry;
        const auto labels = [&](const QString& kind, const QVariantMap& context) {
            QStringList out;
            for (const auto& item : registry.query(kind, context)) {
                const auto map = item.toMap();
                if (map.value("enabled").toBool()) out << map.value("action").toString();
            }
            return out;
        };
        const QVariantMap rawClip = QJsonObject(clipJson("b", 1000, 1000, m_blue)).toVariantMap();
        const auto picture = labels("clip", {{"kind", "clip"}, {"clipId", "b"}, {"clip", rawClip}});
        QVERIFY2(picture.contains("referenceClipFirstFrame") && picture.contains("referenceClipLastFrame"), qPrintable(picture.join(',')));
        QVERIFY2(!picture.contains("referenceClipTake"), "A clip with no takes offers no comparison");
        auto audio = rawClip;
        audio.insert("mediaType", "audio");
        QVERIFY(!labels("clip", {{"kind", "clip"}, {"clipId", "b"}, {"clip", audio}}).contains("referenceClipFirstFrame"));
        QVERIFY(labels("marker", {{"kind", "marker"}, {"markerId", "m1"}, {"timeMs", 1500.0}}).contains("referenceMarker"));
    }
    void showsAnotherTakeOfTheClip() {
        QJsonArray versions{successfulTake("t1", "asset-a"), successfulTake("t2", "asset-b", "Close-up"),
            QJsonObject{{"id", "t3"}, {"assetId", "asset-c"}, {"status", "failed"}}};
        auto shot = clipJson("a", 0, 1000, m_red, versions);
        shot.insert("activeTakeId", "t1");
        const auto document = documentOf({shot});
        Editor e(document);
        QVERIFY2(e.object, qPrintable(e.error));
        auto* r = e.reference();

        // With no server there is nothing to fetch the take from, and it says so.
        e.clock.seek(500);
        QVERIFY(r->useTake("a", "t2"));
        QVERIFY(e.settled());
        QVERIFY2(r->error().contains("server"), qPrintable(r->error()));
        QVERIFY(!r->hasImage());

        QString requested;
        r->setTakeMediaResolverForTest([&](const QString& assetId, const QJsonObject&) {
            requested = assetId;
            nt::Clip media;
            media.mediaPath = m_green.toStdString();
            media.originalMediaPath = m_green.toStdString();
            return media;
        });
        r->setTakeClipId("a");
        const auto takes = r->takes();
        QCOMPARE(takes.size(), 1);
        QCOMPARE(takes[0].toMap().value("value").toString(), QStringLiteral("t2"));
        QCOMPARE(takes[0].toMap().value("label").toString(), QStringLiteral("Close-up"));

        const auto before = e.model.documentJson();
        const int undo = e.model.undoStack()->index();
        QVERIFY(r->useTake("a", "t2"));
        QVERIFY(e.settled());
        QVERIFY2(r->hasImage(), qPrintable(r->error()));
        QCOMPARE(requested, QStringLiteral("asset-b"));
        QCOMPARE(r->description(), QStringLiteral("Close-up, a"));
        QCOMPARE(r->timeMs(), 15 * 1000.0 / 30);
        QVERIFY2(near(centre(r->image()), QColor(40, 190, 70)), qPrintable(centre(r->image()).name()));
        // Compare with the sequence the take would make.
        auto taken = shot;
        taken.insert("mediaPath", m_green);
        const double db = psnr(r->image(), still(documentOf({taken}), 15));
        qInfo() << "take frame against --stills of the applied take:" << db << "dB";
        QVERIFY(db > 50);
        QCOMPARE(e.model.documentJson(), before);
        QCOMPARE(e.model.undoStack()->index(), undo);

        // A take stays the take while stepping, within its clip, and an unknown one is refused.
        r->stepFrames(1);
        QCOMPARE(r->takeId(), QStringLiteral("t2"));
        QCOMPARE(r->timeMs(), 16 * 1000.0 / 30);
        r->stepFrames(1000);
        QCOMPARE(r->timeMs(), 29 * 1000.0 / 30);
        QVERIFY(e.settled());
        QVERIFY(!r->useTake("a", "nope"));
        // The menu's form picks the next take.
        QVERIFY(e.gestures()->runAction("referenceClipTake", {{"clipId", "a"}}));
        QCOMPARE(r->takeId(), QStringLiteral("t2"));
        QVERIFY(e.settled());
        // Match playhead returns to the sequence.
        r->matchPlayhead();
        QCOMPARE(r->takeId(), QString());
        QVERIFY(e.settled());
        QVERIFY(near(centre(r->image()), QColor(200, 40, 40)));
        // Ganging from a take shows the timeline at that same time, not the take's picture.
        QVERIFY(r->useTake("a", "t2"));
        QVERIFY(e.settled());
        QVERIFY(near(centre(r->image()), QColor(40, 190, 70)));
        QVERIFY(e.openPanel());
        r->setGanged(true);
        QCOMPARE(r->takeId(), QString());
        QTRY_VERIFY_WITH_TIMEOUT(near(centre(r->image()), QColor(200, 40, 40)), 60000);
        QVERIFY(e.settled());
        r->setGanged(false);
    }
    void panelDrivenWithRealEvents() {
        Editor e(twoShots());
        QVERIFY2(e.object, qPrintable(e.error));
        e.clock.seek(1500);
        QVERIFY(e.openPanel());
        auto* r = e.reference();
        // It starts at the playhead, with no action needed.
        QTRY_VERIFY_WITH_TIMEOUT(r->hasImage(), 60000);
        QCOMPARE(r->timeMs(), 1500.0);
        auto* image = e.item("referenceImage");
        QVERIFY(image);
        QVERIFY(image->isVisible());
        QTRY_COMPARE(image->property("image").value<QImage>().cacheKey(), r->image().cacheKey());

        e.click(e.item("referenceStepForward"));
        QCOMPARE(r->timeMs(), 46 * 1000.0 / 30);
        e.click(e.item("referenceStepBack"));
        e.click(e.item("referenceStepBack"));
        QCOMPARE(r->timeMs(), 44 * 1000.0 / 30);
        e.clock.seek(500);
        e.click(e.item("referenceMatchPlayhead"));
        QCOMPARE(r->timeMs(), 15 * 1000.0 / 30);
        e.click(e.item("referenceGang"));
        QVERIFY(r->ganged());
        QVERIFY(e.item("referenceGang")->property("active").toBool());
        e.clock.seek(1000);
        QTRY_COMPARE_WITH_TIMEOUT(r->imageTimeMs(), 1000.0, 60000);
        // A step parks it, and the button shows that.
        e.click(e.item("referenceStepBack"));
        QVERIFY(!r->ganged());
        QVERIFY(!e.item("referenceGang")->property("active").toBool());
        QVERIFY(e.settled());

        // Stale: the note and Refresh appear, and Refresh clears them.
        QVERIFY(!e.item("referenceRefresh")->isVisible());
        auto clips = e.model.clipsJson();
        auto first = clips[0].toObject();
        first.insert("mediaPath", m_green);
        clips.replace(0, first);
        e.model.commitEdit("Swap", e.model.clipsJson(), clips);
        QVERIFY(r->stale());
        auto* refresh = e.item("referenceRefresh");
        QTRY_VERIFY(refresh->isVisible());
        e.shot("panel-stale");
        QVERIFY(e.item("referenceStatusText")->property("text").toString().contains("timeline changed"));
        e.click(refresh);
        QVERIFY(e.settled());
        QVERIFY(!r->stale());
        QTRY_VERIFY(!e.item("referenceRefresh")->isVisible());
        e.shot("panel-picture");

        // Scopes of the parked frame, computed off the GUI thread, with no capture of their own.
        auto* scopes = e.item("referencePanel")->findChild<ScopesController*>("referenceScopes");
        QVERIFY(scopes);
        const int captures = r->capturesForTest();
        e.item("referencePanel")->setProperty("display", "scopes");
        QTRY_VERIFY_WITH_TIMEOUT(scopes->hasFrame(), 10000);
        QCOMPARE(scopes->frameTimeMs(), r->imageTimeMs());
        QVERIFY(scopes->lastComputeThreadForTest() != QThread::currentThreadId());
        QVERIFY(!scopes->waveform().isNull());
        QVERIFY(!image->isVisible());
        QVERIFY(e.item("referenceScopesGrid")->isVisible());
        QCOMPARE(r->capturesForTest(), captures);
        e.shot("panel-scopes");
        e.item("referencePanel")->setProperty("display", "picture");
    }
    void comparisonViewShowsTheReferenceBesideTheCurrentFrame() {
        Editor e(twoShots());
        QVERIFY2(e.object, qPrintable(e.error));
        e.clock.seek(500);
        auto* monitor = e.monitor();
        QVERIFY(monitor);
        const double whole = monitor->viewportSize().width();
        // Chosen from the wrench menu, with the mouse.
        e.click(e.item("monitorSettingsButton"));
        const auto named = [&](const QString& text) {
            std::function<QQuickItem*(QQuickItem*)> search = [&](QQuickItem* root) -> QQuickItem* {
                if (root->isVisible() && root->property("text").toString() == text && root->property("subMenu").isValid()) return root;
                for (auto* child : root->childItems()) {
                    if (auto* found = search(child)) return found;
                }
                return nullptr;
            };
            return search(e.window.contentItem());
        };
        QQuickItem* display = nullptr;
        QTRY_VERIFY((display = named("Display mode")) != nullptr);
        e.click(display);
        QVERIFY(e.waitFor("monitorDisplay_comparison"));
        e.click(e.item("monitorDisplay_comparison"));
        QCOMPARE(monitor->displayMode(), QStringLiteral("comparison"));
        QQuickItem* view = nullptr;
        QTRY_VERIFY((view = e.item("comparisonView")) != nullptr);
        auto* r = e.reference();
        QVERIFY(r->shownInView());
        // It starts at the playhead.
        QTRY_VERIFY_WITH_TIMEOUT(r->hasImage(), 60000);
        QCOMPARE(r->timeMs(), 15 * 1000.0 / 30);
        // The live picture keeps the right half.
        auto* frame = e.item("previewFrame");
        QVERIFY(frame->isVisible());
        QTRY_VERIFY(std::abs(monitor->viewportSize().width() - whole / 2) < 2);
        auto* area = e.item("comparisonReferenceArea");
        const auto left = area->mapToScene(QPointF(0, 0));
        const auto right = frame->mapToScene(QPointF(0, 0));
        QVERIFY2(right.x() >= left.x() + area->width() - 1, "The current frame is to the right of the reference");

        // The reference keeps its frame while the current frame moves.
        const auto key = r->image().cacheKey();
        e.clock.seek(1500);
        e.settle();
        QCOMPARE(r->image().cacheKey(), key);
        QCOMPARE(r->timeMs(), 15 * 1000.0 / 30);
        // The buttons step it.
        e.click(e.item("comparisonStepForward"));
        QCOMPARE(r->timeMs(), 16 * 1000.0 / 30);
        e.click(e.item("comparisonMatchPlayhead"));
        QCOMPARE(r->timeMs(), 1500.0);
        QVERIFY(e.settled());
        // Zoom applies to both sides.
        monitor->setZoomPercent(200);
        e.settle();
        auto* image = e.item("comparisonReferenceImage");
        QCOMPARE(image->width(), monitor->pictureRect().width());
        QCOMPARE(image->x(), monitor->pictureRect().x());
        monitor->setFit();

        monitor->setDisplayMode("composite");
        QTRY_VERIFY(e.item("comparisonView") == nullptr);
        QVERIFY(!r->shownInView());
    }
    void wrenchMenuAndClipMenuWithRealEvents() {
        Editor e(twoShots());
        QVERIFY2(e.object, qPrintable(e.error));
        auto* r = e.reference();
        e.clock.seek(1500);
        e.settle();
        e.click(e.item("monitorSettingsButton"));
        QVERIFY(e.waitFor("monitorSetReference"));
        e.click(e.item("monitorSetReference"));
        QCOMPARE(r->timeMs(), 1500.0);
        QVERIFY(e.settled());
        // The panel comes forward, since nothing else shows the frame.
        QTRY_VERIFY(e.item("referencePanel")->isVisible());
        QVERIFY(r->hasImage());
        QTRY_VERIFY(e.item("referenceImage")->isVisible());

        // Back to the Timeline, for its clip menu.
        e.store()->dispatch({{"type", "activate"}, {"panelId", "tracks"}});
        QVERIFY(e.waitFor("clip-b"));
        auto* clip = e.item("clip-b");
        QTest::mouseClick(&e.window, Qt::RightButton, Qt::NoModifier, clip->mapToScene(QPointF(clip->width() / 2, clip->height() / 2)).toPoint());
        e.settle();
        QQuickItem* entry = nullptr;
        const auto findEntry = [&](const QString& text) {
            std::function<QQuickItem*(QQuickItem*)> search = [&](QQuickItem* root) -> QQuickItem* {
                if (root->property("text").toString() == text && root->isVisible()) return root;
                for (auto* child : root->childItems()) {
                    if (auto* found = search(child)) return found;
                }
                return nullptr;
            };
            return search(e.window.contentItem());
        };
        QTRY_VERIFY((entry = findEntry("Use as reference")) != nullptr);
        e.click(entry);
        QTRY_VERIFY((entry = findEntry("Last frame")) != nullptr);
        e.settle();
        e.click(entry);
        QCOMPARE(r->timeMs(), 59 * 1000.0 / 30);
        QCOMPARE(r->description(), QStringLiteral("Last frame of b"));
        QVERIFY(e.settled());
        QVERIFY(near(centre(r->image()), QColor(40, 60, 200)));
        QTRY_VERIFY(e.item("referencePanel")->isVisible());
    }
    void takeSelectorWithRealEvents() {
        auto shot = clipJson("a", 0, 1000, m_red, QJsonArray{successfulTake("t1", "asset-a"), successfulTake("t2", "asset-b", "Close-up")});
        shot.insert("activeTakeId", "t1");
        Editor e(documentOf({shot}));
        QVERIFY2(e.object, qPrintable(e.error));
        auto* r = e.reference();
        r->setTakeMediaResolverForTest([&](const QString&, const QJsonObject&) {
            nt::Clip media;
            media.mediaPath = m_green.toStdString();
            media.originalMediaPath = m_green.toStdString();
            return media;
        });
        e.clock.seek(500);
        QVERIFY(e.openPanel());
        QVERIFY(e.settled());
        auto* select = e.item("referenceTake");
        QVERIFY(select);
        QVERIFY2(!select->isVisible(), "With no clip selected there is no take to offer");
        e.gestures()->setSelection({"a"});
        QVERIFY(e.waitFor("referenceTake"));
        e.click(select);
        QQuickItem* option = nullptr;
        const auto findOption = [&] {
            std::function<QQuickItem*(QQuickItem*)> search = [&](QQuickItem* root) -> QQuickItem* {
                if (root != select && root->property("text").toString() == "Close-up" && root->isVisible() && root->inherits("QQuickAbstractButton")) return root;
                for (auto* child : root->childItems()) {
                    if (auto* found = search(child)) return found;
                }
                return nullptr;
            };
            return search(e.window.contentItem());
        };
        QTRY_VERIFY((option = findOption()) != nullptr);
        e.click(option);
        QCOMPARE(r->takeId(), QStringLiteral("t2"));
        QVERIFY(e.settled());
        QVERIFY2(near(centre(r->image()), QColor(40, 190, 70)), qPrintable(r->error()));
        QCOMPARE(e.item("referenceStatusText")->property("text").toString(), QStringLiteral("Close-up, a"));
        e.shot("panel-take");
    }
    void timelineWithNothingOnItNeedsNoCapture() {
        Editor e(documentOf({}));
        QVERIFY2(e.object, qPrintable(e.error));
        QVERIFY(e.openPanel());
        auto* r = e.reference();
        QTRY_VERIFY(r->hasReference());
        QCOMPARE(r->capturesForTest(), 0);
        QVERIFY(!r->hasImage());
        QVERIFY(e.item("referenceMessage")->property("text").toString().contains("Add a clip"));
        e.shot("panel-empty");
        // The first clip brings the first picture.
        auto clips = e.model.clipsJson();
        clips.append(clipJson("a", 0, 1000, m_red));
        e.model.commitEdit("Add", e.model.clipsJson(), clips);
        QTRY_VERIFY_WITH_TIMEOUT(r->hasImage(), 60000);
        QVERIFY(!r->stale());
        QVERIFY(e.settled());
        // Removing it leaves a stale note, and Refresh shows the empty state again.
        e.model.commitEdit("Remove", e.model.clipsJson(), QJsonArray{});
        QVERIFY(r->stale());
        r->refresh();
        QVERIFY(!r->stale());
        QVERIFY(!r->hasImage());
        QVERIFY(!r->hasContent());
    }
    // Last, because it leaves the process in server mode.
    void takeMediaComesFromTheServer() {
        TestHttpServer server;
        QFile green(m_green);
        QVERIFY(green.open(QIODevice::ReadOnly));
        const auto bytes = green.readAll();
        server.setFile("/storage/take.png", ServedFile(bytes));
        server.setJson([&](const QByteArray&, const QUrl&) {
            const QJsonObject asset{{"id", "asset-b"}, {"name", "take.png"}, {"content_type", "image/png"}, {"size", bytes.size()},
                {"get_url", "/storage/take.png"}, {"updated_at", "2026-01-01T00:00:00Z"}};
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", asset}}}}).toJson(QJsonDocument::Compact);
        });
        QByteArray program("tst"), serverFlag("--server"), url(server.base().toString().toUtf8()), timelineFlag("--timeline"), timeline("t"),
            cacheFlag("--cache-dir"), cache(m_dir.filePath("cache").toUtf8());
        char* argv[] = {program.data(), serverFlag.data(), url.data(), timelineFlag.data(), timeline.data(), cacheFlag.data(), cache.data(), nullptr};
        int argc = 7;
        QCOMPARE(nt::server::takeServerArgs(argc, argv), 0);
        auto shot = clipJson("a", 0, 1000, m_red, QJsonArray{successfulTake("t1", "asset-a"), successfulTake("t2", "asset-b", "Close-up")});
        shot.insert("activeTakeId", "t1");
        Editor e(documentOf({shot}));
        QVERIFY2(e.object, qPrintable(e.error));
        auto* r = e.reference();
        e.clock.seek(500);
        QVERIFY(r->useTake("a", "t2"));
        QVERIFY(e.settled());
        QVERIFY2(r->hasImage(), qPrintable(r->error()));
        QVERIFY2(near(centre(r->image()), QColor(40, 190, 70)), qPrintable(centre(r->image()).name()));
        QVERIFY(r->error().isEmpty());
    }
};

QTEST_MAIN(ReferenceTest)
#include "tst_reference.moc"
