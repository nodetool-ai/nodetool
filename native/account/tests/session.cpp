// The session tests of the technical design's phase 1 table: TC1, TC4, TC7
// and TC16 to TC18. Two AccountSession objects with their own lock file
// descriptors stand in for the two apps. They share an in-memory keychain
// and the account folder, as the two apps share the keychain item and the
// data folder. A "kill" is a fault hook that throws: the lock is released
// with its file, as the operating system releases it from a killed process,
// and nothing after the point is written.
#include "nodetool/account/account_session.h"
#include "nodetool/account/accounts_index.h"
#include "nodetool/account/sign_in.h"
#include "test_support.h"

#include <algorithm>
#include <condition_variable>
#include <atomic>
#include <fstream>
#include <latch>
#include <sstream>
#include <thread>

#ifndef _WIN32
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>
#endif

namespace {

using namespace nodetool::account;
using account_test::FakeClock;
using account_test::FakeTokenServer;
using account_test::TempDir;
using account_test::TestContext;

constexpr const char* kServer = "https://nt.example";

struct SimulatedKill {};

// One computer: the shared keychain, the data folder, the clock, the server.
struct Computer {
  TempDir data;
  MemorySecretStore keychain;
  FakeClock clock;
  FakeTokenServer server{clock};

  AccountSessionOptions options(std::string userId = "u1") {
    AccountSessionOptions o;
    o.dataDir = data.path();
    o.serverOrigin = kServer;
    o.userId = std::move(userId);
    o.nowMs = clock.fn();
    o.lockTimeout = std::chrono::milliseconds(2000);
    return o;
  }

  // Sign in through the code exchange, without the browser.
  TokenSet signIn(const std::string& userId = "u1") {
    server.addCode("code-" + userId, userId, "Ada");
    const TokenResult r = server.exchangeCode({"code-" + userId, "v", "http://127.0.0.1/callback", kServer});
    recordSignIn(keychain, options(userId), r.tokens);
    return r.tokens;
  }

  SessionRecord record(const std::string& userId = "u1") {
    return readSessionRecord(keychain, keychainAccount(kServer, userId)).value_or(SessionRecord{});
  }

