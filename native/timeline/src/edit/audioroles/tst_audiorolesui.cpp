// The Audio panel, the loudness meter and the gain dialog's Normalize modes, mounted in the real editor and driven
// with pointer and key events. No sound: the editor runs without an audio engine.

#include "AudioRoleJson.h"
#include "AudioRoles.h"
#include "AudioRolesTestSupport.h"
#include "DockLayoutStore.h"
#include "edit/ClipGestureController.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"

#include <QGuiApplication>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQmlProperty>
#include <QQuickItem>
#include <QQuickWindow>
#include <QSignalSpy>
#include <QTemporaryDir>
#include <QtTest>

#include <memory>

using namespace audioroles_test;

namespace {

QQuickItem* findItem(QQuickItem* root, const QString& name) {
    if (!root) return nullptr;
    if (root->objectName() == name) return root;
    for (auto* child : root->childItems()) {
        if (auto* found = findItem(child, name)) return found;
    }
    return nullptr;
}

struct Editor {
    TimelineModel model;
    PlaybackClock clock;
    QQmlEngine engine;
    QQuickWindow window;
    std::unique_ptr<QObject> object;
    QString error;
    explicit Editor(const QByteArray& source) {
        auto parsed = nt::parseTimelineJson(source);
        Q_ASSERT(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        QQmlComponent component(&engine, QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/TimelineEditor.qml"));
        object.reset(component.createWithInitialProperties({{"timeline", QVariant::fromValue(&model)},
            {"clock", QVariant::fromValue(&clock)}, {"width", 1280}, {"height", 900}}));
        error = component.errorString();
        window.resize(1280, 900);
        if (root()) root()->setParentItem(window.contentItem());
        window.show();
    }
    QQuickItem* root() const { return qobject_cast<QQuickItem*>(object.get()); }
    QQuickItem* item(const QString& name) const { return findItem(root(), name); }
    ClipGestureController* gestures() const { return object->findChild<ClipGestureController*>("clipGestures"); }
    DockLayoutStore* store() const { return qobject_cast<DockLayoutStore*>(root()->property("dockStore").value<QObject*>()); }
    // Scrolls the panel so `target` is on screen, then clicks its centre with a real pointer event.
    void click(QQuickItem* target) {
        QVERIFY2(target, "item to click");
        if (auto* viewport = item("audioViewport")) {
            const auto inContent = target->mapToItem(viewport->property("contentItem").value<QQuickItem*>(), QPointF(0, 0));
            viewport->setProperty("contentY", std::max(0.0, inContent.y() - 120));
        }
        QTest::qWait(30);
        const auto point = target->mapToScene(QPointF(target->width() / 2, target->height() / 2)).toPoint();
        QTest::mouseClick(&window, Qt::LeftButton, Qt::NoModifier, point);
    }
};

QJsonObject clipOf(const QJsonObject& doc, const QString& id) {
    for (const auto& v : doc.value("clips").toArray()) {
        if (v.toObject().value("id").toString() == id) return v.toObject();
    }
    return {};
}

}  // namespace

class TestAudioRolesUi : public QObject {
    Q_OBJECT
    QTemporaryDir m_dir;
    QByteArray m_doc;

    QByteArray makeDocument() {
        const auto voice = m_dir.filePath("voice.wav");
        const auto bed = m_dir.filePath("bed.wav");
        writeWav(voice, speech(10, 0.4f, [](double t) { return (t >= 2 && t < 4) || (t >= 6 && t < 7.5); }), 2);
        writeWav(bed, tone(10, 220, 0.2f), 2);
        return document({audioTrack("voice", 0), audioTrack("music", 1)},
                        {audioClip("dlg", "voice", voice, 0, 10000, "dialogue"), audioClip("mus", "music", bed, 0, 10000)}, 10000);
    }
    // Opens the Audio workspace and waits until the panel has found its editor.
    void showPanel(Editor& e) {
        QVERIFY2(e.object, qPrintable(e.error));
        QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        e.store()->switchWorkspace(e.store()->workspaces().indexOf("Audio"));
        QTRY_VERIFY_WITH_TIMEOUT(e.item("audioPanel") && e.item("audioPanel")->isVisible(), 5000);
        QTRY_VERIFY_WITH_TIMEOUT(static_cast<bool>(e.item("audioPanel")->property("roles").value<QObject*>()), 5000);
    }

private slots:
    void initTestCase() { QVERIFY(m_dir.isValid()); m_doc = makeDocument(); }

