// nodetool-account-helper: the cloud account of the Electron desktop app.
//
//   nodetool-account-helper --server https://api.nodetool.ai [--data-dir DIR]
//
// Reads JSON lines on stdin and writes JSON lines on stdout (README,
// "Protocol"). Exits when stdin closes.
#include "account_helper.h"
#include "data_dir.h"
#include "pipe_transport.h"

#include "nodetool/account/http_token_endpoint.h"
#include "nodetool/account/keychain_store.h"
#include "nodetool/account/origin.h"
#include "nodetool/account/policy.h"

#ifdef NODETOOL_ACCOUNT_HELPER_TESTING
#include "file_secret_store.h"
#endif

#include <nlohmann/json.hpp>

#include <cstdio>
#include <cstdlib>
#include <iostream>
#include <memory>
#include <mutex>
#include <optional>
#include <string>

#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#include <winsock2.h>
#else
#include <unistd.h>
#endif

namespace {

using nodetool::account_helper::AccountHelper;
using nodetool::account_helper::HelperOptions;
using nodetool::account_helper::PipeTransport;

// A line longer than this is not a message of the protocol and is dropped.
constexpr size_t kMaxLineBytes = 1 << 20;

std::string hostName() {
  char name[256] = {};
#ifdef _WIN32
  WSADATA data;
  WSAStartup(MAKEWORD(2, 2), &data);
#endif
  if (gethostname(name, sizeof(name) - 1) != 0) {
    return "Desktop";
  }
  return name;
}

std::optional<std::string> argValue(int argc, char** argv, std::string_view flag) {
  for (int i = 1; i + 1 < argc; ++i) {
    if (flag == argv[i]) {
      return std::string(argv[i + 1]);
    }
  }
  return std::nullopt;
}

#ifdef NODETOOL_ACCOUNT_HELPER_TESTING
// NODETOOL_ACCOUNT_HELPER_TEST_FAULT names a FaultPoint at which the test
// helper exits at once, as a process kill would.
std::function<void(nodetool::account::FaultPoint)> testFault() {
  const char* value = std::getenv("NODETOOL_ACCOUNT_HELPER_TEST_FAULT");
  if (value == nullptr) {
    return {};
  }
  const std::string name(value);
  return [name](nodetool::account::FaultPoint point) {
    using nodetool::account::FaultPoint;
    const bool hit = (name == "AfterGenerationWrite" && point == FaultPoint::AfterGenerationWrite) ||
                     (name == "AfterRecordWrite" && point == FaultPoint::AfterRecordWrite);
    if (hit) {
      std::fflush(stdout);
      std::_Exit(70);
    }
  };
}
#endif

} // namespace

int main(int argc, char** argv) {
#ifdef _WIN32
  _setmode(_fileno(stdin), _O_BINARY);
  _setmode(_fileno(stdout), _O_BINARY);
#endif
  std::ios::sync_with_stdio(false);

  std::mutex outMutex;
  const auto emit = [&outMutex](const nlohmann::json& message) {
    const std::string line = message.dump(-1, ' ', false, nlohmann::json::error_handler_t::replace) + "\n";
    const std::lock_guard lock(outMutex);
    std::fwrite(line.data(), 1, line.size(), stdout);
    std::fflush(stdout);
  };

  const std::string server = argValue(argc, argv, "--server").value_or("");
  std::optional<std::filesystem::path> dataDir;
  if (auto dir = argValue(argc, argv, "--data-dir")) {
    dataDir = std::filesystem::path(*dir);
  } else {
    dataDir = nodetool::account_helper::sharedDataDir();
  }
  if (!dataDir) {
    emit({{"type", "fatal"}, {"message", "The data folder of this user is unknown."}});
    return 2;
  }

  PipeTransport transport(emit);
  const std::string origin = nodetool::account::canonicalHttpsOrigin(server).value_or(std::string());
  nodetool::account::HttpTokenEndpoint endpoint(transport, origin);

  std::unique_ptr<nodetool::account::SecretStore> store;
  bool keychainAvailable = true;
#ifdef NODETOOL_ACCOUNT_HELPER_TESTING
  if (const char* dir = std::getenv("NODETOOL_ACCOUNT_HELPER_TEST_STORE")) {
    store = std::make_unique<nodetool::account_helper::FileSecretStore>(dir);
  }
#endif
  if (!store) {
    auto keychain = std::make_unique<nodetool::account::KeychainStore>();
    if (keychain->available()) {
      store = std::move(keychain);
    } else {
      // The sign-in then lasts until the app closes (SR2).
      store = std::make_unique<nodetool::account::MemorySecretStore>();
      keychainAvailable = false;
    }
  }

  HelperOptions options;
  options.dataDir = *dataDir;
  options.serverOrigin = origin;
  options.deviceName = hostName();
  options.store = store.get();
  options.keychainAvailable = keychainAvailable;
  options.endpoint = &endpoint;
  options.transport = &transport;
  options.policy = nodetool::account::readManagedPolicy;
#ifdef NODETOOL_ACCOUNT_HELPER_TESTING
  options.fault = testFault();
  if (const char* tick = std::getenv("NODETOOL_ACCOUNT_HELPER_TEST_TICK_MS")) {
    options.tick = std::chrono::milliseconds(std::atoi(tick));
  }
  if (const char* policy = std::getenv("NODETOOL_ACCOUNT_HELPER_TEST_POLICY")) {
    const std::filesystem::path policyPath(policy);
    options.policy = [policyPath] { return nodetool::account::readPolicyFile(policyPath); };
  }
#endif

  {
    AccountHelper helper(std::move(options), emit);
    emit({{"type", "ready"}, {"protocol", 2}});
    std::string line;
    while (std::getline(std::cin, line)) {
      if (line.size() > kMaxLineBytes) {
        continue;
      }
      const nlohmann::json message = nlohmann::json::parse(line, nullptr, false);
      if (!message.is_object()) {
        continue;
      }
      const auto type = message.find("type");
      if (type != message.end() && type->is_string() && *type == "httpResponse") {
        const auto id = message.find("id");
        const auto status = message.find("status");
        const auto body = message.find("body");
        if (id == message.end() || !id->is_number_unsigned()) {
          continue;
        }
        nodetool::account::HttpResponse response;
        response.status = status != message.end() && status->is_number_integer() ? status->get<int>() : 0;
        response.body = body != message.end() && body->is_string() ? body->get<std::string>() : std::string();
        transport.deliver(id->get<uint64_t>(), std::move(response));
        continue;
      }
      helper.handle(message);
    }
    // stdin closed: the app is quitting. Waiting requests end first, so the
    // helper's threads can be joined.
    transport.close();
  }
  return 0;
}
