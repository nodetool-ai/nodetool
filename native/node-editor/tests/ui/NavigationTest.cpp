#include "../support/OverlayProbe.h"
#include "../support/CanvasProbe.h"
#include "ui/EditorWindow.h"
#include "canvas/CanvasStyle.h"
#include <QApplication>
#include <QInputDialog>
#include <QTimer>
#include "EntryMenuSupport.h"
#include <QElapsedTimer>
#include <QClipboard>
#include <QCursor>
#include <QJsonDocument>
#include <QJsonArray>
#include <QSignalSpy>
#include <memory>
#include <vector>
#include <QNativeGestureEvent>
#include <QPointingDevice>
#include <QScrollBar>
#include <QSettings>
#include <QWheelEvent>
#include <QQuickWidget>
#include <QQuickItem>
#include <QtTest>
using namespace nodetool;
class NavigationTest final : public QObject {
  Q_OBJECT
private slots:
  void canvasNavigationSchemes() {
    const auto view = [](EditorWindow &window) { return nodetool::test::view(window); };
    const auto wheel = [&](EditorWindow &window, QPoint pixels, QPoint angle) {
      QWheelEvent event(QPointF(50, 50), QPointF(50, 50), pixels, angle, Qt::NoButton, Qt::NoModifier, Qt::ScrollUpdate, false);
      QApplication::sendEvent(view(window)->viewport(), &event);
    };
    QSettings().setValue("canvas/navigation", "trackpad");
    EditorWindow window;
    window.show();
    auto canvas = view(window);
    QVERIFY(canvas);
    const auto zoom = canvas->transform().m11();
    const auto x = canvas->horizontalScrollBar()->value();
    const auto y = canvas->verticalScrollBar()->value();
    wheel(window, QPoint(30, 40), QPoint(0, 120));
    QCOMPARE(canvas->transform().m11(), zoom);
    QCOMPARE(canvas->horizontalScrollBar()->value(), x - 30);
    QCOMPARE(canvas->verticalScrollBar()->value(), y - 40);
    QPointingDevice touchpad("touchpad", 1, QInputDevice::DeviceType::TouchPad, QPointingDevice::PointerType::Finger, QInputDevice::Capability::Position, 2, 0);
    QNativeGestureEvent pinch(Qt::ZoomNativeGesture, &touchpad, 2, QPointF(50, 50), QPointF(50, 50), QPointF(50, 50), 0.5, {}, 0);
    QApplication::sendEvent(canvas->viewport(), &pinch);
    QCOMPARE(canvas->transform().m11(), zoom * 1.5);
    QTest::mousePress(canvas->viewport(), Qt::LeftButton, Qt::NoModifier, QPoint(5, 5));
    QTest::mouseRelease(canvas->viewport(), Qt::LeftButton, Qt::NoModifier, QPoint(5, 5));
    QVERIFY(!canvas->handDrag());

    QSettings().setValue("canvas/navigation", "mouse");
    const auto pinched = canvas->transform().m11();
#ifdef Q_OS_MACOS
    // The stored setting has no effect on macOS: a swipe pans and a mouse wheel zooms.
    wheel(window, QPoint(30, 40), QPoint(0, 120));
    QCOMPARE(canvas->transform().m11(), pinched);
    QWheelEvent mouseWheel(QPointF(50, 50), QPointF(50, 50), QPoint(), QPoint(0, 120), Qt::NoButton, Qt::NoModifier, Qt::NoScrollPhase, false);
    QApplication::sendEvent(canvas->viewport(), &mouseWheel);
    QCOMPARE(canvas->transform().m11(), pinched * 1.15);
    QTest::mousePress(canvas->viewport(), Qt::LeftButton, Qt::NoModifier, QPoint(5, 5));
    QTest::mouseRelease(canvas->viewport(), Qt::LeftButton, Qt::NoModifier, QPoint(5, 5));
    QVERIFY(!canvas->handDrag());
#else
    wheel(window, QPoint(30, 40), QPoint(0, 120));
    QCOMPARE(canvas->transform().m11(), pinched * 1.15);
    QTest::mousePress(canvas->viewport(), Qt::LeftButton, Qt::NoModifier, QPoint(5, 5));
    QTest::mouseRelease(canvas->viewport(), Qt::LeftButton, Qt::NoModifier, QPoint(5, 5));
    QVERIFY(canvas->handDrag());
#endif
    QSettings().remove("canvas/navigation");
  }
  // Real gestures reach the window first, so this exercises the routing to the canvas.
  void windowRoutedGestures() {
    EditorWindow window;
    QSettings().setValue("canvas/navigation", "trackpad");
    window.resize(1200, 800);
    window.show();
    QVERIFY(QTest::qWaitForWindowExposed(&window));
    auto canvas = nodetool::test::view(window);
    const auto center = canvas->viewport()->rect().center();
    const QPointF local = canvas->viewport()->mapTo(&window, center);
    const QPointF global = canvas->viewport()->mapToGlobal(center);
    const auto zoom = canvas->transform().m11();
    const auto y = canvas->verticalScrollBar()->value();
    QWheelEvent swipe(local, global, QPoint(0, 40), QPoint(0, 120), Qt::NoButton, Qt::NoModifier, Qt::ScrollUpdate, false);
    QApplication::sendEvent(window.windowHandle(), &swipe);
    QCOMPARE(canvas->transform().m11(), zoom);
    QCOMPARE(canvas->verticalScrollBar()->value(), y - 40);
    QPointingDevice touchpad("touchpad", 1, QInputDevice::DeviceType::TouchPad, QPointingDevice::PointerType::Finger, QInputDevice::Capability::Position, 2, 0);
    QNativeGestureEvent pinch(Qt::ZoomNativeGesture, &touchpad, 2, local, local, global, 0.5, {}, 0);
    QApplication::sendEvent(window.windowHandle(), &pinch);
    QCOMPARE(canvas->transform().m11(), zoom * 1.5);
    QSettings().remove("canvas/navigation");
  }
  // Panels follow a box selection once, when the drag ends, not on every move.
  void boxSelectionRefreshesPanelsOnRelease() {
    QSettings().setValue("canvas/navigation", "trackpad");
    EditorWindow window;
    window.resize(1400, 900);
    window.show();
    QVERIFY(QTest::qWaitForWindowExposed(&window));
    QJsonArray commands;
    for (int i = 0; i < 30; ++i) {
      commands.append(QJsonObject{{"op", "addNode"}, {"node", QJsonObject{{"id", QString::number(i)}, {"type", "nodetool.workflows.base_node.Comment"}, {"data", QJsonObject{{"comment", "Text"}}}, {"ui_properties", QJsonObject{{"width", 80}, {"height", 40}, {"position", QJsonObject{{"x", (i % 6) * 100}, {"y", (i / 6) * 60}}}}}}}});
    }
    QVERIFY(window.document()->applyCommand({{"op", "batch"}, {"commands", commands}}));
    QCoreApplication::processEvents();
    auto canvas = nodetool::test::view(window);
    auto *viewport = canvas->viewport();
    canvas->centerOn(nodetool::test::itemsBoundingRect(window).center());
    const auto bounds = canvas->mapFromScene(nodetool::test::itemsBoundingRect(window)).boundingRect();
    QVERIFY2(viewport->rect().contains(bounds), qPrintable(QString("%1x%2").arg(viewport->width()).arg(viewport->height())));
    std::vector<std::unique_ptr<QSignalSpy>> spies;
    const auto editors = window.findChildren<EditorWindow *>();
    spies.push_back(std::make_unique<QSignalSpy>(&window, &EditorWindow::panelChanged));
    for (auto *editor : editors) { spies.push_back(std::make_unique<QSignalSpy>(editor, &EditorWindow::panelChanged)); }
    const auto refreshes = [&] { qsizetype total = 0; for (const auto &spy : spies) { total += spy->count(); } return total; };
    const auto start = bounds.topLeft() - QPoint(8, 8);
    QTest::mousePress(viewport, Qt::LeftButton, Qt::NoModifier, start);
    for (int i = 1; i <= 30; ++i) {
      const auto point = start + QPoint((bounds.width() + 16) * i / 30, (bounds.height() + 16) * i / 30);
      QMouseEvent move(QEvent::MouseMove, point, viewport->mapToGlobal(point), Qt::NoButton, Qt::LeftButton, Qt::NoModifier);
      QApplication::sendEvent(viewport, &move);
    }
    QCOMPARE(window.canvas().selection().count(), 30);
    QCOMPARE(refreshes(), 0);
    QTest::mouseRelease(viewport, Qt::LeftButton, Qt::NoModifier, bounds.bottomRight() + QPoint(8, 8));
    QTRY_VERIFY(refreshes() > 0);
    QSettings().remove("canvas/navigation");
  }
  // As on the web, a paste puts the first top-level node at the pointer.
  void pastePlacesNodesAtPointer() {
    EditorWindow window;
    window.resize(1200, 800);
    window.show();
    QVERIFY(QTest::qWaitForWindowExposed(&window));
    QVERIFY(window.document()->applyCommand({{"op", "addNode"}, {"node", QJsonObject{{"id", "source"}, {"type", "nodetool.workflows.base_node.Comment"}, {"data", QJsonObject{{"comment", "Text"}}}, {"ui_properties", QJsonObject{{"width", 120}, {"height", 60}, {"position", QJsonObject{{"x", 0}, {"y", 0}}}}}}}}));
    QApplication::clipboard()->setText(QString::fromUtf8(QJsonDocument(window.document()->copy({"source"})).toJson()));
    auto canvas = nodetool::test::view(window);
    auto *viewport = canvas->viewport();
    const auto pasted = [&] {
      QList<QPointF> positions;
      for (const auto &value : window.document()->snapshot()["graph"].toObject()["nodes"].toArray()) {
        const auto node = value.toObject();
        if (node["id"] == "source") { continue; }
        const auto position = node["ui_properties"].toObject()["position"].toObject();
        positions.append(QPointF(position["x"].toDouble(), position["y"].toDouble()));
      }
      return positions;
    };
    const QPoint pointer(200, 150);
    QCursor::setPos(viewport->mapToGlobal(pointer));
    QTRY_COMPARE(viewport->mapFromGlobal(QCursor::pos()), pointer);
    window.action("Paste");
    const auto expected = canvas->mapToScene(pointer);
    QTRY_COMPARE(pasted().size(), 1);
    QCOMPARE(pasted().first(), expected);
    window.action("Paste");
    QTRY_COMPARE(pasted().size(), 2);
    QVERIFY(pasted().contains(expected + QPointF(40, 40)));
    QCursor::setPos(viewport->mapToGlobal(QPoint(-50, -50)));
    window.action("Paste");
    QTRY_COMPARE(pasted().size(), 3);
    QVERIFY(pasted().contains(canvas->mapToScene(viewport->rect().center())));
  }
  // Select all changes the selection once, so panels refresh once.
  void selectAllNotifiesOnce() {
    EditorWindow window;
    window.resize(1200, 800);
    window.show();
    QVERIFY(QTest::qWaitForWindowExposed(&window));
    QJsonArray commands;
    for (int i = 0; i < 300; ++i) {
      commands.append(QJsonObject{{"op", "addNode"}, {"node", QJsonObject{{"id", QString::number(i)}, {"type", "nodetool.workflows.base_node.Comment"}, {"data", QJsonObject{{"comment", "Text"}}}, {"ui_properties", QJsonObject{{"width", 80}, {"height", 40}, {"position", QJsonObject{{"x", (i % 20) * 100}, {"y", (i / 20) * 60}}}}}}}});
    }
    QVERIFY(window.document()->applyCommand({{"op", "batch"}, {"commands", commands}}));
    QCoreApplication::processEvents();
    auto &selection = window.canvas().selection();
    QSignalSpy changes(&selection, &nodetool::CanvasSelection::selectionChanged);
    QElapsedTimer timer;
    timer.start();
    window.action("Select all");
    qInfo() << "select all ms" << timer.elapsed();
    QCOMPARE(selection.count(), 300);
    QCOMPARE(changes.count(), 1);
  }
  void arrangeSelectionMenuPreservesUndo() {
    EditorWindow window;
    window.show();
    for (int i = 0; i < 3; ++i) {
      QVERIFY(window.document()->applyCommand({{"op", "addNode"}, {"node", QJsonObject{{"id", QString::number(i)}, {"type", "nodetool.workflows.base_node.Comment"}, {"data", QJsonObject{{"comment", "Text"}}}, {"ui_properties", QJsonObject{{"width", 200 + i * 20}, {"height", 100}, {"position", QJsonObject{{"x", 100 + i * 300}, {"y", i * 40}}}}}}}}));
    }
    auto &model = window.scene()->graphModel();
    for (const auto id : model.allNodeIds()) { window.canvas().selection().setNode(id, true); }
    const auto initial = window.document()->snapshot();
    const auto undoIndex = window.document()->undoStack()->index();
    test::OverlayProbe toolbar;
    QTRY_VERIFY((toolbar = test::overlay(window, "SelectionToolbar.qml", true)));
    QTRY_VERIFY(toolbar->isVisible());
    auto arrangeButton = toolbar->rootObject()->findChild<QQuickItem *>("selection-arrange-selection");
    QVERIFY(arrangeButton);
    QTRY_VERIFY(arrangeButton->isEnabled());
    QTest::mouseClick(toolbar->quickWindow(), Qt::LeftButton, Qt::NoModifier,
                     arrangeButton->mapToScene(QPointF(arrangeButton->width() / 2, arrangeButton->height() / 2)).toPoint());
    auto *arrangeMenu = entry_menu::host(window, "arrange-selection-menu");
    QVERIFY(arrangeMenu);
    QVERIFY(entry_menu::entry(arrangeMenu, "Align left")["enabled"].toBool());
    QVERIFY(entry_menu::click(arrangeMenu, "Align left"));
    for (const auto &value : window.document()->nodes()) {
      QCOMPARE(value.toObject()["ui_properties"].toObject()["position"].toObject()["x"].toDouble(), 100.0);
    }
    QCOMPARE(window.document()->undoStack()->index(), undoIndex + 1);
    window.action("Undo");
    QCOMPARE(window.document()->snapshot(), initial);
    window.action("Clear selection");
    QTRY_VERIFY(!toolbar->isVisible());
  }
  void findByIdWithoutDocumentEdits() {
    EditorWindow window;
    window.show();
    for (const auto &id : {QString("first"), QString("second")}) {
      QVERIFY(window.document()->applyCommand({{"op", "addNode"}, {"node", QJsonObject{{"id", id}, {"type", "fixture.Text"}, {"ui_properties", QJsonObject{{"title", "Same title"}, {"position", QJsonObject{{"x", id == "first" ? 0 : 5000}, {"y", 0}}}}}}}}));
    }
    QVERIFY(window.selectNode("first"));
    const auto snapshot = window.document()->snapshot();
    const auto undo = window.document()->undoStack()->index();
    auto view = nodetool::test::view(window);
    QVERIFY(view);
    window.canvas().setFocus(Qt::OtherFocusReason);
    QTest::keyClick(view->widget(), Qt::Key_F, Qt::ControlModifier);
    QTRY_VERIFY(window.findChild<QQuickWidget *>("find-panel"));
    auto *panel = window.findChild<QQuickWidget *>("find-panel");
    QTest::keyClicks(panel, "SECOND");
    QTest::keyClick(panel, Qt::Key_Return);
    QTRY_VERIFY(!window.findChild<QQuickWidget *>("find-panel") || !window.findChild<QQuickWidget *>("find-panel")->isVisible());
    QCOMPARE(window.selection(), QString("second"));
    auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    nodetool::test::CardHandle found{nullptr, QtNodes::InvalidNodeId};
    for (const auto id : model.allNodeIds()) {
      if (model.resourceId(id) == "second") { found = nodetool::test::card(window, id); }
    }
    QVERIFY(found);
    QTRY_VERIFY(window.unobstructedViewport().contains(view->mapFromScene(found->scenePos() + QPointF(140, 30))));
    QCOMPARE(window.document()->snapshot(), snapshot);
    QCOMPARE(window.document()->undoStack()->index(), undo);
    QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);
    window.action("Find node");
    QTRY_VERIFY(window.findChild<QQuickWidget *>("find-panel"));
    panel = window.findChild<QQuickWidget *>("find-panel");
    QTest::keyClicks(panel, "first");
    QTest::keyClick(panel, Qt::Key_Escape);
    QTRY_VERIFY(!window.findChild<QQuickWidget *>("find-panel") || !window.findChild<QQuickWidget *>("find-panel")->isVisible());
    QCOMPARE(window.selection(), QString("second"));
    QCOMPARE(window.document()->snapshot(), snapshot);
  }
  void emptyGraphOpensPanelWithoutResults() {
    EditorWindow window;
    window.show();
    window.action("Find node");
    QTRY_VERIFY(window.findChild<QQuickWidget *>("find-panel"));
    auto *panel = window.findChild<QQuickWidget *>("find-panel");
    auto *controller = qvariant_cast<QObject *>(panel->rootObject()->property("controller"));
    QCOMPARE(controller->property("status").toString(), QString("Type to search nodes"));
    QTest::keyClicks(panel, "anything");
    QTRY_COMPARE(controller->property("status").toString(), QString("No nodes found"));
    QVERIFY(window.selection().isEmpty());
  }
  // Pinch/scroll end clears zoom settle at once, and wheel zoom ignores macOS
  // momentum coasting while trackpad pan keeps momentum.
  void zoomGestureEndAndMomentum() {
    QSettings().setValue("canvas/navigation", "trackpad");
    EditorWindow window;
    window.resize(1200, 800);
    window.show();
    QVERIFY(QTest::qWaitForWindowExposed(&window));
    QJsonArray commands;
    for (int i = 0; i < 4; ++i) {
      commands.append(QJsonObject{
          {"op", "addNode"},
          {"node", QJsonObject{{"id", QString("n%1").arg(i)},
                               {"type", "nodetool.workflows.base_node.Comment"},
                               {"data", QJsonObject{{"comment", "Sample text for zoom sharpening"}}},
                               {"ui_properties", QJsonObject{{"width", 220}, {"height", 120},
                                                             {"position", QJsonObject{{"x", (i % 2) * 280}, {"y", (i / 2) * 180}}}}}}}});
    }
    QVERIFY(window.document()->applyCommand({{"op", "batch"}, {"commands", commands}}));
    auto canvas = nodetool::test::view(window);
    auto &graph = window.canvas().graphCanvas();
    canvas->centerOn(nodetool::test::itemsBoundingRect(window).center());
    graph.flushRaster();

    const auto center = canvas->viewport()->rect().center();
    const QPointF local = canvas->viewport()->mapTo(&window, center);
    const QPointF global = canvas->viewport()->mapToGlobal(center);
    QPointingDevice touchpad("touchpad", 1, QInputDevice::DeviceType::TouchPad, QPointingDevice::PointerType::Finger,
                             QInputDevice::Capability::Position, 2, 0);
    QNativeGestureEvent pinch(Qt::ZoomNativeGesture, &touchpad, 2, local, local, global, 0.8, {}, 0);
    QApplication::sendEvent(window.windowHandle(), &pinch);
    QVERIFY(graph.zoomSettling());

    QElapsedTimer sharpenTimer;
    sharpenTimer.start();
    QNativeGestureEvent pinchEnd(Qt::EndNativeGesture, &touchpad, 2, local, local, global, 0.0, {}, 0);
    QApplication::sendEvent(window.windowHandle(), &pinchEnd);
    QVERIFY(!graph.zoomSettling());
    while (graph.rasterPending() && sharpenTimer.elapsed() < 1000) {
      QCoreApplication::processEvents(QEventLoop::AllEvents, 1);
    }
    QVERIFY(!graph.rasterPending());
    const auto sharpMs = sharpenTimer.elapsed();
    qInfo() << "small_graph_pinch_end_sharp_ms" << sharpMs;
    const double expectedScale = window.canvas().zoom() * window.devicePixelRatio();
    for (const auto *item : graph.scene().itemsIn(window.canvas().visibleSceneRect())) {
      if (item->kind() != nodetool::canvas::CanvasItem::Kind::Node) { continue; }
      QVERIFY(!item->tiles().isEmpty());
      for (const auto &tile : item->tiles()) {
        QVERIFY(qFuzzyCompare(tile.geometry.scale, expectedScale));
      }
    }

    // Zoom wheel ignores ScrollMomentum; ScrollEnd clears zoom settle immediately.
    const double zoomBefore = canvas->transform().m11();
    QWheelEvent zoomUpdate(QPointF(center), global, QPoint(), QPoint(0, 120), Qt::NoButton, Qt::ControlModifier,
                           Qt::ScrollUpdate, false);
    QApplication::sendEvent(canvas->viewport(), &zoomUpdate);
    const double zoomAfterUpdate = canvas->transform().m11();
    QVERIFY(zoomAfterUpdate > zoomBefore);
    QVERIFY(graph.zoomSettling());

    QWheelEvent zoomMomentum(QPointF(center), global, QPoint(), QPoint(0, 120), Qt::NoButton, Qt::ControlModifier,
                             Qt::ScrollMomentum, false);
    QApplication::sendEvent(canvas->viewport(), &zoomMomentum);
    QCOMPARE(canvas->transform().m11(), zoomAfterUpdate);

    QWheelEvent zoomEnd(QPointF(center), global, QPoint(), QPoint(), Qt::NoButton, Qt::ControlModifier,
                        Qt::ScrollEnd, false);
    QApplication::sendEvent(canvas->viewport(), &zoomEnd);
    QVERIFY(!graph.zoomSettling());

    // Trackpad panning preserves ScrollMomentum.
    const int scrollYBefore = canvas->verticalScrollBar()->value();
    QWheelEvent panMomentum(QPointF(center), global, QPoint(0, 30), QPoint(0, 120), Qt::NoButton, Qt::NoModifier,
                            Qt::ScrollMomentum, false);
    QApplication::sendEvent(canvas->viewport(), &panMomentum);
    QCOMPARE(canvas->verticalScrollBar()->value(), scrollYBefore - 30);
    QSettings().remove("canvas/navigation");
  }
};
QTEST_MAIN(NavigationTest)
#include "NavigationTest.moc"
