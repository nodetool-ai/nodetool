// The editor's exit policy for native host jobs of local runs
// (WorkflowSession::finishLocalRunJobs and src/main.cpp): jobs on the graph
// runner's process lanes get a grace period once the last session is gone,
// and one that ignores its stop request ends the editor without static
// teardown.
//
//   node_editor_exit_tests <slot>                 one Qt Test slot
//   node_editor_exit_tests --exit-probe <args>    the editor, see below
//
// Each slot runs in a process of its own, because shutting the process lanes
// down is permanent. The jobs are test-only native jobs submitted straight to
// the I/O lane. Nothing here reaches a provider, a secret or the network.
//
// With --exit-probe, this binary is the editor: it runs src/main.cpp's main()
// with the remaining arguments, after starting a lane job that never honours
// stop and arranging for every window to close once the event loop runs.
// editorExitsWithinGraceAndKeepsTabs starts it as a subprocess.
//
// Jobs share state with the test through shared pointers they capture by
// value, never through references to the test's stack (native/AGENTS.md
// rule 12).
#include "kernel/host_lanes.h"
#include "server/WorkflowSession.h"
#include "ui/EditorWindow.h"

#include <QApplication>
#include <QCommandLineParser>
#include <QDirIterator>
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QProcess>
#include <QQuickWindow>
#include <QSettings>
#include <QTemporaryDir>
#include <QTimer>
#include <QtTest>

#include <chrono>
#include <condition_variable>
#include <cstdio>
#include <cstdlib>
#include <memory>
#include <mutex>
#include <stop_token>
#include <string_view>
#include <thread>

// The shipped editor's main(), compiled here under another name so the probe
// exercises its exit path unchanged.
#define main nodeEditorMain
#include "../../src/main.cpp"
#undef main

using nodetool::node_editor::WorkflowSession;
using Clock = std::chrono::steady_clock;
using std::chrono::milliseconds;

namespace {

// A one-way flag a job waits on.
//
// Thread affinity: thread-safe, `mutex` guards `open`.
struct Gate {
  std::mutex mutex;
  std::condition_variable_any changed;
  bool open = false;

  void release() {
    {
      std::lock_guard lock(mutex);
      open = true;
    }
    changed.notify_all();
  }
  // Waits until released.
  void wait() {
    std::unique_lock lock(mutex);
    changed.wait(lock, [this] { return open; });
  }
  // Waits until released or `stop` is requested. Returns whether released.
  bool wait(std::stop_token stop) {
    std::unique_lock lock(mutex);
    return changed.wait(lock, stop, [this] { return open; });
  }
  bool isOpen() {
    std::lock_guard lock(mutex);
    return open;
  }
};

// What a job reports to the test: that it started, and that it returned.
//
// Thread affinity: thread-safe, each member synchronizes itself.
struct JobState {
  Gate started;
  Gate finished;
};

// Submits `work` to the process I/O lane as a detached job: no mailbox, no
// run and no tracker ticket. The lane links its own stop token to the job's,
// so shutdownHostLanes() requests stop on it.
template <class F>
void submitLaneJob(F work) {
  auto lanes = gr::processHostLanes({});
  lanes->io().submit(
      nodetool::jobs::SubmittedJob(1, nodetool::jobs::makeJob(std::move(work)), nullptr, std::stop_token{}, {}));
}

double msSince(Clock::time_point start) {
  return std::chrono::duration<double, std::milli>(Clock::now() - start).count();
}

// --exit-probe: runs after QApplication's constructor, before main() shows a
// window. The posted call runs once the event loop does.
void closeWindowsSoon() {
  QMetaObject::invokeMethod(qApp, [] {
    QTimer::singleShot(1000, qApp, [] {
      std::fprintf(stderr, "exit-probe: closing windows\n");
      std::fflush(stderr);
      QApplication::closeAllWindows();
    });
  }, Qt::QueuedConnection);
}

int runExitProbe(int argc, char **argv) {
  // Never released: the job outlives the editor's grace period, and
  // quick_exit ends the process under it.
  auto stuck = std::make_shared<Gate>();
  auto state = std::make_shared<JobState>();
  submitLaneJob([stuck, state](std::stop_token) {
    state->started.release();
    stuck->wait();
    return nodetool::jobs::JobOutcome::stopped();
  });
  state->started.wait();
  std::fprintf(stderr, "exit-probe: lane job running\n");
  std::fflush(stderr);
  qAddPreRoutine(closeWindowsSoon);
  // Every test binary of this project points XDG_CONFIG_HOME at a private
  // temporary directory (tests/support/SettingsIsolation.cpp). The editor
  // writes where the test reads instead.
  qputenv("XDG_CONFIG_HOME", qgetenv("NODETOOL_EXIT_PROBE_CONFIG"));
  QSettings::setPath(QSettings::IniFormat, QSettings::UserScope, qEnvironmentVariable("NODETOOL_EXIT_PROBE_CONFIG"));
  // argv[1] is --exit-probe. The editor sees the program name and the rest.
  argv[1] = argv[0];
  return nodeEditorMain(argc - 1, argv + 1);
}

}  // namespace

