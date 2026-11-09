#include "host/capabilities.h"
#include "js/engine.h"
#include <cerrno>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <iterator>
#include <sys/stat.h>
#include <unistd.h>
namespace gr::host {
void installFiles(js::Engine &, const js::Value &, const HostOptions &);
}
namespace fs = std::filesystem;
size_t descriptors() {
#ifdef __linux__
  const char *path = "/proc/self/fd";
#else
  const char *path = "/dev/fd";
#endif
  return std::distance(fs::directory_iterator(path), fs::directory_iterator{});
}
#ifdef GR_FILE_HANDLE_WRAP_IO
// native-rules #14: file-scope mutable fault-injection flags read by wrapped syscalls
bool interruptRead = false, interruptPread = false;
extern "C" ssize_t __real_read(int fd, void *buffer, size_t size);
extern "C" ssize_t __real_pread(int fd, void *buffer, size_t size,
                                off_t offset);
extern "C" ssize_t __wrap_read(int fd, void *buffer, size_t size) {
  if (interruptRead) {
    interruptRead = false;
    errno = EINTR;
    return -1;
  }
  return __real_read(fd, buffer, size);
}
extern "C" ssize_t __wrap_pread(int fd, void *buffer, size_t size,
                                off_t offset) {
  if (interruptPread) {
    interruptPread = false;
    errno = EINTR;
    return -1;
  }
  return __real_pread(fd, buffer, size, offset);
}
#endif
int main(int argc, char **argv) {
  if (argc != 2)
    return 2;
  std::string pattern =
      (fs::temp_directory_path() / "gr-file-handles-XXXXXX").string();
  if (!mkdtemp(pattern.data()))
    return 2;
  const fs::path root(pattern);
  try {
    fs::create_directories(root / "workspace");
    fs::create_directories(root / "readonly");
    std::ofstream(root / "workspace/data") << "ABCDEFGH";
    std::ofstream(root / "outside") << "secret";
    std::ofstream(root / "readonly/data") << "Read root";
    fs::create_hard_link(root / "outside", root / "workspace/hardlink");
    fs::create_symlink(root / "outside", root / "workspace/escape");
    fs::create_symlink(root / "readonly/data", root / "workspace/allowed-link");
    ::mkfifo((root / "workspace/fifo").c_str(), 0600);
    const auto baseline = descriptors();
    {
      auto engine = gr::js::createQuickJsEngine();
      auto &e = *engine;
      gr::HostOptions options;
      options.workspaceDir = (root / "workspace").string();
      options.readRoots = {(root / "readonly").string()};
      auto host = e.object(), files = e.object(), foreign = e.object(),
           denied = e.object();
      gr::host::installFiles(e, files, options);
      gr::host::installFiles(e, foreign, options);
      gr::host::installFiles(e, denied, {});
      e.set(host, "files", files);
      e.set(e.global(), "__host", host);
      e.set(e.global(), "foreign", foreign);
      e.set(e.global(), "denied", denied);
      e.set(e.global(), "__readOnlyPath",
            e.string((root / "readonly/data").string()));
      e.evaluateScript(R"JS(
let nativeChecks = 0;
function check(ok, label) { nativeChecks++; if (!ok) throw Error(label); }
function rejects(fn, pattern) { let error; try { fn(); } catch(e) {error=e;} check(error && pattern.test(error.message), 'expected '+pattern+', got '+error); }
const f = __host.files;
check(typeof f.openRead === 'function', 'native openRead required');
const h = f.openRead('data', 'r');
check(String(f.readHandle(h, 2, 2)) === '67,68', 'actual pread bytes');
check(String(f.readHandle(h, 2, null)) === '65,66', 'pread kept cursor');
check(String(f.readHandle(h, 2, null)) === '67,68', 'cursor advances');
check(f.readHandle(h, 4, 7).length === 1, 'short read');
check(f.readHandle(h, 4, 8).length === 0, 'EOF');
for (const bad of [-1, 1.5, NaN, Infinity, 9007199254740992, '1', true, null]) rejects(() => f.readHandle(h, bad, 0), /integer|length/);
for (const bad of [-1, 1.5, NaN, Infinity, 9007199254740992, '1', true]) rejects(() => f.readHandle(h, 1, bad), /integer|position/);
rejects(() => f.readHandle(h, 16777217, 0), /limit|length|quota/);
for (const forged of [{}, 1, null, undefined]) rejects(() => f.readHandle(forged, 1, 0), /EBADF|handle/);
rejects(() => foreign.readHandle(h, 1, 0), /EBADF|handle/);
rejects(() => foreign.closeHandle(h), /EBADF|handle/);
check(f.readHandle(h, 1, 0)[0] === 65, 'foreign close leaves owner intact');
for (const path of ['../outside', 'escape', 'hardlink', '/etc/passwd']) rejects(() => f.openRead(path, 'r'), /EACCES/);
rejects(() => f.openRead('.', 'r'), /EISDIR/);
rejects(() => f.openRead('fifo', 'r'), /EACCES/);
rejects(() => f.openRead('missing', 'r'), /ENOENT/);
check(f.readHandle(h, 16777216, 0).length === 8, 'maximum read quota allowed');
rejects(() => denied.openRead('data', 'r'), /EACCES/);
for (const flag of ['w', 'r+', 0, null]) rejects(() => f.openRead('data', flag), /flags|read.only/);
const link = f.openRead('allowed-link', 'r');
check(f.readHandle(link, 1, 0)[0] === 82, 'same symlink policy as readFile');
f.closeHandle(link);
f.closeHandle(h);
rejects(() => f.readHandle(h, 1, 0), /EBADF|closed/);
rejects(() => f.closeHandle(h), /EBADF|closed/);
const replacement = f.openRead('data','r');
rejects(() => f.closeHandle(h), /EBADF|closed/);
check(f.readHandle(replacement, 1, 0)[0] === 65, 'stale close cannot close reused descriptor');
f.closeHandle(replacement);
for (let i=0;i<128;i++) { const temporary=f.openRead('data','r'); f.closeHandle(temporary); }
const handles = [];
for (let i=0;i<64;i++) handles.push(f.openRead('data','r'));
rejects(() => f.openRead('data','r'), /limit|quota|EMFILE/);
for (const handle of handles) f.closeHandle(handle);
globalThis.retained = f.openRead('data','r');
)JS",
                       "native-file-handle.js");
#ifdef GR_FILE_HANDLE_WRAP_IO
      interruptRead = true;
      e.evaluateScript("check(f.readHandle(retained, 1, null)[0] === 65, 'read "
                       "retries EINTR');",
                       "read-eintr.js");
      if (interruptRead)
        throw std::runtime_error("read EINTR injection was not exercised");
      interruptPread = true;
      e.evaluateScript("check(f.readHandle(retained, 1, 2)[0] === 67, 'pread "
                       "retries EINTR');",
                       "pread-eintr.js");
      if (interruptPread)
        throw std::runtime_error("pread EINTR injection was not exercised");
#endif
      e.releaseRunResources();
      if (descriptors() != baseline)
        throw std::runtime_error("run cleanup leaked descriptors");
      {
        const auto token = e.call(e.get(files, "openRead"), e.undefined(),
                                  {e.string("data"), e.string("r")});
        if (descriptors() != baseline + 1)
          throw std::runtime_error("RAII probe did not open descriptor");
      }
      if (descriptors() != baseline)
        throw std::runtime_error("native payload finalizer leaked descriptor");
      e.evaluateScript(
          "rejects(() => f.readHandle(retained,1,0), /EBADF|closed/); "
          "rejects(() => f.closeHandle(retained), /EBADF|closed/);",
          "after-cleanup.js");
      e.releaseRunResources();
      std::ifstream input(argv[1]);
      std::string source{std::istreambuf_iterator<char>(input), {}};
      input.close();
      if (source.empty())
        throw std::runtime_error("empty guest test");
      bool done = false;
      std::string error;
      auto promise = e.evaluateModule(source, argv[1]);
      gr::js::then(
          e, promise, [&](auto &, const auto &) { done = true; },
          [&](auto &en, const auto &value) {
            done = true;
            error = en.toString(en.get(value, "stack"));
          });
      e.drainJobs();
      if (!done || !error.empty())
        throw std::runtime_error("guest test failed: " + error);
      e.releaseRunResources();
      if (descriptors() != baseline)
        throw std::runtime_error("guest retained handle leaked descriptors");
      e.evaluateScript(R"JS(
let closed = false;
__retainedFileHandle.read(new Uint8Array(1)).catch(e => { closed = /EBADF|closed/.test(e.message); });
)JS",
                       "guest-cleanup.js");
      e.drainJobs();
      if (!e.toBoolean(e.evaluateScript("closed", "guest-cleanup-result.js")))
        throw std::runtime_error("guest handle survived run cleanup");
      e.evaluateScript("globalThis.teardownHandle = f.openRead('data','r');",
                       "teardown.js");
      std::cout << "native checks: "
                << e.toString(e.evaluateScript("nativeChecks", "count.js"))
                << ", guest checks: "
                << e.toString(e.get(e.global(), "__guestFileHandleChecks"))
                << '\n';
    }
    if (descriptors() != baseline)
      throw std::runtime_error("engine teardown leaked descriptors");
    fs::remove_all(root);
    return 0;
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    fs::remove_all(root);
    return 1;
  }
}
