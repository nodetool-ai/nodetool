#include "ui/EditorWindow.h"
#include "server/MsgPack.h"
#include <QApplication>
#include <QGraphicsView>
#include <QJsonDocument>
#include <QMenu>
#include <QQuickItem>
#include <QQuickWidget>
#include <QTcpServer>
#include <QTcpSocket>
#include <QWebSocketServer>
#include <QWebSocket>
#include <QtTest>
using namespace nodetool;
using namespace nodetool::node_editor;

class JobsServer final : public QObject {
public:
    QTcpServer http;
    QWebSocketServer ws{"jobs", QWebSocketServer::NonSecureMode};
    QList<QPointer<QWebSocket>> peers;
    QList<QJsonObject> commands;
    QJsonArray jobs;
    QList<QPointer<QTcpSocket>> held;
    bool hold = false;
    bool rejectCancel = false;
    int lists = 0;
    QStringList cancelled;
    JobsServer() {
        http.listen(QHostAddress::LocalHost);
        connect(&ws, &QWebSocketServer::newConnection, this, [this] {
            auto peer = ws.nextPendingConnection();
            peer->setParent(this);
            peers.append(peer);
            connect(peer, &QWebSocket::binaryMessageReceived, this, [this](QByteArray bytes) {
                commands.append(decodeMsgPack(bytes)->toObject());
            });
        });
        connect(&http, &QTcpServer::newConnection, this, [this] {
            auto socket = http.nextPendingConnection();
            connect(socket, &QTcpSocket::readyRead, this, [this, socket] {
                const auto bytes = socket->peek(socket->bytesAvailable());
                if (!bytes.contains("\r\n\r\n")) {
                    return;
                }
                if (bytes.startsWith("GET /ws ")) {
                    socket->disconnect(this);
                    ws.handleConnection(socket);
                    return;
                }
                const auto split = bytes.indexOf("\r\n\r\n");
                const auto header = bytes.left(split);
                int length = 0;
                for (const auto &line : header.split('\n')) {
                    if (line.toLower().startsWith("content-length:")) {
                        length = line.mid(15).trimmed().toInt();
                    }
                }
                if (bytes.size() < split + 4 + length) {
                    return;
                }
                socket->readAll();
                socket->disconnect(this);
                if (header.contains("/trpc/jobs.list?")) {
                    ++lists;
                    if (hold) {
                        held.append(socket);
                    } else {
                        respond(socket, {{"jobs", jobs}, {"next_start_key", QJsonValue::Null}});
                    }
                } else if (header.contains("/trpc/jobs.cancel ")) {
                    const auto id = QJsonDocument::fromJson(bytes.mid(split + 4)).object()["id"].toString();
                    cancelled.append(id);
                    if (rejectCancel) {
                        respond(socket, {}, true);
                    } else {
                        QString workflow;
                        for (qsizetype i = 0; i < jobs.size(); ++i) {
                            auto row = jobs[i].toObject();
                            if (row["id"] == id) {
                                row["status"] = "cancelled";
                                workflow = row["workflow_id"].toString();
                                jobs[i] = row;
                            }
                        }
                        respond(socket, {{"job_id", id}, {"workflow_id", workflow}, {"status", "cancelled"}, {"created_at", QJsonValue::Null}, {"is_running", false}, {"is_completed", true}});
                    }
                } else if (header.contains("workflows.get")) {
                    respond(socket, {{"name", "Fallback workflow"}});
                } else {
                    respond(socket, {});
                }
            });
        });
    }
    QUrl url() const { return QUrl(QString("http://127.0.0.1:%1").arg(http.serverPort())); }
    static void respond(QTcpSocket *socket, QJsonObject data, bool error = false) {
        if (!socket) {
            return;
        }
        const QJsonObject envelope = error ? QJsonObject{{"error", QJsonObject{{"message", "Cancellation rejected"}}}}
            : QJsonObject{{"result", QJsonObject{{"data", data}}}};
        const auto bytes = QJsonDocument(envelope).toJson(QJsonDocument::Compact);
        socket->write("HTTP/1.1 " + QByteArray(error ? "403 Forbidden" : "200 OK") + "\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: " + QByteArray::number(bytes.size()) + "\r\n\r\n" + bytes);
        socket->disconnectFromHost();
    }
    static QJsonObject job(QString id, QString status, QString workflow = "other") {
        return {{"id", id}, {"user_id", "1"}, {"job_type", "workflow"}, {"status", status}, {"name", "External job"}, {"workflow_id", workflow}, {"started_at", "2026-11-05T10:00:00Z"}, {"finished_at", QJsonValue::Null}, {"error", QJsonValue::Null}, {"cost", QJsonValue::Null}, {"outputs", QJsonValue::Null}};
    }
    void update(QString id, QString status, int position = 0) {
        peers.last()->sendBinaryMessage(encodeMsgPack(QJsonObject{{"type", "job_update"}, {"job_id", id}, {"status", status}, {"queue_position", position > 0 ? QJsonValue(position) : QJsonValue::Null}}));
    }
};
class QueueDataTest final : public QObject {
    Q_OBJECT
    static QQuickItem *find(QQuickItem *root, QString name) {
        if (root->objectName() == name) {
            return root;
        }
        for (auto child : root->childItems()) {
            if (auto result = find(child, name)) {
                return result;
            }
        }
        return nullptr;
    }
    static QQuickWidget *panel(EditorWindow &window, QString file) {
        for (auto widget : window.findChildren<QQuickWidget *>()) {
            if (widget->isVisible() && widget->source().fileName() == file) {
                return widget;
            }
        }
        return nullptr;
    }
    static void click(QQuickWidget *widget, QString name) {
        QVERIFY(widget);
        QTRY_VERIFY(widget->height() > 0);
        auto item = find(widget->rootObject(), name);
        QVERIFY(item);
        QVERIFY(item->isEnabled());
        QTest::mouseClick(widget->quickWindow(), Qt::LeftButton, Qt::NoModifier,
                          item->mapToScene({item->width() / 2, item->height() / 2}).toPoint());
    }
    static QJsonObject snapshot() {
        return {{"id", "current"}, {"name", "Current workflow"}, {"graph", QJsonObject{{"nodes", QJsonArray{}}, {"edges", QJsonArray{}}}}};
    }
private slots:
    void accountQueryAndGrouping() {
        JobsServer server;
        for (const auto &status : {"running", "queued", "scheduled", "starting", "cancelled"}) {
            server.jobs.append(JobsServer::job(status, status));
        }
        auto unnamed = JobsServer::job("unnamed", "running");
        unnamed["name"] = QJsonValue::Null;
        server.jobs.append(unnamed);
        WorkflowSession first;
        first.connectToServer(server.url(), {});
        QTRY_COMPARE(first.queue().size(), 6);
        QTRY_COMPARE(first.queue().last().toMap()["name"].toString(), QString("Fallback workflow"));
        for (int i = 0; i < 5; ++i) {
            const auto row = first.queue()[i].toMap();
            QCOMPARE(row["jobId"].toString(), server.jobs[i].toObject()["id"].toString());
            QCOMPARE(row["workflow_id"].toString(), QString("other"));
            QCOMPARE(row["started_at"].toString(), QString("2026-11-05T10:00:00Z"));
            QCOMPARE(row["terminal"].toBool(), i == 4);
        }
        WorkflowSession second;
        second.connectToServer(server.url(), {});
        QTRY_VERIFY(second.connected());
        QCOMPARE(second.queue().size(), 6);
        QCOMPARE(server.lists, 1);
        QTest::qWait(150);
        QCOMPARE(server.lists, 1);
    }
    void dedupeLiveJob() {
        JobsServer server;
        WorkflowSession session;
        session.connectToServer(server.url(), {});
        QTRY_VERIFY(session.connected());
        const auto id = session.run(snapshot());
        QVERIFY(!id.isEmpty());
        server.jobs = {JobsServer::job(id, "running", "current")};
        const int previous = server.lists;
        server.update(id, "running");
        QTRY_VERIFY(server.lists > previous);
        QTest::qWait(80);
        QCOMPARE(session.queue().size(), 1);
        QCOMPARE(session.queue()[0].toMap()["started_at"].toString(), QString("2026-11-05T10:00:00Z"));
        QCOMPARE(session.queue()[0].toMap()["status"].toString(), QString("running"));
    }
    void staleAccountAndClosedTab() {
        JobsServer server;
        server.hold = true;
        auto session = std::make_unique<WorkflowSession>();
        session->connectToServer(server.url(), {}, "old");
        QTRY_COMPARE(server.held.size(), 1);
        session->connectToServer(server.url(), {}, "new");
        QTRY_COMPARE(server.held.size(), 2);
        JobsServer::respond(server.held[1], {{"jobs", QJsonArray{JobsServer::job("new", "queued")}}, {"next_start_key", QJsonValue::Null}});
        QTRY_COMPARE(session->queue().size(), 1);
        JobsServer::respond(server.held[0], {{"jobs", QJsonArray{JobsServer::job("old", "running")}}, {"next_start_key", QJsonValue::Null}});
        QTest::qWait(80);
        QCOMPARE(session->queue()[0].toMap()["jobId"].toString(), QString("new"));
        session->connectToServer(server.url(), {}, "closed");
        QTRY_COMPARE(server.held.size(), 3);
        QPointer<WorkflowSession> closed = session.get();
        session.reset();
        QVERIFY(closed.isNull());
        JobsServer::respond(server.held[2], {{"jobs", QJsonArray{JobsServer::job("closed", "running")}}});
        WorkflowSession fresh;
        server.hold = false;
        fresh.connectToServer(server.url(), {}, "fresh");
        QTRY_VERIFY(fresh.connected());
        QTest::qWait(80);
        QVERIFY(fresh.queue().isEmpty());
    }
    void closedTabPointer() {
        JobsServer server;
        server.hold = true;
        EditorWindow window;
        window.resize(1280, 900);
        window.show();
        window.session()->connectToServer(server.url(), {});
        QTRY_COMPARE(server.held.size(), 1);
        QPointer<WorkflowSession> closed = window.session();
        click(panel(window, "TabBar.qml"), "new-workflow-tab");
        QTRY_COMPARE(window.workflowTabs().size(), 2);
        click(panel(window, "TabBar.qml"), "close-tab-0");
        QTRY_VERIFY(closed.isNull());
        JobsServer::respond(server.held[0], {{"jobs", QJsonArray{JobsServer::job("shared", "running")}}, {"next_start_key", QJsonValue::Null}});
        QTRY_COMPARE(window.session()->queue().size(), 1);
        QCOMPARE(window.session()->queue()[0].toMap()["jobId"].toString(), QString("shared"));
        QCOMPARE(server.lists, 1);
    }
    void externalCancellationPointer() {
        JobsServer server;
        server.jobs = {JobsServer::job("external", "running")};
        EditorWindow window;
        window.resize(1280, 900);
        window.show();
        window.session()->connectToServer(server.url(), {});
        QTRY_VERIFY(window.session()->connected());
        QTRY_COMPARE(window.session()->queue().size(), 1);
        auto overlay = panel(window, "QueueOverlay.qml");
        QTRY_VERIFY(overlay && overlay->isVisible());
        click(overlay, "queue-toggle");
        server.rejectCancel = true;
        QSignalSpy errors(window.session(), &WorkflowSession::errorOccurred);
        click(overlay, "queue-stop-0");
        QTRY_COMPARE(server.cancelled.size(), 1);
        QTRY_VERIFY(!errors.isEmpty());
        QTRY_VERIFY(!window.session()->queue()[0].toMap()["stopping"].toBool());
        QCOMPARE(window.session()->queue()[0].toMap()["status"].toString(), QString("running"));
        server.rejectCancel = false;
        click(overlay, "queue-stop-0");
        QTRY_COMPARE(server.cancelled.size(), 2);
        QTRY_COMPARE(window.session()->queue()[0].toMap()["status"].toString(), QString("cancelled"));
        QCOMPARE(server.cancelled.last(), QString("external"));
    }
    void instantUpdateAndShortcuts() {
        JobsServer server;
        EditorWindow window;
        window.resize(1280, 900);
        window.show();
        auto workflow = snapshot();
        QJsonArray nodes;
        for (const auto &id : {"a", "b", "unrelated"}) {
            nodes.append(QJsonObject{{"id", id}, {"type", "nodetool.input.StringInput"}, {"data", QJsonObject{{"value", "initial"}}}});
        }
        workflow["graph"] = QJsonObject{{"nodes", nodes}, {"edges", QJsonArray{QJsonObject{{"id", "ab"}, {"source", "a"}, {"sourceHandle", "value"}, {"target", "b"}, {"targetHandle", "value"}}}}};
        QVERIFY(window.document()->load(workflow).ok);
        QApplication::processEvents();
        QVERIFY(window.selectNode("a"));
        window.session()->connectToServer(server.url(), {});
        QTRY_VERIFY(window.session()->connected());
        window.setCatalog(QJsonDocument::fromJson(R"([{"node_type":"nodetool.input.StringInput","properties":[{"name":"value","type":{"type":"str"}}]}])").array());
        QVERIFY(window.selectNode("a"));
        QVERIFY(window.commitProperty("a", "value", "off"));
        QTest::qWait(350);
        QVERIFY(server.commands.isEmpty());
        auto toolbar = panel(window, "Toolbar.qml");
        click(toolbar, "toolbar-more");
        auto menu = qobject_cast<QMenu *>(QApplication::activePopupWidget());
        QVERIFY(menu);
        QAction *toggle = nullptr;
        for (auto action : menu->actions()) {
            if (action->text() == "Instant Update: Off") {
                toggle = action;
            }
        }
        QVERIFY(toggle);
        QTest::mouseClick(menu, Qt::LeftButton, Qt::NoModifier, menu->actionGeometry(toggle).center());
        QVERIFY(window.commitProperty("a", "value", "first"));
        QVERIFY(window.commitProperty("a", "value", "latest"));
        QTest::qWait(100);
        QVERIFY(server.commands.isEmpty());
        QTRY_COMPARE(server.commands.size(), 1);
        const auto data = server.commands.last()["data"].toObject();
        QStringList executed;
        for (const auto &entry : data["graph"].toObject()["nodes"].toArray()) {
            executed.append(entry.toObject()["id"].toString());
        }
        QVERIFY(executed.contains("a"));
        QVERIFY(executed.contains("b"));
        QVERIFY(!executed.contains("unrelated"));
        QVERIFY(window.commitProperty("a", "value", "busy"));
        QTest::qWait(350);
        QCOMPARE(server.commands.size(), 1);
        auto view = window.findChild<QGraphicsView *>();
        QVERIFY(view);
        view->setFocus();
        // Like the web toolbar, Escape cancels this client's run over the socket.
        QTest::keyClick(view->viewport(), Qt::Key_Escape);
        QTRY_COMPARE(server.commands.size(), 2);
        QCOMPARE(server.commands.last()["command"].toString(), QString("cancel_job"));
        QCOMPARE(server.commands.last()["data"].toObject()["job_id"], data["job_id"]);
        QVERIFY(server.cancelled.isEmpty());
        server.update(data["job_id"].toString(), "cancelled");
        QTest::keyClick(view->viewport(), Qt::Key_Return, Qt::ControlModifier);
        QTRY_COMPARE(server.commands.size(), 3);
    }
    void toolbarLabels() {
        JobsServer server;
        EditorWindow window;
        window.resize(1280, 900);
        window.show();
        window.session()->connectToServer(server.url(), {});
        window.session()->setSnapshot(snapshot());
        QTRY_VERIFY(window.session()->connected());
        auto toolbar = panel(window, "Toolbar.qml");
        QVERIFY(toolbar);
        auto root = toolbar->rootObject();
        QCOMPARE(root->property("runLabel").toString(), QString("Run entire workflow"));
        const auto id = window.session()->run(snapshot());
        QTRY_COMPARE(root->property("runLabel").toString(), QString("Starting"));
        for (const auto &status : {"starting", "scheduled", "queued"}) {
            server.update(id, status);
            QTRY_COMPARE(root->property("runLabel").toString(), QString("Starting"));
        }
        server.update(id, "queued", 3);
        QTRY_COMPARE(root->property("runLabel").toString(), QString("Queued (#3)"));
        QCOMPARE(root->property("runTooltip").toString(), QString("Queued (#3)"));
        server.update(id, "running");
        QTRY_COMPARE(root->property("runLabel").toString(), QString("Running"));
        server.jobs = {JobsServer::job("pending", "scheduled", "current")};
        server.update(id, "running");
        QTRY_COMPARE(root->property("runLabel").toString(), QString("Running · 1 queued"));
        QCOMPARE(root->property("runTooltip").toString(), QString("Running — 1 queued (click to queue another)"));
        server.rejectCancel = true;
        window.session()->cancelJob(id);
        QCOMPARE(root->property("runLabel").toString(), QString("Stopping"));
        QCOMPARE(root->property("runTooltip").toString(), QString("Stopping workflow"));
        QTRY_VERIFY(!window.session()->queue().last().toMap()["stopping"].toBool());
        server.update(id, "failed");
        QTRY_COMPARE(root->property("runLabel").toString(), QString("Error · Retry"));
        auto edited = snapshot();
        edited["name"] = "Edited";
        window.session()->setSnapshot(edited);
        QTRY_COMPARE(root->property("runLabel").toString(), QString("Run entire workflow"));
        for (const auto &status : {"completed", "cancelled"}) {
            server.update(id, status);
            QTRY_COMPARE(root->property("runLabel").toString(), QString("Run entire workflow"));
        }
    }
};
QTEST_MAIN(QueueDataTest)
#include "QueueDataTest.moc"
