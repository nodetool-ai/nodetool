// One tRPC call over CloudClient, sorted the way the savers sort a save.
// Internal to the account library.
#pragma once

#include "nodetool/account/cloud_client.h"
#include "nodetool/account/cloud_listing.h"
#include "nodetool/account/sign_in.h"

#include <nlohmann/json.hpp>

#include <string>
#include <utility>

namespace nodetool::account::detail {

// tRPC answers `{"result": {"data": …}}`; a server with a transformer
// wraps the payload in `{"json": …}`.
inline nlohmann::json unwrap(const nlohmann::json& value) {
  if (value.is_object() && value.contains("json")) {
    return value["json"];
  }
  return value;
}

inline std::string apiCode(const HttpResponse& response) {
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

// Sends a tRPC query (GET) or, with `mutation`, a mutation (POST with the
// input as the JSON body).
inline Query query(CloudClient& client, const std::string& procedure, const nlohmann::json& input,
                   bool mutation = false) {
  HttpRequest request;
  request.url = client.serverOrigin() + "/trpc/" + procedure;
  if (mutation) {
    request.method = "POST";
    request.headers.emplace_back("Content-Type", "application/json");
    request.body = input.is_null() ? std::string("{}") : input.dump();
  } else if (!input.is_null()) {
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

} // namespace nodetool::account::detail
