// The request layer and the saved-state rule (WP1.10): HttpTokenEndpoint
// against canned responses, CloudClient against the fake token server, the
// local store client against a fake bundled server, and CloudDocumentSaver
// with TC9 (the disk fills while editing) and edits made during a send.
#include "nodetool/account/cloud_client.h"
#include "nodetool/account/cloud_drafts.h"
#include "nodetool/account/cloud_listing.h"
#include "nodetool/account/cloud_savers.h"
#include "nodetool/account/cloud_sharing.h"
#include "nodetool/account/crypto.h"
#include "nodetool/account/http_token_endpoint.h"
#include "nodetool/account/origin.h"
#include "test_support.h"

#include <nlohmann/json.hpp>

#include <atomic>
#include <condition_variable>
#include <functional>
#include <map>
#include <mutex>
#include <thread>
#include <vector>

namespace {

using namespace nodetool::account;
using account_test::FakeClock;
using account_test::FakeTokenServer;
using account_test::TempDir;
using account_test::TestContext;

constexpr const char* kServer = "https://nt.example";

// Thread affinity: thread-safe. `mutex_` guards the log and the handler.
class FakeTransport final : public HttpTransport {
public:
  using Handler = std::function<HttpResponse(const HttpRequest&)>;
  explicit FakeTransport(Handler handler) : handler_(std::move(handler)) {}

  HttpResponse send(const HttpRequest& request) override {
    Handler handler;
    {
      const std::lock_guard lock(mutex_);
      sent_.push_back(request);
      handler = handler_;
    }
    return handler(request);
  }

  std::vector<HttpRequest> sent() {
    const std::lock_guard lock(mutex_);
    return sent_;
  }

private:
  std::mutex mutex_;
  Handler handler_;
  std::vector<HttpRequest> sent_;
};

std::string header(const HttpRequest& request, const std::string& name) {
  for (const auto& [key, value] : request.headers) {
    if (key == name) {
      return value;
    }
  }
  return {};
}

// ── HttpTokenEndpoint ───────────────────────────────────────────────

void parsesTokenResponses(TestContext& t) {
  const TokenResult ok = parseTokenResponse(
      {200, R"({"access_token":"ntd_a","refresh_token":"ntr_r","expires_in":900,"session_id":"s1",)"
            R"("user_id":"u1","display_name":"Ada","revocation_handle":"nth_h","token_type":"Bearer"})"});
  CHECK(ok.status == TokenStatus::Ok);
  CHECK(ok.tokens.accessToken == "ntd_a");
  CHECK(ok.tokens.refreshToken == "ntr_r");
  CHECK(ok.tokens.expiresInSeconds == 900);
  CHECK(ok.tokens.revocationHandle == "nth_h");
  CHECK(ok.tokens.displayName == "Ada");

  // A null display name, as the server sends for an account without one.
  CHECK(parseTokenResponse({200, R"({"access_token":"a","refresh_token":"r","expires_in":900,"display_name":null})"})
            .status == TokenStatus::Ok);

  const TokenResult grant =
      parseTokenResponse({400, R"({"error":"invalid_grant","error_description":"Desktop sign-in is turned off"})"});
  CHECK(grant.status == TokenStatus::InvalidGrant);
  CHECK(grant.message == "Desktop sign-in is turned off");

  CHECK(parseTokenResponse({400, R"({"error":"invalid_request"})"}).status == TokenStatus::Refused);
  CHECK(parseTokenResponse({200, R"({"access_token":"a"})"}).status == TokenStatus::Refused);
  CHECK(parseTokenResponse({200, "not json"}).status == TokenStatus::Refused);
  CHECK(parseTokenResponse({0, ""}).status == TokenStatus::Offline);
  CHECK(parseTokenResponse({429, ""}).status == TokenStatus::Offline);
  CHECK(parseTokenResponse({503, "<html>"}).status == TokenStatus::Offline);
  CHECK(parseTokenResponse({404, ""}).status == TokenStatus::Refused);
}

void postsTheNativeForms(TestContext& t) {
  FakeTransport transport([](const HttpRequest& request) {
    if (request.url.ends_with("/oauth/session/end")) {
      return HttpResponse{404, R"({"error":"not_found"})"};
    }
    return HttpResponse{200, R"({"access_token":"a","refresh_token":"r","expires_in":900})"};
  });
  HttpTokenEndpoint endpoint(transport, kServer);
  CHECK(endpoint.refresh("ntr_a+b/c").status == TokenStatus::Ok);
  CHECK(endpoint.exchangeCode({"code 1", "verifier", "http://127.0.0.1:5000/callback", kServer}).status ==
        TokenStatus::Ok);
  CHECK(endpoint.endSession("nth_x") == EndSessionStatus::Unknown);

  const auto sent = transport.sent();
  CHECK(sent.size() == 3);
  if (sent.size() == 3) {
    CHECK(sent[0].method == "POST");
    CHECK(sent[0].url == std::string(kServer) + "/oauth/token");
    CHECK(header(sent[0], "Content-Type") == "application/x-www-form-urlencoded");
    CHECK(sent[0].body == "grant_type=refresh_token&client_id=nodetool-native&refresh_token=ntr_a%2Bb%2Fc");
    CHECK(sent[1].body.find("grant_type=authorization_code") == 0);
    CHECK(sent[1].body.find("code=code%201") != std::string::npos);
    CHECK(sent[1].body.find("redirect_uri=http%3A%2F%2F127.0.0.1%3A5000%2Fcallback") != std::string::npos);
    CHECK(sent[2].url == std::string(kServer) + "/oauth/session/end");
    CHECK(sent[2].body == "handle=nth_x");
    // No request to the authorization server carries a bearer token.
    for (const auto& request : sent) {
      CHECK(header(request, "Authorization").empty());
    }
  }
}

void endSessionNeedsA200(TestContext& t) {
  for (const auto& [status, expected] : std::vector<std::pair<int, EndSessionStatus>>{
           {200, EndSessionStatus::Ended},
           {404, EndSessionStatus::Unknown},
           {400, EndSessionStatus::Offline},
           {500, EndSessionStatus::Offline},
           {0, EndSessionStatus::Offline}}) {
    FakeTransport transport([status = status](const HttpRequest&) { return HttpResponse{status, "{}"}; });
    HttpTokenEndpoint endpoint(transport, kServer);
    CHECK(endpoint.endSession("nth_x") == expected);
  }
}

// A token endpoint whose origin is not HTTPS sends nothing: the code, the
// verifier and the refresh token never travel in plain text.
void tokenEndpointNeedsHttps(TestContext& t) {
  FakeTransport transport([](const HttpRequest&) { return HttpResponse{200, "{}"}; });
  for (const std::string origin : {"http://nt.example", "https://user@nt.example", "https://nt.example/path", "nt.example",
                                   "https://nt.example\\@evil.test"}) {
    HttpTokenEndpoint endpoint(transport, origin);
    CHECK(endpoint.serverOrigin().empty());
    CHECK(endpoint.refresh("ntr_r").status == TokenStatus::Refused);
    CHECK(endpoint.exchangeCode({"c", "v", "http://127.0.0.1/callback", origin}).status == TokenStatus::Refused);
    CHECK(endpoint.endSession("nth_x") == EndSessionStatus::Offline);
  }
  CHECK(transport.sent().empty());
  HttpTokenEndpoint endpoint(transport, "HTTPS://NT.Example:443/");
  CHECK(endpoint.serverOrigin() == kServer);
  endpoint.refresh("ntr_r");
  const auto sent = transport.sent();
  CHECK(sent.size() == 1 && sent[0].requiredOrigin == kServer);
}

void canonicalOrigins(TestContext& t) {
  CHECK(canonicalHttpsOrigin("https://API.nodetool.ai") == std::optional<std::string>("https://api.nodetool.ai"));
  CHECK(canonicalHttpsOrigin("https://api.nodetool.ai:8443/") ==
        std::optional<std::string>("https://api.nodetool.ai:8443"));
  CHECK(canonicalHttpsOrigin("https://[::1]:7777") == std::optional<std::string>("https://[::1]:7777"));
  for (const std::string bad : {"http://api.nodetool.ai", "https://", "https://a b", "https://a:0", "https://a:99999",
                                "https://a:", "https://a@b", "https://a/b", "https://a?b", "https://.a", "ftp://a"}) {
    CHECK(!canonicalHttpsOrigin(bad));
  }
  CHECK(httpsOriginOfUrl("https://nt.example/a?b#c") == std::optional<std::string>("https://nt.example"));
  CHECK(!httpsOriginOfUrl("https://nt.example@evil.test/a"));
  CHECK(!httpsOriginOfUrl("https://evil.test\\@nt.example/a"));
  CHECK(!httpsOriginOfUrl("https://nt.example/a b"));
}

// ── CloudClient ─────────────────────────────────────────────────────

struct SignedInApp {
  TempDir data;
  MemorySecretStore keychain;
  FakeClock clock;
  FakeTokenServer server{clock};
  std::unique_ptr<AccountSession> session;

  explicit SignedInApp(std::string origin = kServer) {
    AccountSessionOptions options;
    options.dataDir = data.path();
    options.serverOrigin = origin;
    options.userId = "u1";
    options.nowMs = clock.fn();
    server.addCode("code", "u1", "Ada");
    const TokenResult r = server.exchangeCode({"code", "v", "http://127.0.0.1/callback", kServer});
    recordSignIn(keychain, options, r.tokens);
    session = std::make_unique<AccountSession>(keychain, server, options);
  }

