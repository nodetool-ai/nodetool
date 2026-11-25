#include "../../tests/RequireValue.h"
#include "../../tests/TestAssetCacheRoot.h"
#include "app/EditRegistry.h"
#include "midi/PatternExpand.h"
#include "midi/PatternOps.h"
#include "midi/StepSequencerController.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"

#include <QDir>
#include <QElapsedTimer>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWindow>
#include <QRegularExpression>
#include <QSignalSpy>
#include <QTemporaryDir>
#include <QUndoStack>
#include <QtTest>

#include <memory>

// The Step Sequencer panel and its operations (SQ27 to SQ37, SQ46, SQ50 to SQ55).
// UI thread only. Each test owns its engine, root and offscreen window.
class TestStepSequencerUi : public QObject {
    Q_OBJECT
    TestAssetCacheRoot m_testCache;
    TimelineModel model;
    PlaybackClock clock;
    std::unique_ptr<QQmlEngine> engine;
    std::unique_ptr<QObject> root;
    std::unique_ptr<QQuickWindow> window;

    static QJsonObject row(const QString& id, const QString& name, int pitch, const QString& text) {
        QJsonArray steps;
        for (const QChar c : text) steps.append(c == u'x' ? QJsonObject{{"on", true}} : QJsonObject{});
        return QJsonObject{{"id", id}, {"name", name}, {"assignment", QJsonObject{{"type", "note"}, {"pitch", pitch}}}, {"steps", steps}};
    }
    QJsonObject pattern() const {
        const auto doc = QJsonDocument::fromJson(model.documentJson()).object();
        return doc["clips"].toArray()[0].toObject()["pattern"].toObject();
    }
    QJsonObject step(int rowIndex, int stepIndex) const {
        return pattern()["rows"].toArray()[rowIndex].toObject()["steps"].toArray()[stepIndex].toObject();
    }
    QQuickItem* item(const QString& name) const {
        const auto find = [&](auto&& self, QQuickItem* at) -> QQuickItem* {
            if (at->objectName() == name) return at;
            for (auto* child : at->childItems()) {
                if (auto* hit = self(self, child)) return hit;
            }
            return nullptr;
        };
        return find(find, window->contentItem());
    }
    QQuickItem* panel() const { return item("panel"); }
    // The scene point of step `step` in the lane `lane`, at `fy` of its height.
    QPoint stepPoint(const QString& lane, int stepIndex, double fy = 0.5) const {
        auto* area = item(lane);
        QVariant result;
        QMetaObject::invokeMethod(panel(), "stepX", Q_RETURN_ARG(QVariant, result), Q_ARG(QVariant, stepIndex));
        const double x = result.toDouble() + panel()->property("cellWidth").toDouble() * 0.4;
        return area->mapToScene({x, area->height() * fy}).toPoint();
    }
    QVariant call(const char* method, const QVariant& a = {}, const QVariant& b = {}) {
        QVariant result;
        if (!b.isValid()) {
            QMetaObject::invokeMethod(panel(), method, Q_RETURN_ARG(QVariant, result), Q_ARG(QVariant, a));
        } else {
            QMetaObject::invokeMethod(panel(), method, Q_RETURN_ARG(QVariant, result), Q_ARG(QVariant, a), Q_ARG(QVariant, b));
        }
        return result;
    }
    QObject* sequencer() const { return panel()->property("sequencer").value<QObject*>(); }
    int playingStep(const QString& rowId, double ms) const {
        int result = -1;
        QMetaObject::invokeMethod(sequencer(), "playingStep", Q_RETURN_ARG(int, result), Q_ARG(QString, rowId), Q_ARG(double, ms));
        return result;
    }
    int descendants(QQuickItem* at) const {
        int n = 0;
        for (auto* child : at->childItems()) n += 1 + descendants(child);
        return n;
    }
    QVariantMap op(const QString& name, const QVariantMap& args) {
        return call("op", name, args).toMap();
    }
    void drag(const QPoint& from, const QPoint& to, Qt::KeyboardModifiers mods = Qt::NoModifier) {
        QTest::mousePress(window.get(), Qt::LeftButton, mods, from);
        const int n = 6;
        for (int i = 1; i <= n; ++i) {
            QTest::mouseMove(window.get(), from + (to - from) * i / n);
        }
        QTest::mouseRelease(window.get(), Qt::LeftButton, mods, to);
    }
    bool capture(const QString& name) {
        const auto folder = qEnvironmentVariable("NT_PANEL_SCREENSHOTS");
        if (folder.isEmpty()) return true;
        if (!QDir().mkpath(folder)) return false;
        QTest::qWait(120);
        return window->grabWindow().save(QDir(folder).filePath(name + ".png"));
    }

