#include "nodetool/account/project_lock.h"

#include "nodetool/account/storage.h"

#include <nlohmann/json.hpp>

#include <chrono>
#include <fstream>
#include <sstream>
#include <system_error>
#include <utility>

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#else
#include <csignal>
#include <cerrno>
#include <unistd.h>
#ifdef __APPLE__
#include <libproc.h>
#include <sys/proc_info.h>
#endif
#endif

namespace nodetool::account {

namespace {

// How long acquire waits for another process that is checking the same
// folder. The check is a read and a write, so this is never reached unless
// the guard file sits on a file system that does not answer.
constexpr std::chrono::milliseconds kGuardTimeout{5000};

std::filesystem::path guardPath(const std::filesystem::path& projectFolder) {
  return projectFolder / ".nodetool" / "open.lock.guard";
}

std::optional<ProjectLockHolder> readHolder(const std::filesystem::path& path) {
  const auto bytes = readWholeFile(path);
  if (!bytes) {
    return std::nullopt;
  }
  return parseProjectLock(*bytes);
}

ProjectLockResult writeHolder(const std::filesystem::path& projectFolder, const ProjectLockHolder& self) {
  if (!writeFileAtomically(projectLockPath(projectFolder), serializeProjectLock(self))) {
    return {ProjectLockOutcome::Failed, std::nullopt, "The project lock file could not be written."};
  }
  return {ProjectLockOutcome::Acquired, std::nullopt, {}};
}

#if !defined(_WIN32)
// True when a process with this id exists, including one this user may not
// signal.
bool processExists(int64_t pid) {
  if (pid <= 0) {
    return false;
  }
  return ::kill(static_cast<pid_t>(pid), 0) == 0 || errno == EPERM;
}
#endif

#if defined(__linux__)
std::string bootId() {
  std::ifstream in("/proc/sys/kernel/random/boot_id");
  std::string id;
  std::getline(in, id);
  return id;
}
#endif

} // namespace

std::string serializeProjectLock(const ProjectLockHolder& holder) {
  const nlohmann::json json = {{"app", holder.app},
                               {"pid", holder.pid},
                               {"host", holder.host},
                               {"start_time", holder.startTime},
                               {"project_id", holder.projectId}};
  return json.dump(2) + "\n";
}

std::optional<ProjectLockHolder> parseProjectLock(std::string_view bytes) {
  const auto json = nlohmann::json::parse(bytes, nullptr, false);
  if (!json.is_object()) {
    return std::nullopt;
  }
  const auto text = [&](const char* key) -> std::optional<std::string> {
    const auto it = json.find(key);
    if (it == json.end() || !it->is_string()) {
      return std::nullopt;
    }
    return it->get<std::string>();
  };
  const auto pid = json.find("pid");
  const auto app = text("app");
  const auto host = text("host");
  const auto startTime = text("start_time");
  const auto projectId = text("project_id");
  if (pid == json.end() || !pid->is_number_integer() || !app || !host || !startTime || !projectId) {
    return std::nullopt;
  }
  return ProjectLockHolder{*app, pid->get<int64_t>(), *host, *startTime, *projectId};
}

std::optional<std::string> processStartTime(int64_t pid) {
#ifdef _WIN32
  if (pid <= 0) {
    return std::nullopt;
  }
  HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, static_cast<DWORD>(pid));
  if (process == nullptr) {
    if (GetLastError() == ERROR_ACCESS_DENIED) {
      return std::string();
    }
    return std::nullopt;
  }
  DWORD exitCode = 0;
  FILETIME created{}, exited{}, kernel{}, user{};
  std::optional<std::string> result;
  if (GetExitCodeProcess(process, &exitCode) && exitCode != STILL_ACTIVE) {
    result = std::nullopt;
  } else if (GetProcessTimes(process, &created, &exited, &kernel, &user)) {
    const uint64_t ticks = (static_cast<uint64_t>(created.dwHighDateTime) << 32) | created.dwLowDateTime;
    result = std::to_string(ticks);
  } else {
    result = std::string();
  }
  CloseHandle(process);
  return result;
#elif defined(__APPLE__)
  if (!processExists(pid)) {
    return std::nullopt;
  }
  proc_bsdinfo info{};
  if (proc_pidinfo(static_cast<int>(pid), PROC_PIDTBSDINFO, 0, &info, sizeof(info)) != sizeof(info)) {
    return std::string();
  }
  return std::to_string(info.pbi_start_tvsec) + "." + std::to_string(info.pbi_start_tvusec);
#elif defined(__linux__)
  if (!processExists(pid)) {
    return std::nullopt;
  }
  std::ifstream in("/proc/" + std::to_string(pid) + "/stat");
  std::string line;
  if (!std::getline(in, line)) {
    return std::string();
  }
  // The command name in parentheses may hold spaces, so fields are counted
  // from the last ')'. The start time is field 22, the 20th after it.
  const auto close = line.rfind(')');
  if (close == std::string::npos) {
    return std::string();
  }
  std::istringstream fields(line.substr(close + 1));
  std::string field;
  for (int i = 0; i < 20 && fields >> field; ++i) {
  }
  if (!fields) {
    return std::string();
  }
  return bootId() + ":" + field;
#else
  return processExists(pid) ? std::optional<std::string>(std::string()) : std::nullopt;
#endif
}

