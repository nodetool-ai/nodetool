// The Program monitor's view controls through the mounted editor, with real pointer and key events.
#include "app/MenuRegistry.h"
#include "ui/MonitorViewRegistry.h"
#include "ui/MonitorViewState.h"
#include "wiring/WiringFixture.h"
#include "edit/sourceEdit/SourceViewerState.h"
#include "preview/gizmo/TransformGizmoController.h"
#include "preview/PreviewCompositor.h"

#include <QNativeGestureEvent>
#include <QQmlEngine>
#include <QPointingDevice>
#include <QSignalSpy>
#include <QStyleHints>
#include <QWheelEvent>
#include <qpa/qwindowsysteminterface.h>

namespace {
const bool views = [] {
    nt::ui::registerMonitorView({"testView", QUrl("qrc:/monitor-test/tests_qml/TestMonitorView.qml"), 50, "Test view"});
    nt::ui::registerMonitorView({"testPictureView", QUrl("qrc:/monitor-test/tests_qml/TestMonitorPictureView.qml"), 51, "Test picture view"});
    nt::ui::registerMonitorView({"testBrokenView", QUrl("qrc:/monitor-test/tests_qml/DoesNotExist.qml"), 52, "Test broken view"});
    return true;
}();
const QPointingDevice* touchpad() {
    static const QPointingDevice* device = [] {
        // native-rules #2: naked new QPointingDevice with no parent, never freed
        auto* d = new QPointingDevice("tst touchpad", 7001, QInputDevice::DeviceType::TouchPad,
            QPointingDevice::PointerType::Finger, QInputDevice::Capability::Position, 2, 0);
        QWindowSystemInterface::registerInputDevice(d);
        return d;
    }();
    return device;
}
}

