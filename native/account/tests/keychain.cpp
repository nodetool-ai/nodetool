// KeychainStore against the platform credential store. Every test uses its
// own random account name and removes its item.
#include "nodetool/account/crypto.h"
#include "nodetool/account/keychain_store.h"
#include "nodetool/account/session_record.h"

#include "test_support.h"

#include <cstdio>
#include <string>

using namespace nodetool::account;
using account_test::TestContext;

namespace {

constexpr std::string_view kService = "ai.nodetool.native.test";

std::string hexId() {
  const Sha256Digest digest = sha256(randomToken());
  return hexEncode(digest.data(), 16);
}

std::string freshAccount() { return "test#" + randomToken(); }

bool storeAnswers() {
  KeychainStore store;
  return store.available();
}

void roundTrip(TestContext& t) {
  KeychainStore store;
  const std::string account = freshAccount();
  CHECK(!store.read(kService, account).has_value());
  CHECK(store.write(kService, account, "first"));
  CHECK(store.read(kService, account) == std::optional<std::string>("first"));
  CHECK(store.write(kService, account, "second"));
  CHECK(store.read(kService, account) == std::optional<std::string>("second"));
  store.remove(kService, account);
  CHECK(!store.read(kService, account).has_value());
  store.remove(kService, account);
}

void itemsAreSeparate(TestContext& t) {
  KeychainStore store;
  const std::string a = freshAccount();
  const std::string b = freshAccount();
  CHECK(store.write(kService, a, "a"));
  CHECK(store.write(kService, b, "b"));
  CHECK(store.read(kService, a) == std::optional<std::string>("a"));
  CHECK(store.read(kService, b) == std::optional<std::string>("b"));
  CHECK(!store.read("ai.nodetool.native.other", a).has_value());
  store.remove(kService, a);
  CHECK(store.read(kService, b) == std::optional<std::string>("b"));
  store.remove(kService, b);
}

void refusesOversizedValue(TestContext& t) {
  KeychainStore store;
  const std::string account = freshAccount();
  CHECK(store.write(kService, account, std::string(kMaxSecretBytes, 'x')));
  CHECK(!store.write(kService, account, std::string(kMaxSecretBytes + 1, 'y')));
  CHECK(store.read(kService, account) == std::optional<std::string>(std::string(kMaxSecretBytes, 'x')));
  store.remove(kService, account);
}

// A record with real-length tokens and several pending handles fits.
void sessionRecordFits(TestContext& t) {
  KeychainStore store;
  const std::string account = freshAccount();
  SessionRecord record;
  record.state = SessionState::SignedIn;
  record.generation = 42;
  record.refreshToken = "ntr_" + randomToken();
  record.accessToken = "ntd_" + randomToken();
  record.accessExpiresAtMs = 1'800'000'000'000;
  record.revocationHandle = "nth_" + randomToken();
  record.earlierPendingHandles = {"nth_" + randomToken(), "nth_" + randomToken(), "nth_" + randomToken()};
  record.sessionId = hexId();
  record.userId = hexId();
  record.displayName = std::string(200, 'n');
  CHECK(writeSessionRecord(store, account, record));
  const auto back = readSessionRecord(store, account);
  CHECK(back.has_value());
  if (back) {
    CHECK(back->refreshToken == record.refreshToken);
    CHECK(back->earlierPendingHandles == record.earlierPendingHandles);
  }
  store.remove(kKeychainService, account);
}

} // namespace

int main() {
  if (!keychainCompiledIn() || !storeAnswers()) {
    std::fprintf(stderr, "SKIP no platform credential store answers on this machine\n");
    return 0;
  }
  return account_test::runTests({
      {"roundTrip", roundTrip},
      {"itemsAreSeparate", itemsAreSeparate},
      {"refusesOversizedValue", refusesOversizedValue},
      {"sessionRecordFits", sessionRecordFits},
  });
}
