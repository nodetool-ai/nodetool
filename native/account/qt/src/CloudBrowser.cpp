#include "nodetool/account/qt/CloudBrowser.h"

#include "nodetool/account/account_session.h"
#include "nodetool/account/cloud_client.h"
#include "nodetool/account/qt/QtHttpTransport.h"
#include "TaskQueue.h"

#include <QMetaObject>

#include <deque>
#include <functional>
#include <mutex>

namespace nodetool::account::qt {

int CloudDocumentList::rowCount(const QModelIndex& parent) const {
  return parent.isValid() ? 0 : count();
}

QVariant CloudDocumentList::data(const QModelIndex& index, int role) const {
  if (!index.isValid() || index.row() < 0 || index.row() >= count()) {
    return {};
  }
  const CloudListItem& item = items_[static_cast<size_t>(index.row())];
  switch (role) {
  case KindRole:
    return QString::fromStdString(item.kind);
  case IdRole:
    return QString::fromStdString(item.id);
  case Qt::DisplayRole:
  case NameRole:
    return QString::fromStdString(item.name);
  case UpdatedAtRole:
    return QString::fromStdString(item.updatedAt);
  case AccessRole:
    return QString::fromStdString(item.role);
  case OwnerIdRole:
    return QString::fromStdString(item.ownerId);
  default:
    return {};
  }
}

QHash<int, QByteArray> CloudDocumentList::roleNames() const {
  return {{KindRole, "kind"},           {IdRole, "documentId"}, {NameRole, "name"},
          {UpdatedAtRole, "updatedAt"}, {AccessRole, "access"},     {OwnerIdRole, "ownerId"}};
}

void CloudDocumentList::setItems(std::vector<CloudListItem> items) {
  const bool countChanges = items.size() != items_.size();
  beginResetModel();
  items_ = std::move(items);
  endResetModel();
  if (countChanges) {
    emit countChanged();
  }
}

// The transport and the hand-off to the browser's thread, shared with the
// tasks.
struct CloudBrowser::Shared {
  // Thread-safe, used by the task thread only.
  std::unique_ptr<HttpTransport> transport;

  std::mutex mutex;
  // Guarded by mutex. Cleared by the browser's destructor.
  CloudBrowser* browser = nullptr;
  // Guarded by mutex.
  std::deque<std::function<void(CloudBrowser&)>> inbox;

  void toUi(std::function<void(CloudBrowser&)> call) {
    const std::lock_guard lock(mutex);
    if (browser == nullptr) {
      return;
    }
    const bool wake = inbox.empty();
    inbox.push_back(std::move(call));
    if (wake) {
      QMetaObject::invokeMethod(browser, "drainInbox", Qt::QueuedConnection);
    }
  }
};

CloudBrowser::CloudBrowser(std::string kind, std::unique_ptr<HttpTransport> transport, QObject* parent)
    : QObject(parent), shared_state_(std::make_shared<Shared>()), kind_(std::move(kind)) {
  shared_state_->transport = transport ? std::move(transport) : std::make_unique<QtHttpTransport>();
  shared_state_->browser = this;
  tasks_ = std::make_unique<detail::TaskQueue>();
}

CloudBrowser::~CloudBrowser() {
  {
    const std::lock_guard lock(shared_state_->mutex);
    shared_state_->browser = nullptr;
    shared_state_->inbox.clear();
  }
  tasks_.reset();
}

void CloudBrowser::drainInbox() {
  std::deque<std::function<void(CloudBrowser&)>> calls;
  {
    const std::lock_guard lock(shared_state_->mutex);
    calls.swap(shared_state_->inbox);
  }
  for (auto& call : calls) {
    call(*this);
  }
}

void CloudBrowser::setAccount(AccountController* account) {
  if (account_ == account) {
    return;
  }
  if (account_) {
    disconnect(account_, nullptr, this, nullptr);
  }
  account_ = account;
  if (account_) {
    connect(account_, &AccountController::changed, this, &CloudBrowser::onAccountChanged);
    connect(account_, &AccountController::signedOut, this, &CloudBrowser::refresh);
  }
  // The lists of the previous account are never shown under this one.
  cloud_.setItems({});
  shared_.setItems({});
  emit accountChanged();
  refresh();
}

void CloudBrowser::onAccountChanged() {
  const bool signedIn = account_ && account_->state() == AccountController::State::SignedIn;
  if (signedIn != signedIn_) {
    refresh();
  }
}

void CloudBrowser::refresh() {
  // A newer refresh replaces the answer of an older one.
  const quint64 sequence = ++sequence_;
  const std::shared_ptr<AccountSession> session =
      account_ && account_->state() == AccountController::State::SignedIn ? account_->session() : nullptr;
  signedIn_ = session != nullptr;
  message_.clear();
  if (!session) {
    // Signed out, the other account's documents are never shown.
    loading_ = false;
    cloud_.setItems({});
    shared_.setItems({});
    emit stateChanged();
    return;
  }
  loading_ = true;
  emit stateChanged();
  tasks_->post([state = shared_state_, session, kind = kind_, sequence] {
    CloudClient client(*session, *state->transport);
    CloudListing own = listOwnDocuments(client, kind);
    CloudListing shared = own.status == CloudListStatus::Ok ? listSharedDocuments(client, kind) : CloudListing{};
    if (own.status != CloudListStatus::Ok) {
      shared.status = own.status;
    }
    state->toUi([sequence, own = std::move(own), shared = std::move(shared)](CloudBrowser& browser) {
      browser.finish(sequence, own, shared);
    });
  });
}

void CloudBrowser::requestOpen(const QString& kind, const QString& documentId, const QString& name,
                               const QString& role) {
  emit openRequested(kind, documentId, name, role);
}

void CloudBrowser::finish(quint64 sequence, const CloudListing& own, const CloudListing& shared) {
  if (sequence != sequence_) {
    return;
  }
  loading_ = false;
  const CloudListStatus status = own.status != CloudListStatus::Ok ? own.status : shared.status;
  switch (status) {
  case CloudListStatus::Ok:
    message_.clear();
    break;
  case CloudListStatus::SignedOut:
    message_ = tr("Sign in again to see your cloud documents.");
    break;
  case CloudListStatus::Offline:
    message_ = tr("The server could not be reached. The lists show what was loaded last.");
    break;
  case CloudListStatus::Refused:
    message_ = tr("The server refused the list (%1).")
                   .arg(QString::fromStdString(own.status == CloudListStatus::Refused ? own.reason : shared.reason));
    break;
  }
  // A failed listing keeps what was loaded before, except after a sign-out.
  if (own.status == CloudListStatus::Ok) {
    cloud_.setItems(own.items);
  }
  if (shared.status == CloudListStatus::Ok) {
    shared_.setItems(shared.items);
  }
  if (status == CloudListStatus::SignedOut) {
    cloud_.setItems({});
    shared_.setItems({});
  }
  emit stateChanged();
}

} // namespace nodetool::account::qt
