// A minimal test runner, a temporary folder, and the fake token server the
// session tests run against.
#pragma once

#include "nodetool/account/token_endpoint.h"

#include <atomic>
#include <cstdio>
#include <filesystem>
#include <functional>
#include <map>
#include <mutex>
#include <random>
#include <string>
#include <utility>
#include <vector>

namespace account_test {

struct TestContext {
  int failures = 0;
  void check(bool ok, const char* file, int line, const char* expression) {
    if (!ok) {
      ++failures;
      std::fprintf(stderr, "%s:%d: CHECK failed: %s\n", file, line, expression);
    }
  }
};

#define CHECK(cond) t.check(static_cast<bool>(cond), __FILE__, __LINE__, #cond)

using TestFn = void (*)(TestContext&);

inline int runTests(const std::vector<std::pair<const char*, TestFn>>& tests) {
  int failed = 0;
  for (const auto& [name, fn] : tests) {
    TestContext t;
    fn(t);
    std::fprintf(stderr, "%s %s\n", t.failures == 0 ? "PASS" : "FAIL", name);
    if (t.failures != 0) {
      ++failed;
    }
  }
  std::fprintf(stderr, "%zu tests, %d failed\n", tests.size(), failed);
  return failed == 0 ? 0 : 1;
}

// A fresh folder under the system temporary folder, removed on destruction.
//
// Thread affinity: one thread creates and destroys it.
class TempDir {
public:
  TempDir() {
    std::random_device device;
    path_ = std::filesystem::temp_directory_path() /
            ("nodetool-account-test-" + std::to_string(device()) + std::to_string(device()));
    std::filesystem::create_directories(path_);
  }
  ~TempDir() {
    std::error_code ec;
    std::filesystem::remove_all(path_, ec);
  }
  TempDir(const TempDir&) = delete;
  TempDir& operator=(const TempDir&) = delete;
  const std::filesystem::path& path() const { return path_; }

private:
  std::filesystem::path path_;
};

// A test clock both apps read.
//
// Thread affinity: thread-safe, an atomic.
class FakeClock {
public:
  int64_t now() const { return ms_.load(); }
  void advance(int64_t ms) { ms_ += ms; }
  std::function<int64_t()> fn() {
    return [this] { return now(); };
  }

private:
  std::atomic<int64_t> ms_{1'800'000'000'000};
};

// The server side of native sign-in, as packages/websocket implements it:
// rotating refresh tokens with the 60-second lost-rotation rule, grants ended
// by their revocation handle, and access tokens checked against their grant.
//
// Thread affinity: thread-safe. `mutex_` guards every map. Hooks run with no
// lock held.
class FakeTokenServer final : public nodetool::account::TokenEndpoint {
public:
  explicit FakeTokenServer(FakeClock& clock) : clock_(clock) {}

  // Register an authorization code for `userId`.
  void addCode(const std::string& code, const std::string& userId, const std::string& displayName) {
    const std::lock_guard lock(mutex_);
    codes_[code] = {userId, displayName};
  }

  nodetool::account::TokenResult exchangeCode(const nodetool::account::CodeExchange& exchange) override {
    using namespace nodetool::account;
    if (offline) {
      return {TokenStatus::Offline, {}, "offline"};
    }
    const std::lock_guard lock(mutex_);
    lastExchange_ = exchange;
    const auto it = codes_.find(exchange.code);
    if (it == codes_.end()) {
      return {TokenStatus::InvalidGrant, {}, "invalid code"};
    }
    const auto [userId, displayName] = it->second;
    codes_.erase(it);
    const int grant = nextGrant_++;
    grants_[grant] = {userId, true, "nth_handle" + std::to_string(grant)};
    TokenResult result{TokenStatus::Ok, mintLocked(grant), {}};
    result.tokens.userId = userId;
    result.tokens.displayName = displayName;
    result.tokens.revocationHandle = grants_[grant].handle;
    return result;
  }

  nodetool::account::TokenResult refresh(std::string_view token) override {
    using namespace nodetool::account;
    ++refreshCalls;
    if (offline) {
      return {TokenStatus::Offline, {}, "offline"};
    }
    TokenResult result;
    {
      const std::lock_guard lock(mutex_);
      result = refreshLocked(std::string(token));
    }
    if (beforeRefreshReturns) {
      beforeRefreshReturns();
    }
    return result;
  }

