#include "account_helper.h"

#include "nodetool/account/accounts_index.h"
#include "nodetool/account/cloud_transfer.h"
#include "nodetool/account/origin.h"
#include "nodetool/account/session_record.h"

#include <algorithm>
#include <array>
#include <deque>
#include <map>
#include <string_view>
#include <utility>

namespace nodetool::account_helper {

using account::AccountSession;
using account::SessionState;

namespace {

enum class State { SignedOut, SigningIn, SignedIn };

const char* stateName(State state) {
  switch (state) {
  case State::SigningIn:
    return "signingIn";
  case State::SignedIn:
    return "signedIn";
  case State::SignedOut:
    break;
  }
  return "signedOut";
}

// Request threads. Each one blocks on the main process for the length of
// one request, so a few let a slow response not hold the others.
constexpr size_t kRequestThreads = 6;
// Requests waiting for a thread. More are answered BUSY.
constexpr size_t kMaxQueuedRequests = 256;
constexpr std::chrono::milliseconds kDefaultRequestTimeout{30000};
constexpr std::chrono::milliseconds kMaxRequestTimeout{120000};

// The shape of a path the main process may ask for. The main process
// applies the list of routes. This rules out what no route has: another
// host, a fragment, a dot segment, and the token endpoints, which a
// credential must never reach on behalf of the renderer.
bool cloudPath(std::string_view path) {
  if (path.empty() || path.size() > 4096 || path.front() != '/' || path.starts_with("//") ||
      path.starts_with("/oauth/") || path == "/oauth") {
    return false;
  }
  for (const char c : path) {
    if (c < 0x21 || c > 0x7e || c == '\\' || c == '#') {
      return false;
    }
  }
  const std::string_view route = path.substr(0, path.find('?'));
  return route.find("/./") == std::string_view::npos && route.find("/../") == std::string_view::npos &&
         !route.ends_with("/.") && !route.ends_with("/..");
}

bool cloudMethod(std::string_view method) {
  static constexpr std::array<std::string_view, 6> kMethods = {"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"};
  return std::find(kMethods.begin(), kMethods.end(), method) != kMethods.end();
}

// The main process's id of a request: a whole number of at least 0.
std::optional<uint64_t> requestId(const nlohmann::json& message) {
  const auto id = message.find("id");
  if (id == message.end() || !id->is_number_integer() || (!id->is_number_unsigned() && id->get<int64_t>() < 0)) {
    return std::nullopt;
  }
  return id->get<uint64_t>();
}

const char* transferStatusName(account::TransferStatus status) {
  switch (status) {
  case account::TransferStatus::Ok:
    return "ok";
  case account::TransferStatus::SignedOut:
    return "signedOut";
  case account::TransferStatus::Offline:
    return "offline";
  case account::TransferStatus::Refused:
    return "refused";
  case account::TransferStatus::LocalUnavailable:
    break;
  }
  return "localUnavailable";
}

} // namespace

// The helper's state and the work on it. Every thread of the helper reaches
// it through a shared or weak reference.
//
// Thread affinity: thread-safe. `mutex` guards every member below it.
// `policyAllows` is an atomic that sessions read on any thread.
struct AccountHelper::Core : std::enable_shared_from_this<Core> {
  Core(HelperOptions o, Emit e) : options(std::move(o)), emit(std::move(e)) {}

  const HelperOptions options;
  const Emit emit;
  std::atomic<bool> policyAllows{false};

  std::mutex mutex;
  std::condition_variable wake;
  std::deque<std::function<void()>> tasks;
  // Server ends, on their own thread, so a server that holds one never
  // delays a sign-out or a state change on `tasks`.
  std::condition_variable networkWake;
  std::deque<std::function<void()>> networkTasks;
  bool serverEndRunning = false;
  // A sign-out came while a server end ran: the next one runs at once.
  bool serverEndAgain = false;
  bool stopping = false;
  State state = State::SignedOut;
  std::string displayName;
  // The signed-in account's id, which the desktop app's caches are keyed by.
  // Empty until the refresh after a sign-in reads it.
  std::string accountId;
  bool serverEndPending = false;
  bool cloudAvailable = true;
  std::string message;
  bool policyMessageShown = false;
  bool browserFailed = false;
  // Set by a cancel for the current attempt, from its start until its
  // credential is stored. The attempt checks it before it waits and after
  // the exchange.
  bool attemptCancelled = false;
  // The sign-in that waits for the browser, owned by the sign-in thread,
  // which sets and clears it.
  account::SignInFlow* flow = nullptr;
  // Shared with the tasks that use it while the index may replace it.
  std::shared_ptr<AccountSession> session;
  unsigned serverEndAttempt = 0;
  std::optional<int64_t> nextServerEndMs;
  std::optional<nlohmann::json> lastState;
  // False until the first read of the record, so the main process never
  // sees a signed-out state that only means "not read yet".
  bool stateKnown = false;
  // Protocol version 2: the work of the request threads, and the cancel
  // flag of each request, transfer and socket token from its message until
  // its answer, by the main process's id.
  std::condition_variable requestWake;
  std::deque<std::function<void()>> requestTasks;
  std::map<uint64_t, std::shared_ptr<account::RequestCancel>> inFlight;

