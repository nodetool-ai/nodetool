#pragma once

#include "ui/CanvasSurface.h"
#include "ui/EditorWindow.h"
#include <QTest>
#include <QWidget>

namespace nodetool::test {

// UI thread only. Coordinates for pointer helpers are viewport-local.
class CanvasProbe {
public:
  explicit CanvasProbe(EditorWindow &window) : window_(window) {}

  CanvasSurface &surface() const { return window_.canvas(); }
  QWidget *viewport() const { return &surface().viewportWidget(); }
  QRect nodeRectInWindow(QtNodes::NodeId id) const {
    if (!surface().hasNode(id)) { return {}; }
    const auto rect = surface().mapFromScene(surface().nodeRect(id));
    return {viewport()->mapTo(&window_, rect.topLeft()), rect.size()};
  }
  QPoint cardPoint(QtNodes::NodeId id, QPointF local) const {
    return surface().mapFromScene(surface().mapFromNode(id, local));
  }
  void click(QPoint point, Qt::MouseButton button = Qt::LeftButton,
             Qt::KeyboardModifiers modifiers = Qt::NoModifier) const {
    QTest::mouseClick(viewport(), button, modifiers, point);
  }
  void press(QPoint point, Qt::MouseButton button, Qt::KeyboardModifiers modifiers = Qt::NoModifier) const {
    QTest::mousePress(viewport(), button, modifiers, point);
  }
  void release(QPoint point, Qt::MouseButton button, Qt::KeyboardModifiers modifiers = Qt::NoModifier) const {
    QTest::mouseRelease(viewport(), button, modifiers, point);
  }
  void move(QPoint point) const { QTest::mouseMove(viewport(), point); }
  QImage renderCard(QtNodes::NodeId id) const { return surface().renderCard(id); }

private:
  EditorWindow &window_;
};

}
