// The share dialog of one cloud document (PRD FR21, FR52, FR67, SR6): its
// viewer and editor links, the people who joined, the scripts and
// storyboards a timeline links to, and the values that look like secrets.
// Only the owner shares, so an app shows the dialog for its own documents.
#pragma once

#include "nodetool/account/cloud_sharing.h"
#include "nodetool/account/http_transport.h"
#include "nodetool/account/qt/AccountController.h"

#include <QObject>
#include <QPointer>
#include <QString>
#include <QVariantList>
#include <QVariantMap>

#include <functional>
#include <memory>
#include <string>
#include <vector>

namespace nodetool::account::qt {

namespace detail {
class TaskQueue;
} // namespace detail

// Thread affinity: UI thread only. Reads and changes run in order on one
// task thread and come back through an inbox guarded by the shared state's
// mutex.
//
// Ownership: owns the task thread and, through the shared state, the
// transport. A task still running when the controller goes finds no
// controller to report to. The account is borrowed and watched with a
// QPointer. QML may create it: the dialog owns it through its parent.
// Not final: QML creates it through a derived type.
class ShareController : public QObject {
  Q_OBJECT
  Q_PROPERTY(nodetool::account::qt::AccountController* account READ account WRITE setAccount NOTIFY accountChanged)
  Q_PROPERTY(QString kind READ kind WRITE setKind NOTIFY documentChanged)
  Q_PROPERTY(QString documentId READ documentId WRITE setDocumentId NOTIFY documentChanged)
  // The document JSON as the tab shows it (CloudDocument::content()).
  Q_PROPERTY(QString content READ content WRITE setContent NOTIFY contentChanged)
  Q_PROPERTY(bool loading READ loading NOTIFY stateChanged)
  // A change is being sent.
  Q_PROPERTY(bool busy READ busy NOTIFY stateChanged)
  // Why the last read or change failed. Empty otherwise.
  Q_PROPERTY(QString message READ message NOTIFY stateChanged)
  // {exists, shareId, url, statement, history, download, duplicate}
  Q_PROPERTY(QVariantMap viewerLink READ viewerLink NOTIFY stateChanged)
  Q_PROPERTY(QVariantMap editorLink READ editorLink NOTIFY stateChanged)
  // Each {userId, name, email, role, history, download, duplicate,
  // sources}: the effective role and options, and a sentence that names
  // the grants that give them, such as "Joined through a disabled viewer
  // link".
  Q_PROPERTY(QVariantList people READ people NOTIFY stateChanged)
  // The disabled links people still hold access through, each {shareId,
  // role, people, statement, history, download, duplicate}. Their options
  // stay live, so the dialog manages them by share id (P3).
  Q_PROPERTY(QVariantList disabledLinks READ disabledLinks NOTIFY stateChanged)
  // Each {kind, documentId, label, state, viewerUrl, editorUrl}. `state` is
  // `checking`, `shared` (it has a link of its own), `notShared` or
  // `unavailable` (this account cannot share it).
  Q_PROPERTY(QVariantList linkedDocuments READ linkedDocuments NOTIFY stateChanged)
  // Each {place, looksLike}.
  Q_PROPERTY(QVariantList secretWarnings READ secretWarnings NOTIFY contentChanged)

public:
  // The default transport is QtHttpTransport.
  explicit ShareController(QObject* parent = nullptr);
  explicit ShareController(std::unique_ptr<HttpTransport> transport, QObject* parent = nullptr);
  ~ShareController() override;

  AccountController* account() const { return account_; }
  void setAccount(AccountController* account);
  QString kind() const { return kind_; }
  void setKind(const QString& kind);
  QString documentId() const { return documentId_; }
  void setDocumentId(const QString& documentId);
  QString content() const { return content_; }
  void setContent(const QString& content);
  bool loading() const { return loading_; }
  bool busy() const { return busy_ > 0; }
  QString message() const { return message_; }
  QVariantMap viewerLink() const { return linkMap("viewer"); }
  QVariantMap editorLink() const { return linkMap("editor"); }
  QVariantList people() const;
  QVariantList disabledLinks() const;
  QVariantList linkedDocuments() const;
  QVariantList secretWarnings() const { return secrets_; }

  // Reads the links, the people and the linked documents again.
  Q_INVOKABLE void refresh();
  // `role` is `viewer` or `editor`. The server returns the enabled link
  // when there is one.
  Q_INVOKABLE void createLink(const QString& role);
  Q_INVOKABLE void disableLink(const QString& role);
  // The options of the viewer link.
  Q_INVOKABLE void setViewerOptions(bool history, bool download, bool duplicate);
  // The options of one link, enabled or disabled.
  Q_INVOKABLE void setLinkOptions(const QString& shareId, bool history, bool download, bool duplicate);
  Q_INVOKABLE void setPersonRole(const QString& userId, const QString& role);
  Q_INVOKABLE void removePerson(const QString& userId);
  // Creates a link with `role` on a linked document (FR67).
  Q_INVOKABLE void shareLinked(const QString& kind, const QString& documentId, const QString& role);
  // What a link gives (FR52), for the options shown before a change.
  Q_INVOKABLE QString statement(const QString& role, bool history, bool download, bool duplicate) const;

signals:
  void accountChanged();
  void documentChanged();
  void contentChanged();
  void stateChanged();

private slots:
  void drainInbox();

private:
  struct Shared;
  struct Linked {
    LinkedDocument document;
    QString state;
    SharingState sharing;
  };

  QVariantMap linkMap(const std::string& role) const;
  std::shared_ptr<AccountSession> session() const;
  void scanContent();
  void change(std::function<ShareChange(CloudClient&)> call);
  void finishRead(quint64 sequence, SharingState state, std::vector<Linked> linked);
  void finishChange(const ShareChange& result);

  std::shared_ptr<Shared> shared_;
  std::unique_ptr<detail::TaskQueue> tasks_;
  QPointer<AccountController> account_;
  QString kind_;
  QString documentId_;
  QString content_;
  std::string origin_;
  quint64 sequence_ = 0;
  bool loading_ = false;
  bool signedIn_ = false;
  int busy_ = 0;
  QString message_;
  SharingState state_;
  std::vector<LinkedDocument> linkedOrder_;
  std::vector<Linked> linked_;
  QVariantList secrets_;
};

} // namespace nodetool::account::qt
