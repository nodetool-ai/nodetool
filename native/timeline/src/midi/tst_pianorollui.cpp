#include "../../tests/TestAssetCacheRoot.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include "midi/PianoRollController.h"
#include <cmath>
#include <stdexcept>

#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJSEngine>
#include <QJsonArray>
#include <QJsonDocument>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWindow>
#include <QtTest>
#include <qpa/qwindowsysteminterface.h>

#include <memory>

// UI thread only. Test fixtures own their engine, root and offscreen window.
class TestPianoRollUi : public QObject {
    Q_OBJECT
    TestAssetCacheRoot m_testCache;
    TimelineModel model;
    PlaybackClock clock;
    std::unique_ptr<QQmlEngine> engine;
    std::unique_ptr<QObject> root;
    std::unique_ptr<QQuickWindow> window;

    QJsonArray notes() const {
        const auto doc = QJsonDocument::fromJson(model.documentJson()).object();
        return doc["clips"].toArray()[0].toObject()["notes"].toArray();
    }
    QQuickItem* item(const QString& name) const {
        const auto find = [&](auto&& self, QQuickItem* at) -> QQuickItem* {
            if (at->objectName() == name) {
                return at;
            }
            for (auto* child : at->childItems()) {
                if (auto* hit = self(self, child)) {
                    return hit;
                }
            }
            return nullptr;
        };
        return find(find, window->contentItem());
    }

    QJsonArray controllers() const {
        const auto doc = QJsonDocument::fromJson(model.documentJson()).object();
        return doc["clips"].toArray()[0].toObject()["controllers"].toArray();
    }
    QPoint gridPoint(double fx, double fy) const {
        auto* grid = item("pianoRollGrid");
        return grid->mapToScene({grid->width() * fx, grid->height() * fy}).toPoint();
    }
    // Adds a note by clicking the grid.
    void addNote() {
        auto* grid = item("pianoRollGrid");
        QTRY_VERIFY_WITH_TIMEOUT(grid && grid->width() > 0, 5000);
        QTest::mouseClick(window.get(), Qt::LeftButton, Qt::ControlModifier, gridPoint(0.25, 0.5));  // Cmd or Ctrl: the Pencil
        QTRY_COMPARE_WITH_TIMEOUT(notes().size(), 1, 5000);
    }

    ulong m_stamp = 900000000UL;
    // Sends a raw mouse event with a timestamp far from every earlier click, so a press, release, press
    // is a double click (QTest spaces its own presses past the double-click interval).
    void sendMouse(const QPoint& at, Qt::MouseButtons buttons, Qt::MouseButton button, QEvent::Type type) {
        m_stamp += 10;
        QWindowSystemInterface::handleMouseEvent<QWindowSystemInterface::SynchronousDelivery>(
            window.get(), m_stamp, QPointF(at), QPointF(window->mapToGlobal(at)), buttons, button, type);
    }
    void sendPress(const QPoint& at) { sendMouse(at, Qt::LeftButton, Qt::LeftButton, QEvent::MouseButtonPress); }
    void sendRelease(const QPoint& at) { sendMouse(at, Qt::NoButton, Qt::LeftButton, QEvent::MouseButtonRelease); }
    void sendMove(const QPoint& at) { sendMouse(at, Qt::LeftButton, Qt::NoButton, QEvent::MouseMove); }
    void newClickSequence() { m_stamp += 100000; }

    // A pure JS module of the piano roll, run in its own engine.
    std::unique_ptr<QJSEngine> loadModule(const QString& name) {
        QFile file(QDir(QFileInfo(QStringLiteral(__FILE__)).absolutePath()).filePath(QStringLiteral("../../qml/pianoroll/") + name));
        if (!file.open(QIODevice::ReadOnly)) {
            return nullptr;
        }
        QString source = QString::fromUtf8(file.readAll());
        source.remove(QStringLiteral(".pragma library"));
        auto js = std::make_unique<QJSEngine>();
        const auto result = js->evaluate(source, name);
        if (result.isError()) {
            qWarning() << result.toString();
            return nullptr;
        }
        return js;
    }
    static QVariant callJs(QJSEngine& js, const QString& function, const QString& argsJson) {
        const auto args = js.evaluate(QStringLiteral("[") + argsJson + QStringLiteral("]"));
        QJSValueList list;
        for (quint32 i = 0; i < args.property(QStringLiteral("length")).toUInt(); ++i) {
            list.append(args.property(i));
        }
        const auto result = js.globalObject().property(function).call(list);
        if (result.isError()) {
            qWarning() << function << result.toString();
        }
        return result.toVariant();
    }