class TestMonitorUi : public WiringFixture {
    Q_OBJECT
    MonitorViewState* monitor() const { return qobject_cast<MonitorViewState*>(view->rootObject()->findChild<QObject*>("monitorViewState")); }
    QQuickItem* frame() const { return item("previewFrame"); }
    QQuickItem* box() const { return item("monitorPictureBox"); }
    PreviewCompositor* compositor() const { return qobject_cast<PreviewCompositor*>(item("previewCompositor")); }
    QQuickItem* timecode() const { return item("transportTimecode"); }
    QQuickItem* editor(QQuickItem* field) const { return named(field, "timecodeEditor"); }
    void settle() { QCoreApplication::processEvents(); QTest::qWait(1); }
    QPoint scene(QQuickItem* target, QPointF local) const { return target->mapToScene(local).toPoint(); }
    void wheelAt(QPoint at, int angle) {
        QWheelEvent event(at, view->mapToGlobal(at), QPoint(), QPoint(0, angle), Qt::NoButton, Qt::NoModifier, Qt::NoScrollPhase, false);
        QCoreApplication::sendEvent(view.get(), &event);
        settle();
    }
    void pinchAt(QPoint at, double value) {
        QNativeGestureEvent begin(Qt::BeginNativeGesture, touchpad(), 2, at, at, view->mapToGlobal(at), 0, {}, 0);
        QCoreApplication::sendEvent(view.get(), &begin);
        QNativeGestureEvent zoom(Qt::ZoomNativeGesture, touchpad(), 2, at, at, view->mapToGlobal(at), value, {}, 0);
        QCoreApplication::sendEvent(view.get(), &zoom);
        QNativeGestureEvent end(Qt::EndNativeGesture, touchpad(), 2, at, at, view->mapToGlobal(at), 0, {}, 0);
        QCoreApplication::sendEvent(view.get(), &end);
        settle();
    }
    void pointerDrag(Qt::MouseButton button, QPoint from, QPoint to) {
        QTest::mouseMove(view.get(), from);
        QTest::mousePress(view.get(), button, Qt::NoModifier, from);
        const QPoint middle = (from + to) / 2;
        QTest::mouseMove(view.get(), middle, 5);
        QTest::mouseMove(view.get(), to, 5);
        QTest::mouseRelease(view.get(), button, Qt::NoModifier, to);
        settle();
    }
    void clickItem(QQuickItem* target) {
        QVERIFY(target);
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(target));
        settle();
    }
    QQuickItem* namedText(QQuickItem* root, const QString& text) const {
        if (root->isVisible() && root->property("text").toString() == text && root->property("subMenu").isValid()) { return root; }
        for (auto* child : root->childItems()) {
            if (auto* found = namedText(child, text)) { return found; }
        }
        return nullptr;
    }
    // Opens the wrench menu and returns once the named item (optionally in a submenu) can be clicked.
    void openSettings(const QString& submenu = {}) {
        clickItem(item("monitorSettingsButton"));
        QTRY_VERIFY(item("monitorSettingsMenu") == nullptr || view->contentItem());
        if (!submenu.isEmpty()) {
            QQuickItem* entry = nullptr;
            QTRY_VERIFY((entry = namedText(view->contentItem(), submenu)) != nullptr);
            clickItem(entry);
        }
        settle();
    }
    void chooseSetting(const QString& name, const QString& submenu = {}) {
        openSettings(submenu);
        QQuickItem* target = nullptr;
        QTRY_VERIFY2((target = item(name)) != nullptr && target->isVisible() && target->width() > 0, qPrintable(name));
        clickItem(target);
    }
    void typeInto(QQuickItem* field, const QString& text) {
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(field));
        settle();
        auto* input = editor(field);
        QVERIFY(input);
        QTRY_VERIFY(input->hasActiveFocus());
        QCOMPARE(input->property("text").toString(), field->property("text").toString());
        for (const QChar c : text) { QTest::keyClick(view.get(), c.toLatin1()); }
        settle();
    }
    void useDocument(const char* json) {
        auto parsed = nt::parseTimelineJson(json);
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        settle();
    }
    // The transform handles need a clip with known dimensions under the playhead.
    void useSizedClip() {
        useDocument(R"({"name":"F","fps":30,"width":640,"height":360,"durationMs":10000,
          "tracks":[{"id":"v","name":"V","type":"video","index":0,"heightPx":80,"visible":true,"locked":false}],
          "clips":[{"id":"c","trackId":"v","name":"S","mediaType":"image","startMs":1000,"durationMs":2000,"width":640,"height":360}]})");
        clock.seek(1500);
        gestures()->viewState()->flush();
        settle();
    }
    // The point of the canvas under a scene position.
    QPointF canvasAt(QPoint at) const {
        const QPointF local = frame()->mapFromScene(at);
        return {local.x() / frame()->width() * model.canvasWidth(), local.y() / frame()->height() * model.canvasHeight()};
    }

