// Instant Update without a server: an edit reruns the node and its downstream
// nodes in process, so the output follows the edit, including the last edit of
// a burst that arrives while a run is active.
#include "../../src/graph/CardBodies.h"
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include "../../src/graph/EditorScene.h"
#include "../../src/graph/WorkflowGraphModel.h"
#include "../../src/media/LocalMediaStore.h"
#include "../../src/media/PcmStream.h"
#include "../../src/run/RunOutputModel.h"
#include "../../src/server/WorkflowSession.h"
#include "../../src/ui/EditorWindow.h"
#include <QApplication>
#include <cstring>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QGraphicsView>
#include <QMouseEvent>
#include <QUndoStack>
#include <QTemporaryDir>
#include <QtTest>
using namespace nodetool;
using node_editor::WorkflowSession;

namespace {
// Takes the samples and plays none, so a live run makes no sound.
class SilentSink final : public node_editor::PcmSink {
public:
  QAudioFormat preferredFormat() const override {
    QAudioFormat format;
    format.setSampleRate(44100);
    format.setChannelCount(1);
    format.setSampleFormat(QAudioFormat::Float);
    return format;
  }
  bool supports(const QAudioFormat &) const override { return true; }
  bool start(const QAudioFormat &) override { return true; }
  qsizetype capacityBytes() const override { return 1 << 16; }
  qint64 write(QByteArrayView bytes) override { return bytes.size(); }
  bool drained() const override { return true; }
  bool failed() const override { return false; }
  void stop() override {}
};
}  // namespace

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
  // [gradient] -> [blur a] -> [blur b] -> [output]. An edit of blur b reruns
  // only blur b and feeds it the image blur a made in the previous run.
  void editReusesUpstreamImage() {
    EditorWindow window;
    window.resize(1280, 900);
    window.show();
    const auto blur = [](const char *id, double radius) {
      return QJsonObject{{"id", id}, {"type", "lib.image.filter.GaussianBlur"}, {"data", QJsonObject{{"radius", radius}}}};
    };
    const auto edge = [](const char *id, const char *source, const char *target, const char *handle) {
      return QJsonObject{{"id", id}, {"source", source}, {"sourceHandle", "output"}, {"target", target}, {"targetHandle", handle}};
    };
    const QJsonArray nodes{
        QJsonObject{{"id", "gradient"}, {"type", "lib.image.draw.LinearGradient"}, {"data", QJsonObject{{"width", 64}, {"height", 64}}}},
        blur("a", 2), blur("b", 1),
        QJsonObject{{"id", "out"}, {"type", "nodetool.output.Output"}, {"data", QJsonObject{{"name", "result"}}}}};
    const QJsonArray edges{edge("e1", "gradient", "a", "image"), edge("e2", "a", "b", "image"), edge("e3", "b", "out", "value")};
    QVERIFY(window.document()->load({{"id", "wf-instant-image"}, {"name", "Instant image"}, {"graph", QJsonObject{{"nodes", nodes}, {"edges", edges}}}}).ok);
    window.setCatalog(QJsonDocument::fromJson(R"([
      {"node_type":"lib.image.draw.LinearGradient","properties":[{"name":"width","type":{"type":"int"}},{"name":"height","type":{"type":"int"}}],"outputs":[{"name":"output","type":{"type":"image"}}]},
      {"node_type":"lib.image.filter.GaussianBlur","properties":[{"name":"image","type":{"type":"image"}},{"name":"radius","type":{"type":"float"}}],"outputs":[{"name":"output","type":{"type":"image"}}]}
    ])").array());
    auto *session = window.session();
    QTRY_VERIFY_WITH_TIMEOUT(session->localRunnerReady(), 120000);
    QHash<QString, QStringList> ran;
    QHash<QString, QString> finished;
    QHash<QString, QJsonValue> output;
    connect(session, &WorkflowSession::runEvent, this, [&](const QString &job, const QJsonObject &event) {
      if (event["type"] == "node_update" && event["status"] == "completed") { ran[job].append(event["node_id"].toString()); }
      if (event["type"] == "output_update" && event["node_id"] == "out") { output[job] = event["value"]; }
      if (event["type"] == "job_update") {
        const auto status = event["status"].toString();
        if (status == "completed" || status == "failed" || status == "cancelled") { finished[job] = status + ' ' + event["error"].toString(); }
      }
    });
    window.action("Run");
    QTRY_COMPARE_WITH_TIMEOUT(finished.size(), 1, 60000);
    const auto first = finished.keys().first();
    QCOMPARE(finished[first].trimmed(), QStringLiteral("completed"));
    auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    const auto cardImage = [&model](const QString &id) {
      for (const auto node : model.allNodeIds()) {
        if (model.resourceId(node) == id) { return model.runtimePreview(node); }
      }
      return QImage();
    };
    QTRY_VERIFY(!cardImage("a").isNull() && !cardImage("b").isNull());
    window.action("Instant Update: Off");
    QVERIFY(window.selectNode("b"));
    QVERIFY(window.commitProperty("b", "radius", 3.0));
    // The preview run reuses blur a. Its card keeps the image of the last run
    // and does not fall back to the held result as JSON text.
    QVERIFY(!cardImage("a").isNull());
    QTRY_COMPARE_WITH_TIMEOUT(finished.size(), 2, 60000);
    QVERIFY(!cardImage("a").isNull());
    QVERIFY(!cardImage("b").isNull());
    QString second;
    for (const auto &job : finished.keys()) { if (job != first) { second = job; } }
    QCOMPARE(finished[second].trimmed(), QStringLiteral("completed"));
    QVERIFY2(session->lastPartialPlan().reused.contains("a"), qPrintable(session->lastPartialPlan().executed.join(',')));
    QVERIFY2(!ran[second].contains("a") && !ran[second].contains("gradient"), qPrintable(ran[second].join(',')));
    QVERIFY(ran[second].contains("b"));
    const auto image = [&](const QString &job) {
      return node_editor::LocalMediaStore::instance().image(output.value(job).toObject()["uri"].toString());
    };
    QCOMPARE(image(second).width, 64u);
    // The session keeps 20 finished runs and releases the images of older
    // ones, including the image blur a made in the first run. A later edit
    // then reruns blur a instead of reading a released image.
    int upstreamReruns = 0;
    for (int step = 0; step < 22; ++step) {
      const auto seen = QSet<QString>(finished.keyBegin(), finished.keyEnd());
      QVERIFY(window.commitProperty("b", "radius", 4.0 + step));
      QTRY_COMPARE_WITH_TIMEOUT(finished.size(), seen.size() + 1, 60000);
      QString job;
      for (const auto &key : finished.keys()) { if (!seen.contains(key)) { job = key; } }
      QCOMPARE(finished[job].trimmed(), QStringLiteral("completed"));
      QVERIFY2(image(job).width == 64u, qPrintable(QStringLiteral("step %1 ran %2").arg(step).arg(ran[job].join(','))));
      if (ran[job].contains("a")) { ++upstreamReruns; }
    }
    QCOMPARE(upstreamReruns, 1);
  }
  // Without Instant Update, a drag on a card body slider previews each draft
  // value in process, as the web's live slider bodies do. The drag stays out
  // of the document until release, which commits one undo step and reruns.
  // An inspector edit still waits for Instant Update. A node the runner does
  // not support stays out of the preview, and the nodes before it still run.
  void cardSliderPreviewsWhileDragging() {
    EditorWindow window;
    window.resize(1440, 900);
    window.show();
    QVERIFY(QTest::qWaitForWindowExposed(&window));
    const auto at = [](double x) { return QJsonObject{{"position", QJsonObject{{"x", x}, {"y", 0}}}}; };
    const auto blurNode = [&at](const char *id, double radius, double x) {
      return QJsonObject{{"id", id}, {"type", "lib.image.filter.GaussianBlur"}, {"data", QJsonObject{{"radius", radius}}}, {"ui_properties", at(x)}};
    };
    const auto edge = [](const char *id, const char *source, const char *target, const char *handle) {
      return QJsonObject{{"id", id}, {"source", source}, {"sourceHandle", "output"}, {"target", target}, {"targetHandle", handle}};
    };
    const QJsonArray nodes{
        QJsonObject{{"id", "gradient"}, {"type", "lib.image.draw.LinearGradient"}, {"data", QJsonObject{{"width", 64}, {"height", 64}}}, {"ui_properties", at(0)}},
        blurNode("a", 2, 400), blurNode("b", 1, 800),
        QJsonObject{{"id", "out"}, {"type", "nodetool.output.Output"}, {"data", QJsonObject{{"name", "result"}}}, {"ui_properties", at(1200)}},
        QJsonObject{{"id", "server"}, {"type", "test.server.Only"}, {"ui_properties", at(1600)}}};
    const QJsonArray edges{edge("e1", "gradient", "a", "image"), edge("e2", "a", "b", "image"), edge("e3", "b", "out", "value"),
                           edge("e4", "b", "server", "image")};
    const auto catalog = QJsonDocument::fromJson(R"([
      {"node_type":"lib.image.draw.LinearGradient","title":"Linear Gradient","namespace":"lib.image.draw","properties":[{"name":"width","type":{"type":"int"}},{"name":"height","type":{"type":"int"}}],"outputs":[{"name":"output","type":{"type":"image","type_args":[]}}]},
      {"node_type":"lib.image.filter.GaussianBlur","title":"Gaussian Blur","namespace":"lib.image.filter","properties":[{"name":"image","type":{"type":"image"},"default":{"type":"image","uri":""}},{"name":"radius","type":{"type":"float"},"min":0,"max":64,"default":4}],"outputs":[{"name":"output","type":{"type":"image","type_args":[]}}]}
    ])").array();
    window.setCatalog(catalog);
    QVERIFY(window.document()->load({{"id", "wf-card-slider"}, {"name", "Card slider"}, {"graph", QJsonObject{{"nodes", nodes}, {"edges", edges}}}}).ok);
    QTest::qWait(50);
    window.fit();
    QTest::qWait(50);
    auto *session = window.session();
    QTRY_VERIFY_WITH_TIMEOUT(session->localRunnerReady(), 120000);
    QHash<QString, QStringList> ran;
    QStringList finished;
    connect(session, &WorkflowSession::runEvent, this, [&](const QString &job, const QJsonObject &event) {
      if (event["type"] == "node_update" && event["status"] == "completed") { ran[job].append(event["node_id"].toString()); }
      if (event["type"] == "job_update" && event["status"] == "completed" && !finished.contains(job)) { finished.append(job); }
    });
    QVERIFY(!session->runsLocally(window.document()->node("server")));
    QVERIFY(!session->runSelected(window.document()->snapshot(), {"gradient", "a", "b", "out"}, catalog).isEmpty());
    QTRY_COMPARE_WITH_TIMEOUT(finished.size(), 1, 60000);
    // An inspector edit without Instant Update does not run.
    QVERIFY(window.selectNode("a"));
    QVERIFY(window.commitProperty("a", "radius", 2.5));
    QTest::qWait(500);
    QCOMPARE(finished.size(), 1);

    auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    QtNodes::NodeId b = QtNodes::InvalidNodeId;
    for (const auto id : model.allNodeIds()) { if (model.resourceId(id) == "b") { b = id; } }
    const NodeRow *radius = nullptr;
    for (const auto &row : model.layout(b).rows) { if (row.kind == NodeRowKind::Slider && row.propertyName == "radius") { radius = &row; } }
    QVERIFY(radius);
    auto *view = window.findChild<QGraphicsView *>();
    const auto track = sliderTrack(*radius);
    auto *item = window.scene()->nodeGraphicsObject(b);
    const auto point = [&](double fraction) { return view->mapFromScene(item->mapToScene(QPointF(track.left() + track.width() * fraction, track.center().y()))); };
    const auto undo = window.document()->undoStack()->count();
    // Preview runs settle faster than the shown queue delay, so the Run button
    // and the queue overlay never change during the scrub.
    auto *tab = window.activeEditor();
    QTRY_VERIFY(!tab->shownRunActive());
    int shownChanges = 0;
    connect(tab, &EditorWindow::shownQueueChanged, this, [&] { if (tab->shownRunActive()) { ++shownChanges; } });
    QTest::mousePress(view->viewport(), Qt::LeftButton, Qt::NoModifier, point(0.25));
    QTRY_COMPARE_WITH_TIMEOUT(finished.size(), 2, 60000);
    QMouseEvent move(QEvent::MouseMove, QPointF(point(0.5)), QPointF(view->viewport()->mapToGlobal(point(0.5))), Qt::NoButton, Qt::LeftButton, Qt::NoModifier);
    QApplication::sendEvent(view->viewport(), &move);
    QTRY_COMPARE_WITH_TIMEOUT(finished.size(), 3, 60000);
    const auto draft = window.scene()->sliderDraftValue();
    QVERIFY(draft > 20 && draft < 40);
    double submitted = -1;
    for (const auto &value : session->lastPartialPlan().snapshot["graph"].toObject()["nodes"].toArray()) {
      if (value.toObject()["id"] == "b") { submitted = value.toObject()["data"].toObject()["radius"].toDouble(); }
    }
    QCOMPARE(submitted, draft);
    QCOMPARE(window.document()->node("b")["data"].toObject()["radius"].toDouble(), 1.0);
    QCOMPARE(window.document()->undoStack()->count(), undo);
    for (const auto &job : finished.mid(1)) {
      QVERIFY2(!ran[job].contains("a") && ran[job].contains("b") && ran[job].contains("out"), qPrintable(ran[job].join(',')));
    }
    QTest::mouseRelease(view->viewport(), Qt::LeftButton, Qt::NoModifier, point(0.5));
    QTRY_COMPARE(window.document()->node("b")["data"].toObject()["radius"].toDouble(), draft);
    QCOMPARE(window.document()->undoStack()->count(), undo + 1);
    QTRY_COMPARE_WITH_TIMEOUT(finished.size(), 4, 60000);
    QTest::qWait(EditorWindow::shownQueueDelayMs * 2);
    QCOMPARE(shownChanges, 0);
    QVERIFY(!tab->shownRunActive());
  }
  // A blur card keeps an image in its body through a slider drag. It never
  // draws its result as JSON text, also not while a preview run is in flight
  // or while the next image decodes. Its running ring, the shown run queue and
  // the inspector message do not flicker.
  void cardSliderNeverShowsResultJson() {
    EditorWindow window;
    window.resize(1440, 900);
    window.show();
    QVERIFY(QTest::qWaitForWindowExposed(&window));
    const auto at = [](double x) { return QJsonObject{{"position", QJsonObject{{"x", x}, {"y", 0}}}}; };
    const QJsonArray nodes{
        QJsonObject{{"id", "gradient"}, {"type", "lib.image.draw.LinearGradient"}, {"data", QJsonObject{{"width", 64}, {"height", 64}}}, {"ui_properties", at(0)}},
        QJsonObject{{"id", "b"}, {"type", "lib.image.filter.GaussianBlur"}, {"data", QJsonObject{{"radius", 1}}}, {"ui_properties", at(400)}}};
    const QJsonArray edges{QJsonObject{{"id", "e1"}, {"source", "gradient"}, {"sourceHandle", "output"}, {"target", "b"}, {"targetHandle", "image"}}};
    const auto catalog = QJsonDocument::fromJson(R"([
      {"node_type":"lib.image.draw.LinearGradient","title":"Linear Gradient","namespace":"lib.image.draw","properties":[{"name":"width","type":{"type":"int"}},{"name":"height","type":{"type":"int"}}],"outputs":[{"name":"output","type":{"type":"image","type_args":[]}}]},
      {"node_type":"lib.image.filter.GaussianBlur","title":"Gaussian Blur","namespace":"lib.image.filter","properties":[{"name":"image","type":{"type":"image"},"default":{"type":"image","uri":""}},{"name":"radius","type":{"type":"float"},"min":0,"max":64,"default":4}],"outputs":[{"name":"output","type":{"type":"image","type_args":[]}}]}
    ])").array();
    window.setCatalog(catalog);
    QVERIFY(window.document()->load({{"id", "wf-card-json"}, {"name", "Card json"}, {"graph", QJsonObject{{"nodes", nodes}, {"edges", edges}}}}).ok);
    QTest::qWait(50);
    window.fit();
    QTest::qWait(50);
    auto *session = window.session();
    QTRY_VERIFY_WITH_TIMEOUT(session->localRunnerReady(), 120000);
    QStringList finished;
    connect(session, &WorkflowSession::runEvent, this, [&](const QString &job, const QJsonObject &event) {
      if (event["type"] == "job_update" && event["status"] == "completed" && !finished.contains(job)) { finished.append(job); }
    });
    auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    QtNodes::NodeId b = QtNodes::InvalidNodeId;
    for (const auto id : model.allNodeIds()) { if (model.resourceId(id) == "b") { b = id; } }
    // EditorScene's card paint: without a preview image, the result area
    // draws the error, the text or the result object.
    QStringList drawn;
    const auto probe = [&] {
      const auto runtime = model.runtimeState(b);
      if (runtime.isEmpty() || !model.hasRuntimeOutput(b) || model.canvasResultRect(b).isEmpty()) { return; }
      if (!model.runtimePreview(b).isNull()) { return; }
      auto text = runtime["error"].toString();
      if (text.isEmpty()) { text = runtime["text"].toString(); }
      if (text.isEmpty() && runtime["result"].isObject()) { text = QJsonDocument(runtime["result"].toObject()).toJson(QJsonDocument::Compact); }
      if (!text.isEmpty() && drawn.size() < 5) { drawn.append(runtime["status"].toString() + ": " + text.left(120)); }
    };
    // The ring, the Run button and the inspector change only once a state
    // holds. A slow machine can hold one run long enough to show it once.
    bool ring = false;
    int ringChanges = 0;
    QTimer poll;
    connect(&poll, &QTimer::timeout, this, probe);
    connect(&poll, &QTimer::timeout, this, [&] {
      if (model.runningShown(b) != ring) { ring = !ring; ++ringChanges; }
    });
    QVERIFY(!session->runSelected(window.document()->snapshot(), {"gradient", "b"}, catalog).isEmpty());
    QTRY_COMPARE_WITH_TIMEOUT(finished.size(), 1, 60000);
    QTRY_VERIFY(!model.runtimePreview(b).isNull());
    poll.start(1);

    const NodeRow *radius = nullptr;
    for (const auto &row : model.layout(b).rows) { if (row.kind == NodeRowKind::Slider && row.propertyName == "radius") { radius = &row; } }
    QVERIFY(radius);
    auto *view = window.findChild<QGraphicsView *>();
    const auto track = sliderTrack(*radius);
    auto *item = window.scene()->nodeGraphicsObject(b);
    const auto point = [&](double fraction) { return view->mapFromScene(item->mapToScene(QPointF(track.left() + track.width() * fraction, track.center().y()))); };
    auto *tab = window.activeEditor();
    int queueChanges = 0;
    connect(tab, &EditorWindow::shownQueueChanged, this, [&] { ++queueChanges; });
    // Preview runs are silent: the inspector message keeps the last full run's.
    const auto message = tab->message();
    QStringList messages;
    connect(&poll, &QTimer::timeout, this, [&] {
      if (tab->message() != message && !messages.contains(tab->message())) { messages.append(tab->message()); }
    });
    QTest::mousePress(view->viewport(), Qt::LeftButton, Qt::NoModifier, point(0.1));
    for (int step = 2; step <= 9; ++step) {
      const auto to = point(step / 10.0);
      QMouseEvent move(QEvent::MouseMove, QPointF(to), QPointF(view->viewport()->mapToGlobal(to)), Qt::NoButton, Qt::LeftButton, Qt::NoModifier);
      QApplication::sendEvent(view->viewport(), &move);
      QTest::qWait(step % 2 ? 5 : 60);
    }
    QVERIFY2(ringChanges <= 2, qPrintable(QString::number(ringChanges)));
    QVERIFY2(queueChanges <= 2, qPrintable(QString::number(queueChanges)));
    QTest::mouseRelease(view->viewport(), Qt::LeftButton, Qt::NoModifier, point(0.9));
    const auto seen = finished.size();
    QTRY_VERIFY_WITH_TIMEOUT(finished.size() > seen && !window.activeEditor()->runActive(), 60000);
    QTest::qWait(300);
    poll.stop();
    QVERIFY2(drawn.isEmpty(), qPrintable(drawn.join('\n')));
    QVERIFY2(messages.isEmpty(), qPrintable(messages.join('\n')));
    QVERIFY(!model.runtimePreview(b).isNull());
  }
  // [trigger] -> gate -> [audio out], pitch -> [audio out]. A property edit
  // during the live run goes to that run: the gate fires and the pitch
  // follows, with no new run. The stopped run starts no rerun.
  void editReachesTheLiveRun() {
    EditorWindow window;
    window.resize(1280, 900);
    window.show();
    window.runOutput()->setPcmSinkFactory([] { return std::make_unique<SilentSink>(); });
    const QJsonArray nodes{
        QJsonObject{{"id", "trig"}, {"type", "nodetool.audio.synth.Trigger"}, {"data", QJsonObject{{"trigger", false}, {"note", 0.0}, {"length", 0.02}}}},
        QJsonObject{{"id", "gate"}, {"type", "nodetool.audio.realtime.AudioOutput"}, {"data", QJsonObject{}}},
        QJsonObject{{"id", "pitch"}, {"type", "nodetool.audio.realtime.AudioOutput"}, {"data", QJsonObject{}}}};
    const QJsonArray edges{
        QJsonObject{{"id", "e1"}, {"source", "trig"}, {"sourceHandle", "gate"}, {"target", "gate"}, {"targetHandle", "chunk"}},
        QJsonObject{{"id", "e2"}, {"source", "trig"}, {"sourceHandle", "pitch"}, {"target", "pitch"}, {"targetHandle", "chunk"}}};
    QVERIFY(window.document()->load({{"id", "wf-live-edit"}, {"name", "Live edit"}, {"graph", QJsonObject{{"nodes", nodes}, {"edges", edges}}}}).ok);
    window.setCatalog(QJsonDocument::fromJson(R"([
      {"node_type":"nodetool.audio.synth.Trigger","inline_fields":["trigger","note"],
       "properties":[{"name":"trigger","type":{"type":"bool"},"default":false},{"name":"note","type":{"type":"float"},"default":0,"min":-48,"max":48},{"name":"length","type":{"type":"float"},"default":0.1}],
       "outputs":[{"name":"gate","type":{"type":"cv"}},{"name":"pitch","type":{"type":"cv"}}]},
      {"node_type":"nodetool.audio.realtime.AudioOutput","audio_sink":"live",
       "properties":[{"name":"chunk","type":{"type":"chunk"}}],"outputs":[{"name":"chunk","type":{"type":"chunk"}}]}
    ])").array());
    auto *session = window.session();
    QVERIFY(!session->connected());
    QTRY_VERIFY_WITH_TIMEOUT(session->localRunnerReady(), 120000);
    QStringList submitted;
    connect(session, &WorkflowSession::runSubmitted, this, [&](const QString &id) { submitted.append(id); });
    // Blocks of the gate stream with a sample that is not zero, and the first
    // sample of the latest pitch block.
    int blocks = 0;
    int pulses = 0;
    float pitch = 0;
    QString status;
    connect(session, &WorkflowSession::runEvent, this, [&](const QString &, const QJsonObject &event) {
      if (event["type"] == "job_update") { status = event["status"].toString(); }
      if (event["type"] != "output_update") { return; }
      const auto value = event["value"].toObject();
      if (value["done"].toBool()) { return; }
      const auto content = value["content"];
      const auto text = content.isObject() ? content.toObject()["__bytes__"].toString() : content.toString();
      const auto bytes = QByteArray::fromBase64(text.toLatin1());
      if (event["node_id"] == "gate") {
        ++blocks;
        if (bytes.count('\0') != bytes.size()) { ++pulses; }
      } else if (event["node_id"] == "pitch" && bytes.size() >= 4) {
        std::memcpy(&pitch, bytes.constData(), 4);
      }
    });
    window.action("Run");
    QTRY_COMPARE_WITH_TIMEOUT(submitted.size(), 1, 30000);
    QTRY_VERIFY_WITH_TIMEOUT(blocks >= 3, 30000);
    QCOMPARE(pulses, 0);
    // An inspector edit.
    QVERIFY(window.selectNode("trig"));
    QVERIFY(window.commitProperty("trig", "trigger", true));
    QTRY_COMPARE_WITH_TIMEOUT(pulses, 1, 30000);
    // Undo and redo change the saved value, so each fires the gate.
    window.document()->undo();
    QTRY_COMPARE_WITH_TIMEOUT(pulses, 2, 30000);
    window.document()->redo();
    QTRY_COMPARE_WITH_TIMEOUT(pulses, 3, 30000);
    // A card body edit.
    auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    QtNodes::NodeId card = QtNodes::InvalidNodeId;
    for (const auto node : model.allNodeIds()) {
      if (model.resourceId(node) == "trig") { card = node; }
    }
    QVERIFY(card != QtNodes::InvalidNodeId);
    QVERIFY(model.commit(model.propertyCommand(card, "trigger", false)));
    QTRY_COMPARE_WITH_TIMEOUT(pulses, 4, 30000);
    QVERIFY(model.commit(model.propertyCommand(card, "note", 12.0)));
    QTRY_COMPARE_WITH_TIMEOUT(pitch, 1.0f, 30000);
    // A slider draft sounds before it is saved.
    emit window.scene()->sliderDraftChanged(card, "note", -12.0);
    QTRY_COMPARE_WITH_TIMEOUT(pitch, -1.0f, 30000);
    QCOMPARE(window.document()->node("trig")["data"].toObject()["note"].toDouble(), 12.0);
    // Every edit went to the one run.
    QCOMPARE(submitted.size(), 1);
    QCOMPARE(pulses, 4);
    window.action("Stop");
    QTRY_COMPARE_WITH_TIMEOUT(status, QString("cancelled"), 30000);
    QTRY_VERIFY_WITH_TIMEOUT(!window.activeEditor()->runActive(), 30000);
    // No rerun follows the stopped run, which would play again.
    QTest::qWait(600);
    QCOMPARE(submitted.size(), 1);
  }
};

QTEST_MAIN(InstantUpdateLocalTest)
#include "InstantUpdateLocalTest.moc"
