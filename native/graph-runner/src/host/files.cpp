#include "host/platform_fs.h"
// `__host.files`: file access for node code, confined to the directories the
// embedder grants (HostOptions::workspaceDir read-write, readRoots
// read-only). guest/host/fs.mjs builds node:fs on it, and the guest
// workspace (context.workspace) uses it too. Relative paths resolve against
// the workspace, the run's working directory.
//
// Synchronous, for node:fs *Sync and for promise calls outside a run:
//
//   cwd()                            -> workspace directory, or ""
//   readFile(path)                   -> Uint8Array
//   writeFile(path, bytes, append)
//   stat(path, follow)               -> json {kind, size, mtimeMs, ctimeMs, birthtimeMs, mode}
//   readdir(path)                    -> json [[name, kind], ...], sorted by name
//   mkdir(path, recursive)           -> first directory created, or undefined
//   mkdtemp(prefix)                  -> private directory with a unique suffix
//   rm(path, recursive, force)       removes a file, or a directory with recursive
//   rmdir(path)                      removes an empty directory
//   rename(from, to) / copyFile(from, to)
//   realpath(path)                   -> canonical path
//   openRead(path, 'r'), readHandle(handle, length, pos), closeHandle(handle)
//                                    file handles on the worker, for
//                                    fs.promises.open outside a run
//
// Asynchronous, for node:fs/promises while a run is bound
// (docs/plans/graph-runner-async-host.md, sections 4.7 and 4.8). Each
// returns a promise and runs on the run's I/O lane:
//
//   bound()                          -> whether a run is bound, so the *Async
//                                       functions can be used
//   readFileAsync(path), writeFileAsync(path, bytes, append),
//   statAsync(path, follow), readdirAsync(path), mkdirAsync(path, recursive),
//   mkdtempAsync(prefix), rmAsync(path, recursive, force), rmdirAsync(path),
//   unlinkAsync(path), renameAsync(from, to), copyFileAsync(from, to),
//   realpathAsync(path)              as their synchronous forms
//   openReadAsync(path, 'r')         -> opaque owner-scoped file handle
//   readHandleAsync(handle, length, pos) -> Uint8Array, null pos uses cursor
//   closeHandleAsync(handle)         closes after the reads already accepted
//
// A file handle is a ResourceControl (src/kernel/resource_control.h) that
// owns the descriptor: reads run one at a time in call order, close is a
// terminal barrier behind them, and run cleanup aborts every handle of the
// run. The descriptor is closed by the close operation or, after abort, when
// the lane's reaper destroys the handle's body.
//
// Errors are Node fs errors ("ENOENT: no such file or directory, open 'x'").
// A path outside the grants is EACCES.
#include "host/capabilities.h"
#include "host/file_jobs.h"
#include "host/files.h"
#include "host/paths.h"
#include "host/unique_fd.h"
#include "kernel/async_jobs.h"
#include "kernel/job_inputs.h"
#include "nodetool/jobs/resource_control.h"

#include <nlohmann/json.hpp>

#include <algorithm>
#include <array>
#include <cerrno>
#include <cmath>
#include <cstdint>
#include <climits>
#include <cstdlib>
#include <cstring>
#include <fcntl.h>
#include <filesystem>
#include <memory>
#include <limits>
#include <optional>
#ifdef __linux__
#include <sys/syscall.h>
#endif

using nodetool::jobs::JobCost;
using nodetool::jobs::JobExecutor;
using nodetool::jobs::JobOutcome;
using nodetool::jobs::ResourceBody;
using nodetool::jobs::ResourceControl;
using nodetool::jobs::ResourceOperation;

namespace gr::host {
namespace {

using Args = const std::vector<js::Value>&;

constexpr size_t kMaxHandleReadBytes = size_t(16) << 20;
constexpr size_t kMaxReadHandles = 64;
constexpr double kMaxSafeInteger = 9007199254740991.0;
// The buffer a streaming copy moves bytes through.
constexpr size_t kCopyChunk = size_t(256) << 10;
// Bytes an asynchronous write hands to write() between two stop checks.
constexpr size_t kWriteChunk = size_t(1) << 20;
// The deepest tree a recursive removal descends: it holds one directory
// descriptor per level.
constexpr size_t kMaxRemoveDepth = 128;

// One directory a recursive removal holds open while it works below it:
// the descriptor every entry operation is relative to, and the directory's
// name in its parent, for the final unlinkat.
//
// Thread affinity: the thread running the removal.
struct RemoveLevel {
  UniqueFd fd;
  std::array<char, NAME_MAX + 1> name{};
};

// The entries of one directory, read from its start into storage this object
// owns, so enumeration allocates nothing the removal did not reserve. On
// Linux it reads with getdents64 into a fixed buffer. Elsewhere it reads up
// to kNames names through a directory stream on a duplicate descriptor,
// closed before read() returns; kStreamBytes bounds that stream's buffer.
//
// Thread affinity: the thread running the removal.
class DirBatch {
public:
#ifdef __linux__
  static constexpr uint64_t kStreamBytes = 0;
#else
  // An assumed bound for the platform's fsapi::Dir buffer. It is unverified on
  // macOS: no test here runs on it, and its libc does not document the size.
  static constexpr uint64_t kStreamBytes = 64 * 1024;
#endif