  private slots:
    void init() {
        QTest::failOnWarning(QRegularExpression(QStringLiteral(".*(TypeError|ReferenceError|Binding loop).*")));
        const auto pat = nt::midi::normalizePattern(QJsonObject{
            {"name", "Crazy Beat"},
            {"lengthSteps", 16},
            {"rows", QJsonArray{row("k", "Kick", 36, "xxx.....x.xx...x"), row("s", "Snare", 38, "....x.......x..."),
                                row("h", "Hi-Hat", 42, "x.x.x.x.x.x.x.x."), row("o", "Hi-Hat Open", 46, "..............x.")}}});
        const QJsonObject raw{
            {"id", "tl"}, {"name", "Song"}, {"fps", 30}, {"width", 1920}, {"height", 1080}, {"durationMs", 4000},
            {"tempo", QJsonObject{{"bpm", 120}, {"offsetMs", 0}, {"timeSignature", QJsonObject{{"beatsPerBar", 4}, {"beatUnit", 4}}}}},
            {"tracks", QJsonArray{QJsonObject{{"id", "m"}, {"name", "Drums"}, {"type", "midi"}}}},
            {"clips", QJsonArray{QJsonObject{{"id", "c"}, {"trackId", "m"}, {"name", "Beat"}, {"mediaType", "midi"},
                                             {"sourceType", "generated"}, {"status", "ready"}, {"startMs", 0},
                                             {"durationMs", 2000}, {"inPointMs", 0}, {"outPointMs", 2000},
                                             {"pattern", pat}}}}};
        const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY2(parsed.timeline, qPrintable(parsed.error));
        model.setTimeline(requireValue(parsed.timeline));
        engine = std::make_unique<QQmlEngine>();
        m_testCache.install(*engine);
        QQmlComponent component(engine.get());
        component.setData(R"(import QtQuick
import NodeTool.Timeline
import "." as Local
Item {
    width: 1300; height: 520
    required property var timeline
    required property var clock
    Local.StepSequencerPanel { objectName: "panel"; anchors.fill: parent; clipId: "c" }
})", QUrl::fromLocalFile(QDir(QFileInfo(QStringLiteral(__FILE__)).absolutePath()).filePath(QStringLiteral("../../qml/stepsequencer/TestFixture.qml"))));
        root.reset(component.createWithInitialProperties({{"timeline", QVariant::fromValue(&model)}, {"clock", QVariant::fromValue(&clock)}}));
        QVERIFY2(root, qPrintable(component.errorString()));
        window = std::make_unique<QQuickWindow>();
        window->resize(1300, 520);
        qobject_cast<QQuickItem*>(root.get())->setParentItem(window->contentItem());
        window->show();
        QVERIFY(QTest::qWaitForWindowExposed(window.get()));
        window->requestActivate();
        QVERIFY(QTest::qWaitForWindowActive(window.get()));
        QTRY_VERIFY_WITH_TIMEOUT(item("stepGesture-k") && item("stepGesture-k")->width() > 0, 5000);
    }
    void cleanup() {
        root.reset();
        window.reset();
        engine.reset();
    }

    void sq3bS1RecordCursor() {
        sequencer()->setProperty("stepRecording", true);
        sequencer()->setProperty("recordStep", 5);
        QTRY_VERIFY(item("stepSequencerRecordCursor") && item("stepSequencerRecordCursor")->isVisible());
        QCOMPARE(item("stepSequencerRecordCursor")->property("value").toInt(), 6);
        QVERIFY(item("stepSequencerRecordMarker") && item("stepSequencerRecordMarker")->isVisible());
        QMetaObject::invokeMethod(item("stepSequencerRecordCursor"), "valueCommitted", Q_ARG(double, 3));
        QCOMPARE(sequencer()->property("recordStep").toInt(), 2);
    }
    void sq3bS5SaveAsksForName() {
        call("runAction", "savePattern");
        const auto dialogs = root->findChildren<QObject*>("stepSequencerSaveDialog");
        QVERIFY(!dialogs.isEmpty());
        QVERIFY(dialogs.first()->property("visible").toBool());
    }