    void theAudioWorkspaceShowsThePanel() {
        Editor e(m_doc);
        QVERIFY2(e.object, qPrintable(e.error));
        QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        QVERIFY(e.store()->workspaces().contains("Audio"));
        e.store()->switchWorkspace(e.store()->workspaces().indexOf("Audio"));
        QTRY_VERIFY_WITH_TIMEOUT(e.item("audioPanel") && e.item("audioPanel")->isVisible(), 5000);
        // The workspace puts the panel in front of the other right-hand panels.
        QVERIFY(e.item("loudnessMeter"));
        QVERIFY(e.item("audioRole-music") && e.item("audioMatch") && e.item("audioDuck"));
    }

    void reviewShowsNoAudioPanelAfterTheAudioWorkspace() {
        Editor e(m_doc);
        showPanel(e);
        auto* dock = e.root()->property("dockCanvas").value<QObject*>();
        QVERIFY(dock);
        QVERIFY(dock->property("visiblePanels").toStringList().contains("audio"));
        // The panel came with the Audio workspace and must not stay when Review shows no side panel.
        e.store()->switchWorkspace(e.store()->workspaces().indexOf("Review"));
        QTRY_VERIFY(!dock->property("visiblePanels").toStringList().contains("audio"));
        QCOMPARE(dock->property("rightExtent").toInt(), 0);
        e.store()->switchWorkspace(e.store()->workspaces().indexOf("Audio"));
        QTRY_VERIFY(dock->property("visiblePanels").toStringList().contains("audio"));
    }

    void clickingARoleSetsItInOneUndoEntryAndAgainClearsIt() {
        Editor e(m_doc);
        showPanel(e);
        e.gestures()->setSelection({"mus"});
        auto* music = e.item("audioRole-music");
        QTRY_VERIFY(music->property("enabled").toBool());
        QVERIFY(!music->property("active").toBool());
        e.click(music);
        QCOMPARE(clipOf(e.model.timeline().raw, "mus").value("audioRole").toString(), QString("music"));
        QCOMPARE(e.model.undoStack()->count(), 1);
        QTRY_VERIFY(e.item("audioRole-music")->property("active").toBool());
        e.click(e.item("audioRole-ambience"));
        QCOMPARE(clipOf(e.model.timeline().raw, "mus").value("audioRole").toString(), QString("ambience"));
        QTRY_VERIFY(e.item("audioRole-ambience")->property("active").toBool());
        QVERIFY(!e.item("audioRole-music")->property("active").toBool());
        e.click(e.item("audioRole-ambience"));
        QVERIFY(!clipOf(e.model.timeline().raw, "mus").contains("audioRole"));
        QCOMPARE(e.model.undoStack()->count(), 3);
        e.model.undoStack()->undo();
        QCOMPARE(clipOf(e.model.timeline().raw, "mus").value("audioRole").toString(), QString("ambience"));
    }

    void roleButtonsWaitForAClip() {
        Editor e(m_doc);
        showPanel(e);
        e.gestures()->setSelection({});
        QTRY_VERIFY(!e.item("audioRole-music")->property("enabled").toBool());
        QVERIFY(e.item("audioRoleHint")->property("text").toString().contains("Select an audio clip"));
        e.gestures()->setSelection({"dlg", "mus"});
        QTRY_VERIFY(e.item("audioRole-music")->property("enabled").toBool());
        QVERIFY(e.item("audioRoleHint")->property("text").toString().contains("different roles"));
    }

    void matchLoudnessByClickShowsProgressAndTheResult() {
        Editor e(m_doc);
        showPanel(e);
        auto* roles = AudioRoles::forTimeline(&e.model);
        e.gestures()->setSelection({"dlg"});
        QSignalSpy finished(roles, &AudioRoles::finished);
        e.click(e.item("audioMatch"));
        QVERIFY(roles->busy());
        QTRY_VERIFY_WITH_TIMEOUT(e.item("audioProgress") && e.item("audioProgress")->isVisible() || finished.count() == 1, 5000);
        QTRY_COMPARE_WITH_TIMEOUT(finished.count(), 1, 30000);
        QVERIFY(finished.first().at(1).toBool());
        QCOMPARE(e.model.undoStack()->count(), 1);
        QVERIFY(clipOf(e.model.timeline().raw, "dlg").contains("volumeDb"));
        // Only the selected clip changes. "mus" has no role and was not selected.
        QVERIFY(!clipOf(e.model.timeline().raw, "mus").contains("volumeDb"));
        QTRY_VERIFY(e.item("audioMessage") && e.item("audioMessage")->isVisible());
        QVERIFY(e.item("audioMessage")->property("message").toString().contains("Matched 1 clip"));
        QVERIFY(!e.item("audioProgress")->isVisible());
    }

