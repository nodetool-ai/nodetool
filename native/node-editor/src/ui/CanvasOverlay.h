#pragma once

#include "canvas/CardOverlay.h"
#include "canvas/GraphCanvas.h"
#include "canvas/CanvasScene.h"
#include "canvas/NodeItem.h"
#include "ui/QuickCanvas.h"
#include <QQuickWindow>
#include <QMouseEvent>
#include <QWheelEvent>
#include <QPointer>
#include <QQuickItem>
#include <QQuickWidget>
#include <QQmlComponent>
#include <QQmlEngine>
#include <memory>
#include <optional>

namespace nodetool {

// UI thread only. Owns the QML root and places it on a card or in the viewport.
class CanvasOverlay {
  // UI thread only. The QML root owns this fallback item. Controls get the
  // event first, then the frame absorbs it before it reaches the canvas.
  class InputBarrier final : public QQuickItem {
  public:
    explicit InputBarrier(QQuickItem &root) : QQuickItem(&root) {
      // A visual sibling keeps the barrier out of QML positioners such as Row.
      // The root still owns it via QObject and stays above it within the host.
      setParentItem(root.parentItem());
      setAcceptedMouseButtons(Qt::AllButtons);
      const auto sync = [this, &root] { syncGeometry(root); };
      connect(&root, &QQuickItem::xChanged, this, sync);
      connect(&root, &QQuickItem::yChanged, this, sync);
      connect(&root, &QQuickItem::widthChanged, this, sync);
      connect(&root, &QQuickItem::heightChanged, this, sync);
      connect(&root, &QQuickItem::scaleChanged, this, sync);
      connect(&root, &QQuickItem::visibleChanged, this, [this, &root] { setVisible(root.isVisible()); });
      connect(&root, &QQuickItem::enabledChanged, this, [this, &root] { setEnabled(root.isEnabled()); });
      setVisible(root.isVisible());
      sync();
    }

    void passUnhandledWheelThrough() { absorbWheel_ = false; }

    void setRect(const QRectF &rect, const QQuickItem &root) {
      customRect_ = rect;
      syncGeometry(root);
    }

  protected:
    void mousePressEvent(QMouseEvent *event) override { event->accept(); }
    void mouseDoubleClickEvent(QMouseEvent *event) override { event->accept(); }
    void wheelEvent(QWheelEvent *event) override { event->setAccepted(absorbWheel_); }

  private:
    void syncGeometry(const QQuickItem &root) {
      const auto geometry = root.mapRectToItem(parentItem(), customRect_.value_or(root.boundingRect()));
      setPosition(geometry.topLeft());
      setSize(geometry.size());
    }

    std::optional<QRectF> customRect_;
    bool absorbWheel_ = true;
  };

public:
  enum class Placement { OnCard, AboveCards };
  CanvasOverlay(QQmlEngine &engine, canvas::GraphCanvas &graph, const QUrl &source,
                const QVariantMap &properties, qreal z, QtNodes::NodeId node, Placement placement) : graph_(&graph) {
    auto *card = node == QtNodes::InvalidNodeId ? nullptr : graph.scene().nodeItem(node);
    if (node != QtNodes::InvalidNodeId && !card) { return; }
    QQmlComponent component(&engine, source);
    std::unique_ptr<QObject> object(component.createWithInitialProperties(properties));
    if (auto *item = qobject_cast<QQuickItem *>(object.get())) {
      root_ = item;
      item->setVisible(false);
      if (card && placement == Placement::OnCard) {
        cardOverlay_ = std::make_unique<canvas::CardOverlay>(*card);
        cardOverlay_->setZ(z);
        cardOverlay_->setVisible(false);
        cardOverlay_->alignToViewport(graph);
        // The card overlay owns its QML content through the Qt parent tree.
        item->setParent(cardOverlay_.get());
        item->setParentItem(cardOverlay_.get());
      } else {
        ownedRoot_.reset(item);
        viewportHost_.setParentItem(&graph.overlayLayer());
        viewportHost_.setZ(z);
        item->setParentItem(&viewportHost_);
        if (card) {
          item->setOpacity(card->opacity());
          QObject::connect(card, &QQuickItem::opacityChanged, item, [item, card] { item->setOpacity(card->opacity()); });
        }
      }
      object.release();
      // The Qt parent owns the frame's input barrier.
      inputBarrier_ = new InputBarrier(*item);
      inputBarrier_->stackBefore(item);
      if (card) {
        cardDestroyed_ = QObject::connect(card, &QObject::destroyed, item, [this] {
          hide();
          setEnabled(false);
          if (graph_) { retireQuickRoot(*graph_); }
        });
      }
    } else {
      qWarning().noquote() << source << component.errorString();
    }
  }

