#include "nodetool/account/cloud_client.h"

#include <algorithm>
#include <cctype>
#include <utility>

namespace nodetool::account {
namespace {

bool equalsIgnoringCase(std::string_view a, std::string_view b) {
  return a.size() == b.size() && std::equal(a.begin(), a.end(), b.begin(), [](char x, char y) {
           return std::tolower(static_cast<unsigned char>(x)) == std::tolower(static_cast<unsigned char>(y));
         });
}

void setBearer(HttpRequest& request, const std::string& token) {
  std::erase_if(request.headers, [](const auto& header) { return equalsIgnoringCase(header.first, "Authorization"); });
  request.headers.emplace_back("Authorization", "Bearer " + token);
}

} // namespace

CloudClient::CloudClient(AccountSession& session, HttpTransport& transport, std::string serverOrigin)
    : session_(session), transport_(transport), origin_(std::move(serverOrigin)) {}

bool CloudClient::onServer(const std::string& url) const {
  // The origin must be followed by the end, a path, a query or a fragment,
  // so https://api.nodetool.ai.example.com never matches
  // https://api.nodetool.ai.
  if (url.size() < origin_.size() || !equalsIgnoringCase(std::string_view(url).substr(0, origin_.size()), origin_)) {
    return false;
  }
  if (url.size() == origin_.size()) {
    return true;
  }
  const char next = url[origin_.size()];
  return next == '/' || next == '?' || next == '#';
}

CloudSendResult CloudClient::send(HttpRequest request) {
  CloudSendResult result;
  if (!onServer(request.url)) {
    result.status = CloudSendStatus::WrongServer;
    return result;
  }
  const Credential first = session_.credentialForRequest();
  if (first.status == CredentialStatus::SignedOut) {
    result.status = CloudSendStatus::SignedOut;
    return result;
  }
  if (first.status == CredentialStatus::Offline) {
    result.status = CloudSendStatus::Offline;
    return result;
  }
  setBearer(request, first.accessToken);
  result.response = transport_.send(request);
  if (result.response.status == 0) {
    result.status = CloudSendStatus::Offline;
    return result;
  }
  if (result.response.status != 401) {
    result.status = CloudSendStatus::Sent;
    return result;
  }
  // The token was refused. Renew once and retry with the new one.
  switch (session_.refresh()) {
  case RefreshOutcome::SignedOut:
    result.status = CloudSendStatus::SignedOut;
    return result;
  case RefreshOutcome::Offline:
    result.status = CloudSendStatus::Offline;
    return result;
  case RefreshOutcome::Adopted:
  case RefreshOutcome::Refreshed:
    break;
  }
  const Credential second = session_.credentialForRequest();
  if (second.status != CredentialStatus::Ready || second.accessToken == first.accessToken) {
    // A refresh that left the same token cannot fix a 401, so report the
    // refusal instead of sending the same request again.
    result.status = second.status == CredentialStatus::SignedOut ? CloudSendStatus::SignedOut
                    : second.status == CredentialStatus::Offline ? CloudSendStatus::Offline
                                                                  : CloudSendStatus::Sent;
    return result;
  }
  setBearer(request, second.accessToken);
  result.response = transport_.send(request);
  result.status = result.response.status == 0 ? CloudSendStatus::Offline : CloudSendStatus::Sent;
  return result;
}

} // namespace nodetool::account