    void matchLoudnessCanBeCancelledFromThePanel() {
        const auto longPath = m_dir.filePath("long.wav");
        writeWav(longPath, tone(120, 440, 0.2f), 2);
        Editor e(document({audioTrack("a", 0)}, {audioClip("long", "a", longPath, 0, 120000, "music")}, 120000));
        showPanel(e);
        auto* roles = AudioRoles::forTimeline(&e.model);
        QSignalSpy finished(roles, &AudioRoles::finished);
        e.gestures()->setSelection({"long"});
        e.click(e.item("audioMatch"));
        QTRY_VERIFY_WITH_TIMEOUT(e.item("audioCancel") && e.item("audioCancel")->isVisible(), 5000);
        QVERIFY(!e.item("audioMatch")->property("enabled").toBool());
        e.click(e.item("audioCancel"));
        QTRY_COMPARE_WITH_TIMEOUT(finished.count(), 1, 30000);
        QVERIFY(!finished.first().at(1).toBool());
        QCOMPARE(e.model.undoStack()->count(), 0);
        QTRY_VERIFY(e.item("audioMessage")->isVisible());
        QVERIFY(e.item("audioMessage")->property("message").toString().contains("Cancelled"));
        QTRY_VERIFY(e.item("audioMatch")->property("enabled").toBool());
    }

    void duckByClickWritesTheLane() {
        Editor e(m_doc);
        showPanel(e);
        auto* roles = AudioRoles::forTimeline(&e.model);
        QVERIFY(e.model.applyEdit("setClipsAudioRole", {{"selectedIds", QJsonArray{"mus"}}, {"role", "music"}}));
        QSignalSpy finished(roles, &AudioRoles::finished);
        e.gestures()->setSelection({"mus"});
        e.click(e.item("audioDuck"));
        QTRY_COMPARE_WITH_TIMEOUT(finished.count(), 1, 30000);
        QVERIFY(finished.first().at(1).toBool());
        QCOMPARE(e.model.undoStack()->count(), 2);
        QTRY_VERIFY(e.item("audioMessage")->property("message").toString().contains("Ducked 1 clip"));
        const auto track = e.model.timeline().raw.value("tracks").toArray()[1].toObject();
        QCOMPARE(track.value("automation").toArray()[0].toObject().value("points").toArray().size(), 10);
    }

    void aTargetIsEditedWithTheKeyboard() {
        Editor e(m_doc);
        showPanel(e);
        auto* roles = AudioRoles::forTimeline(&e.model);
        auto* field = e.item("audioTarget-sfx");
        QVERIFY(field);
        e.click(field);
        QTRY_VERIFY(field->hasActiveFocus());
        QTest::keyClick(&e.window, Qt::Key_A, Qt::ControlModifier);
        for (const char key : {'-', '1', '8'}) QTest::keyClick(&e.window, key);
        QTest::keyClick(&e.window, Qt::Key_Return);
        QTRY_COMPARE(roles->targets().value("sfx").toDouble(), -18.0);
        roles->setTarget("sfx", -21);
    }