  // Reads entries of `fd` from its start, "." and ".." left out. Zero means
  // the directory is empty. Calls `atPeak` once, while every byte the read
  // allocated is still live. Throws FsError naming `path`.
  template <class F>
  size_t read(int fd, const std::string& path, F atPeak) {
    if (fsapi::lseek(fd, 0, SEEK_SET) < 0) throwErrno(errno, "rm", path);
    count_ = 0;
#ifdef __linux__
    const long n = ::syscall(SYS_getdents64, fd, buffer_.data(), buffer_.size());
    if (n < 0) throwErrno(errno, "rm", path);
    for (long at = 0; at < n;) {
      uint16_t length = 0;
      std::memcpy(&length, buffer_.data() + at + kLengthOffset, sizeof length);
      const char* name = buffer_.data() + at + kNameOffset;
      if (std::strcmp(name, ".") != 0 && std::strcmp(name, "..") != 0) offsets_[count_++] = uint16_t(at);
      at += length;
    }
    atPeak();
#else
    UniqueFd copy(fsapi::dup(fd));
    if (!copy) throwErrno(errno, "rm", path);
    auto stream = fsapi::fdopendir(copy.get());
    if (!stream) {
      const int err = errno;
      throwErrno(err, "rm", path);
    }
    copy.release();
    while (count_ < kNames) {
      fsapi::Entry* e = fsapi::readdir(stream.get());
      if (!e) break;
      if (std::strcmp(e->d_name, ".") == 0 || std::strcmp(e->d_name, "..") == 0) continue;
      std::strncpy(names_[count_].data(), e->d_name, NAME_MAX);
      types_[count_++] = e->d_type;
    }
    // The stream is still open.
    atPeak();
#endif
    return count_;
  }
  const char* name(size_t i) const {
#ifdef __linux__
    return buffer_.data() + offsets_[i] + kNameOffset;
#else
    return names_[i].data();
#endif
  }
  // DT_DIR, DT_UNKNOWN or another d_type.
  unsigned char type(size_t i) const {
#ifdef __linux__
    return static_cast<unsigned char>(buffer_[offsets_[i] + kTypeOffset]);
#else
    return types_[i];
#endif
  }

private:
#ifdef __linux__
  // struct linux_dirent64: d_ino (8), d_off (8), d_reclen (2), d_type (1),
  // then the name. Records are at least 24 bytes.
  static constexpr size_t kBuffer = 8 * 1024;
  static constexpr size_t kLengthOffset = 16;
  static constexpr size_t kTypeOffset = 18;
  static constexpr size_t kNameOffset = 19;
  alignas(8) std::array<char, kBuffer> buffer_{};
  std::array<uint16_t, kBuffer / 24> offsets_{};
#else
  static constexpr size_t kNames = 64;
  std::array<std::array<char, NAME_MAX + 1>, kNames> names_{};
  std::array<unsigned char, kNames> types_{};
#endif
  size_t count_ = 0;
};

// The memory a recursive removal holds at most, its reserved workspace: one
// level per directory of the deepest tree, one batch with its stream, and
// the target's parent path and leaf.
constexpr uint64_t kRemoveWorkspaceBytes = kMaxRemoveDepth * sizeof(RemoveLevel) + sizeof(DirBatch) +
                                           DirBatch::kStreamBytes + 2 * (PATH_MAX + 1);

// The engine's FileJobHooks, kept as host state until installFiles reads them.
constexpr const char* kHooksState = "gr.fileJobHooks";
struct HooksState final : js::NativePayload {
  explicit HooksState(FileJobHooks h) : hooks(std::move(h)) {}
  const FileJobHooks hooks;
};

size_t safeInteger(js::Engine &e, const js::Value &value, const char *name) {
  if (!e.isNumber(value))
    throw std::runtime_error(std::string(name) +
                             " must be a nonnegative safe integer");
  const double number = e.toNumber(value);
  if (!std::isfinite(number) || number < 0 || number > kMaxSafeInteger ||
      std::floor(number) != number) {
    throw std::runtime_error(std::string(name) +
                             " must be a nonnegative safe integer");
  }
  return static_cast<size_t>(number);
}

std::string kindOf(fsapi::Mode mode) {
  if (S_ISREG(mode)) return "file";
  if (S_ISDIR(mode)) return "directory";
  if (S_ISLNK(mode)) return "symlink";
  return "other";
}

double ms(const struct timespec& t) { return double(t.tv_sec) * 1000.0 + double(t.tv_nsec) / 1e6; }

#ifdef __APPLE__
const struct timespec& mtimeOf(const fsapi::FileStat& st) { return st.st_mtimespec; }
const struct timespec& ctimeOf(const fsapi::FileStat& st) { return st.st_ctimespec; }
#else
const struct timespec& mtimeOf(const fsapi::FileStat& st) { return st.st_mtim; }
const struct timespec& ctimeOf(const fsapi::FileStat& st) { return st.st_ctim; }
#endif

// write() retried on EINTR until every byte is written. Throws FsError.
void writeAll(int fd, const uint8_t* data, size_t size, const std::string& path) {
  size_t off = 0;
  while (off < size) {
    fsapi::Count n = fsapi::write(fd, data + off, size - off);
    if (n < 0) {
      if (errno == EINTR) continue;
      throwErrno(errno, "write", path);
    }
    off += size_t(n);
  }
}

// What the embedder granted: the confined roots and the working directory.
// Every operation is a const function of them.
//
// Thread affinity: thread-safe, because it is immutable after
// installFiles() built it. The synchronous host functions use it on the
// worker, and the jobs of the asynchronous ones on the I/O lane.
struct FileGrants {
  std::vector<Root> roots;
  std::string cwd;
  // Test seams. Production has none.
  FileJobHooks hooks;

  void hook(std::string_view point, uint64_t value) const {
    if (hooks.at) hooks.at(point, value);
  }

  Resolved resolve(const std::string& path, Access access, const std::string& syscall) const {
    return confine(roots, cwd, path, access, syscall);
  }

  OpenedFile openRead(const std::string& path) const {
    return openRegularFile(resolve(path, Access::Read, "open").real, path);
  }

  std::vector<uint8_t> readFile(const std::string& path) const {
    OpenedFile file = openRead(path);
    std::vector<uint8_t> out;
    out.reserve(size_t(file.size));
    uint8_t buf[65536];
    for (;;) {
      fsapi::Count n = fsapi::read(file.fd.get(), buf, sizeof buf);
      if (n < 0) {
        if (errno == EINTR) continue;
        throwErrno(errno, "read", path);
      }
      if (n == 0) break;
      out.insert(out.end(), buf, buf + n);
      if (out.size() > kMaxReadBytes) throw FsError("EFBIG", "read", path);
    }
    return out;
  }

  // Writes `data` in chunks of kWriteChunk, checking `stop` before each.
  // Returns false when it stopped: the file then holds the chunks written.
  bool writeFile(const std::string& path, const std::vector<uint8_t>& data, bool append,
                 const std::stop_token& stop = {}) const {
    Resolved r = resolve(path, Access::Write, "open");
    int flags = O_WRONLY | O_CREAT | O_NOFOLLOW | O_CLOEXEC | (append ? O_APPEND : O_TRUNC);
    UniqueFd f(fsapi::open(r.real.c_str(), flags, 0644));
    if (!f) throwErrno(errno, "open", path);
    fsapi::FileStat st {};
    if (fsapi::fstat(f.get(), &st) == 0 && st.st_nlink > 1) {
      throw FsError("EACCES", "open", path, "hard-linked file");
    }
    size_t written = 0;
    while (written < data.size()) {
      if (stop.stop_requested()) return false;
      const size_t chunk = std::min(kWriteChunk, data.size() - written);
      writeAll(f.get(), data.data() + written, chunk, path);
      written += chunk;
      hook("write:chunk", written);
    }
    return true;
  }

