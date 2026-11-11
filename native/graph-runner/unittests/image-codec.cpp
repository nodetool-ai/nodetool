#include "host/image.h"
#include "js/engine.h"
#include <fstream>
#include <filesystem>
#include <vips/vips.h>
namespace gr::host { void installFiles(js::Engine&, const js::Value&, const HostOptions&); }
#include <iostream>
#include <iterator>
int main(int argc, char** argv) {
  std::cout << std::unitbuf;
  if (argc != 2 && argc != 3) return 2;
  try {
    if (argc == 2) {
      std::ifstream input(argv[1], std::ios::binary);
      std::vector<uint8_t> encoded{std::istreambuf_iterator<char>(input), {}};
      const auto image = gr::host::decodeImage(encoded.data(), encoded.size());
      if (!image.width || !image.height || image.pixels.empty()) return 1;
      std::cout << "PASS WebP decode " << image.width << 'x' << image.height << '\n'; return 0;
    }
    for (bool granted : {false, true}) {
    auto e = gr::js::createQuickJsEngine();
    auto host = e->object(), image = e->object();
    gr::host::installImage(*e, image, {});
    auto files = e->object(); gr::HostOptions options;
    if (granted) options.workspaceDir = std::filesystem::path(argv[2]).parent_path().string();
    gr::host::installFiles(*e, files, options); e->set(host, "files", files);
    e->set(e->global(), "granted", e->boolean(granted));
    e->set(e->global(), "fixturePath", e->string((std::filesystem::path(argv[2]).parent_path() / "base.png").string()));
    e->set(host, "image", image); e->set(e->global(), "__host", host);
    std::ifstream fixtures(argv[2]); std::string json{std::istreambuf_iterator<char>(fixtures), {}};
    e->set(e->global(), "fixtureJson", e->string(json));
    std::ifstream source(argv[1]); std::string text{std::istreambuf_iterator<char>(source), {}};
    auto result = e->evaluateModule(text, argv[1]);
    std::string rejected;
    gr::js::then(*e, result, [](auto&, const auto&) {}, [&](auto& engine, const auto& error) { rejected = engine.toString(error); });
    e->drainJobs();
    if (!rejected.empty()) { std::cerr << rejected << '\n'; return 1; }
    auto value = e->evaluateScript("globalThis.testResult || 'pending'", "result");
    auto message = e->toString(value); std::cout << message << '\n';
    if (!message.starts_with("PASS")) return 1;
    }
    vips_shutdown();
    return 0;
  } catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
