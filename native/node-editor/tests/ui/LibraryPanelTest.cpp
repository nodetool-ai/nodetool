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
  LibraryHttp() {
    server.listen(QHostAddress::LocalHost);
    connect(&server, &QTcpServer::newConnection, this, [this] {
      while (server.hasPendingConnections()) {
        auto *socket = server.nextPendingConnection(); socket->setParent(this);
        connect(socket, &QTcpSocket::readyRead, this, [this, socket] {
          const auto bytes = socket->property("bytes").toByteArray() + socket->readAll();
          socket->setProperty("bytes", bytes);
          if (bytes.indexOf("\r\n\r\n") < 0 || socket->property("done").toBool()) return;
          socket->setProperty("done", true);
          const QUrl target(QString::fromUtf8(bytes.split(' ').value(1)));
          QJsonObject result;
          if (target.path() == "/trpc/assets.list" || target.path() == "/trpc/assets.search") {
            const bool search = target.path().endsWith("search");
            const auto input = QJsonDocument::fromJson(QUrlQuery(target).queryItemValue("input", QUrl::FullyDecoded).toUtf8()).object();
            const auto parent = input["parent_id"].toString();
            parents.append(search ? "search:" + input["query"].toString() : parent);
            const QJsonArray home{
              QJsonObject{{"id", "image-1"}, {"name", "cat.png"}, {"content_type", "image/png"}, {"parent_id", "user-1"}, {"created_at", "2026-01-02"}},
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
    QVERIFY(window.property("libraryVisible").toBool());
    auto *panel = qobject_cast<QQuickWidget *>(dock->widget());
    QVERIFY(panel && panel->rootObject());
    auto *grid = panel->rootObject()->findChild<QQuickItem *>("library-grid");
    QVERIFY2(grid, "NodeTool.Media AssetGrid did not load");
    auto *library = qobject_cast<node_editor::LibraryBrowser *>(panel->rootContext()->contextProperty("libraryBrowser").value<QObject *>());
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