class EditorExitTest : public QObject {
  Q_OBJECT
private slots:
  // A job still running when the last session, and with it the runner, is
  // gone finishes its cleanup after the stop request, and shutdown waits for
  // it: Complete, before the deadline, with the job returned.
  void drainsJobThatOutlivesSession() {
    QVERIFY2(QFileInfo::exists(GUEST_BUNDLE), "Build the guest bundle with node native/graph-runner/guest/build.mjs");
    QTemporaryDir workspaces, assets;
    qputenv("NODETOOL_WORKSPACES_DIR", QFile::encodeName(workspaces.path()));
    qputenv("ASSET_FOLDER", QFile::encodeName(assets.path()));
    qputenv("NODETOOL_LOCAL_RUNNER", "1");
    WorkflowSession::setGuestBundlePath(GUEST_BUNDLE);
    auto state = std::make_shared<JobState>();
    {
      WorkflowSession session;
      QTRY_VERIFY_WITH_TIMEOUT(session.localRunnerReady(), 120000);
      submitLaneJob([state](std::stop_token stop) {
        state->started.release();
        // Never released: only the stop request ends the wait.
        Gate never;
        never.wait(stop);
        std::this_thread::sleep_for(milliseconds(300));  // cleanup after the stop
        state->finished.release();
        return nodetool::jobs::JobOutcome::stopped();
      });
      state->started.wait();
    }
    QVERIFY(!state->finished.isOpen());
    const auto start = Clock::now();
    const size_t live = WorkflowSession::finishLocalRunJobs(start + std::chrono::seconds(5));
    const double elapsed = msSince(start);
    QCOMPARE(live, size_t(0));
    QVERIFY(state->finished.isOpen());
    QVERIFY2(elapsed >= 250, qPrintable(QString::number(elapsed)));
    QVERIFY2(elapsed < 5000, qPrintable(QString::number(elapsed)));
  }

  // A job that ignores stop keeps its lane thread: shutdown returns at its
  // deadline with that thread still live, and does not join it. Once the job
  // returns, a second call completes.
  void timesOutOnJobIgnoringStop() {
    auto release = std::make_shared<Gate>();
    auto state = std::make_shared<JobState>();
    submitLaneJob([release, state](std::stop_token) {
      state->started.release();
      release->wait();
      state->finished.release();
      return nodetool::jobs::JobOutcome::stopped();
    });
    state->started.wait();
    const auto start = Clock::now();
    const size_t live = WorkflowSession::finishLocalRunJobs(start + milliseconds(300));
    const double elapsed = msSince(start);
    QVERIFY2(live >= 1, qPrintable(QString::number(live)));
    QVERIFY(!state->finished.isOpen());
    QVERIFY2(elapsed >= 280, qPrintable(QString::number(elapsed)));
    QVERIFY2(elapsed < 1300, qPrintable(QString::number(elapsed)));
    release->release();
    QCOMPARE(WorkflowSession::finishLocalRunJobs(Clock::now() + std::chrono::seconds(5)), size_t(0));
    QVERIFY(state->finished.isOpen());
  }