  std::filesystem::path genPath(const std::string& userId = "u1") {
    return accountDir(data.path(), kServer, userId) / "session.gen";
  }
};

// Every byte in the data folder, for the scan that a token never lands in a
// file.
std::string allFiles(const std::filesystem::path& dir) {
  std::string out;
  for (const auto& entry : std::filesystem::recursive_directory_iterator(dir)) {
    if (entry.is_regular_file()) {
      std::ifstream in(entry.path(), std::ios::binary);
      std::ostringstream s;
      s << in.rdbuf();
      out += s.str();
    }
  }
  return out;
}

#ifndef _WIN32
// The browser's half of the redirect: one GET to the loopback listener.
std::string browserCallback(uint16_t port, const std::string& target) {
  const int s = ::socket(AF_INET, SOCK_STREAM, 0);
  sockaddr_in addr{};
  addr.sin_family = AF_INET;
  addr.sin_port = htons(port);
  addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  if (::connect(s, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) != 0) {
    ::close(s);
    return {};
  }
  const std::string request = "GET " + target + " HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n";
  ::send(s, request.data(), request.size(), 0);
  std::string response;
  char buf[1024];
  ssize_t n;
  while ((n = ::recv(s, buf, sizeof(buf), 0)) > 0) {
    response.append(buf, static_cast<size_t>(n));
  }
  ::close(s);
  return response;
}

std::string queryValue(const std::string& url, const std::string& key) {
  const auto at = url.find("&" + key + "=");
  if (at == std::string::npos) {
    return {};
  }
  const auto start = at + key.size() + 2;
  const auto end = url.find('&', start);
  return urlDecode(url.substr(start, end == std::string::npos ? std::string::npos : end - start));
}
#endif

// TC1: sign in from one app through the browser flow. The other app shows the
// account within 5 seconds without a browser and uses the same session.
void tc1SignInAndTheSecondApp(TestContext& t) {
#ifndef _WIN32
  Computer pc;
  pc.server.addCode("browser-code", "u1", "Ada Lovelace");
  SignInFlow flow(pc.keychain, pc.server, pc.options());
  const auto url = flow.begin("node-editor", "Studio Mac");
  CHECK(url.has_value());
  if (!url) {
    return;
  }
  const std::string state = queryValue(*url, "state");
  const std::string redirect = queryValue(*url, "redirect_uri");
  CHECK(!state.empty());
  CHECK(redirect.starts_with("http://127.0.0.1:"));
  const uint16_t port = static_cast<uint16_t>(std::stoi(redirect.substr(17, redirect.find('/', 17) - 17)));

  std::thread browser([&] {
    // A stray request and another tab's callback do not end the wait.
    browserCallback(port, "/favicon.ico");
    browserCallback(port, "/callback?code=stolen&state=other");
    const std::string page = browserCallback(port, "/callback?code=browser-code&state=" + urlEncode(state));
    CHECK(page.find("200 OK") != std::string::npos);
  });
  const SignInResult result = flow.finish(std::chrono::seconds(10));
  browser.join();
  CHECK(result.status == SignInStatus::SignedIn);
  CHECK(result.userId == "u1");
  CHECK(result.displayName == "Ada Lovelace");
  // The exchange proved the verifier behind the challenge in the URL.
  const CodeExchange exchange = pc.server.lastExchange();
  CHECK(pkceChallenge(exchange.codeVerifier) == queryValue(*url, "code_challenge"));
  CHECK(exchange.redirectUri == redirect);
  CHECK(exchange.resource == kServer);

  // App A holds the session.
  AccountSession appA(pc.keychain, pc.server, pc.options());
  const Credential a = appA.credentialForRequest();
  CHECK(a.status == CredentialStatus::Ready);
  CHECK(pc.server.request(a.accessToken));

  // App B finds the account in the index and uses the same session, with no
  // browser and no token call.
  const auto start = std::chrono::steady_clock::now();
  const auto accounts = AccountsIndex(pc.data.path()).list();
  CHECK(accounts.size() == 1);
  CHECK(accounts.front().displayName == "Ada Lovelace");
  AccountSession appB(pc.keychain, pc.server, pc.options(accounts.front().userId));
  const Credential b = appB.credentialForRequest();
  CHECK(std::chrono::steady_clock::now() - start < std::chrono::seconds(5));
  CHECK(b.status == CredentialStatus::Ready);
  CHECK(b.accessToken == a.accessToken);
  CHECK(pc.server.refreshCalls == 0);
  CHECK(appB.status().displayName == "Ada Lovelace");

  // SR1: no token lands in a file of the data folder.
  const std::string files = allFiles(pc.data.path());
  const SessionRecord record = pc.record();
  CHECK(files.find(record.refreshToken) == std::string::npos);
  CHECK(files.find(record.accessToken) == std::string::npos);
  CHECK(files.find(record.revocationHandle) == std::string::npos);
#else
  (void)t;
#endif
}

void signInDeniedAndTimedOut(TestContext& t) {
#ifndef _WIN32
  Computer pc;
  SignInFlow flow(pc.keychain, pc.server, pc.options());
  const auto url = flow.begin("timeline", "");
  CHECK(url.has_value() && url->find("device_name=This%20computer") != std::string::npos);
  const std::string redirect = queryValue(*url, "redirect_uri");
  const uint16_t port = static_cast<uint16_t>(std::stoi(redirect.substr(17, redirect.find('/', 17) - 17)));
  std::thread browser([&] {
    browserCallback(port, "/callback?error=access_denied&error_description=Desktop%20sign-in%20is%20off&state=" +
                              urlEncode(queryValue(*url, "state")));
  });
  const SignInResult denied = flow.finish(std::chrono::seconds(10));
  browser.join();
  CHECK(denied.status == SignInStatus::Denied);
  CHECK(denied.message == "Desktop sign-in is off");
  CHECK(!pc.record().userId.size());

  SignInFlow late(pc.keychain, pc.server, pc.options());
  CHECK(late.begin("timeline", "x").has_value());
  CHECK(late.finish(std::chrono::milliseconds(100)).status == SignInStatus::TimedOut);
#else
  (void)t;
#endif
}

// TC4: both apps hold an access token that expires at the same second and
// both refresh. One call reaches the token endpoint, both hold the same new
// token, each completes a request with it, and the grant stays active.
void tc4ConcurrentRefresh(TestContext& t) {
  Computer pc;
  pc.signIn();
  AccountSession appA(pc.keychain, pc.server, pc.options());
  AccountSession appB(pc.keychain, pc.server, pc.options());
  const std::string first = appA.credentialForRequest().accessToken;
  CHECK(appB.credentialForRequest().accessToken == first);
  pc.clock.advance(15 * 60 * 1000);

  Credential a;
  Credential b;
  std::latch go(2);
  std::thread ta([&] {
    go.arrive_and_wait();
    a = appA.credentialForRequest();
  });
  std::thread tb([&] {
    go.arrive_and_wait();
    b = appB.credentialForRequest();
  });
  ta.join();
  tb.join();
  CHECK(pc.server.refreshCalls == 1);
  CHECK(a.status == CredentialStatus::Ready);
  CHECK(b.status == CredentialStatus::Ready);
  CHECK(a.accessToken == b.accessToken);
  CHECK(a.accessToken != first);
  CHECK(pc.server.request(a.accessToken));
  CHECK(pc.server.request(b.accessToken));
  CHECK(pc.server.grantActive(1));
  CHECK(pc.record().accessToken == a.accessToken);
}

// TC7: sign out offline, then go online. The local steps complete at once,
// the session is shown as ended only after the 200, and a kill between the
// generation file write and the record write is completed at the next start.
void tc7SignOutOfflineAndKilled(TestContext& t) {
  {
    Computer pc;
    const TokenSet tokens = pc.signIn();
    AccountSession app(pc.keychain, pc.server, pc.options());
    CHECK(app.credentialForRequest().status == CredentialStatus::Ready);
    pc.server.offline = true;
    CHECK(app.signOut() == ServerEnd::Pending);
    CHECK(app.credentialForRequest().status == CredentialStatus::SignedOut);
    const SessionRecord record = pc.record();
    CHECK(record.state == SessionState::SignedOut);
    CHECK(record.refreshToken.empty() && record.accessToken.empty());
    CHECK(record.handlePending && record.revocationHandle == tokens.revocationHandle);
    CHECK(app.status().state == SessionState::SignedOut);
    CHECK(app.status().serverEndPending);
    CHECK(pc.server.grantActive(1));
    // Online again: the retry ends the session, and only now is it shown as
    // ended.
    pc.server.offline = false;
    CHECK(app.endPendingSessions() == ServerEnd::Ended);
    CHECK(!pc.server.grantActive(1));
    CHECK(!app.status().serverEndPending);
    CHECK(pc.record().pendingHandles().empty());
  }
  {
    Computer pc;
    pc.signIn();
    auto killed = pc.options();
    killed.fault = [](FaultPoint p) {
      if (p == FaultPoint::AfterGenerationWrite) {
        throw SimulatedKill{};
      }
    };
    {
      AccountSession app(pc.keychain, pc.server, killed);
      CHECK(app.credentialForRequest().status == CredentialStatus::Ready);
      bool threw = false;
      try {
        app.signOut();
      } catch (const SimulatedKill&) {
        threw = true;
      }
      CHECK(threw);
      // The record still says signed in: the kill came first.
      CHECK(pc.record().state == SessionState::SignedIn);
    }
    // The next start: the repair rule completes the sign-out.
    AccountSession restarted(pc.keychain, pc.server, pc.options());
    CHECK(restarted.credentialForRequest().status == CredentialStatus::SignedOut);
    const SessionRecord record = pc.record();
    CHECK(record.state == SessionState::SignedOut);
    CHECK(record.refreshToken.empty());
    CHECK(record.handlePending);
    CHECK(pc.server.refreshCalls == 0);
    CHECK(restarted.endPendingSessions() == ServerEnd::Ended);
    CHECK(!pc.server.grantActive(1));
  }
  {
    // The same kill, and the next start only retries the server end, as
    // the account helper of the desktop app does. It makes no request.
    Computer pc;
    pc.signIn();
    auto killed = pc.options();
    killed.fault = [](FaultPoint p) {
      if (p == FaultPoint::AfterGenerationWrite) {
        throw SimulatedKill{};
      }
    };
    {
      AccountSession app(pc.keychain, pc.server, killed);
      try {
        app.signOut();
      } catch (const SimulatedKill&) {
      }
    }
    AccountSession restarted(pc.keychain, pc.server, pc.options());
    CHECK(restarted.status().serverEndPending);
    CHECK(restarted.endPendingSessions() == ServerEnd::Ended);
    CHECK(!pc.server.grantActive(1));
    const SessionRecord record = pc.record();
    CHECK(record.state == SessionState::SignedOut);
    CHECK(record.refreshToken.empty());
    CHECK(!restarted.status().serverEndPending);
  }
}

// TC16: app A signs out while app B has a refresh in flight. The token
// endpoint's response is held until A's local steps are done. B discards
// the response, the record is signed out and holds no token, and the
// session ends through the handle.
void tc16SignOutDuringRefresh(TestContext& t) {
  Computer pc;
  pc.signIn();
  AccountSession appB(pc.keychain, pc.server, pc.options());
  CHECK(appB.credentialForRequest().status == CredentialStatus::Ready);
  pc.clock.advance(15 * 60 * 1000);

  std::mutex m;
  std::condition_variable cv;
  bool inFlight = false;
  bool release = false;
  pc.server.beforeRefreshReturns = [&] {
    std::unique_lock lock(m);
    inFlight = true;
    cv.notify_all();
    cv.wait(lock, [&] { return release; });
  };
  Credential b;
  std::thread tb([&] { b = appB.credentialForRequest(); });
  {
    std::unique_lock lock(m);
    cv.wait(lock, [&] { return inFlight; });
  }
  // B holds account.lock while its call is out. A waits a short time for
  // it, then signs out without it.
  auto optionsA = pc.options();
  optionsA.lockTimeout = std::chrono::milliseconds(100);
  AccountSession appA(pc.keychain, pc.server, optionsA);
  pc.server.offline = true;
  CHECK(appA.signOut() == ServerEnd::Pending);
  pc.server.offline = false;
  {
    std::lock_guard lock(m);
    release = true;
  }
  cv.notify_all();
  tb.join();
  pc.server.beforeRefreshReturns = nullptr;

  CHECK(pc.server.refreshCalls == 1);
  CHECK(b.status == CredentialStatus::SignedOut);
  const SessionRecord record = pc.record();
  CHECK(record.state == SessionState::SignedOut);
  CHECK(record.refreshToken.empty() && record.accessToken.empty());
  CHECK(appB.credentialForRequest().status == CredentialStatus::SignedOut);
  CHECK(appA.endPendingSessions() == ServerEnd::Ended);
  CHECK(!pc.server.grantActive(1));
}

// TC17: app B sends requests in a loop and holds an open socket. App A signs
// out. No request B started after the generation write carries the
// credential, and B's socket closes within 1 second.
void tc17SignOutDuringTraffic(TestContext& t) {
  Computer pc;
  pc.signIn();
  std::atomic<bool> generationWritten{false};
  std::atomic<int64_t> signedOutAtNs{0};
  std::atomic<int64_t> writtenAtNs{0};
  auto steadyNs = [] {
    return std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::steady_clock::now().time_since_epoch())
        .count();
  };

