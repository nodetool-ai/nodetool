#include "runtime/ChatSession.h"
#include <QJsonDocument>
#include <QPointer>
#include <QTcpServer>
#include <QTcpSocket>
#include <QWebSocketServer>
#include <QTemporaryFile>
#include <QtTest>
#include <QTimer>
#include <algorithm>
using namespace nt::chat;
namespace {
constexpr auto ThreadId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
class ChatServer : public QObject {
public:
    QTcpServer http;
    QWebSocketServer websocket{QStringLiteral("native-chat-test"), QWebSocketServer::NonSecureMode};
    QPointer<QWebSocket> peer;
    QList<QJsonObject> frames;
    QList<QByteArray> requests;
    bool paginateHistory = false;
    bool holdHistory = false;
    bool holdUploads = false;
    bool failUploads = false;
    QPointer<QTcpSocket> uploadSocket;
    ChatServer() {
        connect(&http, &QTcpServer::newConnection, this, [this] {
            while (http.hasPendingConnections()) {
                auto* socket = http.nextPendingConnection();
                connect(socket, &QTcpSocket::readyRead, this, [this, socket] {
                    const auto pending = socket->peek(socket->bytesAvailable());
                    const auto headerEnd = pending.indexOf("\r\n\r\n");
                    if (headerEnd < 0) { return; }
                    if (pending.toLower().contains("upgrade: websocket")) {
                        QObject::disconnect(socket, nullptr, this, nullptr);
                        websocket.handleConnection(socket);
                        return;
                    }
                    int length = 0;
                    for (const auto& line : pending.left(headerEnd).split('\n')) {
                        if (line.toLower().startsWith("content-length:")) {
                            length = line.mid(line.indexOf(':') + 1).trimmed().toInt();
                        }
                    }
                    if (pending.size() < headerEnd + 4 + length) { return; }
                    requests.append(socket->readAll());
                    const auto target = requests.last().split(' ').value(1);
                    if (holdHistory && target.startsWith("/trpc/messages.list")) { return; }
                    if (target.startsWith("/api/assets")) {
                        uploadSocket = socket;
                        if (holdUploads) { return; }
                        const auto body = failUploads ? QByteArray("{\"error\":\"Upload rejected\"}")
                            : QByteArray("{\"id\":\"cccccccccccccccccccccccccccccccc\"}");
                        socket->write((failUploads ? QByteArray("HTTP/1.1 500 Internal Server Error\r\n") : QByteArray("HTTP/1.1 200 OK\r\n"))
                            + "Content-Type: application/json\r\nConnection: close\r\nContent-Length: " + QByteArray::number(body.size()) + "\r\n\r\n" + body);
                        socket->disconnectFromHost();
                        return;
                    }
                    QJsonValue data;
                    if (target.startsWith("/trpc/threads.list")) {
                        data = QJsonObject{{"threads", QJsonArray{QJsonObject{{"id", ThreadId}, {"title", "Server conversation"}, {"project_id", "default"}}}}, {"next", QJsonValue::Null}};
                    } else if (target.startsWith("/trpc/messages.list")) {
                        if (paginateHistory) {
                            const bool earlier = target.contains("cursor-one");
                            data = QJsonObject{{"messages", QJsonArray{QJsonObject{{"id", earlier ? "earlier" : "latest"}, {"role", "user"}, {"content", earlier ? "Earlier" : "Latest"}}}},
                                {"next", earlier ? QJsonValue(QJsonValue::Null) : QJsonValue("cursor-one")}};
                        } else {
                            data = QJsonObject{{"messages", QJsonArray{}}, {"next", QJsonValue::Null}};
                        }
                    } else if (target.startsWith("/trpc/threads.create")) {
                        data = QJsonObject{{"id", ThreadId}, {"title", "Created"}, {"project_id", "default"}};
                    } else {
                        data = QJsonObject{};
                    }
                    const auto body = QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", data}}}}).toJson(QJsonDocument::Compact);
                    socket->write("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: " + QByteArray::number(body.size()) + "\r\n\r\n" + body);
                    socket->disconnectFromHost();
                });
            }
        });
        connect(&websocket, &QWebSocketServer::newConnection, this, [this] {
            peer = websocket.nextPendingConnection();
            connect(peer, &QWebSocket::textMessageReceived, this, [this](const QString& text) {
                const auto object = QJsonDocument::fromJson(text.toUtf8()).object();
                frames.append(object);
                if (object["command"] == "set_mode") {
                    // The server's first acknowledgement is still MsgPack.
                    peer->sendBinaryMessage(QByteArray::fromHex("81a76d657373616765b04d6f64652073657420746f2074657874"));
                }
            });
        });
    }
    bool listen() { return http.listen(QHostAddress::LocalHost, 0); }
    QUrl url() const { return QUrl(QStringLiteral("http://127.0.0.1:%1").arg(http.serverPort())); }
    void emitEvent(const QJsonObject& event, int delayMs = 0) {
        if (delayMs > 0) {
            QTimer::singleShot(delayMs, this, [this, event] { emitEvent(event); });
            return;
        }
        if (peer) { peer->sendTextMessage(QString::fromUtf8(QJsonDocument(event).toJson(QJsonDocument::Compact))); }
    }
    int count(const QString& field, const QString& value) const {
        return static_cast<int>(std::count_if(frames.cbegin(), frames.cend(), [&](const auto& frame) { return frame[field] == value; }));
    }
};
}
class TransportTests : public QObject {
    Q_OBJECT
private slots:
    void realServerRoundTrip() {
        const auto address = qEnvironmentVariable("NODETOOL_CHAT_TEST_SERVER");
        if (address.isEmpty()) { QSKIP("Set NODETOOL_CHAT_TEST_SERVER for the isolated real-server round trip"); }
        ChatClient client;
        client.connectToServer(QUrl(address), {});
        QTRY_VERIFY_WITH_TIMEOUT(client.ready(), 10000);
        QString threadId;
        QString requestError;
        bool completed = false;
        client.call("threads.create", {{"project_id", "default"}, {"title", "Native contract verification"}}, true,
            [&](QJsonValue result, QString error) {
                threadId = result.toObject()["id"].toString(); requestError = error; completed = true;
            });
        QTRY_VERIFY_WITH_TIMEOUT(completed, 10000);
        QVERIFY2(requestError.isEmpty(), qPrintable(requestError));
        QVERIFY(!threadId.isEmpty());
        ChatSession session;
        session.connectToServer(QUrl(address), {});
        QTRY_COMPARE_WITH_TIMEOUT(session.connectionStatus(), QStringLiteral("connected"), 10000);
        QTRY_VERIFY_WITH_TIMEOUT(session.threads()->rowCount() > 0, 10000);
        session.selectThread(threadId);
        QCOMPARE(session.selectedThreadId(), threadId);
        session.setProvider("__native_chat_invalid_provider__");
        session.setModel("__native_chat_invalid_model__");
        session.setDraft("Native contract validation, no provider call expected");
        session.send();
        QTRY_VERIFY_WITH_TIMEOUT(!session.error().isEmpty() || session.turnStatus() == "error", 10000);
        QVERIFY(!session.error().isEmpty());
        session.disconnectFromServer();
        completed = false;
        client.call("threads.delete", {{"id", threadId}}, true,
            [&](QJsonValue, QString error) { requestError = error; completed = true; });
        QTRY_VERIFY_WITH_TIMEOUT(completed, 10000);
        QVERIFY2(requestError.isEmpty(), qPrintable(requestError));
    }
    void authenticatedHttpSocketSendStopAndActions() {
        ChatServer server;
        QVERIFY(server.listen());
        ChatSession session;
        session.connectToServer(server.url(), "synthetic-test-token");
        QTRY_COMPARE(session.connectionStatus(), QStringLiteral("connected"));
        QTRY_COMPARE(session.selectedThreadId(), QString::fromLatin1(ThreadId));
        QTRY_VERIFY(!session.historyLoading());
        QTRY_VERIFY(server.requests.size() >= 2);
        for (const auto& request : server.requests) {
            QVERIFY(request.contains("Authorization: Bearer synthetic-test-token"));
        }
        session.setProvider("test-provider");
        session.setModel("test-model");
        session.setProperty("hostContext", QVariantMap{
            {"workflow_id", "timeline-document"},
            {"ui_context", QVariantMap{{"source", "timeline_assistant"},
                                        {"selection", QVariantMap{{"clip_ids", QStringList{"clip-one"}}}}}}});
        session.setDraft("Hello server");
        session.send();
        QTRY_COMPARE(server.count("command", "chat_message"), 1);
        QCOMPARE(session.draft(), QString());
        QCOMPARE(session.turnStatus(), QStringLiteral("loading"));
        const auto sent = *std::find_if(server.frames.cbegin(), server.frames.cend(), [](const auto& frame) { return frame["command"] == "chat_message"; });
        QCOMPARE(sent["data"].toObject()["provider"].toString(), QStringLiteral("test-provider"));
        QCOMPARE(sent["data"].toObject()["model"].toString(), QStringLiteral("test-model"));
        QCOMPARE(sent["data"].toObject()["workflow_id"].toString(), QStringLiteral("timeline-document"));
        QCOMPARE(sent["data"].toObject()["ui_context"].toObject()["selection"].toObject()["clip_ids"].toArray().first().toString(), QStringLiteral("clip-one"));
        QSignalSpy hostResponses(&session, &ChatSession::hostResponseReceived);
        QVERIFY(session.sendHostRequest("generate_text", {{"prompt", "Plan"}}, "host-request"));
        QTRY_COMPARE(server.count("command", "generate_text"), 1);
        server.emitEvent({{"type", "rpc_response"}, {"request_id", "host-request"},
                          {"result", QJsonObject{{"text", "Plan ready"}}}});
        QTRY_COMPARE(hostResponses.size(), 1);
        session.disconnectFromServer();
        session.applyEvent({{"type", "rpc_response"}, {"request_id", "host-request"},
                            {"result", QJsonObject{{"text", "stale"}}}});
        QCOMPARE(hostResponses.size(), 1);
        session.connectToServer(server.url(), "synthetic-test-token");
        QTRY_COMPARE(session.connectionStatus(), QStringLiteral("connected"));
        QTRY_COMPARE(session.selectedThreadId(), QString::fromLatin1(ThreadId));
        server.emitEvent({{"type", "chunk"}, {"thread_id", ThreadId}, {"content", "reply"}, {"chat_seq", 1}});
        QTRY_COMPARE(session.turnStatus(), QStringLiteral("streaming"));
        session.stop();
        QTRY_COMPARE(server.count("command", "stop"), 1);
        QCOMPARE(session.turnStatus(), QStringLiteral("stopping"));
        server.emitEvent({{"type", "generation_stopped"}, {"thread_id", ThreadId}, {"chat_seq", 2}});
        QTRY_COMPARE(session.turnStatus(), QStringLiteral("idle"));
        server.emitEvent({{"type", "tool_approval_request"}, {"thread_id", ThreadId}, {"approval_id", "approval-one"}, {"tool_name", "write"}, {"message", "Change document?"}, {"chat_seq", 3}}, 75);
        const auto approvalReceived = [&] {
            const auto* messages = qobject_cast<MessageModel*>(session.messages());
            if (!messages) { return false; }
            for (const auto& row : messages->snapshot()) {
                for (const auto& part : row.toObject()["parts"].toArray()) {
                    if (part.toObject()["actionId"] == "approval-one") { return true; }
                }
            }
            return false;
        };
        QTRY_VERIFY(approvalReceived());
        session.respondToAction("approval-one", true);
        session.respondToAction("approval-one", true);
        QTRY_COMPARE(server.count("type", "tool_approval_response"), 1);
        server.emitEvent({{"type", "tool_call"}, {"thread_id", ThreadId}, {"tool_call_id", "unsupported-call"}, {"name", "ui_not_implemented"}, {"args", QJsonObject{}}, {"chat_seq", 4}});
        QTRY_COMPARE(server.count("type", "tool_result"), 1);
        const auto result = server.frames.last();
        QCOMPARE(result["ok"].toBool(), false);
        QVERIFY(!result["error"].toString().isEmpty());
    }
    void historyPaginationExposesOnlyAvailableEarlierPages() {
        ChatServer server;
        server.paginateHistory = true;
        QVERIFY(server.listen());
        ChatSession session;
        QVERIFY(!session.hasMoreHistory());
        session.connectToServer(server.url(), {});
        QTRY_VERIFY(session.hasMoreHistory());
        QCOMPARE(session.messages()->rowCount(), 1);
        session.loadMore();
        QTRY_COMPARE(session.messages()->rowCount(), 2);
        QVERIFY(!session.hasMoreHistory());
        QCOMPARE(session.messages()->data(session.messages()->index(0, 0), MessageModel::MessageIdRole).toString(), QStringLiteral("earlier"));
        QCOMPARE(session.messages()->data(session.messages()->index(1, 0), MessageModel::MessageIdRole).toString(), QStringLiteral("latest"));
    }
    void attachmentUploadUsesServerIdAndCanFailOrCancel() {
        ChatServer server;
        QVERIFY(server.listen());
        ChatSession session;
        session.connectToServer(server.url(), {});
        QTRY_COMPARE(session.selectedThreadId(), QString::fromLatin1(ThreadId));
        QTemporaryFile file;
        QVERIFY(file.open());
        QCOMPARE(file.write(QByteArray(8192, 'x')), qint64(8192));
        QVERIFY(file.flush());
        const auto local = QUrl::fromLocalFile(file.fileName());
        session.addAttachment(local);
        QTRY_COMPARE(session.attachments().size(), 1);
        QTRY_COMPARE(session.attachments().first().toMap()["status"].toString(), QStringLiteral("ready"));
        QCOMPARE(session.attachments().first().toMap()["assetId"].toString(), QStringLiteral("cccccccccccccccccccccccccccccccc"));
        QVERIFY(session.attachments().first().toMap()["progress"].toDouble() > 0);
        session.setDraft("Use attached file");
        session.send();
        QTRY_COMPARE(server.count("command", "chat_message"), 1);
        const auto frame = *std::find_if(server.frames.cbegin(), server.frames.cend(), [](const auto& value) { return value["command"] == "chat_message"; });
        const auto content = frame["data"].toObject()["content"].toArray();
        QCOMPARE(content.size(), 2);
        QCOMPARE(content[1].toObject()["document"].toObject()["uri"].toString(), QStringLiteral("asset://cccccccccccccccccccccccccccccccc"));
        QCOMPARE(session.attachments().size(), 0);
        server.emitEvent({{"type", "generation_stopped"}, {"thread_id", ThreadId}});
        QTRY_COMPARE(session.turnStatus(), QStringLiteral("idle"));
        server.failUploads = true;
        session.addAttachment(local);
        QTRY_COMPARE(session.attachments().first().toMap()["status"].toString(), QStringLiteral("failed"));
        QVERIFY(!session.error().isEmpty());
        session.removeAttachment(session.attachments().first().toMap()["id"].toString());
        QCOMPARE(session.attachments().size(), 0);
        server.failUploads = false;
        server.holdUploads = true;
        server.uploadSocket.clear();
        session.addAttachment(local);
        QTRY_VERIFY(server.uploadSocket);
        const auto canceledId = session.attachments().first().toMap()["id"].toString();
        session.removeAttachment(canceledId);
        QCOMPARE(session.attachments().size(), 0);
        QTRY_COMPARE(server.uploadSocket->state(), QAbstractSocket::UnconnectedState);
        QTest::qWait(30);
        QCOMPARE(session.attachments().size(), 0);
    }
    void completedHostActionIsNotExecutedAgainAfterIncompleteReplay() {
        ChatServer server;
        QVERIFY(server.listen());
        ChatSession session;
        session.setHostTools({QVariantMap{{"name", "ui_native_test"}}});
        session.connectToServer(server.url(), {});
        QTRY_COMPARE(session.selectedThreadId(), QString::fromLatin1(ThreadId));
        QTRY_VERIFY(!session.historyLoading());
        QSignalSpy actions(&session, &ChatSession::hostToolRequested);
        const QJsonObject call{{"type", "tool_call"}, {"thread_id", ThreadId},
            {"tool_call_id", "once-only-edit"}, {"name", "ui_native_test"}, {"args", QJsonObject{}}};
        session.applyEvent(call);
        QCOMPARE(actions.count(), 1);
        session.completeHostTool("once-only-edit", {{"changed", true}});
        QTRY_COMPARE(server.count("type", "tool_result"), 1);
        session.applyEvent({{"type", "chat_resumed"}, {"thread_id", ThreadId},
            {"status", "running"}, {"replay_incomplete", true}});
        QTest::qWait(80);
        session.applyEvent(call);
        QTRY_COMPARE(server.count("type", "tool_result"), 2);
        QCOMPARE(actions.count(), 1);
    }
    void interruptedInitialHistoryCanReconnectAndSend() {
        ChatServer server;
        server.holdHistory = true;
        QVERIFY(server.listen());
        ChatSession session;
        session.connectToServer(server.url(), {});
        QTRY_COMPARE(session.selectedThreadId(), QString::fromLatin1(ThreadId));
        QTRY_VERIFY(std::any_of(server.requests.cbegin(), server.requests.cend(), [](const auto& request) { return request.contains("/trpc/messages.list"); }));
        QVERIFY(server.peer);
        QVERIFY(session.historyLoading());
        QCOMPARE(session.turnStatus(), QStringLiteral("idle"));
        session.selectThread(QString::fromLatin1(ThreadId));
        session.selectThread(QString::fromLatin1(ThreadId));
        QTest::qWait(30);
        QCOMPARE(std::count_if(server.requests.cbegin(), server.requests.cend(), [](const auto& request) { return request.contains("/trpc/messages.list"); }), 1);
        server.peer->close();
        QTRY_COMPARE(session.connectionStatus(), QStringLiteral("disconnected"));
        QVERIFY(!session.historyLoading());
        server.holdHistory = false;
        session.resumeConnection();
        QTRY_COMPARE(session.connectionStatus(), QStringLiteral("connected"));
        QTRY_VERIFY(std::count_if(server.requests.cbegin(), server.requests.cend(), [](const auto& request) { return request.contains("/trpc/messages.list"); }) >= 2);
        QTest::qWait(30);
        QVERIFY(!session.historyLoading());
        session.setDraft("Send after history reconnected");
        session.send();
        QTRY_COMPARE(server.count("command", "chat_message"), 1);
    }
    void abruptDisconnectDoesNotResendPrompt() {
        ChatServer server;
        QVERIFY(server.listen());
        ChatSession session;
        session.connectToServer(server.url(), {});
        QTRY_COMPARE(session.selectedThreadId(), QString::fromLatin1(ThreadId));
        QTRY_VERIFY(!session.historyLoading());
        session.setDraft("run once");
        session.send();
        QTRY_COMPARE(server.count("command", "chat_message"), 1);
        QSignalSpy hostResponses(&session, &ChatSession::hostResponseReceived);
        QVERIFY(session.sendHostRequest("generate_text", {{"prompt", "Plan"}}, "reconnect-rpc"));
        QTRY_COMPARE(server.count("command", "generate_text"), 1);
        QVERIFY(server.peer);
        server.peer->close();
        QTRY_COMPARE(session.connectionStatus(), QStringLiteral("disconnected"));
        QTRY_COMPARE(hostResponses.size(), 1);
        QVERIFY(!hostResponses.at(0).at(0).toJsonObject()["error"].toObject().isEmpty());
        QCOMPARE(session.turnStatus(), QStringLiteral("interrupted"));
        QTest::qWait(50);
        QCOMPARE(server.count("command", "chat_message"), 1);
        session.resumeConnection();
        QTRY_COMPARE(session.connectionStatus(), QStringLiteral("connected"));
        session.applyEvent({{"type", "rpc_response"}, {"request_id", "reconnect-rpc"},
                            {"result", QJsonObject{{"text", "stale"}}}});
        QCOMPARE(hostResponses.size(), 1);
        QVERIFY(session.sendHostRequest("generate_text", {{"prompt", "Retry"}}, "reconnect-rpc"));
        QTRY_COMPARE(server.count("command", "generate_text"), 2);
        server.emitEvent({{"type", "rpc_response"}, {"request_id", "reconnect-rpc"},
                          {"result", QJsonObject{{"text", "fresh"}}}});
        QTRY_COMPARE(hostResponses.size(), 2);
        QCOMPARE(hostResponses.at(1).at(0).toJsonObject()["result"].toObject()["text"].toString(),
                 QStringLiteral("fresh"));
    }
};
QTEST_MAIN(TransportTests)
#include "TransportTests.moc"
