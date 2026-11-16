// The request layer and the saved-state rule (WP1.10): HttpTokenEndpoint
// against canned responses, CloudClient against the fake token server, the
// local store client against a fake bundled server, and CloudDocumentSaver
// with TC9 (the disk fills while editing) and edits made during a send.
#include "nodetool/account/cloud_client.h"
#include "nodetool/account/cloud_drafts.h"
#include "nodetool/account/cloud_savers.h"
#include "nodetool/account/crypto.h"
#include "nodetool/account/http_token_endpoint.h"
#include "test_support.h"

#include <nlohmann/json.hpp>

#include <atomic>
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

// ── CloudClient ─────────────────────────────────────────────────────

struct SignedInApp {
  TempDir data;
  MemorySecretStore keychain;
  FakeClock clock;
  FakeTokenServer server{clock};
  std::unique_ptr<AccountSession> session;

  SignedInApp() {
    AccountSessionOptions options;
    options.dataDir = data.path();
    options.serverOrigin = kServer;
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
  CloudClient client(*app.session, transport, kServer);
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
  CloudClient client(*app.session, transport, kServer);
  for (const std::string url : {"https://nt.example.evil.test/api", "https://other.example/api", "http://nt.example/api",
                                "https://nt.example:8443/api", "https://nt.exampleX"}) {
    HttpRequest request;
    request.url = url;
    CHECK(client.send(request).status == CloudSendStatus::WrongServer);
  }
  CHECK(transport.sent().empty());
  HttpRequest same;
  same.url = "HTTPS://NT.EXAMPLE?x=1";
  CHECK(client.send(same).status == CloudSendStatus::Sent);
}

void sendsNothingWhenSignedOut(TestContext& t) {
  SignedInApp app;
  FakeTransport transport([&](const HttpRequest& r) { return app.answer(r); });
  CloudClient client(*app.session, transport, kServer);
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
  CloudClient client(*app.session, transport, kServer);
  HttpRequest request;
  request.url = std::string(kServer) + "/api/workflows";
  const CloudSendResult result = client.send(request);
  CHECK(result.status == CloudSendStatus::Sent);
  CHECK(result.response.status == 200);
  CHECK(calls == 2);
  CHECK(app.server.refreshCalls == 1);
}

// A 401 that a refresh cannot change is reported, not retried in a loop.
void reportsAPersistent401(TestContext& t) {
  SignedInApp app;
  FakeTransport transport([](const HttpRequest&) { return HttpResponse{401, "{}"}; });
  CloudClient client(*app.session, transport, kServer);
  HttpRequest request;
  request.url = std::string(kServer) + "/api/workflows";
  const CloudSendResult result = client.send(request);
  CHECK(result.status == CloudSendStatus::Sent);
  CHECK(result.response.status == 401);
  CHECK(transport.sent().size() == 1);
}

void offlineWhenNoAnswer(TestContext& t) {
  SignedInApp app;
  FakeTransport transport([](const HttpRequest&) { return HttpResponse{0, ""}; });
  CloudClient client(*app.session, transport, kServer);
  HttpRequest request;
  request.url = std::string(kServer) + "/api/workflows";
  CHECK(client.send(request).status == CloudSendStatus::Offline);
}

// ── LocalServerDraftStore ───────────────────────────────────────────

const CloudDocumentKey kKey{"a1b2c3d4e5f60718", "account-a", "workflow", "doc-1"};

void callsTheLocalStoreProcedures(TestContext& t) {
  FakeTransport transport([](const HttpRequest& request) {
    if (request.url.ends_with("cloudLocal.drafts.put")) {
      return HttpResponse{200, R"({"result":{"data":{"revision":3}}})"};
    }
    if (request.url.ends_with("cloudLocal.drafts.accept")) {
      return HttpResponse{200, R"({"result":{"data":{"json":{"outcome":"rebased"}}}})"};
    }
    return HttpResponse{500, R"({"error":{"message":"disk I/O error"}})"};
  });
  LocalServerDraftStore store(transport, "http://127.0.0.1:7777", {{"Authorization", "Bearer local"}});
  CHECK(store.put(kKey, {"2026-11-16T10:00:00.000Z", "h0"}, R"({"nodes":[]})") == std::optional<int64_t>(3));
  CHECK(store.accept(kKey, 3, {"t1", "h1"}, "owner", {}) == std::optional<AcceptOutcome>(AcceptOutcome::Rebased));
  CHECK(!store.markUnsent(kKey, 3, "FILE_NOT_READABLE"));

  const auto sent = transport.sent();
  CHECK(sent.size() == 3);
  if (!sent.empty()) {
    CHECK(sent[0].url == "http://127.0.0.1:7777/trpc/cloudLocal.drafts.put");
    CHECK(header(sent[0], "Authorization") == "Bearer local");
    const nlohmann::json body = nlohmann::json::parse(sent[0].body);
    CHECK(body["server_key"] == "a1b2c3d4e5f60718");
    CHECK(body["account_id"] == "account-a");
    CHECK(body["document_id"] == "doc-1");
    CHECK(body["base"]["content_hash"] == "h0");
    CHECK(body["draft"] == R"({"nodes":[]})");
  }
}

// ── CloudDocumentSaver ──────────────────────────────────────────────

// Thread affinity: thread-safe. `mutex_` guards every field.
class FakeDraftStore final : public DraftStore {
public:
  std::optional<int64_t> put(const CloudDocumentKey&, const CloudBase& base, const std::string& draft) override {
    const std::lock_guard lock(mutex_);
    if (full) {
      return std::nullopt;
    }
    ++revision_;
    row_ = draft;
    rowBase_ = base;
    puts_.push_back(draft);
    return revision_;
  }
  std::optional<AcceptOutcome> accept(const CloudDocumentKey&, int64_t revision, const CloudBase& base,
                                      const std::string&, const CloudDocumentOptions&) override {
    const std::lock_guard lock(mutex_);
    if (full || failAccept) {
      return std::nullopt;
    }
    if (!row_) {
      return AcceptOutcome::NoDraft;
    }
    if (revision == revision_) {
      row_.reset();
      return AcceptOutcome::Deleted;
    }
    rowBase_ = base;
    return AcceptOutcome::Rebased;
  }
  bool markUnsent(const CloudDocumentKey&, int64_t, const std::string& reason) override {
    const std::lock_guard lock(mutex_);
    unsentReason_ = reason;
    return true;
  }

