#include "nodetool/account/qt/TransferController.h"

#include "nodetool/account/origin.h"

#include "nodetool/account/account_session.h"
#include "nodetool/account/qt/QtHttpTransport.h"
#include "TaskQueue.h"

#include <QMetaObject>

#include <deque>
#include <mutex>
#include <optional>

namespace nodetool::account::qt {

namespace {

QString failure(TransferStatus status, const std::string& reason) {
  switch (status) {
  case TransferStatus::Ok:
    return {};
  case TransferStatus::SignedOut:
    return TransferController::tr("Sign in again to send or receive this project.");
  case TransferStatus::Offline:
    return TransferController::tr("The cloud server could not be reached. Try again when you are online.");
  case TransferStatus::LocalUnavailable:
    return TransferController::tr("The project server of this app did not answer.");
  case TransferStatus::Refused:
    return TransferController::tr("The server refused the transfer (%1).").arg(QString::fromStdString(reason));
  }
  return {};
}

QString sectionName(ReviewSection section) {
  switch (section) {
  case ReviewSection::Send:
    return QStringLiteral("send");
  case ReviewSection::Receive:
    return QStringLiteral("receive");
  case ReviewSection::Choice:
    return QStringLiteral("choice");
  case ReviewSection::Deletion:
    return QStringLiteral("deletion");
  case ReviewSection::Problem:
    return QStringLiteral("problem");
  }
  return {};
}

QStringList listOf(const std::vector<std::string>& names) {
  QStringList out;
  for (const std::string& name : names) {
    out.append(QString::fromStdString(name));
  }
  return out;
}

} // namespace

static QString transferRowDetail(const ReviewRow& row);

QString transferRowText(const ReviewRow& row) {
  const QString text = transferRowDetail(row);
  if (row.section == ReviewSection::Send && row.documentFileMissing) {
    const QString missing = TransferController::tr(
        "Its file is missing from the project folder, so its last saved version will be sent.");
    return row.detail == "document_file_missing" ? missing : text + QStringLiteral(". ") + missing;
  }
  return text;
}

static QString transferRowDetail(const ReviewRow& row) {
  const std::string& d = row.detail;
  switch (row.section) {
  case ReviewSection::Send:
    if (d == "create_document") {
      return TransferController::tr("New here, will be sent");
    }
    if (d == "replace_document") {
      return TransferController::tr("Changed here, will be sent");
    }
    if (d == "rename_document") {
      return TransferController::tr("Renamed to %1").arg(QString::fromStdString(row.name));
    }
    if (d == "keep_both") {
      return TransferController::tr("Will be sent as a copy beside the cloud version");
    }
    if (d == "add_versions") {
      return TransferController::tr("Saved versions will be sent");
    }
    if (d == "put_asset_file") {
      return TransferController::tr("File changed here, will be sent");
    }
    break;
  case ReviewSection::Receive:
    if (d == "new") {
      return TransferController::tr("New in the cloud");
    }
    if (d == "cloud_changed") {
      return TransferController::tr("Changed in the cloud");
    }
    break;
  case ReviewSection::Choice:
    return TransferController::tr("Changed here and in the cloud");
  case ReviewSection::Deletion:
    if (d == "cloud_changed") {
      return TransferController::tr("Deleted on this computer, and changed in the cloud since");
    }
    return TransferController::tr("Deleted on this computer");
  case ReviewSection::Problem: {
    // A missing file reads "file <asset>: <reason>".
    const std::size_t colon = d.find(": ");
    const std::string reason = d.starts_with("file ") && colon != std::string::npos ? d.substr(colon + 2) : d;
    if (reason == "missing_locally") {
      return TransferController::tr("A file it needs is missing from the project folder");
    }
    if (reason == "too_large") {
      return TransferController::tr("A file it needs is too large to send");
    }
    if (reason == "over_allowance") {
      return TransferController::tr("A file it needs does not fit in the storage allowance");
    }
    return TransferController::tr("Cannot be sent: %1").arg(QString::fromStdString(reason));
  }
  }
  return QString::fromStdString(d);
}

// The transport and the hand-off to the controller's thread, shared with
// the tasks.
struct TransferController::Shared {
  // Thread-safe, used by the task thread only.
  std::unique_ptr<HttpTransport> transport;

