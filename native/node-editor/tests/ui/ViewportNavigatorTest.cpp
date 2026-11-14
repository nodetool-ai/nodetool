#include "graph/EditorScene.h"
#include "graph/WorkflowGraphModel.h"
#include "ui/EditorWindow.h"
#include "PropertyFixture.h"
#include <QDockWidget>
#include <QGraphicsView>
#include <QDir>
#include <QMenu>
#include <QPainter>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWidget>
#include <QScrollBar>
#include <QSettings>
#include <QStandardPaths>
#include <QVariantAnimation>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QtTest>
#include <cmath>
using namespace nodetool;

// Web references for the expectations below:
//   components/node/MiniMapNavigator.tsx          color modes, legend, palette button
//   utils/ColorUtils.ts                           node category colors
//   components/node_editor/ViewportStatusIndicator.tsx   zoom steps, presets, fit durations, preset highlight
//   components/node_editor/NodeInfoPanel.tsx      Focus: setCenter at zoom 1.5 over 300 ms
//   config/constants.ts                           MIN_ZOOM 0.12, MAX_ZOOM 4
namespace {
QQuickItem *findVisual(QQuickItem *root, const QString &name) {
 if (!root) { return nullptr; }
 if (root->objectName() == name) { return root; }
 for (auto *child : root->childItems()) {
  if (auto *found = findVisual(child, name)) { return found; }
 }
 return nullptr;
}
// Popup content hangs off the popup, not off the root item, so the popups' content items are the fallback.
QQuickItem *findItem(QQuickItem *root, const QString &name) {
 if (auto *found = findVisual(root, name)) { return found; }
 if (!root) { return nullptr; }
 if (auto *found = root->findChild<QQuickItem *>(name)) { return found; }
 for (auto *object : root->findChildren<QObject *>()) {
  if (auto *content = object->property("contentItem").value<QQuickItem *>()) {
   if (auto *found = findVisual(content, name)) { return found; }
  }
 }
 return nullptr;
}
QQuickWidget *widgetWithSource(EditorWindow &window, const QString &file) {
 for (auto *widget : window.findChildren<QQuickWidget *>()) {
  if (widget->source().fileName() == file) { return widget; }
 }
 return nullptr;
}
QObject *singleton(EditorWindow &window, const char *name) {
 auto widgets = window.findChildren<QQuickWidget *>();
 return widgets.isEmpty() ? nullptr : widgets.first()->engine()->singletonInstance<QObject *>("NodeTool.UiPrimitives", name);
}
void setReducedMotion(EditorWindow &window, bool reduced) {
 auto *theme = singleton(window, "Theme");
 QVERIFY(theme);
 theme->setProperty("reducedMotion", reduced);
 QTest::qWait(40);
}
int motionNormal(EditorWindow &window) {
 auto *metrics = singleton(window, "Metrics");
 return metrics ? metrics->property("motionNormal").toInt() : -1;
}
QVariantAnimation *viewAnimation(EditorWindow &window) {
 return window.findChild<QVariantAnimation *>("viewport-animation");
}
QGraphicsView *viewOf(EditorWindow &window) { return window.findChild<QGraphicsView *>(); }
QJsonObject placed(const QString &id, const QString &type, double x, double y, double width = 0, double height = 0) {
 QJsonObject ui{{"position", QJsonObject{{"x", x}, {"y", y}}}};
 if (width > 0) { ui["width"] = width; ui["height"] = height; }
 return {{"id", id}, {"type", type}, {"ui_properties", ui}};
}
// One node of every mini-map category, spread so each paints on its own.
void loadCategories(EditorWindow &window) {
 window.setCatalog({QJsonObject{{"node_type", "t"}, {"title", "T"}}});
 QJsonArray nodes{placed("in", "nodetool.input.StringInput", 0, 0), placed("const", "nodetool.constant.String", 500, 0),
  placed("proc", "t", 1000, 0), placed("out", "nodetool.output.StringOutput", 1500, 0),
  placed("group", "nodetool.workflows.base_node.Group", 2000, 0, 300, 200),
  placed("note", "nodetool.workflows.base_node.Comment", 2500, 0, 300, 200)};
 QVERIFY(window.document()->load(QJsonObject{{"graph", QJsonObject{{"nodes", nodes}, {"edges", QJsonArray{}}}}}));
 window.resize(1400, 900);
 window.show();
 QVERIFY(QTest::qWaitForWindowExposed(&window));
 window.fit();
 QTest::qWait(150);
}
int countPixels(const QImage &image, const QString &color) {
 const auto target = QColor(color).rgb();
 int count = 0;
 for (int y = 0; y < image.height(); ++y) {
  for (int x = 0; x < image.width(); ++x) {
   if ((image.pixel(x, y) & 0xffffff) == (target & 0xffffff)) { ++count; }
  }
 }
 return count;
}
QImage miniMapImage(QWidget *map) {
 QTest::qWait(60);
 return map->grab().toImage().convertToFormat(QImage::Format_RGB32);
}
// A rendered 12 x 12 swatch or label color from a QML item.
QColor colorOf(QQuickItem *item) { return item ? item->property("color").value<QColor>() : QColor(); }
}

