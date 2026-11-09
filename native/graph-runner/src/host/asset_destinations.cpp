#include "host/asset_destinations.h"

#include "host/assets.h"

#include <algorithm>
#include <cerrno>
#include <exception>
#include <fcntl.h>
#include <stdexcept>
#include <sys/stat.h>
#include <unistd.h>
#include <utility>

namespace gr::host {
namespace {

// Bytes written between two stop checks.
constexpr size_t kWriteChunk = size_t(1) << 20;

// An owned file descriptor, closed by the destructor.
//
// Thread affinity: none, one thread at a time. Ownership: unique, move-only.
class UniqueFd {
public:
  UniqueFd() = default;
  explicit UniqueFd(int fd) : fd_(fd) {}
  UniqueFd(UniqueFd&& other) noexcept : fd_(std::exchange(other.fd_, -1)) {}
  UniqueFd& operator=(UniqueFd&& other) noexcept {
    if (this != &other) {
      reset();
      fd_ = std::exchange(other.fd_, -1);
    }
    return *this;
  }
  UniqueFd(const UniqueFd&) = delete;
  UniqueFd& operator=(const UniqueFd&) = delete;
  ~UniqueFd() { reset(); }

  int get() const { return fd_; }
  explicit operator bool() const { return fd_ >= 0; }
  void reset() {
    if (fd_ >= 0) ::close(std::exchange(fd_, -1));
  }
  // Closes now and returns close()'s errno, or 0.
  int close() {
    if (fd_ < 0) return 0;
    return ::close(std::exchange(fd_, -1)) == 0 ? 0 : errno;
  }

private:
  int fd_ = -1;
};

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
  return ::openat(dir, name.c_str(), O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
}

// Reports a failed openBelow(dir, name). Linux reports a symlink opened
// with O_DIRECTORY | O_NOFOLLOW as ENOTDIR, so the entry's type decides.
[[noreturn]] void refuse(int err, int dir, const std::string& name, const std::string& syscall,
                         const std::string& key) {
  struct stat st {};
  if (err == ELOOP ||
      (err == ENOTDIR && ::fstatat(dir, name.c_str(), &st, AT_SYMLINK_NOFOLLOW) == 0 && S_ISLNK(st.st_mode))) {
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
  UniqueFd dir(::open(rootDir(roots).c_str(), O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC));
  if (!dir) throwErrno(errno, syscall, key);
  const std::vector<std::string> parts = components(roots, destination);
  for (size_t i = 0; i + 1 < parts.size(); ++i) {
    int fd = openBelow(dir.get(), parts[i]);
    if (fd < 0 && errno == ENOENT && create) {
      if (::mkdirat(dir.get(), parts[i].c_str(), 0755) != 0 && errno != EEXIST) throwErrno(errno, "mkdir", key);
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
    struct stat st {};
    if (::fstat(parent_.get(), &st) != 0) throwErrno(errno, "fstat", key);
    device_ = st.st_dev;
    inode_ = st.st_ino;
    leaf_ = leafOf(destination);
    hook(hooks, "write:acquired");

    UniqueFd file;
    for (int attempt = 0; !file; ++attempt) {
      std::string name =
          leaf_ + ".tmp-" + std::to_string(::getpid()) + "-" + std::to_string(tempSequence().fetch_add(1));
      file = UniqueFd(::openat(parent_.get(), name.c_str(), O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC,
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
      const ssize_t n = ::write(file.get(), bytes.data() + offset, chunk);
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
    struct stat st {};
    if (::fstat(now.get(), &st) != 0) throwErrno(errno, "fstat", key);
    if (st.st_dev != device_ || st.st_ino != inode_) {
      throw FsError("EACCES", "rename", key, "the destination directory was replaced or moved");
    }
    hook(hooks, "commit:validated");
    if (::renameat(parent_.get(), temporary_.c_str(), parent_.get(), leaf_.c_str()) != 0) {
      throwErrno(errno, "rename", key);
    }
    temporary_.clear();
  }

  // Unlinks this write's temporary file, if it still has one.
  void discard() {
    if (temporary_.empty()) return;
    ::unlinkat(parent_.get(), temporary_.c_str(), 0);
    temporary_.clear();
  }

private:
  UniqueFd parent_;
  dev_t device_ = 0;
  ino_t inode_ = 0;
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
        outcome = JobOutcome::value(std::make_unique<AssetRemoved>(remove()));
      } catch (const std::exception& e) {
        outcome = JobOutcome::failure(e.what());
      }
    }
    delivery_.deliver(std::move(outcome));
  }

private:
  bool remove() const {
    UniqueFd parent;
    try {
      parent = acquireParent(target_.roots, target_.key, target_.destination, /*create=*/false, "unlink");
    } catch (const FsError& e) {
      if (e.code == "ENOENT") return false;
      throw;
    }
    hook(target_.hooks, "remove:acquired");
    const std::string leaf = leafOf(target_.destination);
    struct stat st {};
    if (::fstatat(parent.get(), leaf.c_str(), &st, AT_SYMLINK_NOFOLLOW) != 0 || !S_ISREG(st.st_mode)) return false;
    if (::unlinkat(parent.get(), leaf.c_str(), 0) != 0) throwErrno(errno, "unlink", target_.key);
    return true;
  }

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

}  // namespace

std::string assetDestination(const std::vector<Root>& roots, const std::string& key) {
  if (roots.empty()) throw FsError("EACCES", "open", key, "the native runner has no asset directory");
  if (!roots.front().writable) throw FsError("EACCES", "open", key, "read-only directory");
  checkKey(key);
  return lexicalNormalize(rootDir(roots) + "/" + key);
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
