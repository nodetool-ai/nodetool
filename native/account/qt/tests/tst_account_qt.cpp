// The Qt half of the account service. QtHttpTransport runs against a local
// HTTP server on its own thread. Two AccountControllers on one data folder
// and one in-memory keychain stand in for the two apps, against the fake
// token server.
#include "nodetool/account/account_session.h"
#include "nodetool/account/accounts_index.h"
#include "nodetool/account/crypto.h"
#include "nodetool/account/cloud_drafts.h"
#include "nodetool/account/qt/AccountController.h"
#include "nodetool/account/qt/AccountServers.h"
#include "nodetool/account/qt/CloudBrowser.h"
#include "nodetool/account/qt/CloudDocument.h"
#include "nodetool/account/qt/QtHttpTransport.h"
#include "nodetool/account/qt/ServerToken.h"
#include "nodetool/account/qt/ShareController.h"
#include "nodetool/account/qt/TransferController.h"
#include "test_support.h"

#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QSignalSpy>
#include <QTcpServer>
#include <QTcpSocket>
#include <QTest>
#include <QUrlQuery>

#include <nlohmann/json.hpp>

#include <atomic>
#include <map>
#include <chrono>
#include <condition_variable>
#include <deque>
#include <future>
#include <mutex>
#include <vector>
#include <thread>

using namespace nodetool::account;
using namespace nodetool::account::qt;

namespace {

constexpr const char* kServer = "https://nt.example";
// The app's bundled server, where a transfer runs.
constexpr const char* kLocalServer = "http://127.0.0.1:7777";

// A local HTTP server that answers every request with one canned response,
// and records the last request's head. An empty response never answers. A
// server with a drip interval sends the response one byte per interval.
//
// Thread affinity: thread-safe. The QTcpServer and its sockets live on the
// server's own std::thread and use Qt's blocking calls, so nothing crosses
// threads through Qt's event queue. `mutex_` guards the record.
class CannedServer {
public:
  explicit CannedServer(QByteArray response, std::chrono::milliseconds drip = {})
      : response_(std::move(response)), drip_(drip) {
    std::promise<quint16> ready;
    auto port = ready.get_future();
    thread_ = std::thread([this, &ready] { run(ready); });
    port_ = port.get();
  }
  CannedServer(const CannedServer&) = delete;
  CannedServer& operator=(const CannedServer&) = delete;
  ~CannedServer() {
    stopping_ = true;
    thread_.join();
  }
  quint16 port() const { return port_; }
  QByteArray lastHead() {
    const std::lock_guard lock(mutex_);
    return lastHead_;
  }
  int requests() {
    const std::lock_guard lock(mutex_);
    return requests_;
  }

private:
  void run(std::promise<quint16>& ready) {
    QTcpServer server;
    server.listen(QHostAddress::LocalHost);
    ready.set_value(server.serverPort());
    std::vector<std::unique_ptr<QTcpSocket>> open;
    while (!stopping_) {
      if (!server.waitForNewConnection(20)) {
        continue;
      }
      std::unique_ptr<QTcpSocket> socket(server.nextPendingConnection());
      // The server parents its sockets. This scope owns it instead.
      socket->setParent(nullptr);
      QByteArray buffer;
      while (!stopping_ && buffer.indexOf("\r\n\r\n") < 0) {
        if (socket->waitForReadyRead(20)) {
          buffer += socket->readAll();
        }
      }
      {
        const std::lock_guard lock(mutex_);
        lastHead_ = buffer.left(buffer.indexOf("\r\n\r\n"));
        ++requests_;
      }
      if (response_.isEmpty()) {
        // Hold the connection open and never answer.
        open.push_back(std::move(socket));
        continue;
      }
      if (drip_.count() > 0) {
        for (qsizetype i = 0; i < response_.size() && !stopping_; ++i) {
          socket->write(response_.mid(i, 1));
          socket->waitForBytesWritten(1000);
          std::this_thread::sleep_for(drip_);
        }
      } else {
        socket->write(response_);
        socket->waitForBytesWritten(1000);
      }
      socket->disconnectFromHost();
      if (socket->state() != QAbstractSocket::UnconnectedState) {
        socket->waitForDisconnected(1000);
      }
    }
  }

  const QByteArray response_;
  const std::chrono::milliseconds drip_;
  std::atomic<bool> stopping_{false};
  quint16 port_ = 0;
  std::mutex mutex_;
  QByteArray lastHead_;
  int requests_ = 0;
  // Declared last, so it starts after the members it reads.
  std::thread thread_;
};

HttpResponse sendOffThread(const HttpRequest& request) {
  HttpResponse response;
  std::thread([&] { response = QtHttpTransport().send(request); }).join();
  return response;
}

// Store and endpoint wrappers, so two controllers share one keychain and
// one token server as two apps on a computer do.
//
// Thread affinity: thread-safe, as the wrapped object.
class SharedStore final : public SecretStore {
public:
  explicit SharedStore(MemorySecretStore& store) : store_(store) {}
  bool available() const override { return true; }
  std::optional<std::string> read(std::string_view s, std::string_view a) override { return store_.read(s, a); }
  bool write(std::string_view s, std::string_view a, std::string_view v) override { return store_.write(s, a, v); }
  void remove(std::string_view s, std::string_view a) override { store_.remove(s, a); }

private:
  MemorySecretStore& store_;
};

class SharedEndpoint final : public TokenEndpoint {
public:
  explicit SharedEndpoint(TokenEndpoint& endpoint) : endpoint_(endpoint) {}
  TokenResult exchangeCode(const CodeExchange& e) override { return endpoint_.exchangeCode(e); }
  TokenResult refresh(std::string_view t) override { return endpoint_.refresh(t); }
  EndSessionStatus endSession(std::string_view h) override { return endpoint_.endSession(h); }

private:
  TokenEndpoint& endpoint_;
};

struct Computer {
  account_test::TempDir data;
  MemorySecretStore keychain;
  account_test::FakeClock clock;
  account_test::FakeTokenServer server{clock};
  ManagedPolicy policy;

  AccountServices services(const std::string& name, const std::string& origin = kServer) {
    AccountServices services;
    services.dataDir = data.path();
    services.serverOrigin = origin;
    services.app = name;
    services.store = std::make_unique<SharedStore>(keychain);
    services.endpoint = std::make_unique<SharedEndpoint>(server);
    services.policy = [this] { return policy; };
    services.nowMs = clock.fn();
    services.signInTimeout = std::chrono::seconds(10);
    return services;
  }

  std::unique_ptr<AccountController> app(const std::string& name) {
    return std::make_unique<AccountController>(services(name));
  }
};

// Plays the browser: sends the code to the loopback redirect the authorize
// URL names.
void completeInBrowser(const QUrl& authorize, const QString& code) {
  const QUrlQuery query(authorize);
  QUrl callback(query.queryItemValue("redirect_uri", QUrl::FullyDecoded));
  QUrlQuery params;
  params.addQueryItem("code", code);
  params.addQueryItem("state", query.queryItemValue("state", QUrl::FullyDecoded));
  callback.setQuery(params);
  HttpRequest request;
  request.url = callback.toString(QUrl::FullyEncoded).toStdString();
  request.timeout = std::chrono::seconds(5);
  sendOffThread(request);
}

// A cloud server answering by tRPC procedure, for the browser and the
// document. Thread-safe: `mutex_` guards the answers and the log.
class ProcedureServer final : public HttpTransport {
public:
  void answer(const std::string& procedure, HttpResponse response) {
    const std::lock_guard lock(mutex_);
    answers_[procedure] = std::move(response);
  }
  HttpResponse send(const HttpRequest& request) override {
    const std::lock_guard lock(mutex_);
    sent_.push_back(request);
    std::string path = request.url.substr(std::string(kServer).size());
    path = path.substr(0, path.find('?'));
    if (path.starts_with("/trpc/")) {
      path = path.substr(6);
    }
    const auto it = answers_.find(path);
    return it == answers_.end() ? HttpResponse{404, "{}"} : it->second;
  }
  // The body of the last request whose URL contains `needle`.
  std::string lastBody(const std::string& needle) {
    const std::lock_guard lock(mutex_);
    for (auto it = sent_.rbegin(); it != sent_.rend(); ++it) {
      if (it->url.find(needle) != std::string::npos) {
        return it->body;
      }
    }
    return {};
  }
  int count(const std::string& needle, const std::string& method = {}) {
    const std::lock_guard lock(mutex_);
    int n = 0;
    for (const HttpRequest& r : sent_) {
      if (r.url.find(needle) != std::string::npos && (method.empty() || r.method == method)) {
        ++n;
      }
    }
    return n;
  }

private:
  std::mutex mutex_;
  std::map<std::string, HttpResponse> answers_;
  std::vector<HttpRequest> sent_;
};

// Answers each procedure from a queue: the next answer per call, and the
// last one again once the queue is down to it. Records every request.
//
// Thread affinity: thread-safe. `mutex_` guards the queues and the record.
class QueueServer final : public HttpTransport {
public:
  void answer(const std::string& procedure, HttpResponse response) {
    const std::lock_guard lock(mutex_);
    answers_[procedure].push_back(std::move(response));
  }
  HttpResponse send(const HttpRequest& request) override {
    const std::lock_guard lock(mutex_);
    // The path after the origin, whichever server the request went to.
    const auto host = request.url.find("://");
    const auto slash = host == std::string::npos ? std::string::npos : request.url.find('/', host + 3);
    std::string path = slash == std::string::npos ? std::string() : request.url.substr(slash);
    if (path.starts_with("/trpc/")) {
      path = path.substr(6);
    }
    sent_.emplace_back(path, request.body);
    auto& queue = answers_[path];
    if (queue.empty()) {
      return {404, "{}"};
    }
    HttpResponse response = queue.front();
    if (queue.size() > 1) {
      queue.pop_front();
    }
    return response;
  }
  // The procedures called, in order.
  std::vector<std::string> calls() {
    const std::lock_guard lock(mutex_);
    std::vector<std::string> out;
    for (const auto& [path, body] : sent_) {
      out.push_back(path);
    }
    return out;
  }
  // The body of the `n`th call of `procedure`, from 0.
  std::string body(const std::string& procedure, std::size_t n = 0) {
    const std::lock_guard lock(mutex_);
    for (const auto& [path, body] : sent_) {
      if (path == procedure && n-- == 0) {
        return body;
      }
    }
    return {};
  }

private:
  std::mutex mutex_;
  std::map<std::string, std::deque<HttpResponse>> answers_;
  std::vector<std::pair<std::string, std::string>> sent_;
};

HttpResponse trpcData(const std::string& json) {
  return {200, R"({"result":{"data":)" + json + "}}"};
}

// Forwards to a ProcedureServer the test keeps.
class SharedTransport final : public HttpTransport {
public:
  explicit SharedTransport(HttpTransport& target) : target_(target) {}
  HttpResponse send(const HttpRequest& request) override { return target_.send(request); }

private:
  HttpTransport& target_;
};

// Holds every request whose URL contains `needle` until release(), and
// forwards the rest. Thread-safe: `mutex_` guards `held_`.
class HoldingTransport final : public HttpTransport {
public:
  HoldingTransport(HttpTransport& target, std::string needle) : target_(target), needle_(std::move(needle)) {}
  HttpResponse send(const HttpRequest& request) override {
    if (request.url.find(needle_) != std::string::npos) {
      std::unique_lock lock(mutex_);
      released_.wait(lock, [this] { return !held_; });
    }
    return target_.send(request);
  }
  void release() {
    {
      const std::lock_guard lock(mutex_);
      held_ = false;
    }
    released_.notify_all();
  }

private:
  HttpTransport& target_;
  const std::string needle_;
  std::mutex mutex_;
  std::condition_variable released_;
  bool held_ = true;
};

// One draft row per document, as the local server keeps them. Thread-safe:
// `mutex_` guards the rows.
class MemoryDrafts final : public DraftStore {
public:
  std::optional<std::string> put(const CloudDocumentKey& key, const CloudBase& base, const std::string& draft) override {
    const std::lock_guard lock(mutex_);
    StoredDraft row{key, "d" + std::to_string(++next_), base, draft, DraftState::Waiting, {}};
    rows_[key.documentId] = row;
    return row.draftId;
  }
  std::optional<AcceptOutcome> accept(const CloudDocumentKey& key, const std::string& draftId, const CloudBase&,
                                      const CloudBase& base, const std::string&, const CloudDocumentOptions&) override {
    const std::lock_guard lock(mutex_);
    const auto it = rows_.find(key.documentId);
    if (it == rows_.end()) {
      return AcceptOutcome::NoDraft;
    }
    if (it->second.draftId == draftId) {
      rows_.erase(it);
      return AcceptOutcome::Deleted;
    }
    it->second.base = base;
    return AcceptOutcome::Rebased;
  }
  bool markUnsent(const CloudDocumentKey& key, const std::string& draftId, const std::string& reason) override {
    const std::lock_guard lock(mutex_);
    const auto it = rows_.find(key.documentId);
    if (it != rows_.end() && it->second.draftId == draftId) {
      it->second.state = DraftState::Unsent;
      it->second.refusal = reason;
    }
    return true;
  }
  DraftLoad load(const CloudDocumentKey& key) override {
    const std::lock_guard lock(mutex_);
    const auto it = rows_.find(key.documentId);
    return {true, it == rows_.end() ? std::nullopt : std::optional<StoredDraft>(it->second)};
  }
  DraftList list(const std::string&, const std::string&) override {
    const std::lock_guard lock(mutex_);
    DraftList out{true, {}};
    for (const auto& [id, row] : rows_) {
      out.drafts.push_back(row);
    }
    return out;
  }

private:
  std::mutex mutex_;
  std::map<std::string, StoredDraft> rows_;
  int next_ = 0;
};

// Forwards to a MemoryDrafts the test keeps.
class SharedDrafts final : public DraftStore {
public:
  explicit SharedDrafts(DraftStore& target) : t_(target) {}
  std::optional<std::string> put(const CloudDocumentKey& k, const CloudBase& b, const std::string& d) override {
    return t_.put(k, b, d);
  }
  std::optional<AcceptOutcome> accept(const CloudDocumentKey& k, const std::string& id, const CloudBase& s,
                                      const CloudBase& b, const std::string& r,
                                      const CloudDocumentOptions& o) override {
    return t_.accept(k, id, s, b, r, o);
  }
  bool markUnsent(const CloudDocumentKey& k, const std::string& id, const std::string& r) override {
    return t_.markUnsent(k, id, r);
  }
  DraftLoad load(const CloudDocumentKey& k) override { return t_.load(k); }
  DraftList list(const std::string& s, const std::string& a) override { return t_.list(s, a); }

private:
  DraftStore& t_;
};

// A local store that cannot be read or written, such as while the local
// server is down. `writes` counts the attempts.
class BrokenDrafts final : public DraftStore {
public:
  std::optional<std::string> put(const CloudDocumentKey&, const CloudBase&, const std::string&) override {
    ++writes;
    return std::nullopt;
  }
  std::optional<AcceptOutcome> accept(const CloudDocumentKey&, const std::string&, const CloudBase&, const CloudBase&,
                                      const std::string&, const CloudDocumentOptions&) override {
    return std::nullopt;
  }
  bool markUnsent(const CloudDocumentKey&, const std::string&, const std::string&) override { return false; }
  DraftLoad load(const CloudDocumentKey&) override { return {loadOk, std::nullopt}; }
  DraftList list(const std::string&, const std::string&) override { return {false, {}}; }

