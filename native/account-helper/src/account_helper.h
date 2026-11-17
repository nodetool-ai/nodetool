// The account of the Electron desktop app for one cloud server: the same
// session, sign-in and sign-out the Qt apps run through AccountController,
// driven by JSON messages instead of QML (technical design, "The Electron
// desktop app"). main.cpp connects it to stdin and stdout.
#pragma once

#include "nodetool/account/account_session.h"
#include "nodetool/account/policy.h"
#include "nodetool/account/sign_in.h"
#include "nodetool/account/storage.h"
#include "nodetool/account/token_endpoint.h"

#include <nlohmann/json.hpp>

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <filesystem>
#include <functional>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <thread>

namespace nodetool::account_helper {

// What main.cpp hands the helper. The helper borrows `store` and
// `endpoint`, which must outlive it.
struct HelperOptions {
  // The data folder the Qt apps share (sharedDataDir in data_dir.h).
  std::filesystem::path dataDir;
  // The canonical HTTPS origin of the cloud server, or empty when the
  // configured server is not one. Sign-in is then refused.
  std::string serverOrigin;
  // The app the consent page names.
  std::string app = "desktop";
  std::string deviceName;
  account::SecretStore* store = nullptr;
  // False when the computer has no credential store and `store` keeps the
  // session in memory only.
  bool keychainAvailable = true;
  account::TokenEndpoint* endpoint = nullptr;
  std::function<account::ManagedPolicy()> policy;
  // Test hook, passed to every AccountSession and sign-in.
  std::function<void(account::FaultPoint)> fault;
  std::chrono::milliseconds signInTimeout{std::chrono::minutes(5)};
  // How long a sign-out waits for `account.lock` before it goes ahead
  // without it (technical design, "Sign-out", local step 1).
  std::chrono::milliseconds lockTimeout{15000};
  // How often the helper reads the policy, `accounts.json` and the
  // generation file again, so the other apps' changes show here.
  std::chrono::milliseconds tick{1000};
  // Milliseconds since the Unix epoch. Defaults to the system clock.
  std::function<int64_t()> nowMs;
};

// Thread affinity: handle() and the destructor run on the thread that reads
// stdin. Keychain reads, the local sign-out steps and the state run in order
// on one task thread, the server ends on a network thread, the wait for the
// browser on its own thread, and a ticker thread queues the periodic check.
// The helper never refreshes a token. The state they share is in Core,
// under its mutex.
//
// Ownership: the helper owns its threads and joins them in its destructor,
// after cancelling a sign-in that waits for the browser. It shares its Core
// with the tasks it queues, which the threads run before they are joined.
// The sessions the Core owns hold it weakly in their callbacks.
class AccountHelper {
public:
  using Emit = std::function<void(const nlohmann::json&)>;
  AccountHelper(HelperOptions options, Emit emit);
  AccountHelper(const AccountHelper&) = delete;
  AccountHelper& operator=(const AccountHelper&) = delete;
  ~AccountHelper();

  // One message from the main process: `signIn`, `cancelSignIn`,
  // `browserResult`, `signOut` or `reload`. Unknown types are ignored.
  void handle(const nlohmann::json& message);

  // Runs `fn` on the task thread after every task queued before it, and
  // waits for it. For tests.
  void runOnTaskThread(const std::function<void()>& fn);

private:
  struct Core;
  void signIn();

  // Shared with the queued tasks and the sign-in thread, because each of
  // them runs on a thread of its own and must keep the state it uses alive
  // until it returns.
  std::shared_ptr<Core> core_;
  // Started and joined on the thread that calls handle().
  std::thread signInThread_;
  std::thread taskThread_;
  std::thread networkThread_;
  std::thread tickerThread_;
};

} // namespace nodetool::account_helper
