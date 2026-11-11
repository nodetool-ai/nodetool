#include "host/webassembly.h"
#include "host/sandbox_wasm.h"
#include <fstream>
#include <wasmtime.h>
#include <cstring>
#include <atomic>
#include <thread>
#include <chrono>
#include <iostream>
#include <iterator>
int main(int argc, char** argv) {
  if (argc != 2) return 2;
  try {
    auto e = gr::js::createQuickJsEngine();
    const char* wat = R"((module
      (import "env" "callback" (func $callback (param i32) (result i32)))
      (memory (export "memory") 1 4)
      (func (export "write") (param i32) i32.const 0 local.get 0 i32.store)
      (func (export "read") (result i32) i32.const 0 i32.load)
      (func (export "invoke") (param i32) (result i32) local.get 0 call $callback)
      (func (export "grow") (param i32) (result i32) local.get 0 memory.grow)
      (func (export "spin") (loop $loop br $loop))))";
    wasm_byte_vec_t fixture;
    if (auto* error = wasmtime_wat2wasm(wat, std::strlen(wat), &fixture)) { wasmtime_error_delete(error); throw std::runtime_error("Invalid test WAT"); }
    e->set(e->global(), "__wasmFixture", e->bytes(reinterpret_cast<uint8_t*>(fixture.data), fixture.size));
    wasm_byte_vec_delete(&fixture);
    const char* scalarWat = R"((module (func (export "add") (param i32 i32) (result i32) local.get 0 local.get 1 i32.add)))";
    wasm_byte_vec_t scalar;
    if (auto* error = wasmtime_wat2wasm(scalarWat, std::strlen(scalarWat), &scalar)) { wasmtime_error_delete(error); throw std::runtime_error("Invalid scalar WAT"); }
    e->set(e->global(), "__wasmFixtureScalar", e->bytes(reinterpret_cast<uint8_t*>(scalar.data), scalar.size));
    wasm_byte_vec_delete(&scalar);
    auto host = e->object(); auto wasm = e->object();
    auto cancelled = std::make_shared<std::atomic<bool>>(false);
    std::jthread canceller;
    gr::host::installWebAssembly(*e, wasm, [cancelled] { return cancelled->load(); });
    e->set(e->global(), "__cancelSoon", e->function("cancelSoon", 0, [&](auto& en, const auto&) {
      canceller = std::jthread([cancelled] { std::this_thread::sleep_for(std::chrono::milliseconds(2)); cancelled->store(true); });
      return en.undefined();
    }));
    auto sandboxWasm = e->object();
    gr::host::installSandboxWasm(*e, sandboxWasm, [cancelled] { return cancelled->load(); });
    e->set(e->global(), "__sandboxWasm", sandboxWasm);
    e->set(host, "webassembly", wasm); e->set(e->global(), "__host", host);
    auto console = e->object();
    e->set(console, "log", e->function("log", 0, [](auto& en, const auto& args) { for (const auto& arg : args) std::cout << en.toString(arg) << '\n'; return en.undefined(); }));
    e->set(console, "error", e->get(console, "log"));
    e->set(console, "warn", e->get(console, "log"));
    e->set(e->global(), "console", console);
    std::ifstream input(argv[1]); std::string source{std::istreambuf_iterator<char>(input), {}};
    bool done = false; std::string error;
    auto result = e->evaluateModule(source, argv[1]);
    gr::js::then(*e, result, [&](auto&, auto&) { done = true; }, [&](auto& en, auto& reason) { error = en.toString(reason); done = true; });
    e->drainJobs();
    if (!done || !error.empty()) throw std::runtime_error("Module failure: " + error);
    if (!e->toBoolean(e->get(e->global(), "__wasmDone"))) throw std::runtime_error("Missing assertions");
    if (canceller.joinable()) canceller.join();
    cancelled->store(false);
    e->releaseRunResources();
    auto afterRun = e->get(e->global(), "__afterRunCleanup");
    if (e->isFunction(afterRun)) e->call(afterRun, e->undefined(), {});
    e->releaseRunResources();
    if (e->isFunction(afterRun)) e->call(afterRun, e->undefined(), {});
    e->releaseContextResources();
    auto afterContext = e->get(e->global(), "__afterContextCleanup");
    if (e->isFunction(afterContext)) e->call(afterContext, e->undefined(), {});
    e->releaseContextResources();
    auto retained = e->get(e->global(), "__retainedBuffer");
    if (!e->isUndefined(retained) && e->toNumber(e->get(retained, "byteLength")) != 0) throw std::runtime_error("Teardown did not detach memory");
    std::cout << "run/context lifecycle assertions passed" << '\n';
    return 0;
  } catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