  // The cloud server: 200 for a valid bearer token, 401 otherwise.
  HttpResponse answer(const HttpRequest& request) {
    const std::string auth = header(request, "Authorization");
    const std::string prefix = "Bearer ";
    const bool valid = auth.starts_with(prefix) && server.request(auth.substr(prefix.size()));
    return valid ? HttpResponse{200, "{}"} : HttpResponse{401, R"({"error":"unauthorized"})"};
  }
};

void attachesTheCredential(TestContext& t) {
  SignedInApp app;
  FakeTransport transport([&](const HttpRequest& r) { return app.answer(r); });
  CloudClient client(*app.session, transport);
  HttpRequest request;
  request.url = std::string(kServer) + "/trpc/workflows.get";
  request.headers = {{"authorization", "Bearer stale-from-the-old-code"}};
  const CloudSendResult result = client.send(request);
  CHECK(result.status == CloudSendStatus::Sent);
  CHECK(result.response.status == 200);
  const auto sent = transport.sent();
  CHECK(sent.size() == 1);
  if (!sent.empty()) {
    CHECK(sent[0].headers.size() == 2);
    CHECK(header(sent[0], "Authorization").starts_with("Bearer ntd_"));
    CHECK(header(sent[0], "x-nodetool-protocol") == std::to_string(kClientProtocolVersion));
  }
}

void neverSendsToAnotherHost(TestContext& t) {
  SignedInApp app;
  FakeTransport transport([&](const HttpRequest& r) { return app.answer(r); });
  CloudClient client(*app.session, transport);
  for (const std::string url : {"https://nt.example.evil.test/api", "https://other.example/api", "http://nt.example/api",
                                "https://nt.example:8443/api", "https://nt.exampleX", "https://nt.example@evil.test/api",
                                "https://nt.example\\@evil.test/api", "https://nt.example:/api"}) {
    HttpRequest request;
    request.url = url;
    CHECK(client.send(request).status == CloudSendStatus::WrongServer);
  }
  CHECK(transport.sent().empty());
  HttpRequest same;
  same.url = "HTTPS://NT.EXAMPLE:443?x=1";
  CHECK(client.send(same).status == CloudSendStatus::Sent);
  const auto sent = transport.sent();
  CHECK(sent.size() == 1 && sent[0].requiredOrigin == kServer);
}

// A session signed in to a plain HTTP origin never sends its credential,
// even to that origin.
void neverSendsOverPlainHttp(TestContext& t) {
  SignedInApp app("http://nt.example");
  FakeTransport transport([&](const HttpRequest& r) { return app.answer(r); });
  CloudClient client(*app.session, transport);
  CHECK(client.serverOrigin().empty());
  HttpRequest request;
  request.url = "http://nt.example/api";
  CHECK(client.send(request).status == CloudSendStatus::WrongServer);
  CHECK(transport.sent().empty());
}

// A session never sends its refresh token to a token endpoint bound to
// another server.
void refusesATokenEndpointOfAnotherServer(TestContext& t) {
  TempDir data;
  MemorySecretStore keychain;
  FakeClock clock;
  FakeTokenServer server{clock};
  AccountSessionOptions options;
  options.dataDir = data.path();
  options.serverOrigin = kServer;
  options.userId = "u1";
  options.nowMs = clock.fn();
  server.addCode("code", "u1", "Ada");
  recordSignIn(keychain, options, server.exchangeCode({"code", "v", "http://127.0.0.1/callback", kServer}).tokens);
  FakeTransport transport([](const HttpRequest&) { return HttpResponse{200, "{}"}; });
  HttpTokenEndpoint other(transport, "https://other.example");
  AccountSession session(keychain, other, options);
  clock.advance(16 * 60 * 1000);
  CHECK(session.refresh() == RefreshOutcome::Offline);
  CHECK(transport.sent().empty());
}

// The server refuses a token that has not expired locally, as after a
// revocation on another replica. The client renews it with a server call
// and retries with the new token instead of reusing the refused one.
void a401ForcesARefresh(TestContext& t) {
  SignedInApp app;
  std::atomic<int> calls{0};
  FakeTransport transport([&](const HttpRequest& r) {
    if (calls++ == 0) {
      return HttpResponse{401, R"({"error":"unauthorized"})"};
    }
    return app.answer(r);
  });
  CloudClient client(*app.session, transport);
  HttpRequest request;
  request.url = std::string(kServer) + "/api/workflows";
  const CloudSendResult result = client.send(request);
  CHECK(app.server.refreshCalls == 1);
  CHECK(result.status == CloudSendStatus::Sent);
  CHECK(result.response.status == 200);
  const auto sent = transport.sent();
  CHECK(sent.size() == 2);
  if (sent.size() == 2) {
    CHECK(header(sent[0], "Authorization") != header(sent[1], "Authorization"));
  }
}

// The other app signs out while a request is out. The request is stopped
// and reported as cancelled, not as sent.
void signOutCancelsARequestInFlight(TestContext& t) {
  SignedInApp app;
  AccountSessionOptions optionsA;
  optionsA.dataDir = app.data.path();
  optionsA.serverOrigin = kServer;
  optionsA.userId = "u1";
  optionsA.nowMs = app.clock.fn();
  AccountSession appA(app.keychain, app.server, optionsA);
  std::shared_ptr<const RequestCancel> flag;
  FakeTransport transport([&](const HttpRequest& r) {
    flag = r.cancel;
    appA.signOut();
    app.session->checkGenerationFile();
    return HttpResponse{200, "{}"};
  });
  CloudClient client(*app.session, transport);
  HttpRequest request;
  request.url = std::string(kServer) + "/api/workflows";
  CHECK(client.send(request).status == CloudSendStatus::Cancelled);
  CHECK(flag != nullptr && flag->cancelled());
  CHECK(client.send(request).status == CloudSendStatus::SignedOut);
  CHECK(transport.sent().size() == 1);
}

void sendsNothingWhenSignedOut(TestContext& t) {
  SignedInApp app;
  FakeTransport transport([&](const HttpRequest& r) { return app.answer(r); });
  CloudClient client(*app.session, transport);
  app.session->signOut();
  HttpRequest request;
  request.url = std::string(kServer) + "/trpc/workflows.get";
  CHECK(client.send(request).status == CloudSendStatus::SignedOut);
  CHECK(transport.sent().empty());
}

// The access token expires between the request rule and the server's check.
// The client renews it once and the retry succeeds.
void renewsOnceAfterA401(TestContext& t) {
  SignedInApp app;
  std::atomic<int> calls{0};
  FakeTransport transport([&](const HttpRequest& r) {
    if (calls++ == 0) {
      app.clock.advance(16 * 60 * 1000);
    }
    return app.answer(r);
  });
  CloudClient client(*app.session, transport);
  HttpRequest request;
  request.url = std::string(kServer) + "/api/workflows";
  const CloudSendResult result = client.send(request);
  CHECK(result.status == CloudSendStatus::Sent);
  CHECK(result.response.status == 200);
  CHECK(calls == 2);
  CHECK(app.server.refreshCalls == 1);
}

// A 401 after a renewal is reported, not retried in a loop.
void reportsAPersistent401(TestContext& t) {
  SignedInApp app;
  FakeTransport transport([](const HttpRequest&) { return HttpResponse{401, "{}"}; });
  CloudClient client(*app.session, transport);
  HttpRequest request;
  request.url = std::string(kServer) + "/api/workflows";
  const CloudSendResult result = client.send(request);
  CHECK(result.status == CloudSendStatus::Sent);
  CHECK(result.response.status == 401);
  CHECK(transport.sent().size() == 2);
  CHECK(app.server.refreshCalls == 1);
}

void offlineWhenNoAnswer(TestContext& t) {
  SignedInApp app;
  FakeTransport transport([](const HttpRequest&) { return HttpResponse{0, ""}; });
  CloudClient client(*app.session, transport);
  HttpRequest request;
  request.url = std::string(kServer) + "/api/workflows";
  CHECK(client.send(request).status == CloudSendStatus::Offline);
}

// ── LocalServerDraftStore ───────────────────────────────────────────

const CloudDocumentKey kKey{"a1b2c3d4e5f60718", "account-a", "workflow", "doc-1"};

// The store a CloudDocument owns keeps its transport alive and calls the
// same procedures.
void ownedLocalStoreCallsTheServer(TestContext& t) {
  std::vector<std::string> urls;
  auto transport = std::make_unique<FakeTransport>([&urls](const HttpRequest& request) {
    urls.push_back(request.url + " " + header(request, "Authorization"));
    return HttpResponse{200, R"({"result":{"data":{"draft_id":"d4"}}})"};
  });
  const std::unique_ptr<DraftStore> store =
      makeLocalServerDraftStore(std::move(transport), "http://127.0.0.1:7777", {{"Authorization", "Bearer local"}});
  CHECK(store->put(kKey, {"t0", "h0"}, R"({"nodes":[]})") == std::optional<std::string>("d4"));
  CHECK(urls == (std::vector<std::string>{"http://127.0.0.1:7777/trpc/cloudLocal.drafts.put Bearer local"}));
}

void callsTheLocalStoreProcedures(TestContext& t) {
  FakeTransport transport([](const HttpRequest& request) {
    if (request.url.ends_with("cloudLocal.drafts.put")) {
      return HttpResponse{200, R"({"result":{"data":{"draft_id":"d3"}}})"};
    }
    if (request.url.ends_with("cloudLocal.drafts.accept")) {
      return HttpResponse{200, R"({"result":{"data":{"json":{"outcome":"stale"}}}})"};
    }
    if (request.url.find("cloudLocal.drafts.get?input=") != std::string::npos) {
      return HttpResponse{200, R"({"result":{"data":{"json":{"draft":{"kind":"workflow","document_id":"doc-1",)"
                               R"("base":{"updated_at":"t0","content_hash":"h0"},"draft":"v1","state":"unsent",)"
                               R"("refusal_reason":"FILE_NOT_READABLE","draft_id":"d3","updated_at":"t"}}}}})"};
    }
    if (request.url.find("cloudLocal.drafts.list?input=") != std::string::npos) {
      return HttpResponse{200, R"({"result":{"data":{"json":{"drafts":[]}}}})"};
    }
    return HttpResponse{500, R"({"error":{"message":"disk I/O error"}})"};
  });
  LocalServerDraftStore store(transport, "http://127.0.0.1:7777", {{"Authorization", "Bearer local"}});
  CHECK(store.put(kKey, {"2026-11-16T10:00:00.000Z", "h0"}, R"({"nodes":[]})") == std::optional<std::string>("d3"));
  CHECK(store.accept(kKey, "d3", {"t0", "h0"}, {"t1", "h1"}, "owner", {}) ==
        std::optional<AcceptOutcome>(AcceptOutcome::Stale));
  CHECK(!store.markUnsent(kKey, "d3", "FILE_NOT_READABLE"));
  const DraftLoad loaded = store.load(kKey);
  CHECK(loaded.ok && loaded.draft.has_value());
  if (loaded.draft) {
    CHECK(loaded.draft->draftId == "d3");
    CHECK(loaded.draft->state == DraftState::Unsent);
    CHECK(loaded.draft->refusal == "FILE_NOT_READABLE");
    CHECK(loaded.draft->base.contentHash == "h0");
    CHECK(loaded.draft->key.serverKey == kKey.serverKey && loaded.draft->key.accountId == kKey.accountId);
  }
  const DraftList listed = store.list(kKey.serverKey, kKey.accountId);
  CHECK(listed.ok && listed.drafts.empty());

  const auto sent = transport.sent();
  CHECK(sent.size() == 5);
  if (sent.size() == 5) {
    CHECK(sent[0].url == "http://127.0.0.1:7777/trpc/cloudLocal.drafts.put");
    CHECK(header(sent[0], "Authorization") == "Bearer local");
    const nlohmann::json body = nlohmann::json::parse(sent[0].body);
    CHECK(body["server_key"] == "a1b2c3d4e5f60718");
    CHECK(body["account_id"] == "account-a");
    CHECK(body["document_id"] == "doc-1");
    CHECK(body["base"]["content_hash"] == "h0");
    CHECK(body["draft"] == R"({"nodes":[]})");
    const nlohmann::json accept = nlohmann::json::parse(sent[1].body);
    CHECK(accept["draft_id"] == "d3");
    CHECK(accept["sent_base"]["content_hash"] == "h0");
    CHECK(accept["base"]["content_hash"] == "h1");
    CHECK(sent[3].method == "GET");
    CHECK(header(sent[3], "Authorization") == "Bearer local");
  }
}

// ── CloudDocumentSaver ──────────────────────────────────────────────

// Thread affinity: thread-safe. `mutex_` guards every field.
class FakeDraftStore final : public DraftStore {
public:
  std::optional<std::string> put(const CloudDocumentKey& key, const CloudBase& base,
                                 const std::string& draft) override {
    const std::lock_guard lock(mutex_);
    if (full) {
      return std::nullopt;
    }
    row_ = StoredDraft{key, "d" + std::to_string(++writes_), base, draft, DraftState::Waiting, {}};
    puts_.push_back(draft);
    return row_->draftId;
  }
  std::optional<AcceptOutcome> accept(const CloudDocumentKey&, const std::string& draftId, const CloudBase& sentBase,
                                      const CloudBase& base, const std::string&,
                                      const CloudDocumentOptions&) override {
    const std::lock_guard lock(mutex_);
    ++accepts_;
    if (full || failAccept) {
      return std::nullopt;
    }
    if (!row_) {
      return AcceptOutcome::NoDraft;
    }
    if (row_->draftId == draftId) {
      row_.reset();
      return AcceptOutcome::Deleted;
    }
    if (row_->base.contentHash != sentBase.contentHash) {
      return AcceptOutcome::Stale;
    }
    row_->base = base;
    return AcceptOutcome::Rebased;
  }
  bool markUnsent(const CloudDocumentKey&, const std::string& draftId, const std::string& reason) override {
    const std::lock_guard lock(mutex_);
    if (failMark) {
      return false;
    }
    if (row_ && row_->draftId == draftId) {
      row_->state = DraftState::Unsent;
      row_->refusal = reason;
    }
    unsentReason_ = reason;
    return true;
  }
  DraftLoad load(const CloudDocumentKey&) override {
    const std::lock_guard lock(mutex_);
    return {true, row_};
  }
  DraftList list(const std::string&, const std::string&) override {
    const std::lock_guard lock(mutex_);
    DraftList out{true, {}};
    if (row_) {
      out.drafts.push_back(*row_);
    }
    return out;
  }

