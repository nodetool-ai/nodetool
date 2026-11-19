#include "../support/CanvasProbe.h"
#include "../../../graph-runner/unittests/sanitizer_build.h"
#include "ui/CanvasSurface.h"
#include "graph/EditorScene.h"
#include "graph/WorkflowGraphModel.h"
#include "ui/EditorWindow.h"
#include "canvas/GraphCanvas.h"
#include "ui/QuickCanvas.h"
#include <QPointer>
#include <QQuickWidget>
#include <QQuickWindow>
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
#include <array>
#include <functional>
#include <memory>

using nodetool::node_editor::WorkflowDocument;

namespace {
// Enforce the production frame limits in Release. Instrumented runs still
// exercise every input and frame, with the native test suite's timing scale.
constexpr auto kTimingScale = gr::test::kSanitizerTimeScale;

// UI thread only. The UI thread work of one input step on either canvas. The
// QtNodes view paints in repaint(). QQuickWidget renders on a 5 ms timer, so
// a Quick step waits for its frame and adds the raster pass (polish), the
// sync and render of the software renderer, and the widget's blit, without
// the idle wait. The clock borrows the window, which outlives it.
class StepClock final : public QObject {
public:
  explicit StepClock(nodetool::EditorWindow &window)
      : quick_(dynamic_cast<nodetool::QuickCanvas *>(&window.canvas())), viewport_(&window.canvas().viewportWidget()) {
    if (!quick_) { return; }
    auto *scene = quick_->quickWidget().quickWindow();
    // QQuickWidget uses the GUI thread for sync and render. Disconnect before
    // the clock's members go away, even though the window remains alive.
    const QPointer<StepClock> clock(this);
    connections_ = {
        connect(scene, &QQuickWindow::beforeSynchronizing, this, [clock] { if (clock) { clock->phase_.restart(); } }),
        connect(scene, &QQuickWindow::afterSynchronizing, this, [clock] { if (clock) { clock->syncNs_ += clock->phase_.nsecsElapsed(); } }),
        connect(scene, &QQuickWindow::beforeRendering, this, [clock] { if (clock) { clock->phase_.restart(); } }),
        connect(scene, &QQuickWindow::afterRendering, this, [clock] {
          if (!clock) { return; }
          clock->renderNs_ += clock->phase_.nsecsElapsed();
          ++clock->frames_;
        }),
    };
  }
  ~StepClock() override {
    for (const auto &connection : connections_) { disconnect(connection); }
  }
  bool quick() const { return quick_ != nullptr; }
  // Sends one step and returns measured work in microseconds, excluding the
  // QQuickWidget timer wait.
  double step(const std::function<void()> &send) {
    const auto frames = frames_;
    const auto sync = syncNs_, render = renderNs_;
    const auto polish = stats().nanoseconds;
    QElapsedTimer timer;
    timer.start();
    send();
    const auto input = timer.nsecsElapsed();
    inputNs += input;
    QCoreApplication::processEvents();
    if (quick_) {
      QElapsedTimer wait;
      wait.start();
      while (frames_ == frames && wait.elapsed() < 200) { QCoreApplication::processEvents(QEventLoop::AllEvents, 2); }
    }
    timer.restart();
    viewport_->repaint();
    const auto blit = timer.nsecsElapsed();
    blitNs += blit;
    const auto polished = stats().nanoseconds - polish;
    const auto synced = syncNs_ - sync;
    const auto rendered = renderNs_ - render;
    rasterPartNs += polished;
    syncPartNs += synced;
    renderPartNs += rendered;
    return (input + polished + synced + rendered + blit) / 1000.0;
  }
  qint64 inputNs = 0, rasterPartNs = 0, syncPartNs = 0, renderPartNs = 0, blitNs = 0;
  nodetool::canvas::GraphCanvas::RasterStats stats() const {
    return quick_ ? quick_->graphCanvas().rasterStats() : nodetool::canvas::GraphCanvas::RasterStats{};
  }

private:
  nodetool::QuickCanvas *quick_;
  QWidget *viewport_;
  std::array<QMetaObject::Connection, 4> connections_;
  QElapsedTimer phase_;
  qint64 syncNs_ = 0, renderNs_ = 0;
  int frames_ = 0;
};
} // namespace
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
            const double edgeCommand = timer.nsecsElapsed() / 1000.0;
            // A document change queues projection. Read the scene here so
            // this measures the new wire reaching both canvas implementations.
            if (window) { QVERIFY(window->scene()); }
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
            qInfo().nospace() << "N=" << n << " add_us=" << add << " connect_us=" << edge << " connect_command_us=" << edgeCommand
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
        // The fit animates. The target card is picked once the view stands still.
        QTRY_VERIFY(!window.findChild<QObject *>(QStringLiteral("viewport-animation")));
        auto *view = &window.canvas();
        QVERIFY(view);
        auto &model = static_cast<nodetool::WorkflowGraphModel &>(window.scene()->graphModel());
        QtNodes::NodeId target = QtNodes::InvalidNodeId;
        for (const auto id : model.allNodeIds()) {
            if (model.resourceId(id) == "resize-2") { target = id; break; }
        }
        QVERIFY(target != QtNodes::InvalidNodeId);
        const auto original = view->nodeOrigin(target);
        const auto start = view->mapFromScene(original + QPointF(view->nodeRect(target).width() / 2, 12));
        auto *viewport = &view->viewportWidget();
        QVERIFY(viewport->rect().contains(start));
        QCOMPARE(view->nodeAt(start), target);
        StepClock clock(window);
        QTest::mousePress(viewport, Qt::LeftButton, Qt::NoModifier, start);
        constexpr int moves = 400;
        double total = 0, slowest = 0;
        for (int i = 1; i <= moves; ++i) {
            const auto step = clock.step([&] {
                QMouseEvent move(QEvent::MouseMove, QPointF(start + QPoint(i * 3, i * 2)), viewport->mapToGlobal(QPointF(start + QPoint(i * 3, i * 2))),
                                 Qt::NoButton, Qt::LeftButton, Qt::NoModifier);
                QApplication::sendEvent(viewport, &move);
            });
            total += step;
            slowest = std::max(slowest, step);
        }
        const double perMove = total / moves;
        QTest::mouseRelease(viewport, Qt::LeftButton, Qt::NoModifier, start + QPoint(moves * 3, moves * 2));
        qInfo().nospace() << "drag nodes=" << nodes.size() << " per_move_us=" << perMove << " max_move_us=" << slowest
                          << " canvas=" << (clock.quick() ? "quick" : "qtnodes") << " input_us=" << clock.inputNs / 1000.0 / moves
                          << " polish_us=" << clock.rasterPartNs / 1000.0 / moves << " sync_us=" << clock.syncPartNs / 1000.0 / moves
                          << " render_us=" << clock.renderPartNs / 1000.0 / moves
                          << " blit_us=" << clock.blitNs / 1000.0 / moves << " card_rasters=" << clock.stats().cards
                          << " wire_rasters=" << clock.stats().wires;
        // The Quick canvas moves the card's texture; plan target: under 4 ms a move.
        if (clock.quick()) { QVERIFY2(perMove < 4000 * kTimingScale, "Quick canvas drag exceeded its timing budget"); }
        // Scanning the catalog for every handle on every bounds query took over 5 s a move.
        QVERIFY2(perMove < 100000 * kTimingScale, "Drag exceeded its timing budget");
        QTRY_VERIFY(view->nodeOrigin(target) != original);
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
        struct Steps { double meanUs = 0; double maxUs = 0; int cards = 0; int wires = 0; int foreground = 0; double input = 0; double polish = 0; double sync = 0; double render = 0; double blit = 0; };
        StepClock clock(window);
        const auto run = [&](int steps, const std::function<void(int)> &send) {
            clock.step([] {});
            Steps result;
            const auto before = clock.stats();
            const auto polish = clock.rasterPartNs, sync = clock.syncPartNs;
            const auto render = clock.renderPartNs, input = clock.inputNs, blit = clock.blitNs;
            double total = 0;
            for (int i = 0; i < steps; ++i) {
                const auto step = clock.step([&] { send(i); });
                total += step;
                result.maxUs = std::max(result.maxUs, step);
            }
            result.meanUs = total / steps;
            result.cards = clock.stats().cards - before.cards;
            result.foreground = clock.stats().foreground - before.foreground;
            result.polish = (clock.rasterPartNs - polish) / 1000.0 / steps;
            result.sync = (clock.syncPartNs - sync) / 1000.0 / steps;
            result.render = (clock.renderPartNs - render) / 1000.0 / steps;
            result.input = (clock.inputNs - input) / 1000.0 / steps;
            result.blit = (clock.blitNs - blit) / 1000.0 / steps;
            result.wires = clock.stats().wires - before.wires;
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
        const auto panRun = [&](QPoint coldJump = {}) {
            pointer = center;
            probe.press(center, Qt::MiddleButton);
            const auto steps = run(120, [&](int i) {
                if (i == 0 && !coldJump.isNull()) { canvas.panBy(coldJump); }
                pan(i);
            });
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
                << " per_step_us=" << steps.meanUs << " max_step_us=" << steps.maxUs
                << " card_rasters=" << steps.cards << " wire_rasters=" << steps.wires << " input_us=" << steps.input
                << " foreground_rasters=" << steps.foreground << " polish_us=" << steps.polish << " sync_us=" << steps.sync
                << " render_us=" << steps.render << " blit_us=" << steps.blit;
        };
        window.action("Reset zoom");
        QTest::qWait(800);
        QCOMPARE(canvas.zoom(), 1.0);
        const auto scroll = canvas.visibleSceneRect().top();
        int cards = visible();
        // A first pan paints the cards it reaches; the measured pan runs over
        // the same ground again, as a back-and-forth pan does.
        if (clock.quick()) { panRun(); }
        const auto pan100 = panRun();
        report("pan_100", pan100, cards);
        QCOMPARE(canvas.visibleSceneRect().top(), scroll);
        // The fit view is the minimum zoom, 0.12, with the most cards on screen.
        window.fit();
        QTest::qWait(800);
        cards = visible();
        const auto fitCenter = canvas.center();
        const QPoint coldJump(0, viewport->height() * 4);
        canvas.panBy(-coldJump);
        QTest::qWait(150);
        const auto cold = panRun(coldJump);
        report("pan_fit_cold", cold, cards);
        if (clock.quick()) {
            QVERIFY(cold.cards > 0);
            QVERIFY2(cold.input + cold.polish < 2000 * kTimingScale, "Cold fit pan input and polish exceeded its timing budget");
            // Let the normal polish queue prefetch before taking the measured
            // route, including after the jump back to the start.
            auto &graph = static_cast<nodetool::QuickCanvas &>(canvas).graphCanvas();
            for (const int distance : {0, 360, 720, 0}) {
                canvas.centerOn(fitCenter - QPointF(0, distance / canvas.zoom()));
                QTRY_VERIFY_WITH_TIMEOUT(!graph.rasterPending(), int(4000 * kTimingScale));
            }
        } else {
            canvas.centerOn(fitCenter);
        }
        const auto panFit = panRun();
        report("pan_fit_warm", panFit, cards);
        if (clock.quick()) {
            QVERIFY2(panFit.meanUs < 16000 * kTimingScale, "Warm fit pan exceeded its software frame budget");
            QCOMPARE(pan100.cards + panFit.cards, 0);
            QCOMPARE(pan100.wires + panFit.wires, 0);
            QVERIFY2(panFit.input + panFit.polish < 2000 * kTimingScale, "Warm fit pan input and polish exceeded its timing budget");
            QVERIFY2(pan100.meanUs < 2000 * kTimingScale, "Quick canvas pan at zoom 1 exceeded its timing budget");
        }
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
        if (auto *quick = dynamic_cast<nodetool::QuickCanvas *>(&window.canvas())) {
            // The Quick canvas paints the zoomed cards again after the gesture,
            // spread over frames (plan target: at most 4 ms of raster a frame).
            auto &graph = quick->graphCanvas();
            graph.resetRasterStats();
            QTest::qWait(400);
            const auto stats = graph.rasterStats();
            qInfo().nospace() << "zoom_settle cards=" << stats.cards << " wires=" << stats.wires << " passes=" << stats.passes
                              << " raster_us=" << stats.nanoseconds / 1000.0 << " slowest_pass_us=" << stats.slowestPass / 1000.0;
            QVERIFY2(stats.slowestPass <= 4'000'000 * kTimingScale, "Zoom settle exceeded its timing budget");
        }
        qInfo().nospace() << "zoom_settle_us=" << settle.nsecsElapsed() / 1000.0;
    }
};
QTEST_MAIN(LargeGraphTest)
#include "LargeGraphTest.moc"
