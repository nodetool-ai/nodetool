#include "../support/DarkCanvasTheme.h"
#include "graph/EditorScene.h"
#include "graph/NodeLayout.h"
#include "graph/WorkflowGraphModel.h"
#include "run/NodeRuntimeModel.h"
#include <QDir>
#include <QGraphicsView>
#include <QPainter>
#include <QtNodes/internal/ConnectionGraphicsObject.hpp>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QtNodes/ConnectionStyle>
#include <QtNodes/NodeStyle>
#include <QtTest>
#include <algorithm>
#include <cmath>

using namespace nodetool;

// Card chrome, ports and wires in the states the web styles define. The tests
// render the scene and read pixels, so a declared constant cannot pass alone.
//   web/src/styles/nodes.states.css          bypassed, from-bypassed, not-run
//   web/src/styles/handle_edge_tooltip.css   handles, collect handles, edges
//   web/src/styles/nodes.zoomed.css          zoomed-out
//   web/src/components/node/selectionStyles.ts   grouped card edge and fill
//   web/src/components/node/NodeHeader.tsx       Disabled chip
class CanvasChromeTest final : public QObject {
    Q_OBJECT

private:
    // The QtNodes styles the editor window installs: opaque cards without QtNodes'
    // own shadow, the web hit radius and the wire bounds margin.
    static bool installStyles() {
        QtNodes::NodeStyle::setNodeStyle(QString::fromUtf8(QJsonDocument(QJsonObject{{"NodeStyle", QJsonObject{
            {"ShadowEnabled", false}, {"Opacity", 1}, {"PenWidth", 1}, {"HoveredPenWidth", 1},
            {"ConnectionPointDiameter", nodetool::node_metrics::handleDiameter / 2}}}}).toJson()));
        QtNodes::ConnectionStyle::setConnectionStyle(QString::fromUtf8(QJsonDocument(QJsonObject{{"ConnectionStyle", QJsonObject{
            {"PointDiameter", nodetool::node_metrics::wireBoundsMargin}, {"LineWidth", 1.5}, {"UseDataDefinedColors", false}}}}).toJson()));
        return true;
    }

    struct Scene {
        bool styled = installStyles();
        WorkflowGraphModel model;
        node_editor::NodeRuntimeModel runtime;
        mutable EditorScene scene{model};
        explicit Scene(const QJsonArray &nodes, const QJsonArray &edges = {}, bool dark = true)
        {
            const auto text = QJsonObject{{"type", "str"}};
            const auto list = QJsonObject{{"type", "list"}, {"type_args", QJsonArray{text}}};
            const auto plain = [&](const QString &type, bool streaming) {
                return QJsonObject{{"node_type", type}, {"title", "Card"}, {"input_fields", QJsonArray{"in", "many"}},
                    {"is_streaming_output", streaming},
                    {"properties", QJsonArray{QJsonObject{{"name", "in"}, {"type", text}}, QJsonObject{{"name", "many"}, {"type", list}}}},
                    {"outputs", QJsonArray{QJsonObject{{"name", "out"}, {"type", text}}}}};
            };
            model.setRuntimeModel(&runtime);
            model.project(QJsonObject{{"id", "w"}, {"graph", QJsonObject{{"nodes", nodes}, {"edges", edges}}}},
                          QJsonArray{plain("t", false), plain("s", true)});
            auto theme = nodetool::test::darkCanvasTheme();
            if (!dark) {
                theme.canvas = QColor("#f6f6f8");
                theme.node = QColor("#ffffff");
                theme.grid = QColor("#d9d9df");
                theme.divider = QColor("#e4e4e7");
                theme.textPrimary = QColor("#17171a");
                theme.primary = QColor("#2f62c4");
                theme.groupHeader = QColor("#f5f5f6");
                theme.groupFill = QColor(0xcc, 0xcc, 0xcc, 0x8c);
                theme.previewSelected = QColor("#27272a");
                theme.outputSelected = QColor("#398da4");
                theme.field = QColor(0x2a, 0x2a, 0x2a, 0x06);
            }
            scene.setTheme(theme);
        }
        QtNodes::NodeId id(const QString &resource) const {
            for (const auto node : model.allNodeIds()) {
                if (model.resourceId(node) == resource) { return node; }
            }
            return QtNodes::InvalidNodeId;
        }
        QtNodes::NodeGraphicsObject *item(const QString &resource) const { return scene.nodeGraphicsObject(id(resource)); }
        QtNodes::ConnectionGraphicsObject *wire(const QString &from, const QString &to) const {
            for (auto item : scene.items()) {
                auto wire = qgraphicsitem_cast<QtNodes::ConnectionGraphicsObject *>(item);
                if (wire && model.resourceId(wire->connectionId().outNodeId) == from
                    && model.resourceId(wire->connectionId().inNodeId) == to) { return wire; }
            }
            return nullptr;
        }
        QPointF outputHandle(const QString &resource) const {
            return item(resource)->mapToScene(model.layout(id(resource)).size.width(), model.layout(id(resource)).outputY.first());
        }
        QPointF inputHandle(const QString &resource, int index = 0) const {
            return item(resource)->mapToScene(0, model.layout(id(resource)).inputY.at(index));
        }
        QImage render(const QRectF &source, int scale = 1) const {
            QImage image((source.size() * scale).toSize(), QImage::Format_ARGB32_Premultiplied);
            image.fill(Qt::transparent);
            QPainter painter(&image);
            scene.render(&painter, QRectF(QPointF(), QSizeF(image.size())), source);
            return image;
        }
        // The pixel at a scene point, rendered at four times the resolution.
        QColor pixel(const QPointF &point) const {
            return render(QRectF(point - QPointF(1, 1), QSizeF(2, 2)), 4).pixelColor(4, 4);
        }
    };

