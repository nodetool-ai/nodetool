// `__host.assets`: the asset store, a directory the embedder names in
// HostOptions::assetDir. Keys are relative storage keys
// (`<user>/<id>.<ext>`, `<id>.<ext>`, `assets/<id>`), never paths: a key
// with `..`, a leading `/` or a symlink anywhere below the directory is
// refused. guest/host/storage.mjs wraps it as the context's asset storage
// adapter, which resolves `asset://` and `/api/storage/<key>` refs and holds
// what createAsset writes.
//
//   available()          -> whether an asset directory is granted
//   read(key)            -> Uint8Array, or null when missing
//   write(key, bytes)
//   stat(key)            -> json {size, mtimeMs}, or null
//   list(prefix)         -> json [{key, size, mtimeMs}], every file below prefix, sorted
//   find(dir, stem)      -> json [key], files directly in dir named <stem>.<ext>, sorted
//   remove(key)          -> whether a file was removed
//
// `__host.packageAssets`: shipped sample media, read-only, from
// HostOptions::packageAssetsDir. guest/host/context.mjs resolves
// `package://<pkg>/<path>` refs through it, with the key `<pkg>/<path>` and
// the same key checks as the asset store.
//
//   available()          -> whether a package assets directory is granted
//   read(key)            -> Uint8Array, or null when missing
#include "host/capabilities.h"
#include "host/assets.h"
#include "host/paths.h"

#include <nlohmann/json.hpp>

#include <algorithm>
#include <atomic>
#include <cerrno>
#include <dirent.h>
#include <fcntl.h>
#include <memory>
#include <sys/stat.h>
#include <unistd.h>

namespace gr::host {

std::atomic<uint64_t>& tempSequence() {
  static std::atomic<uint64_t> sequence{0};
  return sequence;
}

namespace {

using Args = const std::vector<js::Value>&;

struct Assets {
  std::vector<Root> roots;  // empty, or the asset directory

  std::string root() const { return roots.empty() ? std::string() : roots[0].dir; }

  void requireRoot(const std::string& key) const {
    if (roots.empty()) {
      throw FsError("EACCES", "open", key, "the native runner has no asset directory");
    }
  }

  static void checkKey(const std::string& key) {
    if (key.empty() || key[0] == '/' || key.find('\\') != std::string::npos ||
        key.find('\0') != std::string::npos) {
      throw std::runtime_error("Invalid storage key: " + key);
    }
    size_t i = 0;
    while (i <= key.size()) {
      size_t j = key.find('/', i);
      if (j == std::string::npos) j = key.size();
      if (key.compare(i, j - i, "..") == 0 && j - i == 2) {
        throw std::runtime_error("Invalid storage key: " + key);
      }
      i = j + 1;
    }
  }

  Resolved resolve(const std::string& key, Access access, const std::string& syscall) const {
    requireRoot(key);
    checkKey(key);
    return confine(roots, root(), key, access, syscall, /*noSymlinks=*/true);
  }

