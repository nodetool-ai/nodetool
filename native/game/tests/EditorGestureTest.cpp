#include "editor/EditorController.h"
#include <QGuiApplication>
#include <QCryptographicHash>
#include <QFile>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickWindow>
#include <QSGRendererInterface>
#include <QTemporaryDir>
#include <cmath>
#if QT_CONFIG(vulkan)
#include <QVulkanInstance>
#endif
#include <QtTest>
using namespace nodetool::game;
QQuickItem *visualChild(QQuickItem *root, const QString &name) {
  if (root->objectName() == name) {
    return root;
  }
  for (auto *item : root->childItems()) {
    if (auto *found = visualChild(item, name)) {
      return found;
    }
  }
  return nullptr;
}
class EditorGestureTest final : public QObject {
  Q_OBJECT
private slots:
  void authored2DPreviewRendersAcrossOpenStopAndDrag() {
    QTemporaryDir dir;
    const auto imagePath = dir.filePath("white.png");
    QImage image(1, 1, QImage::Format_RGBA8888);
    image.fill(Qt::white);
    QVERIFY(image.save(imagePath));
    QFile file(imagePath);
    QVERIFY(file.open(QIODevice::ReadOnly));
    const auto bytes = file.readAll();
    EditorController editor;
    const Json doc{{"engine", "native-cpp-1"}, {"schemaVersion", 5}, {"dimension", "2d"},
      {"id", "preview"}, {"title", "Preview"}, {"initialSceneId", "scene"},
      {"assets", Json::array({{{"id", "white"}, {"kind", "image"}, {"path", "white.png"},
        {"size", bytes.size()}, {"digest", QCryptographicHash::hash(bytes, QCryptographicHash::Sha256).toHex().toStdString()}}})},
      {"scenes", Json::array({{{"id", "scene"}, {"entities", Json::array({
        {{"id", "parent"}, {"transform", {{"x", 1}, {"y", 0}}}},
        {{"id", "sprite"}, {"parentId", "parent"}, {"sprite", {{"assetId", "white"}, {"width", 1}, {"height", 1}}}}
      })}}})}};
    editor.openDocument(doc, dir.filePath("game.json"));
    QQmlApplicationEngine engine;
    engine.rootContext()->setContextProperty("editor", &editor);
    engine.load(QUrl("qrc:/game-editor/Editor.qml"));
    QVERIFY(!engine.rootObjects().empty());
    auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().front());
    QVERIFY(window);
#if QT_CONFIG(vulkan)
    if (vulkan_) { window->setVulkanInstance(vulkan_); }
#endif
    QVERIFY(QTest::qWaitForWindowExposed(window));
    auto *viewport = qobject_cast<GameViewport *>(visualChild(window->contentItem(), "editorViewport"));
    QVERIFY(viewport);
    QVERIFY(!editor.mailbox()->latest()->contains("worldTransforms"));
    QTRY_VERIFY_WITH_TIMEOUT((viewport->update(), viewport->report().value("vertices", 0) >= 6 || !viewport->renderError().isEmpty()), 10000);
    QVERIFY2(viewport->renderError().isEmpty(), qPrintable(viewport->renderError()));
    const auto whiteCenter = [&]() {
      viewport->update();
      window->grabWindow();
      viewport->update();
      const auto capture = window->grabWindow();
      const auto origin = viewport->mapToScene(QPointF(0, 0));
      const double scale = double(capture.width()) / window->width();
      double sum = 0;
      int count = 0;
      for (int y = int((origin.y() + 10) * scale); y < int((origin.y() + viewport->height() - 10) * scale); ++y) {
        for (int x = int((origin.x() + 10) * scale); x < int((origin.x() + viewport->width() - 10) * scale); ++x) {
          const auto color = capture.pixelColor(x, y);
          if (color.red() > 250 && color.green() > 250 && color.blue() > 250) { sum += x; ++count; }
        }
      }
      return count > 50 ? sum / count : -1.;
    };
    const auto initialCenter = whiteCenter();
    QVERIFY(initialCenter >= 0);
    QVERIFY(editor.start());
    QVERIFY(editor.step());
    QVERIFY(editor.mailbox()->latest()->contains("worldTransforms"));
    editor.stop();
    QVERIFY(!editor.mailbox()->latest()->contains("worldTransforms"));
    QVERIFY(std::abs(whiteCenter() - initialCenter) < 1.);
    QVERIFY2(viewport->renderError().isEmpty(), qPrintable(viewport->renderError()));
    editor.select("parent");
    QVERIFY(editor.beginDrag("translate"));
    editor.previewDrag(2, 0, 0, 0);
    QVERIFY(!editor.mailbox()->latest()->contains("worldTransforms"));
    QCOMPARE(editor.mailbox()->latest()->at("entities")[0].at("transform").at("x"), Json(3));
    QVERIFY(whiteCenter() > initialCenter + 10);
    QVERIFY2(viewport->renderError().isEmpty(), qPrintable(viewport->renderError()));
    QVERIFY(editor.endDrag());
    window->setProperty("closingConfirmed", true);
    window->close();
  }
  void pointerKeyboardAndAgentConflict_data() {
    QTest::addColumn<bool>("is2D");
    QTest::newRow("native3d") << false;
    QTest::newRow("native2d") << true;
  }
  void pointerKeyboardAndAgentConflict() {
    QFETCH(bool, is2D);
    QTemporaryDir dir;
    EditorController editor;
    auto document = Json(
        {{"id", "game"},
         {"engine", "native-cpp-1"},
         {"schemaVersion", 4},
         {"dimension", "3d"},
         {"title", "Gesture fixture"},
         {"initialSceneId", "scene"},
         {"scenes", Json::array({{{"id", "scene"},
                                  {"entities",
                                   Json::array({{{"id", "cube"},
                                                 {"name", "Cube"},
                                                 {"visual",
                                                  {{"kind", "primitive"},
                                                   {"shape", "box"}}}}})}}})}});
    if (is2D) {
      document["dimension"] = "2d";
      document["schemaVersion"] = 5;
      document["scenes"][0]["entities"][0].erase("visual");
    }
    editor.openDocument(document);
    const auto selectedX = [&]() {
      const auto transform =
          editor.document()["scenes"][0]["entities"][0]["transform"];
      return is2D ? transform["x"].get<double>()
                  : transform["position"][0].get<double>();
    };
    QVERIFY(editor.save(dir.filePath("game.json")));
    QQmlApplicationEngine engine;
    engine.rootContext()->setContextProperty("editor", &editor);
    engine.load(QUrl("qrc:/game-editor/Editor.qml"));
    QVERIFY(!engine.rootObjects().empty());
    auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().front());
    QVERIFY(window);
