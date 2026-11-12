// Trim mode in the mounted editor, with real pointer and key events. The dynamic
// trims run on a fake clock. The frames test renders through the same helper
// process as --stills and compares pixels with it.
#include "wiring/WiringFixture.h"
#include "colorpanel/ColorMatchController.h"
#include "edit/trim/TrimMode.h"
#include "edit/trim/TrimMonitorFrames.h"
#include "export/ExportController.h"
#include "export/FrameCapture.h"
#include "app/Preferences/Preferences.h"
#include "app/Preferences/PreferencesSettings.h"
#include "ui/MonitorViewState.h"
#include <QJsonArray>
#include <QProcess>
#include <QQmlEngine>
#include <QSettings>
#include <QTemporaryDir>
#include <QUndoStack>
#include <cmath>

namespace {
constexpr double FRAME_MS = 1000.0 / 30;
QString media(const QString& name) { return QStringLiteral(NT_TRIM_FIXTURES "/media/") + name; }
QJsonObject mediaClip(const QString& id, const QString& track, const QString& file, double start, double in, const QString& link, const QString& type = "video") {
    QJsonObject clip{{"id", id}, {"trackId", track}, {"name", id}, {"mediaType", type}, {"sourceType", "imported"},
        {"status", "generated"}, {"startMs", start}, {"durationMs", 2000}, {"inPointMs", in}, {"outPointMs", in + 2000},
        {"width", 1920}, {"height", 1080}, {"mediaPath", file}};
    if (!link.isEmpty()) clip.insert("linkId", link);
    return clip;
}
QJsonObject cutDocument() {
    const auto a = media("numbered-a-1080p30.mp4");
    const auto b = media("numbered-b-1080p30.mp4");
    return {{"name", "Cut"}, {"fps", 30}, {"width", 640}, {"height", 360}, {"durationMs", 10000},
        {"tracks", QJsonArray{
            QJsonObject{{"id", "v"}, {"name", "Video"}, {"type", "video"}, {"index", 0}, {"heightPx", 80}, {"visible", true}, {"locked", false}},
            QJsonObject{{"id", "w"}, {"name", "Video 2"}, {"type", "video"}, {"index", 1}, {"heightPx", 80}, {"visible", true}, {"locked", false}},
            QJsonObject{{"id", "a"}, {"name", "Audio"}, {"type", "audio"}, {"index", 2}, {"heightPx", 80}, {"visible", true}, {"locked", false}, {"muted", false}, {"solo", false}}}},
        {"clips", QJsonArray{mediaClip("l", "v", a, 0, 3000, "L1"), mediaClip("r", "v", b, 2000, 3000, "L2"),
            mediaClip("al", "a", a, 0, 3000, "L1", "audio"), mediaClip("ar", "a", b, 2000, 3000, "L2", "audio"),
            mediaClip("later", "w", b, 6000, 3000, {})}}};
}
double psnr(const QImage& a, const QImage& b) {
    if (a.isNull() || a.size() != b.size()) return 0;
    const auto x = a.convertToFormat(QImage::Format_RGB888);
    const auto y = b.convertToFormat(QImage::Format_RGB888);
    double sum = 0;
    for (int row = 0; row < x.height(); ++row) {
        for (int col = 0; col < x.width() * 3; ++col) {
            const double delta = double(x.constScanLine(row)[col]) - y.constScanLine(row)[col];
            sum += delta * delta;
        }
    }
    const double mse = sum / (x.width() * x.height() * 3);
    return mse <= 0 ? 100 : 10 * std::log10(255.0 * 255.0 / mse);
}
}  // namespace

class TestTrimMode : public WiringFixture {
    Q_OBJECT
    double m_fakeClock = 0;
    QTemporaryDir m_dir;
    int m_serial = 0;