class ViewportNavigatorTest final : public QObject {
 Q_OBJECT
private slots:
 void initTestCase() {
  QStandardPaths::setTestModeEnabled(true);
  QSettings().clear();
 }
 void navigation() {
  EditorWindow window;
  window.setCatalog(property_fixture::catalog());
  QVERIFY(window.document()->load(property_fixture::workflow()));
  window.resize(1400, 900); window.show();
  QTest::qWait(100);
  auto map = window.findChild<QWidget *>("mini-map");
  QVERIFY(map);
  auto view = window.findChild<QGraphicsView *>(); QVERIFY(view);
  const auto snapshot = window.document()->snapshot();
  const auto count = window.document()->undoStack()->count();
  const auto before = view->mapToScene(view->viewport()->rect().center());
  QTest::mouseClick(map, Qt::LeftButton, Qt::NoModifier, QPoint(20,20));
  QVERIFY(view->mapToScene(view->viewport()->rect().center()) != before);
  QTest::mousePress(map, Qt::LeftButton, Qt::NoModifier, QPoint(30,30));
  QTest::mouseMove(map, QPoint(170,100));
  QTest::mouseRelease(map, Qt::LeftButton, Qt::NoModifier, QPoint(170,100));
  QCOMPARE(window.document()->snapshot(), snapshot);
  QCOMPARE(window.document()->undoStack()->count(), count);
  QVERIFY(window.document()->undoStack()->isClean());
  auto workflow = property_fixture::workflow();
  auto graph = workflow["graph"].toObject();
  QJsonArray nodes;
  for (int i=0; i<1200; ++i) {
    auto node = property_fixture::node(QString::number(i));
    node["ui_properties"] = QJsonObject{{"position", QJsonObject{{"x", (i%40)*400}, {"y", (i/40)*300}}}};
    nodes.append(node);
  }
  graph["nodes"] = nodes; graph["edges"] = QJsonArray{}; workflow["graph"] = graph;
  QVERIFY(window.document()->load(workflow));
  QTRY_COMPARE(map->property("nodeCount").toInt(), 1200);
  const auto largeSnapshot = window.document()->snapshot();
  QTest::mouseClick(map, Qt::LeftButton, Qt::NoModifier, QPoint(150,80));
  QCOMPARE(window.document()->snapshot(), largeSnapshot);
  QVERIFY(window.document()->undoStack()->isClean());
  QVERIFY(window.document()->load(property_fixture::workflow()));
  QTRY_VERIFY(map->property("nodeCount").toInt() < 1200);
  const int smallCount = map->property("nodeCount").toInt();
  QVERIFY(window.document()->applyCommand({{"op", "addNode"}, {"node", property_fixture::node("extra")}}));
  QTRY_COMPARE(map->property("nodeCount").toInt(), smallCount+1);
  QVERIFY(window.document()->applyCommand({{"op", "removeNodes"}, {"ids", QJsonArray{"extra"}}}));
  QTRY_COMPARE(map->property("nodeCount").toInt(), smallCount);
  QVERIFY(window.selectNode("a"));
  window.fit();
  const QString dir = qEnvironmentVariable("NODETOOL_MINIMAP_CAPTURE");
  if (!dir.isEmpty()) {
   QDir().mkpath(dir);
   for (bool dark : {true, false}) {
    window.setDarkTheme(dark);
    for (int width : {1400, 900}) {
     window.resize(width,900); QTest::qWait(150);
     QVERIFY(map->isVisible());
     QVERIFY(window.grab().save(dir + QString("/%1-%2.png").arg(dark ? "dark" : "light").arg(width)));
    }
   }
  }
 }