  int64_t now() const {
    if (options.nowMs) {
      return options.nowMs();
    }
    return std::chrono::duration_cast<std::chrono::milliseconds>(
               std::chrono::system_clock::now().time_since_epoch())
        .count();
  }

  void post(std::function<void()> task) {
    {
      const std::lock_guard lock(mutex);
      if (stopping) {
        return;
      }
      tasks.push_back(std::move(task));
    }
    wake.notify_all();
  }

  void postNetwork(std::function<void()> task) {
    {
      const std::lock_guard lock(mutex);
      if (stopping) {
        return;
      }
      networkTasks.push_back(std::move(task));
    }
    networkWake.notify_all();
  }

  void runNetwork() {
    for (;;) {
      std::function<void()> task;
      {
        std::unique_lock lock(mutex);
        networkWake.wait(lock, [this] { return stopping || !networkTasks.empty(); });
        if (stopping) {
          return;
        }
        task = std::move(networkTasks.front());
        networkTasks.pop_front();
      }
      task();
    }
  }

  void postRefresh() {
    post([weak = weak_from_this()] {
      if (const auto core = weak.lock()) {
        core->refresh();
      }
    });
  }

  void runTasks() {
    for (;;) {
      std::function<void()> task;
      {
        std::unique_lock lock(mutex);
        wake.wait(lock, [this] { return stopping || !tasks.empty(); });
        if (stopping) {
          return;
        }
        task = std::move(tasks.front());
        tasks.pop_front();
      }
      task();
    }
  }

  void runTicker() {
    std::unique_lock lock(mutex);
    while (!stopping) {
      wake.wait_for(lock, options.tick, [this] { return stopping; });
      if (stopping) {
        return;
      }
      if (!tasks.empty()) {
        continue;
      }
      tasks.push_back([weak = weak_from_this()] {
        if (const auto core = weak.lock()) {
          core->readPolicy();
          core->refresh();
        }
      });
      lock.unlock();
      wake.notify_all();
      lock.lock();
    }
  }

  // Sends the state message when it differs from the last one sent. Called
  // with `mutex` held through `lock`, which it releases around the write.
  void emitStateLocked(std::unique_lock<std::mutex>& lock) {
    nlohmann::json next = {{"type", "state"},
                           {"state", stateName(state)},
                           {"displayName", displayName},
                           {"accountId", accountId},
                           {"serverOrigin", options.serverOrigin},
                           {"serverEndPending", serverEndPending},
                           {"cloudAvailable", cloudAvailable},
                           {"keychainAvailable", options.keychainAvailable},
                           {"message", message}};
    if (!stateKnown || (lastState && *lastState == next)) {
      return;
    }
    lastState = next;
    lock.unlock();
    emit(next);
    lock.lock();
  }

  // Reads the managed policy. Returns whether it allows the server.
  bool readPolicy() {
    account::PolicyCheck check =
        options.policy ? account::checkServer(options.policy(), options.serverOrigin) : account::PolicyCheck{};
    if (check.decision == account::PolicyDecision::Allowed && options.serverOrigin.empty()) {
      // No browser opens and nothing is sent to a server that is not an
      // HTTPS origin.
      check.decision = account::PolicyDecision::ServerNotAllowed;
      check.reason = "The cloud server address is not an HTTPS address, so sign-in is turned off.";
    }
    const bool allows = check.decision == account::PolicyDecision::Allowed;
    policyAllows.store(allows, std::memory_order_release);
    std::unique_lock lock(mutex);
    cloudAvailable = check.decision != account::PolicyDecision::CloudOff;
    // The policy's reason replaces any message. An allowing policy clears
    // only a reason it showed, never a sign-in's own message.
    if (!allows) {
      message = check.reason;
    } else if (policyMessageShown) {
      message.clear();
    }
    policyMessageShown = !allows;
    emitStateLocked(lock);
    return allows;
  }

