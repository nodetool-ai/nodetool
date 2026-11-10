// `__host.assets`: the asset store, a directory the embedder names in
// HostOptions::assetDir. Keys are relative storage keys
// (`<user>/<id>.<ext>`, `<id>.<ext>`, `assets/<id>`), never paths: a key
// with `..`, a leading `/` or a symlink anywhere below the directory is
// refused. guest/host/storage.mjs wraps it as the context's asset storage
// adapter, which resolves `asset://` and `/api/storage/<key>` refs and holds
// what createAsset writes.
//
//   available()          -> whether an asset directory is granted
//   find(dir, stem)      -> json [key], files directly in dir named <stem>.<ext>, sorted
//   bound()              -> whether a run is bound, so the *Async functions can be used
//
// While a run is bound, the adapter uses the asynchronous functions, which
// return promises and run on the run's I/O lane
// (docs/plans/graph-runner-async-host.md, sections 4.7 and 4.8):
//
//   readAsync(key)       -> Uint8Array, or null when missing
//   writeAsync(key, bytes)
//   statAsync(key)       -> json {size, mtimeMs}, or null
//   listAsync(prefix)    -> json [{key, size, mtimeMs}], every file below prefix, sorted
//   removeAsync(key)     -> whether a file was removed
//
// writeAsync and removeAsync are the jobs of host/asset_destinations.h:
// each takes its place in the process destination queue at the call, so
// writes and removals of one key commit in call order across every run of
// the process. A write stages an exclusive temporary file of its own and
// renames it over the key in its turn. Cancelling the run before that
// rename discards the write, and a rename that happened stays.
//
// Outside a run the adapter uses the synchronous forms, read(key),
// write(key, bytes), stat(key), list(prefix) and remove(key), which refuse
// a call while a run is bound. A synchronous write or removal never waits:
// it takes the key's place in the same destination queue only when no
// queued or active operation holds one, commits on the worker, and
// otherwise fails at once with EBUSY (writeAssetNow in
// host/asset_destinations.h). One key's order thus holds across synchronous
// and asynchronous calls of every runner in the process.
//
// `__host.packageAssets`: shipped sample media, read-only, from
// HostOptions::packageAssetsDir. guest/host/context.mjs resolves
// `package://<pkg>/<path>` refs through it, with the key `<pkg>/<path>` and
// the same key checks as the asset store.
//
//   available()          -> whether a package assets directory is granted
//   read(key)            -> Uint8Array, or null when missing
//   readAsync(key)       -> as read, as a promise on the I/O lane while a run is bound
//   bound()              -> whether a run is bound
//
// `__host.bundleAssets`: resources guest/build.mjs writes next to the
// bundle instead of into it, from HostOptions::bundleAssetsDir. Read-only,
// synchronous, and read once by the guest module that needs them.
//
//   available()          -> whether a bundle assets directory is granted
//   read(name)           -> Uint8Array; throws when missing
//   readText(name)       -> the file as a UTF-8 string; throws when missing
#include "host/asset_destinations.h"
#include "host/assets.h"
#include "host/capabilities.h"
#include "host/file_jobs.h"
#include "host/paths.h"
#include "host/unique_fd.h"
#include "kernel/async_jobs.h"
#include "kernel/destination_queue.h"
#include "kernel/job_inputs.h"

#include <nlohmann/json.hpp>

#include <algorithm>
#include <atomic>
#include <cerrno>
#include <dirent.h>
#include <filesystem>
#include <fcntl.h>
#include <memory>
#include <sys/stat.h>
#include <unistd.h>

using nodetool::jobs::JobCost;
using nodetool::jobs::JobOutcome;

namespace gr::host {

std::atomic<uint64_t>& tempSequence() {
  // native-rules #14: process-wide mutable counter
  static std::atomic<uint64_t> sequence{0};
  return sequence;
}

namespace {

using Args = const std::vector<js::Value>&;

// One granted directory and the operations on it.
//
// Thread affinity: thread-safe, because it is immutable after the install
// built it. The synchronous host functions use it on the worker, and the
// jobs of the asynchronous ones on the I/O lane.
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

