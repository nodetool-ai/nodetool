#include "ui/EditorWindow.h"
#include <QJsonDocument>
#include <QPointer>
#include <QTcpServer>
#include <QTcpSocket>
#include <QWebSocketServer>
#include <QTemporaryFile>
#include <QTemporaryDir>
#include <QQuickWidget>
#include <QQuickItem>
#include <QQuickWindow>
#include <QDir>
#include <QtTest>
#include <QTimer>
#include <QSettings>
#include <algorithm>
namespace {
constexpr auto ThreadId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
class ChatServer : public QObject {
public:
    QTcpServer http;
    QWebSocketServer websocket{QStringLiteral("native-chat-test"), QWebSocketServer::NonSecureMode};
    QPointer<QWebSocket> peer;
    QList<QJsonObject> frames;
    QList<QByteArray> requests;
    QString createdId = ThreadId;
    bool failDelete = false;
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
                    if (failDelete && target.startsWith("/trpc/threads.delete")) {
                        const QByteArray body = "{\"error\":{\"message\":\"Fixture delete failure\"}}";
                        socket->write("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: " + QByteArray::number(body.size()) + "\r\n\r\n" + body);
                        socket->disconnectFromHost();
                        return;
                    }
                    QJsonValue data;
                    if (target.startsWith("/trpc/threads.list")) {
                        data = QJsonObject{{"threads", QJsonArray{QJsonObject{{"id", ThreadId}, {"title", "Server conversation"}, {"workflow_id", "workflow-chat"}, {"project_id", "default"}}}}, {"next", QJsonValue::Null}};
                    } else if (target.startsWith("/trpc/messages.list")) {
                        if (paginateHistory) {
                            const bool earlier = target.contains("cursor-one");
                            data = QJsonObject{{"messages", QJsonArray{QJsonObject{{"id", earlier ? "earlier" : "latest"}, {"role", "user"}, {"content", earlier ? "Earlier" : "Latest"}}}},
                                {"next", earlier ? QJsonValue(QJsonValue::Null) : QJsonValue("cursor-one")}};
                        } else {
                            data = QJsonObject{{"messages", QJsonArray{}}, {"next", QJsonValue::Null}};
                        }
                    } else if (target.startsWith("/trpc/threads.create")) {
                        data = QJsonObject{{"id", createdId}, {"title", "Created"}, {"project_id", "default"}};
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

class EditorChatTest final : public QObject {
    Q_OBJECT
    QTemporaryDir settingsDir_;
    static QQuickWidget *surface(nodetool::EditorWindow &window) {
        return window.findChild<QQuickWidget *>("editor-chat-overlay");
    }
    static QQuickItem *findItem(QQuickItem *root, const QString &name) {
        if (root->objectName() == name) {
            return root;
        }
        for (auto *child : root->childItems()) {
            if (auto *found = findItem(child, name)) {
                return found;
            }
        }
        return nullptr;
    }
    static void click(QQuickWidget *widget, const QString &name) {
        auto *item = findItem(widget->quickWindow()->contentItem(), name);
        QVERIFY2(item, qPrintable(name));
        const auto point = item->mapToScene(QPointF(item->width() / 2, item->height() / 2));
        QTest::mouseClick(widget->quickWindow(), Qt::LeftButton, Qt::NoModifier, point.toPoint());
    }
    static QJsonObject workflow() {
        return {{"id", "workflow-chat"}, {"name", "Chat fixture"}, {"graph", QJsonObject{
            {"nodes", QJsonArray{QJsonObject{{"id", "node-chat"}, {"type", "fixture.Text"},
                {"future", 42}, {"data", QJsonObject{{"text", "Original"}}},
                {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 0}, {"y", 0}}}}}}}},
            {"edges", QJsonArray{}}}}};
    }
    static void setup(nodetool::EditorWindow &window) {
        window.setCatalog({QJsonObject{{"node_type", "fixture.Text"}, {"title", "Text"},
            {"properties", QJsonArray{QJsonObject{{"name", "text"}, {"type", QJsonObject{{"type", "str"}}}, {"default", ""}}}}, {"outputs", QJsonArray{}}}});
        QVERIFY(window.document()->load(workflow()));
        window.resize(1280, 800);
        window.show();
        if (!surface(window)->isVisible()) {
            window.toggleChat();
        }
        QTest::qWait(100);
        QVERIFY(surface(window));
        QCOMPARE(surface(window)->status(), QQuickWidget::Ready);
    }
    static void type(QQuickWidget *widget, const QString &text) {
        QTest::qWait(30);
        auto *input = widget->rootObject()->findChild<QQuickItem *>("chatInput");
        QVERIFY(input);
        QTest::mouseClick(widget->quickWindow(), Qt::LeftButton, Qt::NoModifier,
            input->mapToScene(QPointF(20, 20)).toPoint());
        for (const auto character : text.toLatin1()) {
            QTest::keyClick(widget->quickWindow(), character);
        }
    }
    static void capture(nodetool::EditorWindow &window, const QString &name) {
        const auto dir = qEnvironmentVariable("NODETOOL_EDITOR_CHAT_CAPTURE_DIR");
        if (dir.isEmpty()) {
            return;
        }
        QDir().mkpath(dir);
        QTest::qWait(100);
        QVERIFY(window.grab().save(dir + "/" + name + ".png"));
    }
