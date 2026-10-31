#include "InspectorSectionRegistry.h"
#include "InspectorEdits.h"
#include "app/EditRegistry.h"
#include <algorithm>
#include "edit/ClipGestureController.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include <QGuiApplication>
#include <QFile>
#include <QJsonDocument>
#include <QJSValue>
#include <limits>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWindow>
#include <QtTest>
#include <functional>
#include <memory>

namespace {
QQuickItem* findItem(QQuickItem* root, const QString& name) {
    if (root->objectName() == name) { return root; }
    for (auto* child : root->childItems()) {
        if (auto* found = findItem(child, name)) { return found; }
    }
    return nullptr;
}
QQuickItem* section(QQuickItem* root, const QString& title) {
    if (root->property("title").toString() == title) { return root; }
    for (auto* child : root->childItems()) {
        if (auto* found = section(child, title)) { return found; }
    }
    return nullptr;
}
QQuickItem* flickable(QQuickItem* item) {
    if (item->property("contentY").isValid()) { return item; }
    for (auto* child : item->childItems()) {
        if (auto* found = flickable(child)) { return found; }
    }
    return nullptr;
}
bool textSignal(QObject* item, const char* signal, const QString& value) {
    return item && QMetaObject::invokeMethod(item, signal, Q_ARG(QString, value));
}
struct Editor {
    TimelineModel model;
    PlaybackClock clock;
    QQmlEngine engine;
    QQuickWindow window;
    std::unique_ptr<QObject> object;
    QString error;
    Editor() {
        auto parsed = nt::parseTimelineJson(R"({"name":"Inspector sections","width":640,"height":360,"fps":30,"durationMs":7000,"tracks":[{"id":"v","type":"video","name":"Video"}],"clips":[{"id":"a","name":"First","trackId":"v","mediaType":"image","startMs":0,"durationMs":3000,"currentAssetId":"asset-a"},{"id":"b","name":"Second","trackId":"v","mediaType":"image","startMs":3000,"durationMs":3000,"currentAssetId":"asset-b"}]})");
        model.setTimeline(std::move(*parsed.timeline));
        QQmlComponent component(&engine, QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/TimelineEditor.qml"));
        object.reset(component.createWithInitialProperties({{"timeline", QVariant::fromValue(&model)},
            {"clock", QVariant::fromValue(&clock)}, {"width", 1280}, {"height", 800}}));
        error = component.errorString();
        window.resize(1280, 800);
        if (root()) { root()->setParentItem(window.contentItem()); }
        window.show();
    }
    QQuickItem* root() const { return qobject_cast<QQuickItem*>(object.get()); }
    QQuickItem* inspector() const { return findItem(root(), "timelineInspector"); }
    ClipGestureController* gestures() const { return object->findChild<ClipGestureController*>("clipGestures"); }
    QJsonObject clip(const QString& id) const {
        for (const auto& c : model.clipsJson()) { if (c.toObject()["id"] == id) { return c.toObject(); } }
        return {};
    }
};
}
class TestInspectorSections : public QObject {
    Q_OBJECT
private slots:
    void init() { QTest::failOnWarning(QRegularExpression(".*Binding loop.*")); }
    void initTestCase() {
        QVERIFY(nt::inspector::registerInspectorSection("probe", QUrl("qrc:/inspector-test/TestInspectorSection.qml"), 55, "Probe"));
    }
    void registeredOrderAndDependencies() {
        Editor e; QVERIFY2(e.object, qPrintable(e.error));
        QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        QVERIFY(findItem(e.inspector(), "testInspectorSection"));
        e.gestures()->setSelection({"b"});
        auto* panel = e.inspector(); QVERIFY(panel);
        QTRY_VERIFY(findItem(panel, "testInspectorSection"));
        if (const auto screenshot = qEnvironmentVariable("NT_INSPECTOR_SCREENSHOT"); !screenshot.isEmpty()) {
            // Every section open, cropped to the panel: a layout review image.
            const std::function<void(QQuickItem*)> openAll = [&](QQuickItem* item) {
                if (item->property("defaultOpen").isValid()) item->setProperty("open", true);
                for (auto* child : item->childItems()) openAll(child);
            };
            openAll(panel);
            e.window.resize(1280, 4000);
            e.root()->setHeight(4000);
            QTest::qWait(300);
            const QRectF area = panel->mapRectToScene(QRectF(0, 0, panel->width(), panel->height()));
            QVERIFY(e.window.grabWindow().copy(area.toRect()).save(screenshot));
        }
        auto* probe = findItem(panel, "testInspectorSection");
        auto* transform = section(panel, "Transform"); QVERIFY(transform);
        auto* animate = section(panel, "Animate"); QVERIFY(animate);
        QTRY_VERIFY(probe->mapToItem(panel, QPointF{}).y() >= transform->mapToItem(panel, QPointF{}).y() + transform->height());
        QVERIFY(probe->mapToItem(panel, QPointF{}).y() < animate->mapToItem(panel, QPointF{}).y());
        QCOMPARE(probe->property("timelineModel").value<QObject*>(), &e.model);
        QCOMPARE(probe->property("gestures").value<QObject*>(), e.gestures());
        QCOMPARE(probe->property("controller").value<QObject*>(), panel->findChild<QObject*>("clipInspectorController"));
    }
    void transitionInViewport() {
        Editor e; QVERIFY2(e.object, qPrintable(e.error));
        QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        auto* transition = findItem(e.root(), "inspectorTransition"); QVERIFY(transition);
        QCOMPARE(transition->implicitHeight(), 0.0);
        e.gestures()->setSelection({"b"});
        auto* viewport = flickable(e.inspector()); QVERIFY(viewport);
        QTRY_COMPARE(e.inspector()->findChild<QObject*>("clipInspectorController")->property("clipId").toString(), QString("b"));
        for (const auto& title : {QString("Media"), QString("Timing"), QString("Render"), QString("Transform"), QString("Animate")}) {
            if (auto* s = section(e.inspector(), title)) { s->setProperty("open", true); }
        }
        QTest::qWait(30);
        // Scroll even on the old layout: a sibling panel cannot be brought in
        // by scrolling the Inspector's content.
        viewport->setProperty("contentY", std::clamp(transition->mapToItem(viewport, QPointF{}).y(), 0.0,
            std::max(0.0, viewport->property("contentHeight").toDouble() - viewport->height())));
        QCoreApplication::processEvents();
        const auto inWindow = transition->mapRectToScene(QRectF(0, 0, transition->width(), std::max(1.0, transition->height())));
        qInfo() << "Transition window rectangle" << inWindow << "window" << e.window.size();
        QVERIFY2(QRectF(0, 0, 1280, 800).contains(inWindow), "Transition section lies outside the window");
        QTRY_VERIFY(transition->implicitHeight() > 0);
        const auto inViewport = transition->mapRectToItem(viewport, QRectF(0, 0, transition->width(), transition->height()));
        QVERIFY2(QRectF(0, 0, viewport->width(), viewport->height()).contains(inViewport), "Transition section lies outside the Inspector viewport");
        QVERIFY2(viewport->property("contentY").toDouble() > 0, "Transition test must actually scroll the Inspector");
        QCOMPARE(transition->property("timelineModel").value<QObject*>(), &e.model);
        const auto before = e.model.documentJson(); const auto count = e.model.undoStack()->count();
        QVERIFY(textSignal(findItem(transition, "transitionType"), "change", "crossfade"));
        QCOMPARE(e.model.undoStack()->count(), count + 1);
        QCOMPARE(e.clip("b")["transitionIn"].toObject()["type"].toString(), QString("crossfade"));
        e.model.undoStack()->undo(); QCOMPARE(e.model.documentJson(), before);
    }
    void multiSelection() {
        Editor e; QVERIFY2(e.object, qPrintable(e.error));
        QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        e.gestures()->setSelection({"a", "b"});
        auto* header = findItem(e.inspector(), "multiSelectionHeader");
        QVERIFY2(header, "B30: multi-selection must show a clips header instead of No selection");
        QTRY_VERIFY(header->isVisible());
        QCOMPARE(header->property("eyebrow").toString(), QString("2 clips"));
        auto* group = findItem(e.inspector(), "groupSelectedClips"); QVERIFY(group); QVERIFY(group->isVisible());
        QCOMPARE(group->property("text").toString(), QString("Group selected clips"));
        auto* help = findItem(e.inspector(), "groupSelectionHelp"); QVERIFY(help);
        QCOMPARE(help->property("text").toString(), QString("Grouping parents these clips to one group clip: it moves, trims and fades them together. Per-field editing of several clips at once is not yet supported."));
        const auto before = e.model.documentJson();
        QVERIFY(QMetaObject::invokeMethod(group, "clicked"));
        QCOMPARE(e.model.undoStack()->count(), 1); QCOMPARE(e.model.clipsJson().size(), 3);
        e.model.undoStack()->undo(); QCOMPARE(e.model.documentJson(), before);
        QVERIFY(textSignal(header, "actionTriggered", "Delete selection"));
        QCOMPARE(e.model.undoStack()->count(), 1); QVERIFY(e.model.clipsJson().isEmpty());
        e.model.undoStack()->undo(); QCOMPARE(e.model.documentJson(), before);
    }
    void groupSelection() {
        Editor e; QVERIFY2(e.object, qPrintable(e.error));
        QVERIFY(e.model.applyEdit("groupClips", {{"selectedIds", QJsonArray{"a", "b"}}}));
        const auto id = e.model.clipsJson().last().toObject()["id"].toString();
        e.gestures()->setSelection({id});
        QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        auto* group = findItem(e.inspector(), "clipGroupPanel");
        QVERIFY2(group, "B31: selected group needs ClipGroupPanel"); QTRY_VERIFY(group->isVisible());
        QCOMPARE(findItem(group, "groupChildren")->property("value").toString(), QString("2"));
        QVERIFY(!section(e.inspector(), "Render")->isVisible());
        QVERIFY(!section(e.inspector(), "Animate")->isVisible());
        QCOMPARE(findItem(group, "groupTrimHint")->property("text").toString(), QString("Trimming the group pulls its children inside the window that leaves."));
        auto* groupTiming = section(group, "Timing"); QVERIFY(groupTiming);
        groupTiming->setProperty("open", true);
        for (const auto& edit : QList<QPair<QString, QString>>{{"timingStart", "00:00:01:00"}, {"timingDuration", "4.00"}}) {
            const auto before = e.model.documentJson(); const auto index = e.model.undoStack()->index();
            QVERIFY(textSignal(findItem(group, edit.first), "commit", edit.second));
            QVERIFY(e.model.documentJson() != before); QCOMPARE(e.model.undoStack()->index(), index + 1);
            e.model.undoStack()->undo(); QCOMPARE(e.model.documentJson(), before);
        }
        const auto hiddenBefore = e.model.documentJson(); const auto hiddenIndex = e.model.undoStack()->index();
        QVERIFY(QMetaObject::invokeMethod(findItem(group, "timingHidden"), "change", Q_ARG(bool, true)));
        QCOMPARE(e.model.undoStack()->index(), hiddenIndex + 1); QVERIFY(e.clip(id)["hidden"].toBool());
        e.model.undoStack()->undo(); QCOMPARE(e.model.documentJson(), hiddenBefore);
        e.model.undoStack()->clear();
        auto* name = findItem(group, "groupName"); QVERIFY(name);
        auto before = e.model.documentJson(); auto count = e.model.undoStack()->count();
        QVERIFY(textSignal(name, "commit", "Renamed")); QCOMPARE(e.clip(id)["name"].toString(), QString("Renamed"));
        QCOMPARE(e.model.undoStack()->count(), count + 1); e.model.undoStack()->undo(); QCOMPARE(e.model.documentJson(), before);
        auto* ungroup = findItem(group, "ungroupChildren"); QVERIFY(ungroup);
        QVERIFY(QMetaObject::invokeMethod(ungroup, "clicked")); QCOMPARE(e.model.undoStack()->count(), count + 1);
        QVERIFY(e.clip(id).isEmpty()); QVERIFY(!e.clip("a").contains("parentId"));
        e.model.undoStack()->undo(); QCOMPARE(e.model.documentJson(), before);
    }
    void mediaAndTiming() {
        Editor e; QVERIFY2(e.object, qPrintable(e.error)); e.gestures()->setSelection({"b"});
        QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        auto* media = section(e.inspector(), "Media"); QVERIFY2(media, "B32: Media section is missing");
        auto* timing = section(e.inspector(), "Timing"); QVERIFY2(timing, "B32: Timing section is missing");
        QVERIFY(media->mapToItem(e.inspector(), QPointF{}).y() < timing->mapToItem(e.inspector(), QPointF{}).y());
        QVERIFY(timing->mapToItem(e.inspector(), QPointF{}).y() < section(e.inspector(), "Render")->mapToItem(e.inspector(), QPointF{}).y());
        media->setProperty("open", true); timing->setProperty("open", true);
        QCOMPARE(findItem(media, "mediaType")->property("value").toString(), QString("image"));
        QCOMPARE(findItem(media, "mediaAsset")->property("value").toString(), QString("asset-b"));
        for (const auto& edit : QList<QPair<QString, QString>>{{"timingStart", "00:00:04:00"}, {"timingDuration", "2.00"}, {"timingSpeed", "2.00"}}) {
            auto* field = findItem(timing, edit.first); QVERIFY(field);
            const auto before = e.model.documentJson(); const auto count = e.model.undoStack()->index();
            QVERIFY(textSignal(field, "commit", edit.second)); QVERIFY(e.model.documentJson() != before);
            QCOMPARE(e.model.undoStack()->count(), count + 1); e.model.undoStack()->undo(); QCOMPARE(e.model.documentJson(), before);
        }
        auto* hidden = findItem(timing, "timingHidden"); QVERIFY(hidden);
        const auto before = e.model.documentJson(); const auto count = e.model.undoStack()->index();
        QVERIFY(QMetaObject::invokeMethod(hidden, "change", Q_ARG(bool, true)));
        QVERIFY(e.clip("b")["hidden"].toBool()); QCOMPARE(e.model.undoStack()->count(), count + 1);
        e.model.undoStack()->undo(); QCOMPARE(e.model.documentJson(), before);
    }
    void duplicateRegistry() {
        InspectorSectionRegistry registry;
        const auto before = registry.sections(); QVERIFY(before.size() >= 4);
        int previous = std::numeric_limits<int>::min();
        for (const auto& entry : before) {
            const auto current = entry.toMap()["order"].toInt();
            QVERIFY(current >= previous); previous = current;
        }
        QTest::ignoreMessage(QtWarningMsg, "Duplicate Inspector section: probe");
        QVERIFY(!nt::inspector::registerInspectorSection("probe", QUrl("qrc:/missing.qml"), 1, "Duplicate"));
        QCOMPARE(registry.sections(), before);
    }
    void parentAndLocks() {
        Editor e; QVERIFY2(e.object, qPrintable(e.error));
        QVERIFY(e.model.applyEdit("groupClips", {{"selectedIds", QJsonArray{"a", "b"}}}));
        const auto groupId = e.model.clipsJson().last().toObject()["id"].toString();
        e.model.undoStack()->clear(); e.gestures()->setSelection({"b"});
        QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        auto* media = findItem(e.inspector(), "inspectorMedia"); QVERIFY(media); media->setProperty("open", true);
        auto* timing = findItem(e.inspector(), "inspectorTiming"); QVERIFY(timing); timing->setProperty("open", true);
        auto before = e.model.documentJson();
        QVERIFY(QMetaObject::invokeMethod(findItem(media, "ungroupParent"), "clicked"));
        QCOMPARE(e.model.undoStack()->index(), 1); QVERIFY(!e.clip("b").contains("parentId"));
        e.model.undoStack()->undo(); QCOMPARE(e.model.documentJson(), before);
        QVERIFY(textSignal(findItem(media, "mediaParent"), "change", "none"));
        QCOMPARE(e.model.undoStack()->index(), 1); QVERIFY(!e.clip("b").contains("parentId"));
        e.model.undoStack()->clear();
        QVERIFY(textSignal(findItem(media, "mediaParent"), "change", groupId));
        QCOMPARE(e.model.undoStack()->count(), 1); QCOMPARE(e.clip("b")["parentId"].toString(), groupId);
        e.gestures()->setSelection({groupId}); QCoreApplication::processEvents();
        const auto options = media->property("parentOptions").value<QJSValue>().toVariant().toList();
        QVERIFY(!options.isEmpty());
        for (const auto& option : options) { QVERIFY(option.toMap()["value"] != groupId); }
        e.gestures()->setSelection({"b"});
        for (const auto& lock : {QString("clip"), QString("track")}) {
            auto raw = QJsonDocument::fromJson(e.model.documentJson()).object();
            auto clips = raw["clips"].toArray(); auto c = clips[1].toObject(); c.insert("locked", lock == "clip"); clips[1] = c; raw.insert("clips", clips);
            auto tracks = raw["tracks"].toArray(); auto t = tracks[0].toObject(); t.insert("locked", lock == "track"); tracks[0] = t; raw.insert("tracks", tracks);
            auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson()); QVERIFY(parsed.timeline);
            e.model.setTimeline(std::move(*parsed.timeline));
            QCoreApplication::processEvents();
            QCOMPARE(findItem(timing, "timingLockHint")->property("text").toString(), lock == "clip" ? QString("Unlock the clip to edit timing") : QString("Unlock the track to edit timing"));
            before = e.model.documentJson();
            QVERIFY(textSignal(findItem(timing, "timingStart"), "commit", "1000"));
            QVERIFY(textSignal(findItem(timing, "timingDuration"), "commit", "1.00"));
            QVERIFY(textSignal(findItem(timing, "timingSpeed"), "commit", "2.00"));
            QVERIFY(textSignal(findItem(media, "mediaParent"), "change", "none"));
            QCOMPARE(e.model.documentJson(), before); QCOMPARE(e.model.undoStack()->count(), 0);
        }
    }
    void timingScrubs() {
        Editor e; QVERIFY2(e.object, qPrintable(e.error)); e.gestures()->setSelection({"b"});
        QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        auto* timing = findItem(e.inspector(), "inspectorTiming"); QVERIFY(timing); timing->setProperty("open", true);
        for (const auto& name : {QString("timingDuration"), QString("timingSpeed")}) {
            auto* field = findItem(timing, name); QVERIFY(field);
            const auto before = e.model.documentJson(); const auto index = e.model.undoStack()->index();
            QVERIFY(QMetaObject::invokeMethod(field, "gestureStarted"));
            QVERIFY(textSignal(field, "preview", name == "timingDuration" ? "2.50" : "1.50"));
            QVERIFY(textSignal(field, "preview", "2.00"));
            QVERIFY(e.model.documentJson() != before); QCOMPARE(e.model.undoStack()->index(), index);
            QVERIFY(textSignal(field, "commit", "2.00")); QCOMPARE(e.model.undoStack()->index(), index + 1);
            QCOMPARE(e.clip("b")["durationMs"].toDouble(), name == "timingDuration" ? 2000.0 : 1500.0);
            const auto after = e.model.documentJson();
            e.model.undoStack()->undo(); QCOMPARE(e.model.documentJson(), before);
            e.model.undoStack()->redo(); QCOMPARE(e.model.documentJson(), after);
            e.model.undoStack()->undo();
        }
    }

