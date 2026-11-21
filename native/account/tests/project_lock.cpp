// The project lock file `.nodetool/open.lock` and its stale rules (WP2.13,
// TC105 at the library level): a live holder on this host or another host
// keeps the lock, a copied folder's lock and a dead holder's lock are
// replaced, and two openers at once cannot both win.
#include "nodetool/account/project_lock.h"
#include "nodetool/account/storage.h"
#include "test_support.h"

#include <atomic>
#include <memory>
#include <thread>
#include <vector>

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#else
#include <sys/wait.h>
#include <unistd.h>
#endif

namespace {

using namespace nodetool::account;
using account_test::TempDir;
using account_test::TestContext;

constexpr const char* kProject = "0123456789abcdef0123456789abcdef";

ProjectLockHolder holder(int64_t pid, std::string host = "studio", std::string start = "boot:100",
                         std::string project = kProject) {
  return ProjectLockHolder{"timeline", pid, std::move(host), std::move(start), std::move(project)};
}

// A process table with the given processes running.
ProcessStartTime runningProcesses(std::vector<std::pair<int64_t, std::string>> table) {
  return [table = std::move(table)](int64_t pid) -> std::optional<std::string> {
    for (const auto& [id, start] : table) {
      if (id == pid) {
        return start;
      }
    }
    return std::nullopt;
  };
}

std::optional<ProjectLockHolder> onDisk(const TempDir& dir) {
  const auto bytes = readWholeFile(projectLockPath(dir.path()));
  return bytes ? parseProjectLock(*bytes) : std::nullopt;
}

void placeLock(const TempDir& dir, const ProjectLockHolder& h) {
  writeFileAtomically(projectLockPath(dir.path()), serializeProjectLock(h));
}

// The id of a process that ran and has exited.
int64_t finishedProcessId() {
#ifdef _WIN32
  STARTUPINFOW startup{};
  startup.cb = sizeof(startup);
  PROCESS_INFORMATION info{};
  wchar_t command[] = L"cmd.exe /c exit 0";
  if (!CreateProcessW(nullptr, command, nullptr, nullptr, FALSE, CREATE_NO_WINDOW, nullptr, nullptr, &startup,
                      &info)) {
    return 0;
  }
  WaitForSingleObject(info.hProcess, INFINITE);
  const int64_t pid = static_cast<int64_t>(info.dwProcessId);
  CloseHandle(info.hThread);
  CloseHandle(info.hProcess);
  return pid;
#else
  const pid_t child = ::fork();
  if (child == 0) {
    ::_exit(0);
  }
  if (child < 0) {
    return 0;
  }
  int status = 0;
  ::waitpid(child, &status, 0);
  return static_cast<int64_t>(child);
#endif
}

void fileRoundTrips(TestContext& t) {
  const auto h = holder(42);
  CHECK(parseProjectLock(serializeProjectLock(h)) == std::optional<ProjectLockHolder>(h));
  CHECK(!parseProjectLock("not json").has_value());
  CHECK(!parseProjectLock(R"({"app":"timeline","pid":"42","host":"a","start_time":"","project_id":"p"})")
             .has_value());
  CHECK(!parseProjectLock(R"({"app":"timeline","pid":42,"host":"a","start_time":""})").has_value());
}

void emptyFolderIsAcquired(TestContext& t) {
  TempDir dir;
  const auto self = holder(10);
  const auto result = acquireProjectLock(dir.path(), self, runningProcesses({{10, "boot:100"}}));
  CHECK(result.outcome == ProjectLockOutcome::Acquired);
  CHECK(onDisk(dir) == std::optional<ProjectLockHolder>(self));
  // Opening again in the same process keeps the lock.
  CHECK(acquireProjectLock(dir.path(), self, runningProcesses({{10, "boot:100"}})).outcome ==
        ProjectLockOutcome::Acquired);
}

void liveHolderOnThisHostKeepsTheLock(TestContext& t) {
  TempDir dir;
  const auto first = holder(10);
  placeLock(dir, first);
  const auto result = acquireProjectLock(dir.path(), holder(20, "studio", "boot:200"),
                                         runningProcesses({{10, "boot:100"}, {20, "boot:200"}}));
  CHECK(result.outcome == ProjectLockOutcome::HeldOnThisHost);
  CHECK(result.holder == std::optional<ProjectLockHolder>(first));
  CHECK(onDisk(dir) == std::optional<ProjectLockHolder>(first));
}

void deadHolderIsReplaced(TestContext& t) {
  TempDir dir;
  placeLock(dir, holder(10));
  const auto self = holder(20, "studio", "boot:200");
  const auto result = acquireProjectLock(dir.path(), self, runningProcesses({{20, "boot:200"}}));
  CHECK(result.outcome == ProjectLockOutcome::Acquired);
  CHECK(onDisk(dir) == std::optional<ProjectLockHolder>(self));
}

void reusedProcessIdIsReplaced(TestContext& t) {
  TempDir dir;
  placeLock(dir, holder(10, "studio", "boot:100"));
  const auto self = holder(20, "studio", "boot:200");
  // Process 10 runs, but it started after the lock was written.
  const auto result =
      acquireProjectLock(dir.path(), self, runningProcesses({{10, "boot:150"}, {20, "boot:200"}}));
  CHECK(result.outcome == ProjectLockOutcome::Acquired);
  CHECK(onDisk(dir) == std::optional<ProjectLockHolder>(self));
}

void unreadableStartTimeCountsAsTheHolder(TestContext& t) {
  TempDir dir;
  const auto first = holder(10);
  placeLock(dir, first);
  const auto result =
      acquireProjectLock(dir.path(), holder(20, "studio", "boot:200"), runningProcesses({{10, ""}}));
  CHECK(result.outcome == ProjectLockOutcome::HeldOnThisHost);
  CHECK(onDisk(dir) == std::optional<ProjectLockHolder>(first));
}

void copiedFolderIsAcquired(TestContext& t) {
  TempDir dir;
  // The copy carries the original's lock, whose holder still runs.
  placeLock(dir, holder(10, "studio", "boot:100", "fedcba9876543210fedcba9876543210"));
  const auto self = holder(20, "studio", "boot:200");
  const auto result =
      acquireProjectLock(dir.path(), self, runningProcesses({{10, "boot:100"}, {20, "boot:200"}}));
  CHECK(result.outcome == ProjectLockOutcome::Acquired);
  CHECK(onDisk(dir) == std::optional<ProjectLockHolder>(self));
}

void otherHostIsHeldUntilTakenOver(TestContext& t) {
  TempDir dir;
  const auto remote = holder(10, "laptop", "boot:100");
  placeLock(dir, remote);
  const auto self = holder(20, "studio", "boot:200");
  // No process 10 runs here, which says nothing about the other computer.
  const auto result = acquireProjectLock(dir.path(), self, runningProcesses({{20, "boot:200"}}));
  CHECK(result.outcome == ProjectLockOutcome::HeldOnOtherHost);
  CHECK(result.holder == std::optional<ProjectLockHolder>(remote));
  CHECK(onDisk(dir) == std::optional<ProjectLockHolder>(remote));
  CHECK(takeOverProjectLock(dir.path(), self).outcome == ProjectLockOutcome::Acquired);
  CHECK(onDisk(dir) == std::optional<ProjectLockHolder>(self));
}

void releaseRemovesOnlyItsOwnLock(TestContext& t) {
  TempDir dir;
  const auto self = holder(10);
  CHECK(acquireProjectLock(dir.path(), self, runningProcesses({{10, "boot:100"}})).outcome ==
        ProjectLockOutcome::Acquired);
  // Another computer took over after its person confirmed.
  const auto remote = holder(30, "laptop", "boot:300");
  CHECK(takeOverProjectLock(dir.path(), remote).outcome == ProjectLockOutcome::Acquired);
  releaseProjectLock(dir.path(), self);
  CHECK(onDisk(dir) == std::optional<ProjectLockHolder>(remote));
  releaseProjectLock(dir.path(), remote);
  CHECK(!std::filesystem::exists(projectLockPath(dir.path())));
}

void twoOpenersAtOnceHaveOneWinner(TestContext& t) {
  for (int round = 0; round < 20; ++round) {
    TempDir dir;
    std::vector<std::pair<int64_t, std::string>> table;
    for (int64_t pid = 1; pid <= 8; ++pid) {
      table.emplace_back(pid, "boot:" + std::to_string(pid));
    }
    const auto probe = runningProcesses(table);
    std::atomic<int> acquired{0};
    std::atomic<int> held{0};
    std::vector<std::thread> openers;
    for (int64_t pid = 1; pid <= 8; ++pid) {
      openers.emplace_back([&, pid] {
        const auto result = acquireProjectLock(dir.path(), holder(pid, "studio", "boot:" + std::to_string(pid)),
                                               probe);
        if (result.outcome == ProjectLockOutcome::Acquired) {
          ++acquired;
        } else if (result.outcome == ProjectLockOutcome::HeldOnThisHost) {
          ++held;
        }
      });
    }
    for (auto& opener : openers) {
      opener.join();
    }
    CHECK(acquired.load() == 1);
    CHECK(held.load() == 7);
  }
}

void realProcessesAreRecognized(TestContext& t) {
  const auto self = currentProcessHolder("timeline", kProject);
  CHECK(self.pid > 0);
  CHECK(!self.host.empty());
  CHECK(!self.startTime.empty());
  CHECK(processStartTime(self.pid) == std::optional<std::string>(self.startTime));
  const int64_t finished = finishedProcessId();
  CHECK(finished > 0);
  CHECK(!processStartTime(finished).has_value());

  // A lock left by the finished process is replaced with the real probe.
  TempDir dir;
  placeLock(dir, ProjectLockHolder{"node-editor", finished, self.host, "gone", kProject});
  CHECK(acquireProjectLock(dir.path(), self).outcome == ProjectLockOutcome::Acquired);
  CHECK(onDisk(dir) == std::optional<ProjectLockHolder>(self));
}

void processCountsWindowsPerProject(TestContext& t) {
  TempDir dir;
  ProjectLocks locks("node-editor");
  // Two windows of one app on one project.
  CHECK(locks.acquire(dir.path(), kProject).outcome == ProjectLockOutcome::Acquired);
  CHECK(locks.acquire(dir.path(), kProject).outcome == ProjectLockOutcome::Acquired);
  CHECK(onDisk(dir) == std::optional<ProjectLockHolder>(locks.self(kProject)));
  locks.release(dir.path(), kProject);
  CHECK(std::filesystem::exists(projectLockPath(dir.path())));
  // The same folder written another way counts as the same lock.
  locks.release(dir.path() / "." / "", kProject);
  CHECK(!std::filesystem::exists(projectLockPath(dir.path())));
  // A release without a count leaves another holder's file alone.
  const auto remote = holder(30, "laptop", "boot:300");
  placeLock(dir, remote);
  locks.release(dir.path(), kProject);
  CHECK(onDisk(dir) == std::optional<ProjectLockHolder>(remote));
  CHECK(locks.acquire(dir.path(), kProject).outcome == ProjectLockOutcome::HeldOnOtherHost);
  CHECK(locks.takeOver(dir.path(), kProject).outcome == ProjectLockOutcome::Acquired);
  CHECK(onDisk(dir) == std::optional<ProjectLockHolder>(locks.self(kProject)));
}

void processReleasesItsLocksWhenItEnds(TestContext& t) {
  TempDir dir;
  {
    ProjectLocks locks("timeline");
    CHECK(locks.acquire(dir.path(), kProject).outcome == ProjectLockOutcome::Acquired);
    CHECK(std::filesystem::exists(projectLockPath(dir.path())));
  }
  CHECK(!std::filesystem::exists(projectLockPath(dir.path())));
}

// TC105 with two apps standing in as two ProjectLocks on one host.
void secondAppOpensReadOnlyUntilTheFirstEnds(TestContext& t) {
  TempDir original;
  TempDir copy;
  std::vector<std::pair<int64_t, std::string>> table{{10, "boot:100"}, {20, "boot:200"}};
  auto first = std::make_unique<ProjectLocks>(holder(10, "studio", "boot:100"), runningProcesses(table));
  ProjectLocks second(ProjectLockHolder{"node-editor", 20, "studio", "boot:200", ""}, runningProcesses(table));
  CHECK(first->acquire(original.path(), kProject).outcome == ProjectLockOutcome::Acquired);
  // The copy carries the original's lock file, under the original's project id.
  writeFileAtomically(projectLockPath(copy.path()), serializeProjectLock(first->self(kProject)));
  CHECK(second.acquire(copy.path(), "fedcba9876543210fedcba9876543210").outcome == ProjectLockOutcome::Acquired);
  const auto held = second.acquire(original.path(), kProject);
  CHECK(held.outcome == ProjectLockOutcome::HeldOnThisHost);
  CHECK(held.holder.has_value() && held.holder->app == "timeline");
  // The first app is killed: its process leaves the table and its lock stays.
  first.reset();
  writeFileAtomically(projectLockPath(original.path()), serializeProjectLock(holder(10, "studio", "boot:100")));
  table.erase(table.begin());
  ProjectLocks reopened(ProjectLockHolder{"node-editor", 20, "studio", "boot:200", ""}, runningProcesses(table));
  CHECK(reopened.acquire(original.path(), kProject).outcome == ProjectLockOutcome::Acquired);
}

} // namespace

