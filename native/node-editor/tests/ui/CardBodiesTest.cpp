#include "graph/CanvasDropController.h"
#include "graph/CardBodies.h"
#include "graph/EditorScene.h"
#include "graph/InlinePropertyPresenter.h"
#include "graph/WorkflowGraphModel.h"
#include "ui/EditorWindow.h"
#include <QBuffer>
#include <QClipboard>
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

QJsonObject outputsFor(QJsonObject metadata, const QJsonArray &outputs) {
    metadata["outputs"] = outputs;
    return metadata;
}

QJsonObject output(const QString &name, const QString &type) {
    return {{"name", name}, {"type", QJsonObject{{"type", type}, {"type_args", QJsonArray{}}}}};
}

// Metadata for the part 3 node components and image bodies.
QJsonArray partThreeMetadata() {
    const auto dimension = [](const QString &name) { return slider(name, 1, 8192, 512, "int"); };
    auto fal = metadataFor("fal.DynamicFal", "FAL Dynamic", {property("model_info", "str", {{"default", ""}})}, QStringLiteral("any"));
    fal["supports_dynamic_inputs"] = true;
    fal["supports_dynamic_outputs"] = true;
    auto kie = metadataFor("kie.dynamic_schema.KieAI", "Kie AI", {property("model_info", "str", {{"default", ""}})}, QStringLiteral("any"));
    kie["supports_dynamic_inputs"] = true;
    auto replicate = metadataFor("replicate.DynamicReplicate", "Replicate", {property("model_info", "str", {{"default", ""}})}, QStringLiteral("any"));
    replicate["supports_dynamic_inputs"] = true;
    return {
        outputsFor(metadataFor("nodetool.compare.CompareImages", "Compare Images", {image("image_a"), image("image_b")}),
                   {output("score", "float"), output("equal", "bool"), output("comparison", "image_comparison")}),
        metadataFor("nodetool.constant.String", "String", {property("value", "str", {{"default", ""}})}, QStringLiteral("str")),
        metadataFor("nodetool.image.RotateAndFlip", "Rotate & Flip",
                    {image(), slider("angle", -360, 360, 0), property("flip_horizontal", "bool", {{"default", false}}),
                     property("flip_vertical", "bool", {{"default", false}})}),
        metadataFor("nodetool.image.Resize", "Resize", {image(), dimension("width"), dimension("height")}),
        metadataFor("nodetool.image.Fit", "Fit", {image(), dimension("width"), dimension("height")}),
        metadataFor("nodetool.image.Paste", "Paste", {image(), image("paste"), slider("left", 0, 4096, 0, "int"), slider("top", 0, 4096, 0, "int")}),
        metadataFor("nodetool.image.CanvasResize", "Canvas Resize",
                    {image(), property("mode", "str", {{"values", QJsonArray{"fixed", "scale", "padding"}}, {"default", "padding"}}),
                     dimension("width"), dimension("height"), slider("scale", 0.01, 4, 1.25),
                     property("padding_unit", "str", {{"values", QJsonArray{"px", "percent"}}, {"default", "px"}}),
                     slider("top", 0, 4096, 0), slider("bottom", 0, 4096, 0), slider("left", 0, 4096, 0), slider("right", 0, 4096, 0)}),
        metadataFor("lib.image.color_grading.Curves", "Curves",
                    {image(), slider("black_point", 0, 0.5, 0), slider("white_point", 0.5, 1, 1), slider("shadows", -0.5, 0.5, 0),
                     slider("midtones", -0.5, 0.5, 0), slider("highlights", -0.5, 0.5, 0), slider("red_midtones", -0.5, 0.5, 0),
                     slider("green_midtones", -0.5, 0.5, 0), slider("blue_midtones", -0.5, 0.5, 0)}),
        metadataFor("nodetool.image.Levels", "Levels",
                    {image(), slider("r_black", 0, 255, 0, "int"), slider("r_gamma", 0.01, 10, 1), slider("r_white", 0, 255, 255, "int"),
                     slider("g_black", 0, 255, 0, "int"), slider("g_gamma", 0.01, 10, 1), slider("g_white", 0, 255, 255, "int"),
                     slider("b_black", 0, 255, 0, "int"), slider("b_gamma", 0.01, 10, 1), slider("b_white", 0, 255, 255, "int")}),
        metadataFor("nodetool.constant.Image", "Image", {image("value")}),
        fal, kie, replicate,
    };
}

QJsonArray allMetadata() {
    auto metadata = fixture()["metadata"].toArray();
    for (const auto &entry : partTwoMetadata()) {
        metadata.append(entry);
    }
    for (const auto &entry : partThreeMetadata()) {
        metadata.append(entry);
    }
    return metadata;
}

// Places a node with authored ui fields, such as a size or a provider endpoint.
QJsonObject withUi(QJsonObject node, const QJsonObject &fields) {
    auto ui = node["ui_properties"].toObject();
    for (auto it = fields.begin(); it != fields.end(); ++it) {
        ui[it.key()] = it.value();
    }
    node["ui_properties"] = ui;
    return node;
}

// The metadata the real server lists for the constant nodes, recorded from
// /api/nodes/metadata?fields=full without the media constants.
QJsonArray constantCatalog() {
    QFile file(QFINDTESTDATA("ConstantNodesFixture.json"));
    if (!file.open(QIODevice::ReadOnly)) {
        return {};
    }
    return QJsonDocument::fromJson(file.readAll()).array();
}

QJsonArray constantsCatalog() {
    auto catalog = fixture()["metadata"].toArray();
    for (const auto &entry : constantCatalog()) {
        catalog.append(entry);
    }
    return catalog;
}