private slots:
    void initTestCase() {
        QVERIFY(settingsDir_.isValid());
        QSettings::setDefaultFormat(QSettings::IniFormat);
        QSettings::setPath(QSettings::IniFormat, QSettings::UserScope, settingsDir_.path());
    }
    void init() {
        QSettings().remove("canvas-chat-dock");
    }
    void geometryAndPersistence() {
        nodetool::EditorWindow window;
        setup(window);
        auto *widget = surface(window);
        const auto original = widget->geometry();
        auto *handle = widget->rootObject()->findChild<QQuickItem *>("chatDragHandle");
        QVERIFY(handle);
        const auto point = handle->mapToScene(QPointF(100, 15)).toPoint();
        QTest::mousePress(widget->quickWindow(), Qt::LeftButton, Qt::NoModifier, point);
        QTest::mouseMove(widget->quickWindow(), point + QPoint(-250, 50));
        QTest::mouseRelease(widget->quickWindow(), Qt::LeftButton, Qt::NoModifier, point + QPoint(-250, 50));
        QVERIFY(widget->x() < original.x());
        QVERIFY(widget->y() >= 0);
        auto *edge = findItem(widget->rootObject(), "chatResize3");
        QVERIFY(edge);
        const auto corner = edge->mapToScene(QPointF(4, 4)).toPoint();
        QTest::mousePress(widget->quickWindow(), Qt::LeftButton, Qt::NoModifier, corner);
        QTest::mouseMove(widget->quickWindow(), corner + QPoint(-60, -70));
        QTest::mouseRelease(widget->quickWindow(), Qt::LeftButton, Qt::NoModifier, corner + QPoint(-60, -70));
        QVERIFY(widget->width() > original.width());
        const auto savedSize = QSettings().value("canvas-chat-dock/size").toSize();
        const auto savedPosition = QSettings().value("canvas-chat-dock/position").toPoint();
        nodetool::EditorWindow reopened;
        reopened.resize(1280, 800);
        reopened.show();
        QTest::qWait(100);
        QCOMPARE(QSettings().value("canvas-chat-dock/size").toSize(), savedSize);
        QVERIFY(surface(reopened)->isVisible());
        QCOMPARE(surface(reopened)->size(), widget->size());
        QCOMPARE(QSettings().value("canvas-chat-dock/position").toPoint(), savedPosition);
        window.resize(640, 480);
        QTest::qWait(100);
        QVERIFY(widget->x() >= 0);
        QVERIFY(widget->y() >= 0);
        QVERIFY(widget->geometry().right() < widget->parentWidget()->width());
        // An off-screen release must be clamped independently of viewport resize.
        const auto dragPoint = handle->mapToScene(QPointF(100, 15)).toPoint();
        QTest::mousePress(widget->quickWindow(), Qt::LeftButton, Qt::NoModifier, dragPoint);
        QTest::mouseMove(widget->quickWindow(), dragPoint + QPoint(-2000, -2000));
        QTest::mouseRelease(widget->quickWindow(), Qt::LeftButton, Qt::NoModifier, dragPoint + QPoint(-2000, -2000));
        QVERIFY(widget->x() >= 0);
        QVERIFY(widget->y() >= 0);
    }
    void bindingFilteringAndRetry() {
        ChatServer server;
        QVERIFY(server.listen());
        server.createdId = "dddddddddddddddddddddddddddddddd";
        nodetool::EditorWindow window;
        setup(window);
        auto *chat = window.chatSession();
        chat->connectToServer(server.url());
        QTRY_COMPARE(chat->selectedThreadId(), QString(ThreadId));
        QTRY_VERIFY(!chat->historyLoading());
        chat->upsertThread({{"id", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}, {"title", "Other workflow"}, {"workflow_id", "other"}});
        QCOMPARE(chat->workflowThreads().size(), 1);
        click(surface(window), "newEditorConversation");
        QTRY_VERIFY(std::any_of(server.requests.cbegin(), server.requests.cend(), [](const auto &request) {
            return request.contains("threads.create") && request.contains("\"workflow_id\":\"workflow-chat\"");
        }));
        QTRY_COMPARE(chat->selectedThreadId(), server.createdId);
        QTRY_VERIFY(!chat->historyLoading());
        QCOMPARE(chat->workflowThreads().size(), 2);
        type(surface(window), "Retry this prompt");
        click(surface(window), "sendMessage");
        QTRY_COMPARE(server.count("command", "chat_message"), 1);
        server.emitEvent({{"type", "error"}, {"thread_id", server.createdId}, {"message", "Retry failure"}});
        QTRY_COMPARE(chat->turnStatus(), QString("error"));
        click(surface(window), "retryEditorChat");
        QTRY_COMPARE(server.count("command", "chat_message"), 2);
        server.emitEvent({{"type", "chunk"}, {"thread_id", server.createdId}, {"content", "Background"}});
        QTRY_COMPARE(chat->turnStatus(), QString("streaming"));
        QPointer<nt::chat::ChatSession> retained = chat;
        window.newTab();
        QVERIFY(window.chatSession() != chat);
        server.emitEvent({{"type", "chunk"}, {"thread_id", server.createdId}, {"content", " continues"}});
        QTRY_VERIFY(chat->dumpState()["threads"].toObject()[server.createdId].toObject()["messages"].toArray().size() > 0);
        window.activateTab(0);
        QCOMPARE(window.chatSession(), chat);
        window.newTab();
        QVERIFY(window.closeTab(0));
        QVERIFY(retained);
        server.emitEvent({{"type", "chunk"}, {"thread_id", server.createdId}, {"content", " after close"}});
        QTest::qWait(100);
        QVERIFY(retained);
        QCOMPARE(retained->turnStatus(), QString("streaming"));
        server.emitEvent({{"type", "chunk"}, {"thread_id", server.createdId}, {"content", ""}, {"done", true}});
        QTRY_VERIFY(!retained);
    }
    void threadSearchAndDeleteFailure() {
        ChatServer server;
        QVERIFY(server.listen());
        server.failDelete = true;
        nodetool::EditorWindow window;
        setup(window);
        auto *chat = window.chatSession();
        chat->connectToServer(server.url());
        QTRY_COMPARE(chat->selectedThreadId(), QString(ThreadId));
        click(surface(window), "showEditorThreads");
        auto *list = findItem(surface(window)->rootObject(), "editorThreadList");
        QVERIFY(list);
        QTRY_COMPARE(list->property("count").toInt(), 1);
        auto *search = findItem(surface(window)->rootObject(), "editorThreadSearch");
        QVERIFY(search);
        QTest::mouseClick(surface(window)->quickWindow(), Qt::LeftButton, Qt::NoModifier,
            search->mapToScene(QPointF(20, 15)).toPoint());
        for (const auto key : QByteArray("unmatched")) {
            QTest::keyClick(surface(window)->quickWindow(), key);
        }
        QTRY_COMPARE(list->property("count").toInt(), 0);
        QTest::keyClick(surface(window)->quickWindow(), Qt::Key_A, Qt::ControlModifier);
        QTest::keyClick(surface(window)->quickWindow(), Qt::Key_Backspace);
        QTRY_COMPARE(list->property("count").toInt(), 1);
        QTest::qWait(50);
        click(surface(window), QString("deleteThread") + ThreadId);
        QTest::qWait(100);
        click(surface(window), "confirmDeleteEditorThread");
        QTRY_COMPARE(chat->error(), QString("Could not delete the conversation. Please try again."));
        QCOMPARE(chat->workflowThreads().size(), 1);
    }
    void askAgentDraft() {
        ChatServer server;
        QVERIFY(server.listen());
        nodetool::EditorWindow window;
        setup(window);
        auto *chat = window.chatSession();
        chat->connectToServer(server.url());
        QTRY_COMPARE(chat->selectedThreadId(), QString(ThreadId));
        window.runOutput()->beginRun("run-fixture");
        window.action("Output");
        QTest::qWait(100);
        QQuickWidget *output = nullptr;
        for (auto *candidate : window.findChildren<QQuickWidget *>()) {
            if (candidate->rootObject() && findItem(candidate->rootObject(), "askRunAgent")) {
                output = candidate;
                break;
            }
        }
        QVERIFY(output);
        click(output, "askRunAgent");
        QTRY_COMPARE(chat->draft(), QString("Help me diagnose the selected run."));
        QTRY_VERIFY(!chat->historyLoading());
        click(surface(window), "sendMessage");
        QTRY_COMPARE(server.count("command", "chat_message"), 1);
        QJsonObject data;
        for (const auto &frame : server.frames) {
            if (frame["command"] == "chat_message") {
                data = frame["data"].toObject();
            }
        }
        QCOMPARE(data["ui_context"].toObject()["run"].toObject()["run_id"].toString(), QString("run-fixture"));
    }
    void draftAndTabs() {
        nodetool::EditorWindow window;
        setup(window);
        auto *chat = window.chatSession();
        chat->upsertThread({{"id", ThreadId}});
        chat->selectThread(ThreadId);
        type(surface(window), "Keep this draft");
        QCOMPARE(chat->draft(), QString("Keep this draft"));
        click(surface(window), "closeEditorChat");
        QVERIFY(!surface(window)->isVisible());
        window.toggleChat();
        QCOMPARE(chat->draft(), QString("Keep this draft"));
        window.newTab();
        QVERIFY(window.chatSession() != chat);
        window.activateTab(0);
        QCOMPARE(window.chatSession(), chat);
        QCOMPARE(chat->draft(), QString("Keep this draft"));
    }
    void transportAndUndo() {
        ChatServer server;
        QVERIFY(server.listen());
        nodetool::EditorWindow window;
        setup(window);
        auto *chat = window.chatSession();
        chat->connectToServer(server.url());
        QTRY_COMPARE(chat->selectedThreadId(), QString(ThreadId));
        QTRY_VERIFY(!chat->historyLoading());
        QVERIFY(window.selectNode("node-chat"));
        chat->setProvider("openai");
        chat->setModel("fixture-model");
        QTemporaryFile attachment;
        QVERIFY(attachment.open());
        attachment.write("attachment content");
        attachment.flush();
        chat->addAttachment(QUrl::fromLocalFile(attachment.fileName()));
        QTRY_COMPARE(chat->attachments().value(0).toMap()["status"].toString(), QString("ready"));
        type(surface(window), "Edit this workflow");
        click(surface(window), "sendMessage");
        QTRY_COMPARE(server.count("command", "chat_message"), 1);
        QJsonObject sent;
        for (const auto &frame : server.frames) {
            if (frame["command"] == "chat_message") {
                sent = frame["data"].toObject();
            }
        }
        QCOMPARE(sent["workflow_id"].toString(), QString("workflow-chat"));
        QCOMPARE(sent["ui_context"].toObject()["source"].toString(), QString("workflow_canvas"));
        QCOMPARE(sent["ui_context"].toObject()["selection"].toObject()["node_ids"].toArray(), QJsonArray{"node-chat"});
        QVERIFY(!sent.contains("workflow_target"));
        QCOMPARE(sent["content"].toArray().size(), 2);
        const QJsonObject reference{{"type", "workflow"}, {"id", "workflow-chat"}, {"title", "Chat fixture"}};
        const QJsonObject ui{{"source", "workflow_canvas"}, {"focused", reference},
            {"open", QJsonArray{reference}}, {"selection", QJsonObject{{"node_ids", QJsonArray{"node-chat"}}}}};
        const QJsonObject attachmentRef{{"type", "document"}, {"uri", "asset://cccccccccccccccccccccccccccccccc"}};
        const QJsonArray content{QJsonObject{{"type", "text"}, {"text", "Edit this workflow"}},
            QJsonObject{{"type", "document"}, {"document", attachmentRef}}};
        const QJsonObject expected{{"id", sent["id"]}, {"type", "message"}, {"name", ""},
            {"role", "user"}, {"thread_id", ThreadId}, {"workflow_id", "workflow-chat"},
            {"project_id", "default"}, {"permission_mode", "default"},
            {"provider", "openai"}, {"model", "fixture-model"},
            {"media_generation", QJsonValue::Null}, {"ui_context", ui}, {"content", content}};
        QCOMPARE(sent, expected);
        server.emitEvent({{"type", "chunk"}, {"thread_id", ThreadId}, {"content", "Working on your graph"}});
        QTRY_COMPARE(chat->turnStatus(), QString("streaming"));
        click(surface(window), "sendMessage");
        QTRY_COMPARE(server.count("command", "stop"), 1);
        server.emitEvent({{"type", "generation_stopped"}, {"thread_id", ThreadId}});
        QTRY_COMPARE(chat->turnStatus(), QString("idle"));
        const auto before = window.document()->snapshot();
        const auto undoCount = window.document()->undoStack()->count();
        server.emitEvent({{"type", "tool_call"}, {"thread_id", ThreadId}, {"tool_call_id", "edit-1"},
            {"name", "ui_move_node"}, {"args", QJsonObject{{"workflow_id", "workflow-chat"}, {"node_id", "node-chat"}, {"position", QJsonObject{{"x", 160}, {"y", 80}}}}}});
        QTRY_COMPARE(window.document()->undoStack()->count(), undoCount + 1);
        QCOMPARE(window.document()->node("node-chat")["future"].toInt(), 42);
        window.document()->undo();
        QCOMPARE(window.document()->snapshot(), before);
        type(surface(window), "Try again");
        click(surface(window), "sendMessage");
        QTRY_COMPARE(server.count("command", "chat_message"), 2);
        server.emitEvent({{"type", "error"}, {"thread_id", ThreadId}, {"message", "Fixture failure"}});
        QTRY_VERIFY(!chat->error().isEmpty());
    }
    void staleAccountResponse() {
        ChatServer oldServer;
        QVERIFY(oldServer.listen());
        oldServer.holdHistory = true;
        nodetool::EditorWindow window;
        setup(window);
        auto *chat = window.chatSession();
        chat->connectToServer(oldServer.url(), "old-account");
        QTRY_COMPARE(chat->selectedThreadId(), QString(ThreadId));
        QTRY_VERIFY(chat->historyLoading());
        chat->setDraft("private draft");
        window.session()->disconnectFromServer();
        QTRY_VERIFY(chat->selectedThreadId().isEmpty());
        oldServer.emitEvent({{"type", "chunk"}, {"thread_id", ThreadId}, {"content", "private stale response"}});
        QTest::qWait(100);
        QVERIFY(chat->selectedThreadId().isEmpty());
        QVERIFY(chat->draft().isEmpty());
        QCOMPARE(chat->messages()->rowCount(), 0);
    }
    void accountReplacement() {
        ChatServer oldServer;
        ChatServer newServer;
        QVERIFY(oldServer.listen());
        QVERIFY(newServer.listen());
        oldServer.holdHistory = true;
        nodetool::EditorWindow window;
        setup(window);
        auto *chat = window.chatSession();
        chat->connectToServer(oldServer.url(), "old-account");
        QTRY_VERIFY(chat->historyLoading());
        chat->setDraft("Protected draft");
        chat->setProvider("private-provider");
        chat->setModel("private-model");
        chat->connectToServer(newServer.url(), "new-account");
        QVERIFY(chat->draft().isEmpty());
        QVERIFY(chat->attachments().isEmpty());
        QVERIFY(chat->model().isEmpty());
        QVERIFY(chat->provider().isEmpty());
        QCOMPARE(chat->messages()->rowCount(), 0);
        QTRY_COMPARE(chat->selectedThreadId(), QString(ThreadId));
        QTRY_VERIFY(!chat->historyLoading());
        oldServer.emitEvent({{"type", "chunk"}, {"thread_id", ThreadId}, {"content", "Stale private text"}});
        QTest::qWait(100);
        QCOMPARE(chat->messages()->rowCount(), 0);
        newServer.emitEvent({{"type", "chunk"}, {"thread_id", ThreadId}, {"content", "Current text"}});
        QTRY_COMPARE(chat->turnStatus(), QString("streaming"));
        if (newServer.peer) {
            newServer.peer->close();
        }
        QTRY_COMPARE(chat->connectionStatus(), QString("disconnected"));
        QCOMPARE(chat->turnStatus(), QString("interrupted"));
        chat->disconnectFromServer();
        QCOMPARE(chat->messages()->rowCount(), 0);
        QVERIFY(chat->workflowThreads().isEmpty());
    }
    void captures() {
        for (const bool dark : {true, false}) {
            nodetool::EditorWindow window;
            setup(window);
            ChatServer server;
            QVERIFY(server.listen());
            window.chatSession()->connectToServer(server.url());
            QTRY_COMPARE(window.chatSession()->selectedThreadId(), QString(ThreadId));
            QTRY_VERIFY(!window.chatSession()->historyLoading());
            window.setDarkTheme(dark);
            const auto prefix = dark ? QString("dark-") : QString("light-");
            capture(window, prefix + "open-empty");
            click(surface(window), "showEditorThreads");
            capture(window, prefix + "thread-list");
            click(surface(window), "showEditorThreads");
            window.toggleChat();
            capture(window, prefix + "closed");
            window.toggleChat();
            auto *chat = window.chatSession();
            chat->upsertThread({{"id", ThreadId}});
            chat->selectThread(ThreadId);
            server.emitEvent({{"type", "chunk"}, {"thread_id", ThreadId}, {"content", "Moving the selected node to leave room for the next step."}});
            QTRY_COMPARE(chat->turnStatus(), QString("streaming"));
            capture(window, prefix + "open-streaming");
            chat->applyEvent({{"type", "tool_call"}, {"thread_id", ThreadId}, {"tool_call_id", "capture-edit"},
                {"name", "ui_move_node"}, {"args", QJsonObject{{"workflow_id", "workflow-chat"}, {"node_id", "node-chat"}, {"position", QJsonObject{{"x", 160}, {"y", 80}}}}}});
            capture(window, prefix + "tool-edit-applied");
        }
    }
};
QTEST_MAIN(EditorChatTest)
#include "EditorChatTest.moc"