  // The first step of an asynchronous read (host/file_jobs.h): the key's
  // file, open, with its size. Null, as read() returns null, when the key
  // is missing or not a regular file.
  std::unique_ptr<OpenedFile> open(const std::string& key) const {
    Resolved r;
    try {
      r = resolve(key, Access::Read, "open");
    } catch (const FsError& e) {
      if (e.code == "ENOENT" || e.code == "ENOTDIR") return nullptr;
      throw;
    }
    // NONBLOCK keeps a FIFO from stalling the open before its type is checked.
    UniqueFd fd(::open(r.real.c_str(), O_RDONLY | O_NOFOLLOW | O_CLOEXEC | O_NONBLOCK));
    if (!fd) throwErrno(errno, "open", key);
    struct stat st {};
    if (::fstat(fd.get(), &st) != 0) throwErrno(errno, "fstat", key);
    if (!S_ISREG(st.st_mode)) return nullptr;
    if (st.st_nlink > 1) throw FsError("EACCES", "open", key, "hard-linked file");
    if (uint64_t(st.st_size) > kMaxReadBytes) throw FsError("EFBIG", "read", key);
    auto file = std::make_unique<OpenedFile>();
    file->fd = std::move(fd);
    file->size = uint64_t(st.st_size);
    file->path = key;
    return file;
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

  // `budget` is what is left of the JSON the listing may produce. Names
  // and entries are counted as they are read, so a larger listing fails
  // before it is held.
  void walk(const std::string& dir, const std::string& prefix, nlohmann::json& out, uint64_t& budget) const {
    std::unique_ptr<DIR, int (*)(DIR*)> d(::opendir(dir.c_str()), ::closedir);
    if (!d) return;
    std::vector<std::string> names;
    while (struct dirent* e = ::readdir(d.get())) {
      std::string name = e->d_name;
      if (name == "." || name == "..") continue;
      spend(budget, name.size(), prefix);
      names.push_back(name);
    }
    std::sort(names.begin(), names.end());
    for (const auto& name : names) {
      std::string path = dir + "/" + name;
      std::string key = prefix.empty() ? name : prefix + "/" + name;
      struct stat st {};
      if (::lstat(path.c_str(), &st) != 0) continue;
      if (S_ISDIR(st.st_mode)) {
        walk(path, key, out, budget);
      } else if (S_ISREG(st.st_mode)) {
        // A key escapes to at most six bytes per byte, with the numbers and
        // the field names around it.
        spend(budget, key.size() * 6 + 64, prefix);
        out.push_back({{"key", key}, {"size", double(st.st_size)}, {"mtimeMs", double(st.st_mtime) * 1000.0}});
      }
      // Symlinks are never listed.
    }
  }

  static void spend(uint64_t& budget, uint64_t bytes, const std::string& prefix) {
    if (bytes > budget) throw FsError("EFBIG", "scandir", prefix, "the asset listing is too large");
    budget -= bytes;
  }

  nlohmann::json list(const std::string& prefix, uint64_t cap = UINT64_MAX) const {
    nlohmann::json out = nlohmann::json::array();
    if (roots.empty()) return out;
    uint64_t budget = cap;
    if (prefix.empty()) {
      walk(root(), "", out, budget);
      return out;
    }
    Resolved r;
    try {
      r = resolve(prefix, Access::Read, "scandir");
    } catch (const FsError& e) {
      if (e.code == "ENOENT" || e.code == "ENOTDIR") return out;
      throw;
    }
    walk(r.real, prefix, out, budget);
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
};

// What an asynchronous host function needs before it copies its arguments:
// the bound run, its I/O lane, and a reservation on the run.
//
// Thread affinity: worker only, for the length of one host function call.
struct Submission {
  AsyncRun& run;
  nodetool::jobs::JobExecutor& io;
  nodetool::jobs::Reservation reservation;
};

Submission begin(const RunBinding& binding) {
  AsyncRun* run = binding.run();
  nodetool::jobs::JobExecutor* io = binding.io();
  if (!run || !io) throw std::runtime_error("asynchronous asset operations need a running graph");
  return Submission{*run, *io, run->reserve()};
}

std::string keyArg(js::Engine& en, Args a, nodetool::jobs::Reservation& reservation) {
  if (a.empty() || !en.isString(a[0])) throw std::invalid_argument("Invalid storage key: the key must be a string");
  return snapshotString(en, a[0], "key", reservation);
}

ResultConverter textConverter() {
  return [](ResultConversion& conversion) -> js::Value {
    auto* text = dynamic_cast<TextResult*>(conversion.payload());
    if (!text) throw std::logic_error("an asset job delivered an unexpected payload");
    conversion.chargeCopy(text->text.size());
    return conversion.engine().string(text->text);
  };
}

// An asynchronous read of `key` from `assets`: the open step here, the read
// step from the converter.
js::Value readAsync(js::Engine& en, Args a, const std::shared_ptr<const Assets>& assets,
                    const std::shared_ptr<RunBinding>& binding) {
  Submission s = begin(*binding);
  std::string key = keyArg(en, a, s.reservation);
  const JobCost cost{key.size(), 0, 0};
  auto job = makeCostedJob(cost, [assets, key = std::move(key)](std::stop_token) {
    return JobOutcome::value(assets->open(key));
  });
  return s.run.submit(s.io, std::move(job), wholeFileConverter(binding), true, std::move(s.reservation));
}

}  // namespace

void installAssets(js::Engine& e, const js::Value& object, const HostOptions& options) {
  // Shared by the host functions below and the jobs of the asynchronous
  // ones, which may run after the install is gone. Immutable.
  auto assets = std::make_shared<Assets>();
  if (!options.assetDir.empty()) assets->roots = canonicalRoots({{options.assetDir, true}});
  const std::shared_ptr<const Assets> store = std::move(assets);
  // Shared with the engine's host state and every function that submits.
  const std::shared_ptr<RunBinding> binding = RunBinding::of(e);
  // The key of a synchronous call, which only runs outside a run.
  auto key = [binding](js::Engine& en, Args a) {
    if (binding->run()) {
      throw std::runtime_error("the synchronous asset functions run only outside a run: use the *Async functions");
    }
    return a.empty() ? std::string() : en.toString(a[0]);
  };

  e.set(object, "available", e.function("available", 0, [store](js::Engine& en, Args) {
    return en.boolean(!store->roots.empty());
  }));
  e.set(object, "read", e.function("read", 1, [store, key](js::Engine& en, Args a) {
    auto data = store->read(key(en, a));
    return data ? en.bytes(data->data(), data->size()) : en.null();
  }));
  e.set(object, "write", e.function("write", 2, [store, key](js::Engine& en, Args a) {
    if (a.size() < 2 || !en.isBytes(a[1])) throw std::runtime_error("assets.write needs bytes");
    writeAssetNow(processDestinationQueue(), store->roots, key(en, a), en.toBytes(a[1]));
    return en.undefined();
  }));
  e.set(object, "stat", e.function("stat", 1, [store, key](js::Engine& en, Args a) {
    return en.string(store->stat(key(en, a)).dump());
  }));
  e.set(object, "list", e.function("list", 1, [store, key](js::Engine& en, Args a) {
    return en.string(store->list(key(en, a)).dump());
  }));
  // Synchronous during a run too: the guest's findStem is synchronous.
  e.set(object, "find", e.function("find", 2, [store](js::Engine& en, Args a) {
    const std::string dir = a.empty() ? std::string() : en.toString(a[0]);
    const std::string stem = a.size() < 2 ? std::string() : en.toString(a[1]);
    return en.string(store->find(dir, stem).dump());
  }));
  e.set(object, "remove", e.function("remove", 1, [store, key](js::Engine& en, Args a) {
    return en.boolean(removeAssetNow(processDestinationQueue(), store->roots, key(en, a)));
  }));

  e.set(object, "bound", e.function("bound", 0, [binding](js::Engine& en, Args) {
    return en.boolean(binding->run() != nullptr);
  }));
  e.set(object, "readAsync", e.function("readAsync", 1, [store, binding](js::Engine& en, Args a) {
    return readAsync(en, a, store, binding);
  }));
  // Cancellable: the run's cancellation before the commit discards the
  // write (host/asset_destinations.h).
  e.set(object, "writeAsync", e.function("writeAsync", 2, [store, binding](js::Engine& en, Args a) {
    Submission s = begin(*binding);
    std::string name = keyArg(en, a, s.reservation);
    // The key is checked before its bytes are copied.
    assetDestination(store->roots, name);
    if (a.size() < 2) throw std::runtime_error("assets.write needs bytes");
    std::vector<uint8_t> bytes = snapshotBytes(en, a[1], "bytes", s.reservation);
    auto job = makeAssetWriteJob(processDestinationQueue(), s.io, store->roots, std::move(name), std::move(bytes));
    return s.run.submit(s.io, std::move(job), nullptr, true, std::move(s.reservation));
  }));
  e.set(object, "removeAsync", e.function("removeAsync", 1, [store, binding](js::Engine& en, Args a) {
    Submission s = begin(*binding);
    std::string name = keyArg(en, a, s.reservation);
    auto job = makeAssetRemoveJob(processDestinationQueue(), s.io, store->roots, std::move(name));
    return s.run.submit(
        s.io, std::move(job),
        [](js::Engine& engine, nodetool::jobs::JobPayload* payload) {
          auto* removed = dynamic_cast<AssetRemoved*>(payload);
          return engine.boolean(removed && removed->removed);
        },
        true, std::move(s.reservation));
  }));
  e.set(object, "statAsync", e.function("statAsync", 1, [store, binding](js::Engine& en, Args a) {
    Submission s = begin(*binding);
    std::string name = keyArg(en, a, s.reservation);
    const JobCost cost{name.size(), kMetadataBytes, 0};
    auto job = makeCostedJob(cost, [store, name = std::move(name)](std::stop_token) {
      return JobOutcome::value(std::make_unique<TextResult>(store->stat(name).dump()));
    });
    return s.run.submit(s.io, std::move(job), textConverter(), true, std::move(s.reservation));
  }));
  e.set(object, "listAsync", e.function("listAsync", 1, [store, binding](js::Engine& en, Args a) {
    Submission s = begin(*binding);
    std::string prefix = a.empty() || en.isUndefined(a[0]) ? std::string() : keyArg(en, a, s.reservation);
    const JobCost cost{prefix.size(), kMaxListingBytes, 0};
    auto job = makeCostedJob(cost, [store, prefix = std::move(prefix)](std::stop_token) {
      return JobOutcome::value(std::make_unique<TextResult>(store->list(prefix, kMaxListingBytes).dump()));
    });
    return s.run.submit(s.io, std::move(job), textConverter(), true, std::move(s.reservation));
  }));
}

void installPackageAssets(js::Engine& e, const js::Value& object, const HostOptions& options) {
  // Shared by the host functions below and the jobs of the asynchronous
  // read, which may run after the install is gone. Immutable.
  auto assets = std::make_shared<Assets>();
  if (!options.packageAssetsDir.empty()) assets->roots = canonicalRoots({{options.packageAssetsDir, false}});
  const std::shared_ptr<const Assets> store = std::move(assets);
  const std::shared_ptr<RunBinding> binding = RunBinding::of(e);
  auto requireRoot = [store](const std::string& key) {
    if (store->roots.empty()) {
      throw std::runtime_error("package://" + key +
                               ": the native runner has no package assets directory (--package-assets)");
    }
  };
  e.set(object, "available", e.function("available", 0, [store](js::Engine& en, Args) {
    return en.boolean(!store->roots.empty());
  }));
  e.set(object, "read", e.function("read", 1, [store, requireRoot](js::Engine& en, Args a) {
    const std::string key = a.empty() ? std::string() : en.toString(a[0]);
    requireRoot(key);
    auto data = store->read(key);
    return data ? en.bytes(data->data(), data->size()) : en.null();
  }));
  e.set(object, "bound", e.function("bound", 0, [binding](js::Engine& en, Args) {
    return en.boolean(binding->run() != nullptr);
  }));
  e.set(object, "readAsync", e.function("readAsync", 1, [store, binding, requireRoot](js::Engine& en, Args a) {
    requireRoot(a.empty() ? std::string() : en.toString(a[0]));
    return readAsync(en, a, store, binding);
  }));
}

void installBundleAssets(js::Engine& e, const js::Value& object, const HostOptions& options) {
  // Shared by the host functions below. Immutable.
  auto assets = std::make_shared<Assets>();
  if (!options.bundleAssetsDir.empty()) assets->roots = canonicalRoots({{options.bundleAssetsDir, false}});
  const std::shared_ptr<const Assets> store = std::move(assets);
  auto load = [store](js::Engine& en, Args a) {
    const std::string name = a.empty() ? std::string() : en.toString(a[0]);
    if (store->roots.empty()) {
      throw std::runtime_error("bundle asset " + name +
                               ": the native runner has no bundle assets directory (<bundle>.assets)");
    }
    auto data = store->read(name);
    if (!data) throw std::runtime_error("bundle asset " + name + " is missing from " + store->root());
    return std::move(*data);
  };
  e.set(object, "available", e.function("available", 0, [store](js::Engine& en, Args) {
    return en.boolean(!store->roots.empty());
  }));
  e.set(object, "read", e.function("read", 1, [load](js::Engine& en, Args a) {
    const std::vector<uint8_t> data = load(en, a);
    return en.bytes(data.data(), data.size());
  }));
  e.set(object, "readText", e.function("readText", 1, [load](js::Engine& en, Args a) {
    const std::vector<uint8_t> data = load(en, a);
    return en.string(std::string_view(reinterpret_cast<const char*>(data.data()), data.size()));
  }));
}

}  // namespace gr::host

namespace gr {

std::string defaultBundleAssetsDir(const std::string& bundlePath) {
  std::filesystem::path path(bundlePath);
  return (path.parent_path() / (path.stem().string() + ".assets")).string();
}

}  // namespace gr