  void retireQuickRoot(QObject &owner) {
    if (!root_) { return; }
    QObject::disconnect(cardDestroyed_);
    if (inputBarrier_) { inputBarrier_->setParentItem(nullptr); }
    root_->setParentItem(nullptr);
    root_->setParent(&owner);
    ownedRoot_.release();
    root_->deleteLater();
    root_.clear();
    inputBarrier_.clear();
  }

  ~CanvasOverlay() {
    QObject::disconnect(cardDestroyed_);
    if (graph_ && cardOverlay_) { graph_->setCardOverlayVisible(*cardOverlay_, false); }
  }

  static std::unique_ptr<CanvasOverlay> onQuickCanvas(QuickCanvas &surface, QQmlEngine &engine,
      const QUrl &source, const QVariantMap &properties, qreal z, QtNodes::NodeId node = QtNodes::InvalidNodeId,
      Placement placement = Placement::OnCard) {
    return std::make_unique<CanvasOverlay>(engine, surface.graphCanvas(), source, properties, z, node, placement);
  }

  QQuickItem *rootObject() const { return root_.data(); }
  void setInputRect(const QRectF &rect) {
    if (inputBarrier_ && root_) { inputBarrier_->setRect(rect, *root_); }
  }
  void setCardInteractiveArea(const QRegion &area) {
    if (cardOverlay_) { cardOverlay_->setInteractiveArea(area); }
    // A wheel event the player leaves unhandled reaches the canvas.
    if (inputBarrier_) { inputBarrier_->passUnhandledWheelThrough(); }
  }
  void setObjectName(const QString &name) {
    if (root_) { root_->setObjectName(name); }
  }
  QSize sizeHint() const {
    if (!root_) { return {}; }
    return QSizeF(root_->implicitWidth() > 0 ? root_->implicitWidth() : root_->width(),
                  root_->implicitHeight() > 0 ? root_->implicitHeight() : root_->height()).toSize();
  }
  QRect geometry() const {
    return root_ ? QRectF(root_->position(), root_->size()).toRect() : QRect{};
  }
  QPoint pos() const { return geometry().topLeft(); }
  int y() const { return geometry().y(); }
  int width() const { return geometry().width(); }
  void setGeometry(QRect rect) {
    if (cardOverlay_ && graph_) { cardOverlay_->alignToViewport(*graph_); }
    if (root_ && geometry() != rect) {
      root_->setPosition(rect.topLeft());
      root_->setSize(rect.size());
    }
  }
  void setGeometry(int x, int y, int w, int h) { setGeometry(QRect(x, y, w, h)); }
  void move(QPoint position) {
    if (root_) { root_->setPosition(position); }
  }
  void move(int x, int y) { move(QPoint(x, y)); }
  void setVisible(bool visible) {
    if (root_) {
      root_->setVisible(visible);
      if (cardOverlay_) {
        cardOverlay_->setVisible(visible);
        if (graph_) { graph_->setCardOverlayVisible(*cardOverlay_, visible); }
      }
    }
  }
  bool isVisible() const { return root_ && root_->isVisible(); }
  void setEnabled(bool enabled) {
    if (root_) { root_->setEnabled(enabled); }
  }
  bool containsGlobal(QPointF point) const {
    return root_ && root_->contains(root_->mapFromGlobal(point));
  }
  bool ownsFocus(QObject *receiver) const {
    if (!root_ || !root_->window()) { return false; }
    const auto *itemReceiver = qobject_cast<QQuickItem *>(receiver);
    const auto *widgetReceiver = qobject_cast<QQuickWidget *>(receiver);
    if (receiver != root_->window() && (!itemReceiver || itemReceiver->window() != root_->window()) &&
        (!widgetReceiver || widgetReceiver->quickWindow() != root_->window())) { return false; }
    for (auto *item = root_->window()->activeFocusItem(); item; item = item->parentItem()) {
      if (item == root_.data()) { return true; }
    }
    return false;
  }
  bool underMouse() const { return containsGlobal(QCursor::pos()); }
  QString objectName() const { return root_ ? root_->objectName() : QString{}; }
  void show() { setVisible(true); }
  void hide() { setVisible(false); }
  void setFocus(Qt::FocusReason reason) {
    if (root_) {
      if (graph_) { graph_->forceActiveFocus(reason); }
      root_->forceActiveFocus(reason);
    }
  }
  QPoint mapToGlobal(QPoint point) const {
    return root_ ? root_->mapToGlobal(point).toPoint() : point;
  }

private:
  QPointer<canvas::GraphCanvas> graph_;
  QQuickItem viewportHost_;
  std::unique_ptr<canvas::CardOverlay> cardOverlay_;
  std::unique_ptr<QQuickItem> ownedRoot_;
  QPointer<QQuickItem> root_;
  QPointer<InputBarrier> inputBarrier_;
  QMetaObject::Connection cardDestroyed_;
};

} // namespace nodetool
