#include "ui/EditorWindow.h"
#include <QApplication>
#include <QCommandLineParser>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QQuickWindow>
#include <QTimer>
int main(int argc, char **argv) {
  QQuickWindow::setGraphicsApi(QSGRendererInterface::Software);
  QApplication app(argc, argv);
  QCoreApplication::setApplicationName("nodetool-node-editor");
  QCommandLineParser parser;
  parser.addHelpOption();
  for (auto name : {"open", "save", "replay", "screenshot", "dump", "server",
                    "workflow", "metadata", "select", "theme"}) {
    parser.addOption(QCommandLineOption(
        name, QString("%1 path or value").arg(name), "value"));
  }
  parser.process(app);
  nodetool::EditorWindow window;
  if (parser.isSet("open") && !window.openFile(parser.value("open"))) {
    return 2;
  }
  if (parser.isSet("server")) {
    window.session()->connectToServer(QUrl(parser.value("server")),
                                      qEnvironmentVariable("NODETOOL_TOKEN"));
    window.session()->loadCatalog();
  }
  if (parser.isSet("workflow")) {
    window.session()->openWorkflow(parser.value("workflow"));
  }
  if (parser.isSet("metadata")) {
    QFile f(parser.value("metadata"));
    if (!f.open(QIODevice::ReadOnly)) {
      return 3;
    }
    auto json = QJsonDocument::fromJson(f.readAll());
    if (!json.isArray()) {
      return 3;
    }
    window.setCatalog(json.array());
  }
  if (parser.isSet("replay")) {
    QFile f(parser.value("replay"));
    if (!f.open(QIODevice::ReadOnly)) {
      return 3;
    }
    QJsonParseError error;
    auto json = QJsonDocument::fromJson(f.readAll(), &error);
    if (error.error != QJsonParseError::NoError || !json.isArray()) {
      return 3;
    }
    for (auto c : json.array()) {
      auto command = c.toObject();
      if (command["op"] == "undo") {
        window.document()->undo();
      } else if (command["op"] == "redo") {
        window.document()->redo();
      } else {
        auto result = window.document()->applyCommand(command);
        if (!result) {
          qCritical() << result.error;
          return 4;
        }
      }
    }
  }
  if (parser.isSet("theme")) { window.setDarkTheme(parser.value("theme") != "light"); }
  window.show();
  if (parser.isSet("screenshot") || parser.isSet("dump") ||
      parser.isSet("save") || parser.isSet("replay")) {
    QTimer::singleShot(500, &window, [&] {
      int status = 0;
      window.fit();
      if (parser.isSet("select") && !window.selectNode(parser.value("select"))) {
        status = 6;
      }
      QCoreApplication::processEvents();
      if (parser.isSet("save") && !window.saveFile(parser.value("save"))) {
        status = 5;
      }
      if (parser.isSet("dump")) {
        QFile f(parser.value("dump"));
        if (!f.open(QIODevice::WriteOnly) ||
            f.write(QJsonDocument(window.document()->snapshot()).toJson()) <
                0) {
          status = 5;
        }
      }
      if (parser.isSet("screenshot") &&
          !window.grab().save(parser.value("screenshot"))) {
        status = 5;
      }
      app.exit(status);
    });
  }
  return app.exec();
}