  account::AccountSessionOptions sessionOptions(const std::string& userId) {
    account::AccountSessionOptions o;
    o.dataDir = options.dataDir;
    o.serverOrigin = options.serverOrigin;
    o.userId = userId;
    o.nowMs = options.nowMs;
    o.fault = options.fault;
    o.lockTimeout = options.lockTimeout;
    // Runs on the thread that noticed, with no lock held. The helper holds
    // the credential nowhere else, so it only reads the state again. The
    // Core owns the session, so the session holds the Core weakly.
    o.onSignedOut = [weak = weak_from_this()] {
      if (const auto core = weak.lock()) {
        core->postRefresh();
      }
    };
    o.credentialAllowed = [weak = weak_from_this()] {
      const auto core = weak.lock();
      return core && core->policyAllows.load(std::memory_order_acquire);
    };
    return o;
  }

  std::shared_ptr<AccountSession> currentSession() {
    const std::lock_guard lock(mutex);
    return session;
  }

  // The session of the account signed in to this server, read again from
  // `accounts.json` and the records at each call, so an account another app
  // signed in to replaces the one held here. With none signed in, the held
  // session stays, or the first listed account's.
  std::shared_ptr<AccountSession> sessionFromIndex() {
    const std::shared_ptr<AccountSession> held = currentSession();
    const std::string origin = account::normalizeOrigin(options.serverOrigin);
    std::shared_ptr<AccountSession> first;
    for (const account::AccountEntry& entry : account::AccountsIndex(options.dataDir).list()) {
      if (account::normalizeOrigin(entry.serverOrigin) != origin) {
        continue;
      }
      // Without a keychain the helper's store is its own memory, which
      // holds no other app's record. An account it can't read is left
      // alone: its repair rule would take the missing record for a
      // sign-out and end that app's session.
      if (!options.keychainAvailable &&
          !account::readSessionRecord(*options.store, account::keychainAccount(options.serverOrigin, entry.userId))) {
        continue;
      }
      std::shared_ptr<AccountSession> candidate =
          held && held->accountId() == entry.userId
              ? held
              : std::make_shared<AccountSession>(*options.store, *options.endpoint, sessionOptions(entry.userId));
      if (candidate->status().state == SessionState::SignedIn) {
        return adopt(held, std::move(candidate));
      }
      if (!first) {
        first = std::move(candidate);
      }
    }
    if (held || !first) {
      return held;
    }
    return adopt(held, std::move(first));
  }

  // Holds `next` unless a sign-in replaced `expected` meanwhile.
  std::shared_ptr<AccountSession> adopt(const std::shared_ptr<AccountSession>& expected,
                                        std::shared_ptr<AccountSession> next) {
    const std::lock_guard lock(mutex);
    if (session == expected) {
      session = std::move(next);
    }
    return session;
  }

  int64_t retryAt(unsigned attempt) const {
    return now() +
           std::chrono::duration_cast<std::chrono::milliseconds>(account::endSessionRetryDelay(attempt)).count();
  }