    void sq3bS6ClampAfterShrink() {
        sequencer()->setProperty("stepRecording", true);
        sequencer()->setProperty("recordStep", 5);
        QVERIFY(op("set_pattern", {{"lengthSteps", 2}})["ok"].toBool());
        QVERIFY(sequencer()->property("recordStep").toInt() < 2);
    }
    void sq3bS8ChordUndo() {
        sequencer()->setProperty("stepRecording", true);
        const int before = model.undoStack()->count();
        for (int p : {36, 38, 50}) QMetaObject::invokeMethod(sequencer(), "stepRecordNoteOn", Q_ARG(int, p), Q_ARG(int, 100));
        for (int p : {36, 38, 50}) QMetaObject::invokeMethod(sequencer(), "stepRecordNoteOff", Q_ARG(int, p));
        QCOMPARE(model.undoStack()->count(), before + 1);
    }
    void sq3bS8InvalidNoteDoesNotHoldChord() {
        sequencer()->setProperty("stepRecording", true);
        QMetaObject::invokeMethod(sequencer(), "stepRecordNoteOn", Q_ARG(int, 999), Q_ARG(int, 100));
        QMetaObject::invokeMethod(sequencer(), "stepRecordNoteOn", Q_ARG(int, 36), Q_ARG(int, 100));
        QMetaObject::invokeMethod(sequencer(), "stepRecordNoteOff", Q_ARG(int, 36));
        QCOMPARE(sequencer()->property("recordStep").toInt(), 1);
    }
    void sq3bS13PrefixedReadDoesNotRefresh() {
        QSignalSpy changes(sequencer(), SIGNAL(libraryChanged()));
        QVERIFY(op("ui_timeline_list_step_patterns", {})["ok"].toBool());
        QCOMPARE(changes.count(), 0);
    }
    void sq3bS13ExternalSaveRefreshes() {
        QTemporaryDir dir;
        nt::midi::setUserStepPatternLibraryRoot(dir.path());
        QSignalSpy changes(sequencer(), SIGNAL(libraryChanged()));
        const auto doc = QJsonDocument::fromJson(model.documentJson()).object();
        QVERIFY(nt::midi::runStepPatternOp(doc, "save_step_pattern", {{"clipId", "c"}, {"name", "External"}, {"kind", "pattern"}}).ok);
        QTRY_VERIFY(changes.count() > 0);
        nt::midi::setUserStepPatternLibraryRoot({});
    }
    void sq3bS13MixedBatchRefreshes() {
        QTemporaryDir dir;
        nt::midi::setUserStepPatternLibraryRoot(dir.path());
        auto* controller = qobject_cast<StepSequencerController*>(sequencer());
        QVERIFY(controller);
        const auto result = controller->runOps({
            QVariantMap{{"op", "set_pattern"}, {"args", QVariantMap{{"name", "Mixed"}}}},
            QVariantMap{{"op", "save_step_pattern"}, {"args", QVariantMap{{"name", "Mixed"}, {"kind", "pattern"}}}}});
        bool found = false;
        for (const auto& entry : controller->library()) found = found || entry.toMap()["name"] == "Mixed";
        nt::midi::setUserStepPatternLibraryRoot({});
        QVERIFY(result["ok"].toBool());
        QVERIFY(found);
    }
    void sq3bS14ReadOnlyClearsModes() {
        sequencer()->setProperty("stepRecording", true);
        model.setReadOnly(true);
        const bool recording = sequencer()->property("stepRecording").toBool();
        call("runAction", "learnAdd");
        const auto mode = sequencer()->property("learnMode").toString();
        model.setReadOnly(false);
        QVERIFY(!recording);
        QVERIFY(mode.isEmpty());
    }

    void sq3bS14ExclusiveModes() {
        call("runAction", "learnAdd");
        sequencer()->setProperty("stepRecording", true);
        QVERIFY(sequencer()->property("learnMode").toString().isEmpty());
    }
    void sq3bS14ClipChangeClearsModes() {
        call("runAction", "learnAdd");
        sequencer()->setProperty("clipId", "missing");
        QVERIFY(sequencer()->property("learnMode").toString().isEmpty());
        call("runAction", "stepRecord");
        QVERIFY(!sequencer()->property("stepRecording").toBool());
    }
    void sq3bS14AssignNeedsSelection() {
        panel()->setProperty("selectedRowId", "");
        call("runAction", "learnAssign");
        QVERIFY(sequencer()->property("learnMode").toString().isEmpty());
    }
    void sq3bS17ConstructorLoadsOnce() {
        QFile source(QDir(QFileInfo(QStringLiteral(__FILE__)).absolutePath()).filePath("StepSequencerController.cpp"));
        QVERIFY(source.open(QIODevice::ReadOnly));
        const auto text = QString::fromUtf8(source.readAll());
        const auto ctor = text.section("StepSequencerController::StepSequencerController(QObject* parent)", 1)
                              .section("bool StepSequencerController::eventFilter", 0, 0)
                              .section("QVariantList StepSequencerController::addRowGroups", 0, 0);
        QVERIFY(!ctor.isEmpty());
        QCOMPARE(ctor.count(QRegularExpression(QStringLiteral("\\b(?:loadLibrary|reloadLibrary)\\("))), 1);
    }

    void sq3bS16FilteredResetNeverShowsUnfiltered() {
        StepSequencerLibraryModel lib({QVariantMap{{"kind", "pattern"}, {"name", "Kick"}, {"search", "kick"}},
                                       QVariantMap{{"kind", "pattern"}, {"name", "Snare"}, {"search", "snare"}}});
        lib.setQuery("kick");
        int rowsAtReset = -1;
        connect(&lib, &QAbstractItemModel::modelReset, &lib, [&lib, &rowsAtReset] { rowsAtReset = lib.rowCount(); });
        lib.setLibrary({QVariantMap{{"kind", "pattern"}, {"name", "Kick"}, {"search", "kick"}},
                        QVariantMap{{"kind", "pattern"}, {"name", "Snare"}, {"search", "snare"}}});
        QCOMPARE(rowsAtReset, 2);
    }

    void sq3bS16LargeFilteredLibrary() {
        QVariantList entries;
        entries.reserve(10000);
        for (int i = 0; i < 10000; ++i) entries.append(QVariantMap{{"kind", "pattern"}, {"search", i % 2 == 0 ? "kick" : "snare"}});
        StepSequencerLibraryModel lib(entries);
        lib.setQuery("kick");
        QCOMPARE(lib.rowCount(), 5001);
        lib.setLibrary(entries);
        QCOMPARE(lib.rowCount(), 5001);
        lib.setQuery("");
        QCOMPARE(lib.rowCount(), 10001);
    }

