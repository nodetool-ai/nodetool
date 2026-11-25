#include "../../tests/RequireValue.h"
#include "../../tests/TestAssetCacheRoot.h"
#include "midi/PatternExpand.h"
#include "midi/PatternOps.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"

#include <QDir>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWindow>
#include <QRegularExpression>
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
                                 "stepSequencerBrowserToggle", "stepSequencerInspectorToggle", "stepSequencerMidiOut",
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
    }
};

QTEST_MAIN(TestStepSequencerUi)
#include "tst_stepsequencerui.moc"
