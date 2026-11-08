// Runs unittests/node-context.test.mjs: the guest context class against the
// NodeContext member list. Prints the result and fails when a member is
// neither implemented nor declared unavailable.
#include "kernel/guest.h"
#include <fstream>
#include <iostream>
#include <iterator>
#include <nlohmann/json.hpp>
#include <stdexcept>
#include <string>
#include <vector>

int main(int argc, char** argv) {
  try {
    if (argc != 2) throw std::runtime_error("Expected fixture bundle");
    std::ifstream input(argv[1], std::ios::binary);
    const std::vector<uint8_t> bundle{std::istreambuf_iterator<char>(input), {}};
    auto engine = gr::js::createQuickJsEngine();
    gr::Guest guest(*engine, gr::HostOptions{});
    guest.load(bundle, argv[1]);
    const auto result = nlohmann::json::parse(engine->toString(
        engine->evaluateScript("String(globalThis.__nodeContextResult)", "result.js")));
    std::cout << result.dump(2) << '\n';
    if (!result.at("ok").get<bool>()) throw std::runtime_error("The guest context does not conform to NodeContext");
    return 0;
  } catch (const std::exception& e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
