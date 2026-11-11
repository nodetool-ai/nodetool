#include "server/BundledServer.h"
#include "ui/EditorWindow.h"
#include <QApplication>
#include <QCommandLineParser>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QQuickWindow>
#include <QTimer>
#include <chrono>
#include <cstdio>
#include <cstdlib>
namespace {
// How long native host jobs of local runs get to finish after the editor
// closed, as in the graph runner CLI.
constexpr auto kLaneShutdownGrace = std::chrono::seconds(2);
// Shows the editor until it quits. Returns the exit status. The window, its
// tabs and their sessions are destroyed on return, and with the last session
// the in-process runner, whose destructor cancels its run and joins its
// worker thread.
int runEditor(QApplication &app, const QCommandLineParser &parser);
}
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
  parser.addOption(QCommandLineOption("offline", "Start without connecting to a server"));
  parser.addOption(QCommandLineOption("guest-bundle", "Guest bundle (guest.js or guest.bin) for in-process runs", "path"));
  parser.process(app);
  if (parser.isSet("guest-bundle")) {
    nodetool::node_editor::WorkflowSession::setGuestBundlePath(parser.value("guest-bundle"));
  }
  const int status = runEditor(app, parser);
  // A native host job of a local run that ignores its stop request keeps
  // running after the runner is gone. Static destructors could run under it,
  // so the editor then ends without them.
  const auto live = nodetool::node_editor::WorkflowSession::finishLocalRunJobs(
      std::chrono::steady_clock::now() + kLaneShutdownGrace);
  if (live > 0) {
    std::fprintf(stderr, "nodetool-node-editor: %zu host lane threads still running a job, exiting without static teardown\n", live);
    std::fflush(stdout);
    std::fflush(stderr);
    std::quick_exit(status);
  }
  return status;
}
namespace {
int runEditor(QApplication &app, const QCommandLineParser &parser) {
  nodetool::EditorWindow window;
  if (!parser.isSet("open") && !parser.isSet("workflow")) window.restoreTabs();
  if (parser.isSet("open") && !window.openFile(parser.value("open"))) {
    return 2;
  }
  // An interactive start connects to the local server, as the web app does.
  // Headless export and replay runs stay offline unless --server is given.
  const bool headless = parser.isSet("screenshot") || parser.isSet("dump") || parser.isSet("save") || parser.isSet("replay");
  // A package with a bundled backend starts that server instead.
  const nodetool::node_editor::ServerStartOptions start{
      parser.isSet("server") ? QUrl(parser.value("server")) : QUrl(), parser.isSet("offline"), headless,
      !window.session()->serverUrl().isEmpty()};
  const auto server = nodetool::node_editor::chooseServer(start, [] {
    QString error;
    QUrl url = nodetool::node_editor::startBundledServer(&error);
    if (!error.isEmpty()) std::fprintf(stderr, "nodetool-node-editor: %s\n", qPrintable(error));
    return url;
  });
  if (!server.isEmpty()) {
    window.session()->connectToServer(server, qEnvironmentVariable("NODETOOL_TOKEN"));
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
}