std::string currentHostName() {
#ifdef _WIN32
  char name[256] = {};
  DWORD size = sizeof(name);
  if (GetComputerNameExA(ComputerNameDnsHostname, name, &size)) {
    return std::string(name, size);
  }
  return {};
#else
  char name[256] = {};
  if (::gethostname(name, sizeof(name) - 1) != 0) {
    return {};
  }
  return name;
#endif
}

ProjectLockHolder currentProcessHolder(std::string_view app, std::string_view projectId) {
#ifdef _WIN32
  const int64_t pid = static_cast<int64_t>(GetCurrentProcessId());
#else
  const int64_t pid = static_cast<int64_t>(::getpid());
#endif
  return ProjectLockHolder{std::string(app), pid, currentHostName(), processStartTime(pid).value_or(""),
                           std::string(projectId)};
}

std::filesystem::path projectLockPath(const std::filesystem::path& projectFolder) {
  return projectFolder / ".nodetool" / "open.lock";
}

ProjectLockResult acquireProjectLock(const std::filesystem::path& projectFolder, const ProjectLockHolder& self,
                                     const ProcessStartTime& startTimeOf) {
  auto guard = AccountLock::acquire(guardPath(projectFolder), kGuardTimeout);
  if (!guard) {
    return {ProjectLockOutcome::Failed, std::nullopt, "The project folder could not be locked."};
  }
  const auto holder = readHolder(projectLockPath(projectFolder));
  // No file, a malformed file, or a copied folder's lock: replace it.
  if (!holder || holder->projectId != self.projectId) {
    return writeHolder(projectFolder, self);
  }
  if (holder->host == self.host && holder->pid == self.pid && holder->startTime == self.startTime) {
    return {ProjectLockOutcome::Acquired, std::nullopt, {}};
  }
  if (holder->host != self.host) {
    return {ProjectLockOutcome::HeldOnOtherHost, holder, {}};
  }
  const auto running = startTimeOf(holder->pid);
  // An unreadable start time counts as the holder, so a lock is never
  // replaced while its process may still be writing.
  if (running && (running->empty() || *running == holder->startTime)) {
    return {ProjectLockOutcome::HeldOnThisHost, holder, {}};
  }
  return writeHolder(projectFolder, self);
}

ProjectLockResult takeOverProjectLock(const std::filesystem::path& projectFolder, const ProjectLockHolder& self) {
  auto guard = AccountLock::acquire(guardPath(projectFolder), kGuardTimeout);
  if (!guard) {
    return {ProjectLockOutcome::Failed, std::nullopt, "The project folder could not be locked."};
  }
  return writeHolder(projectFolder, self);
}

void releaseProjectLock(const std::filesystem::path& projectFolder, const ProjectLockHolder& self) {
  auto guard = AccountLock::acquire(guardPath(projectFolder), kGuardTimeout);
  if (!guard) {
    return;
  }
  const auto path = projectLockPath(projectFolder);
  if (readHolder(path) == std::optional<ProjectLockHolder>(self)) {
    std::error_code ec;
    std::filesystem::remove(path, ec);
  }
}

ProjectLocks::ProjectLocks(std::string app, ProcessStartTime startTimeOf)
    : app_(std::move(app)), startTimeOf_(std::move(startTimeOf)), process_(currentProcessHolder(app_, "")) {}

ProjectLocks::~ProjectLocks() {
  std::lock_guard lock(mutex_);
  for (const auto& [key, held] : counts_) {
    releaseProjectLock(key.first, self(key.second));
  }
}

ProjectLockHolder ProjectLocks::self(std::string_view projectId) const {
  ProjectLockHolder holder = process_;
  holder.projectId = std::string(projectId);
  return holder;
}

ProjectLocks::Key ProjectLocks::key(const std::filesystem::path& projectFolder, std::string_view projectId) {
  std::error_code ec;
  auto normal = std::filesystem::weakly_canonical(projectFolder, ec);
  if (ec) {
    normal = projectFolder.lexically_normal();
  }
  return {normal.string(), std::string(projectId)};
}

ProjectLockResult ProjectLocks::count(const Key& key, ProjectLockResult result) {
  if (result.outcome == ProjectLockOutcome::Acquired) {
    ++counts_[key];
  }
  return result;
}

ProjectLockResult ProjectLocks::acquire(const std::filesystem::path& projectFolder, std::string_view projectId) {
  const auto k = key(projectFolder, projectId);
  std::lock_guard lock(mutex_);
  return count(k, acquireProjectLock(k.first, self(projectId), startTimeOf_));
}

ProjectLockResult ProjectLocks::takeOver(const std::filesystem::path& projectFolder, std::string_view projectId) {
  const auto k = key(projectFolder, projectId);
  std::lock_guard lock(mutex_);
  return count(k, takeOverProjectLock(k.first, self(projectId)));
}

void ProjectLocks::release(const std::filesystem::path& projectFolder, std::string_view projectId) {
  const auto k = key(projectFolder, projectId);
  std::lock_guard lock(mutex_);
  const auto it = counts_.find(k);
  if (it == counts_.end()) {
    return;
  }
  if (--it->second == 0) {
    counts_.erase(it);
    releaseProjectLock(k.first, self(projectId));
  }
}

} // namespace nodetool::account
