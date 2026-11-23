// WorkflowBrowser.qml on its own: a fixture WorkflowBrowser, PanelLayout and
// StatusModel, no EditorWindow, graph runner, QtNodes or server. The executable
// links only the interface library and the QML module.
#include "interfaces/PanelLayout.h"
#include "interfaces/StatusModel.h"
#include "server/ProjectFolder.h"
#include "nodetool/account/project_lock.h"
#include "nodetool/account/storage.h"
#include "server/WorkflowBrowser.h"

#include <QGuiApplication>
#include <QStyleHints>
#include <QQuickItem>
#include <QQuickView>
#include <QSignalSpy>
#include <QTcpServer>
#include <QTcpSocket>
#include <QtQml/QQmlExtensionPlugin>
#include <QDir>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QTemporaryDir>
#include <QUrlQuery>
#include <QtTest>
#include <algorithm>

Q_IMPORT_QML_PLUGIN(NodeTool_NodeEditorPlugin)

using nodetool::node_editor::PanelLayout;
using nodetool::node_editor::ProjectFolder;
using nodetool::node_editor::StatusModel;
using nodetool::node_editor::WorkflowBrowser;

namespace {

QQuickItem *named(QQuickItem *root, const QString &name) {
    if (root->objectName() == name) {
        return root;
    }
    for (auto *child : root->childItems()) {
        if (auto *found = named(child, name)) {
            return found;
        }
    }
    return nullptr;
}

QQuickItem *withText(QQuickItem *root, const QString &text) {
    if (root->property("text").toString() == text) {
        return root;
    }
    for (auto *child : root->childItems()) {
        if (auto *found = withText(child, text)) {
            return found;
        }
    }
    return nullptr;
}

void click(QQuickView &view, QQuickItem *item) {
    QVERIFY(item);
    QTRY_VERIFY(item->isVisible() && item->width() > 0);
    QTest::mouseClick(&view, Qt::LeftButton, Qt::NoModifier,
                      item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint());
}

QQuickItem *visibleNamed(QQuickItem *root, const QString &name) {
    auto *item = named(root, name);
    return item && item->isVisible() ? item : nullptr;
}

// Answers every request with one workflow page, so the panel has rows.
class PageServer final : public QTcpServer {
public:
    QByteArray page;
    PageServer() {
        listen(QHostAddress::LocalHost);
        connect(this, &QTcpServer::newConnection, this, [this] {
            auto *socket = nextPendingConnection();  // Owned by this server, its parent.
            connect(socket, &QTcpSocket::readyRead, socket, [this, socket] {
                if (!socket->peek(socket->bytesAvailable()).contains("\r\n\r\n")) { return; }
                socket->readAll();
                socket->write("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: " +
                              QByteArray::number(page.size()) + "\r\n\r\n" + page);
                socket->disconnectFromHost();
            });
        });
    }
    QUrl url() const { return QUrl(QString("http://127.0.0.1:%1").arg(serverPort())); }
};

// Answers the projects procedures from a script: each path gets a status and a
// body, and the server records the requests with their bodies.
class ProjectServer final : public QTcpServer {
public:
    struct Answer { int status = 200; QByteArray body; };
    QHash<QString, Answer> answers;
    QList<QPair<QUrl, QJsonObject>> requests;
    ProjectServer() {
        listen(QHostAddress::LocalHost);
        connect(this, &QTcpServer::newConnection, this, [this] {
            auto *socket = nextPendingConnection();  // Owned by this server, its parent.
            connect(socket, &QTcpSocket::readyRead, socket, [this, socket] {
                const auto bytes = socket->property("bytes").toByteArray() + socket->readAll();
                socket->setProperty("bytes", bytes);
                const auto split = bytes.indexOf("\r\n\r\n");
                if (split < 0 || socket->property("done").toBool()) { return; }
                int length = 0;
                for (const auto &line : bytes.left(split).split('\n')) {
                    if (line.toLower().startsWith("content-length:")) { length = line.mid(15).trimmed().toInt(); }
                }
                if (bytes.size() < split + 4 + length) { return; }
                socket->setProperty("done", true);
                const QUrl target(QString::fromUtf8(bytes.split(' ').value(1)));
                const auto input = bytes.startsWith("GET")
                    ? QJsonDocument::fromJson(QUrlQuery(target).queryItemValue("input", QUrl::FullyDecoded).toUtf8()).object()
                    : QJsonDocument::fromJson(bytes.mid(split + 4, length)).object();
                requests.append({target, input});
                const auto answer = answers.value(target.path(), Answer{404, R"({"error":{"message":"Not found"}})"});
                socket->write("HTTP/1.1 " + QByteArray::number(answer.status) + " X\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: " +
                              QByteArray::number(answer.body.size()) + "\r\n\r\n" + answer.body);
                socket->disconnectFromHost();
            });
        });
    }
    QUrl url() const { return QUrl(QString("http://127.0.0.1:%1").arg(serverPort())); }
    int count(const QString &path) const {
        return int(std::count_if(requests.cbegin(), requests.cend(), [&](const auto &request) { return request.first.path() == path; }));
    }
    static QByteArray data(const QJsonValue &value) {
        return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", value}}}}).toJson(QJsonDocument::Compact);
    }
};

QJsonObject project(const QString &id, const QString &name, const QJsonValue &folder, bool personal = false) {
    return {{"id", id}, {"name", name}, {"kind", "general"}, {"isPersonal", personal}, {"archivedAt", QJsonValue::Null},
            {"threadId", QJsonValue::Null}, {"folder", folder}, {"createdAt", "2026-11-01"}, {"updatedAt", "2026-11-01"}};
}

QJsonObject folderOf(const QString &path, bool accessible) {
    return {{"workspace_id", "ws-" + QFileInfo(path).fileName()}, {"path", path}, {"origin", "created"},
            {"is_accessible", accessible}, {"on_delete", "trash"}};
}

QString textOf(QQuickItem *item) {
    return item ? item->property("message").toString() : QString();
}

void doubleClick(QQuickView &view, QQuickItem *item) {
    QVERIFY(item);
    QTest::mouseDClick(&view, Qt::LeftButton, Qt::NoModifier,
                       item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint());
}

}  // namespace

