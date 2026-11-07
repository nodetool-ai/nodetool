#include "graph/CanvasDropController.h"
#include "graph/CardBodies.h"
#include "graph/EditorScene.h"
#include "graph/WorkflowGraphModel.h"
#include "ui/EditorWindow.h"
#include <QBuffer>
#include <QDragEnterEvent>
#include <QDir>
#include <QDropEvent>
#include <QFile>
#include <QGraphicsView>
#include <QImage>
#include <QJsonDocument>
#include <QMimeData>
#include <QPainter>
#include <QPointer>
#include <QQuickItem>
#include <QQuickWidget>
#include <QStandardPaths>
#include <QTcpServer>
#include <QTcpSocket>
#include <QTemporaryDir>
#include <QUndoStack>
#include <QUrlQuery>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QtNodes/internal/ConnectionGraphicsObject.hpp>
#include <QtTest>
#include <cmath>

using namespace nodetool;
using QtNodes::NodeId;

namespace {
QJsonObject fixture() {
    QFile file(QStringLiteral(WINDOW_PARITY_FIXTURE));
    if (!file.open(QIODevice::ReadOnly)) {
        return {};
    }
    return QJsonDocument::fromJson(file.readAll()).object();
}

// Answers the model catalog and asset upload procedures the card bodies call.
class Server final : public QTcpServer {
public:
    QHash<QString, QJsonObject> assets;
    int uploads = 0;

    Server() {
        listen(QHostAddress::LocalHost);
        connect(this, &QTcpServer::newConnection, this, [this] {
            while (hasPendingConnections()) {
                auto *socket = nextPendingConnection();
                socket->setParent(this);
                connect(socket, &QTcpSocket::readyRead, this, [this, socket] { respond(socket); });
            }
        });
    }