  nlohmann::json stat(const std::string& path, bool follow) const {
    const char* syscall = follow ? "stat" : "lstat";
    std::string target;
    if (follow) {
      target = resolve(path, Access::Read, syscall).real;
    } else {
      // lstat looks at the link itself: confine its parent, keep the leaf.
      Resolved parent = resolve(path, Access::Read, syscall);
      (void)parent;
      std::string absolute = std::filesystem::u8path(path).is_absolute() ? path : cwd + "/" + path;
      target = lexicalNormalize(absolute);
    }
    fsapi::FileStat st {};
    int rc = follow ? fsapi::stat(target.c_str(), &st) : fsapi::lstat(target.c_str(), &st);
    if (rc != 0) throwErrno(errno, syscall, path);
    return {{"kind", kindOf(st.st_mode)},
            {"size", double(st.st_size)},
            {"mode", int(st.st_mode)},
            {"mtimeMs", ms(mtimeOf(st))},
            {"ctimeMs", ms(ctimeOf(st))},
            {"birthtimeMs", ms(ctimeOf(st))}};
  }

  // `cap` bounds the JSON the listing may produce: the entries are counted
  // as they are read, so a larger directory fails before it is held.
  nlohmann::json readdir(const std::string& path, uint64_t cap = UINT64_MAX) const {
    Resolved r = resolve(path, Access::Read, "scandir");
    auto dir = fsapi::opendir(r.real.c_str());
    if (!dir) throwErrno(errno, "scandir", path);
    std::vector<std::pair<std::string, std::string>> entries;
    uint64_t bytes = 2;
    while (fsapi::Entry* e = fsapi::readdir(dir.get())) {
      std::string name = e->d_name;
      if (name == "." || name == "..") continue;
      fsapi::FileStat st {};
      std::string kind = "other";
      if (fsapi::fstatat(fsapi::dirfd(dir.get()), e->d_name, &st, AT_SYMLINK_NOFOLLOW) == 0) {
        kind = kindOf(st.st_mode);
      }
      // A name escapes to at most six bytes per byte, with quotes and kind.
      bytes += name.size() * 6 + kind.size() + 8;
      if (bytes > cap) throw FsError("EFBIG", "scandir", path, "the directory listing is too large");
      entries.emplace_back(name, kind);
    }
    std::sort(entries.begin(), entries.end());
    nlohmann::json out = nlohmann::json::array();
    for (auto& [name, kind] : entries) out.push_back({name, kind});
    return out;
  }

  std::optional<std::string> mkdir(const std::string& path, bool recursive) const {
    Resolved r = resolve(path, recursive ? Access::WriteAny : Access::Write, "mkdir");
    if (r.exists) {
      fsapi::FileStat st {};
      if (recursive && fsapi::stat(r.real.c_str(), &st) == 0 && S_ISDIR(st.st_mode)) return std::nullopt;
      throw FsError("EEXIST", "mkdir", path);
    }
    // Create each missing component below the existing ancestor.
    std::optional<std::string> first;
    std::string current;
    size_t i = std::filesystem::u8path(r.real).root_path().generic_string().size() - 1;
    const std::string& target = r.real;
    while (i < target.size()) {
      size_t j = target.find('/', i + 1);
      if (j == std::string::npos) j = target.size();
      current = target.substr(0, j);
      i = j;
      fsapi::FileStat st {};
      if (fsapi::lstat(current.c_str(), &st) == 0) {
        if (!S_ISDIR(st.st_mode)) throw FsError(S_ISLNK(st.st_mode) ? "EACCES" : "ENOTDIR", "mkdir", path);
        continue;
      }
      if (fsapi::mkdir(current.c_str(), 0755) != 0 && errno != EEXIST) throwErrno(errno, "mkdir", path);
      if (!first) first = current;
    }
    return first;
  }

  std::string mkdtemp(const std::string& prefix) const {
    if (prefix.find('\0') != std::string::npos) throw FsError("EINVAL", "mkdtemp", prefix);
    const auto candidate = std::filesystem::u8path(prefix + "XXXXXX");
    const auto parent = candidate.parent_path();
    const auto parentUtf8 = parent.generic_u8string();
    const auto resolved = resolve(parent.empty() ? "." : std::string(parentUtf8.begin(), parentUtf8.end()), Access::Write, "mkdtemp");
    // Only the parent is resolved. A literal prefixXXXXXX entry is not the
    // directory libc will create and must not redirect or deny this operation.
    const auto patternUtf8 = (std::filesystem::u8path(resolved.real) / candidate.filename()).generic_u8string();
    std::string pattern(patternUtf8.begin(), patternUtf8.end());
    if (!fsapi::mkdtemp(pattern.data())) throwErrno(errno, "mkdtemp", prefix);
    return pattern;
  }

