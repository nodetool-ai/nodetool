#include "nodetool/account/qt/AccountController.h"

#include "nodetool/account/account_session.h"
#include "nodetool/account/accounts_index.h"
#include "nodetool/account/http_token_endpoint.h"
#include "nodetool/account/keychain_store.h"
#include "nodetool/account/qt/QtHttpTransport.h"
#include "nodetool/account/sign_in.h"

#include <QFileInfo>
#include <QStandardPaths>
#include <QMetaObject>
#include <QSysInfo>

#include <condition_variable>
#include <deque>
#include <mutex>
#include <thread>

namespace nodetool::account::qt {

// The services, the session and the hand-off to the controller's thread.
// Shared with the tasks, which the controller joins before it goes. The
// session's sign-out callback holds it weakly, because the request layer
// can call the session from its own threads.
struct AccountController::Core : std::enable_shared_from_this<Core> {
  AccountServices services;

  std::mutex mutex;
  // Guarded by mutex. Replaced at sign-in.
  std::shared_ptr<AccountSession> session;
  // Guarded by mutex. The sign-in that waits for the browser, owned by its
  // task. Set and cleared by that task.
  SignInFlow* flow = nullptr;
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
    return options;
  }

  // The session of the account that `accounts.json` lists for this server,
  // created on first use. Null when the index lists none.
  std::shared_ptr<AccountSession> sessionFromIndex() {
    if (auto existing = currentSession()) {
      return existing;
    }
    const std::string origin = normalizeOrigin(services.serverOrigin);
    for (const AccountEntry& entry : AccountsIndex(services.dataDir).list()) {
      if (normalizeOrigin(entry.serverOrigin) == origin) {
        auto created = std::make_shared<AccountSession>(*services.store, *services.endpoint, options(entry.userId));
        const std::lock_guard lock(mutex);
        if (!session) {
          session = std::move(created);
        }
        return session;
      }
    }
    return nullptr;
  }
};

// One thread that runs posted tasks in order.
//
// Thread affinity: thread-safe. `mutex_` guards the queue and `stopping_`.
// The destructor stops the thread and drops the tasks that did not start.
class AccountController::TaskThread {
public:
  TaskThread() : thread_([this] { run(); }) {}
  TaskThread(const TaskThread&) = delete;
  TaskThread& operator=(const TaskThread&) = delete;
  ~TaskThread() {
    {
      const std::lock_guard lock(mutex_);
      stopping_ = true;
    }
    wake_.notify_all();
    thread_.join();
  }

  void post(std::function<void()> task) {
    {
      const std::lock_guard lock(mutex_);
      queue_.push_back(std::move(task));
    }
    wake_.notify_one();
  }

private:
  void run() {
    for (;;) {
      std::function<void()> task;
      {
        std::unique_lock lock(mutex_);
        wake_.wait(lock, [this] { return stopping_ || !queue_.empty(); });
        if (stopping_) {
          return;
        }
        task = std::move(queue_.front());
        queue_.pop_front();
      }
      task();
    }
  }

  std::mutex mutex_;
  std::condition_variable wake_;
  std::deque<std::function<void()>> queue_;
  bool stopping_ = false;
  // Declared last, so it starts after the members it reads.
  std::thread thread_;
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
  tasks_ = std::make_unique<TaskThread>();
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

std::shared_ptr<AccountSession> AccountController::session() const { return core_->currentSession(); }

void AccountController::reload() {
  const ManagedPolicy policy = core_->services.policy();
  const PolicyCheck check = checkServer(policy, core_->services.serverOrigin);
  cloudAvailable_ = check.decision != PolicyDecision::CloudOff;
  message_ = check.decision == PolicyDecision::Allowed ? QString() : QString::fromStdString(check.reason);
  emit changed();
  refreshState();
}

void AccountController::refreshState() {
  // Tasks can finish out of order. Only the latest refresh is applied, so an
  // older read never replaces a newer one.
  const quint64 sequence = ++refreshSequence_;
  tasks_->post([core = core_, sequence] {
    Snapshot snapshot;
    if (const auto session = core->sessionFromIndex()) {
      session->checkGenerationFile();
      const AccountSession::Status status = session->status();
      snapshot.state = status.state == SessionState::SignedIn ? State::SignedIn : State::SignedOut;
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
  const PolicyCheck check = checkServer(core_->services.policy(), core_->services.serverOrigin);
  if (check.decision != PolicyDecision::Allowed) {
    cloudAvailable_ = check.decision != PolicyDecision::CloudOff;
    message_ = QString::fromStdString(check.reason);
    emit changed();
    return;
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
    }
    const QUrl authorize(QString::fromStdString(*url));
    core->toUi([authorize](AccountController& controller) { emit controller.browserRequested(authorize); });
    const SignInResult result = flow.finish(core->services.signInTimeout);
    {
      const std::lock_guard lock(core->mutex);
      core->flow = nullptr;
    }
    QString message;
    switch (result.status) {
    case SignInStatus::SignedIn: {
      auto session = std::make_shared<AccountSession>(*core->services.store, *core->services.endpoint,
                                                      core->options(result.userId));
      const std::lock_guard lock(core->mutex);
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
  message_ = message;
  emit changed();
  refreshState();
}

void AccountController::cancelSignIn() {
  const std::lock_guard lock(core_->mutex);
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
  return configured.isEmpty() ? std::string("https://api.nodetool.ai") : configured.toStdString();
}

} // namespace nodetool::account::qt
