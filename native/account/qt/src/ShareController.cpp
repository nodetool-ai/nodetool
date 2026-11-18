#include "nodetool/account/qt/ShareController.h"

#include "nodetool/account/account_session.h"
#include "nodetool/account/cloud_client.h"
#include "nodetool/account/qt/QtHttpTransport.h"
#include "TaskQueue.h"

#include <QMetaObject>

#include <algorithm>
#include <deque>
#include <mutex>

namespace nodetool::account::qt {

namespace {

QString kindLabel(const std::string& kind) {
  if (kind == "script") {
    return ShareController::tr("Script");
  }
  if (kind == "storyboard") {
    return ShareController::tr("Storyboard");
  }
  if (kind == "timeline") {
    return ShareController::tr("Timeline");
  }
  return QString::fromStdString(kind);
}

QString failure(CloudListStatus status, const std::string& reason) {
  switch (status) {
  case CloudListStatus::Ok:
    return {};
  case CloudListStatus::SignedOut:
    return ShareController::tr("Sign in again to share this document.");
  case CloudListStatus::Offline:
    return ShareController::tr("The server could not be reached. Nothing was changed.");
  case CloudListStatus::Refused:
    return ShareController::tr("The server refused the request (%1).").arg(QString::fromStdString(reason));
  }
  return {};
}

} // namespace

// The transport and the hand-off to the controller's thread, shared with
// the tasks.
struct ShareController::Shared {
  // Thread-safe, used by the task thread only.
  std::unique_ptr<HttpTransport> transport;

  std::mutex mutex;
  // Guarded by mutex. Cleared by the controller's destructor.
  ShareController* controller = nullptr;
  // Guarded by mutex.
  std::deque<std::function<void(ShareController&)>> inbox;