    QUrl url() const { return QUrl(QStringLiteral("http://127.0.0.1:%1").arg(serverPort())); }

private:
    void respond(QTcpSocket *socket) {
        const auto bytes = socket->property("bytes").toByteArray() + socket->readAll();
        socket->setProperty("bytes", bytes);
        const auto end = bytes.indexOf("\r\n\r\n");
        if (end < 0 || socket->property("done").toBool()) {
            return;
        }
        qint64 length = 0;
        for (const auto &line : bytes.left(end).split('\n')) {
            if (line.toLower().startsWith("content-length:")) {
                length = line.mid(15).trimmed().toLongLong();
            }
        }
        if (bytes.size() < end + 4 + length) {
            return;
        }
        socket->setProperty("done", true);
        const auto target = bytes.split(' ').value(1);
        const auto url = QUrl(QStringLiteral("http://fixture") + QString::fromUtf8(target));
        QJsonValue data = QJsonArray{};
        if (target.startsWith("/trpc/models.providers")) {
            data = QJsonArray{QJsonObject{{"provider", "openai"}, {"access", "remote_api"}, {"capabilities", QJsonArray{"generate_message"}}}};
        } else if (target.startsWith("/trpc/settings.providerCatalog")) {
            data = QJsonArray{QJsonObject{{"provider", "openai"}, {"configured", true}, {"name", "OpenAI"}}};
        } else if (target.startsWith("/trpc/models.llmByProvider")) {
            data = QJsonArray{QJsonObject{{"id", "gpt-5-mini"}, {"name", "gpt-5-mini"}, {"provider", "openai"}},
                              QJsonObject{{"id", "gpt-4.1-mini"}, {"name", "gpt-4.1-mini"}, {"provider", "openai"}}};
        } else if (target.startsWith("/trpc/models.recommended")) {
            data = QJsonArray{QJsonObject{{"id", "gpt-5-mini"}, {"provider", "openai"}}};
        } else if (target == "/api/assets" && bytes.startsWith("POST")) {
            ++uploads;
            const auto id = QString::number(uploads, 16).rightJustified(32, QLatin1Char('a'));
            const QJsonObject asset{{"id", id}, {"name", "reference.png"}, {"content_type", "image/png"}, {"user_id", "1"},
                                    {"get_url", "/api/content/" + id}};
            assets.insert(id, asset);
            send(socket, QJsonDocument(asset).toJson(QJsonDocument::Compact));
            return;
        } else if (target.startsWith("/trpc/assets.get")) {
            const auto input = QJsonDocument::fromJson(QUrlQuery(url).queryItemValue("input").toUtf8()).object();
            data = assets.value(input["id"].toString());
        }
        send(socket, QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", data}}}}).toJson(QJsonDocument::Compact));
    }

    static void send(QTcpSocket *socket, const QByteArray &body) {
        socket->write("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: "
                      + QByteArray::number(body.size()) + "\r\n\r\n" + body);
        socket->disconnectFromHost();
    }
};

// Web card heights of the fixture, read from the 1440x900 web capture at 71.3
// percent zoom. See the whole-window comparison in docs/parity.md.
const QHash<QString, int> webHeights{
    {"metadata", 72}, {"size", 94}, {"subject", 129}, {"reference", 120}, {"prompt", 168}, {"generate", 129},
    {"agent", 217}, {"resize", 212}, {"blur", 199}, {"image", 150}, {"caption", 300}, {"width", 300}};

QJsonObject property(const QString &name, const QString &type, QJsonObject extra = {}) {
    extra["name"] = name;
    auto declared = QJsonObject{{"type", type}, {"type_args", QJsonArray{}}};
    if (extra.contains("values")) {
        declared["values"] = extra["values"];
    }
    extra["type"] = declared;
    return extra;
}

QJsonObject slider(const QString &name, double minimum, double maximum, double fallback, const QString &type = QStringLiteral("float")) {
    return property(name, type, {{"min", minimum}, {"max", maximum}, {"default", fallback}});
}

QJsonObject color(const QString &name, const QString &hex) {
    return property(name, QStringLiteral("color"), {{"default", QJsonObject{{"type", "color"}, {"value", hex}}}});
}

QJsonObject image(const QString &name = QStringLiteral("image")) {
    return property(name, QStringLiteral("image"), {{"default", QJsonObject{{"type", "image"}, {"uri", ""}}}});
}

QJsonObject metadataFor(const QString &type, const QString &title, const QJsonArray &properties, const QString &output = QStringLiteral("image")) {
    return {{"node_type", type}, {"title", title}, {"namespace", type.section('.', 0, -2)}, {"properties", properties},
            {"outputs", QJsonArray{QJsonObject{{"name", "output"}, {"type", QJsonObject{{"type", output}, {"type_args", QJsonArray{}}}}}}},
            {"inline_fields", QJsonArray{}}, {"input_fields", QJsonArray{}}};
}

// Metadata for the part 2 bodies, with the property names their web bodies read.
QJsonArray partTwoMetadata() {
    const auto ranges = QJsonArray{"all", "reds", "oranges", "yellows", "greens", "cyans", "blues", "purples", "magentas"};
    return {
        metadataFor("lib.image.color.BrightnessContrast", "Brightness / Contrast",
                    {image(), image("mask"), slider("brightness", -1, 1, 0), slider("contrast", 0, 3, 1)}),
        metadataFor("lib.image.color_grading.SaturationVibrance", "Saturation Vibrance",
                    {image(), slider("saturation_and_vibrance_balance", -1, 1, 0), slider("levels", 2, 64, 8, "int")}),
        metadataFor("lib.image.filter.Invert", "Invert", {image()}),
        metadataFor("nodetool.image.Scale", "Scale", {image(), property("scale", "float", {{"default", 1}})}),
        metadataFor("lib.image.warp.Offset", "Offset", {image(), slider("dx", -1, 1, 0), slider("dy", -1, 1, 0), slider("wrap", 0, 2, 1, "int")}),
        metadataFor("lib.image.warp.Pad", "Pad", {image(), color("color", "#00000000"), slider("left", 0, 4, 0), slider("top", 0, 4, 0),
                                                  slider("right", 0, 4, 0), slider("bottom", 0, 4, 0)}),
        metadataFor("lib.image.effects.Outline", "Outline", {image(), color("color", "#000000"), slider("width", 0, 32, 2), slider("threshold", 0, 1, 0.5)}),
        metadataFor("lib.image.effects.DropShadow", "Drop Shadow", {image(), color("color", "#000000"), slider("offset_x", -0.5, 0.5, 0.02),
                                                                    slider("offset_y", -0.5, 0.5, 0.02), slider("blur_radius", 0, 40, 8), slider("intensity", 0, 4, 0.6)}),
        metadataFor("lib.image.effects.ColorOverlay", "Color Overlay", {image(), color("color", "#ff0000"), slider("amount", 0, 1, 0.5)}),
        metadataFor("lib.image.keyer.ChromaKey", "Chroma Key", {image(), color("key_color", "#00ff00"), slider("tolerance", 0, 1, 0.1),
                                                                slider("softness", 0, 1, 0.05), slider("spill", 0, 1, 0.5)}),
        metadataFor("nodetool.image.Channels", "Channels",
                    {image(), property("channel", "str", {{"values", QJsonArray{"red", "green", "blue", "alpha", "luminance"}}, {"default", "luminance"}})}),
        metadataFor("lib.image.Mask", "Mask", {image("image1"), image("image2"), image("mask")}),
        metadataFor("lib.image.color_grading.HSLAdjust", "HSL Adjust",
                    {image(), property("color_range", "str", {{"values", ranges}, {"default", "all"}}), slider("hue_shift", -1, 1, 0),
                     slider("saturation", -1, 1, 0), slider("luminance", -1, 1, 0)}),
        metadataFor("lib.image.draw.LinearGradient", "Linear Gradient",
                    {slider("width", 1, 4096, 512, "int"), slider("height", 1, 4096, 512, "int"), color("color_a", "#000000"),
                     color("color_b", "#ffffff"), slider("angle", 0, 360, 0), slider("midpoint", 0, 1, 0.5)}),
        metadataFor("nodetool.variable.SetVariable", "Set Variable",
                    {property("name", "str", {{"default", ""}}), property("value", "any")}, QStringLiteral("any")),
        metadataFor("nodetool.variable.GetVariable", "Get Variable",
                    {property("name", "str", {{"default", ""}}), property("trigger", "any")}, QStringLiteral("any")),
    };
}

QJsonObject partTwoNode(const QString &id, const QString &type, const QPointF &position, const QJsonObject &data = {}) {
    return {{"id", id}, {"type", type}, {"data", data},
            {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", position.x()}, {"y", position.y()}}}, {"selectable", true}}}};
}

// The fixture workflow with extra nodes placed below the parity cards.
QJsonObject withNodes(const QJsonArray &extra) {
    auto workflow = fixture()["workflow"].toObject();
    auto graph = workflow["graph"].toObject();
    auto nodes = graph["nodes"].toArray();
    for (const auto &node : extra) {
        nodes.append(node);
    }
    graph["nodes"] = nodes;
    workflow["graph"] = graph;
    return workflow;
}

QJsonArray allMetadata() {
    auto metadata = fixture()["metadata"].toArray();
    for (const auto &entry : partTwoMetadata()) {
        metadata.append(entry);
    }
    return metadata;
}
} // namespace

class CardBodiesTest final : public QObject {
    Q_OBJECT

    struct Host {
        EditorWindow window;
        QGraphicsView *view = nullptr;

        explicit Host(const QJsonObject &workflow = fixture()["workflow"].toObject(), const QJsonArray &catalog = fixture()["metadata"].toArray()) {
            window.setDarkTheme(true);
            window.resize(1440, 900);
            window.show();
            Q_ASSERT(QTest::qWaitForWindowExposed(&window));
            window.setCatalog(catalog);
            const auto loaded = window.document()->load(workflow);
            Q_ASSERT(loaded.ok);
            settle();
            window.fit();
            if (window.catalogVisible()) {
                window.action(QStringLiteral("Toggle nodes"));
            }
            settle();
            view = window.findChild<QGraphicsView *>();
            Q_ASSERT(view);
        }

        WorkflowGraphModel &model() { return static_cast<WorkflowGraphModel &>(window.scene()->graphModel()); }

        NodeId id(const QString &resource) {
            for (const auto node : model().allNodeIds()) {
                if (model().resourceId(node) == resource) {
                    return node;
                }
            }
            return QtNodes::InvalidNodeId;
        }

        const NodeRow *row(const QString &resource, NodeRowKind kind, const QString &name = {}) {
            for (const auto &candidate : model().layout(id(resource)).rows) {
                if (candidate.kind == kind && (name.isEmpty() || candidate.propertyName == name || candidate.action == name)) {
                    return &candidate;
                }
            }
            return nullptr;
        }

        // A card-local point in viewport coordinates.
        QPoint point(const QString &resource, const QPointF &local) {
            auto *item = window.scene()->nodeGraphicsObject(id(resource));
            return view->mapFromScene(item->mapToScene(local));
        }

        void click(const QString &resource, const QPointF &local) {
            QTest::mouseClick(view->viewport(), Qt::LeftButton, Qt::NoModifier, point(resource, local));
            settle();
        }

        QJsonObject data(const QString &resource) { return window.document()->node(resource)["data"].toObject(); }
        int undoCount() { return window.document()->undoStack()->count(); }

        QQuickWidget *overlay() {
            for (auto *widget : window.findChildren<QQuickWidget *>()) {
                if (widget->objectName() == QStringLiteral("inline-property-overlay") && widget->isVisible()) {
                    return widget;
                }
            }
            return nullptr;
        }

        QImage render(const QString &resource) {
            const auto size = model().layout(id(resource)).size;
            QImage card(size, QImage::Format_ARGB32_Premultiplied);
            card.fill(Qt::transparent);
            QPainter painter(&card);
            auto *item = window.scene()->nodeGraphicsObject(id(resource));
            // The device cache can key a new image to an old one at the same address.
            const auto cache = item->cacheMode();
            item->setCacheMode(QGraphicsItem::NoCache);
            window.scene()->render(&painter, QRectF(QPointF(), QSizeF(size)), QRectF(item->scenePos(), QSizeF(size)));
            item->setCacheMode(cache);
            return card;
        }

        // Removes a fixture connection through the canonical command, including hidden wires.
        bool removeFixtureWire(const QString &source, const QString &target, const QString &handle) {
            const auto out = id(source);
            const auto in = id(target);
            for (const auto connection : model().allConnectionIds(in)) {
                if (connection.outNodeId != out || model().edge(connection)["targetHandle"] != handle) {
                    continue;
                }
                const auto result = window.document()->applyCommand(QJsonObject{{"op", "removeEdge"},
                    {"id", model().edge(connection)["id"]}});
                settle();
                return result.ok;
            }
            return false;
        }
    };

    static void settle() {
        QTest::qWait(120);
        QCoreApplication::processEvents();
    }

    static QQuickItem *find(QQuickItem *item, const QString &name) {
        if (!item) {
            return nullptr;
        }
        if (item->objectName() == name && item->isVisible()) {
            return item;
        }
        for (auto *child : item->childItems()) {
            if (auto *found = find(child, name)) {
                return found;
            }
        }
        return nullptr;
    }

    static void type(QQuickWidget *widget, const QString &text) {
        for (const auto c : text) {
            QKeyEvent press(QEvent::KeyPress, 0, Qt::NoModifier, QString(c));
            QKeyEvent release(QEvent::KeyRelease, 0, Qt::NoModifier, QString(c));
            QApplication::sendEvent(widget->quickWindow(), &press);
            QApplication::sendEvent(widget->quickWindow(), &release);
        }
    }

private slots:
    void initTestCase() {
        QStandardPaths::setTestModeEnabled(true);
        QVERIFY(!fixture().isEmpty());
    }

    void remainingCardGeometry() {
        Host host;
        const auto &metadata = host.model().layout(host.id("metadata"));
        QCOMPARE(metadata.size.height(), 72);
        QCOMPARE(metadata.outputY, (QVector<double>{46, 74, 102, 130, 158}));
        const auto &geometry = host.window.scene()->nodeGeometry();
        QVERIFY(geometry.boundingRect(host.id("metadata")).bottom() >= 164);
        QCOMPARE(geometry.checkPortHit(host.id("metadata"), QtNodes::PortType::Out, QPointF(280, 158)), QtNodes::PortIndex(4));
        QCOMPARE(host.model().layout(host.id("size")).size.height(), 94);
        const auto *value = host.row("size", NodeRowKind::Field, "value");
        QVERIFY(value);
        QCOMPARE(value->fieldY, 55.0);
        QCOMPARE(value->height, 28.0);
        const auto *preview = host.row("agent", NodeRowKind::Preview);
        QVERIFY(preview);
        QCOMPARE(preview->y, 47.0);
    }

    void hiddenPortsHaveNoHitOrWireShape() {
        auto workflow = fixture()["workflow"].toObject();
        auto graph = workflow["graph"].toObject();
        auto authoredEdges = graph["edges"].toArray();
        auto opaque = authoredEdges[0].toObject();
        opaque["future_connection_metadata"] = QJsonObject{{"preserve", true}};
        authoredEdges[0] = opaque;
        graph["edges"] = authoredEdges;
        workflow["graph"] = graph;
        Host host(workflow);
        const auto before = host.window.document()->snapshot();
        const auto edges = host.window.document()->edges();
        int hidden = 0;
        int visible = 0;
        for (const auto node : host.model().allNodeIds()) {
            for (const auto edge : host.model().allConnectionIds(node)) {
                if (edge.inNodeId != node) { continue; }
                auto *wire = host.window.scene()->connectionGraphicsObject(edge);
                QVERIFY(wire);
                const auto name = host.model().edge(edge)["id"].toString();
                const bool expectedHidden = name == "e1" || name == "e3" || name == "e5";
                const auto &geometry = host.window.scene()->nodeGeometry();
                const auto endpoint = geometry.portPosition(node, QtNodes::PortType::In, edge.inPortIndex);
                if (expectedHidden) {
                    ++hidden;
                    QVERIFY(wire->shape().isEmpty());
                    QVERIFY(!wire->isVisible());
                    QCOMPARE(geometry.checkPortHit(node, QtNodes::PortType::In, endpoint), QtNodes::InvalidPortIndex);
                    const auto from = host.window.scene()->nodeGraphicsObject(edge.outNodeId)->mapToScene(
                        geometry.portPosition(edge.outNodeId, QtNodes::PortType::Out, edge.outPortIndex));
                    const auto to = host.window.scene()->nodeGraphicsObject(node)->mapToScene(endpoint);
                    const auto middle = wireCurve(from, to).pointAtPercent(0.5);
                    host.window.scene()->clearSelection();
                    QTest::mouseClick(host.view->viewport(), Qt::LeftButton, Qt::NoModifier, host.view->mapFromScene(middle));
                    QVERIFY(!wire->isSelected());
                } else {
                    ++visible;
                    QVERIFY(!wire->shape().isEmpty());
                    QVERIFY(wire->isVisible());
                    QCOMPARE(geometry.checkPortHit(node, QtNodes::PortType::In, endpoint), edge.inPortIndex);
                }
            }
        }
        QCOMPARE(hidden, 3);
        QCOMPARE(visible, 8);
        QCOMPARE(host.window.document()->snapshot(), before);
        // A normal edit, serialized save/reopen, and undo retain every canonical
        // edge including its opaque fields. No view-policy change enters undo.
        const auto undo = host.undoCount();
        QVERIFY(host.window.document()->applyCommand({{"op", "setProperty"}, {"id", "subject"},
            {"name", "value"}, {"value", "new subject"}}));
        QCOMPARE(host.undoCount(), undo + 1);
        node_editor::WorkflowDocument reopened;
        QVERIFY(reopened.loadJson(QJsonDocument(host.window.document()->snapshot()).toJson()));
        QCOMPARE(reopened.edges(), edges);
        host.window.document()->undo();
        QCOMPARE(host.window.document()->edges(), edges);
        QCOMPARE(host.window.document()->snapshot(), before);
        QCOMPARE(host.model().edgeSnapshot(), edges);
        QVERIFY(host.removeFixtureWire("subject", "prompt", "prompt"));
        host.window.document()->undo();
        settle();
        QCOMPARE(host.window.document()->edges(), edges);
        int restored = 0;
        for (const auto edge : host.model().allConnectionIds(host.id("prompt"))) {
            if (host.model().edge(edge)["id"] == "e1") {
                ++restored;
                QVERIFY(host.window.scene()->connectionGraphicsObject(edge)->shape().isEmpty());
                QVERIFY(!host.window.scene()->connectionGraphicsObject(edge)->isVisible());
            }
        }
        QCOMPARE(restored, 1);
    }

    void exposureTogglesWirePresentationWithoutChangingEdges() {
        Host host;
        const auto edges = host.window.document()->edges();
        const auto generate = host.id("generate");
        auto ui = host.model().uiProperties(generate);
        ui["exposed_inputs"] = QJsonArray{"width"};
        QVERIFY(host.window.document()->applyCommand({{"op", "setNodeField"}, {"id", "generate"},
            {"field", "ui_properties"}, {"value", ui}}));
        settle();
        int inspected = 0;
        for (const auto edge : host.model().allConnectionIds(generate)) {
            if (host.model().edge(edge)["id"] != "e3") { continue; }
            ++inspected;
            auto *wire = host.window.scene()->connectionGraphicsObject(edge);
            QVERIFY(wire->isVisible());
            QVERIFY(!wire->shape().isEmpty());
            wire->setSelected(true);
            QVERIFY(wire->isSelected());
        }
        QCOMPARE(inspected, 1);
        host.window.document()->undo();
        settle();
        for (const auto edge : host.model().allConnectionIds(generate)) {
            if (host.model().edge(edge)["id"] != "e3") { continue; }
            auto *wire = host.window.scene()->connectionGraphicsObject(edge);
            QVERIFY(!wire->isVisible());
            QVERIFY(!wire->isSelected());
            QVERIFY(wire->shape().isEmpty());
        }
        QCOMPARE(host.window.document()->edges(), edges);
    }

    void ownHandlesKeepControlPortsAndSuppressOutputOnlyBodyPorts() {
        auto workflow = fixture()["workflow"].toObject();
        auto graph = workflow["graph"].toObject();
        auto edges = graph["edges"].toArray();
        edges.append(QJsonObject{{"id", "control"}, {"source", "agent"}, {"sourceHandle", "__control__"},
            {"target", "prompt"}, {"targetHandle", "__control__"}});
        edges.append(QJsonObject{{"id", "output-body"}, {"source", "image"}, {"sourceHandle", "legacy-output"},
            {"target", "caption"}, {"targetHandle", "value"}});
        graph["edges"] = edges;
        workflow["graph"] = graph;
        WorkflowGraphModel model;
        EditorScene scene(model);
        model.project(workflow, fixture()["metadata"].toArray());
        int inspected = 0;
        for (const auto node : model.allNodeIds()) {
            for (const auto edge : model.allConnectionIds(node)) {
                if (edge.inNodeId != node) { continue; }
                const auto name = model.edge(edge)["id"].toString();
                if (name == "control") {
                    ++inspected;
                    QVERIFY(model.portVisible(edge.outNodeId, QtNodes::PortType::Out, edge.outPortIndex));
                    QVERIFY(model.portVisible(node, QtNodes::PortType::In, edge.inPortIndex));
                    QVERIFY(scene.connectionGraphicsObject(edge)->isVisible());
                } else if (name == "output-body") {
                    ++inspected;
                    QVERIFY(!model.portVisible(edge.outNodeId, QtNodes::PortType::Out, edge.outPortIndex));
                    QVERIFY(!scene.connectionGraphicsObject(edge)->isVisible());
                    QVERIFY(scene.connectionGraphicsObject(edge)->shape().isEmpty());
                }
            }
        }
        QCOMPARE(inspected, 2);
        QCOMPARE(model.edgeSnapshot(), edges);
    }

    void authoredCardSizesAndIntegerEditor() {
        auto workflow = fixture()["workflow"].toObject();
        auto graph = workflow["graph"].toObject();
        auto nodes = graph["nodes"].toArray();
        for (int i = 0; i < nodes.size(); ++i) {
            auto node = nodes[i].toObject();
            if (node["id"] != "metadata" && node["id"] != "size") { continue; }
            auto ui = node["ui_properties"].toObject();
            ui["width"] = 340;
            ui["height"] = 180;
            node["ui_properties"] = ui;
            nodes[i] = node;
        }
        graph["nodes"] = nodes;
        workflow["graph"] = graph;
        Host host(workflow);
        QCOMPARE(host.model().layout(host.id("metadata")).size, QSize(340, 180));
        QCOMPARE(host.model().layout(host.id("size")).size, QSize(340, 180));
        const auto rect = host.model().inlineFieldRect(host.id("size"), "value");
        QCOMPARE(rect.y(), 55.0);
        host.click("size", rect.center());
        QVERIFY(host.overlay());
        QVERIFY(!host.model().inlineDescriptor(host.id("size"), "value").isEmpty());
    }

    void canvasResultBoundsMatchPainterGeometry() {
        auto workflow = fixture()["workflow"].toObject();
        auto graph = workflow["graph"].toObject();
        auto nodes = graph["nodes"].toArray();
        for (int i = 0; i < nodes.size(); ++i) {
            auto node = nodes[i].toObject();
            if (node["id"] != "subject" && node["id"] != "resize") { continue; }
            auto ui = node["ui_properties"].toObject();
            ui["width"] = 360;
            ui["height"] = 420;
            node["ui_properties"] = ui;
            nodes[i] = node;
        }
        graph["nodes"] = nodes;
        workflow["graph"] = graph;
        WorkflowGraphModel model;
        model.project(workflow, fixture()["metadata"].toArray());
        const auto id = [&model](const QString &resource) {
            for (const auto node : model.allNodeIds()) {
                if (model.resourceId(node) == resource) { return node; }
            }
            return QtNodes::InvalidNodeId;
        };
        node_editor::NodeRuntimeModel runtime;
        model.setRuntimeModel(&runtime);
        runtime.beginRun("bounds");
        QImage image(100, 100, QImage::Format_ARGB32_Premultiplied);
        image.fill(Qt::red);
        model.setRuntimePreview("subject", image);
        runtime.ingest("bounds", {{"type", "node_update"}, {"job_id", "bounds"}, {"node_id", "subject"}, {"status", "running"}});
        QCOMPARE(model.runtimeState(id("subject"))["status"].toString(), QStringLiteral("running"));
        // Authored 360×420 generic card, 72-pixel result band above 18-pixel footer.
        QCOMPARE(model.canvasResultRect(id("subject")), QRectF(9, 322, 342, 72));
        // ResizeImageBody.tsx's .preview-area is flex 1 1 auto with minHeight 96, so
        // an authored 420 px card grows the preview by 420 - 213 and keeps the controls below.
        QCOMPARE(model.canvasResultRect(id("resize")), QRectF(19, 43, 322, 96 + 207 - 16));
        QCOMPARE(model.canvasResultRect(id("image")), QRectF(17, 45, 246, 64));
        QCOMPARE(model.canvasResultRect(id("caption")), QRectF(17, 45, 366, 238));
        runtime.ingest("bounds", {{"type", "node_progress"}, {"job_id", "bounds"}, {"node_id", "subject"},
            {"progress", 3}, {"total", 10}});
        QVERIFY(model.layout(id("subject")).progressBand);
        QCOMPARE(model.canvasResultRect(id("subject")), QRectF(9, 275, 342, 72));
        model.setCanvasMediaNodes({"subject"});
        QCOMPARE(model.canvasResultRect(id("subject")), model.canvasPlaybackRect(id("subject")));
        QCOMPARE(model.canvasResultRect(id("subject")), QRectF(9, 222, 342, 180));
        auto subject = model.nodeSnapshot(id("subject"));
        auto ui = subject["ui_properties"].toObject();
        ui["bypassed"] = true;
        subject["ui_properties"] = ui;
        for (int i = 0; i < nodes.size(); ++i) { if (nodes[i].toObject()["id"] == "subject") { nodes[i] = subject; } }
        graph["nodes"] = nodes;
        workflow["graph"] = graph;
        model.project(workflow, fixture()["metadata"].toArray());
        QVERIFY(model.bypassed(id("subject")));
        QVERIFY(!model.canvasResultRect(id("subject")).isEmpty());
        ui["collapsed"] = true;
        subject["ui_properties"] = ui;
        for (int i = 0; i < nodes.size(); ++i) { if (nodes[i].toObject()["id"] == "subject") { nodes[i] = subject; } }
        graph["nodes"] = nodes;
        workflow["graph"] = graph;
        model.project(workflow, fixture()["metadata"].toArray());
        QVERIFY(model.canvasResultRect(id("subject")).isEmpty());
        QVERIFY(model.canvasResultRect(QtNodes::InvalidNodeId).isEmpty());
    }

    void cardHeightsMatchWebCapture() {
        Host host;
        for (auto it = webHeights.cbegin(); it != webHeights.cend(); ++it) {
            const auto height = host.model().layout(host.id(it.key())).size.height();
            QVERIFY2(std::abs(height - it.value()) <= 2,
                     qPrintable(QStringLiteral("%1 is %2 tall, web %3").arg(it.key()).arg(height).arg(it.value())));
        }
        QCOMPARE(host.model().layout(host.id("caption")).size.width(), 400);
        QCOMPARE(host.model().layout(host.id("prompt")).body, CardBody::Prompt);
        QCOMPARE(host.model().layout(host.id("image")).body, CardBody::Output);
        QCOMPARE(host.model().layout(host.id("blur")).body, CardBody::Blur);
        QCOMPARE(host.model().layout(host.id("resize")).body, CardBody::ResizeImage);
        // W3: Fake Generate Image declares no inline_fields, so Width and Height stay off the card.
        for (const auto &row : host.model().layout(host.id("generate")).rows) {
            QVERIFY(row.propertyName != QStringLiteral("height"));
        }
        // Header icons follow the web's IconForType mapping. No fixture type falls back to a question mark.
        const QHash<QString, QString> icons{{"subject", "str"}, {"size", "int"}, {"reference", "image"}, {"prompt", "str"},
                                            {"image", "str"}, {"caption", "preview"}, {"agent", "str"}, {"resize", "image"}};
        for (auto it = icons.cbegin(); it != icons.cend(); ++it) {
            QCOMPARE(host.model().layout(host.id(it.key())).typeIcon, it.value());
            QVERIFY(!webTypeIconSvg(it.value(), Qt::white).isEmpty());
        }
        for (const auto id : host.model().allNodeIds()) {
            QVERIFY(host.model().layout(id).icon != QStringLiteral("help"));
        }
    }

    void promptEditKeepsVariableChip() {
        Host host;
        // The hidden fixture connection locks the prompt. Remove it before testing editing.
        QVERIFY(host.removeFixtureWire("subject", "prompt", "prompt"));
        QVERIFY(host.window.document()->graph()["edges"].toArray().size() == 10);
        const auto *composer = host.row("prompt", NodeRowKind::Composer);
        QVERIFY(composer);
        QVERIFY(promptVariables(composer->value).contains(QStringLiteral("subject")));
        const auto before = host.undoCount();
        host.click("prompt", composer->rect.center());
        auto *overlay = host.overlay();
        QVERIFY(overlay);
        QTRY_VERIFY(find(overlay->rootObject(), QStringLiteral("inline-multiline")));
        QTest::keyClick(overlay->quickWindow(), Qt::Key_A, Qt::ControlModifier);
        type(overlay, QStringLiteral("Paint {{ subject }} at noon"));
        // A click on empty canvas commits the draft.
        QTest::mouseClick(host.view->viewport(), Qt::LeftButton, Qt::NoModifier, QPoint(20, host.view->viewport()->height() - 20));
        settle();
        QTRY_COMPARE(host.data("prompt")["prompt"].toString(), QStringLiteral("Paint {{ subject }} at noon"));
        QCOMPARE(host.undoCount(), before + 1);
        composer = host.row("prompt", NodeRowKind::Composer);
        QVERIFY(composer);
        QCOMPARE(promptVariables(composer->value), QStringList{QStringLiteral("subject")});
        // The unknown variable chip draws in the warning color inside the composer.
        const auto card = host.render("prompt");
        const auto warning = host.window.scene()->theme().warning;
        bool chip = false;
        for (int y = int(composer->rect.top()); y < int(composer->rect.bottom()) && !chip; ++y) {
            for (int x = int(composer->rect.left()); x < int(composer->rect.right()) && !chip; ++x) {
                // The chip's 1 px border blends with the field, so compare hue and saturation.
                const auto pixel = card.pixelColor(x, y);
                chip = pixel.hsvSaturation() > 100 && std::abs(pixel.hsvHue() - warning.hsvHue()) <= 12;
            }
        }
        if (!chip) {
            card.save(QDir::temp().filePath(QStringLiteral("card-bodies-prompt.png")));
        }
        QVERIFY(chip);
        host.window.document()->undo();
        QCOMPARE(host.data("prompt")["prompt"].toString(), QStringLiteral("Paint {{ subject }} in warm light"));
    }

    void addVariableAddsDynamicInput() {
        Host host;
        const auto before = host.model().layout(host.id("prompt")).size.height();
        const auto *add = host.row("prompt", NodeRowKind::Action, "addVariable");
        QVERIFY(add);
        QCOMPARE(add->label, QStringLiteral("Add another variable"));
        const auto undo = host.undoCount();
        host.click("prompt", add->rect.center());
        QTRY_VERIFY(host.window.document()->node("prompt")["dynamic_properties"].toObject().contains("var_1"));
        QCOMPARE(host.undoCount(), undo + 1);
        // The new handle row, plus a second bar line: the web bar wraps
        // (PromptComposerBody.tsx .variable-bar flexWrap), and the Add button no
        // longer fits beside the Variables label and the {{ var_1 }} chip.
        QCOMPARE(host.model().layout(host.id("prompt")).size.height(),
                 before + node_metrics::handleRowStep + node_metrics::actionHeight + node_metrics::micro);
        bool handle = false;
        for (const auto &row : host.model().layout(host.id("prompt")).rows) {
            handle = handle || (row.kind == NodeRowKind::Handle && row.label == QStringLiteral("var_1"));
        }
        QVERIFY(handle);
        QVERIFY(host.row("prompt", NodeRowKind::Action, "insertVariable"));
        host.window.document()->undo();
        QVERIFY(!host.window.document()->node("prompt")["dynamic_properties"].toObject().contains("var_1"));
    }

    void blurTypeSelectAndSizeSlider() {
        Host host;
        const auto *select = host.row("blur", NodeRowKind::Field, "blur_type");
        QVERIFY(select);
        QCOMPARE(select->value, QStringLiteral("Gaussian"));
        const auto undo = host.undoCount();
        host.click("blur", select->rect.center());
        auto *overlay = host.overlay();
        QVERIFY(overlay);
        QTRY_VERIFY(find(overlay->rootObject(), QStringLiteral("inline-choice")));
        QTest::keyClick(overlay, Qt::Key_Down);
        QTest::keyClick(overlay, Qt::Key_Return);
        QTRY_COMPARE(host.data("blur")["blur_type"].toString(), QStringLiteral("box"));
        QCOMPARE(host.undoCount(), undo + 1);
        // A drag on the slider commits once, on release.
        const auto *slider = host.row("blur", NodeRowKind::Slider, "size");
        QVERIFY(slider);
        QCOMPARE(slider->number, 2.0);
        const auto track = sliderTrack(*slider);
        const auto start = host.point("blur", QPointF(track.left() + track.width() * 0.2, track.center().y()));
        const auto end = host.point("blur", QPointF(track.left() + track.width() * 0.5, track.center().y()));
        QTest::mousePress(host.view->viewport(), Qt::LeftButton, Qt::NoModifier, start);
        QMouseEvent move(QEvent::MouseMove, QPointF(end), QPointF(host.view->viewport()->mapToGlobal(end)), Qt::NoButton, Qt::LeftButton, Qt::NoModifier);
        QApplication::sendEvent(host.view->viewport(), &move);
        QCOMPARE(host.window.scene()->sliderDraftProperty(), QStringLiteral("size"));
        QCOMPARE(host.undoCount(), undo + 1);
        QTest::mouseRelease(host.view->viewport(), Qt::LeftButton, Qt::NoModifier, end);
        settle();
        QVERIFY2(std::abs(host.data("blur")["size"].toDouble() - 50) <= 1, qPrintable(QString::number(host.data("blur")["size"].toDouble())));
        QCOMPARE(host.undoCount(), undo + 2);
        host.window.document()->undo();
        QCOMPARE(host.data("blur")["size"].toDouble(), 2.0);
    }

    void resizeModeSwitchAndLinkedDimensions() {
        Host host;
        const auto *modes = host.row("resize", NodeRowKind::Segmented, "mode");
        QVERIFY(modes);
        QCOMPARE(modes->selected, 1);
        QCOMPARE(modes->parts.size(), 3);
        const auto dimensionsHeight = host.model().layout(host.id("resize")).size.height();
        host.click("resize", modes->parts[0].center());
        QTRY_COMPARE(host.data("resize")["mode"].toString(), QStringLiteral("scale"));
        QVERIFY(host.row("resize", NodeRowKind::Slider, "scale"));
        QVERIFY(!host.row("resize", NodeRowKind::Lock));
        QVERIFY(host.model().layout(host.id("resize")).size.height() < dimensionsHeight);
        modes = host.row("resize", NodeRowKind::Segmented, "mode");
        host.click("resize", modes->parts[1].center());
        QTRY_COMPARE(host.data("resize")["mode"].toString(), QStringLiteral("dimensions"));
        QCOMPARE(host.model().layout(host.id("resize")).size.height(), dimensionsHeight);
        // The fixture connects size to the width. Removing that wire makes both sides editable.
        QVERIFY(host.removeFixtureWire("size", "resize", "width"));
        const auto *lock = host.row("resize", NodeRowKind::Lock);
        QVERIFY(lock);
        QVERIFY(!lock->checked);
        host.click("resize", lock->rect.center());
        QVERIFY(host.model().dimensionsLinked(host.id("resize")));
        QCOMPARE(host.row("resize", NodeRowKind::Lock)->icon, QStringLiteral("link"));
        const auto undo = host.undoCount();
        const auto *width = host.row("resize", NodeRowKind::Field, "width");
        QVERIFY(width);
        host.click("resize", width->rect.center());
        auto *overlay = host.overlay();
        QVERIFY(overlay);
        QTRY_VERIFY(find(overlay->rootObject(), QStringLiteral("inline-number")));
        QTest::keyClick(overlay->quickWindow(), Qt::Key_A, Qt::ControlModifier);
        type(overlay, QStringLiteral("1024"));
        QTest::keyClick(overlay->quickWindow(), Qt::Key_Return);
        settle();
        QTRY_COMPARE(host.data("resize")["width"].toDouble(), 1024.0);
        QCOMPARE(host.data("resize")["height"].toDouble(), 1024.0);
        QCOMPARE(host.undoCount(), undo + 1);
        host.window.document()->undo();
        QVERIFY(!host.data("resize").contains("width"));
        QVERIFY(!host.data("resize").contains("height"));
        // An open lock writes one side.
        host.click("resize", host.row("resize", NodeRowKind::Lock)->rect.center());
        QVERIFY(!host.model().dimensionsLinked(host.id("resize")));
    }

    void variableChipInsertsAtCaretAndKeepsDraft() {
        Host host;
        QVERIFY(host.removeFixtureWire("subject", "prompt", "prompt"));
        QVERIFY(host.window.document()->applyCommand({{"op", "addDynamicInput"}, {"id", "prompt"}, {"name", "subject"}}).ok);
        const auto *composer = host.row("prompt", NodeRowKind::Composer);
        host.click("prompt", composer->rect.center());
        auto *overlay = host.overlay();
        QVERIFY(overlay);
        QQuickItem *field = nullptr;
        QTRY_VERIFY((field = find(overlay->rootObject(), QStringLiteral("inline-multiline"))) != nullptr);
        const auto before = host.data("prompt")["prompt"].toString();
        const auto undo = host.undoCount();
        field->setProperty("cursorPosition", 6);
        const auto *chip = host.row("prompt", NodeRowKind::Action, "insertVariable");
        QVERIFY(chip);
        host.click("prompt", chip->rect.center());
        QCOMPARE(field->property("text").toString(), QString(before).insert(6, QStringLiteral("{{ subject }}")));
        QCOMPARE(host.data("prompt")["prompt"].toString(), before);
        QCOMPARE(host.undoCount(), undo);
        QTest::keyClick(overlay->quickWindow(), Qt::Key_Escape);
        settle();
        QCOMPARE(host.data("prompt")["prompt"].toString(), before);
        QCOMPARE(host.undoCount(), undo);
        host.click("prompt", host.row("prompt", NodeRowKind::Composer)->rect.center());
        overlay = host.overlay();
        QVERIFY(overlay);
        QTRY_VERIFY((field = find(overlay->rootObject(), QStringLiteral("inline-multiline"))) != nullptr);
        field->setProperty("cursorPosition", 6);
        host.click("prompt", host.row("prompt", NodeRowKind::Action, "insertVariable")->rect.center());
        QTest::mouseClick(host.view->viewport(), Qt::LeftButton, Qt::NoModifier, QPoint(20, host.view->viewport()->height() - 20));
        QTRY_COMPARE(host.data("prompt")["prompt"].toString(), QString(before).insert(6, QStringLiteral("{{ subject }}")));
        QCOMPARE(host.undoCount(), undo + 1);
        host.window.document()->undo();
        QCOMPARE(host.data("prompt")["prompt"].toString(), before);
    }

    void fitPresetsSetBothDimensionsAndUndoOnce() {
        Host host;
        QVERIFY(host.removeFixtureWire("size", "resize", "width"));
        const auto *modes = host.row("resize", NodeRowKind::Segmented, "mode");
        host.click("resize", modes->parts[2].center());
        QTRY_COMPARE(host.data("resize")["mode"].toString(), QStringLiteral("fit"));
        const auto before = host.data("resize");
        const auto undo = host.undoCount();
        QVector<NodeRow> presets;
        for (const auto &row : host.model().layout(host.id("resize")).rows) {
            if (row.action == QStringLiteral("resizePreset")) {
                presets.append(row);
            }
        }
        QCOMPARE(presets.size(), 4);
        QCOMPARE(presets.last().number, 1024.0);
        QVERIFY(presets.last().rect.right() < host.model().layout(host.id("resize")).size.width());
        host.click("resize", presets.last().rect.center());
        QTRY_COMPARE(host.data("resize")["width"].toDouble(), 1024.0);
        QCOMPARE(host.data("resize")["height"].toDouble(), 1024.0);
        QCOMPARE(host.undoCount(), undo + 1);
        host.window.document()->undo();
        QCOMPARE(host.data("resize"), before);
    }

    void fitPresetKeepsConnectedDimensionsAtomic() {
        Host host;
        const auto *modes = host.row("resize", NodeRowKind::Segmented, "mode");
        host.click("resize", modes->parts[2].center());
        const auto before = host.data("resize");
        const auto undo = host.undoCount();
        const auto *preset = host.row("resize", NodeRowKind::Action, "resizePreset");
        QVERIFY(preset);
        host.click("resize", preset->rect.center());
        QCOMPARE(host.data("resize"), before);
        QCOMPARE(host.undoCount(), undo);
    }

    void promptMentionsPreserveUrisAndPunctuation() {
        const auto tokens = promptTokens(QStringLiteral("Use asset://abc123.png... with entity://person-1. {{ name|upper }}"));
        QCOMPARE(tokens.size(), 6);
        QCOMPARE(tokens[1].text, QStringLiteral("asset://abc123.png"));
        QCOMPARE(tokens[1].mentionScheme, QStringLiteral("asset"));
        QCOMPARE(tokens[2].text, QStringLiteral("... with "));
        QCOMPARE(tokens[3].text, QStringLiteral("entity://person-1"));
        QCOMPARE(tokens[3].mentionScheme, QStringLiteral("entity"));
        QCOMPARE(tokens[4].text, QStringLiteral(". "));
        QVERIFY(tokens[5].variable);
        QCOMPARE(promptVariables(QStringLiteral("asset://abc.png {{ name|upper }} entity://person-1")), QStringList{QStringLiteral("name|upper")});
    }

    void agentModelChipUsesSharedPicker() {
        Server server;
        Host host;
        emit host.window.session()->credentialsChanged(server.url(), QStringLiteral("card-token"), QStringLiteral("1"));
        QTRY_COMPARE(host.data("agent")["model"].toObject()["id"].toString(), QStringLiteral("gpt-5-mini"));
        const auto seeded = host.data("agent").value("model");
        const auto undo = host.undoCount();
        const auto *chip = host.row("agent", NodeRowKind::ModelChip, "model");
        QVERIFY(chip);
        QVERIFY(!chip->placeholder);
        QCOMPARE(chip->value, QStringLiteral("gpt-5-mini"));
        QVERIFY(chip->bare);
        host.click("agent", chip->rect.center());
        auto *overlay = host.overlay();
        QVERIFY(overlay);
        QTRY_VERIFY(find(overlay->rootObject(), QStringLiteral("inline-model")));
        QQuickItem *choice = nullptr;
        // The picker is a popup, so it lives in the window's overlay layer.
        QTRY_VERIFY_WITH_TIMEOUT((choice = find(overlay->quickWindow()->contentItem(), QStringLiteral("choose_openai_gpt-4.1-mini"))) != nullptr, 10000);
        QTest::mouseClick(overlay->quickWindow(), Qt::LeftButton, Qt::NoModifier,
                          choice->mapToScene(QPointF(choice->width() / 2, choice->height() / 2)).toPoint());
        QTRY_COMPARE(host.data("agent")["model"].toObject()["id"].toString(), QStringLiteral("gpt-4.1-mini"));
        QCOMPARE(host.data("agent")["model"].toObject()["provider"].toString(), QStringLiteral("openai"));
        QCOMPARE(host.data("agent")["system"].toString(), QStringLiteral("You write short captions."));
        chip = host.row("agent", NodeRowKind::ModelChip, "model");
        // The chip shows the selected model name and provider display name.
        QCOMPARE(chip->value, QStringLiteral("gpt-4.1-mini"));
        QCOMPARE(chip->typeName, QStringLiteral("OpenAI"));
        QVERIFY(!chip->placeholder);
        QCOMPARE(host.undoCount(), undo + 1);
        host.window.document()->undo();
        QCOMPARE(host.data("agent")["model"], seeded);
    }

    void agentAddOutputOpensOutputForm() {
        Host host;
        const auto outputs = host.model().layout(host.id("agent")).outputY.size();
        const auto *add = host.row("agent", NodeRowKind::Action, "addOutput");
        QVERIFY(add);
        host.click("agent", add->rect.center());
        QWidget *form = nullptr;
        QTRY_VERIFY((form = host.window.findChild<QWidget *>(QStringLiteral("subgraph-output-form"))) != nullptr);
        QQuickWidget *quick = form->findChild<QQuickWidget *>();
        QVERIFY(quick);
        QQuickItem *name = nullptr;
        QTRY_VERIFY((name = find(quick->rootObject(), QStringLiteral("new-output-name"))) != nullptr);
        QTest::mouseClick(quick->quickWindow(), Qt::LeftButton, Qt::NoModifier, name->mapToScene(QPointF(name->width() / 2, name->height() / 2)).toPoint());
        QTest::keyClicks(quick, QStringLiteral("summary"));
        auto *button = find(quick->rootObject(), QStringLiteral("add-output"));
        QVERIFY(button);
        QTest::mouseClick(quick->quickWindow(), Qt::LeftButton, Qt::NoModifier, button->mapToScene(QPointF(button->width() / 2, button->height() / 2)).toPoint());
        QTRY_VERIFY(host.window.document()->node("agent")["dynamic_outputs"].toObject().contains("summary"));
        form->close();
        settle();
        QCOMPARE(host.model().layout(host.id("agent")).outputY.size(), outputs + 1);
    }

    void imageInputDropZoneSetsValue() {
        Server server;
        auto workflow = fixture()["workflow"].toObject();
        auto graph = workflow["graph"].toObject();
        auto nodes = graph["nodes"].toArray();
        for (int i = 0; i < nodes.size(); ++i) {
            auto node = nodes[i].toObject();
            if (node["id"] == "reference") {
                node["future_field"] = 42;
                nodes[i] = node;
            }
        }
        graph["nodes"] = nodes;
        workflow["graph"] = graph;
        Host host(workflow);
        emit host.window.session()->credentialsChanged(server.url(), QStringLiteral("card-token"), QStringLiteral("1"));
        settle();
        const auto *zone = host.row("reference", NodeRowKind::DropZone, "value");
        QVERIFY(zone);
        QCOMPARE(zone->value, QStringLiteral("CLICK OR DROP IMAGE"));
        QTemporaryDir directory;
        QImage image(12, 12, QImage::Format_RGB32);
        image.fill(Qt::blue);
        const auto path = directory.filePath(QStringLiteral("reference.png"));
        QVERIFY(image.save(path));
        QMimeData mime;
        mime.setUrls({QUrl::fromLocalFile(path)});
        const QPointF position(host.point("reference", zone->rect.center()));
        QDragEnterEvent enter(position, Qt::CopyAction, &mime, Qt::LeftButton, Qt::NoModifier);
        QApplication::sendEvent(host.view->viewport(), &enter);
        QVERIFY(enter.isAccepted());
        QDragMoveEvent move(position, Qt::CopyAction, &mime, Qt::LeftButton, Qt::NoModifier);
        QApplication::sendEvent(host.view->viewport(), &move);
        QDropEvent drop(position, Qt::CopyAction, &mime, Qt::LeftButton, Qt::NoModifier);
        QApplication::sendEvent(host.view->viewport(), &drop);
        QVERIFY(drop.isAccepted());
        QTRY_VERIFY_WITH_TIMEOUT(!host.data("reference")["value"].toObject()["asset_id"].toString().isEmpty(), 10000);
        const auto value = host.data("reference")["value"].toObject();
        QCOMPARE(value["type"].toString(), QStringLiteral("image"));
        QVERIFY(value["uri"].toString().startsWith(QStringLiteral("asset://")));
        QCOMPARE(server.uploads, 1);
        // The drop sets the property on the existing card and keeps unknown fields.
        QCOMPARE(host.window.document()->graph()["nodes"].toArray().size(), 12);
        QCOMPARE(host.window.document()->node("reference")["future_field"].toInt(), 42);
        QCOMPARE(host.data("reference")["name"].toString(), QStringLiteral("reference"));
        QVERIFY(!host.row("reference", NodeRowKind::DropZone, "value")->placeholder);
    }

    // Writes every part 2 card in both themes for visual review, kept outside the repository.
    void capturePartTwoCards() {
        const auto directory = qEnvironmentVariable("NODETOOL_CARD_BODY_CAPTURE_DIR");
        if (directory.isEmpty()) {
            QSKIP("Set NODETOOL_CARD_BODY_CAPTURE_DIR to write card captures.");
        }
        const QStringList types{"lib.image.color.BrightnessContrast", "lib.image.color_grading.SaturationVibrance", "lib.image.filter.Invert",
                                "nodetool.image.Scale", "lib.image.warp.Offset", "lib.image.warp.Pad", "lib.image.effects.Outline",
                                "lib.image.effects.DropShadow", "lib.image.effects.ColorOverlay", "lib.image.keyer.ChromaKey",
                                "nodetool.image.Channels", "lib.image.Mask", "lib.image.color_grading.HSLAdjust",
                                "lib.image.draw.LinearGradient", "nodetool.variable.GetVariable", "nodetool.variable.SetVariable"};
        QJsonArray nodes;
        for (int i = 0; i < types.size(); ++i) {
            nodes.append(partTwoNode(QStringLiteral("c%1").arg(i), types[i], QPointF(320 * (i % 6), 700 + 520 * (i / 6)),
                                     types[i].endsWith("SetVariable") ? QJsonObject{{"name", "mood"}} : QJsonObject{}));
        }
        Host host(withNodes(nodes), allMetadata());
        QDir().mkpath(directory);
        for (const auto dark : {true, false}) {
            host.window.setDarkTheme(dark);
            settle();
            const auto theme = dark ? QStringLiteral("dark") : QStringLiteral("light");
            for (int i = 0; i < types.size(); ++i) {
                QVERIFY(host.render(QStringLiteral("c%1").arg(i)).save(QStringLiteral("%1/%2-%3.png").arg(directory, types[i].section('.', -1), theme)));
            }
            for (const auto *resource : {"prompt", "blur", "resize"}) {
                QVERIFY(host.render(QString::fromLatin1(resource)).save(QStringLiteral("%1/fixture-%2-%3.png").arg(directory, QString::fromLatin1(resource), theme)));
            }
        }
    }

    // ImageInput's drop zone opens a file picker on click, as the web's dropzone input.
    void dropZoneClickOpensFilePicker() {
        Server server;
        Host host;
        emit host.window.session()->credentialsChanged(server.url(), QStringLiteral("card-token"), QStringLiteral("1"));
        settle();
        auto *drops = host.window.findChild<CanvasDropController *>();
        QVERIFY(drops);
        QTemporaryDir directory;
        QImage image(12, 12, QImage::Format_RGB32);
        image.fill(Qt::green);
        const auto path = directory.filePath(QStringLiteral("picked.png"));
        QVERIFY(image.save(path));
        QStringList asked;
        QString answer;
        drops->chooseFile = [&](const QString &kind) {
            asked.append(kind);
            return answer;
        };
        const auto *zone = host.row("reference", NodeRowKind::DropZone, "value");
        QVERIFY(zone);
        const auto before = host.window.document()->snapshot();
        // A cancelled picker changes nothing.
        host.click("reference", zone->rect.center());
        QTRY_COMPARE(asked, QStringList{QStringLiteral("image")});
        settle();
        QCOMPARE(host.window.document()->snapshot(), before);
        QCOMPARE(server.uploads, 0);
        answer = path;
        host.click("reference", host.row("reference", NodeRowKind::DropZone, "value")->rect.center());
        QTRY_VERIFY_WITH_TIMEOUT(!host.data("reference")["value"].toObject()["asset_id"].toString().isEmpty(), 10000);
        QCOMPARE(asked.size(), 2);
        QCOMPARE(server.uploads, 1);
        QCOMPARE(host.window.document()->graph()["nodes"].toArray().size(), 12);
        // A click elsewhere on the card opens nothing.
        host.click("reference", QPointF(140, 20));
        settle();
        QCOMPARE(asked.size(), 2);
    }

    // Part 2 bodies. Heights come from each body's CSS in
    // web/src/components/node_types/editing: a 96 px preview-area, 2 px block
    // gaps, the controls grid, and 13 px below it. See docs/parity.md.
    void partTwoBodiesMatchWebHeights() {
        struct Case {
            QString type;
            CardBody body;
            int height;
            int sliders;
            int swatches;
            QStringList toggle;
        };
        const QVector<Case> cases{
            {"lib.image.color.BrightnessContrast", CardBody::Adjustment, 206, 2, 0, {}},
            {"lib.image.filter.Invert", CardBody::SimpleFilter, 170, 0, 0, {"Before", "After"}},
            {"nodetool.image.Scale", CardBody::Scale, 170, 1, 0, {}},
            {"lib.image.warp.Offset", CardBody::Offset, 228, 2, 0, {"Clamp", "Repeat", "Mirror"}},
            {"lib.image.warp.Pad", CardBody::Pad, 274, 4, 1, {}},
            {"lib.image.effects.Outline", CardBody::Outline, 226, 2, 1, {}},
            {"lib.image.effects.DropShadow", CardBody::DropShadow, 278, 4, 1, {}},
            {"lib.image.effects.ColorOverlay", CardBody::ColorOverlay, 200, 1, 1, {}},
            {"lib.image.keyer.ChromaKey", CardBody::ChromaKey, 248, 3, 1, {}},
            {"nodetool.image.Channels", CardBody::Channels, 172, 0, 0, {"R", "G", "B", "A", "L"}},
            {"lib.image.Mask", CardBody::Mask, 170, 0, 0, {"Img 1", "Img 2", "Mask", "Result"}},
            {"lib.image.color_grading.HSLAdjust", CardBody::HslAdjust, 240, 3, 0, {}},
            {"lib.image.draw.LinearGradient", CardBody::Generator, 460, 4, 2, {}},
        };
        QJsonArray nodes;
        for (int i = 0; i < cases.size(); ++i) {
            nodes.append(partTwoNode(QStringLiteral("n%1").arg(i), cases[i].type, QPointF(320 * i, 900)));
        }
        WorkflowGraphModel model;
        model.project(withNodes(nodes), allMetadata());
        const auto id = [&model](const QString &resource) {
            for (const auto node : model.allNodeIds()) {
                if (model.resourceId(node) == resource) { return node; }
            }
            return QtNodes::InvalidNodeId;
        };
        for (int i = 0; i < cases.size(); ++i) {
            const auto &expected = cases[i];
            const auto &layout = model.layout(id(QStringLiteral("n%1").arg(i)));
            const auto name = qPrintable(expected.type);
            QVERIFY2(layout.body == expected.body, name);
            QVERIFY2(layout.size.height() == expected.height,
                     qPrintable(QStringLiteral("%1 is %2 tall, web %3").arg(expected.type).arg(layout.size.height()).arg(expected.height)));
            QCOMPARE(layout.size.width(), 280);
            QCOMPARE(layout.resultRect.top(), 35.0);
            QVERIFY2(layout.resultRect.height() >= 96, name);
            int sliders = 0;
            int swatches = 0;
            QStringList toggle;
            for (const auto &row : layout.rows) {
                sliders += row.kind == NodeRowKind::Slider;
                swatches += row.kind == NodeRowKind::Swatch;
                if (row.kind == NodeRowKind::Segmented) {
                    toggle = row.options;
                    QCOMPARE(row.parts.size(), row.options.size());
                    QVERIFY2(row.parts.last().right() <= 280 - 11 + 0.5, name);
                }
                QVERIFY2(row.rect.isEmpty() || row.rect.bottom() <= layout.size.height() - 11, name);
            }
            QVERIFY2(sliders == expected.sliders, name);
            QVERIFY2(swatches == expected.swatches, name);
            QVERIFY2(toggle == expected.toggle, name);
        }
        // AdjustmentBody: one 24 px slider row per ranged number, 4 px apart,
        // image-typed properties as handles and every other input hidden.
        const auto adjustment = id("n0");
        const auto &layout = model.layout(adjustment);
        QVector<NodeRow> rows;
        for (const auto &row : layout.rows) {
            if (row.kind == NodeRowKind::Slider) { rows.append(row); }
        }
        QCOMPARE(rows[0].label, QStringLiteral("Brightness"));
        QCOMPARE(rows[0].rect.y(), 137.0);
        QCOMPARE(rows[0].rect.height(), 24.0);
        QCOMPARE(rows[1].rect.y(), 165.0);
        QVERIFY(rows[0].bipolar);
        QVERIFY(!rows[1].bipolar);
        QVERIFY(rows[0].tracksDefault);
        QCOMPARE(rows[1].defaultNumber, 1.0);
        QCOMPARE(sliderText(rows[0], 0.5), QStringLiteral("+0.50"));
        QCOMPARE(sliderText(rows[1], 1.25), QStringLiteral("1.25"));
        QVERIFY(sliderTrack(rows[0]).width() > 80);
        QCOMPARE(model.nodeData(adjustment, QtNodes::NodeRole::InPortCount).toUInt(), 2u);
        QCOMPARE(layout.inputY.value(0), 46.0);
        QCOMPARE(layout.inputY.value(1), 74.0);
        QCOMPARE(layout.outputY.value(0), 46.0);
        // Mask draws three image handles 28 px apart.
        QCOMPARE(model.layout(id("n10")).inputY, (QVector<double>{46, 74, 102}));
        // Generator: the web default height of 460 grows the preview, not the controls.
        const auto &generator = model.layout(id("n12"));
        QCOMPARE(generator.flexHeight, 460 - 314);
        QCOMPARE(generator.resultRect.height(), 96.0 + 146);
        QCOMPARE(generator.minimumSize.height(), 314);
        QCOMPARE(model.nodeData(id("n12"), QtNodes::NodeRole::InPortCount).toUInt(), 0u);
        // HSL Adjust: a Range select then three bare sliders with signed values.
        const auto &hsl = model.layout(id("n11"));
        const NodeRow *range = nullptr;
        for (const auto &row : hsl.rows) {
            if (row.propertyName == QStringLiteral("color_range")) { range = &row; }
        }
        QVERIFY(range);
        QVERIFY(range->choice);
        QCOMPARE(range->rect.y(), 135.0);
        QCOMPARE(range->value, QStringLiteral("All"));
    }

    void adjustmentLabelsWrapAndAuthoredHeightGrowsPreview() {
        auto vibrance = partTwoNode("vibrance", "lib.image.color_grading.SaturationVibrance", QPointF(0, 900));
        auto tall = partTwoNode("tall", "lib.image.color.BrightnessContrast", QPointF(320, 900), {{"brightness", 0.25}});
        auto ui = tall["ui_properties"].toObject();
        ui["height"] = 300;
        tall["ui_properties"] = ui;
        WorkflowGraphModel model;
        model.project(withNodes({vibrance, tall}), allMetadata());
        QtNodes::NodeId vibranceId = QtNodes::InvalidNodeId;
        QtNodes::NodeId tallId = QtNodes::InvalidNodeId;
        for (const auto node : model.allNodeIds()) {
            if (model.resourceId(node) == "vibrance") { vibranceId = node; }
            if (model.resourceId(node) == "tall") { tallId = node; }
        }
        // humanize() title-cases the name, and a long label wraps at 1.3 em,
        // which makes its grid row taller than the 24 px slider.
        QVector<NodeRow> rows;
        for (const auto &row : model.layout(vibranceId).rows) {
            if (row.kind == NodeRowKind::Slider) { rows.append(row); }
        }
        QCOMPARE(rows.size(), 2);
        QCOMPARE(rows[0].label, QStringLiteral("Saturation And Vibrance Balance"));
        QVERIFY(rows[0].rect.height() > 24);
        QCOMPARE(rows[1].label, QStringLiteral("Levels"));
        QCOMPARE(rows[1].step, 1.0);
        QCOMPARE(sliderText(rows[1], 12), QStringLiteral("12"));
        QCOMPARE(rows[1].rect.y(), rows[0].rect.bottom() + 4);
        QCOMPARE(model.layout(vibranceId).size.height(), int(std::ceil(150 + 28 * 2 + rows[0].rect.height() - 24)));
        // An authored 300 px card grows the preview and keeps the controls at the bottom.
        const auto &card = model.layout(tallId);
        QCOMPARE(card.size.height(), 300);
        QCOMPARE(card.resultRect.height(), 96.0 + 94);
        QCOMPARE(card.minimumSize.height(), 206);
        const NodeRow *brightness = nullptr;
        for (const auto &row : card.rows) {
            if (row.propertyName == QStringLiteral("brightness")) { brightness = &row; }
        }
        QVERIFY(brightness);
        QCOMPARE(brightness->rect.y(), 137.0 + 94);
        QCOMPARE(brightness->number, 0.25);
        QCOMPARE(card.inputY.value(0), 46.0);
    }

    void imageBlurAndResizePreviewsAreNinetySixTall() {
        WorkflowGraphModel model;
        model.project(fixture()["workflow"].toObject(), fixture()["metadata"].toArray());
        for (const auto node : model.allNodeIds()) {
            const auto resource = model.resourceId(node);
            if (resource != "blur" && resource != "resize") { continue; }
            // BlurBody.tsx and ResizeImageBody.tsx: .preview-area minHeight 96.
            const auto &layout = model.layout(node);
            QCOMPARE(layout.resultRect, QRectF(11, 35, 258, 96));
            for (const auto &row : layout.rows) {
                if (row.kind == NodeRowKind::Field && row.propertyName == "blur_type") { QCOMPARE(row.rect.y(), 135.0); }
                // ResizeImageBody: the mode row follows the preview after the body's 2 px gap.
                if (row.kind == NodeRowKind::Segmented) { QCOMPARE(row.rect.y(), 133.0); }
            }
        }
    }

    void imageBodyControlsEditProperties() {
        Host host(withNodes({partTwoNode("offset", "lib.image.warp.Offset", QPointF(0, 700)),
                             partTwoNode("channels", "nodetool.image.Channels", QPointF(320, 700)),
                             partTwoNode("bc", "lib.image.color.BrightnessContrast", QPointF(640, 700)),
                             partTwoNode("invert", "lib.image.filter.Invert", QPointF(960, 700))}),
                  allMetadata());
        auto undo = host.undoCount();
        const auto *wrap = host.row("offset", NodeRowKind::Segmented, "wrap");
        QVERIFY(wrap);
        QCOMPARE(wrap->selected, 1);
        host.click("offset", wrap->parts[2].center());
        QTRY_COMPARE(host.data("offset")["wrap"].toInt(), 2);
        QCOMPARE(host.undoCount(), ++undo);
        QCOMPARE(host.row("offset", NodeRowKind::Segmented, "wrap")->selected, 2);
        const auto *channel = host.row("channels", NodeRowKind::Segmented, "channel");
        QVERIFY(channel);
        QCOMPARE(channel->selected, 4);
        host.click("channels", channel->parts[1].center());
        QTRY_COMPARE(host.data("channels")["channel"].toString(), QStringLiteral("green"));
        QCOMPARE(host.undoCount(), ++undo);
        const auto *brightness = host.row("bc", NodeRowKind::Slider, "brightness");
        QVERIFY(brightness);
        const auto track = sliderTrack(*brightness);
        host.click("bc", QPointF(track.right(), track.center().y()));
        QTRY_COMPARE(host.data("bc")["brightness"].toDouble(), 1.0);
        QCOMPARE(host.undoCount(), ++undo);
        // The Before and After tabs switch the preview, not the document.
        const auto snapshot = host.window.document()->snapshot();
        const auto *tabs = host.row("invert", NodeRowKind::Segmented);
        QVERIFY(tabs);
        QCOMPARE(tabs->action, QStringLiteral("previewTab"));
        QCOMPARE(tabs->selected, 1);
        QCOMPARE(host.row("invert", NodeRowKind::Preview)->value, QStringLiteral("Run the node to see the result"));
        host.click("invert", tabs->parts[0].center());
        QCOMPARE(host.row("invert", NodeRowKind::Segmented)->selected, 0);
        QCOMPARE(host.row("invert", NodeRowKind::Preview)->value, QStringLiteral("Connect an image"));
        QCOMPARE(host.undoCount(), undo);
        QCOMPARE(host.window.document()->snapshot(), snapshot);
    }

    void sliderThumbFollowsWebChangedFlag() {
        Host host(withNodes({partTwoNode("bc", "lib.image.color.BrightnessContrast", QPointF(0, 700))}), allMetadata());
        const auto thumb = [&host](const QString &resource, const QString &name) {
            const auto *row = host.row(resource, NodeRowKind::Slider, name);
            if (!row) {
                return QColor(Qt::black);
            }
            const auto track = sliderTrack(*row);
            const auto span = row->maximum - row->minimum;
            const QPointF center(track.x() + track.width() * (row->number - row->minimum) / span, track.center().y());
            return host.render(resource).pixelColor(center.toPoint());
        };
        // AdjustmentSlider passes changed = value != default; at the default the thumb is text.secondary.
        auto neutral = thumb("bc", "brightness");
        QVERIFY2(std::abs(neutral.red() - neutral.blue()) < 24 && neutral.red() > 90 && neutral.red() < 200, qPrintable(neutral.name()));
        // A bare NodeSlider, as Blur's, always passes changed=false.
        neutral = thumb("blur", "size");
        QVERIFY2(std::abs(neutral.red() - neutral.blue()) < 24 && neutral.red() > 90 && neutral.red() < 200, qPrintable(neutral.name()));
        QVERIFY(host.window.document()->applyCommand({{"op", "setProperty"}, {"id", "bc"}, {"name", "brightness"}, {"value", 0.5}}).ok);
        settle();
        const auto changed = thumb("bc", "brightness");
        QVERIFY2(changed.blue() > changed.red() + 40, qPrintable(changed.name()));
    }

    void promptOffersSetVariableNames() {
        const auto setter = [](const QString &name) {
            return partTwoNode("setter", "nodetool.variable.SetVariable", QPointF(0, 700), {{"name", name}});
        };
        WorkflowGraphModel model;
        model.project(withNodes({setter("mood")}), allMetadata());
        QtNodes::NodeId prompt = QtNodes::InvalidNodeId;
        for (const auto node : model.allNodeIds()) {
            if (model.resourceId(node) == "prompt") { prompt = node; }
        }
        const auto chips = [&model, prompt] {
            QStringList names;
            for (const auto &row : model.layout(prompt).rows) {
                if (row.action == QStringLiteral("insertVariable")) { names.append(row.value); }
            }
            return names;
        };
        const auto composer = [&model, prompt] {
            for (const auto &row : model.layout(prompt).rows) {
                if (row.kind == NodeRowKind::Composer) { return row; }
            }
            return NodeRow{};
        };
        // PromptComposerBody lists the node's own inputs, then Set Variable names it lacks,
        // and treats both as known variables.
        QCOMPARE(chips(), QStringList{QStringLiteral("mood")});
        QVERIFY(composer().options.contains(QStringLiteral("mood")));
        // The bar wraps as flex-wrap, so no item overlaps another or leaves the card.
        QVector<QRectF> items;
        for (const auto &row : model.layout(prompt).rows) {
            if (row.kind == NodeRowKind::Action || (row.kind == NodeRowKind::Label && !row.rect.isEmpty())) { items.append(row.rect); }
        }
        QCOMPARE(items.size(), 3);
        for (int i = 0; i < items.size(); ++i) {
            QVERIFY(items[i].right() <= 280 - 11);
            for (int j = i + 1; j < items.size(); ++j) { QVERIFY(!items[i].intersects(items[j])); }
        }
        QVERIFY(model.layout(prompt).size.height() > 168);
        // Renaming the setter updates the Prompt card without touching the Prompt node.
        model.project(withNodes({setter("calm")}), allMetadata());
        QCOMPARE(chips(), QStringList{QStringLiteral("calm")});
        QVERIFY(!composer().options.contains(QStringLiteral("mood")));
    }

    void getVariableBodyPicksSetVariableNames() {
        Host host(withNodes({partTwoNode("setter", "nodetool.variable.SetVariable", QPointF(0, 700), {{"name", "mood"}}),
                             partTwoNode("getter", "nodetool.variable.GetVariable", QPointF(320, 700)),
                             partTwoNode("stale", "nodetool.variable.GetVariable", QPointF(640, 700), {{"name", "gone"}})}),
                  allMetadata());
        QCOMPARE(host.model().layout(host.id("getter")).body, CardBody::GetVariable);
        const auto *explanation = host.row("getter", NodeRowKind::Label);
        QVERIFY(explanation);
        QVERIFY(explanation->label.startsWith(QStringLiteral("Reads a variable published by any Set Variable node")));
        QVERIFY(explanation->rect.height() > 30);
        const auto *picker = host.row("getter", NodeRowKind::Field, "name");
        QVERIFY(picker);
        QVERIFY(picker->choice);
        QCOMPARE(picker->label, QStringLiteral("Variable"));
        QCOMPARE(picker->options, QStringList{QStringLiteral("mood")});
        QVERIFY(picker->placeholder);
        // A stored name without a setter stays selectable, as missingSetter.
        const auto *stale = host.row("stale", NodeRowKind::Field, "name");
        QVERIFY(stale);
        QCOMPARE(stale->options.first(), QStringLiteral("gone (no Set Variable node)"));
        QCOMPARE(stale->value, QStringLiteral("gone (no Set Variable node)"));
        QCOMPARE(host.model().nodeData(host.id("getter"), QtNodes::NodeRole::InPortCount).toUInt(), 1u);
        const auto undo = host.undoCount();
        host.click("getter", picker->rect.center());
        auto *overlay = host.overlay();
        QVERIFY(overlay);
        QTRY_VERIFY(find(overlay->rootObject(), QStringLiteral("inline-choice")));
        QTest::keyClick(overlay, Qt::Key_Down);
        QTest::keyClick(overlay, Qt::Key_Return);
        QTRY_COMPARE(host.data("getter")["name"].toString(), QStringLiteral("mood"));
        QCOMPARE(host.undoCount(), undo + 1);
        // Without any Set Variable node the body shows the empty hint instead of a picker.
        WorkflowGraphModel model;
        model.project(withNodes({partTwoNode("getter", "nodetool.variable.GetVariable", QPointF(0, 700))}), allMetadata());
        for (const auto node : model.allNodeIds()) {
            if (model.resourceId(node) != "getter") { continue; }
            bool hint = false;
            for (const auto &row : model.layout(node).rows) {
                QVERIFY(row.propertyName != QStringLiteral("name"));
                hint = hint || row.label.startsWith(QStringLiteral("No variables defined yet."));
            }
            QVERIFY(hint);
        }
    }
};

QTEST_MAIN(CardBodiesTest)
#include "CardBodiesTest.moc"
