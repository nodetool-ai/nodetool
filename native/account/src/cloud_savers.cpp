#include "nodetool/account/cloud_savers.h"
#include "nodetool/account/crypto.h"
#include "nodetool/account/sign_in.h"

#include <nlohmann/json.hpp>

#include <algorithm>
#include <utility>

namespace nodetool::account {
namespace {

// tRPC answers `{"result": {"data": …}}`, or `{"error": …}`; a server with
// a transformer wraps either payload in `{"json": …}`.
nlohmann::json unwrap(const nlohmann::json& value) {
  if (value.is_object() && value.contains("json")) {
    return value["json"];
  }
  return value;
}

// The API code of a refused call, such as ALREADY_EXISTS or
// SCHEMA_DOWNGRADE, or `HTTP_<status>` when the body names none.
std::string refusalCode(const HttpResponse& response) {
  const nlohmann::json body = nlohmann::json::parse(response.body, nullptr, false);
  if (body.is_object() && body.contains("error")) {
    const nlohmann::json error = unwrap(body["error"]);
    if (error.is_object() && error.contains("data") && error["data"].is_object()) {
      const nlohmann::json& data = error["data"];
      if (data.contains("apiCode") && data["apiCode"].is_string()) {
        return data["apiCode"].get<std::string>();
      }
    }
  }
  return "HTTP_" + std::to_string(response.status);
}

std::optional<nlohmann::json> resultData(const std::string& responseBody) {
  const nlohmann::json body = nlohmann::json::parse(responseBody, nullptr, false);
  if (!body.is_object() || !body.contains("result") || !body["result"].is_object()) {
    return std::nullopt;
  }
  const nlohmann::json data = unwrap(body["result"].value("data", nlohmann::json()));
  if (!data.is_object()) {
    return std::nullopt;
  }
  return data;
}

std::optional<std::string> stringField(const std::string& data, const char* name) {
  const nlohmann::json parsed = nlohmann::json::parse(data, nullptr, false);
  if (!parsed.is_object() || !parsed.contains(name) || !parsed[name].is_string()) {
    return std::nullopt;
  }
  return parsed[name].get<std::string>();
}

std::string contentHash(const std::string& draft) {
  const Sha256Digest digest = sha256(draft);
  return hexEncode(digest.data(), digest.size());
}

} // namespace

TrpcCloudSaver::TrpcCloudSaver(CloudClient& client) : client_(client) {}

void TrpcCloudSaver::setAccess(const std::string& documentId, DocumentAccess access) {
  const std::lock_guard lock(mutex_);
  access_[documentId] = std::move(access);
}

DocumentAccess TrpcCloudSaver::accessOf(const std::string& documentId) const {
  const std::lock_guard lock(mutex_);
  const auto found = access_.find(documentId);
  return found == access_.end() ? DocumentAccess{} : found->second;
}

TrpcCloudSaver::Outcome TrpcCloudSaver::call(HttpRequest request) {
  Outcome out;
  const CloudSendResult sent = client_.send(std::move(request));
  switch (sent.status) {
  case CloudSendStatus::SignedOut:
  case CloudSendStatus::Cancelled:
    out.result.status = SaveStatus::SignedOut;
    return out;
  case CloudSendStatus::Offline:
    out.result.status = SaveStatus::Offline;
    return out;
  case CloudSendStatus::WrongServer:
    out.result.status = SaveStatus::Refused;
    out.result.reason = "WRONG_SERVER";
    return out;
  case CloudSendStatus::Sent:
    break;
  }
  const HttpResponse& response = sent.response;
  if (response.status == 401) {
    // The renewed token was refused too. The draft waits for a sign-in.
    out.result.status = SaveStatus::SignedOut;
    return out;
  }
  if (response.status == 408 || response.status == 425 || response.status == 429 || response.status >= 500) {
    // The same request may pass later.
    out.result.status = SaveStatus::Offline;
    return out;
  }
  if (response.status != 200) {
    out.result.status = SaveStatus::Refused;
    out.result.reason = refusalCode(response);
    return out;
  }
  const std::optional<nlohmann::json> data = resultData(response.body);
  if (!data) {
    out.result.status = SaveStatus::Refused;
    out.result.reason = "INVALID_RESPONSE";
    return out;
  }
  out.result.status = SaveStatus::Ok;
  out.data = data->dump();
  return out;
}

SaveResult TrpcCloudSaver::checkWritable() {
  SaveResult result;
  {
    const std::lock_guard lock(mutex_);
    if (writable_) {
      result.status = SaveStatus::Ok;
      return result;
    }
  }
  HttpRequest request;
  request.url = client_.serverOrigin() + "/api/sync/capabilities";
  const CloudSendResult sent = client_.send(std::move(request));
  switch (sent.status) {
  case CloudSendStatus::SignedOut:
  case CloudSendStatus::Cancelled:
    result.status = SaveStatus::SignedOut;
    return result;
  case CloudSendStatus::Offline:
    result.status = SaveStatus::Offline;
    return result;
  case CloudSendStatus::WrongServer:
    result.status = SaveStatus::Refused;
    result.reason = "WRONG_SERVER";
    return result;
  case CloudSendStatus::Sent:
    break;
  }
  const HttpResponse& response = sent.response;
  if (response.status == 401) {
    result.status = SaveStatus::SignedOut;
    return result;
  }
  if (response.status == 408 || response.status == 429 || response.status >= 500) {
    result.status = SaveStatus::Offline;
    return result;
  }
  result.status = SaveStatus::Refused;
  const nlohmann::json caps =
      response.status == 200 ? nlohmann::json::parse(response.body, nullptr, false) : nlohmann::json();
  if (!caps.is_object() || !caps.contains("min_client_protocol_version") ||
      !caps["min_client_protocol_version"].is_number_integer() || !caps.contains("kinds") ||
      !caps["kinds"].is_object()) {
    // A server from before capability negotiation lacks the save
    // guarantees the cloud documents rely on.
    result.reason = "SERVER_UNSUPPORTED";
    return result;
  }
  if (caps["min_client_protocol_version"].get<int>() > kClientProtocolVersion) {
    result.reason = "CLIENT_TOO_OLD";
    return result;
  }
  const nlohmann::json kindCaps = caps["kinds"].value(kind(), nlohmann::json());
  const auto lists = [&](const char* field, const nlohmann::json& wanted) {
    if (!kindCaps.is_object() || !kindCaps.contains(field) || !kindCaps[field].is_array()) {
      return false;
    }
    const nlohmann::json& values = kindCaps[field];
    return std::find(values.begin(), values.end(), wanted) != values.end();
  };
  if (!lists("write", schemaVersion()) || !lists("modes", "whole")) {
    result.reason = "SERVER_UNSUPPORTED";
    return result;
  }
  const std::lock_guard lock(mutex_);
  writable_ = true;
  result.status = SaveStatus::Ok;
  result.reason.clear();
  return result;
}

OpenedDocument TrpcCloudSaver::read(const CloudDocumentKey& key) {
  OpenedDocument opened;
  HttpRequest request;
  request.url = client_.serverOrigin() + "/trpc/" + readProcedure() + "?input=" +
                urlEncode(nlohmann::json{{"id", key.documentId}}.dump());
  Outcome outcome = call(std::move(request));
  opened.status = outcome.result.status;
  opened.reason = outcome.result.reason;
  if (opened.status != SaveStatus::Ok) {
    return opened;
  }
  const std::optional<std::string> revision = updatedAt(outcome.data);
  if (!revision) {
    opened.status = SaveStatus::Refused;
    opened.reason = "INVALID_RESPONSE";
    return opened;
  }
  opened.base = {*revision, contentHash(outcome.data)};
  opened.schemaVersion = schemaVersionOf(outcome.data);
  opened.data = std::move(outcome.data);
  return opened;
}

bool TrpcCloudSaver::boundTo(const CloudDocumentKey& key) const {
  const std::string& origin = client_.serverOrigin();
  return !origin.empty() && key.serverKey == serverKey(origin) && key.accountId == client_.accountId();
}

OpenedDocument TrpcCloudSaver::open(const CloudDocumentKey& key) {
  OpenedDocument opened;
  if (!boundTo(key)) {
    opened.status = SaveStatus::SignedOut;
    opened.reason = "OTHER_ACCOUNT";
    return opened;
  }
  opened = read(key);
  if (opened.status != SaveStatus::Ok) {
    return opened;
  }
  std::string readOnly;
  if (opened.schemaVersion > schemaVersion()) {
    readOnly = "SCHEMA_DOWNGRADE";
  } else {
    const SaveResult writable = checkWritable();
    if (writable.status == SaveStatus::Refused) {
      readOnly = writable.reason;
    }
    // Offline or signed out: the capabilities are read again at the save.
  }
  opened.writable = readOnly.empty();
  opened.reason = readOnly;
  const std::lock_guard lock(mutex_);
  if (readOnly.empty()) {
    readOnly_.erase(key.documentId);
  } else {
    readOnly_[key.documentId] = readOnly;
  }
  return opened;
}

SaveResult TrpcCloudSaver::save(const CloudDocumentKey& key, const std::string& editingInstance,
                                const CloudBase& base, const std::string& draft) {
  SaveResult result;
  if (!boundTo(key)) {
    // The draft belongs to another account or server. It waits, under its
    // own account, until that account is signed in here again.
    result.status = SaveStatus::SignedOut;
    result.reason = "OTHER_ACCOUNT";
    return result;
  }
  if (base.updatedAt.empty()) {
    // Without the revision it edits, the server would apply the save to
    // whatever it holds now.
    result.status = SaveStatus::Refused;
    result.reason = "NO_BASE";
    return result;
  }
  if (!input(key, editingInstance, base, draft)) {
    // A draft the kind cannot read would be refused by the server too. Keep
    // it as unsent instead of sending it.
    result.status = SaveStatus::Refused;
    result.reason = "INVALID_DRAFT";
    return result;
  }
  {
    const std::lock_guard lock(mutex_);
    const auto found = readOnly_.find(key.documentId);
    if (found != readOnly_.end()) {
      result.status = SaveStatus::Refused;
      result.reason = found->second;
      return result;
    }
  }
  if (SaveResult writable = checkWritable(); writable.status != SaveStatus::Ok) {
    return writable;
  }

  CloudBase sendBase = base;
  for (int attempt = 0; attempt <= kConflictRetries; ++attempt) {
    HttpRequest request;
    request.method = "POST";
    request.url = client_.serverOrigin() + "/trpc/" + procedure();
    request.headers.emplace_back("Content-Type", "application/json");
    request.body = *input(key, editingInstance, sendBase, draft);
    const Outcome outcome = call(std::move(request));
    if (outcome.result.status == SaveStatus::Ok) {
      const std::optional<std::string> revision = updatedAt(outcome.data);
      if (!revision) {
        result.status = SaveStatus::Refused;
        result.reason = "INVALID_RESPONSE";
        return result;
      }
      const DocumentAccess access = accessOf(key.documentId);
      result.status = SaveStatus::Ok;
      result.base = {*revision, contentHash(draft)};
      result.role = access.role;
      result.options = access.options;
      return result;
    }
    if (outcome.result.status != SaveStatus::Refused || outcome.result.reason != "ALREADY_EXISTS") {
      return outcome.result;
    }
    // Another save got there first. Send the draft again on the latest
    // revision: the draft wins, and the server keeps the revision it
    // replaces as a version, because this save names another instance.
    const OpenedDocument latest = read(key);
    if (latest.status != SaveStatus::Ok) {
      result.status = latest.status;
      result.reason = latest.reason;
      return result;
    }
    if (latest.schemaVersion > schemaVersion()) {
      result.status = SaveStatus::Refused;
      result.reason = "SCHEMA_DOWNGRADE";
      return result;
    }
    sendBase = latest.base;
  }
  // The document keeps changing under this save. It is tried again later.
  result.status = SaveStatus::Offline;
  return result;
}

std::optional<std::string> WorkflowCloudSaver::input(const CloudDocumentKey& key, const std::string& editingInstance,
                                                     const CloudBase& base, const std::string& draft) const {
  const nlohmann::json graph = nlohmann::json::parse(draft, nullptr, false);
  if (!graph.is_object() || !graph.contains("nodes") || !graph["nodes"].is_array() || !graph.contains("edges") ||
      !graph["edges"].is_array()) {
    return std::nullopt;
  }
  nlohmann::json input = {{"id", key.documentId},
                          {"graph", graph},
                          // A cloud save is never rate limited away: the saved
                          // state reads Saved to cloud only after it.
                          {"force", true},
                          {"client_id", "native"},
                          {"editing_instance", editingInstance},
                          {"schema_version", kWorkflowSchemaVersion}};
  input["expected_updated_at"] = base.updatedAt;
  return input.dump();
}

std::optional<std::string> WorkflowCloudSaver::updatedAt(const std::string& data) const {
  return stringField(data, "updated_at");
}

std::optional<std::string> TimelineCloudSaver::input(const CloudDocumentKey& key, const std::string& editingInstance,
                                                     const CloudBase& base, const std::string& draft) const {
  nlohmann::json document = nlohmann::json::parse(draft, nullptr, false);
  if (!document.is_object()) {
    return std::nullopt;
  }
  nlohmann::json input = {{"id", key.documentId},
                          {"editingInstance", editingInstance},
                          {"schemaVersion", kTimelineSchemaVersion}};
  for (const char* column : {"fps", "width", "height"}) {
    const auto found = document.find(column);
    if (found == document.end()) {
      continue;
    }
    if (found->is_number()) {
      input[column] = *found;
    }
    document.erase(found);
  }
  input["document"] = std::move(document);
  input["baseUpdatedAt"] = base.updatedAt;
  return input.dump();
}

std::optional<std::string> TimelineCloudSaver::updatedAt(const std::string& data) const {
  return stringField(data, "updatedAt");
}

} // namespace nodetool::account

namespace nodetool::account {
namespace {

int schemaField(const std::string& data, const char* name) {
  const nlohmann::json parsed = nlohmann::json::parse(data, nullptr, false);
  if (!parsed.is_object() || !parsed.contains(name) || !parsed[name].is_number_integer()) {
    // A server that records no version stores every document in version 1.
    return 1;
  }
  return parsed[name].get<int>();
}

} // namespace

int WorkflowCloudSaver::schemaVersionOf(const std::string& data) const {
  return schemaField(data, "schema_version");
}

int TimelineCloudSaver::schemaVersionOf(const std::string& data) const {
  return schemaField(data, "schemaVersion");
}

} // namespace nodetool::account