  // Removes `real`, and everything below it when it is a directory, in
  // memory bounded by kRemoveWorkspaceBytes. Every operation inside the
  // tree is relative to a directory descriptor it holds: fstatat with
  // AT_SYMLINK_NOFOLLOW, unlinkat, and openat with O_NOFOLLOW | O_DIRECTORY
  // to descend, so an ancestor replaced by a symlink while it works is
  // never followed out of the tree. It never resolves a path of several
  // components inside the tree. It reads a batch from the current directory
  // (DirBatch), unlinks entries until it meets a directory, descends into
  // it, and reads the directory again from its start after each batch; an
  // empty directory is closed and removed from its parent. A tree deeper
  // than kMaxRemoveDepth fails with ENAMETOOLONG. Only `real` itself, the
  // confined target, is reached by path, as every confined operation is
  // (host/paths.h). Checks `stop` before each batch and each entry and
  // returns false when it stopped, with part of the tree removed.
  bool removeTree(const std::string& real, const std::string& path, const std::stop_token& stop = {}) const {
    const size_t slash = real.rfind('/');
    const std::string leaf = real.substr(slash + 1);
    UniqueFd parent(fsapi::open(slash == 0 ? "/" : real.substr(0, slash).c_str(), O_RDONLY | O_DIRECTORY | O_CLOEXEC));
    if (!parent) throwErrno(errno, "rm", path);
    fsapi::FileStat st {};
    if (fsapi::fstatat(parent.get(), leaf.c_str(), &st, AT_SYMLINK_NOFOLLOW) != 0) throwErrno(errno, "rm", path);
    if (!S_ISDIR(st.st_mode)) {
      if (fsapi::unlinkat(parent.get(), leaf.c_str(), 0) != 0) throwErrno(errno, "rm", path);
      return true;
    }
    std::vector<RemoveLevel> levels;
    levels.reserve(kMaxRemoveDepth);
    auto batch = std::make_unique<DirBatch>();
    auto descend = [&](int at, const char* name) {
      if (levels.size() >= kMaxRemoveDepth) {
        throw FsError("ENAMETOOLONG", "rm", path,
                      "the tree is more than " + std::to_string(kMaxRemoveDepth) + " directories deep");
      }
      const int fd = fsapi::openat(at, name, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
      if (fd < 0) throwErrno(errno, "rm", path);
      RemoveLevel& level = levels.emplace_back();
      level.fd = UniqueFd(fd);
      std::strncpy(level.name.data(), name, NAME_MAX);
    };
    descend(parent.get(), leaf.c_str());
    while (!levels.empty()) {
      if (stop.stop_requested()) return false;
      const int dir = levels.back().fd.get();
      const size_t count = batch->read(dir, path, [&] {
        hook("rm:batch", levels.capacity() * sizeof(RemoveLevel) + sizeof(DirBatch) + DirBatch::kStreamBytes);
      });
      if (count == 0) {
        const RemoveLevel done = std::move(levels.back());
        levels.pop_back();
        const int at = levels.empty() ? parent.get() : levels.back().fd.get();
        if (fsapi::unlinkat(at, done.name.data(), AT_REMOVEDIR) != 0) throwErrno(errno, "rm", path);
        continue;
      }
      for (size_t i = 0; i < count; ++i) {
        if (stop.stop_requested()) return false;
        const char* name = batch->name(i);
        bool directory = batch->type(i) == DT_DIR;
        if (batch->type(i) == DT_UNKNOWN) {
          if (fsapi::fstatat(dir, name, &st, AT_SYMLINK_NOFOLLOW) != 0) {
            if (errno == ENOENT) continue;
            throwErrno(errno, "rm", path);
          }
          directory = S_ISDIR(st.st_mode);
        }
        if (directory) {
          // The rest of this batch is read again after the subtree.
          descend(dir, name);
          break;
        }
        if (fsapi::unlinkat(dir, name, 0) != 0 && errno != ENOENT) throwErrno(errno, "rm", path);
      }
    }
    return true;
  }

  // Returns false when `stop` ended a recursive removal part-way.
  bool rm(const std::string& path, bool recursive, bool force, const std::stop_token& stop = {}) const {
    Resolved r;
    try {
      r = resolve(path, Access::Write, "rm");
    } catch (const FsError& e) {
      if (force && e.code == "ENOENT") return true;
      throw;
    }
    if (!r.exists) {
      if (force) return true;
      throw FsError("ENOENT", "rm", path);
    }
    for (const auto& root : roots) {
      if (root.dir == r.real) throw FsError("EACCES", "rm", path, "a granted directory itself");
    }
    fsapi::FileStat st {};
    if (fsapi::lstat(r.real.c_str(), &st) != 0) throwErrno(errno, "rm", path);
    if (S_ISDIR(st.st_mode) && !recursive) {
      throw FsError("EISDIR", "rm", path);  // Node: ERR_FS_EISDIR
    }
    return removeTree(r.real, path, stop);
  }

  void rmdir(const std::string& path) const {
    Resolved r = resolve(path, Access::Write, "rmdir");
    if (!r.exists) throw FsError("ENOENT", "rmdir", path);
    for (const auto& root : roots) {
      if (root.dir == r.real) throw FsError("EACCES", "rmdir", path, "a granted directory itself");
    }
    if (fsapi::rmdir(r.real.c_str()) != 0) throwErrno(errno, "rmdir", path);
  }

  void unlink(const std::string& path) const {
    Resolved r = resolve(path, Access::Write, "unlink");
    if (!r.exists) throw FsError("ENOENT", "unlink", path);
    if (fsapi::unlink(r.real.c_str()) != 0) throwErrno(errno, "unlink", path);
  }

  void rename(const std::string& from, const std::string& to) const {
    Resolved a = resolve(from, Access::Write, "rename");
    if (!a.exists) throw FsError("ENOENT", "rename", from);
    Resolved b = resolve(to, Access::Write, "rename");
    if (fsapi::rename(a.real.c_str(), b.real.c_str()) != 0) throwErrno(errno, "rename", from);
  }

  void copyFile(const std::string& from, const std::string& to) const {
    writeFile(to, readFile(from), false);
  }

  // copyFile without holding the file: the source is checked as readFile
  // checks it, then copied through one kCopyChunk buffer, with a stop check
  // between chunks. A source and destination that are one file are left as
  // they are, as the synchronous copy leaves them. The destination is
  // truncated only after its own checks passed.
  // Returns false when `stop` ended the copy part-way.
  bool copyFileStreaming(const std::string& from, const std::string& to, const std::stop_token& stop) const {
    OpenedFile source = openRead(from);
    Resolved r = resolve(to, Access::Write, "open");
    UniqueFd target(fsapi::open(r.real.c_str(), O_WRONLY | O_CREAT | O_NOFOLLOW | O_CLOEXEC, 0644));
    if (!target) throwErrno(errno, "open", to);
    fsapi::FileStat in {}, out {};
    if (fsapi::fstat(source.fd.get(), &in) != 0) throwErrno(errno, "fstat", from);
    if (fsapi::fstat(target.get(), &out) != 0) throwErrno(errno, "fstat", to);
    if (in.st_dev == out.st_dev && in.st_ino == out.st_ino) return true;
    if (out.st_nlink > 1) throw FsError("EACCES", "open", to, "hard-linked file");
    if (fsapi::ftruncate(target.get(), 0) != 0) throwErrno(errno, "open", to);
    std::vector<uint8_t> chunk(kCopyChunk);
    uint64_t copied = 0;
    for (;;) {
      if (stop.stop_requested()) return false;
      fsapi::Count n = fsapi::read(source.fd.get(), chunk.data(), chunk.size());
      if (n < 0) {
        if (errno == EINTR) continue;
        throwErrno(errno, "read", from);
      }
      if (n == 0) break;
      copied += uint64_t(n);
      if (copied > kMaxReadBytes) throw FsError("EFBIG", "read", from);
      writeAll(target.get(), chunk.data(), size_t(n), to);
      hook("copy:chunk", copied);
    }
    return true;
  }
};

// The identity of one installFiles() call, which a handle names as its
// owner, so a handle from another install is refused. Holds nothing.
//
// Thread affinity: none, immutable. Ownership: shared by the install and its
// tokens, so an owner's address is never reused while a token names it.
struct HandleOwner {};

// A file handle's resource: the descriptor, owned by its ResourceControl.
//
// Thread affinity: the control's active operation, one at a time, then the
// lane reaper that destroys it, which closes the descriptor if no close
// operation did.
struct HandleBody final : ResourceBody {
  explicit HandleBody(UniqueFd f) : fd(std::move(f)) {}
  UniqueFd fd;
};

// What the guest holds for an open handle: an opaque native object.
//
// Thread affinity: worker only, like the engine that finalizes it.
// Ownership: shared by the JavaScript object (Engine::nativeObject) and the
// host functions that look it up during a call.
struct FileHandleToken final : js::NativePayload {
  // Shared with its queued operations and the lane, see ResourceControl.
  std::shared_ptr<ResourceControl> control;
  // Compared by identity only.
  std::shared_ptr<const HandleOwner> owner;
  std::string path;
  // Set when the guest called close. Later calls fail with EBADF at once.
  bool closing = false;
};

// One read of a handle: `length` bytes at `position`, or at the cursor.
//
// Thread affinity: the I/O lane thread that runs it, as the control's
// active operation.
class HandleRead final : public ResourceOperation {
public:
  HandleRead(std::shared_ptr<ResourceControl> control, size_t length, std::optional<fsapi::Offset> position,
             std::string path)
      : ResourceOperation(std::move(control)), length_(length), position_(position), path_(std::move(path)) {}