 // MiniMapNavigator.tsx hands the node colors to createMinimapNodeColorFn. The
 // default mode paints only groups and notes apart, and "Color by type" paints
 // each category (ColorUtils.ts getNodeCategoryColor). The two palettes swap the
 // group shade between themes, so the check reads rendered pixels in both.
 void miniMapColorsFollowTheColorMode() {
  QSettings().clear();
  struct Palette { bool dark; QStringList defaults; QStringList typed; QStringList absentInDefault; };
  const QList<Palette> palettes{
   {true, {"#94a3b8", "#6366f1", "#22c55e"}, {"#60a5fa", "#a78bfa", "#94a3b8", "#818cf8", "#4ade80", "#fbbf24"}, {"#60a5fa", "#a78bfa", "#fbbf24"}},
   {false, {"#64748b", "#818cf8", "#22c55e"}, {"#3b82f6", "#8b5cf6", "#64748b", "#6366f1", "#22c55e", "#f59e0b"}, {"#3b82f6", "#8b5cf6", "#f59e0b"}}};
  for (const auto &palette : palettes) {
   QSettings().clear();
   EditorWindow window;
   window.setDarkTheme(palette.dark);
   loadCategories(window);
   window.setMiniMapVisible(true);
   auto map = window.findChild<QWidget *>("mini-map");
   QVERIFY(map);
   QCOMPARE(window.miniMapColorMode(), QString("default"));
   auto image = miniMapImage(map);
   for (const auto &color : palette.defaults) { QVERIFY2(countPixels(image, color) > 12, qPrintable("default " + color)); }
   for (const auto &color : palette.absentInDefault) { QCOMPARE(countPixels(image, color), 0); }
   QVERIFY((window.setMiniMapColorMode("type"), true));
   QCOMPARE(window.miniMapColorMode(), QString("type"));
   image = miniMapImage(map);
   for (const auto &color : palette.typed) { QVERIFY2(countPixels(image, color) > 12, qPrintable("type " + color)); }
   // An unknown mode changes nothing.
   QVERIFY((window.setMiniMapColorMode("rainbow"), true));
   QCOMPARE(window.miniMapColorMode(), QString("type"));
  }
 }

 // MiniMapStore.ts persists colorMode, so a new window starts as the user left it.
 void miniMapColorModeIsRemembered() {
  QSettings().clear();
  {
   EditorWindow window;
   QCOMPARE(window.miniMapColorMode(), QString("default"));
   QVERIFY((window.setMiniMapColorMode("type"), true));
  }
  QCOMPARE(QSettings().value("minimap/colorMode").toString(), QString("type"));
  EditorWindow second;
  QCOMPARE(second.miniMapColorMode(), QString("type"));
  QVERIFY((second.setMiniMapColorMode("default"), true));
  QCOMPARE(QSettings().value("minimap/colorMode").toString(), QString("default"));
 }

