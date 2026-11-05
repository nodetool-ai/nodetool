#include "ui/EditorWindow.h"
#include "media/VideoFrameView.h"
#include <QApplication>
#include <QBuffer>
#include <QImage>
#include <QQuickTextDocument>
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
class RichOutputHostTest final : public QObject {
 Q_OBJECT
private slots:
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
