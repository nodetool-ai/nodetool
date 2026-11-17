#include "nodetool/account/qt/CloudDocument.h"

#include "nodetool/account/account_session.h"
#include "nodetool/account/cloud_client.h"
#include "nodetool/account/cloud_savers.h"
#include "nodetool/account/crypto.h"
#include "nodetool/account/qt/QtHttpTransport.h"
#include "TaskQueue.h"

#include <QCoreApplication>
#include <QDateTime>
#include <QLocale>
#include <QMetaObject>

#include <deque>
#include <future>
#include <mutex>

namespace nodetool::account::qt {

namespace {

int64_t systemNowMs() {
  return QDateTime::currentMSecsSinceEpoch();
}

CloudDocument::SyncStatus statusOf(const DocumentState& state) {
  using S = CloudDocument::SyncStatus;
  switch (state.status) {
  case DocumentStatus::SavedToCloud:
    return S::SavedToCloud;
  case DocumentStatus::Sending:
    return S::Sending;
  case DocumentStatus::ChangesWaiting:
    return S::ChangesWaiting;
  case DocumentStatus::Offline:
    return state.lastContactMs == 0 ? S::CloudStatusUnknown : S::Offline;
  case DocumentStatus::NotSaving:
    return S::NotSaving;
  case DocumentStatus::Unsent:
    return S::Unsent;
  case DocumentStatus::SignedOut:
    return S::SignedOut;
  }
  return S::ChangesWaiting;
}

bool accessRemoved(const QString& code) {
  return code == QLatin1String("FORBIDDEN") || code == QLatin1String("NOT_FOUND") || code == QLatin1String("HTTP_403") ||
         code == QLatin1String("HTTP_404");
}

QString refusalText(const QString& code) {
  if (accessRemoved(code)) {
    return QCoreApplication::translate("CloudDocument", "access removed");
  }
  if (code == QLatin1String("SCHEMA_DOWNGRADE")) {
    return QCoreApplication::translate("CloudDocument", "stored in a newer format than this app writes");
  }
  if (code == QLatin1String("CLIENT_TOO_OLD")) {
    return QCoreApplication::translate("CloudDocument", "this app is too old for the server");
  }
  return code;
}

} // namespace

QString syncStatusText(CloudDocument::SyncStatus status, uint64_t waitingEdits, const QString& lastContact,
                       const QString& refusal) {
  using S = CloudDocument::SyncStatus;
  const auto tr = [](const char* text) { return QCoreApplication::translate("CloudDocument", text); };
  const QString waiting = waitingEdits == 1 ? tr("1 change waiting")
                                            : tr("%1 changes waiting").arg(static_cast<qulonglong>(waitingEdits));
  switch (status) {
  case S::Opening:
    return tr("Opening");
  case S::NotOpened:
    return tr("Not opened: %1").arg(refusal);
  case S::SavedToCloud:
    return tr("Saved to cloud");
  case S::Sending:
    return tr("Sending");
  case S::ChangesWaiting:
    return waitingEdits == 0 ? tr("Changes waiting") : waiting.left(1).toUpper() + waiting.mid(1);
  case S::Offline:
    return waitingEdits == 0 ? tr("Offline, last connected %1").arg(lastContact)
                             : tr("Offline, %1, last connected %2").arg(waiting, lastContact);
  case S::CloudStatusUnknown:
    return waitingEdits == 0 ? tr("Cloud status unknown") : tr("Cloud status unknown, %1").arg(waiting);
  case S::NotSaving:
    return tr("Not saving: the changes could not be written on this computer");
  case S::Unsent:
    return tr("Unsent edits: %1").arg(refusalText(refusal));
  case S::SignedOut:
    return tr("Signed out, changes kept on this computer");
  }
  return {};
}

// The services, the savers and the hand-off to the document's thread.
struct CloudDocument::Shared {
  CloudDocumentServices services;
  // Created at open, on the task thread. Read by later tasks only.
  std::unique_ptr<CloudClient> client;
  std::unique_ptr<TrpcCloudSaver> saver;
  CloudDocumentKey key;

  std::mutex mutex;
  // Guarded by mutex. Set at open. Shared because edit() calls it from the
  // UI thread while a tick holds it on the task thread; the saver is
  // thread-safe under its own mutex.
  std::shared_ptr<CloudDocumentSaver> document;
  // Guarded by mutex. Cleared by the document's destructor.
  CloudDocument* owner = nullptr;
  // Guarded by mutex.
  std::deque<std::function<void(CloudDocument&)>> inbox;