 // The palette button sits above the mini-map's right edge (top -28px, right 0),
 // opens "Default colors" and "Color by type", and the legend button appears only
 // in type mode. The legend lists the six categories in the web order.
 void miniMapPaletteMenuAndLegend() {
  QSettings().clear();
  // The canvas chat opens on a wide window and would cover the mini-map.
  QSettings().setValue("canvas-chat-dock/collapsed", true);
  EditorWindow window;
  window.setDarkTheme(true);
  loadCategories(window);
  auto map = window.findChild<QWidget *>("mini-map");
  QVERIFY(map);
  auto *controls = widgetWithSource(window, "MiniMapControls.qml");
  QVERIFY(controls);
  QVERIFY(!controls->isVisible());
  window.setMiniMapVisible(true);
  QTRY_VERIFY(controls->isVisible());
  QVERIFY(map->isVisible());
  QCOMPARE(controls->geometry().right(), map->geometry().right());
  QVERIFY(controls->geometry().bottom() < map->geometry().top());
  auto *palette = findItem(controls->rootObject(), "mini-map-colors");
  auto *legendButton = findItem(controls->rootObject(), "mini-map-legend");
  QVERIFY(palette);
  QVERIFY(legendButton);
  QVERIFY(!legendButton->isVisible());
  const auto click = [](QQuickWidget *widget, QQuickItem *item) {
   const auto center = item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint();
   QTest::mouseClick(widget, Qt::LeftButton, Qt::NoModifier, center);
  };
  click(controls, palette);
  QQuickWidget *host = nullptr;
  QTRY_VERIFY((host = window.findChild<QQuickWidget *>("mini-map-popup-host")) && host->rootObject());
  QCOMPARE(host->rootObject()->property("kind").toString(), QString("colors"));
  QTRY_VERIFY(findItem(host->rootObject(), "mini-map-color-default"));
  auto *defaults = findItem(host->rootObject(), "mini-map-color-default");
  auto *typed = findItem(host->rootObject(), "mini-map-color-type");
  QVERIFY(typed);
  QCOMPARE(defaults->property("text").toString(), QString("Default colors"));
  QCOMPARE(typed->property("text").toString(), QString("Color by type"));
  QVERIFY(defaults->property("checked").toBool());
  QVERIFY(!typed->property("checked").toBool());
  const QString captureDir = qEnvironmentVariable("NODETOOL_MINIMAP_CAPTURE");
  const auto capture = [&](const QString &name) {
   if (captureDir.isEmpty()) { return; }
   QDir().mkpath(captureDir);
   QTest::qWait(300);
   QVERIFY(window.grab().save(captureDir + "/" + name + ".png"));
  };
  capture("colors-menu-dark");
  click(host, typed);
  QTRY_COMPARE(window.miniMapColorMode(), QString("type"));
  QTRY_VERIFY(!window.findChild<QQuickWidget *>("mini-map-popup-host"));
  QTRY_VERIFY(legendButton->isVisible());
  // The row grows by the legend button and keeps its right edge on the mini-map's.
  QTRY_VERIFY(controls->width() >= int(legendButton->width() + palette->width()));
  QTRY_COMPARE(controls->geometry().right(), map->geometry().right());
  click(controls, legendButton);
  QTRY_VERIFY((host = window.findChild<QQuickWidget *>("mini-map-popup-host")) && host->rootObject());
  QCOMPARE(host->rootObject()->property("kind").toString(), QString("legend"));
  const QList<QPair<QString, QString>> rows{{"input", "Input nodes"}, {"constant", "Constant nodes"}, {"processing", "Processing nodes"},
   {"group", "Group nodes"}, {"comment", "Comment nodes"}, {"output", "Output nodes"}};
  const QStringList colors{"#60a5fa", "#a78bfa", "#94a3b8", "#818cf8", "#4ade80", "#fbbf24"};
  QTRY_VERIFY(findItem(host->rootObject(), "mini-map-legend-title"));
  QCOMPARE(findItem(host->rootObject(), "mini-map-legend-title")->property("text").toString(), QString("Node types"));
  for (int i = 0; i < rows.size(); ++i) {
   auto *label = findItem(host->rootObject(), "mini-map-legend-label-" + rows[i].first);
   auto *swatch = findItem(host->rootObject(), "mini-map-legend-swatch-" + rows[i].first);
   QVERIFY2(label && swatch, qPrintable(rows[i].first));
   QCOMPARE(label->property("text").toString(), rows[i].second);
   QCOMPARE(colorOf(swatch).name(), colors[i]);
  }
  capture("legend-dark");
  QTest::keyClick(host, Qt::Key_Escape);
  QTRY_VERIFY(!window.findChild<QQuickWidget *>("mini-map-popup-host"));
  // Hiding the mini-map hides its controls too.
  window.setMiniMapVisible(false);
  QTRY_VERIFY(!controls->isVisible());
 }

