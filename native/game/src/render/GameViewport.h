#pragma once
#include "assets/PreparedAssets.h"
#include "document/Schema.h"
#include "render/Scene2D.h"
#include "render/Scene3D.h"
#include <QImage>
#include <QMutex>
#include <QPointer>
#include <QQuickRhiItem>
#include <map>
#include <memory>
#include <mutex>
#include <optional>

namespace nodetool::game {
// A single immutable committed frame replaces the previous one. Simulation
// events are consumed by their own host channel and are never dropped by this
// mailbox.
class FrameMailbox {
public:
  void publish(Json frame) {
    auto value = std::make_shared<const Json>(std::move(frame));
    std::scoped_lock lock(mutex_);
    latest_ = std::move(value);
  }
  std::shared_ptr<const Json> latest() const {
    std::scoped_lock lock(mutex_);
    return latest_;
  }

private:
  mutable std::mutex mutex_;
  std::shared_ptr<const Json> latest_;
};

using RenderModels =
    std::map<std::string, std::shared_ptr<const PreparedModel>>;
class GameViewport : public QQuickRhiItem {
  Q_OBJECT
public:
  explicit GameViewport(QQuickItem *parent = nullptr);
  ~GameViewport() override;
  void setDocument(Json document);
  void setModels(std::shared_ptr<const RenderModels> models) {
    models_ = std::move(models);
    update();
  }
  void setImages(std::shared_ptr<const RenderImages> images) {
    images_ = std::move(images);
    update();
  }
  void setFonts(std::shared_ptr<const RenderFonts> fonts) {
    fonts_ = std::move(fonts);
    update();
  }
  void setMailbox(std::shared_ptr<FrameMailbox> mailbox);
  Json frame() const;
  static bool acceptsCameraLook(const Json &document);
  QString renderError() const { return error_; }
  Json report() const { return report_; }
  // Returns the authored action hit by the pointer. All HUD coordinates are
  // normalized, so capture and interactive input use the same layout.
  std::optional<std::string> actionAt(QPointF position) const;
  void setInputHandler(std::function<void(const Json &)> handler) {
    input_ = std::move(handler);
  }

protected:
  QQuickRhiItemRenderer *createRenderer() override;
  void mousePressEvent(QMouseEvent *event) override;
  void mouseMoveEvent(QMouseEvent *event) override;
  void mouseReleaseEvent(QMouseEvent *event) override;
  bool eventFilter(QObject *watched, QEvent *event) override;
  void hoverMoveEvent(QHoverEvent *event) override;
  void keyPressEvent(QKeyEvent *event) override;
  void keyReleaseEvent(QKeyEvent *event) override;

private:
  friend class GameViewportRenderer;
  Json document_;
  std::shared_ptr<const RenderModels> models_;
  std::shared_ptr<const RenderImages> images_;
  std::shared_ptr<const RenderFonts> fonts_;
  std::shared_ptr<FrameMailbox> mailbox_;
  QString error_;
  Json report_ = Json::object();
  std::function<void(const Json &)> input_;
  bool lookDragging_ = false;
  QPointF previousPointer_;
  QPointer<QQuickWindow> capturedWindow_;
  bool cameraLookInput() const;
  bool lookReleasedByUser_ = false;
  void captureLook();
  void releaseLook();
};
QImage paintHud(const Json &document, const Json &frame, QSize size);
} // namespace nodetool::game
