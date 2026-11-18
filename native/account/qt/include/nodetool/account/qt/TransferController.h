// Publish to Cloud and Synchronize of a local project (PRD "Link a local
// project" and "Synchronize a linked project", technical design WP2.8). The
// app's own server runs the transfer. This controller captures it, holds
// the review sheet's rows and the person's choices, and runs it.
//
// Synchronize receives first and sends after. A document the receive
// brought in is captured again before the send, so a send never carries a
// local copy the person chose to replace. When the new capture holds an
// operation the sheet did not show, nothing is sent and the sheet shows the
// send again. A document kept local is refused
// by the cloud once, because its base is older than the cloud revision. When
// the stored hash is the revision the sheet showed, the controller answers
// with Keep local without asking again (TransferReview::answeredRefusals).
#pragma once

#include "nodetool/account/cloud_transfer.h"
#include "nodetool/account/http_transport.h"
#include "nodetool/account/qt/AccountController.h"

#include <QObject>
#include <QPointer>
#include <QString>
#include <QStringList>
#include <QUrl>
#include <QVariantList>
#include <QVariantMap>

#include <memory>
#include <string>

namespace nodetool::account::qt {

namespace detail {
class TaskQueue;
} // namespace detail

// Thread affinity: UI thread only. Captures and runs go to one task thread
// in order and come back through an inbox guarded by the shared state's
// mutex.
//
// Ownership: owns the task thread and, through the shared state, the
// transport. A task still running when the controller goes finds no
// controller to report to. The account is borrowed and watched with a
// QPointer. QML may create it: the sheet owns it through its parent.
// Not final: QML creates it through a derived type.
class TransferController : public QObject {
  Q_OBJECT
  Q_PROPERTY(nodetool::account::qt::AccountController* account READ account WRITE setAccount NOTIFY accountChanged)
  // The app's own server, which runs the transfer.
  Q_PROPERTY(QUrl serverUrl READ serverUrl WRITE setServerUrl NOTIFY projectChanged)
  // The token of the app's own server. Sent to serverUrl's origin only.
  Q_PROPERTY(QString serverToken READ serverToken WRITE setServerToken NOTIFY projectChanged)
  Q_PROPERTY(QString projectId READ projectId WRITE setProjectId NOTIFY projectChanged)
  // The cloud project's name at its first publication.
  Q_PROPERTY(QString projectName READ projectName WRITE setProjectName NOTIFY projectChanged)
  // True for a project linked to a cloud project of this account: start()
  // synchronizes. False: start() publishes.
  Q_PROPERTY(bool linked READ linked WRITE setLinked NOTIFY projectChanged)
  Q_PROPERTY(Stage stage READ stage NOTIFY stateChanged)
  // Each {index, section, kind, documentId, name, detail, text, choice,
  // confirmed, canKeepDeletion, canRestore, canSendWithout}, grouped by
  // section: choice,
  // receive, send, deletion, problem. `index` is what choose() and
  // confirmDeletion() take. `choice` is "", "receive" or "keepLocal".
  Q_PROPERTY(QVariantList rows READ rows NOTIFY rowsChanged)
  // Every choice row has a pick.
  Q_PROPERTY(bool ready READ ready NOTIFY rowsChanged)
  // Why the last step failed, or what the sheet asks again. Empty otherwise.
  Q_PROPERTY(QString message READ message NOTIFY stateChanged)
  // For CollectFirst: the files outside the project folder.
  Q_PROPERTY(QStringList external READ external NOTIFY stateChanged)
  // For Finished: {published, received, notReceived, changedDuringReceive,
  // missingFiles}. The lists hold document names.
  Q_PROPERTY(QVariantMap result READ result NOTIFY stateChanged)

public:
  enum class Stage {
    Idle,
    // Reading what will be sent and received.
    Capturing,
    // The sheet shows the rows and waits for apply() or cancel().
    Reviewing,
    // Files outside the project folder must be collected first (CF6).
    CollectFirst,
    // Receiving and sending.
    Running,
    Finished,
    Failed,
  };
  Q_ENUM(Stage)

