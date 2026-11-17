// In-process tests of the account helper: two helpers, or a helper and a
// session of the library, stand in for the desktop app and a Qt app on one
// computer (TC109, TC112), and the pipe transport's deadlines (TC110's
// helper half). tests/process.test.mjs runs the real program.
#include "account_helper.h"
#include "data_dir.h"
#include "pipe_transport.h"

#include "nodetool/account/account_session.h"
#include "nodetool/account/accounts_index.h"
#include "nodetool/account/session_record.h"
#include "test_support.h"

#include <chrono>
#include <condition_variable>
#include <mutex>
#include <thread>
#include <vector>

using namespace nodetool::account;
using namespace nodetool::account_helper;
using namespace account_test;

namespace {

const std::string kServer = "https://cloud.example.com";

// The messages one helper sent, for the checks.
//
// Thread affinity: thread-safe. `mutex_` guards `messages_`.
class Outbox {
public:
  AccountHelper::Emit emit() {
    return [this](const nlohmann::json& message) {
      {
        const std::lock_guard lock(mutex_);
        messages_.push_back(message);
      }
      changed_.notify_all();
    };
  }

  // Waits until the last state message satisfies `predicate`.
  bool waitForState(const std::function<bool(const nlohmann::json&)>& predicate,
                    std::chrono::milliseconds timeout = std::chrono::milliseconds(3000)) {
    std::unique_lock lock(mutex_);
    return changed_.wait_for(lock, timeout, [&] {
      for (auto it = messages_.rbegin(); it != messages_.rend(); ++it) {
        if ((*it)["type"] == "state") {
          return predicate(*it);
        }
      }
      return false;
    });
  }

  std::vector<nlohmann::json> all() {
    const std::lock_guard lock(mutex_);
    return messages_;
  }

private:
  std::mutex mutex_;
  std::condition_variable changed_;
  std::vector<nlohmann::json> messages_;
};

bool signedInAs(const nlohmann::json& state, const std::string& name) {
  return state["state"] == "signedIn" && state["displayName"] == name;
}

bool signedOut(const nlohmann::json& state) { return state["state"] == "signedOut"; }

// One computer: the shared keychain, data folder, clock and server.
struct Computer {
  TempDir data;
  MemorySecretStore keychain;
  FakeClock clock;
  FakeTokenServer server{clock};

  HelperOptions helperOptions(std::function<ManagedPolicy()> policy = {}) {
    HelperOptions o;
    o.dataDir = data.path();
    o.serverOrigin = kServer;
    o.deviceName = "test";
    o.store = &keychain;
    o.endpoint = &server;
    o.policy = std::move(policy);
    o.nowMs = clock.fn();
    o.tick = std::chrono::milliseconds(50);
    o.lockTimeout = std::chrono::milliseconds(200);
    return o;
  }

  AccountSessionOptions sessionOptions(const std::string& userId = "u1") {
    AccountSessionOptions o;
    o.dataDir = data.path();
    o.serverOrigin = kServer;
    o.userId = userId;
    o.nowMs = clock.fn();
    o.lockTimeout = std::chrono::milliseconds(2000);
    return o;
  }

  // A Qt app signs in: the code exchange and the stored session.
  void signInElsewhere(const std::string& userId = "u1", const std::string& name = "Ada") {
    server.addCode("code-" + userId, userId, name);
    const TokenResult r = server.exchangeCode({"code-" + userId, "v", "http://127.0.0.1/callback", kServer});
    recordSignIn(keychain, sessionOptions(userId), r.tokens);
  }

