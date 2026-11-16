// The Qt half of the account service. QtHttpTransport runs against a local
// HTTP server on its own thread. Two AccountControllers on one data folder
// and one in-memory keychain stand in for the two apps, against the fake
// token server.
#include "nodetool/account/account_session.h"
#include "nodetool/account/accounts_index.h"
#include "nodetool/account/qt/AccountController.h"
#include "nodetool/account/qt/QtHttpTransport.h"
#include "test_support.h"

#include <QSignalSpy>
#include <QTcpServer>
#include <QTcpSocket>
#include <QTest>
#include <QUrlQuery>

#include <atomic>
#include <future>
#include <mutex>
#include <vector>
#include <thread>

using namespace nodetool::account;
using namespace nodetool::account::qt;

namespace {

constexpr const char* kServer = "https://nt.example";

// A local HTTP server that answers every request with one canned response,
// and records the last request's head. An empty response never answers.
//
// Thread affinity: thread-safe. The QTcpServer and its sockets live on the
// server's own std::thread and use Qt's blocking calls, so nothing crosses
// threads through Qt's event queue. `mutex_` guards the record.
class CannedServer {
public:
  explicit CannedServer(QByteArray response) : response_(std::move(response)) {
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
      socket->write(response_);
      socket->waitForBytesWritten(1000);
      socket->disconnectFromHost();
      if (socket->state() != QAbstractSocket::UnconnectedState) {
        socket->waitForDisconnected(1000);
      }
    }
  }

  const QByteArray response_;
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

  std::unique_ptr<AccountController> app(const std::string& name) {
    AccountServices services;
    services.dataDir = data.path();
    services.serverOrigin = kServer;
    services.app = name;
    services.store = std::make_unique<SharedStore>(keychain);
    services.endpoint = std::make_unique<SharedEndpoint>(server);
    services.policy = [this] { return policy; };
    services.nowMs = clock.fn();
    services.signInTimeout = std::chrono::seconds(10);
    return std::make_unique<AccountController>(std::move(services));
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
    qunsetenv("NODETOOL_CLOUD_SERVER");
  }
};

QTEST_GUILESS_MAIN(AccountQtTest)
#include "tst_account_qt.moc"
