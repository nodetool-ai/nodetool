#include "runtime.hpp"
#include <iostream>
#include <stdexcept>
#include <string>

int main(int argc, char **argv) {
  try {
    if ((argc != 6 && argc != 8) || std::string(argv[1]) != "run") {
      throw std::runtime_error("usage: nodetool-workflow run artifact.pt2 manifest.json inputs.json outputs.json [--repeat N]");
    }
    std::size_t repeat = 1;
    if (argc == 8) {
      const std::string value = argv[7];
      if (std::string(argv[6]) != "--repeat" || value.empty() ||
          value.find_first_not_of("0123456789") != std::string::npos) {
        throw std::runtime_error("repeat must be a positive integer");
      }
      repeat = std::stoull(value);
      if (repeat == 0) {
        throw std::runtime_error("repeat must be positive");
      }
    }
    nw::run(argv[2], argv[3], argv[4], argv[5], repeat);
    return 0;
  } catch (const std::exception &error) {
    std::cerr << "error: " << error.what() << '\n';
    return 1;
  }
}
