#include "ui/EditorWindow.h"
#include "media/VideoFrameView.h"
#include <QApplication>
#include <QDockWidget>
#include <QtEndian>
#include <QBuffer>
#include <QImage>
#include <QQuickTextDocument>
#include <QQmlEngine>
#include <QJSValue>
#include <QEvent>
#include <QTextBlock>
#include <QTcpServer>
#include <QTcpSocket>
#include <QDir>
#include <QQuickWidget>
#include <QQuickItem>
#include <QQuickWindow>
#include <QtTest>
using namespace nodetool;
static QQuickItem *visualItem(QQuickItem *root, const QString &name) {
 if (root->objectName() == name && root->isVisible()) { return root; }
 for (auto child : root->childItems()) { if (auto found = visualItem(child, name)) { return found; } }
 return nullptr;
}
struct PcmUiRecord { QByteArray bytes; int stops = 0; };
class PcmUiSink final : public node_editor::PcmSink {
public:
 // native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
 explicit PcmUiSink(std::shared_ptr<PcmUiRecord> record) : record(std::move(record)) {}
 QAudioFormat preferredFormat() const override { QAudioFormat format; format.setSampleRate(24000); format.setChannelCount(1); format.setSampleFormat(QAudioFormat::Float); return format; }
 bool supports(const QAudioFormat &format) const override { return format == preferredFormat(); }
 bool start(const QAudioFormat &) override { return true; }
 qsizetype capacityBytes() const override { return 9600; }
 qint64 write(QByteArrayView bytes) override { record->bytes.append(bytes.data(), bytes.size()); return bytes.size(); }
 bool drained() const override { return false; }
 bool failed() const override { return false; }
 void stop() override { ++record->stops; }
 // native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
 std::shared_ptr<PcmUiRecord> record;
};
static QJsonObject pcmUiEvent(const QString &output) {
 QByteArray bytes(2048, Qt::Uninitialized);
 for (int i = 0; i < 1024; ++i) { qToLittleEndian<qint16>(i % 48 < 24 ? 4096 : -4096, bytes.data() + i * 2); }
 return {{"job_id", "pcm-ui"}, {"type", "output_update"}, {"node_id", "speaker"}, {"output_name", output}, {"value", QJsonObject{{"type", "chunk"}, {"content_type", "audio"}, {"content", QString::fromLatin1(bytes.toBase64())}, {"content_metadata", QJsonObject{{"encoding", "pcm16le"}, {"sample_rate", 24000}, {"channels", 1}}}}}};
}
static QQuickItem *pcmUiControl(QQuickItem *root, const QString &name, QObject *controller) {
 if (root->objectName() == name && root->isVisible()) {
  for (auto parent = root->parentItem(); parent; parent = parent->parentItem()) {
   if (parent->property("controller").value<QObject *>() == controller) { return root; }
  }
 }
 for (auto child : root->childItems()) { if (auto found = pcmUiControl(child, name, controller)) { return found; } }
 return nullptr;
}
static QQuickWidget *pcmUiPanel(EditorWindow &window) {
 for (auto widget : window.findChildren<QQuickWidget *>()) { if (widget->source().fileName() == "RunOutput.qml") { return widget; } }
 return nullptr;
}
class RichOutputHostTest final : public QObject {
 Q_OBJECT
private slots:
 void pcmInvokableResultsRemainNativelyOwned() {
  EditorWindow window; window.resize(1400, 1000); window.show(); window.action("Output");
  // native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
  window.runOutput()->setPcmSinkFactory([] { return std::make_unique<PcmUiSink>(std::make_shared<PcmUiRecord>()); });
  window.runOutput()->beginRun("pcm-ui"); window.runOutput()->ingest("pcm-ui", pcmUiEvent("left")); window.runOutput()->ingest("pcm-ui", pcmUiEvent("right"));
  auto panel = pcmUiPanel(window); QVERIFY(panel); QTRY_COMPARE(panel->status(), QQuickWidget::Ready);
  QPointer<QObject> left = window.runOutput()->pcmFor("speaker", "left"), right = window.runOutput()->pcmFor("speaker", "right"); QVERIFY(left); QVERIFY(right);
  auto engine = panel->engine();
  QQmlEngine::setObjectOwnership(window.runOutput(), QQmlEngine::CppOwnership);
  auto api = engine->newQObject(window.runOutput()); auto lookup = api.property("pcmFor");
  auto leftHandle = lookup.callWithInstance(api, {QJSValue(QStringLiteral("speaker")), QJSValue(QStringLiteral("left"))});
  auto rightHandle = lookup.callWithInstance(api, {QJSValue(QStringLiteral("speaker")), QJSValue(QStringLiteral("right"))});
  QCOMPARE(leftHandle.toQObject(), left.data()); QCOMPARE(rightHandle.toQObject(), right.data());
  const bool nativeParents = left->parent() == window.runOutput() && right->parent() == window.runOutput();
  if (!nativeParents) {
   // Keep an invalid member-ownership regression from deleting a C++ member
   // when the test releases the JavaScript return values.
   QQmlEngine::setObjectOwnership(left, QQmlEngine::CppOwnership); QQmlEngine::setObjectOwnership(right, QQmlEngine::CppOwnership);
   QFAIL("Invokable-returned PCM controllers must remain parented to RunOutputModel");
  }
  leftHandle = QJSValue(); rightHandle = QJSValue(); api = QJSValue(); lookup = QJSValue(); engine->collectGarbage(); QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete); QCoreApplication::processEvents();
  QVERIFY(left); QVERIFY(right); QCOMPARE(window.runOutput()->pcmFor("speaker", "left"), left.data());
  window.runOutput()->reset(); engine->collectGarbage(); QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete); QCoreApplication::processEvents();
  QVERIFY(left); QVERIFY(!right); QCOMPARE(left->parent(), static_cast<QObject *>(window.runOutput()));
 }
 void pcmPerOutputFifoControls() {
  EditorWindow window; window.resize(1400, 1200); window.show(); window.action("Output");
  if (auto dock = window.findChild<QDockWidget *>("run-output-dock")) { dock->setMinimumHeight(600); }
  const auto snapshot = window.document()->snapshot(); const auto undo = window.document()->undoStack()->count();
  // native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
  auto records = std::make_shared<QList<std::shared_ptr<PcmUiRecord>>>();
  // native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
  window.runOutput()->setPcmSinkFactory([records] { auto record = std::make_shared<PcmUiRecord>(); records->append(record); return std::make_unique<PcmUiSink>(record); });
  window.runOutput()->beginRun("pcm-ui"); window.runOutput()->ingest("pcm-ui", pcmUiEvent("left")); window.runOutput()->ingest("pcm-ui", pcmUiEvent("right"));
  auto left = qobject_cast<node_editor::PcmStream *>(window.runOutput()->pcmFor("speaker", "left"));
  auto right = qobject_cast<node_editor::PcmStream *>(window.runOutput()->pcmFor("speaker", "right"));
  QVERIFY(left); QVERIFY(right); QVERIFY(left != right); QVERIFY(right->queued());
  auto panel = pcmUiPanel(window); QVERIFY(panel); QTRY_COMPARE(panel->status(), QQuickWidget::Ready);
  QTRY_VERIFY(pcmUiControl(panel->rootObject(), "pcm-start-stop", left));
  QTRY_VERIFY(panel->isVisible()); QTest::qWait(150);
  auto click = [panel](QQuickItem *item) {
   QVERIFY(item); const auto position = item->mapToScene(QPointF(item->width()/2, item->height()/2)).toPoint();
   auto scroll = visualItem(panel->rootObject(), "run-output-scroll"); QVERIFY(scroll);
   QVERIFY(panel->rect().contains(position)); QVERIFY(scroll->contains(scroll->mapFromScene(position)));
   QSignalSpy clicked(item, SIGNAL(clicked())); QVERIFY(clicked.isValid());
   QTest::mousePress(panel, Qt::LeftButton, Qt::NoModifier, position);
   const bool pressed = item->property("pressed").toBool();
   QTest::mouseRelease(panel, Qt::LeftButton, Qt::NoModifier, position);
   QVERIFY(pressed); QCOMPARE(clicked.count(), 1);
  };
  QCOMPARE(records->size(), 1); QVERIFY(!records->first()->bytes.isEmpty());
  click(pcmUiControl(panel->rootObject(), "pcm-start-stop", left)); QTRY_VERIFY(!left->playing()); QTRY_VERIFY(right->playing() && !right->queued());
  QCOMPARE(records->size(), 2); QVERIFY(!records->at(1)->bytes.isEmpty()); QCOMPARE(records->first()->stops, 1);
  auto restart = pcmUiControl(panel->rootObject(), "pcm-restart", left); QVERIFY(restart); click(restart); QTRY_VERIFY(left->queued());
  auto stop = pcmUiControl(panel->rootObject(), "pcm-start-stop", right); QVERIFY(stop); click(stop); QTRY_VERIFY(left->playing() && !left->queued());
  QCOMPARE(records->size(), 3); QVERIFY(!records->at(2)->bytes.isEmpty());
  auto start = pcmUiControl(panel->rootObject(), "pcm-start-stop", right); QVERIFY(start); QCOMPARE(start->property("text").toString(), "Start");
  click(start); QTRY_VERIFY(right->queued()); QVERIFY(left->playing() && !left->queued());
  click(pcmUiControl(panel->rootObject(), "pcm-start-stop", right)); QTRY_VERIFY(!right->playing()); QCOMPARE(records->size(), 3);
  QCOMPARE(window.runOutput()->pcmFor("speaker", "left"), static_cast<QObject *>(left));
  QCOMPARE(window.document()->snapshot(), snapshot); QCOMPARE(window.document()->undoStack()->count(), undo);
 }
 void pcmPressSurvivesChunkUpdate_data() {
  QTest::addColumn<bool>("newSibling");
  QTest::newRow("append-existing-output") << false;
  QTest::newRow("first-sibling-output") << true;
 }
 void pcmPressSurvivesChunkUpdate() {
  QFETCH(bool, newSibling);
  EditorWindow window; window.resize(1400, 1200); window.show(); window.action("Output");
  if (auto dock = window.findChild<QDockWidget *>("run-output-dock")) { dock->setMinimumHeight(600); }
  // native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
  window.runOutput()->setPcmSinkFactory([] { return std::make_unique<PcmUiSink>(std::make_shared<PcmUiRecord>()); });
  window.runOutput()->beginRun("pcm-ui"); window.runOutput()->ingest("pcm-ui", pcmUiEvent("left"));
  if (!newSibling) { window.runOutput()->ingest("pcm-ui", pcmUiEvent("right")); }
  auto left = qobject_cast<node_editor::PcmStream *>(window.runOutput()->pcmFor("speaker", "left"));
  auto right = qobject_cast<node_editor::PcmStream *>(window.runOutput()->pcmFor("speaker", "right")); QVERIFY(left); if (!newSibling) { QVERIFY(right); }
  auto panel = pcmUiPanel(window); QVERIFY(panel); QTRY_COMPARE(panel->status(), QQuickWidget::Ready);
  QTRY_VERIFY(pcmUiControl(panel->rootObject(), "pcm-start-stop", left));
  QTRY_VERIFY(panel->isVisible()); QTest::qWait(150);
  QPointer<QQuickItem> control = pcmUiControl(panel->rootObject(), "pcm-start-stop", left);
  panel->setFocus(); control->forceActiveFocus(); QTRY_VERIFY(control->hasActiveFocus());
  const auto position = control->mapToScene(QPointF(control->width()/2, control->height()/2)).toPoint();
  auto scroll = visualItem(panel->rootObject(), "run-output-scroll"); QVERIFY(scroll);
  QVERIFY(panel->rect().contains(position)); QVERIFY(scroll->contains(scroll->mapFromScene(position)));
  QTest::mousePress(panel, Qt::LeftButton, Qt::NoModifier, position);
  if (!control->property("pressed").toBool()) { QTest::mouseRelease(panel, Qt::LeftButton, Qt::NoModifier, position); QFAIL("The settled Stop target did not receive mouse press"); }
  window.runOutput()->ingest("pcm-ui", pcmUiEvent(newSibling ? "right" : "left")); QCoreApplication::processEvents();
  if (newSibling) { right = qobject_cast<node_editor::PcmStream *>(window.runOutput()->pcmFor("speaker", "right")); QVERIFY(right); }
  const bool retained = control && pcmUiControl(panel->rootObject(), "pcm-start-stop", left) == control.data();
  const bool focused = control && control->hasActiveFocus();
  QTest::mouseRelease(panel, Qt::LeftButton, Qt::NoModifier, position);
  QVERIFY2(retained, "A PCM update must preserve the pressed Stop control identity"); QVERIFY(focused);
  QTRY_VERIFY(!left->playing()); QTRY_VERIFY(right->playing() && !right->queued());
  QCOMPARE(window.runOutput()->pcmFor("speaker", "left"), static_cast<QObject *>(left));
 }
 void textReferenceRetryAndLinks() {
   QTcpServer server; QVERIFY(server.listen(QHostAddress::LocalHost));
   int attempts = 0;
   connect(&server, &QTcpServer::newConnection, this, [&] {
     auto socket = server.nextPendingConnection();
     connect(socket, &QTcpSocket::readyRead, socket, [&, socket] {
       socket->readAll();
       const QByteArray body("[Link](https://example.com) and `code`");
       if (++attempts == 1) socket->write("HTTP/1.1 503 Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
       else socket->write("HTTP/1.1 200 OK\r\nContent-Length: " + QByteArray::number(body.size()) + "\r\nConnection: close\r\n\r\n" + body);
       socket->disconnectFromHost();
     });
     connect(socket, &QTcpSocket::disconnected, socket, &QObject::deleteLater);
   });
   EditorWindow window; window.resize(1400, 1000); window.show(); window.action("Output");
   window.runOutput()->beginRun("reference");
   window.runOutput()->ingest("reference", {{"type", "output_update"}, {"job_id", "reference"}, {"node_id", "node"},
     {"value", QJsonObject{{"type", "text"}, {"uri", QString("http://127.0.0.1:%1/text").arg(server.serverPort())}}}});
   QQuickWidget *panel = nullptr;
   for (auto widget : window.findChildren<QQuickWidget *>()) if (widget->source().fileName() == "RunOutput.qml") panel = widget;
   QVERIFY(panel);
   QTRY_VERIFY(visualItem(panel->rootObject(), "output-text-retry"));
   auto retry = visualItem(panel->rootObject(), "output-text-retry");
   QTest::mouseClick(panel, Qt::LeftButton, Qt::NoModifier, retry->mapToScene(QPointF(retry->width()/2, retry->height()/2)).toPoint());
   QTRY_COMPARE(attempts, 2);
   auto text = visualItem(panel->rootObject(), "run-output-text"); QVERIFY(text);
   QTRY_VERIFY(text->property("text").toString().contains("Link"));
   QTest::mouseClick(panel, Qt::LeftButton, Qt::NoModifier, text->mapToScene(QPointF(10, 10)).toPoint());
   QTRY_VERIFY(visualItem(panel->rootObject(), "output-open-link"));
   window.runOutput()->beginRun("next");
   QTRY_VERIFY(!visualItem(panel->rootObject(), "output-open-link"));
 }
 void families_data() {
   QTest::addColumn<QJsonValue>("value");
   QTest::addColumn<QString>("renderer");
   QTest::newRow("dataframe") << QJsonValue(QJsonObject{{"type", "dataframe"}, {"rows", QJsonArray{
     QJsonObject{{"name", "North"}, {"revenue", 120}}, QJsonObject{{"name", "South"}, {"revenue", 95}}}}}) << QString("dataframe");
   QJsonArray largeRows;
   for (int i = 0; i < 2000; ++i) { largeRows.append(QJsonObject{{"name", QString::number(i)}, {"revenue", i}}); }
   QTest::newRow("large-dataframe") << QJsonValue(QJsonObject{{"type", "dataframe"}, {"rows", largeRows}}) << QString("dataframe");
   QTest::newRow("markdown") << QJsonValue(QString("# Results\n\n**Completed** workflow.\n\n- First result\n- Second result\n\n[Link](https://example.com) and `inline code`\n\n```\nblock code\n```")) << QString("text");
   QTest::newRow("text-reference") << QJsonValue(QJsonObject{{"type", "text"}, {"uri", "data:text/plain;base64,U2F2ZWQgdGV4dCByZWZlcmVuY2UgY29udGVudA=="}}) << QString("text");
   QTest::newRow("object") << QJsonValue(QJsonObject{{"customer_name", "Ada"}, {"details", QJsonObject{{"active", true}}}}) << QString("object");
   QTest::newRow("plotly") << QJsonValue(QJsonObject{{"type", "plotly_config"}, {"config", QJsonObject{{"data", QJsonArray{QJsonObject{{"x", QJsonArray{1, 2}}, {"y", QJsonArray{3, 5}}}}}}}}) << QString("plotly");
   QImage image(64, 48, QImage::Format_RGB32); image.fill(Qt::blue);
   QByteArray bytes; QBuffer buffer(&bytes); buffer.open(QIODevice::WriteOnly); image.save(&buffer, "PNG");
   const auto uri = "data:image/png;base64," + QString::fromLatin1(bytes.toBase64());
   image.fill(Qt::red);
   QByteArray secondBytes; QBuffer secondBuffer(&secondBytes); secondBuffer.open(QIODevice::WriteOnly); image.save(&secondBuffer, "PNG");
   const auto secondUri = "data:image/png;base64," + QString::fromLatin1(secondBytes.toBase64());
   QTest::newRow("image-comparison") << QJsonValue(QJsonObject{{"type", "image_comparison"},
     {"image_a", QJsonObject{{"uri", uri}}}, {"image_b", QJsonObject{{"uri", secondUri}}}}) << QString("image_comparison");
   QTest::newRow("tool-call") << QJsonValue(QJsonObject{{"type", "chunk"}, {"content_type", "tool_call"},
     {"content", "search"}, {"done", true}, {"content_metadata", QJsonObject{{"tool_name", "search"}, {"args", QJsonObject{{"query", "native"}}}}}}) << QString("tool_call");
   QTest::newRow("pcm-stream") << QJsonValue(QJsonArray{QJsonObject{{"type", "chunk"}, {"content_type", "audio"},
     {"content", "AAAAAA=="}, {"done", true}}}) << QString("pcm");
   QTest::newRow("unknown") << QJsonValue(QJsonObject{{"type", "future_output"}, {"text", "Unknown typed data remains JSON"}}) << QString("generic");
 }
 void families() {
   QFETCH(QJsonValue, value); QFETCH(QString, renderer);
   EditorWindow window;
   window.resize(1400, 1000); window.show(); window.action("Output");
   const auto snapshot = window.document()->snapshot();
   const auto undo = window.document()->undoStack()->count();
   window.runOutput()->beginRun("rich");
   window.runOutput()->ingest("rich", {{"job_id", "rich"}, {"type", "output_update"}, {"node_id", "node"},
     {"output_name", "result"}, {"value", value}});
   QVERIFY(!window.runOutput()->entries().isEmpty());
   QCOMPARE(window.runOutput()->entries().last().toMap()["renderer"].toString(), renderer);
   QQuickWidget *panel = nullptr;
   for (auto widget : window.findChildren<QQuickWidget *>()) {
     if (widget->source().fileName() == "RunOutput.qml") { panel = widget; break; }
   }
   QVERIFY(panel);
   QCOMPARE(panel->status(), QQuickWidget::Ready);
   QVERIFY(panel->rootObject());
   QTest::qWait(100);
   if (renderer == "pcm") {
     for (const auto &name : {"pcm-start-stop", "pcm-restart"}) {
       auto control = visualItem(panel->rootObject(), name); QVERIFY(control);
       QTest::mouseClick(panel, Qt::LeftButton, Qt::NoModifier, control->mapToScene(QPointF(control->width()/2, control->height()/2)).toPoint());
       QTest::qWait(30);
     }
     auto toggle = visualItem(panel->rootObject(), "pcm-start-stop"); QVERIFY(toggle);
     if (toggle->property("text").toString() == "Stop") {
       QTest::mouseClick(panel, Qt::LeftButton, Qt::NoModifier, toggle->mapToScene(QPointF(toggle->width()/2, toggle->height()/2)).toPoint());
       QTRY_COMPARE(toggle->property("text").toString(), "Start");
     }
     auto state = visualItem(panel->rootObject(), "pcm-state"); QVERIFY(state);
     QVERIFY(!state->property("text").toString().isEmpty());
   }
   if (renderer == "text") {
     auto text = visualItem(panel->rootObject(), "run-output-text");
     QVERIFY(text);
     if (QString(QTest::currentDataTag()) == "text-reference") { QTRY_VERIFY(text->property("text").toString().contains("Saved text reference content")); }
     QVERIFY(!text->property("font").value<QFont>().family().contains("Mono"));
     if (QString(QTest::currentDataTag()) == "markdown") {
       auto quickDocument = text->property("textDocument").value<QQuickTextDocument *>();
       QVERIFY(quickDocument);
       bool code = false, link = false;
       for (auto block = quickDocument->textDocument()->begin(); block.isValid(); block = block.next()) {
         for (auto it = block.begin(); !it.atEnd(); ++it) {
           const auto fragment = it.fragment();
           if (fragment.text().contains("inline code")) {
             code = fragment.charFormat().fontFamilies().toStringList().join(' ').contains("JetBrains");
           }
           link = link || fragment.charFormat().isAnchor();
         }
       }
       QVERIFY(code); QVERIFY(link);
     }
   }
   if (renderer == "tool_call") {
     const auto entry = window.runOutput()->entries().last().toMap();
     QCOMPARE(entry["toolSummary"].toString(), "(query)");
     QVERIFY(!entry.contains("toolStatus"));
     auto toggle = visualItem(panel->rootObject(), "output-tool-toggle");
     QVERIFY(toggle);
     const auto point = toggle->mapToScene(QPointF(toggle->width() / 2, toggle->height() / 2)).toPoint();
     QTest::mouseClick(panel, Qt::LeftButton, Qt::NoModifier, point);
     QTest::qWait(30);
     QVERIFY(toggle->property("text").toString().contains("⌄"));
   }
   auto click = [&](QQuickItem *item) {
     QVERIFY(item);
     QTest::mouseClick(panel, Qt::LeftButton, Qt::NoModifier,
       item->mapToScene(QPointF(item->width()/2, item->height()/2)).toPoint());
     QTest::qWait(30);
   };
   if (renderer == "image_comparison") {
     auto comparison = visualItem(panel->rootObject(), "output-comparison");
     QVERIFY(comparison);
     auto drag = visualItem(panel->rootObject(), "comparison-drag");
     QVERIFY(drag);
     const auto start = drag->mapToScene(QPointF(drag->width()/2, drag->height()/2)).toPoint();
     const auto end = drag->mapToScene(QPointF(drag->width()*0.8, drag->height()*0.8)).toPoint();
     QTest::mousePress(panel, Qt::LeftButton, Qt::NoModifier, start);
     QTest::mouseMove(panel, end, 30);
     QTest::mouseRelease(panel, Qt::LeftButton, Qt::NoModifier, end);
     QVERIFY(comparison->property("position").toReal() > 0.7);
     click(visualItem(panel->rootObject(), "comparison-mode"));
     QCOMPARE(comparison->property("mode").toString(), QString("vertical"));
     QCOMPARE(comparison->property("position").toReal(), 0.5);
     QTest::mousePress(panel, Qt::LeftButton, Qt::NoModifier, start);
     QTest::mouseMove(panel, end, 30);
     QTest::mouseRelease(panel, Qt::LeftButton, Qt::NoModifier, end);
     QVERIFY(comparison->property("position").toReal() > 0.7);
   }
   if (renderer == "dataframe") {
     click(visualItem(panel->rootObject(), "dataframe-expand"));
     QVERIFY(visualItem(panel->quickWindow()->contentItem(), "dataframe-close"));
     const QString captureDirectory = qEnvironmentVariable("NODETOOL_RICH_OUTPUT_CAPTURE_DIR");
     if (!captureDirectory.isEmpty()) {
       QVERIFY(QDir().mkpath(captureDirectory));
       for (bool dark : {true, false}) {
         window.setDarkTheme(dark); QTest::qWait(150);
         QVERIFY(window.grab().save(captureDirectory + "/" + QTest::currentDataTag() + (dark ? "-full-dark.png" : "-full-light.png")));
       }
     }
     click(visualItem(panel->quickWindow()->contentItem(), "dataframe-close"));
     QVERIFY(!visualItem(panel->quickWindow()->contentItem(), "dataframe-close"));
   }
   if (QString(QTest::currentDataTag()) == "large-dataframe") {
     auto list = visualItem(panel->rootObject(), "output-dataframe");
     QVERIFY(list);
     QCOMPARE(list->property("count").toInt(), 1000);
     auto content = list->property("contentItem").value<QQuickItem *>();
     QVERIFY(content);
     QVERIFY(content->childItems().size() < 100);
     const auto center = list->mapToScene(QPointF(list->width()/2, list->height()/2)).toPoint();
     QWheelEvent wheel(center, panel->mapToGlobal(center), QPoint(), QPoint(0, -720),
       Qt::NoButton, Qt::NoModifier, Qt::NoScrollPhase, false);
     QApplication::sendEvent(panel, &wheel);
     QTRY_VERIFY(list->property("contentY").toReal() > 0);
     QTest::qWait(30);
     QVERIFY(content->childItems().size() < 100);
   }
   const QString directory = qEnvironmentVariable("NODETOOL_RICH_OUTPUT_CAPTURE_DIR");
   if (!directory.isEmpty()) {
     QVERIFY(QDir().mkpath(directory));
     for (bool dark : {true, false}) {
       window.setDarkTheme(dark); QTest::qWait(150);
       QVERIFY(window.grab().save(directory + "/" + QTest::currentDataTag() + (dark ? "-dark.png" : "-light.png")));
     }
   }
   QCOMPARE(window.document()->snapshot(), snapshot);
   QCOMPARE(window.document()->undoStack()->count(), undo);
   window.runOutput()->reset();
   window.runOutput()->ingest("rich", {{"job_id", "rich"}, {"type", "output_update"}, {"node_id", "node"}, {"value", "late"}});
   QVERIFY(window.runOutput()->entries().isEmpty());
 }
};
int main(int argc, char **argv) {
 Q_INIT_RESOURCE(editor_qml);
 QApplication app(argc, argv);
 node_editor::registerMediaTypes();
 RichOutputHostTest test;
 return QTest::qExec(&test, argc, argv);
}
#include "RichOutputHostTest.moc"