  std::shared_ptr<CloudDocumentSaver> currentDocument() {
    const std::lock_guard lock(mutex);
    return document;
  }

  void toUi(std::function<void(CloudDocument&)> call) {
    const std::lock_guard lock(mutex);
    if (owner == nullptr) {
      return;
    }
    const bool wake = inbox.empty();
    inbox.push_back(std::move(call));
    if (wake) {
      QMetaObject::invokeMethod(owner, "drainInbox", Qt::QueuedConnection);
    }
  }
};

CloudDocument::CloudDocument(CloudDocumentServices services, QObject* parent)
    : QObject(parent),
      shared_(std::make_shared<Shared>()),
      kind_(QString::fromStdString(services.kind)),
      documentId_(QString::fromStdString(services.documentId)),
      role_(QString::fromStdString(services.role)) {
  if (!services.transport) {
    services.transport = std::make_unique<QtHttpTransport>();
  }
  if (!services.nowMs) {
    services.nowMs = systemNowMs;
  }
  shared_->services = std::move(services);
  shared_->owner = this;
  tasks_ = std::make_unique<detail::TaskQueue>();
  persistTasks_ = std::make_unique<detail::TaskQueue>();
  timer_.setInterval(kTickInterval);
  connect(&timer_, &QTimer::timeout, this, &CloudDocument::tick);
}

CloudDocument::~CloudDocument() {
  {
    const std::lock_guard lock(shared_->mutex);
    shared_->owner = nullptr;
    shared_->inbox.clear();
  }
  tasks_.reset();
  persistTasks_.reset();
  // Both task threads have ended, so this thread writes the edits the timer
  // did not reach yet. The tab closes with them on disk (FR11).
  if (const auto saver = shared_->currentDocument()) {
    saver->flush(shared_->services.nowMs());
  }
}

void CloudDocument::drainInbox() {
  std::deque<std::function<void(CloudDocument&)>> calls;
  {
    const std::lock_guard lock(shared_->mutex);
    calls.swap(shared_->inbox);
  }
  for (auto& call : calls) {
    call(*this);
  }
}

QString CloudDocument::syncText() const {
  const QString lastContact =
      lastContactMs_ == 0
          ? QString()
          : QLocale().toString(QDateTime::fromMSecsSinceEpoch(lastContactMs_).time(), QLocale::ShortFormat);
  return syncStatusText(status_, waitingEdits_, lastContact, refusal_);
}

void CloudDocument::open() {
  if (opened_ || !shared_->services.session) {
    if (!shared_->services.session) {
      status_ = SyncStatus::NotOpened;
      refusal_ = tr("not signed in");
      emit stateChanged();
      emit openFailed(refusal_);
    }
    return;
  }
  status_ = SyncStatus::Opening;
  emit stateChanged();
  tasks_->post([state = shared_] {
    CloudDocumentServices& services = state->services;
    AccountSession& session = *services.session;
    state->client = std::make_unique<CloudClient>(session, *services.transport);
    if (services.kind == "timeline") {
      state->saver = std::make_unique<TimelineCloudSaver>(*state->client);
    } else {
      state->saver = std::make_unique<WorkflowCloudSaver>(*state->client);
    }
    state->key = {serverKey(session.serverOrigin()), session.accountId(), services.kind, services.documentId};
    state->saver->setAccess(services.documentId, {services.role == "viewer" ? "viewer" : "editor", {}});
    const OpenedDocument opened = state->saver->open(state->key);
    if (opened.status != SaveStatus::Ok) {
      QString reason;
      switch (opened.status) {
      case SaveStatus::Offline:
        reason = QCoreApplication::translate("CloudDocument", "the server could not be reached");
        break;
      case SaveStatus::SignedOut:
        reason = QCoreApplication::translate("CloudDocument", "signed out");
        break;
      default:
        reason = refusalText(QString::fromStdString(opened.reason));
        break;
      }
      state->toUi([reason](CloudDocument& document) {
        document.status_ = SyncStatus::NotOpened;
        document.refusal_ = reason;
        emit document.stateChanged();
        emit document.openFailed(reason);
      });
      return;
    }
    // A draft this account left behind, whether waiting or refused, opens
    // over the revision: its edits are never dropped by a reopen.
    const DraftLoad load = state->services.store->load(state->key);
    if (!load.ok) {
      // Without knowing whether a draft is kept, the document opens without
      // a saver, read-only: a new draft would replace a kept one.
      const QString revision = QString::fromStdString(opened.data);
      const QString reason =
          QCoreApplication::translate("CloudDocument", "the edits kept on this computer could not be read");
      state->toUi([revision, reason](CloudDocument& document) {
        document.onOpened(revision, QString(), false, reason, DocumentState{});
      });
      return;
    }
    std::shared_ptr<CloudDocumentSaver> saver;
    QString draft;
    if (load.draft) {
      draft = QString::fromStdString(load.draft->draft);
      saver = std::make_shared<CloudDocumentSaver>(*state->services.store, *state->saver, *load.draft);
    } else {
      saver = std::make_shared<CloudDocumentSaver>(*state->services.store, *state->saver, state->key, opened.base);
    }
    const DocumentState initial = saver->state();
    {
      const std::lock_guard lock(state->mutex);
      state->document = std::move(saver);
    }
    const bool writable = opened.writable && state->services.role != "viewer";
    const QString reason = state->services.role == "viewer"
                               ? QCoreApplication::translate("CloudDocument", "you can view this document")
                               : refusalText(QString::fromStdString(opened.reason));
    const QString revision = QString::fromStdString(opened.data);
    state->toUi([revision, draft, writable, reason, initial](CloudDocument& document) {
      document.onOpened(revision, draft, writable, reason, initial);
    });
  });
}

void CloudDocument::onOpened(const QString& revision, const QString& draft, bool writable, const QString& reason,
                             const DocumentState& state) {
  opened_ = true;
  readOnly_ = !writable;
  readOnlyReason_ = writable ? QString() : reason;
  content_ = draft.isEmpty() ? revision : draft;
  apply(state);
  timer_.start();
  emit opened(revision, draft);
}

void CloudDocument::edit(const QString& document) {
  if (!opened_ || readOnly_) {
    return;
  }
  content_ = document;
  const auto saver = shared_->currentDocument();
  if (!saver) {
    return;
  }
  saver->edit(document.toStdString(), shared_->services.nowMs());
  apply(saver->state());
}

bool CloudDocument::writeLocally() {
  const auto saver = shared_->currentDocument();
  if (!opened_ || !saver) {
    return true;
  }
  // The write runs on the persistence thread, after any write it is
  // running, so an older draft never lands over this one.
  auto written = std::make_shared<std::promise<bool>>();
  std::future<bool> result = written->get_future();
  persistTasks_->post([state = shared_, saver, written] {
    written->set_value(saver->flush(state->services.nowMs()));
    const DocumentState after = saver->state();
    state->toUi([after](CloudDocument& document) { document.apply(after); });
  });
  if (result.wait_for(kWriteLocallyTimeout) != std::future_status::ready) {
    return false;
  }
  return result.get();
}

void CloudDocument::tick() {
  // The local write and the send run on their own threads, so a slow send
  // never holds an edit in memory past kDraftMaxDelayMs (FR11).
  if (!persistRunning_) {
    persistRunning_ = true;
    persistTasks_->post([state = shared_] {
      const auto saver = state->currentDocument();
      if (saver) {
        saver->persist(state->services.nowMs());
      }
      const DocumentState after = saver ? saver->state() : DocumentState{};
      state->toUi([after, hasSaver = saver != nullptr](CloudDocument& document) {
        document.persistRunning_ = false;
        if (hasSaver) {
          document.apply(after);
        }
      });
    });
  }
  if (!sendRunning_) {
    sendRunning_ = true;
    tasks_->post([state = shared_] {
      const auto saver = state->currentDocument();
      if (saver) {
        saver->send(state->services.nowMs());
      }
      const DocumentState after = saver ? saver->state() : DocumentState{};
      state->toUi([after, hasSaver = saver != nullptr](CloudDocument& document) {
        document.sendRunning_ = false;
        if (hasSaver) {
          document.apply(after);
        }
      });
    });
  }
}

void CloudDocument::apply(const DocumentState& state) {
  const SyncStatus status = statusOf(state);
  const QString refusal = QString::fromStdString(state.refusal);
  if (status == status_ && state.waitingEdits == waitingEdits_ && state.lastContactMs == lastContactMs_ &&
      refusal == refusal_) {
    return;
  }
  status_ = status;
  waitingEdits_ = state.waitingEdits;
  lastContactMs_ = state.lastContactMs;
  refusal_ = refusal;
  if (status == SyncStatus::Unsent && accessRemoved(refusal)) {
    // PRD "lose access": the tab becomes read-only and the edits stay as
    // unsent in the local store.
    readOnly_ = true;
    readOnlyReason_ = refusalText(refusal);
  }
  emit stateChanged();
}

} // namespace nodetool::account::qt
