#include "EditorWindow.h"
#include "MiniMap.h"
#include "graph/EditorScene.h"
#include "graph/WorkflowGraphModel.h"
#include <QEasingCurve>
#include <QGraphicsView>
#include <QScopedValueRollback>
#include <QQuickItem>
#include <QQuickWidget>
#include <QSettings>
#include <QVariantAnimation>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
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
  return scenePoint + (QRectF(view_->viewport()->rect()).center() - area.center()) / zoom;
}

void EditorWindow::moveViewTo(double zoom, const QPointF &viewCenter, int durationMs) {
  zoom = std::clamp(zoom, minimumZoom, maximumZoom);
  const auto place = [this](double z, const QPointF &center) {
    view_->setTransformationAnchor(QGraphicsView::AnchorViewCenter);
    view_->setTransform(QTransform::fromScale(z, z));
    view_->centerOn(center);
    emit zoomChanged();
  };
  cancelViewAnimation();
  const double fromZoom = view_->transform().m11();
  const auto fromCenter = view_->viewportTransform().inverted().map(QRectF(view_->viewport()->rect()).center());
  const bool arrived = std::abs(fromZoom - zoom) < 1e-9 && QLineF(fromCenter, viewCenter).length() * zoom < 0.5;
  if (durationMs <= 0 || canvasReducedMotion_ || !isVisible() || arrived) {
    place(zoom, viewCenter);
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
  connect(animation, &QVariantAnimation::valueChanged, this, [place, fromZoom, fromCenter, zoom, viewCenter](const QVariant &value) {
    const double t = value.toDouble();
    if (t >= 1.0) {
      place(zoom, viewCenter);
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
  const auto center = view_->viewportTransform().inverted().map(QRectF(view_->viewport()->rect()).center());
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
  for (auto id : model_.allNodeIds()) {
    auto item = scene_->nodeGraphicsObject(id);
    if (item && item->isSelected()) { bounds |= item->mapRectToScene(QRectF(QPointF(), model_.layout(id).size)); }
  }
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
    if (auto item = scene_->nodeGraphicsObject(id)) {
      fitActive_ = false;
      moveViewTo(focusZoom, centerOnArea(item->scenePos(), focusZoom), viewMs(focusDurationMs));
    }
    return;
  }
}

bool EditorWindow::zoomIsPreset() const {
  if (!tabOwner_) { return activeEditor_->zoomIsPreset(); }
  const double zoom = view_->transform().m11();
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
    if (auto map = tab->view_->findChild<QWidget *>("mini-map")) { map->update(); }
    tab->layoutOverlays();
    tab->schedulePanelChanged();
  }
}

void EditorWindow::closeMiniMapPopup() {
  if (!tabOwner_) { activeEditor_->closeMiniMapPopup(); return; }
  if (!miniMapPopup_) { return; }
  miniMapPopup_->hide();
  miniMapPopup_->setObjectName({});
  miniMapPopup_->deleteLater();
  miniMapPopup_.clear();
}

void EditorWindow::showMiniMapPopup(const QString &kind, const QPointF &anchorGlobal) {
  if (!tabOwner_) { activeEditor_->showMiniMapPopup(kind, anchorGlobal); return; }
  closeMiniMapPopup();
  QVariantList legend;
  const bool dark = scene_->theme().canvas.lightnessF() < .5;
  const QHash<QString, QString> labels{{"input", tr("Input nodes")}, {"constant", tr("Constant nodes")}, {"processing", tr("Processing nodes")},
                                       {"group", tr("Group nodes")}, {"comment", tr("Comment nodes")}, {"output", tr("Output nodes")}};
  for (const auto &category : miniMapCategories()) {
    legend.append(QVariantMap{{"id", category}, {"label", labels.value(category)}, {"color", miniMapCategoryColor(category, dark)}});
  }
  // A transparent overlay over the window, so a popup can open past the mini-map's edge.
  auto *host = new QQuickWidget(engine_, this);
  miniMapPopup_ = host;
  host->setObjectName("mini-map-popup-host");
  host->setAttribute(Qt::WA_AlwaysStackOnTop);
  host->setAttribute(Qt::WA_TranslucentBackground);
  host->setClearColor(Qt::transparent);
  host->setResizeMode(QQuickWidget::SizeRootObjectToView);
  host->setGeometry(rect());
  host->setInitialProperties({{"viewport", QVariant::fromValue(&viewport_)}, {"kind", kind}, {"colorMode", miniMapColorMode_}, {"legend", legend}});
  host->setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/MiniMapPopups.qml"));
  if (!host->rootObject()) {
    closeMiniMapPopup();
    return;
  }
  host->show();
  host->raise();
  host->setFocus();
  const auto local = mapFromGlobal(anchorGlobal.toPoint());
  QMetaObject::invokeMethod(host->rootObject(), "openAt", Q_ARG(QVariant, local.x()), Q_ARG(QVariant, local.y()));
}

}
