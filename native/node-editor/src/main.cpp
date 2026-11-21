#include "server/BundledServer.h"
#include "ui/EditorWindow.h"
#include "ui/QuickCanvas.h"
#include <QApplication>
#include <QCommandLineParser>
#include <QElapsedTimer>
#include <QEventLoop>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QProcess>
#include <QQuickWidget>
#include <QTimer>
#include <chrono>
#include <cstdio>
#include <cstdlib>
namespace {
// How long native host jobs of local runs get to finish after the editor
// closed, as in the graph runner CLI.
constexpr auto kLaneShutdownGrace = std::chrono::seconds(2);
constexpr auto kGraphicsStartupTimeout = std::chrono::seconds(5);
constexpr auto kSoftwareRetry = "NODETOOL_NODE_EDITOR_SOFTWARE_RETRY";
constexpr auto kGraphicsFailure = 7;

const char *graphicsApiName(QSGRendererInterface::GraphicsApi api) {
  switch (api) {
  case QSGRendererInterface::OpenGL: return "OpenGL";
  case QSGRendererInterface::Direct3D11: return "Direct3D11";
  case QSGRendererInterface::Direct3D12: return "Direct3D12";
  case QSGRendererInterface::Vulkan: return "Vulkan";
  case QSGRendererInterface::Metal: return "Metal";
  default: return "unknown RHI backend";
  }
}

// UI thread only. Qt initializes Quick widget scene graphs after polish.
// Once editing can begin, a failed dock or dialog must leave the editor open.
class GraphicsStartup final : public QObject {
public:
  bool eventFilter(QObject *object, QEvent *event) override {
    if (event->type() == QEvent::Polish) {
      if (auto *quick = qobject_cast<QQuickWidget *>(object)) {
        connect(quick, &QQuickWidget::sceneGraphError, this, &GraphicsStartup::sceneGraphError,
                Qt::UniqueConnection);
      }
    }
    return false;
  }

  bool waitForCanvas(nodetool::EditorWindow &window) {
    QElapsedTimer elapsed;
    elapsed.start();
    QEventLoop loop;
    QTimer poll;
    connect(&poll, &QTimer::timeout, &loop, [&] {
      const auto &widget = window.canvas().quickWidget();
      auto *quick = widget.quickWindow();
      const auto *handle = window.windowHandle();
      auto *renderer = quick->rendererInterface();
      if (!error_.isEmpty()) {
        loop.quit();
      } else if (handle && handle->isExposed() && quick->isSceneGraphInitialized() &&
                 renderer->graphicsApi() != QSGRendererInterface::Null &&
                 renderer->getResource(quick, QSGRendererInterface::RhiResource)) {
        qInfo("nodetool-node-editor: using %s rendering.", graphicsApiName(renderer->graphicsApi()));
        loop.quit();
      } else if (elapsed.durationElapsed() >= kGraphicsStartupTimeout) {
        sceneGraphError(QQuickWindow::ContextNotAvailable, tr("The graphics renderer did not initialize."));
        loop.quit();
      }
    });
    poll.start(25);
    if (error_.isEmpty()) {
      loop.exec(QEventLoop::ExcludeUserInputEvents);
    }
    startupComplete_ = error_.isEmpty();
    return error_.isEmpty();
  }

  const QString &error() const { return error_; }

private:
  void sceneGraphError(QQuickWindow::SceneGraphError, const QString &message) {
    if (startupComplete_) {
      qWarning().noquote() << "nodetool-node-editor:" << message;
    } else if (error_.isEmpty()) {
      error_ = message.isEmpty() ? tr("The graphics renderer did not initialize.") : message;
    }
  }

