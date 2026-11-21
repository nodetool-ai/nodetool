// The project lock file `.nodetool/open.lock` (technical design, "Deletion,
// restore and storage", WP2.13). The process that opens a local project for
// writing holds it. It names the app, the process id, the host, the process
// start time and the project id. A second process opens the project
// read-only and names the holder (AC25).
//
// A copied folder carries the file, so a lock is stale, and is replaced, when
// it names another project id, or a process on this host that is not running
// with that start time. A lock from another host cannot be checked: the app
// offers to open read-only, or calls takeOver() after the person confirms
// that no other computer has the project open (TC105).
//
// The in-process folder queue of the bundled server (RF22) cannot give AC25,
// because the two apps are separate processes.
#pragma once

#include <cstdint>
#include <filesystem>
#include <functional>
#include <map>
#include <mutex>
#include <optional>
#include <string>
#include <string_view>
#include <utility>

namespace nodetool::account {

// What the lock file names. `startTime` is an opaque token of the platform
// (boot id and clock ticks on Linux, seconds and microseconds on macOS, the
// creation FILETIME on Windows), compared only for equality.
struct ProjectLockHolder {
  std::string app;
  int64_t pid = 0;
  std::string host;
  std::string startTime;
  std::string projectId;
  bool operator==(const ProjectLockHolder&) const = default;
};

// The JSON the file holds: {"app","pid","host","start_time","project_id"}.
std::string serializeProjectLock(const ProjectLockHolder& holder);
// Nullopt for a malformed file, which counts as no lock.
std::optional<ProjectLockHolder> parseProjectLock(std::string_view bytes);

// The start time of a running process on this host. Nullopt when no process
// has that id. An empty string when the process runs but its start time
// cannot be read, which counts as the holder still running.
using ProcessStartTime = std::function<std::optional<std::string>(int64_t pid)>;
std::optional<std::string> processStartTime(int64_t pid);

// This process as a holder of `projectId`, for the app named `app`.
ProjectLockHolder currentProcessHolder(std::string_view app, std::string_view projectId);
std::string currentHostName();

enum class ProjectLockOutcome {
  // This process holds the lock now, or held it already.
  Acquired,
  // A running process on this host holds it. Open read-only.
  HeldOnThisHost,
  // A process on another host holds it. Open read-only, or take over after
  // the person confirms.
  HeldOnOtherHost,
  // The folder or the file cannot be written. `error` says why.
  Failed,
};

struct ProjectLockResult {
  ProjectLockOutcome outcome = ProjectLockOutcome::Failed;
  // The holder the file names, for the two Held outcomes.
  std::optional<ProjectLockHolder> holder;
  std::string error;
};

// The path of the lock file in a project folder.
std::filesystem::path projectLockPath(const std::filesystem::path& projectFolder);

// Takes the lock for `self` unless a live holder has it. The check and the
// write run under an operating system lock on `.nodetool/open.lock.guard`,
// so two processes that open the folder at once cannot both win.
//
// Thread affinity: thread-safe. Concurrent calls exclude each other through
// the guard file.
ProjectLockResult acquireProjectLock(const std::filesystem::path& projectFolder,
                                     const ProjectLockHolder& self,
                                     const ProcessStartTime& startTimeOf = processStartTime);

// Replaces any holder with `self`, after the person confirmed that the other
// computer does not have the project open.
ProjectLockResult takeOverProjectLock(const std::filesystem::path& projectFolder,
                                      const ProjectLockHolder& self);

// Removes the file when it still names `self`. A lock another process took
// over in the meantime stays.
void releaseProjectLock(const std::filesystem::path& projectFolder, const ProjectLockHolder& self);

// The project locks of one process, counted per folder and project, so two
// windows of one app on one project remove the file only when the last one
// lets go. Each app keeps one, owned by its main window or main(), and every
// window borrows it.
//
// Thread affinity: thread-safe. `mutex_` guards `counts_`.
//
// Ownership: the object owns no file handle. Its destructor releases every
// lock it still counts.
class ProjectLocks {
public:
  explicit ProjectLocks(std::string app);
  // Test seam: `process` stands in for this process (its project id is
  // ignored), and `startTimeOf` for the process table.
  ProjectLocks(ProjectLockHolder process, ProcessStartTime startTimeOf);
  ~ProjectLocks();
  ProjectLocks(const ProjectLocks&) = delete;
  ProjectLocks& operator=(const ProjectLocks&) = delete;

  // acquireProjectLock for this process. An Acquired outcome counts one
  // holder, which release() gives back.
  ProjectLockResult acquire(const std::filesystem::path& projectFolder, std::string_view projectId);
  // takeOverProjectLock for this process, counted like acquire().
  ProjectLockResult takeOver(const std::filesystem::path& projectFolder, std::string_view projectId);
  // Gives back one count. The last one removes the file.
  void release(const std::filesystem::path& projectFolder, std::string_view projectId);
  // The holder this process writes for `projectId`.
  ProjectLockHolder self(std::string_view projectId) const;

private:
  using Key = std::pair<std::string, std::string>;
  static Key key(const std::filesystem::path& projectFolder, std::string_view projectId);
  ProjectLockResult count(const Key& key, ProjectLockResult result);

  const ProcessStartTime startTimeOf_;
  const ProjectLockHolder process_;
  std::mutex mutex_;
  std::map<Key, int> counts_;
};

} // namespace nodetool::account
