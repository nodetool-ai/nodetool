#include "host/platform_fs.h"
#include "host/asset_destinations.h"

#include "host/assets.h"
#include "host/unique_fd.h"

#include <algorithm>
#include <optional>
#include <cerrno>
#include <exception>
#include <fcntl.h>
#include <stdexcept>
#include <utility>

using nodetool::jobs::JobDelivery;
using nodetool::jobs::JobExecutor;
using nodetool::jobs::JobOutcome;
using nodetool::jobs::NativeJob;

namespace gr::host {
namespace {

// Bytes written between two stop checks.
constexpr size_t kWriteChunk = size_t(1) << 20;

std::string leafOf(const std::string& path) { return path.substr(path.rfind('/') + 1); }

void checkKey(const std::string& key) {
  if (key.empty() || key[0] == '/' || key.find('\\') != std::string::npos || key.find('\0') != std::string::npos) {
    throw std::invalid_argument("Invalid storage key: " + key);
  }
  size_t i = 0;
  while (i <= key.size()) {
    size_t j = key.find('/', i);
    if (j == std::string::npos) j = key.size();
    if (j - i == 2 && key.compare(i, 2, "..") == 0) throw std::invalid_argument("Invalid storage key: " + key);
    i = j + 1;
  }
}

const std::string& rootDir(const std::vector<Root>& roots) { return roots.front().dir; }

// The components of `destination` below the asset directory: every
// directory, then the leaf.
std::vector<std::string> components(const std::vector<Root>& roots, const std::string& destination) {
  std::vector<std::string> parts;
  const std::string relative = destination.substr(rootDir(roots).size() + 1);
  size_t i = 0;
  while (i <= relative.size()) {
    size_t j = relative.find('/', i);
    if (j == std::string::npos) j = relative.size();
    if (j > i) parts.push_back(relative.substr(i, j - i));
    i = j + 1;
  }
  return parts;
}

// Opens one directory relative to `dir` without following a symlink.
int openBelow(int dir, const std::string& name) {
  return fsapi::openat(dir, name.c_str(), O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
}

// Reports a failed openBelow(dir, name). Linux reports a symlink opened
// with O_DIRECTORY | O_NOFOLLOW as ENOTDIR, so the entry's type decides.
[[noreturn]] void refuse(int err, int dir, const std::string& name, const std::string& syscall,
                         const std::string& key) {
  fsapi::FileStat st {};
  if (err == ELOOP ||
      (err == ENOTDIR && fsapi::fstatat(dir, name.c_str(), &st, AT_SYMLINK_NOFOLLOW) == 0 && S_ISLNK(st.st_mode))) {
    throw FsError("EACCES", syscall, key, "symbolic links are refused here");
  }
  throwErrno(err, syscall, key);
}

// The directory holding the destination's leaf, acquired from the asset
// directory one component at a time relative to the descriptor before it,
// never following a symlink. With `create`, missing directories are made
// relative to their parent's descriptor. Throws FsError: EACCES for a
// symlink on the way, ENOENT for a missing directory without `create`.
UniqueFd acquireParent(const std::vector<Root>& roots, const std::string& key, const std::string& destination,
                       bool create, const std::string& syscall) {
  UniqueFd dir(fsapi::open(rootDir(roots).c_str(), O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC));
  if (!dir) throwErrno(errno, syscall, key);
  const std::vector<std::string> parts = components(roots, destination);
  for (size_t i = 0; i + 1 < parts.size(); ++i) {
    int fd = openBelow(dir.get(), parts[i]);
    if (fd < 0 && errno == ENOENT && create) {
      if (fsapi::mkdirat(dir.get(), parts[i].c_str(), 0755) != 0 && errno != EEXIST) throwErrno(errno, "mkdir", key);
      fd = openBelow(dir.get(), parts[i]);
    }
    if (fd < 0) refuse(errno, dir.get(), parts[i], syscall, key);
    dir = UniqueFd(fd);
  }
  return dir;
}

void hook(const AssetJobHooks& hooks, std::string_view point) {
  if (hooks.at) hooks.at(point);
}

// One write's parent directory, held open from staging to completion, and
// the temporary file the write created there.
//
// Thread affinity: one thread at a time: the lane thread that stages it,
// then the thread that runs its commit step.
//
// Ownership: uniquely owned by its write job, then by its commit step. The
// destructor unlinks the temporary file when it was not renamed, through
// the held descriptor, so it never removes another operation's file.
class StagedWrite {
public:
  StagedWrite() = default;
  StagedWrite(const StagedWrite&) = delete;
  StagedWrite& operator=(const StagedWrite&) = delete;
  ~StagedWrite() { discard(); }

  // Acquires the destination's parent, creating missing directories, and
  // writes `bytes` to a new exclusive temporary file relative to it.
  // Returns false, with the file removed, when `stop` was requested between
  // chunks. Throws FsError.
  bool stage(const std::vector<Root>& roots, const std::string& key, const std::string& destination,
             const std::vector<uint8_t>& bytes, const std::stop_token& stop, const AssetJobHooks& hooks) {
    parent_ = acquireParent(roots, key, destination, /*create=*/true, "open");
    fsapi::FileStat st {};
    if (fsapi::fstat(parent_.get(), &st) != 0) throwErrno(errno, "fstat", key);
    device_ = st.st_dev;
    inode_ = st.st_ino;
    leaf_ = leafOf(destination);
    hook(hooks, "write:acquired");

    UniqueFd file;
    for (int attempt = 0; !file; ++attempt) {
      std::string name =
          leaf_ + ".tmp-" + std::to_string(fsapi::getpid()) + "-" + std::to_string(tempSequence().fetch_add(1));
      file = UniqueFd(fsapi::openat(parent_.get(), name.c_str(), O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC,
                               0644));
      if (file) {
        temporary_ = std::move(name);
      } else if (errno != EEXIST || attempt >= 100) {
        throwErrno(errno, "open", key);
      }
    }
    size_t offset = 0;
    while (offset < bytes.size()) {
      if (stop.stop_requested()) {
        discard();
        return false;
      }
      const size_t chunk = std::min(kWriteChunk, bytes.size() - offset);
      const fsapi::Count n = fsapi::write(file.get(), bytes.data() + offset, chunk);
      if (n < 0) {
        if (errno == EINTR) continue;
        throwErrno(errno, "write", key);
      }
      offset += size_t(n);
    }
    if (const int err = file.close(); err != 0) throwErrno(err, "close", key);
    hook(hooks, "write:staged");
    return true;
  }

  // Acquires the destination's parent again from the asset directory,
  // checks that it is the directory this write holds, and renames the
  // temporary file over the destination relative to the held descriptor.
  // Throws FsError, leaving the temporary file for discard().
  void commit(const std::vector<Root>& roots, const std::string& key, const std::string& destination,
              const AssetJobHooks& hooks) {
    const UniqueFd now = acquireParent(roots, key, destination, /*create=*/false, "rename");
    fsapi::FileStat st {};
    if (fsapi::fstat(now.get(), &st) != 0) throwErrno(errno, "fstat", key);
    if (st.st_dev != device_ || st.st_ino != inode_) {
      throw FsError("EACCES", "rename", key, "the destination directory was replaced or moved");
    }
    hook(hooks, "commit:validated");
    if (fsapi::renameat(parent_.get(), temporary_.c_str(), parent_.get(), leaf_.c_str()) != 0) {
      throwErrno(errno, "rename", key);
    }
    temporary_.clear();
  }

  // Unlinks this write's temporary file, if it still has one.
  void discard() {
    if (temporary_.empty()) return;
    fsapi::unlinkat(parent_.get(), temporary_.c_str(), 0);
    temporary_.clear();
  }

private:
  UniqueFd parent_;
  fsapi::Device device_ = 0;
  fsapi::Inode inode_ = 0;
  std::string leaf_;
  // Empty once renamed or unlinked.
  std::string temporary_;
};

// What a step needs from its job: the roots, the key and its destination.
// Plain immutable data, owned by value by the job and then by its step.
struct Target {
  std::vector<Root> roots;
  std::string key;
  std::string destination;
  AssetJobHooks hooks;
};

// Removes the destination of `target`, a regular file, relative to its
// parent acquired without following a symlink. False when there was none.
bool removeTarget(const Target& target) {
  UniqueFd parent;
  try {
    parent = acquireParent(target.roots, target.key, target.destination, /*create=*/false, "unlink");
  } catch (const FsError& e) {
    if (e.code == "ENOENT") return false;
    throw;
  }
  hook(target.hooks, "remove:acquired");
  const std::string leaf = leafOf(target.destination);
  fsapi::FileStat st {};
  if (fsapi::fstatat(parent.get(), leaf.c_str(), &st, AT_SYMLINK_NOFOLLOW) != 0 || !S_ISREG(st.st_mode)) return false;
  if (fsapi::unlinkat(parent.get(), leaf.c_str(), 0) != 0) throwErrno(errno, "unlink", target.key);
  return true;
}

bool stopped(const std::stop_token& lane, const JobDelivery& delivery) {
  return lane.stop_requested() || delivery.runStop().stop_requested();
}

// A write's commit, run by the destination queue in ticket order.
//
// Thread affinity: the thread the queue runs it on. Ownership: unique, held
// by the queue until it runs.
class CommitStep final : public DestinationStep {
public:
  CommitStep(Target target, std::unique_ptr<StagedWrite> staged, JobDelivery delivery, std::stop_token lane)
      : target_(std::move(target)), staged_(std::move(staged)), delivery_(std::move(delivery)),
        lane_(std::move(lane)) {}

  void run() noexcept override {
    JobOutcome outcome;
    if (stopped(lane_, delivery_)) {
      staged_->discard();
      outcome = JobOutcome{JobOutcome::Kind::Stopped, nullptr, "The asset write was cancelled before its commit"};
    } else {
      try {
        staged_->commit(target_.roots, target_.key, target_.destination, target_.hooks);
        outcome = JobOutcome::value(nullptr);
      } catch (const std::exception& e) {
        staged_->discard();
        outcome = JobOutcome::failure(e.what());
      }
    }
    // The parent stays open until the result is on its way.
    delivery_.deliver(std::move(outcome));
    staged_.reset();
  }

private:
  Target target_;
  std::unique_ptr<StagedWrite> staged_;
  JobDelivery delivery_;
  std::stop_token lane_;
};

// A removal, run by the destination queue in ticket order.
//
// Thread affinity and ownership: as CommitStep.
class RemoveStep final : public DestinationStep {
public:
  RemoveStep(Target target, JobDelivery delivery, std::stop_token lane)
      : target_(std::move(target)), delivery_(std::move(delivery)), lane_(std::move(lane)) {}

  void run() noexcept override {
    JobOutcome outcome;
    if (stopped(lane_, delivery_)) {
      outcome = JobOutcome{JobOutcome::Kind::Stopped, nullptr, "The asset removal was cancelled"};
    } else {
      try {
        outcome = JobOutcome::value(std::make_unique<AssetRemoved>(removeTarget(target_)));
      } catch (const std::exception& e) {
        outcome = JobOutcome::failure(e.what());
      }
    }
    delivery_.deliver(std::move(outcome));
  }

private:
  Target target_;
  JobDelivery delivery_;
  std::stop_token lane_;
};

// Thread affinity: created on the worker, then run and destroyed on the I/O
// lane (or on the worker in inline mode). Ownership: unique, through its
// SubmittedJob. Its ticket leaves the line when the job is destroyed
// without handing a step.
class AssetWriteJob final : public NativeJob {
public:
  AssetWriteJob(DestinationQueue& queue, JobExecutor& commits, Target target, std::vector<uint8_t> bytes)
      : target_(std::move(target)), bytes_(std::move(bytes)), ticket_(queue.enqueue(target_.destination, commits)) {}

  // The bytes it holds until they are staged. The result has no payload.
  nodetool::jobs::JobCost cost() const override {
    return {bytes_.size() + target_.key.size() + target_.destination.size(), 0, 0};
  }

  JobOutcome run(std::stop_token) override { return JobOutcome::failure("an asset write runs through start()"); }

  std::optional<JobOutcome> start(std::stop_token stop, JobDelivery& delivery) override {
    if (stop.stop_requested()) return JobOutcome::stopped();
    auto staged = std::make_unique<StagedWrite>();
    // A failure or stop here destroys `staged`, which unlinks its own
    // temporary file, and the job's destruction abandons the ticket.
    if (!staged->stage(target_.roots, target_.key, target_.destination, bytes_, stop, target_.hooks)) {
      return JobOutcome::stopped();
    }
    bytes_ = {};
    ticket_.ready(std::make_unique<CommitStep>(std::move(target_), std::move(staged), std::move(delivery),
                                               std::move(stop)));
    return std::nullopt;
  }

private:
  Target target_;
  std::vector<uint8_t> bytes_;
  DestinationQueue::Ticket ticket_;
};

// Thread affinity and ownership: as AssetWriteJob.
class AssetRemoveJob final : public NativeJob {
public:
  AssetRemoveJob(DestinationQueue& queue, JobExecutor& commits, Target target)
      : target_(std::move(target)), ticket_(queue.enqueue(target_.destination, commits)) {}

  nodetool::jobs::JobCost cost() const override { return {target_.key.size() + target_.destination.size(), 0, 0}; }

  JobOutcome run(std::stop_token) override { return JobOutcome::failure("an asset removal runs through start()"); }

  std::optional<JobOutcome> start(std::stop_token stop, JobDelivery& delivery) override {
    if (stop.stop_requested()) return JobOutcome::stopped();
    ticket_.ready(std::make_unique<RemoveStep>(std::move(target_), std::move(delivery), std::move(stop)));
    return std::nullopt;
  }

private:
  Target target_;
  DestinationQueue::Ticket ticket_;
};

Target target(std::vector<Root> roots, std::string key, AssetJobHooks hooks) {
  std::string destination = assetDestination(roots, key);
  return Target{std::move(roots), std::move(key), std::move(destination), std::move(hooks)};
}

// What a synchronous step reports to its caller.
//
// Thread affinity: written by the step and read by the caller, on the
// caller's thread, which runs the step. Shared with the step.
struct NowResult {
  std::optional<std::string> error;
  bool removed = false;
};

// A synchronous write's commit, or removal, run on the calling thread.
//
// Thread affinity: that thread. Ownership: unique, handed to
// Ticket::runHere(), which runs and destroys it there.
class NowStep final : public DestinationStep {
public:
  NowStep(Target target, std::unique_ptr<StagedWrite> staged, std::shared_ptr<NowResult> result)
      : target_(std::move(target)), staged_(std::move(staged)), result_(std::move(result)) {}

  void run() noexcept override {
    try {
      if (staged_) {
        staged_->commit(target_.roots, target_.key, target_.destination, target_.hooks);
      } else {
        result_->removed = removeTarget(target_);
      }
    } catch (const std::exception& e) {
      if (staged_) staged_->discard();
      result_->error = e.what();
    }
    staged_.reset();
  }

private:
  Target target_;
  // Null for a removal.
  std::unique_ptr<StagedWrite> staged_;
  std::shared_ptr<NowResult> result_;
};

// Takes the destination's place only when its line is empty, stages a
// write of `bytes` when `bytes` is given, and runs the step on this thread.
// A line with a queued or active place fails at once with EBUSY.
bool runNow(DestinationQueue& queue, Target t, const std::vector<uint8_t>* bytes, const char* syscall) {
  std::optional<DestinationQueue::Ticket> ticket = queue.enqueueIfIdle(t.destination);
  if (!ticket) throw FsError("EBUSY", syscall, t.key, "an asynchronous operation on this asset is pending");
  std::unique_ptr<StagedWrite> staged;
  if (bytes) {
    staged = std::make_unique<StagedWrite>();
    // A failure here destroys `staged`, which removes its own temporary
    // file, and the ticket leaves the line.
    staged->stage(t.roots, t.key, t.destination, *bytes, std::stop_token{}, t.hooks);
  }
  auto result = std::make_shared<NowResult>();
  // The place is the line's head from the start: claimed under the queue
  // mutex and run here, so no other thread runs it.
  ticket->runHere(std::make_unique<NowStep>(std::move(t), std::move(staged), result));
  if (result->error) throw std::runtime_error(*result->error);
  return result->removed;
}

}  // namespace

std::string assetDestination(const std::vector<Root>& roots, const std::string& key) {
  if (roots.empty()) throw FsError("EACCES", "open", key, "the native runner has no asset directory");
  if (!roots.front().writable) throw FsError("EACCES", "open", key, "read-only directory");
  checkKey(key);
  return lexicalNormalize(rootDir(roots) + "/" + key);
}

void writeAssetNow(DestinationQueue& queue, std::vector<Root> roots, std::string key, const std::vector<uint8_t>& bytes,
                   AssetJobHooks hooks) {
  runNow(queue, target(std::move(roots), std::move(key), std::move(hooks)), &bytes, "open");
}

bool removeAssetNow(DestinationQueue& queue, std::vector<Root> roots, std::string key, AssetJobHooks hooks) {
  return runNow(queue, target(std::move(roots), std::move(key), std::move(hooks)), nullptr, "unlink");
}

std::unique_ptr<NativeJob> makeAssetWriteJob(DestinationQueue& queue, JobExecutor& commits, std::vector<Root> roots,
                                             std::string key, std::vector<uint8_t> bytes, AssetJobHooks hooks) {
  return std::make_unique<AssetWriteJob>(queue, commits, target(std::move(roots), std::move(key), std::move(hooks)),
                                         std::move(bytes));
}

std::unique_ptr<NativeJob> makeAssetRemoveJob(DestinationQueue& queue, JobExecutor& commits, std::vector<Root> roots,
                                              std::string key, AssetJobHooks hooks) {
  return std::make_unique<AssetRemoveJob>(queue, commits,
                                          target(std::move(roots), std::move(key), std::move(hooks)));
}

}  // namespace gr::host