    void timingKeyboardCancelRestoresPreviewWithoutUndo() {
        Editor e; QVERIFY2(e.object, qPrintable(e.error));
        QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        auto* dockStore = e.root()->findChild<QObject*>("dockLayoutStore"); QVERIFY(dockStore);
        QVERIFY(QMetaObject::invokeMethod(dockStore, "dispatch", Q_ARG(QVariantMap,
            (QVariantMap{{"type", "reveal"}, {"panelId", "inspector"}}))));
        e.gestures()->setSelection({"b"});
        QTRY_COMPARE(e.inspector()->findChild<QObject*>("clipInspectorController")->property("clipId").toString(), QString("b"));
        auto* timing = findItem(e.inspector(), "inspectorTiming"); QVERIFY(timing);
        timing->setProperty("open", true);
        auto* duration = findItem(timing, "timingDuration"); QVERIFY(duration);
        QTRY_VERIFY(duration->isVisible());
        auto* field = findItem(duration, "inspectorNumericField"); QVERIFY(field);
        const auto before = e.model.documentJson();
        const auto undoCount = e.model.undoStack()->count();
        field->forceActiveFocus();
        QVERIFY2(field->hasActiveFocus(), "Duration number field did not receive focus");
        QSignalSpy previews(duration, SIGNAL(preview(QString)));
        QTest::keyPress(&e.window, Qt::Key_Up);
        QVERIFY2(e.model.documentJson() != before, qPrintable(QStringLiteral("preview count=%1 field enabled=%2 text=%3")
            .arg(previews.count()).arg(field->isEnabled()).arg(field->property("text").toString())));
        QCOMPARE(e.model.undoStack()->count(), undoCount);
        QTest::keyClick(&e.window, Qt::Key_Escape);
        QCOMPARE(e.model.documentJson(), before);
        QCOMPARE(e.model.undoStack()->count(), undoCount);
        QTest::keyRelease(&e.window, Qt::Key_Up);
        QTest::keyClick(&e.window, Qt::Key_Up);
        QCOMPARE(e.model.undoStack()->count(), undoCount + 1);
        e.model.undoStack()->undo();
        QCOMPARE(e.model.documentJson(), before);
    }