  std::mutex mutex;
  // Guarded by mutex. Cleared by the controller's destructor.
  TransferController* controller = nullptr;
  // Guarded by mutex.
  std::deque<std::function<void(TransferController&)>> inbox;

  void toUi(std::function<void(TransferController&)> call) {
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

struct TransferController::Captured {
  SendCapture send;
  ReceiveCapture receive;
};

struct TransferController::Applied {
  std::optional<ReceiveRun> receive;
  // The receive of the refused documents the person chose to receive, from
  // a set captured for them (review F39).
  std::optional<ReceiveRun> refusalReceive;
  // Refused documents picked for Receive whose cloud revision or local copy
  // changed since the review. Nothing was received (review F46).
  std::vector<TransferFailure> changedAgain;
  // Set when the send was captured again after the receive.
  std::optional<SendCapture> recaptured;
  // Operations of the recapture the sheet did not show. Nothing was sent.
  std::vector<TransferOperation> unreviewed;
  std::vector<TransferFileOperation> unreviewedFiles;
  // The end of the first captured send before the recapture. When it
  // fails, the send is not captured again (review F41).
  std::optional<LocalTransferClient::Cancel> endedSend;
  std::optional<SendRun> send;
};

TransferController::TransferController(QObject* parent) : TransferController(nullptr, parent) {}

TransferController::TransferController(std::unique_ptr<HttpTransport> transport, QObject* parent)
    : QObject(parent), shared_(std::make_shared<Shared>()), cancel_(std::make_shared<RequestCancel>()) {
  shared_->transport = transport ? std::move(transport) : std::make_unique<QtHttpTransport>();
  shared_->controller = this;
  tasks_ = std::make_unique<detail::TaskQueue>();
}

TransferController::~TransferController() {
  {
    const std::lock_guard lock(shared_->mutex);
    shared_->controller = nullptr;
    shared_->inbox.clear();
  }
  // A request in flight returns now, and the tasks still queued are dropped.
  cancel_->cancel();
  tasks_.reset();
}

void TransferController::drainInbox() {
  std::deque<std::function<void(TransferController&)>> calls;
  {
    const std::lock_guard lock(shared_->mutex);
    calls.swap(shared_->inbox);
  }
  for (auto& call : calls) {
    call(*this);
  }
}

void TransferController::setAccount(AccountController* account) {
  if (account_ == account) {
    return;
  }
  account_ = account;
  emit accountChanged();
}

void TransferController::setServerUrl(const QUrl& url) {
  if (serverUrl_ == url) {
    return;
  }
  serverUrl_ = url;
  emit projectChanged();
}

void TransferController::setBundledServerUrl(const QUrl& url) {
  if (bundledServerUrl_ == url) {
    return;
  }
  bundledServerUrl_ = url;
  emit projectChanged();
}

bool TransferController::onBundledServer() const {
  if (!isLoopbackHttpOrigin(origin()) || !bundledServerUrl_.isValid()) {
    return false;
  }
  const QUrl bundled = bundledServerUrl_.adjusted(QUrl::RemovePath | QUrl::RemoveQuery | QUrl::RemoveFragment);
  return bundled.toString().toStdString() == origin();
}

void TransferController::setServerToken(const QString& token) {
  if (serverToken_ == token) {
    return;
  }
  serverToken_ = token;
  emit projectChanged();
}

void TransferController::setProjectId(const QString& projectId) {
  if (projectId_ == projectId) {
    return;
  }
  projectId_ = projectId;
  emit projectChanged();
}

void TransferController::setProjectName(const QString& name) {
  if (projectName_ == name) {
    return;
  }
  projectName_ = name;
  emit projectChanged();
}

void TransferController::setLinked(bool linked) {
  if (linked_ == linked) {
    return;
  }
  linked_ = linked;
  emit projectChanged();
}

std::shared_ptr<AccountSession> TransferController::session() const {
  return account_ && account_->state() == AccountController::State::SignedIn ? account_->session() : nullptr;
}

std::vector<std::pair<std::string, std::string>> TransferController::headers() const {
  if (serverToken_.isEmpty()) {
    return {};
  }
  // LocalTransferClient sends to serverUrl's origin only.
  return {{"Authorization", "Bearer " + serverToken_.toStdString()}};
}

QVariantList TransferController::rows() const {
  // Grouped by section in the order the sheet shows them. `index` is the
  // row's place in the review, which choose() and confirmDeletion() take.
  constexpr ReviewSection kOrder[] = {ReviewSection::Choice, ReviewSection::Receive, ReviewSection::Send,
                                      ReviewSection::Deletion, ReviewSection::Problem};
  QVariantList out;
  const std::vector<ReviewRow>& all = review_.rows();
  for (const ReviewSection section : kOrder) {
    for (std::size_t i = 0; i < all.size(); ++i) {
      const ReviewRow& row = all[i];
      if (row.section != section) {
        continue;
      }
      QString choice;
      if (row.choice) {
        choice = *row.choice == ReceiveChoice::Receive ? QStringLiteral("receive") : QStringLiteral("keepLocal");
      }
      out.append(QVariantMap{{QStringLiteral("index"), static_cast<int>(i)},
                             {QStringLiteral("section"), sectionName(row.section)},
                             {QStringLiteral("kind"), QString::fromStdString(row.kind)},
                             {QStringLiteral("documentId"), QString::fromStdString(row.documentId)},
                             {QStringLiteral("name"),
                              QString::fromStdString(row.name.empty() ? row.documentId : row.name)},
                             {QStringLiteral("detail"), QString::fromStdString(row.detail)},
                             {QStringLiteral("text"), transferRowText(row)},
                             {QStringLiteral("choice"), choice},
                             {QStringLiteral("confirmed"), row.confirmed},
                             {QStringLiteral("canKeepDeletion"), row.sendListed},
                             {QStringLiteral("canRestore"), row.receiveListed},
                             {QStringLiteral("canSendWithout"), !row.assetId.empty()},
                             {QStringLiteral("canReceive"), linked_ || row.cloudHash.empty()}});
    }
  }
  return out;
}

void TransferController::fail(const QString& message) {
  stage_ = Stage::Failed;
  message_ = message;
  emit stateChanged();
}

void TransferController::start() {
  if (stage_ == Stage::Capturing || stage_ == Stage::Running) {
    return;
  }
  const std::shared_ptr<AccountSession> current = session();
  review_ = {};
  transferId_.clear();
  setId_.clear();
  sendWork_ = false;
  received_ = false;
  receivedResult_.clear();
  external_.clear();
  result_.clear();
  emit rowsChanged();
  if (!current) {
    fail(linked_ ? tr("Sign in to synchronize this project.") : tr("Sign in to publish this project."));
    return;
  }
  if (!serverUrl_.isValid() || projectId_.isEmpty()) {
    fail(tr("This project has no server to send it from."));
    return;
  }
  // The app's bundled server runs the transfer and receives the account's
  // access token. A project open on another server, also one on this
  // computer, is not sent from it (review F53).
  if (!onBundledServer()) {
    fail(tr("Only projects on this app's own server can be published or synchronized."));
    return;
  }
  const quint64 sequence = ++sequence_;
  stage_ = Stage::Capturing;
  message_.clear();
  emit stateChanged();
  tasks_->post([state = shared_, cancel = std::shared_ptr<const RequestCancel>(cancel_), current, origin = origin(), headers = headers(), projectId = projectId_.toStdString(),
                name = projectName_.toStdString(), linked = linked_, sequence] {
    LocalTransferClient client(*state->transport, origin, headers, *current, cancel);
    Captured captured;
    captured.send = client.captureSend(projectId, name);
    if (linked && captured.send.status == TransferStatus::Ok && !captured.send.collectFirst) {
      captured.receive = client.captureReceive(projectId);
    } else {
      captured.receive.status = TransferStatus::Ok;
    }
    state->toUi([sequence, captured = std::move(captured)](TransferController& self) {
      self.finishCapture(sequence, captured);
    });
  });
}

void TransferController::finishCapture(quint64 sequence, const Captured& captured) {
  if (sequence != sequence_) {
    // Cancelled while it captured: end the send it opened.
    endSend(captured.send.transferId);
    return;
  }
  if (captured.send.status != TransferStatus::Ok) {
    fail(failure(captured.send.status, captured.send.reason));
    return;
  }
  if (captured.send.collectFirst) {
    stage_ = Stage::CollectFirst;
    message_ = QString::fromStdString(captured.send.message);
    external_ = listOf(captured.send.external);
    emit stateChanged();
    return;
  }
  transferId_ = captured.send.transferId;
  if (captured.receive.status != TransferStatus::Ok) {
    // The send is open and nothing was shown: end it.
    endSend(transferId_);
    transferId_.clear();
    fail(failure(captured.receive.status, captured.receive.reason));
    return;
  }
  setId_ = captured.receive.setId;
  sendWork_ = !captured.send.operations.empty() || !captured.send.fileOperations.empty();
  review_ = TransferReview(captured.send, captured.receive);
  sendCapture_ = captured.send;
  approved_ = captured.send.operations;
  approvedFiles_ = captured.send.fileOperations;
  stage_ = Stage::Reviewing;
  message_.clear();
  emit rowsChanged();
  emit stateChanged();
}

bool TransferController::choose(int index, const QString& choice) {
  if (index < 0 || stage_ != Stage::Reviewing) {
    return false;
  }
  std::optional<ReceiveChoice> picked;
  if (choice == u"receive") {
    picked = ReceiveChoice::Receive;
  } else if (choice == u"keepLocal") {
    picked = ReceiveChoice::KeepLocal;
  } else if (!choice.isEmpty()) {
    return false;
  }
  // An unlinked project has no cloud revision to receive (review F39).
  const std::vector<ReviewRow>& rows = review_.rows();
  if (picked == ReceiveChoice::Receive && !linked_ && static_cast<std::size_t>(index) < rows.size() &&
      !rows[static_cast<std::size_t>(index)].cloudHash.empty()) {
    return false;
  }
  if (!review_.choose(static_cast<std::size_t>(index), picked)) {
    return false;
  }
  emit rowsChanged();
  return true;
}

bool TransferController::confirmMissingFile(int index, bool confirmed) {
  if (index < 0 || stage_ != Stage::Reviewing) {
    return false;
  }
  if (!review_.confirmMissingFile(static_cast<std::size_t>(index), confirmed)) {
    return false;
  }
  emit rowsChanged();
  return true;
}

bool TransferController::confirmDeletion(int index, bool confirmed) {
  if (index < 0 || stage_ != Stage::Reviewing) {
    return false;
  }
  if (!review_.confirmDeletion(static_cast<std::size_t>(index), confirmed)) {
    return false;
  }
  emit rowsChanged();
  return true;
}

void TransferController::apply() {
  if (stage_ != Stage::Reviewing || !review_.ready()) {
    return;
  }
  const std::shared_ptr<AccountSession> current = session();
  if (!current) {
    message_ = failure(TransferStatus::SignedOut, {});
    emit stateChanged();
    return;
  }
  if (!onBundledServer()) {
    message_ = tr("Only projects on this app's own server can be published or synchronized.");
    emit stateChanged();
    return;
  }
  const quint64 sequence = ++sequence_;
  stage_ = Stage::Running;
  message_.clear();
  emit stateChanged();
  tasks_->post([state = shared_, cancel = std::shared_ptr<const RequestCancel>(cancel_), current, origin = origin(), headers = headers(), review = review_, transferId = transferId_,
                setId = received_ ? std::string() : setId_,
                refusals = linked_ ? review_.refusalsToReceive() : std::vector<TransferReview::RefusalReceive>{},
                sendWork = sendWork_ || !linked_ || !review_.confirmedDeletes().empty(),
                approved = approved_, approvedFiles = approvedFiles_, projectId = projectId_.toStdString(), name = projectName_.toStdString(),
                sequence]() mutable {
    LocalTransferClient client(*state->transport, origin, headers, *current, cancel);
    Applied applied;
    const auto report = [&] {
      state->toUi([sequence, applied = std::move(applied)](TransferController& self) {
        self.finishApply(sequence, applied);
      });
    };
    bool replaced = false;
    if (!setId.empty()) {
      applied.receive = client.runReceive(setId, review.receiveDecisions());
      if (applied.receive->status != TransferStatus::Ok || applied.receive->outcome != "finished") {
        report();
        return;
      }
      replaced = !applied.receive->received.empty();
    }
    if (!refusals.empty()) {
      // A refused document the person chose to receive has a cloud revision
      // newer than any set the sheet read. Capture a set for it and receive
      // only those documents. Everything else in the set stays as it is
      // here, since the sheet never showed it (review F39).
      const ReceiveCapture fresh = client.captureReceive(projectId);
      if (fresh.status != TransferStatus::Ok) {
        ReceiveRun refused;
        refused.status = fresh.status;
        refused.reason = fresh.reason;
        applied.refusalReceive = std::move(refused);
        report();
        return;
      }
      std::vector<ReceiveDecision> decisions;
      bool wanted = false;
      for (const ReceiveDocument& document : fresh.documents) {
        if (document.state == ReceiveState::Same) {
          continue;
        }
        const TransferReview::RefusalReceive* refusal = nullptr;
        for (const TransferReview::RefusalReceive& candidate : refusals) {
          if (candidate.kind == document.kind && candidate.cloudId == document.cloudId) {
            refusal = &candidate;
          }
        }
        if (refusal) {
          // The approval covers the two revisions the person saw: the cloud
          // revision the refusal named, and this computer's copy the sheet
          // was about to send. Either one changed asks again (review F46).
          std::string reviewedLocal;
          for (const TransferOperation& operation : approved) {
            if (operation.kind == document.kind && operation.documentId == document.cloudId) {
              reviewedLocal = operation.capturedHash;
            }
          }
          if (document.contentHash != refusal->cloudHash || reviewedLocal.empty() ||
              document.localHash != reviewedLocal) {
            applied.changedAgain.push_back({"BASE_CHANGED", document.kind, document.cloudId, document.contentHash,
                                            "changed since the review"});
          }
        }
        wanted = wanted || refusal != nullptr;
        decisions.push_back(
            {document.kind, document.cloudId, refusal ? ReceiveChoice::Receive : ReceiveChoice::KeepLocal});
      }
      if (!applied.changedAgain.empty()) {
        client.cancelReceive(fresh.setId);
        report();
        return;
      }
      if (!wanted) {
        client.cancelReceive(fresh.setId);
      } else {
        applied.refusalReceive = client.runReceive(fresh.setId, decisions);
        if (applied.refusalReceive->status != TransferStatus::Ok || applied.refusalReceive->outcome != "finished") {
          report();
          return;
        }
        replaced = replaced || !applied.refusalReceive->received.empty();
      }
    }
    {
      // The captured send may carry a document the receive just replaced:
      // capture it again, so it sends only what is still changed here.
      if (replaced && sendWork) {
        applied.endedSend = client.cancelSend(transferId);
        if (applied.endedSend->status != TransferStatus::Ok) {
          report();
          return;
        }
        applied.recaptured = client.captureSend(projectId, name);
        if (applied.recaptured->status != TransferStatus::Ok || applied.recaptured->collectFirst) {
          report();
          return;
        }
        transferId = applied.recaptured->transferId;
        // The recapture may hold work the sheet never showed: a document
        // created or edited here while it was open, or a base another
        // synchronization moved. That goes back to the person first.
        applied.unreviewed = unreviewedOperations(approved, applied.recaptured->operations);
        applied.unreviewedFiles = unreviewedFileOperations(approvedFiles, applied.recaptured->fileOperations);
        if (!applied.unreviewed.empty() || !applied.unreviewedFiles.empty()) {
          report();
          return;
        }
        sendWork = !applied.recaptured->operations.empty() || !applied.recaptured->fileOperations.empty() ||
                   !review.confirmedDeletes().empty();
      }
    }
    if (sendWork) {
      std::vector<KeepLocalDecision> keep = review.keepLocalDecisions();
      const std::vector<DeleteConfirmation> deletes = review.confirmedDeletes();
      const std::vector<TransferMissingFile> missing = review.confirmedMissingFiles();
      SendRun run = client.runSend(transferId, keep, deletes, missing);
      if (run.status == TransferStatus::Ok && !run.committed) {
        // Documents kept local are refused once: their base is older than
        // the cloud revision the person saw.
        const std::vector<KeepLocalDecision> answered = review.answeredRefusals(run.failures);
        if (!answered.empty() && answered.size() == run.failures.size()) {
          keep.insert(keep.end(), answered.begin(), answered.end());
          run = client.runSend(transferId, keep, deletes, missing);
        }
      }
      applied.send = std::move(run);
    }
    report();
  });
}

void TransferController::finishApply(quint64 sequence, const Applied& applied) {
  if (sequence != sequence_) {
    return;
  }
  if (applied.receive) {
    const ReceiveRun& run = *applied.receive;
    if (run.status != TransferStatus::Ok) {
      stage_ = Stage::Reviewing;
      message_ = failure(run.status, run.reason);
      emit stateChanged();
      return;
    }
    if (run.outcome == "waiting_for_review" && run.reviewProvided && !run.setId.empty()) {
      // A document changed here after the review, or the set expired and
      // its replacement shows other revisions. The same receive goes on
      // with the set the router named and its staged files, once the
      // person checks the sheet again (review F50).
      setId_ = run.setId;
      review_ = TransferReview(sendCapture_, ReceiveCapture{TransferStatus::Ok, {}, run.setId, run.documents});
      stage_ = Stage::Reviewing;
      message_ = tr("Something changed while this sheet was open. Check the choices again.");
      emit rowsChanged();
      emit stateChanged();
      return;
    }
    if (run.outcome != "finished") {
      // The revision set expired while the sheet was open.
      endSend(transferId_);
      transferId_.clear();
      review_ = {};
      emit rowsChanged();
      fail(tr("The cloud project changed while this sheet was open. Synchronize again."));
      return;
    }
    received_ = true;
    receivedResult_ = {{QStringLiteral("received"), listOf(run.received)},
                       {QStringLiteral("notReceived"), listOf(run.notReceived)},
                       {QStringLiteral("changedDuringReceive"), listOf(run.changedDuringReceive)},
                       {QStringLiteral("missingFiles"), static_cast<int>(run.missingFiles)}};
  }
  if (!applied.changedAgain.empty()) {
    // Ask again, naming the cloud revision as it is now.
    review_.addRefusal(applied.changedAgain);
    stage_ = Stage::Reviewing;
    message_ = tr("%n document(s) changed here or in the cloud since you chose. Choose again.", nullptr,
                  static_cast<int>(applied.changedAgain.size()));
    emit rowsChanged();
    emit stateChanged();
    return;
  }
  if (applied.refusalReceive) {
    const ReceiveRun& run = *applied.refusalReceive;
    if (run.status != TransferStatus::Ok) {
      stage_ = Stage::Reviewing;
      message_ = failure(run.status, run.reason);
      emit stateChanged();
      return;
    }
    if (run.outcome == "waiting_for_review" && !run.setId.empty()) {
      // The set captured for the refused documents is not received: release
      // it, so it is not left behind (review F50).
      endReceive(run.setId);
    }
    if (run.outcome != "finished") {
      stage_ = Stage::Reviewing;
      message_ = tr("The cloud project changed again while receiving. Choose again.");
      emit stateChanged();
      return;
    }
    const auto add = [this](const QString& key, const std::vector<std::string>& names) {
      QStringList list = receivedResult_.value(key).toStringList();
      list.append(listOf(names));
      receivedResult_.insert(key, list);
    };
    add(QStringLiteral("received"), run.received);
    add(QStringLiteral("changedDuringReceive"), run.changedDuringReceive);
  }
  if (applied.endedSend && applied.endedSend->status != TransferStatus::Ok) {
    // The receive finished, but the send it made stale could not be ended.
    // transferId_ still names it, so cancel() can end it later.
    fail(tr("Received. The changes here could not be prepared again: %1 Synchronize again to send them.")
             .arg(failure(applied.endedSend->status, applied.endedSend->reason)));
    return;
  }
  if (applied.recaptured) {
    const SendCapture& again = *applied.recaptured;
    if (again.status != TransferStatus::Ok || again.collectFirst) {
      // The receive finished. What is left to send goes at the next
      // Synchronize.
      transferId_.clear();
      fail(again.collectFirst ? QString::fromStdString(again.message) : failure(again.status, again.reason));
      return;
    }
    transferId_ = again.transferId;
    sendWork_ = !again.operations.empty() || !again.fileOperations.empty();
    if (!applied.unreviewed.empty() || !applied.unreviewedFiles.empty()) {
      // The receive is done. The send shows again with what changed here.
      review_ = TransferReview(again, ReceiveCapture{TransferStatus::Ok, {}, {}, {}});
      approved_ = again.operations;
      approvedFiles_ = again.fileOperations;
      result_ = receivedResult_;
      stage_ = Stage::Reviewing;
      message_ = tr("This project changed while the sheet was open. Check what will be sent.");
      emit rowsChanged();
      emit stateChanged();
      return;
    }
  }
  bool published = false;
  if (applied.send) {
    const SendRun& run = *applied.send;
    if (run.status != TransferStatus::Ok) {
      stage_ = Stage::Reviewing;
      message_ = failure(run.status, run.reason);
      emit stateChanged();
      return;
    }
    if (run.missingUnconfirmed) {
      // The send lists other missing files than the sheet showed: show it
      // again with them.
      stage_ = Stage::Reviewing;
      message_ = tr("Files this project needs are missing. Confirm each one to send without it.");
      emit stateChanged();
      return;
    }
    if (!run.committed) {
      // Ask again for the documents the cloud changed since the sheet was
      // read. Other refusals stay as a message.
      const std::vector<KeepLocalDecision> answered = review_.answeredRefusals(run.failures);
      std::vector<TransferFailure> ask;
      QStringList others;
      for (const TransferFailure& failure : run.failures) {
        bool done = false;
        for (const KeepLocalDecision& decision : answered) {
          done = done || (decision.kind == failure.kind && decision.documentId == failure.documentId);
        }
        if (done) {
          continue;
        }
        if (failure.code == "BASE_CHANGED" && !failure.storedHash.empty()) {
          ask.push_back(failure);
        } else {
          others.append(QString::fromStdString(failure.message.empty() ? failure.code : failure.message));
        }
      }
      review_.addRefusal(ask);
      stage_ = Stage::Reviewing;
      message_ = !others.isEmpty() ? tr("The cloud refused the send: %1").arg(others.join(QStringLiteral("; ")))
                                   : tr("The cloud version of %n document(s) changed since this sheet was read. "
                                        "Choose again.",
                                        nullptr, static_cast<int>(ask.size()));
      emit rowsChanged();
      emit stateChanged();
      return;
    }
    published = true;
  }
  result_ = receivedResult_;
  result_.insert(QStringLiteral("published"), published && !linked_);
  result_.insert(QStringLiteral("sent"), published);
  transferId_.clear();
  stage_ = Stage::Finished;
  message_.clear();
  emit stateChanged();
  emit finished();
}

std::string TransferController::origin() const {
  return serverUrl_.adjusted(QUrl::RemovePath | QUrl::RemoveQuery | QUrl::RemoveFragment).toString().toStdString();
}

void TransferController::endSend(const std::string& transferId) {
  const std::shared_ptr<AccountSession> current = session();
  if (transferId.empty() || !current || !onBundledServer()) {
    return;
  }
  tasks_->post([state = shared_, cancel = std::shared_ptr<const RequestCancel>(cancel_), current, origin = origin(), headers = headers(), transferId] {
    LocalTransferClient(*state->transport, origin, headers, *current, cancel).cancelSend(transferId);
  });
}

void TransferController::endReceive(const std::string& setId) {
  const std::shared_ptr<AccountSession> current = session();
  if (setId.empty() || !current || !onBundledServer()) {
    return;
  }
  tasks_->post([state = shared_, cancel = std::shared_ptr<const RequestCancel>(cancel_), current, origin = origin(),
                headers = headers(), setId] {
    LocalTransferClient(*state->transport, origin, headers, *current, cancel).cancelReceive(setId);
  });
}

void TransferController::cancel() {
  if (stage_ == Stage::Running) {
    return;
  }
  ++sequence_;
  endSend(transferId_);
  if (!received_) {
    endReceive(setId_);
  }
  transferId_.clear();
  setId_.clear();
  review_ = {};
  stage_ = Stage::Idle;
  message_.clear();
  external_.clear();
  emit rowsChanged();
  emit stateChanged();
}

} // namespace nodetool::account::qt
