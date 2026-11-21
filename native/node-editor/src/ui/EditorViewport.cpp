#include "ui/CanvasOverlay.h"
#include "ui/QuickCanvas.h"
#include "canvas/GraphCanvas.h"
#include "EditorWindow.h"
#include "graph/WorkflowGraphModel.h"
#include <QEasingCurve>
#include "canvas/MiniMapPainter.h"
#include <QScopedValueRollback>
#include <QQuickItem>
#include <QSettings>
#include <QVariantAnimation>
#include <algorithm>
#include <cmath>

// Viewport moves: the animated fit, zoom, preset, reveal and Focus transitions,
// and the mini-map color settings. The web sources are
//   components/node_editor/ViewportStatusIndicator.tsx   fit, zoom and preset durations
//   components/node_editor/NodeInfoPanel.tsx             Focus: setCenter at zoom 1.5 over 300 ms
//   components/node/MiniMapNavigator.tsx                 color mode menu and legend
namespace nodetool {
namespace {
// config/constants.ts MIN_ZOOM and MAX_ZOOM. React Flow clamps every zoomTo to them.
constexpr double minimumZoom = 0.12;
constexpr double maximumZoom = 4.0;
// NodeInfoPanel.tsx and useFindInWorkflow.ts center over 300 ms. ui_primitives has
// no token for it, so it follows setCenter.
constexpr int focusDurationMs = 300;
constexpr double focusZoom = 1.5;
// React Flow fitView padding 0.2 for the status indicator's Fit selection.
constexpr double fitSelectionPadding = 1.2;
}

void EditorWindow::cancelViewAnimation() {
  if (auto *animation = qobject_cast<QAbstractAnimation *>(viewAnimation_.data())) {
    animation->stop();
  }
  if (viewAnimation_) {
    // A cancelled move must not be found by name while it waits to be deleted.
    viewAnimation_->setObjectName({});
    viewAnimation_->deleteLater();
    viewAnimation_.clear();
  }
}

QPointF EditorWindow::centerOnArea(const QPointF &scenePoint, double zoom) const {
  const auto area = unobstructedViewport();
  return scenePoint + (QRectF(canvas_->viewportWidget().rect()).center() - area.center()) / zoom;
}

void EditorWindow::moveViewTo(double zoom, const QPointF &viewCenter, int durationMs) {
  zoom = std::clamp(zoom, minimumZoom, maximumZoom);
  const auto place = [this](double z, const QPointF &center) {
    canvas_->setView(z, center);
    emit zoomChanged();
  };
  cancelViewAnimation();
  const double fromZoom = canvas_->zoom();
  const auto fromCenter = canvas_->center();
  const bool arrived = std::abs(fromZoom - zoom) < 1e-9 && QLineF(fromCenter, viewCenter).length() * zoom < 0.5;
  if (durationMs <= 0 || canvasReducedMotion_ || !isVisible() || arrived) {
    place(zoom, viewCenter);
    canvas_->graphCanvas().finishZoomGesture();
    return;
  }
  auto *animation = new QVariantAnimation(this);
  viewAnimation_ = animation;
  animation->setObjectName("viewport-animation");
  animation->setDuration(durationMs);
  // React Flow's d3 transitions ease with a cubic in-out.
  animation->setEasingCurve(QEasingCurve::InOutCubic);
  animation->setStartValue(0.0);
  animation->setEndValue(1.0);
  connect(animation, &QVariantAnimation::valueChanged, this, [this, place, fromZoom, fromCenter, zoom, viewCenter](const QVariant &value) {
    const double t = value.toDouble();
    if (t >= 1.0) {
      place(zoom, viewCenter);
      canvas_->graphCanvas().finishZoomGesture();
      return;
    }
    place(fromZoom + (zoom - fromZoom) * t, fromCenter + (viewCenter - fromCenter) * t);
  });
  connect(animation, &QVariantAnimation::finished, animation, &QObject::deleteLater);
  animation->start();
}

// zoomTo keeps the viewport center, as React Flow does.
void EditorWindow::zoomTo(double zoom) {
  fitActive_ = false;
  const auto center = canvas_->center();
  moveViewTo(zoom, center, viewMs(motionNormalMs_));
}

void EditorWindow::userAction(const QString &name) {
  if (!tabOwner_) { activeEditor_->userAction(name); return; }
  const QScopedValueRollback user(userViewInput_, true);
  action(name);
}

void EditorWindow::fitView() {
  ensureProjected();
  fitActive_ = true;
  const auto target = fitTarget();
  moveViewTo(target.zoom, target.center, viewMs(motionNormalMs_));
}

void EditorWindow::fitSelection() {
  QRectF bounds;
  for (const auto id : canvas_->selection().nodes()) { bounds |= canvas_->nodeRect(id); }
  // With nothing selected the web fits every node.
  if (bounds.isEmpty()) { fitView(); return; }
  fitActive_ = false;
  const auto area = unobstructedViewport();
  const double zoom = std::clamp(std::min(area.width() / (bounds.width() * fitSelectionPadding), area.height() / (bounds.height() * fitSelectionPadding)), minimumZoom, maximumZoom);
  moveViewTo(zoom, centerOnArea(bounds.center(), zoom), viewMs(motionNormalMs_));
}

// NodeInfoPanel.tsx handleFocusClick centers on the node's position, its top left
// corner, at zoom 1.5 over 300 ms.
void EditorWindow::focusSelectedNode() {
  const auto ids = selectedIds();
  if (ids.size() != 1) { return; }
  focusNode(ids.first());
}
void EditorWindow::focusNode(const QString &resourceId) {
  for (auto id : model_.allNodeIds()) {
    if (model_.resourceId(id) != resourceId) { continue; }
    if (canvas_->hasNode(id)) {
      fitActive_ = false;
      moveViewTo(focusZoom, centerOnArea(canvas_->nodeOrigin(id), focusZoom), viewMs(focusDurationMs));
    }
    return;
  }
}

bool EditorWindow::zoomIsPreset() const {
  if (!tabOwner_) { return activeEditor_->zoomIsPreset(); }
  const double zoom = canvas_->zoom();
  for (const double preset : {0.25, 0.5, 0.75, 1.0, 1.5, 2.0}) {
    if (std::abs(preset - zoom) < 0.01) { return true; }
  }
  return false;
}

QString EditorWindow::miniMapColorMode() const {
  if (!tabOwner_) { return activeEditor_->miniMapColorMode(); }
  return miniMapColorMode_;
}

void EditorWindow::setMiniMapColorMode(const QString &mode) {
  if (mode != "default" && mode != "type") { return; }
  if (!tabOwner_) { activeEditor_->setMiniMapColorMode(mode); return; }
  QSettings().setValue("minimap/colorMode", mode);
  // The choice holds for every workflow tab, as in the web store.
  for (auto tab : tabOwner_->tabs_) {
    tab->miniMapColorMode_ = mode;
    tab->layoutOverlays();
    tab->schedulePanelChanged();
  }
}

void EditorWindow::closeMiniMapPopup() {
  if (!tabOwner_) { activeEditor_->closeMiniMapPopup(); return; }
  if (auto popup = std::move(miniMapPopup_)) {
    popup->hide();
    popup->retireQuickRoot(*this);
  }
}

void EditorWindow::showMiniMapPopup(const QString &kind, const QPointF &anchorGlobal) {
  if (!tabOwner_) { activeEditor_->showMiniMapPopup(kind, anchorGlobal); return; }
  closeMiniMapPopup();
  QVariantList legend;
  const bool dark = canvas_->scene().theme().canvas.lightnessF() < .5;
  const QHash<QString, QString> labels{{"input", tr("Input nodes")}, {"constant", tr("Constant nodes")}, {"processing", tr("Processing nodes")},
                                       {"group", tr("Group nodes")}, {"comment", tr("Comment nodes")}, {"output", tr("Output nodes")}};
  for (const auto &category : miniMapCategories()) {
    legend.append(QVariantMap{{"id", category}, {"label", labels.value(category)}, {"color", miniMapCategoryColor(category, dark)}});
  }
  const QVariantMap properties{{"viewport", QVariant::fromValue(&viewport_)}, {"kind", kind},
                               {"colorMode", miniMapColorMode_}, {"legend", legend}};
  miniMapPopup_ = CanvasOverlay::onQuickCanvas(*canvas_, *engine_,
      QUrl("qrc:/qt/qml/NodeTool/NodeEditor/MiniMapPopups.qml"), properties, 90);
  auto *root = miniMapPopup_->rootObject();
  if (!root) { miniMapPopup_.reset(); return; }
  miniMapPopup_->setObjectName("mini-map-popup-host");
  // The viewport-sized root only positions the popup. Qt Quick's popup
  // item handles its own frame and dismissal.
  miniMapPopup_->setInputRect({});
  miniMapPopup_->setGeometry(canvas_->hostWidget().rect());
  miniMapPopup_->show();
  const auto local = canvas_->hostWidget().mapFromGlobal(anchorGlobal.toPoint());
  QMetaObject::invokeMethod(root, "openAt", Q_ARG(QVariant, local.x()), Q_ARG(QVariant, local.y()));
}

}
