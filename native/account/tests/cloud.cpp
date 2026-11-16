// The request layer and the saved-state rule (WP1.10): HttpTokenEndpoint
// against canned responses, CloudClient against the fake token server, the
// local store client against a fake bundled server, and CloudDocumentSaver
// with TC9 (the disk fills while editing) and edits made during a send.
#include "nodetool/account/cloud_client.h"
#include "nodetool/account/cloud_drafts.h"
#include "nodetool/account/cloud_savers.h"
#include "nodetool/account/crypto.h"
#include "nodetool/account/http_token_endpoint.h"
#include "nodetool/account/origin.h"
#include "test_support.h"

#include <nlohmann/json.hpp>

#include <atomic>
#include <condition_variable>
#include <functional>
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

const CloudDocumentKey kWorkflowKey{"0123456789abcdef", "u1", "workflow", "w1"};
const CloudDocumentKey kTimelineKey{"0123456789abcdef", "u1", "timeline", "t1"};
const std::string kInstance(32, 'a');

// A cloud server that answers each signed-in POST with `reply`.
struct SaverServer {
  SignedInApp app;
  std::function<HttpResponse(const nlohmann::json&)> reply;
  FakeTransport transport{[this](const HttpRequest& r) {
    if (app.answer(r).status != 200) {
      return HttpResponse{401, "{}"};
    }
    return reply(nlohmann::json::parse(r.body));
  }};
  CloudClient client{*app.session, transport};
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
  const auto sent = server.transport.sent();
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
  const auto sent = server.transport.sent();
  CHECK(sent.size() == 1);
  if (!sent.empty()) {
    CHECK(sent[0].url == std::string(kServer) + "/trpc/timeline.update");
    const nlohmann::json body = nlohmann::json::parse(sent[0].body);
    CHECK(body["baseUpdatedAt"] == "r1");
    CHECK(body["document"]["tracks"].is_array());
    CHECK(body["editingInstance"] == kInstance);
    CHECK(body["schemaVersion"] == kTimelineSchemaVersion);
  }
}

// The first save of a document has no base, and sends none.
void firstSaveSendsNoBase(TestContext& t) {
  SaverServer server;
  server.reply = [](const nlohmann::json&) {
    return HttpResponse{200, R"({"result":{"data":{"updatedAt":"r1"}}})"};
  };
  TimelineCloudSaver saver(server.client);
  CHECK(saver.save(kTimelineKey, kInstance, {}, "{}").status == SaveStatus::Ok);
  const auto sent = server.transport.sent();
  CHECK(sent.size() == 1 && !nlohmann::json::parse(sent[0].body).contains("baseUpdatedAt"));
}

void saverReportsTheServersCode(TestContext& t) {
  SaverServer server;
  server.reply = [](const nlohmann::json&) {
    return HttpResponse{409, R"({"error":{"json":{"message":"x","data":{"code":"CONFLICT","httpStatus":409,"apiCode":"SCHEMA_DOWNGRADE"}}}})"};
  };
  WorkflowCloudSaver saver(server.client);
  const SaveResult refused = saver.save(kWorkflowKey, kInstance, {}, R"({"nodes":[],"edges":[]})");
  CHECK(refused.status == SaveStatus::Refused);
  CHECK(refused.reason == "SCHEMA_DOWNGRADE");

  server.reply = [](const nlohmann::json&) { return HttpResponse{403, "not json"}; };
  const SaveResult bare = saver.save(kWorkflowKey, kInstance, {}, R"({"nodes":[],"edges":[]})");
  CHECK(bare.status == SaveStatus::Refused);
  CHECK(bare.reason == "HTTP_403");

  // A server failure may pass, so the draft is sent again later.
  server.reply = [](const nlohmann::json&) { return HttpResponse{503, ""}; };
  CHECK(saver.save(kWorkflowKey, kInstance, {}, R"({"nodes":[],"edges":[]})").status == SaveStatus::Offline);

  // An answer without the new revision cannot be recorded as saved.
  server.reply = [](const nlohmann::json&) { return HttpResponse{200, R"({"result":{"data":{}}})"}; };
  const SaveResult unread = saver.save(kWorkflowKey, kInstance, {}, R"({"nodes":[],"edges":[]})");
  CHECK(unread.status == SaveStatus::Refused);
  CHECK(unread.reason == "INVALID_RESPONSE");
}

void saverRefusesAnUnreadableDraft(TestContext& t) {
  SaverServer server;
  server.reply = [](const nlohmann::json&) { return HttpResponse{200, "{}"}; };
  WorkflowCloudSaver saver(server.client);
  for (const std::string draft : {"not json", "[]", R"({"nodes":[]})", R"({"nodes":{},"edges":[]})"}) {
    const SaveResult result = saver.save(kWorkflowKey, kInstance, {}, draft);
    CHECK(result.status == SaveStatus::Refused);
    CHECK(result.reason == "INVALID_DRAFT");
  }
  CHECK(server.transport.sent().empty());
}

void saverSignedOutAndOffline(TestContext& t) {
  {
    SaverServer server;
    server.reply = [](const nlohmann::json&) { return HttpResponse{200, "{}"}; };
    server.app.session->signOut();
    TimelineCloudSaver saver(server.client);
    CHECK(saver.save(kTimelineKey, kInstance, {}, "{}").status == SaveStatus::SignedOut);
    CHECK(server.transport.sent().empty());
  }
  {
    SaverServer server;
    server.reply = [](const nlohmann::json&) { return HttpResponse{0, ""}; };
    TimelineCloudSaver saver(server.client);
    CHECK(saver.save(kTimelineKey, kInstance, {}, "{}").status == SaveStatus::Offline);
  }
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
      {"savedOnlyAfterAcceptance", savedOnlyAfterAcceptance},
      {"writesWithin750msWhileTyping", writesWithin750msWhileTyping},
      {"tc9DiskFull", tc9DiskFull},
      {"notSavedWhileTheAcceptanceIsUnrecorded", notSavedWhileTheAcceptanceIsUnrecorded},
      {"keepsEditsMadeDuringASend", keepsEditsMadeDuringASend},
      {"refusedSaveBecomesUnsent", refusedSaveBecomesUnsent},
      {"retriesWhileOfflineOrSignedOut", retriesWhileOfflineOrSignedOut},
      {"editsFromAnotherThread", editsFromAnotherThread},
      {"slowCloudDoesNotDelayLocalWrites", slowCloudDoesNotDelayLocalWrites},
      {"aFailedLocalRecordIsNotSentAgain", aFailedLocalRecordIsNotSentAgain},
      {"aRefusalIsShownOnlyOnceStored", aRefusalIsShownOnlyOnceStored},
      {"resumesAStoredDraft", resumesAStoredDraft},
      {"oneInstancePerOpenDocument", oneInstancePerOpenDocument},
      {"workflowSaverSendsTheGraph", workflowSaverSendsTheGraph},
      {"timelineSaverSendsTheDocument", timelineSaverSendsTheDocument},
      {"firstSaveSendsNoBase", firstSaveSendsNoBase},
      {"saverReportsTheServersCode", saverReportsTheServersCode},
      {"saverRefusesAnUnreadableDraft", saverRefusesAnUnreadableDraft},
      {"saverSignedOutAndOffline", saverSignedOutAndOffline},
  });
}
