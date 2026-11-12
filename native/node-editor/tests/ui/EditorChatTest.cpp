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
#include <QUrlQuery>
#include <QQmlEngine>
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
    // Model rows by tRPC procedure, as models.*ByProvider returns them.
    QHash<QString, QJsonArray> models;
    QJsonArray assets;
    QJsonArray threads{QJsonObject{{"id", ThreadId}, {"title", "Server conversation"}, {"workflow_id", "workflow-chat"}, {"project_id", "default"}}};
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
                        // The asset API returns the stored asset record.
                        const auto body = failUploads ? QByteArray("{\"error\":\"Upload rejected\"}")
                            : QByteArray("{\"id\":\"cccccccccccccccccccccccccccccccc\",\"name\":\"brief.pdf\",\"content_type\":\"application/pdf\"}");
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
                        data = QJsonObject{{"threads", threads}, {"next", QJsonValue::Null}};
                    } else if (target.startsWith("/trpc/messages.list")) {
                        if (paginateHistory) {
                            const bool earlier = target.contains("cursor-one");
                            data = QJsonObject{{"messages", QJsonArray{QJsonObject{{"id", earlier ? "earlier" : "latest"}, {"role", "user"}, {"content", earlier ? "Earlier" : "Latest"}}}},
                                {"next", earlier ? QJsonValue(QJsonValue::Null) : QJsonValue("cursor-one")}};
                        } else {
                            data = QJsonObject{{"messages", QJsonArray{}}, {"next", QJsonValue::Null}};
                        }
                    } else if (target.startsWith("/trpc/models.providers")) {
                        const QJsonArray capabilities{"generate_message", "text_to_image", "image_to_image", "text_to_video",
                            "image_to_video", "reference_to_video", "video_to_video", "extend_video", "text_to_speech", "text_to_music"};
                        QJsonArray providers;
                        for (const auto *name : {"anthropic", "elevenlabs", "fal", "openai"}) {
                            providers.append(QJsonObject{{"provider", name}, {"capabilities", capabilities}});
                        }
                        data = providers;
                    } else if (target.startsWith("/trpc/settings.providerCatalog")) {
                        data = QJsonArray{};
                    } else if (target.startsWith("/trpc/models.") || target.startsWith("/trpc/assets.search")) {
                        const QUrl url(QString::fromUtf8(target));
                        const auto procedure = url.path().mid(6);
                        const auto input = QJsonDocument::fromJson(QUrlQuery(url).queryItemValue("input", QUrl::FullyDecoded).toUtf8()).object();
                        QJsonArray matching;
                        if (procedure == "assets.search") {
                            for (const auto &asset : assets) {
                                if (asset.toObject()["name"].toString().contains(input["query"].toString(), Qt::CaseInsensitive)) {
                                    matching.append(asset);
                                }
                            }
                            data = QJsonObject{{"assets", matching}, {"next_cursor", QJsonValue::Null}};
                        } else {
                            for (const auto &model : models.value(procedure)) {
                                if (model.toObject()["provider"] == input["provider"]) {
                                    matching.append(model);
                                }
                            }
                            data = matching;
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
    static QQuickItem *findVisible(QQuickItem *root, const QString &name) {
        if (!root->isVisible()) {
            return nullptr;
        }
        if (root->objectName() == name) {
            return root;
        }
        for (auto *child : root->childItems()) {
            if (auto *found = findVisible(child, name)) {
                return found;
            }
        }
        return nullptr;
    }
    // Popup items live in the window overlay beside the content item.
    static QQuickItem *visibleItem(QQuickWidget *widget, const QString &name) {
        auto *root = widget->quickWindow()->contentItem();
        while (root->parentItem()) {
            root = root->parentItem();
        }
        return findVisible(root, name);
    }
    static void clickVisible(QQuickWidget *widget, const QString &name) {
        QQuickItem *item = nullptr;
        QTRY_VERIFY2((item = visibleItem(widget, name)) != nullptr, qPrintable(name));
        // A control that just appeared waits for its layout pass.
        QTRY_VERIFY(item->width() > 0 && item->height() > 0);
        QTest::qWait(30);
        const auto point = item->mapToScene(QPointF(item->width() / 2, item->height() / 2));
        QTest::mouseClick(widget->quickWindow(), Qt::LeftButton, Qt::NoModifier, point.toPoint());
    }
    static void chooseOption(QQuickWidget *widget, nt::chat::ChatSession *chat, const QString &key, const QVariant &value) {
        const auto options = chat->mediaOptions(key);
        qsizetype index = -1;
        for (qsizetype i = 0; i < options.size(); ++i) {
            if (options[i].toMap()["value"] == value) {
                index = i;
            }
        }
        QVERIFY2(index >= 0, qPrintable(key + " " + value.toString()));
        clickVisible(widget, "mediaSetting-" + key);
        clickVisible(widget, "chip-option-" + QString::number(index));
        QTRY_COMPARE(chat->mediaSettings()[key], value);
    }
    static void pickModel(nt::modelpicker::Catalog *catalog, const QJsonObject &model) {
        if (!catalog->loaded()) {
            catalog->reload();
        }
        QTRY_VERIFY(catalog->loaded());
        catalog->selectModel(model["id"].toString(), model["provider"].toString());
        QTRY_COMPARE(catalog->selectedModelId(), model["id"].toString());
    }
    // Model rows for every model the payload fixture picks.
    static void serveModels(ChatServer &server, const QJsonArray &cases) {
        const QHash<QString, QString> procedures{{"image", "models.imageByProvider"}, {"imageEdit", "models.imageByProvider"},
            {"video", "models.videoByProvider"}, {"imageToVideo", "models.videoByProvider"},
            {"referenceToVideo", "models.videoByProvider"}, {"retake", "models.videoByProvider"},
            {"extend", "models.videoByProvider"}, {"audio", "models.ttsByProvider"}, {"music", "models.musicByProvider"}};
        const QJsonArray videoTasks{"text_to_video", "image_to_video", "reference_to_video", "video_to_video", "extend_video"};
        QSet<QString> seen;
        const auto add = [&](const QString &procedure, QJsonObject model) {
            if (seen.contains(procedure + model["id"].toString())) {
                return;
            }
            seen.insert(procedure + model["id"].toString());
            model.remove("type");
            if (procedure == "models.videoByProvider") {
                model["supported_tasks"] = videoTasks;
            }
            server.models[procedure].append(model);
        };
        add("models.llmByProvider", {{"id", "claude-opus-4-6"}, {"provider", "anthropic"}, {"name", "claude-opus-4-6"}});
        for (const auto &value : cases) {
            const auto spec = value.toObject();
            if (spec.contains("chatModel")) {
                add("models.llmByProvider", spec["chatModel"].toObject());
            }
            const auto settings = spec["settings"].toObject();
            for (auto it = settings.begin(); it != settings.end(); ++it) {
                add(procedures[it.key()], it.value().toObject()["model"].toObject());
            }
        }
    }
    static void setReducedMotion(QQuickWidget *widget, bool reduced) {
        auto *theme = widget->engine()->singletonInstance<QObject *>("NodeTool.UiPrimitives", "Theme");
        QVERIFY(theme);
        theme->setProperty("reducedMotion", reduced);
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
    void askAgentDraft_data() {
        QTest::addColumn<QString>("spanId");
        QTest::newRow("run") << QString{};
        QTest::newRow("span") << QStringLiteral("1111111111111111");
    }
    void askAgentDraft() {
        QFETCH(QString, spanId);
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
        if (spanId.isEmpty()) {
            click(output, "askRunAgent");
        } else {
            window.askRunAgent("run-fixture", spanId);
        }
        QTRY_COMPARE(chat->draft(), spanId.isEmpty() ? QString("Help me diagnose the selected run.") : QString("Help me diagnose the selected span."));
        QCOMPARE(server.count("command", "chat_message"), 0);
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
        QCOMPARE(data["ui_context"].toObject()["run"].toObject()["span_id"].toString(), spanId);
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
        // useDragAndDrop.ts assetToDroppedFile names the extension from the asset record.
        const QJsonObject attachmentRef{{"type", "document"}, {"uri", "asset://cccccccccccccccccccccccccccccccc.pdf"}};
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
    void payloadsMatchWebSendPath() {
        // ChatPayloadFixture.json holds chat_message data from the web send path:
        // CanvasMediaComposer.tsx into GlobalChatStore.ts trySendMessage, executed
        // by scripts/generate-chat-web-fixtures.mjs. Only the random id differs.
        QFile file(QFINDTESTDATA("ChatPayloadFixture.json"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto cases = QJsonDocument::fromJson(file.readAll()).object()["cases"].toArray();
        QVERIFY(cases.size() >= 15);
        const QHash<QString, QString> settingsKeys{{"image", "image"}, {"image_edit", "imageEdit"}, {"video", "video"},
            {"image_to_video", "imageToVideo"}, {"reference_to_video", "referenceToVideo"}, {"retake", "retake"},
            {"extend", "extend"}, {"audio", "audio"}, {"music", "music"}};
        for (const auto &value : cases) {
            const auto spec = value.toObject();
            const auto name = spec["name"].toString();
            const auto mode = spec["mode"].toString();
            ChatServer server;
            QVERIFY(server.listen());
            serveModels(server, cases);
            nodetool::EditorWindow window;
            setup(window);
            auto *chat = window.chatSession();
            auto *widget = surface(window);
            chat->connectToServer(server.url());
            QTRY_COMPARE(chat->selectedThreadId(), QString(ThreadId));
            QTRY_VERIFY(!chat->historyLoading());
            if (spec.contains("selection")) {
                QVERIFY(window.selectNode("node-chat"));
            }
            if (spec.contains("reasoning")) {
                // The level is chosen while a model that takes it is picked.
                pickModel(chat->modelCatalog(), {{"id", "claude-opus-4-6"}, {"provider", "anthropic"}});
                QTRY_VERIFY(chat->reasoningSupported());
                clickVisible(widget, "reasoningChip");
                clickVisible(widget, "reasoning-" + spec["reasoning"].toString());
                QTRY_COMPARE(chat->reasoningEffort(), spec["reasoning"].toString());
            }
            if (spec.contains("chatModel")) {
                pickModel(chat->modelCatalog(), spec["chatModel"].toObject());
                QTRY_COMPARE(chat->model(), spec["chatModel"].toObject()["id"].toString());
            }
            if (mode != "chat") {
                clickVisible(widget, "mediaModeChip");
                clickVisible(widget, "mediaMode-" + mode);
                QTRY_COMPARE(chat->mediaMode(), mode);
                const auto settings = spec["settings"].toObject()[settingsKeys[mode]].toObject();
                pickModel(chat->mediaCatalog(), settings["model"].toObject());
                for (auto it = settings.begin(); it != settings.end(); ++it) {
                    if (it.key() != "model") {
                        chooseOption(widget, chat, it.key(), it.value().toVariant());
                    }
                }
            }
            for (const auto &asset : spec["attachments"].toArray()) {
                chat->attachAsset(asset.toObject().toVariantMap());
            }
            if (!spec["prompt"].toString().isEmpty()) {
                type(widget, spec["prompt"].toString());
                QTRY_COMPARE(chat->draft(), spec["prompt"].toString());
            }
            clickVisible(widget, mode == "chat" ? "sendMessage" : "generateMedia");
            QTRY_VERIFY2(server.count("command", "chat_message") == 1, qPrintable(name + " " + chat->error()));
            QJsonObject sent;
            for (const auto &frame : server.frames) {
                if (frame["command"] == "chat_message") {
                    sent = frame["data"].toObject();
                }
            }
            QVERIFY(QRegularExpression("^[0-9a-f]{32}$").match(sent.take("id").toString()).hasMatch());
            const auto expected = spec["expected"].toObject()["data"].toObject();
            QVERIFY2(sent == expected, qPrintable(name + "\nnative " + QString::fromUtf8(QJsonDocument(sent).toJson(QJsonDocument::Compact))
                + "\nweb    " + QString::fromUtf8(QJsonDocument(expected).toJson(QJsonDocument::Compact))));
        }
    }
    void mediaModeRequiresModel() {
        ChatServer server;
        QVERIFY(server.listen());
        nodetool::EditorWindow window;
        setup(window);
        auto *chat = window.chatSession();
        auto *widget = surface(window);
        chat->connectToServer(server.url());
        QTRY_COMPARE(chat->selectedThreadId(), QString(ThreadId));
        QTRY_VERIFY(!chat->historyLoading());
        clickVisible(widget, "mediaModeChip");
        // Disabled "Soon" modes cannot be chosen.
        QTRY_VERIFY(visibleItem(widget, "mediaMode-audio_to_video"));
        QVERIFY(!visibleItem(widget, "mediaMode-audio_to_video")->isEnabled());
        clickVisible(widget, "mediaMode-video");
        QTRY_COMPARE(chat->mediaMode(), QString("video"));
        QVERIFY(visibleItem(widget, "mediaSetting-duration"));
        QVERIFY(!visibleItem(widget, "chooseChatModel"));
        QVERIFY(!visibleItem(widget, "reasoningChip"));
        type(widget, "Waves");
        clickVisible(widget, "generateMedia");
        QTRY_COMPARE(chat->error(), QString("Pick the video model to generate with."));
        QCOMPARE(server.count("command", "chat_message"), 0);
        QCOMPARE(chat->draft(), QString("Waves"));
        QVERIFY(chat->mediaRequest()["model"].isNull());
    }
    void assetMentionPicker() {
        ChatServer server;
        QVERIFY(server.listen());
        server.assets = {QJsonObject{{"id", "c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1"}, {"name", "photo.png"}, {"content_type", "image/png"}},
            QJsonObject{{"id", "f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0"}, {"name", "photos"}, {"content_type", "folder"}},
            QJsonObject{{"id", "c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2"}, {"name", "brief.pdf"}, {"content_type", "application/pdf"}}};
        nodetool::EditorWindow window;
        setup(window);
        auto *chat = window.chatSession();
        auto *widget = surface(window);
        chat->connectToServer(server.url());
        QTRY_COMPARE(chat->selectedThreadId(), QString(ThreadId));
        QTRY_VERIFY(!chat->historyLoading());
        type(widget, "Use @pho");
        QTRY_VERIFY(visibleItem(widget, "assetMentionMenu"));
        // Saved holds the library search. Folders are not offered.
        QTRY_VERIFY(visibleItem(widget, "assetMention-c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1"));
        QVERIFY(!visibleItem(widget, "assetMention-f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0"));
        QVERIFY(std::any_of(server.requests.cbegin(), server.requests.cend(), [](const auto &request) {
            return request.contains("assets.search") && request.contains("pho");
        }));
        QTest::keyClick(widget->quickWindow(), Qt::Key_Return);
        QTRY_COMPARE(chat->attachments().size(), 1);
        QCOMPARE(chat->attachments()[0].toMap()["assetId"].toString(), QString("c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1"));
        QCOMPARE(chat->draft(), QString("Use"));
        QVERIFY(!visibleItem(widget, "assetMentionMenu"));
        // A new mention opens on Recent. Escape dismisses it and keeps the text.
        for (const auto key : QByteArray(" @")) {
            QTest::keyClick(widget->quickWindow(), key);
        }
        QTRY_VERIFY(visibleItem(widget, "assetMentionMenu"));
        QVERIFY(visibleItem(widget, "assetMention-c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1"));
        QTest::keyClick(widget->quickWindow(), Qt::Key_Escape);
        QTRY_VERIFY(!visibleItem(widget, "assetMentionMenu"));
        QCOMPARE(chat->draft(), QString("Use @"));
        QTest::keyClick(widget->quickWindow(), Qt::Key_Backspace);
        clickVisible(widget, "sendMessage");
        QTRY_COMPARE(server.count("command", "chat_message"), 1);
        QJsonArray content;
        for (const auto &frame : server.frames) {
            if (frame["command"] == "chat_message") {
                content = frame["data"].toObject()["content"].toArray();
            }
        }
        const QJsonArray expected{QJsonObject{{"type", "text"}, {"text", "Use "}},
            QJsonObject{{"type", "image_url"}, {"image", QJsonObject{{"type", "image"}, {"uri", "asset://c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1.png"}}}}};
        QCOMPARE(content, expected);
    }
    void threadDateHeadingsAndDelete() {
        ChatServer server;
        QVERIFY(server.listen());
        const auto now = QDateTime::currentDateTimeUtc();
        const auto thread = [](const QString &id, const QString &title, const QDateTime &updated) {
            return QJsonObject{{"id", id}, {"title", title}, {"workflow_id", "workflow-chat"}, {"project_id", "default"},
                {"updated_at", updated.toString(Qt::ISODateWithMs)}};
        };
        const QString today = "b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1";
        const QString yesterday = "b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2";
        const QString older = "b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3";
        server.threads = {thread(today, "Today thread", now), thread(yesterday, "Yesterday thread", now.addDays(-1)),
            thread(older, "Older thread", now.addDays(-20)), thread("b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4", "Also older", now.addDays(-20))};
        nodetool::EditorWindow window;
        setup(window);
        auto *chat = window.chatSession();
        auto *widget = surface(window);
        setReducedMotion(widget, false);
        chat->connectToServer(server.url());
        QTRY_COMPARE(chat->selectedThreadId(), today);
        QTRY_VERIFY(!chat->historyLoading());
        clickVisible(widget, "showEditorThreads");
        // groupByDate.ts labels, one heading per group, newest first.
        QTRY_VERIFY(visibleItem(widget, "editorThreadGroup-Today"));
        QVERIFY(visibleItem(widget, "editorThreadGroup-Yesterday"));
        QVERIFY(visibleItem(widget, "editorThreadGroup-2 weeks ago"));
        const auto rows = chat->workflowThreadRows({});
        QCOMPARE(rows.size(), 4);
        QCOMPARE(rows[3].toMap()["header"].toString(), QString());
        QCOMPARE(rows[2].toMap()["headerDate"].toString(),
            QLocale(QLocale::English, QLocale::UnitedStates).toString(now.addDays(-20).toLocalTime().date(), "MMM dd").toUpper());
        // A search keeps headings for the matching rows only.
        QCOMPARE(chat->workflowThreadRows("older").size(), 2);
        QCOMPARE(chat->workflowThreadRows("older")[0].toMap()["header"].toString(), QString("2 weeks ago"));
        QCOMPARE(chat->workflowThreadRows("today thread")[0].toMap()["header"].toString(), QString());
        // ThreadList.tsx: the row slides out over MOTION.normal, then the delete is sent.
        auto *row = visibleItem(widget, "editorThreadRow-" + yesterday);
        QVERIFY(row);
        const auto height = row->height();
        clickVisible(widget, "deleteThread" + yesterday);
        clickVisible(widget, "confirmDeleteEditorThread");
        QTest::qWait(90);
        QVERIFY2(row->opacity() > 0 && row->opacity() < 1, qPrintable(QString::number(row->opacity())));
        QVERIFY(row->height() < height);
        QVERIFY(!std::any_of(server.requests.cbegin(), server.requests.cend(), [](const auto &request) {
            return request.contains("threads.delete");
        }));
        QTRY_VERIFY(std::any_of(server.requests.cbegin(), server.requests.cend(), [&](const auto &request) {
            return request.contains("threads.delete") && request.contains(yesterday.toUtf8());
        }));
        QTRY_VERIFY(!visibleItem(widget, "editorThreadRow-" + yesterday));
        // Reduced motion removes the row at once and keeps the delete timing.
        setReducedMotion(widget, true);
        auto *oldRow = visibleItem(widget, "editorThreadRow-" + older);
        QVERIFY(oldRow);
        clickVisible(widget, "deleteThread" + older);
        clickVisible(widget, "confirmDeleteEditorThread");
        QTest::qWait(20);
        QCOMPARE(oldRow->opacity(), 0.0);
        QCOMPARE(oldRow->height(), 0.0);
        QTRY_VERIFY(std::any_of(server.requests.cbegin(), server.requests.cend(), [&](const auto &request) {
            return request.contains("threads.delete") && request.contains(older.toUtf8());
        }));
        setReducedMotion(widget, false);
    }
    void captures() {
        for (const bool dark : {true, false}) {
            nodetool::EditorWindow window;
            setup(window);
            ChatServer server;
            QVERIFY(server.listen());
            const auto now = QDateTime::currentDateTimeUtc();
            const auto dated = [](const QString &id, const QString &title, const QDateTime &updated) {
                return QJsonObject{{"id", id}, {"title", title}, {"workflow_id", "workflow-chat"}, {"project_id", "default"},
                    {"updated_at", updated.toString(Qt::ISODateWithMs)}};
            };
            server.threads = {dated(ThreadId, "Server conversation", now),
                dated("b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1", "Storyboard pass", now.addSecs(-3600)),
                dated("b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2", "Fix the upscale step", now.addDays(-1)),
                dated("b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3", "Draft the poster", now.addDays(-3)),
                dated("b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4", "First workflow", now.addDays(-20))};
            server.models["models.llmByProvider"] = {QJsonObject{{"id", "claude-opus-4-6"}, {"provider", "anthropic"}, {"name", "Claude Opus 4.6"}}};
            server.assets = {QJsonObject{{"id", "c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1"}, {"name", "photo.png"}, {"content_type", "image/png"}},
                QJsonObject{{"id", "c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2"}, {"name", "product brief.pdf"}, {"content_type", "application/pdf"}}};
            window.chatSession()->connectToServer(server.url());
            QTRY_COMPARE(window.chatSession()->selectedThreadId(), QString(ThreadId));
            QTRY_VERIFY(!window.chatSession()->historyLoading());
            window.setDarkTheme(dark);
            const auto prefix = dark ? QString("dark-") : QString("light-");
            auto *widget = surface(window);
            capture(window, prefix + "open-empty");
            click(widget, "showEditorThreads");
            QTRY_VERIFY(visibleItem(widget, "editorThreadGroup-Yesterday"));
            capture(window, prefix + "thread-list");
            click(widget, "showEditorThreads");
            pickModel(window.chatSession()->modelCatalog(), {{"id", "claude-opus-4-6"}, {"provider", "anthropic"}});
            clickVisible(widget, "reasoningChip");
            QTRY_VERIFY(visibleItem(widget, "reasoning-high"));
            capture(window, prefix + "reasoning-menu");
            clickVisible(widget, "reasoning-high");
            type(widget, "Use @");
            QTRY_VERIFY(visibleItem(widget, "assetMention-c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2"));
            capture(window, prefix + "mention-picker");
            QTest::keyClick(widget->quickWindow(), Qt::Key_Escape);
            clickVisible(widget, "mediaModeChip");
            QTRY_VERIFY(visibleItem(widget, "mediaMode-image"));
            capture(window, prefix + "mode-menu");
            clickVisible(widget, "mediaMode-image");
            QTRY_VERIFY(visibleItem(widget, "mediaSetting-aspectRatio"));
            capture(window, prefix + "media-chips");
            clickVisible(widget, "mediaModeChip");
            clickVisible(widget, "mediaMode-chat");
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