  JobCost cost() const override { return {path_.size(), length_, 0}; }

protected:
  JobOutcome apply(ResourceBody& body, nodetool::jobs::ResourceOperationContext& context) override {
    if (context.stop().stop_requested()) return JobOutcome::stopped();
    auto& handle = static_cast<HandleBody&>(body);
    if (!handle.fd) throw FsError("EBADF", "read", path_, "closed or foreign file handle");
    std::vector<uint8_t> bytes(length_);
    fsapi::Count count;
    do {
      count = position_ ? fsapi::pread(handle.fd.get(), bytes.data(), length_, *position_)
                        : fsapi::read(handle.fd.get(), bytes.data(), length_);
    } while (count < 0 && errno == EINTR);
    if (count < 0) throwErrno(errno, "read", path_);
    bytes.resize(static_cast<size_t>(count));
    return JobOutcome::value(std::make_unique<FileBytes>(std::move(bytes)));
  }

private:
  size_t length_;
  std::optional<fsapi::Offset> position_;
  std::string path_;
};

// Explicit close: the terminal operation, after every read accepted before
// it. Closes the descriptor whether or not a stop was requested.
//
// Thread affinity: as HandleRead.
class HandleClose final : public ResourceOperation {
public:
  explicit HandleClose(std::shared_ptr<ResourceControl> control) : ResourceOperation(std::move(control)) {}

protected:
  JobOutcome apply(ResourceBody& body, nodetool::jobs::ResourceOperationContext&) override {
    static_cast<HandleBody&>(body).fd.reset();
    return JobOutcome::value(nullptr);
  }
};

// A handle opened outside a run, for the synchronous handle functions. It
// owns its descriptor and is used only on the worker.
//
// Thread affinity: worker only. Ownership: shared by the JavaScript object
// (Engine::nativeObject) and a host function call that looks it up; the
// install's table holds it weakly.
struct SyncHandle final : js::NativePayload {
  std::shared_ptr<const HandleOwner> owner;
  UniqueFd fd;
  std::string path;
};

// The host functions' state for one install.
//
// Thread affinity: worker only. Jobs never reach it: they hold `grants`.
struct Files {
  // Shared with every job of the asynchronous functions, which may run
  // after this install is gone. Immutable.
  std::shared_ptr<const FileGrants> grants;
  // Compared by identity only.
  const std::shared_ptr<const HandleOwner> owner = std::make_shared<const HandleOwner>();
  // The handles this install opened. Weak: the guest's token and the
  // handle's own operations keep a handle alive.
  struct Entry {
    std::weak_ptr<ResourceControl> control;
    std::weak_ptr<FileHandleToken> token;
  };
  std::vector<Entry> handles;
  // The handles opened outside a run. Weak, as `handles`.
  std::vector<std::weak_ptr<SyncHandle>> syncHandles;

  // Handles that count against the quota: open, and not closing.
  size_t liveHandles() {
    std::erase_if(handles, [](const Entry& entry) {
      const auto control = entry.control.lock();
      return !control || control->state() == ResourceControl::State::Retired;
    });
    std::erase_if(syncHandles, [](const auto& weak) {
      const auto handle = weak.lock();
      return !handle || !handle->fd;
    });
    size_t live = syncHandles.size();
    for (const auto& entry : handles) {
      const auto control = entry.control.lock();
      const auto token = entry.token.lock();
      if (control && token && !token->closing && control->state() == ResourceControl::State::Open) ++live;
    }
    return live;
  }

  // Run cleanup: aborts every handle. Its queued reads and close reject with
  // an AbortError, its running read is asked to stop, and the lane's reaper
  // closes its descriptor once nothing uses it.
  void abortHandles() {
    for (const auto& entry : handles) {
      if (auto control = entry.control.lock()) control->abort("The file handle was closed at the end of the run");
      if (auto token = entry.token.lock()) token->closing = true;
    }
    handles.clear();
    for (const auto& weak : syncHandles) {
      if (auto handle = weak.lock()) handle->fd.reset();
    }
    syncHandles.clear();
  }

  std::shared_ptr<SyncHandle> syncHandle(js::Engine& e, const js::Value& value, const char* syscall) const {
    auto handle = std::dynamic_pointer_cast<SyncHandle>(e.nativePayload(value));
    if (!handle || handle->owner != owner || !handle->fd) {
      throw FsError("EBADF", syscall, "", "closed or foreign file handle");
    }
    return handle;
  }

