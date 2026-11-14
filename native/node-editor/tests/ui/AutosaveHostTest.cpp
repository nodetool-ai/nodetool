#include "ui/EditorWindow.h"
#include <QApplication>
#include <QFile>
#include <QTimer>
#include <QJsonDocument>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QTcpServer>
#include <QTcpSocket>
#include <QTemporaryDir>
#include <QtTest>
using namespace nodetool;
class AutosaveHttp final : public QObject {
public:
  QTcpServer server;
  int writes = 0, puts = 0;
  QJsonObject workflow{{"id", "same-id"}, {"name", "Server copy"}, {"updated_at", "r1"},
    {"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{{"id", "comment"},
      {"type", "nodetool.workflows.base_node.Comment"}, {"data", QJsonObject{{"comment", "Server"}}},
      {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 0}, {"y", 0}}}}}}}}, {"edges", QJsonArray{}}}}};
  AutosaveHttp() {
    server.listen(QHostAddress::LocalHost);
    connect(&server, &QTcpServer::newConnection, this, [this] {
      while (server.hasPendingConnections()) {
        auto *socket = server.nextPendingConnection(); socket->setParent(this);
        connect(socket, &QTcpSocket::readyRead, this, [this, socket] {
          const auto bytes = socket->property("bytes").toByteArray() + socket->readAll();
          socket->setProperty("bytes", bytes);
          const auto end = bytes.indexOf("\r\n\r\n");
          if (end < 0 || socket->property("done").toBool()) return;
          int length = 0;
          for (const auto &line : bytes.left(end).split('\n'))
            if (line.toLower().startsWith("content-length:")) length = line.mid(15).trimmed().toInt();
          if (bytes.size() < end + 4 + length) return;
          socket->setProperty("done", true);
          const auto target = bytes.split(' ').value(1);
          QJsonObject result;
          if (target == "/api/workflows/same-id" && bytes.startsWith("PUT")) {
            ++puts;
            const auto body = QJsonDocument::fromJson(bytes.mid(end + 4, length)).object();
            workflow["graph"] = body["graph"]; workflow["updated_at"] = QString("p%1").arg(puts);
            result = workflow;
          } else if (target == "/api/workflows/same-id") result = workflow;
          else if (target == "/trpc/workflows.autosave") {
            ++writes;
            const auto body = QJsonDocument::fromJson(bytes.mid(end + 4, length)).object();
            workflow["graph"] = body["graph"]; workflow["updated_at"] = QString("r%1").arg(writes + 1);
            result = {{"result", QJsonObject{{"data", QJsonObject{{"updated_at", workflow["updated_at"]}, {"skipped", false}}}}}};
          } else if (target.startsWith("/trpc/assets.list")) {
            result = {{"result", QJsonObject{{"data", QJsonObject{{"assets", QJsonArray{}}, {"next", QJsonValue::Null}}}}}};
          } else if (target.startsWith("/api/nodes/metadata")) result = {{"nodes", QJsonArray{}}};
          const auto data = QJsonDocument(result).toJson(QJsonDocument::Compact);
          socket->write("HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: " + QByteArray::number(data.size()) + "\r\n\r\n" + data);
          socket->disconnectFromHost();
        });
      }
    });
  }
  QUrl url() const { return QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())); }
};
class AutosaveHostTest final : public QObject {
  Q_OBJECT
  static void writeFile(const QString &path, const QByteArray &bytes) {
    QFile file(path); QVERIFY(file.open(QIODevice::WriteOnly)); QCOMPARE(file.write(bytes), bytes.size());
  }
  static bool moveComment(EditorWindow &window) {
    return bool(window.document()->applyCommand({{"op", "setNodeField"}, {"id", "comment"}, {"field", "ui_properties"},
      {"value", QJsonObject{{"position", QJsonObject{{"x", 150}, {"y", 80}}}}}}));
  }
private slots:
  void sameIdLocalFileDetachesAutosave() {
    AutosaveHttp http; EditorWindow window;
    window.session()->setAutosaveDelay(10);
    window.session()->connectToServer(http.url(), {}); window.session()->openWorkflow("same-id");
    QTRY_VERIFY(window.session()->serverBound());
    QTRY_COMPARE(window.document()->snapshot()["id"].toString(), QString("same-id"));
    QVERIFY(window.document()->undoStack()->isClean());
    QTemporaryDir dir; QVERIFY(dir.isValid()); const auto path = dir.filePath("same-id.json");
    auto local = http.workflow; local["name"] = "Local same-id copy";
    writeFile(path, QJsonDocument(local).toJson());
    QVERIFY(window.openFile(path));
    QVERIFY(!window.session()->serverBound()); QCOMPARE(window.localFilePath(), path);
    QVERIFY(moveComment(window)); const auto changed = window.document()->snapshot();
    window.session()->flushAutosave(); QTest::qWait(80);
    QCOMPARE(http.writes, 0); QCOMPARE(http.workflow["name"].toString(), QString("Server copy"));
    QCOMPARE(window.document()->snapshot(), changed); QVERIFY(window.session()->dirty());
    QCOMPARE(window.document()->undoStack()->index(), 1);
    window.document()->undo(); QCOMPARE(window.document()->snapshot(), local);
  }
  void invalidFilePreservesBindingAndAutosave() {
    AutosaveHttp http; EditorWindow window;
    window.session()->setAutosaveDelay(10);
    window.session()->connectToServer(http.url(), {}); window.session()->openWorkflow("same-id");
    QTRY_VERIFY(window.session()->serverBound());
    QTRY_COMPARE(window.document()->snapshot()["id"].toString(), QString("same-id"));
    const auto original = window.document()->snapshot(); const auto undo = window.document()->undoStack()->index();
    QTemporaryDir dir; QVERIFY(dir.isValid()); const auto path = dir.filePath("invalid.json");
    writeFile(path, "{ invalid JSON");
    QVERIFY(!window.openFile(path)); QVERIFY(window.session()->serverBound());
    QCOMPARE(window.document()->snapshot(), original); QCOMPARE(window.document()->undoStack()->index(), undo);
    QVERIFY(window.localFilePath().isEmpty());
    QVERIFY(moveComment(window)); const QJsonValue graph = window.document()->snapshot()["graph"];
    QTRY_COMPARE(http.writes, 1); QTRY_VERIFY(!window.session()->saving());
    QVERIFY(!window.session()->dirty()); QCOMPARE(http.workflow["graph"], graph);
    QCOMPARE(window.document()->snapshot()["graph"], graph);
    QCOMPARE(window.document()->undoStack()->index(), undo + 1);
  }
    void editBeforeAutosaveResponseKeepsEditAndUndo() {
        AutosaveHttp http;
        EditorWindow window;
        window.session()->setAutosaveDelay(60000);
        window.session()->connectToServer(http.url(), {});
        window.session()->openWorkflow("same-id");
        QTRY_VERIFY(window.session()->serverBound());
        QVERIFY(moveComment(window));
        QCoreApplication::processEvents();
        const QJsonValue before = window.document()->snapshot()["graph"];
        const int undo = window.document()->undoStack()->index();
        bool edited = false;
        QJsonValue latest;
        auto *network = window.session()->findChild<QNetworkAccessManager *>();
        QVERIFY(network);
        // QNetworkAccessManager emits finished before the session's reply
        // callback. This puts the edit and workflowChanged in the same turn,
        // with no opportunity for a queued document sync between them.
        connect(network, &QNetworkAccessManager::finished, &window, [&](QNetworkReply *reply) {
            if (reply->url().path() != "/trpc/workflows.autosave" || edited) {
                return;
            }
            edited = true;
            QVERIFY(window.document()->applyCommand({{"op", "addNode"}, {"node", QJsonObject{
                {"id", "latest"}, {"type", "nodetool.workflows.base_node.Comment"}}}}));
            latest = window.document()->snapshot()["graph"];
        });
        QSignalSpy changes(window.session(), &node_editor::WorkflowSession::workflowChanged);
        window.session()->flushAutosave();
        QTRY_VERIFY(edited);
        QTRY_VERIFY(!window.session()->saving());
        QVERIFY(!changes.isEmpty());
        QCOMPARE(window.document()->snapshot()["graph"], latest);
        QCOMPARE(window.session()->workflow()["graph"], latest);
        QVERIFY(window.session()->dirty());
        QCOMPARE(window.document()->undoStack()->index(), undo + 1);
        window.document()->undo();
        QCOMPARE(window.document()->snapshot()["graph"], before);
        QCOMPARE(window.document()->undoStack()->index(), undo);
    }
    void editThenOpenInSameTurnBindsWorkflow() {
        AutosaveHttp http;
        EditorWindow window;
        window.session()->connectToServer(http.url(), {});
        QVERIFY(window.document()->applyCommand({{"op", "addNode"}, {"node", QJsonObject{
            {"id", "local"}, {"type", "nodetool.workflows.base_node.Comment"}}}}));
        window.session()->openWorkflow("same-id");
        QTRY_VERIFY(window.session()->serverBound());
        QCOMPARE(window.document()->snapshot()["graph"], http.workflow["graph"]);
        QVERIFY(window.document()->node("local").isEmpty());
        QCOMPARE(window.document()->undoStack()->index(), 0);
        QVERIFY(!window.session()->dirty());
    }
    void editDuringOpenKeepsLocalWorkflow() {
        AutosaveHttp http;
        EditorWindow window;
        window.session()->connectToServer(http.url(), {});
        bool edited = false;
        auto *network = window.session()->findChild<QNetworkAccessManager *>();
        QVERIFY(network);
        connect(network, &QNetworkAccessManager::finished, &window, [&](QNetworkReply *reply) {
            if (reply->url().path() != "/api/workflows/same-id" || edited) {
                return;
            }
            edited = true;
            QVERIFY(window.document()->applyCommand({{"op", "addNode"}, {"node", QJsonObject{
                {"id", "local"}, {"type", "nodetool.workflows.base_node.Comment"}}}}));
        });
        window.session()->openWorkflow("same-id");
        QTRY_VERIFY(edited);
        QCoreApplication::processEvents();
        QVERIFY(!window.session()->serverBound());
        QVERIFY(!window.document()->node("local").isEmpty());
        QCOMPARE(window.document()->undoStack()->index(), 1);
        QVERIFY(window.session()->dirty());
    }
  void editThenFlushInSameTurnSavesEdit() {
    AutosaveHttp http; EditorWindow window;
    window.session()->setAutosaveDelay(60000);
    window.session()->connectToServer(http.url(), {}); window.session()->openWorkflow("same-id");
    QTRY_VERIFY(window.session()->serverBound());
    QTRY_COMPARE(window.document()->snapshot()["id"].toString(), QString("same-id"));
    // A flush in the same turn, as on close, must send the live edit.
    QVERIFY(moveComment(window)); const QJsonValue graph = window.document()->snapshot()["graph"];
    window.session()->flushAutosave();
    QTRY_COMPARE(http.writes, 1); QTRY_VERIFY(!window.session()->saving());
    QCOMPARE(http.workflow["graph"], graph);
  }
  // Save (Ctrl+S) on a server workflow saves to the server, not to a local file.
  void saveOnServerWorkflowSavesToServer() {
    AutosaveHttp http; EditorWindow window;
    window.session()->setAutosaveDelay(60000);
    window.session()->connectToServer(http.url(), {}); window.session()->openWorkflow("same-id");
    QTRY_VERIFY(window.session()->serverBound());
    QTRY_COMPARE(window.document()->snapshot()["id"].toString(), QString("same-id"));
    QVERIFY(moveComment(window)); const QJsonValue graph = window.document()->snapshot()["graph"];
    bool dialog = false;
    QTimer watcher; watcher.setInterval(20);
    connect(&watcher, &QTimer::timeout, &window, [&dialog] {
      if (auto *modal = QApplication::activeModalWidget()) { dialog = true; modal->close(); }
    });
    watcher.start();
    window.action("Save");
    QTRY_COMPARE(http.puts, 1); QTRY_VERIFY(!window.session()->saving());
    QVERIFY(!dialog); QVERIFY(window.localFilePath().isEmpty());
    QCOMPARE(http.workflow["graph"], graph); QVERIFY(!window.session()->dirty());
  }
};
QTEST_MAIN(AutosaveHostTest)
#include "AutosaveHostTest.moc"