    // SQ55: every edit a person makes has a native assistant tool.
    void assistantToolsCoverEveryPanelOperation() {
        QStringList names;
        for (const auto& tool : nt::midi::stepPatternAssistantTools()) names << tool.toMap()["name"].toString();
        for (const char* op : {"get_pattern", "set_steps", "set_pattern_text", "set_pattern", "add_pattern_rows", "clear_pattern",
                               "convert_pattern_to_midi", "convert_midi_to_pattern", "apply_step_pattern", "set_pattern_seed",
                               "set_pattern_row", "remove_pattern_rows", "move_pattern_row", "rotate_pattern", "randomize_pattern",
                               "nudge_pattern_values", "tie_steps", "list_step_patterns", "sort_pattern_rows"}) {
            QVERIFY2(names.contains(QStringLiteral("ui_timeline_") + op), op);
        }
        // Every operation the QML writes is one of those tools.
        for (const char* file : {"StepSequencerPanel.qml", "StepSequencerRow.qml", "StepSequencerInspector.qml",
                                 "StepSequencerPatternBar.qml", "StepSequencerBrowser.qml"}) {
            QFile source(QDir(QFileInfo(QStringLiteral(__FILE__)).absolutePath()).filePath(QStringLiteral("../../qml/stepsequencer/") + file));
            QVERIFY(source.open(QIODevice::ReadOnly));
            const auto text = QString::fromUtf8(source.readAll());
            static const QRegularExpression call(QStringLiteral(R"re(op\("([a-z_]+)")re"));
            for (auto it = call.globalMatch(text); it.hasNext();) {
                const auto name = it.next().captured(1);
                QVERIFY2(nt::midi::isStepPatternTool(name), qPrintable(QStringLiteral("%1 calls %2").arg(file, name)));
            }
        }
    }

    // SQ32: a click toggles one step and is one undo entry.
    void clickTogglesStepAsOneUndo() {
        QVERIFY(!step(0, 3)["on"].toBool());
        const int before = model.undoStack()->count();
        QTest::mouseClick(window.get(), Qt::LeftButton, Qt::NoModifier, stepPoint("stepGesture-k", 3));
        QTRY_VERIFY(step(0, 3)["on"].toBool());
        QCOMPARE(model.undoStack()->count(), before + 1);
        model.undoStack()->undo();
        QVERIFY(!step(0, 3)["on"].toBool());
    }

    // SQ32, SQ46: a drag paints the first step's new state, and one Undo restores all steps.
    void dragPaintsAndUndoRestoresAll() {
        drag(stepPoint("stepGesture-s", 0), stepPoint("stepGesture-s", 7));
        QTRY_VERIFY(step(1, 7)["on"].toBool());
        for (int i = 0; i < 8; ++i) QVERIFY2(step(1, i)["on"].toBool(), qPrintable(QString::number(i)));
        model.undoStack()->undo();
        for (int i = 0; i < 8; ++i) QCOMPARE(step(1, i)["on"].toBool(), i == 4);
    }

    // SQ32: Option-click resets the step and turns it off.
    void optionClickResets() {
        QVERIFY(step(0, 0)["on"].toBool());
        QTest::mouseClick(window.get(), Qt::LeftButton, Qt::AltModifier, stepPoint("stepGesture-k", 0));
        QTRY_VERIFY(!step(0, 0)["on"].toBool());
    }

    // SQ32: in Velocity mode, a vertical drag sets the value and turns an off step on.
    void valueDragSetsVelocity() {
        panel()->setProperty("editMode", "velocity");
        drag(stepPoint("stepGesture-s", 2, 0.6), stepPoint("stepGesture-s", 2, 0.02));
        QTRY_VERIFY(step(1, 2)["on"].toBool());
        QVERIFY(step(1, 2)["velocity"].toInt() >= 120);
    }

    // SQ33: Command-drag ties the following steps.
    void commandDragTies() {
        drag(stepPoint("stepGesture-h", 0), stepPoint("stepGesture-h", 3), Qt::ControlModifier);
        QTRY_VERIFY(step(2, 3)["tie"].toBool());
        QVERIFY(step(2, 1)["tie"].toBool() && step(2, 2)["tie"].toBool());
        QVERIFY(!step(2, 0)["tie"].toBool());
    }

    // SQ29: M mutes the row.
    void muteButtonMutesRow() {
        auto* mute = item("stepRowMute-k");
        QVERIFY(mute);
        QTest::mouseClick(window.get(), Qt::LeftButton, Qt::NoModifier, mute->mapToScene({mute->width() / 2, mute->height() / 2}).toPoint());
        QTRY_VERIFY(pattern()["rows"].toArray()[0].toObject()["mute"].toBool());
    }

    // SQ35: the edit mode keys and the apostrophe toggle.
    void keysSwitchModesAndToggle() {
        panel()->forceActiveFocus();
        QTest::keyClick(window.get(), Qt::Key_G);
        QCOMPARE(panel()->property("editMode").toString(), QStringLiteral("gate"));
        QTest::keyClick(window.get(), Qt::Key_V);
        QCOMPARE(panel()->property("editMode").toString(), QStringLiteral("velocity"));
        panel()->setProperty("selectedRowId", "s");
        QMetaObject::invokeMethod(panel(), "selectStep", Q_ARG(QVariant, "s"), Q_ARG(QVariant, 1), Q_ARG(QVariant, false));
        QTest::keyClick(window.get(), Qt::Key_Right, Qt::ShiftModifier);
        QCOMPARE(panel()->property("selectedSteps").toList().size(), 2);
        QTest::keyClick(window.get(), '\'');
        QTRY_VERIFY(step(1, 1)["on"].toBool() && step(1, 2)["on"].toBool());
    }