  std::optional<std::string> row() {
    const std::lock_guard lock(mutex_);
    return row_ ? std::optional<std::string>(row_->draft) : std::nullopt;
  }
  std::optional<StoredDraft> stored() {
    const std::lock_guard lock(mutex_);
    return row_;
  }
  std::vector<std::string> puts() {
    const std::lock_guard lock(mutex_);
    return puts_;
  }
  std::string unsentReason() {
    const std::lock_guard lock(mutex_);
    return unsentReason_;
  }
  int accepts() {
    const std::lock_guard lock(mutex_);
    return accepts_;
  }

  std::atomic<bool> full{false};
  std::atomic<bool> failAccept{false};
  std::atomic<bool> failMark{false};

private:
  std::mutex mutex_;
  int writes_ = 0;
  int accepts_ = 0;
  std::optional<StoredDraft> row_;
  std::vector<std::string> puts_;
  std::string unsentReason_;
};

// Thread affinity: thread-safe. `mutex_` guards the log and the hook.
class FakeCloud final : public CloudSaver {
public:
  SaveResult save(const CloudDocumentKey&, const std::string& instance, const CloudBase& base,
                  const std::string& draft) override {
    std::function<void()> hook;
    {
      const std::lock_guard lock(mutex_);
      saves_.emplace_back(base.contentHash, draft);
      instances_.push_back(instance);
      hook = std::exchange(duringSave_, nullptr);
    }
    if (hook) {
      hook();
    }
    SaveResult result;
    result.status = status;
    result.base = {"t" + std::to_string(saves().size()), "h" + std::to_string(saves().size())};
    result.role = "owner";
    result.reason = "FILE_NOT_READABLE";
    return result;
  }
  void onNextSave(std::function<void()> hook) {
    const std::lock_guard lock(mutex_);
    duringSave_ = std::move(hook);
  }
  std::vector<std::pair<std::string, std::string>> saves() {
    const std::lock_guard lock(mutex_);
    return saves_;
  }
  std::vector<std::string> instances() {
    const std::lock_guard lock(mutex_);
    return instances_;
  }

