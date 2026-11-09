// The file handles of __host.files (fs.promises.open): open, positioned and
// cursor reads, close, quotas, foreign handles, run cleanup and descriptor
// ownership, natively and through the guest's FileHandle. Each part runs in
// a bound run on an inline lane, so the EINTR injection below reaches the
// read on this thread.
#include "bound_run.h"
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
    // Outlives the engine, whose handles name it as their lane.
    nodetool::jobs::InlineExecutor lane;
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
async function rejects(fn, pattern) { let error; try { await fn(); } catch(e) {error=e;} check(error && pattern.test(error.message), 'expected '+pattern+', got '+error); }
const f = __host.files;
function finish(name, promise) {
  globalThis[name] = false;
  promise.then(() => { globalThis[name] = 'ok'; }, (e) => { globalThis[name] = 'error: ' + (e && e.stack || e); });
}
)JS",
                       "native-file-handle-setup.js");
      auto expect = [&](const std::string &name) {
        const auto value = e.toString(e.get(e.global(), name));
        if (value != "ok")
          throw std::runtime_error(name + ": " + value);
      };
      {
        grtest::BoundRun run(e, lane);
        e.evaluateScript(R"JS(
finish('nativeDone', (async () => {
check(typeof f.openReadAsync === 'function', 'native openReadAsync required');
const h = await f.openReadAsync('data', 'r');
check(String(await f.readHandleAsync(h, 2, 2)) === '67,68', 'actual pread bytes');
check(String(await f.readHandleAsync(h, 2, null)) === '65,66', 'pread kept cursor');
check(String(await f.readHandleAsync(h, 2, null)) === '67,68', 'cursor advances');
check((await f.readHandleAsync(h, 4, 7)).length === 1, 'short read');
check((await f.readHandleAsync(h, 4, 8)).length === 0, 'EOF');
for (const bad of [-1, 1.5, NaN, Infinity, 9007199254740992, '1', true, null]) await rejects(() => f.readHandleAsync(h, bad, 0), /integer|length/);
for (const bad of [-1, 1.5, NaN, Infinity, 9007199254740992, '1', true]) await rejects(() => f.readHandleAsync(h, 1, bad), /integer|position/);
await rejects(() => f.readHandleAsync(h, 16777217, 0), /limit|length|quota/);
for (const forged of [{}, 1, null, undefined]) await rejects(() => f.readHandleAsync(forged, 1, 0), /EBADF|handle/);
await rejects(() => foreign.readHandleAsync(h, 1, 0), /EBADF|handle/);
await rejects(() => foreign.closeHandleAsync(h), /EBADF|handle/);
check((await f.readHandleAsync(h, 1, 0))[0] === 65, 'foreign close leaves owner intact');
for (const path of ['../outside', 'escape', 'hardlink', '/etc/passwd']) await rejects(() => f.openReadAsync(path, 'r'), /EACCES/);
await rejects(() => f.openReadAsync('.', 'r'), /EISDIR/);
await rejects(() => f.openReadAsync('fifo', 'r'), /EACCES/);
await rejects(() => f.openReadAsync('missing', 'r'), /ENOENT/);
check((await f.readHandleAsync(h, 16777216, 0)).length === 8, 'maximum read quota allowed');
await rejects(() => denied.openReadAsync('data', 'r'), /EACCES/);
for (const flag of ['w', 'r+', 0, null]) await rejects(() => f.openReadAsync('data', flag), /flags|read.only/);
const link = await f.openReadAsync('allowed-link', 'r');
check((await f.readHandleAsync(link, 1, 0))[0] === 82, 'same symlink policy as readFile');
await f.closeHandleAsync(link);
await f.closeHandleAsync(h);
await rejects(() => f.readHandleAsync(h, 1, 0), /EBADF|closed/);
await rejects(() => f.closeHandleAsync(h), /EBADF|closed/);
const replacement = await f.openReadAsync('data','r');
await rejects(() => f.closeHandleAsync(h), /EBADF|closed/);
check((await f.readHandleAsync(replacement, 1, 0))[0] === 65, 'stale close cannot close reused descriptor');
await f.closeHandleAsync(replacement);
for (let i=0;i<128;i++) { const temporary=await f.openReadAsync('data','r'); await f.closeHandleAsync(temporary); }
const handles = [];
for (let i=0;i<64;i++) handles.push(await f.openReadAsync('data','r'));
await rejects(() => f.openReadAsync('data','r'), /limit|quota|EMFILE/);
for (const handle of handles) await f.closeHandleAsync(handle);
globalThis.retained = await f.openReadAsync('data','r');
})());
)JS",
                         "native-file-handle.js");
        run.runUntilGlobal("nativeDone");
        expect("nativeDone");