    // SQ31: two selected steps with velocity 80 and 100 show `*`, and +10 gives 90 and 110.
    void inspectorRelativeChangeOnMixedSelection() {
        op("set_steps", {{"row", "k"}, {"steps", "1"}, {"values", QVariantMap{{"velocity", 80}}}});
        op("set_steps", {{"row", "k"}, {"steps", "2"}, {"values", QVariantMap{{"velocity", 100}}}});
        QMetaObject::invokeMethod(panel(), "selectStep", Q_ARG(QVariant, "k"), Q_ARG(QVariant, 0), Q_ARG(QVariant, false));
        QMetaObject::invokeMethod(panel(), "selectStep", Q_ARG(QVariant, "k"), Q_ARG(QVariant, 1), Q_ARG(QVariant, true));
        auto* inspector = item("stepSequencerInspector");
        QVERIFY(inspector);
        QVariant shared;
        QMetaObject::invokeMethod(inspector, "shared", Q_RETURN_ARG(QVariant, shared), Q_ARG(QVariant, "velocity"));
        QVERIFY(shared.isNull() || !shared.isValid());
        QMetaObject::invokeMethod(inspector, "commitStep", Q_ARG(QVariant, "velocity"), Q_ARG(QVariant, 10));
        QTRY_COMPARE(step(0, 0)["velocity"].toInt(), 90);
        QCOMPARE(step(0, 1)["velocity"].toInt(), 110);
    }

    // SQ28: the menu bar and pattern bar controls exist.
    void barsHoldEveryControl() {
        for (const char* name : {"stepSequencerEditMenu", "stepSequencerFunctionsMenu", "stepSequencerViewMenu",
                                 "stepSequencerBrowserToggle", "stepSequencerInspectorToggle",
                                 "stepSequencerMono", "stepSequencerOnOff", "stepSequencerModeSelect", "stepSequencerZoom",
                                 "stepSequencerStepWidthMin", "stepSequencerStepWidthMax", "stepSequencerAddRow",
                                 "stepSequencerRate", "stepSequencerPlayback", "stepSequencerPatternName",
                                 "stepSequencerPages", "stepSequencerLength"}) {
            QVERIFY2(item(name), name);
        }
        QVERIFY(item("stepSequencerMenuBar")->mapToScene({0, 0}).y() < item("stepSequencerPatternBar")->mapToScene({0, 0}).y());
    }

    // SQ43: choosing a browser entry replaces the pattern, one undo entry.
    void browserLoadsPattern() {
        panel()->setProperty("browserVisible", true);
        QTRY_VERIFY(item("stepSequencerBrowserEntry-boom-bap"));
        auto* entry = item("stepSequencerBrowserEntry-boom-bap");
        QTest::mouseClick(window.get(), Qt::LeftButton, Qt::NoModifier, entry->mapToScene({entry->width() / 2, entry->height() / 2}).toPoint());
        QTRY_COMPARE(pattern()["name"].toString(), QStringLiteral("Boom Bap"));
        model.undoStack()->undo();
        QCOMPARE(pattern()["name"].toString(), QStringLiteral("Crazy Beat"));
    }

    // SQ53: rotate by mode moves values and keeps on/off. Randomize with one seed is deterministic.
    void transformsMatchTheContract() {
        op("set_steps", {{"row", "k"}, {"steps", "1"}, {"values", QVariantMap{{"velocity", 40}}}});
        op("rotate_pattern", {{"row", "k"}, {"by", 1}, {"mode", "velocity"}});
        QCOMPARE(step(0, 1)["velocity"].toInt(), 40);
        QVERIFY(step(0, 0)["on"].toBool());
        op("randomize_pattern", {{"mode", "velocity"}, {"seed", 7}});
        const auto first = pattern();
        model.undoStack()->undo();
        op("randomize_pattern", {{"mode", "velocity"}, {"seed", 7}});
        QCOMPARE(pattern(), first);
        op("tie_steps", {{"row", "Snare"}, {"from", 5}, {"to", 7}, {"tie", true}});
        QVERIFY(step(1, 5)["tie"].toBool() && step(1, 6)["tie"].toBool());
        op("nudge_pattern_values", {{"row", "Snare"}, {"mode", "onOff"}, {"delta", 1}});
        for (int i = 0; i < 16; ++i) QVERIFY(step(1, i)["on"].toBool());
        op("remove_pattern_rows", {{"rows", QVariantList{"o"}}});
        QCOMPARE(pattern()["rows"].toArray().size(), 3);
        op("move_pattern_row", {{"row", "h"}, {"toIndex", 0}});
        QCOMPARE(pattern()["rows"].toArray()[0].toObject()["id"].toString(), QStringLiteral("h"));
        const auto bad = op("rotate_pattern", {{"by", 1}, {"mode", "nope"}});
        QVERIFY(!bad["ok"].toBool());
        QVERIFY(bad["error"].toString().contains("velocity"));
    }

