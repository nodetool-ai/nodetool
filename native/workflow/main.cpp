#include "compiler.hpp"
#include "runtime.hpp"
#include <iostream>
#include <stdexcept>
#include <string>

namespace {
void bind(nw::Bindings &bindings, const std::string &value) {
  auto split = value.find('=');
  if (split == std::string::npos || split == 0 || split + 1 == value.size()) {
    throw std::runtime_error("binding must be name=file.bin");
  }
  if (!bindings.emplace(value.substr(0, split), value.substr(split + 1))
           .second) {
    throw std::runtime_error("duplicate binding: " + value.substr(0, split));
  }
}
} // namespace
int main(int argc, char **argv) {
  try {
    if (argc < 3) {
      throw std::runtime_error(
          "usage: nodetool-workflow compile graph.json --output directory "
          "[--target cpu|cuda] [--mode strict|fast]\n       nodetool-workflow "
          "inspect artifact\n       nodetool-workflow run artifact --input "
          "name=file.bin --output name=file.bin [--repeat N]");
    }
    std::string command = argv[1];
    std::string output, target = "cpu", mode = "strict";
    nw::Bindings inputs, outputs;
    std::size_t repeat = 1;
    for (int i = 3; i < argc; ++i) {
      std::string option = argv[i];
      if (++i >= argc) {
        throw std::runtime_error("missing value for " + option);
      }
      std::string value = argv[i];
      if (command == "compile" && option == "--output") {
        output = value;
      } else if (command == "compile" && option == "--target") {
        target = value;
      } else if (command == "compile" && option == "--mode") {
        mode = value;
      } else if (command == "run" && option == "--input") {
        bind(inputs, value);
      } else if (command == "run" && option == "--output") {
        bind(outputs, value);
      } else if (command == "run" && option == "--repeat") {
        if (value.empty() ||
            value.find_first_not_of("0123456789") != std::string::npos) {
          throw std::runtime_error("repeat must be a positive integer");
        }
        repeat = std::stoull(value);
        if (!repeat) {
          throw std::runtime_error("repeat must be positive");
        }
      } else {
        throw std::runtime_error("unknown option: " + option);
      }
    }
    if (command == "compile") {
      if (output.empty()) {
        throw std::runtime_error("compile requires --output");
      }
      nw::compile(argv[2], output, target, mode);
      std::cout << "Compiled artifact: " << output << '\n';
    } else if (command == "inspect") {
      std::cout << nw::inspect(argv[2]) << '\n';
    } else if (command == "run") {
      nw::run(argv[2], inputs, outputs, repeat);
    } else {
      throw std::runtime_error("unknown command: " + command);
    }
    return 0;
  } catch (const std::exception &error) {
    std::cerr << "error: " << error.what() << '\n';
    return 1;
  }
}
