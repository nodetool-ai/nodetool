#include "properties/ModelPickerController.h"
#include "properties/PropertyFields.h"
#include "document/WorkflowDocument.h"
#include "graph/NodeCreation.h"
#include "ModelLabels.h"
#include "ModelPickerCatalog.h"
#include <QDesktopServices>
#include <QDir>
#include <QJSValue>
#include <QJsonArray>
#include <QJsonDocument>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWindow>
#include <QSettings>
#include <QTcpServer>
#include <QTcpSocket>
#include <QTemporaryDir>
#include <QUrlQuery>
#include <QWebSocket>
#include <QWebSocketServer>
#include <QtTest>
#include <functional>
#include <memory>
using namespace nodetool::node_editor;

namespace {
// A tRPC and /ws/download server that answers with the router's response shapes
// (packages/websocket/src/trpc/routers/models.ts and settings.ts).
class FakeServer final : public QObject {
public:
    struct Request {
        QByteArray method;
        QString procedure;
        QJsonValue input;
        QByteArray authorization;
        QByteArray user;
    };
    using Route = std::function<QJsonValue(const Request&)>;
    QList<Request> requests;
    QHash<QString, Route> routes;
    QSet<QString> held;
    QList<QPair<QPointer<QTcpSocket>, Request>> heldReplies;
    QList<QPointer<QWebSocket>> downloadClients;
    QList<QJsonObject> commands;
    QByteArray downloadAuthorization;
    QByteArray downloadUser;

    FakeServer() : m_sockets(QStringLiteral("fake"), QWebSocketServer::NonSecureMode) {
        m_tcp.listen(QHostAddress::LocalHost);
        connect(&m_tcp, &QTcpServer::newConnection, this, [this] {
            while (m_tcp.hasPendingConnections()) {
                auto* socket = m_tcp.nextPendingConnection();
                connect(socket, &QTcpSocket::readyRead, this, [this, socket] { read(socket); });
            }
        });
        connect(&m_sockets, &QWebSocketServer::newConnection, this, [this] {
            while (m_sockets.hasPendingConnections()) {
                auto* client = m_sockets.nextPendingConnection();
                client->setParent(this);
                downloadAuthorization = client->request().rawHeader("Authorization");
                downloadUser = client->request().rawHeader("x-user-id");
                downloadClients.append(client);
                connect(client, &QWebSocket::textMessageReceived, this, [this](const QString& text) {
                    commands.append(QJsonDocument::fromJson(text.toUtf8()).object());
                });
            }
        });
    }
    QUrl url() const { return QUrl(QStringLiteral("http://127.0.0.1:%1").arg(m_tcp.serverPort())); }
    int count(const QString& procedure) const {
        int total = 0;
        for (const auto& request : requests) {
            total += request.procedure == procedure ? 1 : 0;
        }
        return total;
    }
    QList<Request> calls(const QString& procedure) const {
        QList<Request> result;
        for (const auto& request : requests) {
            if (request.procedure == procedure) {
                result.append(request);
            }
        }
        return result;
    }
    void release(const QString& procedure, const QJsonValue& data) {
        held.remove(procedure);
        for (const auto& [socket, request] : std::as_const(heldReplies)) {
            if (socket && request.procedure == procedure) {
                send(socket, data);
            }
        }
    }
    void frame(const QJsonObject& value) {
        for (const auto& client : std::as_const(downloadClients)) {
            if (client) {
                client->sendTextMessage(QString::fromUtf8(QJsonDocument(value).toJson(QJsonDocument::Compact)));
            }
        }
    }
    int openDownloadClients() const {
        int open = 0;
        for (const auto& client : downloadClients) {
            open += client && client->state() == QAbstractSocket::ConnectedState ? 1 : 0;
        }
        return open;
    }

    static void send(QTcpSocket* socket, const QJsonValue& data) {
        const auto body = QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", data}}}}).toJson(QJsonDocument::Compact);
        socket->write("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: "
                      + QByteArray::number(body.size()) + "\r\n\r\n" + body);
        socket->disconnectFromHost();
    }

private:
    void read(QTcpSocket* socket) {
        const auto bytes = socket->peek(socket->bytesAvailable() + 65536);
        const auto end = bytes.indexOf("\r\n\r\n");
        if (end < 0) {
            return;
        }
        const auto head = bytes.left(end);
        if (head.toLower().contains("upgrade: websocket")) {
            socket->disconnect(this);
            m_sockets.handleConnection(socket);
            return;
        }
        qint64 length = 0;
        Request request;
        for (const auto& line : head.split('\n')) {
            const auto lower = line.toLower();
            if (lower.startsWith("content-length:")) {
                length = line.mid(15).trimmed().toLongLong();
            } else if (lower.startsWith("authorization:")) {
                request.authorization = line.mid(14).trimmed();
            } else if (lower.startsWith("x-user-id:")) {
                request.user = line.mid(10).trimmed();
            }
        }
        if (bytes.size() < end + 4 + length) {
            return;
        }
        socket->read(end + 4 + length);
        const auto parts = head.split(' ');
        request.method = parts.value(0);
        const auto target = QUrl(QStringLiteral("http://fixture") + QString::fromUtf8(parts.value(1)));
        request.procedure = target.path().mid(QStringLiteral("/trpc/").size());
        request.input = request.method == "GET"
            ? QJsonDocument::fromJson(QUrlQuery(target).queryItemValue("input", QUrl::FullyDecoded).toUtf8()).object()
            : QJsonValue(QJsonDocument::fromJson(bytes.mid(end + 4, length)).isArray()
                             ? QJsonValue(QJsonDocument::fromJson(bytes.mid(end + 4, length)).array())
                             : QJsonValue(QJsonDocument::fromJson(bytes.mid(end + 4, length)).object()));
        requests.append(request);
        if (held.contains(request.procedure)) {
            heldReplies.append({socket, request});
            return;
        }
        const auto route = routes.value(request.procedure);
        send(socket, route ? route(request) : QJsonValue(QJsonArray{}));
    }
    QTcpServer m_tcp;
    QWebSocketServer m_sockets;
};

QJsonObject execution(const QString& kind, const QString& state = QStringLiteral("ready")) {
    const QHash<QString, QString> labels{{"api", "API"}, {"local", "Local"}, {"server", "Server"}, {"unavailable", "Unavailable"}};
    return {{"kind", kind}, {"state", state}, {"label", labels.value(kind)}, {"reason", QJsonValue::Null}};
}
QJsonObject provider(const QString& id, const QJsonArray& capabilities, const QString& access, const QString& name) {
    return {{"provider", id}, {"capabilities", capabilities}, {"access", access}, {"display_name", name}};
}
QJsonObject providerSetting(const QString& id, const QString& name, bool configured, const QJsonArray& keys) {
    return {{"provider", id}, {"name", name}, {"configured", configured}, {"keys", keys}};
}

// Receives the provider settings URL instead of a browser.
class UrlSink final : public QObject {
    Q_OBJECT
public:
    QList<QUrl> opened;
public slots:
    void openUrl(const QUrl& url) { opened.append(url); }
};

QQuickItem* find(QQuickItem* root, const QString& name) {
    if (!root) {
        return nullptr;
    }
    if (root->objectName() == name && root->isVisible()) {
        return root;
    }
    for (auto* child : root->childItems()) {
        if (auto* found = find(child, name)) {
            return found;
        }
    }
    return nullptr;
}
QString texts(QQuickItem* root) {
    QStringList result;
    std::function<void(QQuickItem*)> walk = [&](QQuickItem* item) {
        if (!item->isVisible()) {
            return;
        }
        const auto text = item->property("text");
        if (text.isValid() && !text.toString().isEmpty()) {
            result.append(text.toString());
        }
        for (auto* child : item->childItems()) {
            walk(child);
        }
    };
    walk(root);
    return result.join('\n');
}

// One model field in a window, driven by real pointer and key events.
struct Field {
    std::unique_ptr<QQuickWindow> window = std::make_unique<QQuickWindow>();
    std::unique_ptr<QObject> editor;
    QQuickItem* item = nullptr;
    QPointer<QObject> theme;
    Field(QQmlEngine& engine, QObject* controller, const QVariantMap& descriptor, const QVariant& value) {
        window->resize(900, 720);
        theme = engine.singletonInstance<QObject*>("NodeTool.UiPrimitives", "Theme");
        window->setColor(theme ? theme->property("surfaceCanvas").value<QColor>() : QColor());
        QQmlComponent component(&engine, QUrl(QStringLiteral("qrc:/editor/ModelPropertyEditor.qml")));
        editor.reset(component.createWithInitialProperties({{"descriptor", descriptor}, {"value", value}, {"writable", true}, {"controller", QVariant::fromValue(controller)}}));
        item = qobject_cast<QQuickItem*>(editor.get());
        if (!item) {
            qWarning() << component.errorString();
            return;
        }
        item->setParentItem(window->contentItem());
        item->setPosition({24, 24});
        item->setWidth(320);
        window->show();
        QVERIFY(QTest::qWaitForWindowExposed(window.get()));
    }
    QQuickItem* find(const QString& name) const { return ::find(window->contentItem(), name); }
    void click(QQuickItem* target) const {
        QTest::mouseClick(window.get(), Qt::LeftButton, Qt::NoModifier, target->mapToScene({target->width() / 2, target->height() / 2}).toPoint());
    }
    bool clickNamed(const QString& name) const {
        auto* target = find(name);
        if (!target) {
            return false;
        }
        click(target);
        return true;
    }
    QObject* popup() const { return editor->property("popup").value<QObject*>(); }
    bool open() const {
        auto* button = find(QStringLiteral("model-select-") + item->property("descriptor").toMap().value("name").toString());
        if (!button) {
            return false;
        }
        click(button);
        return QTest::qWaitFor([this] { return popup() && popup()->property("opened").toBool(); }, 5000);
    }
    void capture(const QString& name) const {
        const auto directory = qEnvironmentVariable("NODETOOL_MODEL_PICKER_CAPTURE_DIR");
        if (directory.isEmpty()) {
            return;
        }
        QDir().mkpath(directory);
        if (theme) {
            window->setColor(theme->property("surfaceCanvas").value<QColor>());
        }
        QTest::qWait(50);
        QVERIFY(window->grabWindow().save(QDir(directory).filePath(name + ".png")));
    }
};

struct Host {
    QTemporaryDir settings;
    FakeServer server;
    std::unique_ptr<ModelPickerController> controller = std::make_unique<ModelPickerController>();
    std::unique_ptr<QQmlEngine> engine = std::make_unique<QQmlEngine>();
    Host() {
        QSettings::setPath(QSettings::IniFormat, QSettings::UserScope, settings.path());
        engine->addImportPath(QStringLiteral("qrc:/qt/qml"));
    }
    void connectAs(const QString& user, const QString& token = QStringLiteral("secret")) {
        controller->configure(server.url(), token, user);
    }
    // A fresh controller and engine, as a restarted editor has.
    void restart() {
        engine.reset();
        controller = std::make_unique<ModelPickerController>();
        engine = std::make_unique<QQmlEngine>();
        engine->addImportPath(QStringLiteral("qrc:/qt/qml"));
    }
    void setTheme(int scheme) {
        auto* theme = engine->singletonInstance<QObject*>("NodeTool.UiPrimitives", "Theme");
        if (theme) {
            theme->setProperty("preference", scheme);
        }
    }
    nt::modelpicker::Catalog* catalog(const Field& field) const {
        return qobject_cast<nt::modelpicker::Catalog*>(field.editor->property("catalog").value<QObject*>());
    }
};
QVariantMap descriptor(const QString& modelType, const QString& nodeType = {}, const QStringList& allowed = {}) {
    return {{"name", "model"}, {"label", "Model"}, {"modelType", modelType}, {"nodeType", nodeType},
            {"allowedProviders", allowed}, {"modelTasks", modelTasksForNodeType(nodeType)}};
}
QVariantMap committed(QSignalSpy& spy) {
    const auto value = spy.last().first();
    return value.canConvert<QJSValue>() ? value.value<QJSValue>().toVariant().toMap() : value.toMap();
}
} // namespace

