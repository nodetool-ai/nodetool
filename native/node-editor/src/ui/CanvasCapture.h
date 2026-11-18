#pragma once
#include <QImage>
#include <QString>

class QQuickWindow;
class QWidget;

// Captures of an editor window in two ways, so that a test can require them
// to agree (docs/plans/node-editor-quick-canvas/plan.md, Capture).
//   Scene:  what the process composes. QWidget::grab() for a widget window,
//           QQuickWindow::grabWindow() for a Quick window.
//   Screen: what the window system received, QScreen::grabWindow() of the
//           window id. It reads real pixels on xcb (under xvfb) and the
//           backing store on the offscreen platform.
// UI thread only. Every function returns a new image that the caller owns,
// and a null image when the window has no screen or the platform cannot read
// it back.
namespace nodetool::canvas_capture {
enum class Mode { Scene, Screen };
QString modeName(Mode mode);
QImage capture(QWidget &window, Mode mode);
QImage capture(QQuickWindow &window, Mode mode);
}