    void theGainDialogNormalizesLoudness() {
        Editor e(m_doc);
        showPanel(e);
        auto* roles = AudioRoles::forTimeline(&e.model);
        // The dialog is what the G key opens (tst_keyboardpresets covers the key). Here it is mounted directly.
        QQmlComponent component(&e.engine);
        component.setData(R"(import QtQuick
import NodeTool.Timeline
AudioGainDialog { clipIds: ["dlg"] })", QUrl());
        std::unique_ptr<QObject> dialogOwner(component.createWithInitialProperties({{"timeline", QVariant::fromValue(&e.model)},
            {"parent", QVariant::fromValue(e.window.contentItem())}}));
        QVERIFY2(dialogOwner, qPrintable(component.errorString()));
        auto* dialog = dialogOwner.get();
        QVERIFY(QMetaObject::invokeMethod(dialog, "open"));
        QTRY_VERIFY(dialog->property("visible").toBool());
        // Choose the mode like the user does: the select commits a value.
        auto* mode = dialog->findChild<QObject*>("gainChangeMode");
        QVERIFY(mode);
        QVERIFY(QMetaObject::invokeMethod(mode, "valueCommitted", Q_ARG(QVariant, QVariant(QString("loudness")))));
        QTRY_COMPARE(dialog->property("mode").toString(), QString("loudness"));
        // The role of the clip names the default target: Dialogue, -23 LUFS.
        QTRY_COMPARE(dialog->property("dbText").toString(), QString("-23"));
        auto* apply = dialog->findChild<QQuickItem*>("gainApply");
        QVERIFY(apply);
        QCOMPARE(apply->property("text").toString(), QString("Normalize"));
        if (const auto out = qEnvironmentVariable("NT_AUDIO_SHOTS"); !out.isEmpty()) {
            QTest::qWait(200);
            QVERIFY(e.window.grabWindow().save(out + "/gain-dialog-normalize.png"));
        }
        QSignalSpy finished(roles, &AudioRoles::finished);
        QTest::mouseClick(&e.window, Qt::LeftButton, Qt::NoModifier,
                          apply->mapToScene(QPointF(apply->width() / 2, apply->height() / 2)).toPoint());
        QTRY_VERIFY_WITH_TIMEOUT(roles->busy() || finished.count() == 1, 5000);
        QTRY_COMPARE_WITH_TIMEOUT(finished.count(), 1, 30000);
        QVERIFY(finished.first().at(1).toBool());
        QTRY_VERIFY(!dialog->property("visible").toBool());
        QVERIFY(clipOf(e.model.timeline().raw, "dlg").contains("volumeDb"));
        QCOMPARE(e.model.undoStack()->count(), 1);
        // A value out of range is refused before anything is measured.
        QVERIFY(QMetaObject::invokeMethod(dialog, "open"));
        QTRY_VERIFY(dialog->property("visible").toBool());
        dialog->setProperty("mode", "loudness");
        dialog->setProperty("dbText", "5");
        QVERIFY(!dialog->property("valid").toBool());
        QVERIFY(QMetaObject::invokeMethod(dialog, "confirm"));
        QVERIFY(!roles->busy());
        QCOMPARE(e.model.undoStack()->count(), 1);
        QVERIFY(QMetaObject::invokeMethod(dialog, "close"));
    }

    void theMeterReadsAndJudges() {
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.Timeline
LoudnessMeterView { width: 320 })", QUrl());
        std::unique_ptr<QObject> meter(component.create());
        QVERIFY2(meter, qPrintable(component.errorString()));
        auto* view = qobject_cast<QQuickItem*>(meter.get());
        // Nothing has played: the readouts show no value and the idle text explains why.
        QCOMPARE(findItem(view, "meterValue-integrated")->property("text").toString(), QString("--"));
        QVERIFY(findItem(view, "meterIdle")->isVisible());
        QVERIFY(!findItem(view, "meterVerdict")->isVisible());
        const auto read = [&](double integrated, double peak) {
            meter->setProperty("reading", QVariantMap{{"available", true}, {"active", true}, {"momentary", integrated},
                {"shortTerm", integrated}, {"integrated", integrated}, {"truePeakDb", peak}});
        };
        read(-23.2, -3);
        QCOMPARE(findItem(view, "meterValue-integrated")->property("text").toString(), QString("-23.2"));
        QVERIFY(findItem(view, "meterVerdict")->isVisible());
        QCOMPARE(findItem(view, "meterVerdict")->property("message").toString(), QString("On target"));
        read(-18.0, -3);
        QCOMPARE(findItem(view, "meterVerdict")->property("message").toString(), QString("5.0 LU too loud"));
        read(-23.0, 1.5);
        QCOMPARE(findItem(view, "meterVerdict")->property("message").toString(), QString("Over -1 dBTP"));
        meter->setProperty("standardId", "online");
        read(-16.3, -2);
        QCOMPARE(findItem(view, "meterVerdict")->property("message").toString(), QString("On target"));
        meter->setProperty("standardId", "none");
        QVERIFY(!findItem(view, "meterVerdict")->isVisible());
    }

    void screenshotOfThePanel() {
        Editor e(m_doc);
        showPanel(e);
        e.gestures()->setSelection({"dlg"});
        QTest::qWait(200);
        const auto out = qEnvironmentVariable("NT_AUDIO_SHOTS");
        if (out.isEmpty()) QSKIP("set NT_AUDIO_SHOTS to a folder to save a screenshot");
        QVERIFY(e.window.grabWindow().save(out + "/audio-panel.png"));
    }
};

int main(int argc, char** argv) {
    qputenv("QT_QPA_PLATFORM", "offscreen");
    QGuiApplication app(argc, argv);
    TestAudioRolesUi test;
    return QTest::qExec(&test, argc, argv);
}
#include "tst_audiorolesui.moc"
