#include "graph/EditorScene.h"
#include "graph/WorkflowGraphModel.h"
#include "ui/EditorWindow.h"
#include "ui/InspectorClearance.h"
#include <QDockWidget>
#include <QGraphicsView>
#include <QPainter>
#include <QQmlEngine>
#include <QQuickWidget>
#include <QScrollBar>
#include <QVariantAnimation>
#include <QtNodes/internal/ConnectionGraphicsObject.hpp>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QtTest>
#include <algorithm>
#include <cmath>

using namespace nodetool;

// The web fades every node and wire off the selected branch to 0.2 and keeps
// the zoom when a node is selected. Selection dims through item opacity, so
// these tests read both the item opacity and the rendered pixels.
//   web/src/styles/nodes.zoomed.css           .branch-dimmed 0.2, .branch-related 1
//   web/src/components/node/reactFlowGraphModel.ts   branchNodeIds, markComprehensionEdges
//   web/src/hooks/useClearInspectorOverlap.ts        the only viewport move on select
class SelectionPresentationTest final : public QObject {
    Q_OBJECT

private:
    static QJsonObject placedNode(const QString &id, double x, double y) {
        return {{"id", id}, {"type", "t"},
                {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", x}, {"y", y}}}}}};
    }

    static QJsonObject edge(const QString &from, const QString &to) {
        return {{"id", from + to}, {"source", from}, {"target", to},
                {"sourceHandle", "out"}, {"targetHandle", "in"}};
    }

    // up -> a -> d1 -> d2 is the branch of a. s hangs off up, so it is adjacent
    // to the branch but not on it. u1 -> u2 and l are unrelated.
    static void load(EditorWindow &window, double column, bool extras = false) {
        const auto text = QJsonObject{{"type", "str"}};
        window.setCatalog({QJsonObject{{"node_type", "t"}, {"title", "T"}, {"input_fields", QJsonArray{"in"}},
            {"properties", QJsonArray{QJsonObject{{"name", "in"}, {"type", text}}}},
            {"outputs", QJsonArray{QJsonObject{{"name", "out"}, {"type", text}}}}}});
        QJsonArray nodes{placedNode("up", 0, 0), placedNode("a", column, 0), placedNode("d1", 2 * column, 0),
                         placedNode("d2", 2 * column, 160), placedNode("s", 0, 160),
                         placedNode("u1", 0, 320), placedNode("u2", column, 320), placedNode("l", 2 * column, 320)};
        if (extras) {
            nodes.append(QJsonObject{{"id", "note"}, {"type", "nodetool.workflows.base_node.Comment"},
                {"data", QJsonObject{{"comment", "note"}}},
                {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 0}, {"y", 480}}}, {"width", 160}, {"height", 90}}}});
            nodes.append(QJsonObject{{"id", "frame"}, {"type", "nodetool.workflows.base_node.Group"},
                {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", column}, {"y", 480}}}, {"width", 200}, {"height", 120}}}});
        }
        QJsonArray edges{edge("up", "a"), edge("a", "d1"), edge("d1", "d2"), edge("up", "s"), edge("u1", "u2")};
        QVERIFY(window.document()->load(QJsonObject{{"graph", QJsonObject{{"nodes", nodes}, {"edges", edges}}}}).ok);
        window.resize(1440, 900);
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        QTest::qWait(80);
    }

    static QGraphicsView *viewOf(EditorWindow &window) {
        return window.findChild<QGraphicsView *>();
    }

    static WorkflowGraphModel *modelOf(EditorWindow &window) {
        return window.findChild<WorkflowGraphModel *>();
    }

    static QtNodes::NodeId idOf(EditorWindow &window, const QString &resource) {
        for (const auto id : modelOf(window)->allNodeIds()) {
            if (modelOf(window)->resourceId(id) == resource) {
                return id;
            }
        }
        return QtNodes::InvalidNodeId;
    }

    static QtNodes::NodeGraphicsObject *itemOf(EditorWindow &window, const QString &resource) {
        return window.scene()->nodeGraphicsObject(idOf(window, resource));
    }

    static QtNodes::ConnectionGraphicsObject *wireOf(EditorWindow &window, const QString &from, const QString &to) {
        for (auto item : window.scene()->items()) {
            auto wire = qgraphicsitem_cast<QtNodes::ConnectionGraphicsObject *>(item);
            if (wire && !wire->connectionState().requiresPort()
                && modelOf(window)->resourceId(wire->connectionId().outNodeId) == from
                && modelOf(window)->resourceId(wire->connectionId().inNodeId) == to) {
                return wire;
            }
        }
        return nullptr;
    }

    static QRectF cardRect(EditorWindow &window, const QString &resource) {
        const auto id = idOf(window, resource);
        return itemOf(window, resource)->mapRectToScene(QRectF(QPointF(), QSizeF(modelOf(window)->layout(id).size)));
    }

    // A point on the card's header, clear of the inline fields and the overlays.
    static QPoint headerPoint(EditorWindow &window, const QString &resource) {
        const auto rect = cardRect(window, resource);
        return viewOf(window)->mapFromScene(QPointF(rect.center().x(), rect.top() + 12));
    }

    static void click(EditorWindow &window, const QString &resource, Qt::KeyboardModifiers modifiers = Qt::NoModifier) {
        const auto point = headerPoint(window, resource);
        QVERIFY2(viewOf(window)->viewport()->rect().contains(point), qPrintable(resource));
        QTest::mouseClick(viewOf(window)->viewport(), Qt::LeftButton, modifiers, point);
        QTest::qWait(40);
    }

    static void clickEmptyCanvas(EditorWindow &window) {
        QTest::mouseClick(viewOf(window)->viewport(), Qt::LeftButton, Qt::NoModifier, QPoint(24, 450));
        QTest::qWait(40);
    }

    static QImage renderRegion(EditorWindow &window, const QRectF &source, int scale = 1) {
        QImage image((source.size() * scale).toSize(), QImage::Format_ARGB32_Premultiplied);
        image.fill(Qt::transparent);
        QPainter painter(&image);
        window.scene()->render(&painter, QRectF(QPointF(), QSizeF(image.size())), source);
        return image;
    }

    // Mean per-channel distance from the canvas color. A card faded to 0.2 over
    // the canvas keeps one fifth of its distance.
    static double ink(const QImage &image, const QColor &canvas) {
        double total = 0;
        for (int y = 0; y < image.height(); ++y) {
            for (int x = 0; x < image.width(); ++x) {
                const auto pixel = image.pixelColor(x, y);
                total += std::abs(pixel.red() - canvas.red()) + std::abs(pixel.green() - canvas.green())
                    + std::abs(pixel.blue() - canvas.blue());
            }
        }
        return total / (double(image.width()) * image.height());
    }

    static double cardInk(EditorWindow &window, const QString &resource) {
        return ink(renderRegion(window, cardRect(window, resource)), window.scene()->theme().canvas);
    }

    static QDockWidget *inspectorDock(EditorWindow &window) {
        for (auto dock : window.findChildren<QDockWidget *>()) {
            if (dock->windowTitle() == QObject::tr("Inspector")) {
                return dock;
            }
        }
        return nullptr;
    }

    static void setReducedMotion(EditorWindow &window, bool reduced) {
        auto widgets = window.findChildren<QQuickWidget *>();
        QVERIFY(!widgets.isEmpty());
        auto theme = widgets.first()->engine()->singletonInstance<QObject *>("NodeTool.UiPrimitives", "Theme");
        QVERIFY(theme);
        theme->setProperty("reducedMotion", reduced);
        QTest::qWait(40);
    }

    static void expectOpacity(EditorWindow &window, const QStringList &full, const QStringList &faded) {
        for (const auto &id : full) {
            QCOMPARE(itemOf(window, id)->opacity(), 1.0);
        }
        for (const auto &id : faded) {
            QCOMPARE(itemOf(window, id)->opacity(), branchDimmedOpacity);
        }
    }

private slots:
    void initTestCase() {
        QStandardPaths::setTestModeEnabled(true);
    }

    // Selecting a node keeps the node and everything upstream or downstream of
    // it at full opacity and fades the rest to the web's 0.2. A sibling of an
    // upstream node is not on the branch.
    void unrelatedCardsAndWiresFadeToWebOpacity() {
        EditorWindow window;
        load(window, 300);
        const auto restSibling = cardInk(window, "s");
        const auto restUnrelated = cardInk(window, "u1");
        const auto restRelated = cardInk(window, "d2");
        QVERIFY(restSibling > 10);
        click(window, "a");
        QCOMPARE(window.selection(), QString("a"));
        expectOpacity(window, {"up", "a", "d1", "d2"}, {"s", "u1", "u2", "l"});
        // A wire is related when both of its ends are on the branch.
        for (const auto &wire : {std::pair{"up", "a"}, {"a", "d1"}, {"d1", "d2"}}) {
            QCOMPARE(wireOf(window, wire.first, wire.second)->opacity(), 1.0);
        }
        for (const auto &wire : {std::pair{"up", "s"}, {"u1", "u2"}}) {
            QCOMPARE(wireOf(window, wire.first, wire.second)->opacity(), branchDimmedOpacity);
        }
        // Pixels, not just the property: the card keeps a fifth of its ink.
        QVERIFY(std::abs(cardInk(window, "s") / restSibling - 0.2) < 0.04);
        QVERIFY(std::abs(cardInk(window, "u1") / restUnrelated - 0.2) < 0.04);
        QVERIFY(std::abs(cardInk(window, "d2") / restRelated - 1.0) < 0.03);
    }

    // Selecting a second node, with Ctrl, adds its own branch.
    void multiSelectionKeepsEveryBranch() {
        EditorWindow window;
        load(window, 300);
        click(window, "a");
        click(window, "u1", Qt::ControlModifier);
        QVERIFY(itemOf(window, "a")->isSelected());
        QVERIFY(itemOf(window, "u1")->isSelected());
        expectOpacity(window, {"up", "a", "d1", "d2", "u1", "u2"}, {"s", "l"});
        QCOMPARE(wireOf(window, "u1", "u2")->opacity(), 1.0);
        QCOMPARE(wireOf(window, "up", "s")->opacity(), branchDimmedOpacity);
        // Ctrl-clicking a selected node removes its branch again.
        click(window, "u1", Qt::ControlModifier);
        expectOpacity(window, {"up", "a", "d1", "d2"}, {"s", "u1", "u2", "l"});
    }

    // Clearing the selection restores every card and wire, down to the pixels.
    void deselectionRestoresFullOpacity() {
        EditorWindow window;
        load(window, 300);
        const auto rest = renderRegion(window, cardRect(window, "s"));
        click(window, "a");
        QCOMPARE(itemOf(window, "s")->opacity(), branchDimmedOpacity);
        clickEmptyCanvas(window);
        QVERIFY(window.scene()->selectedItems().isEmpty());
        for (const auto id : modelOf(window)->allNodeIds()) {
            QCOMPARE(window.scene()->nodeGraphicsObject(id)->opacity(), 1.0);
        }
        for (const auto &wire : {std::pair{"up", "a"}, {"up", "s"}, {"u1", "u2"}}) {
            QCOMPARE(wireOf(window, wire.first, wire.second)->opacity(), 1.0);
        }
        QCOMPARE(renderRegion(window, cardRect(window, "s")), rest);
    }

    // The web dims groups and notes like any other node, and a group's label
    // follows its frame.
    void groupsAndNotesFadeLikeCards() {
        EditorWindow window;
        load(window, 300, true);
        click(window, "a");
        expectOpacity(window, {"up", "a", "d1", "d2"}, {"note", "frame", "s", "u1"});
        QVERIFY(window.scene()->branchDimmed(idOf(window, "frame")));
        QVERIFY(!window.scene()->branchDimmed(idOf(window, "d1")));
        clickEmptyCanvas(window);
        expectOpacity(window, {"note", "frame", "s", "u1"}, {});
    }

    // Edits while a selection is active keep the dimming consistent. A node
    // connected into the branch joins it, and a removed wire leaves it.
    void graphEditsRefreshTheBranch() {
        EditorWindow window;
        load(window, 300);
        click(window, "a");
        QCOMPARE(itemOf(window, "l")->opacity(), branchDimmedOpacity);
        QVERIFY(window.document()->applyCommand({{"op", "addEdge"}, {"edge", edge("d2", "l")}}));
        QTRY_COMPARE(itemOf(window, "l")->opacity(), 1.0);
        QCOMPARE(wireOf(window, "d2", "l")->opacity(), 1.0);
        QVERIFY(window.document()->applyCommand({{"op", "removeEdge"}, {"id", "d1d2"}}));
        QTRY_COMPARE(itemOf(window, "d2")->opacity(), branchDimmedOpacity);
        QCOMPARE(itemOf(window, "l")->opacity(), branchDimmedOpacity);
    }

    // The web changes opacity with no transition (nodes.base.css lists no
    // opacity), so reduced motion and full motion both apply it at once.
    void dimmingIsImmediateWithAndWithoutReducedMotion() {
        for (const bool reduced : {true, false}) {
            EditorWindow window;
            load(window, 300);
            setReducedMotion(window, reduced);
            const auto point = headerPoint(window, "a");
            QTest::mousePress(viewOf(window)->viewport(), Qt::LeftButton, Qt::NoModifier, point);
            // No event-loop pass between the press and the check.
            QCOMPARE(itemOf(window, "u1")->opacity(), branchDimmedOpacity);
            QCOMPARE(itemOf(window, "d1")->opacity(), 1.0);
            QTest::mouseRelease(viewOf(window)->viewport(), Qt::LeftButton, Qt::NoModifier, point);
            setReducedMotion(window, false);
        }
    }

    // A canvas click keeps the zoom in fit mode. Fit mode used to refit the
    // graph to the narrower canvas the inspector leaves, 67 to 50 percent.
    void canvasSelectionKeepsTheZoom() {
        EditorWindow window;
        load(window, 560);
        window.fit();
        QTest::qWait(80);
        auto *view = viewOf(window);
        const auto zoom = view->transform().m11();
        QVERIFY2(zoom < 0.95, qPrintable(QString::number(zoom)));
        click(window, "a");
        QTRY_VERIFY(window.inspectorVisible());
        QTest::qWait(400);
        QCOMPARE(view->transform().m11(), zoom);
        click(window, "d1");
        QTest::qWait(300);
        QCOMPARE(view->transform().m11(), zoom);
        clickEmptyCanvas(window);
        QTest::qWait(300);
        QCOMPARE(view->transform().m11(), zoom);
    }

    // The inspector pans the canvas only when it would cover a node.
    void panIsOnlyAsNeededToClearTheInspector() {
        EditorWindow window;
        load(window, 300);
        window.action("Reset zoom");
        auto *view = viewOf(window);
        const auto place = [&](const QPointF &sceneTopLeft, const QPoint &viewPoint) {
            const auto now = view->mapFromScene(sceneTopLeft);
            view->horizontalScrollBar()->setValue(view->horizontalScrollBar()->value() + now.x() - viewPoint.x());
            view->verticalScrollBar()->setValue(view->verticalScrollBar()->value() + now.y() - viewPoint.y());
            QTest::qWait(30);
        };
        // The graph sits left of where the inspector opens, so nothing is covered.
        place(cardRect(window, "up").topLeft(), QPoint(60, 120));
        const auto before = view->mapFromScene(cardRect(window, "a").topLeft());
        click(window, "a");
        QTRY_VERIFY(window.inspectorVisible());
        QTest::qWait(400);
        QCOMPARE(view->transform().m11(), 1.0);
        QCOMPARE(view->mapFromScene(cardRect(window, "a").topLeft()), before);
        clickEmptyCanvas(window);
        QTRY_VERIFY(!window.inspectorVisible());
        QTest::qWait(100);

        // Now the rightmost column runs under the inspector.
        place(cardRect(window, "up").topLeft(), QPoint(420, 120));
        const auto selected = view->mapFromScene(cardRect(window, "a").topLeft());
        double rightmost = 0;
        for (const auto &id : {"up", "a", "d1", "d2", "s", "u1", "u2", "l"}) {
            const auto rect = view->mapFromScene(cardRect(window, id)).boundingRect();
            rightmost = std::max(rightmost, double(rect.right()));
        }
        click(window, "a");
        QTRY_VERIFY(window.inspectorVisible());
        QTest::qWait(500);
        QCOMPARE(view->transform().m11(), 1.0);
        const auto dock = inspectorDock(window);
        QVERIFY(dock);
        // Web rule: pan by the overhang past the inspector gap, never past the
        // point where the selected node's left edge is 16 px from the canvas edge.
        const double canvasWidth = view->viewport()->width() + dock->width();
        const double wanted = rightmost - (canvasWidth - dock->width() - ::node_editor::inspectorClearancePx);
        const double room = selected.x() - ::node_editor::inspectorClearancePx;
        const double expected = std::min(wanted, std::max(room, 0.0));
        QVERIFY(expected > 0);
        const auto after = view->mapFromScene(cardRect(window, "a").topLeft());
        QVERIFY2(std::abs((selected.x() - after.x()) - expected) <= 2,
                 qPrintable(QString("moved %1 expected %2").arg(selected.x() - after.x()).arg(expected)));
        QCOMPARE(after.y(), selected.y());
    }

    // The pan is animated over 200 ms, and reduced motion moves at once.
    void inspectorPanFollowsReducedMotion() {
        for (const bool reduced : {false, true}) {
            EditorWindow window;
            load(window, 300);
            window.action("Reset zoom");
            auto *view = viewOf(window);
            const auto now = view->mapFromScene(cardRect(window, "up").topLeft());
            view->horizontalScrollBar()->setValue(view->horizontalScrollBar()->value() + now.x() - 420);
            QTest::qWait(30);
            setReducedMotion(window, reduced);
            const auto start = view->mapFromScene(cardRect(window, "a").topLeft());
            click(window, "a");
            if (reduced) {
                QTRY_VERIFY(window.inspectorVisible());
                QTest::qWait(60);
                QVERIFY(!window.findChild<QVariantAnimation *>("inspector-pan-animation"));
                QVERIFY(view->mapFromScene(cardRect(window, "a").topLeft()).x() < start.x());
            } else {
                QTRY_VERIFY(window.findChild<QVariantAnimation *>("inspector-pan-animation"));
                QTRY_VERIFY(!window.findChild<QVariantAnimation *>("inspector-pan-animation"));
                QVERIFY(view->mapFromScene(cardRect(window, "a").topLeft()).x() < start.x());
            }
            setReducedMotion(window, false);
        }
    }

    // A scroll during the pan ends it. The pan never moves the view back.
    void scrollInterruptsInspectorPan() {
        EditorWindow window;
        load(window, 300);
        window.action("Reset zoom");
        auto *view = viewOf(window);
        auto *bar = view->horizontalScrollBar();
        const auto now = view->mapFromScene(cardRect(window, "up").topLeft());
        bar->setValue(bar->value() + now.x() - 420);
        QTest::qWait(30);
        setReducedMotion(window, false);
        click(window, "a");
        QTRY_VERIFY(window.findChild<QVariantAnimation *>("inspector-pan-animation"));
        const int scrolled = bar->value() - 300;
        bar->setValue(scrolled);
        QTRY_VERIFY(!window.findChild<QVariantAnimation *>("inspector-pan-animation"));
        QCOMPARE(bar->value(), scrolled);
    }

    // Hovering a wire draws it as the web does: 4 wide, full opacity, brighter.
    void hoveredWireDrawsAtFullOpacity() {
        EditorWindow window;
        load(window, 300);
        window.action("Reset zoom");
        auto *view = viewOf(window);
        auto *wire = wireOf(window, "u1", "u2");
        QVERIFY(wire);
        const auto midpoint = wire->mapToScene(wireCurve(wire->endPoint(QtNodes::PortType::Out), wire->endPoint(QtNodes::PortType::In)).pointAtPercent(0.5));
        const QRectF region(midpoint - QPointF(6, 6), QSizeF(12, 12));
        const auto luminance = [](const QImage &image) {
            double peak = 0;
            for (int y = 0; y < image.height(); ++y) {
                for (int x = 0; x < image.width(); ++x) {
                    const auto pixel = image.pixelColor(x, y);
                    peak = std::max(peak, 0.299 * pixel.red() + 0.587 * pixel.green() + 0.114 * pixel.blue());
                }
            }
            return peak;
        };
        QTest::mouseMove(view->viewport(), QPoint(24, 450));
        QTest::qWait(30);
        QVERIFY(!wire->connectionState().hovered());
        const auto rest = luminance(renderRegion(window, region, 4));
        QTest::mouseMove(view->viewport(), view->mapFromScene(midpoint));
        QTRY_VERIFY(wire->connectionState().hovered());
        const auto hovered = luminance(renderRegion(window, region, 4));
        QVERIFY2(hovered > rest * 1.4, qPrintable(QString("rest %1 hovered %2").arg(rest).arg(hovered)));
        QTest::mouseMove(view->viewport(), QPoint(24, 450));
        QTRY_VERIFY(!wire->connectionState().hovered());
    }

    // The hovered handle scales to 1.3 about its center, as the web's handle:hover.
    void hoveredHandleScalesUp() {
        EditorWindow window;
        load(window, 300);
        window.action("Reset zoom");
        auto *view = viewOf(window);
        const auto id = idOf(window, "u1");
        const auto item = itemOf(window, "u1");
        const auto handle = item->mapToScene(modelOf(window)->layout(id).size.width(), modelOf(window)->layout(id).outputY.first());
        // 4.6 px out is the node-colored ring at rest and the handle color when scaled.
        const QRectF region(handle - QPointF(10, 10), QSizeF(20, 20));
        const auto ringPixel = [&] {
            return renderRegion(window, region, 4).pixelColor(int((10 + 4.6) * 4), 40);
        };
        QTest::mouseMove(view->viewport(), QPoint(24, 450));
        QTest::qWait(30);
        QVERIFY(window.scene()->hoveredHandle().node == QtNodes::InvalidNodeId);
        const auto rest = ringPixel();
        QTest::mouseMove(view->viewport(), view->mapFromScene(handle));
        QTRY_COMPARE(window.scene()->hoveredHandle().node, id);
        QCOMPARE(window.scene()->hoveredHandle().type, QtNodes::PortType::Out);
        const auto hovered = ringPixel();
        QVERIFY2(hovered != rest, qPrintable(rest.name() + " " + hovered.name()));
        QTest::mouseMove(view->viewport(), QPoint(24, 450));
        QTRY_COMPARE(window.scene()->hoveredHandle().node, QtNodes::InvalidNodeId);
        QCOMPARE(ringPixel(), rest);
    }
};

QTEST_MAIN(SelectionPresentationTest)
#include "SelectionPresentationTest.moc"