    void selectionChangeDuringScrub() {
        Editor e; QVERIFY2(e.object, qPrintable(e.error)); e.gestures()->setSelection({"b"});
        QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        auto* timing = findItem(e.inspector(), "inspectorTiming"); QVERIFY(timing); timing->setProperty("open", true);
        auto* duration = findItem(timing, "timingDuration"); QVERIFY(duration);
        const auto before = e.model.documentJson();
        QVERIFY(QMetaObject::invokeMethod(duration, "gestureStarted"));
        QVERIFY(textSignal(duration, "preview", "2.00")); QVERIFY(e.model.documentJson() != before);
        e.gestures()->setSelection({"a"}); QCoreApplication::processEvents();
        QCOMPARE(e.model.documentJson(), before);
        QVERIFY(textSignal(duration, "commit", "2.00"));
        QCOMPARE(e.model.documentJson(), before); QCOMPARE(e.model.undoStack()->count(), 0);
        QVERIFY(textSignal(duration, "commit", "1.00"));
        QCOMPARE(e.clip("a")["durationMs"].toDouble(), 1000.0); QCOMPARE(e.model.undoStack()->count(), 1);
    }
    void largeParentPicker() {
        QFile sourceFile(":/qt/qml/NodeTool/Timeline/src/edit/inspectorsections/MediaSection.qml");
        QVERIFY(sourceFile.open(QIODevice::ReadOnly));
        const auto source = QString::fromUtf8(sourceFile.readAll());
        const QString marker = "readonly property var parentOptions: {";
        const auto start = source.indexOf(marker); QVERIFY(start >= 0);
        const auto end = source.indexOf("\n    }\n    title:",start); QVERIFY(end > start);
        // Execute the shipped QML binding's actual JS. QML binding globals
        // are separate from evaluate(), so instrument this extracted binding.
        const auto binding = source.mid(start + marker.size(),end - start - marker.size());
        QJsonArray clips;
        constexpr int groupCount = 2000;
        for (int i = 0; i < groupCount; ++i) {
            QJsonObject group{{"id",QString("g%1").arg(i)},{"mediaType","group"}};
            if (i > 0) { group.insert("parentId",QString("g%1").arg(i - 1)); }
            clips.append(group);
        }
        QJSEngine engine;
        const auto setup = engine.evaluate("var mapReads = 0; var OriginalMap = Map; Map = class extends OriginalMap { get(key) { ++mapReads; return super.get(key); } };");
        QVERIFY2(!setup.isError(),qPrintable(setup.toString()));
        engine.globalObject().setProperty("document",engine.toScriptValue(QJsonObject{{"clips",clips}}.toVariantMap()));
        engine.globalObject().setProperty("root",engine.toScriptValue(QVariantMap{{"clip",QVariantMap{{"id","leaf"}}}}));
        const auto run = [&] { return engine.evaluate("(function() {" + binding + "\n})()"); };
        auto result = run(); QVERIFY2(!result.isError(),qPrintable(result.toString()));
        auto options = result.toVariant().toList();
        QCOMPARE(options.size(),groupCount + 1);
        QCOMPARE(options.last().toMap()["value"].toString(),QString("g1999"));
        const auto reads = engine.evaluate("mapReads").toInt();
        qInfo() << "Parent picker Map reads:" << reads << "groups:" << groupCount;
        QVERIFY2(reads > 0,"The complexity check must inspect the QML's Map operations");
        QVERIFY2(reads <= groupCount * 4,"Parent picker must not walk every ancestor chain independently");
        engine.globalObject().property("root").setProperty("clip",engine.toScriptValue(QVariantMap{{"id","g0"}}));
        result = run(); QVERIFY2(!result.isError(),qPrintable(result.toString()));
        options = result.toVariant().toList();
        QCOMPARE(options.size(),1); QCOMPARE(options[0].toMap()["value"].toString(),QString("none"));
        // A cycle away from the selected clip stays selectable and terminates.
        auto first = clips[0].toObject(); first.insert("parentId","g1999"); clips[0] = first;
        engine.globalObject().setProperty("document",engine.toScriptValue(QJsonObject{{"clips",clips}}.toVariantMap()));
        engine.globalObject().property("root").setProperty("clip",engine.toScriptValue(QVariantMap{{"id","leaf"}}));
        result = run(); QVERIFY2(!result.isError(),qPrintable(result.toString())); QCOMPARE(result.toVariant().toList().size(),groupCount + 1);
    }
    void speedEdit() {
        const auto speed = nt::app::findEdit("setClipSpeed"); QVERIFY(speed);
        QJsonObject a{{"id","a"},{"trackId","v"},{"mediaType","video"},{"startMs",0},{"durationMs",3000},
                      {"linkId","L"},{"outPointMs",3000},{"custom","keep"},
                      {"caption",QJsonObject{{"words",QJsonArray{QJsonObject{{"startMs",100},{"endMs",200},{"text","Word"}}}}}}};
        auto b = a; b.insert("id","b"); b.insert("trackId","a"); b.insert("mediaType","audio");
        auto neighbour = a; neighbour.insert("id","next"); neighbour.remove("linkId"); neighbour.insert("startMs",4000);
        QJsonObject raw{{"tracks",QJsonArray{QJsonObject{{"id","v"},{"type","video"}},QJsonObject{{"id","a"},{"type","audio"}}}},
                        {"clips",QJsonArray{a,b,neighbour}}};
        const auto result = speed(raw, {{"clipId","a"},{"speedMultiplier",0.5}})["clips"].toArray();
        for (int i = 0; i < 2; ++i) {
            QCOMPARE(result[i].toObject()["durationMs"].toDouble(),4000.0);
            QCOMPARE(result[i].toObject()["outPointMs"].toDouble(),2000.0);
            QCOMPARE(result[i].toObject()["speedMultiplier"].toDouble(),0.5);
            QCOMPARE(result[i].toObject()["custom"].toString(),QString("keep"));
        }
        QCOMPARE(result[0].toObject()["caption"].toObject()["words"].toArray()[0].toObject()["startMs"].toDouble(),200.0);
        QCOMPARE(result[2],QJsonValue(neighbour));
        const auto unlinked = speed(raw, {{"clipId","a"},{"speed",2.0},{"linked",false}})["clips"].toArray();
        QCOMPARE(unlinked[0].toObject()["durationMs"].toDouble(),1500.0); QCOMPARE(unlinked[1],QJsonValue(b));
        for (const auto& refusal : {QString("locked"),QString("remap"),QString("group")}) {
            auto changed = a;
            if (refusal == "locked") { changed.insert("locked",true); }
            else if (refusal == "remap") { changed.insert("timeRemap",QJsonObject{{"keyframes",QJsonArray{QJsonObject{{"t",0},{"sourceMs",0}}}}}); }
            else { changed.insert("mediaType","group"); }
            auto invalid = raw; invalid.insert("clips",QJsonArray{changed,b,neighbour});
            QCOMPARE(speed(invalid, {{"clipId","a"},{"speed",2.0}}),invalid);
        }
        QJsonArray many;
        for (int i = 0; i < 32000; ++i) { auto c = a; c.insert("id",QString::number(i)); many.append(c); }
        raw.insert("clips",many);
        const auto large = speed(raw, {{"clipId","0"},{"speed",2.0}})["clips"].toArray();
        QCOMPARE(large.size(),many.size()); QCOMPARE(large.last().toObject()["durationMs"].toDouble(),1500.0);
    }
    void staleTimingGesture() {
        Editor e; QVERIFY2(e.object, qPrintable(e.error));
        InspectorEdits edits; edits.setModel(&e.model);
        const auto original = e.model.documentJson();
        const QJsonObject start{{"clipId","b"},{"speed",1.0}};
        edits.beginGesture("setClipSpeed",start);
        edits.preview({{"speed",2.0}});
        QVERIFY(e.model.documentJson() != original);
        edits.cancelGesture(); QCOMPARE(e.model.documentJson(),original);
        edits.commit("setClipSpeed",{{"clipId","b"},{"speed",2.0}});
        QCOMPARE(e.model.documentJson(),original); QCOMPARE(e.model.undoStack()->count(),0);
        edits.beginGesture("setClipSpeed",start); edits.preview({{"speed",2.0}});
        QVERIFY(e.model.applyEdit("patchClip",{{"clipId","b"},{"patch",QJsonObject{{"name","External edit"}}}}));
        const auto external = e.model.documentJson();
        edits.commit("setClipSpeed",{{"clipId","b"},{"speed",3.0}});
        QCOMPARE(e.model.documentJson(),external); QCOMPARE(e.model.undoStack()->count(),1);
        edits.beginGesture("setClipSpeed",start); edits.preview({{"speed",4.0}});
        auto parsed = nt::parseTimelineJson(original); QVERIFY(parsed.timeline);
        e.model.setTimeline(std::move(*parsed.timeline));
        edits.commit("setClipSpeed",{{"clipId","b"},{"speed",3.0}});
        QCOMPARE(e.model.documentJson(),original); QCOMPARE(e.model.undoStack()->count(),0);
    }

};
int main(int argc, char** argv) {
    QGuiApplication app(argc, argv);
    TestInspectorSections tests;
    return QTest::qExec(&tests, argc, argv);
}
#include "tst_inspectorsections.moc"
