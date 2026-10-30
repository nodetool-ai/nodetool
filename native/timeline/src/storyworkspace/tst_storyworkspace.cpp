#include "storyworkspace/StoryWorkspace.h"
#include "model/TimelineJson.h"
#include <QJsonArray>
#include <QJsonDocument>
#include <QtTest>
#include <QQmlEngine>
#include <QQmlComponent>
#include <QQuickWindow>
#include <QQuickItem>
#include <QPointer>
#include <QFile>
#include <QJsonDocument>

namespace {
QJsonObject board(const QString& id = "board", const QString& revision = "rev1") {
    return {{"id", id}, {"projectId", "project"}, {"updatedAt", revision}, {"document", QJsonObject{
        {"shots", QJsonArray{QJsonObject{{"id", "shot"}, {"action", "Original"}, {"clip_versions", QJsonArray{QJsonObject{{"asset_id", "candidate"}}}}}}},
        {"entityIds", QJsonArray{}}}}};
}
nt::Timeline timeline(const QString& id = "timeline") {
    nt::Timeline result; result.raw = {{"id", id}, {"projectId", "project"}, {"tracks", QJsonArray{}}, {"clips", QJsonArray{}}}; return result;
}
QString action(const StoryWorkspace& workspace) {
    return QJsonObject::fromVariantMap(workspace.resource()).value("document").toObject().value("shots").toArray().first().toObject().value("action").toString();
}
}
class StoryWorkspaceTest : public QObject {
    Q_OBJECT
private slots:
    void mountedNarrowEditorKeepsFocusAndSavesThroughF10() {
        qmlRegisterSingletonType(QUrl::fromLocalFile(QStringLiteral(NT_STORY_SOURCE "/qml/Theme.qml")), "NodeTool.StoryWorkspaceTest", 1, 0, "Theme");
        TimelineModel model; model.setTimeline(timeline());
        AssistController controller; controller.setModel(&model); controller.setProperty("documentOnly", true);
        StoryWorkspace workspace; workspace.setController(&controller);
        auto stored = board(); int writes = 0;
        controller.setCall([&](bool write, const QString&, const QJsonObject& input) {
            if (write) { ++writes; stored.insert("document", input.value("document")); stored.insert("updatedAt", "mounted-rev"); }
            return nt::server::QueryResult{stored, {}};
        });
        QVERIFY(controller.openStoryboard("board")); QTRY_VERIFY(!controller.busy());
        QQmlEngine engine;
        QFile source(QStringLiteral(NT_STORY_SOURCE "/qml/storyworkspace/StoryWorkspaceEditor.qml"));
        QVERIFY(source.open(QIODevice::ReadOnly));
        // Isolate the theme import so this mounted panel does not load the full app module.
        auto qml = source.readAll(); qml.replace("import NodeTool.Timeline", "import NodeTool.StoryWorkspaceTest");
        QQmlComponent component(&engine);
        component.setData(qml, QUrl::fromLocalFile(source.fileName()));
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> object(component.createWithInitialProperties({{"controller", QVariant::fromValue(&controller)}, {"workspace", QVariant::fromValue(&workspace)}}));
        QVERIFY2(object, qPrintable(component.errorString()));
        auto* item = qobject_cast<QQuickItem*>(object.get()); QVERIFY(item);
        QQuickWindow window; window.resize(320, 720); item->setParentItem(window.contentItem()); item->setSize(window.size()); window.show();
        QTRY_VERIFY(window.isVisible());
        QPointer<QObject> field;
        const auto findItem = [](QQuickItem* root, const QString& name, auto&& recurse) -> QObject* {
            if (root->objectName() == name) { return root; }
            for (auto* child : root->childItems()) { if (auto* found = recurse(child, name, recurse)) { return found; } }
            return nullptr;
        };
        QTRY_VERIFY((field = findItem(item, "workspaceShot_action", findItem)));
        field->setProperty("text", "Mounted edit");
        QVERIFY(QMetaObject::invokeMethod(field, "textEdited"));
        QVERIFY(workspace.dirty()); QCOMPARE(action(workspace), QString("Mounted edit"));
        QCoreApplication::processEvents(); QVERIFY(field); // A keystroke must not rebuild the focused delegate.
        auto* save = findItem(item, "workspaceSave", findItem); QVERIFY(save); QVERIFY(save->property("enabled").toBool());
        QVERIFY(QMetaObject::invokeMethod(save, "clicked")); QTRY_VERIFY(!controller.busy());
        QCOMPARE(writes, 1); QVERIFY(!workspace.dirty()); QCOMPARE(model.undoStack()->count(), 0);
        QTest::qWait(50);
        const auto image = window.grabWindow(); QVERIFY(!image.isNull());
        QVERIFY(image.save(QDir::tempPath() + "/o5-workspace-narrow.png"));
        item->setParentItem(nullptr);
    }
    void unlinkedScriptCannotSilentlyApplyToAnotherCut() {
        TimelineModel model; model.setTimeline(timeline());
        AssistController controller; controller.setModel(&model); controller.setProperty("documentOnly", true);
        const QJsonObject script{{"id", "script"}, {"timelineId", "other-cut"}, {"updatedAt", "base"}, {"document", QJsonObject{{"sections", QJsonArray{}}}}};
        int calls = 0;
        controller.setCall([&](bool, const QString&, const QJsonObject&) { ++calls; return nt::server::QueryResult{script, {}}; });
        QVERIFY(controller.openScript("script")); QTRY_VERIFY(!controller.busy());
        const auto before = model.timeline().raw;
        QVERIFY(!controller.applyScriptRevision("script")); QCOMPARE(calls, 1);
        QVERIFY(controller.error().contains("Link this script")); QCOMPARE(model.timeline().raw, before); QCOMPARE(model.undoStack()->count(), 0);
    }
    void linkedScriptOpenAndSaveWaitForExplicitApply() {
        auto source = timeline();
        source.raw.insert("tracks", QJsonArray{QJsonObject{{"id", "audio"}, {"type", "audio"}, {"index", 0}}});
        source.raw.insert("clips", QJsonArray{QJsonObject{{"id", "clip"}, {"trackId", "audio"}, {"mediaType", "audio"},
            {"scriptId", "script"}, {"scriptLineId", "deleted-line"}, {"startMs", 0}, {"durationMs", 1000}}});
        const auto parsed = nt::parseTimelineJson(QJsonDocument(source.raw).toJson());
        QVERIFY2(parsed.timeline.has_value(), qPrintable(parsed.error));
        TimelineModel model; model.setTimeline(*parsed.timeline); const auto before = model.timeline().raw;
        AssistController controller; controller.setModel(&model); controller.setProperty("documentOnly", true);
        StoryWorkspace workspace; workspace.setController(&controller);
        QJsonObject stored{{"id", "script"}, {"timelineId", "timeline"}, {"updatedAt", "rev1"}, {"document", QJsonObject{
            {"cast", QJsonArray{QJsonObject{{"id", "speaker"}, {"name", "Alice"}}}}, {"sections", QJsonArray{}}}}};
        controller.setCall([&](bool write, const QString&, const QJsonObject& input) {
            if (write) { stored.insert("document", input.value("document")); stored.insert("updatedAt", "rev2"); }
            return nt::server::QueryResult{stored, {}};
        });
        QVERIFY(controller.openScript("script")); QTRY_VERIFY(!controller.busy());
        QCOMPARE(model.timeline().raw, before); QCOMPARE(model.undoStack()->count(), 0);
        QVERIFY(workspace.patchSpeaker("speaker", "name", "Alice Smith"));
        QVERIFY(workspace.save()); QTRY_VERIFY(!controller.busy());
        QVERIFY(!workspace.dirty()); QCOMPARE(model.timeline().raw, before); QCOMPARE(model.undoStack()->count(), 0);
        QVERIFY(controller.applyScriptRevision("script")); QTRY_VERIFY(!controller.busy());
        QVERIFY(model.timeline().raw.value("clips").toArray().isEmpty()); QCOMPARE(model.undoStack()->count(), 1);
        model.undoStack()->undo(); QCOMPARE(model.timeline().raw, before);
    }
    void explicitSaveUsesSharedControllerCasAndKeepsCut() {
        TimelineModel model; model.setTimeline(timeline());
        AssistController controller; controller.setModel(&model);
        QVERIFY(controller.setProperty("documentOnly", true));
        StoryWorkspace workspace; workspace.setController(&controller);
        auto stored = board(); QJsonObject submitted; QString procedure;
        controller.setCall([&](bool write, const QString& name, const QJsonObject& input) {
            if (write) { procedure = name; submitted = input; stored.insert("document", input.value("document")); stored.insert("updatedAt", "rev2"); }
            return nt::server::QueryResult{stored, {}};
        });
        QVERIFY(controller.openStoryboard("board")); QTRY_VERIFY(!controller.busy());
        const auto before = model.timeline().raw;
        QVERIFY(workspace.patchShot("shot", "action", "Draft shot"));
        QVERIFY(workspace.dirty()); QCOMPARE(controller.result().toMap().value("document").toMap().value("shots").toList().first().toMap().value("action").toString(), QString("Original"));
        QVERIFY(submitted.isEmpty());
        QVERIFY(workspace.save()); QTRY_VERIFY(!controller.busy());
        QVERIFY(!workspace.dirty()); QCOMPARE(action(workspace), QString("Draft shot"));
        QCOMPARE(procedure, QString("storyboards.update")); QCOMPARE(submitted.value("baseUpdatedAt").toString(), QString("rev1"));
        QCOMPARE(submitted.value("document"), QJsonObject::fromVariantMap(workspace.resource()).value("document"));
        QCOMPARE(model.timeline().raw, before); QCOMPARE(model.undoStack()->count(), 0);
    }
    void draftsSurviveResourceAndTimelineSwitches() {
        TimelineModel first; first.setTimeline(timeline());
        TimelineModel second; second.setTimeline(timeline("other-timeline"));
        AssistController controller; controller.setModel(&first); controller.setProperty("documentOnly", true);
        StoryWorkspace workspace; workspace.setController(&controller);
        controller.setCall([](bool, const QString&, const QJsonObject& input) { return nt::server::QueryResult{board(input.value("id").toString()), {}}; });
        QVERIFY(controller.openStoryboard("board")); QTRY_VERIFY(!controller.busy());
        QVERIFY(workspace.patchShot("shot", "action", "Keep this draft"));
        QVERIFY(controller.openStoryboard("another-board")); QTRY_VERIFY(!controller.busy());
        QVERIFY(!workspace.dirty()); QCOMPARE(action(workspace), QString("Original"));
        QVERIFY(controller.openStoryboard("board")); QTRY_VERIFY(!controller.busy());
        QVERIFY(workspace.dirty()); QCOMPARE(action(workspace), QString("Keep this draft"));
        controller.setModel(&second); QVERIFY(controller.openStoryboard("board")); QTRY_VERIFY(!controller.busy());
        QVERIFY(!workspace.dirty()); QCOMPARE(action(workspace), QString("Original"));
        controller.setModel(&first); QVERIFY(controller.openStoryboard("board")); QTRY_VERIFY(!controller.busy());
        QVERIFY(workspace.dirty()); QCOMPARE(action(workspace), QString("Keep this draft"));
    }
    void failureRetainsDraftAndRetryConfirmsIt() {
        TimelineModel model; model.setTimeline(timeline());
        AssistController controller; controller.setModel(&model); controller.setProperty("documentOnly", true);
        StoryWorkspace workspace; workspace.setController(&controller);
        bool fail = true; auto stored = board();
        controller.setCall([&](bool write, const QString&, const QJsonObject& input) {
            if (write && fail) { nt::server::QueryResult failed; failed.error.message = "Offline"; return failed; }
            if (write) { stored.insert("document", input.value("document")); stored.insert("updatedAt", "rev2"); }
            return nt::server::QueryResult{stored, {}};
        });
        QVERIFY(controller.openStoryboard("board")); QTRY_VERIFY(!controller.busy());
        QVERIFY(workspace.patchShot("shot", "action", "Retained")); QVERIFY(workspace.save()); QTRY_VERIFY(!controller.busy());
        QVERIFY(workspace.dirty()); QCOMPARE(action(workspace), QString("Retained")); QVERIFY(!workspace.error().isEmpty());
        fail = false; QVERIFY(workspace.save()); QTRY_VERIFY(!controller.busy());
        QVERIFY(!workspace.dirty()); QCOMPARE(action(workspace), QString("Retained"));
    }
    void remoteChangeDoesNotOverwriteRetainedDraft() {
        TimelineModel model; model.setTimeline(timeline());
        AssistController controller; controller.setModel(&model); controller.setProperty("documentOnly", true);
        StoryWorkspace workspace; workspace.setController(&controller);
        auto stored = board(); int writes = 0;
        controller.setCall([&](bool write, const QString&, const QJsonObject&) { if (write) { ++writes; } return nt::server::QueryResult{stored, {}}; });
        QVERIFY(controller.openStoryboard("board")); QTRY_VERIFY(!controller.busy());
        QVERIFY(workspace.patchShot("shot", "action", "Local draft"));
        stored = board("board", "remote-revision");
        QVERIFY(controller.openStoryboard("board")); QTRY_VERIFY(!controller.busy());
        QVERIFY(!workspace.save()); QCOMPARE(writes, 0); QVERIFY(workspace.dirty()); QCOMPARE(action(workspace), QString("Local draft"));
        QVERIFY(workspace.error().contains("changed remotely"));
        workspace.discard(); QVERIFY(!workspace.dirty()); QCOMPARE(action(workspace), QString("Original"));
    }
    void entitySaveUsesOriginalMetadataAsCompareAndSwap() {
        TimelineModel model; model.setTimeline(timeline());
        AssistController controller; controller.setModel(&model); controller.setProperty("documentOnly", true);
        StoryWorkspace workspace; workspace.setController(&controller);
        const QJsonObject metadata{{"unrelated", "keep"}, {"nodetool_entity", QJsonObject{{"kind", "character"}, {"name", "Alice"}, {"descriptor", "Original"}}}};
        QJsonObject stored{{"id", "character"}, {"metadata", metadata}}; QJsonObject submitted; QString procedure;
        controller.setCall([&](bool write, const QString& name, const QJsonObject& input) {
            if (write) { procedure = name; submitted = input; stored.insert("metadata", input.value("metadata")); }
            return nt::server::QueryResult{stored, {}};
        });
        QVERIFY(controller.openEntity("character")); QTRY_VERIFY(!controller.busy());
        QVERIFY(workspace.patchEntity("descriptor", "A red coat")); QVERIFY(workspace.save()); QTRY_VERIFY(!controller.busy());
        QVERIFY(!workspace.dirty()); QCOMPARE(procedure, QString("assets.update")); QCOMPARE(submitted.value("expected_metadata").toObject(), metadata);
        QCOMPARE(submitted.value("metadata").toObject().value("unrelated").toString(), QString("keep"));
        QCOMPARE(model.undoStack()->count(), 0);
    }
    void jsonEditsRejectInvalidReferencesBeforeAnyWrite() {
        TimelineModel model; model.setTimeline(timeline()); AssistController controller; controller.setModel(&model);
        StoryWorkspace workspace; workspace.setController(&controller);
        controller.setCall([](bool, const QString&, const QJsonObject&) { return nt::server::QueryResult{board(), {}}; });
        QVERIFY(controller.openStoryboard("board")); QTRY_VERIFY(!controller.busy());
        QVERIFY(!workspace.patchJson("shot", "production.references", "[{bad]")); QVERIFY(!workspace.dirty());
        QVERIFY(!workspace.patchJson("shot", "production.references", "[{\"uri\":17}]")); QVERIFY(!workspace.dirty());
        QVERIFY(workspace.patchJson("shot", "production.references", "[{\"uri\":\"https://example.test/look\",\"revision\":\"v2\"}]")); QVERIFY(workspace.dirty());
    }
    void sameResourceIdKeepsScriptAndStoryboardDraftsSeparate() {
        const QString sharedId = "123456789abc123456789abc12345678";
        TimelineModel model; model.setTimeline(timeline());
        AssistController controller; controller.setModel(&model); controller.setProperty("documentOnly", true);
        StoryWorkspace workspace; workspace.setController(&controller);
        const QJsonObject script{{"id", sharedId}, {"updatedAt", "script-rev"}, {"document", QJsonObject{
            {"cast", QJsonArray{QJsonObject{{"id", "speaker"}, {"name", "Alice"}}}}, {"sections", QJsonArray{}}}}};
        controller.setCall([&](bool, const QString& procedure, const QJsonObject&) {
            return nt::server::QueryResult{procedure == "scripts.get" ? script : board(sharedId), {}};
        });
        QVERIFY(controller.openStoryboard(sharedId)); QTRY_VERIFY(!controller.busy());
        QVERIFY(workspace.patchShot("shot", "action", "Board-only draft"));
        const QString raw = "[{\"uri\": unfinished";
        workspace.setJsonDraft("shot", "production.references", raw);
        QVERIFY(controller.openScript(sharedId)); QTRY_VERIFY(!controller.busy());
        QVERIFY(!workspace.dirty()); QVERIFY(workspace.resource().value("document").toMap().contains("sections"));
        QVERIFY(workspace.patchSpeaker("speaker", "name", "Script-only draft"));
        QVERIFY(controller.openStoryboard(sharedId)); QTRY_VERIFY(!controller.busy());
        QVERIFY(workspace.dirty()); QCOMPARE(action(workspace), QString("Board-only draft"));
        QCOMPARE(workspace.jsonDraft("shot", "production.references", QJsonArray{}), raw);
        workspace.discard(); QVERIFY(!workspace.dirty());
        QVERIFY(controller.openScript(sharedId)); QTRY_VERIFY(!controller.busy());
        QVERIFY(workspace.dirty());
        const auto cast = workspace.resource().value("document").toMap().value("cast").toList();
        QCOMPARE(cast.first().toMap().value("name").toString(), QString("Script-only draft"));
    }
    void contextBrowseUsesExactProjectAndTimelineIds() {
        const QString projectId = "abcdef123456abcdef123456abcdef12";
        const QString timelineId = "123456789abc123456789abc12345678";
        auto source = timeline(timelineId); source.raw.insert("projectId", projectId);
        TimelineModel model; model.setTimeline(source);
        AssistController controller; controller.setModel(&model);
        QString called; QJsonObject payload;
        controller.setCall([&](bool, const QString& procedure, const QJsonObject& input) {
            called = procedure; payload = input; return nt::server::QueryResult{QJsonArray{}, {}};
        });
        QVERIFY(controller.listContextResources("scripts", true)); QTRY_VERIFY(!controller.busy());
        QCOMPARE(called, QString("scripts.list"));
        QCOMPARE(payload, (QJsonObject{{"projectId", projectId}, {"timelineId", timelineId}}));
        QVERIFY(controller.listContextResources("scripts", false)); QTRY_VERIFY(!controller.busy());
        QCOMPARE(called, QString("scripts.list")); QCOMPARE(payload, (QJsonObject{{"projectId", projectId}}));
        QVERIFY(controller.listContextResources("storyboards", true)); QTRY_VERIFY(!controller.busy());
        QCOMPARE(called, QString("storyboards.list")); QCOMPARE(payload, (QJsonObject{{"projectId", projectId}}));
        QVERIFY(!controller.listContextResources("assets", true));
        auto local = timeline(); local.raw.remove("projectId"); model.setTimeline(local);
        QVERIFY(!controller.listContextResources("storyboards", false));
        QVERIFY(controller.error().contains("project timeline"));
    }
    void invalidRawReferenceDraftSurvivesSwitchAndBlocksSave() {
        TimelineModel model; model.setTimeline(timeline()); AssistController controller; controller.setModel(&model);
        StoryWorkspace workspace; workspace.setController(&controller);
        int writes = 0;
        controller.setCall([&](bool write, const QString&, const QJsonObject& input) {
            if (write) { ++writes; }
            return nt::server::QueryResult{board(input.value("id").toString()), {}};
        });
        QVERIFY(controller.openStoryboard("board")); QTRY_VERIFY(!controller.busy());
        const QString raw = "[{\"uri\": unfinished";
        workspace.setJsonDraft("shot", "production.references", raw);
        QVERIFY(workspace.dirty()); QVERIFY(!workspace.save()); QCOMPARE(writes, 0);
        QVERIFY(controller.openStoryboard("other-board")); QTRY_VERIFY(!controller.busy());
        QVERIFY(!workspace.dirty());
        QVERIFY(controller.openStoryboard("board")); QTRY_VERIFY(!controller.busy());
        QVERIFY(workspace.dirty()); QCOMPARE(workspace.jsonDraft("shot", "production.references", QJsonArray{}), raw);
        QVERIFY(!workspace.save()); QCOMPARE(writes, 0);
        workspace.discard(); QVERIFY(!workspace.dirty()); QVERIFY(QJsonDocument::fromJson(workspace.jsonDraft("shot", "production.references", QJsonArray{}).toUtf8()).array().isEmpty());
    }
};
QTEST_MAIN(StoryWorkspaceTest)
#include "tst_storyworkspace.moc"