 // ViewportStatusIndicator.tsx colors the zoom readout with the primary color
 // whenever the zoom matches one of the 25, 50, 75, 100, 150 and 200 percent presets.
 void zoomReadoutHighlightsEveryPreset() {
  EditorWindow window;
  window.setDarkTheme(true);
  loadCategories(window);
  setReducedMotion(window, true);
  auto *overlay = widgetWithSource(window, "ViewportIndicator.qml");
  QVERIFY(overlay);
  auto *label = findItem(overlay->rootObject(), "zoom-label");
  QVERIFY(label);
  auto *theme = singleton(window, "Theme");
  const auto primary = theme->property("accentPrimary").value<QColor>();
  const auto secondary = theme->property("textSecondary").value<QColor>();
  auto *view = viewOf(window);
  for (const auto &[zoom, preset] : QList<QPair<double, bool>>{{0.25, true}, {0.5, true}, {0.75, true}, {1.0, true}, {1.5, true}, {2.0, true}, {0.6, false}, {1.2, false}}) {
   // One zoom-in step from zoom / 1.2 lands on the zoom under test.
   view->setTransform(QTransform::fromScale(zoom / 1.2, zoom / 1.2));
   window.action("Zoom in");
   QVERIFY(std::abs(view->transform().m11() - zoom) < 1e-9);
   QCOMPARE(window.zoomIsPreset(), preset);
   QTRY_COMPARE(colorOf(label), preset ? primary : secondary);
  }
 }

 // The mini-map, status and card overlays take the same motion durations as the
 // ui_primitives tokens, and reduced motion moves the view at once.
 void fitAnimatesOverTheNormalMotionToken() {
  EditorWindow window;
  loadCategories(window);
  auto *view = viewOf(window);
  setReducedMotion(window, true);
  window.fit();
  const auto targetZoom = view->transform().m11();
  const auto targetCenter = view->mapToScene(view->viewport()->rect().center());
  QVERIFY(targetZoom < 0.9);
  window.action("Reset zoom");
  view->centerOn(0, 0);
  setReducedMotion(window, false);
  const auto startZoom = view->transform().m11();
  QCOMPARE(startZoom, 1.0);
  QVERIFY(!viewAnimation(window));
  // The status indicator's fit button is a user surface.
  auto *indicator = widgetWithSource(window, "ViewportIndicator.qml");
  QVERIFY(indicator);
  auto *fitButton = findItem(indicator->rootObject(), "fit-view");
  QVERIFY(fitButton);
  QTest::mouseClick(indicator, Qt::LeftButton, Qt::NoModifier, fitButton->mapToScene(QPointF(fitButton->width() / 2, fitButton->height() / 2)).toPoint());
  auto *animation = viewAnimation(window);
  QVERIFY(animation);
  QVERIFY(motionNormal(window) > 0);
  QCOMPARE(animation->duration(), motionNormal(window));
  QTest::qWait(motionNormal(window) / 2);
  const auto midZoom = view->transform().m11();
  QVERIFY2(midZoom < startZoom && midZoom > targetZoom, qPrintable(QString::number(midZoom)));
  QTRY_VERIFY(!viewAnimation(window));
  QVERIFY(std::abs(view->transform().m11() - targetZoom) < 1e-6);
  const auto center = view->mapToScene(view->viewport()->rect().center());
  QVERIFY(QLineF(center, targetCenter).length() < 1.5);
 }