  std::atomic<SaveStatus> status{SaveStatus::Ok};

private:
  std::mutex mutex_;
  std::vector<std::pair<std::string, std::string>> saves_;
  std::vector<std::string> instances_;
  std::function<void()> duringSave_;
};

// Both workers' steps in order, for the tests that run them on one thread.
void tick(CloudDocumentSaver& saver, int64_t nowMs) {
  saver.persist(nowMs);
  saver.send(nowMs);
}

void savedOnlyAfterAcceptance(TestContext& t) {
  FakeDraftStore store;
  FakeCloud cloud;
  CloudDocumentSaver saver(store, cloud, kKey, {"t0", "h0"});
  CHECK(saver.state().status == DocumentStatus::SavedToCloud);
  saver.edit("v1", 1000);
  CHECK(saver.state().status == DocumentStatus::ChangesWaiting);
  CHECK(saver.state().unstoredEdits);
  tick(saver, 1100);
  // Not idle long enough yet: nothing written.
  CHECK(store.puts().empty());
  tick(saver, 1200);
  CHECK(store.puts() == std::vector<std::string>{"v1"});
  CHECK(cloud.saves().size() == 1);
  CHECK(saver.state().status == DocumentStatus::SavedToCloud);
  CHECK(!saver.state().unstoredEdits);
  CHECK(!store.row().has_value());
  CHECK(saver.state().lastContactMs == 1200);
}

// Continuous typing still reaches the store within 750 ms, with a tick every
// 100 ms and with the slowest allowed tick, every 250 ms.
void writesWithin750msWhileTyping(TestContext& t) {
  for (const int64_t tickEvery : {int64_t{100}, int64_t{250}}) {
    FakeDraftStore store;
    FakeCloud cloud;
    CloudDocumentSaver saver(store, cloud, kKey, {"t0", "h0"});
    int64_t firstWriteAt = -1;
    for (int64_t now = 0; now <= 2000 && firstWriteAt < 0; now += 50) {
      saver.edit("v" + std::to_string(now), now);
      if (now % tickEvery == 0) {
        tick(saver, now);
      }
      if (!store.puts().empty()) {
        firstWriteAt = now;
      }
    }
    CHECK(firstWriteAt >= 0);
    CHECK(firstWriteAt <= kDraftMaxDelayMs);
  }
}

// TC9: the disk fills while editing. Not saving shows within 5 seconds,
// Saved never shows, and once space is freed the edits held in memory are
// written with no further action.
void tc9DiskFull(TestContext& t) {
  FakeDraftStore store;
  FakeCloud cloud;
  CloudDocumentSaver saver(store, cloud, kKey, {"t0", "h0"});
  store.full = true;
  saver.edit("v1", 0);
  int64_t notSavingAt = -1;
  bool savedShown = false;
  for (int64_t now = 0; now <= 10'000; now += 100) {
    tick(saver, now);
    const DocumentState s = saver.state();
    if (s.status == DocumentStatus::NotSaving && notSavingAt < 0) {
      notSavingAt = now;
    }
    savedShown = savedShown || s.status == DocumentStatus::SavedToCloud;
  }
  CHECK(notSavingAt >= 0);
  CHECK(notSavingAt <= 5000);
  CHECK(!savedShown);
  CHECK(cloud.saves().empty());
  CHECK(saver.state().unstoredEdits);

  store.full = false;
  for (int64_t now = 10'100; now <= 13'000; now += 100) {
    tick(saver, now);
  }
  CHECK(store.puts() == std::vector<std::string>{"v1"});
  CHECK(saver.state().status == DocumentStatus::SavedToCloud);
}

// The server accepted, but the local record of the acceptance failed. The
// status stays Not saving until the store works again, and only then reads
// Saved.
void notSavedWhileTheAcceptanceIsUnrecorded(TestContext& t) {
  FakeDraftStore store;
  FakeCloud cloud;
  CloudDocumentSaver saver(store, cloud, kKey, {"t0", "h0"});
  store.failAccept = true;
  saver.edit("v1", 0);
  tick(saver, 300);
  CHECK(saver.state().status == DocumentStatus::NotSaving);
  // An offline cloud does not hide the local failure.
  cloud.status = SaveStatus::Offline;
  tick(saver, 2300);
  CHECK(saver.state().status == DocumentStatus::NotSaving);
  cloud.status = SaveStatus::Ok;
  store.failAccept = false;
  tick(saver, 8000);
  CHECK(saver.state().status == DocumentStatus::SavedToCloud);
  CHECK(!store.row().has_value());
}

// An edit during a send is kept: the acceptance of the older revision does
// not delete it, and it is written and sent next.
void keepsEditsMadeDuringASend(TestContext& t) {
  FakeDraftStore store;
  FakeCloud cloud;
  CloudDocumentSaver saver(store, cloud, kKey, {"t0", "h0"});
  saver.edit("v1", 0);
  cloud.onNextSave([&] { saver.edit("v2", 250); });
  tick(saver, 300);
  CHECK(saver.state().status == DocumentStatus::ChangesWaiting);
  CHECK(saver.state().unstoredEdits);
  tick(saver, 600);
  CHECK(store.puts() == (std::vector<std::string>{"v1", "v2"}));
  const auto saves = cloud.saves();
  CHECK(saves.size() == 2);
  if (saves.size() == 2) {
    // The second save edits the version the first one produced.
    CHECK(saves[1].first == "h1");
    CHECK(saves[1].second == "v2");
  }
  CHECK(saver.state().status == DocumentStatus::SavedToCloud);
}

void refusedSaveBecomesUnsent(TestContext& t) {
  FakeDraftStore store;
  FakeCloud cloud;
  CloudDocumentSaver saver(store, cloud, kKey, {"t0", "h0"});
  cloud.status = SaveStatus::Refused;
  saver.edit("v1", 0);
  tick(saver, 300);
  CHECK(saver.state().status == DocumentStatus::Unsent);
  CHECK(saver.state().refusal == "FILE_NOT_READABLE");
  CHECK(store.unsentReason() == "FILE_NOT_READABLE");
  CHECK(store.row() == std::optional<std::string>("v1"));
  // No retry of a refused save.
  tick(saver, 10'000);
  CHECK(cloud.saves().size() == 1);
  saver.edit("v2", 10'000);
  CHECK(saver.state().status == DocumentStatus::ChangesWaiting);
  CHECK(saver.state().refusal.empty());
}

void retriesWhileOfflineOrSignedOut(TestContext& t) {
  FakeDraftStore store;
  FakeCloud cloud;
  CloudDocumentSaver saver(store, cloud, kKey, {"t0", "h0"});
  cloud.status = SaveStatus::Offline;
  saver.edit("v1", 0);
  tick(saver, 300);
  CHECK(saver.state().status == DocumentStatus::Offline);
  tick(saver, 1000);
  CHECK(cloud.saves().size() == 1);
  cloud.status = SaveStatus::SignedOut;
  tick(saver, 300 + kSendRetryMs);
  CHECK(saver.state().status == DocumentStatus::SignedOut);
  CHECK(store.row() == std::optional<std::string>("v1"));
  cloud.status = SaveStatus::Ok;
  tick(saver, 300 + 2 * kSendRetryMs);
  CHECK(saver.state().status == DocumentStatus::SavedToCloud);
}

// The UI thread edits while the worker ticks. Run under ThreadSanitizer.
void editsFromAnotherThread(TestContext& t) {
  FakeDraftStore store;
  FakeCloud cloud;
  CloudDocumentSaver saver(store, cloud, kKey, {"t0", "h0"});
  std::atomic<int64_t> now{0};
  std::atomic<bool> stop{false};
  std::thread persister([&] {
    while (!stop) {
      saver.persist(now.load());
      std::this_thread::yield();
    }
  });
  std::thread sender([&] {
    while (!stop) {
      saver.send(now.load());
      std::this_thread::yield();
    }
  });
  for (int i = 0; i < 2000; ++i) {
    saver.edit("v" + std::to_string(i), now.load());
    now += 1;
    if (i % 50 == 0) {
      (void)saver.state();
    }
  }
  now += 10'000;
  for (int i = 0; i < 1000 && saver.state().status != DocumentStatus::SavedToCloud; ++i) {
    std::this_thread::sleep_for(std::chrono::milliseconds(1));
  }
  stop = true;
  persister.join();
  sender.join();
  CHECK(saver.state().status == DocumentStatus::SavedToCloud);
  const auto puts = store.puts();
  CHECK(!puts.empty() && puts.back() == "v1999");
}

// Every save of one open document carries the same editing instance, and
// another open of the same document carries another one (TC8).
void oneInstancePerOpenDocument(TestContext& t) {
  FakeDraftStore store;
  FakeCloud cloud;
  CloudDocumentSaver first(store, cloud, kKey, {"t0", "h0"});
  CHECK(first.editingInstance().size() == 32);
  CHECK(first.editingInstance().find_first_not_of("0123456789abcdef") == std::string::npos);
  first.edit("v1", 0);
  tick(first, 300);
  first.edit("v2", 400);
  tick(first, 700);
  CloudDocumentSaver second(store, cloud, kKey, {"t2", "h2"});
  second.edit("v3", 800);
  tick(second, 1100);
  const auto instances = cloud.instances();
  CHECK(instances.size() == 3);
  CHECK(instances.size() == 3 && instances[0] == first.editingInstance() && instances[1] == first.editingInstance());
  CHECK(instances.size() == 3 && instances[2] == second.editingInstance());
  CHECK(first.editingInstance() != second.editingInstance());
}

// ── Per-kind savers ─────────────────────────────────────────────────

const CloudDocumentKey kWorkflowKey{serverKey(kServer), "u1", "workflow", "w1"};
const CloudDocumentKey kTimelineKey{serverKey(kServer), "u1", "timeline", "t1"};
const std::string kInstance(32, 'a');
const CloudBase kBase{"r0", "h0"};

constexpr const char* kCapabilities =
    R"({"protocol_version":1,"min_client_protocol_version":1,"kinds":{)"
    R"("workflow":{"read":[1],"write":[1],"modes":["whole"]},"timeline":{"read":[1],"write":[1],"modes":["whole"]}}})";

// A cloud server that answers each signed-in POST with `reply`, each read
// with `latest`, and the capabilities with `capabilities`.
struct SaverServer {
  SignedInApp app;
  std::function<HttpResponse(const nlohmann::json&)> reply;
  std::function<HttpResponse(const HttpRequest&)> latest = [](const HttpRequest&) {
    return HttpResponse{404, "{}"};
  };
  HttpResponse capabilities{200, kCapabilities};
  FakeTransport transport{[this](const HttpRequest& r) {
    if (app.answer(r).status != 200) {
      return HttpResponse{401, "{}"};
    }
    if (r.url.ends_with("/api/sync/capabilities")) {
      return capabilities;
    }
    if (r.method != "POST") {
      return latest(r);
    }
    return reply(nlohmann::json::parse(r.body));
  }};
  CloudClient client{*app.session, transport};

  // The POSTs sent, leaving out the capabilities and the reads.
  std::vector<HttpRequest> saves() {
    std::vector<HttpRequest> out;
    for (const HttpRequest& r : transport.sent()) {
      if (r.method == "POST") {
        out.push_back(r);
      }
    }
    return out;
  }
};

void workflowSaverSendsTheGraph(TestContext& t) {
  SaverServer server;
  server.reply = [](const nlohmann::json&) {
    return HttpResponse{200, R"({"result":{"data":{"id":"w1","updated_at":"2026-11-16T10:00:00Z"}}})"};
  };
  WorkflowCloudSaver saver(server.client);
  saver.setAccess("w1", {"viewer", {}});
  const std::string draft = R"({"nodes":[],"edges":[]})";
  const SaveResult result = saver.save(kWorkflowKey, kInstance, {"2026-11-16T09:00:00Z", "h0"}, draft);
  CHECK(result.status == SaveStatus::Ok);
  CHECK(result.base.updatedAt == "2026-11-16T10:00:00Z");
  const Sha256Digest digest = sha256(draft);
  CHECK(result.base.contentHash == hexEncode(digest.data(), digest.size()));
  CHECK(result.role == "viewer");
  const auto sent = server.saves();
  CHECK(sent.size() == 1);
  if (!sent.empty()) {
    CHECK(sent[0].method == "POST");
    CHECK(sent[0].url == std::string(kServer) + "/trpc/workflows.autosave");
    const nlohmann::json body = nlohmann::json::parse(sent[0].body);
    CHECK(body["id"] == "w1");
    CHECK(body["graph"]["nodes"].is_array());
    CHECK(body["expected_updated_at"] == "2026-11-16T09:00:00Z");
    CHECK(body["editing_instance"] == kInstance);
    CHECK(body["schema_version"] == kWorkflowSchemaVersion);
    CHECK(body["force"] == true);
  }
}

// A draft that keeps the workflow's name sends it beside the graph, so a
// rename reaches the server. A graph-only draft sends no name.
void workflowSaverSendsTheName(TestContext& t) {
  SaverServer server;
  server.reply = [](const nlohmann::json&) {
    return HttpResponse{200, R"({"result":{"data":{"id":"w1","updated_at":"r2"}}})"};
  };
  WorkflowCloudSaver saver(server.client);
  CHECK(saver.save(kWorkflowKey, kInstance, {"r1", "h1"},
                   R"({"graph":{"nodes":[],"edges":[]},"name":"Renamed"})").status == SaveStatus::Ok);
  CHECK(saver.save(kWorkflowKey, kInstance, {"r2", "h2"}, R"({"graph":{"nodes":[],"edges":[]},"name":""})").status ==
        SaveStatus::Ok);
  CHECK(saver.save(kWorkflowKey, kInstance, {"r2", "h2"}, R"({"graph":{"nodes":{}},"name":"Bad"})").status ==
        SaveStatus::Refused);
  const auto sent = server.saves();
  CHECK(sent.size() == 2);
  if (sent.size() == 2) {
    const nlohmann::json first = nlohmann::json::parse(sent[0].body);
    CHECK(first["name"] == "Renamed");
    CHECK(first["graph"]["nodes"].is_array());
    CHECK(!first["graph"].contains("name"));
    CHECK(!nlohmann::json::parse(sent[1].body).contains("name"));
  }
}

void timelineSaverSendsTheDocument(TestContext& t) {
  SaverServer server;
  server.reply = [](const nlohmann::json&) {
    return HttpResponse{200, R"({"result":{"data":{"json":{"id":"t1","updatedAt":"r2"}}}})"};
  };
  TimelineCloudSaver saver(server.client);
  const SaveResult result = saver.save(kTimelineKey, kInstance, {"r1", "h1"}, R"({"tracks":[]})");
  CHECK(result.status == SaveStatus::Ok);
  CHECK(result.base.updatedAt == "r2");
  CHECK(result.role == "editor");
  const auto sent = server.saves();
  CHECK(sent.size() == 1);
  if (!sent.empty()) {
    CHECK(sent[0].url == std::string(kServer) + "/trpc/timeline.update");
    const nlohmann::json body = nlohmann::json::parse(sent[0].body);
    CHECK(body["baseUpdatedAt"] == "r1");
    CHECK(body["document"]["tracks"].is_array());
    CHECK(body["editingInstance"] == kInstance);
    CHECK(body["schemaVersion"] == kTimelineSchemaVersion);
    CHECK(!body.contains("fps"));
  }
}

// The frame rate and size travel as the sequence's columns, never inside
// the document, where the server would ignore them.
void timelineSaverSendsTheSequenceColumns(TestContext& t) {
  SaverServer server;
  server.reply = [](const nlohmann::json&) {
    return HttpResponse{200, R"({"result":{"data":{"json":{"id":"t1","updatedAt":"r2"}}}})"};
  };
  TimelineCloudSaver saver(server.client);
  const SaveResult result =
      saver.save(kTimelineKey, kInstance, {"r1", "h1"}, R"({"tracks":[],"fps":24,"width":1920,"height":"tall"})");
  CHECK(result.status == SaveStatus::Ok);
  const auto sent = server.saves();
  CHECK(sent.size() == 1);
  if (!sent.empty()) {
    const nlohmann::json body = nlohmann::json::parse(sent[0].body);
    CHECK(body["fps"] == 24);
    CHECK(body["width"] == 1920);
    CHECK(!body.contains("height"));
    CHECK(body["document"]["tracks"].is_array());
    CHECK(!body["document"].contains("fps"));
    CHECK(!body["document"].contains("width"));
    CHECK(!body["document"].contains("height"));
  }
}

// A save of an existing document always names the revision it edits.
// Without one the server would apply it to whatever it holds now.
void saveWithoutBaseIsRefused(TestContext& t) {
  SaverServer server;
  server.reply = [](const nlohmann::json&) {
    return HttpResponse{200, R"({"result":{"data":{"updatedAt":"r1"}}})"};
  };
  TimelineCloudSaver saver(server.client);
  const SaveResult result = saver.save(kTimelineKey, kInstance, {}, "{}");
  CHECK(result.status == SaveStatus::Refused);
  CHECK(result.reason == "NO_BASE");
  CHECK(server.transport.sent().empty());
}

// A draft is sent only to the account and server it belongs to. A draft of
// another account waits, and nothing of it reaches this one's server.
void saverRefusesAnotherAccountsDraft(TestContext& t) {
  SaverServer server;
  server.reply = [](const nlohmann::json&) {
    return HttpResponse{200, R"({"result":{"data":{"updated_at":"r1"}}})"};
  };
  WorkflowCloudSaver saver(server.client);
  const std::string draft = R"({"nodes":[],"edges":[]})";
  CloudDocumentKey otherAccount = kWorkflowKey;
  otherAccount.accountId = "u2";
  CloudDocumentKey otherServer = kWorkflowKey;
  otherServer.serverKey = serverKey("https://other.example");
  for (const CloudDocumentKey& key : {otherAccount, otherServer}) {
    const SaveResult result = saver.save(key, kInstance, kBase, draft);
    CHECK(result.status == SaveStatus::SignedOut);
    CHECK(result.reason == "OTHER_ACCOUNT");
    CHECK(saver.open(key).status == SaveStatus::SignedOut);
  }
  CHECK(server.transport.sent().empty());
}

// A conflict is not a refusal: the saver reads the latest revision and
// sends the draft again on it (the transitional draft-wins merge).
void conflictIsSentAgainOnTheLatestRevision(TestContext& t) {
  SaverServer server;
  int posts = 0;
  server.reply = [&](const nlohmann::json& body) {
    ++posts;
    if (body["expected_updated_at"] != "r9") {
      return HttpResponse{409, R"({"error":{"json":{"data":{"apiCode":"ALREADY_EXISTS"}}}})"};
    }
    return HttpResponse{200, R"({"result":{"data":{"updated_at":"r10"}}})"};
  };
  server.latest = [&t](const HttpRequest& r) {
    CHECK(r.url.find("/trpc/workflows.get?input=") != std::string::npos);
    return HttpResponse{200, R"({"result":{"data":{"id":"w1","updated_at":"r9","schema_version":1,"graph":{}}}})"};
  };
  WorkflowCloudSaver saver(server.client);
  const std::string draft = R"({"nodes":[1],"edges":[]})";
  const SaveResult result = saver.save(kWorkflowKey, kInstance, kBase, draft);
  CHECK(result.status == SaveStatus::Ok);
  CHECK(result.base.updatedAt == "r10");
  CHECK(posts == 2);
  const auto sent = server.saves();
  CHECK(sent.size() == 2);
  if (sent.size() == 2) {
    CHECK(nlohmann::json::parse(sent[0].body)["expected_updated_at"] == "r0");
    CHECK(nlohmann::json::parse(sent[1].body)["graph"]["nodes"][0] == 1);
    CHECK(nlohmann::json::parse(sent[1].body)["editing_instance"] == kInstance);
  }

  // A latest revision in a newer schema is never replaced.
  server.latest = [](const HttpRequest&) {
    return HttpResponse{200, R"({"result":{"data":{"updated_at":"r9b","schema_version":2}}})"};
  };
  const SaveResult newer = saver.save(kWorkflowKey, kInstance, kBase, draft);
  CHECK(newer.status == SaveStatus::Refused);
  CHECK(newer.reason == "SCHEMA_DOWNGRADE");

  // When the latest revision cannot be read, the save waits.
  server.latest = [](const HttpRequest&) { return HttpResponse{503, ""}; };
  CHECK(saver.save(kWorkflowKey, kInstance, kBase, draft).status == SaveStatus::Offline);

  // A document that keeps changing is tried again later, not refused.
  server.latest = [](const HttpRequest&) {
    return HttpResponse{200, R"({"result":{"data":{"updated_at":"r8"}}})"};
  };
  CHECK(saver.save(kWorkflowKey, kInstance, kBase, draft).status == SaveStatus::Offline);
}

// Auth and transport failures wait and are retried. A refusal is reported
// apart from them.
void saverSortsRetryableFailures(TestContext& t) {
  SaverServer server;
  int status = 0;
  server.reply = [&](const nlohmann::json&) { return HttpResponse{status, "{}"}; };
  TimelineCloudSaver saver(server.client);
  for (const int retryable : {408, 429, 500, 503}) {
    status = retryable;
    CHECK(saver.save(kTimelineKey, kInstance, kBase, "{}").status == SaveStatus::Offline);
  }
  status = 404;
  const SaveResult refused = saver.save(kTimelineKey, kInstance, kBase, "{}");
  CHECK(refused.status == SaveStatus::Refused);
  CHECK(refused.reason == "HTTP_404");
}

// The saver writes only to a server that takes this client's saves.
void saverReadsTheCapabilities(TestContext& t) {
  const std::string draft = R"({"nodes":[],"edges":[]})";
  const auto okReply = [](const nlohmann::json&) {
    return HttpResponse{200, R"({"result":{"data":{"updated_at":"r1"}}})"};
  };
  struct Case {
    HttpResponse capabilities;
    SaveStatus status;
    const char* reason;
  };
  for (const Case& c : std::vector<Case>{
           // A server from before negotiation lacks the save guarantees.
           {{404, "not found"}, SaveStatus::Refused, "SERVER_UNSUPPORTED"},
           {{200, R"({"min_client_protocol_version":2,"kinds":{}})"}, SaveStatus::Refused, "CLIENT_TOO_OLD"},
           {{200, R"({"min_client_protocol_version":1,"kinds":{"workflow":{"write":[2],"modes":["whole"]}}})"},
            SaveStatus::Refused, "SERVER_UNSUPPORTED"},
           {{200, R"({"min_client_protocol_version":1,"kinds":{"workflow":{"write":[1],"modes":[]}}})"},
            SaveStatus::Refused, "SERVER_UNSUPPORTED"},
           {{503, ""}, SaveStatus::Offline, ""},
       }) {
    SaverServer server;
    server.reply = okReply;
    server.capabilities = c.capabilities;
    WorkflowCloudSaver saver(server.client);
    const SaveResult result = saver.save(kWorkflowKey, kInstance, kBase, draft);
    CHECK(result.status == c.status);
    CHECK(result.reason == c.reason);
    CHECK(server.saves().empty());
  }
  // Read once, then saves go straight out.
  SaverServer server;
  server.reply = okReply;
  WorkflowCloudSaver saver(server.client);
  CHECK(saver.save(kWorkflowKey, kInstance, kBase, draft).status == SaveStatus::Ok);
  CHECK(saver.save(kWorkflowKey, kInstance, kBase, draft).status == SaveStatus::Ok);
  CHECK(server.transport.sent().size() == 3);
}

// Opening reads the stored schema. A document in a newer schema opens
// read-only, and a save of it never goes out.
void openChecksTheDocumentSchema(TestContext& t) {
  SaverServer server;
  server.reply = [](const nlohmann::json&) {
    return HttpResponse{200, R"({"result":{"data":{"updatedAt":"r2"}}})"};
  };
  int stored = 1;
  server.latest = [&](const HttpRequest&) {
    const nlohmann::json data = {{"id", "t1"}, {"updatedAt", "r1"}, {"schemaVersion", stored}};
    return HttpResponse{200, nlohmann::json{{"result", {{"data", data}}}}.dump()};
  };
  TimelineCloudSaver saver(server.client);
  const OpenedDocument opened = saver.open(kTimelineKey);
  CHECK(opened.status == SaveStatus::Ok);
  CHECK(opened.writable);
  CHECK(opened.base.updatedAt == "r1");
  CHECK(opened.schemaVersion == 1);

  stored = 2;
  const OpenedDocument newer = saver.open(kTimelineKey);
  CHECK(newer.status == SaveStatus::Ok);
  CHECK(!newer.writable);
  CHECK(newer.reason == "SCHEMA_DOWNGRADE");
  const SaveResult refused = saver.save(kTimelineKey, kInstance, newer.base, "{}");
  CHECK(refused.status == SaveStatus::Refused);
  CHECK(refused.reason == "SCHEMA_DOWNGRADE");
  CHECK(server.saves().empty());
}

void saverReportsTheServersCode(TestContext& t) {
  SaverServer server;
  server.reply = [](const nlohmann::json&) {
    return HttpResponse{409, R"({"error":{"json":{"message":"x","data":{"code":"CONFLICT","httpStatus":409,"apiCode":"SCHEMA_DOWNGRADE"}}}})"};
  };
  WorkflowCloudSaver saver(server.client);
  const SaveResult refused = saver.save(kWorkflowKey, kInstance, kBase, R"({"nodes":[],"edges":[]})");
  CHECK(refused.status == SaveStatus::Refused);
  CHECK(refused.reason == "SCHEMA_DOWNGRADE");

  server.reply = [](const nlohmann::json&) { return HttpResponse{403, "not json"}; };
  const SaveResult bare = saver.save(kWorkflowKey, kInstance, kBase, R"({"nodes":[],"edges":[]})");
  CHECK(bare.status == SaveStatus::Refused);
  CHECK(bare.reason == "HTTP_403");

  // A server failure may pass, so the draft is sent again later.
  server.reply = [](const nlohmann::json&) { return HttpResponse{503, ""}; };
  CHECK(saver.save(kWorkflowKey, kInstance, kBase, R"({"nodes":[],"edges":[]})").status == SaveStatus::Offline);

  // An answer without the new revision cannot be recorded as saved.
  server.reply = [](const nlohmann::json&) { return HttpResponse{200, R"({"result":{"data":{}}})"}; };
  const SaveResult unread = saver.save(kWorkflowKey, kInstance, kBase, R"({"nodes":[],"edges":[]})");
  CHECK(unread.status == SaveStatus::Refused);
  CHECK(unread.reason == "INVALID_RESPONSE");
}

void saverRefusesAnUnreadableDraft(TestContext& t) {
  SaverServer server;
  server.reply = [](const nlohmann::json&) { return HttpResponse{200, "{}"}; };
  WorkflowCloudSaver saver(server.client);
  for (const std::string draft : {"not json", "[]", R"({"nodes":[]})", R"({"nodes":{},"edges":[]})"}) {
    const SaveResult result = saver.save(kWorkflowKey, kInstance, kBase, draft);
    CHECK(result.status == SaveStatus::Refused);
    CHECK(result.reason == "INVALID_DRAFT");
  }
  CHECK(server.saves().empty());
}

void saverSignedOutAndOffline(TestContext& t) {
  {
    SaverServer server;
    server.reply = [](const nlohmann::json&) { return HttpResponse{200, "{}"}; };
    server.app.session->signOut();
    TimelineCloudSaver saver(server.client);
    CHECK(saver.save(kTimelineKey, kInstance, kBase, "{}").status == SaveStatus::SignedOut);
    CHECK(server.transport.sent().empty());
  }
  {
    SaverServer server;
    server.reply = [](const nlohmann::json&) { return HttpResponse{0, ""}; };
    TimelineCloudSaver saver(server.client);
    CHECK(saver.save(kTimelineKey, kInstance, kBase, "{}").status == SaveStatus::Offline);
  }
}

// Closing the document writes the latest edit at once, before its delay
// and during a retry wait.
void flushWritesAtOnce(TestContext& t) {
  FakeDraftStore store;
  FakeCloud cloud;
  CloudDocumentSaver saver(store, cloud, kKey, {"t0", "h0"});
  CHECK(saver.flush(0));
  CHECK(store.puts().empty());
  saver.edit("v1", 0);
  saver.persist(10);
  CHECK(store.puts().empty());
  CHECK(saver.flush(10));
  CHECK(store.puts() == (std::vector<std::string>{"v1"}));
  CHECK(!saver.state().unstoredEdits);

  store.full = true;
  saver.edit("v2", 20);
  CHECK(!saver.flush(20));
  CHECK(saver.state().status == DocumentStatus::NotSaving);
  store.full = false;
  CHECK(saver.flush(30));
  CHECK(store.puts() == (std::vector<std::string>{"v1", "v2"}));
  CHECK(!saver.state().unstoredEdits);
}

// A cloud save that hangs does not hold back the local write of a newer
// edit: it reaches the store within the 750 ms target while the send is out.
void slowCloudDoesNotDelayLocalWrites(TestContext& t) {
  FakeDraftStore store;
  FakeCloud cloud;
  CloudDocumentSaver saver(store, cloud, kKey, {"t0", "h0"});
  std::mutex m;
  std::condition_variable cv;
  bool inSave = false;
  bool release = false;
  cloud.onNextSave([&] {
    std::unique_lock lock(m);
    inSave = true;
    cv.notify_all();
    cv.wait(lock, [&] { return release; });
  });
  saver.edit("v1", 0);
  saver.persist(300);
  std::thread sender([&] { saver.send(300); });
  {
    std::unique_lock lock(m);
    cv.wait(lock, [&] { return inSave; });
  }
  saver.edit("v2", 400);
  saver.persist(700);
  CHECK(store.puts() == (std::vector<std::string>{"v1", "v2"}));
  CHECK(!saver.state().unstoredEdits);
  {
    std::lock_guard lock(m);
    release = true;
  }
  cv.notify_all();
  sender.join();
  saver.send(800);
  CHECK(cloud.saves().size() == 2);
  CHECK(saver.state().status == DocumentStatus::SavedToCloud);
  CHECK(!store.row().has_value());
}

// The server accepted, the local record failed. Only the local record is
// retried: the server sees the draft once.
void aFailedLocalRecordIsNotSentAgain(TestContext& t) {
  FakeDraftStore store;
  FakeCloud cloud;
  CloudDocumentSaver saver(store, cloud, kKey, {"t0", "h0"});
  store.failAccept = true;
  saver.edit("v1", 0);
  tick(saver, 300);
  CHECK(saver.state().status == DocumentStatus::NotSaving);
  for (int64_t now = 400; now <= 10'000; now += 100) {
    tick(saver, now);
  }
  CHECK(cloud.saves().size() == 1);
  CHECK(store.accepts() > 1);
  store.failAccept = false;
  tick(saver, 12'000);
  CHECK(cloud.saves().size() == 1);
  CHECK(saver.state().status == DocumentStatus::SavedToCloud);
  CHECK(!store.row().has_value());
}

// A refusal is shown only once it is stored. Until then the status reads
// Not saving and the record is retried without sending again.
void aRefusalIsShownOnlyOnceStored(TestContext& t) {
  FakeDraftStore store;
  FakeCloud cloud;
  CloudDocumentSaver saver(store, cloud, kKey, {"t0", "h0"});
  cloud.status = SaveStatus::Refused;
  store.failMark = true;
  saver.edit("v1", 0);
  tick(saver, 300);
  CHECK(saver.state().status == DocumentStatus::NotSaving);
  store.failMark = false;
  tick(saver, 2400);
  CHECK(saver.state().status == DocumentStatus::Unsent);
  CHECK(store.stored().has_value() && store.stored()->state == DraftState::Unsent);
  CHECK(cloud.saves().size() == 1);
}

// After a restart the saver resumes the draft the store kept and sends it
// on the base it edits.
void resumesAStoredDraft(TestContext& t) {
  FakeDraftStore store;
  FakeCloud cloud;
  const auto id = store.put(kKey, {"t0", "h0"}, "kept edits");
  CHECK(id.has_value());
  const DraftLoad loaded = store.load(kKey);
  CHECK(loaded.ok && loaded.draft.has_value());
  if (!loaded.draft) {
    return;
  }
  CloudDocumentSaver saver(store, cloud, *loaded.draft);
  CHECK(saver.state().status == DocumentStatus::ChangesWaiting);
  tick(saver, 0);
  const auto saves = cloud.saves();
  CHECK(saves.size() == 1);
  if (saves.size() == 1) {
    CHECK(saves[0].first == "h0");
    CHECK(saves[0].second == "kept edits");
  }
  CHECK(saver.state().status == DocumentStatus::SavedToCloud);
  CHECK(!store.row().has_value());

  // An unsent draft resumes as unsent and is not sent again.
  FakeDraftStore refusedStore;
  refusedStore.put(kKey, {"t0", "h0"}, "refused edits");
  const auto stored = refusedStore.stored();
  CHECK(stored.has_value());
  if (stored) {
    refusedStore.markUnsent(kKey, stored->draftId, "FILE_NOT_READABLE");
    CloudDocumentSaver resumed(refusedStore, cloud, *refusedStore.load(kKey).draft);
    CHECK(resumed.state().status == DocumentStatus::Unsent);
    CHECK(resumed.state().refusal == "FILE_NOT_READABLE");
    tick(resumed, 10'000);
    CHECK(cloud.saves().size() == 1);
  }
}

// The count of changes waiting covers every edit the server has not
// accepted, including one made while a save was out.
void countsTheChangesWaiting(TestContext& t) {
  FakeDraftStore store;
  FakeCloud cloud;
  CloudDocumentSaver saver(store, cloud, kKey, {"t0", "h0"});
  CHECK(saver.state().waitingEdits == 0);
  cloud.status = SaveStatus::Offline;
  saver.edit("v1", 0);
  saver.edit("v2", 10);
  saver.edit("v3", 20);
  CHECK(saver.state().waitingEdits == 3);
  tick(saver, 300);
  CHECK(saver.state().status == DocumentStatus::Offline);
  CHECK(saver.state().waitingEdits == 3);
  cloud.status = SaveStatus::Ok;
  cloud.onNextSave([&] { saver.edit("v4", 5300); });
  tick(saver, 5400);
  // The save of v3 was accepted. v4 still waits.
  CHECK(saver.state().waitingEdits == 1);
  tick(saver, 6000);
  CHECK(saver.state().status == DocumentStatus::SavedToCloud);
  CHECK(saver.state().waitingEdits == 0);

  // A draft resumed from the store counts as one change.
  FakeDraftStore kept;
  kept.put(kKey, {"t0", "h0"}, "kept");
  CloudDocumentSaver resumed(kept, cloud, *kept.load(kKey).draft);
  CHECK(resumed.state().waitingEdits == 1);
}

// ── Cloud and Shared with me lists ─────────────────────────────────

// A signed-in cloud server that answers each procedure from `answers`.
struct ListServer {
  SignedInApp app;
  std::map<std::string, HttpResponse> answers;
  FakeTransport transport{[this](const HttpRequest& r) {
    if (app.answer(r).status != 200) {
      return HttpResponse{401, "{}"};
    }
    const std::string prefix = std::string(kServer) + "/trpc/";
    std::string procedure = r.url.substr(prefix.size());
    procedure = procedure.substr(0, procedure.find('?'));
    const auto it = answers.find(procedure);
    return it == answers.end() ? HttpResponse{404, R"({"error":{"json":{"data":{"apiCode":"NOT_FOUND"}}}})"}
                               : it->second;
  }};
  CloudClient client{*app.session, transport};
};

void listsTheAccountsOwnDocuments(TestContext& t) {
  ListServer server;
  server.answers["workflows.list"] = {
      200, R"({"result":{"data":{"workflows":[)"
           R"({"id":"w1","name":"Old","updated_at":"2026-11-01T10:00:00Z"},)"
           R"({"id":"w2","name":"New","updated_at":"2026-11-16T10:00:00Z"},)"
           R"({"name":"no id"}],"next":null}}})"};
  server.answers["timeline.list"] = {
      200, R"({"result":{"data":{"json":[{"id":"t1","projectId":"p","name":"Cut","updatedAt":"2026-11-02T00:00:00Z"}]}}})"};
  const CloudListing workflows = listOwnDocuments(server.client, "workflow");
  CHECK(workflows.status == CloudListStatus::Ok);
  CHECK(workflows.items.size() == 2);
  if (workflows.items.size() == 2) {
    CHECK(workflows.items[0].id == "w2");
    CHECK(workflows.items[0].role == "owner");
    CHECK(workflows.items[1].name == "Old");
  }
  const CloudListing timelines = listOwnDocuments(server.client, "timeline");
  CHECK(timelines.status == CloudListStatus::Ok);
  CHECK(timelines.items.size() == 1 && timelines.items[0].kind == "timeline" &&
        timelines.items[0].updatedAt == "2026-11-02T00:00:00Z");
  CHECK(listOwnDocuments(server.client, "sketch").status == CloudListStatus::Refused);

  const auto sent = server.transport.sent();
  CHECK(!sent.empty());
  if (!sent.empty()) {
    CHECK(sent[0].method == "GET");
    CHECK(sent[0].url.find("/trpc/workflows.list?input=") != std::string::npos);
    CHECK(header(sent[0], "Authorization").starts_with("Bearer ntd_"));
  }
}

void followsTheWorkflowPages(TestContext& t) {
  ListServer server;
  int pages = 0;
  FakeTransport transport([&](const HttpRequest& r) {
    if (server.app.answer(r).status != 200) {
      return HttpResponse{401, "{}"};
    }
    ++pages;
    const bool first = r.url.find("cursor") == std::string::npos;
    return first ? HttpResponse{200, R"({"result":{"data":{"workflows":[{"id":"a","name":"A"}],"next":"c2"}}})"}
                 : HttpResponse{200, R"({"result":{"data":{"workflows":[{"id":"b","name":"B"}],"next":null}}})"};
  });
  CloudClient client(*server.app.session, transport);
  const CloudListing listing = listOwnDocuments(client, "workflow");
  CHECK(listing.status == CloudListStatus::Ok);
  CHECK(listing.items.size() == 2);
  CHECK(pages == 2);

  // A server that always names a next page is read at most kMaxListPages
  // times.
  int endless = 0;
  FakeTransport loop([&](const HttpRequest& r) {
    if (server.app.answer(r).status != 200) {
      return HttpResponse{401, "{}"};
    }
    ++endless;
    return HttpResponse{200, R"({"result":{"data":{"workflows":[],"next":"again"}}})"};
  });
  CloudClient looping(*server.app.session, loop);
  CHECK(listOwnDocuments(looping, "workflow").status == CloudListStatus::Ok);
  CHECK(endless == kMaxListPages);
}

void listsTheDocumentsSharedWithTheAccount(TestContext& t) {
  ListServer server;
  server.answers["workflows.sharing.sharedWithMe"] = {
      200, R"({"result":{"data":{"workflows":[{"id":"w9","name":"Theirs","updated_at":"2026-11-10T00:00:00Z",)"
           R"("shared_role":"viewer"}]}}})"};
  server.answers["documentSharing.sharedWithMe"] = {
      200, R"({"result":{"data":{"documents":[)"
           R"({"type":"storyboard","id":"s1","name":"Board","owner_id":"u2","role":"editor"},)"
           R"({"type":"timeline","id":"t9","name":"Edit","owner_id":"u2","role":"editor","updated_at":null}]}}})"};
  const CloudListing workflows = listSharedDocuments(server.client, "workflow");
  CHECK(workflows.status == CloudListStatus::Ok);
  CHECK(workflows.items.size() == 1 && workflows.items[0].role == "viewer");
  const CloudListing timelines = listSharedDocuments(server.client, "timeline");
  CHECK(timelines.status == CloudListStatus::Ok);
  // Only timelines open in the timeline app.
  CHECK(timelines.items.size() == 1);
  if (timelines.items.size() == 1) {
    CHECK(timelines.items[0].id == "t9");
    CHECK(timelines.items[0].ownerId == "u2");
    CHECK(timelines.items[0].role == "editor");
    CHECK(timelines.items[0].updatedAt.empty());
  }
  const auto sent = server.transport.sent();
  bool sentInput = false;
  for (const HttpRequest& r : sent) {
    if (r.url.find("documentSharing.sharedWithMe") != std::string::npos) {
      // The procedure takes no input.
      sentInput = sentInput || r.url.find('?') != std::string::npos;
    }
  }
  CHECK(!sentInput);
}

void listingSortsFailures(TestContext& t) {
  for (const auto& [status, expected] : std::vector<std::pair<int, CloudListStatus>>{
           {500, CloudListStatus::Offline},
           {503, CloudListStatus::Offline},
           {429, CloudListStatus::Offline},
           {0, CloudListStatus::Offline},
           {403, CloudListStatus::Refused},
           {200, CloudListStatus::Refused}}) {
    ListServer server;
    server.answers["timeline.list"] = {status, status == 200 ? "not json" : "{}"};
    const CloudListing listing = listOwnDocuments(server.client, "timeline");
    CHECK(listing.status == expected);
    CHECK(listing.items.empty());
  }
  ListServer refused;
  refused.answers["timeline.list"] = {403, R"({"error":{"json":{"data":{"apiCode":"FORBIDDEN"}}}})"};
  CHECK(listOwnDocuments(refused.client, "timeline").reason == "FORBIDDEN");

  // Signed out, nothing is sent.
  ListServer signedOut;
  signedOut.app.session->signOut();
  const std::size_t before = signedOut.transport.sent().size();
  CHECK(listOwnDocuments(signedOut.client, "workflow").status == CloudListStatus::SignedOut);
  CHECK(signedOut.transport.sent().size() == before);
}

// ── Sharing (FR52, FR67, SR6) ───────────────────────────────────────
void readsTheSharingOfEachKind(TestContext& t) {
  ListServer server;
  const std::string answer = R"({"result":{"data":{"json":{"collaborators":[],
    "shares":[
      {"id":"s1","token":"old","role":"viewer","disabled_at":"2026-11-01T00:00:00Z"},
      {"id":"s2","token":"tok","role":"viewer","options":{"allow_history":true,"allow_download":false,"allow_duplicate":true}},
      {"token":"no-id","role":"editor"}],
    "people":[{"user_id":"u1","display_name":"Ada","email":"ada@example.com",
      "access":{"role":"editor","options":{"allow_history":true,"allow_download":true,"allow_duplicate":true},
        "grants":[],"given_by":{"role":[],"allow_history":[],"allow_download":[],"allow_duplicate":[]}}}]}}}})";
  server.answers["workflows.sharing.get"] = {200, answer};
  server.answers["documentSharing.get"] = {200, answer};

