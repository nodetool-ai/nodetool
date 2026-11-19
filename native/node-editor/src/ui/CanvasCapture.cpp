#include "ui/CanvasCapture.h"
#include <QPixmap>
#include <QQuickWindow>
#include <QScreen>
#include <QWidget>
#include <QWindow>

namespace nodetool::canvas_capture {
namespace {
// One pixel format for both modes, so that their pixels compare directly.
QImage normalized(QImage image) {
  if (image.isNull()) { return image; }
  return image.convertToFormat(QImage::Format_RGB32);
}
QImage screenOf(QWindow *window) {
  if (!window) { return {}; }
  QScreen *screen = window->screen();
  if (!screen) { return {}; }
  QImage image = screen->grabWindow(window->winId()).toImage();
  if (!image.isNull()) { image.setDevicePixelRatio(window->devicePixelRatio()); }
  return normalized(std::move(image));
}
}

QString modeName(Mode mode) { return mode == Mode::Scene ? QStringLiteral("scene") : QStringLiteral("screen"); }

QImage capture(QWidget &window, Mode mode) {
  if (mode == Mode::Scene) { return normalized(window.grab().toImage()); }
  return screenOf(window.window()->windowHandle());
}

QImage capture(QQuickWindow &window, Mode mode) {
  if (mode == Mode::Scene) { return normalized(window.grabWindow()); }
  return screenOf(&window);
}
}
