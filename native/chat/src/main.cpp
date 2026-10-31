#include "runtime/ChatSession.h"
#include "appearance/AppearanceSettings.h"
#include <QCommandLineParser>
#include <QFile>
#include <QGuiApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickWindow>
#include <QTimer>
#include <QtQml/QQmlExtensionPlugin>
Q_IMPORT_QML_PLUGIN(NodeTool_ChatPlugin)

int main(int argc, char *argv[]) {
  QGuiApplication app(argc, argv);
  QCoreApplication::setApplicationName(QStringLiteral("nodetool-chat"));
  QCommandLineParser parser;
  parser.setApplicationDescription(QStringLiteral("Native NodeTool chat"));
  parser.addHelpOption();
  parser.addOption({QStringLiteral("server"),
                    QStringLiteral("NodeTool server URL"),
                    QStringLiteral("url")});
  parser.addOption(
      {QStringLiteral("replay"),
       QStringLiteral("Replay wire events or a fixture object and dump state"),
       QStringLiteral("file")});
  parser.addOption({QStringLiteral("screenshot"),
                    QStringLiteral("Save a screenshot and exit"),
                    QStringLiteral("file")});
  parser.process(app);
  nt::chat::ChatSession session;
  if (parser.isSet(QStringLiteral("replay"))) {
    QFile file(parser.value(QStringLiteral("replay")));
    if (!file.open(QIODevice::ReadOnly) || file.size() > 16 * 1024 * 1024) {
      return 2;
    }
    QJsonParseError error;
    const auto document = QJsonDocument::fromJson(file.readAll(), &error);
    if (error.error != QJsonParseError::NoError ||
        (!document.isArray() && !document.object()["events"].isArray())) {
      return 2;
    }
    if (document.isObject()) {
      for (const auto thread : document.object()["threads"].toArray()) {
        if (!thread.isObject()) {
          return 2;
        }
        session.upsertThread(thread.toObject());
      }
    }
    const auto events = document.isArray()
                            ? document.array()
                            : document.object()["events"].toArray();
    for (const auto event : events) {
      if (!event.isObject()) {
        return 2;
      }
      session.applyEvent(event.toObject());
    }
    QFile output;
    if (!output.open(stdout, QIODevice::WriteOnly)) {
      return 2;
    }
    output.write(QJsonDocument(session.dumpState()).toJson());
    if (!parser.isSet(QStringLiteral("screenshot"))) {
      return 0;
    }
    if (session.threads()->rowCount() > 0) {
      session.selectThread(session.threads()
                               ->data(session.threads()->index(0, 0),
                                      nt::chat::ThreadModel::ThreadIdRole)
                               .toString());
    }
  }
  nt::chat::AppearanceSettings appearance;
  QQmlApplicationEngine engine;
  engine.rootContext()->setContextProperty(QStringLiteral("chatAppearance"),
                                           &appearance);
  engine.rootContext()->setContextProperty(QStringLiteral("chatSession"),
                                           &session);
  QObject::connect(
      &engine, &QQmlApplicationEngine::objectCreationFailed, &app,
      [] { QCoreApplication::exit(1); }, Qt::QueuedConnection);
  engine.loadFromModule("NodeTool.Chat", "Main");
  if (parser.isSet(QStringLiteral("server"))) {
    session.connectToServer(QUrl(parser.value(QStringLiteral("server"))),
                            qEnvironmentVariable("NODETOOL_TOKEN"));
  }
  if (parser.isSet(QStringLiteral("screenshot"))) {
    QTimer::singleShot(500, &app, [&] {
      const auto roots = engine.rootObjects();
      const auto window = roots.isEmpty()
                              ? nullptr
                              : qobject_cast<QQuickWindow *>(roots.first());
      app.exit(window && window->grabWindow().save(
                             parser.value(QStringLiteral("screenshot")))
                   ? 0
                   : 1);
    });
  }
  return app.exec();
}