  const SharingState workflow = readSharing(server.client, "workflow", "w1");
  CHECK(workflow.status == CloudListStatus::Ok);
  CHECK(workflow.links.size() == 2);
  CHECK(workflow.links[0].id == "s2");
  CHECK(!workflow.links[0].disabled);
  CHECK(workflow.links[0].options.history);
  CHECK(!workflow.links[0].options.download);
  CHECK(workflow.links[0].options.duplicate);
  CHECK(workflow.links[1].disabled);
  CHECK(workflow.people.size() == 1);
  CHECK(workflow.people[0].name == "Ada");
  CHECK(workflow.people[0].role == "editor");
  CHECK(workflow.people[0].options.download);
  CHECK(enabledLink(workflow, "viewer") == &workflow.links[0]);
  CHECK(enabledLink(workflow, "editor") == nullptr);

  const SharingState timeline = readSharing(server.client, "timeline", "t1");
  CHECK(timeline.status == CloudListStatus::Ok);
  const std::vector<HttpRequest> sent = server.transport.sent();
  bool sawWorkflow = false;
  bool sawTimeline = false;
  for (const HttpRequest& r : sent) {
    if (r.url.find("/trpc/workflows.sharing.get?input=") != std::string::npos) {
      sawWorkflow = true;
      CHECK(r.method == "GET");
    }
    if (r.url.find("/trpc/documentSharing.get?input=") != std::string::npos) {
      sawTimeline = true;
      CHECK(r.url.find("timeline") != std::string::npos);
    }
  }
  CHECK(sawWorkflow);
  CHECK(sawTimeline);

