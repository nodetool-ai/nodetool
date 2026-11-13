// Tests for the host capabilities (src/host/): what node code reaches through
// globalThis.__host, called from JavaScript as the guest calls it. Each
// capability is checked for its success path, refusal when the embedder
// granted nothing, and escapes: `..`, absolute paths, symlinks and hard
// links out of a granted directory.
#include "host/assets.h"
#include "host/capabilities.h"
#include "host/context.h"
#include "host/http.h"
#include "js/engine.h"
#include "nodetool/kernels.h"

#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <atomic>
#include <barrier>
#include <fstream>
#include <map>
#include <thread>
#include <functional>
#include <string>
#include <unistd.h>
#include <vector>

namespace {

// native-rules #14: file-scope mutable test counters
int failures = 0;
int checks = 0;

#define CHECK(cond)                                                    \
  do {                                                                 \
    ++checks;                                                          \
    if (!(cond)) {                                                     \
      ++failures;                                                      \
      std::fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__,      \
                   __LINE__, #cond);                                   \
    }                                                                  \
  } while (0)

namespace fs = std::filesystem;
namespace js = gr::js;

// A temporary directory tree, removed at the end of the test.
struct TempDir {
  fs::path root;
  TempDir() {
    std::string tmpl = (fs::temp_directory_path() / "gr-host-XXXXXX").string();
    // Canonical, so expected paths match the real paths the host returns when
    // the temporary directory sits below a symlink (/var on macOS).
    root = fs::canonical(fs::path(::mkdtemp(tmpl.data())));
  }
  ~TempDir() {
    std::error_code ec;
    fs::remove_all(root, ec);
  }
  std::string path(const std::string& rel) const { return (root / rel).string(); }
};

void writeText(const std::string& path, const std::string& text) {
  fs::create_directories(fs::path(path).parent_path());
  std::ofstream(path, std::ios::binary) << text;
}

std::string readText(const std::string& path) {
  std::ifstream in(path, std::ios::binary);
  return std::string(std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>());
}

// An engine with every capability installed as globalThis.__host.
std::unique_ptr<js::Engine> engineWith(const gr::HostOptions& options) {
  auto e = js::createQuickJsEngine();
  js::Value host = e->object();
  for (const auto& capability : gr::host::capabilities()) {
    js::Value object = e->object();
    capability.install(*e, object, options);
    e->set(host, capability.name, object);
  }
  e->set(e->global(), "__host", host);
  e->evaluateScript(
      "globalThis.attempt = (f) => { try { const r = f(); return r === undefined ? 'ok' : String(r); } "
      "catch (e) { return 'error: ' + e.message; } };"
      "globalThis.text = (b) => String.fromCharCode(...b);"
      "globalThis.bytes = (s) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));",
      "helpers.js");
  return e;
}

// Runs `body` as attempt(() => body) and returns its string.
std::string run(js::Engine& e, const std::string& body) {
  return e.toString(e.evaluateScript("attempt(() => " + body + ")", "test.js"));
}

std::string lit(const std::string& s) {  // a JavaScript string literal
  std::string out = "\"";
  for (char c : s) {
    if (c == '"' || c == '\\') out += '\\';
    out += c;
  }
  return out + "\"";
}

bool startsWith(const std::string& s, const std::string& prefix) { return s.rfind(prefix, 0) == 0; }

// --- files ------------------------------------------------------------------

void filesGrantNothingByDefault() {
  TempDir t;
  writeText(t.path("secret.txt"), "hidden");
  auto e = engineWith({});
  CHECK(run(*e, "__host.files.cwd()") == "");
  CHECK(startsWith(run(*e, "__host.files.readFile(" + lit(t.path("secret.txt")) + ")"), "error: EACCES"));
  CHECK(startsWith(run(*e, "__host.files.readFile('notes.txt')"), "error: EACCES"));
  CHECK(startsWith(run(*e, "__host.files.writeFile(" + lit(t.path("new.txt")) + ", bytes('x'), false)"),
                   "error: EACCES"));
  CHECK(!fs::exists(t.path("new.txt")));
}

void filesCreatePrivateTemporaryDirectories() {
  TempDir t;
  fs::create_directories(t.path("ws"));
  fs::create_directories(t.path("readonly"));
  gr::HostOptions options;
  options.workspaceDir = t.path("ws");
  options.readRoots.push_back(t.path("readonly"));
  auto engine = engineWith(options);
  const auto first = run(*engine, "__host.files.mkdtemp('clip-')");
  const auto second = run(*engine, "__host.files.mkdtemp('clip-')");
  CHECK(first != second);
  fs::create_symlink(t.path("outside"), t.path("ws/alias-XXXXXX"));
  const auto aliasPrefix = run(*engine, "__host.files.mkdtemp('alias-')");
  CHECK(startsWith(aliasPrefix, t.path("ws/alias-")));
  CHECK(fs::is_directory(aliasPrefix));
  CHECK(!fs::exists(t.path("outside")));
  const auto emptyPrefix = run(*engine, "__host.files.mkdtemp('')");
  CHECK(fs::path(emptyPrefix).parent_path() == fs::canonical(t.path("ws")));
  CHECK(fs::path(emptyPrefix).filename().string().size() == 6);
  CHECK(startsWith(first, t.path("ws/clip-")));
  CHECK(first.size() == t.path("ws/clip-").size() + 6);
  CHECK(fs::is_directory(first));
  if (fs::is_directory(first)) {
    const auto permissions = fs::status(first).permissions();
    CHECK((permissions & (fs::perms::group_all | fs::perms::others_all)) == fs::perms::none);
  }
  CHECK(startsWith(run(*engine, "__host.files.mkdtemp('../escape-')"), "error: EACCES"));
  CHECK(startsWith(run(*engine, "__host.files.mkdtemp(" + lit(t.path("readonly/clip-")) + ")"), "error: EACCES"));
  CHECK(startsWith(run(*engine, "__host.files.mkdtemp('missing/clip-')"), "error: ENOENT"));
  auto denied = engineWith({});
  CHECK(startsWith(run(*denied, "__host.files.mkdtemp(" + lit(t.path("no-grant-")) + ")"), "error: EACCES"));
}

void filesReadAndWriteInTheWorkspace() {
  TempDir t;
  fs::create_directories(t.path("ws"));
  gr::HostOptions o;
  o.workspaceDir = t.path("ws");
  auto e = engineWith(o);
  std::string ws = fs::canonical(t.path("ws")).string();
  CHECK(run(*e, "__host.files.cwd()") == ws);

  // A missing parent is ENOENT until mkdir creates it.
  CHECK(startsWith(run(*e, "__host.files.writeFile('out/a.txt', bytes('hi'), false)"), "error: ENOENT"));
  CHECK(run(*e, "__host.files.mkdir('out/deep', true)") == ws + "/out");
  CHECK(run(*e, "__host.files.writeFile('out/a.txt', bytes('hi'), false)") == "ok");
  CHECK(run(*e, "__host.files.writeFile('out/a.txt', bytes(' there'), true)") == "ok");
  CHECK(readText(t.path("ws/out/a.txt")) == "hi there");
  CHECK(run(*e, "text(__host.files.readFile('out/a.txt'))") == "hi there");
  CHECK(run(*e, "text(__host.files.readFile(" + lit(ws + "/out/a.txt") + "))") == "hi there");
  CHECK(run(*e, "__host.files.readdir('out')") == R"([["a.txt","file"],["deep","directory"]])");
  CHECK(run(*e, "JSON.parse(__host.files.stat('out/a.txt', true)).size") == "8");
  CHECK(startsWith(run(*e, "__host.files.readFile('out/missing.txt')"), "error: ENOENT: no such file or directory, open 'out/missing.txt'"));
  CHECK(startsWith(run(*e, "__host.files.readFile('out')"), "error: EISDIR"));
  CHECK(run(*e, "__host.files.copyFile('out/a.txt', 'out/b.txt')") == "ok");
  CHECK(run(*e, "__host.files.rename('out/b.txt', 'out/c.txt')") == "ok");
  CHECK(readText(t.path("ws/out/c.txt")) == "hi there" && !fs::exists(t.path("ws/out/b.txt")));
  CHECK(startsWith(run(*e, "__host.files.rm('out', false, false)"), "error: EISDIR"));
  CHECK(run(*e, "__host.files.rm('out', true, false)") == "ok");
  CHECK(!fs::exists(t.path("ws/out")));
  CHECK(run(*e, "__host.files.rm('gone', false, true)") == "ok");
  // The workspace itself cannot be removed.
  CHECK(startsWith(run(*e, "__host.files.rm('.', true, false)"), "error: EACCES"));
  CHECK(fs::exists(t.path("ws")));
  CHECK(startsWith(run(*e, "__host.files.readFile('a\\u0000b')"), "error: EINVAL"));
}

void filesRefuseEscapes() {
  TempDir t;
  fs::create_directories(t.path("ws/sub"));
  writeText(t.path("outside.txt"), "outside");
  writeText(t.path("ws/inside.txt"), "inside");
  fs::create_directories(t.path("elsewhere"));
  gr::HostOptions o;
  o.workspaceDir = t.path("ws");
  auto e = engineWith(o);

  // `..` and absolute paths out of the workspace.
  CHECK(startsWith(run(*e, "__host.files.readFile('../outside.txt')"), "error: EACCES"));
  CHECK(startsWith(run(*e, "__host.files.readFile('sub/../../outside.txt')"), "error: EACCES"));
  CHECK(startsWith(run(*e, "__host.files.readFile(" + lit(t.path("outside.txt")) + ")"), "error: EACCES"));
  CHECK(startsWith(run(*e, "__host.files.readFile(" + lit(t.path("ws/../outside.txt")) + ")"), "error: EACCES"));
  CHECK(startsWith(run(*e, "__host.files.readFile('/etc/passwd')"), "error: EACCES"));
  CHECK(startsWith(run(*e, "__host.files.writeFile('../written.txt', bytes('x'), false)"), "error: EACCES"));
  CHECK(!fs::exists(t.path("written.txt")));
  CHECK(startsWith(run(*e, "__host.files.mkdir('../made', true)"), "error: EACCES"));
  CHECK(!fs::exists(t.path("made")));
  // `..` that stays inside is fine.
  CHECK(run(*e, "text(__host.files.readFile('sub/../inside.txt'))") == "inside");

  // A symlink to a file outside, to a directory outside, and a dangling one.
  fs::create_symlink(t.path("outside.txt"), t.path("ws/link.txt"));
  fs::create_directory_symlink(t.path("elsewhere"), t.path("ws/door"));
  fs::create_symlink(t.path("elsewhere/new.txt"), t.path("ws/dangling.txt"));
  CHECK(startsWith(run(*e, "__host.files.readFile('link.txt')"), "error: EACCES"));
  CHECK(startsWith(run(*e, "__host.files.stat('link.txt', true)"), "error: EACCES"));
  CHECK(startsWith(run(*e, "__host.files.writeFile('door/x.txt', bytes('x'), false)"), "error: EACCES"));
  CHECK(startsWith(run(*e, "__host.files.writeFile('dangling.txt', bytes('x'), false)"), "error: EACCES"));
  CHECK(startsWith(run(*e, "__host.files.readdir('door')"), "error: EACCES"));
  CHECK(fs::is_empty(t.path("elsewhere")));
  CHECK(readText(t.path("outside.txt")) == "outside");
  // A symlink that stays inside the workspace is followed.
  fs::create_symlink(t.path("ws/inside.txt"), t.path("ws/alias.txt"));
  CHECK(run(*e, "text(__host.files.readFile('alias.txt'))") == "inside");
  // A hard link can alias a file outside: refused.
  fs::create_hard_link(t.path("outside.txt"), t.path("ws/hard.txt"));
  CHECK(startsWith(run(*e, "__host.files.readFile('hard.txt')"), "error: EACCES"));
}

void filesReadRootsAreReadOnly() {
  TempDir t;
  writeText(t.path("library/a.txt"), "shelf");
  gr::HostOptions o;
  o.readRoots = {t.path("library")};
  auto e = engineWith(o);
  CHECK(run(*e, "text(__host.files.readFile(" + lit(t.path("library/a.txt")) + "))") == "shelf");
  CHECK(startsWith(run(*e, "__host.files.writeFile(" + lit(t.path("library/b.txt")) + ", bytes('x'), false)"),
                   "error: EACCES"));
  CHECK(startsWith(run(*e, "__host.files.rm(" + lit(t.path("library/a.txt")) + ", false, false)"), "error: EACCES"));
  CHECK(!fs::exists(t.path("library/b.txt")) && fs::exists(t.path("library/a.txt")));
  // Without a workspace there is no directory for relative paths.
  CHECK(startsWith(run(*e, "__host.files.readFile('a.txt')"), "error: EACCES"));
}

void filesAcceptTheRootAsNamed() {
  // The workspace named through a symlink: paths under either spelling work.
  TempDir t;
  fs::create_directories(t.path("real"));
  fs::create_directory_symlink(t.path("real"), t.path("named"));
  gr::HostOptions o;
  o.workspaceDir = t.path("named");
  auto e = engineWith(o);
  CHECK(run(*e, "__host.files.writeFile(" + lit(t.path("named/a.txt")) + ", bytes('x'), false)") == "ok");
  CHECK(readText(t.path("real/a.txt")) == "x");
}

void filesAllowOnlyTheGrantedSqliteDirectory() {
  TempDir t;
  fs::create_directories(t.path("db"));
  fs::create_directories(t.path("ws"));
  gr::HostOptions o;
  o.sqliteDirectory = t.path("db");
  auto e = engineWith(o);
  CHECK(run(*e, "__host.files.cwd()") == "");
  CHECK(run(*e, "__host.files.mkdir(" + lit(t.path("db/vectors")) + ", true)") == t.path("db/vectors"));
  CHECK(run(*e, "__host.files.writeFile(" + lit(t.path("db/vectors/a")) + ", bytes('x'), false)") == "ok");
  CHECK(startsWith(run(*e, "__host.files.mkdir(" + lit(t.path("db/../escape")) + ", true)"), "error: EACCES"));
  fs::create_directory_symlink(t.path("ws"), t.path("db/link"));
  CHECK(startsWith(run(*e, "__host.files.writeFile(" + lit(t.path("db/link/a")) + ", bytes('x'), false)"), "error: EACCES"));
  o.workspaceDir = t.path("ws");
  e = engineWith(o);
  CHECK(run(*e, "__host.files.cwd()") == t.path("ws"));
  CHECK(run(*e, "__host.files.writeFile('relative', bytes('x'), false)") == "ok");
  CHECK(fs::exists(t.path("ws/relative")) && !fs::exists(t.path("db/relative")));
}

// --- assets -----------------------------------------------------------------

void assetsGrantNothingByDefault() {
  auto e = engineWith({});
  CHECK(run(*e, "__host.assets.available()") == "false");
  CHECK(startsWith(run(*e, "__host.assets.read('a.png')"), "error: EACCES"));
  CHECK(run(*e, "__host.assets.list('')") == "[]");
}

void assetsStoreAndRefuseEscapes() {
  TempDir t;
  fs::create_directories(t.path("assets"));
  writeText(t.path("outside.png"), "outside");
  gr::HostOptions o;
  o.assetDir = t.path("assets");
  auto e = engineWith(o);
  CHECK(run(*e, "__host.assets.available()") == "true");
  CHECK(run(*e, "__host.assets.write('default/abc.png', bytes('png'))") == "ok");
  CHECK(readText(t.path("assets/default/abc.png")) == "png");
  CHECK(run(*e, "text(__host.assets.read('default/abc.png'))") == "png");
  CHECK(run(*e, "__host.assets.read('default/none.png')") == "null");
  CHECK(run(*e, "JSON.parse(__host.assets.list('')).map((x) => x.key).join()") == "default/abc.png");
  CHECK(run(*e, "JSON.parse(__host.assets.stat('default/abc.png')).size") == "3");
  CHECK(run(*e, "__host.assets.remove('default/abc.png')") == "true");
  CHECK(run(*e, "__host.assets.remove('default/abc.png')") == "false");

  CHECK(startsWith(run(*e, "__host.assets.read('../outside.png')"), "error: Invalid storage key"));
  CHECK(startsWith(run(*e, "__host.assets.read(" + lit(t.path("outside.png")) + ")"), "error: Invalid storage key"));
  CHECK(startsWith(run(*e, "__host.assets.write('a/../../x.png', bytes('x'))"), "error: Invalid storage key"));
  fs::create_symlink(t.path("outside.png"), t.path("assets/link.png"));
  CHECK(startsWith(run(*e, "__host.assets.read('link.png')"), "error: EACCES"));
  fs::create_directory_symlink(t.path(""), t.path("assets/up"));
  CHECK(startsWith(run(*e, "__host.assets.read('up/outside.png')"), "error: EACCES"));
  CHECK(startsWith(run(*e, "__host.assets.write('up/new.png', bytes('x'))"), "error: EACCES"));
  CHECK(!fs::exists(t.path("new.png")));
  CHECK(run(*e, "JSON.parse(__host.assets.list('')).length") == "0");  // symlinks are not listed
}

// Concurrent writes to one key each use their own exclusive temporary file.
// Writers start each round together at a barrier while a reader reads the
// destination throughout: every read must be one complete payload. A
// synchronous write never waits for another one on the same key: one that
// finds the key busy fails at once with EBUSY.
void assetsConcurrentWritesStayWhole() {
  TempDir t;
  fs::create_directories(t.path("assets"));
  gr::HostOptions o;
  o.assetDir = t.path("assets");
  constexpr int threads = 6;
  constexpr int rounds = 60;
  constexpr size_t size = 256 * 1024;
  const std::string dest = t.path("assets/default/same.bin");
  {
    auto seed = engineWith(o);
    CHECK(run(*seed, "__host.assets.write('default/same.bin', new Uint8Array(" + std::to_string(size) + ").fill(65))") == "ok");
  }
  std::atomic<int> errors{0};
  std::atomic<int> busy{0};
  std::atomic<int> written{0};
  std::atomic<int> badReads{0};
  std::atomic<int> reads{0};
  std::atomic<bool> done{false};
  std::barrier sync(threads);
  std::thread reader([&] {
    while (!done) {
      if (!fs::exists(dest)) continue;  // absent is acceptable, partial is not
      const std::string bytes = readText(dest);
      ++reads;
      bool whole = bytes.size() == size;
      for (char c : bytes) whole = whole && c == bytes[0] && c >= 'A' && c < 'A' + threads;
      if (!whole) ++badReads;
    }
  });
  std::vector<std::thread> workers;
  for (int i = 0; i < threads; ++i) {
    workers.emplace_back([&, i] {
      auto e = engineWith(o);
      const std::string script = "__host.assets.write('default/same.bin', new Uint8Array(" + std::to_string(size) +
                                 ").fill(" + std::to_string(65 + i) + "))";
      for (int round = 0; round < rounds; ++round) {
        sync.arrive_and_wait();
        const std::string result = run(*e, script);
        if (result == "ok") {
          ++written;
        } else if (startsWith(result, "error: EBUSY")) {
          ++busy;
        } else {
          ++errors;
        }
      }
    });
  }
  for (auto& w : workers) w.join();
  done = true;
  reader.join();
  CHECK(errors == 0);
  CHECK(written > 0);
  CHECK(written + busy == threads * rounds);
  CHECK(reads > 0);
  CHECK(badReads == 0);
  const std::string final = readText(dest);
  CHECK(final.size() == size);
  CHECK(!final.empty() && final[0] >= 'A' && final[0] < 'A' + threads);
  size_t entries = 0;
  for (const auto& entry : fs::directory_iterator(t.path("assets/default"))) {
    ++entries;
    CHECK(entry.path().filename() == "same.bin");
  }
  CHECK(entries == 1);
}

// A temporary name that already exists forces a retry with the next name, and
// the write leaves the other file alone.
void assetsTempNameCollisionRetries() {
  TempDir t;
  fs::create_directories(t.path("assets/default"));
  gr::HostOptions o;
  o.assetDir = t.path("assets");
  auto e = engineWith(o);
  const auto next = gr::host::tempSequence().load();
  const std::string base = t.path("assets/default/c.bin.tmp-") + std::to_string(::getpid()) + "-";
  for (uint64_t k = next; k < next + 3; ++k) writeText(base + std::to_string(k), "squatter");
  CHECK(run(*e, "__host.assets.write('default/c.bin', bytes('real'))") == "ok");
  CHECK(readText(t.path("assets/default/c.bin")) == "real");
  CHECK(gr::host::tempSequence().load() == next + 4);  // three collisions, then success
  for (uint64_t k = next; k < next + 3; ++k) CHECK(readText(base + std::to_string(k)) == "squatter");
  CHECK(!fs::exists(base + std::to_string(next + 3)));
  size_t entries = 0;
  for (const auto& entry : fs::directory_iterator(t.path("assets/default"))) { (void)entry; ++entries; }
  CHECK(entries == 4);  // c.bin and the three squatters
}

// A rename that fails removes the operation's own temporary file and nothing else.
void assetsFailedRenameCleansUp() {
  TempDir t;
  fs::create_directories(t.path("assets/default/blocked.bin"));  // a directory cannot be replaced by a file
  writeText(t.path("assets/default/blocked.bin/keep"), "x");
  writeText(t.path("assets/default/other.tmp-1-1"), "bystander");
  gr::HostOptions o;
  o.assetDir = t.path("assets");
  auto e = engineWith(o);
  CHECK(startsWith(run(*e, "__host.assets.write('default/blocked.bin', bytes('data'))"), "error: "));
  CHECK(fs::is_directory(t.path("assets/default/blocked.bin")));
  CHECK(readText(t.path("assets/default/other.tmp-1-1")) == "bystander");
  size_t entries = 0;
  for (const auto& entry : fs::directory_iterator(t.path("assets/default"))) { (void)entry; ++entries; }
  CHECK(entries == 2);  // blocked.bin and the bystander, no temp of ours
}

// --- package assets ---------------------------------------------------------

void packageAssetsFailWithoutADirectory() {
  auto e = engineWith({});
  CHECK(run(*e, "__host.packageAssets.available()") == "false");
  CHECK(run(*e, "__host.packageAssets.read('nodetool-base/voice.wav')") ==
        "error: package://nodetool-base/voice.wav: the native runner has no package assets directory (--package-assets)");
}

void packageAssetsReadAndRefuseEscapes() {
  TempDir t;
  writeText(t.path("pkg/nodetool-base/recipe-inputs/voice.wav"), "wav");
  writeText(t.path("outside.txt"), "outside");
  gr::HostOptions o;
  o.packageAssetsDir = t.path("pkg");
  auto e = engineWith(o);
  CHECK(run(*e, "__host.packageAssets.available()") == "true");
  CHECK(run(*e, "text(__host.packageAssets.read('nodetool-base/recipe-inputs/voice.wav'))") == "wav");
  CHECK(run(*e, "__host.packageAssets.read('nodetool-base/missing.wav')") == "null");
  CHECK(run(*e, "typeof __host.packageAssets.write") == "undefined");  // read-only

  CHECK(startsWith(run(*e, "__host.packageAssets.read('../outside.txt')"), "error: Invalid storage key"));
  CHECK(startsWith(run(*e, "__host.packageAssets.read('nodetool-base/../../outside.txt')"), "error: Invalid storage key"));
  CHECK(startsWith(run(*e, "__host.packageAssets.read(" + lit(t.path("outside.txt")) + ")"), "error: Invalid storage key"));
  fs::create_symlink(t.path("outside.txt"), t.path("pkg/nodetool-base/link.wav"));
  CHECK(startsWith(run(*e, "__host.packageAssets.read('nodetool-base/link.wav')"), "error: EACCES"));
}

// --- bundle assets ----------------------------------------------------------

void bundleAssetsReadAndRefuseEscapes() {
  TempDir t;
  writeText(t.path("guest.assets/fonts/a.ttf"), "ttf");
  writeText(t.path("outside.txt"), "outside");
  CHECK(gr::defaultBundleAssetsDir(t.path("guest.bin")) == t.path("guest.assets"));
  CHECK(gr::defaultBundleAssetsDir(t.path("guest.js")) == t.path("guest.assets"));
  {
    auto e = engineWith({});
    CHECK(run(*e, "__host.bundleAssets.available()") == "false");
    CHECK(startsWith(run(*e, "__host.bundleAssets.read('fonts/a.ttf')"), "error: bundle asset fonts/a.ttf: the native runner has no bundle assets directory"));
  }
  gr::HostOptions o;
  o.bundleAssetsDir = t.path("guest.assets");
  auto e = engineWith(o);
  CHECK(run(*e, "__host.bundleAssets.available()") == "true");
  CHECK(run(*e, "text(__host.bundleAssets.read('fonts/a.ttf'))") == "ttf");
  CHECK(run(*e, "__host.bundleAssets.readText('fonts/a.ttf')") == "ttf");
  CHECK(startsWith(run(*e, "__host.bundleAssets.read('fonts/missing.ttf')"), "error: bundle asset fonts/missing.ttf is missing"));
  CHECK(startsWith(run(*e, "__host.bundleAssets.read('../outside.txt')"), "error: Invalid storage key"));
}

// --- providers --------------------------------------------------------------

void fakeProvidersDropProviderGrants() {
  gr::HostOptions o;
  for (const char* name : {"provider:p:open", "prediction:p:text_to_image", "provider:p:jobs:start", "model:getJob"}) {
    o.context.operations[name] = [](const std::string&) { return std::string("null"); };
  }
  auto real = engineWith(o);
  CHECK(run(*real, "__host.providers.fake()") == "false");
  CHECK(run(*real, "__host.context.has('provider:p:open') && __host.context.has('prediction:p:text_to_image')") == "true");
  o.fakeProviders = true;
  auto e = engineWith(o);
  CHECK(run(*e, "__host.providers.fake()") == "true");
  CHECK(run(*e, "__host.context.has('provider:p:open')") == "false");
  CHECK(run(*e, "__host.context.has('prediction:p:text_to_image')") == "false");
  CHECK(run(*e, "__host.context.has('provider:p:jobs:start')") == "false");
  CHECK(run(*e, "__host.context.has('model:getJob')") == "true");  // other grants stay
}

// --- context call rules -----------------------------------------------------

std::string callContext(js::Engine& e, const std::string& op, const std::string& payload = "{}") {
  return run(e, "__host.context.call(" + lit(op) + ", " + lit(payload) + ")");
}

void contextCallRules() {
  auto echo = [](const std::string& in) { return in; };
  // Not granted.
  {
    gr::HostOptions o;
    o.context.operations["model:get"] = echo;
    auto e = engineWith(o);
    CHECK(callContext(*e, "model:get", "\"x\"") == "\"x\"");
    CHECK(callContext(*e, "model:other") == "error: ProcessingContext service 'model:other' is not granted");
  }
  // Cancellation before the call, and the cleanup exemption after it.
  {
    bool cancelled = false;
    int ran = 0;
    gr::HostOptions o;
    o.context.cancelled = [&] { return cancelled; };
    o.context.operations["model:get"] = [&](const std::string& in) { ++ran; return in; };
    o.context.operations["provider:p:close"] = [&](const std::string& in) { ++ran; return in; };
    auto e = engineWith(o);
    CHECK(callContext(*e, "model:get") == "{}");
    cancelled = true;
    CHECK(callContext(*e, "model:get") == "error: Run cancelled");
    CHECK(ran == 1);
    CHECK(callContext(*e, "provider:p:close") == "{}");
    CHECK(ran == 2);
  }
  // Cancellation during the call fails the response, except for cleanup.
  {
    bool cancelled = false;
    int ran = 0;
    gr::HostOptions o;
    o.context.cancelled = [&] { return cancelled; };
    o.context.operations["model:get"] = [&](const std::string& in) { ++ran; cancelled = true; return in; };
    o.context.operations["provider:p:close"] = [&](const std::string& in) { ++ran; cancelled = true; return in; };
    auto e = engineWith(o);
    CHECK(callContext(*e, "provider:p:close") == "{}");
    CHECK(ran == 1);
    CHECK(cancelled);
    cancelled = false;  // admission passes, the callback cancels, the response check fails
    CHECK(callContext(*e, "model:get") == "error: Run cancelled");
    CHECK(ran == 2);
    CHECK(cancelled);
  }
  // Order: grant, cancellation, count, payload conversion, size. A payload
  // object's toString() runs only after admission, and consumes a call even if it throws.
  {
    bool cancelled = false;
    gr::HostOptions o;
    o.context.maxCalls = 2;
    o.context.cancelled = [&] { return cancelled; };
    o.context.operations["model:get"] = [](const std::string& in) { return in; };
    auto e = engineWith(o);
    e->evaluateScript("globalThis.hits = 0; globalThis.p = { toString() { hits++; return '{}'; } };"
                      "globalThis.q = { toString() { hits++; throw new Error('boom'); } };", "payload.js");
    cancelled = true;
    CHECK(run(*e, "__host.context.call('model:get', p)") == "error: Run cancelled");
    CHECK(run(*e, "hits") == "0");  // cancelled: no payload code ran
    cancelled = false;
    CHECK(run(*e, "__host.context.call('model:get', q)") == "error: boom");  // consumed call 1
    CHECK(run(*e, "__host.context.call('model:get', p)") == "{}");           // call 2
    CHECK(run(*e, "hits") == "2");
    CHECK(run(*e, "__host.context.call('model:get', p)") == "error: Context call limit exceeded");
    CHECK(run(*e, "hits") == "2");  // exhausted: no payload code ran
    CHECK(run(*e, "__host.context.call('model:missing', q)") == "error: ProcessingContext service 'model:missing' is not granted");
    CHECK(run(*e, "hits") == "2");  // not granted: no payload code ran
  }
  // Call limit, with cleanup exempt from both counting and the limit.
  {
    gr::HostOptions o;
    o.context.maxCalls = 2;
    o.context.operations["model:get"] = echo;
    o.context.operations["provider:p:close"] = echo;
    auto e = engineWith(o);
    CHECK(callContext(*e, "provider:p:close") == "{}");
    CHECK(callContext(*e, "model:get") == "{}");
    CHECK(callContext(*e, "model:get") == "{}");
    CHECK(callContext(*e, "model:get") == "error: Context call limit exceeded");
    CHECK(callContext(*e, "provider:p:close") == "{}");
  }
  // Payload limits apply to every operation, cleanup included.
  {
    gr::HostOptions o;
    o.context.maxPayloadBytes = 8;
    o.context.operations["model:get"] = [](const std::string& in) { return in == "\"big\"" ? std::string(9, 'x') : in; };
    o.context.operations["provider:p:close"] = [](const std::string&) { return std::string(9, 'x'); };
    auto e = engineWith(o);
    CHECK(callContext(*e, "model:get", "12345678") == "12345678");
    CHECK(callContext(*e, "model:get", "123456789") == "error: Context request size limit exceeded");
    CHECK(callContext(*e, "model:get", "\"big\"") == "error: Context response size limit exceeded");
    CHECK(callContext(*e, "provider:p:close", "123456789") == "error: Context request size limit exceeded");
    CHECK(callContext(*e, "provider:p:close") == "error: Context response size limit exceeded");
  }
}

void contextRulesApplyToAnyTransport() {
  gr::host::ContextOptions options;
  options.maxCalls = 1;
  options.maxPayloadBytes = 4;
  bool cancelled = false;
  options.cancelled = [&] { return cancelled; };
  gr::host::ContextCallRules rules(options);
  CHECK(gr::host::ContextCallRules::isCleanup("provider:p:close"));
  CHECK(!gr::host::ContextCallRules::isCleanup("provider:p:open"));
  CHECK(!gr::host::ContextCallRules::isCleanup("model:close"));
  auto throws = [](auto&& fn) { try { fn(); } catch (const std::runtime_error&) { return true; } return false; };
  rules.admit("model:get");
  CHECK(throws([&] { rules.admit("model:get"); }));  // call limit
  rules.admit("provider:p:close");                   // exempt
  rules.checkRequestSize(4);
  CHECK(throws([&] { rules.checkRequestSize(5); }));
  rules.resetCalls();
  rules.admit("model:get");
  rules.checkResponse("model:get", 4);
  CHECK(throws([&] { rules.checkResponse("model:get", 5); }));
  cancelled = true;
  CHECK(throws([&] { rules.checkResponse("model:get", 0); }));
  rules.checkResponse("provider:p:close", 0);
  // The grant lookup works on any map type.
  std::map<std::string, int> other{{"a", 1}};
  CHECK(gr::host::ContextCallRules::grant(other, "a") == 1);
  CHECK(throws([&] { gr::host::ContextCallRules::grant(other, "b"); }));
}

void fakeModeFiltersAnyGrantMap() {
  std::map<std::string, int> grants{{"provider:p:open", 1}, {"prediction:p:x", 2}, {"model:getJob", 3}, {"tool:t", 4}};
  gr::host::dropProviderGrants(grants);
  CHECK(grants.size() == 2 && grants.contains("model:getJob") && grants.contains("tool:t"));
  gr::host::ContextOptions::Callback cb = [](const std::string& s) { return s; };
  std::map<std::string, gr::host::ContextOptions::Callback> callbacks{{"provider:p:close", cb}, {"x", cb}};
  gr::host::dropProviderGrants(callbacks);
  CHECK(callbacks.size() == 1 && callbacks.contains("x"));
}

// --- secrets ----------------------------------------------------------------

void secretsComeFromTheEmbedderOnly() {
  setenv("GR_TEST_SECRET", "from-env", 1);
  auto none = engineWith({});
  CHECK(run(*none, "__host.secrets.get('GR_TEST_SECRET')") == "null");
  gr::HostOptions o;
  o.secrets = {{"OPENAI_API_KEY", "sk-test"}};
  auto e = engineWith(o);
  CHECK(run(*e, "__host.secrets.get('OPENAI_API_KEY')") == "sk-test");
  CHECK(run(*e, "__host.secrets.get('GR_TEST_SECRET')") == "null");
}

// --- http -------------------------------------------------------------------

void httpIsOffByDefault() {
  auto e = engineWith({});
  CHECK(startsWith(run(*e, "__host.http.get('https://example.com/a.png')"), "error: fetching http(s) URLs is turned off"));
}

void httpPolicyMatchesSafeFetch() {
  using gr::host::isBlockedIpLiteral;
  using gr::host::isSafePublicHttpsUrl;
  for (const char* blocked : {"127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1",
                              "169.254.169.254", "100.64.0.1", "198.18.0.1", "0.0.0.0", "::1", "[::1]", "::",
                              "fc00::1", "fd12::1", "fe80::1%eth0", "::ffff:127.0.0.1", "::ffff:7f00:1",
                              "::7f00:1", "2002:7f00:1::", "64:ff9b::7f00:1", "64:ff9b::a00:1"}) {
    CHECK(isBlockedIpLiteral(blocked));
  }
  for (const char* open : {"8.8.8.8", "172.32.0.1", "2606:4700::1111", "example.com", "::ffff:808:808"}) {
    CHECK(!isBlockedIpLiteral(open));
  }
#ifdef GR_HAVE_CURL
  CHECK(isSafePublicHttpsUrl("https://example.com/a.png"));
  CHECK(isSafePublicHttpsUrl("https://8.8.8.8/x"));
  for (const char* refused : {"http://example.com/a.png", "ftp://example.com/a", "file:///etc/passwd",
                              "https://localhost/a", "https://localhost./a", "https://api.localhost/a",
                              "https://printer.local/a", "https://metadata.google.internal/a",
                              "https://127.0.0.1/a", "https://[::1]/a", "https://169.254.169.254/latest",
                              "https://[::ffff:127.0.0.1]/a", "https://10.0.0.1:8443/a", "not a url"}) {
    CHECK(!isSafePublicHttpsUrl(refused));
  }
  // With fetching on, refused URLs never open a connection.
  gr::HostOptions o;
  o.allowHttpFetch = true;
  auto e = engineWith(o);
  CHECK(startsWith(run(*e, "__host.http.get('http://example.com/a.png')"), "error: Refusing to fetch unsafe URL"));
  CHECK(startsWith(run(*e, "__host.http.get('https://127.0.0.1/a.png')"), "error: Refusing to fetch unsafe URL"));
  CHECK(startsWith(run(*e, "__host.http.get('https://[::ffff:10.0.0.1]/a')"), "error: Refusing to fetch unsafe URL"));
#endif
}

}  // namespace

