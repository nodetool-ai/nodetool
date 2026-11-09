#include "../../src/server/WorkflowBrowser.h"
#include <QJsonDocument>
#include <QJsonObject>
#include <QPointer>
#include <QTcpServer>
#include <QTcpSocket>
#include <QUrlQuery>
#include <QtTest>
using namespace nodetool::node_editor;
class Fixture final : public QTcpServer {
public:
  QList<QByteArray> requests;
  std::function<QByteArray(QByteArray)> respond;
  Fixture() {
    listen(QHostAddress::LocalHost);
    connect(this, &QTcpServer::newConnection, this, [this] {
      auto socket = nextPendingConnection();
      socket->setParent(this);
      // native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
      auto buffer = std::make_shared<QByteArray>();
      // native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
      auto served = std::make_shared<bool>(false);
      connect(socket, &QTcpSocket::readyRead, this, [this, socket, buffer, served] {
        *buffer += socket->readAll();
        const auto split = buffer->indexOf("\r\n\r\n");
        if (*served || split < 0) { return; }
        int length = 0;
        for (const auto &line : buffer->left(split).split('\n')) {
          if (line.toLower().startsWith("content-length:")) { length = line.mid(15).trimmed().toInt(); }
        }
        if (buffer->size() < split + 4 + length) { return; }
        *served = true;
        requests.append(*buffer);
        if (!respond) { return; }
        const auto body = respond(*buffer);
        if (body.isNull()) { return; }
        socket->write("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: " + QByteArray::number(body.size()) + "\r\n\r\n" + body);
        socket->disconnectFromHost();
      });
    });
  }
  QUrl url() const { return QUrl(QString("http://127.0.0.1:%1").arg(serverPort())); }
};
class Tests final : public QObject {
  Q_OBJECT
private slots:
  void configurationClearsScopeAndDisconnects() {
    Fixture server;
    server.respond = [](QByteArray) { return QByteArray(R"({"workflows":[{"id":"a","name":"Alpha"}],"next":"next"})"); };
    WorkflowBrowser browser;
    browser.configure(server.url(), "secret");
    browser.setProjectId("old-project");
    QTRY_VERIFY(!browser.loading());
    browser.setSearch("Alpha");
    QVERIFY(!browser.rows().isEmpty());
    browser.configure(QUrl("http://localhost:7778"));
    QVERIFY(browser.projectId().isEmpty());
    QVERIFY(browser.search().isEmpty());
    QVERIFY(browser.rows().isEmpty());
    QVERIFY(!browser.hasNext());
    browser.configure(QUrl{});
    QVERIFY(browser.error().isEmpty());
    QVERIFY(browser.projects().isEmpty());
    QVERIFY(!browser.loading());
    QVERIFY(!browser.projectsLoading());
    QVERIFY(!browser.busy());
    browser.refresh();
    QVERIFY(browser.error().contains("Connect to a server first"));
  }
  void liveDisposableWorkflow() {
    const auto origin = qEnvironmentVariable("NODETOOL_BROWSER_LIVE_URL");
    if (origin.isEmpty()) { QSKIP("Set NODETOOL_BROWSER_LIVE_URL for the disposable live contract test"); }
    WorkflowBrowser browser;
    browser.configure(QUrl(origin), qEnvironmentVariable("NODETOOL_TOKEN"));
    browser.loadProjects();
    QTRY_VERIFY_WITH_TIMEOUT(!browser.projects().isEmpty() || !browser.error().isEmpty(), 10000);
    QVERIFY2(browser.error().isEmpty(), qPrintable(browser.error()));
    QSignalSpy created(&browser, &WorkflowBrowser::created);
    QSignalSpy renamed(&browser, &WorkflowBrowser::renamed);
    QSignalSpy deleted(&browser, &WorkflowBrowser::deleted);
    browser.createWorkflow("Native browser disposable fixture");
    QTRY_VERIFY_WITH_TIMEOUT(created.count() == 1 || !browser.error().isEmpty(), 10000);
    QVERIFY2(browser.error().isEmpty(), qPrintable(browser.error()));
    const auto id = created.first().first().toString();
    QTRY_VERIFY_WITH_TIMEOUT(!browser.loading(), 10000);
    browser.renameWorkflow(id, "Native browser renamed fixture");
    QTRY_VERIFY_WITH_TIMEOUT(renamed.count() == 1 || !browser.error().isEmpty(), 10000);
    const auto renameError = browser.error();
    QTRY_VERIFY_WITH_TIMEOUT(!browser.loading(), 10000);
    browser.deleteWorkflow(id);
    QTRY_VERIFY_WITH_TIMEOUT(deleted.count() == 1 || !browser.error().isEmpty(), 10000);
    QVERIFY2(browser.error().isEmpty(), qPrintable(browser.error()));
    QVERIFY2(renameError.isEmpty(), qPrintable(renameError));
    QTRY_VERIFY_WITH_TIMEOUT(!browser.loading(), 10000);
  }
  void pagesSearchAndProjects() {
    Fixture server;
    server.respond = [](QByteArray request) {
      if (request.startsWith("GET /trpc/")) { return QByteArray(R"({"result":{"data":[{"id":"p","name":"Project"}]}})"); }
      if (request.contains("cursor=next")) { return QByteArray(R"({"workflows":[{"id":"b","name":"Beta"}],"next":null})"); }
      return QByteArray(R"({"workflows":[{"id":"a","name":"Alpha"}],"next":"next"})");
    };
    WorkflowBrowser browser;
    browser.configure(server.url(), "secret");
    browser.setProjectId("p & one");
    QTRY_VERIFY(!browser.loading());
    QCOMPARE(browser.rows().size(), 1);
    QVERIFY(browser.hasNext());
    QVERIFY(server.requests.first().contains("project_id=p%20%26%20one"));
    QVERIFY(server.requests.first().contains("Authorization: Bearer secret"));
    browser.loadNext();
    QTRY_COMPARE(browser.rows().size(), 2);
    QVERIFY(!browser.hasNext());
    browser.setSearch("BETA");
    QCOMPARE(browser.rows().size(), 1);
    QCOMPARE(browser.rows().first().toMap()["id"].toString(), QString("b"));
    browser.loadProjects();
    QTRY_COMPARE(browser.projects().size(), 1);
  }
  void mutationsPreserveRenameData() {
    Fixture server;
    server.respond = [](QByteArray request) {
      if (request.startsWith("GET /api/workflows/a ")) {
        return QByteArray(R"({"id":"a","name":"Before","updated_at":"revision","description":"Keep","access":"public","graph":{"nodes":[],"edges":[]},"tags":["keep"]})");
      }
      if (request.startsWith("GET ")) { return QByteArray(R"({"workflows":[],"next":null})"); }
      return QByteArray(R"({"id":"a"})");
    };
    WorkflowBrowser browser;
    browser.configure(server.url());
    QSignalSpy created(&browser, &WorkflowBrowser::created);
    QSignalSpy renamed(&browser, &WorkflowBrowser::renamed);
    QSignalSpy deleted(&browser, &WorkflowBrowser::deleted);
    browser.createWorkflow("New");
    QTRY_COMPARE(created.count(), 1);
    QTRY_VERIFY(!browser.loading());
    browser.renameWorkflow("a", "After");
    QTRY_COMPARE(renamed.count(), 1);
    QTRY_VERIFY(!browser.loading());
    QByteArray update;
    for (const auto &request : server.requests) { if (request.startsWith("PUT ")) { update = request; } }
    QVERIFY(!update.isEmpty());
    const auto body = QJsonDocument::fromJson(update.mid(update.indexOf("\r\n\r\n") + 4)).object();
    QCOMPARE(body["name"].toString(), QString("After"));
    QCOMPARE(body["description"].toString(), QString("Keep"));
    QCOMPARE(body["access"].toString(), QString("public"));
    QCOMPARE(body["expected_updated_at"].toString(), QString("revision"));
    QVERIFY(body["graph"].isObject());
    browser.deleteWorkflow("a");
    QTRY_COMPARE(deleted.count(), 1);
    QTRY_VERIFY(!browser.loading());
  }
  void paginationCycleStopsAndRefreshRecovers() {
    Fixture server;
    server.respond = [](QByteArray request) {
      if (request.contains("cursor=second")) {
        return QByteArray(R"({"workflows":[{"id":"c","name":"Gamma"}],"next":"first"})");
      }
      if (request.contains("cursor=first")) {
        return QByteArray(R"({"workflows":[{"id":"b","name":"Beta"}],"next":"second"})");
      }
      return QByteArray(R"({"workflows":[{"id":"a","name":"Alpha"}],"next":"first"})");
    };
    WorkflowBrowser browser;
    browser.configure(server.url());
    browser.refresh();
    QTRY_VERIFY(!browser.loading());
    browser.loadNext();
    QTRY_COMPARE(browser.rows().size(), 2);
    browser.loadNext();
    QTRY_VERIFY(!browser.loading());
    QVERIFY(browser.error().contains("pagination cursor"));
    QCOMPARE(browser.rows().size(), 2);
    QVERIFY(!browser.hasNext());
    const auto requestCount = server.requests.size();
    browser.loadNext();
    QCOMPARE(server.requests.size(), requestCount);
    browser.refresh();
    QTRY_VERIFY(!browser.loading());
    QVERIFY(browser.error().isEmpty());
    QCOMPARE(browser.rows().size(), 1);
    QVERIFY(browser.hasNext());
  }
  void switchingServerCancelsStaleReply() {
    Fixture oldServer, newServer;
    oldServer.respond = [](QByteArray) { return QByteArray(); };
    newServer.respond = [](QByteArray) { return QByteArray(R"({"workflows":[{"id":"new","name":"New"}],"next":null})"); };
    WorkflowBrowser browser;
    browser.configure(oldServer.url(), "old-secret");
    browser.refresh();
    QTRY_COMPARE(oldServer.requests.size(), 1);
    browser.configure(newServer.url(), "new-secret");
    browser.refresh();
    QTRY_VERIFY(!browser.loading());
    QCOMPARE(browser.rows().first().toMap()["id"].toString(), QString("new"));
    QVERIFY(newServer.requests.first().contains("new-secret"));
    QVERIFY(!newServer.requests.first().contains("old-secret"));
    QVERIFY(browser.error().isEmpty());
  }
  void invalidResponseAndRetry() {
    Fixture server;
    server.respond = [](QByteArray) { return QByteArray("{}"); };
    WorkflowBrowser browser;
    browser.configure(server.url());
    browser.refresh();
    QTRY_VERIFY(!browser.error().isEmpty());
    QVERIFY(!browser.loading());
    server.respond = [](QByteArray) { return QByteArray(R"({"workflows":[],"next":null})"); };
    browser.refresh();
    QTRY_VERIFY(!browser.loading());
    QVERIFY(browser.error().isEmpty());
    browser.configure(QUrl("http://example.com"), "secret");
    QVERIFY(browser.error().contains("HTTPS"));
    QVERIFY(!browser.error().contains("secret"));
  }
};
QTEST_GUILESS_MAIN(Tests)
#include "WorkflowBrowserTests.moc"