class WorkflowBrowserComponentTest : public QObject {
    Q_OBJECT
private slots:
    void browserSendsWindowRequests() {
        // An unconfigured browser makes no requests.
        WorkflowBrowser browser;
        PanelLayout panels;
        StatusModel status;
        QSignalSpy close(&panels, &PanelLayout::toggleBrowserRequested);
        QSignalSpy connectServer(&status, &StatusModel::connectRequested);
        QQuickView view;
        view.setInitialProperties({{"browser", QVariant::fromValue(&browser)},
                                   {"panels", QVariant::fromValue(&panels)},
                                   {"status", QVariant::fromValue(&status)}});
        view.setResizeMode(QQuickView::SizeRootObjectToView);
        view.setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/WorkflowBrowser.qml"));
        QCOMPARE(view.status(), QQuickView::Ready);
        view.resize(360, 600);
        view.show();
        QVERIFY(QTest::qWaitForWindowExposed(&view));
        auto *root = view.rootObject();
        click(view, named(root, "browser-close"));
        QCOMPARE(close.size(), 1);
        // The connect button shows only while the session has no server.
        auto *connect = withText(root, "Connect to server");
        click(view, connect);
        QCOMPARE(connectServer.size(), 1);
        status.setStatus({.connected = true});
        QVERIFY(!connect->isVisible());
    }