QJsonObject constantNode(const QString &name, const QJsonObject &data = {}, const QPointF &position = {}) {
    return partTwoNode(name.toLower(), QStringLiteral("nodetool.constant.") + name, position, data);
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
                                "lib.image.draw.LinearGradient", "nodetool.variable.GetVariable", "nodetool.variable.SetVariable",
                                "nodetool.compare.CompareImages", "nodetool.constant.String", "nodetool.image.RotateAndFlip",
                                "nodetool.image.Resize", "nodetool.image.Fit", "fal.DynamicFal"};
        QJsonArray nodes;
        for (int i = 0; i < types.size(); ++i) {
            nodes.append(partTwoNode(QStringLiteral("c%1").arg(i), types[i], QPointF(320 * (i % 6), 700 + 520 * (i / 6)),
                                     types[i].endsWith("SetVariable") ? QJsonObject{{"name", "mood"}}
                                     : types[i].endsWith("String") ? QJsonObject{{"value", "A quiet harbor at dawn.\nSecond line."}}
                                     : types[i].endsWith("RotateAndFlip") ? QJsonObject{{"angle", 90}, {"flip_horizontal", true}} : QJsonObject{}));
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

    // CompareImagesNode.tsx: image_a and image_b on the 28 px pitch below the
    // header, and a comparer filling the card inside the 8 px body padding.
    void compareImagesBodyFillsTheCard() {
        WorkflowGraphModel model;
        model.project(withNodes({partTwoNode("compare", "nodetool.compare.CompareImages", QPointF(0, 900)),
                                 withUi(partTwoNode("wide", "nodetool.compare.CompareImages", QPointF(400, 900)),
                                        {{"width", 450}, {"height", 350}})}),
                      allMetadata());
        const auto id = [&model](const QString &resource) {
            for (const auto node : model.allNodeIds()) {
                if (model.resourceId(node) == resource) { return node; }
            }
            return QtNodes::InvalidNodeId;
        };
        const auto &card = model.layout(id("compare"));
        QCOMPARE(card.body, CardBody::CompareImages);
        QCOMPARE(card.title, QStringLiteral("Compare Images"));
        QCOMPARE(card.typeIcon, QStringLiteral("image"));
        // The web card is at least 300 by 250 and has no other content to size it.
        QCOMPARE(card.size, QSize(300, 250));
        QCOMPARE(card.minimumSize, QSize(300, 250));
        QCOMPARE(card.inputY, (QVector<double>{46, 74}));
        QCOMPARE(card.outputY, (QVector<double>{46, 74, 102}));
        QCOMPARE(model.nodeData(id("compare"), QtNodes::NodeRole::InPortCount).toUInt(), 2u);
        // .content sits at the header height plus 4 px and fills the rest of the padded body.
        QCOMPARE(card.resultRect, QRectF(9, 37, 282, 204));
        const NodeRow *empty = nullptr;
        for (const auto &row : card.rows) {
            if (row.kind == NodeRowKind::Preview) { empty = &row; }
        }
        QVERIFY(empty);
        QCOMPARE(empty->value, QStringLiteral("Connect two images, then run"));
        QCOMPARE(empty->icon, QStringLiteral("compare"));
        QVERIFY(!iconPath(empty->icon).isEmpty());
        // A resized card grows the comparer and keeps its minimum.
        const auto &wide = model.layout(id("wide"));
        QCOMPARE(wide.size, QSize(450, 350));
        QCOMPARE(wide.resultRect, QRectF(9, 37, 432, 304));
        QCOMPARE(wide.minimumSize, QSize(300, 250));
    }

    // ConstantStringNode.tsx: the value handle and the output sit on the header
    // line, and the card grows to fit its text up to 600 px.
    void constantStringBodyGrowsWithItsText() {
        auto text = partTwoNode("text", "nodetool.constant.String", QPointF(0, 700), {{"value", ""}});
        text["future_field"] = 7;
        QStringList twenty;
        QStringList sixty;
        for (int i = 0; i < 60; ++i) {
            if (i < 20) { twenty.append(QStringLiteral("line %1").arg(i)); }
            sixty.append(QStringLiteral("line %1").arg(i));
        }
        Host host(withNodes({text, partTwoNode("tall", "nodetool.constant.String", QPointF(320, 700), {{"value", twenty.join('\n')}}),
                             partTwoNode("huge", "nodetool.constant.String", QPointF(640, 700), {{"value", sixty.join('\n')}})}),
                  allMetadata());
        const auto &card = host.model().layout(host.id("text"));
        QCOMPARE(card.body, CardBody::ConstantString);
        // A 4 px gap below the header, a 60 px text area, the 8 px padding and the border.
        QCOMPARE(card.size, QSize(280, 106));
        QCOMPARE(card.minimumSize, QSize(200, 106));
        QCOMPARE(card.inputY, (QVector<double>{21}));
        QCOMPARE(card.outputY, (QVector<double>{21}));
        const auto *area = host.row("text", NodeRowKind::Multiline, "value");
        QVERIFY(area);
        QCOMPARE(area->rect, QRectF(9, 37, 262, 60));
        // Twenty 13.2 px lines and 6 px padding, and a 600 px ceiling.
        QCOMPARE(host.model().layout(host.id("tall")).size.height(), 322);
        QCOMPARE(host.model().layout(host.id("huge")).size.height(), 600);
        QCOMPARE(host.row("huge", NodeRowKind::Multiline, "value")->rect.height(), 600.0 - 46);
        // Open editor and Copy sit 4 px from the right of the header, 2 px apart.
        const auto *copy = host.row("text", NodeRowKind::Action, "copyValue");
        const auto *expand = host.row("text", NodeRowKind::Action, "expandEditor");
        QVERIFY(copy);
        QVERIFY(expand);
        QCOMPARE(copy->rect, QRectF(246, 10.5, 21, 21));
        QCOMPARE(expand->rect, QRectF(223, 10.5, 21, 21));
        auto undo = host.undoCount();
        host.click("text", area->rect.center());
        QPointer<QQuickWidget> overlay = host.overlay();
        QVERIFY(overlay);
        QTRY_VERIFY(find(overlay->rootObject(), QStringLiteral("inline-multiline")));
        // The editor covers the text area, as the web swaps its preview for a textarea.
        QCOMPARE(host.model().inlineFieldRect(host.id("text"), QStringLiteral("value")), area->rect);
        type(overlay, QStringLiteral("hello"));
        // A click on empty canvas commits the draft.
        QTest::mouseClick(host.view->viewport(), Qt::LeftButton, Qt::NoModifier, QPoint(20, host.view->viewport()->height() - 20));
        QTRY_COMPARE(host.data("text")["value"].toString(), QStringLiteral("hello"));
        QCOMPARE(host.undoCount(), ++undo);
        QCOMPARE(host.window.document()->node("text")["future_field"].toInt(), 7);
        // Ctrl+Return commits the draft too. The commit rebuilt the layout, so look the row up again.
        host.click("text", host.row("text", NodeRowKind::Multiline, "value")->rect.center());
        overlay = host.overlay();
        QVERIFY(overlay);
        QTRY_VERIFY(find(overlay->rootObject(), QStringLiteral("inline-multiline")));
        type(overlay, QStringLiteral("!"));
        QTest::keyClick(overlay.data(), Qt::Key_Return, Qt::ControlModifier);
        QTRY_COMPARE(host.data("text")["value"].toString().size(), 6);
        QVERIFY(host.data("text")["value"].toString().contains('!'));
        QCOMPARE(host.undoCount(), ++undo);
        // Copy puts the value on the clipboard and leaves the document alone.
        QGuiApplication::clipboard()->clear();
        host.click("text", host.row("text", NodeRowKind::Action, "copyValue")->rect.center());
        QCOMPARE(QGuiApplication::clipboard()->text(), host.data("text")["value"].toString());
        QCOMPARE(host.undoCount(), undo);
        // Open editor opens the value in the expanded inline editor.
        auto *presenter = host.window.findChild<InlinePropertyPresenter *>();
        QVERIFY(presenter);
        host.click("text", host.row("text", NodeRowKind::Action, "expandEditor")->rect.center());
        QTRY_VERIFY(presenter->active());
        QVERIFY(presenter->expanded());
        QCOMPARE(presenter->descriptor()["name"].toString(), QStringLiteral("value"));
        QCOMPARE(host.undoCount(), undo);
    }

    // RotateAndFlipBody.tsx: a -360 to 360 slider with a degree readout, Flip H
    // and Flip V toggles, and Reset, each edit one undo step.
    void rotateAndFlipBodyEditsAngleAndFlips() {
        auto node = partTwoNode("rotate", "nodetool.image.RotateAndFlip", QPointF(0, 700));
        node["future_field"] = 7;
        Host host(withNodes({node}), allMetadata());
        const auto &card = host.model().layout(host.id("rotate"));
        QCOMPARE(card.body, CardBody::RotateFlip);
        // 96 px preview, 2 px gap, the controls column (2 + 20 + 2 + 2 + 30) and 13 px below.
        QCOMPARE(card.size.height(), 202);
        QCOMPARE(card.inputY.value(0), 46.0);
        QCOMPARE(host.model().nodeData(host.id("rotate"), QtNodes::NodeRole::InPortCount).toUInt(), 1u);
        const auto *angle = host.row("rotate", NodeRowKind::Slider, "angle");
        QVERIFY(angle);
        QCOMPARE(angle->rect.y(), 135.0);
        QCOMPARE(angle->rect.height(), 20.0);
        QCOMPARE(angle->minimum, -360.0);
        QCOMPARE(angle->maximum, 360.0);
        QCOMPARE(sliderText(*angle, 90), QStringLiteral("90°"));
        QCOMPARE(sliderTrack(*angle).left(), 13.0);
        QCOMPARE(sliderTrack(*angle).right(), 280 - 13.0 - 48 - 2);
        // The nine 90 degree snap marks.
        QCOMPARE(angle->optionValues.size(), 9);
        const auto *flipH = host.row("rotate", NodeRowKind::Action, "flip_horizontal");
        const auto *flipV = host.row("rotate", NodeRowKind::Action, "flip_vertical");
        const auto *reset = host.row("rotate", NodeRowKind::Action, "resetTransform");
        QVERIFY(flipH);
        QVERIFY(flipV);
        QVERIFY(reset);
        QCOMPARE(flipH->rect, QRectF(11, 159, 30, 30));
        QCOMPARE(flipV->rect, QRectF(43, 159, 30, 30));
        QCOMPARE(reset->rect, QRectF(239, 159, 30, 30));
        QVERIFY(!flipH->checked);
        auto undo = host.undoCount();
        const auto track = sliderTrack(*angle);
        host.click("rotate", QPointF(track.right(), track.center().y()));
        QTRY_COMPARE(host.data("rotate")["angle"].toDouble(), 360.0);
        QCOMPARE(host.undoCount(), ++undo);
        host.click("rotate", host.row("rotate", NodeRowKind::Action, "flip_horizontal")->rect.center());
        QTRY_VERIFY(host.data("rotate")["flip_horizontal"].toBool());
        QCOMPARE(host.undoCount(), ++undo);
        QVERIFY(host.row("rotate", NodeRowKind::Action, "flip_horizontal")->checked);
        host.click("rotate", host.row("rotate", NodeRowKind::Action, "flip_vertical")->rect.center());
        QTRY_VERIFY(host.data("rotate")["flip_vertical"].toBool());
        QCOMPARE(host.undoCount(), ++undo);
        // Reset writes all three values in one step.
        host.click("rotate", host.row("rotate", NodeRowKind::Action, "resetTransform")->rect.center());
        QTRY_COMPARE(host.data("rotate")["angle"].toDouble(), 0.0);
        QVERIFY(!host.data("rotate")["flip_horizontal"].toBool());
        QVERIFY(!host.data("rotate")["flip_vertical"].toBool());
        QCOMPARE(host.undoCount(), ++undo);
        host.window.document()->undo();
        QCOMPARE(host.data("rotate")["angle"].toDouble(), 360.0);
        QVERIFY(host.data("rotate")["flip_horizontal"].toBool());
        QVERIFY(host.data("rotate")["flip_vertical"].toBool());
        QCOMPARE(host.window.document()->node("rotate")["future_field"].toInt(), 7);
    }

    // ResizeBody.tsx and FitBody.tsx share the Resize Image dimension row: Resize
    // links the sides with a lock, Fit adds the size presets.
    void resizeAndFitBodiesShareTheDimensionRow() {
        auto resize = partTwoNode("resize2", "nodetool.image.Resize", QPointF(0, 700));
        auto fit = partTwoNode("fit", "nodetool.image.Fit", QPointF(320, 700));
        resize["future_field"] = 7;
        fit["future_field"] = 8;
        Host host(withNodes({resize, fit}), allMetadata());
        const auto &card = host.model().layout(host.id("resize2"));
        QCOMPARE(card.body, CardBody::Resize);
        // The Resize Image card without its 24 px mode row and 2 px gap.
        QCOMPARE(card.size.height(), 213 - 26);
        QCOMPARE(host.model().nodeData(host.id("resize2"), QtNodes::NodeRole::InPortCount).toUInt(), 1u);
        const auto *width = host.row("resize2", NodeRowKind::Field, "width");
        const auto *height = host.row("resize2", NodeRowKind::Field, "height");
        QVERIFY(width);
        QVERIFY(height);
        QCOMPARE(width->rect, QRectF(11, 146, 115, 24));
        QCOMPARE(height->rect.x(), 11.0 + 115 + 28);
        QVERIFY(host.row("resize2", NodeRowKind::Lock));
        // A closed lock writes both sides from the ratio it recorded.
        host.click("resize2", host.row("resize2", NodeRowKind::Lock)->rect.center());
        QVERIFY(host.model().dimensionsLinked(host.id("resize2")));
        auto undo = host.undoCount();
        host.click("resize2", host.row("resize2", NodeRowKind::Field, "width")->rect.center());
        auto *overlay = host.overlay();
        QVERIFY(overlay);
        QTRY_VERIFY(find(overlay->rootObject(), QStringLiteral("inline-number")));
        QTest::keyClick(overlay->quickWindow(), Qt::Key_A, Qt::ControlModifier);
        type(overlay, QStringLiteral("1024"));
        QTest::keyClick(overlay->quickWindow(), Qt::Key_Return);
        QTRY_COMPARE(host.data("resize2")["width"].toDouble(), 1024.0);
        QCOMPARE(host.data("resize2")["height"].toDouble(), 1024.0);
        QCOMPARE(host.undoCount(), ++undo);
        QCOMPARE(host.window.document()->node("resize2")["future_field"].toInt(), 7);
        const auto &fitCard = host.model().layout(host.id("fit"));
        QCOMPARE(fitCard.body, CardBody::Fit);
        QCOMPARE(fitCard.size.height(), 211);
        QVERIFY(!host.row("fit", NodeRowKind::Lock));
        QCOMPARE(host.row("fit", NodeRowKind::Field, "width")->rect, QRectF(11, 146, 127, 24));
        QVector<NodeRow> presets;
        for (const auto &row : fitCard.rows) {
            if (row.action == QStringLiteral("resizePreset")) { presets.append(row); }
        }
        QCOMPARE(presets.size(), 4);
        QCOMPARE(presets[2].number, 768.0);
        QVERIFY(presets.last().rect.right() <= 280 - 11);
        host.click("fit", presets[2].rect.center());
        QTRY_COMPARE(host.data("fit")["width"].toDouble(), 768.0);
        QCOMPARE(host.data("fit")["height"].toDouble(), 768.0);
        QCOMPARE(host.undoCount(), ++undo);
        QCOMPARE(host.window.document()->node("fit")["future_field"].toInt(), 8);
        host.window.document()->undo();
        QVERIFY(!host.data("fit").contains("width"));
    }

    // PasteBody.tsx: the base and paste image handles, and Left and Top boxes in the dimension row.
    void pasteBodyEditsItsOffsets() {
        auto paste = partTwoNode("paste", "nodetool.image.Paste", QPointF(0, 700));
        paste["future_field"] = 7;
        Host host(withNodes({paste}), allMetadata());
        const auto &card = host.model().layout(host.id("paste"));
        QCOMPARE(card.body, CardBody::Paste);
        QCOMPARE(card.size.height(), 187);
        QCOMPARE(card.inputY.mid(0, 2), (QVector<double>{46, 74}));
        QCOMPARE(host.model().nodeData(host.id("paste"), QtNodes::NodeRole::InPortCount).toUInt(), 2u);
        QCOMPARE(host.row("paste", NodeRowKind::Preview)->value, QStringLiteral("Connect Image and Paste, then run"));
        QVERIFY(!host.row("paste", NodeRowKind::Lock));
        QStringList captions;
        for (const auto &row : card.rows) {
            if (row.kind == NodeRowKind::Label) { captions.append(row.label); }
        }
        QCOMPARE(captions, (QStringList{QStringLiteral("Left"), QStringLiteral("Top")}));
        const auto *left = host.row("paste", NodeRowKind::Field, "left");
        QVERIFY(left);
        QCOMPARE(left->rect, QRectF(11, 146, 127, 24));
        QCOMPARE(host.row("paste", NodeRowKind::Field, "top")->rect.x(), 11.0 + 127 + 4);
        const auto undo = host.undoCount();
        host.click("paste", left->rect.center());
        auto *overlay = host.overlay();
        QVERIFY(overlay);
        QTRY_VERIFY(find(overlay->rootObject(), QStringLiteral("inline-number")));
        QTest::keyClick(overlay->quickWindow(), Qt::Key_A, Qt::ControlModifier);
        type(overlay, QStringLiteral("32"));
        QTest::keyClick(overlay->quickWindow(), Qt::Key_Return);
        QTRY_COMPARE(host.data("paste")["left"].toDouble(), 32.0);
        QVERIFY(!host.data("paste").contains("top"));
        QCOMPARE(host.undoCount(), undo + 1);
        QCOMPARE(host.window.document()->node("paste")["future_field"].toInt(), 7);
    }

    // CanvasResizeBody.tsx: Padding by default with a px or % unit and four
    // edges; Fixed shows width and height; Scale shows a 0.01 to 4 slider.
    void canvasResizeSwitchesModes() {
        Host host(withNodes({partTwoNode("canvas", "nodetool.image.CanvasResize", QPointF(0, 700))}), allMetadata());
        QCOMPARE(host.model().layout(host.id("canvas")).body, CardBody::CanvasResize);
        QCOMPARE(host.model().nodeData(host.id("canvas"), QtNodes::NodeRole::InPortCount).toUInt(), 1u);
        const auto *modes = host.row("canvas", NodeRowKind::Segmented, "mode");
        QVERIFY(modes);
        QCOMPARE(modes->selected, 2);
        QCOMPARE(modes->options, (QStringList{QStringLiteral("Fixed"), QStringLiteral("Scale"), QStringLiteral("Padding")}));
        // fullWidth: three equal options across the column.
        QCOMPARE(modes->parts[0].width(), modes->parts[2].width());
        const auto *unit = host.row("canvas", NodeRowKind::Segmented, "padding_unit");
        QVERIFY(unit);
        QCOMPARE(unit->selected, 0);
        for (const auto *edge : {"top", "bottom", "left", "right"}) {
            QVERIFY2(host.row("canvas", NodeRowKind::Field, QString::fromLatin1(edge)), edge);
        }
        const auto *top = host.row("canvas", NodeRowKind::Field, "top");
        const auto *right = host.row("canvas", NodeRowKind::Field, "right");
        QCOMPARE(top->rect.y(), right->rect.y());
        QVERIFY(right->rect.right() <= modes->rect.right() + 0.5);
        auto undo = host.undoCount();
        host.click("canvas", unit->parts[1].center());
        QTRY_COMPARE(host.data("canvas")["padding_unit"].toString(), QStringLiteral("percent"));
        QCOMPARE(host.undoCount(), ++undo);
        const auto paddingHeight = host.model().layout(host.id("canvas")).size.height();
        host.click("canvas", host.row("canvas", NodeRowKind::Segmented, "mode")->parts[0].center());
        QTRY_COMPARE(host.data("canvas")["mode"].toString(), QStringLiteral("fixed"));
        QVERIFY(!host.row("canvas", NodeRowKind::Segmented, "padding_unit"));
        QVERIFY(!host.row("canvas", NodeRowKind::Field, "top"));
        QVERIFY(host.row("canvas", NodeRowKind::Field, "width"));
        QVERIFY(host.row("canvas", NodeRowKind::Field, "height"));
        QVERIFY(!host.row("canvas", NodeRowKind::Lock));
        QVERIFY(host.model().layout(host.id("canvas")).size.height() < paddingHeight);
        host.click("canvas", host.row("canvas", NodeRowKind::Segmented, "mode")->parts[1].center());
        QTRY_COMPARE(host.data("canvas")["mode"].toString(), QStringLiteral("scale"));
        const auto *scale = host.row("canvas", NodeRowKind::Slider, "scale");
        QVERIFY(scale);
        QCOMPARE(scale->minimum, 0.01);
        QCOMPARE(scale->maximum, 4.0);
        QCOMPARE(scale->number, 1.25);
        QVERIFY(!host.row("canvas", NodeRowKind::Field, "width"));
    }

    // CanvasResizeBody.tsx and PasteBody.tsx read the image arriving at their
    // handles: the preview shows it before a run, a dashed rectangle marks where
    // it lands, and Canvas Resize names the resulting canvas size.
    void imageBodiesShowTheirSource() {
        const auto png = [](int width, int height) {
            QImage image(width, height, QImage::Format_RGB32);
            image.fill(Qt::red);
            QByteArray bytes;
            QBuffer buffer(&bytes);
            buffer.open(QIODevice::WriteOnly);
            image.save(&buffer, "PNG");
            return QStringLiteral("data:image/png;base64,") + QString::fromLatin1(bytes.toBase64());
        };
        const auto constant = [](const QString &id, const QString &uri, double y) {
            return QJsonObject{{"id", id}, {"type", "nodetool.constant.Image"},
                               {"data", QJsonObject{{"value", QJsonObject{{"type", "image"}, {"uri", uri}}}}},
                               {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", -400}, {"y", y}}}}}};
        };
        auto workflow = withNodes({constant("base", png(40, 20), 700), constant("patch", png(10, 5), 1000),
                                   partTwoNode("canvas", "nodetool.image.CanvasResize", QPointF(0, 700), {{"mode", "fixed"}, {"width", 80}, {"height", 40}}),
                                   partTwoNode("paste", "nodetool.image.Paste", QPointF(400, 700), {{"left", 10}, {"top", 5}})});
        auto graph = workflow["graph"].toObject();
        auto edges = graph["edges"].toArray();
        const auto wire = [](const QString &id, const QString &source, const QString &target, const QString &handle) {
            return QJsonObject{{"id", id}, {"source", source}, {"sourceHandle", "output"}, {"target", target}, {"targetHandle", handle}};
        };
        edges.append(wire("e-canvas", "base", "canvas", "image"));
        edges.append(wire("e-base", "base", "paste", "image"));
        edges.append(wire("e-patch", "patch", "paste", "paste"));
        graph["edges"] = edges;
        workflow["graph"] = graph;
        Host host(workflow, allMetadata());
        const auto overlay = [&host](const QString &node) -> const NodeRow * {
            for (const auto &row : host.model().layout(host.id(node)).rows) {
                if (row.kind == NodeRowKind::Overlay) { return &row; }
            }
            return nullptr;
        };
        QTRY_VERIFY(overlay("canvas"));
        const auto &canvas = host.model().layout(host.id("canvas"));
        const auto area = canvas.resultRect;
        const auto *rect = overlay("canvas");
        // A 40 x 20 image centered on an 80 x 40 canvas covers the middle half.
        QCOMPARE(rect->rect, QRectF(area.x() + area.width() / 4, area.y() + area.height() / 4, area.width() / 2, area.height() / 2));
        QCOMPARE(rect->value, QStringLiteral("80 × 40"));
        const auto *preview = host.row("canvas", NodeRowKind::Preview);
        QVERIFY(preview);
        QCOMPARE(preview->media.size(), 1);
        QCOMPARE(preview->media.first().image.size(), QSize(40, 20));
        // Padding mode adds the edges to the source.
        host.click("canvas", host.row("canvas", NodeRowKind::Segmented, "mode")->parts[2].center());
        QTRY_COMPARE(host.data("canvas")["mode"].toString(), QStringLiteral("padding"));
        QTRY_VERIFY(overlay("canvas"));
        QCOMPARE(overlay("canvas")->value, QStringLiteral("40 × 20"));
        QTRY_VERIFY(overlay("paste"));
        const auto pasteArea = host.model().layout(host.id("paste")).resultRect;
        QCOMPARE(overlay("paste")->rect, QRectF(pasteArea.x() + pasteArea.width() / 4, pasteArea.y() + pasteArea.height() / 4,
                                                pasteArea.width() / 4, pasteArea.height() / 4));
        QVERIFY(overlay("paste")->value.isEmpty());
    }

    // CurvesBody.tsx: five Tonal and three RGB midtone sliders under eyebrows,
    // and a Reset that writes every default in one undo step.
    void curvesResetRestoresEveryDefault() {
        Host host(withNodes({partTwoNode("curves", "lib.image.color_grading.Curves", QPointF(0, 700),
                                         {{"black_point", 0.2}, {"midtones", 0.3}, {"blue_midtones", -0.1}})}), allMetadata());
        const auto &card = host.model().layout(host.id("curves"));
        QCOMPARE(card.body, CardBody::Curves);
        QStringList sliders;
        QStringList eyebrows;
        for (const auto &row : card.rows) {
            if (row.kind == NodeRowKind::Slider) { sliders.append(row.propertyName); }
            if (row.kind == NodeRowKind::Label) { eyebrows.append(row.label); }
        }
        QCOMPARE(sliders, (QStringList{"black_point", "white_point", "shadows", "midtones", "highlights", "red_midtones", "green_midtones",
                                       "blue_midtones"}));
        QCOMPARE(eyebrows, (QStringList{"TONAL", "RGB MIDTONES"}));
        const auto *white = host.row("curves", NodeRowKind::Slider, "white_point");
        QCOMPARE(white->minimum, 0.5);
        QCOMPARE(white->number, 1.0);
        QVERIFY(host.row("curves", NodeRowKind::Slider, "midtones")->bipolar);
        QCOMPARE(host.row("curves", NodeRowKind::Slider, "midtones")->number, 0.3);
        const NodeRow *reset = nullptr;
        for (const auto &row : card.rows) {
            if (row.action == QStringLiteral("resetSliders")) { reset = &row; }
        }
        QVERIFY(reset);
        const auto undo = host.undoCount();
        host.click("curves", reset->rect.center());
        QTRY_COMPARE(host.data("curves")["black_point"].toDouble(), 0.0);
        QCOMPARE(host.data("curves")["midtones"].toDouble(), 0.0);
        QCOMPARE(host.data("curves")["blue_midtones"].toDouble(), 0.0);
        QCOMPARE(host.data("curves")["white_point"].toDouble(), 1.0);
        QCOMPARE(host.undoCount(), undo + 1);
    }

    // LevelsBody.tsx: the channel toggle is view state that swaps the Black,
    // Gamma and White sliders; Reset neutralizes all three channels at once.
    void levelsChannelToggleAndReset() {
        Host host(withNodes({partTwoNode("levels", "nodetool.image.Levels", QPointF(0, 700),
                                         {{"r_black", 10}, {"g_gamma", 2.5}, {"b_white", 200}})}), allMetadata());
        QCOMPARE(host.model().layout(host.id("levels")).body, CardBody::Levels);
        const auto sliders = [&host] {
            QStringList names;
            for (const auto &row : host.model().layout(host.id("levels")).rows) {
                if (row.kind == NodeRowKind::Slider) { names.append(row.propertyName); }
            }
            return names;
        };
        QCOMPARE(sliders(), (QStringList{"r_black", "r_gamma", "r_white"}));
        QCOMPARE(host.row("levels", NodeRowKind::Slider, "r_black")->number, 10.0);
        const auto *toggle = host.row("levels", NodeRowKind::Segmented);
        QVERIFY(toggle);
        QCOMPARE(toggle->selected, 0);
        auto undo = host.undoCount();
        host.click("levels", toggle->parts[1].center());
        QTRY_COMPARE(sliders(), (QStringList{"g_black", "g_gamma", "g_white"}));
        // The channel never enters the document.
        QCOMPARE(host.undoCount(), undo);
        QCOMPARE(host.row("levels", NodeRowKind::Slider, "g_gamma")->number, 2.5);
        QCOMPARE(host.row("levels", NodeRowKind::Slider, "g_gamma")->maximum, 10.0);
        const NodeRow *reset = nullptr;
        for (const auto &row : host.model().layout(host.id("levels")).rows) {
            if (row.action == QStringLiteral("resetSliders")) { reset = &row; }
        }
        QVERIFY(reset);
        host.click("levels", reset->rect.center());
        QTRY_COMPARE(host.data("levels")["r_black"].toDouble(), 0.0);
        QCOMPARE(host.data("levels")["g_gamma"].toDouble(), 1.0);
        QCOMPARE(host.data("levels")["b_white"].toDouble(), 255.0);
        QCOMPARE(host.undoCount(), undo + 1);
    }

    // DynamicSchemaNodeShell.tsx: the model joins the title, a hint explains an
    // empty node, a footer names the provider and model, and the edge takes the provider color.
    void dynamicProviderCardsShowTheirModel() {
        auto fal = withUi(partTwoNode("fal", "fal.DynamicFal", QPointF(0, 900)), {{"endpoint_id", "fal-ai/flux/dev"}});
        fal["dynamic_properties"] = QJsonObject{{"prompt", "a cat"}};
        fal["dynamic_inputs"] = QJsonObject{{"prompt", QJsonObject{{"type", "str"}}}};
        const auto kie = withUi(partTwoNode("kie", "kie.dynamic_schema.KieAI", QPointF(320, 900)), {{"model_id", "veo3"}});
        const auto replicate = withUi(partTwoNode("replicate", "replicate.DynamicReplicate", QPointF(640, 900)),
                                      {{"model_id", "runwayml/gen-4.5"}});
        WorkflowGraphModel model;
        model.project(withNodes({fal, partTwoNode("empty", "fal.DynamicFal", QPointF(960, 900)), kie, replicate}), allMetadata());
        const auto id = [&model](const QString &resource) {
            for (const auto node : model.allNodeIds()) {
                if (model.resourceId(node) == resource) { return node; }
            }
            return QtNodes::InvalidNodeId;
        };
        const auto labels = [&model](QtNodes::NodeId node) {
            QStringList texts;
            for (const auto &row : model.layout(node).rows) {
                if (row.kind == NodeRowKind::Label && !row.rect.isEmpty()) { texts.append(row.label); }
            }
            return texts;
        };
        const auto &card = model.layout(id("fal"));
        QCOMPARE(card.title, QStringLiteral("FAL Dynamic · flux/dev"));
        QCOMPARE(card.accent, QColor(QStringLiteral("#8B5CF6")));
        QCOMPARE(labels(id("fal")), QStringList{QStringLiteral("fal.ai · fal-ai/flux/dev")});
        // The footer is the last row, above the bottom border, after a 1 px divider.
        const auto &footer = card.rows.last();
        QCOMPARE(footer.label, QStringLiteral("fal.ai · fal-ai/flux/dev"));
        QVERIFY(footer.rect.bottom() <= card.size.height() - 1);
        QVERIFY(footer.checked);
        // An empty node explains what to do first and keeps the 120 px content minimum.
        const auto &empty = model.layout(id("empty"));
        QCOMPARE(empty.title, QStringLiteral("FAL Dynamic"));
        QCOMPARE(labels(id("empty")), (QStringList{QStringLiteral("Run any model on fal.ai."),
                                                   QStringLiteral("Paste the llms.txt from a fal.ai model page into the model_info field."),
                                                   QStringLiteral("fal.ai")}));
        QVERIFY(empty.size.height() >= 1 + 24 + 120 + 1);
        QCOMPARE(empty.minimumSize.height(), empty.size.height());
        QCOMPARE(model.layout(id("kie")).title, QStringLiteral("Kie AI · veo3"));
        QCOMPARE(model.layout(id("kie")).accent, QColor(QStringLiteral("#E55C20")));
        QVERIFY(labels(id("kie")).contains(QStringLiteral("kie.ai · veo3")));
        QCOMPARE(model.layout(id("replicate")).title, QStringLiteral("Replicate · runwayml/gen-4.5"));
        QCOMPARE(model.layout(id("replicate")).accent, QColor(QStringLiteral("#3D6CEB")));
        QVERIFY(labels(id("replicate")).contains(QStringLiteral("replicate · runwayml/gen-4.5")));
        QVERIFY(labels(id("replicate")).contains(QStringLiteral("Run any model on replicate.com.")));
    }

    // ModelProperty.tsx: a model constant shows its label and the model button.
    // An empty one reads as the type's placeholder, as ModelSelectButton does.
    void modelConstantsShowTheirModelChip() {
        const QList<QPair<QString, QString>> cases{{"ASRModelConstant", "Select model"}, {"EmbeddingModelConstant", "Select model"},
                                                   {"ImageModelConstant", "Select image model"}, {"LanguageModelConstant", "Select model"},
                                                   {"TTSModelConstant", "Select TTS model"}, {"VideoModelConstant", "Select model"}};
        QJsonArray nodes;
        for (int i = 0; i < cases.size(); ++i) {
            nodes.append(constantNode(cases[i].first, {}, QPointF(320 * i, 900)));
        }
        nodes.append(partTwoNode("chosen", "nodetool.constant.LanguageModelConstant", QPointF(0, 1200),
                                 {{"value", QJsonObject{{"type", "language_model"}, {"provider", "openai"}, {"id", "gpt-4o"}, {"name", "GPT-4o"}}}}));
        Host host(withNodes(nodes), constantsCatalog());
        for (const auto &entry : cases) {
            const auto resource = entry.first.toLower();
            const auto *chip = host.row(resource, NodeRowKind::ModelChip, "value");
            QVERIFY2(chip, qPrintable(entry.first));
            QCOMPARE(chip->label, QStringLiteral("Value"));
            QVERIFY(!chip->bare);
            QVERIFY(chip->placeholder);
            QCOMPARE(chip->value, entry.second);
            const auto &card = host.model().layout(host.id(resource));
            QCOMPARE(chip->rect.height(), double(node_metrics::modelChipHeight));
            QVERIFY(chip->rect.bottom() < card.size.height());
            // The label row sits right above the chip, as the web's label and button.
            QCOMPARE(chip->rect.top() - chip->y, double(node_metrics::rowHeight));
        }
        const auto *chosen = host.row("chosen", NodeRowKind::ModelChip, "value");
        QVERIFY(chosen);
        QVERIFY(!chosen->placeholder);
        QCOMPARE(chosen->value, QStringLiteral("GPT-4o"));
        QCOMPARE(chosen->typeName, QStringLiteral("OpenAI"));
    }

    void modelConstantEditsThroughTheSharedPickerInOneStep() {
        Server server;
        Host host(withNodes({constantNode("LanguageModelConstant", {}, QPointF(0, 900))}), constantsCatalog());
        emit host.window.session()->credentialsChanged(server.url(), QStringLiteral("card-token"), QStringLiteral("1"));
        settle();
        // The shared picker seeds an empty model field with its default first.
        QTRY_VERIFY(host.data("languagemodelconstant").contains("value"));
        const auto seeded = host.data("languagemodelconstant").value("value");
        const auto undo = host.undoCount();
        const auto *chip = host.row("languagemodelconstant", NodeRowKind::ModelChip, "value");
        QVERIFY(chip);
        host.click("languagemodelconstant", chip->rect.center());
        auto *overlay = host.overlay();
        QVERIFY(overlay);
        QTRY_VERIFY(find(overlay->rootObject(), QStringLiteral("inline-model")));
        QQuickItem *choice = nullptr;
        QTRY_VERIFY_WITH_TIMEOUT((choice = find(overlay->quickWindow()->contentItem(), QStringLiteral("choose_openai_gpt-4.1-mini"))) != nullptr, 10000);
        QTest::mouseClick(overlay->quickWindow(), Qt::LeftButton, Qt::NoModifier,
                          choice->mapToScene(QPointF(choice->width() / 2, choice->height() / 2)).toPoint());
        QTRY_COMPARE(host.data("languagemodelconstant")["value"].toObject()["id"].toString(), QStringLiteral("gpt-4.1-mini"));
        chip = host.row("languagemodelconstant", NodeRowKind::ModelChip, "value");
        QCOMPARE(chip->value, QStringLiteral("gpt-4.1-mini"));
        QCOMPARE(chip->typeName, QStringLiteral("OpenAI"));
        QCOMPARE(host.undoCount(), undo + 1);
        host.window.document()->undo();
        QCOMPARE(host.data("languagemodelconstant").value("value"), seeded);
    }

    // SelectProperty.tsx: the Select constant is a dropdown of its own options
    // with a "Select…" placeholder, not a free text area.
    void selectConstantIsADropdownOfItsOptions() {
        const auto options = QJsonArray{"a", "b", "c"};
        Host host(withNodes({partTwoNode("picked", "nodetool.constant.Select", QPointF(0, 900), {{"value", "a"}, {"options", options}}),
                             partTwoNode("empty", "nodetool.constant.Select", QPointF(320, 900), {{"value", ""}, {"options", options}}),
                             partTwoNode("bare", "nodetool.constant.Select", QPointF(640, 900))}),
                  constantsCatalog());
        const auto *picked = host.row("picked", NodeRowKind::Field, "value");
        QVERIFY(picked);
        QVERIFY(picked->choice);
        QCOMPARE(picked->label, QStringLiteral("Value"));
        QCOMPARE(picked->value, QStringLiteral("a"));
        QVERIFY(!picked->placeholder);
        const auto *empty = host.row("empty", NodeRowKind::Field, "value");
        QVERIFY(empty);
        QVERIFY(empty->choice);
        QCOMPARE(empty->value, QStringLiteral("Select\u2026"));
        QVERIFY(empty->placeholder);
        const auto *bare = host.row("bare", NodeRowKind::Field, "value");
        QVERIFY(bare);
        QVERIFY(bare->choice);
        QCOMPARE(bare->height, double(node_metrics::fieldHeight));
        const auto undo = host.undoCount();
        host.click("picked", host.model().inlineFieldRect(host.id("picked"), "value").center());
        auto *overlay = host.overlay();
        QVERIFY(overlay);
        QTRY_VERIFY(find(overlay->rootObject(), QStringLiteral("inline-choice")));
        QTest::keyClick(overlay, Qt::Key_Down);
        QTest::keyClick(overlay, Qt::Key_Return);
        QTRY_COMPARE(host.data("picked")["value"].toString(), QStringLiteral("b"));
        QCOMPARE(host.undoCount(), undo + 1);
        QCOMPARE(host.data("picked")["options"].toArray(), options);
        host.window.document()->undo();
        QCOMPARE(host.data("picked")["value"].toString(), QStringLiteral("a"));
    }

    // ListProperty.tsx and DictProperty.tsx: the constant List and Dict lead
    // with a "Data type" select, then the table.
    void listAndDictConstantsLeadWithADataTypeSelect() {
        const QList<std::tuple<QString, QString, QJsonValue, QString>> cases{
            {"list", "nodetool.constant.List", QJsonArray{1, 2}, "int"}, {"floats", "nodetool.constant.List", QJsonArray{1.5}, "float"},
            {"strings", "nodetool.constant.List", QJsonArray{"a"}, "string"}, {"none", "nodetool.constant.List", QJsonArray{}, "string"},
            {"counts", "nodetool.constant.Dict", QJsonObject{{"a", 1}}, "int"}, {"names", "nodetool.constant.Dict", QJsonObject{{"a", "x"}}, "string"}};
        QJsonArray nodes;
        for (int i = 0; i < cases.size(); ++i) {
            nodes.append(partTwoNode(std::get<0>(cases[i]), std::get<1>(cases[i]), QPointF(320 * i, 900), {{"value", std::get<2>(cases[i])}}));
        }
        Host host(withNodes(nodes), constantsCatalog());
        for (const auto &entry : cases) {
            const auto resource = std::get<0>(entry);
            const NodeRow *select = nullptr;
            for (const auto &row : host.model().layout(host.id(resource)).rows) {
                if (row.label == QStringLiteral("Data type")) { select = &row; }
            }
            QVERIFY2(select, qPrintable(resource));
            QCOMPARE(select->kind, NodeRowKind::Field);
            QVERIFY(select->choice);
            QCOMPARE(select->value, std::get<3>(entry));
            const auto *table = host.row(resource, NodeRowKind::Multiline, "value");
            QVERIFY(table);
            QVERIFY(table->bare);
            QCOMPARE(table->fieldY, select->fieldY + select->height + node_metrics::inlineRowGap);
            QVERIFY(table->fieldY + table->height < host.model().layout(host.id(resource)).size.height());
        }
    }

    // JSONProperty.tsx stores the text in `data` and shows an empty editor
    // for an unset value. StringListProperty.tsx prompts "Enter values…".
    void jsonAndTextListConstantsShowTheirText() {
        Host host(withNodes({partTwoNode("json", "nodetool.constant.JSON", QPointF(0, 900), {{"value", QJsonObject{{"type", "json"}, {"data", "{\"a\":1}"}}}}),
                             partTwoNode("emptyjson", "nodetool.constant.JSON", QPointF(320, 900)),
                             partTwoNode("tags", "nodetool.constant.TextList", QPointF(640, 900), {{"value", QJsonArray{"one", "two"}}}),
                             partTwoNode("notags", "nodetool.constant.TextList", QPointF(960, 900))}),
                  constantsCatalog());
        const auto *json = host.row("json", NodeRowKind::Multiline, "value");
        QVERIFY(json);
        QCOMPARE(json->value, QStringLiteral("{\"a\":1}"));
        QVERIFY(!json->placeholder);
        const auto *emptyJson = host.row("emptyjson", NodeRowKind::Multiline, "value");
        QVERIFY(emptyJson);
        QVERIFY(emptyJson->value.isEmpty());
        QVERIFY(!emptyJson->placeholder);
        QCOMPARE(host.row("tags", NodeRowKind::Multiline, "value")->value, QStringLiteral("one, two"));
        const auto *none = host.row("notags", NodeRowKind::Multiline, "value");
        QVERIFY(none);
        QCOMPARE(none->value, QStringLiteral("Enter values\u2026"));
        QVERIFY(none->placeholder);
    }

    // ImageSizeProperty.tsx: a label, W and H number boxes with the swap, lock
    // and presets buttons, and the matched preset's name under them.
    void imageSizeConstantShowsItsDimensionsAndPreset() {
        Host host(withNodes({partTwoNode("hd", "nodetool.constant.ImageSize", QPointF(0, 900), {{"value", QJsonObject{{"width", 1920}, {"height", 1080}}}}),
                             partTwoNode("default", "nodetool.constant.ImageSize", QPointF(320, 900))}),
                  constantsCatalog());
        const auto *hd = host.row("hd", NodeRowKind::ImageSize, "value");
        QVERIFY(hd);
        QCOMPARE(hd->label, QStringLiteral("Value"));
        QCOMPARE(hd->options, (QStringList{QStringLiteral("W"), QStringLiteral("H")}));
        QCOMPARE(hd->optionValues, (QVariantList{1920, 1080}));
        QCOMPARE(hd->parts.size(), 2);
        QCOMPARE(hd->rect.height(), double(node_metrics::controlHeight));
        QVERIFY(hd->parts[0].right() < hd->parts[1].left());
        QCOMPARE(hd->value, QStringLiteral("1080p Full HD 16:9"));
        const auto &card = host.model().layout(host.id("hd"));
        QVERIFY(hd->rect.bottom() < card.size.height());
        // The default 1024 by 1024 matches no preset and shows no caption.
        const auto *plain = host.row("default", NodeRowKind::ImageSize, "value");
        QVERIFY(plain);
        QCOMPARE(plain->optionValues, (QVariantList{1024, 1024}));
        QVERIFY(plain->value.isEmpty());
        QVERIFY(host.model().layout(host.id("default")).size.height() < card.size.height());
    }

    void imageSizeEditsInPlaceWithOneUndoStepEach() {
        Host host(withNodes({partTwoNode("hd", "nodetool.constant.ImageSize", QPointF(0, 900), {{"value", QJsonObject{{"width", 1920}, {"height", 1080}}}})}),
                  constantsCatalog());
        const auto undo = host.undoCount();
        host.click("hd", host.row("hd", NodeRowKind::ImageSize, "value")->rect.center());
        auto *overlay = host.overlay();
        QVERIFY(overlay);
        QQuickItem *width = nullptr;
        QTRY_VERIFY((width = find(overlay->rootObject(), QStringLiteral("image-width-value"))) != nullptr);
        QTest::mouseClick(overlay->quickWindow(), Qt::LeftButton, Qt::NoModifier, width->mapToScene(QPointF(width->width() / 2, width->height() / 2)).toPoint());
        QTest::keyClick(overlay->quickWindow(), Qt::Key_A, Qt::ControlModifier);
        type(overlay, QStringLiteral("640"));
        QTest::keyClick(overlay->quickWindow(), Qt::Key_Return);
        QTRY_COMPARE(host.data("hd")["value"].toObject()["width"].toInt(), 640);
        QCOMPARE(host.data("hd")["value"].toObject()["height"].toInt(), 1080);
        QCOMPARE(host.undoCount(), undo + 1);
        // The painted boxes follow the edit.
        QCOMPARE(host.row("hd", NodeRowKind::ImageSize, "value")->optionValues, (QVariantList{640, 1080}));
        QVERIFY(host.row("hd", NodeRowKind::ImageSize, "value")->value.isEmpty());
        host.window.document()->undo();
        QCOMPARE(host.data("hd")["value"].toObject()["width"].toInt(), 1920);
    }

    // DataframeProperty.tsx has no label: an Add column button, a drop zone,
    // and for a filled frame its columns and a table.
    void dataFrameConstantShowsItsButtonDropZoneAndColumns() {
        const auto frame = QJsonObject{{"type", "dataframe"},
                                       {"columns", QJsonArray{QJsonObject{{"name", "a"}, {"data_type", "int"}}, QJsonObject{{"name", "b"}, {"data_type", "string"}}}},
                                       {"data", QJsonArray{QJsonArray{1, "x"}, QJsonArray{2, "y"}}}};
        Host host(withNodes({partTwoNode("empty", "nodetool.constant.DataFrame", QPointF(0, 900)),
                             partTwoNode("filled", "nodetool.constant.DataFrame", QPointF(320, 900), {{"value", frame}})}),
                  constantsCatalog());
        const auto *add = host.row("empty", NodeRowKind::Action, "addColumn");
        QVERIFY(add);
        QCOMPARE(add->label, QStringLiteral("Add column"));
        const auto *zone = host.row("empty", NodeRowKind::DropZone, "value");
        QVERIFY(zone);
        QVERIFY(zone->label.isEmpty());
        QCOMPARE(zone->typeName, QStringLiteral("dataframe"));
        QCOMPARE(zone->value, QStringLiteral("DROP CSV OR EXCEL FILE"));
        QCOMPARE(zone->options, QStringList{QStringLiteral("Supported: CSV, XLSX, XLS")});
        QVERIFY(zone->rect.top() > add->rect.bottom());
        QVERIFY(!host.row("empty", NodeRowKind::Multiline));
        const auto &emptyCard = host.model().layout(host.id("empty"));
        QVERIFY(zone->rect.bottom() < emptyCard.size.height());
        const auto *table = host.row("filled", NodeRowKind::Multiline);
        QVERIFY(table);
        QVERIFY(table->propertyName.isEmpty());
        QVERIFY(table->value.contains(QStringLiteral("a (int)")));
        QVERIFY(table->value.contains(QStringLiteral("b (string)")));
        QVERIFY(table->value.contains(QStringLiteral("2 | y")));
        QVERIFY(host.model().layout(host.id("filled")).size.height() > emptyCard.size.height());
    }

    void dataFrameAddColumnIsOneUndoStep() {
        Host host(withNodes({partTwoNode("frame", "nodetool.constant.DataFrame", QPointF(0, 900))}), constantsCatalog());
        const auto undo = host.undoCount();
        host.click("frame", host.row("frame", NodeRowKind::Action, "addColumn")->rect.center());
        QTRY_COMPARE(host.undoCount(), undo + 1);
        auto columns = host.data("frame")["value"].toObject()["columns"].toArray();
        QCOMPARE(columns.size(), 1);
        QCOMPARE(columns[0].toObject()["name"].toString(), QStringLiteral("Column 1"));
        QCOMPARE(columns[0].toObject()["data_type"].toString(), QStringLiteral("string"));
        QCOMPARE(host.data("frame")["value"].toObject()["type"].toString(), QStringLiteral("dataframe"));
        host.click("frame", host.row("frame", NodeRowKind::Action, "addColumn")->rect.center());
        QTRY_COMPARE(host.undoCount(), undo + 2);
        QCOMPARE(host.data("frame")["value"].toObject()["columns"].toArray()[1].toObject()["name"].toString(), QStringLiteral("Column 2"));
        host.window.document()->undo();
        QCOMPARE(host.data("frame")["value"].toObject()["columns"].toArray().size(), 1);
        host.window.document()->undo();
        QVERIFY(!host.data("frame").contains("value"));
    }

    void dataFrameDropZoneTakesACsvFile() {
        Server server;
        Host host(withNodes({partTwoNode("frame", "nodetool.constant.DataFrame", QPointF(0, 900))}), constantsCatalog());
        emit host.window.session()->credentialsChanged(server.url(), QStringLiteral("card-token"), QStringLiteral("1"));
        settle();
        const auto *zone = host.row("frame", NodeRowKind::DropZone, "value");
        QVERIFY(zone);
        QTemporaryDir directory;
        const auto path = directory.filePath(QStringLiteral("people.csv"));
        QFile file(path);
        QVERIFY(file.open(QIODevice::WriteOnly));
        file.write("name,age\nAda,36\nGrace,45\n");
        file.close();
        QMimeData mime;
        mime.setUrls({QUrl::fromLocalFile(path)});
        const QPointF position(host.point("frame", zone->rect.center()));
        QDragEnterEvent enter(position, Qt::CopyAction, &mime, Qt::LeftButton, Qt::NoModifier);
        QApplication::sendEvent(host.view->viewport(), &enter);
        QDropEvent drop(position, Qt::CopyAction, &mime, Qt::LeftButton, Qt::NoModifier);
        QApplication::sendEvent(host.view->viewport(), &drop);
        QVERIFY(drop.isAccepted());
        QTRY_VERIFY_WITH_TIMEOUT(host.data("frame")["value"].toObject()["columns"].toArray().size() == 2, 10000);
        const auto value = host.data("frame")["value"].toObject();
        QCOMPARE(value["data"].toArray().size(), 2);
        QCOMPARE(host.undoCount(), 1);
        QVERIFY(host.row("frame", NodeRowKind::Multiline)->value.contains(QStringLiteral("name (string)")));
    }

    // DocumentPickerProperty.tsx: a label, then the document select with the
    // open-in-editor button beside it.
    void documentConstantsShowASelectAndAnOpenButton() {
        const QList<std::tuple<QString, QString, QString>> cases{{"Script", "script", "document"}, {"Sketch", "sketch", "brush"},
                                                                 {"Storyboard", "storyboard", "viewCarousel"}, {"Timeline", "timeline", "movie"}};
        QJsonArray nodes;
        for (int i = 0; i < cases.size(); ++i) {
            const auto &[name, kind, icon] = cases[i];
            nodes.append(constantNode(name, {}, QPointF(320 * i, 900)));
            nodes.append(partTwoNode(QStringLiteral("set%1").arg(name.toLower()), QStringLiteral("nodetool.constant.") + name, QPointF(320 * i, 1200),
                                     {{"value", QJsonObject{{"type", kind}, {"id", "doc-1"}}}}));
        }
        Host host(withNodes(nodes), constantsCatalog());
        for (const auto &[name, kind, icon] : cases) {
            const auto resource = name.toLower();
            const NodeRow *caption = nullptr;
            for (const auto &row : host.model().layout(host.id(resource)).rows) {
                if (row.kind == NodeRowKind::Label && row.label == QStringLiteral("Value")) { caption = &row; }
            }
            QVERIFY2(caption, qPrintable(name));
            const auto *select = host.row(resource, NodeRowKind::Field, "value");
            QVERIFY(select);
            QVERIFY(select->choice);
            QVERIFY(select->bare);
            QVERIFY(select->value.isEmpty());
            QVERIFY(select->rect.top() >= caption->rect.bottom());
            QCOMPARE(select->rect.height(), double(node_metrics::fieldHeight));
            const auto *open = host.row(resource, NodeRowKind::Action, "openDocument");
            QVERIFY(open);
            QCOMPARE(open->icon, icon);
            QCOMPARE(open->value, kind);
            QVERIFY(open->rect.left() > select->rect.right());
            QCOMPARE(open->rect.center().y(), select->rect.center().y());
            QVERIFY(open->rect.right() <= host.model().layout(host.id(resource)).size.width());
            // A chosen document reads as its name, or as untitled until the card knows it.
            const auto *chosen = host.row(QStringLiteral("set") + resource, NodeRowKind::Field, "value");
            QVERIFY(chosen);
            QCOMPARE(chosen->value, kind == "timeline" ? QStringLiteral("Untitled video") : QStringLiteral("Untitled %1").arg(kind));
        }
        // The open button asks the window to open the chosen document.
        QSignalSpy opened(host.window.scene(), &EditorScene::documentOpenRequested);
        host.click("settimeline", host.row("settimeline", NodeRowKind::Action, "openDocument")->rect.center());
        QCOMPARE(opened.count(), 1);
        QCOMPARE(opened.first().at(0).toString(), QStringLiteral("timeline"));
        QCOMPARE(opened.first().at(1).toString(), QStringLiteral("doc-1"));
        // An empty select has nothing to open.
        host.click("timeline", host.row("timeline", NodeRowKind::Action, "openDocument")->rect.center());
        QCOMPARE(opened.count(), 1);
    }

    void documentConstantSelectOpensTheSharedPicker() {
        Host host(withNodes({constantNode("Timeline", {}, QPointF(0, 900))}), constantsCatalog());
        const auto undo = host.undoCount();
        host.click("timeline", host.row("timeline", NodeRowKind::Field, "value")->rect.center());
        auto *overlay = host.overlay();
        QVERIFY(overlay);
        QTRY_VERIFY(find(overlay->rootObject(), QStringLiteral("document-select")));
        // The card's own button opens the document, so the overlay offers only the select.
        QVERIFY(!find(overlay->rootObject(), QStringLiteral("document-open")));
        QCOMPARE(host.undoCount(), undo);
    }

    // EntityProperty.tsx: a label, then a chip for the value. An unnamed entity reads "Untitled".
    void entityConstantShowsItsChip() {
        Host host(withNodes({constantNode("Entity", {}, QPointF(0, 900)),
                             partTwoNode("hero", "nodetool.constant.Entity", QPointF(320, 900),
                                         {{"value", QJsonObject{{"type", "entity"}, {"id", "e1"}, {"kind", "character"}, {"name", "Hero"}, {"descriptor", ""}}}})}),
                  constantsCatalog());
        const auto *chip = host.row("entity", NodeRowKind::Action, "entityChip");
        QVERIFY(chip);
        QCOMPARE(chip->label, QStringLiteral("Untitled"));
        QCOMPARE(host.row("hero", NodeRowKind::Action, "entityChip")->label, QStringLiteral("Hero"));
        QVERIFY(chip->rect.bottom() < host.model().layout(host.id("entity")).size.height());
    }

    // PropertyDropzone.tsx and Model3DProperty.tsx: the Document constant is a bare drop zone,
    // the Model 3D constant a labelled one.
    void documentAndModelConstantsShowADropZone() {
        Host host(withNodes({constantNode("Document", {}, QPointF(0, 900)), constantNode("Model3D", {}, QPointF(320, 900)),
                             partTwoNode("named", "nodetool.constant.Document", QPointF(640, 900),
                                         {{"value", QJsonObject{{"type", "document"}, {"uri", "https://example.com/files/report.pdf"}}}})}),
                  constantsCatalog());
        const auto *document = host.row("document", NodeRowKind::DropZone, "value");
        QVERIFY(document);
        QVERIFY(document->label.isEmpty());
        QCOMPARE(document->typeName, QStringLiteral("document"));
        QCOMPARE(document->value, QStringLiteral("CLICK OR DROP DOCUMENT"));
        QVERIFY(document->placeholder);
        const auto *named = host.row("named", NodeRowKind::DropZone, "value");
        QVERIFY(named);
        QCOMPARE(named->value, QStringLiteral("report.pdf"));
        QVERIFY(!named->placeholder);
        const auto *model = host.row("model3d", NodeRowKind::DropZone, "value");
        QVERIFY(model);
        QCOMPARE(model->label, QStringLiteral("Value"));
        QCOMPARE(model->typeName, QStringLiteral("model_3d"));
        QCOMPARE(model->value, QStringLiteral("DROP 3D MODEL (GLB, GLTF)"));
        QVERIFY(model->rect.bottom() < host.model().layout(host.id("model3d")).size.height());
    }

    // Writes every constant card in both themes for visual review, kept outside the repository.
    void captureConstantCards() {
        const auto directory = qEnvironmentVariable("NODETOOL_CARD_BODY_CAPTURE_DIR");
        if (directory.isEmpty()) {
            QSKIP("Set NODETOOL_CARD_BODY_CAPTURE_DIR to write card captures.");
        }
        QJsonArray nodes;
        QStringList names;
        for (const auto &entry : constantCatalog()) {
            names.append(entry.toObject()["node_type"].toString().section('.', -1));
        }
        for (int i = 0; i < names.size(); ++i) {
            nodes.append(constantNode(names[i], {}, QPointF(300 * (i % 6), 700 + 360 * (i / 6))));
        }
        Host host(withNodes(nodes), constantsCatalog());
        QDir().mkpath(directory);
        for (const auto dark : {true, false}) {
            host.window.setDarkTheme(dark);
            settle();
            const auto theme = dark ? QStringLiteral("dark") : QStringLiteral("light");
            for (const auto &name : names) {
                QVERIFY(host.render(name.toLower()).save(QStringLiteral("%1/constant-%2-%3.png").arg(directory, name, theme)));
            }
        }
    }
};

QTEST_MAIN(CardBodiesTest)
#include "CardBodiesTest.moc"