    // F27: a long clip with a tiny loop stays inside the segment budget.
    void stepSpansHonourTheSegmentBudget() {
        auto clip = QJsonDocument::fromJson(model.documentJson()).object()["clips"].toArray()[0].toObject();
        clip["durationMs"] = 3600000.0;
        clip["loopLengthMs"] = 1.0;
        QElapsedTimer timer;
        timer.start();
        const auto spans = nt::midi::patternStepSpans(clip, QJsonObject{{"tempo", QJsonObject{{"bpm", 120}}}});
        QVERIFY2(timer.elapsed() < 20, qPrintable(QString::number(timer.elapsed())));
        QVERIFY(spans.rows.isEmpty());
    }

    // F28: a tempo-only or track-only edit reloads the panel.
    void tempoAndTrackEditsReload() {
        QCOMPARE(playingStep("k", 600.0), 4);
        model.applyEdit(QStringLiteral("Tempo"), {}, [](QJsonObject doc, const QJsonObject&) {
            auto tempo = doc["tempo"].toObject();
            tempo["bpm"] = 60;
            doc["tempo"] = tempo;
            return doc;
        });
        QCOMPARE(playingStep("k", 600.0), 2);
        model.applyEdit(QStringLiteral("Track"), {}, [](QJsonObject doc, const QJsonObject&) {
            auto tracks = doc["tracks"].toArray();
            auto track = tracks[0].toObject();
            track["name"] = "Beats";
            track["locked"] = true;
            tracks[0] = track;
            doc["tracks"] = tracks;
            return doc;
        });
        QCOMPARE(sequencer()->property("trackName").toString(), QStringLiteral("Beats"));
        QVERIFY(!sequencer()->property("editable").toBool());
    }

    // F29: a device automation ramp keeps fractional values.
    void deviceRampKeepsFractions() {
        const QVariantMap g{{"kind", "cmdAlt"}, {"mode", "value"}, {"start", 0}, {"end", 2}, {"from", 0.2}, {"to", 0.8},
                            {"row", QVariantMap{{"type", "automation"}, {"targetKind", "device"}}}};
        const auto list = call("rampValues", g).toList();
        QCOMPARE(list.size(), 3);
        QCOMPARE(list[0].toMap()["value"].toDouble(), 0.2);
        QCOMPARE(list[1].toMap()["value"].toDouble(), 0.5);
        QCOMPARE(list[2].toMap()["value"].toDouble(), 0.8);
    }

    // F30: Faster always shortens the step.
    void fasterShortensTheRate() {
        QCOMPARE(call("nudgedRate", "1", 1).toString(), QStringLiteral("2D"));
        QCOMPARE(call("nudgedRate", "1", -1).toString(), QStringLiteral("1D"));
        QCOMPARE(call("nudgedRate", "1/16", 1).toString(), QStringLiteral("32D"));
        QCOMPARE(call("nudgedRate", "1/4", -1).toString(), QStringLiteral("2T"));
    }

    // F24: off macOS, Control-Option-S (Ctrl+Alt+S) selects On/Off.
    void onOffKeyOffMac() {
        const QVariantMap event{{"key", int(Qt::Key_S)}, {"text", "s"}};
        QVariant result;
        QMetaObject::invokeMethod(panel(), "resolveKeyAction", Q_RETURN_ARG(QVariant, result), Q_ARG(QVariant, event),
                                  Q_ARG(QVariant, int(Qt::ControlModifier | Qt::AltModifier)), Q_ARG(QVariant, false));
        QCOMPARE(result.toString(), QStringLiteral("onOffMode"));
        QMetaObject::invokeMethod(panel(), "resolveKeyAction", Q_RETURN_ARG(QVariant, result), Q_ARG(QVariant, event),
                                  Q_ARG(QVariant, int(Qt::MetaModifier | Qt::AltModifier)), Q_ARG(QVariant, true));
        QCOMPARE(result.toString(), QStringLiteral("onOffMode"));
    }

    // F26: Add Row offers the web choices, Length has the 4/3/5/7 sections, no dead MIDI Out.
    void addRowAndLengthChoices() {
        const auto groups = sequencer()->property("addRowGroups").toList();
        QHash<QString, QVariantList> byId;
        for (const auto& g : groups) byId.insert(g.toMap()["id"].toString(), g.toMap()["choices"].toList());
        QCOMPARE(byId["drums"].size(), 16);
        bool lowTom = false;
        for (const auto& c : byId["drums"]) {
            const auto m = c.toMap();
            if (m["label"].toString() == "Low Tom") lowTom = m["assignment"].toMap()["pitch"].toInt() == 41;
        }
        QVERIFY(lowTom);
        QCOMPARE(byId["notes"].size(), 128);
        QCOMPARE(byId["degrees"].size(), 7);
        QCOMPARE(byId["controllers"].size(), 130);
        QVERIFY(byId.contains("melodic"));
        const int before = pattern()["rows"].toArray().size();
        call("runAction", "addRow:degrees:2");
        QCOMPARE(pattern()["rows"].toArray().size(), before + 1);
        QCOMPARE(pattern()["pitchSource"].toString(), QStringLiteral("chords"));
        QCOMPARE(pattern()["rows"].toArray().last().toObject()["assignment"].toObject()["degree"].toString(), QStringLiteral("3rd"));
        QStringList lengths;
        for (const auto& e : item("stepSequencerPatternBar")->property("lengthEntries").toList()) {
            const auto m = e.toMap();
            if (m.contains("id")) lengths << m["id"].toString();
        }
        for (const char* n : {"length:3", "length:5", "length:7", "length:63", "length:64"}) QVERIFY2(lengths.contains(n), n);
        QVERIFY(!item("stepSequencerMidiOut"));
    }