class ModelPickerTest final : public QObject {
    Q_OBJECT
private slots:
    void incompatibleTaskDefaultDoesNotRetryGlobal() {
        const QJsonObject metadata{{"node_type", "nodetool.image.Upscale"}, {"properties", QJsonArray{QJsonObject{{"name", "model"}, {"type", "image_model"}}}}};
        nodetool::NodeCreationOptions options;
        options.defaultModels = {{"image_model", QJsonObject{{"provider", "cloud"}, {"id", "compatible"}, {"supported_tasks", QJsonArray{"upscale"}}}},
            {"image_model:upscale", QJsonObject{{"provider", "cloud"}, {"id", "incompatible"}, {"supported_tasks", QJsonArray{"text_to_image"}}}}};
        const QJsonObject overrides{{"model", QJsonValue::Null}};
        const auto blocked = nodetool::createNativeNode(metadata, {}, {}, overrides, options);
        QVERIFY(blocked.value("data").toObject().value("model").isNull());
        options.defaultModels.remove("image_model:upscale");
        const auto fallback = nodetool::createNativeNode(metadata, {}, {}, overrides, options);
        QCOMPARE(fallback.value("data").toObject().value("model").toObject().value("id").toString(), "compatible");
    }
    void imageTaskPinsAreIndependentAndFallbackToGlobal() {
        Host host;
        host.connectAs("task-pins");
        auto* global = qobject_cast<nt::modelpicker::Catalog*>(host.controller->catalogFor("image_model", {}, {}));
        auto* upscale = qobject_cast<nt::modelpicker::Catalog*>(host.controller->catalogFor("image_model", {}, {}, "nodetool.image.Upscale"));
        auto* remove = qobject_cast<nt::modelpicker::Catalog*>(host.controller->catalogFor("image_model", {}, {}, "nodetool.image.RemoveBackground"));
        QVERIFY(global && upscale && remove);
        QVERIFY(global != upscale && upscale != remove);
        global->setDefault("legacy/global/full-id", "offline");
        upscale->setDefault("legacy/upscale/full-id", "offline");
        remove->setDefault("legacy/remove/full-id", "offline");
        QJsonArray metadata;
        QJsonArray nodes;
        for (const auto& type : {"nodetool.image.TextToImage", "nodetool.image.Upscale", "nodetool.image.RemoveBackground"}) {
            metadata.append(QJsonObject{{"node_type", type}, {"properties", QJsonArray{QJsonObject{{"name", "model"}, {"type", "image_model"}}}}});
            nodes.append(QJsonObject{{"id", type}, {"type", type}, {"data", QJsonObject{{"unknown", 42}}}});
        }
        WorkflowDocument document;
        document.setNodeMetadata(metadata);
        const QJsonObject workflow{{"graph", QJsonObject{{"nodes", nodes}, {"edges", QJsonArray{}}}}};
        QVERIFY(document.load(workflow));
        host.controller->fillWorkflowDefaults(&document, metadata);
        const auto modelId = [&document](const QString& type) { return document.node(type).value("data").toObject().value("model").toObject().value("id").toString(); };
        QTRY_COMPARE(modelId("nodetool.image.Upscale"), "legacy/upscale/full-id");
        QTRY_COMPARE(modelId("nodetool.image.RemoveBackground"), "legacy/remove/full-id");
        QTRY_COMPARE(modelId("nodetool.image.TextToImage"), "legacy/global/full-id");
        QCOMPARE(document.node("nodetool.image.Upscale").value("data").toObject().value("unknown").toInt(), 42);
        QCOMPARE(document.undoStack()->count(), 0);
        QVERIFY(!document.undoStack()->isClean());
        upscale->setDefault("legacy/upscale/full-id", "offline");
        QVERIFY(document.load(workflow));
        host.controller->fillWorkflowDefaults(&document, metadata);
        QTRY_COMPARE(modelId("nodetool.image.Upscale"), "legacy/global/full-id");
        QTRY_COMPARE(modelId("nodetool.image.RemoveBackground"), "legacy/remove/full-id");
    }
    void curatedLanguagePrecedesRankedSeed_data() {
        QTest::addColumn<bool>("curatedAvailable");
        QTest::addColumn<bool>("cloudAvailable");
        QTest::addColumn<QString>("expected");
        QTest::newRow("curated-before-ranked") << true << true << "nodetool/director";
        QTest::newRow("ranked-before-recommended") << false << true << "ranked";
        QTest::newRow("local-after-unavailable-cloud") << false << false << "local";
    }
    void curatedLanguagePrecedesRankedSeed() {
        QFETCH(bool, curatedAvailable);
        QFETCH(bool, cloudAvailable);
        QFETCH(QString, expected);
        Host host;
        host.server.routes["models.providers"] = [](const FakeServer::Request&) {
            return QJsonArray{provider("cloud", {"generate_message"}, "remote_api", "Cloud"), provider("nodetool", {"generate_message"}, "remote_api", "NodeTool"), provider("ollama", {"generate_message"}, "local_service", "Ollama")};
        };
        host.server.routes["models.llmByProvider"] = [curatedAvailable, cloudAvailable](const FakeServer::Request& request) {
            const auto source = request.input.toObject().value("provider").toString();
            const auto managed = source == "nodetool";
            const auto local = source == "ollama";
            const auto available = local || (managed ? curatedAvailable : cloudAvailable);
            return QJsonArray{QJsonObject{{"id", local ? "local" : managed ? "nodetool/director" : "ranked"},
                {"execution", execution(available ? (local ? "local" : "api") : "unavailable", available ? "ready" : "unavailable")}}};
        };
        host.server.routes["models.recommended"] = [](const FakeServer::Request&) { return QJsonArray{QJsonObject{{"provider", "ollama"}, {"id", "local"}}}; };
        host.server.routes["models.rankedKeys"] = [](const FakeServer::Request&) { return QJsonArray{"ollama:local", "cloud:ranked"}; };
        host.connectAs("curated-user");
        const QJsonArray metadata{QJsonObject{{"node_type", "test"}, {"properties", QJsonArray{QJsonObject{{"name", "model"}, {"type", "language_model"}}}}}};
        WorkflowDocument document;
        document.setNodeMetadata(metadata);
        QVERIFY(document.load(QJsonObject{{"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{{"id", "n"}, {"type", "test"}, {"data", QJsonObject{}}}}}, {"edges", QJsonArray{}}}}}));
        host.controller->fillWorkflowDefaults(&document, metadata);
        QTRY_COMPARE(document.node("n").value("data").toObject().value("model").toObject().value("id").toString(), expected);
    }
    void workflowDefaultsFillOnlyCompatibleEmptyProperties() {
        Host host;
        host.server.routes["models.providers"] = [](const FakeServer::Request&) {
            return QJsonArray{provider("cloud", {"generate_message"}, "remote_api", "Cloud")};
        };
        host.server.routes["models.llmByProvider"] = [](const FakeServer::Request&) {
            return QJsonArray{QJsonObject{{"id", "first-model"}, {"execution", execution("api")}}, QJsonObject{{"id", "default-model"}, {"name", "Default model"}, {"execution", execution("api")}}, QJsonObject{{"id", "pinned-offline"}, {"execution", execution("unavailable", "unavailable")}}};
        };
        host.server.routes["models.rankedKeys"] = [](const FakeServer::Request&) { return QJsonArray{"cloud:default-model"}; };
        host.connectAs("defaults-user");
        const QJsonArray properties{QJsonObject{{"name", "model"}, {"type", "language_model"}}};
        const QJsonArray metadata{QJsonObject{{"node_type", "test"}, {"properties", properties}}};
        WorkflowDocument document;
        document.setNodeMetadata(metadata);
        const auto node = [](const QString& id, const QJsonValue& model) {
            return QJsonObject{{"id", id}, {"type", "test"}, {"data", QJsonObject{{"model", model}}}};
        };
        QVERIFY(document.load(QJsonObject{{"graph", QJsonObject{{"nodes", QJsonArray{
            node("empty", QJsonObject{{"provider", "empty"}, {"id", ""}}),
            node("selected", QJsonObject{{"provider", "other"}, {"id", "chosen"}}),
            node("legacy", "legacy/model")}}, {"edges", QJsonArray{}}}}}));
        host.controller->fillWorkflowDefaults(&document, metadata);
        QTRY_COMPARE(document.node("empty").value("data").toObject().value("model").toObject().value("id").toString(), "default-model");
        QCOMPARE(document.node("selected").value("data").toObject().value("model").toObject().value("id").toString(), "chosen");
        QCOMPARE(document.node("legacy").value("data").toObject().value("model").toString(), "legacy/model");
        QCOMPARE(document.undoStack()->count(), 0);
        QVERIFY(!document.undoStack()->isClean());
        // A saved pin is the next workflow's default, even if the picker selected another row.
        auto* catalog = qobject_cast<nt::modelpicker::Catalog*>(host.controller->catalogFor("language_model", {}, {}));
        QVERIFY(catalog);
        catalog->setDefault("pinned-offline", "cloud");
        QVERIFY(document.load(QJsonObject{{"graph", QJsonObject{{"nodes", QJsonArray{node("next", QJsonValue::Null)}}, {"edges", QJsonArray{}}}}}));
        host.controller->fillWorkflowDefaults(&document, metadata);
        QTRY_COMPARE(document.node("next").value("data").toObject().value("model").toObject().value("id").toString(), "pinned-offline");
    }
    void workflowDefaultsRespectTasksAndSupportedTypes() {
        Host host;
        host.server.routes["models.providers"] = [](const FakeServer::Request&) {
            return QJsonArray{provider("cloud", {"text_to_image", "upscale_image"}, "remote_api", "Cloud")};
        };
        host.server.routes["models.imageByProvider"] = [](const FakeServer::Request&) {
            return QJsonArray{QJsonObject{{"id", "generator"}, {"supported_tasks", QJsonArray{"text_to_image"}}, {"execution", execution("api")}}};
        };
        host.connectAs("tasks-user");
        const auto declaration = [](const QString& type) { return QJsonArray{QJsonObject{{"name", "model"}, {"type", type}}}; };
        const QJsonArray metadata{
            QJsonObject{{"node_type", "nodetool.image.TextToImage"}, {"properties", declaration("image_model")}},
            QJsonObject{{"node_type", "nodetool.image.Upscale"}, {"properties", declaration("image_model")}},
            QJsonObject{{"node_type", "music"}, {"properties", declaration("music_model")}}};
        WorkflowDocument document;
        document.setNodeMetadata(metadata);
        QJsonArray nodes;
        for (const auto& entry : metadata) {
            const auto type = entry.toObject().value("node_type").toString();
            nodes.append(QJsonObject{{"id", type}, {"type", type}, {"data", QJsonObject{{"model", QJsonValue::Null}}}});
        }
        QVERIFY(document.load(QJsonObject{{"graph", QJsonObject{{"nodes", nodes}, {"edges", QJsonArray{}}}}}));
        host.controller->fillWorkflowDefaults(&document, metadata);
        QTRY_COMPARE(document.node("nodetool.image.TextToImage").value("data").toObject().value("model").toObject().value("id").toString(), "generator");
        QVERIFY(document.node("nodetool.image.Upscale").value("data").toObject().value("model").isNull());
        QVERIFY(document.node("music").value("data").toObject().value("model").isNull());
        QCOMPARE(document.undoStack()->count(), 0);
    }
    void defaultRepliesRespectAccountAndCurrentDocument() {
        Host host;
        host.server.routes["models.providers"] = [](const FakeServer::Request&) {
            return QJsonArray{provider("cloud", {"generate_message"}, "remote_api", "Cloud")};
        };
        host.server.held.insert("models.llmByProvider");
        host.connectAs("first");
        const QJsonArray metadata{QJsonObject{{"node_type", "test"}, {"properties", QJsonArray{QJsonObject{{"name", "model"}, {"type", "language_model"}}}}}};
        const auto workflow = [](const QString& id) {
            return QJsonObject{{"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{{"id", id}, {"type", "test"}, {"data", QJsonObject{}}}, QJsonObject{{"id", id + "-edited"}, {"type", "test"}, {"data", QJsonObject{}}}}}, {"edges", QJsonArray{}}}}};
        };
        WorkflowDocument document;
        document.setNodeMetadata(metadata);
        QVERIFY(document.load(workflow("first")));
        host.controller->fillWorkflowDefaults(&document, metadata);
        QTRY_VERIFY(!host.server.heldReplies.isEmpty());
        QVERIFY(document.load(workflow("second")));
        host.controller->fillWorkflowDefaults(&document, metadata);
        host.connectAs("second");
        QVERIFY(document.applyCommand({{"op", "setProperty"}, {"id", "second-edited"}, {"name", "model"}, {"value", QJsonObject{{"type", "language_model"}, {"provider", "cloud"}, {"id", "user-choice"}}}}));
        QVERIFY(document.applyCommand({{"op", "setProperty"}, {"id", "second-edited"}, {"name", "model"}, {"value", QJsonObject{{"type", "language_model"}, {"provider", "empty"}, {"id", ""}}}}));
        host.server.routes["models.llmByProvider"] = [](const FakeServer::Request&) {
            return QJsonArray{QJsonObject{{"id", "second-model"}, {"execution", execution("api")}}};
        };
        host.server.held.remove("models.llmByProvider");
        QTRY_COMPARE(document.node("second").value("data").toObject().value("model").toObject().value("id").toString(), "second-model");
        host.server.release("models.llmByProvider", QJsonArray{QJsonObject{{"id", "stale-model"}, {"execution", execution("api")}}});
        QTest::qWait(50);
        QCOMPARE(document.node("second").value("data").toObject().value("model").toObject().value("id").toString(), "second-model");
        QVERIFY(document.node("first").isEmpty());
        QVERIFY(document.node("second-edited").value("data").toObject().value("model").toObject().value("provider") == "empty");
        QCOMPARE(document.undoStack()->count(), 2);
    }
    // Each type that ModelProperty.tsx dispatches calls its own route for the
    // providers with its capability, and stores the web's value shape.
    void everyModelTypeUsesItsRouteAndValueShape_data() {
        QTest::addColumn<QString>("modelType");
        QTest::addColumn<QString>("nodeType");
        QTest::addColumn<QString>("procedure");
        QTest::addColumn<QString>("capability");
        QTest::addColumn<QStringList>("keys");
        const QStringList basic{"type", "id", "provider", "name"};
        QTest::newRow("language") << "language_model" << "nodetool.agents.Agent" << "models.llmByProvider" << "generate_message" << basic;
        QTest::newRow("embedding") << "embedding_model" << "" << "models.embeddingByProvider" << "generate_embedding" << basic;
        QTest::newRow("image") << "image_model" << "nodetool.image.TextToImage" << "models.imageByProvider" << "text_to_image" << (basic + QStringList{"path"});
        QTest::newRow("video") << "video_model" << "nodetool.video.TextToVideo" << "models.videoByProvider" << "text_to_video" << (basic + QStringList{"supported_tasks"});
        QTest::newRow("tts") << "tts_model" << "nodetool.audio.TextToSpeech" << "models.ttsByProvider" << "text_to_speech"
                             << (basic + QStringList{"voices", "selected_voice", "sample_rate", "requires_reference_text"});
        QTest::newRow("asr") << "asr_model" << "nodetool.text.AutomaticSpeechRecognition" << "models.asrByProvider" << "automatic_speech_recognition" << basic;
        QTest::newRow("music") << "music_model" << "" << "models.musicByProvider" << "text_to_music" << basic;
        QTest::newRow("audio to audio") << "audio_to_audio_model" << "" << "models.audioToAudioByProvider" << "audio_to_audio" << basic;
        QTest::newRow("rerank") << "rerank_model" << "" << "models.rerankByProvider" << "rerank" << basic;
        QTest::newRow("hugging face") << "hf.text_to_image" << "" << "models.huggingfaceByType" << "" << QStringList{"type", "repo_id", "path"};
        QTest::newRow("transformers js") << "tjs.text_classification" << "" << "models.transformersJsByType" << "" << QStringList{"type", "repo_id", "path"};
        QTest::newRow("ollama") << "llama_model" << "" << "models.ollama" << "" << QStringList{"type", "repo_id"};
        // An image-to-3D provider qualifies too, and the task list is not stored.
        QTest::newRow("3d") << "model_3d_model" << "nodetool.model3d.ImageTo3D" << "models.model3dByProvider" << "image_to_3d" << basic;
    }
    void everyModelTypeUsesItsRouteAndValueShape() {
        QFETCH(QString, modelType);
        QFETCH(QString, nodeType);
        QFETCH(QString, procedure);
        QFETCH(QString, capability);
        QFETCH(QStringList, keys);
        Host host;
        host.server.routes["models.providers"] = [capability](const FakeServer::Request&) {
            return QJsonArray{provider("cloud", {capability}, "remote_api", "Cloud AI"), provider("other", {"something_else"}, "remote_api", "Other")};
        };
        host.server.routes["settings.providerCatalog"] = [](const FakeServer::Request&) {
            return QJsonArray{providerSetting("cloud", "Cloud AI", true, {"CLOUD_API_KEY"})};
        };
        const bool video = modelType == "video_model";
        const bool repository = modelType.startsWith("hf.") || modelType.startsWith("tjs.");
        host.server.routes[procedure] = [modelType, video, repository](const FakeServer::Request&) {
            if (repository) {
                return QJsonArray{QJsonObject{{"id", "org/repo"}, {"repo_id", "org/repo"}, {"path", "weights.safetensors"}, {"name", "org/repo"}, {"type", modelType}}};
            }
            if (modelType == "llama_model") {
                // models.ollama returns tags without an id, as toOllamaModel.
                return QJsonArray{QJsonObject{{"type", "llama_model"}, {"name", "Llama 3"}, {"repo_id", "llama3:8b"}}};
            }
            QJsonObject model{{"id", "m-1"}, {"name", "Model One"}, {"type", modelType}, {"provider", "cloud"}, {"execution", execution("api")}};
            if (video) {
                model.insert("supported_tasks", QJsonArray{"text_to_video"});
            }
            if (modelType == "model_3d_model") {
                model.insert("supported_tasks", QJsonArray{"image_to_3d"});
            }
            if (modelType == "tts_model") {
                model.insert("voices", QJsonArray{"alloy", "echo"});
                model.insert("sample_rate", 24000);
            }
            return QJsonArray{model};
        };
        host.connectAs("type-user");
        Field field(*host.engine, host.controller.get(), descriptor(modelType, nodeType), QVariant());
        QVERIFY(field.item);
        QVERIFY(field.open());
        const auto rowName = modelType.startsWith("hf.") ? QStringLiteral("choose_huggingface_org/repo")
            : modelType.startsWith("tjs.") ? QStringLiteral("choose_transformers_js_org/repo")
            : modelType == "llama_model" ? QStringLiteral("choose_ollama_llama3:8b") : QStringLiteral("choose_cloud_m-1");
        QTRY_VERIFY(field.find(rowName));
        const auto calls = host.server.calls(procedure);
        QVERIFY(!calls.isEmpty());
        for (const auto& call : calls) {
            QCOMPARE(call.authorization, QByteArray("Bearer secret"));
            QCOMPARE(call.user, QByteArray("type-user"));
            if (modelType.startsWith("hf.")) {
                QCOMPARE(call.input.toObject().value("model_type").toString(), modelType);
                QCOMPARE(call.input.toObject().value("scope").toString(), QStringLiteral("local"));
            } else if (modelType.startsWith("tjs.")) {
                QCOMPARE(call.input.toObject(), (QJsonObject{{"model_type", modelType}}));
            } else if (modelType == "llama_model") {
                QCOMPARE(call.input.toObject(), QJsonObject{});
            } else {
                // The provider without the capability is never asked.
                QCOMPARE(call.input.toObject().value("provider").toString(), QStringLiteral("cloud"));
            }
        }
        QSignalSpy spy(field.editor.get(), SIGNAL(valueCommitted(QVariant)));
        field.click(field.find(rowName));
        QTRY_COMPARE(spy.size(), 1);
        const auto value = committed(spy);
        auto actual = value.keys();
        auto expected = keys;
        actual.sort();
        expected.sort();
        QVERIFY2(actual == expected, qPrintable(actual.join(',')));
        QCOMPARE(value.value("type").toString(), modelType);
        if (repository) {
            QCOMPARE(value.value("repo_id").toString(), QStringLiteral("org/repo"));
            QCOMPARE(value.value("path").toString(), QStringLiteral("weights.safetensors"));
        } else if (modelType == "llama_model") {
            QCOMPARE(value.value("repo_id").toString(), QStringLiteral("llama3:8b"));
        } else {
            QCOMPARE(value.value("id").toString(), QStringLiteral("m-1"));
            QCOMPARE(value.value("provider").toString(), QStringLiteral("cloud"));
            QCOMPARE(value.value("name").toString(), QStringLiteral("Model One"));
        }
        if (modelType == "tts_model") {
            QCOMPARE(value.value("selected_voice").toString(), QStringLiteral("alloy"));
        }
    }
    // IMAGE_TASK_BY_NODE_TYPE and VIDEO_TASK_BY_NODE_TYPE: a task picker asks only
    // providers with the task's capability. A model without declared tasks
    // passes only a task outside STRICT_MODEL_TASKS.
    void imageAndVideoTaskFilters_data() {
        QTest::addColumn<QString>("modelType");
        QTest::addColumn<QString>("nodeType");
        QTest::addColumn<QString>("capability");
        QTest::addColumn<QString>("task");
        QTest::addColumn<bool>("undeclaredListed");
        QTest::newRow("upscale") << "image_model" << "nodetool.image.Upscale" << "upscale_image" << "upscale" << false;
        QTest::newRow("estimate depth") << "image_model" << "nodetool.image.EstimateDepth" << "estimate_depth" << "estimate_depth" << false;
        QTest::newRow("text to image") << "image_model" << "nodetool.image.TextToImage" << "text_to_image" << "text_to_image" << true;
        QTest::newRow("lip sync") << "video_model" << "nodetool.video.LipSync" << "text_to_video" << "lip_sync" << false;
        QTest::newRow("image to video") << "video_model" << "nodetool.video.ImageToVideo" << "text_to_video" << "image_to_video" << true;
    }
    void imageAndVideoTaskFilters() {
        QFETCH(QString, modelType);
        QFETCH(QString, nodeType);
        QFETCH(QString, capability);
        QFETCH(QString, task);
        QFETCH(bool, undeclaredListed);
        Host host;
        host.server.routes["models.providers"] = [capability](const FakeServer::Request&) {
            return QJsonArray{provider("fit", {capability}, "remote_api", "Fit"), provider("misfit", {"inpainting"}, "remote_api", "Misfit")};
        };
        const auto models = [task](const FakeServer::Request&) {
            return QJsonArray{QJsonObject{{"id", "declared"}, {"name", "Declared"}, {"supported_tasks", QJsonArray{task}}, {"execution", execution("api")}},
                              QJsonObject{{"id", "undeclared"}, {"name", "Undeclared"}, {"execution", execution("api")}},
                              QJsonObject{{"id", "other-task"}, {"name", "Other task"}, {"supported_tasks", QJsonArray{"vectorize"}}, {"execution", execution("api")}}};
        };
        host.server.routes["models.imageByProvider"] = models;
        host.server.routes["models.videoByProvider"] = models;
        host.connectAs("task-user");
        Field field(*host.engine, host.controller.get(), descriptor(modelType, nodeType), QVariant());
        QVERIFY(field.open());
        QTRY_VERIFY(field.find("choose_fit_declared"));
        QCOMPARE(field.find("choose_fit_undeclared") != nullptr, undeclaredListed);
        QVERIFY(!field.find("choose_fit_other-task"));
        const auto procedure = modelType == "image_model" ? QStringLiteral("models.imageByProvider") : QStringLiteral("models.videoByProvider");
        for (const auto& call : host.server.calls(procedure)) {
            QCOMPARE(call.input.toObject().value("provider").toString(), QStringLiteral("fit"));
        }
    }
    // ModelPreferencesStore.ts: favorites and up to 8 recents per account,
    // shared by every model field. Two fields of one account must not
    // overwrite each other's recents, and a restart keeps them.
    void recentsAndFavoritesPersistPerAccount() {
        Host host;
        host.server.routes["models.providers"] = [](const FakeServer::Request&) {
            return QJsonArray{provider("img", {"text_to_image", "upscale_image"}, "remote_api", "Image Cloud")};
        };
        host.server.routes["models.imageByProvider"] = [](const FakeServer::Request&) {
            QJsonArray models{QJsonObject{{"id", "gen-1"}, {"name", "Generator"}, {"supported_tasks", QJsonArray{"text_to_image"}}, {"execution", execution("api")}},
                              QJsonObject{{"id", "up-1"}, {"name", "Upscaler"}, {"supported_tasks", QJsonArray{"upscale", "text_to_image"}}, {"execution", execution("api")}}};
            for (int index = 0; index < 9; ++index) {
                models.append(QJsonObject{{"id", QStringLiteral("extra-%1").arg(index)}, {"name", QStringLiteral("Extra %1").arg(index)}, {"execution", execution("api")}});
            }
            return models;
        };
        host.connectAs("account-a");
        {
            Field generate(*host.engine, host.controller.get(), descriptor("image_model", "nodetool.image.TextToImage"), QVariant());
            Field upscale(*host.engine, host.controller.get(), descriptor("image_model", "nodetool.image.Upscale"), QVariant());
            QVERIFY(generate.open());
            QTRY_VERIFY(generate.find("choose_img_gen-1"));
            QVERIFY(generate.clickNamed("favorite_img_gen-1"));
            QTRY_VERIFY(generate.find("favorite_img_gen-1")->property("checked").toBool());
            generate.click(generate.find("choose_img_gen-1"));
            QTRY_VERIFY(!generate.popup()->property("visible").toBool());
            // The second field opens on its first ready model, Upscaler, and
            // Return chooses it.
            QVERIFY(upscale.open());
            QTRY_VERIFY(upscale.find("choose_img_up-1"));
            QTRY_COMPARE(upscale.find("modelPickerResults")->property("currentIndex").toInt(), 0);
            QSignalSpy chosen(upscale.editor.get(), SIGNAL(valueCommitted(QVariant)));
            QTest::keyClick(upscale.window.get(), Qt::Key_Return);
            QTRY_COMPARE(chosen.size(), 1);
            QCOMPARE(committed(chosen).value("id").toString(), QStringLiteral("up-1"));
        }
        host.restart();
        host.connectAs("account-a");
        {
            Field later(*host.engine, host.controller.get(), descriptor("image_model", "nodetool.image.TextToImage"), QVariant());
            QVERIFY(later.open());
            QTRY_VERIFY(later.find("choose_img_gen-1"));
            QVERIFY(later.clickNamed("provider_Recent_rail"));
            auto* catalog = host.catalog(later);
            QTRY_COMPARE(catalog->results()->rowCount(), 2);
            QCOMPARE(catalog->resultAt(0).value("id").toString(), QStringLiteral("up-1"));
            QCOMPARE(catalog->resultAt(1).value("id").toString(), QStringLiteral("gen-1"));
            QVERIFY(later.clickNamed("provider_Favorites_rail"));
            QTRY_COMPARE(catalog->results()->rowCount(), 1);
            QCOMPARE(catalog->resultAt(0).value("id").toString(), QStringLiteral("gen-1"));
            later.capture(QStringLiteral("recent-dark"));
            // MAX_RECENTS keeps the eight most recent choices.
            for (int index = 0; index < 9; ++index) {
                catalog->selectModel(QStringLiteral("extra-%1").arg(index), QStringLiteral("img"));
            }
            QVERIFY(later.clickNamed("provider_Recent_rail"));
            QTRY_COMPARE(catalog->results()->rowCount(), 8);
            QCOMPARE(catalog->resultAt(0).value("id").toString(), QStringLiteral("extra-8"));
        }
        host.connectAs("account-b");
        {
            Field other(*host.engine, host.controller.get(), descriptor("image_model", "nodetool.image.TextToImage"), QVariant());
            QVERIFY(other.open());
            QTRY_VERIFY(other.find("choose_img_gen-1"));
            QVERIFY(other.clickNamed("provider_Recent_rail"));
            QTRY_COMPARE(host.catalog(other)->results()->rowCount(), 0);
            QVERIFY(other.clickNamed("provider_Favorites_rail"));
            QTRY_COMPARE(host.catalog(other)->results()->rowCount(), 0);
        }
    }
    // useProviderKeyMissing and missingKeyWarning in the web: a stored model
    // whose provider has no key warns with the key's name, even when the
    // provider lists no models. Local providers and other field types do not.
    void providerSetupAndKeyWarnings() {
        Host host;
        UrlSink sink;
        QDesktopServices::setUrlHandler(QStringLiteral("http"), &sink, "openUrl");
        host.server.routes["models.providers"] = [](const FakeServer::Request&) {
            return QJsonArray{provider("ollama", {"generate_message", "generate_embedding"}, "local_service", "Ollama"),
                              provider("anthropic", {"generate_message"}, "remote_api", "Anthropic")};
        };
        host.server.routes["settings.providerCatalog"] = [](const FakeServer::Request&) {
            return QJsonArray{providerSetting("openai", "OpenAI", false, {"OPENAI_API_KEY"}),
                              providerSetting("anthropic", "Anthropic", false, {"ANTHROPIC_API_KEY"}),
                              providerSetting("ollama", "Ollama", false, {"OLLAMA_API_URL"})};
        };
        host.server.routes["models.llmByProvider"] = [](const FakeServer::Request& request) {
            if (request.input.toObject().value("provider").toString() == "ollama") {
                return QJsonArray{QJsonObject{{"id", "llama3"}, {"name", "Llama 3"}, {"execution", execution("local")}}};
            }
            return QJsonArray{};
        };
        host.connectAs("setup-user");
        const QVariantMap stored{{"type", "language_model"}, {"id", "gpt-5-mini"}, {"provider", "openai"}, {"name", "gpt-5-mini"}};
        Field language(*host.engine, host.controller.get(), descriptor("language_model", "nodetool.agents.Agent"), stored);
        QTRY_COMPARE(language.editor->property("keyWarning").toString(),
                     QStringLiteral("OpenAI needs OPENAI_API_KEY. Add it in Settings, or pick another model."));
        auto* icon = language.find("model-key-warning-model");
        QVERIFY(icon);
        QCOMPARE(language.find("model-label-model")->property("text").toString(), QStringLiteral("gpt-5-mini"));
        QCOMPARE(language.find("model-secondary-model")->property("text").toString(), QStringLiteral("OpenAI"));
        language.capture(QStringLiteral("key-warning-dark"));
        Field embedding(*host.engine, host.controller.get(), descriptor("embedding_model"), QVariantMap{{"type", "embedding_model"}, {"id", "text-embedding-3"}, {"provider", "openai"}, {"name", "Embedding"}});
        Field local(*host.engine, host.controller.get(), descriptor("language_model"), QVariantMap{{"type", "language_model"}, {"id", "llama3"}, {"provider", "ollama"}, {"name", "Llama 3"}});
        QTRY_VERIFY(host.catalog(local)->loaded());
        QTRY_VERIFY(host.catalog(embedding)->loaded());
        QCOMPARE(embedding.editor->property("keyWarning").toString(), QString());
        QCOMPARE(local.editor->property("keyWarning").toString(), QString());
        // No API model is ready, so the menu offers a key first.
        QVERIFY(language.open());
        QTRY_VERIFY(language.find("modelPickerAddKey"));
        const auto copy = texts(language.find("modelPickerAddKey"));
        QVERIFY2(copy.contains("Add an API key") && copy.contains("Use cloud models from OpenAI, Anthropic, Google and others."), qPrintable(copy));
        language.capture(QStringLiteral("add-key-dark"));
        host.setTheme(3);
        language.capture(QStringLiteral("add-key-light"));
        host.setTheme(2);
        QSignalSpy settings(host.controller.get(), &ModelPickerController::providerSettingsRequested);
        language.click(language.find("modelPickerAddKey"));
        QTRY_COMPARE(settings.size(), 1);
        QCOMPARE(settings.first().at(0).toUrl(), host.server.url().resolved(QUrl("/settings?tab=1")));
        QTRY_COMPARE(sink.opened.size(), 1);
        QTRY_VERIFY(!language.popup()->property("visible").toBool());
        // A cloud provider without models says how to connect it.
        QVERIFY(language.open());
        QTRY_VERIFY(host.catalog(language)->loaded() && !host.catalog(language)->loading());
        QVERIFY(language.clickNamed("provider_anthropic_rail"));
        QTRY_VERIFY(language.find("modelPickerEmpty"));
        const auto empty = texts(language.find("modelPickerEmpty"));
        QVERIFY2(empty.contains("Anthropic has no models yet") && empty.contains("Connect Anthropic to see its models here."), qPrintable(empty));
        QQuickItem* action = nullptr;
        for (auto* child : language.find("modelPickerEmpty")->childItems()) {
            if (child->property("text").toString() == "Connect Anthropic" && child->isVisible()) {
                action = child;
            }
        }
        QVERIFY(action);
        language.capture(QStringLiteral("provider-empty-dark"));
        language.click(action);
        QTRY_COMPARE(settings.size(), 2);
        QCOMPARE(settings.last().at(1).toString(), QStringLiteral("anthropic"));
        // The footer reaches the same settings page.
        QVERIFY(language.open());
        QTRY_VERIFY(language.find("modelPickerAddProviders"));
        QVERIFY(language.clickNamed("modelPickerAddProviders"));
        QTRY_COMPARE(settings.size(), 3);
        QDesktopServices::unsetUrlHandler(QStringLiteral("http"));
    }
    // ModelRowDownload and ModelDownloadStore: a local model that needs its
    // files downloads them over /ws/download, shows live progress, cancels,
    // and becomes selectable after the list reloads on completion.
    void downloadProgressForLocalModels() {
        Host host;
        bool downloaded = false;
        host.server.routes["models.providers"] = [](const FakeServer::Request&) {
            return QJsonArray{provider("llama_cpp", {"generate_message"}, "in_process", "llama.cpp")};
        };
        host.server.routes["models.llmByProvider"] = [&downloaded](const FakeServer::Request&) {
            const QJsonObject artifact{{"source", "huggingface"}, {"repo_id", "Qwen/Qwen3-GGUF"}, {"path", "qwen3.gguf"}};
            return QJsonArray{QJsonObject{{"id", "qwen3"}, {"name", "Qwen 3"}, {"type", "language_model"}, {"provider", "llama_cpp"},
                {"execution", execution("local", downloaded ? "ready" : "download_required")},
                {"adapter", QJsonObject{{"state", "installed"}, {"artifact_ref", artifact}}}}};
        };
        host.connectAs("download-user");
        Field field(*host.engine, host.controller.get(), descriptor("language_model", "nodetool.agents.Agent"), QVariant());
        QVERIFY(field.open());
        QTRY_VERIFY(field.find("download_llama_cpp_qwen3"));
        QSignalSpy chosen(field.editor.get(), SIGNAL(valueCommitted(QVariant)));
        // The row cannot be chosen before its files exist.
        field.click(field.find("choose_llama_cpp_qwen3"));
        QTest::qWait(50);
        QCOMPARE(chosen.size(), 0);
        QVERIFY(field.clickNamed("download_llama_cpp_qwen3"));
        QTRY_COMPARE(host.server.commands.size(), 1);
        QCOMPARE(host.server.downloadAuthorization, QByteArray("Bearer secret"));
        QCOMPARE(host.server.downloadUser, QByteArray("download-user"));
        const auto start = host.server.commands.first();
        QCOMPARE(start.value("command").toString(), QStringLiteral("start_download"));
        QCOMPARE(start.value("repo_id").toString(), QStringLiteral("Qwen/Qwen3-GGUF"));
        QCOMPARE(start.value("path").toString(), QStringLiteral("qwen3.gguf"));
        QCOMPARE(start.value("allow_patterns").toArray(), QJsonArray{"qwen3.gguf"});
        QCOMPARE(start.value("ignore_patterns").toArray(), QJsonArray{});
        QCOMPARE(start.value("model_type").toString(), QStringLiteral("language_model"));
        QCOMPARE(start.value("scope").toString(), QStringLiteral("local"));
        QTRY_COMPARE(field.find("downloadProgress_llama_cpp_qwen3")->property("text").toString(), QStringLiteral("…"));
        const QJsonObject progress{{"status", "progress"}, {"repo_id", "Qwen/Qwen3-GGUF"}, {"path", "qwen3.gguf"}, {"model_type", QJsonValue::Null},
                                   {"downloaded_bytes", 50 * 1024 * 1024}, {"total_bytes", 100 * 1024 * 1024}, {"downloaded_files", 0},
                                   {"current_files", QJsonArray{"qwen3.gguf"}}, {"total_files", 1}};
        host.server.frame(progress);
        QTRY_COMPARE(field.find("downloadProgress_llama_cpp_qwen3")->property("text").toString(), QStringLiteral("50%"));
        QVERIFY(texts(field.window->contentItem()).contains("50 / 100 MB"));
        field.capture(QStringLiteral("download-progress-dark"));
        host.setTheme(3);
        field.capture(QStringLiteral("download-progress-light"));
        host.setTheme(2);
        QVERIFY(field.clickNamed("cancelDownload_llama_cpp_qwen3"));
        QTRY_COMPARE(host.server.commands.size(), 2);
        QCOMPARE(host.server.commands.last(), (QJsonObject{{"command", "cancel_download"}, {"id", "Qwen/Qwen3-GGUF/qwen3.gguf"}}));
        QTRY_COMPARE(field.find("downloadProgress_llama_cpp_qwen3")->property("text").toString(), QStringLiteral("Cancelled"));
        // A late frame for the cancelled download changes nothing.
        host.server.frame(progress);
        QTest::qWait(50);
        QCOMPARE(field.find("downloadProgress_llama_cpp_qwen3")->property("text").toString(), QStringLiteral("Cancelled"));
        // Downloading again and finishing reloads the list.
        QVERIFY(host.controller->downloads().contains("Qwen/Qwen3-GGUF/qwen3.gguf"));
        host.catalog(field)->requestDownload(QStringLiteral("qwen3"), QStringLiteral("llama_cpp"));
        QTRY_COMPARE(host.server.commands.size(), 3);
        const auto loads = host.server.count("models.llmByProvider");
        downloaded = true;
        auto completed = progress;
        completed.insert("status", "completed");
        completed.insert("downloaded_bytes", 100 * 1024 * 1024);
        host.server.frame(completed);
        QTRY_VERIFY(host.server.count("models.llmByProvider") > loads);
        QTRY_VERIFY(!field.find("download_llama_cpp_qwen3") && !field.find("downloadProgress_llama_cpp_qwen3"));
        field.click(field.find("choose_llama_cpp_qwen3"));
        QTRY_COMPARE(chosen.size(), 1);
        QCOMPARE(committed(chosen).value("id").toString(), QStringLiteral("qwen3"));
    }
    // useRecommendedModelsForNode and the "Available to download" section: the
    // node's recommended downloads, checked against the server cache, offer
    // Download or Use in place.
    void recommendedDownloadsForTheNode() {
        Host host;
        host.server.routes["models.providers"] = [](const FakeServer::Request&) {
            return QJsonArray{provider("fal_ai", {"text_to_image"}, "remote_api", "FAL AI")};
        };
        host.server.routes["models.imageByProvider"] = [](const FakeServer::Request&) {
            return QJsonArray{QJsonObject{{"id", "flux-pro"}, {"name", "FLUX Pro"}, {"execution", execution("api")}}};
        };
        host.server.routes["models.recommendedImageTextToImage"] = [](const FakeServer::Request&) {
            return QJsonArray{QJsonObject{{"id", "stabilityai/sdxl"}, {"repo_id", "stabilityai/sdxl"}, {"name", "stabilityai/sdxl"}, {"type", "hf.stable_diffusion_xl"},
                                          {"path", "sdxl.safetensors"}, {"provider", "huggingface"}, {"downloaded", false}, {"size_on_disk", 6.94 * 1024 * 1024 * 1024}},
                              QJsonObject{{"id", "black/flux"}, {"repo_id", "black/flux"}, {"name", "FLUX dev"}, {"type", "hf.flux"}, {"provider", "huggingface"},
                                          {"allow_patterns", QJsonArray{"*.safetensors"}}},
                              QJsonObject{{"id", "flux-pro"}, {"name", "Listed already"}, {"type", "hf.flux"}, {"path", "x"}}};
        };
        host.server.routes["models.huggingfaceCacheStatus"] = [](const FakeServer::Request& request) {
            QJsonArray result;
            for (const auto& item : request.input.toArray()) {
                const auto key = item.toObject().value("key").toString();
                result.append(QJsonObject{{"key", key}, {"downloaded", key == "black/flux"}});
            }
            return result;
        };
        host.connectAs("recommend-user");
        Field field(*host.engine, host.controller.get(), descriptor("image_model", "nodetool.image.TextToImage"), QVariant());
        QVERIFY(field.open());
        QTRY_VERIFY(field.find("use_huggingface_black/flux"));
        QVERIFY(field.find("download_huggingface_stabilityai/sdxl"));
        QVERIFY(!field.find("choose_huggingface_flux-pro"));
        QVERIFY(texts(field.window->contentItem()).contains("Available to download"));
        QVERIFY(texts(field.window->contentItem()).contains("stabilityai/sdxl · 6.94 GB"));
        const auto checks = host.server.calls("models.huggingfaceCacheStatus");
        QCOMPARE(checks.size(), 1);
        QCOMPARE(checks.first().method, QByteArray("POST"));
        // Every recommendation is checked, including one the list already offers.
        QCOMPARE(checks.first().input.toArray().size(), 3);
        QCOMPARE(checks.first().input.toArray().first().toObject().value("key").toString(), QStringLiteral("stabilityai/sdxl/sdxl.safetensors"));
        field.capture(QStringLiteral("recommended-dark"));
        host.setTheme(3);
        field.capture(QStringLiteral("recommended-light"));
        host.setTheme(2);
        QVERIFY(field.clickNamed("download_huggingface_stabilityai/sdxl"));
        QTRY_COMPARE(host.server.commands.size(), 1);
        QCOMPARE(host.server.commands.first().value("repo_id").toString(), QStringLiteral("stabilityai/sdxl"));
        QCOMPARE(host.server.commands.first().value("model_type").toString(), QStringLiteral("hf.stable_diffusion_xl"));
        QTRY_VERIFY(field.find("downloadProgress_huggingface_stabilityai/sdxl"));
        QSignalSpy chosen(field.editor.get(), SIGNAL(valueCommitted(QVariant)));
        QVERIFY(field.clickNamed("use_huggingface_black/flux"));
        QTRY_COMPARE(chosen.size(), 1);
        const auto value = committed(chosen);
        QCOMPARE(value.value("id").toString(), QStringLiteral("black/flux"));
        QCOMPARE(value.value("provider").toString(), QStringLiteral("huggingface"));
        QCOMPARE(value.value("name").toString(), QStringLiteral("FLUX dev"));
        QCOMPARE(value.value("type").toString(), QStringLiteral("image_model"));
    }
    // A new account starts with its own catalog, preferences and downloads, and
    // nothing the previous account loaded or started reaches it.
    void accountChangeResetsCatalogAndDownloads() {
        Host host;
        host.server.routes["models.providers"] = [](const FakeServer::Request& request) {
            return QJsonArray{provider(request.user == "first" ? "first-cloud" : "second-cloud", {"generate_message"}, "remote_api", "Cloud")};
        };
        host.server.routes["models.llmByProvider"] = [](const FakeServer::Request& request) {
            const auto owner = request.input.toObject().value("provider").toString();
            return QJsonArray{QJsonObject{{"id", owner + "-model"}, {"name", owner}, {"execution", execution("local", "download_required")},
                {"adapter", QJsonObject{{"state", "installed"}, {"artifact_ref", QJsonObject{{"source", "huggingface"}, {"repo_id", "org/" + owner}}}}}}};
        };
        host.connectAs("first", QStringLiteral("first-token"));
        Field field(*host.engine, host.controller.get(), descriptor("language_model"), QVariant());
        QVERIFY(field.open());
        QTRY_VERIFY(field.find("download_first-cloud_first-cloud-model"));
        QVERIFY(field.clickNamed("download_first-cloud_first-cloud-model"));
        QTRY_COMPARE(host.server.openDownloadClients(), 1);
        QCOMPARE(host.server.downloadAuthorization, QByteArray("Bearer first-token"));
        host.connectAs("second", QStringLiteral("second-token"));
        QTRY_COMPARE(host.server.openDownloadClients(), 0);
        QVERIFY(host.controller->downloads().isEmpty());
        auto* catalog = host.catalog(field);
        QTRY_VERIFY(catalog->loaded() && !catalog->loading());
        QCOMPARE(catalog->models().size(), 1);
        QCOMPARE(catalog->models().first().toMap().value("provider").toString(), QStringLiteral("second-cloud"));
        // The first account's progress frame cannot reach the second account.
        host.server.frame({{"status", "progress"}, {"repo_id", "org/first-cloud"}, {"downloaded_bytes", 1}, {"total_bytes", 2}});
        QTest::qWait(50);
        QVERIFY(host.controller->downloads().isEmpty());
        QTRY_VERIFY(field.find("download_second-cloud_second-cloud-model"));
        QVERIFY(!field.find("downloadProgress_second-cloud_second-cloud-model"));
        const auto last = host.server.requests.last();
        QCOMPARE(last.authorization, QByteArray("Bearer second-token"));
        QCOMPARE(last.user, QByteArray("second"));
    }
    // A refresh that overtakes a slow earlier response keeps the newer list.
    void staleResponsesAreIgnored() {
        Host host;
        host.server.routes["models.providers"] = [](const FakeServer::Request&) {
            return QJsonArray{provider("cloud", {"generate_message"}, "remote_api", "Cloud")};
        };
        host.server.held.insert("models.llmByProvider");
        host.connectAs("stale-user");
        Field field(*host.engine, host.controller.get(), descriptor("language_model"), QVariant());
        auto* catalog = host.catalog(field);
        QTRY_VERIFY(host.server.count("models.llmByProvider") >= 1);
        QVERIFY(catalog->loading());
        const auto firstCalls = host.server.heldReplies.size();
        QVERIFY(field.open());
        QTRY_VERIFY(host.server.heldReplies.size() > firstCalls);
        // The latest request answers first, then the overtaken ones.
        const auto newest = host.server.heldReplies.takeLast();
        FakeServer::send(newest.first, QJsonArray{QJsonObject{{"id", "fresh"}, {"name", "Fresh"}, {"execution", execution("api")}}});
        QTRY_VERIFY(field.find("choose_cloud_fresh"));
        host.server.release("models.llmByProvider", QJsonArray{QJsonObject{{"id", "stale"}, {"name", "Stale"}, {"execution", execution("api")}}});
        QTest::qWait(100);
        QVERIFY(!field.find("choose_cloud_stale"));
        QCOMPARE(catalog->models().size(), 1);
        QCOMPARE(catalog->models().first().toMap().value("id").toString(), QStringLiteral("fresh"));
    }
    // The button text of each web select, which the card chip shares.
    void fieldLabelsFollowEachWebSelect() {
        using nt::modelpicker::fieldLabel;
        const QVariantMap openai{{"id", "gpt-5-mini"}, {"provider", "openai"}, {"name", "gpt-5-mini"}};
        auto label = fieldLabel("language_model", openai, openai, "openai");
        QCOMPARE(label.label, QStringLiteral("gpt-5-mini"));
        QCOMPARE(label.secondary, QStringLiteral("OpenAI"));
        QVERIFY(label.active);
        label = fieldLabel("language_model", QVariantMap{{"type", "language_model"}, {"provider", "empty"}, {"id", ""}}, {}, {});
        QCOMPARE(label.label, QStringLiteral("Select model"));
        QCOMPARE(label.secondary, QString());
        QVERIFY(!label.active);
        QCOMPARE(fieldLabel("image_model", QVariant(), {}, {}).label, QStringLiteral("Select image model"));
        label = fieldLabel("image_model", QVariantMap{{"id", "org/repo:file.safetensors"}}, {}, {});
        QCOMPARE(label.label, QStringLiteral("org/repo"));
        QCOMPARE(label.secondary, QStringLiteral("file.safetensors"));
        label = fieldLabel("image_model", QVariantMap{{"id", "flux"}}, QVariantMap{{"id", "flux"}, {"name", "black-forest/flux"}}, {});
        QCOMPARE(label.label, QStringLiteral("black-forest"));
        QCOMPARE(label.secondary, QStringLiteral("flux"));
        QCOMPARE(fieldLabel("tts_model", QVariant(), {}, {}).label, QStringLiteral("Select TTS model"));
        QCOMPARE(fieldLabel("tts_model", QVariantMap{{"id", "tts-1"}, {"provider", "openai"}}, {}, "openai").secondary, QString());
        QCOMPARE(fieldLabel("music_model", QVariant(), {}, {}).label, QStringLiteral("Select music model"));
        QCOMPARE(fieldLabel("audio_to_audio_model", QVariant(), {}, {}).label, QStringLiteral("Select audio-to-audio model"));
        QCOMPARE(fieldLabel("asr_model", QVariant("/models/ggml-base.en.bin"), {}, "whisper_cpp").label, QStringLiteral("base.en"));
        QCOMPARE(fieldLabel("asr_model", QVariant("/models/ggml-base.en.bin"), {}, "whisper_cpp").secondary, QStringLiteral("whisper.cpp"));
        // Embedding and rerank name the provider only from the loaded entry.
        QCOMPARE(fieldLabel("embedding_model", QVariantMap{{"id", "e"}, {"provider", "openai"}}, {}, "openai").secondary, QString());
        QCOMPARE(fieldLabel("rerank_model", QVariantMap{{"id", "r"}}, QVariantMap{{"id", "r"}, {"name", "Rerank"}, {"provider", "jina"}}, {}).secondary, QStringLiteral("Jina AI"));
        label = fieldLabel("hf.text_to_image", QVariantMap{{"repo_id", "org/repo"}, {"path", "a.safetensors"}}, {}, {});
        QCOMPARE(label.label, QStringLiteral("org/repo"));
        QCOMPARE(label.secondary, QStringLiteral("a.safetensors"));
        QCOMPARE(fieldLabel("hf.text_to_image", QVariant(), {}, {}).label, QStringLiteral("Select HuggingFace model"));
        label = fieldLabel("tjs.text_classification", QVariantMap{{"repo_id", "Xenova/bert"}}, {}, {});
        QCOMPARE(label.label, QStringLiteral("Xenova/bert"));
        QVERIFY(label.active);
        QCOMPARE(fieldLabel("tjs.text_classification", QVariant(), {}, {}).label, QStringLiteral("Select Transformers.js model"));
        QCOMPARE(fieldLabel("llama_model", QVariantMap{{"repo_id", "llama3:8b"}}, {}, {}).label, QStringLiteral("llama3:8b"));
        QCOMPARE(fieldLabel("llama_model", QVariantMap{{"repo_id", "llama3:8b"}}, QVariantMap{{"name", "Llama 3"}}, {}).label, QStringLiteral("Llama 3"));
        QCOMPARE(fieldLabel("llama_model", QVariant(), {}, {}).label, QStringLiteral("Select Ollama model"));
        QCOMPARE(nt::modelpicker::providerDisplayName("huggingface_groq"), QStringLiteral("Groq"));
        QCOMPARE(nt::modelpicker::providerDisplayName("BlackForestLabs"), QStringLiteral("Black Forest Labs"));
        QCOMPARE(nt::modelpicker::providerDisplayName("fal_ai"), QStringLiteral("FAL AI"));
    }
    void huggingFaceAndVoiceValues() {
        ModelPickerController controller;
        QQmlEngine engine;
        engine.addImportPath("qrc:/qt/qml");
        QQmlComponent component(&engine, QUrl("qrc:/editor/ModelPropertyEditor.qml"));
        QTRY_VERIFY2(component.status() != QQmlComponent::Loading, qPrintable(component.errorString()));
        QVERIFY2(!component.isError(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> hf(component.createWithInitialProperties({{"controller", QVariant::fromValue<QObject*>(&controller)}, {"descriptor", QVariantMap{{"name", "model"}, {"modelType", "hf.text_to_image"}}}, {"value", QVariantMap{{"type", "hf.text_to_image"}, {"repo_id", "org/repo"}, {"path", "a.safetensors"}}}, {"writable", true}}));
        QVERIFY2(hf != nullptr, qPrintable(component.errorString()));
        QCOMPARE(hf->property("selectedId").toString(), "org/repo:a.safetensors");
        QVariant result;
        const QVariant chosen = QVariantMap{{"id", "org/repo:b.safetensors"}, {"provider", "huggingface"}};
        QVERIFY(QMetaObject::invokeMethod(hf.get(), "valueFor", Q_RETURN_ARG(QVariant, result), Q_ARG(QVariant, chosen)));
        auto value = result.value<QJSValue>().toVariant().toMap();
        QCOMPARE(value.value("repo_id").toString(), "org/repo");
        QCOMPARE(value.value("path").toString(), "b.safetensors");
        QCOMPARE(value.value("type").toString(), "hf.text_to_image");
        QVERIFY(!value.contains("id"));
        std::unique_ptr<QObject> tts(component.createWithInitialProperties({{"controller", QVariant::fromValue<QObject*>(&controller)}, {"descriptor", QVariantMap{{"name", "voice"}, {"modelType", "tts_model"}}}, {"value", QVariantMap{{"type", "tts_model"}, {"id", "t"}, {"provider", "p"}, {"name", "Speech"}, {"voices", QVariantList{"a", "b"}}, {"selected_voice", "a"}, {"sample_rate", 24000}}}, {"writable", true}}));
        QVERIFY2(tts != nullptr, qPrintable(component.errorString()));
        QVERIFY(tts->property("hasVoices").toBool());
        QSignalSpy committedVoice(tts.get(), SIGNAL(valueCommitted(QVariant)));
        QVERIFY(QMetaObject::invokeMethod(tts.get(), "commitVoice", Q_ARG(QVariant, "b")));
        QCOMPARE(committedVoice.size(), 1);
        value = committed(committedVoice);
        QCOMPARE(value.value("selected_voice").toString(), "b");
        QCOMPARE(value.value("id").toString(), "t");
        QCOMPARE(value.value("provider").toString(), "p");
        QCOMPARE(value.value("name").toString(), "Speech");
        QCOMPARE(value.value("sample_rate").toInt(), 24000);
        // A capability list without preset_voice hides the voice control.
        std::unique_ptr<QObject> cloned(component.createWithInitialProperties({{"controller", QVariant::fromValue<QObject*>(&controller)}, {"descriptor", QVariantMap{{"name", "voice"}, {"modelType", "tts_model"}}}, {"value", QVariantMap{{"type", "tts_model"}, {"id", "t"}, {"provider", "p"}, {"voices", QVariantList{"a"}}, {"capabilities", QVariantList{"voice_clone"}}}}, {"writable", true}}));
        QVERIFY(cloned);
        QVERIFY(!cloned->property("hasVoices").toBool());
    }
    void undoAndReopenKeepTheTypedValue() {
        Host host;
        host.server.routes["models.providers"] = [](const FakeServer::Request&) {
            return QJsonArray{provider("test", {"upscale_image"}, "remote_api", "Test")};
        };
        host.server.routes["models.imageByProvider"] = [](const FakeServer::Request&) {
            return QJsonArray{QJsonObject{{"id", "full/model-id"}, {"name", "Test model"}, {"path", "weights.bin"}, {"supported_tasks", QJsonArray{"upscale"}}, {"execution", execution("api")}}};
        };
        host.connectAs("authorized-user");
        Field field(*host.engine, host.controller.get(), descriptor("image_model", "nodetool.image.Upscale", {"test"}), QVariantMap{{"id", "full/model-id"}, {"provider", "test"}});
        QTRY_COMPARE(field.find("model-label-model")->property("text").toString(), QStringLiteral("Test model"));
        QCOMPARE(field.find("model-secondary-model")->property("text").toString(), QStringLiteral("weights.bin"));
        QVERIFY(field.open());
        QTRY_VERIFY(field.find("choose_test_full/model-id"));
        QSignalSpy spy(field.editor.get(), SIGNAL(valueCommitted(QVariant)));
        field.click(field.find("choose_test_full/model-id"));
        QTRY_COMPARE(spy.size(), 1);
        const auto selected = committed(spy);
        QCOMPARE(selected.value("path").toString(), "weights.bin");
        QVERIFY(!selected.contains("supported_tasks"));
        WorkflowDocument document;
        document.setNodeMetadata({QJsonObject{{"node_type", "test"}, {"properties", QJsonArray{QJsonObject{{"name", "model"}, {"type", QJsonObject{{"type", "image_model"}}}}}}}});
        QVERIFY(document.load(QJsonObject{{"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{{"id", "n"}, {"type", "test"}, {"data", QJsonObject{{"model", "legacy/model"}}}}}}, {"edges", QJsonArray{}}}}}));
        QVERIFY(document.applyCommand({{"op", "setProperty"}, {"id", "n"}, {"name", "model"}, {"value", QJsonObject::fromVariantMap(selected)}}));
        QCOMPARE(document.undoStack()->count(), 1);
        document.undo();
        QCOMPARE(document.node("n").value("data").toObject().value("model").toString(), "legacy/model");
        document.redo();
        WorkflowDocument reopened;
        QVERIFY(reopened.load(document.snapshot()));
        QCOMPARE(reopened.node("n").value("data").toObject().value("model"), QJsonValue(QJsonObject::fromVariantMap(selected)));
        field.editor->setProperty("writable", false);
        QVERIFY(QMetaObject::invokeMethod(field.popup(), "choose", Q_ARG(QVariant, "full/model-id"), Q_ARG(QVariant, "test")));
        QCOMPARE(spy.size(), 1);
    }
    void cancelAndScopeReset() {
        QTemporaryDir settings;
        QSettings::setPath(QSettings::IniFormat, QSettings::UserScope, settings.path());
        QTcpServer server;
        QVERIFY(server.listen(QHostAddress::LocalHost));
        QPointer<QTcpSocket> held;
        connect(&server, &QTcpServer::newConnection, &server, [&] { held = server.nextPendingConnection(); });
        ModelPickerController controller;
        controller.configure(QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())), "first-account", "first");
        auto* catalog = qobject_cast<nt::modelpicker::Catalog*>(controller.catalogFor("language_model", {}, {}));
        QVERIFY(catalog);
        QTRY_VERIFY(held);
        QVERIFY(controller.loading());
        controller.configure({}, {}, {});
        QVERIFY(!controller.loading());
        QVERIFY(!catalog->loading());
        QVERIFY(catalog->models().isEmpty());
        QCoreApplication::processEvents();
        QVERIFY(controller.error().isEmpty());
        controller.configure(QUrl("http://remote.example"), "secret", "second");
        QVERIFY(!controller.error().isEmpty());
        QVERIFY(!controller.loading());
    }
    void typedBoundary() {
        const QJsonObject declaration{{"type", QJsonObject{{"type", "language_model"}}}, {"default", QJsonObject{{"provider", "locked"}}}};
        QCOMPARE(propertyKind(declaration), "model");
        QVERIFY(validatePropertyValue(declaration, "legacy/model").isEmpty());
        QVERIFY(!validatePropertyValue(declaration, QJsonObject{{"type", "language_model"}, {"id", "m"}, {"provider", "other"}}).isEmpty());
        QVERIFY(validatePropertyValue(declaration, QJsonObject{{"type", "language_model"}, {"id", "m"}, {"provider", "locked"}}).isEmpty());
        QVERIFY(!validatePropertyValue(declaration, 42).isEmpty());
        QVERIFY(!validatePropertyValue(declaration, QJsonObject{{"type", "image_model"}, {"id", "m"}, {"provider", "locked"}}).isEmpty());
        const auto kindOf = [](const char* type) { return propertyKind(QJsonObject{{"type", QJsonObject{{"type", type}}}}); };
        for (const auto* type : {"image_model", "video_model", "tts_model", "asr_model", "music_model", "embedding_model", "rerank_model", "audio_to_audio_model", "hf.text_to_image", "tjs.text_classification", "llama_model", "model_3d_model"}) {
            QCOMPARE(kindOf(type), QString("model"));
        }
        // A media default names a provider without locking the field to it.
        const QJsonObject image{{"type", QJsonObject{{"type", "image_model"}}}, {"default", QJsonObject{{"provider", "fal"}}}};
        QVERIFY(validatePropertyValue(image, QJsonObject{{"type", "image_model"}, {"id", "m"}, {"provider", "other"}}).isEmpty());
        const QJsonObject hf{{"type", QJsonObject{{"type", "hf.text_to_image"}}}};
        QVERIFY(validatePropertyValue(hf, QJsonObject{{"type", "hf.text_to_image"}, {"repo_id", "org/repo"}, {"path", QJsonValue::Null}}).isEmpty());
        const QJsonObject tjs{{"type", QJsonObject{{"type", "tjs.text_classification"}}}};
        QVERIFY(validatePropertyValue(tjs, QJsonObject{{"type", "tjs.text_classification"}, {"repo_id", "Xenova/bert"}, {"path", QJsonValue::Null}}).isEmpty());
        QVERIFY(!validatePropertyValue(tjs, QJsonObject{{"type", "hf.text_to_image"}, {"repo_id", "Xenova/bert"}}).isEmpty());
        const QJsonObject llama{{"type", QJsonObject{{"type", "llama_model"}}}};
        QVERIFY(validatePropertyValue(llama, QJsonObject{{"type", "llama_model"}, {"repo_id", "llama3:8b"}}).isEmpty());
        QVERIFY(!validatePropertyValue(llama, QJsonObject{{"type", "llama_model"}}).isEmpty());
    }
};
QTEST_MAIN(ModelPickerTest)
#include "ModelPickerTest.moc"