 // With reduced motion every user viewport move lands before the call returns.
 void reducedMotionMovesTheViewAtOnce() {
  EditorWindow window;
  loadCategories(window);
  auto *view = viewOf(window);
  setReducedMotion(window, true);
  window.fit();
  const auto fitted = view->transform().m11();
  window.userAction("Reset zoom");
  QCOMPARE(view->transform().m11(), 1.0);
  QVERIFY(!viewAnimation(window));
  window.userAction("Zoom in");
  QVERIFY(std::abs(view->transform().m11() - 1.2) < 1e-9);
  window.userAction("Zoom out");
  QVERIFY(std::abs(view->transform().m11() - 1.0) < 1e-9);
  QVERIFY(!viewAnimation(window));
  window.userAction("Fit");
  QVERIFY(std::abs(view->transform().m11() - fitted) < 1e-6);
  QVERIFY(!viewAnimation(window));
  QVERIFY(window.selectNode("proc"));
  window.userAction("Fit selection");
  const auto selected = view->transform().m11();
  QVERIFY(selected > fitted);
  QVERIFY(!viewAnimation(window));
 }

 // The status indicator zooms about the center by 1.2 per step and React Flow
 // clamps zoomTo to MIN_ZOOM 0.12 and MAX_ZOOM 4, so a step at the edge lands on
 // the limit instead of doing nothing.
 // AxisMarker.tsx: 1px origin lines run right and down from (0, 0), never left or up.
 void originAxesRunRightAndDownFromTheOrigin() {
  EditorWindow window;
  QVERIFY(window.document()->load(QJsonObject{{"graph", QJsonObject{{"nodes", QJsonArray{}}, {"edges", QJsonArray{}}}}}));
  QImage image(200, 200, QImage::Format_RGB32);
  {
   QPainter painter(&image);
   window.scene()->render(&painter, QRectF(0, 0, 200, 200), QRectF(-100, -100, 200, 200));
  }
  const auto dark = window.scene()->theme().canvas.lightnessF() < .5;
  const auto axis = nodetool::axisMarkerColor(dark).rgb() & 0xffffff;
  const auto canvas = window.scene()->theme().canvas.rgb() & 0xffffff;
  // Scene x = 63 and y = 63 sit between grid crosses.
  QCOMPARE(image.pixel(163, 100) & 0xffffff, axis);
  QCOMPARE(image.pixel(100, 163) & 0xffffff, axis);
  QCOMPARE(image.pixel(37, 100) & 0xffffff, canvas);
  QCOMPARE(image.pixel(100, 37) & 0xffffff, canvas);
  QCOMPARE(image.pixel(163, 101) & 0xffffff, canvas);
 }
 void zoomStepsClampToTheWebZoomRange() {
  EditorWindow window;
  loadCategories(window);
  auto *view = viewOf(window);
  setReducedMotion(window, true);
  view->setTransform(QTransform::fromScale(3.9, 3.9));
  window.action("Zoom in");
  QVERIFY2(std::abs(view->transform().m11() - 4.0) < 1e-9, qPrintable(QString::number(view->transform().m11())));
  window.action("Zoom in");
  QVERIFY(std::abs(view->transform().m11() - 4.0) < 1e-9);
  view->setTransform(QTransform::fromScale(0.13, 0.13));
  window.action("Zoom out");
  QVERIFY2(std::abs(view->transform().m11() - 0.12) < 1e-9, qPrintable(QString::number(view->transform().m11())));
  window.action("Zoom out");
  QVERIFY(std::abs(view->transform().m11() - 0.12) < 1e-9);
 }