  bool loadOk = true;
  std::atomic<int> writes = 0;
};

constexpr const char* kCapabilities =
    R"({"protocol_version":1,"min_client_protocol_version":1,"kinds":{)"
    R"("workflow":{"read":[1],"write":[1],"modes":["whole"]},"timeline":{"read":[1],"write":[1],"modes":["whole"]}}})";

// Signs `account` in through the fake browser.
void signInWith(QObject* context, AccountController& account, const QString& code) {
  QObject::connect(&account, &AccountController::browserRequested, context,
                   [code](const QUrl& url) { std::thread([url, code] { completeInBrowser(url, code); }).detach(); });
  account.signIn();
}

} // namespace

class AccountQtTest final : public QObject {
  Q_OBJECT

private slots:
  void transportSendsAndReads() {
    CannedServer server("HTTP/1.1 201 Created\r\nContent-Length: 7\r\nConnection: close\r\n\r\n{\"a\":1}");
    HttpRequest request;
    request.method = "POST";
    request.url = "http://127.0.0.1:" + std::to_string(server.port()) + "/trpc/x";
    request.headers = {{"Authorization", "Bearer t1"}, {"x-nodetool-protocol", "1"}, {"Content-Type", "application/json"}};
    request.body = "{}";
    const HttpResponse response = sendOffThread(request);
    QCOMPARE(response.status, 201);
    QCOMPARE(QByteArray::fromStdString(response.body), QByteArray("{\"a\":1}"));
    // Header names are case-insensitive, and Qt may change their case.
    const QByteArray head = server.lastHead().toLower();
    QVERIFY(head.startsWith("post /trpc/x http/1.1"));
    QVERIFY(head.contains("authorization: bearer t1"));
    QVERIFY(head.contains("x-nodetool-protocol: 1"));
  }

  // A redirect would take the credential to another URL.
  void transportNeverFollowsARedirect() {
    // Redirects to itself, so a followed redirect would arrive here again.
    CannedServer server("HTTP/1.1 302 Found\r\nLocation: /elsewhere\r\nContent-Length: 0\r\n"
                        "Connection: close\r\n\r\n");
    HttpRequest request;
    request.url = "http://127.0.0.1:" + std::to_string(server.port()) + "/";
    request.timeout = std::chrono::seconds(2);
    QCOMPARE(sendOffThread(request).status, 302);
    QCOMPARE(server.requests(), 1);
  }

  void transportReportsNoAnswerAsZero() {
    // Accepts the connection and never answers.
    CannedServer silent{QByteArray()};
    HttpRequest request;
    request.url = "http://127.0.0.1:" + std::to_string(silent.port()) + "/";
    request.timeout = std::chrono::milliseconds(300);
    QCOMPARE(sendOffThread(request).status, 0);

    QTcpServer closed;
    QVERIFY(closed.listen(QHostAddress::LocalHost));
    const quint16 port = closed.serverPort();
    closed.close();
    request.url = "http://127.0.0.1:" + std::to_string(port) + "/";
    QCOMPARE(sendOffThread(request).status, 0);
  }

  // The timeout bounds the whole request. A server that keeps sending a
  // byte at a time never resets it.
  void transportDeadlineIsWallClock() {
    CannedServer drip("HTTP/1.1 200 OK\r\nContent-Length: 60\r\nConnection: close\r\n\r\n" + QByteArray(60, 'x'),
                      std::chrono::milliseconds(50));
    HttpRequest request;
    request.url = "http://127.0.0.1:" + std::to_string(drip.port()) + "/";
    request.timeout = std::chrono::milliseconds(500);
    const auto start = std::chrono::steady_clock::now();
    QCOMPARE(sendOffThread(request).status, 0);
    QVERIFY(std::chrono::steady_clock::now() - start < std::chrono::seconds(2));
  }

  // A body cut short after the headers is no response, not a short one.
  void transportReportsATruncatedBodyAsZero() {
    CannedServer cut("HTTP/1.1 200 OK\r\nContent-Length: 100\r\nConnection: close\r\n\r\n{\"a\":");
    HttpRequest request;
    request.url = "http://127.0.0.1:" + std::to_string(cut.port()) + "/";
    request.timeout = std::chrono::seconds(2);
    QCOMPARE(sendOffThread(request).status, 0);
  }

  // The cancel flag stops a request in flight.
  void transportStopsOnCancel() {
    CannedServer silent{QByteArray()};
    HttpRequest request;
    request.url = "http://127.0.0.1:" + std::to_string(silent.port()) + "/";
    request.timeout = std::chrono::seconds(30);
    auto cancel = std::make_shared<RequestCancel>();
    request.cancel = cancel;
    std::thread canceller([cancel] {
      std::this_thread::sleep_for(std::chrono::milliseconds(200));
      cancel->cancel();
    });
    const auto start = std::chrono::steady_clock::now();
    QCOMPARE(sendOffThread(request).status, 0);
    canceller.join();
    QVERIFY(std::chrono::steady_clock::now() - start < std::chrono::seconds(3));
  }

  // A request bound to an origin is not sent anywhere else.
  void transportKeepsTheRequiredOrigin() {
    CannedServer server("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}");
    HttpRequest request;
    request.url = "http://127.0.0.1:" + std::to_string(server.port()) + "/";
    request.requiredOrigin = kServer;
    request.timeout = std::chrono::seconds(2);
    QCOMPARE(sendOffThread(request).status, 0);
    QCOMPARE(server.requests(), 0);
  }

  // A session reference stays usable after the controller is gone, with
  // the store and endpoint it borrows.
  void sessionOutlivesTheController() {
    Computer computer;
    computer.server.addCode("code-1", "u1", "Ada");
    auto editor = computer.app("node-editor");
    connect(editor.get(), &AccountController::browserRequested, this,
            [](const QUrl& url) { std::thread([url] { completeInBrowser(url, "code-1"); }).detach(); });
    editor->signIn();
    QTRY_COMPARE(editor->state(), AccountController::State::SignedIn);
    const std::shared_ptr<AccountSession> session = editor->session();
    QVERIFY(session != nullptr);
    editor.reset();
    // Past the access token's expiry, so the request renews it through the
    // endpoint the controller owned.
    computer.clock.advance(15 * 60 * 1000);
    QCOMPARE(session->credentialForRequest().status, CredentialStatus::Ready);
  }

  // A start-up open reads the other app's sign-in at once, before the new
  // controller's own read has finished, and finds none on another server.
  void readSessionFindsTheSignedInAccount() {
    Computer computer;
    computer.server.addCode("code-1", "u1", "Ada");
    auto editor = computer.app("node-editor");
    connect(editor.get(), &AccountController::browserRequested, this,
            [](const QUrl& url) { std::thread([url] { completeInBrowser(url, "code-1"); }).detach(); });
    QVERIFY(editor->readSession() == nullptr);
    editor->signIn();
    QTRY_COMPARE(editor->state(), AccountController::State::SignedIn);

    auto timeline = computer.app("timeline");
    const std::shared_ptr<AccountSession> session = timeline->readSession();
    QVERIFY(session != nullptr);
    QCOMPARE(session->accountId(), std::string("u1"));
    QCOMPARE(session->credentialForRequest().status, CredentialStatus::Ready);

    computer.policy = parsePolicyJson("{\"CloudEnabled\": false}");
    auto held = computer.app("timeline");
    QCOMPARE(held->readSession(), nullptr);
  }

  // A session restored from the record is held back by a policy that turns
  // its server off, including a reference handed out before.
  void policyHoldsARestoredSession() {
    Computer computer;
    computer.server.addCode("code-1", "u1", "Ada");
    auto editor = computer.app("node-editor");
    connect(editor.get(), &AccountController::browserRequested, this,
            [](const QUrl& url) { std::thread([url] { completeInBrowser(url, "code-1"); }).detach(); });
    editor->signIn();
    QTRY_COMPARE(editor->state(), AccountController::State::SignedIn);
    const std::shared_ptr<AccountSession> earlier = editor->session();

    computer.policy = parsePolicyJson("{\"CloudEnabled\": false}");
    auto timeline = computer.app("timeline");
    editor->reload();
    QCOMPARE(timeline->session(), nullptr);
    QCOMPARE(editor->session(), nullptr);
    QTRY_COMPARE(editor->state(), AccountController::State::SignedOut);
    QCOMPARE(timeline->state(), AccountController::State::SignedOut);
    computer.clock.advance(15 * 60 * 1000);
    const int refreshes = computer.server.refreshCalls;
    QCOMPARE(earlier->credentialForRequest().status, CredentialStatus::SignedOut);
    QCOMPARE(computer.server.refreshCalls.load(), refreshes);

    computer.policy = ManagedPolicy{};
    editor->reload();
    QTRY_COMPARE(editor->state(), AccountController::State::SignedIn);
    QVERIFY(editor->session() != nullptr);
  }

  // A cancel before the browser opens ends the attempt at once.
  void cancelBeforeTheBrowserOpens() {
    Computer computer;
    auto editor = computer.app("node-editor");
    editor->signIn();
    editor->cancelSignIn();
    QTRY_COMPARE_WITH_TIMEOUT(editor->state(), AccountController::State::SignedOut, 3000);
    QCOMPARE(editor->session(), nullptr);
  }

  // TC1's second app: a sign-in in one app shows in the other without a
  // browser, within 5 seconds.
  void signInShowsInTheOtherApp() {
    Computer computer;
    computer.server.addCode("code-1", "u1", "Ada");
    auto editor = computer.app("node-editor");
    auto timeline = computer.app("timeline");
    QTRY_COMPARE(editor->state(), AccountController::State::SignedOut);
    QTRY_COMPARE(timeline->state(), AccountController::State::SignedOut);

    connect(editor.get(), &AccountController::browserRequested, this,
            [](const QUrl& url) { std::thread([url] { completeInBrowser(url, "code-1"); }).detach(); });
    QSignalSpy timelineBrowser(timeline.get(), &AccountController::browserRequested);
    editor->signIn();
    QCOMPARE(editor->state(), AccountController::State::SigningIn);
    QTRY_COMPARE(editor->state(), AccountController::State::SignedIn);
    QCOMPARE(editor->displayName(), QString("Ada"));
    QVERIFY(editor->message().isEmpty());
    QVERIFY(editor->session() != nullptr);
    QCOMPARE(computer.server.lastExchange().resource, std::string(kServer));

    QTRY_COMPARE_WITH_TIMEOUT(timeline->state(), AccountController::State::SignedIn, 5000);
    QCOMPARE(timeline->displayName(), QString("Ada"));
    QCOMPARE(timelineBrowser.count(), 0);
    QCOMPARE(AccountsIndex(computer.data.path()).list().size(), size_t(1));
  }

