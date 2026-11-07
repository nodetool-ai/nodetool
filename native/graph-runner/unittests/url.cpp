// Runs URL and Encoding API comparisons generated from the repository's Node.
#include "js/engine.h"
#include <fstream>
#include <iostream>
#include <iterator>
#include <stdexcept>
#include <string>

int main(int argc, char** argv) {
  try {
    if (argc != 2) throw std::runtime_error("expected URL test bundle");
    std::ifstream input(argv[1]);
    if (!input) throw std::runtime_error("cannot open URL test bundle");
    const std::string source((std::istreambuf_iterator<char>(input)), {});
    auto engine = gr::js::createQuickJsEngine();
    engine->evaluateScript(source, argv[1]);
    const auto result = engine->toString(engine->get(engine->global(), "result"));
    if (result.empty() || result == "undefined") throw std::runtime_error("URL tests did not run");
    std::cout << result << '\n';
    return 0;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