  auto optionsB = pc.options();
  // B's watcher can see the new generation before A's fault hook records
  // the time of the write, so the interval is taken after both happened.
  optionsB.onSignedOut = [&] { signedOutAtNs = steadyNs(); };
  AccountSession appB(pc.keychain, pc.server, optionsB);
  CHECK(appB.credentialForRequest().status == CredentialStatus::Ready);

  std::atomic<bool> stop{false};
  std::atomic<int> sentAfterWrite{0};
  std::atomic<int> refusedAfterWrite{0};
  std::atomic<int> sentBefore{0};
  std::thread traffic([&] {
    while (!stop) {
      const bool startedAfter = generationWritten.load();
      const Credential c = appB.credentialForRequest();
      if (c.status == CredentialStatus::Ready) {
        (startedAfter ? sentAfterWrite : sentBefore)++;
      } else if (startedAfter) {
        refusedAfterWrite++;
      }
      std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }
  });
  // B's file watcher. The real app uses the platform's file watch; a poll
  // stands in for it.
  std::thread watcher([&] {
    while (!stop) {
      appB.checkGenerationFile();
      std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
  });
  std::this_thread::sleep_for(std::chrono::milliseconds(200));

  auto optionsA = pc.options();
  optionsA.fault = [&](FaultPoint p) {
    if (p == FaultPoint::AfterGenerationWrite) {
      writtenAtNs = steadyNs();
      generationWritten = true;
    }
  };
  AccountSession appA(pc.keychain, pc.server, optionsA);
  appA.signOut();
  std::this_thread::sleep_for(std::chrono::milliseconds(1100));
  stop = true;
  traffic.join();
  watcher.join();

  CHECK(sentBefore > 0);
  CHECK(sentAfterWrite == 0);
  CHECK(refusedAfterWrite > 0);
  CHECK(signedOutAtNs != 0);
  const int64_t socketClosedAfterMs = std::max<int64_t>(0, signedOutAtNs - writtenAtNs) / 1'000'000;
  CHECK(socketClosedAfterMs < 1000);
}

// TC18: kill app A between the generation file write and the record write,
// once during a sign-out and once during a refresh. Then app B makes a
// request.
void tc18KillBetweenWrites(TestContext& t) {
  auto killAfterGeneration = [](FaultPoint p) {
    if (p == FaultPoint::AfterGenerationWrite) {
      throw SimulatedKill{};
    }
  };
  {
    // Sign-out: B completes the sign-out and sends nothing.
    Computer pc;
    pc.signIn();
    AccountSession appB(pc.keychain, pc.server, pc.options());
    CHECK(appB.credentialForRequest().status == CredentialStatus::Ready);
    auto optionsA = pc.options();
    optionsA.fault = killAfterGeneration;
    {
      AccountSession appA(pc.keychain, pc.server, optionsA);
      try {
        appA.signOut();
      } catch (const SimulatedKill&) {
      }
    }
    CHECK(appB.credentialForRequest().status == CredentialStatus::SignedOut);
    CHECK(pc.server.refreshCalls == 0);
    CHECK(pc.record().state == SessionState::SignedOut);
    CHECK(pc.record().handlePending);
    CHECK(pc.server.endCalls == 0);
  }
  {
    // Refresh: B sets the file to the record's generation, and the session
    // continues through the lost-rotation rule.
    Computer pc;
    pc.signIn();
    AccountSession appB(pc.keychain, pc.server, pc.options());
    CHECK(appB.credentialForRequest().status == CredentialStatus::Ready);
    pc.clock.advance(15 * 60 * 1000);
    const uint64_t recordGeneration = pc.record().generation;
    auto optionsA = pc.options();
    optionsA.fault = killAfterGeneration;
    {
      AccountSession appA(pc.keychain, pc.server, optionsA);
      try {
        appA.credentialForRequest();
      } catch (const SimulatedKill&) {
      }
    }
    CHECK(readGenerationFile(pc.genPath()).generation == recordGeneration + 1);
    pc.clock.advance(5000);
    const Credential b = appB.credentialForRequest();
    CHECK(b.status == CredentialStatus::Ready);
    CHECK(pc.server.request(b.accessToken));
    CHECK(pc.server.lostRotationsAccepted == 1);
    CHECK(pc.server.grantActive(1));
    CHECK(pc.server.refreshCalls == 2);
    const SessionRecord record = pc.record();
    CHECK(record.state == SessionState::SignedIn);
    CHECK(record.accessToken == b.accessToken);
    CHECK(readGenerationFile(pc.genPath()).generation == record.generation);
  }
}

// A kill after a sign-in wrote the record and before it wrote the
// generation file: the repair rule adopts the new session.
void signInKilledBeforeGenerationWrite(TestContext& t) {
  Computer pc;
  pc.server.addCode("c", "u1", "Ada");
  const TokenResult r = pc.server.exchangeCode({"c", "v", "r", kServer});
  auto options = pc.options();
  options.fault = [](FaultPoint p) {
    if (p == FaultPoint::AfterRecordWrite) {
      throw SimulatedKill{};
    }
  };
  try {
    recordSignIn(pc.keychain, options, r.tokens);
  } catch (const SimulatedKill&) {
  }
  CHECK(readGenerationFile(pc.genPath()).state == SessionState::SignedOut);
  AccountSession app(pc.keychain, pc.server, pc.options());
  const Credential c = app.credentialForRequest();
  CHECK(c.status == CredentialStatus::Ready);
  CHECK(c.accessToken == r.tokens.accessToken);
  CHECK(readGenerationFile(pc.genPath()).state == SessionState::SignedIn);
}

// The server refused the refresh: both apps show signed out, and the other
// app hears it through its callback.
void refusedRefreshSignsBothAppsOut(TestContext& t) {
  Computer pc;
  pc.signIn();
  std::atomic<int> bSignedOut{0};
  auto optionsB = pc.options();
  optionsB.onSignedOut = [&] { bSignedOut++; };
  AccountSession appA(pc.keychain, pc.server, pc.options());
  AccountSession appB(pc.keychain, pc.server, optionsB);
  CHECK(appA.credentialForRequest().status == CredentialStatus::Ready);
  CHECK(appB.credentialForRequest().status == CredentialStatus::Ready);
  // The session was ended from Settings in the web app.
  pc.server.endSession(pc.record().revocationHandle);
  pc.clock.advance(15 * 60 * 1000);
  CHECK(appA.credentialForRequest().status == CredentialStatus::SignedOut);
  CHECK(appB.checkGenerationFile());
  CHECK(bSignedOut == 1);
  CHECK(appB.credentialForRequest().status == CredentialStatus::SignedOut);
  CHECK(pc.record().state == SessionState::SignedOut);
}

// An unreachable server leaves the session as it was, and the next request
// tries again.
void offlineRefreshKeepsTheSession(TestContext& t) {
  Computer pc;
  pc.signIn();
  AccountSession app(pc.keychain, pc.server, pc.options());
  pc.clock.advance(15 * 60 * 1000);
  pc.server.offline = true;
  CHECK(app.credentialForRequest().status == CredentialStatus::Offline);
  CHECK(pc.record().state == SessionState::SignedIn);
  pc.server.offline = false;
  CHECK(app.credentialForRequest().status == CredentialStatus::Ready);
}

// A session the policy no longer allows gets no credential and renews
// nothing, and the record stays as it was. Signing out still works.
void policyGateHoldsTheCredential(TestContext& t) {
  Computer pc;
  pc.signIn();
  std::atomic<bool> allowed{false};
  AccountSessionOptions options = pc.options();
  options.credentialAllowed = [&] { return allowed.load(); };
  AccountSession app(pc.keychain, pc.server, options);
  pc.clock.advance(15 * 60 * 1000);
  CHECK(app.credentialForRequest().status == CredentialStatus::SignedOut);
  CHECK(app.authorizeRequest().status == CredentialStatus::SignedOut);
  CHECK(app.refresh() == RefreshOutcome::SignedOut);
  CHECK(pc.server.refreshCalls == 0);
  CHECK(pc.record().state == SessionState::SignedIn);
  allowed = true;
  CHECK(app.credentialForRequest().status == CredentialStatus::Ready);
  CHECK(pc.server.refreshCalls == 1);
  allowed = false;
  app.signOut();
  CHECK(pc.record().state == SessionState::SignedOut);
}

// A refresh that cannot take the lock fails as offline.
void lockTimeoutFailsAsOffline(TestContext& t) {
  Computer pc;
  pc.signIn();
  auto options = pc.options();
  options.lockTimeout = std::chrono::milliseconds(50);
  AccountSession app(pc.keychain, pc.server, options);
  const auto held = AccountLock::acquire(app.lockPath(), std::chrono::milliseconds(100));
  CHECK(held.has_value());
  CHECK(app.credentialForRequest().status == CredentialStatus::Offline);
}

// Signing in again before the server heard an earlier sign-out keeps the
// earlier handle, so that session still ends.
void signInAgainKeepsThePendingHandle(TestContext& t) {
  Computer pc;
  const TokenSet first = pc.signIn();
  AccountSession app(pc.keychain, pc.server, pc.options());
  pc.server.offline = true;
  CHECK(app.signOut() == ServerEnd::Pending);
  pc.server.offline = false;
  const TokenSet second = pc.signIn();
  CHECK(app.credentialForRequest().accessToken == second.accessToken);
  const SessionRecord record = pc.record();
  CHECK((record.pendingHandles() == std::vector<std::string>{first.revocationHandle}));
  CHECK(app.endPendingSessions() == ServerEnd::Ended);
  CHECK(!pc.server.grantActive(1));
  CHECK(pc.server.grantActive(2));
  CHECK(pc.record().pendingHandles().empty());
  CHECK(pc.record().state == SessionState::SignedIn);
}

// A keychain whose writes can be refused, standing in for a locked or full
// store.
class RefusingStore final : public SecretStore {
public:
  explicit RefusingStore(SecretStore& inner) : inner_(inner) {}
  bool available() const override { return true; }
  std::optional<std::string> read(std::string_view service, std::string_view account) override {
    return inner_.read(service, account);
  }
  SecretReadResult readResult(std::string_view service, std::string_view account) override {
    return inner_.readResult(service, account);
  }
  bool write(std::string_view service, std::string_view account, std::string_view value) override {
    return !refuse && inner_.write(service, account, value);
  }
  void remove(std::string_view service, std::string_view account) override { inner_.remove(service, account); }
  std::atomic<bool> refuse{false};

private:
  SecretStore& inner_;
};

// Counts store reads and can deny them, standing in for a macOS Keychain
// prompt where the user clicked Deny.
class CountingDeniedStore final : public SecretStore {
public:
  explicit CountingDeniedStore(SecretStore& inner) : inner_(inner) {}
  bool available() const override { return true; }
  std::optional<std::string> read(std::string_view service, std::string_view account) override {
    const SecretReadResult r = readResult(service, account);
    return r.status == SecretReadStatus::Ok ? std::optional<std::string>(r.value) : std::nullopt;
  }
  SecretReadResult readResult(std::string_view service, std::string_view account) override {
    ++reads;
    if (denyReads.load()) {
      return {SecretReadStatus::AccessDenied, {}};
    }
    return inner_.readResult(service, account);
  }
  bool write(std::string_view service, std::string_view account, std::string_view value) override {
    return inner_.write(service, account, value);
  }
  void remove(std::string_view service, std::string_view account) override { inner_.remove(service, account); }
  std::atomic<int> reads{0};
  std::atomic<bool> denyReads{false};

private:
  SecretStore& inner_;
};

// App B's refresh passed its sign-out check and is about to publish. App A
// signs out without the lock B holds. B's later writes must not bring the
// credential back, in B, in A or in an app started afterwards.
void refreshPublishedAfterSignOutLoses(TestContext& t) {
  Computer pc;
  pc.signIn();
  std::mutex m;
  std::condition_variable cv;
  bool paused = false;
  bool release = false;
  auto optionsB = pc.options();
  optionsB.fault = [&](FaultPoint p) {
    if (p != FaultPoint::BeforeRefreshPublish) {
      return;
    }
    std::unique_lock lock(m);
    paused = true;
    cv.notify_all();
    cv.wait(lock, [&] { return release; });
  };
  AccountSession appB(pc.keychain, pc.server, optionsB);
  pc.clock.advance(15 * 60 * 1000);
  Credential b;
  std::thread tb([&] { b = appB.credentialForRequest(); });
  {
    std::unique_lock lock(m);
    cv.wait(lock, [&] { return paused; });
  }
  auto optionsA = pc.options();
  optionsA.lockTimeout = std::chrono::milliseconds(100);
  AccountSession appA(pc.keychain, pc.server, optionsA);
  appA.signOut();
  {
    std::lock_guard lock(m);
    release = true;
  }
  cv.notify_all();
  tb.join();

  CHECK(b.status != CredentialStatus::Ready);
  CHECK(appB.credentialForRequest().status == CredentialStatus::SignedOut);
  CHECK(appA.credentialForRequest().status == CredentialStatus::SignedOut);
  AccountSession appC(pc.keychain, pc.server, pc.options());
  CHECK(appC.credentialForRequest().status == CredentialStatus::SignedOut);
  CHECK(appC.status().state == SessionState::SignedOut);
  CHECK(pc.record().state == SessionState::SignedOut);
  CHECK(pc.record().refreshToken.empty());
}

// The keychain refuses the sign-out's record write. The sign-out says so,
// no app uses the credential, and the session still ends on the server.
void signOutThatCannotBeSavedSaysSo(TestContext& t) {
  Computer pc;
  pc.signIn();
  RefusingStore store(pc.keychain);
  AccountSession app(store, pc.server, pc.options());
  CHECK(app.credentialForRequest().status == CredentialStatus::Ready);
  store.refuse = true;
  CHECK(app.signOut() == ServerEnd::NotSaved);
  CHECK(app.credentialForRequest().status == CredentialStatus::SignedOut);
  // The keychain still holds the signed-in record.
  CHECK(pc.record().state == SessionState::SignedIn);
  AccountSession other(pc.keychain, pc.server, pc.options());
  CHECK(other.credentialForRequest().status == CredentialStatus::SignedOut);
  CHECK(other.status().state == SessionState::SignedOut);
  CHECK(!pc.server.grantActive(1));
}

// A refresh whose record write is refused is not reported as done, and the
// next request after the keychain recovers still gets a credential.
void refreshThatCannotBeSavedIsNotReady(TestContext& t) {
  Computer pc;
  pc.signIn();
  RefusingStore store(pc.keychain);
  AccountSession app(store, pc.server, pc.options());
  pc.clock.advance(15 * 60 * 1000);
  store.refuse = true;
  CHECK(app.refresh() == RefreshOutcome::Offline);
  CHECK(app.credentialForRequest().status != CredentialStatus::Ready);
  store.refuse = false;
  CHECK(app.credentialForRequest().status == CredentialStatus::Ready);
}

// A request authorized before a sign-out is cancelled when this app hears
// of it, and no request is authorized after it.
void signOutCancelsAuthorizedRequests(TestContext& t) {
  Computer pc;
  pc.signIn();
  AccountSession appA(pc.keychain, pc.server, pc.options());
  AccountSession appB(pc.keychain, pc.server, pc.options());
  const Authorization started = appB.authorizeRequest();
  CHECK(started.status == CredentialStatus::Ready);
  CHECK(started.cancel != nullptr);
  CHECK(!started.cancel->cancelled());
  appA.signOut();
  CHECK(appB.checkGenerationFile());
  CHECK(started.cancel->cancelled());
  const Authorization later = appB.authorizeRequest();
  CHECK(later.status == CredentialStatus::SignedOut);
  CHECK(later.cancel == nullptr);
}

// `accounts.json` cannot be written. The account is still listed, from its
// entry file.
void accountListedWhenTheIndexCannotBeWritten(TestContext& t) {
  Computer pc;
  std::filesystem::create_directories(pc.data.path() / "accounts.json");
  pc.signIn();
  const auto listed = AccountsIndex(pc.data.path()).list();
  CHECK(listed.size() == 1);
  CHECK(!listed.empty() && listed[0].userId == "u1" && listed[0].serverOrigin == kServer);
  AccountSession app(pc.keychain, pc.server, pc.options());
  CHECK(app.credentialForRequest().status == CredentialStatus::Ready);
}

void retryDelays(TestContext& t) {
  CHECK(endSessionRetryDelay(0) == std::chrono::seconds(5));
  CHECK(endSessionRetryDelay(1) == std::chrono::seconds(10));
  CHECK(endSessionRetryDelay(7) == std::chrono::seconds(640));
  CHECK(endSessionRetryDelay(8) == std::chrono::seconds(900));
  CHECK(endSessionRetryDelay(100) == std::chrono::seconds(900));
}

// status() caches against session.gen and signout.gen so repeated polls read
// the keychain once per generation, and a clean sign-out removes the empty
// keychain item.
void statusCachesAndCleansKeychainOnSignOut(TestContext& t) {
  Computer pc;
  pc.signIn();
  CountingDeniedStore store(pc.keychain);
  AccountSession app(store, pc.server, pc.options());
  for (int i = 0; i < 5; ++i) {
    const auto s = app.status();
    CHECK(s.state == SessionState::SignedIn);
    CHECK(!s.storeAccessDenied);
  }
  CHECK(store.reads.load() == 1);

  // Another app rotates the token and bumps session.gen: one new read.
  AccountSession other(pc.keychain, pc.server, pc.options());
  pc.clock.advance(15 * 60 * 1000);
  CHECK(other.credentialForRequest().status == CredentialStatus::Ready);
  CHECK(app.status().state == SessionState::SignedIn);
  CHECK(app.status().state == SessionState::SignedIn);
  CHECK(store.reads.load() == 2);

  // A clean sign-out removes the empty keychain item so signed-out startups do
  // not hit an existing item ACL.
  CHECK(other.signOut() == ServerEnd::Ended);
  CHECK(!pc.keychain.read(kKeychainService, keychainAccount(kServer, "u1")).has_value());
  CHECK(app.status().state == SessionState::SignedOut);
  CHECK(!app.status().serverEndPending);
  const int afterSignOut = store.reads.load();
  CHECK(app.status().state == SessionState::SignedOut);
  CHECK(store.reads.load() == afterSignOut);
}

// A denied keychain read is cached without re-prompting, never overwrites
// session.gen to SignedOut, and recovers once access is allowed and the cache
// is cleared.
void deniedReadPreservesSessionAndCachesDenial(TestContext& t) {
  Computer pc;
  pc.signIn();
  AccountSession appA(pc.keychain, pc.server, pc.options());
  CHECK(appA.credentialForRequest().status == CredentialStatus::Ready);

  CountingDeniedStore deniedStore(pc.keychain);
  deniedStore.denyReads = true;
  AccountSession appB(deniedStore, pc.server, pc.options());
  for (int i = 0; i < 5; ++i) {
    const auto s = appB.status();
    CHECK(s.state == SessionState::SignedOut);
    CHECK(s.storeAccessDenied);
  }
  CHECK(deniedStore.reads.load() == 1);

  // refresh() returns Offline and leaves session.gen SignedIn so appA stays
  // signed in.
  CHECK(appB.refresh() == RefreshOutcome::Offline);
  CHECK(readGenerationFile(pc.genPath()).state == SessionState::SignedIn);
  CHECK(appA.credentialForRequest().status == CredentialStatus::Ready);

  deniedStore.denyReads = false;
  appB.invalidateStatusCache();
  const auto recovered = appB.status();
  CHECK(recovered.state == SessionState::SignedIn);
  CHECK(!recovered.storeAccessDenied);
}

} // namespace

