#pragma once

#include "OverlayProbe.h"
#include "WidgetCanvasFixture.h"
#include <QVBoxLayout>

namespace nodetool::test {

// UI thread only. Owns the selected canvas surface. Qt owns the widget used
// to host the Quick scene, and the legacy scene outlives its surface.
class OverlayCanvasFixture {
public:
  explicit OverlayCanvasFixture(WorkflowGraphModel &model) {
    if (QuickCanvas::selected()) {
      surface_ = std::make_unique<QuickCanvas>(model, host_);
      // The host owns its layout and the Quick canvas widget.
      auto *layout = new QVBoxLayout(&host_);
      layout->setContentsMargins(0, 0, 0, 0);
      layout->addWidget(&surface_->hostWidget());
    } else {
      scene_ = std::make_unique<EditorScene>(model);
      view_ = std::make_unique<WidgetView>(scene_.get());
      surface_ = std::make_unique<QtNodesCanvas>(*scene_, *view_);
    }
  }

  CanvasSurface &surface() const { return *surface_; }
  QWidget &host() { return view_ ? static_cast<QWidget &>(*view_) : host_; }
  void show(QSize size, const QRectF &sceneRect, QPointF center) {
    if (view_) { view_->setSceneRect(sceneRect); }
    host().resize(size);
    host().show();
    surface_->centerOn(center);
  }
  OverlayProbe overlay(const QString &name) { return test::overlay(*surface_, host(), name); }
  EditorScene *legacyScene() const { return scene_.get(); }
  QuickCanvas *quick() const { return dynamic_cast<QuickCanvas *>(surface_.get()); }
  void setStackZ(QtNodes::NodeId node, double z) {
    if (auto *canvas = quick()) { canvas->canvasScene().nodeItem(node)->setStackZ(z); }
    else { graphicsNode(*scene_, node)->setZValue(z); }
  }

private:
  QWidget host_;
  std::unique_ptr<EditorScene> scene_;
  std::unique_ptr<WidgetView> view_;
  std::unique_ptr<CanvasSurface> surface_;
};

} // namespace nodetool::test
