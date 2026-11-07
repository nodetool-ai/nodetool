#include "LiveAudioVisualizer.h"
#include "PcmStream.h"
#include <QPainter>
#include <QGuiApplication>
#include <QPalette>
#include <QPainterPath>
#include <QQuickWindow>
#include <QQuickRenderControl>
namespace nodetool::node_editor {
LiveAudioVisualizer::LiveAudioVisualizer(QQuickItem *parent) : QQuickPaintedItem(parent) {
 const auto palette = QGuiApplication::palette();
 waveColor_ = palette.color(QPalette::Text);
 firstColor_ = secondColor_ = middleColor_ = fourthColor_ = lastColor_ = palette.color(QPalette::Highlight);
 setAntialiasing(true);
 connect(this, &LiveAudioVisualizer::appearanceChanged, this, [this] { update(); });
 connect(this, &QQuickItem::visibleChanged, this, &LiveAudioVisualizer::updateObservation);
 connect(this, &QQuickItem::windowChanged, this, [this](QQuickWindow *window) {
  disconnect(windowActiveConnection_);
  if (window) {
   auto host = QQuickRenderControl::renderWindowFor(window);
   windowActiveConnection_ = connect(host ? host : window, &QWindow::activeChanged, this, &LiveAudioVisualizer::updateObservation);
  }
  updateObservation();
 });
}
LiveAudioVisualizer::~LiveAudioVisualizer() { releaseObservation(); }
PcmStream *LiveAudioVisualizer::controller() const { return controller_; }
void LiveAudioVisualizer::releaseObservation() {
 if (observing_ && controller_) { controller_->removeVisualObserver(observedAnimated_); }
 observing_ = false;
}
void LiveAudioVisualizer::updateObservation() {
 auto host = window() ? QQuickRenderControl::renderWindowFor(window()) : nullptr;
 const bool active = host ? host->isActive() : window() && window()->isActive();
 const bool observe = controller_ && isVisible() && active;
 if (observing_ && (!observe || observedAnimated_ == reducedMotion_)) { releaseObservation(); }
 if (observe && !observing_) {
  observing_ = true; observedAnimated_ = !reducedMotion_;
  controller_->addVisualObserver(observedAnimated_); cacheFrame();
 }
}
void LiveAudioVisualizer::setController(PcmStream *controller) {
 if (controller_ == controller) { return; }
 releaseObservation(); disconnect(frameConnection_); disconnect(destroyedConnection_);
 controller_ = controller; frame_ = {};
 if (controller_) {
  frameConnection_ = connect(controller_, &PcmStream::visualFrameChanged, this, [this] { if (observing_) { cacheFrame(); } });
  destroyedConnection_ = connect(controller_, &QObject::destroyed, this, [this] {
   observing_ = false; controller_ = nullptr; frame_ = {}; update(); emit controllerChanged();
  });
 }
 updateObservation(); cacheFrame(); update(); emit controllerChanged();
}
void LiveAudioVisualizer::setReducedMotion(bool reduced) {
 if (reducedMotion_ == reduced) { return; }
 reducedMotion_ = reduced; updateObservation(); emit appearanceChanged();
}
void LiveAudioVisualizer::cacheFrame() {
 if (!controller_) { frame_ = {}; update(); return; }
 const auto &next = controller_->visualFrame();
 if (reducedMotion_ && next.generation == frame_.generation && frame_.sequence && next.sequence) { return; }
 frame_ = next; update();
}
void LiveAudioVisualizer::paint(QPainter *painter) {
 if (width() <= 0 || height() <= 0) { return; }
 painter->save(); painter->setClipRect(boundingRect());
 QLinearGradient gradient(0, 0, width(), 0);
 gradient.setColorAt(0, firstColor_); gradient.setColorAt(0.25, secondColor_); gradient.setColorAt(0.5, middleColor_);
 gradient.setColorAt(0.75, fourthColor_); gradient.setColorAt(1, lastColor_);
 painter->setPen(Qt::NoPen); painter->setBrush(gradient);
 const auto slot = width() / 64;
 for (std::size_t i = 0; i < 64; ++i) {
  const auto barHeight = std::max(strokeWidth_, static_cast<qreal>(frame_.spectrum[i * 8]) * height() * 0.9);
  painter->drawRect(QRectF(i * slot + slot * 0.2, height() - barHeight, slot * 0.6, barHeight));
 }
 QPainterPath trace;
 for (std::size_t i = 0; i < frame_.waveform.size(); ++i) {
  const QPointF point(static_cast<qreal>(i) * width() / frame_.waveform.size(), height() * 0.25 + frame_.waveform[i] * height() * 0.2);
  if (!i) { trace.moveTo(point); } else { trace.lineTo(point); }
 }
 auto wave = waveColor_; wave.setAlphaF(wave.alphaF() * 0.6);
 painter->setBrush(Qt::NoBrush); painter->setPen(QPen(wave, strokeWidth_)); painter->drawPath(trace); painter->restore();
}
}