  // Task thread.
  void refresh() {
    if (options.serverOrigin.empty()) {
      std::unique_lock lock(mutex);
      stateKnown = true;
      emitStateLocked(lock);
      return;
    }
    const std::shared_ptr<AccountSession> current = sessionFromIndex();
    State next = State::SignedOut;
    std::string name;
    std::string id;
    bool pending = false;
    if (current) {
      const bool allowed = policyAllows.load(std::memory_order_acquire);
      // The state comes from the record and the generation file. Reading it
      // never renews a token: only a cloud request does (TC112).
      const AccountSession::Status status = current->status();
      if (status.state == SessionState::SignedOut) {
        // A sign-out in another app. The session adopts it, which stops the
        // cloud requests it authorized that are still on the wire (TC119).
        // With the file signed out this makes no server call.
        current->checkGenerationFile();
      }
      next = allowed && status.state == SessionState::SignedIn ? State::SignedIn : State::SignedOut;
      name = status.displayName;
      if (next == State::SignedIn) {
        id = current->accountId();
      }
      pending = status.serverEndPending;
    }

    bool endNow = false;
    {
      std::unique_lock lock(mutex);
      stateKnown = true;
      if (state != State::SigningIn) {
        state = next;
      }
      displayName = name;
      accountId = id;
      serverEndPending = pending;
      if (!pending) {
        serverEndAttempt = 0;
        nextServerEndMs.reset();
      } else if (!serverEndRunning && (!nextServerEndMs || now() >= *nextServerEndMs)) {
        // The first time a pending end is seen, such as at the helper's
        // start or after a sign-out, it is tried at once.
        endNow = true;
        serverEndRunning = true;
      }
      emitStateLocked(lock);
    }
    if (endNow && current) {
      postNetwork([weak = weak_from_this(), current] {
        const bool stillPending = current->endPendingSessions() == account::ServerEnd::Pending;
        const auto core = weak.lock();
        if (!core) {
          return;
        }
        {
          const std::lock_guard lock(core->mutex);
          core->serverEndRunning = false;
          if (core->serverEndAgain) {
            core->serverEndAgain = false;
            core->serverEndAttempt = 0;
            core->nextServerEndMs.reset();
          } else {
            core->serverEndAttempt = stillPending ? core->serverEndAttempt + 1 : 0;
            core->nextServerEndMs = core->retryAt(core->serverEndAttempt);
          }
        }
        core->postRefresh();
      });
    } else if (endNow) {
      const std::lock_guard lock(mutex);
      serverEndRunning = false;
    }
  }

  // The sign-in thread.
  void runSignIn() {
    account::SignInFlow flowOfAttempt(*options.store, *options.endpoint, sessionOptions({}));
    const std::optional<std::string> url = flowOfAttempt.begin(options.app, options.deviceName);
    if (!url) {
      finishSignIn(false, {}, "The sign-in could not open a port on this computer for the browser to return to.");
      return;
    }
    {
      const std::lock_guard lock(mutex);
      flow = &flowOfAttempt;
      // A cancel that came before the flow was published.
      if (attemptCancelled) {
        flowOfAttempt.cancel();
      }
    }
    emit({{"type", "openBrowser"}, {"url", *url}});
    const account::SignInResult result = flowOfAttempt.finish(options.signInTimeout);
    bool cancelled = false;
    {
      const std::lock_guard lock(mutex);
      flow = nullptr;
      cancelled = attemptCancelled;
    }
    std::string text;
    switch (result.status) {
    case account::SignInStatus::SignedIn: {
      auto signedIn =
          std::make_shared<AccountSession>(*options.store, *options.endpoint, sessionOptions(result.userId));
      if (cancelled) {
        // The cancel came while the code was being exchanged. The session
        // the server just made is ended rather than kept.
        signedIn->signOut();
        finishSignIn(false, {}, {});
        return;
      }
      const std::lock_guard lock(mutex);
      session = std::move(signedIn);
      break;
    }
    case account::SignInStatus::Denied:
      text = result.message.empty() ? "The sign-in was declined." : "The sign-in was declined: " + result.message;
      break;
    case account::SignInStatus::TimedOut:
      // A cancel ends the wait the same way. The person chose it.
      break;
    case account::SignInStatus::Failed:
      text = result.message.empty() ? "The sign-in failed." : result.message;
      break;
    }
    finishSignIn(result.status == account::SignInStatus::SignedIn, result.displayName, text);
  }

  void finishSignIn(bool signedIn, const std::string& name, const std::string& text) {
    {
      std::unique_lock lock(mutex);
      state = signedIn ? State::SignedIn : State::SignedOut;
      if (signedIn) {
        displayName = name;
      }
      message = browserFailed && !signedIn
                    ? "The browser could not be opened. Set a default browser, then sign in again."
                    : text;
      browserFailed = false;
      emitStateLocked(lock);
    }
    postRefresh();
  }

  void cancelAttempt(bool becauseBrowserFailed) {
    const std::lock_guard lock(mutex);
    if (state != State::SigningIn) {
      return;
    }
    attemptCancelled = true;
    if (becauseBrowserFailed) {
      browserFailed = true;
    }
    if (flow != nullptr) {
      flow->cancel();
    }
  }

  void runRequests() {
    for (;;) {
      std::function<void()> task;
      {
        std::unique_lock lock(mutex);
        requestWake.wait(lock, [this] { return stopping || !requestTasks.empty(); });
        if (stopping) {
          return;
        }
        task = std::move(requestTasks.front());
        requestTasks.pop_front();
      }
      task();
    }
  }

