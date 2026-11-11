#include "DockLayoutStore.h"
#include "app/PanelRegistry.h"
#include "app/Preferences/PreferencesSettings.h"
#include "edit/ClipGestureController.h"
#include "export/FrameCapture.h"
#include "model/TimelineJson.h"
#include "playback/PlaybackClock.h"
#include "runtime/ChatSession.h"
#include "edit/sourceEdit/SourceViewerState.h"
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QMouseEvent>
#include <QQuickItem>
#include <QQuickRenderControl>
#include <QQuickRenderTarget>
#include <QQuickWindow>
#include <QQmlComponent>
#include <QQmlContext>
#include <QQmlEngine>
#include <QTemporaryDir>
#include <QDir>
#include <QtTest>
#include <array>
#include <memory>

namespace {
QQuickItem* named(QQuickItem* root, const QString& name) {
    QList<QQuickItem*> pending{root};
    while (!pending.isEmpty()) {
        auto* item = pending.takeLast();
        if (item->objectName() == name) { return item; }
        pending.append(item->childItems());
    }
    return nullptr;
}
// An editor with two pictures and a sound, and the panels as the app registers them.
struct PanelEditor {
    TimelineModel model;
    PlaybackClock clock;
    QQmlEngine engine;
    QQuickWindow window;
    std::unique_ptr<QObject> editor;
    QString error;
    PanelEditor() {
        auto parsed = nt::parseTimelineJson(R"({"name":"Panels","width":640,"height":360,"fps":30,"durationMs":10000,
            "tracks":[{"id":"v","name":"Video","type":"video","index":0},{"id":"a","name":"Audio","type":"audio","index":1}],
            "clips":[{"id":"picture","name":"Shot 12","trackId":"v","mediaType":"video","startMs":0,"durationMs":4000,"width":1920,"height":1080,"currentAssetId":"asset-12",
                      "effects":[{"id":"glow","type":"glow","enabled":true,"radius":8,"intensity":1},{"id":"curve","type":"curves","enabled":true,"master":[{"x":0,"y":0},{"x":1,"y":1}]}]},
                     {"id":"sound","name":"Line 4","trackId":"a","mediaType":"audio","startMs":0,"durationMs":4000,"volumeDb":-6,
                      "audioEffects":[{"id":"g","type":"gain","enabled":true,"gainDb":0}]},
                     {"id":"second","name":"Second","trackId":"v","mediaType":"image","startMs":4000,"durationMs":3000,"width":640,"height":360}]})");
        if (!parsed.timeline) { error = "Invalid test document"; return; }
        model.setTimeline(std::move(*parsed.timeline));
        window.resize(1800, 1100);
        QQmlComponent component(&engine);
        component.loadFromModule("NodeTool.Timeline", "TimelineEditor");
        if (!component.isReady()) { error = component.errorString(); return; }
        editor.reset(component.createWithInitialProperties({
            {"timeline", QVariant::fromValue(&model)}, {"clock", QVariant::fromValue(&clock)},
            {"width", 1800}, {"height", 1100}}));
        error = component.errorString();
        if (!editor) { return; }
        root()->setParentItem(window.contentItem());
        window.show();
    }
    QQuickItem* root() const { return qobject_cast<QQuickItem*>(editor.get()); }
    ClipGestureController* gestures() const { return editor->findChild<ClipGestureController*>("clipGestures"); }
    DockLayoutStore* store() const { return qobject_cast<DockLayoutStore*>(editor->property("dockStore").value<QObject*>()); }
    bool show(const QString& panel) {
        QVariant shown;
        return QMetaObject::invokeMethod(editor.get(), "focusPanel", Q_RETURN_ARG(QVariant, shown), Q_ARG(QVariant, panel)) && shown.toBool();
    }
    QPoint center(QQuickItem* item) const { return item->mapToScene({item->width() / 2, item->height() / 2}).toPoint(); }
    // NT_PANEL_SCREENSHOTS saves a panel as the person sees it, for a review by eye.
    bool grab(QQuickItem* panel, const QString& name) {
        const auto folder = qEnvironmentVariable("NT_PANEL_SCREENSHOTS");
        if (folder.isEmpty()) { return true; }
        QCoreApplication::processEvents();
        QTest::qWait(100);
        const auto area = panel->mapRectToScene(QRectF(0, 0, panel->width(), panel->height())).toRect();
        return window.grabWindow().copy(area).save(folder + "/" + name + ".png");
    }
};
}
class TestDockUi : public QObject {
    Q_OBJECT
    QTemporaryDir preferences;
private slots:
    void init() {
        QVERIFY(preferences.isValid());
        qputenv("NODETOOL_TIMELINE_PREFERENCES", QFile::encodeName(preferences.filePath("ui.ini")));
        QFile::remove(preferences.filePath("ui.ini"));
    }
    // The real registrations, so one test sees every panel and which of them holds which control.
    void panelsOfASelectedClip() {
        PanelEditor e;
        QVERIFY2(e.editor, qPrintable(e.error));
        QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        auto* root = e.root();
        auto* gestures = e.gestures();
        QVERIFY(gestures);
        auto* store = e.store();
        QVERIFY(store);
        const auto show = [&](const QString& panel) { return e.show(panel); };
        const auto grab = [&](QQuickItem* panel, const QString& name) { return e.grab(panel, name); };
        // Effect Controls is a tab right after the Inspector, which stays in front.
        const auto rightTabs = store->layout().value("regions").toMap().value("right").toList().first().toMap().value("panels").toStringList();
        QCOMPARE(rightTabs.at(rightTabs.indexOf("inspector") + 1), QString("effectControls"));
        auto* inspector = named(root, "timelineInspector"); QVERIFY(inspector);
        auto* effectControls = named(root, "effectControlsPanel"); QVERIFY(effectControls);
        QTRY_VERIFY(inspector->isVisible());
        QVERIFY(!effectControls->isVisible());
        QTRY_VERIFY(named(root, "dockTab_effectControls"));
        QVERIFY(named(root, "dockTab_effectControls")->x() > named(root, "dockTab_inspector")->x());

        gestures->setSelection({"picture"});
        // One owner per control: each of these is in Effect Controls and nowhere in the Inspector.
        QTRY_VERIFY(named(effectControls, "effectControlsGroup_crop"));
        for (const auto* group : {"motion", "opacity", "timeRemap", "crop", "borderRadius", "motionBlur", "effect:glow", "effect:curve"}) {
            QVERIFY2(named(effectControls, "effectControlsGroup_" + QString::fromLatin1(group)), group);
        }
        QVERIFY(named(effectControls, "effectControls_anchor_input_0"));
        QVERIFY(named(effectControls, "effectControls_depth_input_0"));
        for (const auto* control : {"effectControls_anchor_input_0", "effectControls_depth_input_0", "position-input-0", "effectControlsStopwatch_cropLeft", "effectControlsStopwatch_borderRadius",
                                    "motionBlurEnabled", "inspectorTimeRemap", "audioSection"}) {
            QVERIFY2(!named(inspector, QString::fromLatin1(control)), control);
        }
        // D8: identity card, Media and Timing, and nothing else for a plain video clip.
        QVERIFY(named(inspector, "clipIdentityCard")->isVisible());
        QTRY_VERIFY(named(inspector, "inspectorMedia")->isVisible());
        // A second Timing waits, hidden, in the group panel.
        QTRY_VERIFY(named(inspector, "timingDuration") != nullptr);
        QCOMPARE(inspector->property("groupSelected").toBool(), false);
        for (const auto* gone : {"inspectorAiSection", "inspectorReframe", "advancedMotion", "clipEffectsList", "audioEffectsSection"}) {
            QVERIFY2(!named(inspector, QString::fromLatin1(gone)), gone);
        }
        QTRY_COMPARE(named(inspector, "inspectorTransition")->property("implicitHeight").toDouble(), 0.0);
        QVERIFY(grab(inspector, "inspector-video-clip"));
        QVERIFY(show("effectControls"));
        QTRY_VERIFY(effectControls->isVisible());
        QVERIFY(grab(effectControls, "effect-controls-video-clip"));
        store->dispatch({{"type", "resize"}, {"region", "right"}, {"size", 600}});
        QTRY_COMPARE(effectControls->width(), 600.0);
        QVERIFY(grab(effectControls, "effect-controls-video-clip-wide"));
        store->dispatch({{"type", "resize"}, {"region", "right"}, {"size", 360}});

        gestures->setSelection({"sound"});
        QTRY_VERIFY(named(effectControls, "audioSection"));
        for (const auto* group : {"volume", "audioEffect:g"}) {
            QVERIFY2(named(effectControls, "effectControlsGroup_" + QString::fromLatin1(group)), group);
        }
        QVERIFY(!named(effectControls, "effectControlsGroup_motion"));
        QVERIFY(grab(effectControls, "effect-controls-audio-clip"));
        QVERIFY(show("inspector"));
    }
    void motionPanelOwnsAnimationAndFollowsTheSelection() {
        PanelEditor e;
        QVERIFY2(e.editor, qPrintable(e.error));
        QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        const auto tabs = e.store()->layout().value("regions").toMap().value("right").toList().first().toMap().value("panels").toStringList();
        QCOMPARE(tabs.at(tabs.indexOf("effectControls") + 1), QString("motion"));
        QVERIFY(e.show("motion"));
        auto* panel = named(e.root(), "motionPanel"); QVERIFY(panel);
        QTRY_VERIFY(panel->isVisible());
        auto* empty = named(panel, "motionPanelEmpty"); QVERIFY(empty);
        QCOMPARE(empty->property("title").toString(), QString("No clip selected"));
        QVERIFY(empty->isVisible());
        e.gestures()->setSelection({"picture"});
        auto* animate = named(panel, "motionPanelAnimate"); QVERIFY(animate);
        QTRY_VERIFY(animate->isVisible());
        QVERIFY(!empty->isVisible());
        for (const auto* name : {"advancedMotion", "inspectorReframe"}) { QVERIFY2(named(panel, QString::fromLatin1(name)), name); }
        auto* inspector = named(e.root(), "timelineInspector");
        for (const auto* name : {"motionPanelAnimate", "advancedMotion", "inspectorReframe"}) { QVERIFY2(!named(inspector, QString::fromLatin1(name)), name); }
        QVERIFY(e.grab(panel, "motion-video-clip"));
        // One edit from the panel, one undo step.
        const auto before = e.model.documentJson();
        const auto step = e.model.undoStack()->index();
        auto* repeater = named(panel, "motionRepeaterEnabled"); QVERIFY(repeater);
        QVERIFY(QMetaObject::invokeMethod(repeater, "change", Q_ARG(bool, true)));
        QCOMPARE(e.model.undoStack()->index(), step + 1);
        QVERIFY(e.model.documentJson() != before);
        QVERIFY(e.model.clipsJson()[0].toObject().contains("repeater"));
        e.model.undoStack()->undo();
        QCOMPARE(e.model.documentJson(), before);
        // A sound has nothing to animate, and the empty state says so.
        e.gestures()->setSelection({"sound"});
        QTRY_VERIFY(empty->isVisible());
        QCOMPARE(empty->property("title").toString(), QString("This clip has no picture"));
        e.gestures()->setSelection({"picture", "second"});
        QTRY_COMPARE(empty->property("title").toString(), QString("Several clips selected"));
    }
    void aiPanelSitsBesideTheAssistant() {
        PanelEditor e;
        QVERIFY2(e.editor, qPrintable(e.error));
        QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        const auto tabs = e.store()->layout().value("regions").toMap().value("right").toList().first().toMap().value("panels").toStringList();
        QCOMPARE(tabs.at(tabs.indexOf("assistant") + 1), QString("ai"));
        QVERIFY(e.show("ai"));
        auto* panel = named(e.root(), "aiPanel"); QVERIFY(panel);
        QTRY_VERIFY(panel->isVisible());
        auto* empty = named(panel, "aiPanelEmpty"); QVERIFY(empty);
        QVERIFY(empty->isVisible());
        QCOMPARE(empty->property("title").toString(), QString("No clip selected"));
        e.gestures()->setSelection({"picture"});
        QTRY_VERIFY(!empty->isVisible());
        auto* section = named(panel, "inspectorAiSection"); QVERIFY(section);
        QVERIFY(section->isVisible());
        QTRY_VERIFY(named(section, "inspectorReviewTakes"));
        QVERIFY(!named(named(e.root(), "timelineInspector"), "inspectorAiSection"));
        QVERIFY(e.grab(panel, "ai-video-clip"));
        e.gestures()->setSelection({"sound"});
        QTRY_VERIFY(empty->isVisible());
        QCOMPARE(empty->property("title").toString(), QString("No AI tools for this clip"));
    }
    void reviewHidesTheNewPanels() {
        PanelEditor e;
        QVERIFY2(e.editor, qPrintable(e.error));
        QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        e.store()->switchWorkspace(3);
        const auto hidden = e.store()->layout().value("hidden").toStringList();
        for (const auto* panel : {"effectControls", "effects", "motion", "ai"}) { QVERIFY2(hidden.contains(QString::fromLatin1(panel)), panel); }
        e.store()->switchWorkspace(0);
        e.store()->resetWorkspace();
        const auto shown = e.store()->layout().value("hidden").toStringList();
        for (const auto* panel : {"effectControls", "effects", "motion", "ai"}) { QVERIFY2(!shown.contains(QString::fromLatin1(panel)), panel); }
        const auto tabs = e.store()->layout().value("regions").toMap().value("right").toList().first().toMap().value("panels").toStringList();
        QCOMPARE(tabs.at(tabs.indexOf("inspector") + 1), QString("effectControls"));
        QCOMPARE(tabs.at(tabs.indexOf("assistant") + 1), QString("ai"));
    }
    void effectsPanelIsTabbedWithTheLibrary() {
        PanelEditor e;
        QVERIFY2(e.editor, qPrintable(e.error));
        QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        const auto left = e.store()->layout().value("regions").toMap().value("left").toList().first().toMap();
        const auto tabs = left.value("panels").toStringList();
        QCOMPARE(tabs.at(tabs.indexOf("assets") + 1), QString("effects"));
        // It does not take the place of the tab that opens first.
        QCOMPARE(left.value("activePanelId").toString(), QString("transcript"));
        QVERIFY(!e.store()->layout().value("hidden").toStringList().contains("effects"));
        QTRY_VERIFY(!named(e.root(), "effectsPanel")->isVisible());
    }
    void effectsPanelSaysWhyNothingHappened() {
        PanelEditor e;
        QVERIFY2(e.editor, qPrintable(e.error));
        QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        QVERIFY(QTest::qWaitForWindowActive(&e.window));
        QVERIFY(e.show("effects"));
        auto* panel = named(e.root(), "effectsPanel");
        QTRY_VERIFY(panel->isVisible());
        auto* blur = named(panel, "effectsAdd_blur"); QVERIFY(blur);
        auto* gain = named(panel, "audioEffectsAdd-gain"); QVERIFY(gain);
        auto* status = named(panel, "effectsPanelStatus"); QVERIFY(status);
        QVERIFY(e.grab(panel, "effects-panel"));
        const auto before = e.model.documentJson();
        QCOMPARE(blur->property("reason").toString(), QString("Select a clip on the timeline first."));
        QTest::mouseDClick(&e.window, Qt::LeftButton, Qt::NoModifier, e.center(blur));
        QTRY_COMPARE(status->property("text").toString(), QString("Select a clip on the timeline first."));
        QCOMPARE(e.model.documentJson(), before);
        e.gestures()->setSelection({"sound"});
        QTRY_COMPARE(blur->property("reason").toString(), QString("Select a video, image or text clip for this effect."));
        QCOMPARE(gain->property("reason").toString(), QString());
        e.gestures()->setSelection({"picture"});
        QTRY_COMPARE(gain->property("reason").toString(), QString("Select an audio clip for this effect."));
        QCOMPARE(blur->property("reason").toString(), QString());
        QVERIFY(e.model.applyEdit("patchClip", {{"clipId", "picture"}, {"patch", QJsonObject{{"locked", true}}}}));
        QTRY_COMPARE(blur->property("reason").toString(), QString("Unlock the clip or its track first."));
    }
    void effectsPanelAddsToTheSelectionInOneStep() {
        PanelEditor e;
        QVERIFY2(e.editor, qPrintable(e.error));
        QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        QVERIFY(QTest::qWaitForWindowActive(&e.window));
        QVERIFY(e.show("effects"));
        auto* panel = named(e.root(), "effectsPanel");
        QTRY_VERIFY(panel->isVisible());
        const auto effects = [&](const QString& id, const char* field = "effects") {
            for (const auto& value : e.model.clipsJson()) {
                if (value.toObject()["id"] == id) { return value.toObject()[QLatin1String(field)].toArray(); }
            }
            return QJsonArray{};
        };
        // Selected: two pictures and a sound. The picture effect reaches only the pictures.
        e.gestures()->setSelection({"picture", "second", "sound"});
        auto* blur = named(panel, "effectsAdd_blur"); QVERIFY(blur);
        QTRY_COMPARE(blur->property("reason").toString(), QString());
        const auto before = e.model.documentJson();
        const auto count = e.model.undoStack()->count();
        QTest::mouseDClick(&e.window, Qt::LeftButton, Qt::NoModifier, e.center(blur));
        QTRY_COMPARE(effects("picture").size(), 3);
        QCOMPARE(effects("second").size(), 1);
        QCOMPARE(effects("second")[0].toObject()["type"].toString(), QString("blur"));
        QVERIFY(effects("picture")[2].toObject()["id"] != effects("second")[0].toObject()["id"]);
        QCOMPARE(effects("sound").size(), 0);
        QCOMPARE(e.model.undoStack()->count(), count + 1);
        e.model.undoStack()->undo();
        QCOMPARE(e.model.documentJson(), before);
        // A sound effect takes the C++ defaults of addClipAudioEffect.
        auto* gain = named(panel, "audioEffectsAdd-gain"); QVERIFY(gain);
        QTest::mouseDClick(&e.window, Qt::LeftButton, Qt::NoModifier, e.center(gain));
        QTRY_COMPARE(effects("sound", "audioEffects").size(), 2);
        QCOMPARE(effects("sound", "audioEffects")[1].toObject()["gainDb"].toDouble(), 0.0);
        QCOMPARE(effects("picture", "audioEffects").size(), 0);
        QCOMPARE(e.model.undoStack()->count(), count + 1);
        e.model.undoStack()->undo();
        QCOMPARE(e.model.documentJson(), before);
        // Effect Controls lists what was added, once a single clip is selected.
        e.gestures()->setSelection({"second"});
        QTRY_VERIFY(blur->property("reason").toString().isEmpty());
        QTest::mouseDClick(&e.window, Qt::LeftButton, Qt::NoModifier, e.center(blur));
        QTRY_COMPARE(effects("second").size(), 1);
        const auto id = effects("second")[0].toObject()["id"].toString();
        auto* effectControls = named(e.root(), "effectControlsPanel");
        QTRY_VERIFY(named(effectControls, "effectControlsGroup_effect:" + id));
        QVERIFY(named(panel, "effectsPanelStatus")->property("text").toString().contains("Second"));
    }
    void effectsPanelSearches() {
        PanelEditor e;
        QVERIFY2(e.editor, qPrintable(e.error));
        QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        QVERIFY(e.show("effects"));
        auto* panel = named(e.root(), "effectsPanel");
        QTRY_VERIFY(panel->isVisible());
        auto* search = named(panel, "effectsSearch"); QVERIFY(search);
        QTRY_VERIFY(named(panel, "effectsAdd_blur"));
        QVERIFY(named(panel, "effectsPanelVideo")->isVisible());
        QVERIFY(named(panel, "effectsPanelAudio")->isVisible());
        for (const auto* grade : {"color", "curves", "liftGammaGain", "vignette"}) {
            QVERIFY2(!named(panel, "effectsAdd_" + QString::fromLatin1(grade)), grade);
        }
        search->setProperty("text", "gRAin");
        QTRY_VERIFY(!named(panel, "effectsAdd_blur"));
        QVERIFY(named(panel, "effectsAdd_grain"));
        QVERIFY(!named(panel, "effectsPanelAudio")->isVisible());
        search->setProperty("text", "reverb");
        QTRY_VERIFY(named(panel, "audioEffectsAdd-reverb"));
        QVERIFY(!named(panel, "effectsPanelVideo")->isVisible());
        search->setProperty("text", "nothing like this");
        QTRY_VERIFY(named(panel, "effectsPanelNoMatch")->isVisible());
        search->setProperty("text", "");
        QTRY_VERIFY(named(panel, "effectsAdd_blur"));
        QVERIFY(!named(panel, "effectsPanelNoMatch")->isVisible());
    }
    void effectDragsOntoAClip() {
        PanelEditor e;
        QVERIFY2(e.editor, qPrintable(e.error));
        QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        QVERIFY(QTest::qWaitForWindowActive(&e.window));
        QVERIFY(e.show("effects"));
        auto* panel = named(e.root(), "effectsPanel");
        QTRY_VERIFY(panel->isVisible());
        auto* blur = named(panel, "effectsAdd_blur"); QVERIFY(blur);
        const auto drag = [&](QQuickItem* source, QQuickItem* target) {
            const auto from = e.center(source);
            const auto to = e.center(target);
            QTest::mousePress(&e.window, Qt::LeftButton, Qt::NoModifier, from);
            for (int step = 1; step <= 8; ++step) {
                QTest::mouseMove(&e.window, from + (to - from) * step / 8);
            }
            QTest::qWait(30);
            QTest::mouseRelease(&e.window, Qt::LeftButton, Qt::NoModifier, to);
            QCoreApplication::processEvents();
        };
        // No selection is needed, and the selection does not change.
        e.gestures()->setSelection({"picture"});
        QTRY_VERIFY(named(e.root(), "clip-second"));
        auto* second = named(e.root(), "clip-second");
        const auto before = e.model.documentJson();
        const auto step = e.model.undoStack()->index();
        drag(blur, second);
        const auto clipEffects = [&](int index) { return e.model.clipsJson()[index].toObject()["effects"].toArray(); };
        QTRY_COMPARE(clipEffects(2).size(), 1);
        QCOMPARE(clipEffects(0).size(), 2);
        QCOMPARE(e.gestures()->selection(), QStringList({"picture"}));
        QCOMPARE(e.model.undoStack()->index(), step + 1);
        e.model.undoStack()->undo();
        QCOMPARE(e.model.documentJson(), before);
        // A clip of the wrong kind refuses, and says so.
        auto* sound = named(e.root(), "clip-sound"); QVERIFY(sound);
        drag(blur, sound);
        QTRY_VERIFY(named(e.root(), "effectDropWarning")->isVisible());
        QCOMPARE(e.model.documentJson(), before);
        QCOMPARE(e.model.undoStack()->index(), step);
    }
    void aSavedLayoutFromBeforeKeepsItsTabsAndMeetsNewPanels() {
        // Saved before this restructure: Effect Controls at the end of the group.
        const auto saved = QJsonObject{{"workspace", "Editing"}, {"workspaces", QJsonObject{{"Editing", QJsonObject{
            {"version", 1}, {"hidden", QJsonArray{}},
            {"sizes", QJsonObject{{"left", 320}, {"right", 420}, {"bottom", 300}}},
            {"regions", QJsonObject{
                {"left", QJsonArray{QJsonObject{{"id", "left-main"}, {"panels", QJsonArray{"transcript", "assets"}}, {"activePanelId", "assets"}}}},
                {"right", QJsonArray{QJsonObject{{"id", "right-main"}, {"panels", QJsonArray{"inspector", "assistant", "color", "effectControls"}}, {"activePanelId", "color"}}}},
                {"bottom", QJsonArray{QJsonObject{{"id", "bottom-main"}, {"panels", QJsonArray{"tracks"}}, {"activePanelId", "tracks"}}}},
                {"viewport", QJsonArray{QJsonObject{{"id", "viewport-program"}, {"panels", QJsonArray{"program"}}, {"activePanelId", "program"}}}}}}}}}}};
        {
            auto settings = nt::app::openTimelinePreferences();
            settings->setValue("nodetool.timeline-layout.v1", QJsonDocument(saved).toJson(QJsonDocument::Compact));
            settings->sync();
        }
        TimelineModel model;
        auto parsed = nt::parseTimelineJson(R"({"name":"Saved","width":640,"height":360,"fps":30,"durationMs":10000,"tracks":[],"clips":[]})");
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        PlaybackClock clock;
        QQmlEngine engine;
        QQuickWindow window;
        window.resize(1500, 900);
        QQmlComponent component(&engine);
        component.loadFromModule("NodeTool.Timeline", "TimelineEditor");
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> editor(component.createWithInitialProperties({
            {"timeline", QVariant::fromValue(&model)}, {"clock", QVariant::fromValue(&clock)},
            {"width", 1500}, {"height", 900}}));
        QVERIFY2(editor, qPrintable(component.errorString()));
        qobject_cast<QQuickItem*>(editor.get())->setParentItem(window.contentItem());
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        auto* store = qobject_cast<DockLayoutStore*>(editor->property("dockStore").value<QObject*>());
        QVERIFY(store);
        const auto group = [&](const QString& region) { return store->layout().value("regions").toMap().value(region).toList().first().toMap(); };
        // What the person arranged is kept: the active tab and the place of Effect Controls.
        QCOMPARE(group("right").value("activePanelId").toString(), QString("color"));
        const auto tabs = group("right").value("panels").toStringList();
        QVERIFY(tabs.indexOf("inspector") < tabs.indexOf("assistant"));
        QVERIFY(tabs.indexOf("assistant") < tabs.indexOf("color"));
        QVERIFY(tabs.indexOf("color") < tabs.indexOf("effectControls"));
        QCOMPARE(store->layout().value("sizes").toMap().value("right").toDouble(), 420.0);
        // The new panels each land beside their neighbour, and in the Window menu's reach.
        QCOMPARE(tabs.at(tabs.indexOf("effectControls") + 1), QString("motion"));
        QCOMPARE(tabs.at(tabs.indexOf("assistant") + 1), QString("ai"));
        const auto left = group("left").value("panels").toStringList();
        QCOMPARE(left.at(left.indexOf("assets") + 1), QString("effects"));
        QVERIFY(store->layout().value("hidden").toStringList().isEmpty());
    }
    void colorAndAudioWorkspaces() {
        TimelineModel model;
        auto parsed = nt::parseTimelineJson(R"({"name":"Dock","width":640,"height":360,"fps":30,"durationMs":10000,"tracks":[],"clips":[]})");
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        PlaybackClock clock;
        QQmlEngine engine;
        QQuickRenderControl control;
        QQuickWindow window(&control);
        window.resize(1500, 900);
        QQmlComponent component(&engine);
        component.loadFromModule("NodeTool.Timeline", "TimelineEditor");
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> editor(component.createWithInitialProperties({
            {"timeline", QVariant::fromValue(&model)}, {"clock", QVariant::fromValue(&clock)},
            {"width", 1500}, {"height", 900}}));
        QVERIFY2(editor, qPrintable(component.errorString()));
        auto* root = qobject_cast<QQuickItem*>(editor.get());
        QVERIFY(root);
        root->setParentItem(window.contentItem());
        QImage image(1500, 900, QImage::Format_ARGB32_Premultiplied);
        window.setRenderTarget(QQuickRenderTarget::fromPaintDevice(&image));
        auto render = [&] {
            QCoreApplication::processEvents();
            control.polishItems();
            control.sync();
            control.render();
        };
        render();
        auto click = [&](QQuickItem* item) {
            const auto position = QPointF(item->mapToScene({item->width() / 2, item->height() / 2}));
            QMouseEvent press(QEvent::MouseButtonPress, position, position, Qt::LeftButton, Qt::LeftButton, Qt::NoModifier);
            QCoreApplication::sendEvent(&window, &press);
            QMouseEvent release(QEvent::MouseButtonRelease, position, position, Qt::LeftButton, Qt::NoButton, Qt::NoModifier);
            QCoreApplication::sendEvent(&window, &release);
            QCoreApplication::processEvents();
        };
        auto* dock = named(root, "dockCanvas");
        QVERIFY(dock);
        auto* store = editor->findChild<DockLayoutStore*>();
        QVERIFY(store);
        auto* gestures = qobject_cast<ClipGestureController*>(named(root, "clipGestures"));
        QVERIFY(gestures);
        // The shortcut sheet names the new keys.
        const auto rows = gestures->shortcutSheet().value("groups").toList().at(9).toMap().value("rows").toList();
        QStringList ids;
        for (const auto& row : rows) { ids << row.toMap().value("id").toString(); }
        QVERIFY2(ids.contains("workspace5") && ids.contains("workspace6"), qPrintable(ids.join(',')));
        // Open each one through the menu with the pointer.
        auto* layoutMenu = named(root, "dockLayoutMenu");
        QVERIFY(layoutMenu);
        click(layoutMenu);
        render();
        auto* colorItem = named(window.contentItem(), "dockWorkspace_Color");
        QVERIFY(colorItem);
        QTRY_VERIFY2(colorItem->width() > 0 && colorItem->height() > 0, "Workspace menu items must be laid out");
        QCOMPARE(colorItem->property("shortcutText").toString(), QString("Alt+Shift+5"));
        click(colorItem);
        render();
        QCOMPARE(store->workspace(), QString("Color"));
        auto visible = dock->property("visiblePanels").toStringList();
        QVERIFY2(visible.contains("program") && visible.contains("tracks"), qPrintable(visible.join(',')));
        QCOMPARE(dock->property("leftExtent").toInt(), 0);
        QCOMPARE(dock->property("rightExtent").toInt(), 400);
        QCOMPARE(dock->property("bottomExtent").toInt(), 280);
        // Its panels registered themselves, so the preset shows them with no edit here.
        QVERIFY2(visible.contains("scopes") && visible.contains("color"), qPrintable(visible.join(',')));
        QVERIFY(named(root, "dockTab_scopes"));
        QVERIFY(named(root, "dockTab_color"));
        // The Inspector stays one tab away.
        QVERIFY(named(root, "dockTab_inspector"));
        auto* program = named(root, "previewCompositor");
        QVERIFY(program);
        // A window-level key press reaches the same workspace action.
        QVERIFY(gestures->handleKey(Qt::Key_6, {}, int(Qt::AltModifier | Qt::ShiftModifier), false));
        render();
        QCOMPARE(store->workspace(), QString("Audio"));
        visible = dock->property("visiblePanels").toStringList();
        QVERIFY2(visible.contains("mixer") && visible.contains("program") && visible.contains("tracks"), qPrintable(visible.join(',')));
        QVERIFY(named(root, "dockTab_mixer"));
        // The mixer is above the timeline, not a tab beside it.
        auto* mixerTab = named(root, "dockTab_mixer");
        auto* tracksTab = named(root, "dockTab_tracks");
        QVERIFY(tracksTab);
        QVERIFY(mixerTab->mapToScene({0, 0}).y() < tracksTab->mapToScene({0, 0}).y());
        // Back to a web workspace with the mixer where it was.
        click(layoutMenu);
        render();
        auto* editingItem = named(window.contentItem(), "dockWorkspace_Editing");
        QVERIFY(editingItem);
        QTRY_VERIFY(editingItem->width() > 0 && editingItem->height() > 0);
        click(editingItem);
        render();
        QCOMPARE(store->workspace(), QString("Editing"));
        visible = dock->property("visiblePanels").toStringList();
        QVERIFY2(visible.contains("transcript") && visible.contains("inspector"), qPrintable(visible.join(',')));
        // The editor holds the one frame capture that panels and tools share.
        auto* capture = editor->property("frameCapture").value<FrameCapture*>();
        QVERIFY(capture);
        QCOMPARE(capture->timeline(), &model);
        QCOMPARE(capture->processId(), 0);
        window.setRenderTarget(QQuickRenderTarget{});
    }
    void mountedWorkspacesAndStablePanels() {
        TimelineModel model;
        auto parsed = nt::parseTimelineJson(R"({"name":"Dock","width":640,"height":360,"fps":30,"durationMs":10000,"tracks":[],"clips":[]})");
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        PlaybackClock clock;
        const auto document = model.documentJson();
        QQmlEngine engine;
        nt::chat::ChatSession chat;
        const QString threadId = QStringLiteral("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
        chat.upsertThread({{"id", threadId}, {"title", "Draft"}});
        chat.selectThread(threadId);
        chat.setDraft(QStringLiteral("Keep this draft"));
        engine.rootContext()->setContextProperty("nativeChatSession", &chat);
        QQuickRenderControl control;
        QQuickWindow window(&control);
        window.resize(1500, 900);
        QQmlComponent component(&engine);
        component.loadFromModule("NodeTool.Timeline", "TimelineEditor");
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> editor(component.createWithInitialProperties({
            {"timeline", QVariant::fromValue(&model)}, {"clock", QVariant::fromValue(&clock)},
            {"width", 1500}, {"height", 900}}));
        QVERIFY2(editor, qPrintable(component.errorString()));
        auto* root = qobject_cast<QQuickItem*>(editor.get());
        QVERIFY(root);
        root->setParentItem(window.contentItem());
        QImage image(1500, 900, QImage::Format_ARGB32_Premultiplied);
        window.setRenderTarget(QQuickRenderTarget::fromPaintDevice(&image));
        auto render = [&] {
            QCoreApplication::processEvents();
            control.polishItems();
            control.sync();
            control.render();
        };
        render();
        auto mouse = [&](QEvent::Type type, QPoint position, Qt::MouseButton button, Qt::MouseButtons buttons) {
            QMouseEvent event(type, QPointF(position), QPointF(position), button, buttons, Qt::NoModifier);
            QCoreApplication::sendEvent(&window, &event);
            QCoreApplication::processEvents();
        };
        auto click = [&](QQuickItem* item) {
            const auto position = item->mapToScene({item->width() / 2, item->height() / 2}).toPoint();
            mouse(QEvent::MouseButtonPress, position, Qt::LeftButton, Qt::LeftButton);
            mouse(QEvent::MouseButtonRelease, position, Qt::LeftButton, Qt::NoButton);
        };
        auto* dock = named(root, "dockCanvas");
        QVERIFY2(dock, "TimelineEditor must render DockCanvas");
        auto* store = editor->findChild<DockLayoutStore*>();
        QVERIFY(store);
        // Resize feedback must be visible before releasing the pointer, without
        // synchronously saving preferences for every motion event.
        for (const auto& region : {QStringLiteral("left"), QStringLiteral("right"), QStringLiteral("bottom")}) {
            auto* handle = named(root, "dockResize_" + region);
            QVERIFY(handle);
            QVERIFY(handle->isVisible());
            const auto extent = (region + "Extent").toUtf8();
            const double before = dock->property(extent.constData()).toDouble();
            const auto saved = nt::app::openTimelinePreferences()->value("nodetool.timeline-layout.v1");
            const auto start = handle->mapToScene({handle->width() / 2, handle->height() / 2}).toPoint();
            const QPoint delta = region == "bottom" ? QPoint(0, 40) : QPoint(region == "left" ? -40 : 40, 0);
            mouse(QEvent::MouseButtonPress, start, Qt::LeftButton, Qt::LeftButton);
            mouse(QEvent::MouseMove, start + delta, Qt::NoButton, Qt::LeftButton);
            render();
            QCOMPARE(dock->property(extent.constData()).toDouble(), before - 40);
            QCOMPARE(nt::app::openTimelinePreferences()->value("nodetool.timeline-layout.v1"), saved);
            mouse(QEvent::MouseMove, start + delta / 2, Qt::NoButton, Qt::LeftButton);
            render();
            QCOMPARE(dock->property(extent.constData()).toDouble(), before - 20);
            mouse(QEvent::MouseButtonRelease, start + delta / 2, Qt::LeftButton, Qt::NoButton);
            render();
            DockLayoutStore restored;
            QCOMPARE(restored.layout().value("sizes").toMap().value(region).toDouble(), before - 20);
            const auto committed = nt::app::openTimelinePreferences()->value("nodetool.timeline-layout.v1");
            const auto cancelStart = handle->mapToScene({handle->width() / 2, handle->height() / 2}).toPoint();
            mouse(QEvent::MouseButtonPress, cancelStart, Qt::LeftButton, Qt::LeftButton);
            mouse(QEvent::MouseMove, cancelStart + delta, Qt::NoButton, Qt::LeftButton);
            render();
            QCOMPARE(dock->property(extent.constData()).toDouble(), before - 60);
            QTest::keyClick(&window, Qt::Key_Escape);
            render();
            QCOMPARE(dock->property(extent.constData()).toDouble(), before - 20);
            mouse(QEvent::MouseButtonRelease, cancelStart + delta, Qt::LeftButton, Qt::NoButton);
            render();
            QCOMPARE(dock->property(extent.constData()).toDouble(), before - 20);
            QCOMPARE(nt::app::openTimelinePreferences()->value("nodetool.timeline-layout.v1"), committed);
            store->resizeRegion(region, before, dock->width(), dock->height());
            render();
        }
        for (const auto& slot : {"left", "right", "bottom", "overlay"}) {
            QVERIFY(named(root, "panelSlot_" + QString::fromLatin1(slot)));
        }
        auto* tracks = named(root, "tracksRegion");
        auto* inspector = named(root, "timelineInspector");
        auto* scriptPanel = named(root, "timelineScriptPanel");
        auto* storyboardPanel = named(root, "timelineStoryboardPanel");
        QVERIFY(tracks);
        QVERIFY(inspector);
        QVERIFY(scriptPanel);
        QVERIFY(storyboardPanel);
        QVERIFY(scriptPanel != storyboardPanel);
        QVERIFY(named(root, "timelineAssistantPanel"));
        QVERIFY(named(root, "timelineEntitiesPanel"));
        auto* chatLoader = named(root, "nativeChatPanel");
        QVERIFY(chatLoader);
        QCOMPARE(chatLoader->property("status").toInt(), 1);
        auto* chatPanel = named(root, "chatPanel");
        QVERIFY(chatPanel);
        auto* scriptDrafts = scriptPanel->findChild<QObject*>("scriptDrafts");
        auto* storyboardDrafts = storyboardPanel->findChild<QObject*>("storyboardDrafts");
        QVERIFY(scriptDrafts);
        QVERIFY(storyboardDrafts);
        QVERIFY(scriptDrafts != storyboardDrafts);
        QVERIFY(named(root, "sourceViewer"));
        auto* gestures = qobject_cast<ClipGestureController*>(named(root, "clipGestures"));
        QVERIFY(gestures);
        const auto sheet = gestures->shortcutSheet();
        const auto shortcutGroups = sheet.value("groups").toList();
        QVERIFY(shortcutGroups.size() >= 11);  // registered key actions add an Extensions group
        const auto workspaceRows = shortcutGroups.at(9).toMap();
        QCOMPARE(workspaceRows.value("title").toString(), QString("Workspaces"));
        const QStringList ordinals{"first", "second", "third", "fourth"};
        for (int i = 0; i < 4; ++i) {
            const auto row = workspaceRows.value("rows").toList().at(i + 2).toMap();
            QCOMPARE(row.value("id").toString(), "workspace" + QString::number(i + 1));
            QCOMPARE(row.value("label").toString(), "Switch to the " + ordinals[i] + " workspace");
            QVERIFY(row.value("available").toBool());
        }
        auto* monitor = named(root, "previewCompositor");
        QVERIFY(monitor);
        auto* program = monitor->parentItem()->parentItem()->parentItem();
        const std::array<int, 4> rightSizes{360, 320, 500, 0};
        const std::array<int, 4> bottomSizes{300, 240, 260, 220};
        for (int i = 0; i < 4; ++i) {
            QVERIFY(gestures->handleKey(Qt::Key_1 + i, {}, int(Qt::AltModifier | Qt::ShiftModifier), false));
            render();
            QCOMPARE(store->workspace(), store->workspaces()[i]);
            const auto visible = dock->property("visiblePanels").toStringList();
            QVERIFY(visible.contains("program"));
            QVERIFY(visible.contains("tracks"));
            const bool inspectorVisible = i == 0 || i == 1;
            QCOMPARE(visible.contains("inspector"), inspectorVisible);
            QCOMPARE(visible.contains("assistant"), i == 2);
            QCOMPARE(visible.contains("transcript"), i == 0);
            QCOMPARE(visible.contains("script"), i == 1);
            for (const auto& unavailable : {"shot", "instruments", "history", "code"}) {
                QVERIFY(!visible.contains(QString::fromLatin1(unavailable)));
            }
            QCOMPARE(dock->property("bottomExtent").toInt(), bottomSizes[i]);
            QCOMPARE(inspector->isVisible(), inspectorVisible);
            QVERIFY(program->isVisible());
            QVERIFY(program->width() > 0);
            QCOMPARE(tracks->height() + named(root, "dockTab_tracks")->height(), double(bottomSizes[i]));
            QCOMPARE(dock->property("rightExtent").toInt(), rightSizes[i]);
            if (inspectorVisible) { QCOMPARE(inspector->width(), double(rightSizes[i])); }
            QCOMPARE(named(root, "tracksRegion"), tracks);
            QCOMPARE(named(root, "timelineInspector"), inspector);
        }
        QVERIFY(QMetaObject::invokeMethod(scriptDrafts, "setJsonDraft",
            Q_ARG(QString, QString()), Q_ARG(QString, QStringLiteral("test")),
            Q_ARG(QString, QStringLiteral("{unfinished"))));
        QVERIFY(scriptDrafts->property("dirty").toBool());
        QCOMPARE(chat.draft(), QStringLiteral("Keep this draft"));
        QCOMPARE(named(root, "chatPanel"), chatPanel);
        QVERIFY(!storyboardDrafts->property("dirty").toBool());
        QVERIFY(store->dispatch({{"type", "reveal"}, {"panelId", "script"}}));
        render();
        QVERIFY(scriptPanel->isVisible());
        QVERIFY(store->dispatch({{"type", "reveal"}, {"panelId", "storyboard"}}));
        render();
        QVERIFY(storyboardPanel->isVisible());
        // The Entities panel is visible only while its tab is selected, which is what lets it load on first show.
        auto* entitiesPanel = named(root, "timelineEntitiesPanel");
        QVERIFY(entitiesPanel);
        QVERIFY(!entitiesPanel->isVisible());
        QVERIFY(store->dispatch({{"type", "reveal"}, {"panelId", "entities"}}));
        render();
        QVERIFY(entitiesPanel->isVisible());
        QVERIFY(!storyboardPanel->isVisible());
        QVERIFY(store->dispatch({{"type", "reveal"}, {"panelId", "storyboard"}}));
        render();
        QVERIFY(storyboardPanel->isVisible());
        QVERIFY(!entitiesPanel->isVisible());
        // At the default left width the Entities tab does not fit, so the group menu lists it and reaches it.
        auto* entitiesTab = named(root, "dockTab_entities");
        QVERIFY(entitiesTab);
        QQuickItem* strip = entitiesTab;
        while (strip && strip->objectName() != "dockTabStrip") strip = strip->parentItem();
        QVERIFY(strip);
        QQuickItem* group = strip;
        while (group && !group->objectName().startsWith("dockGroup_")) group = group->parentItem();
        QVERIFY(group);
        QVERIFY2(strip->property("hiddenIds").toStringList().contains("entities"), "Entities must overflow the default left dock");
        // A window driven by a render control is never shown, so give its popup layer the window's size before a menu opens in it.
        auto sizePopupLayer = [&] {
            for (auto* child : group->findChildren<QObject*>()) {
                if (!QByteArray(child->metaObject()->className()).contains("ContextMenu")) continue;
                if (auto* overlay = qobject_cast<QQuickItem*>(qvariant_cast<QObject*>(child->property("parent")))) { overlay->setPosition(QPointF(0, 0)); overlay->setSize(window.size()); }
            }
        };
        auto showMenu = [&] {
            sizePopupLayer();
            QVERIFY(QMetaObject::invokeMethod(group, "openMenu", Q_ARG(QVariant, QVariant(QStringLiteral("storyboard"))),
                Q_ARG(QVariant, strip->property("optionsButton")), Q_ARG(QVariant, QVariant(true))));
            render();
        };
        showMenu();
        auto* hiddenEntry = named(window.contentItem(), "dockHiddenTab_entities");
        QVERIFY(hiddenEntry);
        render();
        for (int attempt = 0; attempt < 20 && (hiddenEntry->width() <= 0 || hiddenEntry->height() <= 0); ++attempt) { QTest::qWait(20); render(); }
        QVERIFY2(hiddenEntry->width() > 0 && hiddenEntry->height() > 0, "The hidden-tab entry must be laid out");
        QCOMPARE(hiddenEntry->property("text").toString(), QString("Entities"));
        const auto capture = qEnvironmentVariable("NT_ENTITY_CAPTURE_DIR");
        if (!capture.isEmpty()) {
            QDir().mkpath(capture);
            auto* theme = engine.singletonInstance<QObject*>("NodeTool.UiPrimitives", "Theme");
            QVERIFY(theme);
            for (const auto& [name, preference] : {std::pair{QString("dark"), 2}, std::pair{QString("light"), 3}}) {
                theme->setProperty("preference", preference);
                for (int pass = 0; pass < 4; ++pass) { QTest::qWait(30); render(); }
                QVERIFY(image.copy(0, 0, 700, 520).save(QDir(capture).filePath(name + "-dock-overflow-menu.png")));
            }
            theme->setProperty("preference", 2);
            render();
        }
        click(hiddenEntry);
        render();
        QVERIFY(entitiesPanel->isVisible());
        QVERIFY(!strip->property("hiddenIds").toStringList().contains("entities"));
        // Revealing a tab scrolls it into view, as the layout menu does.
        QVERIFY(store->dispatch({{"type", "reveal"}, {"panelId", "storyboard"}}));
        render();
        QVERIFY(store->dispatch({{"type", "reveal"}, {"panelId", "entities"}}));
        render();
        QVERIFY(!strip->property("hiddenIds").toStringList().contains("entities"));
        // The Library hands an image to the Entities panel through the editor.
        QVERIFY(QMetaObject::invokeMethod(root, "openEntityEditor", Q_ARG(QVariant, QVariant(QStringLiteral("asset-1"))), Q_ARG(QVariant, QVariant(false))));
        render();
        auto* entityEditor = entitiesPanel->findChild<QObject*>("entityEditorDialog");
        QVERIFY(entityEditor);
        QTRY_VERIFY(entityEditor->property("opened").toBool());
        QCOMPARE(entityEditor->property("title").toString(), QString("New entity"));
        QCOMPARE(entityEditor->property("referenceAssetId").toString(), QString("asset-1"));
        QVERIFY(entitiesPanel->isVisible());
        QVERIFY(QMetaObject::invokeMethod(entityEditor, "close"));
        render();
        // After an entity changes, the editor reloads the Library so its menu names the right action.
        auto* explorer = named(root, "assetExplorer");
        QVERIFY(explorer);
        QObject* libraryBrowser = nullptr;
        for (auto* child : explorer->findChildren<QObject*>()) {
            if (child->metaObject()->indexOfSignal("assetsChanged()") >= 0) { libraryBrowser = child; break; }
        }
        QVERIFY(libraryBrowser && libraryBrowser->metaObject()->indexOfSignal("assetsChanged()") >= 0);
        QSignalSpy refreshed(libraryBrowser, SIGNAL(assetsChanged()));
        QVERIFY(QMetaObject::invokeMethod(root, "refreshLibrary"));
        QVERIFY2(refreshed.count() >= 1, "refreshLibrary must reload the Library");
        QVERIFY(store->dispatch({{"type", "reveal"}, {"panelId", "storyboard"}}));
        render();
        QVERIFY(!entitiesPanel->isVisible());
        QVERIFY(QMetaObject::invokeMethod(root, "openEntityEditor", Q_ARG(QVariant, QVariant(QStringLiteral("asset-2"))), Q_ARG(QVariant, QVariant(true))));
        render();
        QVERIFY(entitiesPanel->isVisible());
        QVERIFY(QMetaObject::invokeMethod(entityEditor, "close"));
        render();
        QVERIFY(store->dispatch({{"type", "reveal"}, {"panelId", "storyboard"}}));
        render();
        QVERIFY(scriptDrafts->property("dirty").toBool());
        auto* storyboardEditor = named(storyboardPanel, "storyWorkspaceEditor");
        QVERIFY(storyboardEditor);
        QVERIFY(QMetaObject::invokeMethod(storyboardEditor, "openResource",
            Q_ARG(QVariant, QVariant(QStringLiteral("linked-script"))),
            Q_ARG(QVariant, QVariant(QStringLiteral("scripts")))));
        render();
        QVERIFY(scriptPanel->isVisible());
        QVERIFY(scriptDrafts->property("dirty").toBool());
        QVERIFY(store->dispatch({{"type", "hide"}, {"panelId", "script"}}));
        QVERIFY(store->dispatch({{"type", "reveal"}, {"panelId", "script"}}));
        render();
        QCOMPARE(named(root, "timelineScriptPanel"), scriptPanel);
        QVERIFY(scriptDrafts->property("dirty").toBool());
        auto* scriptEditor = named(scriptPanel, "storyWorkspaceEditor");
        QVERIFY(scriptEditor);
        QVERIFY(QMetaObject::invokeMethod(scriptEditor, "openResource",
            Q_ARG(QVariant, QVariant(QStringLiteral("linked-board"))),
            Q_ARG(QVariant, QVariant(QStringLiteral("storyboards")))));
        render();
        QVERIFY(storyboardPanel->isVisible());
        QVERIFY(scriptDrafts->property("dirty").toBool());
        QVERIFY(store->dispatch({{"type", "move"}, {"panelId", "tracks"}, {"region", "viewport"},
            {"groupId", "viewport-program"}, {"index", 1}}));
        render();
        QVERIFY(tracks->isVisible());
        QCOMPARE(named(root, "tracksRegion"), tracks);
        QVERIFY(!dock->property("visiblePanels").toStringList().contains("program"));
        store->resetWorkspace();
        store->resizeRegion("bottom", 1000, dock->width(), dock->height());
        render();
        QVERIFY(dock->property("bottomExtent").toDouble() <= dock->height() * 0.75);
        auto* layoutMenu = named(root, "dockLayoutMenu");
        QVERIFY(layoutMenu);
        QVERIFY(QMetaObject::invokeMethod(layoutMenu, "clicked"));
        render();
        auto* scriptAction = named(window.contentItem(), "dockWorkspace_Script");
        QVERIFY(scriptAction);
        QTRY_VERIFY2(scriptAction->width() > 0 && scriptAction->height() > 0, "Workspace menu items must be laid out");
        click(scriptAction);
        render();
        QCOMPARE(store->workspace(), QString("Script"));
        QVERIFY(QMetaObject::invokeMethod(layoutMenu, "clicked"));
        render();
        auto* requiredPanel = named(window.contentItem(), "dockToggle_program");
        QVERIFY(requiredPanel);
        QVERIFY(!requiredPanel->isEnabled());
        auto* inspectorToggle = named(window.contentItem(), "dockToggle_inspector");
        QVERIFY(inspectorToggle);
        click(inspectorToggle);
        render();
        QVERIFY(!inspector->isVisible());
        QVERIFY(store->layout().value("hidden").toStringList().contains("inspector"));
        QVERIFY(QMetaObject::invokeMethod(layoutMenu, "clicked"));
        render();
        click(inspectorToggle);
        render();
        QVERIFY(inspector->isVisible());
        store->resizeRegion("left", 600, dock->width(), dock->height());
        QVERIFY(QMetaObject::invokeMethod(layoutMenu, "clicked"));
        render();
        auto* resetAction = named(window.contentItem(), "dockResetWorkspace");
        QVERIFY(resetAction);
        click(resetAction);
        render();
        QCOMPARE(store->layout().value("sizes").toMap().value("left").toInt(), 480);
        store->switchWorkspace(0);
        store->resetWorkspace();
        render();
        // The menu of a group on the right opens inside that group, from the options button and from a right-clicked tab.
        {
            auto* inspectorTab = named(root, "dockTab_inspector");
            QVERIFY(inspectorTab);
            QQuickItem* rightGroup = inspectorTab;
            while (rightGroup && !rightGroup->objectName().startsWith("dockGroup_")) rightGroup = rightGroup->parentItem();
            QVERIFY(rightGroup);
            const double groupLeft = rightGroup->mapToScene({0, 0}).x(), groupRight = groupLeft + rightGroup->width();
            QVERIFY2(groupLeft > dock->width() / 2, "The inspector group must be on the right");
            QObject* groupMenu = nullptr;
            for (auto* child : rightGroup->findChildren<QObject*>()) {
                if (QByteArray(child->metaObject()->className()).contains("ContextMenu")) { groupMenu = child; break; }
            }
            QVERIFY(groupMenu);
            // A window driven by a render control is never shown, so give its popup layer the window's size first.
            if (auto* overlay = qobject_cast<QQuickItem*>(qvariant_cast<QObject*>(groupMenu->property("parent")))) {
                overlay->setPosition(QPointF(0, 0));
                overlay->setSize(window.size());
            }
            auto checkMenu = [&](const char* how, QQuickItem* anchor) {
                QTRY_VERIFY2(groupMenu->property("opened").toBool(), how);
                render();
                const double menuLeft = groupMenu->property("x").toDouble(), menuRight = menuLeft + groupMenu->property("width").toDouble();
                QVERIFY2(menuLeft >= groupLeft - 0.5 && menuRight <= groupRight + 0.5,
                    qPrintable(QString("%1: menu %2..%3 is outside the group %4..%5").arg(how).arg(menuLeft).arg(menuRight).arg(groupLeft).arg(groupRight)));
                // It hangs from the anchor rather than from the group's corner.
                const double anchorBottom = anchor->mapToScene({0, anchor->height()}).y();
                QVERIFY2(std::abs(groupMenu->property("y").toDouble() - anchorBottom) <= 1, how);
                QVERIFY(QMetaObject::invokeMethod(groupMenu, "close"));
                render();
                QTRY_VERIFY(!groupMenu->property("visible").toBool());
            };
            QQuickItem* strip = inspectorTab;
            while (strip && strip->objectName() != "dockTabStrip") strip = strip->parentItem();
            QVERIFY(strip);
            QVERIFY(QMetaObject::invokeMethod(rightGroup, "openMenu", Q_ARG(QVariant, QVariant(QStringLiteral("inspector"))),
                Q_ARG(QVariant, strip->property("optionsButton")), Q_ARG(QVariant, QVariant(true))));
            render();
            checkMenu("options button", qobject_cast<QQuickItem*>(qvariant_cast<QObject*>(strip->property("optionsButton"))));
            mouse(QEvent::MouseButtonPress, inspectorTab->mapToScene({inspectorTab->width() / 2, inspectorTab->height() / 2}).toPoint(), Qt::RightButton, Qt::RightButton);
            mouse(QEvent::MouseButtonRelease, inspectorTab->mapToScene({inspectorTab->width() / 2, inspectorTab->height() / 2}).toPoint(), Qt::RightButton, Qt::NoButton);
            render();
            checkMenu("right-clicked tab", inspectorTab);
        }
        auto* sourceState = engine.singletonInstance<SourceViewerState*>("NodeTool.Timeline", "SourceViewerState");
        QVERIFY(sourceState);
        sourceState->setAsset({{"id", "source-fixture"}, {"name", "Still"}, {"content_type", "image/png"}});
        render();
        auto* source = named(root, "sourceViewer");
        QVERIFY(source->isVisible());
        QVERIFY(source->width() > 0);
        QVERIFY(std::abs(program->width() / source->width() - 1.6) < 0.001);
        auto* pairHandle = named(root, "dockResizeGroups_viewport_0");
        QVERIFY(pairHandle);
        const double programWidth = program->width(), sourceWidth = source->width();
        const auto pairStart = pairHandle->mapToScene({pairHandle->width() / 2, pairHandle->height() / 2}).toPoint();
        const auto savedPair = nt::app::openTimelinePreferences()->value("nodetool.timeline-layout.v1");
        mouse(QEvent::MouseButtonPress, pairStart, Qt::LeftButton, Qt::LeftButton);
        mouse(QEvent::MouseMove, pairStart + QPoint(30, 0), Qt::NoButton, Qt::LeftButton);
        render();
        QVERIFY(std::abs(program->width() - programWidth - 30) < 0.001);
        QVERIFY(std::abs(source->width() - sourceWidth + 30) < 0.001);
        QCOMPARE(nt::app::openTimelinePreferences()->value("nodetool.timeline-layout.v1"), savedPair);
        mouse(QEvent::MouseButtonRelease, pairStart + QPoint(30, 0), Qt::LeftButton, Qt::NoButton);
        render();
        DockLayoutStore restoredPair;
        QCOMPARE(restoredPair.layout(), store->layout());
        QCOMPARE(named(root, "previewCompositor"), monitor);
        QCOMPARE(monitor->parentItem()->parentItem()->parentItem(), program);
        QCOMPARE(named(root, "sourceViewer"), source);
        QVERIFY(QMetaObject::invokeMethod(dock, "toggleMaximize", Q_ARG(QVariant, QVariant(QStringLiteral("viewport-source")))));
        render();
        QVERIFY(!program->isVisible());
        QVERIFY(store->dispatch({{"type", "hide"}, {"panelId", "source"}}));
        render();
        QVERIFY2(program->isVisible(), "Closing a maximized optional panel must restore the required panels");
        QVERIFY(store->dispatch({{"type", "reveal"}, {"panelId", "source"}}));
        render();
        root->setWidth(400);
        render();
        auto* groupResize = named(root, "dockResizeGroups_viewport_0");
        QVERIFY(groupResize);
        const double pairLength = program->width() + source->width();
        QVERIFY(pairLength < 128);
        QCOMPARE(groupResize->property("minimum").toDouble(), pairLength / 2);
        QCOMPARE(groupResize->property("maximum").toDouble(), pairLength / 2);
        root->setWidth(1500);
        render();
        auto* programGroup = named(root, "dockTab_program")->parentItem();
        while (programGroup && !programGroup->objectName().startsWith("dockGroup_")) programGroup = programGroup->parentItem();
        QVERIFY(programGroup);
        const auto groupId = programGroup->objectName().mid(QStringLiteral("dockGroup_").size());
        auto* options = named(root, "dockPanelOptions_" + groupId);
        QVERIFY(options);
        click(options);
        render();
        auto* closeItem = named(window.contentItem(), "dockMenuClose_" + groupId);
        QVERIFY(closeItem);
        QTRY_VERIFY2(closeItem->isVisible() && closeItem->width() > options->width() * 2, "Panel options menu must show its items");
        QTest::keyClick(&window, Qt::Key_Escape);
        render();
        auto* tab = named(root, "dockTab_program");
        QVERIFY(tab);
        const auto start = tab->mapToScene({tab->width() / 2, tab->height() / 2}).toPoint();
        const auto finish = inspector->mapToScene({inspector->width() / 2, inspector->height() / 2}).toPoint();
        mouse(QEvent::MouseButtonPress, start, Qt::LeftButton, Qt::LeftButton);
        mouse(QEvent::MouseMove, finish, Qt::NoButton, Qt::LeftButton);
        mouse(QEvent::MouseButtonRelease, finish, Qt::LeftButton, Qt::NoButton);
        render();
        const auto right = store->layout().value("regions").toMap().value("right").toList();
        QVERIFY(right.first().toMap().value("panels").toStringList().contains("program"));
        QVERIFY(program->mapToItem(dock, QPointF{}).x() >= dock->width() - dock->property("rightExtent").toDouble());
        QCOMPARE(named(root, "timelineInspector"), inspector);
        clock.seek(1300);
        QCOMPARE(model.documentJson(), document);
        QCOMPARE(model.undoStack()->count(), 0);
        QVERIFY(image.pixelColor(10, 10).alpha() > 0);
        window.setRenderTarget({});
        root->setParentItem(nullptr);
        control.invalidate();
    }
};
QTEST_MAIN(TestDockUi)
#include "tst_dockui.moc"
