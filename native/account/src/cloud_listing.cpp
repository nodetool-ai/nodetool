#include "nodetool/account/cloud_listing.h"
#include "nodetool/account/sign_in.h"

#include <nlohmann/json.hpp>

#include <algorithm>
#include <optional>
#include <utility>

namespace nodetool::account {
namespace {

// tRPC answers `{"result": {"data": …}}`; a server with a transformer
// wraps the payload in `{"json": …}`.
nlohmann::json unwrap(const nlohmann::json& value) {
  if (value.is_object() && value.contains("json")) {
    return value["json"];
  }
  return value;
}

std::string apiCode(const HttpResponse& response) {
  const nlohmann::json body = nlohmann::json::parse(response.body, nullptr, false);
  if (body.is_object() && body.contains("error")) {
    const nlohmann::json error = unwrap(body["error"]);
    if (error.is_object() && error.contains("data") && error["data"].is_object() &&
        error["data"].contains("apiCode") && error["data"]["apiCode"].is_string()) {
      return error["data"]["apiCode"].get<std::string>();
    }
  }
  return "HTTP_" + std::to_string(response.status);
}

struct Query {
  CloudListStatus status = CloudListStatus::Offline;
  nlohmann::json data;
  std::string reason;
};

// Sends a tRPC query and sorts the answer the way the savers sort a save.
Query query(CloudClient& client, const std::string& procedure, const nlohmann::json& input) {
  HttpRequest request;
  request.url = client.serverOrigin() + "/trpc/" + procedure;
  if (!input.is_null()) {
    request.url += "?input=" + urlEncode(input.dump());
  }
  Query out;
  const CloudSendResult sent = client.send(std::move(request));
  switch (sent.status) {
  case CloudSendStatus::SignedOut:
  case CloudSendStatus::Cancelled:
    out.status = CloudListStatus::SignedOut;
    return out;
  case CloudSendStatus::Offline:
    return out;
  case CloudSendStatus::WrongServer:
    out.status = CloudListStatus::Refused;
    out.reason = "WRONG_SERVER";
    return out;
  case CloudSendStatus::Sent:
    break;
  }
  const HttpResponse& response = sent.response;
  if (response.status == 401) {
    out.status = CloudListStatus::SignedOut;
    return out;
  }
  if (response.status == 0 || response.status == 408 || response.status == 425 || response.status == 429 ||
      response.status >= 500) {
    return out;
  }
  if (response.status != 200) {
    out.status = CloudListStatus::Refused;
    out.reason = apiCode(response);
    return out;
  }
  const nlohmann::json body = nlohmann::json::parse(response.body, nullptr, false);
  if (!body.is_object() || !body.contains("result") || !body["result"].is_object()) {
    out.status = CloudListStatus::Refused;
    out.reason = "INVALID_RESPONSE";
    return out;
  }
  out.status = CloudListStatus::Ok;
  out.data = unwrap(body["result"].value("data", nlohmann::json()));
  return out;
}

std::string text(const nlohmann::json& object, const char* name) {
  if (object.contains(name) && object[name].is_string()) {
    return object[name].get<std::string>();
  }
  return {};
}

// An item from one entry of an answer, or nullopt when the entry has no id.
std::optional<CloudListItem> item(const nlohmann::json& entry, const std::string& kind, const char* updatedField,
                                  std::string role, const char* ownerField) {
  if (!entry.is_object() || text(entry, "id").empty()) {
    return std::nullopt;
  }
  CloudListItem out;
  out.kind = kind;
  out.id = text(entry, "id");
  out.name = text(entry, "name");
  out.updatedAt = text(entry, updatedField);
  out.role = std::move(role);
  if (ownerField != nullptr) {
    out.ownerId = text(entry, ownerField);
  }
  return out;
}

CloudListing failed(const Query& q) {
  CloudListing out;
  out.status = q.status;
  out.reason = q.reason;
  return out;
}

CloudListing invalid() {
  CloudListing out;
  out.status = CloudListStatus::Refused;
  out.reason = "INVALID_RESPONSE";
  return out;
}

CloudListing refusedKind() {
  CloudListing out;
  out.status = CloudListStatus::Refused;
  out.reason = "UNKNOWN_KIND";
  return out;
}

void newestFirst(CloudListing& listing) {
  // The server's timestamps are ISO 8601 in one zone, so text order is time
  // order. A document without one sorts last.
  std::stable_sort(listing.items.begin(), listing.items.end(),
                   [](const CloudListItem& a, const CloudListItem& b) { return a.updatedAt > b.updatedAt; });
}

CloudListing ownWorkflows(CloudClient& client) {
  CloudListing out;
  out.status = CloudListStatus::Ok;
  std::string cursor;
  for (int page = 0; page < kMaxListPages; ++page) {
    nlohmann::json input{{"limit", kListPageSize}};
    if (!cursor.empty()) {
      input["cursor"] = cursor;
    }
    const Query q = query(client, "workflows.list", input);
    if (q.status != CloudListStatus::Ok) {
      return failed(q);
    }
    if (!q.data.is_object() || !q.data.contains("workflows") || !q.data["workflows"].is_array()) {
      return invalid();
    }
    for (const auto& entry : q.data["workflows"]) {
      if (auto listed = item(entry, "workflow", "updated_at", "owner", nullptr)) {
        out.items.push_back(std::move(*listed));
      }
    }
    cursor = text(q.data, "next");
    if (cursor.empty()) {
      break;
    }
  }
  return out;
}

CloudListing ownTimelines(CloudClient& client) {
  const Query q = query(client, "timeline.list", nlohmann::json::object());
  if (q.status != CloudListStatus::Ok) {
    return failed(q);
  }
  if (!q.data.is_array()) {
    return invalid();
  }
  CloudListing out;
  out.status = CloudListStatus::Ok;
  for (const auto& entry : q.data) {
    if (auto listed = item(entry, "timeline", "updatedAt", "owner", nullptr)) {
      out.items.push_back(std::move(*listed));
    }
  }
  return out;
}

CloudListing sharedWorkflows(CloudClient& client) {
  const Query q = query(client, "workflows.sharing.sharedWithMe", {{"limit", kListPageSize}});
  if (q.status != CloudListStatus::Ok) {
    return failed(q);
  }
  if (!q.data.is_object() || !q.data.contains("workflows") || !q.data["workflows"].is_array()) {
    return invalid();
  }
  CloudListing out;
  out.status = CloudListStatus::Ok;
  for (const auto& entry : q.data["workflows"]) {
    if (auto listed = item(entry, "workflow", "updated_at", text(entry, "shared_role"), nullptr)) {
      out.items.push_back(std::move(*listed));
    }
  }
  return out;
}

CloudListing sharedTimelines(CloudClient& client) {
  const Query q = query(client, "documentSharing.sharedWithMe", nullptr);
  if (q.status != CloudListStatus::Ok) {
    return failed(q);
  }
  if (!q.data.is_object() || !q.data.contains("documents") || !q.data["documents"].is_array()) {
    return invalid();
  }
  CloudListing out;
  out.status = CloudListStatus::Ok;
  for (const auto& entry : q.data["documents"]) {
    // The list holds every shared kind. Only timelines open in this app.
    if (!entry.is_object() || text(entry, "type") != "timeline") {
      continue;
    }
    if (auto listed = item(entry, "timeline", "updated_at", text(entry, "role"), "owner_id")) {
      out.items.push_back(std::move(*listed));
    }
  }
  return out;
}

} // namespace

CloudListing listOwnDocuments(CloudClient& client, const std::string& kind) {
  CloudListing out;
  if (kind == "workflow") {
    out = ownWorkflows(client);
  } else if (kind == "timeline") {
    out = ownTimelines(client);
  } else {
    return refusedKind();
  }
  newestFirst(out);
  return out;
}

CloudListing listSharedDocuments(CloudClient& client, const std::string& kind) {
  CloudListing out;
  if (kind == "workflow") {
    out = sharedWorkflows(client);
  } else if (kind == "timeline") {
    out = sharedTimelines(client);
  } else {
    return refusedKind();
  }
  newestFirst(out);
  return out;
}

} // namespace nodetool::account
