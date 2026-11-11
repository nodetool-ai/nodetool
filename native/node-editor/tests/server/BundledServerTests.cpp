#include "../../src/server/BundledServer.h"
#include <QTemporaryDir>
#include <QtTest>
using namespace nodetool::node_editor;
namespace {
// A start that records whether the bundled server was asked for.
struct Bundled {
  QUrl url;
  int *calls;
  QUrl operator()() const {
    ++*calls;
    return url;
  }
};
}  // namespace
class BundledServerTests : public QObject {
  Q_OBJECT
private slots:
  void givenServerWins() {
    int calls = 0;
    ServerStartOptions options{QUrl("http://example.invalid:9"), true, true, true};
    QCOMPARE(chooseServer(options, Bundled{QUrl("http://127.0.0.1:1"), &calls}), QUrl("http://example.invalid:9"));
    QCOMPARE(calls, 0);
  }
  void offlineHeadlessAndRestoredStartNoServer() {
    int calls = 0;
    for (const auto &options : {ServerStartOptions{{}, true, false, false}, ServerStartOptions{{}, false, true, false},
                                ServerStartOptions{{}, false, false, true}}) {
      QVERIFY(chooseServer(options, Bundled{QUrl("http://127.0.0.1:1"), &calls}).isEmpty());
    }
    QCOMPARE(calls, 0);
  }
  void interactiveStartPrefersTheBundledServer() {
    int calls = 0;
    QCOMPARE(chooseServer(ServerStartOptions{}, Bundled{QUrl("http://127.0.0.1:41234"), &calls}),
             QUrl("http://127.0.0.1:41234"));
    QCOMPARE(calls, 1);
  }
  void interactiveStartFallsBackToLocalhost() {
    int calls = 0;
    QCOMPARE(chooseServer(ServerStartOptions{}, Bundled{QUrl(), &calls}), QUrl("http://localhost:7777"));
    QCOMPARE(calls, 1);
  }
  // No server.mjs and no runtime/node: no server and no error.
  void missingBackendStartsNothing() {
    QTemporaryDir empty;
    QVERIFY(empty.isValid());
    qputenv("NT_BUNDLED_BACKEND_DIR", empty.path().toUtf8());
    qunsetenv("NODETOOL_SERVER_URL");
    QString error;
    QVERIFY(startBundledServer(&error).isEmpty());
    QVERIFY(error.isEmpty());
    qunsetenv("NT_BUNDLED_BACKEND_DIR");
  }
  void serverUrlVariableDisablesTheBundledServer() {
    qputenv("NODETOOL_SERVER_URL", "http://127.0.0.1:7777");
    QString error;
    QVERIFY(startBundledServer(&error).isEmpty());
    QVERIFY(error.isEmpty());
    qunsetenv("NODETOOL_SERVER_URL");
  }
};
QTEST_GUILESS_MAIN(BundledServerTests)
#include "BundledServerTests.moc"