  // Registers the id and queues `work` with its cancel flag. Returns the
  // error to answer at once: INVALID for an id already in flight, BUSY
  // when the queue is full, OFFLINE while the helper stops.
  std::string queueRequest(uint64_t id, std::function<void(std::shared_ptr<account::RequestCancel>)> work) {
    auto cancel = std::make_shared<account::RequestCancel>();
    {
      const std::lock_guard lock(mutex);
      if (stopping) {
        return "OFFLINE";
      }
      if (inFlight.contains(id)) {
        return "INVALID";
      }
      if (requestTasks.size() >= kMaxQueuedRequests) {
        return "BUSY";
      }
      inFlight.emplace(id, cancel);
      requestTasks.push_back([work = std::move(work), cancel] { work(cancel); });
    }
    requestWake.notify_one();
    return {};
  }

  void forget(uint64_t id) {
    const std::lock_guard lock(mutex);
    inFlight.erase(id);
  }

  void cancelRequest(uint64_t id) {
    const std::lock_guard lock(mutex);
    if (const auto it = inFlight.find(id); it != inFlight.end()) {
      it->second->cancel();
    }
  }

  // The signed-in session the credential comes from, or null.
  std::shared_ptr<AccountSession> signedInSession() {
    if (!policyAllows.load(std::memory_order_acquire)) {
      return nullptr;
    }
    std::shared_ptr<AccountSession> current = currentSession();
    if (!current) {
      current = sessionFromIndex();
    }
    return current;
  }

  void answer(uint64_t id, int status, std::string_view error) {
    forget(id);
    emit({{"type", "response"}, {"id", id}, {"status", status}, {"error", error}});
  }

  // A request thread. One cloud request of the renderer: the request rule
  // before each attach, and on a 401 one renewal and one more send. The
  // main process holds the request's body and headers and the response's,
  // so the helper sees the status only.
  void runCloudRequest(uint64_t id, const std::string& method, const std::string& path,
                       std::chrono::milliseconds timeout, const std::shared_ptr<account::RequestCancel>& mine) {
    const std::shared_ptr<AccountSession> current = signedInSession();
    if (!current) {
      answer(id, 0, "SIGNED_OUT");
      return;
    }
    if (options.transport == nullptr) {
      answer(id, 0, "OFFLINE");
      return;
    }
    std::string rejected;
    for (int attempt = 0; attempt < 2; ++attempt) {
      if (mine->cancelled()) {
        answer(id, 0, "CANCELLED");
        return;
      }
      if (attempt == 1) {
        const account::RefreshOutcome renewed = current->refresh(rejected);
        if (renewed == account::RefreshOutcome::SignedOut) {
          answer(id, 0, "SIGNED_OUT");
          return;
        }
        if (renewed == account::RefreshOutcome::Offline) {
          answer(id, 0, "OFFLINE");
          return;
        }
      }
      const account::Authorization auth = current->authorizeRequest();
      if (auth.status != account::CredentialStatus::Ready) {
        answer(id, 0, auth.status == account::CredentialStatus::SignedOut ? "SIGNED_OUT" : "OFFLINE");
        return;
      }
      account::HttpRequest request;
      request.method = method;
      request.url = options.serverOrigin + path;
      request.headers = {{"Authorization", "Bearer " + auth.accessToken}};
      request.timeout = timeout;
      request.requiredOrigin = options.serverOrigin;
      request.cancel = auth.cancel;
      const account::HttpResponse response = options.transport->send(request, {{"request", id}}, mine);
      if (mine->cancelled()) {
        answer(id, 0, "CANCELLED");
        return;
      }
      if (auth.cancel->cancelled()) {
        // This app moved to signed out while the request was on the wire.
        answer(id, 0, "SIGNED_OUT");
        return;
      }
      if (response.status == 401 && attempt == 0) {
        rejected = auth.accessToken;
        continue;
      }
      answer(id, response.status, response.status == 0 ? "OFFLINE" : "");
      return;
    }
    answer(id, 401, "");
  }