private slots:
    void init() { open(300); QVERIFY(monitor()); QVERIFY(compositor()); monitor()->setFit(); }
    void cleanup() { view.reset(); }

    void timecodeForms() {
        typeInto(timecode(), "115");
        QTest::keyClick(view.get(), Qt::Key_Return);
        settle();
        QCOMPARE(clock.time(), 1500.0);
        QVERIFY(!editor(timecode())->isVisible());
        typeInto(timecode(), "00:00:02:15");
        QTest::keyClick(view.get(), Qt::Key_Enter);
        settle();
        QCOMPARE(clock.time(), 2500.0);
        typeInto(timecode(), "+10");
        QTest::keyClick(view.get(), Qt::Key_Return);
        settle();
        QCOMPARE(qRound(clock.time()), 2833);
        typeInto(timecode(), "-5");
        QTest::keyClick(view.get(), Qt::Key_Return);
        settle();
        QCOMPARE(qRound(clock.time()), 2667);
    }
    void timecodeClampsToContent() {
        const double end = model.contentEndMs();
        typeInto(timecode(), "5:00:00");
        QTest::keyClick(view.get(), Qt::Key_Return);
        settle();
        QCOMPARE(clock.time(), end);
        typeInto(timecode(), "-999999");
        QTest::keyClick(view.get(), Qt::Key_Return);
        settle();
        QCOMPARE(clock.time(), 0.0);
    }
    void invalidTextNeverSeeks() {
        const double before = clock.time();
        typeInto(timecode(), "abc");
        auto* input = editor(timecode());
        QVERIFY(!input->property("valid").toBool());
        QTest::keyClick(view.get(), Qt::Key_Return);
        settle();
        QCOMPARE(clock.time(), before);
        QVERIFY2(input->isVisible(), "Invalid text stays open for correction");
        QTest::keyClick(view.get(), Qt::Key_Escape);
        settle();
        QVERIFY(!input->isVisible());
        QCOMPARE(clock.time(), before);
    }
    void invalidTextLeavesOnFocusLoss() {
        const double before = clock.time();
        typeInto(timecode(), "1:x");
        clickItem(item("monitorZoomButton"));
        QTest::keyClick(view.get(), Qt::Key_Escape);
        settle();
        QVERIFY(!editor(timecode())->isVisible());
        QCOMPARE(clock.time(), before);
    }
    void escapeRestores() {
        const double before = clock.time();
        typeInto(timecode(), "200");
        QTest::keyClick(view.get(), Qt::Key_Escape);
        settle();
        QVERIFY(!editor(timecode())->isVisible());
        QCOMPARE(clock.time(), before);
    }
    void unchangedEnterKeepsTheExactTime() {
        useDocument(R"({"name":"F","fps":29.97,"width":640,"height":360,"durationMs":100000,
          "tracks":[{"id":"v","name":"V","type":"video","index":0,"heightPx":80,"visible":true,"locked":false}],
          "clips":[{"id":"c","trackId":"v","name":"S","mediaType":"image","startMs":0,"durationMs":100000}]})");
        for (const double time : {1001.0, 12345.678, 33366.7, 66000.0}) {
            clock.seek(time);
            settle();
            const double shown = clock.time();
            const QString text = timecode()->property("text").toString();
            typeInto(timecode(), {});
            QTest::keyClick(view.get(), Qt::Key_Return);
            settle();
            QCOMPARE(clock.time(), shown);
            // Retyping the same frame lands on that frame's start, and the display is unchanged.
            typeInto(timecode(), text);
            QTest::keyClick(view.get(), Qt::Key_Return);
            settle();
            QCOMPARE(timecode()->property("text").toString(), text);
        }
    }
    void keysTheFieldIgnoresDoNotReachTheEditor() {
        useSizedClip();
        click("clip-c");
        settle();
        const auto before = model.documentJson();
        const double time = clock.time();
        typeInto(timecode(), "1");
        QTest::keyClick(view.get(), Qt::Key_Home);
        // Left at the start of the text, and the keys that seek between cuts.
        for (const auto key : {Qt::Key_Left, Qt::Key_Left, Qt::Key_Up, Qt::Key_Down, Qt::Key_PageUp}) {
            QTest::keyClick(view.get(), key);
            settle();
        }
        QCOMPARE(model.documentJson(), before);
        QCOMPARE(clock.time(), time);
        QVERIFY(editor(timecode())->isVisible());
        QTest::keyClick(view.get(), Qt::Key_Escape);
        settle();
        QCOMPARE(clock.time(), time);
    }
    void dropFrameDisplayAndEntry() {
        useDocument(R"({"name":"F","fps":29.97,"dropFrame":true,"width":640,"height":360,"durationMs":100000,
          "tracks":[{"id":"v","name":"V","type":"video","index":0,"heightPx":80,"visible":true,"locked":false}],
          "clips":[{"id":"c","trackId":"v","name":"S","mediaType":"image","startMs":0,"durationMs":100000}]})");
        clock.seek(0);
        settle();
        QCOMPARE(timecode()->property("text").toString(), QString("00;00;00;00"));
        typeInto(timecode(), "00;01;00;02");
        QTest::keyClick(view.get(), Qt::Key_Return);
        settle();
        QCOMPARE(timecode()->property("text").toString(), QString("00;01;00;02"));
        QCOMPARE(qRound(clock.time() * 29.97 / 1000), 1800);
    }
    void dragScrubsByFrames() {
        clock.seek(1000);
        settle();
        const auto before = model.documentJson();
        const QPoint from = center(timecode());
        // The scrub starts past the platform's drag distance, 10 px by default and 8 px on GTK.
        const int dx = QGuiApplication::styleHints()->startDragDistance() + 2;
        pointerDrag(Qt::LeftButton, from, from + QPoint(dx, 0));
        QVERIFY(!editor(timecode())->isVisible());
        QCOMPARE(qRound(clock.time() * 30 / 1000), 30 + dx);
        QCOMPARE(model.documentJson(), before);
        QCOMPARE(model.undoStack()->count(), 0);
    }
    void escapeCancelsAScrub() {
        clock.seek(1000);
        settle();
        const QPoint from = center(timecode());
        QTest::mouseMove(view.get(), from);
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::NoModifier, from);
        QTest::mouseMove(view.get(), from + QPoint(12, 0), 5);
        QVERIFY(clock.time() > 1000);
        QTest::keyClick(view.get(), Qt::Key_Escape);
        settle();
        QCOMPARE(clock.time(), 1000.0);
        QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::NoModifier, from + QPoint(12, 0));
        settle();
        QVERIFY2(!editor(timecode())->isVisible(), "The release after Escape must not open the editor");
        QCOMPARE(clock.time(), 1000.0);
    }
    void wheelZoomAnchorsOnThePointer() {
        const auto before = model.documentJson();
        const QPoint at = scene(frame(), {frame()->width() * 0.7, frame()->height() * 0.3});
        monitor()->setZoomPercent(200);
        settle();
        const QPointF anchor = canvasAt(at);
        for (int i = 0; i < 4; ++i) {
            wheelAt(at, 120);
            const QPointF now = canvasAt(at);
            QVERIFY2(QLineF(now, anchor).length() < 1.5, qPrintable(QString("%1,%2").arg(now.x()).arg(now.y())));
        }
        QVERIFY(monitor()->zoom() > 2.8);
        wheelAt(at, -120);
        QVERIFY(!monitor()->fit());
        QCOMPARE(model.documentJson(), before);
        QCOMPARE(model.undoStack()->count(), 0);
    }
    void wheelFromFitLeavesFit() {
        QVERIFY(monitor()->fit());
        wheelAt(center(box()), 120);
        QVERIFY(!monitor()->fit());
    }
    void pinchZooms() {
        monitor()->setZoomPercent(100);
        settle();
        const double before = monitor()->zoom();
        pinchAt(center(box()), 0.5);
        QVERIFY2(monitor()->zoom() > before * 1.2, qPrintable(QString::number(monitor()->zoom())));
    }
    void middleDragPans() {
        monitor()->setZoomPercent(800);
        settle();
        const QPointF was = frame()->position();
        pointerDrag(Qt::MiddleButton, center(box()), center(box()) + QPoint(40, -30));
        QCOMPARE(frame()->position() - was, QPointF(40, -30));
    }
    void middleDragAtFitDoesNothing() {
        const QPointF was = frame()->position();
        pointerDrag(Qt::MiddleButton, center(box()), center(box()) + QPoint(40, -30));
        QCOMPARE(frame()->position(), was);
    }
    void handToolPans() {
        monitor()->setZoomPercent(800);
        settle();
        gestures()->setActiveTool("hand");
        settle();
        const QPointF was = frame()->position();
        pointerDrag(Qt::LeftButton, center(box()), center(box()) + QPoint(-25, 20));
        QCOMPARE(frame()->position() - was, QPointF(-25, 20));
        gestures()->setActiveTool("select");
    }
    void fitResetsZoomAndPan() {
        const QRectF fit = monitor()->pictureRect();
        monitor()->setZoomPercent(800);
        settle();
        pointerDrag(Qt::MiddleButton, center(box()), center(box()) + QPoint(40, -30));
        clickItem(item("monitorZoomButton"));
        QQuickItem* fitItem = nullptr;
        QTRY_VERIFY((fitItem = item("monitorZoom_fit")) && fitItem->isVisible());
        clickItem(fitItem);
        QVERIFY(monitor()->fit());
        QCOMPARE(monitor()->pan(), QPointF());
        QCOMPARE(monitor()->property("pictureRect").toRectF(), fit);
    }
    void zoomMenuPicksALevel() {
        clickItem(item("monitorZoomButton"));
        QQuickItem* entry = nullptr;
        QTRY_VERIFY((entry = item("monitorZoom_400")) && entry->isVisible());
        clickItem(entry);
        QCOMPARE(monitor()->zoom(), 4.0);
        QCOMPARE(frame()->width(), 640.0 * 4 / view->effectiveDevicePixelRatio());
        QCOMPARE(item("monitorZoomButton")->property("text").toString(), QString("400%"));
    }
    void compositorCoversOnlyTheVisiblePart() {
        monitor()->setZoomPercent(1600);
        settle();
        auto* item_ = static_cast<QQuickItem*>(compositor());
        QVERIFY(item_->width() <= box()->width() + 1);
        QVERIFY(item_->height() <= box()->height() + 1);
        QVERIFY(frame()->width() > box()->width() * 2);
        const QRectF region = compositor()->property("canvasRegion").toRectF();
        QVERIFY(region.width() < 1);
        QCOMPARE(region, monitor()->property("visibleCanvasRect").toRectF());
        auto* gizmo = qobject_cast<TransformGizmoController*>(item("transformGizmo"));
        QVERIFY(gizmo);
        QVERIFY2(gizmo->width() <= box()->width() + 1, "A painted overlay must not allocate the whole zoomed picture");
    }
    void gizmoHitTestingAndDragFollowZoomAndPan() {
        useSizedClip();
        click("clip-c");
        auto* gizmo = qobject_cast<TransformGizmoController*>(item("transformGizmo"));
        QVERIFY(gizmo);
        QTRY_VERIFY(gizmo->available());
        monitor()->setZoomPercent(150);
        settle();
        pointerDrag(Qt::MiddleButton, center(box()), center(box()) + QPoint(15, 10));
        QTRY_VERIFY(gizmo->isVisible());
        // Off the pivot, which sits at the centre and has its own drag.
        const QPointF inFrame = gizmo->box().center + QPointF(60, 40);
        const QPoint at = frame()->mapToScene(inFrame).toPoint();
        QVERIFY(box()->contains(box()->mapFromScene(at)));
        QVERIFY(gizmo->contains(gizmo->mapFromScene(at)));
        const auto undoBefore = model.undoStack()->count();
        const auto before = clip("c");
        const double scale = frame()->width() / model.canvasWidth();
        pointerDrag(Qt::LeftButton, at, at + QPoint(30, 12));
        QCOMPARE(model.undoStack()->count(), undoBefore + 1);
        const auto position = clip("c").value("transform").toObject().value("position").toObject();
        // The drag moves the clip by the screen distance in canvas pixels, whatever the zoom.
        QVERIFY2(std::abs(position.value("x").toDouble() - 30 / scale) < 2, qPrintable(QString::number(position.value("x").toDouble())));
        QVERIFY2(std::abs(position.value("y").toDouble() - 12 / scale) < 2, qPrintable(QString::number(position.value("y").toDouble())));
        QVERIFY(before != clip("c"));
    }
    void showControlsHidesHandlesWithoutTouchingTheDocument() {
        useSizedClip();
        click("clip-c");
        auto* gizmo = qobject_cast<TransformGizmoController*>(item("transformGizmo"));
        QVERIFY(gizmo);
        QTRY_VERIFY(gizmo->available());
        const auto before = model.documentJson();
        const auto undo = model.undoStack()->count();
        chooseSetting("monitorShowControls");
        QVERIFY(!monitor()->showControls());
        QVERIFY(!gizmo->isVisible());
        const QPoint at = frame()->mapToScene(gizmo->box().center).toPoint();
        pointerDrag(Qt::LeftButton, at, at + QPoint(30, 12));
        QCOMPARE(model.documentJson(), before);
        QCOMPARE(model.undoStack()->count(), undo);
        chooseSetting("monitorShowControls");
        QVERIFY(monitor()->showControls());
        QVERIFY(gizmo->isVisible());
    }
    void resolutionMenusDriveTheCompositor() {
        chooseSetting("monitorPlaybackResolution_4", "Playback resolution");
        QCOMPARE(monitor()->playbackResolution(), 4);
        QCOMPARE(compositor()->property("playbackResolution").toInt(), 4);
        chooseSetting("monitorPausedResolution_2", "Paused resolution");
        QCOMPARE(monitor()->pausedResolution(), 2);
        QCOMPARE(compositor()->property("pausedResolution").toInt(), 2);
    }
    void overlaysAreViewState() {
        const auto before = model.documentJson();
        chooseSetting("monitorSafeMarginsItem");
        QTRY_VERIFY(item("monitorSafeMargins"));
        QCOMPARE(item("monitorSafeMargins")->size(), frame()->size());
        chooseSetting("monitorTransparencyGrid");
        QVERIFY(compositor()->property("transparencyGrid").toBool());
        chooseSetting("monitorDisplay_alpha", "Display mode");
        QVERIFY(compositor()->property("alphaDisplay").toBool());
        chooseSetting("monitorDisplay_composite", "Display mode");
        QVERIFY(!compositor()->property("alphaDisplay").toBool());
        QCOMPARE(model.documentJson(), before);
        QCOMPARE(model.undoStack()->count(), 0);
    }
    void guidesDragOutMoveLockAndClear() {
        chooseSetting("monitorShowRulers");
        QTRY_VERIFY(item("monitorRulerTop"));
        auto* top = item("monitorRulerTop");
        auto* left = item("monitorRulerLeft");
        QVERIFY(left);
        const QPoint target = frame()->mapToScene({frame()->width() / 2, frame()->height() / 2}).toPoint();
        pointerDrag(Qt::LeftButton, center(top), target);
        QCOMPARE(monitor()->guides().size(), 1);
        QCOMPARE(monitor()->guides().at(0).toMap().value("vertical").toBool(), false);
        QVERIFY(std::abs(monitor()->guides().at(0).toMap().value("position").toDouble() - 180) < 2);
        pointerDrag(Qt::LeftButton, center(left), target + QPoint(40, 0));
        QCOMPARE(monitor()->guides().size(), 2);
        QCOMPARE(monitor()->guides().at(1).toMap().value("vertical").toBool(), true);
        // Move the vertical one with a real drag.
        QTRY_VERIFY(item("monitorGuide_1"));
        const double was = monitor()->guides().at(1).toMap().value("position").toDouble();
        pointerDrag(Qt::LeftButton, target + QPoint(40, 60), target + QPoint(90, 60));
        QVERIFY(monitor()->guides().at(1).toMap().value("position").toDouble() > was + 10);
        // Locked guides ignore the pointer.
        chooseSetting("monitorLockGuides");
        QVERIFY(monitor()->guidesLocked());
        const double locked = monitor()->guides().at(1).toMap().value("position").toDouble();
        pointerDrag(Qt::LeftButton, target + QPoint(90, 60), target + QPoint(20, 60));
        QCOMPARE(monitor()->guides().at(1).toMap().value("position").toDouble(), locked);
        chooseSetting("monitorLockGuides");
        // A drag out of the picture removes it.
        auto* moved = item("monitorGuide_1");
        pointerDrag(Qt::LeftButton, center(moved), center(left));
        QTRY_COMPARE(monitor()->guides().size(), 1);
        chooseSetting("monitorClearGuides");
        QCOMPARE(monitor()->guides().size(), 0);
        QCOMPARE(model.undoStack()->count(), 0);
    }
    void rulerReleaseOffThePictureAddsNothing() {
        chooseSetting("monitorShowRulers");
        QTRY_VERIFY(item("monitorRulerTop"));
        pointerDrag(Qt::LeftButton, center(item("monitorRulerTop")), center(item("transportBar")));
        QCOMPARE(monitor()->guides().size(), 0);
    }
    void registeredMonitorViewAppearsWithoutSharedEdits() {
        chooseSetting("monitorDisplay_testView", "Display mode");
        QCOMPARE(monitor()->displayMode(), QString("testView"));
        QQuickItem* shown = nullptr;
        QTRY_VERIFY((shown = item("testMonitorView")) != nullptr);
        QCOMPARE(shown->property("timeline").value<QObject*>(), &model);
        QCOMPARE(shown->property("clock").value<QObject*>(), &clock);
        QCOMPARE(shown->property("monitor").value<QObject*>(), monitor());
        QVERIFY2(!frame()->isVisible(), "The picture is hidden unless the view keeps it");
        chooseSetting("monitorDisplay_composite", "Display mode");
        QTRY_VERIFY(item("testMonitorView") == nullptr);
        QVERIFY(frame()->isVisible());
    }
    void monitorViewCanKeepThePictureInPart() {
        const double whole = monitor()->property("viewportSize").toSizeF().width();
        monitor()->setDisplayMode("testPictureView");
        QTRY_VERIFY(item("testMonitorPictureView"));
        QTRY_VERIFY(frame()->isVisible());
        QCOMPARE(monitor()->property("viewportSize").toSizeF().width(), whole / 2);
        QVERIFY(box()->x() >= whole / 2 - 1);
        monitor()->setDisplayMode("composite");
        QTRY_COMPARE(monitor()->property("viewportSize").toSizeF().width(), whole);
    }
    void brokenMonitorViewReturnsToComposite() {
        QTest::ignoreMessage(QtWarningMsg, QRegularExpression(".*"));
        monitor()->setDisplayMode("testBrokenView");
        QTRY_COMPARE(monitor()->displayMode(), QString("composite"));
        QVERIFY(frame()->isVisible());
    }
    // Grabs the chrome for a look. The software backend has no compositor, so the picture itself
    // comes from --screenshot --monitor-state.
    void shotsForReview() {
        const QString dir = qEnvironmentVariable("NT_MONITOR_SHOT_DIR");
        if (dir.isEmpty()) { QSKIP("NT_MONITOR_SHOT_DIR is not set"); }
        view->grabWindow().save(dir + "/fit.png");
        typeInto(timecode(), "abc");
        view->grabWindow().save(dir + "/timecode-invalid.png");
        QTest::keyClick(view.get(), Qt::Key_Escape);
        settle();
        clickItem(item("monitorZoomButton"));
        QTest::qWait(300);
        view->grabWindow().save(dir + "/zoom-menu.png");
        QTest::keyClick(view.get(), Qt::Key_Escape);
        settle();
        openSettings("Display mode");
        QTest::qWait(300);
        view->grabWindow().save(dir + "/settings-menu.png");
        QTest::keyClick(view.get(), Qt::Key_Escape);
        QTest::keyClick(view.get(), Qt::Key_Escape);
        settle();
        monitor()->setRulers(true);
        monitor()->setSafeMargins(true);
        monitor()->addGuide(true, 320);
        monitor()->addGuide(false, 90);
        monitor()->setZoomPercent(75);
        settle();
        view->grabWindow().save(dir + "/overlays.png");
        view->resize(1280, 720);
        settle();
        view->grabWindow().save(dir + "/small-window.png");
    }
    void viewMenuReachesTheMonitor() {
        const auto entries = nt::app::shellMenuEntries("View");
        const auto entry = [&](const QString& action) {
            return *std::find_if(entries.begin(), entries.end(), [&](const auto& e) { return e.action == action; });
        };
        const QVariantMap context;
        QVERIFY(entry("monitorZoom200").run(context));
        QCOMPARE(monitor()->zoom(), 2.0);
        QVERIFY(entry("monitorZoom200").checked(context));
        QVERIFY(entry("monitorZoomFit").run(context));
        QVERIFY(monitor()->fit());
        QVERIFY(entry("monitorPlaybackResolution2").run(context));
        QCOMPARE(monitor()->playbackResolution(), 2);
        QVERIFY(entry("monitorDisplay:testView").run(context));
        QCOMPARE(monitor()->displayMode(), QString("testView"));
        QVERIFY(entry("monitorDisplayComposite").run(context));
        QVERIFY(entry("monitorRulers").run(context));
        QVERIFY(monitor()->rulers());
        QVERIFY(!entry("monitorClearGuides").enabled(context));
        // A second monitor, as a second editor would have, does not take this editor's menu actions.
        MonitorViewState other;
        QCOMPARE(MonitorViewState::current(), &other);
        const QVariantMap ours{{"gestures", QVariant::fromValue<QObject*>(gestures())}};
        QCOMPARE(MonitorViewState::forOwner(gestures()), monitor());
        QVERIFY(entry("monitorZoom400").run(ours));
        QCOMPARE(monitor()->zoom(), 4.0);
        QVERIFY(other.fit());
    }
    void timecodeRulerFromTheMenu() {
        const auto before = gestures()->viewState()->rulerMode();
        QVERIFY(gestures()->runAction("toggleTimecodeRuler", {}));
        QCOMPARE(gestures()->viewState()->rulerMode(), QString("timecode"));
        auto* canvas = item("rulerCanvas");
        QVERIFY(canvas);
        const auto ticks = canvas->property("ticks").toList();
        QVERIFY(!ticks.isEmpty());
        bool labelled = false;
        for (const auto& tick : ticks) {
            const auto label = tick.toMap().value("label").toString();
            if (label.isEmpty()) { continue; }
            QVERIFY2(QRegularExpression("^\\d\\d:\\d\\d:\\d\\d:\\d\\d$").match(label).hasMatch(), qPrintable(label));
            labelled = true;
        }
        QVERIFY(labelled);
        QVERIFY(gestures()->runAction("toggleTimecodeRuler", {}));
        QCOMPARE(gestures()->viewState()->rulerMode(), before);
    }
    void sourceMonitorUsesTheField() {
        view->resize(1800, 1200);
        auto* state = view->engine()->singletonInstance<SourceViewerState*>("NodeTool.Timeline", "SourceViewerState");
        QVERIFY(state);
        state->setAsset(QJsonObject{{"id", "source-1"}, {"name", "Source"}, {"content_type", "video/mp4"}, {"duration", 20}}.toVariantMap());
        settle();
        QQuickItem* source = nullptr;
        QTRY_VERIFY((source = item("sourceViewer")) != nullptr);
        QTRY_VERIFY(source->isVisible() && source->height() > 0);
        QQuickItem* field = nullptr;
        QTRY_VERIFY((field = named(source, "sourceTimecode")) != nullptr);
        QTRY_VERIFY(field->isVisible() && field->height() > 0);
        const double clockBefore = clock.time();
        typeInto(field, "115");
        QTest::keyClick(view.get(), Qt::Key_Return);
        settle();
        QCOMPARE(source->property("playerTimeMs").toDouble(), 1500.0);
        QCOMPARE(clock.time(), clockBefore);
        QCOMPARE(field->property("text").toString(), QString("00:00:01:15"));
        QVERIFY(named(source, "sourceRateNote")->isVisible());
        // A source that reports its rate counts frames at that rate, not the sequence's.
        state->setAsset(QJsonObject{{"id", "source-2"}, {"name", "Source"}, {"content_type", "video/mp4"}, {"duration", 20}, {"fps", 25}}.toVariantMap());
        settle();
        QTRY_VERIFY(!named(source, "sourceRateNote")->isVisible());
        typeInto(field, "00:00:00:24");
        QTest::keyClick(view.get(), Qt::Key_Return);
        settle();
        QCOMPARE(source->property("playerTimeMs").toDouble(), 960.0);
        QCOMPARE(field->property("fps").toDouble(), 25.0);
        if (const QString dir = qEnvironmentVariable("NT_MONITOR_SHOT_DIR"); !dir.isEmpty()) {
            state->setAsset(QJsonObject{{"id", "source-3"}, {"name", "Source"}, {"content_type", "video/mp4"}, {"duration", 20}}.toVariantMap());
            settle();
            QTest::qWait(200);
            view->grabWindow().save(dir + "/source.png");
        }
        state->setAsset({});
    }
    void playbackUpdatesNoViewState() {
        monitor()->setZoomPercent(200);
        settle();
        QSignalSpy picture(monitor(), &MonitorViewState::pictureRectChanged);
        QSignalSpy guides(monitor(), &MonitorViewState::guidesChanged);
        const auto before = model.documentJson();
        for (int i = 0; i < 20; ++i) {
            clock.seek(1000 + i * 33);
            settle();
        }
        QCOMPARE(picture.count(), 0);
        QCOMPARE(guides.count(), 0);
        QCOMPARE(model.documentJson(), before);
    }
};

QTEST_MAIN(TestMonitorUi)
#include "tst_monitorui.moc"