  QString error_;
  bool startupComplete_ = false;
};

bool isExport(const QCommandLineParser &parser) {
  return parser.isSet("screenshot") || parser.isSet("dump") ||
         parser.isSet("save") || parser.isSet("replay");
}

int retryInSoftware(const QStringList &arguments, bool wait, const QString &error) {
  qWarning().noquote() << "nodetool-node-editor: restarting with software rendering." << error;
  QProcess retry;
  auto environment = QProcessEnvironment::systemEnvironment();
  environment.insert("QT_QUICK_BACKEND", "software");
  environment.insert("QT_QPA_PLATFORM", QGuiApplication::platformName());
  environment.insert(kSoftwareRetry, "1");
  retry.setProcessEnvironment(environment);
  retry.setProgram(QCoreApplication::applicationFilePath());
  retry.setArguments(arguments);
  retry.setProcessChannelMode(QProcess::ForwardedChannels);
  if (!wait && retry.startDetached()) {
    return 0;
  }
  if (wait) {
    retry.start();
    if (retry.waitForStarted() && retry.waitForFinished(-1) && retry.exitStatus() == QProcess::NormalExit) {
      return retry.exitCode();
    }
  }
  qCritical().noquote() << "nodetool-node-editor: software retry failed." << retry.errorString();
  return kGraphicsFailure;
}
// Shows the editor until it quits. Returns the exit status. The window, its
// tabs and their sessions are destroyed on return, and with the last session
// the in-process runner, whose destructor cancels its run and joins its
// worker thread.
int runEditor(QApplication &app, const QCommandLineParser &parser, GraphicsStartup *graphics);
}
int main(int argc, char **argv) {
  // Qt's raster paint engine stops caching glyphs above 64 device pixels and
  // falls back to per-call vector outlines (~34x slower). Raise the cap so
  // zoomed cards stay on the cached glyph path across the 0.08..8.0 zoom range.
  if (!qEnvironmentVariableIsSet("QT_MAX_CACHED_GLYPH_SIZE")) {
    qputenv("QT_MAX_CACHED_GLYPH_SIZE", "256");
  }
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
  const bool softwareRetry = qEnvironmentVariableIsSet(kSoftwareRetry);
  const auto platform = QGuiApplication::platformName();
  const bool software = softwareRetry || platform == "offscreen" || platform == "minimal" ||
                        qEnvironmentVariable("QT_QUICK_BACKEND") == "software";
  if (software) {
    QQuickWindow::setGraphicsApi(QSGRendererInterface::Software);
  }
  GraphicsStartup graphics;
  if (!software) {
    app.installEventFilter(&graphics);
  }
  int status = runEditor(app, parser, software ? nullptr : &graphics);
  // A native host job of a local run that ignores its stop request keeps
  // running after the runner is gone. Static destructors could run under it,
  // so the editor then ends without them.
  const auto live = nodetool::node_editor::WorkflowSession::finishLocalRunJobs(
      std::chrono::steady_clock::now() + kLaneShutdownGrace);
  if (status == kGraphicsFailure && !graphics.error().isEmpty()) {
    status = retryInSoftware(app.arguments().mid(1), isExport(parser), graphics.error());
  }
  if (live > 0) {
    std::fprintf(stderr, "nodetool-node-editor: %zu host lane threads still running a job, exiting without static teardown\n", live);
    std::fflush(stdout);
    std::fflush(stderr);
    std::quick_exit(status);
  }
  return status;
}
namespace {
int runEditor(QApplication &app, const QCommandLineParser &parser, GraphicsStartup *graphics) {
  // An interactive start connects to the local server and cloud account, as
  // the web app does. Headless export and replay runs stay offline unless
  // --server is given and never read the OS keychain.
  const bool headless = isExport(parser);
  nodetool::EditorWindow window(nullptr, {.cloudAccount = !headless});
  if (parser.isSet("theme")) { window.setDarkTheme(parser.value("theme") != "light"); }
  if (graphics) {
    // Check the actual top-level widget before starting a server or restoring
    // documents. A retry in a new process then has no session to recover.
    window.show();
    if (!graphics->waitForCanvas(window)) {
      return kGraphicsFailure;
    }
    // Server startup can process events. Keep the window out of reach until
    // the requested document or restored tabs have been loaded.
    window.hide();
  }
  const bool restore = !parser.isSet("open") && !parser.isSet("workflow");
  // A package with a bundled backend starts that server instead. It starts
  // before the tabs are restored, so a tab saved on the bundled server
  // reconnects to this launch's port (review F3). It starts whenever a
  // restored tab needs it, also beside tabs of a server the user chose
  // (review F24).
  const auto saved = restore ? nodetool::EditorWindow::savedTabServers() : nodetool::EditorWindow::SavedTabServers{};
  const nodetool::node_editor::ServerStartOptions start{
      parser.isSet("server") ? QUrl(parser.value("server")) : QUrl(), parser.isSet("offline"), headless,
      saved.own && !saved.bundled};
  QUrl bundled;
  const auto server = nodetool::node_editor::chooseServer(start, [&bundled] {
    QString error;
    bundled = nodetool::node_editor::startBundledServer(&error);
    if (!error.isEmpty()) std::fprintf(stderr, "nodetool-node-editor: %s\n", qPrintable(error));
    return bundled;
  });
  window.setBundledServer(bundled);
  if (restore) window.restoreTabs();
  if (parser.isSet("open") && !window.openFile(parser.value("open"))) {
    return 2;
  }
  if (!server.isEmpty()) {
    // A restored tab may already be connected to it, with a cloud document
    // open, or to a server the user chose, which it keeps (review F24).
    const bool keep = !window.session()->serverUrl().isEmpty() && start.given.isEmpty();
    if (!keep && window.session()->serverUrl() != server) {
      window.session()->connectToServer(server, qEnvironmentVariable("NODETOOL_TOKEN"));
    }
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
  if (qEnvironmentVariableIsSet(kSoftwareRetry)) {
    window.notify("warning", QCoreApplication::translate("EditorWindow",
        "The graphics renderer could not start. The editor is using software rendering."));
  }
  window.show();
  if (headless) {
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
          !window.canvas().capture(nodetool::canvas_capture::Mode::Scene).save(parser.value("screenshot"))) {
        status = 5;
      }
      app.exit(status);
    });
  }
  return app.exec();
}
}
