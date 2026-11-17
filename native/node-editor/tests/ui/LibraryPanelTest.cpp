#include "library/LibraryBrowser.h"
#include "ui/EditorWindow.h"
#include <QDockWidget>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QQmlContext>
#include <QQuickItem>
#include <QQuickWidget>
#include <QTcpServer>
#include <QTcpSocket>
#include <QUrlQuery>
#include <QApplication>
#include <QMouseEvent>
#include <QtTest>
using namespace nodetool;
// Answers assets.list with a fixed home folder and one child folder.
class LibraryHttp final : public QObject {
public:
  QTcpServer server;
  QStringList parents;
  // The project_id of each list and search, empty when the input had none.
  QStringList projects;
  // The bodies of POST /api/assets.
  QList<QJsonObject> creates;
  // image-1's file is missing from its project folder.
  bool offline = false;
  // assets.relinkExternal answers with this status and body, and records its inputs.
  int relinkStatus = 200;
  QByteArray relinkBody = R"({"result":{"data":{"id":"image-1"}}})";
  QList<QJsonObject> relinks;
  LibraryHttp() {
    server.listen(QHostAddress::LocalHost);
    connect(&server, &QTcpServer::newConnection, this, [this] {
      while (server.hasPendingConnections()) {
        auto *socket = server.nextPendingConnection(); socket->setParent(this);
        connect(socket, &QTcpSocket::readyRead, this, [this, socket] {
          const auto bytes = socket->property("bytes").toByteArray() + socket->readAll();
          socket->setProperty("bytes", bytes);
          const auto split = bytes.indexOf("\r\n\r\n");
          if (split < 0 || socket->property("done").toBool()) return;
          int length = 0;
          for (const auto &line : bytes.left(split).split('\n'))
            if (line.toLower().startsWith("content-length:")) length = line.mid(15).trimmed().toInt();
          if (bytes.size() < split + 4 + length) return;
          socket->setProperty("done", true);
          const QUrl target(QString::fromUtf8(bytes.split(' ').value(1)));
          if (target.path() == "/trpc/assets.relinkExternal") {
            relinks.append(QJsonDocument::fromJson(bytes.mid(split + 4, length)).object());
            socket->write("HTTP/1.1 " + QByteArray::number(relinkStatus) + " X\r\nConnection: close\r\nContent-Length: " + QByteArray::number(relinkBody.size()) + "\r\n\r\n" + relinkBody);
            socket->disconnectFromHost();
            return;
          }
          if (target.path() == "/api/assets") creates.append(QJsonDocument::fromJson(bytes.mid(split + 4, length)).object());
          QJsonObject result;
          if (target.path() == "/trpc/assets.list" || target.path() == "/trpc/assets.search") {
            const bool search = target.path().endsWith("search");
            const auto input = QJsonDocument::fromJson(QUrlQuery(target).queryItemValue("input", QUrl::FullyDecoded).toUtf8()).object();
            const auto parent = input["parent_id"].toString();
            parents.append(search ? "search:" + input["query"].toString() : parent);
            projects.append(input["project_id"].toString());
            QJsonObject image{{"id", "image-1"}, {"name", "cat.png"}, {"content_type", "image/png"}, {"parent_id", "user-1"}, {"created_at", "2026-01-02"}};
            if (offline) image["offline"] = true;
            const QJsonArray home{
              image,
              QJsonObject{{"id", "folder-1"}, {"name", "Shots"}, {"content_type", "folder"}, {"parent_id", "user-1"}, {"created_at", "2026-01-01"}}};
            const QJsonArray shots{
              QJsonObject{{"id", "video-1"}, {"name", "take.mp4"}, {"content_type", "video/mp4"}, {"parent_id", "folder-1"}, {"created_at", "2026-01-03"}, {"favorite", true}}};
            auto all = home; all.append(shots[0]);
            const QJsonObject data{{"assets", search ? all : parent == "folder-1" ? shots : home}, {"next", QJsonValue::Null}};
            result = QJsonObject{{"result", QJsonObject{{"data", data}}}};
          } else if (target.path().startsWith("/api/nodes/metadata")) result = {{"nodes", QJsonArray{}}};
          const auto data = QJsonDocument(result).toJson(QJsonDocument::Compact);
          socket->write("HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: " + QByteArray::number(data.size()) + "\r\n\r\n" + data);
          socket->disconnectFromHost();
        });
      }
    });
  }
  QUrl url() const { return QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())); }
};
// View delegates are visual children only, so findChild misses them.
QQuickItem *findItem(QQuickItem *root, const QString &name) {
  if (!root) return nullptr;
  if (root->objectName() == name) return root;
  for (auto *child : root->childItems()) if (auto *found = findItem(child, name)) return found;
  return nullptr;
}
class LibraryPanelTest final : public QObject {
  Q_OBJECT
private slots:
  void listsFoldersFirstAndNavigates() {
    LibraryHttp http;
    node_editor::LibraryBrowser browser;
    browser.configure(http.url(), {}, "user-1");
    browser.refresh();
    QTRY_COMPARE(browser.assetModel()->count(), 2);
    QCOMPARE(http.parents, QStringList{"user-1"});
    const auto first = browser.assetModel()->data(browser.assetModel()->index(0), AssetListModel::IdRole).toString();
    QCOMPARE(first, QString("folder-1"));
    browser.openFolder("folder-1");
    QTRY_COMPARE(browser.assetModel()->count(), 1);
    QCOMPARE(browser.folderId(), QString("folder-1"));
    QCOMPARE(browser.breadcrumbs().size(), 2);
    QCOMPARE(browser.breadcrumbs().last().toMap()["name"].toString(), QString("Shots"));
    browser.goUp();
    QTRY_COMPARE(browser.assetModel()->count(), 2);
    QCOMPARE(browser.folderId(), QString("user-1"));
    browser.setTypeFilter("video");
    QTRY_COMPARE(browser.assetModel()->count(), 1);
    QCOMPARE(http.parents.last(), QString("search:"));
    QCOMPARE(browser.assetModel()->data(browser.assetModel()->index(0), AssetListModel::IdRole).toString(), QString("video-1"));
    browser.setTypeFilter("");
    browser.setFavoritesOnly(true);
    QTRY_COMPARE(browser.assetModel()->count(), 1);
    browser.setFavoritesOnly(false);
    browser.setSearchText("cat");
    QTRY_COMPARE(browser.assetModel()->count(), 1);
    QCOMPARE(http.parents.last(), QString("search:cat"));
    browser.setSearchText("");
    QTRY_COMPARE(browser.assetModel()->count(), 2);
    QCOMPARE(browser.mediaType(QVariantMap{{"content_type", "video/mp4"}}), QString("video"));
    QCOMPARE(browser.mediaUrl("/api/assets/image-1/thumb"), http.url().resolved(QUrl("/api/assets/image-1/thumb")));
  }
  // Inside a project the Library lists that project and makes a new folder
  // there, where the server creates a directory of the project folder. A
  // project change returns to the new project's root.
  void listsAndCreatesInTheTabsProject() {
    LibraryHttp http;
    node_editor::LibraryBrowser browser;
    browser.configure(http.url(), {}, "user-1");
    browser.setProject("project-a");
    QVERIFY(http.projects.isEmpty());
    browser.refresh();
    QTRY_COMPARE(browser.assetModel()->count(), 2);
    QCOMPARE(http.projects, QStringList{"project-a"});
    browser.setSearchText("cat");
    QTRY_COMPARE(http.parents.last(), QString("search:cat"));
    QCOMPARE(http.projects.last(), QString("project-a"));
    browser.setSearchText("");
    QTRY_COMPARE(browser.assetModel()->count(), 2);
    browser.openFolder("folder-1");
    QTRY_COMPARE(browser.assetModel()->count(), 1);
    const auto lists = http.parents.size();
    browser.createFolder("Footage");
    QTRY_COMPARE(http.creates.size(), 1);
    QCOMPARE(http.creates[0]["project_id"].toString(), QString("project-a"));
    QCOMPARE(http.creates[0]["parent_id"].toString(), QString("folder-1"));
    QCOMPARE(http.creates[0]["content_type"].toString(), QString("folder"));
    QTRY_VERIFY(http.parents.size() > lists);
    QTRY_VERIFY(!browser.busy());
    browser.setProject("project-b");
    QCOMPARE(browser.folderId(), QString("user-1"));
    QCOMPARE(browser.breadcrumbs().size(), 1);
    QTRY_COMPARE(http.projects.last(), QString("project-b"));
    QCOMPARE(http.parents.last(), QString("user-1"));
    QTRY_COMPARE(browser.assetModel()->count(), 2);
  }
  // A workspacefile push lists the open folder again when it names the shown
  // project's folder, or when either id is unknown.
  void folderPushesListTheOpenFolderAgain() {
    LibraryHttp http;
    node_editor::LibraryBrowser browser;
    browser.configure(http.url(), {}, "user-1");
    browser.workspaceFilesChanged("ws-1");
    QTest::qWait(50);
    QVERIFY(http.parents.isEmpty());
    browser.refresh();
    QTRY_COMPARE(http.parents.size(), 1);
    QTRY_VERIFY(!browser.busy());
    browser.workspaceFilesChanged("ws-other");
    QTRY_COMPARE(http.parents.size(), 2);
    QTRY_VERIFY(!browser.busy());
    browser.setProjectWorkspace("ws-1");
    browser.workspaceFilesChanged("ws-other");
    QTest::qWait(50);
    QCOMPARE(http.parents.size(), 2);
    browser.workspaceFilesChanged("ws-1");
    QTRY_COMPARE(http.parents.size(), 3);
    QTRY_VERIFY(!browser.busy());
    browser.workspaceFilesChanged({});
    QTRY_COMPARE(http.parents.size(), 4);
    QCOMPARE(http.parents.last(), QString("user-1"));
  }
  // An asset whose file is gone says Missing and offers Relink.
  void missingAssetOffersRelink() {
    LibraryHttp http;
    http.offline = true;
    EditorWindow window;
    window.resize(1400, 900);
    window.show();
    window.session()->connectToServer(http.url(), {});
    window.action("Library");
    auto *dock = window.findChild<QDockWidget *>("library-dock");
    QVERIFY(dock);
    QTRY_VERIFY(dock->isVisible());
    auto *panel = qobject_cast<QQuickWidget *>(dock->widget());
    QVERIFY(panel && panel->rootObject());
    auto *library = qobject_cast<node_editor::LibraryBrowser *>(panel->rootObject()->property("library").value<QObject *>());
    QVERIFY(library);
    QTRY_COMPARE(library->assetModel()->count(), 2);
    auto *grid = panel->rootObject()->findChild<QQuickItem *>("library-grid");
    auto *missing = panel->rootObject()->findChild<QQuickItem *>("library-missing");
    QVERIFY(grid && missing);
    QVERIFY(!missing->isVisible());
    grid->setProperty("selectedId", "folder-1");
    QVERIFY(!missing->isVisible());
    grid->setProperty("selectedId", "image-1");
    QTRY_VERIFY(missing->isVisible());
    QCOMPARE(missing->property("message").toString(),
             QString("<b>Missing</b><br>The file is not where this asset expects it. Relink it to the file's new location, or remove the asset."));
    QCOMPARE(missing->property("actionText").toString(), QString("Relink"));
    auto *dialog = panel->rootObject()->findChild<QObject *>("library-relink-dialog");
    QVERIFY(dialog);
    QMetaObject::invokeMethod(missing, "actionTriggered");
    QCOMPARE(dialog->property("assetId").toString(), QString("image-1"));
    QMetaObject::invokeMethod(dialog, "close");
    // The server refuses a file outside its roots and says why.
    http.relinkStatus = 403;
    http.relinkBody = R"({"error":{"message":"External assets are not available on this server"}})";
    library->relink("image-1", QUrl::fromLocalFile("/media/cat.png"));
    auto *failure = panel->rootObject()->findChild<QQuickItem *>("library-relink-error");
    QVERIFY(failure);
    QTRY_VERIFY(failure->isVisible());
    QCOMPARE(library->relinkError(), QString("Relink failed: External assets are not available on this server"));
    QCOMPARE(http.relinks.last(), (QJsonObject{{"id", "image-1"}, {"path", "/media/cat.png"}}));
    // A relinked file is back, and the list says so.
    http.relinkStatus = 200;
    http.relinkBody = R"({"result":{"data":{"id":"image-1"}}})";
    http.offline = false;
    const auto lists = http.parents.size();
    library->relink("image-1", QUrl::fromLocalFile("/media/cat.png"));
    QTRY_VERIFY(http.parents.size() > lists);
    QTRY_VERIFY(!missing->isVisible());
    QVERIFY(!failure->isVisible());
  }
  void railOpensTheLibraryGrid() {
    LibraryHttp http;
    EditorWindow window;
    window.resize(1400, 900);
    window.show();
    window.session()->connectToServer(http.url(), {});
    window.action("Library");
    auto *dock = window.findChild<QDockWidget *>("library-dock");
    QVERIFY(dock);
    QTRY_VERIFY(dock->isVisible());
    QVERIFY(window.libraryVisible());
    auto *panel = qobject_cast<QQuickWidget *>(dock->widget());
    QVERIFY(panel && panel->rootObject());
    auto *grid = panel->rootObject()->findChild<QQuickItem *>("library-grid");
    QVERIFY2(grid, "NodeTool.Media AssetGrid did not load");
    auto *library = qobject_cast<node_editor::LibraryBrowser *>(panel->rootObject()->property("library").value<QObject *>());
    QVERIFY(library);
    QTRY_VERIFY2(library->assetModel()->count() == 2, qPrintable(QString("configured=%1 error=%2 requests=%3").arg(library->configured()).arg(library->error()).arg(http.parents.join(','))));
    QTRY_VERIFY2(findItem(panel->rootObject(), "libraryAsset_image-1"), qPrintable(QString("grid %1x%2 panel %3x%4").arg(grid->width()).arg(grid->height()).arg(panel->width()).arg(panel->height())));
    for (const auto *name : {"library-search", "library-type-filter", "library-filters", "library-create-folder", "library-import", "library-tile-size"})
      QVERIFY2(panel->rootObject()->findChild<QQuickItem *>(name), name);
    // A tile drag leaves the panel as the canvas asset payload.
    auto *tile = findItem(panel->rootObject(), "libraryAsset_image-1");
    QVERIFY(tile->property("externalDrag").toBool());
    QSignalSpy drags(library, &node_editor::LibraryBrowser::dragStarted);
    for (int attempt = 0; attempt < 2; ++attempt) {
      const auto start = tile->mapToScene(QPointF(tile->width() / 2, tile->height() / 2)).toPoint();
      // QTest::mouseMove sends no pressed button to a widget, so the events are built here.
      const auto send = [panel](QEvent::Type type, QPoint at, Qt::MouseButtons buttons) {
        QMouseEvent event(type, at, panel->mapToGlobal(at), type == QEvent::MouseMove ? Qt::NoButton : Qt::LeftButton, buttons, {});
        QApplication::sendEvent(panel, &event);
      };
      send(QEvent::MouseButtonPress, start, Qt::LeftButton);
      for (int step = 1; step <= 6; ++step) { send(QEvent::MouseMove, start + QPoint(step * 8, 0), Qt::LeftButton); QTest::qWait(10); }
      send(QEvent::MouseButtonRelease, start + QPoint(48, 0), Qt::NoButton);
      QTRY_VERIFY2(drags.size() == attempt + 1, qPrintable(QString("attempt %1 drags %2").arg(attempt).arg(drags.size())));
      QCOMPARE(drags.last().first().toString(), QString("image-1"));
    }
    window.action("Library");
    QTRY_VERIFY(!dock->isVisible());
  }
};
QTEST_MAIN(LibraryPanelTest)
#include "LibraryPanelTest.moc"
