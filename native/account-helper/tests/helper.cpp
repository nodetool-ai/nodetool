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
#include <algorithm>
#include <atomic>
#include <optional>
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

  // Waits for a message that satisfies `predicate` and returns it, or null.
  nlohmann::json waitFor(const std::function<bool(const nlohmann::json&)>& predicate,
                         std::chrono::milliseconds timeout = std::chrono::milliseconds(5000)) {
    std::unique_lock lock(mutex_);
    nlohmann::json found;
    changed_.wait_for(lock, timeout, [&] {
      for (const auto& message : messages_) {
        if (predicate(message)) {
          found = message;
          return true;
        }
      }
      return false;
    });
    return found;
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
  // The state names the account, which keys the desktop app's caches.
  CHECK(out.waitForState([](const auto& s) { return signedInAs(s, "Ada") && s["accountId"] == "u1"; }));

  AccountSession qtApp(pc.keychain, pc.server, pc.sessionOptions());
  CHECK(qtApp.credentialForRequest().status == CredentialStatus::Ready);

  helper.handle({{"type", "signOut"}});
  CHECK(out.waitForState([](const auto& s) { return signedOut(s) && s["accountId"] == ""; }));
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

// A server end the server holds does not hold a later sign-out: the other
// app loses the credential at once.
void heldServerEndDoesNotDelaySignOut(TestContext& t) {
  Computer pc;
  Outbox out;
  AccountHelper helper(pc.helperOptions(), out.emit());
  pc.signInElsewhere();
  CHECK(out.waitForState([](const auto& s) { return signedInAs(s, "Ada"); }));

  std::mutex holdMutex;
  std::condition_variable holdSignal;
  bool reached = false;
  bool release = false;
  pc.server.beforeEndSessionReturns = [&] {
    std::unique_lock lock(holdMutex);
    reached = true;
    holdSignal.notify_all();
    holdSignal.wait(lock, [&] { return release; });
  };
  const auto releaseHeld = [&] {
    {
      const std::lock_guard lock(holdMutex);
      release = true;
    }
    holdSignal.notify_all();
  };
  helper.handle({{"type", "signOut"}});
  {
    std::unique_lock lock(holdMutex);
    CHECK(holdSignal.wait_for(lock, std::chrono::seconds(3), [&] { return reached; }));
  }

  // The first server end is held. The account signs in again and the
  // helper signs it out.
  pc.signInElsewhere("u1", "Ada");
  CHECK(out.waitForState([](const auto& s) { return signedInAs(s, "Ada"); }));
  AccountSession qtApp(pc.keychain, pc.server, pc.sessionOptions());
  CHECK(qtApp.credentialForRequest().status == CredentialStatus::Ready);
  helper.handle({{"type", "signOut"}});
  CHECK(out.waitForState(signedOut, std::chrono::milliseconds(1000)));
  CHECK(qtApp.credentialForRequest().status == CredentialStatus::SignedOut);

  releaseHeld();
  CHECK(out.waitForState([](const auto& s) { return signedOut(s) && s["serverEndPending"] == false; }));
  pc.server.beforeEndSessionReturns = nullptr;
}

// TC112: reading the state never renews a token, also not an expired one
// at start. Only a cloud request does.
void helperNeverRefreshes(TestContext& t) {
  Computer pc;
  pc.signInElsewhere();
  pc.clock.advance(60 * 60 * 1000);
  Outbox out;
  AccountHelper helper(pc.helperOptions(), out.emit());
  CHECK(out.waitForState([](const auto& s) { return signedInAs(s, "Ada"); }));
  std::this_thread::sleep_for(std::chrono::milliseconds(200));
  CHECK(pc.server.refreshCalls.load() == 0);
}

// A helper without a keychain keeps its session in its own memory. It
// leaves alone an account another app keeps in the keychain it can't read.
void memoryStoreLeavesOtherAppsAlone(TestContext& t) {
  Computer pc;
  pc.signInElsewhere();
  AccountSession qtApp(pc.keychain, pc.server, pc.sessionOptions());
  CHECK(qtApp.credentialForRequest().status == CredentialStatus::Ready);

  MemorySecretStore helperMemory;
  HelperOptions options = pc.helperOptions();
  options.store = &helperMemory;
  options.keychainAvailable = false;
  Outbox out;
  AccountHelper helper(std::move(options), out.emit());
  CHECK(out.waitForState(signedOut));
  std::this_thread::sleep_for(std::chrono::milliseconds(300));
  CHECK(qtApp.credentialForRequest().status == CredentialStatus::Ready);
  CHECK(pc.record().state == SessionState::SignedIn);
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

// The main process for the requests of protocol version 2: the pipe
// transport's `http` messages, answered by `answer`, which returns no
// answer to hold a request until its cancel.
//
// Thread affinity: thread-safe. `mutex_` guards the log and the handler.
// Ownership: owns the transport, which the helper borrows. Destroy the
// helper first.
class FakeMain {
public:
  using Answer = std::function<std::optional<HttpResponse>(const nlohmann::json&)>;
  explicit FakeMain(Answer answer)
      : answer_(std::move(answer)), pipe_([this](const nlohmann::json& message) { onMessage(message); }) {}

  PipeTransport& pipe() { return pipe_; }

  std::vector<nlohmann::json> sent() {
    const std::lock_guard lock(mutex_);
    return sent_;
  }

  bool waitForHttp(size_t count, std::chrono::milliseconds timeout = std::chrono::milliseconds(3000)) {
    std::unique_lock lock(mutex_);
    return changed_.wait_for(lock, timeout, [&] {
      return std::count_if(sent_.begin(), sent_.end(), [](const auto& m) { return m["type"] == "http"; }) >=
             static_cast<std::ptrdiff_t>(count);
    });
  }

private:
  void onMessage(const nlohmann::json& message) {
    Answer answer;
    {
      const std::lock_guard lock(mutex_);
      sent_.push_back(message);
      answer = answer_;
    }
    changed_.notify_all();
    if (message["type"] != "http") {
      return;
    }
    // The transport waits for the answer after this returns, and takes it
    // from deliver() at once.
    if (const auto response = answer(message)) {
      pipe_.deliver(message["id"].get<uint64_t>(), *response);
    }
  }

  std::mutex mutex_;
  std::condition_variable changed_;
  Answer answer_;
  std::vector<nlohmann::json> sent_;
  PipeTransport pipe_;
};

std::string bearerOf(const nlohmann::json& http) {
  for (const auto& header : http["headers"]) {
    if (header[0] == "Authorization") {
      const std::string value = header[1];
      return value.starts_with("Bearer ") ? value.substr(7) : std::string();
    }
  }
  return {};
}

// A field of a message the test waited for, or null when none came.
nlohmann::json field(const nlohmann::json& message, const char* key) {
  return message.is_object() && message.contains(key) ? message[key] : nlohmann::json();
}

bool responseTo(const nlohmann::json& message, uint64_t id) {
  return message["type"] == "response" && message["id"] == id;
}

// The cloud answers a request with a valid token, and 401 otherwise.
FakeMain::Answer cloudAnswers(FakeTokenServer& server) {
  return [&server](const nlohmann::json& http) -> std::optional<HttpResponse> {
    return HttpResponse{server.request(bearerOf(http)) ? 200 : 401, ""};
  };
}

// TC116, the helper's half: a cloud request goes to the session's server
// with the credential, and nothing the helper sends back holds it.
void cloudRequestCarriesTheCredential(TestContext& t) {
  Computer pc;
  pc.signInElsewhere();
  FakeMain main(cloudAnswers(pc.server));
  Outbox out;
  HelperOptions options = pc.helperOptions();
  options.transport = &main.pipe();
  {
    AccountHelper helper(std::move(options), out.emit());
    CHECK(out.waitForState([](const auto& s) { return signedInAs(s, "Ada"); }));
    helper.handle({{"type", "request"}, {"id", 7}, {"method", "GET"}, {"path", "/trpc/workflows.get?input=%7B%7D"}});
    const nlohmann::json response = out.waitFor([](const auto& m) { return responseTo(m, 7); });
    CHECK(field(response, "status") == 200);
    CHECK(field(response, "error") == "");
    const auto sent = main.sent();
    CHECK(sent.size() == 1);
    if (sent.size() == 1) {
      CHECK(sent[0]["url"] == kServer + "/trpc/workflows.get?input=%7B%7D");
      CHECK(sent[0]["method"] == "GET");
      CHECK(sent[0]["request"] == 7);
      CHECK(sent[0]["requiredOrigin"] == kServer);
      // The main process holds the body: the helper sends none.
      CHECK(sent[0]["body"] == "");
      const std::string token = bearerOf(sent[0]);
      CHECK(token == pc.record().accessToken && !token.empty());
      for (const auto& message : out.all()) {
        CHECK(message.dump().find(token) == std::string::npos);
      }
    }
  }
  main.pipe().close();
}

// TC117, the helper's half: a path no route has, another host, the token
// endpoints and an unknown method are refused before a credential is read.
void cloudRequestRefusesOddPaths(TestContext& t) {
  Computer pc;
  pc.signInElsewhere();
  FakeMain main(cloudAnswers(pc.server));
  Outbox out;
  HelperOptions options = pc.helperOptions();
  options.transport = &main.pipe();
  {
    AccountHelper helper(std::move(options), out.emit());
    CHECK(out.waitForState([](const auto& s) { return signedInAs(s, "Ada"); }));
    const std::vector<std::pair<std::string, std::string>> refused = {
        {"POST", "/oauth/token"},          {"GET", "//evil.example/x"},      {"GET", "https://evil.example/"},
        {"GET", "/trpc/../oauth/token"},   {"GET", "/api/assets/a#b"},       {"GET", "/api/assets/a b"},
        {"TRACE", "/trpc/workflows.get"},  {"GET", "trpc/workflows.get"},    {"GET", "/api/assets/.."},
    };
    uint64_t id = 100;
    for (const auto& [method, path] : refused) {
      helper.handle({{"type", "request"}, {"id", id}, {"method", method}, {"path", path}});
      const nlohmann::json response = out.waitFor([id](const auto& m) { return responseTo(m, id); });
      CHECK(field(response, "error") == "INVALID");
      ++id;
    }
    CHECK(main.sent().empty());
    CHECK(pc.server.refreshCalls.load() == 0);
  }
  main.pipe().close();
}

// A 401 renews the token once and sends again. A second 401 is the answer.
void cloudRequestRenewsOnce(TestContext& t) {
  Computer pc;
  pc.signInElsewhere();
  std::atomic<int> refusals{1};
  FakeMain main([&](const nlohmann::json& http) -> std::optional<HttpResponse> {
    if (refusals.load() > 0) {
      --refusals;
      return HttpResponse{401, ""};
    }
    return HttpResponse{pc.server.request(bearerOf(http)) ? 200 : 401, ""};
  });
  Outbox out;
  HelperOptions options = pc.helperOptions();
  options.transport = &main.pipe();
  {
    AccountHelper helper(std::move(options), out.emit());
    CHECK(out.waitForState([](const auto& s) { return signedInAs(s, "Ada"); }));
    helper.handle({{"type", "request"}, {"id", 1}, {"method", "POST"}, {"path", "/trpc/workflows.update"}});
    CHECK(field(out.waitFor([](const auto& m) { return responseTo(m, 1); }), "status") == 200);
    CHECK(pc.server.refreshCalls.load() == 1);
    const auto sent = main.sent();
    CHECK(sent.size() == 2 && bearerOf(sent[0]) != bearerOf(sent[1]));

    refusals = 5;
    helper.handle({{"type", "request"}, {"id", 2}, {"method", "POST"}, {"path", "/trpc/workflows.update"}});
    CHECK(field(out.waitFor([](const auto& m) { return responseTo(m, 2); }), "status") == 401);
    CHECK(main.sent().size() == 4);
  }
  main.pipe().close();
}

// FC30 and TC119, the helper's half: a sign-out in a Qt app stops the next
// request before the helper's poll notices it, and the poll stops one that
// is on the wire.
void signOutElsewhereStopsRequests(TestContext& t) {
  Computer pc;
  pc.signInElsewhere();
  std::atomic<bool> hold{false};
  FakeMain main([&](const nlohmann::json& http) -> std::optional<HttpResponse> {
    if (hold.load()) {
      return std::nullopt;
    }
    return HttpResponse{pc.server.request(bearerOf(http)) ? 200 : 401, ""};
  });
  Outbox out;
  HelperOptions options = pc.helperOptions();
  options.transport = &main.pipe();
  // No poll during the first part.
  options.tick = std::chrono::hours(1);
  {
    AccountHelper helper(std::move(options), out.emit());
    CHECK(out.waitForState([](const auto& s) { return signedInAs(s, "Ada"); }));
    helper.handle({{"type", "request"}, {"id", 1}, {"method", "GET"}, {"path", "/trpc/workflows.list"}});
    CHECK(field(out.waitFor([](const auto& m) { return responseTo(m, 1); }), "status") == 200);

    AccountSession qtApp(pc.keychain, pc.server, pc.sessionOptions());
    qtApp.signOut();
    helper.handle({{"type", "request"}, {"id", 2}, {"method", "GET"}, {"path", "/trpc/workflows.list"}});
    CHECK(field(out.waitFor([](const auto& m) { return responseTo(m, 2); }), "error") == "SIGNED_OUT");
    CHECK(main.sent().size() == 1);
  }
  main.pipe().close();

  // A request on the wire when another app signs out answers SIGNED_OUT
  // once the poll notices.
  Computer again;
  again.signInElsewhere();
  FakeMain held([](const nlohmann::json&) -> std::optional<HttpResponse> { return std::nullopt; });
  Outbox second;
  HelperOptions polled = again.helperOptions();
  polled.transport = &held.pipe();
  {
    AccountHelper helper(std::move(polled), second.emit());
    CHECK(second.waitForState([](const auto& s) { return signedInAs(s, "Ada"); }));
    helper.handle({{"type", "request"}, {"id", 3}, {"method", "GET"}, {"path", "/trpc/workflows.list"}});
    CHECK(held.waitForHttp(1));
    AccountSession qtApp(again.keychain, again.server, again.sessionOptions());
    qtApp.signOut();
    const nlohmann::json response =
        second.waitFor([](const auto& m) { return responseTo(m, 3); }, std::chrono::milliseconds(2000));
    CHECK(field(response, "error") == "SIGNED_OUT");
    CHECK(second.waitForState(signedOut));
  }
  held.pipe().close();
}

// The main process cancels a request: the helper stops waiting, tells the
// main process to drop the send, and answers CANCELLED.
void requestCancelStopsARequest(TestContext& t) {
  Computer pc;
  pc.signInElsewhere();
  FakeMain main([](const nlohmann::json&) -> std::optional<HttpResponse> { return std::nullopt; });
  Outbox out;
  HelperOptions options = pc.helperOptions();
  options.transport = &main.pipe();
  {
    AccountHelper helper(std::move(options), out.emit());
    CHECK(out.waitForState([](const auto& s) { return signedInAs(s, "Ada"); }));
    helper.handle({{"type", "request"}, {"id", 4}, {"method", "GET"}, {"path", "/api/assets/a1"}});
    CHECK(main.waitForHttp(1));
    helper.handle({{"type", "requestCancel"}, {"id", 4}});
    CHECK(field(out.waitFor([](const auto& m) { return responseTo(m, 4); }), "error") == "CANCELLED");
    const auto sent = main.sent();
    CHECK(std::any_of(sent.begin(), sent.end(), [](const auto& m) { return m["type"] == "httpCancel"; }));
    // An id in flight is refused a second time; a free one is not.
    helper.handle({{"type", "request"}, {"id", 5}, {"method", "GET"}, {"path", "/api/assets/a1"}});
    CHECK(main.waitForHttp(2));
    helper.handle({{"type", "request"}, {"id", 5}, {"method", "GET"}, {"path", "/api/assets/a1"}});
    CHECK(field(out.waitFor([](const auto& m) { return responseTo(m, 5); }), "error") == "INVALID");
  }
  // The helper's destructor ends the request still held.
  main.pipe().close();
}

// TC122, the helper's half: a transfer call goes to the local server only,
// with the session's server, account and token in its input. The
// renderer's own values for them are replaced.
void transferAddsTheAccount(TestContext& t) {
  Computer pc;
  pc.signInElsewhere();
  FakeMain main([](const nlohmann::json&) -> std::optional<HttpResponse> {
    return HttpResponse{200, R"({"result":{"data":{"json":{"state":"cancelled"}}}})"};
  });
  Outbox out;
  HelperOptions options = pc.helperOptions();
  options.transport = &main.pipe();
  const auto transferResult = [](uint64_t id) {
    return [id](const nlohmann::json& m) { return m["type"] == "transferResult" && m["id"] == id; };
  };
  {
    AccountHelper helper(std::move(options), out.emit());
    CHECK(out.waitForState([](const auto& s) { return signedInAs(s, "Ada"); }));
    const nlohmann::json forged = {{"transfer_id", "t1"}, {"access_token", "forged"}, {"origin", "https://evil"}};
    helper.handle({{"type", "transfer"},
                   {"id", 9},
                   {"procedure", "cloudTransfer.send.cancel"},
                   {"input", forged},
                   {"localOrigin", "http://127.0.0.1:7777"}});
    const nlohmann::json result = out.waitFor(transferResult(9));
    CHECK(field(result, "status") == "ok");
    CHECK(field(result, "data") == nlohmann::json({{"state", "cancelled"}}));
    const auto sent = main.sent();
    CHECK(sent.size() == 1);
    if (sent.size() == 1) {
      CHECK(sent[0]["url"] == "http://127.0.0.1:7777/trpc/cloudTransfer.send.cancel");
      CHECK(sent[0]["transfer"] == 9);
      const nlohmann::json input = nlohmann::json::parse(sent[0]["body"].get<std::string>());
      CHECK(input["origin"] == kServer);
      CHECK(input["account_id"] == "u1");
      CHECK(input["transfer_id"] == "t1");
      CHECK(input["access_token"] == pc.record().accessToken);
      CHECK(result.dump().find(pc.record().accessToken) == std::string::npos);
    }

    // Another origin, an unknown procedure, and an input that is no object.
    helper.handle({{"type", "transfer"}, {"id", 10}, {"procedure", "cloudTransfer.link"},
                   {"input", nlohmann::json::object()}, {"localOrigin", "https://evil.example"}});
    helper.handle({{"type", "transfer"}, {"id", 11}, {"procedure", "workflows.delete"},
                   {"input", nlohmann::json::object()}, {"localOrigin", "http://127.0.0.1:7777"}});
    helper.handle({{"type", "transfer"}, {"id", 12}, {"procedure", "cloudTransfer.link"},
                   {"input", "project"}, {"localOrigin", "http://127.0.0.1:7777"}});
    for (uint64_t id : {10, 11, 12}) {
      const nlohmann::json refused = out.waitFor(transferResult(id));
      CHECK(field(refused, "status") == "refused" && field(refused, "reason") == "INVALID");
    }
    CHECK(main.sent().size() == 1);

    // Signed out: nothing reaches the local server.
    AccountSession qtApp(pc.keychain, pc.server, pc.sessionOptions());
    qtApp.signOut();
    CHECK(out.waitForState(signedOut));
    helper.handle({{"type", "transfer"}, {"id", 13}, {"procedure", "cloudTransfer.link"},
                   {"input", {{"project_id", "p"}}}, {"localOrigin", "http://127.0.0.1:7777"}});
    CHECK(field(out.waitFor(transferResult(13)), "status") == "signedOut");
    CHECK(main.sent().size() == 1);
  }
  main.pipe().close();
}

// D25: a token for one socket upgrade while signed in, none after.
void socketTokenFollowsTheSession(TestContext& t) {
  Computer pc;
  pc.signInElsewhere();
  Outbox out;
  {
    AccountHelper helper(pc.helperOptions(), out.emit());
    CHECK(out.waitForState([](const auto& s) { return signedInAs(s, "Ada"); }));
    helper.handle({{"type", "socketToken"}, {"id", 1}});
    const auto result = out.waitFor([](const auto& m) { return m["type"] == "socketTokenResult" && m["id"] == 1; });
    CHECK(result.value("token", std::string()) == pc.record().accessToken);
    AccountSession qtApp(pc.keychain, pc.server, pc.sessionOptions());
    qtApp.signOut();
    helper.handle({{"type", "socketToken"}, {"id", 2}});
    const auto refused = out.waitFor([](const auto& m) { return m["type"] == "socketTokenResult" && m["id"] == 2; });
    CHECK(field(refused, "error") == "SIGNED_OUT");
    CHECK(!refused.contains("token"));
  }
}

// TC118: both Qt apps and the helper hold tokens that expire together, and
// each sends a request. One call to the token endpoint, one token for all.
void threeAppsRenewOnce(TestContext& t) {
  Computer pc;
  pc.signInElsewhere();
  AccountSession nodeEditor(pc.keychain, pc.server, pc.sessionOptions());
  AccountSession timeline(pc.keychain, pc.server, pc.sessionOptions());
  CHECK(nodeEditor.credentialForRequest().status == CredentialStatus::Ready);
  CHECK(timeline.credentialForRequest().status == CredentialStatus::Ready);
  std::mutex tokensMutex;
  std::vector<std::string> tokens;
  FakeMain main([&](const nlohmann::json& http) -> std::optional<HttpResponse> {
    const std::lock_guard lock(tokensMutex);
    tokens.push_back(bearerOf(http));
    return HttpResponse{pc.server.request(bearerOf(http)) ? 200 : 401, ""};
  });
  Outbox out;
  HelperOptions options = pc.helperOptions();
  options.transport = &main.pipe();
  options.lockTimeout = std::chrono::milliseconds(5000);
  {
    AccountHelper helper(std::move(options), out.emit());
    CHECK(out.waitForState([](const auto& s) { return signedInAs(s, "Ada"); }));
    pc.clock.advance(15 * 60 * 1000);
    std::string first;
    std::string second;
    std::thread a([&] { first = nodeEditor.credentialForRequest().accessToken; });
    std::thread b([&] { second = timeline.credentialForRequest().accessToken; });
    helper.handle({{"type", "request"}, {"id", 1}, {"method", "GET"}, {"path", "/trpc/workflows.list"}});
    a.join();
    b.join();
    CHECK(field(out.waitFor([](const auto& m) { return responseTo(m, 1); }), "status") == 200);
    CHECK(pc.server.refreshCalls.load() == 1);
    CHECK(!first.empty() && first == second);
    const std::lock_guard lock(tokensMutex);
    CHECK(tokens.size() == 1 && tokens[0] == first);
  }
  main.pipe().close();
}

// TC112, the second case: a Qt app signs out while the helper's renewal for
// a cloud request is held at the server. The held response is discarded.
void signOutElsewhereDuringHelperRefresh(TestContext& t) {
  Computer pc;
  pc.signInElsewhere();
  FakeMain main(cloudAnswers(pc.server));
  Outbox out;
  HelperOptions options = pc.helperOptions();
  options.transport = &main.pipe();
  std::mutex holdMutex;
  std::condition_variable holdSignal;
  bool reached = false;
  bool release = false;
  {
    AccountHelper helper(std::move(options), out.emit());
    CHECK(out.waitForState([](const auto& s) { return signedInAs(s, "Ada"); }));
    pc.clock.advance(15 * 60 * 1000);
    pc.server.beforeRefreshReturns = [&] {
      std::unique_lock lock(holdMutex);
      reached = true;
      holdSignal.notify_all();
      holdSignal.wait(lock, [&] { return release; });
    };
    helper.handle({{"type", "request"}, {"id", 1}, {"method", "GET"}, {"path", "/trpc/workflows.list"}});
    {
      std::unique_lock lock(holdMutex);
      CHECK(holdSignal.wait_for(lock, std::chrono::seconds(3), [&] { return reached; }));
    }
    // The renewal holds account.lock, so the sign-out goes ahead without it
    // after its wait (Sign-out, local step 1).
    AccountSession qtApp(pc.keychain, pc.server, pc.sessionOptions());
    qtApp.signOut();
    {
      const std::lock_guard lock(holdMutex);
      release = true;
    }
    holdSignal.notify_all();
    CHECK(field(out.waitFor([](const auto& m) { return responseTo(m, 1); }), "error") == "SIGNED_OUT");
    pc.server.beforeRefreshReturns = nullptr;
    CHECK(main.sent().empty());
    const SessionRecord record = pc.record();
    CHECK(record.state == SessionState::SignedOut);
    CHECK(record.refreshToken.empty());
    CHECK(record.accessToken.empty());
  }
  main.pipe().close();
}

} // namespace

int main() {
  return runTests({
      {"signInElsewhereThenSignOutHere", signInElsewhereThenSignOutHere},
      {"signOutElsewhereShowsHere", signOutElsewhereShowsHere},
      {"signOutDuringHeldRefresh", signOutDuringHeldRefresh},
      {"offlineSignOutEndsLater", offlineSignOutEndsLater},
      {"heldServerEndDoesNotDelaySignOut", heldServerEndDoesNotDelaySignOut},
      {"helperNeverRefreshes", helperNeverRefreshes},
      {"memoryStoreLeavesOtherAppsAlone", memoryStoreLeavesOtherAppsAlone},
      {"policyRefusesSignIn", policyRefusesSignIn},
      {"noServerRefusesSignIn", noServerRefusesSignIn},
      {"browserNotOpened", browserNotOpened},
      {"stateHoldsNoSecret", stateHoldsNoSecret},
      {"pipeTransport", pipeTransport},
      {"dataFolder", dataFolder},
      {"cloudRequestCarriesTheCredential", cloudRequestCarriesTheCredential},
      {"cloudRequestRefusesOddPaths", cloudRequestRefusesOddPaths},
      {"cloudRequestRenewsOnce", cloudRequestRenewsOnce},
      {"signOutElsewhereStopsRequests", signOutElsewhereStopsRequests},
      {"requestCancelStopsARequest", requestCancelStopsARequest},
      {"transferAddsTheAccount", transferAddsTheAccount},
      {"socketTokenFollowsTheSession", socketTokenFollowsTheSession},
      {"threeAppsRenewOnce", threeAppsRenewOnce},
      {"signOutElsewhereDuringHelperRefresh", signOutElsewhereDuringHelperRefresh},
  });
}