    static QJsonObject card(const QString &id, const QString &type, double x, double y, const QJsonObject &ui = {}, const QString &parent = {}) {
        QJsonObject properties{{"position", QJsonObject{{"x", x}, {"y", y}}}};
        for (auto it = ui.begin(); it != ui.end(); ++it) { properties.insert(it.key(), it.value()); }
        QJsonObject node{{"id", id}, {"type", type}, {"ui_properties", properties}};
        if (!parent.isEmpty()) { node["parent_id"] = parent; }
        return node;
    }

    static QJsonObject link(const QString &from, const QString &to, const QString &target = "in") {
        return {{"id", from + to}, {"source", from}, {"target", to}, {"sourceHandle", "out"}, {"targetHandle", target}};
    }

    static double saturation(const QColor &color) { return color.hsvSaturationF(); }

    static double luminance(const QColor &color) { return 0.299 * color.red() + 0.587 * color.green() + 0.114 * color.blue(); }

    static double distance(const QColor &a, const QColor &b) {
        return std::abs(a.red() - b.red()) + std::abs(a.green() - b.green()) + std::abs(a.blue() - b.blue());
    }

    // Lengths of the consecutive painted and unpainted runs along a wire, in
    // scene pixels. A point is painted when it differs from the canvas.
    static QVector<QPair<bool, double>> runsAlong(const Scene &scene, const QString &from, const QString &to) {
        auto *wire = scene.wire(from, to);
        const auto path = wire->mapToScene(wireCurve(wire->endPoint(QtNodes::PortType::Out), wire->endPoint(QtNodes::PortType::In)));
        const auto bounds = path.boundingRect().adjusted(-4, -4, 4, 4);
        constexpr int zoom = 4;
        const auto image = scene.render(bounds, zoom);
        const auto canvas = scene.scene.theme().canvas;
        QVector<double> peaks;
        const double length = path.length();
        QVector<QPair<bool, double>> runs;
        std::vector<double> ink;
        const double step = 0.25;
        for (double at = 24; at < length - 24; at += step) {
            const auto point = path.pointAtPercent(path.percentAtLength(at));
            const auto pixel = image.pixelColor(int((point.x() - bounds.left()) * zoom), int((point.y() - bounds.top()) * zoom));
            ink.push_back(distance(pixel, canvas));
        }
        const double top = *std::max_element(ink.begin(), ink.end());
        for (const auto value : ink) {
            const bool painted = value > top * 0.5;
            if (runs.isEmpty() || runs.last().first != painted) { runs.append({painted, step}); }
            else { runs.last().second += step; }
        }
        return runs;
    }