#ifdef GR_FILE_HANDLE_WRAP_IO
        interruptRead = true;
        e.evaluateScript("finish('readEintr', f.readHandleAsync(retained, 1, null).then((b) => "
                         "check(b[0] === 65, 'read retries EINTR')));",
                         "read-eintr.js");
        run.runUntilGlobal("readEintr");
        expect("readEintr");
        if (interruptRead)
          throw std::runtime_error("read EINTR injection was not exercised");
        interruptPread = true;
        e.evaluateScript("finish('preadEintr', f.readHandleAsync(retained, 1, 2).then((b) => "
                         "check(b[0] === 67, 'pread retries EINTR')));",
                         "pread-eintr.js");
        run.runUntilGlobal("preadEintr");
        expect("preadEintr");
        if (interruptPread)
          throw std::runtime_error("pread EINTR injection was not exercised");
#endif
      }
      e.releaseRunResources();
      if (descriptors() != baseline)
        throw std::runtime_error("run cleanup leaked descriptors");
      {
        grtest::BoundRun run(e, lane);
        e.evaluateScript("globalThis.probe = null; f.openReadAsync('data', 'r').then((t) => { globalThis.probe = t; });",
                         "probe.js");
        run.runUntilGlobal("probe");
        if (descriptors() != baseline + 1)
          throw std::runtime_error("RAII probe did not open descriptor");
        // The token's finalizer destroys the handle, whose body closes the
        // descriptor on the (inline) lane.
        e.evaluateScript("globalThis.probe = null;", "drop-probe.js");
        if (descriptors() != baseline)
          throw std::runtime_error("native payload finalizer leaked descriptor");
        e.evaluateScript("finish('afterCleanup', (async () => {"
                         "await rejects(() => f.readHandleAsync(retained,1,0), /EBADF|closed/); "
                         "await rejects(() => f.closeHandleAsync(retained), /EBADF|closed/); })());",
                         "after-cleanup.js");
        run.runUntilGlobal("afterCleanup");
        expect("afterCleanup");
      }
      e.releaseRunResources();
      std::ifstream input(argv[1]);
      std::string source{std::istreambuf_iterator<char>(input), {}};
      input.close();
      if (source.empty())
        throw std::runtime_error("empty guest test");
      {
        grtest::BoundRun run(e, lane);
        auto promise = e.evaluateModule(source, argv[1]);
        e.set(e.global(), "guestModule", promise);
        e.evaluateScript("finish('guestDone', guestModule);", "guest-module.js");
        run.runUntilGlobal("guestDone");
        expect("guestDone");
      }
      e.releaseRunResources();
      if (descriptors() != baseline)
        throw std::runtime_error("guest retained handle leaked descriptors");
      // Outside a run: a handle closed by run cleanup is refused at the call.
      e.evaluateScript(R"JS(
let closed = false;
__retainedFileHandle.read(new Uint8Array(1)).catch(e => { closed = /EBADF|closed/.test(e.message); });
)JS",
                       "guest-cleanup.js");
      e.drainJobs();
      if (!e.toBoolean(e.evaluateScript("closed", "guest-cleanup-result.js")))
        throw std::runtime_error("guest handle survived run cleanup");
      // Outside a run: the synchronous handle functions, which run cleanup
      // closes too.
      e.evaluateScript(R"JS(
const sync = f.openRead('data', 'r');
check(String(f.readHandle(sync, 2, 2)) === '67,68', 'synchronous pread');
check(String(f.readHandle(sync, 2, null)) === '65,66', 'synchronous cursor');
f.closeHandle(sync);
let syncClosed = false;
try { f.readHandle(sync, 1, 0); } catch (e) { syncClosed = /EBADF/.test(e.message); }
check(syncClosed, 'synchronous close');
globalThis.syncRetained = f.openRead('data', 'r');
)JS",
                       "sync-handles.js");
      if (descriptors() != baseline + 1)
        throw std::runtime_error("synchronous handle did not stay open");
      e.releaseRunResources();
      if (descriptors() != baseline)
        throw std::runtime_error("run cleanup left a synchronous handle open");
      {
        // A handle still open when the engine goes: its run ends without
        // run cleanup, and the engine's teardown finalizes the token.
        grtest::BoundRun run(e, lane);
        e.evaluateScript("globalThis.teardownHandle = null; f.openReadAsync('data','r').then((t) => { "
                         "globalThis.teardownHandle = t; });",
                         "teardown.js");
        run.runUntilGlobal("teardownHandle");
      }
      if (descriptors() != baseline + 1)
        throw std::runtime_error("teardown handle did not stay open until the engine went");
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
