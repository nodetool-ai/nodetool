#include "../../src/server/WorkflowBrowser.h"
#include <QJsonArray>
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
        // A body that is a whole response, such as an error status, goes out as it is.
        if (body.startsWith("HTTP/1.1 ")) { socket->write(body); socket->disconnectFromHost(); return; }
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
  void datesAndCopyNamesFollowTheWeb() {
    const auto now = QDateTime::fromString("2026-11-13T12:00:00Z", Qt::ISODate);
    QCOMPARE(WorkflowBrowser::dayGroup(now.addSecs(-3600), now), QString("Today"));
    QCOMPARE(WorkflowBrowser::dayGroup(QDateTime::fromString("2026-11-12T23:59:00Z", Qt::ISODate), now), QString("Yesterday"));
    QCOMPARE(WorkflowBrowser::dayGroup(now.addDays(-3), now), QString("3 days ago"));
    QCOMPARE(WorkflowBrowser::dayGroup(now.addDays(-8), now), QString("1 week ago"));
    QCOMPARE(WorkflowBrowser::dayGroup(now.addDays(-20), now), QString("2 weeks ago"));
    QCOMPARE(WorkflowBrowser::dayGroup(now.addMonths(-2), now), QString("2 months ago"));
    QCOMPARE(WorkflowBrowser::dayGroup(now.addYears(-1), now), QString("1 year ago"));
    QCOMPARE(WorkflowBrowser::relativeDate(now.addSecs(-2), now), QString("now"));
    QCOMPARE(WorkflowBrowser::relativeDate(now.addSecs(-90), now), QString("1 minute ago"));
    QCOMPARE(WorkflowBrowser::relativeDate(now.addSecs(-3 * 3600), now), QString("3 hours ago"));
    QCOMPARE(WorkflowBrowser::relativeDate(now.addDays(-1), now), QString("yesterday"));
    QCOMPARE(WorkflowBrowser::relativeDate(now.addDays(-8), now), QString("last week"));
    QCOMPARE(WorkflowBrowser::relativeDate(now.addDays(-70), now), QString("2 months ago"));
    QCOMPARE(WorkflowBrowser::nextCopyName("Poster", {"Poster", "Poster (2)", "Other (7)"}), QString("Poster (3)"));
    QCOMPARE(WorkflowBrowser::nextCopyName("Poster (2)", {"Poster (2)"}), QString("Poster (3)"));
    QCOMPARE(WorkflowBrowser::nextCopyName("a.b", {"axb (4)"}), QString("a.b (1)"));
  }
  void filtersSortAndGroups() {
    Fixture server;
    server.respond = [](QByteArray) {
      return QByteArray(R"({"workflows":[
        {"id":"old","name":"Beta","updated_at":"2026-11-01T10:00:00Z","tags":["image","video"]},
        {"id":"new","name":"alpha","updated_at":"2026-11-13T09:00:00Z","tags":["image"]},
        {"id":"mid","name":"Gamma","updated_at":"2026-11-12T09:00:00Z"}],"next":null})");
    };
    WorkflowBrowser browser;
    browser.configure(server.url());
    browser.setNow(QDateTime::fromString("2026-11-13T12:00:00Z", Qt::ISODate));
    browser.refresh();
    QTRY_VERIFY(!browser.loading());
    const auto ids = [&] {
      QStringList result;
      for (const auto &row : browser.rows()) { result.append(row.toMap()["id"].toString()); }
      return result;
    };
    QCOMPARE(ids(), QStringList({"new", "mid", "old"}));
    QCOMPARE(browser.rows()[0].toMap()["group"].toString(), QString("Today"));
    QCOMPARE(browser.rows()[1].toMap()["group"].toString(), QString("Yesterday"));
    QCOMPARE(browser.rows()[2].toMap()["group"].toString(), QString("1 week ago"));
    browser.setSortBy("name");
    QCOMPARE(ids(), QStringList({"new", "old", "mid"}));
    QVERIFY(browser.rows()[0].toMap()["group"].toString().isEmpty());
    QCOMPARE(browser.rows()[0].toMap()["updatedLabel"].toString(), QString("3 hours ago"));
    QCOMPARE(browser.availableTags(), QStringList({"image", "video"}));
    browser.toggleTag("image");
    QCOMPARE(ids(), QStringList({"new", "old"}));
    browser.toggleTag("video");
    QCOMPARE(ids(), QStringList({"old"}));
    browser.clearTags();
    browser.toggleFavorite("mid");
    QVERIFY(browser.isFavorite("mid"));
    browser.setFavoritesOnly(true);
    QCOMPARE(ids(), QStringList({"mid"}));
    QVERIFY(browser.rows()[0].toMap()["favorite"].toBool());
    browser.setFavoritesOnly(false);
    QCOMPARE(browser.loadedCount(), 3);
    browser.setCurrentId("old");
    browser.setSelectionMode(true);
    browser.toggleSelected("new");
    for (const auto &row : browser.rows()) {
      const auto map = row.toMap();
      QCOMPARE(map["current"].toBool(), map["id"] == "old");
      QCOMPARE(map["selected"].toBool(), map["id"] == "new");
    }
    QSignalSpy confirm(&browser, &WorkflowBrowser::deleteSelectedRequested);
    browser.confirmDeleteSelected();
    QCOMPARE(confirm.first().first().toStringList(), QStringList({"new"}));
    browser.setSelectionMode(false);
    QVERIFY(browser.selectedIds().isEmpty());
  }
  void duplicateEditAndBulkDelete() {
    Fixture server;
    server.respond = [](QByteArray request) {
      if (request.startsWith("GET /api/workflows/a ")) {
        return QByteArray(R"({"id":"a","name":"Poster","updated_at":"revision","description":"Keep","access":"public","graph":{"nodes":[{"id":"n"}],"edges":[]},"tags":["keep"],"run_mode":"chat","project_id":"p"})");
      }
      if (request.startsWith("GET /trpc/jobs.triggersRunning")) {
        return QByteArray(R"({"result":{"data":{"triggers":[
          {"workflow_id":"a","enabled":true,"last_error":null,"disabled_reason":null},
          {"workflow_id":"b","enabled":false,"last_error":null,"disabled_reason":"expired"}]}}})");
      }
      if (request.startsWith("GET ")) { return QByteArray(R"j({"workflows":[{"id":"a","name":"Poster"},{"id":"b","name":"Poster (1)"}],"next":null})j"); }
      if (request.startsWith("DELETE /api/workflows/bad")) {
        return QByteArray("HTTP/1.1 500 Internal Server Error\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
      }
      if (request.startsWith("POST ")) { return QByteArray(R"({"id":"copy"})"); }
      return QByteArray(R"({"id":"a"})");
    };
    WorkflowBrowser browser;
    browser.configure(server.url());
    browser.refresh();
    QTRY_VERIFY(!browser.loading());
    browser.loadTriggers();
    QTRY_VERIFY(browser.rows()[1].toMap()["trigger"].toMap()["failing"].toBool());
    QCOMPARE(browser.rows()[0].toMap()["trigger"].toMap()["label"].toString(), QString("Trigger armed"));
    QSignalSpy created(&browser, &WorkflowBrowser::created);
    browser.duplicateWorkflow("a");
    QTRY_COMPARE(created.count(), 1);
    QCOMPARE(created.first().first().toString(), QString("copy"));
    QTRY_VERIFY(!browser.loading());
    const auto body = [&](const QByteArray &method) {
      QByteArray found;
      for (const auto &request : server.requests) { if (request.startsWith(method)) { found = request; } }
      return QJsonDocument::fromJson(found.mid(found.indexOf("\r\n\r\n") + 4)).object();
    };
    const auto copy = body("POST ");
    QCOMPARE(copy["name"].toString(), QString("Poster (2)"));
    QCOMPARE(copy["access"].toString(), QString("private"));
    QCOMPARE(copy["description"].toString(), QString("Keep"));
    QCOMPARE(copy["run_mode"].toString(), QString("chat"));
    QCOMPARE(copy["project_id"].toString(), QString("p"));
    QCOMPARE(copy["graph"].toObject()["nodes"].toArray().size(), 1);
    QSignalSpy renamed(&browser, &WorkflowBrowser::renamed);
    browser.updateWorkflow("a", {{"description", "New"}, {"tags", QStringList{"x", "y"}}, {"graph", "ignored"}});
    QTRY_COMPARE(renamed.count(), 1);
    QTRY_VERIFY(!browser.loading());
    const auto update = body("PUT ");
    QCOMPARE(update["description"].toString(), QString("New"));
    QCOMPARE(update["tags"].toArray().size(), 2);
    QCOMPARE(update["name"].toString(), QString("Poster"));
    QCOMPARE(update["expected_updated_at"].toString(), QString("revision"));
    QCOMPARE(update["graph"].toObject()["nodes"].toArray().size(), 1);
    QSignalSpy deleted(&browser, &WorkflowBrowser::deleted);
    browser.deleteWorkflows({"a", "bad", "b"});
    QTRY_COMPARE(deleted.count(), 2);
    QTRY_VERIFY(!browser.busy() && !browser.loading());
    QVERIFY(browser.error().contains("1 workflow"));
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
