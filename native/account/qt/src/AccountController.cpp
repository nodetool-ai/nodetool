#include "nodetool/account/qt/AccountController.h"

#include "nodetool/account/account_session.h"
#include "nodetool/account/accounts_index.h"
#include "nodetool/account/http_token_endpoint.h"
#include "nodetool/account/keychain_store.h"
#include "nodetool/account/origin.h"
#include "nodetool/account/qt/QtHttpTransport.h"
#include "nodetool/account/sign_in.h"
#include "TaskQueue.h"

#include <QFileInfo>
#include <QStandardPaths>
#include <QMetaObject>
#include <QSysInfo>

#include <atomic>
#include <deque>
#include <map>
#include <mutex>
#include <thread>
#include <vector>

namespace nodetool::account::qt {

// The services, the session and the hand-off to the controller's thread.
// Shared with the tasks, which the controller joins before it goes, and
// with every session reference session() hands out, so a session never
// outlives the store, endpoint and transport it borrows. The session's own
// callbacks hold it weakly, because the Core owns that session.
struct AccountController::Core : std::enable_shared_from_this<Core> {
  // Declared first, so it is destroyed after the session that borrows it.
  AccountServices services;

  // Whether the managed policy lets this app use the server's credential.
  // Written on the controller's thread when it reads the policy, read by
  // the session on any thread before it attaches or renews a credential.
  std::atomic<bool> policyAllows{false};

  std::mutex mutex;
  // Guarded by mutex. Replaced at sign-in.
  std::shared_ptr<AccountSession> session;
  // Guarded by mutex. Reuses one AccountSession per listed userId so each
  // account keeps its generation-keyed status cache across reconcile ticks.
  std::map<std::string, std::shared_ptr<AccountSession>> sessionsByUser;
  // Guarded by mutex. The sign-in that waits for the browser, owned by its
  // task. Set and cleared by that task.
  SignInFlow* flow = nullptr;
  // Guarded by mutex. Set by cancelSignIn() for the current attempt, from
  // its start until its credential is stored. The attempt checks it before
  // it waits and after the exchange, so a cancel at any point ends it.
  bool attemptCancelled = false;
  // Guarded by mutex. The controller the results go to. Cleared by its
  // destructor, so no task reaches it after that.
  AccountController* controller = nullptr;
  // Guarded by mutex. Calls waiting to run on the controller's thread. The
  // results cross threads here, under the mutex, and not through captures
  // in Qt's event queue.
  std::deque<std::function<void(AccountController&)>> inbox;

  void toUi(std::function<void(AccountController&)> call) {
    const std::lock_guard lock(mutex);
    if (controller == nullptr) {
      return;
    }
    const bool wake = inbox.empty();
    inbox.push_back(std::move(call));
    if (wake) {
      // Queued by name, so the event carries no data. Qt drops it if the
      // controller is destroyed first, and the destructor clears
      // `controller` under the mutex before that.
      QMetaObject::invokeMethod(controller, "drainInbox", Qt::QueuedConnection);
    }
  }

  std::shared_ptr<AccountSession> currentSession() {
    const std::lock_guard lock(mutex);
    return session;
  }

  AccountSessionOptions options(const std::string& userId) {
    AccountSessionOptions options;
    options.dataDir = services.dataDir;
    options.serverOrigin = services.serverOrigin;
    options.userId = userId;
    options.nowMs = services.nowMs;
    // Runs on the thread that noticed, with no lock held. A session handed
    // to the request layer may outlive the Core, so the call holds it weakly.
    options.onSignedOut = [weak = weak_from_this()] {
      const auto core = weak.lock();
      if (!core) {
        return;
      }
      core->toUi([](AccountController& controller) {
        emit controller.signedOut();
        controller.refreshState();
      });
    };
    options.credentialAllowed = [weak = weak_from_this()] {
      const auto core = weak.lock();
      return core && core->policyAllows.load(std::memory_order_acquire);
    };
    return options;
  }