  // An unknown kind sends nothing.
  const std::size_t before = server.transport.sent().size();
  CHECK(readSharing(server.client, "folder", "f1").reason == "UNKNOWN_KIND");
  CHECK(server.transport.sent().size() == before);

  server.answers["documentSharing.get"] = {200, R"({"result":{"data":{"json":{"people":[]}}}})"};
  CHECK(readSharing(server.client, "script", "s1").reason == "INVALID_RESPONSE");
  server.answers["documentSharing.get"] = {403, R"({"error":{"json":{"data":{"apiCode":"FORBIDDEN"}}}})"};
  const SharingState refused = readSharing(server.client, "script", "s1");
  CHECK(refused.status == CloudListStatus::Refused);
  CHECK(refused.reason == "FORBIDDEN");
}

void changesLinksWithMutations(TestContext& t) {
  ListServer server;
  server.answers["documentSharing.createLink"] = {200,
                                                  R"({"result":{"data":{"json":{"id":"s9","token":"abc","role":"editor"}}}})"};
  server.answers["documentSharing.revokeLink"] = {200, R"({"result":{"data":{"json":{"ok":true}}}})"};
  server.answers["workflows.sharing.setLinkOptions"] = {
      200, R"({"result":{"data":{"json":{"id":"s3","token":"x","role":"viewer",
        "options":{"allow_history":false,"allow_download":true,"allow_duplicate":false}}}}})"};

  const ShareChange created = createLink(server.client, "storyboard", "b1", "editor");
  CHECK(created.status == CloudListStatus::Ok);
  CHECK(created.link.id == "s9");
  CHECK(created.link.token == "abc");
  CHECK(disableLink(server.client, "storyboard", "b1", "s9").status == CloudListStatus::Ok);
  const ShareChange options = setLinkOptions(server.client, "workflow", "w1", "s3", {false, true, false});
  CHECK(options.status == CloudListStatus::Ok);
  CHECK(options.link.options.download);

  std::map<std::string, nlohmann::json> bodies;
  for (const HttpRequest& r : server.transport.sent()) {
    const std::string prefix = std::string(kServer) + "/trpc/";
    if (r.method == "POST" && r.url.rfind(prefix, 0) == 0) {
      bodies[r.url.substr(prefix.size())] = nlohmann::json::parse(r.body);
    }
  }
  CHECK(bodies["documentSharing.createLink"] ==
        nlohmann::json({{"type", "storyboard"}, {"id", "b1"}, {"role", "editor"}}));
  CHECK(bodies["documentSharing.revokeLink"] ==
        nlohmann::json({{"type", "storyboard"}, {"id", "b1"}, {"share_id", "s9"}}));
  CHECK(bodies["workflows.sharing.setLinkOptions"] ==
        nlohmann::json({{"id", "w1"},
                        {"share_id", "s3"},
                        {"options", {{"allow_history", false}, {"allow_download", true}, {"allow_duplicate", false}}}}));

  server.answers["documentSharing.setRole"] = {200, R"({"result":{"data":{"json":{"user_id":"u1"}}}})"};
  server.answers["documentSharing.removeCollaborator"] = {200, R"({"result":{"data":{"json":{"ok":true}}}})"};
  CHECK(setPersonRole(server.client, "script", "s1", "u1", "viewer").status == CloudListStatus::Ok);
  CHECK(removePerson(server.client, "script", "s1", "u1").status == CloudListStatus::Ok);
  bodies.clear();
  for (const HttpRequest& r : server.transport.sent()) {
    const std::string prefix = std::string(kServer) + "/trpc/";
    if (r.method == "POST" && r.url.rfind(prefix, 0) == 0) {
      bodies[r.url.substr(prefix.size())] = nlohmann::json::parse(r.body);
    }
  }
  CHECK(bodies["documentSharing.setRole"] ==
        nlohmann::json({{"type", "script"}, {"id", "s1"}, {"user_id", "u1"}, {"role", "viewer"}}));
  CHECK(bodies["documentSharing.removeCollaborator"] ==
        nlohmann::json({{"type", "script"}, {"id", "s1"}, {"user_id", "u1"}}));

  // A link without an id is not a link.
  server.answers["documentSharing.createLink"] = {200, R"({"result":{"data":{"json":{"token":"abc"}}}})"};
  CHECK(createLink(server.client, "script", "s1", "viewer").reason == "INVALID_RESPONSE");
}

