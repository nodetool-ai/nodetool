// `__host.files`: file access for node code, confined to the directories the
// embedder grants (HostOptions::workspaceDir read-write, readRoots
// read-only). guest/host/fs.mjs builds node:fs on it, and the guest
// workspace (context.workspace) uses it too. Relative paths resolve against
// the workspace, the run's working directory.
//
//   cwd()                            -> workspace directory, or ""
//   openRead(path, 'r')               -> opaque owner-scoped handle
//   readHandle(handle, length, pos)   -> Uint8Array, null pos uses cursor
//   closeHandle(handle)              closes the descriptor
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
//
// Errors are Node fs errors ("ENOENT: no such file or directory, open 'x'").
// A path outside the grants is EACCES.
#include "host/capabilities.h"
#include "host/paths.h"

#include <nlohmann/json.hpp>

#include <algorithm>
#include <cerrno>
#include <cmath>
#include <cstdlib>
#include <dirent.h>
#include <fcntl.h>
#include <filesystem>
#include <memory>
#include <limits>
#include <sys/stat.h>
#include <unistd.h>

namespace gr::host {
namespace {

using Args = const std::vector<js::Value>&;
constexpr size_t kMaxReadBytes = size_t(1) << 30;

constexpr size_t kMaxHandleReadBytes = size_t(16) << 20;
constexpr size_t kMaxReadHandles = 64;
constexpr double kMaxSafeInteger = 9007199254740991.0;

struct ReadOwner {};
struct ReadHandle final : js::NativePayload {
  std::shared_ptr<ReadOwner> owner;
  int fd = -1;
  std::string path;
  void close() noexcept {
    // Do not retry close on EINTR: the descriptor may already have been freed.
    if (fd >= 0) {
      ::close(fd);
      fd = -1;
    }
  }
  ~ReadHandle() override { close(); }
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

struct Fd {
  int fd = -1;
  ~Fd() {
    if (fd >= 0) ::close(fd);
  }
};

std::string kindOf(mode_t mode) {
  if (S_ISREG(mode)) return "file";
  if (S_ISDIR(mode)) return "directory";
  if (S_ISLNK(mode)) return "symlink";
  return "other";
}

double ms(const struct timespec& t) { return double(t.tv_sec) * 1000.0 + double(t.tv_nsec) / 1e6; }

#ifdef __APPLE__
const struct timespec& mtimeOf(const struct stat& st) { return st.st_mtimespec; }
const struct timespec& ctimeOf(const struct stat& st) { return st.st_ctimespec; }
#else
const struct timespec& mtimeOf(const struct stat& st) { return st.st_mtim; }
const struct timespec& ctimeOf(const struct stat& st) { return st.st_ctim; }
#endif

struct Files {
  std::vector<Root> roots;
  std::string cwd;

  const std::shared_ptr<ReadOwner> owner = std::make_shared<ReadOwner>();
  std::vector<std::weak_ptr<ReadHandle>> handles;

  void closeHandles() {
    for (const auto &weak : handles) {
      if (auto handle = weak.lock())
        handle->close();
    }
    handles.clear();
  }

  std::shared_ptr<ReadHandle> handle(js::Engine &e, const js::Value &token,
                                     const char* syscall = "read") const {
    auto value = std::dynamic_pointer_cast<ReadHandle>(e.nativePayload(token));
    if (!value || value->owner != owner || value->fd < 0) {
      throw FsError("EBADF", syscall, "", "closed or foreign file handle");
    }
    return value;
  }

  std::shared_ptr<ReadHandle> openRead(const std::string &path) {
    const auto resolved = resolve(path, Access::Read, "open");
    std::erase_if(handles, [](const auto &weak) {
      const auto h = weak.lock();
      return !h || h->fd < 0;
    });
    if (handles.size() >= kMaxReadHandles)
      throw FsError("EMFILE", "open", path, "file handle quota exceeded");
    // NONBLOCK prevents opening a FIFO from stalling before its type is
    // checked.
    Fd file{::open(resolved.real.c_str(),
                   O_RDONLY | O_NOFOLLOW | O_CLOEXEC | O_NONBLOCK)};
    if (file.fd < 0)
      throwErrno(errno, "open", path);
    struct stat st{};
    if (::fstat(file.fd, &st) != 0)
      throwErrno(errno, "fstat", path);
    if (S_ISDIR(st.st_mode))
      throw FsError("EISDIR", "read", path);
    if (!S_ISREG(st.st_mode))
      throw FsError("EACCES", "open", path, "not a regular file");
    if (st.st_nlink > 1)
      throw FsError("EACCES", "open", path, "hard-linked file");
    auto result = std::make_shared<ReadHandle>();
    result->owner = owner;
    result->path = path;
    handles.push_back(result);
    result->fd = file.fd;
    file.fd = -1;
    return result;
  }