  struct IndexSelection {
    std::shared_ptr<AccountSession> session;
    AccountSession::Status status;
  };

  std::shared_ptr<AccountSession> sessionForUser(const std::string& userId) {
    {
      const std::lock_guard lock(mutex);
      if (session && session->accountId() == userId) {
        sessionsByUser[userId] = session;
        return session;
      }
      if (const auto it = sessionsByUser.find(userId); it != sessionsByUser.end()) {
        return it->second;
      }
    }
    auto created = std::make_shared<AccountSession>(*services.store, *services.endpoint, options(userId));
    const std::lock_guard lock(mutex);
    auto& slot = sessionsByUser[userId];
    if (!slot) {
      slot = std::move(created);
    }
    return slot;
  }

  void invalidateStatusCaches() {
    std::vector<std::shared_ptr<AccountSession>> sessions;
    {
      const std::lock_guard lock(mutex);
      if (session) {
        sessions.push_back(session);
      }
      for (const auto& [userId, s] : sessionsByUser) {
        if (s && s != session) {
          sessions.push_back(s);
        }
      }
    }
    for (const auto& s : sessions) {
      s->invalidateStatusCache();
    }
  }

  // The session of the account signed in to this server, read again from
  // `accounts.json` and the generation-cached status at each call, so an
  // account the other app signed in to replaces the one held here without
  // re-reading the keychain when `session.gen` has not changed. With none
  // signed in, the held session stays, or the first listed account's. Null
  // when the index lists none.
  IndexSelection sessionFromIndex() {
    const std::shared_ptr<AccountSession> held = currentSession();
    const std::string origin = normalizeOrigin(services.serverOrigin);
    IndexSelection first;
    std::optional<AccountSession::Status> heldStatus;
    for (const AccountEntry& entry : AccountsIndex(services.dataDir).list()) {
      if (normalizeOrigin(entry.serverOrigin) != origin) {
        continue;
      }
      std::shared_ptr<AccountSession> candidate = sessionForUser(entry.userId);
      const AccountSession::Status status = candidate->status();
      if (status.state == SessionState::SignedIn) {
        return {adopt(held, std::move(candidate)), status};
      }
      if (candidate == held) {
        heldStatus = status;
      }
      if (!first.session) {
        first = {std::move(candidate), status};
      }
    }
    if (held) {
      return {held, heldStatus ? *heldStatus : held->status()};
    }
    if (!first.session) {
      return {};
    }
    return {adopt(held, std::move(first.session)), first.status};
  }

