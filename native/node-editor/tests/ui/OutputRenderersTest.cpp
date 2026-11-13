// The output renderers web cards show and the native card bodies now match:
// the Plotly chart, the agent status row, JSON colors and the Copy action in
// RichOutput.qml, and the image grid's hover actions, selection, comparison
// and batch download in MediaGallery.qml. Each QML file loads on its own with
// a MediaResolver, as MediaUiTest does.
#include "media/MediaResolver.h"
#include "media/PlotlyChart.h"
#include "media/VideoFrameView.h"
#include "properties/CodeHighlighter.h"
#include "run/RunOutputModel.h"
#include <QApplication>
#include <QBuffer>
#include <QClipboard>
#include <QDir>
#include <QFile>
#include <QImage>
#include <QPainter>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickTextDocument>
#include <QTextBlock>
#include <QTextDocument>
#include <QTextLayout>
#include <QQuickWindow>
#include <QTemporaryDir>
#include <QtTest>
#include <memory>

using nodetool::node_editor::MediaResolver;
using nodetool::node_editor::PlotlyChart;
using nodetool::node_editor::RunOutputModel;

class OutputRenderersTest final : public QObject {
  Q_OBJECT
  static QQuickItem *findItem(QQuickItem *item, const QString &name, bool visibleOnly = true) {
    if (!item) { return nullptr; }
    if (item->objectName() == name && (!visibleOnly || item->isVisible())) { return item; }
    for (auto *child : item->childItems()) { if (auto *found = findItem(child, name, visibleOnly)) { return found; } }
    return nullptr;
  }
  static QImage render(PlotlyChart &chart, int width = 400, int height = 300) {
    chart.setSize(QSizeF(width, height));
    QImage image(width, height, QImage::Format_ARGB32_Premultiplied);
    image.fill(Qt::transparent);
    QPainter painter(&image);
    chart.paint(&painter);
    return image;
  }
  static int count(const QImage &image, QRgb color) {
    int matches = 0;
    for (int y = 0; y < image.height(); ++y) {
      for (int x = 0; x < image.width(); ++x) { if ((image.pixel(x, y) & 0xffffff) == (color & 0xffffff) && qAlpha(image.pixel(x, y)) == 255) { ++matches; } }
    }
    return matches;
  }
  static QVariantMap entry(const QJsonValue &value) {
    RunOutputModel model;
    model.beginRun("job");
    model.ingest("job", {{"type", "output_update"}, {"job_id", "job"}, {"node_id", "node"}, {"output_name", "output"}, {"value", value}});
    return model.entries().last().toMap();
  }
  static QString pngLocator(QColor color, QByteArray *bytes = nullptr) {
    QImage image(8, 8, QImage::Format_ARGB32);
    image.fill(color);
    QByteArray png;
    QBuffer buffer(&png);
    buffer.open(QIODevice::WriteOnly);
    image.save(&buffer, "PNG");
    if (bytes) { *bytes = png; }
    return "data:image/png;base64," + QString::fromLatin1(png.toBase64());
  }
  // NODETOOL_MEDIA_CAPTURE_DIR keeps a capture for review, as MediaUiTest does.
  static void capture(QQuickWindow &window, const QString &name) {
    const auto directory = qEnvironmentVariable("NODETOOL_MEDIA_CAPTURE_DIR");
    if (directory.isEmpty()) { return; }
    QTest::qWait(50);
    QVERIFY(QDir().mkpath(directory) && window.grabWindow().save(QDir(directory).filePath(name)));
  }
  static void click(QObject *button) { QVERIFY(button); QVERIFY(QMetaObject::invokeMethod(button, "clicked")); }

private slots:
  void chartDrawsBarsAndScatter() {
    PlotlyChart chart;
    chart.setFigure({{"data", QVariantList{
                        QVariantMap{{"type", "bar"}, {"name", "Sales"}, {"x", QVariantList{"Mon", "Tue", "Wed"}}, {"y", QVariantList{3, 7, 5}}, {"marker", QVariantMap{{"color", "rgb(200, 20, 30)"}}}},
                        QVariantMap{{"type", "scatter"}, {"name", "Trend"}, {"x", QVariantList{"Mon", "Tue", "Wed"}}, {"y", QVariantList{2, 4, 6}}, {"line", QVariantMap{{"color", "#10a050"}}}}}},
                     {"layout", QVariantMap{{"title", QVariantMap{{"text", "Week"}}}}}});
    QVERIFY(chart.supported());
    QCOMPARE(chart.traceCount(), 2);
    QCOMPARE(chart.title(), QString("Week"));
    const auto image = render(chart);
    QVERIFY2(count(image, qRgb(200, 20, 30)) > 500, "The bars are filled with the marker color");
    QVERIFY2(count(image, qRgb(0x10, 0xa0, 0x50)) > 40, "The scatter line is drawn in the line color");
    // The tallest bar (Tue, 7) is under the pointer in the middle of the plot.
    bool found = false;
    for (int y = 40; y < 280 && !found; y += 4) {
      const auto hit = chart.pointAt(200, y);
      if (hit.value("trace") == "Sales") {
        QCOMPARE(hit.value("x").toString(), QString("Tue"));
        QCOMPARE(hit.value("y").toString(), QString("7"));
        QCOMPARE(hit.value("label").toString(), QString("Sales: (Tue, 7)"));
        found = true;
      }
    }
    QVERIFY(found);
    QVERIFY(chart.pointAt(-50, -50).isEmpty());
  }