  nodetool::account::EndSessionStatus endSession(std::string_view handle) override {
    using namespace nodetool::account;
    ++endCalls;
    if (offline) {
      return EndSessionStatus::Offline;
    }
    const std::lock_guard lock(mutex_);
    for (auto& [id, grant] : grants_) {
      if (grant.handle == handle) {
        grant.active = false;
        return EndSessionStatus::Ended;
      }
    }
    return EndSessionStatus::Unknown;
  }

  // An authenticated request with `accessToken`. Marks the token used.
  bool request(const std::string& accessToken) {
    const std::lock_guard lock(mutex_);
    const auto it = access_.find(accessToken);
    if (it == access_.end() || clock_.now() >= it->second.expiresAt || !grants_[it->second.grant].active) {
      return false;
    }
    it->second.used = true;
    return true;
  }

  bool grantActive(int grant) {
    const std::lock_guard lock(mutex_);
    return grants_.count(grant) != 0 && grants_[grant].active;
  }

  int grantCount() {
    const std::lock_guard lock(mutex_);
    return static_cast<int>(grants_.size());
  }

  nodetool::account::CodeExchange lastExchange() {
    const std::lock_guard lock(mutex_);
    return lastExchange_;
  }

  std::atomic<bool> offline{false};
  std::atomic<int> refreshCalls{0};
  std::atomic<int> endCalls{0};
  // Runs after a refresh was decided and before it returns, so a test can
  // hold the response.
  std::function<void()> beforeRefreshReturns;

private:
  struct Grant {
    std::string userId;
    bool active = true;
    std::string handle;
  };
  struct Refresh {
    int grant = 0;
    std::string successor;
    int64_t rotatedAt = 0;
  };
  struct Access {
    int grant = 0;
    int64_t expiresAt = 0;
    bool used = false;
  };

  nodetool::account::TokenSet mintLocked(int grant) {
    nodetool::account::TokenSet tokens;
    const int n = nextToken_++;
    tokens.accessToken = "ntd_access" + std::to_string(n);
    tokens.refreshToken = "ntr_refresh" + std::to_string(n);
    tokens.expiresInSeconds = 15 * 60;
    tokens.sessionId = "grant" + std::to_string(grant);
    access_[tokens.accessToken] = {grant, clock_.now() + tokens.expiresInSeconds * 1000, false};
    refresh_[tokens.refreshToken] = {grant, {}, 0};
    accessOf_[tokens.refreshToken] = tokens.accessToken;
    return tokens;
  }

  bool usedLocked(const std::string& refreshToken) {
    const auto r = refresh_.find(refreshToken);
    if (r == refresh_.end()) {
      return false;
    }
    if (!r->second.successor.empty()) {
      return true;
    }
    const auto a = access_.find(accessOf_[refreshToken]);
    return a != access_.end() && a->second.used;
  }

  nodetool::account::TokenResult refreshLocked(const std::string& token) {
    using namespace nodetool::account;
    const auto it = refresh_.find(token);
    if (it == refresh_.end() || !grants_[it->second.grant].active) {
      return {TokenStatus::InvalidGrant, {}, "invalid_grant"};
    }
    const int grant = it->second.grant;
    if (it->second.successor.empty()) {
      TokenSet next = mintLocked(grant);
      it->second.successor = next.refreshToken;
      it->second.rotatedAt = clock_.now();
      return {TokenStatus::Ok, next, {}};
    }
    // A rotated token. The lost-rotation rule: once more within 60 seconds,
    // when its successor was never used.
    const std::string successor = it->second.successor;
    if (!usedLocked(successor) && clock_.now() - it->second.rotatedAt <= 60'000) {
      access_.erase(accessOf_[successor]);
      refresh_.erase(successor);
      TokenSet next = mintLocked(grant);
      it->second.successor = next.refreshToken;
      it->second.rotatedAt = clock_.now();
      ++lostRotationsAccepted;
      return {TokenStatus::Ok, next, {}};
    }
    grants_[grant].active = false;
    return {TokenStatus::InvalidGrant, {}, "invalid_grant"};
  }

  FakeClock& clock_;
  std::mutex mutex_;
  std::map<std::string, std::pair<std::string, std::string>> codes_;
  std::map<int, Grant> grants_;
  std::map<std::string, Refresh> refresh_;
  std::map<std::string, Access> access_;
  std::map<std::string, std::string> accessOf_;
  nodetool::account::CodeExchange lastExchange_;
  int nextGrant_ = 1;
  int nextToken_ = 1;

public:
  std::atomic<int> lostRotationsAccepted{0};
};

} // namespace account_test
