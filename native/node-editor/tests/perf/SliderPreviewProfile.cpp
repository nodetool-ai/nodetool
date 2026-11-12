// Profiles a card slider drag on Image -> Color Grade -> Gaussian Blur with a
// photo-sized image, in process and offscreen. It drags the Color Grade
// Contrast slider at 60 Hz and prints, for each preview run, the time from the
// slider value to each card image, and the main thread stalls during the drag.
//
//   node_editor_slider_preview_profile [--seconds N] [--image file] [--sample out.txt]
//
// --sample runs macOS `sample` on this process for the drag, for a call tree.
#include "../../src/graph/CardBodies.h"
#include "../../src/graph/EditorScene.h"
#include "../../src/graph/WorkflowGraphModel.h"
#include "../../src/server/WorkflowSession.h"
#include "../../src/ui/EditorWindow.h"
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QApplication>
#include <QCommandLineParser>
#include <QDir>
#include <QElapsedTimer>
#include <QFile>
#include <QGraphicsView>
#include <QImageReader>
#include <QJsonArray>
#include <QJsonDocument>
#include <QMouseEvent>
#include <QProcess>
#include <QTemporaryDir>
#include <QTimer>
#include <QtTest>
#include <algorithm>
#include <cstdio>
using namespace nodetool;
using node_editor::WorkflowSession;

namespace {
struct Run {
  qint64 move = -1;  // the slider move whose value the run carries
  qint64 submitted = -1;
  QHash<QString, qint64> running, completed;
  qint64 finished = -1;
  qint64 gradeImage = -1, blurImage = -1;
};
double percentile(QList<double> values, double p) {
  if (values.isEmpty()) { return 0; }
  std::sort(values.begin(), values.end());
  return values[std::min<qsizetype>(values.size() - 1, qsizetype(p * (values.size() - 1) + 0.5))];
}
void row(const char *label, const QList<double> &values) {
  if (values.isEmpty()) { std::printf("  %-34s  -\n", label); return; }
  std::printf("  %-34s  p50 %7.1f  p95 %7.1f  max %7.1f ms  (n=%lld)\n", label, percentile(values, 0.5),
              percentile(values, 0.95), *std::max_element(values.cbegin(), values.cend()), (long long)values.size());
}
bool waitFor(const std::function<bool()> &done, int ms) {
  QElapsedTimer timer;
  timer.start();
  while (!done()) {
    if (timer.elapsed() > ms) { return false; }
    QCoreApplication::processEvents(QEventLoop::AllEvents, 5);
  }
  return true;
}
}  // namespace