 // A zoom step and a preset animate over the normal motion token and end on the exact zoom.
 void zoomStepsAndPresetsAnimate() {
  EditorWindow window;
  loadCategories(window);
  auto *view = viewOf(window);
  setReducedMotion(window, true);
  window.action("Reset zoom");
  setReducedMotion(window, false);
  window.userAction("Zoom in");
  auto *animation = viewAnimation(window);
  QVERIFY(animation);
  QCOMPARE(animation->duration(), motionNormal(window));
  QTRY_VERIFY(!viewAnimation(window));
  QVERIFY(std::abs(view->transform().m11() - 1.2) < 1e-9);
  QTimer::singleShot(150, &window, [] {
   if (auto *menu = qobject_cast<QMenu *>(QApplication::activePopupWidget())) {
    for (auto *entry : menu->actions()) {
     if (entry->text() == "50%") { entry->trigger(); }
    }
    menu->close();
   }
  });
  QTimer::singleShot(2500, &window, [] { if (auto *popup = QApplication::activePopupWidget()) { popup->close(); } });
  window.userAction("Zoom presets");
  animation = viewAnimation(window);
  QVERIFY(animation);
  QCOMPARE(animation->duration(), motionNormal(window));
  QTRY_VERIFY(!viewAnimation(window));
  QVERIFY(std::abs(view->transform().m11() - 0.5) < 1e-9);
 }

 // A wheel, a pan or a mini-map drag takes the view back from a running animation.
 void inputStopsARunningViewAnimation() {
  EditorWindow window;
  loadCategories(window);
  auto *view = viewOf(window);
  setReducedMotion(window, true);
  window.action("Reset zoom");
  setReducedMotion(window, false);
  window.userAction("Fit");
  QVERIFY(viewAnimation(window));
  QTest::qWait(50);
  const auto point = QPointF(300, 300);
  QWheelEvent wheel(point, view->viewport()->mapToGlobal(point), QPoint(), QPoint(0, 120), Qt::NoButton, Qt::NoModifier, Qt::NoScrollPhase, false);
  QApplication::sendEvent(view->viewport(), &wheel);
  QVERIFY(!viewAnimation(window));
  const auto zoom = view->transform().m11();
  QTest::qWait(motionNormal(window) + 100);
  QCOMPARE(view->transform().m11(), zoom);
 }

 // NodeInfoPanel.tsx handleFocusClick: setCenter(node.x, node.y, { zoom: 1.5, duration: 300 }).
 void focusCentersTheNodeAtOneAndAHalfOverThreeHundred() {
  EditorWindow window;
  loadCategories(window);
  auto *view = viewOf(window);
  setReducedMotion(window, true);
  QVERIFY(window.selectNode("out"));
  QTest::qWait(60);
  QPointF node;
  auto *model = window.findChild<WorkflowGraphModel *>();
  QVERIFY(model);
  for (const auto id : model->allNodeIds()) {
   if (model->resourceId(id) == "out") { node = window.scene()->nodeGraphicsObject(id)->scenePos(); }
  }
  window.action("Reset zoom");
  view->centerOn(0, 0);
  const auto centerOfArea = [&] { return view->mapToScene(window.unobstructedViewport().center().toPoint()); };
  // Reduced motion lands at once.
  window.action("Focus node");
  QVERIFY(!viewAnimation(window));
  QVERIFY(std::abs(view->transform().m11() - 1.5) < 1e-9);
  QVERIFY2(QLineF(centerOfArea(), node).length() < 2, qPrintable(QString("%1,%2 vs %3,%4").arg(centerOfArea().x()).arg(centerOfArea().y()).arg(node.x()).arg(node.y())));
  window.action("Reset zoom");
  view->centerOn(0, 0);
  setReducedMotion(window, false);
  window.userAction("Focus node");
  auto *animation = viewAnimation(window);
  QVERIFY(animation);
  // The web has no 300 ms token, so the duration follows setCenter's.
  QCOMPARE(animation->duration(), 300);
  QTRY_VERIFY(!viewAnimation(window));
  QVERIFY(std::abs(view->transform().m11() - 1.5) < 1e-9);
  QVERIFY(QLineF(centerOfArea(), node).length() < 2);
 }

