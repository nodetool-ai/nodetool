#include "account_helper.h"

#include "nodetool/account/accounts_index.h"
#include "nodetool/account/origin.h"

#include <deque>
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
  bool stopping = false;
  State state = State::SignedOut;
  std::string displayName;
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
    bool pending = false;
    if (current) {
      const bool allowed = policyAllows.load(std::memory_order_acquire);
      // A session the policy holds back is not adopted: only its display
      // and a pending server end are read from the record.
      if (allowed) {
        current->checkGenerationFile();
      }
      const AccountSession::Status status = current->status();
      next = allowed && status.state == SessionState::SignedIn ? State::SignedIn : State::SignedOut;
      name = status.displayName;
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
      serverEndPending = pending;
      if (!pending) {
        serverEndAttempt = 0;
        nextServerEndMs.reset();
      } else if (!nextServerEndMs || now() >= *nextServerEndMs) {
        // The first time a pending end is seen, such as at the helper's
        // start, it is tried at once. A sign-out already tried, and sets
        // the next attempt itself.
        endNow = true;
      }
      emitStateLocked(lock);
    }
    if (endNow && current) {
      const bool stillPending = current->endPendingSessions() == account::ServerEnd::Pending;
      {
        const std::lock_guard lock(mutex);
        serverEndAttempt = stillPending ? serverEndAttempt + 1 : 0;
        nextServerEndMs = retryAt(serverEndAttempt);
      }
      postRefresh();
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

  // Task thread.
  void signOut() {
    const std::shared_ptr<AccountSession> current = currentSession();
    if (!current) {
      return;
    }
    const account::ServerEnd end = current->signOut();
    {
      std::unique_lock lock(mutex);
      serverEndAttempt = 0;
      nextServerEndMs = retryAt(0);
      if (end == account::ServerEnd::NotSaved) {
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
  tickerThread_ = std::thread([core = core_] { core->runTicker(); });
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
  }
  core_->wake.notify_all();
  if (signInThread_.joinable()) {
    signInThread_.join();
  }
  tickerThread_.join();
  taskThread_.join();
  // Tasks that never started hold the Core. Dropping them ends the cycle.
  const std::lock_guard lock(core_->mutex);
  core_->tasks.clear();
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
  } else if (name == "reload") {
    core_->post([core = core_] {
      core->readPolicy();
      core->refresh();
    });
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