// --- kernels ----------------------------------------------------------------

// The kernels capability gives the bytes of a direct call of the C function.
void kernelsMatchTheCFunctions() {
  auto e = engineWith(gr::HostOptions{});
  const std::vector<uint8_t> image = {10, 40, 90, 255, 20, 50, 80, 128, 200, 0, 7, 0, 30, 30, 30, 9};
  std::vector<uint8_t> want(image.size());
  CHECK(nt_image_equalize(image.data(), want.data(), 2, 2) == NT_OK);
  std::string expected = "0:1:";
  for (size_t i = 0; i < want.size(); i++) expected += (i ? "," : "") + std::to_string(want[i]);
  CHECK(run(*e, "(() => { const o = []; const r = __host.kernels.call('nt_image_equalize', "
                "[new Uint8Array([10,40,90,255,20,50,80,128,200,0,7,0,30,30,30,9]), new Uint8Array(16), 2, 2], "
                "'ionn', o); return r + ':' + o.length + ':' + Array.from(o[0]).join(','); })()") == expected);

  // State comes back with the output, in argument order.
  CHECK(run(*e, "(() => { const o = []; const state = new Float64Array(2); "
                "__host.kernels.call('nt_sample_hold_process', [state, new Float32Array([1, 2, 3]), "
                "new Float32Array([0, 1, 1]), new Float32Array(3), 3], 'xiion', o); "
                "return o.length + ':' + Array.from(new Float64Array(o[0].buffer)).join(',') + ':' + "
                "Array.from(new Float32Array(o[1].buffer)).join(','); })()") == "2:2,1:0,2,2");

  // Zero frames pass a valid pointer, as in the WebAssembly host.
  CHECK(run(*e, "__host.kernels.call('nt_audio_bitcrush', [new Float32Array(0), new Float32Array(0), 0, 2, 8, 1], "
                "'ionnnn', [])") == "0");
  // The kernel's own refusal is a result, not a throw.
  CHECK(run(*e, "__host.kernels.call('nt_audio_delay', [new Float32Array(4), new Float32Array(4), 4, 1, 1000, NaN, 0, 1], "
                "'ionnnnnn', [])") == std::to_string(NT_ERR_ARGS));
  CHECK(run(*e, "__host.kernels.call('nt_audio_delay_output_frames', [10, 10, 0.3], 'nnn', [])") == "22");

  // The sampler returns its voices in the state and the count of voices that
  // still sound. A null gate is high, so one voice plays the clip.
  CHECK(run(*e, "__host.kernels.call('nt_sampler_state_len', [2, 1], 'nn', [])") ==
        std::to_string(nt_sampler_state_len(2, 1)));
  CHECK(run(*e, "(() => { const o = []; const state = new Float64Array(15); "
                "const r = __host.kernels.call('nt_sampler_process', [state, 2, new Float32Array([0.5, 0.25, 0.125, 0]), "
                "4, 1, null, null, new Float32Array(3), 3, 0, 1, 0, 0, 1], 'xninnzzonnnnnn', o); "
                "return r + ':' + o.length + ':' + Array.from(new Float32Array(o[1].buffer)).join(','); })()") ==
        "1:2:0.5,0.25,0.125");

  // PCM: 16-bit decode, encode, and the input size that each format needs.
  CHECK(run(*e, "(() => { const o = []; __host.kernels.call('nt_pcm_decode', "
                "[new Uint8Array([0xff, 0x7f, 0x01, 0x80]), new Float32Array(2), 2, " +
                    std::to_string(NT_PCM_S16) + "], 'ionn', o); "
                "return Array.from(new Float32Array(o[0].buffer)).join(','); })()") == "1,-1");
  CHECK(run(*e, "(() => { const o = []; __host.kernels.call('nt_pcm16_encode', "
                "[new Float32Array([1, -2, NaN]), new Uint8Array(6), 3], 'ion', o); "
                "return Array.from(o[0]).join(','); })()") == "255,127,1,128,0,0");
  CHECK(startsWith(run(*e, "__host.kernels.call('nt_pcm_decode', [new Uint8Array(5), new Float32Array(2), 2, " +
                               std::to_string(NT_PCM_S24) + "], 'ionn', [])"),
                   "error: kernels.call: argument 0 of nt_pcm_decode holds 5 bytes, 6 required"));
  CHECK(run(*e, "__host.kernels.call('nt_pcm_decode', [new Uint8Array(4), new Float32Array(2), 2, 99], 'ionn', [])") ==
        std::to_string(NT_ERR_ARGS));
  CHECK(run(*e, "__host.kernels.call('nt_pcm_sample_bytes', [3], 'n', [])") == "3");
}

