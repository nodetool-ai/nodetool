#include "EditorController.h"
#include <QCommandLineParser>
#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickWindow>
#include <QSGRendererInterface>
#include <QTimer>
#if QT_CONFIG(vulkan)
#include <QVulkanInstance>
#endif
#include <iostream>
using namespace nodetool::game;
int main(int argc, char **argv) {
  QGuiApplication app(argc, argv);
  QCommandLineParser parser;
  parser.setApplicationDescription("NodeTool native game editor");
  parser.addHelpOption();
  parser.addPositionalArgument("document", "Native game document");
  parser.addOption({"socket", "User-local agent command socket", "name"});
  parser.addOption({"quit-after",
                    "Close after a bounded test interval in milliseconds",
                    "milliseconds"});
  parser.process(app);
  const bool useVulkan = qgetenv("QSG_RHI_BACKEND") == "vulkan";
#if QT_CONFIG(vulkan)
  QVulkanInstance vulkan;
  if (useVulkan) {
    QQuickWindow::setGraphicsApi(QSGRendererInterface::Vulkan);
    vulkan.setApiVersion(QVersionNumber(1, 1));
    if (!vulkan.create()) {
      std::cerr << "Cannot create requested Vulkan instance: "
                << vulkan.errorCode() << '\n';
      return 1;
    }
  }
#else
  if (useVulkan) {
    std::cerr
        << "Vulkan was requested, but this Qt build has no Vulkan support\n";
    return 1;
  }
#endif
  EditorController controller;
  if (!parser.positionalArguments().empty() &&
      !controller.open(parser.positionalArguments().first())) {
    std::cerr << controller.diagnostic().toStdString() << '\n';
    return 1;
  }
  if (parser.isSet("socket") && !controller.listen(parser.value("socket"))) {
    std::cerr << "Cannot bind editor agent socket\n";
    return 1;
  }
  qmlRegisterUncreatableType<EditorController>(
      "NodeTool.Game", 1, 0, "EditorController", "Provided by host");
  qmlRegisterType<GameViewport>("NodeTool.Game", 1, 0, "GameViewport");
  QQmlApplicationEngine engine;
  engine.rootContext()->setContextProperty("editor", &controller);
  engine.load(QUrl("qrc:/game-editor/Editor.qml"));
  if (engine.rootObjects().empty()) {
    return 1;
  }
#if QT_CONFIG(vulkan)
  if (useVulkan) {
    for (auto *object : engine.rootObjects()) {
      if (auto *window = qobject_cast<QQuickWindow *>(object)) {
        window->setVulkanInstance(&vulkan);
      }
    }
  }
#endif
  if (parser.isSet("quit-after")) {
    bool valid = false;
    const auto ms = parser.value("quit-after").toInt(&valid);
    if (!valid || ms < 1 || ms > 60000) {
      return 1;
    }
    QTimer::singleShot(ms, &app, [&app, &engine] {
      for (auto *object : engine.rootObjects()) {
        object->setProperty("closingConfirmed", true);
      }
      app.quit();
    });
  }
  return app.exec();
}
