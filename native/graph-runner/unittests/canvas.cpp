#include "host/canvas.h"

#include <chrono>
#include <fstream>
#include <iostream>
#include <iterator>

#include "host/image.h"
#include "host/intl.h"
#include "host/sqlite.h"
#include "js/engine.h"
namespace gr::host {
void installFiles(js::Engine&, const js::Value&, const HostOptions&);
void installProcess(js::Engine&, const js::Value&, const HostOptions&);
}  // namespace gr::host
int main(int argc, char** argv) {
  if (argc < 2) {
    return 2;
  }
  try {
    auto e = gr::js::createQuickJsEngine();
    auto host = e->object();
    e->set(e->global(), "__host", host);
    auto console = e->object();
    auto log = e->function("log", 0, [](auto& e, const auto& args) {
      for (const auto& a : args) {
        std::cerr << e.toString(a) << ' ';
      }
      std::cerr << '\n';
      return e.undefined();
    });
    for (auto name : {"log", "warn", "error", "debug", "info"}) {
      e->set(console, name, log);
    }
    e->set(e->global(), "console", console);
    gr::HostOptions opts;
    if (argc > 2) {
      opts.readRoots.push_back(argv[2]);
      e->set(e->global(), "canvasFontPath",
             e->string(std::string(argv[2]) + "/Inter-Variable.ttf"));
    }
    auto process = e->object();
    gr::host::installProcess(*e, process, opts);
    e->set(host, "process", process);
    auto intl = e->object();
    gr::host::installIntl(*e, intl);
    e->set(host, "intl", intl);
    auto sqlite = e->object();
    gr::host::installSqlite(*e, sqlite, opts);
    e->set(host, "sqlite", sqlite);
    e->set(host, "log", log);
    auto image = e->object();
    gr::host::installImage(*e, image, opts);
    e->set(host, "image", image);
    auto files = e->object();
    gr::host::installFiles(*e, files, opts);
    e->set(host, "files", files);
    if (argc < 4 || std::string(argv[3]) != "before") {
      auto canvas = e->object();
      gr::host::installCanvas(*e, canvas, opts);
      e->set(host, "canvas", canvas);
    }
    std::ifstream in(argv[1]);
    std::string code{std::istreambuf_iterator<char>(in), {}};
    auto p = e->evaluateModule(code, argv[1]);
    bool done = false;
    std::string error;
    if (e->isPromise(p)) {
      gr::js::then(
          *e, p, [&](auto&, const auto&) { done = true; },
          [&](auto& e, const auto& v) {
            done = true;
            error = e.toString(v);
            if (e.isObject(v)) {
              auto stack = e.get(v, "stack");
              if (!e.isUndefined(stack)) {
                error += "\n" + e.toString(stack);
              }
            }
          });
    } else {
      done = true;
    }
    for (int i = 0; i < 1000 && !done; ++i) {
      e->drainJobs();
    }
    if (!done || !error.empty()) {
      throw std::runtime_error(error.empty() ? "test did not settle" : error);
    }
    if (argc > 3 && std::string(argv[3]) == "cancel") {
      const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(20);
      e->setInterruptHandler([deadline] { return std::chrono::steady_clock::now() > deadline; });
      bool interrupted = false;
      try {
        e->evaluateScript("while(true){__host.canvas.create(2,2);}", "canvas-interrupt.js");
      } catch (const gr::js::JsError&) {
        interrupted = true;
      }
      e->setInterruptHandler({});
      if (!interrupted) {
        throw std::runtime_error("canvas cancellation did not interrupt guest loop");
      }
      std::cout << "canvas guest-loop interruption passed\n";
    }
    std::cout << e->toString(e->get(e->global(), "canvasResult")) << '\n';
    return 0;
  } catch (const std::exception& ex) {
    std::cerr << ex.what() << '\n';
    return 1;
  }
}
