// The pieces under the session: hashing and encoding, the generation file,
// the lock, the session record, the accounts index, and the sign-in URL,
// callback and loopback listener.
#include "nodetool/account/accounts_index.h"
#include "nodetool/account/crypto.h"
#include "nodetool/account/session_record.h"
#include "nodetool/account/sign_in.h"
#include "nodetool/account/storage.h"
#include "test_support.h"

#include <chrono>
#include <thread>

namespace {

using namespace nodetool::account;
using account_test::TempDir;
using account_test::TestContext;

std::string hexOf(const Sha256Digest& d) { return hexEncode(d.data(), d.size()); }

void sha256Vectors(TestContext& t) {
  CHECK(hexOf(sha256("")) == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  CHECK(hexOf(sha256("abc")) == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  CHECK(hexOf(sha256("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")) ==
        "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  // 55, 56 and 64 bytes: the padding boundaries.
  CHECK(hexOf(sha256(std::string(55, 'a'))) == "9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318");
  CHECK(hexOf(sha256(std::string(56, 'a'))) == "b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a");
  CHECK(hexOf(sha256(std::string(64, 'a'))) == "ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb");
  CHECK(hexOf(sha256(std::string(1000, 'a'))) == "41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3");
}

void pkceMatchesRfc7636(TestContext& t) {
  // RFC 7636 appendix B.
  CHECK(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk") ==
        "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  const Pkce a = makePkce();
  const Pkce b = makePkce();
  CHECK(a.verifier.size() == 43);
  CHECK(a.verifier != b.verifier);
  CHECK(a.challenge == pkceChallenge(a.verifier));
}

void base64UrlHasNoPadding(TestContext& t) {
  const std::string s = "ab?";
  const auto* d = reinterpret_cast<const uint8_t*>(s.data());
  CHECK(base64UrlEncode(d, 1) == "YQ");
  CHECK(base64UrlEncode(d, 2) == "YWI");
  CHECK(base64UrlEncode(d, 3) == "YWI_");
}

void generationFileRoundTrip(TestContext& t) {
  TempDir dir;
  const auto path = dir.path() / "session.gen";
  CHECK(readGenerationFile(path) == GenerationStamp{});
  CHECK(writeGenerationFile(path, {0x0102030405060708ull, SessionState::SignedIn}));
  CHECK(std::filesystem::file_size(path) == 16);
  CHECK((readGenerationFile(path) == GenerationStamp{0x0102030405060708ull, SessionState::SignedIn}));
  // A file of the wrong shape reads as signed out at generation 0.
  CHECK(writeFileAtomically(path, "not a generation"));
  CHECK(readGenerationFile(path) == GenerationStamp{});
  // No temporary file is left behind.
  int entries = 0;
  for ([[maybe_unused]] const auto& e : std::filesystem::directory_iterator(dir.path())) {
    ++entries;
  }
  CHECK(entries == 1);
}

void lockExcludesAndTimesOut(TestContext& t) {
  TempDir dir;
  const auto path = dir.path() / "account.lock";
  auto first = AccountLock::acquire(path, std::chrono::milliseconds(100));
  CHECK(first.has_value());
  const auto start = std::chrono::steady_clock::now();
  auto second = AccountLock::acquire(path, std::chrono::milliseconds(80));
  CHECK(!second.has_value());
  CHECK(std::chrono::steady_clock::now() - start >= std::chrono::milliseconds(80));
  // A waiter gets the lock once the holder releases it.
  std::thread releaser([&] {
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
    first.reset();
  });
  auto third = AccountLock::acquire(path, std::chrono::milliseconds(2000));
  releaser.join();
  CHECK(third.has_value());
}

void recordRoundTrip(TestContext& t) {
  SessionRecord r;
  r.state = SessionState::SignedIn;
  r.generation = 7;
  r.refreshToken = "ntr_x";
  r.accessToken = "ntd_y";
  r.accessExpiresAtMs = 1234;
  r.revocationHandle = "nth_z";
  r.handlePending = true;
  r.earlierPendingHandles = {"nth_old"};
  r.sessionId = "s";
  r.userId = "u";
  r.displayName = "Ada";
  const auto back = SessionRecord::fromJson(r.toJson());
  CHECK(back.has_value());
  CHECK(back->toJson() == r.toJson());
  CHECK((back->pendingHandles() == std::vector<std::string>{"nth_old", "nth_z"}));
  auto copy = *back;
  copy.forgetHandle("nth_z");
  copy.forgetHandle("nth_old");
  CHECK(copy.pendingHandles().empty());
  CHECK(!SessionRecord::fromJson("{\"version\":2}").has_value());
  CHECK(!SessionRecord::fromJson("not json").has_value());
}

void accountsIndexUpserts(TestContext& t) {
  TempDir dir;
  AccountsIndex index(dir.path());
  CHECK(index.list().empty());
  CHECK(index.upsert({"https://a.example", "u1", "Ada"}, std::chrono::milliseconds(500)));
  CHECK(index.upsert({"https://a.example", "u1", "Ada L."}, std::chrono::milliseconds(500)));
  CHECK(index.upsert({"https://b.example", "u2", "Bo"}, std::chrono::milliseconds(500)));
  const auto entries = index.list();
  CHECK(entries.size() == 2);
  CHECK(entries[0].displayName == "Ada L.");
  CHECK(index.remove("https://a.example", "u1", std::chrono::milliseconds(500)));
  CHECK(index.list().size() == 1);
}

void accountDirIsPerServerAndUser(TestContext& t) {
  const auto a = accountDir("/data", "https://a.example", "u1");
  CHECK(a != accountDir("/data", "https://a.example", "u2"));
  CHECK(a != accountDir("/data", "https://b.example", "u1"));
  CHECK(a.filename().string().size() == 33);
  CHECK(serverKey("https://a.example").size() == 16);
}

void authorizeUrlCarriesTheContract(TestContext& t) {
  const std::string url = authorizeUrl(
      {"https://nt.example", "http://127.0.0.1:5000/callback", "CH", "ST", "timeline", "Studio Mac"});
  CHECK(url.starts_with("https://nt.example/oauth/authorize?"));
  CHECK(url.find("client_id=nodetool-native") != std::string::npos);
  CHECK(url.find("scope=native") != std::string::npos);
  CHECK(url.find("redirect_uri=http%3A%2F%2F127.0.0.1%3A5000%2Fcallback") != std::string::npos);
  CHECK(url.find("code_challenge=CH&code_challenge_method=S256") != std::string::npos);
  CHECK(url.find("resource=https%3A%2F%2Fnt.example") != std::string::npos);
  CHECK(url.find("app=timeline") != std::string::npos);
  CHECK(url.find("device_name=Studio%20Mac") != std::string::npos);
  CHECK(urlDecode("Studio%20Mac+x%2") == "Studio Mac x%2");
}

void callbackParsing(TestContext& t) {
  using Kind = CallbackResult::Kind;
  CHECK(parseCallback("/callback?code=abc&state=S1", "S1").kind == Kind::Code);
  CHECK(parseCallback("/callback?code=abc&state=S1", "S1").code == "abc");
  CHECK(parseCallback("/callback?code=abc&state=S2", "S1").kind == Kind::StateMismatch);
  CHECK(parseCallback("/callback?code=abc", "S1").kind == Kind::StateMismatch);
  const auto denied = parseCallback("/callback?error=access_denied&error_description=Turned%20off&state=S1", "S1");
  CHECK(denied.kind == Kind::Denied);
  CHECK(denied.errorDescription == "Turned off");
  CHECK(parseCallback("/favicon.ico", "S1").kind == Kind::NotCallback);
  CHECK(parseCallback("/callback?state=S1", "S1").kind == Kind::NotCallback);
}

void listenerCancelWakesTheWait(TestContext& t) {
  auto listener = LoopbackListener::open();
  CHECK(listener != nullptr);
  if (!listener) {
    return;
  }
  CHECK(listener->port() != 0);
  CHECK(listener->redirectUri() == "http://127.0.0.1:" + std::to_string(listener->port()) + "/callback");
  std::thread canceller([&] {
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
    listener->cancel();
  });
  const auto start = std::chrono::steady_clock::now();
  const auto result = listener->waitForCallback("S", std::chrono::seconds(10));
  canceller.join();
  CHECK(!result.has_value());
  CHECK(std::chrono::steady_clock::now() - start < std::chrono::seconds(5));
}

void memoryStoreIsScopedByItem(TestContext& t) {
  MemorySecretStore store;
  CHECK(store.write(kKeychainService, "a#1", "x"));
  CHECK(store.read(kKeychainService, "a#1") == std::optional<std::string>("x"));
  CHECK(!store.read(kKeychainService, "a#2").has_value());
  store.remove(kKeychainService, "a#1");
  CHECK(!store.read(kKeychainService, "a#1").has_value());
  CHECK(keychainAccount("https://a.example", "u1") == "https://a.example#u1");
}

} // namespace

int main() {
  return account_test::runTests({
      {"sha256Vectors", sha256Vectors},
      {"pkceMatchesRfc7636", pkceMatchesRfc7636},
      {"base64UrlHasNoPadding", base64UrlHasNoPadding},
      {"generationFileRoundTrip", generationFileRoundTrip},
      {"lockExcludesAndTimesOut", lockExcludesAndTimesOut},
      {"recordRoundTrip", recordRoundTrip},
      {"accountsIndexUpserts", accountsIndexUpserts},
      {"accountDirIsPerServerAndUser", accountDirIsPerServerAndUser},
      {"authorizeUrlCarriesTheContract", authorizeUrlCarriesTheContract},
      {"callbackParsing", callbackParsing},
      {"listenerCancelWakesTheWait", listenerCancelWakesTheWait},
      {"memoryStoreIsScopedByItem", memoryStoreIsScopedByItem},
  });
}
