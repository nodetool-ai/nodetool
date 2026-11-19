#pragma once

#include "OverlayProbe.h"
#include "graph/WorkflowGraphModel.h"
#include <QVBoxLayout>

namespace nodetool::test {

// UI thread only. The fixture owns the canvas. Its host owns the Quick widget.
class OverlayCanvasFixture {
public:
  explicit OverlayCanvasFixture(WorkflowGraphModel &model) : surface_(model, host_) {
    // The host owns its layout.
    auto *layout = new QVBoxLayout(&host_);
    layout->setContentsMargins(0, 0, 0, 0);
    layout->addWidget(&surface_.hostWidget());
  }

  QuickCanvas &surface() { return surface_; }
  QWidget &host() { return host_; }
  void show(QSize size, QPointF center) {
    host_.resize(size);
    host_.show();
    surface_.centerOn(center);
  }
  OverlayProbe overlay(const QString &name) { return test::overlay(surface_, host_, name); }
  void setStackZ(QtNodes::NodeId node, double z) { surface_.canvasScene().nodeItem(node)->setStackZ(z); }

private:
  QWidget host_;
  QuickCanvas surface_;
};

} // namespace nodetool::test
