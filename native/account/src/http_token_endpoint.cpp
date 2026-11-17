#include "nodetool/account/http_token_endpoint.h"

#include "nodetool/account/origin.h"
#include "nodetool/account/sign_in.h"

#include <nlohmann/json.hpp>

#include <utility>

namespace nodetool::account {
namespace {

constexpr std::chrono::milliseconds kTokenTimeout{10000};

std::string field(const nlohmann::json& body, const char* name) {
  const auto it = body.find(name);
  if (it == body.end() || !it->is_string()) {
    return {};
  }
  return it->get<std::string>();
}

void appendParam(std::string& out, std::string_view name, std::string_view value) {
  if (!out.empty()) {
    out.push_back('&');
  }
  out.append(urlEncode(name));
  out.push_back('=');
  out.append(urlEncode(value));
}

} // namespace

TokenResult parseTokenResponse(const HttpResponse& response) {
  TokenResult result;
  // No answer, a rate limit or a server failure: the token may still be good,
  // so the caller tries again later.
  if (response.status == 0 || response.status == 429 || response.status >= 500) {
    result.status = TokenStatus::Offline;
    return result;
  }
  const nlohmann::json body = nlohmann::json::parse(response.body, nullptr, false);
  if (response.status == 200) {
    if (!body.is_object()) {
      result.status = TokenStatus::Refused;
      result.message = "The server sent a token response this app cannot read.";
      return result;
    }
    TokenSet& tokens = result.tokens;
    tokens.accessToken = field(body, "access_token");
    tokens.refreshToken = field(body, "refresh_token");
    tokens.sessionId = field(body, "session_id");
    tokens.userId = field(body, "user_id");
    tokens.displayName = field(body, "display_name");
    tokens.revocationHandle = field(body, "revocation_handle");
    const auto expires = body.find("expires_in");
    if (expires != body.end() && expires->is_number_integer()) {
      tokens.expiresInSeconds = expires->get<int64_t>();
    }
    if (tokens.accessToken.empty() || tokens.refreshToken.empty() || tokens.expiresInSeconds <= 0) {
      result.status = TokenStatus::Refused;
      result.message = "The server sent a token response without its tokens.";
      return result;
    }
    result.status = TokenStatus::Ok;
    return result;
  }
  const std::string error = body.is_object() ? field(body, "error") : std::string();
  result.message = body.is_object() ? field(body, "error_description") : std::string();
  result.status = error == "invalid_grant" ? TokenStatus::InvalidGrant : TokenStatus::Refused;
  return result;
}

HttpTokenEndpoint::HttpTokenEndpoint(HttpTransport& transport, std::string_view serverOrigin)
    : transport_(transport), origin_(canonicalHttpsOrigin(serverOrigin).value_or(std::string())) {}

TokenResult HttpTokenEndpoint::postToken(std::string body) {
  if (origin_.empty()) {
    TokenResult refused;
    refused.status = TokenStatus::Refused;
    refused.message = "The cloud server address must start with https://.";
    return refused;
  }
  HttpRequest request;
  request.requiredOrigin = origin_;
  request.method = "POST";
  request.url = origin_ + "/oauth/token";
  request.headers = {{"Content-Type", "application/x-www-form-urlencoded"}, {"Accept", "application/json"}};
  request.body = std::move(body);
  request.timeout = kTokenTimeout;
  return parseTokenResponse(transport_.send(request));
}

TokenResult HttpTokenEndpoint::exchangeCode(const CodeExchange& exchange) {
  std::string body;
  appendParam(body, "grant_type", "authorization_code");
  appendParam(body, "client_id", kNativeClientId);
  appendParam(body, "code", exchange.code);
  appendParam(body, "code_verifier", exchange.codeVerifier);
  appendParam(body, "redirect_uri", exchange.redirectUri);
  if (!exchange.resource.empty()) {
    appendParam(body, "resource", exchange.resource);
  }
  return postToken(std::move(body));
}

TokenResult HttpTokenEndpoint::refresh(std::string_view refreshToken) {
  std::string body;
  appendParam(body, "grant_type", "refresh_token");
  appendParam(body, "client_id", kNativeClientId);
  appendParam(body, "refresh_token", refreshToken);
  return postToken(std::move(body));
}

EndSessionStatus HttpTokenEndpoint::endSession(std::string_view revocationHandle) {
  if (origin_.empty()) {
    return EndSessionStatus::Offline;
  }
  HttpRequest request;
  request.requiredOrigin = origin_;
  request.method = "POST";
  request.url = origin_ + "/oauth/session/end";
  request.headers = {{"Content-Type", "application/x-www-form-urlencoded"}, {"Accept", "application/json"}};
  appendParam(request.body, "handle", revocationHandle);
  request.timeout = kTokenTimeout;
  const HttpResponse response = transport_.send(request);
  if (response.status == 200) {
    return EndSessionStatus::Ended;
  }
  if (response.status == 404) {
    return EndSessionStatus::Unknown;
  }
  // Anything else, including a 400, leaves the handle pending, so the
  // session is never shown as ended without a 200.
  return EndSessionStatus::Offline;
}

} // namespace nodetool::account