  // A request thread. One call of the local server's transfer router, with
  // the account and, where the procedure carries it, the access token added
  // here (technical design, "Transfer call").
  void runTransfer(uint64_t id, const std::string& procedure, const nlohmann::json& input,
                   const std::string& localOrigin, const std::shared_ptr<account::RequestCancel>& mine) {
    const auto finish = [&](std::string_view status, const std::string& reason, nlohmann::json data) {
      forget(id);
      emit({{"type", "transferResult"}, {"id", id}, {"status", status}, {"reason", reason}, {"data", std::move(data)}});
    };
    const std::shared_ptr<AccountSession> current = signedInSession();
    if (!current || current->status().state != SessionState::SignedIn) {
      finish("signedOut", "SIGNED_OUT", nullptr);
      return;
    }
    if (options.transport == nullptr) {
      finish("localUnavailable", "", nullptr);
      return;
    }
    TaggedTransport tagged(*options.transport, {{"transfer", id}}, nullptr);
    account::LocalTransferClient client(tagged, localOrigin, {}, *current, mine);
    const account::LocalTransferClient::Answer result = client.call(procedure, input.dump());
    if (mine->cancelled()) {
      finish("cancelled", "CANCELLED", nullptr);
      return;
    }
    nlohmann::json data = nullptr;
    if (result.status == account::TransferStatus::Ok) {
      data = nlohmann::json::parse(result.data, nullptr, false);
      if (data.is_discarded()) {
        data = nullptr;
      }
    }
    finish(transferStatusName(result.status), result.reason, std::move(data));
  }

  // A request thread. An access token for one WebSocket upgrade to the
  // server (D25). The main process drops it once the socket is open.
  void runSocketToken(uint64_t id) {
    const auto finish = [&](nlohmann::json fields) {
      forget(id);
      fields["type"] = "socketTokenResult";
      fields["id"] = id;
      emit(fields);
    };
    const std::shared_ptr<AccountSession> current = signedInSession();
    if (!current) {
      finish({{"error", "SIGNED_OUT"}});
      return;
    }
    const account::Authorization auth = current->authorizeRequest();
    if (auth.status != account::CredentialStatus::Ready) {
      finish({{"error", auth.status == account::CredentialStatus::SignedOut ? "SIGNED_OUT" : "OFFLINE"}});
      return;
    }
    finish({{"token", auth.accessToken}});
  }

