// One open cloud document of an app tab: it reads the document, keeps
// every edit on disk before it shows as saved (FR11), sends the drafts, and
// shows the synchronization status the PRD names ("Two statuses", FR32).
#pragma once

#include "nodetool/account/cloud_drafts.h"
#include "nodetool/account/http_transport.h"

#include <QObject>
#include <QString>
#include <QTimer>

#include <chrono>
#include <cstdint>
#include <functional>
#include <memory>
#include <string>

namespace nodetool::account {
class AccountSession;
} // namespace nodetool::account

namespace nodetool::account::qt {

namespace detail {
class TaskQueue;
} // namespace detail

struct CloudDocumentServices {
  // The account the document is opened under. Its server and account scope
  // the drafts, so a draft is never sent under another account (FR28).
  std::shared_ptr<AccountSession> session;
  // The local store of drafts, usually LocalServerDraftStore over the app's
  // own server.
  std::unique_ptr<DraftStore> store;
  // `workflow` or `timeline`.
  std::string kind;
  std::string documentId;
  // The role the account holds on the document, from the browser's list:
  // `owner`, `editor` or `viewer`.
  std::string role = "owner";
  // Default: QtHttpTransport.
  std::unique_ptr<HttpTransport> transport;
  // Milliseconds since the Unix epoch. Default: the system clock.
  std::function<int64_t()> nowMs;
};

// Thread affinity: UI thread only. Reads and sends run on one task thread,
// draft writes on a second one, so a slow send never delays a local write
// (CloudDocumentSaver's contract). edit() hands the document to CloudDocumentSaver, which is
// thread-safe under its own mutex. Results come back through an inbox
// guarded by the shared state's mutex.
//
// Ownership: the shared state owns the services, the cloud client, the
// saver of the kind and the CloudDocumentSaver, and the tasks share it, so
// a task still running when the document closes finds no document to report
// to and its objects stay alive until it ends. The destructor joins both
// task threads, then writes the last edits to the local store on the UI
// thread, which blocks the close for that one call.
class CloudDocument final : public QObject {
  Q_OBJECT
  Q_PROPERTY(SyncStatus syncStatus READ syncStatus NOTIFY stateChanged)
  Q_PROPERTY(QString syncText READ syncText NOTIFY stateChanged)
  Q_PROPERTY(bool readOnly READ readOnly NOTIFY stateChanged)
  Q_PROPERTY(QString readOnlyReason READ readOnlyReason NOTIFY stateChanged)
  Q_PROPERTY(QString kind READ kind CONSTANT)
  Q_PROPERTY(QString documentId READ documentId CONSTANT)
  // `owner`, `editor` or `viewer`. Only the owner shares the document.
  Q_PROPERTY(QString role READ role CONSTANT)

public:
  enum class SyncStatus {
    // The document is being read.
    Opening,
    // The read failed. `syncText` says why.
    NotOpened,
    SavedToCloud,
    Sending,
    ChangesWaiting,
    Offline,
    // Offline before the server answered once since the document opened.
    CloudStatusUnknown,
    // The local write failed. Never hidden behind a cloud status.
    NotSaving,
    // The server refused the last save. The edits are kept as unsent.
    Unsent,
    SignedOut,
  };
  Q_ENUM(SyncStatus)

  // How often the document writes and sends. A tick every 250 ms keeps
  // each edit within kDraftMaxDelayMs of the disk.
  static constexpr std::chrono::milliseconds kTickInterval{250};
  // How long writeLocally() waits for the local store.
  static constexpr std::chrono::milliseconds kWriteLocallyTimeout{5000};

  explicit CloudDocument(CloudDocumentServices services, QObject* parent = nullptr);
  ~CloudDocument() override;

  SyncStatus syncStatus() const { return status_; }
  // The status sentence, such as "Offline, 3 changes waiting, last
  // connected 14:02".
  QString syncText() const;
  bool readOnly() const { return readOnly_; }
  QString readOnlyReason() const { return readOnlyReason_; }
  QString kind() const { return kind_; }
  QString documentId() const { return documentId_; }
  QString role() const { return role_; }

  // The document as the tab last showed it: the last edit, else the draft
  // it opened with, else the server's revision. Empty before opened(). The
  // share dialog reads it for the linked documents and the secret check.
  Q_INVOKABLE QString content() const { return content_; }

  // Reads the document. A draft this account left in the local store
  // opens over the server's revision, and is sent again. Emits opened() or
  // openFailed().
  Q_INVOKABLE void open();
  // The tab's document changed. `document` is the whole document JSON of
  // the kind. Ignored before opened() and while read-only.
  Q_INVOKABLE void edit(const QString& document);
  // Writes the last edit to the local store now, such as before the tab
  // closes, and waits up to kWriteLocallyTimeout. Returns false when an
  // edit is still only in memory: the tab must not close without asking.
  // True when nothing is open.
  Q_INVOKABLE bool writeLocally();

signals:
  void stateChanged();
  // `revision` is the read procedure's answer, the document with its name
  // and metadata. `draft` is the content of a draft the local store kept,
  // the kind's graph or document, which the tab shows over the revision.
  // Empty when there is none.
  void opened(const QString& revision, const QString& draft);
  void openFailed(const QString& reason);

private slots:
  void drainInbox();

private:
  struct Shared;

  void tick();
  void apply(const DocumentState& state);
  void onOpened(const QString& revision, const QString& draft, bool writable, const QString& reason,
                const DocumentState& state);

  std::shared_ptr<Shared> shared_;
  // Reads and sends.
  std::unique_ptr<detail::TaskQueue> tasks_;
  // Draft writes.
  std::unique_ptr<detail::TaskQueue> persistTasks_;
  QTimer timer_;
  bool persistRunning_ = false;
  bool sendRunning_ = false;
  bool opened_ = false;
  SyncStatus status_ = SyncStatus::Opening;
  uint64_t waitingEdits_ = 0;
  int64_t lastContactMs_ = 0;
  QString refusal_;
  bool readOnly_ = false;
  QString readOnlyReason_;
  const QString kind_;
  const QString documentId_;
  const QString role_;
  QString content_;
};

// The status sentence for a state. `lastContact` is the local time of the
// last answer from the server, already formatted, empty for none.
QString syncStatusText(CloudDocument::SyncStatus status, uint64_t waitingEdits, const QString& lastContact,
                       const QString& refusal);

} // namespace nodetool::account::qt
