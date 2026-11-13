// The output renderers web cards show and the native card bodies now match:
// the agent status row, JSON colors and the Copy action in
// RichOutput.qml, and the image grid's hover actions, selection, comparison
// and batch download in MediaGallery.qml. Each QML file loads on its own with
// a MediaResolver, as MediaUiTest does.
#include "media/MediaResolver.h"
#include "media/VideoFrameView.h"
#include "properties/CodeHighlighter.h"
#include "run/RunOutputModel.h"
#include <QApplication>
#include <QBuffer>
#include <QClipboard>
#include <QDir>
#include <QFile>
#include <QImage>
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
using nodetool::node_editor::RunOutputModel;

class OutputRenderersTest final : public QObject {
  Q_OBJECT
  static QQuickItem *findItem(QQuickItem *item, const QString &name, bool visibleOnly = true) {
    if (!item) { return nullptr; }
    if (item->objectName() == name && (!visibleOnly || item->isVisible())) { return item; }
    for (auto *child : item->childItems()) { if (auto *found = findItem(child, name, visibleOnly)) { return found; } }
    return nullptr;
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
  void runOutputCarriesAgentStatus() {
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

  void richOutputDrawsStatusAndCopy() {
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