int main(int argc, char **argv) {
  qputenv("QT_QPA_PLATFORM", "offscreen");
  qputenv("QT_QUICK_BACKEND", "software");
  QApplication app(argc, argv);
  QCommandLineParser parser;
  parser.addOption({"seconds", "Drag length in seconds.", "n", "4"});
  parser.addOption({"image", "Source image.", "file", QStringLiteral(REPO_ROOT "/scripts/presets/source.jpg")});
  parser.addOption({"sample", "Write a macOS sample call tree of the drag here.", "file"});
  parser.process(app);

  QTemporaryDir data;
  qputenv("NODETOOL_WORKSPACES_DIR", QFile::encodeName(data.filePath("workspaces")));
  qputenv("ASSET_FOLDER", QFile::encodeName(data.filePath("assets")));
  qputenv("NODETOOL_LOCAL_RUNNER", "1");
  WorkflowSession::setGuestBundlePath(GUEST_BUNDLE);
  const QString assetId = "0123456789abcdef0123456789abcdef";
  const auto source = parser.value("image");
  QDir().mkpath(data.filePath("assets/1"));
  if (!QFile::copy(source, data.filePath("assets/1/" + assetId + "." + QFileInfo(source).suffix()))) {
    std::fprintf(stderr, "cannot copy %s\n", qPrintable(source));
    return 1;
  }
  const auto size = QImageReader(source).size();

  EditorWindow window;
  window.resize(1600, 900);
  window.show();
  const auto at = [](double x) { return QJsonObject{{"position", QJsonObject{{"x", x}, {"y", 0}}}}; };
  const QJsonArray nodes{
      QJsonObject{{"id", "image"}, {"type", "nodetool.constant.Image"}, {"ui_properties", at(0)},
                  {"data", QJsonObject{{"value", QJsonObject{{"type", "image"}, {"uri", "asset://" + assetId}}}}}},
      QJsonObject{{"id", "grade"}, {"type", "lib.image.color.Grade"}, {"ui_properties", at(500)},
                  {"data", QJsonObject{{"contrast", 1.0}}}},
      QJsonObject{{"id", "blur"}, {"type", "lib.image.filter.GaussianBlur"}, {"ui_properties", at(1000)},
                  {"data", QJsonObject{{"radius", 8.0}}}}};
  const auto edge = [](const char *id, const char *from, const char *to) {
    return QJsonObject{{"id", id}, {"source", from}, {"sourceHandle", "output"}, {"target", to}, {"targetHandle", "image"}};
  };
  const QJsonArray edges{edge("e1", "image", "grade"), edge("e2", "grade", "blur")};
  const auto catalog = QJsonDocument::fromJson(R"([
    {"node_type":"nodetool.constant.Image","title":"Image","namespace":"nodetool.constant","properties":[{"name":"value","type":{"type":"image"}}],"outputs":[{"name":"output","type":{"type":"image","type_args":[]}}]},
    {"node_type":"lib.image.color.Grade","title":"Color Grade","namespace":"lib.image.color","properties":[{"name":"image","type":{"type":"image"},"default":{"type":"image","uri":""}},
      {"name":"brightness","type":{"type":"float"},"min":-1,"max":1,"default":0},{"name":"contrast","type":{"type":"float"},"min":0,"max":4,"default":1},
      {"name":"saturation","type":{"type":"float"},"min":0,"max":4,"default":1},{"name":"hue","type":{"type":"float"},"min":-180,"max":180,"default":0}],
      "outputs":[{"name":"output","type":{"type":"image","type_args":[]}}]},
    {"node_type":"lib.image.filter.GaussianBlur","title":"Gaussian Blur","namespace":"lib.image.filter","properties":[{"name":"image","type":{"type":"image"},"default":{"type":"image","uri":""}},
      {"name":"radius","type":{"type":"float"},"min":0,"max":64,"default":4},{"name":"sigma","type":{"type":"float"},"min":0,"max":32,"default":0}],
      "outputs":[{"name":"output","type":{"type":"image","type_args":[]}}]}
  ])").array();
  window.setCatalog(catalog);
  if (!window.document()->load({{"id", "wf-slider-profile"}, {"name", "Slider profile"}, {"graph", QJsonObject{{"nodes", nodes}, {"edges", edges}}}}).ok) {
    std::fprintf(stderr, "cannot load the workflow\n");
    return 1;
  }
  QTest::qWait(50);
  window.fit();
  auto *session = window.session();
  if (!waitFor([&] { return session->localRunnerReady(); }, 120000)) { std::fprintf(stderr, "runner not ready\n"); return 1; }

  QElapsedTimer clock;
  clock.start();
  QHash<QString, Run> runs;
  QStringList order;
  qint64 lastMove = -1;
  QObject::connect(session, &WorkflowSession::runSubmitted, &app, [&](const QString &id) {
    runs[id].submitted = clock.elapsed();
    runs[id].move = lastMove;
    order.append(id);
  });
  QObject::connect(session, &WorkflowSession::runEvent, &app, [&](const QString &job, const QJsonObject &event) {
    auto &run = runs[job];
    const auto now = clock.elapsed();
    const auto node = event["node_id"].toString();
    if (event["type"] == "node_update" && event["status"] == "running") { run.running.insert(node, now); }
    if (event["type"] == "node_update" && event["status"] == "completed") { run.completed.insert(node, now); }
    if (event["type"] == "job_update" && event["status"] == "completed") { run.finished = now; }
  });
  auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
  QtNodes::NodeId grade = QtNodes::InvalidNodeId, blur = QtNodes::InvalidNodeId;
  for (const auto id : model.allNodeIds()) {
    if (model.resourceId(id) == "grade") { grade = id; }
    if (model.resourceId(id) == "blur") { blur = id; }
  }
  qint64 gradeKey = 0, blurKey = 0;
  const auto watchImages = [&] {
    if (order.isEmpty()) { return; }
    const auto now = clock.elapsed();
    auto &run = runs[order.last()];
    if (const auto key = model.runtimePreview(grade).cacheKey(); key != gradeKey && key != 0) { gradeKey = key; if (run.gradeImage < 0) { run.gradeImage = now; } }
    if (const auto key = model.runtimePreview(blur).cacheKey(); key != blurKey && key != 0) { blurKey = key; if (run.blurImage < 0) { run.blurImage = now; } }
  };
  QObject::connect(&model, &WorkflowGraphModel::runtimeChanged, &app, watchImages);

  // A first full run fills the caches, as the user's earlier runs did.
  session->runSelected(window.document()->snapshot(), {"image", "grade", "blur"}, catalog);
  if (!waitFor([&] { return !order.isEmpty() && runs[order.last()].blurImage >= 0 && !window.activeEditor()->runActive(); }, 120000)) {
    std::fprintf(stderr, "the first run did not finish\n");
    return 1;
  }
  const auto first = runs[order.last()];
  std::printf("image %dx%d, first full run: submit->done %lld ms, ->blur image %lld ms\n", size.width(), size.height(),
              first.finished - first.submitted, first.blurImage - first.submitted);
  runs.clear();
  order.clear();

  const NodeRow *contrast = nullptr;
  for (const auto &r : model.layout(grade).rows) { if (r.kind == NodeRowKind::Slider && r.propertyName == "contrast") { contrast = &r; } }
  if (!contrast) { std::fprintf(stderr, "no contrast slider\n"); return 1; }
  auto *view = window.findChild<QGraphicsView *>();
  const auto track = sliderTrack(*contrast);
  auto *item = window.scene()->nodeGraphicsObject(grade);
  const auto point = [&](double f) { return view->mapFromScene(item->mapToScene(QPointF(track.left() + track.width() * f, track.center().y()))); };

  // Main thread stalls: the gaps between 1 ms timer ticks.
  QList<double> gaps;
  qint64 lastTick = clock.elapsed();
  QTimer ticks;
  QObject::connect(&ticks, &QTimer::timeout, &app, [&] { const auto now = clock.elapsed(); gaps.append(double(now - lastTick)); lastTick = now; });
  ticks.start(1);

  const auto seconds = parser.value("seconds").toDouble();
  if (parser.isSet("sample")) {
    QProcess::startDetached("sample", {QString::number(QCoreApplication::applicationPid()), QString::number(int(seconds + 1)), "1", "-file", parser.value("sample")});
    QTest::qWait(500);
  }
  QList<double> moveCost;
  QTest::mousePress(view->viewport(), Qt::LeftButton, Qt::NoModifier, point(0.25));
  const auto start = clock.elapsed();
  int frame = 0;
  while (clock.elapsed() - start < seconds * 1000) {
    const auto due = start + frame * 1000 / 60;
    while (clock.elapsed() < due) { QCoreApplication::processEvents(QEventLoop::AllEvents, 1); }
    const auto phase = std::fmod(frame / 120.0, 1.0);
    const auto to = point(0.25 + 0.5 * (phase < 0.5 ? phase * 2 : 2 - phase * 2));
    QMouseEvent move(QEvent::MouseMove, QPointF(to), QPointF(view->viewport()->mapToGlobal(to)), Qt::NoButton, Qt::LeftButton, Qt::NoModifier);
    lastMove = clock.elapsed();
    QElapsedTimer cost;
    cost.start();
    QApplication::sendEvent(view->viewport(), &move);
    moveCost.append(cost.nsecsElapsed() / 1e6);
    ++frame;
  }
  const auto dragEnd = clock.elapsed();
  ticks.stop();
  QTest::mouseRelease(view->viewport(), Qt::LeftButton, Qt::NoModifier, point(0.5));
  waitFor([&] { return !window.activeEditor()->runActive(); }, 30000);
  QTest::qWait(300);

  QList<double> submitDelay, toGradeDone, gradeToBlurDone, doneToGradeImage, doneToBlurImage, moveToBlurImage, runnerTotal;
  int shown = 0;
  for (const auto &id : order) {
    const auto &r = runs[id];
    if (r.submitted > dragEnd) { continue; }
    submitDelay.append(double(r.submitted - r.move));
    if (r.completed.contains("grade")) { toGradeDone.append(double(r.completed["grade"] - r.submitted)); }
    if (r.completed.contains("grade") && r.completed.contains("blur")) { gradeToBlurDone.append(double(r.completed["blur"] - r.completed["grade"])); }
    if (r.finished >= 0) { runnerTotal.append(double(r.finished - r.submitted)); }
    if (r.finished >= 0 && r.gradeImage >= 0) { doneToGradeImage.append(double(r.gradeImage - r.finished)); }
    if (r.finished >= 0 && r.blurImage >= 0) { doneToBlurImage.append(double(r.blurImage - r.finished)); }
    if (r.blurImage >= 0) { moveToBlurImage.append(double(r.blurImage - r.move)); ++shown; }
  }
  QList<double> stalls;
  double stalled = 0;
  for (const auto gap : gaps) { if (gap > 16) { stalls.append(gap); stalled += gap; } }
  std::printf("drag %.1f s at 60 Hz: %d moves, %lld runs, %d blur images shown (%.1f per s)\n", seconds, frame,
              (long long)order.size(), shown, shown / seconds);
  row("slider move handling (sync)", moveCost);
  row("move -> run submitted", submitDelay);
  row("submitted -> grade completed", toGradeDone);
  row("grade completed -> blur completed", gradeToBlurDone);
  row("submitted -> job completed", runnerTotal);
  row("job completed -> grade card image", doneToGradeImage);
  row("job completed -> blur card image", doneToBlurImage);
  row("move -> blur card image", moveToBlurImage);
  row("main thread stalls > 16 ms", stalls);
  std::printf("  main thread stalled %.0f ms of %.0f ms (%.0f%%)\n", stalled, double(dragEnd - start), 100 * stalled / double(dragEnd - start));
  return 0;
}
