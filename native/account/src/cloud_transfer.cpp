#include "nodetool/account/cloud_transfer.h"

#include <nlohmann/json.hpp>

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
                                         AccountSession& session)
    : transport_(transport), origin_(std::move(localOrigin)), headers_(std::move(headers)), session_(session) {}

LocalTransferClient::Answer LocalTransferClient::post(const std::string& procedure, const std::string& body) {
  HttpRequest request;
  request.method = "POST";
  request.url = origin_ + "/trpc/" + procedure;
  request.headers = headers_;
  request.headers.emplace_back("Content-Type", "application/json");
  request.body = body;
  const bool run = procedure.ends_with(".run") || procedure.ends_with("resume");
  request.timeout = run ? std::chrono::milliseconds(kRunTimeout) : std::chrono::milliseconds(kCaptureTimeout);
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
    out.operations.push_back({str(op, "op"), str(op, "kind"), str(op, "document_id"), str(op, "name")});
  }
  for (const json& file : data.value("missing_files", json::array())) {
    TransferMissingFile missing{str(file, "asset_id"), str(file, "reason"), {}};
    for (const json& ref : file.value("documents", json::array())) {
      missing.documents.emplace_back(str(ref, "kind"), str(ref, "document_id"));
    }
    out.missingFiles.push_back(std::move(missing));
  }
  for (const json& item : data.value("skipped", json::array())) {
    out.skipped.push_back({str(item, "kind"), str(item, "id"), str(item, "name"), str(item, "detail")});
  }
  for (const json& item : data.value("deleted_locally", json::array())) {
    out.deletedLocally.push_back({str(item, "kind"), str(item, "local_id"), str(item, "cloud_id")});
  }
  return out;
}

SendRun LocalTransferClient::runSend(const std::string& transferId, const std::vector<KeepLocalDecision>& decisions,
                                     const std::vector<std::string>& confirmDeletes) {
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
    input["confirm_deletes"] = confirmDeletes;
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
      row.name = document.name;
      row.receiveListed = true;
      continue;
    }
    ReviewRow row;
    row.kind = document.kind;
    row.documentId = id;
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
    row.name = op.name;
    row.detail = op.op;
    rows_.push_back(std::move(row));
  }
  for (const TransferDeleted& deleted : send.deletedLocally) {
    deletionRow(deleted.kind, deleted.localId).sendListed = true;
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
  for (const TransferMissingFile& missing : send.missingFiles) {
    for (const auto& [kind, id] : missing.documents) {
      ReviewRow row;
      row.section = ReviewSection::Problem;
      row.kind = kind;
      row.documentId = id;
      row.detail = "file " + missing.assetId + ": " + missing.reason;
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
    for (ReviewRow& row : rows_) {
      if (row.kind == failure.kind && row.documentId == failure.documentId &&
          (row.section == ReviewSection::Send || row.section == ReviewSection::Choice)) {
        row.section = ReviewSection::Choice;
        row.detail = "both_changed";
        row.cloudHash = failure.storedHash;
        row.choice.reset();
        found = true;
      }
    }
    if (!found) {
      ReviewRow row;
      row.section = ReviewSection::Choice;
      row.kind = failure.kind;
      row.documentId = failure.documentId;
      row.detail = "both_changed";
      row.cloudHash = failure.storedHash;
      rows_.push_back(std::move(row));
    }
  }
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

bool TransferReview::ready() const {
  for (const ReviewRow& row : rows_) {
    if (row.section == ReviewSection::Choice && !row.choice) {
      return false;
    }
  }
  return true;
}

std::vector<ReceiveDecision> TransferReview::receiveDecisions() const {
  std::vector<ReceiveDecision> out;
  for (const ReviewRow& row : rows_) {
    if (row.section == ReviewSection::Choice && row.cloudHash.empty() && row.choice) {
      out.push_back({row.kind, row.documentId, *row.choice});
    } else if (row.section == ReviewSection::Deletion && row.receiveListed) {
      // Restore from cloud unless the person kept the deletion.
      out.push_back({row.kind, row.documentId, row.confirmed ? ReceiveChoice::KeepLocal : ReceiveChoice::Receive});
    }
  }
  return out;
}

std::vector<KeepLocalDecision> TransferReview::keepLocalDecisions() const {
  std::vector<KeepLocalDecision> out;
  for (const ReviewRow& row : rows_) {
    if (row.section == ReviewSection::Choice && !row.cloudHash.empty() && row.choice == ReceiveChoice::KeepLocal) {
      out.push_back({row.kind, row.documentId, row.cloudHash});
    }
  }
  return out;
}

std::vector<std::string> TransferReview::confirmedDeletes() const {
  std::vector<std::string> out;
  for (const ReviewRow& row : rows_) {
    if (row.section == ReviewSection::Deletion && row.sendListed && row.confirmed) {
      out.push_back(row.documentId);
    }
  }
  return out;
}

} // namespace nodetool::account