  std::optional<std::string> row() {
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

  std::atomic<bool> full{false};
  std::atomic<bool> failAccept{false};

private:
  std::mutex mutex_;
  int64_t revision_ = 0;
  std::optional<std::string> row_;
  CloudBase rowBase_;
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

void savedOnlyAfterAcceptance(TestContext& t) {
  FakeDraftStore store;
  FakeCloud cloud;
  CloudDocumentSaver saver(store, cloud, kKey, {"t0", "h0"});
  CHECK(saver.state().status == DocumentStatus::SavedToCloud);
  saver.edit("v1", 1000);
  CHECK(saver.state().status == DocumentStatus::ChangesWaiting);
  CHECK(saver.state().unstoredEdits);
  saver.tick(1100);
  // Not idle long enough yet: nothing written.
  CHECK(store.puts().empty());
  saver.tick(1200);
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
        saver.tick(now);
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
    saver.tick(now);
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
    saver.tick(now);
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
  saver.tick(300);
  CHECK(saver.state().status == DocumentStatus::NotSaving);
  // An offline cloud does not hide the local failure.
  cloud.status = SaveStatus::Offline;
  saver.tick(2300);
  CHECK(saver.state().status == DocumentStatus::NotSaving);
  cloud.status = SaveStatus::Ok;
  store.failAccept = false;
  saver.tick(8000);
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
  saver.tick(300);
  CHECK(saver.state().status == DocumentStatus::ChangesWaiting);
  CHECK(saver.state().unstoredEdits);
  saver.tick(600);
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
  saver.tick(300);
  CHECK(saver.state().status == DocumentStatus::Unsent);
  CHECK(saver.state().refusal == "FILE_NOT_READABLE");
  CHECK(store.unsentReason() == "FILE_NOT_READABLE");
  CHECK(store.row() == std::optional<std::string>("v1"));
  // No retry of a refused save.
  saver.tick(10'000);
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
  saver.tick(300);
  CHECK(saver.state().status == DocumentStatus::Offline);
  saver.tick(1000);
  CHECK(cloud.saves().size() == 1);
  cloud.status = SaveStatus::SignedOut;
  saver.tick(300 + kSendRetryMs);
  CHECK(saver.state().status == DocumentStatus::SignedOut);
  CHECK(store.row() == std::optional<std::string>("v1"));
  cloud.status = SaveStatus::Ok;
  saver.tick(300 + 2 * kSendRetryMs);
  CHECK(saver.state().status == DocumentStatus::SavedToCloud);
}

// The UI thread edits while the worker ticks. Run under ThreadSanitizer.
void editsFromAnotherThread(TestContext& t) {
  FakeDraftStore store;
  FakeCloud cloud;
  CloudDocumentSaver saver(store, cloud, kKey, {"t0", "h0"});
  std::atomic<int64_t> now{0};
  std::atomic<bool> stop{false};
  std::thread worker([&] {
    while (!stop) {
      saver.tick(now.load());
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
  worker.join();
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
  first.tick(300);
  first.edit("v2", 400);
  first.tick(700);
  CloudDocumentSaver second(store, cloud, kKey, {"t2", "h2"});
  second.edit("v3", 800);
  second.tick(1100);
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
  CloudClient client{*app.session, transport, kServer};
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

} // namespace

int main() {
  return account_test::runTests({
      {"parsesTokenResponses", parsesTokenResponses},
      {"postsTheNativeForms", postsTheNativeForms},
      {"endSessionNeedsA200", endSessionNeedsA200},
      {"attachesTheCredential", attachesTheCredential},
      {"neverSendsToAnotherHost", neverSendsToAnotherHost},
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
      {"oneInstancePerOpenDocument", oneInstancePerOpenDocument},
      {"workflowSaverSendsTheGraph", workflowSaverSendsTheGraph},
      {"timelineSaverSendsTheDocument", timelineSaverSendsTheDocument},
      {"firstSaveSendsNoBase", firstSaveSendsNoBase},
      {"saverReportsTheServersCode", saverReportsTheServersCode},
      {"saverRefusesAnUnreadableDraft", saverRefusesAnUnreadableDraft},
      {"saverSignedOutAndOffline", saverSignedOutAndOffline},
  });
}