    TrimMode* trim() const { return gestures()->trimMode(); }
    QUndoStack* history() const { return model.undoStack(); }
    QQuickItem* region() const { return item("tracksRegion"); }
    QString displayMode() const { return MonitorViewState::forOwner(gestures())->displayMode(); }
    double endOf(const QString& id) const { return clip(id).value("startMs").toDouble() + clip(id).value("durationMs").toDouble(); }
    double startOf(const QString& id) const { return clip(id).value("startMs").toDouble(); }
    QJsonArray clips() const { return model.clipsJson(); }
    void press(int key, Qt::KeyboardModifiers mods = Qt::NoModifier) {
        QTest::keyClick(view.get(), static_cast<Qt::Key>(key), mods);
        QCoreApplication::processEvents();
    }
    void load() {
        auto parsed = nt::parseTimeline(cutDocument());
        QVERIFY2(parsed.timeline, qPrintable(parsed.error));
        gestures()->setSelection({});
        gestures()->setActiveTool("select");
        model.setTimeline(std::move(*parsed.timeline));
        clock.seek(0);
        gestures()->viewState()->flush();
        QCoreApplication::processEvents();
        QTest::qWait(100);
        region()->forceActiveFocus();
    }
    QPoint pointIn(QQuickItem* target) const { return center(target); }
    QQuickItem* edge(const QString& id, const QString& side) {
        auto* owner = item("clip-" + id);
        return owner ? named(owner, side == "start" ? "clipTrimStart" : "clipTrimEnd") : nullptr;
    }
    void clickEdge(const QString& id, const QString& side, Qt::KeyboardModifiers mods = Qt::NoModifier) {
        auto* target = edge(id, side);
        QVERIFY2(target, qPrintable("No edge on " + id));
        QTest::mouseClick(view.get(), Qt::LeftButton, mods, center(target));
        QCoreApplication::processEvents();
    }
    QString mark(const QString& id, const QString& side) const { return trim()->marks().value(id).toMap().value(side).toString(); }
    QString textOf(const QString& name) const {
        auto* target = item(name);
        return target ? target->property("text").toString() : QString();
    }
    void screenshot(const QString& name) {
        const auto folder = qEnvironmentVariable("NT_TRIM_SCREENSHOTS");
        if (folder.isEmpty()) return;
        QTest::qWait(300);
        QVERIFY(view->grabWindow().save(folder + "/" + name + ".png"));
    }
    void useCapture(QQuickItem* root) {
        auto* capture = root->property("frameCapture").value<FrameCapture*>();
        QVERIFY(capture);
        capture->setExecutable(QStringLiteral(NT_TIMELINE_BINARY));
    }
    QString stills(const QJsonObject& raw, const QString& frames) {
        const QString base = m_dir.filePath(QString::number(++m_serial));
        QFile file(base + ".json");
        if (!file.open(QIODevice::WriteOnly)) return {};
        file.write(QJsonDocument(raw).toJson());
        file.close();
        QProcess process;
        auto env = QProcessEnvironment::systemEnvironment();
        env.remove("QT_QUICK_BACKEND");
        process.setProcessEnvironment(env);
        process.start(QStringLiteral(NT_TIMELINE_BINARY), {file.fileName(), "--stills", base, "--still-frames", frames, "--decode", "sw"});
        if (!process.waitForFinished(120000) || process.exitStatus() != QProcess::NormalExit || process.exitCode() != 0) {
            qWarning().noquote() << process.readAllStandardError();
            return {};
        }
        return base;
    }
    QImage still(const QString& directory, int frame) { return QImage(directory + QStringLiteral("/frame_%1.png").arg(frame, 6, 10, QLatin1Char('0'))); }

private slots:
    void initTestCase() {
        QVERIFY(m_dir.isValid());
        if (!qEnvironmentVariableIsSet("NODETOOL_TIMELINE_PREFERENCES")) {
            qputenv("NODETOOL_TIMELINE_PREFERENCES", m_dir.filePath("preferences.ini").toUtf8());
        }
        // Leave the Program monitor room for the Trim Monitor's pictures above its controls.
        open(560);
        if (QTest::currentTestFailed()) return;
        useCapture(view->rootObject());
        trim()->setClockSource([this] { return m_fakeClock; });
    }
    void init() {
        trim()->leave();
        load();
        history()->clear();
        m_fakeClock = 0;
        gestures()->setLinkedSelection(true);
        gestures()->setKeyboardPreset("premiere");
    }
    void cleanup() { trim()->leave(); }

    void ripplePointIsRedAndOpensTheMonitor() {
        QCOMPARE(displayMode(), QString("composite"));
        press(Qt::Key_B);  // Ripple tool
        QCOMPARE(gestures()->activeTool(), QString("ripple"));
        clickEdge("l", "end");
        QCOMPARE(trim()->kind(), QString("ripple"));
        QCOMPARE(mark("l", "end"), QString("ripple"));
        QCOMPARE(mark("al", "end"), QString("ripple"));
        QVERIFY(gestures()->selection().isEmpty());
        QVERIFY(gestures()->selectedEdit().isEmpty());
        QCOMPARE(displayMode(), QString("trim"));
        QTRY_VERIFY(item("trimMonitor"));
        auto* marks = item("trimEditMarks-l");
        QVERIFY(marks);
        auto* bracket = named(marks, "trimEditMark-end");
        QVERIFY(bracket);
        QTRY_VERIFY(bracket->isVisible());
        QVERIFY(bracket->height() > 0);
        QCOMPARE(bracket->property("markColor").value<QColor>(), QColor("#e53e3e"));
        screenshot("ripple-point");
    }

    void rollPointIsYellowOnBothSides() {
        press(Qt::Key_N);  // Rolling tool
        QCOMPARE(gestures()->activeTool(), QString("roll"));
        clickEdge("l", "end");
        QCOMPARE(trim()->kind(), QString("roll"));
        QCOMPARE(mark("l", "end"), QString("roll"));
        QCOMPARE(mark("r", "start"), QString("roll"));
        QCOMPARE(mark("al", "end"), QString("roll"));
        QCOMPARE(mark("ar", "start"), QString("roll"));
        auto* bracket = named(item("trimEditMarks-r"), "trimEditMark-start");
        QVERIFY(bracket);
        QCOMPARE(bracket->property("markColor").value<QColor>(), QColor("#f2c43d"));
        // Either side of the cut is the same point.
        clickEdge("r", "start", Qt::ShiftModifier);
        QVERIFY(!trim()->active());
        QCOMPARE(displayMode(), QString("composite"));
    }

    void shiftClickAddsAndLinkedOffIsOnePoint() {
        press(Qt::Key_B);
        clickEdge("l", "end");
        QCOMPARE(trim()->pointCount(), 2);
        clickEdge("r", "end", Qt::ShiftModifier);
        QCOMPARE(trim()->pointCount(), 4);
        clickEdge("al", "end", Qt::ShiftModifier);
        QCOMPARE(trim()->pointCount(), 2);
        QVERIFY(mark("l", "end").isEmpty());
        gestures()->setLinkedSelection(false);
        clickEdge("l", "end");
        QCOMPARE(trim()->pointCount(), 1);
    }

    void selectionToolKeepsThePlainEditPoint() {
        clickEdge("l", "end");
        QVERIFY(!trim()->active());
        QCOMPARE(gestures()->selectedEdit().value("clipId").toString(), QString("l"));
        QCOMPARE(displayMode(), QString("composite"));
    }