  private slots:
    void init() {
        const QJsonObject raw{
            {"id", "tl"}, {"name", "Song"}, {"fps", 30}, {"width", 1920}, {"height", 1080}, {"durationMs", 4000},
            {"tempo", QJsonObject{{"bpm", 120}, {"offsetMs", 0}, {"timeSignature", QJsonObject{{"beatsPerBar", 4}, {"beatUnit", 4}}}}},
            {"tracks", QJsonArray{QJsonObject{{"id", "m"}, {"name", "Keys"}, {"type", "midi"}}}},
            {"clips", QJsonArray{QJsonObject{{"id", "c"}, {"trackId", "m"}, {"name", "Riff"}, {"mediaType", "midi"},
                                             {"sourceType", "generated"}, {"status", "ready"}, {"startMs", 0},
                                             {"durationMs", 2000}, {"inPointMs", 0}, {"outPointMs", 2000},
                                             {"notes", QJsonArray{}}}}}};
        const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline);
        model.setTimeline(*parsed.timeline);
        engine = std::make_unique<QQmlEngine>();
        m_testCache.install(*engine);
        QQmlComponent component(engine.get());
        component.setData(R"(import QtQuick
import NodeTool.Timeline
import "." as Local
Item {
    width: 800; height: 400
    required property var timeline
    required property var clock
    Local.PianoRollPanel { objectName: "panel"; anchors.fill: parent; clipId: "c" }
})", QUrl::fromLocalFile(QDir(QFileInfo(QStringLiteral(__FILE__)).absolutePath()).filePath(QStringLiteral("../../qml/pianoroll/TestFixture.qml"))));
        root.reset(component.createWithInitialProperties(
            {{"timeline", QVariant::fromValue(&model)}, {"clock", QVariant::fromValue(&clock)}}));
        QVERIFY2(root, qPrintable(component.errorString()));
        window = std::make_unique<QQuickWindow>();
        window->resize(800, 400);
        qobject_cast<QQuickItem*>(root.get())->setParentItem(window->contentItem());
        window->show();
        QVERIFY(QTest::qWaitForWindowExposed(window.get()));
        window->requestActivate();
        QVERIFY(QTest::qWaitForWindowActive(window.get()));
        // The tests count in beats. The panel's own default is Smart, which follows the zoom.
        item("panel")->setProperty("snapValue", "beat");
    }
    void cleanup() {
        clock.seek(0);
        root.reset();
        window.reset();
        engine.reset();
    }

    void clickAddsAndDeleteRemovesNote() {
        QTRY_VERIFY(item("pianoRollGrid"));
        auto* grid = item("pianoRollGrid");
        QTRY_VERIFY(grid->width() > 0);
        QCOMPARE(item("panel")->property("clipId").toString(), QStringLiteral("c"));
        const auto at = grid->mapToScene({grid->width() / 4, grid->height() / 2}).toPoint();
        QTest::mouseClick(window.get(), Qt::LeftButton, Qt::ControlModifier, at);
        QTRY_COMPARE(notes().size(), 1);
        const auto note = notes()[0].toObject();
        QCOMPARE(note["velocity"].toInt(), 100);
        QCOMPARE(note["durationTick"].toInt(), 960);
        QCOMPARE(note["startTick"].toInt() % 960, 0);

        QTest::keyClick(window.get(), Qt::Key_Up);
        QTRY_COMPARE(notes()[0].toObject()["pitch"].toInt(), note["pitch"].toInt() + 1);
        QTest::keyClick(window.get(), Qt::Key_Delete);
        QTRY_COMPARE(notes().size(), 0);
        model.undoStack()->undo();
        QCOMPARE(notes().size(), 1);
    }

    void dragMovesNoteAsOneEdit() {
        auto* grid = item("pianoRollGrid");
        QTRY_VERIFY(grid && grid->width() > 0);
        const auto start = grid->mapToScene({grid->width() / 4 + 4, grid->height() / 2}).toPoint();
        QTest::mouseClick(window.get(), Qt::LeftButton, Qt::ControlModifier, start);
        QTRY_COMPARE(notes().size(), 1);
        const int before = model.undoStack()->count();
        const int startTick = notes()[0].toObject()["startTick"].toInt();
        QTest::mousePress(window.get(), Qt::LeftButton, Qt::NoModifier, start);
        for (int step = 1; step <= 10; ++step) {
            QTest::mouseMove(window.get(), start + QPoint(step * 20, 0));
        }
        QTest::mouseRelease(window.get(), Qt::LeftButton, Qt::NoModifier, start + QPoint(200, 0));
        QTRY_VERIFY(notes()[0].toObject()["startTick"].toInt() > startTick);
        QCOMPARE(model.undoStack()->count(), before + 1);
    }

    void mKeyTogglesMuteOfSelectedNotes() {
        addNote();
        const auto note = notes()[0].toObject();
        QVERIFY(!note.contains("muted"));
        QTest::keyClick(window.get(), Qt::Key_M);
        QTRY_VERIFY(notes()[0].toObject()["muted"].toBool());
        QCOMPARE(notes()[0].toObject()["id"].toString(), note["id"].toString());
        QTest::keyClick(window.get(), Qt::Key_M);
        QTRY_VERIFY(!notes()[0].toObject()["muted"].toBool());
    }

    void channelFieldWritesTheNoteChannel() {
        addNote();
        auto* field = item("pianoRollChannel");
        QTRY_VERIFY(field && field->isVisible());
        QCOMPARE(field->property("displayValue").toString(), QStringLiteral("1"));
        QVERIFY(QMetaObject::invokeMethod(field, "valueCommitted", Q_ARG(double, 5.0)));
        QTRY_COMPARE(notes()[0].toObject()["channel"].toInt(), 4);  // shown 1..16, stored 0..15
        QTRY_COMPARE(item("pianoRollChannel")->property("displayValue").toString(), QStringLiteral("5"));
        auto* release = item("pianoRollReleaseVelocity");
        QVERIFY(QMetaObject::invokeMethod(release, "valueCommitted", Q_ARG(double, 64.0)));
        QTRY_COMPARE(notes()[0].toObject()["releaseVelocity"].toInt(), 64);
        QCOMPARE(notes()[0].toObject()["channel"].toInt(), 4);  // the other fields are kept
    }

    void controllerLaneAddsAndRemovesPoints() {
        QTRY_VERIFY(item("pianoRollCurveLane") && item("pianoRollGrid")->width() > 0);
        auto* select = item("pianoRollLaneSelect");
        QVERIFY(select);
        QVERIFY(QMetaObject::invokeMethod(select, "valueCommitted", Q_ARG(QVariant, QVariant(QStringLiteral("cc:1")))));
        auto* lane = item("pianoRollCurveLane");
        QTRY_VERIFY(lane->isVisible());
        QVERIFY(controllers().isEmpty());
        const int before = model.undoStack()->count();
        const auto at = lane->mapToScene({lane->width() / 4, lane->height() / 2}).toPoint();
        QTest::mouseClick(window.get(), Qt::LeftButton, Qt::NoModifier, at);
        QTRY_COMPARE(controllers().size(), 1);
        const auto laneObject = controllers()[0].toObject();
        QCOMPARE(laneObject["kind"].toString(), QStringLiteral("cc"));
        QCOMPARE(laneObject["cc"].toInt(), 1);
        QCOMPARE(laneObject["points"].toArray().size(), 1);
        QCOMPARE(laneObject["points"].toArray()[0].toObject()["tick"].toInt() % 960, 0);  // snapped to the grid
        QCOMPARE(model.undoStack()->count(), before + 1);
        // A drag moves the point as one more undo entry. The point sits on the snapped tick.
        const auto added = laneObject["points"].toArray()[0].toObject();
        const QPoint grab = expressionPointPixel(added["tick"].toDouble(), added["value"].toDouble());
        QTest::mousePress(window.get(), Qt::LeftButton, Qt::NoModifier, grab);
        for (int step = 1; step <= 8; ++step) {
            QTest::mouseMove(window.get(), grab + QPoint(step * 10, -step * 2));
        }
        QTest::mouseRelease(window.get(), Qt::LeftButton, Qt::NoModifier, grab + QPoint(80, -16));
        QTRY_COMPARE(model.undoStack()->count(), before + 2);
        QCOMPARE(controllers()[0].toObject()["points"].toArray().size(), 1);
        // Delete removes the selected point, and the lane goes with its last point.
        QTest::keyClick(window.get(), Qt::Key_Delete);
        QTRY_VERIFY(controllers().isEmpty());
        model.undoStack()->undo();
        QCOMPARE(controllers().size(), 1);
    }

    // Selects a lane in the lane selector.
    void chooseLane(const QString& value) {
        auto* select = item("pianoRollLaneSelect");
        QVERIFY(select);
        QVERIFY(QMetaObject::invokeMethod(select, "valueCommitted", Q_ARG(QVariant, QVariant(value))));
    }
    QJsonObject firstNote() const { return notes()[0].toObject(); }

    void expressionPointStaysSelectedAndDeleteRemovesIt() {
        addNote();
        chooseLane(QStringLiteral("note:pitch"));
        auto* lane = item("pianoRollCurveLane");
        QTRY_VERIFY(lane->isVisible());
        const auto at = lane->mapToScene({gridPoint(0.25, 0.5).x() - lane->mapToScene({0, 0}).x() + 10, lane->height() / 2}).toPoint();
        QTest::mouseClick(window.get(), Qt::LeftButton, Qt::NoModifier, at);
        QTRY_COMPARE(firstNote()["expression"].toObject()["pitch"].toArray().size(), 1);
        QTRY_COMPARE(item("panel")->property("selectedPointIds").toList().size(), 1);
        QTest::keyClick(window.get(), Qt::Key_Delete);
        QTRY_VERIFY(!firstNote().contains("expression"));
        QCOMPARE(notes().size(), 1);  // the key press in a lane never deletes the note
    }

    void notePitchLaneUsesTheContractRange() {
        addNote();
        chooseLane(QStringLiteral("note:pitch"));
        QTRY_VERIFY(item("pianoRollCurveLane")->isVisible());
        const auto range = item("panel")->property("laneInfo").toMap()["range"].toMap();
        QCOMPARE(range["min"].toInt(), -48);
        QCOMPARE(range["max"].toInt(), 48);
    }

    void deleteInLaneWithoutSelectedPointKeepsTheNote() {
        addNote();
        chooseLane(QStringLiteral("cc:1"));
        auto* lane = item("pianoRollCurveLane");
        QTRY_VERIFY(lane->isVisible());
        QTest::mouseClick(window.get(), Qt::LeftButton, Qt::NoModifier, lane->mapToScene({lane->width() / 2, 4}).toPoint());
        QTRY_COMPARE(controllers().size(), 1);
        item("panel")->setProperty("selectedPointIds", QVariantList{});
        QTest::keyClick(window.get(), Qt::Key_Delete);
        QTest::qWait(100);
        QCOMPARE(notes().size(), 1);
    }

    void unsnappedFreehandDragIsBoundedByTheScreenResolution() {
        QTRY_VERIFY(item("pianoRollCurveLane") && item("pianoRollGrid")->width() > 0);
        chooseLane(QStringLiteral("cc:1"));
        auto* panel = item("panel");
        panel->setProperty("pxPerTick", 0.005);  // 200 ticks per pixel
        panel->setProperty("snapOn", false);
        auto* lane = item("pianoRollCurveLane");
        QTRY_VERIFY(lane->isVisible());
        const auto from = lane->mapToScene({40, lane->height() / 2}).toPoint();
        QTest::mousePress(window.get(), Qt::LeftButton, Qt::ShiftModifier, from);
        QElapsedTimer timer;
        timer.start();
        // With snap off the stroke steps by the finest resolution.
        const QPoint to = from + QPoint(600, 6);
        QMouseEvent move(QEvent::MouseMove, window->mapFromGlobal(window->mapToGlobal(to)), window->mapToGlobal(to),
                         Qt::NoButton, Qt::LeftButton, Qt::NoModifier);
        QCoreApplication::sendEvent(window.get(), &move);
        QTest::mouseRelease(window.get(), Qt::LeftButton, Qt::ShiftModifier, to);
        QVERIFY2(timer.elapsed() < 500, qPrintable(QString::number(timer.elapsed())));
        QTRY_COMPARE(controllers().size(), 1);
        const int count = controllers()[0].toObject()["points"].toArray().size();
        QVERIFY2(count >= 500 && count <= 620, qPrintable(QString::number(count)));
    }

    void doubleClickDeleteIsNotRestoredByLaterMoves() {
        QTRY_VERIFY(item("pianoRollCurveLane") && item("pianoRollGrid")->width() > 0);
        chooseLane(QStringLiteral("cc:1"));
        auto* lane = item("pianoRollCurveLane");
        QTRY_VERIFY(lane->isVisible());
        const auto at = lane->mapToScene({lane->width() / 4, lane->height() / 2}).toPoint();
        QTest::mouseClick(window.get(), Qt::LeftButton, Qt::NoModifier, at);
        QTRY_COMPARE(controllers().size(), 1);
        QTest::qWait(600);  // past the double-click guard of a point that was just added
        const int before = model.undoStack()->count();
        // The click snapped to the grid, so the point sits off the click position.
        auto* panel = item("panel");
        const double pointX = (controllers()[0].toObject()["points"].toArray()[0].toObject()["tick"].toDouble() -
                               panel->property("scrollTick").toDouble()) * panel->property("pxPerTick").toDouble();
        const double pointY = panel->property("laneMargin").toDouble() +
                              (lane->height() - 2 * panel->property("laneMargin").toDouble()) * (127.0 - controllers()[0].toObject()["points"].toArray()[0].toObject()["value"].toDouble()) / 127.0;
        const QPoint at2 = lane->mapToScene({pointX, pointY}).toPoint();
        newClickSequence();
        sendPress(at2);
        sendMove(at2 + QPoint(2, 0));  // jitter under the drag threshold: the press stays a click
        sendRelease(at2 + QPoint(2, 0));
        sendPress(at2);  // Qt delivers this press as the double click
        sendMove(at2 + QPoint(12, 0));
        sendMove(at2 + QPoint(14, 1));
        sendRelease(at2 + QPoint(14, 1));
        QTest::qWait(100);
        QVERIFY2(controllers().isEmpty(), QJsonDocument(controllers()).toJson(QJsonDocument::Compact).constData());
        QCOMPARE(model.undoStack()->count(), before + 1);
    }

    void shorteningANoteKeepsItsExpressionCurveToTheNewEnd() {
        addNote();
        chooseLane(QStringLiteral("note:pitch"));
        auto* lane = item("pianoRollCurveLane");
        auto* panel = item("panel");
        QTRY_VERIFY(lane->isVisible());
        const double base = (firstNote()["startTick"].toDouble() - panel->property("scrollTick").toDouble()) * panel->property("pxPerTick").toDouble();
        const double perTick = panel->property("pxPerTick").toDouble();
        panel->setProperty("snapOn", false);
        QTest::mouseClick(window.get(), Qt::LeftButton, Qt::NoModifier, lane->mapToScene({base + 1, lane->height() * 0.25}).toPoint());
        QTRY_COMPARE(firstNote()["expression"].toObject()["pitch"].toArray().size(), 1);
        QTest::mouseClick(window.get(), Qt::LeftButton, Qt::NoModifier, lane->mapToScene({base + 480 * perTick, lane->height() * 0.75}).toPoint());
        QTRY_COMPARE(firstNote()["expression"].toObject()["pitch"].toArray().size(), 2);
        panel->setProperty("snapOn", true);
        QTest::keyClick(window.get(), Qt::Key_Left, Qt::ShiftModifier);
        QTRY_VERIFY(firstNote()["durationTick"].toInt() < 480);
        const int duration = firstNote()["durationTick"].toInt();
        const auto points = firstNote()["expression"].toObject()["pitch"].toArray();
        QVERIFY2(!points.isEmpty(), QJsonDocument(firstNote()).toJson(QJsonDocument::Compact).constData());
        QCOMPARE(points.last().toObject()["tick"].toInt(), duration);  // the curve ends at the note end
        QCOMPARE(points.size(), 1);
        QCOMPARE(points.last().toObject()["value"].toDouble(), 0.0);  // before its first point a curve is neutral
    }

    void expressionCurveIsFittedToTheNewLengthByInterpolation() {
        auto js = loadModule(QStringLiteral("PianoRollNotes.js"));
        QVERIFY(js);
        const auto notes = callJs(*js, "resizeNotes",
            R"([{id:"a",pitch:60,velocity:100,startTick:0,durationTick:960,expression:{pitch:[{tick:0,value:0},{tick:480,value:10}]}}], ["a"], -720, 1)""").toList();
        const auto points = notes[0].toMap()["expression"].toMap()["pitch"].toList();
        QCOMPARE(points.size(), 2);
        QCOMPARE(points.last().toMap()["tick"].toInt(), 240);
        QCOMPARE(points.last().toMap()["value"].toDouble(), 5.0);  // halfway along the ramp
    }

    void freehandDrawingStopsAtTheLaneCaps() {
        auto js = loadModule(QStringLiteral("PianoRollLanes.js"));
        QVERIFY(js);
        const QString range = QStringLiteral("{min:0,max:127,neutral:0,integer:true}");
        const QString counter = QStringLiteral("(function(){var n=0;return function(){return 'p'+(n++)}})()");
        const auto controller = callJs(*js, "drawSegment", QStringLiteral("[],0,0,5000,100,1,") + range + "," + counter).toList();
        QCOMPARE(controller.size(), 4096);
        const auto expression = callJs(*js, "drawSegment", QStringLiteral("[],0,0,960,100,1,") + range + "," + counter + ",960").toList();
        QCOMPARE(expression.size(), 256);
    }

    void freehandSegmentIsClampedToTheNoteBeforeItInterpolates() {
        auto js = loadModule(QStringLiteral("PianoRollLanes.js"));
        QVERIFY(js);
        const QString range = QStringLiteral("{min:-48,max:48,neutral:0,integer:false}");
        const auto points = callJs(*js, "drawSegment",
            QStringLiteral("[],480,0,8480,48,20,") + range + ",(function(){var n=0;return function(){return 'p'+(n++)}})(),960").toList();
        double at720 = -1;
        int last = 0;
        for (const auto& p : points) {
            last = std::max(last, p.toMap()["tick"].toInt());
            if (p.toMap()["tick"].toInt() == 720) {
                at720 = p.toMap()["value"].toDouble();
            }
        }
        QCOMPARE(last, 960);
        QCOMPARE(at720, 24.0);  // the ramp spans 480..960, not 480..8480
    }

    void expressionLaneTicksAreClampedToTheNote() {
        addNote();
        chooseLane(QStringLiteral("note:pitch"));
        QTRY_VERIFY(item("pianoRollCurveLane")->isVisible());
        auto* mouse = item("pianoRollCurveMouse");
        QVariant far, near;
        QVERIFY(QMetaObject::invokeMethod(mouse, "relTick", Q_RETURN_ARG(QVariant, far), Q_ARG(QVariant, 100000.0), Q_ARG(QVariant, false)));
        QCOMPARE(far.toInt(), firstNote()["durationTick"].toInt());
        QVERIFY(QMetaObject::invokeMethod(mouse, "relTick", Q_RETURN_ARG(QVariant, near), Q_ARG(QVariant, -100000.0), Q_ARG(QVariant, false)));
        QCOMPARE(near.toInt(), 0);
    }

    QPoint expressionPointPixel(double tick, double value) {
        QVariantMap point{{"tick", tick}, {"value", value}};
        QVariant pixel;
        [&] { QVERIFY(QMetaObject::invokeMethod(item("pianoRollCurveLane"), "pixelOf", Q_RETURN_ARG(QVariant, pixel), Q_ARG(QVariant, point))); }();
        return item("pianoRollCurveLane")->mapToScene({pixel.toMap()["x"].toDouble(), pixel.toMap()["y"].toDouble()}).toPoint();
    }

    void fastDoubleClickOnExpressionLaneKeepsTheNewPoint() {
        addNote();
        chooseLane(QStringLiteral("note:pitch"));
        auto* lane = item("pianoRollCurveLane");
        auto* panel = item("panel");
        QTRY_VERIFY(lane->isVisible());
        const double base = (firstNote()["startTick"].toDouble() - panel->property("scrollTick").toDouble()) * panel->property("pxPerTick").toDouble();
        const auto at = lane->mapToScene({base + 1, lane->height() / 2}).toPoint();
        const int before = model.undoStack()->count();
        newClickSequence();
        sendPress(at);
        sendRelease(at);
        sendPress(at);  // the double click lands on the point the first click wrote
        sendRelease(at);
        QTest::qWait(100);
        QCOMPARE(firstNote()["expression"].toObject()["pitch"].toArray().size(), 1);
        QCOMPARE(model.undoStack()->count(), before + 1);
    }

    void doubleClickedNoteStaysDeletedAfterLaterMoves() {
        addNote();
        auto* panel = item("panel");
        const double px = panel->property("pxPerTick").toDouble();
        const double x = (firstNote()["startTick"].toDouble() - panel->property("scrollTick").toDouble()) * px +
                         firstNote()["durationTick"].toDouble() * px / 2;
        const double y = (panel->property("topPitch").toDouble() - firstNote()["pitch"].toDouble() + 0.5) * panel->property("rowHeight").toDouble();
        auto* grid = item("pianoRollGrid");
        const auto at = grid->mapToScene({x, y}).toPoint();
        QTest::qWait(600);  // past the guard that keeps a fast double click from deleting a new note
        const int before = model.undoStack()->count();
        newClickSequence();
        sendPress(at);
        sendRelease(at);
        sendPress(at);
        sendMove(at + QPoint(6, 0));
        sendMove(at + QPoint(9, 1));
        sendRelease(at + QPoint(9, 1));
        QTest::qWait(100);
        QCOMPARE(notes().size(), 0);
        QCOMPARE(model.undoStack()->count(), before + 1);
    }

    void deleteDuringAPointDragDoesNotWriteTwice() {
        chooseLane(QStringLiteral("cc:1"));
        auto* lane = item("pianoRollCurveLane");
        QTRY_VERIFY(lane->isVisible());
        QTest::mouseClick(window.get(), Qt::LeftButton, Qt::NoModifier, lane->mapToScene({lane->width() / 4, lane->height() / 2}).toPoint());
        QTRY_COMPARE(controllers().size(), 1);
        auto* panel = item("panel");
        const auto point = controllers()[0].toObject()["points"].toArray()[0].toObject();
        const QPoint at = expressionPointPixel(point["tick"].toDouble(), point["value"].toDouble());
        setProp("snapOn", false);
        const int before = model.undoStack()->count();
        QTest::mousePress(window.get(), Qt::LeftButton, Qt::NoModifier, at);
        for (int step = 1; step <= 6; ++step) {
            QTest::mouseMove(window.get(), at + QPoint(step * 8, 0));
        }
        QTest::keyClick(window.get(), Qt::Key_Delete);
        QTest::mouseMove(window.get(), at + QPoint(60, 0));
        QTest::mouseRelease(window.get(), Qt::LeftButton, Qt::NoModifier, at + QPoint(60, 0));
        QTest::qWait(100);
        QCOMPARE(model.undoStack()->count(), before + 1);
        Q_UNUSED(panel);
    }

    void expressionSelectionIsClearedWhenAnotherNoteIsSelected() {
        addNote();
        chooseLane(QStringLiteral("note:pitch"));
        auto* lane = item("pianoRollCurveLane");
        auto* panel = item("panel");
        QTRY_VERIFY(lane->isVisible());
        const double base = (firstNote()["startTick"].toDouble() - panel->property("scrollTick").toDouble()) * panel->property("pxPerTick").toDouble();
        QTest::mouseClick(window.get(), Qt::LeftButton, Qt::NoModifier, lane->mapToScene({base + 1, lane->height() / 2}).toPoint());
        QTRY_COMPARE(panel->property("selectedPointIds").toList().size(), 1);
        QTest::mouseClick(window.get(), Qt::LeftButton, Qt::ControlModifier, gridPoint(0.6, 0.3));  // a second note, now selected
        QTRY_COMPARE(notes().size(), 2);
        QCOMPARE(panel->property("selectedPointIds").toList().size(), 0);
    }

    void expressionSelectionIsFilteredWhenTheCurveShrinks() {
        addNote();
        chooseLane(QStringLiteral("note:pitch"));
        auto* lane = item("pianoRollCurveLane");
        auto* panel = item("panel");
        QTRY_VERIFY(lane->isVisible());
        const double base = (firstNote()["startTick"].toDouble() - panel->property("scrollTick").toDouble()) * panel->property("pxPerTick").toDouble();
        QTest::mouseClick(window.get(), Qt::LeftButton, Qt::NoModifier, lane->mapToScene({base + 1, lane->height() / 2}).toPoint());
        QTRY_COMPARE(firstNote()["expression"].toObject()["pitch"].toArray().size(), 1);
        panel->setProperty("selectedPointIds", QVariantList{QStringLiteral("e5")});
        QTest::keyClick(window.get(), Qt::Key_Up);  // any note write reloads the clip
        QTRY_COMPARE(panel->property("selectedPointIds").toList().size(), 0);
    }

    void cancelRestoresTheExpressionSelection() {
        addNote();
        chooseLane(QStringLiteral("note:pitch"));
        auto* lane = item("pianoRollCurveLane");
        auto* panel = item("panel");
        QTRY_VERIFY(lane->isVisible());
        const QVariantList points{QVariantMap{{"id", "e0"}, {"tick", 100}, {"value", 10}},
                                  QVariantMap{{"id", "e1"}, {"tick", 500}, {"value", -10}}};
        QVERIFY(QMetaObject::invokeMethod(panel, "applyLanePoints", Q_ARG(QVariant, points), Q_ARG(QVariant, QVariant())));
        QVERIFY(QMetaObject::invokeMethod(panel, "commitLane"));
        QTRY_COMPARE(firstNote()["expression"].toObject()["pitch"].toArray().size(), 2);
        panel->setProperty("selectedPointIds", QVariantList{QStringLiteral("e0")});
        const QPoint at = expressionPointPixel(100, 10);
        QTest::mousePress(window.get(), Qt::LeftButton, Qt::NoModifier, at);
        const double perTick = panel->property("pxPerTick").toDouble();
        for (int step = 1; step <= 10; ++step) {
            QTest::mouseMove(window.get(), at + QPoint(int(step * 120 * perTick), 0));
        }
        QTRY_COMPARE(panel->property("selectedPointIds").toList().value(0).toString(), QStringLiteral("e1"));
        QVERIFY(QMetaObject::invokeMethod(item("pianoRollCurveMouse"), "canceled"));
        QCOMPARE(panel->property("selectedPointIds").toList().value(0).toString(), QStringLiteral("e0"));
        QCOMPARE(firstNote()["expression"].toObject()["pitch"].toArray()[0].toObject()["tick"].toInt(), 100);
    }

    // ── Logic-style piano roll (LP1-LP21) ─────────────────────────────────
    void setNotes(const QString& json) {
        const auto list = QJsonDocument::fromJson(json.toUtf8()).array().toVariantList();
        QVERIFY(QMetaObject::invokeMethod(item("panel"), "write", Q_ARG(QVariant, list)));
        QTRY_COMPARE(notes().size(), list.size());
    }
    void setProp(const char* name, const QVariant& value) { QVERIFY(item("panel")->setProperty(name, value)); }
    // The scene position of a note's middle, or of a tick on a pitch row.
    QPoint tickPoint(double tick, double pitch) {
        auto* panel = item("panel");
        const double px = panel->property("pxPerTick").toDouble();
        const double x = (tick - panel->property("scrollTick").toDouble()) * px;
        const double y = (panel->property("topPitch").toDouble() - pitch + 0.5) * panel->property("rowHeight").toDouble();
        return item("pianoRollGrid")->mapToScene({x, y}).toPoint();
    }
    QPoint notePoint(int index) {
        const auto note = notes()[index].toObject();
        const double px = item("panel")->property("pxPerTick").toDouble();
        return tickPoint(note["startTick"].toDouble() + std::min(note["durationTick"].toDouble() / 2, 40.0 / px), note["pitch"].toDouble());
    }
    void framed() {
        auto* grid = item("pianoRollGrid");
        QTRY_VERIFY_WITH_TIMEOUT(grid && grid->width() > 0, 5000);
    }
    QJsonObject noteById(const QString& id) const {
        for (const auto& n : notes()) {
            if (n.toObject()["id"].toString() == id) {
                return n.toObject();
            }
        }
        return {};
    }


    void stepEditorCreatesNotesAsOneGesture() {
        root.reset(); window.reset(); engine.reset();
        engine = std::make_unique<QQmlEngine>();
        m_testCache.install(*engine);
        QQmlComponent component(engine.get());
        component.setData(R"(import QtQuick
import NodeTool.Timeline
import "." as Local
Item {
    width: 1000; height: 500
    required property var timeline
    required property var clock
    Local.StepEditorPanel { objectName: "stepPanel"; anchors.fill: parent; clipId: "c"; laneSet: "gmDrums"; tool: "pencil" }
})", QUrl::fromLocalFile(QDir(QFileInfo(QStringLiteral(__FILE__)).absolutePath()).filePath(QStringLiteral("../../qml/pianoroll/TestFixture.qml"))));
        root.reset(component.createWithInitialProperties({{"timeline", QVariant::fromValue(&model)}, {"clock", QVariant::fromValue(&clock)}}));
        QVERIFY2(root, qPrintable(component.errorString()));
        window = std::make_unique<QQuickWindow>(); window->resize(1000,500);
        qobject_cast<QQuickItem*>(root.get())->setParentItem(window->contentItem());
        window->show(); QVERIFY(QTest::qWaitForWindowExposed(window.get()));
        auto* area = item("stepEditorEvents"); QTRY_VERIFY(area && area->width() > 0);
        const auto a = area->mapToScene({20,20}).toPoint();
        const int before = model.undoStack()->count();
        QTest::mousePress(window.get(), Qt::LeftButton, Qt::NoModifier, a);
        QTest::mouseMove(window.get(), a + QPoint(100, -5));
        QCOMPARE(model.undoStack()->count(), before);
        QTest::mouseRelease(window.get(), Qt::LeftButton, Qt::NoModifier, a + QPoint(100,-5));
        QVERIFY(notes().size() >= 2);
        QCOMPARE(notes()[0].toObject()["pitch"].toInt(), 36);
        QCOMPARE(model.undoStack()->count(), before + 1);
        model.undoStack()->undo(); QVERIFY(notes().isEmpty());
        model.undoStack()->redo(); QVERIFY(notes().size() >= 2);
    }

    void stepEditorSharedVectors() {
        auto js = loadModule(QStringLiteral("StepEditorModel.js"));
        QVERIFY(js);
        QCOMPARE(callJs(*js, "automaticLanes", R"([{pitch:36},{pitch:42},{pitch:36},{pitch:38}],[{id:"L1"}])").toList(),
                 (QVariantList{QVariantMap{{"type","note"},{"pitch",42}}, QVariantMap{{"type","note"},{"pitch",38}}, QVariantMap{{"type","note"},{"pitch",36}}, QVariantMap{{"type","controller"},{"laneId","L1"}}}));
        QCOMPARE(js->evaluate("GM_DRUM_LANES.length").toInt(), 16);
        QCOMPARE(callJs(*js, "valueFromY", "0,100,0,127").toInt(), 127);
        QCOMPARE(callJs(*js, "valueFromY", "100,100,0,127").toInt(), 0);
        QCOMPARE(callJs(*js, "valueFromY", "50,100,0,127").toInt(), 64);
        QCOMPARE(callJs(*js, "valueFromY", "50,100,-8192,8191").toInt(), 0);
        QCOMPARE(callJs(*js, "stepStartTick", "500,240,0").toInt(), 480);
        QCOMPARE(callJs(*js, "stepStartTick", "500,240,100").toInt(), 340);
        QCOMPARE(callJs(*js, "scaleValues", "[20,60,100],50,0").toList(), (QVariantList{10,30,50}));
        QCOMPARE(callJs(*js, "thinOut", R"(["a","b","c","d","e"])").toStringList(), (QStringList{"b","d"}));
        const auto line = callJs(*js, "lineSteps", "0,0,960,120,240,0").toList();
        QCOMPARE(line.size(), 5);
        for (int i = 0; i < line.size(); ++i) {
            QCOMPARE(line[i].toMap()["tick"].toInt(), i * 240);
            QCOMPARE(line[i].toMap()["value"].toInt(), i * 30);
        }
        const auto offset = callJs(*js, "lineSteps", "100,10,500,50,240,0").toList();
        QCOMPARE(offset[0].toMap()["value"].toInt(), 10);
        QCOMPARE(offset[1].toMap()["value"].toInt(), 24);
        QCOMPARE(offset[2].toMap()["value"].toInt(), 48);
        QVERIFY(!js->evaluate(R"(var nextId = function(){return "new"};
            var drawn = drawStep([{id:"b",tick:600,value:20},{id:"a",tick:500,value:10}],480,240,90,nextId);
            var added = drawStep([],480,240,90,nextId);
            var note = drawNoteStep([],60,480,240,0,120,nextId);
            var updated = drawNoteStep([{id:"b",pitch:60,startTick:600,velocity:20},{id:"a",pitch:60,startTick:500,velocity:10}],60,480,240,200,120,nextId);
        )").isError());
        QCOMPARE(js->evaluate("drawn[0].id + ':' + drawn[0].value + ':' + drawn[1].value").toString(), QStringLiteral("a:90:20"));
        QCOMPARE(js->evaluate("added[0].tick").toInt(), 480);
        QCOMPARE(js->evaluate("note[0].velocity").toInt(), 1);
        QCOMPARE(js->evaluate("note[0].durationTick").toInt(), 120);
        QCOMPARE(js->evaluate("updated[1].velocity").toInt(), 127);
        QCOMPARE(js->evaluate("updated[0].velocity").toInt(), 20);
    }

    void reviewF20VelocityGestureOwnsUndo() {
        framed();
        setNotes(R"([{"id":"a","pitch":60,"velocity":100,"startTick":960,"durationTick":480}])");
        auto* lane = item("pianoRollVelocity");
        QVERIFY(lane && lane->isVisible());
        const double x = (960 - item("panel")->property("scrollTick").toDouble()) * item("panel")->property("pxPerTick").toDouble();
        const auto a = lane->mapToScene({x, lane->height() / 2}).toPoint();
        const int index = model.undoStack()->index();
        QTest::mousePress(window.get(), Qt::LeftButton, Qt::NoModifier, a);
        QTest::mouseMove(window.get(), a + QPoint(0, -10));
        QKeyEvent event(QEvent::KeyPress, Qt::Key_Z, Qt::ControlModifier);
        event.setAccepted(false);
        QCoreApplication::sendEvent(item("panel"), &event);
        QVERIFY(event.isAccepted());
        QCOMPARE(model.undoStack()->index(), index);
        QTest::mouseRelease(window.get(), Qt::LeftButton, Qt::NoModifier, a + QPoint(0, -10));
        QCOMPARE(model.undoStack()->index(), index + 1);
        model.undoStack()->undo();
        QCOMPARE(firstNote()["velocity"].toInt(), 100);
    }
    void reviewF25BrushChangesRowWithinStep() {
        framed(); setProp("tool", "brush"); setProp("pxPerTick", 0.2);
        const auto a = tickPoint(100,60), b = tickPoint(100,62);
        QTest::mousePress(window.get(), Qt::LeftButton, Qt::NoModifier, a);
        QTest::mouseMove(window.get(), b);
        QTest::mouseRelease(window.get(), Qt::LeftButton, Qt::NoModifier, b);
        QCOMPARE(notes().size(), 2);
        QCOMPARE(notes()[1].toObject()["pitch"].toInt(), 62);
    }

    void reviewF1SnappedFreehandIsSparse() {
        framed(); setProp("laneChoice", "cc:1"); setProp("pxPerTick", 0.2);
        auto* lane = item("pianoRollCurveLane");
        const auto a = lane->mapToScene({0, lane->height() / 2}).toPoint();
        const auto b = a + QPoint(384, -10);
        QTest::mousePress(window.get(), Qt::LeftButton, Qt::ShiftModifier, a);
        QTest::mouseMove(window.get(), b);
        QTest::mouseRelease(window.get(), Qt::LeftButton, Qt::ShiftModifier, b);
        QVERIFY(!controllers().isEmpty());
        QVERIFY(controllers()[0].toObject()["points"].toArray().size() <= 4);
    }
    void reviewF2BrushUnsnappedSpacing() {
        framed(); setProp("tool", "brush"); setProp("snapOn", false); setProp("pxPerTick", 0.2);
        const auto a = tickPoint(100,60);
        QTest::mousePress(window.get(), Qt::LeftButton, Qt::NoModifier, a);
        for (int x = 2; x <= 6; x += 2) { QTest::mouseMove(window.get(), a + QPoint(x,0)); }
        QTest::mouseRelease(window.get(), Qt::LeftButton, Qt::NoModifier, a + QPoint(6,0));
        QCOMPARE(notes().size(), 1);
    }

    void reviewF2BrushDiagonalDoesNotRepaintOldTick() {
        framed(); setProp("tool", "brush"); setProp("pxPerTick", 0.2);
        const auto a = tickPoint(0,60), b = tickPoint(960,62);
        QTest::mousePress(window.get(), Qt::LeftButton, Qt::NoModifier, a);
        QTest::mouseMove(window.get(), b);
        QTest::mouseRelease(window.get(), Qt::LeftButton, Qt::NoModifier, b);
        QCOMPARE(notes().size(), 2);
    }
    void reviewF2BrushIncludesFirstPhaseStep() {
        framed(); auto doc = QJsonDocument::fromJson(model.documentJson()).object(); auto clips = doc["clips"].toArray();
        auto clip = clips[0].toObject(); clip["startMs"] = 200; clips[0] = clip; doc["clips"] = clips;
        const auto parsed = nt::parseTimelineJson(QJsonDocument(doc).toJson()); QVERIFY(parsed.timeline); model.setTimeline(*parsed.timeline);
        setProp("tool", "brush"); setProp("snapValue", "1/8"); setProp("pxPerTick", 0.5);
        const auto a = tickPoint(0,60), b = tickPoint(100,60);
        QTest::mousePress(window.get(), Qt::LeftButton, Qt::NoModifier, a);
        QTest::mouseMove(window.get(), b);
        QTest::mouseRelease(window.get(), Qt::LeftButton, Qt::NoModifier, b);
        QCOMPARE(notes().size(), 2);
        QCOMPARE(notes()[1].toObject()["startTick"].toInt(), 96);
    }
    void reviewF4MuteDoubleClickDoesNotDelete() {
        framed(); setNotes(R"([{"id":"a","pitch":60,"velocity":100,"startTick":0,"durationTick":960}])");
        setProp("tool", "mute"); const auto a = notePoint(0); newClickSequence();
        sendPress(a); sendRelease(a); sendPress(a); sendRelease(a);
        QCOMPARE(notes().size(), 1);
    }
    void reviewF5MixedFieldsCommitFirstValue() {
        framed(); setNotes(R"([{"id":"a","pitch":60,"velocity":100,"startTick":0,"durationTick":480,"channel":0,"releaseVelocity":0},{"id":"b","pitch":62,"velocity":100,"startTick":960,"durationTick":480,"channel":4,"releaseVelocity":20}])");
        setProp("selectedIds", QVariantList{QStringLiteral("a"),QStringLiteral("b")});
        for (const auto& name : {"pianoRollChannel", "pianoRollReleaseVelocity"}) {
            auto* field = item(name); QVERIFY(field);
            QVERIFY(QMetaObject::invokeMethod(field, "begin"));
            field->setProperty("text", name == QStringLiteral("pianoRollChannel") ? "1" : "0");
            QVERIFY(QMetaObject::invokeMethod(field, "finishEdit"));
        }
        QCOMPARE(noteById("b")["channel"].toInt(), 0);
        QCOMPARE(noteById("b")["releaseVelocity"].toInt(), 0);
    }
    void reviewF6OutsidePitchCannotCreate() {
        framed(); setProp("topPitch", 0); setProp("snapToScale", true); setProp("scaleId", "major");
        for (const auto& tool : {"pencil", "brush"}) {
            setProp("tool", tool);
            QTest::mouseClick(window.get(), Qt::LeftButton, Qt::NoModifier, tickPoint(960,-5));
            QCOMPARE(notes().size(), 0);
        }
    }
    void reviewF7MarqueeSelectionIsUnique() {
        framed(); setNotes(R"([{"id":"a","pitch":60,"velocity":100,"startTick":960,"durationTick":480}])");
        setProp("selectedIds", QVariantList{QStringLiteral("a")});
        const auto a = tickPoint(800,61), b = tickPoint(1500,59);
        QTest::mousePress(window.get(), Qt::LeftButton, Qt::ShiftModifier, a);
        QTest::mouseMove(window.get(), b);
        QTest::mouseRelease(window.get(), Qt::LeftButton, Qt::ShiftModifier, b);
        QCOMPARE(item("panel")->property("selectedIds").toList().size(), 1);
    }
    void reviewF8SmallVelocityDrag() {
        framed(); setNotes(R"([{"id":"a","pitch":60,"velocity":100,"startTick":0,"durationTick":960}])");
        setProp("tool", "velocity"); const auto a = notePoint(0);
        QTest::mousePress(window.get(), Qt::LeftButton, Qt::NoModifier, a);
        QTest::mouseMove(window.get(), a + QPoint(0,-3));
        QTest::mouseRelease(window.get(), Qt::LeftButton, Qt::NoModifier, a + QPoint(0,-3));
        QCOMPARE(firstNote()["velocity"].toInt(), 103);
    }
    void reviewF9InspectorShowsPreview() {
        framed(); setNotes(R"([{"id":"a","pitch":60,"velocity":40,"startTick":0,"durationTick":480}])");
        setProp("selectedIds", QVariantList{QStringLiteral("a")});
        QVERIFY(QMetaObject::invokeMethod(item("panel"), "velocityBegin"));
        QVERIFY(QMetaObject::invokeMethod(item("panel"), "velocityPreview", Q_ARG(QVariant, 90.0)));
        QCOMPARE(item("panel")->property("shownVelocity").toInt(), 90);
    }
    void reviewF12InspectorWaitsForWidth() {
        framed(); auto* panel = item("panel");
        auto* container = qobject_cast<QQuickItem*>(root.get());
        container->setWidth(0); setProp("inspectorSized", false);
        QVERIFY(QMetaObject::invokeMethod(panel, "attach"));
        QVERIFY(!panel->property("inspectorSized").toBool());
        container->setWidth(800);
        QTRY_VERIFY(panel->property("inspectorSized").toBool());
        QVERIFY(panel->property("inspectorVisible").toBool());
    }
    void reviewF13TransposePreservesIntervals() {
        framed(); setNotes(R"([{"id":"a","pitch":120,"velocity":100,"startTick":0,"durationTick":480},{"id":"b","pitch":125,"velocity":100,"startTick":960,"durationTick":480}])");
        setProp("selectedIds", QVariantList{QStringLiteral("a"),QStringLiteral("b")});
        QVERIFY(QMetaObject::invokeMethod(item("panel"), "runAction", Q_ARG(QVariant, "octaveUp")));
        QCOMPARE(noteById("a")["pitch"].toInt(), 122);
        QCOMPARE(noteById("b")["pitch"].toInt(), 127);
    }
    void reviewF14FollowingIncludesPlayheadNote() {
        framed(); auto doc = QJsonDocument::fromJson(model.documentJson()).object();
        auto tempo = doc["tempo"].toObject(); tempo["bpm"] = 42; doc["tempo"] = tempo;
        const auto parsed = nt::parseTimelineJson(QJsonDocument(doc).toJson()); QVERIFY(parsed.timeline); model.setTimeline(*parsed.timeline);
        setNotes(R"([{"id":"a","pitch":60,"velocity":100,"startTick":960,"durationTick":480}])");
        clock.setDurationMs(4000);
        clock.seek(1428.5714285714287);
        QVERIFY(clock.time() > 400);
        QVERIFY(QMetaObject::invokeMethod(item("panel"), "runAction", Q_ARG(QVariant, "selectFollowing")));
        QCOMPARE(item("panel")->property("selectedIds").toList().size(), 1);
    }
    void reviewF15CanceledPencilRestoresSelection() {
        framed(); setProp("tool", "pencil");
        QTest::mousePress(window.get(), Qt::LeftButton, Qt::NoModifier, tickPoint(960,60));
        QVERIFY(!item("panel")->property("selectedIds").toList().isEmpty());
        window->contentItem()->ungrabMouse();
        // Cancel the actual MouseArea grab, without committing the preview.
        if (auto* grabber = window->mouseGrabberItem()) { grabber->ungrabMouse(); }
        QCOMPARE(item("panel")->property("selectedIds").toList().size(), 0);
    }

    void reviewF15RejectedPencilRestoresSelection() {
        framed(); QJsonArray full;
        for (int i = 0; i < 4096; ++i) full.append(QJsonObject{{"id",QString::number(i)}, {"pitch",60}, {"velocity",100}, {"startTick",i}, {"durationTick",1}});
        setNotes(QString::fromUtf8(QJsonDocument(full).toJson())); setProp("tool", "pencil");
        QTest::mouseClick(window.get(), Qt::LeftButton, Qt::NoModifier, tickPoint(960,64));
        QCOMPARE(notes().size(), 4096);
        QCOMPARE(item("panel")->property("selectedIds").toList().size(), 0);
    }
    void reviewF15CanceledDuplicateRestoresSelection() {
        framed(); setNotes(R"([{"id":"a","pitch":60,"velocity":100,"startTick":0,"durationTick":960}])");
        setProp("selectedIds", QVariantList{QStringLiteral("a")}); const auto at = notePoint(0);
        QTest::mousePress(window.get(), Qt::LeftButton, Qt::AltModifier, at);
        QTest::mouseMove(window.get(), at + QPoint(100,0));
        if (auto* grabber = window->mouseGrabberItem()) { grabber->ungrabMouse(); }
        QCOMPARE(item("panel")->property("selectedIds").toStringList(), QStringList{"a"});
    }
    void reviewF16CollapseDoesNotHideFittingRows() {
        framed(); setNotes(R"([{"id":"a","pitch":60,"velocity":100,"startTick":0,"durationTick":480},{"id":"b","pitch":72,"velocity":100,"startTick":960,"durationTick":480}])");
        setProp("collapseMode", true); setProp("collapseTopRow", 10);
        QCOMPARE(item("panel")->property("geometry").toMap()["topRow"].toInt(), 0);
    }
    void reviewF17ReadOnlyMenuEntriesDisabled() {
        framed(); setProp("selectedIds", QVariantList{QStringLiteral("a")});
        auto doc = QJsonDocument::fromJson(model.documentJson()).object(); auto clips = doc["clips"].toArray();
        auto clip = clips[0].toObject(); clip["locked"] = true; clips[0] = clip; doc["clips"] = clips;
        const auto parsed = nt::parseTimelineJson(QJsonDocument(doc).toJson()); QVERIFY(parsed.timeline); model.setTimeline(*parsed.timeline);
        auto* toolbar = item("pianoRollToolbar");
        for (const auto& entry : toolbar->property("functionEntries").toList()) {
            const auto row = entry.toMap(); if (row["separator"].toBool()) continue;
            QVERIFY2(row.contains("enabled") && !row["enabled"].toBool(), qPrintable(row["id"].toString()));
        }
    }
    void reviewF18CssAlphaColor() {
        framed(); auto doc = QJsonDocument::fromJson(model.documentJson()).object(); auto clips = doc["clips"].toArray();
        auto clip = clips[0].toObject(); clip["color"] = "#00ff0080"; clips[0] = clip; doc["clips"] = clips;
        const auto parsed = nt::parseTimelineJson(QJsonDocument(doc).toJson()); QVERIFY(parsed.timeline); model.setTimeline(*parsed.timeline);
        const auto color = item("panel")->property("clipAccent").value<QColor>();
        QCOMPARE(color.green(), 255); QCOMPARE(color.alpha(), 128);
    }

    void reviewF18InvalidClipColorFallsBackToTrack() {
        framed(); auto doc = QJsonDocument::fromJson(model.documentJson()).object(); auto clips = doc["clips"].toArray();
        auto clip = clips[0].toObject(); clip["color"] = "invalid"; clips[0] = clip; doc["clips"] = clips;
        auto tracks = doc["tracks"].toArray(); auto track = tracks[0].toObject(); track["color"] = "#ffeb3b"; tracks[0] = track; doc["tracks"] = tracks;
        const auto parsed = nt::parseTimelineJson(QJsonDocument(doc).toJson()); QVERIFY(parsed.timeline); model.setTimeline(*parsed.timeline);
        QCOMPARE(item("panel")->property("clipAccent").value<QColor>(), QColor("#ffeb3b"));
        const auto strip = item("pianoRollRegionStrip");
        const auto labels = strip->findChildren<QQuickItem*>();
        bool found = false;
        for (auto* label : labels) if (label->property("text").toString() == "Riff") {
            found = true; const auto ink = label->property("color").value<QColor>();
            QVERIFY(ink.lightnessF() < 0.5); QVERIFY(ink.alphaF() > 0.99);
        }
        QVERIFY(found);
    }
    void reviewF19PartialTempoIsSafe() {
        // Disconnect the QML consumer so the pre-fix exception can be asserted rather than terminate QML.
        root.reset(); window.reset(); engine.reset();
        auto doc = QJsonDocument::fromJson(model.documentJson()).object(); doc["tempo"] = QJsonObject{{"bpm",120}};
        const auto parsed = nt::parseTimelineJson(QJsonDocument(doc).toJson()); QVERIFY(parsed.timeline); model.setTimeline(*parsed.timeline);
        PianoRollController controller; controller.setTimeline(&model); controller.setClipId("c");
        bool threw = false; double step = 0;
        try { step = controller.gridStepTicks("beat"); } catch (const std::invalid_argument&) { threw = true; }
        QVERIFY(!threw); QCOMPARE(step, 960.0); QVERIFY(std::isfinite(controller.offsetMs()));
    }
    void reviewF20GestureConsumesUndo() {
        framed(); setNotes(R"([{"id":"a","pitch":60,"velocity":100,"startTick":0,"durationTick":960}])");
        QTest::mousePress(window.get(), Qt::LeftButton, Qt::NoModifier, notePoint(0));
        QKeyEvent event(QEvent::KeyPress, Qt::Key_Z, Qt::ControlModifier); event.setAccepted(false);
        QCoreApplication::sendEvent(item("panel"), &event);
        QVERIFY(event.isAccepted());
        QTest::mouseRelease(window.get(), Qt::LeftButton, Qt::NoModifier, notePoint(0));
    }
    void reviewF3PositionBoundaryAndHalfNoteBeat() {
        auto js = loadModule("PianoRollNotes.js"); QVERIFY(js);
        QFile file(QDir(QFileInfo(QStringLiteral(__FILE__)).absolutePath()).filePath("../../qml/pianoroll/PianoRollTools.js"));
        QVERIFY(file.open(QIODevice::ReadOnly)); auto source = QString::fromUtf8(file.readAll());
        source.remove(".pragma library"); source.replace(".import \"PianoRollNotes.js\" as Notes", "var Notes = this;");
        QVERIFY(!js->evaluate(source).isError());
        const auto p = callJs(*js,"positionParts","3839.999998,0,960,4").toMap();
        QVERIFY(p["beat"].toInt() >= 1);
        QCOMPARE(callJs(*js,"positionText","60,1200,0,1920,2").toString(), QStringLiteral("C4  1 1 6 1"));
        QCOMPARE(callJs(*js,"positionText","60,3839.999999999999,0,960,4").toString(), QStringLiteral("C4  1 4 4 240"));
        QVERIFY(callJs(*js,"positionParts","960,0,960.0000000000001,4").toMap()["division"].toInt() <= 4);
    }
    void reviewF10QuarterSnapOption() {
        auto js = loadModule("PianoRollNotes.js"); QVERIFY(js);
        QFile file(QDir(QFileInfo(QStringLiteral(__FILE__)).absolutePath()).filePath("../../qml/pianoroll/PianoRollTools.js"));
        QVERIFY(file.open(QIODevice::ReadOnly)); auto source = QString::fromUtf8(file.readAll());
        source.remove(".pragma library"); source.replace(".import \"PianoRollNotes.js\" as Notes", "var Notes = this;");
        QVERIFY(!js->evaluate(source).isError());
        QVERIFY(js->evaluate("SNAP_OPTIONS.some(function(o) { return o.value === '1/4' })").toBool());
    }
    void reviewF11SmartSnapInNotesModule() {
        auto js = loadModule("PianoRollNotes.js"); QVERIFY(js);
        QVERIFY(js->globalObject().property("smartSnapTicks").isCallable());
        QCOMPARE(callJs(*js,"smartSnapTicks","0.05,960,4").toInt(), 480);
    }

    void pointerClickOnEmptyGridClearsTheSelectionAndCreatesNoNote() {
        addNote();
        QCOMPARE(item("panel")->property("selectedIds").toList().size(), 1);
        QTest::mouseClick(window.get(), Qt::LeftButton, Qt::NoModifier, gridPoint(0.8, 0.2));
        QCOMPARE(notes().size(), 1);
        QCOMPARE(item("panel")->property("selectedIds").toList().size(), 0);
    }

    void pencilDragSetsTheLengthInOneUndoStep() {
        framed();
        const int before = model.undoStack()->count();
        const auto at = gridPoint(0.2, 0.3);
        QTest::mousePress(window.get(), Qt::LeftButton, Qt::ControlModifier, at);
        for (int step = 1; step <= 10; ++step) {
            QTest::mouseMove(window.get(), at + QPoint(step * 30, 0));
        }
        QTest::mouseRelease(window.get(), Qt::LeftButton, Qt::ControlModifier, at + QPoint(300, 0));
        QTRY_COMPARE(notes().size(), 1);
        QVERIFY(firstNote()["durationTick"].toInt() > 960);
        QCOMPARE(firstNote()["durationTick"].toInt() % 960, 0);
        QCOMPARE(firstNote()["velocity"].toInt(), 100);
        QCOMPARE(model.undoStack()->count(), before + 1);
    }

    void eraserDeletesEveryNoteItPassesOverAsOneEdit() {
        framed();
        setNotes(R"([{"id":"a","pitch":60,"velocity":100,"startTick":0,"durationTick":480},
                     {"id":"b","pitch":60,"velocity":100,"startTick":960,"durationTick":480},
                     {"id":"c","pitch":60,"velocity":100,"startTick":1920,"durationTick":480},
                     {"id":"d","pitch":64,"velocity":100,"startTick":960,"durationTick":480}])");
        setProp("tool", "eraser");
        const int before = model.undoStack()->count();
        const auto from = notePoint(0), to = notePoint(2);
        QTest::mousePress(window.get(), Qt::LeftButton, Qt::NoModifier, from);
        for (int step = 1; step <= 20; ++step) {
            QTest::mouseMove(window.get(), from + QPoint((to.x() - from.x()) * step / 20, 0));
        }
        QTest::mouseRelease(window.get(), Qt::LeftButton, Qt::NoModifier, to);
        QTRY_COMPARE(notes().size(), 1);
        QCOMPARE(firstNote()["id"].toString(), QStringLiteral("d"));
        QCOMPARE(model.undoStack()->count(), before + 1);
    }

    void brushPaintsOneNotePerStepAndSkipsExistingOnes() {
        framed();
        setProp("snapValue", "beat");
        setProp("tool", "brush");
        const int before = model.undoStack()->count();
        const auto from = tickPoint(100, 60), to = tickPoint(3000, 60);
        QTest::mousePress(window.get(), Qt::LeftButton, Qt::NoModifier, from);
        for (int step = 1; step <= 20; ++step) {
            QTest::mouseMove(window.get(), from + QPoint((to.x() - from.x()) * step / 20, 0));
        }
        QTest::mouseRelease(window.get(), Qt::LeftButton, Qt::NoModifier, to);
        QTRY_COMPARE(notes().size(), 4);  // beats 0, 960, 1920, 2880
        QCOMPARE(model.undoStack()->count(), before + 1);
        for (const auto& n : notes()) {
            QCOMPARE(n.toObject()["durationTick"].toInt(), 960);
            QCOMPARE(n.toObject()["velocity"].toInt(), 100);
        }
        QTest::mousePress(window.get(), Qt::LeftButton, Qt::NoModifier, to);
        QTest::mouseMove(window.get(), from);
        QTest::mouseRelease(window.get(), Qt::LeftButton, Qt::NoModifier, from);
        QCOMPARE(notes().size(), 4);  // no second note at a step that has one
        QCOMPARE(model.undoStack()->count(), before + 1);  // and no undo entry for a stroke that changed nothing
    }

    void scissorsSplitsAtTheSnappedTickAndIgnoresTheEnds() {
        framed();
        setNotes(R"([{"id":"a","pitch":60,"velocity":100,"startTick":0,"durationTick":1920}])");
        setProp("tool", "scissors");
        setProp("snapValue", "beat");
        QTest::mouseClick(window.get(), Qt::LeftButton, Qt::NoModifier, tickPoint(1000, 60));
        QTRY_COMPARE(notes().size(), 2);
        QCOMPARE(notes()[0].toObject()["durationTick"].toInt(), 960);
        QCOMPARE(notes()[1].toObject()["startTick"].toInt(), 960);
        const int before = model.undoStack()->count();
        QTest::mouseClick(window.get(), Qt::LeftButton, Qt::NoModifier, tickPoint(10, 60));  // snaps to the note start
        QCOMPARE(notes().size(), 2);
        QCOMPARE(model.undoStack()->count(), before);
    }

    void glueMergesTheClickedNoteIntoTheSelectedOnes() {
        framed();
        setNotes(R"([{"id":"a","pitch":60,"velocity":100,"startTick":0,"durationTick":480},
                     {"id":"b","pitch":60,"velocity":50,"startTick":960,"durationTick":480}])");
        setProp("selectedIds", QVariantList{QStringLiteral("a")});
        setProp("tool", "glue");
        QTest::mouseClick(window.get(), Qt::LeftButton, Qt::NoModifier, notePoint(1));
        QTRY_COMPARE(notes().size(), 1);
        QCOMPARE(firstNote()["durationTick"].toInt(), 1440);
        QCOMPARE(firstNote()["velocity"].toInt(), 100);
    }

    void muteToolGivesTheSelectionTheNewStateOfTheClickedNote() {
        framed();
        setNotes(R"([{"id":"a","pitch":60,"velocity":100,"startTick":0,"durationTick":480},
                     {"id":"b","pitch":62,"velocity":100,"startTick":960,"durationTick":480,"muted":true}])");
        setProp("selectedIds", QVariantList{QStringLiteral("a"), QStringLiteral("b")});
        setProp("tool", "mute");
        QTest::mouseClick(window.get(), Qt::LeftButton, Qt::NoModifier, notePoint(1));  // b is muted, so the click unmutes both
        QTRY_VERIFY(!noteById("a")["muted"].toBool());
        QVERIFY(!noteById("b")["muted"].toBool());
    }

    void velocityToolShiftsTheSelectionByOneSharedDelta() {
        framed();
        setNotes(R"([{"id":"a","pitch":60,"velocity":40,"startTick":0,"durationTick":480},
                     {"id":"b","pitch":62,"velocity":100,"startTick":960,"durationTick":480}])");
        setProp("selectedIds", QVariantList{QStringLiteral("a"), QStringLiteral("b")});
        setProp("tool", "velocity");
        const int before = model.undoStack()->count();
        const auto at = notePoint(1);
        QTest::mousePress(window.get(), Qt::LeftButton, Qt::NoModifier, at);
        for (int step = 1; step <= 5; ++step) {
            QTest::mouseMove(window.get(), at + QPoint(0, -step * 10));  // 50 px up
        }
        QTest::mouseRelease(window.get(), Qt::LeftButton, Qt::NoModifier, at + QPoint(0, -50));
        QTRY_COMPARE(noteById("b")["velocity"].toInt(), 127);  // stops at the maximum
        QCOMPARE(noteById("a")["velocity"].toInt(), 67);  // the other note keeps its spacing
        QCOMPARE(model.undoStack()->count(), before + 1);
    }

    void quantizeToolQuantizesTheClickedNote() {
        framed();
        setNotes(R"([{"id":"a","pitch":60,"velocity":100,"startTick":1000,"durationTick":480}])");
        setProp("quantizeValue", "1/4");
        setProp("tool", "quantize");
        QTest::mouseClick(window.get(), Qt::LeftButton, Qt::NoModifier, notePoint(0));
        QTRY_COMPARE(firstNote()["startTick"].toInt(), 960);
    }

    void qKeyQuantizesEveryNoteWhenNothingIsSelected() {
        framed();
        setNotes(R"([{"id":"a","pitch":60,"velocity":100,"startTick":100,"durationTick":480},
                     {"id":"b","pitch":62,"velocity":100,"startTick":1100,"durationTick":480}])");
        setProp("quantizeValue", "1/4");
        item("panel")->forceActiveFocus();
        QTest::keyClick(window.get(), Qt::Key_Q);
        QTRY_COMPARE(noteById("a")["startTick"].toInt(), 0);
        QCOMPARE(noteById("b")["startTick"].toInt(), 960);
    }

    void choosingAQuantizeValueQuantizesTheSelectionAtOnce() {
        framed();
        setNotes(R"([{"id":"a","pitch":60,"velocity":100,"startTick":100,"durationTick":480},
                     {"id":"b","pitch":62,"velocity":100,"startTick":1100,"durationTick":480}])");
        setProp("selectedIds", QVariantList{QStringLiteral("b")});
        QVERIFY(QMetaObject::invokeMethod(item("panel"), "chooseQuantizeValue", Q_ARG(QVariant, QVariant(QStringLiteral("1/4")))));
        QTRY_COMPARE(noteById("b")["startTick"].toInt(), 960);
        QCOMPARE(noteById("a")["startTick"].toInt(), 100);
    }

    void quantizeStartsAndLengthsRoundsTheLengthToo() {
        framed();
        setNotes(R"([{"id":"a","pitch":60,"velocity":100,"startTick":100,"durationTick":1000}])");
        setProp("quantizeValue", "1/4");
        QVERIFY(QMetaObject::invokeMethod(item("panel"), "runAction", Q_ARG(QVariant, QVariant(QStringLiteral("quantizeLength")))));
        QTRY_COMPARE(firstNote()["startTick"].toInt(), 0);
        QCOMPARE(firstNote()["durationTick"].toInt(), 960);
    }

    void scaleQuantizeAndSnapToScaleUseTheChosenScale() {
        framed();
        setNotes(R"([{"id":"a","pitch":61,"velocity":100,"startTick":0,"durationTick":480}])");
        setProp("scaleId", "major");
        setProp("scaleRoot", 0);
        QVERIFY(QMetaObject::invokeMethod(item("panel"), "runAction", Q_ARG(QVariant, QVariant(QStringLiteral("scaleQuantize")))));
        QTRY_COMPARE(firstNote()["pitch"].toInt(), 60);  // a tie takes the lower pitch
        setProp("snapToScale", true);
        setProp("snapValue", "beat");
        QTest::mouseClick(window.get(), Qt::LeftButton, Qt::ControlModifier, tickPoint(2000, 66));  // F# is outside C major
        QTRY_COMPARE(notes().size(), 2);
        QCOMPARE(notes()[1].toObject()["pitch"].toInt(), 65);
    }

    void collapseModeShowsOnlyTheRowsThatHaveNotes() {
        framed();
        setNotes(R"([{"id":"a","pitch":60,"velocity":100,"startTick":0,"durationTick":480},
                     {"id":"b","pitch":72,"velocity":100,"startTick":960,"durationTick":480}])");
        setProp("collapseMode", true);
        const auto rows = item("panel")->property("rowSet").toMap()["pitches"].toList();
        QCOMPARE(rows.size(), 2);
        QCOMPARE(rows[0].toInt(), 72);
        QCOMPARE(rows[1].toInt(), 60);
        // The second row is the pitch 60 row: a pencil click there writes pitch 60.
        const double rowHeight = item("panel")->property("rowHeight").toDouble();
        auto* grid = item("pianoRollGrid");
        const auto at = grid->mapToScene({grid->width() * 0.6, rowHeight * 1.5}).toPoint();
        QTest::mouseClick(window.get(), Qt::LeftButton, Qt::ControlModifier, at);
        QTRY_COMPARE(notes().size(), 3);
        QCOMPARE(notes()[2].toObject()["pitch"].toInt(), 60);
    }

    void collapseRowsIgnoreTheDragPreview() {
        framed();
        setNotes(R"([{"id":"a","pitch":60,"velocity":100,"startTick":0,"durationTick":480}])");
        setProp("collapseMode", true);
        setProp("liveNotes", QVariantList{QVariantMap{{"id", "a"}, {"pitch", 70}, {"velocity", 100}, {"startTick", 0}, {"durationTick", 480}}});
        const auto rows = item("panel")->property("rowSet").toMap()["pitches"].toList();
        QCOMPARE(rows.size(), 1);
        QCOMPARE(rows[0].toInt(), 60);
    }

    void smartSnapFollowsTheZoomAndIsTheDefault() {
        framed();
        auto* panel = item("panel");
        panel->setProperty("snapValue", "smart");
        panel->setProperty("pxPerTick", 0.05);
        QCOMPARE(panel->property("gridStepTicks").toDouble(), 480.0);
        panel->setProperty("pxPerTick", 0.2);
        QCOMPARE(panel->property("gridStepTicks").toDouble(), 120.0);
        panel->setProperty("snapValue", "1/16");
        QCOMPARE(panel->property("gridStepTicks").toDouble(), 240.0);
    }

    void positionDisplayShowsTheSelectedNoteAndThePointer() {
        framed();
        QCOMPARE(item("panel")->property("positionText").toString(), QString());
        setNotes(R"([{"id":"a","pitch":60,"velocity":100,"startTick":960,"durationTick":480}])");
        setProp("selectedIds", QVariantList{QStringLiteral("a")});
        QCOMPARE(item("panel")->property("positionText").toString(), QStringLiteral("C4  1 2 1 1"));
        QTest::mouseMove(window.get(), tickPoint(0, 62) + QPoint(0, 0));
        QTRY_VERIFY(item("panel")->property("positionText").toString().startsWith(QStringLiteral("D4")));
    }

    void toolbarAndInspectorAreThere() {
        framed();
        QVERIFY(item("pianoRollToolbar") && item("pianoRollToolbar")->isVisible());
        QVERIFY(item("pianoRollInspector") && item("pianoRollInspector")->isVisible());
        QVERIFY(item("pianoRollRegionStrip") && item("pianoRollRegionStrip")->isVisible());
        QCOMPARE(item("pianoRollClipName")->property("text").toString(), QStringLiteral("Riff"));
        QCOMPARE(item("pianoRollTrackName")->property("text").toString(), QStringLiteral("on Track Keys"));
        setProp("inspectorVisible", false);
        QTRY_VERIFY(!item("pianoRollInspector")->isVisible());
        setProp("drawVisible", false);
        QTRY_VERIFY(!item("pianoRollCurveLane")->isVisible());
        QVERIFY(!item("pianoRollVelocity")->isVisible());
    }

    void velocitySliderShiftsTheSelectionWithTheirSpacingAndIsOneUndoStep() {
        framed();
        setNotes(R"([{"id":"a","pitch":60,"velocity":40,"startTick":0,"durationTick":480},
                     {"id":"b","pitch":62,"velocity":70,"startTick":960,"durationTick":480},
                     {"id":"c","pitch":64,"velocity":100,"startTick":1920,"durationTick":480}])");
        auto* panel = item("panel");
        setProp("selectedIds", QVariantList{QStringLiteral("a"), QStringLiteral("b"), QStringLiteral("c")});
        QCOMPARE(panel->property("shownVelocity").toInt(), 40);  // the earliest selected note
        const int before = model.undoStack()->count();
        QVERIFY(QMetaObject::invokeMethod(panel, "velocityBegin"));
        QVERIFY(QMetaObject::invokeMethod(panel, "velocityPreview", Q_ARG(QVariant, 90.0)));
        QCOMPARE(model.undoStack()->count(), before);  // a preview writes nothing
        QVERIFY(QMetaObject::invokeMethod(panel, "velocityCommit", Q_ARG(QVariant, 127.0)));
        QTRY_COMPARE(noteById("c")["velocity"].toInt(), 127);
        QCOMPARE(noteById("a")["velocity"].toInt(), 67);
        QCOMPARE(noteById("b")["velocity"].toInt(), 97);
        QCOMPARE(model.undoStack()->count(), before + 1);
    }

    void noOverlapDragTrimsTheNoteItLandedOn() {
        framed();
        setNotes(R"([{"id":"n","pitch":60,"velocity":100,"startTick":0,"durationTick":960},
                     {"id":"m","pitch":60,"velocity":100,"startTick":1920,"durationTick":960}])");
        setProp("snapValue", "1/8");
        setProp("dragMode", "nooverlap");
        const int before = model.undoStack()->count();
        const auto from = tickPoint(2100, 60), to = tickPoint(2100 - 1440, 60);
        QTest::mousePress(window.get(), Qt::LeftButton, Qt::NoModifier, from);
        for (int step = 1; step <= 10; ++step) {
            QTest::mouseMove(window.get(), from + QPoint((to.x() - from.x()) * step / 10, 0));
        }
        QTest::mouseRelease(window.get(), Qt::LeftButton, Qt::NoModifier, to);
        QTRY_COMPARE(noteById("m")["startTick"].toInt(), 480);
        QCOMPARE(noteById("n")["durationTick"].toInt(), 480);
        QCOMPARE(model.undoStack()->count(), before + 1);
    }

    void editMenuActionsSelectByRule() {
        framed();
        setNotes(R"([{"id":"a","pitch":60,"velocity":100,"startTick":0,"durationTick":480},
                     {"id":"b","pitch":62,"velocity":100,"startTick":960,"durationTick":480,"muted":true},
                     {"id":"c","pitch":60,"velocity":100,"startTick":1920,"durationTick":480}])");
        auto* panel = item("panel");
        const auto run = [&](const char* id) -> QStringList {
            QMetaObject::invokeMethod(panel, "runAction", Q_ARG(QVariant, QVariant(QString::fromLatin1(id))));
            return panel->property("selectedIds").toStringList();
        };
        QCOMPARE(run("selectMuted"), QStringList{"b"});
        QCOMPARE(run("invertSelection"), (QStringList{"a", "c"}));
        QCOMPARE(run("selectSamePitch"), (QStringList{"a", "c"}));
        panel->setProperty("selectedIds", QVariantList{QStringLiteral("b")});
        QCOMPARE(run("selectFollowing"), (QStringList{"b", "c"}));
        QCOMPARE(run("deselectAll"), QStringList{});
        QCOMPARE(run("selectAll").size(), 3);
    }

    void functionsMenuActionsEditAsOneUndoStep() {
        framed();
        setNotes(R"([{"id":"a","pitch":60,"velocity":100,"startTick":0,"durationTick":100},
                     {"id":"b","pitch":64,"velocity":100,"startTick":480,"durationTick":100},
                     {"id":"c","pitch":64,"velocity":100,"startTick":480,"durationTick":100}])");
        auto* panel = item("panel");
        panel->setProperty("selectedIds", QVariantList{QStringLiteral("a"), QStringLiteral("b"), QStringLiteral("c")});
        int before = model.undoStack()->count();
        QVERIFY(QMetaObject::invokeMethod(panel, "runAction", Q_ARG(QVariant, QVariant(QStringLiteral("forceLegato")))));
        QTRY_COMPARE(noteById("a")["durationTick"].toInt(), 480);
        QCOMPARE(model.undoStack()->count(), before + 1);
        QVERIFY(QMetaObject::invokeMethod(panel, "runAction", Q_ARG(QVariant, QVariant(QStringLiteral("deleteDuplicates")))));
        QTRY_COMPARE(notes().size(), 2);
        QVERIFY(QMetaObject::invokeMethod(panel, "runAction", Q_ARG(QVariant, QVariant(QStringLiteral("octaveUp")))));
        QTRY_COMPARE(noteById("a")["pitch"].toInt(), 72);
    }

    // The shared vectors of the contract (LP21): the web suite uses the same ones.
    void sharedVectorsOfThePureFunctions() {
        auto js = loadModule(QStringLiteral("PianoRollNotes.js"));
        QVERIFY(js);
        const auto color = [&](int v) { return callJs(*js, "velocityColor", QString::number(v)).toList(); };
        QCOMPARE(color(0), (QVariantList{110, 91, 216}));
        QCOMPARE(color(1), (QVariantList{110, 91, 216}));
        QCOMPARE(color(80), (QVariantList{108, 191, 78}));
        QCOMPARE(color(90), (QVariantList{155, 193, 71}));
        QCOMPARE(color(127), (QVariantList{224, 69, 58}));
        const auto snap = [&](int pitch, int root, const QString& iv) { return callJs(*js, "snapPitchToScale", QStringLiteral("%1,%2,%3").arg(pitch).arg(root).arg(iv)).toInt(); };
        const QString major = QStringLiteral("[0,2,4,5,7,9,11]");
        QCOMPARE(snap(61, 0, major), 60);
        QCOMPARE(snap(66, 0, major), 65);
        QCOMPARE(snap(63, 0, major), 62);
        QCOMPARE(snap(70, 0, major), 69);
        QCOMPARE(snap(127, 0, major), 127);
        QCOMPARE(snap(65, 7, major), 64);
        QCOMPARE(snap(66, 9, QStringLiteral("[0,3,5,7,10]")), 67);
        QCOMPARE(snap(65, 9, QStringLiteral("[0,3,5,7,10]")), 64);
        QCOMPARE(snap(61, 0, QStringLiteral("[]")), 61);
        QCOMPARE(callJs(*js, "collapsedRows", R"([{id:"a",pitch:60},{id:"b",pitch:64},{id:"c",pitch:60},{id:"d",pitch:72}])").toList(),
                 (QVariantList{72, 64, 60}));
        const QString glueInput = R"([{id:"a",pitch:60,velocity:100,startTick:0,durationTick:240},{id:"b",pitch:60,velocity:50,startTick:480,durationTick:240},
                                      {id:"c",pitch:62,velocity:100,startTick:0,durationTick:240},{id:"d",pitch:60,velocity:100,startTick:960,durationTick:240}], ["a"], "b")";
        const auto glued = callJs(*js, "glueNotes", glueInput).toList();
        QCOMPARE(glued.size(), 3);
        QCOMPARE(glued[0].toMap()["id"].toString(), QStringLiteral("a"));
        QCOMPARE(glued[0].toMap()["durationTick"].toInt(), 720);
        QCOMPARE(glued[0].toMap()["velocity"].toInt(), 100);
        const auto durations = [&](const QString& fn, const QString& input) {
            QList<int> out;
            for (const auto& n : callJs(*js, fn, input).toList()) {
                out.append(n.toMap()["durationTick"].toInt());
            }
            return out;
        };
        QCOMPARE(durations("forceLegato", R"([{id:"a",pitch:60,startTick:0,durationTick:100},{id:"b",pitch:64,startTick:480,durationTick:100},
                                              {id:"c",pitch:67,startTick:480,durationTick:200},{id:"d",pitch:60,startTick:1200,durationTick:100}], ["a","b","c","d"])"),
                 (QList<int>{480, 720, 720, 100}));
        QCOMPARE(durations("removeOverlaps", R"([{id:"a",pitch:60,startTick:0,durationTick:600},{id:"b",pitch:60,startTick:480,durationTick:240},
                                                 {id:"c",pitch:62,startTick:100,durationTick:1000}], ["a","c"])"),
                 (QList<int>{480, 240, 1000}));
        const auto kept = callJs(*js, "deleteDuplicates", R"([{id:"a",pitch:60,startTick:0},{id:"b",pitch:60,startTick:0},
                                                              {id:"c",pitch:60,startTick:0,channel:1},{id:"d",pitch:62,startTick:0}], ["b","c","d"])").toList();
        QStringList ids;
        for (const auto& n : kept) {
            ids << n.toMap()["id"].toString();
        }
        QCOMPARE(ids, (QStringList{"a", "c", "d"}));
        QCOMPARE(durations("applyNoOverlap", R"([{id:"n",pitch:60,startTick:0,durationTick:960},{id:"m",pitch:60,startTick:480,durationTick:960}], ["m"])"),
                 (QList<int>{480, 960}));
        QCOMPARE(durations("applyNoOverlap", R"([{id:"m",pitch:60,startTick:0,durationTick:960},{id:"n",pitch:60,startTick:480,durationTick:240}], ["m"])"),
                 (QList<int>{480, 240}));
        QCOMPARE(callJs(*js, "applyNoOverlap", R"([{id:"m",pitch:60,startTick:0,durationTick:240},{id:"n",pitch:60,startTick:0,durationTick:480}], ["m"])").toList().size(), 1);
        QCOMPARE(callJs(*js, "scaleQuantizeNotes", R"([{id:"a",pitch:61},{id:"b",pitch:61}], 0, [0,2,4,5,7,9,11], ["b"])").toList()[0].toMap()["pitch"].toInt(), 61);
        QCOMPARE(callJs(*js, "scaleQuantizeNotes", R"([{id:"a",pitch:61},{id:"b",pitch:61}], 0, [0,2,4,5,7,9,11], ["b"])").toList()[1].toMap()["pitch"].toInt(), 60);
    }

    void sharedSmartSnapVectors() {
        auto notesJs = loadModule(QStringLiteral("PianoRollNotes.js"));
        QVERIFY(notesJs);
        QFile file(QDir(QFileInfo(QStringLiteral(__FILE__)).absolutePath()).filePath(QStringLiteral("../../qml/pianoroll/PianoRollTools.js")));
        QVERIFY(file.open(QIODevice::ReadOnly));
        QString source = QString::fromUtf8(file.readAll());
        source.remove(QStringLiteral(".pragma library"));
        source.replace(QStringLiteral(".import \"PianoRollNotes.js\" as Notes"), QStringLiteral("var Notes = this;"));
        QVERIFY(!notesJs->evaluate(source).isError());
        const auto smart = [&](double px) { return callJs(*notesJs, "smartSnapTicks", QStringLiteral("%1,960,4").arg(px)).toInt(); };
        QCOMPARE(callJs(*notesJs, "positionText", "60,960,0,960.0000000000001,4").toString(), QStringLiteral("C4  1 2 1 1"));
        QCOMPARE(smart(0.05), 480);
        QCOMPARE(smart(0.2), 120);
        QCOMPARE(smart(0.02), 960);
        QCOMPARE(smart(0.01), 3840);
        QCOMPARE(smart(0.001), 3840);
        QCOMPARE(callJs(*notesJs, "positionText", "60, 960, 0, 960, 4").toString(), QStringLiteral("C4  1 2 1 1"));
        QCOMPARE(callJs(*notesJs, "positionText", "61, 3840 + 960 * 2 + 240 + 7, 0, 960, 4").toString(), QStringLiteral("C#4  2 3 2 8"));
        QCOMPARE(callJs(*notesJs, "positionText", "null, null, 0, 960, 4").toString(), QString());
        QCOMPARE(callJs(*notesJs, "catchScroll", "5000, 0, 1000").toDouble(), 4950.0);
        QCOMPARE(callJs(*notesJs, "catchScroll", "500, 0, 1000").toDouble(), 0.0);
        QCOMPARE(callJs(*notesJs, "catchScroll", "10, 2000, 1000").toDouble(), 0.0);
        QCOMPARE(callJs(*notesJs, "defaultScaleRoot", "\"Eb\"").toInt(), 3);
        QCOMPARE(callJs(*notesJs, "defaultScaleRoot", "undefined").toInt(), 0);
        QCOMPARE(callJs(*notesJs, "scaleOptions", "\"Chromatic\"").toList().size(), 20);
    }
};

QTEST_MAIN(TestPianoRollUi)
#include "tst_pianorollui.moc"
