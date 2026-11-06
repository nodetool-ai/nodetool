#include "ui/EditorWindow.h"
#include "media/VideoFrameView.h"
#include <QApplication>
#include <QBuffer>
#include <QDataStream>
#include <QDir>
#include <QFile>
#include <QImage>
#include <QMediaPlayer>
#include <QPointer>
#include <QQuickItem>
#include <QQuickWidget>
#include <QVideoFrame>
#include <QVideoSink>
#include <QWheelEvent>
#include <QtTest>
using namespace nodetool;
namespace {
const QString NodeId = "33333333333333333333333333333333";
QString imageUri(const QColor &color) {
  QImage image(32, 24, QImage::Format_RGB32); image.fill(color);
  QByteArray bytes; QBuffer buffer(&bytes); buffer.open(QIODevice::WriteOnly); image.save(&buffer, "PNG");
  return "data:image/png;base64," + QString::fromLatin1(bytes.toBase64());
}
QString audioUri() {
  QByteArray bytes; QDataStream stream(&bytes, QIODevice::WriteOnly); stream.setByteOrder(QDataStream::LittleEndian);
  stream.writeRawData("RIFF", 4); stream << quint32(48036); stream.writeRawData("WAVEfmt ", 8);
  stream << quint32(16) << quint16(1) << quint16(1) << quint32(8000) << quint32(16000) << quint16(2) << quint16(16);
  stream.writeRawData("data", 4); stream << quint32(48000);
  for (int i = 0; i < 24000; ++i) { stream << qint16(i % 16 < 8 ? 12000 : -12000); }
  return "data:audio/wav;base64," + QString::fromLatin1(bytes.toBase64());
}
QJsonObject media(const QString &kind, const QString &uri) { return {{"type", kind}, {"uri", uri}}; }
QQuickWidget *canvas(EditorWindow &window) {
  for (auto widget : window.findChildren<QQuickWidget *>()) {
    if (widget->isVisible() && widget->objectName() == "canvas-media-" + NodeId) { return widget; }
  }
  return nullptr;
}
QQuickWidget *panel(EditorWindow &window) {
  for (auto widget : window.findChildren<QQuickWidget *>()) { if (widget->source().fileName() == "RunOutput.qml") { return widget; } }
  return nullptr;
}
QQuickItem *findItem(QQuickItem *root, const QString &name) {
  if (!root) { return nullptr; }
  if (root->objectName() == name) { return root; }
  for (auto child : root->childItems()) { if (auto item = findItem(child, name)) { return item; } }
  return nullptr;
}
QMediaPlayer *findPlayer(QQuickItem *root) {
  if (!root) { return nullptr; }
  if (auto result = root->findChild<QMediaPlayer *>("preview-player", Qt::FindDirectChildrenOnly)) { return result; }
  for (auto child : root->childItems()) { if (auto result = findPlayer(child)) { return result; } }
  return nullptr;
}
QQuickItem *gallery(QQuickWidget *widget) { return widget && widget->rootObject() ? findItem(widget->rootObject(), widget->objectName().startsWith("canvas-media-") ? "canvas-media-preview" : "output-gallery") : nullptr; }
QMediaPlayer *player(QQuickWidget *widget) { return widget ? findPlayer(widget->rootObject()) : nullptr; }
QQuickItem *control(QQuickWidget *widget, const QString &name) { return widget ? findItem(widget->rootObject(), name) : nullptr; }
void polish(QQuickItem *item) {
  if (!item) { return; }
  item->ensurePolished();
  for (auto child : item->childItems()) { polish(child); }
}
bool click(QQuickWidget *widget, const QString &name) {
  if (widget) { polish(widget->rootObject()); }
  auto item = control(widget, name); if (!widget || !item || !item->isVisible()) { return false; }
  QTest::mouseClick(widget, Qt::LeftButton, Qt::NoModifier, item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint());
  return true;
}
bool openTile(QQuickWidget *widget, const QString &name) {
  if (widget) { polish(widget->rootObject()); }
  const auto item = control(widget, name);
  if (!widget || !item || !item->isVisible()) { return false; }
  const auto point = item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint();
  QTest::mouseDClick(widget, Qt::LeftButton, Qt::NoModifier, point);
  return true;
}
bool scrollGrid(QQuickWidget *widget, int pixels) {
  if (widget) { polish(widget->rootObject()); }
  const auto grid = control(widget, "gallery-grid-scroll");
  if (!widget || !grid) { return false; }
  const auto point = grid->mapToScene(QPointF(grid->width() / 2, grid->height() / 2));
  QTest::mouseMove(widget, point.toPoint());
  QWheelEvent wheel(point, widget->mapToGlobal(point.toPoint()), QPoint(0, pixels), QPoint(0, pixels < 0 ? -120 : 120), Qt::NoButton, Qt::NoModifier, Qt::NoScrollPhase, false);
  QCoreApplication::sendEvent(widget, &wheel);
  return wheel.isAccepted();
}
bool scrollToEnd(QQuickWidget *widget) {
  if (widget) { polish(widget->rootObject()); }
  const auto bar = control(widget, "gallery-grid-scrollbar");
  if (!widget || !bar) { return false; }
  const auto handle = bar->property("contentItem").value<QQuickItem *>();
  if (!handle) { return false; }
  const auto start = handle->mapToScene(QPointF(handle->width() / 2, handle->height() / 2)).toPoint();
  const auto end = bar->mapToScene(QPointF(bar->width() / 2, bar->height() - 1)).toPoint();
  QTest::mousePress(widget, Qt::LeftButton, Qt::NoModifier, start);
  QTest::mouseMove(widget, end, 20);
  QTest::mouseRelease(widget, Qt::LeftButton, Qt::NoModifier, end);
  return true;
}
int resolvedImages(QQuickItem *root) {
  if (!root) { return 0; }
  int result = root->objectName() == "preview-image" && !root->property("source").toUrl().isEmpty() ? 1 : 0;
  for (auto child : root->childItems()) { result += resolvedImages(child); }
  return result;
}
int playbackSources(QQuickItem *root) {
  if (!root) { return 0; }
  int result = 0;
  for (auto player : root->findChildren<QMediaPlayer *>("preview-player", Qt::FindDirectChildrenOnly)) { result += !player->source().isEmpty(); }
  for (auto child : root->childItems()) { result += playbackSources(child); }
  return result;
}
void output(EditorWindow &window, const QString &job, const QJsonValue &value, bool replace = false) {
  window.runOutput()->ingest(job, {{"type", "output_update"}, {"job_id", job}, {"node_id", NodeId}, {"output_name", "value"}, {"value", value}, {"disposition", replace ? "replace" : "append"}});
}
void setup(EditorWindow &window) {
  window.resize(1400, 1000);
  window.setCatalog(QJsonArray{QJsonObject{{"node_type", "Fixture.Gallery"}, {"title", "Mixed output gallery"}, {"outputs", QJsonArray{QJsonObject{{"name", "value"}, {"type", QJsonObject{{"type", "any"}}}}}}}});
  const auto loaded = window.document()->load({{"name", "Mixed gallery fixture"}, {"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{{"id", NodeId}, {"type", "Fixture.Gallery"}, {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 0}, {"y", 0}}}}}}}}, {"edges", QJsonArray{}}}}});
  Q_ASSERT(loaded);
  window.show(); window.fit();
}
bool capture(EditorWindow &window, const QString &name) {
  const auto directory = qEnvironmentVariable("NODETOOL_MEDIA_CAPTURE_DIR");
  return directory.isEmpty() || (QDir().mkpath(directory) && window.grab().save(QDir(directory).filePath(name)));
}
}
class MediaGalleryHostTest final : public QObject {
  Q_OBJECT
private slots:
  void orderedRepeatsMixedTextScrollAndPlayback() {
    QFile file(QStringLiteral(MEDIA_VIDEO_FIXTURE)); QVERIFY(file.open(QIODevice::ReadOnly));
    const auto movie = "data:video/mp4;base64," + QString::fromLatin1(file.readAll().toBase64());
    const auto red = media("image", imageUri(Qt::red));
    const auto blue = media("image", imageUri(Qt::blue));
    EditorWindow window; setup(window);
    const auto before = window.document()->snapshot(); const auto undoCount = window.document()->undoStack()->count();
    window.runOutput()->beginRun("gallery");
    output(window, "gallery", QJsonArray{red, red, "Mixed caption retained", blue, media("audio", audioUri()), media("video", movie)});
    window.fit();
    QTRY_VERIFY(canvas(window) && gallery(canvas(window)));
    QPointer<QQuickWidget> widget = canvas(window);
    auto view = gallery(widget);
    QCOMPARE(view->property("count").toInt(), 6);
    QCOMPARE(window.outputMedia().size(), 5);
    QTRY_VERIFY(control(widget, "gallery-tile-0") && control(widget, "gallery-tile-1"));
    QTRY_VERIFY(([&] {
      const auto current = canvas(window);
      const auto first = findItem(control(current, "gallery-tile-0"), "preview-image");
      const auto repeated = findItem(control(current, "gallery-tile-1"), "preview-image");
      return first && repeated && first->property("status").toInt() == 1 && repeated->property("status").toInt() == 1;
    })());
    widget = canvas(window);
    const auto firstImage = findItem(control(widget, "gallery-tile-0"), "preview-image");
    const auto repeatedImage = findItem(control(widget, "gallery-tile-1"), "preview-image");
    QVERIFY(firstImage); QVERIFY(repeatedImage);
    const auto cachePath = firstImage->property("source").toUrl().toLocalFile();
    QCOMPARE(firstImage->property("source"), repeatedImage->property("source"));
    const auto entries = window.runOutput()->entries();
    const auto normalized = entries.last().toMap()["items"].toList();
    QVERIFY(normalized[0].toMap()["itemKey"] != normalized[1].toMap()["itemKey"]);
    QCOMPARE(QImage(cachePath).pixelColor(0, 0), QColor(Qt::red));
    window.action("Output"); window.fit();
    QTRY_VERIFY(gallery(panel(window)));
    for (const auto dark : {true, false}) {
      window.setDarkTheme(dark); QTest::qWait(50);
      QVERIFY(capture(window, QString("node-editor-gallery-host-%1.png").arg(dark ? "dark" : "light")));
    }
    widget = canvas(window); QVERIFY(widget);
    QVERIFY(click(widget, "gallery-tile-1"));
    QVERIFY(!gallery(widget)->property("singleView").toBool());
    QVERIFY(openTile(widget, "gallery-tile-1"));
    QTRY_VERIFY(gallery(widget) && gallery(widget)->property("currentIndex").toInt() == 1);
    QVERIFY(click(widget, "gallery-next"));
    QTRY_VERIFY(control(widget, "gallery-selected-text"));
    QCOMPARE(control(widget, "gallery-selected-text")->property("value").toString(), QString("Mixed caption retained"));
    QVERIFY(click(widget, "gallery-next"));
    QTRY_VERIFY(control(widget, "preview-image") && control(widget, "preview-image")->property("status").toInt() == 1);
    QCOMPARE(QImage(control(widget, "preview-image")->property("source").toUrl().toLocalFile()).pixelColor(0, 0), QColor(Qt::blue));
    for (const auto dark : {true, false}) {
      window.setDarkTheme(dark); QTest::qWait(50);
      QVERIFY(capture(window, QString("node-editor-gallery-single-%1.png").arg(dark ? "dark" : "light")));
    }
    QVERIFY(click(widget, "gallery-next"));
    QTRY_VERIFY_WITH_TIMEOUT(player(widget) && player(widget)->duration() > 1000, 10000);
    QCOMPARE(player(widget)->playbackState(), QMediaPlayer::StoppedState);
    QVERIFY(click(widget, "preview-compact-play"));
    QTRY_COMPARE(player(widget)->playbackState(), QMediaPlayer::PlayingState);
    QVERIFY(click(widget, "gallery-next"));
    QTRY_VERIFY_WITH_TIMEOUT(player(widget) && player(widget)->hasVideo() && player(widget)->duration() > 1000, 10000);
    QCOMPARE(player(widget)->playbackState(), QMediaPlayer::StoppedState);
    QVERIFY(click(widget, "preview-play"));
    QTRY_VERIFY(player(widget) && player(widget)->videoSink() && player(widget)->videoSink()->videoFrame().isValid());
    QPointer<QMediaPlayer> previous = player(widget);
    QVERIFY(click(widget, "gallery-grid"));
    QTRY_VERIFY(previous.isNull());
    QVERIFY(scrollToEnd(widget));
    QTRY_VERIFY(control(widget, "gallery-grid-scroll") && control(widget, "gallery-grid-scroll")->property("contentY").toDouble() > 0);
    QTRY_VERIFY(control(widget, "gallery-tile-4") && control(widget, "gallery-tile-5"));
    if (const auto first = control(widget, "gallery-tile-0")) { QVERIFY(!first->property("inViewport").toBool()); }
    QTRY_COMPARE(playbackSources(widget->rootObject()), 0);
    QVERIFY(resolvedImages(widget->rootObject()) <= 2);
    QVERIFY(openTile(widget, "gallery-tile-4"));
    QTRY_VERIFY(player(widget) && player(widget)->duration() > 1000);
    QCOMPARE(player(widget)->playbackState(), QMediaPlayer::StoppedState);
    QCOMPARE(window.document()->snapshot(), before); QCOMPARE(window.document()->undoStack()->count(), undoCount);
    previous = player(widget);
    window.runOutput()->beginRun("empty");
    QTRY_VERIFY(!canvas(window)); QTRY_VERIFY(previous.isNull());
    window.runOutput()->selectRun("gallery");
    QTRY_VERIFY(canvas(window));
    QCOMPARE(gallery(canvas(window))->property("count").toInt(), 6);
    window.session()->disconnectFromServer();
    QTRY_VERIFY(!canvas(window));
    QVERIFY(!QFile::exists(cachePath));
    output(window, "gallery", red);
    QVERIFY(window.outputMedia().isEmpty());
  }
  void responsiveGridScrollsAndSelectedImageFillsBody() {
    EditorWindow window; setup(window);
    window.runOutput()->beginRun("responsive");
    QJsonArray images;
    for (int i = 0; i < 60; ++i) { images.append(media("image", imageUri(i % 2 ? Qt::blue : Qt::red))); }
    output(window, "responsive", images); window.fit();
    QTRY_VERIFY(canvas(window) && gallery(canvas(window)));
    QCOMPARE(gallery(canvas(window))->property("count").toInt(), 60);
    QPointer<QQuickItem> grid = control(canvas(window), "gallery-grid-scroll");
    QVERIFY2(grid, "Multiple outputs need a responsive scrollable grid, not fixed pages");
    QTRY_VERIFY(control(canvas(window), "gallery-tile-0"));
    const auto tile = control(canvas(window), "gallery-tile-0");
    QCOMPARE(tile->width(), tile->height());
    QCOMPARE(grid->property("minimumTileWidth").toDouble(), 96.0);
    QVERIFY(tile->width() >= 96);
    QVERIFY(grid->property("contentHeight").toDouble() > grid->height());
    QVERIFY(!control(canvas(window), "gallery-next")->isVisible());
    QVERIFY(resolvedImages(canvas(window)->rootObject()) <= 6);
    QVERIFY(scrollGrid(canvas(window), -10000));
    QTRY_VERIFY(grid && grid->property("contentY").toDouble() > 0);
    QVERIFY(scrollToEnd(canvas(window)));
    QTRY_VERIFY(control(canvas(window), "gallery-tile-59") && control(canvas(window), "gallery-tile-59")->property("inViewport").toBool());
    QCOMPARE(gallery(canvas(window))->property("count").toInt(), 60);
    QVERIFY(resolvedImages(canvas(window)->rootObject()) <= 6);
    QVERIFY(click(canvas(window), "gallery-tile-59"));
    QVERIFY(!gallery(canvas(window))->property("singleView").toBool());
    QVERIFY(openTile(canvas(window), "gallery-tile-59"));
    QTRY_VERIFY(gallery(canvas(window))->property("singleView").toBool());
    QTRY_VERIFY(control(canvas(window), "preview-image") && control(canvas(window), "preview-image")->property("paintedHeight").toDouble() > 100);
    window.action("Output"); window.fit();
    QTRY_VERIFY(control(panel(window), "gallery-grid-scroll"));
    QCOMPARE(control(panel(window), "gallery-grid-scroll")->property("minimumTileWidth").toDouble(), 128.0);
    const auto wideColumns = control(panel(window), "gallery-grid-scroll")->property("columns").toInt();
    window.resize(900, 800); window.fit();
    QTRY_VERIFY(control(panel(window), "gallery-grid-scroll")->property("columns").toInt() < wideColumns);
    // Panels follow the resize in a later pass, which can rebuild the tiles.
    QTRY_VERIFY(click(panel(window), "gallery-tile-0"));
    QVERIFY(!gallery(panel(window))->property("singleView").toBool());
    QTest::keyClick(panel(window), Qt::Key_Return);
    QTRY_VERIFY(gallery(panel(window))->property("singleView").toBool());
    QVERIFY(click(panel(window), "gallery-grid"));
    QTRY_VERIFY(control(panel(window), "gallery-tile-1"));
    QVERIFY(click(panel(window), "gallery-tile-1"));
    QTest::keyClick(panel(window), Qt::Key_Space);
    QTRY_VERIFY(gallery(panel(window))->property("singleView").toBool());
    QVERIFY(click(panel(window), "gallery-grid"));
    for (const auto width : {500, 180}) {
      auto ui = window.document()->node(NodeId)["ui_properties"].toObject(); ui["width"] = width;
      QVERIFY(window.document()->applyCommand({{"op", "setNodeField"}, {"id", NodeId}, {"field", "ui_properties"}, {"value", ui}}));
      window.resize(width == 500 ? 1400 : 900, width == 500 ? 1000 : 800); window.fit();
      QTRY_VERIFY(canvas(window) && control(canvas(window), "gallery-grid-scroll"));
      // An incremental projection keeps the canvas gallery and its open item.
      if (gallery(canvas(window))->property("singleView").toBool()) { QVERIFY(click(canvas(window), "gallery-grid")); }
      QTRY_VERIFY(!gallery(canvas(window))->property("singleView").toBool());
      QTRY_COMPARE(control(canvas(window), "gallery-grid-scroll")->property("columns").toInt(), width == 500 ? 4 : 1);
      for (const auto dark : {true, false}) {
        window.setDarkTheme(dark); QTest::qWait(50);
        QVERIFY(capture(window, QString("node-editor-gallery-responsive-%1-%2.png").arg(width == 500 ? "wide" : "narrow", dark ? "dark" : "light")));
      }
      QVERIFY(openTile(canvas(window), "gallery-tile-0"));
      QTRY_VERIFY(control(canvas(window), "preview-image") && control(canvas(window), "preview-image")->property("paintedHeight").toDouble() > 80);
      for (const auto dark : {true, false}) {
        window.setDarkTheme(dark); QTest::qWait(50);
        QVERIFY(capture(window, QString("node-editor-gallery-responsive-selected-%1-%2.png").arg(width == 500 ? "wide" : "narrow", dark ? "dark" : "light")));
      }
    }
  }
  void selectedPlayersSurviveLogsAndAppendedOccurrences() {
    EditorWindow window; setup(window);
    window.action("Output");
    window.runOutput()->beginRun("stream");
    const auto sound = media("audio", audioUri());
    output(window, "stream", sound); window.fit();
    QTRY_VERIFY(canvas(window) && player(canvas(window)) && player(panel(window)));
    QTRY_VERIFY(player(canvas(window))->duration() > 1000 && player(panel(window))->duration() > 1000);
    QPointer<QQuickWidget> card = canvas(window), bottom = panel(window);
    QVERIFY(click(card, "preview-compact-play")); QVERIFY(click(bottom, "preview-play"));
    QTRY_COMPARE(player(card)->playbackState(), QMediaPlayer::PlayingState);
    QTRY_COMPARE(player(bottom)->playbackState(), QMediaPlayer::PlayingState);
    QPointer<QMediaPlayer> cardPlayer = player(card), panelPlayer = player(bottom);
    window.runOutput()->ingest("stream", {{"type", "log_update"}, {"job_id", "stream"}, {"content", "Unrelated log preserves both selected sources"}});
    output(window, "stream", sound);
    QTRY_VERIFY(gallery(card) && gallery(card)->property("count").toInt() == 2);
    QTRY_VERIFY(gallery(bottom) && gallery(bottom)->property("count").toInt() == 2);
    QCOMPARE(canvas(window), card);
    QCOMPARE(player(card), cardPlayer.data()); QCOMPARE(player(bottom), panelPlayer.data());
    QCOMPARE(cardPlayer->playbackState(), QMediaPlayer::PlayingState); QCOMPARE(panelPlayer->playbackState(), QMediaPlayer::PlayingState);
    output(window, "stream", "Stream caption preserved");
    QTRY_VERIFY(gallery(card) && gallery(card)->property("count").toInt() == 3);
    QCOMPARE(player(card), cardPlayer.data()); QCOMPARE(cardPlayer->playbackState(), QMediaPlayer::PlayingState);
    window.runOutput()->beginRun("new-scope");
    QTRY_VERIFY(cardPlayer.isNull() && panelPlayer.isNull());
    QVERIFY(!canvas(window));
  }
};
int main(int argc, char **argv) {
  Q_INIT_RESOURCE(editor_qml);
  QApplication app(argc, argv);
  nodetool::node_editor::registerMediaTypes();
  MediaGalleryHostTest test;
  return QTest::qExec(&test, argc, argv);
}
#include "MediaGalleryHostTest.moc"