  // The editor itself, with a lane job that never returns: closing its window
  // persists the open tabs, then the editor waits the 2 s grace period and
  // ends with std::quick_exit and the event loop's status, 0. The tabs are on
  // disk although no static destructor ran.
  void editorExitsWithinGraceAndKeepsTabs() {
    QTemporaryDir dir;
    QVERIFY(dir.isValid());
    const QString file = dir.filePath("probe.json");
    {
      QJsonObject note{{"id", "note"}, {"type", "nodetool.workflows.base_node.Comment"},
                       {"data", QJsonObject{{"comment", "probe"}}},
                       {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 0}, {"y", 0}}}}}};
      QJsonObject workflow{{"name", "Exit probe"},
                           {"graph", QJsonObject{{"nodes", QJsonArray{note}}, {"edges", QJsonArray{}}}}};
      QFile out(file);
      QVERIFY(out.open(QIODevice::WriteOnly));
      QVERIFY(out.write(QJsonDocument(workflow).toJson()) > 0);
    }
    const QString config = dir.filePath("config");
    QProcess probe;
    auto env = QProcessEnvironment::systemEnvironment();
    env.insert("NODETOOL_EXIT_PROBE_CONFIG", config);
    env.insert("NODETOOL_LOCAL_RUNNER", "0");
    env.insert("QT_QPA_PLATFORM", "offscreen");
    env.insert("QT_QUICK_BACKEND", "software");
    probe.setProcessEnvironment(env);
    QByteArray errors;
    const auto readErrors = [&probe, &errors]() -> const QByteArray & {
      errors += probe.readAllStandardError();
      return errors;
    };
    probe.start(QCoreApplication::applicationFilePath(), {"--exit-probe", "--offline", "--open", file});
    QVERIFY(probe.waitForStarted(10000));
    QTRY_VERIFY2_WITH_TIMEOUT(readErrors().contains("exit-probe: closing windows"), errors.constData(), 120000);
    const auto closing = Clock::now();
    // Window teardown plus the grace period, and margin for a loaded machine.
    QTRY_VERIFY_WITH_TIMEOUT(probe.state() == QProcess::NotRunning, 8000);
    const double afterClose = msSince(closing);
    readErrors();
    QVERIFY2(probe.exitStatus() == QProcess::NormalExit, errors.constData());
    QVERIFY2(probe.exitCode() == 0, errors.constData());
    QVERIFY2(errors.contains("exit-probe: lane job running"), errors.constData());
    QVERIFY2(errors.contains("host lane threads still running a job, exiting without static teardown"),
             errors.constData());
    // Only an upper bound: the parent sees the marker late by however long
    // the pipe and its own scheduling take, so the time it measures can be
    // shorter than the child's wait. timesOutOnJobIgnoringStop checks that
    // the wait lasts until the deadline, and the warning above shows that
    // this shutdown reached TimedOut.
    QVERIFY2(afterClose < 8000, qPrintable(QString::number(afterClose)));

    // What closing the window persisted (EditorWindow::persistTabs). Qt names
    // INI settings files .conf on Linux and .ini on macOS and Windows.
    QStringList conf;
    for (QDirIterator it(config, {"*.conf", "*.ini"}, QDir::Files, QDirIterator::Subdirectories); it.hasNext();) {
      conf << it.next();
    }
    QCOMPARE(conf.size(), 1);
    QSettings settings(conf.first(), QSettings::IniFormat);
    const auto tabs = QJsonDocument::fromJson(settings.value("workflowTabs/documents").toByteArray()).array();
    QCOMPARE(tabs.size(), 1);
    QCOMPARE(QFileInfo(tabs.first().toObject()["file"].toString()).canonicalFilePath(),
             QFileInfo(file).canonicalFilePath());
    QCOMPARE(settings.value("workflowTabs/active").toInt(), 0);
  }
};

int main(int argc, char **argv) {
  if (argc > 1 && std::string_view(argv[1]) == "--exit-probe") { return runExitProbe(argc, argv); }
  QCoreApplication app(argc, argv);
  EditorExitTest test;
  return QTest::qExec(&test, argc, argv);
}

#include "EditorExitTest.moc"