    void shiftTSelectsTheNearestCut() {
        clock.seek(1500);
        press(Qt::Key_T, Qt::ShiftModifier);
        QCOMPARE(trim()->kind(), QString("roll"));
        QCOMPARE(mark("l", "end"), QString("roll"));
        QCOMPARE(mark("ar", "start"), QString("roll"));
        QCOMPARE(displayMode(), QString("trim"));
    }

    void ctrlTCyclesTheKindInEveryPreset() {
        for (const QString preset : {"premiere", "fcp"}) {
            gestures()->setKeyboardPreset(preset);
            trim()->leave();
            gestures()->setActiveTool("ripple");
            clickEdge("l", "end");
            const auto before = clips();
            const int entries = history()->index();
            press(Qt::Key_T, Qt::ControlModifier);
            QCOMPARE(trim()->kind(), QString("roll"));
            press(Qt::Key_T, Qt::ControlModifier);
            QCOMPARE(trim()->kind(), QString("trim"));
            press(Qt::Key_T, Qt::ControlModifier);
            QCOMPARE(trim()->kind(), QString("ripple"));
            QCOMPARE(clips(), before);
            QCOMPARE(history()->index(), entries);
        }
    }

    void keyboardNudgesAreOneEntryAndClampLinkedOnce() {
        press(Qt::Key_N);
        clickEdge("l", "end");
        const auto before = clips();
        const int entries = history()->index();
        press(Qt::Key_Right, Qt::ControlModifier | Qt::AltModifier);
        QVERIFY(std::abs(endOf("l") - (2000 + FRAME_MS)) <= 1);
        QVERIFY(std::abs(endOf("al") - (2000 + FRAME_MS)) <= 1);
        QVERIFY(std::abs(startOf("r") - (2000 + FRAME_MS)) <= 1);
        QCOMPARE(history()->index(), entries + 1);
        press(Qt::Key_Right, Qt::ControlModifier | Qt::ShiftModifier | Qt::AltModifier);
        QVERIFY(std::abs(endOf("l") - (2000 + 6 * FRAME_MS)) <= 1);
        QCOMPARE(history()->index(), entries + 2);
        QCOMPARE(textOf("trimMonitorOutShift"), QString("+6"));
        QCOMPARE(textOf("trimMonitorInShift"), QString("+6"));
        press(Qt::Key_Z, Qt::ControlModifier);
        press(Qt::Key_Z, Qt::ControlModifier);
        QCOMPARE(clips(), before);
        QCOMPARE(textOf("trimMonitorOutShift"), QString("0"));
        QVERIFY(trim()->active());
    }

    void heldNudgeIsOneEntry() {
        press(Qt::Key_N);
        clickEdge("l", "end");
        const int entries = history()->index();
        const int mods = int(Qt::ControlModifier | Qt::AltModifier);
        QVERIFY(gestures()->handleKey(Qt::Key_Right, {}, mods, false));
        QVERIFY(gestures()->handleKey(Qt::Key_Right, {}, mods, true));
        QVERIFY(gestures()->handleKey(Qt::Key_Right, {}, mods, true));
        QCOMPARE(history()->index(), entries + 1);
        QVERIFY(std::abs(endOf("l") - (2000 + 3 * FRAME_MS)) <= 1);
    }

    void eExtendsEveryPointToThePlayhead() {
        press(Qt::Key_N);
        clickEdge("l", "end");
        clock.seek(2500);
        const int entries = history()->index();
        press(Qt::Key_E);
        QCOMPARE(endOf("l"), 2500.0);
        QCOMPARE(endOf("al"), 2500.0);
        QCOMPARE(startOf("ar"), 2500.0);
        QCOMPARE(history()->index(), entries + 1);
        press(Qt::Key_Z, Qt::ControlModifier);
        QCOMPARE(endOf("l"), 2000.0);
    }

    void rippleMovesLaterClipsThroughTheKeys() {
        press(Qt::Key_B);
        clickEdge("l", "end");
        const double later = startOf("later");
        press(Qt::Key_Left, Qt::ControlModifier | Qt::ShiftModifier | Qt::AltModifier);
        QVERIFY(std::abs(endOf("l") - (2000 - 5 * FRAME_MS)) <= 1);
        QVERIFY(std::abs(startOf("r") - (2000 - 5 * FRAME_MS)) <= 1);
        QVERIFY(std::abs(startOf("later") - (later - 5 * FRAME_MS)) <= 1);
    }

    void monitorButtonsAndCounters() {
        press(Qt::Key_N);
        clickEdge("l", "end");
        QTRY_VERIFY(item("trimMonitorForward"));
        QTRY_VERIFY(item("trimMonitorForward")->width() > 0);
        QCOMPARE(textOf("trimMonitorBackwardMany"), QStringLiteral("−5"));
        QCOMPARE(textOf("trimMonitorForwardMany"), QString("+5"));
        QCOMPARE(textOf("trimMonitorOutTimecode"), QString("00:00:01:29"));
        QCOMPARE(textOf("trimMonitorInTimecode"), QString("00:00:02:00"));
        QCOMPARE(textOf("trimMonitorOutgoingTitle"), QString("Out: l"));
        const int entries = history()->index();
        click("trimMonitorForward");
        QVERIFY(std::abs(endOf("l") - (2000 + FRAME_MS)) <= 1);
        QCOMPARE(history()->index(), entries + 1);
        click("trimMonitorBackwardMany");
        QVERIFY(std::abs(endOf("l") - (2000 - 4 * FRAME_MS)) <= 1);
        QCOMPARE(textOf("trimMonitorOutShift"), QStringLiteral("−4"));
        click("trimMonitorForwardMany");
        click("trimMonitorBackward");
        QVERIFY(std::abs(endOf("l") - 2000) <= 1);
        QCOMPARE(history()->index(), entries + 4);
        // The keys still reach trim mode after a button took the click.
        press(Qt::Key_L);
        QVERIFY(trim()->dynamicActive());
        press(Qt::Key_K);
        QVERIFY(!trim()->dynamicActive());
    }

