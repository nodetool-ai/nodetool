#include <QFontInfo>
#include "storyworkspace/StoryWorkspace.h"
#include "aiassist/ScriptVoicing.h"
#include "aiassist/CandidatePreview.h"
#include "aiassist/ShotWorkflow.h"
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
    void mountedBrowseListsAndOpensResources_data() {
        QTest::addColumn<QString>("kind");
        QTest::addColumn<bool>("empty");
        QTest::newRow("scripts") << QString("scripts") << false;
        QTest::newRow("storyboards") << QString("storyboards") << false;
        QTest::newRow("empty-scripts") << QString("scripts") << true;
        QTest::newRow("empty-storyboards") << QString("storyboards") << true;
    }
    void mountedBrowseListsAndOpensResources() {
        QFETCH(QString, kind);
        QFETCH(bool, empty);
        qmlRegisterSingletonType(QUrl::fromLocalFile(QStringLiteral(NT_STORY_SOURCE "/qml/TimelineMetrics.qml")), "NodeTool.StoryWorkspaceTest", 1, 0, "TimelineMetrics");
        qmlRegisterType<ScriptVoicing>("NodeTool.StoryWorkspaceTest", 1, 0, "ScriptVoicing");
        qmlRegisterType<CandidatePreview>("NodeTool.StoryWorkspaceTest", 1, 0, "CandidatePreview");
        qmlRegisterType<ShotWorkflow>("NodeTool.StoryWorkspaceTest", 1, 0, "ShotWorkflow");
        TimelineModel model; model.setTimeline(timeline());
        AssistController controller; controller.setModel(&model); controller.setProperty("documentOnly", true);
        StoryWorkspace workspace; workspace.setController(&controller);
        const QString resourceId = "123456789abc123456789abc12345678";
        QString called, openedId;
        controller.setCall([&](bool, const QString& procedure, const QJsonObject& input) {
            called = procedure;
            if (procedure.endsWith(".list")) {
                return nt::server::QueryResult{empty ? QJsonArray{} : QJsonArray{QJsonObject{{"id", resourceId}, {"name", "Listed document"}, {"updatedAt", "2000-01-01T00:00:00Z"}}}, {}};
            }
            openedId = input.value("id").toString();
            return nt::server::QueryResult{kind == "storyboards" ? board(resourceId) : QJsonObject{{"id", resourceId}, {"name", "Opening narration"}, {"document", QJsonObject{
                {"cast", QJsonArray{QJsonObject{{"id", "narrator"}, {"name", "Narrator"}}}},
                {"sections", QJsonArray{QJsonObject{{"id", "intro"}, {"title", "Teaser"}, {"lines", QJsonArray{
                    QJsonObject{{"id", "line-one"}, {"speakerId", "narrator"}, {"text", "The convoy crossed the ridge."}},
                    QJsonObject{{"id", "line-two"}, {"speakerId", "narrator"}, {"text", "Dust rose against the evening sky."}}}}}}}}}}, {}};
        });
        QQmlEngine engine;
        QFile source(qEnvironmentVariable("NODETOOL_STORY_EDITOR_TEST", QStringLiteral(NT_STORY_SOURCE "/qml/storyworkspace/StoryWorkspaceEditor.qml")));
        QVERIFY(source.open(QIODevice::ReadOnly));
        auto qml = source.readAll(); qml.replace("import NodeTool.Timeline", "import NodeTool.StoryWorkspaceTest");
        QQmlComponent component(&engine); component.setData(qml, QUrl::fromLocalFile(source.fileName()));
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> object(component.createWithInitialProperties({{"controller", QVariant::fromValue(&controller)}, {"workspace", QVariant::fromValue(&workspace)}}));
        QVERIFY2(object, qPrintable(component.errorString()));
        auto* item = qobject_cast<QQuickItem*>(object.get()); QVERIFY(item);
        QQuickWindow window; window.resize(320, 480); item->setParentItem(window.contentItem()); item->setSize(window.size()); window.show();
        QTRY_VERIFY(window.isVisible());
        const auto findItem = [](QQuickItem* root, const QString& name, auto&& recurse) -> QQuickItem* {
            if (root->objectName() == name) { return root; }
            for (auto* child : root->childItems()) { if (auto* found = recurse(child, name, recurse)) { return found; } }
            return nullptr;
        };
        auto* browse = findItem(item, "workspaceDocumentKind", findItem);
        QVERIFY(browse);
        auto* heading = findItem(item, "workspaceTitle", findItem);
        QVERIFY(heading);
        QCOMPARE(QFontInfo(qvariant_cast<QFont>(heading->property("font"))).family(), QStringLiteral("Inter"));
        browse->forceActiveFocus();
        QTest::keyClick(&window, Qt::Key_Space);
        if (kind == "storyboards") QTest::keyClick(&window, Qt::Key_Down);
        QTest::keyClick(&window, Qt::Key_Return);
        QTRY_VERIFY(!controller.busy()); QCOMPARE(called, kind + ".list");
        QCOMPARE(controller.result().metaType().id(), QMetaType::QVariantList);
        if (empty) {
            auto* message = findItem(item, "workspaceListMessage", findItem); QVERIFY(message);
            QVERIFY(message->property("text").toString().startsWith("No " + kind + " in this context."));
        } else {
            QQuickItem* row = nullptr;
            QTRY_VERIFY_WITH_TIMEOUT((row = findItem(item, "workspaceResource_" + resourceId, findItem)), 2000);
            QVERIFY(row->isVisible()); QCOMPARE(row->property("text").toString(), QString("Listed document"));
            auto* search = findItem(item, "workspaceSearch", findItem);
            QVERIFY(search);
            search->forceActiveFocus();
            for (const QChar letter : QStringLiteral("missing")) QTest::keyClick(&window, static_cast<Qt::Key>(letter.toUpper().unicode()));
            QTRY_VERIFY(!findItem(item, "workspaceResource_" + resourceId, findItem));
            for (int index = 0; index < 7; ++index) QTest::keyClick(&window, Qt::Key_Backspace);
            for (const QChar letter : QStringLiteral("listed")) QTest::keyClick(&window, static_cast<Qt::Key>(letter.toUpper().unicode()));
            QTRY_VERIFY((row = findItem(item, "workspaceResource_" + resourceId, findItem)));
            const auto rowPoint = row->mapToScene({row->width() / 2, row->height() / 2}).toPoint();
            QTest::mouseClick(&window, Qt::LeftButton, Qt::NoModifier, rowPoint);
            QTRY_VERIFY(!controller.busy());
            QCOMPARE(called, kind + ".get"); QCOMPARE(openedId, resourceId);
            QCOMPARE(workspace.resource().value("id").toString(), resourceId);
            if (kind == "scripts") {
                auto* line = findItem(item, "workspaceScriptLine_line-one", findItem);
                QVERIFY(line);
                QVERIFY(line->property("quiet").toBool());
                QCOMPARE(line->property("text").toString(), QString("The convoy crossed the ridge."));
                QCoreApplication::processEvents();
                QVERIFY(window.grabWindow().save(QDir::tempPath() + "/native-web-script.png"));
            }
        }
        QCOMPARE(model.undoStack()->count(), 0);
        item->setParentItem(nullptr);
    }
    void linkedScriptPanelLinksAndUnlinksThroughDialog() {
        qmlRegisterSingletonType(QUrl::fromLocalFile(QStringLiteral(NT_STORY_SOURCE "/qml/TimelineMetrics.qml")), "NodeTool.StoryWorkspaceTest", 1, 0, "TimelineMetrics");
        qmlRegisterType<ScriptVoicing>("NodeTool.StoryWorkspaceTest", 1, 0, "ScriptVoicing");
        qmlRegisterType<CandidatePreview>("NodeTool.StoryWorkspaceTest", 1, 0, "CandidatePreview");
        qmlRegisterType<ShotWorkflow>("NodeTool.StoryWorkspaceTest", 1, 0, "ShotWorkflow");
        TimelineModel model; model.setTimeline(timeline());
        AssistController controller; controller.setModel(&model); controller.setProperty("documentOnly", true);
        AssistController picker; picker.setModel(&model); picker.setProperty("documentOnly", true);
        StoryWorkspace workspace; workspace.setController(&controller);
        const QString chosen = "aaaaaaaaaaaa1111111111111111aaaa", other = "bbbbbbbbbbbb2222222222222222bbbb";
        QString linkedId;
        QStringList calls;
        const auto script = [](const QString& id, const QString& name) {
            return QJsonObject{{"id", id}, {"name", name}, {"updatedAt", "2000-01-02T00:00:00Z"}, {"document", QJsonObject{
                {"cast", QJsonArray{QJsonObject{{"id", "narrator"}, {"name", "Narrator"}}}},
                {"sections", QJsonArray{QJsonObject{{"id", "intro"}, {"title", "Teaser"}, {"lines", QJsonArray{
                    QJsonObject{{"id", "line-one"}, {"speakerId", "narrator"}, {"text", "The convoy crossed the ridge."}}}}}}}}}};
        };
        const auto call = [&](bool, const QString& procedure, const QJsonObject& input) {
            calls.append(procedure + (input.contains("timelineId") ? (input.value("timelineId").isNull() ? ":null" : ":timeline") : QString()));
            if (procedure == "scripts.list") {
                QJsonArray rows{QJsonObject{{"id", chosen}, {"name", "Opening narration"}, {"updatedAt", "2000-01-02T00:00:00Z"}},
                    QJsonObject{{"id", other}, {"name", "Closing credits"}, {"updatedAt", "2000-01-01T00:00:00Z"}}};
                if (input.contains("timelineId")) { rows = {}; }
                if (input.contains("timelineId") && !linkedId.isEmpty()) { rows.append(QJsonObject{{"id", linkedId}, {"name", "Opening narration"}}); }
                return nt::server::QueryResult{rows, {}};
            }
            if (procedure == "scripts.update") {
                linkedId = input.value("timelineId").isNull() ? QString() : input.value("id").toString();
                return nt::server::QueryResult{script(input.value("id").toString(), "Opening narration"), {}};
            }
            return nt::server::QueryResult{script(input.value("id").toString(), "Opening narration"), {}};
        };
        controller.setCall(call); picker.setCall(call);
        QQmlEngine engine;
        QFile source(qEnvironmentVariable("NODETOOL_STORY_EDITOR_TEST", QStringLiteral(NT_STORY_SOURCE "/qml/storyworkspace/StoryWorkspaceEditor.qml")));
        QVERIFY(source.open(QIODevice::ReadOnly));
        auto qml = source.readAll(); qml.replace("import NodeTool.Timeline", "import NodeTool.StoryWorkspaceTest");
        QQmlComponent component(&engine); component.setData(qml, QUrl::fromLocalFile(source.fileName()));
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> object(component.createWithInitialProperties({{"controller", QVariant::fromValue(&controller)},
            {"workspace", QVariant::fromValue(&workspace)}, {"picker", QVariant::fromValue(&picker)}, {"fixedKind", "scripts"}}));
        QVERIFY2(object, qPrintable(component.errorString()));
        auto* item = qobject_cast<QQuickItem*>(object.get()); QVERIFY(item);
        QQuickWindow window; window.resize(720, 560); item->setParentItem(window.contentItem()); item->setSize({340, 560}); window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        const auto findItem = [](QQuickItem* root, const QString& name, auto&& recurse) -> QQuickItem* {
            if (root->objectName() == name && root->isVisible()) { return root; }
            for (auto* child : root->childItems()) { if (auto* found = recurse(child, name, recurse)) { return found; } }
            return nullptr;
        };
        const auto click = [&](QQuickItem* target) {
            QTest::mouseClick(&window, Qt::LeftButton, Qt::NoModifier, target->mapToScene({target->width() / 2, target->height() / 2}).toPoint());
        };
        QVERIFY(QMetaObject::invokeMethod(item, "loadLinked"));
        QTRY_VERIFY(findItem(window.contentItem(), "workspaceLinkEmpty", findItem));
        QVERIFY(window.grabWindow().save(QDir::tempPath() + "/linked-script-empty.png"));
        click(findItem(window.contentItem(), "workspaceLinkButton", findItem));
        QQuickItem* row = nullptr;
        QTRY_VERIFY((row = findItem(window.contentItem(), "linkDocument_" + chosen, findItem)));
        QVERIFY(findItem(window.contentItem(), "linkDocument_" + other, findItem));
        QVERIFY(window.grabWindow().save(QDir::tempPath() + "/linked-script-dialog.png"));
        auto* confirm = findItem(window.contentItem(), "linkDocumentConfirm", findItem); QVERIFY(confirm);
        QVERIFY(!confirm->isEnabled());
        click(row);
        QTRY_VERIFY(confirm->isEnabled());
        calls.clear();
        click(confirm);
        QTRY_COMPARE(calls, (QStringList{"scripts.update:timeline", "scripts.get"}));
        QTRY_VERIFY(!controller.busy());
        QCOMPARE(linkedId, chosen);
        auto* name = findItem(window.contentItem(), "workspaceLinkedName", findItem);
        QTRY_VERIFY(name); QCOMPARE(name->property("text").toString(), QString("Opening narration"));
        QTRY_VERIFY(findItem(window.contentItem(), "workspaceScriptLine_line-one", findItem));
        QVERIFY(!findItem(window.contentItem(), "workspaceLinkEmpty", findItem));
        QVERIFY(window.grabWindow().save(QDir::tempPath() + "/linked-script-open.png"));
        calls.clear();
        click(findItem(window.contentItem(), "workspaceUnlink", findItem));
        QTRY_COMPARE(calls, QStringList{"scripts.update:null"});
        QTRY_VERIFY(findItem(window.contentItem(), "workspaceLinkEmpty", findItem));
        QVERIFY(linkedId.isEmpty());
        QCOMPARE(model.undoStack()->count(), 0);
        item->setParentItem(nullptr);
    }
    void mountedNarrowEditorKeepsFocusAndSavesThroughF10() {
        qmlRegisterSingletonType(QUrl::fromLocalFile(QStringLiteral(NT_STORY_SOURCE "/qml/TimelineMetrics.qml")), "NodeTool.StoryWorkspaceTest", 1, 0, "TimelineMetrics");
        qmlRegisterType<ScriptVoicing>("NodeTool.StoryWorkspaceTest", 1, 0, "ScriptVoicing");
        qmlRegisterType<CandidatePreview>("NodeTool.StoryWorkspaceTest", 1, 0, "CandidatePreview");
        qmlRegisterType<ShotWorkflow>("NodeTool.StoryWorkspaceTest", 1, 0, "ShotWorkflow");
        TimelineModel model; model.setTimeline(timeline());
        AssistController controller; controller.setModel(&model); controller.setProperty("documentOnly", true);
        StoryWorkspace workspace; workspace.setController(&controller);
        auto stored = board(); int writes = 0; QString called;
        auto document = stored.value("document").toObject(); document.insert("entityIds", QJsonArray{"character"}); stored.insert("document", document);
        controller.setCall([&](bool write, const QString& procedure, const QJsonObject& input) {
            called = procedure;
            if (procedure == "scripts.list") { nt::server::QueryResult failure; failure.error.message = "Offline"; return failure; }
            if (procedure == "assets.get") { return nt::server::QueryResult{QJsonObject{{"id", "character"}, {"metadata", QJsonObject{{"nodetool_entity", QJsonObject{{"kind", "character"}, {"name", "Alice"}}}}}}, {}}; }
            if (write) { ++writes; stored.insert("document", input.value("document")); stored.insert("updatedAt", "mounted-rev"); }
            return nt::server::QueryResult{stored, {}};
        });
        QVERIFY(controller.openStoryboard("board")); QTRY_VERIFY(!controller.busy());
        QQmlEngine engine;
        QFile source(qEnvironmentVariable("NODETOOL_STORY_EDITOR_TEST", QStringLiteral(NT_STORY_SOURCE "/qml/storyworkspace/StoryWorkspaceEditor.qml")));
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
        auto* card = findItem(item, "shotCard_shot", findItem);
        QVERIFY(card);
        qobject_cast<QQuickItem*>(card)->forceActiveFocus();
        QTest::keyClick(&window, Qt::Key_Space);
        QObject* editShot = nullptr;
        QTRY_VERIFY((editShot = findItem(item, "shotInspectorEdit", findItem)));
        qobject_cast<QQuickItem*>(editShot)->forceActiveFocus();
        QTest::keyClick(&window, Qt::Key_Space);
        QTRY_VERIFY((field = findItem(item, "shotEdit_action", findItem)));
        QVERIFY(field->property("visible").toBool());
        qobject_cast<QQuickItem*>(field.data())->forceActiveFocus();
        QTest::keyClick(&window, Qt::Key_A, Qt::ControlModifier);
        for (const QChar letter : QStringLiteral("mounted edit")) {
            QTest::keyClick(&window, static_cast<Qt::Key>(letter.toUpper().unicode()),
                letter.isUpper() ? Qt::ShiftModifier : Qt::NoModifier);
        }
        // The shot editor holds a draft. Nothing reaches the board until Save.
        QVERIFY(!workspace.dirty()); QCOMPARE(writes, 0);
        QCoreApplication::processEvents(); QVERIFY(field); // A keystroke must not rebuild the focused field.
        auto* save = findItem(item, "shotEditorSave", findItem); QVERIFY(save); QTRY_VERIFY(save->property("enabled").toBool());
        qobject_cast<QQuickItem*>(save)->forceActiveFocus(); QTest::keyClick(&window, Qt::Key_Space); QTRY_VERIFY(!controller.busy());
        QCOMPARE(writes, 1); QVERIFY(!workspace.dirty()); QCOMPARE(action(workspace), QString("mounted edit")); QCOMPARE(model.undoStack()->count(), 0);
        QVERIFY(!save->property("enabled").toBool());
        auto* back = findItem(item, "shotEditorBack", findItem); QVERIFY(back);
        qobject_cast<QQuickItem*>(back)->forceActiveFocus(); QTest::keyClick(&window, Qt::Key_Space);
        QTRY_VERIFY(!findItem(item, "shotEditor", findItem));
        auto* scripts = findItem(item, "workspaceDocumentKind", findItem); QVERIFY(scripts);
        qobject_cast<QQuickItem*>(scripts)->forceActiveFocus(); QTest::keyClick(&window, Qt::Key_Space); QTest::keyClick(&window, Qt::Key_Up); QTest::keyClick(&window, Qt::Key_Return); QTRY_VERIFY(!controller.busy());
        QVERIFY(!controller.error().isEmpty());
        auto* settingsToggle = findItem(item, "storyboardSettingsToggle", findItem); QVERIFY(settingsToggle);
        qobject_cast<QQuickItem*>(settingsToggle)->forceActiveFocus(); QTest::keyClick(&window, Qt::Key_Space);
        QObject* inspect = nullptr; QTRY_VERIFY((inspect = findItem(item, "workspaceInspectEntity", findItem)));
        qobject_cast<QQuickItem*>(inspect)->forceActiveFocus(); QTest::keyClick(&window, Qt::Key_Space); QTRY_VERIFY(!controller.busy());
        QCOMPARE(called, QString("assets.get"));
        auto* returnBack = findItem(item, "workspaceBackToDocument", findItem); QVERIFY(returnBack);
        qobject_cast<QQuickItem*>(returnBack)->forceActiveFocus(); QTest::keyClick(&window, Qt::Key_Space); QTRY_VERIFY(!controller.busy());
        QCOMPARE(called, QString("storyboards.get")); // A failed script browse must not change the return document's kind.
        QCOMPARE(action(workspace), QString("mounted edit"));
        QTest::qWait(50);
        const auto image = window.grabWindow(); QVERIFY(!image.isNull());
        QVERIFY(image.save(QDir::tempPath() + "/o5-workspace-narrow.png"));
        item->setParentItem(nullptr);
    }
    void shotEditorKeepsDraftUntilSaveAndAsksBeforeDiscard() {
        qmlRegisterSingletonType(QUrl::fromLocalFile(QStringLiteral(NT_STORY_SOURCE "/qml/TimelineMetrics.qml")), "NodeTool.StoryWorkspaceTest", 1, 0, "TimelineMetrics");
        qmlRegisterType<ScriptVoicing>("NodeTool.StoryWorkspaceTest", 1, 0, "ScriptVoicing");
        qmlRegisterType<CandidatePreview>("NodeTool.StoryWorkspaceTest", 1, 0, "CandidatePreview");
        qmlRegisterType<ShotWorkflow>("NodeTool.StoryWorkspaceTest", 1, 0, "ShotWorkflow");
        TimelineModel model; model.setTimeline(timeline());
        AssistController controller; controller.setModel(&model); controller.setProperty("documentOnly", true);
        StoryWorkspace workspace; workspace.setController(&controller);
        QJsonObject stored{{"id", "board"}, {"projectId", "project"}, {"updatedAt", "rev1"}, {"document", QJsonObject{{"style", "noir"}, {"entityIds", QJsonArray{}},
            {"shots", QJsonArray{QJsonObject{{"id", "one"}, {"index", 0}, {"scene_id", "s"}, {"action", "A door opens"}, {"camera", QJsonObject{{"framing", "wide"}}}},
                QJsonObject{{"id", "two"}, {"index", 1}, {"scene_id", "s"}, {"action", "A hand"}}}}}}};
        int writes = 0;
        controller.setCall([&](bool write, const QString&, const QJsonObject& input) {
            if (write) { ++writes; stored.insert("document", input.value("document")); stored.insert("updatedAt", "rev" + QString::number(writes + 1)); }
            return nt::server::QueryResult{stored, {}};
        });
        QVERIFY(controller.openStoryboard("board")); QTRY_VERIFY(!controller.busy());
        QQmlEngine engine;
        QFile source(QStringLiteral(NT_STORY_SOURCE "/qml/storyworkspace/StoryWorkspaceEditor.qml")); QVERIFY(source.open(QIODevice::ReadOnly));
        auto qml = source.readAll(); qml.replace("import NodeTool.Timeline", "import NodeTool.StoryWorkspaceTest");
        QQmlComponent component(&engine); component.setData(qml, QUrl::fromLocalFile(source.fileName()));
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> object(component.createWithInitialProperties({{"controller", QVariant::fromValue(&controller)}, {"workspace", QVariant::fromValue(&workspace)}}));
        auto* item = qobject_cast<QQuickItem*>(object.get()); QVERIFY(item);
        QQuickWindow window; window.resize(1280, 800); item->setParentItem(window.contentItem()); item->setSize(window.size()); window.show();
        QTRY_VERIFY(window.isVisible());
        const auto findItem = [](QQuickItem* root, const QString& name, auto&& recurse) -> QQuickItem* {
            if (root->objectName() == name && root->isVisible()) { return root; }
            for (auto* child : root->childItems()) { if (auto* found = recurse(child, name, recurse)) { return found; } }
            return nullptr;
        };
        const auto press = [&window](QQuickItem* button) { QVERIFY(button); button->forceActiveFocus(); QTest::keyClick(&window, Qt::Key_Space); };
        item->setProperty("selectedShotId", "one");
        QQuickItem* editor = nullptr; QTRY_VERIFY((editor = findItem(item, "shotEditor", findItem)));
        auto* title = findItem(editor, "shotEditTitle", findItem); QVERIFY(title);
        QCOMPARE(title->property("text").toString(), QString("Scene 1, Shot 1"));
        auto* field = findItem(editor, "shotEdit_action", findItem); QVERIFY(field);
        field->forceActiveFocus(); QTest::keyClick(&window, Qt::Key_End);
        for (const QChar letter : QStringLiteral(" slowly")) { QTest::keyClick(&window, letter == ' ' ? Qt::Key_Space : static_cast<Qt::Key>(letter.toUpper().unicode())); }
        QVERIFY(editor->property("dirty").toBool()); QCOMPARE(writes, 0); QVERIFY(!workspace.dirty());
        // The prompt preview reads the draft through the same composer the render uses.
        auto* renders = item->findChild<QObject*>("shotRenders"); QVERIFY(renders);
        QString prompt;
        QVERIFY(QMetaObject::invokeMethod(renders, "prompt", Q_RETURN_ARG(QString, prompt), Q_ARG(QJsonObject, QJsonObject::fromVariantMap(editor->property("promptDocument").toMap())),
            Q_ARG(QJsonObject, QJsonObject::fromVariantMap(editor->property("previewShot").toMap())), Q_ARG(QString, "image")));
        QCOMPARE(prompt, QString("A door opens slowly, wide shot, noir"));
        QTest::qWait(50);
        QVERIFY(window.grabWindow().save(QDir::tempPath() + "/shot-editor-wide.png"));
        auto* form = findItem(editor, "shotEditForm", findItem); QVERIFY(form);
        form->setProperty("advancedOpen", true); form->setProperty("promptsOpen", true);
        auto* formScroll = findItem(editor, "shotEditorForm", findItem); QVERIFY(formScroll);
        QTest::qWait(100);
        QVERIFY(formScroll->property("contentHeight").toReal() > formScroll->height());
        formScroll->setProperty("contentY", formScroll->property("contentHeight").toReal() - formScroll->height());
        QTest::qWait(50);
        QVERIFY(window.grabWindow().save(QDir::tempPath() + "/shot-editor-wide-advanced.png"));
        editor->forceActiveFocus(); QTest::keyClick(&window, Qt::Key_Escape);
        QQuickItem* discard = nullptr; QTRY_VERIFY((discard = findItem(window.contentItem(), "shotDiscard", findItem)));
        press(discard);
        QTRY_VERIFY(!findItem(item, "shotEditor", findItem));
        QCOMPARE(writes, 0); QCOMPARE(action(workspace), QString("A door opens"));
        item->setProperty("selectedShotId", "one");
        QTRY_VERIFY((editor = findItem(item, "shotEditor", findItem)));
        press(findItem(editor, "shotEditorNext", findItem));
        QTRY_COMPARE(findItem(editor, "shotEditTitle", findItem)->property("text").toString(), QString("Scene 1, Shot 2"));
        QVERIFY(QMetaObject::invokeMethod(editor, "nudge", Q_ARG(QVariant, -1)));
        QTRY_VERIFY(!controller.busy()); QCOMPARE(writes, 1);
        QTRY_COMPARE(findItem(editor, "shotEditTitle", findItem)->property("text").toString(), QString("Scene 1, Shot 1"));
        item->setParentItem(nullptr);
    }
    void storyboardBoardEditsShotsAndSavesEachAct() {
        qmlRegisterSingletonType(QUrl::fromLocalFile(QStringLiteral(NT_STORY_SOURCE "/qml/TimelineMetrics.qml")), "NodeTool.StoryWorkspaceTest", 1, 0, "TimelineMetrics");
        qmlRegisterType<ScriptVoicing>("NodeTool.StoryWorkspaceTest", 1, 0, "ScriptVoicing");
        qmlRegisterType<CandidatePreview>("NodeTool.StoryWorkspaceTest", 1, 0, "CandidatePreview");
        qmlRegisterType<ShotWorkflow>("NodeTool.StoryWorkspaceTest", 1, 0, "ShotWorkflow");
        TimelineModel model; model.setTimeline(timeline());
        AssistController controller; controller.setModel(&model); controller.setProperty("documentOnly", true);
        StoryWorkspace workspace; workspace.setController(&controller);
        QJsonObject stored{{"id", "board"}, {"name", "Night run"}, {"projectId", "project"}, {"updatedAt", "rev1"}, {"document", QJsonObject{{"style", "noir"}, {"entityIds", QJsonArray{}},
            {"screenplay", QJsonObject{{"scenes", QJsonArray{QJsonObject{{"id", "s1"}, {"slugline", "EXT. STREET - NIGHT"}}, QJsonObject{{"id", "s2"}, {"slugline", "INT. CAR"}}}}}},
            {"shots", QJsonArray{QJsonObject{{"id", "one"}, {"index", 0}, {"scene_id", "s1"}, {"action", "A door opens"}, {"status", "planned"}},
                QJsonObject{{"id", "two"}, {"index", 1}, {"scene_id", "s1"}, {"action", "A hand on the rail"}, {"status", "failed"}},
                QJsonObject{{"id", "three"}, {"index", 2}, {"scene_id", "s2"}, {"action", "Rain on glass"}, {"status", "planned"}}}}}}};
        int writes = 0;
        controller.setCall([&](bool write, const QString&, const QJsonObject& input) {
            if (write) { ++writes; stored.insert("document", input.value("document")); if (input.contains("name")) { stored.insert("name", input.value("name")); } stored.insert("updatedAt", "rev" + QString::number(writes + 1)); }
            return nt::server::QueryResult{stored, {}};
        });
        QVERIFY(controller.openStoryboard("board")); QTRY_VERIFY(!controller.busy());
        QQmlEngine engine;
        QFile source(QStringLiteral(NT_STORY_SOURCE "/qml/storyworkspace/StoryWorkspaceEditor.qml")); QVERIFY(source.open(QIODevice::ReadOnly));
        auto qml = source.readAll(); qml.replace("import NodeTool.Timeline", "import NodeTool.StoryWorkspaceTest");
        QQmlComponent component(&engine); component.setData(qml, QUrl::fromLocalFile(source.fileName()));
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> object(component.createWithInitialProperties({{"controller", QVariant::fromValue(&controller)}, {"workspace", QVariant::fromValue(&workspace)}}));
        auto* item = qobject_cast<QQuickItem*>(object.get()); QVERIFY(item);
        QQuickWindow window; window.resize(1280, 900); item->setParentItem(window.contentItem()); item->setSize(window.size()); window.show();
        QTRY_VERIFY(window.isVisible());
        const auto findItem = [](QQuickItem* root, const QString& name, auto&& recurse) -> QQuickItem* {
            if (root->objectName() == name && root->isVisible()) { return root; }
            for (auto* child : root->childItems()) { if (auto* found = recurse(child, name, recurse)) { return found; } }
            return nullptr;
        };
        const auto press = [&window](QQuickItem* button) { QVERIFY(button); button->forceActiveFocus(); QTest::keyClick(&window, Qt::Key_Space); };
        const auto ids = [&stored] { QStringList list; for (const auto& shot : stored.value("document").toObject().value("shots").toArray()) { list.append(shot.toObject().value("id").toString()); } return list; };
        QQuickItem* boardItem = nullptr; QTRY_VERIFY((boardItem = findItem(item, "storyboardBoard", findItem)));
        QCOMPARE(findItem(boardItem, "storyboardTitle", findItem)->property("text").toString(), QString("Night run"));
        QVERIFY(findItem(boardItem, "storyboardScene_1", findItem)); QVERIFY(findItem(boardItem, "storyboardScene_2", findItem));
        QVERIFY(findItem(boardItem, "shotRenderError_two", findItem));
        QTest::qWait(50);
        QVERIFY(window.grabWindow().save(QDir::tempPath() + "/storyboard-board.png"));
        press(findItem(boardItem, "storyboardAddShot", findItem));
        QTRY_COMPARE(writes, 1); QTRY_VERIFY(!controller.busy()); QCOMPARE(ids().size(), 4); QCOMPARE(ids().last().size(), 32);
        QVERIFY(QMetaObject::invokeMethod(boardItem, "duplicate", Q_ARG(QVariant, "one")));
        QTRY_COMPARE(writes, 2); QTRY_VERIFY(!controller.busy()); QCOMPARE(ids().at(0), QString("one")); QCOMPARE(ids().size(), 5);
        QVERIFY(QMetaObject::invokeMethod(boardItem, "confirmDelete", Q_ARG(QVariant, "two")));
        QQuickItem* confirm = nullptr; QTRY_VERIFY((confirm = findItem(window.contentItem(), "shotDeleteConfirm", findItem)));
        press(confirm);
        QTRY_COMPARE(writes, 3); QTRY_VERIFY(!controller.busy()); QVERIFY(!ids().contains("two"));
        // Dropping "three" on "one" moves it into the first scene at that place.
        boardItem->setProperty("dragShotId", "three"); boardItem->setProperty("dropTargetId", "one");
        QVERIFY(QMetaObject::invokeMethod(boardItem, "dropDragged"));
        QTRY_COMPARE(writes, 4); QTRY_VERIFY(!controller.busy()); QCOMPARE(ids().first(), QString("three"));
        boardItem->setProperty("query", "rain");
        QCOMPARE(boardItem->property("visibleCount").toInt(), 1);
        boardItem->setProperty("query", "");
        item->setParentItem(nullptr);
    }
    void lineDraftsDoNotMakeAnotherResourceKindWithSameIdDirty() {
        const QString sharedId = "123456789abc123456789abc12345678";
        TimelineModel model; model.setTimeline(timeline());
        AssistController controller; controller.setModel(&model); controller.setProperty("documentOnly", true);
        const QJsonObject script{{"id", sharedId}, {"document", QJsonObject{{"sections", QJsonArray{QJsonObject{
            {"id", "section"}, {"lines", QJsonArray{QJsonObject{{"id", "line"}, {"text", "Original"}}}}}}}}}};
        const QJsonObject entity{{"id", sharedId}, {"metadata", QJsonObject{{"nodetool_entity", QJsonObject{{"kind", "character"}, {"name", "Alice"}}}}}};
        controller.setCall([&](bool, const QString& procedure, const QJsonObject&) {
            return nt::server::QueryResult{procedure == "scripts.get" ? script : procedure == "assets.get" ? entity : board(sharedId), {}};
        });
        QVERIFY(controller.openScript(sharedId)); QTRY_VERIFY(!controller.busy());
        controller.setScriptLineDraft(sharedId, "line", "Retain this script draft"); QVERIFY(controller.scriptDirty());
        QVERIFY(controller.openStoryboard(sharedId)); QTRY_VERIFY(!controller.busy()); QVERIFY(!controller.scriptDirty());
        QVERIFY(controller.openEntity(sharedId)); QTRY_VERIFY(!controller.busy()); QVERIFY(!controller.scriptDirty());
        QVERIFY(controller.openScript(sharedId)); QTRY_VERIFY(!controller.busy()); QVERIFY(controller.scriptDirty());
        QVERIFY(controller.hasScriptLineDraft(sharedId, "line"));
        bool retained = false;
        for (const auto& value : controller.scriptRows()) {
            const auto row = value.toMap();
            if (row.value("id").toString() == "line") { retained = row.value("text").toString() == "Retain this script draft"; }
        }
        QVERIFY(retained); QCOMPARE(model.undoStack()->count(), 0);
    }
    void lateBoardRefreshCannotReplaceAnotherResourceKindWithSameId() {
        const QString sharedId = "123456789abc123456789abc12345678";
        TimelineModel model; model.setTimeline(timeline());
        AssistController controller; controller.setModel(&model); controller.setProperty("documentOnly", true);
        const QJsonObject entity{{"id", sharedId}, {"metadata", QJsonObject{{"nodetool_entity", QJsonObject{{"kind", "character"}, {"name", "Alice"}}}}}};
        const QJsonObject script{{"id", sharedId}, {"document", QJsonObject{{"sections", QJsonArray{}}}}};
        controller.setCall([&](bool, const QString& procedure, const QJsonObject&) { return nt::server::QueryResult{procedure == "assets.get" ? entity : procedure == "scripts.get" ? script : board(sharedId), {}}; });
        QVERIFY(controller.openEntity(sharedId)); QTRY_VERIFY(!controller.busy());
        const auto entityBefore = controller.result(); controller.updateResource(board(sharedId, "rendered")); QCOMPARE(controller.result(), entityBefore);
        QVERIFY(controller.openScript(sharedId)); QTRY_VERIFY(!controller.busy());
        const auto scriptBefore = controller.result(); controller.updateResource(board(sharedId, "rendered")); QCOMPARE(controller.result(), scriptBefore);
        QVERIFY(controller.openStoryboard(sharedId)); QTRY_VERIFY(!controller.busy());
        controller.updateResource(board(sharedId, "rendered")); QCOMPARE(controller.result().toMap().value("updatedAt").toString(), QString("rendered"));
        QCOMPARE(model.undoStack()->count(), 0);
    }
    void orphanLineDraftRequiresExplicitLocalDiscard() {
        TimelineModel model; model.setTimeline(timeline());
        AssistController controller; controller.setModel(&model); controller.setProperty("documentOnly", true);
        const QString scriptId = "123456789abc123456789abc12345678", lineId = "abcdef0123456789abcdef0123456789";
        auto document = QJsonObject{{"sections", QJsonArray{QJsonObject{{"id", "section"}, {"lines", QJsonArray{QJsonObject{{"id", lineId}, {"text", "Original"}}}}}}}};
        QJsonObject stored{{"id", scriptId}, {"timelineId", "timeline"}, {"updatedAt", "base"}, {"document", document}};
        int writes = 0;
        controller.setCall([&](bool write, const QString&, const QJsonObject&) { if (write) { ++writes; } return nt::server::QueryResult{stored, {}}; });
        QVERIFY(controller.openScript(scriptId)); QTRY_VERIFY(!controller.busy());
        controller.setScriptLineDraft(scriptId, lineId, "Keep this text"); QVERIFY(controller.scriptDirty());
        stored.insert("document", QJsonObject{{"sections", QJsonArray{}}}); stored.insert("updatedAt", "remote");
        QVERIFY(controller.openScript(scriptId)); QTRY_VERIFY(!controller.busy());
        bool orphan = false;
        for (const auto& row : controller.scriptRows()) { if (row.toMap().value("draftOrphan").toBool()) { orphan = true; QCOMPARE(row.toMap().value("text").toString(), QString("Keep this text")); } }
        QVERIFY(orphan); QVERIFY(controller.scriptDirty());
        const auto before = model.timeline().raw;
        QVERIFY(!controller.discardScriptDrafts("missing")); QVERIFY(controller.scriptDirty());
        QVERIFY(controller.discardScriptDrafts(scriptId.left(12)));
        QVERIFY(!controller.scriptDirty()); QVERIFY(controller.scriptRows().isEmpty());
        QCOMPARE(writes, 0); QCOMPARE(model.timeline().raw, before); QCOMPARE(model.undoStack()->count(), 0);
    }
    void alreadyRemovedPendingDeletionCanBeDiscardedWithoutRows() {
        TimelineModel model; model.setTimeline(timeline());
        AssistController controller; controller.setModel(&model); controller.setProperty("documentOnly", true);
        const QString scriptId = "123456789abc123456789abc12345678", lineId = "abcdef0123456789abcdef0123456789";
        QJsonObject stored{{"id", scriptId}, {"updatedAt", "base"}, {"document", QJsonObject{{"sections", QJsonArray{QJsonObject{{"id", "section"}, {"lines", QJsonArray{QJsonObject{{"id", lineId}, {"text", ""}}}}}}}}}};
        int writes = 0;
        controller.setCall([&](bool write, const QString&, const QJsonObject&) {
            if (write) { ++writes; nt::server::QueryResult failure; failure.error.message = "Offline"; return failure; }
            return nt::server::QueryResult{stored, {}};
        });
        QVERIFY(controller.openScript(scriptId)); QTRY_VERIFY(!controller.busy());
        QVERIFY(controller.removeEmptyScriptLineForScript(scriptId, lineId, "")); QTRY_VERIFY(!controller.busy());
        QVERIFY(controller.scriptDirty()); QCOMPARE(writes, 1);
        stored.insert("document", QJsonObject{{"sections", QJsonArray{}}});
        QVERIFY(controller.openScript(scriptId)); QTRY_VERIFY(!controller.busy());
        QVERIFY(controller.scriptRows().isEmpty()); QVERIFY(controller.scriptDirty());
        QVERIFY(controller.discardScriptDrafts(scriptId)); QVERIFY(!controller.scriptDirty()); QCOMPARE(writes, 1);
        QCOMPARE(model.undoStack()->count(), 0);
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
        const QString entityId = "fedcba9876543210fedcba9876543210";
        QJsonObject stored{{"id", entityId}, {"metadata", metadata}}; QJsonObject submitted; QString procedure, requestedId;
        controller.setCall([&](bool write, const QString& name, const QJsonObject& input) {
            if (name == "assets.get") { requestedId = input.value("id").toString(); }
            if (write) { procedure = name; submitted = input; stored.insert("metadata", input.value("metadata")); }
            return nt::server::QueryResult{stored, {}};
        });
        QVERIFY(controller.openEntity(entityId.left(12))); QTRY_VERIFY(!controller.busy());
        QCOMPARE(requestedId, entityId.left(12)); QCOMPARE(workspace.resource().value("id").toString(), entityId);
        QVERIFY(workspace.patchEntity("descriptor", "A red coat")); QVERIFY(workspace.save()); QTRY_VERIFY(!controller.busy());
        QVERIFY(!workspace.dirty()); QCOMPARE(procedure, QString("assets.update")); QCOMPARE(submitted.value("id").toString(), entityId); QCOMPARE(submitted.value("expected_metadata").toObject(), metadata);
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
