#include "ui/EditorWindow.h"
#include "media/VideoFrameView.h"
#include "graph/EditorScene.h"
#include "graph/WorkflowGraphModel.h"
#include <QGraphicsView>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QApplication>
#include <QBuffer>
#include <QDataStream>
#include <QDir>
#include <QFile>
#include <QImage>
#include <QKeyEvent>
#include <QShortcut>
#include <QMediaPlayer>
#include <QPointer>
#include <QQuickItem>
#include <QQuickWidget>
#include <QQuickWindow>
#include <QQmlEngine>
#include <QVideoFrame>
#include <QVideoSink>
#include <QWheelEvent>
#include <QtTest>
using namespace nodetool;
namespace {
class ShortcutProbe final : public QObject {
public:
  int deliveries = 0;
  bool eventFilter(QObject *, QEvent *event) override {
    if (event->type() == QEvent::ShortcutOverride) { ++deliveries; }
    return false;
  }
};
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
QQuickWindow *imageViewer() {
  for (auto candidate : QGuiApplication::allWindows()) {
    if (candidate->objectName() == "image-viewer-window" && candidate->isVisible()) { return qobject_cast<QQuickWindow *>(candidate); }
  }
  return nullptr;
}
bool openTile(QQuickWidget *widget, const QString &name, bool dismissViewer = true) {
  if (widget) { polish(widget->rootObject()); }
  const auto item = control(widget, name);
  if (!widget || !item || !item->isVisible()) { return false; }
  const auto point = item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint();
  QTest::mouseDClick(widget, Qt::LeftButton, Qt::NoModifier, point);
  if (dismissViewer && imageViewer()) {
    QMetaObject::invokeMethod(imageViewer(), "dismiss");
    widget->window()->activateWindow();
    widget->setFocus();
  }
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
  void imageActivationOpensModal() {
    EditorWindow window; setup(window);
    window.runOutput()->beginRun("modal-image");
    output(window, "modal-image", media("image", imageUri(Qt::blue)));
    window.action("Output"); window.fit();
    QTRY_VERIFY(control(panel(window), "preview-image"));
    QVERIFY(openTile(panel(window), "preview-image", false));
    QTRY_VERIFY(imageViewer());
    QCOMPARE(imageViewer()->modality(), Qt::WindowModal);
    QCOMPARE(imageViewer()->transientParent(), window.windowHandle());
    QCOMPARE(QQmlEngine::objectOwnership(window.windowHandle()), QQmlEngine::CppOwnership);
    const auto snapshot = window.document()->snapshot();
    const auto undo = window.document()->undoStack()->count();
    imageViewer()->requestActivate();
    QTRY_VERIFY(imageViewer()->isActive());
    for (const auto key : {Qt::Key_Delete, Qt::Key_Space, Qt::Key_Left, Qt::Key_Right}) { QTest::keyClick(imageViewer(), key); }
    QTest::keyClick(imageViewer(), Qt::Key_Return, Qt::ControlModifier);
    QCOMPARE(window.document()->snapshot(), snapshot);
    QCOMPARE(window.document()->undoStack()->count(), undo);
    imageViewer()->requestActivate();
    QTRY_VERIFY(imageViewer()->isActive() && imageViewer()->activeFocusItem());
    QTest::keyClick(imageViewer(), Qt::Key_Escape);
    QTRY_VERIFY(!imageViewer());
  }
  void rasterImageOpensFromKeyboardMenu() {
    EditorWindow window; setup(window);
    window.runOutput()->beginRun("keyboard-raster");
    output(window, "keyboard-raster", media("image", imageUri(Qt::blue)));
    window.fit();
    auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    const auto id = *model.allNodeIds().begin();
    auto *node = window.scene()->nodeGraphicsObject(id); QVERIFY(node);
    node->setSelected(true);
    auto hostFor = [&](const QString &name) -> QQuickWidget * {
      for (auto *widget : window.findChildren<QQuickWidget *>()) {
        if (widget->isVisible() && control(widget, name)) { return widget; }
      }
      return nullptr;
    };
    QTRY_VERIFY(hostFor("selection-more-node-actions"));
    auto *toolbar = hostFor("selection-more-node-actions");
    auto *more = control(toolbar, "selection-more-node-actions");
    more->forceActiveFocus();
    QTest::keyClick(toolbar->quickWindow(), Qt::Key_Space);
    QTRY_VERIFY(window.findChild<QQuickWidget *>("context-menu-host"));
    auto *menu = window.findChild<QQuickWidget *>("context-menu-host");
    auto menuEntry = [&]() -> QQuickItem * {
      QVariant result;
      QMetaObject::invokeMethod(menu->rootObject(), "itemFor", Q_RETURN_ARG(QVariant, result),
          Q_ARG(QVariant, QString("open-image-viewer")));
      return qobject_cast<QQuickItem *>(result.value<QObject *>());
    };
    QTRY_VERIFY(menuEntry());
    auto *open = menuEntry();
    QVERIFY(open->isEnabled());
    const auto snapshot = window.document()->snapshot();
    const auto undo = window.document()->undoStack()->count();
    open->forceActiveFocus();
    QTest::keyClick(menu->quickWindow(), Qt::Key_Return);
    QTRY_VERIFY(imageViewer());
    QCOMPARE(window.document()->snapshot(), snapshot);
    QCOMPARE(window.document()->undoStack()->count(), undo);
    QMetaObject::invokeMethod(imageViewer(), "dismiss");
    QTRY_VERIFY(!imageViewer());
  }
  // Web OutputQuickActionButtons: image outputs offer Upscale, Remove background and
  // "Edit with prompt". Each creates the node (when it is in the catalog) and wires the
  // output into its `image` input (config/outputQuickActions.ts). Native offers them on the
  // node menu, next to Open image viewer.
  void imageQuickActionsCreateConnectedNodes() {
    EditorWindow window; setup(window);
    const auto imageNode = [](const QString &type, const QString &title) {
      return QJsonObject{{"node_type", type}, {"title", title},
        {"properties", QJsonArray{QJsonObject{{"name", "image"}, {"type", QJsonObject{{"type", "image"}}}}}},
        {"outputs", QJsonArray{QJsonObject{{"name", "output"}, {"type", QJsonObject{{"type", "image"}}}}}}};
    };
    window.setCatalog(QJsonArray{
      QJsonObject{{"node_type", "Fixture.Gallery"}, {"title", "Mixed output gallery"}, {"outputs", QJsonArray{QJsonObject{{"name", "value"}, {"type", QJsonObject{{"type", "any"}}}}}}},
      imageNode("nodetool.image.Upscale", "Upscale"), imageNode("nodetool.image.ImageToImage", "Image To Image")});
    window.runOutput()->beginRun("quick-actions");
    output(window, "quick-actions", media("image", imageUri(Qt::blue)));
    window.fit();
    auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    const auto id = *model.allNodeIds().begin();
    auto *node = window.scene()->nodeGraphicsObject(id); QVERIFY(node);
    QTRY_VERIFY(!model.canvasResultRect(id).isEmpty());
    node->setSelected(true);
    auto hostFor = [&](const QString &name) -> QQuickWidget * {
      for (auto *widget : window.findChildren<QQuickWidget *>()) { if (widget->isVisible() && control(widget, name)) { return widget; } }
      return nullptr;
    };
    const auto openMenu = [&]() -> QQuickWidget * {
      QQuickWidget *toolbar = nullptr; [&] { QTRY_VERIFY(toolbar = hostFor("selection-more-node-actions")); }();
      auto *more = control(toolbar, "selection-more-node-actions"); more->forceActiveFocus();
      QTest::keyClick(toolbar->quickWindow(), Qt::Key_Space);
      QQuickWidget *menu = nullptr; [&] { QTRY_VERIFY(menu = window.findChild<QQuickWidget *>("context-menu-host")); }();
      return menu;
    };
    const auto entry = [](QQuickWidget *menu, const QString &name) -> QQuickItem * {
      QVariant result;
      QMetaObject::invokeMethod(menu->rootObject(), "itemFor", Q_RETURN_ARG(QVariant, result), Q_ARG(QVariant, name));
      return qobject_cast<QQuickItem *>(result.value<QObject *>());
    };
    auto *menu = openMenu(); QVERIFY(menu);
    QTRY_VERIFY(entry(menu, "quick-action-upscale"));
    QVERIFY(entry(menu, "quick-action-edit"));
    QVERIFY2(!entry(menu, "quick-action-remove-background"), "An action whose node is not in the catalog is not offered");
    QCOMPARE(entry(menu, "quick-action-upscale")->property("text").toString(), QString("Upscale"));
    QCOMPARE(entry(menu, "quick-action-edit")->property("text").toString(), QString("Edit with prompt"));
    const auto nodes = window.document()->nodes().size();
    const auto undo = window.document()->undoStack()->count();
    entry(menu, "quick-action-upscale")->forceActiveFocus();
    QTest::keyClick(menu->quickWindow(), Qt::Key_Return);
    QTRY_COMPARE(window.document()->nodes().size(), nodes + 1);
    QCOMPARE(window.document()->undoStack()->count(), undo + 1);
    QCOMPARE(window.document()->edges().size(), 1);
    const auto edge = window.document()->edges().first().toObject();
    QCOMPARE(edge["source"].toString(), NodeId);
    QCOMPARE(edge["sourceHandle"].toString(), QString("value"));
    QCOMPARE(edge["targetHandle"].toString(), QString("image"));
    const auto created = window.document()->node(edge["target"].toString());
    QCOMPARE(created["type"].toString(), QString("nodetool.image.Upscale"));
    const auto position = created["ui_properties"].toObject()["position"].toObject();
    const auto origin = window.document()->node(NodeId)["ui_properties"].toObject()["position"].toObject();
    QVERIFY2(position["x"].toDouble() > origin["x"].toDouble() + 100, "The new node is placed to the right of the source");
    // Undo removes the node and the wire in one step.
    window.document()->undoStack()->undo();
    QCOMPARE(window.document()->nodes().size(), nodes);
    QCOMPARE(window.document()->edges().size(), 0);
  }
  void rasterCanvasActivationAndScope() {
    EditorWindow window; setup(window);
    window.runOutput()->beginRun("raster-image");
    output(window, "raster-image", media("image", imageUri(Qt::blue)));
    window.fit();
    auto view = window.findChild<QGraphicsView *>(); QVERIFY(view);
    auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    const auto id = *model.allNodeIds().begin();
    auto node = window.scene()->nodeGraphicsObject(id); QVERIFY(node);
    QTRY_VERIFY(!model.canvasResultRect(id).isEmpty());
    QVERIFY(!canvas(window));
    const auto point = view->mapFromScene(node->mapToScene(model.canvasResultRect(id).center()));
    const auto snapshot = window.document()->snapshot();
    const auto undo = window.document()->undoStack()->count();
    QTest::mouseDClick(view->viewport(), Qt::LeftButton, Qt::NoModifier, point);
    QTRY_VERIFY(imageViewer());
    QCOMPARE(imageViewer()->transientParent(), window.windowHandle());
    QVERIFY(!canvas(window));
    auto modal = imageViewer();
    QWidget unrelatedWindow;
    ShortcutProbe unrelatedProbe;
    unrelatedWindow.installEventFilter(&unrelatedProbe);
    int unrelatedActivations = 0;
    QShortcut unrelatedAction(QKeySequence(Qt::Key_F8), &unrelatedWindow);
    connect(&unrelatedAction, &QShortcut::activated, &unrelatedWindow, [&] { ++unrelatedActivations; });
    unrelatedWindow.show(); unrelatedWindow.activateWindow();
    QTRY_VERIFY(unrelatedWindow.isActiveWindow());
    QTest::keyClick(&unrelatedWindow, Qt::Key_F8);
    QTRY_COMPARE(unrelatedActivations, 1);
    unrelatedProbe.deliveries = 0;
    QKeyEvent unrelatedShortcut(QEvent::ShortcutOverride, Qt::Key_Delete, Qt::NoModifier);
    unrelatedShortcut.ignore();
    QCoreApplication::sendEvent(&unrelatedWindow, &unrelatedShortcut);
    QCOMPARE(unrelatedProbe.deliveries, 1);
    ShortcutProbe hostProbe;
    view->viewport()->installEventFilter(&hostProbe);
    QKeyEvent hostShortcut(QEvent::ShortcutOverride, Qt::Key_Delete, Qt::NoModifier);
    hostShortcut.ignore();
    QCoreApplication::sendEvent(view->viewport(), &hostShortcut);
    QCOMPARE(hostProbe.deliveries, 0);
    QVERIFY(hostShortcut.isAccepted());
    unrelatedWindow.hide();
    modal->requestActivate(); QTRY_VERIFY(modal->isActive());
    for (const auto key : {Qt::Key_Delete, Qt::Key_Space, Qt::Key_Left, Qt::Key_Right}) { QTest::keyClick(modal, key); }
    QTest::keyClick(modal, Qt::Key_Return, Qt::ControlModifier);
    QCOMPARE(window.document()->snapshot(), snapshot);
    QCOMPARE(window.document()->undoStack()->count(), undo);
    window.runOutput()->ingest("raster-image", {{"type", "log_update"}, {"job_id", "raster-image"}, {"content", "Preserve raster viewer"}});
    QCOMPARE(imageViewer(), modal);
    output(window, "raster-image", media("image", imageUri(Qt::blue)));
    QTRY_VERIFY(imageViewer() && imageViewer()->property("items").toList().size() == 2);
    QCOMPARE(imageViewer(), modal);
    window.runOutput()->beginRun("new-image-scope");
    QTRY_VERIFY(!imageViewer());
    output(window, "new-image-scope", media("image", imageUri(Qt::blue)));
    window.fit();
    QTest::mouseDClick(view->viewport(), Qt::LeftButton, Qt::NoModifier, view->mapFromScene(node->mapToScene(model.canvasResultRect(id).center())));
    QTRY_VERIFY(imageViewer());
    window.session()->disconnectFromServer();
    QTRY_VERIFY(!imageViewer());
    QVERIFY(!canvas(window));
  }
  void rasterCanvasRespectsTopCardAndCollapse() {
    EditorWindow window; setup(window);
    const QString coverId = "44444444444444444444444444444444";
    auto fixture = window.document()->snapshot();
    auto graph = fixture["graph"].toObject(); auto nodes = graph["nodes"].toArray();
    auto cover = nodes.first().toObject(); cover["id"] = coverId; nodes.append(cover);
    graph["nodes"] = nodes; fixture["graph"] = graph;
    QVERIFY(window.document()->load(fixture));
    window.runOutput()->beginRun("occluded");
    output(window, "occluded", media("image", imageUri(Qt::blue)));
    window.fit();
    auto view = window.findChild<QGraphicsView *>(); QVERIFY(view);
    auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    QtNodes::NodeId imageId = 0, coveringId = 0;
    for (const auto id : model.allNodeIds()) { if (model.resourceId(id) == NodeId) { imageId = id; } else { coveringId = id; } }
    auto imageNode = window.scene()->nodeGraphicsObject(imageId); QVERIFY(imageNode);
    auto coveringNode = window.scene()->nodeGraphicsObject(coveringId); QVERIFY(coveringNode);
    const auto scenePoint = imageNode->mapToScene(model.canvasResultRect(imageId).center());
    coveringNode->setPos(scenePoint - coveringNode->boundingRect().center());
    coveringNode->setZValue(imageNode->zValue() + 1);
    QVERIFY(coveringNode->sceneBoundingRect().contains(scenePoint));
    QTest::mouseDClick(view->viewport(), Qt::LeftButton, Qt::NoModifier, view->mapFromScene(scenePoint));
    QVERIFY(!imageViewer());
    coveringNode->setVisible(false);
    QTest::mouseDClick(view->viewport(), Qt::LeftButton, Qt::NoModifier, view->mapFromScene(scenePoint));
    QTRY_VERIFY(imageViewer());
    auto ui = window.document()->node(NodeId)["ui_properties"].toObject(); ui["collapsed"] = true;
    QVERIFY(window.document()->applyCommand({{"op", "setNodeField"}, {"id", NodeId}, {"field", "ui_properties"}, {"value", ui}}));
    QTRY_VERIFY(!imageViewer());
    QVERIFY(model.canvasResultRect(imageId).isEmpty());
  }
  void bypassedRasterImageRemainsInspectable() {
    EditorWindow window; setup(window);
    auto ui = window.document()->node(NodeId)["ui_properties"].toObject(); ui["bypassed"] = true;
    QVERIFY(window.document()->applyCommand({{"op", "setNodeField"}, {"id", NodeId}, {"field", "ui_properties"}, {"value", ui}}));
    window.runOutput()->beginRun("bypassed-image");
    output(window, "bypassed-image", media("image", imageUri(Qt::blue)));
    window.fit();
    auto view = window.findChild<QGraphicsView *>(); QVERIFY(view);
    auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    const auto id = *model.allNodeIds().begin();
    auto node = window.scene()->nodeGraphicsObject(id); QVERIFY(node);
    QVERIFY(model.bypassed(id)); QTRY_VERIFY(!model.canvasResultRect(id).isEmpty());
    const auto snapshot = window.document()->snapshot();
    const auto undo = window.document()->undoStack()->count();
    QTest::mouseDClick(view->viewport(), Qt::LeftButton, Qt::NoModifier, view->mapFromScene(node->mapToScene(model.canvasResultRect(id).center())));
    QTRY_VERIFY(imageViewer());
    QCOMPARE(window.document()->snapshot(), snapshot);
    QCOMPARE(window.document()->undoStack()->count(), undo);
    QVERIFY(QMetaObject::invokeMethod(imageViewer(), "dismiss"));
  }
  void singleImageDownloadFitsOutputPanel() {
    EditorWindow window; setup(window);
    window.runOutput()->beginRun("single-image");
    output(window, "single-image", media("image", imageUri(Qt::blue)));
    window.action("Output"); window.fit();
    QTRY_VERIFY(gallery(panel(window)));
    QVERIFY(!canvas(window));
    auto widget = panel(window);
    QQuickItem *download = nullptr;
    QQuickItem *image = nullptr;
    QTRY_VERIFY((download = control(widget, "preview-download")) && (image = control(widget, "preview-image")));
    QTRY_VERIFY(image->property("status").toInt() == 1 && download->isVisible() && download->isEnabled());
    polish(widget->rootObject());
    const auto downloadBounds = download->mapRectToScene(download->boundingRect());
    const auto imageBounds = image->mapRectToScene(image->boundingRect());
    QVERIFY(QRectF(widget->rect()).contains(downloadBounds));
    QVERIFY(imageBounds.width() > 0 && imageBounds.height() > 0);
    QVERIFY(!imageBounds.intersects(downloadBounds));
    const auto before = window.document()->snapshot();
    const auto undoCount = window.document()->undoStack()->count();
    QVERIFY(click(widget, "preview-download"));
    auto preview = control(widget, "gallery-selected-media");
    QVERIFY(preview);
    auto dialog = preview->findChild<QObject *>("preview-download-dialog");
    QVERIFY(dialog);
    QTRY_VERIFY(dialog->property("visible").toBool());
    QVERIFY(QMetaObject::invokeMethod(dialog, "close"));
    QCOMPARE(window.document()->snapshot(), before);
    QCOMPARE(window.document()->undoStack()->count(), undoCount);
    QVERIFY(!canvas(window));
  }
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
    QTRY_VERIFY(imageViewer());
    imageViewer()->requestActivate();
    QTRY_VERIFY(imageViewer()->isActive());
    QTRY_VERIFY(imageViewer()->activeFocusItem());
    QTest::keyClick(imageViewer(), Qt::Key_Escape);
    QTRY_VERIFY(!imageViewer());
    window.activateWindow();
    QTRY_VERIFY(window.isActiveWindow());
    panel(window)->setFocus();
    QTRY_VERIFY(gallery(panel(window))->property("singleView").toBool());
    QVERIFY(click(panel(window), "gallery-grid"));
    QTRY_VERIFY(control(panel(window), "gallery-tile-1"));
    QVERIFY(click(panel(window), "gallery-tile-1"));
    QTest::keyClick(panel(window), Qt::Key_Space);
    QTRY_VERIFY(imageViewer());
    imageViewer()->requestActivate();
    QTRY_VERIFY(imageViewer()->isActive());
    QTRY_VERIFY(imageViewer()->activeFocusItem());
    QTest::keyClick(imageViewer(), Qt::Key_Escape);
    QTRY_VERIFY(!imageViewer());
    window.activateWindow();
    QTRY_VERIFY(window.isActiveWindow());
    panel(window)->setFocus();
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