    void applyDefaultTransitionIsOneEntryAtTheCut() {
        press(Qt::Key_N);
        clickEdge("l", "end");
        QTRY_VERIFY(item("trimMonitorApplyTransition"));
        QTRY_VERIFY(item("trimMonitorApplyTransition")->width() > 0);
        const auto before = clips();
        const int entries = history()->index();
        click("trimMonitorApplyTransition");
        QCOMPARE(history()->index(), entries + 1);
        QCOMPARE(clip("r").value("transitionIn").toObject().value("durationMs").toDouble(), 500.0);
        QVERIFY(clip("ar").value("fadeInMs").toDouble() > 0);
        QVERIFY(clip("al").value("fadeOutMs").toDouble() > 0);
        QVERIFY2(!clip("ar").contains("fadeOutMs"), "the far edge of the clip keeps its state");
        QVERIFY2(!clip("al").contains("fadeInMs"), "the far edge of the clip keeps its state");
        press(Qt::Key_Z, Qt::ControlModifier);
        QCOMPARE(clips(), before);
    }

    void aRollKeepsWorkingAfterTheTransition() {
        press(Qt::Key_N);
        clickEdge("l", "end");
        QTRY_VERIFY(item("trimMonitorApplyTransition"));
        QTRY_VERIFY(item("trimMonitorApplyTransition")->width() > 0);
        click("trimMonitorApplyTransition");
        const double outgoing = endOf("l");
        const double incoming = startOf("r");
        QVERIFY2(outgoing > incoming, "the transition overlaps the clips");
        QCOMPARE(textOf("trimMonitorIncomingTitle"), QString("In: r"));
        QCOMPARE(textOf("trimMonitorOutgoingTitle"), QString("Out: l"));
        const int entries = history()->index();
        click("trimMonitorForward");
        QVERIFY(std::abs(endOf("l") - (outgoing + FRAME_MS)) <= 1);
        QVERIFY(std::abs(startOf("r") - (incoming + FRAME_MS)) <= 1);
        QCOMPARE(history()->index(), entries + 1);
        click("trimMonitorBackward");
        QCOMPARE(endOf("l"), outgoing);
        QCOMPARE(startOf("r"), incoming);
        // Asking again changes nothing about the audio's fades.
        const auto again = clip("ar").value("fadeInMs").toDouble();
        click("trimMonitorApplyTransition");
        QCOMPARE(clip("ar").value("fadeInMs").toDouble(), again);
    }

