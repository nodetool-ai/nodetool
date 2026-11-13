#include "media/LocalMediaStore.h"
#include "graph/WorkflowGraphModel.h"
#include <QClipboard>
#include "ui/EditorWindow.h"
#include "graph/EditorScene.h"
#include "media/VideoFrameView.h"
#include <QApplication>
#include <QDataStream>
#include <QFile>
#include <QDir>
#include <QGraphicsView>
#include <QJsonDocument>
#include <QMediaPlayer>
#include <QPointer>
#include <QQuickItem>
#include <QQuickWidget>
#include <QTemporaryDir>
#include <QVideoFrame>
#include <QVideoSink>
#include <QScrollBar>
#include <QWheelEvent>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QtTest>
using namespace nodetool;
namespace {
const QString VideoNode = QStringLiteral("11111111111111111111111111111111");
const QString AudioNode = QStringLiteral("22222222222222222222222222222222");
QByteArray audioBytes(int seconds = 3, int rate = 8000) {
  QByteArray bytes;
  QDataStream stream(&bytes, QIODevice::WriteOnly);
  stream.setByteOrder(QDataStream::LittleEndian);
  stream.writeRawData("RIFF", 4); stream << quint32(seconds * rate * 2 + 36);
  stream.writeRawData("WAVEfmt ", 8);
  stream << quint32(16) << quint16(1) << quint16(1) << quint32(rate) << quint32(rate * 2) << quint16(2) << quint16(16);
  stream.writeRawData("data", 4); stream << quint32(seconds * rate * 2);
  for (int i = 0; i < seconds * rate; ++i) { stream << qint16(i % 16 < 8 ? 12000 : -12000); }
  return bytes;
}
QJsonArray catalog() {
  return {
    QJsonObject{{"node_type", "Fixture.Video"}, {"title", "Video output"}, {"primary_output", "value"},
      {"outputs", QJsonArray{QJsonObject{{"name", "secondary"}, {"type", QJsonObject{{"type", "audio"}}}},
                            QJsonObject{{"name", "value"}, {"type", QJsonObject{{"type", "video"}}}}}}},
    QJsonObject{{"node_type", "Fixture.Audio"}, {"title", "Audio output"},
      {"outputs", QJsonArray{QJsonObject{{"name", "value"}, {"type", QJsonObject{{"type", "audio"}}}}}}}
  };
}
QJsonObject workflow(const QString &name = "Canvas media host fixture") {
  return {{"name", name}, {"graph", QJsonObject{{"nodes", QJsonArray{
    QJsonObject{{"id", VideoNode}, {"type", "Fixture.Video"}, {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 0}, {"y", 0}}}}}},
    QJsonObject{{"id", AudioNode}, {"type", "Fixture.Audio"}, {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 330}, {"y", 0}}}}}}
  }}, {"edges", QJsonArray{}}}}};
}
QQuickWidget *overlay(EditorWindow &window, const QString &id) {
  for (auto widget : window.findChildren<QQuickWidget *>()) {
    if (widget->objectName() == "canvas-media-" + id && widget->isVisible()) { return widget; }
  }
  return nullptr;
}
QMediaPlayer *player(EditorWindow &window, const QString &id) {
  const auto widget = overlay(window, id);
  return widget && widget->rootObject() ? widget->rootObject()->findChild<QMediaPlayer *>("preview-player") : nullptr;
}
void output(EditorWindow &window, const QString &job, const QString &node, const QString &kind, const QString &uri, const QString &name = "value") {
  window.runOutput()->ingest(job, {{"type", "output_update"}, {"job_id", job}, {"node_id", node}, {"output_name", name},
    {"value", QJsonObject{{"type", kind}, {"uri", uri}}}});
}
bool capture(EditorWindow &window, const QString &name) {
  const auto directory = qEnvironmentVariable("NODETOOL_MEDIA_CAPTURE_DIR");
  if (directory.isEmpty()) { return true; }
  return QDir().mkpath(directory) && window.grab().save(QDir(directory).filePath(name));
}
QQuickItem *visibleItem(QQuickItem *root, const QString &name) {
  if (root->isVisible() && root->objectName() == name) { return root; }
  for (auto child : root->childItems()) {
    if (auto item = visibleItem(child, name)) { return item; }
  }
  return nullptr;
}
void click(EditorWindow &window, const QString &id, const QString &name) {
  const auto widget = overlay(window, id);
  Q_ASSERT(widget && widget->rootObject());
  const auto control = widget->rootObject()->findChild<QQuickItem *>(name);
  Q_ASSERT(control);
  QTest::mouseClick(widget, Qt::LeftButton, Qt::NoModifier,
                   control->mapToScene(QPointF(control->width() / 2, control->height() / 2)).toPoint());
}
}
class CanvasMediaHostTest final : public QObject {
  Q_OBJECT
private slots:
  void previewShowsWiredConstantWithoutRun() {
    const QString constant = "44444444444444444444444444444444", preview = "55555555555555555555555555555555";
    const QJsonArray types{
      QJsonObject{{"node_type", "nodetool.constant.String"}, {"title", "String"},
        {"properties", QJsonArray{QJsonObject{{"name", "value"}, {"type", QJsonObject{{"type", "str"}}}}}},
        {"outputs", QJsonArray{QJsonObject{{"name", "output"}, {"type", QJsonObject{{"type", "str"}}}}}}},
      QJsonObject{{"node_type", "nodetool.workflows.base_node.Preview"}, {"title", "Preview"},
        {"properties", QJsonArray{QJsonObject{{"name", "value"}, {"type", QJsonObject{{"type", "any"}}}}}},
        {"outputs", QJsonArray{QJsonObject{{"name", "output"}, {"type", QJsonObject{{"type", "any"}}}}}}}};
    const auto at = [](int x) { return QJsonObject{{"position", QJsonObject{{"x", x}, {"y", 0}}}, {"width", 400}, {"height", 300}}; };
    QJsonObject constantNode{{"id", constant}, {"type", "nodetool.constant.String"}, {"ui_properties", at(0)}};
    constantNode["data"] = QJsonObject{{"value", "Hello before run"}};
    const QJsonObject previewNode{{"id", preview}, {"type", "nodetool.workflows.base_node.Preview"}, {"ui_properties", at(500)}};
    const QJsonObject edge{{"id", "edge"}, {"source", constant}, {"sourceHandle", "output"}, {"target", preview}, {"targetHandle", "value"}};
    QJsonObject graph;
    graph["nodes"] = QJsonArray{constantNode, previewNode};
    graph["edges"] = QJsonArray{edge};
    const QJsonObject fixture{{"name", "Preview source fixture"}, {"graph", graph}};
    EditorWindow window;
    window.resize(1400, 900); window.setCatalog(types);
    QVERIFY(window.document()->load(fixture));
    window.show(); window.fit();
    QTRY_VERIFY(overlay(window, preview));
    const auto rich = overlay(window, preview)->rootObject()->property("richEntry").toMap();
    QCOMPARE(rich["renderer"].toString(), "text");
    QVERIFY(rich["text"].toString().contains("Hello before run"));
    QVERIFY(!overlay(window, constant));
    auto *previewRoot = overlay(window, preview)->rootObject();
    QVERIFY(previewRoot->property("previewActions").toBool());
    auto *copy = previewRoot->findChild<QObject *>("preview-copy");
    QVERIFY(copy);
    QVERIFY(QMetaObject::invokeMethod(copy, "clicked"));
    QCOMPARE(QGuiApplication::clipboard()->text(), QString("Hello before run"));
    QCOMPARE(previewRoot->property("actionStatus").toString(), QString("Copied!"));
    window.runOutput()->beginRun("preview-run");
    window.runOutput()->ingest("preview-run", {{"type", "output_update"}, {"job_id", "preview-run"}, {"node_id", preview},
      {"output_name", "output"}, {"value", "Run result"}});
    QTRY_VERIFY(overlay(window, preview)->rootObject()->property("richEntry").toMap()["text"].toString().contains("Run result"));
    // The constant's card already shows its value, so its own run result adds no card.
    window.runOutput()->ingest("preview-run", {{"type", "output_update"}, {"job_id", "preview-run"}, {"node_id", constant},
      {"output_name", "output"}, {"value", "Constant result"}});
    QTest::qWait(150);
    QVERIFY(!overlay(window, constant));
    // A run result leaves the constant card at its size.
    auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    QtNodes::NodeId constantId = QtNodes::InvalidNodeId;
    for (const auto id : model.allNodeIds()) if (model.resourceId(id) == constant) constantId = id;
    const auto before = model.layout(constantId).size;
    emit window.session()->runSubmitted("constant-run");
    emit window.session()->runEvent("constant-run", {{"type", "node_update"}, {"job_id", "constant-run"}, {"node_id", constant},
      {"status", "completed"}, {"result", QJsonObject{{"output", "Constant result"}}}});
    QTest::qWait(150);
    QVERIFY(!model.hasRuntimeOutput(constantId));
    QCOMPARE(model.layout(constantId).size, before);
    window.runOutput()->beginRun("mixed-run");
    window.runOutput()->ingest("mixed-run", {{"type", "output_update"}, {"job_id", "mixed-run"}, {"node_id", preview},
      {"output_name", "output"}, {"value", QJsonArray{QJsonObject{{"type", "image"}, {"uri", "asset://mixed-image"}}, "Caption",
        QJsonObject{{"type", "audio"}, {"uri", "asset://mixed-audio"}}}}});
    QTRY_COMPARE(overlay(window, preview)->rootObject()->property("items").toList().size(), 3);
    QStringList kinds;
    for (const auto &item : overlay(window, preview)->rootObject()->property("items").toList()) { kinds.append(item.toMap()["kind"].toString()); }
    QCOMPARE(kinds, QStringList({"image", "text", "audio"}));
  }
  void richOutputsOnCards() {
    const QString objectNode = "33333333333333333333333333333333";
    auto types = catalog();
    for (int i = 0; i < types.size(); ++i) {
      auto type = types[i].toObject();
      type["title"] = i == 0 ? "Markdown result" : "Table result";
      types[i] = type;
    }
    auto objectType = types.last().toObject();
    objectType["node_type"] = "Fixture.Object"; objectType["title"] = "Object result";
    types.append(objectType);
    auto fixture = workflow();
    auto graph = fixture["graph"].toObject();
    auto nodes = graph["nodes"].toArray();
    nodes.append(QJsonObject{{"id", objectNode}, {"type", "Fixture.Object"},
      {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 660}, {"y", 0}}}}}});
    graph["nodes"] = nodes; fixture["graph"] = graph;
    EditorWindow window;
    window.resize(1400, 900); window.setCatalog(types);
    QVERIFY(window.document()->load(fixture));
    window.show(); window.fit();
    const auto snapshot = window.document()->snapshot();
    const auto undo = window.document()->undoStack()->count();
    window.runOutput()->beginRun("rich-cards");
    auto inject = [&](const QString &node, const QJsonValue &value) {
      window.runOutput()->ingest("rich-cards", {{"type", "output_update"}, {"job_id", "rich-cards"},
        {"node_id", node}, {"output_name", "value"}, {"value", value}});
    };
    inject(VideoNode, "# Results\n\n**Completed** successfully.\n\n- Clear text\n- Shared renderer");
    QJsonArray rows;
    for (int i = 0; i < 100; ++i) { rows.append(QJsonObject{{"region", QString("Region %1").arg(i)}, {"revenue", i * 120}}); }
    inject(AudioNode, QJsonObject{{"type", "dataframe"}, {"rows", rows}});
    inject(objectNode, QJsonObject{{"customer_name", "Ada"}, {"status", "Ready"}, {"details", QJsonObject{{"active", true}}}});
    window.fit();
    QTRY_VERIFY(overlay(window, VideoNode));
    QTRY_VERIFY(overlay(window, AudioNode));
    QTRY_VERIFY(overlay(window, objectNode));
    auto textWidget = overlay(window, VideoNode);
    QVERIFY(!textWidget->rootObject()->property("previewActions").toBool());
    auto tableWidget = overlay(window, AudioNode);
    auto objectWidget = overlay(window, objectNode);
    QCOMPARE(textWidget->rootObject()->property("richEntry").toMap()["renderer"].toString(), "text");
    QCOMPARE(tableWidget->rootObject()->property("richEntry").toMap()["renderer"].toString(), "dataframe");
    QCOMPARE(objectWidget->rootObject()->property("richEntry").toMap()["renderer"].toString(), "object");
    auto text = visibleItem(textWidget->rootObject(), "run-output-text");
    QVERIFY(text && text->isVisible());
    QVERIFY(text->property("value").toString().contains("Results"));
    auto objectText = visibleItem(objectWidget->rootObject(), "run-output-text");
    QVERIFY(objectText);
    QVERIFY(objectText->property("value").toString().contains("Ada"));
    auto table = visibleItem(tableWidget->rootObject(), "output-dataframe");
    QVERIFY(table && table->isVisible());
    QTRY_VERIFY(table->width() > 0 && table->height() > 0);
    // The rich output leaves the wheel to the canvas until a click engages it.
    auto scroll = textWidget->rootObject()->findChild<QQuickItem *>("canvas-rich-scroll");
    QVERIFY(scroll);
    QVERIFY(!scroll->property("interactive").toBool());
    const auto scrollPoint = scroll->mapToScene(QPointF(scroll->width() / 2, scroll->height() / 2)).toPoint();
    const auto unengagedZoom = textWidget->rootObject()->property("zoom").toReal();
    QWheelEvent canvasWheel(scrollPoint, textWidget->mapToGlobal(scrollPoint), {}, QPoint(0, 120), Qt::NoButton, Qt::NoModifier, Qt::NoScrollPhase, false);
    QApplication::sendEvent(textWidget, &canvasWheel);
    QTRY_VERIFY(textWidget->rootObject()->property("zoom").toReal() > unengagedZoom);
    QTest::mouseMove(textWidget, scrollPoint);
    QTest::mouseClick(textWidget, Qt::LeftButton, {}, scrollPoint);
    QTRY_VERIFY(scroll->property("interactive").toBool());
    auto view = window.findChild<QGraphicsView *>();
    QVERIFY(view);
    const auto zoomBefore = tableWidget->rootObject()->property("zoom").toReal();
    // Zoom through the editor, as the toolbar and shortcuts do. The window keeps its own
    // zoom state, so a direct QGraphicsView::scale is not a user zoom.
    window.action("Zoom out");
    view->horizontalScrollBar()->setValue(view->horizontalScrollBar()->value() + 20);
    view->verticalScrollBar()->setValue(view->verticalScrollBar()->value() + 15);
    QTest::qWait(100);
    QCOMPARE(overlay(window, AudioNode), tableWidget);
    // Card media follows the canvas zoom.
    QTRY_VERIFY(tableWidget->rootObject()->property("zoom").toReal() < zoomBefore);
    QCOMPARE(tableWidget->rootObject()->property("zoom").toReal(), view->transform().m11());
    const auto transform = view->viewportTransform();
    const auto point = table->mapToScene(QPointF(table->width() / 2, table->height() / 2)).toPoint();
    QVERIFY(tableWidget->rect().contains(point));
    const auto before = table->property("contentY").toReal();
    QWheelEvent wheel(point, tableWidget->mapToGlobal(point), {}, QPoint(0, -120), Qt::NoButton, Qt::NoModifier, Qt::NoScrollPhase, false);
    QApplication::sendEvent(tableWidget, &wheel);
    QTRY_VERIFY(table->property("contentY").toReal() > before);
    QCOMPARE(view->viewportTransform(), transform);
    window.runOutput()->ingest("rich-cards", {{"type", "log_update"}, {"job_id", "rich-cards"}, {"content", "Keep rich controls stable"}});
    QCOMPARE(overlay(window, AudioNode), tableWidget);
    QVERIFY(table->property("contentY").toReal() > before);
    for (bool dark : {true, false}) {
      window.setDarkTheme(dark); QTest::qWait(100);
      const auto directory = qEnvironmentVariable("NODETOOL_RICH_OUTPUT_CAPTURE_DIR");
      if (!directory.isEmpty()) {
        QVERIFY(QDir().mkpath(directory));
        QVERIFY(window.grab().save(QDir(directory).filePath(dark ? "cards-dark.png" : "cards-light.png")));
      }
    }
    QCOMPARE(window.document()->snapshot(), snapshot);
    QCOMPARE(window.document()->undoStack()->count(), undo);
    QPointer<QQuickWidget> previous = tableWidget;
    const auto center = view->mapToScene(view->viewport()->rect().center());
    const auto sceneRect = view->sceneRect();
    view->setSceneRect(-10000, -10000, 20000, 20000);
    view->centerOn(5000, 5000);
    QTRY_VERIFY(!overlay(window, AudioNode));
    QTRY_VERIFY(previous.isNull());
    view->setSceneRect(sceneRect); view->centerOn(center);
    QTRY_VERIFY(overlay(window, AudioNode));
    previous = overlay(window, AudioNode);
    window.runOutput()->reset();
    QTRY_VERIFY(!overlay(window, AudioNode));
    QTRY_VERIFY(previous.isNull());
    inject(AudioNode, "Stale result");
    QVERIFY(!overlay(window, AudioNode));
    window.runOutput()->beginRun("rich-cards");
    inject(AudioNode, QJsonObject{{"first", "Account scoped"}, {"second", true}});
    window.fit();
    QTRY_VERIFY(overlay(window, AudioNode));
    previous = overlay(window, AudioNode);
    window.session()->connectToServer(QUrl("http://127.0.0.1:1"), "fixture-token", "rich-account");
    QTRY_VERIFY(previous.isNull());
    inject(AudioNode, "Old account result");
    QVERIFY(!overlay(window, AudioNode));
    window.session()->disconnectFromServer();
    window.setCatalog(types);
    window.runOutput()->beginRun("rich-cards");
    inject(AudioNode, QJsonObject{{"first", "Workflow scoped"}, {"second", true}});
    window.fit();
    QTRY_VERIFY(overlay(window, AudioNode));
    previous = overlay(window, AudioNode);
    QTemporaryDir directory;
    QVERIFY(directory.isValid());
    const auto path = directory.filePath("other-workflow.json");
    QFile file(path);
    QVERIFY(file.open(QIODevice::WriteOnly));
    QVERIFY(file.write(QJsonDocument(workflow("Other workflow")).toJson()) > 0);
    file.close();
    QVERIFY(window.openFile(path));
    QTRY_VERIFY(previous.isNull());
    inject(AudioNode, "Old workflow result");
    QVERIFY(!overlay(window, AudioNode));
  }
  // A local run sends audio as inline base64. A node inside a chain reports it
  // only in node_update, and a named Preview reports it under its name.
  void storedMinuteOfAudioLoadsOnCard() {
    node_editor::WorkflowSession::setGuestBundlePath(QStringLiteral(GUEST_BUNDLE));
    qputenv("NODETOOL_LOCAL_RUNNER", "1");
    QTemporaryDir workspaces, assets;
    QVERIFY(workspaces.isValid());
    QVERIFY(assets.isValid());
    qputenv("NODETOOL_WORKSPACES_DIR", QFile::encodeName(workspaces.path()));
    qputenv("ASSET_FOLDER", QFile::encodeName(assets.path()));
    EditorWindow window;
    window.resize(1400, 900);
    auto metadata = catalog();
    metadata.append(QJsonObject{{"node_type", "nodetool.audio.synth.Oscillator"}, {"title", "Oscillator"},
      {"outputs", QJsonArray{QJsonObject{{"name", "chunk"}, {"type", QJsonObject{{"type", "chunk"}}}}}}});
    metadata.append(QJsonObject{{"node_type", "nodetool.audio.realtime.ChunksToAudio"}, {"title", "Recorder"}, {"primary_output", "audio"},
      {"outputs", QJsonArray{QJsonObject{{"name", "audio"}, {"type", QJsonObject{{"type", "audio"}}}}}}});
    window.setCatalog(metadata);
    const QJsonObject graph{{"nodes", QJsonArray{
      QJsonObject{{"id", "osc"}, {"type", "nodetool.audio.synth.Oscillator"}, {"data", QJsonObject{}}},
      QJsonObject{{"id", AudioNode}, {"type", "nodetool.audio.realtime.ChunksToAudio"}, {"data", QJsonObject{{"duration", 60}}}}
    }}, {"edges", QJsonArray{QJsonObject{{"id", "capture"}, {"source", "osc"}, {"sourceHandle", "chunk"}, {"target", AudioNode}, {"targetHandle", "chunk"}}}}};
    const QJsonObject document{{"id", ""}, {"name", "Minute render"}, {"graph", graph}};
    QVERIFY(window.document()->load(document));
    window.show();
    window.fit();
    QTRY_VERIFY_WITH_TIMEOUT(window.session()->localRunnerReady(), 60000);
    QString storedUri;
    connect(window.session(), &node_editor::WorkflowSession::runEvent, &window,
      [&storedUri](const QString &, const QJsonObject &event) {
        if (event["type"] == "output_update" && event["node_id"] == AudioNode) {
          const auto ref = event["value"].toObject();
          if (node_editor::LocalMediaStore::isLocalMedia(ref["uri"].toString())) { storedUri = ref["uri"].toString(); }
        }
      });
    const auto run = window.session()->run(document);
    QVERIFY(window.session()->runsInProcess(run));
    QTRY_VERIFY_WITH_TIMEOUT(!storedUri.isEmpty(), 30000);
    QVERIFY(node_editor::LocalMediaStore::instance().contains(storedUri));
    QTRY_VERIFY_WITH_TIMEOUT(player(window, AudioNode) && player(window, AudioNode)->duration() >= 59900, 15000);
    node_editor::LocalMediaStore::instance().releaseRun(run);
  }
  void inlineAudioOnChainNodesAndNamedPreviews() {
    const auto data = QString::fromLatin1(audioBytes().toBase64());
    const QString preview = QStringLiteral("33333333333333333333333333333333");
    auto nodes = catalog();
    nodes.append(QJsonObject{{"node_type", "nodetool.workflows.base_node.Preview"}, {"title", "Preview"},
      {"outputs", QJsonArray{QJsonObject{{"name", "output"}, {"type", QJsonObject{{"type", "any"}}}}}}});
    EditorWindow window;
    window.resize(1400, 900);
    window.setCatalog(nodes);
    QVERIFY(window.document()->load({{"name", "Inline audio"}, {"graph", QJsonObject{{"nodes", QJsonArray{
      QJsonObject{{"id", VideoNode}, {"type", "Fixture.Video"}, {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 0}, {"y", 0}}}}}},
      QJsonObject{{"id", AudioNode}, {"type", "Fixture.Audio"}, {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 330}, {"y", 0}}}}}},
      QJsonObject{{"id", preview}, {"type", "nodetool.workflows.base_node.Preview"}, {"data", QJsonObject{{"name", "loop"}}},
        {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 660}, {"y", 0}}}}}}}},
      {"edges", QJsonArray{QJsonObject{{"id", "e1"}, {"source", AudioNode}, {"sourceHandle", "value"}, {"target", preview}, {"targetHandle", "value"}}}}}}}));
    window.show();
    window.fit();
    const QJsonObject audio{{"type", "audio"}, {"uri", ""}, {"data", data}};
    window.runOutput()->beginRun("local");
    window.runOutput()->ingest("local", {{"type", "node_update"}, {"job_id", "local"}, {"node_id", AudioNode}, {"status", "completed"},
      {"result", QJsonObject{{"value", audio}}}});
    // A secondary output is not the card's result.
    window.runOutput()->ingest("local", {{"type", "node_update"}, {"job_id", "local"}, {"node_id", VideoNode}, {"status", "completed"},
      {"result", QJsonObject{{"secondary", audio}}}});
    window.runOutput()->ingest("local", {{"type", "output_update"}, {"job_id", "local"}, {"node_id", preview}, {"output_name", "loop"}, {"value", audio}});
    window.fit();
    QTRY_VERIFY_WITH_TIMEOUT(player(window, AudioNode) && player(window, AudioNode)->duration() > 1000, 15000);
    QTRY_VERIFY_WITH_TIMEOUT(player(window, preview) && player(window, preview)->duration() > 1000, 15000);
    QVERIFY(!overlay(window, VideoNode));
  }
  void outputToNativeCardsAndBoundaryCleanup() {
    QFile video(QStringLiteral(MEDIA_VIDEO_FIXTURE));
    QVERIFY(video.open(QIODevice::ReadOnly));
    const auto videoUri = "data:video/mp4;base64," + QString::fromLatin1(video.readAll().toBase64());
    const auto audioUri = "data:audio/wav;base64," + QString::fromLatin1(audioBytes().toBase64());
    EditorWindow window;
    window.resize(1400, 900);
    window.setCatalog(catalog());
    QVERIFY(window.document()->load(workflow()));
    window.show();
    window.fit();
    const auto initial = window.document()->snapshot();
    const auto undoCount = window.document()->undoStack()->count();
    window.runOutput()->beginRun("first");
    output(window, "first", VideoNode, "audio", audioUri, "secondary");
    QVERIFY(!overlay(window, VideoNode));
    output(window, "first", VideoNode, "video", videoUri);
    output(window, "first", AudioNode, "audio", audioUri);
    window.fit();
    QTRY_VERIFY_WITH_TIMEOUT(player(window, VideoNode) && player(window, VideoNode)->duration() > 1000, 15000);
    QTRY_VERIFY_WITH_TIMEOUT(player(window, AudioNode) && player(window, AudioNode)->duration() > 1000, 15000);
    QCOMPARE(overlay(window, VideoNode)->rootObject()->property("mediaKind").toString(), QString("video"));
    QCOMPARE(window.outputMedia().size(), 3);
    QCOMPARE(player(window, VideoNode)->playbackState(), QMediaPlayer::StoppedState);
    QCOMPARE(player(window, AudioNode)->playbackState(), QMediaPlayer::StoppedState);
    QVERIFY(window.selectNode(AudioNode));
    click(window, VideoNode, "preview-play");
    QTRY_COMPARE(player(window, VideoNode)->playbackState(), QMediaPlayer::PlayingState);
    QTRY_VERIFY(player(window, VideoNode)->videoSink()->videoFrame().isValid());
    QCOMPARE(window.selection(), AudioNode);
    QPointer<QMediaPlayer> previous = player(window, VideoNode);
    window.runOutput()->ingest("first", {{"type", "log_update"}, {"job_id", "first"}, {"content", "Preserve card playback while logs arrive"}});
    QCOMPARE(player(window, VideoNode), previous.data());
    QCOMPARE(previous->playbackState(), QMediaPlayer::PlayingState);
    click(window, AudioNode, "preview-compact-play");
    QTRY_COMPARE(player(window, AudioNode)->playbackState(), QMediaPlayer::PlayingState);
    click(window, VideoNode, "preview-play");
    click(window, AudioNode, "preview-compact-play");
    QTRY_COMPARE(player(window, VideoNode)->playbackState(), QMediaPlayer::PausedState);
    QTRY_COMPARE(player(window, AudioNode)->playbackState(), QMediaPlayer::PausedState);
    for (const auto dark : {true, false}) {
      window.setDarkTheme(dark);
      QTest::qWait(50);
      QVERIFY(capture(window, QString("node-editor-canvas-media-host-%1.png").arg(dark ? "dark" : "light")));
    }
    click(window, VideoNode, "preview-play");
    QTRY_COMPARE(player(window, VideoNode)->playbackState(), QMediaPlayer::PlayingState);
    QCOMPARE(window.document()->snapshot(), initial);
    QCOMPARE(window.document()->undoStack()->count(), undoCount);
    window.runOutput()->beginRun("empty-history");
    QTRY_VERIFY(!overlay(window, VideoNode));
    QTRY_VERIFY(previous.isNull());
    window.runOutput()->selectRun("first");
    QTRY_VERIFY_WITH_TIMEOUT(player(window, VideoNode) && player(window, VideoNode)->duration() > 1000, 15000);
    QCOMPARE(player(window, VideoNode)->playbackState(), QMediaPlayer::StoppedState);
    click(window, VideoNode, "preview-play");
    QTRY_COMPARE(player(window, VideoNode)->playbackState(), QMediaPlayer::PlayingState);
    previous = player(window, VideoNode);
    window.session()->connectToServer(QUrl("http://127.0.0.1:1"), "fixture-token-one", "account-one");
    QTRY_VERIFY(!overlay(window, VideoNode));
    QTRY_VERIFY(previous.isNull());
    QVERIFY(window.outputMedia().isEmpty());
    output(window, "first", VideoNode, "video", videoUri);
    QCoreApplication::processEvents();
    QVERIFY(!overlay(window, VideoNode));
    QVERIFY(window.outputMedia().isEmpty());
    window.setCatalog(catalog());
    window.runOutput()->beginRun("second");
    output(window, "second", VideoNode, "video", videoUri);
    window.fit();
    QTRY_VERIFY_WITH_TIMEOUT(player(window, VideoNode) && player(window, VideoNode)->duration() > 1000, 15000);
    previous = player(window, VideoNode);
    window.session()->connectToServer(QUrl("http://127.0.0.1:2"), "fixture-token-two", "account-two");
    QTRY_VERIFY(previous.isNull());
    QVERIFY(!overlay(window, VideoNode));
    output(window, "second", VideoNode, "video", videoUri);
    QVERIFY(window.outputMedia().isEmpty());
    window.session()->disconnectFromServer();
    window.setCatalog(catalog());
    window.runOutput()->beginRun("local");
    output(window, "local", VideoNode, "video", videoUri);
    window.fit();
    QTRY_VERIFY_WITH_TIMEOUT(player(window, VideoNode) && player(window, VideoNode)->duration() > 1000, 15000);
    previous = player(window, VideoNode);
    QTemporaryDir directory;
    QVERIFY(directory.isValid());
    const auto path = directory.filePath("different-workflow.json");
    QFile file(path);
    QVERIFY(file.open(QIODevice::WriteOnly));
    QVERIFY(file.write(QJsonDocument(workflow("Different workflow")).toJson()) > 0);
    file.close();
    QVERIFY(window.openFile(path));
    QTRY_VERIFY(previous.isNull());
    QVERIFY(!overlay(window, VideoNode));
    output(window, "local", VideoNode, "video", videoUri);
    QVERIFY(window.outputMedia().isEmpty());
    QVERIFY(!overlay(window, VideoNode));
  }
};
int main(int argc, char **argv) {
  QApplication app(argc, argv);
  nodetool::node_editor::registerMediaTypes();
  CanvasMediaHostTest test;
  return QTest::qExec(&test, argc, argv);
}
#include "CanvasMediaHostTest.moc"
