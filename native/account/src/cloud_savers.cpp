#include "nodetool/account/cloud_savers.h"
#include "nodetool/account/crypto.h"

#include <nlohmann/json.hpp>

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

SaveResult TrpcCloudSaver::save(const CloudDocumentKey& key, const std::string& editingInstance,
                                const CloudBase& base, const std::string& draft) {
  SaveResult result;
  const std::optional<std::string> body = input(key, editingInstance, base, draft);
  if (!body) {
    // A draft the kind cannot read would be refused by the server too. Keep
    // it as unsent instead of sending it.
    result.status = SaveStatus::Refused;
    result.reason = "INVALID_DRAFT";
    return result;
  }
  HttpRequest request;
  request.method = "POST";
  request.url = client_.serverOrigin() + "/trpc/" + procedure();
  request.headers.emplace_back("Content-Type", "application/json");
  request.body = *body;
  const CloudSendResult sent = client_.send(std::move(request));
  switch (sent.status) {
  case CloudSendStatus::SignedOut:
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
  if (response.status >= 500) {
    // The server failed, and the same save may succeed later.
    result.status = SaveStatus::Offline;
    return result;
  }
  if (response.status != 200) {
    result.status = SaveStatus::Refused;
    result.reason = refusalCode(response);
    return result;
  }
  const std::optional<nlohmann::json> data = resultData(response.body);
  const std::optional<std::string> revision = data ? updatedAt(data->dump()) : std::nullopt;
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
  if (!base.updatedAt.empty()) {
    input["expected_updated_at"] = base.updatedAt;
  }
  return input.dump();
}

std::optional<std::string> WorkflowCloudSaver::updatedAt(const std::string& data) const {
  return stringField(data, "updated_at");
}

std::optional<std::string> TimelineCloudSaver::input(const CloudDocumentKey& key, const std::string& editingInstance,
                                                     const CloudBase& base, const std::string& draft) const {
  const nlohmann::json document = nlohmann::json::parse(draft, nullptr, false);
  if (!document.is_object()) {
    return std::nullopt;
  }
  nlohmann::json input = {{"id", key.documentId},
                          {"document", document},
                          {"editingInstance", editingInstance},
                          {"schemaVersion", kTimelineSchemaVersion}};
  if (!base.updatedAt.empty()) {
    input["baseUpdatedAt"] = base.updatedAt;
  }
  return input.dump();
}

std::optional<std::string> TimelineCloudSaver::updatedAt(const std::string& data) const {
  return stringField(data, "updatedAt");
}

} // namespace nodetool::account