#if QT_CONFIG(vulkan)
    if (vulkan_) {
      window->setVulkanInstance(vulkan_);
    }
#endif
    QVERIFY(QTest::qWaitForWindowExposed(window));
    window->requestActivate();
    QVERIFY(QTest::qWaitForWindowActive(window));
    QQuickItem *row = nullptr;
    QTRY_VERIFY((row = visualChild(window->contentItem(), "entity-cube")));
    auto center = [&](QQuickItem *item) {
      return item->mapToScene(QPointF(item->width() / 2, item->height() / 2))
          .toPoint();
    };
    QTest::mouseClick(window, Qt::LeftButton, Qt::NoModifier, center(row));
    QCOMPARE(editor.selectedId(), QString("cube"));
    auto *viewport = visualChild(window->contentItem(), "editorViewport");
    QVERIFY(viewport);
    const auto point = center(viewport);
    QTest::keyClick(window, Qt::Key_W);
    QTest::mousePress(window, Qt::LeftButton, Qt::NoModifier, point);
    QTest::mouseMove(window, point + QPoint(70, 0), 30);
    QTest::mouseRelease(window, Qt::LeftButton, Qt::NoModifier,
                        point + QPoint(70, 0));
    QCOMPARE(editor.revision(), 1ULL);
    QVERIFY(selectedX() > 0);
    QTest::keyClick(window, Qt::Key_Z, Qt::ControlModifier);
    QTRY_COMPARE(editor.revision(), 2ULL);
    QCOMPARE(selectedX(), 0.);
    QTest::keyClick(window, Qt::Key_Z, Qt::ControlModifier | Qt::ShiftModifier);
    QTRY_COMPARE(editor.revision(), 3ULL);
    QTest::mousePress(window, Qt::LeftButton, Qt::NoModifier, point);
    QTest::mouseMove(window, point + QPoint(30, 0), 30);
    QTest::keyClick(window, Qt::Key_Escape);
    QTest::mouseRelease(window, Qt::LeftButton, Qt::NoModifier,
                        point + QPoint(30, 0));
    QTRY_COMPARE(editor.revision(), 3ULL);
    QTest::mousePress(window, Qt::LeftButton, Qt::NoModifier, point);
    QTest::mouseMove(window, point + QPoint(30, 0), 30);
    editor.dispatch({{"operation", "transaction"},
                     {"expectedRevision", 3},
                     {"operations", Json::array({{{"kind", "setTitle"},
                                                  {"title", "Agent edit"}}})}});
    QTest::mouseRelease(window, Qt::LeftButton, Qt::NoModifier,
                        point + QPoint(30, 0));
    QCOMPARE(editor.revision(), 4ULL);
    QVERIFY(editor.diagnostic().contains("revision", Qt::CaseInsensitive));
    QTest::keyClick(window, Qt::Key_S, Qt::ControlModifier);
    QVERIFY(!editor.dirty());
    window->setProperty("closingConfirmed", true);
    window->close();
  }

#if QT_CONFIG(vulkan)
public:
  QVulkanInstance *vulkan_ = nullptr;
#endif
};
int main(int argc, char **argv) {
  QGuiApplication app(argc, argv);
  const bool useVulkan = qgetenv("QSG_RHI_BACKEND") == "vulkan";
#if QT_CONFIG(vulkan)
  QVulkanInstance vulkan;
  if (useVulkan) {
    QQuickWindow::setGraphicsApi(QSGRendererInterface::Vulkan);
    vulkan.setApiVersion(QVersionNumber(1, 1));
    if (!vulkan.create()) {
      return 1;
    }
  }
#else
  if (useVulkan) {
    qCritical("Vulkan was requested, but this Qt build has no Vulkan support");
    return 1;
  }
#endif
  qmlRegisterType<GameViewport>("NodeTool.Game", 1, 0, "GameViewport");
  EditorGestureTest test;
#if QT_CONFIG(vulkan)
  if (useVulkan) {
    test.vulkan_ = &vulkan;
  }
#endif
  return QTest::qExec(&test, argc, argv);
}
#include "EditorGestureTest.moc"
