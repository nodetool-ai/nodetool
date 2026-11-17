// The account of one app for one cloud server, as QML sees it: the state
// the Account control shows, sign-in through the system browser, sign-out,
// and the managed policy (WP1.9, WP1.11).
//
// Both apps create one for the same server. They coordinate only through
// the keychain record, the lock and the generation file, so a sign-in or a
// sign-out in one app shows in the other within a second through the watch
// on the generation file.
#pragma once

#include "nodetool/account/http_transport.h"
#include "nodetool/account/policy.h"
#include "nodetool/account/storage.h"
#include "nodetool/account/token_endpoint.h"

#include <QFileSystemWatcher>
#include <QObject>
#include <QString>
#include <QTimer>
#include <QUrl>

#include <chrono>
#include <filesystem>
#include <functional>
#include <memory>
#include <thread>

namespace nodetool::account {
class AccountSession;
} // namespace nodetool::account

namespace nodetool::account::qt {

namespace detail {
class TaskQueue;
} // namespace detail

// What an app hands the controller. Every member except the first three
// has a default the apps use, and tests replace.
struct AccountServices {
  // The shared data folder of both apps, which holds `accounts.json` and
  // the account folders.
  std::filesystem::path dataDir;
  // The cloud server, such as https://api.nodetool.ai.
  std::string serverOrigin;
  // The app the consent page names: `node-editor` or `timeline`.
  std::string app;
  // The credential store. Default: the platform keychain, or memory when
  // the computer has none.
  std::unique_ptr<SecretStore> store;
  // Default: QtHttpTransport.
  std::unique_ptr<HttpTransport> transport;
  // Default: HttpTokenEndpoint over the transport.
  std::unique_ptr<TokenEndpoint> endpoint;
  // Default: readManagedPolicy.
  std::function<ManagedPolicy()> policy;
  // Milliseconds since the Unix epoch. Default: the system clock.
  std::function<int64_t()> nowMs;
  // How long a sign-in waits for the browser.
  std::chrono::milliseconds signInTimeout{std::chrono::minutes(5)};
};

// Thread affinity: UI thread only. The keychain, the lock and the server
// calls run on one task thread, and the wait for the browser on its own
// thread. Their results come back through an inbox guarded by Core's mutex.
//
// Ownership: the controller owns both threads and joins them in its
// destructor, after cancelling a sign-in that waits for the browser. It
// shares its Core, which owns the services and the session, with the tasks
// and holds it weakly in the session's sign-out callback.
class AccountController final : public QObject {
  Q_OBJECT
  Q_PROPERTY(State state READ state NOTIFY changed)
  Q_PROPERTY(QString displayName READ displayName NOTIFY changed)
  Q_PROPERTY(QString serverOrigin READ serverOrigin CONSTANT)
  Q_PROPERTY(bool serverEndPending READ serverEndPending NOTIFY changed)
  Q_PROPERTY(bool cloudAvailable READ cloudAvailable NOTIFY changed)
  Q_PROPERTY(bool keychainAvailable READ keychainAvailable CONSTANT)
  Q_PROPERTY(QString statusText READ statusText NOTIFY changed)
  Q_PROPERTY(QString message READ message NOTIFY changed)

public:
  enum class State { SignedOut, SigningIn, SignedIn };
  Q_ENUM(State)

  explicit AccountController(AccountServices services, QObject* parent = nullptr);
  ~AccountController() override;

  State state() const { return state_; }
  QString displayName() const { return displayName_; }
  QString serverOrigin() const { return serverOrigin_; }
  bool serverEndPending() const { return serverEndPending_; }
  // False when the managed policy turns the cloud features off.
  bool cloudAvailable() const { return cloudAvailable_; }
  // False when the computer has no credential store. A sign-in then lasts
  // until the app closes.
  bool keychainAvailable() const { return keychainAvailable_; }
  // The sentence the Account control shows for the state.
  QString statusText() const;
  // Why the last sign-in did not complete, or the policy's reason. Empty
  // otherwise.
  QString message() const { return message_; }

  // Read the policy again, and the state from the record.
  Q_INVOKABLE void reload();
  // Opens a sign-in: checks the policy, then emits browserRequested with the
  // authorize URL and waits for the browser.
  Q_INVOKABLE void signIn();
  Q_INVOKABLE void cancelSignIn();
  // The app could not open the URL of browserRequested. The attempt ends,
  // the message says why, and sign-in can be tried again.
  void browserNotOpened();
  Q_INVOKABLE void signOut();

  // The session of the account, for the request layer. Null when no
  // account was signed in to this server on this computer, or when the
  // managed policy holds the server back. The reference keeps the store,
  // endpoint and transport it uses alive, so it stays valid after the
  // controller is destroyed. When the policy turns the server off later,
  // the session gives no credential and renews none.
  std::shared_ptr<AccountSession> session() const;

signals:
  void changed();
  // Open this URL in the system browser.
  void browserRequested(const QUrl& url);
  // This app moved from signed in to signed out. The app aborts its cloud
  // requests here.
  void signedOut();

private slots:
  // Runs the calls the tasks queued for this thread.
  void drainInbox();

private:
  struct Core;
  struct Snapshot {
    State state = State::SignedOut;
    QString displayName;
    bool serverEndPending = false;
  };

  // How often the controller reads the policy and the record again.
  static constexpr std::chrono::milliseconds kReconcileInterval{2000};

  // Reads the managed policy into the Core and the display. Returns whether
  // the display changed.
  bool readPolicy();
  void apply(const Snapshot& snapshot);
  void refreshState();
  void watchGenerationFile();
  void scheduleServerEnd();
  void onSignInFinished(bool signedIn, const QString& name, const QString& message);

  std::shared_ptr<Core> core_;
  // Runs the keychain reads, refreshes and server calls in order.
  std::unique_ptr<detail::TaskQueue> tasks_;
  // Waits for the browser. Joined before the next sign-in and by the
  // destructor, which cancels the wait first.
  std::thread signInThread_;
  const QString serverOrigin_;
  QFileSystemWatcher watcher_;
  QTimer serverEndTimer_;
  QTimer reconcileTimer_;
  unsigned serverEndAttempt_ = 0;
  quint64 refreshSequence_ = 0;
  State state_ = State::SignedOut;
  QString displayName_;
  bool serverEndPending_ = false;
  bool cloudAvailable_ = true;
  bool keychainAvailable_ = true;
  QString message_;
  // Whether `message_` holds the policy's reason, which a later read of an
  // allowing policy clears.
  bool policyMessageShown_ = false;
  // The current attempt ended because the browser did not open.
  bool browserFailed_ = false;
};

// The data folder both apps share: `NodeTool/native` under the generic
// data location, such as ~/.local/share on Linux.
std::filesystem::path sharedDataDir();

// The cloud server the apps sign in to: NODETOOL_CLOUD_SERVER when set,
// otherwise https://api.nodetool.ai. Empty when the variable is set to
// anything but an HTTPS origin, and the controller then refuses sign-in.
std::string cloudServerOrigin();

} // namespace nodetool::account::qt