  Resolved resolve(const std::string& path, Access access, const std::string& syscall) const {
    return confine(roots, cwd, path, access, syscall);
  }

  std::vector<uint8_t> readFile(const std::string& path) const {
    Resolved r = resolve(path, Access::Read, "open");
    Fd f{::open(r.real.c_str(), O_RDONLY | O_NOFOLLOW | O_CLOEXEC)};
    if (f.fd < 0) throwErrno(errno, "open", path);
    struct stat st {};
    if (::fstat(f.fd, &st) != 0) throwErrno(errno, "fstat", path);
    if (S_ISDIR(st.st_mode)) throw FsError("EISDIR", "read", path);
    if (!S_ISREG(st.st_mode)) throw FsError("EACCES", "open", path, "not a regular file");
    // A hard link can alias a file outside the roots.
    if (st.st_nlink > 1) throw FsError("EACCES", "open", path, "hard-linked file");
    if (size_t(st.st_size) > kMaxReadBytes) throw FsError("EFBIG", "read", path);
    std::vector<uint8_t> out;
    out.reserve(size_t(st.st_size));
    uint8_t buf[65536];
    for (;;) {
      ssize_t n = ::read(f.fd, buf, sizeof buf);
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

  void writeFile(const std::string& path, const std::vector<uint8_t>& data, bool append) const {
    Resolved r = resolve(path, Access::Write, "open");
    int flags = O_WRONLY | O_CREAT | O_NOFOLLOW | O_CLOEXEC | (append ? O_APPEND : O_TRUNC);
    Fd f{::open(r.real.c_str(), flags, 0644)};
    if (f.fd < 0) throwErrno(errno, "open", path);
    struct stat st {};
    if (::fstat(f.fd, &st) == 0 && st.st_nlink > 1) {
      throw FsError("EACCES", "open", path, "hard-linked file");
    }
    size_t off = 0;
    while (off < data.size()) {
      ssize_t n = ::write(f.fd, data.data() + off, data.size() - off);
      if (n < 0) {
        if (errno == EINTR) continue;
        throwErrno(errno, "write", path);
      }
      off += size_t(n);
    }
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
      std::string absolute = path[0] == '/' ? path : cwd + "/" + path;
      target = lexicalNormalize(absolute);
    }
    struct stat st {};
    int rc = follow ? ::stat(target.c_str(), &st) : ::lstat(target.c_str(), &st);
    if (rc != 0) throwErrno(errno, syscall, path);
    return {{"kind", kindOf(st.st_mode)},
            {"size", double(st.st_size)},
            {"mode", int(st.st_mode)},
            {"mtimeMs", ms(mtimeOf(st))},
            {"ctimeMs", ms(ctimeOf(st))},
            {"birthtimeMs", ms(ctimeOf(st))}};
  }

  nlohmann::json readdir(const std::string& path) const {
    Resolved r = resolve(path, Access::Read, "scandir");
    std::unique_ptr<DIR, int (*)(DIR*)> dir(::opendir(r.real.c_str()), ::closedir);
    if (!dir) throwErrno(errno, "scandir", path);
    std::vector<std::pair<std::string, std::string>> entries;
    while (struct dirent* e = ::readdir(dir.get())) {
      std::string name = e->d_name;
      if (name == "." || name == "..") continue;
      struct stat st {};
      std::string kind = "other";
      if (::fstatat(::dirfd(dir.get()), e->d_name, &st, AT_SYMLINK_NOFOLLOW) == 0) {
        kind = kindOf(st.st_mode);
      }
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
      struct stat st {};
      if (recursive && ::stat(r.real.c_str(), &st) == 0 && S_ISDIR(st.st_mode)) return std::nullopt;
      throw FsError("EEXIST", "mkdir", path);
    }
    // Create each missing component below the existing ancestor.
    std::optional<std::string> first;
    std::string current;
    size_t i = 0;
    const std::string& target = r.real;
    while (i < target.size()) {
      size_t j = target.find('/', i + 1);
      if (j == std::string::npos) j = target.size();
      current = target.substr(0, j);
      i = j;
      struct stat st {};
      if (::lstat(current.c_str(), &st) == 0) {
        if (!S_ISDIR(st.st_mode)) throw FsError(S_ISLNK(st.st_mode) ? "EACCES" : "ENOTDIR", "mkdir", path);
        continue;
      }
      if (::mkdir(current.c_str(), 0755) != 0 && errno != EEXIST) throwErrno(errno, "mkdir", path);
      if (!first) first = current;
    }
    return first;
  }

  std::string mkdtemp(const std::string& prefix) const {
    if (prefix.find('\0') != std::string::npos) throw FsError("EINVAL", "mkdtemp", prefix);
    const std::filesystem::path candidate(prefix + "XXXXXX");
    const auto parent = candidate.parent_path();
    const auto resolved = resolve(parent.empty() ? "." : parent.string(), Access::Write, "mkdtemp");
    // Only the parent is resolved. A literal prefixXXXXXX entry is not the
    // directory libc will create and must not redirect or deny this operation.
    std::string pattern = (std::filesystem::path(resolved.real) / candidate.filename()).string();
    if (!::mkdtemp(pattern.data())) throwErrno(errno, "mkdtemp", prefix);
    return pattern;
  }

  void removeTree(const std::string& real, const std::string& path) const {
    struct stat st {};
    if (::lstat(real.c_str(), &st) != 0) throwErrno(errno, "rm", path);
    if (S_ISDIR(st.st_mode)) {
      std::unique_ptr<DIR, int (*)(DIR*)> dir(::opendir(real.c_str()), ::closedir);
      if (!dir) throwErrno(errno, "rm", path);
      std::vector<std::string> names;
      while (struct dirent* e = ::readdir(dir.get())) {
        std::string name = e->d_name;
        if (name != "." && name != "..") names.push_back(name);
      }
      dir.reset();
      for (const auto& name : names) removeTree(real + "/" + name, path);
      if (::rmdir(real.c_str()) != 0) throwErrno(errno, "rm", path);
    } else if (::unlink(real.c_str()) != 0) {
      throwErrno(errno, "rm", path);
    }
  }

  void rm(const std::string& path, bool recursive, bool force) const {
    Resolved r;
    try {
      r = resolve(path, Access::Write, "rm");
    } catch (const FsError& e) {
      if (force && e.code == "ENOENT") return;
      throw;
    }
    if (!r.exists) {
      if (force) return;
      throw FsError("ENOENT", "rm", path);
    }
    for (const auto& root : roots) {
      if (root.dir == r.real) throw FsError("EACCES", "rm", path, "a granted directory itself");
    }
    struct stat st {};
    if (::lstat(r.real.c_str(), &st) != 0) throwErrno(errno, "rm", path);
    if (S_ISDIR(st.st_mode) && !recursive) {
      throw FsError("EISDIR", "rm", path);  // Node: ERR_FS_EISDIR
    }
    removeTree(r.real, path);
  }

  void rmdir(const std::string& path) const {
    Resolved r = resolve(path, Access::Write, "rmdir");
    if (!r.exists) throw FsError("ENOENT", "rmdir", path);
    for (const auto& root : roots) {
      if (root.dir == r.real) throw FsError("EACCES", "rmdir", path, "a granted directory itself");
    }
    if (::rmdir(r.real.c_str()) != 0) throwErrno(errno, "rmdir", path);
  }

  void unlink(const std::string& path) const {
    Resolved r = resolve(path, Access::Write, "unlink");
    if (!r.exists) throw FsError("ENOENT", "unlink", path);
    if (::unlink(r.real.c_str()) != 0) throwErrno(errno, "unlink", path);
  }

  void rename(const std::string& from, const std::string& to) const {
    Resolved a = resolve(from, Access::Write, "rename");
    if (!a.exists) throw FsError("ENOENT", "rename", from);
    Resolved b = resolve(to, Access::Write, "rename");
    if (::rename(a.real.c_str(), b.real.c_str()) != 0) throwErrno(errno, "rename", from);
  }

  void copyFile(const std::string& from, const std::string& to) const {
    writeFile(to, readFile(from), false);
  }
};

}  // namespace

void installFiles(js::Engine& e, const js::Value& object, const HostOptions& options) {
  auto files = std::make_shared<Files>();
  std::vector<std::pair<std::string, bool>> dirs;
  if (!options.workspaceDir.empty()) dirs.emplace_back(options.workspaceDir, true);
  if (!options.sqliteDirectory.empty()) dirs.emplace_back(options.sqliteDirectory, true);
  for (const auto& d : options.readRoots) dirs.emplace_back(d, false);
  files->roots = canonicalRoots(dirs);
  if (!options.workspaceDir.empty()) {
    const auto workspaceRoots = canonicalRoots({{options.workspaceDir, true}});
    if (!workspaceRoots.empty()) files->cwd = workspaceRoots.front().dir;
  }

  e.addRunCleanup([files] { files->closeHandles(); });
  e.set(object, "openRead",
        e.function("openRead", 2, [files](js::Engine &en, Args args) {
          if (args.size() < 2 || !en.isString(args[1]) ||
              en.toString(args[1]) != "r") {
            throw std::runtime_error(
                "files.openRead supports only read-only flags 'r'");
          }
          if (!en.isString(args[0]))
            throw std::runtime_error("files.openRead needs a path string");
          return en.nativeObject(files->openRead(en.toString(args[0])));
        }));
  e.set(object, "readHandle",
        e.function("readHandle", 3, [files](js::Engine &en, Args args) {
          if (args.size() < 3)
            throw std::runtime_error(
                "files.readHandle needs handle, length and position");
          auto handle = files->handle(en, args[0]);
          const size_t length = safeInteger(en, args[1], "length");
          if (length > kMaxHandleReadBytes)
            throw std::runtime_error("file read length exceeds 16 MiB limit");
          const bool current = en.isNull(args[2]);
          const size_t position =
              current ? 0 : safeInteger(en, args[2], "position");
          if (static_cast<long double>(position) >
              std::numeric_limits<off_t>::max()) {
            throw std::runtime_error(
                "file read position exceeds native offset range");
          }
          std::vector<uint8_t> bytes(length);
          ssize_t count;
          do {
            count = current ? ::read(handle->fd, bytes.data(), length)
                            : ::pread(handle->fd, bytes.data(), length,
                                      static_cast<off_t>(position));
          } while (count < 0 && errno == EINTR);
          if (count < 0)
            throwErrno(errno, "read", handle->path);
          return en.bytes(bytes.data(), static_cast<size_t>(count));
        }));
  e.set(object, "closeHandle",
        e.function("closeHandle", 1, [files](js::Engine &en, Args args) {
          if (args.empty())
            throw std::runtime_error("files.closeHandle needs a file handle");
          files->handle(en, args[0], "close")->close();
          return en.undefined();
        }));

  auto str = [](js::Engine& en, Args a, size_t i) {
    return a.size() > i && !en.isUndefined(a[i]) && !en.isNull(a[i]) ? en.toString(a[i]) : std::string();
  };
  auto flag = [](js::Engine& en, Args a, size_t i) { return a.size() > i && en.toBoolean(a[i]); };

  e.set(object, "cwd", e.function("cwd", 0, [files](js::Engine& en, Args) {
    return en.string(files->cwd);
  }));
  e.set(object, "readFile", e.function("readFile", 1, [files, str](js::Engine& en, Args a) {
    auto data = files->readFile(str(en, a, 0));
    return en.bytes(data.data(), data.size());
  }));
  e.set(object, "writeFile", e.function("writeFile", 3, [files, str, flag](js::Engine& en, Args a) {
    if (a.size() < 2 || !en.isBytes(a[1])) throw std::runtime_error("files.writeFile needs bytes");
    files->writeFile(str(en, a, 0), en.toBytes(a[1]), flag(en, a, 2));
    return en.undefined();
  }));
  e.set(object, "stat", e.function("stat", 2, [files, str, flag](js::Engine& en, Args a) {
    return en.string(files->stat(str(en, a, 0), flag(en, a, 1)).dump());
  }));
  e.set(object, "readdir", e.function("readdir", 1, [files, str](js::Engine& en, Args a) {
    return en.string(files->readdir(str(en, a, 0)).dump());
  }));
  e.set(object, "mkdir", e.function("mkdir", 2, [files, str, flag](js::Engine& en, Args a) {
    auto first = files->mkdir(str(en, a, 0), flag(en, a, 1));
    return first ? en.string(*first) : en.undefined();
  }));
  e.set(object, "mkdtemp", e.function("mkdtemp", 1, [files, str](js::Engine& en, Args args) {
    return en.string(files->mkdtemp(str(en, args, 0)));
  }));
  e.set(object, "rm", e.function("rm", 3, [files, str, flag](js::Engine& en, Args a) {
    files->rm(str(en, a, 0), flag(en, a, 1), flag(en, a, 2));
    return en.undefined();
  }));
  e.set(object, "rmdir", e.function("rmdir", 1, [files, str](js::Engine& en, Args a) {
    files->rmdir(str(en, a, 0));
    return en.undefined();
  }));
  e.set(object, "unlink", e.function("unlink", 1, [files, str](js::Engine& en, Args a) {
    files->unlink(str(en, a, 0));
    return en.undefined();
  }));
  e.set(object, "rename", e.function("rename", 2, [files, str](js::Engine& en, Args a) {
    files->rename(str(en, a, 0), str(en, a, 1));
    return en.undefined();
  }));
  e.set(object, "copyFile", e.function("copyFile", 2, [files, str](js::Engine& en, Args a) {
    files->copyFile(str(en, a, 0), str(en, a, 1));
    return en.undefined();
  }));
  e.set(object, "realpath", e.function("realpath", 1, [files, str](js::Engine& en, Args a) {
    return en.string(files->resolve(str(en, a, 0), Access::Read, "realpath").real);
  }));
}

}  // namespace gr::host
