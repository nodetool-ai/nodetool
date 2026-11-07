#include "ui/EditorWindow.h"
#include <QDir>
#include <QJsonDocument>
#include <QPointer>
#include <QQuickItem>
#include <QQuickWidget>
#include <QQuickWindow>
#include <QSettings>
#include <QSignalBlocker>
#include <QTcpServer>
#include <QTcpSocket>
#include <QTemporaryFile>
#include <QTimer>
#include <QWebSocketServer>
#include <QtTest>
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
    bool paginateHistory = false;
    bool holdHistory = false;
    bool holdUploads = false;
    bool failUploads = false;
    QPointer<QTcpSocket> uploadSocket;
    ChatServer() {
        connect(&http, &QTcpServer::newConnection, this, [this] {
            while (http.hasPendingConnections()) {
                auto *socket = http.nextPendingConnection();
                connect(socket, &QTcpSocket::readyRead, this, [this, socket] {
                    const auto pending = socket->peek(socket->bytesAvailable());
                    const auto headerEnd = pending.indexOf("\r\n\r\n");
                    if (headerEnd < 0) {
                        return;
                    }
                    if (pending.toLower().contains("upgrade: websocket")) {
                        QObject::disconnect(socket, nullptr, this, nullptr);
                        websocket.handleConnection(socket);
                        return;
                    }
                    int length = 0;
                    for (const auto &line : pending.left(headerEnd).split('\n')) {
                        if (line.toLower().startsWith("content-length:")) {
                            length = line.mid(line.indexOf(':') + 1).trimmed().toInt();
                        }
                    }
                    if (pending.size() < headerEnd + 4 + length) {
                        return;
                    }
                    requests.append(socket->readAll());
                    const auto target = requests.last().split(' ').value(1);
                    if (holdHistory && target.startsWith("/trpc/messages.list")) {
                        return;
                    }
                    if (target.startsWith("/api/assets")) {
                        uploadSocket = socket;
                        if (holdUploads) {
                            return;
                        }
                        const auto body = failUploads
                                              ? QByteArray("{\"error\":\"Upload rejected\"}")
                                              : QByteArray("{\"id\":\"cccccccccccccccccccccccccccccccc\"}");
                        socket->write(
                            (failUploads ? QByteArray("HTTP/1.1 500 Internal Server Error\r\n")
                                         : QByteArray("HTTP/1.1 200 OK\r\n")) +
                            "Content-Type: application/json\r\nConnection: close\r\nContent-Length: " +
                            QByteArray::number(body.size()) + "\r\n\r\n" + body);
                        socket->disconnectFromHost();
                        return;
                    }
                    QJsonValue data;
                    if (target.startsWith("/trpc/threads.list")) {
                        data = QJsonObject{
                            {"threads", QJsonArray{QJsonObject{{"id", ThreadId},
                                                               {"title", "Server conversation"},
                                                               {"workflow_id", "workflow-chat"},
                                                               {"project_id", "default"},
                                                               {"workflow_id", "workflow-tools"}}}},
                            {"next", QJsonValue::Null}};
                    } else if (target.startsWith("/trpc/messages.list")) {
                        if (paginateHistory) {
                            const bool earlier = target.contains("cursor-one");
                            data = QJsonObject{
                                {"messages",
                                 QJsonArray{QJsonObject{{"id", earlier ? "earlier" : "latest"},
                                                        {"role", "user"},
                                                        {"content", earlier ? "Earlier" : "Latest"}}}},
                                {"next", earlier ? QJsonValue(QJsonValue::Null) : QJsonValue("cursor-one")}};
                        } else {
                            data = QJsonObject{{"messages", QJsonArray{}}, {"next", QJsonValue::Null}};
                        }
                    } else if (target.startsWith("/trpc/models.availableForKind")) {
                        data = QJsonArray{QJsonObject{{"id", "fixture-model"},
                                                      {"name", "Fixture"},
                                                      {"provider", "fixture"},
                                                      {"type", "language_model"}}};
                    } else if (target.startsWith("/trpc/threads.create")) {
                        data = QJsonObject{{"id", ThreadId},
                                           {"title", "Created"},
                                           {"project_id", "default"},
                                           {"workflow_id", "workflow-tools"}};
                    } else {
                        data = QJsonObject{};
                    }
                    const auto body = QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", data}}}})
                                          .toJson(QJsonDocument::Compact);
                    socket->write("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: "
                                  "close\r\nContent-Length: " +
                                  QByteArray::number(body.size()) + "\r\n\r\n" + body);
                    socket->disconnectFromHost();
                });
            }
        });
        connect(&websocket, &QWebSocketServer::newConnection, this, [this] {
            auto *socket = websocket.nextPendingConnection();
            peer = socket;
            connect(socket, &QWebSocket::textMessageReceived, this, [this, socket](const QString &text) {
                const auto object = QJsonDocument::fromJson(text.toUtf8()).object();
                frames.append(object);
                if (object["command"] == "set_mode") {
                    // The server's first acknowledgement is still MsgPack.
                    socket->sendBinaryMessage(
                        QByteArray::fromHex("81a76d657373616765b04d6f64652073657420746f2074657874"));
                }
            });
        });
    }
    bool listen() {
        return http.listen(QHostAddress::LocalHost, 0);
    }
    QUrl url() const {
        return QUrl(QStringLiteral("http://127.0.0.1:%1").arg(http.serverPort()));
    }
    void emitEvent(const QJsonObject &event, int delayMs = 0) {
        if (delayMs > 0) {
            QTimer::singleShot(delayMs, this, [this, event] { emitEvent(event); });
            return;
        }
        if (peer) {
            peer->sendTextMessage(QString::fromUtf8(QJsonDocument(event).toJson(QJsonDocument::Compact)));
        }
    }
    int count(const QString &field, const QString &value) const {
        return static_cast<int>(std::count_if(frames.cbegin(), frames.cend(),
                                              [&](const auto &frame) { return frame[field] == value; }));
    }
};
} // namespace

