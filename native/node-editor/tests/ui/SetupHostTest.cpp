#include "graph/EditorScene.h"
#include "server/MsgPack.h"
#include "ui/EditorWindow.h"
#include <QDir>
#include <QJsonDocument>
#include <QQuickItem>
#include <QQuickWidget>
#include <QQuickWindow>
#include <QSettings>
#include <QTcpServer>
#include <QTcpSocket>
#include <QTemporaryDir>
#include <QWebSocket>
#include <QWebSocketServer>
#include <QtTest>
using namespace nodetool;
namespace {
QJsonArray metadata() {
    return {
        QJsonObject{{"node_type", "nodetool.input.StringInput"},
                    {"title", "String Input"},
                    {"required_runtimes", QJsonArray{"python"}},
                    {"outputs", QJsonArray{QJsonObject{
                                    {"name", "output"},
                                    {"type", QJsonObject{{"type", "str"}}}}}}},
        QJsonObject{
            {"node_type", "nodetool.output.Output"},
            {"title", "Output"},
            {"properties",
             QJsonArray{QJsonObject{{"name", "value"},
                                    {"type", QJsonObject{{"type", "str"}}}}}}}};
}
class Server : public QTcpServer {
public:
    QWebSocketServer websocket{"setup", QWebSocketServer::NonSecureMode};
    bool savedWorkflows = false, delayList = false;
    QList<QPointer<QTcpSocket>> lists;
    bool fail = false, delay = false, enabled = false;
    int mutations = 0;
    QJsonObject created;
    QList<QPointer<QTcpSocket>> pending;
    Server() {
        listen(QHostAddress::LocalHost);
        connect(this, &QTcpServer::newConnection, this, [this] {
            while (hasPendingConnections()) {
                auto socket = nextPendingConnection();
                connect(socket, &QTcpSocket::readyRead, this, [this, socket] {
                    if (socket->peek(socket->bytesAvailable()).contains("Upgrade: websocket")) {
                        socket->disconnect(this);
                        websocket.handleConnection(socket);
                        return;
                    }
                    auto bytes = socket->property("bytes").toByteArray() +
                                 socket->readAll();
                    socket->setProperty("bytes", bytes);
                    if (!bytes.contains("\r\n\r\n") ||
                        socket->property("done").toBool()) {
                        return;
                    }
                    socket->setProperty("done", true);
                    const auto route = bytes.split(' ').value(1);
                    QJsonObject data;
                    if (route.startsWith("/trpc/workflows.list")) {
                        if (delayList) {
                            lists.append(socket);
                            return;
                        }
                        data = {{"workflows",
                                 savedWorkflows
                                     ? QJsonArray{QJsonObject{{"id", "saved"}}}
                                     : QJsonArray{}}};
                    } else if (route.startsWith(
                                   "/trpc/packs.runtimeStatuses")) {
                        data = {{"statuses",
                                 QJsonArray{QJsonObject{
                                     {"id", "python"}, {"installed", false}}}}};
                    } else if (route.startsWith(
                                   "/trpc/packs.setBuiltinEnabled")) {
                        ++mutations;
                        if (delay) {
                            pending.append(socket);
                            return;
                        }
                        if (fail) {
                            send(socket, {}, 500);
                            return;
                        }
                        enabled = true;
                        data = packs();
                    } else if (route.startsWith("/trpc/packs.listBuiltins")) {
                        data = packs();
                    } else if (route.startsWith("/trpc/workflows.examples")) {
                        data = {{"workflows",
                                 QJsonArray{QJsonObject{
                                     {"id", "template-seed.json"},
                                     {"package_name", "nodetool-base"},
                                     {"name", "Template"},
                                     {"graph",
                                      QJsonObject{{"nodes", QJsonArray{}},
                                                  {"edges", QJsonArray{}}}}}}}};
                    } else if (route.startsWith("/trpc/workflows.create")) {
                        created = QJsonDocument::fromJson(
                                      bytes.mid(bytes.indexOf("\r\n\r\n") + 4))
                                      .object();
                        data = {{"id", "created-template"}};
                    } else if (route.startsWith("/api/nodes/metadata")) {
                        send(socket, {{"nodes", metadata()}});
                        return;
                    }
                    send(socket, {{"result", QJsonObject{{"data", data}}}});
                });
            }
        });
    }
    QJsonObject packs() const {
        return {{"packs", QJsonArray{QJsonObject{{"id", "test"},
                                                 {"name", "Test provider"},
                                                 {"enabled", enabled},
                                                 {"required", false}}}}};
    }
    static void send(QTcpSocket *socket, QJsonObject body, int status = 200) {
        const auto payload = QJsonDocument(body).toJson(QJsonDocument::Compact);
        socket->write(
            "HTTP/1.1 " + QByteArray::number(status) +
            " OK\r\nContent-Type: application/json\r\nContent-Length: " +
            QByteArray::number(payload.size()) +
            "\r\nConnection: close\r\n\r\n" + payload);
        socket->disconnectFromHost();
    }
    void release() {
        for (auto socket : pending) {
            if (socket) {
                send(socket, {{"result", QJsonObject{{"data", packs()}}}});
            }
        }
        pending.clear();
    }
    QUrl url() const {
        return QUrl(QString("http://127.0.0.1:%1").arg(serverPort()));
    }
};
QQuickItem *find(QQuickItem *item, const QString &name) {
    if (item->objectName() == name) {
        return item;
    }
    for (auto child : item->childItems()) {
        if (auto result = find(child, name)) {
            return result;
        }
    }
    return nullptr;
}
bool click(EditorWindow &window, const QString &name) {
    QCoreApplication::processEvents();
    for (auto host : window.findChildren<QQuickWidget *>()) {
        if (!host->isVisible() || !host->rootObject()) {
            continue;
        }
        auto item = find(host->rootObject(), name);
        if (!item || !item->isVisible() || !item->isEnabled()) {
            continue;
        }
        QTest::mouseClick(
            host->quickWindow(), Qt::LeftButton, Qt::NoModifier,
            item->mapToScene({item->width() / 2, item->height() / 2})
                .toPoint());
        QCoreApplication::processEvents();
        return true;
    }
    return false;
}
} // namespace
class SetupHostTest : public QObject {
    Q_OBJECT
    QTemporaryDir settings_;
private slots:
    void initTestCase() {
        QSettings::setDefaultFormat(QSettings::IniFormat);
        QSettings::setPath(QSettings::IniFormat, QSettings::UserScope,
                           settings_.path());
    }
    void savedWorkflowEligibility() {
        Server server;
        server.delayList = true;
        EditorWindow window;
        window.show();
        QVERIFY(!click(window, "setup-starter"));
        window.session()->connectToServer(server.url(), {}, "one");
        QTRY_COMPARE(server.lists.size(), 1);
        QVERIFY(!click(window, "setup-starter"));
        server.delayList = false;
        server.savedWorkflows = true;
        window.session()->connectToServer(server.url(), {}, "two");
        QTRY_COMPARE(window.activeEditor()->setup()->state(), QString("ready"));
        QTest::qWait(100);
        QVERIFY(!click(window, "setup-starter"));
        Server::send(
            server.lists.takeFirst(),
            {{"result", QJsonObject{{"data", QJsonObject{{"workflows",
                                                          QJsonArray{}}}}}}});
        QTest::qWait(100);
        QVERIFY(!click(window, "setup-starter"));
        window.session()->connectToServer(server.url(), {}, "three");
        server.savedWorkflows = false;
        window.session()->connectToServer(server.url(), {}, "four");
        QTRY_VERIFY(window.activeEditor()->guideVisible());
        QVERIFY(click(window, "setup-choose"));
        QVERIFY(window.catalogVisible());
        QVERIFY(window.activeEditor()->guideStarted());
        QVERIFY(click(window, "setup-guide-close"));
        QVERIFY(!window.activeEditor()->guideVisible());
        window.setCatalog(metadata());
        QTest::qWait(100);
        QVERIFY(!click(window, "setup-starter"));
        window.session()->disconnectFromServer();
        QVERIFY(!window.activeEditor()->guideVisible());
    }
    void guideAndRefresh() {
        Server server;
        EditorWindow window;
        window.session()->connectToServer(server.url(), {}, "one");
        window.resize(1200, 800);
        window.show();
        QTRY_VERIFY(window.activeEditor()->guideVisible());
        const auto capture = qEnvironmentVariable("NODETOOL_SETUP_CAPTURE_DIR");
        if (!capture.isEmpty()) {
            QVERIFY(QDir().mkpath(capture));
            for (bool dark : {true, false}) {
                window.setDarkTheme(dark);
                QTest::qWait(100);
                QVERIFY(window.grab().save(QDir(capture).filePath(
                    dark ? "setup-dark.png" : "setup-light.png")));
            }
        }
        QTRY_VERIFY(window.activeEditor()->guideVisible());
        window.setCatalog(metadata());
        QVERIFY(click(window, "setup-starter"));
        QCOMPARE(window.document()->nodes().size(), 2);
        QCOMPARE(window.document()->edges().size(), 1);
        QVERIFY(window.activeEditor()->guideStarted());
        QTRY_VERIFY(window.activeEditor()->guideVisible());
        QCOMPARE(window.activeEditor()->guideReadiness(),
                 QVariantList({true, true, true, false, false}));
        if (!capture.isEmpty()) {
            for (bool dark : {true, false}) {
                window.setDarkTheme(dark);
                QTest::qWait(100);
                QVERIFY(window.grab().save(
                    QDir(capture).filePath(dark ? "setup-started-dark.png"
                                                : "setup-started-light.png")));
            }
        }
        auto snapshot = window.document()->snapshot();
        const auto undo = window.document()->undoStack()->count();
        window.setCatalog({});
        QCOMPARE(window.document()->snapshot(), snapshot);
        bool missing = false;
        for (auto id : window.scene()->graphModel().allNodeIds()) {
            missing |=
                static_cast<WorkflowGraphModel &>(window.scene()->graphModel())
                    .layout(id)
                    .unknown;
        }
        QVERIFY(missing);
        window.setCatalog(metadata());
        QCOMPARE(window.document()->snapshot(), snapshot);
        QCOMPARE(window.document()->undoStack()->count(), undo);
        for (auto id : window.scene()->graphModel().allNodeIds()) {
            QVERIFY(
                !static_cast<WorkflowGraphModel &>(window.scene()->graphModel())
                     .layout(id)
                     .unknown);
        }
    }
    void liveReadiness() {
        Server http;
        QWebSocketServer ws("setup", QWebSocketServer::NonSecureMode);
        QVERIFY(ws.listen(QHostAddress::LocalHost));
        QPointer<QWebSocket> peer;
        QList<QJsonObject> commands;
        connect(&ws, &QWebSocketServer::newConnection, this, [&] {
            peer = ws.nextPendingConnection();
            peer->setParent(&ws);
            connect(peer, &QWebSocket::binaryMessageReceived, this,
                    [&](const QByteArray &bytes) {
                        const auto decoded = node_editor::decodeMsgPack(bytes);
                        if (decoded) {
                            commands.append(decoded->toObject());
                        }
                    });
        });
        EditorWindow window;
        window.show();
        window.session()->connectToServer(
            QUrl(QString("http://127.0.0.1:%1").arg(ws.serverPort())), {});
        QTRY_VERIFY(window.session()->connected());
        window.activeEditor()->setup()->configure(http.url(), {}, "one");
        QTRY_VERIFY(window.activeEditor()->guideVisible());
        window.setCatalog(metadata());
        QVERIFY(click(window, "setup-choose"));
        QCOMPARE(window.activeEditor()->guideReadiness(),
                 QVariantList({false, false, false, false, false}));
        window.addNode("nodetool.input.StringInput");
        QTRY_VERIFY(window.activeEditor()->guideReadiness()[0].toBool());
        window.addNode("nodetool.output.Output");
        QTRY_VERIFY(window.activeEditor()->guideReadiness()[1].toBool());
        const auto nodes = window.document()->nodes();
        const auto edge = QJsonObject{{"id", "test-edge"},
                                      {"source", nodes[0].toObject()["id"]},
                                      {"target", nodes[1].toObject()["id"]},
                                      {"sourceHandle", "output"},
                                      {"targetHandle", "value"}};
        QVERIFY(window.document()->applyCommand(
            {{"op", "addEdge"}, {"edge", edge}}));
        QTRY_VERIFY(window.activeEditor()->guideReadiness()[2].toBool());
        window.document()->undoStack()->setClean();
        QTRY_VERIFY(window.activeEditor()->guideReadiness()[3].toBool());
        QVERIFY(click(window, "run-workflow"));
        QTRY_VERIFY(!commands.isEmpty());
        const auto job =
            commands.last()["data"].toObject()["job_id"].toString();
        peer->sendBinaryMessage(
            node_editor::encodeMsgPack(QJsonObject{{"type", "job_update"},
                                                   {"job_id", job},
                                                   {"job_seq", 1},
                                                   {"status", "completed"}}));
        QTRY_VERIFY(window.activeEditor()->guideReadiness()[4].toBool());
        window.document()->undoStack()->undo();
        QTRY_VERIFY(!window.activeEditor()->guideReadiness()[2].toBool());
        QVERIFY(!window.activeEditor()->guideReadiness()[3].toBool());
        window.document()->undoStack()->undo();
        QTRY_VERIFY(!window.activeEditor()->guideReadiness()[1].toBool());
        window.document()->undoStack()->undo();
        QTRY_VERIFY(!window.activeEditor()->guideReadiness()[0].toBool());
        QVERIFY(click(window, "setup-guide-close"));
        window.document()->undoStack()->redo();
        QTest::qWait(50);
        QVERIFY(!click(window, "setup-guide-close"));
    }
    void templateCreatesFromSeed() {
        Server server;
        EditorWindow window;
        window.show();
        window.session()->connectToServer(server.url(), {}, "one");
        QTRY_VERIFY(window.activeEditor()->guideVisible());
        QVERIFY(click(window, "setup-templates"));
        QTRY_COMPARE(window.activeEditor()->setup()->state(),
                     QString("templates"));
        QVERIFY(click(window, "setup-template-0"));
        QTRY_VERIFY(!server.created.isEmpty());
        QCOMPARE(server.created["from_example_name"].toString(),
                 QString("template-seed"));
        QCOMPARE(server.created["from_example_package"].toString(),
                 QString("nodetool-base"));
    }
    void packFailureRetryCancelAndAccountChange() {
        Server server;
        EditorWindow window;
        window.show();
        window.session()->connectToServer(server.url(), {}, "one");
        auto controller = window.activeEditor()->setup();
        QTRY_COMPARE(controller->state(), QString("ready"));
        QCOMPARE(server.mutations, 0);
        QVERIFY(click(window, "catalog-optional-packs"));
        QVERIFY(click(window, "catalog-runtimes"));
        QTRY_COMPARE(controller->state(), QString("ready"));
        QVERIFY(click(window, "setup-close"));
        QVERIFY(click(window, "setup-templates"));
        QTRY_COMPARE(controller->state(), QString("templates"));
        QCOMPARE(controller->templates().size(), 1);
        QVERIFY(click(window, "setup-close"));
        QVERIFY(click(window, "catalog-optional-packs"));
        QVERIFY(click(window, "catalog-runtimes"));
        QTRY_COMPARE(controller->state(), QString("ready"));
        server.fail = true;
        QVERIFY(click(window, "setup-enable-test"));
        QTRY_COMPARE(controller->state(), QString("failed"));
        QCOMPARE(server.mutations, 1);
        server.fail = false;
        server.delay = true;
        QVERIFY(click(window, "setup-retry"));
        QTRY_COMPARE(server.mutations, 2);
        QCOMPARE(controller->state(), QString("installing"));
        QVERIFY(click(window, "setup-cancel"));
        QCOMPARE(controller->state(), QString("cancelled"));
        server.release();
        QTest::qWait(50);
        QCOMPARE(controller->state(), QString("cancelled"));
        server.delay = false;
        QVERIFY(click(window, "setup-refresh"));
        QTRY_COMPARE(controller->state(), QString("ready"));
        QVERIFY(click(window, "setup-enable-test"));
        QTRY_COMPARE(controller->state(), QString("installed"));
        QCOMPARE(server.mutations, 3);
        window.setCatalog(metadata());
        window.setupAction("starter");
        bool warning = false;
        for (auto id : window.scene()->graphModel().allNodeIds()) {
            for (const auto &row :
                 static_cast<WorkflowGraphModel &>(window.scene()->graphModel())
                     .layout(id)
                     .rows) {
                warning |= row.label.contains("Requires python");
            }
        }
        QVERIFY(warning);
        server.enabled = false;
        controller->refresh();
        QTRY_COMPARE(controller->state(), QString("ready"));
        server.delay = true;
        controller->enable("test");
        QTRY_COMPARE(server.mutations, 4);
        window.session()->connectToServer(server.url(), {}, "two");
        QTRY_COMPARE(controller->state(), QString("ready"));
        server.release();
        QTest::qWait(50);
        QCOMPARE(controller->state(), QString("ready"));
        controller->enable("test");
        QTRY_COMPARE(server.mutations, 5);
        window.document()->undoStack()->setClean();
        window.newTab();
        QVERIFY(window.closeTab(0));
        server.release();
        QTest::qWait(50);
    }
};
QTEST_MAIN(SetupHostTest)
#include "SetupHostTest.moc"