  SessionRecord record(const std::string& userId = "u1") {
    return readSessionRecord(keychain, keychainAccount(kServer, userId)).value_or(SessionRecord{});
  }
};

// TC109: a sign-in in another app shows in the helper, and a sign-out
// through the helper ends the credential for the other app.
void signInElsewhereThenSignOutHere(TestContext& t) {
  Computer pc;
  Outbox out;
  AccountHelper helper(pc.helperOptions(), out.emit());
  CHECK(out.waitForState(signedOut));

  pc.signInElsewhere();
  CHECK(out.waitForState([](const auto& s) { return signedInAs(s, "Ada"); }));

  AccountSession qtApp(pc.keychain, pc.server, pc.sessionOptions());
  CHECK(qtApp.credentialForRequest().status == CredentialStatus::Ready);

  helper.handle({{"type", "signOut"}});
  CHECK(out.waitForState(signedOut));
  CHECK(qtApp.credentialForRequest().status == CredentialStatus::SignedOut);
  const SessionRecord record = pc.record();
  CHECK(record.state == SessionState::SignedOut);
  CHECK(record.refreshToken.empty());
  CHECK(record.accessToken.empty());
  // The server session ended at once, so nothing is pending.
  CHECK(out.waitForState([](const auto& s) { return signedOut(s) && s["serverEndPending"] == false; }));
  CHECK(!pc.server.grantActive(1));
}

// TC109, the reverse: a sign-out in another app shows in the helper, and
// two helpers see each other's sign-out.
void signOutElsewhereShowsHere(TestContext& t) {
  Computer pc;
  Outbox a;
  Outbox b;
  AccountHelper first(pc.helperOptions(), a.emit());
  AccountHelper second(pc.helperOptions(), b.emit());
  pc.signInElsewhere();
  CHECK(a.waitForState([](const auto& s) { return signedInAs(s, "Ada"); }));
  CHECK(b.waitForState([](const auto& s) { return signedInAs(s, "Ada"); }));

  first.handle({{"type", "signOut"}});
  CHECK(a.waitForState(signedOut));
  CHECK(b.waitForState(signedOut));

  // The Qt app signs in again, then out. The helper follows both.
  pc.signInElsewhere("u1", "Ada");
  CHECK(b.waitForState([](const auto& s) { return signedInAs(s, "Ada"); }));
  AccountSession qtApp(pc.keychain, pc.server, pc.sessionOptions());
  qtApp.signOut();
  CHECK(a.waitForState(signedOut));
  CHECK(b.waitForState(signedOut));
}

// TC112: the helper signs out while the Qt app's refresh is held at the
// server. The held response is discarded and no token is stored again.
void signOutDuringHeldRefresh(TestContext& t) {
  Computer pc;
  Outbox out;
  AccountHelper helper(pc.helperOptions(), out.emit());
  pc.signInElsewhere();
  CHECK(out.waitForState([](const auto& s) { return signedInAs(s, "Ada"); }));

  AccountSession qtApp(pc.keychain, pc.server, pc.sessionOptions());
  CHECK(qtApp.credentialForRequest().status == CredentialStatus::Ready);
  pc.clock.advance(15 * 60 * 1000);

  std::mutex holdMutex;
  std::condition_variable holdSignal;
  bool reached = false;
  bool release = false;
  pc.server.beforeRefreshReturns = [&] {
    std::unique_lock lock(holdMutex);
    reached = true;
    holdSignal.notify_all();
    holdSignal.wait(lock, [&] { return release; });
  };
  RefreshOutcome outcome = RefreshOutcome::Offline;
  std::thread refresher([&] { outcome = qtApp.refresh(); });
  {
    std::unique_lock lock(holdMutex);
    holdSignal.wait(lock, [&] { return reached; });
  }
  helper.handle({{"type", "signOut"}});
  CHECK(out.waitForState(signedOut));
  {
    const std::lock_guard lock(holdMutex);
    release = true;
  }
  holdSignal.notify_all();
  refresher.join();
  pc.server.beforeRefreshReturns = nullptr;

  CHECK(outcome == RefreshOutcome::SignedOut);
  const SessionRecord record = pc.record();
  CHECK(record.state == SessionState::SignedOut);
  CHECK(record.refreshToken.empty());
  CHECK(record.accessToken.empty());
  CHECK(qtApp.credentialForRequest().status == CredentialStatus::SignedOut);
}

// Offline sign-out keeps the handle, says so, and ends the session once the
// server answers.
void offlineSignOutEndsLater(TestContext& t) {
  Computer pc;
  Outbox out;
  AccountHelper helper(pc.helperOptions(), out.emit());
  pc.signInElsewhere();
  CHECK(out.waitForState([](const auto& s) { return signedInAs(s, "Ada"); }));

  pc.server.offline = true;
  helper.handle({{"type", "signOut"}});
  CHECK(out.waitForState([](const auto& s) { return signedOut(s) && s["serverEndPending"] == true; }));
  CHECK(pc.server.grantActive(1));

  pc.server.offline = false;
  pc.clock.advance(6000);
  CHECK(out.waitForState([](const auto& s) { return signedOut(s) && s["serverEndPending"] == false; }));
  CHECK(!pc.server.grantActive(1));
}

// A policy that turns the cloud off refuses sign-in without a browser.
void policyRefusesSignIn(TestContext& t) {
  Computer pc;
  Outbox out;
  ManagedPolicy policy;
  policy.present = true;
  policy.cloudEnabled = false;
  AccountHelper helper(pc.helperOptions([policy] { return policy; }), out.emit());
  helper.handle({{"type", "signIn"}});
  CHECK(out.waitForState([](const auto& s) { return s["cloudAvailable"] == false && signedOut(s); }));
  helper.runOnTaskThread([] {});
  for (const auto& message : out.all()) {
    CHECK(message["type"] != "openBrowser");
  }

  // A session another app holds is not shown as signed in here.
  pc.signInElsewhere();
  helper.runOnTaskThread([] {});
  std::this_thread::sleep_for(std::chrono::milliseconds(200));
  CHECK(out.waitForState(signedOut));
}

// A server that is not an HTTPS origin turns sign-in off.
void noServerRefusesSignIn(TestContext& t) {
  Computer pc;
  Outbox out;
  HelperOptions options = pc.helperOptions();
  options.serverOrigin.clear();
  AccountHelper helper(std::move(options), out.emit());
  helper.handle({{"type", "signIn"}});
  CHECK(out.waitForState([](const auto& s) {
    return signedOut(s) && s["message"].template get<std::string>().find("HTTPS") != std::string::npos;
  }));
  for (const auto& message : out.all()) {
    CHECK(message["type"] != "openBrowser");
  }
}

// The sign-in opens the browser at the server's authorize endpoint, and a
// browser that does not open ends the attempt with a message.
void browserNotOpened(TestContext& t) {
  Computer pc;
  Outbox out;
  AccountHelper helper(pc.helperOptions(), out.emit());
  helper.handle({{"type", "signIn"}});
  std::string url;
  for (int i = 0; i < 100 && url.empty(); ++i) {
    for (const auto& message : out.all()) {
      if (message["type"] == "openBrowser") {
        url = message["url"];
      }
    }
    std::this_thread::sleep_for(std::chrono::milliseconds(20));
  }
  CHECK(url.rfind(kServer + "/oauth/authorize?", 0) == 0);
  CHECK(url.find("app=desktop") != std::string::npos);
  helper.handle({{"type", "browserResult"}, {"opened", false}});
  CHECK(out.waitForState([](const auto& s) {
    return signedOut(s) && s["message"].template get<std::string>().find("browser") != std::string::npos;
  }));
}

// No state message carries a token or a handle (TC114's helper half).
void stateHoldsNoSecret(TestContext& t) {
  Computer pc;
  Outbox out;
  {
    AccountHelper helper(pc.helperOptions(), out.emit());
    pc.signInElsewhere();
    CHECK(out.waitForState([](const auto& s) { return signedInAs(s, "Ada"); }));
    pc.server.offline = true;
    helper.handle({{"type", "signOut"}});
    CHECK(out.waitForState([](const auto& s) { return s["serverEndPending"] == true; }));
  }
  for (const auto& message : out.all()) {
    const std::string text = message.dump();
    CHECK(text.find("ntd_") == std::string::npos);
    CHECK(text.find("ntr_") == std::string::npos);
    CHECK(text.find("nth_") == std::string::npos);
  }
}

// The pipe transport: an answer, a deadline, a cancel and a closed pipe.
void pipeTransport(TestContext& t) {
  std::mutex mutex;
  std::vector<nlohmann::json> sent;
  PipeTransport transport([&](const nlohmann::json& message) {
    const std::lock_guard lock(mutex);
    sent.push_back(message);
  });
  auto lastId = [&]() -> uint64_t {
    for (int i = 0; i < 200; ++i) {
      {
        const std::lock_guard lock(mutex);
        if (!sent.empty() && sent.back()["type"] == "http") {
          return sent.back()["id"].get<uint64_t>();
        }
      }
      std::this_thread::sleep_for(std::chrono::milliseconds(5));
    }
    return 0;
  };

  HttpRequest request;
  request.method = "POST";
  request.url = kServer + "/oauth/token";
  request.requiredOrigin = kServer;
  request.timeout = std::chrono::milliseconds(2000);
  HttpResponse answer;
  std::thread sender([&] { answer = transport.send(request); });
  const uint64_t id = lastId();
  CHECK(id != 0);
  {
    const std::lock_guard lock(mutex);
    CHECK(sent.back()["requiredOrigin"] == kServer);
    CHECK(sent.back()["url"] == kServer + "/oauth/token");
  }
  transport.deliver(id, {200, "ok"});
  sender.join();
  CHECK(answer.status == 200);
  CHECK(answer.body == "ok");

  // A late answer to an ended request is ignored.
  request.timeout = std::chrono::milliseconds(100);
  CHECK(transport.send(request).status == 0);
  {
    const std::lock_guard lock(mutex);
    CHECK(sent.back()["type"] == "httpCancel");
  }
  transport.deliver(id + 1, {200, "late"});

  auto cancel = std::make_shared<RequestCancel>();
  request.cancel = cancel;
  request.timeout = std::chrono::milliseconds(5000);
  std::thread cancelled([&] { answer = transport.send(request); });
  CHECK(lastId() != 0);
  cancel->cancel();
  cancelled.join();
  CHECK(answer.status == 0);

  request.cancel.reset();
  std::thread closing([&] { answer = transport.send(request); });
  CHECK(lastId() != 0);
  transport.close();
  closing.join();
  CHECK(answer.status == 0);
  CHECK(transport.send(request).status == 0);
}

// The data folder matches QStandardPaths' generic data location.
void dataFolder(TestContext& t) {
  const auto env = [](std::map<std::string, std::string> values) {
    return [values](const char* name) -> std::optional<std::string> {
      const auto it = values.find(name);
      if (it == values.end()) {
        return std::nullopt;
      }
      return it->second;
    };
  };
#if defined(__APPLE__)
  CHECK(sharedDataDir(env({{"HOME", "/Users/ada"}})) ==
        std::filesystem::path("/Users/ada/Library/Application Support/NodeTool/native"));
#elif defined(_WIN32)
  CHECK(sharedDataDir(env({{"LOCALAPPDATA", "C:\\Users\\ada\\AppData\\Local"}})) ==
        std::filesystem::path("C:\\Users\\ada\\AppData\\Local") / "NodeTool" / "native");
#else
  CHECK(sharedDataDir(env({{"HOME", "/home/ada"}})) == std::filesystem::path("/home/ada/.local/share/NodeTool/native"));
  CHECK(sharedDataDir(env({{"HOME", "/home/ada"}, {"XDG_DATA_HOME", "/data"}})) ==
        std::filesystem::path("/data/NodeTool/native"));
  // A relative XDG_DATA_HOME is ignored, as Qt ignores it.
  CHECK(sharedDataDir(env({{"HOME", "/home/ada"}, {"XDG_DATA_HOME", "rel"}})) ==
        std::filesystem::path("/home/ada/.local/share/NodeTool/native"));
  CHECK(!sharedDataDir(env({})));
#endif
}

} // namespace

int main() {
  return runTests({
      {"signInElsewhereThenSignOutHere", signInElsewhereThenSignOutHere},
      {"signOutElsewhereShowsHere", signOutElsewhereShowsHere},
      {"signOutDuringHeldRefresh", signOutDuringHeldRefresh},
      {"offlineSignOutEndsLater", offlineSignOutEndsLater},
      {"policyRefusesSignIn", policyRefusesSignIn},
      {"noServerRefusesSignIn", noServerRefusesSignIn},
      {"browserNotOpened", browserNotOpened},
      {"stateHoldsNoSecret", stateHoldsNoSecret},
      {"pipeTransport", pipeTransport},
      {"dataFolder", dataFolder},
  });
}