  // The default transport is QtHttpTransport.
  explicit TransferController(QObject* parent = nullptr);
  explicit TransferController(std::unique_ptr<HttpTransport> transport, QObject* parent = nullptr);
  ~TransferController() override;

  AccountController* account() const { return account_; }
  void setAccount(AccountController* account);
  QUrl serverUrl() const { return serverUrl_; }
  void setServerUrl(const QUrl& url);
  QString serverToken() const { return serverToken_; }
  void setServerToken(const QString& token);
  QString projectId() const { return projectId_; }
  void setProjectId(const QString& projectId);
  QString projectName() const { return projectName_; }
  void setProjectName(const QString& name);
  bool linked() const { return linked_; }
  void setLinked(bool linked);
  Stage stage() const { return stage_; }
  QVariantList rows() const;
  bool ready() const { return review_.ready(); }
  QString message() const { return message_; }
  QStringList external() const { return external_; }
  QVariantMap result() const { return result_; }

  // Captures the transfer and shows the sheet. Ignored while a capture or a
  // run is going.
  Q_INVOKABLE void start();
  // `choice` is "receive", "keepLocal" or "" for the choice row at
  // `index` (a row's `index`). Returns false for another row.
  Q_INVOKABLE bool choose(int index, const QString& choice);
  // Keep local deletion on a deletion row, which deletes the cloud
  // document. Off restores the document from the cloud.
  Q_INVOKABLE bool confirmDeletion(int index, bool confirmed);
  // Send without the missing file of a problem row (canSendWithout), for
  // every document that needs it (X7).
  Q_INVOKABLE bool confirmMissingFile(int index, bool confirmed);
  // Runs the transfer as the sheet shows it. Ignored until ready().
  Q_INVOKABLE void apply();
  // Closes the sheet without sending, and ends the captured send.
  Q_INVOKABLE void cancel();

signals:
  void accountChanged();
  void projectChanged();
  void stateChanged();
  void rowsChanged();
  // The cloud accepted a send, or a receive finished.
  void finished();

private slots:
  void drainInbox();

private:
  struct Shared;
  struct Captured;
  struct Applied;

  std::shared_ptr<AccountSession> session() const;
  std::vector<std::pair<std::string, std::string>> headers() const;
  std::string origin() const;
  // Ends a captured send that will not run, on the task thread.
  void endSend(const std::string& transferId);
  void fail(const QString& message);
  void finishCapture(quint64 sequence, const Captured& captured);
  void finishApply(quint64 sequence, const Applied& applied);

  std::shared_ptr<Shared> shared_;
  // Turned on by the destructor, so a running request returns at once
  // instead of holding the join of the task thread (review F42). Shared
  // with the tasks, which may still run while the destructor joins.
  std::shared_ptr<RequestCancel> cancel_;
  std::unique_ptr<detail::TaskQueue> tasks_;
  QPointer<AccountController> account_;
  QUrl serverUrl_;
  QString serverToken_;
  QString projectId_;
  QString projectName_;
  bool linked_ = false;
  quint64 sequence_ = 0;
  Stage stage_ = Stage::Idle;
  QString message_;
  QStringList external_;
  QVariantMap result_;
  TransferReview review_;
  // The send operations the sheet shows. A send captured again after the
  // receive runs only when it holds nothing else.
  std::vector<TransferOperation> approved_;
  std::vector<TransferFileOperation> approvedFiles_;
  std::string transferId_;
  std::string setId_;
  // The send half has document or file operations. A confirmed deletion
  // also makes a send.
  bool sendWork_ = false;
  // The receive of this sheet ran, so a second apply after a refusal only
  // sends.
  bool received_ = false;
  QVariantMap receivedResult_;
};

// The sentence a review row shows for its detail, such as "Changed here
// and in the cloud".
QString transferRowText(const ReviewRow& row);

} // namespace nodetool::account::qt
