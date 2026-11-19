// node_editor_composition: the editor must look the same in a scene capture
// (what the process composes) and a screen capture (what the window system
// received). Each case puts a surface over a decoded video frame, or shows
// a translucent overlay, and compares the two captures where the covering
// surface must win. The cases come from the RHI spike of
// docs/plans/node-editor-quick-canvas/plan.md (Why, Capture).
//
// NODETOOL_COMPOSITION_BACKEND names the scene graph the run must use:
// "software" (the default) or "rhi". The check fails when Qt picked another
// one, because Qt falls back to software without a message.
// NODETOOL_COMPOSITION_CAPTURE_DIR saves both captures of every case.
#include "../support/CanvasProbe.h"
#include "../support/OverlayProbe.h"
#include "graph/WorkflowGraphModel.h"
#include "run/RunOutputModel.h"
#include "ui/CanvasCapture.h"
#include "ui/EditorWindow.h"
#include <QDir>
#include <QFile>
#include <QMediaPlayer>
#include <QQuickItem>
#include <QQuickWidget>
#include <QQuickWindow>
#include <QSettings>
#include <QStyleHints>
#include <QVideoFrame>
#include <QVideoSink>
#include <QtTest>
#include <algorithm>

using namespace nodetool;
namespace {
const QString VideoNode = QStringLiteral("11111111111111111111111111111111");
const QString CoverNode = QStringLiteral("33333333333333333333333333333333");
const QString GroupNode = QStringLiteral("44444444444444444444444444444444");
// Allow rounding when the two captures are converted to RGB.
constexpr int Tolerance = 2;

QJsonObject at(int x, int y) { return {{"position", QJsonObject{{"x", x}, {"y", y}}}}; }
QJsonArray catalog() {
  return {QJsonObject{{"node_type", "Fixture.Video"}, {"title", "Video output"},
            {"outputs", QJsonArray{QJsonObject{{"name", "value"}, {"type", QJsonObject{{"type", "video"}}}}}}},
          QJsonObject{{"node_type", "Fixture.Text"}, {"title", "Text"}, {"input_fields", QJsonArray{"in"}},
            {"properties", QJsonArray{QJsonObject{{"name", "in"}, {"type", QJsonObject{{"type", "video"}}}}}},
            {"outputs", QJsonArray{QJsonObject{{"name", "out"}, {"type", QJsonObject{{"type", "str"}}}}}}}};
}
test::OverlayProbe overlay(EditorWindow &window, const QString &name) {
  return test::overlay(window, name);
}
QtNodes::NodeId nodeId(EditorWindow &window, const QString &resource) {
  auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
  for (const auto id : model.allNodeIds()) {
    if (model.resourceId(id) == resource) { return id; }
  }
  return QtNodes::InvalidNodeId;
}
// The card body of a node, in window coordinates.
QRect cardRect(EditorWindow &window, const QString &resource) {
  return test::CanvasProbe(window).nodeRectInWindow(nodeId(window, resource));
}
}

class CompositionTest final : public QObject {
  Q_OBJECT
  std::unique_ptr<EditorWindow> window_;
  test::OverlayProbe media_;
  QSize frameSize_;

