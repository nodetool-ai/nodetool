#include "nodetool/account/cloud_client.h"

#include "nodetool/account/origin.h"

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

CloudSendStatus statusOf(CredentialStatus status) {
  return status == CredentialStatus::SignedOut ? CloudSendStatus::SignedOut : CloudSendStatus::Offline;
}

} // namespace

CloudClient::CloudClient(AccountSession& session, HttpTransport& transport)
    : session_(session), transport_(transport) {}

CloudSendResult CloudClient::send(HttpRequest request) {
  CloudSendResult result;
  const std::string& origin = session_.serverOrigin();
  const std::optional<std::string> target = httpsOriginOfUrl(request.url);
  if (origin.empty() || !target || *target != origin) {
    result.status = CloudSendStatus::WrongServer;
    return result;
  }
  request.requiredOrigin = origin;

  // Sends with one authorization. The cancel flag stays registered with the
  // session until the response is in.
  auto sendWith = [&](const Authorization& authorization) {
    setBearer(request, authorization.accessToken);
    request.cancel = authorization.cancel;
    result.response = transport_.send(request);
    if (authorization.cancel->cancelled()) {
      result.status = CloudSendStatus::Cancelled;
    } else {
      result.status = result.response.status == 0 ? CloudSendStatus::Offline : CloudSendStatus::Sent;
    }
  };

  const Authorization first = session_.authorizeRequest();
  if (first.status != CredentialStatus::Ready) {
    result.status = statusOf(first.status);
    return result;
  }
  sendWith(first);
  if (result.status != CloudSendStatus::Sent || result.response.status != 401) {
    return result;
  }
  // The token was refused. Renew it, never adopting the refused token again,
  // and retry once with the new one.
  switch (session_.refresh(first.accessToken)) {
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
  const Authorization second = session_.authorizeRequest();
  if (second.status != CredentialStatus::Ready) {
    result.status = statusOf(second.status);
    return result;
  }
  if (second.accessToken == first.accessToken) {
    // Report the 401 rather than send the refused token again.
    return result;
  }
  sendWith(second);
  return result;
}

} // namespace nodetool::account