  std::optional<std::vector<uint8_t>> read(const std::string& key) const {
    Resolved r;
    try {
      r = resolve(key, Access::Read, "open");
    } catch (const FsError& e) {
      if (e.code == "ENOENT" || e.code == "ENOTDIR") return std::nullopt;
      throw;
    }
    int fd = ::open(r.real.c_str(), O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
    if (fd < 0) throwErrno(errno, "open", key);
    std::unique_ptr<int, void (*)(int*)> guard(&fd, [](int* f) { ::close(*f); });
    struct stat st {};
    if (::fstat(fd, &st) != 0) throwErrno(errno, "fstat", key);
    if (!S_ISREG(st.st_mode)) return std::nullopt;
    if (st.st_nlink > 1) throw FsError("EACCES", "open", key, "hard-linked file");
    std::vector<uint8_t> out;
    out.reserve(size_t(st.st_size));
    uint8_t buf[65536];
    for (;;) {
      ssize_t n = ::read(fd, buf, sizeof buf);
      if (n < 0) {
        if (errno == EINTR) continue;
        throwErrno(errno, "read", key);
      }
      if (n == 0) break;
      out.insert(out.end(), buf, buf + n);
    }
    return out;
  }

  void write(const std::string& key, const std::vector<uint8_t>& data) const {
    // Create the key's directories, then write the file atomically.
    Resolved dir = resolve(key, Access::WriteAny, "open");
    std::string parent = dir.real.substr(0, dir.real.rfind('/'));
    for (size_t i = root().size() + 1; i <= parent.size(); ++i) {
      if (i == parent.size() || parent[i] == '/') {
        std::string part = parent.substr(0, i);
        if (::mkdir(part.c_str(), 0755) != 0 && errno != EEXIST) throwErrno(errno, "mkdir", key);
      }
    }
    Resolved r = resolve(key, Access::Write, "open");
    // An exclusive temporary file unique to this operation, so concurrent
    // writes to one key never share bytes. Process id, a process-wide counter
    // and EEXIST retry also keep it unique against other processes.
    std::string tmp;
    int fd = -1;
    for (int attempt = 0; fd < 0; ++attempt) {
      tmp = r.real + ".tmp-" + std::to_string(::getpid()) + "-" + std::to_string(tempSequence().fetch_add(1));
      fd = ::open(tmp.c_str(), O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0644);
      if (fd < 0 && (errno != EEXIST || attempt >= 100)) throwErrno(errno, "open", key);
    }
    size_t off = 0;
    while (off < data.size()) {
      ssize_t n = ::write(fd, data.data() + off, data.size() - off);
      if (n < 0) {
        if (errno == EINTR) continue;
        int err = errno;
        ::close(fd);
        ::unlink(tmp.c_str());
        throwErrno(err, "write", key);
      }
      off += size_t(n);
    }
    ::close(fd);
    if (::rename(tmp.c_str(), r.real.c_str()) != 0) {
      int err = errno;
      ::unlink(tmp.c_str());
      throwErrno(err, "rename", key);
    }
  }

  nlohmann::json stat(const std::string& key) const {
    Resolved r;
    try {
      r = resolve(key, Access::Read, "stat");
    } catch (const FsError& e) {
      if (e.code == "ENOENT" || e.code == "ENOTDIR") return nullptr;
      throw;
    }
    struct stat st {};
    if (::lstat(r.real.c_str(), &st) != 0 || !S_ISREG(st.st_mode)) return nullptr;
    return {{"size", double(st.st_size)}, {"mtimeMs", double(st.st_mtime) * 1000.0}};
  }

  void walk(const std::string& dir, const std::string& prefix, nlohmann::json& out) const {
    std::unique_ptr<DIR, int (*)(DIR*)> d(::opendir(dir.c_str()), ::closedir);
    if (!d) return;
    std::vector<std::string> names;
    while (struct dirent* e = ::readdir(d.get())) {
      std::string name = e->d_name;
      if (name != "." && name != "..") names.push_back(name);
    }
    std::sort(names.begin(), names.end());
    for (const auto& name : names) {
      std::string path = dir + "/" + name;
      std::string key = prefix.empty() ? name : prefix + "/" + name;
      struct stat st {};
      if (::lstat(path.c_str(), &st) != 0) continue;
      if (S_ISDIR(st.st_mode)) {
        walk(path, key, out);
      } else if (S_ISREG(st.st_mode)) {
        out.push_back({{"key", key}, {"size", double(st.st_size)}, {"mtimeMs", double(st.st_mtime) * 1000.0}});
      }
      // Symlinks are never listed.
    }
  }

  nlohmann::json list(const std::string& prefix) const {
    nlohmann::json out = nlohmann::json::array();
    if (roots.empty()) return out;
    if (prefix.empty()) {
      walk(root(), "", out);
      return out;
    }
    Resolved r;
    try {
      r = resolve(prefix, Access::Read, "scandir");
    } catch (const FsError& e) {
      if (e.code == "ENOENT" || e.code == "ENOTDIR") return out;
      throw;
    }
    walk(r.real, prefix, out);
    return out;
  }

  // Keys of the regular files directly in `dir` (the root when empty) whose
  // name is `<stem>.<extension>`, sorted. Reads one directory and stats only
  // the matches, so resolving `asset://<id>` stays cheap in a large store.
  nlohmann::json find(const std::string& dir, const std::string& stem) const {
    nlohmann::json out = nlohmann::json::array();
    if (roots.empty() || stem.empty() || stem.find('/') != std::string::npos) return out;
    std::string path = root();
    if (!dir.empty()) {
      try {
        path = resolve(dir, Access::Read, "scandir").real;
      } catch (const FsError& e) {
        if (e.code == "ENOENT" || e.code == "ENOTDIR") return out;
        throw;
      }
    }
    std::unique_ptr<DIR, int (*)(DIR*)> d(::opendir(path.c_str()), ::closedir);
    if (!d) return out;
    const std::string needle = stem + ".";
    std::vector<std::string> names;
    while (struct dirent* e = ::readdir(d.get())) {
      std::string name = e->d_name;
      if (name.size() > needle.size() && name.compare(0, needle.size(), needle) == 0) names.push_back(name);
    }
    std::sort(names.begin(), names.end());
    for (const auto& name : names) {
      struct stat st {};
      if (::lstat((path + "/" + name).c_str(), &st) != 0 || !S_ISREG(st.st_mode)) continue;
      out.push_back(dir.empty() ? name : dir + "/" + name);
    }
    return out;
  }

  bool remove(const std::string& key) const {
    Resolved r = resolve(key, Access::Write, "unlink");
    if (!r.exists) return false;
    struct stat st {};
    if (::lstat(r.real.c_str(), &st) != 0 || !S_ISREG(st.st_mode)) return false;
    if (::unlink(r.real.c_str()) != 0) throwErrno(errno, "unlink", key);
    return true;
  }
};

}  // namespace

void installAssets(js::Engine& e, const js::Value& object, const HostOptions& options) {
  auto assets = std::make_shared<Assets>();
  if (!options.assetDir.empty()) assets->roots = canonicalRoots({{options.assetDir, true}});
  auto key = [](js::Engine& en, Args a) { return a.empty() ? std::string() : en.toString(a[0]); };

  e.set(object, "available", e.function("available", 0, [assets](js::Engine& en, Args) {
    return en.boolean(!assets->roots.empty());
  }));
  e.set(object, "read", e.function("read", 1, [assets, key](js::Engine& en, Args a) {
    auto data = assets->read(key(en, a));
    return data ? en.bytes(data->data(), data->size()) : en.null();
  }));
  e.set(object, "write", e.function("write", 2, [assets, key](js::Engine& en, Args a) {
    if (a.size() < 2 || !en.isBytes(a[1])) throw std::runtime_error("assets.write needs bytes");
    assets->write(key(en, a), en.toBytes(a[1]));
    return en.undefined();
  }));
  e.set(object, "stat", e.function("stat", 1, [assets, key](js::Engine& en, Args a) {
    return en.string(assets->stat(key(en, a)).dump());
  }));
  e.set(object, "list", e.function("list", 1, [assets, key](js::Engine& en, Args a) {
    return en.string(assets->list(key(en, a)).dump());
  }));
  e.set(object, "find", e.function("find", 2, [assets, key](js::Engine& en, Args a) {
    const std::string stem = a.size() < 2 ? std::string() : en.toString(a[1]);
    return en.string(assets->find(key(en, a), stem).dump());
  }));
  e.set(object, "remove", e.function("remove", 1, [assets, key](js::Engine& en, Args a) {
    return en.boolean(assets->remove(key(en, a)));
  }));
}

void installPackageAssets(js::Engine& e, const js::Value& object, const HostOptions& options) {
  auto assets = std::make_shared<Assets>();
  if (!options.packageAssetsDir.empty()) assets->roots = canonicalRoots({{options.packageAssetsDir, false}});
  e.set(object, "available", e.function("available", 0, [assets](js::Engine& en, Args) {
    return en.boolean(!assets->roots.empty());
  }));
  e.set(object, "read", e.function("read", 1, [assets](js::Engine& en, Args a) {
    const std::string key = a.empty() ? std::string() : en.toString(a[0]);
    if (assets->roots.empty()) {
      throw std::runtime_error("package://" + key +
                               ": the native runner has no package assets directory (--package-assets)");
    }
    auto data = assets->read(key);
    return data ? en.bytes(data->data(), data->size()) : en.null();
  }));
}

}  // namespace gr::host