    // F26: the inspector shows assignment, color, condition, articulation, and ramps edit relatively.
    void inspectorShowsEveryField() {
        op("set_steps", {{"row", "k"}, {"steps", "1"}, {"values", QVariantMap{{"velocityRamp", 10}}}});
        op("set_steps", {{"row", "k"}, {"steps", "2"}, {"values", QVariantMap{{"velocityRamp", 30}}}});
        QMetaObject::invokeMethod(panel(), "selectStep", Q_ARG(QVariant, "k"), Q_ARG(QVariant, 0), Q_ARG(QVariant, false));
        QMetaObject::invokeMethod(panel(), "selectStep", Q_ARG(QVariant, "k"), Q_ARG(QVariant, 1), Q_ARG(QVariant, true));
        auto* inspector = item("stepSequencerInspector");
        QMetaObject::invokeMethod(inspector, "commitStep", Q_ARG(QVariant, "velocityRamp"), Q_ARG(QVariant, 5));
        QTRY_COMPARE(step(0, 0)["velocityRamp"].toInt(), 15);
        QCOMPARE(step(0, 1)["velocityRamp"].toInt(), 35);
        for (const char* name : {"stepInspectorCondition", "stepInspectorArticulation", "stepInspectorVelocityCurve", "stepInspectorDistribution"}) {
            QVERIFY2(item(name), name);
        }
        panel()->setProperty("inspectorTab", "row");
        for (const char* name : {"stepInspectorAssignment", "stepInspectorRowColor"}) QVERIFY2(item(name), name);
        QMetaObject::invokeMethod(inspector, "setCondition", Q_ARG(QVariant, "2:4"));
        QTRY_COMPARE(step(0, 0)["condition"].toObject()["cycles"].toInt(), 4);
        QCOMPARE(step(0, 1)["condition"].toObject()["iteration"].toInt(), 2);
    }

    // F17: page overviews draw without one item per step.
    void pageOverviewsStaySmall() {
        auto* pages = item("stepSequencerPages");
        QVERIFY(pages);
        QVERIFY2(descendants(pages) < 12, qPrintable(QString::number(descendants(pages))));
    }

    // F19: a browser search updates rows in place, without a model reset.
    void browserSearchKeepsTheModel() {
        auto* library = sequencer()->property("libraryModel").value<QAbstractItemModel*>();
        QVERIFY(library);
        const int all = library->rowCount();
        QSignalSpy resets(library, &QAbstractItemModel::modelReset);
        QMetaObject::invokeMethod(sequencer(), "setLibraryQuery", Q_ARG(QString, "boom"));
        QVERIFY(library->rowCount() > 0 && library->rowCount() < all);
        QMetaObject::invokeMethod(sequencer(), "setLibraryQuery", Q_ARG(QString, ""));
        QCOMPARE(library->rowCount(), all);
        QCOMPARE(resets.count(), 0);
    }

    // F12: the unused step pattern edit is not registered.
    void noUnusedStepPatternEdit() { QVERIFY(!nt::app::findEdit(QStringLiteral("midi.stepPatternOp"))); }

    // S-F31: the Length select offers 1 and 2 steps.
    void lengthOffersOneAndTwoSteps() {
        QStringList lengths;
        for (const auto& e : item("stepSequencerPatternBar")->property("lengthEntries").toList()) lengths << e.toMap()["id"].toString();
        QVERIFY(lengths.contains("length:1"));
        QVERIFY(lengths.contains("length:2"));
        call("runAction", "length:1");
        QTRY_COMPARE(pattern()["lengthSteps"].toInt(), 1);
    }

    // S-F32: a row reassigned to another sound shows that sound's name.
    void reassignedRowShowsNewName() {
        panel()->setProperty("selectedRowId", "k");
        panel()->setProperty("inspectorVisible", true);
        auto* inspector = item("stepSequencerInspector");
        QVERIFY(inspector);
        QMetaObject::invokeMethod(inspector, "assignRow", Q_ARG(QVariant, "notes:67"));
        QTRY_COMPARE(sequencer()->property("rows").toList()[0].toMap()["label"].toString(), QStringLiteral("C3"));
    }

    // Add Row lists the parameters of the track's insert effects.
    void addRowListsInsertEffectParameters() {
        model.applyEdit(QStringLiteral("Add Effect"), {}, [](QJsonObject doc, const QJsonObject&) {
            auto tracks = doc["tracks"].toArray();
            auto t = tracks[0].toObject();
            t["effects"] = QJsonArray{QJsonObject{{"id", "fx1"}, {"type", "eq3"}, {"enabled", true}}};
            tracks[0] = t;
            doc["tracks"] = tracks;
            return doc;
        });
        QVariantList choices;
        QString groupId;
        for (const auto& g : sequencer()->property("addRowGroups").toList()) {
            if (g.toMap()["id"].toString().startsWith("effect")) {
                groupId = g.toMap()["id"].toString();
                choices = g.toMap()["choices"].toList();
            }
        }
        QCOMPARE(choices.size(), 7);
        call("runAction", "addRow:" + groupId + ":0");
        const auto target = pattern()["rows"].toArray().last().toObject()["assignment"].toObject()["target"].toObject();
        QCOMPARE(target["kind"].toString(), QStringLiteral("device"));
        QCOMPARE(target["deviceId"].toString(), QStringLiteral("fx1"));
    }