  void chartDrawsPieHistogramAndHeatmap() {
    PlotlyChart pie;
    pie.setFigure({{"data", QVariantList{QVariantMap{{"type", "pie"}, {"values", QVariantList{1, 3}}, {"labels", QVariantList{"a", "b"}},
                                                      {"marker", QVariantMap{{"colors", QVariantList{"#0000ff", "#ff0000"}}}}}}}});
    const auto pieImage = render(pie);
    const int blue = count(pieImage, qRgb(0, 0, 255)), red = count(pieImage, qRgb(255, 0, 0));
    QVERIFY(blue > 200);
    QVERIFY2(red > blue * 2, "The 75% slice is about three times the 25% slice");

    PlotlyChart histogram;
    histogram.setFigure({{"data", QVariantList{QVariantMap{{"type", "histogram"}, {"x", QVariantList{1, 1, 1, 2, 9}}, {"nbinsx", 2}, {"marker", QVariantMap{{"color", "#123456"}}}}}}});
    QVERIFY(count(render(histogram), qRgb(0x12, 0x34, 0x56)) > 500);

    PlotlyChart heatmap;
    heatmap.setFigure({{"data", QVariantList{QVariantMap{{"type", "heatmap"}, {"z", QVariantList{QVariantList{0, 1}, QVariantList{1, 0}}},
                                                          {"colorscale", QVariantList{QVariantList{0, "#000000"}, QVariantList{1, "#00ff00"}}}}}}});
    QVERIFY(count(render(heatmap), qRgb(0, 255, 0)) > 1000);
  }

  void chartListsUnsupportedTraces() {
    PlotlyChart chart;
    chart.setFigure({{"data", QVariantList{QVariantMap{{"type", "scatter3d"}}, QVariantMap{{"type", "sankey"}}}}});
    QVERIFY(!chart.supported());
    QCOMPARE(chart.unsupportedTypes(), QStringList({"scatter3d", "sankey"}));
  }