class EditorChatToolsTest final : public QObject {
    Q_OBJECT
    int nextCall_ = 0;
    static QJsonArray catalog() {
        return {QJsonObject{
            {"node_type", "fixture.Text"},
            {"title", "Text"},
            {"namespace", "fixture"},
            {"supports_dynamic_inputs", true},
            {"properties", QJsonArray{QJsonObject{
                               {"name", "text"}, {"default", ""}, {"type", QJsonObject{{"type", "str"}}}}}},
            {"outputs", QJsonArray{QJsonObject{{"name", "out"}, {"type", QJsonObject{{"type", "str"}}}}}}}};
    }
    void setup(nodetool::EditorWindow &window, ChatServer &server) {
        QVERIFY(server.listen());
        window.setCatalog(catalog());
        QVERIFY(window.document()->load(
            {{"id", "workflow-tools"},
             {"future_workflow", 23},
             {"graph",
              QJsonObject{{"nodes", QJsonArray{}}, {"edges", QJsonArray{}}, {"future_graph", 17}}}}));
        window.chatSession()->connectToServer(server.url());
        QTRY_VERIFY(server.peer);
        QTRY_COMPARE(window.chatSession()->connectionStatus(), QString("connected"));
        window.chatSession()->upsertThread({{"id", ThreadId}, {"workflow_id", "workflow-tools"}});
        window.chatSession()->selectThread(ThreadId);
        QTRY_VERIFY(!window.chatSession()->historyLoading());
    }
    QJsonObject call(nodetool::EditorWindow &window, ChatServer &server, const QString &name,
                     QJsonObject args) {
        const auto id = QString::number(++nextCall_);
        window.chatSession()->applyEvent({{"type", "tool_call"},
                                          {"thread_id", ThreadId},
                                          {"tool_call_id", id},
                                          {"name", name},
                                          {"args", args}});
        QElapsedTimer timer;
        timer.start();
        while (timer.elapsed() < 1000) {
            QCoreApplication::processEvents();
            for (const auto &frame : server.frames) {
                if (frame["tool_call_id"] == id && frame["type"] == "tool_result") {
                    return frame;
                }
            }
        }
        return {};
    }
    static QJsonObject add(const QString &id) {
        return {{"id", id}, {"type", "fixture.Text"}, {"position", QJsonObject{{"x", 0}, {"y", 0}}}};
    }
  private slots:
    void toolsAndUndo() {
        ChatServer server;
        nodetool::EditorWindow window;
        setup(window, server);
        for (const auto &id : {"a", "b"}) {
            auto input = add(id);
            input["properties"] = QJsonObject{{"opaque", QJsonObject{{"future", 42}}}};
            QVERIFY(call(window, server, "ui_add_node", input)["ok"].toBool());
        }
        const auto before = window.document()->snapshot();
        const auto count = window.document()->undoStack()->count();
        auto edge = call(window, server, "ui_connect_nodes",
                         {{"source_node_id", "a"},
                          {"source_handle", "out"},
                          {"target_node_id", "b"},
                          {"target_handle", "new_input"}});
        QVERIFY2(edge["ok"].toBool(), qPrintable(QString::fromUtf8(QJsonDocument(edge).toJson())));
        QCOMPARE(window.document()->undoStack()->count(), count + 1);
        window.document()->undo();
        QCOMPARE(window.document()->snapshot(), before);
        window.document()->redo();
        const QJsonValue edgeId = edge["result"].toObject()["edge_id"];
        const QList<QPair<QString, QJsonObject>> edits{
            {"ui_move_node", {{"node_id", "a"}, {"position", QJsonObject{{"x", 5}, {"y", 7}}}}},
            {"ui_set_node_title", {{"node_id", "a"}, {"title", "Renamed"}}},
            {"ui_update_node_data",
             {{"node_id", "a"},
              {"data", QJsonObject{{"properties", QJsonObject{{"text", "new"}, {"unknown", 42}}},
                                   {"color", "red"},
                                   {"custom", 17}}}}},
            {"ui_delete_edge", {{"edge_id", edgeId}}},
            {"ui_delete_node", {{"node_id", "b"}}}};
        for (const auto &edit : edits) {
            const auto snapshot = window.document()->snapshot();
            const auto undo = window.document()->undoStack()->count();
            const auto result = call(window, server, edit.first, edit.second);
            QVERIFY2(result["ok"].toBool(), qPrintable(QString::fromUtf8(QJsonDocument(result).toJson())));
            QCOMPARE(window.document()->undoStack()->count(), undo + 1);
            window.document()->undo();
            QCOMPARE(window.document()->snapshot(), snapshot);
            window.document()->redo();
        }
        QCOMPARE(window.document()->snapshot()["future_workflow"].toInt(), 23);
        QCOMPARE(window.document()->graph()["future_graph"].toInt(), 17);
        QCOMPARE(window.document()->node("a")["data"].toObject()["opaque"].toObject()["future"].toInt(), 42);
        const auto graph = call(window, server, "ui_get_graph", {});
        QVERIFY(graph["ok"].toBool());
        QCOMPARE(graph["result"]
                     .toObject()["nodes"]
                     .toArray()
                     .first()
                     .toObject()["data"]
                     .toObject()["custom"]
                     .toInt(),
                 17);
        QVERIFY(call(window, server, "ui_search_nodes",
                     {{"query", "Text"}, {"include_properties", true}, {"include_outputs", true}})["result"]
                    .toObject()["count"]
                    .toInt() > 0);
        QVERIFY(call(window, server, "ui_copy", {{"text", "clipboard fixture"}})["ok"].toBool());
        QCOMPARE(call(window, server, "ui_paste", {})["result"].toObject()["text"].toString(),
                 QString("clipboard fixture"));
        QVERIFY(!call(window, server, "ui_switch_tab", {{"tab_index", -1}})["ok"].toBool());
        QVERIFY(call(window, server, "ui_switch_tab", {{"tab_index", 0}})["ok"].toBool());
    }
    void rejectsConnectionAtomically() {
        ChatServer server;
        nodetool::EditorWindow window;
        setup(window, server);
        QVERIFY(call(window, server, "ui_add_node", add("a"))["ok"].toBool());
        const auto before = window.document()->snapshot();
        const auto count = window.document()->undoStack()->count();
        const auto result = call(window, server, "ui_connect_nodes",
                                 {{"source_node_id", "a"},
                                  {"source_handle", "out"},
                                  {"target_node_id", "a"},
                                  {"target_handle", "invented"}});
        QVERIFY(!result["ok"].toBool());
        QVERIFY(result["result"].toObject()["error"].isString());
        QCOMPARE(window.document()->snapshot(), before);
        QCOMPARE(window.document()->undoStack()->count(), count);
    }
    void malformedAndStale() {
        ChatServer server;
        nodetool::EditorWindow window;
        setup(window, server);
        auto invalidPosition = add("invalid-position");
        invalidPosition["position"] = QJsonObject{{"x", "bad"}, {"y", 0}};
        QVERIFY(!call(window, server, "ui_add_node", invalidPosition)["ok"].toBool());
        QVERIFY(window.document()->nodes().isEmpty());
        QVERIFY(!call(window, server, "ui_get_graph", {{"workflow_id", ""}})["ok"].toBool());
        for (const auto &name :
             {"ui_add_node", "ui_connect_nodes", "ui_move_node", "ui_set_node_title", "ui_update_node_data",
              "ui_delete_node", "ui_delete_edge", "ui_search_nodes", "ui_search_models", "ui_switch_tab",
              "ui_copy", "ui_open_workflow", "ui_run_workflow"}) {
            QVERIFY2(!call(window, server, name, {{"node_id", 42}})["ok"].toBool(), name);
        }
        QVERIFY(call(window, server, "ui_add_node", add("a"))["ok"].toBool());
        const auto before = window.document()->snapshot();
        window.newTab();
        // An explicit old workflow is edited in the background, as on web.
        auto *currentChat = window.chatSession();
        currentChat->connectToServer(server.url());
        QTest::qWait(20);
        auto args = add("old-target");
        args["workflow_id"] = "workflow-tools";
        QVERIFY(call(window, server, "ui_add_node", args)["ok"].toBool());
        QVERIFY(window.document()->nodes().isEmpty());
        window.activateTab(0);
        QCOMPARE(window.document()->nodes().size(), 2);
        QVERIFY(window.document()->snapshot() != before);
        const auto snapshot = window.document()->snapshot();
        auto invalid = snapshot;
        auto graph = invalid["graph"].toObject();
        auto nodes = graph["nodes"].toArray();
        auto node = nodes.first().toObject();
        node["type"] = 42;
        nodes[0] = node;
        graph["nodes"] = nodes;
        invalid["graph"] = graph;
        (void)window.document()->load(invalid);
        QVERIFY(window.document()->isReadOnly());
        const auto readOnly = window.document()->snapshot();
        QVERIFY(!call(window, server, "ui_add_node", add("blocked"))["ok"].toBool());
        QCOMPARE(window.document()->snapshot(), readOnly);
    }
    void codePortsAndRevision() {
        ChatServer server;
        nodetool::EditorWindow window;
        setup(window, server);
        const auto empty = call(window, server, "ui_get_graph", {});
        const auto emptyRevision = empty["result"].toObject()["document_revision"].toString();
        // The web manifest constrains based_on_revision to this form.
        QVERIFY(QRegularExpression("^graph:[a-f0-9]{64}$").match(emptyRevision).hasMatch());
        QCOMPARE(call(window, server, "ui_get_graph", {})["result"].toObject()["document_revision"].toString(),
                 emptyRevision);
        auto metadata = catalog();
        metadata.append(QJsonObject{
            {"node_type", "nodetool.code.Code"},
            {"supports_dynamic_inputs", true},
            {"properties", QJsonArray{QJsonObject{
                               {"name", "code"}, {"type", QJsonObject{{"type", "str"}}}, {"default", ""}}}},
            {"outputs", QJsonArray{}}});
        window.setCatalog(metadata);
        auto code = add("code");
        code["type"] = "nodetool.code.Code";
        code["properties"] = QJsonObject{{"code", "return { result: inputs.text };"}};
        QVERIFY(call(window, server, "ui_add_node", code)["ok"].toBool());
        QVERIFY(call(window, server, "ui_add_node", add("source"))["ok"].toBool());
        QVERIFY(call(window, server, "ui_connect_nodes",
                     {{"source_node_id", "source"},
                      {"source_handle", "out"},
                      {"target_node_id", "code"},
                      {"target_handle", "text"}})["ok"]
                    .toBool());
        const auto before = window.document()->snapshot();
        QVERIFY(!call(window, server, "ui_connect_nodes",
                      {{"source_node_id", "source"},
                       {"source_handle", "out"},
                       {"target_node_id", "code"},
                       {"target_handle", "not_in_body"}})["ok"]
                     .toBool());
        QCOMPARE(window.document()->snapshot(), before);
        auto stale = add("stale");
        stale["based_on_revision"] = empty["result"].toObject()["document_revision"];
        QVERIFY(!call(window, server, "ui_add_node", stale)["ok"].toBool());
        QCOMPARE(window.document()->snapshot(), before);
        QVERIFY(call(window, server, "ui_update_node_data",
                     {{"node_id", "code"},
                      {"data", QJsonObject{{"properties", QJsonObject{{"code", "return { broken:"}}}}}})["ok"]
                    .toBool());
        QVERIFY(!call(window, server, "ui_get_graph", {})["result"]
                     .toObject()["validation"]
                     .toObject()["errors"]
                     .toArray()
                     .isEmpty());
    }
    void discoveryAndAccount() {
        ChatServer server;
        nodetool::EditorWindow window;
        setup(window, server);
        QVERIFY(!call(window, server, "ui_search_models", {{"kind", "text_generation"}})["ok"].toBool());
        window.session()->credentialsChanged(server.url(), "fixture-token", "fixture-user");
        window.askAgent({});
        QTRY_VERIFY(server.peer);
        QTRY_COMPARE(window.chatSession()->connectionStatus(), QString("connected"));
        window.chatSession()->upsertThread({{"id", ThreadId}, {"workflow_id", "workflow-tools"}});
        window.chatSession()->selectThread(ThreadId);
        QTRY_VERIFY(!window.chatSession()->historyLoading());
        const auto models = call(window, server, "ui_search_models", {{"kind", "text_generation"}});
        QVERIFY2(models["ok"].toBool(), qPrintable(QString::fromUtf8(QJsonDocument(models).toJson())));
        QCOMPARE(models["result"].toObject()["models"].toArray().size(), 1);
        QVERIFY(!call(window, server, "ui_search_models", {{"kind", "invalid"}})["ok"].toBool());
        QVERIFY(call(window, server, "ui_open_workflow", {{"workflow_id", "workflow-tools"}})["ok"].toBool());
        QVERIFY(
            call(window, server, "ui_open_document", {{"type", "workflow"}, {"id", "workflow-tools"}})["ok"]
                .toBool());
        QVERIFY(
            !call(window, server, "ui_open_document", {{"type", "sketch"}, {"id", "workflow-tools"}})["ok"]
                 .toBool());
        const auto before = window.document()->snapshot();
        auto *oldPeer = server.peer.data();
        window.session()->credentialsChanged({}, {}, {});
        if (oldPeer) {
            oldPeer->sendTextMessage(
                QString::fromUtf8(QJsonDocument(QJsonObject{{"type", "tool_call"},
                                                            {"thread_id", ThreadId},
                                                            {"tool_call_id", "stale-account"},
                                                            {"name", "ui_add_node"},
                                                            {"args", add("stale-node")}})
                                      .toJson()));
        }
        QTest::qWait(30);
        QCOMPARE(window.document()->snapshot(), before);
    }
    void runWorkflow() {
        ChatServer server;
        nodetool::EditorWindow window;
        setup(window, server);
        QVERIFY(!call(window, server, "ui_run_workflow", {{"workflow_id", "workflow-tools"}})["ok"].toBool());
        window.session()->connectToServer(server.url(), {}, "fixture-user");
        window.askAgent({});
        QTRY_VERIFY(window.session()->connected());
        QTRY_COMPARE(window.chatSession()->connectionStatus(), QString("connected"));
        window.chatSession()->upsertThread({{"id", ThreadId}, {"workflow_id", "workflow-tools"}});
        window.chatSession()->selectThread(ThreadId);
        QTRY_VERIFY(!window.chatSession()->historyLoading());
        const auto result =
            call(window, server, "ui_run_workflow",
                 {{"workflow_id", "workflow-tools"}, {"params", QJsonObject{{"input", "fixture"}}}});
        QVERIFY2(result["ok"].toBool(), qPrintable(QString::fromUtf8(QJsonDocument(result).toJson())));
        QVERIFY(!result["result"].toObject()["job_id"].toString().isEmpty());
        QVERIFY(!call(window, server, "ui_get_graph", {{"workflow_id", "not-open"}})["ok"].toBool());
    }
    void resourcePrefixes() {
        ChatServer server;
        nodetool::EditorWindow window;
        setup(window, server);
        QVERIFY(call(window, server, "ui_add_node", add("abcdefabcdef11111111111111111111"))["ok"].toBool());
        QVERIFY(call(window, server, "ui_set_node_title",
                     {{"node_id", "abcdefabcdef"}, {"title", "Prefix title"}})["ok"]
                    .toBool());
        QVERIFY(call(window, server, "ui_add_node", add("abcdefabcdef22222222222222222222"))["ok"].toBool());
        const auto before = window.document()->snapshot();
        QVERIFY(!call(window, server, "ui_delete_node", {{"node_id", "abcdefabcdef"}})["ok"].toBool());
        QCOMPARE(window.document()->snapshot(), before);
        QVERIFY(!call(window, server, "ui_delete_node", {{"node_id", "abcdef"}})["ok"].toBool());
        QCOMPARE(window.document()->snapshot(), before);
    }
    void malformedArgumentEnvelope() {
        ChatServer server;
        nodetool::EditorWindow window;
        setup(window, server);
        for (const auto &name : {"ui_get_graph", "ui_paste", "ui_add_node"}) {
            const auto id = QString::number(++nextCall_);
            window.chatSession()->applyEvent({{"type", "tool_call"},
                                              {"thread_id", ThreadId},
                                              {"tool_call_id", id},
                                              {"name", name},
                                              {"args", QJsonArray{}}});
            QTRY_VERIFY(server.count("tool_call_id", id) > 0);
            for (const auto &frame : server.frames) {
                if (frame["tool_call_id"] != id) {
                    continue;
                }
                QVERIFY(!frame["ok"].toBool());
                QVERIFY(frame["result"].toObject()["error"].isString());
            }
        }
        QVERIFY(window.document()->nodes().isEmpty());
        QCOMPARE(window.document()->undoStack()->count(), 0);
    }
    // generateLargeDataset in web/src/utils/__tests__/nodeSearch.test.ts.
    static QJsonArray generatedCatalog(int count) {
        const QStringList namespaces{"math", "string", "image", "audio", "video", "data", "ai", "ml"};
        const QStringList operations{"add", "subtract", "multiply", "divide", "process", "transform", "convert", "analyze"};
        QJsonArray nodes;
        for (int i = 0; i < count; ++i) {
            auto nameSpace = namespaces[i % namespaces.size()];
            if (i % 3 == 0) {
                nameSpace += ".sub" + QString::number(i / 10);
            }
            const auto operation = operations[i % operations.size()];
            nodes.append(QJsonObject{
                {"namespace", nameSpace},
                {"node_type", nameSpace + "." + operation + QString::number(i)},
                {"title", operation.left(1).toUpper() + operation.mid(1) + " " + QString::number(i)},
                {"description", "Description for " + operation + " operation number " + QString::number(i)},
                {"properties", QJsonArray{}},
                {"outputs", QJsonArray{}}});
        }
        return nodes;
    }
    void manifestMatchesWeb() {
        // tool-manifest.json is FrontendToolRegistry.getManifest() output for the
        // tools this host implements, from scripts/generate-chat-web-fixtures.mjs.
        QFile file(QFINDTESTDATA("../../resources/chat/tool-manifest.json"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        QHash<QString, QJsonObject> web;
        for (const auto &entry : QJsonDocument::fromJson(file.readAll()).array()) {
            web.insert(entry.toObject()["name"].toString(), entry.toObject());
        }
        const QStringList implemented{"ui_get_graph",      "ui_add_node",         "ui_connect_nodes",
                                      "ui_move_node",      "ui_set_node_title",   "ui_delete_node",
                                      "ui_delete_edge",    "ui_update_node_data", "ui_search_nodes",
                                      "ui_search_models",  "ui_switch_tab",       "ui_copy",
                                      "ui_paste",          "ui_open_workflow",    "ui_run_workflow",
                                      "ui_open_document"};
        QCOMPARE(web.size(), implemented.size());
        ChatServer server;
        nodetool::EditorWindow window;
        setup(window, server);
        QJsonArray advertised;
        for (const auto &frame : server.frames) {
            if (frame["type"] == "client_tools_manifest") {
                advertised = frame["tools"].toArray();
            }
        }
        QCOMPARE(advertised.size(), implemented.size());
        for (const auto &entry : advertised) {
            const auto tool = entry.toObject();
            const auto name = tool["name"].toString();
            QVERIFY2(implemented.contains(name), qPrintable(name));
            QVERIFY2(web.contains(name), qPrintable(name));
            QCOMPARE(tool, web[name]);
            QVERIFY(!tool["description"].toString().isEmpty());
            QCOMPARE(tool["parameters"].toObject()["type"].toString(), QString("object"));
        }
        // An advertised tool reaches its handler rather than the unknown-tool path.
        for (const auto &name : implemented) {
            const auto result = call(window, server, name, {});
            QVERIFY2(!result["result"].toObject()["error"].toString().startsWith("Unknown tool"), qPrintable(name));
        }
    }
    void searchRankingMatchesWeb() {
        // ChatSearchFixture.json holds web ui_search_nodes results for the query
        // sets of the web ranking tests. scripts/generate-chat-web-fixtures.mjs
        // writes it by executing the web tool.
        QFile file(QFINDTESTDATA("ChatSearchFixture.json"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto fixture = QJsonDocument::fromJson(file.readAll()).object();
        const auto catalogs = fixture["catalogs"].toObject();
        const auto cases = fixture["cases"].toArray();
        QVERIFY(cases.size() >= 40);
        ChatServer server;
        nodetool::EditorWindow window;
        setup(window, server);
        QString loaded;
        int nonEmpty = 0;
        for (const auto &value : cases) {
            const auto spec = value.toObject();
            const auto name = spec["catalog"].toString();
            if (name != loaded) {
                window.setCatalog(name.startsWith("generated-") ? generatedCatalog(name.mid(10).toInt())
                                                                : catalogs[name].toArray());
                loaded = name;
            }
            const auto frame = call(window, server, "ui_search_nodes", spec["args"].toObject());
            const auto label = name + " " + QString::fromUtf8(QJsonDocument(spec["args"].toObject()).toJson(QJsonDocument::Compact));
            QVERIFY2(frame["ok"].toBool(), qPrintable(label));
            const auto actual = frame["result"].toObject();
            const auto expected = spec["result"].toObject();
            if (actual != expected) {
                QStringList actualTypes;
                QStringList expectedTypes;
                for (const auto &entry : actual["results"].toArray()) {
                    actualTypes.append(entry.toObject()["node_type"].toString());
                }
                for (const auto &entry : expected["results"].toArray()) {
                    expectedTypes.append(entry.toObject()["node_type"].toString());
                }
                QFAIL(qPrintable(label + "\nnative " + QString::number(actual["total_matches"].toInt()) + " " +
                                 actualTypes.join(", ") + "\nweb    " +
                                 QString::number(expected["total_matches"].toInt()) + " " + expectedTypes.join(", ")));
            }
            nonEmpty += expected["results"].toArray().isEmpty() ? 0 : 1;
        }
        QVERIFY(nonEmpty >= 30);
    }
    void revisionCost() {
        ChatServer server;
        nodetool::EditorWindow window;
        setup(window, server);
        QList<double> costs;
        for (const int count : {250, 500, 1000, 2000}) {
            QJsonArray nodes;
            for (int i = 0; i < count; ++i) {
                nodes.append(QJsonObject{
                    {"id", QString("n%1").arg(i)},
                    {"type", "fixture.Text"},
                    {"data", QJsonObject{{"text", QString("value %1").arg(i)}}},
                    {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", i * 300}, {"y", 0}}}}}});
            }
            QVERIFY(window.document()->load(
                {{"id", "workflow-tools"},
                 {"graph", QJsonObject{{"nodes", nodes}, {"edges", QJsonArray{}}}}}));
            QCoreApplication::processEvents();
            constexpr int calls = 20;
            // The fastest of three batches discounts load from other processes.
            double best = 0;
            for (int batch = 0; batch < 3; ++batch) {
                QElapsedTimer timer;
                timer.start();
                // Dispatch, the edit and its result revision run synchronously in applyEvent.
                // Canvas projection waits for the event loop and is not timed.
                for (int i = 0; i < calls; ++i) {
                    window.chatSession()->applyEvent(
                        {{"type", "tool_call"},
                         {"thread_id", ThreadId},
                         {"tool_call_id", QString("cost-%1-%2-%3").arg(count).arg(batch).arg(i)},
                         {"name", "ui_move_node"},
                         {"args", QJsonObject{{"node_id", "n0"},
                                              {"position", QJsonObject{{"x", i}, {"y", batch}}}}}});
                }
                const double cost = double(timer.nsecsElapsed()) / calls / 1000;
                best = batch == 0 ? cost : std::min(best, cost);
                QCoreApplication::processEvents();
            }
            costs.append(best);
            qInfo().nospace() << "N=" << count << " ui_move_node_us=" << costs.last();
        }
        QVERIFY2(costs.last() < costs.first() * 3, "Per-call chat edit cost grew with graph size");
    }
    void twoThousandNodes() {
        ChatServer server;
        nodetool::EditorWindow window;
        setup(window, server);
        // LargeGraphTest measures growth through 2,000 individual commands with
        // and without projection. This test checks chat dispatch at that size.
        const QSignalBlocker projection(window.document());
        for (int i = 0; i < 1999; ++i) {
            QVERIFY(window.document()->applyCommand({{"op", "addNode"}, {"node", QJsonObject{
                {"id", QString("n%1").arg(i)}, {"type", "fixture.Text"}}}}));
        }
        const auto result = call(window, server, "ui_add_node", add("n1999"));
        QVERIFY(result["ok"].toBool());
        QCOMPARE(window.document()->nodes().size(), 2000);
    }
};
QTEST_MAIN(EditorChatToolsTest)
#include "EditorChatToolsTest.moc"
