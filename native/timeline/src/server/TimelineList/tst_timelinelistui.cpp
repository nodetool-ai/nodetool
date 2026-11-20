#include "../../../tests/TestAssetCacheRoot.h"
#include "TestHttpServer.h"
#include "server/ServerTimelineProbe.h"
#include "server/AutosaveController.h"
#include "server/ServerClient.h"
#include "app/CliModes.h"
#include "app/PanelRegistry.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include "server/ServerSource.h"
#include "server/TimelineList/TimelineListController.h"
#include "server/TimelineList/TimelineDocumentController.h"
#include "server/TimelineList/TimelineSession.h"
#include "server/projectfolder/ProjectFolderState.h"
#include <QMutex>
#include <QMutexLocker>
#include <QUrlQuery>
#include <QGuiApplication>
#include <QCommandLineParser>
#include <QQuickView>
#include <QScopeGuard>
#include <QTimer>
#include <QUndoStack>
#include <QTemporaryDir>
#include <QImage>
#include <QFontInfo>
#include <QJsonDocument>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQmlExpression>
#include <QQuickItem>
#include <QQuickWindow>
#include <QtTest>
#include <memory>
#include <functional>

class TestTimelineListUi : public QObject {
    Q_OBJECT
    TestAssetCacheRoot m_testCache;
    std::unique_ptr<QObject> make(QQmlEngine& engine, const QString& name, const QVariantMap& props) {
        QQmlComponent component(&engine, QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/" + name + ".qml"));
        if (!component.isReady()) {
            qWarning().noquote() << component.errorString();
            return {};
        }
        return std::unique_ptr<QObject>(component.createWithInitialProperties(props));
    }
    QQuickItem* item(QObject* root, const char* name) {
        const auto target = QString::fromLatin1(name);
        const std::function<QQuickItem*(QQuickItem*)> find = [&](QQuickItem* parent) -> QQuickItem* {
            if (!parent) {
                return nullptr;
            }
            if (parent->objectName() == target) {
                return parent;
            }
            for (auto* child : parent->childItems()) {
                if (auto* found = find(child)) {
                    return found;
                }
            }
            return nullptr;
        };
        return find(qobject_cast<QQuickItem*>(root));
    }
    bool hasText(QQuickItem* root, const QString& text) {
        if (root->property("text").toString() == text) {
            return true;
        }
        for (auto* child : root->childItems()) {
            if (hasText(child, text)) {
                return true;
            }
        }
        return false;
    }
    void load(TimelineModel& model) {
        auto parsed = nt::parseTimelineJson(R"({"id":"test","name":"Before","width":640,"height":360,"fps":30,"tracks":[],"clips":[],"markers":[],"custom":{"keep":true}})");
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
    }
    void show(QQuickWindow& window, QObject* object, int width, int height) {
        auto* root = qobject_cast<QQuickItem*>(object);
        QVERIFY(root);
        root->setSize(QSizeF(width, height));
        root->setParentItem(window.contentItem());
        window.resize(width, height);
        window.setColor(QColor("#08090A"));
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
    }
    void still(QQuickWindow& window, const QString& filename) {
        window.requestUpdate();
        QTest::qWait(100);
        // Software rendering's grabWindow works on the offscreen platform without a GPU.
        const QImage image = window.grabWindow();
        QVERIFY(!image.isNull());
        QVERIFY2(image.save(filename), qPrintable(filename));
        int different = 0;
        const auto background = image.pixelColor(0, 0);
        for (int y = 0; y < image.height(); ++y) {
            for (int x = 0; x < image.width(); ++x) {
                different += image.pixelColor(x, y) != background;
            }
        }
        QVERIFY(different > 50);
    }
private slots:
    void startupListWithoutServer() {
        const auto saved = qgetenv("NODETOOL_SERVER_URL");
        const auto hadServer = qEnvironmentVariableIsSet("NODETOOL_SERVER_URL");
        const auto restore = qScopeGuard([saved, hadServer] {
            if (hadServer) {
                qputenv("NODETOOL_SERVER_URL", saved);
            } else {
                qunsetenv("NODETOOL_SERVER_URL");
            }
        });
        qputenv("NODETOOL_SERVER_URL", "invalid");
        bool sawList = false;
        bool sawError = false;
        QTimer close;
        close.setSingleShot(true);
        QObject::connect(&close, &QTimer::timeout, &close, [&sawList, &sawError] {
            for (auto* window : QGuiApplication::allWindows()) {
                auto* view = qobject_cast<QQuickView*>(window);
                if (view && view->isVisible() && view->rootObject()) {
                    sawList = view->rootObject()->objectName() == "TimelineListPanel";
                    const auto* controller = view->rootObject()->property("controller").value<QObject*>();
                    sawError = controller && controller->property("error").toString().contains("NODETOOL_SERVER_URL");
                    view->close();
                }
            }
        });
        close.start(200);
        QCommandLineParser parser;
        QVERIFY(parser.parse({"timeline"}));
        const auto result = nt::app::dispatchDefaultStartup(*QCoreApplication::instance(), parser);
        QVERIFY(result);
        QCOMPARE(std::get<int>(*result), 0);
        QVERIFY(sawList);
        QVERIFY(sawError);
    }
    void projectSettingsPersistence_data() {
        QTest::addColumn<bool>("saveRequest");
        QTest::newRow("dirty") << false;
        QTest::newRow("save-request") << true;
    }

    void projectSettingsPersistence() {
        QFETCH(bool, saveRequest);
        TestHttpServer server;
        QVERIFY(server.base().port() > 0);
        QVERIFY(server.base().port() != 7777);
        server.setJson([](const QByteArray&, const QUrl&) {
            return QByteArray(R"({"result":{"data":{"id":"settings-test","name":"Before","width":640,"height":360,"fps":30,"tracks":[],"clips":[]}}})");
        });
        server.setPost([](const QByteArray&, const QByteArray&) {
            return QByteArray(R"({"result":{"data":{"updatedAt":"u1"}}})");
        });
        QTemporaryDir cache;
        QVERIFY(cache.isValid());
        const nt::server::AssetCacheRoot root(cache.path());
        const auto loaded = nt::server::openProbedServerTimeline({server.base(), "settings-test", root, {}, true, {}, {}});
        QVERIFY2(loaded.timeline, qPrintable(loaded.error));
        TimelineModel model;
        model.setTimeline(*loaded.timeline);
        nt::server::AutosaveController save(root, {server.base(), {}, "settings-test", cache.path(), {}},
            model.undoStack(), [&model] { return model.timeline().raw; }, "u0");
        save.setExternalSync(false);
        save.setAutosave(false);
        save.setQuitFallbackDirs({});
        QVERIFY(!save.dirty());
        QVERIFY(model.applyEdit("setProjectSettings", {{"width", 1280}, {"height", 720}, {"fps", 24}}));
        QCOMPARE(model.undoStack()->count(), 1);
        QCOMPARE(model.canvasWidth(), 1280);
        QCOMPARE(model.canvasHeight(), 720);
        QCOMPARE(model.fps(), 24.0);
        if (!saveRequest) {
            QVERIFY(save.dirty());
        } else {
            const auto result = save.saveNow();
            QVERIFY2(result.ok, qPrintable(result.error));
            QCOMPARE(server.countRequests("POST", "/trpc/timeline.update"), 1);
            const auto requests = server.requests();
            const auto input = QJsonDocument::fromJson(requests.back().body).object();
            QVERIFY(input.value("width") == 1280 && input.value("height") == 720 && input.value("fps") == 24);
        }
    }

    void documentFilePushRefreshesShownList() {
        TestHttpServer server;
        server.setJson([](const QByteArray& path, const QUrl&) {
            if (path == "/trpc/projects.list") {
                return QByteArray(R"({"result":{"data":[{"id":"personal:1","name":"Personal","isPersonal":true}]}})");
            }
            return QByteArray(R"({"result":{"data":[]}})");
        });
        qputenv("NODETOOL_SERVER_URL", server.base().toString().toUtf8());
        const auto restore = qScopeGuard([] { qunsetenv("NODETOOL_SERVER_URL"); });
        QTemporaryDir cache;
        QUndoStack undo;
        const QJsonObject raw{{"id", "seq"}};
        nt::server::AutosaveController save(nt::server::AssetCacheRoot(cache.path()), {server.base(), {}, "seq", cache.path(), {}}, &undo, [&] { return raw; }, "u0");
        save.setExternalSync(false);
        save.setAutosave(false);
        nt::server::TimelineDocumentController actions;
        actions.watch(&save);
        auto* list = qobject_cast<nt::server::TimelineListController*>(actions.controller());
        QVERIFY(list);
        const auto lists = [&] { return server.countRequests("GET", "/trpc/projects.list"); };
        const QJsonObject file{{"id", "seq"}, {"type", "timeline"}, {"file_error", "bad"}};
        // Not loaded and not shown: the next open refreshes it.
        emit save.documentFileChanged(file);
        QCOMPARE(lists(), 0);
        list->refresh();
        QCOMPARE(lists(), 1);
        emit save.documentFileChanged(file);
        QCOMPARE(lists(), 1);
        actions.setListShown(true);
        emit save.documentFileChanged(file);
        QCOMPARE(lists(), 2);
        actions.watch(nullptr);
        emit save.documentFileChanged(file);
        QCOMPARE(lists(), 2);
    }
    void projectSelectionFollowsOpenTimelineAndDocumentBar() {
        QTemporaryDir folderDir;
        QVERIFY(folderDir.isValid());
        TestHttpServer server;
        QJsonObject createInput;
        server.setJson([&](const QByteArray& path, const QUrl& url) {
            if (path == "/trpc/projects.list") {
                const QJsonArray projects{
                    QJsonObject{{"id", "personal:1"}, {"name", "Personal"}, {"isPersonal", true},
                                {"folder", QJsonObject{{"workspace_id", "ws-personal"}, {"path", folderDir.path()}, {"is_accessible", true}}}},
                    QJsonObject{{"id", "p2"}, {"name", "Film"}, {"isPersonal", false},
                                {"folder", QJsonObject{{"workspace_id", "ws-p2"}, {"path", folderDir.path()}, {"is_accessible", true}}}},
                };
                return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", projects}}}}).toJson(QJsonDocument::Compact);
            }
            if (path == "/trpc/projects.documents") {
                return QByteArray(R"({"result":{"data":[]}})");
            }
            if (path == "/trpc/timeline.list") {
                const auto input = QJsonDocument::fromJson(QUrlQuery(url).queryItemValue("input", QUrl::FullyDecoded).toUtf8()).object();
                const auto pid = input.value("projectId").toString();
                const QJsonArray rows = pid == "p2"
                    ? QJsonArray{
                        QJsonObject{{"id", "t-p2"}, {"name", "Opening"}, {"updatedAt", "2026-10-26T12:00:00Z"}},
                        QJsonObject{{"id", "t-broken"}, {"name", "Legacy"}, {"updatedAt", "2026-10-26T11:00:00Z"}},
                    }
                    : QJsonArray{QJsonObject{{"id", "t-personal"}, {"name", "Scratch"}, {"updatedAt", "2026-10-26T12:00:00Z"}}};
                return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", rows}}}}).toJson(QJsonDocument::Compact);
            }
            if (path == "/trpc/timeline.get") {
                const auto input = QJsonDocument::fromJson(QUrlQuery(url).queryItemValue("input", QUrl::FullyDecoded).toUtf8()).object();
                const auto id = input.value("id").toString();
                if (id == "t-broken") {
                    return QByteArray(R"({"error":{"message":"Output validation failed","data":{"code":"INTERNAL_SERVER_ERROR","httpStatus":500}}})");
                }
                return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", QJsonObject{
                    {"id", id}, {"name", "Valid"}, {"fps", 30}, {"width", 1920}, {"height", 1080},
                    {"tracks", QJsonArray{}}, {"clips", QJsonArray{}}}}}}}).toJson(QJsonDocument::Compact);
            }
            return QByteArray(R"({"result":{"data":[]}})");
        });
        server.setPost([&](const QByteArray& path, const QByteArray& body) {
            if (path == "/trpc/timeline.create") {
                createInput = QJsonDocument::fromJson(body).object();
                auto created = createInput;
                created.insert("updatedAt", "2026-10-26T12:00:00Z");
                return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", created}}}}).toJson(QJsonDocument::Compact);
            }
            return QByteArray(R"({"result":{"data":{}}})");
        });
        qputenv("NODETOOL_SERVER_URL", server.base().toString().toUtf8());
        const auto restore = qScopeGuard([] { qunsetenv("NODETOOL_SERVER_URL"); });

        TimelineModel model;
        auto parsed = nt::parseTimelineJson(R"({"id":"t-p2","projectId":"p2","name":"Opening","width":640,"height":360,"fps":30,"tracks":[],"clips":[],"markers":[]})");
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        PlaybackClock clock;
        QQmlEngine engine;
        m_testCache.install(engine);
        auto editor = make(engine, "TimelineEditor", {{"timeline", QVariant::fromValue(&model)},
            {"clock", QVariant::fromValue(&clock)}});
        QVERIFY2(editor, "TimelineEditor must load");
        QQuickWindow window;
        show(window, editor.get(), 1280, 800);

        auto* projectFolder = editor->property("projectFolder").value<ProjectFolderState*>();
        QVERIFY(projectFolder);
        projectFolder->setTarget({server.base(), {}, "t-p2", {}, {}});
        projectFolder->refresh();
        QTRY_VERIFY(projectFolder->loaded());
        QCOMPARE(projectFolder->projectId(), QString("p2"));

        auto* bar = item(editor.get(), "documentBar");
        QVERIFY(bar);
        auto* projectButton = item(bar, "documentProjectButton");
        QVERIFY(projectButton);
        QTRY_VERIFY(projectButton->isVisible());
        QCOMPARE(projectButton->property("text").toString(), QString("Film"));
        QCOMPARE(projectButton->property("trailingIconName").toString(), QString("arrowDropDown"));

        // Clicking the project button opens the timeline list pre-selected to the open timeline's project.
        QTest::mouseClick(&window, Qt::LeftButton, Qt::NoModifier,
            projectButton->mapToScene(QPointF(projectButton->width() / 2, projectButton->height() / 2)).toPoint());
        QTRY_VERIFY(item(window.contentItem(), "TimelineListPanel"));
        auto* panel = item(window.contentItem(), "TimelineListPanel");
        QCOMPARE(panel->property("activeTimelineId").toString(), QString("t-p2"));
        auto* listCtrl = qobject_cast<nt::server::TimelineListController*>(panel->property("controller").value<QObject*>());
        QVERIFY(listCtrl);
        QCOMPARE(listCtrl->projectId(), QString("p2"));
        QTRY_VERIFY(item(panel, "TimelineListItem_t-p2"));
        QVERIFY(item(panel, "TimelineListItem_t-p2")->property("active").toBool());

        // Clicking an unreadable timeline keeps the editor and popover open and shows the error.
        auto* brokenRow = item(panel, "TimelineListItem_t-broken");
        QVERIFY(brokenRow);
        {
            QList<QQuickItem*> ancestors;
            for (auto* ancestor = brokenRow; ancestor; ancestor = ancestor->parentItem()) { ancestors.prepend(ancestor); }
            for (auto* ancestor : ancestors) { ancestor->ensurePolished(); }
        }
        QTest::mouseClick(&window, Qt::LeftButton, Qt::NoModifier,
            brokenRow->mapToScene(QPointF(brokenRow->width() / 2, brokenRow->height() / 2)).toPoint());
        auto* errorText = item(panel, "timelineListError");
        QVERIFY(errorText);
        QTRY_VERIFY2(errorText->isVisible(), qPrintable(QStringLiteral("listError='%1' brokenPos=(%2,%3) size=(%4,%5)")
            .arg(listCtrl->error())
            .arg(brokenRow->mapToScene({0, 0}).x()).arg(brokenRow->mapToScene({0, 0}).y())
            .arg(brokenRow->width()).arg(brokenRow->height())));
        QVERIFY(errorText->property("text").toString().contains("Output validation failed"));
        QVERIFY(item(window.contentItem(), "TimelineListPanel"));

        // Switching the project dropdown is browse-only: projectFolder stays on p2,
        // and reopening the popover resets the dropdown back to p2.
        listCtrl->setProjectId("personal:1");
        QCOMPARE(listCtrl->projectId(), QString("personal:1"));
        QCOMPARE(projectFolder->projectId(), QString("p2"));
        QTRY_VERIFY(item(panel, "TimelineListItem_t-personal"));

        QTest::keyClick(&window, Qt::Key_Escape);
        QTRY_VERIFY(!item(window.contentItem(), "TimelineListPanel"));
        QTest::mouseClick(&window, Qt::LeftButton, Qt::NoModifier,
            projectButton->mapToScene(QPointF(projectButton->width() / 2, projectButton->height() / 2)).toPoint());
        QTRY_VERIFY(item(window.contentItem(), "TimelineListPanel"));
        QCOMPARE(listCtrl->projectId(), QString("p2"));

        // New Timeline (createAndOpen) always creates in the open timeline's project.
        nt::server::TimelineDocumentController docActions;
        docActions.setTimeline(&model);
        docActions.prepareList();
        auto* docList = qobject_cast<nt::server::TimelineListController*>(docActions.controller());
        QVERIFY(docList);
        QCOMPARE(docList->projectId(), QString("p2"));
        docList->setProjectId("personal:1");
        QCOMPARE(docList->projectId(), QString("personal:1"));
        docActions.createAndOpen();
        QCOMPARE(createInput.value("projectId").toString(), QString("p2"));
    }
    void settingsPanelRegistered() {
        const auto panels = PanelRegistry().forSlot("documentBar");
        int matches = 0;
        for (const auto& entry : panels) {
            const auto panel = entry.toMap();
            if (panel.value("id") == "projectSettings") {
                ++matches;
                QCOMPARE(panel.value("source").toUrl(), QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/ProjectSettingsDialog.qml"));
                QCOMPARE(panel.value("order").toInt(), 20);
                QCOMPARE(panel.value("title").toString(), QString("Project settings"));
            }
        }
        QCOMPARE(matches, 1);
    }
    void settingsOpenFromDocumentBar() {
        TimelineModel model;
        load(model);
        PlaybackClock clock;
        QQmlEngine engine;
        m_testCache.install(engine);
        auto editor = make(engine, "TimelineEditor", {{"timeline", QVariant::fromValue(&model)},
            {"clock", QVariant::fromValue(&clock)}});
        QVERIFY2(editor, "TimelineEditor must load");
        QQuickWindow window;
        show(window, editor.get(), 1280, 800);
        auto* bar = item(editor.get(), "documentBar");
        QVERIFY(bar);
        QTRY_VERIFY2(item(bar, "projectSettingsButton"), "Project settings button must be mounted in the document bar");
        auto* button = item(bar, "projectSettingsButton");
        QVERIFY(button->width() > 0 && button->height() > 0);
        QVERIFY(button->isVisible() && button->isEnabled());
        auto* dialog = item(bar, "ProjectSettingsDialog");
        QVERIFY(dialog);
        QVERIFY(!dialog->property("opened").toBool());
        QTest::mouseClick(&window, Qt::LeftButton, Qt::NoModifier,
            button->mapToScene(QPointF(button->width() / 2, button->height() / 2)).toPoint());
        QTRY_VERIFY(dialog->property("opened").toBool());
        auto* paper = item(window.contentItem(), "dialogPaper");
        QVERIFY(paper && paper->isVisible());
        QCOMPARE(paper->width(), 444.0);
        QVERIFY(paper->height() > bar->height());
        QCOMPARE(dialog->property("timeline").value<TimelineModel*>(), &model);
        QCOMPARE(dialog->property("widthText").toString(), QString("640"));
    }
    void settingsOpenFromKeyboard() {
        TimelineModel model;
        load(model);
        PlaybackClock clock;
        clock.setDurationMs(6000);
        QSignalSpy playingChanged(&clock, &PlaybackClock::playingChanged);
        QVERIFY(playingChanged.isValid());
        QQmlEngine engine;
        m_testCache.install(engine);
        auto editor = make(engine, "TimelineEditor", {{"timeline", QVariant::fromValue(&model)},
            {"clock", QVariant::fromValue(&clock)}});
        QVERIFY2(editor, "TimelineEditor must load");
        QQuickWindow window;
        show(window, editor.get(), 1280, 800);
        auto* bar = item(editor.get(), "documentBar");
        QVERIFY(bar);
        QTRY_VERIFY(item(bar, "projectSettingsButton"));
        auto* button = item(bar, "projectSettingsButton");
        auto* dialog = item(bar, "ProjectSettingsDialog");
        QVERIFY(dialog);
        QVERIFY(!dialog->property("opened").toBool());
        QQmlExpression accessible(QQmlEngine::contextForObject(button), button,
            "Accessible.role === Accessible.Button && Accessible.name === 'Project settings'");
        QVERIFY(accessible.evaluate().toBool());
        QVERIFY(button->activeFocusOnTab());
        qobject_cast<QQuickItem*>(editor.get())->forceActiveFocus();
        for (int attempt = 0; attempt < 64 && !button->hasActiveFocus(); ++attempt) {
            QTest::keyClick(&window, Qt::Key_Tab);
        }
        QVERIFY2(button->hasActiveFocus(), "Tab navigation must reach Project settings");
        for (const auto key : {Qt::Key_Return, Qt::Key_Space, Qt::Key_Enter}) {
            QTest::keyClick(&window, key);
            QTRY_VERIFY(dialog->property("opened").toBool());
            QVERIFY(!clock.playing());
            QCOMPARE(playingChanged.count(), 0);
            QTest::keyClick(&window, Qt::Key_Escape);
            QTRY_VERIFY(!dialog->property("opened").toBool());
            QTRY_VERIFY(button->hasActiveFocus());
        }
    }
    void settingsKeepsEditorShortcuts() {
        TimelineModel model;
        auto parsed = nt::parseTimelineJson(R"({"name":"Fixture","fps":30,"width":640,"height":360,"durationMs":6000,
            "tracks":[{"id":"v","name":"Video","type":"video","index":0}],
            "clips":[{"id":"c","trackId":"v","mediaType":"image","startMs":1000,"durationMs":5000}]})");
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        PlaybackClock clock;
        clock.setDurationMs(6000);
        QQmlEngine engine;
        m_testCache.install(engine);
        auto editor = make(engine, "TimelineEditor", {{"timeline", QVariant::fromValue(&model)},
            {"clock", QVariant::fromValue(&clock)}});
        QVERIFY(editor);
        QQuickWindow window;
        show(window, editor.get(), 1800, 900);
        auto* ruler = item(editor.get(), "timeRuler");
        QVERIFY(ruler);
        const auto click = [&](QQuickItem* target) {
            QTest::mouseClick(&window, Qt::LeftButton, Qt::NoModifier,
                target->mapToScene({target->width() / 2, target->height() / 2}).toPoint());
        };
        click(ruler);
        clock.seek(1500);
        QTest::keyClick(&window, Qt::Key_L, Qt::ControlModifier | Qt::ShiftModifier);
        QVERIFY(clock.loop());
        QTest::keyClick(&window, Qt::Key_Right);
        QVERIFY(qAbs(clock.time() - 46 * 1000.0 / 30) < 1e-9);
        auto* bar = item(editor.get(), "documentBar");
        QVERIFY(bar);
        QTRY_VERIFY(item(bar, "projectSettingsButton"));
        click(item(bar, "projectSettingsButton"));
        QTRY_VERIFY(item(window.contentItem(), "cancelSettings"));
        click(item(window.contentItem(), "cancelSettings"));
        click(ruler);
        QTest::keyClick(&window, Qt::Key_L, Qt::ControlModifier | Qt::ShiftModifier);
        QVERIFY(!clock.loop());
    }
    void panelKeepsCppOwnership() {
        TimelineModel model;
        load(model);
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.Timeline
Item {
    required property TimelineModel timeline
    ProjectSettingsDialog { anchors.fill: parent }
})", QUrl());
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> host(component.createWithInitialProperties({{"timeline", QVariant::fromValue(&model)}}));
        QVERIFY2(host, qPrintable(component.errorString()));
        const auto ownership = QQmlEngine::objectOwnership(&model);
        // Restore ownership before reporting red, so the test itself cannot free a stack model.
        QQmlEngine::setObjectOwnership(&model, QQmlEngine::CppOwnership);
        QCOMPARE(ownership, QQmlEngine::CppOwnership);
    }
    void settingsCommitAndUndo() {
        TimelineModel model;
        load(model);
        const auto before = model.documentJson();
        QQmlEngine engine;
        auto dialog = make(engine, "ProjectSettingsDialog", {{"timeline", QVariant::fromValue(&model)}});
        QVERIFY2(dialog, "ProjectSettingsDialog must exist");
        QQuickWindow window;
        show(window, dialog.get(), 800, 800);
        QVERIFY(QMetaObject::invokeMethod(dialog.get(), "open"));
        QVERIFY(dialog->setProperty("widthText", "1280"));
        QVERIFY(dialog->setProperty("heightText", "720"));
        QVERIFY(dialog->setProperty("fpsText", "24"));
        auto* apply = item(window.contentItem(), "applySettings");
        QVERIFY(apply);
        QVERIFY(apply->isEnabled());
        const auto center = apply->mapToScene(QPointF(apply->width()/2, apply->height()/2)).toPoint();
        QTest::mouseClick(&window, Qt::LeftButton, Qt::NoModifier, center);
        QCOMPARE(model.canvasWidth(), 1280);
        QCOMPARE(model.canvasHeight(), 720);
        QCOMPARE(model.fps(), 24.0);
        QCOMPARE(model.undoStack()->count(), 1);
        model.undoStack()->undo();
        QCOMPARE(model.canvasWidth(), 640);
        QCOMPARE(model.canvasHeight(), 360);
        QCOMPARE(model.fps(), 30.0);
        QCOMPARE(model.documentJson(), before);
        model.undoStack()->redo();
        QCOMPARE(model.canvasWidth(), 1280);
        QVERIFY(!model.applyEdit("setProjectSettings", {{"width", 15}, {"height", 720}, {"fps", 24}}));
        QVERIFY(!model.applyEdit("setProjectSettings", {{"width", 1280}, {"height", 720}, {"fps", 24.5}}));
        QCOMPARE(model.undoStack()->count(), 1);
        QVERIFY(QMetaObject::invokeMethod(dialog.get(), "open"));
        QVERIFY(dialog->setProperty("widthText", ""));
        QVERIFY(!apply->isEnabled());
        QVERIFY(QMetaObject::invokeMethod(dialog.get(), "commit"));
        QCOMPARE(model.canvasWidth(), 1280);
        QCOMPARE(model.undoStack()->count(), 1);
    }
    void unnamedRowLabel() {
        QQmlEngine engine;
        const QVariantList rows{QVariantMap{{"id", "unnamed"}, {"name", ""}, {"group", "Today"}}};
        auto panel = make(engine, "TimelineListPanel", {{"previewDocuments", rows}, {"autoRefresh", false}});
        QVERIFY(panel);
        QQuickWindow window;
        show(window, panel.get(), 320, 480);
        auto* row = item(panel.get(), "TimelineListItem_unnamed");
        QVERIFY(row);
        QVERIFY(hasText(row, "Untitled video"));
        QQmlExpression accessible(QQmlEngine::contextForObject(row), row, "Accessible.name");
        QCOMPARE(accessible.evaluate().toString(), QString("Untitled video"));
    }
    void emptySearchDescription() {
        QQmlEngine engine;
        auto panel = make(engine, "TimelineListPanel", {{"previewDocuments", QVariantList{}}, {"autoRefresh", false}});
        QVERIFY(panel);
        auto* search = item(panel.get(), "searchInput");
        QVERIFY(search);
        search->setProperty("text", "NO MATCH");
        QVERIFY(hasText(qobject_cast<QQuickItem*>(panel.get()), "Try a different search term."));
    }
    void offsetError() {
        TimelineModel model;
        load(model);
        QQmlEngine engine;
        auto dialog = make(engine, "ProjectSettingsDialog", {{"timeline", QVariant::fromValue(&model)}});
        QVERIFY(dialog);
        QQuickWindow window;
        show(window, dialog.get(), 800, 800);
        QVERIFY(QMetaObject::invokeMethod(dialog.get(), "open"));
        auto* offset = item(window.contentItem(), "offsetField");
        QVERIFY(offset);
        QVERIFY(offset->setProperty("text", "-1"));
        QVERIFY(hasText(offset, "0 or more"));
    }
    void layoutAndStills() {
        QQmlEngine engine;
        nt::server::TimelineListController controller(QUrl(), "", "");
        const QVariantList rows{
            QVariantMap{{"id", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}, {"name", "Morning edit"}, {"group", "Today"}},
            QVariantMap{{"id", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}, {"name", "Social cut"}, {"group", "Today"}}};
        auto panel = make(engine, "TimelineListPanel", {{"controller", QVariant::fromValue(&controller)},
            {"previewDocuments", rows}, {"autoRefresh", false}});
        QVERIFY2(panel, "TimelineListPanel must exist");
        QQuickWindow listWindow;
        show(listWindow, panel.get(), 320, 480);
        auto* header = item(panel.get(), "panelHeader");
        auto* search = item(panel.get(), "searchInput");
        auto* row = item(panel.get(), "TimelineListItem_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
        QVERIFY(header && search && row);
        QCOMPARE(header->height(), 36.0);
        QCOMPARE(search->height(), 28.0);
        QCOMPARE(search->y(), 8.0);
        QCOMPARE(row->height(), 28.0);
        auto* icon = item(row, "listPanelIcon");
        QVERIFY(icon);
        QCOMPARE(icon->width(), 20.0);
        QCOMPARE(icon->mapToScene(QPointF()).x() - row->mapToScene(QPointF()).x(), row->property("leftPadding").toDouble());
        QCOMPARE(row->property("iconGap").toDouble(), 4.0);
        still(listWindow, "TimelineListPanel.png");
        search->setProperty("text", "NO MATCH");
        QTRY_VERIFY(!item(panel.get(), "TimelineListItem_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
        auto* empty = item(panel.get(), "emptyTitle");
        QVERIFY(empty);
        QCOMPARE(empty->property("text").toString(), QString("No matching timelines"));
        TimelineModel model;
        load(model);
        auto dialog = make(engine, "ProjectSettingsDialog", {{"timeline", QVariant::fromValue(&model)}});
        QVERIFY(dialog);
        QQuickWindow settingsWindow;
        show(settingsWindow, dialog.get(), 800, 800);
        QVERIFY(QMetaObject::invokeMethod(dialog.get(), "open"));
        auto* paper = item(settingsWindow.contentItem(), "dialogPaper");
        QVERIFY(paper);
        QCOMPARE(paper->width(), 444.0);
        auto* content = item(settingsWindow.contentItem(), "dialogContent");
        QVERIFY(content);
        const auto paperLeft = paper->mapToScene(QPointF()).x();
        const auto contentLeft = content->mapToScene(QPointF()).x();
        QVERIFY(contentLeft >= paperLeft);
        QVERIFY(contentLeft + content->width() <= paperLeft + paper->width());
        const QStringList fields{"canvasSizeLabel", "resolutionPreset", "widthField", "heightField",
                                 "frameRateLabel", "frameRatePreset", "fpsField", "tempoLabel",
                                 "bpmField", "beatsField", "beatUnitField", "offsetField"};
        for (const auto& field : fields) {
            QVERIFY2(item(settingsWindow.contentItem(), field.toLatin1().constData()), qPrintable(field));
        }
        auto* canvasSizeLabel = item(settingsWindow.contentItem(), "canvasSizeLabel");
        QCOMPARE(canvasSizeLabel->property("text").toString(), QString("CANVAS SIZE"));
        QCOMPARE(QFontInfo(canvasSizeLabel->property("font").value<QFont>()).family(), QString("Inter"));
        QCOMPARE(item(settingsWindow.contentItem(), "widthField")->property("label").toString(), QString("Width"));
        QCOMPARE(item(settingsWindow.contentItem(), "heightField")->property("label").toString(), QString("Height"));
        QCOMPARE(item(settingsWindow.contentItem(), "frameRateLabel")->property("text").toString(), QString("FRAME RATE"));
        QCOMPARE(item(settingsWindow.contentItem(), "fpsField")->property("label").toString(), QString("FPS"));
        const auto y = [&](const char* name) { return item(settingsWindow.contentItem(), name)->mapToScene(QPointF()).y(); };
        QVERIFY(y("canvasSizeLabel") < y("resolutionPreset"));
        QVERIFY(y("resolutionPreset") < y("widthField"));
        QCOMPARE(y("widthField"), y("heightField"));
        QVERIFY(y("widthField") < y("frameRateLabel"));
        QVERIFY(y("frameRatePreset") < y("tempoLabel"));
        QVERIFY(y("tempoLabel") < y("offsetField"));
        still(settingsWindow, "ProjectSettingsDialog.png");
        // The xs dialog shrinks to fit narrow windows, retaining a 16 px margin.
        settingsWindow.resize(360, 800);
        QTRY_COMPARE(paper->width(), 328.0);
    }
    void inPlaceSwitchUpdatesWindowAndProject() {
        QTemporaryDir tempDir;
        QVERIFY(tempDir.isValid());
        const auto savedPrefs = qgetenv("NODETOOL_TIMELINE_PREFERENCES");
        const auto hadPrefs = qEnvironmentVariableIsSet("NODETOOL_TIMELINE_PREFERENCES");
        qputenv("NODETOOL_TIMELINE_PREFERENCES", tempDir.filePath("prefs.ini").toUtf8());
        const auto restoreEnv = qScopeGuard([savedPrefs, hadPrefs] {
            nt::server::clearActiveServerTarget();
            if (hadPrefs) {
                qputenv("NODETOOL_TIMELINE_PREFERENCES", savedPrefs);
            } else {
                qunsetenv("NODETOOL_TIMELINE_PREFERENCES");
            }
        });

        QMutex flushMutex;
        QString flushedId;
        int flushedWidth = 0;
        int flushedHeight = 0;
        double flushedFps = 0.0;

        TestHttpServer server;
        QVERIFY(server.base().port() > 0);
        server.setJson([](const QByteArray& path, const QUrl& url) -> QByteArray {
            const auto rawInput = QUrlQuery(url).queryItemValue("input", QUrl::FullyDecoded).toUtf8();
            const auto input = QJsonDocument::fromJson(rawInput).object();
            if (path == "/trpc/projects.list") {
                return R"({"result":{"data":[)"
                       R"({"id":"p1","name":"Alpha","isPersonal":true,"folder":{"workspace_id":"ws1","path":"/tmp/ws1","is_accessible":true}},)"
                       R"({"id":"p2","name":"Beta","isPersonal":false,"folder":{"workspace_id":"ws2","path":"/tmp/ws2","is_accessible":true}}]}})";
            }
            if (path == "/trpc/projects.documents") {
                return R"({"result":{"data":[]}})";
            }
            if (path == "/trpc/timeline.list") {
                const auto projectId = input.value("projectId").toString();
                if (projectId == "p2") {
                    return R"({"result":{"data":[)"
                           R"({"id":"t2","name":"Second Cut","projectId":"p2","updatedAt":"2026-01-02T00:00:00.000Z"}]}})";
                }
                return R"({"result":{"data":[)"
                       R"({"id":"t1","name":"First Cut","projectId":"p1","updatedAt":"2026-01-01T00:00:00.000Z"}]}})";
            }
            if (path == "/trpc/timeline.get") {
                const auto id = input.value("id").toString();
                if (id == "t2") {
                    return R"({"result":{"data":{"id":"t2","name":"Second Cut","projectId":"p2","width":1920,"height":1080,"fps":24,"durationMs":4000,"updatedAt":"2026-01-02T00:00:00.000Z","tracks":[],"clips":[],"markers":[]}}})";
                }
                if (id == "t-v2") {
                    return R"({"result":{"data":{"id":"t-v2","name":"Future","projectId":"p2","workingColorSpaceVersion":2,"width":1920,"height":1080,"fps":24,"tracks":[],"clips":[],"markers":[]}}})";
                }
                return R"({"result":{"data":{"id":"t1","name":"First Cut","projectId":"p1","width":640,"height":360,"fps":30,"durationMs":6000,"updatedAt":"2026-01-01T00:00:00.000Z","tracks":[],"clips":[],"markers":[]}}})";
            }
            return R"({"result":{"data":{}}})";
        });
        server.setPost([&](const QByteArray& path, const QByteArray& body) -> QByteArray {
            if (path == "/trpc/timeline.update") {
                const auto obj = QJsonDocument::fromJson(body).object();
                QMutexLocker lock(&flushMutex);
                flushedId = obj.value("id").toString();
                flushedWidth = obj.value("width").toInt();
                flushedHeight = obj.value("height").toInt();
                flushedFps = obj.value("fps").toDouble();
                return R"({"result":{"data":{"updatedAt":"2026-01-01T00:01:00.000Z"}}})";
            }
            return R"({"result":{"data":{}}})";
        });

        const nt::server::AssetCacheRoot cacheRoot(tempDir.filePath("cache"));
        nt::server::setActiveServerTarget(server.base(), QStringLiteral("t1"), {}, cacheRoot.path());

        TimelineModel model;
        auto parsed = nt::parseTimelineJson(
            R"({"id":"t1","name":"First Cut","projectId":"p1","width":640,"height":360,"fps":30,"durationMs":6000,"updatedAt":"2026-01-01T00:00:00.000Z","tracks":[],"clips":[],"markers":[]})");
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));

        PlaybackClock clock;
        clock.setDurationMs(6000);
        clock.seek(1234.0);
        clock.play();

        nt::server::TimelineSession session(model, clock, cacheRoot);
        session.attachInitialServer(QStringLiteral("2026-01-01T00:00:00.000Z"));
        QVERIFY(session.autosaveController());
        session.autosaveController()->setExternalSync(false);
        session.autosaveController()->setAutosave(false);

        QQmlEngine engine;
        m_testCache.install(engine);
        engine.rootContext()->setContextProperty(QStringLiteral("nativeSession"), &session);
        QQuickWindow window;
        auto editor = make(engine, "TimelineEditor", {{"timeline", QVariant::fromValue(&model)},
                                                      {"clock", QVariant::fromValue(&clock)}});
        QVERIFY(editor);
        show(window, editor.get(), 1400, 800);
        session.setWindow(&window);

        QCOMPARE(window.title(), QStringLiteral("NodeTool Timeline — First Cut"));
        QCOMPARE(editor->property("saver").value<QObject*>(), session.autosave());
        auto* projectButton = item(editor.get(), "documentProjectButton");
        QVERIFY(projectButton);
        QTRY_COMPARE(projectButton->property("text").toString(), QStringLiteral("Alpha"));

        QVERIFY(model.applyEdit("setProjectSettings", {{"width", 1280}, {"height", 720}, {"fps", 24}}));
        QVERIFY(session.autosaveController()->dirty());
        QSignalSpy autosaveSpy(&session, &nt::server::TimelineSession::autosaveChanged);

        const auto clickItem = [&](QQuickItem* target) {
            QList<QQuickItem*> ancestors;
            for (QQuickItem* p = target; p; p = p->parentItem()) {
                ancestors.prepend(p);
            }
            for (QQuickItem* p : ancestors) {
                p->ensurePolished();
            }
            QTest::mouseClick(&window, Qt::LeftButton, Qt::NoModifier,
                              target->mapToScene({target->width() / 2, target->height() / 2}).toPoint());
        };

        clickItem(projectButton);
        QTRY_VERIFY(item(window.contentItem(), "TimelineListPanel"));
        auto* panel = item(window.contentItem(), "TimelineListPanel");
        auto* listController = qobject_cast<nt::server::TimelineListController*>(
            panel->property("controller").value<QObject*>());
        QVERIFY(listController);
        QTRY_COMPARE(listController->projectId(), QStringLiteral("p1"));

        listController->setProjectId(QStringLiteral("p2"));
        QTRY_VERIFY(item(window.contentItem(), "TimelineListItem_t2"));
        clickItem(item(window.contentItem(), "TimelineListItem_t2"));

        QTRY_COMPARE(model.timelineId(), QStringLiteral("t2"));
        QTRY_VERIFY(!session.switching());
        QCOMPARE(model.projectId(), QStringLiteral("p2"));
        QCOMPARE(model.name(), QStringLiteral("Second Cut"));
        QCOMPARE(model.canvasWidth(), 1920);
        QCOMPARE(model.canvasHeight(), 1080);
        QCOMPARE(model.fps(), 24.0);
        QVERIFY(!clock.playing());
        QCOMPARE(clock.time(), 0.0);
        QVERIFY(session.autosaveController() != nullptr);
        QVERIFY(!session.autosaveController()->dirty());
        QVERIFY(autosaveSpy.count() >= 2);
        QCOMPARE(editor->property("saver").value<QObject*>(), session.autosave());
        QCOMPARE(window.title(), QStringLiteral("NodeTool Timeline — Second Cut"));
        QTRY_COMPARE(projectButton->property("text").toString(), QStringLiteral("Beta"));
        auto* folder = editor->property("projectFolder").value<ProjectFolderState*>();
        QVERIFY(folder);
        QTRY_COMPARE(folder->projectId(), QStringLiteral("p2"));
        QTRY_VERIFY(!item(window.contentItem(), "TimelineListPanel") ||
                    !item(window.contentItem(), "TimelineListPanel")->isVisible());
        {
            QMutexLocker lock(&flushMutex);
            QCOMPARE(flushedId, QStringLiteral("t1"));
            QCOMPARE(flushedWidth, 1280);
            QCOMPARE(flushedHeight, 720);
            QCOMPARE(flushedFps, 24.0);
        }

        // A failed in-place load must leave the open timeline and autosave intact.
        auto* keptAutosave = session.autosaveController();
        QVERIFY(session.switchToServerTimeline(server.base(), QStringLiteral("t-v2"), {}, {},
                                               QStringLiteral("Future"), nullptr));
        QTRY_VERIFY(!session.switching());
        QVERIFY(session.switchError().contains(QStringLiteral("color version 2")));
        QCOMPARE(model.timelineId(), QStringLiteral("t2"));
        QCOMPARE(session.autosaveController(), keptAutosave);
        QCOMPARE(window.title(), QStringLiteral("NodeTool Timeline — Second Cut"));
    }
};
QTEST_MAIN(TestTimelineListUi)
#include "tst_timelinelistui.moc"
