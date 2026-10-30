#include "document/Document.h"
#include "core/Session.h"
#include "service/Dispatcher.h"
#include <array>
#include <atomic>
#include <memory>
#include <condition_variable>
#include <cstdint>
#include <deque>
#include <iostream>
#include <map>
#include <mutex>
#include <thread>
#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif
using nodetool::game::Document;
using nodetool::game::Error;
using nodetool::game::Json;
using nodetool::game::failure;
namespace {
constexpr std::uint32_t MaxFrame = 16 * 1024 * 1024;
std::mutex outputMutex;
void write(const Json &value) {
  const auto bytes = Json::to_msgpack(value);
  if (bytes.size() > MaxFrame) {
    throw Error("resource_limit", "Response exceeds frame budget");
  }
  const auto size = static_cast<std::uint32_t>(bytes.size());
  const std::array<char, 4> header{
      static_cast<char>(size >> 24), static_cast<char>(size >> 16),
      static_cast<char>(size >> 8), static_cast<char>(size)};
  std::scoped_lock lock(outputMutex);
  std::cout.write(header.data(), header.size());
  std::cout.write(reinterpret_cast<const char *>(bytes.data()),
                  static_cast<std::streamsize>(bytes.size()));
  std::cout.flush();
}
} // namespace
int main() {
#ifdef _WIN32
  _setmode(_fileno(stdin), _O_BINARY);
  _setmode(_fileno(stdout), _O_BINARY);
#endif
  struct Task {
    Json request;
    std::shared_ptr<std::atomic_bool> cancelled;
  };
  std::mutex queueMutex;
  std::condition_variable ready;
  std::deque<Task> queue;
  std::map<std::string, std::shared_ptr<std::atomic_bool>> active;
  bool finished = false;
  std::jthread processor([&] {
    nodetool::game::Dispatcher worker;
    for (;;) {
      Task task;
      {
        std::unique_lock lock(queueMutex);
        ready.wait(lock, [&] { return finished || !queue.empty(); });
        if (queue.empty()) {
          return;
        }
        task = std::move(queue.front());
        queue.pop_front();
      }
      const auto id = task.request.at("requestId").get<std::string>();
      nodetool::game::setCancellationCheck([flag = task.cancelled] {
        if (flag->load()) {
          throw Error("cancelled", "Operation cancelled");
        }
      });
      try {
        nodetool::game::checkCancellation();
        write(worker.dispatch(task.request));
      } catch (const Error &error) {
        auto response = failure(id, error.code, error.what(), error.path);
        if (!error.details.empty()) {
          response["error"]["details"] = error.details;
        }
        write(response);
      } catch (const Json::exception &) {
        write(failure(id, "protocol_error", "Malformed request payload"));
      } catch (const std::exception &error) {
        std::cerr << error.what() << '\n';
        write(failure(id, "worker_error", "Native worker operation failed"));
      }
      nodetool::game::setCancellationCheck({});
      std::scoped_lock lock(queueMutex);
      active.erase(id);
    }
  });
  auto finish = [&] {
    {
      std::scoped_lock lock(queueMutex);
      finished = true;
    }
    ready.notify_one();
  };
  int exitCode = 0;
  for (;;) {
    std::array<unsigned char, 4> header{};
    std::cin.read(reinterpret_cast<char *>(header.data()), header.size());
    if (std::cin.gcount() == 0 && std::cin.eof()) {
      break;
    }
    if (std::cin.gcount() != 4) {
      std::cerr << "Truncated frame header\n";
      exitCode = 2;
      break;
    }
    const std::uint32_t size = (std::uint32_t(header[0]) << 24) |
                               (std::uint32_t(header[1]) << 16) |
                               (std::uint32_t(header[2]) << 8) | header[3];
    if (size == 0 || size > MaxFrame) {
      std::cerr << "Invalid frame length\n";
      exitCode = 2;
      break;
    }
    std::vector<std::uint8_t> bytes(size);
    std::cin.read(reinterpret_cast<char *>(bytes.data()), size);
    if (std::cin.gcount() != size) {
      std::cerr << "Truncated frame payload\n";
      exitCode = 2;
      break;
    }
    std::string requestId;
    try {
      const auto request = Json::from_msgpack(bytes);
      if (!request.is_object()) {
        throw Error("protocol_error", "Request must be an object");
      }
      requestId = request.value("requestId", std::string{});
      if (requestId.empty() || requestId.size() > 128 ||
          request.value("protocolVersion", 0) != 1) {
        throw Error("protocol_error", "Invalid protocol version or request id");
      }
      if (request.value("operation", std::string{}) == "cancel") {
        const auto target = request.at("targetRequestId").get<std::string>();
        bool found = false;
        {
          std::scoped_lock lock(queueMutex);
          const auto activeTask = active.find(target);
          if (activeTask != active.end()) {
            activeTask->second->store(true);
            found = true;
          }
        }
        write(Json{{"protocolVersion", 1},
                   {"requestId", requestId},
                   {"status", "ok"},
                   {"result", {{"cancelRequested", found}}}});
      } else {
        std::scoped_lock lock(queueMutex);
        if (queue.size() >= 32) {
          throw Error("resource_limit", "Request queue full");
        }
        auto flag = active.contains(requestId)
                        ? active.at(requestId)
                        : std::make_shared<std::atomic_bool>(false);
        active.emplace(requestId, flag);
        queue.push_back({request, flag});
        ready.notify_one();
      }
    } catch (const Error &error) {
      write(failure(requestId, error.code, error.what(), error.path));
    } catch (const Json::exception &) {
      write(failure(requestId, "protocol_error", "Malformed request payload"));
    } catch (const std::exception &error) {
      std::cerr << error.what() << '\n';
      write(
          failure(requestId, "worker_error", "Native worker operation failed"));
    }
  }
  finish();
  return exitCode;
}
