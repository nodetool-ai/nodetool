#include "runtime/ChatSession.h"
#include <QAbstractEventDispatcher>
#include <QElapsedTimer>
#include <QFile>
#include <QGuiApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <QKeyEvent>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickItem>
#include <QQuickWindow>
#include <QSysInfo>
#include <QTimer>
#include <QtQml/QQmlExtensionPlugin>
#include <algorithm>
#include <vector>

Q_IMPORT_QML_PLUGIN(NodeTool_ChatPlugin)

namespace {
double percentile(std::vector<double> values) {
  if (values.empty()) {
    return 0;
  }
  std::sort(values.begin(), values.end());
  return values[std::min(values.size() - 1,
                         static_cast<std::size_t>(values.size() * 0.95))];
}
int delegateCount(QQuickItem *item) {
  int count = item->objectName().startsWith(QStringLiteral("message_")) ? 1 : 0;
  for (auto *child : item->childItems()) {
    count += delegateCount(child);
  }
  return count;
}
} // namespace

int main(int argc, char **argv) {
  QGuiApplication app(argc, argv);
  nt::chat::ChatSession session;
  const QString thread = QStringLiteral("11111111111111111111111111111111");
  session.upsertThread({{"id", thread}, {"title", "UI benchmark"}});
  session.selectThread(thread);
  QJsonArray history;
  for (int i = 0; i < 10000; ++i) {
    history.append(QJsonObject{
        {"id", QString::number(i)},
        {"role", "assistant"},
        {"content", i == 9999 ? QString(128 * 1024, QChar('x'))
                              : QStringLiteral("Benchmark message %1").arg(i)},
        {"created_at", "2026-01-01T00:00:00Z"},
        {"status", i == 9999 ? "streaming" : "complete"}});
  }
  session.importHistory(thread, history);
  QQmlApplicationEngine engine;
  engine.rootContext()->setContextProperty(QStringLiteral("chatSession"),
                                           &session);
  engine.load(QUrl::fromLocalFile(QStringLiteral(CHAT_UI_BENCH_QML)));
  if (engine.rootObjects().isEmpty()) {
    return 2;
  }
  auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
  if (!window) {
    return 2;
  }
  QElapsedTimer inputClock;
  QElapsedTimer busyClock;
  std::vector<double> inputToRender;
  std::vector<double> busySlices;
  bool waitingForFrame = false;
  bool measuring = false;
  auto *dispatcher = QAbstractEventDispatcher::instance();
  QObject::connect(dispatcher, &QAbstractEventDispatcher::awake, &app,
                   [&] { busyClock.start(); });
  QObject::connect(dispatcher, &QAbstractEventDispatcher::aboutToBlock, &app,
                   [&] {
                     if (measuring && busyClock.isValid()) {
                       busySlices.push_back(busyClock.nsecsElapsed() / 1e6);
                     }
                   });
  QObject::connect(window, &QQuickWindow::frameSwapped, &app, [&] {
    if (waitingForFrame) {
      inputToRender.push_back(inputClock.nsecsElapsed() / 1e6);
      waitingForFrame = false;
    }
  });
  QTimer ticker;
  int ticks = 0;
  QObject::connect(&ticker, &QTimer::timeout, &app, [&] {
    if (++ticks > 60) {
      ticker.stop();
      const int delegates = delegateCount(window->contentItem());
      const auto finalBytes = session.messages()
                                  ->data(session.messages()->index(9999, 0),
                                         nt::chat::MessageModel::TextRole)
                                  .toString()
                                  .size();
      const QJsonObject result{
          {"loadedMessages", session.messages()->rowCount()},
          {"instantiatedMessageDelegates", delegates},
          {"inputToRenderSamples", static_cast<int>(inputToRender.size())},
          {"inputToRenderP95Ms", percentile(inputToRender)},
          {"guiBusySliceP95Ms", percentile(busySlices)},
          {"longMessageBytes", 128 * 1024},
          {"streamingUpdates", 60},
          {"qtVersion", QString::fromLatin1(qVersion())},
          {"platform", QGuiApplication::platformName()},
          {"operatingSystem", QSysInfo::prettyProductName()},
          {"cpuArchitecture", QSysInfo::currentCpuArchitecture()},
          {"finalStreamingMessageCharacters", static_cast<int>(finalBytes)},
          {"measurement",
           "Offscreen input delivery to frameSwapped. GUI busy slices include "
           "event processing and render synchronization. Physical "
           "input-to-paint and compositor latency are not measured."}};
      QFile output;
      if (!output.open(stdout, QIODevice::WriteOnly)) {
        app.exit(2);
        return;
      }
      output.write(QJsonDocument(result).toJson());
      app.exit(delegates > 0 && delegates < 1000 && inputToRender.size() > 20 &&
                       finalBytes > 128 * 1024
                   ? 0
                   : 1);
      return;
    }
    measuring = true;
    if (!waitingForFrame) {
      auto *editor =
          window->findChild<QQuickItem *>(QStringLiteral("chatInput"));
      if (!editor) {
        app.exit(2);
        return;
      }
      editor->forceActiveFocus();
      inputClock.start();
      waitingForFrame = true;
      QKeyEvent press(QEvent::KeyPress, Qt::Key_X, Qt::NoModifier,
                      QStringLiteral("x"));
      QCoreApplication::sendEvent(editor, &press);
    }
    session.applyEvent({{"type", "chunk"},
                        {"thread_id", thread},
                        {"content", " streaming"},
                        {"done", false}});
    window->update();
  });
  QTimer::singleShot(500, &app, [&] { ticker.start(16); });
  QTimer::singleShot(20000, &app, [&] { app.exit(3); });
  return app.exec();
}