  void runOutputCarriesFigureAndAgentStatus() {
    const QJsonObject figure{{"data", QJsonArray{QJsonObject{{"type", "bar"}, {"y", QJsonArray{1, 2}}}}}, {"layout", QJsonObject{}}};
    const auto plotly = entry(QJsonObject{{"type", "plotly_config"}, {"config", figure}});
    QCOMPARE(plotly.value("renderer").toString(), QString("plotly"));
    QCOMPARE(plotly.value("plotly").toMap().value("data").toList().size(), 1);

    const auto status = entry(QJsonObject{{"type", "chunk"}, {"content_type", "agent_status"}, {"content", "Breaking the task down"},
                                          {"content_metadata", QJsonObject{{"kind", "planning"}, {"phase", "outline"}}}});
    QCOMPARE(status.value("renderer").toString(), QString("agent_status"));
    QCOMPARE(status.value("statusKind").toString(), QString("planning"));
    QCOMPARE(status.value("statusLabel").toString(), QString("outline"));
    QCOMPARE(status.value("statusSeverity").toString(), QString("info"));
    QCOMPARE(status.value("text").toString(), QString("Breaking the task down"));
    const auto warning = entry(QJsonObject{{"type", "chunk"}, {"content_type", "agent_status"}, {"content", "Slow tool"},
                                           {"content_metadata", QJsonObject{{"kind", "tool_call"}, {"severity", "warning"}}}});
    QCOMPARE(warning.value("statusLabel").toString(), QString("tool"));
    QCOMPARE(warning.value("statusSeverity").toString(), QString("warning"));
  }

  void richOutputDrawsChartStatusAndCopy() {
    MediaResolver resolver;
    QQmlEngine engine;
    QQuickWindow surface;
    surface.resize(480, 600);
    QQmlComponent component(&engine, QUrl("qrc:/qt/qml/NodeTool/NodeEditor/RichOutput.qml"));
    QVERIFY2(component.isReady(), qPrintable(component.errorString()));
    auto load = [&](const QVariantMap &model) {
      std::unique_ptr<QObject> output(component.createWithInitialProperties({{"modelData", model}, {"resolver", QVariant::fromValue<QObject *>(&resolver)}}));
      auto *item = qobject_cast<QQuickItem *>(output.get());
      if (item) { item->setParentItem(surface.contentItem()); item->setWidth(surface.width()); }
      return output;
    };
    surface.show();

    const QJsonObject figure{{"data", QJsonArray{QJsonObject{{"type", "scatter"}, {"y", QJsonArray{1, 3, 2}}}}}};
    auto chartOutput = load(entry(QJsonObject{{"type", "plotly_config"}, {"config", figure}}));
    QVERIFY2(chartOutput, qPrintable(component.errorString()));
    auto *root = qobject_cast<QQuickItem *>(chartOutput.get());
    auto *chart = qobject_cast<PlotlyChart *>(findItem(root, "output-plotly-chart"));
    QVERIFY(chart);
    QVERIFY(chart->supported());
    QVERIFY(chart->height() > 100);
    QVERIFY2(!findItem(root, "run-output-text"), "A drawn chart replaces the configuration text");
    chart->setFigure({{"data", QVariantList{
                         QVariantMap{{"type", "bar"}, {"name", "Sales"}, {"x", QVariantList{"Mon", "Tue", "Wed", "Thu"}}, {"y", QVariantList{3, 7, 5, 6}}},
                         QVariantMap{{"type", "scatter"}, {"name", "Trend"}, {"x", QVariantList{"Mon", "Tue", "Wed", "Thu"}}, {"y", QVariantList{2, 4, 6, 7}}}}},
                      {"layout", QVariantMap{{"title", "Weekly sales"}, {"yaxis", QVariantMap{{"title", "Units"}}}}}});
    capture(surface, "plotly-chart.png");
    chartOutput.reset();

    auto unsupported = load(entry(QJsonObject{{"type", "plotly_config"}, {"config", QJsonObject{{"data", QJsonArray{QJsonObject{{"type", "sankey"}}}}}}}));
    QVERIFY(findItem(qobject_cast<QQuickItem *>(unsupported.get()), "run-output-text"));
    QVERIFY(!findItem(qobject_cast<QQuickItem *>(unsupported.get()), "output-plotly"));

    auto status = load(entry(QJsonObject{{"type", "chunk"}, {"content_type", "agent_status"}, {"content", "Running search"},
                                         {"content_metadata", QJsonObject{{"kind", "tool_call"}, {"name", "web_search"}}}}));
    auto *statusRoot = qobject_cast<QQuickItem *>(status.get());
    QVERIFY(findItem(statusRoot, "output-agent-status"));
    QCOMPARE(findItem(statusRoot, "output-agent-status-label")->property("text").toString(), QString("WEB_SEARCH"));
    QCOMPARE(findItem(statusRoot, "output-agent-status-text")->property("text").toString(), QString("Running search"));
    QCOMPARE(findItem(statusRoot, "output-agent-status-icon")->property("name").toString(), QString("wrench"));
    QVERIFY(!findItem(statusRoot, "run-output-text"));
    QVERIFY2(!findItem(statusRoot, "output-copy"), "Agent status has no Copy action, as on the web");

    auto json = load(entry(QJsonObject{{"type", "json"}, {"data", QJsonObject{{"answer", 42}}}}));
    auto *jsonRoot = qobject_cast<QQuickItem *>(json.get());
    QVERIFY(findItem(jsonRoot, "output-json-syntax", false));
    auto *jsonText = findItem(jsonRoot, "run-output-text");
    QVERIFY(jsonText);
    auto *document = jsonText->property("textDocument").value<QQuickTextDocument *>();
    QVERIFY(document);
    bool colored = false;
    for (auto block = document->textDocument()->begin(); block.isValid(); block = block.next()) {
      if (!block.layout()->formats().isEmpty()) { colored = true; }
    }
    QVERIFY2(colored, "JSON tokens are colored");
    auto *copy = findItem(jsonRoot, "output-copy", false);
    QVERIFY(copy);
    click(copy);
    QCOMPARE(QGuiApplication::clipboard()->text(), entry(QJsonObject{{"type", "json"}, {"data", QJsonObject{{"answer", 42}}}}).value("text").toString());
    QCOMPARE(json->property("copyStatus").toString(), QString("Copied!"));
    QVERIFY(QGuiApplication::clipboard()->text().contains("\"answer\": 42"));
  }

