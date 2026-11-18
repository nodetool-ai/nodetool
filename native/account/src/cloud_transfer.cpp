#include "nodetool/account/cloud_transfer.h"
#include "nodetool/account/origin.h"

#include <nlohmann/json.hpp>

#include <algorithm>

#include <chrono>
#include <utility>

namespace nodetool::account {
namespace {

using nlohmann::json;

// A send or receive uploads or downloads every file it carries in one call.
constexpr std::chrono::minutes kRunTimeout{30};
constexpr std::chrono::seconds kCaptureTimeout{120};

json unwrap(const json& value) {
  if (value.is_object() && value.contains("json")) {
    return value["json"];
  }
  return value;
}

std::string str(const json& object, const char* key) {
  if (object.is_object() && object.contains(key) && object[key].is_string()) {
    return object[key].get<std::string>();
  }
  return {};
}

std::string apiCodeOf(const std::string& body, int status) {
  const json parsed = json::parse(body, nullptr, false);
  if (parsed.is_object() && parsed.contains("error")) {
    const json error = unwrap(parsed["error"]);
    if (error.is_object() && error.contains("data") && error["data"].is_object()) {
      const std::string code = str(error["data"], "apiCode");
      if (!code.empty()) {
        return code;
      }
    }
  }
  return "HTTP_" + std::to_string(status);
}

std::optional<ReceiveState> stateFrom(const std::string& name) {
  if (name == "new") {
    return ReceiveState::New;
  }
  if (name == "same") {
    return ReceiveState::Same;
  }
  if (name == "cloud_changed") {
    return ReceiveState::CloudChanged;
  }
  if (name == "local_changed") {
    return ReceiveState::LocalChanged;
  }
  if (name == "both_changed") {
    return ReceiveState::BothChanged;
  }
  if (name == "local_deleted") {
    return ReceiveState::LocalDeleted;
  }
  return std::nullopt;
}

std::string choiceName(ReceiveChoice choice) {
  return choice == ReceiveChoice::Receive ? "receive" : "keep_local";
}

std::vector<std::string> namesOf(const json& list) {
  std::vector<std::string> names;
  if (!list.is_array()) {
    return names;
  }
  for (const json& item : list) {
    const std::string name = str(item, "name");
    names.push_back(name.empty() ? str(item, "id") : name);
  }
  return names;
}

} // namespace

std::vector<TransferOperation> unreviewedOperations(const std::vector<TransferOperation>& approved,
                                                    const std::vector<TransferOperation>& recaptured) {
  const auto same = [](const TransferOperation& a, const TransferOperation& b) {
    return a.op == b.op && a.kind == b.kind && a.documentId == b.documentId && a.name == b.name &&
           a.capturedHash == b.capturedHash && a.baseHash == b.baseHash;
  };
  std::vector<TransferOperation> out;
  for (const TransferOperation& op : recaptured) {
    if (std::none_of(approved.begin(), approved.end(), [&](const TransferOperation& seen) { return same(seen, op); })) {
      out.push_back(op);
    }
  }
  return out;
}

std::vector<TransferFileOperation> unreviewedFileOperations(const std::vector<TransferFileOperation>& approved,
                                                            const std::vector<TransferFileOperation>& recaptured) {
  const auto same = [](const TransferFileOperation& a, const TransferFileOperation& b) {
    return a.op == b.op && a.assetId == b.assetId && a.path == b.path && a.hash == b.hash && a.baseHash == b.baseHash;
  };
  std::vector<TransferFileOperation> out;
  for (const TransferFileOperation& op : recaptured) {
    if (std::none_of(approved.begin(), approved.end(),
                     [&](const TransferFileOperation& seen) { return same(seen, op); })) {
      out.push_back(op);
    }
  }
  return out;
}

std::string receiveStateName(ReceiveState state) {
  switch (state) {
  case ReceiveState::New:
    return "new";
  case ReceiveState::Same:
    return "same";
  case ReceiveState::CloudChanged:
    return "cloud_changed";
  case ReceiveState::LocalChanged:
    return "local_changed";
  case ReceiveState::BothChanged:
    return "both_changed";
  case ReceiveState::LocalDeleted:
    return "local_deleted";
  }
  return "same";
}

LocalTransferClient::LocalTransferClient(HttpTransport& transport, std::string localOrigin,
                                         std::vector<std::pair<std::string, std::string>> headers,
                                         AccountSession& session, std::shared_ptr<const RequestCancel> cancel)
    : transport_(transport), origin_(std::move(localOrigin)), headers_(std::move(headers)), session_(session),
      cancel_(std::move(cancel)) {}

LocalTransferClient::Answer LocalTransferClient::post(const std::string& procedure, const std::string& body) {
  HttpRequest request;
  request.method = "POST";
  request.url = origin_ + "/trpc/" + procedure;
  request.headers = headers_;
  request.headers.emplace_back("Content-Type", "application/json");
  request.body = body;
  const bool run = procedure.ends_with(".run") || procedure.ends_with("resume");
  request.timeout = run ? std::chrono::milliseconds(kRunTimeout) : std::chrono::milliseconds(kCaptureTimeout);
  request.cancel = cancel_;
  const HttpResponse response = transport_.send(request);
  Answer out;
  if (response.status == 0) {
    return out;
  }
  if (response.status != 200) {
    const std::string code = apiCodeOf(response.body, response.status);
    if (code == "CLOUD_SIGNED_OUT") {
      out.status = TransferStatus::SignedOut;
    } else if (code == "CLOUD_UNREACHABLE") {
      out.status = TransferStatus::Offline;
    } else if (response.status >= 500 && code.starts_with("HTTP_")) {
      out.status = TransferStatus::LocalUnavailable;
    } else {
      out.status = TransferStatus::Refused;
    }
    out.reason = code;
    return out;
  }
  const json parsed = json::parse(response.body, nullptr, false);
  if (!parsed.is_object() || !parsed.contains("result") || !parsed["result"].is_object()) {
    out.status = TransferStatus::Refused;
    out.reason = "INVALID_RESPONSE";
    return out;
  }
  out.status = TransferStatus::Ok;
  out.data = unwrap(parsed["result"].value("data", json())).dump();
  return out;
}

LocalTransferClient::Answer LocalTransferClient::mutate(const std::string& procedure, const std::string& inputJson,
                                                        bool withToken) {
  // The router runs on the app's bundled server. A request to any other
  // server would hand it the account's access token, so it is refused
  // before a credential is read (PRD SR3).
  if (!isLoopbackHttpOrigin(origin_)) {
    return {TransferStatus::Refused, "NOT_LOCAL_SERVER", {}};
  }
  json input = json::parse(inputJson, nullptr, false);
  input["origin"] = session_.serverOrigin();
  input["account_id"] = session_.accountId();
  if (!withToken) {
    return post(procedure, input.dump());
  }
  std::string rejected;
  for (int attempt = 0; attempt < 2; ++attempt) {
    if (attempt == 1) {
      // The cloud refused the token: renew it once, unless the record
      // already holds a newer one.
      const RefreshOutcome renewed = session_.refresh(rejected);
      if (renewed == RefreshOutcome::SignedOut) {
        return {TransferStatus::SignedOut, "CLOUD_SIGNED_OUT", {}};
      }
      if (renewed == RefreshOutcome::Offline) {
        return {TransferStatus::Offline, "CLOUD_UNREACHABLE", {}};
      }
    }
    const Credential credential = session_.credentialForRequest();
    if (credential.status == CredentialStatus::SignedOut) {
      return {TransferStatus::SignedOut, "SIGNED_OUT", {}};
    }
    if (credential.status == CredentialStatus::Offline) {
      return {TransferStatus::Offline, "CLOUD_UNREACHABLE", {}};
    }
    input["access_token"] = credential.accessToken;
    Answer answer = post(procedure, input.dump());
    if (answer.status != TransferStatus::SignedOut) {
      return answer;
    }
    rejected = credential.accessToken;
  }
  return {TransferStatus::SignedOut, "CLOUD_SIGNED_OUT", {}};
}

SendCapture LocalTransferClient::captureSend(const std::string& projectId, const std::string& projectName,
                                             const std::string& deviceName) {
  json input{{"project_id", projectId}};
  if (!projectName.empty()) {
    input["project_name"] = projectName;
  }
  if (!deviceName.empty()) {
    input["device_name"] = deviceName;
  }
  const Answer answer = mutate("cloudTransfer.send.capture", input.dump(), false);
  SendCapture out;
  out.status = answer.status;
  out.reason = answer.reason;
  if (answer.status != TransferStatus::Ok) {
    return out;
  }
  const json data = json::parse(answer.data, nullptr, false);
  if (str(data, "status") == "collect_first") {
    out.collectFirst = true;
    out.message = str(data, "message");
    for (const json& path : data.value("external", json::array())) {
      if (path.is_string()) {
        out.external.push_back(path.get<std::string>());
      }
    }
    return out;
  }
  if (str(data, "status") != "captured") {
    out.status = TransferStatus::Refused;
    out.reason = "INVALID_RESPONSE";
    return out;
  }
  out.transferId = str(data, "transfer_id");
  out.firstPublication = data.value("first_publication", false);
  for (const json& op : data.value("operations", json::array())) {
    out.operations.push_back({str(op, "op"), str(op, "kind"), str(op, "document_id"), str(op, "name"),
                              str(op, "captured_hash"), str(op, "base_hash")});
  }
  for (const json& op : data.value("file_operations", json::array())) {
    out.fileOperations.push_back(
        {str(op, "op"), str(op, "asset_id"), str(op, "path"), str(op, "hash"), str(op, "base_hash")});
  }
  for (const json& item : data.value("documents", json::array())) {
    out.documents.push_back({str(item, "kind"), str(item, "local_id"), str(item, "cloud_id"), str(item, "name")});
  }
  for (const json& file : data.value("missing_files", json::array())) {
    TransferMissingFile missing{str(file, "asset_id"), str(file, "reason"), {}, file.dump()};
    for (const json& ref : file.value("documents", json::array())) {
      missing.documents.emplace_back(str(ref, "kind"), str(ref, "document_id"));
    }
    out.missingFiles.push_back(std::move(missing));
  }
  for (const json& item : data.value("skipped", json::array())) {
    out.skipped.push_back({str(item, "kind"), str(item, "id"), str(item, "name"), str(item, "detail")});
  }
  for (const json& item : data.value("deleted_locally", json::array())) {
    out.deletedLocally.push_back(
        {str(item, "kind"), str(item, "local_id"), str(item, "cloud_id"), str(item, "base_hash")});
  }
  return out;
}

SendRun LocalTransferClient::runSend(const std::string& transferId, const std::vector<KeepLocalDecision>& decisions,
                                     const std::vector<DeleteConfirmation>& confirmDeletes,
                                     const std::vector<TransferMissingFile>& confirmMissing) {
  json input{{"transfer_id", transferId}};
  if (!decisions.empty()) {
    json list = json::array();
    for (const KeepLocalDecision& decision : decisions) {
      list.push_back({{"kind", decision.kind},
                      {"document_id", decision.documentId},
                      {"choice", "keep_local"},
                      {"cloud_hash", decision.cloudHash}});
    }
    input["decisions"] = std::move(list);
  }
  if (!confirmDeletes.empty()) {
    json list = json::array();
    for (const DeleteConfirmation& confirmation : confirmDeletes) {
      list.push_back(
          {{"kind", confirmation.kind}, {"cloud_id", confirmation.cloudId}, {"cloud_hash", confirmation.cloudHash}});
    }
    input["confirm_deletes"] = std::move(list);
  }
  if (!confirmMissing.empty()) {
    json list = json::array();
    for (const TransferMissingFile& file : confirmMissing) {
      list.push_back(json::parse(file.raw, nullptr, false));
    }
    input["confirm_missing_files"] = std::move(list);
  }
  const Answer answer = mutate("cloudTransfer.send.run", input.dump(), true);
  SendRun out;
  out.status = answer.status;
  out.reason = answer.reason;
  if (answer.status != TransferStatus::Ok) {
    return out;
  }
  const json data = json::parse(answer.data, nullptr, false);
  const std::string status = str(data, "status");
  if (status == "committed") {
    out.committed = true;
    out.cloudProjectId = str(data.value("result", json::object()), "project_id");
    return out;
  }
  if (status == "missing_files_unconfirmed") {
    out.missingUnconfirmed = true;
    return out;
  }
  if (status != "refused") {
    out.status = TransferStatus::Refused;
    out.reason = "INVALID_RESPONSE";
    return out;
  }
  for (const json& failure : data.value("failures", json::array())) {
    out.failures.push_back({str(failure, "code"), str(failure, "kind"), str(failure, "document_id"),
                            str(failure, "stored_hash"), str(failure, "message")});
  }
  return out;
}

LocalTransferClient::Cancel LocalTransferClient::cancelSend(const std::string& transferId) {
  const Answer answer = mutate("cloudTransfer.send.cancel", json{{"transfer_id", transferId}}.dump(), true);
  Cancel out;
  out.status = answer.status;
  out.reason = answer.reason;
  if (answer.status == TransferStatus::Ok) {
    out.committed = str(json::parse(answer.data, nullptr, false), "state") == "committed";
  }
  return out;
}

ReceiveCapture LocalTransferClient::captureReceive(const std::string& projectId) {
  const Answer answer = mutate("cloudTransfer.receive.capture", json{{"project_id", projectId}}.dump(), true);
  ReceiveCapture out;
  out.status = answer.status;
  out.reason = answer.reason;
  if (answer.status != TransferStatus::Ok) {
    return out;
  }
  const json data = json::parse(answer.data, nullptr, false);
  out.setId = str(data, "set_id");
  for (const json& item : data.value("documents", json::array())) {
    const auto state = stateFrom(str(item, "status"));
    if (!state) {
      // A state this client does not know is never received without review.
      out.status = TransferStatus::Refused;
      out.reason = "INVALID_RESPONSE";
      out.documents.clear();
      return out;
    }
    ReceiveDocument document;
    document.kind = str(item, "kind");
    document.cloudId = str(item, "cloud_id");
    document.localId = str(item, "local_id");
    document.name = str(item, "name");
    document.contentHash = str(item, "content_hash");
    document.state = *state;
    const std::string decision = str(item, "decision");
    if (decision == "receive") {
      document.decision = ReceiveChoice::Receive;
    } else if (decision == "keep_local") {
      document.decision = ReceiveChoice::KeepLocal;
    }
    document.missingFiles = item.value("missing_files", json::array()).size();
    out.documents.push_back(std::move(document));
  }
  return out;
}

ReceiveRun LocalTransferClient::runReceive(const std::string& setId, const std::vector<ReceiveDecision>& decisions) {
  json input{{"set_id", setId}};
  if (!decisions.empty()) {
    json list = json::array();
    for (const ReceiveDecision& decision : decisions) {
      list.push_back(
          {{"kind", decision.kind}, {"document_id", decision.documentId}, {"decision", choiceName(decision.choice)}});
    }
    input["decisions"] = std::move(list);
  }
  const Answer answer = mutate("cloudTransfer.receive.run", input.dump(), true);
  ReceiveRun out;
  out.status = answer.status;
  out.reason = answer.reason;
  if (answer.status != TransferStatus::Ok) {
    return out;
  }
  const json data = json::parse(answer.data, nullptr, false);
  out.outcome = str(data, "status");
  if (out.outcome == "finished") {
    const json result = data.value("result", json::object());
    out.received = namesOf(result.value("received", json::array()));
    out.changedDuringReceive = namesOf(result.value("changed_during_receive", json::array()));
    out.notReceived = namesOf(result.value("not_received", json::array()));
    out.missingFiles = result.value("missing_files", json::array()).size();
  } else if (out.outcome != "expired" && out.outcome != "waiting_for_review") {
    out.status = TransferStatus::Refused;
    out.reason = "INVALID_RESPONSE";
  }
  return out;
}

TransferResume LocalTransferClient::resume() {
  const Answer answer = mutate("cloudTransfer.resume", json::object().dump(), true);
  TransferResume out;
  out.status = answer.status;
  out.reason = answer.reason;
  if (answer.status == TransferStatus::Ok) {
    const json data = json::parse(answer.data, nullptr, false);
    out.sends = data.value("sends", json::array()).size();
    out.receives = data.value("receives", json::array()).size();
  }
  return out;
}

TransferReview::TransferReview(const SendCapture& send, const ReceiveCapture& receive) {
  // One Deletion row per document deleted here, whether the send half lists
  // it, the receive half does, or both.
  const auto deletionRow = [this](const std::string& kind, const std::string& localId) -> ReviewRow& {
    for (ReviewRow& row : rows_) {
      if (row.section == ReviewSection::Deletion && row.kind == kind && row.documentId == localId) {
        return row;
      }
    }
    ReviewRow row;
    row.section = ReviewSection::Deletion;
    row.kind = kind;
    row.documentId = localId;
    row.detail = "local_deleted";
    rows_.push_back(std::move(row));
    return rows_.back();
  };
  for (const ReceiveDocument& document : receive.documents) {
    if (document.state == ReceiveState::Same) {
      continue;
    }
    const std::string id = document.localId.empty() ? document.cloudId : document.localId;
    if (document.state == ReceiveState::LocalDeleted) {
      ReviewRow& row = deletionRow(document.kind, id);
      row.cloudId = document.cloudId;
      row.name = document.name;
      row.receiveListed = true;
      // The cloud revision as it is now, which a cloud edit since the last
      // exchange made newer than the base (V4).
      row.seenHash = document.contentHash;
      continue;
    }
    ReviewRow row;
    row.kind = document.kind;
    row.documentId = id;
    row.cloudId = document.cloudId;
    row.seenHash = document.contentHash;
    row.name = document.name;
    row.detail = receiveStateName(document.state);
    if (!document.decision) {
      row.section = ReviewSection::Choice;
    } else if (*document.decision == ReceiveChoice::Receive) {
      row.section = ReviewSection::Receive;
    } else {
      // Kept local without a question: the send half carries it.
      continue;
    }
    rows_.push_back(std::move(row));
  }
  for (const TransferOperation& op : send.operations) {
    ReviewRow row;
    row.section = ReviewSection::Send;
    row.kind = op.kind;
    row.documentId = op.documentId;
    // An operation names the cloud id, which is the local id until the
    // document was linked under another one.
    for (const TransferDocument& document : send.documents) {
      if (document.kind == op.kind && (document.cloudId == op.documentId || document.localId == op.documentId)) {
        row.documentId = document.localId;
        row.cloudId = document.cloudId;
        row.name = document.name;
        break;
      }
    }
    // A rename shows the new name.
    if (!op.name.empty()) {
      row.name = op.name;
    }
    row.detail = op.op;
    rows_.push_back(std::move(row));
  }
  // A file sent over its earlier version gets a row, also when no document
  // that uses it changed (review F33). A new file goes with its new document.
  for (const TransferFileOperation& op : send.fileOperations) {
    if (op.baseHash.empty()) {
      continue;
    }
    ReviewRow row;
    row.section = ReviewSection::Send;
    row.kind = "file";
    row.documentId = op.assetId;
    row.name = op.path;
    row.detail = op.op;
    rows_.push_back(std::move(row));
  }
  for (const TransferDeleted& deleted : send.deletedLocally) {
    ReviewRow& row = deletionRow(deleted.kind, deleted.localId);
    row.cloudId = deleted.cloudId;
    row.sendListed = true;
    if (row.seenHash.empty()) {
      row.seenHash = deleted.baseHash;
    }
  }
  for (const TransferSkipped& skipped : send.skipped) {
    ReviewRow row;
    row.section = ReviewSection::Problem;
    row.kind = skipped.kind;
    row.documentId = skipped.id;
    row.name = skipped.name;
    row.detail = skipped.detail;
    rows_.push_back(std::move(row));
  }
  // A missing file is sent without only once the person confirms it (X7).
  missingFiles_ = send.missingFiles;
  for (const TransferMissingFile& missing : send.missingFiles) {
    for (const auto& [kind, id] : missing.documents) {
      ReviewRow row;
      row.section = ReviewSection::Problem;
      row.kind = kind;
      row.documentId = id;
      row.detail = "file " + missing.assetId + ": " + missing.reason;
      row.assetId = missing.assetId;
      rows_.push_back(std::move(row));
    }
    if (missing.documents.empty()) {
      ReviewRow row;
      row.section = ReviewSection::Problem;
      row.detail = "file " + missing.assetId + ": " + missing.reason;
      row.assetId = missing.assetId;
      rows_.push_back(std::move(row));
    }
  }
}

void TransferReview::addRefusal(const std::vector<TransferFailure>& failures) {
  for (const TransferFailure& failure : failures) {
    if (failure.code != "BASE_CHANGED" || failure.storedHash.empty()) {
      continue;
    }
    bool found = false;
    // One row per kind and cloud id: a second row that names the refused
    // document is dropped (review F39).
    std::vector<std::size_t> duplicates;
    for (std::size_t i = 0; i < rows_.size(); ++i) {
      ReviewRow& row = rows_[i];
      // A deletion refused for a newer cloud revision asks again, for that
      // revision (V4, review F40).
      if (row.section == ReviewSection::Deletion && row.kind == failure.kind && row.cloudId == failure.documentId) {
        row.seenHash = failure.storedHash;
        row.confirmed = false;
        row.detail = "cloud_changed";
        found = true;
        continue;
      }
      // A refusal names the cloud id, as the manifest does.
      const bool same = row.cloudId.empty() ? row.documentId == failure.documentId : row.cloudId == failure.documentId;
      if (row.kind == failure.kind && same &&
          (row.section == ReviewSection::Send || row.section == ReviewSection::Choice)) {
        if (found) {
          duplicates.push_back(i);
          continue;
        }
        row.section = ReviewSection::Choice;
        row.detail = "both_changed";
        row.cloudHash = failure.storedHash;
        row.choice.reset();
        found = true;
      }
    }
    for (auto it = duplicates.rbegin(); it != duplicates.rend(); ++it) {
      rows_.erase(rows_.begin() + static_cast<std::ptrdiff_t>(*it));
    }
    if (!found) {
      ReviewRow row;
      row.section = ReviewSection::Choice;
      row.kind = failure.kind;
      row.documentId = failure.documentId;
      row.cloudId = failure.documentId;
      row.detail = "both_changed";
      row.cloudHash = failure.storedHash;
      rows_.push_back(std::move(row));
    }
  }
}

std::vector<ReceiveDecision> TransferReview::refusalsToReceive() const {
  std::vector<ReceiveDecision> out;
  for (const ReviewRow& row : rows_) {
    if (row.section == ReviewSection::Choice && !row.cloudHash.empty() && row.choice == ReceiveChoice::Receive) {
      out.push_back({row.kind, row.cloudId.empty() ? row.documentId : row.cloudId, ReceiveChoice::Receive});
    }
  }
  return out;
}

std::vector<KeepLocalDecision> TransferReview::answeredRefusals(const std::vector<TransferFailure>& failures) const {
  std::vector<KeepLocalDecision> out;
  for (const TransferFailure& failure : failures) {
    if (failure.code != "BASE_CHANGED" || failure.storedHash.empty()) {
      continue;
    }
    for (const ReviewRow& row : rows_) {
      // A refusal names the cloud id, as the manifest does.
      if (row.section == ReviewSection::Choice && row.kind == failure.kind && row.cloudId == failure.documentId &&
          row.cloudHash.empty() && row.choice == ReceiveChoice::KeepLocal && row.seenHash == failure.storedHash) {
        out.push_back({failure.kind, failure.documentId, failure.storedHash});
        break;
      }
    }
  }
  return out;
}

bool TransferReview::choose(std::size_t index, std::optional<ReceiveChoice> choice) {
  if (index >= rows_.size() || rows_[index].section != ReviewSection::Choice) {
    return false;
  }
  rows_[index].choice = choice;
  return true;
}

bool TransferReview::confirmDeletion(std::size_t index, bool confirmed) {
  if (index >= rows_.size() || rows_[index].section != ReviewSection::Deletion) {
    return false;
  }
  rows_[index].confirmed = confirmed;
  return true;
}

bool TransferReview::confirmMissingFile(std::size_t index, bool confirmed) {
  if (index >= rows_.size() || rows_[index].section != ReviewSection::Problem || rows_[index].assetId.empty()) {
    return false;
  }
  const std::string assetId = rows_[index].assetId;
  for (ReviewRow& row : rows_) {
    if (row.section == ReviewSection::Problem && row.assetId == assetId) {
      row.confirmed = confirmed;
    }
  }
  return true;
}

bool TransferReview::ready() const {
  for (const ReviewRow& row : rows_) {
    if (row.section == ReviewSection::Choice && !row.choice) {
      return false;
    }
    if (row.section == ReviewSection::Problem && !row.assetId.empty() && !row.confirmed) {
      return false;
    }
  }
  return true;
}

std::vector<TransferMissingFile> TransferReview::confirmedMissingFiles() const {
  for (const ReviewRow& row : rows_) {
    if (row.section == ReviewSection::Problem && !row.assetId.empty() && !row.confirmed) {
      return {};
    }
  }
  return missingFiles_;
}

std::vector<ReceiveDecision> TransferReview::receiveDecisions() const {
  std::vector<ReceiveDecision> out;
  for (const ReviewRow& row : rows_) {
    // The receive names each document by its cloud id.
    if (row.section == ReviewSection::Choice && row.cloudHash.empty() && row.choice) {
      out.push_back({row.kind, row.cloudId, *row.choice});
    } else if (row.section == ReviewSection::Deletion && row.receiveListed) {
      // Restore from cloud unless the person kept the deletion.
      out.push_back({row.kind, row.cloudId, row.confirmed ? ReceiveChoice::KeepLocal : ReceiveChoice::Receive});
    }
  }
  return out;
}

std::vector<KeepLocalDecision> TransferReview::keepLocalDecisions() const {
  std::vector<KeepLocalDecision> out;
  for (const ReviewRow& row : rows_) {
    if (row.section == ReviewSection::Choice && !row.cloudHash.empty() && row.choice == ReceiveChoice::KeepLocal) {
      out.push_back({row.kind, row.cloudId.empty() ? row.documentId : row.cloudId, row.cloudHash});
    }
  }
  return out;
}

std::vector<DeleteConfirmation> TransferReview::confirmedDeletes() const {
  std::vector<DeleteConfirmation> out;
  for (const ReviewRow& row : rows_) {
    if (row.section == ReviewSection::Deletion && row.sendListed && row.confirmed) {
      out.push_back({row.kind, row.cloudId, row.seenHash});
    }
  }
  return out;
}

} // namespace nodetool::account