// Exercise each streaming adapter through the guest trust boundary, including buffer modes.
void streamingKernelsMatchTheCFunctions() {
  auto e = engineWith(gr::HostOptions{});
  const auto bytes = [](const auto& values) {
    const auto* data = reinterpret_cast<const uint8_t*>(values.data());
    std::string result;
    for (size_t i = 0; i < values.size() * sizeof(values[0]); ++i) result += (i ? "," : "") + std::to_string(data[i]);
    return result;
  };
  {
    const size_t length = nt_audio_bitcrush_state_len(2, 44100, 0.01);
    std::vector<double> state(length, 3);
    CHECK(nt_audio_bitcrush_init(state.data(), 2, 44100, 0.01) == NT_OK);
    CHECK(run(*e, "__host.kernels.call('nt_audio_bitcrush_state_len', [2, 44100, 0.01], 'nnn', [])") == std::to_string(length));
    CHECK(run(*e, "(() => { const outputs = []; const length = __host.kernels.call('nt_audio_bitcrush_state_len', [2,44100,0.01], 'nnn', []); "
                  "__host.kernels.call('nt_audio_bitcrush_init', [new Float64Array(length).fill(3),2,44100,0.01], 'onnn', outputs); "
                  "return Array.from(outputs[0]).join(','); })()") == bytes(state));
    std::vector<float> input{0.2f, -0.4f, 0.8f, -0.1f}, output(4);
    CHECK(nt_audio_bitcrush_block(state.data(), input.data(), output.data(), 2, 2, 8, 2) == NT_OK);
    const std::string setup = "const length = __host.kernels.call('nt_audio_bitcrush_state_len', [2,44100,0.01], 'nnn', []); "
                             "const initialized = []; __host.kernels.call('nt_audio_bitcrush_init', [new Float64Array(length),2,44100,0.01], 'onnn', initialized); const state = new Float64Array(initialized[0].buffer); ";
    CHECK(run(*e, "(() => { " + setup + "const outputs = []; __host.kernels.call('nt_audio_bitcrush_block', "
                  "[state,new Float32Array([0.2,-0.4,0.8,-0.1]),new Float32Array(4),2,2,8, 2], 'xionnnn', outputs); "
                  "return outputs.map(value => Array.from(value).join(',')).join(':'); })()") == bytes(state) + ":" + bytes(output));
    const auto bad = [&](const std::string& call) { return run(*e, "(() => { " + setup + "return " + call + "; })()"); };
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_bitcrush_init', [new Float64Array(length-1),2,44100,0.01], 'onnn', [])"), "error: kernels.call: argument 0"));
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_bitcrush_block', [new Float64Array(length-1),new Float32Array(4),new Float32Array(4),2,2,8, 2], 'xionnnn', [])"), "error: kernels.call: argument 0"));
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_bitcrush_block', [state,new Float32Array(3),new Float32Array(4),2,2,8, 2], 'xionnnn', [])"), "error: kernels.call: argument 1"));
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_bitcrush_block', [state,new Float32Array(4),new Float32Array(3),2,2,8, 2], 'xionnnn', [])"), "error: kernels.call: argument 2"));
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_bitcrush_block', [state,new Float32Array(4),new Float32Array(4),2,2,8, 2], 'iionnnn', [])"), "error: kernels.call: argument 0"));
  }
  {
    const size_t length = nt_audio_compress_state_len(2, 44100, 0.01);
    std::vector<double> state(length, 3);
    CHECK(nt_audio_compress_init(state.data(), 2, 44100, 0.01) == NT_OK);
    CHECK(run(*e, "__host.kernels.call('nt_audio_compress_state_len', [2, 44100, 0.01], 'nnn', [])") == std::to_string(length));
    CHECK(run(*e, "(() => { const outputs = []; const length = __host.kernels.call('nt_audio_compress_state_len', [2,44100,0.01], 'nnn', []); "
                  "__host.kernels.call('nt_audio_compress_init', [new Float64Array(length).fill(3),2,44100,0.01], 'onnn', outputs); "
                  "return Array.from(outputs[0]).join(','); })()") == bytes(state));
    std::vector<float> input{0.2f, -0.4f, 0.8f, -0.1f}, output(4);
    CHECK(nt_audio_compress_block(state.data(), input.data(), output.data(), 2, 2, 44100, -18, 4, 10, 100, 1) == NT_OK);
    const std::string setup = "const length = __host.kernels.call('nt_audio_compress_state_len', [2,44100,0.01], 'nnn', []); "
                             "const initialized = []; __host.kernels.call('nt_audio_compress_init', [new Float64Array(length),2,44100,0.01], 'onnn', initialized); const state = new Float64Array(initialized[0].buffer); ";
    CHECK(run(*e, "(() => { " + setup + "const outputs = []; __host.kernels.call('nt_audio_compress_block', "
                  "[state,new Float32Array([0.2,-0.4,0.8,-0.1]),new Float32Array(4),2,2,44100, -18, 4, 10, 100, 1], 'xionnnnnnnn', outputs); "
                  "return outputs.map(value => Array.from(value).join(',')).join(':'); })()") == bytes(state) + ":" + bytes(output));
    const auto bad = [&](const std::string& call) { return run(*e, "(() => { " + setup + "return " + call + "; })()"); };
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_compress_init', [new Float64Array(length-1),2,44100,0.01], 'onnn', [])"), "error: kernels.call: argument 0"));
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_compress_block', [new Float64Array(length-1),new Float32Array(4),new Float32Array(4),2,2,44100, -18, 4, 10, 100, 1], 'xionnnnnnnn', [])"), "error: kernels.call: argument 0"));
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_compress_block', [state,new Float32Array(3),new Float32Array(4),2,2,44100, -18, 4, 10, 100, 1], 'xionnnnnnnn', [])"), "error: kernels.call: argument 1"));
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_compress_block', [state,new Float32Array(4),new Float32Array(3),2,2,44100, -18, 4, 10, 100, 1], 'xionnnnnnnn', [])"), "error: kernels.call: argument 2"));
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_compress_block', [state,new Float32Array(4),new Float32Array(4),2,2,44100, -18, 4, 10, 100, 1], 'iionnnnnnnn', [])"), "error: kernels.call: argument 0"));
  }
  {
    const size_t length = nt_audio_limiter_state_len(2, 44100, 0.01);
    std::vector<double> state(length, 3);
    CHECK(nt_audio_limiter_init(state.data(), 2, 44100, 0.01) == NT_OK);
    CHECK(run(*e, "__host.kernels.call('nt_audio_limiter_state_len', [2, 44100, 0.01], 'nnn', [])") == std::to_string(length));
    CHECK(run(*e, "(() => { const outputs = []; const length = __host.kernels.call('nt_audio_limiter_state_len', [2,44100,0.01], 'nnn', []); "
                  "__host.kernels.call('nt_audio_limiter_init', [new Float64Array(length).fill(3),2,44100,0.01], 'onnn', outputs); "
                  "return Array.from(outputs[0]).join(','); })()") == bytes(state));
    std::vector<float> input{0.2f, -0.4f, 0.8f, -0.1f}, output(4);
    CHECK(nt_audio_limiter_block(state.data(), input.data(), output.data(), 2, 2, 44100, -3, 50, 0) == NT_OK);
    const std::string setup = "const length = __host.kernels.call('nt_audio_limiter_state_len', [2,44100,0.01], 'nnn', []); "
                             "const initialized = []; __host.kernels.call('nt_audio_limiter_init', [new Float64Array(length),2,44100,0.01], 'onnn', initialized); const state = new Float64Array(initialized[0].buffer); ";
    CHECK(run(*e, "(() => { " + setup + "const outputs = []; __host.kernels.call('nt_audio_limiter_block', "
                  "[state,new Float32Array([0.2,-0.4,0.8,-0.1]),new Float32Array(4),2,2,44100, -3, 50, 0], 'xionnnnnn', outputs); "
                  "return outputs.map(value => Array.from(value).join(',')).join(':'); })()") == bytes(state) + ":" + bytes(output));
    const auto bad = [&](const std::string& call) { return run(*e, "(() => { " + setup + "return " + call + "; })()"); };
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_limiter_init', [new Float64Array(length-1),2,44100,0.01], 'onnn', [])"), "error: kernels.call: argument 0"));
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_limiter_block', [new Float64Array(length-1),new Float32Array(4),new Float32Array(4),2,2,44100, -3, 50, 0], 'xionnnnnn', [])"), "error: kernels.call: argument 0"));
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_limiter_block', [state,new Float32Array(3),new Float32Array(4),2,2,44100, -3, 50, 0], 'xionnnnnn', [])"), "error: kernels.call: argument 1"));
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_limiter_block', [state,new Float32Array(4),new Float32Array(3),2,2,44100, -3, 50, 0], 'xionnnnnn', [])"), "error: kernels.call: argument 2"));
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_limiter_block', [state,new Float32Array(4),new Float32Array(4),2,2,44100, -3, 50, 0], 'iionnnnnn', [])"), "error: kernels.call: argument 0"));
  }
  {
    const size_t length = nt_audio_noise_gate_state_len(2, 44100, 0.01);
    std::vector<double> state(length, 3);
    CHECK(nt_audio_noise_gate_init(state.data(), 2, 44100, 0.01) == NT_OK);
    CHECK(run(*e, "__host.kernels.call('nt_audio_noise_gate_state_len', [2, 44100, 0.01], 'nnn', [])") == std::to_string(length));
    CHECK(run(*e, "(() => { const outputs = []; const length = __host.kernels.call('nt_audio_noise_gate_state_len', [2,44100,0.01], 'nnn', []); "
                  "__host.kernels.call('nt_audio_noise_gate_init', [new Float64Array(length).fill(3),2,44100,0.01], 'onnn', outputs); "
                  "return Array.from(outputs[0]).join(','); })()") == bytes(state));
    std::vector<float> input{0.2f, -0.4f, 0.8f, -0.1f}, output(4);
    CHECK(nt_audio_noise_gate_block(state.data(), input.data(), output.data(), 2, 2, 44100, -20, 1, 50) == NT_OK);
    const std::string setup = "const length = __host.kernels.call('nt_audio_noise_gate_state_len', [2,44100,0.01], 'nnn', []); "
                             "const initialized = []; __host.kernels.call('nt_audio_noise_gate_init', [new Float64Array(length),2,44100,0.01], 'onnn', initialized); const state = new Float64Array(initialized[0].buffer); ";
    CHECK(run(*e, "(() => { " + setup + "const outputs = []; __host.kernels.call('nt_audio_noise_gate_block', "
                  "[state,new Float32Array([0.2,-0.4,0.8,-0.1]),new Float32Array(4),2,2,44100, -20, 1, 50], 'xionnnnnn', outputs); "
                  "return outputs.map(value => Array.from(value).join(',')).join(':'); })()") == bytes(state) + ":" + bytes(output));
    const auto bad = [&](const std::string& call) { return run(*e, "(() => { " + setup + "return " + call + "; })()"); };
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_noise_gate_init', [new Float64Array(length-1),2,44100,0.01], 'onnn', [])"), "error: kernels.call: argument 0"));
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_noise_gate_block', [new Float64Array(length-1),new Float32Array(4),new Float32Array(4),2,2,44100, -20, 1, 50], 'xionnnnnn', [])"), "error: kernels.call: argument 0"));
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_noise_gate_block', [state,new Float32Array(3),new Float32Array(4),2,2,44100, -20, 1, 50], 'xionnnnnn', [])"), "error: kernels.call: argument 1"));
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_noise_gate_block', [state,new Float32Array(4),new Float32Array(3),2,2,44100, -20, 1, 50], 'xionnnnnn', [])"), "error: kernels.call: argument 2"));
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_noise_gate_block', [state,new Float32Array(4),new Float32Array(4),2,2,44100, -20, 1, 50], 'iionnnnnn', [])"), "error: kernels.call: argument 0"));
  }
  {
    const size_t length = nt_audio_phaser_state_len(2, 44100, 0.01);
    std::vector<double> state(length, 3);
    CHECK(nt_audio_phaser_init(state.data(), 2, 44100, 0.01) == NT_OK);
    CHECK(run(*e, "__host.kernels.call('nt_audio_phaser_state_len', [2, 44100, 0.01], 'nnn', [])") == std::to_string(length));
    CHECK(run(*e, "(() => { const outputs = []; const length = __host.kernels.call('nt_audio_phaser_state_len', [2,44100,0.01], 'nnn', []); "
                  "__host.kernels.call('nt_audio_phaser_init', [new Float64Array(length).fill(3),2,44100,0.01], 'onnn', outputs); "
                  "return Array.from(outputs[0]).join(','); })()") == bytes(state));
    std::vector<float> input{0.2f, -0.4f, 0.8f, -0.1f}, output(4);
    CHECK(nt_audio_phaser_block(state.data(), input.data(), output.data(), 2, 2, 44100, 0.5, 0.7, 1000, 0.3, 0.5) == NT_OK);
    const std::string setup = "const length = __host.kernels.call('nt_audio_phaser_state_len', [2,44100,0.01], 'nnn', []); "
                             "const initialized = []; __host.kernels.call('nt_audio_phaser_init', [new Float64Array(length),2,44100,0.01], 'onnn', initialized); const state = new Float64Array(initialized[0].buffer); ";
    CHECK(run(*e, "(() => { " + setup + "const outputs = []; __host.kernels.call('nt_audio_phaser_block', "
                  "[state,new Float32Array([0.2,-0.4,0.8,-0.1]),new Float32Array(4),2,2,44100, 0.5, 0.7, 1000, 0.3, 0.5], 'xionnnnnnnn', outputs); "
                  "return outputs.map(value => Array.from(value).join(',')).join(':'); })()") == bytes(state) + ":" + bytes(output));
    const auto bad = [&](const std::string& call) { return run(*e, "(() => { " + setup + "return " + call + "; })()"); };
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_phaser_init', [new Float64Array(length-1),2,44100,0.01], 'onnn', [])"), "error: kernels.call: argument 0"));
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_phaser_block', [new Float64Array(length-1),new Float32Array(4),new Float32Array(4),2,2,44100, 0.5, 0.7, 1000, 0.3, 0.5], 'xionnnnnnnn', [])"), "error: kernels.call: argument 0"));
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_phaser_block', [state,new Float32Array(3),new Float32Array(4),2,2,44100, 0.5, 0.7, 1000, 0.3, 0.5], 'xionnnnnnnn', [])"), "error: kernels.call: argument 1"));
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_phaser_block', [state,new Float32Array(4),new Float32Array(3),2,2,44100, 0.5, 0.7, 1000, 0.3, 0.5], 'xionnnnnnnn', [])"), "error: kernels.call: argument 2"));
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_phaser_block', [state,new Float32Array(4),new Float32Array(4),2,2,44100, 0.5, 0.7, 1000, 0.3, 0.5], 'iionnnnnnnn', [])"), "error: kernels.call: argument 0"));
  }
  {
    const size_t length = nt_audio_reverb_state_len(2, 44100, 0.01);
    std::vector<double> state(length, 3);
    CHECK(nt_audio_reverb_init(state.data(), 2, 44100, 0.01) == NT_OK);
    CHECK(run(*e, "__host.kernels.call('nt_audio_reverb_state_len', [2, 44100, 0.01], 'nnn', [])") == std::to_string(length));
    CHECK(run(*e, "(() => { const outputs = []; const length = __host.kernels.call('nt_audio_reverb_state_len', [2,44100,0.01], 'nnn', []); "
                  "__host.kernels.call('nt_audio_reverb_init', [new Float64Array(length).fill(3),2,44100,0.01], 'onnn', outputs); "
                  "return Array.from(outputs[0]).join(','); })()") == bytes(state));
    std::vector<float> input{0.2f, -0.4f, 0.8f, -0.1f}, output(4);
    CHECK(nt_audio_reverb_block(state.data(), input.data(), output.data(), 2, 2, 44100, 0.5, 0.5, 0.3, 0.7) == NT_OK);
    const std::string setup = "const length = __host.kernels.call('nt_audio_reverb_state_len', [2,44100,0.01], 'nnn', []); "
                             "const initialized = []; __host.kernels.call('nt_audio_reverb_init', [new Float64Array(length),2,44100,0.01], 'onnn', initialized); const state = new Float64Array(initialized[0].buffer); ";
    CHECK(run(*e, "(() => { " + setup + "const outputs = []; __host.kernels.call('nt_audio_reverb_block', "
                  "[state,new Float32Array([0.2,-0.4,0.8,-0.1]),new Float32Array(4),2,2,44100, 0.5, 0.5, 0.3, 0.7], 'xionnnnnnn', outputs); "
                  "return outputs.map(value => Array.from(value).join(',')).join(':'); })()") == bytes(state) + ":" + bytes(output));
    const auto bad = [&](const std::string& call) { return run(*e, "(() => { " + setup + "return " + call + "; })()"); };
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_reverb_init', [new Float64Array(length-1),2,44100,0.01], 'onnn', [])"), "error: kernels.call: argument 0"));
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_reverb_block', [new Float64Array(length-1),new Float32Array(4),new Float32Array(4),2,2,44100, 0.5, 0.5, 0.3, 0.7], 'xionnnnnnn', [])"), "error: kernels.call: argument 0"));
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_reverb_block', [state,new Float32Array(3),new Float32Array(4),2,2,44100, 0.5, 0.5, 0.3, 0.7], 'xionnnnnnn', [])"), "error: kernels.call: argument 1"));
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_reverb_block', [state,new Float32Array(4),new Float32Array(3),2,2,44100, 0.5, 0.5, 0.3, 0.7], 'xionnnnnnn', [])"), "error: kernels.call: argument 2"));
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_reverb_block', [state,new Float32Array(4),new Float32Array(4),2,2,44100, 0.5, 0.5, 0.3, 0.7], 'iionnnnnnn', [])"), "error: kernels.call: argument 0"));
  }
  {
    const size_t length = nt_audio_delay_state_len(2, 44100, 0.01);
    std::vector<double> state(length, 3);
    CHECK(nt_audio_delay_init(state.data(), 2, 44100, 0.01) == NT_OK);
    CHECK(run(*e, "__host.kernels.call('nt_audio_delay_state_len', [2, 44100, 0.01], 'nnn', [])") == std::to_string(length));
    CHECK(run(*e, "(() => { const outputs = []; const length = __host.kernels.call('nt_audio_delay_state_len', [2,44100,0.01], 'nnn', []); "
                  "__host.kernels.call('nt_audio_delay_init', [new Float64Array(length).fill(3),2,44100,0.01], 'onnn', outputs); "
                  "return Array.from(outputs[0]).join(','); })()") == bytes(state));
    std::vector<float> input{0.2f, -0.4f, 0.8f, -0.1f}, output(4);
    CHECK(nt_audio_delay_block(state.data(), input.data(), output.data(), 2, 2, 44100, 0.01, 0.5, 0.5) == NT_OK);
    const std::string setup = "const length = __host.kernels.call('nt_audio_delay_state_len', [2,44100,0.01], 'nnn', []); "
                             "const initialized = []; __host.kernels.call('nt_audio_delay_init', [new Float64Array(length),2,44100,0.01], 'onnn', initialized); const state = new Float64Array(initialized[0].buffer); ";
    CHECK(run(*e, "(() => { " + setup + "const outputs = []; __host.kernels.call('nt_audio_delay_block', "
                  "[state,new Float32Array([0.2,-0.4,0.8,-0.1]),new Float32Array(4),2,2,44100, 0.01, 0.5, 0.5], 'xionnnnnn', outputs); "
                  "return outputs.map(value => Array.from(value).join(',')).join(':'); })()") == bytes(state) + ":" + bytes(output));
    const auto bad = [&](const std::string& call) { return run(*e, "(() => { " + setup + "return " + call + "; })()"); };
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_delay_init', [new Float64Array(length-1),2,44100,0.01], 'onnn', [])"), "error: kernels.call: argument 0"));
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_delay_block', [new Float64Array(length-1),new Float32Array(4),new Float32Array(4),2,2,44100, 0.01, 0.5, 0.5], 'xionnnnnn', [])"), "error: kernels.call: argument 0"));
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_delay_block', [state,new Float32Array(3),new Float32Array(4),2,2,44100, 0.01, 0.5, 0.5], 'xionnnnnn', [])"), "error: kernels.call: argument 1"));
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_delay_block', [state,new Float32Array(4),new Float32Array(3),2,2,44100, 0.01, 0.5, 0.5], 'xionnnnnn', [])"), "error: kernels.call: argument 2"));
    CHECK(startsWith(bad("__host.kernels.call('nt_audio_delay_block', [state,new Float32Array(4),new Float32Array(4),2,2,44100, 0.01, 0.5, 0.5], 'iionnnnnn', [])"), "error: kernels.call: argument 0"));
  }
  std::vector<float> input{0, 1, 0, -1, 0, 1, 0, -1}, output(nt_resample_output_frames(4, 48000, 44100) * 2);
  CHECK(nt_resample(input.data(), output.data(), 4, 2, 48000, 44100) == NT_OK);
  CHECK(run(*e, "__host.kernels.call('nt_resample_output_frames', [4,48000,44100], 'nnn', [])") == std::to_string(output.size() / 2));
  CHECK(run(*e, "(() => { const outputs = []; __host.kernels.call('nt_resample', [new Float32Array([0,1,0,-1,0,1,0,-1]),new Float32Array(8),4,2,48000,44100], 'ionnnn', outputs); return Array.from(outputs[0]).join(','); })()") == bytes(output));
  CHECK(startsWith(run(*e, "__host.kernels.call('nt_resample', [new Float32Array(7),new Float32Array(8),4,2,48000,44100], 'ionnnn', [])"), "error: kernels.call: argument 0"));
  CHECK(startsWith(run(*e, "__host.kernels.call('nt_resample', [new Float32Array(8),new Float32Array(7),4,2,48000,44100], 'ionnnn', [])"), "error: kernels.call: argument 1"));
}

