#include "../support/OverlayCanvasFixture.h"
#include "../support/DarkCanvasTheme.h"
#include "graph/CanvasMediaPresenter.h"
#include "graph/CardBodies.h"
#include "canvas/CanvasStyle.h"
#include "graph/InlinePropertyPresenter.h"
#include "graph/InlineTitlePresenter.h"
#include "graph/WorkflowGraphModel.h"
#include "interfaces/PropertyHost.h"
#include "media/MediaResolver.h"
#include "media/VideoFrameView.h"
#include "run/NodeRuntimeModel.h"
#include "ui/CanvasOverlay.h"
#include <QApplication>
#include <QDataStream>
#include <QDir>
#include <QFile>
#include <QMediaPlayer>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWidget>
#include <QShortcut>
#include <QTemporaryFile>
#include <QSignalSpy>
#include <QVideoSink>
#include <QVideoFrame>
#include <QtTest>
#include <cmath>
#include <memory>
using namespace nodetool;
using namespace QtNodes;
namespace {
QByteArray audio() {
  QByteArray bytes;
  QDataStream stream(&bytes, QIODevice::WriteOnly);
  stream.setByteOrder(QDataStream::LittleEndian);
  stream.writeRawData("RIFF", 4); stream << quint32(48036);
  stream.writeRawData("WAVEfmt ", 8);
  stream << quint32(16) << quint16(1) << quint16(1) << quint32(8000) << quint32(16000) << quint16(2) << quint16(16);
  stream.writeRawData("data", 4); stream << quint32(48000);
  for (int frame = 0; frame < 24000; ++frame) {
    stream << qint16((frame < 12000 ? 0.25 : 0.8) * 32767 * std::sin(2 * 3.141592653589793 * 220 * frame / 8000));
  }
  return bytes;
}
QJsonObject node(const QString &id, double x, double y) {
  return {{"id", id}, {"type", "Media"}, {"data", QJsonObject{{"text", "Editable caption"}}},
    {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", x}, {"y", y}}}}}};
}
QJsonArray catalog() {
  return QJsonArray{QJsonObject{{"node_type", "Media"}, {"title", "Media output"},
    {"input_fields", QJsonArray{"input"}}, {"inline_fields", QJsonArray{"text"}},
    {"properties", QJsonArray{QJsonObject{{"name", "input"}, {"type", QJsonObject{{"type", "any"}}}}, QJsonObject{{"name", "text"}, {"type", QJsonObject{{"type", "str"}}}, {"json_schema_extra", QJsonObject{{"multiline", false}}}}}},
    {"outputs", QJsonArray{QJsonObject{{"name", "value"}, {"type", QJsonObject{{"type", "any"}}}}}}}};
}
struct Fixture {
  WorkflowGraphModel model;
  test::OverlayCanvasFixture surface{model};
  QuickCanvas &canvas = surface.surface();
  EditorSceneApi &scene = canvas.scene();
  QQmlEngine engine;
  node_editor::MediaResolver resolver;
  node_editor::NodeRuntimeModel runtime;
  node_editor::PropertyHost host;
  InlinePropertyPresenter inlineEditor{model, scene, canvas, &engine, host};
  CanvasMediaPresenter presenter{model, canvas, &engine, resolver};
  QVariantList sources;
  Fixture() {
    QJsonArray nodes{node("audio", 0, 0), node("video", 330, 0), node("hidden", 5000, 0)};
    QJsonArray edges{QJsonObject{{"id", "audio-video"}, {"source", "audio"}, {"target", "video"}, {"sourceHandle", "value"}, {"targetHandle", "input"}}};
    for (int i = 0; i < 20; ++i) { nodes.append(node("context-" + QString::number(i), (i % 5) * 320, 400 + (i / 5) * 180)); }
    for (int i = 0; i < 20; ++i) {
      edges.append(QJsonObject{{"id", "context-edge-" + QString::number(i)}, {"source", i == 0 ? "video" : "context-" + QString::number(i - 1)},
        {"target", "context-" + QString::number(i)}, {"sourceHandle", "value"}, {"targetHandle", "input"}});
    }
    model.project({{"graph", QJsonObject{{"nodes", nodes}, {"edges", edges}}}}, catalog());
    model.setRuntimeModel(&runtime);
    runtime.beginRun("first");
    runtime.ingest("first", {{"type", "node_update"}, {"node_id", "video"}, {"status", "completed"}});
    surface.show({1000, 700}, {320, 220});
    const auto sound = "data:audio/wav;base64," + QString::fromLatin1(audio().toBase64());
    QFile video(QStringLiteral(MEDIA_VIDEO_FIXTURE));
    if (!video.open(QIODevice::ReadOnly)) { return; }
    const auto movie = "data:video/mp4;base64," + QString::fromLatin1(video.readAll().toBase64());
    sources = {
      QVariantMap{{"nodeId", "audio"}, {"runId", "first"}, {"outputName", "sound"}, {"kind", "audio"}, {"locator", sound}},
      QVariantMap{{"nodeId", "video"}, {"runId", "first"}, {"outputName", "movie"}, {"kind", "video"}, {"locator", movie}},
      QVariantMap{{"nodeId", "hidden"}, {"runId", "first"}, {"kind", "audio"}, {"locator", sound}}
    };
    presenter.setSources(sources);
  }
  NodeId id(const QString &name) const {
    for (const auto id : model.allNodeIds()) { if (model.resourceId(id) == name) { return id; } }
    return InvalidNodeId;
  }
  test::OverlayProbe widget(const QString &name) {
    return surface.overlay("canvas-media-" + name);
  }
  QMediaPlayer *player(const QString &name) {
    const auto overlay = widget(name);
    return overlay ? overlay->rootObject()->findChild<QMediaPlayer *>("preview-player") : nullptr;
  }
  QColor pixelAt(QPoint point) {
    const auto image = canvas.quickWidget().grabFramebuffer();
    return image.pixelColor((QPointF(point) * image.devicePixelRatio()).toPoint());
  }
  QQuickItem *placeRaisedVideoControlAt(QPoint point) {
    const auto video = id("video");
    auto *play = widget("video")->rootObject()->findChild<QQuickItem *>("preview-play");
    if (!play) { return nullptr; }
    QPointer<QQuickItem> retained = play;
    const auto center = play->mapToScene(QPointF(play->width(), play->height()) / 2);
    model.setNodeData(video, NodeRole::Position, canvas.nodeOrigin(video) + (point - center) / canvas.zoom());
    surface.setStackZ(video, 1);
    presenter.refresh();
    return retained;
  }
  void click(const QString &name, const QString &controlName, qreal fraction = 0.5) {
    const auto overlay = widget(name);
    Q_ASSERT(overlay && overlay->rootObject());
    const auto control = overlay->rootObject()->findChild<QQuickItem *>(controlName);
    Q_ASSERT(control);
    QTest::mouseClick(overlay->inputWidget(), Qt::LeftButton, Qt::NoModifier,
                     control->mapToScene(QPointF(control->width() * fraction, control->height() / 2)).toPoint());
  }
};
QJsonObject snapshotWithoutCard(const WorkflowGraphModel &model, NodeId removed) {
  QJsonArray nodes;
  for (const auto id : model.allNodeIds()) {
    if (id != removed) { nodes.append(model.nodeSnapshot(id)); }
  }
  return {{"graph", QJsonObject{{"nodes", nodes}, {"edges", QJsonArray{}}}}};
}
bool capture(QWidget &widget, const QString &name) {
  const auto directory = qEnvironmentVariable("NODETOOL_MEDIA_CAPTURE_DIR");
  if (directory.isEmpty()) { return true; }
  return QDir().mkpath(directory) && widget.grab().save(QDir(directory).filePath(name));
}
}
class CanvasMediaTest final : public QObject {
  Q_OBJECT
private slots:
  void nativeControlsPreserveGraphAndPlayback() {
    Fixture f;
    QTRY_COMPARE(f.presenter.activeItems().size(), 2);
    QTRY_VERIFY(f.player("video") && f.player("video")->duration() > 1000);
    QTRY_VERIFY(f.player("audio") && f.player("audio")->duration() > 1000);
    QCOMPARE(f.player("video")->playbackState(), QMediaPlayer::StoppedState);
    QCOMPARE(f.player("audio")->playbackState(), QMediaPlayer::StoppedState);
    f.canvas.selection().setNode(f.id("audio"), true);
    const auto original = f.canvas.nodeOrigin(f.id("video"));
    f.click("video", "preview-play");
    auto player = f.player("video");
    QTRY_COMPARE(player->playbackState(), QMediaPlayer::PlayingState);
    QTRY_VERIFY(player->position() > 50);
    QTRY_VERIFY(player->videoSink()->videoFrame().isValid());
    QVERIFY(f.canvas.selection().contains(f.id("audio")));
    QVERIFY(!f.canvas.selection().contains(f.id("video")));
    f.runtime.ingest("first", {{"type", "log_update"}, {"node_id", "video"}, {"content", "Log without a new media source"}});
    f.presenter.setSources(f.sources);
    f.presenter.refresh();
    QCOMPARE(f.player("video"), player);
    QCOMPARE(player->playbackState(), QMediaPlayer::PlayingState);
    f.click("video", "preview-play");
    QTRY_COMPARE(player->playbackState(), QMediaPlayer::PausedState);
    auto seek = f.widget("video")->rootObject()->findChild<QQuickItem *>("preview-seek");
    QVERIFY(seek);
    const auto start = seek->mapToScene(QPointF(seek->width() * 0.2, seek->height() / 2)).toPoint();
    const auto end = seek->mapToScene(QPointF(seek->width() * 0.7, seek->height() / 2)).toPoint();
    QTest::mousePress(f.widget("video")->inputWidget(), Qt::LeftButton, Qt::NoModifier, start);
    QTest::mouseMove(f.widget("video")->inputWidget(), end);
    QTest::mouseRelease(f.widget("video")->inputWidget(), Qt::LeftButton, Qt::NoModifier, end);
    QTRY_VERIFY(player->position() > 1000);
    QCOMPARE(f.canvas.nodeOrigin(f.id("video")), original);
    QVERIFY(f.canvas.selection().contains(f.id("audio")));
    QShortcut shortcut(QKeySequence("Ctrl+G"), &f.surface.host());
    QSignalSpy triggered(&shortcut, &QShortcut::activated);
    QTest::keyClick(f.widget("video")->inputWidget(), Qt::Key_G, Qt::ControlModifier);
    QCOMPARE(triggered.size(), 0);
    QWidget unrelated(&f.surface.host());
    unrelated.show();
    QShortcut unrelatedShortcut(QKeySequence("Ctrl+J"), &unrelated);
    QSignalSpy unrelatedTriggered(&unrelatedShortcut, &QShortcut::activated);
    QTest::keyClick(&unrelated, Qt::Key_J, Qt::ControlModifier);
    QCOMPARE(unrelatedTriggered.size(), 1);
    for (auto *item : f.presenter.activeItems()) { QCOMPARE(item->findChildren<QMediaPlayer *>().size(), 1); }
    f.click("audio", "preview-compact-play");
    QTRY_COMPARE(f.player("audio")->playbackState(), QMediaPlayer::PlayingState);
  }
  void zoomPanVirtualizationAndVisibility() {
    Fixture f;
    QTRY_VERIFY(f.player("video") && f.player("video")->duration() > 1000);
    f.click("video", "preview-play");
    QTRY_VERIFY(f.player("video")->position() > 50);
    f.click("video", "preview-play");
    QPointer<QMediaPlayer> player = f.player("video");
    const auto position = player->position();
    f.canvas.scaleBy(0.75, CanvasSurface::ZoomAnchor::Center);
    f.presenter.refresh();
    QCOMPARE(f.player("video"), player.data());
    QCOMPARE(player->position(), position);
    QCOMPARE(player->playbackState(), QMediaPlayer::PausedState);
    QCOMPARE(f.widget("video")->rootObject()->property("zoom").toDouble(), 0.75);
    const auto local = f.model.canvasPlaybackRect(f.id("video"));
    const auto mapped = f.canvas.viewportTransform().mapRect(local.translated(f.canvas.nodeOrigin(f.id("video"))));
    QCOMPARE(f.widget("video")->geometry(), mapped.toAlignedRect().intersected((&f.canvas.viewportWidget())->rect()));
    f.canvas.centerOn({1100, 220});
    f.presenter.refresh();
    QVERIFY(f.widget("video"));
    QVERIFY(f.widget("video")->rootObject()->property("offsetX").toDouble() < 0);
    QVERIFY((&f.canvas.viewportWidget())->rect().contains(f.widget("video")->geometry()));
    QCOMPARE(player->position(), position);
    f.canvas.centerOn({5150, 120});
    f.presenter.refresh();
    QCOMPARE(player->playbackState(), QMediaPlayer::StoppedState);
    QVERIFY(player->source().isEmpty());
    QTRY_VERIFY(player.isNull());
    QTRY_COMPARE(f.presenter.activeItems().size(), 1);
    QVERIFY(f.widget("hidden"));
    f.canvas.centerOn({320, 220});
    f.presenter.refresh();
    QTRY_VERIFY(f.player("video") && f.player("video")->duration() > 1000);
    QCOMPARE(f.player("video")->playbackState(), QMediaPlayer::StoppedState);
    f.surface.host().hide();
    QCOMPARE(f.presenter.activeItems().size(), 0);
    f.surface.host().show();
    QTRY_VERIFY(f.player("video"));
    QCOMPARE(f.player("video")->playbackState(), QMediaPlayer::StoppedState);
  }
  void overlappingCardsReleasePlaybackWhenCovered() {
    Fixture f;
    QTRY_VERIFY(f.player("video") && f.player("video")->duration() > 1000);
    QPointer<QMediaPlayer> player = f.player("video");
    player->setLoops(QMediaPlayer::Infinite);
    f.click("video", "preview-play");
    QTRY_COMPARE(player->playbackState(), QMediaPlayer::PlayingState);
    const auto blocker = f.id("context-0");
    f.canvas.graphCanvas().setAcceptHoverEvents(false);
    f.canvas.canvasScene().clearHover();
    const auto local = f.model.canvasPlaybackRect(f.id("video"));
    const auto sceneOrigin = f.canvas.nodeOrigin(f.id("video")) + local.topLeft();
    f.model.setNodeData(f.id("context-0"), NodeRole::Position, sceneOrigin + QPointF(local.width() / 2, 0));
    auto *initialPlay = f.widget("video")->rootObject()->findChild<QQuickItem *>("preview-play");
    QVERIFY(initialPlay);
    const auto initialPoint = initialPlay->mapToScene(QPointF(initialPlay->width(), initialPlay->height()) / 2).toPoint();
    f.model.setNodeData(blocker, NodeRole::Position, f.canvas.mapToScene(initialPoint - QPoint(30, 30)));
    f.surface.setStackZ(blocker, 1000);
    f.presenter.refresh();
    QVERIFY(f.widget("video"));
    const auto overlap = f.canvas.viewportTransform().mapRect(f.canvas.nodeBounds(blocker)).intersected(f.widget("video")->geometry());
    QVERIFY(!overlap.isEmpty());
    auto *media = f.widget("video")->rootObject();
    auto *play = media->findChild<QQuickItem *>("preview-play");
    QVERIFY(play);
    const auto point = play->mapToScene(QPointF(play->width(), play->height()) / 2).toPoint();
    QVERIFY(overlap.contains(point));
    QTRY_VERIFY(!f.canvas.graphCanvas().rasterPending());
    const auto covered = f.pixelAt(point);
    const auto opacity = media->opacity();
    media->setOpacity(0);
    QCOMPARE(f.pixelAt(point), covered);
    media->setOpacity(opacity);

    QSignalSpy clicked(play, SIGNAL(clicked()));
    QVERIFY(clicked.isValid());
    QCOMPARE(f.canvas.nodeAt(point), blocker);
    QTest::mouseClick(&f.canvas.viewportWidget(), Qt::LeftButton, {}, point);
    QCOMPARE(clicked.count(), 0);
    QVERIFY(f.canvas.selection().contains(blocker));
    QCOMPARE(player->playbackState(), QMediaPlayer::PlayingState);

    // Reverse the stack without refreshing the presenter's occlusion
    // region so the mask alone keeps the play control from receiving input.
    auto *cover = f.canvas.canvasScene().nodeItem(blocker);
    const auto z = cover->z();
    cover->setZ(-1);
    QVERIFY(f.pixelAt(point) != covered);
    QTest::mouseClick(&f.canvas.viewportWidget(), Qt::LeftButton, {}, point);
    QCOMPARE(clicked.count(), 0);

    auto *cardOverlay = media->parentItem();
    cardOverlay->setFiltersChildMouseEvents(false);
    QTest::mouseClick(&f.canvas.viewportWidget(), Qt::LeftButton, {}, point);
    QCOMPARE(clicked.count(), 1);
    cardOverlay->setFiltersChildMouseEvents(true);
    cover->setZ(z);
    QCOMPARE(f.player("video"), player.data());
    f.model.setNodeData(f.id("context-0"), NodeRole::Size, QSize(400, 400));
    f.model.setNodeData(f.id("context-0"), NodeRole::Position, sceneOrigin - QPointF(20, 20));
    f.presenter.refresh();
    QVERIFY(!f.widget("video"));
    QCOMPARE(player->playbackState(), QMediaPlayer::StoppedState);
    QVERIFY(player->source().isEmpty());
    QTRY_VERIFY(player.isNull());
  }
  void historyServerAndSourceCleanup() {
    Fixture f;
    QTRY_VERIFY(f.player("video") && f.player("video")->duration() > 1000);
    f.click("video", "preview-play");
    QTRY_COMPARE(f.player("video")->playbackState(), QMediaPlayer::PlayingState);
    QPointer<QMediaPlayer> previous = f.player("video");
    auto next = f.sources;
    for (auto &value : next) { auto item = value.toMap(); item["runId"] = "second"; value = item; }
    f.presenter.setSources(next);
    QCOMPARE(previous->playbackState(), QMediaPlayer::StoppedState);
    QVERIFY(previous->source().isEmpty());
    QTRY_VERIFY(previous.isNull());
    QTRY_VERIFY(f.player("video") && f.player("video")->duration() > 1000);
    QCOMPARE(f.player("video")->playbackState(), QMediaPlayer::StoppedState);
    previous = f.player("video");
    f.resolver.configure(QUrl("https://different.example"), "different-token");
    f.presenter.clear();
    QCOMPARE(f.presenter.activeItems().size(), 0);
    QVERIFY(previous->source().isEmpty());
    QTRY_VERIFY(previous.isNull());
    QVERIFY(f.model.canvasPlaybackRect(f.id("video")).isEmpty());
  }
  void cardOverlayZAndCardDestruction() {
    Fixture f;
    QTemporaryFile source(QDir::tempPath() + "/card-overlay-XXXXXX.qml");
    QVERIFY(source.open());
    const QByteArray qml = R"(
      import QtQuick
      Rectangle {
        required property color ink
        property int presses: 0
        color: ink
        MouseArea { anchors.fill: parent; onPressed: parent.presses++ }
      }
    )";
    QCOMPARE(source.write(qml), qml.size());
    source.close();
    const auto url = QUrl::fromLocalFile(source.fileName());
    const auto cardId = f.id("context-1");
    const auto point = f.canvas.mapFromScene(f.canvas.nodeOrigin(cardId) + QPointF(40, 30));
    QVERIFY(f.canvas.viewportWidget().rect().contains(point));
    auto foreground = CanvasOverlay::onQuickCanvas(f.canvas, f.engine, url, {{"ink", QColor(Qt::red)}}, 5, cardId);
    auto background = CanvasOverlay::onQuickCanvas(f.canvas, f.engine, url, {{"ink", QColor(Qt::blue)}}, 0, cardId);
    for (auto *overlay : {foreground.get(), background.get()}) {
      QVERIFY(overlay->rootObject());
      overlay->setGeometry(QRect(point - QPoint(10, 10), QSize(20, 20)));
      overlay->show();
    }
    QPointer<QQuickItem> front = foreground->rootObject();
    QPointer<QQuickItem> back = background->rootObject();
    QTest::mouseClick(&f.canvas.viewportWidget(), Qt::LeftButton, {}, point);
    QCOMPARE(front->property("presses").toInt(), 1);
    QCOMPARE(back->property("presses").toInt(), 0);
    QCOMPARE(f.pixelAt(point), QColor(Qt::red));

    f.model.project(snapshotWithoutCard(f.model, cardId), catalog());
    QTRY_VERIFY(front.isNull() && back.isNull());
    QVERIFY(!foreground->rootObject() && !background->rootObject());
  }

  void inlineEditorFrameContainsInput() {
    Fixture f;
    f.canvas.graphCanvas().viewportWheel = [&f](QWheelEvent &) {
      f.canvas.scaleBy(1.15, CanvasSurface::ZoomAnchor::Center);
    };
    const auto edited = f.id("context-1");
    f.model.setNodeData(edited, NodeRole::Position, QPointF(0, 220));
    f.canvas.selection().setNode(edited, true);
    f.inlineEditor.activate(edited, "text");
    f.inlineEditor.expand();
    const auto editor = f.surface.overlay("inline-property-overlay");
    QVERIFY(editor);
    auto *button = editor->rootObject()->findChild<QQuickItem *>("inline-expand");
    QVERIFY(button);
    const auto strip = button->mapToScene(QPointF(0, button->height() / 2));
    const auto point = QPointF(f.inlineEditor.editorRect().left() + 3, strip.y()).toPoint();
    QVERIFY(f.inlineEditor.editorRect().contains(point));
    QVERIFY(!button->contains(button->mapFromScene(point)));
    auto *input = editor->inputWidget();
    const auto zoom = f.canvas.zoom();
    QWheelEvent wheel(point, input->mapToGlobal(point), {}, {0, 120}, {}, {}, Qt::NoScrollPhase, false);
    QApplication::sendEvent(input, &wheel);
    QCOMPARE(f.canvas.zoom(), zoom);
    QTest::mouseClick(input, Qt::LeftButton, {}, point);
    QVERIFY(f.inlineEditor.active());
    QVERIFY(f.inlineEditor.expanded());
    QCOMPARE(f.canvas.selection().nodes(), QList<NodeId>{edited});
  }

  void expandedEditorReceivesInputAboveRaisedCard() {
    Fixture f;
    const auto edited = f.id("context-1");
    f.model.setNodeData(edited, NodeRole::Position, QPointF(0, 220));
    f.canvas.selection().setNode(edited, true);
    f.inlineEditor.activate(edited, "text");
    QVERIFY(f.inlineEditor.active());
    f.inlineEditor.expand();
    const auto editor = f.surface.overlay("inline-property-overlay");
    QVERIFY(editor);
    auto *button = editor->rootObject()->findChild<QQuickItem *>("inline-expand");
    QVERIFY(button);
    const auto point = button->mapToScene(QPointF(button->width(), button->height()) / 2).toPoint();
    QVERIFY(!f.canvas.viewportTransform().mapRect(f.canvas.nodeBounds(edited)).contains(point));
    QTRY_VERIFY(f.player("video") && f.player("video")->duration() > 1000);
    const auto *play = f.placeRaisedVideoControlAt(point);
    QVERIFY(play && play->contains(play->mapFromScene(point)));
    QTRY_VERIFY(!f.canvas.graphCanvas().rasterPending());
    const auto stacked = f.pixelAt(point);
    editor->rootObject()->setOpacity(0);
    QVERIFY(f.pixelAt(point) != stacked);
    editor->rootObject()->setOpacity(1);
    QTest::mouseClick(editor->inputWidget(), Qt::LeftButton, {}, point);
    QVERIFY(f.inlineEditor.active());
    QVERIFY(!f.inlineEditor.expanded());
    QVERIFY(f.canvas.selection().contains(edited));
    QCOMPARE(f.player("video")->playbackState(), QMediaPlayer::StoppedState);
  }

  void wideEditorReceivesInputAboveRaisedCard() {
    Fixture f;
    auto painter = node("painter", 0, 170);
    painter["type"] = "nodetool.image.Painter";
    auto metadata = catalog();
    metadata.append(QJsonObject{{"node_type", "nodetool.image.Painter"}, {"title", "Painter"}});
    f.model.project({{"graph", QJsonObject{{"nodes", QJsonArray{painter, node("video", 330, 0)}},
                                          {"edges", QJsonArray{}}}}}, metadata);
    QTRY_VERIFY(f.player("video") && f.player("video")->duration() > 1000);
    const auto edited = f.id("painter");
    f.canvas.selection().setNode(edited, true);
    f.inlineEditor.activate(edited, painterColorControl);
    const auto editor = f.surface.overlay("inline-property-overlay");
    QVERIFY(editor);
    auto *field = editor->rootObject()->findChild<QQuickItem *>("color-hex-" + QString(painterColorControl));
    QVERIFY(field);
    const auto point = field->mapToScene(QPointF(field->width() - 6, field->height() / 2)).toPoint();
    QVERIFY(!f.canvas.viewportTransform().mapRect(f.canvas.nodeRect(edited)).contains(point));
    const auto *play = f.placeRaisedVideoControlAt(point);
    QVERIFY(play && play->contains(play->mapFromScene(point)));
    QVERIFY(!field->hasActiveFocus());
    QTest::mouseClick(editor->inputWidget(), Qt::LeftButton, {}, point);
    QVERIFY(field->hasActiveFocus());
    QCOMPARE(f.player("video")->playbackState(), QMediaPlayer::StoppedState);
  }

  void noteEditorReceivesInputAboveRaisedCard() {
    Fixture f;
    InlineTitlePresenter notes(f.model, f.scene, f.canvas, &f.engine);
    const auto edited = f.id("context-1");
    f.model.setNodeData(edited, NodeRole::Position, QPointF(0, 220));
    notes.activate(edited);
    const auto editor = f.surface.overlay("inline-title-overlay");
    QVERIFY(editor);
    auto *field = editor->rootObject()->findChild<QQuickItem *>("inline-title-text");
    QVERIFY(field);
    field->setProperty("text", "A note extending below the card");
    QTRY_VERIFY(f.player("video") && f.player("video")->duration() > 1000);
    const auto point = field->mapToScene(QPointF(field->width() / 2, field->height() / 2)).toPoint();
    QVERIFY(!f.canvas.viewportTransform().mapRect(f.canvas.nodeBounds(edited)).contains(point));
    const auto *play = f.placeRaisedVideoControlAt(point);
    QVERIFY(play && play->contains(play->mapFromScene(point)));
    field->setProperty("cursorPosition", 0);
    QTest::mouseClick(editor->inputWidget(), Qt::LeftButton, {}, point);
    QVERIFY(field->property("cursorPosition").toInt() > 0);
    QCOMPARE(f.player("video")->playbackState(), QMediaPlayer::StoppedState);
  }

  void inlineLayerAndComplexGraphCaptures() {
    Fixture f;
    QTRY_VERIFY(f.player("video") && f.player("video")->duration() > 1000);
    f.click("video", "preview-play");
    QTRY_VERIFY(f.player("video")->videoSink()->videoFrame().isValid());
    f.click("video", "preview-play");
    f.canvas.selection().setNode(f.id("audio"), true);
    f.inlineEditor.activate(f.id("audio"), "text");
    QTRY_VERIFY(f.inlineEditor.active());
    f.inlineEditor.expand();
    f.presenter.refresh();
    const auto overlap = f.inlineEditor.editorRect().intersected(f.widget("audio")->geometry());
    QVERIFY(!overlap.isEmpty());
    QPointer<QMediaPlayer> previous = f.player("audio");
    auto next = f.sources;
    auto sound = next.first().toMap();
    sound["runId"] = "second";
    next.first() = sound;
    f.presenter.setSources(next);
    QTRY_VERIFY(f.player("audio") && f.player("audio") != previous && f.player("audio")->duration() > 1000);

    const auto editor = f.surface.overlay("inline-property-overlay");
    QVERIFY(editor);
    auto *field = editor->rootObject()->findChild<QQuickItem *>("inline-multiline");
    auto *play = f.widget("audio")->rootObject()->findChild<QQuickItem *>("preview-play");
    QVERIFY(field && play);
    const auto point = play->mapToScene(QPointF(play->width(), play->height()) / 2).toPoint();
    QVERIFY(field->contains(field->mapFromScene(point)));
    field->setProperty("cursorPosition", 0);
    QTest::mouseClick(editor->inputWidget(), Qt::LeftButton, {}, point);
    QVERIFY(field->property("cursorPosition").toInt() > 0);
    QCOMPARE(f.player("audio")->playbackState(), QMediaPlayer::StoppedState);
    f.inlineEditor.cancel();
    QQmlComponent component(&f.engine);
    component.setData("import QtQml; import NodeTool.UiPrimitives as Ui; QtObject { property var theme: Ui.Theme }", QUrl());
    std::unique_ptr<QObject> holder(component.create());
    QVERIFY2(holder, qPrintable(component.errorString()));
    auto theme = qvariant_cast<QObject *>(holder->property("theme"));
    QVERIFY(theme);
    theme->setProperty("reducedMotion", true);
    f.scene.setReducedMotion(true);
    for (const auto scheme : {2, 3}) {
      theme->setProperty("preference", scheme);
      auto canvas = nodetool::test::darkCanvasTheme();
      canvas.canvas = theme->property("surfaceCanvas").value<QColor>();
      canvas.node = theme->property("surfacePanel").value<QColor>();
      canvas.field = theme->property("surfaceInput").value<QColor>();
      canvas.textPrimary = theme->property("textPrimary").value<QColor>();
      canvas.textSecondary = theme->property("textSecondary").value<QColor>();
      canvas.primary = theme->property("accentPrimary").value<QColor>();
      canvas.divider = theme->property("borderSubtle").value<QColor>();
      canvas.grid = canvas.divider;
      f.scene.setTheme(canvas);
      QTest::qWait(50);
      QVERIFY(capture(f.surface.host(), QString("node-editor-canvas-media-%1.png").arg(scheme == 2 ? "dark" : "light")));
    }
    QVERIFY(!f.scene.animationActive());
  }
};
int main(int argc, char **argv) {
  QApplication app(argc, argv);
  nodetool::node_editor::registerMediaTypes();
  CanvasMediaTest test;
  return QTest::qExec(&test, argc, argv);
}
#include "CanvasMediaTest.moc"