 // The Focus action needs one selected node.
 void focusWithoutASelectionDoesNothing() {
  EditorWindow window;
  loadCategories(window);
  auto *view = viewOf(window);
  setReducedMotion(window, true);
  window.action("Reset zoom");
  const auto before = view->transform();
  window.action("Focus node");
  QCOMPARE(view->transform(), before);
  QVERIFY(!viewAnimation(window));
 }

 // The inspector's Help tab is the native node info, so it carries the Focus button.
 void inspectorFocusButtonRunsFocus() {
  EditorWindow window;
  loadCategories(window);
  auto *view = viewOf(window);
  setReducedMotion(window, true);
  window.action("Reset zoom");
  QVERIFY(window.selectNode("proc"));
  QTRY_VERIFY(window.inspectorVisible());
  auto *inspector = widgetWithSource(window, "Inspector.qml");
  QVERIFY(inspector);
  inspector->rootObject()->setProperty("tab", 2);
  QTest::qWait(60);
  auto *button = findItem(inspector->rootObject(), "inspector-focus");
  QVERIFY(button);
  QVERIFY(button->isVisible());
  QCOMPARE(button->property("text").toString(), QString("Focus"));
  const auto center = button->mapToScene(QPointF(button->width() / 2, button->height() / 2)).toPoint();
  QTest::mouseClick(inspector, Qt::LeftButton, Qt::NoModifier, center);
  QTRY_VERIFY(std::abs(view->transform().m11() - 1.5) < 1e-9);
 }

 // Selecting a card that is off screen brings it into view with the same motion.
 // A programmatic selection brings an off-screen card into view at once, so a
 // caller that selects and then measures never reads a half-moved view.
 void programmaticRevealLandsAtOnce() {
  EditorWindow window;
  window.setCatalog({QJsonObject{{"node_type", "t"}, {"title", "T"}}});
  QVERIFY(window.document()->load(QJsonObject{{"graph", QJsonObject{{"nodes", QJsonArray{placed("near", "t", 0, 0), placed("far", "t", 6000, 0)}}, {"edges", QJsonArray{}}}}}));
  window.resize(1400, 900);
  window.show();
  QVERIFY(QTest::qWaitForWindowExposed(&window));
  auto *view = viewOf(window);
  setReducedMotion(window, false);
  window.action("Reset zoom");
  view->centerOn(0, 0);
  QTest::qWait(60);
  QVERIFY(window.selectNode("far"));
  QTRY_VERIFY(view->mapToScene(view->viewport()->rect()).boundingRect().right() > 6100);
  QVERIFY(!viewAnimation(window));
 }

 // The same actions without a user behind them move the view at once, even with
 // full motion on, so harnesses and tests read the final view straight away.
 void programmaticViewActionsLandAtOnce() {
  EditorWindow window;
  loadCategories(window);
  auto *view = viewOf(window);
  setReducedMotion(window, false);
  window.action("Reset zoom");
  QCOMPARE(view->transform().m11(), 1.0);
  window.action("Zoom in");
  QVERIFY(std::abs(view->transform().m11() - 1.2) < 1e-9);
  window.action("Fit");
  const auto fitted = view->transform().m11();
  QVERIFY(fitted < 0.9);
  QVERIFY(window.selectNode("proc"));
  window.action("Fit selection");
  QVERIFY(view->transform().m11() > fitted);
  window.action("Focus node");
  QVERIFY(std::abs(view->transform().m11() - 1.5) < 1e-9);
  QVERIFY(!viewAnimation(window));
 }
};
QTEST_MAIN(ViewportNavigatorTest)
#include "ViewportNavigatorTest.moc"