// The guest cannot make a kernel read or write past a buffer it passed.
void kernelsRefuseBadArguments() {
  auto e = engineWith(gr::HostOptions{});
  const auto call = [&](const std::string& args) { return run(*e, "__host.kernels.call(" + args + ")"); };
  CHECK(startsWith(call("'nt_image_equalize', [new Uint8Array(15), new Uint8Array(16), 2, 2], 'ionn', []"),
                   "error: kernels.call: argument 0 of nt_image_equalize holds 15 bytes, 16 required"));
  CHECK(startsWith(call("'nt_image_equalize', [new Uint8Array(16), new Uint8Array(15), 2, 2], 'ionn', []"),
                   "error: kernels.call: argument 1"));
  CHECK(startsWith(call("'nt_image_equalize', [new Uint8Array(16), new Uint8Array(16), 2.5, 2], 'ionn', []"),
                   "error: kernels.call: argument 2 of nt_image_equalize must be an integer"));
  CHECK(startsWith(call("'nt_image_equalize', [new Uint8Array(16), new Uint8Array(16), -1, 2], 'ionn', []"),
                   "error: kernels.call: argument 2"));
  CHECK(startsWith(call("'nt_image_equalize', [new Uint8Array(16), new Uint8Array(16), 4294967296, 2], 'ionn', []"),
                   "error: kernels.call: argument 2"));
  CHECK(startsWith(call("'nt_image_equalize', [new Uint8Array(16), new Uint8Array(16), 65536, 65536], 'ionn', []"),
                   "error: kernels.call: argument 0 of nt_image_equalize holds 16 bytes"));
  CHECK(startsWith(call("'nt_image_equalize', [new Uint8Array(16), new Uint8Array(16), 2, 2], 'iinn', []"),
                   "error: kernels.call: argument 1 of nt_image_equalize must have mode o"));
  CHECK(startsWith(call("'nt_image_equalize', [new Uint8Array(16), new Uint8Array(16), '2', 2], 'ionn', []"),
                   "error: kernels.call: argument 2 of nt_image_equalize must be a number"));
  CHECK(startsWith(call("'nt_image_equalize', [new Uint8Array(16), new Uint8Array(16), 2], 'ion', []"),
                   "error: kernels.call: nt_image_equalize takes 4 arguments, got 3"));
  CHECK(startsWith(call("'nt_osc_process', [new Float64Array(2), 0, 440, 1, 0.5, 0, 48000, new Float32Array(3), null, "
                        "new Float32Array(4), 4], 'xnnnnnnizon', []"),
                   "error: kernels.call: argument 7 of nt_osc_process holds 12 bytes, 16 required"));
  CHECK(startsWith(call("'nt_biquad_process', [new Float64Array(5), new Float64Array(4), new Float32Array(8), "
                        "new Float32Array(8), 4, 2], 'xxionn', []"),
                   "error: kernels.call: argument 0 of nt_biquad_process must have mode i"));
  CHECK(startsWith(call("'nt_biquad_process', [new Float64Array(5), new Float64Array(4), new Float32Array(8), "
                        "new Float32Array(8), 4, 2], 'ixionn', []"),
                   "error: kernels.call: argument 1 of nt_biquad_process holds 32 bytes, 64 required"));
  CHECK(startsWith(call("'nt_sampler_process', [new Float64Array(14), 2, new Float32Array(4), 4, 1, null, null, "
                        "new Float32Array(3), 3, 0, 1, 0, 0, 1], 'xninnzzonnnnnn', []"),
                   "error: kernels.call: argument 0 of nt_sampler_process holds 112 bytes, 120 required"));
  CHECK(startsWith(call("'nt_sampler_process', [new Float64Array(15), 2, new Float32Array(4), 5, 1, null, null, "
                        "new Float32Array(3), 3, 0, 1, 0, 0, 1], 'xninnzzonnnnnn', []"),
                   "error: kernels.call: argument 2 of nt_sampler_process holds 16 bytes, 20 required"));
  CHECK(startsWith(call("'nt_sampler_process', [new Float64Array(15), 2, new Float32Array(4), 4, 1, new Float32Array(2), "
                        "null, new Float32Array(3), 3, 0, 1, 0, 0, 1], 'xninnizonnnnnn', []"),
                   "error: kernels.call: argument 5 of nt_sampler_process holds 8 bytes, 12 required"));
  CHECK(startsWith(call("'nt_alloc', [], '', []"), "error: kernels.call: no kernel nt_alloc"));
  CHECK(startsWith(call("'nt_image_equalize'"), "error: kernels.call: expected (name, args, modes, outputs)"));
}