    static double median(QVector<double> values) {
        std::sort(values.begin(), values.end());
        return values.isEmpty() ? 0 : values[values.size() / 2];
    }

    static double medianRun(const QVector<QPair<bool, double>> &runs, bool painted) {
        QVector<double> lengths;
        // The first and last runs are cut by the sampling window.
        for (qsizetype i = 1; i + 1 < runs.size(); ++i) {
            if (runs[i].first == painted) { lengths.append(runs[i].second); }
        }
        return median(lengths);
    }

private slots:
    // nodes.states.css .react-flow__node.bypassed: opacity 0.8 and saturate(0.2)
    // on the whole node, handles included.
    void disabledCardIsDesaturated() {
        Scene scene({card("on", "t", 0, 0), card("off", "t", 500, 0, {{"bypassed", true}})});
        const auto on = scene.pixel(scene.outputHandle("on"));
        const auto off = scene.pixel(scene.outputHandle("off"));
        QVERIFY2(saturation(on) > 0.8, qPrintable(on.name()));
        // saturate(0.2) leaves a fifth of the saturation before the 0.8 opacity blend.
        QVERIFY2(saturation(off) < 0.3, qPrintable(QString("enabled %1 disabled %2").arg(on.name(), off.name())));
        // The tone stays the same, only dimmer: the handle is still the warm type color.
        QVERIFY(off.red() > off.blue());
    }

    // A bypassed header title is drawn at 0.8 inside the card's 0.8, so 0.64.
    void disabledTitleIsFainterThanTheCard() {
        Scene scene({card("on", "t", 0, 0), card("off", "t", 500, 0, {{"bypassed", true}})});
        const auto peak = [&](const QString &resource) {
            const auto origin = scene.item(resource)->scenePos();
            const QRectF title(origin + QPointF(37, 9), QSizeF(120, 14));
            const auto image = scene.render(title, 4);
            const auto background = image.pixelColor(2, 2);
            double most = 0;
            for (int y = 0; y < image.height(); ++y) {
                for (int x = 0; x < image.width(); ++x) {
                    most = std::max(most, luminance(image.pixelColor(x, y)) - luminance(background));
                }
            }
            return most;
        };
        const auto ratio = peak("off") / peak("on");
        QVERIFY2(ratio > 0.6 && ratio < 0.7, qPrintable(QString::number(ratio)));
    }

    // nodes.states.css .from-bypassed path: stroke-dasharray 5, 5 in user units,
    // not scaled by the stroke width.
    void bypassedWireDashesFivePixels() {
        Scene scene({card("a", "t", 0, 0), card("b", "t", 600, 0, {{"bypassed", true}})}, {link("a", "b")});
        const auto runs = runsAlong(scene, "a", "b");
        QVERIFY(runs.size() > 10);
        const auto dash = medianRun(runs, true);
        const auto gap = medianRun(runs, false);
        QVERIFY2(std::abs(dash - 5) < 1, qPrintable(QString("dash %1").arg(dash)));
        QVERIFY2(std::abs(gap - 5) < 1, qPrintable(QString("gap %1").arg(gap)));
    }

    // CustomEdge draws the selected glow for every edge, and the hover filter
    // applies to bypassed edges too (the web's rules carry no bypass exception).
    void selectedBypassedWireKeepsItsGlow() {
        Scene scene({card("a", "t", 0, 0), card("b", "t", 600, 0, {{"bypassed", true}})}, {link("a", "b")});
        auto *wire = scene.wire("a", "b");
        auto *path = wire;
        const auto curve = path->mapToScene(wireCurve(wire->endPoint(QtNodes::PortType::Out), wire->endPoint(QtNodes::PortType::In)));
        const auto middle = curve.pointAtPercent(0.5);
        // 2.5 px off the line is outside the 1.5 px stroke and inside the 6 px glow.
        const auto offLine = [&] { return distance(scene.pixel(middle + QPointF(0, 2.5)), scene.scene.theme().canvas); };
        const auto before = offLine();
        wire->setSelected(true);
        QVERIFY2(offLine() > before + 6, qPrintable(QString("%1 -> %2").arg(before).arg(offLine())));
    }

