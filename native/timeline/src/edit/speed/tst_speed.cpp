#include "SpeedController.h"
#include "SpeedOperations.h"
#include "app/EditRegistry.h"
#include "audio/Mixer.h"
#include "edit/ClipGestureController.h"
#include "edit/inspectorsections/InspectorSectionRegistry.h"
#include "edit/keyframes/ClipInspectorController.h"
#include <array>
#include <cmath>
#include <numbers>
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
QByteArray remapDocument(const QJsonArray& frames, bool video = false) {
    auto raw = QJsonDocument::fromJson(document()).object();
    auto clip = raw.value("clips").toArray()[0].toObject();
    clip.insert("timeRemap", QJsonObject{{"keyframes", frames}});
    clip.insert("speedMultiplier", 4);
    clip.insert("speedBaked", true);
    if (video) {
        clip.insert("mediaType", "video");
        auto track = raw.value("tracks").toArray()[0].toObject();
        track.insert("type", "video");
        raw.insert("tracks", QJsonArray{track});
    }
    raw.insert("clips", QJsonArray{clip});
    return QJsonDocument(raw).toJson();
}
QJsonObject keyframe(double t, double source, const QString& easing = {}) {
    QJsonObject frame{{"t", t}, {"sourceMs", source}};
    if (!easing.isEmpty()) { frame.insert("easing", easing); }
    return frame;
}
} // namespace
class TestSpeed : public QObject {
    Q_OBJECT
  private slots:
    void init() {
        QTest::failOnWarning(QRegularExpression(".*(TypeError|ReferenceError|Binding loop|Unable to assign).*"));
    }
    void remapPreview_data() {
        QTest::addColumn<QJsonArray>("frames");
        QTest::addColumn<QList<double>>("expected");
        QTest::newRow("ascending with outside freezes")
            << QJsonArray{keyframe(0.25, 100), keyframe(0.75, 1100)}
            << QList<double>{100, 100, 100, 600, 1100, 1100, 1100};
        QTest::newRow("descending")
            << QJsonArray{keyframe(0.25, 1100), keyframe(0.75, 100)}
            << QList<double>{1100, 1100, 1100, 600, 100, 100, 100};
        QTest::newRow("eased by ending keyframe")
            << QJsonArray{keyframe(0, 0), keyframe(1, 800, "easeIn")}
            << QList<double>{0, 0, 12.5, 100, 337.5, 800, 800};
        QTest::newRow("single freeze") << QJsonArray{keyframe(0.5, 777)}
            << QList<double>{777, 777, 777, 777, 777, 777, 777};
        QTest::newRow("clamped negative") << QJsonArray{keyframe(0.5, -20)}
            << QList<double>{0, 0, 0, 0, 0, 0, 0};
        QTest::newRow("unknown easing is linear")
            << QJsonArray{keyframe(0, 0), keyframe(1, 800, "spring(0,10,1)")}
            << QList<double>{0, 0, 200, 400, 600, 800, 800};
        QTest::newRow("array order is preserved")
            << QJsonArray{keyframe(0.75, 300), keyframe(0.25, 200), keyframe(1, 1000)}
            << QList<double>{300, 300, 300, 300, 300, 1000, 1000};
    }
    void remapPreview() {
        QFETCH(QJsonArray, frames);
        QFETCH(QList<double>, expected);
        const auto parsed = nt::parseTimelineJson(remapDocument(frames, true));
        QVERIFY2(parsed.timeline, qPrintable(parsed.error));
        const std::array<double, 7> times{0, 100, 350, 600, 850, 1100, 1200};
        const auto& clip = parsed.timeline->clips[0];
        QCOMPARE(clip.raw.value("timeRemap").toObject().value("keyframes").toArray(), frames);
        for (std::size_t i = 0; i < times.size(); ++i) {
            QCOMPARE(nt::clipSourceMsAt(clip, times[i]), expected[i]);
            if (times[i] >= 100 && times[i] < 1100) {
                const auto scene = nt::evaluateScene(*parsed.timeline, times[i]);
                QCOMPARE(scene.layers.size(), std::size_t{1});
                QCOMPARE(scene.layers[0].sourceTimeMs, expected[i]);
            }
        }
    }
    void remapMixAndOfflineSilence() {
        const auto parsed = nt::parseTimelineJson(remapDocument(
            {keyframe(0.25, 0), keyframe(0.5, 500), keyframe(0.75, 0)}));
        QVERIFY(parsed.timeline);
        const auto plan = nt::audio::buildMixPlan(*parsed.timeline);
        QCOMPARE(plan.voices.size(), std::size_t{4});
        const std::array<double, 4> starts{100, 350, 600, 850};
        const std::array<double, 4> sources{0, 0, 500, 0};
        const std::array<double, 4> rates{0, 2, -2, 0};
        std::array<float, 2002> input;
        input.fill(0.5f);
        std::array<nt::audio::VoicePcm, 4> pcm{};
        for (std::size_t i = 0; i < plan.voices.size(); ++i) {
            const auto& voice = plan.voices[i];
            QCOMPARE(voice.startMs, starts[i]);
            QCOMPARE(voice.durationMs, 250.0);
            QCOMPARE(voice.inPointMs, sources[i]);
            QCOMPARE(voice.sourceRate, rates[i]);
            QCOMPARE(voice.silent, rates[i] <= 0);
            pcm[i].linear = input.data(); pcm[i].linearCount = input.size() / 2;
        }
        std::array<float, 2000> output{};
        nt::audio::MixStats stats;
        nt::audio::mixBlock(plan, pcm.data(), 1000, 100, 1, 1000, output.data(), stats);
        for (int i = 0; i < 1000; ++i) {
            QCOMPARE(output[2 * i], i >= 250 && i < 500 ? 0.5f : 0.0f);
            QCOMPARE(output[2 * i + 1], output[2 * i]);
        }
    }
    void speedShiftsPitch() {
        auto parsed = nt::parseTimelineJson(document());
        QVERIFY(parsed.timeline);
        auto& timeline = *parsed.timeline;
        timeline.clips.resize(1);
        auto& clip = timeline.clips[0];
        clip.startMs = clip.inPointMs = 0; clip.durationMs = 250; clip.speedMultiplier = 2;
        const auto plan = nt::audio::buildMixPlan(timeline);
        constexpr int rate = 48000;
        constexpr int frames = rate / 4;
        std::vector<float> input(rate * 2), output(frames * 2);
        for (int i = 0; i < rate; ++i) {
            input[2 * i] = input[2 * i + 1] = 0.5 * std::sin(2 * std::numbers::pi * 220 * i / rate);
        }
        nt::audio::VoicePcm pcm; pcm.linear = input.data(); pcm.linearCount = rate;
        nt::audio::MixStats stats;
        nt::audio::mixBlock(plan, &pcm, rate, 0, 1000.0 / rate, frames, output.data(), stats);
        int crossings = 0;
        for (int i = 1; i < frames; ++i) {
            if (output[2 * (i - 1)] <= 0 && output[2 * i] > 0) { ++crossings; }
        }
        QCOMPARE(crossings, 110); // 440 Hz over a quarter second.
    }
    void editedRemapReachesPreviewAndMix() {
        TimelineModel model;
        auto parsed = nt::parseTimelineJson(document());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        QVERIFY(model.applyEdit("setClipTimeRemap", {{"clipId", "c"}, {"operation", "enable"}}));
        QVERIFY(model.applyEdit("setClipTimeRemap", {{"clipId", "c"}, {"operation", "patch"},
            {"index", 1}, {"patch", QJsonObject{{"sourceMs", 2200}}}}));
        parsed = nt::parseTimelineJson(model.documentJson());
        QVERIFY(parsed.timeline);
        QCOMPARE(nt::clipSourceMsAt(parsed.timeline->clips[0], 600), 1200.0);
        auto plan = nt::audio::buildMixPlan(*parsed.timeline);
        QCOMPARE(plan.voices[0].sourceRate, 2.0);
        QCOMPARE(plan.voices[0].inPointMs, 200.0);
        model.undoStack()->undo();
        QCOMPARE(nt::clipSourceMsAt(model.timeline().clips[0], 600), 700.0);
        QCOMPARE(nt::audio::buildMixPlan(model.timeline()).voices[0].sourceRate, 1.0);
    }
    void registeredSectionContract() {
        InspectorSectionRegistry registry;
        QVariantMap section;
        for (const auto& entry : registry.sections()) {
            const auto value = entry.toMap();
            if (value.value("id").toString() == "timeRemap") { section = value; }
        }
        QVERIFY2(!section.isEmpty(), "timeRemap must be registered in the Inspector");
        QCOMPARE(section.value("title").toString(), QString("Time remap"));
        QCOMPARE(section.value("order").toInt(), 85);
        TimelineModel model;
        auto parsed = nt::parseTimelineJson(document());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        ClipInspectorController inspector; inspector.setTimeline(&model); inspector.setClipId("c");
        QQmlEngine engine;
        QQmlComponent component(&engine, section.value("source").toUrl());
        std::unique_ptr<QObject> panel(component.createWithInitialProperties({
            {"timelineModel", QVariant::fromValue(&model)}, {"gestures", QVariant()},
            {"controller", QVariant::fromValue(&inspector)}, {"groupMode", false}, {"open", true}}));
        QVERIFY2(panel, qPrintable(component.errorString()));
        QVERIFY(QMetaObject::invokeMethod(panel.get(), "checkedChangedByUser", Q_ARG(bool, true)));
        QCOMPARE(model.undoStack()->count(), 1);
        auto* pill = findItem(qobject_cast<QQuickItem*>(panel.get()), "remapTime1");
        QVERIFY(pill);
        QVERIFY(QMetaObject::invokeMethod(pill, "gestureStarted"));
        QVERIFY(QMetaObject::invokeMethod(pill, "preview", Q_ARG(QString, "0.9")));
        QCOMPARE(model.undoStack()->count(), 1);
        QVERIFY(QMetaObject::invokeMethod(pill, "commit", Q_ARG(QString, "0.8")));
        QCOMPARE(model.undoStack()->count(), 2);
        const auto before = model.documentJson();
        QVERIFY(QMetaObject::invokeMethod(pill, "gestureStarted"));
        QVERIFY(QMetaObject::invokeMethod(pill, "preview", Q_ARG(QString, "0.6")));
        inspector.setClipId("later");
        QCOMPARE(model.documentJson(), before);
        QCOMPARE(model.undoStack()->count(), 2);
        panel->setProperty("groupMode", true);
        QVERIFY(!panel->property("visible").toBool());
        panel->setProperty("groupMode", false);
        auto clips = model.clipsJson();
        auto midi = clips[1].toObject();
        midi.insert("mediaType", "midi"); clips[1] = midi;
        QVERIFY(model.replaceClips(clips));
        QVERIFY(!panel->property("visible").toBool());
        inspector.setClipId("");
        QVERIFY(!panel->property("visible").toBool());
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
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.Timeline
SpeedTimeRemap {
    id: root
    width: 360
    required property TimelineModel testModel
    timelineModel: testModel
    controller: ClipInspectorController { timeline: root.testModel; clipId: "c" }
    open: true
})", QUrl());
        std::unique_ptr<QObject> panel(
            component.createWithInitialProperties({{"testModel", QVariant::fromValue(&model)}}));
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
        auto* panel = findItem(qobject_cast<QQuickItem*>(editor.get()), "inspectorTiming");
        QVERIFY(panel);
        QTRY_VERIFY(panel->property("clip").toMap().value("id").toString() == "c");
        auto* pill = findItem(panel, "timingSpeed");
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
        SpeedController edits;
        edits.setModel(&model);
        QQmlComponent dialogComponent(&engine, QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/Inspector/SpeedDurationDialog.qml"));
        std::unique_ptr<QObject> dialogObject(dialogComponent.createWithInitialProperties({
            {"controller", QVariant::fromValue(&edits)}, {"clipIds", QStringList{"c"}},
            {"parent", QVariant::fromValue(window.contentItem())}}));
        QVERIFY2(dialogObject, qPrintable(dialogComponent.errorString()));
        auto* dialog = dialogObject.get();
        QVERIFY(QMetaObject::invokeMethod(dialog, "openForSelection"));
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
        dialog->setProperty("clipIds", QStringList{"c", "later"});
        QVERIFY(QMetaObject::invokeMethod(dialog, "openForSelection"));
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
    if (app.arguments().contains("--timing")) {
        QFile input;
        if (!input.open(stdin, QIODevice::ReadOnly)) { return 1; }
        QJsonArray results;
        for (const auto& value : QJsonDocument::fromJson(input.readAll()).array()) {
            const auto request = value.toObject();
            const auto parsed = nt::parseTimelineJson(QJsonDocument(request.value("doc").toObject()).toJson());
            if (!parsed.timeline) { qCritical() << parsed.error; return 1; }
            QJsonArray times, scenes, voices;
            const auto& clip = parsed.timeline->clips[0];
            for (const auto& time : request.value("times").toArray()) {
                times.append(nt::clipSourceMsAt(clip, time.toDouble()));
                const auto frame = nt::evaluateScene(*parsed.timeline, time.toDouble());
                scenes.append(frame.layers.empty() ? QJsonValue() : QJsonValue(frame.layers[0].sourceTimeMs));
            }
            for (const auto& voice : nt::audio::buildMixPlan(*parsed.timeline).voices) {
                voices.append(QJsonObject{{"timelineStartMs", voice.startMs},
                    {"timelineEndMs", voice.startMs + voice.durationMs}, {"sourceStartMs", voice.inPointMs},
                    {"sourceEndMs", voice.inPointMs + voice.durationMs * voice.sourceRate},
                    {"rate", voice.sourceRate}, {"reverse", voice.silent}});
            }
            results.append(QJsonObject{{"sourceTimes", times}, {"sceneTimes", scenes}, {"segments", voices}});
        }
        QFile output;
        if (!output.open(stdout, QIODevice::WriteOnly)) { return 1; }
        output.write(QJsonDocument(results).toJson(QJsonDocument::Compact));
        return 0;
    }
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