int main() {
  return account_test::runTests({
      {"fileRoundTrips", fileRoundTrips},
      {"emptyFolderIsAcquired", emptyFolderIsAcquired},
      {"liveHolderOnThisHostKeepsTheLock", liveHolderOnThisHostKeepsTheLock},
      {"deadHolderIsReplaced", deadHolderIsReplaced},
      {"reusedProcessIdIsReplaced", reusedProcessIdIsReplaced},
      {"unreadableStartTimeCountsAsTheHolder", unreadableStartTimeCountsAsTheHolder},
      {"copiedFolderIsAcquired", copiedFolderIsAcquired},
      {"otherHostIsHeldUntilTakenOver", otherHostIsHeldUntilTakenOver},
      {"releaseRemovesOnlyItsOwnLock", releaseRemovesOnlyItsOwnLock},
      {"twoOpenersAtOnceHaveOneWinner", twoOpenersAtOnceHaveOneWinner},
      {"realProcessesAreRecognized", realProcessesAreRecognized},
      {"processCountsWindowsPerProject", processCountsWindowsPerProject},
      {"processReleasesItsLocksWhenItEnds", processReleasesItsLocksWhenItEnds},
      {"secondAppOpensReadOnlyUntilTheFirstEnds", secondAppOpensReadOnlyUntilTheFirstEnds},
  });
}
