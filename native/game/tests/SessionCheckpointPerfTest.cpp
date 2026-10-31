#include "core/Session.h"
#include <algorithm>
#include <cstdlib>
#include <iostream>
#include <limits>
#include <new>
using namespace nodetool::game;
namespace {
bool counting = false;
std::size_t allocatedBytes = 0;
Json document(std::size_t inactiveCount) {
  Json inactive = Json::array();
  for (std::size_t i = 0; i < inactiveCount; ++i) {
    inactive.push_back({{"id", "inactive" + std::to_string(i)},
                        {"props", {{"payload", std::string(4096, 'x')}}}});
  }
  return {{"engine", "native-cpp-1"}, {"schemaVersion", 5}, {"dimension", "2d"},
          {"id", "checkpoint-allocation"}, {"title", "Checkpoint allocation"},
          {"initialSceneId", "active"},
          {"scenes", Json::array({
            {{"id", "active"}, {"entities", Json::array({{{"id", "actor"}}})}},
            {{"id", "inactive"}, {"entities", std::move(inactive)}}
          })}};
}
std::size_t stepAllocation(std::size_t inactiveCount) {
  Session session(document(inactiveCount));
  const auto input = Json::object();
  allocatedBytes = 0;
  counting = true;
  try { session.step(input); }
  catch (...) { counting = false; throw; }
  counting = false;
  return allocatedBytes;
}
}
void *operator new(std::size_t size) {
  if (counting) {
    if (size > std::numeric_limits<std::size_t>::max() - allocatedBytes) { throw std::bad_alloc(); }
    allocatedBytes += size;
  }
  if (void *memory = std::malloc(size == 0 ? 1 : size)) { return memory; }
  throw std::bad_alloc();
}
void operator delete(void *memory) noexcept { std::free(memory); }
void operator delete(void *memory, std::size_t) noexcept { std::free(memory); }
int main() {
  try {
    const auto small = stepAllocation(1), large = stepAllocation(100);
    std::cout << "step allocation bytes: small=" << small << " large=" << large << '\n';
    if (large > small + std::max<std::size_t>(small / 10, 32768)) {
      throw std::runtime_error("Tick checkpoint allocations scale with inactive authored document");
    }
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