    void dragInAPictureTrimsThatSide() {
        press(Qt::Key_N);
        clickEdge("l", "end");
        QTRY_VERIFY(item("trimMonitorDrag-outgoing"));
        QTRY_VERIFY(item("trimMonitorDrag-outgoing")->width() > 0);
        const auto before = clips();
        const int entries = history()->index();
        const double later = startOf("later");
        auto* area = item("trimMonitorDrag-outgoing");
        const QPoint from = center(area);
        const int px = int(4 * TimelineMetricsPxPerFrame());
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::NoModifier, from);
        QTest::mouseMove(view.get(), from + QPoint(px / 2, 0), 20);
        QTest::mouseMove(view.get(), from + QPoint(-px, 0), 20);
        // Live: the edit shows it, with no entry yet.
        QTRY_VERIFY(std::abs(endOf("l") - (2000 - 4 * FRAME_MS)) <= 1);
        QCOMPARE(history()->index(), entries);
        QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::NoModifier, from + QPoint(-px, 0));
        QCoreApplication::processEvents();
        QCOMPARE(history()->index(), entries + 1);
        QCOMPARE(trim()->kind(), QString("ripple"));
        QVERIFY2(std::abs(startOf("later") - (later - 4 * FRAME_MS)) <= 1, "the outgoing side ripples");
        press(Qt::Key_Z, Qt::ControlModifier);
        QCOMPARE(clips(), before);
    }

    void aKeyDuringADragCommitsTheDragFirst() {
        press(Qt::Key_N);
        clickEdge("l", "end");
        QTRY_VERIFY(item("trimMonitorDrag-between"));
        QTRY_VERIFY(item("trimMonitorDrag-between")->width() > 0);
        const auto before = clips();
        const int entries = history()->index();
        const QPoint from = center(item("trimMonitorDrag-between"));
        const QPoint to = from + QPoint(int(TimelineMetricsPxPerFrame()), 0);
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::NoModifier, from);
        QTest::mouseMove(view.get(), to, 20);
        QCoreApplication::processEvents();
        press(Qt::Key_Right, Qt::ControlModifier | Qt::AltModifier);
        QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::NoModifier, to);
        QCoreApplication::processEvents();
        QCOMPARE(history()->index(), entries + 2);
        QVERIFY(std::abs(endOf("l") - (2000 + 2 * FRAME_MS)) <= 1);
        press(Qt::Key_Z, Qt::ControlModifier);
        QVERIFY(std::abs(endOf("l") - (2000 + FRAME_MS)) <= 1);
        press(Qt::Key_Z, Qt::ControlModifier);
        QCOMPARE(clips(), before);
    }

    void aDragBackToItsStartCommitsNothing() {
        press(Qt::Key_N);
        clickEdge("l", "end");
        QTRY_VERIFY(item("trimMonitorDrag-between"));
        QTRY_VERIFY(item("trimMonitorDrag-between")->width() > 0);
        const auto before = clips();
        const int entries = history()->index();
        const QPoint from = center(item("trimMonitorDrag-between"));
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::NoModifier, from);
        QTest::mouseMove(view.get(), from + QPoint(int(3 * TimelineMetricsPxPerFrame()), 0), 20);
        QTest::mouseMove(view.get(), from, 20);
        QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::NoModifier, from);
        QCoreApplication::processEvents();
        QCOMPARE(clips(), before);
        QCOMPARE(history()->index(), entries);
    }

    void aCommandSettlingLateCannotOverwriteATrim() {
        press(Qt::Key_N);
        clickEdge("l", "end");
        auto next = clips();
        auto later = next[4].toObject();
        later.insert("name", "Dropped");
        next[4] = later;
        const quint64 token = model.commitEdit("Drop", clips(), next);
        QVERIFY(token != 0);
        const QJsonObject staleDocument = model.timeline().raw;
        press(Qt::Key_L);
        m_fakeClock = 500;
        trim()->advance();
        const double trimmed = endOf("l");
        QVERIFY(trimmed > 2000);
        const int entries = history()->index();
        // The trim goes on the stack first, so the settlement is stale and is refused.
        QVERIFY(!model.settleCommand(token, staleDocument));
        QVERIFY(!trim()->dynamicActive());
        QCOMPARE(history()->index(), entries + 1);
        QCOMPARE(endOf("l"), trimmed);
    }

    void aTransitionLeavesALockedNeighbourAlone() {
        auto raw = cutDocument();
        auto list = raw.value("clips").toArray();
        auto locked = list[2].toObject();
        locked.insert("locked", true);
        list[2] = locked;
        raw.insert("clips", list);
        auto parsed = nt::parseTimeline(raw);
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        gestures()->viewState()->flush();
        QTest::qWait(100);
        region()->forceActiveFocus();
        press(Qt::Key_N);
        clickEdge("ar", "start");
        const auto before = clips();
        QVERIFY(trim()->applyDefaultTransition());
        QCOMPARE(clip("al"), before[2].toObject());
        QCOMPARE(clip("ar"), before[3].toObject());
    }

    void dragBetweenPicturesRolls() {
        press(Qt::Key_B);
        clickEdge("l", "end");
        QCOMPARE(trim()->kind(), QString("ripple"));
        QTRY_VERIFY(item("trimMonitorDrag-between"));
        QTRY_VERIFY(item("trimMonitorDrag-between")->width() > 0);
        const int entries = history()->index();
        const double later = startOf("later");
        auto* area = item("trimMonitorDrag-between");
        const QPoint from = center(area);
        const int px = int(3 * TimelineMetricsPxPerFrame());
        drag(from, from + QPoint(px, 0));
        QCOMPARE(trim()->kind(), QString("roll"));
        QVERIFY(std::abs(endOf("l") - (2000 + 3 * FRAME_MS)) <= 1);
        QVERIFY(std::abs(startOf("r") - (2000 + 3 * FRAME_MS)) <= 1);
        QCOMPARE(startOf("later"), later);
        QCOMPARE(history()->index(), entries + 1);
    }

    void escapeCancelsADrag() {
        press(Qt::Key_N);
        clickEdge("l", "end");
        QTRY_VERIFY(item("trimMonitorDrag-incoming"));
        QTRY_VERIFY(item("trimMonitorDrag-incoming")->width() > 0);
        const auto before = clips();
        const int entries = history()->index();
        const QPoint from = center(item("trimMonitorDrag-incoming"));
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::NoModifier, from);
        QTest::mouseMove(view.get(), from + QPoint(int(5 * TimelineMetricsPxPerFrame()), 0), 20);
        QCoreApplication::processEvents();
        QVERIFY(clips() != before);
        QCOMPARE(trim()->kind(), QString("ripple"));
        press(Qt::Key_Escape);
        QCOMPARE(clips(), before);
        QCOMPARE(trim()->kind(), QString("roll"));
        QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::NoModifier, from);
        QCOMPARE(clips(), before);
        QCOMPARE(history()->index(), entries);
        QVERIFY(trim()->active());
    }

    void dynamicTrimCommitsExactlyOneEntry() {
        press(Qt::Key_N);
        clickEdge("l", "end");
        const auto before = clips();
        const int entries = history()->index();
        m_fakeClock = 1000;
        press(Qt::Key_L);
        QVERIFY(trim()->dynamicActive());
        QCOMPARE(trim()->dynamicSpeed(), 1.0);
        m_fakeClock = 1500;
        trim()->advance();
        QCOMPARE(history()->index(), entries);
        QVERIFY(std::abs(endOf("l") - 2500) <= 1);
        QVERIFY(std::abs(clock.currentTimeMs() - endOf("l")) <= 1);
        // A held key is not more presses.
        QVERIFY(gestures()->handleKey(Qt::Key_L, "l", 0, true));
        QCOMPARE(trim()->dynamicSpeed(), 1.0);
        press(Qt::Key_L);
        QCOMPARE(trim()->dynamicSpeed(), 2.0);
        m_fakeClock = 1750;
        trim()->advance();
        QVERIFY(std::abs(endOf("l") - 3000) <= 1);
        QCOMPARE(history()->index(), entries);
        QVERIFY(item("trimMonitorDynamic"));
        QCOMPARE(textOf("trimMonitorDynamic"), QStringLiteral("Trimming forward 2×"));
        press(Qt::Key_J);
        QCOMPARE(trim()->dynamicSpeed(), -1.0);
        m_fakeClock = 2000;
        press(Qt::Key_K);
        QVERIFY(!trim()->dynamicActive());
        // 15 frames at 1x, 15 at 2x, then 7 back: 7.5 truncates.
        QVERIFY(std::abs(endOf("l") - (2000 + 23 * FRAME_MS)) <= 1);
        QCOMPARE(history()->index(), entries + 1);
        QCOMPARE(history()->undoText(), QString("Dynamic rolling edit"));
        QVERIFY(trim()->active());
        press(Qt::Key_Z, Qt::ControlModifier);
        QCOMPARE(clips(), before);
        QCOMPARE(history()->index(), entries);
    }

    void dynamicSpeedStopsAtEightAndHoldsAtALimit() {
        press(Qt::Key_B);
        clickEdge("l", "end");
        m_fakeClock = 0;
        press(Qt::Key_J);
        press(Qt::Key_J);
        press(Qt::Key_J);
        press(Qt::Key_J);
        QCOMPARE(trim()->dynamicSpeed(), -8.0);
        press(Qt::Key_J);
        QCOMPARE(trim()->dynamicSpeed(), -8.0);
        m_fakeClock = 60000;
        trim()->advance();
        QVERIFY(trim()->atLimit());
        QCOMPARE(trim()->dynamicSpeed(), 0.0);
        QVERIFY(std::abs(clip("l").value("durationMs").toDouble() - FRAME_MS) <= 1);
        QCOMPARE(textOf("trimMonitorDynamic"), QString("Stopped at a limit"));
        const int entries = history()->index();
        press(Qt::Key_K);
        QCOMPARE(history()->index(), entries + 1);
        QCOMPARE(history()->undoText(), QString("Dynamic ripple trim"));
    }

    void escapeCancelsADynamicTrimAndThenLeaves() {
        press(Qt::Key_N);
        clickEdge("l", "end");
        const auto before = clips();
        const int entries = history()->index();
        press(Qt::Key_L);
        m_fakeClock = 500;
        trim()->advance();
        QVERIFY(clips() != before);
        press(Qt::Key_Escape);
        QCOMPARE(clips(), before);
        QCOMPARE(history()->index(), entries);
        QVERIFY(trim()->active());
        press(Qt::Key_Escape);
        QVERIFY(!trim()->active());
        QCOMPARE(gestures()->activeTool(), QString("roll"));
    }

    void anotherCommandCommitsFirst() {
        press(Qt::Key_N);
        clickEdge("l", "end");
        const auto before = clips();
        const int entries = history()->index();
        press(Qt::Key_L);
        m_fakeClock = 500;
        trim()->advance();
        press(Qt::Key_Z, Qt::ControlModifier);
        QVERIFY(!trim()->dynamicActive());
        QCOMPARE(clips(), before);
        QCOMPARE(history()->index(), entries);
        QCOMPARE(history()->redoText(), QString("Dynamic rolling edit"));
    }

    void aPressElsewhereCommitsFirst() {
        press(Qt::Key_N);
        clickEdge("l", "end");
        const int entries = history()->index();
        press(Qt::Key_L);
        m_fakeClock = 500;
        trim()->advance();
        click("transportPlay");
        QVERIFY(!trim()->dynamicActive());
        QCOMPARE(history()->index(), entries + 1);
        clock.pause();
    }

    void foreignEditEndsADynamicTrimWithNoEntryOfItsOwn() {
        press(Qt::Key_N);
        clickEdge("l", "end");
        press(Qt::Key_L);
        m_fakeClock = 500;
        trim()->advance();
        const int entries = history()->index();
        const auto live = clips();
        auto next = live;
        for (int i = 0; i < next.size(); ++i) {
            auto c = next[i].toObject();
            if (c.value("id") == "later") {
                c.insert("name", "Renamed");
                next[i] = c;
            }
        }
        model.commitEdit("Rename", live, next);
        QVERIFY(!trim()->dynamicActive());
        // The trim's entry goes under the other command, so undo unwinds both in order.
        QCOMPARE(history()->index(), entries + 2);
        QCOMPARE(clip("later").value("name").toString(), QString("Renamed"));
        press(Qt::Key_K);
        QCOMPARE(history()->index(), entries + 2);
        press(Qt::Key_Z, Qt::ControlModifier);
        QCOMPARE(clips(), live);
        press(Qt::Key_Z, Qt::ControlModifier);
        QCOMPARE(endOf("l"), 2000.0);
        QCOMPARE(history()->index(), entries);
    }

    void aWriteWithNoCommandKeepsTheTrimUndoable() {
        press(Qt::Key_N);
        clickEdge("l", "end");
        const auto base = clips();
        const int entries = history()->index();
        press(Qt::Key_L);
        m_fakeClock = 500;
        trim()->advance();
        auto next = clips();
        for (int i = 0; i < next.size(); ++i) {
            auto c = next[i].toObject();
            if (c.value("id") == "later") {
                c.insert("name", "Settled");
                next[i] = c;
            }
        }
        QVERIFY(model.replaceClips(next));
        QVERIFY(!trim()->dynamicActive());
        QCOMPARE(history()->index(), entries + 1);
        QVERIFY(endOf("l") > 2000);
        QCOMPARE(clip("later").value("name").toString(), QString("Settled"));
        press(Qt::Key_Z, Qt::ControlModifier);
        QCOMPARE(clips(), base);
    }

    void aButtonLeavesSpaceAndTheKeysToTheEditor() {
        press(Qt::Key_N);
        clickEdge("l", "end");
        QTRY_VERIFY(item("trimMonitorForward"));
        QTRY_VERIFY(item("trimMonitorForward")->width() > 0);
        click("trimMonitorForward");
        const auto after = clips();
        const int entries = history()->index();
        press(Qt::Key_Space);
        QVERIFY2(trim()->looping(), "Space did not reach the editor");
        QCOMPARE(clips(), after);
        QCOMPARE(history()->index(), entries);
        press(Qt::Key_Space);
        QVERIFY(!trim()->looping());
    }

    void replacingTheDocumentEndsTrimMode() {
        press(Qt::Key_N);
        clickEdge("l", "end");
        press(Qt::Key_L);
        m_fakeClock = 500;
        trim()->advance();
        load();
        QVERIFY(!trim()->active());
        QVERIFY(!trim()->dynamicActive());
        QCOMPARE(displayMode(), QString("composite"));
        QCOMPARE(endOf("l"), 2000.0);
    }

    void spaceLoopsAroundTheEditAndWritesNothing() {
        QSettings prefs(qEnvironmentVariable("NODETOOL_TIMELINE_PREFERENCES"), QSettings::IniFormat);
        prefs.setValue("playback/prerollMs", 500);
        prefs.setValue("playback/postrollMs", 1000);
        prefs.sync();
        press(Qt::Key_N);
        clickEdge("l", "end");
        QTRY_VERIFY(item("trimMonitor"));
        const auto before = clips();
        const int entries = history()->index();
        QSignalSpy monitorSpy(trim(), &TrimMode::monitorChanged);
        QSignalSpy pointsSpy(trim(), &TrimMode::pointsChanged);
        QSignalSpy clipsSpy(&model, &TimelineModel::clipsChanged);
        press(Qt::Key_Space);
        QVERIFY(trim()->looping());
        QVERIFY(clock.playing());
        QVERIFY(clock.currentTimeMs() >= 1500 && clock.currentTimeMs() < 3000);
        auto* monitorView = item("trimMonitor");
        QVERIFY(monitorView->property("keepsPicture").toBool());
        QTRY_VERIFY(item("previewFrame")->isVisible());
        QTRY_VERIFY(clock.currentTimeMs() > 1600);
        // It goes round again without stopping.
        QTRY_VERIFY_WITH_TIMEOUT(clock.currentTimeMs() < 1700 && clock.playing(), 5000);
        QCOMPARE(clips(), before);
        QCOMPARE(history()->index(), entries);
        // Playing updates no model.
        QCOMPARE(monitorSpy.count(), 0);
        QCOMPARE(pointsSpy.count(), 0);
        QCOMPARE(clipsSpy.count(), 0);
        screenshot("loop");
        press(Qt::Key_Space);
        QVERIFY(!trim()->looping());
        QVERIFY(!clock.playing());
        QVERIFY(std::abs(clock.currentTimeMs() - 2000) <= 1);
        QVERIFY(!monitorView->property("keepsPicture").toBool());
        QVERIFY(trim()->active());
        // K stops it too.
        press(Qt::Key_Space);
        QVERIFY(trim()->looping());
        press(Qt::Key_K);
        QVERIFY(!trim()->looping());
        // Space outside trim mode is plain play and pause.
        trim()->leave();
        press(Qt::Key_Space);
        QVERIFY(clock.playing());
        QVERIFY(!trim()->looping());
        press(Qt::Key_Space);
        QVERIFY(!clock.playing());
        prefs.remove("playback/prerollMs");
        prefs.remove("playback/postrollMs");
        prefs.sync();
    }

    void prerollAndPostrollArePreferences() {
        nt::app::Preferences preferences;
        QCOMPARE(nt::app::playbackPrerollMs(), nt::app::kDefaultPrerollMs);
        QCOMPARE(preferences.prerollSeconds(), 3.0);
        QCOMPARE(preferences.postrollSeconds(), 2.0);
        preferences.setPrerollSeconds(1.5);
        preferences.setPostrollSeconds(0.25);
        preferences.setPrerollSeconds(-1);
        QCOMPARE(nt::app::playbackPrerollMs(), 1500.0);
        QCOMPARE(nt::app::playbackPostrollMs(), 250.0);
        preferences.setPrerollSeconds(3);
        preferences.setPostrollSeconds(2);
    }

    void aClickElsewhereOrEscapeLeaves() {
        press(Qt::Key_N);
        clickEdge("l", "end");
        press(Qt::Key_Escape);
        QVERIFY(!trim()->active());
        QCOMPARE(displayMode(), QString("composite"));
        // The clip body.
        clickEdge("l", "end");
        QVERIFY(trim()->active());
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("clip-later")));
        QCoreApplication::processEvents();
        QVERIFY(!trim()->active());
        // An empty lane.
        clickEdge("l", "end");
        QVERIFY(trim()->active());
        auto* owner = item("clip-later");
        const QPoint lane = owner->mapToScene({-40, owner->height() / 2}).toPoint();
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, lane);
        QCoreApplication::processEvents();
        QVERIFY(!trim()->active());
        // The exit button.
        clickEdge("l", "end");
        QTRY_VERIFY(item("trimMonitorExit"));
        QTRY_VERIFY(item("trimMonitorExit")->width() > 0);
        click("trimMonitorExit");
        QVERIFY(!trim()->active());
    }

    void movingThePlayheadKeepsTrimMode() {
        press(Qt::Key_N);
        clickEdge("l", "end");
        auto* ruler = item("timeRuler");
        QVERIFY(ruler);
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, ruler->mapToScene({300, ruler->height() / 2}).toPoint());
        QCoreApplication::processEvents();
        QVERIFY(trim()->active());
    }

    void selectingClipsLeaves() {
        press(Qt::Key_N);
        clickEdge("l", "end");
        press(Qt::Key_A, Qt::ControlModifier);
        QVERIFY(!trim()->active());
    }

    void lockedTrackRefusesAndLockedPartnerStaysOut() {
        auto raw = cutDocument();
        auto tracks = raw.value("tracks").toArray();
        auto audio = tracks[2].toObject();
        audio.insert("locked", true);
        tracks[2] = audio;
        raw.insert("tracks", tracks);
        auto parsed = nt::parseTimeline(raw);
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        gestures()->viewState()->flush();
        QTest::qWait(100);
        region()->forceActiveFocus();
        press(Qt::Key_N);
        clickEdge("l", "end");
        QCOMPARE(trim()->pointCount(), 1);
        const double audioEnd = endOf("al");
        press(Qt::Key_Right, Qt::ControlModifier | Qt::AltModifier);
        QVERIFY(std::abs(endOf("l") - (2000 + FRAME_MS)) <= 1);
        QCOMPARE(endOf("al"), audioEnd);
    }

    void emptyViewExplainsItself() {
        MonitorViewState::forOwner(gestures())->setDisplayMode("trim");
        QTRY_VERIFY(item("trimMonitorEmpty"));
        QTRY_VERIFY(item("trimMonitorEmpty")->isVisible());
        screenshot("empty");
        MonitorViewState::forOwner(gestures())->setDisplayMode("composite");
    }

    void framesMatchStills() {
        if (qEnvironmentVariable("QT_QUICK_BACKEND") == u"software") QSKIP("Runs as tst_trimmode_frames, on the renderer");
        // Exercise the desktop size used by the macOS runner on Linux too.
        view->resize(1024, 656);
        QTRY_COMPARE(view->rootObject()->size(), QSizeF(view->size()));
        // Leave room for the cut and the monitor's trim buttons.
        auto* dock = qobject_cast<DockLayoutStore*>(view->rootObject()->property("dockStore").value<QObject*>());
        QVERIFY(dock);
        for (const auto* side : {"left", "right"}) { dock->resizeRegion(side, 100, view->width(), view->height()); }
        // The Trim Monitor's controls sit under its pictures, so the timeline leaves them room.
        dock->resizeRegion("bottom", 320, view->width(), view->height());
        QTest::qWait(100);
        auto* lanes = item("lanesViewport");
        auto* cut = edge("l", "end");
        QVERIFY(lanes && cut);
        QVERIFY2(lanes->contains(cut->mapToItem(lanes, cut->boundingRect().center())), "The cut must be inside the lane viewport");
        press(Qt::Key_N);
        QCOMPARE(gestures()->activeTool(), QStringLiteral("roll"));
        clickEdge("l", "end");
        QVERIFY2(trim()->active(), "Clicking the visible cut must enter trim mode");
        QCOMPARE(trim()->kind(), QStringLiteral("roll"));
        QCOMPARE(displayMode(), QStringLiteral("trim"));
        QTRY_VERIFY(item("trimMonitorFrames") || view->rootObject()->findChild<TrimMonitorFrames*>("trimMonitorFrames"));
        auto* frames = view->rootObject()->findChild<TrimMonitorFrames*>("trimMonitorFrames");
        QVERIFY(frames);
        QTRY_VERIFY2_WITH_TIMEOUT(frames->pending() == 0 && !frames->outgoingImage().isNull() && !frames->incomingImage().isNull(),
                                  qPrintable(frames->outgoingError() + " | " + frames->incomingError() + " | pending " + QString::number(frames->pending())), 60000);
        QVERIFY2(frames->outgoingError().isEmpty(), qPrintable(frames->outgoingError()));
        // The cut sits at frame 60, so the sides are frames 59 and 60 of the sequence.
        auto picture = cutDocument();
        picture.insert("tracks", QJsonArray{picture.value("tracks").toArray()[0]});
        QJsonArray pictureClips;
        for (const auto& c : picture.value("clips").toArray()) {
            if (c.toObject().value("trackId") == "v") pictureClips.append(c);
        }
        picture.insert("clips", pictureClips);
        const auto reference = stills(picture, "59,60");
        QVERIFY(!reference.isEmpty());
        QVERIFY2(psnr(frames->outgoingImage(), still(reference, 59)) >= 35, "outgoing against --stills");
        QVERIFY2(psnr(frames->incomingImage(), still(reference, 60)) >= 35, "incoming against --stills");
        QVERIFY2(psnr(frames->outgoingImage(), frames->incomingImage()) < 30, "the sides differ");
        screenshot("frames");
        // After a roll the frames follow, at the same source times as a document with that cut.
        click("trimMonitorForwardMany");
        QTRY_VERIFY_WITH_TIMEOUT(frames->pending() == 0, 60000);
        QTest::qWait(50);
        QTRY_VERIFY_WITH_TIMEOUT(frames->pending() == 0, 60000);
        QJsonArray rolled;
        for (const auto& c : model.clipsJson()) {
            if (c.toObject().value("trackId") == "v") rolled.append(c);
        }
        picture.insert("clips", rolled);
        const auto after = stills(picture, "64,65");
        QVERIFY(!after.isEmpty());
        QVERIFY2(psnr(frames->outgoingImage(), still(after, 64)) >= 35, "outgoing after the roll");
        QVERIFY2(psnr(frames->incomingImage(), still(after, 65)) >= 35, "incoming after the roll");
        screenshot("frames-rolled");
    }

    void cleanupTestCase() { view.reset(); }

private:
    static double TimelineMetricsPxPerFrame() { return 6; }
};

QTEST_MAIN(TestTrimMode)
#include "tst_trimmode.moc"
