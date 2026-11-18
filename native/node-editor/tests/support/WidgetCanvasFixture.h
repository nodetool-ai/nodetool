#pragma once

#include "graph/EditorScene.h"
#include "ui/QtNodesCanvas.h"
#include "ui/EditorWindow.h"
#include "ui/QuickCanvas.h"
#include <QtNodes/internal/NodeGraphicsObject.hpp>

namespace nodetool {
class EditorWindow;

namespace test {

// UI thread only. Fixtures for tests that exercise scene-item identity,
// drawing, or input behavior specific to the current widget renderer.
using WidgetView = QtNodesCanvasView;

inline WidgetView *widgetView(EditorWindow &window) {
  return qobject_cast<WidgetView *>(&window.canvas().hostWidget());
}

inline QtNodes::NodeGraphicsObject *graphicsNode(EditorScene &scene, QtNodes::NodeId id) {
  return QtNodesCanvas::graphicsNode(scene, id);
}

}
}

// Skips a test function on the Quick canvas when it reads QtNodes graphics
// items. node_editor_quick_canvas covers the Quick canvas's items.
#define NODETOOL_REQUIRE_QTNODES()                                                                    \
  do {                                                                                                \
    if (nodetool::QuickCanvas::selected()) { QSKIP("Reads QtNodes graphics items; see node_editor_quick_canvas."); } \
  } while (false)

namespace nodetool {
namespace test {

}
}