  void galleryHoverSelectionCompareAndBatchDownload() {
    QByteArray redBytes, greenBytes, blueBytes;
    const QVariantList items{
      QVariantMap{{"kind", "image"}, {"locator", pngLocator(Qt::red, &redBytes)}, {"itemKey", "red"}, {"filename", "red.png"}},
      QVariantMap{{"kind", "image"}, {"locator", pngLocator(Qt::green, &greenBytes)}, {"itemKey", "green"}, {"filename", "green.png"}},
      QVariantMap{{"kind", "image"}, {"locator", pngLocator(Qt::blue, &blueBytes)}, {"itemKey", "blue"}, {"filename", "blue.png"}}};
    MediaResolver resolver;
    QQmlEngine engine;
    QQmlComponent component(&engine, QUrl("qrc:/qt/qml/NodeTool/NodeEditor/MediaGallery.qml"));
    QVERIFY2(component.isReady(), qPrintable(component.errorString()));
    std::unique_ptr<QObject> gallery(component.createWithInitialProperties({{"resolver", QVariant::fromValue<QObject *>(&resolver)}, {"items", items}, {"scopeKey", "grid-test"}}));
    QVERIFY2(gallery, qPrintable(component.errorString()));
    QQuickWindow surface;
    surface.resize(600, 600);
    auto *root = qobject_cast<QQuickItem *>(gallery.get());
    root->setParentItem(surface.contentItem());
    root->setSize(surface.size());
    surface.show();

    // Hovering an image tile shows its Copy, Download and Open actions.
    QQuickItem *tile = nullptr;
    QTRY_VERIFY((tile = findItem(root, "gallery-tile-0")));
    QTRY_VERIFY(findItem(tile, "preview-image", false) && findItem(tile, "preview-image", false)->property("status").toInt() == 1);
    QVERIFY(!findItem(tile, "gallery-tile-actions"));
    QTest::mouseMove(&surface, tile->mapToScene(QPointF(tile->width() / 2, tile->height() / 2)).toPoint());
    QTRY_VERIFY(findItem(tile, "gallery-tile-actions"));
    capture(surface, "gallery-hover.png");
    QVERIFY(findItem(tile, "gallery-tile-copy"));
    click(findItem(tile, "gallery-tile-copy"));
    QTRY_VERIFY(!QGuiApplication::clipboard()->image().isNull());
    QCOMPARE(QGuiApplication::clipboard()->image().pixelColor(0, 0), QColor(Qt::red));

    // Select mode: checked tiles, the count, Compare for exactly two images.
    QVERIFY(!findItem(root, "gallery-compare"));
    click(findItem(root, "gallery-select"));
    QVERIFY(root->property("selectionMode").toBool());
    QTRY_VERIFY(!findItem(tile, "gallery-tile-actions"));
    QVERIFY(findItem(tile, "gallery-tile-check"));
    QVERIFY(QMetaObject::invokeMethod(tile, "press"));
    QVERIFY(findItem(root, "gallery-compare"));
    QVERIFY(!findItem(root, "gallery-compare")->isEnabled());
    QQuickItem *second = findItem(root, "gallery-tile-1");
    QVERIFY(second);
    second->forceActiveFocus();
    QTest::keyClick(&surface, Qt::Key_Space);
    QCOMPARE(root->property("selectedKeys").toStringList(), QStringList({"red", "green"}));
    QCOMPARE(findItem(root, "gallery-selected-count")->property("text").toString(), QString("2 selected"));
    capture(surface, "gallery-selection.png");
    QVERIFY(findItem(root, "gallery-compare")->isEnabled());
    click(findItem(root, "gallery-compare"));
    QTRY_VERIFY(findItem(root, "gallery-compare-view"));
    QVERIFY(findItem(root, "output-comparison"));
    QVERIFY(!findItem(root, "gallery-tile-0"));
    click(findItem(root, "gallery-close-compare"));
    QTRY_VERIFY(findItem(root, "gallery-tile-0"));

    // Download writes every selected output into the chosen folder.
    QTemporaryDir directory;
    QVERIFY(directory.isValid());
    QVERIFY(QMetaObject::invokeMethod(root, "downloadSelected", Q_ARG(QVariant, QUrl::fromLocalFile(directory.path()))));
    QTRY_COMPARE(findItem(root, "gallery-batch-status")->property("text").toString(), QString("Saved 2 files"));
    QFile red(directory.filePath("1-red.png")), green(directory.filePath("2-green.png"));
    QVERIFY(red.open(QIODevice::ReadOnly));
    QCOMPARE(red.readAll(), redBytes);
    QVERIFY(green.open(QIODevice::ReadOnly));
    QCOMPARE(green.readAll(), greenBytes);
    QCOMPARE(QDir(directory.path()).entryList(QDir::Files).size(), 2);

    click(findItem(root, "gallery-clear-selection"));
    QVERIFY(root->property("selectedKeys").toStringList().isEmpty());
    QVERIFY(!findItem(tile, "gallery-tile-check")->property("checked").toBool());
    // New items leave select mode, as the web grid does when the image count changes.
    QVERIFY(QMetaObject::invokeMethod(tile, "press"));
    QVERIFY(gallery->setProperty("items", items.mid(0, 2)));
    QVERIFY(!root->property("selectionMode").toBool());
    QVERIFY(root->property("selectedKeys").toStringList().isEmpty());
  }
};

int main(int argc, char **argv) {
  QApplication app(argc, argv);
  nodetool::node_editor::registerMediaTypes();
  nodetool::node_editor::registerCodeHighlighter();
  OutputRenderersTest test;
  return QTest::qExec(&test, argc, argv);
}
#include "OutputRenderersTest.moc"