  // A sign-out in one app signs the other out, and the session ends on the
  // server.
  void signOutReachesTheOtherApp() {
    Computer computer;
    computer.server.addCode("code-1", "u1", "Ada");
    auto editor = computer.app("node-editor");
    auto timeline = computer.app("timeline");
    connect(editor.get(), &AccountController::browserRequested, this,
            [](const QUrl& url) { std::thread([url] { completeInBrowser(url, "code-1"); }).detach(); });
    editor->signIn();
    QTRY_COMPARE_WITH_TIMEOUT(timeline->state(), AccountController::State::SignedIn, 5000);
    QTRY_VERIFY(timeline->session() != nullptr);
    // The other app holds the tokens once it made a request.
    QCOMPARE(timeline->session()->credentialForRequest().status, CredentialStatus::Ready);

    QSignalSpy timelineSignedOut(timeline.get(), &AccountController::signedOut);
    editor->signOut();
    QTRY_COMPARE(editor->state(), AccountController::State::SignedOut);
    QTRY_COMPARE_WITH_TIMEOUT(timeline->state(), AccountController::State::SignedOut, 5000);
    QTRY_VERIFY_WITH_TIMEOUT(timelineSignedOut.count() >= 1, 5000);
    QVERIFY(!editor->serverEndPending());
    QCOMPARE(editor->statusText(), QString("Not signed in"));
    QVERIFY(!computer.server.grantActive(1));
  }

  void declinedSignInSaysWhy() {
    Computer computer;
    auto editor = computer.app("node-editor");
    connect(editor.get(), &AccountController::browserRequested, this, [](const QUrl& url) {
      std::thread([url] {
        const QUrlQuery query(url);
        QUrl callback(query.queryItemValue("redirect_uri", QUrl::FullyDecoded));
        QUrlQuery params;
        params.addQueryItem("error", "access_denied");
        params.addQueryItem("error_description", "Native sign-in is turned off on this server");
        params.addQueryItem("state", query.queryItemValue("state", QUrl::FullyDecoded));
        callback.setQuery(params);
        HttpRequest request;
        request.url = callback.toString(QUrl::FullyEncoded).toStdString();
        sendOffThread(request);
      }).detach();
    });
    editor->signIn();
    QTRY_COMPARE(editor->state(), AccountController::State::SignedOut);
    QVERIFY2(editor->message().contains("Native sign-in is turned off on this server"), qPrintable(editor->message()));
  }

  void cancelEndsTheWait() {
    Computer computer;
    auto editor = computer.app("node-editor");
    QSignalSpy browser(editor.get(), &AccountController::browserRequested);
    editor->signIn();
    QTRY_COMPARE(browser.count(), 1);
    editor->cancelSignIn();
    QTRY_COMPARE(editor->state(), AccountController::State::SignedOut);
    QVERIFY(editor->message().isEmpty());
  }

  // TC91, the policy half: sign-in to a server the policy does not allow is
  // refused with the reason, and no browser opens.
  void policyRefusesSignIn() {
    Computer computer;
    computer.policy = parsePolicyJson("{\"AllowedServers\": [\"https://other.example\"]}");
    auto editor = computer.app("node-editor");
    QSignalSpy browser(editor.get(), &AccountController::browserRequested);
    QVERIFY(editor->cloudAvailable());
    editor->signIn();
    QCOMPARE(editor->state(), AccountController::State::SignedOut);
    QVERIFY2(editor->message().contains("https://other.example"), qPrintable(editor->message()));
    QCOMPARE(browser.count(), 0);

    computer.policy = parsePolicyJson("{\"CloudEnabled\": false}");
    editor->reload();
    QVERIFY(!editor->cloudAvailable());
    QTRY_COMPARE(editor->statusText(), QString("Cloud features are turned off on this computer"));
    editor->signIn();
    QCOMPARE(browser.count(), 0);
  }

  // Both apps find the same data folder and server without configuration.
  void defaultsAreSharedByBothApps() {
    QVERIFY(sharedDataDir().generic_string().ends_with("NodeTool/native"));
    qunsetenv("NODETOOL_CLOUD_SERVER");
    QCOMPARE(cloudServerOrigin(), std::string("https://api.nodetool.ai"));
    qputenv("NODETOOL_CLOUD_SERVER", " https://nt.example ");
    QCOMPARE(cloudServerOrigin(), std::string("https://nt.example"));
    // Only an HTTPS origin: no browser and no credential goes over HTTP.
    for (const char* refused : {"http://nt.example", "http://127.0.0.1:7777", "nt.example", "https://nt.example/path",
                                "https://user@nt.example"}) {
      qputenv("NODETOOL_CLOUD_SERVER", refused);
      QCOMPARE(cloudServerOrigin(), std::string());
    }
    qunsetenv("NODETOOL_CLOUD_SERVER");
  }

  // A server that is not an HTTPS origin never gets a browser opened for it.
  void plainHttpServerRefusesSignIn() {
    Computer computer;
    AccountServices services;
    services.dataDir = computer.data.path();
    services.serverOrigin = "http://nt.example";
    services.app = "node-editor";
    services.store = std::make_unique<SharedStore>(computer.keychain);
    services.endpoint = std::make_unique<SharedEndpoint>(computer.server);
    services.policy = [] { return ManagedPolicy{}; };
    AccountController editor(std::move(services));
    QSignalSpy browser(&editor, &AccountController::browserRequested);
    editor.signIn();
    QCOMPARE(editor.state(), AccountController::State::SignedOut);
    QVERIFY2(editor.message().contains("HTTPS"), qPrintable(editor.message()));
    QCOMPARE(browser.count(), 0);
    QCOMPARE(editor.session(), nullptr);
  }

  // When the app cannot open the browser, the attempt ends with a reason
  // and can be tried again.
  void browserThatDoesNotOpenEndsTheAttempt() {
    Computer computer;
    computer.server.addCode("code-1", "u1", "Ada");
    auto editor = computer.app("node-editor");
    AccountController* controller = editor.get();
    bool opens = false;
    connect(controller, &AccountController::browserRequested, this, [&](const QUrl& url) {
      if (opens) {
        std::thread([url] { completeInBrowser(url, "code-1"); }).detach();
      } else {
        controller->browserNotOpened();
      }
    });
    editor->signIn();
    QTRY_COMPARE_WITH_TIMEOUT(editor->state(), AccountController::State::SignedOut, 3000);
    QVERIFY2(editor->message().contains("browser"), qPrintable(editor->message()));
    opens = true;
    editor->signIn();
    QTRY_COMPARE(editor->state(), AccountController::State::SignedIn);
    QVERIFY(editor->message().isEmpty());
  }
  // Sign in to another server (PRD "Sign in" step 2): only HTTPS origins,
  // one controller per server, and each keeps its own account.
  void serversAddAndSwitch() {
    Computer computer;
    AccountServers servers(computer.data.path(), kServer,
                           [&](const std::string& origin) { return computer.services("node-editor", origin); });
    AccountController* cloud = servers.current();
    QVERIFY(cloud != nullptr);
    QCOMPARE(servers.currentServer(), QString(kServer));
    QCOMPARE(servers.servers(), QStringList{kServer});

    QSignalSpy switched(&servers, &AccountServers::currentChanged);
    QVERIFY(!servers.addServer("http://plain.example").isEmpty());
    QVERIFY(!servers.addServer("https://a.example/path").isEmpty());
    QVERIFY(!servers.addServer("  ").isEmpty());
    QCOMPARE(switched.count(), 0);

    QVERIFY(servers.addServer("  Team.Example ").isEmpty());
    QCOMPARE(switched.count(), 1);
    QCOMPARE(servers.currentServer(), QString("https://team.example"));
    QCOMPARE(servers.current()->serverOrigin(), QString("https://team.example"));
    QCOMPARE(servers.servers(), (QStringList{kServer, "https://team.example"}));

    QVERIFY(servers.switchTo(kServer));
    QCOMPARE(servers.current(), cloud);
    QVERIFY(!servers.switchTo("https://unlisted.example"));
    QCOMPARE(servers.current(), cloud);

    // A server an account signed in to before is listed again at start,
    // and the app starts on the server it used last.
    QVERIFY(AccountsIndex(computer.data.path()).upsert({"https://past.example", "u7", "Ada"}, std::chrono::seconds(1)));
    AccountServers again(computer.data.path(), kServer,
                         [&](const std::string& origin) { return computer.services("timeline", origin); },
                         "https://past.example");
    QCOMPARE(again.currentServer(), QString("https://past.example"));
    QVERIFY(again.servers().contains("https://past.example"));
    AccountServers unknown(computer.data.path(), kServer,
                           [&](const std::string& origin) { return computer.services("timeline", origin); },
                           "https://gone.example");
    QCOMPARE(unknown.currentServer(), QString(kServer));
  }

  // The Cloud and Shared with me groups list the signed-in account's
  // documents, and empty at sign-out.
  void browserListsCloudAndShared() {
    Computer computer;
    computer.server.addCode("code-b", "u1", "Ada");
    auto account = computer.app("node-editor");
    signInWith(this, *account, "code-b");
    QTRY_COMPARE(account->state(), AccountController::State::SignedIn);

    ProcedureServer server;
    server.answer("workflows.list", {200, R"({"result":{"data":{"workflows":[{"id":"w1","name":"Mine",)"
                                          R"("updated_at":"2026-11-16T00:00:00Z"}],"next":null}}})"});
    server.answer("workflows.sharing.sharedWithMe",
                  {200, R"({"result":{"data":{"workflows":[{"id":"w2","name":"Theirs","shared_role":"editor"}]}}})"});
    CloudBrowser browser("workflow", std::make_unique<SharedTransport>(server));
    browser.setAccount(account.get());
    QTRY_COMPARE(browser.cloud()->count(), 1);
    QTRY_COMPARE(browser.shared()->count(), 1);
    QVERIFY(!browser.loading());
    QVERIFY(browser.message().isEmpty());
    const QModelIndex shared = browser.shared()->index(0);
    QCOMPARE(browser.shared()->data(shared, CloudDocumentList::NameRole).toString(), QString("Theirs"));
    QCOMPARE(browser.shared()->data(shared, CloudDocumentList::AccessRole).toString(), QString("editor"));

    // Offline, the lists keep what they showed and say why.
    server.answer("workflows.list", {503, "{}"});
    browser.refresh();
    QTRY_VERIFY(!browser.loading());
    QVERIFY(!browser.message().isEmpty());
    QCOMPARE(browser.cloud()->count(), 1);

    account->signOut();
    QTRY_COMPARE(account->state(), AccountController::State::SignedOut);
    QTRY_COMPARE(browser.cloud()->count(), 0);
    QCOMPARE(browser.shared()->count(), 0);
    QVERIFY(!browser.signedIn());
  }