int main() {
  return account_test::runTests({
      {"tc1SignInAndTheSecondApp", tc1SignInAndTheSecondApp},
      {"signInDeniedAndTimedOut", signInDeniedAndTimedOut},
      {"tc4ConcurrentRefresh", tc4ConcurrentRefresh},
      {"tc7SignOutOfflineAndKilled", tc7SignOutOfflineAndKilled},
      {"tc16SignOutDuringRefresh", tc16SignOutDuringRefresh},
      {"tc17SignOutDuringTraffic", tc17SignOutDuringTraffic},
      {"tc18KillBetweenWrites", tc18KillBetweenWrites},
      {"signInKilledBeforeGenerationWrite", signInKilledBeforeGenerationWrite},
      {"refusedRefreshSignsBothAppsOut", refusedRefreshSignsBothAppsOut},
      {"offlineRefreshKeepsTheSession", offlineRefreshKeepsTheSession},
      {"policyGateHoldsTheCredential", policyGateHoldsTheCredential},
      {"lockTimeoutFailsAsOffline", lockTimeoutFailsAsOffline},
      {"signInAgainKeepsThePendingHandle", signInAgainKeepsThePendingHandle},
      {"refreshPublishedAfterSignOutLoses", refreshPublishedAfterSignOutLoses},
      {"signOutThatCannotBeSavedSaysSo", signOutThatCannotBeSavedSaysSo},
      {"refreshThatCannotBeSavedIsNotReady", refreshThatCannotBeSavedIsNotReady},
      {"signOutCancelsAuthorizedRequests", signOutCancelsAuthorizedRequests},
      {"accountListedWhenTheIndexCannotBeWritten", accountListedWhenTheIndexCannotBeWritten},
      {"retryDelays", retryDelays},
      {"statusCachesAndCleansKeychainOnSignOut", statusCachesAndCleansKeychainOnSignOut},
      {"deniedReadPreservesSessionAndCachesDenial", deniedReadPreservesSessionAndCachesDenial},
  });
}
