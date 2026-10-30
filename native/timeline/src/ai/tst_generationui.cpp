#include "edit/ClipGestureController.h"
#include "ai/GenerationController.h"
#include "../../tests/TestHttpServer.h"
#include <QJsonDocument>
#include <QTemporaryDir>
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"

#include <QGuiApplication>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWindow>
#include <QtTest>
#include <memory>
#include <functional>

class GenerationUiTest : public QObject {
    Q_OBJECT
private:
    QTemporaryDir m_preferencesDir;
private slots:
    void initTestCase() {
        QVERIFY(m_preferencesDir.isValid());
        qputenv("NODETOOL_TIMELINE_PREFERENCES", (m_preferencesDir.path() + "/preferences.ini").toUtf8());
    }
    void editorRegistryEntry() {
        auto parsed = nt::parseTimelineJson(R"({"id":"timeline","name":"Fixture","fps":30,"width":640,"height":360,
          "tracks":[{"id":"v","name":"Video","type":"video","index":0}],
          "clips":[{"id":"clip","name":"Clip","trackId":"v","mediaType":"video","sourceType":"generated",
                    "workflowId":"workflow","selectedOutputNodeId":"output",
                    "startMs":0,"durationMs":4000,"bindingKind":"text-to-video","currentAssetId":"old",
                    "status":"generated","locked":false,"versions":[]}]})");
        QVERIFY(parsed.timeline);
        TimelineModel timeline;
        timeline.setTimeline(std::move(*parsed.timeline));
        PlaybackClock clock;
        QQmlEngine engine;
        QQmlComponent component(&engine, QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/TimelineEditor.qml"));
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> editor(component.createWithInitialProperties({
            {"timeline", QVariant::fromValue(&timeline)}, {"clock", QVariant::fromValue(&clock)},
            {"width", 1200}, {"height", 800}}));
        QVERIFY2(editor, qPrintable(component.errorString()));
        auto* root = qobject_cast<QQuickItem*>(editor.get());
        QVERIFY(root);
        auto* initialDockStore = root->findChild<QObject*>("dockLayoutStore");
        QVERIFY(initialDockStore);
        QVERIFY(QMetaObject::invokeMethod(initialDockStore, "switchWorkspace", Q_ARG(int, 0)));
        QQuickWindow window;
        window.resize(1200, 800);
        root->setParentItem(window.contentItem());
        const std::function<QQuickItem*(QQuickItem*)> findEntry = [&](QQuickItem* item) -> QQuickItem* {
            if (item->objectName() == "generateButton") return item;
            for (auto* child : item->childItems()) if (auto* found = findEntry(child)) return found;
            return nullptr;
        };
        QTRY_VERIFY(findEntry(root));
        auto* entry = findEntry(root);
        auto* toolbar = entry->parent();
        QVERIFY(toolbar);
        auto* gestures = qvariant_cast<ClipGestureController*>(toolbar->property("gestures"));
        QVERIFY(gestures);
        QTemporaryDir cache;
        TestHttpServer server;
        server.setJson([](const QByteArray&, const QUrl&) {
            const QJsonArray nodes{
                QJsonObject{{"id", "prompt"}, {"type", "nodetool.input.StringInput"}, {"data", QJsonObject{{"name", "prompt"}, {"label", "Prompt"}, {"value", "default"}}}},
                QJsonObject{{"id", "image"}, {"type", "nodetool.input.ImageInput"}, {"data", QJsonObject{{"name", "image"}, {"label", "Image"}}}}};
            const QJsonObject workflow{{"id", "workflow"}, {"graph", QJsonObject{{"nodes", nodes}, {"edges", QJsonArray{}}}}};
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", workflow}}}}).toJson(QJsonDocument::Compact);
        });
        server.setFile("/api/sdk/v1/preflight", ServedFile(R"({"version":1,"level":"static","workflow_id":"workflow","cost":{"amount":0.25,"currency":"USD","confidence":"partial","unknown_cost_nodes":["missing"]}})"));
        auto* generation = qobject_cast<GenerationController*>(toolbar->property("generationController").value<QObject*>());
        QVERIFY(generation);
        generation->m_target = nt::server::SaveTarget{server.base(), {}, "timeline", cache.path()};
        gestures->setSelection({QStringLiteral("clip")});
        const std::function<QQuickItem*(QQuickItem*, const QString&)> findNamed = [&](QQuickItem* item, const QString& name) -> QQuickItem* {
            if (item->objectName() == name) return item;
            for (auto* child : item->childItems()) if (auto* found = findNamed(child, name)) return found;
            return nullptr;
        };
        QTRY_VERIFY(findNamed(root, QStringLiteral("inspectorAiSection")));
        auto* section = findNamed(root, QStringLiteral("inspectorAiSection"));
        QTRY_COMPARE(section->property("host").value<QObject*>(), toolbar);
        QTRY_VERIFY(section->isVisible());
        QTRY_VERIFY(findNamed(section, QStringLiteral("regenerateClip")));
        auto* regenerate = findNamed(section, QStringLiteral("regenerateClip"));
        QVERIFY(regenerate->parentItem());
        QCOMPARE(regenerate->parentItem()->property("controller").value<QObject*>(),
                 toolbar->property("generationController").value<QObject*>());
        QTRY_VERIFY(findNamed(section, QStringLiteral("workflowInput_prompt")));
        auto* promptInput = findNamed(section, QStringLiteral("workflowInput_prompt"));
        QCOMPARE(promptInput->property("text").toString(), QStringLiteral("default"));
        promptInput->setProperty("text", QStringLiteral("edited"));
        QVERIFY(QMetaObject::invokeMethod(promptInput, "editingFinished"));
        QTRY_COMPARE(timeline.clipsJson().first().toObject().value("paramOverrides").toObject().value("prompt").toString(), QStringLiteral("edited"));
        QCOMPARE(timeline.undoStack()->count(), 1);
        timeline.undoStack()->undo();
        QVERIFY(!timeline.clipsJson().first().toObject().value("paramOverrides").toObject().contains("prompt"));
        QTRY_VERIFY(findNamed(section, QStringLiteral("workflowInputJson_image")));
        auto* imageInput = findNamed(section, QStringLiteral("workflowInputJson_image"));
        imageInput->setProperty("text", QStringLiteral(R"({"type":"image","asset_id":"image-id"})"));
        auto* applyInput = findNamed(section, QStringLiteral("workflowInputApply_image"));
        QVERIFY(applyInput);
        QVERIFY(QMetaObject::invokeMethod(applyInput, "clicked"));
        QTRY_COMPARE(timeline.clipsJson().first().toObject().value("paramOverrides").toObject().value("image").toObject().value("asset_id").toString(), QStringLiteral("image-id"));
        QTRY_VERIFY(findNamed(section, QStringLiteral("workflowCost")));
        auto* cost = findNamed(section, QStringLiteral("workflowCost"));
        QTRY_VERIFY(cost->property("text").toString().contains(QStringLiteral("$0.25")));
        auto* review = findNamed(section, QStringLiteral("inspectorReviewTakes"));
        QVERIFY(review);
        QVERIFY(QMetaObject::invokeMethod(review, "clicked"));
        auto* dialog = toolbar->findChild<QObject*>("generateDialog");
        QVERIFY(dialog);
        QTRY_VERIFY(dialog->property("visible").toBool());
        QVERIFY(QMetaObject::invokeMethod(dialog, "close"));
        auto* dockStore = root->findChild<QObject*>("dockLayoutStore");
        QVERIFY(dockStore);
        QVERIFY(QMetaObject::invokeMethod(dockStore, "switchWorkspace", Q_ARG(int, 1)));
        QTRY_VERIFY(findNamed(root, QStringLiteral("timelineScriptPanel")));
        QTRY_COMPARE(findNamed(root, QStringLiteral("timelineScriptPanel"))->property("timeline").value<QObject*>(), static_cast<QObject*>(&timeline));
        QVERIFY(QMetaObject::invokeMethod(dockStore, "switchWorkspace", Q_ARG(int, 2)));
        QTRY_VERIFY(findNamed(root, QStringLiteral("timelineAssistantPanel")));
        QTRY_COMPARE(findNamed(root, QStringLiteral("timelineAssistantPanel"))->property("timeline").value<QObject*>(), static_cast<QObject*>(&timeline));
        root->setParentItem(nullptr);
    }
    void playbackDurationTracksEdits() {
        auto parsed = nt::parseTimelineJson(R"({"id":"timeline","name":"Empty","fps":30,"width":640,"height":360,"tracks":[{"id":"v","name":"Video","type":"video","index":0}],"clips":[]})");
        QVERIFY(parsed.timeline);
        TimelineModel timeline;
        timeline.setTimeline(std::move(*parsed.timeline));
        PlaybackClock clock;
        QQmlEngine engine;
        QQmlComponent component(&engine, QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/TimelineEditor.qml"));
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> editor(component.createWithInitialProperties({
            {"timeline", QVariant::fromValue(&timeline)}, {"clock", QVariant::fromValue(&clock)},
            {"width", 1200}, {"height", 800}}));
        QVERIFY2(editor, qPrintable(component.errorString()));
        QCOMPARE(clock.durationMs(), timeline.contentEndMs());
        const auto before = timeline.clipsJson();
        QJsonArray after{QJsonObject{{"id", "newclip"}, {"name", "Generated"}, {"trackId", "v"},
            {"mediaType", "video"}, {"sourceType", "generated"}, {"startMs", 10000}, {"durationMs", 4000}}};
        QVERIFY(timeline.commitEdit("Insert generated clip", before, after));
        QTRY_COMPARE(clock.durationMs(), timeline.contentEndMs());
        QCOMPARE(clock.durationMs(), 14000.0);
        timeline.undoStack()->undo();
        QTRY_COMPARE(clock.durationMs(), timeline.contentEndMs());
        timeline.undoStack()->redo();
        QTRY_COMPARE(clock.durationMs(), 14000.0);
        QSignalSpy changes(&timeline, &TimelineModel::timelineChanged);
        clock.play(); clock.tick(); clock.pause();
        QCOMPARE(changes.count(), 0);
    }
    void entryAndReview() {
        auto parsed = nt::parseTimelineJson(R"({"name":"Fixture","fps":30,"width":640,"height":360,
          "tracks":[{"id":"v","name":"Video","type":"video","index":0}],
          "clips":[{"id":"clip","name":"Clip","trackId":"v","mediaType":"video","sourceType":"generated",
                    "startMs":1000,"durationMs":4000,"bindingKind":"text-to-video","currentAssetId":"old",
                    "versions":[{"id":"take","assetId":"new","status":"success","durationMs":4000,
                                 "createdAt":"2026-01-01T00:00:00Z","workflowUpdatedAt":"2026-01-01T00:00:00Z",
                                 "jobId":"","dependencyHash":"","paramOverridesSnapshot":{}}]}]})");
        QVERIFY(parsed.timeline);
        TimelineModel timeline;
        timeline.setTimeline(std::move(*parsed.timeline));
        PlaybackClock clock;
        clock.setDurationMs(10000);
        clock.seek(1700);
        ClipGestureController gestures;
        gestures.setTimeline(&timeline);
        gestures.setClock(&clock);

        QQmlEngine engine;
        QQmlComponent component(&engine, QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/ai/GenerateToolbar.qml"));
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        const QVariantMap props{{"timeline", QVariant::fromValue(&timeline)}, {"gestures", QVariant::fromValue(&gestures)}};
        std::unique_ptr<QObject> object(component.createWithInitialProperties(props));
        QVERIFY2(object, qPrintable(component.errorString()));
        auto* item = qobject_cast<QQuickItem*>(object.get());
        QVERIFY(item);
        QQuickWindow window;
        window.resize(800, 800);
        item->setParentItem(window.contentItem());
        auto* entry = object->findChild<QObject*>("generateButton");
        QVERIFY(entry);
        QVERIFY(QMetaObject::invokeMethod(entry, "clicked"));
        auto* dialog = object->findChild<QObject*>("generateDialog");
        QVERIFY(dialog);
        QTRY_VERIFY(dialog->property("visible").toBool());
        auto* mode = object->findChild<QObject*>("generationMode");
        auto* model = object->findChild<QObject*>("generationModel");
        auto* duration = object->findChild<QObject*>("generationDuration");
        auto* prompt = object->findChild<QObject*>("generationPrompt");
        auto* generate = object->findChild<QObject*>("generationSubmit");
        QVERIFY(mode && model && duration && prompt && generate);
        QCOMPARE(mode->property("currentIndex").toInt(), 0);
        QCOMPARE(duration->property("currentText").toString(), QString("4"));
        QVERIFY(!generate->property("enabled").toBool());
        auto* generationController = object->findChild<QObject*>("generationController");
        QVERIFY(generationController);
        QVERIFY(QMetaObject::invokeMethod(generationController, "clipInserted", Q_ARG(QString, QStringLiteral("clip"))));
        QCOMPARE(gestures.selection(), QStringList{QStringLiteral("clip")});
        QTRY_VERIFY(object->findChild<QObject*>("clipAiOperation"));
        auto* clipOperation = object->findChild<QObject*>("clipAiOperation");
        QVERIFY(clipOperation->property("visible").toBool());
        auto* clipSubmit = object->findChild<QObject*>("clipAiSubmit");
        QVERIFY(clipSubmit);
        QVERIFY(!clipSubmit->property("enabled").toBool());
        auto* regenerate = object->findChild<QObject*>("regenerateClip");
        QVERIFY(regenerate);
        QTRY_VERIFY(regenerate->property("visible").toBool());
        auto clips = timeline.clipsJson();
        auto imageClip = clips.first().toObject();
        imageClip.insert("mediaType", "image");
        imageClip.insert("bindingKind", "text-to-image");
        clips.replace(0, imageClip);
        QVERIFY(timeline.replaceClips(clips));
        QTRY_VERIFY(regenerate->property("visible").toBool());
        imageClip.insert("bindingKind", "image-to-image");
        clips.replace(0, imageClip);
        QVERIFY(timeline.replaceClips(clips));
        QTRY_VERIFY(!regenerate->property("visible").toBool());
        clips.append(QJsonObject{{"id", "source"}, {"trackId", "v"}, {"mediaType", "image"},
                                 {"durationMs", 4000}, {"currentAssetId", "image-asset"}});
        imageClip.insert("sourceClipId", "source");
        clips.replace(0, imageClip);
        QVERIFY(timeline.replaceClips(clips));
        QTRY_VERIFY(regenerate->property("visible").toBool());
        imageClip.insert("bindingKind", "image-to-video");
        imageClip.insert("mediaType", "video");
        clips.replace(0, imageClip);
        QVERIFY(timeline.replaceClips(clips));
        QTRY_VERIFY(regenerate->property("visible").toBool());
        mode->setProperty("currentIndex", 2);
        QTRY_COMPARE(duration->property("currentText").toString(), QString("30"));
        mode->setProperty("currentIndex", 0);
        auto* pick = object->findChild<QObject*>("pickGenerationReferences");
        QVERIFY(pick);
        QVERIFY(QMetaObject::invokeMethod(pick, "clicked"));
        auto* picker = object->findChild<QObject*>("referencePicker");
        QVERIFY(picker);
        QTRY_VERIFY(picker->property("visible").toBool());
        QVERIFY(QMetaObject::invokeMethod(picker, "close"));
        auto* entityButton = object->findChild<QObject*>("pickGenerationEntities");
        QVERIFY(entityButton);
        QVERIFY(QMetaObject::invokeMethod(entityButton, "clicked"));
        auto* entityPicker = object->findChild<QObject*>("entityPicker");
        QVERIFY(entityPicker);
        QTRY_VERIFY(entityPicker->property("visible").toBool());
        QVERIFY(QMetaObject::invokeMethod(entityPicker, "close"));
        auto* controller = object->findChild<QObject*>("generationController");
        QVERIFY(controller);
        QCOMPARE(controller->property("candidates").toList().size(), 1);
        const std::function<QQuickItem*(QQuickItem*, const QString&)> findItem = [&](QQuickItem* item, const QString& name) -> QQuickItem* {
            if (item->objectName() == name) return item;
            for (auto* child : item->childItems()) if (auto* found = findItem(child, name)) return found;
            return nullptr;
        };
        QTRY_VERIFY(findItem(window.contentItem(), "previewGenerationTake"));
        auto* apply = findItem(window.contentItem(), "applyGenerationTake");
        QVERIFY(apply);
        QVERIFY(!apply->property("enabled").toBool());
        QVERIFY(findItem(window.contentItem(), "generationTakeLabel"));
        auto* rename = findItem(window.contentItem(), "renameGenerationTake");
        QVERIFY(rename);
        QVERIFY(rename->property("enabled").toBool());
        auto* previewPlay = findItem(window.contentItem(), "generationPreviewPlay");
        QVERIFY(previewPlay);
        clock.play();
        QVERIFY(clock.playing());
        QVERIFY(QMetaObject::invokeMethod(previewPlay, "clicked"));
        QVERIFY(!clock.playing());
        QVERIFY(QMetaObject::invokeMethod(dialog, "close"));
        item->setParentItem(nullptr);
    }
};
QTEST_MAIN(GenerationUiTest)
#include "tst_generationui.moc"