  // Holds `next` unless another thread replaced `expected` meanwhile.
  std::shared_ptr<AccountSession> adopt(const std::shared_ptr<AccountSession>& expected,
                                        std::shared_ptr<AccountSession> next) {
    const std::lock_guard lock(mutex);
    if (session == expected) {
      session = std::move(next);
    }
    return session;
  }
};

AccountController::AccountController(AccountServices services, QObject* parent)
    : QObject(parent), core_(std::make_shared<Core>()), serverOrigin_(QString::fromStdString(services.serverOrigin)) {
  if (!services.store) {
    auto keychain = std::make_unique<KeychainStore>();
    if (keychain->available()) {
      services.store = std::move(keychain);
    } else {
      services.store = std::make_unique<MemorySecretStore>();
      keychainAvailable_ = false;
    }
  }
  if (!services.transport) {
    services.transport = std::make_unique<QtHttpTransport>();
  }
  if (!services.endpoint) {
    services.endpoint = std::make_unique<HttpTokenEndpoint>(*services.transport, services.serverOrigin);
  }
  if (!services.policy) {
    services.policy = readManagedPolicy;
  }
  core_->services = std::move(services);
  core_->controller = this;
  tasks_ = std::make_unique<detail::TaskQueue>();
  serverEndTimer_.setSingleShot(true);
  connect(&serverEndTimer_, &QTimer::timeout, this, [this] {
    tasks_->post([core = core_] {
      const auto session = core->currentSession();
      const bool pending = session && session->endPendingSessions() == ServerEnd::Pending;
      core->toUi([pending](AccountController& controller) {
        controller.serverEndAttempt_ = pending ? controller.serverEndAttempt_ + 1 : 0;
        controller.refreshState();
      });
    });
  });
  connect(&watcher_, &QFileSystemWatcher::fileChanged, this, &AccountController::refreshState);
  connect(&watcher_, &QFileSystemWatcher::directoryChanged, this, &AccountController::refreshState);
  // A watch can miss a change: the data folder may not exist yet, and a
  // rename can end a watch before it is renewed. The periodic check bounds
  // how long the other app's sign-in or sign-out takes to show here.
  reconcileTimer_.setInterval(kReconcileInterval);
  connect(&reconcileTimer_, &QTimer::timeout, this, [this] {
    readPolicy();
    refreshState();
  });
  reconcileTimer_.start();
  reload();
}

AccountController::~AccountController() {
  {
    const std::lock_guard lock(core_->mutex);
    core_->controller = nullptr;
    core_->inbox.clear();
    if (core_->flow != nullptr) {
      core_->flow->cancel();
    }
  }
  if (signInThread_.joinable()) {
    signInThread_.join();
  }
  tasks_.reset();
}

void AccountController::drainInbox() {
  std::deque<std::function<void(AccountController&)>> calls;
  {
    const std::lock_guard lock(core_->mutex);
    calls.swap(core_->inbox);
  }
  for (auto& call : calls) {
    call(*this);
  }
}

QString AccountController::statusText() const {
  switch (state_) {
  case State::SignedIn:
    return tr("Signed in as %1").arg(displayName_);
  case State::SigningIn:
    return tr("Finish signing in in your browser");
  case State::SignedOut:
    break;
  }
  if (serverEndPending_) {
    return tr("Signed out, session not yet ended on the server");
  }
  if (!cloudAvailable_) {
    return tr("Cloud features are turned off on this computer");
  }
  return tr("Not signed in");
}

std::shared_ptr<AccountSession> AccountController::session() const {
  if (!core_->policyAllows.load(std::memory_order_acquire)) {
    return nullptr;
  }
  std::shared_ptr<AccountSession> session = core_->currentSession();
  if (!session) {
    return nullptr;
  }
  // The reference shares ownership of the Core, so the store, endpoint and
  // transport the session borrows live as long as any caller holds it.
  struct Held {
    std::shared_ptr<Core> core;
    std::shared_ptr<AccountSession> session;
  };
  const auto held = std::make_shared<Held>(Held{core_, std::move(session)});
  return std::shared_ptr<AccountSession>(held, held->session.get());
}

std::shared_ptr<AccountSession> AccountController::readSession() {
  if (!core_->policyAllows.load(std::memory_order_acquire)) {
    return nullptr;
  }
  const auto selection = core_->sessionFromIndex();
  if (!selection.session || selection.status.state != SessionState::SignedIn) {
    return nullptr;
  }
  return this->session();
}

bool AccountController::readPolicy() {
  PolicyCheck check = checkServer(core_->services.policy(), core_->services.serverOrigin);
  if (check.decision == PolicyDecision::Allowed && !canonicalHttpsOrigin(core_->services.serverOrigin)) {
    // No browser opens and no credential is sent to a server that is not
    // an HTTPS origin, such as a mistyped NODETOOL_CLOUD_SERVER.
    check.decision = PolicyDecision::ServerNotAllowed;
    check.reason = "The cloud server address is not an HTTPS address, so sign-in is turned off.";
  }
  const bool allows = check.decision == PolicyDecision::Allowed;
  core_->policyAllows.store(allows, std::memory_order_release);
  const bool available = check.decision != PolicyDecision::CloudOff;
  // The policy's reason replaces any message. An allowing policy clears
  // only a reason it showed, never a sign-in's own message.
  QString message = message_;
  if (!allows) {
    message = QString::fromStdString(check.reason);
  } else if (policyMessageShown_) {
    message.clear();
  }
  policyMessageShown_ = !allows;
  if (available == cloudAvailable_ && message == message_) {
    return false;
  }
  cloudAvailable_ = available;
  message_ = message;
  emit changed();
  return true;
}

void AccountController::reload() {
  readPolicy();
  tasks_->post([core = core_] { core->invalidateStatusCaches(); });
  refreshState();
}

void AccountController::refreshState() {
  // Tasks can finish out of order. Only the latest refresh is applied, so an
  // older read never replaces a newer one.
  const quint64 sequence = ++refreshSequence_;
  tasks_->post([core = core_, sequence] {
    Snapshot snapshot;
    if (const auto selection = core->sessionFromIndex(); selection.session) {
      const bool allowed = core->policyAllows.load(std::memory_order_acquire);
      const AccountSession::Status& status = selection.status;
      // Only check the generation file on sign-out when the store was not
      // denied: this cancels in-flight requests and emits signedOut() without
      // touching the keychain, while idle polling never triggers a token
      // refresh or re-reads the keychain.
      if (allowed && !status.storeAccessDenied && status.state == SessionState::SignedOut) {
        selection.session->checkGenerationFile();
      }
      snapshot.state = allowed && status.state == SessionState::SignedIn ? State::SignedIn : State::SignedOut;
      snapshot.displayName = QString::fromStdString(status.displayName);
      snapshot.serverEndPending = status.serverEndPending;
    }
    core->toUi([snapshot, sequence](AccountController& controller) {
      if (sequence == controller.refreshSequence_) {
        controller.apply(snapshot);
      }
    });
  });
}

void AccountController::apply(const Snapshot& snapshot) {
  if (state_ != State::SigningIn) {
    state_ = snapshot.state;
  }
  displayName_ = snapshot.displayName;
  serverEndPending_ = snapshot.serverEndPending;
  watchGenerationFile();
  if (serverEndPending_ && !serverEndTimer_.isActive()) {
    scheduleServerEnd();
  }
  emit changed();
}

void AccountController::watchGenerationFile() {
  // A write replaces a file by renaming over it, which ends a watch on the
  // file itself, so the folders are watched as well.
  QStringList paths{QString::fromStdString(core_->services.dataDir.string())};
  if (const auto session = core_->currentSession()) {
    paths << QString::fromStdString(session->accountDir().string())
          << QString::fromStdString(session->generationPath().string());
  }
  QStringList missing;
  for (const QString& path : paths) {
    if (QFileInfo::exists(path) && !watcher_.files().contains(path) && !watcher_.directories().contains(path)) {
      missing << path;
    }
  }
  if (!missing.isEmpty()) {
    watcher_.addPaths(missing);
  }
}

void AccountController::scheduleServerEnd() {
  serverEndTimer_.start(std::chrono::duration_cast<std::chrono::milliseconds>(endSessionRetryDelay(serverEndAttempt_)));
}

void AccountController::signIn() {
  if (state_ == State::SigningIn) {
    return;
  }
  readPolicy();
  if (!core_->policyAllows.load(std::memory_order_acquire)) {
    emit changed();
    return;
  }
  {
    const std::lock_guard lock(core_->mutex);
    core_->attemptCancelled = false;
  }
  state_ = State::SigningIn;
  message_.clear();
  emit changed();
  const std::string device = QSysInfo::machineHostName().toStdString();
  if (signInThread_.joinable()) {
    // The last sign-in posted its result, so its thread is ending.
    signInThread_.join();
  }
  signInThread_ = std::thread([core = core_, device] {
    AccountSessionOptions options = core->options({});
    SignInFlow flow(*core->services.store, *core->services.endpoint, options);
    const std::optional<std::string> url = flow.begin(core->services.app, device);
    if (!url) {
      core->toUi([](AccountController& controller) {
        controller.onSignInFinished(false, {}, tr("The sign-in could not open a port on this computer for the browser to return to."));
      });
      return;
    }
    {
      const std::lock_guard lock(core->mutex);
      core->flow = &flow;
      // A cancel that came before the flow was published.
      if (core->attemptCancelled) {
        flow.cancel();
      }
    }
    const QUrl authorize(QString::fromStdString(*url));
    core->toUi([authorize](AccountController& controller) { emit controller.browserRequested(authorize); });
    const SignInResult result = flow.finish(core->services.signInTimeout);
    bool cancelled = false;
    {
      const std::lock_guard lock(core->mutex);
      core->flow = nullptr;
      cancelled = core->attemptCancelled;
    }
    QString message;
    switch (result.status) {
    case SignInStatus::SignedIn: {
      auto session = std::make_shared<AccountSession>(*core->services.store, *core->services.endpoint,
                                                      core->options(result.userId));
      if (cancelled) {
        // The cancel came while the code was being exchanged. The session
        // the server just made is ended rather than kept.
        session->signOut();
        core->toUi([](AccountController& controller) { controller.onSignInFinished(false, {}, {}); });
        return;
      }
      const std::lock_guard lock(core->mutex);
      core->sessionsByUser[result.userId] = session;
      core->session = std::move(session);
      break;
    }
    case SignInStatus::Denied:
      message = result.message.empty() ? tr("The sign-in was declined.")
                                       : tr("The sign-in was declined: %1").arg(QString::fromStdString(result.message));
      break;
    case SignInStatus::TimedOut:
      // A cancel ends the wait the same way. The person chose it, so there
      // is nothing to explain.
      break;
    case SignInStatus::Failed:
      message = result.message.empty() ? tr("The sign-in failed.") : QString::fromStdString(result.message);
      break;
    }
    const bool signedIn = result.status == SignInStatus::SignedIn;
    const QString name = QString::fromStdString(result.displayName);
    core->toUi([signedIn, name, message](AccountController& controller) {
      controller.onSignInFinished(signedIn, name, message);
    });
  });
}

void AccountController::onSignInFinished(bool signedIn, const QString& name, const QString& message) {
  state_ = signedIn ? State::SignedIn : State::SignedOut;
  if (signedIn) {
    displayName_ = name;
  }
  message_ = browserFailed_ && !signedIn
                 ? tr("The browser could not be opened. Set a default browser, then sign in again.")
                 : message;
  browserFailed_ = false;
  emit changed();
  refreshState();
}

void AccountController::browserNotOpened() {
  if (state_ != State::SigningIn) {
    return;
  }
  {
    const std::lock_guard lock(core_->mutex);
    core_->attemptCancelled = true;
    if (core_->flow != nullptr) {
      core_->flow->cancel();
    }
  }
  // The attempt ends as a cancel does. The message replaces its silence.
  browserFailed_ = true;
}

void AccountController::cancelSignIn() {
  if (state_ != State::SigningIn) {
    return;
  }
  const std::lock_guard lock(core_->mutex);
  core_->attemptCancelled = true;
  if (core_->flow != nullptr) {
    core_->flow->cancel();
  }
}

void AccountController::signOut() {
  tasks_->post([core = core_] {
    const auto session = core->currentSession();
    if (!session) {
      return;
    }
    session->signOut();
    core->toUi([](AccountController& controller) {
      controller.serverEndAttempt_ = 0;
      controller.refreshState();
    });
  });
}

std::filesystem::path sharedDataDir() {
  const auto base = QStandardPaths::writableLocation(QStandardPaths::GenericDataLocation);
  return std::filesystem::path(base.toStdU16String()) / "NodeTool" / "native";
}

std::string cloudServerOrigin() {
  const auto configured = qEnvironmentVariable("NODETOOL_CLOUD_SERVER").trimmed();
  if (configured.isEmpty()) {
    return "https://api.nodetool.ai";
  }
  // The browser and the code exchange go to this origin, and the session's
  // credentials after them. Anything but an HTTPS origin is refused.
  return canonicalHttpsOrigin(configured.toStdString()).value_or(std::string());
}

} // namespace nodetool::account::qt