void shareUrlsMatchTheWebRoutes(TestContext& t) {
  CHECK(shareUrl(kServer, "workflow", "tok", "viewer") == "https://nt.example/share/tok");
  CHECK(shareUrl(kServer, "workflow", "tok", "public") == "https://nt.example/view/tok");
  CHECK(shareUrl(kServer, "timeline", "tok", "editor") == "https://nt.example/share/document/tok");
}

void statesWhatALinkGives(TestContext& t) {
  CHECK(linkStatement("viewer", {}) ==
        "Anyone signed in who opens this link can view the current version of the document. They cannot read its "
        "history, download its files or make a copy.");
  CHECK(linkStatement("viewer", {true, false, false}) ==
        "Anyone signed in who opens this link can view the current version of the document. They can also read its "
        "history.");
  CHECK(linkStatement("viewer", {true, true, true}) ==
        "Anyone signed in who opens this link can view the current version of the document. They can also read its "
        "history, download its files and make their own copy. Downloaded files and copies cannot be taken back.");
  CHECK(linkStatement("editor", {}).find("edit") != std::string::npos);
  CHECK(linkStatement("public", {}).find("without signing in") != std::string::npos);
}

void findsTheDocumentsATimelineLinksTo(TestContext& t) {
  const std::string timeline = R"({"clips":[
      {"id":"c1","scriptId":"sc1"},
      {"id":"c2","storyboardBoardId":"b1"},
      {"id":"c3","scriptId":"sc1","storyboardBoardId":"b2"},
      {"id":"c4"}],
    "storyboardMaterializations":[{"boardId":"b1"},{"boardId":"b3"}]})";
  const std::vector<LinkedDocument> linked = linkedDocuments("timeline", timeline);
  CHECK(linked.size() == 4);
  if (linked.size() == 4) {
    CHECK(linked[0].kind == "script");
    CHECK(linked[0].id == "sc1");
    CHECK(linked[1].kind == "storyboard");
    CHECK(linked[1].id == "b1");
    CHECK(linked[2].id == "b2");
    CHECK(linked[3].id == "b3");
  }
  CHECK(linkedDocuments("workflow", timeline).empty());
  CHECK(linkedDocuments("timeline", "not json").empty());
}

