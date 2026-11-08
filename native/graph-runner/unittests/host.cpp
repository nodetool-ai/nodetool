// Tests for the host capabilities (src/host/): what node code reaches through
// globalThis.__host, called from JavaScript as the guest calls it. Each
// capability is checked for its success path, refusal when the embedder
// granted nothing, and escapes: `..`, absolute paths, symlinks and hard
// links out of a granted directory.
#include "host/capabilities.h"
#include "host/http.h"
#include "js/engine.h"

#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <functional>
#include <string>
#include <unistd.h>
#include <vector>

namespace {

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
    root = fs::path(::mkdtemp(tmpl.data()));
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
      {"packageAssetsFailWithoutADirectory", packageAssetsFailWithoutADirectory},
      {"packageAssetsReadAndRefuseEscapes", packageAssetsReadAndRefuseEscapes},
      {"fakeProvidersDropProviderGrants", fakeProvidersDropProviderGrants},
      {"secretsComeFromTheEmbedderOnly", secretsComeFromTheEmbedderOnly},
      {"httpIsOffByDefault", httpIsOffByDefault},
      {"httpPolicyMatchesSafeFetch", httpPolicyMatchesSafeFetch},
  };
  for (const auto& [name, fn] : tests) {
    int before = failures;
    fn();
    std::fprintf(stderr, "%s %s\n", failures == before ? "PASS" : "FAIL", name);
  }
  std::fprintf(stderr, "%d checks, %d failed\n", checks, failures);
  return failures == 0 ? 0 : 1;
}