  // A cloud document shows each synchronization status the PRD names, and
  // reads Saved to cloud only after the server accepted.
  void documentShowsItsStatus() {
    Computer computer;
    computer.server.addCode("code-d", "u1", "Ada");
    auto account = computer.app("node-editor");
    signInWith(this, *account, "code-d");
    QTRY_COMPARE(account->state(), AccountController::State::SignedIn);

    ProcedureServer server;
    server.answer("/api/sync/capabilities", {200, kCapabilities});
    server.answer("workflows.get", {200, R"({"result":{"data":{"id":"w1","name":"Mine",)"
                                         R"("updated_at":"2026-11-16T00:00:00Z","graph":{"nodes":[],"edges":[]}}}})"});
    server.answer("workflows.autosave", {200, R"({"result":{"data":{"id":"w1","updated_at":"2026-11-16T00:01:00Z"}}})"});
    MemoryDrafts drafts;
    CloudDocumentServices services;
    services.session = account->session();
    services.store = std::make_unique<SharedDrafts>(drafts);
    services.kind = "workflow";
    services.documentId = "w1";
    services.transport = std::make_unique<SharedTransport>(server);
    CloudDocument document(std::move(services));
    QSignalSpy opened(&document, &CloudDocument::opened);
    document.open();
    QTRY_COMPARE(opened.count(), 1);
    QVERIFY(opened.at(0).at(0).toString().contains("\"Mine\""));
    QVERIFY(opened.at(0).at(1).toString().isEmpty());
    QVERIFY(!document.readOnly());
    QCOMPARE(document.syncStatus(), CloudDocument::SyncStatus::SavedToCloud);
    QCOMPARE(document.content(), opened.at(0).at(0).toString());
    QCOMPARE(document.kind(), QString("workflow"));
    QCOMPARE(document.role(), QString("owner"));

    document.edit(R"({"nodes":[{"id":"n1"}],"edges":[]})");
    QCOMPARE(document.content(), QString(R"({"nodes":[{"id":"n1"}],"edges":[]})"));
    QCOMPARE(document.syncStatus(), CloudDocument::SyncStatus::ChangesWaiting);
    QCOMPARE(document.syncText(), QString("1 change waiting"));
    QTRY_COMPARE(document.syncStatus(), CloudDocument::SyncStatus::SavedToCloud);
    QCOMPARE(server.count("workflows.autosave", "POST"), 1);
    QVERIFY(drafts.list({}, {}).drafts.empty());

    // Offline: the edit waits on disk and the status names the last
    // contact.
    server.answer("workflows.autosave", {503, "{}"});
    document.edit(R"({"nodes":[],"edges":[]})");
    document.edit(R"({"nodes":[{"id":"n2"}],"edges":[]})");
    QTRY_COMPARE(document.syncStatus(), CloudDocument::SyncStatus::Offline);
    QVERIFY(document.syncText().startsWith("Offline, 2 changes waiting, last connected "));
    QCOMPARE(drafts.list({}, {}).drafts.size(), std::size_t(1));

    // Access removed: the tab turns read-only and the edits stay unsent.
    server.answer("workflows.autosave", {403, R"({"error":{"json":{"data":{"apiCode":"FORBIDDEN"}}}})"});
    QTRY_COMPARE_WITH_TIMEOUT(document.syncStatus(), CloudDocument::SyncStatus::Unsent, 10000);
    QVERIFY(document.readOnly());
    QCOMPARE(document.syncText(), QString("Unsent edits: access removed"));
    const auto rows = drafts.list({}, {}).drafts;
    QVERIFY(rows.size() == 1 && rows[0].state == DraftState::Unsent);
  }


  // The share dialog reads the links, people and linked documents, warns of
  // a secret in the document, and changes a link through the server.
  void shareDialogReadsAndChanges() {
    Computer computer;
    computer.server.addCode("code-s", "u1", "Ada");
    auto account = computer.app("timeline");
    signInWith(this, *account, "code-s");
    QTRY_COMPARE(account->state(), AccountController::State::SignedIn);

    ProcedureServer server;
    server.answer("documentSharing.get",
                  {200, R"({"result":{"data":{"collaborators":[],"shares":[)"
                        R"({"id":"s1","token":"tok1","role":"viewer","options":{"allow_history":true,)"
                        R"("allow_download":false,"allow_duplicate":false}}],"people":[{"user_id":"u2",)"
                        R"("display_name":"Bob","access":{"role":"viewer","options":{"allow_history":true,)"
                        R"("allow_download":false,"allow_duplicate":false},"grants":[],"given_by":{"role":[],)"
                        R"("allow_history":[],"allow_download":[],"allow_duplicate":[]}}}]}}})"});
    server.answer("documentSharing.setLinkOptions", {200, R"({"result":{"data":{"id":"s1","token":"tok1","role":"viewer"}}})"});
    ShareController share(std::make_unique<SharedTransport>(server));
    share.setAccount(account.get());
    share.setKind("timeline");
    share.setContent(R"({"clips":[{"id":"c1","scriptId":"sc1","prompt":"AKIAABCDEFGHIJKLMNOP"}]})");
    share.setDocumentId("t1");
    QTRY_VERIFY(!share.loading());
    QVERIFY(share.message().isEmpty());

    const QVariantMap viewer = share.viewerLink();
    QVERIFY(viewer.value("exists").toBool());
    QCOMPARE(viewer.value("url").toString(), QString(kServer) + "/share/document/tok1");
    QVERIFY(viewer.value("history").toBool());
    QVERIFY(viewer.value("statement").toString().contains("read its history"));
    QVERIFY(!share.editorLink().value("exists").toBool());
    QVERIFY(share.editorLink().value("statement").toString().contains("cannot be taken back"));
    QCOMPARE(share.people().size(), 1);
    QCOMPARE(share.people().at(0).toMap().value("name").toString(), QString("Bob"));

    // The script answers like the timeline, so it has a link of its own.
    QCOMPARE(share.linkedDocuments().size(), 1);
    const QVariantMap script = share.linkedDocuments().at(0).toMap();
    QCOMPARE(script.value("kind").toString(), QString("script"));
    QCOMPARE(script.value("state").toString(), QString("shared"));
    QCOMPARE(share.secretWarnings().size(), 1);
    QCOMPARE(share.secretWarnings().at(0).toMap().value("place").toString(), QString("clips[0].prompt"));

    // A refused read keeps what the dialog showed and says why.
    server.answer("documentSharing.get", {403, R"({"error":{"json":{"data":{"apiCode":"FORBIDDEN"}}}})"});
    share.refresh();
    QTRY_VERIFY(!share.loading());
    QVERIFY(!share.message().isEmpty());
    QVERIFY(share.viewerLink().value("exists").toBool());

    const int before = server.count("documentSharing.setLinkOptions", "POST");
    share.setViewerOptions(false, true, false);
    QTRY_COMPARE(server.count("documentSharing.setLinkOptions", "POST"), before + 1);
    QTRY_VERIFY(!share.busy());

    // Signed out, nothing is shown and nothing is sent.
    account->signOut();
    QTRY_COMPARE(account->state(), AccountController::State::SignedOut);
    QTRY_VERIFY(!share.viewerLink().value("exists").toBool());
    const int sent = server.count("documentSharing");
    share.createLink("editor");
    QCOMPARE(server.count("documentSharing"), sent);
    QVERIFY(!share.message().isEmpty());
  }


  // A disabled link that people joined through keeps its options, so the
  // dialog lists it and changes them by share id. Each person shows where
  // the access comes from (P3, P6).
  void shareDialogManagesDisabledLinks() {
    Computer computer;
    computer.server.addCode("code-x", "u1", "Ada");
    auto account = computer.app("timeline");
    signInWith(this, *account, "code-x");
    QTRY_COMPARE(account->state(), AccountController::State::SignedIn);

    ProcedureServer server;
    server.answer("documentSharing.get",
                  {200, R"({"result":{"data":{"collaborators":[],"shares":[)"
                        R"({"id":"s2","token":"tok2","role":"viewer","options":{"allow_history":false,)"
                        R"("allow_download":false,"allow_duplicate":false}},)"
                        R"({"id":"s1","token":"tok1","role":"viewer","disabled_at":"2026-11-17T00:00:00Z","options":{"allow_history":true,)"
                        R"("allow_download":false,"allow_duplicate":false}},)"
                        R"({"id":"s0","token":"tok0","role":"viewer","disabled_at":"2026-11-17T00:00:00Z","options":{}}],)"
                        R"("people":[{"user_id":"u2","display_name":"Bob","access":{"role":"viewer",)"
                        R"("options":{"allow_history":true,"allow_download":false,"allow_duplicate":false},)"
                        R"("grants":[{"source":"link","grant_id":"g1","share_id":"s1","role":"viewer",)"
                        R"("options":{"allow_history":true,"allow_download":false,"allow_duplicate":false},)"
                        R"("link_disabled":true}],"given_by":{"role":[0],"allow_history":[0],)"
                        R"("allow_download":[],"allow_duplicate":[]}}}]}}})"});
    server.answer("documentSharing.setLinkOptions", {200, R"({"result":{"data":{"id":"s1","token":"tok1","role":"viewer"}}})"});
    ShareController share(std::make_unique<SharedTransport>(server));
    share.setAccount(account.get());
    share.setKind("timeline");
    share.setContent(R"({"clips":[]})");
    share.setDocumentId("t1");
    QTRY_VERIFY(!share.loading());

    // Only s1 has people: s0 admits nobody and gives nobody access.
    QCOMPARE(share.disabledLinks().size(), 1);
    const QVariantMap disabled = share.disabledLinks().at(0).toMap();
    QCOMPARE(disabled.value("shareId").toString(), QString("s1"));
    QCOMPARE(disabled.value("people").toInt(), 1);
    QVERIFY(disabled.value("history").toBool());
    const QVariantMap bob = share.people().at(0).toMap();
    QCOMPARE(bob.value("sources").toString(), QString("Joined through a disabled viewer link"));
    QVERIFY(bob.value("history").toBool());
    QVERIFY(!bob.value("download").toBool());

    // Turning history off on the enabled link does not touch s1. The
    // disabled link's own option does.
    share.setLinkOptions("s1", false, false, false);
    QTRY_COMPARE(server.count("documentSharing.setLinkOptions", "POST"), 1);
    QTRY_VERIFY(!share.busy());
    QVERIFY(server.lastBody("documentSharing.setLinkOptions").find("\"share_id\":\"s1\"") != std::string::npos);
    share.setLinkOptions("unknown", true, true, true);
    QCOMPARE(server.count("documentSharing.setLinkOptions", "POST"), 1);
  }

  // RF13: the server token goes to the server's own origin only, sockets
  // included, and an empty token adds no header.
  void serverTokenStaysOnItsOrigin() {
    const QUrl server("http://127.0.0.1:7777");
    QNetworkRequest same(QUrl("http://127.0.0.1:7777/api/assets?x=1"));
    QVERIFY(attachServerToken(same, server, "t1"));
    QCOMPARE(same.rawHeader("Authorization"), QByteArray("Bearer t1"));
    QNetworkRequest socket(QUrl("ws://127.0.0.1:7777/ws"));
    QVERIFY(attachServerToken(socket, server, "t1"));
    QNetworkRequest secureSocket(QUrl("wss://nt.example/ws"));
    QVERIFY(attachServerToken(secureSocket, QUrl("https://NT.example"), "t1"));
    for (const char* other : {"http://127.0.0.1:7778/api", "https://127.0.0.1:7777/api", "http://localhost:7777/api",
                              "https://cdn.example/a.png", "file:///tmp/a"}) {
      QNetworkRequest request{QUrl(other)};
      QVERIFY2(!attachServerToken(request, server, "t1"), other);
      QVERIFY(!request.hasRawHeader("Authorization"));
    }
    QNetworkRequest empty(QUrl("http://127.0.0.1:7777/api"));
    QVERIFY(!attachServerToken(empty, server, ""));
    QVERIFY(!empty.hasRawHeader("Authorization"));
    QVERIFY(sameServerOrigin(QUrl("https://nt.example"), QUrl("https://nt.example:443/x")));
  }

