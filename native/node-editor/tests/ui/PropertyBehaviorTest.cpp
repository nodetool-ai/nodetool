#include "ui/EditorWindow.h"
#include <QDir>
#include <QFile>
#include <QDesktopServices>
#include <QJsonDocument>
#include <QJSValue>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWidget>
#include <QQuickWindow>
#include <QTcpServer>
#include <QTcpSocket>
#include <QTemporaryDir>
#include <QUrlQuery>
#include <QtTest>
#include <memory>

using namespace nodetool;
namespace {
const QString AssetId = "abcdef1234567890abcdef1234567890";
QVariant plain(QVariant value) {
    return value.metaType() == QMetaType::fromType<QJSValue>() ? value.value<QJSValue>().toVariant() : value;
}
class Server final : public QTcpServer {
public:
    QList<QByteArray> requests;
    QList<QPointer<QTcpSocket>> pending;
    bool delay = false;
    static void send(QTcpSocket* socket, const QByteArray& body) {
        if (!socket || socket->state() != QAbstractSocket::ConnectedState) {
            return;
        }
        socket->write("HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: " + QByteArray::number(body.size()) + "\r\n\r\n" + body);
        socket->disconnectFromHost();
    }
    Server() {
        listen(QHostAddress::LocalHost);
        connect(this, &QTcpServer::newConnection, this, [this] {
            auto* socket = nextPendingConnection();
            socket->setParent(this);
            // native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
            auto bytes = std::make_shared<QByteArray>();
            // native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
            auto served = std::make_shared<bool>(false);
            connect(socket, &QTcpSocket::readyRead, this, [this, socket, bytes, served] {
                *bytes += socket->readAll();
                const auto end = bytes->indexOf("\r\n\r\n");
                if (*served || end < 0) {
                    return;
                }
                int length = 0;
                for (const auto& line : bytes->left(end).split('\n')) {
                    if (line.toLower().startsWith("content-length:")) {
                        length = line.mid(15).trimmed().toInt();
                    }
                }
                if (bytes->size() < end + 4 + length) {
                    return;
                }
                *served = true;
                requests.append(*bytes);
                if (bytes->startsWith("GET /ws")) {
                    socket->disconnectFromHost();
                    return;
                }
                if (delay && (bytes->contains("/trpc/assets.") || bytes->startsWith("POST /api/assets"))) {
                    pending.append(socket);
                    return;
                }
                send(socket, response(*bytes));
            });
        });
    }
    // Router contracts: assets.ts list/get/search, fonts.ts list, models.ts
    // imageByProvider/videoByProvider. HTTP asset creation returns the row directly.
    QByteArray response(const QByteArray& request) const {
        const auto target = QUrl::fromEncoded(request.split(' ').value(1));
        const auto input = QJsonDocument::fromJson(QUrlQuery(target).queryItemValue("input", QUrl::FullyDecoded).toUtf8()).object();
        const QJsonObject asset{{"id", AssetId}, {"name", input.value("project_id").toString("Guide.txt")}, {"content_type", input.value("content_type") == "folder" ? "folder" : input.value("page_size").toInt() == 1000 ? "image/png" : "text/plain"}, {"get_url", url().resolved(QUrl("/guide.txt")).toString()}, {"metadata", QJsonObject{{"nodetool_entity", QJsonObject{{"kind", "character"}, {"name", "Ada"}}}}}};
        if (request.startsWith("POST /api/assets")) {
            return QJsonDocument(asset).toJson(QJsonDocument::Compact);
        }
        if (request.startsWith("GET /guide.txt")) {
            return "Document preview text";
        }
        QJsonValue data = QJsonObject{};
        if (target.path().contains("workflows.list")) {
            data = QJsonObject{{"workflows", QJsonArray{QJsonObject{{"id", AssetId}, {"name", "Workflow"}}}}, {"next", QJsonValue::Null}};
        } else if (target.path().contains("workflows.get")) {
            data = QJsonObject{{"id", AssetId}, {"name", "Workflow"}};
        } else if (target.path().contains("collections.list")) {
            data = QJsonObject{{"collections", QJsonArray{QJsonObject{{"name", "Collection"}, {"count", 1}}}}};
        } else if (target.path().contains("assets.get")) {
            data = asset;
        } else if (target.path().contains("assets.")) {
            data = QJsonObject{{"assets", QJsonArray{asset}}, {"next", QJsonValue::Null}, {"next_cursor", QJsonValue::Null}};
        } else if (target.path().contains("fonts.list")) {
            data = QJsonObject{{"fonts", QJsonArray{QJsonObject{{"name", "Example"}, {"portable", true}}}}};
        } else if (target.path().contains("ByProvider")) {
            data = QJsonArray{QJsonObject{{"id", "model"}, {"durations", QJsonArray{6, 12}}, {"resolutions", QJsonArray{"2K", "720p"}}, {"aspect_ratios", QJsonArray{"3:2"}}}};
        }
        return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", data}}}}).toJson(QJsonDocument::Compact);
    }
    QUrl url() const {
        return QUrl(QString("http://127.0.0.1:%1").arg(serverPort()));
    }
};
QQuickItem* find(QQuickItem* root, const QString& name) {
    if (!root) {
        return nullptr;
    }
    if (root->objectName() == name) {
        return root;
    }
    for (auto* child : root->childItems()) {
        if (auto* result = find(child, name)) {
            return result;
        }
    }
    return nullptr;
}
QQuickWidget* inspector(EditorWindow& window) {
    for (auto* panel : window.findChildren<QQuickWidget*>()) {
        if (panel->source().fileName() == "Inspector.qml") {
            return panel;
        }
    }
    return nullptr;
}
QQuickItem* item(EditorWindow& window, const QString& name) {
    auto* panel = inspector(window);
    return panel ? find(panel->quickWindow()->contentItem(), name) : nullptr;
}
void click(EditorWindow& window, QQuickItem* control) {
    QVERIFY(control);
    for (auto* ancestor = control->parentItem(); ancestor; ancestor = ancestor->parentItem()) {
        if (ancestor->objectName() == "property-scroll") {
            ancestor->setProperty("contentY", ancestor->property("contentY").toDouble() + control->mapToItem(ancestor, QPointF()).y() - 20);
            break;
        }
    }
    QCoreApplication::processEvents();
    QList<QQuickItem*> ancestors;
    for (auto* ancestor = control->parentItem(); ancestor; ancestor = ancestor->parentItem()) {
        ancestors.prepend(ancestor);
    }
    for (auto* ancestor : ancestors) {
        ancestor->ensurePolished();
    }
    control->ensurePolished();
    QTest::mouseClick(inspector(window)->quickWindow(), Qt::LeftButton, Qt::NoModifier, control->mapToScene(QPointF(control->width() / 2, control->height() / 2)).toPoint());
}
QJsonObject declaration(const QString& kind) {
    QJsonObject type{{"type", kind}};
    if (kind == "tools" || kind == "entity_list" || kind == "workflow_list") {
        type = {{"type", "list"}, {"type_args", QJsonArray{QJsonObject{{"type", kind == "tools" ? "tool_name" : kind == "workflow_list" ? "workflow" : "entity"}}}}};
    }
    QJsonObject result{{"name", "value"}, {"type", type}};
    if (kind.startsWith("media_")) {
        result["type"] = QJsonObject{{"type", kind == "media_duration" || kind == "media_strength" ? "float" : "str"}};
        result["json_schema_extra"] = QJsonObject{{"type", kind}};
    }
    return result;
}
void setup(EditorWindow& window, const QString& kind, bool connected = false, bool readOnly = false) {
    if (!window.session()->serverUrl().isEmpty()) {
        QSignalSpy catalogLoaded(window.session(), &nodetool::node_editor::WorkflowSession::catalogChanged);
        QTRY_VERIFY(!catalogLoaded.isEmpty());
    }
    const auto nodeType = kind == "document" ? "nodetool.constant.Document" : "Fixture";
    window.setCatalog({QJsonObject{{"node_type", nodeType}, {"properties", QJsonArray{declaration(kind)}}}});
    QJsonArray nodes{QJsonObject{{"id", "n"}, {"type", nodeType}, {"data", QJsonObject{}}}};
    if (readOnly) {
        nodes.append(QJsonObject{{"id", "legacy"}, {"type", "group"}});
    }
    QJsonArray edges;
    if (connected) {
        nodes.append(QJsonObject{{"id", "source"}, {"type", "Fixture"}});
        edges.append(QJsonObject{{"id", "edge"}, {"source", "source"}, {"sourceHandle", "value"}, {"target", "n"}, {"targetHandle", "value"}});
    }
    QVERIFY(window.document()->load({{"project_id", "project-a"}, {"graph", QJsonObject{{"nodes", nodes}, {"edges", edges}}}}));
    window.resize(1300, 1000);
    window.show();
    QVERIFY(window.selectNode("n"));
}
}
class PropertyBehaviorTest final : public QObject {
    Q_OBJECT
    QUrl opened;
public slots:
    void captureUrl(const QUrl& url) {
        opened = url;
    }
private slots:
    void inspectorEditors_data() {
        QTest::addColumn<QString>("kind");
        QTest::addColumn<int>("state");
        for (const auto& kind : {"workflow", "workflow_list", "collection", "color", "image_size", "font", "folder", "entity", "entity_list", "document", "file", "file_path", "folder_path", "tools", "media_duration", "media_strength", "media_resolution_image", "media_resolution_video", "media_aspect_ratio_image", "media_aspect_ratio_video"}) {
            for (int state = 0; state < 3; ++state) {
                QTest::newRow(qPrintable(QString("%1-%2").arg(kind).arg(state))) << QString(kind) << state;
            }
        }
    }
    void inspectorEditors() {
        QFETCH(QString, kind);
        QFETCH(int, state);
        Server server;
        EditorWindow window;
        window.session()->connectToServer(server.url(), "secret", "owner");
        setup(window, kind, state == 1, state == 2);
        QTRY_VERIFY(!window.properties().isEmpty());
        const auto row = window.properties().first().toMap();
        QCOMPARE(row["kind"].toString(), kind);
        QCOMPARE(row["projectId"].toString(), "project-a");
        if (state == 1) {
            QVERIFY(row["connected"].toBool());
        }
        if (state == 2) {
            QVERIFY(window.readOnly());
            QVERIFY(!row["editable"].toBool());
        }
        const auto name = kind.startsWith("workflow") ? "workflow-editor-value" : kind == "collection" ? "collection-editor-value" : kind == "color" ? "color-editor-value" : kind == "image_size" ? "image-size-editor-value" : kind == "file" ? QString{} : kind == "document" ? "asset-editor-value" : kind.endsWith("_path") ? "path-editor-value" : kind == "tools" ? "tools-editor-value" : kind.startsWith("media_") ? "media-parameter-value" : "remaining-resource-value";
        if (name.isEmpty()) {
            QTRY_VERIFY(item(window, "file-reference-value"));
            QCOMPARE(item(window, "file-reference-value")->isVisible(), state != 1);
            return;
        }
        QTRY_VERIFY(item(window, name));
        auto* editor = item(window, name);
        QCOMPARE(editor->property("writable").toBool(), state == 0);
        if (state == 1) {
            QVERIFY(!editor->isVisible());
        }
        if (state != 0) {
            return;
        }
        const auto before = window.document()->undoStack()->count();
        if (kind.startsWith("workflow")) {
            QQuickItem* browse = nullptr;
            for (auto* child : editor->findChildren<QQuickItem*>()) {
                if (child->property("text").toString() == "Browse workflows") {
                    browse = child;
                    break;
                }
            }
            click(window, browse);
            QTRY_VERIFY(item(window, "workflow-select-value") && item(window, "workflow-select-value")->isEnabled());
            click(window, item(window, "workflow-select-value"));
            QTest::keyClick(inspector(window)->quickWindow(), Qt::Key_Down);
            QTest::keyClick(inspector(window)->quickWindow(), Qt::Key_Return);
        } else if (kind == "collection" || kind == "image_size") {
            const auto selectName = kind == "collection" ? "collection-select-value" : "image-size-preset-value";
            QTRY_VERIFY(item(window, selectName)->isEnabled());
            click(window, item(window, selectName));
            QTest::keyClick(inspector(window)->quickWindow(), Qt::Key_Down);
            QTest::keyClick(inspector(window)->quickWindow(), Qt::Key_Return);
        } else if (kind == "color") {
            auto* field = item(window, "color-hex-value");
            click(window, field);
            QTest::keyClicks(inspector(window), "#123456");
            QTest::keyClick(inspector(window)->quickWindow(), Qt::Key_Return);
        } else if (kind.endsWith("_path")) {
            editor->setProperty("dialogProvider", QVariant::fromValue(qmlEngine(editor)->evaluate("(function(folder, value) { return 'file:///tmp/chosen%20path'; })")));
            click(window, item(window, "path-browse-value"));
        } else if (kind == "tools") {
            click(window, item(window, "tools-menu"));
            QTRY_VERIFY(item(window, "tool-toggle-0"));
            click(window, item(window, "tool-toggle-0"));
        } else if (kind.startsWith("media_")) {
            click(window, item(window, "media-parameter-select-value"));
            QTRY_VERIFY(item(window, "chip-option-0"));
            click(window, item(window, "chip-option-0"));
        } else if (kind == "entity" || kind == "entity_list") {
            QTRY_VERIFY(editor->property("loaded").toBool());
            click(window, item(window, "entity-picker-open"));
            QTRY_VERIFY(item(window, "entity-card-0"));
            click(window, item(window, "entity-card-0"));
        } else if (kind != "document") {
            QTRY_VERIFY(editor->property("loaded").toBool());
            click(window, item(window, "remaining-select-value"));
            QTest::keyClick(inspector(window)->quickWindow(), Qt::Key_Down);
            QTest::keyClick(inspector(window)->quickWindow(), Qt::Key_Return);
        } else {
            click(window, item(window, "asset-refresh-value"));
            QTRY_VERIFY(item(window, "asset-select-value")->isEnabled());
            click(window, item(window, "asset-select-value"));
            QTest::keyClick(inspector(window)->quickWindow(), Qt::Key_Down);
            QTest::keyClick(inspector(window)->quickWindow(), Qt::Key_Return);
        }
        QTRY_COMPARE(window.document()->undoStack()->count(), before + 1);
    }
    void documentDispatch_data() {
        QTest::addColumn<QString>("nodeType");
        QTest::newRow("constant") << QString("nodetool.constant.Document");
        QTest::newRow("input") << QString("nodetool.input.DocumentInput");
        QTest::newRow("other") << QString("Fixture");
    }
    void documentDispatch() {
        QFETCH(QString, nodeType);
        EditorWindow window;
        window.setCatalog({QJsonObject{{"node_type", nodeType}, {"properties", QJsonArray{declaration("document")}}}});
        QVERIFY(window.document()->load({{"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{{"id", "n"}, {"type", nodeType}, {"data", QJsonObject{{"value", QJsonObject{{"id", AssetId}, {"type", "document"}, {"asset_id", AssetId}}}}}}}}, {"edges", QJsonArray{}}}}}));
        window.resize(1300, 1000);
        window.show();
        QVERIFY(window.selectNode("n"));
        QTRY_VERIFY(inspector(window));
        if (nodeType == "Fixture") {
            QTest::qWait(30);
            QVERIFY(!item(window, "asset-editor-value"));
            QTRY_VERIFY(item(window, "document-reference-value"));
            QCOMPARE(item(window, "document-reference-value")->property("text").toString(), AssetId);
        } else {
            QTRY_VERIFY(item(window, "asset-editor-value"));
        }
    }
    void folderCreate() {
        Server server;
        EditorWindow window;
        window.session()->connectToServer(server.url(), "secret", "owner");
        setup(window, "folder");
        QTRY_VERIFY(item(window, "remaining-resource-value") && item(window, "remaining-resource-value")->property("loaded").toBool());
        auto* editor = item(window, "remaining-resource-value");
        click(window, item(window, "folder-create-open"));
        QQuickItem* input = nullptr;
        for (auto* child : editor->findChildren<QQuickItem*>()) {
            if (child->property("accessibleName").toString() == "New folder name") {
                input = child;
                break;
            }
        }
        QVERIFY(input);
        click(window, input);
        QTest::keyClicks(inspector(window), "New folder");
        QTRY_VERIFY(item(window, "remaining-create-folder")->isEnabled());
        const auto count = server.requests.size();
        click(window, item(window, "remaining-create-folder"));
        QTRY_VERIFY(server.requests.size() >= count + 2);
        bool created = false;
        for (const auto& request : server.requests) {
            if (request.startsWith("POST /api/assets/")) {
                QVERIFY(request.contains("New folder"));
                QVERIFY(request.contains("\"parent_id\":\"\""));
                created = true;
            }
        }
        QVERIFY(created);
        QCOMPARE(window.document()->undoStack()->count(), 0);
    }
    void providerConstraints_data() {
        QTest::addColumn<QString>("kind");
        QTest::addColumn<QVariantList>("expected");
        QTest::newRow("duration") << QString("media_duration") << QVariantList{6, 12};
        QTest::newRow("image-resolution") << QString("media_resolution_image") << QVariantList{"2K"};
        QTest::newRow("video-resolution") << QString("media_resolution_video") << QVariantList{"720p"};
        QTest::newRow("image-ratio") << QString("media_aspect_ratio_image") << QVariantList{"3:2"};
        QTest::newRow("video-ratio") << QString("media_aspect_ratio_video") << QVariantList{"3:2"};
    }
    void providerConstraints() {
        QFETCH(QString, kind);
        QFETCH(QVariantList, expected);
        Server server;
        EditorWindow window;
        window.session()->connectToServer(server.url(), "secret", "owner");
        setup(window, kind);
        auto snapshot = window.document()->snapshot();
        auto graph = snapshot["graph"].toObject();
        auto nodes = graph["nodes"].toArray();
        auto node = nodes[0].toObject();
        node["data"] = QJsonObject{{"model", QJsonObject{{"provider", "fal"}, {"id", "model"}}}};
        nodes[0] = node;
        graph["nodes"] = nodes;
        snapshot["graph"] = graph;
        QVERIFY(window.document()->load(snapshot));
        QVERIFY(window.selectNode("n"));
        QTRY_VERIFY(item(window, "media-parameter-value"));
        QTRY_COMPARE(plain(item(window, "media-parameter-value")->property("options")).toList(), expected);
        click(window, item(window, "media-parameter-select-value"));
        QTRY_VERIFY(item(window, "chip-option-0"));
        click(window, item(window, "chip-option-0"));
        QTRY_COMPARE(window.document()->node("n")["data"].toObject()["value"].toVariant(), expected.first());
    }
    void uploads_data() {
        QTest::addColumn<bool>("delayed");
        QTest::newRow("upload") << false;
        QTest::newRow("cancel-delayed-upload") << true;
    }
    void uploads() {
        QFETCH(bool, delayed);
        QTemporaryDir directory;
        const auto path = directory.filePath("guide.txt");
        QFile file(path);
        QVERIFY(file.open(QIODevice::WriteOnly));
        file.write("Upload contents");
        file.close();
        Server server;
        EditorWindow window;
        window.session()->connectToServer(server.url(), "secret", "owner");
        setup(window, "document");
        QTRY_VERIFY(item(window, "asset-editor-value"));
        auto* editor = item(window, "asset-editor-value");
        const auto script = "(function(kind, filters) { if (kind !== 'document' || filters[0] !== 'Documents (*.pdf *.doc *.docx *.txt *.html)') throw Error('Wrong filters'); return " + QString::fromUtf8(QJsonDocument(QJsonArray{QUrl::fromLocalFile(path).toString()}).toJson(QJsonDocument::Compact)).mid(1).chopped(1) + "; })";
        editor->setProperty("dialogProvider", QVariant::fromValue(qmlEngine(editor)->evaluate(script)));
        server.delay = delayed;
        click(window, item(window, "asset-upload-value"));
        if (delayed) {
            QTRY_VERIFY(!server.pending.isEmpty());
            const auto socket = server.pending.last();
            click(window, item(window, "asset-cancel-upload"));
            QTRY_VERIFY(!socket || socket->state() == QAbstractSocket::UnconnectedState);
            Server::send(socket, server.response("POST /api/assets HTTP/1.1"));
            QTest::qWait(50);
            QCOMPARE(window.document()->undoStack()->count(), 0);
        } else {
            QTRY_COMPARE(window.document()->node("n")["data"].toObject()["value"].toObject()["asset_id"].toString(), AssetId);
            QTRY_VERIFY(item(window, "document-text-preview")->property("text").toString().contains("Document preview text"));
            QVERIFY(item(window, "document-open")->isVisible());
            QDesktopServices::setUrlHandler("file", this, "captureUrl");
            click(window, item(window, "document-open"));
            QDesktopServices::unsetUrlHandler("file");
            QVERIFY(opened.isLocalFile());
            QVERIFY(QFile::exists(opened.toLocalFile()));
        }
    }
    void projectChangeDiscardsOldResponse() {
        Server server;
        server.delay = true;
        EditorWindow window;
        window.session()->connectToServer(server.url(), "secret", "owner");
        setup(window, "folder");
        QTRY_VERIFY(!server.pending.isEmpty());
        const auto old = server.pending.last();
        server.delay = false;
        auto snapshot = window.document()->snapshot();
        snapshot["project_id"] = "project-b";
        window.document()->reconcileMetadata(snapshot);
        QTRY_VERIFY(item(window, "remaining-resource-value"));
        auto* editor = item(window, "remaining-resource-value");
        QTRY_COMPARE(plain(editor->property("resources")).toList().value(0).toMap().value("name").toString(), "project-b");
        QTRY_VERIFY(!old || old->state() == QAbstractSocket::UnconnectedState);
        Server::send(old, server.response("GET /trpc/assets.list?input=%7B%22project_id%22:%22project-a%22%7D HTTP/1.1"));
        QTest::qWait(50);
        QCOMPARE(plain(editor->property("resources")).toList().value(0).toMap().value("name").toString(), "project-b");
    }
    void closingTabAbortsNetwork() {
        Server server;
        server.delay = true;
        EditorWindow window;
        window.session()->connectToServer(server.url(), "secret", "owner");
        setup(window, "folder");
        QTRY_VERIFY(item(window, "remaining-resource-value"));
        QTRY_VERIFY(!server.pending.isEmpty());
        const auto socket = server.pending.last();
        QVERIFY(socket && socket->state() == QAbstractSocket::ConnectedState);
        window.newTab();
        QVERIFY(window.closeTab(0));
        QTRY_VERIFY(!socket || socket->state() == QAbstractSocket::UnconnectedState);
    }
    // web/src/components/node/PropertyInput.tsx lines 323-328 and 556-640: a property resets only when
    // it has a non-null default, it is marked and resettable once its value differs, and a reset
    // undoes as one step.
private:
    // Whole-window captures in both themes, kept when NODETOOL_VISIBILITY_CAPTURE names a directory.
    static void capture(EditorWindow& window, const QString& name) {
        const auto directory = qEnvironmentVariable("NODETOOL_VISIBILITY_CAPTURE");
        if (directory.isEmpty()) {
            return;
        }
        QVERIFY(QDir().mkpath(directory));
        for (const bool dark : {true, false}) {
            window.setDarkTheme(dark);
            QTest::qWait(150);
            QVERIFY(window.grab().save(directory + "/" + name + (dark ? "-dark.png" : "-light.png")));
        }
    }
    static void resetSetup(EditorWindow& window, const QJsonValue& stored, const QJsonValue& fallback, bool storedPresent = true) {
        QJsonObject property{{"name", "Count"}, {"title", "Count"}, {"type", QJsonObject{{"type", "int"}}}, {"required", false}};
        if (!fallback.isUndefined()) {
            property["default"] = fallback;
        }
        window.setCatalog({QJsonObject{{"node_type", "Fixture"}, {"properties", QJsonArray{property}}}});
        QJsonObject data;
        if (storedPresent) {
            data["Count"] = stored;
        }
        QVERIFY(window.document()->load({{"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{{"id", "n"}, {"type", "Fixture"}, {"data", data}}}}, {"edges", QJsonArray{}}}}}));
        window.resize(1300, 1000);
        window.show();
        QVERIFY(window.selectNode("n"));
        QTRY_VERIFY(item(window, "changed-marker"));
    }
    static void secondaryClick(EditorWindow& window, QQuickItem* target, Qt::KeyboardModifiers modifiers) {
        QTest::mouseClick(inspector(window)->quickWindow(), Qt::RightButton, modifiers, target->mapToScene(QPointF(target->width() / 2, target->height() / 2)).toPoint());
    }
private slots:
    void changedValueIsMarkedAndResetsInOneUndoStep() {
        EditorWindow window;
        resetSetup(window, 5, 2);
        auto* marker = item(window, "changed-marker");
        auto* reset = item(window, "reset-default");
        QVERIFY(marker->isVisible());
        QVERIFY(reset && reset->isVisible() && reset->isEnabled());
        capture(window, "changed");
        click(window, reset);
        QTRY_VERIFY(!window.document()->node("n")["data"].toObject().contains("Count"));
        QTRY_VERIFY(!item(window, "changed-marker")->isVisible());
        QVERIFY(!item(window, "reset-default")->isVisible());
        QCOMPARE(window.document()->undoStack()->count(), 1);
        window.document()->undo();
        QCOMPARE(window.document()->node("n")["data"].toObject()["Count"].toInt(), 5);
        QTRY_VERIFY(item(window, "changed-marker")->isVisible());
    }
    void valueEqualToDefaultIsNotChanged() {
        EditorWindow window;
        resetSetup(window, 2, 2);
        QVERIFY(!item(window, "changed-marker")->isVisible());
        // A value at its default shows no reset action, as W19 records.
        auto* reset = item(window, "reset-default");
        QVERIFY(!reset || !reset->isVisible());
        QCOMPARE(window.document()->undoStack()->count(), 0);
        QCOMPARE(window.document()->node("n")["data"].toObject()["Count"].toInt(), 2);
    }
    void nullDefaultHasNothingToResetTo() {
        EditorWindow window;
        resetSetup(window, 5, QJsonValue::Null);
        QVERIFY(!item(window, "changed-marker")->isVisible());
        QVERIFY(!item(window, "reset-default") || !item(window, "reset-default")->isVisible());
        QVERIFY(window.document()->node("n")["data"].toObject().contains("Count"));
    }
    void controlRightClickResetsAChangedProperty() {
        EditorWindow window;
        resetSetup(window, 5, 2);
        auto* marker = item(window, "changed-marker");
        QVERIFY(marker);
        // A plain right click does nothing, as the web opens its context menu instead.
        secondaryClick(window, marker, Qt::NoModifier);
        QTest::qWait(30);
        QCOMPARE(window.document()->node("n")["data"].toObject()["Count"].toInt(), 5);
        secondaryClick(window, marker, Qt::ControlModifier);
        QTRY_VERIFY(!window.document()->node("n")["data"].toObject().contains("Count"));
        QCOMPARE(window.document()->undoStack()->count(), 1);
        // A value at its default ignores the shortcut, as the web's isChanged guard.
        secondaryClick(window, item(window, "changed-marker"), Qt::ControlModifier);
        QTest::qWait(30);
        QCOMPARE(window.document()->undoStack()->count(), 1);
    }
    // web/src/components/properties/{ListProperty,DictProperty,JSONProperty,RecordTypeProperty}.tsx:
    // every committed edit is one document write, unknown fields survive, and text that is not valid
    // never reaches the document.
private:
    static QJsonObject listOf(const char* entry) {
        return {{"type", "list"}, {"type_args", QJsonArray{QJsonObject{{"type", entry}}}}};
    }
    static void structuredSetup(EditorWindow& window, const QJsonObject& type, const QJsonValue& value, const QString& editor = "structured-editor") {
        window.setCatalog({QJsonObject{{"node_type", "Fixture"}, {"properties", QJsonArray{QJsonObject{{"name", "value"}, {"type", type}, {"required", false}}}}}});
        QVERIFY(window.document()->load({{"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{{"id", "n"}, {"type", "Fixture"}, {"data", QJsonObject{{"value", value}}}}}}, {"edges", QJsonArray{}}}}}));
        window.resize(1300, 1000);
        window.show();
        QVERIFY(window.selectNode("n"));
        QTRY_VERIFY(item(window, editor));
    }
    static QJsonValue stored(EditorWindow& window) {
        return window.document()->node("n")["data"].toObject()["value"];
    }
    static void type(EditorWindow& window, const QString& text) {
        QTest::keyClick(inspector(window)->quickWindow(), Qt::Key_A, Qt::ControlModifier);
        for (const auto character : text.toLatin1()) {
            QTest::keyClick(inspector(window)->quickWindow(), character);
        }
    }
private slots:
    void listEditsUseOneUndoStepEach() {
        EditorWindow window;
        structuredSetup(window, listOf("int"), QJsonArray{1, 2});
        click(window, item(window, "structured-add"));
        QTRY_COMPARE(stored(window).toArray(), (QJsonArray{1, 2, 0}));
        QCOMPARE(window.document()->undoStack()->count(), 1);
        click(window, item(window, "structured-down-0"));
        QTRY_COMPARE(stored(window).toArray(), (QJsonArray{2, 1, 0}));
        click(window, item(window, "structured-remove-1"));
        QTRY_COMPARE(stored(window).toArray(), (QJsonArray{2, 0}));
        QCOMPARE(window.document()->undoStack()->count(), 3);
        window.document()->undo();
        QCOMPARE(stored(window).toArray(), (QJsonArray{2, 1, 0}));
        window.document()->undo();
        window.document()->undo();
        QCOMPARE(stored(window).toArray(), (QJsonArray{1, 2}));
    }
    void nestedEntriesEditAsJsonAndKeepInvalidDraftsOut() {
        EditorWindow window;
        const QJsonArray original{QJsonObject{{"a", 1}, {"unknown", true}}, QJsonArray{1, 2}};
        structuredSetup(window, listOf("any"), original);
        QTRY_VERIFY(item(window, "structured-nested-0") && item(window, "structured-nested-1"));
        capture(window, "structured");
        click(window, item(window, "structured-nested-0"));
        type(window, "{\"a\": ");
        click(window, item(window, "structured-nested-1"));
        QTRY_VERIFY(item(window, "structured-editor")->property("error").toString().contains("valid JSON"));
        QCOMPARE(stored(window).toArray(), original);
        QCOMPARE(window.document()->undoStack()->count(), 0);
        click(window, item(window, "structured-nested-0"));
        type(window, "{\"a\": 2, \"unknown\": true, \"nested\": {\"b\": [3]}}");
        click(window, item(window, "structured-nested-1"));
        QTRY_COMPARE(window.document()->undoStack()->count(), 1);
        const auto result = stored(window).toArray();
        QCOMPARE(result.at(0).toObject(), (QJsonObject{{"a", 2}, {"unknown", true}, {"nested", QJsonObject{{"b", QJsonArray{3}}}}}));
        QCOMPARE(result.at(1), original.at(1));
        QVERIFY(item(window, "structured-editor")->property("error").toString().isEmpty());
        // Escape cancels a draft without writing.
        click(window, item(window, "structured-nested-1"));
        type(window, "[9]");
        QTest::keyClick(inspector(window)->quickWindow(), Qt::Key_Escape);
        QTest::qWait(30);
        QCOMPARE(window.document()->undoStack()->count(), 1);
        QCOMPARE(stored(window).toArray().at(1), original.at(1));
    }
    void nestedContainerTypeIsEnforced() {
        EditorWindow window;
        const QJsonArray original{QJsonArray{1}, QJsonArray{2}};
        structuredSetup(window, QJsonObject{{"type", "list"}, {"type_args", QJsonArray{listOf("int")}}}, original);
        QTRY_VERIFY(item(window, "structured-nested-0") && item(window, "structured-nested-1"));
        click(window, item(window, "structured-nested-0"));
        type(window, "{\"a\": 1}");
        click(window, item(window, "structured-nested-1"));
        QTRY_COMPARE(item(window, "structured-editor")->property("error").toString(), QString("Enter a JSON list"));
        QCOMPARE(stored(window).toArray(), original);
        QCOMPARE(window.document()->undoStack()->count(), 0);
    }
    void jsonResourceKeepsUnknownFieldsAndRejectsBadText() {
        EditorWindow window;
        structuredSetup(window, QJsonObject{{"type", "json"}}, QJsonObject{{"type", "json"}, {"data", "{}"}, {"future", 7}});
        click(window, item(window, "structured-json"));
        type(window, "{\"a\": ");
        click(window, item(window, "structured-apply-json"));
        QTRY_VERIFY(!item(window, "structured-editor")->property("error").toString().isEmpty());
        QCOMPARE(stored(window).toObject()["data"].toString(), QString("{}"));
        QCOMPARE(window.document()->undoStack()->count(), 0);
        click(window, item(window, "structured-json"));
        type(window, "{\"a\": [1, 2]}");
        click(window, item(window, "structured-apply-json"));
        QTRY_COMPARE(window.document()->undoStack()->count(), 1);
        QCOMPARE(stored(window).toObject()["data"].toString(), QString("{\"a\": [1, 2]}"));
        QCOMPARE(stored(window).toObject()["future"].toInt(), 7);
        // Blank text clears the resource without an error, as the web does.
        click(window, item(window, "structured-json"));
        type(window, "");
        QTest::keyClick(inspector(window)->quickWindow(), Qt::Key_Delete);
        click(window, item(window, "structured-apply-json"));
        QTRY_COMPARE(stored(window).toObject()["data"].toString(), QString());
        QVERIFY(item(window, "structured-editor")->property("error").toString().isEmpty());
        window.document()->undo();
        QCOMPARE(stored(window).toObject()["data"].toString(), QString("{\"a\": [1, 2]}"));
    }
    void dictionaryKeysStayUnique() {
        EditorWindow window;
        structuredSetup(window, QJsonObject{{"type", "dict"}, {"type_args", QJsonArray{QJsonObject{{"type", "str"}}, QJsonObject{{"type", "int"}}}}}, QJsonObject{{"first", 1}, {"second", 2}});
        click(window, item(window, "structured-key-0"));
        type(window, "second");
        click(window, item(window, "structured-key-1"));
        QTRY_VERIFY(!item(window, "structured-editor")->property("error").toString().isEmpty());
        QCOMPARE(stored(window).toObject(), (QJsonObject{{"first", 1}, {"second", 2}}));
        QCOMPARE(window.document()->undoStack()->count(), 0);
        click(window, item(window, "structured-add"));
        QTRY_COMPARE(stored(window).toObject().size(), 3);
        QCOMPARE(window.document()->undoStack()->count(), 1);
    }
    void recordColumnsKeepRowsAndUnknownFields() {
        EditorWindow window;
        const QJsonObject original{{"type", "record_type"}, {"columns", QJsonArray{QJsonObject{{"name", "Column 1"}, {"data_type", "string"}, {"description", ""}, {"future", 8}}}}, {"data", QJsonArray{QJsonArray{"x"}}}, {"future", 9}};
        // RecordTypeProperty.tsx: Add column over the columns manager.
        structuredSetup(window, QJsonObject{{"type", "record_type"}}, original, "record-type-editor");
        click(window, item(window, "record-add-column"));
        QTRY_COMPARE(stored(window).toObject()["columns"].toArray().size(), 2);
        const auto result = stored(window).toObject();
        QCOMPARE(result["columns"].toArray().at(1).toObject()["name"].toString(), QString("Column 2"));
        QCOMPARE(result["columns"].toArray().at(0).toObject()["future"].toInt(), 8);
        QCOMPARE(result["data"], original["data"]);
        QCOMPARE(result["future"].toInt(), 9);
        QCOMPARE(window.document()->undoStack()->count(), 1);
    }
};
QTEST_MAIN(PropertyBehaviorTest)
#include "PropertyBehaviorTest.moc"