  void toUi(std::function<void(ShareController&)> call) {
    const std::lock_guard lock(mutex);
    if (controller == nullptr) {
      return;
    }
    const bool wake = inbox.empty();
    inbox.push_back(std::move(call));
    if (wake) {
      QMetaObject::invokeMethod(controller, "drainInbox", Qt::QueuedConnection);
    }
  }
};

ShareController::ShareController(QObject* parent) : ShareController(nullptr, parent) {}

ShareController::ShareController(std::unique_ptr<HttpTransport> transport, QObject* parent)
    : QObject(parent), shared_(std::make_shared<Shared>()) {
  shared_->transport = transport ? std::move(transport) : std::make_unique<QtHttpTransport>();
  shared_->controller = this;
  tasks_ = std::make_unique<detail::TaskQueue>();
}

ShareController::~ShareController() {
  {
    const std::lock_guard lock(shared_->mutex);
    shared_->controller = nullptr;
    shared_->inbox.clear();
  }
  tasks_.reset();
}

void ShareController::drainInbox() {
  std::deque<std::function<void(ShareController&)>> calls;
  {
    const std::lock_guard lock(shared_->mutex);
    calls.swap(shared_->inbox);
  }
  for (auto& call : calls) {
    call(*this);
  }
}

void ShareController::setAccount(AccountController* account) {
  if (account_ == account) {
    return;
  }
  if (account_) {
    disconnect(account_, nullptr, this, nullptr);
  }
  account_ = account;
  if (account_) {
    connect(account_, &AccountController::signedOut, this, &ShareController::refresh);
    connect(account_, &AccountController::changed, this, [this] {
      if ((session() != nullptr) != signedIn_) {
        refresh();
      }
    });
  }
  emit accountChanged();
  refresh();
}

void ShareController::setKind(const QString& kind) {
  if (kind_ == kind) {
    return;
  }
  kind_ = kind;
  emit documentChanged();
  scanContent();
  refresh();
}

void ShareController::setDocumentId(const QString& documentId) {
  if (documentId_ == documentId) {
    return;
  }
  documentId_ = documentId;
  emit documentChanged();
  refresh();
}

void ShareController::setContent(const QString& content) {
  if (content_ == content) {
    return;
  }
  content_ = content;
  const std::vector<LinkedDocument> before = linkedOrder_;
  scanContent();
  const bool sameLinks = before.size() == linkedOrder_.size() &&
                         std::equal(before.begin(), before.end(), linkedOrder_.begin(),
                                    [](const LinkedDocument& a, const LinkedDocument& b) {
                                      return a.kind == b.kind && a.id == b.id;
                                    });
  if (!sameLinks) {
    refresh();
  }
}

void ShareController::scanContent() {
  const std::string kind = kind_.toStdString();
  const std::string content = content_.toStdString();
  linkedOrder_ = nodetool::account::linkedDocuments(kind, content);
  secrets_.clear();
  for (const SecretFinding& finding : findSecretLike(kind, content)) {
    secrets_.append(QVariantMap{{QStringLiteral("place"), QString::fromStdString(finding.place)},
                                {QStringLiteral("looksLike"), QString::fromStdString(finding.looksLike)}});
  }
  emit contentChanged();
}

std::shared_ptr<AccountSession> ShareController::session() const {
  return account_ && account_->state() == AccountController::State::SignedIn ? account_->session() : nullptr;
}

void ShareController::refresh() {
  const quint64 sequence = ++sequence_;
  const std::shared_ptr<AccountSession> current = session();
  signedIn_ = current != nullptr;
  if (!current || kind_.isEmpty() || documentId_.isEmpty()) {
    loading_ = false;
    state_ = {};
    linked_.clear();
    message_ = current || !account_ ? QString() : failure(CloudListStatus::SignedOut, {});
    emit stateChanged();
    return;
  }
  origin_ = current->serverOrigin();
  loading_ = true;
  emit stateChanged();
  tasks_->post([state = shared_, current, kind = kind_.toStdString(), id = documentId_.toStdString(),
                order = linkedOrder_, sequence] {
    CloudClient client(*current, *state->transport);
    SharingState sharing = readSharing(client, kind, id);
    std::vector<Linked> linked;
    if (sharing.status == CloudListStatus::Ok) {
      for (const LinkedDocument& document : order) {
        Linked entry{document, {}, readSharing(client, document.kind, document.id)};
        if (entry.sharing.status == CloudListStatus::Ok) {
          entry.state = enabledLink(entry.sharing, "viewer") || enabledLink(entry.sharing, "editor")
                            ? QStringLiteral("shared")
                            : QStringLiteral("notShared");
        } else {
          entry.state = QStringLiteral("unavailable");
        }
        linked.push_back(std::move(entry));
      }
    }
    state->toUi([sequence, sharing = std::move(sharing), linked = std::move(linked)](ShareController& c) mutable {
      c.finishRead(sequence, std::move(sharing), std::move(linked));
    });
  });
}

void ShareController::finishRead(quint64 sequence, SharingState state, std::vector<Linked> linked) {
  if (sequence != sequence_) {
    return;
  }
  loading_ = false;
  message_ = failure(state.status, state.reason);
  // A failed read keeps what was read before, except after a sign-out.
  if (state.status == CloudListStatus::Ok || state.status == CloudListStatus::SignedOut) {
    state_ = std::move(state);
    linked_ = std::move(linked);
  }
  emit stateChanged();
}

void ShareController::change(std::function<ShareChange(CloudClient&)> call) {
  const std::shared_ptr<AccountSession> current = session();
  if (!current) {
    message_ = failure(CloudListStatus::SignedOut, {});
    emit stateChanged();
    return;
  }
  ++busy_;
  message_.clear();
  emit stateChanged();
  tasks_->post([state = shared_, current, call = std::move(call)] {
    CloudClient client(*current, *state->transport);
    ShareChange result = call(client);
    state->toUi([result = std::move(result)](ShareController& c) { c.finishChange(result); });
  });
}

void ShareController::finishChange(const ShareChange& result) {
  --busy_;
  message_ = failure(result.status, result.reason);
  emit stateChanged();
  // The read shows the change and anything another window changed.
  refresh();
}

void ShareController::createLink(const QString& role) {
  change([kind = kind_.toStdString(), id = documentId_.toStdString(), role = role.toStdString()](CloudClient& c) {
    return nodetool::account::createLink(c, kind, id, role);
  });
}

void ShareController::disableLink(const QString& role) {
  const ShareLink* link = enabledLink(state_, role.toStdString());
  if (link == nullptr) {
    return;
  }
  change([kind = kind_.toStdString(), id = documentId_.toStdString(), shareId = link->id](CloudClient& c) {
    return nodetool::account::disableLink(c, kind, id, shareId);
  });
}

void ShareController::setViewerOptions(bool history, bool download, bool duplicate) {
  const ShareLink* link = enabledLink(state_, "viewer");
  if (link == nullptr) {
    return;
  }
  change([kind = kind_.toStdString(), id = documentId_.toStdString(), shareId = link->id,
          options = ShareOptions{history, download, duplicate}](CloudClient& c) {
    return nodetool::account::setLinkOptions(c, kind, id, shareId, options);
  });
}

void ShareController::setPersonRole(const QString& userId, const QString& role) {
  change([kind = kind_.toStdString(), id = documentId_.toStdString(), user = userId.toStdString(),
          role = role.toStdString()](CloudClient& c) {
    return nodetool::account::setPersonRole(c, kind, id, user, role);
  });
}

void ShareController::removePerson(const QString& userId) {
  change([kind = kind_.toStdString(), id = documentId_.toStdString(), user = userId.toStdString()](CloudClient& c) {
    return nodetool::account::removePerson(c, kind, id, user);
  });
}

void ShareController::shareLinked(const QString& kind, const QString& documentId, const QString& role) {
  change([kind = kind.toStdString(), id = documentId.toStdString(), role = role.toStdString()](CloudClient& c) {
    return nodetool::account::createLink(c, kind, id, role);
  });
}

QString ShareController::statement(const QString& role, bool history, bool download, bool duplicate) const {
  return QString::fromStdString(linkStatement(role.toStdString(), {history, download, duplicate}));
}

QVariantMap ShareController::linkMap(const std::string& role) const {
  const ShareLink* link = enabledLink(state_, role);
  const ShareOptions options = link ? link->options : ShareOptions{};
  return {
      {QStringLiteral("exists"), link != nullptr},
      {QStringLiteral("shareId"), link ? QString::fromStdString(link->id) : QString()},
      {QStringLiteral("url"),
       link ? QString::fromStdString(shareUrl(origin_, kind_.toStdString(), link->token, role)) : QString()},
      {QStringLiteral("statement"), QString::fromStdString(linkStatement(role, options))},
      {QStringLiteral("history"), options.history},
      {QStringLiteral("download"), options.download},
      {QStringLiteral("duplicate"), options.duplicate},
  };
}

QVariantList ShareController::people() const {
  QVariantList out;
  for (const SharePerson& person : state_.people) {
    if (person.role == "owner") {
      continue;
    }
    out.append(QVariantMap{{QStringLiteral("userId"), QString::fromStdString(person.userId)},
                           {QStringLiteral("name"), QString::fromStdString(person.name)},
                           {QStringLiteral("email"), QString::fromStdString(person.email)},
                           {QStringLiteral("role"), QString::fromStdString(person.role)}});
  }
  return out;
}

QVariantList ShareController::linkedDocuments() const {
  QVariantList out;
  for (const LinkedDocument& document : linkedOrder_) {
    QString state = QStringLiteral("checking");
    QString viewerUrl;
    QString editorUrl;
    for (const Linked& entry : linked_) {
      if (entry.document.kind != document.kind || entry.document.id != document.id) {
        continue;
      }
      state = entry.state;
      if (const ShareLink* link = enabledLink(entry.sharing, "viewer")) {
        viewerUrl = QString::fromStdString(shareUrl(origin_, document.kind, link->token, "viewer"));
      }
      if (const ShareLink* link = enabledLink(entry.sharing, "editor")) {
        editorUrl = QString::fromStdString(shareUrl(origin_, document.kind, link->token, "editor"));
      }
    }
    if (!loading_ && state == QStringLiteral("checking") && state_.status != CloudListStatus::Ok) {
      state = QStringLiteral("unavailable");
    }
    out.append(QVariantMap{
        {QStringLiteral("kind"), QString::fromStdString(document.kind)},
        {QStringLiteral("documentId"), QString::fromStdString(document.id)},
        {QStringLiteral("label"), kindLabel(document.kind) + QLatin1Char(' ') +
                                      QString::fromStdString(document.id).left(12)},
        {QStringLiteral("state"), state},
        {QStringLiteral("viewerUrl"), viewerUrl},
        {QStringLiteral("editorUrl"), editorUrl},
    });
  }
  return out;
}

} // namespace nodetool::account::qt