  std::shared_ptr<FileHandleToken> handle(js::Engine& e, const js::Value& value, const char* syscall) const {
    auto token = std::dynamic_pointer_cast<FileHandleToken>(e.nativePayload(value));
    if (!token || token->owner != owner || token->closing ||
        token->control->state() != ResourceControl::State::Open) {
      throw FsError("EBADF", syscall, "", "closed or foreign file handle");
    }
    return token;
  }
};

std::string stringArg(js::Engine& en, Args a, size_t i) {
  return a.size() > i && !en.isUndefined(a[i]) && !en.isNull(a[i]) ? en.toString(a[i]) : std::string();
}

bool flagArg(js::Engine& en, Args a, size_t i) { return a.size() > i && en.toBoolean(a[i]); }

// What an asynchronous host function needs before it copies its arguments:
// the bound run and its I/O lane, and a reservation on the run.
//
// Thread affinity: worker only, for the length of one host function call.
struct Submission {
  AsyncRun& run;
  JobExecutor& io;
  nodetool::jobs::Reservation reservation;
};

Submission begin(const RunBinding& binding) {
  AsyncRun* run = binding.run();
  JobExecutor* io = binding.io();
  if (!run || !io) throw std::runtime_error("asynchronous file operations need a running graph");
  return Submission{*run, *io, run->reserve()};
}

// A path argument, copied into `reservation`.
std::string pathArg(js::Engine& en, Args a, size_t i, nodetool::jobs::Reservation& reservation,
                    const char* name = "path") {
  if (a.size() <= i || !en.isString(a[i])) throw std::invalid_argument(std::string(name) + " must be a string");
  return snapshotString(en, a[i], name, reservation);
}

// Converts a TextResult to a JavaScript string, or undefined without one.
ResultConverter textConverter() {
  return [](ResultConversion& conversion) -> js::Value {
    auto* text = dynamic_cast<TextResult*>(conversion.payload());
    if (!text) return conversion.engine().undefined();
    conversion.chargeCopy(text->text.size());
    return conversion.engine().string(text->text);
  };
}

JobOutcome text(std::string value) { return JobOutcome::value(std::make_unique<TextResult>(std::move(value))); }

}  // namespace

void setFileJobHooks(js::Engine& engine, FileJobHooks hooks) {
  engine.setHostState(kHooksState, std::make_shared<HooksState>(std::move(hooks)));
}

void installFiles(js::Engine& e, const js::Value& object, const HostOptions& options) {
  // Shared by every host function below, each of which captures it. The
  // engine holds the functions, so no single one of them can own it.
  auto files = std::make_shared<Files>();
  {
    auto grants = std::make_shared<FileGrants>();
    if (auto state = std::dynamic_pointer_cast<HooksState>(e.hostState(kHooksState))) grants->hooks = state->hooks;
    std::vector<std::pair<std::string, bool>> dirs;
    if (!options.workspaceDir.empty()) dirs.emplace_back(options.workspaceDir, true);
    if (!options.sqliteDirectory.empty()) dirs.emplace_back(options.sqliteDirectory, true);
    for (const auto& d : options.readRoots) dirs.emplace_back(d, false);
    grants->roots = canonicalRoots(dirs);
    if (!options.workspaceDir.empty()) {
      const auto workspaceRoots = canonicalRoots({{options.workspaceDir, true}});
      if (!workspaceRoots.empty()) grants->cwd = workspaceRoots.front().dir;
    }
    files->grants = std::move(grants);
  }
  // Shared with the engine's host state and every function that submits.
  const std::shared_ptr<RunBinding> binding = RunBinding::of(e);
  const std::shared_ptr<const FileGrants> grants = files->grants;

  e.addRunCleanup([files] { files->abortHandles(); });

  // --- synchronous -----------------------------------------------------------

  e.set(object, "cwd", e.function("cwd", 0, [grants](js::Engine& en, Args) {
    return en.string(grants->cwd);
  }));
  e.set(object, "readFile", e.function("readFile", 1, [grants](js::Engine& en, Args a) {
    auto data = grants->readFile(stringArg(en, a, 0));
    return en.bytes(data.data(), data.size());
  }));
  e.set(object, "writeFile", e.function("writeFile", 3, [grants](js::Engine& en, Args a) {
    if (a.size() < 2 || !en.isBytes(a[1])) throw std::runtime_error("files.writeFile needs bytes");
    grants->writeFile(stringArg(en, a, 0), en.toBytes(a[1]), flagArg(en, a, 2));
    return en.undefined();
  }));
  e.set(object, "stat", e.function("stat", 2, [grants](js::Engine& en, Args a) {
    return en.string(grants->stat(stringArg(en, a, 0), flagArg(en, a, 1)).dump());
  }));
  e.set(object, "readdir", e.function("readdir", 1, [grants](js::Engine& en, Args a) {
    return en.string(grants->readdir(stringArg(en, a, 0)).dump());
  }));
  e.set(object, "mkdir", e.function("mkdir", 2, [grants](js::Engine& en, Args a) {
    auto first = grants->mkdir(stringArg(en, a, 0), flagArg(en, a, 1));
    return first ? en.string(*first) : en.undefined();
  }));
  e.set(object, "mkdtemp", e.function("mkdtemp", 1, [grants](js::Engine& en, Args args) {
    return en.string(grants->mkdtemp(stringArg(en, args, 0)));
  }));
  e.set(object, "rm", e.function("rm", 3, [grants](js::Engine& en, Args a) {
    grants->rm(stringArg(en, a, 0), flagArg(en, a, 1), flagArg(en, a, 2));
    return en.undefined();
  }));
  e.set(object, "rmdir", e.function("rmdir", 1, [grants](js::Engine& en, Args a) {
    grants->rmdir(stringArg(en, a, 0));
    return en.undefined();
  }));
  e.set(object, "unlink", e.function("unlink", 1, [grants](js::Engine& en, Args a) {
    grants->unlink(stringArg(en, a, 0));
    return en.undefined();
  }));
  e.set(object, "rename", e.function("rename", 2, [grants](js::Engine& en, Args a) {
    grants->rename(stringArg(en, a, 0), stringArg(en, a, 1));
    return en.undefined();
  }));
  e.set(object, "copyFile", e.function("copyFile", 2, [grants](js::Engine& en, Args a) {
    grants->copyFile(stringArg(en, a, 0), stringArg(en, a, 1));
    return en.undefined();
  }));
  e.set(object, "realpath", e.function("realpath", 1, [grants](js::Engine& en, Args a) {
    return en.string(grants->resolve(stringArg(en, a, 0), Access::Read, "realpath").real);
  }));

  // --- asynchronous ----------------------------------------------------------
  //
  // Each copies its arguments into a reservation on the run, then submits a
  // job that owns the copies and a reference to the immutable grants.
  // Cancellable: the run's cancellation rejects them with an AbortError. A
  // job already running may still complete its effect.

  e.set(object, "bound", e.function("bound", 0, [binding](js::Engine& en, Args) {
    return en.boolean(binding->run() != nullptr);
  }));

  // A whole-file read: the open step here, the read step from the converter
  // (host/file_jobs.h).
  e.set(object, "readFileAsync", e.function("readFileAsync", 1, [grants, binding](js::Engine& en, Args a) {
    Submission s = begin(*binding);
    std::string path = pathArg(en, a, 0, s.reservation);
    const JobCost cost{path.size(), 0, 0};
    auto job = makeCostedJob(cost, [grants, path = std::move(path)](std::stop_token) {
      return JobOutcome::value(std::make_unique<OpenedFile>(grants->openRead(path)));
    });
    return s.run.submit(s.io, std::move(job), wholeFileConverter(binding), true, std::move(s.reservation));
  }));
  e.set(object, "writeFileAsync", e.function("writeFileAsync", 3, [grants, binding](js::Engine& en, Args a) {
    Submission s = begin(*binding);
    std::string path = pathArg(en, a, 0, s.reservation);
    if (a.size() < 2) throw std::runtime_error("files.writeFileAsync needs bytes");
    std::vector<uint8_t> data = snapshotBytes(en, a[1], "data", s.reservation);
    const bool append = flagArg(en, a, 2);
    const JobCost cost{path.size() + data.size(), 0, 0};
    auto job = makeCostedJob(cost, [grants, path = std::move(path), data = std::move(data), append](
                                       std::stop_token stop) {
      return grants->writeFile(path, data, append, stop) ? JobOutcome::value(nullptr) : JobOutcome::stopped();
    });
    return s.run.submit(s.io, std::move(job), nullptr, true, std::move(s.reservation));
  }));
  e.set(object, "statAsync", e.function("statAsync", 2, [grants, binding](js::Engine& en, Args a) {
    Submission s = begin(*binding);
    std::string path = pathArg(en, a, 0, s.reservation);
    const bool follow = flagArg(en, a, 1);
    const JobCost cost{path.size(), kMetadataBytes, 0};
    auto job = makeCostedJob(cost, [grants, path = std::move(path), follow](std::stop_token) {
      return text(grants->stat(path, follow).dump());
    });
    return s.run.submit(s.io, std::move(job), textConverter(), true, std::move(s.reservation));
  }));
  e.set(object, "readdirAsync", e.function("readdirAsync", 1, [grants, binding](js::Engine& en, Args a) {
    Submission s = begin(*binding);
    std::string path = pathArg(en, a, 0, s.reservation);
    const JobCost cost{path.size(), kMaxListingBytes, 0};
    auto job = makeCostedJob(cost, [grants, path = std::move(path)](std::stop_token) {
      return text(grants->readdir(path, kMaxListingBytes).dump());
    });
    return s.run.submit(s.io, std::move(job), textConverter(), true, std::move(s.reservation));
  }));
  e.set(object, "mkdirAsync", e.function("mkdirAsync", 2, [grants, binding](js::Engine& en, Args a) {
    Submission s = begin(*binding);
    std::string path = pathArg(en, a, 0, s.reservation);
    const bool recursive = flagArg(en, a, 1);
    const JobCost cost{path.size(), kMetadataBytes, 0};
    auto job = makeCostedJob(cost, [grants, path = std::move(path), recursive](std::stop_token) {
      auto first = grants->mkdir(path, recursive);
      return first ? text(std::move(*first)) : JobOutcome::value(nullptr);
    });
    return s.run.submit(s.io, std::move(job), textConverter(), true, std::move(s.reservation));
  }));
  e.set(object, "mkdtempAsync", e.function("mkdtempAsync", 1, [grants, binding](js::Engine& en, Args a) {
    Submission s = begin(*binding);
    std::string prefix = pathArg(en, a, 0, s.reservation, "prefix");
    const JobCost cost{prefix.size(), kMetadataBytes, 0};
    auto job = makeCostedJob(cost, [grants, prefix = std::move(prefix)](std::stop_token) {
      return text(grants->mkdtemp(prefix));
    });
    return s.run.submit(s.io, std::move(job), textConverter(), true, std::move(s.reservation));
  }));
  e.set(object, "rmAsync", e.function("rmAsync", 3, [grants, binding](js::Engine& en, Args a) {
    Submission s = begin(*binding);
    std::string path = pathArg(en, a, 0, s.reservation);
    const bool recursive = flagArg(en, a, 1), force = flagArg(en, a, 2);
    const JobCost cost{path.size(), 0, kRemoveWorkspaceBytes};
    auto job = makeCostedJob(cost, [grants, path = std::move(path), recursive, force](std::stop_token stop) {
      return grants->rm(path, recursive, force, stop) ? JobOutcome::value(nullptr) : JobOutcome::stopped();
    });
    return s.run.submit(s.io, std::move(job), nullptr, true, std::move(s.reservation));
  }));
  e.set(object, "rmdirAsync", e.function("rmdirAsync", 1, [grants, binding](js::Engine& en, Args a) {
    Submission s = begin(*binding);
    std::string path = pathArg(en, a, 0, s.reservation);
    const JobCost cost{path.size(), 0, 0};
    auto job = makeCostedJob(cost, [grants, path = std::move(path)](std::stop_token) {
      grants->rmdir(path);
      return JobOutcome::value(nullptr);
    });
    return s.run.submit(s.io, std::move(job), nullptr, true, std::move(s.reservation));
  }));
  e.set(object, "unlinkAsync", e.function("unlinkAsync", 1, [grants, binding](js::Engine& en, Args a) {
    Submission s = begin(*binding);
    std::string path = pathArg(en, a, 0, s.reservation);
    const JobCost cost{path.size(), 0, 0};
    auto job = makeCostedJob(cost, [grants, path = std::move(path)](std::stop_token) {
      grants->unlink(path);
      return JobOutcome::value(nullptr);
    });
    return s.run.submit(s.io, std::move(job), nullptr, true, std::move(s.reservation));
  }));
  e.set(object, "renameAsync", e.function("renameAsync", 2, [grants, binding](js::Engine& en, Args a) {
    Submission s = begin(*binding);
    std::string from = pathArg(en, a, 0, s.reservation, "from");
    std::string to = pathArg(en, a, 1, s.reservation, "to");
    const JobCost cost{from.size() + to.size(), 0, 0};
    auto job = makeCostedJob(cost, [grants, from = std::move(from), to = std::move(to)](std::stop_token) {
      grants->rename(from, to);
      return JobOutcome::value(nullptr);
    });
    return s.run.submit(s.io, std::move(job), nullptr, true, std::move(s.reservation));
  }));
  e.set(object, "copyFileAsync", e.function("copyFileAsync", 2, [grants, binding](js::Engine& en, Args a) {
    Submission s = begin(*binding);
    std::string from = pathArg(en, a, 0, s.reservation, "from");
    std::string to = pathArg(en, a, 1, s.reservation, "to");
    const JobCost cost{from.size() + to.size(), 0, kCopyChunk};
    auto job = makeCostedJob(cost, [grants, from = std::move(from), to = std::move(to)](std::stop_token stop) {
      return grants->copyFileStreaming(from, to, stop) ? JobOutcome::value(nullptr) : JobOutcome::stopped();
    });
    return s.run.submit(s.io, std::move(job), nullptr, true, std::move(s.reservation));
  }));
  e.set(object, "realpathAsync", e.function("realpathAsync", 1, [grants, binding](js::Engine& en, Args a) {
    Submission s = begin(*binding);
    std::string path = pathArg(en, a, 0, s.reservation);
    const JobCost cost{path.size(), kMetadataBytes, 0};
    auto job = makeCostedJob(cost, [grants, path = std::move(path)](std::stop_token) {
      return text(grants->resolve(path, Access::Read, "realpath").real);
    });
    return s.run.submit(s.io, std::move(job), textConverter(), true, std::move(s.reservation));
  }));

  // --- file handles ----------------------------------------------------------
  //
  // Outside a run, the synchronous forms open, read and close a handle on
  // the worker. Run cleanup closes those too.

  e.set(object, "openRead", e.function("openRead", 2, [files, grants](js::Engine& en, Args a) {
    if (a.size() < 2 || !en.isString(a[1]) || en.toString(a[1]) != "r") {
      throw std::runtime_error("files.openRead supports only read-only flags 'r'");
    }
    if (!en.isString(a[0])) throw std::runtime_error("files.openRead needs a path string");
    const std::string path = en.toString(a[0]);
    if (files->liveHandles() >= kMaxReadHandles) throw FsError("EMFILE", "open", path, "file handle quota exceeded");
    auto handle = std::make_shared<SyncHandle>();
    handle->fd = std::move(openRegularFile(grants->resolve(path, Access::Read, "open").real, path).fd);
    handle->owner = files->owner;
    handle->path = path;
    files->syncHandles.push_back(handle);
    return en.nativeObject(handle);
  }));
  e.set(object, "readHandle", e.function("readHandle", 3, [files](js::Engine& en, Args a) {
    if (a.size() < 3) throw std::runtime_error("files.readHandle needs handle, length and position");
    auto handle = files->syncHandle(en, a[0], "read");
    const size_t length = safeInteger(en, a[1], "length");
    if (length > kMaxHandleReadBytes) throw std::runtime_error("file read length exceeds 16 MiB limit");
    const bool current = en.isNull(a[2]);
    const size_t position = current ? 0 : safeInteger(en, a[2], "position");
    if (static_cast<long double>(position) > std::numeric_limits<fsapi::Offset>::max()) {
      throw std::runtime_error("file read position exceeds native offset range");
    }
    std::vector<uint8_t> bytes(length);
    fsapi::Count count;
    do {
      count = current ? fsapi::read(handle->fd.get(), bytes.data(), length)
                      : fsapi::pread(handle->fd.get(), bytes.data(), length, static_cast<fsapi::Offset>(position));
    } while (count < 0 && errno == EINTR);
    if (count < 0) throwErrno(errno, "read", handle->path);
    return en.bytes(bytes.data(), static_cast<size_t>(count));
  }));
  e.set(object, "closeHandle", e.function("closeHandle", 1, [files](js::Engine& en, Args a) {
    if (a.empty()) throw std::runtime_error("files.closeHandle needs a file handle");
    files->syncHandle(en, a[0], "close")->fd.reset();
    return en.undefined();
  }));

  // Opens on the I/O lane. The converter makes the handle's control on the
  // worker, where the quota is counted, so the quota holds for opens that
  // were in flight together.
  e.set(object, "openReadAsync", e.function("openReadAsync", 2, [files, grants, binding](js::Engine& en, Args a) {
    if (a.size() < 2 || !en.isString(a[1]) || en.toString(a[1]) != "r") {
      throw std::runtime_error("files.openRead supports only read-only flags 'r'");
    }
    if (a.empty() || !en.isString(a[0])) throw std::runtime_error("files.openRead needs a path string");
    Submission s = begin(*binding);
    std::string path = pathArg(en, a, 0, s.reservation);
    if (files->liveHandles() >= kMaxReadHandles) throw FsError("EMFILE", "open", path, "file handle quota exceeded");
    const JobCost cost{path.size(), 0, 0};
    auto job = makeCostedJob(cost, [grants, path = std::move(path)](std::stop_token) {
      OpenedFile opened = openRegularFile(grants->resolve(path, Access::Read, "open").real, path);
      return JobOutcome::value(std::make_unique<OpenedFile>(std::move(opened)));
    });
    auto convert = [files, binding](ResultConversion& conversion) -> js::Value {
      auto* opened = dynamic_cast<OpenedFile*>(conversion.payload());
      if (!opened) throw std::logic_error("an open delivered an unexpected payload");
      // The descriptor closes with the payload when this throws.
      if (files->liveHandles() >= kMaxReadHandles) {
        throw FsError("EMFILE", "open", opened->path, "file handle quota exceeded");
      }
      JobExecutor* io = binding->io();
      if (!io) throw std::runtime_error("the run of a file open has ended");
      auto token = std::make_shared<FileHandleToken>();
      token->control = ResourceControl::create("file handle '" + opened->path + "'",
                                               std::make_unique<HandleBody>(std::move(opened->fd)), *io);
      token->owner = files->owner;
      token->path = opened->path;
      files->handles.push_back(Files::Entry{token->control, token});
      return conversion.engine().nativeObject(token);
    };
    return s.run.submit(s.io, std::move(job), convert, true, std::move(s.reservation));
  }));
  e.set(object, "readHandleAsync", e.function("readHandleAsync", 3, [files, binding](js::Engine& en, Args a) {
    if (a.size() < 3) throw std::runtime_error("files.readHandle needs handle, length and position");
    auto token = files->handle(en, a[0], "read");
    const size_t length = safeInteger(en, a[1], "length");
    if (length > kMaxHandleReadBytes) throw std::runtime_error("file read length exceeds 16 MiB limit");
    std::optional<fsapi::Offset> position;
    if (!en.isNull(a[2])) {
      const size_t at = safeInteger(en, a[2], "position");
      if (static_cast<long double>(at) > std::numeric_limits<fsapi::Offset>::max()) {
        throw std::runtime_error("file read position exceeds native offset range");
      }
      position = static_cast<fsapi::Offset>(at);
    }
    Submission s = begin(*binding);
    s.reservation.reserveSnapshot(token->path.size());
    auto read = std::make_unique<HandleRead>(token->control, length, position, token->path);
    auto convert = [](ResultConversion& conversion) -> js::Value {
      auto* bytes = dynamic_cast<FileBytes*>(conversion.payload());
      if (!bytes) throw std::logic_error("a handle read delivered an unexpected payload");
      return conversion.adoptBytes(std::move(bytes->bytes));
    };
    return s.run.submit(token->control->operations(), std::move(read), convert, true, std::move(s.reservation));
  }));
  // Not cancellable: like cleanup, a close runs through the run's
  // cancellation, behind the reads accepted before it.
  e.set(object, "closeHandleAsync", e.function("closeHandleAsync", 1, [files, binding](js::Engine& en, Args a) {
    if (a.empty()) throw std::runtime_error("files.closeHandle needs a file handle");
    auto token = files->handle(en, a[0], "close");
    Submission s = begin(*binding);
    token->closing = true;
    return s.run.submit(token->control->terminal(), std::make_unique<HandleClose>(token->control), nullptr, false,
                        std::move(s.reservation));
  }));
}

}  // namespace gr::host
