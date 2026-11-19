#pragma once

#include "CanvasProbe.h"
#include <QQmlEngine>
#include <QFileInfo>
#include <QQuickWindow>

namespace nodetool::test {

// UI thread only. Borrows an overlay root and the widget that receives its input.
class OverlayProbe {
public:
  OverlayProbe() = default;
  OverlayProbe(QQuickWidget &host, QQuickItem &root, bool shared)
      : host_(&host), root_(&root), shared_(shared) {}
  explicit operator bool() const { return host_ && root_; }
  const OverlayProbe *operator->() const { return this; }
  bool operator==(const OverlayProbe &other) const { return root_ == other.root_; }
  QQuickItem *rootObject() const { return root_; }
  bool isVisible() const { return root_ && host_->isVisible() && root_->isVisible(); }
  QQuickWindow *quickWindow() const { return root_->window(); }
  QWidget *inputWidget() const { return host_; }
  QWidget *parentWidget() const { return shared_ ? host_.data() : host_->parentWidget(); }
  QQmlEngine *engine() const { return qmlEngine(root_); }
  QSize size() const { return root_->size().toSize(); }
  QRect rect() const { return QRect(QPoint(), size()); }
  QRect geometry() const {
    return shared_ ? QRect(root_->mapToScene(QPointF()).toPoint(), size()) : host_->geometry();
  }
  QPoint pos() const { return geometry().topLeft(); }
  int x() const { return geometry().x(); }
  int y() const { return geometry().y(); }
  int width() const { return size().width(); }
  int height() const { return size().height(); }
  QPoint mapToGlobal(QPoint point) const { return host_->mapToGlobal(point); }
  void setFocus() const { host_->setFocus(); }
  QRect inWindow(QWidget &window) const {
    return QRect(window.mapFromGlobal(host_->mapToGlobal(shared_ ? pos() : QPoint())), size());
  }

private:
  QPointer<QQuickWidget> host_;
  QPointer<QQuickItem> root_;
  bool shared_ = false;
};

inline QQuickItem *findOverlayItem(QQuickItem &parent, const QString &name) {
  if (parent.objectName() == name) { return &parent; }
  for (auto *child : parent.childItems()) {
    if (auto *item = findOverlayItem(*child, name)) { return item; }
  }
  return nullptr;
}

inline OverlayProbe overlay(CanvasSurface &surface, QWidget &window, const QString &name, bool byFile = false,
                            bool visible = true) {
  if (auto *quick = dynamic_cast<QuickCanvas *>(&surface)) {
    const auto itemName = byFile ? QFileInfo(name).completeBaseName() : name;
    if (auto *root = findOverlayItem(quick->graphCanvas(), itemName); root && (!visible || root->isVisible())) {
      return {quick->quickWidget(), *root, true};
    }
  }
  for (auto *widget : window.findChildren<QQuickWidget *>()) {
    if ((byFile ? widget->source().fileName() : widget->objectName()) == name &&
        widget->rootObject() && (!visible || widget->isVisible())) {
      return {*widget, *widget->rootObject(), false};
    }
  }
  return {};
}

inline OverlayProbe overlay(EditorWindow &window, const QString &name, bool byFile = false, bool visible = true) {
  return overlay(window.canvas(), window, name, byFile, visible);
}

} // namespace nodetool::test
