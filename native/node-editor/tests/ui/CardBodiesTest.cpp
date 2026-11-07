#include "graph/CardBodies.h"
#include "graph/EditorScene.h"
#include "graph/WorkflowGraphModel.h"
#include "ui/EditorWindow.h"
#include <QBuffer>
#include <QDragEnterEvent>
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
} // namespace

class CardBodiesTest final : public QObject {
    Q_OBJECT

    struct Host {
        EditorWindow window;
        QGraphicsView *view = nullptr;

        explicit Host(const QJsonObject &workflow = fixture()["workflow"].toObject()) {
            window.setDarkTheme(true);
            window.resize(1440, 900);
            window.show();
            Q_ASSERT(QTest::qWaitForWindowExposed(&window));
            window.setCatalog(fixture()["metadata"].toArray());
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
            const auto position = window.scene()->nodeGraphicsObject(id(resource))->scenePos();
            window.scene()->render(&painter, QRectF(QPointF(), QSizeF(size)), QRectF(position, QSizeF(size)));
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
        // Bespoke image region stays put inside an authored taller card.
        QCOMPARE(model.canvasResultRect(id("resize")), QRectF(19, 43, 322, 74));
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
        QCOMPARE(host.model().layout(host.id("prompt")).size.height(), before + node_metrics::handleRowStep);
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
};

QTEST_MAIN(CardBodiesTest)
#include "CardBodiesTest.moc"