    // handle_edge_tooltip.css .streaming-edge: 3 wide at 0.8 opacity, dashed 30 3.
    void streamingWireDashesThirtyAndThree() {
        Scene scene({card("a", "s", 0, 0), card("b", "t", 600, 0)}, {link("a", "b")});
        const auto runs = runsAlong(scene, "a", "b");
        QVERIFY(runs.size() > 4);
        QVERIFY2(std::abs(medianRun(runs, true) - 30) < 1.5, qPrintable(QString::number(medianRun(runs, true))));
        QVERIFY2(medianRun(runs, false) < 5, qPrintable(QString::number(medianRun(runs, false))));
    }

    // The flowing edge replaces the stroke with a 14 10 dash that scrolls at
    // 120 px per second (edgeFlow, MOTION.spin).
    void flowingWireDashesAndScrolls() {
        Scene scene({card("a", "t", 0, 0), card("b", "t", 600, 0)}, {link("a", "b")});
        scene.runtime.beginRun("run");
        scene.runtime.ingest("run", {{"type", "node_update"}, {"job_id", "run"}, {"job_seq", 1}, {"node_id", "a"}, {"status", "running"}});
        QVERIFY(scene.model.runtimeWireFlowing(scene.wire("a", "b")->connectionId()));
        const auto runs = runsAlong(scene, "a", "b");
        QVERIFY(runs.size() > 6);
        // A flowing edge has round caps (stroke-linecap), which add the 1.5 px stroke width to a dash.
        QVERIFY2(std::abs(medianRun(runs, true) - 15.5) < 1, qPrintable(QString::number(medianRun(runs, true))));
        QVERIFY2(std::abs(medianRun(runs, false) - 8.5) < 1, qPrintable(QString::number(medianRun(runs, false))));
        // The dashes scroll: a quarter second later the pattern has moved 30 px, which is
        // 6 px modulo the 24 px period.
        const auto before = runsAlong(scene, "a", "b");
        QTest::qWait(250);
        const auto after = runsAlong(scene, "a", "b");
        QVERIFY2(std::abs(before.first().second - after.first().second) > 1.0 || before.size() != after.size(), "the dash pattern does not scroll");
    }

    // handle_edge_tooltip.css .control-edge:hover: 3 wide at full opacity, up from 2 at 0.7.
    void hoveredControlWireWidensAndBrightens() {
        QJsonObject control{{"id", "ab"}, {"source", "a"}, {"target", "b"}, {"sourceHandle", "__control__"},
                            {"targetHandle", "__control__"}, {"edge_type", "control"}};
        Scene scene({card("a", "t", 0, 0), card("b", "t", 0, 400)}, {control});
        auto *wire = scene.wire("a", "b");
        QVERIFY(wire);
        const auto curve = wire->mapToScene(controlWireCurve(wire->endPoint(QtNodes::PortType::Out), wire->endPoint(QtNodes::PortType::In)));
        // The strongest paint 1.25 px beside the line, over the middle of the wire.
        const auto beside = [&] {
            double most = 0;
            for (double at = 0.4; at <= 0.6; at += 0.01) {
                most = std::max(most, distance(scene.pixel(curve.pointAtPercent(at) + QPointF(1.25, 0)), scene.scene.theme().canvas));
            }
            return most;
        };
        const auto rest = beside();
        wire->connectionState().setHovered(true);
        wire->update();
        const auto hovered = beside();
        QVERIFY2(hovered > rest + 40, qPrintable(QString("rest %1 hovered %2").arg(rest).arg(hovered)));
    }

