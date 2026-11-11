// Instant Update without a server: an edit reruns the node and its downstream
// nodes in process, so the output follows the edit, including the last edit of
// a burst that arrives while a run is active.
#include "../../src/server/WorkflowSession.h"
#include "../../src/ui/EditorWindow.h"
#include <QApplication>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QTemporaryDir>
#include <QtTest>
using namespace nodetool;
using node_editor::WorkflowSession;

class InstantUpdateLocalTest : public QObject {
  Q_OBJECT
  QTemporaryDir m_data;
private slots:
  void initTestCase() {
    QVERIFY2(QFileInfo::exists(GUEST_BUNDLE), "Build the guest bundle with node native/graph-runner/guest/build.mjs");
    QVERIFY(m_data.isValid());
    qputenv("NODETOOL_WORKSPACES_DIR", QFile::encodeName(m_data.filePath("workspaces")));
    qputenv("ASSET_FOLDER", QFile::encodeName(m_data.filePath("assets")));
    qputenv("NODETOOL_LOCAL_RUNNER", "1");
    WorkflowSession::setGuestBundlePath(GUEST_BUNDLE);
  }
  void editRerunsDownstreamWithoutServer() {
    EditorWindow window;
    window.resize(1280, 900);
    window.show();
    const QJsonArray nodes{
        QJsonObject{{"id", "a"}, {"type", "nodetool.constant.Integer"}, {"data", QJsonObject{{"value", 1}}}},
        QJsonObject{{"id", "out"}, {"type", "nodetool.output.Output"}, {"data", QJsonObject{{"name", "result"}}}}};
    const QJsonArray edges{QJsonObject{{"id", "e"}, {"source", "a"}, {"sourceHandle", "output"}, {"target", "out"}, {"targetHandle", "value"}}};
    QVERIFY(window.document()->load({{"id", "wf-instant"}, {"name", "Instant"}, {"graph", QJsonObject{{"nodes", nodes}, {"edges", edges}}}}).ok);
    window.setCatalog(QJsonDocument::fromJson(R"([{"node_type":"nodetool.constant.Integer","properties":[{"name":"value","type":{"type":"int"}}]}])").array());
    auto *session = window.session();
    QVERIFY(!session->connected());
    QTRY_VERIFY_WITH_TIMEOUT(session->localRunnerReady(), 120000);
    QJsonValue latest;
    connect(session, &WorkflowSession::runEvent, this, [&](const QString &, const QJsonObject &event) {
      if (event["type"] == "output_update" && event["node_id"] == "out") { latest = event["value"]; }
    });
    window.action("Instant Update: Off");
    QVERIFY(window.selectNode("a"));
    QVERIFY(window.commitProperty("a", "value", 5));
    QTRY_COMPARE_WITH_TIMEOUT(latest.toInt(), 5, 30000);
    QVERIFY(window.commitProperty("a", "value", 8));
    QTRY_COMPARE_WITH_TIMEOUT(latest.toInt(), 8, 30000);
    // A drag commits faster than a run finishes. The edits that land during a
    // run coalesce into one rerun of the latest value.
    for (int value : {11, 12, 13, 14}) { QVERIFY(window.commitProperty("a", "value", value)); }
    QTRY_COMPARE_WITH_TIMEOUT(latest.toInt(), 14, 30000);
  }
};

QTEST_MAIN(InstantUpdateLocalTest)
#include "InstantUpdateLocalTest.moc"
