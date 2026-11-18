#include "../support/CanvasProbe.h"
#include "ui/CanvasSurface.h"
#include "graph/EditorScene.h"
#include "ui/EditorWindow.h"
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QApplication>
#include <QElapsedTimer>
#include <QFile>
#include <QJsonDocument>
#include <QScrollBar>
#include <QSet>
#include <QSettings>
#include <QTemporaryDir>
#include <QtTest>
#include <algorithm>
#include <functional>
#include <memory>

using nodetool::node_editor::WorkflowDocument;
class LargeGraphTest final : public QObject {
    Q_OBJECT
    QTemporaryDir settings_;
private slots:
    void initTestCase() {
        QVERIFY(settings_.isValid());
        QSettings::setDefaultFormat(QSettings::IniFormat);
        QSettings::setPath(QSettings::IniFormat, QSettings::UserScope, settings_.path());
    }
    void commands_data() {
        QTest::addColumn<bool>("shown");
        QTest::newRow("document") << false;
        QTest::newRow("window") << true;
    }
    void commands() {
        QFETCH(bool, shown);
        std::unique_ptr<nodetool::EditorWindow> window;
        WorkflowDocument standalone;
        auto *document = &standalone;
        if (shown) {
            window = std::make_unique<nodetool::EditorWindow>();
            window->show();
            document = window->document();
            QTest::qWait(20);
        }
        const QJsonObject type{{"type", "str"}};
        const QJsonArray catalog{QJsonObject{{"node_type", "fixture.Text"},
            {"properties", QJsonArray{QJsonObject{{"name", "in"}, {"type", type}}}},
            {"outputs", QJsonArray{QJsonObject{{"name", "out"}, {"type", type}}}}}};
        document->setNodeMetadata(catalog);
        if (window) {
            window->setCatalog(catalog);
        }
        int count = 0;
        double first = 0;
        for (const int n : {250, 500, 1000, 2000}) {
            QElapsedTimer timer;
            timer.start();
            const int added = n - count;
            while (count < n) {
                const QJsonObject node{{"id", QString::number(count)}, {"type", "fixture.Text"},
                    {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", count * 300}, {"y", 0}}}}}};
                QVERIFY(document->applyCommand({{"op", "addNode"}, {"node", node}}));
                ++count;
            }
            const double add = double(timer.nsecsElapsed()) / added / 1000;
            timer.restart();
            QCoreApplication::processEvents();
            const double projection = timer.nsecsElapsed() / 1000.0;
            timer.restart();
            QVERIFY(document->applyCommand({{"op", "addEdge"}, {"edge", QJsonObject{
                {"id", QString("e%1").arg(n)}, {"source", QString::number(n - 2)},
                {"target", QString::number(n - 1)}, {"sourceHandle", "out"}, {"targetHandle", "in"}}}}));
            const double edge = timer.nsecsElapsed() / 1000.0;
            timer.restart();
            QVERIFY(document->applyCommand({{"op", "moveNodes"}, {"positions", QJsonObject{
                {QString::number(n - 1), QJsonObject{{"x", 12}, {"y", 34}}}}}}));
            const double move = timer.nsecsElapsed() / 1000.0;
            document->undo();
            document->undo();
            timer.restart();
            document->undo();
            const double undo = timer.nsecsElapsed() / 1000.0;
            document->redo();
            qInfo().nospace() << "N=" << n << " add_us=" << add << " connect_us=" << edge
                << " move_us=" << move << " undo_add_us=" << undo << " event_loop_us=" << projection;
            if (n == 250) {
                first = add;
            }
            if (n == 2000) {
                QVERIFY2(add < first * 3, "Per-add cost grew by at least 3x");
            }
        }
        QCOMPARE(document->nodes().size(), 2000);
    }
    // Dragging a card repaints the viewport on every pointer move. The parity
    // fixture is repeated into a grid so the scene holds real card bodies and wires.
    void drag() {
        QFile file(QStringLiteral(WINDOW_PARITY_FIXTURE));
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto fixture = QJsonDocument::fromJson(file.readAll()).object();
        auto workflow = fixture["workflow"].toObject();
        const auto graph = workflow["graph"].toObject();
        QJsonArray nodes;
        QJsonArray edges;
        for (int copy = 0; copy < 6; ++copy) {
            const auto suffix = QStringLiteral("-%1").arg(copy);
            for (const auto &value : graph["nodes"].toArray()) {
                auto node = value.toObject();
                node["id"] = node["id"].toString() + suffix;
                auto ui = node["ui_properties"].toObject();
                auto position = ui["position"].toObject();
                position["y"] = position["y"].toDouble() + copy * 900;
                ui["position"] = position;
                node["ui_properties"] = ui;
                nodes.append(node);
            }
            for (const auto &value : graph["edges"].toArray()) {
                auto edge = value.toObject();
                for (const auto key : {"id", "source", "target"}) {
                    edge[key] = edge[key].toString() + suffix;
                }
                edges.append(edge);
            }
        }
        workflow["graph"] = QJsonObject{{"nodes", nodes}, {"edges", edges}};
        nodetool::EditorWindow window;
        window.resize(1440, 900);
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        // The server catalog holds about 3,400 node types, listed before the fixture's.
        QJsonArray catalog;
        for (int i = 0; i < 3400; ++i) {
            catalog.append(QJsonObject{{"node_type", QStringLiteral("filler.Node%1").arg(i)}, {"properties", QJsonArray{}}, {"outputs", QJsonArray{}}});
        }
        for (const auto &entry : fixture["metadata"].toArray()) { catalog.append(entry); }
        window.setCatalog(catalog);
        QVERIFY(window.document()->load(workflow).ok);
        QTest::qWait(50);
        window.fit();
        QTest::qWait(50);
        auto *view = &window.canvas();
        QVERIFY(view);
        auto &model = window.scene()->graphModel();
        QtNodes::NodeId target = QtNodes::InvalidNodeId;
        for (const auto id : model.allNodeIds()) {
            const auto rect = view->mapFromScene(window.canvas().nodeBounds(id));
            if (view->viewportWidget().rect().contains(rect.center())) { target = id; break; }
        }
        QVERIFY(target != QtNodes::InvalidNodeId);
        const auto rect = view->mapFromScene(window.canvas().nodeBounds(target));
        const QPoint start(rect.center().x(), rect.top() + 12);
        auto *viewport = &view->viewportWidget();
        QTest::mousePress(viewport, Qt::LeftButton, Qt::NoModifier, start);
        constexpr int moves = 400;
        QElapsedTimer timer;
        timer.start();
        for (int i = 1; i <= moves; ++i) {
            QMouseEvent move(QEvent::MouseMove, QPointF(start + QPoint(i * 3, i * 2)), viewport->mapToGlobal(QPointF(start + QPoint(i * 3, i * 2))),
                             Qt::NoButton, Qt::LeftButton, Qt::NoModifier);
            QApplication::sendEvent(viewport, &move);
            QCoreApplication::processEvents();
            viewport->repaint();
        }
        const double perMove = timer.nsecsElapsed() / 1000.0 / moves;
        QTest::mouseRelease(viewport, Qt::LeftButton, Qt::NoModifier, start + QPoint(moves * 3, moves * 2));
        qInfo().nospace() << "drag nodes=" << nodes.size() << " per_move_us=" << perMove;
        // Scanning the catalog for every handle on every bounds query took over 5 s a move.
        QVERIFY2(perMove < 100000, "A drag move took over 100 ms");
        QVERIFY(window.canvas().nodeOrigin(target) != QPointF());
    }
    // Pan and zoom over 2,000 cards: the parity fixture repeated into a grid.
    // Each step sends the input event, then paints the viewport, as drag()
    // does. The numbers are a baseline for the Quick canvas
    // (docs/plans/node-editor-quick-canvas/plan.md, Large graphs).
    void panZoom() {
        QFile file(QStringLiteral(WINDOW_PARITY_FIXTURE));
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto fixture = QJsonDocument::fromJson(file.readAll()).object();
        auto workflow = fixture["workflow"].toObject();
        const auto graph = workflow["graph"].toObject();
        constexpr int total = 2000;
        constexpr int columns = 13;
        QJsonArray nodes;
        QJsonArray edges;
        QSet<QString> ids;
        for (int copy = 0; nodes.size() < total; ++copy) {
            const auto suffix = QStringLiteral("-%1").arg(copy);
            for (const auto &value : graph["nodes"].toArray()) {
                if (nodes.size() == total) { break; }
                auto node = value.toObject();
                node["id"] = node["id"].toString() + suffix;
                auto ui = node["ui_properties"].toObject();
                auto position = ui["position"].toObject();
                position["x"] = position["x"].toDouble() + (copy % columns) * 2000;
                position["y"] = position["y"].toDouble() + (copy / columns) * 900;
                ui["position"] = position;
                node["ui_properties"] = ui;
                ids.insert(node["id"].toString());
                nodes.append(node);
            }
            for (const auto &value : graph["edges"].toArray()) {
                auto edge = value.toObject();
                for (const auto key : {"id", "source", "target"}) {
                    edge[key] = edge[key].toString() + suffix;
                }
                if (ids.contains(edge["source"].toString()) && ids.contains(edge["target"].toString())) { edges.append(edge); }
            }
        }
        workflow["graph"] = QJsonObject{{"nodes", nodes}, {"edges", edges}};
        QSettings().setValue(QStringLiteral("canvas-chat-dock/collapsed"), true);
        nodetool::EditorWindow window;
        window.resize(1440, 900);
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        window.setCatalog(fixture["metadata"].toArray());
        QVERIFY(window.document()->load(workflow).ok);
        QCOMPARE(window.document()->nodes().size(), total);
        const nodetool::test::CanvasProbe probe(window);
        auto &canvas = probe.surface();
        auto *viewport = probe.viewport();
        const auto visible = [&] {
            const auto area = canvas.visibleSceneRect();
            int count = 0;
            for (const auto id : window.scene()->graphModel().allNodeIds()) {
                if (area.intersects(canvas.nodeBounds(id))) { ++count; }
            }
            return count;
        };
        struct Steps { double meanUs = 0; double maxUs = 0; };
        const auto run = [&](int steps, const std::function<void(int)> &send) {
            QCoreApplication::processEvents();
            viewport->repaint();
            Steps result;
            QElapsedTimer total;
            total.start();
            for (int i = 0; i < steps; ++i) {
                QElapsedTimer step;
                step.start();
                send(i);
                QCoreApplication::processEvents();
                viewport->repaint();
                result.maxUs = std::max(result.maxUs, step.nsecsElapsed() / 1000.0);
            }
            result.meanUs = total.nsecsElapsed() / 1000.0 / steps;
            return result;
        };
        const QPoint center = viewport->rect().center();
        // A middle-button drag pans in either navigation mode (EditorWindow::eventFilter).
        QPoint pointer = center;
        const auto pan = [&](int i) {
            pointer += QPoint(0, i < 60 ? 12 : -12);
            QMouseEvent move(QEvent::MouseMove, QPointF(pointer), QPointF(viewport->mapToGlobal(pointer)), Qt::NoButton,
                             Qt::MiddleButton, Qt::NoModifier);
            QApplication::sendEvent(viewport, &move);
        };
        const auto panRun = [&] {
            pointer = center;
            probe.press(center, Qt::MiddleButton);
            const auto steps = run(120, pan);
            probe.release(center, Qt::MiddleButton);
            return steps;
        };
        // A physical wheel zooms under the cursor by 1.15 a notch.
        const auto zoom = [&](int i) {
            const QPoint notch(0, i < 10 ? 120 : -120);
            QWheelEvent wheel(QPointF(center), QPointF(viewport->mapToGlobal(center)), QPoint(), notch, Qt::NoButton, Qt::NoModifier,
                              Qt::NoScrollPhase, false);
            QApplication::sendEvent(viewport, &wheel);
        };
        const auto report = [&](const char *name, const Steps &steps, int cards) {
            qInfo().nospace() << name << " nodes=" << total << " visible=" << cards << " zoom=" << canvas.zoom()
                << " per_step_us=" << steps.meanUs << " max_step_us=" << steps.maxUs;
        };
        window.action("Reset zoom");
        QTest::qWait(800);
        QCOMPARE(canvas.zoom(), 1.0);
        const auto scroll = canvas.visibleSceneRect().top();
        int cards = visible();
        report("pan_100", panRun(), cards);
        QCOMPARE(canvas.visibleSceneRect().top(), scroll);
        // The fit view is the minimum zoom, 0.12, with the most cards on screen.
        window.fit();
        QTest::qWait(800);
        cards = visible();
        report("pan_fit", panRun(), cards);
        const double fitZoom = canvas.zoom();
        // Ten notches in, ten out: zoom 0.12 to about 0.49 and back.
        double deepest = fitZoom;
        const auto zoomSteps = run(20, [&](int i) { zoom(i); deepest = std::max(deepest, canvas.zoom()); });
        report("zoom_fit", zoomSteps, cards);
        QVERIFY(deepest > fitZoom * 3);
        QVERIFY(canvas.zoom() < fitZoom * 1.2);
        // The canvas paints at once, so a zoom gesture leaves no raster work behind.
        QElapsedTimer settle;
        settle.start();
        QCoreApplication::processEvents();
        qInfo().nospace() << "zoom_settle_us=" << settle.nsecsElapsed() / 1000.0;
    }
};
QTEST_MAIN(LargeGraphTest)
#include "LargeGraphTest.moc"