    // handle_edge_tooltip.css .collect-handle: a list[T] input is a ring, its core
    // the card color.
    void collectHandleHasAHollowCore() {
        Scene scene({card("a", "t", 0, 0)});
        const auto plain = scene.pixel(scene.inputHandle("a", 0));
        const auto collect = scene.pixel(scene.inputHandle("a", 1));
        QVERIFY2(distance(plain, typeColor("str")) < 12, qPrintable(plain.name()));
        QVERIFY2(distance(collect, scene.scene.theme().node) < 12, qPrintable(collect.name()));
        // The ring around the core keeps the list type color.
        const auto ring = scene.pixel(scene.inputHandle("a", 1) + QPointF(3.5, 0));
        QVERIFY2(distance(ring, typeColor("list")) < 40, qPrintable(ring.name()));
    }

    // selectionStyles.ts and BaseNode.tsx: a card inside a group has an edge of
    // c_node_header_bg_group at 82 percent over primary at 18, and the fill of
    // the group tint (#222 at 0.55 in dark) in place of the card color.
    void groupedCardTakesTheGroupEdgeAndFill() {
        for (const bool dark : {true, false}) {
            Scene scene({card("frame", "nodetool.workflows.base_node.Group", 0, 0, {{"width", 500}, {"height", 400}}),
                         card("kid", "t", 40, 60, {}, "frame"), card("loose", "t", 800, 60)}, {}, dark);
            const auto &theme = scene.scene.theme();
            const auto edge = [&](const QString &resource) {
                const auto origin = scene.item(resource)->scenePos();
                return scene.pixel(origin + QPointF(0.5, 34));
            };
            const auto fill = [&](const QString &resource) {
                const auto origin = scene.item(resource)->scenePos();
                return scene.pixel(origin + QPointF(12, 34));
            };
            const QColor header = dark ? QColor("#2A2D33") : QColor("#F5F5F6");
            QColor expected;
            expected.setRgbF(header.redF() * 0.82 + theme.primary.redF() * 0.18, header.greenF() * 0.82 + theme.primary.greenF() * 0.18,
                             header.blueF() * 0.82 + theme.primary.blueF() * 0.18);
            QVERIFY2(distance(edge("kid"), expected) < 8, qPrintable(QString("%1 edge %2, expected %3").arg(dark).arg(edge("kid").name(), expected.name())));
            QVERIFY(distance(edge("loose"), expected) > 20);
            // The fill is the tint over the group frame behind the card.
            const auto behind = scene.pixel(scene.item("kid")->scenePos() + QPointF(-20, 34));
            const auto tint = dark ? QColor("#222222") : QColor("#cccccc");
            QColor tinted;
            tinted.setRgbF(tint.redF() * 0.55 + behind.redF() * 0.45, tint.greenF() * 0.55 + behind.greenF() * 0.45,
                           tint.blueF() * 0.55 + behind.blueF() * 0.45);
            QVERIFY2(distance(fill("kid"), tinted) < 10, qPrintable(QString("%1 fill %2, expected %3").arg(dark).arg(fill("kid").name(), tinted.name())));
            QVERIFY(distance(fill("loose"), theme.node) < 6);
        }
    }

    // selectionStyles.ts getPreviewNodeSelectionSx and getOutputNodeSelectionSx: a selected
    // Preview card is edged in grey 100 and a selected Output card in info.main over white,
    // and both carry SHADOW.sm unselected too.
    void previewAndOutputCardsTakeTheirSelectedEdge() {
        for (const bool dark : {true, false}) {
            Scene scene({card("p", "nodetool.workflows.base_node.Preview", 0, 0), card("o", "nodetool.output.Output", 600, 0),
                         card("n", "t", 0, 400)}, {}, dark);
            const auto edge = [&](const QString &resource) { return scene.pixel(scene.item(resource)->scenePos() + QPointF(0.5, 20)); };
            const auto below = [&](const QString &resource) {
                return scene.pixel(scene.item(resource)->scenePos() + QPointF(103.7, scene.model.layout(scene.id(resource)).size.height() + 1.5));
            };
            // SHADOW.sm shades the canvas just under an unselected Preview card, and not under a plain one.
            QVERIFY2(distance(below("p"), scene.scene.theme().canvas) > 3, "a Preview card carries a shadow");
            QVERIFY2(distance(below("n"), scene.scene.theme().canvas) < 3, "a plain unselected card carries none");
            scene.item("p")->setSelected(true);
            scene.item("o")->setSelected(true);
            const QColor preview = dark ? QColor("#d4d6db") : QColor("#27272a");
            const QColor output = dark ? QColor("#4adbf1") : QColor("#398da4");
            QVERIFY2(distance(edge("p"), preview) < 6, qPrintable(QString("%1 preview edge %2").arg(dark).arg(edge("p").name())));
            QVERIFY2(distance(edge("o"), output) < 6, qPrintable(QString("%1 output edge %2").arg(dark).arg(edge("o").name())));
        }
    }