    // WorkflowList.tsx: day groups, favourites, selection with bulk delete,
    // the row menu's Edit, and rename in place.
    void listMatchesTheWebList() {
        PageServer server;
        server.page = R"({"workflows":[
            {"id":"a","name":"Alpha","updated_at":"2026-11-13T09:00:00Z","tags":["image"]},
            {"id":"b","name":"Beta","updated_at":"2026-11-12T09:00:00Z","description":"Second"}],"next":null})";
        WorkflowBrowser browser;
        PanelLayout panels;
        StatusModel status;
        status.setStatus({.connected = true});
        browser.configure(server.url());
        browser.setNow(QDateTime::fromString("2026-11-13T12:00:00Z", Qt::ISODate));
        browser.refresh();
        QTRY_VERIFY(!browser.loading());
        QCOMPARE(browser.rows().size(), 2);
        QQuickView view;
        view.setInitialProperties({{"browser", QVariant::fromValue(&browser)},
                                   {"panels", QVariant::fromValue(&panels)},
                                   {"status", QVariant::fromValue(&status)}});
        view.setResizeMode(QQuickView::SizeRootObjectToView);
        view.setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/WorkflowBrowser.qml"));
        QCOMPARE(view.status(), QQuickView::Ready);
        view.resize(360, 900);
        view.show();
        QVERIFY(QTest::qWaitForWindowExposed(&view));
        auto *root = view.rootObject();
        QTRY_VERIFY(visibleNamed(root, "workflow-group-Today"));
        QVERIFY(visibleNamed(root, "workflow-group-Yesterday"));
        QVERIFY(visibleNamed(root, "workflow-tags"));
        // A single click opens after the double-click interval.
        QSignalSpy opened(&browser, &WorkflowBrowser::openRequested);
        click(view, named(root, "workflow-row-b"));
        QTRY_COMPARE(opened.size(), 1);
        QCOMPARE(opened.first().first().toString(), "b");
        // The star stays on a favourite.
        browser.toggleFavorite("a");
        QTRY_VERIFY(visibleNamed(root, "workflow-favorite-a"));
        click(view, named(root, "workflow-favorites-only"));
        QVERIFY(browser.favoritesOnly());
        QTRY_VERIFY(!visibleNamed(root, "workflow-row-b"));
        click(view, named(root, "workflow-favorites-only"));
        // Selection mode: a row click selects, and the toolbar deletes the selection.
        QSignalSpy deleteSelected(&browser, &WorkflowBrowser::deleteSelectedRequested);
        click(view, named(root, "workflow-selection-mode"));
        QTRY_VERIFY(visibleNamed(root, "workflow-select-a"));
        click(view, named(root, "workflow-row-b"));
        QCOMPARE(browser.selectedIds(), QStringList{"b"});
        QCOMPARE(opened.size(), 1);
        click(view, named(root, "workflow-delete-selected"));
        QCOMPARE(deleteSelected.first().first().toStringList(), QStringList{"b"});
        click(view, named(root, "workflow-selection-mode"));
        // Name order drops the day groups and shows each row's date.
        browser.setSortBy("name");
        QTRY_VERIFY(!visibleNamed(root, "workflow-group-Today"));
        QTRY_VERIFY(visibleNamed(root, "workflow-date-b"));
        // The row menu's Edit opens the settings form for that row.
        QMetaObject::invokeMethod(root, "openMenu", Q_ARG(QVariant, browser.rows()[1]),
                                  Q_ARG(QVariant, QVariant::fromValue<QObject *>(named(root, "workflow-row-b"))),
                                  Q_ARG(QVariant, 0), Q_ARG(QVariant, 0));
        // The menu lives in the window's overlay, outside the panel.
        QTRY_VERIFY(visibleNamed(view.contentItem(), "workflow-menu-edit"));
        click(view, named(view.contentItem(), "workflow-menu-edit"));
        QTRY_VERIFY(visibleNamed(root, "workflow-edit-form"));
        QCOMPARE(named(root, "workflow-edit-description")->property("value").toString(), "Second");
        click(view, named(root, "workflow-edit-close"));
        QTRY_VERIFY(!visibleNamed(root, "workflow-edit-form"));
        // A double-click renames in place instead of opening.
        doubleClick(view, named(root, "workflow-row-a"));
        QTRY_VERIFY(visibleNamed(root, "workflow-rename-a"));
        QTest::qWait(QGuiApplication::styleHints()->mouseDoubleClickInterval() + 50);
        QCOMPARE(opened.size(), 1);
        QTest::keyClick(&view, Qt::Key_Escape);
        QTRY_VERIFY(!visibleNamed(root, "workflow-rename-a"));
    }

    // The tab's project folder at the top of the list: where it is and a file
    // manager for it, "Folder not found" with Locate, and the server's refusal.
    void folderNoticeShowsTheProjectFolder() {
        QTemporaryDir disk;
        QVERIFY(disk.isValid());
        const auto here = disk.path();
        const auto gone = QDir(here).filePath("Moved away");
        ProjectServer server;
        server.answers["/trpc/projects.list"] = {200, ProjectServer::data(QJsonArray{
            project("personal:1", "Personal", folderOf(here, true), true),
            project("p1", "Poster <Spring>", folderOf(gone, false)),
            project("p2", "Draft", QJsonValue::Null)})};
        server.answers["/trpc/projects.relocate"] = {400, R"({"error":{"message":"Relocating a folder works only on a local server"}})"};
        ProjectFolder folder;
        folder.configure(server.url(), {}, "1");
        QTRY_COMPARE(folder.folderState(), QString("ok"));
        QCOMPARE(folder.projectName(), QString("Personal"));
        QCOMPARE(folder.folderPath(), here);
        QCOMPARE(folder.workspaceId(), "ws-" + QFileInfo(here).fileName());
        QVERIFY(folder.revealable());

        WorkflowBrowser browser;
        PanelLayout panels;
        StatusModel status;
        status.setStatus({.connected = true});
        QQuickView view;
        view.setInitialProperties({{"browser", QVariant::fromValue(&browser)},
                                   {"panels", QVariant::fromValue(&panels)},
                                   {"status", QVariant::fromValue(&status)},
                                   {"folder", QVariant::fromValue(&folder)}});
        view.setResizeMode(QQuickView::SizeRootObjectToView);
        view.setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/WorkflowBrowser.qml"));
        QCOMPARE(view.status(), QQuickView::Ready);
        view.resize(360, 700);
        view.show();
        QVERIFY(QTest::qWaitForWindowExposed(&view));
        auto *root = view.rootObject();
        QTRY_VERIFY(visibleNamed(root, "project-folder-path"));
        QVERIFY(visibleNamed(root, "project-folder-reveal"));
        QCOMPARE(named(root, "project-folder-reveal")->property("text").toString(), ProjectFolder::revealLabel());
        QVERIFY(!visibleNamed(root, "project-folder-missing"));

        // A folder the server cannot reach offers Locate. The name is no markup.
        folder.setProject("p1");
        QTRY_VERIFY(visibleNamed(root, "project-folder-missing"));
        QVERIFY(!visibleNamed(root, "project-folder-path"));
        QVERIFY(!folder.revealable());
        QCOMPARE(textOf(named(root, "project-folder-missing")),
                 QString("<b>Folder not found</b><br>The folder of Poster &lt;Spring&gt; was moved, renamed, or is on a drive that is not connected. Runs cannot start until you locate it."));
        QCOMPARE(named(root, "project-folder-missing")->property("actionText").toString(), QString("Locate"));
        folder.locate(QUrl::fromLocalFile(here));
        QTRY_VERIFY(visibleNamed(root, "project-folder-locate-error"));
        QCOMPARE(textOf(named(root, "project-folder-locate-error")),
                 QString("Could not locate the folder: Relocating a folder works only on a local server"));
        QCOMPARE(server.requests.last().second, (QJsonObject{{"project_id", "p1"}, {"path", here}}));
        // A local server takes the new place and answers the project.
        server.answers["/trpc/projects.relocate"] = {200, ProjectServer::data(project("p1", "Poster <Spring>", folderOf(here, true)))};
        folder.locate(QUrl::fromLocalFile(here));
        QTRY_COMPARE(folder.folderState(), QString("ok"));
        QTRY_VERIFY(!visibleNamed(root, "project-folder-missing"));
        QVERIFY(!visibleNamed(root, "project-folder-locate-error"));
        QVERIFY(visibleNamed(root, "project-folder-path"));

        folder.setProject("p2");
        QTRY_VERIFY(visibleNamed(root, "project-folder-none"));
        QCOMPARE(textOf(named(root, "project-folder-none")), QString("<b>No project folder</b><br>This project has no folder yet."));

        // A cloud folder has no path, so the notice shows nothing.
        server.answers["/trpc/projects.list"] = {200, ProjectServer::data(QJsonArray{project("p3", "Cloud", QJsonObject{
            {"workspace_id", "ws-cloud"}, {"path", QJsonValue::Null}, {"origin", "created"}, {"is_accessible", true}, {"on_delete", "remove"}})})};
        folder.setProject("p3");
        QTRY_COMPARE(folder.workspaceId(), QString("ws-cloud"));
        QVERIFY(!folder.revealable());
        QVERIFY(!visibleNamed(root, "project-folder-path"));
        QVERIFY(!visibleNamed(root, "project-folder-none"));
        // Without a server connection the panel shows no notice.
        status.setStatus({.connected = false});
        folder.setProject("p1");
        QTest::qWait(50);
        QVERIFY(!visibleNamed(root, "project-folder-missing"));
    }

    // DocumentFileNotice.tsx: an invalid file shows its error, a missing one
    // offers Restore, and a refused restore says why.
    void fileBannerShowsTheOpenWorkflowFile() {
        ProjectServer server;
        server.answers["/trpc/projects.list"] = {200, ProjectServer::data(QJsonArray{project("p1", "Poster", folderOf("/srv/poster", true))})};
        const auto documents = [](const QJsonValue &file) {
            return ProjectServer::data(QJsonArray{
                QJsonObject{{"type", "workflow"}, {"ref", "other"}, {"name", "Other"}, {"updatedAt", "2026-11-01"},
                            {"file", QJsonObject{{"path", "Workflows/Other.workflow.json"}, {"state", "missing"}, {"error", QJsonValue::Null}}}},
                QJsonObject{{"type", "workflow"}, {"ref", "wf-1"}, {"name", "Lights"}, {"updatedAt", "2026-11-01"}, {"file", file}}});
        };
        server.answers["/trpc/projects.documents"] = {200, documents(QJsonObject{
            {"path", "Workflows/Lights.workflow.json"}, {"state", "invalid"}, {"error", "Unexpected token } in JSON"}})};
        ProjectFolder folder;
        folder.configure(server.url(), {}, "1");
        folder.setProject("p1");
        folder.setDocument("wf-1");
        QTRY_COMPARE(folder.fileState(), QString("invalid"));
        QCOMPARE(server.requests.last().second, (QJsonObject{{"id", "p1"}}));

        QQuickView view;
        view.setInitialProperties({{"folder", QVariant::fromValue(&folder)}});
        view.setResizeMode(QQuickView::SizeRootObjectToView);
        view.setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/DocumentFileBanner.qml"));
        QCOMPARE(view.status(), QQuickView::Ready);
        view.resize(700, 160);
        view.show();
        QVERIFY(QTest::qWaitForWindowExposed(&view));
        auto *root = view.rootObject();
        QVERIFY(root->implicitHeight() > 0);
        QTRY_VERIFY(visibleNamed(root, "document-file-invalid"));
        QCOMPARE(textOf(named(root, "document-file-invalid")),
                 QString("<b>This file has an error</b><br>Workflows/Lights.workflow.json was not loaded: Unexpected token } in JSON. The last valid version stays open and still runs."));
        QVERIFY(!visibleNamed(root, "document-file-missing"));

        // A documentfile push for another document reads nothing. One for this
        // document reads the list again.
        server.answers["/trpc/projects.documents"] = {200, documents(QJsonObject{
            {"path", "Workflows/Lights.workflow.json"}, {"state", "missing"}, {"error", QJsonValue::Null}})};
        const auto reads = server.count("/trpc/projects.documents");
        folder.documentFileChanged({{"id", "other"}, {"type", "workflow"}});
        QTest::qWait(50);
        QCOMPARE(server.count("/trpc/projects.documents"), reads);
        folder.documentFileChanged({{"id", "wf-1"}, {"type", "workflow"}, {"file_error", QJsonValue::Null}});
        QTRY_VERIFY(visibleNamed(root, "document-file-missing"));
        QCOMPARE(textOf(named(root, "document-file-missing")),
                 QString("<b>File missing</b><br>Workflows/Lights.workflow.json is no longer in the project folder. Restore writes it again from this document."));

        server.answers["/trpc/projects.restoreDocumentFile"] = {503, R"({"error":{"message":"The project folder is not reachable"}})"};
        auto *restore = named(named(root, "document-file-missing"), "bannerActionButton");
        QCOMPARE(restore->property("text").toString(), QString("Restore"));
        click(view, restore);
        QTRY_VERIFY(visibleNamed(root, "document-file-restore-error"));
        QCOMPARE(textOf(named(root, "document-file-restore-error")),
                 QString("The file was not restored: The project folder is not reachable"));
        QCOMPARE(server.requests.last().second, (QJsonObject{{"type", "workflow"}, {"ref", "wf-1"}}));
        server.answers["/trpc/projects.restoreDocumentFile"] = {200, ProjectServer::data(QJsonObject{{"type", "workflow"}, {"ref", "wf-1"},
            {"name", "Lights"}, {"updatedAt", "2026-11-02"}, {"file", QJsonObject{{"path", "Workflows/Lights.workflow.json"}, {"state", "ok"}, {"error", QJsonValue::Null}}}})};
        click(view, restore);
        QTRY_COMPARE(folder.fileState(), QString("ok"));
        QTRY_VERIFY(!root->isVisible());
        QCOMPARE(root->implicitHeight(), 0.0);
        // Another document has its own state, none loaded yet.
        folder.setDocument({});
        QVERIFY(folder.fileState().isEmpty());
    }

    // WP2.13, AC25: another computer's app has the project open, so the tab
    // is read-only and the banner names it. Open for editing asks first,
    // then takes the lock over.
    void lockBannerNamesTheOtherApp() {
        namespace acc = nodetool::account;
        QTemporaryDir disk;
        QVERIFY(disk.isValid());
        const auto here = disk.path();
        const auto folderPath = std::filesystem::path(here.toStdU16String());
        acc::writeFileAtomically(acc::projectLockPath(folderPath),
                                 acc::serializeProjectLock({"timeline", 4242, "laptop", "1.0", "p1"}));
        ProjectServer server;
        server.answers["/trpc/projects.list"] = {200, ProjectServer::data(QJsonArray{project("p1", "Poster", folderOf(here, true))})};
        acc::ProjectLocks locks("node-editor");
        ProjectFolder folder;
        folder.setLocks(&locks);
        folder.configure(server.url(), {}, "1");
        folder.setProject("p1");
        QTRY_COMPARE(folder.lock()->state(), QString("heldElsewhere"));
        QVERIFY(folder.lock()->readOnly());

        QQuickView view;
        view.setInitialProperties({{"folder", QVariant::fromValue(&folder)}});
        view.setResizeMode(QQuickView::SizeRootObjectToView);
        view.setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/DocumentFileBanner.qml"));
        QCOMPARE(view.status(), QQuickView::Ready);
        view.resize(700, 400);
        view.show();
        QVERIFY(QTest::qWaitForWindowExposed(&view));
        auto *root = view.rootObject();
        QTRY_VERIFY(visibleNamed(root, "projectLockBanner"));
        QVERIFY(root->implicitHeight() > 0);
        QCOMPARE(folder.lock()->message(), QString("Read-only: The timeline app on laptop has this project open."));
        auto *action = named(named(root, "projectLockBanner"), "bannerActionButton");
        QCOMPARE(action->property("text").toString(), QString("Open for editing…"));
        click(view, action);
        QTRY_VERIFY(visibleNamed(view.contentItem(), "projectLockTakeOverConfirm"));
        click(view, named(view.contentItem(), "projectLockTakeOverConfirm"));
        QTRY_COMPARE(folder.lock()->state(), QString("writing"));
        QTRY_VERIFY(!visibleNamed(root, "projectLockBanner"));
        const auto bytes = acc::readWholeFile(acc::projectLockPath(folderPath));
        QVERIFY(bytes.has_value());
        QCOMPARE(QString::fromStdString(acc::parseProjectLock(*bytes)->app), QString("node-editor"));
        // Another project gives the lock back.
        folder.setProject({});
        QTRY_VERIFY(!std::filesystem::exists(acc::projectLockPath(folderPath)));
    }

    void browserRequestsGoThroughTheModel() {
        WorkflowBrowser browser;
        QSignalSpy opened(&browser, &WorkflowBrowser::openRequested);
        QSignalSpy deleted(&browser, &WorkflowBrowser::deleteRequested);
        QSignalSpy reloaded(&browser, &WorkflowBrowser::reloadRequested);
        browser.open("w1");
        browser.confirmDelete("w1", "Poster");
        browser.reload();
        QCOMPARE(opened.first().first().toString(), "w1");
        QCOMPARE(deleted.first().at(1).toString(), "Poster");
        QCOMPARE(reloaded.size(), 1);
    }
};

QTEST_MAIN(WorkflowBrowserComponentTest)
#include "WorkflowBrowserComponentTest.moc"