void warnsOfValuesThatLookLikeSecrets(TestContext& t) {
  const std::string workflow = R"({"graph":{"nodes":[
      {"id":"n1","type":"openai.Chat","data":{"prompt":"hello","api_key":"sk-proj-abcdefghijklmnopqrstuvwx"}},
      {"id":"n2","type":"http.Get","data":{"headers":{"Authorization":"Bearer abcdefghijklmnopqrstuvwxyz012345"}}},
      {"id":"n3","type":"db.Query","data":{"password":"hunter2hunter2hunter2"}},
      {"id":"n4","type":"text.Note","data":{"text":"the password is in the vault, ask the team"}},
      {"id":"n5","type":"text.Note","data":{"text":"short","token_count":"512"}}]}})";
  const std::vector<SecretFinding> found = findSecretLike("workflow", workflow);
  CHECK(found.size() == 3);
  if (found.size() == 3) {
    CHECK(found[0].place == "node n1 (openai.Chat), property api_key");
    CHECK(found[0].looksLike == "an OpenAI key");
    CHECK(found[1].place == "node n2 (http.Get), property headers.Authorization");
    CHECK(found[1].looksLike == "a bearer token");
    CHECK(found[2].looksLike == "a key or password");
  }
  for (const SecretFinding& f : found) {
    CHECK(f.place.find("sk-proj") == std::string::npos);
  }

  const std::vector<SecretFinding> inTimeline =
      findSecretLike("timeline", R"({"clips":[{"id":"c1","prompt":"AKIAABCDEFGHIJKLMNOP"}]})");
  CHECK(inTimeline.size() == 1);
  if (!inTimeline.empty()) {
    CHECK(inTimeline[0].place == "clips[0].prompt");
    CHECK(inTimeline[0].looksLike == "an AWS access key");
  }
  CHECK(findSecretLike("script", "{\"text\":\"A normal script\"}").empty());
  CHECK(findSecretLike("script", "not json").empty());

  // Each shape, and its near miss.
  const auto shapeOf = [](const std::string& value) {
    const auto found = findSecretLike("script", nlohmann::json{{"text", value}}.dump());
    return found.empty() ? std::string() : found[0].looksLike;
  };
  CHECK(shapeOf("x sk-ant-" + std::string(20, 'a')) == "an Anthropic key");
  CHECK(shapeOf("sk-" + std::string(19, 'a')).empty());
  CHECK(shapeOf("AKIA" + std::string(15, 'A')).empty());
  CHECK(shapeOf("ghp_" + std::string(36, 'a')) == "a GitHub token");
  CHECK(shapeOf("ghx_" + std::string(36, 'a')).empty());
  CHECK(shapeOf("xoxb-0123456789") == "a Slack token");
  CHECK(shapeOf("AIza" + std::string(35, '_')) == "a Google API key");
  CHECK(shapeOf("hf_" + std::string(30, 'a')) == "a Hugging Face token");
  CHECK(shapeOf("r8_" + std::string(29, 'a')).empty());
  CHECK(shapeOf("-----BEGIN RSA PRIVATE KEY-----\nabc") == "a private key");
  CHECK(shapeOf("-----BEGIN PRIVATE KEY-----") == "a private key");
  CHECK(shapeOf("-----BEGIN PUBLIC KEY-----").empty());
  CHECK(shapeOf("BEARER abcdefghijklmnopqrst") == "a bearer token");

  // A long value is scanned without recursion: std::regex overflowed the
  // stack on this one (#7672 review).
  CHECK(shapeOf("sk-proj-" + std::string(100000, 'a')) == "an OpenAI key");
  CHECK(shapeOf(std::string(200000, 's') + "k-").empty());
}

} // namespace

int main() {
  return account_test::runTests({
      {"parsesTokenResponses", parsesTokenResponses},
      {"postsTheNativeForms", postsTheNativeForms},
      {"endSessionNeedsA200", endSessionNeedsA200},
      {"tokenEndpointNeedsHttps", tokenEndpointNeedsHttps},
      {"canonicalOrigins", canonicalOrigins},
      {"attachesTheCredential", attachesTheCredential},
      {"neverSendsToAnotherHost", neverSendsToAnotherHost},
      {"neverSendsOverPlainHttp", neverSendsOverPlainHttp},
      {"refusesATokenEndpointOfAnotherServer", refusesATokenEndpointOfAnotherServer},
      {"a401ForcesARefresh", a401ForcesARefresh},
      {"signOutCancelsARequestInFlight", signOutCancelsARequestInFlight},
      {"sendsNothingWhenSignedOut", sendsNothingWhenSignedOut},
      {"renewsOnceAfterA401", renewsOnceAfterA401},
      {"reportsAPersistent401", reportsAPersistent401},
      {"offlineWhenNoAnswer", offlineWhenNoAnswer},
      {"callsTheLocalStoreProcedures", callsTheLocalStoreProcedures},
      {"ownedLocalStoreCallsTheServer", ownedLocalStoreCallsTheServer},
      {"savedOnlyAfterAcceptance", savedOnlyAfterAcceptance},
      {"writesWithin750msWhileTyping", writesWithin750msWhileTyping},
      {"tc9DiskFull", tc9DiskFull},
      {"notSavedWhileTheAcceptanceIsUnrecorded", notSavedWhileTheAcceptanceIsUnrecorded},
      {"keepsEditsMadeDuringASend", keepsEditsMadeDuringASend},
      {"refusedSaveBecomesUnsent", refusedSaveBecomesUnsent},
      {"retriesWhileOfflineOrSignedOut", retriesWhileOfflineOrSignedOut},
      {"editsFromAnotherThread", editsFromAnotherThread},
      {"slowCloudDoesNotDelayLocalWrites", slowCloudDoesNotDelayLocalWrites},
      {"flushWritesAtOnce", flushWritesAtOnce},
      {"aFailedLocalRecordIsNotSentAgain", aFailedLocalRecordIsNotSentAgain},
      {"aRefusalIsShownOnlyOnceStored", aRefusalIsShownOnlyOnceStored},
      {"resumesAStoredDraft", resumesAStoredDraft},
      {"countsTheChangesWaiting", countsTheChangesWaiting},
      {"listsTheAccountsOwnDocuments", listsTheAccountsOwnDocuments},
      {"followsTheWorkflowPages", followsTheWorkflowPages},
      {"listsTheDocumentsSharedWithTheAccount", listsTheDocumentsSharedWithTheAccount},
      {"listingSortsFailures", listingSortsFailures},
      {"readsTheSharingOfEachKind", readsTheSharingOfEachKind},
      {"changesLinksWithMutations", changesLinksWithMutations},
      {"shareUrlsMatchTheWebRoutes", shareUrlsMatchTheWebRoutes},
      {"statesWhatALinkGives", statesWhatALinkGives},
      {"findsTheDocumentsATimelineLinksTo", findsTheDocumentsATimelineLinksTo},
      {"warnsOfValuesThatLookLikeSecrets", warnsOfValuesThatLookLikeSecrets},
      {"oneInstancePerOpenDocument", oneInstancePerOpenDocument},
      {"workflowSaverSendsTheGraph", workflowSaverSendsTheGraph},
      {"workflowSaverSendsTheName", workflowSaverSendsTheName},
      {"timelineSaverSendsTheDocument", timelineSaverSendsTheDocument},
      {"timelineSaverSendsTheSequenceColumns", timelineSaverSendsTheSequenceColumns},
      {"saveWithoutBaseIsRefused", saveWithoutBaseIsRefused},
      {"saverRefusesAnotherAccountsDraft", saverRefusesAnotherAccountsDraft},
      {"conflictIsSentAgainOnTheLatestRevision", conflictIsSentAgainOnTheLatestRevision},
      {"saverSortsRetryableFailures", saverSortsRetryableFailures},
      {"saverReadsTheCapabilities", saverReadsTheCapabilities},
      {"openChecksTheDocumentSchema", openChecksTheDocumentSchema},
      {"saverReportsTheServersCode", saverReportsTheServersCode},
      {"saverRefusesAnUnreadableDraft", saverRefusesAnUnreadableDraft},
      {"saverSignedOutAndOffline", saverSignedOutAndOffline},
  });
}
