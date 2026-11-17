#include "nodetool/account/cloud_listing.h"
#include "trpc_call.h"

#include <nlohmann/json.hpp>

#include <algorithm>
#include <optional>
#include <utility>

namespace nodetool::account {
namespace {

using detail::Query;
using detail::query;

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