int main() {
  std::vector<std::pair<const char*, std::function<void()>>> tests = {
      {"filesGrantNothingByDefault", filesGrantNothingByDefault},
      {"filesReadAndWriteInTheWorkspace", filesReadAndWriteInTheWorkspace},
      {"filesCreatePrivateTemporaryDirectories", filesCreatePrivateTemporaryDirectories},
      {"filesRefuseEscapes", filesRefuseEscapes},
      {"filesReadRootsAreReadOnly", filesReadRootsAreReadOnly},
      {"filesAcceptTheRootAsNamed", filesAcceptTheRootAsNamed},
      {"filesAllowOnlyTheGrantedSqliteDirectory", filesAllowOnlyTheGrantedSqliteDirectory},
      {"assetsGrantNothingByDefault", assetsGrantNothingByDefault},
      {"assetsStoreAndRefuseEscapes", assetsStoreAndRefuseEscapes},
      {"assetsConcurrentWritesStayWhole", assetsConcurrentWritesStayWhole},
      {"assetsTempNameCollisionRetries", assetsTempNameCollisionRetries},
      {"assetsFailedRenameCleansUp", assetsFailedRenameCleansUp},
      {"packageAssetsFailWithoutADirectory", packageAssetsFailWithoutADirectory},
      {"packageAssetsReadAndRefuseEscapes", packageAssetsReadAndRefuseEscapes},
      {"fakeProvidersDropProviderGrants", fakeProvidersDropProviderGrants},
      {"contextCallRules", contextCallRules},
      {"contextRulesApplyToAnyTransport", contextRulesApplyToAnyTransport},
      {"fakeModeFiltersAnyGrantMap", fakeModeFiltersAnyGrantMap},
      {"secretsComeFromTheEmbedderOnly", secretsComeFromTheEmbedderOnly},
      {"httpIsOffByDefault", httpIsOffByDefault},
      {"httpPolicyMatchesSafeFetch", httpPolicyMatchesSafeFetch},
      {"kernelsMatchTheCFunctions", kernelsMatchTheCFunctions},
      {"kernelsRefuseBadArguments", kernelsRefuseBadArguments},
      {"streamingKernelsMatchTheCFunctions", streamingKernelsMatchTheCFunctions},
  };
  for (const auto& [name, fn] : tests) {
    int before = failures;
    fn();
    std::fprintf(stderr, "%s %s\n", failures == before ? "PASS" : "FAIL", name);
  }
  std::fprintf(stderr, "%d checks, %d failed\n", checks, failures);
  return failures == 0 ? 0 : 1;
}