  // RF13: a request with the token follows no redirect to another origin,
  // because Qt would copy the header there. A redirect inside the origin
  // still works.
  void serverTokenNeverFollowsARedirectAway() {
    CannedServer other("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok");
    const QByteArray away = "http://127.0.0.1:" + QByteArray::number(other.port()) + "/x";
    CannedServer server("HTTP/1.1 302 Found\r\nLocation: " + away +
                        "\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
    const QUrl origin(QStringLiteral("http://127.0.0.1:%1").arg(server.port()));
    QNetworkAccessManager network;
    QNetworkRequest request(origin.resolved(QUrl("/api/a")));
    QVERIFY(attachServerToken(request, origin, "t1"));
    QNetworkReply* reply = network.get(request);
    QTRY_VERIFY(reply->isFinished());
    QVERIFY(server.lastHead().contains("Authorization: Bearer t1"));
    QCOMPARE(other.requests(), 0);
    QVERIFY(reply->error() != QNetworkReply::NoError);
    reply->deleteLater();

    // A request that reads redirects itself keeps its policy.
    QNetworkRequest manual(origin.resolved(QUrl("/api/b")));
    manual.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
    QVERIFY(attachServerToken(manual, origin, "t1"));
    QCOMPARE(manual.attribute(QNetworkRequest::RedirectPolicyAttribute).toInt(),
             int(QNetworkRequest::ManualRedirectPolicy));
    QNetworkRequest same(origin.resolved(QUrl("/api/c")));
    QVERIFY(attachServerToken(same, origin, "t1"));
    QCOMPARE(same.attribute(QNetworkRequest::RedirectPolicyAttribute).toInt(),
             int(QNetworkRequest::SameOriginRedirectPolicy));
  }

  // A tab that closes right after an edit leaves the edit on disk, before
  // the timer wrote it.
  void closingWritesTheLastEdit() {
    Computer computer;
    computer.server.addCode("code-c", "u1", "Ada");
    auto account = computer.app("node-editor");
    signInWith(this, *account, "code-c");
    QTRY_COMPARE(account->state(), AccountController::State::SignedIn);
    ProcedureServer server;
    server.answer("/api/sync/capabilities", {200, kCapabilities});
    server.answer("workflows.get", {200, R"({"result":{"data":{"id":"w1","name":"Mine",)"
                                         R"("updated_at":"2026-11-16T00:00:00Z","graph":{"nodes":[],"edges":[]}}}})"});
    MemoryDrafts drafts;
    CloudDocumentServices services;
    services.session = account->session();
    services.store = std::make_unique<SharedDrafts>(drafts);
    services.kind = "workflow";
    services.documentId = "w1";
    services.transport = std::make_unique<SharedTransport>(server);
    auto document = std::make_unique<CloudDocument>(std::move(services));
    QSignalSpy opened(document.get(), &CloudDocument::opened);
    document->open();
    QTRY_COMPARE(opened.count(), 1);
    document->edit(R"({"nodes":[{"id":"n9"}],"edges":[]})");
    document.reset();
    const auto rows = drafts.list({}, {}).drafts;
    QCOMPARE(rows.size(), std::size_t(1));
    QVERIFY(rows[0].draft.find("n9") != std::string::npos);
    QCOMPARE(server.count("workflows.autosave", "POST"), 0);
  }

  // A reopened tab passes the role it kept. The server's current role
  // replaces it, so a role taken away since then is never used (review F4).
  void reopenUsesTheCurrentRole() {
    Computer computer;
    computer.server.addCode("code-r", "u1", "Ada");
    auto account = computer.app("node-editor");
    signInWith(this, *account, "code-r");
    QTRY_COMPARE(account->state(), AccountController::State::SignedIn);
    ProcedureServer server;
    server.answer("/api/sync/capabilities", {200, kCapabilities});
    server.answer("workflows.get", {200, R"({"result":{"data":{"id":"w1","name":"Theirs",)"
                                         R"("updated_at":"2026-11-16T00:00:00Z","graph":{"nodes":[],"edges":[]}}}})"});
    const auto openAs = [&](const std::string& keptRole) {
      CloudDocumentServices services;
      services.session = account->session();
      services.store = std::make_unique<MemoryDrafts>();
      services.kind = "workflow";
      services.documentId = "w1";
      services.role = keptRole;
      services.transport = std::make_unique<SharedTransport>(server);
      return std::make_unique<CloudDocument>(std::move(services));
    };

    // Lowered from editor to viewer: the tab opens read-only.
    server.answer("workflows.sharing.access", {200, R"({"result":{"data":{"access":{"role":"viewer"}}}})"});
    auto lowered = openAs("editor");
    QSignalSpy opened(lowered.get(), &CloudDocument::opened);
    lowered->open();
    QTRY_COMPARE(opened.count(), 1);
    QCOMPARE(lowered->role(), QString("viewer"));
    QVERIFY(lowered->readOnly());
    lowered->edit(R"({"nodes":[{"id":"n1"}],"edges":[]})");
    QCOMPARE(server.count("workflows.autosave", "POST"), 0);

    // Access removed: the tab does not open.
    server.answer("workflows.sharing.access", {200, R"({"result":{"data":{"access":null}}})"});
    auto removed = openAs("owner");
    QSignalSpy failed(removed.get(), &CloudDocument::openFailed);
    removed->open();
    QTRY_COMPARE(failed.count(), 1);
    QCOMPARE(removed->syncStatus(), CloudDocument::SyncStatus::NotOpened);
    QCOMPARE(server.count("workflows.get"), 1);

    // The server cannot answer the access read: the kept role is the hint.
    server.answer("workflows.sharing.access", {503, "{}"});
    auto offline = openAs("viewer");
    QSignalSpy offlineOpened(offline.get(), &CloudDocument::opened);
    offline->open();
    QTRY_COMPARE(offlineOpened.count(), 1);
    QCOMPARE(offline->role(), QString("viewer"));
    QVERIFY(offline->readOnly());
  }

  // A viewer's document opens read-only and sends nothing. A draft left in
  // the local store opens over the revision.
  void viewerAndResumedDocuments() {
    Computer computer;
    computer.server.addCode("code-v", "u1", "Ada");
    auto account = computer.app("timeline");
    signInWith(this, *account, "code-v");
    QTRY_COMPARE(account->state(), AccountController::State::SignedIn);
    ProcedureServer server;
    server.answer("/api/sync/capabilities", {200, kCapabilities});
    server.answer("timeline.get", {200, R"({"result":{"data":{"id":"t1","name":"Cut","updatedAt":"r1"}}})"});
    server.answer("timeline.update", {200, R"({"result":{"data":{"id":"t1","updatedAt":"r2"}}})"});

    MemoryDrafts drafts;
    const auto open = [&](const std::string& role) {
      CloudDocumentServices services;
      services.session = account->session();
      services.store = std::make_unique<SharedDrafts>(drafts);
      services.kind = "timeline";
      services.documentId = "t1";
      services.role = role;
      services.transport = std::make_unique<SharedTransport>(server);
      return std::make_unique<CloudDocument>(std::move(services));
    };

    auto viewer = open("viewer");
    QSignalSpy viewerOpened(viewer.get(), &CloudDocument::opened);
    viewer->open();
    QTRY_COMPARE(viewerOpened.count(), 1);
    QVERIFY(viewer->readOnly());
    viewer->edit(R"({"tracks":[]})");
    QTest::qWait(600);
    QCOMPARE(server.count("timeline.update"), 0);
    QVERIFY(drafts.list({}, {}).drafts.empty());
    viewer.reset();

    const std::shared_ptr<AccountSession> session = account->session();
    drafts.put({serverKey(kServer), session->accountId(), "timeline", "t1"}, {"r1", "h1"}, R"({"tracks":[1]})");
    auto editor = open("editor");
    QSignalSpy editorOpened(editor.get(), &CloudDocument::opened);
    editor->open();
    QTRY_COMPARE(editorOpened.count(), 1);
    QCOMPARE(editorOpened.at(0).at(1).toString(), QString(R"({"tracks":[1]})"));
    QTRY_COMPARE(editor->syncStatus(), CloudDocument::SyncStatus::SavedToCloud);
    QCOMPARE(server.count("timeline.update"), 1);
  }

  // A send the server holds does not hold the local writes: an edit made
  // while it waits reaches the disk in time (FR11).
  void slowSendKeepsWritingDrafts() {
    Computer computer;
    computer.server.addCode("code-h", "u1", "Ada");
    auto account = computer.app("node-editor");
    signInWith(this, *account, "code-h");
    QTRY_COMPARE(account->state(), AccountController::State::SignedIn);
    ProcedureServer server;
    server.answer("/api/sync/capabilities", {200, kCapabilities});
    server.answer("workflows.get", {200, R"({"result":{"data":{"id":"w1","name":"Mine",)"
                                         R"("updated_at":"2026-11-16T00:00:00Z","graph":{"nodes":[],"edges":[]}}}})"});
    server.answer("workflows.autosave", {200, R"({"result":{"data":{"id":"w1","updated_at":"2026-11-16T00:01:00Z"}}})"});
    MemoryDrafts drafts;
    auto holding = std::make_unique<HoldingTransport>(server, "workflows.autosave");
    HoldingTransport& gate = *holding;
    CloudDocumentServices services;
    services.session = account->session();
    services.store = std::make_unique<SharedDrafts>(drafts);
    services.kind = "workflow";
    services.documentId = "w1";
    services.transport = std::move(holding);
    auto document = std::make_unique<CloudDocument>(std::move(services));
    // Released before the document joins its threads, also on a failure.
    struct Release {
      HoldingTransport& gate;
      ~Release() { gate.release(); }
    } releaseOnExit{gate};
    QSignalSpy opened(document.get(), &CloudDocument::opened);
    document->open();
    QTRY_COMPARE(opened.count(), 1);
    document->edit(R"({"nodes":[{"id":"first"}],"edges":[]})");
    QTRY_COMPARE(document->syncStatus(), CloudDocument::SyncStatus::Sending);
    document->edit(R"({"nodes":[{"id":"second"}],"edges":[]})");
    QTRY_VERIFY_WITH_TIMEOUT(
        [&] {
          const auto rows = drafts.list({}, {}).drafts;
          return rows.size() == 1 && rows[0].draft.find("second") != std::string::npos;
        }(),
        1500);
    gate.release();
    QTRY_COMPARE_WITH_TIMEOUT(document->syncStatus(), CloudDocument::SyncStatus::SavedToCloud, 10000);
  }

  // When the local store can't say whether a draft is kept, the document
  // opens read-only and writes nothing over a kept draft. When it can't
  // write, writeLocally() says so before the tab closes.
  void unreadableStoreKeepsTheDraft() {
    Computer computer;
    computer.server.addCode("code-u", "u1", "Ada");
    auto account = computer.app("node-editor");
    signInWith(this, *account, "code-u");
    QTRY_COMPARE(account->state(), AccountController::State::SignedIn);
    ProcedureServer server;
    server.answer("/api/sync/capabilities", {200, kCapabilities});
    server.answer("workflows.get", {200, R"({"result":{"data":{"id":"w1","name":"Mine",)"
                                         R"("updated_at":"2026-11-16T00:00:00Z","graph":{"nodes":[],"edges":[]}}}})"});
    const auto open = [&](bool loadOk) {
      auto store = std::make_unique<BrokenDrafts>();
      store->loadOk = loadOk;
      BrokenDrafts& kept = *store;
      CloudDocumentServices services;
      services.session = account->session();
      services.store = std::move(store);
      services.kind = "workflow";
      services.documentId = "w1";
      services.transport = std::make_unique<SharedTransport>(server);
      return std::pair{std::make_unique<CloudDocument>(std::move(services)), &kept};
    };

    auto [unreadable, unreadableStore] = open(false);
    QSignalSpy opened(unreadable.get(), &CloudDocument::opened);
    unreadable->open();
    QTRY_COMPARE(opened.count(), 1);
    QVERIFY(unreadable->readOnly());
    QVERIFY(unreadable->readOnlyReason().contains("could not be read"));
    unreadable->edit(R"({"nodes":[{"id":"n1"}],"edges":[]})");
    QTest::qWait(600);
    QCOMPARE(unreadableStore->writes.load(), 0);
    QVERIFY(unreadable->writeLocally());

    auto [unwritable, unwritableStore] = open(true);
    QSignalSpy writableOpened(unwritable.get(), &CloudDocument::opened);
    unwritable->open();
    QTRY_COMPARE(writableOpened.count(), 1);
    QVERIFY(!unwritable->readOnly());
    QVERIFY(unwritable->writeLocally());
    unwritable->edit(R"({"nodes":[{"id":"n1"}],"edges":[]})");
    QVERIFY(!unwritable->writeLocally());
    QVERIFY(unwritableStore->writes.load() > 0);
    QTRY_COMPARE(unwritable->syncStatus(), CloudDocument::SyncStatus::NotSaving);
  }

  // Synchronize: the receive runs first with the person's choices by cloud
  // id, the send is captured again because the receive replaced a document
  // it carried, and the refusal of the document kept local is answered with
  // the revision the sheet showed, without asking again.
  void synchronizeReceivesThenSends() {
    Computer computer;
    computer.server.addCode("code-t", "u1", "Ada");
    auto account = computer.app("timeline");
    signInWith(this, *account, "code-t");
    QTRY_COMPARE(account->state(), AccountController::State::SignedIn);

    QueueServer server;
    const std::string h1(64, '1');
    const std::string h2(64, '2');
    server.answer("cloudTransfer.send.capture",
                  trpcData(R"({"status":"captured","transfer_id":"t1","first_publication":false,"operations":[)"
                           R"({"op":"replace_document","kind":"workflow","document_id":"c1"},)"
                           R"({"op":"replace_document","kind":"workflow","document_id":"c2"}],)"
                           R"("documents":[{"kind":"workflow","local_id":"l1","cloud_id":"c1","name":"Mine"},)"
                           R"({"kind":"workflow","local_id":"l2","cloud_id":"c2","name":"Theirs"}],)"
                           R"("missing_files":[],"skipped":[],"deleted_locally":[]})"));
    server.answer("cloudTransfer.send.capture",
                  trpcData(R"({"status":"captured","transfer_id":"t2","first_publication":false,"operations":[)"
                           R"({"op":"replace_document","kind":"workflow","document_id":"c1"}],)"
                           R"("documents":[{"kind":"workflow","local_id":"l1","cloud_id":"c1","name":"Mine"}],)"
                           R"("missing_files":[],"skipped":[],"deleted_locally":[]})"));
    server.answer("cloudTransfer.receive.capture",
                  trpcData(R"({"set_id":"s1","documents":[)"
                           R"({"kind":"workflow","cloud_id":"c1","local_id":"l1","name":"Mine","content_hash":")" + h1 +
                           R"(","status":"both_changed","decision":null,"files":[],"missing_files":[]},)"
                           R"({"kind":"workflow","cloud_id":"c2","local_id":"l2","name":"Theirs","content_hash":")" + h2 +
                           R"(","status":"both_changed","decision":null,"files":[],"missing_files":[]},)"
                           R"({"kind":"timeline","cloud_id":"c3","local_id":"c3","name":"Cut","content_hash":")" + h2 +
                           R"(","status":"cloud_changed","decision":"receive","files":[],"missing_files":[]}]})"));
    server.answer("cloudTransfer.receive.run",
                  trpcData(R"({"status":"finished","set_id":"s1","result":{"received":[)"
                           R"({"kind":"workflow","id":"l2","name":"Theirs"},{"kind":"timeline","id":"c3","name":"Cut"}],)"
                           R"("changed_during_receive":[],"not_received":[],"kept_beside":[],"missing_files":[],)"
                           R"("file_kept":[]}})"));
    server.answer("cloudTransfer.send.cancel", trpcData(R"({"state":"cancelled"})"));
    server.answer("cloudTransfer.send.run",
                  trpcData(R"({"status":"refused","transfer_id":"t2","failures":[{"code":"BASE_CHANGED",)"
                           R"("kind":"workflow","document_id":"c1","stored_hash":")" + h1 + R"(","message":"changed"}]})"));
    server.answer("cloudTransfer.send.run", trpcData(R"({"status":"committed","transfer_id":"t2","result":{}})"));

    TransferController transfer(std::make_unique<SharedTransport>(server));
    transfer.setAccount(account.get());
    transfer.setServerUrl(QUrl(kLocalServer));
    transfer.setServerToken("local-token");
    transfer.setProjectId(QString(32, 'p'));
    transfer.setLinked(true);
    transfer.start();
    QTRY_COMPARE(transfer.stage(), TransferController::Stage::Reviewing);

    // Two choices, one receive, two sends. Nothing runs until both choices
    // are made.
    const auto sections = [&] {
      QStringList out;
      for (const QVariant& row : transfer.rows()) {
        out.append(row.toMap().value("section").toString());
      }
      return out;
    };
    QCOMPARE(sections(), (QStringList{"choice", "choice", "receive", "send", "send"}));
    QCOMPARE(transfer.rows().at(3).toMap().value("name").toString(), QString("Mine"));
    QCOMPARE(transfer.rows().at(0).toMap().value("text").toString(), QString("Changed here and in the cloud"));
    QVERIFY(!transfer.ready());
    transfer.apply();
    QCOMPARE(transfer.stage(), TransferController::Stage::Reviewing);
    QVERIFY(!transfer.choose(2, "receive"));
    QVERIFY(transfer.choose(0, "keepLocal"));
    QVERIFY(transfer.choose(1, "receive"));
    QVERIFY(transfer.ready());

    QSignalSpy finished(&transfer, &TransferController::finished);
    transfer.apply();
    QTRY_COMPARE(transfer.stage(), TransferController::Stage::Finished);
    QCOMPARE(finished.count(), 1);
    QCOMPARE(server.calls(), (std::vector<std::string>{"cloudTransfer.send.capture", "cloudTransfer.receive.capture",
                                                        "cloudTransfer.receive.run", "cloudTransfer.send.cancel",
                                                        "cloudTransfer.send.capture", "cloudTransfer.send.run",
                                                        "cloudTransfer.send.run"}));
    // The receive names the documents by cloud id.
    const auto receive = nlohmann::json::parse(server.body("cloudTransfer.receive.run"));
    QCOMPARE(receive["decisions"].size(), std::size_t(2));
    QCOMPARE(receive["decisions"][0]["document_id"].get<std::string>(), std::string("c1"));
    QCOMPARE(receive["decisions"][0]["decision"].get<std::string>(), std::string("keep_local"));
    QCOMPARE(receive["decisions"][1]["document_id"].get<std::string>(), std::string("c2"));
    QCOMPARE(nlohmann::json::parse(server.body("cloudTransfer.send.cancel"))["transfer_id"].get<std::string>(),
             std::string("t1"));
    const auto first = nlohmann::json::parse(server.body("cloudTransfer.send.run", 0));
    QCOMPARE(first["transfer_id"].get<std::string>(), std::string("t2"));
    QVERIFY(!first.contains("decisions"));
    const auto second = nlohmann::json::parse(server.body("cloudTransfer.send.run", 1));
    QCOMPARE(second["decisions"][0]["document_id"].get<std::string>(), std::string("c1"));
    QCOMPARE(second["decisions"][0]["cloud_hash"].get<std::string>(), h1);
    QCOMPARE(transfer.result().value("received").toStringList(), (QStringList{"Theirs", "Cut"}));
    QVERIFY(!transfer.result().value("published").toBool());
  }

  // A workflow created here while the sheet was open shows up in the send
  // captured again after the receive. Nothing is sent until the sheet shows
  // it (review F22).
  void sendsNothingTheSheetDidNotShow() {
    Computer computer;
    computer.server.addCode("code-n", "u1", "Ada");
    auto account = computer.app("node-editor");
    signInWith(this, *account, "code-n");
    QTRY_COMPARE(account->state(), AccountController::State::SignedIn);

    QueueServer server;
    const std::string h1(64, '1');
    server.answer("cloudTransfer.send.capture",
                  trpcData(R"({"status":"captured","transfer_id":"t1","first_publication":false,"operations":[)"
                           R"({"op":"replace_document","kind":"workflow","document_id":"c1","captured_hash":"a",)"
                           R"("base_hash":"b"}],"documents":[{"kind":"workflow","local_id":"l1","cloud_id":"c1",)"
                           R"("name":"Mine"}],"missing_files":[],"skipped":[],"deleted_locally":[]})"));
    server.answer("cloudTransfer.send.capture",
                  trpcData(R"({"status":"captured","transfer_id":"t2","first_publication":false,"operations":[)"
                           R"({"op":"replace_document","kind":"workflow","document_id":"c1","captured_hash":"a",)"
                           R"("base_hash":"b"},{"op":"create_document","kind":"workflow","document_id":"n1",)"
                           R"("captured_hash":"n"}],"documents":[{"kind":"workflow","local_id":"l1","cloud_id":"c1",)"
                           R"("name":"Mine"},{"kind":"workflow","local_id":"n1","cloud_id":"n1","name":"New"}],)"
                           R"("missing_files":[],"skipped":[],"deleted_locally":[]})"));
    server.answer("cloudTransfer.receive.capture",
                  trpcData(R"({"set_id":"s1","documents":[{"kind":"timeline","cloud_id":"c3","local_id":"c3",)"
                           R"("name":"Cut","content_hash":")" + h1 +
                           R"(","status":"cloud_changed","decision":"receive","files":[],"missing_files":[]}]})"));
    server.answer("cloudTransfer.receive.run",
                  trpcData(R"({"status":"finished","set_id":"s1","result":{"received":[)"
                           R"({"kind":"timeline","id":"c3","name":"Cut"}],"changed_during_receive":[],)"
                           R"("not_received":[],"kept_beside":[],"missing_files":[],"file_kept":[]}})"));
    server.answer("cloudTransfer.send.cancel", trpcData(R"({"state":"cancelled"})"));
    server.answer("cloudTransfer.send.run", trpcData(R"({"status":"committed","transfer_id":"t2","result":{}})"));

    TransferController transfer(std::make_unique<SharedTransport>(server));
    transfer.setAccount(account.get());
    transfer.setServerUrl(QUrl(kLocalServer));
    transfer.setServerToken("local-token");
    transfer.setProjectId(QString(32, 'p'));
    transfer.setLinked(true);
    transfer.start();
    QTRY_COMPARE(transfer.stage(), TransferController::Stage::Reviewing);
    transfer.apply();
    QTRY_COMPARE(transfer.stage(), TransferController::Stage::Reviewing);
    QVERIFY(!transfer.message().isEmpty());
    const auto calls = server.calls();
    QVERIFY(std::find(calls.begin(), calls.end(), "cloudTransfer.send.run") == calls.end());
    QStringList names;
    for (const QVariant& row : transfer.rows()) {
      names.append(row.toMap().value("name").toString());
    }
    QVERIFY(names.contains("New"));

    // Seen now, the second apply only sends.
    transfer.apply();
    QTRY_COMPARE(transfer.stage(), TransferController::Stage::Finished);
    QCOMPARE(server.calls().back(), std::string("cloudTransfer.send.run"));
    QCOMPARE(nlohmann::json::parse(server.body("cloudTransfer.send.run"))["transfer_id"].get<std::string>(),
             std::string("t2"));
    const auto all = server.calls();
    QCOMPARE(std::count(all.begin(), all.end(), std::string("cloudTransfer.receive.run")), std::ptrdiff_t(1));
  }

  // A transfer runs only through the app's bundled server. A server off
  // this computer, such as an editor's remote server, gets no request and
  // so never sees the account's access token (review F16).
  void transferRunsOnlyOnTheBundledServer() {
    Computer computer;
    computer.server.addCode("code-r", "u1", "Ada");
    auto account = computer.app("node-editor");
    signInWith(this, *account, "code-r");
    QTRY_COMPARE(account->state(), AccountController::State::SignedIn);
    QueueServer server;
    for (const char* url : {"https://editor.example", "http://192.168.1.4:7777", kServer}) {
      TransferController transfer(std::make_unique<SharedTransport>(server));
      transfer.setAccount(account.get());
      transfer.setServerUrl(QUrl(url));
      transfer.setServerToken("local-token");
      transfer.setProjectId(QString(32, 'p'));
      transfer.start();
      QCOMPARE(transfer.stage(), TransferController::Stage::Failed);
    }
    QVERIFY(server.calls().empty());
  }

  // Publish: a send the cloud refuses for a document changed since the
  // sheet was read asks again. Cancel ends the captured send. Signed out,
  // nothing is sent.
  void publishAsksAgainAndCancels() {
    Computer computer;
    computer.server.addCode("code-p", "u1", "Ada");
    auto account = computer.app("node-editor");
    signInWith(this, *account, "code-p");
    QTRY_COMPARE(account->state(), AccountController::State::SignedIn);

    QueueServer server;
    server.answer("cloudTransfer.send.capture",
                  trpcData(R"({"status":"captured","transfer_id":"t1","first_publication":true,"operations":[)"
                           R"({"op":"create_document","kind":"workflow","document_id":"w1"}],)"
                           R"("documents":[{"kind":"workflow","local_id":"w1","cloud_id":"w1","name":"Flow"}],)"
                           R"("missing_files":[],"skipped":[],"deleted_locally":[]})"));
    server.answer("cloudTransfer.send.run",
                  trpcData(R"({"status":"refused","transfer_id":"t1","failures":[{"code":"BASE_CHANGED",)"
                           R"("kind":"workflow","document_id":"w1","stored_hash":"s9","message":"changed"}]})"));
    server.answer("cloudTransfer.send.run",
                  trpcData(R"({"status":"committed","transfer_id":"t1","result":{"project_id":"p1"}})"));
    server.answer("cloudTransfer.send.cancel", trpcData(R"({"state":"cancelled"})"));

    TransferController transfer(std::make_unique<SharedTransport>(server));
    transfer.setAccount(account.get());
    transfer.setServerUrl(QUrl(kLocalServer));
    transfer.setProjectId(QString(32, 'p'));
    transfer.setProjectName("Film");
    transfer.start();
    QTRY_COMPARE(transfer.stage(), TransferController::Stage::Reviewing);
    QCOMPARE(transfer.rows().size(), 1);
    QVERIFY(transfer.ready());
    QCOMPARE(nlohmann::json::parse(server.body("cloudTransfer.send.capture"))["project_name"].get<std::string>(),
             std::string("Film"));

    transfer.apply();
    QTRY_COMPARE(transfer.stage(), TransferController::Stage::Reviewing);
    QVERIFY(!transfer.message().isEmpty());
    QCOMPARE(transfer.rows().at(0).toMap().value("section").toString(), QString("choice"));
    QVERIFY(!transfer.ready());
    QVERIFY(transfer.choose(0, "keepLocal"));
    transfer.apply();
    QTRY_COMPARE(transfer.stage(), TransferController::Stage::Finished);
    QVERIFY(transfer.result().value("published").toBool());
    const auto again = nlohmann::json::parse(server.body("cloudTransfer.send.run", 1));
    QCOMPARE(again["decisions"][0]["cloud_hash"].get<std::string>(), std::string("s9"));

    // Cancel from the sheet ends the captured send.
    transfer.start();
    QTRY_COMPARE(transfer.stage(), TransferController::Stage::Reviewing);
    transfer.cancel();
    QCOMPARE(transfer.stage(), TransferController::Stage::Idle);
    QTRY_COMPARE(server.body("cloudTransfer.send.cancel").empty(), false);

    account->signOut();
    QTRY_COMPARE(account->state(), AccountController::State::SignedOut);
    const std::size_t before = server.calls().size();
    transfer.start();
    QCOMPARE(transfer.stage(), TransferController::Stage::Failed);
    QVERIFY(!transfer.message().isEmpty());
    QCOMPARE(server.calls().size(), before);
  }

  // Closing a Synchronize sheet ends both captures: the send, and the
  // receive set with its local row (review F41).
  void closingASheetEndsTheSendAndTheReceive() {
    Computer computer;
    computer.server.addCode("code-e", "u1", "Ada");
    auto account = computer.app("node-editor");
    signInWith(this, *account, "code-e");
    QTRY_COMPARE(account->state(), AccountController::State::SignedIn);

    QueueServer server;
    server.answer("cloudTransfer.send.capture",
                  trpcData(R"({"status":"captured","transfer_id":"t1","first_publication":false,"operations":[)"
                           R"({"op":"replace_document","kind":"workflow","document_id":"c1"}],)"
                           R"("documents":[{"kind":"workflow","local_id":"l1","cloud_id":"c1","name":"Mine"}],)"
                           R"("missing_files":[],"skipped":[],"deleted_locally":[]})"));
    server.answer("cloudTransfer.receive.capture", trpcData(R"({"set_id":"s1","documents":[]})"));
    server.answer("cloudTransfer.send.cancel", trpcData(R"({"state":"cancelled"})"));
    server.answer("cloudTransfer.receive.cancel", trpcData(R"({"state":"cancelled"})"));

    TransferController transfer(std::make_unique<SharedTransport>(server));
    transfer.setAccount(account.get());
    transfer.setServerUrl(QUrl(kLocalServer));
    transfer.setProjectId(QString(32, 'p'));
    transfer.setLinked(true);
    transfer.start();
    QTRY_COMPARE(transfer.stage(), TransferController::Stage::Reviewing);
    transfer.cancel();
    QTRY_COMPARE(server.body("cloudTransfer.receive.cancel").empty(), false);
    QCOMPARE(nlohmann::json::parse(server.body("cloudTransfer.receive.cancel"))["set_id"].get<std::string>(),
             std::string("s1"));
    QTRY_COMPARE(server.body("cloudTransfer.send.cancel").empty(), false);
  }

  // When the send a receive made stale cannot be ended, it is not captured
  // again beside it: the sheet says so and nothing is sent (review F41).
  void aSendThatCannotEndIsNotCapturedAgain() {
    Computer computer;
    computer.server.addCode("code-f", "u1", "Ada");
    auto account = computer.app("node-editor");
    signInWith(this, *account, "code-f");
    QTRY_COMPARE(account->state(), AccountController::State::SignedIn);

    QueueServer server;
    server.answer("cloudTransfer.send.capture",
                  trpcData(R"({"status":"captured","transfer_id":"t1","first_publication":false,"operations":[)"
                           R"({"op":"replace_document","kind":"workflow","document_id":"c1"}],)"
                           R"("documents":[{"kind":"workflow","local_id":"l1","cloud_id":"c1","name":"Mine"}],)"
                           R"("missing_files":[],"skipped":[],"deleted_locally":[]})"));
    server.answer("cloudTransfer.receive.capture",
                  trpcData(R"({"set_id":"s1","documents":[)"
                           R"({"kind":"workflow","cloud_id":"c2","local_id":"l2","name":"Theirs","content_hash":"h2",)"
                           R"("status":"cloud_changed","decision":"receive","files":[],"missing_files":[]}]})"));
    server.answer("cloudTransfer.receive.run",
                  trpcData(R"({"status":"finished","set_id":"s1","result":{"received":[)"
                           R"({"kind":"workflow","id":"l2","name":"Theirs"}],)"
                           R"("changed_during_receive":[],"not_received":[],"kept_beside":[],"missing_files":[],)"
                           R"("file_kept":[]}})"));
    // send.cancel has no answer: the local router answers 404.

    TransferController transfer(std::make_unique<SharedTransport>(server));
    transfer.setAccount(account.get());
    transfer.setServerUrl(QUrl(kLocalServer));
    transfer.setProjectId(QString(32, 'p'));
    transfer.setLinked(true);
    transfer.start();
    QTRY_COMPARE(transfer.stage(), TransferController::Stage::Reviewing);
    transfer.apply();
    QTRY_COMPARE(transfer.stage(), TransferController::Stage::Failed);
    QVERIFY(!transfer.message().isEmpty());
    std::size_t captures = 0;
    std::size_t runs = 0;
    for (const auto& call : server.calls()) {
      captures += call == "cloudTransfer.send.capture" ? 1 : 0;
      runs += call == "cloudTransfer.send.run" ? 1 : 0;
    }
    QCOMPARE(captures, std::size_t(1));
    QCOMPARE(runs, std::size_t(0));
  }

  // After the cloud refuses a send for a newer cloud revision, Receive on
  // that row captures a set for the new revision and receives that document
  // alone. The stale replace is captured away and nothing else is sent
  // (review F39).
  void receivingARefusedDocumentReceivesTheNewRevision() {
    Computer computer;
    computer.server.addCode("code-r", "u1", "Ada");
    auto account = computer.app("node-editor");
    signInWith(this, *account, "code-r");
    QTRY_COMPARE(account->state(), AccountController::State::SignedIn);

    QueueServer server;
    server.answer("cloudTransfer.send.capture",
                  trpcData(R"({"status":"captured","transfer_id":"t1","first_publication":false,"operations":[)"
                           R"({"op":"replace_document","kind":"workflow","document_id":"c1","captured_hash":"lh1"}],)"
                           R"("documents":[{"kind":"workflow","local_id":"l1","cloud_id":"c1","name":"Mine"}],)"
                           R"("missing_files":[],"skipped":[],"deleted_locally":[]})"));
    // After the receive, the document equals the cloud: nothing to send.
    server.answer("cloudTransfer.send.capture",
                  trpcData(R"({"status":"captured","transfer_id":"t2","first_publication":false,"operations":[],)"
                           R"("documents":[],"missing_files":[],"skipped":[],"deleted_locally":[]})"));
    server.answer("cloudTransfer.receive.capture", trpcData(R"({"set_id":"s1","documents":[]})"));
    server.answer("cloudTransfer.receive.capture",
                  trpcData(R"({"set_id":"s2","documents":[)"
                           R"({"kind":"workflow","cloud_id":"c1","local_id":"l1","name":"Mine","content_hash":"n1","local_hash":"lh1",)"
                           R"("status":"both_changed","decision":null,"files":[],"missing_files":[]},)"
                           R"({"kind":"workflow","cloud_id":"c9","local_id":"l9","name":"Unseen","content_hash":"n9",)"
                           R"("status":"cloud_changed","decision":"receive","files":[],"missing_files":[]}]})"));
    server.answer("cloudTransfer.receive.run",
                  trpcData(R"({"status":"finished","set_id":"s1","result":{"received":[],)"
                           R"("changed_during_receive":[],"not_received":[],"kept_beside":[],"missing_files":[],)"
                           R"("file_kept":[]}})"));
    server.answer("cloudTransfer.receive.run",
                  trpcData(R"({"status":"finished","set_id":"s2","result":{"received":[)"
                           R"({"kind":"workflow","id":"l1","name":"Mine"}],)"
                           R"("changed_during_receive":[],"not_received":[],"kept_beside":[],"missing_files":[],)"
                           R"("file_kept":[]}})"));
    server.answer("cloudTransfer.send.cancel", trpcData(R"({"state":"cancelled"})"));
    server.answer("cloudTransfer.send.run",
                  trpcData(R"({"status":"refused","transfer_id":"t1","failures":[{"code":"BASE_CHANGED",)"
                           R"("kind":"workflow","document_id":"c1","stored_hash":"n1","message":"changed"}]})"));

    TransferController transfer(std::make_unique<SharedTransport>(server));
    transfer.setAccount(account.get());
    transfer.setServerUrl(QUrl(kLocalServer));
    transfer.setProjectId(QString(32, 'p'));
    transfer.setLinked(true);
    transfer.start();
    QTRY_COMPARE(transfer.stage(), TransferController::Stage::Reviewing);
    transfer.apply();
    QTRY_COMPARE(transfer.stage(), TransferController::Stage::Reviewing);
    QCOMPARE(transfer.rows().size(), 1);
    QCOMPARE(transfer.rows().at(0).toMap().value("section").toString(), QString("choice"));
    QVERIFY(transfer.choose(0, "receive"));
    transfer.apply();
    QTRY_COMPARE(transfer.stage(), TransferController::Stage::Finished);

    const auto received = nlohmann::json::parse(server.body("cloudTransfer.receive.run", 1));
    QCOMPARE(received["set_id"].get<std::string>(), std::string("s2"));
    // The refused document is received. The document the sheet never
    // showed stays as it is here.
    QCOMPARE(received["decisions"].size(), std::size_t(2));
    for (const auto& decision : received["decisions"]) {
      const std::string id = decision["document_id"].get<std::string>();
      QCOMPARE(decision["decision"].get<std::string>(), std::string(id == "c1" ? "receive" : "keep_local"));
    }
    // The stale replace went no further than the first refusal.
    std::size_t runs = 0;
    for (const auto& call : server.calls()) {
      runs += call == "cloudTransfer.send.run" ? 1 : 0;
    }
    QCOMPARE(runs, std::size_t(1));
    QCOMPARE(transfer.result().value("received").toStringList(), QStringList{"Mine"});
  }

  // Receive on a refused document is an approval of two revisions: the
  // cloud revision the refusal named and the local copy the sheet was about
  // to send. When either changed before Apply, nothing is received and the
  // sheet asks again (review F46).
  void receivingARefusedDocumentAsksAgainWhenEitherSideChanged_data() {
    QTest::addColumn<QString>("cloudHash");
    QTest::addColumn<QString>("localHash");
    QTest::newRow("local edited") << "n1" << "lh2";
    QTest::newRow("cloud edited") << "n2" << "lh1";
  }

  void receivingARefusedDocumentAsksAgainWhenEitherSideChanged() {
    QFETCH(QString, cloudHash);
    QFETCH(QString, localHash);
    Computer computer;
    computer.server.addCode("code-g", "u1", "Ada");
    auto account = computer.app("node-editor");
    signInWith(this, *account, "code-g");
    QTRY_COMPARE(account->state(), AccountController::State::SignedIn);

    QueueServer server;
    server.answer("cloudTransfer.send.capture",
                  trpcData(R"({"status":"captured","transfer_id":"t1","first_publication":false,"operations":[)"
                           R"({"op":"replace_document","kind":"workflow","document_id":"c1","captured_hash":"lh1"}],)"
                           R"("documents":[{"kind":"workflow","local_id":"l1","cloud_id":"c1","name":"Mine"}],)"
                           R"("missing_files":[],"skipped":[],"deleted_locally":[]})"));
    server.answer("cloudTransfer.receive.capture", trpcData(R"({"set_id":"s1","documents":[]})"));
    server.answer("cloudTransfer.receive.capture",
                  trpcData(R"({"set_id":"s2","documents":[)"
                           R"({"kind":"workflow","cloud_id":"c1","local_id":"l1","name":"Mine","content_hash":")" +
                           cloudHash.toStdString() + R"(","local_hash":")" + localHash.toStdString() +
                           R"(","status":"both_changed","decision":null,"files":[],"missing_files":[]}]})"));
    server.answer("cloudTransfer.receive.run",
                  trpcData(R"({"status":"finished","set_id":"s1","result":{"received":[],)"
                           R"("changed_during_receive":[],"not_received":[],"kept_beside":[],"missing_files":[],)"
                           R"("file_kept":[]}})"));
    server.answer("cloudTransfer.receive.cancel", trpcData(R"({"state":"cancelled"})"));
    server.answer("cloudTransfer.send.run",
                  trpcData(R"({"status":"refused","transfer_id":"t1","failures":[{"code":"BASE_CHANGED",)"
                           R"("kind":"workflow","document_id":"c1","stored_hash":"n1","message":"changed"}]})"));

    TransferController transfer(std::make_unique<SharedTransport>(server));
    transfer.setAccount(account.get());
    transfer.setServerUrl(QUrl(kLocalServer));
    transfer.setProjectId(QString(32, 'p'));
    transfer.setLinked(true);
    transfer.start();
    QTRY_COMPARE(transfer.stage(), TransferController::Stage::Reviewing);
    transfer.apply();
    QTRY_COMPARE(transfer.stage(), TransferController::Stage::Reviewing);
    QVERIFY(transfer.choose(0, "receive"));
    transfer.apply();
    QTRY_COMPARE(transfer.stage(), TransferController::Stage::Reviewing);
    // Only the first set was received, and the new one was released.
    std::size_t receives = 0;
    for (const auto& call : server.calls()) {
      receives += call == "cloudTransfer.receive.run" ? 1 : 0;
    }
    QCOMPARE(receives, std::size_t(1));
    QCOMPARE(nlohmann::json::parse(server.body("cloudTransfer.receive.cancel"))["set_id"].get<std::string>(),
             std::string("s2"));
    // The row asks again, for the cloud revision as it is now.
    const QVariantMap row = transfer.rows().at(0).toMap();
    QCOMPARE(row.value("section").toString(), QString("choice"));
    QVERIFY(row.value("choice").toString().isEmpty());
    QVERIFY(!transfer.ready());
  }

  // After a refused attempt, withdrawing the last deletion confirmation
  // sends an empty list, which the router takes as no deletion (review F43).
  void aWithdrawnDeletionIsNotSent() {
    Computer computer;
    computer.server.addCode("code-w", "u1", "Ada");
    auto account = computer.app("node-editor");
    signInWith(this, *account, "code-w");
    QTRY_COMPARE(account->state(), AccountController::State::SignedIn);

    QueueServer server;
    server.answer("cloudTransfer.send.capture",
                  trpcData(R"({"status":"captured","transfer_id":"t1","first_publication":false,"operations":[],)"
                           R"("documents":[],"missing_files":[],"skipped":[],"deleted_locally":[)"
                           R"({"kind":"workflow","local_id":"w1","cloud_id":"cw1","base_hash":"b1"}]})"));
    server.answer("cloudTransfer.send.run",
                  trpcData(R"({"status":"refused","transfer_id":"t1","failures":[{"code":"QUOTA",)"
                           R"("kind":"workflow","document_id":"cw1","message":"full"}]})"));
    server.answer("cloudTransfer.send.run",
                  trpcData(R"({"status":"committed","transfer_id":"t1","result":{"project_id":"p1"}})"));

    TransferController transfer(std::make_unique<SharedTransport>(server));
    transfer.setAccount(account.get());
    transfer.setServerUrl(QUrl(kLocalServer));
    transfer.setProjectId(QString(32, 'p'));
    transfer.start();
    QTRY_COMPARE(transfer.stage(), TransferController::Stage::Reviewing);
    QVERIFY(transfer.confirmDeletion(0, true));
    transfer.apply();
    QTRY_COMPARE(transfer.stage(), TransferController::Stage::Reviewing);
    QVERIFY(transfer.confirmDeletion(0, false));
    transfer.apply();
    QTRY_COMPARE(transfer.stage(), TransferController::Stage::Finished);
    const auto again = nlohmann::json::parse(server.body("cloudTransfer.send.run", 1));
    QVERIFY(again.contains("confirm_deletes"));
    QCOMPARE(again["confirm_deletes"], nlohmann::json::array());
  }

  // A confirmed deletion names the cloud revision the sheet showed. When the
  // cloud refuses it because the document changed there since, the sheet
  // withdraws the confirmation and asks again for the newer revision
  // (V4, review F40).
  void aRefusedDeletionIsConfirmedAgain() {
    Computer computer;
    computer.server.addCode("code-x", "u1", "Ada");
    auto account = computer.app("node-editor");
    signInWith(this, *account, "code-x");
    QTRY_COMPARE(account->state(), AccountController::State::SignedIn);

    QueueServer server;
    server.answer("cloudTransfer.send.capture",
                  trpcData(R"({"status":"captured","transfer_id":"t1","first_publication":false,"operations":[],)"
                           R"("documents":[],"missing_files":[],"skipped":[],"deleted_locally":[)"
                           R"({"kind":"workflow","local_id":"w1","cloud_id":"cw1","base_hash":"b1"}]})"));
    server.answer("cloudTransfer.send.run",
                  trpcData(R"({"status":"refused","transfer_id":"t1","failures":[{"code":"BASE_CHANGED",)"
                           R"("kind":"workflow","document_id":"cw1","stored_hash":"s2","message":"changed"}]})"));
    server.answer("cloudTransfer.send.run",
                  trpcData(R"({"status":"committed","transfer_id":"t1","result":{"project_id":"p1"}})"));

    TransferController transfer(std::make_unique<SharedTransport>(server));
    transfer.setAccount(account.get());
    transfer.setServerUrl(QUrl(kLocalServer));
    transfer.setProjectId(QString(32, 'p'));
    transfer.start();
    QTRY_COMPARE(transfer.stage(), TransferController::Stage::Reviewing);
    QCOMPARE(transfer.rows().size(), 1);
    QVERIFY(transfer.confirmDeletion(0, true));
    transfer.apply();
    QTRY_COMPARE(transfer.stage(), TransferController::Stage::Reviewing);
    const QVariantMap row = transfer.rows().at(0).toMap();
    QCOMPARE(row.value("section").toString(), QString("deletion"));
    QVERIFY(!row.value("confirmed").toBool());
    const auto first = nlohmann::json::parse(server.body("cloudTransfer.send.run", 0));
    QCOMPARE(first["confirm_deletes"][0]["cloud_hash"].get<std::string>(), std::string("b1"));

    QVERIFY(transfer.confirmDeletion(0, true));
    transfer.apply();
    QTRY_COMPARE(transfer.stage(), TransferController::Stage::Finished);
    const auto again = nlohmann::json::parse(server.body("cloudTransfer.send.run", 1));
    QCOMPARE(again["confirm_deletes"][0]["cloud_id"].get<std::string>(), std::string("cw1"));
    QCOMPARE(again["confirm_deletes"][0]["cloud_hash"].get<std::string>(), std::string("s2"));
  }

  // A media file changed in place while its workflow stayed the same is
  // work to send: the sheet shows it and Synchronize sends it (review F33).
  void synchronizeSendsAFileOnlyChange() {
    Computer computer;
    computer.server.addCode("code-f", "u1", "Ada");
    auto account = computer.app("node-editor");
    signInWith(this, *account, "code-f");
    QTRY_COMPARE(account->state(), AccountController::State::SignedIn);

    QueueServer server;
    const std::string before(64, 'b');
    const std::string after(64, 'a');
    server.answer("cloudTransfer.send.capture",
                  trpcData(R"({"status":"captured","transfer_id":"t1","first_publication":false,"operations":[],)"
                           R"("file_operations":[{"op":"put_asset_file","asset_id":"a1","path":"media/still.png",)"
                           R"("hash":")" + after + R"(","size":4,"base_hash":")" + before +
                           R"(","name":"still.png","content_type":"image/png"}],"documents":[],)"
                           R"("missing_files":[],"missing_document_files":[],"skipped":[],"deleted_locally":[]})"));
    server.answer("cloudTransfer.receive.capture", trpcData(R"({"set_id":"s1","documents":[]})"));
    server.answer("cloudTransfer.receive.run",
                  trpcData(R"({"status":"finished","set_id":"s1","result":{"received":[],)"
                           R"("changed_during_receive":[],"not_received":[],"kept_beside":[],"missing_files":[],)"
                           R"("file_kept":[]}})"));
    server.answer("cloudTransfer.send.run", trpcData(R"({"status":"committed","transfer_id":"t1","result":{}})"));

    TransferController transfer(std::make_unique<SharedTransport>(server));
    transfer.setAccount(account.get());
    transfer.setServerUrl(QUrl(kLocalServer));
    transfer.setProjectId(QString(32, 'p'));
    transfer.setLinked(true);
    transfer.start();
    QTRY_COMPARE(transfer.stage(), TransferController::Stage::Reviewing);
    QCOMPARE(transfer.rows().size(), 1);
    QCOMPARE(transfer.rows().at(0).toMap().value("section").toString(), QString("send"));
    QCOMPARE(transfer.rows().at(0).toMap().value("name").toString(), QString("media/still.png"));
    transfer.apply();
    QTRY_COMPARE(transfer.stage(), TransferController::Stage::Finished);
    QCOMPARE(server.calls().back(), std::string("cloudTransfer.send.run"));
    QVERIFY(transfer.result().value("sent").toBool());
  }

  // A send with a missing file waits until the person confirms each file,
  // then sends the capture's entry back as the confirmation (X7, review F36).
  void publishWithoutAMissingFileOnlyOnceConfirmed() {
    Computer computer;
    computer.server.addCode("code-m", "u1", "Ada");
    auto account = computer.app("node-editor");
    signInWith(this, *account, "code-m");
    QTRY_COMPARE(account->state(), AccountController::State::SignedIn);

    QueueServer server;
    const std::string missing =
        R"({"asset_id":"a1","reason":"missing_locally","documents":[{"kind":"workflow","document_id":"w1"}]})";
    server.answer("cloudTransfer.send.capture",
                  trpcData(R"({"status":"captured","transfer_id":"t1","first_publication":true,"operations":[)"
                           R"({"op":"create_document","kind":"workflow","document_id":"w1"}],)"
                           R"("documents":[{"kind":"workflow","local_id":"w1","cloud_id":"w1","name":"Flow"}],)"
                           R"("missing_files":[)" + missing + R"(],"skipped":[],"deleted_locally":[]})"));
    server.answer("cloudTransfer.send.run",
                  trpcData(R"({"status":"committed","transfer_id":"t1","result":{"project_id":"p1"}})"));

    TransferController transfer(std::make_unique<SharedTransport>(server));
    transfer.setAccount(account.get());
    transfer.setServerUrl(QUrl(kLocalServer));
    transfer.setProjectId(QString(32, 'p'));
    transfer.start();
    QTRY_COMPARE(transfer.stage(), TransferController::Stage::Reviewing);
    int problem = -1;
    for (const QVariant& value : transfer.rows()) {
      const QVariantMap row = value.toMap();
      if (row.value("canSendWithout").toBool()) {
        problem = row.value("index").toInt();
      }
    }
    QVERIFY(problem >= 0);
    QVERIFY(!transfer.ready());
    transfer.apply();
    QCOMPARE(transfer.stage(), TransferController::Stage::Reviewing);
    QVERIFY(transfer.confirmMissingFile(problem, true));
    QVERIFY(transfer.ready());
    transfer.apply();
    QTRY_COMPARE(transfer.stage(), TransferController::Stage::Finished);
    const auto body = nlohmann::json::parse(server.body("cloudTransfer.send.run"));
    QCOMPARE(body["confirm_missing_files"], nlohmann::json::array({nlohmann::json::parse(missing)}));
  }

  // Closing the sheet while a long request runs returns at once: the
  // controller cancels the request before it joins its task thread, instead
  // of waiting out the request's deadline (review F42).
  void closingCancelsARunningRequest() {
    Computer computer;
    computer.server.addCode("code-c", "u1", "Ada");
    auto account = computer.app("node-editor");
    signInWith(this, *account, "code-c");
    QTRY_COMPARE(account->state(), AccountController::State::SignedIn);
    // Answers only once the request is cancelled, or after 20 seconds.
    class UntilCancelled final : public HttpTransport {
    public:
      std::atomic<bool> started{false};
      HttpResponse send(const HttpRequest& request) override {
        started = true;
        const auto until = std::chrono::steady_clock::now() + std::chrono::seconds(20);
        while (std::chrono::steady_clock::now() < until && !(request.cancel && request.cancel->cancelled())) {
          std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
        return {0, {}};
      }
    };
    UntilCancelled server;
    auto transfer = std::make_unique<TransferController>(std::make_unique<SharedTransport>(server));
    transfer->setAccount(account.get());
    transfer->setServerUrl(QUrl(kLocalServer));
    transfer->setProjectId(QString(32, 'p'));
    transfer->start();
    QTRY_VERIFY(server.started.load());
    const auto before = std::chrono::steady_clock::now();
    transfer.reset();
    QVERIFY(std::chrono::steady_clock::now() - before < std::chrono::seconds(5));
  }

  void statusSentences() {
    using S = CloudDocument::SyncStatus;
    QCOMPARE(syncStatusText(S::SavedToCloud, 0, {}, {}), QString("Saved to cloud"));
    QCOMPARE(syncStatusText(S::Sending, 1, {}, {}), QString("Sending"));
    QCOMPARE(syncStatusText(S::ChangesWaiting, 3, {}, {}), QString("3 changes waiting"));
    QCOMPARE(syncStatusText(S::Offline, 3, "14:02", {}), QString("Offline, 3 changes waiting, last connected 14:02"));
    QCOMPARE(syncStatusText(S::Offline, 0, "14:02", {}), QString("Offline, last connected 14:02"));
    QCOMPARE(syncStatusText(S::CloudStatusUnknown, 1, {}, {}), QString("Cloud status unknown, 1 change waiting"));
    QVERIFY(syncStatusText(S::NotSaving, 1, {}, {}).startsWith("Not saving"));
    QCOMPARE(syncStatusText(S::Unsent, 1, {}, "SCHEMA_DOWNGRADE"),
             QString("Unsent edits: stored in a newer format than this app writes"));
  }
};

QTEST_GUILESS_MAIN(AccountQtTest)
#include "tst_account_qt.moc"