  void showVideo(QPoint coverPosition = {100, 60}) {
    const QJsonObject workflow{{"name", "Composition"}, {"graph", QJsonObject{{"nodes", QJsonArray{
      QJsonObject{{"id", VideoNode}, {"type", "Fixture.Video"}, {"ui_properties", at(0, 0)}},
      QJsonObject{{"id", CoverNode}, {"type", "Fixture.Text"}, {"ui_properties", at(coverPosition.x(), coverPosition.y())}}}},
      {"edges", QJsonArray{}}}}};
    showWorkflow(workflow);
    QFile video(QStringLiteral(MEDIA_VIDEO_FIXTURE));
    QVERIFY(video.open(QIODevice::ReadOnly));
    window_->runOutput()->beginRun("composition");
    window_->runOutput()->ingest("composition", {{"type", "output_update"}, {"job_id", "composition"}, {"node_id", VideoNode},
      {"output_name", "value"}, {"value", QJsonObject{{"type", "video"},
        {"uri", "data:video/mp4;base64," + QString::fromLatin1(video.readAll().toBase64())}}}});
    QTRY_VERIFY_WITH_TIMEOUT((media_ = overlay(*window_, "canvas-media-" + VideoNode)), 10000);
    QMediaPlayer *player = nullptr;
    QTRY_VERIFY_WITH_TIMEOUT((player = media_->rootObject()->findChild<QMediaPlayer *>("preview-player")) && player->duration() > 1000, 10000);
    auto *picture = media_->rootObject()->findChild<QQuickItem *>("preview-video");
    QVERIFY(picture);
    player->play();
    QTRY_VERIFY_WITH_TIMEOUT(picture->property("hasFrame").toBool(), 10000);
    // Both capture paths must see the same decoded frame.
    player->pause();
    QTRY_COMPARE(player->playbackState(), QMediaPlayer::PausedState);
    frameSize_ = player->videoSink()->videoFrame().size();
    requireBackend(media_);
  }
  QRect itemRectInWindow(const QQuickItem &item, const QRectF &localRect) const {
    const auto &host = window_->canvas().quickWidget();
    return item.mapRectToScene(localRect).translated(host.mapTo(window_.get(), QPoint())).toAlignedRect();
  }
  QRect mediaPictureRect() const {
    const auto *video = media_->rootObject()->findChild<QQuickItem *>("preview-video");
    if (!video || frameSize_.isEmpty()) { return {}; }
    const auto size = QSizeF(frameSize_).scaled(video->size(), Qt::KeepAspectRatio);
    const auto origin = video->boundingRect().center() - QPointF(size.width() / 2, size.height() / 2);
    return itemRectInWindow(*video, QRectF(origin, size));
  }
  void showWorkflow(const QJsonObject &workflow) {
    window_ = std::make_unique<EditorWindow>();
    window_->resize(1400, 900);
    window_->setCatalog(catalog());
    QVERIFY(window_->document()->load(workflow));
    window_->show();
    QVERIFY(QTest::qWaitForWindowExposed(window_.get()));
    window_->action("Reset zoom");
  }
  void requireBackend(const test::OverlayProbe &widget) {
    const auto *renderer = widget->quickWindow()->rendererInterface();
    QVERIFY(renderer);
    const auto api = renderer->graphicsApi();
    const auto want = qEnvironmentVariable("NODETOOL_COMPOSITION_BACKEND", QStringLiteral("software"));
    if (want == QStringLiteral("software")) {
      QCOMPARE(api, QSGRendererInterface::Software);
      return;
    }
    QCOMPARE(want, QStringLiteral("rhi"));
    QVERIFY(api != QSGRendererInterface::Unknown && api != QSGRendererInterface::Null &&
            api != QSGRendererInterface::Software);
    const auto rhi = qEnvironmentVariable("QSG_RHI_BACKEND");
    if (rhi == QStringLiteral("opengl")) {
      QCOMPARE(api, QSGRendererInterface::OpenGL);
    } else if (rhi == QStringLiteral("vulkan")) {
      QCOMPARE(api, QSGRendererInterface::Vulkan);
    }
  }
  // Compares the two captures inside region, in window coordinates.
  void compare(const QString &name, QRect region) {
    QVERIFY2(!region.isEmpty(), "The case has no covered region");
    // Let the paused frame and overlay changes reach the top-level backing store.
    QTest::qWait(300);
    const QImage scene = window_->canvas().capture(canvas_capture::Mode::Scene);
    const QImage screen = window_->canvas().capture(canvas_capture::Mode::Screen);
    QVERIFY(!scene.isNull());
    QVERIFY2(!screen.isNull(), "The platform cannot read the window back");
    if (const auto dir = qEnvironmentVariable("NODETOOL_COMPOSITION_CAPTURE_DIR"); !dir.isEmpty()) {
      const auto prefix = QDir(dir).filePath(name + "-" + qEnvironmentVariable("NODETOOL_COMPOSITION_BACKEND", QStringLiteral("software")));
      scene.save(prefix + "-scene.png");
      screen.save(prefix + "-screen.png");
    }
    const qreal ratio = scene.devicePixelRatio();
    const QRect pixels = QRect(QPoint(qFloor(region.left() * ratio), qFloor(region.top() * ratio)),
                               QPoint(qCeil((region.right() + 1) * ratio) - 1, qCeil((region.bottom() + 1) * ratio) - 1))
                             .intersected(scene.rect()).intersected(screen.rect());
    QVERIFY(!pixels.isEmpty());
    int differing = 0;
    for (int y = pixels.top(); y <= pixels.bottom(); ++y) {
      const auto *a = reinterpret_cast<const QRgb *>(scene.constScanLine(y));
      const auto *b = reinterpret_cast<const QRgb *>(screen.constScanLine(y));
      for (int x = pixels.left(); x <= pixels.right(); ++x) {
        const int delta = std::max({std::abs(qRed(a[x]) - qRed(b[x])), std::abs(qGreen(a[x]) - qGreen(b[x])),
                                    std::abs(qBlue(a[x]) - qBlue(b[x]))});
        if (delta > Tolerance) { ++differing; }
      }
    }
    qInfo().nospace() << name << " region=" << region << " pixels=" << pixels.width() * pixels.height() << " differing=" << differing;
    QVERIFY2(differing == 0, qPrintable(QStringLiteral("%1 of %2 pixels differ between the scene and the screen capture")
                                            .arg(differing).arg(pixels.width() * pixels.height())));
  }

private slots:
  void initTestCase() {
    // A blinking caret would differ between two captures taken apart in time.
    QGuiApplication::styleHints()->setCursorFlashTime(0);
  }
  // The chat window opens by default on a wide window. Only the chat case wants it.
  void init() { QSettings().setValue(QStringLiteral("canvas-chat-dock/collapsed"), true); }
  void cleanup() {
    media_ = {};
    window_.reset();
  }
  // The text card's body hides the video when the text card is on top.
  void mediaUnderCard() {
    showVideo();
    QVERIFY(media_);
    auto &quick = window_->canvas();
    auto &graph = quick.graphCanvas();
    auto *cover = graph.scene().nodeItem(nodeId(*window_, CoverNode));
    auto *video = graph.scene().nodeItem(nodeId(*window_, VideoNode));
    QVERIFY(cover);
    QVERIFY(video);
    cover->setStackZ(video->stackZ() + 1);
    const auto covered = cardRect(*window_, CoverNode).intersected(mediaPictureRect()).adjusted(2, 2, -2, -2);
    QVERIFY(!covered.isEmpty());
    compare("media-under-card", covered);
    const auto sample = [&](QPoint point) {
      const auto image = quick.quickWidget().grabFramebuffer();
      const auto viewportPoint = quick.viewportWidget().mapFrom(window_.get(), point);
      return image.pixelColor((QPointF(viewportPoint) * image.devicePixelRatio()).toPoint());
    };
    const auto point = covered.center();
    const auto withMedia = sample(point);
    auto *picture = media_->rootObject()->findChild<QQuickItem *>("preview-video");
    QVERIFY(picture);
    picture->setVisible(false);
    QCOMPARE(sample(point), withMedia);
    picture->setVisible(true);
    // Reversing the stack exposes the video at that same pixel.
    cover->setStackZ(video->stackZ() - 1);
    const auto exposed = sample(point);
    picture->setVisible(false);
    QVERIFY(exposed != sample(point));
    QVERIFY(exposed != withMedia);
  }
  // The chat window floats over the canvas, so it hides the preview below it.
  void mediaUnderChat() {
    QSettings().setValue(QStringLiteral("canvas-chat-dock/collapsed"), false);
    showVideo();
    QVERIFY(media_);
    test::OverlayProbe chat;
    QTRY_VERIFY((chat = overlay(*window_, "editor-chat-overlay")));
    // Pan until the chat window covers the right half of the preview.
    auto &canvas = window_->canvas();
    const auto shift = mediaPictureRect().center().x() - chat->inWindow(*window_).left();
    canvas.setHorizontalOffset(canvas.horizontalOffset() + shift);
    QTRY_VERIFY((media_ = overlay(*window_, "canvas-media-" + VideoNode)) &&
                chat->inWindow(*window_).intersected(mediaPictureRect()).width() >=
                    std::max(1, mediaPictureRect().width() / 4));
    compare("media-under-chat", chat->inWindow(*window_).intersected(mediaPictureRect()));
  }
  // The inline note editor of the text card opens below that card, over the preview.
  void mediaUnderNoteEditor() {
    showVideo({100, -10});
    QVERIFY(media_);
    QVERIFY(window_->selectNode(CoverNode));
    window_->action("Edit note");
    test::OverlayProbe editor;
    QTRY_VERIFY((editor = overlay(*window_, "inline-title-overlay")));
    const auto *field = test::findOverlayItem(*editor->rootObject(), "inline-title-scroll");
    QVERIFY(field);
    const auto editorBounds = itemRectInWindow(*field, field->boundingRect());
    compare("media-under-note-editor", editorBounds.intersected(mediaPictureRect()));
  }
  // The header controls of a selected group are a translucent overlay without
  // WA_AlwaysStackOnTop: the canvas must show through around the buttons.
  void translucentOverlay() {
    showWorkflow({{"name", "Composition"}, {"graph", QJsonObject{{"nodes", QJsonArray{
      QJsonObject{{"id", GroupNode}, {"type", "nodetool.workflows.base_node.Group"},
        {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 0}, {"y", 0}}}, {"width", 400}, {"height", 220}}}}}},
      {"edges", QJsonArray{}}}}});
    QVERIFY(window_->selectNode(GroupNode));
    test::OverlayProbe controls;
    QTRY_VERIFY((controls = overlay(*window_, "authored-controls-" + GroupNode)));
    requireBackend(controls);
    compare("translucent-overlay", controls->inWindow(*window_));
  }
};
QTEST_MAIN(CompositionTest)
#include "CompositionTest.moc"
