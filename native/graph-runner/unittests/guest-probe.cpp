#include "kernel/guest.h"
#include "js/engine.h"
#include <fstream>
#include <iterator>
#include <iostream>
int main(int argc,char** argv) {
  try {
    auto engine=gr::js::createQuickJsEngine(); gr::Guest guest(*engine);
    std::ifstream file(argv[1]); if (!file) throw std::runtime_error("cannot read fixture");
    std::string source{std::istreambuf_iterator<char>(file),{}};
    guest.load(std::vector<uint8_t>(source.begin(),source.end()),argv[1]);
    auto result=engine->get(engine->global(),"G6_RESULTS");
    if (!engine->isString(result)) throw std::runtime_error("fixture did not finish");
    std::cout << engine->toString(result) << '\n';
    return 0;
  } catch(const std::exception& error) { std::cerr<<error.what()<<'\n';return 1; }
}
