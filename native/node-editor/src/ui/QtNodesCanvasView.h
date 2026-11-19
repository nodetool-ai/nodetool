#pragma once

#include <QGraphicsView>

namespace nodetool {

// UI thread only. Widget input host for the QtNodes canvas.
class QtNodesCanvasView final : public QGraphicsView {
  Q_OBJECT
public:
  using QGraphicsView::QGraphicsView;
};

}
