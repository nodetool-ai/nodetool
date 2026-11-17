// The Cloud and Shared with me groups of an app's document browser (PRD
// "Open and edit a cloud document", FR9), for one document kind and the
// account the app uses now.
#pragma once

#include "nodetool/account/cloud_listing.h"
#include "nodetool/account/http_transport.h"
#include "nodetool/account/qt/AccountController.h"

#include <QAbstractListModel>
#include <QObject>
#include <QPointer>
#include <QString>

#include <memory>
#include <string>
#include <vector>

namespace nodetool::account::qt {

namespace detail {
class TaskQueue;
} // namespace detail

// One group of documents, as a QML view reads it.
//
// Thread affinity: UI thread only.
class CloudDocumentList : public QAbstractListModel {
  Q_OBJECT
  Q_PROPERTY(int count READ count NOTIFY countChanged)

public:
  enum Role {
    KindRole = Qt::UserRole + 1,
    IdRole,
    NameRole,
    UpdatedAtRole,
    AccessRole,
    OwnerIdRole,
  };

  using QAbstractListModel::QAbstractListModel;

  int rowCount(const QModelIndex& parent = {}) const override;
  QVariant data(const QModelIndex& index, int role) const override;
  QHash<int, QByteArray> roleNames() const override;
  int count() const { return static_cast<int>(items_.size()); }
  const std::vector<CloudListItem>& items() const { return items_; }

  void setItems(std::vector<CloudListItem> items);

signals:
  void countChanged();

private:
  std::vector<CloudListItem> items_;
};

// Thread affinity: UI thread only. The listings run on one task thread and
// come back through an inbox guarded by the shared state's mutex.
//
// Ownership: owns both lists, the task thread and, through the shared
// state, the transport. The tasks share that state, so a listing that is
// still running when the browser goes finds no browser to report to. The
// account is borrowed and watched with a QPointer.
class CloudBrowser final : public QObject {
  Q_OBJECT
  Q_PROPERTY(nodetool::account::qt::AccountController* account READ account WRITE setAccount NOTIFY accountChanged)
  Q_PROPERTY(nodetool::account::qt::CloudDocumentList* cloud READ cloud CONSTANT)
  Q_PROPERTY(nodetool::account::qt::CloudDocumentList* shared READ shared CONSTANT)
  Q_PROPERTY(bool loading READ loading NOTIFY stateChanged)
  Q_PROPERTY(bool signedIn READ signedIn NOTIFY stateChanged)
  Q_PROPERTY(QString message READ message NOTIFY stateChanged)

public:
  // `kind` is `workflow` or `timeline`. The default transport is
  // QtHttpTransport.
  explicit CloudBrowser(std::string kind, std::unique_ptr<HttpTransport> transport = nullptr,
                        QObject* parent = nullptr);
  ~CloudBrowser() override;

  AccountController* account() const { return account_; }
  void setAccount(AccountController* account);
  CloudDocumentList* cloud() { return &cloud_; }
  CloudDocumentList* shared() { return &shared_; }
  bool loading() const { return loading_; }
  bool signedIn() const { return signedIn_; }
  // Why the last listing did not complete. Empty otherwise.
  QString message() const { return message_; }

  // Lists both groups again. Signed out, both are emptied and nothing is
  // sent.
  Q_INVOKABLE void refresh();

signals:
  void accountChanged();
  void stateChanged();

private slots:
  void drainInbox();

private:
  struct Shared;

  void onAccountChanged();
  void finish(quint64 sequence, const CloudListing& own, const CloudListing& shared);

  std::shared_ptr<Shared> shared_state_;
  std::unique_ptr<detail::TaskQueue> tasks_;
  const std::string kind_;
  QPointer<AccountController> account_;
  CloudDocumentList cloud_;
  CloudDocumentList shared_;
  quint64 sequence_ = 0;
  bool loading_ = false;
  bool signedIn_ = false;
  QString message_;
};

} // namespace nodetool::account::qt