    // The Disabled chip is the MuiChip of NodeHeader.tsx: compact (24 px high),
    // 8 px label padding and a 1 px border, a pill.
    void disabledChipFollowsTheCompactChip() {
        const auto rect = disabledChipRect(QRectF(0, 0, 100, 24), 40);
        QCOMPARE(rect.height(), 24.0);
        QCOMPARE(rect.width(), 40.0 + 2 * 8 + 2);
        QCOMPARE(rect.right(), 100.0);
        QCOMPARE(rect.center().y(), 12.0);
    }

    // handle_edge_tooltip.css .react-flow__handle:hover { cursor: cell }, and
    // .is-connecting .react-flow__handle { cursor: none }.
    void handlesShowTheCellCursorAndHideItWhileConnecting() {
        Scene scene({card("a", "t", 0, 0), card("b", "t", 600, 0)});
        QGraphicsView view(&scene.scene);
        view.resize(1000, 400);
        view.show();
        QVERIFY(QTest::qWaitForWindowExposed(&view));
        view.resetTransform();
        view.centerOn(300, 60);
        const auto at = [&](const QPointF &scenePoint) { return view.mapFromScene(scenePoint); };
        QTest::mouseMove(view.viewport(), at(QPointF(300, 200)));
        QTest::qWait(30);
        QCOMPARE(view.viewport()->cursor().shape(), Qt::ArrowCursor);
        QTest::mouseMove(view.viewport(), at(scene.outputHandle("a")));
        QTest::qWait(50);
        QTRY_COMPARE(view.viewport()->cursor().shape(), Qt::CrossCursor);
        QTest::mouseMove(view.viewport(), at(QPointF(300, 200)));
        QTRY_COMPARE(view.viewport()->cursor().shape(), Qt::ArrowCursor);
        // Dragging a wire hides the cursor over a handle.
        QTest::mousePress(view.viewport(), Qt::LeftButton, Qt::NoModifier, at(scene.outputHandle("a")));
        QTest::mouseMove(view.viewport(), at(scene.outputHandle("a")) + QPoint(40, 20));
        QTest::mouseMove(view.viewport(), at(scene.inputHandle("b")));
        QTRY_COMPARE(view.viewport()->cursor().shape(), Qt::BlankCursor);
        QTest::mouseMove(view.viewport(), at(QPointF(300, 200)));
        QTest::mouseRelease(view.viewport(), Qt::LeftButton, Qt::NoModifier, at(QPointF(300, 200)));
        QTRY_COMPARE(view.viewport()->cursor().shape(), Qt::ArrowCursor);
    }

    // nodes.zoomed.css, at zoom 0.35 and below: handles are hidden and edges are
    // 6 px wide in grey 400.
    void zoomedOutCardsHideHandlesAndThickenWires() {
        Scene scene({card("a", "t", 0, 0), card("b", "t", 600, 0)}, {link("a", "b")});
        const auto sampleHandle = [&](double zoom) {
            QImage image(int(40 * zoom) + 8, int(40 * zoom) + 8, QImage::Format_ARGB32_Premultiplied);
            image.fill(Qt::transparent);
            QPainter painter(&image);
            scene.scene.render(&painter, QRectF(QPointF(), QSizeF(image.size())),
                               QRectF(scene.outputHandle("a") - QPointF(20, 20), QSizeF(40, 40) + QSizeF(8 / zoom, 8 / zoom)));
            return image.pixelColor(int(20 * zoom), int(20 * zoom));
        };
        // Rendered through a scaled painter, so the card paints at the zoom.
        const auto full = sampleHandle(1);
        QVERIFY2(distance(full, typeColor("str")) < 12, qPrintable(full.name()));
        const auto far = sampleHandle(0.3);
        QVERIFY2(distance(far, typeColor("str")) > 60, qPrintable(far.name()));
    }