    // SQ38: the Learn button replaces Add Row; note 38 adds a Snare row once.
    void learnAddButtonAndNote() {
        call("runAction", "learnAdd");
        QCOMPARE(sequencer()->property("learnMode").toString(), QStringLiteral("add"));
        QTRY_VERIFY(item("stepSequencerLearn") && item("stepSequencerLearn")->isVisible());
        const int before = pattern()["rows"].toArray().size();
        QMetaObject::invokeMethod(sequencer(), "learnNote", Q_ARG(int, 50), Q_ARG(QString, QString()));
        QMetaObject::invokeMethod(sequencer(), "learnNote", Q_ARG(int, 50), Q_ARG(QString, QString()));
        QCOMPARE(pattern()["rows"].toArray().size(), before + 1);
        auto* learn = item("stepSequencerLearn");
        const auto center = learn->mapToScene({learn->width() / 2, learn->height() / 2}).toPoint();
        QTest::mouseMove(window.get(), center);
        QTest::mouseClick(window.get(), Qt::LeftButton, {}, center);
        QTRY_COMPARE(sequencer()->property("learnMode").toString(), QString());
    }

    void sq3bN1RecordShortRowAdvances() {
        const auto shortened = op("set_pattern_row", {{"row", "k"}, {"lengthSteps", 4}});
        QVERIFY(shortened.value("ok").toBool());
        sequencer()->setProperty("stepRecording", true);
        sequencer()->setProperty("recordStep", 5);
        QMetaObject::invokeMethod(sequencer(), "stepRecordNoteOn", Q_ARG(int, 36), Q_ARG(int, 91));
        QMetaObject::invokeMethod(sequencer(), "stepRecordNoteOff", Q_ARG(int, 36));
        QCOMPARE(sequencer()->property("recordStep").toInt(), 6);
        QCOMPARE(step(0, 1).value("velocity").toInt(), 91);
    }

    // SQ40: held keys turn on rows at the record step; the release of the last one moves on.
    void stepRecordChordAdvancesOnce() {
        sequencer()->setProperty("stepRecording", true);
        sequencer()->setProperty("recordStep", 1);
        for (int p : {36, 38, 50}) QMetaObject::invokeMethod(sequencer(), "stepRecordNoteOn", Q_ARG(int, p), Q_ARG(int, 100));
        QCOMPARE(sequencer()->property("recordStep").toInt(), 1);
        for (int p : {36, 38, 50}) QMetaObject::invokeMethod(sequencer(), "stepRecordNoteOff", Q_ARG(int, p));
        QCOMPARE(sequencer()->property("recordStep").toInt(), 2);
        int on = 0;
        for (const auto& r : pattern()["rows"].toArray()) on += r.toObject()["steps"].toArray()[1].toObject()["on"].toBool() ? 1 : 0;
        QCOMPARE(on, 3);
    }

    // SQ43: Save Pattern adds a user entry to the browser, and it loads back.
    void browserSavesUserPattern() {
        QTemporaryDir dir;
        nt::midi::setUserStepPatternLibraryRoot(dir.path());
        auto* library = sequencer()->property("libraryModel").value<QAbstractItemModel*>();
        const int before = library->rowCount();
        QVariantMap saved;
        QMetaObject::invokeMethod(sequencer(), "savePattern", Q_RETURN_ARG(QVariantMap, saved), Q_ARG(QString, "Mine"), Q_ARG(QString, "pattern"), Q_ARG(QString, "Grooves"));
        QVERIFY2(saved["ok"].toBool(), qPrintable(saved["error"].toString()));
        QVERIFY(library->rowCount() > before);
        panel()->setProperty("browserVisible", true);
        QTRY_VERIFY(item("stepSequencerBrowserSave"));
        QVERIFY(capture("sq3b-browser-user"));
        nt::midi::setUserStepPatternLibraryRoot({});
    }

    // Review screenshots, written when NT_PANEL_SCREENSHOTS is set.
    void screenshots() {
        QVERIFY(capture("sq3-onoff"));
        panel()->setProperty("editMode", "velocity");
        op("set_pattern_row", {{"row", "k"}, {"subrows", QVariantList{"velocity", "gate", "chance", "note"}}});
        QMetaObject::invokeMethod(panel(), "toggleSubrows", Q_ARG(QVariant, "k"), Q_ARG(QVariant, false));
        panel()->setProperty("selectedRowId", "k");
        QVERIFY(capture("sq3-velocity-subrows"));
        panel()->setProperty("editMode", "onOff");
        panel()->setProperty("browserVisible", true);
        QMetaObject::invokeMethod(panel(), "selectStep", Q_ARG(QVariant, "k"), Q_ARG(QVariant, 0), Q_ARG(QVariant, false));
        QVERIFY(capture("sq3-browser-step-inspector"));
        call("runAction", "learnAdd");
        QVERIFY(capture("sq3b-learn"));
    }
};

QTEST_MAIN(TestStepSequencerUi)
#include "tst_stepsequencerui.moc"
