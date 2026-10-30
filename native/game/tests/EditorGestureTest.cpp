#include "editor/EditorController.h"
#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickWindow>
#include <QSGRendererInterface>
#include <QTemporaryDir>
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