    // nodes.zoomed.css: at the overview zoom an edge is 6 wide where it is 1.5 above it.
    void overviewZoomThickensWires() {
        Scene scene({card("a", "t", 0, 0), card("b", "t", 600, 0)}, {link("a", "b")});
        // The ink one pixel column holds at x=437, clear of the grid crosses, summed over its height.
        const auto ink = [&](double zoom) {
            const QRectF source(430, 10, 14, 80);
            QImage image(int(std::ceil(source.width() * zoom)), int(std::ceil(source.height() * zoom)), QImage::Format_ARGB32_Premultiplied);
            image.fill(Qt::transparent);
            {
                QPainter painter(&image);
                scene.scene.render(&painter, QRectF(QPointF(), QSizeF(source.width() * zoom, source.height() * zoom)), source);
            }
            const int column = int(7 * zoom);
            double total = 0;
            for (int y = 0; y < image.height(); ++y) { total += distance(image.pixelColor(column, y), scene.scene.theme().canvas); }
            return total / zoom;
        };
        const auto overview = ink(0.3);
        const auto detailed = ink(0.36);
        QVERIFY2(overview > 2.5 * detailed, qPrintable(QString("overview %1 detailed %2").arg(overview).arg(detailed)));
    }

    // Writes the states above for a visual comparison with the web captures. Skipped
    // unless NODETOOL_CANVAS_CHROME_CAPTURE_DIR names a directory outside the repository.
    void captures() {
        const auto directory = qEnvironmentVariable("NODETOOL_CANVAS_CHROME_CAPTURE_DIR");
        if (directory.isEmpty()) { QSKIP("Set NODETOOL_CANVAS_CHROME_CAPTURE_DIR to write the captures"); }
        QDir().mkpath(directory);
        for (const bool dark : {true, false}) {
            Scene scene({card("frame", "nodetool.workflows.base_node.Group", 0, 0, {{"width", 760}, {"height", 330}}),
                         card("kid", "t", 40, 60, {}, "frame"), card("off", "t", 440, 60, {{"bypassed", true}}, "frame"),
                         card("plain", "t", 900, 0), card("flow", "t", 900, 300), card("sink", "t", 1300, 300),
                         card("stream", "s", 0, 420), card("after", "t", 440, 420, {{"bypassed", true}}),
                         card("preview", "nodetool.workflows.base_node.Preview", 900, 520),
                         card("output", "nodetool.output.Output", 1300, 520)},
                        {link("flow", "sink"), link("stream", "after"), link("kid", "off")}, dark);
            scene.runtime.beginRun("run");
            scene.runtime.ingest("run", {{"type", "node_update"}, {"job_id", "run"}, {"job_seq", 1}, {"node_id", "flow"}, {"status", "running"}});
            const auto name = dark ? QStringLiteral("dark") : QStringLiteral("light");
            const QRectF area(-40, -60, 1900, 1000);
            QVERIFY(scene.render(area, 1).save(directory + "/chrome-" + name + ".png"));
            // Selected Preview and Output cards, their edges, and a selected streaming wire.
            scene.item("preview")->setSelected(true);
            scene.item("output")->setSelected(true);
            scene.wire("stream", "after")->setSelected(true);
            QVERIFY(scene.render(area, 1).save(directory + "/chrome-selected-" + name + ".png"));
            // Overview zoom, drawn at 0.3.
            QImage far(int(area.width() * 0.3), int(area.height() * 0.3), QImage::Format_ARGB32_Premultiplied);
            far.fill(Qt::transparent);
            QPainter painter(&far);
            scene.scene.render(&painter, QRectF(QPointF(), QSizeF(far.size())), area);
            painter.end();
            QVERIFY(far.save(directory + "/chrome-zoomed-" + name + ".png"));
        }
    }
};

QTEST_MAIN(CanvasChromeTest)
#include "CanvasChromeTest.moc"