  // Task thread.
  void signOut() {
    const std::shared_ptr<AccountSession> current = currentSession();
    if (!current) {
      return;
    }
    // The local steps only. The server end follows on the network thread,
    // from refresh(), so this sign-out reaches the other apps at once.
    const bool saved = current->signOutLocally();
    {
      std::unique_lock lock(mutex);
      serverEndAttempt = 0;
      nextServerEndMs.reset();
      serverEndAgain = serverEndRunning;
      if (!saved) {
        message = "The sign-out could not be saved on this computer. This app no longer uses the sign-in. "
                  "Restart the other NodeTool apps so they stop using it too.";
      }
      emitStateLocked(lock);
    }
    refresh();
  }
};

AccountHelper::AccountHelper(HelperOptions options, Emit emit)
    : core_(std::make_shared<Core>(std::move(options), std::move(emit))) {
  core_->readPolicy();
  taskThread_ = std::thread([core = core_] { core->runTasks(); });
  networkThread_ = std::thread([core = core_] { core->runNetwork(); });
  tickerThread_ = std::thread([core = core_] { core->runTicker(); });
  for (size_t i = 0; i < kRequestThreads; ++i) {
    requestThreads_.emplace_back([core = core_] { core->runRequests(); });
  }
  core_->postRefresh();
}

AccountHelper::~AccountHelper() {
  {
    const std::lock_guard lock(core_->mutex);
    core_->stopping = true;
    core_->attemptCancelled = true;
    if (core_->flow != nullptr) {
      core_->flow->cancel();
    }
    // A request thread that waits for the main process returns within the
    // transport's poll.
    for (const auto& [id, cancel] : core_->inFlight) {
      cancel->cancel();
    }
  }
  core_->wake.notify_all();
  core_->networkWake.notify_all();
  core_->requestWake.notify_all();
  for (std::thread& thread : requestThreads_) {
    thread.join();
  }
  if (signInThread_.joinable()) {
    signInThread_.join();
  }
  tickerThread_.join();
  taskThread_.join();
  networkThread_.join();
  // Tasks that never started hold the Core. Dropping them ends the cycle.
  const std::lock_guard lock(core_->mutex);
  core_->tasks.clear();
  core_->networkTasks.clear();
  core_->requestTasks.clear();
}

void AccountHelper::runOnTaskThread(const std::function<void()>& fn) {
  std::mutex doneMutex;
  std::condition_variable doneSignal;
  bool done = false;
  core_->post([&] {
    fn();
    const std::lock_guard lock(doneMutex);
    done = true;
    doneSignal.notify_all();
  });
  std::unique_lock lock(doneMutex);
  doneSignal.wait(lock, [&] { return done; });
}

void AccountHelper::handle(const nlohmann::json& message) {
  if (!message.is_object()) {
    return;
  }
  const auto type = message.find("type");
  if (type == message.end() || !type->is_string()) {
    return;
  }
  const std::string& name = type->get_ref<const std::string&>();
  if (name == "signIn") {
    signIn();
  } else if (name == "cancelSignIn") {
    core_->cancelAttempt(false);
  } else if (name == "browserResult") {
    const auto opened = message.find("opened");
    if (opened == message.end() || !opened->is_boolean() || !opened->get<bool>()) {
      core_->cancelAttempt(true);
    }
  } else if (name == "signOut") {
    core_->post([core = core_] { core->signOut(); });
  } else if (name == "request" || name == "transfer" || name == "socketToken") {
    handleRequest(name, message);
  } else if (name == "requestCancel") {
    if (const auto id = requestId(message)) {
      core_->cancelRequest(*id);
    }
  } else if (name == "reload") {
    core_->post([core = core_] {
      core->readPolicy();
      core->refresh();
    });
  }
}

void AccountHelper::handleRequest(const std::string& name, const nlohmann::json& message) {
  const std::optional<uint64_t> parsedId = requestId(message);
  if (!parsedId) {
    return;
  }
  const uint64_t id = *parsedId;
  const auto text = [&](const char* key) {
    const auto it = message.find(key);
    return it != message.end() && it->is_string() ? it->get<std::string>() : std::string();
  };
  const auto refuse = [&](const std::string& error) {
    if (name == "transfer") {
      core_->emit({{"type", "transferResult"}, {"id", id}, {"status", "refused"}, {"reason", error}, {"data", nullptr}});
    } else if (name == "socketToken") {
      core_->emit({{"type", "socketTokenResult"}, {"id", id}, {"error", error}});
    } else {
      core_->emit({{"type", "response"}, {"id", id}, {"status", 0}, {"error", error}});
    }
  };
  std::string error;
  if (name == "request") {
    const std::string method = text("method");
    const std::string path = text("path");
    if (!cloudMethod(method) || !cloudPath(path)) {
      refuse("INVALID");
      return;
    }
    std::chrono::milliseconds timeout = kDefaultRequestTimeout;
    if (const auto ms = message.find("timeoutMs"); ms != message.end() && ms->is_number_integer()) {
      timeout = std::clamp(std::chrono::milliseconds(ms->get<int64_t>()), std::chrono::milliseconds(1000),
                           kMaxRequestTimeout);
    }
    error = core_->queueRequest(id, [core = core_, id, method, path, timeout](auto cancel) {
      core->runCloudRequest(id, method, path, timeout, cancel);
    });
  } else if (name == "transfer") {
    const std::string procedure = text("procedure");
    const std::string localOrigin = text("localOrigin");
    const auto input = message.find("input");
    if (!account::LocalTransferClient::carriesToken(procedure) || !account::isLoopbackHttpOrigin(localOrigin) ||
        input == message.end() || !input->is_object()) {
      refuse("INVALID");
      return;
    }
    error = core_->queueRequest(id, [core = core_, id, procedure, body = *input, localOrigin](auto cancel) {
      core->runTransfer(id, procedure, body, localOrigin, cancel);
    });
  } else {
    error = core_->queueRequest(id, [core = core_, id](auto) { core->runSocketToken(id); });
  }
  if (!error.empty()) {
    refuse(error);
  }
}

void AccountHelper::signIn() {
  {
    const std::lock_guard lock(core_->mutex);
    if (core_->state == State::SigningIn || core_->stopping) {
      return;
    }
  }
  if (!core_->readPolicy()) {
    return;
  }
  {
    std::unique_lock lock(core_->mutex);
    core_->attemptCancelled = false;
    core_->browserFailed = false;
    core_->state = State::SigningIn;
    core_->message.clear();
    core_->emitStateLocked(lock);
  }
  if (signInThread_.joinable()) {
    // The last sign-in posted its result, so its thread is ending.
    signInThread_.join();
  }
  signInThread_ = std::thread([core = core_] { core->runSignIn(); });
}

} // namespace nodetool::account_helper
