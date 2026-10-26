#include "SpeedController.h"
#include "SpeedOperations.h"
#include "app/EditRegistry.h"
#include "audio/Mixer.h"
#include "edit/ClipGestureController.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include "preview/SceneEval.h"
#include <QFile>
#include <QGuiApplication>
#include <QJsonDocument>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWindow>
#include <QtTest>
#include <memory>

namespace {
QQuickItem* findItem(QQuickItem* root, const QString& name) {
    if (root->objectName() == name) {
        return root;
    }
    for (auto* child : root->childItems()) {
        if (auto* found = findItem(child, name)) {
            return found;
        }
    }
    return nullptr;
}
QByteArray document() {
    return R"({"name":"Speed","width":640,"height":360,"fps":30,"durationMs":10000,"tracks":[{"id":"a","type":"audio","index":0}],"clips":[{"id":"c","trackId":"a","mediaType":"audio","mediaPath":"unused.wav","status":"generated","startMs":100,"durationMs":1000,"inPointMs":200},{"id":"later","trackId":"a","mediaType":"audio","mediaPath":"unused.wav","status":"generated","startMs":1100,"durationMs":1000}]})";
}
} // namespace
class TestSpeed : public QObject {
    Q_OBJECT
  private slots:
    void init() {
        QTest::failOnWarning(QRegularExpression(".*(TypeError|ReferenceError|Binding loop|Unable to assign).*"));
    }
    void largeSelectionRetime() {
        QJsonArray clips;
        QJsonArray ids;
        for (int i = 0; i < 20000; ++i) {
            const auto id = QString::number(i);
            clips.append(QJsonObject{{"id", id}, {"trackId", "a"}, {"startMs", i * 1000.0}, {"durationMs", 1000}});
            ids.append(id);
        }
        const auto edit = nt::speed::retimeClipSpeed;
        const auto result =
            edit({{"clips", clips}}, {{"clipIds", ids}, {"speedMultiplier", 2}}).value("clips").toArray();
        QCOMPARE(result.size(), clips.size());
        for (qsizetype i = 0; i < result.size(); ++i) {
            QCOMPARE(result[i].toObject().value("id"), clips[i].toObject().value("id"));
            QCOMPARE(result[i].toObject().value("durationMs").toDouble(), 500.0);
        }
    }
    void staleGestureNeverEditsAReplacement() {
        TimelineModel model;
        auto parsed = nt::parseTimelineJson(document());
        QVERIFY(parsed.timeline);
        model.setTimeline(*parsed.timeline);
        SpeedController controller;
        controller.setModel(&model);
        controller.beginGesture("setClipSpeed", {{"clipId", "c"}});
        controller.preview({{"speedMultiplier", 2}});
        model.setTimeline(*parsed.timeline);
        const auto replacement = model.documentJson();
        controller.commit("setClipSpeed", {{"clipId", "c"}, {"speedMultiplier", 4}});
        QCOMPARE(model.documentJson(), replacement);
        QCOMPARE(model.undoStack()->count(), 0);
    }
    void gestureKeepsItsOriginalTarget() {
        TimelineModel model;
        auto parsed = nt::parseTimelineJson(document());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        SpeedController controller;
        controller.setModel(&model);
        controller.beginGesture("setClipSpeed", {{"clipId", "c"}});
        controller.preview({{"clipId", "later"}, {"speedMultiplier", 2}});
        controller.commit("setClipSpeed", {{"clipId", "later"}, {"speedMultiplier", 4}});
        QCOMPARE(model.clipsJson()[0].toObject().value("speedMultiplier").toDouble(), 4.0);
        QVERIFY(!model.clipsJson()[1].toObject().contains("speedMultiplier"));
        QCOMPARE(model.undoStack()->count(), 1);
    }
    void remapActionsAndBakedTiming() {
        TimelineModel model;
        auto parsed = nt::parseTimelineJson(document());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        const auto before = model.documentJson();
        QVERIFY(model.applyEdit("setClipTimeRemap", {{"clipId", "c"}, {"operation", "enable"}}));
        QCOMPARE(model.undoStack()->count(), 1);
        QVERIFY(model.applyEdit(
            "setClipTimeRemap",
            {{"clipId", "c"}, {"operation", "patch"}, {"index", 0}, {"patch", QJsonObject{{"sourceMs", 4000}}}}));
        QCOMPARE(model.undoStack()->count(), 2);
        QVERIFY(!model.applyEdit(
            "setClipTimeRemap",
            {{"clipId", "c"}, {"operation", "patch"}, {"index", 0}, {"patch", QJsonObject{{"t", 1}}}}));
        QVERIFY(!model.applyEdit("setClipSpeed", {{"clipId", "c"}, {"speedMultiplier", 2}}));
        QCOMPARE(model.undoStack()->count(), 2);
        model.undoStack()->undo();
        model.undoStack()->undo();
        QCOMPARE(model.documentJson(), before);
        auto raw = QJsonDocument::fromJson(before).object();
        auto clips = raw.value("clips").toArray();
        auto clip = clips[0].toObject();
        clip.insert("speedBaked", true);
        clips[0] = clip;
        raw.insert("clips", clips);
        parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        QVERIFY(model.applyEdit("setClipSpeed", {{"clipId", "c"}, {"speedMultiplier", 4}}));
        const auto mix = nt::audio::buildMixPlan(model.timeline());
        QCOMPARE(mix.voices[0].sourceRate, 1.0);
        QCOMPARE(mix.voices[0].durationMs, 1000.0);
        QCOMPARE(nt::clipSourceMsAt(model.timeline().clips[0], 600), 700.0);
        QVERIFY(!model.clipsJson()[0].toObject().contains("keepPitch"));
        QVERIFY(!model.clipsJson()[0].toObject().contains("preservesPitch"));
    }
    void remapScrubAcrossRows() {
        TimelineModel model;
        auto parsed = nt::parseTimelineJson(document());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        QVERIFY(model.applyEdit("setClipTimeRemap", {{"clipId", "c"}, {"operation", "enable"}}));
        QVERIFY(model.applyEdit("setClipTimeRemap", {{"clipId", "c"}, {"operation", "add"}}));
        SpeedController controller;
        controller.setModel(&model);
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.Timeline
SpeedTimeRemap { width: 360; required property SpeedController edits; controller: edits; clip: edits.document.clips[0]; open: true })",
                          QUrl());
        std::unique_ptr<QObject> panel(
            component.createWithInitialProperties({{"edits", QVariant::fromValue(&controller)}}));
        QVERIFY2(panel, qPrintable(component.errorString()));
        auto* pill = findItem(qobject_cast<QQuickItem*>(panel.get()), "remapTime0");
        QVERIFY(pill);
        const auto before = model.documentJson();
        QVERIFY(QMetaObject::invokeMethod(pill, "gestureStarted"));
        QVERIFY(QMetaObject::invokeMethod(pill, "preview", Q_ARG(QString, "0.9")));
        QCOMPARE(model.undoStack()->count(), 2);
        QCOMPARE(pill->property("value").toString(), QString("0.9"));
        QVERIFY(QMetaObject::invokeMethod(pill, "commit", Q_ARG(QString, "0.9")));
        QCOMPARE(panel->property("duplicate").toBool(), false);
        QCOMPARE(model.undoStack()->count(), 3);
        const auto frames = model.clipsJson()[0].toObject().value("timeRemap").toObject().value("keyframes").toArray();
        QCOMPARE(frames[1].toObject().value("t").toDouble(), 0.9);
        QCOMPARE(frames[1].toObject().value("sourceMs").toDouble(), 200.0);
        model.undoStack()->undo();
        QCOMPARE(model.documentJson(), before);
    }
    void panelAndGesture() {
        TimelineModel model;
        auto parsed = nt::parseTimelineJson(document());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        PlaybackClock clock;
        QQmlEngine engine;
        QQmlComponent component(&engine, QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/TimelineEditor.qml"));
        std::unique_ptr<QObject> editor(
            component.createWithInitialProperties({{"timeline", QVariant::fromValue(&model)},
                                                   {"clock", QVariant::fromValue(&clock)},
                                                   {"width", 1200},
                                                   {"height", 800}}));
        QVERIFY2(editor, qPrintable(component.errorString()));
        auto* gestures = editor->findChild<ClipGestureController*>();
        QVERIFY(gestures);
        gestures->setSelection({"c"});
        auto* panel = findItem(qobject_cast<QQuickItem*>(editor.get()), "inspectorSpeed");
        QVERIFY(panel);
        QTRY_VERIFY(panel->property("clip").toMap().value("id").toString() == "c");
        auto* pill = panel->findChild<QObject*>("speedPill");
        QVERIFY(pill);
        const auto before = model.documentJson();
        pill->setProperty("draft", "2");
        QVERIFY(QMetaObject::invokeMethod(pill, "commitDraft"));
        QCOMPARE(model.clipsJson()[0].toObject().value("speedMultiplier").toDouble(), 2.0);
        QCOMPARE(model.undoStack()->count(), 1);
        model.undoStack()->undo();
        QCOMPARE(model.documentJson(), before);
        QVERIFY(QMetaObject::invokeMethod(pill, "gestureStarted"));
        QVERIFY(QMetaObject::invokeMethod(pill, "preview", Q_ARG(QString, "2")));
        QVERIFY(QMetaObject::invokeMethod(pill, "preview", Q_ARG(QString, "4")));
        QCOMPARE(model.undoStack()->index(), 0);
        QCOMPARE(model.clipsJson()[0].toObject().value("durationMs").toDouble(), 250.0);
        QVERIFY(QMetaObject::invokeMethod(pill, "commit", Q_ARG(QString, "4")));
        QCOMPARE(model.undoStack()->count(), 1);
        model.undoStack()->undo();
        QCOMPARE(model.documentJson(), before);
        QQuickWindow window;
        qobject_cast<QQuickItem*>(editor.get())->setParentItem(window.contentItem());
        auto* shortcut = panel->findChild<QObject*>("speedDurationShortcut");
        QVERIFY(shortcut);
        QVERIFY(QMetaObject::invokeMethod(shortcut, "activated"));
        auto* dialog = panel->findChild<QObject*>("speedDurationDialog");
        QVERIFY(dialog);
        QCOMPARE(dialog->property("speedText").toString(), QString("100"));
        QVERIFY(QMetaObject::invokeMethod(dialog, "handleDuration", Q_ARG(QVariant, "00:00:02:00")));
        QCOMPARE(dialog->property("speedText").toString(), QString("50"));
        dialog->setProperty("ripple", true);
        QVERIFY(QMetaObject::invokeMethod(dialog, "apply"));
        QCOMPARE(model.undoStack()->count(), 1);
        QCOMPARE(model.clipsJson()[0].toObject().value("durationMs").toDouble(), 2000.0);
        const auto mix = nt::audio::buildMixPlan(model.timeline());
        QCOMPARE(mix.voices[0].sourceRate, 0.5);
        QCOMPARE(mix.voices[0].durationMs, 2000.0);
        QCOMPARE(mix.voices[1].startMs, 2100.0);
        QCOMPARE(mix.voices[0].sourceFrameAt(1100, 48000), 33600.0);
        QCOMPARE(nt::clipSourceMsAt(model.timeline().clips[0], 1100), 700.0);
        model.undoStack()->undo();
        QCOMPARE(model.documentJson(), before);
        gestures->setSelection({"c", "later"});
        QVERIFY(shortcut->property("enabled").toBool());
        QVERIFY(QMetaObject::invokeMethod(shortcut, "activated"));
        auto* duration = dialog->findChild<QObject*>("dialogDuration");
        QVERIFY(duration);
        QVERIFY(!duration->property("enabled").toBool());
        QVERIFY(QMetaObject::invokeMethod(dialog, "handleSpeed", Q_ARG(QVariant, "0")));
        QVERIFY(!dialog->property("speedValid").toBool());
        QVERIFY(QMetaObject::invokeMethod(dialog, "apply"));
        QCOMPARE(model.documentJson(), before);
        QVERIFY(QMetaObject::invokeMethod(dialog, "handleSpeed", Q_ARG(QVariant, "200")));
        QVERIFY(QMetaObject::invokeMethod(dialog, "apply"));
        QCOMPARE(model.undoStack()->count(), 1);
        QCOMPARE(model.clipsJson()[0].toObject().value("durationMs").toDouble(), 500.0);
        QCOMPARE(model.clipsJson()[1].toObject().value("durationMs").toDouble(), 500.0);
        model.undoStack()->undo();
        QCOMPARE(model.documentJson(), before);
    }
    void editedTimingAndUndo() {
        TimelineModel model;
        auto parsed = nt::parseTimelineJson(document());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        const auto before = model.documentJson();
        QVERIFY(model.applyEdit("setClipSpeed", {{"clipId", "c"}, {"speedMultiplier", 2}, {"ripple", true}}));
        QCOMPARE(model.undoStack()->count(), 1);
        QCOMPARE(nt::clipSourceMsAt(model.timeline().clips[0], 350), 700.0);
        auto mix = nt::audio::buildMixPlan(model.timeline());
        QCOMPARE(mix.voices.size(), size_t(2));
        QCOMPARE(mix.voices[0].sourceRate, 2.0);
        QCOMPARE(mix.voices[0].durationMs, 500.0);
        QCOMPARE(mix.voices[1].startMs, 1100.0);
        model.undoStack()->undo();
        QCOMPARE(model.documentJson(), before);
        model.undoStack()->redo();
        QVERIFY(model.applyEdit("setClipsSpeed",
                                {{"clipIds", QJsonArray{"c", "later"}}, {"speedMultiplier", 0.5}, {"ripple", true}}));
        QCOMPARE(model.undoStack()->count(), 2);
        mix = nt::audio::buildMixPlan(model.timeline());
        QCOMPARE(mix.voices[0].sourceRate, 0.5);
        QCOMPARE(mix.voices[0].durationMs, 2000.0);
        QCOMPARE(mix.voices[1].startMs, 2600.0);
        QCOMPARE(mix.voices[1].durationMs, 2000.0);
        QCOMPARE(nt::clipSourceMsAt(model.timeline().clips[0], 1100), 700.0);
        model.undoStack()->undo();
        model.undoStack()->undo();
        QCOMPARE(model.documentJson(), before);
    }
};
int main(int argc, char** argv) {
    QGuiApplication app(argc, argv);
    if (app.arguments().contains("--edits")) {
        QFile input;
        if (!input.open(stdin, QIODevice::ReadOnly)) {
            return 1;
        }
        QJsonArray results;
        for (const auto& value : QJsonDocument::fromJson(input.readAll()).array()) {
            const auto request = value.toObject();
            const auto action = request.value("action").toString();
            const nt::app::Edit edit = action == "retimeClipSpeed" ? nt::app::Edit(nt::speed::retimeClipSpeed)
                                                                  : nt::app::findEdit(action);
            const auto raw = request.value("doc").toObject();
            results.append(edit ? edit(raw, request.value("payload").toObject()) : raw);
        }
        QFile output;
        if (!output.open(stdout, QIODevice::WriteOnly)) {
            return 1;
        }
        output.write(QJsonDocument(results).toJson(QJsonDocument::Compact));
        return 0;
    }
    TestSpeed test;
    return QTest::qExec(&test, argc, argv);
}
#include "tst_speed.moc"
